-- Preserve the customer relation for audit/history and snapshot all displayed pickup details.
-- User removal is a soft-deactivation flow; hard deletion is intentionally restricted.
ALTER TABLE "orders" DROP CONSTRAINT "orders_customer_id_fkey";
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "orders"
  ADD COLUMN "pickup_location_phone" VARCHAR(32),
  ADD COLUMN "pickup_location_opening_hours" JSONB;
