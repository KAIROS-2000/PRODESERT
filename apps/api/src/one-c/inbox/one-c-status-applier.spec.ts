import { ReservationOneCStatusApplier, type OneCAcceptedOrderStatus } from './one-c-status-applier';

function status(): OneCAcceptedOrderStatus {
  return {
    syncJobId: 'job-1',
    messageId: '550e8400-e29b-41d4-a716-446655440000',
    correlationId: '9716f8ee-a989-4f1e-9e9c-c3267c55f768',
    sourceRevision: '4817',
    payload: {
      externalOrderId: '1c-order-7',
      publicNumber: 'PD-7',
      eventId: 'event-7',
      orderVersion: 7,
      status: 'AWAITING_PAYMENT',
      confirmedTotal: '100.00',
      currency: 'RUB',
      reservation: {
        externalReservationId: 'reservation-7',
        status: 'ACTIVE',
        expiresAt: '2026-07-19T06:30:00.000Z',
      },
      payment: {
        status: 'NOT_PAID',
        confirmedAt: null,
        externalPaymentId: null,
      },
      lines: [
        {
          externalVariantId: 'variant-7',
          quantity: '1.000',
          confirmedUnitPrice: '100.00',
          confirmedLineTotal: '100.00',
          stockSourceVersion: '4817',
        },
      ],
    },
  };
}

describe('ReservationOneCStatusApplier identity boundary', () => {
  it('does not fall back to a public number when the external 1C id is absent', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const confirmFromOneC = jest.fn();
    const applier = new ReservationOneCStatusApplier(
      { order: { findUnique } } as never,
      { confirmFromOneC } as never,
    );

    await expect(applier.apply(status())).rejects.toMatchObject({
      code: 'ONE_C_ORDER_IDENTITY_MISMATCH',
      retryable: false,
    });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { oneCId: '1c-order-7' } }),
    );
    expect(confirmFromOneC).not.toHaveBeenCalled();
  });
});
