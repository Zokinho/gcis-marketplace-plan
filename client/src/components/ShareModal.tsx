import { useState, useEffect } from 'react';
import {
  createSellerShare,
  fetchSellerShares,
  deleteSellerShare,
  type SellerListing,
  type SellerShare,
} from '../lib/api';

interface Props {
  listings: SellerListing[];
  onClose: () => void;
}

export default function ShareModal({ listings, onClose }: Props) {
  const [tab, setTab] = useState<'create' | 'manage'>('create');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [label, setLabel] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manage tab state
  const [shares, setShares] = useState<SellerShare[]>([]);
  const [loadingShares, setLoadingShares] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const activeListings = listings.filter((l) => l.isActive);

  function toggleProduct(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === activeListings.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(activeListings.map((l) => l.id)));
    }
  }

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const result = await createSellerShare({
        label: label || undefined,
        productIds: selected.size > 0 ? Array.from(selected) : undefined,
        expiresInDays: expiresInDays || undefined,
      });
      setCreatedUrl(result.shareUrl);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create share link');
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy() {
    if (!createdUrl) return;
    await navigator.clipboard.writeText(createdUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function loadShares() {
    setLoadingShares(true);
    try {
      const data = await fetchSellerShares();
      setShares(data.shares);
    } catch {
      // Ignore
    } finally {
      setLoadingShares(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteSellerShare(id);
      setShares((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // Ignore
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    if (tab === 'manage') loadShares();
  }, [tab]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="mx-4 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-dark">Share Your Products</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Tabs */}
        <div className="mb-5 flex gap-1 rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => { setTab('create'); setCreatedUrl(null); }}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${tab === 'create' ? 'bg-white shadow-sm text-brand-dark' : 'text-gray-500'}`}
          >
            Create Link
          </button>
          <button
            onClick={() => setTab('manage')}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${tab === 'manage' ? 'bg-white shadow-sm text-brand-dark' : 'text-gray-500'}`}
          >
            My Links
          </button>
        </div>

        {tab === 'create' && !createdUrl && (
          <>
            {/* Label */}
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-gray-500">Link Label (optional)</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. For Buyer X - February 2026"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
              />
            </div>

            {/* Expiry */}
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-gray-500">Expires in</label>
              <div className="flex gap-2">
                {[7, 14, 30, 90].map((days) => (
                  <button
                    key={days}
                    onClick={() => setExpiresInDays(days)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      expiresInDays === days
                        ? 'bg-brand-blue text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {days}d
                  </button>
                ))}
              </div>
            </div>

            {/* Product selection */}
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-medium text-gray-500">
                  Select products ({selected.size === 0 ? 'all active' : `${selected.size} selected`})
                </label>
                <button onClick={selectAll} className="text-xs font-medium text-brand-blue">
                  {selected.size === activeListings.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">
                {activeListings.length === 0 ? (
                  <p className="py-4 text-center text-sm text-gray-400">No active products</p>
                ) : (
                  activeListings.map((l) => (
                    <label
                      key={l.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-brand-offwhite"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(l.id)}
                        onChange={() => toggleProduct(l.id)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-brand-blue focus:ring-brand-blue"
                      />
                      <span className="flex-1 text-sm text-brand-dark">{l.name}</span>
                      {l.pricePerUnit != null && (
                        <span className="text-xs text-gray-400">${l.pricePerUnit.toFixed(2)}/g</span>
                      )}
                    </label>
                  ))
                )}
              </div>
            </div>

            {error && <p className="mb-3 text-xs text-brand-coral">{error}</p>}

            <button
              onClick={handleCreate}
              disabled={creating || activeListings.length === 0}
              className="w-full rounded-lg bg-brand-blue px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-teal disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Generate Share Link'}
            </button>
          </>
        )}

        {/* Success state */}
        {tab === 'create' && createdUrl && (
          <div className="text-center">
            <div className="mb-4 flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-brand-sage/20">
              <svg className="h-6 w-6 text-brand-sage" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h3 className="mb-2 text-base font-semibold text-brand-dark">Link Created!</h3>
            <p className="mb-4 text-xs text-gray-500">Share this URL with your buyer — no login required.</p>
            <div className="mb-4 flex items-center gap-2 rounded-lg border bg-brand-offwhite p-3">
              <input
                readOnly
                value={createdUrl}
                className="flex-1 bg-transparent text-xs text-brand-dark outline-none"
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={handleCopy}
                className="shrink-0 rounded-md bg-brand-blue px-3 py-1 text-xs font-semibold text-white transition hover:bg-brand-teal"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <button
              onClick={() => { setCreatedUrl(null); setSelected(new Set()); setLabel(''); }}
              className="text-sm font-medium text-brand-blue"
            >
              Create another link
            </button>
          </div>
        )}

        {/* Manage tab */}
        {tab === 'manage' && (
          <>
            {loadingShares && (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-3 border-brand-blue border-t-transparent" />
              </div>
            )}

            {!loadingShares && shares.length === 0 && (
              <p className="py-8 text-center text-sm text-gray-400">No share links yet</p>
            )}

            {!loadingShares && shares.length > 0 && (
              <div className="space-y-3">
                {shares.map((share) => (
                  <div key={share.id} className={`rounded-lg border p-3 ${share.active ? 'bg-white' : 'bg-gray-50 opacity-60'}`}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm font-semibold text-brand-dark">{share.label}</span>
                      {share.active ? (
                        <span className="rounded-full bg-brand-sage/20 px-2 py-0.5 text-xs font-medium text-brand-sage">Active</span>
                      ) : (
                        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-500">Inactive</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>{share.productIds.length} product{share.productIds.length !== 1 ? 's' : ''}</span>
                      <span>{share.useCount} view{share.useCount !== 1 ? 's' : ''}</span>
                      {share.expiresAt && (
                        <span>Expires {new Date(share.expiresAt).toLocaleDateString()}</span>
                      )}
                    </div>
                    {share.active && (
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => { navigator.clipboard.writeText(share.shareUrl); }}
                          className="rounded-md border px-2 py-1 text-xs font-medium text-brand-blue hover:bg-brand-offwhite"
                        >
                          Copy URL
                        </button>
                        <button
                          onClick={() => handleDelete(share.id)}
                          disabled={deletingId === share.id}
                          className="rounded-md border border-brand-coral/40 px-2 py-1 text-xs font-medium text-brand-coral hover:bg-brand-coral/5 disabled:opacity-50"
                        >
                          {deletingId === share.id ? '...' : 'Revoke'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
