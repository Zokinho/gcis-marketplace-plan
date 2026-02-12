import { useState } from 'react';
import { recordOutcome } from '../lib/api';

interface Props {
  bidId: string;
  orderedQuantity: number;
  onComplete: () => void;
}

export default function OutcomeForm({ bidId, orderedQuantity, onComplete }: Props) {
  const [actualQty, setActualQty] = useState(String(orderedQuantity));
  const [onTime, setOnTime] = useState<boolean | null>(null);
  const [quality, setQuality] = useState<boolean | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await recordOutcome(bidId, {
        actualQuantityDelivered: parseFloat(actualQty) || undefined,
        deliveryOnTime: onTime ?? undefined,
        qualityAsExpected: quality ?? undefined,
        outcomeNotes: notes || undefined,
      });
      onComplete();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to record outcome');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-subtle surface-muted p-4">
      <h4 className="text-sm font-semibold text-primary">Record Delivery Outcome</h4>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Actual Qty Delivered (g)</label>
        <input
          type="number"
          step="1"
          min="0"
          value={actualQty}
          onChange={(e) => setActualQty(e.target.value)}
          className="w-full rounded-lg border border-default px-3 py-1.5 text-sm surface text-primary focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
        />
      </div>

      <div className="flex gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Delivered On Time?</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setOnTime(true)}
              className={`rounded-lg px-3 py-1 text-xs font-medium ${onTime === true ? 'bg-brand-blue text-white' : 'border border-default text-primary'}`}>
              Yes
            </button>
            <button type="button" onClick={() => setOnTime(false)}
              className={`rounded-lg px-3 py-1 text-xs font-medium ${onTime === false ? 'bg-brand-coral text-white' : 'border border-default text-primary'}`}>
              No
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Quality As Expected?</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setQuality(true)}
              className={`rounded-lg px-3 py-1 text-xs font-medium ${quality === true ? 'bg-brand-blue text-white' : 'border border-default text-primary'}`}>
              Yes
            </button>
            <button type="button" onClick={() => setQuality(false)}
              className={`rounded-lg px-3 py-1 text-xs font-medium ${quality === false ? 'bg-brand-coral text-white' : 'border border-default text-primary'}`}>
              No
            </button>
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-default px-3 py-1.5 text-sm surface text-primary focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
        />
      </div>

      {error && <p className="text-xs text-brand-coral">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-brand-blue px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-teal disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Record Outcome'}
      </button>
    </form>
  );
}
