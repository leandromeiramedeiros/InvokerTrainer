'use strict';
// v6 WP10: situation-driven procedural music. Every track schedules notes on a STRICT WebAudio mock (bad ramps / times / Nyquist throw), the
// scheduler survives long runs, situations crossfade, sync(w) maps scenario state -> track, mute/volume settings are respected.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SR = 44100;

function strictParam(stat, owner) {
  const bad = m => { stat.errors.push(owner + ': ' + m); throw new RangeError(m); };
  const fin = (v, w) => { if (typeof v !== 'number' || !isFinite(v)) bad(w + ' not finite: ' + v); };
  const tm = (t, w) => { fin(t, w); if (t < 0) bad(w + ' negative time ' + t); };
  const p = { _v: 0 };
  Object.defineProperty(p, 'value', { get: () => p._v, set: v => { fin(v, 'value'); p._v = v; } });
  p.setValueAtTime = (v, t) => { fin(v, 'set'); tm(t, 'set t'); p._v = v; return p; };
  p.linearRampToValueAtTime = (v, t) => { fin(v, 'lin'); tm(t, 'lin t'); p._v = v; return p; };
  p.exponentialRampToValueAtTime = (v, t) => { fin(v, 'exp'); tm(t, 'exp t'); if (!(v > 0)) bad('exp to ' + v); if (owner === 'frequency' && v > SR / 2 + 1) bad('freq above Nyquist ' + v); p._v = v; return p; };
  p.setTargetAtTime = (v, t, k) => { fin(v, 'target'); tm(t, 'target t'); fin(k, 'target k'); p._v = v; return p; };
  p.cancelScheduledValues = t => { tm(t, 'cancel'); return p; };
  return p;
}
const PARAMS = new Set(['frequency', 'gain', 'Q', 'detune', 'pan', 'delayTime', 'threshold', 'knee', 'ratio', 'attack', 'release']);
function mockNode(stat) {
  const cache = {};
  return new Proxy(function () {}, {
    get(t, k) {
      if (typeof k === 'symbol') return undefined;
      if (k === 'connect') return x => x;
      if (k === 'disconnect') return () => {};
      if (k === 'getChannelData') return () => cache.__d || (cache.__d = new Float32Array(64));
      if (k === 'start') return when => { if (when != null && (!isFinite(when) || when < 0)) { stat.errors.push('start(' + when + ')'); throw new RangeError('start'); } stat.starts++; };
      if (k === 'stop') return when => { if (when != null && (!isFinite(when) || when < 0)) { stat.errors.push('stop(' + when + ')'); throw new RangeError('stop'); } };
      if (PARAMS.has(k)) return cache[k] || (cache[k] = strictParam(stat, k));
      return cache[k] || (cache[k] = mockNode(stat));
    },
    set(t, k, v) { cache[k] = v; return true; },
  });
}
function mockCtx(stat) {
  const root = mockNode(stat);
  return new Proxy({}, {
    get(t, k) {
      if (k === 'sampleRate') return SR;
      if (k === 'currentTime') return stat.now;
      if (k === 'state') return 'running';
      if (k === 'destination') return root.destination;
      if (k === 'createBuffer') return (ch, len) => { const d = new Float32Array(len); return { getChannelData: () => d, length: len, sampleRate: SR }; };
      if (k === 'resume') return () => Promise.resolve();
      if (typeof k === 'string' && k.startsWith('create')) return () => { stat.nodes++; return mockNode(stat); };
      return root[k];
    },
  });
}
function load(settings) {
  const stat = { errors: [], starts: 0, nodes: 0, now: 0 };
  const g = { console, Math, JSON, Date, Map, Set, Array, Object, Number, String, Boolean, Error, Symbol, Promise, Float32Array, Infinity, NaN, isFinite, isNaN,
    performance: { now: () => Date.now() }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, addEventListener() {}, removeEventListener() {},
    navigator: { userActivation: { hasBeenActive: true } } };
  g.AudioContext = function () { return mockCtx(stat); };
  const ctx = vm.createContext(g);
  g.window = ctx;
  vm.runInContext('globalThis.IT = {};', ctx);
  if (settings) ctx.IT.Settings = { get: () => settings, onChange() {} };
  for (const f of ['js/audio.js', 'js/sfxvoices.js', 'js/sfx.js', 'js/music.js']) vm.runInContext(read(f), ctx, { filename: f });
  return { ctx, stat, M: ctx.IT.Music };
}
// run the scheduler for `sec` seconds of audio time; returns oscillator/source starts produced
function run(L, sec) {
  const s0 = L.stat.starts, end = L.stat.now + sec;
  while (L.stat.now < end) { L.stat.now += 0.09; L.M._tick(); }
  return L.stat.starts - s0;
}
const NAMES = ['menu', 'sandbox', 'countdown', 'play', 'escape', 'splash', 'result_win', 'result_fail'];

test('all situations exist', () => {
  const { M } = load();
  assert.deepStrictEqual(M.names().slice().sort(), NAMES.slice().sort());
});

