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
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-brand-dark">Recommended For You</h2>
        <p className="mt-1 text-sm text-gray-500">
          Products matched to your purchase history and preferences
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-blue border-t-transparent" />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-medium text-red-700">{error}</p>
          <button onClick={load} className="mt-3 text-sm font-medium text-red-600 underline">Try again</button>
        </div>
      )}

      {!loading && !error && matches.length === 0 && (
        <div className="rounded-xl border bg-white p-12 text-center">
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
