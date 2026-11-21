import { getTracks } from '../../services/api';
import {
  playbackApi, PlaybackApiError,
  type DeviceCredentials, type DevicePlatform, type PlaybackCommand, type PlaybackDevice, type PlaybackSnapshot,
} from '../../services/playback';
import type { PlayerStatus, Track } from '../../types/track';
import { AudioEngine } from './AudioEngine';
import type { RepeatMode } from './PlayerStore';

const heartbeatInterval = 4_000;
const deadlineMargin = 750;
const queueLimit = 300;
const nextRepeat: Record<RepeatMode, RepeatMode> = { none: 'all', all: 'one', one: 'none' };

export type PlaybackConnection = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'offline';

interface PlaybackView {
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  status: PlayerStatus;
  progress: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  mode: 'local' | 'active' | 'remote';
  connection: PlaybackConnection;
  devices: PlaybackDevice[];
  activeDeviceId: string | null;
  pendingDeviceId: string | null;
  needsGesture: boolean;
  notice: string | null;
}

export const initialPlaybackView: PlaybackView = {
  currentTrack: null, queue: [], queueIndex: -1, status: 'idle', progress: 0, duration: 0,
  shuffle: false, repeat: 'none', mode: 'remote', connection: 'connecting', devices: [],
  activeDeviceId: null, pendingDeviceId: null, needsGesture: false, notice: null,
};

function hex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createPlaybackDevice(): DeviceCredentials {
  const uuid = crypto.getRandomValues(new Uint8Array(16));
  uuid[6] = (uuid[6] & 0x0f) | 0x40;
  uuid[8] = (uuid[8] & 0x3f) | 0x80;
  const text = hex(uuid);
  const deviceId = [text.slice(0, 8), text.slice(8, 12), text.slice(12, 16), text.slice(16, 20), text.slice(20)].join('-');
  return { deviceId, deviceKey: hex(crypto.getRandomValues(new Uint8Array(32))) };
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
  return snapshot.serverTime >= previous.serverTime;
}

function leaseRemaining(snapshot: PlaybackSnapshot) {
  return (snapshot.session.leaseUntil ?? 0) - snapshot.serverTime;
}

type Operation = (signal: AbortSignal) => Promise<PlaybackSnapshot>;

export class PlaybackSession {
  private readonly api;
  private readonly abort = new AbortController();
  private readonly tracks = new Map<number, Track>();
  private readonly listeners = new Set<() => void>();
  private view = initialPlaybackView;
  private snapshot: PlaybackSnapshot | null = null;
  private receivedAt = 0;
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
  private engineDuration = 0;
  private needsGesture = false;
  private registered = false;
  private refreshInFlight: Promise<void> | null = null;
  private refreshRequested = false;
  private ackInFlight = false;
  private ackPosition: number | undefined;
  private commands = Promise.resolve();
  private eventsAbort: AbortController | null = null;
  private reconnectDelay = 1_000;
  private nextCatalogAttempt = 0;
  private lastReportAt = -Infinity;
  private endedVersion: number | null = null;
  private deferredSeek: { trackId: number; position: number } | null = null;
  private suspended = false;
  private generation = 0;
  private connection: PlaybackConnection = 'connecting';
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

