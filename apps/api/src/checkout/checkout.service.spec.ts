import { Prisma } from '@prisma/client';
import { type CartView } from '@pro-dessert/contracts';
import { CheckoutService } from './checkout.service';

const cartView: CartView = {
  items: [
    {
      id: 'item',
      productSlug: 'product',
      productName: 'Товар',
      brand: null,
      variantId: 'variant',
      sku: 'SKU',
      offerName: 'Фасовка',
      packDescription: null,
      unit: 'шт',
      quantity: '1',
      minOrderQuantity: '1',
      salesMultiple: '1',
      unitPrice: '100.00',
      oldUnitPrice: null,
      lineSubtotal: '100.00',
      lineDiscount: '0.00',
      lineTotal: '100.00',
      currency: 'RUB',
      image: null,
      availability: 'IN_STOCK',
      active: true,
      issues: [],
    },
  ],
  recommendations: [],
  totals: { products: '100.00', discount: '0.00', grandTotal: '100.00', currency: 'RUB' },
  notices: [{ code: 'PRICE_CHANGED', message: 'Цена изменилась.' }],
  canCheckout: true,
  itemCount: 1,
  updatedAt: new Date().toISOString(),
};

describe('CheckoutService', () => {
  it('requires explicit review when cart validation changed price or quantity', async () => {
    const prisma = {
      pickupLocation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'pickup',
          code: 'orenburg-lipovaya-20',
          name: 'Pro Dessert',
          addressText: 'Оренбург, Липовая улица, 20',
          timezone: 'Asia/Yekaterinburg',
          phone: null,
          openingHours: null,
          active: true,
          latitude: null,
          longitude: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    };
    const cart = {
      validate: jest.fn().mockResolvedValue({
        view: cartView,
        productIds: [],
        lines: [],
        subtotal: new Prisma.Decimal(100),
        discountTotal: new Prisma.Decimal(0),
        grandTotal: new Prisma.Decimal(100),
        materiallyChanged: true,
      }),
    };
    const config = { get: jest.fn().mockReturnValue('orenburg-lipovaya-20') };
    const service = new CheckoutService(prisma as never, cart as never, config as never);
    const result = await service.validate(
      {
        cartUpdatedAt: cartView.updatedAt,
        firstName: 'Анна',
        phone: '+79123456789',
        email: 'anna@example.test',
        privacyConsent: true,
        orderTermsConsent: true,
      },
      'cart',
    );

    expect(result.valid).toBe(false);
    expect(result.fieldErrors).toContainEqual(
      expect.objectContaining({ field: 'cart', code: 'CART_CHANGED_REVIEW_REQUIRED' }),
    );
  });

  it('keeps review required when a validation response was lost and the client revision is stale', async () => {
    const prisma = {
      pickupLocation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'pickup',
          code: 'orenburg-lipovaya-20',
          name: 'Pro Dessert',
          addressText: 'Оренбург, Липовая улица, 20',
          timezone: 'Asia/Yekaterinburg',
          phone: null,
          openingHours: null,
          active: true,
          latitude: null,
          longitude: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    };
    const cart = {
      validate: jest.fn().mockResolvedValue({
        view: cartView,
        productIds: [],
        lines: [],
        subtotal: new Prisma.Decimal(100),
        discountTotal: new Prisma.Decimal(0),
        grandTotal: new Prisma.Decimal(100),
        materiallyChanged: false,
      }),
    };
    const config = { get: jest.fn().mockReturnValue('orenburg-lipovaya-20') };
    const service = new CheckoutService(prisma as never, cart as never, config as never);

    const result = await service.validate(
      {
        cartUpdatedAt: '2026-07-16T00:00:00.000Z',
        firstName: 'Анна',
        phone: '+79123456789',
        email: 'anna@example.test',
        privacyConsent: true,
        orderTermsConsent: true,
      },
      'cart',
    );

    expect(result.valid).toBe(false);
    expect(result.fieldErrors).toContainEqual(
      expect.objectContaining({ field: 'cart', code: 'CART_CHANGED_REVIEW_REQUIRED' }),
    );
  });
});
