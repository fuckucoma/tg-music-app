import { useCallback, useEffect, useRef, useState } from 'react';
import { getFavorites, toggleFavorite as saveFavorite } from '../../services/api';
import type { Track } from '../../types/track';

type FavoritesState = {
  token: string | null;
  tracks: Track[];
  pending: Set<number>;
  status: 'loading' | 'ready' | 'error';
  notice: string;
};

function initial(token: string | null): FavoritesState {
  return { token, tracks: [], pending: new Set(), status: token ? 'loading' : 'ready', notice: '' };
}

export function useFavorites(
  token: string | null,
  openAuth: () => void,
  checkError: (error: unknown, token: string) => void,
) {
  const [state, setState] = useState(() => initial(token));
  const [attempt, setAttempt] = useState(0);
  const session = useRef<AbortController>();
  const pending = useRef(new Set<number>());
  const clearNotice = () => setState((old) => ({ ...old, notice: '' }));
  const reloadFavorites = () => setAttempt((value) => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    session.current = controller;
    pending.current.clear();
    setState(initial(token));
    if (token) {
      getFavorites(token, controller.signal)
        .then((tracks) => {
          if (!controller.signal.aborted) setState({ ...initial(token), tracks, status: 'ready' });
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          checkError(error, token);
          setState({ ...initial(token), status: 'error' });
        });
    }
    return () => controller.abort();
  }, [token, attempt, checkError]);

  const visible = state.token === token ? state : initial(token);
  const toggleFavorite = useCallback(async (track: Track) => {
    if (!token) {
      openAuth();
      return;
    }
    const { id } = track;
    const controller = session.current;
    if (!controller || state.token !== token || state.status !== 'ready' || pending.current.has(id)) return;
    const previous = state.tracks.find((favorite) => favorite.id === id);
    pending.current.add(id);
    setState((old) => ({
      ...old, pending: new Set(pending.current),
      tracks: previous ? old.tracks.filter((favorite) => favorite.id !== id) : [track, ...old.tracks],
    }));
    try {
      await saveFavorite(token, id, Boolean(previous));
    } catch (error) {
      if (controller.signal.aborted) return;
      checkError(error, token);
      setState((old) => ({
        ...old,
        tracks: previous ? [previous, ...old.tracks] : old.tracks.filter((favorite) => favorite.id !== id),
        notice: 'Не удалось изменить избранное. Попробуйте ещё раз.',
      }));
    } finally {
      if (!controller.signal.aborted) {
        pending.current.delete(id);
        setState((old) => ({ ...old, pending: new Set(pending.current) }));
      }
    }
  }, [token, state, openAuth, checkError]);

  return {
    favorites: visible.tracks,
    favoriteIds: new Set(visible.tracks.map((track) => track.id)),
    pendingIds: visible.pending,
    canToggle: !token || visible.status === 'ready',
    favoritesLoading: visible.status === 'loading',
    favoritesError: visible.status === 'error' ? 'Не удалось загрузить избранное.' : '',
    reloadFavorites, toggleFavorite, notice: visible.notice, clearNotice,
  };
}
