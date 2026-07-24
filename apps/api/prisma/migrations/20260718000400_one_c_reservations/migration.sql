-- Stage 4: durable 1C exchange journal, transactional outbox and stock reservations.
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'EXPIRED', 'CONSUMED');
CREATE TYPE "OutboxStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'PUBLISHED',
  'RETRY_SCHEDULED',
  'DLQ'
);
CREATE TYPE "SyncDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "SyncJobStatus" AS ENUM (
  'RECEIVED',
  'QUEUED',
  'PROCESSING',
  'APPLIED',
  'RETRY_SCHEDULED',
  'REJECTED',
  'DLQ'
);
CREATE TYPE "SyncErrorSeverity" AS ENUM ('WARNING', 'ERROR', 'CRITICAL');

ALTER TABLE "orders"
  ADD COLUMN "one_c_version" INTEGER,
  ADD COLUMN "stock_confirmed_at" TIMESTAMPTZ(3),
  ADD COLUMN "privacy_consent_version" VARCHAR(64) NOT NULL DEFAULT 'v1',
  ADD COLUMN "order_terms_consent_version" VARCHAR(64) NOT NULL DEFAULT 'v1';

CREATE TABLE "stock_reservations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "order_item_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "external_reservation_id" VARCHAR(160),
  "source_version" VARCHAR(120),
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "confirmed_at" TIMESTAMPTZ(3),
  "released_at" TIMESTAMPTZ(3),
  "consumed_at" TIMESTAMPTZ(3),
  "release_reason" VARCHAR(1000),
  "source" "StatusSource" NOT NULL DEFAULT 'SYSTEM',
  "correlation_id" VARCHAR(128),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_reservations_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "stock_reservations_expiry_after_confirmation" CHECK (
    "confirmed_at" IS NULL OR "expires_at" > "confirmed_at"
  ),
  CONSTRAINT "stock_reservations_lifecycle" CHECK (
    (
      "status" = 'ACTIVE'
      AND "released_at" IS NULL
      AND "consumed_at" IS NULL
    )
    OR (
      "status" IN ('RELEASED', 'EXPIRED')
      AND "released_at" IS NOT NULL
      AND "consumed_at" IS NULL
    )
    OR (
      "status" = 'CONSUMED'
      AND "released_at" IS NULL
      AND "consumed_at" IS NOT NULL
    )
  ),
  CONSTRAINT "stock_reservations_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stock_reservations_order_item_id_fkey"
    FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stock_reservations_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stock_reservations_warehouse_id_fkey"
    FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "outbox_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "message_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "aggregate_type" VARCHAR(80) NOT NULL,
  "aggregate_id" UUID NOT NULL,
  "event_type" VARCHAR(120) NOT NULL,
  "schema_version" VARCHAR(32) NOT NULL,
  "payload" JSONB NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "correlation_id" VARCHAR(128) NOT NULL,
  "causation_id" VARCHAR(128),
  "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processing_started_at" TIMESTAMPTZ(3),
  "processing_owner" VARCHAR(160),
  "published_at" TIMESTAMPTZ(3),
  "dead_lettered_at" TIMESTAMPTZ(3),
  "last_error_code" VARCHAR(120),
  "last_error_message" VARCHAR(1000),
  "last_error_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "outbox_events_attempts_nonnegative" CHECK ("attempts" >= 0),
  CONSTRAINT "outbox_events_payload_hash_format" CHECK (
    "payload_hash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "outbox_events_terminal_timestamps" CHECK (
    ("status" <> 'PUBLISHED' OR "published_at" IS NOT NULL)
    AND ("status" <> 'DLQ' OR "dead_lettered_at" IS NOT NULL)
  )
);

CREATE TABLE "sync_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "direction" "SyncDirection" NOT NULL,
  "event_type" VARCHAR(120) NOT NULL,
  "adapter" VARCHAR(80) NOT NULL,
  "message_id" VARCHAR(128) NOT NULL,
  "external_event_id" VARCHAR(200),
  "internal_entity_id" VARCHAR(128),
  "external_entity_id" VARCHAR(200),
  "entity_key" VARCHAR(240),
  "idempotency_key" VARCHAR(200) NOT NULL,
  "correlation_id" VARCHAR(128) NOT NULL,
  "schema_version" VARCHAR(32) NOT NULL,
  "source_revision" VARCHAR(120),
  "payload_hash" CHAR(64) NOT NULL,
  "payload" JSONB,
  "status" "SyncJobStatus" NOT NULL DEFAULT 'RECEIVED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processing_started_at" TIMESTAMPTZ(3),
  "processed_at" TIMESTAMPTZ(3),
  "next_retry_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sync_jobs_attempts_nonnegative" CHECK ("attempts" >= 0),
  CONSTRAINT "sync_jobs_payload_hash_format" CHECK (
    "payload_hash" ~ '^[0-9a-f]{64}$'
  )
);

