'use strict';
// v6: Deafening Blast radial talent keeps the single-blast sand budget; Meteor Hammer fragments are staggered, readable rocks.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function sandEnv() {
  const noop = () => {};
  const cx = new Proxy({}, { get: (t, k) => k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }) : (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  const document = { createElement: () => ({ width: 0, height: 0, getContext: () => cx }) };
  const ctx = vm.createContext({ console, Math, Map, Set, Float32Array, Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array, Int32Array, Int16Array, Int8Array, document });
  for (const f of ['js/render/pixel.js', 'js/render/sand.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
  return ctx.IT;
}
function mkR(ents) {
  const cx = new Proxy({}, { get: () => () => {} });
  return { VW: 240, VH: 135, P: 6, camX: 0, camY: 0, w: { ents, fog: false }, fog: null, cx, gx: cx, time: 0, simT: 0, lightmap: { buf: {} } };
}
// sand/flyers spawned by one blast thinker over its flight (fixed seed: the engine's rng is module-seeded)
function blastFlyers(dirs) {
  const IT = sandEnv(), e = { kind: 'thinker', ability: 'deafeningblast', x: 1200, y: 800, r: 100, dir: 0, dirs, front: 0, team: 0, statuses: [] };
  const R = mkR([e]);
  IT.Sand.init(R);
  let spawned = 0, last = 0;
  for (let i = 0; i < 40; i++) {
    e.front = 40 + i * 25;
    IT.Sand.update(R, 1 / 60);
    const now = IT.Sand.flyers; spawned += Math.max(0, now - last); last = now;
  }
  return { flyers: IT.Sand.flyers, peak: spawned, cells: IT.Sand.cells };
}

test('Deafening Blast talent (12 radial dirs): airborne sand stays about one normal Blast, not 12x', () => {
  const one = blastFlyers([0]);
  const ring = blastFlyers(Array.from({ length: 12 }, (_, i) => i * Math.PI / 6));
  assert.ok(one.flyers > 100, 'a normal blast throws sand: ' + one.flyers);
  assert.ok(ring.flyers < one.flyers * 1.5, 'ring ' + ring.flyers + ' vs single ' + one.flyers);
  assert.ok(ring.cells < one.cells * 1.5 + 20, 'settled sand: ' + ring.cells + ' vs ' + one.cells);
});

test('Meteor Hammer fall: 12-15 fragments queued, landing staggered over the fall window, and drawAir renders them', () => {
  const IT = sandEnv(), R = mkR([]);
  IT.Sand.init(R);
  IT.Sand.event({ name: 'meteorFall', ability: 'meteorhammer', x: 1200, y: 800, r: 400, delay: 1.2 });
  const n0 = IT.Sand.flyers;
  assert.ok(n0 >= 12 && n0 <= 15, 'fragments: ' + n0);
  let landed = 0, firstLand = -1, lastLand = -1;
  for (let i = 0; i < 100; i++) {
    const before = IT.Sand.flyers;
    IT.Sand.update(R, 1 / 60); IT.Sand.drawAir(R);
    if (IT.Sand.cells > landed) { landed = IT.Sand.cells; if (firstLand < 0) firstLand = i; lastLand = i; }
    void before;
  }
  assert.ok(lastLand - firstLand >= 20, 'impacts spread over ' + (lastLand - firstLand) + ' frames');
});
