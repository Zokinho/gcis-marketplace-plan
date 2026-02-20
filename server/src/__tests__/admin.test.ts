import express from 'express';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../index';
import adminRouter from '../routes/admin';

// Mock external services used by admin routes
vi.mock('../services/zohoSync', () => ({
  runFullSync: vi.fn().mockResolvedValue({ products: 10, contacts: 5 }),
  syncProducts: vi.fn().mockResolvedValue(10),
  syncContacts: vi.fn().mockResolvedValue(5),
  syncProductsDelta: vi.fn().mockResolvedValue(3),
}));

vi.mock('../services/auditService', () => ({
  logAudit: vi.fn(),
  getRequestIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('../services/coaClient', () => ({
  getCoaClient: vi.fn().mockReturnValue({
    getProductDetail: vi.fn().mockResolvedValue(null),
    getProductPdfUrl: vi.fn().mockReturnValue('http://coa/pdf'),
  }),
}));

vi.mock('../services/coaEmailSync', () => ({
  pollEmailIngestions: vi.fn().mockResolvedValue({ processed: 0 }),
}));

vi.mock('../services/sellerDetection', () => ({
  detectSeller: vi.fn().mockResolvedValue(null),
}));

vi.mock('../utils/coaMapper', () => ({
  mapCoaToProductFields: vi.fn().mockReturnValue({ name: 'Mapped Product' }),
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

const mockUser = {
  id: 'user-1',
  clerkUserId: 'clerk-user-1',
  zohoContactId: null,
  email: 'pending@example.com',
  firstName: 'Pending',
  lastName: 'User',
  companyName: 'Pending Corp',
  contactType: null,
  approved: false,
  eulaAcceptedAt: new Date(),
  docUploaded: true,
  createdAt: new Date(),
};

// ─── Test app factory ───

function createTestApp(router: express.Router, user: any = mockAdmin) {
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

describe('GET /sync-status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns summary with counts', async () => {
    const mockLogs = [
      { id: 'log-1', type: 'products', status: 'success', createdAt: new Date(), recordsProcessed: 10, errorDetails: null },
    ];
    const mockLastProductSync = { createdAt: new Date('2025-01-01') };
    const mockLastContactSync = { createdAt: new Date('2025-01-02') };

    vi.mocked(prisma.syncLog.findMany).mockResolvedValue(mockLogs as any);
    vi.mocked(prisma.syncLog.findFirst)
      .mockResolvedValueOnce(mockLastProductSync as any) // products
      .mockResolvedValueOnce(mockLastContactSync as any); // contacts
    vi.mocked(prisma.product.count).mockResolvedValue(42);
    vi.mocked(prisma.user.count).mockResolvedValue(15);

    const app = createTestApp(adminRouter);
    const res = await request(app).get('/sync-status');

    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.activeProducts).toBe(42);
    expect(res.body.summary.totalUsers).toBe(15);
    expect(res.body.summary.lastProductSync).toBeDefined();
    expect(res.body.summary.lastContactSync).toBeDefined();
    expect(res.body.recentLogs).toHaveLength(1);
  });

  it('returns null for lastSync when no sync has occurred', async () => {
    vi.mocked(prisma.syncLog.findMany).mockResolvedValue([]);
    vi.mocked(prisma.syncLog.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.product.count).mockResolvedValue(0);
    vi.mocked(prisma.user.count).mockResolvedValue(0);

    const app = createTestApp(adminRouter);
    const res = await request(app).get('/sync-status');

    expect(res.status).toBe(200);
    expect(res.body.summary.lastProductSync).toBeNull();
    expect(res.body.summary.lastContactSync).toBeNull();
  });
});

describe('POST /sync-now', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('triggers full sync when no type specified', async () => {
    const { runFullSync } = await import('../services/zohoSync');

    const app = createTestApp(adminRouter);
    const res = await request(app).post('/sync-now').send({});

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Sync completed');
    expect(runFullSync).toHaveBeenCalledTimes(1);
  });

  it('triggers products sync when type is products', async () => {
    const { syncProducts } = await import('../services/zohoSync');

    const app = createTestApp(adminRouter);
    const res = await request(app).post('/sync-now').send({ type: 'products' });

    expect(res.status).toBe(200);
    expect(syncProducts).toHaveBeenCalledTimes(1);
  });

  it('triggers delta sync when type is products-delta', async () => {
    const { syncProductsDelta } = await import('../services/zohoSync');

    const app = createTestApp(adminRouter);
    const res = await request(app).post('/sync-now').send({ type: 'products-delta' });

    expect(res.status).toBe(200);
    expect(syncProductsDelta).toHaveBeenCalledTimes(1);
  });

  it('triggers contacts sync when type is contacts', async () => {
    const { syncContacts } = await import('../services/zohoSync');

    const app = createTestApp(adminRouter);
    const res = await request(app).post('/sync-now').send({ type: 'contacts' });

    expect(res.status).toBe(200);
    expect(syncContacts).toHaveBeenCalledTimes(1);
  });
});

describe('GET /users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns user list', async () => {
    const users = [
      { ...mockUser, zohoContactId: 'zoho-1' },
      { ...mockUser, id: 'user-2', email: 'user2@example.com', zohoContactId: null },
    ];
    vi.mocked(prisma.user.findMany).mockResolvedValue(users as any);

    const app = createTestApp(adminRouter);
    const res = await request(app).get('/users');

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(2);
    // Should map zohoContactId to zohoLinked boolean
    expect(res.body.users[0].zohoLinked).toBe(true);
    expect(res.body.users[1].zohoLinked).toBe(false);
    // Should not expose zohoContactId
    expect(res.body.users[0].zohoContactId).toBeUndefined();
  });

  it('filters pending users when filter=pending', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);

    const app = createTestApp(adminRouter);
    await request(app).get('/users?filter=pending');

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          approved: false,
          OR: [
            { docUploaded: true },
            { zohoContactId: { not: null } },
          ],
        },
      }),
    );
  });

  it('filters approved users when filter=approved', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);

    const app = createTestApp(adminRouter);
    await request(app).get('/users?filter=approved');

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { approved: true },
      }),
    );
  });

  it('returns all users when filter=all', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);

    const app = createTestApp(adminRouter);
    await request(app).get('/users?filter=all');

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      }),
    );
  });
});

