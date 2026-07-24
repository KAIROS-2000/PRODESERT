-- Stage 5: controlled bank-transfer payments, private payment documents,
-- notification delivery journal and reusable request idempotency.
CREATE TYPE "PaymentStatus" AS ENUM (
  'PENDING',
  'PROOF_UPLOADED',
  'VERIFYING',
  'CONFIRMED',
  'REJECTED',
  'REFUNDED'
);
CREATE TYPE "PaymentDocumentKind" AS ENUM ('PAYMENT_PROOF', 'INVOICE');
CREATE TYPE "StorageStatus" AS ENUM ('PENDING_UPLOAD', 'AVAILABLE', 'FAILED');
CREATE TYPE "FileScanStatus" AS ENUM (
  'PENDING',
  'CLEAN',
  'INFECTED',
  'FAILED',
  'NOT_REQUIRED'
);
CREATE TYPE "EmailDeliveryStatus" AS ENUM (
  'PENDING',
  'SENDING',
  'SENT',
  'RETRY_SCHEDULED',
  'FAILED',
  'SUPPRESSED'
);
CREATE TYPE "IdempotencyRecordStatus" AS ENUM (
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED'
);

ALTER TABLE "order_items"
  ADD COLUMN "vat_included" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "amount" DECIMAL(14,2) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'RUB',
  "recipient_name" VARCHAR(250) NOT NULL,
  "recipient_inn" VARCHAR(12) NOT NULL,
  "recipient_kpp" VARCHAR(9),
  "settlement_account" CHAR(20) NOT NULL,
  "correspondent_account" CHAR(20) NOT NULL,
  "bik" CHAR(9) NOT NULL,
  "bank_name" VARCHAR(250) NOT NULL,
  "payment_purpose" VARCHAR(500) NOT NULL,
  "details_version" VARCHAR(64) NOT NULL,
  "is_demo" BOOLEAN NOT NULL DEFAULT false,
  "details_published_at" TIMESTAMPTZ(3) NOT NULL,
  "payment_reference" VARCHAR(200),
  "customer_comment" VARCHAR(2000),
  "proof_submitted_at" TIMESTAMPTZ(3),
  "verification_started_at" TIMESTAMPTZ(3),
  "confirmed_at" TIMESTAMPTZ(3),
  "rejected_at" TIMESTAMPTZ(3),
  "refunded_at" TIMESTAMPTZ(3),
  "verified_by_user_id" UUID,
  "verification_source" "StatusSource",
  "rejection_comment" VARCHAR(2000),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payments_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payments_verified_by_user_id_fkey"
    FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "payments_currency_rub" CHECK ("currency" = 'RUB'),
  CONSTRAINT "payments_bank_details_valid" CHECK (
    btrim("recipient_name") <> ''
    AND "recipient_inn" ~ '^(?:[0-9]{10}|[0-9]{12})$'
    AND ("recipient_kpp" IS NULL OR "recipient_kpp" ~ '^[0-9]{9}$')
    AND "settlement_account" ~ '^[0-9]{20}$'
    AND "correspondent_account" ~ '^[0-9]{20}$'
    AND "bik" ~ '^[0-9]{9}$'
    AND btrim("bank_name") <> ''
    AND btrim("payment_purpose") <> ''
    AND btrim("details_version") <> ''
  ),
  CONSTRAINT "payments_optional_text_nonempty" CHECK (
    ("payment_reference" IS NULL OR btrim("payment_reference") <> '')
    AND ("customer_comment" IS NULL OR btrim("customer_comment") <> '')
    AND ("rejection_comment" IS NULL OR btrim("rejection_comment") <> '')
  ),
  CONSTRAINT "payments_version_positive" CHECK ("version" > 0),
  CONSTRAINT "payments_event_order" CHECK (
    ("proof_submitted_at" IS NULL OR "proof_submitted_at" >= "details_published_at")
    AND (
      "verification_started_at" IS NULL
      OR "verification_started_at" >= "details_published_at"
    )
    AND ("confirmed_at" IS NULL OR "confirmed_at" >= "details_published_at")
    AND ("rejected_at" IS NULL OR "rejected_at" >= "details_published_at")
    AND (
      "refunded_at" IS NULL
      OR ("confirmed_at" IS NOT NULL AND "refunded_at" >= "confirmed_at")
    )
  ),
  CONSTRAINT "payments_verifier_valid" CHECK (
    "verification_source" IS NULL
    OR "verification_source" <> 'STOREFRONT'
  ),
  CONSTRAINT "payments_admin_verifier_present" CHECK (
    "verification_source" <> 'ADMIN'
    OR "verified_by_user_id" IS NOT NULL
  ),
  CONSTRAINT "payments_lifecycle" CHECK (
    (
      "status" = 'PENDING'
      AND "proof_submitted_at" IS NULL
      AND "verification_started_at" IS NULL
      AND "confirmed_at" IS NULL
      AND "rejected_at" IS NULL
      AND "refunded_at" IS NULL
      AND "verification_source" IS NULL
      AND "rejection_comment" IS NULL
    )
    OR (
      "status" = 'PROOF_UPLOADED'
      AND "proof_submitted_at" IS NOT NULL
      AND "confirmed_at" IS NULL
      AND "rejected_at" IS NULL
      AND "refunded_at" IS NULL
      AND "verification_source" IS NULL
      AND "rejection_comment" IS NULL
    )
    OR (
      "status" = 'VERIFYING'
      AND "proof_submitted_at" IS NOT NULL
      AND "verification_started_at" IS NOT NULL
      AND "confirmed_at" IS NULL
      AND "rejected_at" IS NULL
      AND "refunded_at" IS NULL
      AND "verification_source" IS NULL
      AND "rejection_comment" IS NULL
    )
    OR (
      "status" = 'CONFIRMED'
      AND "confirmed_at" IS NOT NULL
      AND "rejected_at" IS NULL
      AND "refunded_at" IS NULL
      AND "verification_source" IS NOT NULL
      AND "rejection_comment" IS NULL
    )
    OR (
      "status" = 'REJECTED'
      AND "confirmed_at" IS NULL
      AND "rejected_at" IS NOT NULL
      AND "refunded_at" IS NULL
      AND "verification_source" IS NOT NULL
      AND "rejection_comment" IS NOT NULL
    )
    OR (
      "status" = 'REFUNDED'
      AND "confirmed_at" IS NOT NULL
      AND "refunded_at" IS NOT NULL
      AND "verification_source" IS NOT NULL
    )
  )
);

