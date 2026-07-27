import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import {
  type AccountFrequentItem,
  type AccountOrderDetail,
  type AccountOrdersOverview,
  type AccountOrdersPage,
  type AccountOrderSummary,
} from '@pro-dessert/contracts';
import { decimalString } from '../cart/cart-domain';
import { PrismaService } from '../prisma/prisma.service';
import { type AccountOrdersQueryDto } from './dto/account-orders-query.dto';

const publicNumberPattern = /^PD-\d{8}-[A-F0-9]{8}$/;

const activeOrderStatuses: readonly OrderStatus[] = [
  OrderStatus.CREATED,
  OrderStatus.AWAITING_STOCK_CONFIRMATION,
  OrderStatus.AWAITING_PAYMENT,
  OrderStatus.PAYMENT_VERIFICATION,
  OrderStatus.PAID,
  OrderStatus.ASSEMBLING,
  OrderStatus.READY_FOR_PICKUP,
  OrderStatus.RETURN_REQUESTED,
];

const frequentOrderStatuses: readonly OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.ASSEMBLING,
  OrderStatus.READY_FOR_PICKUP,
  OrderStatus.COMPLETED,
];

const orderSummarySelect = {
  publicNumber: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  reservationExpiresAt: true,
  grandTotal: true,
  currency: true,
  fulfillmentMethod: true,
  pickupLocationName: true,
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;

type OrderSummaryRecord = Prisma.OrderGetPayload<{ select: typeof orderSummarySelect }>;

const frequentOrdersSelect = {
  id: true,
  items: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      productId: true,
      variantId: true,
      oneCVariantId: true,
      productName: true,
      offerName: true,
      sku: true,
      packDescription: true,
      unit: true,
      quantity: true,
      imageUrl: true,
      imageAlt: true,
      product: { select: { slug: true } },
    },
  },
} satisfies Prisma.OrderSelect;

type FrequentOrderRecord = Prisma.OrderGetPayload<{ select: typeof frequentOrdersSelect }>;

const accountOrderDetailInclude = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: { product: { select: { slug: true } } },
  },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  payment: { select: { status: true } },
} satisfies Prisma.OrderInclude;

type AccountOrderDetailRecord = Prisma.OrderGetPayload<{
  include: typeof accountOrderDetailInclude;
}>;

interface FrequentAccumulator {
  productId: string | null;
  variantId: string | null;
  productSlug: string | null;
  productName: string;
  offerName: string;
  sku: string;
  packDescription: string | null;
  unit: string;
  totalQuantity: Prisma.Decimal;
  orderCount: number;
  imageUrl: string | null;
  imageAlt: string | null;
  firstSeen: number;
}

@Injectable()
export class AccountOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(userId: string): Promise<AccountOrdersOverview> {
    const [activeOrder, lastOrder, recentOrders] = await Promise.all([
      this.prisma.order.findFirst({
        where: { customerId: userId, status: { in: [...activeOrderStatuses] } },
        orderBy: { createdAt: 'desc' },
        select: orderSummarySelect,
      }),
      this.prisma.order.findFirst({
        where: { customerId: userId, status: { not: OrderStatus.DRAFT } },
        orderBy: { createdAt: 'desc' },
        select: orderSummarySelect,
      }),
      this.prisma.order.findMany({
        where: { customerId: userId, status: { in: [...frequentOrderStatuses] } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: frequentOrdersSelect,
      }),
    ]);

    return {
      activeOrder: activeOrder ? this.toSummary(activeOrder) : null,
      lastOrder: lastOrder ? this.toSummary(lastOrder) : null,
      frequentItems: this.frequentItems(recentOrders, 6),
    };
  }

