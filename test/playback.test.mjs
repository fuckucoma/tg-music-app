import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate, setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const fixtureUrl = 'https://underlab.test';
const [bundle] = await build({
  configFile: false,
  logLevel: 'silent',
  define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(fixtureUrl) },
  build: {
    write: false,
    minify: false,
    lib: { entry: fileURLToPath(new URL('./fixtures/player.ts', import.meta.url)), formats: ['es'] },
  },
});
const code = bundle.output.find((file) => file.type === 'chunk').code;
const { AudioEngine, claimPlaybackIdentity, PlaybackSession, getTracksByIds } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

function setGlobal(t, name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  });
}

function tabStorage(copy) {
  const values = new Map(copy);
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values };
}

class WebLocks {
  held = new Set();

  async request(key, options, work) {
    assert.equal(options.ifAvailable, true);
    if (this.held.has(key)) return work(null);
    this.held.add(key);
    try { return await work({ name: key }); }
    finally { this.held.delete(key); }
  }
}

const newSignal = () => new AbortController().signal;

test('reload restores an account identity while a duplicate tab must take a new one', async (t) => {
  const locks = new WebLocks();
  const currentTab = tabStorage();
  setGlobal(t, 'navigator', { locks });
  setGlobal(t, 'sessionStorage', currentTab);
  const first = await claimPlaybackIdentity(1, newSignal());
  const otherAccount = await claimPlaybackIdentity(2, newSignal());
  assert.notEqual(first.credentials.deviceId, otherAccount.credentials.deviceId);
  otherAccount.release();

  const duplicatedTab = tabStorage(currentTab.values);
  Object.defineProperty(globalThis, 'sessionStorage', { value: duplicatedTab, configurable: true });
  const duplicate = await claimPlaybackIdentity(1, newSignal());
  assert.notEqual(first.credentials.deviceId, duplicate.credentials.deviceId);
  assert.notEqual(first.credentials.deviceKey, duplicate.credentials.deviceKey);

  first.release();
  await setImmediate();
  Object.defineProperty(globalThis, 'sessionStorage', { value: currentTab, configurable: true });
  const reloaded = await claimPlaybackIdentity(1, newSignal());
  assert.deepEqual(reloaded.credentials, first.credentials);
  reloaded.release();
  duplicate.release();
});

test('unavailable Web Locks or storage never results in reuse of a copied device', async (t) => {
  const storage = tabStorage();
  setGlobal(t, 'navigator', { locks: new WebLocks() });
  setGlobal(t, 'sessionStorage', storage);
  const original = await claimPlaybackIdentity(1, newSignal());
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  const unlocked = await claimPlaybackIdentity(1, newSignal());
  assert.notEqual(unlocked.credentials.deviceId, original.credentials.deviceId);
  original.release();

  Object.defineProperty(globalThis, 'navigator', { value: { locks: new WebLocks() }, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('Disabled storage'); } });
  const unsupported = await claimPlaybackIdentity(1, newSignal());
  assert.match(unsupported.credentials.deviceKey, /^[0-9a-f]{64}$/);
  unsupported.release();
});

function browser(t) {
  const players = [];
  const makePlayer = (id, tracks = [track]) => {
    const player = new PlaybackSession('fixture', { deviceId: id, deviceKey: 'fixture-key' }, id, 'browser', 1, noop);
    player.rememberCatalog(tracks);
    player.start();
    players.push(player);
    return player;
  };
  t.after(() => { for (const player of players) player.dispose(false); });
  const host = Object.assign(new EventTarget(), { setTimeout: globalThis.setTimeout, setInterval, location: new URL(fixtureUrl) });
  const document = Object.assign(new EventTarget(), { hidden: false });
  const audible = new Set();
  const playCalls = [];
  const seekCalls = [];
  const pauseCalls = [];
  const loadCalls = [];
  let nextError;

  class FakeAudio extends EventTarget {
    src = '';
    time = 0;
    get currentTime() { return this.time; }
    set currentTime(value) { this.time = value; seekCalls.push(value); }
    duration = 120;
    readyState = 4;
    bufferedUntil = 0;
    get buffered() {
      return { length: this.bufferedUntil > 0 ? 1 : 0, start: () => 0, end: () => this.bufferedUntil };
    }
    playbackRate = 1;
    paused = true;
    ended = false;
    error = null;

    load() {
      loadCalls.push(this.src);
      audible.delete(this);
      this.paused = true;
      this.time = 0;
      this.bufferedUntil = 0;
      this.error = null;
      this.ended = false;
      this.dispatchEvent(new Event('durationchange'));
      if (this.src) this.dispatchEvent(new Event('canplay'));
    }
    play() {
      assert.ok(this.src, 'audio requires a real source');
      playCalls.push(this.src);
      if (nextError) {
        const error = nextError;
        nextError = undefined;
        return Promise.reject(error);
      }
      audible.add(this);
      assert.equal(audible.size, 1, 'multiple audible outputs');
      this.paused = false;
      this.ended = false;
      queueMicrotask(() => this.dispatchEvent(new Event('playing')));
      return Promise.resolve();
    }
    pause() {
      pauseCalls.push(this.src);
      audible.delete(this);
      this.paused = true;
      this.dispatchEvent(new Event('pause'));
    }
    removeAttribute() { this.src = ''; }
  }

  setGlobal(t, 'window', host);
  setGlobal(t, 'document', document);
  setGlobal(t, 'Audio', FakeAudio);
  return { host, document, audible, playCalls, seekCalls, pauseCalls, loadCalls, makePlayer, blockNextPlay: () => {
    nextError = new DOMException('User gesture required', 'NotAllowedError');
  } };
}

