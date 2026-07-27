export const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'https://music-streaming-server-lfon.onrender.com';

// ── Token ─────────────────────────────────────────────────
const TOKEN_KEY = 'tg_music_token';
export const getToken   = () => localStorage.getItem(TOKEN_KEY);
export const setToken   = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// ── Telegram auth ─────────────────────────────────────────
export interface TelegramAuthResult {
  token: string;
  user: {
    id:              number;
    displayName:     string;
    profileImageUrl: string | null;
    telegramId:      string;
  };
}

export async function authWithTelegram(initData: string): Promise<TelegramAuthResult> {
  const res = await fetch(`${BASE_URL}/auth/telegram`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ initData }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Telegram auth failed');
  }
  const data: TelegramAuthResult = await res.json();
  setToken(data.token);
  return data;
}

// ── Classic login (fallback for browser testing) ──────────
export async function login(username: string, password: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/users/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Login failed');
  }
  const { token } = await res.json();
  setToken(token);
}

// ── Tracks (public endpoints) ─────────────────────────────
interface RawTrack {
  id: number; title: string; artist: string;
  imageUrl?: string | null; filename: string;
  album?: string; genre?: string; duration?: number;
}

function normalise(raw: RawTrack) {
  return {
    id:        raw.id,
    title:     raw.title  ?? 'Unknown',
    artist:    raw.artist ?? 'Unknown',
    album:     raw.album,
    genre:     raw.genre,
    duration:  raw.duration,
    coverUrl:  raw.imageUrl?.replace(/^http:\/\//, 'https://') ?? undefined,
    streamUrl: `${BASE_URL}/tracks/${raw.id}/stream`,
  };
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function getTracks() {
  return (await get<RawTrack[]>('/tracks')).map(normalise);
}

export async function searchTracks(query: string) {
  if (!query.trim()) return getTracks();
  return (await get<RawTrack[]>(`/tracks/search?query=${encodeURIComponent(query.trim())}`)).map(normalise);
}

// ── Favorites (auth required) ─────────────────────────────
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization:  `Bearer ${getToken()}`,
  };
}

export async function getFavorites() {
  const res = await fetch(`${BASE_URL}/favorites/get`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function toggleFavoriteApi(trackId: number, isCurrentlyFavorite: boolean) {
  const endpoint = isCurrentlyFavorite ? '/favorites/remove' : '/favorites/add';
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify({ trackId }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}