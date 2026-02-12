import { Request, Response, NextFunction } from 'express';
import { requireAuth, getAuth } from '@clerk/express';
import { prisma } from '../index';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        clerkUserId: string;
        zohoContactId: string | null;
        email: string;
        firstName: string | null;
        lastName: string | null;
        companyName: string | null;
        contactType: string | null;
        approved: boolean;
        eulaAcceptedAt: Date | null;
        docUploaded: boolean;
      };
    }
  }
}

/**
 * Marketplace auth middleware.
 * Checks: Clerk JWT → local user → Zoho link → approved → EULA → doc uploaded
 */
export async function marketplaceAuth(req: Request, res: Response, next: NextFunction) {
  const { userId: clerkUserId } = getAuth(req);

  if (!clerkUserId) {
    return res.status(401).json({ error: 'Not authenticated', code: 'NOT_AUTHENTICATED' });
  }

  const user = await prisma.user.findUnique({
    where: { clerkUserId },
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
 * Only allows users whose email is in the ADMIN_EMAILS list.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdmin(req.user?.email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/** Check if an email is in the admin list. */
export function isAdmin(email: string | null | undefined): boolean {
  return email ? ADMIN_EMAILS_SET.has(email.toLowerCase()) : false;
}

export { requireAuth };
