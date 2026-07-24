import {
  allowedOrderTransitions,
  assertOrderTransitionAllowed,
  InvalidOrderTransitionError,
  isOrderTransitionAllowed,
} from './order-state-machine';

describe('order state machine', () => {
  it('permits the documented happy path for its authoritative sources', () => {
    expect(isOrderTransitionAllowed('DRAFT', 'CREATED', 'STOREFRONT')).toBe(true);
    expect(isOrderTransitionAllowed('CREATED', 'AWAITING_STOCK_CONFIRMATION', 'SYSTEM')).toBe(true);
    expect(
      isOrderTransitionAllowed('AWAITING_STOCK_CONFIRMATION', 'AWAITING_PAYMENT', 'ONE_C'),
    ).toBe(true);
    expect(isOrderTransitionAllowed('AWAITING_PAYMENT', 'PAID', 'ADMIN')).toBe(true);
    expect(isOrderTransitionAllowed('PAID', 'ASSEMBLING', 'ONE_C')).toBe(true);
    expect(isOrderTransitionAllowed('ASSEMBLING', 'READY_FOR_PICKUP', 'ADMIN')).toBe(true);
    expect(isOrderTransitionAllowed('READY_FOR_PICKUP', 'COMPLETED', 'ONE_C')).toBe(true);
  });

  it('does not let a manager establish the 1C-owned stock fact directly', () => {
    expect(
      isOrderTransitionAllowed('AWAITING_STOCK_CONFIRMATION', 'AWAITING_PAYMENT', 'ADMIN'),
    ).toBe(false);
    expect(() =>
      assertOrderTransitionAllowed('AWAITING_STOCK_CONFIRMATION', 'AWAITING_PAYMENT', 'ADMIN'),
    ).toThrow(InvalidOrderTransitionError);
  });

  it('allows proof submission without treating the proof as payment', () => {
    expect(isOrderTransitionAllowed('AWAITING_PAYMENT', 'PAYMENT_VERIFICATION', 'STOREFRONT')).toBe(
      true,
    );
    expect(isOrderTransitionAllowed('PAYMENT_VERIFICATION', 'PAID', 'STOREFRONT')).toBe(false);
  });

  it('uses only system or 1C for reservation expiry', () => {
    expect(isOrderTransitionAllowed('AWAITING_PAYMENT', 'RESERVATION_EXPIRED', 'SYSTEM')).toBe(
      true,
    );
    expect(isOrderTransitionAllowed('AWAITING_PAYMENT', 'RESERVATION_EXPIRED', 'ADMIN')).toBe(
      false,
    );
  });

  it('keeps terminal states terminal', () => {
    for (const status of [
      'CANCELLED_BY_CUSTOMER',
      'CANCELLED_BY_STORE',
      'RESERVATION_EXPIRED',
      'RETURNED',
    ] as const) {
      expect(allowedOrderTransitions(status, 'ADMIN')).toEqual([]);
      expect(allowedOrderTransitions(status, 'ONE_C')).toEqual([]);
    }
  });
});
