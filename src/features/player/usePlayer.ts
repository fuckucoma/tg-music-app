import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { DeviceCredentials, DevicePlatform } from '../../services/playback';
import type { PlayerStatus, Track } from '../../types/track';
import { AudioEngine } from './AudioEngine';
import { claimPlaybackIdentity } from './deviceIdentity';
import { initialPlaybackView, PlaybackSession } from './PlaybackSession';
import {
  cycleRepeat, emptyQueue, nextTrack, previousTrack, selectTrack, toggleShuffle,
  type PlaybackQueue,
} from './PlayerStore';

const volumeKey = 'tg_music_volume';

function savedVolume() {
  try {
    const stored = localStorage.getItem(volumeKey);
    const value = stored === null ? 1 : Number(stored);
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
  } catch {
    return 1;
  }
}

function useLocalPlayer(enabled: boolean) {
  const [queue, setQueue] = useState(emptyQueue);
  const [status, setStatus] = useState<PlayerStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(savedVolume);
  const queueRef = useRef(queue);
  const volumeRef = useRef(volume);
  const engineRef = useRef<AudioEngine | null>(null);

  const updateQueue = useCallback((next: PlaybackQueue) => {
    queueRef.current = next;
    setQueue(next);
  }, []);

  const load = useCallback((next: PlaybackQueue | null) => {
    const engine = engineRef.current;
    if (!engine || !next) return;
    updateQueue(next);
    engine.load(next.tracks[next.index]);
  }, [updateQueue]);

  const playNext = useCallback(() => {
    load(nextTrack(queueRef.current, false));
  }, [load]);

  const playPrev = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.currentTime > 3) {
      engine.seek(0);
      return;
    }
    load(previousTrack(queueRef.current));
  }, [load]);

  useLayoutEffect(() => {
    if (!enabled) {
      updateQueue(emptyQueue);
      setStatus('idle');
      setProgress(0);
      setDuration(0);
      return;
    }
    const engine = new AudioEngine({
      onStatus: setStatus,
      onProgress: setProgress,
      onDuration: setDuration,
      onEnded: () => {
        if (queueRef.current.repeat === 'one') engine.restart();
        else load(nextTrack(queueRef.current, true));
      },
      onPrevious: playPrev,
      onNext: playNext,
    }, volumeRef.current);
    engineRef.current = engine;
    return () => {
      engineRef.current = null;
      engine.dispose();
    };
  }, [enabled, load, playNext, playPrev, updateQueue]);

  const play = useCallback((track: Track, trackList?: Track[]) => {
    const currentQueue = queueRef.current;
    if (currentQueue.tracks[currentQueue.index]?.id === track.id) {
      engineRef.current?.togglePlayback();
      return;
    }
    load(selectTrack(currentQueue, track, trackList));
  }, [load]);

  const seek = useCallback((ratio: number) => engineRef.current?.seek(ratio), []);

  const changeVolume = useCallback((value: number) => {
    if (!Number.isFinite(value)) return;
    const next = Math.min(1, Math.max(0, value));
    engineRef.current?.setVolume(next);
    volumeRef.current = next;
    setVolume(next);
    try { localStorage.setItem(volumeKey, String(next)); } catch { /* optional persistence */ }
  }, []);

  const handleShuffle = useCallback(() => updateQueue(toggleShuffle(queueRef.current)), [updateQueue]);
  const handleRepeat = useCallback(() => updateQueue(cycleRepeat(queueRef.current)), [updateQueue]);

  return {
    currentTrack: queue.tracks[queue.index] ?? null,
    queue: queue.tracks,
    queueIndex: queue.index,
    status,
    progress,
    duration,
    volume,
    shuffle: queue.shuffle,
    repeat: queue.repeat,
    play,
    playNext,
    playPrev,
    seek,
    changeVolume,
    toggleShuffle: handleShuffle,
    cycleRepeat: handleRepeat,
  };
}

const noop = () => {};
const emptyCatalog: readonly Track[] = [];
const initialView = () => initialPlaybackView;
const subscribeIdle = () => noop;

