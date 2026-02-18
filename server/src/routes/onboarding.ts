import { Router, Request, Response } from 'express';
import logger from '../utils/logger';
import { prisma } from '../index';
import { pushOnboardingMilestone } from '../services/zohoApi';

const router = Router();

/**
 * POST /api/onboarding/accept-eula
 * Records that the user accepted the EULA.
 */
router.post('/accept-eula', async (req: Request, res: Response) => {
  const userId = (req as any).authUserId;

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (user.eulaAcceptedAt) {
    return res.json({ message: 'EULA already accepted', eulaAcceptedAt: user.eulaAcceptedAt });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { eulaAcceptedAt: new Date() },
  });

  // Zoho writeback — push EULA_Accepted date to Contact
  if (user.zohoContactId) {
    try {
      await pushOnboardingMilestone(user.zohoContactId, 'eula_accepted');
    } catch (e) { logger.error({ err: e instanceof Error ? e : { message: String(e) } }, '[ONBOARDING] Zoho EULA writeback failed'); }
  }

  res.json({
    message: 'EULA accepted',
    eulaAcceptedAt: updated.eulaAcceptedAt,
  });
});

/**
 * POST /api/onboarding/upload-doc
 * Records that the user uploaded their agreement document.
 */
router.post('/upload-doc', async (req: Request, res: Response) => {
  const userId = (req as any).authUserId;

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (!user.eulaAcceptedAt) {
    return res.status(400).json({ error: 'Must accept EULA before uploading document' });
  }

  if (user.docUploaded) {
    return res.json({ message: 'Document already uploaded' });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { docUploaded: true },
  });

  // Zoho writeback — push Agreement_Uploaded to Contact
  if (user.zohoContactId) {
    try {
      await pushOnboardingMilestone(user.zohoContactId, 'agreement_uploaded');
    } catch (e) { logger.error({ err: e instanceof Error ? e : { message: String(e) } }, '[ONBOARDING] Zoho doc upload writeback failed'); }
  }

  res.json({ message: 'Document upload recorded' });
});

export default router;
