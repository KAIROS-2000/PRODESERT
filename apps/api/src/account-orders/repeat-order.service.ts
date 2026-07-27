import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  type RepeatOrderAlternative,
  type RepeatOrderItem,
  type RepeatOrderPreview,
  type RepeatOrderResult,
} from '@pro-dessert/contracts';
import { type AuthenticatedPrincipal } from '../auth/auth.types';
import { decimalString, money } from '../cart/cart-domain';
import { CartService } from '../cart/cart.service';
import { classifyAvailability } from '../catalog/catalog-domain';
import { type Environment } from '../common/config/environment';
import { PrismaService } from '../prisma/prisma.service';
import { AccountOrdersService } from './account-orders.service';
import { evaluateRepeatOrderCandidate, type RepeatOrderEvaluation } from './repeat-order-domain';

const publicNumberPattern = /^PD-\d{8}-[A-F0-9]{8}$/;
const IDEMPOTENCY_OPERATION = 'REPEAT_ORDER';
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;
const IDEMPOTENCY_LOCK_MS = 30 * 1_000;
const ZERO = new Prisma.Decimal(0);

const repeatVariantInclude = {
  product: {
    include: {
      images: {
        where: { published: true },
        orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
        take: 1,
      },
    },
  },
  prices: { where: { priceType: 'RETAIL' as const, currency: 'RUB' } },
  stockBalances: {
    where: {
      warehouse: { active: true, pickupLocation: { is: { active: true } } },
    },
    include: { warehouse: { include: { pickupLocation: true } } },
  },
} satisfies Prisma.ProductVariantInclude;

const repeatOrderInclude = {
  _count: { select: { items: true } },
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      product: { select: { id: true, slug: true, active: true } },
      variant: { include: repeatVariantInclude },
    },
  },
} satisfies Prisma.OrderInclude;

type RepeatOrderRecord = Prisma.OrderGetPayload<{ include: typeof repeatOrderInclude }>;
type RepeatVariantRecord = NonNullable<RepeatOrderRecord['items'][number]['variant']>;
type RepeatPriceRecord = RepeatVariantRecord['prices'][number];

