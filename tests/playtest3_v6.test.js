'use strict';
// CEO playtest 3: (18) Invoker Scepter/Shard upgrades per KV, (19) HUD stats vs Dota screenshot 15.webp, (20) side-pane scroll under pointer lock.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const load = require('./_load.js');
const ROOT = path.join(__dirname, '..');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/dotaworld.js', 'js/data/maps.js',
  'js/data/i18n.js', 'js/data/i18n/v6.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/art/art.js', 'js/art/icons.js', 'js/ui/hud.js'];
const IT = load(FILES);
const T13 = 'special_bonus_unique_invoker_13';   // orb instance bonuses x2

// ---------------------------------------------------------------- 19: 15.webp (lvl 25, Boots of Speed, Q/W/E 8, 2x-orb talent, W-W-W, Ghost Walk)
// The trainer caps spent orb levels at 7 (RULES.ORB_MAX, design G3); Dota caps at 8, so the ctx is built un-normalized here.
function shot(orbLvl) {
  const lo = Object.assign(IT.Loadout.default(), { heroLevel: 25, orbs: { quas: orbLvl, wex: orbLvl, exort: orbLvl }, talents: [T13], items: ['boots'] });
  const w = IT.World.create({ seed: 3, fog: false, autoAttack: false });
  const h = IT.Hero.create(w, lo, 0, 0);
  const ctx = IT.Values.ctx(lo), b = IT.Hero.build(ctx);
  h.ctx = w.ctx = ctx; h.attr = b.attr; h.base = b.base; h.maxMana = h.mana = 9999;
  h.inv.orbs = ['W', 'W', 'W']; h.inv.slots = ['ghostwalk', null]; h.cd.ghostwalk = 0;
  IT.Orders.issue(w, h, { type: 'cast', ability: 'ghostwalk' });
  for (let i = 0; i < 10; i++) w.step();
  assert.ok(IT.Status.has(h, 'ghost'), 'ghost walk active');
  return { h, b, rows: IT.HUD.statSheet(h).rows };
}
const S8 = shot(8);

test('15.webp MS 467 = (280 + 45 boots) x (1 + 3 x 9.6% Wex(8, x2) + 15% Ghost Walk self_slow(wex 8))', () => {
  const V = (a, k) => IT.Values.get(a, k, S8.h.ctx);
  assert.strictEqual(V('invoker_wex', 'move_speed_per_instance'), 9.6);
  assert.strictEqual(V('invoker_ghost_walk', 'self_slow'), 15);
  assert.strictEqual(Math.round(S8.h.ms), 467); assert.strictEqual(S8.rows.ms.txt, '467');
  assert.strictEqual(Math.round(shot(7).h.ms), 439, 'trainer cap 7/7/7 -> the 439 the CEO saw');
});
test('15.webp AS 218 = 100 + AGI 70 + 3 x 16 Wex(8, x2)', () => {
  assert.strictEqual(S8.b.attr.agi, 70);
  assert.strictEqual(Math.round(S8.h.attack.as), 218); assert.strictEqual(S8.rows.as.txt, '218');
});
test('15.webp damage 148 = avg(19..25) + INT 126 (HUD shows the average)', () => {
  assert.strictEqual(S8.b.attr.int, 126);
  assert.strictEqual((S8.h.attack.min + S8.h.attack.max) / 2, 148); assert.strictEqual(S8.rows.dmg.txt, '148');
});
test('15.webp armor 10 = floor(-1 + AGI 70 / 6)', () => {
  assert.ok(Math.abs(S8.h.armor - (-1 + 70 / 6)) < 1e-9);
  assert.strictEqual(S8.rows.armor.txt, '10');
});
test('15.webp magic resistance 38% = 25% + 0.1% x INT 126', () => {
  assert.ok(Math.abs(S8.h.magicRes - 0.376) < 1e-9);
  assert.strictEqual(S8.rows.mr.txt, '38%');
});

