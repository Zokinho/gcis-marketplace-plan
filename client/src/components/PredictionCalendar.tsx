import type { PredictionRecord } from '../lib/api';

interface Props {
  weeks: Record<string, PredictionRecord[]>;
}

export default function PredictionCalendar({ weeks }: Props) {
  const sortedWeeks = Object.entries(weeks).sort(([a], [b]) => a.localeCompare(b));

  if (sortedWeeks.length === 0) {
    return <p className="text-sm text-gray-400">No predictions available</p>;
  }

  return (
    <div className="space-y-4">
      {sortedWeeks.map(([weekStart, predictions]) => {
        const weekDate = new Date(weekStart);
        const weekEnd = new Date(weekDate);
        weekEnd.setDate(weekEnd.getDate() + 6);

        return (
          <div key={weekStart} className="rounded-lg border bg-white p-4">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
              {weekDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} –{' '}
              {weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </h4>
            <div className="space-y-2">
              {predictions.map((pred) => (
                <div
                  key={pred.id}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                    pred.isOverdue ? 'bg-red-50' : 'bg-brand-offwhite'
                  }`}
                >
                  <div>
                    <span className="font-medium text-brand-dark">
                      {pred.buyer?.companyName || pred.buyer?.email || 'Unknown'}
                    </span>
                    <span className="ml-2 text-xs text-gray-400">{pred.categoryName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {pred.isOverdue && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-brand-coral">
                        {pred.daysOverdue}d overdue
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {new Date(pred.predictedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="text-xs font-medium text-gray-500">
                      {Math.round(pred.confidenceScore)}% conf
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
