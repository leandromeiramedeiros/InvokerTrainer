'use strict';
// v6 #76 key light + Ultra: always-present sun / moon so every level differs with zero emitters; caps strictly increase; Ultra validates.
const test = require('node:test'), assert = require('node:assert/strict');
const IT = require('./_load')(['js/render/lights.js', 'js/render/gl.js', 'js/render/render.js']);
const GL = IT.GL, L = GL.LEVELS, N = GL.NAMES;

test('levels strictly increase: lights, shadow lights, casters, key shadow length; Ultra is the max', () => {
  assert.deepEqual(N, ['off', 'low', 'medium', 'high', 'ultra']);
  for (let i = 1; i < N.length; i++) assert.ok(L[N[i]].lights > L[N[i - 1]].lights, N[i] + ' lights');
  for (let i = 2; i < N.length; i++) {
    const a = L[N[i - 1]], b = L[N[i]];
    assert.ok(b.shadows > a.shadows && b.casters > a.casters && b.keyLen > a.keyLen && b.soft > a.soft && b.march >= a.march, N[i]);
  }
  assert.ok(L.ultra.march > L.high.march && L.ultra.range > L.high.range && L.ultra.marchL > L.high.marchL && L.ultra.trees > L.high.trees);
  assert.ok(!L.ultra.half && L.ultra.lights === GL.MAXL && GL.MAXL === IT.Lights.MAX);
  assert.ok(GL.MAXL * 3 + 16 <= 224);   // uniform vectors: WebGL2 guarantees 224 fragment vec4s
  // each level differs from its neighbour in at least one feature
  const sig = k => JSON.stringify(L[k]);
  assert.equal(new Set(N.map(sig)).size, N.length);
});

test('key light: none at off, present at every other level with zero emitters; sun by day, moon by night', () => {
  assert.equal(GL.keyLight(0, 'off'), null);
  IT.Lights.enabled = true; IT.Lights.begin();
  assert.equal(IT.Lights.count, 0);
  for (const lv of N.slice(1)) {
    const k = GL.keyLight(0, lv);
    assert.ok(k && k.down > 0 && k.up > 0, lv);
    assert.ok(k.dir[0] < 0 && k.dir[1] < 0 && k.dir[2] > 0.5, lv + ' upper-left, high');
    assert.ok(Math.abs(Math.hypot(...k.dir) - 1) < 1e-9);
  }
  IT.Lights.enabled = false;
  const sun = GL.keyLight(0, 'high'), moon = GL.keyLight(1, 'high');
  assert.ok(sun.tint[0] > sun.tint[2] && moon.tint[2] > moon.tint[0]);          // warm sun, cool moon
  assert.ok(moon.down < sun.down && moon.sh < sun.sh && moon.up < sun.up);      // moon dimmer
  // Low: diffuse only (no key rim / shadows); Medium+: rim + shadows; Ultra: strongest rim, longest / softest shadows
  const lo = GL.keyLight(0, 'low'), md = GL.keyLight(0, 'medium'), ul = GL.keyLight(0, 'ultra');
  assert.deepEqual([lo.rim, lo.sh, lo.len], [0, 0, 0]);
  assert.ok(md.rim > 0 && md.sh > 0 && md.len > 0);
  assert.ok(ul.rim > sun.rim && ul.len > sun.len && ul.soft > sun.soft);
});

test('key shader: flat ground = 1, alpha carries the key factor, fog stays unlit; per-level programs', () => {
  const s = GL.SHADERS.FS_LIT;
  assert.ok(s.includes('uniform vec3 uK,uKT;uniform vec4 uKP;'));
  assert.ok(s.includes('kd=kn-uK.z'));                                 // flat normal N = (0,0,1): kn = uK.z -> kf = 1
  assert.ok(s.includes('clamp(mix(1.,kf,vis)*.5,0.,1.)'));
  assert.ok(GL.SHADERS.FS_MAIN_LIT.includes('float kf=dy.a*2.;'));
  assert.ok(!/uK/.test(GL.SHADERS.FS_MAIN));                           // Off untouched
  const u = GL.litFS(48, 12, 64, 4);
  assert.ok(u.includes('uLP[48]') && u.includes('for(int k=0;k<12;k++)') && u.includes('i<4&&mat<.5') && u.includes('min(dd,64.)'));
});

test('keyXform: shadow falls down-right of an upper-left key, longer with keyLen', () => {
  const R = IT.Render, d = GL.KEY_DIR;
  const m = R.keyXform(d, L.medium.keyLen), u = R.keyXform(d, L.ultra.keyLen);
  assert.ok(m.shear > 0 && m.ky > 0);
  assert.ok(Math.abs(m.len - L.medium.keyLen) < 1e-6 && u.len > m.len);
});
