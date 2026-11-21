import type { RepeatMode } from '../features/player/PlayerStore';
import { ApiError, BASE_URL } from './api';

export type DevicePlatform = 'browser' | 'telegram';

export interface PlaybackDevice {
  id: string;
  name: string;
  platform: DevicePlatform;
  lastSeenAt: number;
  online: boolean;
}

export interface DeviceCredentials {
  deviceId: string;
  deviceKey: string;
}

export interface PlaybackReport {
  trackId: number;
  version: number;
  position: number;
}

export interface PlaybackSnapshot {
  serverTime: number;
  session: {
    version: number;
    activeDeviceId: string | null;
    pendingDeviceId: string | null;
    leaseUntil: number | null;
    trackId: number | null;
    queue: number[];
    queueIndex: number;
    playing: boolean;
    position: number;
    positionAt?: number;
    duration: number | null;
    shuffle: boolean;
    repeat: RepeatMode;
  };
  devices: PlaybackDevice[];
}

export type PlaybackCommand =
  | { type: 'play'; trackId?: number; queue?: number[]; position?: number }
  | { type: 'pause' | 'release'; position?: number }
  | { type: 'seek'; position: number }
  | { type: 'next' | 'previous' }
  | { type: 'ended'; trackId: number }
  | { type: 'setShuffle'; shuffle: boolean }
  | { type: 'setRepeat'; repeat: RepeatMode }
  | { type: 'transfer'; targetDeviceId: string };

export class PlaybackApiError extends ApiError {
  constructor(status: number, message: string, readonly snapshot?: PlaybackSnapshot) {
    super(status, message);
  }
}

async function fetchPlayback(path: string, token: string, init: RequestInit) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const result = await fetch(`${BASE_URL}/playback${path}`, { cache: 'no-store', ...init, headers });
  if (!result.ok) {
    const body = await result.json().catch(() => null);
    throw new PlaybackApiError(result.status, body?.error ?? `API error ${result.status}`, body?.snapshot);
  }
  return result;
}

export function playbackApi(token: string, credentials: DeviceCredentials) {
  async function post(path: string, payload: object, signal?: AbortSignal, keepalive?: boolean) {
    const result = await fetchPlayback(path, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...credentials, ...payload }),
      signal,
      keepalive,
    });
    return result.json() as Promise<PlaybackSnapshot>;
  }

  return {
    register: (name: string, platform: DevicePlatform, signal: AbortSignal) => post('/devices', { name, platform }, signal),
    heartbeat: (signal: AbortSignal, report?: PlaybackReport) => post('/heartbeat', { report }, signal),
    command: (expectedVersion: number, command: PlaybackCommand, signal?: AbortSignal, keepalive?: boolean) =>
      post('/command', { expectedVersion, command }, signal, keepalive),
    acknowledge: (expectedVersion: number, position: number | undefined, signal: AbortSignal) =>
      post('/ack', { expectedVersion, position }, signal),
    removeDevice: async (deviceId: string, signal: AbortSignal) => {
      const result = await fetchPlayback(`/devices/${encodeURIComponent(deviceId)}`, token, { method: 'DELETE', signal });
      return result.json() as Promise<PlaybackSnapshot>;
    },
    session: async (signal: AbortSignal) => {
      const result = await fetchPlayback('/session', token, { signal });
      return result.json() as Promise<PlaybackSnapshot>;
    },
    events: (signal: AbortSignal, onSnapshot: (snapshot: PlaybackSnapshot) => void, onActivity: () => void) =>
      readPlaybackEvents(token, signal, onSnapshot, onActivity),
  };
}

async function readPlaybackEvents(
  token: string,
  signal: AbortSignal,
  onSnapshot: (snapshot: PlaybackSnapshot) => void,
  onActivity: () => void,
) {
  const result = await fetchPlayback('/events', token, { signal, headers: { Accept: 'text/event-stream' } });
  if (!result.body || !result.headers.get('Content-Type')?.includes('text/event-stream')) {
    throw new Error('Playback events unavailable');
  }
  const reader = result.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      onActivity();
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? '';
      for (const event of events) {
        const fields = event.split(/\r?\n/);
        if (!fields.some((field) => field.startsWith('event:') && field.slice(6).trim() === 'session')) continue;
        const data = fields.filter((field) => field.startsWith('data:')).map((field) => field.slice(5).trimStart());
        if (data.length) onSnapshot(JSON.parse(data.join('\n')) as PlaybackSnapshot);
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
