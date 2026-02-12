import { useState, useCallback } from 'react';
import ProximityIndicator from './ProximityIndicator';
import { submitBid } from '../lib/api';

interface BidFormProps {
  productId: string;
  productName: string;
  sellerPrice: number | null;
  minQty: number | null;
}

export default function BidForm({ productId, productName, sellerPrice, minQty }: BidFormProps) {
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const price = parseFloat(pricePerUnit) || 0;
  const qty = parseFloat(quantity) || 0;
  const totalValue = price * qty;

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (price <= 0 || qty <= 0) return;

    setSubmitting(true);
    setError(null);
    try {
      await submitBid({
        productId,
        pricePerUnit: price,
        quantity: qty,
        notes: notes || undefined,
      });
      setSuccess(true);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to submit bid');
    } finally {
      setSubmitting(false);
    }
  }, [productId, price, qty, notes]);

  if (success) {
    return (
      <div className="rounded-lg border border-brand-sage/40 bg-brand-sage/10 p-6 text-center">
        <svg className="mx-auto mb-3 h-10 w-10 text-brand-teal" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        <h3 className="mb-1 text-lg font-semibold text-brand-teal">Bid Submitted!</h3>
        <p className="text-sm text-brand-teal">
          Your bid on {productName} has been submitted. Our team will review it shortly.
        </p>
        <button
          onClick={() => { setSuccess(false); setPricePerUnit(''); setQuantity(''); setNotes(''); }}
          className="mt-4 text-sm font-medium text-brand-teal underline hover:text-brand-teal/80"
        >
          Place another bid
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="overflow-hidden rounded-lg border border-default surface">
      <div className="bg-brand-blue dark:bg-gradient-to-r dark:from-brand-teal dark:to-brand-blue px-5 py-3">
        <h3 className="text-lg font-semibold text-white">Place a Bid</h3>
      </div>
      <div className="p-5">

      <div className="mb-4 space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Price per gram ($)</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={pricePerUnit}
            onChange={(e) => setPricePerUnit(e.target.value)}
            placeholder="0.00"
            required
            className="w-full rounded-lg input-field"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">
            Quantity (grams)
            {minQty != null && <span className="ml-1 font-normal text-faint">Min: {minQty.toLocaleString()}g</span>}
          </label>
          <input
            type="number"
            step="1"
            min={minQty || 1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder={minQty ? `Min ${minQty}` : '0'}
            required
            className="w-full rounded-lg input-field"
          />
        </div>

        {totalValue > 0 && (
          <p className="text-sm text-secondary">
            Total: <span className="font-semibold text-primary">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </p>
        )}

        {/* Live proximity score */}
        <ProximityIndicator bidPrice={price} sellerPrice={sellerPrice} />

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Any additional comments..."
            className="w-full rounded-lg input-field"
          />
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={price <= 0 || qty <= 0 || submitting}
        className="w-full rounded-lg bg-brand-blue dark:bg-gradient-to-r dark:from-brand-teal dark:to-brand-blue py-2.5 text-sm font-semibold text-white shadow-sm transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? 'Submitting...' : 'Submit Bid'}
      </button>
      </div>
    </form>
  );
}
