import {
  type OneCInboxAcceptCommand,
  type OneCInboxAcceptResult,
  type OneCInboxRepository,
  type SafeOneCSyncError,
} from './one-c-inbox.repository';

interface StoredInboxJob {
  readonly identity: string;
  readonly messageId: string;
  readonly externalEventId: string;
  readonly payloadHash: string;
  readonly receipt: OneCInboxAcceptCommand['receipt'];
}

/**
 * Deterministic adapter for contract tests and local mock mode.
 * Map operations do not cross an await boundary, so each accept is atomic in
 * one Node.js process. It is intentionally not a production persistence layer.
 */
export class InMemoryOneCInboxRepository implements OneCInboxRepository {
  private readonly jobsByIdentity = new Map<string, StoredInboxJob>();
  private readonly jobsByMessageId = new Map<string, StoredInboxJob>();
  private readonly jobsByExternalEventId = new Map<string, StoredInboxJob>();
  private readonly cursorByStream = new Map<string, number>();
  private readonly recordedErrors: SafeOneCSyncError[] = [];

  get errors(): readonly SafeOneCSyncError[] {
    return [...this.recordedErrors];
  }

  async accept(command: OneCInboxAcceptCommand): Promise<OneCInboxAcceptResult> {
    const identity = `${command.source}:${command.eventType}:${command.idempotencyKey}`;
    const existing =
      this.jobsByIdentity.get(identity) ??
      this.jobsByMessageId.get(command.messageId) ??
      this.jobsByExternalEventId.get(command.externalEventId);
    if (existing !== undefined) {
      if (existing.identity === identity && existing.payloadHash === command.payloadHash) {
        return { kind: 'DUPLICATE', receipt: existing.receipt };
      }
      this.recordError(command, 'IDEMPOTENCY_CONFLICT', 'CRITICAL', {
        streamKey: command.streamKey,
      });
      return { kind: 'CONFLICT' };
    }

    const currentSequence = this.cursorByStream.get(command.streamKey);
    if (currentSequence !== undefined && command.sequence <= currentSequence) {
      this.recordError(command, 'STALE_VERSION', 'ERROR', {
        incomingSequence: command.sequence,
        currentSequence,
      });
      return { kind: 'STALE', currentSequence };
    }
    if (currentSequence !== undefined && command.sequence !== currentSequence + 1) {
      const expectedSequence = currentSequence + 1;
      this.recordError(command, 'VERSION_GAP', 'ERROR', {
        incomingSequence: command.sequence,
        expectedSequence,
      });
      return { kind: 'GAP', expectedSequence };
    }

    const job: StoredInboxJob = {
      identity,
      messageId: command.messageId,
      externalEventId: command.externalEventId,
      payloadHash: command.payloadHash,
      receipt: command.receipt,
    };
    this.jobsByIdentity.set(identity, job);
    this.jobsByMessageId.set(command.messageId, job);
    this.jobsByExternalEventId.set(command.externalEventId, job);
    this.cursorByStream.set(command.streamKey, command.sequence);
    return { kind: 'ACCEPTED', receipt: command.receipt };
  }

  private recordError(
    command: OneCInboxAcceptCommand,
    code: SafeOneCSyncError['code'],
    severity: SafeOneCSyncError['severity'],
    safeDetails: SafeOneCSyncError['safeDetails'],
  ): void {
    this.recordedErrors.push({
      code,
      severity,
      eventType: command.eventType,
      externalEventId: command.externalEventId,
      correlationId: command.correlationId,
      retryable: false,
      occurredAt: command.receivedAt,
      safeDetails,
    });
  }
}
