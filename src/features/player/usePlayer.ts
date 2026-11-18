import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerStatus, Track } from '../../types/track';
import { AudioEngine } from './AudioEngine';
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

export function usePlayerController() {
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

  useEffect(() => {
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
  }, [load, playNext, playPrev]);

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

export type Player = ReturnType<typeof usePlayerController>;
