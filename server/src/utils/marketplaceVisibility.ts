/**
 * Marketplace Visibility Helper
 *
 * Centralizes the branching between "coupled" mode (marketplace follows Zoho Product_Active)
 * and "decoupled" mode (marketplace uses its own marketplaceVisible flag).
 *
 * MARKETPLACE_COUPLED=true  (default) → marketplace queries use isActive, toggle writes to Zoho
 * MARKETPLACE_COUPLED=false (testing) → marketplace queries use marketplaceVisible, Zoho untouched
 */

/**
 * Returns true when the marketplace is coupled to Zoho's Product_Active field.
 * Default is true — deploying the code changes nothing until MARKETPLACE_COUPLED=false is set.
 */
export function isCoupledMode(): boolean {
  return process.env.MARKETPLACE_COUPLED !== 'false';
}

/**
 * Returns the Prisma where-clause fragment for filtering marketplace-visible products.
 * - Coupled mode:   { isActive: true }
 * - Decoupled mode:  { marketplaceVisible: true }
 */
export function marketplaceVisibleWhere(): { isActive: true } | { marketplaceVisible: true } {
  return isCoupledMode() ? { isActive: true } : { marketplaceVisible: true };
}

/**
 * Checks whether a product should be visible in the marketplace.
 * - Coupled mode:   checks product.isActive
 * - Decoupled mode:  checks product.marketplaceVisible
 */
export function isProductMarketplaceVisible(product: { isActive: boolean; marketplaceVisible?: boolean }): boolean {
  return isCoupledMode() ? product.isActive : (product.marketplaceVisible ?? false);
}
