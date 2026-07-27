import { createHash } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { RepeatOrderService } from './repeat-order.service';

describe('RepeatOrderService access and idempotency', () => {
  it('returns the same non-enumerable 404 for an order not owned by the customer', async () => {
    const prisma = {
      order: { findFirst: jest.fn().mockResolvedValue(null) },
      cart: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new RepeatOrderService(
      prisma as never,
      {} as never,
      config() as never,
      {} as never,
    );

    await expect(
      service.preview(principal('customer-a'), 'PD-20260725-ABCDEF12'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ customerId: 'customer-a' }),
      }),
    );
  });

  it('rejects a missing idempotency key before opening or mutating the cart', async () => {
    const cart = { access: jest.fn() };
    const service = new RepeatOrderService(
      {} as never,
      cart as never,
      config() as never,
      {} as never,
    );

    await expect(
      service.execute(principal('customer-a'), 'PD-20260725-ABCDEF12', ''),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'IDEMPOTENCY_KEY_INVALID' }),
    });
    expect(cart.access).not.toHaveBeenCalled();
  });

  it('replays a completed request without applying cart items a second time', async () => {
    const userId = 'customer-a';
    const orderId = '11111111-1111-4111-8111-111111111111';
    const requestHash = createHash('sha256')
      .update(`repeat-order:v1:${orderId}`, 'utf8')
      .digest('hex');
    const preview = {
      sourceOrder: {
        publicNumber: 'PD-20260725-ABCDEF12',
        createdAt: '2026-07-25T00:00:00.000Z',
        updatedAt: '2026-07-25T00:00:00.000Z',
        status: 'COMPLETED',
        reservationExpiresAt: null,
        grandTotal: '100.00',
        currency: 'RUB',
        itemCount: 1,
        fulfillmentMethod: 'PICKUP',
        pickupName: 'Pro Dessert',
        canRepeat: true,
      },
      evaluatedAt: '2026-07-25T01:00:00.000Z',
      items: [],
      estimatedTotal: '100.00',
      currency: 'RUB',
      canExecute: true,
      hasChanges: false,
    };
    const tx = {
      order: {
        findFirst: jest.fn().mockResolvedValue({ id: orderId }),
      },
      idempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue({
          requestHash,
          status: 'COMPLETED',
          responseBody: {
            preview,
            addedItemCount: 1,
            skippedItemCount: 0,
          },
          resourceId: '22222222-2222-4222-8222-222222222222',
          expiresAt: new Date('2026-07-26T00:00:00.000Z'),
        }),
      },
      cartItem: { upsert: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)),
    };
    const cartView = {
      items: [],
      recommendations: [],
      totals: { products: '0.00', discount: '0.00', grandTotal: '0.00', currency: 'RUB' },
      notices: [],
      canCheckout: false,
      itemCount: 0,
      updatedAt: '2026-07-25T01:00:00.000Z',
    };
    const cart = {
      access: jest.fn().mockResolvedValue({
        cartId: '22222222-2222-4222-8222-222222222222',
      }),
      validate: jest.fn().mockResolvedValue({ view: cartView }),
    };
    const service = new RepeatOrderService(
      prisma as never,
      cart as never,
      config() as never,
      {} as never,
    );

    const result = await service.execute(
      principal(userId),
      'PD-20260725-ABCDEF12',
      'repeat-key-001',
    );

    expect(result.replayed).toBe(true);
    expect(result.addedItemCount).toBe(1);
    expect(result.cart).toBe(cartView);
    expect(tx.cartItem.upsert).not.toHaveBeenCalled();
  });
});

function principal(userId: string): {
  userId: string;
  sessionId: string;
  email: string;
  role: 'CUSTOMER';
  expiresAt: Date;
} {
  return {
    userId,
    sessionId: 'session-id',
    email: 'customer@example.test',
    role: 'CUSTOMER',
    expiresAt: new Date('2026-07-26T00:00:00.000Z'),
  };
}

function config(): { get: jest.Mock } {
  return { get: jest.fn().mockReturnValue('orenburg-lipovaya-20') };
}