CREATE TABLE "payment_documents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "payment_id" UUID NOT NULL,
  "kind" "PaymentDocumentKind" NOT NULL,
  "object_key" VARCHAR(1000) NOT NULL,
  "original_filename" VARCHAR(255) NOT NULL,
  "stored_filename" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(100) NOT NULL,
  "size_bytes" BIGINT NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "storage_status" "StorageStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
  "scan_status" "FileScanStatus" NOT NULL DEFAULT 'PENDING',
  "source" "StatusSource" NOT NULL DEFAULT 'STOREFRONT',
  "uploaded_by_user_id" UUID,
  "available_at" TIMESTAMPTZ(3),
  "scanned_at" TIMESTAMPTZ(3),
  "failure_reason" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_documents_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_documents_uploaded_by_user_id_fkey"
    FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_documents_size_valid" CHECK (
    "size_bytes" > 0 AND "size_bytes" <= 8388608
  ),
  CONSTRAINT "payment_documents_hash_format" CHECK (
    "sha256" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "payment_documents_mime_allowed" CHECK (
    "mime_type" IN ('application/pdf', 'image/jpeg', 'image/png')
  ),
  CONSTRAINT "payment_documents_names_safe" CHECK (
    btrim("object_key") <> ''
    AND "object_key" !~ '(^/|\\\\|[[:cntrl:]])'
    AND btrim("original_filename") <> ''
    AND "original_filename" !~ '[/\\\\[:cntrl:]]'
    AND btrim("stored_filename") <> ''
    AND "stored_filename" !~ '[/\\\\[:cntrl:]]'
  ),
  CONSTRAINT "payment_documents_invoice_format" CHECK (
    "kind" <> 'INVOICE'
    OR (
      "mime_type" = 'application/pdf'
      AND "source" IN ('ADMIN', 'SYSTEM')
      AND "scan_status" IN ('CLEAN', 'NOT_REQUIRED')
    )
  ),
  CONSTRAINT "payment_documents_storage_lifecycle" CHECK (
    (
      "storage_status" = 'PENDING_UPLOAD'
      AND "available_at" IS NULL
      AND "failure_reason" IS NULL
    )
    OR (
      "storage_status" = 'AVAILABLE'
      AND "available_at" IS NOT NULL
      AND (
        "scan_status" NOT IN ('INFECTED', 'FAILED')
        OR "failure_reason" IS NOT NULL
      )
    )
    OR (
      "storage_status" = 'FAILED'
      AND "available_at" IS NULL
      AND "failure_reason" IS NOT NULL
    )
  ),
  CONSTRAINT "payment_documents_scan_lifecycle" CHECK (
    ("scan_status" = 'PENDING' AND "scanned_at" IS NULL)
    OR ("scan_status" = 'CLEAN' AND "scanned_at" IS NOT NULL)
    OR (
      "scan_status" IN ('INFECTED', 'FAILED')
      AND "scanned_at" IS NOT NULL
      AND "failure_reason" IS NOT NULL
    )
    OR "scan_status" = 'NOT_REQUIRED'
  )
);

