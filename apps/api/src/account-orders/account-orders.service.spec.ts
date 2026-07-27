import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccountOrdersService } from './account-orders.service';

describe('AccountOrdersService ownership', () => {
  it('does not query malformed public numbers', async () => {
    const prisma = { order: { findFirst: jest.fn() } };
    const service = new AccountOrdersService(prisma as never);

    await expect(service.detail('customer-a', 'not-an-order')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.order.findFirst).not.toHaveBeenCalled();
  });

  it('uses the same 404 for a missing or foreign order', async () => {
    const prisma = { order: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new AccountOrdersService(prisma as never);

    await expect(service.detail('customer-a', 'PD-20260725-ABCDEF12')).rejects.toMatchObject({
      response: {
        code: 'ORDER_NOT_FOUND',
        message: 'Заказ не найден.',
      },
    });
    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          customerId: 'customer-a',
          publicNumber: 'PD-20260725-ABCDEF12',
        }),
      }),
    );
  });
});

describe('AccountOrdersService overview', () => {
  it('aggregates frequently ordered variants by order count and decimal quantity', async () => {
    const active = summaryRecord('PD-20260725-AAAAAAAA', 'AWAITING_PAYMENT');
    const last = summaryRecord('PD-20260724-BBBBBBBB', 'COMPLETED');
    const prisma = {
      order: {
        findFirst: jest.fn().mockResolvedValueOnce(active).mockResolvedValueOnce(last),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'order-2',
            items: [
              frequentItem({
                variantId: 'variant-a',
                oneCVariantId: 'one-c-a',
                quantity: new Prisma.Decimal('1.5'),
                sku: 'A',
              }),
              frequentItem({
                variantId: 'variant-b',
                oneCVariantId: 'one-c-b',
                quantity: new Prisma.Decimal('10'),
                sku: 'B',
              }),
            ],
          },
          {
            id: 'order-1',
            items: [
              frequentItem({
                variantId: 'variant-a',
                oneCVariantId: 'one-c-a',
                quantity: new Prisma.Decimal('2.5'),
                sku: 'A',
              }),
            ],
          },
        ]),
      },
    };
    const service = new AccountOrdersService(prisma as never);

    const result = await service.overview('customer-a');

    expect(result.activeOrder?.publicNumber).toBe(active.publicNumber);
    expect(result.lastOrder?.publicNumber).toBe(last.publicNumber);
    expect(result.frequentItems).toHaveLength(2);
    expect(result.frequentItems[0]).toMatchObject({
      variantId: 'variant-a',
      orderCount: 2,
      totalQuantity: '4',
    });
    expect(result.frequentItems[1]).toMatchObject({
      variantId: 'variant-b',
      orderCount: 1,
      totalQuantity: '10',
    });
  });
});

function summaryRecord(publicNumber: string, status: string): Record<string, unknown> {
  const createdAt = new Date('2026-07-25T10:00:00.000Z');
  return {
    publicNumber,
    createdAt,
    updatedAt: createdAt,
    status,
    reservationExpiresAt: null,
    grandTotal: new Prisma.Decimal(1500),
    currency: 'RUB',
    fulfillmentMethod: 'PICKUP',
    pickupLocationName: 'Pro Dessert',
    _count: { items: 2 },
  };
}

function frequentItem(
  overrides: Partial<{
    variantId: string | null;
    oneCVariantId: string;
    quantity: Prisma.Decimal;
    sku: string;
  }> = {},
): Record<string, unknown> {
  return {
    productId: 'product-a',
    variantId: overrides.variantId ?? 'variant-a',
    oneCVariantId: overrides.oneCVariantId ?? 'one-c-a',
    productName: `Товар ${overrides.sku ?? 'A'}`,
    offerName: 'Фасовка',
    sku: overrides.sku ?? 'A',
    packDescription: '1 кг',
    unit: 'шт',
    quantity: overrides.quantity ?? new Prisma.Decimal(1),
    imageUrl: null,
    imageAlt: null,
    product: { slug: `product-${(overrides.sku ?? 'A').toLowerCase()}` },
  };
}
