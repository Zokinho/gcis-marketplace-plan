/**
 * Clearance Routes
 * Admin: CRUD for clearance deals (limited-time discounted products).
 * Buyer: List active + unexpired clearance deals.
 */

import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { prisma } from '../index';
import logger from '../utils/logger';
import { logAudit, getRequestIp } from '../services/auditService';
import {
  validate,
  validateQuery,
  validateParams,
  createSpotSaleSchema,
  updateSpotSaleSchema,
  spotSaleAdminQuerySchema,
  recordSpotSaleSchema,
} from '../utils/validation';
import { pushProductUpdate, createDeal } from '../services/zohoApi';
import * as churnDetectionService from '../services/churnDetectionService';
import * as marketContextService from '../services/marketContextService';
import { createNotification } from '../services/notificationService';
import { z } from 'zod';
import { isS3Configured, uploadFile as s3Upload } from '../utils/s3';

// ─── Admin router ───

export const adminRouter = Router();

const idParamsSchema = z.object({ id: z.string().min(1) });

// ─── Multer config for clearance file uploads ───
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
const uploadsDir = path.join(__dirname, '../../../uploads');

// Product fields to include in responses
const productSelect = {
  id: true,
  name: true,
  category: true,
  type: true,
  certification: true,
  thcMin: true,
  thcMax: true,
  cbdMin: true,
  cbdMax: true,
  pricePerUnit: true,
  gramsAvailable: true,
  upcomingQty: true,
  licensedProducer: true,
  imageUrls: true,
  isActive: true,
  labName: true,
  testDate: true,
  reportNumber: true,
  testResults: true,
  coaPdfUrl: true,
  source: true,
};

/**
 * POST /api/spot-sales/admin
 * Create a new clearance deal.
 */
