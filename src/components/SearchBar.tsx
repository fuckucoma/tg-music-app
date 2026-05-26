import React, { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  onSearch: (q: string) => void;
  loading?: boolean;
}

export function SearchBar({ onSearch, loading }: Props) {
  const [value, setValue] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setValue(q);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearch(q), 380);
  }, [onSearch]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <div className="flex items-center gap-2 h-10 px-3 rounded-2xl bg-surface border border-[var(--border)] mb-1">
      <div className="text-muted flex-shrink-0 w-4 h-4 flex items-center justify-center">
        {loading
          ? <span className="w-3.5 h-3.5 border-2 border-muted/30 border-t-muted rounded-full animate-spin-slow" />
          : <SearchIcon />
        }
      </div>
      <input
        type="search"
        placeholder="Search tracks or artists…"
        value={value}
        onChange={handleChange}
        className="flex-1 bg-transparent text-text text-[14px] placeholder:text-muted outline-none [&::-webkit-search-cancel-button]:hidden"
        autoComplete="off"
        spellCheck={false}
      />
      {value && (
        <button
          className="text-muted w-5 h-5 flex items-center justify-center rounded-md active:opacity-60"
          onClick={() => { setValue(''); onSearch(''); }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}