import { config } from 'dotenv';
import path from 'path';
config({ path: path.resolve(__dirname, '../../.env') });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// ─── Global middleware ───
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// ─── Health check (public) ───
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', database: 'disconnected', timestamp: new Date().toISOString() });
  }
});

// ─── Import routes (lazy to avoid circular deps with prisma export) ───
async function mountRoutes() {
  const { requireAuth } = await import('@clerk/express');
  const webhookRoutes = (await import('./routes/webhooks')).default;
  const userRoutes = (await import('./routes/user')).default;
  const onboardingRoutes = (await import('./routes/onboarding')).default;
  const adminRoutes = (await import('./routes/admin')).default;
  const marketplaceRoutes = (await import('./routes/marketplace')).default;
  const myListingsRoutes = (await import('./routes/myListings')).default;
  const bidRoutes = (await import('./routes/bids')).default;
  const { marketplaceAuth, requireSeller, requireAdmin } = await import('./middleware/auth');
  const coaRoutes = (await import('./routes/coa')).default;
  const shareRoutes = (await import('./routes/shares')).default;
  const { publicShareRouter } = await import('./routes/shares');

  // Webhooks — no auth required (Svix signature verification instead)
  app.use('/api/webhooks', webhookRoutes);

  // User status — requires Clerk auth only (no marketplace approval check)
  app.use('/api/user', requireAuth(), userRoutes);

  // Onboarding — requires Clerk auth only (user may not be fully approved yet)
  app.use('/api/onboarding', requireAuth(), onboardingRoutes);

  // Admin — requires Clerk auth + marketplace auth + admin check
  app.use('/api/admin', requireAuth(), marketplaceAuth, requireAdmin, adminRoutes);

  // CoA upload — requires Clerk auth + marketplace auth
  app.use('/api/coa', requireAuth(), marketplaceAuth, coaRoutes);

  // Shares admin — requires Clerk auth + marketplace auth + admin check
  app.use('/api/shares', requireAuth(), marketplaceAuth, requireAdmin, shareRoutes);

  // Public share endpoints — NO auth (token-based access)
  app.use('/api/shares/public', publicShareRouter);

  // Protected marketplace routes — requires full approval chain
  app.use('/api/marketplace', requireAuth(), marketplaceAuth, marketplaceRoutes);

  app.use('/api/bids', requireAuth(), marketplaceAuth, bidRoutes);

  app.use('/api/my-listings', requireAuth(), marketplaceAuth, requireSeller, myListingsRoutes);

  // Intelligence routes (admin)
  const { adminRouter: intelAdminRoutes, buyerMatchRouter } = await import('./routes/intelligence');
  app.use('/api/intelligence', requireAuth(), marketplaceAuth, requireAdmin, intelAdminRoutes);

  // Buyer-facing match routes
  app.use('/api/matches', requireAuth(), marketplaceAuth, buyerMatchRouter);
}

// ─── Intelligence cron scheduler ───
function startIntelligenceCrons() {
  const ONE_HOUR = 60 * 60 * 1000;

  // Daily at midnight: predictions + churn detection
  const midnightMs = getMillisUntilHour(0);
  setTimeout(() => {
    runIntelJob('Predictions', async () => {
      const { generatePredictions, cleanupStalePredictions } = await import('./services/predictionEngine');
      const result = await generatePredictions();
      const cleaned = await cleanupStalePredictions();
      return { ...result, staleCleaned: cleaned };
    });
    runIntelJob('Churn Detection', async () => {
      const { detectAllChurnSignals } = await import('./services/churnDetectionService');
      return detectAllChurnSignals();
    });
    // Repeat daily
    setInterval(() => {
      runIntelJob('Predictions', async () => {
        const { generatePredictions, cleanupStalePredictions } = await import('./services/predictionEngine');
        const result = await generatePredictions();
        const cleaned = await cleanupStalePredictions();
        return { ...result, staleCleaned: cleaned };
      });
      runIntelJob('Churn Detection', async () => {
        const { detectAllChurnSignals } = await import('./services/churnDetectionService');
        return detectAllChurnSignals();
      });
    }, 24 * ONE_HOUR);
  }, midnightMs);

  // Daily at 1am: propensity scores
  setTimeout(() => {
    runIntelJob('Propensity Scores', async () => {
      const { calculateAllPropensities } = await import('./services/propensityService');
      return calculateAllPropensities();
    });
    setInterval(() => {
      runIntelJob('Propensity Scores', async () => {
        const { calculateAllPropensities } = await import('./services/propensityService');
        return calculateAllPropensities();
      });
    }, 24 * ONE_HOUR);
  }, getMillisUntilHour(1));

  // Daily at 2am: seller scores
  setTimeout(() => {
    runIntelJob('Seller Scores', async () => {
      const { recalculateAllSellerScores } = await import('./services/sellerScoreService');
      return recalculateAllSellerScores();
    });
    setInterval(() => {
      runIntelJob('Seller Scores', async () => {
        const { recalculateAllSellerScores } = await import('./services/sellerScoreService');
        return recalculateAllSellerScores();
      });
    }, 24 * ONE_HOUR);
  }, getMillisUntilHour(2));

  console.log('[GCIS] Intelligence cron jobs scheduled (midnight, 1am, 2am daily)');
}

async function runIntelJob(name: string, fn: () => Promise<unknown>) {
  console.log(`[INTEL-CRON] Starting ${name}...`);
  try {
    const result = await fn();
    console.log(`[INTEL-CRON] ${name} completed:`, JSON.stringify(result));
  } catch (err) {
    console.error(`[INTEL-CRON] ${name} failed:`, err);
  }
}

function getMillisUntilHour(hour: number): number {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target.getTime() - now.getTime();
}

// ─── Start server ───
mountRoutes().then(async () => {
  // Start sync cron job (only if Zoho credentials are configured)
  if (process.env.ZOHO_CLIENT_ID && process.env.ZOHO_REFRESH_TOKEN) {
    const { startSyncCron } = await import('./services/zohoSync');
    startSyncCron();
  } else {
    console.log('[GCIS] Zoho credentials not configured — sync cron disabled');
  }

  // Start CoA email sync cron (only if COA_API_URL is configured)
  if (process.env.COA_API_URL) {
    const { startCoaEmailSync } = await import('./services/coaEmailSync');
    startCoaEmailSync();
  } else {
    console.log('[GCIS] COA_API_URL not configured — CoA email sync disabled');
  }

  // ─── Intelligence cron jobs ───
  // Only run if there are transactions in the database
  const txCount = await prisma.transaction.count();
  if (txCount > 0) {
    console.log(`[GCIS] ${txCount} transactions found — starting intelligence cron jobs`);
    startIntelligenceCrons();
  } else {
    console.log('[GCIS] No transactions yet — intelligence cron jobs will be available on-demand via API');
  }

  app.listen(PORT, () => {
    console.log(`[GCIS] Server running on http://localhost:${PORT}`);
    console.log(`[GCIS] Health check: http://localhost:${PORT}/api/health`);
  });
}).catch((err) => {
  console.error('[GCIS] Failed to mount routes:', err);
  process.exit(1);
});

export { app, prisma };
