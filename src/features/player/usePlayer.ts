import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { DevicePlatform } from '../../services/playback';
import type { PlayerStatus, Track } from '../../types/track';
import { AudioEngine } from './AudioEngine';
import { createPlaybackDevice, initialPlaybackView, PlaybackSession } from './PlaybackSession';
import {
  cycleRepeat, emptyQueue, nextTrack, previousTrack, selectTrack, toggleShuffle,
  type PlaybackQueue,
} from './PlayerStore';

const volumeKey = 'tg_music_volume';

function savedVolume() {
  const stored = localStorage.getItem(volumeKey);
  const value = stored === null ? 1 : Number(stored);
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
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
    localStorage.setItem(volumeKey, String(next));
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
  const guest = useLocalPlayer(!authenticated);
  const credentials = useMemo(createPlaybackDevice, [userId]);
  const [connection, setConnection] = useState<{
    credentials: typeof credentials;
    session: PlaybackSession;
  } | null>(null);
  const latest = useRef({ catalog, volume: guest.volume, onSessionExpired });
  useLayoutEffect(() => {
    latest.current = { catalog, volume: guest.volume, onSessionExpired };
  }, [catalog, guest.volume, onSessionExpired]);

  useLayoutEffect(() => {
    if (token === null || userId === null) {
      setConnection(null);
      return;
    }
    const session = new PlaybackSession(token, credentials, deviceLabel, platform, latest.current.volume,
      (error, expiredToken) => latest.current.onSessionExpired?.(error, expiredToken));
    session.rememberCatalog(latest.current.catalog);
    session.start();
    setConnection({ credentials, session });
    return () => session.dispose();
  }, [credentials, deviceLabel, platform, token, userId]);

  const synced = connection?.credentials === credentials && connection.session.token === token ? connection.session : null;
  useLayoutEffect(() => { synced?.rememberCatalog(catalog); }, [catalog, synced]);
  useLayoutEffect(() => { synced?.setVolume(guest.volume); }, [guest.volume, synced]);

  const view = useSyncExternalStore(synced?.subscribe ?? subscribeIdle, synced?.getView ?? initialView);
  if (!authenticated) return {
    ...initialPlaybackView,
    ...guest,
    mode: 'local' as const,
    connection: 'idle' as const,
    deviceId: credentials.deviceId,
    takeOver: noop,
    clearNotice: noop,
    retryPlayback: noop,
  };

  return {
    ...view,
    deviceId: credentials.deviceId,
    volume: guest.volume,
    changeVolume: guest.changeVolume,
    play: synced?.play ?? noop,
    playNext: synced?.playNext ?? noop,
    playPrev: synced?.playPrev ?? noop,
    toggleShuffle: synced?.toggleShuffle ?? noop,
    cycleRepeat: synced?.cycleRepeat ?? noop,
    seek: synced?.seek ?? noop,
    takeOver: synced?.takeOver ?? noop,
    clearNotice: synced?.clearNotice ?? noop,
    retryPlayback: synced?.retryPlayback ?? noop,
  };
}

export type Player = ReturnType<typeof usePlayerController>;
