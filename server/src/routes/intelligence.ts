/**
 * Intelligence API Routes
 * Admin endpoints for the deal intelligence engine
 * + Buyer-facing match endpoints
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import * as matchingEngine from '../services/matchingEngine';
import * as sellerScoreService from '../services/sellerScoreService';
import * as predictionEngine from '../services/predictionEngine';
import * as churnDetectionService from '../services/churnDetectionService';
import * as propensityService from '../services/propensityService';
import * as marketContextService from '../services/marketContextService';

// ─── Admin Routes ───

const adminRouter = Router();

/**
 * GET /api/intelligence/dashboard
 * Consolidated intelligence stats
 */
adminRouter.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const [
      pendingMatches,
      totalMatches,
      matchScoreAgg,
      upcomingPredictions,
      overduePredictions,
      churnStats,
      marketTrends,
      topSellers,
      topBuyers,
    ] = await Promise.all([
      prisma.match.count({ where: { status: 'pending' } }),
      prisma.match.count(),
      prisma.match.aggregate({ _avg: { score: true } }),
      predictionEngine.getUpcomingPredictions(7, 5),
      predictionEngine.getOverduePredictions(5),
      churnDetectionService.getChurnStats(),
      marketContextService.getMarketTrends(),
      sellerScoreService.getTopRatedSellers(5),
      propensityService.getTopPropensityBuyers(5),
    ]);

    res.json({
      pendingMatches,
      totalMatches,
      avgMatchScore: matchScoreAgg._avg.score || 0,
      upcomingPredictions,
      overduePredictions,
      atRiskBuyers: {
        critical: churnStats.criticalCount,
        high: churnStats.highCount,
        medium: churnStats.mediumCount,
        low: churnStats.lowCount,
      },
      marketTrends: marketTrends.slice(0, 5),
      topSellers,
      topBuyers: topBuyers.map(b => ({
        id: b.buyer.id,
        companyName: b.buyer.companyName,
        propensityScore: b.propensity.overallScore,
      })),
    });
  } catch (err) {
    console.error('[INTEL] Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

/**
 * GET /api/intelligence/matches
 */
adminRouter.get('/matches', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const minScore = parseFloat(req.query.minScore as string) || 0;
  const status = req.query.status as string | undefined;
  const category = req.query.category as string | undefined;

  const where: any = { score: { gte: minScore } };
  if (status) where.status = status;
  if (category) where.product = { category };

  try {
    const [matches, total] = await Promise.all([
      prisma.match.findMany({
        where,
        include: {
          buyer: { select: { id: true, email: true, companyName: true, firstName: true, lastName: true } },
          product: { select: { id: true, name: true, category: true, type: true, pricePerUnit: true, gramsAvailable: true, imageUrls: true } },
        },
        orderBy: { score: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.match.count({ where }),
    ]);

    res.json({
      matches,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[INTEL] Matches error:', err);
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

/**
 * GET /api/intelligence/matches/:id
 */
adminRouter.get('/matches/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: {
        buyer: { select: { id: true, email: true, companyName: true, firstName: true, lastName: true } },
        product: { select: { id: true, name: true, category: true, type: true, pricePerUnit: true, gramsAvailable: true, imageUrls: true, seller: { select: { companyName: true } } } },
      },
    });

    if (!match) return res.status(404).json({ error: 'Match not found' });
    res.json({ match });
  } catch (err) {
    console.error('[INTEL] Match detail error:', err);
    res.status(500).json({ error: 'Failed to fetch match' });
  }
});

/**
 * POST /api/intelligence/matches/generate
 */
adminRouter.post('/matches/generate', async (req: Request, res: Response) => {
  const { productId } = req.body;

  try {
    if (productId) {
      const count = await matchingEngine.generateMatchesForProduct(productId);
      res.json({ productId, matchesGenerated: count });
    } else {
      const result = await matchingEngine.regenerateAllMatches();
      res.json(result);
    }
  } catch (err) {
    console.error('[INTEL] Match generation error:', err);
    res.status(500).json({ error: 'Failed to generate matches' });
  }
});

/**
 * GET /api/intelligence/predictions
 */
adminRouter.get('/predictions', async (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string) || 30;
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const type = req.query.type as string; // 'upcoming' or 'overdue'

  try {
    if (type === 'overdue') {
      const predictions = await predictionEngine.getOverduePredictions(limit);
      res.json({ predictions });
    } else {
      const predictions = await predictionEngine.getUpcomingPredictions(days, limit);
      res.json({ predictions });
    }
  } catch (err) {
    console.error('[INTEL] Predictions error:', err);
    res.status(500).json({ error: 'Failed to fetch predictions' });
  }
});

/**
 * GET /api/intelligence/predictions/calendar
 * Predictions grouped by week
 */
adminRouter.get('/predictions/calendar', async (_req: Request, res: Response) => {
  try {
    const [upcoming, overdue] = await Promise.all([
      predictionEngine.getUpcomingPredictions(30, 50),
      predictionEngine.getOverduePredictions(50),
    ]);

    // Group by week
    const weeks: Record<string, any[]> = {};
    const allPredictions = [
      ...overdue.map(p => ({ ...p, isOverdue: true })),
      ...upcoming.map(p => ({ ...p, isOverdue: false })),
    ];

    for (const pred of allPredictions) {
      const date = new Date(pred.predictedDate);
      const weekStart = new Date(date);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const key = weekStart.toISOString().split('T')[0];
      if (!weeks[key]) weeks[key] = [];
      weeks[key].push(pred);
    }

    res.json({ weeks });
  } catch (err) {
    console.error('[INTEL] Calendar error:', err);
    res.status(500).json({ error: 'Failed to build calendar' });
  }
});

/**
 * GET /api/intelligence/churn/at-risk
 */
adminRouter.get('/churn/at-risk', async (req: Request, res: Response) => {
  const minRiskLevel = (req.query.minRiskLevel as string) || 'medium';
  const limit = parseInt(req.query.limit as string) || 20;

  try {
    const buyers = await churnDetectionService.getAtRiskBuyers({ minRiskLevel, limit });
    res.json({ buyers });
  } catch (err) {
    console.error('[INTEL] Churn at-risk error:', err);
    res.status(500).json({ error: 'Failed to fetch at-risk buyers' });
  }
});

/**
 * GET /api/intelligence/churn/stats
 */
adminRouter.get('/churn/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await churnDetectionService.getChurnStats();
    res.json(stats);
  } catch (err) {
    console.error('[INTEL] Churn stats error:', err);
    res.status(500).json({ error: 'Failed to fetch churn stats' });
  }
});

/**
 * POST /api/intelligence/churn/detect
 */
adminRouter.post('/churn/detect', async (_req: Request, res: Response) => {
  try {
    const result = await churnDetectionService.detectAllChurnSignals();
    res.json(result);
  } catch (err) {
    console.error('[INTEL] Churn detection error:', err);
    res.status(500).json({ error: 'Failed to run churn detection' });
  }
});

/**
 * GET /api/intelligence/market/trends
 */
adminRouter.get('/market/trends', async (_req: Request, res: Response) => {
  try {
    const trends = await marketContextService.getMarketTrends();
    res.json({ trends });
  } catch (err) {
    console.error('[INTEL] Market trends error:', err);
    res.status(500).json({ error: 'Failed to fetch market trends' });
  }
});

/**
 * GET /api/intelligence/market/insights
 */
adminRouter.get('/market/insights', async (_req: Request, res: Response) => {
  try {
    const insights = await marketContextService.getMarketInsights();
    res.json(insights);
  } catch (err) {
    console.error('[INTEL] Market insights error:', err);
    res.status(500).json({ error: 'Failed to fetch market insights' });
  }
});

/**
 * GET /api/intelligence/market/:categoryName
 */
adminRouter.get('/market/:categoryName', async (req: Request<{ categoryName: string }>, res: Response) => {
  try {
    const context = await marketContextService.getMarketContext(req.params.categoryName);
    res.json(context);
  } catch (err) {
    console.error('[INTEL] Market context error:', err);
    res.status(500).json({ error: 'Failed to fetch market context' });
  }
});

/**
 * GET /api/intelligence/propensity/top
 */
adminRouter.get('/propensity/top', async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 10;
  try {
    const buyers = await propensityService.getTopPropensityBuyers(limit);
    res.json({ buyers });
  } catch (err) {
    console.error('[INTEL] Propensity error:', err);
    res.status(500).json({ error: 'Failed to fetch propensity scores' });
  }
});

