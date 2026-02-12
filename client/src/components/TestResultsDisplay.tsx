interface TestResultsDisplayProps {
  testResults: Record<string, any>;
  labName?: string | null;
  testDate?: string | null;
  reportNumber?: string | null;
}

const SECTION_LABELS: Record<string, string> = {
  potency: 'Potency',
  terpenes: 'Terpene Profile',
  microbial: 'Microbial Testing',
  pesticides: 'Pesticide Screening',
  heavy_metals: 'Heavy Metals',
  residual_solvents: 'Residual Solvents',
  mycotoxins: 'Mycotoxins',
  moisture: 'Moisture Content',
};

const SECTION_ORDER = [
  'potency',
  'terpenes',
  'microbial',
  'pesticides',
  'heavy_metals',
  'residual_solvents',
  'mycotoxins',
  'moisture',
];

export default function TestResultsDisplay({
  testResults,
  labName,
  testDate,
  reportNumber,
}: TestResultsDisplayProps) {
  if (!testResults || Object.keys(testResults).length === 0) return null;

  const sections = SECTION_ORDER.filter((key) => testResults[key]);

  return (
    <div className="space-y-4">
      {/* Lab info header */}
      <div className="flex flex-wrap gap-4 text-xs text-muted">
        {labName && (
          <span>
            Lab: <span className="font-medium text-secondary">{labName}</span>
          </span>
        )}
        {testDate && (
          <span>
            Tested: <span className="font-medium text-secondary">{new Date(testDate).toLocaleDateString()}</span>
          </span>
        )}
        {reportNumber && (
          <span>
            Report #: <span className="font-medium text-secondary">{reportNumber}</span>
          </span>
        )}
      </div>

      {/* Test sections */}
      {sections.map((sectionKey) => {
        const section = testResults[sectionKey];
        const data = section?.data || section;
        const overallResult = section?.overall_result;

        return (
          <div key={sectionKey} className="rounded-lg border border-subtle surface-muted p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-bold text-secondary">
                {SECTION_LABELS[sectionKey] || sectionKey}
              </h4>
              {overallResult && <StatusBadge result={overallResult} />}
            </div>

            <div className="space-y-1">
              {Object.entries(data).map(([key, val]) => {
                // Skip metadata keys
                if (key === 'overall_result' || key === 'status') return null;

                return <TestRow key={key} name={key} value={val} sectionKey={sectionKey} />;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TestRow({
  name,
  value,
  sectionKey,
}: {
  name: string;
  value: any;
  sectionKey: string;
}) {
  // Value can be a dict like { result: "22.5", unit: "%", status: "pass" }
  // or a plain string/number
  const isObj = typeof value === 'object' && value !== null;
  const result = isObj ? value.result : value;
  const unit = isObj ? value.unit || '' : '';
  const status = isObj ? value.status : null;
  const limit = isObj ? value.limit || value.action_limit : null;

  // Format display value
  const displayVal = result != null ? `${result}${unit ? ` ${unit}` : ''}` : '\u2014';

  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-secondary">{formatName(name)}</span>
      <div className="flex items-center gap-2">
        {limit && <span className="text-faint">limit: {limit}</span>}
        <span className={`font-medium ${getValueColor(sectionKey, result)}`}>{displayVal}</span>
        {status && <MicroBadge status={status} />}
      </div>
    </div>
  );
}

function StatusBadge({ result }: { result: string }) {
  const lower = result.toLowerCase();
  const isPassing = lower === 'pass' || lower === 'passed' || lower === 'compliant';
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
        isPassing ? 'bg-brand-sage/20 text-brand-teal' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
      }`}
    >
      {result.toUpperCase()}
    </span>
  );
}

function MicroBadge({ status }: { status: string }) {
  const lower = status.toLowerCase();
  const isPassing = lower === 'pass' || lower === 'passed' || lower === 'nd' || lower === 'compliant';
  return (
    <span
      className={`rounded px-1 py-px text-[10px] font-bold ${
        isPassing ? 'bg-brand-sage/10 text-brand-teal' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300'
      }`}
    >
      {status.toUpperCase()}
    </span>
  );
}

function formatName(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getValueColor(sectionKey: string, result: any): string {
  if (result == null) return 'text-faint';
  const num = parseFloat(String(result));
  if (isNaN(num)) return 'text-primary';

  // Potency values get green
  if (sectionKey === 'potency' && num > 0) return 'text-brand-teal';
  // Terpene values get emerald
  if (sectionKey === 'terpenes' && num > 0) return 'text-brand-teal';

  return 'text-primary';
}
