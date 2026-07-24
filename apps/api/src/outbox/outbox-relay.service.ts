import { hostname } from 'node:os';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxStatus } from '@prisma/client';
import { type Environment } from '../common/config/environment';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class OutboxRelayService {
  private readonly owner = `${hostname()}:${process.pid}`;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  async relayBatch(limit = 100): Promise<number> {
    const now = new Date();
    const processingDeadline = new Date(
      now.getTime() - this.config.get('OUTBOX_PROCESSING_TIMEOUT_SECONDS', { infer: true }) * 1_000,
    );
    await this.prisma.outboxEvent.updateMany({
      where: {
        status: OutboxStatus.PROCESSING,
        processingStartedAt: { lt: processingDeadline },
      },
      data: {
        status: OutboxStatus.RETRY_SCHEDULED,
        availableAt: now,
        processingStartedAt: null,
        processingOwner: null,
        lastErrorCode: 'PROCESSING_LEASE_EXPIRED',
        lastErrorMessage: 'PROCESSING_LEASE_EXPIRED',
        lastErrorAt: now,
      },
    });

    const events = await this.prisma.outboxEvent.findMany({
      where: {
        status: { in: [OutboxStatus.PENDING, OutboxStatus.RETRY_SCHEDULED] },
        availableAt: { lte: now },
      },
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
      take: Math.min(500, Math.max(1, limit)),
      select: { id: true, messageId: true, attempts: true },
    });
    let enqueued = 0;
    for (const event of events) {
      const leaseStartedAt = new Date();
      const claimed = await this.prisma.outboxEvent.updateMany({
        where: {
          id: event.id,
          status: { in: [OutboxStatus.PENDING, OutboxStatus.RETRY_SCHEDULED] },
          availableAt: { lte: now },
        },
        data: {
          status: OutboxStatus.PROCESSING,
          processingStartedAt: leaseStartedAt,
          processingOwner: this.owner,
        },
      });
      if (claimed.count === 0) continue;
      try {
        await this.queue.enqueueOutbox(
          event.id,
          event.messageId,
          event.attempts,
          leaseStartedAt.getTime(),
        );
        enqueued += 1;
      } catch (error: unknown) {
        await this.prisma.outboxEvent.updateMany({
          where: {
            id: event.id,
            status: OutboxStatus.PROCESSING,
            processingOwner: this.owner,
            processingStartedAt: leaseStartedAt,
          },
          data: {
            status: OutboxStatus.RETRY_SCHEDULED,
            availableAt: new Date(),
            processingStartedAt: null,
            processingOwner: null,
            lastErrorCode: 'QUEUE_UNAVAILABLE',
            lastErrorMessage: 'QUEUE_UNAVAILABLE',
            lastErrorAt: new Date(),
          },
        });
        throw error;
      }
    }
    return enqueued;
  }
}
