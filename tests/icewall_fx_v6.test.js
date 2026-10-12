'use strict';
// v6 item 41: Ice Wall visual rework. Headless: the shard layout is deterministic per wall seed, covers the wall length and stays inside the sim
// footprint (segment A-B, half-width r); the rise/melt timeline is centre-outward then staggered; sprites are cached per (h, w, variant).
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');

function fakeCanvas() {
  const ctx = { fills: 0, fillRect() { this.fills++; }, drawImage() {}, set fillStyle(v) {}, set globalCompositeOperation(v) {}, set globalAlpha(v) {} };
  return { width: 0, height: 0, getContext() { return ctx; } };
}
const IT = load(['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/sim/util.js', 'js/render/pixel.js', 'js/render/particles.js', 'js/render/fx.js']);
const F = IT.FX, U = IT.U;
const A = { ax: 1000, ay: 2000, bx: 1000, by: 3200 };                 // 1200-long wall, facing east (cast: centre 200 in front)
const lay = (seed, o, w) => F.iceWallLayout(seed, (o || A).ax, (o || A).ay, (o || A).bx, (o || A).by, w || 105, 6);

test('layout is deterministic per seed and differs between seeds', () => {
  const a = lay(7), b = lay(7), c = lay(8);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a.shards)), JSON.parse(JSON.stringify(b.shards)));
  assert.notDeepStrictEqual(a.shards.map(s => s.h), c.shards.map(s => s.h));
  assert.ok(a.shards.length > 60 && a.shards.length < 400, 'shard count ' + a.shards.length);
});

test('shards vary: heights 8-22, widths 3-8, several distinct values', () => {
  const l = lay(3);
  const hs = new Set(l.shards.map(s => s.h)), ws = new Set(l.shards.map(s => s.w));
  for (const s of l.shards) { assert.ok(s.h >= 8 && s.h <= 22); assert.ok(s.w >= 3 && s.w <= 8); assert.ok(s.v >= 0 && s.v <= 2); }
  assert.ok(hs.size >= 8 && ws.size >= 3, `h ${hs.size} w ${ws.size}`);
});

test('shards cover the wall length without big gaps', () => {
  for (const seed of [1, 2, 99, 12345]) {
    const l = lay(seed), ss = l.shards.map(s => s.s).sort((a, b) => a - b);
    assert.ok(ss[0] <= -600 + 40 && ss[ss.length - 1] >= 600 - 40, 'ends ' + ss[0] + ' ' + ss[ss.length - 1]);
    for (let i = 1; i < ss.length; i++) assert.ok(ss[i] - ss[i - 1] <= 40, 'gap ' + (ss[i] - ss[i - 1]));
  }
});

test('every shard base stays inside the sim footprint (also Scepter width, any orientation)', () => {
  for (const [width, o] of [[105, A], [150, A], [105, { ax: 0, ay: 0, bx: 848, by: 848 }], [150, { ax: 500, ay: 900, bx: -300, by: 100 }]]) {
    const l = lay(5, o, width);
    for (const s of l.shards) {
      assert.ok(U.segDist(s.wx, s.wy, o.ax, o.ay, o.bx, o.by) <= width + 1e-6, 'outside footprint');
      assert.ok(Math.abs(s.s) <= l.half + 1e-6 && Math.abs(s.o) <= 0.4 * width + 1e-6);
    }
  }
});

test('chunks hold every shard once, sorted back-to-front by base y', () => {
  const l = lay(11), ids = [];
  for (const c of l.chunks) { for (let i = 0; i < c.length; i++) { ids.push(c[i].i); if (i) assert.ok(c[i].wy >= c[i - 1].wy); } }
  assert.strictEqual(ids.length, l.shards.length);
  assert.strictEqual(new Set(ids).size, ids.length);
});

test('timeline: rises centre-outward within ~0.4 s, melts staggered inside the last 0.6 s, gone at dur', () => {
  const l = lay(4), dur = 4, byD = l.shards.slice().sort((a, b) => a.d - b.d);
  for (const s of l.shards) {
    assert.strictEqual(JSON.stringify(F.iceWallPhase(-0.1, dur, s)), '[0,0]');
    const full = F.iceWallPhase(0.4, dur, s); assert.strictEqual(full[0], 1); assert.strictEqual(full[1], 0);
    assert.strictEqual(F.iceWallPhase(dur - 0.61, dur, s)[1], 0);                 // nothing melts before the last 0.6 s
    assert.strictEqual(F.iceWallPhase(dur, dur, s)[1], 1);
  }
  const rise = (t, s) => F.iceWallPhase(t, dur, s)[0];
  const t = 0.12;                                                                   // mid-spawn: nearer shards are never behind farther ones
  assert.ok(rise(t, byD[0]) >= rise(t, byD[byD.length - 1]));
  assert.ok(rise(t, byD[0]) > 0 && rise(t, byD[byD.length - 1]) < 1 || rise(t, byD[0]) > rise(t, byD[byD.length - 1]));
  const melts = l.shards.map(s => F.iceWallPhase(dur - 0.3, dur, s)[1]);
  assert.ok(Math.min(...melts) < Math.max(...melts), 'melt is staggered');
});

test('sprites are built once per (h, w, variant) and sized h+1 x w+2', () => {
  const vm = require('vm'), fs = require('fs'), path = require('path');
  const ctx = vm.createContext({ console, Math, JSON, Map, Set, Array, Object, Number, Uint32Array, Float32Array, Uint8Array, Int16Array, document: { createElement: fakeCanvas } });
  for (const f of ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/sim/util.js', 'js/render/pixel.js', 'js/render/particles.js', 'js/render/fx.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
  const FX = ctx.IT.FX, a = FX.iceWallSprite(18, 6, 1), b = FX.iceWallSprite(18, 6, 1), c = FX.iceWallSprite(18, 6, 2);
  assert.strictEqual(a, b); assert.notStrictEqual(a, c);
  assert.strictEqual(a.h, 19); assert.strictEqual(a.w, 8);
  assert.ok(a.cv.getContext('2d').fills > 20, 'pixels drawn');
});

test('frost + meltwater ramps are pre-registered (addRamp is idempotent)', () => {
  assert.strictEqual(IT.Particles.addRamp('frost', []), 'frost'); assert.strictEqual(IT.Particles.addRamp('meltwater', []), 'meltwater');
});
