import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { prisma } from '../index';
import { pushProductUpdate, createZohoProduct, createProductReviewTask, uploadProductFiles } from '../services/zohoApi';
import { zohoRequest } from '../services/zohoAuth';

const router = Router();

// ─── Multer config for file uploads ───
const uploadsDir = path.join(__dirname, '../../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}-${file.originalname}`;
    cb(null, unique);
  },
});

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const allowedImages = ['image/jpeg', 'image/png', 'image/webp'];
  const allowedPdf = ['application/pdf'];
  if (file.fieldname === 'coaFiles') {
    cb(null, allowedPdf.includes(file.mimetype));
  } else {
    cb(null, allowedImages.includes(file.mimetype));
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * POST /api/my-listings
 * Create a new product listing manually (with file uploads).
 */
router.post(
  '/',
  upload.fields([
    { name: 'coverPhoto', maxCount: 1 },
    { name: 'images', maxCount: 4 },
    { name: 'coaFiles', maxCount: 3 },
  ]),
  async (req: Request, res: Response) => {
    const sellerId = req.user!.id;
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;

    const {
      name, description, category, type,
      licensedProducer, lineage, growthMedium, harvestDate, certification,
      thc, cbd, dominantTerpene, totalTerpenePercent,
      gramsAvailable, upcomingQty, minQtyRequest, pricePerUnit,
      budSizePopcorn, budSizeSmall, budSizeMedium, budSizeLarge, budSizeXLarge,
    } = req.body as Record<string, string>;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Product name is required' });
    }

    // Build image URLs: cover photo first, then additional images
    const imageUrls: string[] = [];
    if (files?.coverPhoto?.[0]) {
      imageUrls.push(`/uploads/${files.coverPhoto[0].filename}`);
    }
    if (files?.images) {
      for (const f of files.images) {
        imageUrls.push(`/uploads/${f.filename}`);
      }
    }

    // Build CoA URLs
    const coaUrls: string[] = [];
    if (files?.coaFiles) {
      for (const f of files.coaFiles) {
        coaUrls.push(`/uploads/${f.filename}`);
      }
    }

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
        console.error('[MY-LISTINGS] Review task creation failed (non-critical):', err?.message);
      });

      // Upload files to Zoho — fire-and-forget (non-critical)
      const imageDiskPaths: string[] = [];
      if (files?.coverPhoto?.[0]) imageDiskPaths.push(files.coverPhoto[0].path);
      if (files?.images) {
        for (const f of files.images) imageDiskPaths.push(f.path);
      }
      const coaDiskPaths: string[] = [];
      if (files?.coaFiles) {
        for (const f of files.coaFiles) coaDiskPaths.push(f.path);
      }
      if (imageDiskPaths.length > 0 || coaDiskPaths.length > 0) {
        uploadProductFiles(zohoProductId, imageDiskPaths, coaDiskPaths).catch((err) => {
          console.error('[MY-LISTINGS] Zoho file upload failed (non-critical):', err?.message);
        });
      }

      res.status(201).json({ product });
    } catch (err: any) {
      console.error('[MY-LISTINGS] Create failed:', err?.message);
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
      category: true,
      type: true,
      certification: true,
      isActive: true,
      requestPending: true,
      pricePerUnit: true,
      gramsAvailable: true,
      upcomingQty: true,
      thcMin: true,
      thcMax: true,
      cbdMax: true,
      imageUrls: true,
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
router.patch('/:id', async (req: Request<{ id: string }>, res: Response) => {
  const sellerId = req.user!.id;
  const productId = req.params.id;

  // Verify ownership
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, sellerId: true, zohoProductId: true },
  });

  if (!product || product.sellerId !== sellerId) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const { pricePerUnit, gramsAvailable, upcomingQty } = req.body as {
    pricePerUnit?: number;
    gramsAvailable?: number;
    upcomingQty?: number;
  };

  // Validate — at least one field must be provided
  if (pricePerUnit === undefined && gramsAvailable === undefined && upcomingQty === undefined) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  const updates: { pricePerUnit?: number; gramsAvailable?: number; upcomingQty?: number } = {};
  if (pricePerUnit !== undefined) updates.pricePerUnit = Number(pricePerUnit);
  if (gramsAvailable !== undefined) updates.gramsAvailable = Number(gramsAvailable);
  if (upcomingQty !== undefined) updates.upcomingQty = Number(upcomingQty);

  try {
    await pushProductUpdate(productId, updates);
    const updated = await prisma.product.findUnique({ where: { id: productId } });
    res.json({ message: 'Product updated', product: updated });
  } catch (err: any) {
    console.error('[MY-LISTINGS] Update failed:', err?.message);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

/**
 * PATCH /api/my-listings/:id/toggle-active
 * Pause or unpause a product listing.
 */
router.patch('/:id/toggle-active', async (req: Request<{ id: string }>, res: Response) => {
  const sellerId = req.user!.id;
  const productId = req.params.id;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, sellerId: true, zohoProductId: true, isActive: true },
  });

  if (!product || product.sellerId !== sellerId) {
    return res.status(404).json({ error: 'Product not found' });
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
    console.error('[MY-LISTINGS] Zoho toggle sync failed:', err?.message);
    // Don't fail the request — local state is updated
  }

  res.json({ message: newActive ? 'Product activated' : 'Product paused', isActive: newActive });
});

// ─── Seller Share Links ───

/**
 * POST /api/my-listings/share
 * Create a shareable link for selected products (or all active).
 */
router.post('/share', async (req: Request, res: Response) => {
  const sellerId = req.user!.id;
  const { label, productIds, expiresInDays } = req.body as {
    label?: string;
    productIds?: string[];
    expiresInDays?: number;
  };

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
router.delete('/shares/:id', async (req: Request<{ id: string }>, res: Response) => {
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
