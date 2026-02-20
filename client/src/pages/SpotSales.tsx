import { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import Layout from '../components/Layout';
import MarketplaceTabs from '../components/MarketplaceTabs';
import SpotSaleCard from '../components/SpotSaleCard';
import { fetchSpotSales, type SpotSaleRecord } from '../lib/api';
import HelpModal from '../components/ContactModal';

export default function SpotSales() {
  const { user } = useAuth();
  const [spotSales, setSpotSales] = useState<SpotSaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactTarget, setContactTarget] = useState<SpotSaleRecord | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

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
    const subject = `Clearance Inquiry: ${contactTarget.product.name}`;
    const body = `${message}\n\n---\nProduct: ${contactTarget.product.name}\nClearance Price: $${contactTarget.spotPrice.toFixed(2)}/g (${Math.round(contactTarget.discountPercent)}% off)\nFrom: ${`${user?.firstName || ''} ${user?.lastName || ''}`.trim()}\nEmail: ${user?.email || ''}`;
    window.location.href = `mailto:team@gciscan.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setContactTarget(null);
  };

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <svg className="h-7 w-7 text-brand-coral" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z" />
            </svg>
            <h1 className="text-2xl font-semibold text-primary">Clearance</h1>
          </div>
          <p className="mt-1 text-sm text-muted">Limited-time deals on select products</p>
          <div className="mt-2 h-1 w-12 rounded-full bg-gradient-to-r from-brand-coral to-brand-yellow teal:from-brand-yellow teal:to-brand-coral" />
        </div>
        <button
          onClick={() => setHelpOpen(true)}
          className="flex cursor-pointer items-center gap-1.5 rounded-full bg-brand-teal/10 px-3 py-1 text-sm font-medium text-brand-teal transition hover:bg-brand-teal/20 dark:bg-brand-yellow/15 dark:text-brand-yellow dark:hover:bg-brand-yellow/25 teal:bg-white/20 teal:text-brand-yellow teal:hover:bg-white/30"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
          </svg>
          Need help?
        </button>
      </div>

      <MarketplaceTabs />

      {/* CTA banner */}
      <div className="mb-6 rounded-lg border border-brand-coral/15 dark:border-slate-700 bg-brand-coral/5 dark:bg-slate-800/50 p-4">
        <div className="flex items-start gap-3">
          <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-coral dark:text-brand-yellow" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
          </svg>
          <p className="text-sm text-muted">
            <span className="font-medium text-primary">Want to feature your product here?</span>{' '}
            Contact us at{' '}
            <a href="mailto:team@gciscan.com?subject=Clearance%20Request" className="font-medium text-brand-coral dark:text-brand-yellow underline hover:no-underline">
              team@gciscan.com
            </a>{' '}
            to list one of your products as a limited-time clearance deal.
          </p>
        </div>
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
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-coral/10 dark:bg-brand-yellow/10 teal:bg-brand-yellow/15">
            <svg className="h-8 w-8 text-brand-coral/50 dark:text-brand-yellow/50 teal:text-brand-yellow" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />
            </svg>
          </div>
          <h3 className="mb-1 text-lg font-medium text-primary">No clearance deals right now</h3>
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

      {/* Clearance Contact Modal */}
      {contactTarget && (
        <SpotSaleContactModal
          productName={contactTarget.product.name}
          spotPrice={contactTarget.spotPrice}
          discountPercent={contactTarget.discountPercent}
          onSend={handleSendContact}
          onClose={() => setContactTarget(null)}
        />
      )}

      {/* Need Help Modal */}
      <HelpModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        userName={`${user?.firstName || ''} ${user?.lastName || ''}`.trim() || ''}
        userEmail={user?.email || ''}
      />
    </Layout>
  );
}

function SpotSaleContactModal({
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
    `Hi, I'm interested in purchasing "${productName}" at the clearance price of $${spotPrice.toFixed(2)}/g (${Math.round(discountPercent)}% off). Please let me know the next steps.`
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