CREATE TABLE "email_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID,
  "user_id" UUID,
  "template_code" VARCHAR(80) NOT NULL,
  "recipient_masked" VARCHAR(320) NOT NULL,
  "recipient_hash" CHAR(64) NOT NULL,
  "subject" VARCHAR(300) NOT NULL,
  "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "provider_message_id" VARCHAR(200),
  "idempotency_key" VARCHAR(200) NOT NULL,
  "correlation_id" VARCHAR(128),
  "scheduled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sending_started_at" TIMESTAMPTZ(3),
  "sent_at" TIMESTAMPTZ(3),
  "next_retry_at" TIMESTAMPTZ(3),
  "failed_at" TIMESTAMPTZ(3),
  "last_error_code" VARCHAR(120),
  "last_error_message" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_logs_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "email_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "email_logs_attempts_nonnegative" CHECK ("attempts" >= 0),
  CONSTRAINT "email_logs_identity_valid" CHECK (
    btrim("template_code") <> ''
    AND btrim("recipient_masked") <> ''
    AND "recipient_hash" ~ '^[0-9a-f]{64}$'
    AND btrim("subject") <> ''
    AND btrim("idempotency_key") <> ''
  ),
  CONSTRAINT "email_logs_lifecycle" CHECK (
    (
      "status" = 'PENDING'
      AND "sending_started_at" IS NULL
      AND "sent_at" IS NULL
      AND "next_retry_at" IS NULL
      AND "failed_at" IS NULL
      AND "last_error_code" IS NULL
      AND "last_error_message" IS NULL
    )
    OR (
      "status" = 'SENDING'
      AND "sending_started_at" IS NOT NULL
      AND "sent_at" IS NULL
      AND "next_retry_at" IS NULL
      AND "failed_at" IS NULL
    )
    OR (
      "status" = 'SENT'
      AND "sent_at" IS NOT NULL
      AND "next_retry_at" IS NULL
      AND "failed_at" IS NULL
    )
    OR (
      "status" = 'RETRY_SCHEDULED'
      AND "next_retry_at" IS NOT NULL
      AND "sent_at" IS NULL
      AND "failed_at" IS NULL
      AND "last_error_message" IS NOT NULL
    )
    OR (
      "status" = 'FAILED'
      AND "failed_at" IS NOT NULL
      AND "sent_at" IS NULL
      AND "next_retry_at" IS NULL
      AND "last_error_message" IS NOT NULL
    )
    OR (
      "status" = 'SUPPRESSED'
      AND "sent_at" IS NULL
      AND "next_retry_at" IS NULL
    )
  )
);

