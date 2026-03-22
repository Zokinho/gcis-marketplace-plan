import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import logger from '../utils/logger';
import { Prisma } from '@prisma/client';
import { validate, validateQuery, approveUserSchema, adminCoaConfirmSchema, adminCoaDismissSchema, syncNowSchema, adminUsersQuerySchema, auditLogQuerySchema, adminBidsQuerySchema, rejectEditSchema } from '../utils/validation';
import { prisma } from '../index';
import { runFullSync, syncProducts, syncContacts, syncProductsDelta } from '../services/zohoSync';
import { getCoaClient } from '../services/coaClient';
import { mapCoaToProductFields } from '../utils/coaMapper';
import { detectSeller } from '../services/sellerDetection';
import { pollEmailIngestions } from '../services/coaEmailSync';
import { logAudit, getRequestIp } from '../services/auditService';
import { createNotification } from '../services/notificationService';
import { marketplaceVisibleWhere } from '../utils/marketplaceVisibility';
import { hashPassword } from '../utils/auth';
import { pushProductUpdate, downloadZohoFile } from '../services/zohoApi';
import { createNotificationBatch } from '../services/notificationService';
import fs from 'fs';
import path from 'path';
import { deleteFile as s3Delete, uploadFile as s3Upload, getSignedFileUrl, isS3Configured } from '../utils/s3';
import { applyRedactions, generatePageImages } from '../services/coaRedactor';

