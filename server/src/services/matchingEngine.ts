/**
 * Matching Engine Service
 * Scores potential buyer-product matches based on 10 weighted factors
 * Adapted from deal-intelligence (removed tenantId, custom attributes, deal velocity)
 */

import { prisma } from '../index';
import * as sellerScoreService from './sellerScoreService';
import * as marketContextService from './marketContextService';
import * as propensityService from './propensityService';
import logger from '../utils/logger';
import { createNotification } from './notificationService';
import { isProductMarketplaceVisible, marketplaceVisibleWhere } from '../utils/marketplaceVisibility';

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

  // Check if buyer has shortlisted products in this category
  const categoryShortlists = await prisma.shortlistItem.count({
    where: { buyerId, product: { category } },
  });

  if (categoryShortlists >= 3) return 50;
  if (categoryShortlists >= 1) return 42;

  // Check if buyer has viewed products in this category
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const categoryViews = await prisma.productView.count({
    where: { buyerId, product: { category }, viewedAt: { gte: thirtyDaysAgo } },
  });
  if (categoryViews >= 5) return 40;
  if (categoryViews >= 1) return 35;

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

  let baseScore: number;
  if (priceDiff <= -0.15) baseScore = 100;
  else if (priceDiff <= -0.05) baseScore = 90;
  else if (priceDiff <= 0.05) baseScore = 80;
  else if (priceDiff <= 0.15) baseScore = 60;
  else if (priceDiff <= 0.30) baseScore = 40;
  else baseScore = 20;

  // Elasticity adjustment — modify score based on buyer's bid-to-ask ratio history
  try {
    const elasticity = await calculateBidElasticity(buyerId);
    if (elasticity && elasticity.sampleSize >= 3) {
      if (elasticity.elasticityScore < 40 && priceDiff >= 0) {
        // Aggressive buyer (low elasticity) + product at/above market → penalize
        baseScore = Math.max(0, baseScore - 10);
      } else if (elasticity.elasticityScore >= 70 && priceDiff <= -0.05) {
        // High-elasticity buyer + discounted product → boost
        baseScore = Math.min(100, baseScore + 5);
      }
    }
  } catch {
    // Elasticity data unavailable — use base score
  }

  return baseScore;
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
  } else if (scores.category >= 42 && scores.category <= 50) {
    // Shortlist-driven category score — add insight
    insights.push({ type: 'positive', text: 'Buyer has shortlisted products in this category' });
  } else if (scores.category >= 35 && scores.category <= 40) {
    insights.push({ type: 'neutral', text: 'Buyer has viewed products in this category recently' });
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

// ─── Bid Elasticity Scoring ───

export async function calculateBidElasticity(buyerId: string): Promise<{
  avgRatio: number;
  stdDev: number;
  elasticityScore: number;
  sampleSize: number;
} | null> {
  const bids = await prisma.bid.findMany({
    where: { buyerId },
    include: { product: { select: { pricePerUnit: true } } },
  });

  const ratios: number[] = [];
  for (const bid of bids) {
    if (bid.product.pricePerUnit && bid.product.pricePerUnit > 0) {
      ratios.push(bid.pricePerUnit / bid.product.pricePerUnit);
    }
  }

  if (ratios.length < 2) return null;

  const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const variance = ratios.reduce((sum, r) => sum + (r - avgRatio) ** 2, 0) / ratios.length;
  const stdDev = Math.sqrt(variance);

  // Score: higher ratio = less aggressive = higher elasticity score
  let elasticityScore: number;
  if (avgRatio >= 0.95) elasticityScore = 90 + Math.min(10, (avgRatio - 0.95) * 200);
  else if (avgRatio >= 0.85) elasticityScore = 60 + (avgRatio - 0.85) * 300;
  else if (avgRatio >= 0.75) elasticityScore = 30 + (avgRatio - 0.75) * 300;
  else elasticityScore = Math.max(0, avgRatio * 40);

  return {
    avgRatio: Math.round(avgRatio * 1000) / 1000,
    stdDev: Math.round(stdDev * 1000) / 1000,
    elasticityScore: Math.round(Math.min(100, Math.max(0, elasticityScore))),
    sampleSize: ratios.length,
  };
}

// ─── Buyer Bid Stats ───

export async function getBuyerBidStats(buyerId: string): Promise<{
  totalBids: number;
  acceptedBids: number;
  rejectedBids: number;
  rejectionRate: number;
  avgProximityOnRejected: number | null;
  avgProximityOnAccepted: number | null;
  consecutiveRejectionsLast30d: number;
}> {
  const bids = await prisma.bid.findMany({
    where: { buyerId },
    select: { status: true, proximityScore: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  const totalBids = bids.length;
  const acceptedBids = bids.filter(b => b.status === 'ACCEPTED').length;
  const rejectedBids = bids.filter(b => b.status === 'REJECTED').length;
  const rejectionRate = totalBids > 0 ? rejectedBids / totalBids : 0;

  const rejectedProx = bids.filter(b => b.status === 'REJECTED' && b.proximityScore != null);
  const avgProximityOnRejected = rejectedProx.length > 0
    ? rejectedProx.reduce((s, b) => s + b.proximityScore!, 0) / rejectedProx.length
    : null;

  const acceptedProx = bids.filter(b => b.status === 'ACCEPTED' && b.proximityScore != null);
  const avgProximityOnAccepted = acceptedProx.length > 0
    ? acceptedProx.reduce((s, b) => s + b.proximityScore!, 0) / acceptedProx.length
    : null;

  // Count consecutive rejections in last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentBids = bids.filter(b => new Date(b.createdAt) >= thirtyDaysAgo);
  let consecutiveRejectionsLast30d = 0;
  for (const b of recentBids) {
    if (b.status === 'REJECTED') consecutiveRejectionsLast30d++;
    else break;
  }

  return {
    totalBids,
    acceptedBids,
    rejectedBids,
    rejectionRate: Math.round(rejectionRate * 100) / 100,
    avgProximityOnRejected: avgProximityOnRejected != null ? Math.round(avgProximityOnRejected * 100) / 100 : null,
    avgProximityOnAccepted: avgProximityOnAccepted != null ? Math.round(avgProximityOnAccepted * 100) / 100 : null,
    consecutiveRejectionsLast30d,
  };
}

// ─── Match Conversion Stats ───

export async function getMatchConversionStats(): Promise<{
  totalMatches: number;
  pendingCount: number;
  viewedCount: number;
  convertedCount: number;
  rejectedCount: number;
  conversionRate: number;
  avgScoreConverted: number | null;
  avgScoreRejected: number | null;
  avgScoreAll: number | null;
}> {
  const [statusCounts, scoreAggs] = await Promise.all([
    prisma.match.groupBy({
      by: ['status'],
      _count: true,
    }),
    prisma.match.aggregate({
      _avg: { score: true },
    }),
  ]);

  const countMap: Record<string, number> = {};
  let totalMatches = 0;
  for (const s of statusCounts) {
    countMap[s.status] = s._count;
    totalMatches += s._count;
  }

  const pendingCount = countMap['pending'] || 0;
  const viewedCount = countMap['viewed'] || 0;
  const convertedCount = countMap['converted'] || 0;
  const rejectedCount = countMap['rejected'] || 0;

  const denominator = convertedCount + rejectedCount + viewedCount;
  const conversionRate = denominator > 0 ? convertedCount / denominator : 0;

  // Get avg scores for converted vs rejected
  const [convertedAgg, rejectedAgg] = await Promise.all([
    convertedCount > 0
      ? prisma.match.aggregate({ where: { status: 'converted' }, _avg: { score: true } })
      : null,
    rejectedCount > 0
      ? prisma.match.aggregate({ where: { status: 'rejected' }, _avg: { score: true } })
      : null,
  ]);

  return {
    totalMatches,
    pendingCount,
    viewedCount,
    convertedCount,
    rejectedCount,
    conversionRate: Math.round(conversionRate * 100) / 100,
    avgScoreConverted: convertedAgg?._avg.score ? Math.round(convertedAgg._avg.score * 10) / 10 : null,
    avgScoreRejected: rejectedAgg?._avg.score ? Math.round(rejectedAgg._avg.score * 10) / 10 : null,
    avgScoreAll: scoreAggs._avg.score ? Math.round(scoreAggs._avg.score * 10) / 10 : null,
  };
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
    select: { id: true, sellerId: true, isActive: true, marketplaceVisible: true, name: true },
  });

  if (!product || !isProductMarketplaceVisible(product)) return 0;

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
        const match = await prisma.match.upsert({
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

        // Notify buyer of high-score match (fire-and-forget)
        if (result.score >= 70) {
          createNotification({
            userId: buyer.id,
            type: 'MATCH_SUGGESTION',
            title: 'New product match',
            body: `${product.name} scored ${result.score}% match for you`,
            data: { matchId: match.id, productId },
          });
        }
      }
    } catch (error) {
      logger.error({ err: error, buyerId: buyer.id }, '[MATCHING] Error scoring match for buyer');
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
    where: { ...marketplaceVisibleWhere() },
    select: { id: true },
  });

  let totalMatches = 0;

  for (const product of activeProducts) {
    const matchCount = await generateMatchesForProduct(product.id);
    totalMatches += matchCount;
  }

  return { products: activeProducts.length, matches: totalMatches };
}
