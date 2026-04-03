-- AlterTable
ALTER TABLE "IsoRequest" ADD COLUMN "title" TEXT NOT NULL DEFAULT '';

-- Remove default after backfill
ALTER TABLE "IsoRequest" ALTER COLUMN "title" DROP DEFAULT;
