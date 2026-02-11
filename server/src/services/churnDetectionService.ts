/**
 * Churn Detection Service
 * Detects when buyers are at risk of churning
 * Adapted from deal-intelligence (removed tenantId, PartyA → User, categoryId → categoryName)
 */

import { prisma } from '../index';

function calculateRiskLevel(daysSince: number, avgInterval: number): { level: 'low' | 'medium' | 'high' | 'critical'; score: number } {
  const ratio = daysSince / avgInterval;

  if (ratio >= 3) return { level: 'critical', score: Math.min(100, 80 + (ratio - 3) * 10) };
  if (ratio >= 2) return { level: 'high', score: 60 + (ratio - 2) * 20 };
  if (ratio >= 1.5) return { level: 'medium', score: 40 + (ratio - 1.5) * 40 };
  if (ratio >= 1) return { level: 'low', score: (ratio - 1) * 80 };
  return { level: 'low', score: 0 };
}

export async function analyzeChurnRisk(buyerId: string, categoryName?: string) {
  const whereClause: any = { buyerId };
  if (categoryName) {
    whereClause.product = { category: categoryName };
  }

  const transactions = await prisma.transaction.findMany({
    where: whereClause,
    orderBy: { transactionDate: 'desc' },
    include: { product: { select: { category: true } } },
  });

  if (transactions.length < 2) return [];

  // Group by category
  const categoryGroups = new Map<string | null, typeof transactions>();
  for (const tx of transactions) {
    const cat = tx.product?.category ?? null;
    if (!categoryGroups.has(cat)) categoryGroups.set(cat, []);
    categoryGroups.get(cat)!.push(tx);
  }

  const risks: Array<{
    buyerId: string;
    categoryName: string | null;
    lastPurchaseDate: Date;
    daysSincePurchase: number;
    avgIntervalDays: number;
    riskLevel: string;
    riskScore: number;
  }> = [];

  for (const [cat, catTransactions] of categoryGroups) {
    if (catTransactions.length < 2) continue;

    const sortedTx = catTransactions.sort(
      (a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()
    );

    let totalIntervalDays = 0;
    for (let i = 0; i < sortedTx.length - 1; i++) {
      totalIntervalDays += Math.floor(
        (new Date(sortedTx[i].transactionDate).getTime() -
          new Date(sortedTx[i + 1].transactionDate).getTime()) /
          (1000 * 60 * 60 * 24)
      );
    }
    const avgIntervalDays = Math.round(totalIntervalDays / (sortedTx.length - 1));

    const lastPurchaseDate = new Date(sortedTx[0].transactionDate);
    const daysSincePurchase = Math.floor((Date.now() - lastPurchaseDate.getTime()) / (1000 * 60 * 60 * 24));

    const { level, score } = calculateRiskLevel(daysSincePurchase, avgIntervalDays);

    if (score > 0) {
      risks.push({
        buyerId,
        categoryName: cat,
        lastPurchaseDate,
        daysSincePurchase,
        avgIntervalDays,
        riskLevel: level,
        riskScore: Math.round(score),
      });
    }
  }

  return risks;
}

export async function detectAllChurnSignals(): Promise<{ signalsCreated: number; signalsUpdated: number }> {
  const buyers = await prisma.user.findMany({
    where: { transactionCount: { gte: 2 } },
    select: { id: true },
  });

  let signalsCreated = 0;
  let signalsUpdated = 0;

  for (const buyer of buyers) {
    try {
      const risks = await analyzeChurnRisk(buyer.id);

      for (const risk of risks) {
        // Find existing active signal for this buyer+category
        const existing = await prisma.churnSignal.findFirst({
          where: { buyerId: risk.buyerId, categoryName: risk.categoryName, isActive: true },
        });

        if (existing) {
          await prisma.churnSignal.update({
            where: { id: existing.id },
            data: {
              daysSincePurchase: risk.daysSincePurchase,
              avgIntervalDays: risk.avgIntervalDays,
              riskLevel: risk.riskLevel,
              riskScore: risk.riskScore,
            },
          });
          signalsUpdated++;
        } else {
          await prisma.churnSignal.create({
            data: {
              buyerId: risk.buyerId,
              categoryName: risk.categoryName,
              daysSincePurchase: risk.daysSincePurchase,
              avgIntervalDays: risk.avgIntervalDays,
              riskLevel: risk.riskLevel,
              riskScore: risk.riskScore,
            },
          });
          signalsCreated++;
        }
      }
    } catch (err) {
      console.error(`[CHURN] Error analyzing buyer ${buyer.id}:`, err);
    }
  }

  return { signalsCreated, signalsUpdated };
}

export async function getAtRiskBuyers(options?: { minRiskLevel?: string; limit?: number }) {
  const minRiskLevel = options?.minRiskLevel || 'medium';
  const limit = options?.limit || 20;

  const riskLevelValues: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  const minRiskValue = riskLevelValues[minRiskLevel] || 2;

  const signals = await prisma.churnSignal.findMany({
    where: { isActive: true },
    include: {
      buyer: { select: { id: true, email: true, companyName: true, firstName: true, lastName: true } },
    },
    orderBy: { riskScore: 'desc' },
  });

  const filtered = signals.filter(s => (riskLevelValues[s.riskLevel] || 0) >= minRiskValue);

  // Group by buyer
  const buyerMap = new Map<string, {
    buyer: typeof signals[0]['buyer'];
    signals: typeof signals;
    overallRiskLevel: string;
    overallRiskScore: number;
  }>();

  for (const signal of filtered) {
    if (!buyerMap.has(signal.buyerId)) {
      buyerMap.set(signal.buyerId, {
        buyer: signal.buyer,
        signals: [],
        overallRiskLevel: signal.riskLevel,
        overallRiskScore: signal.riskScore,
      });
    }
    const entry = buyerMap.get(signal.buyerId)!;
    entry.signals.push(signal);
    if ((riskLevelValues[signal.riskLevel] || 0) > (riskLevelValues[entry.overallRiskLevel] || 0)) {
      entry.overallRiskLevel = signal.riskLevel;
    }
    if (signal.riskScore > entry.overallRiskScore) {
      entry.overallRiskScore = signal.riskScore;
    }
  }

  return Array.from(buyerMap.values())
    .sort((a, b) => b.overallRiskScore - a.overallRiskScore)
    .slice(0, limit);
}

export async function getChurnStats() {
  const signals = await prisma.churnSignal.findMany({ where: { isActive: true } });

  const stats = { totalAtRisk: 0, criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0 };
  const uniqueBuyers = new Set<string>();

  for (const signal of signals) {
    switch (signal.riskLevel) {
      case 'critical': stats.criticalCount++; uniqueBuyers.add(signal.buyerId); break;
      case 'high': stats.highCount++; uniqueBuyers.add(signal.buyerId); break;
      case 'medium': stats.mediumCount++; uniqueBuyers.add(signal.buyerId); break;
      case 'low': stats.lowCount++; break;
    }
  }

  stats.totalAtRisk = uniqueBuyers.size;
  return stats;
}

export async function resolveChurnSignal(signalId: string, reason: string): Promise<void> {
  await prisma.churnSignal.update({
    where: { id: signalId },
    data: { isActive: false, resolvedAt: new Date(), resolvedReason: reason },
  });
}

export async function resolveOnPurchase(buyerId: string, categoryName?: string): Promise<number> {
  const where: any = { buyerId, isActive: true };
  if (categoryName) where.categoryName = categoryName;

  const result = await prisma.churnSignal.updateMany({
    where,
    data: { isActive: false, resolvedAt: new Date(), resolvedReason: 'purchase_made' },
  });
  return result.count;
}
