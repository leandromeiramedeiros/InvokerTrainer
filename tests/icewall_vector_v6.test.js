'use strict';
// v6 #71: Aghanim's Scepter on Quas makes Ice Wall vector-targeted (Ice Floe). KV: vector_cast_range +600, wall_width +45.
const test = require('node:test'), assert = require('node:assert');
const load = require('./_load.js');
const { rig } = require('./input_rig.js');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js'];
const near = (a, b, m) => assert.ok(Math.abs(a - b) <= 1e-6, (m || '') + ' ' + a + ' != ' + b);

function env(extra) {
  const IT = load(FILES);
  const lo = Object.assign(IT.Loadout.default(), { heroLevel: 29, talents: [], orbs: { quas: 7, wex: 7, exort: 7 } }, extra || {});
  const w = IT.World.create({ seed: 5, fog: false, autoAttack: false });
  const h = IT.Hero.create(w, lo, 0, 0);
  h.facing = 0; h.maxMana = h.mana = 9999;
  const run = s => { for (let i = 0, n = Math.round(s * 30); i < n; i++) w.step(); };
  const cast = o => { h.inv.slots = ['icewall', null]; h.cd.icewall = 0; const ok = IT.Orders.issue(w, h, Object.assign({ type: 'cast', ability: 'icewall' }, o || {})); run(0.1); return ok; };
  const wall = () => w.query(t => t.ability === 'icewall')[0];
  const V = k => IT.Values.get('invoker_ice_wall', k, h.ctx);
  const dummy = (x, y) => { const d = IT.Units.spawnDummy(w, { x, y, preset: 'standard', skin: 'pedro', behavior: 'stationary' }); d.visible = true; d.hp = d.maxHp = 1e6; return d; };
  return { IT, w, h, run, cast, wall, V, dummy };
}
const FLOE = { scepter: true, scepterOrb: 'quas' };
// wall checks: centred on (x, y), perpendicular to (dx, dy), full KV length
function perp(e, x, y, dx, dy) {
  const s = e.wall(); assert.ok(s, 'wall thinker');
  near((s.ax + s.bx) / 2, x, 'cx'); near((s.ay + s.by) / 2, y, 'cy');
  near(Math.hypot(s.bx - s.ax, s.by - s.ay), e.V('wall_total_length'), 'length');
  near(((s.bx - s.ax) * dx + (s.by - s.ay) * dy) / Math.hypot(dx, dy), 0, 'perpendicular');
  return s;
}

test('KV: Scepter on Quas -> vector kind, range = castRange 0 + vector_cast_range 600, width 105 + 45', () => {
  const e = env(FLOE), A = e.IT.Abilities;
  assert.strictEqual(A.targetKind(e.w, e.h, 'icewall'), 'vector');
  assert.strictEqual(A.get('icewall').vectorRange(e.w, e.h), 600);
  assert.strictEqual(e.V('wall_width'), 150);
  for (const x of [{}, { scepter: true, scepterOrb: 'exort' }]) { const f = env(x); assert.strictEqual(f.IT.Abilities.targetKind(f.w, f.h, 'icewall'), 'none', JSON.stringify(x)); }
});

test('vector cast: wall centred on the start point, perpendicular to the direction, scepter width', () => {
  const e = env(FLOE);
  e.cast({ x: 300, y: 100, dx: 0, dy: 1 });
  const s = perp(e, 300, 100, 0, 1);
  assert.strictEqual(s.r, 150);
  const f = env(FLOE);
  f.cast({ x: -200, y: 250, dx: 3, dy: -4 });   // any angle
  perp(f, -200, 250, 3, -4);
});

test('range clamp: start beyond castRange + vector_cast_range (600) is pulled back toward the hero; direction kept', () => {
  const e = env(FLOE);
  e.cast({ x: 2000, y: 0, dx: 0, dy: 1 });
  perp(e, 600, 0, 0, 1);
  const f = env(FLOE);
  f.cast({ x: 590, y: 0, dx: 0, dy: 1 });   // inside: untouched
  perp(f, 590, 0, 0, 1);
});

test('no direction -> hero -> start; no start (bots / old callers) -> the plain wall in front of the facing', () => {
  const e = env(FLOE);
  e.cast({ x: 0, y: 400 });
  perp(e, 0, 400, 0, 1);
  const f = env(FLOE);
  f.cast();
  perp(f, f.V('wall_place_distance'), 0, 1, 0);
});

test('non-scepter unchanged: x/y/dx/dy ignored, wall wall_place_distance in front, width 105', () => {
  const e = env();
  e.cast({ x: 300, y: 300, dx: 1, dy: 0 });
  const s = perp(e, e.V('wall_place_distance'), 0, 1, 0);
  assert.strictEqual(s.r, 105);
});

