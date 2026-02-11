import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { fetchTransactions, type TransactionRecord, type Pagination } from '../lib/api';

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTransactions({ page, limit: 20, status: statusFilter || undefined });
      setTransactions(data.transactions);
      setPagination(data.pagination);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <Layout>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-brand-dark">Transactions</h2>
          <p className="mt-1 text-sm text-gray-500">{pagination.total} transactions</p>
        </div>
        <div className="flex gap-2">
          {['', 'pending', 'completed', 'cancelled'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${statusFilter === status ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {status || 'All'}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-blue border-t-transparent" />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-medium text-red-700">{error}</p>
        </div>
      )}

      {!loading && !error && transactions.length === 0 && (
        <div className="rounded-xl border bg-white p-12 text-center">
          <p className="text-sm text-gray-500">No transactions yet. Transactions are created when bids are accepted.</p>
        </div>
      )}

      {!loading && !error && transactions.length > 0 && (
        <>
          <div className="space-y-3">
            {transactions.map((tx) => (
              <div key={tx.id} className="rounded-xl border bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-brand-dark">{tx.product?.name || 'Unknown'}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        tx.status === 'completed' ? 'bg-sky-100 text-brand-blue'
                        : tx.status === 'cancelled' ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                      }`}>
                        {tx.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>Buyer: {tx.buyer?.companyName || tx.buyer?.email}</span>
                      <span>Seller: {tx.seller?.companyName || tx.seller?.email}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-500">
                      <span>Qty: {tx.quantity.toLocaleString()}g</span>
                      <span>Price: ${tx.pricePerUnit.toFixed(2)}/g</span>
                      <span>Total: ${tx.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    {tx.outcomeRecordedAt && (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {tx.actualQuantityDelivered != null && <span className="text-gray-500">Delivered: {tx.actualQuantityDelivered}g</span>}
                        {tx.deliveryOnTime != null && <span className={tx.deliveryOnTime ? 'text-brand-blue' : 'text-red-600'}>On Time: {tx.deliveryOnTime ? 'Yes' : 'No'}</span>}
                        {tx.qualityAsExpected != null && <span className={tx.qualityAsExpected ? 'text-brand-blue' : 'text-red-600'}>Quality OK: {tx.qualityAsExpected ? 'Yes' : 'No'}</span>}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-xs text-gray-400">
                    {new Date(tx.transactionDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {pagination.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button onClick={() => load(pagination.page - 1)} disabled={pagination.page <= 1} className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40">Previous</button>
              <span className="text-sm text-gray-500">Page {pagination.page} of {pagination.totalPages}</span>
              <button onClick={() => load(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40">Next</button>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
