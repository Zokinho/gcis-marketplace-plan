import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import logger from '../utils/logger';
import { prisma } from '../index';
import { getCoaClient } from '../services/coaClient';
import { validate, createShareSchema, updateShareSchema } from '../utils/validation';
import { marketplaceVisibleWhere } from '../utils/marketplaceVisibility';

const router = Router();

// ─── Admin endpoints (auth required, mounted behind requireAuth + marketplaceAuth + requireAdmin) ───

/**
 * POST /api/shares
 * Create a curated share link.
 */
router.post('/', validate(createShareSchema), async (req: Request, res: Response) => {
  const { label, productIds, expiresAt } = req.body as {
    label: string;
    productIds: string[];
    expiresAt?: string;
  };

  if (!label || !productIds?.length) {
    return res.status(400).json({ error: 'label and productIds are required' });
  }

  // Validate that all product IDs exist
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true },
  });

  if (products.length !== productIds.length) {
    return res.status(400).json({ error: 'Some product IDs are invalid' });
  }

  const token = crypto.randomBytes(32).toString('base64url');

  const share = await prisma.curatedShare.create({
    data: {
      token,
      label,
      productIds,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });

  res.json({ share });
});

/**
 * GET /api/shares
 * List all shares.
 */
router.get('/', async (_req: Request, res: Response) => {
  const shares = await prisma.curatedShare.findMany({
    orderBy: { createdAt: 'desc' },
  });

  res.json({ shares });
});

/**
 * PATCH /api/shares/:id
 * Update a share (label, productIds, active, expiresAt).
 */
router.patch('/:id', validate(updateShareSchema), async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;
  const { label, productIds, active, expiresAt } = req.body as {
    label?: string;
    productIds?: string[];
    active?: boolean;
    expiresAt?: string | null;
  };

  const data: Record<string, any> = {};
  if (label !== undefined) data.label = label;
  if (productIds !== undefined) data.productIds = productIds;
  if (active !== undefined) data.active = active;
  if (expiresAt !== undefined) data.expiresAt = expiresAt ? new Date(expiresAt) : null;

  try {
    const share = await prisma.curatedShare.update({
      where: { id },
      data,
    });
    res.json({ share });
  } catch {
    res.status(404).json({ error: 'Share not found' });
  }
});

/**
 * DELETE /api/shares/:id
 * Permanently delete a share.
 */
router.delete('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    await prisma.curatedShare.delete({
      where: { id: req.params.id },
    });
    res.json({ success: true });
  } catch {
    res.status(404).json({ error: 'Share not found' });
  }
});

// ─── Public endpoints (NO auth — token is the access control) ───
// These are mounted separately at /api/shares/public in index.ts

export const publicShareRouter = Router();

/**
 * GET /api/shares/public/validate/:token
 * Validate a share token and return metadata.
 */
publicShareRouter.get('/validate/:token', async (req: Request<{ token: string }>, res: Response) => {
  const share = await prisma.curatedShare.findUnique({
    where: { token: req.params.token },
  });

  if (!share || !share.active) {
    return res.status(404).json({ error: 'Invalid or expired share link' });
  }

  if (share.expiresAt && share.expiresAt < new Date()) {
    return res.status(410).json({ error: 'Share link has expired' });
  }

  res.json({
    label: share.label,
    productCount: share.productIds.length,
    expiresAt: share.expiresAt,
  });
});

/**
 * GET /api/shares/public/:token/products
 * Return products in a share with CoA data.
 */
publicShareRouter.get('/:token/products', async (req: Request<{ token: string }>, res: Response) => {
  const share = await prisma.curatedShare.findUnique({
    where: { token: req.params.token },
  });

  if (!share || !share.active) {
    return res.status(404).json({ error: 'Invalid or expired share link' });
  }

  if (share.expiresAt && share.expiresAt < new Date()) {
    return res.status(410).json({ error: 'Share link has expired' });
  }

  // Track usage
  await prisma.curatedShare.update({
    where: { id: share.id },
    data: {
      lastUsedAt: new Date(),
      useCount: { increment: 1 },
    },
  });

  const products = await prisma.product.findMany({
    where: {
      id: { in: share.productIds },
      ...marketplaceVisibleWhere(),
    },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      type: true,
      growthMedium: true,
      lineage: true,
      harvestDate: true,
      isActive: true,
      pricePerUnit: true,
      minQtyRequest: true,
      gramsAvailable: true,
      upcomingQty: true,
      thcMin: true,
      thcMax: true,
      cbdMin: true,
      cbdMax: true,
      dominantTerpene: true,
      highestTerpenes: true,
      aromas: true,
      certification: true,
      budSizePopcorn: true,
      budSizeSmall: true,
      budSizeMedium: true,
      budSizeLarge: true,
      budSizeXLarge: true,
      imageUrls: true,
      coaUrls: true,
      labName: true,
      testDate: true,
      reportNumber: true,
      coaJobId: true,
      coaPdfUrl: true,
      coaProcessedAt: true,
      testResults: true,
      matchCount: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.json({ label: share.label, products });
});

/**
 * GET /api/shares/public/:token/products/:id/pdf
 * Proxy CoA PDF download for a product in a share.
 */
publicShareRouter.get('/:token/products/:id/pdf', async (req: Request<{ token: string; id: string }>, res: Response) => {
  const { token, id } = req.params;

  const share = await prisma.curatedShare.findUnique({
    where: { token },
  });

  if (!share || !share.active) {
    return res.status(404).json({ error: 'Invalid share link' });
  }

  if (share.expiresAt && share.expiresAt < new Date()) {
    return res.status(410).json({ error: 'Share link has expired' });
  }

  // Verify product is in this share
  if (!share.productIds.includes(id)) {
    return res.status(403).json({ error: 'Product not in this share' });
  }

  const product = await prisma.product.findUnique({
    where: { id },
    select: { coaPdfUrl: true, coaJobId: true, name: true },
  });

  if (!product?.coaJobId) {
    return res.status(404).json({ error: 'No CoA PDF available for this product' });
  }

  try {
    // Get the CoA product ID from the sync record
    const syncRecord = await prisma.coaSyncRecord.findUnique({
      where: { coaJobId: product.coaJobId },
    });

    if (!syncRecord?.coaProductId) {
      return res.status(404).json({ error: 'CoA data not found' });
    }

    const coaClient = getCoaClient();
    const pdfBuffer = await coaClient.getProductPdfBuffer(syncRecord.coaProductId);

    if (!pdfBuffer) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    const safeName = (product.name || 'CoA').replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_CoA.pdf"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[SHARES] PDF proxy failed');
    res.status(502).json({ error: 'CoA service unavailable' });
  }
});

export default router;
