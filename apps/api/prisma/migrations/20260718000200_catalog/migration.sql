-- Search support is deliberately database-native: Russian FTS for words and
-- pg_trgm for SKU/name typo tolerance.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateEnum
CREATE TYPE "AttributeDataType" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'ENUM');

-- CreateEnum
CREATE TYPE "RelatedProductType" AS ENUM ('RELATED', 'ALTERNATIVE', 'ACCESSORY');

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parent_id" UUID,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(220) NOT NULL,
    "path" VARCHAR(1000) NOT NULL,
    "description" TEXT,
    "image_url" VARCHAR(1000),
    "image_alt" VARCHAR(300),
    "seo_title" VARCHAR(300),
    "seo_description" VARCHAR(500),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_normalization_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID NOT NULL,
    "one_c_group_id" VARCHAR(120) NOT NULL,
    "source_name" VARCHAR(300) NOT NULL,
    "source_path" VARCHAR(1000),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "category_normalization_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "one_c_id" VARCHAR(120) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(220) NOT NULL,
    "description" TEXT,
    "logo_url" VARCHAR(1000),
    "logo_alt" VARCHAR(300),
    "seo_title" VARCHAR(300),
    "seo_description" VARCHAR(500),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "one_c_id" VARCHAR(120) NOT NULL,
    "brand_id" UUID,
    "base_name" VARCHAR(300) NOT NULL,
    "slug" VARCHAR(340) NOT NULL,
    "short_description" VARCHAR(1000),
    "description" TEXT,
    "composition" TEXT,
    "application" TEXT,
    "restrictions" TEXT,
    "storage_description" TEXT,
    "document_links" JSONB,
    "seo_title" VARCHAR(300),
    "seo_description" VARCHAR(500),
    "canonical_url" VARCHAR(1000),
    "is_hit" BOOLEAN NOT NULL DEFAULT false,
    "is_new" BOOLEAN NOT NULL DEFAULT false,
    "popularity_score" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "one_c_source_version" VARCHAR(120),
    "one_c_last_synced_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "search_document" tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('russian', coalesce("base_name", '')), 'A') ||
        setweight(to_tsvector('russian', coalesce("short_description", '')), 'B') ||
        setweight(to_tsvector('russian', coalesce("description", '')), 'C')
    ) STORED,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "one_c_id" VARCHAR(120) NOT NULL,
    "sku" VARCHAR(100) NOT NULL,
    "offer_name" VARCHAR(300) NOT NULL,
    "pack_description" VARCHAR(300),
    "unit" VARCHAR(32) NOT NULL,
    "vat_rate" DECIMAL(5,2) NOT NULL,
    "min_order_quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "sales_multiple" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "country_of_origin" VARCHAR(120),
    "manufacturer" VARCHAR(200),
    "shelf_life_days" INTEGER,
    "storage_conditions" VARCHAR(500),
    "allow_backorder" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "one_c_source_version" VARCHAR(120),
    "one_c_last_synced_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "object_key" VARCHAR(1000) NOT NULL,
    "public_url" VARCHAR(1000) NOT NULL,
    "alt" VARCHAR(300) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "product_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("product_id","category_id")
);

-- CreateTable
CREATE TABLE "prices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "variant_id" UUID NOT NULL,
    "price_type" VARCHAR(64) NOT NULL DEFAULT 'RETAIL',
    "amount" DECIMAL(14,2) NOT NULL,
    "old_amount" DECIMAL(14,2),
    "currency" CHAR(3) NOT NULL DEFAULT 'RUB',
    "vat_included" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" TIMESTAMPTZ(3),
    "valid_to" TIMESTAMPTZ(3),
    "source_version" VARCHAR(120),
    "last_synced_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "one_c_id" VARCHAR(120) NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "pickup_location_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "variant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "on_hand" DECIMAL(14,3) NOT NULL,
    "reserved" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "available" DECIMAL(14,3) NOT NULL,
    "source_version" VARCHAR(120),
    "as_of" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribute_definitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "data_type" "AttributeDataType" NOT NULL,
    "unit" VARCHAR(32),
    "filterable" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "category_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attribute_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribute_values" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "definition_id" UUID NOT NULL,
    "normalized_value" VARCHAR(300) NOT NULL,
    "display_value" VARCHAR(300) NOT NULL,
    "numeric_value" DECIMAL(16,4),
    "boolean_value" BOOLEAN,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attribute_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_attribute_values" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID,
    "variant_id" UUID,
    "definition_id" UUID NOT NULL,
    "value_id" UUID,
    "text_value" VARCHAR(1000),
    "numeric_value" DECIMAL(16,4),
    "boolean_value" BOOLEAN,
    "one_c_source_version" VARCHAR(120),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_attribute_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_synonyms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "normalized_term" VARCHAR(200) NOT NULL,
    "canonical_term" VARCHAR(200) NOT NULL,
    "locale" VARCHAR(10) NOT NULL DEFAULT 'ru',
    "weight" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "search_synonyms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "related_products" (
    "source_product_id" UUID NOT NULL,
    "target_product_id" UUID NOT NULL,
    "relation_type" "RelatedProductType" NOT NULL DEFAULT 'RELATED',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "related_products_pkey" PRIMARY KEY ("source_product_id","target_product_id","relation_type")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parent_id_active_hidden_sort_order_idx" ON "categories"("parent_id", "active", "hidden", "sort_order");

