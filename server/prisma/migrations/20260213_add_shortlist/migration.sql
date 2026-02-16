-- CreateEnum
ALTER TYPE "NotificationType" ADD VALUE 'SHORTLIST_PRICE_DROP';

-- CreateTable
CREATE TABLE "ShortlistItem" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShortlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShortlistItem_buyerId_idx" ON "ShortlistItem"("buyerId");

-- CreateIndex
CREATE INDEX "ShortlistItem_productId_idx" ON "ShortlistItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ShortlistItem_buyerId_productId_key" ON "ShortlistItem"("buyerId", "productId");

-- AddForeignKey
ALTER TABLE "ShortlistItem" ADD CONSTRAINT "ShortlistItem_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortlistItem" ADD CONSTRAINT "ShortlistItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