const track = { id: 8, title: 'The test track', artist: 'Artist', duration: 120, streamUrl: `${fixtureUrl}/audio/8` };
const noop = () => {};

test('public storage media starts from the catalog URL and legacy media keeps the API route', async (t) => {
  const { playCalls } = browser(t);
  const publicUrl = 'https://storage.example.test/storage/v1/object/public/tracks/test.mp3';
  setGlobal(t, 'fetch', async () => Response.json([
    { id: 1, streamUrl: publicUrl },
    { id: 2, streamUrl: null },
    { id: 3, streamUrl: 'javascript:alert(1)' },
    { id: 4 },
  ]));
  const tracks = await getTracksByIds([1, 2, 3, 4], new AbortController().signal);
  const engine = new AudioEngine({
    onStatus: noop, onProgress: noop, onDuration: noop, onEnded: noop, onNext: noop, onPrevious: noop,
  }, 1);
  for (const item of tracks) engine.load(item);
  assert.deepEqual(playCalls, [publicUrl, ...[2, 3, 4].map(id => `${fixtureUrl}/tracks/${id}/stream`)]);
  engine.dispose();
});

test('AudioEngine plays only a prepared source and an authorized playback attempt', async (t) => {
  const { audible, blockNextPlay, playCalls } = browser(t);
  let permitted = false;
  let blocked = false;
  const engine = new AudioEngine({
    onStatus: noop, onProgress: noop, onDuration: noop, onEnded: noop, onNext: noop, onPrevious: noop,
    canPlay: () => permitted, onPlaybackBlocked: () => { blocked = true; },
  }, 1);
  t.after(() => engine.dispose());
  engine.resume();
  engine.load(track, { playing: false, position: 17 });
  engine.resume();
  assert.equal(playCalls.length, 0);
  permitted = true;
  blockNextPlay();
  engine.resume();
  await setImmediate();
  assert.equal(blocked, true);
  assert.equal(audible.size, 0);
  engine.resume();
  assert.equal(engine.currentTime, 17);
  assert.equal(audible.size, 1);

  const [audio] = audible;
  audio.time = 24;
  audio.error = { code: 2 };
  audio.paused = true;
  audible.delete(audio);
  audio.dispatchEvent(new Event('error'));
  engine.resume();
  assert.equal(engine.currentTime, 24, 'reloading a failed source preserves its position');
  assert.equal(audible.size, 1);
});

