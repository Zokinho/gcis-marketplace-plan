import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import OutcomeForm from '../components/OutcomeForm';
import { fetchMyBids, fetchSellerBids, acceptBid, rejectBid, type BidRecord, type BidStatusType, type SellerBidRecord } from '../lib/api';
import { useUserStatus } from '../lib/useUserStatus';

const STATUS_CONFIG: Record<BidStatusType, { label: string; class: string }> = {
  PENDING: { label: 'Pending', class: 'bg-amber-100 text-amber-700' },
  UNDER_REVIEW: { label: 'Under Review', class: 'bg-blue-100 text-blue-700' },
  ACCEPTED: { label: 'Accepted', class: 'bg-brand-sage/20 text-brand-teal' },
  REJECTED: { label: 'Rejected', class: 'bg-red-100 text-red-700' },
  COUNTERED: { label: 'Countered', class: 'bg-purple-100 text-purple-700' },
  EXPIRED: { label: 'Expired', class: 'bg-gray-100 text-gray-500' },
};

const TYPE_COLORS: Record<string, string> = {
  Sativa: 'bg-orange-100 text-orange-700',
  Indica: 'bg-purple-100 text-purple-700',
  Hybrid: 'bg-teal-100 text-teal-700',
};

const STATUS_FILTERS: { value: '' | BidStatusType; label: string }[] = [
  { value: '', label: 'All Bids' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'COUNTERED', label: 'Countered' },
  { value: 'EXPIRED', label: 'Expired' },
];

