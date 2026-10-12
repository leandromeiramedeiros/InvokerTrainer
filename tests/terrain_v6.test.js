'use strict';
// v6 cliff / ramp readability: pure edgeKind / edgeFlags on tiny synthetic maps + per-tier brightness offsets.
const test = require('node:test'), assert = require('node:assert');
const load = require('./_load.js');
const IT = load(['js/data/game.js', 'js/render/pixel.js', 'js/data/map.js', 'js/render/terrain.js']);
const T = IT.Terrain, E = T.EDGE;

// 9x12: high ground (elev 2) y0-4, rock band y4-5 with a ramp gap at x=1, low ground (elev 1) y6+, a boulder at (6,8), a 1-tile pit at (4,2).
function cliffMap() {
  const rows = [
    '.........', '.........', '.........', '.........',
    '#.#######', '#.#######',
    '.........', '.........', '......#..', '.........', '.........', '.........'];
  const elev = ['222222222', '222222222', '222212222', '222222222', '222222222', '111111111',
    '111111111', '111111111', '111111111', '111111111', '111111111', '111111111'];
  const ramp = new Uint8Array(9 * 12); ramp[4 * 9 + 1] = 1; ramp[5 * 9 + 1] = 1;
  return IT.Map.build({ tile: 48, w: 9, h: 12, rows, elev, ramp });
}
// 5x7: low ground north of a rock band, high ground south (the camera looks at its far side).
function inverseMap() {
  const rows = ['.....', '.....', '#####', '.....', '.....', '.....', '.....'];
  const elev = ['11111', '11111', '11111', '22222', '22222', '22222', '22222'];
  return IT.Map.build({ tile: 48, w: 5, h: 7, rows, elev });
}

test('cliff band: lit lip on the high side, dark face + cast shadow on the low side', () => {
  const m = cliffMap();
  assert.strictEqual(T.edgeKind(m, 3, 4), 'lipN');    // top row of the band, high ground to the north
  assert.strictEqual(T.edgeKind(m, 3, 5), 'faceS');   // south-facing face above the low ground
  assert.strictEqual(T.edgeKind(m, 3, 6), 'castS');   // low ground right under the face is shadowed
  assert.strictEqual(T.edgeKind(m, 3, 3), 'rim');     // upper-tier outline along the edge
  assert.strictEqual(T.edgeKind(m, 7, 2), 'none');    // plain high ground
  assert.strictEqual(T.edgeKind(m, 7, 10), 'none');   // plain low ground
  assert.ok(T.edgeFlags(m, 3, 4) & E.LIP_N);
  assert.ok(T.edgeFlags(m, 3, 5) & E.FACE_S);
  assert.ok(T.edgeFlags(m, 3, 6) & E.SHADOW_S);
});

test('cliff band: shadow is only cast down (never on the high side)', () => {
  const m = cliffMap();
  assert.ok(!(T.edgeFlags(m, 3, 3) & (E.SHADOW_S | E.CAST_S)));
  assert.ok(!(T.edgeFlags(m, 3, 4) & E.FACE_S));
  assert.ok(!(T.edgeFlags(m, 3, 5) & E.LIP_N));
});

test('boulder on flat ground: face + weak cast shadow, no lip flip', () => {
  const m = cliffMap();
  assert.strictEqual(T.edgeKind(m, 6, 8), 'faceS');
  const f = T.edgeFlags(m, 6, 9);
  assert.ok(f & E.CAST_S && !(f & E.SHADOW_S));       // same-level rock: weaker shadow than a cliff
});

test('ramp: distinct graded tiles with height steps at both ends', () => {
  const m = cliffMap();
  assert.strictEqual(T.edgeKind(m, 1, 4), 'ramp');
  assert.strictEqual(T.edgeKind(m, 1, 5), 'ramp');
  assert.ok(T.edgeFlags(m, 1, 4) & E.HI_S);           // next tile down is lower (this one is the high side)
  assert.ok(T.edgeFlags(m, 1, 5) & E.LO_N);           // next tile up is higher
  assert.ok(T.edgeFlags(m, 1, 4) & E.RAMP);
  assert.ok(!(T.edgeFlags(m, 3, 4) & E.RAMP));
});

test('ground height steps (no rock between)', () => {
  const m = cliffMap();
  assert.strictEqual(T.edgeKind(m, 4, 1), 'stepHi');  // HI_* = this tile is the high side of the step (lip)
  assert.strictEqual(T.edgeKind(m, 4, 2), 'stepLo');  // LO_* = the low side (riser)
  assert.ok(T.edgeFlags(m, 4, 1) & E.HI_S);
  assert.ok(T.edgeFlags(m, 4, 2) & E.LO_N);
});

test('low ground north of a cliff: foot of the rock, lip on the far high side, AO at the base', () => {
  const m = inverseMap();
  assert.strictEqual(T.edgeKind(m, 2, 2), 'lipS');    // high ground south: lit lip on the band's bottom row
  assert.strictEqual(T.edgeKind(m, 2, 3), 'ao');
  assert.strictEqual(T.edgeKind(m, 2, 1), 'ao');
  assert.ok(T.edgeFlags(m, 2, 2) & E.FOOT_N);
  assert.ok(T.edgeFlags(m, 2, 2) & E.LIP_S);
});

test('pure: same input, same output; no map mutation', () => {
  const m = cliffMap(), g = Array.from(m.grid), e = Array.from(m.elev);
  for (let i = 0; i < 3; i++) assert.strictEqual(T.edgeFlags(m, 3, 5), T.edgeFlags(m, 3, 5));
  assert.deepStrictEqual(Array.from(m.grid), g); assert.deepStrictEqual(Array.from(m.elev), e);
});

test('per-tier brightness / saturation offsets: higher = lighter, about +6 % per tier', () => {
  const k = T.TIER_K, s = T.TIER_S;
  assert.ok(k[0] < k[1] && k[1] < k[2] && s[0] < s[1] && s[1] < s[2]);
  assert.ok(Math.abs(k[1] - k[0] - 0.06) < 0.01 && Math.abs(k[2] - k[1] - 0.06) < 0.01);
});
