import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';
import Layout from '../components/Layout';
import MatchCard from '../components/MatchCard';
import ContactModal from '../components/ContactModal';
import { fetchBuyerMatches, dismissMatch, type MatchRecord } from '../lib/api';

export default function BuyerMatchesPage() {
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const { user } = useUser();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBuyerMatches({ limit: 50 });
      setMatches(data.matches);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load matches');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDismiss(matchId: string) {
    setDismissingId(matchId);
    try {
      await dismissMatch(matchId);
      setMatches((prev) => prev.filter((m) => m.id !== matchId));
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to dismiss');
    } finally {
      setDismissingId(null);
    }
  }

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-primary">Recommended For You</h2>
          <p className="text-sm text-muted">
            Products matched to your purchase history and preferences
          </p>
          <div className="mt-2 h-1 w-12 rounded-full bg-gradient-to-r from-brand-teal to-brand-blue" />
        </div>
        <button
          onClick={() => setContactOpen(true)}
          className="flex cursor-pointer items-center gap-1.5 rounded-full bg-brand-teal/10 px-3 py-1 text-sm font-medium text-brand-teal transition hover:bg-brand-teal/20 dark:bg-brand-yellow/15 dark:text-brand-yellow dark:hover:bg-brand-yellow/25"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
          </svg>
          Need help?
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-blue border-t-transparent" />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-center">
          <p className="font-medium text-red-700 dark:text-red-400">{error}</p>
          <button onClick={load} className="mt-3 text-sm font-medium text-red-600 dark:text-red-400 underline">Try again</button>
        </div>
      )}

      {!loading && !error && matches.length === 0 && (
        <div className="rounded-lg border border-brand-gray dark:border-slate-700 surface p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-coral/10 dark:bg-brand-yellow/10">
            <svg className="h-8 w-8 text-brand-coral/50 dark:text-brand-yellow/50" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-secondary">No recommendations yet</h3>
          <p className="text-sm text-muted">
            We'll suggest products based on your purchase history. Check back soon!
          </p>
        </div>
      )}

      {!loading && !error && matches.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              onDismiss={handleDismiss}
              dismissing={dismissingId === match.id}
            />
          ))}
        </div>
      )}
      <ContactModal
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        userName={user?.fullName || user?.firstName || ''}
        userEmail={user?.primaryEmailAddress?.emailAddress || ''}
      />
    </Layout>
  );
}
