'use strict';
// v6 #76 L3: lighting pass (js/render/gl.js) shader strings, level table, ambient caps; render.js G-buffer helpers. No GL in node: source/shape checks.
const test = require('node:test'), assert = require('node:assert/strict');
const IT = require('./_load')(['js/render/lights.js', 'js/render/gl.js', 'js/render/render.js']);
const GL = IT.GL, S = GL.SHADERS;

const balanced = s => { let d = 0; for (const c of s) { if (c === '{' || c === '(' || c === '[') d++; else if (c === '}' || c === ')' || c === ']') d--; if (d < 0) return false; } return d === 0; };

test('shaders are GLSL ES 1.00 shaped', () => {
  for (const k of Object.keys(S)) {
    const s = S[k];
    assert.ok(balanced(s), k + ' balanced');
    assert.ok(!/#version/.test(s), k + ' no #version');
    assert.ok(!/\b(texture|in|out)\s*\(/.test(s.replace(/texture2D/g, '')), k + ' no ES 3.00 calls');
    if (k !== 'VS') { assert.ok(/precision (highp|mediump) float/.test(s), k + ' precision'); assert.ok(/void main\(\)\{/.test(s)); }
  }
  // loops use constant bounds; the light count breaks out
  const loops = S.FS_LIT.match(/for\(int i=0;i<[^;]+;/g);
  assert.deepEqual(loops, ['for(int i=0;i<' + GL.MAXL + ';']);
  assert.ok(/if\(i>=uN\)break;/.test(S.FS_LIT));
  assert.ok(new RegExp('uniform vec3 uLP\\[' + GL.MAXL + '\\],uLC\\[' + GL.MAXL + '\\];uniform vec2 uLR\\[' + GL.MAXL + '\\]').test(S.FS_LIT));
  assert.equal(GL.MAXL, IT.Lights.MAX);
});

test('Off path is the untouched pre-L3 main shader; lit main keeps the 9-level Bayer quantise', () => {
  assert.ok(!/uDyn|uAdd/.test(S.FS_MAIN));
  assert.ok(S.FS_MAIN.includes('l=clamp(floor(l*9.+bay)/9.,0.,1.);vec3 col=s*l;'));
  assert.ok(S.FS_MAIN_LIT.includes('l=clamp(floor(min(l,1.)*kc*9.+bay)/9.,0.,1.5);'));   // key light scales the quantised grid
  assert.ok(S.FS_MAIN_LIT.includes('texture2D(uLight,c).rgb*1.25+dy.rgb'));   // ambient grid stays the base
  assert.ok(/\/4\.\*uCap/.test(S.FS_MAIN_LIT));                                              // rim/glow: 4 shade steps
  // rim only on material 1..2, emissive (3) gets no diffuse, fog (light alpha) masks the dynamic light
  assert.ok(S.FS_LIT.includes('step(.5,mat)*step(mat,2.5)'));
  assert.ok(S.FS_LIT.includes('if(mat>2.5)dif=vec3(0.);'));
  assert.ok(S.FS_LIT.includes('texture2D(uLight,uv).a'));
});

test('level table: lights cap, half-res, rim / glow flags', () => {
  const L = GL.LEVELS;
  assert.deepEqual(Object.keys(L), ['off', 'low', 'medium', 'high', 'ultra']);
  assert.deepEqual(GL.NAMES, Object.keys(L));
  assert.deepEqual(GL.NAMES.map(k => L[k].lights), [0, 8, 16, 32, 48]);
  assert.deepEqual([L.low.half, L.medium.half, L.high.half, L.ultra.half], [true, false, false, false]);
  assert.deepEqual([L.low.rim, L.medium.rim, L.high.rim], [0, 1, 1]);
  assert.deepEqual([L.low.glow, L.medium.glow, L.high.glow], [0, 1, 1]);
  assert.ok(L.ultra.rim > L.high.rim && L.ultra.glow > L.high.glow);
  assert.equal(L.ultra.lights, GL.MAXL);
  for (const k in L) assert.ok(L[k].lights <= GL.MAXL);
});

test('dev hook without a compositor stays off; lights disabled', () => {
  IT.Lights.enabled = true;
  assert.equal(GL.setLighting('high'), 'off');
  assert.equal(GL.lightingLevel, 'off');
  assert.equal(IT.Lights.enabled, false);
  assert.equal(GL.setLighting('bogus'), 'off');
});

test('ambient scaling: dynamic term capped +15 % by day, +60 % at night', () => {
  assert.equal(GL.lightCap(0), 0.15);
  assert.ok(Math.abs(GL.lightCap(1) - 0.6) < 1e-9);
  assert.ok(Math.abs(GL.lightCap(0.5) - 0.375) < 1e-9);
  assert.equal(GL.lightCap(-1), 0.15); assert.ok(Math.abs(GL.lightCap(3) - 0.6) < 1e-9);
  // the shader's soft saturation cap * (1 - e^-2x) never exceeds the cap
  const sat = (x, n) => GL.lightCap(n) * (1 - Math.exp(-2 * x));
  assert.ok(sat(100, 0) <= 0.15 && sat(100, 1) <= 0.6 && sat(1, 1) > 0.5);
});

test('toScreen: world uniforms -> screen px, z floored, radius scaled', () => {
  const L = IT.Lights; L.enabled = true; L.begin();
  L.add({ x: 600, y: 300, z: 0, r: 1, g: 0.6, b: 0.2, radius: 120, intensity: 1 });
  L.add({ x: 1200, y: 600, z: 240, r: 1, g: 1, b: 1, radius: 60, intensity: 0.5 });
  const u = GL.toScreen(L.uniforms({ x: 60, y: 60, w: 2880, h: 1620 }, 8), 6);
  assert.equal(u.count, 2);
  const i = u.pos[2] === GL.ZMIN ? 0 : 1, j = 1 - i;
  assert.deepEqual([u.pos[i * 3], u.pos[i * 3 + 1], u.pos[i * 3 + 2]], [90, 40, GL.ZMIN]);
  assert.deepEqual([u.pos[j * 3], u.pos[j * 3 + 1], u.pos[j * 3 + 2]], [190, 90, 40]);
  assert.equal(u.rad[i * 2], 20); assert.equal(u.pos.length, 24);
  L.enabled = false;
});

test('G-buffer encoding: material + height in B, sprites keep transparent holes', () => {
  const R = IT.Render;
  assert.equal(GL.packB(1, 2), (63 << 2) | 2); assert.equal(GL.packB(0, 3), 3);
  const src = new Uint8ClampedArray([200, 50, 255, 85, 0, 0, 0, 0, 128, 128, 0, 170, 1, 2, 3, 255]);
  const sp = R.gEncode(src, 4, false), tr = R.gEncode(src, 4, true);
  assert.deepEqual([...sp.slice(0, 4)], [200, 50, (63 << 2) | 1, 255]);
  assert.deepEqual([...sp.slice(4, 8)], [0, 0, 0, 0]);                   // empty sprite pixel: left alone by drawImage
  assert.deepEqual([...tr.slice(4, 8)], [0, 0, 0, 255]);                 // terrain: every texel written (material 0)
  assert.deepEqual([...sp.slice(8, 12)], [128, 128, 2, 255]);
  assert.equal(sp[14] & 3, 3);
  // shader decode matches: b = h6 * 4 + mat
  const b = sp[2]; assert.equal(b % 4, 1); assert.equal(Math.floor(b / 4) / 63, 1);
});

test('G-buffer materials and vision mask', () => {
  const R = IT.Render;
  assert.deepEqual(['unit', 'tree', 'tower', 'struct', undefined, 'fx'].map(R.gMatOf), [1, 2, 2, 2, 3, 3]);
  const v = R.visMask(new Uint8Array(6), 3, 2, 4, 0, 0, (x) => x < 4 ? 2 : x < 8 ? 1.5 : 0.5);
  assert.deepEqual([...v], [255, 128, 0, 255, 128, 0]);
  assert.deepEqual([...R.visMask(new Uint8Array(2), 2, 1, 4, 0, 0, null)], [255, 255]);   // fog off: all visible
});

test('lights.begin(R) stamps the frame so emitter frame(R) calls do not reset', () => {
  const L = IT.Lights; L.enabled = true;
  const R = { time: 5 };
  L.begin(R); L.add({ x: 0, y: 0, radius: 10, intensity: 1 }); L.frame(R);
  assert.equal(L.count, 1);
  L.enabled = false;
});
