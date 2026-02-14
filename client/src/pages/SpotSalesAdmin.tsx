import { useState, useEffect, useMemo } from 'react';
import Layout from '../components/Layout';
import {
  fetchSpotSalesAdmin,
  createSpotSale,
  updateSpotSale,
  deleteSpotSale,
  recordSpotSale,
  fetchProducts,
  fetchAdminUsers,
  type SpotSaleAdminRecord,
  type ProductCard,
  type AdminUser,
  type Pagination,
} from '../lib/api';

type StatusFilter = 'all' | 'active' | 'expired' | 'deactivated';

export default function SpotSalesAdmin() {
  const [spotSales, setSpotSales] = useState<SpotSaleAdminRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [page, setPage] = useState(1);

  const loadSpotSales = (p = page, status = statusFilter) => {
    setLoading(true);
    fetchSpotSalesAdmin({ page: p, limit: 20, status })
      .then((res) => {
        setSpotSales(res.spotSales);
        setPagination(res.pagination);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadSpotSales(1, statusFilter); }, [statusFilter]);

  const handleCreated = () => {
    setShowCreate(false);
    setPage(1);
    loadSpotSales(1, statusFilter);
  };

  const handleToggle = async (id: string, active: boolean) => {
    try {
      await updateSpotSale(id, { active: !active });
      loadSpotSales();
    } catch {}
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSpotSale(id);
      loadSpotSales();
    } catch {}
  };

  const statusTabs: { label: string; value: StatusFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Active', value: 'active' },
    { label: 'Expired', value: 'expired' },
    { label: 'Deactivated', value: 'deactivated' },
  ];

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-primary">Spot Sales Management</h1>
          <p className="text-sm text-muted">Create and manage limited-time product deals</p>
          <div className="mt-2 h-1 w-12 rounded-full bg-gradient-to-r from-brand-coral to-brand-yellow" />
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-brand-teal px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-blue"
        >
          + New Spot Sale
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <CreateSpotSaleForm
          onCreated={handleCreated}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Status filter tabs */}
      <div className="mb-4 flex gap-1 rounded-lg surface-muted p-1">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setStatusFilter(tab.value); setPage(1); }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              statusFilter === tab.value
                ? 'bg-brand-teal text-white shadow-sm'
                : 'text-secondary hover-surface-muted'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-teal border-t-transparent" />
        </div>
      )}

      {/* Empty state */}
      {!loading && spotSales.length === 0 && (
        <div className="rounded-lg border border-subtle surface p-12 text-center">
          <p className="text-sm text-muted">No spot sales found</p>
        </div>
      )}

      {/* Spot sale cards */}
      <div className="space-y-4">
        {spotSales.map((ss) => (
          <AdminSpotSaleCard
            key={ss.id}
            spotSale={ss}
            onToggle={() => handleToggle(ss.id, ss.active)}
            onDelete={() => handleDelete(ss.id)}
            onSaleRecorded={() => loadSpotSales()}
          />
        ))}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={() => { setPage(page - 1); loadSpotSales(page - 1); }}
            disabled={page <= 1}
            className="rounded-lg border border-subtle px-3 py-1.5 text-sm text-secondary disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-muted">
            Page {page} of {pagination.totalPages}
          </span>
          <button
            onClick={() => { setPage(page + 1); loadSpotSales(page + 1); }}
            disabled={page >= pagination.totalPages}
            className="rounded-lg border border-subtle px-3 py-1.5 text-sm text-secondary disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </Layout>
  );
}

function CreateSpotSaleForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [spotPrice, setSpotPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoadingProducts(true);
    fetchProducts({ limit: 100 })
      .then((res) => setProducts(res.products.filter((p) => p.pricePerUnit && p.pricePerUnit > 0)))
      .catch(() => {})
      .finally(() => setLoadingProducts(false));
  }, []);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId),
    [products, selectedProductId],
  );

  const spotPriceNum = parseFloat(spotPrice);
  const quantityNum = quantity ? parseFloat(quantity) : undefined;
  const originalPrice = selectedProduct?.pricePerUnit ?? 0;
  const discountPercent = originalPrice > 0 && spotPriceNum > 0
    ? Math.round(((originalPrice - spotPriceNum) / originalPrice) * 100)
    : 0;

  const isValid =
    selectedProductId &&
    spotPriceNum > 0 &&
    spotPriceNum < originalPrice &&
    expiresAt &&
    new Date(expiresAt) > new Date() &&
    (!quantityNum || quantityNum > 0);

  const filtered = products.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.licensedProducer || '').toLowerCase().includes(q);
  });

  const setQuickExpiry = (hours: number) => {
    const d = new Date(Date.now() + hours * 60 * 60 * 1000);
    // Format as local datetime-local value
    const pad = (n: number) => String(n).padStart(2, '0');
    setExpiresAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
  };

  const handleCreate = async () => {
    if (!isValid) return;
    setCreating(true);
    setError('');
    try {
      await createSpotSale({
        productId: selectedProductId,
        spotPrice: spotPriceNum,
        ...(quantityNum ? { quantity: quantityNum } : {}),
        expiresAt: new Date(expiresAt).toISOString(),
      });
      onCreated();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create spot sale');
    }
    setCreating(false);
  };

  return (
    <div className="mb-6 rounded-lg border border-subtle surface p-6">
      <h3 className="mb-4 text-lg font-semibold text-primary">Create Spot Sale</h3>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Product picker */}
      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-muted">Product</label>
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
                  type="radio"
                  name="spotProduct"
                  checked={selectedProductId === p.id}
                  onChange={() => setSelectedProductId(p.id)}
                  className="border-default"
                />
                <span className="text-sm text-secondary">{p.name}</span>
                <span className="ml-auto text-xs text-faint">${p.pricePerUnit?.toFixed(2)}/g</span>
              </label>
            ))
          )}
          {!loadingProducts && filtered.length === 0 && (
            <p className="px-2 py-1 text-xs text-faint">No products with prices found</p>
          )}
        </div>
      </div>

      {/* Spot price + discount preview */}
      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-muted">Spot Price ($/g)</label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={spotPrice}
          onChange={(e) => setSpotPrice(e.target.value)}
          placeholder="e.g., 2.50"
          className="w-full rounded-lg border border-subtle surface px-3 py-2 text-sm text-primary outline-none focus:border-brand-teal"
        />
        {selectedProduct && spotPriceNum > 0 && (
          <p className={`mt-1 text-xs ${spotPriceNum < originalPrice ? 'text-brand-teal dark:text-brand-sage' : 'text-red-500'}`}>
            ${originalPrice.toFixed(2)} → ${spotPriceNum.toFixed(2)} — {spotPriceNum < originalPrice ? `${discountPercent}% off` : 'Must be less than original'}
          </p>
        )}
      </div>

      {/* Quantity */}
      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-muted">Quantity (grams)</label>
        <input
          type="number"
          step="1"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Leave blank for full product quantity"
          className="w-full rounded-lg border border-subtle surface px-3 py-2 text-sm text-primary outline-none focus:border-brand-teal"
        />
        {selectedProduct && quantityNum && (selectedProduct.gramsAvailable ?? 0) > 0 && (
          <p className="mt-1 text-xs text-faint">
            Product has {selectedProduct.gramsAvailable?.toLocaleString()}g total — spot sale for {quantityNum.toLocaleString()}g
          </p>
        )}
      </div>

      {/* Expiry */}
      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-muted">Expires At</label>
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="w-full rounded-lg border border-subtle surface px-3 py-2 text-sm text-primary outline-none focus:border-brand-teal"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setQuickExpiry(24)}
            className="rounded border border-subtle px-2 py-1 text-xs text-secondary hover-surface-muted"
          >
            24h
          </button>
          <button
            type="button"
            onClick={() => setQuickExpiry(48)}
            className="rounded border border-subtle px-2 py-1 text-xs text-secondary hover-surface-muted"
          >
            48h
          </button>
          <button
            type="button"
            onClick={() => setQuickExpiry(24 * 7)}
            className="rounded border border-subtle px-2 py-1 text-xs text-secondary hover-surface-muted"
          >
            1 week
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleCreate}
          disabled={!isValid || creating}
          className="rounded-lg bg-brand-teal px-4 py-2 text-sm font-medium text-white hover:bg-brand-teal/90 disabled:opacity-50"
        >
          {creating ? 'Creating...' : 'Create Spot Sale'}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-subtle px-4 py-2 text-sm text-secondary hover-surface-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}

