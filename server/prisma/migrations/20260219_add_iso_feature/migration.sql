-- CreateEnum
CREATE TYPE "IsoStatus" AS ENUM ('OPEN', 'MATCHED', 'FULFILLED', 'CLOSED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ISO_MATCH_FOUND';
ALTER TYPE "NotificationType" ADD VALUE 'ISO_SELLER_RESPONSE';

-- CreateTable
CREATE TABLE "IsoRequest" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "category" TEXT,
    "type" TEXT,
    "certification" TEXT,
    "thcMin" DOUBLE PRECISION,
    "thcMax" DOUBLE PRECISION,
    "cbdMin" DOUBLE PRECISION,
    "cbdMax" DOUBLE PRECISION,
    "quantityMin" DOUBLE PRECISION,
    "quantityMax" DOUBLE PRECISION,
    "budgetMax" DOUBLE PRECISION,
    "notes" TEXT,
    "status" "IsoStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "matchedProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IsoRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IsoResponse" (
    "id" TEXT NOT NULL,
    "isoRequestId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "productId" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IsoResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IsoRequest_buyerId_idx" ON "IsoRequest"("buyerId");

-- CreateIndex
CREATE INDEX "IsoRequest_status_idx" ON "IsoRequest"("status");

-- CreateIndex
CREATE INDEX "IsoRequest_expiresAt_idx" ON "IsoRequest"("expiresAt");

-- CreateIndex
CREATE INDEX "IsoRequest_category_idx" ON "IsoRequest"("category");

-- CreateIndex
CREATE UNIQUE INDEX "IsoResponse_isoRequestId_sellerId_key" ON "IsoResponse"("isoRequestId", "sellerId");

-- CreateIndex
CREATE INDEX "IsoResponse_sellerId_idx" ON "IsoResponse"("sellerId");

-- CreateIndex
CREATE INDEX "IsoResponse_isoRequestId_idx" ON "IsoResponse"("isoRequestId");

-- AddForeignKey
ALTER TABLE "IsoRequest" ADD CONSTRAINT "IsoRequest_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IsoRequest" ADD CONSTRAINT "IsoRequest_matchedProductId_fkey" FOREIGN KEY ("matchedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IsoResponse" ADD CONSTRAINT "IsoResponse_isoRequestId_fkey" FOREIGN KEY ("isoRequestId") REFERENCES "IsoRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IsoResponse" ADD CONSTRAINT "IsoResponse_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IsoResponse" ADD CONSTRAINT "IsoResponse_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
