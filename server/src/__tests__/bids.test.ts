import express from 'express';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../index';
import bidsRouter from '../routes/bids';

// Mock Zoho API calls
vi.mock('../services/zohoApi', () => ({
  createBidTask: vi.fn().mockResolvedValue(undefined),
  updateBidTaskStatus: vi.fn().mockResolvedValue(undefined),
  updateBidTaskOutcome: vi.fn().mockResolvedValue(undefined),
  pushProductUpdate: vi.fn().mockResolvedValue(undefined),
  createDeal: vi.fn().mockResolvedValue(null),
  updateDealStage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/auditService', () => ({
  logAudit: vi.fn(),
  getRequestIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('../services/notificationService', () => ({
  createNotification: vi.fn(),
}));

vi.mock('../services/churnDetectionService', () => ({
  resolveOnPurchase: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/marketContextService', () => ({
  updateMarketPrice: vi.fn().mockResolvedValue(undefined),
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

const mockProduct = {
  id: 'product-1',
  name: 'Test Strain',
  zohoProductId: 'zoho-prod-1',
  sellerId: 'seller-1',
  isActive: true,
  pricePerUnit: 5.0,
  minQtyRequest: 100,
  gramsAvailable: 5000,
  category: 'Dried Flower',
  seller: mockSeller,
};

const mockBid = {
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
};

// ─── Test app factory ───

function createTestApp(router: express.Router, user: any = mockBuyer) {
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

describe('POST / - Create bid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a bid successfully', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(mockProduct as any);
    vi.mocked(prisma.bid.create).mockResolvedValue(mockBid as any);

    const app = createTestApp(bidsRouter, mockBuyer);
    const res = await request(app)
      .post('/')
      .send({ productId: 'product-1', pricePerUnit: 4.5, quantity: 500 });

    expect(res.status).toBe(201);
    expect(res.body.bid).toBeDefined();
    expect(res.body.bid.id).toBe('bid-1');
    expect(res.body.bid.status).toBe('PENDING');
    expect(prisma.product.findUnique).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      include: { seller: true },
    });
    expect(prisma.bid.create).toHaveBeenCalledTimes(1);
  });

  it('returns 404 for missing product', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null);

    const app = createTestApp(bidsRouter, mockBuyer);
    const res = await request(app)
      .post('/')
      .send({ productId: 'nonexistent', pricePerUnit: 4.5, quantity: 500 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Product not found');
    expect(prisma.bid.create).not.toHaveBeenCalled();
  });

  it('returns 400 for inactive product', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      ...mockProduct,
      isActive: false,
    } as any);

    const app = createTestApp(bidsRouter, mockBuyer);
    const res = await request(app)
      .post('/')
      .send({ productId: 'product-1', pricePerUnit: 4.5, quantity: 500 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('This product is not currently active');
    expect(prisma.bid.create).not.toHaveBeenCalled();
  });

  it('returns 400 when bidding on own product', async () => {
    // Seller bids on their own product
    vi.mocked(prisma.product.findUnique).mockResolvedValue(mockProduct as any);

    const app = createTestApp(bidsRouter, mockSeller);
    const res = await request(app)
      .post('/')
      .send({ productId: 'product-1', pricePerUnit: 4.5, quantity: 500 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('You cannot bid on your own product');
    expect(prisma.bid.create).not.toHaveBeenCalled();
  });

  it('returns 400 for validation errors (missing fields)', async () => {
    const app = createTestApp(bidsRouter, mockBuyer);
    const res = await request(app)
      .post('/')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toBeDefined();
    expect(res.body.details.length).toBeGreaterThan(0);
  });

  it('returns 400 for negative pricePerUnit', async () => {
    const app = createTestApp(bidsRouter, mockBuyer);
    const res = await request(app)
      .post('/')
      .send({ productId: 'product-1', pricePerUnit: -1, quantity: 500 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 when quantity is below minimum', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(mockProduct as any);

    const app = createTestApp(bidsRouter, mockBuyer);
    const res = await request(app)
      .post('/')
      .send({ productId: 'product-1', pricePerUnit: 4.5, quantity: 50 }); // min is 100

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Minimum order quantity');
  });
});

describe('GET / - Buyer bid history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns buyer bids with pagination', async () => {
    const bids = [
      { ...mockBid, product: { id: 'product-1', name: 'Test Strain', category: 'Dried Flower', type: null, certification: null, pricePerUnit: 5.0, imageUrls: [], isActive: true } },
    ];
    vi.mocked(prisma.bid.findMany).mockResolvedValue(bids as any);
    vi.mocked(prisma.bid.count).mockResolvedValue(1);

    const app = createTestApp(bidsRouter, mockBuyer);
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body.bids).toHaveLength(1);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBe(1);
    expect(res.body.pagination.page).toBe(1);
  });

  it('passes status filter to query', async () => {
    vi.mocked(prisma.bid.findMany).mockResolvedValue([]);
    vi.mocked(prisma.bid.count).mockResolvedValue(0);

    const app = createTestApp(bidsRouter, mockBuyer);
    await request(app).get('/?status=ACCEPTED');

    expect(prisma.bid.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { buyerId: 'buyer-1', status: 'ACCEPTED' },
      }),
    );
  });

  it('rejects invalid status values with 400', async () => {
    const app = createTestApp(bidsRouter, mockBuyer);
    const res = await request(app).get('/?status=INVALID');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(prisma.bid.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /seller - Seller incoming bids', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns bids on seller products', async () => {
    vi.mocked(prisma.bid.findMany).mockResolvedValue([]);
    vi.mocked(prisma.bid.count).mockResolvedValue(0);

    const app = createTestApp(bidsRouter, mockSeller);
    const res = await request(app).get('/seller');

    expect(res.status).toBe(200);
    expect(res.body.bids).toBeDefined();
    expect(res.body.pagination).toBeDefined();
    expect(prisma.bid.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { product: { sellerId: 'seller-1' } },
      }),
    );
  });

  it('returns 403 for non-seller users', async () => {
    const app = createTestApp(bidsRouter, mockBuyer);
    const res = await request(app).get('/seller');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Seller access required');
  });
});

