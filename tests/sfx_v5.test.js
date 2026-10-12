'use strict';
// Batch S sound redesign: every hooked SFX id has a definition, every voice builds against a STRICT WebAudio mock (the real API throws on
// exponential ramps to <= 0, negative times, non-finite values), durations / node counts stay bounded, and the module is inert without AudioContext.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SR = 44100;

// ---- strict WebAudio mock
const PARAMS = new Set(['frequency', 'gain', 'Q', 'detune', 'pan', 'delayTime', 'threshold', 'knee', 'ratio', 'attack', 'release']);
function strictParam(stat, owner) {
  const bad = m => { stat.errors.push(owner + ': ' + m); throw new RangeError(m); };
  const fin = (v, w) => { if (typeof v !== 'number' || !isFinite(v)) bad(w + ' not finite: ' + v); };
  const tm = (t, w) => { fin(t, w); if (t < 0) bad(w + ' negative time ' + t); };
  const p = { _v: 0 };
  Object.defineProperty(p, 'value', { get: () => p._v, set: v => { fin(v, 'value'); p._v = v; } });
  p.setValueAtTime = (v, t) => { fin(v, 'setValueAtTime'); tm(t, 'setValueAtTime t'); p._v = v; return p; };
  p.linearRampToValueAtTime = (v, t) => { fin(v, 'linearRamp'); tm(t, 'linearRamp t'); p._v = v; return p; };
  p.exponentialRampToValueAtTime = (v, t) => {
    fin(v, 'expRamp'); tm(t, 'expRamp t');
    if (!(v > 0)) bad('exponentialRamp to ' + v);
    if (owner === 'frequency' && v > SR / 2 + 1) bad('frequency above Nyquist ' + v);
    p._v = v; return p;
  };
  p.setTargetAtTime = (v, t, k) => { fin(v, 'setTarget'); tm(t, 'setTarget t'); fin(k, 'setTarget k'); p._v = v; return p; };
  p.cancelScheduledValues = t => { tm(t, 'cancel'); return p; };
  return p;
}
function mockNode(stat, kind) {
  const cache = {};
  const fn = function () { return mockNode(stat); };
  return new Proxy(fn, {
    get(t, k) {
      if (typeof k === 'symbol') return undefined;
      if (k === 'connect') return x => x;
      if (k === 'disconnect') return () => {};
      if (k === 'getChannelData') return () => cache.__d || (cache.__d = new Float32Array(cache.length || 64));
      if (k === 'sampleRate') return SR;
      if (k === 'state') return 'running';
      if (k === 'currentTime') return 0;
      if (k === 'start') return (when) => { if (when != null && (!isFinite(when) || when < 0)) { stat.errors.push('start(' + when + ')'); throw new RangeError('start'); } stat.starts++; };
      if (k === 'stop') return (when) => { if (when != null && (!isFinite(when) || when < 0)) { stat.errors.push('stop(' + when + ')'); throw new RangeError('stop'); } stat.maxStop = Math.max(stat.maxStop, when || 0); };
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
      if (k === 'currentTime') return 0;
      if (k === 'state') return 'running';
      if (k === 'destination') return root.destination;
      if (k === 'createBuffer') return (ch, len) => { stat.nodes++; const d = new Float32Array(len); return { getChannelData: () => d, length: len, sampleRate: SR }; };
      if (k === 'resume') return () => Promise.resolve();
      if (typeof k === 'string' && k.startsWith('create')) return () => { stat.nodes++; return mockNode(stat); };
      return root[k];
    },
  });
}

function load(files, opts) {
  opts = opts || {};
  const stat = { errors: [], starts: 0, maxStop: 0, nodes: 0 };
  const g = { console, Math, JSON, Date, Map, Set, Array, Object, Number, String, Boolean, Error, Symbol, Promise, Float32Array, Infinity, NaN, isFinite, isNaN,
    performance: { now: () => Date.now() }, setTimeout, clearTimeout, setInterval, clearInterval, addEventListener() {}, removeEventListener() {} };
  if (!opts.noAudio) g.AudioContext = function () { return mockCtx(stat); };
  const ctx = vm.createContext(g);
  g.window = ctx;
  vm.runInContext('globalThis.IT = {};', ctx);
  for (const f of files) vm.runInContext(read(f), ctx, { filename: f });
  return { ctx, stat, IT: ctx.IT };
}
const FILES = ['js/audio.js', 'js/sfxvoices.js', 'js/ui/uisound.js', 'js/sfx.js'];

