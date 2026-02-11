import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import ProductCard from '../components/ProductCard';
import FilterSidebar from '../components/FilterSidebar';
import { fetchProducts, type ProductCard as ProductCardType, type ProductFilters, type Pagination } from '../lib/api';

export default function Marketplace() {
  const [products, setProducts] = useState<ProductCardType[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [filters, setFilters] = useState<ProductFilters>({ page: 1, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-gray-900">Marketplace</h2>
        {pagination && (
          <p className="text-sm text-gray-500">
            {pagination.total} product{pagination.total !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <FilterSidebar filters={filters} onChange={handleFiltersChange} />

        <div className="min-w-0 flex-1">
          {/* Sort bar */}
          <div className="mb-4 flex items-center justify-end gap-2">
            <label className="text-xs text-gray-500">Sort by</label>
            <select
              value={`${filters.sort || 'name'}_${filters.order || 'asc'}`}
              onChange={(e) => {
                const [sort, order] = e.target.value.split('_');
                setFilters((prev) => ({ ...prev, sort, order: order as 'asc' | 'desc' }));
              }}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-green-500 focus:outline-none"
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

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-600 border-t-transparent" />
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
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
            <div className="rounded-xl border bg-white p-12 text-center">
              <svg className="mx-auto mb-4 h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <h3 className="mb-1 text-lg font-semibold text-gray-700">No products found</h3>
              <p className="text-sm text-gray-500">Try adjusting your filters or search terms.</p>
            </div>
          )}

          {/* Product grid */}
          {!loading && !error && products.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
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
                        ? 'bg-green-700 text-white'
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
