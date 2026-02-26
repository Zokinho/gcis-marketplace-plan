interface TerpenePercentageTableProps {
  terpenes: string[];
  percentages: Record<string, string>;
  onChange: (p: Record<string, string>) => void;
}

export default function TerpenePercentageTable({ terpenes, percentages, onChange }: TerpenePercentageTableProps) {
  if (terpenes.length === 0) return null;

  const sum = terpenes.reduce((acc, t) => acc + (parseFloat(percentages[t]) || 0), 0);

  function handleChange(terpene: string, value: string) {
    onChange({ ...percentages, [terpene]: value });
  }

  return (
    <div className="mt-3 rounded-lg border border-default surface-muted p-3">
      <p className="mb-2 text-xs font-medium text-muted">Per-Terpene Percentages (optional)</p>
      <div className="space-y-1.5">
        {terpenes.map((t) => (
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
      {sum > 0 && (
        <p className="mt-2 border-t border-default pt-1.5 text-xs text-muted">
          Total: <span className="font-semibold text-secondary">{sum.toFixed(2)}%</span>
        </p>
      )}
    </div>
  );
}
