'use strict';
// v4 entities: isFoe, scarecrow dummy, enemy NPC (death, items, awareness, telegraph, behaviors), player dust / force staff.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js'];
const IT = load(FILES);
const map = IT.Map.build(IT.MAPDEF);
const iv = (id, k) => IT.Values.item(IT.GAME.ITEM_DOTA[id], k);

function mk(items) {
  const lo = IT.Loadout.normalize(Object.assign({}, IT.Loadout.default(), { items: items || [] }));
  const w = IT.World.create({ seed: 5, map, loadout: lo, fog: false, autoAttack: false });
  const sp = map.spawns.hero;
  const h = IT.Hero.create(w, lo, sp.x, sp.y);
  h.facing = 0;
  const enemy = (dx, dy, o) => IT.Units.spawnEnemy(w, Object.assign({ x: h.x + dx, y: h.y + dy, skin: 'pedro' }, o || {}));
  const run = n => { for (let i = 0; i < n; i++) w.step(); };
  const evs = (type, f) => w.log.filter(e => e.type === type && (!f || f(e)));
  return { w, h, enemy, run, evs };
}
const give = (e, ids) => { e.items = ids.map(id => ({ id, cd: 0, charges: 0 })); e.cd = e.cd || {}; };

test('isFoe: dummy and enemy only', () => {
  const { w, h, enemy } = mk();
  const d = IT.Units.spawnDummy(w, { x: h.x + 300, y: h.y, preset: 'training', skin: 'pedro' });
  const e = enemy(400, 0);
  assert.ok(IT.Units.isFoe(d) && IT.Units.isFoe(e));
  assert.ok(!IT.Units.isFoe(h) && !IT.Units.isFoe(null));
});

test('dummy = scarecrow: no hp bar, stationary, never dies, refills', () => {
  const { w, h, run, evs } = mk();
  const d = IT.Units.spawnDummy(w, { x: h.x + 300, y: h.y, preset: 'training', skin: 'pedro' });
  assert.equal(d.kind, 'dummy'); assert.equal(d.noHpBar, true); assert.equal(d.behavior, 'stationary');
  IT.Combat.damage(w, { src: h, target: d, type: 'pure', amount: d.maxHp * 0.9 });
  assert.equal(d.hp, d.maxHp); assert.equal(evs('refill').length, 1);
  IT.Combat.damage(w, { src: h, target: d, type: 'pure', amount: d.maxHp * 5 });
  assert.ok(!d.dead && d.hp > 0);
  const x = d.x; run(60);
  assert.equal(d.x, x);
  assert.equal(evs('kill').length, 0);
});

test('enemy dies at 0 hp and emits kill; takes statuses', () => {
  const { w, h, enemy, evs } = mk();
  const e = enemy(400, 0, { hp: 1000, armor: 0, magicRes: 0 });
  assert.equal(e.kind, 'enemy'); assert.equal(e.maxHp, 1000);
  IT.Combat.damage(w, { src: h, target: e, type: 'pure', amount: 400 });
  assert.equal(e.hp, 600); assert.ok(!e.dead);
  assert.ok(IT.Status.add(w, e, 'stun', 1, { src: h.id }));
  IT.Combat.damage(w, { src: h, target: e, type: 'pure', amount: 700 });
  assert.equal(evs('kill').length, 1); assert.equal(evs('kill')[0].unit, e.id);
  assert.ok(!w.get(e.id));
});

test('enemy items limited to the five; behavior default stationary', () => {
  const { enemy } = mk();
  const e = enemy(400, 0, { items: ['bkb', 'blink', 'shadowblade', 'euls', 'forcestaff', 'refresher', 'atos'] });
  assert.deepEqual(e.items.filter(Boolean).map(s => s.id), ['bkb', 'blink', 'shadowblade', 'euls', 'forcestaff']);
  assert.equal(e.behavior, 'stationary');
  assert.deepEqual(IT.GAME.ENEMY_ITEMS, ['bkb', 'blink', 'shadowblade', 'euls', 'forcestaff', 'dust']);   // v6: + dust (scenario chasers)
});

test('item Dota values baked', () => {
  assert.equal(iv('forcestaff', 'push_length'), 600);
  assert.equal(iv('euls', 'cyclone_duration'), 2.5);
  assert.equal(iv('shadowblade', 'windwalk_duration'), 17);
  assert.equal(iv('dust', 'duration'), 12);
  assert.equal(iv('dust', 'radius'), 1050);
});

test('awareness: unaware reaction x2.5, aware after being hit', () => {
  const { w, h, enemy, run } = mk();
  const e = enemy(3000, 0, { reaction: 0.4 });
  run(5);
  assert.equal(e.aware, false);
  assert.ok(Math.abs(IT.Units.reactionOf(e) - 1.0) < 1e-9);
  IT.Combat.damage(w, { src: h, target: e, type: 'pure', amount: 10 });
  run(5);
  assert.equal(e.aware, true);
  assert.ok(Math.abs(IT.Units.reactionOf(e) - 0.4) < 1e-9);
  run(30 * 3);
  assert.equal(e.aware, false);
});

