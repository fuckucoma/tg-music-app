import { ApiError, getTracksByIds } from '../../services/api';
import {
  playbackApi, PlaybackApiError,
  type DeviceCredentials, type DevicePlatform, type PlaybackCommand, type PlaybackDevice, type PlaybackSnapshot,
} from '../../services/playback';
import type { PlayerStatus, Track } from '../../types/track';
import { AudioEngine, preloadAudio, recordPlaybackTiming, unloadAudio } from './AudioEngine';
import { newPlaybackId } from './deviceIdentity';
import { createPlaybackProgress } from './PlaybackProgress';
import type { RepeatMode } from './PlayerStore';

const activeHeartbeatInterval = 6_500;
const passiveHeartbeatInterval = 15_000;
const pollingHeartbeatInterval = 4_000;
const recoveryHeartbeatInterval = 2_000;
const requestTimeout = 12_000;
const deadlineMargin = 750;
const queueLimit = 300;
const nextRepeat: Record<RepeatMode, RepeatMode> = { none: 'all', all: 'one', one: 'none' };

export type PlaybackConnection = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'offline' | 'unsupported';

interface PlaybackView {
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  status: PlayerStatus;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  mode: 'local' | 'active' | 'remote';
  connection: PlaybackConnection;
  devices: PlaybackDevice[];
  activeDeviceId: string | null;
  pendingDeviceId: string | null;
  pendingPlayTrackId: number | null;
  needsGesture: boolean;
  removingDeviceId: string | null;
  notice: string | null;
}

export const initialPlaybackView: PlaybackView = {
  currentTrack: null, queue: [], queueIndex: -1, status: 'idle', duration: 0,
  shuffle: false, repeat: 'none', mode: 'remote', connection: 'connecting', devices: [],
  activeDeviceId: null, pendingDeviceId: null, pendingPlayTrackId: null,
  needsGesture: false, removingDeviceId: null, notice: null,
};

function sameDevices(a: PlaybackDevice[], b: PlaybackDevice[]) {
  return a.length === b.length && a.every((device, index) => {
    const previous = b[index];
    return device.id === previous.id && device.name === previous.name &&
      device.platform === previous.platform && device.online === previous.online;
  });
}

function isNewer(snapshot: PlaybackSnapshot, previous: PlaybackSnapshot | null) {
  if (!previous) return true;
  if (snapshot.session.version !== previous.session.version) return snapshot.session.version > previous.session.version;
  const lease = snapshot.session.leaseUntil ?? 0;
  const previousLease = previous.session.leaseUntil ?? 0;
  if (lease !== previousLease) return lease > previousLease;
  const anchor = snapshot.session.positionAt ?? 0;
  const previousAnchor = previous.session.positionAt ?? 0;
  if (anchor !== previousAnchor) return anchor > previousAnchor;
  if (snapshot.serverTime !== previous.serverTime) return snapshot.serverTime > previous.serverTime;
  return !sameDevices(snapshot.devices, previous.devices);
}

function sameTimeline(a: PlaybackSnapshot['session'], b: PlaybackSnapshot['session']) {
  if (a.trackId !== b.trackId || a.activeDeviceId !== b.activeDeviceId) return false;
  if (a.timelineRevision !== undefined && b.timelineRevision !== undefined) {
    return a.timelineRevision === b.timelineRevision;
  }
  // Legacy servers have no independent marker for a same-track seek.
  return a.version === b.version || a.positionAt === b.positionAt;
}

function leaseRemaining(snapshot: PlaybackSnapshot) {
  return (snapshot.session.leaseUntil ?? 0) - snapshot.serverTime;
}

type Operation = (signal: AbortSignal) => Promise<PlaybackSnapshot>;
type CreateCommand = (snapshot: PlaybackSnapshot) => PlaybackCommand | null;
type SeekIntent = { id: string; trackId: number; position: number; local: boolean; epoch: number };
type TransportIntent = { version: number; playing: boolean };
type TrackPreview = {
  track: Track;
  version: number;
  previousPosition: number;
  ended?: boolean;
  transport?: TransportIntent;
};

export class PlaybackSession {
  private readonly api;
  private readonly abort = new AbortController();
  private readonly tracks = new Map<number, Track>();
  private readonly listeners = new Set<() => void>();
  readonly progress = createPlaybackProgress();
  private view = initialPlaybackView;
  private snapshot: PlaybackSnapshot | null = null;
  private serverOffset = -Infinity;
  private leaseDeadline = 0;
  private leaseTimer = 0;
  private claimTimer = 0;
  private heartbeatTimer = 0;
  private progressTimer = 0;
  private reconnectTimer = 0;
  private seekTimer = 0;
  private engine: AudioEngine | null = null;
  private engineTrackId: number | null = null;
  private engineStatus: PlayerStatus = 'idle';
  private engineShouldPlay = false;
  private engineDuration = 0;
  private needsGesture = false;
  private registered = false;
  private refreshInFlight: Promise<void> | null = null;
  private refreshRequested = false;
  private ackInFlight = false;
  private handoffConfirmationInFlight = false;
  private ackPosition: number | undefined;
  private commands = Promise.resolve();
  private queuedCommands = 0;
  private trackPreview: TrackPreview | null = null;
  private startPosition: number | undefined;
  private eventsAbort: AbortController | null = null;
  private eventsHealthy = false;
  private reconnectDelay = 1_000;
  private nextCatalogAttempt = 0;
  private catalogRequestPending = false;
  private readonly unavailableTracks = new Set<number>();
  private lastReportAt = -Infinity;
  private endedSession: PlaybackSnapshot['session'] | null = null;
  private deferredSeek: SeekIntent | null = null;
  private pendingSeek: SeekIntent | null = null;
  private seekInFlight: string | null = null;
  private seekEpoch = 0;
  private transport: TransportIntent | null = null;
  private pendingPlay: { trackId: number } | null = null;
  private prepared: { track: Track; audio: HTMLAudioElement } | null = null;
  private playbackTiming: { trackId: number; name: string; startedAt: number } | null = null;
  private suspended = false;
  private generation = 0;
  private connection: PlaybackConnection = 'connecting';
  private removingDeviceId: string | null = null;
  private notice: string | null = null;

