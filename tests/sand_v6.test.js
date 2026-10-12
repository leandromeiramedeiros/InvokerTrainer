'use strict';
// v6 item 42: IT.Sand.createGlow (additive glow + bloom + height-layer pile that disperses). Mocked 2D context, seeded rng.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const IT = load(['js/render/pixel.js', 'js/render/sand.js', 'js/art/hood.js']);

function mockCv(w, h, log) {
  const mkCx = tag => {
    let op = 'source-over';
    return {
      set globalCompositeOperation(v) { op = v; log.ops.add(tag + ':' + v); }, get globalCompositeOperation() { return op; },
      globalAlpha: 1, fillStyle: '', imageSmoothingEnabled: false,
      clearRect() { log.n++; }, fillRect() { log.n++; log.fills++; }, drawImage() { log.n++; log.draws++; },
    };
  };
  const cx = mkCx('main');
  return { width: w, height: h, getContext: () => cx, _mk: mkCx };
}
const mkLog = () => ({ ops: new Set(), n: 0, fills: 0, draws: 0 });
const COLS = ['#ffe9a0', '#f2c444', '#c27a10'];

function run(seed, frames, setup) {
  const log = mkLog(), cv = mockCv(40, 30, log);
  const s = IT.Sand.createGlow(cv, { seed, floor: 29, gravity: 90, makeCanvas: (w, h) => Object.assign(mockCv(w, h, log), {}) });
  if (setup) setup(s);
  for (let i = 0; i < frames; i++) { s.step(1 / 60); s.draw(); }
  return { s, log };
}

test('height layer: seeded accumulation is deterministic and bounded by the column cap', () => {
  const burst = s => s.burst(20, 5, 120, COLS, { speed: 20, lift: 5, spread: 4 });
  const a = run(7, 150, burst), b = run(7, 150, burst), c = run(8, 150, burst);
  assert.deepEqual(a.s.heights(), b.s.heights());
  assert.notDeepEqual(a.s.heights(), c.s.heights());
  const hs = a.s.heights();
  assert.ok(a.s.pileCount() > 20, 'sand piled up: ' + a.s.pileCount());
  assert.equal(hs.reduce((x, y) => x + y, 0), a.s.pileCount());
  assert.ok(hs.every(v => v <= 5), 'column cap');
  assert.ok(hs.filter(v => v > 0).length > 4, 'pile spreads over several columns (angle of repose)');
});

test('piles drain and disperse(): cells lift off as embers and the pile empties', () => {
  const burst = s => s.burst(20, 5, 100, COLS, { speed: 16, lift: 4, spread: 3 });
  const { s } = run(3, 120, burst);
  const before = s.pileCount();
  assert.ok(before > 20);
  s.disperse(2);
  let gone = -1;
  for (let i = 0; i < 400 && gone < 0; i++) { s.step(1 / 60); s.draw(); if (!s.pileCount()) gone = i; }
  assert.ok(gone >= 0 && gone < 300, 'pile blown away in ' + gone + ' frames');
  assert.ok(s.heights().every(v => v === 0));
  for (let i = 0; i < 200; i++) { s.step(1 / 60); s.draw(); }
  assert.equal(s.grainCount(), 0);
  assert.equal(s.live(), false);
  // same seed -> same dispersal timing
  const r2 = run(3, 120, burst); r2.s.disperse(2);
  let g2 = -1; for (let i = 0; i < 400 && g2 < 0; i++) { r2.s.step(1 / 60); r2.s.draw(); if (!r2.s.pileCount()) g2 = i; }
  assert.equal(g2, gone);
});

test('per-burst floor: a burst with its own floor piles there (empty columns only)', () => {
  const { s } = run(5, 120, s0 => s0.burst(20, 2, 30, COLS, { speed: 4, lift: 0, spread: 1, floor: 15 }));
  assert.ok(s.pileCount() > 5);
});

test('glow mode: additive blending (lighter) on grains and bloom, pile drawn with source-over; no exceptions', () => {
  const { s, log } = run(11, 60, s0 => { s0.burst(20, 4, 80, COLS, { speed: 18 }); s0.setEmitters([{ x0: 5, x1: 35, y: 1, pal: { h: COLS[0], m: COLS[1] }, rate: 20 }]); });
  assert.ok(log.ops.has('main:lighter'), 'target composited with lighter: ' + [...log.ops]);
  assert.ok(log.ops.has('main:source-over'), 'pile / reset uses source-over');
  assert.ok(s.stats.bloomFrames > 0, 'bloom ran');
  assert.ok(s.stats.bloomFrames <= Math.ceil(s.stats.draws / 2) + 1, 'bloom refreshed at most every other frame: ' + s.stats.bloomFrames + '/' + s.stats.draws);
  assert.ok(log.draws > 0);
});

test('glow:false keeps plain blending (no lighter)', () => {
  const log = mkLog(), cv = mockCv(40, 30, log);
  const s = IT.Sand.createGlow(cv, { seed: 1, glow: false, makeCanvas: (w, h) => mockCv(w, h, log) });
  s.burst(20, 4, 40, COLS, {});
  for (let i = 0; i < 40; i++) { s.step(1 / 60); s.draw(); }
  assert.ok(!log.ops.has('main:lighter'));
});

test('no offscreen canvas available: glow still draws additive, no bloom, no throw', () => {
  const log = mkLog(), cv = mockCv(40, 30, log);
  const s = IT.Sand.createGlow(cv, { seed: 2 });
  s.burst(20, 4, 40, COLS, {});
  for (let i = 0; i < 40; i++) { s.step(1 / 60); s.draw(); }
  assert.ok(log.ops.has('main:lighter'));
  assert.equal(s.stats.bloomFrames, 0);
});

test('bloom canvases are <= 1/4 resolution on large canvases', () => {
  const log = mkLog(), sizes = [], cv = mockCv(320, 180, log);
  const s = IT.Sand.createGlow(cv, { seed: 2, makeCanvas: (w, h) => { sizes.push([w, h]); return mockCv(w, h, log); } });
  s.burst(100, 20, 30, COLS, {}); s.step(1 / 60); s.draw();
  const bl = sizes.slice(1);   // [0] is the full-size grain layer
  assert.ok(bl.length >= 2);
  for (const [w, h] of bl) assert.ok(w <= 80 && h <= 45, w + 'x' + h);
});

test('IT.Hood.Sand: glow opt-in delegates to the glow engine, default stays plain', () => {
  const log = mkLog();
  const plain = IT.Hood.Sand(mockCv(34, 46, log), {});
  const gl = IT.Hood.Sand(mockCv(34, 46, log), { glow: true, seed: 1 });
  assert.ok(!plain.glow && gl.glow === true);
  gl.burst(17, 18, 40, COLS, { speed: 20, lift: 10, spread: 4 });
  for (let i = 0; i < 90; i++) { gl.step(1 / 60); gl.draw(); }
  assert.ok(gl.pileCount() > 0 && gl.live());
});
