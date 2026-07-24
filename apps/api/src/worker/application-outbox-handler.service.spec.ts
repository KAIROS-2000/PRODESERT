import { type OutboxEvent } from '@prisma/client';
import { ApplicationOutboxHandler } from './application-outbox-handler.service';

describe('ApplicationOutboxHandler', () => {
  const event = {
    aggregateType: 'order',
    aggregateId: 'order-id',
    eventType: 'order.stock_confirmed',
    payload: { orderId: 'order-id', orderVersion: 2 },
    correlationId: 'correlation-id',
  } as unknown as OutboxEvent;

  it('loads the current deadline and schedules the claim-check expiry job', async () => {
    const deadline = new Date('2026-07-26T12:00:00.000Z');
    const oneC = { supports: jest.fn().mockReturnValue(false), handle: jest.fn() };
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue({ reservationExpiresAt: deadline }) },
    };
    const queue = { enqueueReservationExpiry: jest.fn().mockResolvedValue(undefined) };
    const notifications = { supports: jest.fn().mockReturnValue(false), handle: jest.fn() };
    const handler = new ApplicationOutboxHandler(
      oneC as never,
      prisma as never,
      queue as never,
      notifications as never,
    );

    await handler.handle(event);

    expect(queue.enqueueReservationExpiry).toHaveBeenCalledWith(
      'order-id',
      deadline,
      'correlation-id',
    );
  });

  it('turns a queue outage into a retryable integration failure', async () => {
    const oneC = { supports: jest.fn().mockReturnValue(false), handle: jest.fn() };
    const prisma = {
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ reservationExpiresAt: new Date('2026-07-26T12:00:00.000Z') }),
      },
    };
    const queue = {
      enqueueReservationExpiry: jest.fn().mockRejectedValue(new Error('redis unavailable')),
    };
    const notifications = { supports: jest.fn().mockReturnValue(false), handle: jest.fn() };
    const handler = new ApplicationOutboxHandler(
      oneC as never,
      prisma as never,
      queue as never,
      notifications as never,
    );

    await expect(handler.handle(event)).rejects.toMatchObject({
      code: 'RESERVATION_QUEUE_UNAVAILABLE',
      retryable: true,
    });
  });
});
