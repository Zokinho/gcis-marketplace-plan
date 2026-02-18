import { Router, Request, Response } from 'express';
import { Readable } from 'stream';
import multer from 'multer';
import axios from 'axios';
import FormData from 'form-data';
import logger from '../utils/logger';
import { prisma } from '../index';
import { pushOnboardingMilestone } from '../services/zohoApi';
import { zohoRequest, getAccessToken, ZOHO_API_URL } from '../services/zohoAuth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
router.post('/upload-doc', upload.single('file'), async (req: Request, res: Response) => {
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

  // Helper: upload file as attachment to a Zoho Contact
  const uploadFileToZohoContact = async (zohoContactId: string) => {
    if (!req.file) {
      logger.warn({ userId: user.id }, '[ONBOARDING] No file in request — skipping Zoho attachment');
      return;
    }
    try {
      const token = await getAccessToken();
      const form = new FormData();
      const stream = Readable.from(req.file.buffer);
      form.append('file', stream, { filename: req.file.originalname, contentType: req.file.mimetype });
      const v2Url = ZOHO_API_URL.replace('/v7', '/v2');
      await axios.post(`${v2Url}/Contacts/${zohoContactId}/Attachments`, form, {
        headers: { Authorization: `Zoho-oauthtoken ${token}`, ...form.getHeaders() },
        maxContentLength: 20 * 1024 * 1024,
      });
      logger.info({ userId: user.id, zohoContactId }, '[ONBOARDING] Agreement file uploaded to Zoho Contact');
    } catch (e) {
      logger.error({ err: e instanceof Error ? e : { message: String(e) }, userId: user.id }, '[ONBOARDING] Zoho file attachment failed');
    }
  };

  // Zoho writeback — push Agreement_Uploaded to Contact, or create Contact if not in Zoho
  if (user.zohoContactId) {
    try {
      await pushOnboardingMilestone(user.zohoContactId, 'agreement_uploaded');
    } catch (e) { logger.error({ err: e instanceof Error ? e : { message: String(e) } }, '[ONBOARDING] Zoho doc upload writeback failed'); }
    await uploadFileToZohoContact(user.zohoContactId);
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

        logger.info({ userId: user.id, newZohoContactId }, '[ONBOARDING] Zoho Contact created on agreement upload');

        // Upload agreement file to new Contact
        await uploadFileToZohoContact(newZohoContactId);
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
