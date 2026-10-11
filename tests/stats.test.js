'use strict';
// Stats collector: accuracy, invoke latency, damage split, CC uptime, bolts/blinks, combos, APM, merge.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/combos.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/combo.js', 'js/sim/stats.js'];
const IT = load(FILES);
const map = IT.Map.build(IT.MAPDEF);

function mk() {
  const lo = IT.Loadout.normalize(IT.Loadout.default());
  const w = IT.World.create({ seed: 4, map, loadout: lo, fog: false, autoAttack: false });
  const h = IT.Hero.create(w, lo, map.spawns.hero.x, map.spawns.hero.y);
  const d = IT.Units.spawnDummy(w, { x: h.x + 400, y: h.y, preset: 'training', skin: 'pedro' });
  const S = IT.StatsCollector.create(w);
  const run = n => { for (let i = 0; i < n; i++) w.step(); };
  return { w, h, d, S, run };
}
const near = (a, b, e) => assert.ok(Math.abs(a - b) <= e, `${a} !~ ${b}`);

test('invoke latency: first orb to invoke', () => {
  const { w, h, S, run } = mk();
  IT.Invoke.orb(w, h, 'Q'); run(15); IT.Invoke.orb(w, h, 'Q'); IT.Invoke.orb(w, h, 'Q'); IT.Invoke.invoke(w, h);
  const s = S.summary();
  assert.equal(s.invoke.count, 1);
  near(s.invoke.avg, 0.5, 0.05); near(s.invoke.best, 0.5, 0.05);
});

test('accuracy per spell from hit / miss events; blind hits counted', () => {
  const { w, h, d, S } = mk();
  w.emit('cast', { unit: h.id, ability: 'sunstrike' });
  w.emit('hit', { src: h.id, target: d.id, ability: 'sunstrike', blind: true });
  w.emit('cast', { unit: h.id, ability: 'sunstrike' });
  w.emit('miss', { src: h.id, ability: 'sunstrike', x: 0, y: 0 });
  w.emit('hit', { src: h.id, target: d.id, ability: 'attack' });
  const s = S.summary();
  assert.equal(s.spells.sunstrike.casts, 2);
  assert.equal(s.spells.sunstrike.accuracy, 0.5);
  assert.equal(s.blindHits, 1);
  assert.equal(s.spells.attack, undefined);
});

test('damage: dealt / taken split by type and source, with prevented', () => {
  const { w, h, d, S } = mk();
  w.emit('damage', { src: h.id, target: d.id, ability: 'sunstrike', dmgType: 'pure', raw: 100, dealt: 100, prevented: 0 });
  w.emit('damage', { src: h.id, target: d.id, ability: 'emp', dmgType: 'magical', raw: 100, dealt: 75, prevented: 25 });
  w.emit('damage', { src: d.id, target: h.id, ability: 'stunbolt', dmgType: 'magical', raw: 80, dealt: 60, prevented: 20 });
  const s = S.summary();
  assert.equal(s.damage.dealt.total, 175);
  assert.equal(s.damage.dealt.byType.pure, 100); assert.equal(s.damage.dealt.byType.magical, 75);
  assert.equal(s.damage.dealt.bySource.emp, 75);
  assert.equal(s.damage.taken.total, 60); assert.equal(s.damage.taken.bySource.stunbolt, 60);
  assert.equal(s.damage.prevented.total, 45); assert.equal(s.damage.prevented.byType.magical, 45);
});

test('CC uptime accumulates only while the dummy is disabled', () => {
  const { w, d, S, run } = mk();
  run(30);
  IT.Status.add(w, d, 'stun', 1, {});
  run(45);
  const s = S.summary();
  near(s.cc.uptime, 1, 0.1); near(s.cc.ratio, 1 / s.time, 0.05); assert.ok(s.cc.byStatus.stun > 0.9);
});

test('bolts countered / hit and blinks', () => {
  const { w, d, h, S } = mk();
  w.emit('bolt', { unit: d.id, phase: 'cancel', reason: 'disabled', target: h.id });
  w.emit('bolt', { unit: d.id, phase: 'cancel', reason: 'range', target: h.id });
  w.emit('bolt', { unit: d.id, phase: 'blocked', target: h.id });
  w.emit('bolt', { unit: d.id, phase: 'hit', target: h.id });
  w.emit('blink', { unit: d.id, fromX: 0, fromY: 0, x: 1, y: 1 });
  const s = S.summary();
  assert.equal(s.boltsCountered, 2); assert.equal(s.boltsBlocked, 1); assert.equal(s.boltsHit, 1); assert.equal(s.blinks, 1);
});

test('blinks prevented: dummy about to blink while rooted', () => {
  const { w, d, S, run } = mk();
  d.scenario = { stunBolt: false, dummyEscape: 'blink_after_seconds', blinkAfter: 0.2 };
  IT.Status.add(w, d, 'atosRoot', 3, {});
  run(60);
  const s = S.summary();
  assert.equal(s.blinks, 0); assert.equal(s.blinksPrevented, 1);
});

test('combos per tier, best times, apm', () => {
  const { w, h, S, run } = mk();
  w.emit('comboDone', { id: 'b_coldsnap', tier: 'basic', time: 2, score: 100, perfect: true });
  w.emit('comboDone', { id: 'b_coldsnap', tier: 'basic', time: 1.5, score: 120, perfect: false });
  w.emit('comboDone', { id: 'a_x', tier: 'advanced', time: 9, score: 500, perfect: false });
  w.emit('comboFail', { id: 'a_x', reason: 'miss' });
  for (let i = 0; i < 10; i++) w.emit('order', { unit: h.id, order: {} });
  run(30 * 30);
  const s = S.summary();
  assert.equal(s.combos.done, 3); assert.equal(s.combos.byTier.basic, 2); assert.equal(s.combos.byTier.advanced, 1);
  assert.equal(s.combos.best.b_coldsnap, 1.5); assert.equal(s.combos.fails, 1); assert.equal(s.combos.score, 720);
  near(s.apm, 20, 0.5);
});

test('merge: lifetime accumulates, takes min of bests, recomputes ratios; inputs untouched', () => {
  const a = mk(), b = mk();
  a.w.emit('cast', { unit: a.h.id, ability: 'emp' }); a.w.emit('hit', { src: a.h.id, target: a.d.id, ability: 'emp' });
  b.w.emit('cast', { unit: b.h.id, ability: 'emp' }); b.w.emit('miss', { src: b.h.id, ability: 'emp', x: 0, y: 0 });
  a.w.emit('comboDone', { id: 'b_emp', tier: 'basic', time: 3, score: 100 });
  b.w.emit('comboDone', { id: 'b_emp', tier: 'basic', time: 2, score: 100 });
  a.run(30); b.run(60);
  const sa = a.S.summary(), sb = b.S.summary(), copy = JSON.stringify(sa);
  const life = IT.StatsCollector.merge(IT.StatsCollector.merge(null, sa), sb);
  assert.equal(JSON.stringify(sa), copy);
  assert.equal(life.sessions, 2);
  assert.equal(life.spells.emp.casts, 2); assert.equal(life.spells.emp.accuracy, 0.5);
  assert.equal(life.combos.done, 2); assert.equal(life.combos.best.b_emp, 2); assert.equal(life.combos.score, 200);
  near(life.time, 3, 0.1);
  assert.doesNotThrow(() => JSON.stringify(life));
});

test('destroy stops collecting', () => {
  const { w, h, S } = mk();
  S.destroy();
  w.emit('cast', { unit: h.id, ability: 'emp' });
  assert.equal(S.summary().spells.emp, undefined);
});
