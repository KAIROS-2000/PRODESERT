-- Stage 5 hardening: bank details cannot be published before a complete 1C
-- reservation, monetary snapshots are immutable, state machines are enforced,
-- and financial/notification evidence is retained.

CREATE UNIQUE INDEX "payment_documents_one_invoice_per_payment_key"
  ON "payment_documents"("payment_id")
  WHERE "kind" = 'INVOICE' AND "storage_status" <> 'FAILED';

CREATE FUNCTION "validate_payment_against_order"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  order_row RECORD;
  incomplete_reservation BOOLEAN;
BEGIN
  SELECT
    "public_number",
    "payment_method",
    "grand_total",
    "currency",
    "status",
    "stock_confirmed_at",
    "reservation_expires_at"
  INTO order_row
  FROM "orders"
  WHERE "id" = NEW."order_id"
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment order does not exist'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF order_row."payment_method" <> 'BANK_TRANSFER'
    OR NEW."amount" IS DISTINCT FROM order_row."grand_total"
    OR NEW."currency" IS DISTINCT FROM order_row."currency"
  THEN
    RAISE EXCEPTION 'payment amount, currency or method differs from the order snapshot'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF strpos(lower(NEW."payment_purpose"), lower(order_row."public_number")) = 0 THEN
    RAISE EXCEPTION 'payment purpose must contain the public order number'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF TG_OP = 'INSERT' OR (
    TG_OP = 'UPDATE'
    AND OLD."status" <> 'CONFIRMED'
    AND NEW."status" = 'CONFIRMED'
  ) THEN
    IF order_row."status" NOT IN ('AWAITING_PAYMENT', 'PAYMENT_VERIFICATION')
      OR order_row."stock_confirmed_at" IS NULL
      OR order_row."reservation_expires_at" IS NULL
      OR order_row."reservation_expires_at" <= CURRENT_TIMESTAMP
      OR NEW."details_published_at" >= order_row."reservation_expires_at"
    THEN
      RAISE EXCEPTION 'bank details or payment confirmation require an active reserved order'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    SELECT
      NOT EXISTS (
        SELECT 1
        FROM "order_items" oi
        WHERE oi."order_id" = NEW."order_id"
      )
      OR EXISTS (
        SELECT 1
        FROM "order_items" oi
        LEFT JOIN "stock_reservations" sr
          ON sr."order_item_id" = oi."id"
          AND sr."order_id" = oi."order_id"
          AND sr."status" = 'ACTIVE'
          AND sr."expires_at" >= order_row."reservation_expires_at"
        WHERE oi."order_id" = NEW."order_id"
        GROUP BY oi."id", oi."quantity"
        HAVING COALESCE(sum(sr."quantity"), 0) < oi."quantity"
      )
    INTO incomplete_reservation;

    IF incomplete_reservation THEN
      RAISE EXCEPTION 'bank details or payment confirmation require a complete active reservation'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND NEW."status" <> 'PENDING' THEN
    RAISE EXCEPTION 'new payments must start in PENDING status'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION "protect_payment_record"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."order_id" IS DISTINCT FROM OLD."order_id"
    OR NEW."amount" IS DISTINCT FROM OLD."amount"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."recipient_name" IS DISTINCT FROM OLD."recipient_name"
    OR NEW."recipient_inn" IS DISTINCT FROM OLD."recipient_inn"
    OR NEW."recipient_kpp" IS DISTINCT FROM OLD."recipient_kpp"
    OR NEW."settlement_account" IS DISTINCT FROM OLD."settlement_account"
    OR NEW."correspondent_account" IS DISTINCT FROM OLD."correspondent_account"
    OR NEW."bik" IS DISTINCT FROM OLD."bik"
    OR NEW."bank_name" IS DISTINCT FROM OLD."bank_name"
    OR NEW."payment_purpose" IS DISTINCT FROM OLD."payment_purpose"
    OR NEW."details_version" IS DISTINCT FROM OLD."details_version"
    OR NEW."is_demo" IS DISTINCT FROM OLD."is_demo"
    OR NEW."details_published_at" IS DISTINCT FROM OLD."details_published_at"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  THEN
    RAISE EXCEPTION 'payment monetary and bank-detail snapshot is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'payment version must increase by exactly one'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status"
    AND NOT (
      (OLD."status" = 'PENDING' AND NEW."status" IN ('PROOF_UPLOADED', 'VERIFYING', 'CONFIRMED'))
      OR (
        OLD."status" = 'PROOF_UPLOADED'
        AND NEW."status" IN ('VERIFYING', 'CONFIRMED', 'REJECTED')
      )
      OR (OLD."status" = 'VERIFYING' AND NEW."status" IN ('CONFIRMED', 'REJECTED'))
      OR (
        OLD."status" = 'REJECTED'
        AND NEW."status" IN ('PROOF_UPLOADED', 'VERIFYING', 'CONFIRMED')
      )
      OR (OLD."status" = 'CONFIRMED' AND NEW."status" = 'REFUNDED')
    )
  THEN
    RAISE EXCEPTION 'invalid payment status transition: % -> %', OLD."status", NEW."status"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF OLD."status" IN ('CONFIRMED', 'REFUNDED')
    AND (
      NEW."payment_reference" IS DISTINCT FROM OLD."payment_reference"
      OR NEW."customer_comment" IS DISTINCT FROM OLD."customer_comment"
      OR NEW."proof_submitted_at" IS DISTINCT FROM OLD."proof_submitted_at"
      OR NEW."verification_started_at" IS DISTINCT FROM OLD."verification_started_at"
      OR NEW."confirmed_at" IS DISTINCT FROM OLD."confirmed_at"
      OR NEW."rejected_at" IS DISTINCT FROM OLD."rejected_at"
      OR NEW."verified_by_user_id" IS DISTINCT FROM OLD."verified_by_user_id"
      OR NEW."verification_source" IS DISTINCT FROM OLD."verification_source"
      OR NEW."rejection_comment" IS DISTINCT FROM OLD."rejection_comment"
    )
  THEN
    RAISE EXCEPTION 'verified payment evidence is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF OLD."status" = 'REFUNDED' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'refunded payments are immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION "guard_paid_order_status"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payment_status "PaymentStatus";