  constructor(
    readonly token: string,
    private readonly credentials: DeviceCredentials,
    private readonly deviceLabel: string,
    private readonly platform: DevicePlatform,
    private volume: number,
    private readonly onSessionExpired: (error: unknown, token: string) => void,
  ) {
    this.api = playbackApi(token, credentials);
  }

  get deviceId() { return this.credentials.deviceId; }
  private get running() { return !this.abort.signal.aborted && !this.suspended; }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getView = () => this.view;

  start() {
    const on = window.addEventListener.bind(window);
    on('pagehide', this.suspend);
    on('pageshow', this.wake);
    on('online', this.online);
    on('offline', this.offline);
    document.addEventListener('freeze', this.suspend);
    document.addEventListener('resume', this.wake);
    document.addEventListener('visibilitychange', this.checkLease);
    this.progressTimer = window.setInterval(this.tick, 250);
    void this.refresh();
    void this.connectEvents();
  }

  dispose(release = true) {
    this.stopSession(release);
    this.abort.abort();
    clearInterval(this.progressTimer);
    window.removeEventListener('pagehide', this.suspend);
    window.removeEventListener('pageshow', this.wake);
    window.removeEventListener('online', this.online);
    window.removeEventListener('offline', this.offline);
    document.removeEventListener('freeze', this.suspend);
    document.removeEventListener('resume', this.wake);
    document.removeEventListener('visibilitychange', this.checkLease);
    this.listeners.clear();
  }

  setVolume(volume: number) {
    this.volume = volume;
    this.engine?.setVolume(volume);
  }

  rememberCatalog(tracks: readonly Track[]) {
    for (const track of tracks) this.tracks.set(track.id, track);
    this.applyAudio();
    this.publish();
  }

  clearNotice = () => {
    this.notice = null;
    this.publish();
  };

  retryPlayback = () => {
    if (this.hasLease() && this.engineTrackId !== null) this.setPlaying(this.engineTrackId, true, true);
  };

  play = (track: Track, trackList?: Track[]) => {
    if (!this.running) return;
    if (this.engineTrackId === track.id && this.hasLease() && this.snapshot) {
      const playing = this.trackPreview ? this.engineShouldPlay
        : this.transportPlaying(this.snapshot) ?? this.isPlaying(this.snapshot);
      const retry = this.needsGesture || this.engineStatus === 'error' ||
        (playing && this.engineStatus === 'paused' && !this.transport && !this.endedSession);
      this.setPlaying(track.id, retry || !playing, retry);
      return;
    }
    for (const item of trackList ?? []) this.tracks.set(item.id, item);
    this.tracks.set(track.id, track);
    if (this.pendingPlay?.trackId === track.id) return;
    const pending = !this.snapshot || this.snapshot.session.trackId !== track.id || !this.isPlaying(this.snapshot)
      ? { trackId: track.id } : null;
    const timing = pending ? this.beginPlaybackTiming(track.id, 'play-to-playing') : null;
    if (pending) {
      this.pendingPlay = pending;
      this.publish();
    }

    const preview = this.snapshot?.session.trackId !== track.id ? this.previewTrack(track) : null;
    const session = this.snapshot?.session;
    if (pending && !this.engine && !session?.pendingDeviceId &&
        (!session?.activeDeviceId || session.activeDeviceId === this.deviceId ||
          (session.leaseUntil ?? 0) <= this.serverNow)) this.prepareAudio(track);
    this.send((snapshot) => {
      if (snapshot.session.trackId === track.id) {
        return this.isPlaying(snapshot) ? { type: 'pause' } : { type: 'play' };
      }
      const ids = [...new Set((trackList ?? this.view.queue).map((item) => item.id))];
      if (!ids.includes(track.id)) ids.push(track.id);
      const start = Math.max(0, Math.min(ids.indexOf(track.id), ids.length - queueLimit));
      return { type: 'play', trackId: track.id, queue: ids.slice(start, start + queueLimit) };
    }, (failed) => {
      if (this.pendingPlay === pending) {
        this.pendingPlay = null;
        if (pending && this.prepared?.track.id === track.id) this.clearPreparedAudio();
      }
      if (failed || !this.hasLease() || this.engineTrackId !== track.id) this.cancelPlaybackTiming(timing);
      this.finishPreview(preview);
    });
  };

