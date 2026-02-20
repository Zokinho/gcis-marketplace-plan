import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import ProductCard from '../components/ProductCard';
import ProductModal from '../components/ProductModal';
import { fetchShortlist, type ShortlistItem, type Pagination } from '../lib/api';
import { useShortlist } from '../lib/useShortlist';

export default function ShortlistPage() {
  const [items, setItems] = useState<ShortlistItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<'date' | 'name' | 'price'>('date');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const { preload } = useShortlist();
  const [infoDismissed, setInfoDismissed] = useState(() => localStorage.getItem('shortlist-info-dismissed') === '1');

  function handleDismissInfo() {
    setInfoDismissed(true);
    localStorage.setItem('shortlist-info-dismissed', '1');
  }

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchShortlist({ page, limit: 21, sort, order });
      setItems(data.items);
      setPagination(data.pagination);
      preload(data.items.map((i) => i.id));
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load shortlist');
    } finally {
      setLoading(false);
    }
  }, [page, sort, order, preload]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  return (
    <Layout>
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-coral/15 dark:bg-brand-yellow/15">
            <svg className="h-5 w-5 text-brand-coral dark:text-brand-yellow" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" d="M6.32 2.577a49.255 49.255 0 0 1 11.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 0 1-1.085.67L12 18.089l-7.165 3.583A.75.75 0 0 1 3.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93Z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-primary">My Shortlist</h2>
            <p className="text-sm text-muted">Products you've saved for later</p>
          </div>
        </div>
        <div className="mt-2 h-1 w-12 rounded-full bg-gradient-to-r from-brand-coral to-brand-teal dark:from-brand-yellow teal:from-brand-yellow teal:to-brand-coral" />
      </div>

      {/* How it works — dismissible */}
      {!infoDismissed && (
        <div className="mb-6 rounded-lg border border-brand-blue/10 dark:border-slate-700 bg-brand-blue/5 dark:bg-slate-800/50 teal:bg-white/15 teal:border-white/20 p-4">
          <div className="flex items-start gap-3">
            <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-blue dark:text-brand-yellow" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
            </svg>
            <div className="min-w-0 flex-1 text-sm text-secondary">
              <p className="mb-1 font-medium text-primary">How your shortlist works</p>
              <p className="text-muted">
                Save products you're interested in by clicking the bookmark icon on any product card. Shortlisted products are used to improve your match recommendations and you'll be notified when a shortlisted product drops in price.
              </p>
            </div>
            <button
              onClick={handleDismissInfo}
              className="flex-shrink-0 rounded-md p-1 text-muted hover:text-primary transition"
              aria-label="Dismiss"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Sort bar */}
      <div className="mb-4 flex items-center justify-between rounded-lg bg-brand-blue/5 dark:bg-brand-dark px-3 py-2 shadow-md">
        {pagination && (
          <span className="text-xs font-medium text-muted">
            {pagination.total} saved product{pagination.total !== 1 ? 's' : ''}
          </span>
        )}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-secondary">Sort by</label>
          <select
            value={`${sort}_${order}`}
            onChange={(e) => {
              const [s, o] = e.target.value.split('_');
              setSort(s as 'date' | 'name' | 'price');
              setOrder(o as 'asc' | 'desc');
              setPage(1);
            }}
            className="input-field"
          >
            <option value="date_desc">Recently Saved</option>
            <option value="date_asc">Oldest Saved</option>
            <option value="name_asc">Name A-Z</option>
            <option value="name_desc">Name Z-A</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
          </select>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-teal border-t-transparent" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-center">
          <p className="font-medium text-red-700">{error}</p>
          <button onClick={loadItems} className="mt-3 text-sm font-medium text-red-600 underline hover:text-red-700">
            Try again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && items.length === 0 && (
        <div className="rounded-lg border border-brand-gray dark:border-slate-700 surface p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-coral/10 dark:bg-brand-yellow/10 teal:bg-brand-yellow/15">
            <svg className="h-8 w-8 text-brand-coral/50 dark:text-brand-yellow/50 teal:text-brand-yellow" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
            </svg>
          </div>
          <h3 className="mb-1 text-lg font-semibold text-secondary">No saved products yet</h3>
          <p className="text-sm text-muted">
            Browse the <a href="/marketplace" className="text-brand-teal underline hover:text-brand-blue">marketplace</a> and click the bookmark icon to save products here.
          </p>
        </div>
      )}

      {/* Product grid */}
      {!loading && !error && items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="relative">
              <ProductCard product={item} onClick={setSelectedProductId} />
              <p className="mt-1 text-center text-[10px] text-faint">
                Saved {new Date(item.shortlistedAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={() => { setPage(Math.max(1, page - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            disabled={page <= 1}
            className="rounded-lg border border-default px-3 py-1.5 text-sm font-medium text-secondary transition hover-surface-muted disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-muted">
            Page {page} of {pagination.totalPages}
          </span>
          <button
            onClick={() => { setPage(Math.min(pagination.totalPages, page + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            disabled={page >= pagination.totalPages}
            className="rounded-lg border border-default px-3 py-1.5 text-sm font-medium text-secondary transition hover-surface-muted disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      <ProductModal productId={selectedProductId} onClose={() => setSelectedProductId(null)} />
    </Layout>
  );
}