BEGIN
  IF NEW."status" IN (
    'PAID',
    'ASSEMBLING',
    'READY_FOR_PICKUP',
    'COMPLETED',
    'RETURN_REQUESTED',
    'RETURNED'
  ) THEN
    SELECT "status"
      INTO payment_status
      FROM "payments"
      WHERE "order_id" = NEW."id";

    IF payment_status IS NULL
      OR (
        NEW."status" IN ('RETURN_REQUESTED', 'RETURNED')
        AND payment_status NOT IN ('CONFIRMED', 'REFUNDED')
      )
      OR (
        NEW."status" NOT IN ('RETURN_REQUESTED', 'RETURNED')
        AND payment_status <> 'CONFIRMED'
      )
      OR NEW."paid_at" IS NULL
    THEN
      RAISE EXCEPTION 'paid order states require an exactly confirmed bank transfer'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION "validate_payment_document"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payment_status "PaymentStatus";
  organization_data JSONB;
BEGIN
  SELECT p."status", o."organization_data"
    INTO payment_status, organization_data
    FROM "payments" p
    JOIN "orders" o ON o."id" = p."order_id"
    WHERE p."id" = NEW."payment_id"
    FOR SHARE OF p, o;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment document payment does not exist'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF TG_OP = 'INSERT'
    AND NEW."kind" = 'PAYMENT_PROOF'
    AND payment_status IN ('CONFIRMED', 'REFUNDED')
  THEN
    RAISE EXCEPTION 'payment proof cannot be added to a terminal payment'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW."kind" = 'INVOICE'
    AND (
      organization_data IS NULL
      OR jsonb_typeof(organization_data) <> 'object'
      OR NULLIF(btrim(organization_data->>'name'), '') IS NULL
      OR NULLIF(btrim(organization_data->>'inn'), '') IS NULL
    )
  THEN
    RAISE EXCEPTION 'an invoice requires the organization snapshot on the order'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION "protect_payment_document"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."payment_id" IS DISTINCT FROM OLD."payment_id"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."object_key" IS DISTINCT FROM OLD."object_key"
    OR NEW."original_filename" IS DISTINCT FROM OLD."original_filename"
    OR NEW."stored_filename" IS DISTINCT FROM OLD."stored_filename"
    OR NEW."mime_type" IS DISTINCT FROM OLD."mime_type"
    OR NEW."size_bytes" IS DISTINCT FROM OLD."size_bytes"
    OR NEW."sha256" IS DISTINCT FROM OLD."sha256"
    OR NEW."source" IS DISTINCT FROM OLD."source"
    OR NEW."uploaded_by_user_id" IS DISTINCT FROM OLD."uploaded_by_user_id"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  THEN
    RAISE EXCEPTION 'payment document identity and file evidence are immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW."storage_status" IS DISTINCT FROM OLD."storage_status"
    AND NOT (
      OLD."storage_status" = 'PENDING_UPLOAD'
      AND NEW."storage_status" IN ('AVAILABLE', 'FAILED')
    )
  THEN
    RAISE EXCEPTION 'invalid payment document storage transition'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW."scan_status" IS DISTINCT FROM OLD."scan_status"
    AND NOT (
      OLD."scan_status" = 'PENDING'
      AND NEW."scan_status" IN ('CLEAN', 'INFECTED', 'FAILED')
    )
  THEN
    RAISE EXCEPTION 'invalid payment document scan transition'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF OLD."storage_status" IN ('AVAILABLE', 'FAILED')
    AND NEW."storage_status" = OLD."storage_status"
    AND NEW."available_at" IS DISTINCT FROM OLD."available_at"
  THEN
    RAISE EXCEPTION 'terminal document storage evidence is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF OLD."scan_status" IN ('CLEAN', 'INFECTED', 'FAILED', 'NOT_REQUIRED')
    AND (
      NEW."scan_status" IS DISTINCT FROM OLD."scan_status"
      OR NEW."scanned_at" IS DISTINCT FROM OLD."scanned_at"
    )
  THEN
    RAISE EXCEPTION 'terminal document scan evidence is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION "protect_email_log"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."order_id" IS DISTINCT FROM OLD."order_id"
    OR NEW."user_id" IS DISTINCT FROM OLD."user_id"
    OR NEW."template_code" IS DISTINCT FROM OLD."template_code"
    OR NEW."recipient_masked" IS DISTINCT FROM OLD."recipient_masked"
    OR NEW."recipient_hash" IS DISTINCT FROM OLD."recipient_hash"
    OR NEW."subject" IS DISTINCT FROM OLD."subject"
    OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
    OR NEW."correlation_id" IS DISTINCT FROM OLD."correlation_id"
    OR NEW."scheduled_at" IS DISTINCT FROM OLD."scheduled_at"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  THEN
    RAISE EXCEPTION 'email log identity is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW."attempts" < OLD."attempts" THEN
    RAISE EXCEPTION 'email delivery attempts are monotonic'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status"
    AND NOT (
      (OLD."status" = 'PENDING' AND NEW."status" IN ('SENDING', 'SUPPRESSED'))
      OR (
        OLD."status" = 'SENDING'
        AND NEW."status" IN ('SENT', 'RETRY_SCHEDULED', 'FAILED', 'SUPPRESSED')
      )
      OR (
        OLD."status" = 'RETRY_SCHEDULED'
        AND NEW."status" IN ('SENDING', 'FAILED', 'SUPPRESSED')
      )
      OR (
        OLD."status" = 'FAILED'
        AND NEW."status" IN ('SENDING', 'RETRY_SCHEDULED', 'SUPPRESSED')
      )
    )
  THEN
    RAISE EXCEPTION 'invalid email delivery status transition'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF OLD."status" IN ('SENT', 'SUPPRESSED') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'terminal email logs are immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION "protect_idempotency_record"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."scope_hash" IS DISTINCT FROM OLD."scope_hash"
    OR NEW."operation" IS DISTINCT FROM OLD."operation"
    OR NEW."key" IS DISTINCT FROM OLD."key"
    OR NEW."request_hash" IS DISTINCT FROM OLD."request_hash"
    OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  THEN
    RAISE EXCEPTION 'idempotency request identity is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF OLD."status" <> 'IN_PROGRESS' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'completed idempotency records are immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF OLD."status" = 'IN_PROGRESS'
    AND NEW."status" NOT IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')
  THEN
    RAISE EXCEPTION 'invalid idempotency record transition'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION "delete_expired_idempotency_record"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."expires_at" > CURRENT_TIMESTAMP THEN
    RAISE EXCEPTION 'live idempotency records cannot be deleted'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN OLD;
