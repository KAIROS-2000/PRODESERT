import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type OrderStatus, type PickupLocation } from '@prisma/client';
import {
  type OrderCreatedView,
  type PublicOrderView,
  type PickupLocationView,
} from '@pro-dessert/contracts';
import { type AuthenticatedPrincipal } from '../auth/auth.types';
import { checkoutRequestHash } from '../cart/cart-domain';
import { CartService } from '../cart/cart.service';
import { type CartAccess, type ValidatedCart } from '../cart/cart.types';
import { type Environment } from '../common/config/environment';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutService } from './checkout.service';
import { type CheckoutDto } from './dto/checkout.dto';
import { OrderAccessTokenService } from './order-access-token.service';

const orderPublicInclude = {
  items: { orderBy: { createdAt: 'asc' } },
  statusHistory: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;

type PublicOrderRecord = Prisma.OrderGetPayload<{ include: typeof orderPublicInclude }>;

type CreationTransactionResult =
  | { kind: 'created'; order: PublicOrderRecord; accessToken?: string }
  | { kind: 'existing'; order: PublicOrderRecord; accessToken?: string }
  | { kind: 'cart-invalid'; cart: ValidatedCart };

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly checkout: CheckoutService,
    private readonly accessTokens: OrderAccessTokenService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  async create(
    dto: CheckoutDto,
    access: CartAccess,
    idempotencyKey: string,
    correlationId?: string,
  ): Promise<OrderCreatedView> {
    const requestHash = checkoutRequestHash(dto);
    const replay = await this.prisma.order.findUnique({
      where: {
        idempotencyScopeHash_idempotencyKey: {
          idempotencyScopeHash: access.scopeHash,
          idempotencyKey,
        },
      },
      include: orderPublicInclude,
    });
    if (replay) {
      this.assertSameIdempotentRequest(replay, requestHash);
      return this.toCreatedView(
        replay,
        replay.customerId === null ? this.accessTokens.derive(replay.id) : undefined,
      );
    }

    const pickup = await this.checkout.location();
    const fieldErrors = this.checkout.fieldErrors(dto, pickup);
    if (fieldErrors.length > 0) {
      throw new UnprocessableEntityException({
        code: 'CHECKOUT_INVALID',
        message: 'Проверьте данные оформления заказа.',
        details: { fieldErrors },
      });
    }
    const result = await this.withSerializableRetry(() =>
      this.prisma.$transaction(
        (tx) =>
          this.createInTransaction(
            tx,
            dto,
            access,
            pickup,
            idempotencyKey,
            requestHash,
            correlationId,
          ),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );

    if (result.kind === 'cart-invalid') {
      const cartChanged =
        result.cart.materiallyChanged || dto.cartUpdatedAt !== result.cart.view.updatedAt;
      const code = cartChanged ? 'CART_CHANGED_REVIEW_REQUIRED' : 'CART_INVALID';
      throw new ConflictException({
        code,
        message: cartChanged
          ? 'Корзина обновилась. Проверьте цену и количество перед повторной отправкой.'
          : 'Корзина не готова к оформлению.',
        details: { cart: result.cart.view },
      });
    }
    return this.toCreatedView(result.order, result.accessToken);
  }

  async publicOrder(
    publicNumber: string,
    rawAccessToken: string | undefined,
    principal: AuthenticatedPrincipal | undefined,
  ): Promise<PublicOrderView> {
    if (!/^PD-\d{8}-[A-F0-9]{8}$/.test(publicNumber)) throw this.notFound();
    const order = await this.prisma.order.findUnique({
      where: { publicNumber },
      include: orderPublicInclude,
    });
    if (!order) throw this.notFound();
    const ownerSession = Boolean(principal && order.customerId === principal.userId);
    const guestTokenValid = this.guestTokenValid(order, rawAccessToken);
    if (!ownerSession && !guestTokenValid) throw this.notFound();
    return this.toPublicView(order);
  }

  private async createInTransaction(
    tx: Prisma.TransactionClient,
    dto: CheckoutDto,
    access: CartAccess,
    pickup: PickupLocation,
    idempotencyKey: string,
    requestHash: string,
    correlationId?: string,
  ): Promise<CreationTransactionResult> {
    await tx.$queryRaw`SELECT id FROM carts WHERE id = ${access.cartId}::uuid FOR UPDATE`;
    const existing = await tx.order.findUnique({
      where: {
        idempotencyScopeHash_idempotencyKey: {
          idempotencyScopeHash: access.scopeHash,
          idempotencyKey,
        },
      },
      include: orderPublicInclude,
    });
    if (existing) {
      this.assertSameIdempotentRequest(existing, requestHash);
      return {
        kind: 'existing',
        order: existing,
        ...(existing.customerId === null
          ? { accessToken: this.accessTokens.derive(existing.id) }
          : {}),
      };
    }

    const validated = await this.cart.validateInTransaction(tx, access.cartId);
    if (
      !validated.view.canCheckout ||
      validated.materiallyChanged ||
      dto.cartUpdatedAt !== validated.view.updatedAt
    ) {
      return { kind: 'cart-invalid', cart: validated };
    }

    const id = randomUUID();
    const publicNumber = this.publicNumber();
    const guestAccessToken = access.principal ? undefined : this.accessTokens.derive(id);
    const now = new Date();
    const accessExpiresAt = guestAccessToken
      ? new Date(
          now.getTime() +
            this.config.get('ORDER_PUBLIC_TOKEN_TTL_DAYS', { infer: true }) * 86_400_000,
        )
      : undefined;
    const order = await tx.order.create({
      data: {
        id,
        publicNumber,
        ...(access.principal ? { customerId: access.principal.userId } : {}),
        guestEmail: dto.email.trim().normalize('NFKC').toLowerCase(),
        guestPhone: dto.phone.trim(),
        guestName: dto.firstName.trim(),
        ...(dto.lastName?.trim() ? { guestSurname: dto.lastName.trim() } : {}),
        ...(dto.organization
          ? {
              organizationData: {
                name: dto.organization.name.trim(),
                inn: dto.organization.inn.trim(),
                ...(dto.organization.kpp?.trim() ? { kpp: dto.organization.kpp.trim() } : {}),
              },
            }
          : {}),
        pickupLocationId: pickup.id,
        pickupLocationCode: pickup.code,
        pickupLocationName: pickup.name,
        pickupLocationAddress: pickup.addressText,
        pickupLocationTimezone: pickup.timezone,
        pickupLocationPhone: pickup.phone,
        pickupLocationOpeningHours: pickup.openingHours ?? Prisma.JsonNull,
        fulfillmentMethod: 'PICKUP',
        paymentMethod: 'BANK_TRANSFER',
        subtotal: validated.subtotal,
        discountTotal: validated.discountTotal,
        grandTotal: validated.grandTotal,
        currency: 'RUB',
        status: 'AWAITING_STOCK_CONFIRMATION',
        ...(dto.comment?.trim() ? { customerComment: dto.comment.trim() } : {}),
        ...(dto.desiredPickupAt
          ? { desiredPickupAt: new Date(`${dto.desiredPickupAt}T00:00:00.000Z`) }
          : {}),
        privacyConsentAt: now,
        orderTermsConsentAt: now,
        ...(guestAccessToken
          ? {
              publicAccessTokenHash: this.accessTokens.hash(guestAccessToken),
              publicAccessTokenExpiresAt: accessExpiresAt,
            }
          : {}),
        idempotencyScopeHash: access.scopeHash,
        idempotencyKey,
        idempotencyRequestHash: requestHash,
        source: 'STOREFRONT',
        items: {
          create: validated.lines.map((line) => ({
            productId: line.productId,
            variantId: line.variantId,
            oneCProductId: line.oneCProductId,
            oneCVariantId: line.oneCVariantId,
            sku: line.sku,
            productName: line.productName,
            brandName: line.brandName,
            offerName: line.offerName,
            packDescription: line.packDescription,
            unit: line.unit,
            unitPrice: line.unitPrice,
            oldUnitPrice: line.oldUnitPrice,
            unitDiscount: line.unitDiscount,
            vatRate: line.vatRate,
            quantity: line.quantity,
            lineSubtotal: line.lineSubtotal,
            lineDiscount: line.lineDiscount,
            lineTotal: line.lineTotal,
            imageUrl: line.imageUrl,
            imageAlt: line.imageAlt,
          })),
        },
        statusHistory: {
          create: {
            toStatus: 'AWAITING_STOCK_CONFIRMATION',
            source: 'STOREFRONT',
            ...(access.principal ? { actorUserId: access.principal.userId } : {}),
            ...(correlationId ? { correlationId } : {}),
          },
        },
      },
      include: orderPublicInclude,
    });
    await tx.auditLog.create({
      data: {
        action: 'ORDER_CREATED',
        entityType: 'Order',
        entityId: order.id,
        source: 'STOREFRONT',
        ...(access.principal
          ? { actorUserId: access.principal.userId, actorRole: access.principal.role }
          : {}),
        ...(correlationId ? { correlationId } : {}),
        metadata: {
          publicNumber: order.publicNumber,
          status: order.status,
          fulfillmentMethod: 'PICKUP',
          paymentMethod: 'BANK_TRANSFER',
          grandTotal: order.grandTotal.toFixed(2),
          currency: order.currency,
        },
      },
    });
    await tx.cartItem.deleteMany({ where: { cartId: access.cartId } });
    await tx.cart.update({ where: { id: access.cartId }, data: { updatedAt: now } });
    return {
      kind: 'created',
      order,
      ...(guestAccessToken ? { accessToken: guestAccessToken } : {}),
    };
  }

  private toCreatedView(order: PublicOrderRecord, accessToken?: string): OrderCreatedView {
    return {
      publicNumber: order.publicNumber,
      status: 'AWAITING_STOCK_CONFIRMATION',
      ...(accessToken ? { accessToken } : {}),
      createdAt: order.createdAt.toISOString(),
      grandTotal: order.grandTotal.toFixed(2),
      currency: 'RUB',
      pickup: this.pickupFromOrder(order),
      message:
        'Заказ принят. Магазин сначала проверит наличие и резерв. Реквизиты будут доступны только после подтверждения.',
    };
  }

  private assertSameIdempotentRequest(order: PublicOrderRecord, requestHash: string): void {
    if (order.idempotencyRequestHash !== requestHash) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Этот Idempotency-Key уже использован для другого запроса.',
      });
    }
  }

  private toPublicView(order: PublicOrderRecord): PublicOrderView {
    return {
      publicNumber: order.publicNumber,
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      customer: {
        firstName: order.guestName,
        lastName: order.guestSurname,
        email: order.guestEmail,
        phone: order.guestPhone,
      },
      desiredPickupAt: order.desiredPickupAt?.toISOString().slice(0, 10) ?? null,
      fulfillmentMethod: 'PICKUP',
      paymentMethod: 'BANK_TRANSFER',
      pickup: this.pickupFromOrder(order),
      items: order.items.map((item) => ({
        sku: item.sku,
        productName: item.productName,
        brand: item.brandName,
        offerName: item.offerName,
        packDescription: item.packDescription,
        unit: item.unit,
        quantity: item.quantity.toFixed().replace(/(?:\.0+|(?:(\.\d*?)0+))$/, '$1'),
        unitPrice: item.unitPrice.toFixed(2),
        oldUnitPrice: item.oldUnitPrice?.toFixed(2) ?? null,
        lineSubtotal: item.lineSubtotal.toFixed(2),
        lineDiscount: item.lineDiscount.toFixed(2),
        lineTotal: item.lineTotal.toFixed(2),
        imageUrl: item.imageUrl,
        imageAlt: item.imageAlt,
      })),
      totals: {
        products: order.subtotal.toFixed(2),
        discount: order.discountTotal.toFixed(2),
        grandTotal: order.grandTotal.toFixed(2),
        currency: 'RUB',
      },
      history: order.statusHistory.map((history) => ({
        status: history.toStatus,
        createdAt: history.createdAt.toISOString(),
      })),
      message: this.statusMessage(order.status),
    };
  }

  private pickupFromOrder(order: PublicOrderRecord): PickupLocationView {
    return {
      code: order.pickupLocationCode,
      name: order.pickupLocationName,
      addressText: order.pickupLocationAddress,
      timezone: order.pickupLocationTimezone,
      phone: order.pickupLocationPhone,
      openingHours: order.pickupLocationOpeningHours,
    };
  }

  private guestTokenValid(order: PublicOrderRecord, raw: string | undefined): boolean {
    if (
      !raw ||
      !order.publicAccessTokenHash ||
      !order.publicAccessTokenExpiresAt ||
      order.publicAccessTokenExpiresAt <= new Date()
    ) {
      return false;
    }
    const actual = Buffer.from(this.accessTokens.hash(raw), 'utf8');
    const expected = Buffer.from(order.publicAccessTokenHash, 'utf8');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private publicNumber(): string {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `PD-${date}-${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private statusMessage(status: OrderStatus): string {
    if (status === 'AWAITING_STOCK_CONFIRMATION') {
      return 'Магазин проверяет наличие. Не переводите деньги до получения подтверждения и реквизитов.';
    }
    if (status === 'READY_FOR_PICKUP') {
      return 'Заказ готов. Заберите его в магазине по адресу: Оренбург, Липовая улица, 20.';
    }
    return 'Статус заказа обновляется после действий магазина и синхронизации с 1С.';
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'ORDER_NOT_FOUND_OR_ACCESS_DENIED',
      message: 'Заказ не найден или ссылка доступа недействительна.',
    });
  }

  private async withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await operation();
      } catch (error: unknown) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !['P2002', 'P2034'].includes(error.code) ||
          attempt === 3
        ) {
          throw error;
        }
      }
    }
    throw new Error('unreachable');
  }
}
