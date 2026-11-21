import { useEffect, useRef, useState } from 'react';
import { getTrackPage } from '../../services/api';
import type { Track } from '../../types/track';

type Page = Awaited<ReturnType<typeof getTrackPage>>;
type Request = { key: string; controller: AbortController; fetchingMore: boolean };
type Result = Page & { request: Request; error: string; moreError: string; loadingMore: boolean };
const empty: Track[] = [];

export function useTrackPages(query: string, revision: string, enabled = true, delay = 0) {
  const key = JSON.stringify([query, revision]);
  const requestRef = useRef<Request>();
  const [result, setResult] = useState<Result>();

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const request = { key, controller, fetchingMore: false };
    requestRef.current = request;
    const timeout = window.setTimeout(async () => {
      try {
        const page = await getTrackPage(query, null, controller.signal);
        if (!controller.signal.aborted)
          setResult({ ...page, request, error: '', moreError: '', loadingMore: false });
      } catch {
        if (!controller.signal.aborted) setResult({
          tracks: empty, nextCursor: null, legacy: false, request, moreError: '', loadingMore: false,
          error: query ? 'Не удалось выполнить поиск.' : 'Не удалось загрузить треки.',
        });
      }
    }, delay);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
      if (requestRef.current === request) requestRef.current = undefined;
    };
  }, [enabled, key, query, delay]);

  const current = enabled && result?.request.key === key && result.request === requestRef.current
    ? result : undefined;
  const loadMore = async () => {
    if (!current || current.nextCursor === null || current.request.fetchingMore) return;
    const { request, nextCursor } = current;
    const { signal } = request.controller;
    request.fetchingMore = true;
    setResult({ ...current, loadingMore: true, moreError: '' });
    try {
      const page = await getTrackPage(query, nextCursor, signal);
      if (!signal.aborted) {
        const tracks = new Map(current.tracks.map((track) => [track.id, track]));
        for (const track of page.tracks) tracks.set(track.id, track);
        setResult({
          ...current, tracks: [...tracks.values()], nextCursor: page.nextCursor, loadingMore: false,
        });
      }
    } catch {
      if (!signal.aborted) setResult({ ...current, loadingMore: false, moreError: 'Не удалось загрузить ещё треки.' });
    } finally {
      request.fetchingMore = false;
    }
  };
  return {
    tracks: current?.tracks ?? empty,
    loading: enabled && !current,
    error: current?.error ?? '',
    hasMore: current != null && current.nextCursor !== null,
    loadingMore: current?.loadingMore ?? false,
    moreError: current?.moreError ?? '',
    legacy: current?.legacy ?? false,
    loadMore,
  };
}
