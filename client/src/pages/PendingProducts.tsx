import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import ProductImage from '../components/ProductImage';
import {
  fetchPendingProducts,
  approveProduct,
  rejectProduct,
  approveEdit,
  rejectEdit,
  type PendingProduct,
} from '../lib/api';

const FIELD_LABELS: Record<string, string> = {
  pricePerUnit: 'Price ($/g)',
  gramsAvailable: 'Available (g)',
  upcomingQty: 'Upcoming (g)',
  minQtyRequest: 'Min QTY (g)',
  description: 'Description',
  certification: 'Certification',
  dominantTerpene: 'Terpene Profile',
  totalTerpenePercent: 'Total Terpenes %',
  highestTerpenes: 'Terpene Breakdown',
  harvestDate: 'Harvest Date',
};

function formatFieldValue(key: string, value: any): string {
  if (value === null || value === undefined) return '—';
  if (key === 'pricePerUnit') return `$${Number(value).toFixed(2)}`;
  if (key === 'gramsAvailable' || key === 'upcomingQty' || key === 'minQtyRequest') return `${Number(value).toLocaleString()}g`;
  if (key === 'totalTerpenePercent') return `${value}%`;
  if (key === 'harvestDate') return value ? new Date(value).toLocaleDateString() : '—';
  return String(value);
}

