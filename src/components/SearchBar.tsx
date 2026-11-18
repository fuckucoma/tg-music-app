import { useRef, type RefObject } from 'react';
import { Icon, IconButton } from './Controls';

type Props = {
  variant: 'mobile' | 'desktop';
  value: string;
  onChange: (value: string) => void;
  loading?: boolean;
  inputRef?: RefObject<HTMLInputElement>;
};

export function SearchBar({ variant, value, onChange, loading, inputRef }: Props) {
  const localRef = useRef<HTMLInputElement>(null);
  const searchRef = inputRef ?? localRef;
  const desktop = variant === 'desktop';
  const clear = () => {
    onChange('');
    searchRef.current?.focus();
  };

  return (
    <div
      role="search"
      className={desktop ? 'du-search' : 'flex items-center gap-2 h-10 px-3 rounded-2xl bg-surface border border-[var(--border)] mb-1'}
    >
      <span className={desktop ? 'flex shrink-0' : 'text-muted flex-shrink-0 w-4 h-4 flex items-center justify-center'} aria-hidden="true">
        {loading
          ? <span className="w-3.5 h-3.5 border-2 border-current opacity-60 border-t-transparent rounded-full animate-spin-slow" />
          : <Icon name="search" size={desktop ? 18 : 14} />}
      </span>
      <input
        ref={searchRef}
        type="search"
        maxLength={300}
        aria-label="Поиск музыки"
        placeholder={desktop ? 'Трек, исполнитель или альбом' : 'Поиск треков и исполнителей…'}
        className={!desktop ? 'min-w-0 flex-1 bg-transparent text-text text-[14px] placeholder:text-muted outline-none [&::-webkit-search-cancel-button]:hidden' : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          onChange('');
          event.currentTarget.blur();
        }}
        autoComplete="off"
        spellCheck={false}
      />
      {value ? (
        desktop ? (
          <IconButton icon="close" size={15} label="Очистить поиск" onClick={clear} />
        ) : (
          <button type="button" aria-label="Очистить поиск" onClick={clear}
            className="text-muted w-5 h-5 shrink-0 flex items-center justify-center rounded-md active:opacity-60">
            <Icon name="close" size={12} />
          </button>
        )
      ) : desktop && <kbd>Ctrl K</kbd>}
    </div>
  );
}
