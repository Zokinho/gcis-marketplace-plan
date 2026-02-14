import express from 'express';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../index';
import myListingsRouter from '../routes/myListings';

// Mock Zoho API calls
vi.mock('../services/zohoApi', () => ({
  pushProductUpdate: vi.fn().mockResolvedValue(undefined),
  createZohoProduct: vi.fn().mockResolvedValue('zoho-new-123'),
  createProductReviewTask: vi.fn().mockResolvedValue(undefined),
  uploadProductFiles: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/zohoAuth', () => ({
  zohoRequest: vi.fn().mockResolvedValue({ data: {} }),
}));

// ─── Test fixtures ───

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

const mockProduct = {
  id: 'product-1',
  name: 'Test Strain',
  description: 'A fine product',
  category: 'Dried Flower',
  type: 'Indica',
  licensedProducer: 'LP Co',
  lineage: null,
  dominantTerpene: 'Myrcene',
  certification: 'Organic',
  harvestDate: null,
  isActive: true,
  requestPending: false,
  pricePerUnit: 5.0,
  gramsAvailable: 5000,
  upcomingQty: 1000,
  minQtyRequest: 100,
  thcMin: 20,
  thcMax: 25,
  cbdMin: 0,
  cbdMax: 1,
  imageUrls: [],
  source: 'zoho',
  lastSyncedAt: new Date(),
  sellerId: 'seller-1',
  zohoProductId: 'zoho-prod-1',
  _count: { bids: 5 },
};

const mockProduct2 = {
  ...mockProduct,
  id: 'product-2',
  name: 'Another Strain',
  zohoProductId: 'zoho-prod-2',
  _count: { bids: 2 },
};

const mockShare = {
  id: 'share-1',
  token: 'random-base64url-token',
  label: 'Seller Corp — 2 products',
  productIds: ['product-1', 'product-2'],
  active: true,
  expiresAt: null,
  useCount: 0,
  lastUsedAt: null,
  createdById: 'seller-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── Test app factory ───

function createTestApp(router: express.Router, user: any = mockSeller) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use('/', router);
  return app;
}

// ─── Tests ───

describe('GET / - List seller listings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // bid.groupBy is not in global setup, add it here
    (prisma.bid as any).groupBy = vi.fn();
  });

  it('returns seller listings with bid counts', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([mockProduct, mockProduct2] as any);
    (prisma.bid as any).groupBy.mockResolvedValue([
      { productId: 'product-1', _count: 3 },
      { productId: 'product-2', _count: 1 },
    ]);

    const app = createTestApp(myListingsRouter);
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body.listings).toHaveLength(2);
    expect(res.body.listings[0].totalBids).toBe(5);
    expect(res.body.listings[0].pendingBids).toBe(3);
    expect(res.body.listings[1].totalBids).toBe(2);
    expect(res.body.listings[1].pendingBids).toBe(1);
    // _count should be stripped
    expect(res.body.listings[0]._count).toBeUndefined();
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sellerId: 'seller-1' },
        orderBy: { name: 'asc' },
      }),
    );
    expect((prisma.bid as any).groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['productId'],
        where: {
          product: { sellerId: 'seller-1' },
          status: 'PENDING',
        },
      }),
    );
  });

  it('returns empty listings when seller has no products', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);
    (prisma.bid as any).groupBy.mockResolvedValue([]);

    const app = createTestApp(myListingsRouter);
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body.listings).toHaveLength(0);
  });
});