adminRouter.post(
  '/',
  upload.fields([
    { name: 'images', maxCount: 4 },
    { name: 'coaFiles', maxCount: 2 },
  ]),
  async (req: Request, res: Response) => {
  // Multer parsed multipart — now validate body with Zod
  const parsed = createSpotSaleSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  const { productId, spotPrice, quantity, expiresAt, productName, originalPrice: bodyOriginalPrice, category, type, licensedProducer, thcContent, cbdContent } = parsed.data;
  const adminId = req.user!.id;
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;

  try {
    let resolvedProductId: string;
    let originalPrice: number;

    if (productId) {
      // ── From existing product ──
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, pricePerUnit: true, name: true },
      });

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      if (!product.pricePerUnit || product.pricePerUnit <= 0) {
        return res.status(400).json({ error: 'Product must have a valid price' });
      }

      resolvedProductId = product.id;
      originalPrice = product.pricePerUnit;
    } else {
      // ── From scratch — create hidden product ──
      // originalPrice is optional; fall back to spotPrice (no discount shown)
      originalPrice = bodyOriginalPrice && bodyOriginalPrice > 0 ? bodyOriginalPrice : spotPrice;

      const newProduct = await prisma.product.create({
        data: {
          name: productName!,
          pricePerUnit: bodyOriginalPrice && bodyOriginalPrice > 0 ? bodyOriginalPrice : spotPrice,
          category: category || null,
          type: type || null,
          licensedProducer: licensedProducer || null,
          thcMin: thcContent != null ? thcContent : null,
          thcMax: thcContent != null ? thcContent : null,
          cbdMin: cbdContent != null ? cbdContent : null,
          cbdMax: cbdContent != null ? cbdContent : null,
          isActive: false,
          marketplaceVisible: false,
          source: 'clearance',
          sellerId: adminId,
          zohoProductId: `clearance-${Date.now()}`,
        },
      });

      resolvedProductId = newProduct.id;

      // Upload images + CoA files for from-scratch products
      const imageFiles = files?.images || [];
      const coaFileList = files?.coaFiles || [];

      if (imageFiles.length > 0 || coaFileList.length > 0) {
        const imageUrls: string[] = [];
        const coaUrls: string[] = [];

        try {
          const ext = (mimetype: string) => {
            const map: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
            return map[mimetype] || 'bin';
          };

          if (isS3Configured) {
            for (const f of imageFiles) {
              const key = `products/${resolvedProductId}/images/${crypto.randomUUID()}.${ext(f.mimetype)}`;
              await s3Upload(key, f.buffer, f.mimetype);
              imageUrls.push(key);
            }
            for (const f of coaFileList) {
              const key = `products/${resolvedProductId}/coa/${crypto.randomUUID()}.pdf`;
              await s3Upload(key, f.buffer, f.mimetype);
              coaUrls.push(key);
            }
          } else {
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
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

          if (imageUrls.length > 0 || coaUrls.length > 0) {
            await prisma.product.update({
              where: { id: resolvedProductId },
              data: {
                ...(imageUrls.length > 0 ? { imageUrls } : {}),
                ...(coaUrls.length > 0 ? { coaUrls } : {}),
              },
            });
          }
        } catch (err) {
          logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[SPOT-SALES] File upload failed');
        }
      }
    }

    // For existing products, clearance price must be below original.
    // For from-scratch without an original price, they may be equal (no discount).
    if (productId && spotPrice >= originalPrice) {
      return res.status(400).json({ error: 'Clearance price must be less than the original price' });
    }
    if (!productId && bodyOriginalPrice && bodyOriginalPrice > 0 && spotPrice >= bodyOriginalPrice) {
      return res.status(400).json({ error: 'Clearance price must be less than the original price' });
    }

    const expiresDate = new Date(expiresAt);
    if (expiresDate <= new Date()) {
      return res.status(400).json({ error: 'Expiry must be in the future' });
    }

    // Check no existing active clearance deal for this product
    const existing = await prisma.spotSale.findFirst({
      where: {
        productId: resolvedProductId,
        active: true,
        expiresAt: { gt: new Date() },
      },
    });

    if (existing) {
      return res.status(409).json({ error: 'An active clearance deal already exists for this product' });
    }

    const discountPercent = ((originalPrice - spotPrice) / originalPrice) * 100;

    const spotSale = await prisma.spotSale.create({
      data: {
        productId: resolvedProductId,
        originalPrice,
        spotPrice,
        discountPercent: Math.round(discountPercent * 10) / 10,
        quantity: quantity ?? null,
        expiresAt: expiresDate,
        createdById: adminId,
      },
      include: {
        product: { select: productSelect },
        createdBy: { select: { email: true, firstName: true, lastName: true } },
      },
    });

    logAudit({
      actorId: adminId,
      actorEmail: req.user!.email,
      action: 'spot-sale.create',
      targetType: 'SpotSale',
      targetId: spotSale.id,
      metadata: { productId: resolvedProductId, spotPrice, originalPrice, quantity, discountPercent: spotSale.discountPercent, fromScratch: !productId },
      ip: getRequestIp(req),
    });

    res.status(201).json({ spotSale });
  } catch (err) {
    logger.error({ err }, '[SPOT-SALES] Create error');
    res.status(500).json({ error: 'Failed to create clearance deal' });
  }
});

/**
 * GET /api/spot-sales/admin
 * List all clearance deals (paginated, filterable by status).
 */
