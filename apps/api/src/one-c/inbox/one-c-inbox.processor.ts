import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  SyncDirection,
  SyncErrorSeverity,
  SyncJobStatus,
  type SyncJob,
} from '@prisma/client';
import { type Environment } from '../../common/config/environment';
import { retryDecision } from '../../outbox/retry-policy';
import { PrismaService } from '../../prisma/prisma.service';
import { type OneCOrderStatusPayloadDto } from '../dto/one-c-order-status.dto';
import {
  ONE_C_STATUS_APPLIER,
  type OneCAcceptedOrderStatus,
  type OneCStatusApplier,
} from './one-c-status-applier';

export type OneCInboxProcessStatus =
  | 'APPLIED'
  | 'ALREADY_APPLIED'
  | 'BUSY'
  | 'BLOCKED_BY_EARLIER_VERSION'
  | 'DEFERRED'
  | 'REJECTED'
  | 'RETRY_SCHEDULED'
  | 'DLQ'
  | 'NOT_FOUND';

export interface OneCInboxProcessResult {
  readonly messageId: string;
  readonly status: OneCInboxProcessStatus;
  readonly code?: string;
}

export interface OneCInboxBatchResult {
  readonly discovered: number;
  readonly results: readonly OneCInboxProcessResult[];
}

@Injectable()
export class OneCInboxProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Environment, true>,
    @Inject(ONE_C_STATUS_APPLIER) private readonly applier: OneCStatusApplier,
  ) {}

  /**
   * Claims and applies one durable message. A stale PROCESSING claim is
   * recoverable after OUTBOX_PROCESSING_TIMEOUT_SECONDS.
   */
  async process(messageId: string): Promise<OneCInboxProcessResult> {
    const claimed = await this.prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`
          SELECT id FROM sync_jobs
          WHERE message_id = ${messageId}
            AND direction = 'INBOUND'::"SyncDirection"
          FOR UPDATE
        `;
        const job = await transaction.syncJob.findUnique({ where: { messageId } });
        if (!job || job.direction !== SyncDirection.INBOUND) {
          return { kind: 'RESULT' as const, status: 'NOT_FOUND' as const };
        }
        if (job.status === SyncJobStatus.APPLIED) {
          return { kind: 'RESULT' as const, status: 'ALREADY_APPLIED' as const };
        }
        if (job.status === SyncJobStatus.REJECTED) {
          return { kind: 'RESULT' as const, status: 'REJECTED' as const };
        }
        if (job.status === SyncJobStatus.DLQ) {
          return { kind: 'RESULT' as const, status: 'DLQ' as const };
        }

        const now = new Date();
        const staleBefore = new Date(
          now.getTime() -
            this.config.get('OUTBOX_PROCESSING_TIMEOUT_SECONDS', { infer: true }) * 1_000,
        );
        if (
          job.status === SyncJobStatus.PROCESSING &&
          job.processingStartedAt &&
          job.processingStartedAt > staleBefore
        ) {
          return { kind: 'RESULT' as const, status: 'BUSY' as const };
        }
        if (
          (job.status === SyncJobStatus.RETRY_SCHEDULED || job.status === SyncJobStatus.QUEUED) &&
          job.availableAt > now
        ) {
          return { kind: 'RESULT' as const, status: 'DEFERRED' as const };
        }
        if (job.entityKey && (await this.hasEarlierPending(transaction, job))) {
          return {
            kind: 'RESULT' as const,
            status: 'BLOCKED_BY_EARLIER_VERSION' as const,
          };
        }

        const updated = await transaction.syncJob.update({
          where: { id: job.id },
          data: {
            status: SyncJobStatus.PROCESSING,
            attempts: { increment: 1 },
            processingStartedAt: now,
            nextRetryAt: null,
          },
        });
        return { kind: 'CLAIMED' as const, job: updated };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
    if (claimed.kind === 'RESULT') {
      return { messageId, status: claimed.status };
    }

    try {
      await this.applier.apply(this.applicationCommand(claimed.job));
      await this.prisma.syncJob.updateMany({
        where: { id: claimed.job.id, status: SyncJobStatus.PROCESSING },
        data: {
          status: SyncJobStatus.APPLIED,
          processedAt: new Date(),
          processingStartedAt: null,
          nextRetryAt: null,
        },
      });
      return { messageId, status: 'APPLIED' };
    } catch (error: unknown) {
      return this.recordFailure(claimed.job, error);
    }
  }

  /**
   * Polling entrypoint for the worker. Only the oldest non-terminal message of
   * each order stream is eligible, preserving application order after crashes.
   */
  async processQueued(limit = 25): Promise<OneCInboxBatchResult> {
    const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const staleBefore = new Date(
      Date.now() - this.config.get('OUTBOX_PROCESSING_TIMEOUT_SECONDS', { infer: true }) * 1_000,
    );
    const candidates = await this.prisma.$queryRaw<{ messageId: string }[]>(
      Prisma.sql`
        SELECT candidate.message_id AS "messageId"
        FROM sync_jobs candidate
        WHERE candidate.direction = 'INBOUND'::"SyncDirection"
          AND candidate.event_type = 'order.status.updated'
          AND candidate.source_sequence IS NOT NULL
          AND (
            (
              candidate.status IN (
                'RECEIVED'::"SyncJobStatus",
                'QUEUED'::"SyncJobStatus",
                'RETRY_SCHEDULED'::"SyncJobStatus"
              )
              AND candidate.available_at <= now()
            )
            OR (
              candidate.status = 'PROCESSING'::"SyncJobStatus"
              AND candidate.processing_started_at <= ${staleBefore}
            )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM sync_jobs earlier
            WHERE earlier.direction = candidate.direction
              AND earlier.adapter = candidate.adapter
              AND earlier.event_type = candidate.event_type
              AND earlier.entity_key = candidate.entity_key
              AND earlier.source_sequence < candidate.source_sequence
              AND earlier.status IN (
                'RECEIVED'::"SyncJobStatus",
                'QUEUED'::"SyncJobStatus",
                'PROCESSING'::"SyncJobStatus",
                'RETRY_SCHEDULED'::"SyncJobStatus",
                'DLQ'::"SyncJobStatus"
              )
          )
        ORDER BY candidate.entity_key, candidate.source_sequence, candidate.id
        LIMIT ${boundedLimit}
      `,
    );
    const results: OneCInboxProcessResult[] = [];
    for (const candidate of candidates) {
      results.push(await this.process(candidate.messageId));
    }
    return { discovered: candidates.length, results };
  }

  private async recordFailure(job: SyncJob, error: unknown): Promise<OneCInboxProcessResult> {
    const decision = retryDecision(
      error,
      job.attempts,
      this.config.get('OUTBOX_MAX_ATTEMPTS', { infer: true }),
    );
    const now = new Date();
    const status = decision.retry ? SyncJobStatus.RETRY_SCHEDULED : SyncJobStatus.DLQ;
    const nextRetryAt = decision.retry ? new Date(now.getTime() + decision.delayMs) : null;
    await this.prisma.$transaction(async (transaction) => {
      await transaction.syncJob.updateMany({
        where: { id: job.id, status: SyncJobStatus.PROCESSING },
        data: {
          status,
          availableAt: nextRetryAt ?? now,
          nextRetryAt,
          processingStartedAt: null,
          ...(!decision.retry ? { processedAt: now } : {}),
        },
      });
      await transaction.syncError.create({
        data: {
          syncJobId: job.id,
          severity: decision.retry ? SyncErrorSeverity.ERROR : SyncErrorSeverity.CRITICAL,
          code: decision.code,
          sanitizedMessage: decision.code,
          entityType: 'order',
          externalEntityId: job.externalEntityId ?? job.externalEventId,
          retryable: decision.retry,
          details: { attempt: job.attempts },
          occurredAt: now,
        },
      });
    });
    return {
      messageId: job.messageId,
      status: decision.retry ? 'RETRY_SCHEDULED' : 'DLQ',
      code: decision.code,
    };
  }

  private applicationCommand(job: SyncJob): OneCAcceptedOrderStatus {
    if (!this.isOrderStatusPayload(job.payload) || !job.sourceRevision || !job.sourceSequence) {
      throw new Error('ONE_C_INBOX_PAYLOAD_INVALID');
    }
    return {
      syncJobId: job.id,
      messageId: job.messageId,
      correlationId: job.correlationId,
      sourceRevision: job.sourceRevision,
      payload: job.payload as unknown as OneCOrderStatusPayloadDto,
    };
  }

  private async hasEarlierPending(
    transaction: Prisma.TransactionClient,
    job: SyncJob,
  ): Promise<boolean> {
    const rows = await transaction.$queryRaw<{ present: boolean }[]>(
      Prisma.sql`
        SELECT EXISTS (
          SELECT 1
          FROM sync_jobs earlier
          WHERE earlier.direction = 'INBOUND'::"SyncDirection"
            AND earlier.adapter = ${job.adapter}
            AND earlier.event_type = ${job.eventType}
            AND earlier.entity_key = ${job.entityKey}
            AND earlier.source_sequence < ${job.sourceSequence}
            AND earlier.status IN (
              'RECEIVED'::"SyncJobStatus",
              'QUEUED'::"SyncJobStatus",
              'PROCESSING'::"SyncJobStatus",
              'RETRY_SCHEDULED'::"SyncJobStatus",
              'DLQ'::"SyncJobStatus"
            )
        ) AS present
      `,
    );
    return rows[0]?.present === true;
  }

  private isOrderStatusPayload(value: Prisma.JsonValue | null): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof value.externalOrderId === 'string' &&
      typeof value.publicNumber === 'string' &&
      typeof value.eventId === 'string' &&
      typeof value.orderVersion === 'number' &&
      typeof value.status === 'string' &&
      typeof value.confirmedTotal === 'string' &&
      value.currency === 'RUB' &&
      Array.isArray(value.lines)
    );
  }
}
