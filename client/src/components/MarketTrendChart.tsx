import type { MarketTrend } from '../lib/api';

const TREND_ICONS: Record<string, string> = {
  up: '↑',
  down: '↓',
  stable: '→',
};

const TREND_COLORS: Record<string, string> = {
  up: 'text-brand-sage',
  down: 'text-brand-coral',
  stable: 'text-brand-dark',
};

export default function MarketTrendChart({ trends }: { trends: MarketTrend[] }) {
  if (trends.length === 0) {
    return <p className="text-sm text-gray-400">No market data yet</p>;
  }

  const maxVolume = Math.max(...trends.map(t => t.volume), 1);

  return (
    <div className="space-y-3">
      {trends.map((trend) => (
        <div key={trend.categoryName} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-xs font-medium text-brand-dark">
            {trend.categoryName}
          </span>
          <div className="h-4 flex-1 overflow-hidden rounded-full bg-brand-gray">
            <div
              className="h-full rounded-full bg-brand-blue transition-all"
              style={{ width: `${(trend.volume / maxVolume) * 100}%` }}
            />
          </div>
          <span className="w-16 text-right text-xs font-medium text-brand-dark">
            ${trend.currentAvgPrice.toFixed(2)}
          </span>
          <span className={`w-12 text-right text-xs font-semibold ${TREND_COLORS[trend.trend]}`}>
            {TREND_ICONS[trend.trend]} {Math.abs(trend.percentChange).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}
