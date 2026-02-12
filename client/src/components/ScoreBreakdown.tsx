const FACTOR_LABELS: Record<string, string> = {
  category: 'Category Match',
  priceFit: 'Price Fit',
  location: 'Location',
  relationshipHistory: 'Relationship',
  reorderTiming: 'Reorder Timing',
  quantityFit: 'Quantity Fit',
  sellerReliability: 'Seller Score',
  priceVsMarket: 'Market Price',
  supplyDemand: 'Supply/Demand',
  buyerPropensity: 'Buyer Propensity',
};

function getBarColor(score: number): string {
  if (score >= 80) return 'bg-brand-blue';
  if (score >= 60) return 'bg-brand-yellow';
  if (score >= 40) return 'bg-brand-coral';
  return 'bg-red-500';
}

export default function ScoreBreakdown({ breakdown }: { breakdown: Record<string, number> }) {
  const entries = Object.entries(breakdown).sort(([, a], [, b]) => b - a);

  return (
    <div className="space-y-2">
      {entries.map(([factor, score]) => (
        <div key={factor} className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-xs text-muted">
            {FACTOR_LABELS[factor] || factor}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-brand-gray">
            <div
              className={`h-full rounded-full transition-all ${getBarColor(score)}`}
              style={{ width: `${Math.min(100, score)}%` }}
            />
          </div>
          <span className="w-8 text-right text-xs font-semibold text-primary">{Math.round(score)}</span>
        </div>
      ))}
    </div>
  );
}
