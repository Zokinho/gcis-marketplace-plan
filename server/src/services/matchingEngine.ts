/**
 * Matching Engine Service
 * Scores potential buyer-product matches based on 10 weighted factors
 * Adapted from deal-intelligence (removed tenantId, custom attributes, deal velocity)
 */

import { prisma } from '../index';
import * as sellerScoreService from './sellerScoreService';
import * as marketContextService from './marketContextService';
import * as propensityService from './propensityService';

interface ScoreBreakdown {
  category: number;
  priceFit: number;
  location: number;
  relationshipHistory: number;
  reorderTiming: number;
  quantityFit: number;
  sellerReliability: number;
  priceVsMarket: number;
  supplyDemand: number;
  buyerPropensity: number;
}

interface Insight {
  type: 'positive' | 'neutral' | 'urgent' | 'warning';
  text: string;
}

interface MatchResult {
  score: number;
  breakdown: ScoreBreakdown;
  insights: Insight[];
}

const WEIGHTS: Record<string, number> = {
  category: 0.15,
  priceFit: 0.12,
  location: 0.05,
  relationshipHistory: 0.10,
  reorderTiming: 0.10,
  quantityFit: 0.08,
  sellerReliability: 0.10,
  priceVsMarket: 0.10,
  supplyDemand: 0.05,
  buyerPropensity: 0.15,
};

const MATCH_THRESHOLD = 50;

async function scoreCategoryMatch(buyerId: string, category: string | null): Promise<number> {
  if (!category) return 50;

  const categoryTransactions = await prisma.transaction.count({
    where: { buyerId, product: { category } },
  });

  if (categoryTransactions >= 5) return 95;
  if (categoryTransactions >= 2) return 80;
  if (categoryTransactions === 1) return 65;

  // Check if buyer has bid on this category
  const categoryBids = await prisma.bid.count({
    where: { buyerId, product: { category } },
  });

  if (categoryBids >= 3) return 70;
  if (categoryBids >= 1) return 55;
  return 30;
}

async function scorePriceFit(buyerId: string, productPrice: number | null, category: string | null): Promise<number> {
  if (!productPrice || !category) return 50;

  const avgPrice = await prisma.transaction.aggregate({
    where: { buyerId, product: { category }, totalValue: { gt: 0 }, quantity: { gt: 0 } },
    _sum: { quantity: true, totalValue: true },
  });

  if (!avgPrice._sum.totalValue || !avgPrice._sum.quantity) return 50;

  const avgUnitPrice = avgPrice._sum.totalValue / avgPrice._sum.quantity;
  const priceDiff = (productPrice - avgUnitPrice) / avgUnitPrice;

  if (priceDiff <= -0.15) return 100;
  if (priceDiff <= -0.05) return 90;
  if (priceDiff <= 0.05) return 80;
  if (priceDiff <= 0.15) return 60;
  if (priceDiff <= 0.30) return 40;
  return 20;
}

function scoreLocationMatch(buyerCountry: string | null, sellerCountry: string | null): number {
  if (!buyerCountry || !sellerCountry) return 50;

  const b = buyerCountry.toLowerCase().trim();
  const s = sellerCountry.toLowerCase().trim();

  if (b === s) return 100;

  const bParts = b.split(/[,\s]+/).filter(Boolean);
  const sParts = s.split(/[,\s]+/).filter(Boolean);
  const commonParts = bParts.filter(part => sParts.some(sp => sp.includes(part) || part.includes(sp)));

  if (commonParts.length >= 2) return 80;
  if (commonParts.length >= 1) return 60;
  return 30;
}

async function scoreRelationshipHistory(buyerId: string, sellerId: string): Promise<number> {
  const pastTransactions = await prisma.transaction.count({
    where: { buyerId, sellerId },
  });

  if (pastTransactions >= 5) return 100;
  if (pastTransactions >= 3) return 90;
  if (pastTransactions >= 2) return 80;
  if (pastTransactions === 1) return 60;
  return 30;
}

