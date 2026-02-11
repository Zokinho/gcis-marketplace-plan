/**
 * Calculate proximity score — how close a bid is to the seller's asking price.
 * Returns 0–100.
 */
export function calculateProximity(bidPrice: number, sellerIdealPrice: number): number {
  if (!sellerIdealPrice || sellerIdealPrice === 0) return 50; // No reference

  const ratio = bidPrice / sellerIdealPrice;

  if (ratio >= 1.0) return 100;  // At or above asking
  if (ratio >= 0.90) return 90;  // Within 10%
  if (ratio >= 0.80) return 75;  // Within 20%
  if (ratio >= 0.70) return 60;  // Within 30%
  return Math.max(10, Math.round(ratio * 100)); // Below 30%
}

/**
 * Get human-readable proximity label.
 */
export function getProximityLabel(score: number): string {
  if (score >= 90) return 'Strong offer';
  if (score >= 75) return 'Competitive';
  if (score >= 60) return 'Below market';
  return 'Significantly below asking';
}
