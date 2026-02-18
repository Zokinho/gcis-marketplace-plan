import { describe, it, expect } from 'vitest';
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashPassword,
  comparePassword,
  hashRefreshToken,
  refreshTokenExpiresAt,
} from '../utils/auth';

describe('signAccessToken / verifyAccessToken', () => {
  it('round-trips a payload', () => {
    const payload = { userId: 'u1', email: 'test@test.com' };
    const token = signAccessToken(payload);
    const decoded = verifyAccessToken(token);
    expect(decoded).toEqual(payload);
  });

  it('throws on tampered token', () => {
    const token = signAccessToken({ userId: 'u1', email: 'test@test.com' });
    expect(() => verifyAccessToken(token + 'x')).toThrow();
  });

  it('throws on completely invalid string', () => {
    expect(() => verifyAccessToken('not-a-jwt')).toThrow();
  });

  it('returns only userId and email (strips JWT metadata)', () => {
    const token = signAccessToken({ userId: 'u1', email: 'test@test.com' });
    const decoded = verifyAccessToken(token);
    expect(Object.keys(decoded).sort()).toEqual(['email', 'userId']);
  });
});

describe('signRefreshToken / verifyRefreshToken', () => {
  it('round-trips a userId', () => {
    const token = signRefreshToken('u42');
    const decoded = verifyRefreshToken(token);
    expect(decoded).toEqual({ userId: 'u42', type: 'refresh' });
  });

  it('rejects an access token used as refresh token', () => {
    const accessToken = signAccessToken({ userId: 'u1', email: 'test@test.com' });
    // Access tokens don't have the refresh secret, so verification should fail
    expect(() => verifyRefreshToken(accessToken)).toThrow();
  });

  it('throws on tampered refresh token', () => {
    const token = signRefreshToken('u1');
    expect(() => verifyRefreshToken(token + 'tampered')).toThrow();
  });
});

describe('hashPassword / comparePassword', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('my-secret-pw');
    expect(hash).not.toBe('my-secret-pw');
    expect(hash.startsWith('$2')).toBe(true); // bcrypt prefix

    const match = await comparePassword('my-secret-pw', hash);
    expect(match).toBe(true);
  });

  it('rejects wrong password', async () => {
    const hash = await hashPassword('correct-password');
    const match = await comparePassword('wrong-password', hash);
    expect(match).toBe(false);
  });
});

describe('hashRefreshToken', () => {
  it('returns a 64-char hex string (SHA-256)', () => {
    const hash = hashRefreshToken('some-token');
    expect(hash).toHaveLength(64);
    expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
  });

  it('is deterministic', () => {
    const h1 = hashRefreshToken('token-abc');
    const h2 = hashRefreshToken('token-abc');
    expect(h1).toBe(h2);
  });

  it('different tokens produce different hashes', () => {
    const h1 = hashRefreshToken('token-a');
    const h2 = hashRefreshToken('token-b');
    expect(h1).not.toBe(h2);
  });
});

describe('refreshTokenExpiresAt', () => {
  it('returns a Date approximately 7 days in the future', () => {
    const expires = refreshTokenExpiresAt();
    const diff = expires.getTime() - Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    // Allow 5 seconds of drift
    expect(diff).toBeGreaterThan(sevenDaysMs - 5000);
    expect(diff).toBeLessThanOrEqual(sevenDaysMs);
  });
});
