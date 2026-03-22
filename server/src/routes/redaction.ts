import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router, Request, Response } from 'express';
import logger from '../utils/logger';
import { prisma } from '../index';
import { logAudit, getRequestIp } from '../services/auditService';
import { getSignedFileUrl, isS3Configured } from '../utils/s3';
import { applyRedactions, generatePageImages } from '../services/coaRedactor';
import { uploadFile as s3Upload } from '../utils/s3';
import {
  validate,
  validateParams,
  redactionRegionCreateSchema,
  redactionRegionUpdateSchema,
  redactionProductParamsSchema,
  redactionRegionParamsSchema,
  redactionPageParamsSchema,
} from '../utils/validation';
import { normalizeLabName } from '../utils/labNormalize';

const router = Router();

// Local uploads directory — fallback when S3 is not configured
const uploadsDir = path.join(__dirname, '../../../uploads');

/** Save a file to S3 or local disk. Returns the key/path used for DB storage. */
async function saveFile(key: string, buffer: Buffer, contentType: string): Promise<string> {
  if (isS3Configured()) {
    await s3Upload(key, buffer, contentType);
    return key;
  }
  // Local fallback: store under uploads/ using the same key structure
  const localPath = path.join(uploadsDir, key);
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, buffer);
  return key; // Store the key, resolve to local path when reading
}

/** Read a file from S3 or local disk given a stored key. */
async function readFile(key: string): Promise<Buffer> {
  if (isS3Configured()) {
    const { default: axios } = await import('axios');
    const url = await getSignedFileUrl(key);
    if (!url) throw new Error(`Failed to generate presigned URL for ${key}`);
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 120_000 });
    return Buffer.from(res.data);
  }
  // Local fallback
  const localPath = path.join(uploadsDir, key);
  if (!fs.existsSync(localPath)) throw new Error(`File not found: ${localPath}`);
  return fs.readFileSync(localPath);
}

/** Get a URL to serve a stored file (presigned S3 URL or local /uploads/ path). */
async function getFileUrl(key: string): Promise<string> {
  if (isS3Configured()) {
    const url = await getSignedFileUrl(key);
    if (!url) throw new Error(`Failed to generate presigned URL for ${key}`);
    return url;
  }
  // Local fallback: serve via express.static /uploads
  return `/uploads/${key}`;
}

/**
 * GET /api/redaction/:productId/regions
 * List all redaction regions for a product.
 */
router.get('/:productId/regions', validateParams(redactionProductParamsSchema), async (req: Request<{ productId: string }>, res: Response) => {
  const { productId } = req.params;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, coaPageCount: true },
  });
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const regions = await prisma.redactionRegion.findMany({
    where: { productId },
    orderBy: [{ page: 'asc' }, { yPct: 'asc' }],
  });

  res.json({ regions, coaPageCount: product.coaPageCount });
});

/**
 * POST /api/redaction/:productId/regions
 * Add a manual redaction region.
 */
router.post('/:productId/regions', validateParams(redactionProductParamsSchema), validate(redactionRegionCreateSchema), async (req: Request<{ productId: string }>, res: Response) => {
  const { productId } = req.params;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, coaPageCount: true },
  });
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const { page, xPct, yPct, wPct, hPct, reason, confidence } = req.body;

  if (product.coaPageCount != null && page >= product.coaPageCount) {
    return res.status(400).json({ error: `Page ${page} exceeds PDF page count (${product.coaPageCount})` });
  }

  const region = await prisma.redactionRegion.create({
    data: {
      productId,
      page,
      xPct,
      yPct,
      wPct,
      hPct,
      reason,
      confidence,
      source: 'manual',
      approved: true,
    },
  });

  logAudit({
    actorId: req.user?.id,
    actorEmail: req.user?.email,
    action: 'redaction.create',
    targetType: 'RedactionRegion',
    targetId: region.id,
    metadata: { productId, page, reason },
    ip: getRequestIp(req),
  });

  res.status(201).json({ region });
});

/**
 * PATCH /api/redaction/:productId/regions/:regionId
 * Update a redaction region (coordinates, approved, reason).
 */
