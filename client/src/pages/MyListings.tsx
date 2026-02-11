import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import SellerScoreCard from '../components/SellerScoreCard';
import ShareModal from '../components/ShareModal';
import {
  fetchMyListings,
  updateMyListing,
  toggleListingActive,
  fetchSellerScores,
  type SellerListing,
  type SellerScoreRecord,
} from '../lib/api';

const TYPE_COLORS: Record<string, string> = {
  Sativa: 'bg-orange-100 text-orange-700',
  Indica: 'bg-purple-100 text-purple-700',
  Hybrid: 'bg-teal-100 text-teal-700',
};

export default function MyListings() {
  const [listings, setListings] = useState<SellerListing[]>([]);
  const [myScore, setMyScore] = useState<SellerScoreRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const location = useLocation();
  const [successMsg, setSuccessMsg] = useState<string | null>(
    (location.state as any)?.created
      ? (location.state as any)?.pending
        ? 'Listing submitted for approval! It will go live once the team reviews it.'
        : 'Listing created successfully!'
      : null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMyListings();
      setListings(data);
      // Try to load seller's own score (may fail if no scores exist)
      fetchSellerScores().then((res) => {
        if (res.scores.length > 0) setMyScore(res.scores[0]);
      }).catch(() => {});
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load listings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Layout>
      {/* Seller Score Summary */}
      {myScore && myScore.transactionsScored > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">Your Seller Score</h3>
          <SellerScoreCard
            fillRate={myScore.fillRate}
            qualityScore={myScore.qualityScore}
            deliveryScore={myScore.deliveryScore}
            pricingScore={myScore.pricingScore}
            overallScore={myScore.overallScore}
            transactionsScored={myScore.transactionsScored}
          />
        </div>
      )}

      {successMsg && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-3">
          <span className="text-sm font-medium text-green-700">{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-green-500 hover:text-green-700">&times;</button>
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-brand-dark">My Listings</h2>
          <p className="text-sm text-gray-500">
            {listings.length} product{listings.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/create-listing"
            className="flex items-center gap-1.5 rounded-lg bg-brand-teal px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-blue"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create Listing
          </Link>
          {listings.length > 0 && (
            <button
              onClick={() => setShowShareModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-brand-blue px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-teal"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
              </svg>
              Share Products
            </button>
          )}
        </div>
      </div>

      {showShareModal && (
        <ShareModal listings={listings} onClose={() => setShowShareModal(false)} />
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-600 border-t-transparent" />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-medium text-red-700">{error}</p>
          <button onClick={load} className="mt-3 text-sm font-medium text-red-600 underline">Try again</button>
        </div>
      )}

      {!loading && !error && listings.length === 0 && (
        <div className="rounded-xl border bg-white p-12 text-center">
          <h3 className="mb-2 text-lg font-semibold text-gray-700">No listings yet</h3>
          <p className="mb-4 text-sm text-gray-500">Your products will appear here once they're synced from Zoho CRM or created manually.</p>
          <Link
            to="/create-listing"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-teal px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-blue"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create Your First Listing
          </Link>
        </div>
      )}

      {!loading && !error && listings.length > 0 && (
        <div className="space-y-4">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} onUpdate={load} />
          ))}
        </div>
      )}
    </Layout>
  );
}

const SOURCE_BADGES: Record<string, { label: string; class: string }> = {
  zoho: { label: 'Zoho', class: 'bg-blue-50 text-blue-600' },
  manual: { label: 'Manual', class: 'bg-violet-50 text-violet-600' },
  'coa-email': { label: 'CoA Email', class: 'bg-cyan-50 text-cyan-600' },
};

