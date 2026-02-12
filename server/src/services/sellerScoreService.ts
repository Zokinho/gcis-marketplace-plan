/**
 * Seller Score Service
 * Calculates seller reliability scores based on transaction outcomes
 * Adapted from deal-intelligence (removed tenantId, PartyB → User)
 */

import { prisma } from '../index';
import logger from '../utils/logger';

interface ScoreResult {
  fillRate: number;
  qualityScore: number;
  deliveryScore: number;
  pricingScore: number;
  overallScore: number;
  transactionsScored: number;
}

const SCORE_WEIGHTS = {
  fillRate: 0.30,
  qualityScore: 0.30,
  deliveryScore: 0.25,
  pricingScore: 0.15,
};

export async function calculateSellerScores(sellerId: string): Promise<ScoreResult> {
  const transactions = await prisma.transaction.findMany({
    where: {
      sellerId,
      OR: [
        { actualQuantityDelivered: { not: null } },
        { deliveryOnTime: { not: null } },
        { qualityAsExpected: { not: null } },
      ],
    },
    include: {
      product: { select: { category: true } },
    },
  });

  if (transactions.length === 0) {
    return { fillRate: 0, qualityScore: 0, deliveryScore: 0, pricingScore: 0, overallScore: 0, transactionsScored: 0 };
  }

  // Fill rate
  let totalOrdered = 0;
  let totalDelivered = 0;
  let fillRateCount = 0;
  for (const t of transactions) {
    if (t.quantity && t.actualQuantityDelivered) {
      totalOrdered += t.quantity;
      totalDelivered += t.actualQuantityDelivered;
      fillRateCount++;
    }
  }
  const fillRate = fillRateCount > 0 ? Math.min(100, (totalDelivered / totalOrdered) * 100) : 0;

  // Quality score
  const qualityTx = transactions.filter(t => t.qualityAsExpected !== null);
  const qualityScore = qualityTx.length > 0
    ? (qualityTx.filter(t => t.qualityAsExpected === true).length / qualityTx.length) * 100
    : 0;

  // Delivery score
  const deliveryTx = transactions.filter(t => t.deliveryOnTime !== null);
  const deliveryScore = deliveryTx.length > 0
    ? (deliveryTx.filter(t => t.deliveryOnTime === true).length / deliveryTx.length) * 100
    : 0;

  // Pricing score
  const pricingScore = await calculatePricingScore(sellerId, transactions);

  const overallScore =
    (fillRate * SCORE_WEIGHTS.fillRate) +
    (qualityScore * SCORE_WEIGHTS.qualityScore) +
    (deliveryScore * SCORE_WEIGHTS.deliveryScore) +
    (pricingScore * SCORE_WEIGHTS.pricingScore);

  return {
    fillRate: Math.round(fillRate * 100) / 100,
    qualityScore: Math.round(qualityScore * 100) / 100,
    deliveryScore: Math.round(deliveryScore * 100) / 100,
    pricingScore: Math.round(pricingScore * 100) / 100,
    overallScore: Math.round(overallScore * 100) / 100,
    transactionsScored: transactions.length,
  };
}

async function calculatePricingScore(
  sellerId: string,
  transactions: Array<{ totalValue: number; product: { category: string | null } }>
): Promise<number> {
  const categoryCounts: Record<string, { sellerAvg: number; count: number }> = {};

  for (const t of transactions) {
    const cat = t.product?.category;
    if (cat && t.totalValue) {
      if (!categoryCounts[cat]) categoryCounts[cat] = { sellerAvg: 0, count: 0 };
      categoryCounts[cat].sellerAvg += t.totalValue;
      categoryCounts[cat].count++;
    }
  }

  if (Object.keys(categoryCounts).length === 0) return 50;

  let pricingScoreSum = 0;
  let categoryWeight = 0;

  for (const [categoryName, data] of Object.entries(categoryCounts)) {
    const sellerAvg = data.sellerAvg / data.count;

    const marketAvg = await prisma.transaction.aggregate({
      where: {
        product: { category: categoryName },
        totalValue: { gt: 0 },
      },
      _avg: { totalValue: true },
    });

    if (marketAvg._avg.totalValue) {
      const marketAvgValue = marketAvg._avg.totalValue;
      const priceDiff = (sellerAvg - marketAvgValue) / marketAvgValue;

      let categoryScore = 70;
      if (priceDiff <= -0.15) categoryScore = 100;
      else if (priceDiff < 0) categoryScore = 70 + (Math.abs(priceDiff) / 0.15) * 30;
      else if (priceDiff >= 0.15) categoryScore = 40;
      else categoryScore = 70 - (priceDiff / 0.15) * 30;

      pricingScoreSum += categoryScore * data.count;
      categoryWeight += data.count;
    }
  }

  return categoryWeight > 0 ? pricingScoreSum / categoryWeight : 50;
}

export async function updateSellerScore(sellerId: string): Promise<void> {
  const scores = await calculateSellerScores(sellerId);

  await prisma.sellerScore.upsert({
    where: { sellerId },
    create: {
      sellerId,
      fillRate: scores.fillRate,
      qualityScore: scores.qualityScore,
      deliveryScore: scores.deliveryScore,
      pricingScore: scores.pricingScore,
      overallScore: scores.overallScore,
      transactionsScored: scores.transactionsScored,
      lastCalculatedAt: new Date(),
    },
    update: {
      fillRate: scores.fillRate,
      qualityScore: scores.qualityScore,
      deliveryScore: scores.deliveryScore,
      pricingScore: scores.pricingScore,
      overallScore: scores.overallScore,
      transactionsScored: scores.transactionsScored,
      lastCalculatedAt: new Date(),
    },
  });

  await prisma.user.update({
    where: { id: sellerId },
    data: { avgFulfillmentScore: scores.overallScore },
  });
}

export async function recalculateAllSellerScores(): Promise<{ sellersUpdated: number }> {
  const sellers = await prisma.user.findMany({
    where: { contactType: { contains: 'Seller' } },
    select: { id: true },
  });

  for (const seller of sellers) {
    try {
      await updateSellerScore(seller.id);
    } catch (err) {
      logger.error({ err, sellerId: seller.id }, '[SELLER-SCORES] Error scoring seller');
    }
  }

  return { sellersUpdated: sellers.length };
}

export async function getTopRatedSellers(limit = 5) {
  return prisma.sellerScore.findMany({
    where: { transactionsScored: { gt: 0 } },
    orderBy: { overallScore: 'desc' },
    take: limit,
    include: {
      seller: { select: { id: true, email: true, companyName: true, firstName: true, lastName: true } },
    },
  });
}
