-- AlterTable: track which record a merged CoaSyncRecord was absorbed into.
-- Nullable and additive — existing rows are unaffected.
ALTER TABLE "CoaSyncRecord" ADD COLUMN "mergedIntoId" TEXT;

-- Reverse lookup ("what was merged into this record?") and the queue's
-- per-email grouping query.
CREATE INDEX IF NOT EXISTS "CoaSyncRecord_mergedIntoId_idx" ON "CoaSyncRecord"("mergedIntoId");
CREATE INDEX IF NOT EXISTS "CoaSyncRecord_emailIngestionId_idx" ON "CoaSyncRecord"("emailIngestionId");
