import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import logger from '../utils/logger';
import { validate, updateListingSchema, createSellerShareSchema, createListingSchema } from '../utils/validation';
import { prisma } from '../index';
import { pushProductUpdate, createZohoProduct, createProductReviewTask, uploadProductFiles } from '../services/zohoApi';
import { zohoRequest } from '../services/zohoAuth';
import { createNotificationBatch } from '../services/notificationService';
import { writeLimiter } from '../utils/rateLimiters';
import { isS3Configured, uploadFile as s3Upload } from '../utils/s3';

const router = Router();

// ─── Multer config for file uploads ───
// Use memory storage: buffers are uploaded to S3 (or saved to disk as fallback)
const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const allowedImages = ['image/jpeg', 'image/png', 'image/webp'];
  const allowedPdf = ['application/pdf'];
  if (file.fieldname === 'coaFiles') {
    cb(null, allowedPdf.includes(file.mimetype));
  } else {
    cb(null, allowedImages.includes(file.mimetype));
  }
};

const upload = multer({ storage: multer.memoryStorage(), fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// Local uploads directory — fallback when S3 is not configured
const uploadsDir = path.join(__dirname, '../../../uploads');

/**
 * POST /api/my-listings
 * Create a new product listing manually (with file uploads).
 */
router.post(
  '/',
  writeLimiter,
  upload.fields([
    { name: 'coverPhoto', maxCount: 1 },
    { name: 'images', maxCount: 10 },
    { name: 'coaFiles', maxCount: 10 },
  ]),
  async (req: Request, res: Response) => {
    const sellerId = req.user!.id;
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;

    // Validate form body (runs after multer has parsed the multipart form)
    const parsed = createListingSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const {
      name, description, category, type,
      licensedProducer, lineage, growthMedium, harvestDate, certification,
      thc, cbd, dominantTerpene, totalTerpenePercent,
      gramsAvailable, upcomingQty, minQtyRequest, pricePerUnit,
      budSizePopcorn, budSizeSmall, budSizeMedium, budSizeLarge, budSizeXLarge,
    } = parsed.data as Record<string, string>;

    // Collect all uploaded file buffers for processing after product creation
    const imageFiles: Express.Multer.File[] = [];
    if (files?.coverPhoto?.[0]) imageFiles.push(files.coverPhoto[0]);
    if (files?.images) imageFiles.push(...files.images);

    const coaFileList: Express.Multer.File[] = [];
    if (files?.coaFiles) coaFileList.push(...files.coaFiles);

    // Placeholder URLs — will be replaced with S3 keys or local paths after product creation
    const imageUrls: string[] = [];
    const coaUrls: string[] = [];

    const parseFloat_ = (v: string | undefined) => v ? parseFloat(v) : undefined;
    const thcVal = parseFloat_(thc);
    const cbdVal = parseFloat_(cbd);

    try {
      // Look up seller's Zoho Contact ID
      const seller = await prisma.user.findUnique({
        where: { id: sellerId },
        select: { zohoContactId: true, companyName: true },
      });

      if (!seller?.zohoContactId) {
        return res.status(400).json({ error: 'Your account is not linked to Zoho CRM. Please contact support.' });
      }

      const productFields = {
        name: name.trim(),
        description: description?.trim() || null,
        category: category || null,
        type: type || null,
        licensedProducer: licensedProducer?.trim() || null,
        lineage: lineage?.trim() || null,
        growthMedium: growthMedium?.trim() || null,
        harvestDate: harvestDate ? new Date(harvestDate) : null,
        certification: certification || null,
        thcMin: thcVal != null && !isNaN(thcVal) ? thcVal : null,
        thcMax: thcVal != null && !isNaN(thcVal) ? thcVal : null,
        cbdMin: cbdVal != null && !isNaN(cbdVal) ? cbdVal : null,
        cbdMax: cbdVal != null && !isNaN(cbdVal) ? cbdVal : null,
        dominantTerpene: dominantTerpene?.trim() || null,
        gramsAvailable: parseFloat_(gramsAvailable) ?? null,
        upcomingQty: parseFloat_(upcomingQty) ?? null,
        minQtyRequest: parseFloat_(minQtyRequest) ?? null,
        pricePerUnit: parseFloat_(pricePerUnit) ?? null,
        budSizePopcorn: parseFloat_(budSizePopcorn) ?? null,
        budSizeSmall: parseFloat_(budSizeSmall) ?? null,
        budSizeMedium: parseFloat_(budSizeMedium) ?? null,
        budSizeLarge: parseFloat_(budSizeLarge) ?? null,
        budSizeXLarge: parseFloat_(budSizeXLarge) ?? null,
        sellerZohoContactId: seller.zohoContactId,
      };

      // Create product in Zoho first — this is the approval gatekeeper
      const zohoProductId = await createZohoProduct(productFields);

      // Create local product with pending state
      const product = await prisma.product.create({
        data: {
          zohoProductId,
          name: name.trim(),
          description: description?.trim() || null,
          category: category || null,
          type: type || null,
          licensedProducer: licensedProducer?.trim() || null,
          lineage: lineage?.trim() || null,
          growthMedium: growthMedium?.trim() || null,
          harvestDate: harvestDate ? new Date(harvestDate) : null,
          certification: certification || null,
          thcMin: thcVal != null && !isNaN(thcVal) ? thcVal : null,
          thcMax: thcVal != null && !isNaN(thcVal) ? thcVal : null,
          cbdMin: cbdVal != null && !isNaN(cbdVal) ? cbdVal : null,
          cbdMax: cbdVal != null && !isNaN(cbdVal) ? cbdVal : null,
          dominantTerpene: dominantTerpene?.trim() || null,
          totalTerpenePercent: parseFloat_(totalTerpenePercent) ?? null,
          gramsAvailable: parseFloat_(gramsAvailable) ?? null,
          upcomingQty: parseFloat_(upcomingQty) ?? null,
          minQtyRequest: parseFloat_(minQtyRequest) ?? null,
          pricePerUnit: parseFloat_(pricePerUnit) ?? null,
          budSizePopcorn: parseFloat_(budSizePopcorn) ?? null,
          budSizeSmall: parseFloat_(budSizeSmall) ?? null,
          budSizeMedium: parseFloat_(budSizeMedium) ?? null,
          budSizeLarge: parseFloat_(budSizeLarge) ?? null,
          budSizeXLarge: parseFloat_(budSizeXLarge) ?? null,
          imageUrls,
          coaUrls,
          source: 'manual',
          isActive: false,
          requestPending: true,
          sellerId,
        },
      });

      // Upload files to S3 (or local fallback) and update product with URLs
      if (imageFiles.length > 0 || coaFileList.length > 0) {
        try {
          const ext = (mimetype: string) => {
            const map: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
            return map[mimetype] || 'bin';
          };

          if (isS3Configured) {
            // Upload to S3
            for (const f of imageFiles) {
              const key = `products/${product.id}/images/${crypto.randomUUID()}.${ext(f.mimetype)}`;
              await s3Upload(key, f.buffer, f.mimetype);
              imageUrls.push(key);
            }
            for (const f of coaFileList) {
              const key = `products/${product.id}/coa/${crypto.randomUUID()}.pdf`;
              await s3Upload(key, f.buffer, f.mimetype);
              coaUrls.push(key);
            }
          } else {
            // Fallback: save to local disk
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
            // Sanitize originalname: strip path separators to prevent directory traversal
            const safeName = (name: string) => name.replace(/[/\\]/g, '_');
            for (const f of imageFiles) {
              const filename = `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safeName(f.originalname)}`;
              fs.writeFileSync(path.join(uploadsDir, filename), f.buffer);
              imageUrls.push(`/uploads/${filename}`);
            }
            for (const f of coaFileList) {
              const filename = `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safeName(f.originalname)}`;
              fs.writeFileSync(path.join(uploadsDir, filename), f.buffer);
              coaUrls.push(`/uploads/${filename}`);
            }
          }

          // Update product with file URLs
          if (imageUrls.length > 0 || coaUrls.length > 0) {
            await prisma.product.update({
              where: { id: product.id },
              data: {
                ...(imageUrls.length > 0 ? { imageUrls } : {}),
                ...(coaUrls.length > 0 ? { coaUrls } : {}),
              },
            });
          }
        } catch (err) {
          logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[MY-LISTINGS] File upload failed');
        }
      }

      // Create review task — fire-and-forget (non-critical)
      createProductReviewTask({
        zohoProductId,
        sellerZohoContactId: seller.zohoContactId,
        productName: name.trim(),
        sellerCompany: seller.companyName,
        category: category || null,
        pricePerUnit: parseFloat_(pricePerUnit) ?? null,
        gramsAvailable: parseFloat_(gramsAvailable) ?? null,
      }).catch((err) => {
        logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[MY-LISTINGS] Review task creation failed (non-critical)');
      });

      // Upload files to Zoho — fire-and-forget (non-critical)
      if (imageFiles.length > 0 || coaFileList.length > 0) {
        const imageBuffers = imageFiles.map((f) => ({ buffer: f.buffer, originalname: f.originalname, mimetype: f.mimetype }));
        const coaBuffers = coaFileList.map((f) => ({ buffer: f.buffer, originalname: f.originalname, mimetype: f.mimetype }));
        uploadProductFiles(zohoProductId, imageBuffers, coaBuffers).catch((err) => {
          logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[MY-LISTINGS] Zoho file upload failed (non-critical)');
        });
      }

      // Re-fetch product to include updated file URLs
      const finalProduct = await prisma.product.findUnique({ where: { id: product.id } });
      res.status(201).json({ product: finalProduct });
    } catch (err: any) {
      logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[MY-LISTINGS] Create failed');
      res.status(500).json({ error: 'Failed to create listing' });
    }
  },
);

/**
 * GET /api/my-listings
 * Returns the seller's products with bid counts.
 */
router.get('/', async (req: Request, res: Response) => {
  const sellerId = req.user!.id;

  const products = await prisma.product.findMany({
    where: { sellerId },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      type: true,
      licensedProducer: true,
      lineage: true,
      dominantTerpene: true,
      totalTerpenePercent: true,
      certification: true,
      harvestDate: true,
      isActive: true,
      requestPending: true,
      pricePerUnit: true,
      gramsAvailable: true,
      upcomingQty: true,
      minQtyRequest: true,
      thcMin: true,
      thcMax: true,
      cbdMin: true,
      cbdMax: true,
      imageUrls: true,
      source: true,
      lastSyncedAt: true,
      _count: {
        select: { bids: true },
      },
    },
  });

  // Also get count of pending bids per product
  const pendingBidCounts = await prisma.bid.groupBy({
    by: ['productId'],
    where: {
      product: { sellerId },
      status: 'PENDING',
    },
    _count: true,
  });

  const pendingMap = new Map(pendingBidCounts.map((b) => [b.productId, b._count]));

  const listings = products.map((p) => ({
    ...p,
    totalBids: p._count.bids,
    pendingBids: pendingMap.get(p.id) || 0,
    _count: undefined,
  }));

  res.json({ listings });
});

/**
 * PATCH /api/my-listings/:id
 * Update seller-editable fields: pricePerUnit, gramsAvailable, upcomingQty.
 * Changes sync back to Zoho.
 */
router.patch('/:id', writeLimiter, validate(updateListingSchema), async (req: Request<{ id: string }>, res: Response) => {
  const sellerId = req.user!.id;
  const productId = req.params.id;

  // Verify ownership
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, sellerId: true, zohoProductId: true, pricePerUnit: true },
  });

  if (!product || product.sellerId !== sellerId) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const { pricePerUnit, gramsAvailable, upcomingQty, minQtyRequest, description, certification, dominantTerpene, totalTerpenePercent } = req.body;

  const updates: Record<string, number | string | null> = {};
  if (pricePerUnit !== undefined) updates.pricePerUnit = pricePerUnit;
  if (gramsAvailable !== undefined) updates.gramsAvailable = gramsAvailable;
  if (upcomingQty !== undefined) updates.upcomingQty = upcomingQty;
  if (minQtyRequest !== undefined) updates.minQtyRequest = minQtyRequest;
  if (description !== undefined) updates.description = description.trim();
  if (certification !== undefined) updates.certification = certification || null;
  if (dominantTerpene !== undefined) updates.dominantTerpene = dominantTerpene || null;
  if (totalTerpenePercent !== undefined) updates.totalTerpenePercent = totalTerpenePercent;

  try {
    await pushProductUpdate(productId, updates);
    const updated = await prisma.product.findUnique({ where: { id: productId } });

    // SHORTLIST_PRICE_DROP — notify shortlisters when seller lowers price
    if (pricePerUnit !== undefined && product.pricePerUnit != null && pricePerUnit < product.pricePerUnit) {
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
              body: `${product.name} price dropped to $${pricePerUnit.toFixed(2)}/g`,
              data: { productId },
            })),
          );
        }
      } catch (e) {
        logger.error({ err: e }, '[MY-LISTINGS] SHORTLIST_PRICE_DROP notification error');
      }
    }

    res.json({ message: 'Product updated', product: updated });
  } catch (err: any) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[MY-LISTINGS] Update failed');
    res.status(500).json({ error: 'Failed to update product' });
  }
});

