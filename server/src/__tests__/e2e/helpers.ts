import express from 'express';

// ─── Fixture factories ───

export function makeBuyer(overrides: Record<string, any> = {}) {
  return {
    id: 'buyer-1',
    clerkUserId: 'clerk-buyer-1',
    zohoContactId: 'zoho-buyer-1',
    email: 'buyer@example.com',
    firstName: 'Jane',
    lastName: 'Buyer',
    companyName: 'Buyer Corp',
    contactType: 'Buyer',
    approved: true,
    isAdmin: false,
    eulaAcceptedAt: new Date('2025-06-01'),
    docUploaded: true,
    mustChangePassword: false,
    notificationPrefs: null,
    ...overrides,
  };
}

export function makeSeller(overrides: Record<string, any> = {}) {
  return {
    id: 'seller-1',
    clerkUserId: 'clerk-seller-1',
    zohoContactId: 'zoho-seller-1',
    email: 'seller@example.com',
    firstName: 'John',
    lastName: 'Seller',
    companyName: 'Seller Corp',
    contactType: 'Seller',
    approved: true,
    isAdmin: false,
    eulaAcceptedAt: new Date('2025-06-01'),
    docUploaded: true,
    mustChangePassword: false,
    notificationPrefs: null,
    ...overrides,
  };
}

export function makeAdmin(overrides: Record<string, any> = {}) {
  return {
    id: 'admin-1',
    clerkUserId: 'clerk-admin-1',
    zohoContactId: 'zoho-admin-1',
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    companyName: 'Admin Corp',
    contactType: 'Seller',
    approved: true,
    isAdmin: true,
    eulaAcceptedAt: new Date('2025-06-01'),
    docUploaded: true,
    mustChangePassword: false,
    notificationPrefs: null,
    ...overrides,
  };
}

export function makeProduct(overrides: Record<string, any> = {}) {
  const now = new Date();
  return {
    id: 'product-1',
    zohoProductId: 'zoho-prod-1',
    productCode: 'PC-001',
    name: 'Blue Dream',
    description: 'A classic hybrid strain',
    category: 'Dried Flower',
    type: 'Hybrid',
    growthMedium: 'Indoor',
    lineage: 'Blueberry x Haze',
    harvestDate: now,
    isActive: true,
    requestPending: false,
    pricePerUnit: 5.0,
    minQtyRequest: 100,
    gramsAvailable: 5000,
    upcomingQty: 0,
    thcMin: 18,
    thcMax: 22,
    cbdMin: 0.1,
    cbdMax: 0.5,
    dominantTerpene: 'Myrcene;Limonene',
    highestTerpenes: null,
    aromas: null,
    certification: 'Organic,GMP',
    budSizePopcorn: 10,
    budSizeSmall: 20,
    budSizeMedium: 40,
    budSizeLarge: 20,
    budSizeXLarge: 10,
    imageUrls: ['https://example.com/img1.jpg'],
    coaUrls: ['https://example.com/coa1.pdf'],
    labName: 'Test Lab Inc',
    testDate: now,
    reportNumber: 'RPT-001',
    coaJobId: 'coa-job-1',
    coaPdfUrl: 'https://example.com/coa.pdf',
    coaProcessedAt: now,
    testResults: { thc: 20, cbd: 0.3 },
    source: 'zoho',
    matchCount: 5,
    createdAt: now,
    updatedAt: now,
    sellerId: 'seller-1',
    seller: { avgFulfillmentScore: 92 },
    ...overrides,
  };
}

export function makeBid(overrides: Record<string, any> = {}) {
  return {
    id: 'bid-1',
    productId: 'product-1',
    buyerId: 'buyer-1',
    pricePerUnit: 4.5,
    quantity: 500,
    totalValue: 2250,
    proximityScore: 90,
    notes: null,
    status: 'PENDING',
    zohoTaskId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function makeTransaction(overrides: Record<string, any> = {}) {
  return {
    id: 'tx-1',
    status: 'pending',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    productId: 'product-1',
    bidId: 'bid-1',
    quantity: 500,
    pricePerUnit: 4.5,
    totalValue: 2250,
    actualQuantityDelivered: null,
    deliveryOnTime: null,
    qualityAsExpected: null,
    zohoDealId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Multi-router E2E app factory ───

export function createE2EApp(
  user: any,
  routes: Record<string, express.Router>,
) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  for (const [path, router] of Object.entries(routes)) {
    app.use(path, router);
  }
  return app;
}