const uploadsDir = path.join(__dirname, '../../../uploads');

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

  const [zohoActiveCount, marketplaceVisibleCount, userCount] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.product.count({ where: { ...marketplaceVisibleWhere() } }),
    prisma.user.count(),
  ]);

  res.json({
    summary: {
      activeProducts: zohoActiveCount,
      marketplaceVisibleProducts: marketplaceVisibleCount,
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

    logAudit({ actorId: req.user?.id, actorEmail: req.user?.email, action: 'sync.trigger', metadata: { type: type || 'full', result }, ip: getRequestIp(req) });
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
        marketplaceVisible: true,
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

    logAudit({ actorId: req.user?.id, actorEmail: req.user?.email, action: 'coa.confirm', targetType: 'Product', targetId: product.id, metadata: { syncRecordId, sellerId }, ip: getRequestIp(req) });
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

  logAudit({ actorId: req.user?.id, actorEmail: req.user?.email, action: 'coa.dismiss', targetType: 'CoaSyncRecord', targetId: syncRecordId, ip: getRequestIp(req) });
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
router.get('/users', validateQuery(adminUsersQuerySchema), async (req: Request, res: Response) => {
  const { filter } = req.query as any;

  let where: Prisma.UserWhereInput = {};
  if (filter === 'pending') {
    where = {
      approved: false,
      OR: [
        { eulaAcceptedAt: { not: null } },
        { docUploaded: true },
        { zohoContactId: { not: null } },
      ],
    };
  } else if (filter === 'approved') {
    where = { approved: true };
  } else if (filter === 'rejected') {
    where = { approved: false, docUploaded: false };
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
      isAdmin: true,
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
  logAudit({ actorId: req.user?.id, actorEmail: req.user?.email, action: 'user.approve', targetType: 'User', targetId: userId, metadata: { userEmail: updated.email, contactType }, ip: getRequestIp(req) });

  // Create Zoho Contact if not already linked (fire-and-forget)
  if (!updated.zohoContactId) {
    (async () => {
      try {
        const { zohoRequest } = await import('../services/zohoAuth');
        const contactData: Record<string, any> = {
          First_Name: updated.firstName || '',
          Last_Name: updated.lastName || updated.email,
          Email: updated.email,
          Company: updated.companyName || '',
          Phone: updated.phone || '',
          Contact_Type: updated.contactType || 'Buyer',
          Account_Confirmed: true,
          Mailing_Country: updated.mailingCountry || '',
          Mailing_Street: (updated as any).address || '',
          Mailing_City: (updated as any).city || '',
          Mailing_Zip: (updated as any).postalCode || '',
        };
        const result = await zohoRequest('POST', '/Contacts', {
          data: { data: [contactData], trigger: [] },
        });
        const zohoContactId = result?.data?.[0]?.details?.id;
        if (zohoContactId) {
          await prisma.user.update({ where: { id: userId }, data: { zohoContactId } });
          logger.info({ userId, zohoContactId }, '[ADMIN] Zoho Contact created on approval');
        }
      } catch (err) {
        logger.error({ err: err instanceof Error ? err : { message: String(err) }, userId }, '[ADMIN] Zoho Contact creation failed');
      }
    })();
  }

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
  logAudit({ actorId: req.user?.id, actorEmail: req.user?.email, action: 'user.reject', targetType: 'User', targetId: userId, metadata: { userEmail: user.email }, ip: getRequestIp(req) });

  res.json({ message: 'User rejected and removed' });
});

/**
 * POST /api/admin/users/:userId/promote
 * Promote a user to admin.
 */
router.post('/users/:userId/promote', async (req: Request<{ userId: string }>, res: Response) => {
  const { userId } = req.params;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (user.isAdmin) {
    return res.status(400).json({ error: 'User is already an admin' });
  }

  await prisma.user.update({ where: { id: userId }, data: { isAdmin: true } });
  logger.info({ userId, userEmail: user.email, promotedBy: req.user?.email }, '[ADMIN] User promoted to admin');
  logAudit({ actorId: req.user?.id, actorEmail: req.user?.email, action: 'user.promote', targetType: 'User', targetId: userId, metadata: { userEmail: user.email }, ip: getRequestIp(req) });

  res.json({ message: 'User promoted to admin' });
});

/**
 * POST /api/admin/users/:userId/demote
 * Remove admin role from a user.
 */
router.post('/users/:userId/demote', async (req: Request<{ userId: string }>, res: Response) => {
  const { userId } = req.params;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (!user.isAdmin) {
    return res.status(400).json({ error: 'User is not an admin' });
  }
  // Prevent self-demotion
  if (userId === req.user?.id) {
    return res.status(400).json({ error: 'Cannot remove your own admin role' });
  }

  await prisma.user.update({ where: { id: userId }, data: { isAdmin: false } });
  logger.info({ userId, userEmail: user.email, demotedBy: req.user?.email }, '[ADMIN] User demoted from admin');
  logAudit({ actorId: req.user?.id, actorEmail: req.user?.email, action: 'user.demote', targetType: 'User', targetId: userId, metadata: { userEmail: user.email }, ip: getRequestIp(req) });

  res.json({ message: 'Admin role removed' });
});

/**
 * POST /api/admin/users/:userId/reset-password
 * Admin-initiated password reset — generates a random password or uses an admin-specified one.
 * Clears refresh tokens to force re-login.
 */
router.post('/users/:userId/reset-password', async (req: Request<{ userId: string }>, res: Response) => {
  const { userId } = req.params;
  const { password } = req.body || {};

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const tempPassword = password || crypto.randomBytes(9).toString('base64url');
  const hashed = await hashPassword(tempPassword);

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: hashed,
      mustChangePassword: true,
      refreshToken: null,
      refreshTokenExpiresAt: null,
    },
  });

  logger.info({ userId, userEmail: user.email, resetBy: req.user?.email }, '[ADMIN] Password reset');
  logAudit({ actorId: req.user?.id, actorEmail: req.user?.email, action: 'user.password_reset', targetType: 'User', targetId: userId, metadata: { userEmail: user.email }, ip: getRequestIp(req) });

  res.json({ message: 'Password reset successfully', temporaryPassword: tempPassword });
});

// ─── Pending Product Approval ───

/**
 * GET /api/admin/pending-products
 * List products with requestPending = true OR editPending = true, for admin approval.
 */
router.get('/pending-products', async (_req: Request, res: Response) => {
  const products = await prisma.product.findMany({
    where: { OR: [{ requestPending: true }, { editPending: true }] },
    include: {
      seller: { select: { id: true, email: true, companyName: true, firstName: true, lastName: true } },
      _count: { select: { redactionRegions: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const mapped = products.map((p) => ({
    ...p,
    redactionRegionCount: (p as any)._count?.redactionRegions ?? 0,
    _count: undefined,
  }));

  res.json({ products: mapped });
});

/**
 * POST /api/admin/products/:productId/approve
 * Approve a pending product — sets requestPending=false, isActive=true, marketplaceVisible=true.
 * No Zoho writeback — marketplace-only approval.
 */
router.post('/products/:productId/approve', async (req: Request<{ productId: string }>, res: Response) => {
  const { productId } = req.params;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  if (!product.requestPending) {
    return res.status(400).json({ error: 'Product is not pending approval' });
  }

  // Apply CoA redactions if original CoA exists
  if (product.coaOriginalKey) {
    try {
      const regions = await prisma.redactionRegion.findMany({
        where: { productId, approved: true },
        select: { page: true, xPct: true, yPct: true, wPct: true, hPct: true, approved: true },
      });

      // Read original PDF from S3 or local disk
      let pdfBuffer: Buffer;
      if (isS3Configured()) {
        const { default: axios } = await import('axios');
        const originalUrl = await getSignedFileUrl(product.coaOriginalKey!);
        if (!originalUrl) throw new Error('Failed to generate presigned URL for original CoA');
        const pdfResponse = await axios.get(originalUrl, { responseType: 'arraybuffer', timeout: 120_000 });
        pdfBuffer = Buffer.from(pdfResponse.data);
      } else {
        const localPath = path.join(uploadsDir, product.coaOriginalKey!);
        if (!fs.existsSync(localPath)) throw new Error(`Original CoA not found at ${localPath}`);
        pdfBuffer = fs.readFileSync(localPath);
      }

      let redactedBuffer: Buffer;
      if (regions.length === 0) {
        redactedBuffer = pdfBuffer;
      } else {
        redactedBuffer = await applyRedactions(pdfBuffer, regions);
      }

      const redactedKey = product.coaOriginalKey!.replace('_original.pdf', '.pdf');
      if (isS3Configured()) {
        await s3Upload(redactedKey, redactedBuffer, 'application/pdf');
      } else {
        const localDir = path.dirname(path.join(uploadsDir, redactedKey));
        fs.mkdirSync(localDir, { recursive: true });
        fs.writeFileSync(path.join(uploadsDir, redactedKey), redactedBuffer);
      }

      await prisma.product.update({
        where: { id: productId },
        data: { coaRedactedKey: redactedKey },
      });

      logAudit({
        actorId: req.user?.id, actorEmail: req.user?.email,
        action: 'redaction.apply', targetType: 'Product', targetId: productId,
        metadata: { regionsApplied: regions.length }, ip: getRequestIp(req),
      });
    } catch (err) {
      // Don't block approval if redaction fails — use original as fallback
      logger.error({ err: err instanceof Error ? err : { message: String(err) }, productId }, '[ADMIN] Redaction failed on approval — using original CoA');
    }
  }

  const updated = await prisma.product.update({
    where: { id: productId },
    data: { requestPending: false, isActive: true, marketplaceVisible: true },
  });

  logger.info({ productId, productName: updated.name, approvedBy: req.user?.email }, '[ADMIN] Product approved');
  logAudit({ actorId: req.user?.id, actorEmail: req.user?.email, action: 'product.approve', targetType: 'Product', targetId: productId, metadata: { productName: updated.name }, ip: getRequestIp(req) });

  if (updated.sellerId) {
    createNotification({
      userId: updated.sellerId,
      type: 'PRODUCT_APPROVED',
      title: 'Product Approved',
      body: `Your product "${updated.name}" has been approved and is now live on the marketplace.`,
      data: { productId: updated.id },
    });
  }

  res.json({ message: 'Product approved', product: { id: updated.id, name: updated.name, requestPending: updated.requestPending, marketplaceVisible: updated.marketplaceVisible } });
});

/**
 * POST /api/admin/products/:productId/reject
 * Reject a pending product — deletes it.
 */
router.post('/products/:productId/reject', async (req: Request<{ productId: string }>, res: Response) => {
  const { productId } = req.params;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  if (!product.requestPending) {
    return res.status(400).json({ error: 'Product is not pending approval' });
  }

  await prisma.product.delete({ where: { id: productId } });

  logger.info({ productId, productName: product.name, rejectedBy: req.user?.email }, '[ADMIN] Product rejected (deleted)');
  logAudit({ actorId: req.user?.id, actorEmail: req.user?.email, action: 'product.reject', targetType: 'Product', targetId: productId, metadata: { productName: product.name }, ip: getRequestIp(req) });

  res.json({ message: 'Product rejected and removed' });
});

/**
 * POST /api/admin/products/:productId/approve-edit
 * Approve pending edits — merges pendingEdits into live product, pushes to Zoho.
 */
router.post('/products/:productId/approve-edit', async (req: Request<{ productId: string }>, res: Response) => {
  const { productId } = req.params;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  if (!product.editPending) {
    return res.status(400).json({ error: 'No pending edit to approve' });
  }

  const pending = (product.pendingEdits as Record<string, any>) || {};
  const { newImageUrls, imageUrls: reorderedImageUrls, ...fieldChanges } = pending;

  try {
    // Build the update object
    const updateData: Record<string, any> = {};

    // Apply field changes
    for (const [key, value] of Object.entries(fieldChanges)) {
      if (key === 'harvestDate') {
        updateData.harvestDate = value ? new Date(value as string) : null;
      } else {
        updateData[key] = value;
      }
    }

    // Handle image changes
    let finalImageUrls = product.imageUrls as string[];
    if (reorderedImageUrls) {
      finalImageUrls = reorderedImageUrls as string[];
    }
    if (newImageUrls && (newImageUrls as string[]).length > 0) {
      finalImageUrls = [...finalImageUrls, ...(newImageUrls as string[])];
    }
    if (reorderedImageUrls || (newImageUrls && (newImageUrls as string[]).length > 0)) {
      updateData.imageUrls = finalImageUrls;
    }

    // Clear pending state
    updateData.editPending = false;
    updateData.pendingEdits = Prisma.JsonNull;

    const updated = await prisma.product.update({
      where: { id: productId },
      data: updateData,
    });

    // Push field changes to Zoho — fire-and-forget
    const zohoFields: Record<string, any> = {};
    for (const [key, value] of Object.entries(fieldChanges)) {
      if (key !== 'harvestDate') {
        zohoFields[key] = value;
      }
    }
    if (Object.keys(zohoFields).length > 0) {
      pushProductUpdate(productId, zohoFields).catch((err) => {
        logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[ADMIN] Zoho push after edit approval failed (non-critical)');
      });
    }

    // SHORTLIST_PRICE_DROP — notify shortlisters if price decreased
    if (fieldChanges.pricePerUnit !== undefined && product.pricePerUnit != null && fieldChanges.pricePerUnit < product.pricePerUnit) {
      try {
        const shortlisters = await prisma.shortlistItem.findMany({
          where: { productId },
          select: { buyerId: true },
        });
        if (shortlisters.length > 0) {
          createNotificationBatch(
            shortlisters.map((s) => ({
              userId: s.buyerId,
              type: 'SHORTLIST_PRICE_DROP' as const,
              title: 'Price drop on shortlisted product',
              body: `${product.name} price dropped to $${Number(fieldChanges.pricePerUnit).toFixed(2)}/g`,
              data: { productId },
            })),
          );
        }
      } catch (e) {
        logger.error({ err: e }, '[ADMIN] SHORTLIST_PRICE_DROP notification error after edit approval');
      }
    }

    // Notify seller
    createNotification({
      userId: product.sellerId,
      type: 'EDIT_APPROVED',
      title: 'Edit Approved',
      body: `Your changes to "${product.name}" have been approved and are now live.`,
      data: { productId },
    });

    logger.info({ productId, productName: product.name, approvedBy: req.user?.email }, '[ADMIN] Edit approved');
    logAudit({ actorId: req.user?.id, actorEmail: req.user?.email, action: 'product.approve-edit', targetType: 'Product', targetId: productId, metadata: { productName: product.name, changes: Object.keys(pending) }, ip: getRequestIp(req) });

    res.json({ message: 'Edit approved', product: { id: updated.id, name: updated.name, editPending: updated.editPending } });
  } catch (err: any) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[ADMIN] Edit approval failed');
    res.status(500).json({ error: 'Failed to approve edit' });
  }
});

/**
 * POST /api/admin/products/:productId/reject-edit
 * Reject pending edits — clears pendingEdits, cleans up S3 for uploaded images.
 */
router.post('/products/:productId/reject-edit', validate(rejectEditSchema), async (req: Request<{ productId: string }>, res: Response) => {
  const { productId } = req.params;
  const { reason } = req.body;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  if (!product.editPending) {
    return res.status(400).json({ error: 'No pending edit to reject' });
  }

  const pending = (product.pendingEdits as Record<string, any>) || {};

  try {
    // Clean up S3 files from pendingEdits.newImageUrls
    const newImageUrls = (pending.newImageUrls as string[]) || [];
    for (const url of newImageUrls) {
      // Only delete S3 keys (not legacy /uploads/ paths)
      if (url.startsWith('products/')) {
        s3Delete(url).catch((err) => {
          logger.error({ err: err instanceof Error ? err : { message: String(err) }, key: url }, '[ADMIN] S3 cleanup failed on edit rejection');
        });
      }
    }

    // Clear pending state
    await prisma.product.update({
      where: { id: productId },
      data: {
        editPending: false,
        pendingEdits: Prisma.JsonNull,
      },
    });

    // Notify seller
    const reasonSuffix = reason ? ` Reason: ${reason}` : '';
    createNotification({
      userId: product.sellerId,
      type: 'EDIT_REJECTED',
      title: 'Edit Rejected',
      body: `Your proposed changes to "${product.name}" were not approved.${reasonSuffix}`,
      data: { productId, reason: reason || null },
    });

    logger.info({ productId, productName: product.name, rejectedBy: req.user?.email, reason }, '[ADMIN] Edit rejected');
    logAudit({ actorId: req.user?.id, actorEmail: req.user?.email, action: 'product.reject-edit', targetType: 'Product', targetId: productId, metadata: { productName: product.name, reason }, ip: getRequestIp(req) });

    res.json({ message: 'Edit rejected' });
  } catch (err: any) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[ADMIN] Edit rejection failed');
    res.status(500).json({ error: 'Failed to reject edit' });
  }
});

// ─── All Bids (admin view) ───

/**
 * GET /api/admin/bids
 * All bids across the platform — paginated, filterable by status/seller/buyer/product.
 */
router.get('/bids', validateQuery(adminBidsQuerySchema), async (req: Request, res: Response) => {
  const { page, limit, status, sellerId, buyerId, productId } = req.query as any;

  const where: Prisma.BidWhereInput = {};
  if (status) where.status = status;
  if (buyerId) where.buyerId = buyerId;
  if (productId) where.productId = productId;
  if (sellerId) where.product = { sellerId };

  try {
    const [bids, total] = await Promise.all([
      prisma.bid.findMany({
        where,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              category: true,
              type: true,
              pricePerUnit: true,
              imageUrls: true,
              seller: { select: { id: true, email: true, companyName: true, firstName: true, lastName: true } },
            },
          },
          buyer: { select: { id: true, email: true, companyName: true, firstName: true, lastName: true } },
          transaction: { select: { id: true, status: true, outcomeRecordedAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.bid.count({ where }),
    ]);

    res.json({
      bids,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[ADMIN] Failed to fetch bids');
    res.status(500).json({ error: 'Failed to fetch bids' });
  }
});

// ─── Audit Log ───

/**
 * GET /api/admin/audit-log
 * Paginated, filterable audit log.
 */
router.get('/audit-log', validateQuery(auditLogQuerySchema), async (req: Request, res: Response) => {
  const { page, limit, action, actorId, targetType, from, to } = req.query as any;

  const where: Prisma.AuditLogWhereInput = {};
  if (action) where.action = action;
  if (actorId) where.actorId = actorId;
  if (targetType) where.targetType = targetType;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  try {
    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          actor: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      entries,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error({ err }, '[ADMIN] Audit log query failed');
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

/**
 * POST /api/admin/products/:productId/regenerate-coa-pages
 * Re-fetches the CoA PDF from Zoho and regenerates page images into S3.
 * Used to recover page images that were lost (e.g. stored on local disk pre-S3).
 */
router.post('/products/:productId/regenerate-coa-pages', async (req: Request<{ productId: string }>, res: Response) => {
  const { productId } = req.params;

  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, zohoProductId: true, coaUrls: true, coaOriginalKey: true, coaPageCount: true },
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Find CoA URL from Zoho (stored as /api/zoho-files/{zohoProductId}/{fileId})
    const coaUrls = (product.coaUrls as string[]) || [];
    if (coaUrls.length === 0 || !product.zohoProductId) {
      return res.status(400).json({ error: 'No CoA file found on Zoho for this product' });
    }

    // Parse the first CoA URL to get the Zoho file ID
    const coaUrl = coaUrls[0];
    const segments = coaUrl.replace('/api/zoho-files/', '').split('/');
    if (segments.length < 2) {
      return res.status(400).json({ error: 'Invalid CoA URL format' });
    }
    const [zohoProductId, fileId] = segments;

    // Download PDF from Zoho
    const { data: pdfBuffer } = await downloadZohoFile(zohoProductId, fileId);

    // Upload original PDF to S3
    const originalKey = `products/${productId}/coa/${crypto.randomUUID()}_original.pdf`;
    if (isS3Configured()) {
      await s3Upload(originalKey, pdfBuffer, 'application/pdf');
    } else {
      const localDir = path.join(uploadsDir, `products/${productId}/coa`);
      fs.mkdirSync(localDir, { recursive: true });
      fs.writeFileSync(path.join(uploadsDir, originalKey), pdfBuffer);
    }

    // Generate page images
    const { images, pageCount } = await generatePageImages(pdfBuffer);
    for (let i = 0; i < images.length; i++) {
      const pageKey = `products/${productId}/coa/pages/page_${i}.png`;
      if (isS3Configured()) {
        await s3Upload(pageKey, images[i], 'image/png');
      } else {
        const pagesDir = path.join(uploadsDir, `products/${productId}/coa/pages`);
        fs.mkdirSync(pagesDir, { recursive: true });
        fs.writeFileSync(path.join(uploadsDir, pageKey), images[i]);
      }
    }

    // Update product
    await prisma.product.update({
      where: { id: productId },
      data: { coaOriginalKey: originalKey, coaPageCount: pageCount },
    });

    logAudit({
      actorId: req.user?.id, actorEmail: req.user?.email,
      action: 'coa.regenerate', targetType: 'Product', targetId: productId,
      metadata: { pageCount, originalKey }, ip: getRequestIp(req),
    });

    logger.info({ productId, pageCount }, '[ADMIN] CoA page images regenerated from Zoho');
    res.json({ message: 'CoA page images regenerated', pageCount, originalKey });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) }, productId }, '[ADMIN] CoA page regeneration failed');
    res.status(500).json({ error: 'Failed to regenerate CoA pages' });
  }
});

export default router;
