import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-me';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const BCRYPT_ROUNDS = 12;

export interface AccessTokenPayload {
  userId: string;
  email: string;
}

export interface RefreshTokenPayload {
  userId: string;
  type: 'refresh';
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as AccessTokenPayload & jwt.JwtPayload;
  return { userId: decoded.userId, email: decoded.email };
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ userId, type: 'refresh' }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as RefreshTokenPayload & jwt.JwtPayload;
  if (decoded.type !== 'refresh') throw new Error('Invalid token type');
  return { userId: decoded.userId, type: decoded.type };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Milliseconds until refresh token expires (7 days from now) */
export function refreshTokenExpiresAt(): Date {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}
