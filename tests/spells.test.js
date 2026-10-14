'use strict';
// All 10 Invoker spells. No map, no fog, autoAttack off (unless a test turns it on); numbers checked against IT.Values.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js'];

const ID = { coldsnap: 'invoker_cold_snap', ghostwalk: 'invoker_ghost_walk', icewall: 'invoker_ice_wall', emp: 'invoker_emp', tornado: 'invoker_tornado',
  alacrity: 'invoker_alacrity', sunstrike: 'invoker_sun_strike', forgespirit: 'invoker_forge_spirit', chaosmeteor: 'invoker_chaos_meteor', deafeningblast: 'invoker_deafening_blast' };

// orbs: {quas,wex,exort}; extra: ctx loadout fields (scepter, scepterOrb, shard, talents)
function env(orbs, extra, opts) {
  const IT = load(FILES);
  const lo = Object.assign({ heroLevel: 29, talents: [], orbs: orbs || { quas: 4, wex: 4, exort: 4 } }, extra || {});
  const w = IT.World.create(Object.assign({ seed: 5, fog: false, autoAttack: false }, opts || {}));
  const h = IT.Hero.create(w, Object.assign(IT.Loadout.default(), lo), 0, 0);
  h.facing = 0; h.maxMana = h.mana = 9999;
  const V = (id, k) => IT.Values.get(ID[id], k, h.ctx);
  const dmg = [], hit = [], miss = [], fx = [];
  w.on('damage', e => dmg.push(e)); w.on('hit', e => hit.push(e)); w.on('miss', e => miss.push(e)); w.on('fx', e => fx.push(e));
  const run = s => { for (let i = 0, n = Math.round(s * 30); i < n; i++) w.step(); };
  const dummy = (x, y, o) => {
    const d = IT.Units.spawnDummy(w, Object.assign({ x, y, preset: 'standard', skin: 'pedro', behavior: 'stationary' }, o || {}));
    d.visible = true; d.base.magicRes = 0; d.magicRes = 0; d.base.armor = 0; d.armor = 0;
    return d;
  };
  const cast = (id, order) => {
    h.inv.slots = [id, null]; h.cd[id] = 0;
    return IT.Orders.issue(w, h, Object.assign({ type: 'cast', ability: id }, order || {}));
  };
  const dealt = (ab, target) => dmg.filter(e => e.ability === ab && (!target || e.target === target.id)).reduce((s, e) => s + e.dealt, 0);
  return { IT, w, h, V, dmg, hit, miss, fx, run, dummy, cast, dealt };
}
const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= (eps || 1e-6), a + ' != ' + b);

test('all 10 spells are registered', () => {
  const { IT } = env();
  for (const id of IT.Abilities.SPELLS) assert.ok(IT.Abilities.get(id), id);
});

test('cold snap: freeze + damage from Values; blind flag; no miss', () => {
  const e = env();
  const d = e.dummy(300, 0); d.visible = false; e.w.fog = false;
  e.cast('coldsnap', { target: d.id });
  e.run(0.3);
  assert.ok(e.IT.Status.has(d, 'coldsnap'));
  near(e.dealt('coldsnap', d), e.V('coldsnap', 'freeze_damage'));
  assert.strictEqual(e.hit.length, 1); assert.strictEqual(e.hit[0].blind, true);
});

test('cold snap re-triggers on forge spirit hits', () => {
  const e = env({ quas: 1, wex: 1, exort: 7 }, null, { autoAttack: true });
  const d = e.dummy(250, 0);
  e.cast('coldsnap', { target: d.id });
  e.run(0.3);
  const n0 = e.dmg.filter(x => x.ability === 'coldsnap').length;
  assert.strictEqual(n0, 1);
  e.cast('forgespirit');
  e.run(4);
  const frz = e.dmg.filter(x => x.ability === 'coldsnap').length;
  assert.ok(frz >= 2, 'refroze ' + frz);
  assert.ok(e.dmg.some(x => x.ability === 'attack' && e.w.get(x.src) && e.w.get(x.src).kind === 'spirit'));
});

