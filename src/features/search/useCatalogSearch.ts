import { useMemo, useState } from 'react';
import { useTrackPages } from '../library/useTrackPages';
import type { Track } from '../../types/track';

export function useCatalogSearch(catalog: Track[], catalogRevision: number) {
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const term = query.trim();
  const pages = useTrackPages(term, `${catalogRevision}:${revision}`, Boolean(term), 280);
  const tracks = useMemo(() => {
    if (!term) return catalog;
    if (!pages.legacy) return pages.tracks;
    const matches = new Map(pages.tracks.map((track) => [track.id, track]));
    // Older servers search titles and artists only. The full catalog also supplies album matches.
    const needle = term.toLocaleLowerCase();
    for (const track of catalog) {
      if (track.album?.toLocaleLowerCase().includes(needle)) matches.set(track.id, track);
    }
    return Array.from(matches.values());
  }, [catalog, pages.legacy, pages.tracks, term]);

  return {
    ...pages, query, setQuery, tracks,
    retry: () => setRevision((value) => value + 1),
  };
}
