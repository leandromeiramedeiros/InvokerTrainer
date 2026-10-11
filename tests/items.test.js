'use strict';
// Items: refresher, atos, vyse, shiva, meteor hammer, bkb, blink, boots.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js'];
const IT = load(FILES);
const map = IT.Map.build(IT.MAPDEF);
const iv = (id, k, l) => IT.Values.item(IT.GAME.ITEM_DOTA[id], k, l);
const near = (a, b, e) => assert.ok(Math.abs(a - b) <= (e == null ? 1e-6 : e), `${a} !~ ${b}`);

function mk(items, o) {
  o = o || {};
  const lo = IT.Loadout.normalize(Object.assign({}, IT.Loadout.default(), { items }));
  const w = IT.World.create({ seed: 5, map, loadout: lo, fog: false, autoAttack: false });
  const sp = map.spawns.hero;
  const h = IT.Hero.create(w, lo, sp.x, sp.y);
  h.facing = 0;
  const dummy = (dx, dy, opt) => IT.Units.spawnDummy(w, Object.assign({ x: h.x + dx, y: h.y + dy, preset: 'training', skin: 'pedro' }, opt || {}));
  const run = n => { for (let i = 0; i < n; i++) w.step(); };
  const evs = (type, f) => w.log.filter(e => e.type === type && (!f || f(e)));
  const orbs = (s) => { for (const k of s) IT.Invoke.orb(w, h, k); IT.Invoke.invoke(w, h); };
  return { w, h, dummy, run, evs, orbs };
}
const cast = (w, h, ability, extra) => IT.Orders.issue(w, h, Object.assign({ type: 'cast', ability }, extra || {}));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('defs: range / mana / cooldown come from item KV', () => {
  const { w, h } = mk(IT.Items.ids);
  for (const id of IT.Items.ids) {
    const d = IT.Abilities.get(id), D = IT.GAME.ITEM_DOTA[id];
    assert.equal(d.kind, 'item'); assert.equal(d.dota, D);
    if (id === 'blink') assert.equal(d.range(w, h), Infinity); else assert.equal(d.range(w, h), iv(id, 'castRange'));
    assert.equal(d.manaCost(w, h), iv(id, 'manaCost'), id);
    assert.equal(d.cooldown(w, h), iv(id, 'cooldown'), id);
  }
  assert.equal(IT.Abilities.get('atos').range(w, h), 1100);
  assert.equal(IT.Abilities.get('bkb').cooldown(w, h), 95);
});

test('refresher resets spells, items (not itself) and invoke; double sun strike', () => {
  const { w, h, dummy, run, evs, orbs } = mk(['refresher', 'bkb']);
  const d = dummy(300, 0);
  orbs('EEE'); h.mana = h.maxMana;
  assert.ok(cast(w, h, 'sunstrike', { x: d.x, y: d.y }));
  run(5);
  assert.ok(h.cd.sunstrike > 0);
  assert.equal(IT.Orders.issue(w, h, { type: 'cast', ability: 'sunstrike', x: d.x, y: d.y }), false, 'on cooldown');
  h.cd.bkb = 50; h.items[1].cd = 50;
  assert.ok(cast(w, h, 'refresher'));
  run(2);
  assert.equal(h.cd.sunstrike, 0); assert.equal(h.cd.bkb, 0); assert.equal(h.items[1].cd, 0); assert.equal(h.inv.invokeCd, 0);
  assert.ok(h.cd.refresher > 170);
  assert.equal(evs('fx', e => e.name === 'refresh').length, 1);
  assert.ok(cast(w, h, 'sunstrike', { x: d.x, y: d.y }), 'second cast works');
  run(60);
  assert.equal(evs('hit', e => e.ability === 'sunstrike').length, 2);
});