// ---------------------------------------------------------------- 18: Scepter / Shard
function env(extra) {
  const lo = Object.assign(IT.Loadout.default(), { heroLevel: 29, talents: [], orbs: { quas: 7, wex: 7, exort: 7 } }, extra || {});
  const w = IT.World.create({ seed: 5, fog: false, autoAttack: false });
  const h = IT.Hero.create(w, lo, 0, 0);
  h.facing = 0; h.maxMana = h.mana = 9999;
  const dmg = []; w.on('damage', e => dmg.push(e));
  const run = s => { for (let i = 0, n = Math.round(s * 30); i < n; i++) w.step(); };
  const dummy = (x, y) => { const d = IT.Units.spawnDummy(w, { x, y, preset: 'standard', skin: 'pedro', behavior: 'stationary' }); d.visible = true; d.base.magicRes = d.magicRes = 0; d.hp = d.maxHp = 1e6; return d; };
  const cast = id => { h.inv.slots = [id, null]; h.cd[id] = 0; return IT.Orders.issue(w, h, { type: 'cast', ability: id }); };
  const V = (a, k) => IT.Values.get(a, k, h.ctx);
  return { w, h, dmg, run, dummy, cast, V };
}

test('Ghost Walk has no Scepter upgrade in the KV; its Shard applies Ice Wall DPS to nearby enemy heroes', () => {
  const gw = IT.DOTA.abilities.invoker_ghost_walk.values;
  assert.ok(!Object.values(gw).some(e => e.requiresScepter || (e.mods || []).some(m => m.src === 'scepter')), 'no scepter key');
  assert.ok((gw.apply_ice_wall_debuff.mods || []).some(m => m.src === 'shard'), 'shard key');
  for (const [extra, hurt] of [[{ shard: true, shardSpell: 'ghostwalk' }, true], [{ shard: true, shardSpell: 'emp' }, false], [{ scepter: true, scepterOrb: 'quas' }, false]]) {
    const e = env(extra), d = e.dummy(150, 0);
    e.cast('ghostwalk'); e.run(3);
    const got = e.dmg.filter(x => x.ability === 'ghostwalk' && x.target === d.id).reduce((s, x) => s + x.dealt, 0);
    assert.strictEqual(got > 0, hurt, JSON.stringify(extra) + ' -> ' + got);
  }
});

test('7.41 Scepter upgrades only the chosen orb: Ice Floe (Quas), Tornado twisters (Wex), Cataclysm (Exort)', () => {
  const g = (orb, a, k) => IT.Values.get(a, k, IT.Values.ctx({ heroLevel: 29, orbs: { quas: 7, wex: 7, exort: 7 }, scepter: true, scepterOrb: orb }));
  for (const orb of ['quas', 'wex', 'exort']) {
    assert.strictEqual(g(orb, 'invoker_ice_wall', 'root_delay') > 0, orb === 'quas', 'ice floe ' + orb);
    assert.strictEqual(g(orb, 'invoker_tornado', 'twister_damage') > 0, orb === 'wex', 'twisters ' + orb);
    assert.strictEqual(g(orb, 'invoker_sun_strike', 'cataclysm_count') > 0, orb === 'exort', 'cataclysm ' + orb);
  }
});

test('Ice Floe (Scepter on Quas): forms after glacier_formation_delay, roots + damages a hero that stays root_delay inside, once', () => {
  const e = env({ scepter: true, scepterOrb: 'quas' });
  const form = e.V('invoker_ice_wall', 'glacier_formation_delay'), delay = e.V('invoker_ice_wall', 'root_delay');
  const rootDmg = e.V('invoker_ice_wall', 'root_damage'), place = e.V('invoker_ice_wall', 'wall_place_distance');
  assert.ok(form > 0 && delay > 0 && rootDmg > 0 && e.V('invoker_ice_wall', 'root_duration') > 0);
  const d = e.dummy(place, 0);
  e.cast('icewall'); e.run(form - 0.1);
  assert.strictEqual(e.dmg.filter(x => x.ability === 'icewall').length, 0, 'nothing before the glacier forms');
  e.run(delay + 0.3);
  assert.ok(IT.Status.has(d, 'root'), 'rooted');
  const rootHits = () => e.dmg.filter(x => x.ability === 'icewall' && x.target === d.id && Math.abs(x.dealt - rootDmg) < 1e-6).length;
  assert.strictEqual(rootHits(), 1, 'root damage once');
  e.run(delay + 0.5);
  assert.strictEqual(rootHits(), 1, 'still once');
  for (const orb of ['wex', 'exort']) {   // plain Ice Wall: no root
    const f = env({ scepter: true, scepterOrb: orb }), fd = f.dummy(place, 0);
    f.cast('icewall'); f.run(4);
    assert.ok(!IT.Status.has(fd, 'root'), orb);
  }
});