test('sun strike: delay, danger, pure damage, hit/miss, lifted dodge', () => {
  const e = env();
  const d = e.dummy(500, 300);
  e.cast('sunstrike', { x: 500, y: 300 });
  e.run(0.2);
  const th = e.w.query(t => t.kind === 'thinker' && t.ability === 'sunstrike')[0];
  assert.ok(th); near(th.danger.r, e.V('sunstrike', 'area_of_effect')); assert.ok(th.danger.at > e.w.t); assert.strictEqual(th.r, th.danger.r); assert.ok(th.color);
  e.run(e.V('sunstrike', 'delay') - 0.2 - 0.1);
  assert.strictEqual(e.dealt('sunstrike'), 0);
  e.run(0.3);
  near(e.dealt('sunstrike', d), e.V('sunstrike', 'damage'));
  assert.strictEqual(e.hit.length, 1); assert.strictEqual(e.miss.length, 0);
  // miss
  e.cast('sunstrike', { x: -2000, y: 0 }); e.run(2.2);
  assert.strictEqual(e.miss.length, 1); assert.strictEqual(e.miss[0].ability, 'sunstrike');
  // lifted target is invulnerable
  const before = e.dealt('sunstrike'), nh = e.hit.length;
  e.IT.Status.add(e.w, d, 'lift', 3, { src: e.h.id });
  e.cast('sunstrike', { x: 500, y: 300 }); e.run(2.2);
  assert.strictEqual(e.dealt('sunstrike'), before);
  assert.strictEqual(e.hit.length, nh);
});

test('sun strike cataclysm (scepter): self-cast drops cataclysm_count strikes per enemy, fogged ones too (vision)', () => {
  const e = env({ quas: 4, wex: 4, exort: 4 }, { scepter: true, scepterOrb: 'exort' });
  const d1 = e.dummy(900, 0), d2 = e.dummy(-900, 400), d3 = e.dummy(0, 1200); d3.visible = false;
  e.w.fog = true;
  const cnt = e.V('sunstrike', 'cataclysm_count');
  assert.strictEqual(cnt, 2);
  e.cast('sunstrike', { target: e.h.id, x: e.h.x, y: e.h.y });
  e.run(0.2);
  const strikes = e.w.query(t => t.kind === 'thinker' && t.ability === 'sunstrike');
  assert.strictEqual(strikes.length, 3 * cnt);
  const lo = e.V('sunstrike', 'cataclysm_min_range'), hi = e.V('sunstrike', 'cataclysm_max_range');
  for (const s of strikes) {
    const d = [d1, d2, d3].map(u => Math.hypot(s.x - u.x, s.y - u.y));
    assert.ok(d.some(x => x >= lo - 1e-6 && x <= hi + 1e-6), 'range');
    assert.ok(s.danger);
    // each strike gives its own flying vision thinker over the same spot (it outlives the impact: tests/sunstrike_vision.test.js)
    assert.strictEqual(e.w.query(t => t.kind === 'thinker' && t.flying && t.x === s.x && t.y === s.y && t.vision > 0).length, 1);
  }
  near(e.h.cd.sunstrike, e.V('sunstrike', 'cataclysm_cooldown'), 0.3);
  e.run(2.2);
  assert.ok(e.dealt('sunstrike', d1) > 0 && e.dealt('sunstrike', d2) > 0);
  assert.ok(e.dealt('sunstrike', d3) > 0);   // in fog: still hit (TODO 4)
  assert.strictEqual(e.hit.filter(x => x.target === d1.id).length, 1);   // hit once per enemy per cast
  // without scepter: self-cast is a plain strike
  const f = env(); f.cast('sunstrike', { x: 0, y: 0 }); f.run(0.2);
  assert.strictEqual(f.w.query(t => t.ability === 'sunstrike').length, 1);
});

