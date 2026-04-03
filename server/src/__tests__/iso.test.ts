import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Global mocks (from setup.ts)
import './setup';

import { prisma } from '../index';

const mockPrisma = prisma as any;

// Mock notificationService
vi.mock('../services/notificationService', () => ({
  createNotification: vi.fn(),
  createNotificationBatch: vi.fn(),
  DEFAULT_NOTIFICATION_PREFS: {},
}));

// Mock isoMatchingService
vi.mock('../services/isoMatchingService', () => ({
  matchIsoToProducts: vi.fn().mockResolvedValue([]),
  matchProductToOpenIsos: vi.fn().mockResolvedValue(0),
}));

// Mock auditService
vi.mock('../services/auditService', () => ({
  logAudit: vi.fn(),
  getRequestIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

// ─── Test helpers ───

function createTestApp(user?: { id: string; email: string; approved: boolean; contactType?: string }) {
  const app = express();
  app.use(express.json());

  app.use((req, _res, next) => {
    if (user) {
      (req as any).user = user;
    }
    next();
  });

  return app;
}

async function mountIsoRoutes(app: express.Express) {
  const isoRoutes = (await import('../routes/iso')).default;
  app.use('/api/iso', isoRoutes);
}

const testBuyer = { id: 'buyer1', email: 'buyer@test.com', approved: true, contactType: 'Buyer' };
const testSeller = { id: 'seller1', email: 'seller@test.com', approved: true, contactType: 'Buyer; Seller' };
const testAdmin = { id: 'admin1', email: 'admin@test.com', approved: true, contactType: 'Buyer' };

const sampleIso = {
  id: 'iso1',
  buyerId: 'buyer1',
  title: 'Looking for premium Sativa flower',
  category: 'Flower',
  type: 'Sativa',
  certification: null,
  thcMin: 20,
  thcMax: 30,
  cbdMin: null,
  cbdMax: null,
  quantityMin: 100,
  quantityMax: 500,
  budgetMax: 5.0,
  notes: 'Looking for premium flower',
  status: 'OPEN',
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  matchedProductId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── Tests ───

describe('ISO Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── POST / ───

  describe('POST /api/iso', () => {
    it('should create an ISO request', async () => {
      const app = createTestApp(testBuyer);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.create.mockResolvedValue({ ...sampleIso } as any);

      const res = await request(app)
        .post('/api/iso')
        .send({
          title: 'Looking for premium Sativa flower',
          category: 'Flower',
          type: 'Sativa',
          thcMin: 20,
          thcMax: 30,
          quantityMin: 100,
          quantityMax: 500,
          budgetMax: 5.0,
          notes: 'Looking for premium flower',
        });

      expect(res.status).toBe(201);
      expect(res.body.iso).toBeDefined();
      expect(mockPrisma.isoRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          buyerId: 'buyer1',
          category: 'Flower',
          type: 'Sativa',
          expiresAt: null,
        }),
      });
    });

    it('should accept minimal body (title only, no filters)', async () => {
      const app = createTestApp(testBuyer);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.create.mockResolvedValue({ ...sampleIso, category: null, type: null } as any);

      const res = await request(app)
        .post('/api/iso')
        .send({ title: 'Need anything available' });

      expect(res.status).toBe(201);
    });

    it('should reject empty body (title required)', async () => {
      const app = createTestApp(testBuyer);
      await mountIsoRoutes(app);

      const res = await request(app)
        .post('/api/iso')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should reject invalid thcMin', async () => {
      const app = createTestApp(testBuyer);
      await mountIsoRoutes(app);

      const res = await request(app)
        .post('/api/iso')
        .send({ thcMin: 150 });

      expect(res.status).toBe(400);
    });

    it('should reject notes exceeding 2000 chars', async () => {
      const app = createTestApp(testBuyer);
      await mountIsoRoutes(app);

      const res = await request(app)
        .post('/api/iso')
        .send({ notes: 'a'.repeat(2001) });

      expect(res.status).toBe(400);
    });
  });

  // ─── GET / ───

  describe('GET /api/iso', () => {
    it('should return paginated ISO board', async () => {
      const app = createTestApp(testBuyer);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.findMany.mockResolvedValue([
        { ...sampleIso, _count: { responses: 2 } },
      ] as any);
      mockPrisma.isoRequest.count.mockResolvedValue(1);

      const res = await request(app).get('/api/iso');

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].responseCount).toBe(2);
      expect(res.body.pagination.total).toBe(1);
    });

    it('should anonymize buyer info for non-owners', async () => {
      const app = createTestApp(testSeller);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.findMany.mockResolvedValue([
        { ...sampleIso, buyerId: 'buyer1', _count: { responses: 0 }, responses: [] },
      ] as any);
      mockPrisma.isoRequest.count.mockResolvedValue(1);

      const res = await request(app).get('/api/iso');

      expect(res.status).toBe(200);
      expect(res.body.items[0].buyerId).toBeUndefined();
      expect(res.body.items[0].isOwner).toBe(false);
    });

    it('should include buyerId for owner', async () => {
      const app = createTestApp(testBuyer);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.findMany.mockResolvedValue([
        { ...sampleIso, _count: { responses: 0 } },
      ] as any);
      mockPrisma.isoRequest.count.mockResolvedValue(1);

      const res = await request(app).get('/api/iso');

      expect(res.status).toBe(200);
      expect(res.body.items[0].buyerId).toBe('buyer1');
      expect(res.body.items[0].isOwner).toBe(true);
    });

    it('should filter by category', async () => {
      const app = createTestApp(testBuyer);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.findMany.mockResolvedValue([]);
      mockPrisma.isoRequest.count.mockResolvedValue(0);

      const res = await request(app).get('/api/iso?category=Flower');

      expect(res.status).toBe(200);
      expect(mockPrisma.isoRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'Flower' }),
        }),
      );
    });
  });

  // ─── GET /my ───

  describe('GET /api/iso/my', () => {
    it('should return buyer\'s own ISOs with full detail', async () => {
      const app = createTestApp(testBuyer);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.findMany.mockResolvedValue([
        { ...sampleIso, matchedProduct: null, _count: { responses: 1 } },
      ] as any);
      mockPrisma.isoRequest.count.mockResolvedValue(1);

      const res = await request(app).get('/api/iso/my');

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].responseCount).toBe(1);
      expect(mockPrisma.isoRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ buyerId: 'buyer1' }),
        }),
      );
    });
  });

  // ─── GET /:id ───

  describe('GET /api/iso/:id', () => {
    it('should return ISO detail (owner gets full info)', async () => {
      const app = createTestApp(testBuyer);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.findUnique.mockResolvedValue({
        ...sampleIso,
        matchedProduct: null,
        _count: { responses: 0 },
        responses: [],
      } as any);

      const res = await request(app).get('/api/iso/iso1');

      expect(res.status).toBe(200);
      expect(res.body.iso.isOwner).toBe(true);
      expect(res.body.iso.buyerId).toBe('buyer1');
      expect(res.body.iso.responses).toBeDefined();
    });

    it('should anonymize for non-owner', async () => {
      const app = createTestApp(testSeller);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.findUnique.mockResolvedValue({
        ...sampleIso,
        matchedProduct: null,
        _count: { responses: 0 },
        responses: [],
      } as any);

      const res = await request(app).get('/api/iso/iso1');

      expect(res.status).toBe(200);
      expect(res.body.iso.isOwner).toBe(false);
      expect(res.body.iso.buyerId).toBeUndefined();
      expect(res.body.iso.responses).toBeUndefined();
    });

    it('should return 404 for non-existent ISO', async () => {
      const app = createTestApp(testBuyer);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.findUnique.mockResolvedValue(null);

      const res = await request(app).get('/api/iso/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  // ─── PATCH /:id ───

  describe('PATCH /api/iso/:id', () => {
    it('should close own ISO', async () => {
      const app = createTestApp(testBuyer);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.findUnique.mockResolvedValue(sampleIso as any);
      mockPrisma.isoRequest.update.mockResolvedValue({ ...sampleIso, status: 'CLOSED' } as any);

      const res = await request(app)
        .patch('/api/iso/iso1')
        .send({ status: 'CLOSED' });

      expect(res.status).toBe(200);
      expect(mockPrisma.isoRequest.update).toHaveBeenCalledWith({
        where: { id: 'iso1' },
        data: expect.objectContaining({ status: 'CLOSED' }),
      });
    });

    it('should reopen expired ISO with null expiresAt', async () => {
      const app = createTestApp(testBuyer);
      await mountIsoRoutes(app);

      const expiredIso = { ...sampleIso, status: 'EXPIRED' };
      mockPrisma.isoRequest.findUnique.mockResolvedValue(expiredIso as any);
      mockPrisma.isoRequest.update.mockResolvedValue({ ...expiredIso, status: 'OPEN', expiresAt: null } as any);

      const res = await request(app)
        .patch('/api/iso/iso1')
        .send({ expiresAt: null });

      expect(res.status).toBe(200);
      expect(mockPrisma.isoRequest.update).toHaveBeenCalledWith({
        where: { id: 'iso1' },
        data: expect.objectContaining({
          status: 'OPEN',
          expiresAt: null,
        }),
      });
    });

    it('should reject modifying other user\'s ISO', async () => {
      const app = createTestApp(testSeller);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.findUnique.mockResolvedValue(sampleIso as any);

      const res = await request(app)
        .patch('/api/iso/iso1')
        .send({ status: 'CLOSED' });

      expect(res.status).toBe(403);
    });

    it('should return 404 for non-existent ISO', async () => {
      const app = createTestApp(testBuyer);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .patch('/api/iso/nonexistent')
        .send({ status: 'CLOSED' });

      expect(res.status).toBe(404);
    });
  });

  // ─── PATCH /:id (content edits) ───

  describe('PATCH /api/iso/:id (content edits)', () => {
    it('should allow owner to edit content fields', async () => {
      const app = createTestApp(testBuyer);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.findUnique.mockResolvedValue(sampleIso as any);
      mockPrisma.isoRequest.update.mockResolvedValue({ ...sampleIso, title: 'Updated title', budgetMax: 8.0 } as any);

      const res = await request(app)
        .patch('/api/iso/iso1')
        .send({ title: 'Updated title', budgetMax: 8.0 });

      expect(res.status).toBe(200);
      expect(mockPrisma.isoRequest.update).toHaveBeenCalledWith({
        where: { id: 'iso1' },
        data: expect.objectContaining({ title: 'Updated title', budgetMax: 8.0 }),
      });
    });

    it('should allow admin to edit another user\'s ISO', async () => {
      process.env.ADMIN_EMAILS = 'admin@test.com';
      const app = createTestApp(testAdmin);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.findUnique.mockResolvedValue(sampleIso as any);
      mockPrisma.isoRequest.update.mockResolvedValue({ ...sampleIso, category: 'Extracts' } as any);

      const res = await request(app)
        .patch('/api/iso/iso1')
        .send({ category: 'Extracts' });

      expect(res.status).toBe(200);
      expect(mockPrisma.isoRequest.update).toHaveBeenCalledWith({
        where: { id: 'iso1' },
        data: expect.objectContaining({ category: 'Extracts' }),
      });

      const { logAudit } = await import('../services/auditService');
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'iso.edit', targetId: 'iso1' }),
      );

      delete process.env.ADMIN_EMAILS;
    });

    it('should reject non-owner non-admin edit', async () => {
      delete process.env.ADMIN_EMAILS;
      const app = createTestApp(testSeller);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.findUnique.mockResolvedValue(sampleIso as any);

      const res = await request(app)
        .patch('/api/iso/iso1')
        .send({ title: 'Hack attempt' });

      expect(res.status).toBe(403);
    });

    it('should reject content edits on CLOSED ISO (without expiresAt reopen)', async () => {
      const app = createTestApp(testBuyer);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.findUnique.mockResolvedValue({ ...sampleIso, status: 'CLOSED' } as any);

      const res = await request(app)
        .patch('/api/iso/iso1')
        .send({ title: 'New title' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Cannot edit content on a closed or expired ISO request');
    });

    it('should reject invalid field values (thcMin > 100)', async () => {
      const app = createTestApp(testBuyer);
      await mountIsoRoutes(app);

      const res = await request(app)
        .patch('/api/iso/iso1')
        .send({ thcMin: 150 });

      expect(res.status).toBe(400);
    });

    it('should set expiresAt via update', async () => {
      const app = createTestApp(testBuyer);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.findUnique.mockResolvedValue(sampleIso as any);
      const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      mockPrisma.isoRequest.update.mockResolvedValue({ ...sampleIso, expiresAt: futureDate } as any);

      const res = await request(app)
        .patch('/api/iso/iso1')
        .send({ expiresAt: futureDate.toISOString() });

      expect(res.status).toBe(200);
      expect(mockPrisma.isoRequest.update).toHaveBeenCalledWith({
        where: { id: 'iso1' },
        data: expect.objectContaining({
          expiresAt: expect.any(Date),
        }),
      });
    });

    it('should clear expiresAt by sending null', async () => {
      const app = createTestApp(testBuyer);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.findUnique.mockResolvedValue(sampleIso as any);
      mockPrisma.isoRequest.update.mockResolvedValue({ ...sampleIso, expiresAt: null } as any);

      const res = await request(app)
        .patch('/api/iso/iso1')
        .send({ expiresAt: null });

      expect(res.status).toBe(200);
      expect(mockPrisma.isoRequest.update).toHaveBeenCalledWith({
        where: { id: 'iso1' },
        data: expect.objectContaining({
          expiresAt: null,
        }),
      });
    });

    it('should reject past expiresAt date', async () => {
      const app = createTestApp(testBuyer);
      await mountIsoRoutes(app);

      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const res = await request(app)
        .patch('/api/iso/iso1')
        .send({ expiresAt: pastDate.toISOString() });

      expect(res.status).toBe(400);
    });
  });

  // ─── POST /api/iso (expiresAt) ───

  describe('POST /api/iso (expiresAt)', () => {
    it('should accept optional expiresAt on create', async () => {
      const app = createTestApp(testBuyer);
      await mountIsoRoutes(app);

      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      mockPrisma.isoRequest.create.mockResolvedValue({ ...sampleIso, expiresAt: futureDate } as any);

      const res = await request(app)
        .post('/api/iso')
        .send({
          title: 'Looking for Sativa',
          expiresAt: futureDate.toISOString(),
        });

      expect(res.status).toBe(201);
      expect(mockPrisma.isoRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          expiresAt: expect.any(Date),
        }),
      });
    });

    it('should create ISO with null expiresAt when not provided', async () => {
      const app = createTestApp(testBuyer);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.create.mockResolvedValue({ ...sampleIso, expiresAt: null } as any);

      const res = await request(app)
        .post('/api/iso')
        .send({ title: 'Need anything available' });

      expect(res.status).toBe(201);
      expect(mockPrisma.isoRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          expiresAt: null,
        }),
      });
    });

    it('should reject past expiresAt on create', async () => {
      const app = createTestApp(testBuyer);
      await mountIsoRoutes(app);

      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const res = await request(app)
        .post('/api/iso')
        .send({
          title: 'Backdated request',
          expiresAt: pastDate.toISOString(),
        });

      expect(res.status).toBe(400);
    });
  });

  // ─── POST /:id/respond ───

  describe('POST /api/iso/:id/respond', () => {
    it('should create seller response', async () => {
      const app = createTestApp(testSeller);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.findUnique.mockResolvedValue(sampleIso as any);
      mockPrisma.isoResponse.create.mockResolvedValue({
        id: 'resp1',
        isoRequestId: 'iso1',
        sellerId: 'seller1',
        productId: null,
        message: 'I have premium Sativa',
        status: 'admin_notified',
        createdAt: new Date(),
      } as any);
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.findUnique.mockResolvedValue({ companyName: 'Test LP', email: 'seller@test.com' } as any);

      const res = await request(app)
        .post('/api/iso/iso1/respond')
        .send({ message: 'I have premium Sativa' });

      expect(res.status).toBe(201);
      expect(res.body.response).toBeDefined();
      expect(mockPrisma.isoResponse.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isoRequestId: 'iso1',
          sellerId: 'seller1',
          status: 'admin_notified',
        }),
      });
    });

    it('should prevent buyer from responding to own ISO', async () => {
      const app = createTestApp(testBuyer);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.findUnique.mockResolvedValue(sampleIso as any);

      const res = await request(app)
        .post('/api/iso/iso1/respond')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('You cannot respond to your own ISO request');
    });

    it('should prevent response to closed ISO', async () => {
      const app = createTestApp(testSeller);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.findUnique.mockResolvedValue({ ...sampleIso, status: 'CLOSED' } as any);

      const res = await request(app)
        .post('/api/iso/iso1/respond')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('This ISO request is no longer accepting responses');
    });

    it('should handle duplicate response (unique constraint)', async () => {
      const app = createTestApp(testSeller);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.findUnique.mockResolvedValue(sampleIso as any);
      mockPrisma.isoResponse.create.mockRejectedValue({ code: 'P2002' });

      const res = await request(app)
        .post('/api/iso/iso1/respond')
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('You have already responded to this ISO request');
    });

    it('should return 404 for non-existent ISO', async () => {
      const app = createTestApp(testSeller);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/iso/nonexistent/respond')
        .send({});

      expect(res.status).toBe(404);
    });

    it('should verify product belongs to seller when productId provided', async () => {
      const app = createTestApp(testSeller);
      await mountIsoRoutes(app);

      mockPrisma.isoRequest.findUnique.mockResolvedValue(sampleIso as any);
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod1', sellerId: 'other-seller' } as any);

      const res = await request(app)
        .post('/api/iso/iso1/respond')
        .send({ productId: 'prod1' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('You can only reference your own products');
    });
  });
});