CREATE TABLE "sync_errors" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sync_job_id" UUID NOT NULL,
  "severity" "SyncErrorSeverity" NOT NULL DEFAULT 'ERROR',
  "code" VARCHAR(120) NOT NULL,
  "sanitized_message" VARCHAR(1000) NOT NULL,
  "entity_type" VARCHAR(80),
  "external_entity_id" VARCHAR(200),
  "retryable" BOOLEAN NOT NULL DEFAULT false,
  "http_status" INTEGER,
  "details" JSONB,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMPTZ(3),
  "resolved_by" VARCHAR(128),
  "resolution" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sync_errors_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sync_errors_http_status_valid" CHECK (
    "http_status" IS NULL OR "http_status" BETWEEN 100 AND 599
  ),
  CONSTRAINT "sync_errors_resolution_complete" CHECK (
    ("resolved_at" IS NULL AND "resolved_by" IS NULL AND "resolution" IS NULL)
    OR ("resolved_at" IS NOT NULL AND "resolved_by" IS NOT NULL AND "resolution" IS NOT NULL)
  ),
  CONSTRAINT "sync_errors_sync_job_id_fkey"
    FOREIGN KEY ("sync_job_id") REFERENCES "sync_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "integration_cursors" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "adapter" VARCHAR(80) NOT NULL,
  "direction" "SyncDirection" NOT NULL,
  "entity_type" VARCHAR(80) NOT NULL,
  "entity_key" VARCHAR(240) NOT NULL,
  "current_version" VARCHAR(120) NOT NULL,
  "last_message_id" VARCHAR(128),
  "last_payload_hash" CHAR(64),
  "as_of" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "integration_cursors_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "integration_cursors_payload_hash_format" CHECK (
    "last_payload_hash" IS NULL OR "last_payload_hash" ~ '^[0-9a-f]{64}$'
  )
);

CREATE UNIQUE INDEX "outbox_events_message_id_key" ON "outbox_events"("message_id");
CREATE UNIQUE INDEX "outbox_events_idempotency_key_key" ON "outbox_events"("idempotency_key");
CREATE UNIQUE INDEX "sync_jobs_message_id_key" ON "sync_jobs"("message_id");
CREATE UNIQUE INDEX "sync_jobs_adapter_direction_external_event_id_key"
  ON "sync_jobs"("adapter", "direction", "external_event_id");
CREATE UNIQUE INDEX "sync_jobs_adapter_direction_event_type_idempotency_key_key"
  ON "sync_jobs"("adapter", "direction", "event_type", "idempotency_key");
CREATE UNIQUE INDEX "integration_cursors_adapter_direction_entity_type_entity_key_key"
  ON "integration_cursors"("adapter", "direction", "entity_type", "entity_key");

CREATE INDEX "stock_reservations_order_id_status_idx"
  ON "stock_reservations"("order_id", "status");
CREATE INDEX "stock_reservations_order_item_id_warehouse_id_status_idx"
  ON "stock_reservations"("order_item_id", "warehouse_id", "status");
CREATE INDEX "stock_reservations_variant_id_warehouse_id_status_idx"
  ON "stock_reservations"("variant_id", "warehouse_id", "status");
CREATE INDEX "stock_reservations_status_expires_at_idx"
  ON "stock_reservations"("status", "expires_at");
CREATE INDEX "stock_reservations_external_reservation_id_idx"
  ON "stock_reservations"("external_reservation_id");
CREATE INDEX "stock_reservations_correlation_id_idx"
  ON "stock_reservations"("correlation_id");
CREATE INDEX "outbox_events_status_available_at_created_at_idx"
  ON "outbox_events"("status", "available_at", "created_at");
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_created_at_idx"
  ON "outbox_events"("aggregate_type", "aggregate_id", "created_at");
CREATE INDEX "outbox_events_correlation_id_idx"
  ON "outbox_events"("correlation_id");
CREATE INDEX "sync_jobs_status_available_at_created_at_idx"
  ON "sync_jobs"("status", "available_at", "created_at");
CREATE INDEX "sync_jobs_direction_event_type_received_at_idx"
  ON "sync_jobs"("direction", "event_type", "received_at");
CREATE INDEX "sync_jobs_entity_key_source_revision_idx"
  ON "sync_jobs"("entity_key", "source_revision");
CREATE INDEX "sync_jobs_correlation_id_idx"
  ON "sync_jobs"("correlation_id");
CREATE INDEX "sync_errors_sync_job_id_occurred_at_idx"
  ON "sync_errors"("sync_job_id", "occurred_at");
CREATE INDEX "sync_errors_resolved_at_severity_occurred_at_idx"
  ON "sync_errors"("resolved_at", "severity", "occurred_at");
CREATE INDEX "sync_errors_code_occurred_at_idx"
  ON "sync_errors"("code", "occurred_at");
CREATE INDEX "integration_cursors_direction_entity_type_updated_at_idx"
  ON "integration_cursors"("direction", "entity_type", "updated_at");
