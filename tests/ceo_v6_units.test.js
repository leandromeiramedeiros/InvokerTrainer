'use strict';
// CEO v6 WP4: unit collision, Meteor Hammer vs buildings, building cards / picking, spirit card + order routing.
const test = require('node:test'), assert = require('node:assert');
const load = require('./_load.js');
const { rig } = require('./input_rig');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/towers.js'];
const IT = load(FILES);
const map = IT.Map.build(IT.MAPDEF);
const iv = (id, k) => IT.Values.item(IT.GAME.ITEM_DOTA[id], k);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function mk(items) {
  const lo = IT.Loadout.normalize(Object.assign({}, IT.Loadout.default(), { items: items || [] }));
  const w = IT.World.create({ seed: 5, map, loadout: lo, fog: false, autoAttack: false });
  const sp = map.spawns.hero, h = IT.Hero.create(w, lo, sp.x, sp.y);
  h.facing = 0;
  const run = n => { for (let i = 0; i < n; i++) w.step(); };
  const evs = (type, f) => w.log.filter(e => e.type === type && (!f || f(e)));
  return { w, h, run, evs };
}

test('collision: hero + spirits sent to one point end up apart, not stacked', () => {
  const { w, h, run } = mk();
  const sps = [0, 1, 2].map(i => IT.Units.spawnSpirit(w, h, h.x + 150, h.y + 40 * i));
  const goal = { x: h.x + 400, y: h.y + 200 };
  for (const s of sps) IT.Orders.issueGroup(w, [s], { type: 'move', x: goal.x, y: goal.y });   // same point, no spread
  IT.Orders.issue(w, h, { type: 'move', x: goal.x, y: goal.y });
  run(30 * 4);
  const us = [h, ...sps];
  for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) {
    const min = (us[i].radius + us[j].radius) * 0.9;
    assert.ok(dist(us[i], us[j]) >= min - 1, `units ${i},${j} overlap: ${dist(us[i], us[j]).toFixed(1)} < ${min}`);
  }
  assert.ok(us.every(u => dist(u, goal) < 200), 'everyone still reached the area');
});

test('collision: separation never pushes a unit into a blocked tile', () => {
  const { w, h, run } = mk();
  // a walkable tile with a blocked east neighbour, close to the hero spawn
  let spot = null;
  const T = map.tile, cx = Math.floor(h.x / T), cy = Math.floor(h.y / T);
  for (let r = 1; r < 80 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
    const tx = cx + dx, ty = cy + dy;
    if (map.walkableTile(tx, ty) && !map.walkableTile(tx + 1, ty) && map.walkableTile(tx - 1, ty)) spot = { x: (tx + 1) * T - 4, y: (ty + 0.5) * T };
  }
  assert.ok(spot, 'found a wall');
  assert.ok(map.walkable(spot.x, spot.y));
  h.x = spot.x - 300; h.y = spot.y;
  const sps = [0, 1, 2, 3].map(() => IT.Units.spawnSpirit(w, h, spot.x, spot.y));   // fully stacked against the wall
  for (const s of sps) { s.ai.nextThink = 1e9; s._playerCmd = true; }
  run(10);
  for (const s of sps) assert.ok(map.walkable(s.x, s.y), `spirit at ${s.x.toFixed(0)},${s.y.toFixed(0)} not walkable`);
  for (let i = 0; i < sps.length; i++) for (let j = i + 1; j < sps.length; j++) assert.ok(dist(sps[i], sps[j]) > 1, 'unstacked');
});

test('meteor hammer vs tower: KV impact + burn (90 + 6 x 50 = 390), no stun; gate lets only it through', () => {
  const { w, h, run, evs } = mk(['meteorhammer']);
  const t = IT.Towers.spawn(w, { team: 1, tier: 1, x: h.x + 400, y: h.y });
  const hp0 = t.hp;
  IT.Orders.issue(w, h, { type: 'cast', ability: 'meteorhammer', x: t.x, y: t.y });
  run(30 * 12);
  const dm = evs('damage', e => e.ability === 'meteorhammer' && e.target === t.id);
  const imp = iv('meteorhammer', 'impact_damage_buildings'), dps = iv('meteorhammer', 'burn_dps_buildings');
  const step = iv('meteorhammer', 'burn_interval'), n = iv('meteorhammer', 'burn_duration') / step;
  assert.equal(imp, 90); assert.equal(dps, 50);
  assert.equal(dm.length, 1 + n);
  assert.equal(hp0 - t.hp, imp + dps * step * n);
  assert.equal(hp0 - t.hp, 390);
  assert.ok(!IT.Status.has(t, 'stun'));
  assert.equal(IT.Towers.gate(w, t, 100, h, 'chaos_meteor'), 0, 'spells do nothing to buildings');
  assert.equal(IT.Towers.gate(w, { building: true, invulnerable: true }, 100, h, 'meteorhammer'), 0, 'invulnerable building');
});