describe('PATCH /:id - Update listing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.bid as any).groupBy = vi.fn();
  });

  it('updates price successfully', async () => {
    vi.mocked(prisma.product.findUnique)
      .mockResolvedValueOnce({
        id: 'product-1',
        sellerId: 'seller-1',
        zohoProductId: 'zoho-prod-1',
      } as any)
      .mockResolvedValueOnce({ ...mockProduct, pricePerUnit: 6.5 } as any);

    const app = createTestApp(myListingsRouter);
    const res = await request(app)
      .patch('/product-1')
      .send({ pricePerUnit: 6.5 });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Product updated');
    expect(res.body.product.pricePerUnit).toBe(6.5);
    const { pushProductUpdate } = await import('../services/zohoApi');
    expect(pushProductUpdate).toHaveBeenCalledWith('product-1', { pricePerUnit: 6.5 });
  });

  it('updates multiple fields at once', async () => {
    vi.mocked(prisma.product.findUnique)
      .mockResolvedValueOnce({
        id: 'product-1',
        sellerId: 'seller-1',
        zohoProductId: 'zoho-prod-1',
      } as any)
      .mockResolvedValueOnce({
        ...mockProduct,
        pricePerUnit: 7.0,
        gramsAvailable: 3000,
        upcomingQty: 500,
        description: 'Updated desc',
      } as any);

    const app = createTestApp(myListingsRouter);
    const res = await request(app)
      .patch('/product-1')
      .send({
        pricePerUnit: 7.0,
        gramsAvailable: 3000,
        upcomingQty: 500,
        description: 'Updated desc',
      });

    expect(res.status).toBe(200);
    expect(res.body.product.pricePerUnit).toBe(7.0);
    expect(res.body.product.gramsAvailable).toBe(3000);
    expect(res.body.product.upcomingQty).toBe(500);
    expect(res.body.product.description).toBe('Updated desc');
    const { pushProductUpdate } = await import('../services/zohoApi');
    expect(pushProductUpdate).toHaveBeenCalledWith('product-1', {
      pricePerUnit: 7.0,
      gramsAvailable: 3000,
      upcomingQty: 500,
      description: 'Updated desc',
    });
  });

  it('returns 404 when product not found', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null);

    const app = createTestApp(myListingsRouter);
    const res = await request(app)
      .patch('/nonexistent')
      .send({ pricePerUnit: 6.0 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Product not found');
  });

  it('returns 404 when product belongs to another seller', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      id: 'product-1',
      sellerId: 'other-seller',
      zohoProductId: 'zoho-prod-1',
    } as any);

    const app = createTestApp(myListingsRouter);
    const res = await request(app)
      .patch('/product-1')
      .send({ pricePerUnit: 6.0 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Product not found');
  });

  it('returns 400 when no fields provided', async () => {
    const app = createTestApp(myListingsRouter);
    const res = await request(app)
      .patch('/product-1')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toBeDefined();
  });
});

describe('PATCH /:id/toggle-active', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.bid as any).groupBy = vi.fn();
  });

  it('activates an inactive product', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      id: 'product-1',
      sellerId: 'seller-1',
      zohoProductId: 'zoho-prod-1',
      isActive: false,
      requestPending: false,
    } as any);
    vi.mocked(prisma.product.update).mockResolvedValue({ ...mockProduct, isActive: true } as any);

    const app = createTestApp(myListingsRouter);
    const res = await request(app).patch('/product-1/toggle-active');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Product activated');
    expect(res.body.isActive).toBe(true);
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: { isActive: true },
    });
    const { zohoRequest } = await import('../services/zohoAuth');
    expect(zohoRequest).toHaveBeenCalledWith('PUT', '/Products/zoho-prod-1', {
      data: { data: [{ Product_Active: true }], trigger: [] },
    });
  });

  it('deactivates an active product', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      id: 'product-1',
      sellerId: 'seller-1',
      zohoProductId: 'zoho-prod-1',
      isActive: true,
      requestPending: false,
    } as any);
    vi.mocked(prisma.product.update).mockResolvedValue({ ...mockProduct, isActive: false } as any);

    const app = createTestApp(myListingsRouter);
    const res = await request(app).patch('/product-1/toggle-active');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Product paused');
    expect(res.body.isActive).toBe(false);
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: { isActive: false },
    });
  });

  it('returns 404 when product not found', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null);

    const app = createTestApp(myListingsRouter);
    const res = await request(app).patch('/nonexistent/toggle-active');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Product not found');
  });

  it('returns 400 when product is pending approval', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      id: 'product-1',
      sellerId: 'seller-1',
      zohoProductId: 'zoho-prod-1',
      isActive: false,
      requestPending: true,
    } as any);

    const app = createTestApp(myListingsRouter);
    const res = await request(app).patch('/product-1/toggle-active');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Cannot toggle a listing that is pending approval');
    expect(prisma.product.update).not.toHaveBeenCalled();
  });
});

