import { Injectable } from '@nestjs/common';
import {
  Prisma,
  SyncDirection,
  SyncErrorSeverity,
  SyncJobStatus,
  type SyncError,
  type SyncJob,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { type OneCInboxReceipt } from '../dto/one-c-envelope.dto';
import {
  type OneCInboxAcceptCommand,
  type OneCInboxAcceptResult,
  type OneCInboxRepository,
  type SafeOneCSyncError,
} from './one-c-inbox.repository';

type InboxTransaction = Prisma.TransactionClient;
type ExistingJob = SyncJob & { readonly errors: readonly SyncError[] };

const ERROR_MESSAGES: Readonly<Record<SafeOneCSyncError['code'], string>> = {
  IDEMPOTENCY_CONFLICT: 'Integration identity is associated with another payload.',
  STALE_VERSION: 'Inbound entity version is stale.',
  VERSION_GAP: 'Inbound entity version contains a gap.',
};

/**
 * Durable inbox with one serializable transaction for deduplication, stream
 * cursor validation, job/error persistence and cursor advancement.
 */
@Injectable()
export class PrismaOneCInboxRepository implements OneCInboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  accept(command: OneCInboxAcceptCommand): Promise<OneCInboxAcceptResult> {
    return this.withSerializableRetry(() =>
      this.prisma.$transaction((transaction) => this.acceptInTransaction(transaction, command), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }),
    );
  }

  private async acceptInTransaction(
    transaction: InboxTransaction,
    command: OneCInboxAcceptCommand,
  ): Promise<OneCInboxAcceptResult> {
    const existing = await transaction.syncJob.findMany({
      where: {
        OR: [
          { messageId: command.messageId },
          {
            adapter: command.adapter,
            direction: SyncDirection.INBOUND,
            externalEventId: command.externalEventId,
          },
          {
            adapter: command.adapter,
            direction: SyncDirection.INBOUND,
            eventType: command.eventType,
            idempotencyKey: command.idempotencyKey,
          },
        ],
      },
      include: { errors: { orderBy: { occurredAt: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'asc' },
    });
    if (existing.length > 0) {
      const conflictingJob = existing[0];
      if (!conflictingJob) {
        throw new Error('INBOX_IDENTITY_LOOKUP_INCONSISTENT');
      }
      const exact = existing.find((job) => this.isExactIdentity(job, command));
      if (exact && existing.length === 1) {
        if (exact.status === SyncJobStatus.REJECTED) {
          return this.reconsiderRejected(transaction, exact, command);
        }
        return this.duplicateResult(exact);
      }
      await this.recordError(
        transaction,
        conflictingJob,
        command,
        'IDEMPOTENCY_CONFLICT',
        'CRITICAL',
        { streamKey: command.streamKey },
      );
      return { kind: 'CONFLICT' };
    }

    await transaction.$queryRaw(
      Prisma.sql`
        SELECT id
        FROM integration_cursors
        WHERE adapter = ${command.adapter}
          AND direction = 'INBOUND'::"SyncDirection"
          AND entity_type = ${command.eventType}
          AND entity_key = ${command.streamKey}
        FOR UPDATE
      `,
    );
    const cursor = await transaction.integrationCursor.findFirst({
      where: {
        adapter: command.adapter,
        direction: SyncDirection.INBOUND,
        entityType: command.eventType,
        entityKey: command.streamKey,
      },
    });
    const currentSequence = cursor ? this.parseCursor(cursor.currentVersion) : undefined;
    if (currentSequence !== undefined && command.sequence <= currentSequence) {
      const job = await this.createRejectedJob(transaction, command);
      await this.recordError(transaction, job, command, 'STALE_VERSION', 'ERROR', {
        incomingSequence: command.sequence,
        currentSequence,
      });
      return { kind: 'STALE', currentSequence };
    }
    if (currentSequence !== undefined && command.sequence !== currentSequence + 1) {
      const expectedSequence = currentSequence + 1;
      const job = await this.createRejectedJob(transaction, command);
      await this.recordError(transaction, job, command, 'VERSION_GAP', 'ERROR', {
        incomingSequence: command.sequence,
        expectedSequence,
      });
      return { kind: 'GAP', expectedSequence };
    }

    await transaction.syncJob.create({
      data: this.jobData(command, SyncJobStatus.QUEUED),
    });
    if (cursor) {
      await transaction.integrationCursor.update({
        where: { id: cursor.id },
        data: {
          currentVersion: String(command.sequence),
          lastMessageId: command.messageId,
          lastPayloadHash: command.payloadHash,
          asOf: command.receivedAt,
        },
      });
    } else {
      await transaction.integrationCursor.create({
        data: {
          adapter: command.adapter,
          direction: SyncDirection.INBOUND,
          entityType: command.eventType,
          entityKey: command.streamKey,
          currentVersion: String(command.sequence),
          lastMessageId: command.messageId,
          lastPayloadHash: command.payloadHash,
          asOf: command.receivedAt,
        },
      });
    }
    return { kind: 'ACCEPTED', receipt: command.receipt };
  }

  private isExactIdentity(job: ExistingJob, command: OneCInboxAcceptCommand): boolean {
    return (
      job.direction === SyncDirection.INBOUND &&
      job.adapter === command.adapter &&
      job.eventType === command.eventType &&
      job.messageId === command.messageId &&
      job.externalEventId === command.externalEventId &&
      job.idempotencyKey === command.idempotencyKey &&
      job.payloadHash === command.payloadHash
    );
  }

  private duplicateResult(job: ExistingJob): OneCInboxAcceptResult {
    return { kind: 'DUPLICATE', receipt: this.receiptFromJob(job) };
  }

  private async reconsiderRejected(
    transaction: InboxTransaction,
    job: ExistingJob,
    command: OneCInboxAcceptCommand,
  ): Promise<OneCInboxAcceptResult> {
    const error = job.errors[0];
    if (!error || !['STALE_VERSION', 'VERSION_GAP'].includes(error.code)) {
      return { kind: 'CONFLICT' };
    }
    await transaction.$queryRaw(
      Prisma.sql`
        SELECT id
        FROM integration_cursors
        WHERE adapter = ${command.adapter}
          AND direction = 'INBOUND'::"SyncDirection"
          AND entity_type = ${command.eventType}
          AND entity_key = ${command.streamKey}
        FOR UPDATE
      `,
    );
    const cursor = await transaction.integrationCursor.findFirst({
      where: {
        adapter: command.adapter,
        direction: SyncDirection.INBOUND,
        entityType: command.eventType,
        entityKey: command.streamKey,
      },
    });
    if (!cursor) {
      throw new Error('INTEGRATION_CURSOR_CORRUPTED');
    }
    const currentSequence = this.parseCursor(cursor.currentVersion);
    if (command.sequence <= currentSequence) {
      return { kind: 'STALE', currentSequence };
    }
    const expectedSequence = currentSequence + 1;
    if (command.sequence !== expectedSequence || error.code !== 'VERSION_GAP') {
      return { kind: 'GAP', expectedSequence };
    }

    const recoveredAt = new Date();
    await transaction.syncJob.update({
      where: { id: job.id },
      data: {
        status: SyncJobStatus.QUEUED,
        availableAt: recoveredAt,
        processedAt: null,
        processingStartedAt: null,
        nextRetryAt: null,
      },
    });
    await transaction.integrationCursor.update({
      where: { id: cursor.id },
      data: {
        currentVersion: String(command.sequence),
        lastMessageId: command.messageId,
        lastPayloadHash: command.payloadHash,
        asOf: recoveredAt,
      },
    });
    await transaction.syncError.update({
      where: { id: error.id },
      data: {
        resolvedAt: recoveredAt,
        resolvedBy: 'SYSTEM',
        resolution: 'Missing stream version arrived; the durable job was requeued.',
      },
    });
    return { kind: 'ACCEPTED', receipt: this.receiptFromJob(job) };
  }

  private receiptFromJob(job: ExistingJob): OneCInboxReceipt {
    return {
      messageId: job.messageId,
      correlationId: job.correlationId,
      status: 'ACCEPTED',
      receivedAt: job.receivedAt.toISOString(),
      results: job.externalEventId ? [{ externalId: job.externalEventId, status: 'QUEUED' }] : [],
    };
  }

  private async createRejectedJob(
    transaction: InboxTransaction,
    command: OneCInboxAcceptCommand,
  ): Promise<SyncJob> {
    return transaction.syncJob.create({
      data: this.jobData(command, SyncJobStatus.REJECTED),
    });
  }

  private jobData(
    command: OneCInboxAcceptCommand,
    status: typeof SyncJobStatus.QUEUED | typeof SyncJobStatus.REJECTED,
  ): Prisma.SyncJobUncheckedCreateInput {
    return {
      direction: SyncDirection.INBOUND,
      eventType: command.eventType,
      adapter: command.adapter,
      messageId: command.messageId,
      externalEventId: command.externalEventId,
      entityKey: command.streamKey,
      idempotencyKey: command.idempotencyKey,
      correlationId: command.correlationId,
      schemaVersion: command.schemaVersion,
      sourceRevision: command.sourceRevision,
      sourceSequence: command.sequence,
      payloadHash: command.payloadHash,
      payload: this.jsonValue(command.payload),
      status,
      receivedAt: command.receivedAt,
      ...(status === SyncJobStatus.REJECTED ? { processedAt: command.receivedAt } : {}),
    };
  }

  private async recordError(
    transaction: InboxTransaction,
    job: Pick<SyncJob, 'id'>,
    command: OneCInboxAcceptCommand,
    code: SafeOneCSyncError['code'],
    severity: SafeOneCSyncError['severity'],
    details: SafeOneCSyncError['safeDetails'],
  ): Promise<void> {
    await transaction.syncError.create({
      data: {
        syncJobId: job.id,
        severity: severity === 'CRITICAL' ? SyncErrorSeverity.CRITICAL : SyncErrorSeverity.ERROR,
        code,
        sanitizedMessage: ERROR_MESSAGES[code],
        entityType: 'order',
        externalEntityId: command.externalEventId,
        retryable: false,
        details: this.jsonValue(details),
        occurredAt: command.receivedAt,
      },
    });
  }

  private jsonValue(value: unknown): Prisma.InputJsonValue {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new TypeError('Inbox payload is not JSON serializable');
    }
    return JSON.parse(serialized) as Prisma.InputJsonValue;
  }

  private parseCursor(value: string): number {
    if (!/^(?:0|[1-9]\d*)$/.test(value)) {
      throw new Error('INTEGRATION_CURSOR_CORRUPTED');
    }
    const sequence = Number(value);
    if (!Number.isSafeInteger(sequence)) {
      throw new Error('INTEGRATION_CURSOR_CORRUPTED');
    }
    return sequence;
  }

  private async withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await operation();
      } catch (error: unknown) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !['P2002', 'P2034'].includes(error.code) ||
          attempt === 3
        ) {
          throw error;
        }
      }
    }
    throw new Error('unreachable');
  }
}
