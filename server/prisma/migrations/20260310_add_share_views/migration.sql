-- CreateTable
CREATE TABLE "ShareView" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "productId" TEXT,
    "ipHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShareView_shareId_idx" ON "ShareView"("shareId");

-- CreateIndex
CREATE INDEX "ShareView_shareId_viewedAt_idx" ON "ShareView"("shareId", "viewedAt");

-- AddForeignKey
ALTER TABLE "ShareView" ADD CONSTRAINT "ShareView_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "CuratedShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