async function scoreReorderTiming(buyerId: string, category: string | null): Promise<number> {
  if (!category) return 50;

  const prediction = await prisma.prediction.findFirst({
    where: { buyerId, categoryName: category },
  });

  if (!prediction) {
    const buyer = await prisma.user.findUnique({
      where: { id: buyerId },
      select: { lastTransactionDate: true },
    });
    if (buyer?.lastTransactionDate) {
      const daysSince = Math.floor((Date.now() - new Date(buyer.lastTransactionDate).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince > 60) return 70;
      if (daysSince > 30) return 50;
      return 30;
    }
    return 40;
  }

  const daysUntil = Math.floor(
    (new Date(prediction.predictedDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntil <= 0) return 100;
  if (daysUntil <= 7) return 90;
  if (daysUntil <= 14) return 75;
  if (daysUntil <= 30) return 50;
  return 25;
}

async function scoreQuantityFit(buyerId: string, gramsAvailable: number | null, category: string | null): Promise<number> {
  if (!gramsAvailable || !category) return 50;

  const avgQuantity = await prisma.transaction.aggregate({
    where: { buyerId, product: { category }, quantity: { gt: 0 } },
    _avg: { quantity: true },
  });

  if (!avgQuantity._avg.quantity) return 50;

  const qtyRatio = gramsAvailable / avgQuantity._avg.quantity;
  if (qtyRatio >= 0.8 && qtyRatio <= 1.2) return 100;
  if (qtyRatio >= 0.5 && qtyRatio <= 2.0) return 75;
  if (qtyRatio >= 0.25 && qtyRatio <= 4.0) return 50;
  return 25;
}

async function scoreSellerReliability(sellerId: string): Promise<number> {
  try {
    const scores = await sellerScoreService.calculateSellerScores(sellerId);
    if (scores.transactionsScored === 0) return 50;
    return Math.round(scores.overallScore);
  } catch {
    return 50;
  }
}

async function scorePriceVsMarket(productId: string): Promise<number> {
  try {
    const priceScore = await marketContextService.scorePriceVsMarket(productId);
    if (!priceScore) return 50;
    return Math.round(priceScore.score);
  } catch {
    return 50;
  }
}

async function scoreSupplyDemand(productId: string): Promise<number> {
  try {
    const sd = await marketContextService.scoreSupplyDemand(productId);
    if (!sd) return 50;
    return Math.round(sd.score);
  } catch {
    return 50;
  }
}

async function scoreBuyerPropensity(buyerId: string, category: string | null): Promise<number> {
  try {
    const propensity = await propensityService.getPropensity(buyerId, category || undefined);
    return Math.round(propensity.overallScore);
  } catch {
    return 50;
  }
}

function calculateWeightedScore(scores: ScoreBreakdown): number {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const [factor, score] of Object.entries(scores)) {
    const weight = WEIGHTS[factor] || 0.05;
    totalWeight += weight;
    weightedSum += score * weight;
  }

  return Math.round(weightedSum / totalWeight);
}

async function generateInsights(
  buyerId: string,
  sellerId: string,
  scores: ScoreBreakdown
): Promise<Insight[]> {
  const insights: Insight[] = [];

  if (scores.relationshipHistory >= 80) {
    const count = await prisma.transaction.count({ where: { buyerId, sellerId } });
    insights.push({ type: 'positive', text: `${count} previous transactions with this seller` });
  }

  if (scores.reorderTiming >= 90) {
    insights.push({
      type: 'urgent',
      text: scores.reorderTiming === 100 ? 'Buyer is overdue for reorder' : 'Buyer due to reorder soon',
    });
  }

  if (scores.priceFit >= 90) {
    insights.push({ type: 'positive', text: "Priced below buyer's typical spend" });
  } else if (scores.priceFit <= 40) {
    insights.push({ type: 'warning', text: 'Price higher than buyer typically pays' });
  }

  if (scores.category >= 95) {
    insights.push({ type: 'positive', text: 'Strong category purchase history' });
  }

  if (scores.quantityFit >= 90) {
    insights.push({ type: 'positive', text: 'Quantity matches typical order size' });
  }

  if (scores.location >= 80) {
    insights.push({ type: 'positive', text: 'Same region as buyer' });
  }

  if (scores.sellerReliability >= 80) {
    insights.push({ type: 'positive', text: 'Highly rated seller' });
  } else if (scores.sellerReliability <= 40 && scores.sellerReliability > 0) {
    insights.push({ type: 'warning', text: 'Seller has lower reliability score' });
  }

  if (scores.priceVsMarket >= 80) {
    insights.push({ type: 'positive', text: 'Price below market average' });
  } else if (scores.priceVsMarket <= 30) {
    insights.push({ type: 'warning', text: 'Price above market average' });
  }

  if (scores.supplyDemand >= 75) {
    insights.push({ type: 'urgent', text: 'High demand category' });
  }

  if (scores.buyerPropensity >= 80) {
    insights.push({ type: 'positive', text: 'High propensity buyer' });
  } else if (scores.buyerPropensity <= 30) {
    insights.push({ type: 'warning', text: 'Lower engagement buyer' });
  }

  return insights;
}

export async function scoreMatch(buyerId: string, productId: string): Promise<MatchResult> {
  const [product, buyer] = await Promise.all([
    prisma.product.findUnique({
      where: { id: productId },
      include: { seller: { select: { id: true, mailingCountry: true } } },
    }),
    prisma.user.findUnique({
      where: { id: buyerId },
      select: { id: true, mailingCountry: true, lastTransactionDate: true, transactionCount: true },
    }),
  ]);

  if (!product || !buyer) {
    return { score: 0, breakdown: {} as ScoreBreakdown, insights: [] };
  }

  const scores: ScoreBreakdown = {
    category: await scoreCategoryMatch(buyerId, product.category),
    priceFit: await scorePriceFit(buyerId, product.pricePerUnit, product.category),
    location: scoreLocationMatch(buyer.mailingCountry, product.seller?.mailingCountry || null),
    relationshipHistory: await scoreRelationshipHistory(buyerId, product.sellerId),
    reorderTiming: await scoreReorderTiming(buyerId, product.category),
    quantityFit: await scoreQuantityFit(buyerId, product.gramsAvailable, product.category),
    sellerReliability: await scoreSellerReliability(product.sellerId),
    priceVsMarket: await scorePriceVsMarket(productId),
    supplyDemand: await scoreSupplyDemand(productId),
    buyerPropensity: await scoreBuyerPropensity(buyerId, product.category),
  };

  const totalScore = calculateWeightedScore(scores);
  const insights = await generateInsights(buyerId, product.sellerId, scores);

  return { score: totalScore, breakdown: scores, insights };
}

export async function generateMatchesForProduct(productId: string): Promise<number> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, sellerId: true, isActive: true },
  });

  if (!product || !product.isActive) return 0;

  // Get all active buyers (excluding the seller)
  const buyers = await prisma.user.findMany({
    where: {
      approved: true,
      id: { not: product.sellerId },
    },
    select: { id: true },
  });

  let matchCount = 0;

  for (const buyer of buyers) {
    try {
      const result = await scoreMatch(buyer.id, productId);

      if (result.score >= MATCH_THRESHOLD) {
        await prisma.match.upsert({
          where: { buyerId_productId: { buyerId: buyer.id, productId } },
          create: {
            buyerId: buyer.id,
            productId,
            score: result.score,
            breakdown: result.breakdown as any,
            insights: result.insights as any,
            status: 'pending',
          },
          update: {
            score: result.score,
            breakdown: result.breakdown as any,
            insights: result.insights as any,
            status: 'pending',
          },
        });
        matchCount++;
      }
    } catch (error) {
      console.error(`[MATCHING] Error scoring match for buyer ${buyer.id}:`, error);
    }
  }

  await prisma.product.update({
    where: { id: productId },
    data: { matchCount },
  });

  return matchCount;
}

export async function regenerateAllMatches(): Promise<{ products: number; matches: number }> {
  const activeProducts = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  let totalMatches = 0;

  for (const product of activeProducts) {
    const matchCount = await generateMatchesForProduct(product.id);
    totalMatches += matchCount;
  }

  return { products: activeProducts.length, matches: totalMatches };
}
