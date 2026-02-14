import { useState, useEffect, useRef } from 'react';
import type { ProductFilters, FilterOptions } from '../lib/api';
import { fetchFilterOptions } from '../lib/api';

interface FilterSidebarProps {
  filters: ProductFilters;
  onChange: (filters: ProductFilters) => void;
}

export default function FilterSidebar({ filters, onChange }: FilterSidebarProps) {
  const [options, setOptions] = useState<FilterOptions>({ categories: [], types: [], certifications: [], terpenes: [] });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    fetchFilterOptions().then(setOptions).catch(() => {});
  }, []);

  function update(patch: Partial<ProductFilters>) {
    onChange({ ...filters, ...patch, page: 1 });
  }

  const content = (
    <div className="space-y-5">
      {/* Search */}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Search</label>
        <input
          type="text"
          placeholder="Name, type, lineage..."
          value={filters.search || ''}
          onChange={(e) => update({ search: e.target.value || undefined })}
          className="w-full rounded-lg input-field"
        />
      </div>

      {/* Category */}
      {options.categories.length > 0 && (
        <FilterSelect
          label="Category"
          value={filters.category}
          options={options.categories}
          onChange={(v) => update({ category: v })}
        />
      )}

      {/* Type */}
      {options.types.length > 0 && (
        <FilterSelect
          label="Type"
          value={filters.type}
          options={options.types}
          onChange={(v) => update({ type: v })}
        />
      )}

      {/* Certification */}
      {options.certifications.length > 0 && (
        <MultiSelectDropdown
          label="Certification"
          allOptions={options.certifications}
          selected={filters.certification?.split(',').map((c) => c.trim()).filter(Boolean) || []}
          onChange={(selected) => update({ certification: selected.length > 0 ? selected.join(',') : undefined })}
        />
      )}

      {/* Terpenes */}
      {options.terpenes.length > 0 && (
        <MultiSelectDropdown
          label="Terpenes"
          allOptions={options.terpenes}
          selected={filters.terpene?.split(',').map((t) => t.trim()).filter(Boolean) || []}
          onChange={(selected) => update({ terpene: selected.length > 0 ? selected.join(',') : undefined })}
        />
      )}

      {/* THC Range */}
      <RangeFilter
        label="THC %"
        min={filters.thcMin}
        max={filters.thcMax}
        onChangeMin={(v) => update({ thcMin: v })}
        onChangeMax={(v) => update({ thcMax: v })}
        step={0.5}
        rangeMax={35}
      />

      {/* CBD Range */}
      <RangeFilter
        label="CBD %"
        min={filters.cbdMin}
        max={filters.cbdMax}
        onChangeMin={(v) => update({ cbdMin: v })}
        onChangeMax={(v) => update({ cbdMax: v })}
        step={0.5}
        rangeMax={30}
      />

      {/* CBD:THC Ratio */}
      <RatioFilter
        ratio={filters.cbdThcRatio}
        tolerance={filters.ratioTolerance}
        onChangeRatio={(v) => update({ cbdThcRatio: v })}
        onChangeTolerance={(v) => update({ ratioTolerance: v })}
      />


      {/* Availability */}
      <FilterSelect
        label="Availability"
        value={filters.availability}
        options={['in_stock', 'upcoming']}
        displayMap={{ in_stock: 'In Stock', upcoming: 'Upcoming' }}
        onChange={(v) => update({ availability: v as ProductFilters['availability'] })}
      />

      {/* Clear all */}
      <button
        onClick={() => onChange({ page: 1 })}
        className="w-full rounded-lg bg-brand-coral py-2 text-sm font-semibold text-white transition hover:bg-brand-coral/85"
      >
        Clear All Filters
      </button>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border card-blue py-2 text-sm font-medium text-brand-teal backdrop-blur-sm lg:hidden"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
        </svg>
        {mobileOpen ? 'Hide Filters' : 'Show Filters'}
      </button>

      {/* Mobile panel */}
      {mobileOpen && (
        <div className="mb-4 rounded-lg border card-blue p-4 shadow-md backdrop-blur-sm lg:hidden">{content}</div>
      )}

      {/* Desktop sidebar — sticky, snug height */}
      <aside className="hidden w-64 shrink-0 self-start sticky top-16 max-h-[calc(100vh-5rem)] overflow-y-auto rounded-lg border card-blue shadow-md backdrop-blur-sm lg:block">
        <div className="bg-brand-teal px-4 py-3 sticky top-0 z-10">
          <h3 className="text-sm font-bold uppercase tracking-wide text-white">Filters</h3>
        </div>
        <div className="p-4">{content}</div>
      </aside>
    </>
  );
}

// ─── Reusable filter sub-components ───

function FilterSelect({
  label,
  value,
  options,
  displayMap,
  onChange,
}: {
  label: string;
  value?: string;
  options: string[];
  displayMap?: Record<string, string>;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">{label}</label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="w-full rounded-lg input-field"
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{displayMap?.[opt] || opt}</option>
        ))}
      </select>
    </div>
  );
}

