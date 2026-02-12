import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import {
  fetchShares,
  createShare,
  updateShare,
  deleteShare,
  fetchProducts,
  type CuratedShareData,
  type ProductCard,
} from '../lib/api';

export default function CuratedShares() {
  const [shares, setShares] = useState<CuratedShareData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const loadShares = () => {
    setLoading(true);
    fetchShares()
      .then(setShares)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(loadShares, []);

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-primary">Curated Shares</h1>
          <p className="text-sm text-muted">Create and manage shareable product catalogs</p>
          <div className="mt-2 h-1 w-12 rounded-full bg-gradient-to-r from-brand-teal to-brand-blue" />
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-brand-teal px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-blue"
        >
          + New Share
        </button>
      </div>

      {showCreate && (
        <CreateShareForm
          onCreated={() => { setShowCreate(false); loadShares(); }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-teal border-t-transparent" />
        </div>
      )}

      {!loading && shares.length === 0 && !showCreate && (
        <div className="rounded-lg border border-subtle surface p-12 text-center">
          <p className="text-sm text-muted">No shares created yet</p>
        </div>
      )}

      <div className="space-y-4">
        {shares.map((share) => (
          <ShareCard key={share.id} share={share} onUpdate={loadShares} />
        ))}
      </div>
    </Layout>
  );
}

function CreateShareForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [label, setLabel] = useState('');
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);

  useEffect(() => {
    setLoadingProducts(true);
    fetchProducts({ limit: 100 })
      .then((res) => setProducts(res.products))
      .catch(() => {})
      .finally(() => setLoadingProducts(false));
  }, []);

  const filtered = products.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.licensedProducer || '').toLowerCase().includes(q);
  });

  const handleCreate = async () => {
    if (!label || selectedIds.length === 0) return;
    setCreating(true);
    try {
      await createShare({ label, productIds: selectedIds });
      onCreated();
    } catch {
      // ignore
    }
    setCreating(false);
  };

  return (
    <div className="mb-6 rounded-lg border border-subtle surface p-6">
      <h3 className="mb-4 text-lg font-semibold text-primary">Create Share Link</h3>

      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-muted">Label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g., Q1 2026 Product Catalog for ABC Corp"
          className="w-full rounded-lg border border-subtle surface px-3 py-2 text-sm text-primary outline-none focus:border-brand-teal"
        />
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-muted">
          Products ({selectedIds.length} selected)
        </label>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products..."
          className="mb-2 w-full rounded-lg border border-subtle surface px-3 py-2 text-sm text-primary outline-none focus:border-brand-teal"
        />
        <div className="max-h-48 overflow-auto rounded-lg border border-subtle p-2">
          {loadingProducts ? (
            <p className="text-xs text-faint">Loading products...</p>
          ) : (
            filtered.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover-surface-muted">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(p.id)}
                  onChange={() => {
                    setSelectedIds((prev) =>
                      prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id],
                    );
                  }}
                  className="rounded border-default"
                />
                <span className="text-sm text-secondary">{p.name}</span>
                {p.licensedProducer && (
                  <span className="text-xs text-faint">by {p.licensedProducer}</span>
                )}
              </label>
            ))
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleCreate}
          disabled={!label || selectedIds.length === 0 || creating}
          className="rounded-lg bg-brand-teal px-4 py-2 text-sm font-medium text-white hover:bg-brand-teal/90 disabled:opacity-50"
        >
          {creating ? 'Creating...' : 'Create Share Link'}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-subtle px-4 py-2 text-sm text-secondary hover-surface-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ShareCard({ share, onUpdate }: { share: CuratedShareData; onUpdate: () => void }) {
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}/share/${share.token}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleToggle = async () => {
    try {
      await updateShare(share.id, { active: !share.active });
      onUpdate();
    } catch {
      // ignore
    }
  };

  const handleDelete = async () => {
    try {
      await deleteShare(share.id);
      onUpdate();
    } catch {
      // ignore
    }
  };

  return (
    <div className={`rounded-lg border border-brand-blue/15 border-l-4 bg-brand-blue/5 shadow-md p-5 ${share.active ? 'border-l-brand-teal' : 'border-l-gray-300 dark:border-l-slate-600 opacity-60'}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-primary">{share.label}</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${share.active ? 'bg-brand-sage/20 text-brand-teal' : 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400'}`}>
              {share.active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-faint">
            <span>{share.productIds.length} products</span>
            <span>{share.useCount} views</span>
            {share.lastUsedAt && <span>Last viewed: {new Date(share.lastUsedAt).toLocaleDateString()}</span>}
            {share.expiresAt && <span>Expires: {new Date(share.expiresAt).toLocaleDateString()}</span>}
            <span>Created: {new Date(share.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Share URL */}
      <div className="mt-3 flex items-center gap-2 rounded-lg surface-muted px-3 py-2">
        <input
          type="text"
          readOnly
          value={shareUrl}
          className="flex-1 bg-transparent text-xs text-secondary outline-none"
        />
        <button
          onClick={copyLink}
          className="rounded-md surface px-3 py-1 text-xs font-medium text-secondary shadow-sm hover-surface-muted"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Actions */}
      <div className="mt-3 flex gap-3">
        <button
          onClick={handleToggle}
          className="text-xs font-medium text-muted hover:text-secondary dark:hover:text-slate-200"
        >
          {share.active ? 'Deactivate' : 'Reactivate'}
        </button>
        <button
          onClick={handleDelete}
          className="text-xs font-medium text-red-500 hover:text-red-700"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
