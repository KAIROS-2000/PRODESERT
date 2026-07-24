import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxStatus } from '@prisma/client';
import { type Environment } from '../common/config/environment';
import { PrismaService } from '../prisma/prisma.service';
import { OUTBOX_EVENT_HANDLER, type OutboxEventHandler } from './outbox-handler';
import { retryDecision } from './retry-policy';

@Injectable()
export class OutboxProcessorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Environment, true>,
    @Inject(OUTBOX_EVENT_HANDLER) private readonly handler: OutboxEventHandler,
  ) {}

  async process(outboxEventId: string): Promise<void> {
    const event = await this.prisma.outboxEvent.findUnique({ where: { id: outboxEventId } });
    if (!event || event.status === OutboxStatus.PUBLISHED || event.status === OutboxStatus.DLQ) {
      return;
    }
    if (event.availableAt.getTime() > Date.now()) return;

    try {
      await this.handler.handle(event);
      await this.prisma.outboxEvent.updateMany({
        where: { id: event.id, status: { notIn: [OutboxStatus.PUBLISHED, OutboxStatus.DLQ] } },
        data: {
          status: OutboxStatus.PUBLISHED,
          attempts: { increment: 1 },
          publishedAt: new Date(),
          processingStartedAt: null,
          processingOwner: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          lastErrorAt: null,
        },
      });
    } catch (error: unknown) {
      const nextAttempt = event.attempts + 1;
      const decision = retryDecision(
        error,
        nextAttempt,
        this.config.get('OUTBOX_MAX_ATTEMPTS', { infer: true }),
      );
      const now = new Date();
      await this.prisma.outboxEvent.updateMany({
        where: { id: event.id, status: { notIn: [OutboxStatus.PUBLISHED, OutboxStatus.DLQ] } },
        data: decision.retry
          ? {
              status: OutboxStatus.RETRY_SCHEDULED,
              attempts: nextAttempt,
              availableAt: new Date(now.getTime() + decision.delayMs),
              processingStartedAt: null,
              processingOwner: null,
              lastErrorCode: decision.code,
              lastErrorMessage: decision.code,
              lastErrorAt: now,
            }
          : {
              status: OutboxStatus.DLQ,
              attempts: nextAttempt,
              processingStartedAt: null,
              processingOwner: null,
              deadLetteredAt: now,
              lastErrorCode: decision.code,
              lastErrorMessage: decision.code,
              lastErrorAt: now,
            },
      });
    }
  }
}
