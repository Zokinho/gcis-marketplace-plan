import { Link } from 'react-router-dom';
import type { ProductCard as ProductCardType } from '../lib/api';

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

export default function ProductCard({ product }: { product: ProductCardType }) {
  const available = (product.gramsAvailable ?? 0) > 0;
  const upcoming = (product.upcomingQty ?? 0) > 0;

  return (
    <Link
      to={`/marketplace/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg hover:border-brand-sage/60"
    >
      {/* Image */}
      <div className="flex h-40 items-center justify-center bg-gradient-to-br from-brand-sage/10 to-brand-gray/40">
        {product.imageUrls?.[0] ? (
          <img src={product.imageUrls[0]} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <svg className="h-12 w-12 text-brand-teal/20" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
          </svg>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        {/* Badges */}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {product.category && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {product.category}
            </span>
          )}
          {product.type && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[product.type] || 'bg-gray-100 text-gray-600'}`}>
              {product.type}
            </span>
          )}
          {product.certification && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CERT_COLORS[product.certification] || 'bg-gray-100 text-gray-600'}`}>
              {product.certification}
            </span>
          )}
        </div>

        {/* Name */}
        <h3 className="mb-1 text-sm font-semibold text-gray-900 group-hover:text-brand-teal">
          {product.name}
        </h3>

        {/* THC / CBD */}
        <div className="mb-3 flex gap-3 text-xs">
          {(product.thcMin != null || product.thcMax != null) && (
            <span className="text-gray-600">
              THC {formatRange(product.thcMin, product.thcMax)}%
            </span>
          )}
          {(product.cbdMin != null || product.cbdMax != null) && (
            <span className="text-gray-600">
              CBD {formatRange(product.cbdMin, product.cbdMax)}%
            </span>
          )}
        </div>

        {/* Price + Availability */}
        <div className="mt-auto flex items-end justify-between">
          <div>
            {product.pricePerUnit != null ? (
              <p className="text-lg font-bold text-gray-900">${product.pricePerUnit.toFixed(2)}<span className="text-xs font-normal text-gray-400">/g</span></p>
            ) : (
              <p className="text-sm text-gray-400">Price on request</p>
            )}
          </div>

          <div className="text-right text-xs">
            {available ? (
              <span className="font-medium text-brand-teal">{product.gramsAvailable?.toLocaleString()}g available</span>
            ) : upcoming ? (
              <span className="font-medium text-amber-600">Upcoming</span>
            ) : (
              <span className="text-gray-400">Out of stock</span>
            )}
          </div>
        </div>
      </div>
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
