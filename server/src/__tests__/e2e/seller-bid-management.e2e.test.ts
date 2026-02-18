import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../../index';
import bidsRouter from '../../routes/bids';
import { createE2EApp, makeBuyer, makeSeller, makeBid, makeTransaction } from './helpers';

// Mock services
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
}));

const seller = makeSeller();
const buyer = makeBuyer();
const otherSeller = makeSeller({ id: 'seller-other', email: 'other@example.com', clerkUserId: 'clerk-other' });

describe('E2E: Seller bid management lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const bidProduct = {
    id: 'product-1',
    sellerId: 'seller-1',
    category: 'Dried Flower',
    zohoProductId: 'zoho-prod-1',
    gramsAvailable: 5000,
    name: 'Blue Dream',
    imageUrls: [],
  };

  const bidBuyer = {
    id: 'buyer-1',
    zohoContactId: 'zoho-buyer-1',
    companyName: 'Buyer Corp',
    firstName: 'Jane',
    lastName: 'Buyer',
    email: 'buyer@example.com',
  };

  it('seller sees pending bids on their products', async () => {
    const app = createE2EApp(seller, { '/api/bids': bidsRouter });

    const pendingBids = [
      makeBid({ id: 'bid-1', product: bidProduct, buyer: bidBuyer }),
      makeBid({ id: 'bid-2', product: bidProduct, buyer: bidBuyer, quantity: 300 }),
      makeBid({ id: 'bid-3', product: bidProduct, buyer: bidBuyer, quantity: 200 }),
    ];

    vi.mocked(prisma.bid.findMany).mockResolvedValue(pendingBids as any);
    vi.mocked(prisma.bid.count).mockResolvedValue(3);

    const res = await request(app).get('/api/bids/seller');

    expect(res.status).toBe(200);
    expect(res.body.bids).toHaveLength(3);
    expect(res.body.pagination.total).toBe(3);
  });

  it('seller accepts bid → transaction created, BID_ACCEPTED notification', async () => {
    const app = createE2EApp(seller, { '/api/bids': bidsRouter });

    const bidWithIncludes = {
      ...makeBid({ id: 'bid-1' }),
      product: bidProduct,
      buyer: bidBuyer,
    };

    const mockTx = makeTransaction({ id: 'tx-1', bidId: 'bid-1' });

    vi.mocked(prisma.bid.findUnique).mockResolvedValue(bidWithIncludes as any);
    vi.mocked(prisma.$transaction).mockResolvedValue([mockTx, {}, {}] as any);

    const res = await request(app).patch('/api/bids/bid-1/accept');

    expect(res.status).toBe(200);
    expect(res.body.transaction).toBeDefined();
    expect(res.body.transaction.id).toBe('tx-1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    const { createNotification } = await import('../../services/notificationService');
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'BID_ACCEPTED' }),
    );
  });

  it('seller records delivery outcome → transaction updated, BID_OUTCOME notification', async () => {
    const app = createE2EApp(seller, { '/api/bids': bidsRouter });

    const acceptedBid = {
      ...makeBid({ id: 'bid-1', status: 'ACCEPTED' }),
      product: { sellerId: 'seller-1' },
      transaction: { id: 'tx-1', zohoDealId: null },
    };

    const updatedTx = {
      id: 'tx-1',
      status: 'completed',
      actualQuantityDelivered: 480,
      deliveryOnTime: true,
      qualityAsExpected: true,
    };

    vi.mocked(prisma.bid.findUnique).mockResolvedValue(acceptedBid as any);
    vi.mocked(prisma.transaction.update).mockResolvedValue(updatedTx as any);

    const res = await request(app)
      .patch('/api/bids/bid-1/outcome')
      .send({ actualQuantityDelivered: 480, deliveryOnTime: true, qualityAsExpected: true });

    expect(res.status).toBe(200);
    // Outcome endpoint returns only { id, status }
    expect(res.body.transaction.id).toBe('tx-1');
    expect(res.body.transaction.status).toBe('completed');

    const { createNotification } = await import('../../services/notificationService');
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'BID_OUTCOME' }),
    );
  });

  it('seller rejects a different bid → status REJECTED, BID_REJECTED notification', async () => {
    const app = createE2EApp(seller, { '/api/bids': bidsRouter });

    const bidToReject = {
      ...makeBid({ id: 'bid-2' }),
      product: { sellerId: 'seller-1' },
    };

    vi.mocked(prisma.bid.findUnique).mockResolvedValue(bidToReject as any);
    vi.mocked(prisma.bid.update).mockResolvedValue({ ...bidToReject, status: 'REJECTED' } as any);

    const res = await request(app).patch('/api/bids/bid-2/reject');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REJECTED');

    const { createNotification } = await import('../../services/notificationService');
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'BID_REJECTED' }),
    );
  });

  it('non-owner seller cannot accept → 403', async () => {
    const app = createE2EApp(otherSeller, { '/api/bids': bidsRouter });

    const bidWithIncludes = {
      ...makeBid({ id: 'bid-1' }),
      product: bidProduct,
      buyer: bidBuyer,
    };

    vi.mocked(prisma.bid.findUnique).mockResolvedValue(bidWithIncludes as any);

    const res = await request(app).patch('/api/bids/bid-1/accept');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Only the product seller can accept bids');
  });

  it('non-owner seller cannot reject → 403', async () => {
    const app = createE2EApp(otherSeller, { '/api/bids': bidsRouter });

    const bidWithIncludes = {
      ...makeBid({ id: 'bid-1' }),
      product: { sellerId: 'seller-1' },
    };

    vi.mocked(prisma.bid.findUnique).mockResolvedValue(bidWithIncludes as any);

    const res = await request(app).patch('/api/bids/bid-1/reject');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Only the product seller can reject bids');
  });

  it('cannot accept already-rejected bid → 400', async () => {
    const app = createE2EApp(seller, { '/api/bids': bidsRouter });

    const rejectedBid = {
      ...makeBid({ id: 'bid-2', status: 'REJECTED' }),
      product: bidProduct,
      buyer: bidBuyer,
    };

    vi.mocked(prisma.bid.findUnique).mockResolvedValue(rejectedBid as any);

    const res = await request(app).patch('/api/bids/bid-2/accept');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot accept a bid with status REJECTED');
  });

  it('cannot reject already-accepted bid → 400', async () => {
    const app = createE2EApp(seller, { '/api/bids': bidsRouter });

    const acceptedBid = {
      ...makeBid({ id: 'bid-1', status: 'ACCEPTED' }),
      product: { sellerId: 'seller-1' },
    };

    vi.mocked(prisma.bid.findUnique).mockResolvedValue(acceptedBid as any);

    const res = await request(app).patch('/api/bids/bid-1/reject');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot reject a bid with status ACCEPTED');
  });

  it('outcome without transaction → 400', async () => {
    const app = createE2EApp(seller, { '/api/bids': bidsRouter });

    const bidNoTx = {
      ...makeBid({ id: 'bid-1', status: 'ACCEPTED' }),
      product: { sellerId: 'seller-1' },
      transaction: null,
    };

    vi.mocked(prisma.bid.findUnique).mockResolvedValue(bidNoTx as any);

    const res = await request(app)
      .patch('/api/bids/bid-1/outcome')
      .send({ deliveryOnTime: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bid has no associated transaction');
  });

  it('buyer cannot access seller bid endpoint → 403', async () => {
    const app = createE2EApp(buyer, { '/api/bids': bidsRouter });

    const res = await request(app).get('/api/bids/seller');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Seller access required');
  });
});