test('atos: projectile roots, blocks dummy blink; lifted target = miss', () => {
  const { w, h, dummy, run, evs } = mk(['atos']);
  const d = dummy(700, 0, { scenario: { dummyEscape: 'blink_on_first_hit' } });
  const m0 = h.mana;
  assert.ok(cast(w, h, 'atos', { target: d.id }));
  run(3);
  near(m0 - h.mana, iv('atos', 'manaCost'), 1);   // regen tolerance
  assert.equal(evs('hit', e => e.ability === 'atos').length, 0, 'projectile in flight');
  run(20);
  assert.equal(evs('hit', e => e.ability === 'atos').length, 1);
  const s = IT.Status.find(d, 'atosRoot');
  assert.ok(s); near(s.until - w.t, iv('atos', 'duration'), 0.5);
  const t0 = w.t;
  IT.Combat.damage(w, { src: h.id, target: d, ability: 'x', type: 'pure', amount: 10 });   // triggers blink_on_first_hit
  while (IT.Status.has(d, 'atosRoot')) { run(1); assert.equal(evs('blink', e => e.unit === d.id).length, 0, 'no blink while rooted'); }
  run(30 * 4);
  assert.equal(evs('blink', e => e.unit === d.id).length, 1, 'blinks after root ends');
  assert.ok(w.t - t0 > 1);
  // lifted target on arrival: miss
  const m = mk(['atos']);
  const d2 = m.dummy(800, 0);
  cast(m.w, m.h, 'atos', { target: d2.id }); m.run(2);
  IT.Status.add(m.w, d2, 'lift', 2, { src: m.h.id });
  m.run(40);
  assert.equal(m.evs('miss', e => e.ability === 'atos').length, 1);
  assert.ok(!IT.Status.has(d2, 'atosRoot'));
});

test('vyse: hex duration, ms 140, cancels the stun bolt', () => {
  const { w, h, dummy, run, evs } = mk(['vyse']);
  const d = dummy(500, 0, { preset: 'standard', scenario: { stunBolt: true } });
  let started = false;
  for (let i = 0; i < 200 && !started; i++) { run(1); started = evs('bolt', e => e.phase === 'start').length > 0; }
  assert.ok(started, 'bolt started');
  assert.ok(cast(w, h, 'vyse', { target: d.id }));
  run(2);
  const s = IT.Status.find(d, 'hex');
  assert.ok(s); near(s.until - w.t, iv('vyse', 'sheep_duration'), 0.2);
  assert.equal(d.ms, iv('vyse', 'sheep_movement_speed'));
  assert.equal(evs('hit', e => e.ability === 'vyse').length, 1);
  assert.ok(evs('bolt', e => e.phase === 'cancel').length >= 1, 'bolt cancelled');
  run(30);
  assert.equal(evs('bolt', e => e.phase === 'hit').length, 0);
  assert.ok(!IT.Status.has(h, 'stun'));
});

test('bkb: blocks the stun bolt, dispels, duration shrinks per use', () => {
  const { w, h, dummy, run, evs } = mk(['bkb']);
  IT.Status.add(w, h, 'slow', 5, { data: { pct: 0.5 } });
  IT.Status.add(w, h, 'atosRoot', 5);
  IT.Status.add(w, h, 'silence', 5);
  assert.ok(cast(w, h, 'bkb'));
  run(2);
  for (const t of ['slow', 'atosRoot', 'silence']) assert.ok(!IT.Status.has(h, t), t + ' dispelled');
  const durs = [];
  const ms = IT.Status.find(h, 'magicImmune');
  assert.ok(ms); durs.push(Math.round(ms.until - w.t + w.dt * 2));
  assert.deepStrictEqual(durs, [iv('bkb', 'duration', 0)]);
  assert.equal(h.items[0].charges, 1);
  assert.ok(evs('fx', e => e.name === 'bkb').length === 1);
  const d = dummy(500, 0, { scenario: { stunBolt: true } });
  run(30 * 4);
  assert.ok(evs('bolt', e => e.phase === 'blocked').length >= 1, 'bolt blocked');
  assert.ok(!IT.Status.has(h, 'stun'));
  // uses 2, 3, 4
  const used = [];
  for (let n = 0; n < 3; n++) {
    h.cd.bkb = 0;
    IT.Status.remove(w, h, 'magicImmune');
    assert.ok(cast(w, h, 'bkb')); run(2);
    used.push(evs('fx', e => e.name === 'bkb').pop().dur);
  }
  assert.deepStrictEqual(used, [iv('bkb', 'duration', 1), iv('bkb', 'duration', 2), iv('bkb', 'duration', 2)]);
  assert.deepStrictEqual([iv('bkb', 'duration', 0), iv('bkb', 'duration', 1), iv('bkb', 'duration', 2)], [9, 8, 7]);
  assert.equal(h.items[0].charges, 4);
  void d;
});

