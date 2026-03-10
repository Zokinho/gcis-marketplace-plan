import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  validateShareToken,
  fetchSharedProducts,
  type ShareValidation,
  type SharedProduct,
} from '../lib/api';
import HarvexLogo from '../components/HarvexLogo';

const TYPE_COLORS: Record<string, string> = {
  Sativa: 'bg-orange-100 dark:bg-orange-900/20 text-orange-700',
  Indica: 'bg-purple-100 dark:bg-purple-900/20 text-purple-700',
  Hybrid: 'bg-teal-100 dark:bg-teal-900/20 text-teal-700',
};

export default function ShareViewer() {
  const { token } = useParams<{ token: string }>();
  const [validation, setValidation] = useState<ShareValidation | null>(null);
  const [products, setProducts] = useState<SharedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);

    Promise.all([validateShareToken(token), fetchSharedProducts(token)])
      .then(([v, data]) => {
        setValidation(v);
        setProducts(data.products);
      })
      .catch((err) => {
        const status = err?.response?.status;
        if (status === 404) setError('This share link is invalid or no longer active.');
        else if (status === 410) setError('This share link has expired.');
        else setError('Unable to load shared products.');
      })
      .finally(() => setLoading(false));
  }, [token]);

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
              <h1 className="text-xl font-bold">{validation?.label || 'Shared Products'}</h1>
            </div>
            <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-medium backdrop-blur-sm">{products.length} products</span>
          </div>
        </div>
      </header>

      {/* Product grid */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        {products.length === 0 ? (
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
                {/* Image */}
                {product.imageUrls?.[0] ? (
                  <div className="h-40 bg-brand-gray/20 dark:bg-slate-700/40">
                    <img src={product.imageUrls[0]} alt={product.name} className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="flex h-40 items-center justify-center bg-brand-gray/20 dark:bg-slate-700/40">
                    <svg className="h-10 w-10 text-brand-teal/20 dark:text-brand-sage/30" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                    </svg>
                  </div>
                )}

                <div className="p-5">
                {/* Badges */}
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

                {/* Name */}
                <h3 className="mb-1 font-semibold text-primary group-hover:text-brand-teal">{product.name}</h3>
                {/* Key specs */}
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
        )}
      </main>
    </div>
  );
}