test('every situation schedules notes for 40 s with no WebAudio errors', () => {
  for (const n of NAMES) {
    const L = load();
    L.M.situation(n);
    assert.strictEqual(L.M.theme, n, n + ' active');
    const made = run(L, 40), min = n.startsWith('result') ? 4 : 200;
    assert.ok(made > min, n + ' notes: ' + made);
    assert.deepStrictEqual(L.stat.errors, [], n);
  }
});

test('lowtime layer adds notes to play and escape and never errors', () => {
  for (const n of ['play', 'escape']) {
    const a = load(), b = load();
    a.M.situation(n); b.M.situation(n); b.M.lowtime(true);
    const na = run(a, 20), nb = run(b, 20);
    assert.ok(nb > na, n + ' low ' + nb + ' > ' + na);
    assert.deepStrictEqual(b.stat.errors, []);
  }
});

test('escape is at least as dense as play', () => {
  const p = load(), e = load();
  p.M.situation('play'); e.M.situation('escape');
  assert.ok(run(e, 20) > run(p, 20) * 0.9);
});

test('crossfades between every pair of situations without exceptions', () => {
  const L = load();
  for (const a of NAMES) for (const b of NAMES) {
    L.M.situation(a); run(L, 1.5);
    L.M.situation(b); run(L, 1.5);
    assert.strictEqual(L.M.theme, b);
  }
  assert.deepStrictEqual(L.stat.errors, []);
});

test('situation is idempotent; legacy names alias', () => {
  const L = load();
  L.M.situation('menu'); const n = L.stat.nodes; L.M.situation('menu'); assert.strictEqual(L.stat.nodes, n);
  L.M.play('ranked'); assert.strictEqual(L.M.theme, 'play');
  L.M.situation('hold'); assert.strictEqual(L.M.theme, 'escape');
  L.M.situation('nope'); assert.strictEqual(L.M.theme, 'escape');
});

test('sync(w): no run -> sandbox; countdown; play by objective; lowtime < 8 s; result win/fail', () => {
  const L = load(), M = L.M;
  const w = { t: 100, ranked: null };
  M.sync(w); assert.strictEqual(M.theme, 'sandbox');
  const mk = (phase, type, extra) => Object.assign({ phase, mode: 'ranked', t0: 100, pr: { limit: 20, sc: { obj: { type } } }, result: null }, extra);
  w.ranked = mk('countdown', 'kill'); M.sync(w); assert.strictEqual(M.theme, 'countdown');
  w.ranked = mk('idle', 'kill'); M.sync(w); assert.strictEqual(M.theme, 'countdown');
  w.ranked = mk('play', 'kill'); M.sync(w); assert.strictEqual(M.theme, 'play'); assert.strictEqual(M.low, false);
  w.t = 111; M.sync(w); assert.strictEqual(M.low, false); // 9 s left
  w.t = 112.5; M.sync(w); assert.strictEqual(M.low, true); // 7.5 s left
  w.t = 100; w.ranked = mk('play', 'escape'); M.sync(w); assert.strictEqual(M.theme, 'escape'); assert.strictEqual(M.low, false);
  w.ranked = mk('play', 'hold'); M.sync(w); assert.strictEqual(M.theme, 'escape');
  w.ranked = mk('play', 'kill', { mode: 'sandbox' }); w.t = 10000; M.sync(w); assert.strictEqual(M.theme, 'play'); assert.strictEqual(M.low, false); // sandbox scenario: no limit
  w.t = 100; w.ranked = mk('result', 'kill', { result: { ok: true } }); M.sync(w); assert.strictEqual(M.theme, 'result_win');
  w.ranked = mk('result', 'kill', { result: { ok: false } }); M.sync(w); assert.strictEqual(M.theme, 'result_fail');
  run(L, 3); assert.deepStrictEqual(L.stat.errors, []);
});

test('mute / volume settings: no sequenced notes while music is off or at 0', () => {
  for (const s of [{ sound: false }, { audio: { musicOn: false, music: 0.5 } }, { audio: { musicOn: true, music: 0 } }]) {
    const L = load(s);
    L.M.situation('menu');
    assert.ok(run(L, 10) < 30, JSON.stringify(s)); // only the init drone
  }
});

test('stop() clears the theme; stingers still work', () => {
  const L = load();
  L.M.situation('menu'); run(L, 2); L.M.stop(); assert.strictEqual(L.M.theme, null);
  for (const k of ['up', 'down', 'reveal', 'start', 'success', 'fail']) L.M.stinger(k);
  assert.deepStrictEqual(L.stat.errors, []);
});

test('wiring: main.js drives sync(), countdown/sandbox on start, splash on finish', () => {
  const m = read('js/main.js');
  assert.ok(/IT\.Music\.sync\(w\)/.test(m));
  assert.ok(m.includes("music(run ? 'countdown' : 'sandbox')"));
  assert.ok(m.includes("'splash'") && m.includes("music('menu')"));
});
