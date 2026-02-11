import { useState, useEffect, useRef } from 'react';
import { fetchSellers, type SellerOption } from '../lib/api';

interface SellerPickerProps {
  value: string | null;
  onChange: (sellerId: string | null) => void;
  suggestedSeller?: SellerOption | null;
}

export default function SellerPicker({ value, onChange, suggestedSeller }: SellerPickerProps) {
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    fetchSellers()
      .then(setSellers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = sellers.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.email.toLowerCase().includes(q) ||
      (s.companyName || '').toLowerCase().includes(q) ||
      (s.firstName || '').toLowerCase().includes(q) ||
      (s.lastName || '').toLowerCase().includes(q)
    );
  });

  const selected = sellers.find((s) => s.id === value);

  const displayName = (s: SellerOption) => {
    const parts = [];
    if (s.companyName) parts.push(s.companyName);
    if (s.firstName || s.lastName) parts.push(`(${[s.firstName, s.lastName].filter(Boolean).join(' ')})`);
    return parts.join(' ') || s.email;
  };

  return (
    <div ref={wrapperRef} className="relative">
      <label className="mb-1 block text-xs font-medium text-gray-500">Seller</label>

      {/* Suggested seller badge */}
      {suggestedSeller && !value && (
        <div className="mb-2 flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-xs">
          <span className="font-medium text-blue-700">Suggested:</span>
          <span className="text-blue-900">{displayName(suggestedSeller)}</span>
          <button
            onClick={() => onChange(suggestedSeller.id)}
            className="ml-auto rounded bg-blue-600 px-2 py-0.5 text-white hover:bg-blue-700"
          >
            Use
          </button>
        </div>
      )}

      {/* Selected display / search input */}
      <div
        onClick={() => setOpen(true)}
        className="flex cursor-pointer items-center rounded-lg border bg-white px-3 py-2"
      >
        {selected ? (
          <div className="flex flex-1 items-center justify-between">
            <span className="text-sm text-gray-900">{displayName(selected)}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onChange(null); setSearch(''); }}
              className="ml-2 text-gray-400 hover:text-gray-600"
            >
              &times;
            </button>
          </div>
        ) : (
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={loading ? 'Loading sellers...' : 'Search sellers...'}
            className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
        )}
      </div>

      {/* Dropdown */}
      {open && !selected && (
        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border bg-white shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">
              {loading ? 'Loading...' : 'No sellers found'}
            </div>
          ) : (
            filtered.map((s) => (
              <button
                key={s.id}
                onClick={() => { onChange(s.id); setOpen(false); setSearch(''); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
              >
                <div>
                  <p className="font-medium text-gray-900">{displayName(s)}</p>
                  <p className="text-xs text-gray-400">{s.email}</p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