test('Ice Floe root + damage still lands on a vector-placed wall', () => {
  const e = env(FLOE), d = e.dummy(450, 300);
  e.cast({ x: 450, y: 300, dx: 1, dy: 0 });
  e.run(e.V('glacier_formation_delay') + e.V('root_delay') + 0.3);
  assert.ok(e.IT.Status.has(d, 'root'), 'rooted');
});

// ---------------------------------------------------------------- input
function vrig(castMode) {
  const r = rig({ scepter: true, scepterOrb: 'quas', castMode });
  r.h.inv.slots = ['icewall', null]; r.h.cd.icewall = 0;
  return r;
}
const lastCast = r => r.orders.filter(o => o.type === 'cast' && o.ability === 'icewall').pop();

test('input quick-cast: start at the cursor, direction hero -> cursor, one press', () => {
  const r = vrig('quick');
  r.In.castId('icewall');
  const o = lastCast(r);
  assert.ok(o, 'cast issued'); assert.strictEqual(r.In.armed, null);
  near(o.x, r.dummy.x); near(o.y, r.dummy.y); assert.ok(o.dx > 0 && Math.abs(o.dy) < 1e-9);
  r.at(200);
  perp({ wall: () => r.w.query(t => t.ability === 'icewall')[0], V: k => r.IT.Values.get('invoker_ice_wall', k, r.h.ctx) }, r.dummy.x, r.dummy.y, 1, 0);
  const q = vrig('quick'); q.mw.x = q.h.x + 1000; q.mw.y = q.h.y;   // beyond 600: clamped start, same direction
  q.In.castId('icewall');
  const p = lastCast(q); near(p.x, q.h.x + 600); assert.ok(p.dx > 0);
});

test('input normal cast: arm -> click sets the start -> 2nd click sets the direction; preview rotates with the cursor', () => {
  const r = vrig('normal'), hx = r.h.x, hy = r.h.y;
  r.In.castId('icewall');
  assert.ok(r.In.armed && r.In.armed.vector, 'armed');
  r.mw.x = hx + 300; r.mw.y = hy;
  r.click(0); r.winUp(0);   // plain click: start only
  assert.ok(r.In.armed && r.In.armed.start, 'start set'); assert.strictEqual(lastCast(r), undefined);
  near(r.In.armed.start.x, hx + 300);
  const poly = () => r.In.aimShapes('icewall', r.h, r.w, { x: r.mw.x, y: r.mw.y }).shapes.find(s => s.k === 'poly').pts.map(p => p.map(Math.round).join()).join();
  r.mw.x = hx + 300; r.mw.y = hy + 200; const p1 = poly();
  const sh = r.In.aimShapes('icewall', r.h, r.w, { x: r.mw.x, y: r.mw.y }).shapes;
  assert.ok(sh.some(s => s.k === 'line' && s.arrow), 'direction arrow'); assert.ok(sh.some(s => s.st === 'tgt'), 'start marker'); assert.ok(sh.some(s => s.st === 'range' && s.r === 600), 'range ring');
  r.mw.x = hx + 500; r.mw.y = hy; const p2 = poly();
  assert.notStrictEqual(p1, p2, 'footprint rotates');
  r.mw.x = hx + 300; r.mw.y = hy + 200;
  r.click(0);
  const o = lastCast(r);
  assert.ok(o, 'cast on the 2nd click'); assert.strictEqual(r.In.armed, null);
  near(o.x, hx + 300); near(o.y, hy); near(o.dx, 0); near(o.dy, 200);
  r.at(200);
  assert.ok(r.casts.includes('icewall'));
});

test('input normal cast: press-drag-release fires on release', () => {
  const r = vrig('normal'), hx = r.h.x, hy = r.h.y;
  r.In.castId('icewall');
  r.mw.x = hx + 200; r.mw.y = hy;
  r.click(0);
  r.mw.x = hx + 200; r.mw.y = hy - 150;
  r.winUp(0);
  const o = lastCast(r);
  assert.ok(o, 'drag released -> cast'); near(o.dx, 0); near(o.dy, -150); assert.strictEqual(r.In.armed, null);
});

test('input: Esc / right-click cancel the vector aim (before or after the start)', () => {
  const r = vrig('normal');
  r.In.castId('icewall'); r.click(0); r.winUp(0);
  assert.ok(r.In.armed && r.In.armed.start);
  r.key('Escape');
  assert.strictEqual(r.In.armed, null);
  r.In.castId('icewall'); r.click(2);
  assert.strictEqual(r.In.armed, null);
  r.at(300);
  assert.strictEqual(lastCast(r), undefined); assert.ok(!r.casts.includes('icewall'));
});