export default function PendingProducts() {
  const [products, setProducts] = useState<PendingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [rejectReasonFor, setRejectReasonFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

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

  async function handleApproveNew(id: string) {
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

  async function handleRejectNew(id: string, name: string) {
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

  async function handleApproveEdit(id: string) {
    setActionInProgress(id);
    try {
      await approveEdit(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to approve edit');
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleRejectEdit(id: string) {
    setActionInProgress(id);
    try {
      await rejectEdit(id, rejectReason || undefined);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      setRejectReasonFor(null);
      setRejectReason('');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to reject edit');
    } finally {
      setActionInProgress(null);
    }
  }

  return (
    <Layout>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-primary">Pending Products</h2>
        <p className="text-sm text-muted">
          Review and approve new listings and seller-submitted edits.
        </p>
        <div className="mt-2 h-1 w-12 rounded-full bg-gradient-to-r from-brand-teal to-brand-blue teal:from-brand-yellow teal:to-brand-coral" />
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
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-sage/10 dark:bg-brand-sage/20 teal:bg-brand-yellow/15">
            <svg className="h-8 w-8 text-brand-sage teal:text-brand-yellow" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-secondary">All caught up</h3>
          <p className="text-sm text-muted">No products are waiting for approval.</p>
        </div>
      )}

      {!loading && products.length > 0 && (
        <div className="space-y-3">
          {products.map((product) => {
            const isEditRequest = product.editPending && product.pendingEdits;
            const isNewListing = product.requestPending;
            const pending = product.pendingEdits || {};
            const { newImageUrls, imageUrls: reorderedImageUrls, ...fieldChanges } = pending;
            const hasFieldChanges = Object.keys(fieldChanges).length > 0;
            const hasImageChanges = !!(newImageUrls?.length || reorderedImageUrls);

            return (
              <div
                key={product.id}
                className={`rounded-lg border border-l-4 p-4 ${
                  isEditRequest
                    ? 'border-orange-200 dark:border-orange-800/40 border-l-orange-400 bg-orange-50/50 dark:bg-orange-900/10'
                    : 'border-amber-200 dark:border-amber-800/40 border-l-amber-400 bg-amber-50/50 dark:bg-amber-900/10'
                }`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    {/* Header */}
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-primary">{product.name}</h3>
                      {product.category && (
                        <span className="rounded-full surface-muted px-2 py-0.5 text-xs font-medium text-secondary">
                          {product.category}
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        isEditRequest
                          ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                          : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                      }`}>
                        {isEditRequest ? 'Edit Request' : 'New Listing'}
                      </span>
                    </div>

                    {/* Current stats for new listings */}
                    {isNewListing && (
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
                    )}

                    {/* Diff view for edit requests */}
                    {isEditRequest && hasFieldChanges && (
                      <div className="mt-2 space-y-1">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Proposed Changes</h4>
                        <div className="rounded-md border border-default surface p-3 text-sm">
                          {Object.entries(fieldChanges).map(([key, newValue]) => {
                            const currentValue = (product as any)[key];
                            return (
                              <div key={key} className="flex items-baseline gap-2 py-0.5">
                                <span className="w-32 text-xs font-medium text-faint">{FIELD_LABELS[key] || key}:</span>
                                <span className="text-xs text-red-500 line-through">{formatFieldValue(key, currentValue)}</span>
                                <span className="text-xs text-brand-teal font-medium">{formatFieldValue(key, newValue)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Image changes */}
                    {isEditRequest && hasImageChanges && (
                      <div className="mt-2 space-y-1">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Image Changes</h4>
                        <div className="rounded-md border border-default surface p-3">
                          {reorderedImageUrls && (
                            <div className="mb-2">
                              <span className="text-xs text-muted">Reordered ({(reorderedImageUrls as string[]).length} images):</span>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {(reorderedImageUrls as string[]).map((url: string, i: number) => (
                                  <div key={i} className="relative h-10 w-10 overflow-hidden rounded border border-default">
                                    <ProductImage src={url} alt={`Reordered ${i + 1}`} className="h-full w-full object-cover" />
                                    {i === 0 && <span className="absolute bottom-0 left-0 right-0 bg-brand-teal/80 text-center text-[8px] font-bold text-white">Main</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {newImageUrls && (newImageUrls as string[]).length > 0 && (
                            <div>
                              <span className="text-xs text-muted">{(newImageUrls as string[]).length} new image{(newImageUrls as string[]).length !== 1 ? 's' : ''} uploaded:</span>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {(newImageUrls as string[]).map((url: string, i: number) => (
                                  <div key={i} className="relative h-10 w-10 overflow-hidden rounded border border-orange-300">
                                    <ProductImage src={url} alt={`New ${i + 1}`} className="h-full w-full object-cover" />
                                    <span className="absolute bottom-0 left-0 right-0 bg-orange-500/80 text-center text-[8px] font-bold text-white">New</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <p className="mt-2 text-xs text-faint">
                      Submitted by {product.seller.companyName || product.seller.email}
                      {' '}on {new Date(product.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 flex-col gap-2">
                    {isNewListing && (
                      <>
                        <button
                          onClick={() => handleApproveNew(product.id)}
                          disabled={actionInProgress === product.id}
                          className="rounded-lg bg-brand-teal px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-blue disabled:opacity-50"
                        >
                          {actionInProgress === product.id ? '...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleRejectNew(product.id, product.name)}
                          disabled={actionInProgress === product.id}
                          className="rounded-lg border border-red-300 dark:border-red-700 px-4 py-2 text-xs font-medium text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {isEditRequest && (
                      <>
                        <button
                          onClick={() => handleApproveEdit(product.id)}
                          disabled={actionInProgress === product.id}
                          className="rounded-lg bg-brand-teal px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-blue disabled:opacity-50"
                        >
                          {actionInProgress === product.id ? '...' : 'Approve Changes'}
                        </button>
                        {rejectReasonFor === product.id ? (
                          <div className="space-y-1">
                            <input
                              type="text"
                              placeholder="Reason (optional)"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              className="w-full input-field text-xs"
                            />
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleRejectEdit(product.id)}
                                disabled={actionInProgress === product.id}
                                className="flex-1 rounded-lg bg-red-500 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
                              >
                                {actionInProgress === product.id ? '...' : 'Confirm'}
                              </button>
                              <button
                                onClick={() => { setRejectReasonFor(null); setRejectReason(''); }}
                                className="rounded-lg border border-default px-2 py-1.5 text-xs text-secondary"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setRejectReasonFor(product.id)}
                            disabled={actionInProgress === product.id}
                            className="rounded-lg border border-red-300 dark:border-red-700 px-4 py-2 text-xs font-medium text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                          >
                            Reject Changes
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