test('blink: range clamp, walkable landing, damage lockout, root block', () => {
  const { w, h, dummy, run, evs } = mk(['blink']);
  const R = iv('blink', 'blink_range'), C = iv('blink', 'blink_range_clamp');
  const start = { x: h.x, y: h.y };
  const walk = (x, y) => IT.Nav.nearestWalkable(map, x, y);
  assert.ok(cast(w, h, 'blink', { x: start.x + 3000, y: start.y }));
  run(3);
  let exp = walk(start.x + C, start.y);
  near(h.x, exp.x, 1e-6); near(h.y, exp.y, 1e-6);
  assert.ok(map.walkable(h.x, h.y));
  assert.equal(evs('blink').length, 1);
  assert.ok(h.cd.blink > 14);
  // within range lands exactly (walkable-adjusted)
  h.cd.blink = 0;
  const p0 = { x: h.x, y: h.y };
  cast(w, h, 'blink', { x: p0.x - 500, y: p0.y }); run(60);
  exp = walk(p0.x - 500, p0.y);
  near(h.x, exp.x, 1e-6); near(h.y, exp.y, 1e-6);
  assert.ok(R > C);
  // lockout after enemy damage
  h.cd.blink = 0;
  const d = dummy(300, 0);
  IT.Combat.damage(w, { src: d.id, target: h, ability: 'stunbolt', type: 'magical', amount: 50 });
  assert.equal(IT.Abilities.check(w, h, 'blink'), 'blinkDamaged');
  assert.equal(cast(w, h, 'blink', { x: h.x + 300, y: h.y }), false);
  run(30 * 3 - 1);
  assert.equal(IT.Abilities.check(w, h, 'blink'), 'blinkDamaged');
  run(3);
  assert.equal(IT.Abilities.check(w, h, 'blink'), null);
  // damage from self/ally does not lock
  h._blinkLock = 0;
  IT.Combat.damage(w, { src: h.id, target: h, ability: 'x', type: 'pure', amount: 5 });
  assert.equal(IT.Abilities.check(w, h, 'blink'), null);
  // rooted
  IT.Status.add(w, h, 'atosRoot', 3, { src: d.id });
  assert.equal(IT.Abilities.check(w, h, 'blink'), 'rooted');
});

test('meteor hammer: channel completes -> lands; queued move waits', () => {
  const { w, h, dummy, run, evs } = mk(['meteorhammer']);
  const d = dummy(400, 0);
  const x0 = h.x;
  cast(w, h, 'meteorhammer', { x: d.x, y: d.y });
  IT.Orders.issue(w, h, { type: 'move', x: h.x, y: h.y + 600, queued: true });
  let t0 = null;
  for (let i = 0; i < 60 && t0 == null; i++) { run(1); if (IT.Status.has(h, 'channel')) t0 = w.t; }
  assert.ok(t0 != null, 'channelling');
  run(30);   // 1 s into the 2 s channel
  assert.ok(IT.Status.has(h, 'channel'));
  near(h.y, map.spawns.hero.y, 1e-6); near(h.x, x0, 1e-6);
  assert.equal(evs('hit', e => e.ability === 'meteorhammer').length, 0);
  run(30 + 3);   // channel over; move begins
  assert.ok(!IT.Status.has(h, 'channel'));
  run(10);
  assert.ok(h.y > map.spawns.hero.y + 1, 'moving after channel');
  assert.equal(evs('hit', e => e.ability === 'meteorhammer').length, 0, 'still falling');
  run(15);
  assert.equal(evs('hit', e => e.ability === 'meteorhammer').length, 1);
  const id = 'meteorhammer';
  const dm = evs('damage', e => e.ability === id && e.target === d.id);
  assert.ok(dm.length >= 1);
  near(dm[0].dealt, iv(id, 'impact_damage_units') * (1 - d.magicRes), 1e-6);
  const st = IT.Status.find(d, 'stun');
  assert.ok(st); near(st.until - w.t, iv(id, 'stun_duration'), 0.75);
  assert.ok(IT.Status.has(d, 'burn'));
  run(30 * 7);
  const ticks = evs('damage', e => e.ability === id && e.target === d.id);
  assert.equal(ticks.length, 1 + iv(id, 'burn_duration') / iv(id, 'burn_interval'));
  near(ticks[1].dealt, iv(id, 'burn_dps_units') * (1 - d.magicRes), 1e-6);
});