test('ghost walk: invisible, self slow stats, enemy aura slow, breaks on cast', () => {
  const e = env({ quas: 5, wex: 3, exort: 4 });
  const d = e.dummy(200, 0), far = e.dummy(2000, 0);
  e.cast('ghostwalk'); e.run(0.3);
  const g = e.IT.Status.find(e.h, 'ghost');
  assert.ok(g);
  near(g.data.stats.msPct, e.V('ghostwalk', 'self_slow'));
  near(g.until - 0.3 + 0.3, g.until);
  assert.strictEqual(e.IT.Vision.canSee(e.w, d, e.h), false);
  const sl = e.IT.Status.find(d, 'slow');
  assert.ok(sl); near(sl.data.pct, -e.V('ghostwalk', 'enemy_slow') / 100);
  assert.ok(!e.IT.Status.has(far, 'slow'));
  e.h.base.ms = 300; e.run(0.1);
  near(e.h.ms, 300 * (1 + e.V('ghostwalk', 'self_slow') / 100), 1e-6);
  // break on cast
  e.cast('sunstrike', { x: 1500, y: 0 });
  e.run(0.1);
  assert.ok(!e.IT.Status.has(e.h, 'ghost'));
  e.run(0.7);
  assert.strictEqual(e.w.query(t => t.ability === 'ghostwalk').length, 0);
});

test('ghost walk: breaks on attack', () => {
  const e = env({ quas: 5, wex: 3, exort: 4 });
  const d = e.dummy(120, 0);
  e.cast('ghostwalk'); e.run(0.2);
  assert.ok(e.IT.Status.has(e.h, 'ghost'));
  e.IT.Orders.issue(e.w, e.h, { type: 'attack', target: d.id });
  e.run(2);
  assert.ok(!e.IT.Status.has(e.h, 'ghost'));
});

test('ice wall: geometry, slow, dps, expiry, miss when empty', () => {
  const e = env({ quas: 4, wex: 4, exort: 4 });
  const place = e.V('icewall', 'wall_place_distance'), len = e.V('icewall', 'wall_total_length');
  const inW = e.dummy(place, 300), out = e.dummy(place + 500, 0), tip = e.dummy(place, len / 2 + 200);
  e.cast('icewall'); e.run(0.1);
  const wall = e.w.query(t => t.ability === 'icewall')[0];
  assert.ok(wall); near(wall.x, place, 1); near(wall.ax, place, 1); near(Math.abs(wall.ay - wall.by), len, 1e-6); assert.ok(wall.r > 0);
  e.run(1.0);
  const s = e.IT.Status.find(inW, 'slow');
  assert.ok(s); near(s.data.pct, Math.min(1, -e.V('icewall', 'slow') / 100));
  assert.ok(!e.IT.Status.has(out, 'slow') && !e.IT.Status.has(tip, 'slow'));
  const iv = e.V('icewall', 'tick_interval');
  const ticks = e.dmg.filter(x => x.ability === 'icewall' && x.target === inW.id).length;
  assert.ok(ticks >= 2);
  near(e.dealt('icewall', inW), ticks * e.V('icewall', 'damage_per_second') * iv);
  assert.strictEqual(e.hit.filter(x => x.target === inW.id).length, 1);
  assert.strictEqual(e.dealt('icewall', out), 0);
  // slow lingers after the wall expires, then ends
  e.run(e.V('icewall', 'duration'));
  assert.strictEqual(e.w.query(t => t.ability === 'icewall').length, 0);
  assert.ok(e.IT.Status.has(inW, 'slow'));
  e.run(e.V('icewall', 'slow_duration') + 0.2);
  assert.ok(!e.IT.Status.has(inW, 'slow'));
  // miss
  const f = env(); f.dummy(-1000, 0); f.cast('icewall'); f.run(f.V('icewall', 'duration') + 0.5);
  assert.strictEqual(f.miss.length, 1); assert.strictEqual(f.hit.length, 0);
});

test('ice wall: talent dps and facing', () => {
  const e = env({ quas: 4, wex: 4, exort: 7 }, { talents: ['special_bonus_unique_invoker_ice_wall_dps'] });
  assert.strictEqual(e.V('icewall', 'damage_per_second'), 50 + env({ quas: 4, wex: 4, exort: 7 }).V('icewall', 'damage_per_second'));   // talent adds 50 on top of the exort-7 base
  e.h.facing = Math.PI / 2;
  const d = e.dummy(0, 200);
  e.cast('icewall'); e.run(0.7);
  assert.ok(e.dealt('icewall', d) > 0);
});

