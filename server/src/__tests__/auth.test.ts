import { describe, it, expect, beforeEach, vi } from 'vitest';

// Set ADMIN_EMAILS env var BEFORE module load — vi.hoisted runs before imports
vi.hoisted(() => {
  process.env.ADMIN_EMAILS = 'admin@example.com,superadmin@test.com';
});

// Mock the auth utility (verifyAccessToken)
vi.mock('../utils/auth', () => ({
  verifyAccessToken: vi.fn(),
  signAccessToken: vi.fn(() => 'mock-access-token'),
  signRefreshToken: vi.fn(() => 'mock-refresh-token'),
  hashPassword: vi.fn(() => Promise.resolve('mock-hash')),
  comparePassword: vi.fn(() => Promise.resolve(true)),
  hashRefreshToken: vi.fn(() => 'mock-hash'),
  refreshTokenExpiresAt: vi.fn(() => new Date()),
}));

import { verifyAccessToken } from '../utils/auth';
import { marketplaceAuth, requireSeller, requireAdmin, requireAuth } from '../middleware/auth';
import { prisma } from '../index';

// ─── Helpers ───

function mockReq(overrides: any = {}): any {
  return { user: null, headers: {}, ...overrides };
}

function mockRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function createMockNext(): any {
  return vi.fn();
}

// A fully-approved user fixture
const approvedUser = {
  id: 'u1',
  clerkUserId: null,
  zohoContactId: 'zoho_c1',
  email: 'seller@example.com',
  firstName: 'Test',
  lastName: 'User',
  companyName: 'TestCo',
  contactType: 'Seller',
  approved: true,
  eulaAcceptedAt: new Date('2025-01-01'),
  docUploaded: true,
  isAdmin: false,
};

// ─── requireAuth ───

describe('requireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no Authorization header', () => {
    const middleware = requireAuth();
    const req = mockReq({ headers: {} });
    const res = mockRes();
    const next = createMockNext();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token is invalid', () => {
    vi.mocked(verifyAccessToken).mockImplementation(() => { throw new Error('Invalid'); });
    const middleware = requireAuth();
    const req = mockReq({ headers: { authorization: 'Bearer invalid' } });
    const res = mockRes();
    const next = createMockNext();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() and sets authUserId when token is valid', () => {
    vi.mocked(verifyAccessToken).mockReturnValue({ userId: 'u1', email: 'test@test.com' });
    const middleware = requireAuth();
    const req = mockReq({ headers: { authorization: 'Bearer valid-token' } });
    const res = mockRes();
    const next = createMockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.authUserId).toBe('u1');
  });
});

// ─── marketplaceAuth ───

describe('marketplaceAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no authUserId is present', async () => {
    const req = mockReq();
    const res = mockRes();
    const next = createMockNext();

    await marketplaceAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NOT_AUTHENTICATED' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 NOT_FOUND when user not found in DB', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const req = mockReq({ authUserId: 'unknown-id' });
    const res = mockRes();
    const next = createMockNext();

    await marketplaceAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 PENDING_APPROVAL when user is not approved', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...approvedUser,
      approved: false,
    } as any);

    const req = mockReq({ authUserId: 'u1' });
    const res = mockRes();
    const next = createMockNext();

    await marketplaceAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'PENDING_APPROVAL' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 EULA_REQUIRED when user has not accepted EULA', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...approvedUser,
      eulaAcceptedAt: null,
    } as any);

    const req = mockReq({ authUserId: 'u1' });
    const res = mockRes();
    const next = createMockNext();

    await marketplaceAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'EULA_REQUIRED' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 DOC_REQUIRED when user has not uploaded document', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...approvedUser,
      docUploaded: false,
    } as any);

    const req = mockReq({ authUserId: 'u1' });
    const res = mockRes();
    const next = createMockNext();

    await marketplaceAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'DOC_REQUIRED' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() and sets req.user for a fully approved user', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(approvedUser as any);

    const req = mockReq({ authUserId: 'u1' });
    const res = mockRes();
    const next = createMockNext();

    await marketplaceAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual(approvedUser);
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ─── requireSeller ───

describe('requireSeller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls next() when user has contactType containing "Seller"', () => {
    const req = mockReq({ user: { contactType: 'Seller' } });
    const res = mockRes();
    const next = createMockNext();

    requireSeller(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next() when contactType is "Buyer; Seller"', () => {
    const req = mockReq({ user: { contactType: 'Buyer; Seller' } });
    const res = mockRes();
    const next = createMockNext();

    requireSeller(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when user has contactType "Buyer"', () => {
    const req = mockReq({ user: { contactType: 'Buyer' } });
    const res = mockRes();
    const next = createMockNext();

    requireSeller(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Seller access required' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when user has null contactType', () => {
    const req = mockReq({ user: { contactType: null } });
    const res = mockRes();
    const next = createMockNext();

    requireSeller(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when req.user is not set', () => {
    const req = mockReq({ user: undefined });
    const res = mockRes();
    const next = createMockNext();

    requireSeller(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── requireAdmin ───

describe('requireAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when user is a Seller but not in ADMIN_EMAILS', () => {
    const req = mockReq({ user: { contactType: 'Seller', email: 'nobody@example.com' } });
    const res = mockRes();
    const next = createMockNext();

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when non-seller user email is in ADMIN_EMAILS', () => {
    const req = mockReq({ user: { contactType: 'Buyer', email: 'admin@example.com' } });
    const res = mockRes();
    const next = createMockNext();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next() for ADMIN_EMAILS match with different casing', () => {
    const req = mockReq({ user: { contactType: 'Buyer', email: 'SUPERADMIN@TEST.COM' } });
    const res = mockRes();
    const next = createMockNext();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 403 for non-seller with email not in ADMIN_EMAILS', () => {
    const req = mockReq({ user: { contactType: 'Buyer', email: 'random@example.com' } });
    const res = mockRes();
    const next = createMockNext();

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Admin access required' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when user has null contactType and email is not admin', () => {
    const req = mockReq({ user: { contactType: null, email: 'nobody@example.com' } });
    const res = mockRes();
    const next = createMockNext();

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when user has no email and is not a seller', () => {
    const req = mockReq({ user: { contactType: 'Buyer', email: null } });
    const res = mockRes();
    const next = createMockNext();

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
