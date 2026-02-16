import express from 'express';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../index';
import marketplaceRouter from '../routes/marketplace';

vi.mock('../services/marketContextService', () => ({
  get30DayAvgPricesBatch: vi.fn().mockResolvedValue(new Map()),
  scorePriceVsMarket: vi.fn().mockResolvedValue(null),
}));

// ─── Test fixtures ───

const mockBuyer = {
  id: 'buyer-1',
  clerkUserId: 'clerk-buyer-1',
  zohoContactId: 'zoho-buyer-1',
  email: 'buyer@example.com',
  firstName: 'Jane',
  lastName: 'Buyer',
  companyName: 'Buyer Corp',
  contactType: 'Buyer',
  approved: true,
  eulaAcceptedAt: new Date(),
  docUploaded: true,
};

const mockSeller = {
  id: 'seller-1',
  clerkUserId: 'clerk-seller-1',
  zohoContactId: 'zoho-seller-1',
  email: 'seller@example.com',
  firstName: 'John',
  lastName: 'Seller',
  companyName: 'Seller Corp',
  contactType: 'Seller',
  approved: true,
  eulaAcceptedAt: new Date(),
  docUploaded: true,
};

const mockAdminUser = {
  id: 'admin-1',
  clerkUserId: 'clerk-admin-1',
  zohoContactId: 'zoho-admin-1',
  email: 'admin@example.com',
  firstName: 'Admin',
  lastName: 'User',
  companyName: 'Admin Corp',
  contactType: 'Buyer',
  approved: true,
  eulaAcceptedAt: new Date(),
  docUploaded: true,
};

const now = new Date();

function makeProduct(overrides: Record<string, any> = {}) {
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
    marketplaceVisible: true,
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

/** Minimal product shape returned by findMany (listing select) */
function makeListProduct(overrides: Record<string, any> = {}) {
  return {
    id: 'product-1',
    name: 'Blue Dream',
    category: 'Dried Flower',
    type: 'Hybrid',
    certification: 'Organic,GMP',
    thcMin: 18,
    thcMax: 22,
    cbdMin: 0.1,
    cbdMax: 0.5,
    pricePerUnit: 5.0,
    gramsAvailable: 5000,
    upcomingQty: 0,
    imageUrls: ['https://example.com/img1.jpg'],
    isActive: true,
    marketplaceVisible: true,
    matchCount: 5,
    ...overrides,
  };
}

// ─── Test app factory ───

function createTestApp(user: any = mockBuyer) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use('/', marketplaceRouter);
  return app;
}

// ─── Tests ───

