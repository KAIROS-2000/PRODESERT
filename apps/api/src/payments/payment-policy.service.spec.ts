import { Prisma } from '@prisma/client';
import {
  PaymentPolicyError,
  PaymentPolicyService,
  type PaymentGateOrder,
  type PublishedPaymentSnapshot,
} from './payment-policy.service';

const now = new Date('2026-07-25T10:00:00.000Z');

function order(overrides: Partial<PaymentGateOrder> = {}): PaymentGateOrder {
  return {
    id: 'order-1',
    status: 'AWAITING_PAYMENT',
    paymentMethod: 'BANK_TRANSFER',
    currency: 'RUB',
    grandTotal: new Prisma.Decimal('1250.00'),
    stockConfirmedAt: new Date('2026-07-25T09:00:00.000Z'),
    reservationExpiresAt: new Date('2026-07-26T09:00:00.000Z'),
    items: [{ id: 'item-1', quantity: new Prisma.Decimal(2) }],
    stockReservations: [
      {
        orderItemId: 'item-1',
        quantity: new Prisma.Decimal(2),
        status: 'ACTIVE',
        expiresAt: new Date('2026-07-26T09:00:00.000Z'),
        externalReservationId: 'reserve-1c-1',
      },
    ],
    ...overrides,
  };
}

function payment(overrides: Partial<PublishedPaymentSnapshot> = {}): PublishedPaymentSnapshot {
  return {
    status: 'PENDING',
    amount: new Prisma.Decimal('1250.00'),
    currency: 'RUB',
    recipientName: 'ООО «Про Десерт»',
    recipientInn: '5610000000',
    settlementAccount: '40702810000000000001',
    correspondentAccount: '30101810000000000001',
    bik: '045354001',
    bankName: 'Тестовый банк',
    paymentPurpose: 'Оплата заказа PD-20260725-12345678',
    detailsVersion: '2026-01',
    detailsPublishedAt: new Date('2026-07-25T09:05:00.000Z'),
    ...overrides,
  };
}

describe('PaymentPolicyService', () => {
  const policy: PaymentPolicyService = new PaymentPolicyService();

  it('allows reveal only for a complete, live 1C reservation and a published snapshot', () => {
    expect(() => policy.assertCanReveal(order(), payment(), now)).not.toThrow();
  });

  it.each([
    [
      'expired order deadline',
      order({ reservationExpiresAt: new Date('2026-07-25T09:59:59.000Z') }),
      'RESERVATION_EXPIRED',
    ],
    ['missing 1C confirmation', order({ stockConfirmedAt: null }), 'STOCK_NOT_CONFIRMED'],
    [
      'incomplete quantity',
      order({
        stockReservations: [
          {
            orderItemId: 'item-1',
            quantity: new Prisma.Decimal(1),
            status: 'ACTIVE',
            expiresAt: new Date('2026-07-26T09:00:00.000Z'),
            externalReservationId: 'reserve-1c-1',
          },
        ],
      }),
      'RESERVATION_INCOMPLETE',
    ],
  ])('blocks bank details for %s', (_label, candidate, code) => {
    try {
      policy.assertCanReveal(candidate, payment(), now);
      throw new Error('expected policy failure');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(PaymentPolicyError);
      expect((error as PaymentPolicyError).code).toBe(code);
    }
  });

  it('blocks bank details until a manager explicitly publishes them', () => {
    expect(() => policy.assertCanReveal(order(), null, now)).toThrow(
      expect.objectContaining({ code: 'PAYMENT_DETAILS_NOT_PUBLISHED' }),
    );
  });

  it('does not treat a proof as confirmed payment', () => {
    expect(() =>
      policy.assertCanConfirm(payment({ status: 'PROOF_UPLOADED' }), order()),
    ).not.toThrow();
    expect(() => policy.assertCanConfirm(payment({ status: 'CONFIRMED' }), order())).toThrow(
      expect.objectContaining({ code: 'PAYMENT_STATUS_INVALID' }),
    );
  });
});
