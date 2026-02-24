import { Router, Request, Response } from 'express';
import logger from '../utils/logger';
import { prisma } from '../index';
import { validate, registerSchema, loginSchema } from '../utils/validation';
import {
  hashPassword,
  comparePassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
  refreshTokenExpiresAt,
} from '../utils/auth';
import { zohoRequest } from '../services/zohoAuth';
import { isAdmin } from '../middleware/auth';

const router = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/** clearCookie should not include maxAge (Express 5 deprecation) */
const CLEAR_COOKIE_OPTIONS = {
  httpOnly: COOKIE_OPTIONS.httpOnly,
  secure: COOKIE_OPTIONS.secure,
  sameSite: COOKIE_OPTIONS.sameSite,
  path: COOKIE_OPTIONS.path,
};

/**
 * POST /api/auth/register
 * Create a new user account. EULA is accepted as part of registration.
 */
router.post('/register', validate(registerSchema), async (req: Request, res: Response) => {
  const { email, password, firstName, lastName, companyName, phone, contactType, address, city, postalCode, mailingCountry } = req.body;

  // Check duplicate email
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const passwordHashed = await hashPassword(password);

  // Look up in Zoho CRM by email (fire-and-forget style — don't block registration on Zoho failure)
  let zohoContactId: string | null = null;
  try {
    const searchResult = await zohoRequest('GET', '/Contacts/search', { params: { email } });
    const zohoContact = searchResult?.data?.[0];
    if (zohoContact) {
      zohoContactId = zohoContact.id;
    }
  } catch (err: any) {
    if (err?.response?.status !== 204) {
      logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[AUTH] Zoho search during registration');
    }
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: passwordHashed,
      firstName,
      lastName,
      companyName,
      phone: phone || null,
      contactType,
      address: address || null,
      city: city || null,
      postalCode: postalCode || null,
      mailingCountry: mailingCountry || null,
      zohoContactId,
      docUploaded: false,
      approved: false,
    },
  });

  // Issue tokens
  const accessToken = signAccessToken({ userId: user.id, email: user.email });
  const refreshTok = signRefreshToken(user.id);

  // Store hashed refresh token
  await prisma.user.update({
    where: { id: user.id },
    data: {
      refreshToken: hashRefreshToken(refreshTok),
      refreshTokenExpiresAt: refreshTokenExpiresAt(),
    },
  });

  res.cookie('refreshToken', refreshTok, COOKIE_OPTIONS);

  // Zoho writeback — fire-and-forget (don't block registration on Zoho)
  if (zohoContactId) {
    try {
      const { pushRegistrationToZoho } = await import('../services/zohoApi');
      await pushRegistrationToZoho(zohoContactId, {
        id: user.id,
        firstName,
        lastName,
        companyName,
        contactType,
        phone,
        mailingCountry,
      });
    } catch (e) {
      logger.error(
        { err: e instanceof Error ? e : { message: String(e) } },
        '[AUTH] Zoho registration writeback failed',
      );
    }
  }

  logger.info({ email }, '[AUTH] New user registered');

  res.status(201).json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      companyName: user.companyName,
      contactType: user.contactType,
      approved: user.approved,
      eulaAcceptedAt: user.eulaAcceptedAt,
      docUploaded: user.docUploaded,
      mustChangePassword: user.mustChangePassword,
      isAdmin: isAdmin(user.email, user.isAdmin),
    },
    accessToken,
  });
});

/**
 * POST /api/auth/login
 */
router.post('/login', validate(loginSchema), async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const accessToken = signAccessToken({ userId: user.id, email: user.email });
  const refreshTok = signRefreshToken(user.id);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      refreshToken: hashRefreshToken(refreshTok),
      refreshTokenExpiresAt: refreshTokenExpiresAt(),
    },
  });

  res.cookie('refreshToken', refreshTok, COOKIE_OPTIONS);

  logger.info({ email }, '[AUTH] User logged in');

  res.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      companyName: user.companyName,
      contactType: user.contactType,
      approved: user.approved,
      eulaAcceptedAt: user.eulaAcceptedAt,
      docUploaded: user.docUploaded,
      mustChangePassword: user.mustChangePassword,
      isAdmin: isAdmin(user.email, user.isAdmin),
    },
    accessToken,
  });
});

/**
 * POST /api/auth/refresh
 * Rotate refresh token, issue new access token.
 */