describe('PATCH /:id/accept - Accept bid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates transaction on accept', async () => {
    const bidWithIncludes = {
      ...mockBid,
      product: {
        id: 'product-1',
        sellerId: 'seller-1',
        category: 'Dried Flower',
        zohoProductId: 'zoho-prod-1',
        gramsAvailable: 5000,
        name: 'Test Strain',
      },
      buyer: { zohoContactId: 'zoho-buyer-1', companyName: 'Buyer Corp' },
    };

    const mockTransaction = {
      id: 'tx-1',
      status: 'pending',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      productId: 'product-1',
      bidId: 'bid-1',
      quantity: 500,
      pricePerUnit: 4.5,
      totalValue: 2250,
    };

    vi.mocked(prisma.bid.findUnique).mockResolvedValue(bidWithIncludes as any);
    vi.mocked(prisma.$transaction).mockResolvedValue([mockTransaction, {}, {}] as any);

    const app = createTestApp(bidsRouter, mockSeller);
    const res = await request(app).patch('/bid-1/accept');

    expect(res.status).toBe(200);
    expect(res.body.transaction).toBeDefined();
    expect(res.body.transaction.id).toBe('tx-1');
    expect(res.body.transaction.status).toBe('pending');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when bid not found', async () => {
    vi.mocked(prisma.bid.findUnique).mockResolvedValue(null);

    const app = createTestApp(bidsRouter, mockSeller);
    const res = await request(app).patch('/nonexistent/accept');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Bid not found');
  });

  it('returns 403 when non-owner seller tries to accept', async () => {
    const bidWithIncludes = {
      ...mockBid,
      product: {
        id: 'product-1',
        sellerId: 'other-seller',
        category: 'Dried Flower',
        zohoProductId: 'zoho-prod-1',
        gramsAvailable: 5000,
        name: 'Test Strain',
      },
      buyer: { zohoContactId: 'zoho-buyer-1', companyName: 'Buyer Corp' },
    };

    vi.mocked(prisma.bid.findUnique).mockResolvedValue(bidWithIncludes as any);

    const app = createTestApp(bidsRouter, mockSeller);
    const res = await request(app).patch('/bid-1/accept');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Only the product seller can accept bids');
  });

  it('returns 400 when bid status is not PENDING or UNDER_REVIEW', async () => {
    const bidWithIncludes = {
      ...mockBid,
      status: 'REJECTED',
      product: {
        id: 'product-1',
        sellerId: 'seller-1',
        category: 'Dried Flower',
        zohoProductId: 'zoho-prod-1',
        gramsAvailable: 5000,
        name: 'Test Strain',
      },
      buyer: { zohoContactId: 'zoho-buyer-1', companyName: 'Buyer Corp' },
    };

    vi.mocked(prisma.bid.findUnique).mockResolvedValue(bidWithIncludes as any);

    const app = createTestApp(bidsRouter, mockSeller);
    const res = await request(app).patch('/bid-1/accept');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot accept a bid with status REJECTED');
  });
});

