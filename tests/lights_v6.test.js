'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const IT = require('./_load')(['js/render/lights.js']);
const L = IT.Lights;
const CAM = { x: 0, y: 0, w: 2880, h: 1620 };
const mk = (o) => Object.assign({ x: 1000, y: 800, z: 40, r: 1, g: 1, b: 1, radius: 200, intensity: 1 }, o);

test('disabled by default: add is a no-op', () => {
  assert.equal(L.enabled, false);
  L.begin(); L.add(mk()); assert.equal(L.count, 0); assert.equal(L.list(CAM).length, 0);
});

test('cap 48 (Ultra), sorted by contribution, culled off-screen', () => {
  L.enabled = true;
  L.begin();
  for (let i = 0; i < 60; i++) L.add(mk({ x: 100 + i * 40, intensity: 0.1 + i * 0.01 }));
  L.add(mk({ x: 99999, intensity: 9 }));   // far off-screen
  const l = L.list(CAM);
  assert.equal(L.MAX, 48); assert.equal(l.length, 48);
  assert.ok(!l.some(p => p.x === 99999));
  for (let i = 1; i < l.length; i++) assert.ok(l[i - 1].score >= l[i].score);
  assert.equal(L.list(CAM, 8).length, 8);
  assert.equal(L.list(CAM, 99).length, 48);
  L.begin(); L.add(mk({ radius: 0 })); L.add(mk({ intensity: 0 })); assert.equal(L.count, 0);
  L.add(mk({ x: 1440, y: 810, intensity: 1 })); L.add(mk({ x: 300, y: 200, intensity: 1 }));
  assert.equal(L.list(CAM)[0].x, 1440);   // nearer the view centre wins at equal intensity/radius
  L.enabled = false;
});

test('element hierarchy exort > wex > quas', () => {
  const E = L.ELEM;
  assert.ok(E.exort.base > E.wex.base * 1.5 && E.wex.base > E.quas.base * 1.5);
  assert.ok(E.exort.rad > E.wex.rad && E.wex.rad > E.quas.rad);
  assert.ok(E.exort.r > E.exort.b && E.quas.b > E.quas.r && E.wex.b > E.wex.g);
  L.enabled = true; L.begin();
  const R = { time: 1.234 };
  for (const el of ['exort', 'wex', 'quas']) L.addElem(R, 1000, 800, 50, 300, el, 1, 3, el);
  const byKind = {}; for (const p of L.list(CAM)) byKind[p.kind] = p;
  assert.ok(byKind.exort.score > byKind.wex.score && byKind.wex.score > byKind.quas.score);
  L.enabled = false;
});

test('flicker and strobe stay in 0..1; strobe is irregular, flicker bounded high, quas steady', () => {
  let smin = 1, smax = 0, fmin = 1, fmax = 0, hi = 0;
  for (let t = 0; t < 30; t += 0.01) {
    for (const sd of [0, 5, 17]) {
      const s = L.strobe(t, sd), f = L.flicker(t, sd);
      assert.ok(s >= 0 && s <= 1 && f >= 0 && f <= 1);
      smin = Math.min(smin, s); smax = Math.max(smax, s); fmin = Math.min(fmin, f); fmax = Math.max(fmax, f);
      if (sd === 0 && s > 0.7) hi++;
    }
  }
  assert.ok(smax > 0.8 && smin < 0.4, 'strobe has bright bursts over a low base');
  assert.ok(fmin > 0.6 && fmax <= 1);
  assert.ok(hi > 0 && hi < 1500, 'bursts are sparse');
  // irregular: gaps between burst starts differ
  const gaps = []; let last = null, prev = 0;
  for (let t = 0; t < 30; t += 0.01) { const s = L.strobe(t, 0); if (s > 0.7 && prev <= 0.7) { if (last != null) gaps.push(t - last); last = t; } prev = s; }
  assert.ok(new Set(gaps.map(g => g.toFixed(2))).size > 2);
  const c = L.strobeRgb(1); assert.ok(c[0] > 0.9 && c[1] > 0.9 && c[2] > 0.9);   // peak = white
  const v = L.strobeRgb(0); assert.ok(v[2] > v[1]);
  // quas is steady
  L.enabled = true;
  const out = [];
  for (const t of [0, 0.37, 1.9, 7.1]) { L.begin(); L.addElem({ time: t }, 0, 0, 0, 100, 'quas', 1, 0, 'q'); out.push(L.list(null)[0].intensity); }
  assert.ok(out.every(v => v === out[0]));
  L.enabled = false;
});

test('blend by orb share', () => {
  const q = L.blend('QQQ'), e = L.blend('EEE'), w = L.blend('WWW');
  assert.equal(q.base, L.ELEM.quas.base); assert.equal(e.base, L.ELEM.exort.base);
  const qwe = L.blend('QWE');
  assert.ok(qwe.base > w.base && qwe.base < e.base);
  assert.ok(Math.abs(qwe.q + qwe.w + qwe.e - 1) < 1e-9);
  const ee = L.blend('EEQ'), wwe = L.blend('WWE');
  assert.ok(ee.base > wwe.base && wwe.base > L.blend('WWQ').base);   // more Exort share = stronger
  const obj = L.blend({ q: 1, w: 1, e: 2 }); assert.ok(Math.abs(obj.e - 0.5) < 1e-9);
  assert.equal(L.blend('').base, 0);
  for (const c of ['r', 'g', 'b']) assert.ok(qwe[c] >= 0 && qwe[c] <= 1);
});

