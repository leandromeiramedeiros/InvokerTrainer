'use strict';
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const fresh = () => load(['js/data/dota.js', 'js/sim/values.js']);
const IT = fresh();
const V = IT.Values;
const L = (o, extra) => V.ctx(Object.assign({ heroLevel: 1, talents: [], scepter: false, shard: false }, extra,
  { orbs: Object.assign({ quas: 0, wex: 0, exort: 0 }, o) }));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('meta + hero stats', () => {
  assert.match(IT.DOTA.meta.sha, /^[0-9a-f]{40}$/);
  assert.strictEqual(V.hero('AttackRange'), 600);
  assert.strictEqual(V.hero('MovementSpeed'), 280);
  assert.strictEqual(V.hero('AttackRate'), 1.7);
  assert.strictEqual(V.hero('AttackAnimationPoint'), 0.4);
  assert.strictEqual(V.hero('ProjectileSpeed'), 900);
  assert.strictEqual(IT.DOTA.hero.talents.length, 4);
});

test('SPELL_IDS all exist', () => {
  for (const id of Object.values(V.SPELL_IDS)) assert.ok(IT.DOTA.abilities[id], id);
});

test('sun strike damage by exort', () => {
  assert.strictEqual(V.get('invoker_sun_strike', 'damage', L({ exort: 1 })), 175);
  assert.strictEqual(V.get('invoker_sun_strike', 'damage', L({ exort: 8 })), 525);
  assert.strictEqual(V.get('invoker_sun_strike', 'damage', L({ exort: 0 })), 175);
});

test('sun strike cooldown/mana/talent', () => {
  assert.strictEqual(V.cooldown('invoker_sun_strike', L({})), 23);
  assert.strictEqual(V.cooldown('invoker_sun_strike', L({}, { talents: ['special_bonus_unique_invoker_11'] })), 19);
  assert.strictEqual(V.manaCost('invoker_sun_strike', L({})), 175);
  assert.strictEqual(V.get('invoker_sun_strike', 'delay', L({})), 1.7);
});

test('cold snap', () => {
  const c = L({ quas: 1 });
  assert.strictEqual(V.castRange('invoker_cold_snap', c), 1000);
  assert.strictEqual(V.castPoint('invoker_cold_snap', c), 0.05);
  assert.strictEqual(V.cooldown('invoker_cold_snap', c), 19);
  assert.strictEqual(V.manaCost('invoker_cold_snap', c), 100);
  near(V.get('invoker_cold_snap', 'duration', L({ quas: 1 })), 3.0);
  near(V.get('invoker_cold_snap', 'duration', L({ quas: 8 })), 5.8);
  near(V.get('invoker_cold_snap', 'freeze_duration', L({ quas: 8 })), 0.4);
  assert.strictEqual(V.cooldown('invoker_cold_snap', L({}, { talents: ['special_bonus_unique_invoker_9'] })), 13);
});

test('misc spell numbers + mod ops', () => {
  assert.strictEqual(V.get('invoker_tornado', 'travel_distance', L({ wex: 1 })), 1500);
  assert.strictEqual(V.get('invoker_tornado', 'travel_distance', L({ wex: 8 })), 3600);
  assert.strictEqual(V.get('invoker_emp', 'delay', L({ wex: 5 })), 2.9);
  assert.strictEqual(V.get('invoker_emp', 'area_of_effect', L({})), 675);
  assert.strictEqual(V.get('invoker_chaos_meteor', 'land_time', L({})), 1.3);
  assert.strictEqual(V.get('invoker_chaos_meteor', 'area_of_effect', L({})), 275);
  assert.strictEqual(V.get('invoker_ice_wall', 'wall_total_length', L({})), 1200);
  assert.strictEqual(V.castRange('invoker_deafening_blast', L({})), 1000);
  assert.strictEqual(V.get('invoker_chaos_meteor', 'meteor_count', L({}, { talents: ['special_bonus_unique_invoker_additional_chaos_meteors'] })), 3);
  near(V.get('invoker_forge_spirit', 'armor_per_attack', L({ exort: 1 }, { talents: ['special_bonus_unique_invoker_forged_spirit_armor_reduction'] })), 1.2);
  assert.strictEqual(V.get('invoker_quas', 'hp_regen_per_instance', L({ quas: 3 }, { talents: ['special_bonus_unique_invoker_13'] })), 6);
});

