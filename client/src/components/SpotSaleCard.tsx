import { useState, useEffect } from 'react';
import type { SpotSaleRecord } from '../lib/api';

const TYPE_COLORS: Record<string, string> = {
  Sativa: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  Indica: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  Hybrid: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
};

const CERT_COLORS: Record<string, string> = {
  GACP: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  GMP1: 'bg-brand-sage/20 text-brand-teal dark:bg-brand-sage/15 dark:text-brand-sage',
  GMP2: 'bg-brand-sage/20 text-brand-teal dark:bg-brand-sage/15 dark:text-brand-sage',
  GPP: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  'IMC-GAP': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

function useCountdown(expiresAt: string) {
  const [remaining, setRemaining] = useState(() => getRemaining(expiresAt));

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(getRemaining(expiresAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return remaining;
}

function getRemaining(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 };

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { expired: false, days, hours, minutes, seconds };
}

function formatCountdown(r: { expired: boolean; days: number; hours: number; minutes: number; seconds: number }) {
  if (r.expired) return 'Expired';
  if (r.days > 0) return `${r.days}d ${r.hours}h ${r.minutes}m remaining`;
  if (r.hours > 0) return `${r.hours}h ${r.minutes}m ${r.seconds}s remaining`;
  return `${r.minutes}m ${r.seconds}s remaining`;
}

function formatRange(min: number | null, max: number | null): string {
  if (min != null && max != null) {
    if (min === max) return `${min}`;
    return `${min}–${max}`;
  }
  if (max != null) return `${max}`;
  if (min != null) return `${min}+`;
  return '—';
}

export default function SpotSaleCard({
  spotSale,
  onContact,
}: {
  spotSale: SpotSaleRecord;
  onContact: (spotSale: SpotSaleRecord) => void;
}) {
  const { product } = spotSale;
  const countdown = useCountdown(spotSale.expiresAt);

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border card-blue shadow-md backdrop-blur-sm">
      {/* Discount badge */}
      <div className="absolute right-3 top-3 z-10 rounded-full bg-brand-coral px-2.5 py-1 text-xs font-bold text-white shadow-md">
        -{Math.round(spotSale.discountPercent)}% OFF
      </div>

      {/* Expired overlay */}
      {countdown.expired && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-black/50 backdrop-blur-sm">
          <span className="rounded-lg bg-gray-900/80 px-4 py-2 text-sm font-semibold text-white">
            Expired
          </span>
        </div>
      )}

      {/* Image */}
      <div className="flex h-40 items-center justify-center bg-brand-gray/20 dark:bg-slate-700/40 p-3">
        {product.imageUrls?.[0] ? (
          <img src={product.imageUrls[0]} alt={product.name} className="h-full w-full rounded-md object-cover" />
        ) : (
          <svg className="h-12 w-12 text-brand-teal/20 dark:text-brand-sage/30" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
          </svg>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        {/* Badges */}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {product.category && (
            <span className="rounded-full bg-gray-100 dark:bg-slate-700 px-2 py-0.5 text-xs font-medium text-secondary">
              {product.category}
            </span>
          )}
          {product.type && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[product.type] || 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300'}`}>
              {product.type}
            </span>
          )}
          {product.certification && product.certification.split(', ').map((cert) => (
            <span key={cert} className={`rounded-full px-2 py-0.5 text-xs font-medium ${CERT_COLORS[cert.trim()] || 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300'}`}>
              {cert.trim()}
            </span>
          ))}
        </div>

        {/* Name */}
        <h3 className="mb-1 text-sm font-semibold text-primary">
          {product.name}
        </h3>

        {/* THC / CBD */}
        <div className="mb-3 flex gap-3 text-xs">
          {(product.thcMin != null || product.thcMax != null) && (
            <span className="text-secondary">
              THC {formatRange(product.thcMin, product.thcMax)}%
            </span>
          )}
          {(product.cbdMin != null || product.cbdMax != null) && (
            <span className="text-secondary">
              CBD {formatRange(product.cbdMin, product.cbdMax)}%
            </span>
          )}
        </div>

        {/* Price */}
        <div className="mb-3 flex items-baseline gap-2">
          <span className="text-lg font-bold text-brand-teal dark:text-brand-sage">
            ${spotSale.spotPrice.toFixed(2)}/g
          </span>
          <span className="text-sm text-faint line-through">
            ${spotSale.originalPrice.toFixed(2)}/g
          </span>
        </div>

        {/* Countdown */}
        <div className="mb-3 flex items-center gap-1.5 text-xs">
          <svg className="h-4 w-4 text-amber-500 dark:text-brand-yellow" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <span className={countdown.expired ? 'font-medium text-red-500' : 'font-medium text-amber-600 dark:text-brand-yellow'}>
            {formatCountdown(countdown)}
          </span>
        </div>

        {/* Contact button + availability */}
        <div className="mt-auto">
          <button
            onClick={() => onContact(spotSale)}
            disabled={countdown.expired}
            className="mb-2 w-full rounded-lg bg-brand-teal px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-blue disabled:cursor-not-allowed disabled:opacity-50"
          >
            Contact to Buy
          </button>
          {((spotSale.quantity ?? product.gramsAvailable ?? 0) > 0) && (
            <p className="text-center text-xs text-faint">
              {(spotSale.quantity ?? product.gramsAvailable)?.toLocaleString()}g at spot price
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