test('cluster: <= 4 weighted centroids', () => {
  const pts = [];
  for (let i = 0; i < 100; i++) pts.push({ x: (i % 10) * 3, y: Math.floor(i / 10) * 3, r: 1, g: 0.5, b: 0 });
  for (let i = 0; i < 100; i++) pts.push({ x: 5000 + (i % 10) * 3, y: 4000 + Math.floor(i / 10) * 3, r: 0, g: 0, b: 1, w: 2 });
  const c = L.cluster(pts, 4);
  assert.ok(c.length >= 2 && c.length <= 4);
  assert.equal(c.reduce((a, p) => a + p.n, 0), 200);
  assert.ok(c.some(p => p.x < 100) && c.some(p => p.x > 4900));
  assert.equal(L.cluster(pts, 99).length <= 4, true);
  assert.equal(L.cluster([], 4).length, 0);
  assert.equal(L.cluster([{ x: 1, y: 1, r: 1, g: 1, b: 1 }], 4).length, 1);
  assert.equal(L.cluster(pts.slice(0, 3).map(p => ({ x: 7, y: 7, r: 1, g: 1, b: 1 })), 4).length, 1);   // identical points
});

test('uniform packing sizes and content', () => {
  L.enabled = true; L.begin();
  for (let i = 0; i < 5; i++) L.add(mk({ x: 500 + i * 100, y: 400, r: 0.2, g: 0.4, b: 0.6, radius: 100 + i, intensity: 1 - i * 0.1 }));
  const u = L.uniforms({ x: 100, y: 50, w: 2880, h: 1620 });
  assert.equal(u.pos.length, 144); assert.equal(u.col.length, 144); assert.equal(u.rad.length, 96); assert.equal(u.count, 5);
  assert.ok(u.pos instanceof Float32Array && u.col instanceof Float32Array && u.rad instanceof Float32Array);
  assert.equal(u.pos[1], 350);   // y - cam.y
  assert.ok(Math.abs(u.col[1] - 0.4) < 1e-6);
  assert.equal(u.pos[5 * 3 + 2], 0);   // unused slots stay zero
  assert.equal(L.uniforms(CAM, 8).pos.length, 24);
  L.begin(); assert.equal(L.uniforms(CAM).count, 0);
  L.enabled = false;
});

test('only spell / item / sand lights cast: orbs, towers, buildings, attacks, Forge Spirit never do; flags reach the uniforms; casters sort first', () => {
  L.enabled = true; L.begin();
  L.add(mk({ kind: 'orb', x: 1000 })); L.add(mk({ kind: 'alacrity', x: 1100 })); L.add(mk({ kind: 'tower', x: 1200 })); L.add(mk({ kind: 'orb', x: 1300, cast: true }));
  L.add(mk({ kind: 'spirit', x: 1400 })); L.add(mk({ kind: 'attack', x: 1500 })); L.add(mk({ kind: 'struct', x: 1600 })); L.add(mk({ kind: 'sand', x: 1700 })); L.add(mk({ kind: 'sunstrike', x: 1800 }));
  const u = L.uniforms(CAM, 12), byX = {};
  for (let i = 0; i < u.count; i++) byX[u.pos[i * 3]] = u.cast[i];
  assert.deepEqual([1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800].map(x => byX[x]), [0, 1, 0, 1, 0, 0, 0, 1, 1]);
  for (let i = 1; i < u.count; i++) assert.ok(u.cast[i] <= u.cast[i - 1], 'casting lights first');
  assert.ok(u.cast instanceof Uint8Array && u.base instanceof Float32Array && u.cast.length === 12 && u.base.length === 12);
  L.begin(); L.enabled = false;
});

test('sorting / culling uses the steady base intensity, not the flicker', () => {
  L.enabled = true; L.begin();
  const R = { time: 0 };
  // two exort lights, same spot class: B is flickered down hard this frame but its base is higher -> stays first
  L.add(mk({ x: 900, intensity: 0.2, base: 0.9 }));
  L.add(mk({ x: 1100, intensity: 0.9, base: 0.5 }));
  let l = L.list(CAM);
  assert.equal(l[0].x, 900); assert.equal(l[0].base, 0.9); assert.equal(l[1].base, 0.5);
  assert.ok(Math.abs(l[0].score - 0.9 * 200 * 200 / (1 + Math.hypot(900 - 1440, 800 - 810))) < 1e-6);
  // addElem keeps base = the unflickered element intensity while intensity flickers
  L.begin();
  const fr = { time: 0.3 };
  for (let sd = 0; sd < 8; sd++) L.addElem(fr, 1000 + sd, 800, 40, 200, 'exort', 1, sd, 'orb');
  const all = L.list(CAM, 48);
  assert.ok(all.length > 5 && all.every(p => p.base === L.ELEM.exort.base && !p.cast));
  assert.ok(new Set(all.map(p => p.intensity.toFixed(4))).size > 1);
  L.begin(); L.enabled = false; void R;
});
