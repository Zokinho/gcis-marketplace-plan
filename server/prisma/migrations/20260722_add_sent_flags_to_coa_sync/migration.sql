-- Add non-destructive sent flags to CoaSyncRecord
ALTER TABLE "CoaSyncRecord" ADD COLUMN "sentToAirtable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CoaSyncRecord" ADD COLUMN "sentToMarketplace" BOOLEAN NOT NULL DEFAULT false;

-- Backfill legacy records
UPDATE "CoaSyncRecord" SET "sentToAirtable" = true WHERE status = 'confirmed_airtable';
UPDATE "CoaSyncRecord" SET "sentToMarketplace" = true WHERE status = 'confirmed';
