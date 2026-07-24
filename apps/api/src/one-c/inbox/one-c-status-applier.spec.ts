import { Prisma } from '@prisma/client';
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
      { applyFromOneC: jest.fn() } as never,
      { confirmFromOneC: jest.fn() } as never,
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

  it('routes only an explicit CONFIRMED payment fact from 1C through PaymentService', async () => {
    const identityOrder = {
      id: 'order-7',
      oneCId: '1c-order-7',
      oneCVersion: 6,
      publicNumber: 'PD-7',
      pickupLocationId: 'pickup-1',
      status: 'PAYMENT_VERIFICATION',
      currency: 'RUB',
      grandTotal: new Prisma.Decimal('100.00'),
      reservationExpiresAt: new Date('2026-07-20T06:30:00.000Z'),
    };
    const commercialOrder = {
      currency: 'RUB',
      grandTotal: new Prisma.Decimal('100.00'),
      items: [
        {
          oneCVariantId: 'variant-7',
          quantity: new Prisma.Decimal('1.000'),
          unitPrice: new Prisma.Decimal('100.00'),
          lineTotal: new Prisma.Decimal('100.00'),
        },
      ],
    };
    const findUnique = jest
      .fn()
      .mockImplementation(({ where }: { where: object }) =>
        'oneCId' in where ? Promise.resolve(identityOrder) : Promise.resolve(commercialOrder),
      );
    const reservationConfirmation = jest.fn();
    const extensionAck = jest.fn();
    const paymentConfirmation = jest.fn().mockResolvedValue(undefined);
    const applier = new ReservationOneCStatusApplier(
      { order: { findUnique } } as never,
      { confirmFromOneC: reservationConfirmation } as never,
      { applyFromOneC: extensionAck } as never,
      { confirmFromOneC: paymentConfirmation } as never,
    );
    const command = status();
    command.payload.status = 'PAID';
    command.payload.payment = {
      status: 'CONFIRMED',
      confirmedAt: '2026-07-19T05:15:00.000Z',
      externalPaymentId: 'bank-payment-42',
    };

    await applier.apply(command);

    expect(paymentConfirmation).toHaveBeenCalledTimes(1);
    expect(paymentConfirmation).toHaveBeenCalledWith({
      orderId: 'order-7',
      oneCVersion: 7,
      externalPaymentId: 'bank-payment-42',
      confirmedAt: new Date('2026-07-19T05:15:00.000Z'),
      confirmedTotal: '100.00',
      currency: 'RUB',
      correlationId: command.correlationId,
      eventId: 'event-7',
    });
    expect(reservationConfirmation).not.toHaveBeenCalled();
    expect(extensionAck).not.toHaveBeenCalled();
  });

  it('never treats a NOT_PAID 1C fact as payment confirmation', async () => {
    const paymentConfirmation = jest.fn();
    const command = status();
    command.payload.status = 'PAYMENT_VERIFICATION';
    const applier = new ReservationOneCStatusApplier(
      {
        order: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'order-7',
            oneCId: '1c-order-7',
            oneCVersion: 6,
            publicNumber: 'PD-7',
            pickupLocationId: 'pickup-1',
            status: 'PAYMENT_VERIFICATION',
            currency: 'RUB',
            grandTotal: new Prisma.Decimal('100.00'),
            reservationExpiresAt: new Date('2026-07-20T06:30:00.000Z'),
          }),
        },
      } as never,
      { confirmFromOneC: jest.fn() } as never,
      { applyFromOneC: jest.fn() } as never,
      { confirmFromOneC: paymentConfirmation } as never,
    );

    await expect(applier.apply(command)).rejects.toMatchObject({
      code: 'ONE_C_STATUS_NOT_SUPPORTED',
      retryable: false,
    });
    expect(paymentConfirmation).not.toHaveBeenCalled();
  });
});