adminRouter.get('/', validateQuery(spotSaleAdminQuerySchema), async (req: Request, res: Response) => {
  const { page, limit, status } = req.query as any;

  try {
    const now = new Date();
    let where: any = {};

    switch (status) {
      case 'active':
        where = { active: true, expiresAt: { gt: now } };
        break;
      case 'expired':
        where = { expiresAt: { lte: now } };
        break;
      case 'deactivated':
        where = { active: false };
        break;
      // 'all' — no filter
    }

    const [spotSales, total] = await Promise.all([
      prisma.spotSale.findMany({
        where,
        include: {
          product: { select: productSelect },
          createdBy: { select: { email: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.spotSale.count({ where }),
    ]);

    res.json({
      spotSales,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    logger.error({ err }, '[SPOT-SALES] Admin list error');
    res.status(500).json({ error: 'Failed to fetch clearance deals' });
  }
});

/**
 * PATCH /api/spot-sales/admin/:id
 * Update a clearance deal (active, spotPrice, expiresAt).
 */
adminRouter.patch('/:id', validateParams(idParamsSchema), validate(updateSpotSaleSchema), async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;
  const adminId = req.user!.id;
  const updates = req.body;

  try {
    const existing = await prisma.spotSale.findUnique({
      where: { id },
      select: { id: true, originalPrice: true, spotPrice: true, productId: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Clearance deal not found' });
    }

    const data: any = {};

    if (updates.active !== undefined) data.active = updates.active;
    if (updates.expiresAt !== undefined) data.expiresAt = new Date(updates.expiresAt);
    if (updates.quantity !== undefined) data.quantity = updates.quantity;

    if (updates.spotPrice !== undefined) {
      if (updates.spotPrice >= existing.originalPrice) {
        return res.status(400).json({ error: 'Clearance price must be less than original price' });
      }
      data.spotPrice = updates.spotPrice;
      data.discountPercent = Math.round(((existing.originalPrice - updates.spotPrice) / existing.originalPrice) * 100 * 10) / 10;
    }

    const spotSale = await prisma.spotSale.update({
      where: { id },
      data,
      include: {
        product: { select: productSelect },
        createdBy: { select: { email: true, firstName: true, lastName: true } },
      },
    });

    logAudit({
      actorId: adminId,
      actorEmail: req.user!.email,
      action: 'spot-sale.update',
      targetType: 'SpotSale',
      targetId: id,
      metadata: updates,
      ip: getRequestIp(req),
    });

    res.json({ spotSale });
  } catch (err) {
    logger.error({ err }, '[SPOT-SALES] Update error');
    res.status(500).json({ error: 'Failed to update clearance deal' });
  }
});

/**
 * DELETE /api/spot-sales/admin/:id
 * Hard delete a clearance deal.
 */
adminRouter.delete('/:id', validateParams(idParamsSchema), async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;
  const adminId = req.user!.id;

  try {
    const existing = await prisma.spotSale.findUnique({
      where: { id },
      select: { id: true, productId: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Clearance deal not found' });
    }

    await prisma.spotSale.delete({ where: { id } });

    logAudit({
      actorId: adminId,
      actorEmail: req.user!.email,
      action: 'spot-sale.delete',
      targetType: 'SpotSale',
      targetId: id,
      metadata: { productId: existing.productId },
      ip: getRequestIp(req),
    });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, '[SPOT-SALES] Delete error');
    res.status(500).json({ error: 'Failed to delete clearance deal' });
  }
});

/**
 * POST /api/spot-sales/admin/:id/record-sale
 * Record a completed clearance sale — creates Transaction, decrements inventory, updates intelligence.
 */
adminRouter.post('/:id/record-sale', validateParams(idParamsSchema), validate(recordSpotSaleSchema), async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;
  const admin = req.user!;
  const { buyerId, quantity } = req.body;

  try {
    // 1. Validate clearance deal exists and is active + unexpired
    const spotSale = await prisma.spotSale.findUnique({
      where: { id },
      include: {
        product: {
          select: {
            id: true, name: true, category: true, sellerId: true,
            zohoProductId: true, gramsAvailable: true,
          },
        },
      },
    });

    if (!spotSale) return res.status(404).json({ error: 'Clearance deal not found' });

    if (!spotSale.active) {
      return res.status(400).json({ error: 'Clearance deal is not active' });
    }

    if (new Date(spotSale.expiresAt) <= new Date()) {
      return res.status(400).json({ error: 'Clearance deal has expired' });
    }

    // 2. Validate buyer exists and is approved
    const buyer = await prisma.user.findUnique({
      where: { id: buyerId },
      select: { id: true, email: true, companyName: true, zohoContactId: true, approved: true },
    });

    if (!buyer) return res.status(404).json({ error: 'Buyer not found' });
    if (!buyer.approved) return res.status(400).json({ error: 'Buyer is not approved' });

    // 3. Validate quantity
    const maxQty = spotSale.quantity ?? spotSale.product.gramsAvailable ?? Infinity;
    if (quantity > maxQty) {
      return res.status(400).json({ error: `Quantity exceeds available amount (max: ${maxQty}g)` });
    }

    // Get seller for Deal creation
    const seller = await prisma.user.findUnique({
      where: { id: spotSale.product.sellerId },
      select: { id: true, zohoContactId: true },
    });

    const totalValue = spotSale.spotPrice * quantity;

    // 4. Atomic transaction — create Transaction + update buyer metrics
    const [transaction] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          buyerId,
          sellerId: spotSale.product.sellerId,
          productId: spotSale.product.id,
          bidId: null,
          quantity,
          pricePerUnit: spotSale.spotPrice,
          totalValue,
          status: 'pending',
        },
      }),
      prisma.user.update({
        where: { id: buyerId },
        data: {
          lastTransactionDate: new Date(),
          transactionCount: { increment: 1 },
          totalTransactionValue: { increment: totalValue },
        },
      }),
    ]);

    // 5. Non-blocking side effects (all try-caught, same pattern as bid accept)

    // Notify buyer
    createNotification({
      userId: buyerId,
      type: 'BID_ACCEPTED',
      title: 'Clearance sale completed!',
      body: `Your clearance purchase of ${spotSale.product.name} (${quantity}g at $${spotSale.spotPrice.toFixed(2)}/g) has been recorded`,
      data: { productId: spotSale.product.id, transactionId: transaction.id },
    });

    // Resolve churn signals
    try {
      await churnDetectionService.resolveOnPurchase(buyerId, spotSale.product.category || undefined);
    } catch (e) { logger.error({ err: e instanceof Error ? e : { message: String(e) } }, '[SPOT-SALES] Churn resolve error'); }

    // Update market price
    try {
      if (spotSale.product.category) {
        await marketContextService.updateMarketPrice(spotSale.product.category, spotSale.spotPrice, quantity);
      }
    } catch (e) { logger.error({ err: e instanceof Error ? e : { message: String(e) } }, '[SPOT-SALES] Market price update error'); }

    // Decrement inventory locally + push to Zoho
    if (spotSale.product.gramsAvailable != null && spotSale.product.gramsAvailable > 0) {
      const newGrams = Math.max(0, spotSale.product.gramsAvailable - quantity);
      try {
        await pushProductUpdate(spotSale.product.id, { gramsAvailable: newGrams });
      } catch (e) { logger.error({ err: e instanceof Error ? e : { message: String(e) } }, '[SPOT-SALES] Inventory decrement failed'); }
    }

    // Create Zoho Deal (if enabled)
    try {
      const zohoDealId = await createDeal({
        productName: spotSale.product.name,
        buyerCompany: buyer.companyName,
        buyerZohoContactId: buyer.zohoContactId,
        sellerZohoContactId: seller?.zohoContactId ?? null,
        amount: totalValue,
        quantity,
      });
      if (zohoDealId) {
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: { zohoDealId },
        });
      }
    } catch (e) { logger.error({ err: e instanceof Error ? e : { message: String(e) } }, '[SPOT-SALES] Zoho Deal creation failed'); }

    // 6. Audit log
    logAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: 'spot-sale.record',
      targetType: 'SpotSale',
      targetId: id,
      metadata: { productId: spotSale.product.id, buyerId, quantity, totalValue, transactionId: transaction.id },
      ip: getRequestIp(req),
    });

    // 7. Return transaction ID
    res.json({ transaction: { id: transaction.id, status: transaction.status } });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[SPOT-SALES] Failed to record sale');
    res.status(500).json({ error: 'Failed to record clearance sale' });
  }
});

// ─── Buyer router ───

export const buyerRouter = Router();

/**
 * GET /api/spot-sales
 * Active + unexpired clearance deals with active products. Soonest-expiring first.
 */
buyerRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const now = new Date();

    // Clearance deals are admin-curated — show all active+unexpired regardless of product visibility
    const spotSales = await prisma.spotSale.findMany({
      where: {
        active: true,
        expiresAt: { gt: now },
      },
      include: {
        product: { select: productSelect },
      },
      orderBy: { expiresAt: 'asc' },
    });

    res.json({ spotSales });
  } catch (err) {
    logger.error({ err }, '[SPOT-SALES] Buyer list error');
    res.status(500).json({ error: 'Failed to fetch clearance deals' });
  }
});
