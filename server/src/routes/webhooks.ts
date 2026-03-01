import { Router, Request, Response } from 'express';
import logger from '../utils/logger';
import { prisma } from '../index';
import { zohoRequest } from '../services/zohoAuth';
import { BidStatus } from '@prisma/client';
import { isCoupledMode } from '../utils/marketplaceVisibility';

const router = Router();

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

    const coupledMarketplaceVisible = isCoupledMode() ? { marketplaceVisible: record.Product_Active ?? false } : {};

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
        ...coupledMarketplaceVisible,
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
        ...coupledMarketplaceVisible,
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
        contactType: Array.isArray(record.Contact_Type) ? record.Contact_Type.join('; ') : (record.Contact_Type || user.contactType),
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
