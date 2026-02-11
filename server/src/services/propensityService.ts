/**
 * Propensity Service
 * RFM-based buyer propensity scoring for predicting purchase likelihood
 * Adapted from deal-intelligence (removed tenantId, PartyA → User, categoryId → categoryName)
 */

import { prisma } from '../index';

interface PropensityFeatures {
  daysSinceLastPurchase: number;
  daysSinceLastMatch: number | null;
  totalTransactions: number;
  transactionsLast30d: number;
  transactionsLast90d: number;
  avgDaysBetweenPurchases: number | null;
  totalSpend: number;
  avgOrderValue: number;
  spendLast30d: number;
  spendLast90d: number;
  categoryCount: number;
  topCategoryTransactions: number;
  matchesReviewed: number;
  matchConversionRate: number;
  pendingMatches: number;
  churnRiskScore: number;
  overdueReorderDays: number;
}

async function extractFeatures(buyerId: string, categoryName?: string): Promise<PropensityFeatures> {
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);

  const txWhere: any = { buyerId };
  if (categoryName) txWhere.product = { category: categoryName };

  const [buyer, transactions, matches, churnSignal] = await Promise.all([
    prisma.user.findUnique({
      where: { id: buyerId },
      select: { transactionCount: true, totalTransactionValue: true, lastTransactionDate: true },
    }),
    prisma.transaction.findMany({
      where: txWhere,
      select: { transactionDate: true, totalValue: true, product: { select: { category: true } } },
      orderBy: { transactionDate: 'desc' },
    }),
    prisma.match.findMany({
      where: { buyerId },
      select: { status: true, createdAt: true },
    }),
    prisma.churnSignal.findFirst({
      where: { buyerId, isActive: true, ...(categoryName ? { categoryName } : {}) },
    }),
  ]);

  const lastPurchaseDate = buyer?.lastTransactionDate || transactions[0]?.transactionDate;
  const daysSinceLastPurchase = lastPurchaseDate
    ? Math.floor((today.getTime() - new Date(lastPurchaseDate).getTime()) / (24 * 60 * 60 * 1000))
    : 365;

  const viewedMatches = matches.filter(m => m.status === 'viewed' || m.status === 'converted' || m.status === 'rejected');
  const lastMatchDate = viewedMatches[0]?.createdAt;
  const daysSinceLastMatch = lastMatchDate
    ? Math.floor((today.getTime() - new Date(lastMatchDate).getTime()) / (24 * 60 * 60 * 1000))
    : null;

  const transactionsLast30d = transactions.filter(t => new Date(t.transactionDate) >= thirtyDaysAgo).length;
  const transactionsLast90d = transactions.filter(t => new Date(t.transactionDate) >= ninetyDaysAgo).length;

  let avgDaysBetweenPurchases: number | null = null;
  if (transactions.length >= 2) {
    const sortedDates = transactions.map(t => new Date(t.transactionDate).getTime()).sort((a, b) => a - b);
    const intervals = [];
    for (let i = 1; i < sortedDates.length; i++) {
      intervals.push((sortedDates[i] - sortedDates[i - 1]) / (24 * 60 * 60 * 1000));
    }
    avgDaysBetweenPurchases = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  }

  const totalSpend = buyer?.totalTransactionValue ?? transactions.reduce((sum, t) => sum + t.totalValue, 0);
  const avgOrderValue = transactions.length > 0 ? totalSpend / transactions.length : 0;
  const spendLast30d = transactions
    .filter(t => new Date(t.transactionDate) >= thirtyDaysAgo)
    .reduce((sum, t) => sum + t.totalValue, 0);
  const spendLast90d = transactions
    .filter(t => new Date(t.transactionDate) >= ninetyDaysAgo)
    .reduce((sum, t) => sum + t.totalValue, 0);

  const categoryCounts: Record<string, number> = {};
  transactions.forEach(t => {
    const cat = t.product?.category;
    if (cat) categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });
  const categoryCount = Object.keys(categoryCounts).length;
  const topCategoryTransactions = Math.max(0, ...Object.values(categoryCounts));

  const matchesReviewed = viewedMatches.length;
  const convertedMatches = matches.filter(m => m.status === 'converted').length;
  const matchConversionRate = matchesReviewed > 0 ? convertedMatches / matchesReviewed : 0;
  const pendingMatches = matches.filter(m => m.status === 'pending').length;

  const churnRiskScore = churnSignal?.riskScore || 0;

  const prediction = await prisma.prediction.findFirst({
    where: { buyerId, ...(categoryName ? { categoryName } : {}) },
  });
  const overdueReorderDays = prediction
    ? Math.max(0, Math.floor((today.getTime() - new Date(prediction.predictedDate).getTime()) / (24 * 60 * 60 * 1000)))
    : 0;

  return {
    daysSinceLastPurchase,
    daysSinceLastMatch,
    totalTransactions: buyer?.transactionCount || transactions.length,
    transactionsLast30d,
    transactionsLast90d,
    avgDaysBetweenPurchases,
    totalSpend,
    avgOrderValue,
    spendLast30d,
    spendLast90d,
    categoryCount,
    topCategoryTransactions,
    matchesReviewed,
    matchConversionRate,
    pendingMatches,
    churnRiskScore,
    overdueReorderDays,
  };
}