function AdminSpotSaleCard({
  spotSale,
  onToggle,
  onDelete,
  onSaleRecorded,
}: {
  spotSale: SpotSaleAdminRecord;
  onToggle: () => void;
  onDelete: () => void;
  onSaleRecorded: () => void;
}) {
  const [showRecordSale, setShowRecordSale] = useState(false);

  const now = new Date();
  const expired = new Date(spotSale.expiresAt) <= now;
  const status = !spotSale.active ? 'deactivated' : expired ? 'expired' : 'active';

  const statusColors: Record<string, string> = {
    active: 'bg-brand-sage/20 text-brand-teal',
    expired: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    deactivated: 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400',
  };

  return (
    <div className={`rounded-lg border border-brand-blue/15 border-l-4 bg-brand-blue/5 shadow-md p-5 ${
      status === 'active' ? 'border-l-brand-teal' : 'border-l-gray-300 dark:border-l-slate-600 opacity-70'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {/* Product image thumbnail */}
          <div className="hidden h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-gray/20 dark:bg-slate-700/40 sm:flex">
            {spotSale.product.imageUrls?.[0] ? (
              <img src={spotSale.product.imageUrls[0]} alt="" className="h-full w-full object-cover" />
            ) : (
              <svg className="h-8 w-8 text-brand-teal/20" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
              </svg>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-primary">{spotSale.product.name}</h3>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[status]}`}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
            </div>

            {/* Price breakdown */}
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-sm font-bold text-brand-teal dark:text-brand-sage">
                ${spotSale.spotPrice.toFixed(2)}/g
              </span>
              <span className="text-xs text-faint line-through">${spotSale.originalPrice.toFixed(2)}/g</span>
              <span className="rounded-full bg-brand-coral/10 px-1.5 py-0.5 text-xs font-medium text-brand-coral">
                -{Math.round(spotSale.discountPercent)}%
              </span>
            </div>

            {/* Meta info */}
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-faint">
              {spotSale.quantity && <span>{spotSale.quantity.toLocaleString()}g at spot price</span>}
              <span>Expires: {new Date(spotSale.expiresAt).toLocaleString()}</span>
              <span>Created: {new Date(spotSale.createdAt).toLocaleDateString()}</span>
              <span>By: {spotSale.createdBy.email}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-3 flex gap-3">
        {status === 'active' && (
          <button
            onClick={() => setShowRecordSale(true)}
            className="rounded-md bg-brand-teal px-3 py-1 text-xs font-medium text-white hover:bg-brand-teal/90"
          >
            Record Sale
          </button>
        )}
        <button
          onClick={onToggle}
          className="text-xs font-medium text-muted hover:text-secondary dark:hover:text-slate-200"
        >
          {spotSale.active ? 'Deactivate' : 'Reactivate'}
        </button>
        <button
          onClick={onDelete}
          className="text-xs font-medium text-red-500 hover:text-red-700"
        >
          Delete
        </button>
      </div>

      {/* Record Sale inline form */}
      {showRecordSale && (
        <RecordSaleForm
          spotSale={spotSale}
          onRecorded={() => { setShowRecordSale(false); onSaleRecorded(); }}
          onCancel={() => setShowRecordSale(false)}
        />
      )}
    </div>
  );
}

