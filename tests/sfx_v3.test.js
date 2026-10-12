'use strict';
// sfx.js: every voice builds, events map to layers, loops stop on end/detach. Mock WebAudio; fake world.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

function mockNode() {
  const cache = {};
  const fn = function () { return mockNode(); };
  return new Proxy(fn, {
    get(t, k) {
      if (k === 'connect') return x => x;
      if (k === 'getChannelData') return () => new Float32Array(64);
      if (k === 'sampleRate') return 44100;
      if (k === 'state') return 'running';
      if (k === 'currentTime') return 0;
      if (typeof k === 'symbol') return undefined;
      return cache[k] || (cache[k] = mockNode());
    },
    set(t, k, v) { cache[k] = v; return true; },
  });
}
function setup(settings) {
  const timers = new Set();
  const g = { console, Math, JSON, Date, Map, Set, Array, Object, Number, String, Boolean, Error, Symbol, Promise, Float32Array, Infinity, NaN, isFinite, isNaN,
    performance: { now: () => Date.now() },
    setTimeout(f, ms) { const id = setTimeout(f, ms); timers.add(id); return id; }, clearTimeout, setInterval(f, ms) { const id = setInterval(f, ms); timers.add(id); return id; }, clearInterval,
    addEventListener() {}, removeEventListener() {},
    AudioContext: function () { return mockNode(); } };
  const ctx = vm.createContext(g);
  g.window = ctx;
  vm.runInContext('globalThis.IT = {};', ctx);
  for (const f of ['js/audio.js', 'js/sfxvoices.js', 'js/sfx.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const IT = ctx.IT;
  if (settings) IT.Settings = { get: () => settings };
  const errs = [], played = [];
  for (const k of Object.keys(IT.SFX.defs)) { const o = IT.SFX.defs[k]; IT.SFX.defs[k] = b => { played.push(k); try { o(b); } catch (e) { errs.push(k + ': ' + e.message); } }; }
  const ents = { 1: { id: 1, kind: 'hero', x: 0, y: 0 }, 2: { id: 2, kind: 'dummy', x: 300, y: 0 }, 3: { id: 3, kind: 'spirit', x: 100, y: 0 } };
  const h = {}, th = [];
  const w = { hero: ents[1], t: 0, paused: false, get: id => ents[id], query: f => Object.values(ents).concat(th).filter(f),
    on(t, f) { (h[t] = h[t] || []).push(f); return () => { h[t] = h[t].filter(x => x !== f); }; },
    emit(t, p) { (h[t] || []).slice().forEach(f => f(p)); } };
  return { IT, w, errs, played, ents, th, close() { for (const t of timers) { clearTimeout(t); clearInterval(t); } IT.Sfx.detach(); } };
}
const fx = (w, name, o) => w.emit('fx', Object.assign({ name, x: 300, y: 0 }, o));
const wait = ms => new Promise(r => setTimeout(r, ms));

test('every voice builds without throwing', () => {
  const s = setup();
  try {
    for (const k of Object.keys(s.IT.SFX.defs)) s.IT.SFX.playEx(k, { vol: 1, dur: 1.5, prio: true });
    assert.deepStrictEqual(s.errs, []);
    assert.ok(s.played.length > 80, 'played ' + s.played.length);
  } finally { s.close(); }
});

test('required layers exist', () => {
  const s = setup();
  try {
    const need = ['atkPre', 'atkLaunch', 'atkImpact', 'spiritLaunch', 'spiritImpact', 'footstep', 'cast_coldsnap', 'csTarget', 'csProc', 'cast_ghostwalk', 'cast_icewall', 'iceCrunch',
      'cast_emp', 'empCrackle', 'empPop', 'cast_tornado', 'cast_tornado_dark', 'tornadoLift', 'tornadoLand', 'cast_alacrity', 'castSun', 'sunBeam', 'sunImpact', 'cast_forgespirit',
      'castMeteor', 'meteorWhistle', 'meteorLand', 'meteorBurn', 'meteorCrumble', 'cast_deafeningblast', 'cast_deafeningblast_dark', 'hammerStart', 'hammerFall', 'hammerImpact',
      'atosLaunch', 'atosHit', 'fx:gleipnirLaunch', 'fx:gleipnirHit', 'castitem_orchid', 'fx:orchidHit', 'fx:orchidBurst', 'hex', 'shiva', 'bkb', 'refresher', 'blink', 'tpStart', 'tpArrive'];
    for (const n of need) assert.ok(s.IT.SFX.has(n), 'missing voice ' + n);
  } finally { s.close(); }
});

test('events trigger layers; wind-up cancel -> no launch; per-tick throttle', () => {
  const s = setup(); const { w, IT } = s;
  try {
    IT.Sfx.attach(w);
    w.emit('attackStart', { src: 1, target: 2 });
    assert.ok(s.played.includes('atkPre'));
    assert.ok(!s.played.includes('atkLaunch'), 'cancelled wind-up must not launch');
    w.emit('attack', { src: 1, target: 2 }); w.emit('attackHit', { src: 1, target: 2 });
    assert.ok(s.played.includes('atkLaunch') && s.played.includes('atkImpact'));
    w.emit('attack', { src: 3, target: 2 }); w.emit('attackHit', { src: 3, target: 2 });
    assert.ok(s.played.includes('spiritLaunch') && s.played.includes('spiritImpact'));
    fx(w, 'coldsnapFreeze', { unit: 2 }); assert.ok(s.played.includes('csTarget'));
    fx(w, 'coldsnapFreeze', { unit: 2, proc: true }); fx(w, 'coldsnapProc', { unit: 2 }); assert.ok(s.played.includes('csProc'));
    fx(w, 'empCharge', { delay: 2.9 }); fx(w, 'empBlast'); fx(w, 'sunstrikeBeam', { delay: 1.7 }); fx(w, 'sunstrikeHit');
    fx(w, 'meteorFall', { ability: 'chaosmeteor', delay: 1.3 }); fx(w, 'meteorLand');
    fx(w, 'meteorFall', { ability: 'meteorhammer', delay: 1 }); fx(w, 'meteorImpact', { ability: 'meteorhammer' });
    for (const n of ['empCrackle', 'empPop', 'sunBeam', 'sunImpact', 'meteorWhistle', 'meteorLand', 'hammerFall', 'hammerImpact']) assert.ok(s.played.includes(n), n);
    for (const n of ['iceWall', 'refresh', 'atosLaunch', 'atosHit', 'hexHit', 'shivaBlast', 'bkb', 'blinkStart', 'blinkEnd', 'gleipnirLaunch', 'gleipnirHit', 'orchidHit', 'orchidBurst', 'deafeningHit']) fx(w, n, { unit: 2 });
    for (const n of ['iceWall', 'refresher', 'atosLaunch', 'atosHit', 'hex', 'shiva', 'bkb', 'blink', 'blinkIn', 'fx:gleipnirLaunch', 'fx:gleipnirHit', 'fx:orchidHit', 'fx:orchidBurst', 'deafeningHit']) assert.ok(s.played.includes(n), n);
    const before = s.played.filter(x => x === 'iceCrunch').length;
    for (let i = 0; i < 12; i++) fx(w, 'iceWallTick', { unit: 10 + i });
    assert.ok(s.played.filter(x => x === 'iceCrunch').length - before <= 4, 'tick sounds are voice-limited');
    assert.deepStrictEqual(s.errs, []);
  } finally { s.close(); }
});

test('dark skin swaps tornado + deafening blast casts', () => {
  const s = setup({ sound: true, heroSkin: 'dark' }); const { w, IT } = s;
  try {
    IT.Sfx.attach(w);
    w.emit('cast', { unit: 1, ability: 'tornado', kind: 'spell', x: 0, y: 0 });
    w.emit('cast', { unit: 1, ability: 'deafeningblast', kind: 'spell', x: 0, y: 0 });
    assert.ok(s.played.includes('cast_tornado_dark') && s.played.includes('cast_deafeningblast_dark'));
    assert.ok(!s.played.includes('cast_tornado'));
  } finally { s.close(); }
});

test('loops start with their thing and stop when it ends / on detach', async () => {
  const s = setup(); const { w, IT } = s;
  try {
    IT.Sfx.attach(w);
    const base = IT.SFX.loops();               // idle bed
    s.th.push({ id: 50, kind: 'thinker', ability: 'tornado', dir: 0.5, x: 10, y: 0, dead: false });
    fx(w, 'tornadoStart', { dir: 0.5 });
    assert.ok(IT.SFX.loops() > base, 'tornado loop running');
    fx(w, 'tornadoEnd');
    await wait(1300);
    assert.strictEqual(IT.SFX.loops(), base, 'tornado loop stopped');
    fx(w, 'meteorRoll', { dur: 3 });
    assert.ok(IT.SFX.loops() > base, 'meteor loop running');
    fx(w, 'meteorEnd');
    await wait(1300);
    assert.strictEqual(IT.SFX.loops(), base, 'meteor loop stopped');
    fx(w, 'meteorChannel', { dur: 2.5 });
    assert.ok(IT.SFX.loops() > base);
    fx(w, 'meteorCancel');
    await wait(1300);
    assert.strictEqual(IT.SFX.loops(), base);
    fx(w, 'tornadoStart', { dir: 1 }); fx(w, 'meteorRoll', { dur: 3 });
    IT.Sfx.detach();
    await wait(1300);
    assert.strictEqual(IT.SFX.loops(), 0, 'detach stops all loops');
  } finally { s.close(); }
});

test('loop is stopped when its tornado entity dies', async () => {
  const s = setup(); const { w, IT } = s;
  try {
    IT.Sfx.attach(w);
    const e = { id: 51, kind: 'thinker', ability: 'tornado', dir: 2, x: 0, y: 0, dead: false };
    s.th.push(e);
    fx(w, 'tornadoStart', { dir: 2 });
    const n = IT.SFX.loops();
    await wait(200);       // tracker binds
    e.dead = true;
    await wait(1300);
    assert.ok(IT.SFX.loops() < n, 'loop stopped after entity death');
  } finally { s.close(); }
});