router.post('/refresh', async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken;
  if (!token) {
    return res.status(401).json({ error: 'No refresh token' });
  }

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    res.clearCookie('refreshToken', CLEAR_COOKIE_OPTIONS);
    return res.status(401).json({ error: 'Invalid refresh token' });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || !user.refreshToken) {
    res.clearCookie('refreshToken', CLEAR_COOKIE_OPTIONS);
    return res.status(401).json({ error: 'Session expired' });
  }

  // Compare token hash
  const tokenHash = hashRefreshToken(token);
  if (tokenHash !== user.refreshToken) {
    // Possible token reuse — revoke all sessions for this user
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: null, refreshTokenExpiresAt: null },
    });
    res.clearCookie('refreshToken', CLEAR_COOKIE_OPTIONS);
    logger.warn({ userId: user.id }, '[AUTH] Refresh token reuse detected — sessions revoked');
    return res.status(401).json({ error: 'Session expired' });
  }

  // Check expiry
  if (user.refreshTokenExpiresAt && user.refreshTokenExpiresAt < new Date()) {
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: null, refreshTokenExpiresAt: null },
    });
    res.clearCookie('refreshToken', CLEAR_COOKIE_OPTIONS);
    return res.status(401).json({ error: 'Session expired' });
  }

  // Rotate: issue new tokens
  const accessToken = signAccessToken({ userId: user.id, email: user.email });
  const newRefreshTok = signRefreshToken(user.id);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      refreshToken: hashRefreshToken(newRefreshTok),
      refreshTokenExpiresAt: refreshTokenExpiresAt(),
    },
  });

  res.cookie('refreshToken', newRefreshTok, COOKIE_OPTIONS);

  res.json({
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      companyName: user.companyName,
      contactType: user.contactType,
      approved: user.approved,
      eulaAcceptedAt: user.eulaAcceptedAt,
      docUploaded: user.docUploaded,
      mustChangePassword: user.mustChangePassword,
      isAdmin: isAdmin(user.email, user.isAdmin),
    },
  });
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken;
  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      await prisma.user.update({
        where: { id: payload.userId },
        data: { refreshToken: null, refreshTokenExpiresAt: null },
      });
    } catch {
      // Token invalid — just clear the cookie
    }
  }

  res.clearCookie('refreshToken', CLEAR_COOKIE_OPTIONS);
  res.json({ message: 'Logged out' });
});

/**
 * POST /api/auth/upload-agreement
 * Upload sales agreement PDF. Requires JWT auth (not marketplace auth — user is pre-approval).
 */
router.post('/upload-agreement', async (req: Request, res: Response) => {
  // Manually verify JWT from Authorization header (can't use requireAuth since
  // this route is mounted before the main auth middleware chain)
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  let userId: string;
  try {
    const { verifyAccessToken } = await import('../utils/auth');
    const payload = verifyAccessToken(authHeader.slice(7));
    userId = payload.userId;
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (user.docUploaded) {
    return res.json({ message: 'Document already uploaded' });
  }

  // Mark document as uploaded
  await prisma.user.update({
    where: { id: user.id },
    data: { docUploaded: true },
  });

  // Zoho writeback (fire-and-forget)
  if (user.zohoContactId) {
    try {
      const { pushOnboardingMilestone } = await import('../services/zohoApi');
      await pushOnboardingMilestone(user.zohoContactId, 'agreement_uploaded');
    } catch (e) {
      logger.error({ err: e instanceof Error ? e : { message: String(e) } }, '[AUTH] Zoho doc upload writeback failed');
    }
  } else {
    // Create Zoho Contact for users not already in CRM
    try {
      const contactData: Record<string, any> = {
        First_Name: user.firstName || '',
        Last_Name: user.lastName || user.email,
        Email: user.email,
        Company: user.companyName || '',
        Account_Name: user.companyName || '',
        Contact_Type: (user.contactType || 'Buyer').split(';').map((s: string) => s.trim()).filter(Boolean),
        User_UID: user.id,
        EULA_Accepted: user.eulaAcceptedAt
          ? user.eulaAcceptedAt.toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
        Agreement_Uploaded: true,
      };
      if (user.phone) contactData.Phone = user.phone;
      if (user.mailingCountry) contactData.Mailing_Country = user.mailingCountry;

      const result = await zohoRequest('POST', '/Contacts', {
        data: { data: [contactData], trigger: [] },
      });
      const newZohoContactId = result?.data?.[0]?.details?.id;
      if (newZohoContactId) {
        await prisma.user.update({
          where: { id: user.id },
          data: { zohoContactId: newZohoContactId },
        });

        // Create registration Task on the new Contact
        await zohoRequest('POST', '/Tasks', {
          data: {
            data: [{
              Subject: `Marketplace Registration — ${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown',
              Status: 'Not Started',
              Priority: 'Normal',
              Who_Id: newZohoContactId,
              Description: [
                'User registered on Harvex Marketplace',
                `Name: ${user.firstName || ''} ${user.lastName || ''}`.trim(),
                `Company: ${user.companyName || 'N/A'}`,
                `Type: ${user.contactType || 'N/A'}`,
                `Date: ${user.createdAt.toISOString()}`,
              ].join('\n'),
            }],
            trigger: [],
          },
        });

        logger.info({ userId: user.id, newZohoContactId }, '[AUTH] Zoho Contact created on agreement upload');
      }
    } catch (e) {
      logger.error(
        { err: e instanceof Error ? e : { message: String(e) }, userId: user.id },
        '[AUTH] Zoho Contact creation on agreement upload failed',
      );
    }
  }

  logger.info({ email: user.email }, '[AUTH] Agreement uploaded');
  res.json({ message: 'Document upload recorded' });
});

export default router;
