import { config } from 'dotenv';
import path from 'path';
config({ path: path.resolve(__dirname, '../../.env') });

import { initSentry, Sentry } from './utils/sentry';
initSentry();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import logger from './utils/logger';
import { withCronLock, LOCK_IDS } from './utils/cronLock';
import { metricsMiddleware, registry, isMetricsEnabled } from './utils/metrics';

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// ─── Global middleware ───

// Trust first proxy (Nginx) — makes req.ip and req.protocol correct behind reverse proxy
app.set('trust proxy', 1);

// Build CSP directives — allow Google Fonts, Sentry, and S3/Spaces
const cspExtraConnectSrc = (process.env.CSP_EXTRA_CONNECT_SRC || '').split(',').map((s) => s.trim()).filter(Boolean);
const s3Host = process.env.S3_ENDPOINT ? new URL(process.env.S3_ENDPOINT).host : null;

app.use(helmet({
  hsts: process.env.FORCE_HTTPS === 'true'
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        ...(s3Host ? [`https://${s3Host}`] : []),
      ],
      connectSrc: [
        "'self'",
        "https://*.ingest.sentry.io",
        ...(s3Host ? [`https://${s3Host}`] : []),
        ...cspExtraConnectSrc,
      ],
      frameSrc: ["'self'"],
      workerSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'none'"],
      manifestSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrcAttr: ["'unsafe-inline'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}));

// Permissions-Policy header — deny access to sensitive browser features
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), autoplay=(), magnetometer=(), gyroscope=(), accelerometer=()');
  next();
});

