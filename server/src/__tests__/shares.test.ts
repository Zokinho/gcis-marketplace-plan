import express from 'express';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../index';
import sharesRouter, { publicShareRouter } from '../routes/shares';

// Mock CoA client used by the PDF proxy route
vi.mock('../services/coaClient', () => ({
  getCoaClient: vi.fn().mockReturnValue({
    getProductPdfBuffer: vi.fn().mockResolvedValue(Buffer.from('fake-pdf')),
  }),
}));

// ─── Test fixtures ───

const mockAdmin = {
  id: 'admin-1',
  clerkUserId: 'clerk-admin-1',
  zohoContactId: 'zoho-admin-1',
  email: 'admin@example.com',
  firstName: 'Admin',
  lastName: 'User',
  companyName: 'Admin Corp',
  contactType: 'Seller',
  approved: true,
  eulaAcceptedAt: new Date(),
  docUploaded: true,
};

const mockShare = {
  id: 'share-1',
  token: 'valid-token-abc123',
  label: 'Q1 Selection',
  productIds: ['product-1', 'product-2'],
  active: true,
  expiresAt: null,
  useCount: 0,
  lastUsedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockExpiredShare = {
  ...mockShare,
  id: 'share-expired',
  token: 'expired-token',
  expiresAt: new Date('2020-01-01'), // in the past
};

const mockInactiveShare = {
  ...mockShare,
  id: 'share-inactive',
  token: 'inactive-token',
  active: false,
};

// ─── Test app factories ───

function createAdminApp(router: express.Router, user: any = mockAdmin) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use('/', router);
  return app;
}

function createPublicApp(router: express.Router) {
  const app = express();
  app.use(express.json());
  app.use('/', router);
  return app;
}

// ─── Admin endpoint tests ───

describe('Admin: POST / - Create share', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates share with valid data', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: 'product-1' },
      { id: 'product-2' },
    ] as any);
    vi.mocked(prisma.curatedShare.create).mockResolvedValue(mockShare as any);

    const app = createAdminApp(sharesRouter);
    const res = await request(app)
      .post('/')
      .send({ label: 'Q1 Selection', productIds: ['product-1', 'product-2'] });

    expect(res.status).toBe(200);
    expect(res.body.share).toBeDefined();
    expect(prisma.curatedShare.create).toHaveBeenCalledTimes(1);
    // Token should be in the create call
    expect(prisma.curatedShare.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          label: 'Q1 Selection',
          productIds: ['product-1', 'product-2'],
        }),
      }),
    );
  });

  it('validation fails with empty label', async () => {
    const app = createAdminApp(sharesRouter);
    const res = await request(app)
      .post('/')
      .send({ label: '', productIds: ['product-1'] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('validation fails with empty productIds array', async () => {
    const app = createAdminApp(sharesRouter);
    const res = await request(app)
      .post('/')
      .send({ label: 'Test', productIds: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 when some product IDs are invalid', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: 'product-1' },
    ] as any); // Only 1 of 2 found

    const app = createAdminApp(sharesRouter);
    const res = await request(app)
      .post('/')
      .send({ label: 'Test', productIds: ['product-1', 'nonexistent'] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Some product IDs are invalid');
  });
});

describe('Admin: GET / - List shares', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists all shares', async () => {
    vi.mocked(prisma.curatedShare.findMany).mockResolvedValue([mockShare] as any);

    const app = createAdminApp(sharesRouter);
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body.shares).toHaveLength(1);
    expect(res.body.shares[0].label).toBe('Q1 Selection');
    expect(prisma.curatedShare.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
    });
  });
});

describe('Admin: PATCH /:id - Update share', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates share label', async () => {
    vi.mocked(prisma.curatedShare.update).mockResolvedValue({
      ...mockShare,
      label: 'Updated Label',
    } as any);

    const app = createAdminApp(sharesRouter);
    const res = await request(app)
      .patch('/share-1')
      .send({ label: 'Updated Label' });

    expect(res.status).toBe(200);
    expect(res.body.share.label).toBe('Updated Label');
    expect(prisma.curatedShare.update).toHaveBeenCalledWith({
      where: { id: 'share-1' },
      data: { label: 'Updated Label' },
    });
  });

  it('updates share active status', async () => {
    vi.mocked(prisma.curatedShare.update).mockResolvedValue({
      ...mockShare,
      active: false,
    } as any);

    const app = createAdminApp(sharesRouter);
    const res = await request(app)
      .patch('/share-1')
      .send({ active: false });

    expect(res.status).toBe(200);
    expect(res.body.share.active).toBe(false);
  });

  it('returns 404 for nonexistent share', async () => {
    vi.mocked(prisma.curatedShare.update).mockRejectedValue(new Error('Record not found'));

    const app = createAdminApp(sharesRouter);
    const res = await request(app)
      .patch('/nonexistent')
      .send({ label: 'New' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Share not found');
  });
});