function server(t, audible, delayRequest, delayResponse, legacy = false) {
  const devices = new Map();
  const streams = new Set();
  const commands = [];
  const handoffWaiters = new Set();
  const text = new TextEncoder();
  const session = {
    version: 0, activeDeviceId: null, pendingDeviceId: null, trackId: null, duration: 120,
    position: 0, positionAt: 0, timelineRevision: null,
    queue: [], queueIndex: -1, playing: false, shuffle: false, repeat: 'none',
  };
  let reachable = true;
  let projectedExtra = 0;
  let lastServerTime = 0;
  const status = () => {
    const serverTime = lastServerTime = Math.max(Date.now(), lastServerTime + 1);
    const snapshot = { ...session, leaseUntil: session.activeDeviceId && serverTime + 30_000 };
    if (legacy) delete snapshot.timelineRevision;
    else {
      snapshot.anchorPosition = snapshot.position;
      snapshot.nextTrackId = snapshot.queue[(snapshot.queueIndex + 1) % snapshot.queue.length] ?? null;
      snapshot.endedTrackId = snapshot.repeat === 'one' ? snapshot.trackId
        : snapshot.repeat === 'all' ? snapshot.nextTrackId
        : snapshot.queue[snapshot.queueIndex + 1] ?? null;
    }
    if (snapshot.playing && !snapshot.pendingDeviceId) snapshot.position += projectedExtra;
    return { serverTime, session: snapshot, devices: [...devices.values()] };
  };
  const emit = (snapshot = status()) => {
    for (const stream of streams) stream.enqueue(text.encode(`event: session\ndata: ${JSON.stringify(snapshot)}\n\n`));
  };

  setGlobal(t, 'fetch', async (requestUrl, parameters = {}) => {
    const url = new URL(requestUrl);
    assert.equal(new Headers(parameters.headers).get('Authorization'), 'Bearer fixture');
    assert.equal(url.search, '');
    if (!reachable) throw new TypeError('Offline');
    if (url.pathname === '/playback/events') {
      const body = new ReadableStream({ start(stream) {
        streams.add(stream);
        parameters.signal.addEventListener('abort', () => { streams.delete(stream); stream.close(); }, { once: true });
        emit(status());
      } });
      return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
    }

    const body = parameters.body ? JSON.parse(parameters.body) : {};
    if (body.command) commands.push(body.command);
    if (delayRequest) {
      const rejected = await delayRequest(url.pathname, parameters.signal, body);
      if (rejected) return rejected;
    }
    if (url.pathname === '/playback/devices') {
      devices.set(body.deviceId, { id: body.deviceId, name: body.name, online: true, platform: body.platform });
      emit();
    } else if (url.pathname === '/playback/command') {
      const { command, deviceId } = body;
      if (body.expectedVersion !== session.version) return Response.json({ snapshot: status() }, { status: 409 });
      if (command.type === 'play') {
        if (session.trackId !== (command.trackId ?? session.trackId)) {
          session.position = 0;
          session.positionAt = Date.now();
          session.timelineRevision = crypto.randomUUID();
        }
        session.activeDeviceId ??= deviceId;
        session.trackId = command.trackId ?? session.trackId;
        session.queue = command.queue ?? session.queue;
        session.queueIndex = session.queue.indexOf(session.trackId);
        session.playing = true;
      } else if (command.type === 'transfer') {
        session.pendingDeviceId = command.targetDeviceId;
      } else if (command.type === 'pause') {
        session.playing = false;
        session.position = command.position ?? session.position;
        session.positionAt = Date.now();
      } else if (command.type === 'seek') {
        session.position = command.position;
        session.positionAt = Date.now();
        session.timelineRevision = command.seekId ?? crypto.randomUUID();
      } else if (command.type === 'setShuffle') {
        session.shuffle = command.shuffle;
      } else if (command.type === 'setRepeat') {
        session.repeat = command.repeat;
      } else if (command.type === 'next' || command.type === 'ended') {
        if (command.type === 'next' || session.repeat !== 'one') {
          session.queueIndex = (session.queueIndex + 1) % session.queue.length;
          session.trackId = session.queue[session.queueIndex];
        }
        session.position = 0;
        session.positionAt = Date.now();
        session.timelineRevision = crypto.randomUUID();
      }
      session.version++;
      emit();
    } else if (url.pathname === '/playback/ack') {
      assert.equal(session.activeDeviceId, body.deviceId);
      assert.equal(audible.size, 0, 'old output paused before acknowledgement');
      session.activeDeviceId = session.pendingDeviceId;
      session.pendingDeviceId = null;
      session.position = body.position ?? session.position;
      session.timelineRevision = crypto.randomUUID();
      session.version++;
      emit();
      for (const complete of handoffWaiters) complete();
    } else if (url.pathname === '/playback/heartbeat' && body.waitForHandoff && session.pendingDeviceId === body.deviceId) {
      await new Promise((resolve) => {
        const complete = () => { handoffWaiters.delete(complete); resolve(); };
        handoffWaiters.add(complete);
        parameters.signal.addEventListener('abort', complete, { once: true });
      });
    }
    const snapshot = status();
    if (delayResponse) {
      const rejected = await delayResponse(url.pathname, body, parameters.signal);
      if (rejected) return rejected;
    }
    return Response.json(snapshot);
  });
  return {
    session, status, emit, commands,
    get activeStreams() { return streams.size; },
    get waitingHandoffs() { return handoffWaiters.size; },
    setProjectedExtra: (value) => { projectedExtra = value; },
    setReachable: (value) => { reachable = value; },
  };
}

