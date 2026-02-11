import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../index';

const router = Router();

/**
 * GET /api/marketplace/products
 * Browse products with filtering, search, and pagination.
 */
router.get('/products', async (req: Request, res: Response) => {
  const {
    category,
    type,
    certification,
    thcMin, thcMax,
    cbdMin, cbdMax,
    priceMin, priceMax,
    availability,
    cbdThcRatio,
    ratioTolerance,
    search,
    page = '1',
    limit = '20',
    sort = 'name',
    order = 'asc',
  } = req.query as Record<string, string | undefined>;

  const pageNum = Math.max(1, parseInt(page || '1', 10));
  const limitNum = Math.min(50, Math.max(1, parseInt(limit || '20', 10)));
  const skip = (pageNum - 1) * limitNum;

  // Build where clause
  const where: Prisma.ProductWhereInput = {
    isActive: true,
  };

  if (category) where.category = category;
  if (type) where.type = type;
  if (certification) where.certification = certification;

  if (thcMin || thcMax) {
    where.thcMax = {};
    if (thcMin) where.thcMax.gte = parseFloat(thcMin);
    if (thcMax) where.thcMax.lte = parseFloat(thcMax);
  }

  if (cbdMin || cbdMax) {
    where.cbdMax = {};
    if (cbdMin) where.cbdMax.gte = parseFloat(cbdMin);
    if (cbdMax) where.cbdMax.lte = parseFloat(cbdMax);
  }

  if (priceMin || priceMax) {
    where.pricePerUnit = {};
    if (priceMin) where.pricePerUnit.gte = parseFloat(priceMin);
    if (priceMax) where.pricePerUnit.lte = parseFloat(priceMax);
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
      const tolerance = ratioTolerance ? parseFloat(ratioTolerance) / 100 : 0.25; // default 25%
      const lowerRatio = targetRatio * (1 - tolerance);
      const upperRatio = targetRatio * (1 + tolerance);

      // Both CBD and THC must be present (non-null, > 0)
      // Then: lowerRatio <= cbdMax/thcMax <= upperRatio
      // Rewritten to avoid division: lowerRatio * thcMax <= cbdMax <= upperRatio * thcMax
      where.thcMax = { ...((where.thcMax as any) || {}), gt: 0 };
      where.cbdMax = { ...((where.cbdMax as any) || {}), gt: 0 };

      // We need raw filtering since Prisma can't do cross-column math.
      // We'll get IDs from a raw query and add them as an IN filter.
      const ratioProductIds: { id: string }[] = await prisma.$queryRawUnsafe(
        `SELECT id FROM "Product" WHERE "isActive" = true AND "thcMax" > 0 AND "cbdMax" > 0 AND ("cbdMax" / "thcMax") BETWEEN $1 AND $2`,
        lowerRatio,
        upperRatio,
      );
      const ids = ratioProductIds.map((r) => r.id);
      if (ids.length === 0) {
        // No products match — short-circuit
        return res.json({ products: [], pagination: { page: 1, limit: limitNum, total: 0, totalPages: 0 } });
      }
      where.id = { in: ids };
    }
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { lineage: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  // Build orderBy
  const validSortFields = ['name', 'pricePerUnit', 'thcMax', 'cbdMax', 'gramsAvailable', 'createdAt'];
  const sortField = validSortFields.includes(sort || '') ? sort! : 'name';
  const sortOrder = order === 'desc' ? 'desc' : 'asc';
  const orderBy: Prisma.ProductOrderByWithRelationInput = { [sortField]: sortOrder };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      skip,
      take: limitNum,
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

  res.json({
    products,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
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

  res.json({ product: productData, canViewCoa });
});

/**
 * GET /api/marketplace/filters
 * Returns available filter options (distinct values from active products).
 */
router.get('/filters', async (_req: Request, res: Response) => {
  const [categories, types, certifications] = await Promise.all([
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
      distinct: ['certification'],
      select: { certification: true },
    }),
  ]);

  res.json({
    categories: categories.map((c) => c.category).filter(Boolean),
    types: types.map((t) => t.type).filter(Boolean),
    certifications: certifications.map((c) => c.certification).filter(Boolean),
  });
});

export default router;