  playNext = () => {
    const nextId = this.snapshot?.session.nextTrackId;
    const track = nextId == null ? undefined : this.tracks.get(nextId);
    const preview = track ? this.previewTrack(track) : null;
    this.send(() => ({ type: 'next' }), () => this.finishPreview(preview));
  };

  private previewTrack(track: Track): TrackPreview | null {
    const session = this.snapshot?.session;
    if (!session || session.anchorPosition === undefined || session.trackId === track.id ||
      !this.engine || this.engineTrackId !== session.trackId || !this.hasLease() ||
      this.queuedCommands || this.pendingSeek || this.trackPreview || this.needsGesture) return null;
    const preview = { track, version: session.version, previousPosition: this.engine.currentTime };
    this.trackPreview = preview;
    this.engineTrackId = track.id;
    this.engineShouldPlay = true;
    this.engine.load(track, { prepared: this.takePreparedAudio(track) });
    this.publish();
    return preview;
  }

  private finishPreview(preview: TrackPreview | null) {
    if (!preview || this.trackPreview !== preview) return;
    this.trackPreview = null;
    this.startPosition = preview.previousPosition;
    this.applyAudio();
  }

  private prepareAudio(track: Track) {
    if (this.prepared?.track.id === track.id && this.prepared.track.streamUrl === track.streamUrl) return;
    this.clearPreparedAudio();
    this.prepared = { track, audio: preloadAudio(track.streamUrl) };
  }

  private clearPreparedAudio() {
    if (!this.prepared) return;
    unloadAudio(this.prepared.audio);
    this.prepared = null;
  }

  private takePreparedAudio(track: Track) {
    const prepared = this.prepared;
    if (prepared?.track.id !== track.id) return;
    if (prepared.track.streamUrl !== track.streamUrl || prepared.audio.error) {
      this.clearPreparedAudio();
      return;
    }
    this.prepared = null;
    return prepared.audio;
  }

  private prepareUpcomingTrack() {
    const nextId = this.snapshot?.session.endedTrackId;
    if (!this.engine || this.trackPreview || this.pendingPlay) return;
    if (this.prepared && this.prepared.track.id !== nextId) this.clearPreparedAudio();
    if (nextId == null || nextId === this.engineTrackId || !this.engine.canPreloadNext) return;
    const next = this.tracks.get(nextId);
    if (next) this.prepareAudio(next);
  }

  private beginPlaybackTiming(trackId: number, name: string) {
    return this.playbackTiming = { trackId, name, startedAt: performance.now() };
  }

  private cancelPlaybackTiming(timing: PlaybackSession['playbackTiming']) {
    if (this.playbackTiming === timing) this.playbackTiming = null;
  }
  playPrev = () => this.send(() => ({ type: 'previous' }));
  toggleShuffle = () => this.send(({ session }) => ({ type: 'setShuffle', shuffle: !session.shuffle }));
  cycleRepeat = () => this.send(({ session }) => ({ type: 'setRepeat', repeat: nextRepeat[session.repeat] }));
  takeOver = (targetDeviceId = this.deviceId) => this.send(() => ({ type: 'transfer', targetDeviceId }));

  removeDevice = (deviceId: string) => {
    const device = this.snapshot?.devices.find(({ id }) => id === deviceId);
    if (!this.running || this.removingDeviceId || !device || device.online || deviceId === this.deviceId ||
      deviceId === this.view.activeDeviceId || (this.view.activeDeviceId && deviceId === this.view.pendingDeviceId)) return;
    this.removingDeviceId = deviceId;
    this.publish();
    void this.request((signal) => this.api.removeDevice(deviceId, signal), false).then((error) => {
      this.removingDeviceId = null;
      if (!this.running) return;
      this.notice = error ? 'Не удалось удалить устройство. Обновите список и попробуйте ещё раз.' : null;
      this.publish();
    });
  };

  seek = (ratio: number) => {
    if (Number.isFinite(ratio)) this.queueSeek(this.view.duration * Math.min(1, Math.max(0, ratio)));
  };

  private queueSeek(position: number) {
    const session = this.snapshot?.session;
    const trackId = this.trackPreview?.track.id ?? session?.trackId;
    if (trackId == null || !this.view.duration || !Number.isFinite(position)) return;
    const seek: SeekIntent = {
      trackId, id: newPlaybackId(), position: Math.max(0, Math.min(this.view.duration, position)),
      local: session?.timelineRevision !== undefined && this.hasLease() && this.engineTrackId === trackId,
      epoch: this.seekEpoch,
    };
    this.pendingSeek = this.deferredSeek = seek;
    if (seek.local) this.engine?.seekTo(seek.position);
    this.publishProgress();
    clearTimeout(this.seekTimer);
    this.seekTimer = window.setTimeout(this.flushSeek, 120);
  }

