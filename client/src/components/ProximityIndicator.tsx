/**
 * Live proximity score indicator.
 * Shows a simple text hint about the bid strength.
 */
export default function ProximityIndicator({ bidPrice, sellerPrice }: { bidPrice: number; sellerPrice: number | null }) {
  if (!sellerPrice || sellerPrice <= 0 || !bidPrice || bidPrice <= 0) {
    return (
      <div className="rounded-lg border border-subtle surface-muted p-3 text-center text-sm text-faint">
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
    colorClass = 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
    icon = '✓';
  } else if (ratio >= 0.8) {
    label = 'Competitive offer';
    colorClass = 'text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
    icon = '~';
  } else if (ratio >= 0.7) {
    label = 'Your offer may be too low';
    colorClass = 'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800';
    icon = '!';
  } else {
    label = 'Your offer is unlikely to be accepted';
    colorClass = 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
    icon = '✗';
  }

  return (
    <div className={`rounded-lg border p-3 text-center text-sm font-medium ${colorClass}`}>
      <span className="mr-1.5 inline-block font-bold">{icon}</span>
      {label}
    </div>
  );
}
