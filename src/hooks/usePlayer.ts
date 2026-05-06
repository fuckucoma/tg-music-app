import { useCallback, useEffect, useRef, useState } from 'react';
import type { Track } from '../types/track';
import type { PlayerStatus } from '../types/track';

export function usePlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [status, setStatus] = useState<PlayerStatus>('idle');
  const [progress, setProgress] = useState(0);   // 0-1
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;

    const onPlay = () => setStatus('playing');
    const onPause = () => setStatus('paused');
    const onEnded = () => setStatus('idle');
    const onError = () => setStatus('error');
    const onWaiting = () => setStatus('loading');
    const onCanPlay = () => {
      setStatus(s => (s === 'loading' ? 'playing' : s));
    };
    const onTimeUpdate = () => {
      if (!audio.duration) return;
      setProgress(audio.currentTime / audio.duration);

      // Keep iOS lock screen seekbar in sync
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
  }, []);

  const play = useCallback((track: Track) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (currentTrack?.id === track.id) {
      // Toggle play/pause on same track
      if (audio.paused) {
        audio.play().catch(() => setStatus('error'));
      } else {
        audio.pause();
      }
      return;
    }

    // New track
    audio.pause();
    setCurrentTrack(track);
    setStatus('loading');
    setProgress(0);
    setDuration(0);
    audio.src = track.streamUrl;

    // Media Session — iOS lock screen / notification controls
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album ?? '',
        artwork: track.coverUrl
          ? [{ src: track.coverUrl, sizes: '512x512', type: 'image/jpeg' }]
          : [],
      });

      navigator.mediaSession.setActionHandler('play', () => {
        audio.play().catch(() => {});
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        audio.pause();
      });
      navigator.mediaSession.setActionHandler('stop', () => {
        audio.pause();
        audio.currentTime = 0;
      });

      // Seekbar drag in iOS notification
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          audio.currentTime = details.seekTime;
          if (audio.duration) setProgress(audio.currentTime / audio.duration);
        }
      });

      // Skip forward/back buttons in notification
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        audio.currentTime = Math.min(
          audio.duration || 0,
          audio.currentTime + (details.seekOffset ?? 10),
        );
      });
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        audio.currentTime = Math.max(
          0,
          audio.currentTime - (details.seekOffset ?? 10),
        );
      });
    }

    audio.load();
    audio.play().catch(() => setStatus('error'));
  }, [currentTrack]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const seek = useCallback((ratio: number) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio);
  }, []);

  const changeVolume = useCallback((v: number) => {
    if (audioRef.current) audioRef.current.volume = v;
    setVolume(v);
  }, []);

  return {
    currentTrack,
    status,
    progress,
    duration,
    volume,
    play,
    pause,
    seek,
    changeVolume,
  };
}