describe('POST /users/:userId/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets approved=true', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
    vi.mocked(prisma.user.update).mockResolvedValue({
      ...mockUser,
      approved: true,
    } as any);

    const app = createTestApp(adminRouter);
    const res = await request(app).post('/users/user-1/approve').send({});

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('User approved');
    expect(res.body.user.approved).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({ approved: true }),
    });
  });

  it('sets contactType when provided and user has none', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser,
      contactType: null,
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({
      ...mockUser,
      approved: true,
      contactType: 'Buyer',
    } as any);

    const app = createTestApp(adminRouter);
    const res = await request(app)
      .post('/users/user-1/approve')
      .send({ contactType: 'Buyer' });

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { approved: true, contactType: 'Buyer' },
    });
  });

  it('returns 404 for missing user', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const app = createTestApp(adminRouter);
    const res = await request(app).post('/users/nonexistent/approve').send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('User not found');
  });
});

describe('POST /users/:userId/reject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes user on rejection', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
    vi.mocked(prisma.user.delete).mockResolvedValue(mockUser as any);

    const app = createTestApp(adminRouter);
    const res = await request(app).post('/users/user-1/reject');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('User rejected and removed');
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });

  it('returns 404 for missing user', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const app = createTestApp(adminRouter);
    const res = await request(app).post('/users/nonexistent/reject');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('User not found');
  });
});

describe('GET /sellers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns seller list', async () => {
    const sellers = [
      { id: 'seller-1', email: 'seller@example.com', companyName: 'Seller Corp', firstName: 'John', lastName: 'Seller' },
      { id: 'seller-2', email: 'seller2@example.com', companyName: 'Another Corp', firstName: 'Jane', lastName: 'Seller' },
    ];
    vi.mocked(prisma.user.findMany).mockResolvedValue(sellers as any);

    const app = createTestApp(adminRouter);
    const res = await request(app).get('/sellers');

    expect(res.status).toBe(200);
    expect(res.body.sellers).toHaveLength(2);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contactType: { contains: 'Seller' } },
        orderBy: { companyName: 'asc' },
      }),
    );
  });
});

describe('GET /coa-email-queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns pending CoA records', async () => {
    const records = [
      {
        id: 'coa-1',
        status: 'ready',
        suggestedSellerId: 'seller-1',
        coaJobId: 'job-1',
        coaProductId: 'cprod-1',
        createdAt: new Date(),
      },
    ];
    const suggestedSeller = {
      id: 'seller-1',
      email: 'seller@example.com',
      companyName: 'Seller Corp',
      firstName: 'John',
      lastName: 'Seller',
    };

    vi.mocked(prisma.coaSyncRecord.findMany).mockResolvedValue(records as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(suggestedSeller as any);

    const app = createTestApp(adminRouter);
    const res = await request(app).get('/coa-email-queue');

    expect(res.status).toBe(200);
    expect(res.body.queue).toHaveLength(1);
    expect(res.body.queue[0].suggestedSeller).toBeDefined();
    expect(res.body.queue[0].suggestedSeller.id).toBe('seller-1');
  });

  it('returns records without suggested seller when none set', async () => {
    const records = [
      {
        id: 'coa-2',
        status: 'pending',
        suggestedSellerId: null,
        coaJobId: 'job-2',
        coaProductId: null,
        createdAt: new Date(),
      },
    ];

    vi.mocked(prisma.coaSyncRecord.findMany).mockResolvedValue(records as any);

    const app = createTestApp(adminRouter);
    const res = await request(app).get('/coa-email-queue');

    expect(res.status).toBe(200);
    expect(res.body.queue[0].suggestedSeller).toBeNull();
    // user.findUnique should not be called since suggestedSellerId is null
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
