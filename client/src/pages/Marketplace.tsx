import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import Layout from '../components/Layout';
import ProductCard from '../components/ProductCard';
import ProductListItem from '../components/ProductListItem';
import ProductModal from '../components/ProductModal';
import FilterSidebar from '../components/FilterSidebar';
import ContactModal from '../components/ContactModal';
import { fetchProducts, type ProductCard as ProductCardType, type ProductFilters, type Pagination } from '../lib/api';
import { useShortlist } from '../lib/useShortlist';
import MarketplaceTabs from '../components/MarketplaceTabs';

export default function Marketplace() {
  const [products, setProducts] = useState<ProductCardType[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [filters, setFilters] = useState<ProductFilters>({ page: 1, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'grid-lg' | 'list'>('grid-lg');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const { user } = useAuth();
  const { preload } = useShortlist();

  const loadProducts = useCallback(async (f: ProductFilters) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchProducts(f);
      setProducts(data.products);
      setPagination(data.pagination);
      // Preload shortlist states for visible products
      preload(data.products.map((p) => p.id));
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts(filters);
  }, [filters, loadProducts]);

  function handleFiltersChange(newFilters: ProductFilters) {
    // Auto-switch to relevance sort when search is entered, revert when cleared
    if (newFilters.search && !filters.search) {
      newFilters = { ...newFilters, sort: 'relevance', order: 'desc' };
    } else if (!newFilters.search && filters.sort === 'relevance') {
      newFilters = { ...newFilters, sort: 'name', order: 'asc' };
    }
    setFilters(newFilters);
  }

  function handlePageChange(page: number) {
    setFilters((prev) => ({ ...prev, page }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <Layout>
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <svg className="h-7 w-7 text-brand-teal dark:text-brand-sage" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
            <h2 className="text-2xl font-semibold text-primary">Marketplace</h2>
          </div>
          <p className="text-sm text-muted">Browse cannabis products from licensed Canadian producers</p>
          <div className="mt-2 h-1 w-12 rounded-full bg-gradient-to-r from-brand-teal to-brand-blue" />
        </div>
        <button
          onClick={() => setContactOpen(true)}
          className="flex cursor-pointer items-center gap-1.5 rounded-full bg-brand-teal/10 px-3 py-1 text-sm font-medium text-brand-teal transition hover:bg-brand-teal/20 dark:bg-brand-yellow/15 dark:text-brand-yellow dark:hover:bg-brand-yellow/25"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
          </svg>
          Need help?
        </button>
      </div>

      <MarketplaceTabs />

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          {/* Sort bar + view toggle */}
          <div className="mb-4 flex items-center justify-between rounded-lg border card-blue backdrop-blur-sm px-3 py-2 shadow-md sticky top-[4.5rem] z-20">
            {/* View toggle */}
            <div className="flex rounded-lg border border-subtle p-0.5">
              {/* Large grid (2 cols) */}
              <button
                onClick={() => setView('grid-lg')}
                className={`rounded-md p-1.5 transition ${view === 'grid-lg' ? 'bg-brand-teal text-white' : 'text-muted hover:text-secondary'}`}
                aria-label="Large grid view"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h4.5A2.25 2.25 0 0 1 12.75 6v4.5a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 13.5a2.25 2.25 0 0 1 2.25-2.25H20.25A2.25 2.25 0 0 1 22.5 13.5V18a2.25 2.25 0 0 1-2.25 2.25h-4.5A2.25 2.25 0 0 1 13.5 18v-4.5Z" />
                </svg>
              </button>
              {/* Compact grid (3 cols) */}
              <button
                onClick={() => setView('grid')}
                className={`rounded-md p-1.5 transition ${view === 'grid' ? 'bg-brand-teal text-white' : 'text-muted hover:text-secondary'}`}
                aria-label="Grid view"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
                </svg>
              </button>
              {/* List view */}
              <button
                onClick={() => setView('list')}
                className={`rounded-md p-1.5 transition ${view === 'list' ? 'bg-brand-teal text-white' : 'text-muted hover:text-secondary'}`}
                aria-label="List view"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
                </svg>
              </button>
            </div>

            {/* Product count */}
            {pagination && (
              <span className="ml-[6.5rem] text-xs font-medium text-muted">
                {pagination.total} product{pagination.total !== 1 ? 's' : ''}
              </span>
            )}

            {/* Sort */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-secondary">Sort by</label>
              <select
                value={`${filters.sort || 'name'}_${filters.order || 'asc'}`}
                onChange={(e) => {
                  const [sort, order] = e.target.value.split('_');
                  setFilters((prev) => ({ ...prev, sort, order: order as 'asc' | 'desc' }));
                }}
                className="input-field"
              >
                {filters.search && <option value="relevance_desc">Relevance</option>}
                <option value="name_asc">Name A-Z</option>
                <option value="name_desc">Name Z-A</option>
<option value="thcMax_desc">THC: High to Low</option>
                <option value="gramsAvailable_desc">Most Available</option>
                <option value="createdAt_desc">Newest</option>
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
              <button
                onClick={() => loadProducts(filters)}
                className="mt-3 text-sm font-medium text-red-600 underline hover:text-red-700"
              >
                Try again
              </button>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && products.length === 0 && (
            <div className="rounded-lg border border-brand-gray dark:border-slate-700 surface p-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-coral/10 dark:bg-brand-yellow/10">
                <svg className="h-8 w-8 text-brand-coral/50 dark:text-brand-yellow/50" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
              </div>
              <h3 className="mb-1 text-lg font-semibold text-secondary">No products found</h3>
              <p className="text-sm text-muted">Try adjusting your filters or search terms.</p>
            </div>
          )}

          {/* Product grid / list */}
          {!loading && !error && products.length > 0 && (
            view === 'grid-lg' ? (
              <div className="grid gap-6 sm:grid-cols-2">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} large onClick={setSelectedProductId} />
                ))}
              </div>
            ) : view === 'grid' ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} onClick={setSelectedProductId} />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {products.map((product) => (
                  <ProductListItem key={product.id} product={product} onClick={setSelectedProductId} />
                ))}
              </div>
            )
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="rounded-lg border border-default px-3 py-1.5 text-sm font-medium text-secondary transition hover-surface-muted disabled:opacity-40"
              >
                Previous
              </button>

              {generatePageNumbers(pagination.page, pagination.totalPages).map((p, i) =>
                p === '...' ? (
                  <span key={`dots-${i}`} className="px-1 text-faint">...</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => handlePageChange(p as number)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      p === pagination.page
                        ? 'bg-brand-teal text-white'
                        : 'border border-default text-secondary hover-surface-muted'
                    }`}
                  >
                    {p}
                  </button>
                ),
              )}

              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="rounded-lg border border-default px-3 py-1.5 text-sm font-medium text-secondary transition hover-surface-muted disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>

        <FilterSidebar filters={filters} onChange={handleFiltersChange} />
      </div>

      <ProductModal productId={selectedProductId} onClose={() => setSelectedProductId(null)} />
      <ContactModal
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        userName={`${user?.firstName || ''} ${user?.lastName || ''}`.trim() || ''}
        userEmail={user?.email || ''}
      />
    </Layout>
  );
}

function generatePageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | string)[] = [1];

  if (current > 3) pages.push('...');

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push('...');

  pages.push(total);
  return pages;
}