test('meteor hammer: non-queued move cancels, no meteor', () => {
  const { w, h, dummy, run, evs } = mk(['meteorhammer']);
  const d = dummy(400, 0);
  cast(w, h, 'meteorhammer', { x: d.x, y: d.y });
  for (let i = 0; i < 60 && !IT.Status.has(h, 'channel'); i++) run(1);
  assert.ok(IT.Status.has(h, 'channel'));
  run(15);
  IT.Orders.issue(w, h, { type: 'move', x: h.x, y: h.y + 300 });
  assert.ok(!IT.Status.has(h, 'channel'));
  run(30 * 4);
  assert.equal(evs('hit', e => e.ability === 'meteorhammer').length, 0);
  assert.equal(evs('damage', e => e.ability === 'meteorhammer').length, 0);
  assert.equal(evs('fx', e => e.name === 'meteorFall').length, 0);
  assert.equal(evs('fx', e => e.name === 'meteorCancel').length, 1);
  assert.ok(!IT.Status.has(d, 'stun'));
});

test('shiva: ring damage + slow only for units inside, aura and armor passive', () => {
  const { w, h, dummy, run, evs } = mk(['shiva']);
  const base = h.base.armor;
  const a = dummy(500, 0, { preset: 'standard', behavior: 'stationary' });
  const b = dummy(-1000, 0, { preset: 'standard', behavior: 'stationary' });
  a.attack = { min: 1, max: 1, bat: 1.7, point: 0.4, range: 100, projSpeed: 0, next: 0, target: null };
  run(3);
  near(h.armor, base + iv('shiva', 'bonus_armor'), 1e-6);
  assert.ok(IT.Status.has(a, 'shivaAura')); assert.ok(IT.Status.has(b, 'shivaAura'));
  near(a.attack.as, 100 + iv('shiva', 'aura_attack_speed'), 1e-6);
  const c = dummy(-1500, 0, { preset: 'standard', behavior: 'stationary' });
  run(1);
  assert.ok(!IT.Status.has(c, 'shivaAura'), 'beyond aura radius');
  assert.ok(cast(w, h, 'shiva'));
  run(10);
  assert.equal(evs('hit', e => e.ability === 'shiva').length, 0, 'ring has not reached 500');
  run(30);
  const hits = evs('hit', e => e.ability === 'shiva');
  assert.equal(hits.length, 1); assert.equal(hits[0].target, a.id);
  const dm = evs('damage', e => e.ability === 'shiva');
  assert.equal(dm.length, 1);
  near(dm[0].dealt, iv('shiva', 'blast_damage') * (1 - 0.25), 1e-6);
  const s = IT.Status.find(a, 'slow');
  near(s.data.pct, 0.4, 1e-9);
  run(1);
  near(a.ms, 300 * 0.6, 1e-6);
  run(30 * 2);
  assert.equal(evs('hit', e => e.ability === 'shiva').length, 1, 'b beyond blast radius never hit');
  assert.ok(!IT.Status.has(b, 'slow'));
  run(30 * 4);
  assert.ok(!IT.Status.has(a, 'slow'));
});

test('boots / treads / travels: ms (and AS), only one counts, idempotent', () => {
  const ms0 = mk([]).h.base.ms;
  for (const [id, ms, as] of [['boots', 45, 0], ['travels', 90, 0], ['treads', 45, 25]]) {
    const { w, h, run } = mk([id]);
    run(2);
    near(h.ms, ms0 + ms, 1e-6, id);
    near(h.attack.as, h.base.as + as, 1e-6);
    IT.Items.applyPassives(w, h); IT.Items.applyPassives(w, h);
    assert.equal(h.statuses.filter(s => s.type === 'itemStats').length, 1);
    run(2);
    near(h.ms, ms0 + ms, 1e-6);
  }
  const m = mk(['boots', 'treads', 'travels']);
  m.run(2);
  near(m.h.ms, ms0 + 90, 1e-6);   // travels wins; not stacked
  const n = mk([]);
  n.run(2);
  assert.equal(n.h.ms, ms0);
});
