import { Link } from 'react-router-dom';
import type { ProductCard } from '../lib/api';

const TYPE_COLORS: Record<string, string> = {
  Sativa: 'bg-orange-100 text-orange-700',
  Indica: 'bg-purple-100 text-purple-700',
  Hybrid: 'bg-teal-100 text-teal-700',
};

const CERT_COLORS: Record<string, string> = {
  GACP: 'bg-blue-100 text-blue-700',
  GMP1: 'bg-brand-sage/20 text-brand-teal',
  GMP2: 'bg-brand-sage/20 text-brand-teal',
  GPP: 'bg-cyan-100 text-cyan-700',
  'IMC-GAP': 'bg-amber-100 text-amber-700',
};

export default function ProductListItem({ product }: { product: ProductCard }) {
  const available = (product.gramsAvailable ?? 0) > 0;
  const upcoming = (product.upcomingQty ?? 0) > 0;

  return (
    <Link
      to={`/marketplace/${product.id}`}
      className="group flex items-center gap-4 rounded-lg border bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-md hover:border-brand-sage/60"
    >
      {/* Thumbnail */}
      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-brand-sage/10 to-brand-gray/40">
        {product.imageUrls?.[0] ? (
          <img src={product.imageUrls[0]} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg className="h-6 w-6 text-brand-teal/20" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
            </svg>
          </div>
        )}
      </div>

      {/* Name + badges */}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <h3 className="text-sm font-semibold text-gray-900 group-hover:text-brand-teal">{product.name}</h3>
          {product.category && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">{product.category}</span>
          )}
          {product.type && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_COLORS[product.type] || 'bg-gray-100 text-gray-600'}`}>{product.type}</span>
          )}
          {product.certification && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CERT_COLORS[product.certification] || 'bg-gray-100 text-gray-600'}`}>{product.certification}</span>
          )}
          {product.labName && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">CoA Verified</span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-0.5 text-xs text-gray-500">
          {(product.thcMin != null || product.thcMax != null) && (
            <span>THC <span className="font-semibold text-gray-700">{formatRange(product.thcMin, product.thcMax)}%</span></span>
          )}
          {(product.cbdMin != null || product.cbdMax != null) && (
            <span>CBD <span className="font-semibold text-gray-700">{formatRange(product.cbdMin, product.cbdMax)}%</span></span>
          )}
          {product.licensedProducer && (
            <span>LP <span className="font-semibold text-gray-700">{product.licensedProducer}</span></span>
          )}
        </div>
      </div>

      {/* Availability */}
      <div className="hidden flex-shrink-0 text-right sm:block">
        <p className="text-xs">
          {available ? (
            <span className="font-medium text-brand-teal">{product.gramsAvailable?.toLocaleString()}g available</span>
          ) : upcoming ? (
            <span className="font-medium text-amber-600">Upcoming</span>
          ) : (
            <span className="text-gray-400">Out of stock</span>
          )}
        </p>
      </div>

      {/* Arrow */}
      <svg className="hidden h-4 w-4 flex-shrink-0 text-gray-300 group-hover:text-brand-teal sm:block" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
      </svg>
    </Link>
  );
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