-- CreateIndex
CREATE INDEX "categories_path_idx" ON "categories"("path");

-- CreateIndex
CREATE UNIQUE INDEX "category_normalization_mappings_one_c_group_id_key" ON "category_normalization_mappings"("one_c_group_id");

-- CreateIndex
CREATE INDEX "category_normalization_mappings_category_id_active_idx" ON "category_normalization_mappings"("category_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "brands_one_c_id_key" ON "brands"("one_c_id");

-- CreateIndex
CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");

-- CreateIndex
CREATE INDEX "brands_active_sort_order_idx" ON "brands"("active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "products_one_c_id_key" ON "products"("one_c_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_brand_id_active_idx" ON "products"("brand_id", "active");

-- CreateIndex
CREATE INDEX "products_active_is_hit_is_new_idx" ON "products"("active", "is_hit", "is_new");

-- CreateIndex
CREATE INDEX "products_popularity_score_idx" ON "products"("popularity_score");

CREATE INDEX "products_search_document_idx" ON "products" USING GIN ("search_document");

CREATE INDEX "products_base_name_trgm_idx" ON "products" USING GIN (lower("base_name") gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_one_c_id_key" ON "product_variants"("one_c_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_variants_product_id_active_sort_order_idx" ON "product_variants"("product_id", "active", "sort_order");

-- CreateIndex
CREATE INDEX "product_variants_sku_idx" ON "product_variants"("sku");

CREATE INDEX "product_variants_sku_trgm_idx" ON "product_variants" USING GIN (lower("sku") gin_trgm_ops);

-- CreateIndex
CREATE INDEX "product_images_product_id_published_sort_order_idx" ON "product_images"("product_id", "published", "sort_order");

-- CreateIndex
CREATE INDEX "product_images_variant_id_idx" ON "product_images"("variant_id");

-- CreateIndex
CREATE INDEX "product_categories_category_id_sort_order_idx" ON "product_categories"("category_id", "sort_order");

-- CreateIndex
CREATE INDEX "prices_amount_idx" ON "prices"("amount");

-- CreateIndex
CREATE UNIQUE INDEX "prices_variant_id_price_type_key" ON "prices"("variant_id", "price_type");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_one_c_id_key" ON "warehouses"("one_c_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE INDEX "warehouses_pickup_location_id_active_idx" ON "warehouses"("pickup_location_id", "active");

-- CreateIndex
CREATE INDEX "stock_balances_warehouse_id_available_idx" ON "stock_balances"("warehouse_id", "available");

-- CreateIndex
CREATE INDEX "stock_balances_variant_id_available_idx" ON "stock_balances"("variant_id", "available");

-- CreateIndex
CREATE UNIQUE INDEX "stock_balances_variant_id_warehouse_id_key" ON "stock_balances"("variant_id", "warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "attribute_definitions_code_key" ON "attribute_definitions"("code");

-- CreateIndex
CREATE INDEX "attribute_definitions_category_id_filterable_sort_order_idx" ON "attribute_definitions"("category_id", "filterable", "sort_order");

-- CreateIndex
CREATE INDEX "attribute_values_definition_id_sort_order_idx" ON "attribute_values"("definition_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "attribute_values_definition_id_normalized_value_key" ON "attribute_values"("definition_id", "normalized_value");

CREATE UNIQUE INDEX "attribute_values_id_definition_id_key" ON "attribute_values"("id", "definition_id");

-- CreateIndex
CREATE INDEX "product_attribute_values_product_id_definition_id_idx" ON "product_attribute_values"("product_id", "definition_id");

-- CreateIndex
CREATE INDEX "product_attribute_values_variant_id_definition_id_idx" ON "product_attribute_values"("variant_id", "definition_id");

-- CreateIndex
CREATE INDEX "product_attribute_values_definition_id_value_id_idx" ON "product_attribute_values"("definition_id", "value_id");

-- CreateIndex
CREATE INDEX "search_synonyms_canonical_term_active_idx" ON "search_synonyms"("canonical_term", "active");

CREATE INDEX "search_synonyms_normalized_term_trgm_idx" ON "search_synonyms" USING GIN (lower("normalized_term") gin_trgm_ops);

CREATE INDEX "search_synonyms_canonical_term_trgm_idx" ON "search_synonyms" USING GIN (lower("canonical_term") gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "search_synonyms_normalized_term_canonical_term_locale_key" ON "search_synonyms"("normalized_term", "canonical_term", "locale");

-- CreateIndex
CREATE INDEX "related_products_target_product_id_idx" ON "related_products"("target_product_id");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_normalization_mappings" ADD CONSTRAINT "category_normalization_mappings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prices" ADD CONSTRAINT "prices_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_pickup_location_id_fkey" FOREIGN KEY ("pickup_location_id") REFERENCES "pickup_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribute_definitions" ADD CONSTRAINT "attribute_definitions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribute_values" ADD CONSTRAINT "attribute_values_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "attribute_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "attribute_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- AddForeignKey
ALTER TABLE "related_products" ADD CONSTRAINT "related_products_source_product_id_fkey" FOREIGN KEY ("source_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "related_products" ADD CONSTRAINT "related_products_target_product_id_fkey" FOREIGN KEY ("target_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain invariants kept in PostgreSQL as well as in application validation.
ALTER TABLE "categories"
  ADD CONSTRAINT "categories_slug_normalized" CHECK ("slug" = lower("slug") AND "slug" !~ '[^a-z0-9-]'),
  ADD CONSTRAINT "categories_path_absolute" CHECK (left("path", 1) = '/'),
  ADD CONSTRAINT "categories_no_self_parent" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");

ALTER TABLE "brands"
  ADD CONSTRAINT "brands_slug_normalized" CHECK ("slug" = lower("slug") AND "slug" !~ '[^a-z0-9-]');

ALTER TABLE "products"
  ADD CONSTRAINT "products_slug_normalized" CHECK ("slug" = lower("slug") AND "slug" !~ '[^a-z0-9-]'),
  ADD CONSTRAINT "products_popularity_nonnegative" CHECK ("popularity_score" >= 0);

ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_quantities_positive" CHECK ("min_order_quantity" > 0 AND "sales_multiple" > 0),
  ADD CONSTRAINT "product_variants_vat_valid" CHECK ("vat_rate" >= 0 AND "vat_rate" <= 100),
  ADD CONSTRAINT "product_variants_shelf_life_positive" CHECK ("shelf_life_days" IS NULL OR "shelf_life_days" > 0);

ALTER TABLE "prices"
  ADD CONSTRAINT "prices_amount_nonnegative" CHECK ("amount" >= 0),
  ADD CONSTRAINT "prices_old_amount_valid" CHECK ("old_amount" IS NULL OR "old_amount" > "amount"),
  ADD CONSTRAINT "prices_valid_period" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" > "valid_from"),
  ADD CONSTRAINT "prices_currency_uppercase" CHECK ("currency" = upper("currency"));

ALTER TABLE "stock_balances"
  ADD CONSTRAINT "stock_balances_nonnegative" CHECK ("on_hand" >= 0 AND "reserved" >= 0 AND "available" >= 0),
  ADD CONSTRAINT "stock_balances_consistent" CHECK ("available" <= "on_hand" AND "reserved" <= "on_hand");

ALTER TABLE "product_attribute_values"
  ADD CONSTRAINT "product_attribute_values_one_owner" CHECK (("product_id" IS NOT NULL) <> ("variant_id" IS NOT NULL)),
  ADD CONSTRAINT "product_attribute_values_one_value" CHECK (
    num_nonnulls("value_id", "text_value", "numeric_value", "boolean_value") = 1
  );

ALTER TABLE "related_products"
  ADD CONSTRAINT "related_products_not_self" CHECK ("source_product_id" <> "target_product_id");

CREATE UNIQUE INDEX "product_images_one_primary_per_product_idx"
  ON "product_images"("product_id") WHERE "is_primary" AND "published";

CREATE UNIQUE INDEX "product_categories_one_primary_per_product_idx"
  ON "product_categories"("product_id") WHERE "is_primary";

CREATE UNIQUE INDEX "product_attribute_values_product_definition_key"
  ON "product_attribute_values"("product_id", "definition_id")
  WHERE "product_id" IS NOT NULL;

CREATE UNIQUE INDEX "product_attribute_values_variant_definition_key"
  ON "product_attribute_values"("variant_id", "definition_id")
  WHERE "variant_id" IS NOT NULL;

ALTER TABLE "product_attribute_values"
  ADD CONSTRAINT "product_attribute_values_value_definition_fkey"
  FOREIGN KEY ("value_id", "definition_id")
  REFERENCES "attribute_values"("id", "definition_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_category_cycle() RETURNS trigger AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'category cannot be its own parent';
  END IF;
  IF EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id FROM categories WHERE id = NEW.parent_id
      UNION ALL
      SELECT category.id, category.parent_id
      FROM categories category
      JOIN ancestors ON category.id = ancestors.parent_id
    )
    SELECT 1 FROM ancestors WHERE id = NEW.id
  ) THEN
    RAISE EXCEPTION 'category cycle detected';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "categories_prevent_cycle"
  BEFORE INSERT OR UPDATE OF "parent_id" ON "categories"
  FOR EACH ROW EXECUTE FUNCTION prevent_category_cycle();

CREATE OR REPLACE FUNCTION enforce_product_image_variant_owner() RETURNS trigger AS $$
BEGIN
  IF NEW.variant_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM product_variants variant
    WHERE variant.id = NEW.variant_id AND variant.product_id = NEW.product_id
  ) THEN
    RAISE EXCEPTION 'product image variant belongs to another product';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "product_images_enforce_variant_owner"
  BEFORE INSERT OR UPDATE OF "product_id", "variant_id" ON "product_images"
  FOR EACH ROW EXECUTE FUNCTION enforce_product_image_variant_owner();
