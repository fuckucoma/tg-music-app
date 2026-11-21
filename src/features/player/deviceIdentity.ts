import type { DeviceCredentials } from '../../services/playback';

interface PlaybackIdentity {
  credentials: DeviceCredentials;
  release: () => void;
}

const storagePrefix = 'underlab_playback_device_';
const deviceIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keyPattern = /^[a-zA-Z0-9_-]{32,128}$/;
const noop = () => {};

function hex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function createPlaybackDevice(): DeviceCredentials {
  const uuid = crypto.getRandomValues(new Uint8Array(16));
  uuid[6] = (uuid[6] & 0x0f) | 0x40;
  uuid[8] = (uuid[8] & 0x3f) | 0x80;
  const text = hex(uuid);
  const deviceId = [text.slice(0, 8), text.slice(8, 12), text.slice(12, 16), text.slice(16, 20), text.slice(20)].join('-');
  return { deviceId, deviceKey: hex(crypto.getRandomValues(new Uint8Array(32))) };
}

function readCredentials(storageKey: string): DeviceCredentials | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
    if (typeof stored?.deviceId === 'string' && deviceIdPattern.test(stored.deviceId) &&
        typeof stored.deviceKey === 'string' && keyPattern.test(stored.deviceKey)) {
      return { deviceId: stored.deviceId, deviceKey: stored.deviceKey };
    }
  } catch {
    // Some embedded browsers do not expose sessionStorage.
  }
  return null;
}

function holdLock(locks: LockManager, deviceId: string, signal: AbortSignal): Promise<(() => void) | null> {
  return new Promise((resolve) => {
    const cancel = () => resolve(null);
    signal.addEventListener('abort', cancel, { once: true });
    const acquire = () => locks.request(`underlab-playback-${deviceId}`, { ifAvailable: true }, (lock) => {
      signal.removeEventListener('abort', cancel);
      if (!lock || signal.aborted) {
        resolve(null);
        return;
      }
      return new Promise<void>((release) => resolve(release));
    });
    void Promise.resolve().then(acquire).catch(() => {
      signal.removeEventListener('abort', cancel);
      resolve(null);
    });
  });
}

export async function claimPlaybackIdentity(userId: number, signal: AbortSignal): Promise<PlaybackIdentity | null> {
  if (signal.aborted) return null;
  let locks: LockManager | undefined;
  try { locks = navigator.locks; } catch { /* restricted browser context */ }
  const storageKey = `${storagePrefix}${userId}`;
  if (!locks) {
    // Copies of a tab inherit its sessionStorage. Without an exclusive lock,
    // never reuse a persisted credential whose original context may still run.
    return { credentials: createPlaybackDevice(), release: noop };
  }

  const stored = readCredentials(storageKey);
  let credentials = stored ?? createPlaybackDevice();
  let release = await holdLock(locks, credentials.deviceId, signal);
  if (!release && stored && !signal.aborted) {
    credentials = createPlaybackDevice();
    release = await holdLock(locks, credentials.deviceId, signal);
  }
  if (signal.aborted) {
    release?.();
    return null;
  }
  if (!release) return { credentials: createPlaybackDevice(), release: noop };
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(credentials));
  } catch {
    // The fresh identity remains isolated to this page if persistence is unavailable.
  }
  return { credentials, release };
}
