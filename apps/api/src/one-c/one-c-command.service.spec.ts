import { OutboxStatus, type OutboxEvent } from '@prisma/client';
import { type OneCAdapter } from './adapters/one-c-adapter';
import { OneCAdapterRequestError } from './adapters/rest-one-c.adapter';
import { OneCCommandService } from './one-c-command.service';

function reservationExpiredEvent(): OutboxEvent {
  const timestamp = new Date('2026-07-18T06:30:00.000Z');
  return {
    id: '550e8400-e29b-41d4-a716-446655440001',
    messageId: '550e8400-e29b-41d4-a716-446655440002',
    aggregateType: 'order',
    aggregateId: '550e8400-e29b-41d4-a716-446655440003',
    eventType: 'order.reservation_expired',
    schemaVersion: '1.0',
    payload: {
      orderId: '550e8400-e29b-41d4-a716-446655440003',
      orderVersion: 3,
    },
    payloadHash: 'a'.repeat(64),
    idempotencyKey: 'order.reservation-expired:550e8400-e29b-41d4-a716-446655440003:2',
    correlationId: '550e8400-e29b-41d4-a716-446655440004',
    causationId: null,
    status: OutboxStatus.PROCESSING,
    attempts: 0,
    availableAt: timestamp,
    processingStartedAt: timestamp,
    processingOwner: 'worker-1',
    publishedAt: null,
    deadLetteredAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    lastErrorAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe('OneCCommandService dispatch classification', () => {
  it('turns a retryable adapter 5xx into a retryable outbox dispatch error', async () => {
    const adapter = {
      kind: 'rest',
      publishOrderStatus: jest
        .fn()
        .mockRejectedValue(new OneCAdapterRequestError('SERVER', true, 503)),
    } as unknown as OneCAdapter;
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: '550e8400-e29b-41d4-a716-446655440003',
          oneCId: '1c-order-3',
          publicNumber: 'PD-3',
        }),
      },
    };
    const service = new OneCCommandService(prisma as never, adapter, {} as never);

    await expect(service.handle(reservationExpiredEvent())).rejects.toMatchObject({
      code: 'ONE_C_SERVER',
      retryable: true,
    });
  });

  it('rejects a forged claim-check before loading order data', async () => {
    const event = {
      ...reservationExpiredEvent(),
      payload: { orderId: '550e8400-e29b-41d4-a716-446655440099', orderVersion: 3 },
    };
    const prisma = { order: { findUnique: jest.fn() } };
    const adapter = { kind: 'mock' } as OneCAdapter;
    const service = new OneCCommandService(prisma as never, adapter, {} as never);

    await expect(service.handle(event)).rejects.toMatchObject({
      code: 'ONE_C_OUTBOX_CLAIM_INVALID',
      retryable: false,
    });
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });
});