END;
$$;

CREATE FUNCTION "prevent_financial_evidence_delete"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% financial evidence cannot be deleted', TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER "payments_validate_order_gate"
BEFORE INSERT OR UPDATE ON "payments"
FOR EACH ROW EXECUTE FUNCTION "validate_payment_against_order"();

CREATE TRIGGER "payments_protect_record"
BEFORE UPDATE ON "payments"
FOR EACH ROW EXECUTE FUNCTION "protect_payment_record"();

CREATE TRIGGER "payments_no_delete"
BEFORE DELETE ON "payments"
FOR EACH ROW EXECUTE FUNCTION "prevent_financial_evidence_delete"();

CREATE TRIGGER "orders_guard_paid_status"
BEFORE INSERT OR UPDATE OF "status", "paid_at" ON "orders"
FOR EACH ROW EXECUTE FUNCTION "guard_paid_order_status"();

CREATE TRIGGER "payment_documents_validate"
BEFORE INSERT OR UPDATE ON "payment_documents"
FOR EACH ROW EXECUTE FUNCTION "validate_payment_document"();

CREATE TRIGGER "payment_documents_protect_record"
BEFORE UPDATE ON "payment_documents"
FOR EACH ROW EXECUTE FUNCTION "protect_payment_document"();

CREATE TRIGGER "payment_documents_no_delete"
BEFORE DELETE ON "payment_documents"
FOR EACH ROW EXECUTE FUNCTION "prevent_financial_evidence_delete"();

CREATE TRIGGER "email_logs_protect_record"
BEFORE UPDATE ON "email_logs"
FOR EACH ROW EXECUTE FUNCTION "protect_email_log"();

CREATE TRIGGER "email_logs_no_delete"
BEFORE DELETE ON "email_logs"
FOR EACH ROW EXECUTE FUNCTION "prevent_financial_evidence_delete"();

CREATE TRIGGER "idempotency_records_protect_record"
BEFORE UPDATE ON "idempotency_records"
FOR EACH ROW EXECUTE FUNCTION "protect_idempotency_record"();

CREATE TRIGGER "idempotency_records_delete_expired_only"
BEFORE DELETE ON "idempotency_records"
FOR EACH ROW EXECUTE FUNCTION "delete_expired_idempotency_record"();