test('a heartbeat received five seconds after it was sampled does not rewind audible playback', async (t) => {
  const { host, audible, seekCalls, loadCalls, pauseCalls, playCalls, makePlayer } = browser(t);
  let now = 0;
  setGlobal(t, 'performance', { now: () => now });
  let held;
  let delayHeartbeat = false;
  const api = server(t, audible, undefined, (path) => {
    if (path === '/playback/heartbeat' && delayHeartbeat) {
      return new Promise((resolve) => { held = resolve; });
    }
  });
  const player = makePlayer('desktop');
  await eventually(() => player.getView().devices.length, 'device registered');
  player.play(track);
  await eventually(() => player.getView().status === 'playing', 'playing');
  await setImmediate();
  const [audio] = audible;
  const view = player.getView();
  let viewUpdates = 0;
  let progressUpdates = 0;
  player.subscribe(() => viewUpdates++);
  player.progress.subscribe(() => progressUpdates++);
  const initialLoads = loadCalls.length;
  seekCalls.length = 0;
  audio.time = 60;
  api.session.position = 60;
  delayHeartbeat = true;
  host.dispatchEvent(new Event('online'));
  await eventually(() => held, 'heartbeat sampled');
  now += 5_000;
  audio.time = 65;
  audio.dispatchEvent(new Event('timeupdate'));
  held();
  await setImmediate();
  assert.equal(audio.currentTime, 65);
  assert.deepEqual(seekCalls, []);
  assert.equal(playCalls.length, 1);
  assert.deepEqual(pauseCalls, []);
  assert.equal(loadCalls.length, initialLoads);
  assert.equal(player.getView(), view);
  assert.equal(viewUpdates, 0);
  assert.equal(progressUpdates, 1);
  assert.equal(player.progress.get(), 65 / 120);
});

test('stale SSE, settings and roster changes preserve the local position, while remote Seek moves it', async (t) => {
  const { audible, seekCalls, playCalls, makePlayer } = browser(t);
  const api = server(t, audible);
  const player = makePlayer('desktop');
  const phone = makePlayer('phone');
  await eventually(() => player.getView().devices.length === 2, 'devices registered');
  player.play(track);
  await eventually(() => phone.getView().status === 'playing' && audible.size === 1, 'playing');
  const [audio] = audible;
  const stale = api.status();
  seekCalls.length = 0;
  audio.time = 65;
  api.session.position = 64.5;
  phone.toggleShuffle();
  await eventually(() => player.getView().shuffle, 'shuffle synchronized');
  phone.cycleRepeat();
  await eventually(() => player.getView().repeat === 'all', 'repeat synchronized');
  const roster = makePlayer('tablet');
  await eventually(() => roster.getView().devices.length === 3 && player.getView().devices.length === 3, 'roster synchronized');
  api.emit(stale);
  await setImmediate();
  assert.equal(audio.currentTime, 65);
  assert.deepEqual(seekCalls, []);
  assert.equal(playCalls.length, 1);

  phone.seek(35 / 120);
  await eventually(() => seekCalls.length > 0, 'remote seek applied');
  assert.ok(Math.abs(audio.currentTime - 35) < 0.1);
  assert.equal(audible.size, 1);
  seekCalls.length = 0;
  audio.time = 40;
  phone.play(track);
  await eventually(() => player.getView().status === 'paused', 'remote pause applied');
  assert.equal(audible.size, 0);
  assert.equal(audio.currentTime, 40);
  phone.play(track);
  await eventually(() => player.getView().status === 'playing', 'remote resume applied');
  assert.equal(audio.currentTime, 40);
  assert.deepEqual(seekCalls, []);
});

test('seeking still works against a server that does not return a timeline revision', async (t) => {
  const { audible, seekCalls, makePlayer } = browser(t);
  server(t, audible, undefined, undefined, true);
  const player = makePlayer('desktop');
  await eventually(() => player.getView().devices.length, 'device registered');
  player.play(track);
  await eventually(() => player.getView().status === 'playing', 'playing');
  seekCalls.length = 0;
  player.seek(0.5);
  assert.deepEqual(seekCalls, []);
  await eventually(() => seekCalls.length === 1, 'legacy server seek applied');
  assert.ok(Math.abs(seekCalls[0] - 60) < 0.1);
});