test('invoke cooldown', () => {
  assert.strictEqual(V.invokeCooldown(L({})), 7);
  near(V.invokeCooldown(L({ quas: 3, wex: 3, exort: 3 })), 7 - 0.3 * 9);
  assert.strictEqual(V.invokeCooldown(L({ quas: 8, wex: 8, exort: 8 })), 0);
  assert.strictEqual(V.get('invoker_invoke', 'max_invoked_spells', L({})), 2);
});

test('scepter bonus levels', () => {
  const ns = L({ exort: 8 }), sc = L({ exort: 8 }, { scepter: true, scepterOrb: 'exort' });
  assert.strictEqual(L({ exort: 8 }, { scepter: true, scepterOrb: 'quas' }).eff.exort, 8);
  assert.strictEqual(ns.eff.exort, 8);
  assert.strictEqual(sc.eff.exort, 9);
  assert.strictEqual(V.get('invoker_sun_strike', 'damage', ns), 525);
  assert.strictEqual(V.get('invoker_sun_strike', 'damage', sc), 575);
  assert.strictEqual(V.get('invoker_sun_strike', 'damage', L({ exort: 9 }, { scepter: true, scepterOrb: 'exort' })), 575); // clamped
  assert.strictEqual(V.get('invoker_sun_strike', 'cataclysm_count', ns), 0);
  assert.strictEqual(V.get('invoker_sun_strike', 'cataclysm_count', sc), 2);
  assert.strictEqual(V.get('invoker_emp', 'drag_speed', L({})), 0);
  assert.strictEqual(V.get('invoker_emp', 'drag_speed', L({}, { shard: true })), 125);
  near(V.get('invoker_emp', 'damage_per_mana_pct', L({}, { shard: true })), 90);
  // per-level array replacement mod (scepter): wex 1 + bonus 1 -> level 2
  assert.strictEqual(V.get('invoker_tornado', 'twister_damage', L({ wex: 1 }, { scepter: true, scepterOrb: 'wex' })), 60);
});

test('requiresScepter / requiresShard gating', () => {
  const I = fresh();
  I.DOTA.abilities.invoker_sun_strike.values.damage.requiresScepter = true;
  I.DOTA.abilities.invoker_emp.values.drag_speed.requiresShard = true;
  const mk = (x) => I.Values.ctx(Object.assign({ orbs: { quas: 1, wex: 1, exort: 1 } }, x));
  assert.strictEqual(I.Values.get('invoker_sun_strike', 'damage', mk({})), 0);
  assert.strictEqual(I.Values.get('invoker_sun_strike', 'damage', mk({ scepter: true, scepterOrb: 'exort' })), 225);
  assert.strictEqual(I.Values.get('invoker_emp', 'drag_speed', mk({ scepter: true })), 0);
  assert.strictEqual(I.Values.get('invoker_emp', 'drag_speed', mk({ shard: true })), 125);
});

test('has / missing', () => {
  assert.ok(V.has('invoker_sun_strike', 'damage'));
  assert.ok(!V.has('invoker_sun_strike', 'nope'));
  assert.strictEqual(V.get('invoker_sun_strike', 'nope', L({})), 0);
});

test('items', () => {
  assert.strictEqual(V.item('item_blink', 'cooldown'), 15);
  assert.strictEqual(V.item('item_blink', 'blink_range'), 1200);
  assert.strictEqual(V.item('item_blink', 'castRange'), 1200);
  assert.strictEqual(V.item('item_black_king_bar', 'duration'), 9);
  assert.strictEqual(V.item('item_black_king_bar', 'duration', 2), 7);
  assert.strictEqual(V.item('item_sheepstick', 'sheep_duration'), 2.8);
  assert.strictEqual(V.item('item_refresher', 'manaCost'), 325);
  assert.strictEqual(V.item('item_refresher', 'cost'), 5000);
});

test('forged spirit unit', () => {
  assert.strictEqual(V.unit('npc_dota_invoker_forged_spirit', 'MovementSpeed'), 320);
  assert.strictEqual(V.unit('npc_dota_invoker_forged_spirit', 'AttackRate'), 1.35);
});