describe('Admin: DELETE /:id - Soft delete share', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hard deletes the share', async () => {
    vi.mocked(prisma.curatedShare.delete).mockResolvedValue(mockShare as any);

    const app = createAdminApp(sharesRouter);
    const res = await request(app).delete('/share-1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(prisma.curatedShare.delete).toHaveBeenCalledWith({
      where: { id: 'share-1' },
    });
  });

  it('returns 404 for nonexistent share', async () => {
    vi.mocked(prisma.curatedShare.delete).mockRejectedValue(new Error('Record not found'));

    const app = createAdminApp(sharesRouter);
    const res = await request(app).delete('/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Share not found');
  });
});

// ─── Public endpoint tests ───

describe('Public: GET /validate/:token - Validate share', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates active share', async () => {
    vi.mocked(prisma.curatedShare.findUnique).mockResolvedValue(mockShare as any);

    const app = createPublicApp(publicShareRouter);
    const res = await request(app).get('/validate/valid-token-abc123');

    expect(res.status).toBe(200);
    expect(res.body.label).toBe('Q1 Selection');
    expect(res.body.productCount).toBe(2);
  });

  it('returns 404 for inactive share', async () => {
    vi.mocked(prisma.curatedShare.findUnique).mockResolvedValue(mockInactiveShare as any);

    const app = createPublicApp(publicShareRouter);
    const res = await request(app).get('/validate/inactive-token');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Invalid or expired share link');
  });

  it('returns 404 for nonexistent share', async () => {
    vi.mocked(prisma.curatedShare.findUnique).mockResolvedValue(null);

    const app = createPublicApp(publicShareRouter);
    const res = await request(app).get('/validate/unknown-token');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Invalid or expired share link');
  });

  it('returns 410 for expired share', async () => {
    vi.mocked(prisma.curatedShare.findUnique).mockResolvedValue(mockExpiredShare as any);

    const app = createPublicApp(publicShareRouter);
    const res = await request(app).get('/validate/expired-token');

    expect(res.status).toBe(410);
    expect(res.body.error).toBe('Share link has expired');
  });

  it('validates share with future expiry', async () => {
    const futureShare = {
      ...mockShare,
      token: 'future-token',
      expiresAt: new Date('2099-12-31'),
    };
    vi.mocked(prisma.curatedShare.findUnique).mockResolvedValue(futureShare as any);

    const app = createPublicApp(publicShareRouter);
    const res = await request(app).get('/validate/future-token');

    expect(res.status).toBe(200);
    expect(res.body.label).toBe('Q1 Selection');
  });
});

describe('Public: GET /:token/products - Get share products', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns products and increments useCount', async () => {
    vi.mocked(prisma.curatedShare.findUnique).mockResolvedValue(mockShare as any);
    vi.mocked(prisma.curatedShare.update).mockResolvedValue({
      ...mockShare,
      useCount: 1,
      lastUsedAt: new Date(),
    } as any);

    const mockProducts = [
      {
        id: 'product-1',
        name: 'Product A',
        category: 'Dried Flower',
        isActive: true,
        marketplaceVisible: true,
        pricePerUnit: 5.0,
      },
      {
        id: 'product-2',
        name: 'Product B',
        category: 'Pre-rolls',
        isActive: true,
        marketplaceVisible: true,
        pricePerUnit: 8.0,
      },
    ];
    vi.mocked(prisma.product.findMany).mockResolvedValue(mockProducts as any);

    const app = createPublicApp(publicShareRouter);
    const res = await request(app).get('/valid-token-abc123/products');

    expect(res.status).toBe(200);
    expect(res.body.label).toBe('Q1 Selection');
    expect(res.body.products).toHaveLength(2);
    // Verify useCount was incremented
    expect(prisma.curatedShare.update).toHaveBeenCalledWith({
      where: { id: 'share-1' },
      data: {
        lastUsedAt: expect.any(Date),
        useCount: { increment: 1 },
      },
    });
  });

  it('returns 404 for inactive share', async () => {
    vi.mocked(prisma.curatedShare.findUnique).mockResolvedValue(mockInactiveShare as any);

    const app = createPublicApp(publicShareRouter);
    const res = await request(app).get('/inactive-token/products');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Invalid or expired share link');
  });

  it('returns 410 for expired share', async () => {
    vi.mocked(prisma.curatedShare.findUnique).mockResolvedValue(mockExpiredShare as any);

    const app = createPublicApp(publicShareRouter);
    const res = await request(app).get('/expired-token/products');

    expect(res.status).toBe(410);
    expect(res.body.error).toBe('Share link has expired');
  });

  it('filters only active products', async () => {
    vi.mocked(prisma.curatedShare.findUnique).mockResolvedValue(mockShare as any);
    vi.mocked(prisma.curatedShare.update).mockResolvedValue(mockShare as any);
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);

    const app = createPublicApp(publicShareRouter);
    await request(app).get('/valid-token-abc123/products');

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ['product-1', 'product-2'] },
          isActive: true,
        },
      }),
    );
  });
});
