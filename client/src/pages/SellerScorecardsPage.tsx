import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import SellerScoreCard from '../components/SellerScoreCard';
import { fetchSellerScores, recalculateSellerScores, type SellerScoreRecord } from '../lib/api';

export default function SellerScorecardsPage() {
  const [scores, setScores] = useState<SellerScoreRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSellerScores();
      setScores(data.scores);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleRecalculate() {
    setRecalculating(true);
    try {
      await recalculateSellerScores();
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to recalculate');
    } finally {
      setRecalculating(false);
    }
  }

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-brand-dark">Seller Scorecards</h2>
        <button
          onClick={handleRecalculate}
          disabled={recalculating}
          className="rounded-lg bg-brand-blue px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-teal disabled:opacity-50"
        >
          {recalculating ? 'Recalculating...' : 'Recalculate All'}
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-blue border-t-transparent" />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-medium text-red-700">{error}</p>
        </div>
      )}

      {!loading && !error && scores.length === 0 && (
        <div className="rounded-xl border bg-white p-12 text-center">
          <h3 className="mb-2 text-lg font-semibold text-gray-700">No seller scores yet</h3>
          <p className="text-sm text-gray-500">Seller scores are calculated from completed transactions with recorded outcomes.</p>
        </div>
      )}

      {!loading && !error && scores.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {scores.map((score) => (
            <div key={score.id}>
              <p className="mb-2 text-sm font-semibold text-gray-700">
                {score.seller?.companyName || score.seller?.email || 'Unknown'}
              </p>
              <SellerScoreCard
                fillRate={score.fillRate}
                qualityScore={score.qualityScore}
                deliveryScore={score.deliveryScore}
                pricingScore={score.pricingScore}
                overallScore={score.overallScore}
                transactionsScored={score.transactionsScored}
              />
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
