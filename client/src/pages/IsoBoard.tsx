import { useState, useEffect, useCallback } from 'react';
import { useUserStatus } from '../lib/useUserStatus';
import Layout from '../components/Layout';
import MarketplaceTabs from '../components/MarketplaceTabs';
import {
  fetchIsoBoard,
  fetchMyIsos,
  createIsoRequest,
  updateIso,
  respondToIso,
  IsoRequestRecord,
  IsoStatusType,
  Pagination,
} from '../lib/api';

const ALL_CATEGORIES = [
  'Cannabis flowers (mix sizes)',
  'Cannabis flowers (smalls only)',
  'Cannabis flowers (fresh frozen)',
  'Cannabis flowers (outdoor grown)',
  'Cannabis flowers (outdoor fresh frozen)',
  'Milled Flower',
  'Cannabis trimmings',
  'Cannabis kief',
  'Cannabis cured rosins and cured resins',
  'Cannabis hashish',
  'Cannabis live rosin and live resin',
  'Cannabinoid isolates',
  'Cannabinoid distillates',
  "Cannabis crude oils ('resins')",
  'THCa flowers',
  'THCa diamonds',
  'Genetics',
  'Chocolates',
  'Gummies',
  'Edibles (others)',
];

const ALL_CERTIFICATIONS = ['GACP', 'GMP1', 'GMP2', 'GPP', 'IMC-GAP'];

