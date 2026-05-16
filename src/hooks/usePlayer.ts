import { useCallback, useEffect, useRef, useState } from 'react';
import type { Track } from '../types/track';
import type { PlayerStatus } from '../types/track';

export type RepeatMode = 'none' | 'all' | 'one';

function setMediaSession(
  track: Track,
  audio: HTMLAudioElement,
  onPrev: () => void,
  onNext: () => void,
) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album ?? '',
    artwork: track.coverUrl
      ? [{ src: track.coverUrl, sizes: '512x512', type: 'image/jpeg' }]
      : [],
  });
  navigator.mediaSession.setActionHandler('play', () => audio.play().catch(() => {}));
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('stop', () => { audio.pause(); audio.currentTime = 0; });
  navigator.mediaSession.setActionHandler('previoustrack', onPrev);
  navigator.mediaSession.setActionHandler('nexttrack', onNext);
  navigator.mediaSession.setActionHandler('seekto', (d) => {
    if (d.seekTime !== undefined) audio.currentTime = d.seekTime;
  });
  navigator.mediaSession.setActionHandler('seekforward', (d) => {
    audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + (d.seekOffset ?? 10));
  });
  navigator.mediaSession.setActionHandler('seekbackward', (d) => {
    audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset ?? 10));
  });
}

export function usePlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [status, setStatus] = useState<PlayerStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('tg_music_volume');
    return saved ? parseFloat(saved) : 1;
  });
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('none');

  // Refs so event callbacks always see latest state without stale closures
  const queueRef = useRef<Track[]>([]);
  const queueIndexRef = useRef(-1);
  const shuffleRef = useRef(false);
  const repeatRef = useRef<RepeatMode>('none');
  const shuffledOrderRef = useRef<number[]>([]);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);
  useEffect(() => { repeatRef.current = repeat; }, [repeat]);

  // ── Shuffle order builder ─────────────────────────────────
  const buildShuffleOrder = useCallback((length: number, startIdx: number) => {
    const rest = Array.from({ length }, (_, i) => i).filter(i => i !== startIdx);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    shuffledOrderRef.current = [startIdx, ...rest];
  }, []);

  // Forward-declare so loadAtIndex can reference them in setMediaSession
  const playNextRef = useRef<(fromEnded?: boolean) => void>(() => {});
  const playPrevRef = useRef<() => void>(() => {});

  // ── Internal: load track at queue index ──────────────────
  const loadAtIndex = useCallback((idx: number, autoPlay = true) => {
    const audio = audioRef.current;
    const q = queueRef.current;
    if (!audio || idx < 0 || idx >= q.length) return;

    const track = q[idx];
    audio.pause();
    setCurrentTrack(track);
    setQueueIndex(idx);
    queueIndexRef.current = idx;
    setStatus('loading');
    setProgress(0);
    setDuration(0);
    audio.src = track.streamUrl;
    audio.load();

    setMediaSession(track, audio, playPrevRef.current, () => playNextRef.current(false));

    if (autoPlay) audio.play().catch(() => setStatus('error'));
  }, []);

  // ── Audio element — created once ─────────────────────────
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.volume = volume;
    audioRef.current = audio;

    const onPlay = () => setStatus('playing');
    const onPause = () => setStatus('paused');
    const onError = () => setStatus('error');
    const onWaiting = () => setStatus('loading');
    const onCanPlay = () => setStatus(s => s === 'loading' ? 'playing' : s);
    const onTimeUpdate = () => {
      if (!audio.duration) return;
      setProgress(audio.currentTime / audio.duration);
      if ('mediaSession' in navigator && isFinite(audio.duration)) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate,
            position: audio.currentTime,
          });
        } catch {}
      }
    };
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onEnded = () => {
      if (repeatRef.current === 'one') {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        playNextRef.current(true);
      }
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);

    return () => {
      audio.pause();
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Next ─────────────────────────────────────────────────
  const playNext = useCallback((fromEnded = false) => {
    const q = queueRef.current;
    const idx = queueIndexRef.current;
    if (q.length === 0) return;

    if (shuffleRef.current) {
      const order = shuffledOrderRef.current;
      const pos = order.indexOf(idx);
      const nextPos = pos + 1;
      if (nextPos >= order.length) {
        if (repeatRef.current === 'all' || !fromEnded) {
          buildShuffleOrder(q.length, order[0]);
          loadAtIndex(shuffledOrderRef.current[0]);
        }
      } else {
        loadAtIndex(order[nextPos]);
      }
      return;
    }

    const next = idx + 1;
    if (next >= q.length) {
      if (repeatRef.current === 'all' || !fromEnded) loadAtIndex(0);
    } else {
      loadAtIndex(next);
    }
  }, [loadAtIndex, buildShuffleOrder]);

  // ── Prev ─────────────────────────────────────────────────
  const playPrev = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const q = queueRef.current;
    const idx = queueIndexRef.current;
    if (q.length === 0) return;

    if (shuffleRef.current) {
      const order = shuffledOrderRef.current;
      const pos = order.indexOf(idx);
      loadAtIndex(order[Math.max(0, pos - 1)]);
      return;
    }
    loadAtIndex(Math.max(0, idx - 1));
  }, [loadAtIndex]);

  // Wire refs so onEnded / mediaSession always call latest versions
  useEffect(() => { playNextRef.current = playNext; }, [playNext]);
  useEffect(() => { playPrevRef.current = playPrev; }, [playPrev]);

  // ── Public play — called from track list ─────────────────
  const play = useCallback((track: Track, trackList?: Track[]) => {
    const audio = audioRef.current;
    if (!audio) return;

    // Same track — toggle
    if (currentTrack?.id === track.id) {
      if (audio.paused) audio.play().catch(() => setStatus('error'));
      else audio.pause();
      return;
    }

    const newQueue = trackList ?? queueRef.current;
    if (trackList) {
      setQueue(trackList);
      queueRef.current = trackList;
    }

    const idx = newQueue.findIndex(t => t.id === track.id);
    const resolvedIdx = idx >= 0 ? idx : 0;
    if (shuffleRef.current) buildShuffleOrder(newQueue.length, resolvedIdx);
    loadAtIndex(resolvedIdx);
  }, [currentTrack, loadAtIndex, buildShuffleOrder]);

  // ── Seek ─────────────────────────────────────────────────
  const seek = useCallback((ratio: number) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio);
  }, []);

  // ── Volume ───────────────────────────────────────────────
  const changeVolume = useCallback((v: number) => {
    if (audioRef.current) audioRef.current.volume = v;
    setVolume(v);
    localStorage.setItem('tg_music_volume', String(v));
  }, []);

  // ── Shuffle toggle ────────────────────────────────────────
  const toggleShuffle = useCallback(() => {
    setShuffle(s => {
      const next = !s;
      if (next) buildShuffleOrder(queueRef.current.length, queueIndexRef.current);
      return next;
    });
  }, [buildShuffleOrder]);

  // ── Repeat cycle: none → all → one ───────────────────────
  const cycleRepeat = useCallback(() => {
    setRepeat(r => r === 'none' ? 'all' : r === 'all' ? 'one' : 'none');
  }, []);

  return {
    currentTrack,
    queue,
    queueIndex,
    status,
    progress,
    duration,
    volume,
    shuffle,
    repeat,
    play,
    playNext,
    playPrev,
    seek,
    changeVolume,
    toggleShuffle,
    cycleRepeat,
  };
}