test('leased Play and Pause act synchronously, roll back failed requests, and honor a confirmed remote pause', async (t) => {
  const { audible, pauseCalls, playCalls, makePlayer } = browser(t);
  let gate;
  const api = server(t, audible, (_path, _signal, body) => {
    if (gate && body.command?.type === gate.type) return new Promise(resolve => { gate.release = resolve; });
  });
  const player = makePlayer('desktop');
  await eventually(() => player.getView().devices.length, 'device registered');
  player.play(track);
  await eventually(() => player.getView().status === 'playing', 'playing');
  await setImmediate();

  gate = { type: 'pause' };
  player.play(track);
  assert.equal(player.getView().status, 'paused');
  assert.equal(audible.size, 0);
  assert.equal(pauseCalls.length, 1);
  await eventually(() => gate.release, 'pause is in flight');
  assert.equal(api.session.playing, true);
  api.emit();
  await setImmediate();
  assert.equal(audible.size, 0, 'an unconfirmed heartbeat does not undo the local pause');
  gate.release(Response.json({}, { status: 503 }));
  await eventually(() => player.getView().notice && audible.size === 1, 'failed pause rolls back');
  gate = null;

  player.play(track);
  await eventually(() => !api.session.playing && !player.getView().notice, 'second pause is confirmed');
  gate = { type: 'play' };
  player.play(track);
  assert.equal(audible.size, 1);
  assert.equal(playCalls.length, 3);
  await eventually(() => gate.release, 'resume is in flight');
  assert.equal(api.session.playing, false);
  gate.release(Response.json({}, { status: 503 }));
  await eventually(() => player.getView().notice && audible.size === 0, 'failed resume rolls back');
  await eventually(() => player.getView().connection === 'online', 'connection recovered');

  gate = { type: 'play' };
  player.play(track);
  assert.equal(audible.size, 1);
  await eventually(() => gate.release, 'another resume is in flight');
  api.session.version++;
  api.emit();
  await eventually(() => audible.size === 0, 'newer server pause stops optimistic audio');
  gate.release();
  await setImmediate();
  assert.equal(api.session.playing, false);
  assert.equal(audible.size, 0);
});

test('Media Session resumes an interrupted output and synchronizes its seek and pause', async (t) => {
  const { audible, makePlayer } = browser(t);
  const handlers = new Map();
  setGlobal(t, 'navigator', {
    mediaSession: { setActionHandler: (action, handler) => handlers.set(action, handler) },
  });
  const api = server(t, audible);
  const player = makePlayer('desktop');
  await eventually(() => player.getView().devices.length, 'device registered');
  player.play(track);
  await eventually(() => player.getView().status === 'playing', 'playing');
  const [audio] = audible;
  audio.pause();
  assert.equal(api.session.playing, true);
  assert.equal(audible.size, 0);
  handlers.get('play')({ action: 'play' });
  assert.equal(audible.size, 1);
  handlers.get('seekto')({ action: 'seekto', seekTime: 37 });
  assert.equal(audio.currentTime, 37);
  handlers.get('pause')({ action: 'pause' });
  assert.equal(audible.size, 0);
  await eventually(() => !api.session.playing, 'Media Session pause synchronized');
  assert.deepEqual(api.commands.slice(1).map(command => command.type), ['seek', 'pause']);
  assert.equal(api.session.position, 37);
});

test('local scrubbing sends the final seek and its delayed acknowledgement cannot rewind it', async (t) => {
  const { audible, seekCalls, makePlayer } = browser(t);
  let release;
  const api = server(t, audible, undefined, (_path, body) => {
    if (body.command?.type === 'seek') return new Promise(resolve => { release = resolve; });
  });
  const player = makePlayer('desktop');
  await eventually(() => player.getView().devices.length, 'device registered');
  player.play(track);
  await eventually(() => player.getView().status === 'playing', 'playing');
  const [audio] = audible;
  seekCalls.length = 0;
  player.seek(0.25);
  player.seek(0.5);
  player.seek(0.75);
  assert.equal(audio.currentTime, 90);
  assert.deepEqual(seekCalls, [30, 60, 90]);
  await eventually(() => release, 'seek received by the server');
  await setImmediate();
  assert.deepEqual(api.commands.filter(command => command.type === 'seek').map(command => command.position), [90]);
  audio.time = 95;
  release(Response.json({}, { status: 503 }));
  await setImmediate();
  assert.equal(audio.currentTime, 95, 'SSE already confirmed this seek before the HTTP error');
  assert.deepEqual(seekCalls, [30, 60, 90]);
  assert.equal(player.getView().notice, null);
});

test('a seek flushed before Next stays in order when another scrub is still pending', async (t) => {
  const { audible, makePlayer } = browser(t);
  let release;
  const api = server(t, audible, (_path, _signal, body) => {
    if (body.command?.type === 'setRepeat') return new Promise(resolve => { release = resolve; });
  });
  const second = { ...track, id: 9, streamUrl: `${fixtureUrl}/audio/9` };
  const player = makePlayer('desktop', [track, second]);
  await eventually(() => player.getView().devices.length, 'device registered');
  player.play(track, [track, second]);
  await eventually(() => player.getView().status === 'playing', 'playing');
  player.cycleRepeat();
  await eventually(() => release, 'a command is already in flight');

  player.seek(0.25);
  player.playNext();
  player.seek(0.5);
  release();
  await eventually(() => player.getView().currentTrack?.id === second.id, 'Next executed in order');
  await setTimeout(140);
  assert.deepEqual(api.commands.slice(1).map(command => command.type), ['setRepeat', 'seek', 'next']);
  assert.equal(api.commands[2].position, 30);
});

