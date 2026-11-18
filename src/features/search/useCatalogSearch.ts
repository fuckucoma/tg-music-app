import { useEffect, useMemo, useState } from 'react';
import { searchTracks } from '../../services/api';
import type { Track } from '../../types/track';

type Result = { query: string; revision: number; tracks: Track[]; error: string };

export function useCatalogSearch(catalog: Track[], catalogRevision: number) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Result>();
  const [revision, setRevision] = useState(0);
  const term = query.trim();

  useEffect(() => {
    if (!term) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const tracks = await searchTracks(term, controller.signal);
        if (!controller.signal.aborted) setResult({ query: term, revision, tracks, error: '' });
      } catch {
        if (!controller.signal.aborted)
          setResult({ query: term, revision, tracks: [], error: 'Не удалось выполнить поиск.' });
      }
    }, 280);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [term, revision, catalogRevision]);

  const current = result?.query === term && result.revision === revision ? result : undefined;
  const tracks = useMemo(() => {
    if (!term) return catalog;
    const matches = new Map(current?.tracks.map((track) => [track.id, track]));
    // Older servers search titles and artists only. The full catalog also supplies album matches.
    const needle = term.toLocaleLowerCase();
    for (const track of catalog) {
      if (track.album?.toLocaleLowerCase().includes(needle)) matches.set(track.id, track);
    }
    return Array.from(matches.values());
  }, [catalog, current, term]);

  return {
    query, setQuery, tracks, loading: Boolean(term && !current), error: current?.error ?? '',
    retry: () => setRevision((value) => value + 1),
  };
}