describe('PATCH /:id/reject - Reject bid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects bid successfully', async () => {
    const bidWithProduct = {
      ...mockBid,
      product: { sellerId: 'seller-1' },
    };

    vi.mocked(prisma.bid.findUnique).mockResolvedValue(bidWithProduct as any);
    vi.mocked(prisma.bid.update).mockResolvedValue({ ...mockBid, status: 'REJECTED' } as any);

    const app = createTestApp(bidsRouter, mockSeller);
    const res = await request(app).patch('/bid-1/reject');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REJECTED');
    expect(prisma.bid.update).toHaveBeenCalledWith({
      where: { id: 'bid-1' },
      data: { status: 'REJECTED' },
    });
  });

  it('returns 404 when bid not found', async () => {
    vi.mocked(prisma.bid.findUnique).mockResolvedValue(null);

    const app = createTestApp(bidsRouter, mockSeller);
    const res = await request(app).patch('/nonexistent/reject');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Bid not found');
  });

  it('returns 403 when non-owner seller tries to reject', async () => {
    const bidWithProduct = {
      ...mockBid,
      product: { sellerId: 'other-seller' },
    };

    vi.mocked(prisma.bid.findUnique).mockResolvedValue(bidWithProduct as any);

    const app = createTestApp(bidsRouter, mockSeller);
    const res = await request(app).patch('/bid-1/reject');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Only the product seller can reject bids');
  });

  it('returns 400 when bid status is already ACCEPTED', async () => {
    const bidWithProduct = {
      ...mockBid,
      status: 'ACCEPTED',
      product: { sellerId: 'seller-1' },
    };

    vi.mocked(prisma.bid.findUnique).mockResolvedValue(bidWithProduct as any);

    const app = createTestApp(bidsRouter, mockSeller);
    const res = await request(app).patch('/bid-1/reject');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot reject a bid with status ACCEPTED');
  });
});

describe('PATCH /:id/outcome - Record delivery outcome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records outcome successfully', async () => {
    const bidWithTransaction = {
      ...mockBid,
      status: 'ACCEPTED',
      product: { sellerId: 'seller-1' },
      transaction: { id: 'tx-1', zohoDealId: null },
    };

    const updatedTransaction = {
      id: 'tx-1',
      status: 'completed',
      actualQuantityDelivered: 480,
      deliveryOnTime: true,
      qualityAsExpected: true,
    };

    vi.mocked(prisma.bid.findUnique).mockResolvedValue(bidWithTransaction as any);
    vi.mocked(prisma.transaction.update).mockResolvedValue(updatedTransaction as any);

    const app = createTestApp(bidsRouter, mockSeller);
    const res = await request(app)
      .patch('/bid-1/outcome')
      .send({
        actualQuantityDelivered: 480,
        deliveryOnTime: true,
        qualityAsExpected: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.transaction.id).toBe('tx-1');
    expect(res.body.transaction.status).toBe('completed');
    expect(prisma.transaction.update).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when bid has no transaction', async () => {
    const bidWithoutTransaction = {
      ...mockBid,
      product: { sellerId: 'seller-1' },
      transaction: null,
    };

    vi.mocked(prisma.bid.findUnique).mockResolvedValue(bidWithoutTransaction as any);

    const app = createTestApp(bidsRouter, mockSeller);
    const res = await request(app)
      .patch('/bid-1/outcome')
      .send({ deliveryOnTime: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bid has no associated transaction');
  });
});
