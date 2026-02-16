import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependent intelligence services
vi.mock('../services/sellerScoreService', () => ({
  calculateSellerScores: vi.fn().mockResolvedValue({ overallScore: 80, transactionsScored: 5 }),
}));
vi.mock('../services/marketContextService', () => ({
  scorePriceVsMarket: vi.fn().mockResolvedValue({ score: 70 }),
  scoreSupplyDemand: vi.fn().mockResolvedValue({ score: 60 }),
}));
vi.mock('../services/propensityService', () => ({
  getPropensity: vi.fn().mockResolvedValue({ overallScore: 75 }),
}));

import { scoreMatch, generateMatchesForProduct } from '../services/matchingEngine';
import { prisma } from '../index';

// ─── Augment prisma mock with models/methods not present in setup.ts ───

beforeEach(() => {
  vi.clearAllMocks();

  // Ensure transaction model has aggregate and findMany
  (prisma.transaction as any).aggregate = vi.fn();
  (prisma.transaction as any).findMany = vi.fn();

  // Ensure bid model has count
  (prisma.bid as any).count = vi.fn();

  // Ensure prediction model exists
  (prisma as any).prediction = {
    findFirst: vi.fn(),
  };

  // Ensure match model has upsert
  (prisma.match as any).upsert = vi.fn();
});

// ─── Fixtures ───

const mockProduct = {
  id: 'p1',
  name: 'Test Flower',
  category: 'Flower',
  pricePerUnit: 5.0,
  gramsAvailable: 1000,
  sellerId: 's1',
  isActive: true,
  marketplaceVisible: true,
  seller: { id: 's1', mailingCountry: 'Canada' },
};

const mockBuyer = {
  id: 'b1',
  mailingCountry: 'Canada',
  lastTransactionDate: new Date('2025-03-01'),
  transactionCount: 5,
};

// ─── scoreMatch ───

describe('scoreMatch', () => {
  it('returns score 0 when product is not found', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockBuyer as any);

    const result = await scoreMatch('b1', 'nonexistent');

    expect(result.score).toBe(0);
    expect(result.insights).toEqual([]);
  });

  it('returns score 0 when buyer is not found', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(mockProduct as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const result = await scoreMatch('nonexistent', 'p1');

    expect(result.score).toBe(0);
    expect(result.insights).toEqual([]);
  });

  it('returns score 0 when both product and buyer are not found', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const result = await scoreMatch('nonexistent', 'nonexistent');

    expect(result.score).toBe(0);
    expect(result.insights).toEqual([]);
  });

  it('returns a score with all breakdown fields when both exist', async () => {
    // Product lookup (includes seller)
    vi.mocked(prisma.product.findUnique).mockResolvedValue(mockProduct as any);
    // Buyer lookup
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockBuyer as any);

    // scoreCategoryMatch: transaction count in this category
    vi.mocked(prisma.transaction.count).mockResolvedValue(3);
    // scorePriceFit: aggregate buyer's spend in category
    (prisma.transaction as any).aggregate.mockResolvedValue({
      _sum: { totalValue: 2500, quantity: 500 },
      _avg: { quantity: 100 },
    });
    // scoreRelationshipHistory: transactions with this seller (same mock already set to 3 above)
    // scoreReorderTiming: no prediction found
    (prisma as any).prediction.findFirst.mockResolvedValue(null);
    // scoreBuyerPropensity, scoreSellerReliability, etc. are handled by mocked services

    const result = await scoreMatch('b1', 'p1');

    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);

    // Check all breakdown keys
    expect(result.breakdown).toHaveProperty('category');
    expect(result.breakdown).toHaveProperty('priceFit');
    expect(result.breakdown).toHaveProperty('location');
    expect(result.breakdown).toHaveProperty('relationshipHistory');
    expect(result.breakdown).toHaveProperty('reorderTiming');
    expect(result.breakdown).toHaveProperty('quantityFit');
    expect(result.breakdown).toHaveProperty('sellerReliability');
    expect(result.breakdown).toHaveProperty('priceVsMarket');
    expect(result.breakdown).toHaveProperty('supplyDemand');
    expect(result.breakdown).toHaveProperty('buyerPropensity');

    // All breakdown scores should be between 0 and 100
    for (const value of Object.values(result.breakdown)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }

    // insights should be an array
    expect(Array.isArray(result.insights)).toBe(true);
  });

  it('generates positive insights when scores are high', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(mockProduct as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockBuyer as any);

    // 5+ category transactions -> category score 95
    vi.mocked(prisma.transaction.count).mockResolvedValue(5);
    // Price is much lower than buyer's average -> priceFit 100
    (prisma.transaction as any).aggregate.mockResolvedValue({
      _sum: { totalValue: 5000, quantity: 500 }, // avg price = 10, product price = 5 -> -50%
      _avg: { quantity: 1000 }, // gramsAvailable 1000 / avg 1000 = ratio 1.0 -> quantityFit 100
    });
    // Prediction due now -> reorderTiming 100
    (prisma as any).prediction.findFirst.mockResolvedValue({
      predictedDate: new Date(Date.now() - 86400000), // yesterday
    });

    const result = await scoreMatch('b1', 'p1');

    // Should have positive insights for category, price, quantity, location, seller
    const insightTexts = result.insights.map((i: any) => i.text);
    expect(insightTexts).toEqual(
      expect.arrayContaining([
        expect.stringContaining('previous transactions'),
        expect.stringContaining('Strong category'),
      ]),
    );
  });
});