/**
 * PATCH /api/my-listings/:id/toggle-active
 * Pause or unpause a product listing.
 */
router.patch('/:id/toggle-active', writeLimiter, async (req: Request<{ id: string }>, res: Response) => {
  const sellerId = req.user!.id;
  const productId = req.params.id;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, sellerId: true, zohoProductId: true, isActive: true, requestPending: true },
  });

  if (!product || product.sellerId !== sellerId) {
    return res.status(404).json({ error: 'Product not found' });
  }

  if (product.requestPending) {
    return res.status(400).json({ error: 'Cannot toggle a listing that is pending approval' });
  }

  const newActive = !product.isActive;

  // Update local DB
  await prisma.product.update({
    where: { id: productId },
    data: { isActive: newActive },
  });

  // Sync to Zoho
  try {
    await zohoRequest('PUT', `/Products/${product.zohoProductId}`, {
      data: { data: [{ Product_Active: newActive }], trigger: [] },
    });
  } catch (err: any) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[MY-LISTINGS] Zoho toggle sync failed');
    // Don't fail the request — local state is updated
  }

  res.json({ message: newActive ? 'Product activated' : 'Product paused', isActive: newActive });
});

// ─── Seller Share Links ───

/**
 * POST /api/my-listings/share
 * Create a shareable link for selected products (or all active).
 */
