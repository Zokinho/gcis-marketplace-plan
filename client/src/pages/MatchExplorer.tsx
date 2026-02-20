import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import ScoreBreakdown from '../components/ScoreBreakdown';
import { fetchMatches, type MatchRecord, type Pagination } from '../lib/api';

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-brand-blue';
  if (score >= 60) return 'text-yellow-600';
  if (score >= 40) return 'text-orange-600';
  return 'text-red-600';
}

export default function MatchExplorer() {
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [minScore, setMinScore] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMatches({ page, limit: 20, minScore: minScore || undefined, status: statusFilter || undefined });
      setMatches(data.matches);
      setPagination(data.pagination);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load matches');
    } finally {
      setLoading(false);
    }
  }, [minScore, statusFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <Layout>
      <div className="mb-6 flex flex-col gap-4 rounded-lg bg-gradient-to-r from-brand-blue to-brand-teal px-6 py-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Match Explorer</h2>
          <p className="mt-0.5 text-sm text-white/70">Browse and manage product-buyer matches &middot; {pagination.total} found</p>
        </div>
        <div className="flex gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg bg-white/20 px-3 py-1.5 text-sm text-white [&>option]:text-primary"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="viewed">Viewed</option>
            <option value="converted">Converted</option>
            <option value="rejected">Rejected</option>
          </select>
          <select
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="rounded-lg bg-white/20 px-3 py-1.5 text-sm text-white [&>option]:text-primary"
          >
            <option value={0}>Any Score</option>
            <option value={50}>50+</option>
            <option value={70}>70+</option>
            <option value={80}>80+</option>
            <option value={90}>90+</option>
          </select>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-blue border-t-transparent" />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-center">
          <p className="font-medium text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {!loading && !error && matches.length === 0 && (
        <div className="rounded-lg border surface p-12 text-center">
          <h3 className="mb-2 text-lg font-semibold text-secondary">No matches found</h3>
          <p className="text-sm text-muted">Generate matches from the Intelligence Dashboard.</p>
          <Link to="/intelligence" className="mt-3 inline-block text-sm font-medium text-brand-blue underline">Go to Dashboard</Link>
        </div>
      )}

      {!loading && !error && matches.length > 0 && (
        <>
          <div className="space-y-3">
            {matches.map((match) => (
              <div key={match.id} className="rounded-lg border card-blue shadow-md transition hover:shadow-lg">
                <div
                  className="flex cursor-pointer items-center justify-between p-4"
                  onClick={() => setExpandedId(expandedId === match.id ? null : match.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-xl font-bold ${getScoreColor(match.score)}`}>{Math.round(match.score)}</span>
                      <Link to={`/marketplace/${match.product.id}`} className="font-semibold text-primary hover:text-brand-blue" onClick={(e) => e.stopPropagation()}>
                        {match.product.name}
                      </Link>
                      <span className="text-xs text-faint">
                        {match.buyer?.companyName || match.buyer?.email}
                      </span>
                    </div>
                    {match.insights && match.insights.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(match.insights as Array<{ type: string; text: string }>).slice(0, 3).map((insight, i) => (
                          <span key={i} className="rounded-full surface-muted px-2 py-0.5 text-xs text-muted">
                            {insight.text}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full surface-muted px-2 py-0.5 text-xs font-medium capitalize text-secondary">
                    {match.status}
                  </span>
                </div>

                {expandedId === match.id && (
                  <div className="border-t px-4 py-4">
                    <ScoreBreakdown breakdown={match.breakdown} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {pagination.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                onClick={() => load(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="rounded-lg border px-3 py-1.5 text-sm font-medium text-secondary disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-muted">Page {pagination.page} of {pagination.totalPages}</span>
              <button
                onClick={() => load(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="rounded-lg border px-3 py-1.5 text-sm font-medium text-secondary disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
