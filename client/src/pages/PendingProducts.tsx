import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { fetchPendingProducts, approveProduct, rejectProduct, type PendingProduct } from '../lib/api';

export default function PendingProducts() {
  const [products, setProducts] = useState<PendingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPendingProducts();
      setProducts(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load pending products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleApprove(id: string) {
    setActionInProgress(id);
    try {
      await approveProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to approve product');
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleReject(id: string, name: string) {
    if (!confirm(`Reject and delete "${name}"? This cannot be undone.`)) return;
    setActionInProgress(id);
    try {
      await rejectProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to reject product');
    } finally {
      setActionInProgress(null);
    }
  }

  return (
    <Layout>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-primary">Pending Products</h2>
        <p className="text-sm text-muted">
          Review and approve seller-submitted listings before they appear in the marketplace.
        </p>
        <div className="mt-2 h-1 w-12 rounded-full bg-gradient-to-r from-brand-teal to-brand-blue" />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
          <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-teal border-t-transparent" />
        </div>
      )}

      {!loading && products.length === 0 && (
        <div className="rounded-lg border border-brand-gray dark:border-slate-700 surface p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-sage/10 dark:bg-brand-sage/20">
            <svg className="h-8 w-8 text-brand-sage" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-secondary">All caught up</h3>
          <p className="text-sm text-muted">No products are waiting for approval.</p>
        </div>
      )}

      {!loading && products.length > 0 && (
        <div className="space-y-3">
          {products.map((product) => (
            <div
              key={product.id}
              className="flex flex-col gap-4 rounded-lg border border-amber-200 dark:border-amber-800/40 border-l-4 border-l-amber-400 bg-amber-50/50 dark:bg-amber-900/10 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-primary">{product.name}</h3>
                  {product.category && (
                    <span className="rounded-full surface-muted px-2 py-0.5 text-xs font-medium text-secondary">
                      {product.category}
                    </span>
                  )}
                  <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                    Pending
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
                  {product.pricePerUnit != null && (
                    <span><span className="font-medium text-faint">Price:</span> ${product.pricePerUnit.toFixed(2)}/g</span>
                  )}
                  {product.gramsAvailable != null && (
                    <span><span className="font-medium text-faint">Available:</span> {product.gramsAvailable.toLocaleString()}g</span>
                  )}
                  {product.thcMax != null && (
                    <span><span className="font-medium text-faint">THC:</span> {product.thcMax}%</span>
                  )}
                  {product.cbdMax != null && (
                    <span><span className="font-medium text-faint">CBD:</span> {product.cbdMax}%</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-faint">
                  Submitted by {product.seller.companyName || product.seller.email}
                  {' '}on {new Date(product.createdAt).toLocaleDateString()}
                </p>
              </div>

              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => handleApprove(product.id)}
                  disabled={actionInProgress === product.id}
                  className="rounded-lg bg-brand-teal px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-blue disabled:opacity-50"
                >
                  {actionInProgress === product.id ? '...' : 'Approve'}
                </button>
                <button
                  onClick={() => handleReject(product.id, product.name)}
                  disabled={actionInProgress === product.id}
                  className="rounded-lg border border-red-300 dark:border-red-700 px-4 py-2 text-xs font-medium text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