describe('GET /products - Product listing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns products with default pagination (page=1, limit=20)', async () => {
    const products = [makeListProduct()];
    vi.mocked(prisma.product.findMany).mockResolvedValue(products as any);
    vi.mocked(prisma.product.count).mockResolvedValue(1);

    const app = createTestApp();
    const res = await request(app).get('/products');

    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(1);
    expect(res.body.products[0].id).toBe('product-1');
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
    // isActive = true is always in the where clause
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true }),
        skip: 0,
        take: 20,
      }),
    );
  });

  it('respects custom pagination params', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.product.count).mockResolvedValue(50);

    const app = createTestApp();
    const res = await request(app).get('/products?page=3&limit=10');

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({
      page: 3,
      limit: 10,
      total: 50,
      totalPages: 5,
    });
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20, // (3-1) * 10
        take: 10,
      }),
    );
  });

  it('filters by category', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.product.count).mockResolvedValue(0);

    const app = createTestApp();
    await request(app).get('/products?category=Dried%20Flower');

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          category: 'Dried Flower',
        }),
      }),
    );
  });

  it('filters by type', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.product.count).mockResolvedValue(0);

    const app = createTestApp();
    await request(app).get('/products?type=Hybrid');

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          type: 'Hybrid',
        }),
      }),
    );
  });

  it('filters by THC range (thcMin and thcMax)', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.product.count).mockResolvedValue(0);

    const app = createTestApp();
    await request(app).get('/products?thcMin=15&thcMax=25');

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          thcMax: { gte: 15, lte: 25 },
        }),
      }),
    );
  });

  it('filters by CBD range (cbdMin and cbdMax)', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.product.count).mockResolvedValue(0);

    const app = createTestApp();
    await request(app).get('/products?cbdMin=1&cbdMax=10');

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          cbdMax: { gte: 1, lte: 10 },
        }),
      }),
    );
  });

  it('filters by price range (priceMin and priceMax)', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.product.count).mockResolvedValue(0);

    const app = createTestApp();
    await request(app).get('/products?priceMin=3&priceMax=8');

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          pricePerUnit: { gte: 3, lte: 8 },
        }),
      }),
    );
  });

  it('filters by availability in_stock (gramsAvailable > 0)', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.product.count).mockResolvedValue(0);

    const app = createTestApp();
    await request(app).get('/products?availability=in_stock');

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          gramsAvailable: { gt: 0 },
        }),
      }),
    );
  });

  it('filters by availability upcoming (upcomingQty > 0)', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.product.count).mockResolvedValue(0);

    const app = createTestApp();
    await request(app).get('/products?availability=upcoming');

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          upcomingQty: { gt: 0 },
        }),
      }),
    );
  });

  it('filters by single certification (contains, insensitive)', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.product.count).mockResolvedValue(0);

    const app = createTestApp();
    await request(app).get('/products?certification=Organic');

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          certification: { contains: 'Organic', mode: 'insensitive' },
        }),
      }),
    );
  });

  it('filters by multiple comma-separated certifications (AND array)', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.product.count).mockResolvedValue(0);

    const app = createTestApp();
    await request(app).get('/products?certification=Organic,GMP');

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          AND: expect.arrayContaining([
            { certification: { contains: 'Organic', mode: 'insensitive' } },
            { certification: { contains: 'GMP', mode: 'insensitive' } },
          ]),
        }),
      }),
    );
  });

  it('filters by terpene (AND array of contains)', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.product.count).mockResolvedValue(0);

    const app = createTestApp();
    await request(app).get('/products?terpene=Myrcene,Limonene');

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          AND: expect.arrayContaining([
            { dominantTerpene: { contains: 'Myrcene', mode: 'insensitive' } },
            { dominantTerpene: { contains: 'Limonene', mode: 'insensitive' } },
          ]),
        }),
      }),
    );
  });

  it('handles short search string (< 3 chars) with ILIKE OR fallback', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.product.count).mockResolvedValue(0);

    const app = createTestApp();
    await request(app).get('/products?search=OG');

    // Short search should NOT call $queryRaw
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          OR: [
            { name: { contains: 'OG', mode: 'insensitive' } },
            { lineage: { contains: 'OG', mode: 'insensitive' } },
            { description: { contains: 'OG', mode: 'insensitive' } },
          ],
        }),
      }),
    );
  });

  it('handles long search string (>= 3 chars) with FTS when results found', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { id: 'product-1' },
      { id: 'product-2' },
    ] as any);
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      makeListProduct({ id: 'product-1' }),
      makeListProduct({ id: 'product-2', name: 'OG Kush' }),
    ] as any);
    vi.mocked(prisma.product.count).mockResolvedValue(2);

    const app = createTestApp();
    const res = await request(app).get('/products?search=Blue+Dream');

    expect(res.status).toBe(200);
    expect(prisma.$queryRaw).toHaveBeenCalled();
    // When FTS returns results, where should include id: { in: [...] }
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          id: expect.objectContaining({ in: ['product-1', 'product-2'] }),
        }),
      }),
    );
  });

  it('handles long search string FTS with no results (falls back to ILIKE)', async () => {
    // FTS returns empty
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as any);
    vi.mocked(prisma.product.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.product.count).mockResolvedValue(0);

    const app = createTestApp();
    await request(app).get('/products?search=Purple+Haze');

    expect(prisma.$queryRaw).toHaveBeenCalled();
    // Should fall back to ILIKE OR clause
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          OR: [
            { name: { contains: 'Purple Haze', mode: 'insensitive' } },
            { lineage: { contains: 'Purple Haze', mode: 'insensitive' } },
            { description: { contains: 'Purple Haze', mode: 'insensitive' } },
          ],
        }),
      }),
    );
  });

  it('filters by CBD:THC ratio when matches found', async () => {
    // $queryRaw for ratio check returns matching IDs
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { id: 'product-1' },
      { id: 'product-3' },
    ] as any);
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      makeListProduct({ id: 'product-1' }),
    ] as any);
    vi.mocked(prisma.product.count).mockResolvedValue(1);

    const app = createTestApp();
    const res = await request(app).get('/products?cbdThcRatio=1:1');

    expect(res.status).toBe(200);
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          thcMax: expect.objectContaining({ gt: 0 }),
          cbdMax: expect.objectContaining({ gt: 0 }),
          id: { in: ['product-1', 'product-3'] },
        }),
      }),
    );
  });

  it('returns empty result for CBD:THC ratio when no matches', async () => {
    // $queryRaw for ratio returns empty
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as any);

    const app = createTestApp();
    const res = await request(app).get('/products?cbdThcRatio=1:1');

    expect(res.status).toBe(200);
    expect(res.body.products).toEqual([]);
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });
    // Should short-circuit — findMany and count should NOT be called
    expect(prisma.product.findMany).not.toHaveBeenCalled();
    expect(prisma.product.count).not.toHaveBeenCalled();
  });

  it('sorts by name ascending (default)', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.product.count).mockResolvedValue(0);

    const app = createTestApp();
    await request(app).get('/products');

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { name: 'asc' },
      }),
    );
  });

  it('sorts by pricePerUnit descending', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.product.count).mockResolvedValue(0);

    const app = createTestApp();
    await request(app).get('/products?sort=pricePerUnit&order=desc');

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { pricePerUnit: 'desc' },
      }),
    );
  });

  it('sorts by relevance when FTS results available (manual re-ordering)', async () => {
    // FTS returns ordered IDs: product-2 ranked higher than product-1
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { id: 'product-2' },
      { id: 'product-1' },
    ] as any);
    // findMany returns them in arbitrary order
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      makeListProduct({ id: 'product-1', name: 'Blue Dream' }),
      makeListProduct({ id: 'product-2', name: 'Blue Dream OG' }),
    ] as any);
    vi.mocked(prisma.product.count).mockResolvedValue(2);

    const app = createTestApp();
    const res = await request(app).get('/products?search=Blue+Dream&sort=relevance');

    expect(res.status).toBe(200);
    // Products should be re-ordered by FTS rank
    expect(res.body.products[0].id).toBe('product-2');
    expect(res.body.products[1].id).toBe('product-1');
    expect(res.body.pagination.total).toBe(2);
    // When relevance sort is active, orderBy should be undefined (no Prisma sort)
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true }),
      }),
    );
  });
});

