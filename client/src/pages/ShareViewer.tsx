import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  validateShareToken,
  fetchSharedProducts,
  fetchSharedIsos,
  type ShareValidation,
  type SharedProduct,
  type SharedIso,
} from '../lib/api';
import HarvexLogo from '../components/HarvexLogo';

const TYPE_COLORS: Record<string, string> = {
  Sativa: 'bg-orange-100 dark:bg-orange-900/20 text-orange-700',
  Indica: 'bg-purple-100 dark:bg-purple-900/20 text-purple-700',
  Hybrid: 'bg-teal-100 dark:bg-teal-900/20 text-teal-700',
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-green-100 dark:bg-green-900/20 text-green-700',
  MATCHED: 'bg-blue-100 dark:bg-blue-900/20 text-blue-700',
  FULFILLED: 'bg-brand-sage/20 text-brand-teal',
  CLOSED: 'bg-gray-100 dark:bg-gray-700/30 text-gray-500',
  EXPIRED: 'bg-red-100 dark:bg-red-900/20 text-red-600',
};

export default function ShareViewer() {
  const { token } = useParams<{ token: string }>();
  const [validation, setValidation] = useState<ShareValidation | null>(null);
  const [products, setProducts] = useState<SharedProduct[]>([]);
  const [isos, setIsos] = useState<SharedIso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'products' | 'isos'>('products');

  useEffect(() => {
    if (!token) return;
    setLoading(true);

    validateShareToken(token)
      .then(async (v) => {
        setValidation(v);

        const fetches: Promise<void>[] = [];

        if (v.productCount > 0) {
          fetches.push(
            fetchSharedProducts(token).then((data) => { setProducts(data.products); }),
          );
        }
        if (v.isoCount > 0) {
          fetches.push(
            fetchSharedIsos(token).then((data) => { setIsos(data.isos); }),
          );
        }

        await Promise.all(fetches);

        // Set default tab based on what's available
        if (v.productCount === 0 && v.isoCount > 0) {
          setActiveTab('isos');
        }
      })
      .catch((err) => {
        const status = err?.response?.status;
        if (status === 404) setError('This share link is invalid or no longer active.');
        else if (status === 410) setError('This share link has expired.');
        else setError('Unable to load shared content.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  const hasProducts = (validation?.productCount ?? 0) > 0;
  const hasIsos = (validation?.isoCount ?? 0) > 0;
  const hasBoth = hasProducts && hasIsos;

  // Build header summary
  const headerParts: string[] = [];
  if (products.length > 0) headerParts.push(`${products.length} products`);
  if (isos.length > 0) headerParts.push(`${isos.length} wanted requests`);
  const headerSummary = headerParts.join(' + ');

  // Derive heading
  const heading = validation?.label || (hasIsos && !hasProducts ? 'Wanted Requests' : 'Shared Products');

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center surface-base">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-teal border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center surface-base">
        <div className="max-w-md rounded-lg surface p-8 text-center shadow-lg">
          <h2 className="mb-2 text-xl font-semibold text-primary">Share Link</h2>
          <p className="text-muted">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen surface-base">
      {/* Header */}
      <header className="bg-brand-blue dark:bg-gradient-to-r dark:from-brand-teal dark:to-brand-blue px-4 py-5 text-white shadow-sm">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between">
            <div>
              <HarvexLogo size="sm" color="white" />
              <h1 className="text-xl font-bold">{heading}</h1>
            </div>
            <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-medium backdrop-blur-sm">{headerSummary}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Tab bar (only when both products + ISOs) */}
        {hasBoth && (
          <div className="mb-6 flex gap-1 rounded-lg surface-muted p-1">
            <button
              onClick={() => setActiveTab('products')}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
                activeTab === 'products'
                  ? 'surface text-primary shadow-sm'
                  : 'text-muted hover:text-secondary'
              }`}
            >
              Products ({products.length})
            </button>
            <button
              onClick={() => setActiveTab('isos')}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
                activeTab === 'isos'
                  ? 'surface text-primary shadow-sm'
                  : 'text-muted hover:text-secondary'
              }`}
            >
              Wanted Requests ({isos.length})
            </button>
          </div>
        )}

        {/* Products grid */}
        {(activeTab === 'products' && hasProducts) && (
          products.length === 0 ? (
            <div className="rounded-lg border border-subtle surface p-12 text-center">
              <p className="text-sm text-muted">No products available in this share</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => (
                <Link
                  key={product.id}
                  to={`/share/${token}/product/${product.id}`}
                  className="group flex flex-col overflow-hidden rounded-lg border border-subtle surface transition hover:-translate-y-0.5 hover:shadow-lg hover:border-brand-sage/60"
                >
                  <ShareCardImage src={product.imageUrls?.[0]} alt={product.name} />
                  <div className="p-5">
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {product.category && (
                        <span className="rounded-full surface-muted px-2 py-0.5 text-[10px] font-medium text-secondary">
                          {product.category}
                        </span>
                      )}
                      {product.type && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_COLORS[product.type] || 'surface-muted text-secondary'}`}>
                          {product.type}
                        </span>
                      )}
                      {product.labName && (
                        <span className="rounded-full bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                          CoA Verified
                        </span>
                      )}
                    </div>
                    <h3 className="mb-1 font-semibold text-primary group-hover:text-brand-teal">{product.name}</h3>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {product.thcMax != null && (
                        <div>
                          <span className="text-faint">THC:</span>{' '}
                          <span className="font-medium text-secondary">{product.thcMax}%</span>
                        </div>
                      )}
                      {product.cbdMax != null && product.cbdMax > 0 && (
                        <div>
                          <span className="text-faint">CBD:</span>{' '}
                          <span className="font-medium text-secondary">{product.cbdMax}%</span>
                        </div>
                      )}
                      {product.gramsAvailable != null && (
                        <div>
                          <span className="text-faint">Available:</span>{' '}
                          <span className="font-medium text-secondary">{product.gramsAvailable.toLocaleString()}g</span>
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )
        )}

        {/* ISOs grid */}
        {(activeTab === 'isos' && hasIsos) && (
          isos.length === 0 ? (
            <div className="rounded-lg border border-subtle surface p-12 text-center">
              <p className="text-sm text-muted">No wanted requests available in this share</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {isos.map((iso) => (
                <SharedIsoCard key={iso.id} iso={iso} />
              ))}
            </div>
          )
        )}
      </main>
    </div>
  );
}

function SharedIsoCard({ iso }: { iso: SharedIso }) {
  const expiryText = iso.expiresAt ? getExpiryText(iso.expiresAt) : null;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-subtle surface">
      {/* Header bar */}
      <div className="flex items-center justify-between bg-brand-teal/5 dark:bg-brand-teal/10 px-5 py-3">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[iso.status] || 'surface-muted text-secondary'}`}>
          {iso.status}
        </span>
        {iso.responseCount != null && iso.responseCount > 0 && (
          <span className="text-[10px] text-faint">{iso.responseCount} response{iso.responseCount !== 1 ? 's' : ''}</span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        {/* Title */}
        <h3 className="mb-2 font-semibold text-primary">{iso.title}</h3>

        {/* Badges */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {iso.category && (
            <span className="rounded-full surface-muted px-2 py-0.5 text-[10px] font-medium text-secondary">
              {iso.category}
            </span>
          )}
          {iso.type && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_COLORS[iso.type] || 'surface-muted text-secondary'}`}>
              {iso.type}
            </span>
          )}
          {iso.certification && (
            <span className="rounded-full bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 text-[10px] font-medium text-amber-700">
              {iso.certification}
            </span>
          )}
        </div>

        {/* Criteria */}
        <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
          {(iso.thcMin != null || iso.thcMax != null) && (
            <div>
              <span className="text-faint">THC:</span>{' '}
              <span className="font-medium text-secondary">
                {iso.thcMin != null && iso.thcMax != null
                  ? `${iso.thcMin}–${iso.thcMax}%`
                  : iso.thcMin != null
                    ? `${iso.thcMin}%+`
                    : `up to ${iso.thcMax}%`}
              </span>
            </div>
          )}
          {(iso.cbdMin != null || iso.cbdMax != null) && (
            <div>
              <span className="text-faint">CBD:</span>{' '}
              <span className="font-medium text-secondary">
                {iso.cbdMin != null && iso.cbdMax != null
                  ? `${iso.cbdMin}–${iso.cbdMax}%`
                  : iso.cbdMin != null
                    ? `${iso.cbdMin}%+`
                    : `up to ${iso.cbdMax}%`}
              </span>
            </div>
          )}
          {(iso.quantityMin != null || iso.quantityMax != null) && (
            <div>
              <span className="text-faint">Qty:</span>{' '}
              <span className="font-medium text-secondary">
                {iso.quantityMin != null && iso.quantityMax != null
                  ? `${iso.quantityMin.toLocaleString()}–${iso.quantityMax.toLocaleString()}g`
                  : iso.quantityMin != null
                    ? `${iso.quantityMin.toLocaleString()}g+`
                    : `up to ${iso.quantityMax!.toLocaleString()}g`}
              </span>
            </div>
          )}
          {iso.budgetMax != null && (
            <div>
              <span className="text-faint">Budget:</span>{' '}
              <span className="font-medium text-secondary">up to ${iso.budgetMax.toFixed(2)}/g</span>
            </div>
          )}
        </div>

        {/* Notes */}
        {iso.notes && (
          <p className="mb-3 text-xs text-muted line-clamp-2">{iso.notes}</p>
        )}

        {/* Expiry footer */}
        {expiryText && (
          <div className="mt-auto pt-3 border-t border-subtle">
            <span className={`text-[10px] ${expiryText.urgent ? 'text-red-500 font-medium' : 'text-faint'}`}>
              {expiryText.text}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function getExpiryText(expiresAt: string): { text: string; urgent: boolean } {
  const expiry = new Date(expiresAt);
  const now = new Date();
  const diffMs = expiry.getTime() - now.getTime();

  if (diffMs <= 0) return { text: 'Expired', urgent: true };

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 7) return { text: `Expires ${expiry.toLocaleDateString()}`, urgent: false };
  if (days > 0) return { text: `${days}d ${hours}h left`, urgent: days <= 3 };
  return { text: `${hours}h left`, urgent: true };
}

function ImagePlaceholder() {
  return (
    <div className="flex h-40 items-center justify-center bg-brand-gray/20 dark:bg-slate-700/40">
      <svg className="h-10 w-10 text-brand-teal/20 dark:text-brand-sage/30" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
      </svg>
    </div>
  );
}

function ShareCardImage({ src, alt }: { src?: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) return <ImagePlaceholder />;

  return (
    <div className="h-40 bg-brand-gray/20 dark:bg-slate-700/40">
      <img src={src} alt={alt} className="h-full w-full object-cover" onError={() => setFailed(true)} />
    </div>
  );
}
