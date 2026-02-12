interface Props {
  fillRate: number;
  qualityScore: number;
  deliveryScore: number;
  pricingScore: number;
  overallScore: number;
  transactionsScored: number;
}

function ScoreMetric({ label, value, weight }: { label: string; value: number; weight: string }) {
  const color = value >= 80 ? 'text-brand-blue' : value >= 60 ? 'text-brand-yellow' : value >= 40 ? 'text-brand-coral' : 'text-red-600';
  return (
    <div className="text-center">
      <p className="text-xs text-faint">{label} ({weight})</p>
      <p className={`text-lg font-bold ${color}`}>{Math.round(value)}%</p>
    </div>
  );
}

export default function SellerScoreCard({ fillRate, qualityScore, deliveryScore, pricingScore, overallScore, transactionsScored }: Props) {
  const overallColor = overallScore >= 80 ? 'text-brand-blue' : overallScore >= 60 ? 'text-brand-yellow' : 'text-brand-coral';

  return (
    <div className="rounded-lg border border-brand-blue/15 bg-brand-blue/5 shadow-md p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted">Seller Score</h3>
        <span className={`text-2xl font-bold ${overallColor}`}>{Math.round(overallScore)}%</span>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <ScoreMetric label="Fill Rate" value={fillRate} weight="30%" />
        <ScoreMetric label="Quality" value={qualityScore} weight="30%" />
        <ScoreMetric label="Delivery" value={deliveryScore} weight="25%" />
        <ScoreMetric label="Pricing" value={pricingScore} weight="15%" />
      </div>
      <p className="mt-3 text-center text-xs text-faint">
        Based on {transactionsScored} scored transaction{transactionsScored !== 1 ? 's' : ''}
      </p>
    </div>
  );
}