/**
 * GET /api/intelligence/seller-scores
 */
adminRouter.get('/seller-scores', async (_req: Request, res: Response) => {
  try {
    const scores = await prisma.sellerScore.findMany({
      include: {
        seller: { select: { id: true, email: true, companyName: true, firstName: true, lastName: true } },
      },
      orderBy: { overallScore: 'desc' },
    });
    res.json({ scores });
  } catch (err) {
    console.error('[INTEL] Seller scores error:', err);
    res.status(500).json({ error: 'Failed to fetch seller scores' });
  }
});

/**
 * GET /api/intelligence/seller-scores/:sellerId
 */
adminRouter.get('/seller-scores/:sellerId', async (req: Request<{ sellerId: string }>, res: Response) => {
  try {
    const score = await prisma.sellerScore.findUnique({
      where: { sellerId: req.params.sellerId },
      include: {
        seller: { select: { id: true, email: true, companyName: true, firstName: true, lastName: true } },
      },
    });

    if (!score) {
      // Calculate on-the-fly
      const calculated = await sellerScoreService.calculateSellerScores(req.params.sellerId);
      return res.json({ score: { ...calculated, sellerId: req.params.sellerId } });
    }

    res.json({ score });
  } catch (err) {
    console.error('[INTEL] Seller score detail error:', err);
    res.status(500).json({ error: 'Failed to fetch seller score' });
  }
});

