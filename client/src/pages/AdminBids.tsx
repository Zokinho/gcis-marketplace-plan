import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { fetchAdminBids, acceptBid, rejectBid, type AdminBidRecord, type BidStatusType } from '../lib/api';

const STATUS_CONFIG: Record<BidStatusType, { label: string; class: string }> = {
  PENDING: { label: 'Pending', class: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  UNDER_REVIEW: { label: 'Under Review', class: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  ACCEPTED: { label: 'Accepted', class: 'bg-brand-sage/20 text-brand-teal' },
  REJECTED: { label: 'Rejected', class: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  COUNTERED: { label: 'Countered', class: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  EXPIRED: { label: 'Expired', class: 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400' },
};

const STATUS_FILTERS: { value: '' | BidStatusType; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'COUNTERED', label: 'Countered' },
  { value: 'EXPIRED', label: 'Expired' },
];

export default function AdminBids() {
  const [bids, setBids] = useState<AdminBidRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'' | BidStatusType>('');
  const [actioningId, setActioningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = { page, limit: 25 };
      if (statusFilter) params.status = statusFilter;
      const data = await fetchAdminBids(params);
      setBids(data.bids);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load bids');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [statusFilter]);

  async function handleAccept(bidId: string) {
    if (!confirm('Accept this bid? This will create a transaction.')) return;
    setActioningId(bidId);
    try {
      await acceptBid(bidId);
      load();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to accept bid');
    } finally {
      setActioningId(null);
    }
  }

  async function handleReject(bidId: string) {
    if (!confirm('Reject this bid?')) return;
    setActioningId(bidId);
    try {
      await rejectBid(bidId);
      load();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to reject bid');
    } finally {
      setActioningId(null);
    }
  }

  return (
    <Layout>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <svg className="h-7 w-7 text-brand-blue teal:text-brand-coral" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
            </svg>
            <h2 className="text-2xl font-semibold text-primary">All Bids</h2>
          </div>
          <p className="mt-1 text-sm text-muted">
            {total} bid{total !== 1 ? 's' : ''} across the platform
          </p>
          <div className="mt-2 h-1 w-12 rounded-full bg-brand-blue dark:bg-gradient-to-r dark:from-brand-teal dark:to-brand-blue teal:bg-gradient-to-r teal:from-brand-yellow teal:to-brand-coral" />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                statusFilter === f.value
                  ? 'bg-brand-teal text-white'
                  : 'surface-muted text-secondary hover:surface-inset'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-teal border-t-transparent" />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-center">
          <p className="font-medium text-red-700">{error}</p>
          <button onClick={load} className="mt-3 text-sm font-medium text-red-600 underline">Try again</button>
        </div>
      )}

      {!loading && !error && bids.length === 0 && (
        <div className="rounded-lg border border-brand-gray dark:border-slate-700 surface p-12 text-center">
          <h3 className="mb-2 text-lg font-semibold text-secondary">No bids found</h3>
          <p className="text-sm text-muted">
            {statusFilter ? 'No bids match this filter.' : 'No bids have been placed yet.'}
          </p>
        </div>
      )}

      {!loading && !error && bids.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto rounded-lg border border-default shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="surface-muted border-b border-default text-left">
                  <th className="px-4 py-3 font-semibold text-secondary">Product</th>
                  <th className="px-4 py-3 font-semibold text-secondary">Buyer</th>
                  <th className="px-4 py-3 font-semibold text-secondary">Seller</th>
                  <th className="px-4 py-3 font-semibold text-secondary text-right">Bid Price</th>
                  <th className="px-4 py-3 font-semibold text-secondary text-right">Qty</th>
                  <th className="px-4 py-3 font-semibold text-secondary text-right">Total</th>
                  <th className="px-4 py-3 font-semibold text-secondary text-center">Status</th>
                  <th className="px-4 py-3 font-semibold text-secondary">Date</th>
                  <th className="px-4 py-3 font-semibold text-secondary text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default">
                {bids.map((bid) => {
                  const statusCfg = STATUS_CONFIG[bid.status] || { label: bid.status, class: 'bg-gray-100 text-gray-500' };
                  return (
                    <tr key={bid.id} className="surface hover:surface-muted transition">
                      <td className="px-4 py-3">
                        <Link to={`/marketplace/${bid.product.id}`} className="font-medium text-primary hover:text-brand-teal transition">
                          {bid.product.name}
                        </Link>
                        {bid.product.category && (
                          <p className="text-xs text-muted">{bid.product.category}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-primary">{bid.buyer.companyName || '—'}</p>
                        <p className="text-xs text-muted">{bid.buyer.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-primary">{bid.product.seller?.companyName || '—'}</p>
                        <p className="text-xs text-muted">{bid.product.seller?.email || ''}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-primary">
                        ${bid.pricePerUnit.toFixed(2)}/g
                        {bid.product.pricePerUnit != null && (
                          <p className="text-xs text-muted">Ask: ${bid.product.pricePerUnit.toFixed(2)}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-primary">{bid.quantity.toLocaleString()}g</td>
                      <td className="px-4 py-3 text-right font-semibold text-primary">
                        ${bid.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.class}`}>
                          {statusCfg.label}
                        </span>
                        {bid.transaction?.outcomeRecordedAt && (
                          <p className="mt-1 text-xs text-brand-teal font-medium">Delivered</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                        {new Date(bid.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        <br />
                        {new Date(bid.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {(bid.status === 'PENDING' || bid.status === 'UNDER_REVIEW') && (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleAccept(bid.id)}
                              disabled={actioningId === bid.id}
                              className="rounded-md bg-brand-blue px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-brand-teal disabled:opacity-50"
                            >
                              {actioningId === bid.id ? '...' : 'Accept'}
                            </button>
                            <button
                              onClick={() => handleReject(bid.id)}
                              disabled={actioningId === bid.id}
                              className="rounded-md border border-brand-coral/50 px-2.5 py-1 text-xs font-medium text-brand-coral transition hover:bg-brand-coral/5 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                        {bid.status !== 'PENDING' && bid.status !== 'UNDER_REVIEW' && (
                          <span className="text-xs text-faint">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-3">
            {bids.map((bid) => {
              const statusCfg = STATUS_CONFIG[bid.status] || { label: bid.status, class: 'bg-gray-100 text-gray-500' };
              return (
                <div key={bid.id} className={`rounded-lg border card-blue border-l-4 shadow-md p-4 ${
                  bid.status === 'ACCEPTED' ? 'border-l-brand-teal' :
                  bid.status === 'REJECTED' ? 'border-l-brand-coral' :
                  bid.status === 'PENDING' ? 'border-l-brand-blue' :
                  'border-l-gray-300 dark:border-l-slate-600'
                }`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <Link to={`/marketplace/${bid.product.id}`} className="font-semibold text-primary hover:text-brand-teal transition">
                        {bid.product.name}
                      </Link>
                      <span className={`ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg.class}`}>
                        {statusCfg.label}
                      </span>
                    </div>
                    <span className="text-xs text-faint whitespace-nowrap">
                      {new Date(bid.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                    <div>
                      <p className="text-xs text-faint">Buyer</p>
                      <p className="font-medium text-primary">{bid.buyer.companyName || bid.buyer.email}</p>
                    </div>
                    <div>
                      <p className="text-xs text-faint">Seller</p>
                      <p className="font-medium text-primary">{bid.product.seller?.companyName || bid.product.seller?.email || '—'}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    <span className="text-muted">
                      <span className="font-medium text-faint">Bid:</span>{' '}
                      <span className="font-semibold text-secondary">${bid.pricePerUnit.toFixed(2)}/g</span>
                    </span>
                    <span className="text-muted">
                      <span className="font-medium text-faint">Qty:</span>{' '}
                      <span className="font-semibold text-secondary">{bid.quantity.toLocaleString()}g</span>
                    </span>
                    <span className="text-muted">
                      <span className="font-medium text-faint">Total:</span>{' '}
                      <span className="font-semibold text-secondary">${bid.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </span>
                  </div>

                  {(bid.status === 'PENDING' || bid.status === 'UNDER_REVIEW') && (
                    <div className="mt-3 flex gap-2 border-t border-default pt-3">
                      <button
                        onClick={() => handleAccept(bid.id)}
                        disabled={actioningId === bid.id}
                        className="rounded-lg bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-teal disabled:opacity-50"
                      >
                        {actioningId === bid.id ? '...' : 'Accept'}
                      </button>
                      <button
                        onClick={() => handleReject(bid.id)}
                        disabled={actioningId === bid.id}
                        className="rounded-lg border border-brand-coral/50 px-3 py-1.5 text-xs font-medium text-brand-coral transition hover:bg-brand-coral/5 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-default px-3 py-1.5 text-sm font-medium text-secondary transition hover-surface-muted disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-muted">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-default px-3 py-1.5 text-sm font-medium text-secondary transition hover-surface-muted disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
