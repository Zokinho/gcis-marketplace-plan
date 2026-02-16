-- AlterTable: add marketplaceVisible column with default false
ALTER TABLE "Product" ADD COLUMN "marketplaceVisible" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: set marketplaceVisible = isActive so currently-active products remain visible
UPDATE "Product" SET "marketplaceVisible" = "isActive";

-- CreateIndex
CREATE INDEX "Product_marketplaceVisible_idx" ON "Product"("marketplaceVisible");
