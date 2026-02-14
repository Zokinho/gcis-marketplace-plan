import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Global mocks (from setup.ts)
import './setup';

import { prisma } from '../index';

const mockPrisma = prisma as any;

// ─── Test helpers ───

function createTestApp(user?: { id: string; email: string; approved: boolean; contactType?: string }) {
  const app = express();
  app.use(express.json());

  // Simulate auth middleware
  app.use((req, _res, next) => {
    if (user) {
      (req as any).user = user;
    }
    next();
  });

  return app;
}

async function mountShortlistRoutes(app: express.Express) {
  const shortlistRoutes = (await import('../routes/shortlist')).default;
  app.use('/api/shortlist', shortlistRoutes);
}

const testUser = { id: 'buyer1', email: 'buyer@test.com', approved: true, contactType: 'Buyer' };

// ─── Tests ───

describe('Shortlist Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── POST /toggle ───

  describe('POST /api/shortlist/toggle', () => {
    it('should add a product to shortlist', async () => {
      const app = createTestApp(testUser);
      await mountShortlistRoutes(app);

      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod1' } as any);
      mockPrisma.shortlistItem.findUnique.mockResolvedValue(null);
      mockPrisma.shortlistItem.create.mockResolvedValue({ id: 'sl1', buyerId: 'buyer1', productId: 'prod1' } as any);

      const res = await request(app)
        .post('/api/shortlist/toggle')
        .send({ productId: 'prod1' });

      expect(res.status).toBe(200);
      expect(res.body.shortlisted).toBe(true);
      expect(mockPrisma.shortlistItem.create).toHaveBeenCalledWith({
        data: { buyerId: 'buyer1', productId: 'prod1' },
      });
    });

    it('should remove a product from shortlist', async () => {
      const app = createTestApp(testUser);
      await mountShortlistRoutes(app);

      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod1' } as any);
      mockPrisma.shortlistItem.findUnique.mockResolvedValue({ id: 'sl1', buyerId: 'buyer1', productId: 'prod1' } as any);
      mockPrisma.shortlistItem.delete.mockResolvedValue({} as any);

      const res = await request(app)
        .post('/api/shortlist/toggle')
        .send({ productId: 'prod1' });

      expect(res.status).toBe(200);
      expect(res.body.shortlisted).toBe(false);
      expect(mockPrisma.shortlistItem.delete).toHaveBeenCalledWith({
        where: { id: 'sl1' },
      });
    });

    it('should return 404 for non-existent product', async () => {
      const app = createTestApp(testUser);
      await mountShortlistRoutes(app);

      mockPrisma.product.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/shortlist/toggle')
        .send({ productId: 'nonexistent' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Product not found');
    });

    it('should reject missing productId', async () => {
      const app = createTestApp(testUser);
      await mountShortlistRoutes(app);

      const res = await request(app)
        .post('/api/shortlist/toggle')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should handle idempotent toggle (add then remove)', async () => {
      const app = createTestApp(testUser);
      await mountShortlistRoutes(app);

      // First call: add
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod1' } as any);
      mockPrisma.shortlistItem.findUnique.mockResolvedValueOnce(null);
      mockPrisma.shortlistItem.create.mockResolvedValue({ id: 'sl1' } as any);

      const res1 = await request(app)
        .post('/api/shortlist/toggle')
        .send({ productId: 'prod1' });
      expect(res1.body.shortlisted).toBe(true);

      // Second call: remove
      mockPrisma.shortlistItem.findUnique.mockResolvedValueOnce({ id: 'sl1', buyerId: 'buyer1', productId: 'prod1' } as any);
      mockPrisma.shortlistItem.delete.mockResolvedValue({} as any);

      const res2 = await request(app)
        .post('/api/shortlist/toggle')
        .send({ productId: 'prod1' });
      expect(res2.body.shortlisted).toBe(false);
    });
  });

  // ─── GET / ───

  describe('GET /api/shortlist', () => {
    it('should return paginated shortlist items', async () => {
      const app = createTestApp(testUser);
      await mountShortlistRoutes(app);

      const mockItems = [
        {
          id: 'sl1',
          buyerId: 'buyer1',
          productId: 'prod1',
          createdAt: new Date(),
          product: {
            id: 'prod1',
            name: 'Product 1',
            category: 'Flower',
            type: 'Sativa',
            pricePerUnit: 5.0,
            gramsAvailable: 100,
            imageUrls: [],
            isActive: true,
          },
        },
      ];
      mockPrisma.shortlistItem.findMany.mockResolvedValue(mockItems as any);
      mockPrisma.shortlistItem.count.mockResolvedValue(1);

      const res = await request(app).get('/api/shortlist');

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].name).toBe('Product 1');
      expect(res.body.items[0].shortlistedAt).toBeDefined();
      expect(res.body.pagination.total).toBe(1);
    });

    it('should filter by category', async () => {
      const app = createTestApp(testUser);
      await mountShortlistRoutes(app);

      mockPrisma.shortlistItem.findMany.mockResolvedValue([]);
      mockPrisma.shortlistItem.count.mockResolvedValue(0);

      const res = await request(app).get('/api/shortlist?category=Flower');

      expect(res.status).toBe(200);
      expect(mockPrisma.shortlistItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { buyerId: 'buyer1', product: { category: 'Flower' } },
        }),
      );
    });

    it('should sort by name', async () => {
      const app = createTestApp(testUser);
      await mountShortlistRoutes(app);

      mockPrisma.shortlistItem.findMany.mockResolvedValue([]);
      mockPrisma.shortlistItem.count.mockResolvedValue(0);

      const res = await request(app).get('/api/shortlist?sort=name&order=asc');

      expect(res.status).toBe(200);
      expect(mockPrisma.shortlistItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { product: { name: 'asc' } },
        }),
      );
    });

    it('should sort by price', async () => {
      const app = createTestApp(testUser);
      await mountShortlistRoutes(app);

      mockPrisma.shortlistItem.findMany.mockResolvedValue([]);
      mockPrisma.shortlistItem.count.mockResolvedValue(0);

      const res = await request(app).get('/api/shortlist?sort=price&order=desc');

      expect(res.status).toBe(200);
      expect(mockPrisma.shortlistItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { product: { pricePerUnit: 'desc' } },
        }),
      );
    });

    it('should return empty state for new buyer', async () => {
      const app = createTestApp(testUser);
      await mountShortlistRoutes(app);

      mockPrisma.shortlistItem.findMany.mockResolvedValue([]);
      mockPrisma.shortlistItem.count.mockResolvedValue(0);

      const res = await request(app).get('/api/shortlist');

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(0);
      expect(res.body.pagination.total).toBe(0);
    });
  });

  // ─── GET /check ───

  describe('GET /api/shortlist/check', () => {
    it('should return bulk shortlist check results', async () => {
      const app = createTestApp(testUser);
      await mountShortlistRoutes(app);

      mockPrisma.shortlistItem.findMany.mockResolvedValue([
        { productId: 'prod1' },
        { productId: 'prod3' },
      ] as any);

      const res = await request(app).get('/api/shortlist/check?productIds=prod1,prod2,prod3');

      expect(res.status).toBe(200);
      expect(res.body.shortlisted).toEqual({
        prod1: true,
        prod2: false,
        prod3: true,
      });
    });

    it('should reject more than 50 product IDs', async () => {
      const app = createTestApp(testUser);
      await mountShortlistRoutes(app);

      const ids = Array.from({ length: 51 }, (_, i) => `prod${i}`).join(',');
      const res = await request(app).get(`/api/shortlist/check?productIds=${ids}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Maximum 50 product IDs allowed');
    });

    it('should return all false for no shortlisted products', async () => {
      const app = createTestApp(testUser);
      await mountShortlistRoutes(app);

      mockPrisma.shortlistItem.findMany.mockResolvedValue([]);

      const res = await request(app).get('/api/shortlist/check?productIds=prod1,prod2');

      expect(res.status).toBe(200);
      expect(res.body.shortlisted).toEqual({
        prod1: false,
        prod2: false,
      });
    });

    it('should reject missing productIds query param', async () => {
      const app = createTestApp(testUser);
      await mountShortlistRoutes(app);

      const res = await request(app).get('/api/shortlist/check');

      expect(res.status).toBe(400);
    });
  });

  // ─── GET /count ───

  describe('GET /api/shortlist/count', () => {
    it('should return correct count', async () => {
      const app = createTestApp(testUser);
      await mountShortlistRoutes(app);

      mockPrisma.shortlistItem.count.mockResolvedValue(5);

      const res = await request(app).get('/api/shortlist/count');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(5);
    });

    it('should return zero for new buyer', async () => {
      const app = createTestApp(testUser);
      await mountShortlistRoutes(app);

      mockPrisma.shortlistItem.count.mockResolvedValue(0);

      const res = await request(app).get('/api/shortlist/count');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
    });
  });
});
