import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OneCOrderStatusEnvelopeDto } from './one-c-order-status.dto';

function validEnvelope(): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: '1.0',
    messageId: '550e8400-e29b-41d4-a716-446655440000',
    eventType: 'order.status.updated',
    occurredAt: '2026-07-18T06:30:00.000Z',
    source: 'ONE_C',
    correlationId: '9716f8ee-a989-4f1e-9e9c-c3267c55f768',
    idempotencyKey: 'one-c:order:event:27',
    sourceRevision: '27',
    payload: {
      externalOrderId: '1c-order-27',
      publicNumber: 'PD-20260718-ABCDEF12',
      eventId: '1c-order-27:event:27',
      orderVersion: 27,
      status: 'AWAITING_PAYMENT',
      confirmedTotal: '3500.00',
      currency: 'RUB',
      reservation: {
        externalReservationId: 'reservation-27',
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
          externalVariantId: 'variant-1',
          quantity: '2.000',
          confirmedUnitPrice: '1750.00',
          confirmedLineTotal: '3500.00',
          stockSourceVersion: '4817',
        },
      ],
    },
  };
}

async function errors(value: Readonly<Record<string, unknown>>): Promise<number> {
  const instance = plainToInstance(OneCOrderStatusEnvelopeDto, value);
  return (
    await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: false,
    })
  ).length;
}

describe('OneCOrderStatusEnvelopeDto', () => {
  it('accepts the v1 status envelope with decimal strings and consistent facts', async () => {
    await expect(errors(validEnvelope())).resolves.toBe(0);
  });

  it('rejects an unsupported status, numeric quantity, and inconsistent payment fact', async () => {
    const source = validEnvelope();
    const payload = source.payload as Readonly<Record<string, unknown>>;
    const invalid = {
      ...source,
      payload: {
        ...payload,
        status: 'UNKNOWN',
        payment: {
          status: 'CONFIRMED',
          confirmedAt: null,
          externalPaymentId: null,
        },
        lines: [
          {
            externalVariantId: 'variant-1',
            quantity: 2,
            confirmedUnitPrice: '1750.00',
            confirmedLineTotal: '3500.00',
          },
        ],
      },
    };
    await expect(errors(invalid)).resolves.toBeGreaterThan(0);
  });
});
