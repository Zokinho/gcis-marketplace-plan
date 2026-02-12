import { Link } from 'react-router-dom';
import type { MatchRecord } from '../lib/api';

interface Props {
  match: MatchRecord;
  onDismiss?: (id: string) => void;
  dismissing?: boolean;
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'bg-brand-blue/10 text-brand-blue';
  if (score >= 60) return 'bg-brand-yellow/20 text-brand-yellow';
  if (score >= 40) return 'bg-brand-coral/10 text-brand-coral';
  return 'bg-red-100 dark:bg-red-900/30 text-brand-coral';
}

export default function MatchCard({ match, onDismiss, dismissing }: Props) {
  const product = match.product;
  const insights = match.insights || [];

  return (
    <div className="rounded-lg border border-brand-blue/15 bg-brand-blue/5 shadow-md p-4 transition hover:shadow-lg">
      <div className="mb-3 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <Link
            to={`/marketplace/${product.id}`}
            className="text-base font-semibold text-primary hover:text-brand-blue transition"
          >
            {product.name}
          </Link>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-bold ${getScoreColor(match.score)}`}>
          {Math.round(match.score)}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
        {product.pricePerUnit != null && (
          <span>${product.pricePerUnit.toFixed(2)}/g</span>
        )}
        {product.gramsAvailable != null && (
          <span>{product.gramsAvailable.toLocaleString()}g available</span>
        )}
        {product.category && <span>{product.category}</span>}
        {product.type && <span>{product.type}</span>}
      </div>

      {insights.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {insights.slice(0, 3).map((insight, i) => {
            const color = insight.type === 'positive' ? 'bg-brand-sage/20 text-brand-sage'
              : insight.type === 'urgent' ? 'bg-brand-yellow/20 text-brand-yellow'
              : insight.type === 'warning' ? 'bg-red-50 dark:bg-red-900/20 text-brand-coral'
              : 'bg-brand-offwhite dark:bg-slate-700 text-primary';
            return (
              <span key={i} className={`rounded-full px-2 py-0.5 text-xs ${color}`}>
                {insight.text}
              </span>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        <Link
          to={`/marketplace/${product.id}`}
          className="rounded-lg bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-teal"
        >
          View Product
        </Link>
        {onDismiss && (
          <button
            onClick={() => onDismiss(match.id)}
            disabled={dismissing}
            className="rounded-lg border border-subtle px-3 py-1.5 text-xs font-medium text-primary transition hover-surface-muted disabled:opacity-50"
          >
            Not Interested
          </button>
        )}
      </div>
    </div>
  );
}
