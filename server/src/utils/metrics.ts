import { Request, Response, NextFunction } from 'express';
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

export const isMetricsEnabled = process.env.ENABLE_METRICS === 'true';

export const registry = new Registry();

// ─── HTTP metrics ───

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const httpRequestsInFlight = new Gauge({
  name: 'http_requests_in_flight',
  help: 'Number of HTTP requests currently being processed',
  registers: [registry],
});

// ─── Cron job metrics ───

export const cronJobDuration = new Histogram({
  name: 'cron_job_duration_seconds',
  help: 'Cron job execution duration in seconds',
  labelNames: ['job'] as const,
  buckets: [1, 5, 10, 30, 60, 120, 300, 600],
  registers: [registry],
});

export const cronJobLastSuccess = new Gauge({
  name: 'cron_job_last_success_timestamp',
  help: 'Timestamp of the last successful cron job run',
  labelNames: ['job'] as const,
  registers: [registry],
});

export const cronJobErrors = new Counter({
  name: 'cron_job_errors_total',
  help: 'Total cron job errors',
  labelNames: ['job'] as const,
  registers: [registry],
});

// ─── Default Node.js process metrics ───

if (isMetricsEnabled) {
  collectDefaultMetrics({ register: registry });
}

// ─── Normalize route paths to prevent cardinality explosion ───

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const NUMERIC_ID_RE = /\/\d+(?=\/|$)/g;

function normalizeRoute(path: string): string {
  return path
    .replace(UUID_RE, ':id')
    .replace(NUMERIC_ID_RE, '/:id');
}

// ─── Express middleware ───

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isMetricsEnabled) return next();

  const start = process.hrtime.bigint();
  httpRequestsInFlight.inc();

  res.on('finish', () => {
    httpRequestsInFlight.dec();
    const route = normalizeRoute(req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path);
    const duration = Number(process.hrtime.bigint() - start) / 1e9;

    httpRequestsTotal.inc({ method: req.method, route, status: res.statusCode });
    httpRequestDuration.observe({ method: req.method, route }, duration);
  });

  next();
}