  private flushSeek = () => {
    const seek = this.deferredSeek;
    if (!seek) return;
    clearTimeout(this.seekTimer);
    this.deferredSeek = null;
    this.enqueue(({ session }) => {
      if (seek.epoch !== this.seekEpoch || session.trackId !== seek.trackId || session.pendingDeviceId ||
        (seek.local && !this.hasLease())) return null;
      this.seekInFlight = seek.id;
      return { type: 'seek', position: seek.position, seekId: seek.id };
    }, (failed) => {
      if (this.seekInFlight === seek.id) this.seekInFlight = null;
      if (this.pendingSeek !== seek) return;
      this.pendingSeek = null;
      if (failed && seek.local) {
        this.applyAudio(true);
        this.refreshSoon();
      }
      this.publishProgress();
    }, true);
  };

  private cancelSeeks() {
    this.seekEpoch++;
    this.pendingSeek = this.deferredSeek = null;
    clearTimeout(this.seekTimer);
  }

  private transportPlaying(snapshot: PlaybackSnapshot) {
    return this.transport?.version === snapshot.session.version ? this.transport.playing : undefined;
  }

  private setPlaying(trackId: number, playing: boolean, retry = false) {
    const base = this.snapshot?.session;
    const preview = this.trackPreview?.track.id === trackId ? this.trackPreview : null;
    const local = base && (base.trackId === trackId || preview) && this.hasLease() && this.engineTrackId === trackId;
    const position = local && this.engineDuration ? this.engine?.currentTime : undefined;
    const intent = local ? { version: base.version, playing } : null;
    if (intent) {
      if (playing) {
        this.needsGesture = false;
        this.endedSession = null;
      }
      if (preview) {
        preview.transport = intent;
        this.engineShouldPlay = playing;
        if (playing) this.engine?.resume();
        else this.engine?.pause();
      } else {
        this.transport = intent;
        this.applyAudio(false, retry);
      }
      this.publish();
    }
    this.send((snapshot) => {
      if (snapshot.session.trackId !== trackId || (local && !this.hasLease())) return null;
      if (playing === this.isPlaying(snapshot)) return null;
      if (playing) return { type: 'play' };
      const sameTrack = base && sameTimeline(base, snapshot.session);
      return { type: 'pause', position: sameTrack || (intent && this.transport === intent) ? position : undefined };
    }, (failed) => {
      if (intent && this.transport === intent) {
        this.transport = null;
        this.applyAudio();
      }
      if (failed) this.refreshSoon();
    });
  }

  private get serverNow() {
    return this.serverOffset + performance.now();
  }

  private isPlaying({ session }: PlaybackSnapshot) {
    return session.playing && !session.pendingDeviceId &&
      (this.hasLease() || (session.leaseUntil ?? 0) > this.serverNow);
  }

  private hasLease() {
    const session = this.snapshot?.session;
    return this.running && session?.activeDeviceId === this.deviceId && !session.pendingDeviceId &&
      performance.now() < this.leaseDeadline;
  }

  private position() {
    const snapshot = this.snapshot;
    if (!snapshot) return 0;
    const { session } = snapshot;
    const limit = Math.min(this.serverNow, session.leaseUntil ?? snapshot.serverTime);
    const elapsed = session.playing && !session.pendingDeviceId ? Math.max(0, limit - snapshot.serverTime) / 1_000 : 0;
    return Math.max(0, session.position + elapsed);
  }

  private checkLease = () => {
    if (this.engine && !this.hasLease()) this.stopAudio();
    if (!document.hidden && this.running) void this.refresh();
    this.publish();
  };

  private tick = () => {
    if (!this.running) return;
    if (this.engine && !this.hasLease()) {
      this.stopAudio();
      this.publish();
    } else if (!this.engine && this.snapshot) {
      if (this.view.activeDeviceId && (this.snapshot.session.leaseUntil ?? 0) <= this.serverNow) this.publish();
      else this.publishProgress();
    } else if (this.engine) {
      this.prepareUpcomingTrack();
    }
  };

  private online = () => {
    if (!this.running) return;
    this.refreshSoon();
    void this.connectEvents();
  };

  private offline = () => {
    if (!this.running) return;
    this.connection = this.snapshot ? 'reconnecting' : 'offline';
    this.eventsAbort?.abort();
    this.scheduleHeartbeat();
    this.publish();
  };

  private suspend = () => this.stopSession(false);

  private stopSession(release: boolean) {
    if (this.suspended) return;
    const hasLease = this.hasLease();
    const session = this.snapshot?.session;
    const position = this.stopAudio(session?.trackId);
    this.suspended = true;
    this.generation++;
    this.leaseDeadline = 0;
    this.cancelSeeks();
    this.seekInFlight = null;
    this.transport = null;
    this.pendingPlay = null;
    this.clearPreparedAudio();
    this.playbackTiming = null;
    this.startPosition = undefined;
    clearTimeout(this.heartbeatTimer);
    clearTimeout(this.leaseTimer);
    clearTimeout(this.claimTimer);
    clearTimeout(this.reconnectTimer);
    this.eventsAbort?.abort();
    if (release && hasLease && session) {
      void this.api.command(session.version, { type: 'release', position }, undefined, true).catch(() => {});
    }
  }

  private wake = () => {
    if (!this.suspended || this.abort.signal.aborted || this.connection === 'unsupported') return;
    this.suspended = false;
    this.refreshSoon();
    void this.connectEvents();
  };