router.patch('/:productId/regions/:regionId', validateParams(redactionRegionParamsSchema), validate(redactionRegionUpdateSchema), async (req: Request<{ productId: string; regionId: string }>, res: Response) => {
  const { productId, regionId } = req.params;

  const region = await prisma.redactionRegion.findUnique({ where: { id: regionId } });
  if (!region || region.productId !== productId) {
    return res.status(404).json({ error: 'Region not found' });
  }

  const updated = await prisma.redactionRegion.update({
    where: { id: regionId },
    data: req.body,
  });

  logAudit({
    actorId: req.user?.id,
    actorEmail: req.user?.email,
    action: 'redaction.update',
    targetType: 'RedactionRegion',
    targetId: regionId,
    metadata: { productId, changes: Object.keys(req.body) },
    ip: getRequestIp(req),
  });

  res.json({ region: updated });
});

/**
 * DELETE /api/redaction/:productId/regions/:regionId
 * Delete a redaction region.
 */
router.delete('/:productId/regions/:regionId', validateParams(redactionRegionParamsSchema), async (req: Request<{ productId: string; regionId: string }>, res: Response) => {
  const { productId, regionId } = req.params;

  const region = await prisma.redactionRegion.findUnique({ where: { id: regionId } });
  if (!region || region.productId !== productId) {
    return res.status(404).json({ error: 'Region not found' });
  }

  await prisma.redactionRegion.delete({ where: { id: regionId } });

  logAudit({
    actorId: req.user?.id,
    actorEmail: req.user?.email,
    action: 'redaction.delete',
    targetType: 'RedactionRegion',
    targetId: regionId,
    metadata: { productId, reason: region.reason },
    ip: getRequestIp(req),
  });

  res.json({ message: 'Region deleted' });
});

/**
 * GET /api/redaction/:productId/pages/:pageNum
 * Get a URL for a page image preview (presigned S3 URL or local path).
 */
router.get('/:productId/pages/:pageNum', validateParams(redactionPageParamsSchema), async (req: Request<{ productId: string; pageNum: string }>, res: Response) => {
  const { productId } = req.params;
  const pageNum = Number(req.params.pageNum);

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, coaPageCount: true },
  });
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  if (product.coaPageCount != null && pageNum >= product.coaPageCount) {
    return res.status(400).json({ error: `Page ${pageNum} exceeds page count (${product.coaPageCount})` });
  }

  const key = `products/${productId}/coa/pages/page_${pageNum}.png`;
  try {
    const url = await getFileUrl(key);
    res.json({ url, page: pageNum });
  } catch (err) {
    logger.error({ err, key }, '[REDACTION] Failed to get page image URL');
    res.status(404).json({ error: 'Page image not found' });
  }
});

/**
 * POST /api/redaction/:productId/apply
 * Apply approved redactions and generate redacted PDF.
 */
router.post('/:productId/apply', validateParams(redactionProductParamsSchema), async (req: Request<{ productId: string }>, res: Response) => {
  const { productId } = req.params;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, coaOriginalKey: true, coaRedactedKey: true, labName: true, coaPageCount: true },
  });
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  if (!product.coaOriginalKey) {
    return res.status(400).json({ error: 'No original CoA PDF found for this product' });
  }

  const regions = await prisma.redactionRegion.findMany({
    where: { productId, approved: true },
    select: { page: true, xPct: true, yPct: true, wPct: true, hPct: true, reason: true, approved: true },
  });

  try {
    const pdfBuffer = await readFile(product.coaOriginalKey);

    let redactedBuffer: Buffer;
    if (regions.length === 0) {
      redactedBuffer = pdfBuffer;
    } else {
      redactedBuffer = await applyRedactions(pdfBuffer, regions);
    }

    const redactedKey = product.coaOriginalKey.replace('_original.pdf', '.pdf');
    await saveFile(redactedKey, redactedBuffer, 'application/pdf');

    // Regenerate page preview images from the redacted PDF so the editor shows the result
    try {
      const { images: redactedImages } = await generatePageImages(redactedBuffer);
      for (let i = 0; i < redactedImages.length; i++) {
        const pageKey = `products/${productId}/coa/pages/page_${i}.png`;
        await saveFile(pageKey, redactedImages[i], 'image/png');
      }
    } catch (imgErr) {
      logger.warn({ err: imgErr instanceof Error ? imgErr : { message: String(imgErr) }, productId }, '[REDACTION] Failed to regenerate page images after apply');
    }

    await prisma.product.update({
      where: { id: productId },
      data: { coaRedactedKey: redactedKey },
    });

    logAudit({
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      action: 'redaction.apply',
      targetType: 'Product',
      targetId: productId,
      metadata: { productName: product.name, regionsApplied: regions.length },
      ip: getRequestIp(req),
    });

    // Auto-save/update redaction template for this lab (fire-and-forget)
    if (product.labName) {
      const normalizedLab = normalizeLabName(product.labName);
      if (normalizedLab) {
        const templateRegions = regions.map((r) => ({
          page: r.page,
          xPct: r.xPct,
          yPct: r.yPct,
          wPct: r.wPct,
          hPct: r.hPct,
          reason: r.reason,
        }));
        prisma.redactionTemplate
          .upsert({
            where: { labName: normalizedLab },
            create: {
              labName: normalizedLab,
              pageCount: product.coaPageCount ?? 0,
              regions: templateRegions,
              createdBy: req.user?.email ?? null,
              useCount: 0,
            },
            update: {
              regions: templateRegions,
              pageCount: product.coaPageCount ?? 0,
            },
          })
          .then(() => {
            logger.info({ labName: normalizedLab, regionCount: templateRegions.length }, '[REDACTION] Saved template for lab');
          })
          .catch((err) => {
            logger.warn({ err: err instanceof Error ? err : { message: String(err) }, labName: normalizedLab }, '[REDACTION] Failed to save template');
          });
      }
    }

    res.json({
      message: 'Redacted PDF generated',
      coaRedactedKey: redactedKey,
      regionsApplied: regions.length,
    });
  } catch (err: any) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) }, productId }, '[REDACTION] Failed to apply redactions');
    res.status(500).json({ error: 'Failed to apply redactions', details: err?.message });
  }
});

