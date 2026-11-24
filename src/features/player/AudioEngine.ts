import type { PlayerStatus, Track } from '../../types/track';

interface AudioCallbacks {
  onStatus: (status: PlayerStatus) => void;
  onProgress: (progress: number) => void;
  onDuration: (duration: number) => void;
  onEnded: () => void;
  onNext: () => void;
  onPrevious: () => void;
  canPlay?: () => boolean;
  onPlaybackBlocked?: () => void;
  onMediaPlay?: () => void;
  onMediaPause?: () => void;
  onMediaSeek?: (position: number) => void;
}

const mediaActions: MediaSessionAction[] = [
  'play', 'pause', 'stop', 'previoustrack', 'nexttrack', 'seekto', 'seekforward', 'seekbackward',
];

export function recordPlaybackTiming(name: string, start: number) {
  const entry = `playback:${name}`;
  try {
    performance.clearMeasures(entry);
    performance.measure(entry, { start });
  } catch {
    // Some WebViews only support the original User Timing API.
  }
}

const audioLoadTimes = new WeakMap<HTMLAudioElement, number>();

function onAudioReady(event: Event) {
  const audio = event.currentTarget as HTMLAudioElement;
  const startedAt = audioLoadTimes.get(audio);
  if (startedAt !== undefined) recordPlaybackTiming('audio-ready', startedAt);
  audioLoadTimes.delete(audio);
}

function loadSource(audio: HTMLAudioElement, url?: string) {
  audioLoadTimes.set(audio, performance.now());
  audio.addEventListener('canplay', onAudioReady, { once: true });
  if (url !== undefined) audio.src = url;
  audio.load();
}

export function preloadAudio(url: string) {
  const audio = new Audio();
  audio.preload = 'auto';
  loadSource(audio, url);
  return audio;
}

export function unloadAudio(audio: HTMLAudioElement) {
  audio.removeEventListener('canplay', onAudioReady);
  audioLoadTimes.delete(audio);
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
}

export class AudioEngine {
  private audio: HTMLAudioElement;
  private readonly mediaSession = navigator.mediaSession;
  private readonly listeners: Partial<Record<keyof HTMLMediaElementEventMap, EventListener>>;
  private hasTrack = false;
  private wantsPlayback = false;
  private requestId = 0;
  private pendingPosition: number | null = null;

  constructor(private readonly callbacks: AudioCallbacks, volume: number, audio = new Audio()) {
    this.audio = audio;
    if (!audio.src) audio.preload = 'metadata';
    audio.volume = volume;
    this.listeners = {
      playing: () => {
        if (this.wantsPlayback && !this.audio.paused) {
          if (this.callbacks.canPlay?.() === false) this.pause();
          else this.setStatus('playing');
        }
      },
      pause: () => {
        if (this.hasTrack && this.audio.paused && !this.audio.ended && this.wantsPlayback) {
          this.pause();
        }
      },
      waiting: () => {
        if (this.wantsPlayback && !this.audio.paused && this.audio.readyState < 3) {
          this.setStatus('loading');
        }
      },
      timeupdate: () => {
        if (this.wantsPlayback && this.callbacks.canPlay?.() === false) this.pause();
        this.updateProgress();
      },
      durationchange: () => {
        this.callbacks.onDuration(this.duration);
        if (this.pendingPosition !== null && this.duration) this.seekTo(this.pendingPosition);
        this.updateProgress();
      },
      ended: () => {
        if (!this.wantsPlayback || !this.audio.ended) return;
        this.requestId++;
        this.wantsPlayback = false;
        this.setStatus('paused');
        this.callbacks.onEnded();
      },
      error: () => {
        if (!this.hasTrack || !this.audio.error) return;
        this.requestId++;
        this.wantsPlayback = false;
        this.setStatus('error');
      },
    };
    this.listen(audio);
  }

  private listen(audio: HTMLAudioElement) {
    for (const [event, listener] of Object.entries(this.listeners)) audio.addEventListener(event, listener);
  }

  private unlisten(audio: HTMLAudioElement) {
    for (const [event, listener] of Object.entries(this.listeners)) audio.removeEventListener(event, listener);
  }

  private get duration() {
    const { duration } = this.audio;
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  }

  get currentTime() {
    return this.audio.currentTime;
  }

  get canPreloadNext() {
    const remaining = this.duration - this.currentTime;
    if (!this.wantsPlayback || this.audio.paused || remaining <= 0 || remaining > 20) return false;
    const { buffered } = this.audio;
    const needed = this.currentTime + Math.min(8, remaining);
    for (let i = 0; i < buffered.length; i++) {
      if (buffered.start(i) <= this.currentTime && buffered.end(i) >= needed - 0.05) return true;
    }
    return false;
  }

  load(track: Track, { position = 0, playing = true, prepared }: {
    position?: number; playing?: boolean; prepared?: HTMLAudioElement;
  } = {}) {
    this.requestId++;
    this.wantsPlayback = false;
    const previous = this.hasTrack && prepared ? this.audio : null;
    this.hasTrack = true;
    this.pendingPosition = position > 0 ? position : null;
    this.callbacks.onProgress(0);
    this.callbacks.onDuration(0);
    this.setMediaTrack(track);
    if (prepared) {
      if (prepared !== this.audio) this.replaceAudio(prepared);
      // The preload may have raised durationchange before the player attached.
      this.callbacks.onDuration(this.duration);
      if (this.pendingPosition !== null && this.duration) this.seekTo(this.pendingPosition);
      this.updateProgress();
    } else {
      this.audio.preload = 'metadata';
      loadSource(this.audio, track.streamUrl);
    }
    if (playing) this.play(previous ? () => {
      const resumeAt = this.pendingPosition ?? this.currentTime;
      this.replaceAudio(previous);
      this.load(track, { position: resumeAt });
    } : undefined);
    else this.setStatus('paused');
  }

