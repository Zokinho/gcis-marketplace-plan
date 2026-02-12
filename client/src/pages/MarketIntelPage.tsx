import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import MarketTrendChart from '../components/MarketTrendChart';
import { fetchMarketInsights, fetchMarketContext, type MarketTrend, type MarketContextData } from '../lib/api';

export default function MarketIntelPage() {
  const [trends, setTrends] = useState<MarketTrend[]>([]);
  const [topCategories, setTopCategories] = useState<Array<{ categoryName: string; volume: number; avgPrice: number }>>([]);
  const [supplyDemand, setSupplyDemand] = useState<Array<{ categoryName: string; ratio: number; assessment: string }>>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryContext, setCategoryContext] = useState<MarketContextData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMarketInsights()
      .then((data) => {
        setTrends(data.trends);
        setTopCategories(data.topCategories);
        setSupplyDemand(data.supplyDemandOverview);
      })
      .catch((err) => setError(err?.response?.data?.error || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedCategory) { setCategoryContext(null); return; }
    fetchMarketContext(selectedCategory)
      .then(setCategoryContext)
      .catch(() => setCategoryContext(null));
  }, [selectedCategory]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-blue border-t-transparent" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6 rounded-lg bg-gradient-to-r from-brand-blue to-brand-teal px-6 py-5 text-white">
        <h2 className="text-2xl font-semibold">Market Intelligence</h2>
        <p className="mt-0.5 text-sm text-white/70">Price trends and market analysis</p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-medium text-red-700">{error}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Price Trends */}
        <div className="rounded-lg border border-brand-blue/15 bg-brand-blue/5 shadow-md p-5">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Price Trends (30d)</h3>
          <MarketTrendChart trends={trends} />
        </div>

        {/* Top Categories by Volume */}
        <div className="rounded-lg border border-brand-blue/15 bg-brand-blue/5 shadow-md p-5">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Top Categories by Volume</h3>
          {topCategories.length === 0 ? (
            <p className="text-sm text-faint">No transaction data yet</p>
          ) : (
            <div className="space-y-2">
              {topCategories.map((cat) => (
                <button
                  key={cat.categoryName}
                  onClick={() => setSelectedCategory(cat.categoryName)}
                  className={`w-full rounded-lg px-3 py-2 text-left transition hover-surface-muted ${selectedCategory === cat.categoryName ? 'bg-brand-gray/30 ring-1 ring-brand-blue/30' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-secondary">{cat.categoryName}</span>
                    <span className="text-sm text-muted">${cat.avgPrice.toFixed(2)}/g</span>
                  </div>
                  <p className="text-xs text-faint">Vol: ${cat.volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Supply/Demand */}
        <div className="rounded-lg border border-brand-blue/15 bg-brand-blue/5 shadow-md p-5">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Supply / Demand</h3>
          {supplyDemand.length === 0 ? (
            <p className="text-sm text-faint">No data yet</p>
          ) : (
            <div className="space-y-2">
              {supplyDemand.map((sd) => {
                const color = sd.assessment === 'high_demand' ? 'text-brand-blue bg-sky-100'
                  : sd.assessment === 'oversupply' ? 'text-red-700 bg-red-50'
                  : 'text-secondary bg-brand-offwhite dark:bg-slate-700';
                return (
                  <div key={sd.categoryName} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm">
                    <span className="text-secondary">{sd.categoryName}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
                      {sd.assessment.replace('_', ' ')} ({sd.ratio.toFixed(1)})
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Category Detail */}
        <div className="rounded-lg border border-brand-blue/15 bg-brand-blue/5 shadow-md p-5">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
            {selectedCategory ? `${selectedCategory} Detail` : 'Select a Category'}
          </h3>
          {!categoryContext ? (
            <p className="text-sm text-faint">Click a category to see details</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Avg Price (30d)" value={categoryContext.avgPrice30d != null ? `$${categoryContext.avgPrice30d.toFixed(2)}` : '—'} />
                <Stat label="Price Range" value={categoryContext.minPrice30d != null && categoryContext.maxPrice30d != null ? `$${categoryContext.minPrice30d.toFixed(2)} – $${categoryContext.maxPrice30d.toFixed(2)}` : '—'} />
                <Stat label="7d Change" value={categoryContext.priceChange7d != null ? `${categoryContext.priceChange7d > 0 ? '+' : ''}${categoryContext.priceChange7d.toFixed(1)}%` : '—'} />
                <Stat label="30d Change" value={categoryContext.priceChange30d != null ? `${categoryContext.priceChange30d > 0 ? '+' : ''}${categoryContext.priceChange30d.toFixed(1)}%` : '—'} />
                <Stat label="Transactions (30d)" value={String(categoryContext.transactionCount30d)} />
                <Stat label="Volume (30d)" value={`$${categoryContext.totalVolume30d.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
                <Stat label="Active Listings" value={String(categoryContext.activeListings)} />
                <Stat label="Active Buyers" value={String(categoryContext.activeBuyers)} />
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-faint">{label}</p>
      <p className="text-sm font-semibold text-secondary">{value}</p>
    </div>
  );
}