/**
 * POST /api/redaction/:productId/initialize
 * Backfill an existing product's CoA into the redaction system.
 * Reads from coaUrls (local or Zoho proxy), stores original + generates page images.
 * Works with both S3 and local disk storage.
 */
router.post('/:productId/initialize', validateParams(redactionProductParamsSchema), async (req: Request<{ productId: string }>, res: Response) => {
  const { productId } = req.params;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, coaOriginalKey: true, coaUrls: true },
  });
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  if (product.coaOriginalKey) {
    return res.status(400).json({ error: 'Product already has redaction initialized' });
  }

  const coaUrls = (product.coaUrls as string[]) || [];
  if (coaUrls.length === 0) {
    return res.status(400).json({ error: 'No CoA files found on this product' });
  }

  try {
    // Read the first CoA PDF
    let pdfBuffer: Buffer;
    const coaUrl = coaUrls[0];

    if (coaUrl.startsWith('/uploads/')) {
      // Local file
      const filePath = path.join(__dirname, '../../..', coaUrl);
      if (!fs.existsSync(filePath)) {
        return res.status(400).json({ error: 'CoA file not found on disk' });
      }
      pdfBuffer = fs.readFileSync(filePath);
    } else if (coaUrl.startsWith('/api/zoho-files/')) {
      // Zoho proxy — fetch through our own server
      const { default: axios } = await import('axios');
      const baseUrl = `http://localhost:${process.env.PORT || 3001}`;
      const fetchRes = await axios.get(`${baseUrl}${coaUrl}`, {
        responseType: 'arraybuffer',
        timeout: 60_000,
        headers: req.headers.authorization ? { Authorization: req.headers.authorization } : {},
      });
      pdfBuffer = Buffer.from(fetchRes.data);
    } else {
      return res.status(400).json({ error: 'Unsupported CoA URL format' });
    }

    // Store original PDF
    const originalKey = `products/${productId}/coa/${crypto.randomUUID()}_original.pdf`;
    await saveFile(originalKey, pdfBuffer, 'application/pdf');

    // Generate page images
    const { images, pageCount } = await generatePageImages(pdfBuffer);
    for (let i = 0; i < images.length; i++) {
      const pageKey = `products/${productId}/coa/pages/page_${i}.png`;
      await saveFile(pageKey, images[i], 'image/png');
    }

    // Update product
    await prisma.product.update({
      where: { id: productId },
      data: { coaOriginalKey: originalKey, coaPageCount: pageCount },
    });

    logAudit({
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      action: 'redaction.initialize',
      targetType: 'Product',
      targetId: productId,
      metadata: { productName: product.name, pageCount },
      ip: getRequestIp(req),
    });

    res.json({ message: 'Redaction initialized', coaOriginalKey: originalKey, coaPageCount: pageCount });
  } catch (err: any) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) }, productId }, '[REDACTION] Failed to initialize redaction');
    res.status(500).json({ error: 'Failed to initialize redaction', details: err?.message });
  }
});

export default router;
