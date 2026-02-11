import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import SellerPicker from '../components/SellerPicker';
import {
  fetchCoaEmailQueue,
  confirmCoaEmail,
  dismissCoaEmail,
  triggerCoaEmailPoll,
  type CoaEmailQueueItem,
} from '../lib/api';

export default function CoaEmailQueue() {
  const [queue, setQueue] = useState<CoaEmailQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const loadQueue = () => {
    setLoading(true);
    fetchCoaEmailQueue()
      .then(setQueue)
      .catch((err) => setError(err?.response?.data?.error || 'Failed to load queue'))
      .finally(() => setLoading(false));
  };

  useEffect(loadQueue, []);

  const handlePoll = async () => {
    setPolling(true);
    try {
      await triggerCoaEmailPoll();
      loadQueue();
    } catch {
      // ignore
    }
    setPolling(false);
  };

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between rounded-lg bg-gradient-to-r from-brand-teal to-brand-blue px-6 py-5 text-white">
        <div>
          <h1 className="text-2xl font-bold">CoA Inbox</h1>
          <p className="mt-0.5 text-sm text-white/70">Email-ingested CoA documents awaiting seller assignment</p>
        </div>
        <button
          onClick={handlePoll}
          disabled={polling}
          className="rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30 disabled:opacity-50"
        >
          {polling ? 'Checking...' : 'Check for new emails'}
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-teal border-t-transparent" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {!loading && queue.length === 0 && (
        <div className="rounded-lg border bg-white p-12 text-center">
          <svg className="mx-auto mb-3 h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9v.906a2.25 2.25 0 0 1-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 0 0 1.183 1.981l6.478 3.488m8.839 2.51-4.66-2.51m0 0-1.023-.55a2.25 2.25 0 0 0-2.134 0l-1.022.55m0 0-4.661 2.51m16.5 1.615a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V8.844a2.25 2.25 0 0 1 1.183-1.981l7.5-4.039a2.25 2.25 0 0 1 2.134 0l7.5 4.039a2.25 2.25 0 0 1 1.183 1.98V19.5Z" />
          </svg>
          <p className="text-sm text-gray-500">No pending email ingestions</p>
        </div>
      )}

      <div className="space-y-4">
        {queue.map((item) => (
          <QueueCard key={item.id} item={item} onUpdate={loadQueue} />
        ))}
      </div>
    </Layout>
  );
}

function QueueCard({ item, onUpdate }: { item: CoaEmailQueueItem; onUpdate: () => void }) {
  const [sellerId, setSellerId] = useState<string | null>(item.suggestedSellerId);
  const [confirming, setConfirming] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!sellerId) return;
    setConfirming(true);
    setError(null);
    try {
      await confirmCoaEmail(item.id, sellerId);
      onUpdate();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to confirm');
    }
    setConfirming(false);
  };

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      await dismissCoaEmail(item.id);
      onUpdate();
    } catch {
      // ignore
    }
    setDismissing(false);
  };

  const confidenceColor = {
    high: 'bg-brand-sage/20 text-brand-teal',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-red-100 text-red-700',
  }[item.confidence || ''] || 'bg-gray-100 text-gray-600';

  return (
    <div className="rounded-lg border border-l-4 border-l-brand-teal bg-white p-5">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">{item.coaProductName || 'Untitled Product'}</h3>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
            {item.emailSender && <span>From: {item.emailSender}</span>}
            {item.emailSubject && <span>Subject: {item.emailSubject}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${confidenceColor}`}>
            {item.confidence ? `${item.confidence} confidence` : 'no match'}
          </span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {item.status}
          </span>
        </div>
      </div>

      {item.matchReason && (
        <p className="mb-3 text-xs text-gray-400">Match: {item.matchReason}</p>
      )}

      {/* Extracted data preview */}
      {item.rawData?.mappedFields && (
        <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-gray-50 p-3 text-xs sm:grid-cols-4">
          {item.rawData.mappedFields.labName && (
            <div><span className="text-gray-400">Lab:</span> <span className="font-medium">{item.rawData.mappedFields.labName}</span></div>
          )}
          {item.rawData.mappedFields.type && (
            <div><span className="text-gray-400">Type:</span> <span className="font-medium">{item.rawData.mappedFields.type}</span></div>
          )}
          {item.rawData.mappedFields.thcMax != null && (
            <div><span className="text-gray-400">THC:</span> <span className="font-medium">{item.rawData.mappedFields.thcMax}%</span></div>
          )}
          {item.rawData.mappedFields.cbdMax != null && (
            <div><span className="text-gray-400">CBD:</span> <span className="font-medium">{item.rawData.mappedFields.cbdMax}%</span></div>
          )}
        </div>
      )}

      {/* Seller picker */}
      <div className="mb-4">
        <SellerPicker
          value={sellerId}
          onChange={setSellerId}
          suggestedSeller={item.suggestedSeller || undefined}
        />
      </div>

      {error && (
        <p className="mb-3 text-xs text-red-600">{error}</p>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleConfirm}
          disabled={!sellerId || confirming}
          className="rounded-lg bg-brand-teal px-4 py-2 text-sm font-medium text-white hover:bg-brand-teal/90 disabled:opacity-50"
        >
          {confirming ? 'Creating...' : 'Confirm & List'}
        </button>
        <button
          onClick={handleDismiss}
          disabled={dismissing}
          className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          {dismissing ? 'Dismissing...' : 'Dismiss'}
        </button>
      </div>
    </div>
  );
}
