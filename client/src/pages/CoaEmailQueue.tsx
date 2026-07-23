import { useState, useEffect, useMemo } from 'react';
import Layout from '../components/Layout';
import SellerPicker from '../components/SellerPicker';
import TerpeneAutocomplete from '../components/TerpeneAutocomplete';
import { getFieldConfig, type ConditionalField } from '../lib/categoryConfig';
import {
  fetchCoaEmailQueue,
  confirmCoaEmail,
  dismissCoaEmail,
  triggerCoaEmailPoll,
  type CoaEmailQueueItem,
} from '../lib/api';

const CATEGORIES = [
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
const TYPES = ['Sativa', 'Indica', 'Hybrid'];
const CERTIFICATIONS = ['GACP', 'GMP1', 'GMP2', 'GPP', 'IMC-GAP'];

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

  const handleItemDismissed = (id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-primary">Supplies Inbox</h1>
          <p className="text-sm text-muted">Email-ingested documents awaiting seller assignment</p>
          <div className="mt-2 h-1 w-12 rounded-full bg-gradient-to-r from-brand-teal to-brand-blue teal:from-brand-yellow teal:to-brand-coral" />
        </div>
        <button
          onClick={handlePoll}
          disabled={polling}
          className="rounded-lg bg-brand-teal px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-blue disabled:opacity-50"
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
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700">{error}</div>
      )}

      {!loading && queue.length === 0 && (
        <div className="rounded-lg border border-subtle surface p-12 text-center">
          <svg className="mx-auto mb-3 h-10 w-10 text-faint" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9v.906a2.25 2.25 0 0 1-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 0 0 1.183 1.981l6.478 3.488m8.839 2.51-4.66-2.51m0 0-1.023-.55a2.25 2.25 0 0 0-2.134 0l-1.022.55m0 0-4.661 2.51m16.5 1.615a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V8.844a2.25 2.25 0 0 1 1.183-1.981l7.5-4.039a2.25 2.25 0 0 1 2.134 0l7.5 4.039a2.25 2.25 0 0 1 1.183 1.98V19.5Z" />
          </svg>
          <p className="text-sm text-muted">No pending email ingestions</p>
        </div>
      )}

      <div className="space-y-4">
        {queue.map((item) => (
          <QueueCard key={item.id} item={item} onDismissed={() => handleItemDismissed(item.id)} />
        ))}
      </div>
    </Layout>
  );
}

