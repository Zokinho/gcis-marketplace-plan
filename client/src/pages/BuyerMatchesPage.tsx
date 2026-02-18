import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
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
  const [infoDismissed, setInfoDismissed] = useState(() => localStorage.getItem('matches-info-dismissed') === '1');
  const { user } = useAuth();

  function handleDismissInfo() {
    setInfoDismissed(true);
    localStorage.setItem('matches-info-dismissed', '1');
  }

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

      {/* How it works — dismissible */}
      {!infoDismissed && (
        <div className="mb-6 rounded-lg border border-brand-blue/10 dark:border-slate-700 bg-brand-blue/5 dark:bg-slate-800/50 p-4">
          <div className="flex items-start gap-3">
            <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-blue dark:text-brand-yellow" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
            </svg>
            <div className="min-w-0 flex-1 text-sm text-secondary">
              <p className="mb-1 font-medium text-primary">How matching works</p>
              <p className="text-muted">
                Our system analyzes your bidding history, past purchases, shortlisted products, and browsing activity to recommend products you're most likely to be interested in. Each match includes a score — the higher the score, the stronger the fit. Matches improve over time as you interact with the marketplace. Dismiss any match that isn't relevant to help refine future suggestions.
              </p>
            </div>
            <button
              onClick={handleDismissInfo}
              className="flex-shrink-0 rounded-md p-1 text-muted hover:text-primary transition"
              aria-label="Dismiss"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

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
        userName={`${user?.firstName || ''} ${user?.lastName || ''}`.trim() || ''}
        userEmail={user?.email || ''}
      />
    </Layout>
  );
}
