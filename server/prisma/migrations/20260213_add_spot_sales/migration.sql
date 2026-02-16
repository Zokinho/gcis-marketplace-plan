-- CreateTable
CREATE TABLE "SpotSale" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "originalPrice" DOUBLE PRECISION NOT NULL,
    "spotPrice" DOUBLE PRECISION NOT NULL,
    "discountPercent" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpotSale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpotSale_active_idx" ON "SpotSale"("active");

-- CreateIndex
CREATE INDEX "SpotSale_expiresAt_idx" ON "SpotSale"("expiresAt");

-- CreateIndex
CREATE INDEX "SpotSale_createdById_idx" ON "SpotSale"("createdById");

-- AddForeignKey
ALTER TABLE "SpotSale" ADD CONSTRAINT "SpotSale_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotSale" ADD CONSTRAINT "SpotSale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
