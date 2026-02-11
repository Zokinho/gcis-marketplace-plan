/**
 * Live proximity score indicator.
 * Shows how close the bid price is to the seller's asking price.
 */
export default function ProximityIndicator({ bidPrice, sellerPrice }: { bidPrice: number; sellerPrice: number | null }) {
  if (!sellerPrice || sellerPrice <= 0 || !bidPrice || bidPrice <= 0) {
    return (
      <div className="rounded-lg border bg-gray-50 p-3 text-center text-sm text-gray-400">
        Enter a price to see proximity score
      </div>
    );
  }

  const ratio = bidPrice / sellerPrice;
  let score: number;
  let label: string;
  let colorClass: string;
  let barColor: string;

  if (ratio >= 1.0) {
    score = 100;
    label = 'Strong offer';
    colorClass = 'text-green-700';
    barColor = 'bg-green-500';
  } else if (ratio >= 0.9) {
    score = 90;
    label = 'Strong offer';
    colorClass = 'text-green-700';
    barColor = 'bg-green-500';
  } else if (ratio >= 0.8) {
    score = 75;
    label = 'Competitive';
    colorClass = 'text-yellow-600';
    barColor = 'bg-yellow-400';
  } else if (ratio >= 0.7) {
    score = 60;
    label = 'Below market';
    colorClass = 'text-orange-600';
    barColor = 'bg-orange-400';
  } else {
    score = Math.max(10, Math.round(ratio * 100));
    label = 'Significantly below asking';
    colorClass = 'text-red-600';
    barColor = 'bg-red-400';
  }

  return (
    <div className="rounded-lg border bg-gray-50 p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className={`text-sm font-semibold ${colorClass}`}>{label}</span>
        <span className={`text-sm font-bold ${colorClass}`}>{score}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-gray-400">
        Asking price: ${sellerPrice.toFixed(2)}/g
      </p>
    </div>
  );
}