function ListingCard({ listing, onUpdate }: { listing: SellerListing; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [price, setPrice] = useState(String(listing.pricePerUnit ?? ''));
  const [grams, setGrams] = useState(String(listing.gramsAvailable ?? ''));
  const [upcoming, setUpcoming] = useState(String(listing.upcomingQty ?? ''));
  const [minQty, setMinQty] = useState(String(listing.minQtyRequest ?? ''));
  const [desc, setDesc] = useState(listing.description ?? '');

  function resetFields() {
    setPrice(String(listing.pricePerUnit ?? ''));
    setGrams(String(listing.gramsAvailable ?? ''));
    setUpcoming(String(listing.upcomingQty ?? ''));
    setMinQty(String(listing.minQtyRequest ?? ''));
    setDesc(listing.description ?? '');
    setEditError(null);
  }

  async function handleSave() {
    setSaving(true);
    setEditError(null);
    try {
      const updates: Record<string, number | string> = {};
      const newPrice = parseFloat(price);
      const newGrams = parseFloat(grams);
      const newUpcoming = parseFloat(upcoming);
      const newMinQty = parseFloat(minQty);

      if (!isNaN(newPrice) && newPrice !== listing.pricePerUnit) updates.pricePerUnit = newPrice;
      if (!isNaN(newGrams) && newGrams !== listing.gramsAvailable) updates.gramsAvailable = newGrams;
      if (!isNaN(newUpcoming) && newUpcoming !== listing.upcomingQty) updates.upcomingQty = newUpcoming;
      if (!isNaN(newMinQty) && newMinQty !== listing.minQtyRequest) updates.minQtyRequest = newMinQty;
      if (desc.trim() !== (listing.description ?? '')) updates.description = desc.trim();

      if (Object.keys(updates).length === 0) {
        setEditing(false);
        return;
      }

      await updateMyListing(listing.id, updates);
      setEditing(false);
      onUpdate();
    } catch (err: any) {
      setEditError(err?.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle() {
    setToggling(true);
    try {
      await toggleListingActive(listing.id);
      onUpdate();
    } catch {
      // Silently fail — optimistic UI would be better but keeping it simple
    } finally {
      setToggling(false);
    }
  }

  const statusBadge = listing.requestPending
    ? { label: 'Pending', class: 'bg-amber-100 text-amber-700' }
    : listing.isActive
      ? { label: 'Active', class: 'bg-green-100 text-green-700' }
      : { label: 'Paused', class: 'bg-gray-100 text-gray-500' };

  const sourceBadge = SOURCE_BADGES[listing.source] || { label: listing.source, class: 'bg-gray-50 text-gray-500' };

  const thcDisplay = listing.thcMin != null && listing.thcMax != null && listing.thcMin !== listing.thcMax
    ? `${listing.thcMin}–${listing.thcMax}%`
    : listing.thcMax != null
      ? `${listing.thcMax}%`
      : null;

  const cbdDisplay = listing.cbdMin != null && listing.cbdMax != null && listing.cbdMin !== listing.cbdMax
    ? `${listing.cbdMin}–${listing.cbdMax}%`
    : listing.cbdMax != null
      ? `${listing.cbdMax}%`
      : null;

  return (
    <div className="rounded-xl border bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {/* Thumbnail */}
        <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
          {listing.imageUrls?.[0] ? (
            <img src={listing.imageUrls[0]} alt={listing.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
              </svg>
            </div>
          )}
        </div>

        {/* Left: product info */}
        <div className="min-w-0 flex-1">
          {/* Header row: name + badges */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-gray-900">{listing.name}</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge.class}`}>
              {statusBadge.label}
            </span>
            {listing.type && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[listing.type] || 'bg-gray-100 text-gray-600'}`}>
                {listing.type}
              </span>
            )}
            {listing.category && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                {listing.category}
              </span>
            )}
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sourceBadge.class}`}>
              {sourceBadge.label}
            </span>
            {listing.pendingBids > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6z" />
                </svg>
                {listing.pendingBids} new bid{listing.pendingBids > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Stats / Edit form */}
          {!editing ? (
            <>
              {/* Primary stats row */}
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <Stat label="Price" value={listing.pricePerUnit != null ? `$${listing.pricePerUnit.toFixed(2)}/g` : '—'} />
                <Stat label="Available" value={listing.gramsAvailable != null ? `${listing.gramsAvailable.toLocaleString()}g` : '—'} />
                <Stat label="Upcoming" value={listing.upcomingQty != null ? `${listing.upcomingQty.toLocaleString()}g` : '—'} />
                {thcDisplay && <Stat label="THC" value={thcDisplay} />}
                {cbdDisplay && <Stat label="CBD" value={cbdDisplay} />}
                <Stat label="Total Bids" value={String(listing.totalBids)} />
                {(listing as any).matchCount > 0 && (
                  <Stat label="Matches" value={String((listing as any).matchCount)} />
                )}
              </div>

              {/* Expandable details */}
              {expanded && (
                <div className="mt-3 border-t pt-3">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-3">
                    {listing.licensedProducer && <Stat label="LP" value={listing.licensedProducer} />}
                    {listing.lineage && <Stat label="Lineage" value={listing.lineage} />}
                    {listing.dominantTerpene && <Stat label="Terpene" value={listing.dominantTerpene} />}
                    {listing.certification && <Stat label="Cert" value={listing.certification} />}
                    {listing.minQtyRequest != null && <Stat label="Min QTY" value={`${listing.minQtyRequest.toLocaleString()}g`} />}
                    {listing.harvestDate && (
                      <Stat label="Harvest" value={new Date(listing.harvestDate).toLocaleDateString()} />
                    )}
                    {listing.lastSyncedAt && (
                      <Stat label="Last Sync" value={new Date(listing.lastSyncedAt).toLocaleDateString()} />
                    )}
                  </div>
                  {listing.description && (
                    <p className="mt-2 text-xs leading-relaxed text-gray-500">{listing.description}</p>
                  )}
                </div>
              )}

              {/* Expand/collapse toggle */}
              <button
                onClick={() => setExpanded(!expanded)}
                className="mt-1.5 text-xs font-medium text-brand-blue hover:underline"
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            </>
          ) : (
            <div className="mt-2 space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <EditField label="Price ($/g)" value={price} onChange={setPrice} step="0.01" />
                <EditField label="Available (g)" value={grams} onChange={setGrams} step="1" />
                <EditField label="Upcoming (g)" value={upcoming} onChange={setUpcoming} step="1" />
                <EditField label="Min QTY (g)" value={minQty} onChange={setMinQty} step="1" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Description</label>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              {editError && <p className="text-xs text-red-600">{editError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-lg bg-green-700 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-green-800 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={() => { setEditing(false); resetFields(); }}
                  className="rounded-lg border px-4 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: actions */}
        {!editing && (
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Edit
            </button>
            {!listing.requestPending && (
              <button
                onClick={handleToggle}
                disabled={toggling}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                  listing.isActive
                    ? 'border border-amber-300 text-amber-700 hover:bg-amber-50'
                    : 'border border-green-300 text-green-700 hover:bg-green-50'
                }`}
              >
                {toggling ? '...' : listing.isActive ? 'Pause' : 'Activate'}
              </button>
            )}
          </div>
        )}
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

function EditField({ label, value, onChange, step }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      <input
        type="number"
        step={step}
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
      />
    </div>
  );
}
