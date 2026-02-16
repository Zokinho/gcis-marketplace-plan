import { Router, Request, Response } from 'express';
import { Webhook } from 'svix';
import logger from '../utils/logger';
import { prisma } from '../index';
import { zohoRequest } from '../services/zohoAuth';
import { BidStatus } from '@prisma/client';

const router = Router();

interface ClerkWebhookEvent {
  type: string;
  data: {
    id: string;
    email_addresses: Array<{ email_address: string }>;
    first_name: string | null;
    last_name: string | null;
  };
}

/**
 * POST /api/webhooks/clerk
 * Handles Clerk user.created events.
 * Must receive raw body for Svix signature verification.
 */
router.post('/clerk', async (req: Request, res: Response) => {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.error('[WEBHOOK] CLERK_WEBHOOK_SECRET is not configured — rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  {
    const svixId = req.headers['svix-id'] as string;
    const svixTimestamp = req.headers['svix-timestamp'] as string;
    const svixSignature = req.headers['svix-signature'] as string;

    if (!svixId || !svixTimestamp || !svixSignature) {
      return res.status(400).json({ error: 'Missing Svix headers' });
    }

    try {
      const wh = new Webhook(webhookSecret);
      wh.verify(JSON.stringify(req.body), {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch (err) {
      logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[WEBHOOK] Signature verification failed');
      return res.status(400).json({ error: 'Invalid signature' });
    }
  }

  const event = req.body as ClerkWebhookEvent;

  if (event.type === 'user.created') {
    try {
      await handleUserCreated(event.data);
    } catch (err) {
      logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[WEBHOOK] Error handling user.created');
      return res.status(500).json({ error: 'Internal error processing webhook' });
    }
  }

  res.status(200).json({ received: true });
});

async function handleUserCreated(data: ClerkWebhookEvent['data']) {
  const email = data.email_addresses[0]?.email_address;
  if (!email) {
    logger.error('[WEBHOOK] No email found in user.created event');
    return;
  }

  // Check if user already exists (idempotency)
  const existing = await prisma.user.findUnique({
    where: { clerkUserId: data.id },
  });
  if (existing) {
    logger.info({ clerkId: data.id }, '[WEBHOOK] User already exists, skipping');
    return;
  }

  // Look up in Zoho CRM by email
  let zohoContact: any = null;
  try {
    const searchResult = await zohoRequest('GET', '/Contacts/search', { params: { email } });
    zohoContact = searchResult?.data?.[0] || null;
  } catch (err: any) {
    // 204 = no results found, which is fine
    if (err?.response?.status !== 204) {
      logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[WEBHOOK] Zoho search error');
    }
  }

  if (!zohoContact) {
    // Email not found in Zoho — open registration, no Zoho link
    await prisma.user.create({
      data: {
        clerkUserId: data.id,
        email,
        firstName: data.first_name,
        lastName: data.last_name,
        approved: false,
      },
    });
    logger.info({ email }, '[WEBHOOK] New user created — no Zoho match');
    return;
  }

  if (zohoContact.Account_Confirmed) {
    // Known contact, confirmed — create linked user (still requires admin approval)
    const contactType = zohoContact.Contact_Type || 'Buyer';

    await prisma.user.create({
      data: {
        clerkUserId: data.id,
        zohoContactId: zohoContact.id,
        email,
        firstName: zohoContact.First_Name,
        lastName: zohoContact.Last_Name,
        companyName: zohoContact.Company,
        contactType,
        approved: false,
      },
    });

    // Store Clerk user ID in Zoho's User_UID field
    try {
      await zohoRequest('PUT', `/Contacts/${zohoContact.id}`, {
        data: { data: [{ User_UID: data.id }], trigger: [] },
      });
    } catch (err) {
      logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[WEBHOOK] Failed to update Zoho User_UID');
    }

    logger.info({ email, contactType }, '[WEBHOOK] User created — awaiting admin approval');
  } else {
    // Contact exists but Account_Confirmed is false
    await prisma.user.create({
      data: {
        clerkUserId: data.id,
        zohoContactId: zohoContact.id,
        email,
        firstName: zohoContact.First_Name,
        lastName: zohoContact.Last_Name,
        companyName: zohoContact.Company,
        approved: false,
      },
    });

    // Create Zoho Task to notify GCIS team
    try {
      await zohoRequest('POST', '/Tasks', {
        data: { data: [{
          Subject: `Marketplace Signup — ${zohoContact.First_Name} ${zohoContact.Last_Name} (${zohoContact.Company || 'No company'})`,
          Status: 'Not Started',
          Priority: 'Normal',
          Who_Id: zohoContact.id,
          Description: `This contact just created a marketplace account.\n\nEmail: ${email}\nAccount_Confirmed is currently FALSE.\n\nTo grant access: set Account_Confirmed = true in their Contact record.`,
        }], trigger: [] },
      });
    } catch (err) {
      logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[WEBHOOK] Failed to create Zoho notification task');
    }

    logger.info({ email }, '[WEBHOOK] Pending user created — awaiting approval');
  }
}

/**
 * POST /api/webhooks/zoho
 * Handles Zoho CRM workflow notifications for Products, Contacts, and Tasks.
 */
router.post('/zoho', async (req: Request, res: Response) => {
  // Verify shared secret — reject unauthenticated requests
  const webhookSecret = process.env.ZOHO_WEBHOOK_SECRET;
  if (webhookSecret) {
    const headerSecret = req.headers['x-zoho-webhook-secret'] as string | undefined;
    if (headerSecret !== webhookSecret) {
      logger.warn('[ZOHO WEBHOOK] Invalid or missing webhook secret');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } else {
    logger.warn('[ZOHO WEBHOOK] ZOHO_WEBHOOK_SECRET not configured — webhook is unprotected');
  }

  const { module, record_id, action } = req.body;

  if (!module || !record_id) {
    return res.status(400).json({ error: 'module and record_id are required' });
  }

  logger.info({ module, action, record_id }, '[ZOHO WEBHOOK] Incoming webhook');

  try {
    switch (module) {
      case 'Products':
        await syncSingleProduct(record_id);
        break;
      case 'Contacts':
        await syncSingleContact(record_id);
        break;
      case 'Tasks':
        await updateBidStatus(record_id);
        break;
      default:
        logger.info({ module }, '[ZOHO WEBHOOK] Unknown module');
    }
    res.status(200).send('OK');
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) }, module, record_id }, '[ZOHO WEBHOOK] Error processing webhook');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Sync a single product from Zoho when it's updated.
 */
async function syncSingleProduct(zohoProductId: string) {
  try {
    const response = await zohoRequest('GET', `/Products/${zohoProductId}`);
    const record = response?.data?.[0];
    if (!record) return;

    // Find seller by Zoho Contact_Name id
    const contactId = record.Contact_Name?.id;
    let sellerId: string | null = null;
    if (contactId) {
      const seller = await prisma.user.findUnique({ where: { zohoContactId: contactId } });
      sellerId = seller?.id || null;
    }

    if (!sellerId) {
      logger.info({ zohoProductId }, '[ZOHO WEBHOOK] No seller found for product, skipping');
      return;
    }

    await prisma.product.upsert({
      where: { zohoProductId },
      create: {
        zohoProductId,
        sellerId,
        name: record.Product_Name || 'Unnamed',
        productCode: record.Product_Code || null,
        description: record.Description || null,
        category: record.Product_Category || null,
        type: record.Type || null,
        isActive: record.Product_Active ?? false,
        requestPending: record.Request_pending ?? false,
        pricePerUnit: record.Unit_Price ?? null,
        minQtyRequest: record.Min_QTY_Request ?? null,
        gramsAvailable: record.Grams_Available ?? null,
        upcomingQty: record.Upcoming_QTY ?? null,
        thcMin: record.THC_min ?? null,
        thcMax: record.THC_max ?? null,
        cbdMin: record.CBD_min ?? null,
        cbdMax: record.CBD_max ?? null,
        certification: record.Certification || null,
        licensedProducer: record.Licensed_Producer || null,
        growthMedium: record.Growth_Medium || null,
        lineage: record.Lineage || null,
        dominantTerpene: record.Terpen || null,
        highestTerpenes: record.Highest_Terpenes || null,
        aromas: record.Aromas || null,
        budSizePopcorn: record.X0_1_cm_Popcorn ?? null,
        budSizeSmall: record.X1_2_cm_Small ?? null,
        budSizeMedium: record.X2_3_cm_Medium ?? null,
        budSizeLarge: record.X3_5_cm_Large ?? null,
        budSizeXLarge: record.X5_cm_X_Large ?? null,
        harvestDate: record.Harvest_Date ? new Date(record.Harvest_Date) : null,
        lastSyncedAt: new Date(),
      },
      update: {
        name: record.Product_Name || 'Unnamed',
        productCode: record.Product_Code || null,
        description: record.Description || null,
        category: record.Product_Category || null,
        type: record.Type || null,
        isActive: record.Product_Active ?? false,
        requestPending: record.Request_pending ?? false,
        pricePerUnit: record.Unit_Price ?? null,
        minQtyRequest: record.Min_QTY_Request ?? null,
        gramsAvailable: record.Grams_Available ?? null,
        upcomingQty: record.Upcoming_QTY ?? null,
        thcMin: record.THC_min ?? null,
        thcMax: record.THC_max ?? null,
        cbdMin: record.CBD_min ?? null,
        cbdMax: record.CBD_max ?? null,
        certification: record.Certification || null,
        licensedProducer: record.Licensed_Producer || null,
        growthMedium: record.Growth_Medium || null,
        lineage: record.Lineage || null,
        dominantTerpene: record.Terpen || null,
        highestTerpenes: record.Highest_Terpenes || null,
        aromas: record.Aromas || null,
        budSizePopcorn: record.X0_1_cm_Popcorn ?? null,
        budSizeSmall: record.X1_2_cm_Small ?? null,
        budSizeMedium: record.X2_3_cm_Medium ?? null,
        budSizeLarge: record.X3_5_cm_Large ?? null,
        budSizeXLarge: record.X5_cm_X_Large ?? null,
        harvestDate: record.Harvest_Date ? new Date(record.Harvest_Date) : null,
        lastSyncedAt: new Date(),
      },
    });

    logger.info({ productName: record.Product_Name }, '[ZOHO WEBHOOK] Product synced');
  } catch (err: any) {
    if (err?.response?.status === 204) return;
    throw err;
  }
}

/**
 * Sync a single contact from Zoho when their status changes.
 */
async function syncSingleContact(zohoContactId: string) {
  try {
    const response = await zohoRequest('GET', `/Contacts/${zohoContactId}`);
    const record = response?.data?.[0];
    if (!record) return;

    const user = await prisma.user.findUnique({ where: { zohoContactId } });
    if (!user) {
      logger.info({ zohoContactId }, '[ZOHO WEBHOOK] No local user for contact');
      return;
    }

    await prisma.user.update({
      where: { zohoContactId },
      data: {
        firstName: record.First_Name || user.firstName,
        lastName: record.Last_Name || user.lastName,
        companyName: record.Company || user.companyName,
        contactType: record.Contact_Type || user.contactType,
        approved: record.Account_Confirmed ?? user.approved,
        mailingCountry: record.Mailing_Country || user.mailingCountry,
        phone: record.Phone || user.phone,
        lastSyncedAt: new Date(),
      },
    });

    logger.info({ contactName: `${record.First_Name} ${record.Last_Name}` }, '[ZOHO WEBHOOK] Contact synced');
  } catch (err: any) {
    if (err?.response?.status === 204) return;
    throw err;
  }
}

/**
 * Update local bid status when a Zoho Task status changes.
 * Maps Zoho Task statuses to BidStatus enum.
 */
async function updateBidStatus(zohoTaskId: string) {
  try {
    const response = await zohoRequest('GET', `/Tasks/${zohoTaskId}`);
    const task = response?.data?.[0];
    if (!task) return;

    // Find the bid linked to this Zoho Task
    const bid = await prisma.bid.findUnique({ where: { zohoTaskId } });
    if (!bid) {
      logger.info({ zohoTaskId }, '[ZOHO WEBHOOK] No bid found for Zoho Task');
      return;
    }

    // Map Zoho Task/Bid status to local BidStatus
    const zohoStatus = (task.Bid_Status || task.Status || '').toLowerCase();
    let newStatus: BidStatus;

    switch (zohoStatus) {
      case 'pending':
      case 'not started':
        newStatus = 'PENDING';
        break;
      case 'under review':
      case 'in progress':
        newStatus = 'UNDER_REVIEW';
        break;
      case 'accepted':
      case 'completed':
        newStatus = 'ACCEPTED';
        break;
      case 'rejected':
      case 'deferred':
        newStatus = 'REJECTED';
        break;
      case 'countered':
        newStatus = 'COUNTERED';
        break;
      case 'expired':
        newStatus = 'EXPIRED';
        break;
      default:
        logger.info({ zohoStatus }, '[ZOHO WEBHOOK] Unknown task status');
        return;
    }

    if (bid.status !== newStatus) {
      await prisma.bid.update({
        where: { id: bid.id },
        data: { status: newStatus },
      });
      logger.info({ bidId: bid.id, oldStatus: bid.status, newStatus }, '[ZOHO WEBHOOK] Bid status updated');
    }
  } catch (err: any) {
    if (err?.response?.status === 204) return;
    throw err;
  }
}

export default router;
