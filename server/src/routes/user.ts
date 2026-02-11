import { Router, Request, Response } from 'express';
import { getAuth } from '@clerk/express';
import { prisma } from '../index';

const router = Router();

/**
 * Determine the user's onboarding status code.
 * This drives frontend routing decisions.
 */
function getUserStatusCode(user: {
  zohoContactId: string;
  approved: boolean;
  eulaAcceptedAt: Date | null;
  docUploaded: boolean;
}): string {
  if (!user.zohoContactId) return 'NO_ZOHO_LINK';
  if (!user.approved) return 'PENDING_APPROVAL';
  if (!user.eulaAcceptedAt) return 'EULA_REQUIRED';
  if (!user.docUploaded) return 'DOC_REQUIRED';
  return 'ACTIVE';
}

/**
 * GET /api/user/status
 * Returns the current user's account and onboarding status.
 * Requires Clerk authentication (userId injected by requireAuth).
 */
router.get('/status', async (req: Request, res: Response) => {
  const { userId: clerkUserId } = getAuth(req);

  if (!clerkUserId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = await prisma.user.findUnique({
    where: { clerkUserId },
  });

  if (!user) {
    // User signed up via Clerk but webhook hasn't fired yet,
    // or webhook failed — return a status so the frontend can handle it
    return res.json({
      status: 'NOT_FOUND',
      message: 'Account is being set up. Please wait a moment and refresh.',
    });
  }

  const statusCode = getUserStatusCode(user);

  res.json({
    status: statusCode,
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
    },
  });
});

export default router;
