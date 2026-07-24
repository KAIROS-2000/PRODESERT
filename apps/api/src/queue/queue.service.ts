import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  OUTBOX_QUEUE_NAME,
  type OutboxQueueJob,
  RESERVATION_QUEUE_NAME,
  type ReservationExpiryQueueJob,
} from './queue.constants';
import { RedisService } from './redis.service';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly outboxQueue: Queue<OutboxQueueJob>;
  private readonly reservationQueue: Queue<ReservationExpiryQueueJob>;

  constructor(redis: RedisService) {
    this.outboxQueue = new Queue(OUTBOX_QUEUE_NAME, {
      connection: redis.createBullConnection(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: 86_400, count: 10_000 },
        removeOnFail: false,
      },
    });
    this.reservationQueue = new Queue(RESERVATION_QUEUE_NAME, {
      connection: redis.createBullConnection(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: 86_400, count: 10_000 },
        removeOnFail: false,
      },
    });
  }

  async enqueueOutbox(
    outboxEventId: string,
    messageId: string,
    deliveryAttempt: number,
    leaseEpochMs: number,
  ): Promise<void> {
    await this.outboxQueue.add(
      'dispatch',
      { outboxEventId },
      {
        // A completed BullMQ job keeps its id for a while. A stable id per
        // delivery attempt deduplicates concurrent relays without suppressing
        // a later retry scheduled by the durable outbox.
        jobId: `${messageId}-${deliveryAttempt}-${leaseEpochMs}`,
      },
    );
  }

  async enqueueReservationExpiry(
    orderId: string,
    expiresAt: Date,
    correlationId: string,
  ): Promise<void> {
    await this.reservationQueue.add(
      'reservation.expire',
      {
        orderId,
        reservationExpiresAt: expiresAt.toISOString(),
        correlationId,
      },
      {
        jobId: `${orderId}-${expiresAt.getTime()}`,
        delay: Math.max(0, expiresAt.getTime() - Date.now()),
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.outboxQueue.close(), this.reservationQueue.close()]);
  }
}
