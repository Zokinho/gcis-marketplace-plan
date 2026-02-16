-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "BidStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'COUNTERED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BID_RECEIVED', 'BID_ACCEPTED', 'BID_REJECTED', 'BID_COUNTERED', 'BID_OUTCOME', 'PRODUCT_NEW', 'PRODUCT_PRICE', 'PRODUCT_STOCK', 'MATCH_SUGGESTION', 'COA_PROCESSED', 'PREDICTION_DUE', 'SYSTEM_ANNOUNCEMENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "zohoContactId" TEXT,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "companyName" TEXT,
    "title" TEXT,
    "contactType" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "eulaAcceptedAt" TIMESTAMP(3),
    "docUploaded" BOOLEAN NOT NULL DEFAULT false,
    "mailingCountry" TEXT,
    "phone" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastTransactionDate" TIMESTAMP(3),
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "totalTransactionValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgFulfillmentScore" DOUBLE PRECISION,
    "notificationPrefs" JSONB,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "zohoProductId" TEXT NOT NULL,
    "productCode" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "type" TEXT,
    "licensedProducer" TEXT,
    "growthMedium" TEXT,
    "lineage" TEXT,
    "harvestDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "requestPending" BOOLEAN NOT NULL DEFAULT false,
    "sellerId" TEXT NOT NULL,
    "pricePerUnit" DOUBLE PRECISION,
    "minQtyRequest" DOUBLE PRECISION,
    "gramsAvailable" DOUBLE PRECISION,
    "upcomingQty" DOUBLE PRECISION,
    "thcMin" DOUBLE PRECISION,
    "thcMax" DOUBLE PRECISION,
    "cbdMin" DOUBLE PRECISION,
    "cbdMax" DOUBLE PRECISION,
    "dominantTerpene" TEXT,
    "highestTerpenes" TEXT,
    "totalTerpenePercent" DOUBLE PRECISION,
    "aromas" TEXT,
    "certification" TEXT,
    "budSizePopcorn" DOUBLE PRECISION,
    "budSizeSmall" DOUBLE PRECISION,
    "budSizeMedium" DOUBLE PRECISION,
    "budSizeLarge" DOUBLE PRECISION,
    "budSizeXLarge" DOUBLE PRECISION,
    "imageUrls" TEXT[],
    "coaUrls" TEXT[],
    "labName" TEXT,
    "testDate" TIMESTAMP(3),
    "reportNumber" TEXT,
    "coaJobId" TEXT,
    "coaPdfUrl" TEXT,
    "coaProcessedAt" TIMESTAMP(3),
    "testResults" JSONB,
    "source" TEXT NOT NULL DEFAULT 'zoho',
    "matchCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "zohoTaskId" TEXT,
    "productId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "pricePerUnit" DOUBLE PRECISION NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "totalValue" DOUBLE PRECISION NOT NULL,
    "proximityScore" DOUBLE PRECISION,
    "status" "BidStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "bidId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "pricePerUnit" DOUBLE PRECISION NOT NULL,
    "totalValue" DOUBLE PRECISION NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "actualQuantityDelivered" DOUBLE PRECISION,
    "deliveryOnTime" BOOLEAN,
    "qualityAsExpected" BOOLEAN,
    "outcomeNotes" TEXT,
    "outcomeRecordedAt" TIMESTAMP(3),
    "zohoTaskId" TEXT,
    "zohoDealId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "breakdown" JSONB NOT NULL,
    "insights" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "convertedBidId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerScore" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "fillRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveryScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pricingScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overallScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transactionsScored" INTEGER NOT NULL DEFAULT 0,
    "lastCalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "predictedDate" TIMESTAMP(3) NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "avgIntervalDays" DOUBLE PRECISION NOT NULL,
    "basedOnTransactions" INTEGER NOT NULL,
    "lastTransactionId" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurnSignal" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "categoryName" TEXT,
    "riskLevel" TEXT NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "daysSincePurchase" INTEGER NOT NULL,
    "avgIntervalDays" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "resolvedAt" TIMESTAMP(3),
    "resolvedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChurnSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropensityScore" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL DEFAULT '_all',
    "overallScore" DOUBLE PRECISION NOT NULL,
    "recencyScore" DOUBLE PRECISION NOT NULL,
    "frequencyScore" DOUBLE PRECISION NOT NULL,
    "monetaryScore" DOUBLE PRECISION NOT NULL,
    "categoryAffinity" DOUBLE PRECISION NOT NULL,
    "engagementScore" DOUBLE PRECISION NOT NULL,
    "features" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropensityScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketPrice" (
    "id" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "avgPrice" DOUBLE PRECISION NOT NULL,
    "minPrice" DOUBLE PRECISION NOT NULL,
    "maxPrice" DOUBLE PRECISION NOT NULL,
    "transactionCount" INTEGER NOT NULL,
    "totalVolume" DOUBLE PRECISION NOT NULL,
    "rollingAvg7d" DOUBLE PRECISION,
    "rollingAvg30d" DOUBLE PRECISION,
    "priceChange7d" DOUBLE PRECISION,
    "priceChange30d" DOUBLE PRECISION,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recordCount" INTEGER,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoaSyncRecord" (
    "id" TEXT NOT NULL,
    "coaJobId" TEXT NOT NULL,
    "coaProductId" TEXT,
    "emailIngestionId" TEXT,
    "marketplaceProductId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "suggestedSellerId" TEXT,
    "confirmedSellerId" TEXT,
    "suggestedSellerName" TEXT,
    "confidence" TEXT,
    "matchReason" TEXT,
    "emailSender" TEXT,
    "emailSubject" TEXT,
    "coaProductName" TEXT,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoaSyncRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuratedShare" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "productIds" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,

    CONSTRAINT "CuratedShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkUserId_key" ON "User"("clerkUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_zohoContactId_key" ON "User"("zohoContactId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Product_zohoProductId_key" ON "Product"("zohoProductId");

-- CreateIndex
CREATE INDEX "Product_sellerId_idx" ON "Product"("sellerId");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_isActive_idx" ON "Product"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Bid_zohoTaskId_key" ON "Bid"("zohoTaskId");

-- CreateIndex
CREATE INDEX "Bid_buyerId_idx" ON "Bid"("buyerId");

-- CreateIndex
CREATE INDEX "Bid_productId_idx" ON "Bid"("productId");

-- CreateIndex
CREATE INDEX "Bid_status_idx" ON "Bid"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_bidId_key" ON "Transaction"("bidId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_zohoTaskId_key" ON "Transaction"("zohoTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_zohoDealId_key" ON "Transaction"("zohoDealId");

-- CreateIndex
CREATE INDEX "Transaction_buyerId_idx" ON "Transaction"("buyerId");

-- CreateIndex
CREATE INDEX "Transaction_sellerId_idx" ON "Transaction"("sellerId");

-- CreateIndex
CREATE INDEX "Transaction_productId_idx" ON "Transaction"("productId");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "Match_buyerId_idx" ON "Match"("buyerId");

-- CreateIndex
CREATE INDEX "Match_status_idx" ON "Match"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Match_buyerId_productId_key" ON "Match"("buyerId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "SellerScore_sellerId_key" ON "SellerScore"("sellerId");

-- CreateIndex
CREATE INDEX "Prediction_buyerId_idx" ON "Prediction"("buyerId");

-- CreateIndex
CREATE UNIQUE INDEX "Prediction_buyerId_categoryName_key" ON "Prediction"("buyerId", "categoryName");

-- CreateIndex
CREATE INDEX "ChurnSignal_buyerId_idx" ON "ChurnSignal"("buyerId");

-- CreateIndex
CREATE INDEX "ChurnSignal_riskLevel_idx" ON "ChurnSignal"("riskLevel");

-- CreateIndex
CREATE INDEX "ChurnSignal_isActive_idx" ON "ChurnSignal"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PropensityScore_buyerId_categoryName_key" ON "PropensityScore"("buyerId", "categoryName");

-- CreateIndex
CREATE UNIQUE INDEX "MarketPrice_categoryName_periodStart_key" ON "MarketPrice"("categoryName", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CoaSyncRecord_coaJobId_key" ON "CoaSyncRecord"("coaJobId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CuratedShare_token_key" ON "CuratedShare"("token");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerScore" ADD CONSTRAINT "SellerScore_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurnSignal" ADD CONSTRAINT "ChurnSignal_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropensityScore" ADD CONSTRAINT "PropensityScore_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuratedShare" ADD CONSTRAINT "CuratedShare_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

