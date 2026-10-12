'use strict';
// Modes v4: ranked = fixed 8 scenarios; 10 s (v6: 12 s) pre-scenario countdown that an action can skip.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/difficulty.js', 'js/data/scenarios.js', 'js/data/ranks.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/stats.js', 'js/sim/ranked.js'];
const IT = load(FILES);
const R = IT.Ranked, map = IT.Map.build(IT.MAPDEF);

function mk(o) {
  const run = R.create(Object.assign({ mode: 'ranked', seed: 5 }, o || {}));
  const pr = run.next(), sp = map.spawns.hero;
  const w = IT.World.create({ seed: 5, map, loadout: pr.lo, fog: pr.fog, autoAttack: false });
  IT.Hero.create(w, pr.lo, sp.x, sp.y);
  const ends = [];
  w.on('modeEnd', p => ends.push(p));
  run.attach(w);
  return { run, w, ends };
}

test('countdown is 12 s (v6 intro), frozen, and skip() starts play at once', () => {
  assert.equal(R.COUNTDOWN, 12);
  const { run, w } = mk();
  assert.equal(run.phase, 'countdown'); assert.equal(w.paused, true);
  run.tick(3); assert.equal(run.phase, 'countdown');   // no input = no skip
  assert.equal(run.skip(), true);
  assert.equal(run.phase, 'play'); assert.equal(w.paused, false);
  assert.equal(run.skip(), false);   // only while counting down
});

test('skip() does nothing once ended; ticking alone still finishes the countdown', () => {
  const a = mk(); a.run.tick(12.1); assert.equal(a.run.phase, 'play');
  const b = mk(); b.run.finish('quit'); assert.equal(b.run.skip(), false);
});

test('ranked ends after exactly 8 scenarios with a rating record', () => {
  const { run, w, ends } = mk();
  assert.equal(run.turns, 8); assert.equal(R.hud(w).turn, 1);
  for (let i = 0; i < 8; i++) {
    assert.equal(run.ended, false, 'turn ' + i);
    run.skip();
    run.tick(1e-3);
    // fail the scenario by timing out
    for (let k = 0; k < 4000 && run.phase === 'play'; k++) w.step();
    assert.equal(run.phase === 'result' || run.ended, true);
    for (let k = 0; k < 200 && run.phase === 'result'; k++) run.tick(1 / 30);
  }
  assert.equal(run.ended, true); assert.equal(run.n, 8);
  assert.equal(ends.length, 1); assert.equal(ends[0].reason, 'turns');
  assert.ok(ends[0].rank);
});

test('practice has no turn limit and a 3 s countdown', () => {
  const p = R.create({ mode: 'practice', diff: 'hard', seed: 1 });
  assert.equal(p.turns, null); assert.equal(p.runLeft, null);
});
