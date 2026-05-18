export const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'https://music-streaming-server-lfon.onrender.com';

// ── Token ─────────────────────────────────────────────────
const TOKEN_KEY = 'tg_music_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);
const tracksData = await getTracks();

// ── Auth — NOTE: server uses "username", not "email" ──────
export async function login(username: string, password: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Login failed');
  }
  const { token } = await res.json();
  setToken(token);
}

// ── Fetch (tracks are public — no auth needed) ────────────
async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}


// ── Raw shape from your trackController ───────────────────
interface RawTrack {
  id: number;
  title: string;
  artist: string;
  imageUrl?: string | null;
  filename: string;
  album?: string;
  genre?: string;
}

function normalise(raw: RawTrack) {
  return {
    id: raw.id,
    title: raw.title ?? 'Unknown',
    artist: raw.artist ?? 'Unknown',
    album: raw.album,
    genre: raw.genre,
    coverUrl: raw.imageUrl ?? undefined,           // already full URL from server
    streamUrl: `${BASE_URL}/tracks/${raw.id}/stream`,  // ← correct endpoint
  };
}

export async function getTracks() {
  const data = await get<RawTrack[]>('/tracks');
  return data.map(normalise);
}

let favsData = { favorites: [] };
try {
  favsData = await getFavorites();
} catch (e) {
  console.warn('Favorites failed, ignoring');
}

// Add these to your existing api/tracks.ts

export async function getFavorites() {
  const res = await fetch(`${BASE_URL}/favorites/get`, {
    headers: { Authorization: `Bearer ${getToken()}` }
  });
  if (!res.ok) throw new Error('Failed to fetch favorites');
  return res.json();
}

export async function toggleFavoriteApi(trackId: number, isCurrentlyFavorite: boolean) {
  const endpoint = isCurrentlyFavorite ? '/favorites/remove' : '/favorites/add';
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}` 
    },
    body: JSON.stringify({ trackId })
  });
  if (!res.ok) throw new Error('Failed to toggle favorite');
  return res.json();
}

export async function searchTracks(query: string) {
  if (!query.trim()) return getTracks();
  const data = await get<RawTrack[]>(`/tracks/search?query=${encodeURIComponent(query.trim())}`);
  return data.map(normalise);
}