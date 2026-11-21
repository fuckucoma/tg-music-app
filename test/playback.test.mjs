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
const { AudioEngine, claimPlaybackIdentity, PlaybackSession } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

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
  const host = Object.assign(new EventTarget(), { setTimeout: globalThis.setTimeout, setInterval, location: new URL(fixtureUrl) });
  const document = Object.assign(new EventTarget(), { hidden: false });
  const audible = new Set();
  const playCalls = [];
  let nextError;

  class FakeAudio extends EventTarget {
    src = '';
    currentTime = 0;
    duration = 120;
    readyState = 4;
    playbackRate = 1;
    paused = true;
    error = null;

    load() { this.dispatchEvent(new Event('durationchange')); }
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
      queueMicrotask(() => this.dispatchEvent(new Event('playing')));
      return Promise.resolve();
    }
    pause() {
      audible.delete(this);
      this.paused = true;
      this.dispatchEvent(new Event('pause'));
    }
    removeAttribute() { this.src = ''; }
  }

  setGlobal(t, 'window', host);
  setGlobal(t, 'document', document);
  setGlobal(t, 'Audio', FakeAudio);
  return { host, document, audible, playCalls, blockNextPlay: () => {
    nextError = new DOMException('User gesture required', 'NotAllowedError');
  } };
}

const track = { id: 8, title: 'The test track', artist: 'Artist', duration: 120, streamUrl: `${fixtureUrl}/audio/8` };
const noop = () => {};

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
});

function server(t, audible) {
  const devices = new Map();
  const streams = new Set();
  const text = new TextEncoder();
  const session = {
    version: 0, activeDeviceId: null, pendingDeviceId: null, trackId: null, duration: 120,
    position: 0, positionAt: 0, queue: [], queueIndex: -1, playing: false, shuffle: false, repeat: 'none',
  };
  let reachable = true;
  const status = () => {
    const serverTime = Date.now();
    return { serverTime, session: { ...session, leaseUntil: session.activeDeviceId && serverTime + 30_000 }, devices: [...devices.values()] };
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
    if (url.pathname === '/playback/devices') {
      devices.set(body.deviceId, { id: body.deviceId, name: body.name, online: true, platform: body.platform });
      emit();
    } else if (url.pathname === '/playback/command') {
      const { command, deviceId } = body;
      if (body.expectedVersion !== session.version) return Response.json({ snapshot: status() }, { status: 409 });
      if (command.type === 'play') {
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
      }
      session.version++;
      emit();
    } else if (url.pathname === '/playback/ack') {
      assert.equal(session.activeDeviceId, body.deviceId);
      assert.equal(audible.size, 0, 'old output paused before acknowledgement');
      session.activeDeviceId = session.pendingDeviceId;
      session.pendingDeviceId = null;
      session.version++;
      emit();
    }
    return Response.json(status());
  });
  return { session, status, emit, setReachable: (value) => { reachable = value; } };
}

async function eventually(condition, label) {
  for (let tries = 0; tries < 100; tries++) {
    if (condition()) return;
    await setTimeout(10);
  }
  assert.fail(label);
}

test('two playback controllers hand off one engine, recover within a lease, and fail silent at expiry', async (t) => {
  const { host, document, audible, playCalls, blockNextPlay } = browser(t);
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

    api.setReachable(false);
    host.dispatchEvent(new Event('offline'));
    assert.equal(second.getView().connection, 'reconnecting');
    assert.equal(audible.size, 1, 'a short interruption keeps prior exclusive permission');
    api.setReachable(true);
    host.dispatchEvent(new Event('online'));
    await eventually(() => second.getView().connection === 'online', 'connection recovered');
    assert.equal(audible.size, 1);

    api.setReachable(false);
    host.dispatchEvent(new Event('offline'));
    elapsed = 31_000;
    document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(audible.size, 0, 'silence past the last confirmed permit');
    assert.equal(second.getView().mode, 'remote');
  } finally {
    first.dispose(false);
    second.dispose(false);
  }
});
