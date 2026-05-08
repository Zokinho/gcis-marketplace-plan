import { useState, useEffect } from 'react';
import { useTour } from '../lib/TourContext';

const STORAGE_KEY = 'harvex-tours-dismissed-welcome';

export default function TourWelcomeModal() {
  const { hasCompletedAnyTour, startTour } = useTour();
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Show only if no tours completed and not previously dismissed
    const dismissed = localStorage.getItem(STORAGE_KEY) === '1';
    if (!dismissed && !hasCompletedAnyTour()) {
      // Delay slightly to let the page finish rendering
      const timer = setTimeout(() => setShow(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [hasCompletedAnyTour]);

  if (!show) return null;

  function handleStart() {
    setShow(false);
    localStorage.setItem(STORAGE_KEY, '1');
    startTour('marketplace-browsing');
  }

  function handleDismiss() {
    setShow(false);
    localStorage.setItem(STORAGE_KEY, '1');
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[9999] bg-black/40" onClick={handleDismiss} />

      {/* Modal */}
      <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl surface border border-default shadow-2xl">
          {/* Icon + heading */}
          <div className="flex flex-col items-center px-6 pt-8 pb-4 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-teal/10 dark:bg-brand-yellow/15">
              <svg className="h-8 w-8 text-brand-teal dark:text-brand-yellow" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
              </svg>
            </div>
            <h2 className="mb-2 text-xl font-bold text-primary">Welcome to Harvex!</h2>
            <p className="text-sm text-muted leading-relaxed">
              Take a quick interactive tour to learn how to browse products, place bids, and get the most out of the marketplace.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 px-6 pb-6">
            <button
              onClick={handleStart}
              className="w-full rounded-lg bg-brand-teal py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-blue"
            >
              Start Tour
            </button>
            <button
              onClick={handleDismiss}
              className="w-full rounded-lg py-2.5 text-sm font-medium text-muted transition hover:text-primary"
            >
              Maybe Later
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
