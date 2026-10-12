'use strict';
// Batch H3 (final audit): legacy dummy AI unified into the enemy path (refill flag), dead ranked constants, missing staple combos.
const test = require('node:test');
const assert = require('node:assert');
const env = require('./_unitsenv.js');
const load = require('./_load.js');

// ---------------------------------------------------------------- BAD-8
test('BAD-8: Standard / Expert dummies are real enemies carrying the refill flag; the scarecrow is the only kind:dummy', () => {
  const { IT, w } = env();
  assert.equal(IT.Units.looksEnemy, undefined, 'looksEnemy hack removed');
  const t = IT.Units.spawnDummy(w, { x: 100, y: 0, preset: 'training' });
  const s = IT.Units.spawnDummy(w, { x: 200, y: 0, preset: 'standard' });
  const x = IT.Units.spawnDummy(w, { x: 300, y: 0, preset: 'expert' });
  assert.deepEqual([t.kind, s.kind, x.kind], ['dummy', 'enemy', 'enemy']);
  assert.ok(t.refill && s.refill && x.refill);
  assert.equal(s.attack, null); assert.equal(x.attack, null);   // training dummies never hit back
  assert.equal(IT.Units.trainers(w).length, 3);
  assert.equal(IT.Units.enemies(w).filter(e => !e.refill).length, 0, 'no real enemy among them');
  const real = IT.Units.spawnEnemy(w, { x: 400, y: 0, preset: 'standard' });
  assert.ok(!real.refill, 'a plain spawnEnemy is a real unit');
  assert.equal(IT.Units.trainers(w).length, 3);
});

test('BAD-8: refill-on-death for every trainer, real enemies still die', () => {
  const { IT, w, hero } = env();
  for (const p of ['training', 'standard', 'expert']) {
    const d = IT.Units.spawnDummy(w, { x: 100, y: 0, preset: p });
    IT.Combat.damage(w, { src: hero.id, target: d, ability: 'sunstrike', type: 'pure', amount: d.maxHp * 5 });
    assert.ok(!d.dead && d.hp === d.maxHp, p + ' refilled');
    assert.ok(w.log.some(e => e.type === 'refill' && e.unit === d.id), p);
  }
  const real = IT.Units.spawnEnemy(w, { x: 500, y: 0, preset: 'standard' });
  IT.Combat.damage(w, { src: hero.id, target: real, ability: 'sunstrike', type: 'pure', amount: real.maxHp * 5 });
  assert.ok(real.dead || real.killed, 'real enemy dies');
});

test('BAD-8: Standard wanders and Expert moves on the shared enemy tick; the scarecrow stays put', () => {
  const { IT, w, run } = env();
  const p = IT.Units.spawnDummy(w, { x: 1000, y: 1000, preset: 'training' });
  const s = IT.Units.spawnDummy(w, { x: 1000, y: 1500, preset: 'standard' });
  const x = IT.Units.spawnDummy(w, { x: 1000, y: 2000, preset: 'expert' });
  assert.equal(s.ai.behavior, 'wander'); assert.equal(x.ai.behavior, 'evasive');
  const p0 = [p.x, p.y], s0 = [s.x, s.y];
  run(30 * 12);
  assert.deepEqual([p.x, p.y], p0, 'scarecrow stationary');
  assert.ok(Math.hypot(s.x - s0[0], s.y - s0[1]) > 5, 'standard wandered');
  assert.ok(!s.dead && !x.dead);
});

test('BAD-8: dead ranked constants removed, default mode is sandbox', () => {
  const IT = load(['js/data/i18n.js', 'js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/dotaworld.js', 'js/data/maps.js', 'js/data/difficulty.js',
    'js/data/combos.js', 'js/data/scenarios.js', 'js/data/ranks.js', 'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
    'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js', 'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js',
    'js/sim/combo.js', 'js/sim/stats.js', 'js/sim/towers.js', 'js/sim/ranked.js']);
  const R = IT.Ranked;
  assert.equal(R.RUN_SECONDS, undefined); assert.equal(R.PRACTICE_COUNTDOWN, undefined);
  assert.equal(R.create({ seed: 3 }).mode, 'sandbox');
  assert.equal(R.create({ mode: 'ranked', seed: 3 }).ranked, true);
});

// ---------------------------------------------------------------- staple combos
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/combos.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/combo.js', 'js/sim/stats.js'];
const CI = load(FILES);

test('staples: Blink -> full combo -> Refresher is the Blink + Tornado/EMP/Meteor/Blast line, then Refresher and the repeat', () => {
  const c = CI.Combo.get('t_blink_full_refresher');
  assert.ok(c); assert.equal(c.tier, 'items');
  assert.deepEqual(c.steps.map(s => s.ability), ['blink', 'tornado', 'emp', 'chaosmeteor', 'deafeningblast', 'refresher', 'chaosmeteor', 'deafeningblast']);
  assert.ok(c.requires.items.includes('blink') && c.requires.items.includes('refresher'));
  assert.ok(c.tip.en.length > 30 && c.tip.pt.length > 30 && c.tip.en !== c.tip.pt);
  const T = CI.Combo.timing();
  const e = CI.Combo.windowOf(c, 2, T, {}), m = CI.Combo.windowOf(c, 3, T, {});
  assert.equal(e.ref, 1); assert.equal(m.ref, 1);   // EMP / Meteor count from the Tornado (step 1), not from the Blink
});

test('staples: Sun Strike -> Tornado lifts only after the strike lands', () => {
  const c = CI.Combo.get('i_sunstrike_tornado');
  assert.ok(c); assert.equal(c.tier, 'intermediate');
  assert.deepEqual(c.steps.map(s => s.ability), ['sunstrike', 'tornado']);
  assert.ok(c.tip.en.length > 30 && c.tip.pt.length > 30 && c.tip.en !== c.tip.pt);
  const T = CI.Combo.timing(), win = CI.Combo.windowOf(c, 1, T, { dist: 450 });
  assert.equal(win.ref, 0);
  // tornado hit = cast + (dist - radius) / speed must land at or just after T.ss
  const hit = win.wait + (450 - T.tornadoRadius) / T.tornadoSpeed;
  assert.ok(hit >= T.ss && hit - T.ss < 0.3, 'hit ' + hit + ' vs ss ' + T.ss);
});