router.post('/share', writeLimiter, validate(createSellerShareSchema), async (req: Request, res: Response) => {
  const sellerId = req.user!.id;
  const { label, productIds, expiresInDays } = req.body;

  // If no productIds provided, share all active products
  let idsToShare: string[];
  if (productIds && productIds.length > 0) {
    // Verify all products belong to this seller
    const owned = await prisma.product.findMany({
      where: { id: { in: productIds }, sellerId },
      select: { id: true },
    });
    if (owned.length !== productIds.length) {
      return res.status(400).json({ error: 'Some products not found or not yours' });
    }
    idsToShare = productIds;
  } else {
    const active = await prisma.product.findMany({
      where: { sellerId, isActive: true },
      select: { id: true },
    });
    if (active.length === 0) {
      return res.status(400).json({ error: 'No active products to share' });
    }
    idsToShare = active.map((p) => p.id);
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const seller = await prisma.user.findUnique({ where: { id: sellerId }, select: { companyName: true } });
  const shareLabel = label || `${seller?.companyName || 'Seller'} — ${idsToShare.length} product${idsToShare.length !== 1 ? 's' : ''}`;

  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null;

  const share = await prisma.curatedShare.create({
    data: {
      token,
      label: shareLabel,
      productIds: idsToShare,
      expiresAt,
      createdById: sellerId,
    },
  });

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  res.json({
    share,
    shareUrl: `${frontendUrl}/share/${share.token}`,
  });
});

/**
 * GET /api/my-listings/shares
 * List the seller's share links.
 */
router.get('/shares', async (req: Request, res: Response) => {
  const sellerId = req.user!.id;

  const shares = await prisma.curatedShare.findMany({
    where: { createdById: sellerId },
    orderBy: { createdAt: 'desc' },
  });

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const sharesWithUrl = shares.map((s) => ({
    ...s,
    shareUrl: `${frontendUrl}/share/${s.token}`,
  }));

  res.json({ shares: sharesWithUrl });
});

/**
 * DELETE /api/my-listings/shares/:id
 * Deactivate a seller's share link.
 */
router.delete('/shares/:id', writeLimiter, async (req: Request<{ id: string }>, res: Response) => {
  const sellerId = req.user!.id;

  try {
    const share = await prisma.curatedShare.findUnique({ where: { id: req.params.id } });
    if (!share || share.createdById !== sellerId) {
      return res.status(404).json({ error: 'Share not found' });
    }

    await prisma.curatedShare.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    res.json({ message: 'Share link deactivated' });
  } catch {
    res.status(404).json({ error: 'Share not found' });
  }
});

export default router;
