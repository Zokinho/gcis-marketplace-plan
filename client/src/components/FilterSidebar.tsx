import { useState, useEffect } from 'react';
import type { ProductFilters, FilterOptions } from '../lib/api';
import { fetchFilterOptions } from '../lib/api';

interface FilterSidebarProps {
  filters: ProductFilters;
  onChange: (filters: ProductFilters) => void;
}

export default function FilterSidebar({ filters, onChange }: FilterSidebarProps) {
  const [options, setOptions] = useState<FilterOptions>({ categories: [], types: [], certifications: [] });
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
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Search</label>
        <input
          type="text"
          placeholder="Name, type, lineage..."
          value={filters.search || ''}
          onChange={(e) => update({ search: e.target.value || undefined })}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
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
        <FilterSelect
          label="Certification"
          value={filters.certification}
          options={options.certifications}
          onChange={(v) => update({ certification: v })}
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
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-brand-teal/30 bg-white py-2 text-sm font-medium text-brand-teal lg:hidden"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
        </svg>
        {mobileOpen ? 'Hide Filters' : 'Show Filters'}
      </button>

      {/* Mobile panel */}
      {mobileOpen && (
        <div className="mb-4 rounded-lg border bg-white p-4 lg:hidden">{content}</div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 overflow-hidden rounded-lg border bg-white lg:block">
        <div className="bg-gradient-to-r from-brand-teal to-brand-blue px-4 py-3">
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
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
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
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>
      <div className="flex gap-2">
        <input
          type="number"
          placeholder="Min"
          value={min ?? ''}
          min={0}
          max={rangeMax}
          step={step}
          onChange={(e) => onChangeMin(e.target.value ? parseFloat(e.target.value) : undefined)}
          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
        />
        <span className="self-center text-gray-400">–</span>
        <input
          type="number"
          placeholder="Max"
          value={max ?? ''}
          min={0}
          max={rangeMax}
          step={step}
          onChange={(e) => onChangeMax(e.target.value ? parseFloat(e.target.value) : undefined)}
          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
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
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">CBD:THC Ratio</label>
      <div className="flex flex-wrap gap-1.5">
        {RATIO_PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => onChangeRatio(ratio === p.value ? undefined : p.value)}
            title={p.desc}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
              ratio === p.value
                ? 'border-brand-teal bg-brand-sage/20 text-brand-teal'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
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
          value={ratio && !RATIO_PRESETS.some((p) => p.value === ratio) ? ratio : ''}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (!v) { onChangeRatio(undefined); return; }
            if (/^\d+:\d+$/.test(v)) onChangeRatio(v);
          }}
          className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
        />
        <span className="text-xs text-gray-400">custom</span>
      </div>
      {/* Tolerance slider */}
      {ratio && (
        <div className="mt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Tolerance</span>
            <span className="text-xs font-medium text-gray-600">{tolerance ?? 25}%</span>
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
