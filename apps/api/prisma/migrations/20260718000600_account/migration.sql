-- Stage 6: versioned customer profiles, verified email changes,
-- reusable organizations and notification preferences.
ALTER TABLE "users"
  ADD COLUMN "first_name" VARCHAR(120),
  ADD COLUMN "last_name" VARCHAR(120),
  ADD COLUMN "phone" VARCHAR(32),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "users_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "users_first_name_check"
    CHECK ("first_name" IS NULL OR (btrim("first_name") = "first_name" AND length("first_name") > 0)),
  ADD CONSTRAINT "users_last_name_check"
    CHECK ("last_name" IS NULL OR (btrim("last_name") = "last_name" AND length("last_name") > 0)),
  ADD CONSTRAINT "users_phone_check"
    CHECK ("phone" IS NULL OR "phone" ~ '^\+?[0-9 ()-]{7,32}$');

CREATE TABLE "email_change_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "current_email_normalized" VARCHAR(320) NOT NULL,
  "new_email" VARCHAR(320) NOT NULL,
  "new_email_normalized" VARCHAR(320) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "used_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_change_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_change_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "email_change_tokens_distinct_email_check"
    CHECK ("current_email_normalized" <> "new_email_normalized")
);

CREATE UNIQUE INDEX "email_change_tokens_token_hash_key"
  ON "email_change_tokens"("token_hash");
CREATE UNIQUE INDEX "email_change_tokens_one_pending_per_user_key"
  ON "email_change_tokens"("user_id")
  WHERE "used_at" IS NULL;
CREATE INDEX "email_change_tokens_user_id_used_at_expires_at_idx"
  ON "email_change_tokens"("user_id", "used_at", "expires_at");
CREATE INDEX "email_change_tokens_new_email_normalized_used_at_idx"
  ON "email_change_tokens"("new_email_normalized", "used_at");

CREATE TABLE "account_organizations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "name" VARCHAR(300) NOT NULL,
  "inn" VARCHAR(12) NOT NULL,
  "kpp" VARCHAR(9),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "account_organizations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "account_organizations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "account_organizations_name_check"
    CHECK (btrim("name") = "name" AND length("name") > 0),
  CONSTRAINT "account_organizations_inn_check"
    CHECK ("inn" ~ '^([0-9]{10}|[0-9]{12})$'),
  CONSTRAINT "account_organizations_kpp_check"
    CHECK ("kpp" IS NULL OR "kpp" ~ '^[0-9]{9}$'),
  CONSTRAINT "account_organizations_version_check"
    CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "account_organizations_user_inn_kpp_key"
  ON "account_organizations"("user_id", "inn", COALESCE("kpp", ''));
CREATE INDEX "account_organizations_user_id_created_at_idx"
  ON "account_organizations"("user_id", "created_at");

CREATE TABLE "notification_preferences" (
  "user_id" UUID NOT NULL,
  "order_updates" BOOLEAN NOT NULL DEFAULT true,
  "payment_updates" BOOLEAN NOT NULL DEFAULT true,
  "reservation_reminders" BOOLEAN NOT NULL DEFAULT true,
  "marketing_emails" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "notification_preferences_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "notification_preferences_version_check" CHECK ("version" > 0)
);
