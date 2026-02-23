import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { prisma } from '../../index';
import { makeAdmin } from './helpers';

// Set ADMIN_EMAILS before module load
vi.hoisted(() => {
  process.env.ADMIN_EMAILS = 'admin@example.com';
});

vi.mock('../../services/zohoAuth', () => ({
  zohoRequest: vi.fn().mockRejectedValue({ response: { status: 204 } }),
}));

vi.mock('../../services/zohoApi', () => ({
  pushOnboardingMilestone: vi.fn().mockResolvedValue(undefined),
  pushProductUpdate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/auditService', () => ({
  logAudit: vi.fn(),
  getRequestIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('../../services/notificationService', () => ({
  createNotification: vi.fn(),
}));

vi.mock('../../services/zohoSync', () => ({
  runFullSync: vi.fn().mockResolvedValue({ products: 0, contacts: 0 }),
  syncProducts: vi.fn().mockResolvedValue(0),
  syncContacts: vi.fn().mockResolvedValue(0),
  syncProductsDelta: vi.fn().mockResolvedValue(0),
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

import userRouter from '../../routes/user';
import onboardingRouter from '../../routes/onboarding';
import adminRouter from '../../routes/admin';

const admin = makeAdmin();

/**
 * Build an app for user+onboarding routes.
 * User/onboarding routes use (req as any).authUserId — inject it via middleware.
 * Admin routes use req.user injection pattern.
 */
function createOnboardingApp(authUserId: string) {
  const app = express();
  app.use(express.json());
  // Inject authUserId for user/onboarding routes (replaces old getAuth mock)
  app.use((req, _res, next) => {
    (req as any).authUserId = authUserId;
    next();
  });
  app.use('/api/user', userRouter);
  app.use('/api/onboarding', onboardingRouter);
  // Admin routes use req.user injection
  app.use((req, _res, next) => {
    req.user = admin;
    next();
  });
  app.use('/api/admin', adminRouter);
  return app;
}

describe('E2E: Signup → Onboarding → Approval flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // A new user: not yet approved, no EULA and no doc
  const newUser = {
    id: 'new-user-1',
    clerkUserId: null,
    zohoContactId: null,
    email: 'newuser@example.com',
    firstName: 'New',
    lastName: 'User',
    companyName: 'NewCorp',
    contactType: null,
    approved: false,
    eulaAcceptedAt: null,
    docUploaded: false,
    createdAt: new Date(),
  };

  it('new user status → EULA_REQUIRED', async () => {
    const app = createOnboardingApp('new-user-1');

    vi.mocked(prisma.user.findUnique).mockResolvedValue(newUser as any);

    const res = await request(app).get('/api/user/status');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('EULA_REQUIRED');
  });

  it('user accepts EULA → eulaAcceptedAt set', async () => {
    const app = createOnboardingApp('new-user-1');

    vi.mocked(prisma.user.findUnique).mockResolvedValue(newUser as any);

    const now = new Date();
    vi.mocked(prisma.user.update).mockResolvedValue({
      ...newUser,
      eulaAcceptedAt: now,
    } as any);

    const res = await request(app).post('/api/onboarding/accept-eula');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('EULA accepted');
    expect(res.body.eulaAcceptedAt).toBeDefined();
  });

  it('after EULA, status → DOC_REQUIRED', async () => {
    const app = createOnboardingApp('new-user-1');

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...newUser,
      eulaAcceptedAt: new Date(),
    } as any);

    const res = await request(app).get('/api/user/status');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('DOC_REQUIRED');
  });

  it('user uploads both license documents → docUploaded set', async () => {
    const app = createOnboardingApp('new-user-1');

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...newUser,
      eulaAcceptedAt: new Date(),
      docUploaded: false,
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({
      ...newUser,
      eulaAcceptedAt: new Date(),
      docUploaded: true,
    } as any);

    const res = await request(app)
      .post('/api/onboarding/upload-doc')
      .attach('healthCanadaLicense', Buffer.from('fake-hc-license'), 'hc-license.pdf')
      .attach('craLicense', Buffer.from('fake-cra-license'), 'cra-license.pdf');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Documents uploaded successfully');
  });

  it('upload fails if only one file is provided → 400', async () => {
    const app = createOnboardingApp('new-user-1');

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...newUser,
      eulaAcceptedAt: new Date(),
      docUploaded: false,
    } as any);

    const res = await request(app)
      .post('/api/onboarding/upload-doc')
      .attach('healthCanadaLicense', Buffer.from('fake-hc-license'), 'hc-license.pdf');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Both Health Canada License and CRA License are required');
  });

  it('after doc upload, status → PENDING_APPROVAL', async () => {
    const app = createOnboardingApp('new-user-1');

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...newUser,
      eulaAcceptedAt: new Date(),
      docUploaded: true,
      approved: false,
    } as any);

    const res = await request(app).get('/api/user/status');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PENDING_APPROVAL');
  });

  it('admin approves user → approved set to true', async () => {
    const app = createOnboardingApp('new-user-1');

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...newUser,
      eulaAcceptedAt: new Date(),
      docUploaded: true,
      approved: false,
    } as any);

    vi.mocked(prisma.user.update).mockResolvedValue({
      ...newUser,
      eulaAcceptedAt: new Date(),
      docUploaded: true,
      approved: true,
      contactType: 'Buyer',
    } as any);

    const res = await request(app)
      .post('/api/admin/users/new-user-1/approve')
      .send({ contactType: 'Buyer' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('User approved');
    expect(res.body.user.approved).toBe(true);
  });

  it('after admin approval, status → ACTIVE', async () => {
    const app = createOnboardingApp('new-user-1');

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...newUser,
      eulaAcceptedAt: new Date(),
      docUploaded: true,
      approved: true,
      contactType: 'Buyer',
    } as any);

    const res = await request(app).get('/api/user/status');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACTIVE');
  });

  it('cannot upload doc before accepting EULA → 400', async () => {
    const app = createOnboardingApp('new-user-1');

    vi.mocked(prisma.user.findUnique).mockResolvedValue(newUser as any);

    const res = await request(app).post('/api/onboarding/upload-doc');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Must accept EULA before uploading document');
  });
});
