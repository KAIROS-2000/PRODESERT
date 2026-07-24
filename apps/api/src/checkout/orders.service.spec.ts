import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { checkoutRequestHash } from '../cart/cart-domain';
import { OrdersService } from './orders.service';

describe('OrdersService public access', () => {
  it('does not expose an existing guest order without its bearer token', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          customerId: null,
          publicAccessTokenHash: 'a'.repeat(64),
          publicAccessTokenExpiresAt: new Date(Date.now() + 60_000),
        }),
      },
    };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      {} as never,
      { hash: jest.fn() } as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.publicOrder('PD-20260718-ABCDEF12', undefined, undefined),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.order.findUnique).toHaveBeenCalledTimes(1);
  });

  it('uses the same non-enumerable response for malformed public numbers', async () => {
    const prisma = { order: { findUnique: jest.fn() } };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.publicOrder('123', undefined, undefined)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });

  it('shows the 1C reserve deadline without exposing payment details', async () => {
    const reservationExpiresAt = new Date('2026-07-26T11:00:00.000Z');
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue(
          publicOrderRecord({
            status: 'AWAITING_PAYMENT',
            reservationExpiresAt,
          }),
        ),
      },
    };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.publicOrder('PD-20260718-ABCDEF12', undefined, {
      userId: 'customer-id',
    } as never);

    expect(result.reservationExpiresAt).toBe(reservationExpiresAt.toISOString());
    expect(result.message).toContain('товары зарезервированы');
    expect(result.message).toContain('ещё не опубликованы');
    expect(result).not.toHaveProperty('bankDetails');
    expect(result).not.toHaveProperty('paymentDetails');
  });

  it('honestly reports an expired reserve and does not invite payment', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue(
          publicOrderRecord({
            status: 'RESERVATION_EXPIRED',
            reservationExpiresAt: new Date('2026-07-25T11:00:00.000Z'),
          }),
        ),
      },
    };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.publicOrder('PD-20260718-ABCDEF12', undefined, {
      userId: 'customer-id',
    } as never);

    expect(result.status).toBe('RESERVATION_EXPIRED');
    expect(result.message).toContain('Срок резерва истёк');
    expect(result.message).toContain('Не переводите деньги');
  });
});

describe('OrdersService idempotent replay', () => {
  it('returns the immutable order before mutable date and pickup validation', async () => {
    const dto = {
      cartUpdatedAt: '2026-07-17T00:00:00.000Z',
      firstName: 'Анна',
      phone: '+79123456789',
      email: 'anna@example.test',
      privacyConsent: true,
      orderTermsConsent: true,
      desiredPickupAt: '2020-01-01',
    };
    const existing = {
      id: 'order-id',
      customerId: null,
      idempotencyRequestHash: checkoutRequestHash(dto),
      publicNumber: 'PD-20260718-ABCDEF12',
      status: 'AWAITING_STOCK_CONFIRMATION',
      createdAt: new Date('2026-07-18T00:00:00.000Z'),
      grandTotal: new Prisma.Decimal(100),
      currency: 'RUB',
      pickupLocationCode: 'orenburg-lipovaya-20',
      pickupLocationName: 'Pro Dessert',
      pickupLocationAddress: 'Оренбург, Липовая улица, 20',
      pickupLocationTimezone: 'Asia/Yekaterinburg',
      pickupLocationPhone: null,
      pickupLocationOpeningHours: null,
      items: [],
      statusHistory: [],
    };
    const prisma = { order: { findUnique: jest.fn().mockResolvedValue(existing) } };
    const checkout = {
      location: jest.fn().mockRejectedValue(new Error('pickup inactive')),
    };
    const accessTokens = { derive: jest.fn().mockReturnValue('stable-access-token') };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      checkout as never,
      accessTokens as never,
      {} as never,
      {} as never,
    );

    const result = await service.create(
      dto,
      { cartId: 'cart-id', scopeHash: 'a'.repeat(64) },
      'replay-key-001',
    );
    expect(result.publicNumber).toBe(existing.publicNumber);
    expect(result.accessToken).toBe('stable-access-token');
    expect(checkout.location).not.toHaveBeenCalled();

    await expect(
      service.create(
        { ...dto, phone: '+79999999999' },
        { cartId: 'cart-id', scopeHash: 'a'.repeat(64) },
        'replay-key-001',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'IDEMPOTENCY_KEY_REUSED' }),
    });
    expect(checkout.location).not.toHaveBeenCalled();
  });
});

function publicOrderRecord(
  overrides: Partial<{
    status: string;
    reservationExpiresAt: Date | null;
  }> = {},
): Record<string, unknown> {
  const createdAt = new Date('2026-07-25T08:00:00.000Z');
  return {
    id: 'order-id',
    customerId: 'customer-id',
    publicNumber: 'PD-20260718-ABCDEF12',
    status: overrides.status ?? 'AWAITING_STOCK_CONFIRMATION',
    createdAt,
    updatedAt: createdAt,
    reservationExpiresAt: overrides.reservationExpiresAt ?? null,
    guestName: 'Анна',
    guestSurname: null,
    guestEmail: 'anna@example.test',
    guestPhone: '+79123456789',
    desiredPickupAt: null,
    pickupLocationCode: 'orenburg-lipovaya-20',
    pickupLocationName: 'Pro Dessert',
    pickupLocationAddress: 'Оренбург, Липовая улица, 20',
    pickupLocationTimezone: 'Asia/Yekaterinburg',
    pickupLocationPhone: null,
    pickupLocationOpeningHours: null,
    subtotal: new Prisma.Decimal(100),
    discountTotal: new Prisma.Decimal(0),
    grandTotal: new Prisma.Decimal(100),
    publicAccessTokenHash: null,
    publicAccessTokenExpiresAt: null,
    items: [],
    statusHistory: [
      {
        toStatus: overrides.status ?? 'AWAITING_STOCK_CONFIRMATION',
        createdAt,
      },
    ],
  };
}
