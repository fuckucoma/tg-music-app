interface Props {
  page: { hasMore: boolean; loadingMore: boolean; moreError: string; loadMore: () => void };
  language: 'en' | 'ru';
}

export function TrackPageControls({ page, language }: Props) {
  if (!page.hasMore) return null;
  const ru = language === 'ru';
  return (
    <div className="flex flex-col items-center gap-2 py-4 text-sm" aria-busy={page.loadingMore}>
      {page.moreError && (
        <span role="alert">{ru ? page.moreError : 'Could not load more tracks.'}</span>
      )}
      <button type="button" className="rounded-xl border border-current px-4 py-2 disabled:opacity-50"
        disabled={page.loadingMore} onClick={page.loadMore}>
        {page.loadingMore ? (ru ? 'Загрузка…' : 'Loading…') : (ru ? 'Загрузить ещё треки' : 'Load more tracks')}
      </button>
    </div>
  );
}
