import type { Track } from '../types/track';

export const BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'https://music-streaming-server-lfon.onrender.com'
).replace(/\/$/, '');
const TOKEN_KEY = 'tg_music_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export interface Profile {
  id: number;
  username: string | null;
  displayName?: string | null;
  telegramName?: string | null;
  telegramId?: string | null;
  profileImageUrl?: string | null;
  bio?: string | null;
  email?: string | null;
  createdAt?: string;
  isAdmin?: boolean;
  hasPassword?: boolean;
}

function mediaUrl(value?: string | null) {
  if (!value) return undefined;
  try {
    const base = new URL(`${BASE_URL}/`, window.location.href);
    const url = new URL(value.replace(/^\/+/, ''), base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    if (url.protocol === 'http:' && window.location.protocol === 'https:') url.protocol = 'https:';
    return url.href;
  } catch {
    return undefined;
  }
}

async function request<T>(path: string, options?: RequestInit, token?: string): Promise<T> {
  const headers = new Headers(options?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, body?.error ?? `API error ${response.status}`);
  }
  return response.json();
}

function json(method: string, body: object, signal?: AbortSignal): RequestInit {
  return {
    method,
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function requestToken(path: string, body: object, signal?: AbortSignal) {
  const result = await request<{ token?: string }>(path, json('POST', body, signal));
  if (!result.token) throw new Error('Сервер не вернул данные для входа.');
  return result.token;
}

export const login = (username: string, password: string, signal?: AbortSignal) =>
  requestToken('/users/login', { username, password }, signal);
export const register = (username: string, password: string, signal?: AbortSignal) =>
  requestToken('/users/register', { username, password }, signal);
export const authWithTelegram = (initData: string, signal?: AbortSignal) =>
  requestToken('/auth/telegram', { initData }, signal);

interface TelegramLinkCode {
  code: string;
  expiresAt: string;
}

export interface TelegramLinkPreview {
  username: string;
  mergeRequired: boolean;
}

export function createTelegramLinkCode(token: string, password: string) {
  return request<TelegramLinkCode>('/auth/telegram/link-code', json('POST', { password }), token);
}

export function previewTelegramLink(code: string, initData: string) {
  return request<TelegramLinkPreview>('/auth/telegram/link/preview', json('POST', { code, initData }));
}

export function confirmTelegramLink(code: string, initData: string, confirmMerge: boolean) {
  return requestToken('/auth/telegram/link', { code, initData, confirmMerge });
}

export async function unlinkTelegram(token: string, password: string) {
  const result = await request<{ token: string }>('/auth/telegram/link', json('DELETE', { password }), token);
  if (!result.token) throw new Error('Сервер не вернул данные для входа.');
  return result.token;
}

export async function getProfile(token: string, signal?: AbortSignal): Promise<Profile> {
  const profile = await request<Profile>('/users/profile', { signal }, token);
  return { ...profile, profileImageUrl: mediaUrl(profile.profileImageUrl) };
}

export function logout(token: string, signal?: AbortSignal) {
  return request('/users/logout', { method: 'POST', signal }, token);
}

export interface LoginSession {
  id: string;
  method: 'password' | 'telegram';
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

export async function getLoginSessions(token: string, signal: AbortSignal) {
  const result = await request<{ sessions: LoginSession[] }>('/users/sessions', { signal }, token);
  return result.sessions;
}

export function revokeLoginSession(token: string, id: string) {
  return request<{ revoked: true }>(`/users/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }, token);
}

export async function uploadAvatar(token: string, file: File) {
  const body = new FormData();
  body.append('profileImage', file);
  const result = await request<{ profileImageUrl: string }>(
    '/users/uploadProfileImage',
    { method: 'POST', body },
    token,
  );
  return mediaUrl(result.profileImageUrl);
}

interface RawTrack {
  id: number;
  title?: string | null;
  artist?: string | null;
  imageUrl?: string | null;
  album?: string | null;
  genre?: string | null;
  duration?: number | null;
  streamUrl?: string | null;
}

function toTrack(raw: RawTrack): Track {
  return {
    id: raw.id,
    title: raw.title || 'Unknown',
    artist: raw.artist || 'Unknown',
    album: raw.album ?? undefined,
    genre: raw.genre ?? undefined,
    duration: raw.duration ?? undefined,
    coverUrl: mediaUrl(raw.imageUrl),
    streamUrl: mediaUrl(raw.streamUrl) ?? `${BASE_URL}/tracks/${raw.id}/stream`,
  };
}

export async function getTrackPage(query: string, before: number | null, signal: AbortSignal) {
  const params = new URLSearchParams({ limit: '40' });
  if (before !== null) params.set('before', String(before));
  if (query) params.set('query', query);
  const path = query ? '/tracks/search' : '/tracks';
  const page = await request<RawTrack[] | { items: RawTrack[]; nextCursor: number | null }>(
    `${path}?${params}`, { signal },
  );
  if (Array.isArray(page)) return { tracks: page.map(toTrack), nextCursor: null, legacy: true };
  return { tracks: page.items.map(toTrack), nextCursor: page.nextCursor, legacy: false };
}

export async function getTracksByIds(ids: number[], signal: AbortSignal) {
  const params = new URLSearchParams({ ids: ids.join(',') });
  return (await request<RawTrack[]>(`/tracks/by-ids?${params}`, { signal })).map(toTrack);
}

export async function getFavorites(token: string, signal: AbortSignal) {
  type Favorite = Omit<RawTrack, 'id'> & { trackId: number };
  const { favorites } = await request<{ favorites: Favorite[] }>('/favorites/get', { signal }, token);
  return favorites.map((favorite) => toTrack({ ...favorite, id: Number(favorite.trackId) }));
}

export function toggleFavorite(token: string, trackId: number, isFavorite: boolean) {
  const path = isFavorite ? '/favorites/remove' : '/favorites/add';
  return request(path, json('POST', { trackId }), token);
}
