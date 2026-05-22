interface PaginationControlsProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  compact?: boolean;
}

function generatePageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | string)[] = [1];

  if (current > 3) pages.push('...');

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push('...');

  pages.push(total);
  return pages;
}

export default function PaginationControls({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  compact = false,
}: PaginationControlsProps) {
  if (totalPages <= 1) return null;

  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  const pageButtons = (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className={`rounded-lg border border-default font-medium text-secondary transition hover-surface-muted disabled:opacity-40 ${compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'}`}
      >
        Previous
      </button>

      {generatePageNumbers(page, totalPages).map((p, i) =>
        p === '...' ? (
          <span key={`dots-${i}`} className="px-1 text-faint">...</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p as number)}
            className={`rounded-lg font-medium transition ${compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} ${
              p === page
                ? 'bg-brand-teal text-white'
                : 'border border-default text-secondary hover-surface-muted'
            }`}
          >
            {p}
          </button>
        ),
      )}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className={`rounded-lg border border-default font-medium text-secondary transition hover-surface-muted disabled:opacity-40 ${compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'}`}
      >
        Next
      </button>
    </div>
  );

  if (compact) return pageButtons;

  return (
    <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
      <span className="text-sm text-muted">
        Showing {start}–{end} of {total}
      </span>
      {pageButtons}
    </div>
  );
}