test('telegraph: enemy telegraphs BKB, then fires it after the lead', () => {
  const { w, h, enemy, run, evs } = mk();
  const e = enemy(300, 0, { reaction: 0.2, telegraph: 0.5, items: ['bkb'] });
  e.aware = true; e.lastHit = w.t + 100;   // aware for the whole test
  w.emit('castStart', { unit: h.id, ability: 'coldsnap', order: { type: 'cast', target: e.id } });
  run(Math.round(30 * 0.15));
  assert.equal(evs('telegraph').length, 0);
  run(Math.round(30 * 0.2));
  const tg = evs('telegraph');
  assert.equal(tg.length, 1); assert.equal(tg[0].item, 'bkb'); assert.equal(tg[0].lead, 0.5); assert.equal(tg[0].unit, e.id);
  assert.ok(e.tele && e.tele.item === 'bkb' && e.tele.until > e.tele.at);
  assert.ok(!IT.Status.has(e, 'magicImmune'));
  run(Math.round(30 * 0.55));
  assert.equal(e.tele, null);
  assert.ok(IT.Status.has(e, 'magicImmune')); assert.equal(e.bkb, true);
});

test('enemy BKB cuts magic damage (not full immunity)', () => {
  const { w, h, enemy, run } = mk();
  const e = enemy(300, 0, { telegraph: 0, items: ['bkb'], hp: 5000, magicRes: 0 });
  e.aware = true;
  w.emit('castStart', { unit: h.id, ability: 'coldsnap', order: { type: 'cast', target: e.id } });
  run(30);
  assert.ok(IT.Status.has(e, 'magicImmune'));
  const before = e.hp;
  IT.Combat.damage(w, { src: h, target: e, type: 'magical', amount: 100 });
  const taken = before - e.hp;
  assert.ok(taken > 0 && taken < 100, 'taken ' + taken);
});

test('escape behavior: Shadow Blade when the hero is close, becomes invisible; dust reveals', () => {
  const { w, h, enemy, run, evs } = mk(['dust']);
  const e = enemy(500, 0, { behavior: 'escape', reaction: 0.1, telegraph: 0.3, items: ['shadowblade'], awareness: 1 });
  IT.Combat.damage(w, { src: h, target: e, type: 'pure', amount: 1 });   // aware
  run(30 * 2);
  assert.ok(evs('telegraph').some(t => t.item === 'shadowblade'));
  run(30 * 1);
  assert.ok(IT.Status.has(e, 'invisible'));
  assert.ok(IT.Status.hidden(e));
  e.vision = 0; h.vision = 1800;
  const hero = h;
  assert.equal(IT.Vision.canSee(w, hero, e), false);
  IT.Status.add(w, e, 'revealed', 5, { src: h.id, pierce: true });
  assert.ok(IT.Status.revealed(e));
  assert.equal(IT.Vision.canSee(w, hero, e), true);
});

test('escape behavior flees from the hero', () => {
  const { w, h, enemy, run } = mk();
  const e = enemy(500, 0, { behavior: 'escape', reaction: 0.1, awareness: 1 });
  IT.Combat.damage(w, { src: h, target: e, type: 'pure', amount: 1 });
  const d0 = Math.hypot(e.x - h.x, e.y - h.y);
  run(30 * 2);
  assert.ok(Math.hypot(e.x - h.x, e.y - h.y) > d0 + 100);
});

test('wander moves, stationary does not', () => {
  const { enemy, run } = mk();
  const a = enemy(600, 0, { behavior: 'wander' }), b = enemy(0, 600, { behavior: 'stationary' });
  const ax = a.x, ay = a.y, bx = b.x, by = b.y;
  run(30 * 6);
  assert.ok(Math.hypot(a.x - ax, a.y - ay) > 5);
  assert.equal(b.x, bx); assert.equal(b.y, by);
});

test('euls: enemy self-cyclone is invulnerable', () => {
  const { w, h, enemy, run } = mk();
  const e = enemy(300, 0, { telegraph: 0, items: ['euls'], hp: 5000 });
  e.aware = true;
  w.emit('castStart', { unit: h.id, ability: 'coldsnap', order: { type: 'cast', target: e.id } });
  run(30);
  assert.ok(IT.Status.has(e, 'lift'));
  const hp = e.hp;
  IT.Combat.damage(w, { src: h, target: e, type: 'pure', amount: 500 });
  assert.equal(e.hp, hp);
});

test('player dust: reveals + slows enemies in radius', () => {
  const { w, h, enemy, run } = mk(['dust']);
  const near = enemy(500, 0), far = enemy(2000, 0);
  IT.Orders.issue(w, h, { type: 'cast', ability: 'dust' });
  run(5);
  assert.ok(IT.Status.revealed(near)); assert.ok(!IT.Status.revealed(far));
  assert.ok(h.cd.dust > 0);
});

test('player force staff: pushes the hero along its facing', () => {
  const { w, h, run } = mk(['forcestaff']);
  const x0 = h.x;
  h.facing = Math.PI;
  IT.Orders.issue(w, h, { type: 'cast', ability: 'forcestaff', target: h.id });
  run(30);
  assert.ok(x0 - h.x > 590, "moved " + (x0 - h.x));
});
