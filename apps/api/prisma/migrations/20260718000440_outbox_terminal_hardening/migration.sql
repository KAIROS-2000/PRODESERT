DROP TRIGGER "outbox_events_protect_identity" ON "outbox_events";

UPDATE "outbox_events"
SET "payload_hash" = encode(
  digest(
    convert_to(
      format('{"orderId":%s}', to_json("payload"->>'orderId')::text),
      'UTF8'
    ),
    'sha256'
  ),
  'hex'
)
WHERE "event_type" = 'order.created'
  AND "payload" ? 'orderId'
  AND "payload" = jsonb_build_object('orderId', "payload"->>'orderId');

CREATE OR REPLACE FUNCTION "protect_outbox_event_identity"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."message_id" IS DISTINCT FROM OLD."message_id"
    OR NEW."aggregate_type" IS DISTINCT FROM OLD."aggregate_type"
    OR NEW."aggregate_id" IS DISTINCT FROM OLD."aggregate_id"
    OR NEW."event_type" IS DISTINCT FROM OLD."event_type"
    OR NEW."schema_version" IS DISTINCT FROM OLD."schema_version"
    OR NEW."payload" IS DISTINCT FROM OLD."payload"
    OR NEW."payload_hash" IS DISTINCT FROM OLD."payload_hash"
    OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
    OR NEW."correlation_id" IS DISTINCT FROM OLD."correlation_id"
    OR NEW."causation_id" IS DISTINCT FROM OLD."causation_id"
  THEN
    RAISE EXCEPTION 'outbox event identity and payload are immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW."attempts" < OLD."attempts" THEN
    RAISE EXCEPTION 'outbox attempts are monotonic'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF OLD."status" IN ('PUBLISHED'::"OutboxStatus", 'DLQ'::"OutboxStatus")
    AND NEW IS DISTINCT FROM OLD
  THEN
    RAISE EXCEPTION 'terminal outbox events are immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW."status" = 'PUBLISHED'::"OutboxStatus" AND NEW."published_at" IS NULL THEN
    RAISE EXCEPTION 'published outbox events require published_at'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW."status" = 'DLQ'::"OutboxStatus" AND NEW."dead_lettered_at" IS NULL THEN
    RAISE EXCEPTION 'dead-lettered outbox events require dead_lettered_at'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "outbox_events_protect_identity"
BEFORE UPDATE ON "outbox_events"
FOR EACH ROW EXECUTE FUNCTION "protect_outbox_event_identity"();
