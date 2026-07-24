ALTER TABLE "sync_jobs"
  ADD COLUMN "source_sequence" INTEGER;

UPDATE "sync_jobs"
SET "source_sequence" = ("payload"->>'orderVersion')::INTEGER
WHERE "direction" = 'INBOUND'::"SyncDirection"
  AND "event_type" = 'order.status.updated'
  AND jsonb_typeof("payload"->'orderVersion') = 'number';

ALTER TABLE "sync_jobs"
  ADD CONSTRAINT "sync_jobs_source_sequence_positive"
  CHECK ("source_sequence" IS NULL OR "source_sequence" >= 1);

CREATE INDEX "sync_jobs_stream_sequence_idx"
  ON "sync_jobs" (
    "adapter",
    "direction",
    "event_type",
    "entity_key",
    "source_sequence"
  );