describe('GET /products/:id - Product detail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns full product details when found and active', async () => {
    const product = makeProduct();
    vi.mocked(prisma.product.findUnique).mockResolvedValue(product as any);

    const app = createTestApp(mockBuyer);
    const res = await request(app).get('/products/product-1');

    expect(res.status).toBe(200);
    expect(res.body.product).toBeDefined();
    expect(res.body.product.id).toBe('product-1');
    expect(res.body.product.name).toBe('Blue Dream');
    // sellerId should be stripped from the response
    expect(res.body.product.sellerId).toBeUndefined();
    expect(prisma.product.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'product-1' },
      }),
    );
  });

  it('returns 404 when product not found', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null);

    const app = createTestApp(mockBuyer);
    const res = await request(app).get('/products/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Product not found');
  });

  it('returns 404 when product is inactive', async () => {
    const product = makeProduct({ isActive: false });
    vi.mocked(prisma.product.findUnique).mockResolvedValue(product as any);

    const app = createTestApp(mockBuyer);
    const res = await request(app).get('/products/product-1');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Product not found');
  });

  it('hides CoA fields for buyers (canViewCoa = false)', async () => {
    const product = makeProduct();
    vi.mocked(prisma.product.findUnique).mockResolvedValue(product as any);

    const app = createTestApp(mockBuyer);
    const res = await request(app).get('/products/product-1');

    expect(res.status).toBe(200);
    expect(res.body.canViewCoa).toBe(false);
    // CoA fields should be nullified/emptied
    expect(res.body.product.coaUrls).toEqual([]);
    expect(res.body.product.coaPdfUrl).toBeNull();
    expect(res.body.product.labName).toBeNull();
    expect(res.body.product.testDate).toBeNull();
    expect(res.body.product.reportNumber).toBeNull();
    expect(res.body.product.testResults).toBeNull();
    expect(res.body.product.coaJobId).toBeNull();
    expect(res.body.product.coaProcessedAt).toBeNull();
  });

  it('shows CoA fields for product owner (seller who owns the product)', async () => {
    const product = makeProduct({ sellerId: 'seller-1' });
    vi.mocked(prisma.product.findUnique).mockResolvedValue(product as any);

    const app = createTestApp(mockSeller);
    const res = await request(app).get('/products/product-1');

    expect(res.status).toBe(200);
    expect(res.body.canViewCoa).toBe(true);
    expect(res.body.product.coaUrls).toEqual(['https://example.com/coa1.pdf']);
    expect(res.body.product.coaPdfUrl).toBe('https://example.com/coa.pdf');
    expect(res.body.product.labName).toBe('Test Lab Inc');
    expect(res.body.product.reportNumber).toBe('RPT-001');
    expect(res.body.product.testResults).toEqual({ thc: 20, cbd: 0.3 });
  });

  it('shows CoA fields for any seller (even non-owner)', async () => {
    const otherSeller = {
      ...mockSeller,
      id: 'seller-2',
      clerkUserId: 'clerk-seller-2',
      email: 'other-seller@example.com',
    };
    const product = makeProduct({ sellerId: 'seller-1' });
    vi.mocked(prisma.product.findUnique).mockResolvedValue(product as any);

    const app = createTestApp(otherSeller);
    const res = await request(app).get('/products/product-1');

    expect(res.status).toBe(200);
    // isSeller check: contactType includes 'Seller'
    expect(res.body.canViewCoa).toBe(true);
    expect(res.body.product.labName).toBe('Test Lab Inc');
  });

  it('shows CoA fields for admin user (email in ADMIN_EMAILS)', async () => {
    const product = makeProduct({ sellerId: 'seller-1' });
    vi.mocked(prisma.product.findUnique).mockResolvedValue(product as any);

    // Set ADMIN_EMAILS env var to include admin user
    const originalAdminEmails = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = 'admin@example.com';

    try {
      const app = createTestApp(mockAdminUser);
      const res = await request(app).get('/products/product-1');

      expect(res.status).toBe(200);
      expect(res.body.canViewCoa).toBe(true);
      expect(res.body.product.labName).toBe('Test Lab Inc');
    } finally {
      process.env.ADMIN_EMAILS = originalAdminEmails;
    }
  });

  it('strips sellerId from the response object', async () => {
    const product = makeProduct();
    vi.mocked(prisma.product.findUnique).mockResolvedValue(product as any);

    const app = createTestApp(mockSeller);
    const res = await request(app).get('/products/product-1');

    expect(res.status).toBe(200);
    expect(res.body.product.sellerId).toBeUndefined();
    // But other fields should still be present
    expect(res.body.product.id).toBe('product-1');
    expect(res.body.product.name).toBe('Blue Dream');
  });

  it('handles unauthenticated request (no req.user) by hiding CoA', async () => {
    const product = makeProduct();
    vi.mocked(prisma.product.findUnique).mockResolvedValue(product as any);

    const app = createTestApp(undefined);
    const res = await request(app).get('/products/product-1');

    expect(res.status).toBe(200);
    expect(res.body.canViewCoa).toBe(false);
    expect(res.body.product.coaUrls).toEqual([]);
    expect(res.body.product.testResults).toBeNull();
  });
});

