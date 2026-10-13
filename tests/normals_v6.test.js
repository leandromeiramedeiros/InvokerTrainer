'use strict';
// v6 #76 L2: sdf / pillow normals on a synthetic disc, sheet atlas, terrain normals on a 2-tier map, gl.js upload slot.
const test = require('node:test'), assert = require('node:assert');
const load = require('./_load.js');
const IT = load(['js/data/game.js', 'js/render/pixel.js', 'js/data/map.js', 'js/render/terrain.js', 'js/render/normals.js', 'js/art/art.js']);
const N = IT.Normals;

const S = 25, C = 12, RAD = 10;
const alpha = new Uint8Array(S * S);
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (Math.hypot(x - C, y - C) <= RAD) alpha[y * S + x] = 255;
const px = (d, x, y) => { const p = (y * S + x) * 4; return [d[p], d[p + 1], d[p + 2], d[p + 3]]; };

test('sdf: positive inside, negative outside, grows toward the centre', () => {
  const s = N.sdf(alpha, S, S);
  assert.ok(s[C * S + C] > 8);
  assert.ok(s[0] < 0);
  assert.ok(s[C * S + C] > s[C * S + C + 5]);
  assert.ok(s[C * S + 2] > 0 && s[C * S + 1] < s[C * S + 2]);
  for (let i = 0; i < S * S; i++) assert.strictEqual(s[i] > 0, alpha[i] > 0);
  assert.ok(Math.abs(s[C * S + C] - (RAD + 0.5)) < 1.6);                // euclidean-ish
});

test('pillow: normals point outward, z>0 inside, height peaks at the centre, material set, transparent = 0', () => {
  const d = N.pillow(alpha, S, S);
  assert.strictEqual(d.length, S * S * 4);
  const L = px(d, 3, C), R = px(d, S - 4, C), T = px(d, C, 3), B = px(d, C, S - 4), M = px(d, C, C);
  assert.ok(L[0] < 110 && R[0] > 145, 'x outward');
  assert.ok(T[1] < 110 && B[1] > 145, 'y outward (y down)');
  assert.ok(Math.abs(L[1] - 128) < 12 && Math.abs(R[1] - 128) < 12);
  assert.ok(Math.abs(M[0] - 128) < 14 && Math.abs(M[1] - 128) < 14, 'flat on top');
  let hmax = 0;
  for (let i = 0; i < S * S; i++) {
    const p = i * 4;
    if (alpha[i]) {
      const nx = d[p] / 255 * 2 - 1, ny = d[p + 1] / 255 * 2 - 1;
      assert.ok(nx * nx + ny * ny < 1.02, 'unit length');          // z = sqrt(1-x^2-y^2) real
      assert.strictEqual(d[p + 3], 85);
      if (d[p + 2] > hmax) hmax = d[p + 2];
    } else assert.deepStrictEqual([d[p], d[p + 1], d[p + 2], d[p + 3]], [0, 0, 0, 0]);
  }
  assert.strictEqual(M[2], hmax);
  assert.ok(M[2] > px(d, 3, C)[2] && M[2] > 240);
  assert.strictEqual(N.pillow(alpha, S, S, { material: N.MAT.tree })[(C * S + C) * 4 + 3], 170);
  assert.ok(N.pillow(new Uint8Array(9), 3, 3).every(v => v === 0), 'empty frame');
});

