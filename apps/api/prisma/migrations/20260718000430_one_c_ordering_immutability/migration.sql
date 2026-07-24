CREATE OR REPLACE FUNCTION "protect_sync_job_identity"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."direction" IS DISTINCT FROM OLD."direction"
    OR NEW."event_type" IS DISTINCT FROM OLD."event_type"
    OR NEW."adapter" IS DISTINCT FROM OLD."adapter"
    OR NEW."message_id" IS DISTINCT FROM OLD."message_id"
    OR NEW."external_event_id" IS DISTINCT FROM OLD."external_event_id"
    OR NEW."internal_entity_id" IS DISTINCT FROM OLD."internal_entity_id"
    OR NEW."external_entity_id" IS DISTINCT FROM OLD."external_entity_id"
    OR NEW."entity_key" IS DISTINCT FROM OLD."entity_key"
    OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
    OR NEW."correlation_id" IS DISTINCT FROM OLD."correlation_id"
    OR NEW."schema_version" IS DISTINCT FROM OLD."schema_version"
    OR NEW."source_revision" IS DISTINCT FROM OLD."source_revision"
    OR NEW."source_sequence" IS DISTINCT FROM OLD."source_sequence"
    OR NEW."payload_hash" IS DISTINCT FROM OLD."payload_hash"
    OR NEW."payload" IS DISTINCT FROM OLD."payload"
    OR NEW."received_at" IS DISTINCT FROM OLD."received_at"
  THEN
    RAISE EXCEPTION 'sync job identity and payload are immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;
