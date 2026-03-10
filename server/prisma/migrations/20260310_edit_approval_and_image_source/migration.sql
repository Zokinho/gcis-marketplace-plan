-- AlterTable: Add edit approval and image source fields to Product
ALTER TABLE "Product" ADD COLUMN "editPending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "pendingEdits" JSONB;
ALTER TABLE "Product" ADD COLUMN "imageSource" TEXT NOT NULL DEFAULT 'zoho';

-- CreateIndex
CREATE INDEX "Product_editPending_idx" ON "Product"("editPending");

-- AlterEnum: Add EDIT_APPROVED and EDIT_REJECTED to NotificationType
ALTER TYPE "NotificationType" ADD VALUE 'EDIT_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'EDIT_REJECTED';