test('structures: card values from KV, picked by click, stable S<i> id', () => {
  const IT2 = load(FILES.slice(0, 4).concat(['js/data/dotaworld.js', 'js/data/maps.js'], FILES.slice(4)));
  const map = IT2.Maps.get('rad_base'), sts = map.structures || [];
  const fi = sts.findIndex(s => s.kind === 'fort');
  assert.ok(fi >= 0, 'map has an ancient');
  const c = IT2.Towers.structCard(map, sts[fi]);
  assert.equal(c.id, 'S' + fi); assert.equal(c.sub, 'fort'); assert.equal(c.maxHp, 4500); assert.equal(c.armor, 23);
  assert.ok(c.invulnerable && c.building);
  for (const s of sts) {
    const k = IT2.Towers.structCard(map, s);
    assert.ok(k.name && IT2.Towers.STRUCT_KV[k.sub], s.kind + ' card');
  }
  const subs = sts.filter(s => s.kind === 'barracks').map(s => IT2.Towers.structSub(map, s));
  assert.ok(subs.includes('melee') && subs.includes('range'), 'melee + ranged barracks');
  const w = { ents: [], map };
  const b = IT2.Towers.buildingAt(w, { x: sts[fi].x, y: sts[fi].y - 60 }, 6);
  assert.ok(b && b.struct === fi, 'click on the ancient picks it');
  assert.equal(IT2.Towers.buildingAt(w, { x: sts[fi].x + 5000, y: sts[fi].y + 5000 }, 6), null);
});

// ---- input routing (rig: camera hero at (240,135), 1 px = 6 world)
function cam(r) {
  const { h, cam: c } = r;
  c.toScreen = (x, y) => ({ x: 240 + (x - h.x) / 6, y: 135 + (y - h.y) / 6 });
  c.toWorld = (x, y) => ({ x: h.x + (x - 240) * 6, y: h.y + (y - 135) * 6 });
}
const lclick = (r, e, mods) => { const p = r.cam.toScreen(e.x, e.y); r.click(0, Object.assign({ clientX: p.x, clientY: p.y }, mods || {})); r.winUp(0); };
const rclick = (r, x, y) => { const p = r.cam.toScreen(x, y); r.click(2, { clientX: p.x, clientY: p.y }); r.winUp(2); };

test('spirit card: click selects the spirit; right-click / S go to it; spells come from the hero and keep the card', () => {
  const r = rig({ autoAttack: false, castMode: 'normal' }); cam(r); r.at(10);
  const s1 = r.IT.Units.spawnSpirit(r.w, r.h, r.h.x - 300, r.h.y + 300), s2 = r.IT.Units.spawnSpirit(r.w, r.h, r.h.x - 300, r.h.y - 300);
  for (const s of [s1, s2]) s.ai.nextThink = 1e9;
  r.at(40);
  lclick(r, s1);
  assert.equal(r.In.selected, s1.id, 'card = spirit');
  assert.deepEqual(r.In.sel.units, [s1.id]);
  assert.equal(r.In.ownCard(), true);
  rclick(r, r.h.x - 900, r.h.y + 300);
  assert.ok(s1.orders.some(o => o.type === 'move'), 'lone spirit takes the right-click');
  assert.ok(!r.h.orders.some(o => o.type === 'move'), 'hero not moved');
  assert.equal(r.In.selected, s1.id, 'still the spirit card');
  rclick(r, r.h.x - 900, r.h.y + 600);   // a second order to the same (already player-commanded) spirit
  assert.ok(s1.orders.some(o => o.type === 'move' && Math.abs(o.y - (r.h.y + 600)) < 1), 'second order accepted');
  const before = r.h.inv.orbs.join();
  r.key('e');
  assert.notEqual(r.h.inv.orbs.join(), before, 'orb key acts on the hero');
  assert.equal(r.In.selected, s1.id, 'spell key keeps the spirit card');
  r.key('s');
  assert.ok(!s1.orders.some(o => o.type === 'move'), 'S stops the spirit');
  assert.equal(r.In.selected, s1.id);
  lclick(r, s2, { shiftKey: true });
  assert.deepEqual(r.In.sel.units.slice().sort(), [s1.id, s2.id].sort(), 'shift-click adds');
  lclick(r, r.h);
  assert.equal(r.In.selected, null, 'clicking the hero returns to the hero card');
  assert.deepEqual(r.In.sel.units, [r.h.id]);
});

test('spirit card: TAB selects the spirits and shows the first one; dead spirit drops the card', () => {
  const r = rig({ autoAttack: false }); cam(r); r.at(10);
  const s1 = r.IT.Units.spawnSpirit(r.w, r.h, r.h.x + 300, r.h.y);
  r.In.cycleSel();
  assert.equal(r.In.sel.group, 'spirits'); assert.equal(r.In.selected, s1.id);
  s1.dead = true; if (r.w.remove) r.w.remove(s1);
  r.at(80);
  assert.equal(r.In.selected, null);
});