export interface PlaybackOptions {
  token?: string | null;
  userId?: number | null;
  deviceLabel?: string;
  platform?: DevicePlatform;
  catalog?: readonly Track[];
  onSessionExpired?: (error: unknown, token: string) => void;
}

export function usePlayerController({
  token = null, userId = null, deviceLabel = 'Web', platform = 'browser',
  catalog = emptyCatalog, onSessionExpired,
}: PlaybackOptions) {
  const authenticated = token !== null && userId !== null;
  const [identity, setIdentity] = useState<{
    userId: number;
    credentials: DeviceCredentials;
  } | null>(null);
  const [connection, setConnection] = useState<PlaybackSession | null>(null);
  const sessionRef = useRef<PlaybackSession | null>(null);
  const credentials = identity?.userId === userId ? identity.credentials : null;
  const synced = credentials && connection?.token === token && connection.deviceId === credentials.deviceId
    ? connection : null;
  const view = useSyncExternalStore(synced?.subscribe ?? subscribeIdle, synced?.getView ?? initialView);
  const legacyApi = authenticated && view.connection === 'unsupported';
  const local = useLocalPlayer(!authenticated || legacyApi);
  const latest = useRef({ catalog, volume: local.volume, onSessionExpired });
  useLayoutEffect(() => {
    latest.current = { catalog, volume: local.volume, onSessionExpired };
  }, [catalog, local.volume, onSessionExpired]);

  useLayoutEffect(() => {
    if (userId === null) {
      setIdentity(null);
      return;
    }
    const controller = new AbortController();
    let release: (() => void) | undefined;
    void claimPlaybackIdentity(userId, controller.signal).then((value) => {
      if (!value) return;
      if (controller.signal.aborted) {
        value.release();
        return;
      }
      release = value.release;
      setIdentity({ userId, credentials: value.credentials });
    });
    const close = (event: PageTransitionEvent) => {
      if (event.persisted) return;
      sessionRef.current?.dispose(false);
      release?.();
      controller.abort();
    };
    window.addEventListener('pagehide', close);
    return () => {
      controller.abort();
      sessionRef.current?.dispose();
      release?.();
      window.removeEventListener('pagehide', close);
    };
  }, [userId]);

  useLayoutEffect(() => {
    if (token === null || !credentials) {
      setConnection(null);
      return;
    }
    const session = new PlaybackSession(token, credentials, deviceLabel, platform, latest.current.volume,
      (error, expiredToken) => latest.current.onSessionExpired?.(error, expiredToken));
    session.rememberCatalog(latest.current.catalog);
    session.start();
    sessionRef.current = session;
    setConnection(session);
    return () => {
      session.dispose(false);
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [credentials, deviceLabel, platform, token]);

  useLayoutEffect(() => { synced?.rememberCatalog(catalog); }, [catalog, synced]);
  useLayoutEffect(() => { synced?.setVolume(local.volume); }, [local.volume, synced]);

  if (!authenticated || legacyApi) return {
    ...initialPlaybackView,
    ...local,
    mode: 'local' as const,
    connection: legacyApi ? view.connection : 'idle' as const,
    deviceId: credentials?.deviceId ?? '',
    takeOver: noop,
    clearNotice: noop,
    retryPlayback: noop,
    removeDevice: noop,
  };

  return {
    ...view,
    deviceId: credentials?.deviceId ?? '',
    volume: local.volume,
    changeVolume: local.changeVolume,
    play: synced?.play ?? noop,
    playNext: synced?.playNext ?? noop,
    playPrev: synced?.playPrev ?? noop,
    toggleShuffle: synced?.toggleShuffle ?? noop,
    cycleRepeat: synced?.cycleRepeat ?? noop,
    seek: synced?.seek ?? noop,
    takeOver: synced?.takeOver ?? noop,
    clearNotice: synced?.clearNotice ?? noop,
    retryPlayback: synced?.retryPlayback ?? noop,
    removeDevice: synced?.removeDevice ?? noop,
  };
}

export type Player = ReturnType<typeof usePlayerController>;
