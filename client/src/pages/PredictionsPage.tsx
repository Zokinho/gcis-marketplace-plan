import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import PredictionCalendar from '../components/PredictionCalendar';
import { fetchPredictionCalendar, fetchPredictions, type PredictionRecord } from '../lib/api';

export default function PredictionsPage() {
  const [weeks, setWeeks] = useState<Record<string, PredictionRecord[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [listType, setListType] = useState<'upcoming' | 'overdue'>('upcoming');
  const [listData, setListData] = useState<PredictionRecord[]>([]);

  useEffect(() => {
    if (view === 'calendar') {
      setLoading(true);
      fetchPredictionCalendar()
        .then((data) => setWeeks(data.weeks))
        .catch((err) => setError(err?.response?.data?.error || 'Failed to load'))
        .finally(() => setLoading(false));
    } else {
      setLoading(true);
      fetchPredictions({ type: listType, limit: 50 })
        .then((data) => setListData(data.predictions))
        .catch((err) => setError(err?.response?.data?.error || 'Failed to load'))
        .finally(() => setLoading(false));
    }
  }, [view, listType]);

  return (
    <Layout>
      <div className="mb-6 flex flex-col gap-4 rounded-lg bg-gradient-to-r from-brand-blue to-brand-teal px-6 py-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Reorder Predictions</h2>
          <p className="mt-0.5 text-sm text-white/70">AI-predicted upcoming buyer reorders</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView('calendar')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${view === 'calendar' ? 'bg-white/30 text-white' : 'bg-white/10 text-white/80'}`}
          >
            Calendar
          </button>
          <button
            onClick={() => setView('list')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${view === 'list' ? 'bg-white/30 text-white' : 'bg-white/10 text-white/80'}`}
          >
            List
          </button>
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

      {!loading && !error && view === 'calendar' && (
        <PredictionCalendar weeks={weeks} />
      )}

      {!loading && !error && view === 'list' && (
        <>
          <div className="mb-4 flex gap-2">
            <button
              onClick={() => setListType('upcoming')}
              className={`rounded-full px-3 py-1 text-xs font-medium ${listType === 'upcoming' ? 'bg-brand-blue text-white' : 'surface-muted text-secondary'}`}
            >
              Upcoming
            </button>
            <button
              onClick={() => setListType('overdue')}
              className={`rounded-full px-3 py-1 text-xs font-medium ${listType === 'overdue' ? 'bg-red-600 text-white' : 'surface-muted text-secondary'}`}
            >
              Overdue
            </button>
          </div>

          {listData.length === 0 ? (
            <div className="rounded-lg border surface p-12 text-center">
              <p className="text-sm text-muted">No {listType} predictions</p>
            </div>
          ) : (
            <div className="space-y-2">
              {listData.map((pred) => (
                <div key={pred.id} className={`flex items-center justify-between rounded-lg border card-blue shadow-md p-4 ${listType === 'overdue' ? 'border-red-200' : ''}`}>
                  <div>
                    <p className="font-medium text-primary">{pred.buyer?.companyName || pred.buyer?.email}</p>
                    <p className="text-xs text-faint">{pred.categoryName} &middot; {pred.basedOnTransactions} transactions &middot; avg {Math.round(pred.avgIntervalDays)}d interval</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-secondary">
                      {new Date(pred.predictedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                    <p className="text-xs text-faint">{Math.round(pred.confidenceScore)}% confidence</p>
                    {pred.daysOverdue != null && pred.daysOverdue > 0 && (
                      <p className="text-xs font-medium text-red-600">{pred.daysOverdue}d overdue</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
