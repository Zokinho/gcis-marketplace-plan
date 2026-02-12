/**
 * Prediction Engine Service
 * Analyzes transaction history to predict when buyers will need to reorder
 * Adapted from deal-intelligence (removed tenantId, PartyA → User, categoryId → categoryName)
 */

import { prisma } from '../index';
import logger from '../utils/logger';
import { createNotification } from './notificationService';

function daysBetween(date1: Date, date2: Date): number {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round(Math.abs((date1.getTime() - date2.getTime()) / oneDay));
}

function average(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function standardDeviation(numbers: number[]): number {
  if (numbers.length < 2) return 0;
  const avg = average(numbers);
  const squareDiffs = numbers.map(n => Math.pow(n - avg, 2));
  return Math.sqrt(average(squareDiffs));
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

async function calculateReorderPattern(buyerId: string, categoryName: string | null) {
  const whereClause: any = { buyerId };
  if (categoryName) {
    whereClause.product = { category: categoryName };
  }

  const transactions = await prisma.transaction.findMany({
    where: whereClause,
    orderBy: { transactionDate: 'asc' },
    select: { id: true, transactionDate: true },
  });

  if (transactions.length < 2) return null;

  const intervals: number[] = [];
  for (let i = 1; i < transactions.length; i++) {
    const days = daysBetween(
      new Date(transactions[i - 1].transactionDate),
      new Date(transactions[i].transactionDate)
    );
    if (days >= 3 && days <= 365) intervals.push(days);
  }

  if (intervals.length === 0) return null;

  const avgDays = Math.round(average(intervals));
  const stdDev = standardDeviation(intervals);
  const consistencyScore = Math.max(0, 100 - (stdDev * 2));
  const volumeBonus = Math.min(20, transactions.length * 2);
  const confidence = Math.min(100, Math.max(0, consistencyScore + volumeBonus));
  const lastTransaction = transactions[transactions.length - 1];

  return {
    avgDays,
    confidence,
    lastTransaction: { id: lastTransaction.id, transactionDate: new Date(lastTransaction.transactionDate) },
    transactionCount: transactions.length,
  };
}

export async function generatePredictionsForBuyer(buyerId: string): Promise<number> {
  // Get unique categories this buyer has transacted in
  const transactions = await prisma.transaction.findMany({
    where: { buyerId },
    include: { product: { select: { category: true } } },
  });

  const categoryNames = [...new Set(transactions.map(t => t.product?.category).filter(Boolean))] as string[];
  let predictionsCreated = 0;

  for (const categoryName of categoryNames) {
    const pattern = await calculateReorderPattern(buyerId, categoryName);
    if (!pattern) continue;

    const predictedDate = addDays(pattern.lastTransaction.transactionDate, pattern.avgDays);

    await prisma.prediction.upsert({
      where: { buyerId_categoryName: { buyerId, categoryName } },
      create: {
        buyerId,
        categoryName,
        predictedDate,
        confidenceScore: pattern.confidence,
        basedOnTransactions: pattern.transactionCount,
        avgIntervalDays: pattern.avgDays,
        lastTransactionId: pattern.lastTransaction.id,
      },
      update: {
        predictedDate,
        confidenceScore: pattern.confidence,
        basedOnTransactions: pattern.transactionCount,
        avgIntervalDays: pattern.avgDays,
        lastTransactionId: pattern.lastTransaction.id,
      },
    });
    predictionsCreated++;
  }

  return predictionsCreated;
}

export async function generatePredictions(): Promise<{ buyersProcessed: number; predictionsCreated: number }> {
  // Get buyers with at least 2 transactions
  const buyers = await prisma.user.findMany({
    where: { transactionCount: { gte: 2 } },
    select: { id: true },
  });

  let totalPredictions = 0;
  for (const buyer of buyers) {
    totalPredictions += await generatePredictionsForBuyer(buyer.id);
  }

  // Send PREDICTION_DUE notifications for approaching predictions
  try {
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const duePredictions = await prisma.prediction.findMany({
      where: {
        predictedDate: { lte: sevenDaysFromNow },
        notifiedAt: null,
      },
      select: { id: true, buyerId: true, categoryName: true, predictedDate: true },
    });

    for (const pred of duePredictions) {
      const daysUntil = Math.ceil(
        (new Date(pred.predictedDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      const timeText = daysUntil <= 0 ? 'overdue' : `in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`;

      await createNotification({
        userId: pred.buyerId,
        type: 'PREDICTION_DUE',
        title: 'Reorder prediction approaching',
        body: `Your ${pred.categoryName} reorder is predicted ${timeText}`,
        data: { categoryName: pred.categoryName },
      });

      await prisma.prediction.update({
        where: { id: pred.id },
        data: { notifiedAt: new Date() },
      });
    }
  } catch (err) {
    logger.error({ err }, '[PREDICTIONS] PREDICTION_DUE notification error');
  }

  return { buyersProcessed: buyers.length, predictionsCreated: totalPredictions };
}

export async function getOverduePredictions(limit = 20) {
  const today = new Date();

  const predictions = await prisma.prediction.findMany({
    where: { predictedDate: { lt: today } },
    orderBy: { predictedDate: 'asc' },
    take: limit,
    include: {
      buyer: { select: { id: true, email: true, companyName: true, firstName: true, lastName: true } },
    },
  });

  return predictions.map(p => ({
    ...p,
    daysOverdue: daysBetween(new Date(p.predictedDate), today),
  }));
}

export async function getUpcomingPredictions(days = 7, limit = 20) {
  const today = new Date();
  const endDate = addDays(today, days);

  const predictions = await prisma.prediction.findMany({
    where: { predictedDate: { gte: today, lte: endDate } },
    orderBy: { predictedDate: 'asc' },
    take: limit,
    include: {
      buyer: { select: { id: true, email: true, companyName: true, firstName: true, lastName: true } },
    },
  });

  return predictions.map(p => ({
    ...p,
    daysUntil: daysBetween(today, new Date(p.predictedDate)),
  }));
}

export async function cleanupStalePredictions(): Promise<number> {
  // Delete predictions for buyers who no longer have enough transactions
  const result = await prisma.prediction.deleteMany({
    where: {
      buyer: { transactionCount: { lt: 2 } },
    },
  });
  return result.count;
}
