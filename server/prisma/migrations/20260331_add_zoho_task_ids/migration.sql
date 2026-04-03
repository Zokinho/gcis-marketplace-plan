-- AlterTable
ALTER TABLE "User" ADD COLUMN "zohoTaskId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_zohoTaskId_key" ON "User"("zohoTaskId");

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "zohoReviewTaskId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Product_zohoReviewTaskId_key" ON "Product"("zohoReviewTaskId");
