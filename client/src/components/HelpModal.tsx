import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useUserStatus } from '../lib/useUserStatus';
import { useTour } from '../lib/TourContext';
import { getBuyerTours, getSellerTours } from '../lib/tourDefinitions';

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

export default function HelpModal({ open, onClose }: HelpModalProps) {
  const { user } = useAuth();
  const { data } = useUserStatus();
  const { startTour, hasCompletedTour } = useTour();
  const isSeller = data?.user?.contactType?.includes('Seller') ?? false;

  const [tab, setTab] = useState<'tours' | 'contact'>('tours');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  if (!open) return null;

  const buyerTours = getBuyerTours();
  const sellerTours = getSellerTours();
  const userName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || '';
  const userEmail = user?.email || '';

  function handleStartTour(tourId: string) {
    onClose();
    // Small delay so modal closes before tour starts
    setTimeout(() => startTour(tourId), 150);
  }

  function handleSend() {
    const mailto = `mailto:team@gciscan.com?subject=${encodeURIComponent(subject || 'Harvex Platform Inquiry')}&body=${encodeURIComponent(
      `${message}\n\n---\nFrom: ${userName}\nEmail: ${userEmail}`
    )}`;
    window.location.href = mailto;
    setSent(true);
    setTimeout(() => {
      setSent(false);
      setSubject('');
      setMessage('');
      onClose();
    }, 2000);
  }

  function handleClose() {
    setSent(false);
    setSubject('');
    setMessage('');
    setTab('tours');
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[10001] bg-black/40" onClick={handleClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
        <div
          className="w-full max-w-lg rounded-xl surface shadow-2xl max-h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-default px-5 py-4 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-teal/10 dark:bg-brand-yellow/15">
                <svg className="h-4 w-4 text-brand-teal dark:text-brand-yellow" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-primary">Need Help?</h2>
            </div>
            <button onClick={handleClose} className="rounded-lg p-1 text-muted hover:text-secondary transition">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-default px-5 flex-shrink-0">
            <button
              onClick={() => setTab('tours')}
              className={`relative px-4 py-2.5 text-sm font-medium transition ${
                tab === 'tours'
                  ? 'text-brand-teal dark:text-brand-yellow'
                  : 'text-muted hover:text-secondary'
              }`}
            >
              Guided Tours
              {tab === 'tours' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-teal dark:bg-brand-yellow rounded-full" />
              )}
            </button>
            <button
              onClick={() => setTab('contact')}
              className={`relative px-4 py-2.5 text-sm font-medium transition ${
                tab === 'contact'
                  ? 'text-brand-teal dark:text-brand-yellow'
                  : 'text-muted hover:text-secondary'
              }`}
            >
              Contact Us
              {tab === 'contact' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-teal dark:bg-brand-yellow rounded-full" />
              )}
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {tab === 'tours' && (
              <div className="px-5 py-4">
                <p className="mb-4 text-sm text-muted">
                  Take interactive tours that walk you through real pages and features.
                </p>

                {/* Buyer tours */}
                <div className="mb-4">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                    Buyer Workflows
                  </h3>
                  <div className="space-y-2">
                    {buyerTours.map((tour) => (
                      <TourRow
                        key={tour.id}
                        icon={tour.icon}
                        title={tour.title}
                        stepCount={tour.stepCount}
                        completed={hasCompletedTour(tour.id)}
                        onStart={() => handleStartTour(tour.id)}
                      />
                    ))}
                  </div>
                </div>

                {/* Seller tours */}
                {isSeller && (
                  <div>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                      Seller Workflows
                    </h3>
                    <div className="space-y-2">
                      {sellerTours.map((tour) => (
                        <TourRow
                          key={tour.id}
                          icon={tour.icon}
                          title={tour.title}
                          stepCount={tour.stepCount}
                          completed={hasCompletedTour(tour.id)}
                          onStart={() => handleStartTour(tour.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'contact' && (
              <div className="px-5 py-4">
                {sent ? (
                  <div className="py-8 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                      <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    </div>
                    <p className="font-medium text-primary">Your email client should open now.</p>
                    <p className="mt-1 text-sm text-muted">Send the message from there and we'll get back to you shortly.</p>
                  </div>
                ) : (
                  <>
                    <p className="mb-4 text-sm text-muted">
                      Questions, suggestions, or need assistance? Fill out the form below and we'll get back to you.
                    </p>
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-secondary">Your Name</label>
                        <input type="text" value={userName} disabled className="input-field opacity-60" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-secondary">Your Email</label>
                        <input type="email" value={userEmail} disabled className="input-field opacity-60" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-secondary">Subject</label>
                        <input
                          type="text"
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          placeholder="What's this about?"
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-secondary">Message</label>
                        <textarea
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          placeholder="How can we help you?"
                          rows={4}
                          className="input-field resize-none"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer — only for contact tab when not sent */}
          {tab === 'contact' && !sent && (
            <div className="flex items-center justify-end gap-3 border-t border-default px-5 py-3 flex-shrink-0">
              <button
                onClick={handleClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-secondary transition hover-surface-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!message.trim()}
                className="rounded-lg bg-brand-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-blue disabled:opacity-40"
              >
                Send
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function TourRow({
  icon,
  title,
  stepCount,
  completed,
  onStart,
}: {
  icon: string;
  title: string;
  stepCount: number;
  completed: boolean;
  onStart: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-subtle px-3 py-2.5 transition hover:border-default hover:shadow-sm">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-teal/10 dark:bg-brand-yellow/15">
        <svg className="h-4 w-4 text-brand-teal dark:text-brand-yellow" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-primary">{title}</span>
          {completed && (
            <svg className="h-3.5 w-3.5 text-brand-sage" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          )}
        </div>
        <span className="text-xs text-faint">{stepCount} steps</span>
      </div>
      <button
        onClick={onStart}
        className="flex-shrink-0 rounded-lg bg-brand-teal px-3 py-1 text-xs font-semibold text-white transition hover:bg-brand-blue"
      >
        {completed ? 'Restart' : 'Start'}
      </button>
    </div>
  );
}