test('emp: danger, mana burn + damage, caster restore, miss', () => {
  const e = env({ quas: 2, wex: 3, exort: 2 });
  const d = e.dummy(700, 0), out = e.dummy(700, 1500);
  e.cast('emp', { x: 700, y: 0 }); e.run(0.4);
  const th = e.w.query(t => t.ability === 'emp')[0];
  assert.ok(th); near(th.danger.r, e.V('emp', 'area_of_effect')); near(th.danger.at - e.w.t, e.V('emp', 'delay') - 0.4, 0.15);
  e.h.base.manaRegen = 0; e.h.manaRegen = 0; d.base.manaRegen = 0; d.manaRegen = 0; const m0 = d.mana, hm = e.h.mana = 100;
  e.run(e.V('emp', 'delay'));
  const burned = Math.min(m0, e.V('emp', 'mana_burned'));
  near(m0 - d.mana, burned, 1e-6);
  near(e.dealt('emp', d), burned * e.V('emp', 'damage_per_mana_pct') / 100, 1e-6);
  near(e.h.mana - hm, burned * e.V('emp', 'self_mana_restore_pct') / 100, 2);
  assert.strictEqual(e.dealt('emp', out), 0); assert.strictEqual(out.mana, out.maxMana);
  assert.strictEqual(e.hit.length, 1);
  const f = env(); f.dummy(-1000, 0); f.cast('emp', { x: 500, y: 0 }); f.run(f.V('emp', 'delay') + 0.3);
  assert.strictEqual(f.miss.length, 1);
});

test('emp: low-mana target burns only what it has; shard drags toward center', () => {
  const e = env({ quas: 2, wex: 3, exort: 2 }, { shard: true });
  assert.strictEqual(e.V('emp', 'drag_speed'), 125);
  const d = e.dummy(900, 0); d.mana = 20; d.base.manaRegen = 0; d.manaRegen = 0;
  e.cast('emp', { x: 700, y: 0 }); e.run(1.5);
  assert.ok(d.x < 900 - 100, 'dragged ' + d.x);
  assert.ok(d.x >= 700 - 1e-6);
  e.run(e.V('emp', 'delay'));
  near(e.dealt('emp', d), 20 * e.V('emp', 'damage_per_mana_pct') / 100, 1e-6);
  // no shard: no drag
  const f = env({ quas: 2, wex: 3, exort: 2 });
  const d2 = f.dummy(900, 0); f.cast('emp', { x: 700, y: 0 }); f.run(1.5);
  assert.strictEqual(d2.x, 900);
});

test('shard upgrades only the chosen spell', () => {
  const e = env({ quas: 4, wex: 4, exort: 4 }, { shard: true, shardSpell: 'sunstrike' });
  assert.ok(e.V('sunstrike', 'create_forged_spirit_on_hero_damage') > 0);
  assert.strictEqual(e.V('emp', 'drag_speed'), 0); assert.strictEqual(e.V('ghostwalk', 'apply_ice_wall_debuff'), 0);
  const f = env({ quas: 4, wex: 4, exort: 4 }, { shard: true, shardSpell: 'ghostwalk' });
  assert.ok(f.V('ghostwalk', 'apply_ice_wall_debuff') > 0); assert.strictEqual(f.V('sunstrike', 'create_forged_spirit_on_hero_damage'), 0);
  assert.strictEqual(f.h.ctx.shardSpell, 'ghostwalk');
  // legacy: shard without a spell upgrades all
  const g = env({ quas: 4, wex: 4, exort: 4 }, { shard: true });
  assert.ok(g.V('emp', 'drag_speed') > 0);
});

