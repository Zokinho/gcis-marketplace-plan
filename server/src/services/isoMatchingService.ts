import { prisma } from '../index';
import logger from '../utils/logger';
import { createNotification } from './notificationService';
import { marketplaceVisibleWhere } from '../utils/marketplaceVisibility';

interface MatchResult {
  productId: string;
  productName: string;
  score: number;
  breakdown: Record<string, number>;
}

/**
 * Score all active marketplace products against one ISO request.
 * Returns top 5 matches above the threshold (score >= 60).
 */
export async function matchIsoToProducts(isoRequestId: string): Promise<MatchResult[]> {
  const iso = await prisma.isoRequest.findUnique({
    where: { id: isoRequestId },
  });

  if (!iso || iso.status !== 'OPEN') return [];

  const products = await prisma.product.findMany({
    where: {
      ...marketplaceVisibleWhere(),
      isActive: true,
    },
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
    },
  });

  const results: MatchResult[] = [];

  for (const p of products) {
    const breakdown: Record<string, number> = {};

    // Category match (25%)
    if (iso.category && p.category) {
      breakdown.category = p.category.toLowerCase() === iso.category.toLowerCase() ? 25 : 0;
    } else {
      breakdown.category = iso.category ? 0 : 25; // no filter = full score
    }

    // Type match (15%)
    if (iso.type && p.type) {
      breakdown.type = p.type.toLowerCase() === iso.type.toLowerCase() ? 15 : 0;
    } else {
      breakdown.type = iso.type ? 0 : 15;
    }

    // THC fit (15%)
    if (iso.thcMin !== null || iso.thcMax !== null) {
      const productThc = p.thcMax ?? p.thcMin ?? null;
      if (productThc !== null) {
        const inMin = iso.thcMin === null || productThc >= iso.thcMin;
        const inMax = iso.thcMax === null || productThc <= iso.thcMax;
        breakdown.thcFit = inMin && inMax ? 15 : 0;
      } else {
        breakdown.thcFit = 0;
      }
    } else {
      breakdown.thcFit = 15;
    }

    // CBD fit (10%)
    if (iso.cbdMin !== null || iso.cbdMax !== null) {
      const productCbd = p.cbdMax ?? p.cbdMin ?? null;
      if (productCbd !== null) {
        const inMin = iso.cbdMin === null || productCbd >= iso.cbdMin;
        const inMax = iso.cbdMax === null || productCbd <= iso.cbdMax;
        breakdown.cbdFit = inMin && inMax ? 10 : 0;
      } else {
        breakdown.cbdFit = 0;
      }
    } else {
      breakdown.cbdFit = 10;
    }

    // Price fit (15%)
    if (iso.budgetMax !== null && p.pricePerUnit !== null) {
      breakdown.priceFit = p.pricePerUnit <= iso.budgetMax ? 15 : 0;
    } else {
      breakdown.priceFit = iso.budgetMax !== null ? 0 : 15;
    }

    // Quantity fit (10%)
    if ((iso.quantityMin !== null || iso.quantityMax !== null) && p.gramsAvailable !== null) {
      const inMin = iso.quantityMin === null || p.gramsAvailable >= iso.quantityMin;
      const inMax = iso.quantityMax === null || p.gramsAvailable <= iso.quantityMax;
      breakdown.quantityFit = inMin && inMax ? 10 : 0;
    } else {
      breakdown.quantityFit = (iso.quantityMin !== null || iso.quantityMax !== null) ? 0 : 10;
    }

    // Certification match (10%)
    if (iso.certification && p.certification) {
      breakdown.certificationMatch = p.certification.toLowerCase().includes(iso.certification.toLowerCase()) ? 10 : 0;
    } else {
      breakdown.certificationMatch = iso.certification ? 0 : 10;
    }

    const score = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

    if (score >= 60) {
      results.push({ productId: p.id, productName: p.name, score, breakdown });
    }
  }

  // Sort by score descending, return top 5
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 5);
}

/**
 * Called when a new product is synced or listed — score against all OPEN ISOs.
 * Fires ISO_MATCH_FOUND notifications to ISO buyers for matches above threshold.
 * Returns count of matches found.
 */