// HTTPS redirect (only in production with FORCE_HTTPS=true)
if (process.env.FORCE_HTTPS === 'true') {
  app.use((req, res, next) => {
    if (req.protocol === 'http') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

app.use(cors({
  origin: (process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim()),
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// ─── CSRF protection (Origin validation on mutating requests) ───
const ALLOWED_ORIGINS = new Set(
  (process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim()),
);

app.use((req, res, next) => {
  // Only check mutating methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  // Skip webhook routes (Zoho shared secret is their CSRF equivalent)
  if (req.path.startsWith('/api/webhooks')) return next();

  // Skip auth routes (public registration/login)
  if (req.path.startsWith('/api/auth')) return next();

  const origin = req.headers['origin'];
  const referer = req.headers['referer'];

  // Allow requests with a valid Origin header
  if (origin && ALLOWED_ORIGINS.has(origin)) return next();

  // Fall back to Referer check
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (ALLOWED_ORIGINS.has(refOrigin)) return next();
    } catch {
      // malformed referer — fall through to reject
    }
  }

  // Allow server-to-server calls (no Origin/Referer, but has Authorization)
  // These are API calls from non-browser clients (curl, Postman, cron jobs)
  if (!origin && !referer) return next();

  logger.warn({ origin, referer, path: req.path }, 'CSRF: origin mismatch — blocked');
  return res.status(403).json({ error: 'Forbidden: origin not allowed' });
});

// ─── Prometheus metrics middleware ───
app.use(metricsMiddleware);

// ─── Static file serving for uploads (legacy) ───
// TODO: Remove after migrating existing /uploads/ paths to S3 keys in the database
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

// ─── Zoho file proxy cache ───
const zohoFileCache = new Map<string, { data: Buffer; contentType: string; expires: number }>();

// ─── Health check (public) ───
app.get('/api/health', async (req, res) => {
  const detailed = req.query.detailed === 'true';
  const checks: Record<string, string> = {};
  let healthy = true;

  // Database (always checked)
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'connected';
  } catch {
    checks.database = 'disconnected';
    healthy = false;
  }

  if (detailed) {
    // Zoho
    if (process.env.ZOHO_CLIENT_ID && process.env.ZOHO_REFRESH_TOKEN) {
      try {
        const { getAccessToken } = await import('./services/zohoAuth');
        const token = await getAccessToken();
        checks.zoho = token ? 'connected' : 'token_error';
      } catch {
        checks.zoho = 'unreachable';
        healthy = false;
      }
    } else {
      checks.zoho = 'not_configured';
    }

    // CoA service
    if (process.env.COA_API_URL) {
      try {
        const { default: axios } = await import('axios');
        const resp = await axios.get(`${process.env.COA_API_URL}/health`, { timeout: 3000 });
        checks.coa = resp.status === 200 ? 'connected' : 'unhealthy';
      } catch {
        checks.coa = 'unreachable';
      }
    } else {
      checks.coa = 'not_configured';
    }
  }

  const status = healthy ? 'ok' : 'degraded';
  res.status(healthy ? 200 : 503).json({ status, ...checks, timestamp: new Date().toISOString() });
});

// ─── Prometheus metrics endpoint (unauthenticated, for scraping) ───
if (isMetricsEnabled) {
  app.get('/metrics', async (_req, res) => {
    try {
      res.set('Content-Type', registry.contentType);
      res.end(await registry.metrics());
    } catch (err) {
      res.status(500).end();
    }
  });
}

// ─── Rate limiters ───

// General API: 200 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// Write limiter imported from shared module (used by CoA route mount + route-level in bids/listings)
import { writeLimiter } from './utils/rateLimiters';

// Auth/onboarding: 30 per minute per IP
const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// Public share endpoints: 60 per minute per IP
const publicLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// ─── Import routes (lazy to avoid circular deps with prisma export) ───
async function mountRoutes() {
  const { requireAuth } = await import('./middleware/auth');
  const authRoutes = (await import('./routes/auth')).default;
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
  const notificationRoutes = (await import('./routes/notifications')).default;

  // Zoho file proxy (requires auth — prevents unauthenticated file downloads)
  app.get('/api/zoho-files/:zohoProductId/:fileId', apiLimiter, requireAuth(), marketplaceAuth, async (req: express.Request<{ zohoProductId: string; fileId: string }>, res) => {
    const { zohoProductId, fileId } = req.params;

    // Validate that this product exists in our database (prevents using our
    // server as an open proxy to download arbitrary Zoho files)
    const product = await prisma.product.findUnique({
      where: { zohoProductId },
      select: { id: true },
    });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const cacheKey = `${zohoProductId}:${fileId}`;

    // Check in-memory cache (1 hour TTL)
    const cached = zohoFileCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      res.set('Content-Type', cached.contentType);
      res.set('Cache-Control', 'public, max-age=3600');
      return res.send(cached.data);
    }

    try {
      const { downloadZohoFile } = await import('./services/zohoApi');
      const { data, contentType, fileName } = await downloadZohoFile(zohoProductId, fileId);

      // Cache for 1 hour
      zohoFileCache.set(cacheKey, { data, contentType, expires: Date.now() + 3600_000 });

      // Evict old entries if cache grows too large
      if (zohoFileCache.size > 200) {
        const now = Date.now();
        for (const [k, v] of zohoFileCache) {
          if (v.expires < now) zohoFileCache.delete(k);
        }
      }

      res.set('Content-Type', contentType);
      res.set('Cache-Control', 'public, max-age=3600');
      res.send(data);
    } catch (err: any) {
      logger.error({ err, zohoProductId, fileId }, 'ZOHO-FILES download failed');
      res.status(502).json({ error: 'Failed to fetch file from Zoho' });
    }
  });

  // Auth routes — public (register, login, refresh, logout)
  app.use('/api/auth', authLimiter, authRoutes);

  // Webhooks — Zoho webhook (shared secret verification)
  app.use('/api/webhooks', webhookRoutes);

  // User status — requires JWT auth only (no marketplace approval check)
  app.use('/api/user', authLimiter, requireAuth(), userRoutes);

  // Onboarding — requires JWT auth only (user may not be fully approved yet)
  app.use('/api/onboarding', authLimiter, requireAuth(), onboardingRoutes);

  // Admin — requires JWT auth + marketplace auth + admin check
  app.use('/api/admin', apiLimiter, requireAuth(), marketplaceAuth, requireAdmin, adminRoutes);

  // CoA upload — requires JWT auth + marketplace auth
  app.use('/api/coa', writeLimiter, requireAuth(), marketplaceAuth, coaRoutes);

  // Shares admin — requires JWT auth + marketplace auth + admin check
  app.use('/api/shares', apiLimiter, requireAuth(), marketplaceAuth, requireAdmin, shareRoutes);

  // Public share endpoints — NO auth (token-based access)
  app.use('/api/shares/public', publicLimiter, publicShareRouter);

  // Notifications — requires JWT auth + marketplace auth
  app.use('/api/notifications', apiLimiter, requireAuth(), marketplaceAuth, notificationRoutes);

  // Shortlist — requires JWT auth + marketplace auth
  const shortlistRoutes = (await import('./routes/shortlist')).default;
  app.use('/api/shortlist', apiLimiter, requireAuth(), marketplaceAuth, shortlistRoutes);

  // ISO Board — requires JWT auth + marketplace auth
  const isoRoutes = (await import('./routes/iso')).default;
  app.use('/api/iso', apiLimiter, requireAuth(), marketplaceAuth, isoRoutes);

  // Clearance — admin routes first (more specific path), then buyer routes
  const { adminRouter: spotSaleAdminRoutes, buyerRouter: spotSaleBuyerRoutes } = await import('./routes/spotSales');
  app.use('/api/spot-sales/admin', apiLimiter, requireAuth(), marketplaceAuth, requireAdmin, spotSaleAdminRoutes);
  app.use('/api/spot-sales', apiLimiter, requireAuth(), marketplaceAuth, spotSaleBuyerRoutes);

  // Protected marketplace routes — requires full approval chain
  app.use('/api/marketplace', apiLimiter, requireAuth(), marketplaceAuth, marketplaceRoutes);

  app.use('/api/bids', apiLimiter, requireAuth(), marketplaceAuth, bidRoutes);

  app.use('/api/my-listings', apiLimiter, requireAuth(), marketplaceAuth, requireSeller, myListingsRoutes);

  // Intelligence routes (admin)
  const { adminRouter: intelAdminRoutes, buyerMatchRouter } = await import('./routes/intelligence');
  app.use('/api/intelligence', apiLimiter, requireAuth(), marketplaceAuth, requireAdmin, intelAdminRoutes);

  // Buyer-facing match routes
  app.use('/api/matches', apiLimiter, requireAuth(), marketplaceAuth, buyerMatchRouter);
}

// ─── Intelligence cron scheduler ───
function startIntelligenceCrons() {
  const ONE_HOUR = 60 * 60 * 1000;

  // Daily at midnight: predictions + churn detection
  const midnightMs = getMillisUntilHour(0);
  setTimeout(() => {
    runIntelJob('Predictions', LOCK_IDS.INTEL_PREDICTIONS, async () => {
      const { generatePredictions, cleanupStalePredictions } = await import('./services/predictionEngine');
      const result = await generatePredictions();
      const cleaned = await cleanupStalePredictions();
      return { ...result, staleCleaned: cleaned };
    });
    runIntelJob('Churn Detection', LOCK_IDS.INTEL_CHURN, async () => {
      const { detectAllChurnSignals } = await import('./services/churnDetectionService');
      return detectAllChurnSignals();
    });
    // Repeat daily
    setInterval(() => {
      runIntelJob('Predictions', LOCK_IDS.INTEL_PREDICTIONS, async () => {
        const { generatePredictions, cleanupStalePredictions } = await import('./services/predictionEngine');
        const result = await generatePredictions();
        const cleaned = await cleanupStalePredictions();
        return { ...result, staleCleaned: cleaned };
      });
      runIntelJob('Churn Detection', LOCK_IDS.INTEL_CHURN, async () => {
        const { detectAllChurnSignals } = await import('./services/churnDetectionService');
        return detectAllChurnSignals();
      });
    }, 24 * ONE_HOUR);
  }, midnightMs);

  // Daily at 1am: propensity scores
  setTimeout(() => {
    runIntelJob('Propensity Scores', LOCK_IDS.INTEL_PROPENSITY, async () => {
      const { calculateAllPropensities } = await import('./services/propensityService');
      return calculateAllPropensities();
    });
    setInterval(() => {
      runIntelJob('Propensity Scores', LOCK_IDS.INTEL_PROPENSITY, async () => {
        const { calculateAllPropensities } = await import('./services/propensityService');
        return calculateAllPropensities();
      });
    }, 24 * ONE_HOUR);
  }, getMillisUntilHour(1));

  // Daily at 2am: seller scores
  setTimeout(() => {
    runIntelJob('Seller Scores', LOCK_IDS.INTEL_SELLER_SCORES, async () => {
      const { recalculateAllSellerScores } = await import('./services/sellerScoreService');
      return recalculateAllSellerScores();
    });
    setInterval(() => {
      runIntelJob('Seller Scores', LOCK_IDS.INTEL_SELLER_SCORES, async () => {
        const { recalculateAllSellerScores } = await import('./services/sellerScoreService');
        return recalculateAllSellerScores();
      });
    }, 24 * ONE_HOUR);
  }, getMillisUntilHour(2));

  // Daily at 3am: ISO expiry
  setTimeout(() => {
    runIntelJob('ISO Expiry', LOCK_IDS.ISO_EXPIRY, async () => {
      const result = await prisma.isoRequest.updateMany({
        where: { status: 'OPEN', expiresAt: { lt: new Date() } },
        data: { status: 'EXPIRED' },
      });
      return { expired: result.count };
    });
    setInterval(() => {
      runIntelJob('ISO Expiry', LOCK_IDS.ISO_EXPIRY, async () => {
        const result = await prisma.isoRequest.updateMany({
          where: { status: 'OPEN', expiresAt: { lt: new Date() } },
          data: { status: 'EXPIRED' },
        });
        return { expired: result.count };
      });
    }, 24 * ONE_HOUR);
  }, getMillisUntilHour(3));

  logger.info('Intelligence cron jobs scheduled (midnight, 1am, 2am, 3am daily)');
}

async function runIntelJob(name: string, lockId: number, fn: () => Promise<unknown>) {
  await withCronLock(lockId, name, async () => {
    logger.info({ job: name }, 'INTEL-CRON starting');
    const result = await fn();
    logger.info({ job: name, result }, 'INTEL-CRON completed');
  });
}

function getMillisUntilHour(hour: number): number {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target.getTime() - now.getTime();
}

// ─── Global error handler (must be after all routes) ───
function mountErrorHandler() {
  // Sentry error handler (must be before catch-all)
  Sentry.setupExpressErrorHandler(app);

  // Catch-all for unhandled route errors
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error';

    logger.error({ err, status }, 'Unhandled route error');
    if (!res.headersSent) {
      res.status(status).json({ error: message });
    }
  });
}

