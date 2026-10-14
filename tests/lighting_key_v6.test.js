'use strict';
// v6 #76 key light + Ultra: always-present sun / moon so every level differs with zero emitters; caps strictly increase; Ultra validates.
const test = require('node:test'), assert = require('node:assert/strict');
const IT = require('./_load')(['js/render/lights.js', 'js/render/gl.js', 'js/render/render.js']);
const GL = IT.GL, L = GL.LEVELS, N = GL.NAMES;

test('levels strictly increase: lights, shadow lights, casters; Ultra is the max', () => {
  assert.deepEqual(N, ['off', 'low', 'medium', 'high', 'ultra']);
  for (let i = 1; i < N.length; i++) assert.ok(L[N[i]].lights > L[N[i - 1]].lights, N[i] + ' lights');
  for (let i = 2; i < N.length; i++) {
    const a = L[N[i - 1]], b = L[N[i]];
    assert.ok(b.shadows > a.shadows && b.casters > a.casters && b.march >= a.march, N[i]);
  }
  assert.ok(L.ultra.march > L.high.march && L.ultra.range > L.high.range && L.ultra.marchL > L.high.marchL && L.ultra.trees > L.high.trees);
  assert.ok(!L.ultra.half && L.ultra.lights === GL.MAXL && GL.MAXL === IT.Lights.MAX);
  assert.ok(GL.MAXL * 3 + 16 <= 224);   // uniform vectors: WebGL2 guarantees 224 fragment vec4s
  // each level differs from its neighbour in at least one feature
  const sig = k => JSON.stringify(L[k]);
  assert.equal(new Set(N.map(sig)).size, N.length);
});

test('Lighting v3: sun / moon key light retired at every level (no key shading, shadows or rim)', () => {
  for (const lv of N) { assert.equal(L[lv].key, 0, lv); assert.equal(L[lv].keyLen, 0, lv); assert.equal(GL.keyLight(0, lv), null, lv); assert.equal(GL.keyLight(1, lv), null, lv); }
  assert.equal('soft' in L.high, false);
});

test('key shader: flat ground = 1, alpha carries the key factor, fog stays unlit; per-level programs', () => {
  const s = GL.SHADERS.FS_LIT;
  assert.ok(s.includes('uniform vec3 uK,uKT;uniform vec4 uKP;'));
  assert.ok(s.includes('kd=kn-uK.z'));                                 // flat normal N = (0,0,1): kn = uK.z -> kf = 1
  assert.ok(s.includes('floor(clamp(mix(1.,kf,vis),0.,1.98)*64.+.5)') && s.includes('(kq+128.*km)/255.'));   // alpha = kf x 64 + 128 x key-march occlusion
  assert.ok(!s.includes('kf*=1.-uKP.z'));                                         // key shadow never touches the dithered shade
  assert.ok(GL.SHADERS.FS_MAIN_LIT.includes('kf=(av-128.*km)/64.'));
  assert.ok(!/uK/.test(GL.SHADERS.FS_MAIN));                           // Off untouched
  const u = GL.litFS(48, 12, 64, 4);
  assert.ok(u.includes('uLP[48]') && u.includes('for(int k=0;k<12;k++)') && u.includes('i<4&&mat<.5') && u.includes('min(dd,64.)'));
});

test('keyXform: shadow falls down-right of an upper-left key, longer with keyLen', () => {
  const R = IT.Render, d = GL.KEY_DIR;
  const m = R.keyXform(d, 0.7), u = R.keyXform(d, 1.6);   // pure transform kept (key light retired in v3)
  assert.ok(m.shear > 0 && m.ky > 0);
  assert.ok(Math.abs(m.len - 0.7) < 1e-6 && u.len > m.len);
});
