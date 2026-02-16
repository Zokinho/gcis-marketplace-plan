import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We need to reset the module between tests since isCoupledMode reads process.env
const importModule = async () => {
  const mod = await import('../utils/marketplaceVisibility');
  return mod;
};

describe('marketplaceVisibility', () => {
  const originalEnv = process.env.MARKETPLACE_COUPLED;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.MARKETPLACE_COUPLED;
    } else {
      process.env.MARKETPLACE_COUPLED = originalEnv;
    }
  });

  describe('isCoupledMode', () => {
    it('returns true when MARKETPLACE_COUPLED is not set (default)', async () => {
      delete process.env.MARKETPLACE_COUPLED;
      const { isCoupledMode } = await importModule();
      expect(isCoupledMode()).toBe(true);
    });

    it('returns true when MARKETPLACE_COUPLED=true', async () => {
      process.env.MARKETPLACE_COUPLED = 'true';
      const { isCoupledMode } = await importModule();
      expect(isCoupledMode()).toBe(true);
    });

    it('returns false when MARKETPLACE_COUPLED=false', async () => {
      process.env.MARKETPLACE_COUPLED = 'false';
      const { isCoupledMode } = await importModule();
      expect(isCoupledMode()).toBe(false);
    });

    it('returns true for any other string value', async () => {
      process.env.MARKETPLACE_COUPLED = 'yes';
      const { isCoupledMode } = await importModule();
      expect(isCoupledMode()).toBe(true);
    });
  });

  describe('marketplaceVisibleWhere', () => {
    it('returns { isActive: true } in coupled mode', async () => {
      delete process.env.MARKETPLACE_COUPLED;
      const { marketplaceVisibleWhere } = await importModule();
      expect(marketplaceVisibleWhere()).toEqual({ isActive: true });
    });

    it('returns { marketplaceVisible: true } in decoupled mode', async () => {
      process.env.MARKETPLACE_COUPLED = 'false';
      const { marketplaceVisibleWhere } = await importModule();
      expect(marketplaceVisibleWhere()).toEqual({ marketplaceVisible: true });
    });
  });

  describe('isProductMarketplaceVisible', () => {
    it('checks isActive in coupled mode', async () => {
      delete process.env.MARKETPLACE_COUPLED;
      const { isProductMarketplaceVisible } = await importModule();

      expect(isProductMarketplaceVisible({ isActive: true, marketplaceVisible: false })).toBe(true);
      expect(isProductMarketplaceVisible({ isActive: false, marketplaceVisible: true })).toBe(false);
    });

    it('checks marketplaceVisible in decoupled mode', async () => {
      process.env.MARKETPLACE_COUPLED = 'false';
      const { isProductMarketplaceVisible } = await importModule();

      expect(isProductMarketplaceVisible({ isActive: true, marketplaceVisible: false })).toBe(false);
      expect(isProductMarketplaceVisible({ isActive: false, marketplaceVisible: true })).toBe(true);
    });

    it('product with isActive=true, marketplaceVisible=false is hidden in decoupled mode', async () => {
      process.env.MARKETPLACE_COUPLED = 'false';
      const { isProductMarketplaceVisible } = await importModule();
      expect(isProductMarketplaceVisible({ isActive: true, marketplaceVisible: false })).toBe(false);
    });

    it('product with isActive=false, marketplaceVisible=true is visible in decoupled mode', async () => {
      process.env.MARKETPLACE_COUPLED = 'false';
      const { isProductMarketplaceVisible } = await importModule();
      expect(isProductMarketplaceVisible({ isActive: false, marketplaceVisible: true })).toBe(true);
    });

    it('defaults marketplaceVisible to false when undefined', async () => {
      process.env.MARKETPLACE_COUPLED = 'false';
      const { isProductMarketplaceVisible } = await importModule();
      expect(isProductMarketplaceVisible({ isActive: true })).toBe(false);
    });
  });
});