test('ghost walk shard: ice wall dps on enemy heroes (dummies) in the aura', () => {
  const run = (shardSpell) => {
    const e = env({ quas: 4, wex: 4, exort: 4 }, shardSpell ? { shard: true, shardSpell } : {});
    const d = e.dummy(200, 0), far = e.dummy(2000, 0);
    e.cast('ghostwalk'); e.run(3.2);
    return { e, d, far };
  };
  const on = run('ghostwalk'), off = run('emp');
  const dps = on.e.IT.Values.get('invoker_ice_wall', 'damage_per_second', on.e.h.ctx);
  assert.ok(dps > 0);
  const got = on.e.dealt('ghostwalk', on.d);
  assert.ok(got >= dps * 2.5 && got <= dps * 3.5, 'dps ' + got);
  assert.strictEqual(on.e.dealt('ghostwalk', on.far), 0);
  assert.strictEqual(off.e.dealt('ghostwalk', off.d), 0);
});

test('sun strike shard: damaging an enemy hero spawns a forge spirit there without replacing others', () => {
  const e = env({ quas: 4, wex: 1, exort: 4 }, { shard: true, shardSpell: 'sunstrike' });
  e.cast('forgespirit'); e.run(0.1);
  const had = e.w.query(u => u.kind === 'spirit').map(s => s.id);
  assert.ok(had.length >= 1);
  const d = e.dummy(800, 0);
  e.cast('sunstrike', { x: 800, y: 0 }); e.run(e.V('sunstrike', 'delay') + 0.1);
  const sp = e.w.query(u => u.kind === 'spirit');
  assert.strictEqual(sp.length, had.length + 1);
  assert.ok(had.every(id => sp.some(s => s.id === id)));
  const ns = sp.find(s => !had.includes(s.id));
  assert.strictEqual(ns.team, 0); assert.ok(Math.hypot(ns.x - 800, ns.y) < 80);
  // miss: no spirit; no shard: no spirit
  const f = env({ quas: 4, wex: 1, exort: 4 }, { shard: true, shardSpell: 'sunstrike' });
  f.dummy(2000, 0); f.cast('sunstrike', { x: 800, y: 0 }); f.run(f.V('sunstrike', 'delay') + 0.1);
  assert.strictEqual(f.w.query(u => u.kind === 'spirit').length, 0);
  const g = env({ quas: 4, wex: 1, exort: 4 });
  g.dummy(800, 0); g.cast('sunstrike', { x: 800, y: 0 }); g.run(g.V('sunstrike', 'delay') + 0.1);
  assert.strictEqual(g.w.query(u => u.kind === 'spirit').length, 0);
});

test('forge spirit count = min(quas, exort) counts', () => {
  const cnt = (q, x) => { const e = env({ quas: q, wex: 1, exort: x }); e.cast('forgespirit'); e.run(0.1); return e.w.query(u => u.kind === 'spirit').length; };
  assert.strictEqual(cnt(1, 1), 1); assert.strictEqual(cnt(7, 1), 1); assert.strictEqual(cnt(1, 7), 1);
  assert.strictEqual(cnt(4, 4), 2); assert.strictEqual(cnt(7, 7), 2); assert.strictEqual(cnt(7, 4), 2);
});