// ---- ids the game hooks
function hookedIds() {
  const ids = new Set();
  const sfx = read('js/sfx.js'), ui = read('js/ui/uisound.js'), inp = read('js/input.js') + read('js/ui/combobar.js') + read('js/main.js');
  for (const m of sfx.matchAll(/\bP\('([A-Za-z0-9_:]+)'/g)) if (!/[_:]$/.test(m[1]) && m[1] !== 'orb') ids.add(m[1]); // skip dynamic prefixes ('orb' + x, 'cast_' + x)
  for (const m of sfx.matchAll(/CAST = \{([^}]*)\}/g)) for (const x of m[1].matchAll(/:\s*'([A-Za-z0-9_]+)'/g)) ids.add(x[1]);
  for (const m of ui.matchAll(/KINDS = \{([^}]*)\}/g)) for (const x of m[1].matchAll(/:\s*'([A-Za-z0-9_]+)'/g)) ids.add(x[1]);
  for (const m of inp.matchAll(/SFX\.(?:play|playEx)\('([A-Za-z0-9_:]+)'/g)) ids.add(m[1]);
  for (const o of ['Q', 'W', 'E']) ids.add('orb' + o);
  for (const a of ['coldsnap', 'ghostwalk', 'icewall', 'emp', 'tornado', 'alacrity', 'forgespirit', 'deafeningblast']) ids.add('cast_' + a);
  return [...ids].sort();
}

test('every hooked SFX id has a definition', () => {
  const { IT } = load(FILES);
  const ids = hookedIds();
  assert.ok(ids.length > 60, 'found ' + ids.length + ' ids');
  const missing = ids.filter(i => !IT.SFX.has(i));
  assert.deepStrictEqual(missing, []);
});

test('required character voices exist', () => {
  const { IT } = load(FILES);
  const need = ['orbQ', 'orbW', 'orbE', 'invoke', 'cast_coldsnap', 'csTarget', 'csProc', 'cast_ghostwalk', 'cast_icewall', 'iceWall', 'iceCrunch', 'cast_emp', 'empCrackle', 'empPop',
    'cast_tornado', 'cast_alacrity', 'castSun', 'sunBeam', 'sunImpact', 'cast_forgespirit', 'spiritSpawn', 'castMeteor', 'meteorWhistle', 'meteorLand', 'meteorCrumble',
    'cast_deafeningblast', 'deafeningHit', 'bkb', 'blink', 'blinkIn', 'refresher', 'hex', 'atosLaunch', 'atosHit', 'hammerImpact', 'shiva', 'fx:forceStaff', 'fx:eulsCyclone',
    'hit', 'hurt', 'kill', 'heroDeath', 'towerShot', 'towerDown', 'ui_click', 'ui_hover', 'ui_level', 'comboDone', 'comboPerfect', 'comboFail', 'levelUp', 'cdTick', 'cdGo'];
  assert.deepStrictEqual(need.filter(i => !IT.SFX.has(i)), []);
});

test('every voice builds on a strict WebAudio mock (no bad ramps, times, frequencies)', () => {
  const { IT, stat } = load(FILES);
  const names = Object.keys(IT.SFX.defs);
  assert.ok(names.length >= 100, 'voices: ' + names.length);
  const bad = [];
  for (const n of names) {
    for (const o of [{ dur: 1.7 }, { dur: 0.3 }, { dur: 5 }]) {
      const st0 = stat.errors.length;
      const b = { c: IT.SFX.ctx(), t0: 0.01, out: IT.SFX.ctx().createGain(), nodes: [], end: 0, opt: o, pv: 1, gv: 1 };
      try { IT.SFX.defs[n](b); } catch (e) { bad.push(n + ' ' + JSON.stringify(o) + ': ' + e.message); }
      if (stat.errors.length > st0) bad.push(n + ' ' + JSON.stringify(o) + ': ' + stat.errors.slice(st0).join('; '));
    }
  }
  assert.deepStrictEqual(bad, []);
});

