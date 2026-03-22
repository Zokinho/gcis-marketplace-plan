import express from 'express';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../index';
import redactionRouter from '../routes/redaction';

vi.mock('../services/auditService', () => ({
  logAudit: vi.fn(),
  getRequestIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('../utils/s3', () => ({
  isS3Configured: vi.fn().mockReturnValue(true),
  getSignedFileUrl: vi.fn().mockResolvedValue('https://s3.example.com/signed-url'),
  uploadFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/coaRedactor', () => ({
  applyRedactions: vi.fn().mockResolvedValue(Buffer.from('%PDF-redacted')),
}));

// ─── Fixtures ───

const mockAdmin = {
  id: 'admin-1',
  email: 'admin@example.com',
  firstName: 'Admin',
  lastName: 'User',
  companyName: 'Admin Corp',
  contactType: 'Seller',
  approved: true,
  eulaAcceptedAt: new Date(),
  docUploaded: true,
};

const mockProduct = {
  id: 'prod-1',
  name: 'Test Product',
  coaOriginalKey: 'products/prod-1/coa/abc_original.pdf',
  coaRedactedKey: null,
  coaPageCount: 2,
};

const mockRegion = {
  id: 'reg-1',
  productId: 'prod-1',
  page: 0,
  xPct: 10.5,
  yPct: 20.3,
  wPct: 30,
  hPct: 5.2,
  reason: 'Client company name',
  confidence: 'high',
  approved: true,
  source: 'ai',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── Test app factory ───

function createTestApp(user: any = mockAdmin) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use('/', redactionRouter);
  return app;
}

// ─── Tests ───

describe('GET /:productId/regions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns regions and coaPageCount', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(mockProduct as any);
    vi.mocked(prisma.redactionRegion.findMany).mockResolvedValue([mockRegion] as any);

    const app = createTestApp();
    const res = await request(app).get('/prod-1/regions');

    expect(res.status).toBe(200);
    expect(res.body.regions).toHaveLength(1);
    expect(res.body.regions[0].id).toBe('reg-1');
    expect(res.body.coaPageCount).toBe(2);
  });

  it('returns 404 for non-existent product', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null);

    const app = createTestApp();
    const res = await request(app).get('/nonexistent/regions');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Product not found');
  });
});

describe('POST /:productId/regions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a manual redaction region', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(mockProduct as any);
    vi.mocked(prisma.redactionRegion.create).mockResolvedValue({
      ...mockRegion,
      id: 'reg-new',
      source: 'manual',
    } as any);

    const app = createTestApp();
    const res = await request(app)
      .post('/prod-1/regions')
      .send({
        page: 0,
        xPct: 15,
        yPct: 30,
        wPct: 20,
        hPct: 4,
        reason: 'QR code',
        confidence: 'medium',
      });

    expect(res.status).toBe(201);
    expect(res.body.region).toBeDefined();
  });

  it('rejects page exceeding page count', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(mockProduct as any);

    const app = createTestApp();
    const res = await request(app)
      .post('/prod-1/regions')
      .send({
        page: 5,
        xPct: 10,
        yPct: 20,
        wPct: 30,
        hPct: 5,
        reason: 'Test',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceeds/i);
  });

  it('validates required fields', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/prod-1/regions')
      .send({ page: 0 }); // missing xPct, yPct, wPct, hPct, reason

    expect(res.status).toBe(400);
  });
});

describe('PATCH /:productId/regions/:regionId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates a region', async () => {
    vi.mocked(prisma.redactionRegion.findUnique).mockResolvedValue(mockRegion as any);
    vi.mocked(prisma.redactionRegion.update).mockResolvedValue({
      ...mockRegion,
      xPct: 12,
    } as any);

    const app = createTestApp();
    const res = await request(app)
      .patch('/prod-1/regions/reg-1')
      .send({ xPct: 12 });

    expect(res.status).toBe(200);
    expect(res.body.region.xPct).toBe(12);
  });

  it('returns 404 for wrong productId', async () => {
    vi.mocked(prisma.redactionRegion.findUnique).mockResolvedValue({
      ...mockRegion,
      productId: 'other-prod',
    } as any);

    const app = createTestApp();
    const res = await request(app)
      .patch('/prod-1/regions/reg-1')
      .send({ xPct: 12 });

    expect(res.status).toBe(404);
  });

  it('returns 404 for non-existent region', async () => {
    vi.mocked(prisma.redactionRegion.findUnique).mockResolvedValue(null);

    const app = createTestApp();
    const res = await request(app)
      .patch('/prod-1/regions/nonexistent')
      .send({ xPct: 12 });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /:productId/regions/:regionId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes a region', async () => {
    vi.mocked(prisma.redactionRegion.findUnique).mockResolvedValue(mockRegion as any);
    vi.mocked(prisma.redactionRegion.delete).mockResolvedValue(mockRegion as any);

    const app = createTestApp();
    const res = await request(app).delete('/prod-1/regions/reg-1');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Region deleted');
  });

  it('returns 404 for mismatched productId', async () => {
    vi.mocked(prisma.redactionRegion.findUnique).mockResolvedValue({
      ...mockRegion,
      productId: 'other-prod',
    } as any);

    const app = createTestApp();
    const res = await request(app).delete('/prod-1/regions/reg-1');

    expect(res.status).toBe(404);
  });
});

describe('GET /:productId/pages/:pageNum', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a presigned URL for a valid page', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(mockProduct as any);

    const app = createTestApp();
    const res = await request(app).get('/prod-1/pages/0');

    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://s3.example.com/signed-url');
    expect(res.body.page).toBe(0);
  });

  it('returns 400 for page exceeding count', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(mockProduct as any);

    const app = createTestApp();
    const res = await request(app).get('/prod-1/pages/5');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceeds/i);
  });

  it('returns 404 for non-existent product', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null);

    const app = createTestApp();
    const res = await request(app).get('/nonexistent/pages/0');

    expect(res.status).toBe(404);
  });
});

describe('POST /:productId/apply', () => {
  beforeEach(() => vi.clearAllMocks());

  it('applies redactions and returns redacted key', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(mockProduct as any);
    vi.mocked(prisma.redactionRegion.findMany).mockResolvedValue([mockRegion] as any);
    vi.mocked(prisma.product.update).mockResolvedValue({ ...mockProduct, coaRedactedKey: 'products/prod-1/coa/abc.pdf' } as any);

    // Mock axios for downloading PDF from S3
    const mockAxios = await import('axios');
    vi.spyOn(mockAxios.default, 'get').mockResolvedValue({
      data: Buffer.from('%PDF-1.4 test content'),
    });

    const app = createTestApp();
    const res = await request(app).post('/prod-1/apply');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Redacted PDF generated');
    expect(res.body.regionsApplied).toBe(1);
  });

  it('returns 400 when no original CoA exists', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      ...mockProduct,
      coaOriginalKey: null,
    } as any);

    const app = createTestApp();
    const res = await request(app).post('/prod-1/apply');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No original CoA/i);
  });

  it('returns 404 for non-existent product', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null);

    const app = createTestApp();
    const res = await request(app).post('/nonexistent/apply');

    expect(res.status).toBe(404);
  });
});
