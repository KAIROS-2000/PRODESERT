-- Stage 7: staff-owned operational history and website-owned content.
-- Commercial fields (1C ids, names, prices, stock and availability) remain
-- outside this migration and are deliberately not editable by the admin CMS.

ALTER TABLE "products"
  ADD COLUMN "content_version" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "products_content_version_check" CHECK ("content_version" > 0);

CREATE TABLE "order_internal_notes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "author_user_id" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_internal_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_internal_notes_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "order_internal_notes_author_user_id_fkey"
    FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "order_internal_notes_body_check"
    CHECK (length(btrim("body")) > 0 AND length("body") <= 4000)
);
CREATE INDEX "order_internal_notes_order_id_created_at_idx"
  ON "order_internal_notes"("order_id", "created_at");
CREATE INDEX "order_internal_notes_author_user_id_created_at_idx"
  ON "order_internal_notes"("author_user_id", "created_at");

CREATE TABLE "promotions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "title" VARCHAR(300) NOT NULL,
  "body" TEXT,
  "image_url" VARCHAR(1000),
  "image_alt" VARCHAR(300),
  "link_url" VARCHAR(1000),
  "starts_at" TIMESTAMPTZ(3),
  "ends_at" TIMESTAMPTZ(3),
  "active" BOOLEAN NOT NULL DEFAULT false,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "badge_color" VARCHAR(16),
  "text_color" VARCHAR(16),
  "discount_percent" DECIMAL(5,2),
  "discount_managed_by_site" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "promotions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "promotions_title_check" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "promotions_schedule_check"
    CHECK ("ends_at" IS NULL OR "starts_at" IS NULL OR "ends_at" > "starts_at"),
  CONSTRAINT "promotions_discount_check"
    CHECK (
      ("discount_percent" IS NULL AND NOT "discount_managed_by_site")
      OR ("discount_percent" >= 0 AND "discount_percent" <= 100)
    ),
  CONSTRAINT "promotions_version_check" CHECK ("version" > 0)
);
CREATE INDEX "promotions_active_starts_at_ends_at_priority_idx"
  ON "promotions"("active", "starts_at", "ends_at", "priority");

CREATE TABLE "promotion_products" (
  "promotion_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  CONSTRAINT "promotion_products_pkey" PRIMARY KEY ("promotion_id", "product_id"),
  CONSTRAINT "promotion_products_promotion_id_fkey"
    FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "promotion_products_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "promotion_products_product_id_idx" ON "promotion_products"("product_id");

CREATE TABLE "promotion_categories" (
  "promotion_id" UUID NOT NULL,
  "category_id" UUID NOT NULL,
  CONSTRAINT "promotion_categories_pkey" PRIMARY KEY ("promotion_id", "category_id"),
  CONSTRAINT "promotion_categories_promotion_id_fkey"
    FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "promotion_categories_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "promotion_categories_category_id_idx" ON "promotion_categories"("category_id");

CREATE TABLE "banners" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "title" VARCHAR(300) NOT NULL,
  "body" TEXT,
  "image_url" VARCHAR(1000),
  "image_alt" VARCHAR(300),
  "link_url" VARCHAR(1000),
  "starts_at" TIMESTAMPTZ(3),
  "ends_at" TIMESTAMPTZ(3),
  "active" BOOLEAN NOT NULL DEFAULT false,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "banners_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "banners_title_check" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "banners_schedule_check"
    CHECK ("ends_at" IS NULL OR "starts_at" IS NULL OR "ends_at" > "starts_at"),
  CONSTRAINT "banners_version_check" CHECK ("version" > 0)
);
CREATE INDEX "banners_active_starts_at_ends_at_priority_idx"
  ON "banners"("active", "starts_at", "ends_at", "priority");

CREATE TABLE "content_pages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "slug" VARCHAR(220) NOT NULL,
  "title" VARCHAR(300) NOT NULL,
  "body" TEXT NOT NULL,
  "seo_title" VARCHAR(300),
  "seo_description" VARCHAR(500),
  "published" BOOLEAN NOT NULL DEFAULT false,
  "published_at" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_pages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "content_pages_slug_key" UNIQUE ("slug"),
  CONSTRAINT "content_pages_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT "content_pages_title_check" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "content_pages_body_check" CHECK (length(btrim("body")) > 0),
  CONSTRAINT "content_pages_version_check" CHECK ("version" > 0)
);
CREATE INDEX "content_pages_published_published_at_idx"
  ON "content_pages"("published", "published_at");
