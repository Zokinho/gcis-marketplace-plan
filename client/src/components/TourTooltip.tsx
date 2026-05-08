import type { TooltipRenderProps } from 'react-joyride';

export default function TourTooltip({
  continuous,
  index,
  step,
  size,
  backProps,
  primaryProps,
  skipProps,
  tooltipProps,
  isLastStep,
}: TooltipRenderProps) {
  return (
    <div
      role={tooltipProps.role}
      aria-modal={tooltipProps['aria-modal']}
      className="rounded-xl surface border border-default shadow-2xl"
      style={{ maxWidth: 'min(400px, calc(100vw - 2rem))' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-default px-5 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-brand-teal dark:text-brand-yellow">
          Step {index + 1} of {size}
        </span>
        <button
          aria-label={skipProps['aria-label']}
          data-action={skipProps['data-action']}
          role={skipProps.role}
          title={skipProps.title}
          onClick={skipProps.onClick}
          className="text-xs font-medium text-muted hover:text-primary transition"
        >
          Skip tour
        </button>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {step.title && (
          <h3 className="mb-1.5 text-base font-semibold text-primary">
            {step.title as string}
          </h3>
        )}
        <p className="text-sm leading-relaxed text-secondary">
          {step.content as string}
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-default px-5 py-3">
        <div>
          {index > 0 && (
            <button
              aria-label={backProps['aria-label']}
              data-action={backProps['data-action']}
              role={backProps.role}
              title={backProps.title}
              onClick={backProps.onClick}
              className="rounded-lg border border-default px-4 py-1.5 text-sm font-medium text-secondary transition hover:surface-muted"
            >
              Back
            </button>
          )}
        </div>
        {continuous && (
          <button
            aria-label={primaryProps['aria-label']}
            data-action={primaryProps['data-action']}
            role={primaryProps.role}
            title={primaryProps.title}
            onClick={primaryProps.onClick}
            className="rounded-lg bg-brand-teal px-5 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-blue"
          >
            {isLastStep ? 'Finish' : 'Next'}
          </button>
        )}
      </div>
    </div>
  );
}
