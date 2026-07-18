import { BadRequestException } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { type Environment } from '../common/config/environment';
import { CartService } from './cart.service';

const emptyView = {
  items: [],
  recommendations: [],
  totals: { products: '0.00', discount: '0.00', grandTotal: '0.00', currency: 'RUB' as const },
  notices: [],
  canCheckout: false,
  itemCount: 0,
  updatedAt: new Date().toISOString(),
};

describe('CartService mutations', () => {
  it('locks the cart before reading lines during validation', async () => {
    const cartLock = jest.fn().mockResolvedValue([]);
    const cartFind = jest.fn().mockResolvedValue({
      id: 'cart-id',
      items: [],
      updatedAt: new Date('2026-07-17T00:00:00.000Z'),
    });
    const tx = {
      $queryRaw: cartLock,
      cart: { findUniqueOrThrow: cartFind },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const catalog = { recommendationsForCart: jest.fn().mockResolvedValue([]) };
    const service = new CartService(prisma as never, {} as never, {} as never, catalog as never);

    const result = await service.validate('cart-id');

    expect(result.view).toMatchObject({
      items: [],
      recommendations: [],
      notices: [],
      canCheckout: false,
      itemCount: 0,
    });
    expect(cartLock.mock.invocationCallOrder[0]).toBeLessThan(
      cartFind.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it('keeps the previous price snapshot until validation can report PRICE_CHANGED', async () => {
    const cartItemUpdate = jest.fn().mockResolvedValue({});
    const cartItemFind = jest.fn().mockResolvedValue({
      id: 'item-id',
      cartId: 'cart-id',
      variantId: 'variant-id',
      quantity: new Prisma.Decimal(1),
      unitPriceSnapshot: new Prisma.Decimal(100),
      oldPriceSnapshot: null,
      currency: 'RUB',
    });
    const cartLock = jest.fn().mockResolvedValue([]);
    const tx = {
      $queryRaw: cartLock,
      cartItem: {
        findFirst: cartItemFind,
        update: cartItemUpdate,
      },
      productVariant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'variant-id',
          active: true,
          allowBackorder: false,
          minOrderQuantity: new Prisma.Decimal(1),
          salesMultiple: new Prisma.Decimal(1),
          product: { active: true },
          prices: [
            {
              amount: new Prisma.Decimal(120),
              oldAmount: null,
              currency: 'RUB',
              validFrom: null,
              validTo: null,
            },
          ],
          stockBalances: [
            {
              available: new Prisma.Decimal(10),
              warehouse: { pickupLocation: { code: 'orenburg-lipovaya-20' } },
            },
          ],
        }),
      },
      cart: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const config = {
      get: jest.fn().mockReturnValue('orenburg-lipovaya-20'),
    } as unknown as ConfigService<Environment, true>;
    const service = new CartService(prisma as never, {} as never, config, {} as never);
    jest.spyOn(service, 'validate').mockResolvedValue({
      view: { ...emptyView, notices: [{ code: 'PRICE_CHANGED', message: 'Цена изменилась.' }] },
      productIds: [],
      lines: [],
      subtotal: new Prisma.Decimal(0),
      discountTotal: new Prisma.Decimal(0),
      grandTotal: new Prisma.Decimal(0),
      materiallyChanged: true,
    });

    const result = await service.updateItem('cart-id', 'item-id', '2');
    const updateData = cartItemUpdate.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(updateData).toHaveProperty('quantity');
    expect(updateData).not.toHaveProperty('unitPriceSnapshot');
    expect(updateData).not.toHaveProperty('oldPriceSnapshot');
    expect(result.notices).toContainEqual(expect.objectContaining({ code: 'PRICE_CHANGED' }));
    expect(cartLock.mock.invocationCallOrder[0]).toBeLessThan(
      cartItemFind.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it('locks the cart before reading an existing line for an additive update', async () => {
    const cartLock = jest.fn().mockResolvedValue([]);
    const itemFind = jest.fn().mockResolvedValue({
      id: 'item-id',
      quantity: new Prisma.Decimal(1),
    });
    const upsert = jest.fn().mockResolvedValue({});
    const tx = {
      $queryRaw: cartLock,
      cartItem: { findUnique: itemFind, upsert },
      productVariant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'variant-id',
          active: true,
          allowBackorder: false,
          minOrderQuantity: new Prisma.Decimal(1),
          salesMultiple: new Prisma.Decimal(1),
          product: { active: true },
          prices: [
            {
              amount: new Prisma.Decimal(100),
              oldAmount: null,
              currency: 'RUB',
              validFrom: null,
              validTo: null,
            },
          ],
          stockBalances: [
            {
              available: new Prisma.Decimal(10),
              warehouse: { pickupLocation: { code: 'orenburg-lipovaya-20' } },
            },
          ],
        }),
      },
      cart: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const config = { get: jest.fn().mockReturnValue('orenburg-lipovaya-20') };
    const service = new CartService(prisma as never, {} as never, config as never, {} as never);
    jest.spyOn(service, 'validate').mockResolvedValue({
      view: emptyView,
      productIds: [],
      lines: [],
      subtotal: new Prisma.Decimal(0),
      discountTotal: new Prisma.Decimal(0),
      grandTotal: new Prisma.Decimal(0),
      materiallyChanged: false,
    });

    await service.addItem('cart-id', 'variant-id', '1');
    expect(cartLock.mock.invocationCallOrder[0]).toBeLessThan(
      itemFind.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ quantity: new Prisma.Decimal(2) }),
      }),
    );
  });

  it('maps malformed decimal input to a public 400 error', async () => {
    const service = new CartService({} as never, {} as never, {} as never, {} as never);
    await expect(service.updateItem('cart-id', 'item-id', 'not-a-number')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