function IsoStatusBadge({ status }: { status: IsoStatusType }) {
  const styles: Record<string, string> = {
    OPEN: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    MATCHED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    FULFILLED: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    CLOSED: 'surface-muted text-secondary',
    EXPIRED: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || ''}`}>
      {status}
    </span>
  );
}

function ExpiryCountdown({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) return <span className="text-xs text-muted">No expiry</span>;
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return <span className="text-xs text-red-500">Expired</span>;
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return (
    <span className={`text-xs ${days <= 3 ? 'text-red-500' : days <= 7 ? 'text-amber-500' : 'text-muted'}`}>
      {days}d left
    </span>
  );
}

function StaleBadge({ iso }: { iso: IsoRequestRecord }) {
  if (iso.expiresAt || iso.status !== 'OPEN') return null;
  const ageMs = Date.now() - new Date(iso.createdAt).getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  if (ageDays < 60) return null;
  return (
    <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
      Stale ({ageDays}d)
    </span>
  );
}

function IsoCard({
  iso,
  isSeller,
  isAdmin,
  onRespond,
  onClose,
  onRenew,
  onEdit,
}: {
  iso: IsoRequestRecord;
  isSeller: boolean;
  isAdmin: boolean;
  onRespond: (id: string) => void;
  onClose: (id: string) => void;
  onRenew: (id: string) => void;
  onEdit: (iso: IsoRequestRecord) => void;
}) {
  return (
    <div className="rounded-lg border card-blue p-4 shadow-sm hover:shadow-md transition backdrop-blur-sm">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {iso.isPrivate && (
            <svg className="h-3.5 w-3.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          )}
          <h3 className="text-sm font-semibold text-primary line-clamp-1">{iso.title}</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {iso.isPrivate && (
            <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              Private
            </span>
          )}
          <IsoStatusBadge status={iso.status} />
          {isAdmin && <StaleBadge iso={iso} />}
          <ExpiryCountdown expiresAt={iso.expiresAt} />
        </div>
      </div>
      <div className="flex items-center gap-2 mb-3">
        {iso.category && (
          <span className="rounded bg-brand-teal/10 px-2 py-0.5 text-xs font-medium text-brand-teal dark:bg-brand-teal/20 dark:text-brand-sage">
            {iso.category}
          </span>
        )}
        {iso.type && (
          <span className="rounded bg-brand-blue/10 px-2 py-0.5 text-xs font-medium text-brand-blue dark:bg-brand-blue/20 dark:text-brand-blue">
            {iso.type}
          </span>
        )}
      </div>

      {/* Criteria */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-3">
        {(iso.thcMin !== null || iso.thcMax !== null) && (
          <div>
            <span className="text-muted">THC:</span>{' '}
            {iso.thcMin ?? '—'}–{iso.thcMax ?? '—'}%
          </div>
        )}
        {(iso.cbdMin !== null || iso.cbdMax !== null) && (
          <div>
            <span className="text-muted">CBD:</span>{' '}
            {iso.cbdMin ?? '—'}–{iso.cbdMax ?? '—'}%
          </div>
        )}
        {(iso.quantityMin !== null || iso.quantityMax !== null) && (
          <div>
            <span className="text-muted">Qty:</span>{' '}
            {iso.quantityMin ?? '—'}–{iso.quantityMax ?? '—'}g
          </div>
        )}
        {iso.budgetMax !== null && (
          <div>
            <span className="text-muted">Budget:</span>{' '}
            ≤${iso.budgetMax.toFixed(2)}/g
          </div>
        )}
        {iso.certification && (
          <div>
            <span className="text-muted">Cert:</span> {iso.certification}
          </div>
        )}
      </div>

      {iso.notes && (
        <p className="text-sm text-muted line-clamp-2 mb-3">{iso.notes}</p>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-default">
        <span className="text-xs text-muted">
          {iso.responseCount ?? 0} response{(iso.responseCount ?? 0) !== 1 ? 's' : ''}
        </span>
        <div className="flex gap-2">
          {(iso.isOwner || isAdmin) && iso.status === 'OPEN' && (
            <button
              onClick={() => onEdit(iso)}
              className="rounded px-3 py-1 text-xs font-medium text-brand-blue hover:bg-brand-blue/10 transition"
            >
              Edit
            </button>
          )}
          {iso.isOwner && iso.status === 'OPEN' && (
            <button
              onClick={() => onClose(iso.id)}
              className="rounded px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
            >
              Close
            </button>
          )}
          {iso.isOwner && (iso.status === 'EXPIRED' || iso.status === 'CLOSED') && (
            <button
              onClick={() => onRenew(iso.id)}
              className="rounded px-3 py-1 text-xs font-medium text-brand-blue hover:bg-brand-blue/10 transition"
            >
              Renew
            </button>
          )}
          {!iso.isOwner && isSeller && iso.status === 'OPEN' && !iso.hasResponded && (
            <button
              onClick={() => onRespond(iso.id)}
              className="rounded bg-brand-teal px-3 py-1 text-xs font-semibold text-white hover:bg-brand-blue transition"
            >
              I Have This
            </button>
          )}
          {iso.hasResponded && (
            <span className="text-xs text-brand-sage font-medium">Responded</span>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateIsoModal({
  open,
  onClose,
  onCreated,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  categories: string[];
}) {
  const [form, setForm] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data: Record<string, any> = {};
      for (const [k, v] of Object.entries(form)) {
        if (v !== '' && v !== undefined && v !== null) {
          if (k === 'expiresAt' && typeof v === 'string') {
            // Convert YYYY-MM-DD to end-of-day UTC ISO string
            data[k] = new Date(v + 'T23:59:59.999Z').toISOString();
          } else {
            data[k] = v;
          }
        }
      }
      await createIsoRequest(data as any);
      setForm({});
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-lg surface p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-primary">Post Wanted Request</h2>
          <button onClick={onClose} className="text-muted hover:text-primary transition">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Title <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              maxLength={200}
              placeholder="e.g. Looking for premium indoor flower"
              value={form.title || ''}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Category</label>
              <select
                value={form.category || ''}
                onChange={(e) => setForm({ ...form, category: e.target.value || undefined })}
                className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
              >
                <option value="">Any</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Type</label>
              <select
                value={form.type || ''}
                onChange={(e) => setForm({ ...form, type: e.target.value || undefined })}
                className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
              >
                <option value="">Any</option>
                <option value="Sativa">Sativa</option>
                <option value="Indica">Indica</option>
                <option value="Hybrid">Hybrid</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">THC Min (%)</label>
              <input
                type="number" step="0.1" min="0" max="100"
                value={form.thcMin ?? ''}
                onChange={(e) => setForm({ ...form, thcMin: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">THC Max (%)</label>
              <input
                type="number" step="0.1" min="0" max="100"
                value={form.thcMax ?? ''}
                onChange={(e) => setForm({ ...form, thcMax: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">CBD Min (%)</label>
              <input
                type="number" step="0.1" min="0" max="100"
                value={form.cbdMin ?? ''}
                onChange={(e) => setForm({ ...form, cbdMin: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">CBD Max (%)</label>
              <input
                type="number" step="0.1" min="0" max="100"
                value={form.cbdMax ?? ''}
                onChange={(e) => setForm({ ...form, cbdMax: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Qty Min (g)</label>
              <input
                type="number" step="1" min="0"
                value={form.quantityMin ?? ''}
                onChange={(e) => setForm({ ...form, quantityMin: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Qty Max (g)</label>
              <input
                type="number" step="1" min="0"
                value={form.quantityMax ?? ''}
                onChange={(e) => setForm({ ...form, quantityMax: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Max Budget ($/g)</label>
              <input
                type="number" step="0.01" min="0"
                value={form.budgetMax ?? ''}
                onChange={(e) => setForm({ ...form, budgetMax: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Certification</label>
              <select
                value={form.certification || ''}
                onChange={(e) => setForm({ ...form, certification: e.target.value || undefined })}
                className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
              >
                <option value="">Any</option>
                {ALL_CERTIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Notes (optional)</label>
            <textarea
              rows={3}
              maxLength={2000}
              value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value || undefined })}
              placeholder="Describe what you're looking for..."
              className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Expiry Date (optional)</label>
            <input
              type="date"
              value={form.expiresAt || ''}
              min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value || undefined })}
              className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
            />
            <p className="mt-1 text-xs text-muted">Leave blank for no expiry</p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!form.isPrivate}
              onChange={(e) => setForm({ ...form, isPrivate: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-brand-teal focus:ring-brand-teal"
            />
            <span className="text-sm text-primary">Keep private</span>
            <span className="text-xs text-muted">(only visible to you and admins — still feeds matching)</span>
          </label>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="rounded px-4 py-2 text-sm text-muted hover:text-primary transition">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded bg-brand-teal px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue transition disabled:opacity-50"
            >
              {loading ? 'Posting...' : 'Post Wanted'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditIsoModal({
  iso,
  onClose,
  onUpdated,
  categories,
}: {
  iso: IsoRequestRecord;
  onClose: () => void;
  onUpdated: () => void;
  categories: string[];
}) {
  const [form, setForm] = useState<Record<string, any>>({
    title: iso.title,
    category: iso.category || '',
    type: iso.type || '',
    certification: iso.certification || '',
    thcMin: iso.thcMin ?? '',
    thcMax: iso.thcMax ?? '',
    cbdMin: iso.cbdMin ?? '',
    cbdMax: iso.cbdMax ?? '',
    quantityMin: iso.quantityMin ?? '',
    quantityMax: iso.quantityMax ?? '',
    budgetMax: iso.budgetMax ?? '',
    notes: iso.notes || '',
    expiresAt: iso.expiresAt ? new Date(iso.expiresAt).toISOString().split('T')[0] : '',
    isPrivate: iso.isPrivate ?? false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data: Record<string, any> = {};
      // Only send fields that changed
      if (form.title !== iso.title) data.title = form.title;
      if ((form.category || null) !== (iso.category || null)) data.category = form.category || null;
      if ((form.type || null) !== (iso.type || null)) data.type = form.type || null;
      if ((form.certification || null) !== (iso.certification || null)) data.certification = form.certification || null;

      const numFields = ['thcMin', 'thcMax', 'cbdMin', 'cbdMax', 'quantityMin', 'quantityMax', 'budgetMax'] as const;
      for (const key of numFields) {
        const newVal = form[key] === '' ? null : Number(form[key]);
        const oldVal = iso[key] ?? null;
        if (newVal !== oldVal) data[key] = newVal;
      }

      if ((form.notes || null) !== (iso.notes || null)) data.notes = form.notes || null;
      if (form.isPrivate !== (iso.isPrivate ?? false)) data.isPrivate = form.isPrivate;

      // Handle expiresAt: compare current form vs original
      const origExpDate = iso.expiresAt ? new Date(iso.expiresAt).toISOString().split('T')[0] : '';
      if (form.expiresAt !== origExpDate) {
        if (form.expiresAt) {
          data.expiresAt = new Date(form.expiresAt + 'T23:59:59.999Z').toISOString();
        } else {
          data.expiresAt = null; // Clear expiry
        }
      }

      if (Object.keys(data).length === 0) {
        onClose();
        return;
      }

      await updateIso(iso.id, data);
      onUpdated();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to update request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-lg surface p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-primary">Edit Wanted Request</h2>
          <button onClick={onClose} className="text-muted hover:text-primary transition">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Title <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              maxLength={200}
              value={form.title || ''}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Category</label>
              <select
                value={form.category || ''}
                onChange={(e) => setForm({ ...form, category: e.target.value || undefined })}
                className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
              >
                <option value="">Any</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Type</label>
              <select
                value={form.type || ''}
                onChange={(e) => setForm({ ...form, type: e.target.value || undefined })}
                className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
              >
                <option value="">Any</option>
                <option value="Sativa">Sativa</option>
                <option value="Indica">Indica</option>
                <option value="Hybrid">Hybrid</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">THC Min (%)</label>
              <input
                type="number" step="0.1" min="0" max="100"
                value={form.thcMin ?? ''}
                onChange={(e) => setForm({ ...form, thcMin: e.target.value ? Number(e.target.value) : '' })}
                className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">THC Max (%)</label>
              <input
                type="number" step="0.1" min="0" max="100"
                value={form.thcMax ?? ''}
                onChange={(e) => setForm({ ...form, thcMax: e.target.value ? Number(e.target.value) : '' })}
                className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">CBD Min (%)</label>
              <input
                type="number" step="0.1" min="0" max="100"
                value={form.cbdMin ?? ''}
                onChange={(e) => setForm({ ...form, cbdMin: e.target.value ? Number(e.target.value) : '' })}
                className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">CBD Max (%)</label>
              <input
                type="number" step="0.1" min="0" max="100"
                value={form.cbdMax ?? ''}
                onChange={(e) => setForm({ ...form, cbdMax: e.target.value ? Number(e.target.value) : '' })}
                className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Qty Min (g)</label>
              <input
                type="number" step="1" min="0"
                value={form.quantityMin ?? ''}
                onChange={(e) => setForm({ ...form, quantityMin: e.target.value ? Number(e.target.value) : '' })}
                className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Qty Max (g)</label>
              <input
                type="number" step="1" min="0"
                value={form.quantityMax ?? ''}
                onChange={(e) => setForm({ ...form, quantityMax: e.target.value ? Number(e.target.value) : '' })}
                className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Max Budget ($/g)</label>
              <input
                type="number" step="0.01" min="0"
                value={form.budgetMax ?? ''}
                onChange={(e) => setForm({ ...form, budgetMax: e.target.value ? Number(e.target.value) : '' })}
                className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Certification</label>
              <select
                value={form.certification || ''}
                onChange={(e) => setForm({ ...form, certification: e.target.value || undefined })}
                className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
              >
                <option value="">Any</option>
                {ALL_CERTIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Notes (optional)</label>
            <textarea
              rows={3}
              maxLength={2000}
              value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value || undefined })}
              placeholder="Describe what you're looking for..."
              className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Expiry Date (optional)</label>
            <input
              type="date"
              value={form.expiresAt || ''}
              min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value || '' })}
              className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
            />
            <p className="mt-1 text-xs text-muted">Leave blank for no expiry</p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!form.isPrivate}
              onChange={(e) => setForm({ ...form, isPrivate: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-brand-teal focus:ring-brand-teal"
            />
            <span className="text-sm text-primary">Keep private</span>
            <span className="text-xs text-muted">(only visible to you and admins — still feeds matching)</span>
          </label>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="rounded px-4 py-2 text-sm text-muted hover:text-primary transition">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded bg-brand-teal px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue transition disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RespondModal({
  isoId,
  onClose,
  onResponded,
}: {
  isoId: string;
  onClose: () => void;
  onResponded: () => void;
}) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await respondToIso(isoId, { message: message || undefined });
      onResponded();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to respond');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-lg surface p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-primary mb-4">I Have This</h2>
        <p className="text-sm text-muted mb-4">
          Let the admin team know you have a product matching this request.
          They'll facilitate the introduction.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Message (optional)</label>
            <textarea
              rows={3}
              maxLength={1000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Any details about what you can offer..."
              className="w-full rounded border border-default surface-input px-3 py-2 text-sm text-primary"
            />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="rounded px-4 py-2 text-sm text-muted hover:text-primary transition">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded bg-brand-teal px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue transition disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Submit Response'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function IsoBoard() {
  const { data } = useUserStatus();
  const isSeller = data?.user?.contactType?.includes('Seller') ?? false;
  const isAdmin = data?.user?.isAdmin ?? false;

  const [tab, setTab] = useState<'browse' | 'my'>('browse');
  const [items, setItems] = useState<IsoRequestRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 12, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'public' | 'private'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [editingIso, setEditingIso] = useState<IsoRequestRecord | null>(null);

  const loadData = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      if (tab === 'browse') {
        const res = await fetchIsoBoard({
          page,
          limit: 12,
          category: categoryFilter || undefined,
        });
        setItems(res.items);
        setPagination(res.pagination);
      } else {
        const res = await fetchMyIsos({ page, limit: 12, visibility: visibilityFilter !== 'all' ? visibilityFilter : undefined });
        setItems(res.items);
        setPagination(res.pagination);
      }
    } catch {
      // Silently fail — empty state shown
    } finally {
      setLoading(false);
    }
  }, [tab, categoryFilter, visibilityFilter]);

  useEffect(() => {
    loadData(1);
  }, [loadData]);

  const handleClose = async (id: string) => {
    try {
      await updateIso(id, { status: 'CLOSED' });
      loadData(pagination.page);
    } catch {}
  };

  const handleRenew = async (id: string) => {
    try {
      await updateIso(id, { expiresAt: null });
      loadData(pagination.page);
    } catch {}
  };

  return (
    <Layout>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <svg className="h-7 w-7 text-brand-blue teal:text-brand-coral" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <h1 className="text-2xl font-semibold text-primary">Wanted</h1>
          </div>
          <p className="text-sm text-muted">Post what you need, sellers respond</p>
          <div className="mt-2 h-1 w-12 rounded-full bg-gradient-to-r from-brand-blue to-brand-teal teal:from-brand-yellow teal:to-brand-coral" />
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-brand-teal px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue transition"
        >
          Post Wanted
        </button>
      </div>

      <MarketplaceTabs />

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-lg border card-blue backdrop-blur-sm p-1">
        <button
          onClick={() => setTab('browse')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${tab === 'browse' ? 'bg-brand-teal text-white' : 'text-muted hover:text-primary'}`}
        >
          Browse Wanted
        </button>
        <button
          onClick={() => setTab('my')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${tab === 'my' ? 'bg-brand-teal text-white' : 'text-muted hover:text-primary'}`}
        >
          My Requests
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        {tab === 'browse' && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded border border-default surface-input px-3 py-2 text-sm text-primary"
          >
            <option value="">All Categories</option>
            {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {tab === 'my' && (
          <select
            value={visibilityFilter}
            onChange={(e) => setVisibilityFilter(e.target.value as any)}
            className="rounded border border-default surface-input px-3 py-2 text-sm text-primary"
          >
            <option value="all">All Requests</option>
            <option value="public">Public Only</option>
            <option value="private">Private Only</option>
          </select>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-teal border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-default surface p-12 text-center">
          <p className="text-lg font-semibold text-primary mb-2">
            {tab === 'my' ? 'No wanted requests yet' : 'No open requests'}
          </p>
          <p className="text-sm text-muted mb-4">
            {tab === 'my'
              ? "Post a wanted request to let sellers know what you're looking for."
              : 'Check back later or post your own wanted request.'}
          </p>
          {tab === 'my' && (
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-lg bg-brand-teal px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue transition"
            >
              Post Wanted
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((iso) => (
              <IsoCard
                key={iso.id}
                iso={iso}
                isSeller={isSeller}
                isAdmin={isAdmin}
                onRespond={setRespondingTo}
                onClose={handleClose}
                onRenew={handleRenew}
                onEdit={setEditingIso}
              />
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                onClick={() => loadData(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="rounded px-3 py-1 text-sm text-muted hover:text-primary disabled:opacity-30 transition"
              >
                Previous
              </button>
              <span className="text-sm text-muted">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => loadData(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="rounded px-3 py-1 text-sm text-muted hover:text-primary disabled:opacity-30 transition"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      <CreateIsoModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => loadData(1)}
        categories={ALL_CATEGORIES}
      />

      {editingIso && (
        <EditIsoModal
          iso={editingIso}
          onClose={() => setEditingIso(null)}
          onUpdated={() => loadData(pagination.page)}
          categories={ALL_CATEGORIES}
        />
      )}

      {respondingTo && (
        <RespondModal
          isoId={respondingTo}
          onClose={() => setRespondingTo(null)}
          onResponded={() => loadData(pagination.page)}
        />
      )}
    </Layout>
  );
}
