/**
 * Live proximity score indicator.
 * Shows a simple text hint about the bid strength.
 */
export default function ProximityIndicator({ bidPrice, sellerPrice }: { bidPrice: number; sellerPrice: number | null }) {
  if (!sellerPrice || sellerPrice <= 0 || !bidPrice || bidPrice <= 0) {
    return (
      <div className="rounded-lg border bg-gray-50 p-3 text-center text-sm text-gray-400">
        Enter a price to see bid strength
      </div>
    );
  }

  const ratio = bidPrice / sellerPrice;
  let label: string;
  let colorClass: string;
  let icon: string;

  if (ratio >= 0.9) {
    label = 'This is a strong offer';
    colorClass = 'text-green-700 bg-green-50 border-green-200';
    icon = '✓';
  } else if (ratio >= 0.8) {
    label = 'Competitive offer';
    colorClass = 'text-yellow-700 bg-yellow-50 border-yellow-200';
    icon = '~';
  } else if (ratio >= 0.7) {
    label = 'Your offer may be too low';
    colorClass = 'text-orange-700 bg-orange-50 border-orange-200';
    icon = '!';
  } else {
    label = 'Your offer is unlikely to be accepted';
    colorClass = 'text-red-700 bg-red-50 border-red-200';
    icon = '✗';
  }

  return (
    <div className={`rounded-lg border p-3 text-center text-sm font-medium ${colorClass}`}>
      <span className="mr-1.5 inline-block font-bold">{icon}</span>
      {label}
    </div>
  );
}
