import { Link } from 'react-router-dom';
import type { ProductCard as ProductCardType } from '../lib/api';
import ShortlistButton from './ShortlistButton';
import ShareButton from './ShareButton';
import ProductImage from './ProductImage';
import ProductPlaceholder from './ProductPlaceholder';

const TYPE_COLORS: Record<string, string> = {
  Sativa: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  Indica: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  Hybrid: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
};

const CERT_COLORS: Record<string, string> = {
  GACP: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  GMP1: 'bg-brand-sage/20 text-brand-teal dark:bg-brand-sage/15 dark:text-brand-sage teal:bg-white/20 teal:text-brand-yellow',
  GMP2: 'bg-brand-sage/20 text-brand-teal dark:bg-brand-sage/15 dark:text-brand-sage teal:bg-white/20 teal:text-brand-yellow',
  GPP: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  'IMC-GAP': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

export default function ProductCard({ product, large, onClick }: { product: ProductCardType; large?: boolean; onClick?: (productId: string) => void }) {
  const available = (product.gramsAvailable ?? 0) > 0;
  const upcoming = (product.upcomingQty ?? 0) > 0;

  const className = "group flex flex-col overflow-hidden rounded-lg border card-blue shadow-md transition-shadow hover:shadow-xl backdrop-blur-sm";

  const content = (
    <>
      {/* Image */}
      <div className={`overflow-hidden ${large ? 'h-72' : 'h-40'}`}>
        {product.imageUrls?.[0] ? (
          <ProductImage src={product.imageUrls[0]} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <ProductPlaceholder productId={product.id} className="h-full w-full" iconSize={large ? 'h-14 w-14' : 'h-10 w-10'} />
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        {/* Badges + Shortlist */}
        <div className="mb-2 flex items-start justify-between gap-1">
          <div className="flex flex-wrap gap-1.5">
            {product.category && (
              <span className="rounded-full surface-muted px-2 py-0.5 text-xs font-medium text-secondary">
                {product.category}
              </span>
            )}
            {product.type && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[product.type] || 'surface-muted text-secondary'}`}>
                {product.type}
              </span>
            )}
            {product.certification && product.certification.split(', ').map((cert) => (
              <span key={cert} className={`rounded-full px-2 py-0.5 text-xs font-medium ${CERT_COLORS[cert.trim()] || 'surface-muted text-secondary'}`}>
                {cert.trim()}
              </span>
            ))}
          </div>
          <div className="flex flex-shrink-0 items-center gap-0.5">
            <ShareButton productId={product.id} productName={product.name} sellerId={product.sellerId} />
            <ShortlistButton productId={product.id} />
          </div>
        </div>

        {/* Priced to Sell badge — hidden while Clearance is active */}

        {/* Name + Available */}
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-primary group-hover:text-brand-teal dark:group-hover:text-brand-yellow truncate">
            {product.name}
          </h3>
          <span className="flex-shrink-0 text-xs font-medium">
            {available ? (
              <span className="text-brand-teal dark:text-brand-sage">{product.gramsAvailable?.toLocaleString()}g available</span>
            ) : upcoming ? (
              <span className="text-amber-600 teal:text-brand-yellow">{product.upcomingQty?.toLocaleString()}g upcoming</span>
            ) : (
              <span className="text-faint">Out of stock</span>
            )}
          </span>
        </div>

        {/* THC / CBD + Upcoming */}
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
          <div className="flex gap-3">
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
          {available && upcoming && (
            <span className="flex-shrink-0 font-medium text-amber-600 teal:text-brand-yellow">{product.upcomingQty?.toLocaleString()}g upcoming</span>
          )}
        </div>
      </div>
    </>
  );

  if (onClick) {
    return (
      <div className={className + ' cursor-pointer'} onClick={() => onClick(product.id)}>
        {content}
      </div>
    );
  }

  return (
    <Link to={`/marketplace/${product.id}`} className={className}>
      {content}
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
