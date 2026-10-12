'use strict';
// v6: ground blob shadows (js/render/shadows.js): height model + which entities get a shadow (fog gate, lift keeps the shadow on the ground).
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

const draws = [];
const mkCv = () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {}, fillStyle: '' }) });
const ctx = vm.createContext({ console, Math, Map, Set, Array, Object, Number, String, Boolean, Uint8Array, Uint32Array, Float32Array, Uint8ClampedArray, Infinity, NaN, isFinite, isNaN, document: { createElement: mkCv } });
for (const f of ['js/render/pixel.js', 'js/art/art.js', 'js/render/shadows.js', 'js/render/units.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const IT = ctx.IT, SH = IT.Shadows;
const H = 120;
vm.runInContext('IT.Spells = { LIFT_HEIGHT: 120 }', ctx);

test('scaleByHeight: endpoints, monotonic, bounded', () => {
  const g = SH.scaleByHeight(0), t = SH.scaleByHeight(H);
  assert.strictEqual(g.scale, 1); assert.ok(Math.abs(g.alpha - 0.45) < 1e-9);
  assert.ok(Math.abs(t.scale - 0.55) < 1e-9); assert.ok(Math.abs(t.alpha - 0.2) < 1e-9);
  let ps = 2, pa = 2;
  for (let z = -20; z <= 200; z += 2.5) {
    const r = SH.scaleByHeight(z);
    assert.ok(r.scale <= ps + 1e-12 && r.alpha <= pa + 1e-12, 'monotonic at z=' + z);
    assert.ok(r.scale >= 0.55 - 1e-9 && r.scale <= 1 && r.alpha >= 0.2 - 1e-9 && r.alpha <= 0.45 + 1e-9, 'bounds at z=' + z);
    ps = r.scale; pa = r.alpha;
  }
  const half = SH.scaleByHeight(H / 2);
  assert.ok(half.scale < 1 && half.scale > 0.55 && half.alpha < 0.45 && half.alpha > 0.2);
  for (const bad of [NaN, undefined, null, -5]) assert.strictEqual(SH.scaleByHeight(bad).scale, 1);
  assert.strictEqual(SH.scaleByHeight(60, 60).scale, 0.55);     // explicit full height
});

// ---- ground(): stub renderer, count blob blits ----
function mkR(ents, fogLevel) {
  const cx = { globalAlpha: 1, fillStyle: '', fillRect() {}, drawImage(cv, x, y) { draws.push({ w: cv.width, h: cv.height, x, y, a: this.globalAlpha }); } };
  const R = {
    cx, w: { ents, t: 0, fog: true }, P: 6, VW: 480, VH: 270, camX: 0, camY: 0, time: 1, simT: 0, ix: 0, iy: 0, iz: 0,
    fog: { levelAt: () => fogLevel },
    interp(e) { R.ix = e.x; R.iy = e.y; R.iz = e.z || 0; },
  };
  return R;
}
const unit = (o) => Object.assign({ id: 1, kind: 'enemy', team: 1, x: 600, y: 600, z: 0, radius: 36, statuses: [], dead: false, visible: true }, o);
const run = (ents, fog) => { draws.length = 0; SH.ground(mkR(ents, fog === undefined ? 3 : fog)); return draws.slice(); };

test('ground: standing visible unit gets one blob at its feet', () => {
  const d = run([unit({})]);
  assert.strictEqual(d.length, 1);
  assert.ok(d[0].w > 6 && d[0].a > 0.3);
});

test('ground: hidden (fogged) foe casts no shadow', () => {
  const d = run([unit({ id: 2, visible: false })]);
  assert.strictEqual(d.length, 0);
});

test('ground: lifted unit keeps its shadow on the ground, smaller and lighter', () => {
  const stand = run([unit({ id: 3 })])[0];
  const up = run([unit({ id: 4, z: 100, statuses: [{ type: 'lift', data: { tornado: true } }] })]);
  const sh = up.find(b => b.h <= 9) || up[0];
  assert.ok(sh.w < stand.w, 'narrower');
  assert.ok(sh.a < stand.a, 'lighter');
  const cy = sh.y + (sh.h - 1) / 2, cy0 = stand.y + (stand.h - 1) / 2;
  assert.strictEqual(Math.round(cy), Math.round(cy0), 'same ground row (real position, not raised)');
});

test('ground: dead units, off-screen units and off switch draw nothing', () => {
  assert.strictEqual(run([unit({ id: 5, dead: true })]).length, 0);
  assert.strictEqual(run([unit({ id: 6, x: 99999 })]).length, 0);
  SH.off = true; const d = run([unit({ id: 7 })]); SH.off = false;
  assert.strictEqual(d.length, 0);
});

test('ground: chaos meteor shadow grows toward impact', () => {
  const m = (rem) => ({ id: 9, kind: 'thinker', team: 0, fx: 'chaosmeteor', x: 600, y: 600, z: 0, age: 1.3 - rem, landed: false, dead: false, statuses: [], danger: { at: 1.3 } });
  const R0 = mkR([m(1.2)], 3); R0.simT = 0.0; draws.length = 0; SH.ground(R0); const early = draws.slice();
  const R1 = mkR([m(0.1)], 3); R1.simT = 1.2; draws.length = 0; SH.ground(R1); const late = draws.slice();
  assert.ok(early.length <= 1 && late.length === 1);
  if (early.length) { assert.ok(late[0].w > early[0].w); assert.ok(late[0].a >= early[0].a); }
});

test('shadows.js is wired before units.js in index.html and units.js has no inline shadow', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.indexOf('js/render/shadows.js') > 0 && html.indexOf('js/render/shadows.js') < html.indexOf('js/render/units.js'));
  assert.ok(!/function shadow\(/.test(fs.readFileSync(path.join(ROOT, 'js/render/units.js'), 'utf8')));
});