/**
 * POST /api/intelligence/seller-scores/recalculate
 */
adminRouter.post('/seller-scores/recalculate', async (_req: Request, res: Response) => {
  try {
    const result = await sellerScoreService.recalculateAllSellerScores();
    res.json(result);
  } catch (err) {
    console.error('[INTEL] Recalculate error:', err);
    res.status(500).json({ error: 'Failed to recalculate seller scores' });
  }
});

/**
 * GET /api/intelligence/transactions
 */
adminRouter.get('/transactions', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const status = req.query.status as string | undefined;

  const where: any = {};
  if (status) where.status = status;

  try {
    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          buyer: { select: { id: true, email: true, companyName: true, firstName: true, lastName: true } },
          seller: { select: { id: true, email: true, companyName: true, firstName: true, lastName: true } },
          product: { select: { id: true, name: true, category: true, type: true, imageUrls: true } },
        },
        orderBy: { transactionDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({
      transactions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[INTEL] Transactions error:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

/**
 * GET /api/intelligence/transactions/:id
 */
adminRouter.get('/transactions/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: req.params.id },
      include: {
        buyer: { select: { id: true, email: true, companyName: true, firstName: true, lastName: true } },
        seller: { select: { id: true, email: true, companyName: true, firstName: true, lastName: true } },
        product: { select: { id: true, name: true, category: true, type: true, imageUrls: true } },
        bid: { select: { id: true, pricePerUnit: true, quantity: true, proximityScore: true } },
      },
    });

    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ transaction });
  } catch (err) {
    console.error('[INTEL] Transaction detail error:', err);
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

// ─── Buyer-Facing Match Routes ───

const buyerMatchRouter = Router();

/**
 * GET /api/matches
 * Buyer's pending matches
 */
buyerMatchRouter.get('/', async (req: Request, res: Response) => {
  const buyer = req.user!;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));

  try {
    const [matches, total] = await Promise.all([
      prisma.match.findMany({
        where: { buyerId: buyer.id, status: { in: ['pending', 'viewed'] } },
        include: {
          product: {
            select: {
              id: true, name: true, category: true, type: true,
              pricePerUnit: true, gramsAvailable: true, imageUrls: true,
            },
          },
        },
        orderBy: { score: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.match.count({ where: { buyerId: buyer.id, status: { in: ['pending', 'viewed'] } } }),
    ]);

    res.json({
      matches,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[MATCHES] Buyer matches error:', err);
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

/**
 * GET /api/matches/:id
 */
buyerMatchRouter.get('/:id', async (req: Request<{ id: string }>, res: Response) => {
  const buyer = req.user!;

  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: {
        product: {
          select: {
            id: true, name: true, category: true, type: true,
            pricePerUnit: true, gramsAvailable: true, imageUrls: true,
          },
        },
      },
    });

    if (!match || match.buyerId !== buyer.id) {
      return res.status(404).json({ error: 'Match not found' });
    }

    // Mark as viewed
    if (match.status === 'pending') {
      await prisma.match.update({ where: { id: match.id }, data: { status: 'viewed' } });
    }

    res.json({ match });
  } catch (err) {
    console.error('[MATCHES] Match detail error:', err);
    res.status(500).json({ error: 'Failed to fetch match' });
  }
});

/**
 * POST /api/matches/:id/dismiss
 */
buyerMatchRouter.post('/:id/dismiss', async (req: Request<{ id: string }>, res: Response) => {
  const buyer = req.user!;

  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });

    if (!match || match.buyerId !== buyer.id) {
      return res.status(404).json({ error: 'Match not found' });
    }

    await prisma.match.update({
      where: { id: match.id },
      data: { status: 'rejected' },
    });

    res.json({ status: 'rejected' });
  } catch (err) {
    console.error('[MATCHES] Dismiss error:', err);
    res.status(500).json({ error: 'Failed to dismiss match' });
  }
});

export { adminRouter, buyerMatchRouter };
