/**
 * Shortlist Routes
 * Toggle, list, check, and count shortlisted products for buyers.
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import logger from '../utils/logger';
import {
  validate,
  validateQuery,
  shortlistToggleSchema,
  shortlistQuerySchema,
  shortlistCheckSchema,
} from '../utils/validation';

const router = Router();

/**
 * POST /api/shortlist/toggle
 * Add or remove a product from the buyer's shortlist.
 */
router.post('/toggle', validate(shortlistToggleSchema), async (req: Request, res: Response) => {
  const buyerId = req.user!.id;
  const { productId } = req.body;

  // Verify product exists
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  // Check if already shortlisted
  const existing = await prisma.shortlistItem.findUnique({
    where: { buyerId_productId: { buyerId, productId } },
  });

  if (existing) {
    // Remove
    await prisma.shortlistItem.delete({
      where: { id: existing.id },
    });
    return res.json({ shortlisted: false });
  }

  // Add
  await prisma.shortlistItem.create({
    data: { buyerId, productId },
  });

  res.json({ shortlisted: true });
});

/**
 * GET /api/shortlist
 * Paginated list of shortlisted products.
 */
router.get('/', validateQuery(shortlistQuerySchema), async (req: Request, res: Response) => {
  const buyerId = req.user!.id;
  const { page, limit, category, sort, order } = req.query as any;

  const where: any = { buyerId };
  if (category) {
    where.product = { category };
  }

  // Map sort field to Prisma orderBy
  let orderBy: any;
  switch (sort) {
    case 'name':
      orderBy = { product: { name: order } };
      break;
    case 'price':
      orderBy = { product: { pricePerUnit: order } };
      break;
    case 'date':
    default:
      orderBy = { createdAt: order };
      break;
  }

  try {
    const [items, total] = await Promise.all([
      prisma.shortlistItem.findMany({
        where,
        include: {
          product: {
            select: {
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
            },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.shortlistItem.count({ where }),
    ]);

    res.json({
      items: items.map((item) => ({
        ...item.product,
        shortlistedAt: item.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    logger.error({ err }, '[SHORTLIST] List error');
    res.status(500).json({ error: 'Failed to fetch shortlist' });
  }
});

/**
 * GET /api/shortlist/check?productIds=a,b,c
 * Bulk check which products are shortlisted.
 */
router.get('/check', validateQuery(shortlistCheckSchema), async (req: Request, res: Response) => {
  const buyerId = req.user!.id;
  const productIdsRaw = (req.query as any).productIds as string;
  const productIds = productIdsRaw.split(',').map((id: string) => id.trim()).filter(Boolean);

  if (productIds.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 product IDs allowed' });
  }

  try {
    const items = await prisma.shortlistItem.findMany({
      where: { buyerId, productId: { in: productIds } },
      select: { productId: true },
    });

    const shortlistedSet = new Set(items.map((i) => i.productId));
    const result: Record<string, boolean> = {};
    for (const id of productIds) {
      result[id] = shortlistedSet.has(id);
    }

    res.json({ shortlisted: result });
  } catch (err) {
    logger.error({ err }, '[SHORTLIST] Check error');
    res.status(500).json({ error: 'Failed to check shortlist' });
  }
});

/**
 * GET /api/shortlist/count
 * Total shortlist count for the current buyer.
 */
router.get('/count', async (req: Request, res: Response) => {
  const buyerId = req.user!.id;

  try {
    const count = await prisma.shortlistItem.count({ where: { buyerId } });
    res.json({ count });
  } catch (err) {
    logger.error({ err }, '[SHORTLIST] Count error');
    res.status(500).json({ error: 'Failed to get shortlist count' });
  }
});

export default router;
