import type { PlayerStatus, Track } from '../../types/track';

interface AudioCallbacks {
  onStatus: (status: PlayerStatus) => void;
  onProgress: (progress: number) => void;
  onDuration: (duration: number) => void;
  onEnded: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onPlaybackBlocked?: () => void;
  onMediaPlay?: () => void;
  onMediaPause?: () => void;
  onMediaSeek?: (position: number) => void;
}

const mediaActions: MediaSessionAction[] = [
  'play', 'pause', 'stop', 'previoustrack', 'nexttrack', 'seekto', 'seekforward', 'seekbackward',
];

export class AudioEngine {
  private readonly audio = new Audio();
  private readonly mediaSession = navigator.mediaSession;
  private readonly listeners: Partial<Record<keyof HTMLMediaElementEventMap, EventListener>>;
  private hasTrack = false;
  private wantsPlayback = false;
  private requestId = 0;
  private pendingPosition: number | null = null;

  constructor(private readonly callbacks: AudioCallbacks, volume: number) {
    this.audio.preload = 'metadata';
    this.audio.volume = volume;
    this.listeners = {
      playing: () => {
        if (this.wantsPlayback && !this.audio.paused) {
          this.setStatus('playing');
        }
      },
      canplay: () => {
        if (this.wantsPlayback && !this.audio.paused) {
          this.setStatus('playing');
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
      timeupdate: () => this.updateProgress(),
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
    for (const [event, listener] of Object.entries(this.listeners)) {
      this.audio.addEventListener(event, listener);
    }
  }

  private get duration() {
    const { duration } = this.audio;
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  }

  get currentTime() {
    return this.audio.currentTime;
  }

  load(track: Track, { position = 0, playing = true } = {}) {
    this.requestId++;
    this.wantsPlayback = false;
    this.hasTrack = true;
    this.pendingPosition = position > 0 ? position : null;
    this.audio.src = track.streamUrl;
    this.audio.load();
    this.callbacks.onProgress(0);
    this.callbacks.onDuration(0);
    this.setMediaTrack(track);
    if (playing) this.resume();
    else this.setStatus('paused');
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
    for (const [event, listener] of Object.entries(this.listeners)) {
      this.audio.removeEventListener(event, listener);
    }
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    if (this.mediaSession) {
      this.mediaSession.metadata = null;
      this.mediaSession.playbackState = 'none';
      this.setMediaPosition();
      for (const action of mediaActions) this.setMediaAction(action, null);
    }
  }

  unlock() {
    if (this.hasTrack) return;
    this.audio.muted = true;
    const p = this.audio.play();
    if (p) {
      p.then(() => {
        if (!this.hasTrack) {
          this.audio.pause();
          this.audio.currentTime = 0;
        }
        this.audio.muted = false;
      }).catch(() => {
        this.audio.muted = false;
      });
    } else {
      this.audio.muted = false;
    }
  }

  resume() {
    if (!this.hasTrack || this.wantsPlayback) return;
    if (this.audio.error) this.audio.load();
    this.wantsPlayback = true;
    const requestId = ++this.requestId;
    this.setStatus('loading');
    void this.audio.play().catch((error: unknown) => {
      if (requestId !== this.requestId) return;
      this.wantsPlayback = false;
      this.setStatus('error');
      if (error instanceof DOMException && error.name === 'NotAllowedError') this.callbacks.onPlaybackBlocked?.();
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
