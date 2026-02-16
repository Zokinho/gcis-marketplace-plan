import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../index';
import { validateQuery, marketplaceQuerySchema } from '../utils/validation';
import { get30DayAvgPricesBatch, scorePriceVsMarket } from '../services/marketContextService';
import { getSignedFileUrl, isS3Configured } from '../utils/s3';
import logger from '../utils/logger';

const router = Router();

const PRICED_TO_SELL_THRESHOLD = 0.15; // 15% below 30-day category average

/**
 * GET /api/marketplace/products
 * Browse products with filtering, search, and pagination.
 */
router.get('/products', validateQuery(marketplaceQuerySchema), async (req: Request, res: Response) => {
  const {
    category,
    type,
    certification,
    terpene,
    thcMin, thcMax,
    cbdMin, cbdMax,
    priceMin, priceMax,
    availability,
    cbdThcRatio,
    ratioTolerance,
    search,
    page,
    limit,
    sort,
    order,
  } = req.query as any;

  const pageNum = page as number;
  const limitNum = limit as number;
  const skip = (pageNum - 1) * limitNum;

  // Build where clause
  const where: Prisma.ProductWhereInput = {
    isActive: true,
  };

  if (category) where.category = category;
  if (type) where.type = type;
  if (certification) {
    const certs = certification.split(',').map((c: string) => c.trim()).filter(Boolean);
    if (certs.length === 1) {
      where.certification = { contains: certs[0], mode: 'insensitive' };
    } else if (certs.length > 1) {
      where.AND = [
        ...((where.AND as any[]) || []),
        ...certs.map((c: string) => ({ certification: { contains: c, mode: 'insensitive' as const } })),
      ];
    }
  }

  // Terpene filter — matches against semicolon-separated dominantTerpene field
  if (terpene) {
    const terpenes = terpene.split(',').map((t: string) => t.trim()).filter(Boolean);
    if (terpenes.length > 0) {
      where.AND = terpenes.map((t: string) => ({
        dominantTerpene: { contains: t, mode: 'insensitive' as const },
      }));
    }
  }

  if (thcMin != null || thcMax != null) {
    where.thcMax = {};
    if (thcMin != null) where.thcMax.gte = thcMin;
    if (thcMax != null) where.thcMax.lte = thcMax;
  }

  if (cbdMin != null || cbdMax != null) {
    where.cbdMax = {};
    if (cbdMin != null) where.cbdMax.gte = cbdMin;
    if (cbdMax != null) where.cbdMax.lte = cbdMax;
  }

  if (priceMin != null || priceMax != null) {
    where.pricePerUnit = {};
    if (priceMin != null) where.pricePerUnit.gte = priceMin;
    if (priceMax != null) where.pricePerUnit.lte = priceMax;
  }

  if (availability === 'in_stock') {
    where.gramsAvailable = { gt: 0 };
  } else if (availability === 'upcoming') {
    where.upcomingQty = { gt: 0 };
  }

  // CBD:THC ratio filter — e.g. "1:1", "2:1", "1:2"
  if (cbdThcRatio) {
    const [cbdPart, thcPart] = cbdThcRatio.split(':').map(Number);
    if (cbdPart > 0 && thcPart > 0) {
      const targetRatio = cbdPart / thcPart; // CBD / THC
      const tolerance = ratioTolerance != null ? ratioTolerance / 100 : 0.25; // default 25%
      const lowerRatio = targetRatio * (1 - tolerance);
      const upperRatio = targetRatio * (1 + tolerance);

      // Both CBD and THC must be present (non-null, > 0)
      // Then: lowerRatio <= cbdMax/thcMax <= upperRatio
      // Rewritten to avoid division: lowerRatio * thcMax <= cbdMax <= upperRatio * thcMax
      where.thcMax = { ...((where.thcMax as any) || {}), gt: 0 };
      where.cbdMax = { ...((where.cbdMax as any) || {}), gt: 0 };

      // We need raw filtering since Prisma can't do cross-column math.
      // We'll get IDs from a raw query and add them as an IN filter.
      const ratioProductIds: { id: string }[] = await prisma.$queryRaw`
        SELECT id FROM "Product" WHERE "isActive" = true AND "thcMax" > 0 AND "cbdMax" > 0 AND ("cbdMax" / "thcMax") BETWEEN ${lowerRatio} AND ${upperRatio}
      `;
      const ids = ratioProductIds.map((r) => r.id);
      if (ids.length === 0) {
        // No products match — short-circuit
        return res.json({ products: [], pagination: { page: 1, limit: limitNum, total: 0, totalPages: 0 } });
      }
      where.id = { in: ids };
    }
  }

  // Full-text search: use tsvector for terms >= 3 chars, fallback to ILIKE for shorter
  let ftsOrderedIds: string[] | null = null;

  if (search) {
    if (search.length >= 3) {
      const ftsResults: { id: string }[] = await prisma.$queryRaw`
        SELECT id FROM "Product"
        WHERE "search_vector" @@ plainto_tsquery('english', ${search})
        ORDER BY ts_rank("search_vector", plainto_tsquery('english', ${search})) DESC
      `;
      const ids = ftsResults.map((r) => r.id);
      if (ids.length === 0) {
        // FTS found nothing — fall back to ILIKE so partial matches still work
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { lineage: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      } else {
        where.id = { ...((where.id as any) || {}), in: ids };
        ftsOrderedIds = ids;
      }
    } else {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { lineage: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
  }

  // Build orderBy
  const useRelevanceSort = sort === 'relevance' && ftsOrderedIds !== null;
  const sortField = sort === 'relevance' ? 'name' : sort;
  const sortOrder = order;
  const orderBy: Prisma.ProductOrderByWithRelationInput | undefined = useRelevanceSort
    ? undefined
    : { [sortField]: sortOrder };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      ...(orderBy ? { orderBy } : {}),
      skip: useRelevanceSort ? undefined : skip,
      take: useRelevanceSort ? undefined : limitNum,
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
        imageUrls: true,
        isActive: true,
        matchCount: true,
      },
    }),
    prisma.product.count({ where }),
  ]);

  // When using relevance sort, re-order by FTS rank and paginate manually
  let finalProducts = products;
  let finalTotal = total;
  if (useRelevanceSort && ftsOrderedIds) {
    const idOrder = new Map(ftsOrderedIds.map((id, i) => [id, i]));
    finalProducts = [...products].sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));
    finalTotal = finalProducts.length;
    finalProducts = finalProducts.slice(skip, skip + limitNum);
  }

  // Enrich with pricedToSell badge
  const categories = [...new Set(finalProducts.map((p) => p.category).filter(Boolean))] as string[];
  const avgPrices = categories.length > 0 ? await get30DayAvgPricesBatch(categories) : new Map<string, number>();

  const enrichedProducts = finalProducts.map((p) => {
    let pricedToSell = false;
    if (p.pricePerUnit != null && p.category) {
      const avgPrice = avgPrices.get(p.category);
      if (avgPrice != null) {
        pricedToSell = p.pricePerUnit < avgPrice * (1 - PRICED_TO_SELL_THRESHOLD);
      }
    }
    return { ...p, pricedToSell };
  });

  res.json({
    products: enrichedProducts,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: useRelevanceSort ? finalTotal : total,
      totalPages: Math.ceil((useRelevanceSort ? finalTotal : total) / limitNum),
    },
  });
});

