import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BASE_URL,
  clearToken,
  getFavorites,
  getToken,
  getTracks,
  toggleFavoriteApi,
} from '../api/tracks';
import type { Track } from '../types/track';

type Favorite = {
  trackId: number;
  title?: string;
  artist?: string;
  imageUrl?: string | null;
  album?: string;
};
const toTrack = (f: Favorite): Track => ({
  id: Number(f.trackId),
  title: f.title || 'Без названия',
  artist: f.artist || 'Неизвестный исполнитель',
  coverUrl: f.imageUrl?.replace(/^http:\/\//, 'https://'),
  album: f.album,
  streamUrl: `${BASE_URL}/tracks/${f.trackId}/stream`,
});

export function useDesktopLibrary() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [favorites, setFavorites] = useState<Track[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favoritesError, setFavoritesError] = useState('');
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  const pendingRef = useRef(new Set<number>());
  const [userName, setUserName] = useState('');
  const [authed, setAuthed] = useState(() => !!getToken());
  const [authOpen, setAuthOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const requestRef = useRef(0);
  const favoritesRequestRef = useRef(0);
  const openAuth = useCallback(() => setAuthOpen(true), []);
  const closeAuth = useCallback(() => setAuthOpen(false), []);
  const clearNotice = useCallback(() => setNotice(''), []);
  const expire = useCallback((token: string | null) => {
    if (!token || getToken() !== token) return;
    clearToken();
    setAuthed(false);
    setFavorites([]);
    setUserName('');
    setAuthOpen(true);
    setNotice('Сессия истекла. Войдите снова.');
  }, []);
  const reload = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError('');
    try {
      const result = await getTracks();
      if (request === requestRef.current) setTracks(result);
    } catch {
      if (request === requestRef.current) setError('Не удалось загрузить треки. Проверьте соединение.');
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, []);
  const reloadFavorites = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setFavorites([]);
      setFavoritesLoading(false);
      return;
    }
    const request = ++favoritesRequestRef.current;
    setFavoritesLoading(true);
    setFavoritesError('');
    try {
      const result = await getFavorites();
      if (getToken() === token && request === favoritesRequestRef.current)
        setFavorites((result.favorites || []).map(toTrack));
    } catch (e) {
      if (getToken() !== token) return;
      if ((e as Error).message === '401') expire(token);
      else setFavoritesError('Не удалось загрузить избранное.');
    } finally {
      if (getToken() === token) setFavoritesLoading(false);
    }
  }, [expire]);
  useEffect(() => {
    void reload();
    return () => {
      requestRef.current++;
    };
  }, [reload]);
  useEffect(() => {
    if (!authed) return;
    const token = getToken();
    if (!token) return;
    void reloadFavorites();
    fetch(`${BASE_URL}/users/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (getToken() !== token) return;
        if (response.status === 401) {
          expire(token);
          return;
        }
        if (response.ok) {
          const data = await response.json();
          if (getToken() === token)
            setUserName(data.displayName || data.telegramName || data.username || '');
        }
      })
      .catch(() => {});
  }, [authed, expire, reloadFavorites]);
  const loginSuccess = useCallback(() => {
    setAuthOpen(false);
    setNotice('');
    setAuthed(true);
  }, []);
  const logout = useCallback(() => {
    const token = getToken();
    if (token)
      void fetch(`${BASE_URL}/users/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    favoritesRequestRef.current++;
    clearToken();
    setAuthed(false);
    setFavorites([]);
    setFavoritesLoading(false);
    setFavoritesError('');
    setUserName('');
    pendingRef.current = new Set();
    setPendingIds(new Set());
  }, []);
  const toggleFavorite = useCallback(
    async (track: Track) => {
      const token = getToken();
      if (!token) {
        openAuth();
        return;
      }
      const id = Number(track.id);
      if (pendingRef.current.has(id)) return;
      favoritesRequestRef.current++;
      setFavoritesLoading(false);
      pendingRef.current.add(id);
      setPendingIds(new Set(pendingRef.current));
      const wasFavorite = favorites.some((f) => Number(f.id) === id);
      setFavorites((old) =>
        wasFavorite ? old.filter((f) => Number(f.id) !== id) : [...old, { ...track, id }],
      );
      try {
        await toggleFavoriteApi(id, wasFavorite);
      } catch (e) {
        if (getToken() !== token) return;
        if ((e as Error).message === '401') expire(token);
        else {
          setFavorites((old) =>
            wasFavorite
              ? [...old.filter((f) => Number(f.id) !== id), track]
              : old.filter((f) => Number(f.id) !== id),
          );
          setNotice('Не удалось изменить избранное. Попробуйте ещё раз.');
        }
      } finally {
        if (getToken() === token) {
          pendingRef.current.delete(id);
          setPendingIds(new Set(pendingRef.current));
        }
      }
    },
    [favorites, expire, openAuth],
  );
  return {
    tracks,
    loading,
    error,
    reload,
    favorites,
    favoritesLoading,
    favoritesError,
    reloadFavorites,
    favoriteIds: new Set(favorites.map((f) => Number(f.id))),
    pendingIds,
    toggleFavorite,
    userName,
    authed,
    authOpen,
    openAuth,
    closeAuth,
    loginSuccess,
    logout,
    notice,
    clearNotice,
  };
}
