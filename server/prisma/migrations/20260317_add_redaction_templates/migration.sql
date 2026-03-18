-- CreateTable
CREATE TABLE "RedactionTemplate" (
    "id" TEXT NOT NULL,
    "labName" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "regions" JSONB NOT NULL,
    "createdBy" TEXT,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RedactionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RedactionTemplate_labName_key" ON "RedactionTemplate"("labName");

-- CreateIndex
CREATE INDEX "RedactionTemplate_labName_idx" ON "RedactionTemplate"("labName");