test('a phone changes the track on the leased desktop without opening another audio output', async (t) => {
  const { audible, playCalls, loadCalls, makePlayer } = browser(t);
  const api = server(t, audible);
  const second = { ...track, id: 9, streamUrl: `${fixtureUrl}/audio/9` };
  const desktop = makePlayer('desktop', [track, second]);
  const phone = makePlayer('phone', [track, second]);
  await eventually(() => phone.getView().devices.length === 2, 'both devices registered');
  desktop.play(track, [track, second]);
  await eventually(() => phone.getView().status === 'playing' && audible.size === 1, 'playing on desktop');
  const [engine] = audible;
  api.setProjectedExtra(1.2);
  phone.playNext();
  await eventually(() => desktop.getView().currentTrack?.id === second.id && engine.src === second.streamUrl, 'desktop advanced');
  assert.equal(api.session.activeDeviceId, 'desktop');
  assert.equal(phone.getView().mode, 'remote');
  assert.equal(audible.size, 1);
  assert.equal(audible.has(engine), true);
  assert.equal(engine.currentTime, 0, 'the new track starts at its anchor, before any projected time');
  assert.deepEqual(playCalls, [track.streamUrl, second.streamUrl]);
  assert.deepEqual(loadCalls, [track.streamUrl, second.streamUrl]);
});

test('local Next starts at zero before a slow command and restores the previous track if rejected', async (t) => {
  const { audible, loadCalls, seekCalls, makePlayer } = browser(t);
  let release;
  const api = server(t, audible, (_path, _signal, body) => {
    if (body.command?.type === 'next') return new Promise(resolve => { release = resolve; });
  });
  const second = { ...track, id: 9, streamUrl: `${fixtureUrl}/audio/9` };
  const player = makePlayer('desktop', [track, second]);
  await eventually(() => player.getView().devices.length, 'device registered');
  player.play(track, [track, second]);
  await eventually(() => player.getView().status === 'playing', 'playing');
  await setImmediate();
  const [audio] = audible;
  audio.time = 18;
  api.setProjectedExtra(1.2);
  player.playNext();
  assert.equal(audio.src, second.streamUrl, 'the current output reacts before the network');
  assert.equal(audio.currentTime, 0);
  assert.equal(api.session.trackId, track.id);
  await eventually(() => release, 'Next in flight');
  api.emit();
  await setImmediate();
  assert.equal(audio.src, second.streamUrl, 'heartbeat or SSE for the old version does not interrupt the preview');
  release(Response.json({}, { status: 503 }));
  await eventually(() => player.getView().notice && audio.src === track.streamUrl, 'rejected Next restores the old track');
  assert.equal(audio.currentTime, 18);
  await setImmediate();

  release = undefined;
  seekCalls.length = 0;
  player.playNext();
  await eventually(() => release && audio.src === second.streamUrl, 'another Next is in flight');
  audio.time = 4;
  player.play(second);
  assert.equal(audible.size, 0, 'Pause also acts immediately while Next is pending');
  release();
  await eventually(() => api.session.trackId === second.id && !api.session.playing, 'Next and Pause were confirmed in order');
  await setImmediate();
  assert.equal(audio.currentTime, 4);
  assert.deepEqual(seekCalls, []);
  assert.deepEqual(loadCalls, [track.streamUrl, second.streamUrl, track.streamUrl, second.streamUrl]);
});

test('the receiving output opens its confirmation while the outgoing acknowledgement is in flight', async (t) => {
  const { audible, makePlayer } = browser(t);
  let acknowledge;
  const api = server(t, audible, (path) => {
    if (path === '/playback/ack') return new Promise(resolve => { acknowledge = resolve; });
  });
  const desktop = makePlayer('desktop');
  const phone = makePlayer('phone');
  await eventually(() => desktop.getView().devices.length === 2, 'two devices registered');
  desktop.play(track);
  await eventually(() => desktop.getView().status === 'playing', 'desktop playing');
  const [audio] = audible;
  audio.time = 23;
  api.setProjectedExtra(1.2);
  phone.takeOver();
  await eventually(() => acknowledge && api.waitingHandoffs === 1, 'receiver heartbeat is waiting before acknowledgement');
  assert.equal(audible.size, 0);
  assert.equal(api.session.activeDeviceId, 'desktop');
  acknowledge();
  await eventually(() => phone.getView().mode === 'active' && audible.size === 1, 'receiver gets the lease');
  const [receivingAudio] = audible;
  assert.equal(receivingAudio.currentTime, 23);
  assert.equal(audible.has(audio), false);
});