  async history(userId: string, query: AccountOrdersQueryDto): Promise<AccountOrdersPage> {
    const where = { customerId: userId, status: { not: OrderStatus.DRAFT } } as const;
    const [total, orders] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: orderSummarySelect,
      }),
    ]);
    return {
      items: orders.map((order) => this.toSummary(order)),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
    };
  }

  async detail(userId: string, rawPublicNumber: string): Promise<AccountOrderDetail> {
    const order = await this.ownedOrder(userId, rawPublicNumber);
    return this.toDetail(order);
  }

  async ownedOrder(userId: string, rawPublicNumber: string): Promise<AccountOrderDetailRecord> {
    const publicNumber = rawPublicNumber.trim().toUpperCase();
    if (!publicNumberPattern.test(publicNumber)) throw this.notFound();
    const order = await this.prisma.order.findFirst({
      where: { publicNumber, customerId: userId, status: { not: OrderStatus.DRAFT } },
      include: accountOrderDetailInclude,
    });
    if (!order) throw this.notFound();
    return order;
  }

  toSummary(order: OrderSummaryRecord): AccountOrderSummary {
    return {
      publicNumber: order.publicNumber,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      status: order.status,
      reservationExpiresAt: order.reservationExpiresAt?.toISOString() ?? null,
      grandTotal: order.grandTotal.toFixed(2),
      currency: 'RUB',
      itemCount: order._count.items,
      fulfillmentMethod: 'PICKUP',
      pickupName: order.pickupLocationName,
      canRepeat: order._count.items > 0,
    };
  }

  private toDetail(order: AccountOrderDetailRecord): AccountOrderDetail {
    return {
      publicNumber: order.publicNumber,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      status: order.status,
      reservationExpiresAt: order.reservationExpiresAt?.toISOString() ?? null,
      desiredPickupAt: order.desiredPickupAt?.toISOString().slice(0, 10) ?? null,
      fulfillmentMethod: 'PICKUP',
      paymentMethod: 'BANK_TRANSFER',
      paymentStatus: order.payment?.status ?? null,
      pickup: {
        code: order.pickupLocationCode,
        name: order.pickupLocationName,
        addressText: order.pickupLocationAddress,
        timezone: order.pickupLocationTimezone,
        phone: order.pickupLocationPhone,
        openingHours: order.pickupLocationOpeningHours,
      },
      organization: this.organization(order.organizationData),
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        productSlug: item.product?.slug ?? null,
        sku: item.sku,
        productName: item.productName,
        brand: item.brandName,
        offerName: item.offerName,
        packDescription: item.packDescription,
        unit: item.unit,
        quantity: decimalString(item.quantity),
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
      history: order.statusHistory.map((entry) => ({
        status: entry.toStatus,
        createdAt: entry.createdAt.toISOString(),
      })),
      canRepeat: order.items.length > 0,
    };
  }

  private frequentItems(
    orders: readonly FrequentOrderRecord[],
    limit: number,
  ): AccountFrequentItem[] {
    const grouped = new Map<string, FrequentAccumulator>();
    let firstSeen = 0;
    for (const order of orders) {
      const countedInOrder = new Set<string>();
      for (const item of order.items) {
        const key = item.variantId ?? `1c:${item.oneCVariantId}`;
        const current = grouped.get(key);
        const orderIncrement = countedInOrder.has(key) ? 0 : 1;
        countedInOrder.add(key);
        if (current) {
          current.totalQuantity = current.totalQuantity.plus(item.quantity);
          current.orderCount += orderIncrement;
          continue;
        }
        grouped.set(key, {
          productId: item.productId,
          variantId: item.variantId,
          productSlug: item.product?.slug ?? null,
          productName: item.productName,
          offerName: item.offerName,
          sku: item.sku,
          packDescription: item.packDescription,
          unit: item.unit,
          totalQuantity: item.quantity,
          orderCount: orderIncrement,
          imageUrl: item.imageUrl,
          imageAlt: item.imageAlt,
          firstSeen,
        });
        firstSeen += 1;
      }
    }

    return [...grouped.values()]
      .sort(
        (left, right) =>
          right.orderCount - left.orderCount ||
          right.totalQuantity.comparedTo(left.totalQuantity) ||
          left.firstSeen - right.firstSeen,
      )
      .slice(0, limit)
      .map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        productSlug: item.productSlug,
        productName: item.productName,
        offerName: item.offerName,
        sku: item.sku,
        packDescription: item.packDescription,
        unit: item.unit,
        totalQuantity: decimalString(item.totalQuantity),
        orderCount: item.orderCount,
        imageUrl: item.imageUrl,
        imageAlt: item.imageAlt,
      }));
  }

  private organization(value: Prisma.JsonValue | null): AccountOrderDetail['organization'] {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const name = typeof value.name === 'string' ? value.name : null;
    const inn = typeof value.inn === 'string' ? value.inn : null;
    if (!name || !inn) return null;
    return {
      name,
      inn,
      kpp: typeof value.kpp === 'string' ? value.kpp : null,
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'ORDER_NOT_FOUND',
      message: 'Заказ не найден.',
    });
  }
}