CREATE TABLE "idempotency_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "scope_hash" CHAR(64) NOT NULL,
  "operation" VARCHAR(120) NOT NULL,
  "key" VARCHAR(128) NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "status" "IdempotencyRecordStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "response_status" INTEGER,
  "response_body" JSONB,
  "resource_type" VARCHAR(80),
  "resource_id" VARCHAR(128),
  "locked_until" TIMESTAMPTZ(3),
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "idempotency_records_hashes_format" CHECK (
    "scope_hash" ~ '^[0-9a-f]{64}$'
    AND "request_hash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "idempotency_records_identity_valid" CHECK (
    btrim("operation") <> ''
    AND length("key") BETWEEN 8 AND 128
    AND "key" ~ '^[A-Za-z0-9._:-]+$'
  ),
  CONSTRAINT "idempotency_records_resource_pair" CHECK (
    ("resource_type" IS NULL) = ("resource_id" IS NULL)
  ),
  CONSTRAINT "idempotency_records_expiry_valid" CHECK (
    "expires_at" > "created_at"
  ),
  CONSTRAINT "idempotency_records_lifecycle" CHECK (
    (
      "status" = 'IN_PROGRESS'
      AND "completed_at" IS NULL
      AND "response_status" IS NULL
      AND "response_body" IS NULL
    )
    OR (
      "status" = 'COMPLETED'
      AND "completed_at" IS NOT NULL
      AND "response_status" BETWEEN 200 AND 399
      AND "locked_until" IS NULL
    )
    OR (
      "status" = 'FAILED'
      AND "completed_at" IS NOT NULL
      AND "response_status" BETWEEN 400 AND 599
      AND "locked_until" IS NULL
    )
  )
);

CREATE UNIQUE INDEX "payments_order_id_key" ON "payments"("order_id");
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");
CREATE INDEX "payments_verified_by_user_id_confirmed_at_idx"
  ON "payments"("verified_by_user_id", "confirmed_at");
CREATE INDEX "payments_details_published_at_idx" ON "payments"("details_published_at");

CREATE UNIQUE INDEX "payment_documents_object_key_key"
  ON "payment_documents"("object_key");
CREATE INDEX "payment_documents_payment_id_kind_created_at_idx"
  ON "payment_documents"("payment_id", "kind", "created_at");
CREATE INDEX "payment_documents_storage_status_scan_status_created_at_idx"
  ON "payment_documents"("storage_status", "scan_status", "created_at");
CREATE INDEX "payment_documents_uploaded_by_user_id_created_at_idx"
  ON "payment_documents"("uploaded_by_user_id", "created_at");

CREATE UNIQUE INDEX "email_logs_idempotency_key_key"
  ON "email_logs"("idempotency_key");
CREATE INDEX "email_logs_status_next_retry_at_scheduled_at_idx"
  ON "email_logs"("status", "next_retry_at", "scheduled_at");
CREATE INDEX "email_logs_order_id_created_at_idx"
  ON "email_logs"("order_id", "created_at");
CREATE INDEX "email_logs_user_id_created_at_idx"
  ON "email_logs"("user_id", "created_at");
CREATE INDEX "email_logs_correlation_id_idx" ON "email_logs"("correlation_id");

CREATE UNIQUE INDEX "idempotency_records_scope_hash_operation_key_key"
  ON "idempotency_records"("scope_hash", "operation", "key");
CREATE INDEX "idempotency_records_status_locked_until_idx"
  ON "idempotency_records"("status", "locked_until");
CREATE INDEX "idempotency_records_expires_at_idx"
  ON "idempotency_records"("expires_at");
CREATE INDEX "idempotency_records_resource_type_resource_id_idx"
  ON "idempotency_records"("resource_type", "resource_id");
