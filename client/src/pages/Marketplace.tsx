import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import ProductCard from '../components/ProductCard';
import ProductListItem from '../components/ProductListItem';
import FilterSidebar from '../components/FilterSidebar';
import { fetchProducts, type ProductCard as ProductCardType, type ProductFilters, type Pagination } from '../lib/api';

export default function Marketplace() {
  const [products, setProducts] = useState<ProductCardType[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [filters, setFilters] = useState<ProductFilters>({ page: 1, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const loadProducts = useCallback(async (f: ProductFilters) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchProducts(f);
      setProducts(data.products);
      setPagination(data.pagination);
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
    setFilters(newFilters);
  }

  function handlePageChange(page: number) {
    setFilters((prev) => ({ ...prev, page }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <Layout>
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between rounded-lg bg-gradient-to-r from-brand-teal to-brand-blue px-6 py-5 text-white">
        <div>
          <h2 className="text-2xl font-semibold">Marketplace</h2>
          <p className="mt-0.5 text-sm text-white/70">Browse cannabis products from licensed Canadian producers</p>
        </div>
        {pagination && (
          <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-medium backdrop-blur-sm">
            {pagination.total} product{pagination.total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <FilterSidebar filters={filters} onChange={handleFiltersChange} />

        <div className="min-w-0 flex-1">
          {/* Sort bar + view toggle */}
          <div className="mb-4 flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm">
            {/* View toggle */}
            <div className="flex rounded-lg border border-gray-200 p-0.5">
              <button
                onClick={() => setView('grid')}
                className={`rounded-md p-1.5 transition ${view === 'grid' ? 'bg-brand-teal text-white' : 'text-gray-400 hover:text-gray-600'}`}
                aria-label="Grid view"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
                </svg>
              </button>
              <button
                onClick={() => setView('list')}
                className={`rounded-md p-1.5 transition ${view === 'list' ? 'bg-brand-teal text-white' : 'text-gray-400 hover:text-gray-600'}`}
                aria-label="List view"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
                </svg>
              </button>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500">Sort by</label>
              <select
                value={`${filters.sort || 'name'}_${filters.order || 'asc'}`}
                onChange={(e) => {
                  const [sort, order] = e.target.value.split('_');
                  setFilters((prev) => ({ ...prev, sort, order: order as 'asc' | 'desc' }));
                }}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-teal focus:outline-none"
              >
                <option value="name_asc">Name A-Z</option>
                <option value="name_desc">Name Z-A</option>
                <option value="pricePerUnit_asc">Price: Low to High</option>
                <option value="pricePerUnit_desc">Price: High to Low</option>
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
            <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
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
            <div className="rounded-lg border border-brand-gray bg-white p-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-sage/10">
                <svg className="h-8 w-8 text-brand-teal/50" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
              </div>
              <h3 className="mb-1 text-lg font-semibold text-gray-700">No products found</h3>
              <p className="text-sm text-gray-500">Try adjusting your filters or search terms.</p>
            </div>
          )}

          {/* Product grid / list */}
          {!loading && !error && products.length > 0 && (
            view === 'grid' ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {products.map((product) => (
                  <ProductListItem key={product.id} product={product} />
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
                className="rounded-lg border px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
              >
                Previous
              </button>

              {generatePageNumbers(pagination.page, pagination.totalPages).map((p, i) =>
                p === '...' ? (
                  <span key={`dots-${i}`} className="px-1 text-gray-400">...</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => handlePageChange(p as number)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      p === pagination.page
                        ? 'bg-brand-teal text-white'
                        : 'border text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {p}
                  </button>
                ),
              )}

              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="rounded-lg border px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
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
