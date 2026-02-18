import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/auth';
import { prisma } from '../index';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        clerkUserId: string | null;
        zohoContactId: string | null;
        email: string;
        firstName: string | null;
        lastName: string | null;
        companyName: string | null;
        contactType: string | null;
        approved: boolean;
        isAdmin: boolean;
        eulaAcceptedAt: Date | null;
        docUploaded: boolean;
      };
    }
  }
}

/**
 * JWT auth middleware.
 * Extracts Bearer token, verifies it, and sets req.authUserId.
 */
export function requireAuth() {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const payload = verifyAccessToken(authHeader.slice(7));
      (req as any).authUserId = payload.userId;
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

/**
 * Marketplace auth middleware.
 * Checks: JWT userId → local user → approved → EULA → doc uploaded
 */
export async function marketplaceAuth(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).authUserId;

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated', code: 'NOT_AUTHENTICATED' });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return res.status(403).json({ error: 'Account not found', code: 'NOT_FOUND' });
  }
  if (!user.approved) {
    return res.status(403).json({ error: 'Account pending approval', code: 'PENDING_APPROVAL' });
  }
  if (!user.eulaAcceptedAt) {
    return res.status(403).json({ error: 'EULA not accepted', code: 'EULA_REQUIRED' });
  }
  if (!user.docUploaded) {
    return res.status(403).json({ error: 'Document upload required', code: 'DOC_REQUIRED' });
  }

  req.user = user;

  // Tag Sentry events with authenticated user
  try {
    const { setUserContext } = await import('../utils/sentry');
    setUserContext(user.id, user.email);
  } catch { /* Sentry not available — ignore */ }

  next();
}

/**
 * Seller-only route guard.
 */
export function requireSeller(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.contactType?.includes('Seller')) {
    return res.status(403).json({ error: 'Seller access required' });
  }
  next();
}

// Cache admin emails at module load (parsed once, not per-request)
const ADMIN_EMAILS_SET = new Set(
  (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
);

/**
 * Admin route guard.
 * Allows users whose email is in ADMIN_EMAILS env var OR who have isAdmin=true in DB.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.isAdmin && !isAdminByEmail(req.user?.email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/** Check if a user is an admin (DB flag or env var). */
export function isAdmin(email: string | null | undefined, isAdminFlag?: boolean): boolean {
  if (isAdminFlag) return true;
  return isAdminByEmail(email);
}

/** Check if an email is in the ADMIN_EMAILS env var. */
function isAdminByEmail(email: string | null | undefined): boolean {
  return email ? ADMIN_EMAILS_SET.has(email.toLowerCase()) : false;
}
