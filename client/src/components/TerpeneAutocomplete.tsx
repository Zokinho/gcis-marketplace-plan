import { useState, useRef, useEffect } from 'react';
import { TERPENE_LIST } from '../lib/terpenes';

interface TerpeneAutocompleteProps {
  selected: string[];
  onChange: (terpenes: string[]) => void;
  required?: boolean;
}

export default function TerpeneAutocomplete({ selected, onChange, required }: TerpeneAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const suggestions =
    query.length >= 2
      ? TERPENE_LIST.filter(
          (t) =>
            t.toLowerCase().includes(query.toLowerCase()) &&
            !selected.includes(t),
        )
      : [];

  function addTerpene(name: string) {
    onChange([...selected, name]);
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  }

  function removeTerpene(name: string) {
    onChange(selected.filter((t) => t !== name));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && suggestions.length > 0) {
      e.preventDefault();
      addTerpene(suggestions[0]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <label className="mb-1 block text-xs font-medium text-secondary">
        Terpene Profile
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {selected.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full bg-brand-sage/20 px-2.5 py-0.5 text-xs font-medium text-brand-teal"
            >
              {t}
              <button
                type="button"
                onClick={() => removeTerpene(t)}
                className="ml-0.5 text-brand-teal/60 hover:text-brand-coral"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => { if (query.length >= 2) setOpen(true); }}
        onKeyDown={handleKeyDown}
        placeholder="Type to search terpenes..."
        className="w-full input-field"
      />

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-brand-gray bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800">
          {suggestions.map((t) => (
            <li key={t}>
              <button
                type="button"
                onClick={() => addTerpene(t)}
                className="w-full px-3 py-1.5 text-left text-sm text-secondary hover:bg-brand-sage/10 dark:hover:bg-slate-700"
              >
                {t}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
