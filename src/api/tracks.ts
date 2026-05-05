export const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'https://music-streaming-server-lfon.onrender.com';

// ── Token storage ─────────────────────────────────────────
const TOKEN_KEY = 'tg_music_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// ── Auth ──────────────────────────────────────────────────
export async function login(email: string, password: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Login failed');
  }
  const { token } = await res.json();
  setToken(token);
}

// ── Authenticated fetch ───────────────────────────────────
async function authGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (res.status === 401) {
    clearToken();
    throw new Error('UNAUTHORIZED');
  }
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// ── Tracks ────────────────────────────────────────────────
interface RawTrack {
  id: number | string;
  title: string;
  artist: string;
  duration?: number;
  coverUrl?: string;
  imageUrl?: string;
  streamUrl?: string;
  album?: string;
}

function normalise(raw: RawTrack) {
  return {
    id: raw.id,
    title: raw.title ?? 'Unknown',
    artist: raw.artist ?? 'Unknown',
    duration: raw.duration,
    album: raw.album,
    coverUrl: raw.coverUrl ?? raw.imageUrl,
    streamUrl: raw.streamUrl ?? `${BASE_URL}/tracks/${raw.id}`,
  };
}

export async function getTracks() {
  const data = await authGet<RawTrack[] | { tracks: RawTrack[] }>('/tracks');
  const list = Array.isArray(data) ? data : data.tracks ?? [];
  return list.map(normalise);
}

export async function searchTracks(query: string) {
  if (!query.trim()) return getTracks();
  const data = await authGet<RawTrack[] | { tracks: RawTrack[] }>(
    `/search?query=${encodeURIComponent(query.trim())}`
  );
  const list = Array.isArray(data) ? data : data.tracks ?? [];
  return list.map(normalise);
}