import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import RiskBadge from '../components/RiskBadge';
import { fetchAtRiskBuyers, fetchChurnStats, runChurnDetection } from '../lib/api';

export default function ChurnPage() {
  const [stats, setStats] = useState<{ totalAtRisk: number; criticalCount: number; highCount: number; mediumCount: number; lowCount: number } | null>(null);
  const [buyers, setBuyers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [minLevel, setMinLevel] = useState('medium');

  useEffect(() => {
    load();
  }, [minLevel]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [statsData, buyersData] = await Promise.all([
        fetchChurnStats(),
        fetchAtRiskBuyers({ minRiskLevel: minLevel, limit: 30 }),
      ]);
      setStats(statsData);
      setBuyers(buyersData.buyers);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  async function handleDetect() {
    setDetecting(true);
    try {
      await runChurnDetection();
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to run detection');
    } finally {
      setDetecting(false);
    }
  }

  return (
    <Layout>
      <div className="mb-6 flex flex-col gap-4 rounded-lg bg-gradient-to-r from-brand-blue to-brand-teal px-6 py-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Churn Detection</h2>
          <p className="mt-0.5 text-sm text-white/70">At-risk buyer identification and alerts</p>
        </div>
        <button
          onClick={handleDetect}
          disabled={detecting}
          className="rounded-lg bg-white/20 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/30 disabled:opacity-50"
        >
          {detecting ? 'Detecting...' : 'Run Detection'}
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="mb-6 grid gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-brand-blue/15 bg-brand-blue/5 shadow-md p-4 text-center">
            <p className="text-xs text-faint">Total At Risk</p>
            <p className="text-2xl font-bold text-primary">{stats.totalAtRisk}</p>
          </div>
          <div className="rounded-lg border bg-red-50 p-4 text-center">
            <p className="text-xs text-red-400">Critical</p>
            <p className="text-2xl font-bold text-red-700">{stats.criticalCount}</p>
          </div>
          <div className="rounded-lg border bg-orange-50 p-4 text-center">
            <p className="text-xs text-orange-400">High</p>
            <p className="text-2xl font-bold text-orange-700">{stats.highCount}</p>
          </div>
          <div className="rounded-lg border bg-amber-50 p-4 text-center">
            <p className="text-xs text-amber-400">Medium</p>
            <p className="text-2xl font-bold text-amber-700">{stats.mediumCount}</p>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="mb-4 flex gap-1.5">
        {['low', 'medium', 'high', 'critical'].map((level) => (
          <button
            key={level}
            onClick={() => setMinLevel(level)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${minLevel === level ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300'}`}
          >
            {level}+
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-blue border-t-transparent" />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-medium text-red-700">{error}</p>
        </div>
      )}

      {!loading && !error && buyers.length === 0 && (
        <div className="rounded-lg border surface p-12 text-center">
          <p className="text-sm text-muted">No at-risk buyers detected at this threshold</p>
        </div>
      )}

      {!loading && !error && buyers.length > 0 && (
        <div className="space-y-3">
          {buyers.map((entry: any) => (
            <div key={entry.buyer.id} className="rounded-lg border border-brand-blue/15 bg-brand-blue/5 shadow-md p-4">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-primary">{entry.buyer.companyName || entry.buyer.email}</p>
                  {entry.buyer.companyName && (
                    <p className="text-xs text-faint">{entry.buyer.email}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <RiskBadge level={entry.overallRiskLevel} />
                  <span className="text-sm font-bold text-secondary">{Math.round(entry.overallRiskScore)}%</span>
                </div>
              </div>
              {entry.signals.length > 0 && (
                <div className="mt-2 space-y-1">
                  {entry.signals.map((signal: any, i: number) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-brand-offwhite dark:bg-slate-700 px-3 py-1.5 text-xs">
                      <span className="text-secondary">{signal.categoryName || 'Overall'}</span>
                      <span className="text-muted">
                        {signal.daysSincePurchase}d since purchase (avg {Math.round(signal.avgIntervalDays)}d)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
