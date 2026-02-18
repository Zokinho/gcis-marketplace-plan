import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import { isAdmin } from '../middleware/auth';
import { hashPassword, comparePassword } from '../utils/auth';
import { validate, changePasswordSchema } from '../utils/validation';

const router = Router();

/**
 * Determine the user's onboarding status code.
 * This drives frontend routing decisions.
 */
function getUserStatusCode(user: {
  approved: boolean;
  eulaAcceptedAt: Date | null;
  docUploaded: boolean;
}): string {
  if (!user.eulaAcceptedAt) return 'EULA_REQUIRED';
  if (!user.docUploaded) return 'DOC_REQUIRED';
  if (!user.approved) return 'PENDING_APPROVAL';
  return 'ACTIVE';
}

/**
 * GET /api/user/status
 * Returns the current user's account and onboarding status.
 * Requires JWT auth (userId injected by requireAuth).
 */
router.get('/status', async (req: Request, res: Response) => {
  const userId = (req as any).authUserId;

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return res.json({
      status: 'NOT_FOUND',
      message: 'Account not found.',
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
      isAdmin: isAdmin(user.email, user.isAdmin),
    },
  });
});

/**
 * POST /api/user/change-password
 * Allows a user to change their own password.
 * Requires current password verification. Clears refresh tokens to force re-login.
 */
router.post('/change-password', validate(changePasswordSchema), async (req: Request, res: Response) => {
  const userId = (req as any).authUserId;
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (!user.passwordHash) {
    return res.status(400).json({ error: 'No password set for this account' });
  }

  const { currentPassword, newPassword } = req.body;

  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Incorrect current password' });
  }

  const newHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: newHash,
      refreshToken: null,
      refreshTokenExpiresAt: null,
    },
  });

  res.json({ message: 'Password changed successfully' });
});

export default router;