test('voice durations and node counts are bounded', () => {
  const { IT } = load(FILES);
  const long = { empCrackle: 1, sunBeam: 1, meteorWhistle: 1, hammerFall: 1, twisterWhirl: 1, 'fx:eulsCyclone': 1, shiva: 1 };
  const tooLong = [], tooBig = [], silent = [];
  for (const n of Object.keys(IT.SFX.defs)) {
    const b = { c: IT.SFX.ctx(), t0: 0.01, out: IT.SFX.ctx().createGain(), nodes: [], end: 0, opt: { dur: 1.7 }, pv: 1, gv: 1 };
    IT.SFX.defs[n](b);
    const cap = long[n] ? 4.5 : 3.2;
    if (b.end > cap) tooLong.push(n + ' ' + b.end.toFixed(2));
    if (b.nodes.length > 320) tooBig.push(n + ' ' + b.nodes.length);
    if (b.nodes.length < 2 || b.end < 0.02) silent.push(n);
  }
  assert.deepStrictEqual(tooLong, []);
  assert.deepStrictEqual(tooBig, []);
  assert.deepStrictEqual(silent, []);
});

test('legacy fallbacks are overridden by the new voices', () => {
  const a = load(['js/audio.js']), b = load(['js/audio.js', 'js/sfxvoices.js']);
  for (const k of ['click', 'fail', 'success', 'hit', 'hurt', 'kill']) assert.ok(a.IT.SFX.has(k), k + ' legacy');
  assert.notStrictEqual(String(a.IT.SFX.defs.hit), String(b.IT.SFX.defs.hit));
});

test('loads and stays inert without AudioContext', async () => {
  const { IT, ctx } = load(FILES, { noAudio: true });
  assert.ok(IT.SFX && IT.Sfx && IT.UISound);
  assert.doesNotThrow(() => { IT.SFX.playEx('invoke'); IT.SFX.play('hit'); IT.SFX.audition(['hit'], 1); IT.UISound.play('click'); IT.UISound.play('level'); });
  assert.strictEqual(IT.SFX.board(), null);          // no document
  assert.strictEqual(await IT.SFX.render('invoke'), null); // no OfflineAudioContext
  assert.ok(IT.SFX.ids().length > 100);
  void ctx;
});

test('new event hooks reach the new voices', () => {
  const { IT, ctx } = load(FILES);
  const played = [];
  for (const k of Object.keys(IT.SFX.defs)) { const o = IT.SFX.defs[k]; IT.SFX.defs[k] = b => { played.push(k); o(b); }; }
  const ents = { 1: { id: 1, kind: 'hero', x: 0, y: 0 }, 2: { id: 2, kind: 'dummy', x: 300, y: 0 }, 3: { id: 3, kind: 'tower', x: 200, y: 0 } };
  const h = {};
  const w = { hero: ents[1], t: 0, paused: false, get: id => ents[id], query: () => [],
    on(t, f) { (h[t] = h[t] || []).push(f); return () => { h[t] = h[t].filter(x => x !== f); }; },
    emit(t, p) { (h[t] || []).slice().forEach(f => f(p)); } };
  IT.Sfx.attach(w);
  try {
    w.emit('towerAttack', { unit: 3, target: 1 });
    w.emit('towerDown', { unit: 3, team: 1, tier: 1 });
    w.emit('kill', { unit: 2, by: 1 });
    w.emit('heroDown', { unit: 1 });
    w.emit('scnGo', {});
    w.emit('levelUp', {});
    assert.ok(IT.Sfx.calls > 0);
    for (const id of ['towerShot', 'towerDown', 'kill', 'heroDeath', 'cdGo', 'levelUp']) assert.ok(played.includes(id), id + ' played; got ' + played.join(','));
  } finally { IT.Sfx.detach(); }
  void ctx;
});

test('sources keep CRLF line endings', () => {
  for (const f of ['js/sfxvoices.js', 'js/sfx.js', 'js/audio.js', 'js/ui/uisound.js', 'tests/sfx_v5.test.js']) {
    const s = read(f);
    assert.ok(!/[^\r]\n/.test(s), f + ' has a bare LF');
  }
});
