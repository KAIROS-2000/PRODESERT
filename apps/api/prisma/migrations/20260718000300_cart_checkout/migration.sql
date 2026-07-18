-- Stage 3: persistent guest/authenticated carts and immutable pickup orders.
CREATE TYPE "StatusSource" AS ENUM ('STOREFRONT', 'ADMIN', 'ONE_C', 'SYSTEM');

CREATE TABLE "carts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID,
  "guest_token_hash" CHAR(64),
  "expires_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "carts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "carts_exactly_one_owner" CHECK (num_nonnulls("user_id", "guest_token_hash") = 1),
  CONSTRAINT "carts_guest_expiry" CHECK (
    ("guest_token_hash" IS NULL AND "expires_at" IS NULL)
    OR ("guest_token_hash" IS NOT NULL AND "expires_at" IS NOT NULL)
  ),
  CONSTRAINT "carts_guest_token_hash_format" CHECK (
    "guest_token_hash" IS NULL OR "guest_token_hash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "cart_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "cart_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "unit_price_snapshot" DECIMAL(14,2) NOT NULL,
  "old_price_snapshot" DECIMAL(14,2),
  "currency" CHAR(3) NOT NULL DEFAULT 'RUB',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cart_items_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "cart_items_price_nonnegative" CHECK ("unit_price_snapshot" >= 0),
  CONSTRAINT "cart_items_old_price_valid" CHECK (
    "old_price_snapshot" IS NULL OR "old_price_snapshot" > "unit_price_snapshot"
  ),
  CONSTRAINT "cart_items_currency_rub" CHECK ("currency" = 'RUB'),
  CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "public_number" VARCHAR(40) NOT NULL,
  "customer_id" UUID,
  "guest_email" VARCHAR(320) NOT NULL,
  "guest_phone" VARCHAR(32) NOT NULL,
  "guest_name" VARCHAR(120) NOT NULL,
  "guest_surname" VARCHAR(120),
  "organization_data" JSONB,
  "pickup_location_id" UUID NOT NULL,
  "pickup_location_code" VARCHAR(64) NOT NULL,
  "pickup_location_name" VARCHAR(200) NOT NULL,
  "pickup_location_address" VARCHAR(500) NOT NULL,
  "pickup_location_timezone" VARCHAR(64) NOT NULL,
  "fulfillment_method" "FulfillmentMethod" NOT NULL DEFAULT 'PICKUP',
  "payment_method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
  "subtotal" DECIMAL(14,2) NOT NULL,
  "discount_total" DECIMAL(14,2) NOT NULL,
  "grand_total" DECIMAL(14,2) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'RUB',
  "status" "OrderStatus" NOT NULL DEFAULT 'AWAITING_STOCK_CONFIRMATION',
  "customer_comment" VARCHAR(2000),
  "internal_comment" VARCHAR(4000),
  "desired_pickup_at" DATE,
  "privacy_consent_at" TIMESTAMPTZ(3) NOT NULL,
  "order_terms_consent_at" TIMESTAMPTZ(3) NOT NULL,
  "reservation_expires_at" TIMESTAMPTZ(3),
  "public_access_token_hash" CHAR(64),
  "public_access_token_expires_at" TIMESTAMPTZ(3),
  "idempotency_scope_hash" CHAR(64) NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "idempotency_request_hash" CHAR(64) NOT NULL,
  "source" VARCHAR(32) NOT NULL DEFAULT 'STOREFRONT',
  "one_c_id" VARCHAR(120),
  "version" INTEGER NOT NULL DEFAULT 1,
  "paid_at" TIMESTAMPTZ(3),
  "ready_for_pickup_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "orders_pickup_only" CHECK ("fulfillment_method" = 'PICKUP'),
  CONSTRAINT "orders_bank_transfer_only" CHECK ("payment_method" = 'BANK_TRANSFER'),
  CONSTRAINT "orders_currency_rub" CHECK ("currency" = 'RUB'),
  CONSTRAINT "orders_totals_nonnegative" CHECK (
    "subtotal" >= 0 AND "discount_total" >= 0 AND "grand_total" >= 0
  ),
  CONSTRAINT "orders_totals_consistent" CHECK ("subtotal" - "discount_total" = "grand_total"),
  CONSTRAINT "orders_version_positive" CHECK ("version" > 0),
  CONSTRAINT "orders_idempotency_key_format" CHECK (
    length("idempotency_key") BETWEEN 8 AND 128
    AND "idempotency_key" ~ '^[A-Za-z0-9._:-]+$'
  ),
  CONSTRAINT "orders_hashes_format" CHECK (
    "idempotency_scope_hash" ~ '^[0-9a-f]{64}$'
    AND "idempotency_request_hash" ~ '^[0-9a-f]{64}$'
    AND ("public_access_token_hash" IS NULL OR "public_access_token_hash" ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT "orders_access_token_pair" CHECK (
    ("public_access_token_hash" IS NULL) = ("public_access_token_expires_at" IS NULL)
  ),
  CONSTRAINT "orders_guest_access_required" CHECK (
    "customer_id" IS NOT NULL OR "public_access_token_hash" IS NOT NULL
  ),
  CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "orders_pickup_location_id_fkey" FOREIGN KEY ("pickup_location_id") REFERENCES "pickup_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "order_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "product_id" UUID,
  "variant_id" UUID,
  "one_c_product_id" VARCHAR(120) NOT NULL,
  "one_c_variant_id" VARCHAR(120) NOT NULL,
  "sku" VARCHAR(100) NOT NULL,
  "product_name" VARCHAR(300) NOT NULL,
  "brand_name" VARCHAR(200),
  "offer_name" VARCHAR(300) NOT NULL,
  "pack_description" VARCHAR(300),
  "unit" VARCHAR(32) NOT NULL,
  "unit_price" DECIMAL(14,2) NOT NULL,
  "old_unit_price" DECIMAL(14,2),
  "unit_discount" DECIMAL(14,2) NOT NULL,
  "vat_rate" DECIMAL(5,2) NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "line_subtotal" DECIMAL(14,2) NOT NULL,
  "line_discount" DECIMAL(14,2) NOT NULL,
  "line_total" DECIMAL(14,2) NOT NULL,
  "image_url" VARCHAR(1000),
  "image_alt" VARCHAR(300),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "order_items_prices_nonnegative" CHECK (
    "unit_price" >= 0 AND "unit_discount" >= 0
    AND "line_subtotal" >= 0 AND "line_discount" >= 0 AND "line_total" >= 0
  ),
  CONSTRAINT "order_items_old_price_valid" CHECK (
    "old_unit_price" IS NULL OR "old_unit_price" > "unit_price"
  ),
  CONSTRAINT "order_items_line_totals_consistent" CHECK (
    "line_subtotal" - "line_discount" = "line_total"
  ),
  CONSTRAINT "order_items_vat_valid" CHECK ("vat_rate" BETWEEN 0 AND 100),
  CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "order_status_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "from_status" "OrderStatus",
  "to_status" "OrderStatus" NOT NULL,
  "source" "StatusSource" NOT NULL DEFAULT 'STOREFRONT',
  "actor_user_id" UUID,
  "reason" VARCHAR(1000),
  "correlation_id" VARCHAR(128),
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_status_history_transition" CHECK (
    "from_status" IS NULL OR "from_status" <> "to_status"
  ),
  CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "order_status_history_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "carts_user_id_key" ON "carts"("user_id");
CREATE UNIQUE INDEX "carts_guest_token_hash_key" ON "carts"("guest_token_hash");
CREATE INDEX "carts_expires_at_idx" ON "carts"("expires_at");
CREATE UNIQUE INDEX "cart_items_cart_id_variant_id_key" ON "cart_items"("cart_id", "variant_id");
CREATE INDEX "cart_items_variant_id_idx" ON "cart_items"("variant_id");
CREATE UNIQUE INDEX "orders_public_number_key" ON "orders"("public_number");
CREATE UNIQUE INDEX "orders_one_c_id_key" ON "orders"("one_c_id");
CREATE UNIQUE INDEX "orders_idempotency_scope_hash_idempotency_key_key"
  ON "orders"("idempotency_scope_hash", "idempotency_key");
CREATE INDEX "orders_customer_id_created_at_idx" ON "orders"("customer_id", "created_at");
CREATE INDEX "orders_guest_email_created_at_idx" ON "orders"("guest_email", "created_at");
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");
CREATE INDEX "orders_public_access_token_expires_at_idx" ON "orders"("public_access_token_expires_at");
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");
CREATE INDEX "order_items_variant_id_idx" ON "order_items"("variant_id");
CREATE INDEX "order_status_history_order_id_created_at_idx" ON "order_status_history"("order_id", "created_at");
CREATE INDEX "order_status_history_to_status_created_at_idx" ON "order_status_history"("to_status", "created_at");

CREATE FUNCTION "prevent_order_snapshot_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER "order_items_append_only"
BEFORE UPDATE OR DELETE ON "order_items"
FOR EACH ROW EXECUTE FUNCTION "prevent_order_snapshot_mutation"();

CREATE TRIGGER "order_status_history_append_only"
BEFORE UPDATE OR DELETE ON "order_status_history"
FOR EACH ROW EXECUTE FUNCTION "prevent_order_snapshot_mutation"();
