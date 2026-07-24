export const OutboxStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  PUBLISHED: 'PUBLISHED',
  RETRY_SCHEDULED: 'RETRY_SCHEDULED',
  DLQ: 'DLQ',
} as const;

export type OutboxStatus = (typeof OutboxStatus)[keyof typeof OutboxStatus];

export const SyncDirection = {
  INBOUND: 'INBOUND',
  OUTBOUND: 'OUTBOUND',
} as const;

export type SyncDirection = (typeof SyncDirection)[keyof typeof SyncDirection];

export const SyncJobStatus = {
  RECEIVED: 'RECEIVED',
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  APPLIED: 'APPLIED',
  RETRY_SCHEDULED: 'RETRY_SCHEDULED',
  REJECTED: 'REJECTED',
  DLQ: 'DLQ',
} as const;

export type SyncJobStatus = (typeof SyncJobStatus)[keyof typeof SyncJobStatus];

export const SyncErrorSeverity = {
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL',
} as const;

export type SyncErrorSeverity = (typeof SyncErrorSeverity)[keyof typeof SyncErrorSeverity];

export interface IntegrationEnvelope<TPayload> {
  readonly schemaVersion: string;
  readonly messageId: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly idempotencyKey: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly payload: TPayload;
}

export interface OutboxEventView<TPayload = unknown> {
  readonly id: string;
  readonly messageId: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly schemaVersion: string;
  readonly payload: TPayload;
  readonly payloadHash: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly status: OutboxStatus;
  readonly attempts: number;
  readonly availableAt: string;
  readonly processingStartedAt: string | null;
  readonly processingOwner: string | null;
  readonly publishedAt: string | null;
  readonly deadLetteredAt: string | null;
  readonly lastErrorCode: string | null;
  readonly lastErrorMessage: string | null;
  readonly lastErrorAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SyncJobView {
  readonly id: string;
  readonly direction: SyncDirection;
  readonly eventType: string;
  readonly adapter: string;
  readonly messageId: string;
  readonly externalEventId: string | null;
  readonly internalEntityId: string | null;
  readonly externalEntityId: string | null;
  readonly entityKey: string | null;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly schemaVersion: string;
  readonly sourceRevision: string | null;
  readonly payloadHash: string;
  readonly status: SyncJobStatus;
  readonly attempts: number;
  readonly availableAt: string;
  readonly receivedAt: string;
  readonly processingStartedAt: string | null;
  readonly processedAt: string | null;
  readonly nextRetryAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SyncErrorView {
  readonly id: string;
  readonly syncJobId: string;
  readonly severity: SyncErrorSeverity;
  readonly code: string;
  readonly sanitizedMessage: string;
  readonly entityType: string | null;
  readonly externalEntityId: string | null;
  readonly retryable: boolean;
  readonly httpStatus: number | null;
  readonly details: unknown | null;
  readonly occurredAt: string;
  readonly resolvedAt: string | null;
  readonly resolvedBy: string | null;
  readonly resolution: string | null;
}

export interface IntegrationCursorView {
  readonly adapter: string;
  readonly direction: SyncDirection;
  readonly entityType: string;
  readonly entityKey: string;
  readonly currentVersion: string;
  readonly lastMessageId: string | null;
  readonly lastPayloadHash: string | null;
  readonly asOf: string | null;
  readonly updatedAt: string;
}

export interface IntegrationErrorResponse {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly correlationId: string;
  readonly details?: readonly {
    readonly path: string;
    readonly reason: string;
  }[];
}
