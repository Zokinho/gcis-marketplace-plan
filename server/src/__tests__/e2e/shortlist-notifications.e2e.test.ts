import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../../index';
import { createE2EApp, makeBuyer, makeSeller, makeProduct } from './helpers';

// Mock services used by myListings
vi.mock('../../services/zohoApi', () => ({
  pushProductUpdate: vi.fn().mockResolvedValue(undefined),
  createZohoProduct: vi.fn().mockResolvedValue('zoho-new-123'),
  createProductReviewTask: vi.fn().mockResolvedValue(undefined),
  uploadProductFiles: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/zohoAuth', () => ({
  zohoRequest: vi.fn().mockResolvedValue({ data: {} }),
}));

vi.mock('../../services/notificationService', () => ({
  createNotification: vi.fn(),
  createNotificationBatch: vi.fn(),
}));

const buyer = makeBuyer();
const seller = makeSeller();

describe('E2E: Shortlist → Price drop notification flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // myListings uses bid.groupBy which isn't in global setup
    (prisma.bid as any).groupBy = vi.fn().mockResolvedValue([]);
  });

  it('buyer adds product to shortlist', async () => {
    // Dynamic import so mocks are applied
    const shortlistRouter = (await import('../../routes/shortlist')).default;
    const app = createE2EApp(buyer, { '/api/shortlist': shortlistRouter });

    vi.mocked(prisma.product.findUnique).mockResolvedValue({ id: 'prod-1' } as any);
    vi.mocked(prisma.shortlistItem.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.shortlistItem.create).mockResolvedValue({
      id: 'sl-1',
      buyerId: 'buyer-1',
      productId: 'prod-1',
    } as any);

    const res = await request(app)
      .post('/api/shortlist/toggle')
      .send({ productId: 'prod-1' });

    expect(res.status).toBe(200);
    expect(res.body.shortlisted).toBe(true);
  });

  it('buyer sees shortlisted product in list', async () => {
    const shortlistRouter = (await import('../../routes/shortlist')).default;
    const app = createE2EApp(buyer, { '/api/shortlist': shortlistRouter });

    vi.mocked(prisma.shortlistItem.findMany).mockResolvedValue([{
      id: 'sl-1',
      buyerId: 'buyer-1',
      productId: 'prod-1',
      createdAt: new Date(),
      product: {
        id: 'prod-1',
        name: 'Blue Dream',
        category: 'Dried Flower',
        type: 'Hybrid',
        pricePerUnit: 5.0,
        gramsAvailable: 5000,
        imageUrls: [],
        isActive: true,
      },
    }] as any);
    vi.mocked(prisma.shortlistItem.count).mockResolvedValue(1);

    const res = await request(app).get('/api/shortlist');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].name).toBe('Blue Dream');
  });

  it('buyer bulk-checks shortlist state', async () => {
    const shortlistRouter = (await import('../../routes/shortlist')).default;
    const app = createE2EApp(buyer, { '/api/shortlist': shortlistRouter });

    vi.mocked(prisma.shortlistItem.findMany).mockResolvedValue([
      { productId: 'prod-1' },
    ] as any);

    const res = await request(app).get('/api/shortlist/check?productIds=prod-1,prod-2');

    expect(res.status).toBe(200);
    expect(res.body.shortlisted).toEqual({ 'prod-1': true, 'prod-2': false });
  });

  it('buyer gets shortlist count', async () => {
    const shortlistRouter = (await import('../../routes/shortlist')).default;
    const app = createE2EApp(buyer, { '/api/shortlist': shortlistRouter });

    vi.mocked(prisma.shortlistItem.count).mockResolvedValue(1);

    const res = await request(app).get('/api/shortlist/count');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  it('seller lowers price → SHORTLIST_PRICE_DROP notification sent', async () => {
    const myListingsRouter = (await import('../../routes/myListings')).default;
    const app = createE2EApp(seller, { '/api/my-listings': myListingsRouter });

    // Ownership check
    vi.mocked(prisma.product.findUnique)
      .mockResolvedValueOnce({
        id: 'prod-1',
        name: 'Blue Dream',
        sellerId: 'seller-1',
        zohoProductId: 'zoho-prod-1',
        pricePerUnit: 5.0,
      } as any)
      // After update, return updated product
      .mockResolvedValueOnce({
        ...makeProduct({ id: 'prod-1', pricePerUnit: 4.0 }),
      } as any);

    // Shortlisters for this product
    vi.mocked(prisma.shortlistItem.findMany).mockResolvedValue([
      { buyerId: 'buyer-1' },
      { buyerId: 'buyer-2' },
    ] as any);

    const res = await request(app)
      .patch('/api/my-listings/prod-1')
      .send({ pricePerUnit: 4.0 });

    expect(res.status).toBe(200);

    const { createNotificationBatch } = await import('../../services/notificationService');
    expect(createNotificationBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ userId: 'buyer-1', type: 'SHORTLIST_PRICE_DROP' }),
        expect.objectContaining({ userId: 'buyer-2', type: 'SHORTLIST_PRICE_DROP' }),
      ]),
    );
  });

  it('buyer removes product from shortlist', async () => {
    const shortlistRouter = (await import('../../routes/shortlist')).default;
    const app = createE2EApp(buyer, { '/api/shortlist': shortlistRouter });

    vi.mocked(prisma.product.findUnique).mockResolvedValue({ id: 'prod-1' } as any);
    vi.mocked(prisma.shortlistItem.findUnique).mockResolvedValue({
      id: 'sl-1',
      buyerId: 'buyer-1',
      productId: 'prod-1',
    } as any);
    vi.mocked(prisma.shortlistItem.delete).mockResolvedValue({} as any);

    const res = await request(app)
      .post('/api/shortlist/toggle')
      .send({ productId: 'prod-1' });

    expect(res.status).toBe(200);
    expect(res.body.shortlisted).toBe(false);
  });

  it('seller lowers price again → no notification (no shortlisters after removal)', async () => {
    const myListingsRouter = (await import('../../routes/myListings')).default;
    const app = createE2EApp(seller, { '/api/my-listings': myListingsRouter });

    vi.mocked(prisma.product.findUnique)
      .mockResolvedValueOnce({
        id: 'prod-1',
        name: 'Blue Dream',
        sellerId: 'seller-1',
        zohoProductId: 'zoho-prod-1',
        pricePerUnit: 4.0,
      } as any)
      .mockResolvedValueOnce({
        ...makeProduct({ id: 'prod-1', pricePerUnit: 3.5 }),
      } as any);

    // No shortlisters
    vi.mocked(prisma.shortlistItem.findMany).mockResolvedValue([] as any);

    const res = await request(app)
      .patch('/api/my-listings/prod-1')
      .send({ pricePerUnit: 3.5 });

    expect(res.status).toBe(200);

    const { createNotificationBatch } = await import('../../services/notificationService');
    expect(createNotificationBatch).not.toHaveBeenCalled();
  });

  it('seller increases price → no price-drop notification', async () => {
    const myListingsRouter = (await import('../../routes/myListings')).default;
    const app = createE2EApp(seller, { '/api/my-listings': myListingsRouter });

    vi.mocked(prisma.product.findUnique)
      .mockResolvedValueOnce({
        id: 'prod-1',
        name: 'Blue Dream',
        sellerId: 'seller-1',
        zohoProductId: 'zoho-prod-1',
        pricePerUnit: 5.0,
      } as any)
      .mockResolvedValueOnce({
        ...makeProduct({ id: 'prod-1', pricePerUnit: 6.0 }),
      } as any);

    const res = await request(app)
      .patch('/api/my-listings/prod-1')
      .send({ pricePerUnit: 6.0 });

    expect(res.status).toBe(200);

    const { createNotificationBatch } = await import('../../services/notificationService');
    expect(createNotificationBatch).not.toHaveBeenCalled();
  });
});