const relatedProductInclude = {
  targetProduct: {
    include: {
      images: {
        where: { published: true },
        orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
        take: 1,
      },
      variants: {
        include: {
          prices: { where: { priceType: 'RETAIL' as const, currency: 'RUB' } },
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
} satisfies Prisma.RelatedProductInclude;

type RelatedProductRecord = Prisma.RelatedProductGetPayload<{
  include: typeof relatedProductInclude;
}>;
type AlternativeVariantRecord = RelatedProductRecord['targetProduct']['variants'][number];

type RepeatDatabase = Pick<Prisma.TransactionClient, 'order' | 'relatedProduct'>;

interface InspectedRepeatLine {
  view: RepeatOrderItem;
  currentPrice: RepeatPriceRecord | null;
  currentOldPrice: Prisma.Decimal | null;
  finalCartQuantity: Prisma.Decimal | null;
}

interface StoredRepeatResult {
  preview: RepeatOrderPreview;
  addedItemCount: number;
  skippedItemCount: number;
}

@Injectable()
export class RepeatOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly config: ConfigService<Environment, true>,
    private readonly orders: AccountOrdersService,
  ) {}

  async preview(
    principal: AuthenticatedPrincipal,
    rawPublicNumber: string,
  ): Promise<RepeatOrderPreview> {
    const publicNumber = this.publicNumber(rawPublicNumber);
    const [order, existingCart] = await Promise.all([
      this.findOwnedOrder(this.prisma, principal.userId, publicNumber),
      this.prisma.cart.findUnique({
        where: { userId: principal.userId },
        select: { items: { select: { variantId: true, quantity: true } } },
      }),
    ]);
    const existing = new Map(
      existingCart?.items.map((item) => [item.variantId, item.quantity]) ?? [],
    );
    return (await this.inspect(this.prisma, order, existing, new Date())).preview;
  }

  async execute(
    principal: AuthenticatedPrincipal,
    rawPublicNumber: string,
    idempotencyKey: string,
    correlationId?: string,
  ): Promise<RepeatOrderResult> {
    this.assertIdempotencyKey(idempotencyKey);
    const publicNumber = this.publicNumber(rawPublicNumber);
    const cartAccess = await this.cart.access(principal, undefined);
    const scopeHash = createHash('sha256')
      .update(`repeat-order:${principal.userId}`, 'utf8')
      .digest('hex');

    const result = await this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const order = await this.findOwnedOrder(tx, principal.userId, publicNumber);
          const requestHash = createHash('sha256')
            .update(`repeat-order:v1:${order.id}`, 'utf8')
            .digest('hex');
          const now = new Date();
          const existingRecord = await tx.idempotencyRecord.findUnique({
            where: {
              scopeHash_operation_key: {
                scopeHash,
                operation: IDEMPOTENCY_OPERATION,
                key: idempotencyKey,
              },
            },
          });

          if (existingRecord) {
            if (existingRecord.requestHash !== requestHash) {
              throw new ConflictException({
                code: 'IDEMPOTENCY_KEY_REUSED',
                message: 'Этот Idempotency-Key уже использован для другого повтора заказа.',
              });
            }
            if (
              existingRecord.status === 'COMPLETED' &&
              existingRecord.responseBody &&
              existingRecord.resourceId
            ) {
              if (existingRecord.resourceId !== cartAccess.cartId) {
                throw new ConflictException({
                  code: 'IDEMPOTENCY_RESOURCE_CHANGED',
                  message: 'Корзина изменилась. Повторите действие с новым Idempotency-Key.',
                });
              }
              const stored = existingRecord.responseBody as unknown as StoredRepeatResult;
              return {
                ...stored,
                cartId: existingRecord.resourceId,
                replayed: true,
              };
            }
            throw new ConflictException({
              code: 'IDEMPOTENCY_IN_PROGRESS',
              message: 'Повтор заказа уже выполняется. Повторите запрос немного позже.',
            });
          }

          await tx.idempotencyRecord.create({
            data: {
              scopeHash,
              operation: IDEMPOTENCY_OPERATION,
              key: idempotencyKey,
              requestHash,
              lockedUntil: new Date(now.getTime() + IDEMPOTENCY_LOCK_MS),
              expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
            },
          });

          await tx.$queryRaw`SELECT id FROM carts WHERE id = ${cartAccess.cartId}::uuid FOR UPDATE`;
          const targetCart = await tx.cart.findFirst({
            where: { id: cartAccess.cartId, userId: principal.userId },
            select: {
              id: true,
              items: { select: { variantId: true, quantity: true } },
            },
          });
          if (!targetCart) {
            throw new ConflictException({
              code: 'CART_CHANGED',
              message: 'Корзина изменилась. Обновите страницу и повторите действие.',
            });
          }

          const existingQuantities = new Map(
            targetCart.items.map((item) => [item.variantId, item.quantity]),
          );
          const inspection = await this.inspect(tx, order, existingQuantities, now);
          for (const line of inspection.lines) {
            if (
              !line.view.variantId ||
              !line.currentPrice ||
              !line.finalCartQuantity ||
              line.view.quantityToAdd === null
            ) {
              continue;
            }
            await tx.cartItem.upsert({
              where: {
                cartId_variantId: {
                  cartId: targetCart.id,
                  variantId: line.view.variantId,
                },
              },
              update: {
                quantity: line.finalCartQuantity,
                unitPriceSnapshot: line.currentPrice.amount,
                oldPriceSnapshot: line.currentOldPrice,
                currency: 'RUB',
              },
              create: {
                cartId: targetCart.id,
                variantId: line.view.variantId,
                quantity: line.finalCartQuantity,
                unitPriceSnapshot: line.currentPrice.amount,
                oldPriceSnapshot: line.currentOldPrice,
                currency: 'RUB',
              },
            });
          }
          if (inspection.addedItemCount > 0) {
            await tx.cart.update({ where: { id: targetCart.id }, data: { updatedAt: now } });
          }

          await tx.auditLog.create({
            data: {
              action: 'REPEAT_ORDER_ADDED_TO_CART',
              entityType: 'Order',
              entityId: order.id,
              source: 'STOREFRONT',
              actorUserId: principal.userId,
              actorRole: principal.role,
              ...(correlationId ? { correlationId } : {}),
              metadata: {
                publicNumber: order.publicNumber,
                cartId: targetCart.id,
                addedItemCount: inspection.addedItemCount,
                skippedItemCount: inspection.skippedItemCount,
                changedItemCount: inspection.preview.items.filter((item) => item.state !== 'READY')
                  .length,
              },
            },
          });

          const stored: StoredRepeatResult = {
            preview: inspection.preview,
            addedItemCount: inspection.addedItemCount,
            skippedItemCount: inspection.skippedItemCount,
          };
          await tx.idempotencyRecord.update({
            where: {
              scopeHash_operation_key: {
                scopeHash,
                operation: IDEMPOTENCY_OPERATION,
                key: idempotencyKey,
              },
            },
            data: {
              status: 'COMPLETED',
              responseStatus: 200,
              responseBody: stored as unknown as Prisma.InputJsonValue,
              resourceType: 'Cart',
              resourceId: targetCart.id,
              lockedUntil: null,
              completedAt: now,
            },
          });
          return {
            ...stored,
            cartId: targetCart.id,
            replayed: false,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );

    const cart = (await this.cart.validate(result.cartId)).view;
    return {
      preview: result.preview,
      cart,
      replayed: result.replayed,
      addedItemCount: result.addedItemCount,
      skippedItemCount: result.skippedItemCount,
    };
  }

  private async inspect(
    db: RepeatDatabase,
    order: RepeatOrderRecord,
    existingQuantities: ReadonlyMap<string, Prisma.Decimal>,
    now: Date,
  ): Promise<{
    preview: RepeatOrderPreview;
    lines: readonly InspectedRepeatLine[];
    addedItemCount: number;
    skippedItemCount: number;
  }> {
    const pickupCode = this.config.get('PICKUP_LOCATION_CODE', { infer: true });
    const runningQuantities = new Map(existingQuantities);
    const inspected: InspectedRepeatLine[] = [];
    const unavailableProductIds = new Set<string>();

    for (const item of order.items) {
      const variant = item.variant;
      const currentPrice = variant ? this.currentPrice(variant.prices, now) : null;
      const available = variant ? this.availableStock(variant, pickupCode) : ZERO;
      const existing = item.variantId ? (runningQuantities.get(item.variantId) ?? ZERO) : ZERO;
      const evaluation = evaluateRepeatOrderCandidate({
        productActive: Boolean(variant?.product.active),
        variantActive: Boolean(variant?.active),
        sourceQuantity: item.quantity,
        sourceUnitPrice: item.unitPrice,
        currentUnitPrice: currentPrice?.amount ?? null,
        minOrderQuantity: variant?.minOrderQuantity ?? new Prisma.Decimal(1),
        salesMultiple: variant?.salesMultiple ?? new Prisma.Decimal(1),
        available,
        allowBackorder: variant?.allowBackorder ?? false,
        existingCartQuantity: existing,
      });
      const finalCartQuantity =
        evaluation.quantityToAdd && item.variantId ? existing.plus(evaluation.quantityToAdd) : null;
      if (finalCartQuantity && item.variantId) {
        runningQuantities.set(item.variantId, finalCartQuantity);
      } else if (item.productId) {
        unavailableProductIds.add(item.productId);
      }

      inspected.push({
        view: this.repeatItemView(item, evaluation, currentPrice),
        currentPrice,
        currentOldPrice: currentPrice?.oldAmount ?? null,
        finalCartQuantity,
      });
    }

    const alternatives = await this.alternatives(db, [...unavailableProductIds], pickupCode, now);
    const lines = inspected.map((line) =>
      line.view.quantityToAdd === null && line.view.productId
        ? {
            ...line,
            view: {
              ...line.view,
              alternatives: alternatives.get(line.view.productId) ?? [],
            },
          }
        : line,
    );
    const estimatedTotal = lines.reduce(
      (total, line) =>
        line.view.currentLineTotal
          ? total.plus(new Prisma.Decimal(line.view.currentLineTotal))
          : total,
      ZERO,
    );
    const preview: RepeatOrderPreview = {
      sourceOrder: this.orders.toSummary(order),
      evaluatedAt: now.toISOString(),
      items: lines.map((line) => line.view),
      estimatedTotal: money(estimatedTotal).toFixed(2),
      currency: 'RUB',
      canExecute: lines.some((line) => line.view.quantityToAdd !== null),
      hasChanges: lines.some((line) => line.view.state !== 'READY'),
    };
    const addedItemCount = lines.filter((line) => line.view.quantityToAdd !== null).length;
    return {
      preview,
      lines,
      addedItemCount,
      skippedItemCount: lines.length - addedItemCount,
    };
  }

  private repeatItemView(
    item: RepeatOrderRecord['items'][number],
    evaluation: RepeatOrderEvaluation,
    currentPrice: RepeatPriceRecord | null,
  ): RepeatOrderItem {
    return {
      orderItemId: item.id,
      productId: item.productId,
      variantId: item.variantId,
      productSlug: item.variant?.product.slug ?? item.product?.slug ?? null,
      productName: item.productName,
      sku: item.sku,
      offerName: item.offerName,
      packDescription: item.packDescription,
      unit: item.unit,
      requestedQuantity: decimalString(item.quantity),
      quantityToAdd: evaluation.quantityToAdd ? decimalString(evaluation.quantityToAdd) : null,
      sourceUnitPrice: item.unitPrice.toFixed(2),
      currentUnitPrice: currentPrice?.amount.toFixed(2) ?? null,
      currentLineTotal: evaluation.currentLineTotal?.toFixed(2) ?? null,
      availability: evaluation.availability,
      state: evaluation.state,
      priceChanged: evaluation.priceChanged,
      quantityChanged: evaluation.quantityChanged,
      reasonCodes: evaluation.reasonCodes,
      alternatives: [],
    };
  }

  private async alternatives(
    db: RepeatDatabase,
    sourceProductIds: readonly string[],
    pickupCode: string,
    now: Date,
  ): Promise<ReadonlyMap<string, readonly RepeatOrderAlternative[]>> {
    if (sourceProductIds.length === 0) return new Map();
    const relations = await db.relatedProduct.findMany({
      where: {
        sourceProductId: { in: [...sourceProductIds] },
        relationType: { in: ['ALTERNATIVE', 'RELATED'] },
        targetProduct: { active: true },
      },
      orderBy: [{ sortOrder: 'asc' }, { targetProductId: 'asc' }],
      include: relatedProductInclude,
    });
    const relationPriority = { ALTERNATIVE: 0, RELATED: 1 } as const;
    relations.sort(
      (left, right) =>
        relationPriority[left.relationType as keyof typeof relationPriority] -
          relationPriority[right.relationType as keyof typeof relationPriority] ||
        left.sortOrder - right.sortOrder,
    );

    const grouped = new Map<string, RepeatOrderAlternative[]>();
    const selectedBySource = new Map<string, Set<string>>();
    for (const relation of relations) {
      const current = grouped.get(relation.sourceProductId) ?? [];
      if (current.length >= 3) continue;
      const selected = selectedBySource.get(relation.sourceProductId) ?? new Set<string>();
      if (selected.has(relation.targetProductId)) continue;
      const alternative = this.toAlternative(relation.targetProduct, pickupCode, now);
      if (!alternative) continue;
      selected.add(relation.targetProductId);
      selectedBySource.set(relation.sourceProductId, selected);
      current.push(alternative);
      grouped.set(relation.sourceProductId, current);
    }
    return grouped;
  }

  private toAlternative(
    product: RelatedProductRecord['targetProduct'],
    pickupCode: string,
    now: Date,
  ): RepeatOrderAlternative | null {
    const candidates = product.variants
      .filter((variant) => variant.active)
      .flatMap((variant) => {
        const price = this.currentPrice(variant.prices, now);
        if (!price) return [];
        const available = this.availableStock(variant, pickupCode);
        const minimumValidQuantity = variant.minOrderQuantity
          .dividedBy(variant.salesMultiple)
          .ceil()
          .times(variant.salesMultiple);
        if (!variant.allowBackorder && available.lessThan(minimumValidQuantity)) return [];
        return [{ variant, price, available }];
      })
      .sort((left, right) => left.price.amount.comparedTo(right.price.amount));
    const selected = candidates[0];
    if (!selected) return null;
    const image = product.images[0];
    return {
      productId: product.id,
      variantId: selected.variant.id,
      productSlug: product.slug,
      productName: product.baseName,
      sku: selected.variant.sku,
      offerName: selected.variant.offerName,
      packDescription: selected.variant.packDescription,
      unitPrice: selected.price.amount.toFixed(2),
      currency: 'RUB',
      availability: classifyAvailability(
        selected.available.toNumber(),
        selected.variant.allowBackorder,
      ),
      imageUrl: image?.publicUrl ?? null,
      imageAlt: image?.alt ?? null,
    };
  }

  private currentPrice(prices: readonly RepeatPriceRecord[], now: Date): RepeatPriceRecord | null {
    return (
      prices
        .filter(
          (price) =>
            price.currency === 'RUB' &&
            (price.validFrom === null || price.validFrom <= now) &&
            (price.validTo === null || price.validTo > now),
        )
        .sort((left, right) => left.amount.comparedTo(right.amount))[0] ?? null
    );
  }

  private availableStock(
    variant: RepeatVariantRecord | AlternativeVariantRecord,
    pickupCode: string,
  ): Prisma.Decimal {
    return variant.stockBalances.reduce(
      (total, balance) =>
        balance.warehouse.pickupLocation?.code === pickupCode
          ? total.plus(balance.available)
          : total,
      ZERO,
    );
  }

  private async findOwnedOrder(
    db: RepeatDatabase,
    userId: string,
    publicNumber: string,
  ): Promise<RepeatOrderRecord> {
    const order = await db.order.findFirst({
      where: { customerId: userId, publicNumber, status: { not: 'DRAFT' } },
      include: repeatOrderInclude,
    });
    if (!order) throw this.notFound();
    return order;
  }

  private publicNumber(raw: string): string {
    const publicNumber = raw.trim().toUpperCase();
    if (!publicNumberPattern.test(publicNumber)) throw this.notFound();
    return publicNumber;
  }

  private assertIdempotencyKey(value: string): void {
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(value)) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'Передайте Idempotency-Key длиной от 8 до 128 символов.',
      });
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'ORDER_NOT_FOUND',
      message: 'Заказ не найден.',
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
