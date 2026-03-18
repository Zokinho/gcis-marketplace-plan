import { Router, Request, Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { Prisma } from '@prisma/client';
import logger from '../utils/logger';
import { prisma } from '../index';
import { getCoaClient } from '../services/coaClient';
import { mapCoaToProductFields } from '../utils/coaMapper';
import { extractCoaData } from '../services/coaExtractor';
import { mapExtractedToFormFields } from '../utils/coaAnalyzeMapper';
import { createNotification } from '../services/notificationService';
import { validate, coaConfirmBodySchema } from '../utils/validation';
import { normalizeLabName } from '../utils/labNormalize';

const router = Router();

// Dedicated rate limiter for CoA analysis (expensive API call)
const analyzeLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many analysis requests, please wait a moment' },
});

// Multer: accept single PDF up to 50MB in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new Error('Only PDF files are accepted'));
      return;
    }
    cb(null, true);
  },
});

/**
 * POST /api/coa/analyze
 * Send a CoA PDF to Anthropic API for direct extraction.
 * Returns structured form-compatible fields for the CreateListing page.
 * Does NOT create any database records — purely a scan & auto-fill helper.
 */
router.post('/analyze', analyzeLimiter, upload.single('coaPdf'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file provided' });
  }

  // Verify PDF magic bytes (%PDF-)
  if (!req.file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    return res.status(400).json({ error: 'File is not a valid PDF' });
  }

  // Anthropic API limit: 32MB
  if (req.file.buffer.length > 32 * 1024 * 1024) {
    return res.status(400).json({ error: 'PDF exceeds 32MB limit' });
  }

  // Check if Anthropic API is configured
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'CoA analysis not configured' });
  }

  try {
    const extracted = await extractCoaData(req.file.buffer);
    const fields = mapExtractedToFormFields(extracted);

    // Check for a saved redaction template for this lab
    let redactionRegions: Array<{
      page: number; xPct: number; yPct: number; wPct: number; hPct: number;
      reason: string; confidence: string; source?: string;
    }> = [];
    let templateUsed = false;

    if (extracted.lab) {
      const normalizedLab = normalizeLabName(extracted.lab);
      if (normalizedLab) {
        const template = await prisma.redactionTemplate.findUnique({
          where: { labName: normalizedLab },
        });

        // Count pages in the uploaded PDF (from redaction_regions max page, or 0-indexed)
        const aiRegions = extracted.redaction_regions || [];
        const maxAiPage = aiRegions.reduce((max, r) => Math.max(max, r.page), -1);
        const estimatedPages = maxAiPage + 1;

        if (
          template &&
          (template.pageCount === 0 || estimatedPages === 0 || template.pageCount === estimatedPages)
        ) {
          // Use template regions instead of AI regions
          const savedRegions = template.regions as Array<{
            page: number; xPct: number; yPct: number; wPct: number; hPct: number; reason: string;
          }>;
          redactionRegions = savedRegions.map((r) => ({
            ...r,
            confidence: 'high',
            source: 'template',
          }));
          templateUsed = true;

          // Increment use count (fire-and-forget)
          prisma.redactionTemplate
            .update({ where: { labName: normalizedLab }, data: { useCount: { increment: 1 } } })
            .catch(() => {});

          logger.info({ labName: normalizedLab, regionCount: redactionRegions.length }, '[COA] Using redaction template');
        }
      }
    }

    if (!templateUsed) {
      redactionRegions = (extracted.redaction_regions || []).map((r) => ({
        page: r.page,
        xPct: r.x_pct,
        yPct: r.y_pct,
        wPct: r.w_pct,
        hPct: r.h_pct,
        reason: r.reason,
        confidence: r.confidence || 'medium',
        source: 'ai',
      }));
    }

    res.json({ fields, redactionRegions, templateUsed });
  } catch (err: any) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[COA] Analysis failed');
    res.status(502).json({
      error: 'CoA analysis failed',
      details: err?.message,
    });
  }
});

/**
 * POST /api/coa/upload
 * Proxy a CoA PDF upload to the CoA backend and create a CoaSyncRecord.
 */
router.post('/upload', upload.single('coaPdf'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file provided' });
  }

  // Verify PDF magic bytes (%PDF-)
  if (!req.file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    return res.status(400).json({ error: 'File is not a valid PDF' });
  }

  try {
    const coaClient = getCoaClient();
    const clientName = req.user?.companyName || undefined;

    // Upload to CoA backend
    const job = await coaClient.uploadCoA(req.file.buffer, req.file.originalname, clientName);

    // Create local sync record
    const syncRecord = await prisma.coaSyncRecord.create({
      data: {
        coaJobId: job.id,
        status: 'processing',
        suggestedSellerId: req.user?.id || null,
        suggestedSellerName: req.user?.companyName || null,
        confidence: 'high', // User uploaded it themselves
        matchReason: 'self_upload',
      },
    });

    res.json({
      jobId: job.id,
      syncRecordId: syncRecord.id,
      status: job.status,
    });
  } catch (err: any) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[COA] Upload failed');
    res.status(502).json({
      error: 'CoA processing service unavailable',
      details: err?.message,
    });
  }
});

/**
 * GET /api/coa/jobs/:jobId/status
 * Poll a CoA job status. When complete, returns mapped product data.
 */