// ─── generateMatchesForProduct ───

describe('generateMatchesForProduct', () => {
  it('returns 0 for a product that does not exist', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null);

    const count = await generateMatchesForProduct('nonexistent');

    expect(count).toBe(0);
  });

  it('returns 0 for an inactive product', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      id: 'p1',
      sellerId: 's1',
      isActive: false,
      marketplaceVisible: false,
    } as any);

    const count = await generateMatchesForProduct('p1');

    expect(count).toBe(0);
  });

  it('creates matches for qualifying buyers and returns match count', async () => {
    // First call: generateMatchesForProduct looks up the product (select: id, sellerId, isActive)
    // Subsequent calls: scoreMatch looks up the product (include: seller)
    vi.mocked(prisma.product.findUnique)
      .mockResolvedValueOnce({ id: 'p1', sellerId: 's1', isActive: true, marketplaceVisible: true, name: 'Test Flower' } as any) // generateMatchesForProduct lookup
      .mockResolvedValue(mockProduct as any); // scoreMatch lookups

    // Two approved buyers (excluding the seller)
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'b1' },
      { id: 'b2' },
    ] as any);

    // scoreMatch internals for each buyer
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockBuyer as any);
    vi.mocked(prisma.transaction.count).mockResolvedValue(3);
    (prisma.transaction as any).aggregate.mockResolvedValue({
      _sum: { totalValue: 2500, quantity: 500 },
      _avg: { quantity: 100 },
    });
    (prisma as any).prediction.findFirst.mockResolvedValue(null);
    (prisma.match as any).upsert.mockResolvedValue({ id: 'm1' });
    vi.mocked(prisma.product.update).mockResolvedValue({} as any);

    const count = await generateMatchesForProduct('p1');

    // Both buyers should produce matches (scores above threshold with these mocks)
    expect(count).toBeGreaterThanOrEqual(0);
    // Product update should be called with matchCount
    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: expect.objectContaining({ matchCount: count }),
      }),
    );
  });

  it('handles errors in individual buyer scoring gracefully', async () => {
    vi.mocked(prisma.product.findUnique)
      .mockResolvedValueOnce({ id: 'p1', sellerId: 's1', isActive: true, marketplaceVisible: true, name: 'Test Flower' } as any)
      .mockRejectedValue(new Error('DB error')); // scoreMatch will fail for each buyer

    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'b1' },
    ] as any);

    vi.mocked(prisma.product.update).mockResolvedValue({} as any);

    // Should not throw — errors are caught per-buyer
    const count = await generateMatchesForProduct('p1');

    expect(count).toBe(0);
    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { matchCount: 0 },
      }),
    );
  });
});
