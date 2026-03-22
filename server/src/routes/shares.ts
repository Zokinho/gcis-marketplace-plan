import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import logger from '../utils/logger';
import { prisma } from '../index';
import { getCoaClient } from '../services/coaClient';
import { validate, createShareSchema, updateShareSchema } from '../utils/validation';
import { marketplaceVisibleWhere } from '../utils/marketplaceVisibility';
import { getRequestIp } from '../services/auditService';
import { isS3Configured, getSignedFileUrl } from '../utils/s3';

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

  // Track usage (simple counter)
  await prisma.curatedShare.update({
    where: { id: share.id },
    data: {
      lastUsedAt: new Date(),
      useCount: { increment: 1 },
    },
  });

  // Fire-and-forget: detailed view tracking with 5-minute dedup
  const rawIp = getRequestIp(req) || 'unknown';
  const ipHash = crypto.createHash('sha256').update(rawIp).digest('hex');
  const userAgent = (req.headers['user-agent'] || '').slice(0, 512) || null;
  (async () => {
    try {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const recent = await prisma.shareView.findFirst({
        where: { shareId: share.id, ipHash, viewedAt: { gte: fiveMinAgo } },
      });
      if (!recent) {
        await prisma.shareView.create({
          data: { shareId: share.id, ipHash, userAgent },
        });
      }
    } catch (err) {
      logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[SHARES] View tracking error');
    }
  })();

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
      coaRedactedKey: true,
      matchCount: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Resolve image URLs for public viewers (no auth token available)
  // - S3 keys → presigned URLs
  // - /api/zoho-files/X/Y → public share file proxy URL
  const resolvedProducts = await Promise.all(
    products.map(async (p) => {
      const resolvedImageUrls = await Promise.all(
        (p.imageUrls || []).map(async (url) => {
          // Rewrite Zoho file proxy URLs to share-scoped public proxy
          if (url.startsWith('/api/zoho-files/')) {
            const segments = url.replace('/api/zoho-files/', '').split('/');
            if (segments.length >= 2) {
              return `/api/shares/public/${req.params.token}/file/${segments[0]}/${segments[1]}`;
            }
            return url;
          }
          // Full URLs and legacy upload paths work as-is
          if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/uploads/')) {
            return url;
          }
          // S3 keys → presigned URLs
          if (isS3Configured()) {
            try {
              const signed = await getSignedFileUrl(url);
              return signed || url;
            } catch {
              return url;
            }
          }
          return url;
        }),
      );
      // CoA filtering: only show CoA data when redacted version exists
      const { coaRedactedKey, ...productWithoutKey } = p;
      let coaFields: Record<string, any> = {};
      if (coaRedactedKey) {
        // Redacted version exists: serve presigned PDF only, hide metadata
        let signedPdfUrl: string | null = null;
        if (isS3Configured()) {
          try {
            signedPdfUrl = await getSignedFileUrl(coaRedactedKey);
          } catch {
            signedPdfUrl = null;
          }
        }
        coaFields = {
          coaPdfUrl: signedPdfUrl,
          coaUrls: [],
          labName: null,
          testDate: null,
          reportNumber: null,
          testResults: null,
          coaJobId: null,
          coaProcessedAt: null,
        };
      } else {
        // No redacted version: hide all CoA data
        coaFields = {
          coaPdfUrl: null,
          coaUrls: [],
          labName: null,
          testDate: null,
          reportNumber: null,
          testResults: null,
          coaJobId: null,
          coaProcessedAt: null,
        };
      }
      return { ...productWithoutKey, imageUrls: resolvedImageUrls, ...coaFields };
    }),
  );

  res.json({ label: share.label, products: resolvedProducts });
});

/**
 * GET /api/shares/public/:token/file/:zohoProductId/:fileId
 * Proxy Zoho file download for a product in a share (images, CoA docs).
 * Scoped to products in the share — share token acts as access control.
 */
const shareFileCache = new Map<string, { data: Buffer; contentType: string; expires: number }>();

publicShareRouter.get('/:token/file/:zohoProductId/:fileId', async (req: Request<{ token: string; zohoProductId: string; fileId: string }>, res: Response) => {
  const { token, zohoProductId, fileId } = req.params;

  const share = await prisma.curatedShare.findUnique({
    where: { token },
  });

  if (!share || !share.active) {
    return res.status(404).json({ error: 'Invalid share link' });
  }

  if (share.expiresAt && share.expiresAt < new Date()) {
    return res.status(410).json({ error: 'Share link has expired' });
  }

  // Verify product is in this share (look up by zohoProductId)
  const product = await prisma.product.findUnique({
    where: { zohoProductId },
    select: { id: true },
  });

  if (!product || !share.productIds.includes(product.id)) {
    return res.status(403).json({ error: 'File not in this share' });
  }

  const cacheKey = `${zohoProductId}:${fileId}`;

  // Check in-memory cache (1 hour TTL)
  const cached = shareFileCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    res.set('Content-Type', cached.contentType);
    res.set('Cache-Control', 'public, max-age=3600');
    return res.send(cached.data);
  }

  try {
    const { downloadZohoFile } = await import('../services/zohoApi');
    const { data, contentType } = await downloadZohoFile(zohoProductId, fileId);

    // Cache for 1 hour
    shareFileCache.set(cacheKey, { data, contentType, expires: Date.now() + 3600_000 });

    // Evict expired entries if cache grows
    if (shareFileCache.size > 200) {
      const now = Date.now();
      for (const [k, v] of shareFileCache) {
        if (v.expires < now) shareFileCache.delete(k);
      }
    }

    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(data);
  } catch (err: any) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[SHARES] File proxy failed');
    res.status(502).json({ error: 'File service unavailable' });
  }
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
    select: { coaPdfUrl: true, coaJobId: true, coaRedactedKey: true, name: true },
  });

  if (!product?.coaRedactedKey) {
    return res.status(404).json({ error: 'No CoA PDF available for this product' });
  }

  try {
    // Serve redacted PDF via presigned S3 URL
    if (!isS3Configured()) {
      return res.status(404).json({ error: 'File storage not configured' });
    }

    const signedUrl = await getSignedFileUrl(product.coaRedactedKey);
    if (!signedUrl) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    res.redirect(302, signedUrl);
  } catch (err: any) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[SHARES] PDF redirect failed');
    res.status(502).json({ error: 'CoA service unavailable' });
  }
});

export default router;
