/**
 * Market Context Service
 * Tracks historical prices and provides market intelligence
 * All prices are per-gram (marketplace standard)
 * Adapted from deal-intelligence (removed tenantId, UnitService; uses categoryName strings)
 */

import { prisma } from '../index';
import { marketplaceVisibleWhere } from '../utils/marketplaceVisibility';

interface PriceComparison {
  listingPrice: number;
  marketAvg30d: number;
  percentDiff: number;
  score: number;
  assessment: 'below_market' | 'at_market' | 'above_market';
}

interface SupplyDemandAnalysis {
  activeBuyersPredictedToReorder: number;
  activeListings: number;
  ratio: number;
  score: number;
  assessment: 'high_demand' | 'balanced' | 'oversupply';
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export async function updateMarketPrice(categoryName: string, price: number, quantity: number): Promise<void> {
  if (!categoryName || !price || price <= 0) return;

  // Ensure category exists
  await prisma.category.upsert({
    where: { name: categoryName },
    create: { name: categoryName },
    update: {},
  });

  const today = startOfDay(new Date());

  const existing = await prisma.marketPrice.findUnique({
    where: { categoryName_periodStart: { categoryName, periodStart: today } },
  });

  if (existing) {
    const newCount = existing.transactionCount + 1;
    const newAvg = ((existing.avgPrice * existing.transactionCount) + price) / newCount;
    const newMin = Math.min(existing.minPrice, price);
    const newMax = Math.max(existing.maxPrice, price);
    const newVolume = existing.totalVolume + (price * (quantity || 1));

    await prisma.marketPrice.update({
      where: { id: existing.id },
      data: { avgPrice: newAvg, minPrice: newMin, maxPrice: newMax, transactionCount: newCount, totalVolume: newVolume },
    });
  } else {
    await prisma.marketPrice.create({
      data: {
        categoryName,
        avgPrice: price,
        minPrice: price,
        maxPrice: price,
        transactionCount: 1,
        totalVolume: price * (quantity || 1),
        periodStart: today,
        periodEnd: today,
      },
    });
  }

  await calculateRollingAverages(categoryName);
}

export async function calculateRollingAverages(categoryName: string): Promise<void> {
  const today = startOfDay(new Date());
  const sevenDaysAgo = addDays(today, -7);
  const thirtyDaysAgo = addDays(today, -30);
  const sixtyDaysAgo = addDays(today, -60);

  const last30Days = await prisma.marketPrice.findMany({
    where: { categoryName, periodStart: { gte: thirtyDaysAgo } },
    orderBy: { periodStart: 'desc' },
  });

  const previous30Days = await prisma.marketPrice.findMany({
    where: { categoryName, periodStart: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
  });

  if (last30Days.length === 0) return;

  const last7Days = last30Days.filter(p => new Date(p.periodStart) >= sevenDaysAgo);
  let rollingAvg7d: number | null = null;
  if (last7Days.length > 0) {
    const total = last7Days.reduce((sum, p) => sum + p.avgPrice * p.transactionCount, 0);
    const count = last7Days.reduce((sum, p) => sum + p.transactionCount, 0);
    rollingAvg7d = total / count;
  }

  const total30d = last30Days.reduce((sum, p) => sum + p.avgPrice * p.transactionCount, 0);
  const count30d = last30Days.reduce((sum, p) => sum + p.transactionCount, 0);
  const rollingAvg30d = total30d / count30d;

  let priceChange7d: number | null = null;
  let priceChange30d: number | null = null;

  if (rollingAvg7d !== null && last30Days.length > last7Days.length) {
    const olderPrices = last30Days.filter(p => new Date(p.periodStart) < sevenDaysAgo);
    if (olderPrices.length > 0) {
      const olderTotal = olderPrices.reduce((sum, p) => sum + p.avgPrice * p.transactionCount, 0);
      const olderCount = olderPrices.reduce((sum, p) => sum + p.transactionCount, 0);
      priceChange7d = ((rollingAvg7d - olderTotal / olderCount) / (olderTotal / olderCount)) * 100;
    }
  }

  if (previous30Days.length > 0) {
    const prevTotal = previous30Days.reduce((sum, p) => sum + p.avgPrice * p.transactionCount, 0);
    const prevCount = previous30Days.reduce((sum, p) => sum + p.transactionCount, 0);
    priceChange30d = ((rollingAvg30d - prevTotal / prevCount) / (prevTotal / prevCount)) * 100;
  }

  const todayRecord = last30Days.find(p => startOfDay(new Date(p.periodStart)).getTime() === today.getTime());
  if (todayRecord) {
    await prisma.marketPrice.update({
      where: { id: todayRecord.id },
      data: { rollingAvg7d, rollingAvg30d, priceChange7d, priceChange30d },
    });
  }
}

export async function scorePriceVsMarket(productId: string): Promise<PriceComparison | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { pricePerUnit: true, category: true },
  });

  if (!product?.category || !product.pricePerUnit) return null;

  const marketAvg = await get30DayAvgPrice(product.category);
  if (!marketAvg) return null;

  const listingPrice = product.pricePerUnit;
  const percentDiff = ((listingPrice - marketAvg) / marketAvg) * 100;

  let score: number;
  if (percentDiff <= -20) score = 100;
  else if (percentDiff >= 20) score = 0;
  else score = 50 - (percentDiff * 2.5);
  score = Math.max(0, Math.min(100, score));

  const assessment: PriceComparison['assessment'] =
    percentDiff < -5 ? 'below_market' : percentDiff > 5 ? 'above_market' : 'at_market';

  return { listingPrice, marketAvg30d: marketAvg, percentDiff, score, assessment };
}

