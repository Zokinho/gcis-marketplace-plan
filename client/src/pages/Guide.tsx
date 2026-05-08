import Layout from '../components/Layout';
import { useUserStatus } from '../lib/useUserStatus';
import { useTour } from '../lib/TourContext';
import { getBuyerTours, getSellerTours } from '../lib/tourDefinitions';

function TourCard({
  title,
  description,
  icon,
  stepCount,
  completed,
  onStart,
}: {
  title: string;
  description: string;
  icon: string;
  stepCount: number;
  completed: boolean;
  onStart: () => void;
}) {
  return (
    <div className="rounded-lg border card-blue shadow-md p-5 flex flex-col gap-3 transition hover:shadow-lg backdrop-blur-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-teal/10 dark:bg-brand-yellow/15">
          <svg className="h-5 w-5 text-brand-teal dark:text-brand-yellow" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </div>
        {completed && (
          <span className="flex items-center gap-1 rounded-full bg-brand-sage/20 px-2 py-0.5 text-xs font-medium text-brand-teal dark:text-brand-sage">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            Done
          </span>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-primary">{title}</h3>
        <p className="mt-1 text-xs text-muted leading-relaxed">{description}</p>
      </div>
      <div className="mt-auto flex items-center justify-between">
        <span className="text-xs text-faint">{stepCount} steps</span>
        <button
          onClick={onStart}
          className="rounded-lg bg-brand-teal px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-blue"
        >
          {completed ? 'Restart' : 'Start Tour'}
        </button>
      </div>
    </div>
  );
}

export default function Guide() {
  const { data } = useUserStatus();
  const { startTour, hasCompletedTour, resetAllTours } = useTour();
  const isSeller = data?.user?.contactType?.includes('Seller') ?? false;

  const buyerTours = getBuyerTours();
  const sellerTours = getSellerTours();
  const allTours = [...buyerTours, ...(isSeller ? sellerTours : [])];
  const completedCount = allTours.filter((t) => hasCompletedTour(t.id)).length;

  return (
    <Layout>
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-primary">
            <svg className="h-6 w-6 text-brand-teal dark:text-brand-yellow" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
            </svg>
            Platform Guide
          </h1>
          <p className="mt-1 text-sm text-muted">
            Take interactive tours to learn the platform. Each tour walks you through real pages and features.
          </p>
          <div className="mt-2 h-1 w-12 rounded-full bg-gradient-to-r from-brand-yellow to-brand-teal teal:from-brand-yellow teal:to-brand-coral" />
        </div>

        {/* Progress summary */}
        {completedCount > 0 && (
          <div className="mb-6 flex items-center justify-between rounded-lg border border-brand-sage/30 bg-brand-sage/10 dark:bg-brand-sage/5 px-4 py-3">
            <span className="text-sm text-secondary">
              <span className="font-semibold text-brand-teal dark:text-brand-sage">{completedCount}</span> of{' '}
              {allTours.length} tours completed
            </span>
            <button
              onClick={resetAllTours}
              className="text-xs font-medium text-muted hover:text-primary transition"
            >
              Reset all
            </button>
          </div>
        )}

        {/* Buyer tours */}
        <div className="mb-8">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-muted">Buyer Workflows</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {buyerTours.map((tour) => (
              <TourCard
                key={tour.id}
                title={tour.title}
                description={tour.description}
                icon={tour.icon}
                stepCount={tour.stepCount}
                completed={hasCompletedTour(tour.id)}
                onStart={() => startTour(tour.id)}
              />
            ))}
          </div>
        </div>

        {/* Seller tours */}
        {isSeller && (
          <div>
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-muted">Seller Workflows</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sellerTours.map((tour) => (
                <TourCard
                  key={tour.id}
                  title={tour.title}
                  description={tour.description}
                  icon={tour.icon}
                  stepCount={tour.stepCount}
                  completed={hasCompletedTour(tour.id)}
                  onStart={() => startTour(tour.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
