import type { Track } from '../types/track';

// ─── Base URL ────────────────────────────────────────────────────────────────
// Override via VITE_API_BASE_URL in .env (e.g. when running locally against
// a different host). Production default points at the Render deployment.
export const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'https://music-streaming-server-lfon.onrender.com';

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ─── Raw shape the server returns ─────────────────────────────────────────────
// Adjust these field names to match your actual Prisma model / controller output
interface RawTrack {
  id: number | string;
  title: string;
  artist: string;
  duration?: number;
  coverUrl?: string;
  imageUrl?: string;
  filePath?: string;
  streamUrl?: string;
  album?: string;
  genre?: string;
}

function normalise(raw: RawTrack): Track {
  return {
    id: raw.id,
    title: raw.title ?? 'Unknown Title',
    artist: raw.artist ?? 'Unknown Artist',
    duration: raw.duration,
    album: raw.album,
    genre: raw.genre,
    // Cover — try both common field names
    coverUrl: raw.coverUrl ?? raw.imageUrl,
    // Stream URL — prefer server-provided field, fall back to constructing from id
    streamUrl: raw.streamUrl ?? `${BASE_URL}/tracks/${raw.id}`,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Fetch full track list */
export async function getTracks(): Promise<Track[]> {
  const data = await get<RawTrack[] | { tracks: RawTrack[] }>('/tracks');
  const list = Array.isArray(data) ? data : data.tracks ?? [];
  return list.map(normalise);
}

/** Search tracks by query string */
export async function searchTracks(query: string): Promise<Track[]> {
  if (!query.trim()) return getTracks();
  const encoded = encodeURIComponent(query.trim());
  const data = await get<RawTrack[] | { tracks: RawTrack[] }>(`/search?query=${encoded}`);
  const list = Array.isArray(data) ? data : data.tracks ?? [];
  return list.map(normalise);
}

/** Build a streaming URL for a given track id */
export function streamUrl(id: number | string): string {
  return `${BASE_URL}/tracks/${id}`;
}
