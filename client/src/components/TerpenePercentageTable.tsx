import { useMemo } from 'react';

interface TerpenePercentageTableProps {
  terpenes: string[];
  percentages: Record<string, string>;
  onChange: (p: Record<string, string>) => void;
  totalPercent: string;
  onTotalChange: (v: string) => void;
}

export default function TerpenePercentageTable({ terpenes, percentages, onChange, totalPercent, onTotalChange }: TerpenePercentageTableProps) {
  if (terpenes.length === 0) return null;

  // Show only top 5 terpenes by percentage (descending), rest are hidden but still count toward total
  const top5 = useMemo(() => {
    return [...terpenes]
      .sort((a, b) => (parseFloat(percentages[b]) || 0) - (parseFloat(percentages[a]) || 0))
      .slice(0, 5);
  }, [terpenes, percentages]);

  const hiddenCount = terpenes.length - top5.length;

  function handleChange(terpene: string, value: string) {
    const dot = value.indexOf('.');
    const clamped = dot >= 0 && value.length - dot > 3 ? value.slice(0, dot + 3) : value;
    onChange({ ...percentages, [terpene]: clamped });
  }

  function handleTotalChange(value: string) {
    const dot = value.indexOf('.');
    const clamped = dot >= 0 && value.length - dot > 3 ? value.slice(0, dot + 3) : value;
    onTotalChange(clamped);
  }

  return (
    <div className="mt-3 rounded-lg border border-default surface-muted p-3">
      <p className="mb-2 text-xs font-medium text-muted">Per-Terpene Percentages (optional — top 5 shown)</p>
      <div className="space-y-1.5">
        {top5.map((t) => (
          <div key={t} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs text-secondary">{t}</span>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={percentages[t] ?? ''}
              onChange={(e) => handleChange(t, e.target.value)}
              placeholder="%"
              className="w-20 input-field text-xs"
            />
          </div>
        ))}
      </div>
      {hiddenCount > 0 && (
        <p className="mt-1.5 text-xs text-muted">
          +{hiddenCount} more terpene{hiddenCount !== 1 ? 's' : ''} included in total
        </p>
      )}
      <div className="mt-2 flex items-center gap-2 border-t border-default pt-1.5">
        <span className="flex-1 text-xs font-medium text-muted">Total Terpenes %</span>
        <input
          type="number"
          step="0.01"
          min="0"
          max="100"
          value={totalPercent}
          onChange={(e) => handleTotalChange(e.target.value)}
          placeholder="%"
          className="w-20 input-field text-xs font-semibold"
        />
      </div>
    </div>
  );
}
