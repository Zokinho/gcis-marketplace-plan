import { Router, Request, Response } from 'express';
import { getAuth } from '@clerk/express';
import { prisma } from '../index';
import { pushOnboardingMilestone } from '../services/zohoApi';

const router = Router();

/**
 * POST /api/onboarding/accept-eula
 * Records that the user accepted the EULA.
 */
router.post('/accept-eula', async (req: Request, res: Response) => {
  const { userId: clerkUserId } = getAuth(req);

  if (!clerkUserId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = await prisma.user.findUnique({
    where: { clerkUserId },
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (!user.approved) {
    return res.status(403).json({ error: 'Account not yet approved' });
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
    } catch (e) { console.error('[ONBOARDING] Zoho EULA writeback failed:', e); }
  }

  res.json({
    message: 'EULA accepted',
    eulaAcceptedAt: updated.eulaAcceptedAt,
  });
});

/**
 * POST /api/onboarding/upload-doc
 * Records that the user uploaded their agreement document.
 * In a full implementation, the file would be uploaded to Zoho Contact attachments.
 * For now, we just mark the flag — file upload integration comes in Phase 4.
 */
router.post('/upload-doc', async (req: Request, res: Response) => {
  const { userId: clerkUserId } = getAuth(req);

  if (!clerkUserId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = await prisma.user.findUnique({
    where: { clerkUserId },
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (!user.approved) {
    return res.status(403).json({ error: 'Account not yet approved' });
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
    } catch (e) { console.error('[ONBOARDING] Zoho doc upload writeback failed:', e); }
  }

  res.json({ message: 'Document upload recorded' });
});

export default router;