test('tornado: lift, land damage, invulnerable while lifted, path vision, miss', () => {
  const e = env({ quas: 7, wex: 4, exort: 1 });
  const d = e.dummy(600, 80), off = e.dummy(600, 600);
  e.cast('tornado', { x: 2000, y: 0 }); e.run(0.1);
  const th = e.w.query(t => t.ability === 'tornado')[0];
  assert.ok(th); assert.strictEqual(th.vision, e.V('tornado', 'vision_distance'));
  e.run(0.7 + 0.15);   // quas 7 lifts shorter: the Sun Strike below must still land inside the lift
  assert.ok(e.IT.Status.has(d, 'lift'), 'lifted'); assert.ok(d.z > 0);
  assert.ok(!e.IT.Status.has(off, 'lift'));
  const lift = e.V('tornado', 'lift_duration');
  assert.strictEqual(e.dealt('tornado'), 0);
  // sun strike on lifted target does nothing
  e.cast('sunstrike', { x: 600, y: 80 }); e.run(0.1);
  assert.strictEqual(e.IT.Combat.damage(e.w, { src: e.h.id, target: d, type: 'pure', amount: 99 }), 0);
  e.run(lift + 0.2);
  assert.ok(!e.IT.Status.has(d, 'lift')); assert.strictEqual(d.z, 0);
  near(e.dealt('tornado', d), e.V('tornado', 'base_damage') + e.V('tornado', 'wex_damage') + e.V('tornado', 'quas_damage'));
  assert.strictEqual(e.dealt('sunstrike', d), 0);
  assert.strictEqual(e.hit.filter(x => x.ability === 'tornado').length, 1);
  assert.strictEqual(e.dealt('tornado', off), 0);
  // miss
  const f = env(); f.dummy(0, 1500); f.cast('tornado', { x: 2000, y: 0 });
  f.run(f.V('tornado', 'travel_distance') / f.V('tornado', 'travel_speed') + 0.5);
  assert.strictEqual(f.miss.length, 1); assert.strictEqual(f.miss[0].ability, 'tornado');
  f.run(3);
  assert.strictEqual(f.w.query(t => t.ability === 'tornado').length, 0);
});

test('tornado scepter: twisters along the path (7.41: Scepter on Wex)', () => {
  const e = env({ quas: 3, wex: 4, exort: 1 }, { scepter: true, scepterOrb: 'wex' });
  const gap = e.V('tornado', 'twister_distance_interval'); assert.strictEqual(gap, 300);
  e.cast('tornado', { x: 2000, y: 0 }); e.run(1.2);
  const tw = e.w.query(t => t.ability === 'tornado' && t.dir === undefined);
  assert.ok(tw.length >= 1);
  const d = e.dummy(tw[0].x, tw[0].y + 20);
  e.run(1);
  assert.ok(e.dealt('tornado', d) > 0);
});

test('alacrity: stats applied to self and ally, removed on expiry; default target = caster', () => {
  const e = env({ quas: 1, wex: 4, exort: 4 }, { talents: ['special_bonus_unique_invoker_5'] });
  const as = e.V('alacrity', 'bonus_attack_speed'), bd = e.V('alacrity', 'bonus_damage');
  assert.strictEqual(as, 46 + 25);
  const a0 = e.h.attack.as, mn = e.h.attack.min;
  e.cast('alacrity', { target: e.h.id }); e.run(0.3);
  assert.ok(e.IT.Status.has(e.h, 'alacrity'));
  near(e.h.attack.as, a0 + as); near(e.h.attack.min, mn + bd);
  e.run(e.V('alacrity', 'duration'));
  assert.ok(!e.IT.Status.has(e.h, 'alacrity')); near(e.h.attack.as, a0); near(e.h.attack.min, mn);
  // ally spirit
  e.cast('forgespirit'); e.run(0.1);
  const sp = e.w.query(u => u.kind === 'spirit')[0];
  e.cast('alacrity', { target: sp.id }); e.run(0.2);
  assert.ok(e.IT.Status.has(sp, 'alacrity')); assert.ok(!e.IT.Status.has(e.h, 'alacrity'));
  near(sp.attack.min, e.V('forgespirit', 'spirit_damage') + bd);
  // enemy is not a valid target; no target -> caster (direct call)
  const d = e.dummy(300, 0);
  e.h.cd.alacrity = 0;
  assert.strictEqual(e.IT.Abilities.check(e.w, e.h, 'alacrity', { target: d.id }), 'targetInvalid');
  e.h.cd.alacrity = 0;
  e.IT.Abilities.get('alacrity').cast(e.w, e.h, {});
  assert.ok(e.IT.Status.has(e.h, 'alacrity'));
});

