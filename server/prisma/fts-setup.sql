-- Full-Text Search setup for Product table
-- Run once via: npx tsx server/scripts/setup-fts.ts

-- 1. Add tsvector column (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Product' AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE "Product" ADD COLUMN "search_vector" tsvector;
  END IF;
END $$;

-- 2. Create or replace the trigger function
CREATE OR REPLACE FUNCTION product_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."search_vector" :=
    setweight(to_tsvector('english', coalesce(NEW."name", '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW."description", '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW."licensedProducer", '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW."lineage", '')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW."certification", '')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW."category", '')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW."dominantTerpene", '')), 'D') ||
    setweight(to_tsvector('english', coalesce(NEW."aromas", '')), 'D') ||
    setweight(to_tsvector('english', coalesce(NEW."highestTerpenes", '')), 'D');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- 3. Create trigger (drop first for idempotency)
DROP TRIGGER IF EXISTS product_search_vector_trigger ON "Product";
CREATE TRIGGER product_search_vector_trigger
  BEFORE INSERT OR UPDATE ON "Product"
  FOR EACH ROW EXECUTE FUNCTION product_search_vector_update();

-- 4. Create GIN index (idempotent)
CREATE INDEX IF NOT EXISTS idx_product_search_vector ON "Product" USING GIN ("search_vector");

-- 5. Backfill existing rows (touch each row to fire the trigger)
UPDATE "Product" SET "name" = "name";
