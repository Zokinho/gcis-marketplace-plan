import { useState, useEffect } from 'react';
import BidForm from './BidForm';
import CoaUpload from './CoaUpload';
import TestResultsDisplay from './TestResultsDisplay';
import ShortlistButton from './ShortlistButton';
import { fetchProductById, type ProductDetail as ProductDetailType } from '../lib/api';
import { useUserStatus } from '../lib/useUserStatus';

const TYPE_COLORS: Record<string, string> = {
  Sativa: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  Indica: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  Hybrid: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
};

const CERT_COLORS: Record<string, string> = {
  GACP: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  GMP1: 'bg-brand-sage/20 text-brand-teal',
  GMP2: 'bg-brand-sage/20 text-brand-teal',
  GPP: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  'IMC-GAP': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

export default function ProductDetailContent({ productId }: { productId: string }) {
  const [product, setProduct] = useState<ProductDetailType | null>(null);
  const [canViewCoa, setCanViewCoa] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const { data: userStatus } = useUserStatus();
  const isSeller = userStatus?.user?.contactType?.includes('Seller') ?? false;
  const isAdmin = userStatus?.user?.isAdmin ?? false;

  useEffect(() => {
    setLoading(true);
    setSelectedImage(0);
    fetchProductById(productId)
      .then((p) => {
        setCanViewCoa(p.canViewCoa);
        setProduct(p);
      })
      .catch((err) => setError(err?.response?.data?.error || 'Product not found'))
      .finally(() => setLoading(false));
  }, [productId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-teal border-t-transparent" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="rounded-lg border border-default surface p-12 text-center">
        <h3 className="mb-2 text-lg font-semibold text-secondary">{error || 'Product not found'}</h3>
      </div>
    );
  }

  const budSizes = [
    { label: '0-1cm (Popcorn)', value: product.budSizePopcorn },
    { label: '1-2cm (Small)', value: product.budSizeSmall },
    { label: '2-3cm (Medium)', value: product.budSizeMedium },
    { label: '3-5cm (Large)', value: product.budSizeLarge },
    { label: '5cm+ (X-Large)', value: product.budSizeXLarge },
  ].filter((b) => b.value != null && b.value > 0);

  const terpenes = product.dominantTerpene?.split(';').map((t) => t.trim()).filter(Boolean) || [];

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left: Product info (2 cols) */}
      <div className="lg:col-span-2 space-y-6">
        {/* Image Gallery */}
        {product.imageUrls && product.imageUrls.length > 0 && (
          <div className="rounded-lg border border-brand-blue/15 bg-brand-blue/5 shadow-md p-4">
            <div className="mb-3 flex items-center justify-center overflow-hidden rounded-lg surface-muted" style={{ minHeight: '320px' }}>
              <img
                src={product.imageUrls[selectedImage]}
                alt={`${product.name} — image ${selectedImage + 1}`}
                className="max-h-[480px] w-full object-contain"
              />
            </div>
            {product.imageUrls.length > 1 && (
              <div className="flex gap-2 overflow-x-auto">
                {product.imageUrls.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedImage(i)}
                    className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 transition ${
                      i === selectedImage ? 'border-brand-teal' : 'border-transparent hover:border-default'
                    }`}
                  >
                    <img src={url} alt={`Thumbnail ${i + 1}`} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Header */}
        <div className="rounded-lg border border-brand-blue/15 border-l-4 border-l-brand-teal bg-brand-blue/5 shadow-md p-6">
          <div className="mb-3 flex flex-wrap gap-2">
            {product.category && (
              <span className="rounded-full bg-gray-100 dark:bg-slate-700 px-3 py-1 text-xs font-medium text-gray-600 dark:text-slate-300">{product.category}</span>
            )}
            {product.type && (
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${TYPE_COLORS[product.type] || 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                {product.type}
              </span>
            )}
            {product.certification && product.certification.split(', ').map((cert) => (
              <span key={cert} className={`rounded-full px-3 py-1 text-xs font-medium ${CERT_COLORS[cert.trim()] || 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                {cert.trim()}
              </span>
            ))}
          </div>

          <div className="mb-1 flex items-center justify-between gap-2">
            <h1 className="text-2xl font-bold text-primary">{product.name}</h1>
            <ShortlistButton productId={product.id} size="sm" />
          </div>
          {/* Priced to Sell badge — hidden while Spot Sales is active */}
          {(product.seller as any)?.avgFulfillmentScore != null && (
            <p className="text-xs text-faint">
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-sage/20 px-2 py-0.5 text-xs font-medium text-brand-blue">
                Seller Score: {((product.seller as any).avgFulfillmentScore as number).toFixed(0)}/100
              </span>
            </p>
          )}

          {/* Admin-only view stats */}
          {isAdmin && product.viewStats && (
            <div className="mt-1 flex gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-blue/10 px-2 py-0.5 text-xs font-medium text-brand-blue">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
                {product.viewStats.totalViews} view{product.viewStats.totalViews !== 1 ? 's' : ''}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-blue/10 px-2 py-0.5 text-xs font-medium text-brand-blue">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                </svg>
                {product.viewStats.uniqueViewers} unique viewer{product.viewStats.uniqueViewers !== 1 ? 's' : ''}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-yellow/20 px-2 py-0.5 text-xs font-medium text-brand-teal">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" d="M6.32 2.577a49.255 49.255 0 0 1 11.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 0 1-1.085.67L12 18.089l-7.165 3.583A.75.75 0 0 1 3.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93Z" clipRule="evenodd" />
                </svg>
                {product.viewStats.shortlistCount} shortlist{product.viewStats.shortlistCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {product.description && (
            <p className="mt-4 text-sm leading-relaxed text-secondary">{product.description}</p>
          )}
        </div>

        {/* Key specs */}
        <div className="rounded-lg border border-brand-blue/15 bg-brand-blue/5 shadow-md p-6">
          <h2 className="mb-4 border-l-2 border-brand-teal pl-3 text-sm font-bold uppercase tracking-wide text-brand-teal">Specifications</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Spec label="THC" value={formatRange(product.thcMin, product.thcMax, '%')} />
            <Spec label="CBD" value={formatRange(product.cbdMin, product.cbdMax, '%')} />
            <Spec label="Available" value={product.gramsAvailable != null ? `${product.gramsAvailable.toLocaleString()}g` : '—'} />
            {product.upcomingQty != null && product.upcomingQty > 0 && (
              <Spec label="Upcoming" value={`${product.upcomingQty.toLocaleString()}g`} />
            )}
            {product.minQtyRequest != null && (
              <Spec label="Min Order" value={`${product.minQtyRequest.toLocaleString()}g`} />
            )}
            {product.growthMedium && <Spec label="Growth Medium" value={product.growthMedium} />}
            {product.lineage && <Spec label="Lineage" value={product.lineage} />}
            {product.harvestDate && (
              <Spec label="Harvest Date" value={new Date(product.harvestDate).toLocaleDateString()} />
            )}
          </div>
        </div>

        {/* Terpene profile */}
        {(terpenes.length > 0 || product.highestTerpenes || product.aromas) && (
          <div className="rounded-lg border border-brand-blue/15 bg-brand-blue/5 shadow-md p-6">
            <h2 className="mb-4 border-l-2 border-brand-sage pl-3 text-sm font-bold uppercase tracking-wide text-brand-teal">Terpene Profile</h2>

            {terpenes.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-xs font-medium text-muted">Dominant Terpenes</p>
                <div className="flex flex-wrap gap-2">
                  {terpenes.map((t) => (
                    <span key={t} className="rounded-full bg-brand-sage/20 px-3 py-1 text-xs font-medium text-brand-teal">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {product.highestTerpenes && (
              <div className="mb-4">
                <p className="mb-1 text-xs font-medium text-muted">Breakdown</p>
                <p className="whitespace-pre-line text-sm text-secondary">{product.highestTerpenes}</p>
              </div>
            )}

            {product.aromas && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted">Aromas</p>
                <p className="whitespace-pre-line text-sm text-secondary">{product.aromas}</p>
              </div>
            )}
          </div>
        )}

        {/* Bud size distribution */}
        {budSizes.length > 0 && (
          <div className="rounded-lg border border-brand-blue/15 bg-brand-blue/5 shadow-md p-6">
            <h2 className="mb-4 border-l-2 border-brand-blue pl-3 text-sm font-bold uppercase tracking-wide text-brand-teal">Bud Size Distribution</h2>
            <div className="space-y-2">
              {budSizes.map((b) => (
                <div key={b.label} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-xs text-secondary">{b.label}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full bg-brand-teal transition-all"
                      style={{ width: `${b.value}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-xs font-medium text-secondary">{b.value}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CoA downloads — restricted to product owner / admins */}
        {canViewCoa && product.coaUrls.length > 0 && (
          <div className="rounded-lg border border-brand-blue/15 bg-brand-blue/5 shadow-md p-6">
            <h2 className="mb-3 border-l-2 border-brand-teal pl-3 text-sm font-bold uppercase tracking-wide text-brand-teal">Certificates of Analysis</h2>
            <div className="flex flex-wrap gap-2">
              {product.coaUrls.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-brand-teal transition hover:bg-brand-sage/10"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  CoA {i + 1}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* CoA Test Results (from AI extraction) — restricted to product owner / admins */}
        {canViewCoa && product.testResults && (
          <div className="rounded-lg border border-brand-blue/15 bg-brand-blue/5 shadow-md p-6">
            <h2 className="mb-4 border-l-2 border-brand-blue pl-3 text-sm font-bold uppercase tracking-wide text-brand-teal">CoA Data</h2>
            {product.coaPdfUrl && (
              <a
                href={product.coaPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-4 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-brand-teal transition hover:bg-brand-sage/10"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download CoA PDF
              </a>
            )}
            <TestResultsDisplay
              testResults={product.testResults}
              labName={product.labName}
              testDate={product.testDate}
              reportNumber={product.reportNumber}
            />
          </div>
        )}

        {/* Restricted notice for buyers */}
        {!canViewCoa && (
          <div className="rounded-lg border border-dashed border-default surface-muted p-6">
            <div className="flex items-center gap-3 text-faint">
              <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
              <p className="text-sm">Certificate of Analysis documents are available to product owners and administrators.</p>
            </div>
          </div>
        )}

        {/* CoA Upload for sellers viewing their own product */}
        {canViewCoa && isSeller && !product.testResults && (
          <div className="rounded-lg border border-brand-blue/15 bg-brand-blue/5 shadow-md p-6">
            <h2 className="mb-4 border-l-2 border-brand-sage pl-3 text-sm font-bold uppercase tracking-wide text-brand-teal">Upload CoA</h2>
            <p className="mb-4 text-sm text-muted">
              Upload a Certificate of Analysis PDF to auto-fill test results for this product.
            </p>
            <CoaUpload onProductCreated={() => window.location.reload()} />
          </div>
        )}
      </div>

      {/* Right: Bid form (1 col) */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <BidForm
          productId={product.id}
          productName={product.name}
          sellerPrice={product.pricePerUnit}
          minQty={product.minQtyRequest}
        />
      </div>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg surface-muted px-3 py-2">
      <p className="text-xs font-medium text-faint">{label}</p>
      <p className="text-sm font-semibold text-primary">{value}</p>
    </div>
  );
}

function formatRange(min: number | null, max: number | null, suffix: string): string {
  if (min != null && max != null) {
    if (min === max) return `${min}${suffix}`;
    return `${min}–${max}${suffix}`;
  }
  if (max != null) return `${max}${suffix}`;
  if (min != null) return `${min}+${suffix}`;
  return '—';
}
