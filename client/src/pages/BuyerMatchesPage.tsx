import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import MatchCard from '../components/MatchCard';
import { fetchBuyerMatches, dismissMatch, type MatchRecord } from '../lib/api';

export default function BuyerMatchesPage() {
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

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
      <div className="mb-6 rounded-lg bg-gradient-to-r from-brand-teal to-brand-blue px-6 py-5 text-white">
        <h2 className="text-2xl font-semibold">Recommended For You</h2>
        <p className="mt-0.5 text-sm text-white/70">
          Products matched to your purchase history and preferences
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-blue border-t-transparent" />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-medium text-red-700">{error}</p>
          <button onClick={load} className="mt-3 text-sm font-medium text-red-600 underline">Try again</button>
        </div>
      )}

      {!loading && !error && matches.length === 0 && (
        <div className="rounded-lg border border-brand-gray bg-white p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-sage/10">
            <svg className="h-8 w-8 text-brand-teal/50" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-gray-700">No recommendations yet</h3>
          <p className="text-sm text-gray-500">
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
    </Layout>
  );
}
