import express from 'express';
import cookieParser from 'cookie-parser';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../index';

// Mock zohoAuth to prevent real Zoho calls
vi.mock('../services/zohoAuth', () => ({
  zohoRequest: vi.fn().mockRejectedValue({ response: { status: 204 } }),
}));

// Mock zohoApi for upload-agreement route
vi.mock('../services/zohoApi', () => ({
  pushOnboardingMilestone: vi.fn().mockResolvedValue(undefined),
}));

// Mock auth utility — only for upload-agreement (dynamic import inside the route)
// The other routes import auth directly at module load time, so they use real implementations.
vi.mock('../middleware/auth', () => ({
  isAdmin: vi.fn((_email: string | null, _flag: boolean) => false),
}));

import authRoutes from '../routes/auth';
import { hashRefreshToken, signAccessToken, signRefreshToken, hashPassword } from '../utils/auth';

// ─── Helpers ───

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/', authRoutes);
  return app;
}

const validRegistration = {
  email: 'new@example.com',
  password: 'StrongPa$$1',
  firstName: 'Jane',
  lastName: 'Doe',
  companyName: 'Acme Corp',
  contactType: 'Buyer',
};

// ─── POST /register ───

describe('POST /register', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a user and returns tokens (201)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: 'u1', email: 'new@example.com', firstName: 'Jane', lastName: 'Doe',
      companyName: 'Acme Corp', contactType: 'Buyer', approved: false,
      eulaAcceptedAt: new Date(), docUploaded: false, isAdmin: false,
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    const app = createApp();
    const res = await request(app).post('/register').send(validRegistration);

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe('new@example.com');
    expect(res.body.user.approved).toBe(false);
    // Should set refresh token cookie
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies).toBeDefined();
    expect(cookies.some((c: string) => c.startsWith('refreshToken='))).toBe(true);
  });

  it('returns 409 for duplicate email', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'existing' } as any);

    const app = createApp();
    const res = await request(app).post('/register').send(validRegistration);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it('returns 400 for missing required fields', async () => {
    const app = createApp();
    const res = await request(app).post('/register').send({ email: 'x@y.com' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for short password', async () => {
    const app = createApp();
    const res = await request(app).post('/register').send({
      ...validRegistration,
      password: 'short',
    });

    expect(res.status).toBe(400);
  });
});

// ─── POST /login ───

describe('POST /login', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns access token for valid credentials', async () => {
    const passwordHash = await hashPassword('CorrectPass1!');
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1', email: 'user@test.com', passwordHash,
      firstName: 'Test', lastName: 'User', companyName: 'Co',
      contactType: 'Buyer', approved: true,
      eulaAcceptedAt: new Date(), docUploaded: true, isAdmin: false,
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    const app = createApp();
    const res = await request(app)
      .post('/login')
      .send({ email: 'user@test.com', password: 'CorrectPass1!' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe('user@test.com');
  });

  it('returns 401 for wrong password', async () => {
    const passwordHash = await hashPassword('CorrectPass1!');
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1', email: 'user@test.com', passwordHash,
    } as any);

    const app = createApp();
    const res = await request(app)
      .post('/login')
      .send({ email: 'user@test.com', password: 'WrongPass' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('returns 401 for non-existent email', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/login')
      .send({ email: 'nobody@test.com', password: 'anything' });

    expect(res.status).toBe(401);
  });

  it('returns 401 when user has no passwordHash (legacy Clerk user)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1', email: 'user@test.com', passwordHash: null,
    } as any);

    const app = createApp();
    const res = await request(app)
      .post('/login')
      .send({ email: 'user@test.com', password: 'anything' });

    expect(res.status).toBe(401);
  });
});

// ─── POST /refresh ───

describe('POST /refresh', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no cookie present', async () => {
    const app = createApp();
    const res = await request(app).post('/refresh');

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/no refresh/i);
  });

  it('rotates tokens for valid refresh token', async () => {
    const refreshTok = signRefreshToken('u1');
    const tokenHash = hashRefreshToken(refreshTok);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1', email: 'user@test.com', refreshToken: tokenHash,
      refreshTokenExpiresAt: new Date(Date.now() + 86400000),
      firstName: 'Test', lastName: 'User', companyName: 'Co',
      contactType: 'Buyer', approved: true,
      eulaAcceptedAt: new Date(), docUploaded: true, isAdmin: false,
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    const app = createApp();
    const res = await request(app)
      .post('/refresh')
      .set('Cookie', `refreshToken=${refreshTok}`);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe('user@test.com');
  });

  it('returns 401 and revokes sessions on token reuse (hash mismatch)', async () => {
    const refreshTok = signRefreshToken('u1');

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1', email: 'user@test.com', refreshToken: 'different-hash',
      refreshTokenExpiresAt: new Date(Date.now() + 86400000),
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    const app = createApp();
    const res = await request(app)
      .post('/refresh')
      .set('Cookie', `refreshToken=${refreshTok}`);

    expect(res.status).toBe(401);
    // Should have revoked sessions
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { refreshToken: null, refreshTokenExpiresAt: null },
      }),
    );
  });

  it('returns 401 when refresh token has expired', async () => {
    const refreshTok = signRefreshToken('u1');
    const tokenHash = hashRefreshToken(refreshTok);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1', email: 'user@test.com', refreshToken: tokenHash,
      refreshTokenExpiresAt: new Date(Date.now() - 1000), // expired
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    const app = createApp();
    const res = await request(app)
      .post('/refresh')
      .set('Cookie', `refreshToken=${refreshTok}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired/i);
  });

  it('returns 401 when user not found', async () => {
    const refreshTok = signRefreshToken('u1');

    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/refresh')
      .set('Cookie', `refreshToken=${refreshTok}`);

    expect(res.status).toBe(401);
  });
});

// ─── POST /logout ───

describe('POST /logout', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clears refresh token in DB and cookie', async () => {
    const refreshTok = signRefreshToken('u1');
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    const app = createApp();
    const res = await request(app)
      .post('/logout')
      .set('Cookie', `refreshToken=${refreshTok}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logged out');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { refreshToken: null, refreshTokenExpiresAt: null },
      }),
    );
  });

  it('succeeds even without cookie (no-op)', async () => {
    const app = createApp();
    const res = await request(app).post('/logout');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logged out');
  });
});

// ─── POST /upload-agreement ───

describe('POST /upload-agreement', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 without auth header', async () => {
    const app = createApp();
    const res = await request(app).post('/upload-agreement');

    expect(res.status).toBe(401);
  });

  it('marks docUploaded=true for valid user', async () => {
    const token = signAccessToken({ userId: 'u1', email: 'user@test.com' });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1', email: 'user@test.com', docUploaded: false, zohoContactId: null,
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    const app = createApp();
    const res = await request(app)
      .post('/upload-agreement')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { docUploaded: true },
      }),
    );
  });

  it('returns success if already uploaded', async () => {
    const token = signAccessToken({ userId: 'u1', email: 'user@test.com' });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1', email: 'user@test.com', docUploaded: true,
    } as any);

    const app = createApp();
    const res = await request(app)
      .post('/upload-agreement')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/already/i);
  });

  it('returns 404 for non-existent user', async () => {
    const token = signAccessToken({ userId: 'ghost', email: 'ghost@test.com' });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/upload-agreement')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
