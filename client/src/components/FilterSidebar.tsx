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
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
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

      {/* Price Range */}
      <RangeFilter
        label="Price ($/g)"
        min={filters.priceMin}
        max={filters.priceMax}
        onChangeMin={(v) => update({ priceMin: v })}
        onChangeMax={(v) => update({ priceMax: v })}
        step={0.1}
        rangeMax={50}
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
        className="w-full rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
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
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border bg-white py-2 text-sm font-medium text-gray-700 lg:hidden"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
        </svg>
        {mobileOpen ? 'Hide Filters' : 'Show Filters'}
      </button>

      {/* Mobile panel */}
      {mobileOpen && (
        <div className="mb-4 rounded-xl border bg-white p-4 lg:hidden">{content}</div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 rounded-xl border bg-white p-4 lg:block">
        <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-500">Filters</h3>
        {content}
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
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
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
          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
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
          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
      </div>
    </div>
  );
}