test('a local seek after a natural track transition does not inherit the old ended state', async (t) => {
  const { audible, seekCalls, makePlayer } = browser(t);
  const api = server(t, audible);
  const second = { ...track, id: 9, streamUrl: `${fixtureUrl}/audio/9` };
  const player = makePlayer('desktop', [track, second]);
  await eventually(() => player.getView().devices.length, 'device registered');
  player.play(track, [track, second]);
  await eventually(() => player.getView().status === 'playing', 'playing');
  const [audio] = audible;
  audio.paused = audio.ended = true;
  audible.delete(audio);
  audio.dispatchEvent(new Event('ended'));
  await eventually(() => player.getView().currentTrack?.id === second.id && audible.has(audio), 'next track playing');

  seekCalls.length = 0;
  player.seek(0.5);
  await eventually(() => api.session.position === 60, 'seek synchronized');
  await setImmediate();
  assert.deepEqual(seekCalls, [60]);
  assert.equal(player.getView().status, 'playing');
  assert.equal(audible.has(audio), true);
});

test('natural transition reuses the buffered track while the server confirms it', async (t) => {
  const { audible, loadCalls, makePlayer } = browser(t);
  let releaseEnd;
  const api = server(t, audible, async (path, signal, body) => {
    if (body.command?.type === 'ended') await new Promise(resolve => {
      releaseEnd = resolve;
      signal.addEventListener('abort', resolve, { once: true });
    });
  });
  const second = { ...track, id: 9, streamUrl: `${fixtureUrl}/audio/9` };
  const player = makePlayer('desktop', [track, second]);
  await eventually(() => player.getView().devices.length, 'device registered');
  player.play(track, [track, second]);
  await eventually(() => player.getView().status === 'playing', 'first track playing');
  const [audio] = audible;
  audio.time = 108;
  audio.bufferedUntil = 110;
  await setTimeout(300);
  assert.equal(loadCalls.includes(second.streamUrl), false, 'the current buffer has priority');
  audio.bufferedUntil = 120;
  await eventually(() => loadCalls.includes(second.streamUrl), 'next track preloaded');

  audio.paused = audio.ended = true;
  audible.delete(audio);
  audio.dispatchEvent(new Event('ended'));
  await eventually(() => releaseEnd && player.getView().status === 'playing', 'next track plays before the server responds');
  assert.equal(api.session.trackId, track.id);
  assert.equal([...audible][0].src, second.streamUrl);
  assert.equal(loadCalls.filter(url => url === second.streamUrl).length, 1, 'the prepared source is not loaded again');
  assert.equal(performance.getEntriesByName('playback:ended-to-playing').length, 1);
  releaseEnd();
  await eventually(() => api.session.trackId === second.id, 'server confirmed the transition');
  assert.equal(player.getView().currentTrack.id, second.id);
});

test('a blocked preloaded element falls back to the current audio element', async (t) => {
  const { audible, loadCalls, makePlayer, blockNextPlay } = browser(t);
  server(t, audible);
  const second = { ...track, id: 9, streamUrl: `${fixtureUrl}/audio/9` };
  const player = makePlayer('desktop', [track, second]);
  await eventually(() => player.getView().devices.length, 'device registered');
  player.play(track, [track, second]);
  await eventually(() => player.getView().status === 'playing', 'first track playing');
  const [audio] = audible;
  audio.time = 110;
  audio.bufferedUntil = 120;
  await eventually(() => loadCalls.includes(second.streamUrl), 'next track preloaded');
  blockNextPlay();
  audio.paused = audio.ended = true;
  audible.delete(audio);
  audio.dispatchEvent(new Event('ended'));
  await eventually(() => audible.has(audio) && player.getView().status === 'playing', 'previous element can play again');
  assert.equal(audio.src, second.streamUrl);
  assert.equal(player.getView().needsGesture, false);
});

test('a rejected natural transition returns to the ended track without restarting it', async (t) => {
  const { audible, loadCalls, makePlayer } = browser(t);
  let rejectEnd;
  const api = server(t, audible, async (path, signal, body) => {
    if (body.command?.type === 'ended') return new Promise(resolve => {
      rejectEnd = () => resolve(Response.json({ error: 'Rejected' }, { status: 400 }));
      signal.addEventListener('abort', rejectEnd, { once: true });
    });
  });
  const second = { ...track, id: 9, streamUrl: `${fixtureUrl}/audio/9` };
  const player = makePlayer('desktop', [track, second]);
  await eventually(() => player.getView().devices.length, 'device registered');
  player.play(track, [track, second]);
  await eventually(() => player.getView().status === 'playing', 'first track playing');
  const [audio] = audible;
  audio.time = 110;
  audio.bufferedUntil = 120;
  await eventually(() => loadCalls.includes(second.streamUrl), 'next track preloaded');

  audio.time = 120;
  audio.paused = audio.ended = true;
  audible.delete(audio);
  audio.dispatchEvent(new Event('ended'));
  await eventually(() => rejectEnd && [...audible][0]?.src === second.streamUrl, 'next track playing locally');
  rejectEnd();
  await eventually(() => player.getView().notice && player.getView().currentTrack?.id === track.id, 'old track restored');
  assert.equal(audible.size, 0);
  assert.equal(player.getView().status, 'paused');
  assert.equal(api.session.trackId, track.id);
});