// ─── Process-level error handlers ───
process.on('unhandledRejection', (reason: any) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (err: Error) => {
  logger.fatal({ err }, 'Uncaught exception');
  // Give time for logs to flush, then exit
  setTimeout(() => process.exit(1), 1000);
});

// ─── Start server ───
mountRoutes().then(async () => {
  mountErrorHandler();
  // Start sync cron job (only if Zoho credentials are configured)
  if (process.env.ZOHO_CLIENT_ID && process.env.ZOHO_REFRESH_TOKEN) {
    const { startSyncCron } = await import('./services/zohoSync');
    startSyncCron();
  } else {
    logger.info('Zoho credentials not configured — sync cron disabled');
  }

  // Start CoA email sync cron (only if COA_API_URL is configured)
  if (process.env.COA_API_URL) {
    const { startCoaEmailSync } = await import('./services/coaEmailSync');
    startCoaEmailSync();
  } else {
    logger.info('COA_API_URL not configured — CoA email sync disabled');
  }

  // ─── Intelligence cron jobs ───
  // Only run if there are transactions in the database
  const txCount = await prisma.transaction.count();
  if (txCount > 0) {
    logger.info({ txCount }, 'Transactions found — starting intelligence cron jobs');
    startIntelligenceCrons();
  } else {
    logger.info('No transactions yet — intelligence cron jobs will be available on-demand via API');
  }

  app.listen(PORT, () => {
    logger.info({ port: PORT }, `Server running on http://localhost:${PORT}`);
    logger.info({ port: PORT }, `Health check: http://localhost:${PORT}/api/health`);
  });
}).catch((err) => {
  logger.fatal({ err }, 'Failed to mount routes');
  process.exit(1);
});

export { app, prisma };
