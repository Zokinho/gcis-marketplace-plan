import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../../index';
import marketplaceRouter from '../../routes/marketplace';
import bidsRouter from '../../routes/bids';
import { createE2EApp, makeBuyer, makeSeller, makeProduct, makeBid } from './helpers';

// Mock services used by bids routes
vi.mock('../../services/zohoApi', () => ({
  createBidTask: vi.fn().mockResolvedValue(undefined),
  updateBidTaskStatus: vi.fn().mockResolvedValue(undefined),
  updateBidTaskOutcome: vi.fn().mockResolvedValue(undefined),
  pushProductUpdate: vi.fn().mockResolvedValue(undefined),
  createDeal: vi.fn().mockResolvedValue(null),
  updateDealStage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/notificationService', () => ({
  createNotification: vi.fn(),
  createNotificationBatch: vi.fn(),
}));

vi.mock('../../services/auditService', () => ({
  logAudit: vi.fn(),
  getRequestIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('../../services/churnDetectionService', () => ({
  resolveOnPurchase: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/marketContextService', () => ({
  updateMarketPrice: vi.fn().mockResolvedValue(undefined),
  get30DayAvgPricesBatch: vi.fn().mockResolvedValue(new Map()),
  scorePriceVsMarket: vi.fn().mockResolvedValue(null),
}));

const buyer = makeBuyer();
const seller = makeSeller();

describe('E2E: Browse → Bid flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const product1 = makeProduct({ id: 'prod-1', name: 'Blue Dream', category: 'Dried Flower', sellerId: 'seller-1' });
  const product2 = makeProduct({ id: 'prod-2', name: 'OG Kush', category: 'Extracts', sellerId: 'seller-1', isActive: true });
  const inactiveProduct = makeProduct({ id: 'prod-3', name: 'Inactive Strain', isActive: false, sellerId: 'seller-1' });

  it('buyer browses marketplace → sees only active products', async () => {
    const app = createE2EApp(buyer, { '/api/marketplace': marketplaceRouter });

    vi.mocked(prisma.product.findMany).mockResolvedValue([product1, product2] as any);
    vi.mocked(prisma.product.count).mockResolvedValue(2);

    const res = await request(app).get('/api/marketplace/products');

    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(2);
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isActive: true }) }),
    );
  });

  it('buyer filters by category → sees filtered subset', async () => {
    const app = createE2EApp(buyer, { '/api/marketplace': marketplaceRouter });

    vi.mocked(prisma.product.findMany).mockResolvedValue([product1] as any);
    vi.mocked(prisma.product.count).mockResolvedValue(1);

    const res = await request(app).get('/api/marketplace/products?category=Dried+Flower');

    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(1);
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ category: 'Dried Flower' }) }),
    );
  });

  it('buyer views product detail → correct product returned', async () => {
    const app = createE2EApp(buyer, { '/api/marketplace': marketplaceRouter });

    vi.mocked(prisma.product.findUnique).mockResolvedValue(product1 as any);

    const res = await request(app).get('/api/marketplace/products/prod-1');

    expect(res.status).toBe(200);
    expect(res.body.product.id).toBe('prod-1');
    expect(res.body.product.name).toBe('Blue Dream');
    // sellerId stripped from buyer response
    expect(res.body.product.sellerId).toBeUndefined();
  });

  it('buyer places a bid → 201, bid appears in buyer history', async () => {
    const app = createE2EApp(buyer, {
      '/api/marketplace': marketplaceRouter,
      '/api/bids': bidsRouter,
    });

    const bidProduct = { ...product1, seller: seller };
    const createdBid = makeBid({ id: 'bid-new', productId: 'prod-1', buyerId: 'buyer-1' });

    vi.mocked(prisma.product.findUnique).mockResolvedValue(bidProduct as any);
    vi.mocked(prisma.bid.create).mockResolvedValue(createdBid as any);

    const bidRes = await request(app)
      .post('/api/bids')
      .send({ productId: 'prod-1', pricePerUnit: 4.5, quantity: 500 });

    expect(bidRes.status).toBe(201);
    expect(bidRes.body.bid.id).toBe('bid-new');
    expect(bidRes.body.bid.status).toBe('PENDING');

    // Notification to seller should have been triggered
    const { createNotification } = await import('../../services/notificationService');
    expect(createNotification).toHaveBeenCalled();

    // Now check buyer bid history
    vi.mocked(prisma.bid.findMany).mockResolvedValue([
      { ...createdBid, product: { id: 'prod-1', name: 'Blue Dream', category: 'Dried Flower', type: null, certification: null, pricePerUnit: 5.0, imageUrls: [], isActive: true } },
    ] as any);
    vi.mocked(prisma.bid.count).mockResolvedValue(1);

    const historyRes = await request(app).get('/api/bids');

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.bids).toHaveLength(1);
    expect(historyRes.body.bids[0].id).toBe('bid-new');
  });

  it('seller sees incoming bid after buyer places it', async () => {
    const sellerApp = createE2EApp(seller, { '/api/bids': bidsRouter });

    const incomingBid = makeBid({
      id: 'bid-incoming',
      product: { id: 'prod-1', name: 'Blue Dream', sellerId: 'seller-1', category: 'Dried Flower', imageUrls: [] },
      buyer: { id: 'buyer-1', firstName: 'Jane', lastName: 'Buyer', companyName: 'Buyer Corp', email: 'buyer@example.com' },
    });

    vi.mocked(prisma.bid.findMany).mockResolvedValue([incomingBid] as any);
    vi.mocked(prisma.bid.count).mockResolvedValue(1);

    const res = await request(sellerApp).get('/api/bids/seller');

    expect(res.status).toBe(200);
    expect(res.body.bids).toHaveLength(1);
    expect(res.body.bids[0].id).toBe('bid-incoming');
  });

  it('rejects bid on own product → 400', async () => {
    const sellerApp = createE2EApp(seller, { '/api/bids': bidsRouter });

    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      ...product1,
      seller: seller,
    } as any);

    const res = await request(sellerApp)
      .post('/api/bids')
      .send({ productId: 'prod-1', pricePerUnit: 4.5, quantity: 500 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('You cannot bid on your own product');
  });

  it('rejects bid on inactive product → 400', async () => {
    const app = createE2EApp(buyer, { '/api/bids': bidsRouter });

    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      ...inactiveProduct,
      seller: seller,
    } as any);

    const res = await request(app)
      .post('/api/bids')
      .send({ productId: 'prod-3', pricePerUnit: 4.5, quantity: 500 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('This product is not currently active');
  });

  it('rejects bid below minimum quantity → 400', async () => {
    const app = createE2EApp(buyer, { '/api/bids': bidsRouter });

    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      ...product1,
      minQtyRequest: 100,
      seller: seller,
    } as any);

    const res = await request(app)
      .post('/api/bids')
      .send({ productId: 'prod-1', pricePerUnit: 4.5, quantity: 50 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Minimum order quantity');
  });

  it('rejects bid with missing fields → 400 validation error', async () => {
    const app = createE2EApp(buyer, { '/api/bids': bidsRouter });

    const res = await request(app)
      .post('/api/bids')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('buyer views nonexistent product → 404', async () => {
    const app = createE2EApp(buyer, { '/api/marketplace': marketplaceRouter });

    vi.mocked(prisma.product.findUnique).mockResolvedValue(null);

    const res = await request(app).get('/api/marketplace/products/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Product not found');
  });
});
