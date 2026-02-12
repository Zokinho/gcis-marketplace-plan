import { Router, Request, Response } from 'express';
import logger from '../utils/logger';
import { Prisma } from '@prisma/client';
import { validate, approveUserSchema, adminCoaConfirmSchema, adminCoaDismissSchema, syncNowSchema } from '../utils/validation';
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
router.post('/sync-now', validate(syncNowSchema), async (req: Request, res: Response) => {
  const { type } = req.body;

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
    logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[ADMIN] Manual sync failed');
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
router.post('/coa-email-confirm', validate(adminCoaConfirmSchema), async (req: Request, res: Response) => {
  const { syncRecordId, sellerId, overrides } = req.body;

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
    logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[ADMIN] CoA email confirm failed');
    res.status(500).json({ error: 'Failed to create product', details: err?.message });
  }
});

/**
 * POST /api/admin/coa-email-dismiss
 * Dismiss/skip a CoaSyncRecord.
 */
router.post('/coa-email-dismiss', validate(adminCoaDismissSchema), async (req: Request, res: Response) => {
  const { syncRecordId } = req.body;

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

// ─── User Management ───

/**
 * GET /api/admin/users
 * List users with optional filter: pending, approved, all
 */
router.get('/users', async (req: Request, res: Response) => {
  const filter = (req.query.filter as string) || 'all';

  let where: Prisma.UserWhereInput = {};
  if (filter === 'pending') {
    where = { approved: false, docUploaded: true };
  } else if (filter === 'approved') {
    where = { approved: true };
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      companyName: true,
      contactType: true,
      zohoContactId: true,
      eulaAcceptedAt: true,
      docUploaded: true,
      approved: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Map zohoContactId to a boolean for the frontend
  const mapped = users.map((u) => ({
    ...u,
    zohoLinked: !!u.zohoContactId,
    zohoContactId: undefined,
  }));

  res.json({ users: mapped });
});

/**
 * POST /api/admin/users/:userId/approve
 * Approve a user — sets approved = true, optionally sets contactType.
 */
router.post('/users/:userId/approve', validate(approveUserSchema), async (req: Request<{ userId: string }>, res: Response) => {
  const { userId } = req.params;
  const { contactType } = req.body;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const data: Prisma.UserUpdateInput = { approved: true };
  if (contactType && !user.contactType) {
    data.contactType = contactType;
  }

  const updated = await prisma.user.update({ where: { id: userId }, data });
  logger.info({ userEmail: updated.email, approvedBy: req.user?.email }, '[ADMIN] User approved');

  res.json({ message: 'User approved', user: { id: updated.id, email: updated.email, approved: updated.approved } });
});

/**
 * POST /api/admin/users/:userId/reject
 * Reject a user — deletes the user record so they can re-register.
 */
router.post('/users/:userId/reject', async (req: Request<{ userId: string }>, res: Response) => {
  const { userId } = req.params;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  await prisma.user.delete({ where: { id: userId } });
  logger.info({ userEmail: user.email, rejectedBy: req.user?.email }, '[ADMIN] User rejected (deleted)');

  res.json({ message: 'User rejected and removed' });
});

export default router;