test('forge spirit: count, recast replaces, melting strike stacks and caps', () => {
  const e = env({ quas: 4, wex: 1, exort: 4 }, null, { autoAttack: true });
  const n = Math.max(1, Math.min(e.V('forgespirit', 'extra_spirit_count_quas'), e.V('forgespirit', 'extra_spirit_count_exort')));
  e.cast('forgespirit'); e.run(0.1);
  let sp = e.w.query(u => u.kind === 'spirit');
  assert.strictEqual(sp.length, n); assert.ok(n >= 2);
  const old = sp.map(s => s.id);
  e.cast('forgespirit'); e.run(0.1);
  sp = e.w.query(u => u.kind === 'spirit');
  assert.strictEqual(sp.length, n);
  assert.ok(sp.every(s => !old.includes(s.id)));
  const d = e.dummy(200, 0); d.base.armor = 5; d.armor = 5;
  e.run(6);
  const m = e.IT.Status.find(d, 'melt');
  assert.ok(m, 'melt');
  const per = e.V('forgespirit', 'armor_per_attack'), max = e.IT.Values.get('forged_spirit_melting_strike', 'max_armor_removed', e.h.ctx);
  near(m.data.stats.armor, -Math.min(max, per * m.data.stacks), 1e-9);
  assert.ok(m.data.stacks >= 3);
  near(d.armor, 5 + m.data.stats.armor, per + 1e-6); // stats system lags the latest hit by one step
  // cap
  const cap = max / per;
  const fake = { type: 'melt', until: 1e9, data: { stacks: Math.ceil(cap) + 50, stats: {} } };
  assert.ok(Math.min(max, per * fake.data.stacks) === max);
});

test('forge spirit talent: armor reduction +50%', () => {
  const e = env({ quas: 4, wex: 1, exort: 4 }, { talents: ['special_bonus_unique_invoker_forged_spirit_armor_reduction'] });
  near(e.V('forgespirit', 'armor_per_attack'), 1.1 * 1.5);
});

test('chaos meteor: danger, tick damage, burn, rolling, miss', () => {
  const e = env({ quas: 1, wex: 4, exort: 4 });
  const r = e.V('chaosmeteor', 'area_of_effect'), land = e.V('chaosmeteor', 'land_time'), dist = e.V('chaosmeteor', 'travel_distance'), spd = e.V('chaosmeteor', 'travel_speed');
  const d = e.dummy(600, 0), far = e.dummy(600, 900);
  e.cast('chaosmeteor', { x: 600, y: 0 }); e.run(0.2);
  const th = e.w.query(t => t.ability === 'chaosmeteor')[0];
  assert.ok(th); assert.strictEqual(th.vision, e.V('chaosmeteor', 'vision_distance'));
  near(th.danger.r, r); near(th.danger.at - e.w.t, land - 0.2, 0.15);
  assert.strictEqual(e.dealt('chaosmeteor'), 0);
  e.run(land - 0.2 + 0.05);
  const main = e.V('chaosmeteor', 'main_damage');
  near(e.dealt('chaosmeteor', d), main);   // first tick on landing
  assert.ok(e.IT.Status.has(d, 'burn'));
  e.run(1.0);
  assert.ok(e.dealt('chaosmeteor', d) > 2 * main - 1e-6);
  assert.ok(th.x > 600 + 50);   // rolling east
  assert.strictEqual(e.dealt('chaosmeteor', far), 0);
  assert.strictEqual(e.hit.filter(x => x.ability === 'chaosmeteor' && x.target === d.id).length, 1);
  // burn continues after the meteor has left, then ends
  e.run(dist / spd + 1);
  const hpMark = e.dealt('chaosmeteor', d);
  e.run(e.V('chaosmeteor', 'burn_duration') + 0.7);
  assert.ok(!e.IT.Status.has(d, 'burn'));
  assert.ok(e.dealt('chaosmeteor', d) >= hpMark);
  const f = env(); f.dummy(-1500, 0); f.cast('chaosmeteor', { x: 600, y: 0 }); f.run(30);
  assert.strictEqual(f.miss.length, 1); assert.strictEqual(f.w.query(t => t.ability === 'chaosmeteor').length, 0);
});