function RangeFilter({
  label,
  min,
  max,
  onChangeMin,
  onChangeMax,
  step,
  rangeMax,
}: {
  label: string;
  min?: number;
  max?: number;
  onChangeMin: (value: number | undefined) => void;
  onChangeMax: (value: number | undefined) => void;
  step: number;
  rangeMax: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">{label}</label>
      <div className="flex gap-2">
        <input
          type="number"
          placeholder="Min"
          value={min ?? ''}
          min={0}
          max={rangeMax}
          step={step}
          onChange={(e) => onChangeMin(e.target.value ? parseFloat(e.target.value) : undefined)}
          className="w-full rounded-lg input-field !px-2 !py-1.5"
        />
        <span className="self-center text-faint">–</span>
        <input
          type="number"
          placeholder="Max"
          value={max ?? ''}
          min={0}
          max={rangeMax}
          step={step}
          onChange={(e) => onChangeMax(e.target.value ? parseFloat(e.target.value) : undefined)}
          className="w-full rounded-lg input-field !px-2 !py-1.5"
        />
      </div>
    </div>
  );
}

const RATIO_PRESETS = [
  { label: '1:1', value: '1:1', desc: 'Equal CBD & THC' },
  { label: '2:1 CBD', value: '2:1', desc: 'Double CBD vs THC' },
  { label: '1:2 CBD', value: '1:2', desc: 'Half CBD vs THC' },
];

function RatioFilter({
  ratio,
  tolerance,
  onChangeRatio,
  onChangeTolerance,
}: {
  ratio?: string;
  tolerance?: number;
  onChangeRatio: (v: string | undefined) => void;
  onChangeTolerance: (v: number | undefined) => void;
}) {
  const isPreset = ratio && RATIO_PRESETS.some((p) => p.value === ratio);
  const [customText, setCustomText] = useState(ratio && !isPreset ? ratio : '');

  // Sync customText when ratio changes externally (e.g. cleared or preset selected)
  useEffect(() => {
    const nowPreset = ratio && RATIO_PRESETS.some((p) => p.value === ratio);
    if (!ratio) setCustomText('');
    else if (!nowPreset) setCustomText(ratio);
  }, [ratio]);

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">CBD:THC Ratio</label>
      <div className="flex flex-wrap gap-1.5">
        {RATIO_PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => { onChangeRatio(ratio === p.value ? undefined : p.value); setCustomText(''); }}
            title={p.desc}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
              ratio === p.value
                ? 'border-brand-teal bg-brand-sage/20 text-brand-teal'
                : 'border-default text-secondary hover-surface-muted'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {/* Custom ratio input */}
      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          placeholder="e.g. 3:1"
          value={customText}
          onChange={(e) => {
            const v = e.target.value;
            setCustomText(v);
            const trimmed = v.trim();
            if (!trimmed) { onChangeRatio(undefined); return; }
            if (/^\d+:\d+$/.test(trimmed)) onChangeRatio(trimmed);
          }}
          className="w-20 rounded-lg input-field !px-2 !py-1 !text-xs"
        />
        <span className="text-xs text-faint">custom</span>
      </div>
      {/* Tolerance slider */}
      {ratio && (
        <div className="mt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-faint">Tolerance</span>
            <span className="text-xs font-medium text-secondary">{tolerance ?? 25}%</span>
          </div>
          <input
            type="range"
            min={5}
            max={50}
            step={5}
            value={tolerance ?? 25}
            onChange={(e) => onChangeTolerance(parseInt(e.target.value))}
            className="mt-0.5 w-full accent-brand-teal"
          />
        </div>
      )}
    </div>
  );
}

function MultiSelectDropdown({
  label,
  allOptions,
  selected,
  onChange,
}: {
  label: string;
  allOptions: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  function toggle(item: string) {
    if (selected.includes(item)) {
      onChange(selected.filter((s) => s !== item));
    } else {
      onChange([...selected, item]);
    }
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={dropdownRef} className="relative">
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">{label}</label>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-lg input-field text-left"
      >
        <span className={`truncate text-sm ${selected.length > 0 ? 'text-primary' : 'text-faint'}`}>
          {selected.length > 0 ? `${selected.length} selected` : 'All'}
        </span>
        <svg className={`h-4 w-4 flex-shrink-0 text-faint transition ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {selected.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 rounded-full bg-brand-sage/20 px-2 py-0.5 text-[10px] font-medium text-brand-teal"
            >
              {item}
              <button onClick={() => toggle(item)} className="hover:text-brand-teal/60">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-48 overflow-y-auto rounded-lg border border-default bg-white shadow-lg dark:bg-brand-dark">
          {allOptions.map((item) => (
            <button
              key={item}
              onClick={() => toggle(item)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-brand-sage/10"
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                selected.includes(item)
                  ? 'border-brand-teal bg-brand-teal text-white'
                  : 'border-default'
              }`}>
                {selected.includes(item) && (
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                )}
              </span>
              <span className="text-secondary">{item}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