/**
 * GET /api/marketplace/products/:id
 * Full product detail.
 */
router.get('/products/:id', async (req: Request<{ id: string }>, res: Response) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      zohoProductId: true,
      productCode: true,
      name: true,
      description: true,
      category: true,
      type: true,
      growthMedium: true,
      lineage: true,
      harvestDate: true,
      isActive: true,
      requestPending: true,
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
      source: true,
      matchCount: true,
      createdAt: true,
      updatedAt: true,
      sellerId: true,
      seller: {
        select: {
          avgFulfillmentScore: true,
        },
      },
    },
  });

  if (!product || !product.isActive) {
    return res.status(404).json({ error: 'Product not found' });
  }

  // Fire-and-forget view tracking (5-minute dedup)
  if (req.user?.id) {
    (async () => {
      try {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        const recentView = await prisma.productView.findFirst({
          where: { buyerId: req.user!.id, productId: req.params.id, viewedAt: { gte: fiveMinAgo } },
        });
        if (!recentView) {
          await prisma.productView.create({ data: { buyerId: req.user!.id, productId: req.params.id } });
        }
      } catch (err) {
        logger.error({ err: err instanceof Error ? err : { message: String(err) } }, '[MARKETPLACE] View tracking error');
      }
    })();
  }

  // CoA visibility: only product owner or admins can see CoA data
  const isOwner = req.user?.id === product.sellerId;
  const isSeller = req.user?.contactType?.includes('Seller') ?? false;
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  const isAdminEmail = req.user?.email ? adminEmails.includes(req.user.email.toLowerCase()) : false;
  const canViewCoa = isOwner || isSeller || isAdminEmail;

  const { sellerId, ...productData } = product;

  if (!canViewCoa) {
    productData.coaUrls = [];
    productData.coaPdfUrl = null;
    productData.labName = null;
    productData.testDate = null;
    productData.reportNumber = null;
    productData.testResults = null;
    productData.coaJobId = null;
    productData.coaProcessedAt = null;
  }

  // Enrich with pricedToSell badge
  let pricedToSell = false;
  if (productData.pricePerUnit != null && productData.category) {
    const priceComparison = await scorePriceVsMarket(req.params.id);
    if (priceComparison) {
      pricedToSell = priceComparison.percentDiff <= -(PRICED_TO_SELL_THRESHOLD * 100);
    }
  }

  // Admin-only: product view count + unique viewers + shortlist count
  let viewStats: { totalViews: number; uniqueViewers: number; shortlistCount: number } | undefined;
  if (isAdminEmail) {
    const [totalViews, uniqueViewerGroups, shortlistCount] = await Promise.all([
      prisma.productView.count({ where: { productId: req.params.id } }),
      prisma.productView.groupBy({ by: ['buyerId'], where: { productId: req.params.id } }),
      prisma.shortlistItem.count({ where: { productId: req.params.id } }),
    ]);
    viewStats = { totalViews, uniqueViewers: uniqueViewerGroups.length, shortlistCount };
  }

  res.json({ product: { ...productData, pricedToSell, viewStats }, canViewCoa });
});