export async function scoreSupplyDemand(productId: string): Promise<SupplyDemandAnalysis | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { category: true },
  });

  if (!product?.category) return null;
  return getSupplyDemandForCategory(product.category);
}

export async function getSupplyDemandForCategory(categoryName: string): Promise<SupplyDemandAnalysis> {
  const nextWeek = addDays(new Date(), 7);

  const activeBuyersPredictedToReorder = await prisma.prediction.count({
    where: { categoryName, predictedDate: { lte: nextWeek } },
  });

  const activeListings = await prisma.product.count({
    where: { category: categoryName, ...marketplaceVisibleWhere() },
  });

  const ratio = activeListings > 0
    ? activeBuyersPredictedToReorder / activeListings
    : activeBuyersPredictedToReorder > 0 ? 10 : 0;

  let score: number;
  if (ratio >= 2) score = 100;
  else if (ratio <= 0.2) score = 0;
  else score = ((ratio - 0.2) / 1.8) * 100;
  score = Math.max(0, Math.min(100, score));

  const assessment: SupplyDemandAnalysis['assessment'] =
    ratio > 1.5 ? 'high_demand' : ratio < 0.5 ? 'oversupply' : 'balanced';

  return { activeBuyersPredictedToReorder, activeListings, ratio, score, assessment };
}

export async function get30DayAvgPricesBatch(
  categoryNames: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (categoryNames.length === 0) return result;

  const thirtyDaysAgo = addDays(new Date(), -30);
  const prices = await prisma.marketPrice.findMany({
    where: { categoryName: { in: categoryNames }, periodStart: { gte: thirtyDaysAgo } },
  });

  // Group by category and compute volume-weighted average
  const grouped = new Map<string, { totalWeighted: number; totalCount: number }>();
  for (const p of prices) {
    const entry = grouped.get(p.categoryName) || { totalWeighted: 0, totalCount: 0 };
    entry.totalWeighted += p.avgPrice * p.transactionCount;
    entry.totalCount += p.transactionCount;
    grouped.set(p.categoryName, entry);
  }

  for (const [cat, { totalWeighted, totalCount }] of grouped) {
    if (totalCount > 0) {
      result.set(cat, totalWeighted / totalCount);
    }
  }

  return result;
}

async function get30DayAvgPrice(categoryName: string): Promise<number | null> {
  const thirtyDaysAgo = addDays(new Date(), -30);
  const prices = await prisma.marketPrice.findMany({
    where: { categoryName, periodStart: { gte: thirtyDaysAgo } },
  });

  if (prices.length === 0) return null;
  const total = prices.reduce((sum, p) => sum + p.avgPrice * p.transactionCount, 0);
  const count = prices.reduce((sum, p) => sum + p.transactionCount, 0);
  return total / count;
}

