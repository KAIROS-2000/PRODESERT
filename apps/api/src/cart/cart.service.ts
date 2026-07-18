import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { type CartItemIssue, type CartNotice, type CartView } from '@pro-dessert/contracts';
import { type AuthenticatedPrincipal } from '../auth/auth.types';
import { classifyAvailability } from '../catalog/catalog-domain';
import { CatalogService } from '../catalog/catalog.service';
import { type Environment } from '../common/config/environment';
import { OpaqueTokenService } from '../common/security/opaque-token.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  calculateLineTotals,
  decimalString,
  isValidSalesQuantity,
  money,
  resolveStockQuantity,
  ZERO_MONEY,
} from './cart-domain';
import { type CartAccess, type ValidatedCart, type ValidatedCartLine } from './cart.types';

const cartInclude = {
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      variant: {
        include: {
          product: {
            include: {
              brand: true,
              images: {
                where: { published: true },
                orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
                take: 1,
              },
            },
          },
          prices: { where: { priceType: 'RETAIL' } },
          stockBalances: {
            where: {
              warehouse: { active: true, pickupLocation: { is: { active: true } } },
            },
            include: { warehouse: { include: { pickupLocation: true } } },
          },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

type CartRecord = Prisma.CartGetPayload<{ include: typeof cartInclude }>;
type CartItemRecord = CartRecord['items'][number];
type VariantRecord = CartItemRecord['variant'];

interface QuantityDecision {
  quantity: Prisma.Decimal;
  notice?: CartNotice;
}

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: OpaqueTokenService,
    private readonly config: ConfigService<Environment, true>,
    private readonly catalog: CatalogService,
  ) {}

  async access(
    principal: AuthenticatedPrincipal | undefined,
    rawGuestToken: string | undefined,
  ): Promise<CartAccess> {
    if (principal) {
      const cart = await this.prisma.cart.upsert({
        where: { userId: principal.userId },
        update: {},
        create: { userId: principal.userId },
      });
      return {
        cartId: cart.id,
        scopeHash: this.tokens.hash(`user:${principal.userId}`),
        principal,
      };
    }

    if (rawGuestToken) {
      const tokenHash = this.tokens.hash(rawGuestToken);
      const cart = await this.prisma.cart.findFirst({
        where: { guestTokenHash: tokenHash, expiresAt: { gt: new Date() } },
      });
      if (cart) return { cartId: cart.id, scopeHash: tokenHash };
    }

    const token = this.tokens.generate();
    const cart = await this.prisma.cart.create({
      data: {
        guestTokenHash: token.hash,
        expiresAt: new Date(
          Date.now() + this.config.get('CART_TTL_SECONDS', { infer: true }) * 1_000,
        ),
      },
    });
    return { cartId: cart.id, scopeHash: token.hash, guestTokenRaw: token.raw };
  }

  async validate(cartId: string): Promise<ValidatedCart> {
    const validated = await this.prisma.$transaction((tx) =>
      this.validateInTransaction(tx, cartId),
    );
    const recommendations = await this.catalog.recommendationsForCart(validated.productIds, 4);
    return {
      ...validated,
      view: { ...validated.view, recommendations },
    };
  }

  async validateInTransaction(
    tx: Prisma.TransactionClient,
    cartId: string,
  ): Promise<ValidatedCart> {
    await this.lockCart(tx, cartId);
    const cart = await tx.cart.findUniqueOrThrow({ where: { id: cartId }, include: cartInclude });
    const now = new Date();
    const notices: CartNotice[] = [];
    const renderedItems: CartView['items'][number][] = [];
    const lines: ValidatedCartLine[] = [];
    let subtotal = ZERO_MONEY;
    let discountTotal = ZERO_MONEY;
    let grandTotal = ZERO_MONEY;
    let materiallyChanged = false;

    for (const item of cart.items) {
      const inspected = await this.inspectItem(tx, item, now);
      notices.push(...inspected.notices);
      renderedItems.push(inspected.view);
      if (inspected.line) lines.push(inspected.line);
      subtotal = subtotal.plus(inspected.lineSubtotal);
      discountTotal = discountTotal.plus(inspected.lineDiscount);
      grandTotal = grandTotal.plus(inspected.lineTotal);
      materiallyChanged ||= inspected.materiallyChanged;
    }

    if (materiallyChanged) {
      await tx.cart.update({ where: { id: cart.id }, data: { updatedAt: now } });
    }
    const hasBlockingIssue = renderedItems.some((item) =>
      item.issues.some((issue) => issue.severity === 'BLOCKING'),
    );
    const view: CartView = {
      items: renderedItems,
      recommendations: [],
      totals: {
        products: money(subtotal).toFixed(2),
        discount: money(discountTotal).toFixed(2),
        grandTotal: money(grandTotal).toFixed(2),
        currency: 'RUB',
      },
      notices,
      canCheckout: renderedItems.length > 0 && !hasBlockingIssue,
      itemCount: renderedItems.length,
      updatedAt: (materiallyChanged ? now : cart.updatedAt).toISOString(),
    };
    return {
      view,
      productIds: cart.items.map((item) => item.variant.product.id),
      lines,
      subtotal: money(subtotal),
      discountTotal: money(discountTotal),
      grandTotal: money(grandTotal),
      materiallyChanged,
    };
  }

  async addItem(cartId: string, variantId: string, rawQuantity: string): Promise<CartView> {
    const requestedIncrement = this.parseQuantity(rawQuantity);
    const mutationNotice = await this.prisma.$transaction(async (tx) => {
      await this.lockCart(tx, cartId);
      const existing = await tx.cartItem.findUnique({
        where: { cartId_variantId: { cartId, variantId } },
      });
      const variant = await this.loadVariant(tx, variantId);
      const requested = existing ? existing.quantity.plus(requestedIncrement) : requestedIncrement;
      const decision = this.decideMutationQuantity(variant, requested, existing?.id);
      const price = this.currentPrice(variant, new Date());
      if (!price) throw this.priceUnavailable();
      await tx.cartItem.upsert({
        where: { cartId_variantId: { cartId, variantId } },
        update: {
          quantity: decision.quantity,
        },
        create: {
          cartId,
          variantId,
          quantity: decision.quantity,
          unitPriceSnapshot: price.amount,
          oldPriceSnapshot: price.oldAmount,
          currency: price.currency,
        },
      });
      await this.touch(tx, cartId);
      return decision.notice;
    });
    const result = await this.validate(cartId);
    return mutationNotice
      ? { ...result.view, notices: [mutationNotice, ...result.view.notices] }
      : result.view;
  }

  async updateItem(cartId: string, itemId: string, rawQuantity: string): Promise<CartView> {
    const requested = this.parseQuantity(rawQuantity);
    const mutationNotice = await this.prisma.$transaction(async (tx) => {
      await this.lockCart(tx, cartId);
      const existing = await tx.cartItem.findFirst({ where: { id: itemId, cartId } });
      if (!existing) {
        throw new BadRequestException({
          code: 'CART_ITEM_NOT_FOUND',
          message: 'Позиция не найдена.',
        });
      }
      const variant = await this.loadVariant(tx, existing.variantId);
      const decision = this.decideMutationQuantity(variant, requested, itemId);
      if (!this.currentPrice(variant, new Date())) throw this.priceUnavailable();
      await tx.cartItem.update({
        where: { id: itemId },
        data: {
          quantity: decision.quantity,
        },
      });
      await this.touch(tx, cartId);
      return decision.notice;
    });
    const result = await this.validate(cartId);
    return mutationNotice
      ? { ...result.view, notices: [mutationNotice, ...result.view.notices] }
      : result.view;
  }

  async removeItem(cartId: string, itemId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockCart(tx, cartId);
      await tx.cartItem.deleteMany({ where: { id: itemId, cartId } });
      await this.touch(tx, cartId);
    });
  }

  async clear(cartId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockCart(tx, cartId);
      await tx.cartItem.deleteMany({ where: { cartId } });
      await this.touch(tx, cartId);
    });
  }

  async merge(
    principal: AuthenticatedPrincipal | undefined,
    rawGuestToken: string | undefined,
  ): Promise<CartView> {
    if (!principal) {
      throw new UnauthorizedException({
        code: 'SESSION_REQUIRED',
        message: 'Войдите в аккаунт, чтобы объединить корзины.',
      });
    }
    const userAccess = await this.access(principal, undefined);
    if (!rawGuestToken) return (await this.validate(userAccess.cartId)).view;
    const guestHash = this.tokens.hash(rawGuestToken);

    await this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const guest = await tx.cart.findFirst({
            where: { guestTokenHash: guestHash, expiresAt: { gt: new Date() } },
            include: { items: true },
          });
          if (!guest) return;
          const lockIds = [userAccess.cartId, guest.id].sort();
          await tx.$queryRaw`SELECT id FROM carts WHERE id = ANY(${lockIds}::uuid[]) ORDER BY id FOR UPDATE`;
          for (const guestItem of guest.items) {
            const existing = await tx.cartItem.findUnique({
              where: {
                cartId_variantId: { cartId: userAccess.cartId, variantId: guestItem.variantId },
              },
            });
            await tx.cartItem.upsert({
              where: {
                cartId_variantId: { cartId: userAccess.cartId, variantId: guestItem.variantId },
              },
              update: { quantity: (existing?.quantity ?? ZERO_MONEY).plus(guestItem.quantity) },
              create: {
                cartId: userAccess.cartId,
                variantId: guestItem.variantId,
                quantity: guestItem.quantity,
                unitPriceSnapshot: guestItem.unitPriceSnapshot,
                oldPriceSnapshot: guestItem.oldPriceSnapshot,
                currency: guestItem.currency,
              },
            });
          }
          await tx.cart.delete({ where: { id: guest.id } });
          await this.touch(tx, userAccess.cartId);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
    return (await this.validate(userAccess.cartId)).view;
  }

  private async inspectItem(
    tx: Prisma.TransactionClient,
    item: CartItemRecord,
    now: Date,
  ): Promise<{
    view: CartView['items'][number];
    line: ValidatedCartLine | null;
    notices: CartNotice[];
    lineSubtotal: Prisma.Decimal;
    lineDiscount: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    materiallyChanged: boolean;
  }> {
    const variant = item.variant;
    const product = variant.product;
    const issues: CartItemIssue[] = [];
    const notices: CartNotice[] = [];
    const currentPrice = this.currentPrice(variant, now);
    const available = this.availableStock(variant);
    const availability = classifyAvailability(available.toNumber(), variant.allowBackorder);
    let quantity = item.quantity;
    let materiallyChanged = false;

    if (!product.active || !variant.active) {
      issues.push(this.blocking('PRODUCT_INACTIVE', 'Товар больше недоступен для заказа.'));
    }
    if (!currentPrice) {
      issues.push(this.blocking('PRICE_UNAVAILABLE', 'Для товара временно нет актуальной цены.'));
    }
    if (!isValidSalesQuantity(quantity, variant.minOrderQuantity, variant.salesMultiple)) {
      issues.push(
        this.blocking(
          'QUANTITY_RULE_CHANGED',
          `Количество должно быть не меньше ${decimalString(variant.minOrderQuantity)} и кратно ${decimalString(variant.salesMultiple)}.`,
        ),
      );
    }
    if (!variant.allowBackorder && quantity.greaterThan(available)) {
      const adjusted = resolveStockQuantity(
        quantity,
        available,
        variant.minOrderQuantity,
        variant.salesMultiple,
        variant.allowBackorder,
      );
      if (adjusted) {
        quantity = adjusted;
        await tx.cartItem.update({ where: { id: item.id }, data: { quantity } });
        notices.push({
          code: 'QUANTITY_ADJUSTED',
          itemId: item.id,
          message: `Доступное количество изменилось. Позиция «${product.baseName}» скорректирована до ${decimalString(quantity)}.`,
        });
        materiallyChanged = true;
      } else {
        issues.push(
          this.blocking('INSUFFICIENT_STOCK', 'Доступного количества недостаточно для заказа.'),
        );
      }
    }

    if (
      currentPrice &&
      (!currentPrice.amount.equals(item.unitPriceSnapshot) ||
        !this.sameNullableDecimal(currentPrice.oldAmount, item.oldPriceSnapshot))
    ) {
      notices.push({
        code: 'PRICE_CHANGED',
        itemId: item.id,
        message: `Цена товара «${product.baseName}» изменилась с ${item.unitPriceSnapshot.toFixed(2)} ₽ до ${currentPrice.amount.toFixed(2)} ₽. Корзина обновлена.`,
      });
      await tx.cartItem.update({
        where: { id: item.id },
        data: {
          unitPriceSnapshot: currentPrice.amount,
          oldPriceSnapshot: currentPrice.oldAmount,
          currency: currentPrice.currency,
        },
      });
      materiallyChanged = true;
    }

    const unitPrice = currentPrice?.amount ?? item.unitPriceSnapshot;
    const oldUnitPrice = currentPrice?.oldAmount ?? item.oldPriceSnapshot;
    const { unitDiscount, lineSubtotal, lineDiscount, lineTotal } = calculateLineTotals(
      unitPrice,
      oldUnitPrice,
      quantity,
    );
    const image = product.images[0];
    const active = product.active && variant.active && Boolean(currentPrice);
    const view: CartView['items'][number] = {
      id: item.id,
      productSlug: product.slug,
      productName: product.baseName,
      brand: product.brand?.name ?? null,
      variantId: variant.id,
      sku: variant.sku,
      offerName: variant.offerName,
      packDescription: variant.packDescription,
      unit: variant.unit,
      quantity: decimalString(quantity),
      minOrderQuantity: decimalString(variant.minOrderQuantity),
      salesMultiple: decimalString(variant.salesMultiple),
      unitPrice: unitPrice.toFixed(2),
      oldUnitPrice: oldUnitPrice?.toFixed(2) ?? null,
      lineSubtotal: lineSubtotal.toFixed(2),
      lineDiscount: lineDiscount.toFixed(2),
      lineTotal: lineTotal.toFixed(2),
      currency: 'RUB',
      image: image ? { id: image.id, url: image.publicUrl, alt: image.alt } : null,
      availability,
      active,
      issues,
    };
    const line: ValidatedCartLine | null = currentPrice
      ? {
          itemId: item.id,
          productId: product.id,
          variantId: variant.id,
          oneCProductId: product.oneCId,
          oneCVariantId: variant.oneCId,
          sku: variant.sku,
          productName: product.baseName,
          brandName: product.brand?.name ?? null,
          offerName: variant.offerName,
          packDescription: variant.packDescription,
          unit: variant.unit,
          vatRate: variant.vatRate,
          quantity,
          unitPrice,
          oldUnitPrice,
          unitDiscount,
          lineSubtotal,
          lineDiscount,
          lineTotal,
          imageUrl: image?.publicUrl ?? null,
          imageAlt: image?.alt ?? null,
        }
      : null;
    return {
      view,
      line,
      notices,
      lineSubtotal,
      lineDiscount,
      lineTotal,
      materiallyChanged,
    };
  }

  private async loadVariant(
    tx: Prisma.TransactionClient,
    variantId: string,
  ): Promise<VariantRecord> {
    const variant = await tx.productVariant.findUnique({
      where: { id: variantId },
      include: {
        product: {
          include: {
            brand: true,
            images: {
              where: { published: true },
              orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
              take: 1,
            },
          },
        },
        prices: { where: { priceType: 'RETAIL' } },
        stockBalances: {
          where: { warehouse: { active: true, pickupLocation: { is: { active: true } } } },
          include: { warehouse: { include: { pickupLocation: true } } },
        },
      },
    });
    if (!variant || !variant.active || !variant.product.active) {
      throw new ConflictException({
        code: 'PRODUCT_UNAVAILABLE',
        message: 'Товар больше недоступен для заказа.',
      });
    }
    return variant;
  }

  private decideMutationQuantity(
    variant: VariantRecord,
    requested: Prisma.Decimal,
    itemId?: string,
  ): QuantityDecision {
    if (!isValidSalesQuantity(requested, variant.minOrderQuantity, variant.salesMultiple)) {
      throw new BadRequestException({
        code: 'QUANTITY_INVALID',
        message: `Количество должно быть не меньше ${decimalString(variant.minOrderQuantity)} и кратно ${decimalString(variant.salesMultiple)}.`,
      });
    }
    const adjusted = resolveStockQuantity(
      requested,
      this.availableStock(variant),
      variant.minOrderQuantity,
      variant.salesMultiple,
      variant.allowBackorder,
    );
    if (!adjusted) {
      throw new ConflictException({
        code: 'INSUFFICIENT_STOCK',
        message: 'Доступного количества недостаточно для заказа.',
      });
    }
    if (adjusted.lessThan(requested)) {
      return {
        quantity: adjusted,
        notice: {
          code: 'QUANTITY_ADJUSTED',
          ...(itemId ? { itemId } : {}),
          message: `Количество скорректировано до ${decimalString(adjusted)} с учётом актуального остатка.`,
        },
      };
    }
    return { quantity: requested };
  }

  private currentPrice(variant: VariantRecord, now: Date): VariantRecord['prices'][number] | null {
    return (
      variant.prices
        .filter(
          (price) =>
            (price.validFrom === null || price.validFrom <= now) &&
            (price.validTo === null || price.validTo > now) &&
            price.currency === 'RUB',
        )
        .sort((left, right) => left.amount.comparedTo(right.amount))[0] ?? null
    );
  }

  private availableStock(variant: VariantRecord): Prisma.Decimal {
    const pickupCode = this.config.get('PICKUP_LOCATION_CODE', { infer: true });
    return variant.stockBalances.reduce(
      (total, balance) =>
        balance.warehouse.pickupLocation?.code === pickupCode
          ? total.plus(balance.available)
          : total,
      ZERO_MONEY,
    );
  }

  private parseQuantity(raw: string): Prisma.Decimal {
    let quantity: Prisma.Decimal;
    try {
      quantity = new Prisma.Decimal(raw);
    } catch {
      throw new BadRequestException({
        code: 'QUANTITY_INVALID',
        message: 'Количество должно быть больше нуля.',
      });
    }
    if (!quantity.isFinite() || quantity.lessThanOrEqualTo(0)) {
      throw new BadRequestException({
        code: 'QUANTITY_INVALID',
        message: 'Количество должно быть больше нуля.',
      });
    }
    return quantity;
  }

  private sameNullableDecimal(left: Prisma.Decimal | null, right: Prisma.Decimal | null): boolean {
    return left === null ? right === null : right !== null && left.equals(right);
  }

  private blocking(code: string, message: string): CartItemIssue {
    return { code, message, severity: 'BLOCKING' };
  }

  private priceUnavailable(): ConflictException {
    return new ConflictException({
      code: 'PRICE_UNAVAILABLE',
      message: 'Для товара временно нет актуальной цены.',
    });
  }

  private async touch(tx: Prisma.TransactionClient, cartId: string): Promise<void> {
    await tx.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
  }

  private async lockCart(tx: Prisma.TransactionClient, cartId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM carts WHERE id = ${cartId}::uuid FOR UPDATE`;
  }

  private async withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await operation();
      } catch (error: unknown) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2034' ||
          attempt === 3
        ) {
          throw error;
        }
      }
    }
    throw new Error('unreachable');
  }
}