  private refresh(): Promise<void> {
    if (!this.running) return Promise.resolve();
    if (this.refreshInFlight) return this.refreshInFlight;
    clearTimeout(this.heartbeatTimer);
    this.refreshInFlight = (async () => {
      let registrationError: unknown;
      if (!this.registered) {
        registrationError = await this.request((signal) => this.api.register(this.deviceLabel, this.platform, signal), false, () => {
          this.registered = true;
        });
        // A new controller already has a snapshot. Only the current output
        // needs an immediate heartbeat to confirm its existing lease.
        if (this.registered && this.snapshot && this.snapshot.session.activeDeviceId !== this.deviceId) return;
      }
      if (this.registered) {
        const report = this.getReport();
        const error = await this.request((signal) => this.api.heartbeat(signal, report), true, () => {
          if (report) this.lastReportAt = performance.now();
        });
        if (error instanceof PlaybackApiError && (error.status === 403 || error.status === 404)) {
          this.registered = false;
        }
      } else if (!this.snapshot) {
        const sessionError = await this.request((signal) => this.api.session(signal), false);
        // A legacy server has neither route. A live shared session or a transient error
        // must still use the lease rather than starting a second local audio engine.
        if (this.running && !this.snapshot &&
            registrationError instanceof PlaybackApiError && registrationError.status === 404 &&
            sessionError instanceof PlaybackApiError && sessionError.status === 404) {
          this.suspend();
          clearInterval(this.progressTimer);
          this.connection = 'unsupported';
          this.notice = null;
          this.publish();
        }
      }
    })().finally(() => {
      this.refreshInFlight = null;
      if (this.refreshRequested) {
        this.refreshRequested = false;
        void this.refresh();
      } else this.scheduleHeartbeat();
    });
    return this.refreshInFlight;
  }

  private scheduleHeartbeat() {
    clearTimeout(this.heartbeatTimer);
    if (!this.running) return;
    let delay = passiveHeartbeatInterval;
    if (this.connection === 'reconnecting' || this.connection === 'offline') {
      delay = recoveryHeartbeatInterval;
    } else if (!this.eventsHealthy) {
      delay = pollingHeartbeatInterval;
    } else if (this.snapshot?.session.activeDeviceId === this.deviceId) {
      delay = activeHeartbeatInterval;
    }
    this.heartbeatTimer = window.setTimeout(() => void this.refresh(), delay);
  }

  private getReport() {
    const session = this.snapshot?.session;
    if (!session || session.trackId === null || !this.hasLease() || !this.engine ||
      this.engineTrackId !== session.trackId || this.engineStatus !== 'playing' ||
      this.pendingSeek || this.seekInFlight || this.transport || !session.playing ||
      performance.now() - this.lastReportAt < 12_000) return undefined;
    return { trackId: session.trackId, version: session.version, position: this.engine.currentTime };
  }

  private refreshSoon() {
    if (this.refreshInFlight) this.refreshRequested = true;
    else void this.refresh();
  }

  private async request(operation: Operation, confirmsLease: boolean, onSuccess?: () => void) {
    if (!this.running) return;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    const timeout = window.setTimeout(cancel, requestTimeout);
    this.abort.signal.addEventListener('abort', cancel, { once: true });
    const startedAt = performance.now();
    const generation = this.generation;
    try {
      const snapshot = await operation(controller.signal);
      if (!this.running || generation !== this.generation) return;
      onSuccess?.();
      this.acceptSnapshot(snapshot, confirmsLease ? startedAt : undefined);
    } catch (error) {
      if (!this.running || generation !== this.generation) return;
      this.handleError(error);
      return error;
    } finally {
      clearTimeout(timeout);
      this.abort.signal.removeEventListener('abort', cancel);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof PlaybackApiError && error.status === 401) {
      this.dispose(false);
      this.onSessionExpired(error, this.token);
      return;
    }
    if (error instanceof PlaybackApiError && error.snapshot) {
      this.acceptSnapshot(error.snapshot);
      return;
    }
    if (error instanceof PlaybackApiError && error.status < 500 && error.status !== 429) return;
    this.connection = this.snapshot ? 'reconnecting' : 'offline';
    this.publish();
  }

