import { type OneCInboxReceipt } from '../dto/one-c-envelope.dto';

export const ONE_C_INBOX_REPOSITORY = Symbol('ONE_C_INBOX_REPOSITORY');

/**
 * Persistence shape for the future sync_jobs/sync_errors implementation.
 * `accept` must be a single transaction: deduplicate, compare the cursor,
 * create the inbound sync job, create a safe sync error when rejected, and
 * advance the accepted cursor.
 */
export interface OneCInboxAcceptCommand {
  readonly source: 'ONE_C';
  readonly adapter: string;
  readonly eventType: string;
  readonly messageId: string;
  readonly idempotencyKey: string;
  readonly externalEventId: string;
  readonly correlationId: string;
  readonly schemaVersion: string;
  readonly sourceRevision: string;
  readonly streamKey: string;
  readonly sequence: number;
  readonly payloadHash: string;
  /** Must be stored in protected payload storage, never copied to logs/errors. */
  readonly payload: unknown;
  readonly receivedAt: Date;
  readonly receipt: OneCInboxReceipt;
}

export type OneCInboxAcceptResult =
  | { readonly kind: 'ACCEPTED'; readonly receipt: OneCInboxReceipt }
  | { readonly kind: 'DUPLICATE'; readonly receipt: OneCInboxReceipt }
  | { readonly kind: 'CONFLICT' }
  | { readonly kind: 'STALE'; readonly currentSequence: number }
  | { readonly kind: 'GAP'; readonly expectedSequence: number };

export interface OneCInboxRepository {
  accept(command: OneCInboxAcceptCommand): Promise<OneCInboxAcceptResult>;
}

export interface SafeOneCSyncError {
  readonly code: 'IDEMPOTENCY_CONFLICT' | 'STALE_VERSION' | 'VERSION_GAP';
  readonly severity: 'ERROR' | 'CRITICAL';
  readonly eventType: string;
  readonly externalEventId: string;
  readonly correlationId: string;
  readonly retryable: false;
  readonly occurredAt: Date;
  readonly safeDetails: Readonly<Record<string, string | number>>;
}