  private get deviceId() { return this.credentials.deviceId; }
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
    document.addEventListener('freeze', this.suspend);
    document.addEventListener('resume', this.wake);
    document.addEventListener('visibilitychange', this.checkLease);
    this.heartbeatTimer = window.setInterval(() => void this.refresh(), heartbeatInterval);
    this.progressTimer = window.setInterval(this.tick, 250);
    void this.refresh();
    void this.connectEvents();
  }

  dispose() {
    this.suspend();
    this.abort.abort();
    clearInterval(this.heartbeatTimer);
    clearInterval(this.progressTimer);
    window.removeEventListener('pagehide', this.suspend);
    window.removeEventListener('pageshow', this.wake);
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
    if (!this.hasLease() || !this.engine) return;
    const trackId = this.engineTrackId;
    const position = this.engineDuration ? this.engine.currentTime : this.position();
    this.needsGesture = false;
    this.endedVersion = null;
    this.engine.resume();
    this.send((snapshot) => this.hasLease() && snapshot.session.trackId === trackId && !this.isPlaying(snapshot)
      ? { type: 'play', position } : null);
    this.publish();
  };

  play = (track: Track, trackList?: Track[]) => {
    if (this.engineTrackId === track.id && this.hasLease() && (this.needsGesture ||
      (this.engineStatus === 'error' && this.snapshot && this.isPlaying(this.snapshot)))) {
      this.retryPlayback();
      return;
    }
    for (const item of trackList ?? []) this.tracks.set(item.id, item);
    this.tracks.set(track.id, track);

    this.send((snapshot) => {
      if (snapshot.session.trackId === track.id) {
        return this.isPlaying(snapshot) ? this.pauseCommand() : { type: 'play' };
      }
      const ids = [...new Set((trackList ?? this.view.queue).map((item) => item.id))];
      if (!ids.includes(track.id)) ids.push(track.id);
      const start = Math.max(0, Math.min(ids.indexOf(track.id), ids.length - queueLimit));
      return { type: 'play', trackId: track.id, queue: ids.slice(start, start + queueLimit) };
    });
  };

  playNext = () => this.send(() => ({ type: 'next' }));
  playPrev = () => this.send(() => ({ type: 'previous' }));
  toggleShuffle = () => this.send(({ session }) => ({ type: 'setShuffle', shuffle: !session.shuffle }));
  cycleRepeat = () => this.send(({ session }) => ({ type: 'setRepeat', repeat: nextRepeat[session.repeat] }));
  takeOver = (targetDeviceId = this.deviceId) => this.send(() => ({ type: 'transfer', targetDeviceId }));

  seek = (ratio: number) => {
    if (Number.isFinite(ratio)) this.queueSeek(this.view.duration * Math.min(1, Math.max(0, ratio)));
  };

  private queueSeek(position: number) {
    const trackId = this.snapshot?.session.trackId;
    if (trackId == null || !this.view.duration || !Number.isFinite(position)) return;
    this.deferredSeek = { trackId, position: Math.max(0, Math.min(this.view.duration, position)) };
    if (this.hasLease()) this.engine?.seekTo(this.deferredSeek.position);
    this.publish();
    clearTimeout(this.seekTimer);
    this.seekTimer = window.setTimeout(() => {
      const seek = this.deferredSeek;
      this.deferredSeek = null;
      if (seek) this.send(({ session }) => session.trackId === seek.trackId
        ? { type: 'seek', position: seek.position } : null);
    }, 120);
  }

  private pauseCommand(): PlaybackCommand {
    return { type: 'pause', position: this.hasLease() ? this.engine?.currentTime : undefined };
  }

  private get serverNow() {
    return (this.snapshot?.serverTime ?? 0) + (performance.now() - this.receivedAt);
  }

  private isPlaying({ session }: PlaybackSnapshot) {
    return session.playing && !session.pendingDeviceId && (session.leaseUntil ?? 0) > this.serverNow;
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
    if (this.engine && !this.hasLease()) this.stopAudio();
    if (this.snapshot && !this.engine && this.snapshot.session.playing) this.publish();
  };

  private suspend = () => {
    if (this.suspended) return;
    const hasLease = this.hasLease();
    const session = this.snapshot?.session;
    const position = this.stopAudio(session?.trackId);
    this.suspended = true;
    this.generation++;
    this.leaseDeadline = 0;
    this.deferredSeek = null;
    clearTimeout(this.leaseTimer);
    clearTimeout(this.claimTimer);
    clearTimeout(this.seekTimer);
    clearTimeout(this.reconnectTimer);
    this.eventsAbort?.abort();
    if (hasLease && session) {
      void this.api.command(session.version, { type: 'release', position }, undefined, true).catch(() => {});
    }
  };

  private wake = () => {
    if (!this.suspended || this.abort.signal.aborted) return;
    this.suspended = false;
    this.refreshSoon();
    void this.connectEvents();
  };

  private refresh(): Promise<void> {
    if (!this.running) return Promise.resolve();
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = (async () => {
      if (!this.registered) {
        await this.request((signal) => this.api.register(this.deviceLabel, this.platform, signal), false, () => {
          this.registered = true;
        });
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
        await this.request((signal) => this.api.session(signal), false);
      }
    })().finally(() => {
      this.refreshInFlight = null;
      if (this.refreshRequested) {
        this.refreshRequested = false;
        void this.refresh();
      }
    });
    return this.refreshInFlight;
  }

  private getReport() {
    const session = this.snapshot?.session;
    if (!session || session.trackId === null || !this.hasLease() || !this.engine ||
      this.engineTrackId !== session.trackId || this.engineStatus !== 'playing' ||
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
    const timeout = window.setTimeout(cancel, 6_000);
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
      this.suspend();
      this.onSessionExpired(error, this.token);
      return;
    }
    if (error instanceof PlaybackApiError && error.snapshot) {
      this.acceptSnapshot(error.snapshot);
      return;
    }
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
        this.reconnectDelay = 1_000;
        this.acceptSnapshot(snapshot);
      }, activity);
    } catch (error) {
      // Heartbeats deliver snapshots while the event stream is unavailable.
      if (this.running && error instanceof PlaybackApiError && error.status === 401) this.handleError(error);
    } finally {
      clearTimeout(idleTimer);
      this.eventsAbort = null;
      if (this.running) {
        this.reconnectTimer = window.setTimeout(() => void this.connectEvents(), this.reconnectDelay);
        this.reconnectDelay = Math.min(15_000, this.reconnectDelay * 2);
      }
    }
  }

  private send(createCommand: (snapshot: PlaybackSnapshot) => PlaybackCommand | null) {
    const generation = this.generation;
    this.commands = this.commands.catch(() => {}).then(async () => {
      if (!this.running || generation !== this.generation) return;
      if (!this.registered || !this.snapshot) await this.refresh();
      if (!this.running || generation !== this.generation) return;
      if (!this.registered || !this.snapshot) {
        this.notice = 'Не удалось связаться с плеером. Попробуйте ещё раз.';
        this.publish();
        return;
      }
      const command = createCommand(this.snapshot);
      if (!command) return;
      const version = this.snapshot.session.version;
      const error = await this.request((signal) => this.api.command(version, command, signal), true);
      if (!this.running || generation !== this.generation) return;
      this.notice = error ? 'Не удалось применить действие. Попробуйте ещё раз.' : null;
      this.publish();
    });
  }

  private acceptSnapshot(snapshot: PlaybackSnapshot, startedAt?: number) {
    if (!Number.isSafeInteger(snapshot?.session?.version) || !Number.isFinite(snapshot?.serverTime) ||
      !Array.isArray(snapshot.session.queue) || !Array.isArray(snapshot.devices)) return;
    const previous = this.snapshot;
    if (isNewer(snapshot, previous)) {
      this.snapshot = snapshot;
      this.receivedAt = performance.now();
    }
    const current = this.snapshot!;
    const { session } = current;
    const own = session.activeDeviceId === this.deviceId;
    const handoff = own && session.pendingDeviceId && (session.leaseUntil ?? 0) > this.serverNow;
    const stillActive = own && !session.pendingDeviceId && (session.leaseUntil ?? 0) > this.serverNow;
    this.connection = 'online';

    if (handoff) {
      this.ackPosition = this.stopAudio(session.trackId) ?? this.ackPosition;
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
      } else if (previous?.session.activeDeviceId !== this.deviceId || previous.session.pendingDeviceId) {
        this.refreshSoon();
      }
      this.ackPosition = undefined;
    }

    clearTimeout(this.claimTimer);
    if (session.pendingDeviceId === this.deviceId) {
      const wait = Math.max(0, (session.leaseUntil ?? 0) - this.serverNow);
      // Retry promptly after an unresponsive previous device's lease expires.
      this.claimTimer = window.setTimeout(() => this.refreshSoon(), Math.max(250, wait + 100));
    }

    this.resolveTracks();
    this.applyAudio(previous?.session.version !== session.version);
    this.publish();
  }

  private acknowledge({ session }: PlaybackSnapshot) {
    if (this.ackInFlight) return;
    this.ackInFlight = true;
    void this.request((signal) => this.api.acknowledge(session.version, this.ackPosition, signal), true)
      .finally(() => { this.ackInFlight = false; });
  }

  private resolveTracks() {
    const session = this.snapshot?.session;
    if (!session) return;
    const missing = (session.trackId !== null && !this.tracks.has(session.trackId)) ||
      session.queue.some((id) => !this.tracks.has(id));
    if (!missing || performance.now() < this.nextCatalogAttempt) return;
    this.nextCatalogAttempt = performance.now() + 8_000;
    void getTracks(this.abort.signal).then((tracks) => {
      if (!this.running) return;
      for (const track of tracks) this.tracks.set(track.id, track);
      this.applyAudio();
      this.publish();
    }).catch(() => {});
  }

  private applyAudio(timelineChanged = false) {
    const snapshot = this.snapshot;
    if (!snapshot || !this.hasLease()) {
      this.stopAudio();
      return;
    }
    const { trackId, version } = snapshot.session;
    const track = trackId === null ? undefined : this.tracks.get(trackId);
    if (!track) {
      this.stopAudio();
      return;
    }
    const playing = this.isPlaying(snapshot) && this.endedVersion !== version;
    const position = this.deferredSeek?.trackId === track.id ? this.deferredSeek.position : this.position();
    const engine = this.engine ?? this.createEngine();
    if (this.engineTrackId !== track.id) {
      this.engineTrackId = track.id;
      this.needsGesture = false;
      engine.load(track, { position, playing });
      return;
    }
    const acceptableDrift = timelineChanged ? 0.1 : playing ? 1.5 : 0.25;
    if (Math.abs(engine.currentTime - position) > acceptableDrift) engine.seekTo(position);
    if (!playing && this.engineStatus !== 'paused') {
      engine.pause();
    } else if (playing && !this.needsGesture && this.engineStatus !== 'error') engine.resume();
  }

  private createEngine() {
    const engine = new AudioEngine({
      onStatus: (status) => {
        if (this.engine !== engine) return;
        this.engineStatus = status;
        this.publish();
      },
      onDuration: (duration) => {
        if (this.engine !== engine) return;
        this.engineDuration = duration;
        this.publish();
      },
      onProgress: () => { if (this.engine === engine) this.publish(); },
      onEnded: () => {
        if (this.engine !== engine || !this.hasLease() || !this.snapshot || this.engineTrackId === null) return;
        const trackId = this.engineTrackId;
        const version = this.snapshot.session.version;
        this.endedVersion = version;
        this.send(({ session }) => this.hasLease() && session.version === version ? { type: 'ended', trackId } : null);
      },
      onPlaybackBlocked: () => {
        if (this.engine !== engine) return;
        this.needsGesture = true;
        const trackId = this.engineTrackId;
        const position = this.engineDuration ? engine.currentTime : this.position();
        this.send((snapshot) => this.hasLease() && snapshot.session.trackId === trackId && this.isPlaying(snapshot)
          ? { type: 'pause', position } : null);
        this.publish();
      },
      onMediaPlay: () => {
        if (this.needsGesture) this.retryPlayback();
        else this.send(() => ({ type: 'play' }));
      },
      onMediaPause: () => this.send(() => this.pauseCommand()),
      onMediaSeek: (position) => this.queueSeek(position),
      onNext: this.playNext,
      onPrevious: this.playPrev,
    }, this.volume);
    this.engine = engine;
    return engine;
  }

  private stopAudio(trackId?: number | null) {
    if (!this.engine) return undefined;
    const engine = this.engine;
    const position = trackId === undefined || this.engineTrackId === trackId ? engine.currentTime : undefined;
    this.engine = null;
    this.engineTrackId = null;
    this.engineStatus = 'idle';
    this.engineDuration = 0;
    this.needsGesture = false;
    this.endedVersion = null;
    engine.dispose();
    return position;
  }

  private publish() {
    const snapshot = this.snapshot;
    const session = snapshot?.session;
    const trackId = session?.trackId;
    const currentTrack = trackId == null ? null : this.tracks.get(trackId) ?? null;
    const resolvedQueue = (session?.queue ?? []).flatMap((id) => {
      const track = this.tracks.get(id);
      return track ? [track] : [];
    });
    const previousQueue = this.view.queue;
    const queue = previousQueue.length === resolvedQueue.length && previousQueue.every((track, index) => track === resolvedQueue[index])
      ? previousQueue : resolvedQueue;
    const local = this.hasLease();
    const duration = (local ? this.engineDuration : 0) || session?.duration || currentTrack?.duration || 0;
    const position = this.deferredSeek && this.deferredSeek.trackId === trackId
      ? this.deferredSeek.position : local && this.engine ? this.engine.currentTime : this.position();
    const remotePlaying = snapshot && this.isPlaying(snapshot);

    this.view = {
      currentTrack, queue, queueIndex: queue.findIndex((track) => track.id === trackId),
      status: currentTrack ? local && this.engine ? this.engineStatus : remotePlaying ? 'playing' : 'paused' : 'idle',
      progress: duration ? Math.min(1, Math.max(0, position / duration)) : 0,
      duration, shuffle: session?.shuffle ?? false, repeat: session?.repeat ?? 'none',
      mode: local ? 'active' : 'remote', connection: this.connection, devices: snapshot?.devices ?? [],
      activeDeviceId: (session?.leaseUntil ?? 0) > this.serverNow ? session?.activeDeviceId ?? null : null,
      pendingDeviceId: session?.pendingDeviceId ?? null, needsGesture: this.needsGesture, notice: this.notice,
    };
    for (const listener of this.listeners) listener();
  }
}
