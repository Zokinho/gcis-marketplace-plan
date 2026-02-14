import { describe, it, expect, beforeEach, vi } from 'vitest';

// Set ADMIN_EMAILS env var BEFORE module load — vi.hoisted runs before imports
vi.hoisted(() => {
  process.env.ADMIN_EMAILS = 'admin@example.com,superadmin@test.com';
});

// Mock @clerk/express BEFORE importing the module under test
vi.mock('@clerk/express', () => ({
  requireAuth: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  getAuth: vi.fn(),
}));

import { getAuth } from '@clerk/express';
import { marketplaceAuth, requireSeller, requireAdmin } from '../middleware/auth';
import { prisma } from '../index';

// ─── Helpers ───

function mockReq(overrides: any = {}): any {
  return { user: null, ...overrides };
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
  clerkUserId: 'clerk_123',
  zohoContactId: 'zoho_c1',
  email: 'seller@example.com',
  firstName: 'Test',
  lastName: 'User',
  companyName: 'TestCo',
  contactType: 'Seller',
  approved: true,
  eulaAcceptedAt: new Date('2025-01-01'),
  docUploaded: true,
};

// ─── marketplaceAuth ───

describe('marketplaceAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no clerkUserId is present', async () => {
    vi.mocked(getAuth).mockReturnValue({ userId: null } as any);

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
    vi.mocked(getAuth).mockReturnValue({ userId: 'clerk_unknown' } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const req = mockReq();
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
    vi.mocked(getAuth).mockReturnValue({ userId: 'clerk_123' } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...approvedUser,
      approved: false,
    } as any);

    const req = mockReq();
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
    vi.mocked(getAuth).mockReturnValue({ userId: 'clerk_123' } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...approvedUser,
      eulaAcceptedAt: null,
    } as any);

    const req = mockReq();
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
    vi.mocked(getAuth).mockReturnValue({ userId: 'clerk_123' } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...approvedUser,
      docUploaded: false,
    } as any);

    const req = mockReq();
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
    vi.mocked(getAuth).mockReturnValue({ userId: 'clerk_123' } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(approvedUser as any);

    const req = mockReq();
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
