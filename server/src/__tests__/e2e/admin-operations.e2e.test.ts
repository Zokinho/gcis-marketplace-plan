import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../../index';
import adminRouter from '../../routes/admin';
import notificationsRouter from '../../routes/notifications';
import { createE2EApp, makeAdmin } from './helpers';

// Set ADMIN_EMAILS before module load
vi.hoisted(() => {
  process.env.ADMIN_EMAILS = 'admin@example.com';
});

// Mock services used by admin routes
vi.mock('../../services/zohoSync', () => ({
  runFullSync: vi.fn().mockResolvedValue({ products: 10, contacts: 5 }),
  syncProducts: vi.fn().mockResolvedValue(10),
  syncContacts: vi.fn().mockResolvedValue(5),
  syncProductsDelta: vi.fn().mockResolvedValue(3),
}));

vi.mock('../../services/auditService', () => ({
  logAudit: vi.fn(),
  getRequestIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('../../services/notificationService', () => ({
  createNotification: vi.fn(),
  createNotificationBatch: vi.fn(),
  getUnreadCount: vi.fn().mockResolvedValue(0),
  getEffectivePrefs: vi.fn().mockResolvedValue({}),
  DEFAULT_NOTIFICATION_PREFS: {},
}));

vi.mock('../../services/coaClient', () => ({
  getCoaClient: vi.fn().mockReturnValue({
    getProductDetail: vi.fn().mockResolvedValue(null),
    getProductPdfUrl: vi.fn().mockReturnValue('http://coa/pdf'),
  }),
}));

vi.mock('../../services/coaEmailSync', () => ({
  pollEmailIngestions: vi.fn().mockResolvedValue({ processed: 0 }),
}));

vi.mock('../../services/sellerDetection', () => ({
  detectSeller: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../utils/coaMapper', () => ({
  mapCoaToProductFields: vi.fn().mockReturnValue({ name: 'Mapped Product' }),
}));

const admin = makeAdmin();

describe('E2E: Admin operations + audit trail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const pendingUser1 = {
    id: 'pending-1',
    clerkUserId: 'clerk-p1',
    zohoContactId: null,
    email: 'pending1@example.com',
    firstName: 'Pending',
    lastName: 'One',
    companyName: 'PendingCorp',
    contactType: null,
    approved: false,
    eulaAcceptedAt: new Date(),
    docUploaded: true,
    createdAt: new Date(),
  };

  const pendingUser2 = {
    ...pendingUser1,
    id: 'pending-2',
    clerkUserId: 'clerk-p2',
    email: 'pending2@example.com',
    lastName: 'Two',
  };

  it('admin lists pending users', async () => {
    const app = createE2EApp(admin, { '/api/admin': adminRouter });

    vi.mocked(prisma.user.findMany).mockResolvedValue([pendingUser1, pendingUser2] as any);

    const res = await request(app).get('/api/admin/users?filter=pending');

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(2);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { approved: false, OR: [{ docUploaded: true }, { zohoContactId: { not: null } }] } }),
    );
  });

  it('admin approves user → audit user.approve logged', async () => {
    const app = createE2EApp(admin, { '/api/admin': adminRouter });

    vi.mocked(prisma.user.findUnique).mockResolvedValue(pendingUser1 as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...pendingUser1, approved: true } as any);

    const res = await request(app)
      .post('/api/admin/users/pending-1/approve')
      .send({ contactType: 'Buyer' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('User approved');
    expect(res.body.user.approved).toBe(true);

    const { logAudit } = await import('../../services/auditService');
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.approve', targetId: 'pending-1' }),
    );
  });

  it('admin rejects user → user deleted, audit user.reject logged', async () => {
    const app = createE2EApp(admin, { '/api/admin': adminRouter });

    vi.mocked(prisma.user.findUnique).mockResolvedValue(pendingUser2 as any);
    vi.mocked(prisma.user.delete).mockResolvedValue(pendingUser2 as any);

    const res = await request(app).post('/api/admin/users/pending-2/reject');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('User rejected and removed');
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'pending-2' } });

    const { logAudit } = await import('../../services/auditService');
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.reject', targetId: 'pending-2' }),
    );
  });

  it('admin views audit log → entries returned', async () => {
    const app = createE2EApp(admin, { '/api/admin': adminRouter });

    const auditEntries = [
      { id: 'al-1', action: 'user.approve', actorId: 'admin-1', actorEmail: 'admin@example.com', targetType: 'user', targetId: 'pending-1', metadata: {}, ip: '127.0.0.1', createdAt: new Date() },
      { id: 'al-2', action: 'user.reject', actorId: 'admin-1', actorEmail: 'admin@example.com', targetType: 'user', targetId: 'pending-2', metadata: {}, ip: '127.0.0.1', createdAt: new Date() },
    ];

    vi.mocked(prisma.auditLog.findMany).mockResolvedValue(auditEntries as any);
    vi.mocked(prisma.auditLog.count).mockResolvedValue(2);

    const res = await request(app).get('/api/admin/audit-log');

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);
    expect(res.body.pagination.total).toBe(2);
  });

  it('admin filters audit log by action', async () => {
    const app = createE2EApp(admin, { '/api/admin': adminRouter });

    const approveEntry = {
      id: 'al-1',
      action: 'user.approve',
      actorId: 'admin-1',
      actorEmail: 'admin@example.com',
      targetType: 'user',
      targetId: 'pending-1',
      metadata: {},
      ip: '127.0.0.1',
      createdAt: new Date(),
    };

    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([approveEntry] as any);
    vi.mocked(prisma.auditLog.count).mockResolvedValue(1);

    const res = await request(app).get('/api/admin/audit-log?action=user.approve');

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].action).toBe('user.approve');
  });

  it('admin views sync status', async () => {
    const app = createE2EApp(admin, { '/api/admin': adminRouter });

    vi.mocked(prisma.syncLog.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.syncLog.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.product.count).mockResolvedValue(42);
    vi.mocked(prisma.user.count).mockResolvedValue(15);

    const res = await request(app).get('/api/admin/sync-status');

    expect(res.status).toBe(200);
    expect(res.body.summary.activeProducts).toBe(42);
    expect(res.body.summary.totalUsers).toBe(15);
  });

  it('admin triggers sync → audit sync.trigger logged', async () => {
    const app = createE2EApp(admin, { '/api/admin': adminRouter });

    const res = await request(app).post('/api/admin/sync-now').send({});

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Sync completed');

    const { logAudit } = await import('../../services/auditService');
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'sync.trigger' }),
    );
  });

  it('admin views CoA email queue', async () => {
    const app = createE2EApp(admin, { '/api/admin': adminRouter });

    const records = [{
      id: 'coa-1',
      status: 'ready',
      suggestedSellerId: 'seller-1',
      coaJobId: 'job-1',
      coaProductId: 'cprod-1',
      createdAt: new Date(),
    }];

    vi.mocked(prisma.coaSyncRecord.findMany).mockResolvedValue(records as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'seller-1',
      email: 'seller@example.com',
      companyName: 'Seller Corp',
      firstName: 'John',
      lastName: 'Seller',
    } as any);

    const res = await request(app).get('/api/admin/coa-email-queue');

    expect(res.status).toBe(200);
    expect(res.body.queue).toHaveLength(1);
    expect(res.body.queue[0].suggestedSeller).toBeDefined();
  });

  it('admin confirms CoA record → audit coa.confirm logged', async () => {
    const app = createE2EApp(admin, { '/api/admin': adminRouter });

    const coaRecord = {
      id: 'coa-1',
      status: 'ready',
      coaJobId: 'job-1',
      coaProductId: 'cprod-1',
      suggestedSellerId: null,
      extractedFields: { name: 'Test Product' },
    };

    const sellerUser = { id: 'seller-1', email: 'seller@example.com' };

    vi.mocked(prisma.coaSyncRecord.findUnique).mockResolvedValue(coaRecord as any);
    // Seller verification
    vi.mocked(prisma.user.findUnique).mockResolvedValue(sellerUser as any);
    // CoA client mock returns product data (set up via vi.mock above)
    const { getCoaClient } = await import('../../services/coaClient');
    vi.mocked(getCoaClient).mockReturnValue({
      getProductDetail: vi.fn().mockResolvedValue({ name: 'Extracted Product' }),
      getProductPdfUrl: vi.fn().mockReturnValue('http://coa/pdf/cprod-1'),
    } as any);

    vi.mocked(prisma.product.create).mockResolvedValue({ id: 'new-prod-1' } as any);
    vi.mocked(prisma.coaSyncRecord.update).mockResolvedValue({ ...coaRecord, status: 'confirmed' } as any);

    const res = await request(app)
      .post('/api/admin/coa-email-confirm')
      .send({ syncRecordId: 'coa-1', sellerId: 'seller-1' });

    expect(res.status).toBe(200);

    const { logAudit } = await import('../../services/auditService');
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'coa.confirm' }),
    );
  });

  it('admin dismisses CoA record → audit coa.dismiss logged', async () => {
    const app = createE2EApp(admin, { '/api/admin': adminRouter });

    vi.mocked(prisma.coaSyncRecord.update).mockResolvedValue({
      id: 'coa-2',
      status: 'dismissed',
      coaJobId: 'job-2',
    } as any);

    const res = await request(app)
      .post('/api/admin/coa-email-dismiss')
      .send({ syncRecordId: 'coa-2' });

    expect(res.status).toBe(200);

    const { logAudit } = await import('../../services/auditService');
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'coa.dismiss' }),
    );
  });
});