export default function Orders() {
  const { data: userStatus } = useUserStatus();
  const isSeller = userStatus?.user?.contactType?.includes('Seller') ?? false;
  const [tab, setTab] = useState<'buyer' | 'seller'>('buyer');

  // Auto-select seller tab if user is a seller
  useEffect(() => {
    if (isSeller) setTab('seller');
  }, [isSeller]);

  return (
    <Layout>
      {/* Tab switcher for sellers */}
      {isSeller && (
        <div className="mb-6 flex gap-1 rounded-lg bg-brand-gray p-1 sm:w-fit">
          <button
            onClick={() => setTab('buyer')}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${tab === 'buyer' ? 'bg-white shadow-sm text-brand-teal' : 'text-gray-500 hover:text-gray-700'}`}
          >
            My Bids
          </button>
          <button
            onClick={() => setTab('seller')}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${tab === 'seller' ? 'bg-white shadow-sm text-brand-teal' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Incoming Bids
          </button>
        </div>
      )}

      {tab === 'buyer' ? <BuyerBidsView /> : <SellerBidsView />}
    </Layout>
  );
}

function BuyerBidsView() {
  const [bids, setBids] = useState<BidRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'' | BidStatusType>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      const data = await fetchMyBids(params);
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

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-brand-dark">My Bids</h2>
          <p className="mt-1 text-sm text-gray-500">
            {total} bid{total !== 1 ? 's' : ''} placed
          </p>
          <div className="mt-2 h-1 w-12 rounded-full bg-gradient-to-r from-brand-teal to-brand-blue" />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                statusFilter === f.value
                  ? 'bg-brand-teal text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-medium text-red-700">{error}</p>
          <button onClick={load} className="mt-3 text-sm font-medium text-red-600 underline">Try again</button>
        </div>
      )}

      {!loading && !error && bids.length === 0 && (
        <div className="rounded-lg border border-brand-gray bg-white p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-sage/10">
            <svg className="h-8 w-8 text-brand-teal/50" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-gray-700">No bids yet</h3>
          <p className="mb-4 text-sm text-gray-500">
            {statusFilter ? 'No bids match this filter.' : 'Browse the marketplace to find products and place your first bid.'}
          </p>
          {!statusFilter && (
            <Link
              to="/marketplace"
              className="inline-block rounded-lg bg-gradient-to-r from-brand-teal to-brand-blue px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:shadow-md"
            >
              Browse Marketplace
            </Link>
          )}
        </div>
      )}

      {!loading && !error && bids.length > 0 && (
        <>
          <div className="space-y-3">
            {bids.map((bid) => (
              <BidCard key={bid.id} bid={bid} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function SellerBidsView() {
  const [bids, setBids] = useState<SellerBidRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [outcomeForBid, setOutcomeForBid] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSellerBids();
      setBids(data.bids);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAccept(bidId: string) {
    setActioningId(bidId);
    try {
      await acceptBid(bidId);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to accept bid');
    } finally {
      setActioningId(null);
    }
  }

  async function handleReject(bidId: string) {
    setActioningId(bidId);
    try {
      await rejectBid(bidId);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to reject bid');
    } finally {
      setActioningId(null);
    }
  }

  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-brand-dark">Incoming Bids</h2>
        <p className="mt-1 text-sm text-gray-500">Bids placed on your products</p>
        <div className="mt-2 h-1 w-12 rounded-full bg-gradient-to-r from-brand-blue to-brand-teal" />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-teal border-t-transparent" />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-medium text-red-700">{error}</p>
          <button onClick={load} className="mt-3 text-sm font-medium text-red-600 underline">Try again</button>
        </div>
      )}

      {!loading && !error && bids.length === 0 && (
        <div className="rounded-lg border bg-white p-12 text-center">
          <h3 className="mb-2 text-lg font-semibold text-gray-700">No incoming bids</h3>
          <p className="text-sm text-gray-500">When buyers bid on your products, they'll appear here.</p>
        </div>
      )}

      {!loading && !error && bids.length > 0 && (
        <div className="space-y-3">
          {bids.map((bid) => {
            const statusCfg = STATUS_CONFIG[bid.status as BidStatusType] || { label: bid.status, class: 'bg-gray-100 text-gray-500' };
            return (
              <div key={bid.id} className={`rounded-lg border border-l-4 bg-white p-4 sm:p-5 ${
                bid.status === 'ACCEPTED' ? 'border-l-brand-teal' :
                bid.status === 'REJECTED' ? 'border-l-brand-coral' :
                bid.status === 'PENDING' ? 'border-l-brand-blue' :
                'border-l-gray-300'
              }`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold text-gray-900">{bid.product?.name || 'Unknown'}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg.class}`}>
                        {statusCfg.label}
                      </span>
                    </div>
                    <p className="mb-2 text-xs text-gray-400">
                      From: Buyer #{bid.id.slice(-6)}
                    </p>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                      <Stat label="Bid Price" value={`$${bid.pricePerUnit.toFixed(2)}/g`} />
                      <Stat label="Qty" value={`${bid.quantity.toLocaleString()}g`} />
                      <Stat label="Total" value={`$${bid.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                    </div>
                    {bid.notes && <p className="mt-2 text-xs text-gray-400 italic">"{bid.notes}"</p>}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <p className="text-xs text-gray-400">
                      {new Date(bid.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                    {bid.status === 'PENDING' && (
                      <div className="flex gap-2">
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
                    {bid.status === 'ACCEPTED' && !(bid as any).transaction?.outcomeRecordedAt && (
                      <button
                        onClick={() => setOutcomeForBid(outcomeForBid === bid.id ? null : bid.id)}
                        className="rounded-lg border border-brand-blue/40 px-3 py-1.5 text-xs font-medium text-brand-blue transition hover:bg-brand-blue/5"
                      >
                        Record Outcome
                      </button>
                    )}
                    {(bid as any).transaction?.outcomeRecordedAt && (
                      <span className="rounded-full bg-brand-sage/20 px-2 py-0.5 text-xs font-medium text-brand-blue">Outcome Recorded</span>
                    )}
                  </div>
                </div>

                {/* Outcome Form (inline) */}
                {outcomeForBid === bid.id && (
                  <div className="mt-4 border-t pt-4">
                    <OutcomeForm
                      bidId={bid.id}
                      orderedQuantity={bid.quantity}
                      onComplete={() => { setOutcomeForBid(null); load(); }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function BidCard({ bid }: { bid: BidRecord }) {
  const statusCfg = STATUS_CONFIG[bid.status];
  const proximityColor = getProximityColor(bid.proximityScore);

  return (
    <div className={`rounded-lg border border-l-4 bg-white p-4 sm:p-5 transition hover:shadow-sm ${
      bid.status === 'ACCEPTED' ? 'border-l-brand-teal' :
      bid.status === 'REJECTED' ? 'border-l-brand-coral' :
      bid.status === 'PENDING' ? 'border-l-brand-blue' :
      bid.status === 'COUNTERED' ? 'border-l-purple-400' :
      'border-l-gray-300'
    }`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {/* Left: product & bid info */}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Link
              to={`/marketplace/${bid.product.id}`}
              className="text-base font-semibold text-gray-900 hover:text-brand-teal transition"
            >
              {bid.product.name}
            </Link>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg.class}`}>
              {statusCfg.label}
            </span>
            {bid.product.type && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[bid.product.type] || 'bg-gray-100 text-gray-600'}`}>
                {bid.product.type}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <Stat label="Your Bid" value={`$${bid.pricePerUnit.toFixed(2)}/g`} />
            <Stat label="Qty" value={`${bid.quantity.toLocaleString()}g`} />
            <Stat label="Total" value={`$${bid.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
            {bid.proximityScore != null && (
              <span className="text-gray-500">
                <span className="font-medium text-gray-400">Match:</span>{' '}
                <span className={`font-semibold ${proximityColor}`}>{bid.proximityScore}%</span>
              </span>
            )}
          </div>

          {bid.notes && (
            <p className="mt-2 text-xs text-gray-400 italic">"{bid.notes}"</p>
          )}
        </div>

        {/* Right: date */}
        <div className="shrink-0 text-right">
          <p className="text-xs text-gray-400">
            {new Date(bid.createdAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
          <p className="text-xs text-gray-300">
            {new Date(bid.createdAt).toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-gray-500">
      <span className="font-medium text-gray-400">{label}:</span>{' '}
      <span className="font-semibold text-gray-700">{value}</span>
    </span>
  );
}

function getProximityColor(score: number | null): string {
  if (score == null) return 'text-gray-500';
  if (score >= 90) return 'text-brand-teal';
  if (score >= 75) return 'text-yellow-600';
  if (score >= 60) return 'text-orange-600';
  return 'text-red-600';
}