test('forSheet: shared rects index albedo + normals, cached, per-frame content', () => {
  IT.Art.sheet('t_disc', { pal: { a: '#ff0000', b: '#00ff0040' }, anchor: [0, 0], frames: {
    big: ['.aaaa.', 'aaaaaa', 'aaaaaa', 'aaaaaa', 'aaaaaa', '.aaaa.'],
    small: ['aa', 'aa'],
    ghost: ['bb', 'bb'] } });
  const a = N.forSheet('t_disc');
  assert.strictEqual(a, N.forSheet('t_disc'));
  const r = a.rects;
  assert.deepStrictEqual([r.big.w, r.big.h, r.small.w], [6, 6, 2]);
  assert.ok(a.w * a.h >= 36 + 4 + 4);
  const at = (k, x, y) => { const q = ((r[k].y + y) * a.w + r[k].x + x) * 4; return a.data[q + 3]; };
  assert.strictEqual(at('big', 3, 3), 85);
  assert.strictEqual(at('big', 0, 0), 0);
  assert.strictEqual(at('ghost', 0, 0), 0, 'alpha<128 pixels are not silhouette');
  for (const k of ['big', 'small']) for (const k2 of ['big', 'small', 'ghost']) if (k !== k2) {
    const A = r[k], B = r[k2]; assert.ok(A.x + A.w <= B.x || B.x + B.w <= A.x || A.y + A.h <= B.y || B.y + B.h <= A.y, 'no overlap');
  }
  assert.ok(a.uv('big')[2] <= 1 && N.forSheet('missing') === null);
  assert.ok(a.canvas() === null && a.albedo() === null, 'no DOM in node');
});

// 6x6: high tier (2) north of a rock band, low tier (1) south; ramp-free; plus a flat plain.
const rows = ['......', '......', '######', '......', '......', '......'];
const elev = ['222222', '222222', '222222', '111111', '111111', '111111'];
function twoTier() {
  return IT.Map.build({ tile: 48, w: 6, h: 6, rows, elev });
}
test('terrain tiles: cliff tilts toward the lower tier, flat tiers up, height = tier / max', () => {
  const m = twoTier(), E = (x, y) => N.tileNormal(m, x, y, 2);
  const face = E(2, 2);
  assert.ok(face.ny > 0.3 && Math.abs(face.nx) < 1e-6, 'band tilts south (low side)');
  assert.strictEqual(face.mat, 2);
  const hi = E(2, 0), lo = E(2, 5);
  assert.deepStrictEqual([hi.nx, hi.ny, hi.mat], [0, 0, 0]);
  assert.deepStrictEqual([lo.nx, lo.ny, lo.mat], [0, 0, 0]);
  assert.strictEqual(hi.h, 1); assert.strictEqual(lo.h, 0.5);
  // mirrored map (low tier north): tilt north
  const inv = IT.Map.build({ tile: 48, w: 6, h: 6, rows, elev: elev.slice().reverse() });
  assert.ok(N.tileNormal(inv, 2, 2, 2).ny < -0.3);
});

test('terrain: cached canvas data on the terrain info, 8 px tiles, dies with it', () => {
  const m = twoTier(), info = { T: 8, W: 48, H: 48, map: m };
  const a = N.terrain(m, info), b = N.terrain(m, info);
  assert.strictEqual(a, b);
  assert.deepStrictEqual([a.w, a.h, a.data.length, a.maxE], [48, 48, 48 * 48 * 4, 2]);
  const at = (x, y) => { const q = (y * 48 + x) * 4; return [a.data[q], a.data[q + 1], a.data[q + 2], a.data[q + 3]]; };
  const cliff = at(20, 20), hiG = at(20, 4), loG = at(20, 40);
  assert.ok(cliff[1] > 150 && Math.abs(cliff[0] - 128) < 3, 'cliff y tilt toward the south');
  assert.deepStrictEqual(hiG, [128, 128, 255, 0]);
  assert.deepStrictEqual(loG, [128, 128, 128, 0]);
  assert.strictEqual(cliff[3], 170);
  const info2 = { T: 8, W: 48, H: 48, map: m };
  assert.notStrictEqual(N.terrain(m, info2), a, 'new terrain build = new cache');
});

test('Terrain.normals hook is off without IT.Lights.enabled, on with it', () => {
  const m = twoTier(), info = { T: 8, W: 48, H: 48, map: m };
  assert.strictEqual(IT.Terrain.normals(info), null);
  IT.Lights = { enabled: true };
  assert.strictEqual(IT.Terrain.normals(info), N.terrain(m, info));
  delete IT.Lights;
});

test('gl.js exposes setNormals / hasNormals (no GL in node: only checks the source)', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js/render/gl.js'), 'utf8');
  assert.ok(/C\.setNormals\s*=/.test(src) && /C\.hasNormals\s*=/.test(src));
});