function EditField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'number';
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-faint uppercase tracking-wide mb-0.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-subtle bg-white dark:bg-gray-800 px-2 py-1 text-xs text-primary focus:border-brand-teal focus:outline-none"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select...',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-faint uppercase tracking-wide mb-0.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-subtle bg-white dark:bg-gray-800 px-2 py-1 text-xs text-primary focus:border-brand-teal focus:outline-none"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function QueueCard({ item, onDismissed }: { item: CoaEmailQueueItem; onDismissed: () => void }) {
  const [sellerId, setSellerId] = useState<string | null>(item.suggestedSellerId);
  const [confirming, setConfirming] = useState(false);
  const [addingToAirtable, setAddingToAirtable] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Non-destructive: track sent state locally
  const [localSentToMarketplace, setLocalSentToMarketplace] = useState(item.sentToMarketplace);
  const [localSentToAirtable, setLocalSentToAirtable] = useState(item.sentToAirtable);

  // Inline editing
  const [editing, setEditing] = useState(false);
  const mapped = item.rawData?.mappedFields || {};
  const emailProduct = item.rawData?.rawEmailProduct || {};
  const [editFields, setEditFields] = useState({
    name: mapped.name || emailProduct.product_name || item.coaProductName || '',
    licensedProducer: mapped.licensedProducer || emailProduct.producer || '',
    type: mapped.type || emailProduct.strain_type || '',
    category: mapped.category || '',
    thcMax: mapped.thcMax != null ? String(mapped.thcMax) : (emailProduct.thc_percent != null ? String(emailProduct.thc_percent) : ''),
    cbdMax: mapped.cbdMax != null ? String(mapped.cbdMax) : (emailProduct.cbd_percent != null ? String(emailProduct.cbd_percent) : ''),
    pricePerUnit: mapped.pricePerUnit != null ? String(mapped.pricePerUnit) : '',
    gramsAvailable: mapped.gramsAvailable != null ? String(mapped.gramsAvailable) : '',
    description: mapped.description || '',
    lineage: mapped.lineage || '',
    growthMedium: mapped.growthMedium || '',
    certification: (mapped.certification ? mapped.certification.split(', ').filter(Boolean) : []) as string[],
    dominantTerpene: (mapped.dominantTerpene ? mapped.dominantTerpene.split('; ').filter(Boolean) : []) as string[],
    harvestDate: mapped.harvestDate ? new Date(mapped.harvestDate).toISOString().slice(0, 10) : '',
  });

  // Category-aware field visibility
  const fieldConfig = useMemo(() => getFieldConfig(editFields.category), [editFields.category]);
  const isVisible = (field: ConditionalField) => !fieldConfig || fieldConfig[field] !== 'hidden';

  const updateField = (key: string, value: any) => {
    setEditFields((prev) => ({ ...prev, [key]: value }));
  };

  const buildOverrides = (): Record<string, any> => {
    const overrides: Record<string, any> = {};
    const origName = mapped.name || emailProduct.product_name || item.coaProductName || '';
    if (editFields.name && editFields.name !== origName) overrides.name = editFields.name;
    if (editFields.licensedProducer !== (mapped.licensedProducer || emailProduct.producer || '')) overrides.licensedProducer = editFields.licensedProducer || null;
    if (editFields.type !== (mapped.type || emailProduct.strain_type || '')) overrides.type = editFields.type || null;
    if (editFields.category !== (mapped.category || '')) overrides.category = editFields.category || null;
    if (editFields.description !== (mapped.description || '')) overrides.description = editFields.description || null;

    const origThc = mapped.thcMax != null ? String(mapped.thcMax) : (emailProduct.thc_percent != null ? String(emailProduct.thc_percent) : '');
    if (editFields.thcMax !== origThc) overrides.thcMax = editFields.thcMax ? parseFloat(editFields.thcMax) : null;

    const origCbd = mapped.cbdMax != null ? String(mapped.cbdMax) : (emailProduct.cbd_percent != null ? String(emailProduct.cbd_percent) : '');
    if (editFields.cbdMax !== origCbd) overrides.cbdMax = editFields.cbdMax ? parseFloat(editFields.cbdMax) : null;

    const origPrice = mapped.pricePerUnit != null ? String(mapped.pricePerUnit) : '';
    if (editFields.pricePerUnit !== origPrice) overrides.pricePerUnit = editFields.pricePerUnit ? parseFloat(editFields.pricePerUnit) : null;

    const origQty = mapped.gramsAvailable != null ? String(mapped.gramsAvailable) : '';
    if (editFields.gramsAvailable !== origQty) overrides.gramsAvailable = editFields.gramsAvailable ? parseFloat(editFields.gramsAvailable) : null;

    // New fields
    if (editFields.lineage !== (mapped.lineage || '')) overrides.lineage = editFields.lineage || null;
    if (editFields.growthMedium !== (mapped.growthMedium || '')) overrides.growthMedium = editFields.growthMedium || null;

    const origCert = mapped.certification || '';
    const newCert = editFields.certification.join(', ');
    if (newCert !== origCert) overrides.certification = newCert || null;

    const origTerpene = mapped.dominantTerpene || '';
    const newTerpene = editFields.dominantTerpene.join('; ');
    if (newTerpene !== origTerpene) overrides.dominantTerpene = newTerpene || null;

    const origHarvestDate = mapped.harvestDate ? new Date(mapped.harvestDate).toISOString().slice(0, 10) : '';
    if (editFields.harvestDate !== origHarvestDate) overrides.harvestDate = editFields.harvestDate || null;

    return overrides;
  };

  const busy = confirming || addingToAirtable || dismissing;
  const isEmailExtracted = item.sourceType === 'email_body' || item.rawData?.emailExtracted;

  const handleConfirm = async () => {
    if (!sellerId) return;
    setConfirming(true);
    setError(null);
    try {
      const overrides = buildOverrides();
      await confirmCoaEmail(item.id, sellerId, Object.keys(overrides).length > 0 ? overrides : undefined);
      setLocalSentToMarketplace(true);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to confirm');
    }
    setConfirming(false);
  };

  const handleAirtableOnly = async () => {
    if (!sellerId) return;
    setAddingToAirtable(true);
    setError(null);
    try {
      const overrides = buildOverrides();
      await confirmCoaEmail(item.id, sellerId, Object.keys(overrides).length > 0 ? overrides : undefined, 'airtable');
      setLocalSentToAirtable(true);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to add to Airtable');
    }
    setAddingToAirtable(false);
  };

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      await dismissCoaEmail(item.id);
      onDismissed();
    } catch {
      // ignore
    }
    setDismissing(false);
  };

  const confidenceColor = {
    high: 'bg-brand-sage/20 text-brand-teal',
    medium: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700',
    low: 'bg-red-100 dark:bg-red-900/20 text-red-700',
  }[item.confidence || ''] || 'surface-muted text-secondary';

  return (
    <div className={`rounded-lg border card-blue border-l-4 shadow-md p-5 ${isEmailExtracted ? 'border-l-brand-blue' : 'border-l-brand-teal'}`}>
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-primary">{item.coaProductName || 'Untitled Product'}</h3>
            {isEmailExtracted && (
              <span className="rounded-full bg-brand-blue/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-blue">
                Email
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
            {item.emailSender && <span>From: {item.emailSender}</span>}
            {item.emailSubject && <span>Subject: {item.emailSubject}</span>}
          </div>
          {isEmailExtracted && (
            <p className="mt-1 text-[11px] text-faint">Extracted from email body — no CoA PDF attached</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {localSentToAirtable && (
            <span className="rounded-full bg-brand-blue/15 px-2 py-0.5 text-xs font-medium text-brand-blue">
              Airtable
            </span>
          )}
          {localSentToMarketplace && (
            <span className="rounded-full bg-brand-teal/15 px-2 py-0.5 text-xs font-medium text-brand-teal">
              In Pending
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${confidenceColor}`}>
            {item.confidence ? `${item.confidence} confidence` : 'no match'}
          </span>
          <span className="rounded-full surface-muted text-secondary px-2 py-0.5 text-xs">
            {item.status}
          </span>
        </div>
      </div>

      {item.matchReason && (
        <p className="mb-3 text-xs text-faint">Match: {item.matchReason}</p>
      )}

      {/* Data preview / inline editing */}
      {!editing && (item.rawData?.mappedFields || isEmailExtracted) && (
        <div className="mb-4 rounded-lg surface-muted p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-faint uppercase tracking-wide">Extracted Data</span>
            <button
              onClick={() => setEditing(true)}
              className="text-[11px] font-medium text-brand-blue hover:underline"
            >
              Edit
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
            {editFields.name && (
              <div><span className="text-faint">Name:</span> <span className="font-medium">{editFields.name}</span></div>
            )}
            {editFields.licensedProducer && (
              <div><span className="text-faint">Producer:</span> <span className="font-medium">{editFields.licensedProducer}</span></div>
            )}
            {editFields.type && (
              <div><span className="text-faint">Type:</span> <span className="font-medium">{editFields.type}</span></div>
            )}
            {editFields.category && (
              <div><span className="text-faint">Category:</span> <span className="font-medium">{editFields.category}</span></div>
            )}
            {editFields.thcMax && (
              <div><span className="text-faint">THC:</span> <span className="font-medium">{editFields.thcMax}%</span></div>
            )}
            {editFields.cbdMax && (
              <div><span className="text-faint">CBD:</span> <span className="font-medium">{editFields.cbdMax}%</span></div>
            )}
            {editFields.pricePerUnit && (
              <div><span className="text-faint">Price:</span> <span className="font-medium">${editFields.pricePerUnit}/g</span></div>
            )}
            {editFields.gramsAvailable && (
              <div><span className="text-faint">Qty:</span> <span className="font-medium">{editFields.gramsAvailable}g</span></div>
            )}
            {editFields.lineage && (
              <div><span className="text-faint">Lineage:</span> <span className="font-medium">{editFields.lineage}</span></div>
            )}
            {editFields.certification.length > 0 && (
              <div><span className="text-faint">Certifications:</span> <span className="font-medium">{editFields.certification.join(', ')}</span></div>
            )}
            {editFields.dominantTerpene.length > 0 && (
              <div><span className="text-faint">Terpenes:</span> <span className="font-medium">{editFields.dominantTerpene.join(', ')}</span></div>
            )}
            {editFields.harvestDate && (
              <div><span className="text-faint">Harvest Date:</span> <span className="font-medium">{editFields.harvestDate}</span></div>
            )}
            {editFields.growthMedium && (
              <div><span className="text-faint">Growth Medium:</span> <span className="font-medium">{editFields.growthMedium}</span></div>
            )}
          </div>
        </div>
      )}

      {editing && (
        <div className="mb-4 rounded-lg border border-brand-blue/30 bg-brand-blue/5 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-brand-blue uppercase tracking-wide">Editing</span>
            <button
              onClick={() => setEditing(false)}
              className="text-[11px] font-medium text-faint hover:underline"
            >
              Done
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <EditField label="Product Name" value={editFields.name} onChange={(v) => updateField('name', v)} />
            <EditField label="Producer" value={editFields.licensedProducer} onChange={(v) => updateField('licensedProducer', v)} />
            <SelectField label="Category" value={editFields.category} onChange={(v) => updateField('category', v)} options={CATEGORIES} placeholder="Select category..." />
            {isVisible('type') && (
              <SelectField label="Type" value={editFields.type} onChange={(v) => updateField('type', v)} options={TYPES} />
            )}
            <EditField label="THC %" value={editFields.thcMax} onChange={(v) => updateField('thcMax', v)} type="number" />
            <EditField label="CBD %" value={editFields.cbdMax} onChange={(v) => updateField('cbdMax', v)} type="number" />
            <EditField label="Price/g" value={editFields.pricePerUnit} onChange={(v) => updateField('pricePerUnit', v)} type="number" />
            <EditField label="Quantity (g)" value={editFields.gramsAvailable} onChange={(v) => updateField('gramsAvailable', v)} type="number" />
            {isVisible('lineage') && (
              <EditField label="Lineage" value={editFields.lineage} onChange={(v) => updateField('lineage', v)} />
            )}
            {isVisible('growthMedium') && (
              <EditField label="Growth Medium" value={editFields.growthMedium} onChange={(v) => updateField('growthMedium', v)} />
            )}
            {isVisible('harvestDate') && (
              <div>
                <label className="block text-[10px] font-medium text-faint uppercase tracking-wide mb-0.5">Harvest Date</label>
                <input
                  type="date"
                  value={editFields.harvestDate}
                  onChange={(e) => updateField('harvestDate', e.target.value)}
                  className="w-full rounded border border-subtle bg-white dark:bg-gray-800 px-2 py-1 text-xs text-primary focus:border-brand-teal focus:outline-none"
                />
              </div>
            )}

            {/* Certifications — full row */}
            <div className="col-span-2 sm:col-span-3">
              <label className="block text-[10px] font-medium text-faint uppercase tracking-wide mb-1">Certifications</label>
              <div className="flex flex-wrap gap-1.5">
                {CERTIFICATIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      const next = editFields.certification.includes(c)
                        ? editFields.certification.filter((x) => x !== c)
                        : [...editFields.certification, c];
                      updateField('certification', next);
                    }}
                    className={`rounded-lg border px-2 py-0.5 text-[11px] font-medium transition ${
                      editFields.certification.includes(c)
                        ? 'border-brand-teal bg-brand-sage/20 text-brand-teal dark:bg-brand-sage/15 dark:text-brand-sage dark:border-brand-sage/40'
                        : 'border-subtle text-secondary hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Terpenes — full row */}
            {isVisible('terpenes') && (
              <div className="col-span-2 sm:col-span-3">
                <TerpeneAutocomplete
                  selected={editFields.dominantTerpene}
                  onChange={(next) => updateField('dominantTerpene', next)}
                />
              </div>
            )}

            <div className="col-span-2 sm:col-span-3">
              <EditField label="Description" value={editFields.description} onChange={(v) => updateField('description', v)} />
            </div>
          </div>
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
          disabled={!sellerId || busy || localSentToMarketplace}
          className="rounded-lg bg-brand-teal px-4 py-2 text-sm font-medium text-white hover:bg-brand-teal/90 disabled:opacity-50"
        >
          {confirming ? 'Creating...' : localSentToMarketplace ? 'Sent to Pending' : 'Approve & Send to Pending'}
        </button>
        <button
          onClick={handleAirtableOnly}
          disabled={!sellerId || busy || localSentToAirtable}
          className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-blue/90 disabled:opacity-50"
        >
          {addingToAirtable ? 'Adding...' : localSentToAirtable ? 'Sent to Airtable' : 'Add to Airtable Only'}
        </button>
        <button
          onClick={handleDismiss}
          disabled={busy}
          className="rounded-lg border border-subtle px-4 py-2 text-sm text-secondary hover-surface-muted disabled:opacity-50"
        >
          {dismissing ? 'Dismissing...' : 'Dismiss'}
        </button>
      </div>
    </div>
  );
}