export async function getMarketContext(categoryName: string) {
  const thirtyDaysAgo = addDays(new Date(), -30);

  const prices = await prisma.marketPrice.findMany({
    where: { categoryName, periodStart: { gte: thirtyDaysAgo } },
    orderBy: { periodStart: 'desc' },
  });

  const latestWithRolling = prices.find(p => p.rollingAvg30d !== null);

  let avgPrice30d: number | null = null;
  let minPrice30d: number | null = null;
  let maxPrice30d: number | null = null;
  let transactionCount30d = 0;
  let totalVolume30d = 0;

  if (prices.length > 0) {
    const total = prices.reduce((sum, p) => sum + p.avgPrice * p.transactionCount, 0);
    const count = prices.reduce((sum, p) => sum + p.transactionCount, 0);
    avgPrice30d = total / count;
    minPrice30d = Math.min(...prices.map(p => p.minPrice));
    maxPrice30d = Math.max(...prices.map(p => p.maxPrice));
    transactionCount30d = count;
    totalVolume30d = prices.reduce((sum, p) => sum + p.totalVolume, 0);
  }

  const supplyDemand = await getSupplyDemandForCategory(categoryName);

  return {
    categoryName,
    avgPrice30d,
    minPrice30d,
    maxPrice30d,
    priceChange7d: latestWithRolling?.priceChange7d ?? null,
    priceChange30d: latestWithRolling?.priceChange30d ?? null,
    transactionCount30d,
    totalVolume30d,
    activeBuyers: supplyDemand.activeBuyersPredictedToReorder,
    activeListings: supplyDemand.activeListings,
    supplyDemandRatio: supplyDemand.ratio,
  };
}

export async function getMarketTrends() {
  const categories = await prisma.category.findMany({ select: { name: true } });
  const today = startOfDay(new Date());
  const thirtyDaysAgo = addDays(today, -30);
  const sixtyDaysAgo = addDays(today, -60);

  const trends: Array<{
    categoryName: string;
    currentAvgPrice: number;
    previousAvgPrice: number;
    percentChange: number;
    trend: 'up' | 'down' | 'stable';
    volume: number;
  }> = [];

  for (const category of categories) {
    const current = await prisma.marketPrice.findMany({
      where: { categoryName: category.name, periodStart: { gte: thirtyDaysAgo } },
    });
    const previous = await prisma.marketPrice.findMany({
      where: { categoryName: category.name, periodStart: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
    });

    if (current.length === 0) continue;

    const currentTotal = current.reduce((sum, p) => sum + p.avgPrice * p.transactionCount, 0);
    const currentCount = current.reduce((sum, p) => sum + p.transactionCount, 0);
    const currentAvgPrice = currentTotal / currentCount;
    const volume = current.reduce((sum, p) => sum + p.totalVolume, 0);

    let previousAvgPrice = currentAvgPrice;
    if (previous.length > 0) {
      const prevTotal = previous.reduce((sum, p) => sum + p.avgPrice * p.transactionCount, 0);
      const prevCount = previous.reduce((sum, p) => sum + p.transactionCount, 0);
      previousAvgPrice = prevTotal / prevCount;
    }

    const percentChange = previous.length > 0 ? ((currentAvgPrice - previousAvgPrice) / previousAvgPrice) * 100 : 0;
    const trend: 'up' | 'down' | 'stable' = percentChange > 5 ? 'up' : percentChange < -5 ? 'down' : 'stable';

    trends.push({ categoryName: category.name, currentAvgPrice, previousAvgPrice, percentChange, trend, volume });
  }

  trends.sort((a, b) => b.volume - a.volume);
  return trends;
}

export async function getMarketInsights() {
  const trends = await getMarketTrends();

  const topCategories = trends.slice(0, 5).map(t => ({
    categoryName: t.categoryName,
    volume: t.volume,
    avgPrice: t.currentAvgPrice,
  }));

  const supplyDemandOverview: Array<{ categoryName: string; ratio: number; assessment: string }> = [];
  for (const trend of trends.slice(0, 10)) {
    const sd = await getSupplyDemandForCategory(trend.categoryName);
    supplyDemandOverview.push({ categoryName: trend.categoryName, ratio: sd.ratio, assessment: sd.assessment });
  }

  return { trends: trends.slice(0, 10), topCategories, supplyDemandOverview };
}