function RecordSaleForm({
  spotSale,
  onRecorded,
  onCancel,
}: {
  spotSale: SpotSaleAdminRecord;
  onRecorded: () => void;
  onCancel: () => void;
}) {
  const [buyers, setBuyers] = useState<AdminUser[]>([]);
  const [loadingBuyers, setLoadingBuyers] = useState(true);
  const [buyerSearch, setBuyerSearch] = useState('');
  const [selectedBuyerId, setSelectedBuyerId] = useState('');
  const [quantity, setQuantity] = useState(
    spotSale.quantity ? String(spotSale.quantity) : String(spotSale.product.gramsAvailable ?? ''),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoadingBuyers(true);
    fetchAdminUsers('approved')
      .then(setBuyers)
      .catch(() => {})
      .finally(() => setLoadingBuyers(false));
  }, []);

  const selectedBuyer = useMemo(
    () => buyers.find((b) => b.id === selectedBuyerId),
    [buyers, selectedBuyerId],
  );

  const qtyNum = parseFloat(quantity);
  const maxQty = spotSale.quantity ?? spotSale.product.gramsAvailable ?? Infinity;
  const totalValue = qtyNum > 0 ? spotSale.spotPrice * qtyNum : 0;

  const isValid = selectedBuyerId && qtyNum > 0 && qtyNum <= maxQty;

  const filteredBuyers = buyers.filter((b) => {
    if (!buyerSearch) return true;
    const q = buyerSearch.toLowerCase();
    return (
      b.email.toLowerCase().includes(q) ||
      (b.companyName || '').toLowerCase().includes(q) ||
      (b.firstName || '').toLowerCase().includes(q) ||
      (b.lastName || '').toLowerCase().includes(q)
    );
  });

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    setError('');
    try {
      await recordSpotSale(spotSale.id, { buyerId: selectedBuyerId, quantity: qtyNum });
      onRecorded();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to record sale');
    }
    setSubmitting(false);
  };

  return (
    <div className="mt-4 rounded-lg border border-brand-teal/20 surface p-4">
      <h4 className="mb-3 text-sm font-semibold text-primary">Record Spot Sale</h4>

      {error && (
        <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-900/20 p-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Buyer picker */}
      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-muted">Buyer</label>
        <input
          type="text"
          value={buyerSearch}
          onChange={(e) => setBuyerSearch(e.target.value)}
          placeholder="Search approved buyers..."
          className="mb-1 w-full rounded-lg border border-subtle surface px-3 py-1.5 text-sm text-primary outline-none focus:border-brand-teal"
        />
        <div className="max-h-36 overflow-auto rounded-lg border border-subtle p-1">
          {loadingBuyers ? (
            <p className="px-2 py-1 text-xs text-faint">Loading buyers...</p>
          ) : (
            filteredBuyers.map((b) => (
              <label key={b.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover-surface-muted">
                <input
                  type="radio"
                  name="spotBuyer"
                  checked={selectedBuyerId === b.id}
                  onChange={() => setSelectedBuyerId(b.id)}
                  className="border-default"
                />
                <span className="text-sm text-secondary">
                  {b.companyName || `${b.firstName || ''} ${b.lastName || ''}`.trim() || b.email}
                </span>
                <span className="ml-auto text-xs text-faint">{b.email}</span>
              </label>
            ))
          )}
          {!loadingBuyers && filteredBuyers.length === 0 && (
            <p className="px-2 py-1 text-xs text-faint">No approved buyers found</p>
          )}
        </div>
      </div>

      {/* Quantity input */}
      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-muted">Quantity (grams)</label>
        <input
          type="number"
          step="1"
          min="1"
          max={maxQty === Infinity ? undefined : maxQty}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-full rounded-lg border border-subtle surface px-3 py-1.5 text-sm text-primary outline-none focus:border-brand-teal"
        />
        {maxQty !== Infinity && (
          <p className="mt-0.5 text-xs text-faint">Max: {maxQty.toLocaleString()}g</p>
        )}
      </div>

      {/* Summary line */}
      {isValid && selectedBuyer && (
        <div className="mb-3 rounded-md bg-brand-sage/10 px-3 py-2 text-sm text-primary">
          Sell <span className="font-semibold">{qtyNum.toLocaleString()}g</span> of{' '}
          <span className="font-semibold">{spotSale.product.name}</span> to{' '}
          <span className="font-semibold">{selectedBuyer.companyName || selectedBuyer.email}</span>{' '}
          at ${spotSale.spotPrice.toFixed(2)}/g ={' '}
          <span className="font-bold text-brand-teal dark:text-brand-sage">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!isValid || submitting}
          className="rounded-lg bg-brand-teal px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-teal/90 disabled:opacity-50"
        >
          {submitting ? 'Recording...' : 'Confirm Sale'}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-subtle px-4 py-1.5 text-sm text-secondary hover-surface-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
