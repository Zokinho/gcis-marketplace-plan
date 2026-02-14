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