router.get('/jobs/:jobId/status', async (req: Request<{ jobId: string }>, res: Response) => {
  const { jobId } = req.params;

  try {
    const coaClient = getCoaClient();
    const job = await coaClient.getJobStatus(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Update sync record status
    const syncRecord = await prisma.coaSyncRecord.findUnique({
      where: { coaJobId: jobId },
    });

    if (syncRecord && job.status !== 'queued' && job.status !== 'processing') {
      const newStatus = job.status === 'review' || job.status === 'published' ? 'ready' : 'processing';
      if (syncRecord.status === 'processing' && newStatus === 'ready') {
        await prisma.coaSyncRecord.update({
          where: { coaJobId: jobId },
          data: {
            status: newStatus,
            coaProductId: job.product_id,
          },
        });

        // Notify seller that CoA is ready (fire-and-forget)
        if (syncRecord.suggestedSellerId) {
          createNotification({
            userId: syncRecord.suggestedSellerId,
            type: 'COA_PROCESSED',
            title: 'CoA extraction complete',
            body: `CoA for ${syncRecord.coaProductName || 'your product'} is ready for review`,
            data: { jobId },
          });
        }
      }
    }

    res.json({
      jobId: job.id,
      status: job.status,
      productId: job.product_id,
      errorMessage: job.error_message,
      pageCount: job.page_count,
    });
  } catch (err: any) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[COA] Status check failed');
    res.status(502).json({ error: 'CoA service unavailable' });
  }
});

/**
 * GET /api/coa/jobs/:jobId/preview
 * Preview extracted product data before confirming.
 * Maps CoA fields to marketplace Product format.
 */
router.get('/jobs/:jobId/preview', async (req: Request<{ jobId: string }>, res: Response) => {
  const { jobId } = req.params;

  try {
    const coaClient = getCoaClient();

    // Get the job to find the product ID
    const job = await coaClient.getJobStatus(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    if (!job.product_id) {
      return res.status(400).json({ error: 'Product not yet extracted', jobStatus: job.status });
    }

    // Get full product detail with test data
    const coaProduct = await coaClient.getProductDetail(job.product_id);
    if (!coaProduct) {
      return res.status(404).json({ error: 'CoA product not found' });
    }

    // Map to marketplace fields
    const mappedFields = mapCoaToProductFields(coaProduct);

    // Get sync record for seller info
    const syncRecord = await prisma.coaSyncRecord.findUnique({
      where: { coaJobId: jobId },
    });

    res.json({
      coaProductId: coaProduct.id,
      mappedFields,
      rawCoaData: {
        name: coaProduct.name,
        strain_type: coaProduct.strain_type,
        lot_number: coaProduct.lot_number,
        producer: coaProduct.producer,
        lab: coaProduct.lab,
        test_date: coaProduct.test_date,
        report_number: coaProduct.report_number,
        tags: coaProduct.tags,
        test_data: coaProduct.test_data,
      },
      syncRecord: syncRecord ? {
        id: syncRecord.id,
        status: syncRecord.status,
        suggestedSellerId: syncRecord.suggestedSellerId,
        suggestedSellerName: syncRecord.suggestedSellerName,
      } : null,
    });
  } catch (err: any) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[COA] Preview failed');
    res.status(502).json({ error: 'CoA service unavailable' });
  }
});

/**
 * POST /api/coa/jobs/:jobId/confirm
 * Confirm an extraction and create/update a marketplace Product.
 */
router.post('/jobs/:jobId/confirm', validate(coaConfirmBodySchema), async (req: Request<{ jobId: string }>, res: Response) => {
  const { jobId } = req.params;
  const { overrides, sellerId } = req.body;

  try {
    const coaClient = getCoaClient();

    // Get the job
    const job = await coaClient.getJobStatus(jobId);
    if (!job || !job.product_id) {
      return res.status(400).json({ error: 'Job not ready for confirmation' });
    }

    // Get the full CoA product detail
    const coaProduct = await coaClient.getProductDetail(job.product_id);
    if (!coaProduct) {
      return res.status(404).json({ error: 'CoA product not found' });
    }

    // Map fields
    const mappedFields = mapCoaToProductFields(coaProduct);

    // Determine seller
    const finalSellerId = sellerId || req.user?.id;
    if (!finalSellerId) {
      return res.status(400).json({ error: 'Seller ID is required' });
    }

    // Verify seller exists
    const seller = await prisma.user.findUnique({ where: { id: finalSellerId } });
    if (!seller) {
      return res.status(404).json({ error: 'Seller not found' });
    }

    // Build product data with overrides
    const productData = {
      ...mappedFields,
      ...overrides,
      testResults: mappedFields.testResults ?? Prisma.JsonNull,
      coaJobId: jobId,
      coaPdfUrl: coaClient.getProductPdfUrl(coaProduct.id) || null,
      coaProcessedAt: new Date(),
      source: 'coa_upload' as const,
      sellerId: finalSellerId,
      isActive: true,
      marketplaceVisible: true,
      zohoProductId: `coa_${jobId}`, // Unique identifier for CoA-created products
    };

    // Create the marketplace product
    const product = await prisma.product.create({
      data: productData,
    });

    // Update sync record
    await prisma.coaSyncRecord.update({
      where: { coaJobId: jobId },
      data: {
        status: 'confirmed',
        marketplaceProductId: product.id,
        confirmedSellerId: finalSellerId,
        coaProductName: coaProduct.name,
      },
    });

    res.json({ product });
  } catch (err: any) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[COA] Confirm failed');
    res.status(500).json({ error: 'Failed to create product', details: err?.message });
  }
});

export default router;