export async function matchProductToOpenIsos(productId: string): Promise<number> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
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
    },
  });

  if (!product) return 0;

  const openIsos = await prisma.isoRequest.findMany({
    where: {
      status: 'OPEN',
      expiresAt: { gt: new Date() },
    },
  });

  let matchCount = 0;

  for (const iso of openIsos) {
    const score = scoreProductAgainstIso(product, iso);

    if (score >= 60) {
      matchCount++;

      // Update the ISO's matched product if this is the top match
      if (!iso.matchedProductId) {
        await prisma.isoRequest.update({
          where: { id: iso.id },
          data: { matchedProductId: product.id, status: 'MATCHED' },
        }).catch(() => {}); // Fire-and-forget
      }

      // Notify the ISO buyer
      createNotification({
        userId: iso.buyerId,
        type: 'ISO_MATCH_FOUND',
        title: 'ISO Match Found',
        body: `A product matching your request may be available: ${product.name}`,
        data: { isoRequestId: iso.id, productId: product.id, score },
      });
    }
  }

  if (matchCount > 0) {
    logger.info({ productId, matchCount }, '[ISO-MATCH] Product matched against open ISOs');
  }

  return matchCount;
}

/**
 * Score a single product against a single ISO request.
 */
function scoreProductAgainstIso(
  product: {
    category: string | null;
    type: string | null;
    certification: string | null;
    thcMin: number | null;
    thcMax: number | null;
    cbdMin: number | null;
    cbdMax: number | null;
    pricePerUnit: number | null;
    gramsAvailable: number | null;
  },
  iso: {
    category: string | null;
    type: string | null;
    certification: string | null;
    thcMin: number | null;
    thcMax: number | null;
    cbdMin: number | null;
    cbdMax: number | null;
    budgetMax: number | null;
    quantityMin: number | null;
    quantityMax: number | null;
  },
): number {
  let score = 0;

  // Category match (25%)
  if (iso.category) {
    if (product.category && product.category.toLowerCase() === iso.category.toLowerCase()) score += 25;
  } else {
    score += 25;
  }

  // Type match (15%)
  if (iso.type) {
    if (product.type && product.type.toLowerCase() === iso.type.toLowerCase()) score += 15;
  } else {
    score += 15;
  }

  // THC fit (15%)
  if (iso.thcMin !== null || iso.thcMax !== null) {
    const productThc = product.thcMax ?? product.thcMin ?? null;
    if (productThc !== null) {
      const inMin = iso.thcMin === null || productThc >= iso.thcMin;
      const inMax = iso.thcMax === null || productThc <= iso.thcMax;
      if (inMin && inMax) score += 15;
    }
  } else {
    score += 15;
  }

  // CBD fit (10%)
  if (iso.cbdMin !== null || iso.cbdMax !== null) {
    const productCbd = product.cbdMax ?? product.cbdMin ?? null;
    if (productCbd !== null) {
      const inMin = iso.cbdMin === null || productCbd >= iso.cbdMin;
      const inMax = iso.cbdMax === null || productCbd <= iso.cbdMax;
      if (inMin && inMax) score += 10;
    }
  } else {
    score += 10;
  }

  // Price fit (15%)
  if (iso.budgetMax !== null) {
    if (product.pricePerUnit !== null && product.pricePerUnit <= iso.budgetMax) score += 15;
  } else {
    score += 15;
  }

  // Quantity fit (10%)
  if (iso.quantityMin !== null || iso.quantityMax !== null) {
    if (product.gramsAvailable !== null) {
      const inMin = iso.quantityMin === null || product.gramsAvailable >= iso.quantityMin;
      const inMax = iso.quantityMax === null || product.gramsAvailable <= iso.quantityMax;
      if (inMin && inMax) score += 10;
    }
  } else {
    score += 10;
  }

  // Certification match (10%)
  if (iso.certification) {
    if (product.certification && product.certification.toLowerCase().includes(iso.certification.toLowerCase())) score += 10;
  } else {
    score += 10;
  }

  return score;
}
