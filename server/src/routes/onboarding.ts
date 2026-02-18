import { Router, Request, Response } from 'express';
import logger from '../utils/logger';
import { prisma } from '../index';
import { pushOnboardingMilestone } from '../services/zohoApi';
import { zohoRequest } from '../services/zohoAuth';

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

  // Zoho writeback — push Agreement_Uploaded to Contact, or create Contact if not in Zoho
  if (user.zohoContactId) {
    try {
      await pushOnboardingMilestone(user.zohoContactId, 'agreement_uploaded');
    } catch (e) { logger.error({ err: e instanceof Error ? e : { message: String(e) } }, '[ONBOARDING] Zoho doc upload writeback failed'); }
  } else {
    // Create Zoho Contact for users not already in CRM
    try {
      const contactData: Record<string, any> = {
        First_Name: user.firstName || '',
        Last_Name: user.lastName || user.email,
        Email: user.email,
        Company: user.companyName || '',
        Contact_Type: user.contactType || 'Buyer',
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
              Subject: `Marketplace Registration — ${user.companyName || 'Unknown'}`,
              Status: 'Completed',
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

        logger.info({ userId: user.id, newZohoContactId }, '[ONBOARDING] Zoho Contact created on agreement upload');
      }
    } catch (e) {
      logger.error(
        { err: e instanceof Error ? e : { message: String(e) }, userId: user.id },
        '[ONBOARDING] Zoho Contact creation on agreement upload failed',
      );
    }
  }

  res.json({ message: 'Document upload recorded' });
});

export default router;