describe('POST /share - Create seller share link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.bid as any).groupBy = vi.fn();
  });

  it('creates share with specific product IDs', async () => {
    // Verify ownership lookup
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: 'product-1' },
      { id: 'product-2' },
    ] as any);
    // Seller lookup for label
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ companyName: 'Seller Corp' } as any);
    vi.mocked(prisma.curatedShare.create).mockResolvedValue(mockShare as any);

    const app = createTestApp(myListingsRouter);
    const res = await request(app)
      .post('/share')
      .send({ productIds: ['product-1', 'product-2'], label: 'My Share' });

    expect(res.status).toBe(200);
    expect(res.body.share).toBeDefined();
    expect(res.body.shareUrl).toBeDefined();
    expect(res.body.shareUrl).toContain('/share/');
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['product-1', 'product-2'] }, sellerId: 'seller-1' },
        select: { id: true },
      }),
    );
    expect(prisma.curatedShare.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productIds: ['product-1', 'product-2'],
          createdById: 'seller-1',
        }),
      }),
    );
  });

  it('creates share with all active products when no productIds provided', async () => {
    // Active products lookup
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: 'product-1' },
      { id: 'product-2' },
    ] as any);
    // Seller lookup for label
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ companyName: 'Seller Corp' } as any);
    vi.mocked(prisma.curatedShare.create).mockResolvedValue(mockShare as any);

    const app = createTestApp(myListingsRouter);
    const res = await request(app)
      .post('/share')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.share).toBeDefined();
    expect(res.body.shareUrl).toBeDefined();
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sellerId: 'seller-1', isActive: true },
        select: { id: true },
      }),
    );
    expect(prisma.curatedShare.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productIds: ['product-1', 'product-2'],
          createdById: 'seller-1',
        }),
      }),
    );
  });

  it('returns 400 when some products are not owned by the seller', async () => {
    // Only 1 of 2 products found for seller
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: 'product-1' },
    ] as any);

    const app = createTestApp(myListingsRouter);
    const res = await request(app)
      .post('/share')
      .send({ productIds: ['product-1', 'product-other'] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Some products not found or not yours');
    expect(prisma.curatedShare.create).not.toHaveBeenCalled();
  });

  it('returns 400 when seller has no active products and no productIds given', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);

    const app = createTestApp(myListingsRouter);
    const res = await request(app)
      .post('/share')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No active products to share');
    expect(prisma.curatedShare.create).not.toHaveBeenCalled();
  });
});

describe('GET /shares - List seller shares', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.bid as any).groupBy = vi.fn();
  });

  it('returns seller share links with URLs', async () => {
    vi.mocked(prisma.curatedShare.findMany).mockResolvedValue([mockShare] as any);

    const app = createTestApp(myListingsRouter);
    const res = await request(app).get('/shares');

    expect(res.status).toBe(200);
    expect(res.body.shares).toHaveLength(1);
    expect(res.body.shares[0].label).toBe('Seller Corp — 2 products');
    expect(res.body.shares[0].shareUrl).toContain('/share/random-base64url-token');
    expect(prisma.curatedShare.findMany).toHaveBeenCalledWith({
      where: { createdById: 'seller-1' },
      orderBy: { createdAt: 'desc' },
    });
  });
});

describe('DELETE /shares/:id - Deactivate seller share', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.bid as any).groupBy = vi.fn();
  });

  it('deactivates a share successfully', async () => {
    vi.mocked(prisma.curatedShare.findUnique).mockResolvedValue(mockShare as any);
    vi.mocked(prisma.curatedShare.update).mockResolvedValue({ ...mockShare, active: false } as any);

    const app = createTestApp(myListingsRouter);
    const res = await request(app).delete('/shares/share-1');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Share link deactivated');
    expect(prisma.curatedShare.update).toHaveBeenCalledWith({
      where: { id: 'share-1' },
      data: { active: false },
    });
  });

  it('returns 404 when share not found', async () => {
    vi.mocked(prisma.curatedShare.findUnique).mockResolvedValue(null);

    const app = createTestApp(myListingsRouter);
    const res = await request(app).delete('/shares/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Share not found');
  });

  it('returns 404 when share belongs to another seller', async () => {
    vi.mocked(prisma.curatedShare.findUnique).mockResolvedValue({
      ...mockShare,
      createdById: 'other-seller',
    } as any);

    const app = createTestApp(myListingsRouter);
    const res = await request(app).delete('/shares/share-1');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Share not found');
    expect(prisma.curatedShare.update).not.toHaveBeenCalled();
  });
});
