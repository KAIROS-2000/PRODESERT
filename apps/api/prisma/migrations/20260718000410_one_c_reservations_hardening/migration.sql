-- Stage 4 hardening: active-reservation uniqueness, immutable integration facts and
-- transactional outbox recovery for orders created before the outbox was introduced.

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_one_c_version_nonnegative"
    CHECK ("one_c_version" IS NULL OR "one_c_version" >= 0),
  ADD CONSTRAINT "orders_consent_versions_nonempty"
    CHECK (
      btrim("privacy_consent_version") <> ''
      AND btrim("order_terms_consent_version") <> ''
    );

CREATE UNIQUE INDEX "stock_reservations_one_active_order_item_warehouse_key"
  ON "stock_reservations"("order_item_id", "warehouse_id")
  WHERE "status" = 'ACTIVE';

CREATE FUNCTION "prevent_integration_record_delete"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% records cannot be deleted', TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE FUNCTION "protect_stock_reservation_identity"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  item_order_id UUID;
  item_variant_id UUID;
BEGIN
  SELECT "order_id", "variant_id"
    INTO item_order_id, item_variant_id
    FROM "order_items"
    WHERE "id" = NEW."order_item_id";

  IF item_order_id IS NULL
    OR item_order_id IS DISTINCT FROM NEW."order_id"
    OR item_variant_id IS NULL
    OR item_variant_id IS DISTINCT FROM NEW."variant_id"
  THEN
    RAISE EXCEPTION 'reservation order/item/variant identity is inconsistent'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW."order_id" IS DISTINCT FROM OLD."order_id"
    OR NEW."order_item_id" IS DISTINCT FROM OLD."order_item_id"
    OR NEW."variant_id" IS DISTINCT FROM OLD."variant_id"
    OR NEW."warehouse_id" IS DISTINCT FROM OLD."warehouse_id"
    OR NEW."quantity" IS DISTINCT FROM OLD."quantity"
    OR (
      OLD."external_reservation_id" IS NOT NULL
      AND NEW."external_reservation_id" IS DISTINCT FROM OLD."external_reservation_id"
    )
  ) THEN
    RAISE EXCEPTION 'stock reservation identity is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION "protect_outbox_event_identity"() RETURNS trigger
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

  RETURN NEW;
END;
$$;

CREATE FUNCTION "protect_sync_job_identity"() RETURNS trigger
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

CREATE FUNCTION "protect_sync_error_fact"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."sync_job_id" IS DISTINCT FROM OLD."sync_job_id"
    OR NEW."severity" IS DISTINCT FROM OLD."severity"
    OR NEW."code" IS DISTINCT FROM OLD."code"
    OR NEW."sanitized_message" IS DISTINCT FROM OLD."sanitized_message"
    OR NEW."entity_type" IS DISTINCT FROM OLD."entity_type"
    OR NEW."external_entity_id" IS DISTINCT FROM OLD."external_entity_id"
    OR NEW."retryable" IS DISTINCT FROM OLD."retryable"
    OR NEW."http_status" IS DISTINCT FROM OLD."http_status"
    OR NEW."details" IS DISTINCT FROM OLD."details"
    OR NEW."occurred_at" IS DISTINCT FROM OLD."occurred_at"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  THEN
    RAISE EXCEPTION 'sync error fact is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "stock_reservations_validate_identity"
BEFORE INSERT OR UPDATE ON "stock_reservations"
FOR EACH ROW EXECUTE FUNCTION "protect_stock_reservation_identity"();

CREATE TRIGGER "stock_reservations_no_delete"
BEFORE DELETE ON "stock_reservations"
FOR EACH ROW EXECUTE FUNCTION "prevent_integration_record_delete"();

CREATE TRIGGER "outbox_events_protect_identity"
BEFORE UPDATE ON "outbox_events"
FOR EACH ROW EXECUTE FUNCTION "protect_outbox_event_identity"();

CREATE TRIGGER "outbox_events_no_delete"
BEFORE DELETE ON "outbox_events"
FOR EACH ROW EXECUTE FUNCTION "prevent_integration_record_delete"();

CREATE TRIGGER "sync_jobs_protect_identity"
BEFORE UPDATE ON "sync_jobs"
FOR EACH ROW EXECUTE FUNCTION "protect_sync_job_identity"();

CREATE TRIGGER "sync_jobs_no_delete"
BEFORE DELETE ON "sync_jobs"
FOR EACH ROW EXECUTE FUNCTION "prevent_integration_record_delete"();

CREATE TRIGGER "sync_errors_protect_fact"
BEFORE UPDATE ON "sync_errors"
FOR EACH ROW EXECUTE FUNCTION "protect_sync_error_fact"();

CREATE TRIGGER "sync_errors_no_delete"
BEFORE DELETE ON "sync_errors"
FOR EACH ROW EXECUTE FUNCTION "prevent_integration_record_delete"();

WITH pending_orders AS (
  SELECT
    "id",
    jsonb_build_object('orderId', "id"::text) AS "payload"
  FROM "orders"
  WHERE "status" = 'AWAITING_STOCK_CONFIRMATION'
)
INSERT INTO "outbox_events" (
  "aggregate_type",
  "aggregate_id",
  "event_type",
  "schema_version",
  "payload",
  "payload_hash",
  "idempotency_key",
  "correlation_id"
)
SELECT
  'order',
  "id",
  'order.created',
  '1.0',
  "payload",
  encode(digest(convert_to("payload"::text, 'UTF8'), 'sha256'), 'hex'),
  'order:' || "id"::text || ':created:v1',
  "id"::text
FROM pending_orders
ON CONFLICT ("idempotency_key") DO NOTHING;