/**
 * GET /api/marketplace/filters
 * Returns available filter options (distinct values from active products).
 */
router.get('/filters', async (_req: Request, res: Response) => {
  const [categories, types, certifications, terpeneProducts] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true, category: { not: null } },
      distinct: ['category'],
      select: { category: true },
    }),
    prisma.product.findMany({
      where: { isActive: true, type: { not: null } },
      distinct: ['type'],
      select: { type: true },
    }),
    prisma.product.findMany({
      where: { isActive: true, certification: { not: null } },
      select: { certification: true },
    }),
    prisma.product.findMany({
      where: { isActive: true, dominantTerpene: { not: null } },
      select: { dominantTerpene: true },
    }),
  ]);

  // Extract unique terpene names from semicolon-separated dominantTerpene fields
  const terpeneSet = new Set<string>();
  for (const p of terpeneProducts) {
    if (p.dominantTerpene) {
      for (const t of p.dominantTerpene.split(';')) {
        const trimmed = t.trim();
        if (trimmed) terpeneSet.add(trimmed);
      }
    }
  }

  // Extract unique certification names from comma-separated certification fields
  const certSet = new Set<string>();
  for (const c of certifications) {
    if (c.certification) {
      for (const cert of c.certification.split(',')) {
        const trimmed = cert.trim();
        if (trimmed) certSet.add(trimmed);
      }
    }
  }

  res.json({
    categories: categories.map((c) => c.category).filter(Boolean),
    types: types.map((t) => t.type).filter(Boolean),
    certifications: Array.from(certSet).sort(),
    terpenes: Array.from(terpeneSet).sort(),
  });
});

/**
 * GET /api/marketplace/file-url?key=...
 * Returns a time-limited presigned URL for an S3-stored file.
 */
router.get('/file-url', async (req: Request, res: Response) => {
  const key = req.query.key as string | undefined;

  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'Missing key parameter' });
  }

  // Validate key prefix to prevent arbitrary S3 key access
  if (!key.startsWith('products/') || key.includes('..')) {
    return res.status(403).json({ error: 'Invalid file key' });
  }

  if (!isS3Configured) {
    return res.status(404).json({ error: 'File storage not configured' });
  }

  try {
    const url = await getSignedFileUrl(key);
    if (!url) {
      return res.status(500).json({ error: 'Failed to generate file URL' });
    }
    res.json({ url });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) }, key }, '[MARKETPLACE] Presigned URL generation failed');
    res.status(500).json({ error: 'Failed to generate file URL' });
  }
});

export default router;