// ---------------------------------------------------------------- 20: pointer lock -> wheel / scrollbar over the HUD list
function lockedRig() {
  const W = {}, D = {}, L = {};
  const SRC = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/i18n.js',
    'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
    'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
    'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/render/camera.js', 'js/ui/settings.js', 'js/input.js'];
  const cv = { addEventListener(t, f) { L[t] = f; }, removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600 }) };
  const body = { parentElement: null };
  // .clist: x 800..992, 200 px tall, content 180 px wide + scrollbar gutter, 1000 px of rows
  const list = { parentElement: body, scrollTop: 0, scrollHeight: 1000, clientHeight: 200, clientWidth: 180, clientLeft: 0,
    getBoundingClientRect: () => ({ left: 800, top: 100, right: 992, bottom: 300, width: 192, height: 200 }), closest: () => ({}) };
  const row = { parentElement: list, hits: 0, closest: () => ({}), dispatchEvent() { row.hits++; } };
  let under = row;
  const doc = { body, pointerLockElement: null, addEventListener(t, f) { D[t] = f; }, removeEventListener() {},
    documentElement: { addEventListener() {}, removeEventListener() {} }, elementFromPoint: () => under, exitPointerLock() {} };
  const ctx = vm.createContext({ console, Math, JSON, Date, Map, Set, Array, Object, Number, String, Boolean, Error, Symbol, Promise, Infinity, NaN, isFinite, isNaN, parseInt, parseFloat,
    Float32Array, Float64Array, Int8Array, Int16Array, Int32Array, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray,
    addEventListener(t, f) { (W[t] = W[t] || []).push(f); }, removeEventListener(t, f) { if (W[t]) W[t] = W[t].filter(x => x !== f); }, innerWidth: 1000, innerHeight: 600,
    document: doc, getComputedStyle: el => ({ overflowY: el === list ? 'auto' : 'visible' }), MouseEvent: function () {} });
  vm.runInContext('globalThis.IT = { UI: { toast() {} } };', ctx);
  for (const f of SRC) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const I = ctx.IT, In = I.Input;
  const w = I.World.create({ seed: 5, fog: false, autoAttack: false });
  const h = I.Hero.create(w, I.Loadout.default(), 4000, 2000);
  const cam = { follow: false, toWorld: () => ({ x: 0, y: 0 }), toScreen: () => ({ x: 0, y: 0 }), centerOn() {}, lock: false };
  const zooms = [];
  In.now = () => 0;
  In.bind({ w, hero: h, cam, R: { mmHit: () => null }, cv });
  In.hooks = { zoom: d => zooms.push(d) };
  doc.pointerLockElement = cv; D.pointerlockchange();
  assert.ok(In.locked);
  const fire = (t, ev) => (W[t] || []).forEach(f => f(ev));
  return { In, L, list, row, zooms, fire, cv, setUnder: e => { under = e; } };
}

test('pointer lock: wheel over the side-pane list scrolls it and never zooms; over the map it still zooms', () => {
  const r = lockedRig();
  r.In.vx = 850; r.In.vy = 150;
  const wheel = dy => r.L.wheel({ target: r.cv, deltaY: dy, deltaMode: 0, preventDefault() {} });
  wheel(100); wheel(100);
  assert.strictEqual(r.list.scrollTop, 200); assert.strictEqual(r.zooms.length, 0);
  wheel(-100); assert.strictEqual(r.list.scrollTop, 100);
  r.setUnder(r.cv); wheel(100);
  assert.strictEqual(r.zooms.length, 1, 'map wheel zooms');
});

test('pointer lock: pressing the list scrollbar gutter drags the thumb (no click synthesized)', () => {
  const r = lockedRig();
  r.In.vx = 985; r.In.vy = 120;   // gutter: x >= left 800 + clientWidth 180
  r.L.mousedown({ button: 0, clientX: 0, clientY: 0, preventDefault() {} });
  assert.strictEqual(r.row.hits, 0, 'no synthetic mousedown on the row');
  r.fire('mousemove', { movementX: 0, movementY: 40 });
  assert.strictEqual(r.list.scrollTop, 40 * 1000 / 200);
  r.fire('mouseup', { button: 0 });
  r.fire('mousemove', { movementX: 0, movementY: 40 });
  assert.strictEqual(r.list.scrollTop, 200, 'drag ends on mouseup');
  r.In.vx = 850; r.L.mousedown({ button: 0, clientX: 0, clientY: 0, preventDefault() {} });
  assert.ok(r.row.hits >= 1, 'row press still routed as a click');
});
