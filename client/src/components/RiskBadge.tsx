const RISK_COLORS: Record<string, string> = {
  critical: 'bg-red-100 dark:bg-red-900/30 text-brand-coral',
  high: 'bg-brand-yellow/20 text-brand-yellow',
  medium: 'bg-brand-yellow/10 text-brand-yellow',
  low: 'bg-brand-sage/20 text-brand-sage',
};

export default function RiskBadge({ level }: { level: string }) {
  const colorClass = RISK_COLORS[level] || 'bg-brand-gray text-primary';
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${colorClass}`}>
      {level}
    </span>
  );
}
