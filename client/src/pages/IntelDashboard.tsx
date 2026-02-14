import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import RiskBadge from '../components/RiskBadge';
import MarketTrendChart from '../components/MarketTrendChart';
import { fetchIntelDashboard, generateMatches, runChurnDetection, recalculateSellerScores, type IntelDashboard as DashboardData } from '../lib/api';

function KpiCard({ label, value, color = 'text-primary' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-lg border border-brand-blue/15 border-l-4 border-l-brand-blue bg-brand-blue/5 shadow-md p-4">
      <p className="text-xs font-medium text-faint">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

export default function IntelDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  useEffect(() => {
    fetchIntelDashboard()
      .then(setData)
      .catch((err) => setError(err?.response?.data?.error || 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  async function runAction(name: string, fn: () => Promise<unknown>) {
    setRunning(name);
    try {
      await fn();
      const fresh = await fetchIntelDashboard();
      setData(fresh);
    } catch (err: any) {
      setError(err?.response?.data?.error || `Failed to run ${name}`);
    } finally {
      setRunning(null);
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-blue border-t-transparent" />
        </div>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-medium text-red-700">{error || 'Failed to load'}</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-primary">Intelligence Dashboard</h2>
        <p className="text-sm text-muted">AI-powered insights for your marketplace</p>
        <div className="mt-2 h-1 w-12 rounded-full bg-gradient-to-r from-brand-blue to-brand-teal" />
      </div>

      {/* KPI Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Pending Matches" value={data.pendingMatches} />
        <KpiCard label="Avg Match Score" value={`${Math.round(data.avgMatchScore)}%`} />
        <KpiCard label="Upcoming Reorders (7d)" value={data.upcomingPredictions.length} />
        <KpiCard
          label="At-Risk Buyers"
          value={data.atRiskBuyers.critical + data.atRiskBuyers.high}
          color={data.atRiskBuyers.critical > 0 ? 'text-red-600' : 'text-primary'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent High-Score Matches */}
        <div className="rounded-lg border border-brand-blue/15 bg-brand-blue/5 shadow-md p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="border-l-2 border-brand-blue pl-2 text-sm font-bold uppercase tracking-wide text-brand-teal">Top Matches</h3>
            <Link to="/intelligence/matches" className="text-xs font-medium text-brand-blue hover:underline">View All</Link>
          </div>
          {data.totalMatches === 0 ? (
            <p className="text-sm text-faint">No matches generated yet</p>
          ) : (
            <p className="text-sm text-muted">{data.totalMatches} total matches, {data.pendingMatches} pending</p>
          )}
        </div>

        {/* Churn Alerts */}
        <div className="rounded-lg border border-brand-blue/15 bg-brand-blue/5 shadow-md p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="border-l-2 border-brand-coral pl-2 text-sm font-bold uppercase tracking-wide text-brand-teal">Churn Alerts</h3>
            <Link to="/intelligence/churn" className="text-xs font-medium text-brand-blue hover:underline">View All</Link>
          </div>
          <div className="flex gap-4 text-sm">
            <span className="flex items-center gap-1"><RiskBadge level="critical" /> {data.atRiskBuyers.critical}</span>
            <span className="flex items-center gap-1"><RiskBadge level="high" /> {data.atRiskBuyers.high}</span>
            <span className="flex items-center gap-1"><RiskBadge level="medium" /> {data.atRiskBuyers.medium}</span>
          </div>
        </div>

        {/* Market Trends */}
        <div className="rounded-lg border border-brand-blue/15 bg-brand-blue/5 shadow-md p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="border-l-2 border-brand-sage pl-2 text-sm font-bold uppercase tracking-wide text-brand-teal">Market Trends</h3>
            <Link to="/intelligence/market" className="text-xs font-medium text-brand-blue hover:underline">View All</Link>
          </div>
          <MarketTrendChart trends={data.marketTrends} />
        </div>

        {/* Top Sellers */}
        <div className="rounded-lg border border-brand-blue/15 bg-brand-blue/5 shadow-md p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="border-l-2 border-brand-yellow pl-2 text-sm font-bold uppercase tracking-wide text-brand-teal">Top Sellers</h3>
            <Link to="/intelligence/sellers" className="text-xs font-medium text-brand-blue hover:underline">View All</Link>
          </div>
          {data.topSellers.length === 0 ? (
            <p className="text-sm text-faint">No seller scores yet</p>
          ) : (
            <div className="space-y-2">
              {data.topSellers.map((s: any) => (
                <div key={s.id || s.sellerId} className="flex items-center justify-between text-sm">
                  <span className="text-secondary">{s.seller?.companyName || 'Unknown'}</span>
                  <span className="font-semibold text-brand-blue">{Math.round(s.overallScore)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Match Conversion */}
        {data.matchConversion && (
          <div className="rounded-lg border border-brand-blue/15 bg-brand-blue/5 shadow-md p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="border-l-2 border-brand-blue pl-2 text-sm font-bold uppercase tracking-wide text-brand-teal">Match Conversion</h3>
              <Link to="/intelligence/matches" className="text-xs font-medium text-brand-blue hover:underline">View Matches</Link>
            </div>
            {data.matchConversion.totalMatches === 0 ? (
              <p className="text-sm text-faint">No match data yet</p>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted">Conversion Rate</span>
                  <span className="font-semibold text-brand-blue">{Math.round(data.matchConversion.conversionRate * 100)}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Converted / Viewed / Rejected</span>
                  <span className="text-secondary">{data.matchConversion.convertedCount} / {data.matchConversion.viewedCount} / {data.matchConversion.rejectedCount}</span>
                </div>
                {data.matchConversion.avgScoreConverted != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Avg Score (Converted)</span>
                    <span className="font-semibold text-green-600 dark:text-green-400">{data.matchConversion.avgScoreConverted}%</span>
                  </div>
                )}
                {data.matchConversion.avgScoreRejected != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Avg Score (Rejected)</span>
                    <span className="font-semibold text-brand-coral">{data.matchConversion.avgScoreRejected}%</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="mt-6 rounded-lg border border-brand-blue/15 bg-brand-blue/5 shadow-md p-5">
        <h3 className="mb-3 border-l-2 border-brand-teal pl-2 text-sm font-bold uppercase tracking-wide text-brand-teal">Quick Actions</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => runAction('matches', () => generateMatches())}
            disabled={running !== null}
            className="rounded-lg bg-brand-teal px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-teal/80 disabled:opacity-50"
          >
            {running === 'matches' ? 'Generating...' : 'Generate Matches'}
          </button>
          <button
            onClick={() => runAction('churn', () => runChurnDetection())}
            disabled={running !== null}
            className="rounded-lg border border-brand-teal/30 px-4 py-2 text-xs font-semibold text-brand-teal transition hover:bg-brand-teal/10 disabled:opacity-50"
          >
            {running === 'churn' ? 'Running...' : 'Run Churn Detection'}
          </button>
          <button
            onClick={() => runAction('scores', () => recalculateSellerScores())}
            disabled={running !== null}
            className="rounded-lg border border-brand-teal/30 px-4 py-2 text-xs font-semibold text-brand-teal transition hover:bg-brand-teal/10 disabled:opacity-50"
          >
            {running === 'scores' ? 'Calculating...' : 'Recalculate Seller Scores'}
          </button>
        </div>
      </div>
    </Layout>
  );
}