function scoreFeatures(features: PropensityFeatures) {
  const recencyScore = Math.max(0, 100 - (features.daysSinceLastPurchase / 180) * 100);

  let frequencyScore = Math.min(100, features.totalTransactions * 10);
  if (features.transactionsLast30d > 0) frequencyScore = Math.min(100, frequencyScore + 20);
  if (features.transactionsLast90d > 2) frequencyScore = Math.min(100, frequencyScore + 10);

  const monetaryScore = Math.min(100, (features.avgOrderValue / 1000) * 50 + Math.min(50, features.totalSpend / 10000 * 50));

  const categoryAffinity = Math.min(100, features.topCategoryTransactions * 20 + features.categoryCount * 10);

  let engagementScore = features.matchConversionRate * 50;
  if (features.matchesReviewed > 0) engagementScore += 20;
  if (features.pendingMatches > 0) engagementScore += 15;
  engagementScore = Math.min(100, engagementScore);

  const churnPenalty = (features.churnRiskScore / 100) * 0.3;
  const overdueBoost = features.overdueReorderDays > 0 ? Math.min(20, features.overdueReorderDays / 7 * 5) : 0;

  let overallScore =
    recencyScore * 0.25 +
    frequencyScore * 0.20 +
    monetaryScore * 0.15 +
    categoryAffinity * 0.15 +
    engagementScore * 0.25;

  overallScore = overallScore * (1 - churnPenalty) + overdueBoost;
  overallScore = Math.min(100, Math.max(0, overallScore));

  return {
    overallScore: Math.round(overallScore * 100) / 100,
    recencyScore: Math.round(recencyScore * 100) / 100,
    frequencyScore: Math.round(frequencyScore * 100) / 100,
    monetaryScore: Math.round(monetaryScore * 100) / 100,
    categoryAffinity: Math.round(categoryAffinity * 100) / 100,
    engagementScore: Math.round(engagementScore * 100) / 100,
  };
}

export async function calculateAndStorePropensity(buyerId: string, categoryName?: string) {
  const features = await extractFeatures(buyerId, categoryName);
  const scores = scoreFeatures(features);

  const catValue = categoryName ?? '_all';
  await prisma.propensityScore.upsert({
    where: { buyerId_categoryName: { buyerId, categoryName: catValue } },
    create: {
      buyerId,
      categoryName: catValue,
      overallScore: scores.overallScore,
      recencyScore: scores.recencyScore,
      frequencyScore: scores.frequencyScore,
      monetaryScore: scores.monetaryScore,
      categoryAffinity: scores.categoryAffinity,
      engagementScore: scores.engagementScore,
      features: features as any,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
    update: {
      overallScore: scores.overallScore,
      recencyScore: scores.recencyScore,
      frequencyScore: scores.frequencyScore,
      monetaryScore: scores.monetaryScore,
      categoryAffinity: scores.categoryAffinity,
      engagementScore: scores.engagementScore,
      features: features as any,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  return { ...scores, features };
}

export async function getPropensity(buyerId: string, categoryName?: string) {
  const catValue = categoryName ?? '_all';
  const cached = await prisma.propensityScore.findUnique({
    where: { buyerId_categoryName: { buyerId, categoryName: catValue } },
  });

  if (cached && cached.expiresAt > new Date()) {
    return {
      overallScore: cached.overallScore,
      recencyScore: cached.recencyScore,
      frequencyScore: cached.frequencyScore,
      monetaryScore: cached.monetaryScore,
      categoryAffinity: cached.categoryAffinity,
      engagementScore: cached.engagementScore,
      features: cached.features as unknown as PropensityFeatures,
    };
  }

  return calculateAndStorePropensity(buyerId, categoryName);
}

export async function calculateAllPropensities(): Promise<{ calculated: number; errors: string[] }> {
  const result = { calculated: 0, errors: [] as string[] };

  const buyers = await prisma.user.findMany({
    where: { contactType: { contains: 'Buyer' } },
    select: { id: true },
  });

  for (const buyer of buyers) {
    try {
      await calculateAndStorePropensity(buyer.id);
      result.calculated++;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Buyer ${buyer.id}: ${message}`);
    }
  }

  return result;
}

export async function getTopPropensityBuyers(limit = 10) {
  const scores = await prisma.propensityScore.findMany({
    where: { categoryName: '_all' },
    orderBy: { overallScore: 'desc' },
    take: limit,
    include: {
      buyer: { select: { id: true, email: true, companyName: true, firstName: true, lastName: true } },
    },
  });

  return scores.map((s: any) => ({
    buyer: s.buyer,
    propensity: {
      overallScore: s.overallScore,
      recencyScore: s.recencyScore,
      frequencyScore: s.frequencyScore,
      monetaryScore: s.monetaryScore,
      categoryAffinity: s.categoryAffinity,
      engagementScore: s.engagementScore,
    },
  }));
}
