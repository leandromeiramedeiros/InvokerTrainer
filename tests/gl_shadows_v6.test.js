'use strict';
// v6 #76 L4: silhouette shadows + height ray-march. No GL in node: level table, the pure shear helper (render.js), shader source checks.
const test = require('node:test'), assert = require('node:assert/strict');
const IT = require('./_load')(['js/render/lights.js', 'js/render/gl.js', 'js/render/render.js']);
const GL = IT.GL, S = GL.SHADERS, R = IT.Render;

test('level table: shadows per caster + march flag', () => {
  const L = GL.LEVELS;
  assert.deepEqual([L.off.shadows, L.low.shadows, L.medium.shadows, L.high.shadows, L.ultra.shadows], [0, 0, 1, 2, 3]);
  assert.deepEqual([L.off.march, L.low.march, L.medium.march, L.high.march, L.ultra.march], [0, 0, 0, 6, 12]);
  assert.deepEqual([L.high.range, L.high.marchL, L.ultra.range, L.ultra.marchL], [56, 2, 96, 4]);
});

test('shadowXform: light above, side, distance, height, clamp', () => {
  const c = { x: 100, y: 100 };
  const above = R.shadowXform({ x: 100, y: 100, z: 40 }, c);
  assert.equal(above.shear, 0); assert.equal(above.len, 0);
  const left = R.shadowXform({ x: 60, y: 100, z: 40 }, c);       // light to the left -> shadow leans right
  assert.ok(left.shear > 0 && left.len > 0 && left.sx === 1);
  assert.ok(R.shadowXform({ x: 140, y: 100, z: 40 }, c).shear < 0);
  const near = R.shadowXform({ x: 90, y: 100, z: 40 }, c), far = R.shadowXform({ x: 70, y: 100, z: 40 }, c);
  assert.ok(far.len > near.len);                                  // farther light -> longer
  const low = R.shadowXform({ x: 70, y: 100, z: 20 }, c), high = R.shadowXform({ x: 70, y: 100, z: 60 }, c);
  assert.ok(high.len < low.len);                                  // higher light -> shorter
  assert.ok(Math.abs(near.len - 10 / 40) < 1e-9);                 // len = distance / lightZ
  const huge = R.shadowXform({ x: -500, y: 100, z: 10 }, c);
  assert.equal(huge.len, R.SH_LMAX);                              // clamp
  assert.ok(Math.hypot(huge.shear, huge.ky) <= R.SH_LMAX * 1.0001 + 0.2);
  const north = R.shadowXform({ x: 100, y: 60, z: 40 }, c);       // light above on screen -> shadow runs down the screen
  assert.ok(north.ky > 0 && Math.abs(north.shear) < 1e-9);
  assert.ok(R.shadowXform({ x: 100, y: 140, z: 40 }, c).ky < 0);
  assert.ok(left.ky !== 0);                                       // never degenerate for a level light
});

test('FS_LIT: shadow sampling and a constant-bound 6-step march; GLSL ES 1.00', () => {
  const s = S.FS_LIT;
  assert.ok(!/#version/.test(s));
  assert.ok(/uniform sampler2D uG,uLight,uShadow;/.test(s));
  assert.ok(s.includes('texture2D(uShadow,uv).a') && s.includes('step(mat,.5)'));     // ground only, casters keep their light
  assert.ok(/for\(int k=0;k<6;k\+\+\)/.test(s));
  assert.equal(GL.MARCH_STEPS, 6);
  assert.ok(s.includes('step(zr+1.,hs)') && !s.includes('(hs-zr)/3.'));              // hard per-pixel occlusion, no ramp
  assert.equal(GL.SHK, 1.0);
  assert.ok(s.includes('uMarch>.5&&i<2&&mat<.5'));
  assert.ok(s.includes('floor(bs/4.)/63.'));                                          // height channel B >> 2
  // the light loop is still the only i-loop with a break on uN
  assert.deepEqual(s.match(/for\(int i=0;i<[^;]+;/g), ['for(int i=0;i<' + GL.MAXL + ';']);
  for (const k of Object.keys(S)) if (k !== 'FS_LIT') assert.ok(!/uShadow|march/.test(S[k]), k);   // Off path untouched
});

test('FS_MAIN_LIT: spell-light shadow = hard 2-level mask after the Bayer quantise; ground only, vision scaled, own sampler units', () => {
  const m = S.FS_MAIN_LIT, q = m.indexOf('floor(min(l,1.)*kc*9.+bay)'), k = m.indexOf('if(uKS>0.)');
  assert.ok(q > 0 && k > q, 'mask applied after the quantise');
  assert.ok(m.includes('uSk') && m.includes('uG') && /col\*=1\.-uKS\*max\(k0,k1\*\.5\)\*gm\*texture2D\(uLight,c\)\.a/.test(m));
  assert.ok(m.includes('float sa=texture2D(uSk,c).a;') && m.includes('step(.15,sa)*.5+step(.5,sa)*.5'));   // 2 levels (penumbra / umbra), no dither
  assert.equal((m.match(/texture2D\(uSk/g) || []).length, 5);
  assert.equal(GL.PSK, 0.6);                        // centre + 4 neighbours
  assert.ok(!/uShadow|march/.test(m));
  assert.deepEqual([GL.SUN.sh, GL.MOON.sh], [0.42, 0.55]);
  const lit = S.FS_LIT;
  assert.ok(lit.includes('float sh=' + GL.SHK.toFixed(6) + '*sa'));                  // point-light shadows at full strength
});