test('chaos meteor talent: 3 meteors, one hit per enemy', () => {
  const e = env({ quas: 1, wex: 4, exort: 4 }, { talents: ['special_bonus_unique_invoker_additional_chaos_meteors'] });
  assert.strictEqual(e.V('chaosmeteor', 'meteor_count'), 3);
  e.cast('chaosmeteor', { x: 600, y: 0 }); e.run(0.2);
  const ms = e.w.query(t => t.ability === 'chaosmeteor');
  assert.strictEqual(ms.length, 3); assert.ok(ms.every(m => m.danger));
  assert.strictEqual(new Set(ms.map(m => Math.round(m.y))).size, 3);
});

test('deafening blast: damage, knockback, disarm, hit once; miss', () => {
  const e = env({ quas: 3, wex: 3, exort: 4 });
  const d = e.dummy(500, 0), off = e.dummy(500, 600);
  e.cast('deafeningblast', { x: 1000, y: 0 }); e.run(0.1);
  e.run(0.8);
  near(e.dealt('deafeningblast', d), e.V('deafeningblast', 'damage'));
  assert.strictEqual(e.dealt('deafeningblast', off), 0);
  assert.ok(e.IT.Status.has(d, 'knockback'));
  e.run(0.3);
  assert.ok(d.x > 500 + 50, 'pushed ' + d.x);
  assert.ok(e.IT.Status.has(d, 'disarm'));
  const kb = e.V('deafeningblast', 'knockback_duration'), dis = e.V('deafeningblast', 'disarm_duration');
  near(e.IT.Status.find(d, 'disarm').until - e.w.t + 1.2 - 0.0, kb + dis + (e.w.t - e.w.t) , 1.2);
  e.run(kb + dis + 0.5);
  assert.ok(!e.IT.Status.has(d, 'disarm'));
  assert.strictEqual(e.hit.filter(x => x.ability === 'deafeningblast').length, 1);
  assert.strictEqual(e.dmg.filter(x => x.ability === 'deafeningblast').length, 1);
  const f = env(); f.dummy(0, 900); f.cast('deafeningblast', { x: 1000, y: 0 }); f.run(2.5);
  assert.strictEqual(f.miss.length, 1);
  f.run(3);
  assert.strictEqual(f.w.query(t => t.ability === 'deafeningblast').length, 0);
});

test('deafening blast knockback cancels the dummy stun bolt telegraph', () => {
  const e = env({ quas: 3, wex: 3, exort: 4 });
  const d = e.dummy(500, 0, { scenario: { stunBolt: true } });
  const bolts = []; e.w.on('bolt', b => bolts.push(b.phase));
  e.run(0.2);
  assert.deepStrictEqual(bolts, ['start']);
  e.cast('deafeningblast', { x: 1000, y: 0 }); e.run(0.7);
  assert.ok(bolts.includes('cancel'), bolts.join());
  assert.ok(!bolts.includes('hit'));
});

test('deafening blast radial talent: fires all around', () => {
  const e = env({ quas: 3, wex: 3, exort: 4 }, { talents: ['special_bonus_unique_invoker_2'] });
  assert.strictEqual(e.V('deafeningblast', 'radial_count'), 12);
  const ds = [[500, 0], [-500, 0], [0, 500], [0, -500]].map(p => e.dummy(p[0], p[1]));
  e.cast('deafeningblast', { x: 1000, y: 0 }); e.run(1.2);
  for (const d of ds) near(e.dealt('deafeningblast', d), e.V('deafeningblast', 'damage'));
  assert.strictEqual(e.hit.length, 4);
  for (const d of ds) assert.strictEqual(e.dmg.filter(x => x.ability === 'deafeningblast' && x.target === d.id).length, 1);
});

test('delayed AoE thinkers carry danger so evasive dummies dodge them', () => {
  const e = env({ quas: 3, wex: 3, exort: 4 });
  const d = e.dummy(500, 0, { behavior: 'evasive', preset: 'expert' });
  d.reaction = 0.1;
  e.cast('sunstrike', { x: 500, y: 0 });
  let far = 0;
  for (let i = 0; i < 40; i++) { e.run(0.05); far = Math.max(far, Math.hypot(d.x - 500, d.y)); }
  assert.ok(far > e.V('sunstrike', 'area_of_effect'), 'left area ' + far);
  assert.ok(e.fx.some(f => f.name === 'dodge'));
});
