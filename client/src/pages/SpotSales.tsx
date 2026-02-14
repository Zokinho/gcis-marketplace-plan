import { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import Layout from '../components/Layout';
import SpotSaleCard from '../components/SpotSaleCard';
import { fetchSpotSales, type SpotSaleRecord } from '../lib/api';

export default function SpotSales() {
  const { user } = useUser();
  const [spotSales, setSpotSales] = useState<SpotSaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactTarget, setContactTarget] = useState<SpotSaleRecord | null>(null);

  useEffect(() => {
    fetchSpotSales()
      .then((res) => setSpotSales(res.spotSales))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleContact = (spotSale: SpotSaleRecord) => {
    setContactTarget(spotSale);
  };

  const handleSendContact = (message: string) => {
    if (!contactTarget) return;
    const subject = `Spot Sale Inquiry: ${contactTarget.product.name}`;
    const body = `${message}\n\n---\nProduct: ${contactTarget.product.name}\nSpot Price: $${contactTarget.spotPrice.toFixed(2)}/g (${Math.round(contactTarget.discountPercent)}% off)\nFrom: ${user?.fullName || ''}\nEmail: ${user?.primaryEmailAddress?.emailAddress || ''}`;
    window.location.href = `mailto:team@gciscan.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setContactTarget(null);
  };

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <svg className="h-7 w-7 text-brand-coral" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z" />
          </svg>
          <h1 className="text-2xl font-semibold text-primary">Spot Sales</h1>
        </div>
        <p className="mt-1 text-sm text-muted">Limited-time deals on select products</p>
        <div className="mt-2 h-1 w-12 rounded-full bg-gradient-to-r from-brand-coral to-brand-yellow" />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-teal border-t-transparent" />
        </div>
      )}

      {/* Empty state */}
      {!loading && spotSales.length === 0 && (
        <div className="rounded-lg border border-subtle surface p-16 text-center">
          <svg className="mx-auto mb-4 h-12 w-12 text-brand-gray/50 dark:text-slate-600" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />
          </svg>
          <h3 className="mb-1 text-lg font-medium text-primary">No spot sales right now</h3>
          <p className="text-sm text-muted">Check back soon for limited-time deals on select products.</p>
        </div>
      )}

      {/* Grid */}
      {!loading && spotSales.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {spotSales.map((ss) => (
            <SpotSaleCard key={ss.id} spotSale={ss} onContact={handleContact} />
          ))}
        </div>
      )}

      {/* Contact Modal */}
      {contactTarget && (
        <ContactModal
          productName={contactTarget.product.name}
          spotPrice={contactTarget.spotPrice}
          discountPercent={contactTarget.discountPercent}
          onSend={handleSendContact}
          onClose={() => setContactTarget(null)}
        />
      )}
    </Layout>
  );
}

function ContactModal({
  productName,
  spotPrice,
  discountPercent,
  onSend,
  onClose,
}: {
  productName: string;
  spotPrice: number;
  discountPercent: number;
  onSend: (message: string) => void;
  onClose: () => void;
}) {
  const [message, setMessage] = useState(
    `Hi, I'm interested in purchasing "${productName}" at the spot sale price of $${spotPrice.toFixed(2)}/g (${Math.round(discountPercent)}% off). Please let me know the next steps.`
  );

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-default px-5 py-4">
            <h2 className="text-lg font-semibold text-primary">Contact to Buy</h2>
            <button onClick={onClose} className="rounded-lg p-1 text-muted hover:text-secondary transition">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="px-5 py-4">
            <div className="mb-4 rounded-lg surface-muted p-3">
              <p className="text-sm font-medium text-primary">{productName}</p>
              <p className="mt-0.5 text-xs text-brand-teal dark:text-brand-sage">
                ${spotPrice.toFixed(2)}/g — {Math.round(discountPercent)}% off
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-secondary">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-subtle surface px-3 py-2 text-sm text-primary outline-none focus:border-brand-teal resize-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-default px-5 py-3">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-secondary transition hover-surface-muted"
            >
              Cancel
            </button>
            <button
              onClick={() => onSend(message)}
              disabled={!message.trim()}
              className="rounded-lg bg-brand-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-blue disabled:opacity-40"
            >
              Open Email
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
