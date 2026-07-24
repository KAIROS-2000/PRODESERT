import { HttpException } from '@nestjs/common';
import {
  ONE_C_ORDER_STATUS_EVENT,
  type OneCOrderStatusEnvelopeDto,
} from '../dto/one-c-order-status.dto';
import { InMemoryOneCInboxRepository } from './in-memory-one-c-inbox.repository';
import { OneCInboxService } from './one-c-inbox.service';

function envelope(
  version: number,
  suffix: string,
  overrides: {
    idempotencyKey?: string;
    confirmedTotal?: string;
    publicNumber?: string;
  } = {},
): OneCOrderStatusEnvelopeDto {
  return {
    schemaVersion: '1.0',
    messageId: `0190f3ad-f42e-7b74-8a54-a78f0d6${suffix.padStart(3, '0')}`,
    eventType: ONE_C_ORDER_STATUS_EVENT,
    occurredAt: '2026-07-18T06:30:00.000Z',
    source: 'ONE_C',
    correlationId: '0190f3ad-f47a-7e0c-8505-3daf412e71ff',
    idempotencyKey: overrides.idempotencyKey ?? `one-c:order:event:${suffix}`,
    sourceRevision: String(version),
    payload: {
      externalOrderId: '1c-order-00009142',
      publicNumber: overrides.publicNumber ?? 'PD-20260718-ABCDEF12',
      eventId: `1c-order-00009142:event:${suffix}`,
      orderVersion: version,
      status: 'AWAITING_PAYMENT',
      confirmedTotal: overrides.confirmedTotal ?? '3500.00',
      currency: 'RUB',
      reservation: {
        externalReservationId: 'reserve-009142',
        status: 'ACTIVE',
        expiresAt: '2026-07-19T06:30:00.000Z',
      },
      payment: { status: 'NOT_PAID', confirmedAt: null, externalPaymentId: null },
      lines: [
        {
          externalVariantId: 'variant-id',
          quantity: '2',
          confirmedUnitPrice: '1750.00',
          confirmedLineTotal: '3500.00',
          stockSourceVersion: '4817',
        },
      ],
      comment: 'Наличие подтверждено',
    },
  };
}

function exceptionCode(error: unknown): string | undefined {
  if (!(error instanceof HttpException)) {
    return undefined;
  }
  const response = error.getResponse();
  return typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    typeof response.code === 'string'
    ? response.code
    : undefined;
}

describe('OneCInboxService', () => {
  it('returns the persisted receipt for an exact duplicate', async () => {
    const repository = new InMemoryOneCInboxRepository();
    const service = new OneCInboxService(repository);
    const event = envelope(7, '27');
    const first = await service.acceptOrderStatus(event);
    const duplicate = await service.acceptOrderStatus(event);
    expect(duplicate).toEqual(first);
    expect(repository.errors).toHaveLength(0);
  });

  it('rejects the same idempotency identity with a different payload', async () => {
    const repository = new InMemoryOneCInboxRepository();
    const service = new OneCInboxService(repository);
    const first = envelope(7, '27');
    await service.acceptOrderStatus(first);
    const conflicting = envelope(7, '28', {
      idempotencyKey: first.idempotencyKey,
      confirmedTotal: '3501.00',
    });

    try {
      await service.acceptOrderStatus(conflicting);
      throw new Error('expected an idempotency conflict');
    } catch (error: unknown) {
      expect(exceptionCode(error)).toBe('IDEMPOTENCY_CONFLICT');
    }
    expect(repository.errors.at(-1)?.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('rejects an event older than the accepted stream cursor', async () => {
    const repository = new InMemoryOneCInboxRepository();
    const service = new OneCInboxService(repository);
    await service.acceptOrderStatus(envelope(7, '27'));

    try {
      await service.acceptOrderStatus(envelope(6, '26'));
      throw new Error('expected a stale version');
    } catch (error: unknown) {
      expect(exceptionCode(error)).toBe('STALE_VERSION');
    }
    expect(repository.errors.at(-1)).toMatchObject({
      code: 'STALE_VERSION',
      retryable: false,
      safeDetails: { incomingSequence: 6, currentSequence: 7 },
    });
  });
});