  private replaceAudio(audio: HTMLAudioElement) {
    const old = this.audio;
    audio.volume = old.volume;
    this.unlisten(old);
    unloadAudio(old);
    this.audio = audio;
    this.listen(audio);
  }

  togglePlayback() {
    if (this.wantsPlayback) this.pause();
    else this.resume();
  }

  restart() {
    this.seek(0);
    this.resume();
  }

  seek(ratio: number) {
    if (Number.isFinite(ratio)) this.seekTo(ratio * this.duration);
  }

  setVolume(volume: number) {
    this.audio.volume = volume;
  }

  dispose() {
    this.hasTrack = false;
    this.wantsPlayback = false;
    this.requestId++;
    this.unlisten(this.audio);
    unloadAudio(this.audio);
    if (this.mediaSession) {
      this.mediaSession.metadata = null;
      this.mediaSession.playbackState = 'none';
      this.setMediaPosition();
      for (const action of mediaActions) this.setMediaAction(action, null);
    }
  }

  resume() {
    this.play();
  }

  private play(onPreloadBlocked?: () => void) {
    if (!this.hasTrack || this.wantsPlayback || this.callbacks.canPlay?.() === false) return;
    if (this.audio.error) {
      if (this.pendingPosition === null && this.currentTime > 0) this.pendingPosition = this.currentTime;
      loadSource(this.audio);
    }
    this.wantsPlayback = true;
    const requestId = ++this.requestId;
    this.setStatus('loading');
    void this.audio.play().catch((error: unknown) => {
      if (requestId !== this.requestId) return;
      this.wantsPlayback = false;
      const blocked = typeof error === 'object' && error !== null && 'name' in error && error.name === 'NotAllowedError';
      if (blocked && onPreloadBlocked && this.callbacks.canPlay?.() !== false) {
        onPreloadBlocked();
        return;
      }
      this.setStatus('error');
      if (blocked) this.callbacks.onPlaybackBlocked?.();
    });
  }

  pause() {
    if (!this.hasTrack) return;
    this.requestId++;
    this.wantsPlayback = false;
    this.audio.pause();
    this.setStatus('paused');
  }

  private setStatus(status: PlayerStatus) {
    this.callbacks.onStatus(status);
    if (this.mediaSession && status !== 'loading') {
      this.mediaSession.playbackState = status === 'playing' ? 'playing' : 'paused';
    }
  }

  seekTo(seconds: number) {
    if (!this.hasTrack || !Number.isFinite(seconds)) return;
    if (!this.duration) {
      this.pendingPosition = Math.max(0, seconds);
      return;
    }
    this.pendingPosition = null;
    this.audio.currentTime = Math.min(this.duration, Math.max(0, seconds));
    this.updateProgress();
  }

  private updateProgress() {
    const duration = this.duration;
    if (!this.hasTrack || !duration) return;
    const position = Math.min(duration, Math.max(0, this.currentTime));
    this.callbacks.onProgress(position / duration);
    this.setMediaPosition({ duration, position, playbackRate: this.audio.playbackRate });
  }

  private setMediaTrack(track: Track) {
    const session = this.mediaSession;
    if (!session) return;
    this.setMediaPosition();
    if (typeof MediaMetadata !== 'undefined') {
      try {
        session.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist,
          album: track.album,
          artwork: track.coverUrl ? [{ src: track.coverUrl }] : [],
        });
      } catch {
        session.metadata = null;
      }
    }
    const play = this.callbacks.onMediaPlay ?? (() => this.resume());
    const pause = this.callbacks.onMediaPause ?? (() => this.pause());
    const seek = this.callbacks.onMediaSeek ?? ((position: number) => this.seekTo(position));
    this.setMediaAction('play', play);
    this.setMediaAction('pause', pause);
    this.setMediaAction('stop', () => {
      pause();
      seek(0);
    });
    this.setMediaAction('previoustrack', () => this.callbacks.onPrevious());
    this.setMediaAction('nexttrack', () => this.callbacks.onNext());
    this.setMediaAction('seekto', ({ seekTime }) => {
      if (seekTime !== undefined) seek(seekTime);
    });
    this.setMediaAction('seekforward', ({ seekOffset }) => seek(this.currentTime + (seekOffset ?? 10)));
    this.setMediaAction('seekbackward', ({ seekOffset }) => seek(this.currentTime - (seekOffset ?? 10)));
  }

  private setMediaAction(action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
    try {
      this.mediaSession?.setActionHandler(action, handler);
    } catch {
      // Action support varies by browser and operating system.
    }
  }

  private setMediaPosition(position?: MediaPositionState) {
    try {
      this.mediaSession?.setPositionState?.(position);
    } catch {
      // Some media sessions reject position updates while switching tracks.
    }
  }
}
