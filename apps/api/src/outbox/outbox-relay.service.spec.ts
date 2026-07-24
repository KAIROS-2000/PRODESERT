import { OutboxStatus } from '@prisma/client';
import { OutboxRelayService } from './outbox-relay.service';

describe('OutboxRelayService', () => {
  const now = new Date('2026-07-25T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers({ now });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('claims an event before enqueueing a lease-specific delivery', async () => {
    const prisma = {
      outboxEvent: {
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 0 })
          .mockResolvedValueOnce({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'event-id',
            messageId: 'message-id',
            attempts: 2,
          },
        ]),
      },
    };
    const queue = { enqueueOutbox: jest.fn().mockResolvedValue(undefined) };
    const config = { get: jest.fn().mockReturnValue(300) };
    const relay = new OutboxRelayService(prisma as never, queue as never, config as never);

    await expect(relay.relayBatch()).resolves.toBe(1);
    expect(queue.enqueueOutbox).toHaveBeenCalledWith('event-id', 'message-id', 2, now.getTime());
  });

  it('releases the processing lease immediately when Redis enqueue fails', async () => {
    const prisma = {
      outboxEvent: {
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 0 })
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'event-id',
            messageId: 'message-id',
            attempts: 0,
          },
        ]),
      },
    };
    const queue = { enqueueOutbox: jest.fn().mockRejectedValue(new Error('redis unavailable')) };
    const config = { get: jest.fn().mockReturnValue(300) };
    const relay = new OutboxRelayService(prisma as never, queue as never, config as never);

    await expect(relay.relayBatch()).rejects.toThrow('redis unavailable');
    expect(prisma.outboxEvent.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OutboxStatus.RETRY_SCHEDULED,
          lastErrorCode: 'QUEUE_UNAVAILABLE',
          processingStartedAt: null,
          processingOwner: null,
        }),
      }),
    );
  });
});
