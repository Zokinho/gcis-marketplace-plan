import { vi } from 'vitest';

// Mock Prisma client globally
vi.mock('../index', () => ({
  prisma: {
    product: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    bid: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    transaction: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    syncLog: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    curatedShare: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    coaSyncRecord: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    match: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    sellerScore: {
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    shortlistItem: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    productView: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

// Mock logger to avoid noise in tests
vi.mock('../utils/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    fatal: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock metrics to avoid prom-client side effects in tests
vi.mock('../utils/metrics', () => ({
  cronJobDuration: { startTimer: vi.fn(() => vi.fn()) },
  cronJobLastSuccess: { set: vi.fn() },
  cronJobErrors: { inc: vi.fn() },
  metricsMiddleware: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  registry: { metrics: vi.fn(), contentType: 'text/plain' },
  isMetricsEnabled: false,
}));

// Mock Sentry to avoid SDK initialization in tests
vi.mock('../utils/sentry', () => ({
  initSentry: vi.fn(),
  setUserContext: vi.fn(),
  clearUserContext: vi.fn(),
  Sentry: {
    setupExpressErrorHandler: vi.fn(),
    captureException: vi.fn(),
    setUser: vi.fn(),
  },
}));