async function eventually(condition, label, timeout = 1_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (condition()) return;
    await setTimeout(10);
  }
  assert.fail(label);
}

test('Play can wait for a Render response that takes more than six seconds', async (t) => {
  const { audible, loadCalls } = browser(t);
  const api = server(t, audible, async (path, signal) => {
    if (path === '/playback/command') await setTimeout(6_500, undefined, { signal });
  });
  const device = { deviceId: 'desktop', deviceKey: 'fixture-key' };
  const player = new PlaybackSession('fixture', device, 'Desktop', 'browser', 1, noop);
  player.rememberCatalog([track]);
  player.start();
  try {
    await eventually(() => player.getView().devices.length === 1, 'device registered');
    api.setProjectedExtra(1);
    player.play(track, [track]);
    assert.equal(player.getView().pendingPlayTrackId, track.id);
    await eventually(() => api.commands.length === 1, 'play request in flight');
    assert.deepEqual(loadCalls, [track.streamUrl], 'buffering starts while the request is in flight');
    assert.equal(audible.size, 0);
    await eventually(() => audible.size === 1, 'the delayed command granted playback', 9_000);
    assert.deepEqual(loadCalls, [track.streamUrl], 'Play reuses the same buffered source');
    assert.equal([...audible][0].currentTime, 0);
    await eventually(() => player.getView().pendingPlayTrackId === null, 'loading state cleared');
    assert.equal(api.session.activeDeviceId, device.deviceId);
    assert.equal(player.getView().notice, null);
  } finally {
    player.dispose(false);
  }
});

test('two playback controllers hand off one engine, recover within a lease, and fail silent at expiry', async (t) => {
  const { host, document, audible, playCalls, seekCalls, blockNextPlay } = browser(t);
  const realNow = performance.now.bind(performance);
  let elapsed = 0;
  setGlobal(t, 'performance', { now: () => realNow() + elapsed });
  const api = server(t, audible);
  const make = (deviceId) => {
    const controller = new PlaybackSession('fixture', { deviceId, deviceKey: `${deviceId}-key` }, deviceId, 'browser', 1, noop);
    controller.rememberCatalog([track]);
    controller.start();
    return controller;
  };
  const first = make('first');
  const second = make('second');
  try {
    await eventually(() => first.getView().devices.length === 2, 'both outputs registered');
    first.play(track, [track]);
    assert.equal(playCalls.length, 0, 'wait for server to grant audio');
    await eventually(() => first.getView().status === 'playing' && second.getView().status === 'playing', 'both controllers see playback');
    assert.equal(audible.size, 1);

    const stale = api.status();
    blockNextPlay();
    second.takeOver();
    await eventually(() => second.getView().needsGesture && !api.session.playing, 'second output requests a gesture');
    assert.equal(audible.size, 0);
    api.emit(stale);
    await setImmediate();
    assert.equal(first.getView().mode, 'remote');
    assert.equal(second.getView().mode, 'active');
    second.retryPlayback();
    assert.equal(audible.size, 1, 'gesture plays the authorized source synchronously');
    await eventually(() => api.session.playing, 'resume synchronized');
    const [audio] = audible;
    seekCalls.length = 0;
    audio.time = 45;

    api.setReachable(false);
    host.dispatchEvent(new Event('offline'));
    assert.equal(second.getView().connection, 'reconnecting');
    assert.equal(audible.size, 1, 'a short interruption keeps prior exclusive permission');
    api.setReachable(true);
    host.dispatchEvent(new Event('online'));
    await eventually(() => second.getView().connection === 'online', 'connection recovered');
    assert.equal(audible.size, 1);
    assert.equal(audio.currentTime, 45);
    assert.deepEqual(seekCalls, []);
    await eventually(() => api.activeStreams === 2, 'both SSE subscriptions recovered', 2_500);
    first.toggleShuffle();
    await eventually(() => second.getView().shuffle, 'remote controls still arrive after reconnecting');
    assert.equal(audio.currentTime, 45);
    assert.deepEqual(seekCalls, []);

    api.setReachable(false);
    host.dispatchEvent(new Event('offline'));
    elapsed = 31_000;
    audio.dispatchEvent(new Event('timeupdate'));
    assert.equal(audible.size, 0, 'media events enforce the lease even before a delayed timer fires');
    document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(audible.size, 0, 'silence past the last confirmed permit');
    assert.equal(second.getView().mode, 'remote');
  } finally {
    first.dispose(false);
    second.dispose(false);
  }
});
