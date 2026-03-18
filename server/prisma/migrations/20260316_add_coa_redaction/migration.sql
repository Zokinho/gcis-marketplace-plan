-- AlterTable: Add CoA redaction fields to Product
ALTER TABLE "Product" ADD COLUMN "coaOriginalKey" TEXT;
ALTER TABLE "Product" ADD COLUMN "coaRedactedKey" TEXT;
ALTER TABLE "Product" ADD COLUMN "coaPageCount" INTEGER;

-- CreateTable: RedactionRegion
CREATE TABLE "RedactionRegion" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "xPct" DOUBLE PRECISION NOT NULL,
    "yPct" DOUBLE PRECISION NOT NULL,
    "wPct" DOUBLE PRECISION NOT NULL,
    "hPct" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'high',
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RedactionRegion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RedactionRegion_productId_idx" ON "RedactionRegion"("productId");
CREATE INDEX "RedactionRegion_productId_page_idx" ON "RedactionRegion"("productId", "page");

-- AddForeignKey
ALTER TABLE "RedactionRegion" ADD CONSTRAINT "RedactionRegion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
