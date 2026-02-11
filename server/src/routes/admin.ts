import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../index';
import { runFullSync, syncProducts, syncContacts, syncProductsDelta } from '../services/zohoSync';
import { getCoaClient } from '../services/coaClient';
import { mapCoaToProductFields } from '../utils/coaMapper';
import { detectSeller } from '../services/sellerDetection';
import { pollEmailIngestions } from '../services/coaEmailSync';

const router = Router();

/**
 * GET /api/admin/sync-status
 * Returns recent sync log entries and summary stats.
 */
router.get('/sync-status', async (_req: Request, res: Response) => {
  const recentLogs = await prisma.syncLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const lastProductSync = await prisma.syncLog.findFirst({
    where: { type: 'products', status: { in: ['success', 'partial'] } },
    orderBy: { createdAt: 'desc' },
  });

  const lastContactSync = await prisma.syncLog.findFirst({
    where: { type: 'contacts', status: { in: ['success', 'partial'] } },
    orderBy: { createdAt: 'desc' },
  });

  const productCount = await prisma.product.count({ where: { isActive: true } });
  const userCount = await prisma.user.count();

  res.json({
    summary: {
      activeProducts: productCount,
      totalUsers: userCount,
      lastProductSync: lastProductSync?.createdAt || null,
      lastContactSync: lastContactSync?.createdAt || null,
    },
    recentLogs,
  });
});

/**
 * POST /api/admin/sync-now
 * Manually trigger a full sync (products + contacts).
 * Optionally accepts { type: "products" | "contacts" } to sync only one.
 */
router.post('/sync-now', async (req: Request, res: Response) => {
  const { type } = req.body as { type?: string };

  try {
    let result;

    if (type === 'products') {
      result = { products: await syncProducts() };
    } else if (type === 'products-delta') {
      result = { products: await syncProductsDelta() };
    } else if (type === 'contacts') {
      result = { contacts: await syncContacts() };
    } else {
      result = await runFullSync();
    }

    res.json({ message: 'Sync completed', result });
  } catch (err: any) {
    console.error('[ADMIN] Manual sync failed:', err);
    res.status(500).json({ error: 'Sync failed', details: err?.message });
  }
});

// ─── CoA Email Queue ───

/**
 * GET /api/admin/coa-email-queue
 * List pending CoaSyncRecords from email ingestion.
 */
router.get('/coa-email-queue', async (_req: Request, res: Response) => {
  const records = await prisma.coaSyncRecord.findMany({
    where: {
      status: { in: ['ready', 'pending', 'processing'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // Enrich with suggested seller info
  const enriched = await Promise.all(
    records.map(async (r) => {
      let suggestedSeller = null;
      if (r.suggestedSellerId) {
        suggestedSeller = await prisma.user.findUnique({
          where: { id: r.suggestedSellerId },
          select: { id: true, email: true, companyName: true, firstName: true, lastName: true },
        });
      }
      return { ...r, suggestedSeller };
    }),
  );

  res.json({ queue: enriched });
});

/**
 * POST /api/admin/coa-email-confirm
 * Confirm seller and create a marketplace Product from a CoaSyncRecord.
 */
router.post('/coa-email-confirm', async (req: Request, res: Response) => {
  const { syncRecordId, sellerId, overrides } = req.body as {
    syncRecordId: string;
    sellerId: string;
    overrides?: Record<string, any>;
  };

  if (!syncRecordId || !sellerId) {
    return res.status(400).json({ error: 'syncRecordId and sellerId are required' });
  }

  const syncRecord = await prisma.coaSyncRecord.findUnique({
    where: { id: syncRecordId },
  });
  if (!syncRecord) {
    return res.status(404).json({ error: 'Sync record not found' });
  }
  if (syncRecord.status === 'confirmed') {
    return res.status(400).json({ error: 'Already confirmed' });
  }

  // Verify seller exists
  const seller = await prisma.user.findUnique({ where: { id: sellerId } });
  if (!seller) {
    return res.status(404).json({ error: 'Seller not found' });
  }

  try {
    // Get CoA product data
    const coaClient = getCoaClient();
    const coaProductId = syncRecord.coaProductId;
    if (!coaProductId) {
      return res.status(400).json({ error: 'CoA product not yet extracted' });
    }

    const coaProduct = await coaClient.getProductDetail(coaProductId);
    if (!coaProduct) {
      return res.status(404).json({ error: 'CoA product not found in CoA backend' });
    }

    // Map fields
    const mappedFields = mapCoaToProductFields(coaProduct);

    // Create marketplace product
    const product = await prisma.product.create({
      data: {
        ...mappedFields,
        ...overrides,
        testResults: mappedFields.testResults ?? Prisma.JsonNull,
        coaJobId: syncRecord.coaJobId,
        coaPdfUrl: coaClient.getProductPdfUrl(coaProductId),
        coaProcessedAt: new Date(),
        source: 'coa_email',
        sellerId,
        isActive: true,
        zohoProductId: `coa_email_${syncRecord.coaJobId}`,
      },
    });

    // Update sync record
    await prisma.coaSyncRecord.update({
      where: { id: syncRecordId },
      data: {
        status: 'confirmed',
        marketplaceProductId: product.id,
        confirmedSellerId: sellerId,
      },
    });

    res.json({ product });
  } catch (err: any) {
    console.error('[ADMIN] CoA email confirm failed:', err?.message);
    res.status(500).json({ error: 'Failed to create product', details: err?.message });
  }
});

/**
 * POST /api/admin/coa-email-dismiss
 * Dismiss/skip a CoaSyncRecord.
 */
router.post('/coa-email-dismiss', async (req: Request, res: Response) => {
  const { syncRecordId } = req.body as { syncRecordId: string };

  if (!syncRecordId) {
    return res.status(400).json({ error: 'syncRecordId is required' });
  }

  const updated = await prisma.coaSyncRecord.update({
    where: { id: syncRecordId },
    data: { status: 'dismissed' },
  });

  res.json({ syncRecord: updated });
});

/**
 * GET /api/admin/sellers
 * List sellers for the seller picker dropdown.
 */
router.get('/sellers', async (_req: Request, res: Response) => {
  const sellers = await prisma.user.findMany({
    where: {
      contactType: { contains: 'Seller' },
    },
    select: {
      id: true,
      email: true,
      companyName: true,
      firstName: true,
      lastName: true,
    },
    orderBy: { companyName: 'asc' },
  });

  res.json({ sellers });
});

/**
 * POST /api/admin/coa-email-poll
 * Manually trigger email ingestion polling.
 */
router.post('/coa-email-poll', async (_req: Request, res: Response) => {
  try {
    const result = await pollEmailIngestions();
    res.json({ message: 'Poll completed', ...result });
  } catch (err: any) {
    res.status(500).json({ error: 'Poll failed', details: err?.message });
  }
});

export default router;