  private async connectEvents() {
    if (!this.running || this.eventsAbort) return;
    const controller = new AbortController();
    this.eventsAbort = controller;
    let idleTimer = 0;
    const activity = () => {
      clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => controller.abort(), 35_000);
    };
    activity();
    try {
      await this.api.events(controller.signal, (snapshot) => {
        if (!this.running || controller.signal.aborted) return;
        this.eventsHealthy = true;
        this.reconnectDelay = 1_000;
        this.acceptSnapshot(snapshot);
      }, activity);
    } catch (error) {
      // Heartbeats deliver snapshots while the event stream is unavailable.
      if (this.running && error instanceof PlaybackApiError && error.status === 401) this.handleError(error);
    } finally {
      clearTimeout(idleTimer);
      if (this.eventsHealthy) {
        this.eventsHealthy = false;
        this.scheduleHeartbeat();
      }
      this.eventsAbort = null;
      if (this.running) {
        this.reconnectTimer = window.setTimeout(() => void this.connectEvents(), this.reconnectDelay);
        this.reconnectDelay = Math.min(15_000, this.reconnectDelay * 2);
      }
    }
  }

  private send(createCommand: CreateCommand, onSettled?: (failed: boolean) => void, retryConflict = false) {
    this.flushSeek();
    this.enqueue(createCommand, onSettled, retryConflict);
  }

  private enqueue(createCommand: CreateCommand, onSettled?: (failed: boolean) => void, retryConflict = false) {
    const generation = this.generation;
    this.queuedCommands++;
    this.commands = this.commands.catch(() => {}).then(async () => {
      if (!this.running || generation !== this.generation) return;
      if (!this.registered || !this.snapshot) await this.refresh();
      if (!this.running || generation !== this.generation) return;
      if (!this.registered || !this.snapshot) {
        this.notice = 'Не удалось связаться с плеером. Попробуйте ещё раз.';
        onSettled?.(true);
        this.publish();
        return;
      }
      const base = this.snapshot;
      const execute = async (snapshot: PlaybackSnapshot) => {
        const command = createCommand(snapshot);
        if (!command) return;
        const startedAt = performance.now();
        const error = await this.request((signal) => this.api.command(snapshot.session.version, command, signal), true);
        recordPlaybackTiming(`command-${command.type}`, startedAt);
        if (command.type === 'seek' && command.seekId && this.snapshot?.session.timelineRevision === command.seekId) return;
        return error;
      };
      let error = await execute(base);
      const current = this.snapshot;
      if (retryConflict && error instanceof PlaybackApiError && error.status === 409 &&
        this.running && generation === this.generation && current && current.session.version > base.session.version &&
        sameTimeline(base.session, current.session) && current.session.pendingDeviceId === base.session.pendingDeviceId) {
        error = await execute(current);
      }
      if (!this.running || generation !== this.generation) return;
      this.notice = error ? 'Не удалось применить действие. Попробуйте ещё раз.' : null;
      onSettled?.(Boolean(error));
      this.publish();
    }).finally(() => { this.queuedCommands--; });
  }

  private acceptSnapshot(snapshot: PlaybackSnapshot, startedAt?: number) {
    if (!Number.isSafeInteger(snapshot?.session?.version) || !Number.isFinite(snapshot?.serverTime) ||
      !Array.isArray(snapshot.session.queue) || !Array.isArray(snapshot.devices)) return;
    const previous = this.snapshot;
    const wasLeased = this.hasLease();
    const fresh = isNewer(snapshot, previous);
    if (!fresh && startedAt === undefined) return;
    if (fresh) {
      this.snapshot = snapshot;
      // Each receive gives a lower bound on server time. A slower response
      // cannot set the clock back or reset the age of a delayed snapshot.
      this.serverOffset = Math.max(this.serverOffset, snapshot.serverTime - performance.now());
    }
    const current = this.snapshot!;
    const { session } = current;
    const own = session.activeDeviceId === this.deviceId;
    const live = (session.leaseUntil ?? 0) > current.serverTime;
    const handoff = own && session.pendingDeviceId && live;
    const stillActive = own && !session.pendingDeviceId && live;
    this.connection = 'online';
    if (this.transport && this.transport.version !== session.version) this.transport = null;
    const moved = previous !== null && !sameTimeline(previous.session, session);
    const preview = this.trackPreview;
    const confirmedPreview = Boolean(preview && session.version === preview.version + 1 &&
      session.trackId === preview.track.id && session.anchorPosition === 0 && own && !session.pendingDeviceId);
    if (moved) this.startPosition = session.anchorPosition;
    if (preview && (session.version !== preview.version || !stillActive)) {
      this.trackPreview = null;
      if (!moved && stillActive) this.startPosition = preview.previousPosition;
      if (confirmedPreview) {
        this.startPosition = undefined;
        if (preview.transport) {
          preview.transport.version = session.version;
          this.transport = preview.transport;
        }
      }
    }
    const ownSeek = moved && this.seekInFlight !== null && session.timelineRevision === this.seekInFlight;
    const unconfirmedSeek = this.pendingSeek?.local && session.timelineRevision !== this.pendingSeek.id;
    if (moved && this.endedSession) {
      this.endedSession = ownSeek && sameTimeline(this.endedSession, previous.session) ? session : null;
    }
    if (confirmedPreview && preview?.ended) this.endedSession = session;
    if ((moved && !ownSeek && !confirmedPreview) || session.pendingDeviceId || (wasLeased && !stillActive)) {
      this.cancelSeeks();
    }

    if (handoff) {
      const position = this.stopAudio(session.trackId) ?? (!moved ? preview?.previousPosition : undefined);
      if ((moved && !ownSeek) || unconfirmedSeek) this.ackPosition = undefined;
      else this.ackPosition = position ?? this.ackPosition;
      this.leaseDeadline = 0;
      this.acknowledge(current);
    } else if (!stillActive) {
      this.stopAudio();
      this.leaseDeadline = 0;
      this.ackPosition = undefined;
    } else {
      const confirmed = startedAt !== undefined && snapshot.session.version === session.version &&
        snapshot.session.activeDeviceId === this.deviceId && !snapshot.session.pendingDeviceId;
      if (confirmed) {
        const deadline = startedAt + leaseRemaining(snapshot) - deadlineMargin;
        this.leaseDeadline = Math.max(this.leaseDeadline, deadline);
        clearTimeout(this.leaseTimer);
        this.leaseTimer = window.setTimeout(this.checkLease, Math.max(0, this.leaseDeadline - performance.now()));
        if (!this.refreshInFlight) this.scheduleHeartbeat();
      } else if (previous?.session.activeDeviceId !== this.deviceId || previous.session.pendingDeviceId) {
        this.refreshSoon();
      }
      this.ackPosition = undefined;
    }

    clearTimeout(this.claimTimer);
    if (session.pendingDeviceId === this.deviceId) {
      if (previous?.session.pendingDeviceId !== this.deviceId) this.confirmHandoff();
      const wait = Math.max(0, (session.leaseUntil ?? 0) - this.serverNow);
      // Retry promptly after an unresponsive previous device's lease expires.
      this.claimTimer = window.setTimeout(() => this.refreshSoon(), Math.max(250, wait + 100));
    }

    this.resolveTracks();
    this.applyAudio(moved && !ownSeek && !confirmedPreview);
    this.publish();
  }

  private acknowledge({ session }: PlaybackSnapshot) {
    if (this.ackInFlight) return;
    this.ackInFlight = true;
    void this.request((signal) => this.api.acknowledge(session.version, this.ackPosition, signal), true)
      .finally(() => { this.ackInFlight = false; });
  }

  private confirmHandoff() {
    if (!this.registered || this.handoffConfirmationInFlight) return;
    this.handoffConfirmationInFlight = true;
    void this.request((signal) => this.api.heartbeat(signal, undefined, true), true)
      .finally(() => { this.handoffConfirmationInFlight = false; });
  }

  private resolveTracks() {
    const session = this.snapshot?.session;
    if (!session || this.catalogRequestPending || performance.now() < this.nextCatalogAttempt) return;
    const relevant = new Set(session.queue);
    if (session.trackId !== null) relevant.add(session.trackId);
    for (const id of this.unavailableTracks) if (!relevant.has(id)) this.unavailableTracks.delete(id);
    const missing = [...relevant]
      .filter(id => !this.tracks.has(id) && !this.unavailableTracks.has(id))
      .slice(0, queueLimit);
    if (!missing.length) return;
    this.catalogRequestPending = true;
    void getTracksByIds(missing, this.abort.signal).then((tracks) => {
      if (!this.running) return;
      for (const track of tracks) this.tracks.set(track.id, track);
      for (const id of missing) if (!this.tracks.has(id)) this.unavailableTracks.add(id);
      this.applyAudio();
      this.publish();
    }).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) {
        for (const id of missing) this.unavailableTracks.add(id);
      } else {
        this.nextCatalogAttempt = performance.now() + 8_000;
      }
    }).finally(() => {
      this.catalogRequestPending = false;
      if (this.running) this.resolveTracks();
    });
  }

  private applyAudio(movePosition = false, retry = false) {
    const snapshot = this.snapshot;
    if (!snapshot || !this.hasLease()) {
      this.stopAudio();
      return;
    }
    if (this.trackPreview) return;
    const { trackId } = snapshot.session;
    const track = trackId === null ? undefined : this.tracks.get(trackId);
    if (!track) {
      this.stopAudio();
      return;
    }
    const ended = this.endedSession !== null && sameTimeline(this.endedSession, snapshot.session);
    const playing = (this.transportPlaying(snapshot) ?? this.isPlaying(snapshot)) && !ended;
    const prepared = this.engineTrackId !== track.id && playing ? this.takePreparedAudio(track) : undefined;
    const engine = this.engine ?? this.createEngine(prepared);
    if (this.engineTrackId !== track.id) {
      this.engineTrackId = track.id;
      this.needsGesture = false;
      this.engineShouldPlay = playing;
      const position = this.startPosition ?? this.position();
      this.startPosition = undefined;
      engine.load(track, { position, playing, prepared });
      return;
    }
    if (movePosition) {
      engine.seekTo(this.startPosition ?? this.position());
      this.startPosition = undefined;
    }
    if (playing === this.engineShouldPlay && !retry) return;
    this.engineShouldPlay = playing;
    if (!playing && this.engineStatus !== 'paused') {
      engine.pause();
    } else if (playing && !this.needsGesture && (retry || this.engineStatus !== 'error')) engine.resume();
  }

  private createEngine(audio?: HTMLAudioElement) {
    const engine = new AudioEngine({
      canPlay: () => this.hasLease(),
      onStatus: (status) => {
        if (this.engine !== engine) return;
        this.engineStatus = status;
        const timing = this.playbackTiming;
        if (timing?.trackId === this.engineTrackId && (status === 'playing' || status === 'error')) {
          if (status === 'playing') recordPlaybackTiming(timing.name, timing.startedAt);
          this.playbackTiming = null;
        }
        this.publish();
      },
      onDuration: (duration) => {
        if (this.engine !== engine) return;
        this.engineDuration = duration;
        this.publish();
      },
      onProgress: () => { if (this.engine === engine) this.publishProgress(); },
      onEnded: () => {
        if (this.engine !== engine || !this.hasLease() || !this.snapshot || this.engineTrackId === null) return;
        const trackId = this.engineTrackId;
        const preview = this.trackPreview;
        if (preview) preview.ended = true;
        const ended = this.snapshot.session;
        const seekId = this.pendingSeek?.id;
        if (!preview) this.endedSession = ended;
        this.engineShouldPlay = false;
        const nextId = ended.endedTrackId;
        const timing = nextId == null ? null : this.beginPlaybackTiming(nextId, 'ended-to-playing');
        const prepared = this.prepared;
        const nextPreview = !preview && prepared && prepared.track.id === nextId &&
          !prepared.audio.error && prepared.audio.readyState >= 3
          ? this.previewTrack(prepared.track) : null;
        this.send(({ session }) => this.hasLease() &&
          (preview ? this.endedSession !== null && sameTimeline(this.endedSession, session) && session.trackId === trackId
            : sameTimeline(ended, session) || (seekId !== undefined && session.timelineRevision === seekId))
          ? { type: 'ended', trackId } : null, (failed) => {
          if (failed || this.snapshot?.session.trackId !== nextId) this.cancelPlaybackTiming(timing);
          this.finishPreview(nextPreview);
        }, true);
      },
      onPlaybackBlocked: () => {
        if (this.engine !== engine) return;
        this.needsGesture = true;
        const trackId = this.engineTrackId;
        const position = this.engineDuration ? engine.currentTime : this.position();
        this.send((snapshot) => this.needsGesture && this.hasLease() && snapshot.session.trackId === trackId && this.isPlaying(snapshot)
          ? { type: 'pause', position } : null);
        this.publish();
      },
      onMediaPlay: this.retryPlayback,
      onMediaPause: () => {
        if (this.engineTrackId !== null) this.setPlaying(this.engineTrackId, false);
      },
      onMediaSeek: (position) => this.queueSeek(position),
      onNext: this.playNext,
      onPrevious: this.playPrev,
    }, this.volume, audio);
    this.engine = engine;
    return engine;
  }

  private stopAudio(trackId?: number | null) {
    if (!this.engine) return undefined;
    const engine = this.engine;
    const position = trackId === undefined || this.engineTrackId === trackId ? engine.currentTime : undefined;
    this.engine = null;
    this.clearPreparedAudio();
    this.playbackTiming = null;
    this.trackPreview = null;
    this.engineTrackId = null;
    this.engineStatus = 'idle';
    this.engineShouldPlay = false;
    this.engineDuration = 0;
    this.needsGesture = false;
    this.endedSession = null;
    this.transport = null;
    if (this.pendingSeek?.local) this.cancelSeeks();
    engine.dispose();
    return position;
  }

  private publish() {
    const snapshot = this.snapshot;
    const session = snapshot?.session;
    const trackId = this.trackPreview?.track.id ?? session?.trackId;
    const currentTrack = trackId == null ? null : this.tracks.get(trackId) ?? null;
    const resolvedQueue = (session?.queue ?? []).flatMap((id) => {
      const track = this.tracks.get(id);
      return track ? [track] : [];
    });
    const previousQueue = this.view.queue;
    const queue = previousQueue.length === resolvedQueue.length && previousQueue.every((track, index) => track === resolvedQueue[index])
      ? previousQueue : resolvedQueue;
    const local = this.hasLease();
    const duration = (local ? this.engineDuration : 0) ||
      (this.trackPreview ? currentTrack?.duration : session?.duration ?? currentTrack?.duration) || 0;
    const remotePlaying = snapshot && this.isPlaying(snapshot);
    const devices = snapshot?.devices ?? initialPlaybackView.devices;
    const status = currentTrack ? local && this.engine ? this.engineStatus : remotePlaying ? 'playing' : 'paused' : 'idle';
    const pendingPlayTrackId = this.pendingPlay?.trackId ?? null;

    const next: PlaybackView = {
      currentTrack, queue, queueIndex: queue.findIndex((track) => track.id === trackId),
      status,
      duration, shuffle: session?.shuffle ?? false, repeat: session?.repeat ?? 'none',
      mode: local ? 'active' : 'remote', connection: this.connection,
      devices: sameDevices(this.view.devices, devices) ? this.view.devices : devices,
      activeDeviceId: local || (session?.leaseUntil ?? 0) > this.serverNow ? session?.activeDeviceId ?? null : null,
      pendingDeviceId: session?.pendingDeviceId ?? null,
      pendingPlayTrackId: trackId === pendingPlayTrackId && (status === 'playing' || this.needsGesture) ? null : pendingPlayTrackId,
      needsGesture: this.needsGesture,
      removingDeviceId: this.removingDeviceId, notice: this.notice,
    };
    if ((Object.keys(next) as (keyof PlaybackView)[]).some(key => this.view[key] !== next[key])) {
      this.view = next;
      for (const listener of this.listeners) listener();
    }
    this.publishProgress();
  }

  private publishProgress() {
    const { duration } = this.view;
    const seek = this.pendingSeek;
    const position = this.hasLease() && this.engine && this.engineDuration
      ? this.engine.currentTime : seek?.position ?? this.position();
    this.progress.set(duration ? Math.min(1, Math.max(0, position / duration)) : 0);
  }
}