describe('GET /filters - Available filter options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns distinct categories, types, certifications, and terpenes', async () => {
    // findMany is called 4 times in Promise.all
    vi.mocked(prisma.product.findMany)
      .mockResolvedValueOnce([
        { category: 'Dried Flower' },
        { category: 'Pre-Rolls' },
        { category: 'Extracts' },
      ] as any)
      .mockResolvedValueOnce([
        { type: 'Hybrid' },
        { type: 'Indica' },
        { type: 'Sativa' },
      ] as any)
      .mockResolvedValueOnce([
        { certification: 'Organic,GMP' },
        { certification: 'GMP' },
        { certification: 'ISO,Organic' },
      ] as any)
      .mockResolvedValueOnce([
        { dominantTerpene: 'Myrcene;Limonene' },
        { dominantTerpene: 'Caryophyllene;Myrcene' },
        { dominantTerpene: 'Pinene' },
      ] as any);

    const app = createTestApp();
    const res = await request(app).get('/filters');

    expect(res.status).toBe(200);
    expect(res.body.categories).toEqual(['Dried Flower', 'Pre-Rolls', 'Extracts']);
    expect(res.body.types).toEqual(['Hybrid', 'Indica', 'Sativa']);
    // Certifications should be deduplicated and sorted
    expect(res.body.certifications).toEqual(['GMP', 'ISO', 'Organic']);
    // Terpenes should be deduplicated and sorted
    expect(res.body.terpenes).toEqual(['Caryophyllene', 'Limonene', 'Myrcene', 'Pinene']);
  });

  it('returns empty arrays when no active products exist', async () => {
    vi.mocked(prisma.product.findMany)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any);

    const app = createTestApp();
    const res = await request(app).get('/filters');

    expect(res.status).toBe(200);
    expect(res.body.categories).toEqual([]);
    expect(res.body.types).toEqual([]);
    expect(res.body.certifications).toEqual([]);
    expect(res.body.terpenes).toEqual([]);
  });

  it('handles null values in category/type gracefully', async () => {
    vi.mocked(prisma.product.findMany)
      .mockResolvedValueOnce([
        { category: 'Dried Flower' },
        { category: null },
      ] as any)
      .mockResolvedValueOnce([
        { type: null },
      ] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any);

    const app = createTestApp();
    const res = await request(app).get('/filters');

    expect(res.status).toBe(200);
    // null values should be filtered out by .filter(Boolean)
    expect(res.body.categories).toEqual(['Dried Flower']);
    expect(res.body.types).toEqual([]);
  });
});
