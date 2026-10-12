'use strict';
// v6 day / night: w.tod cycle timing (Dota 300 s + 300 s), per-unit day / night vision with the sunset ramp (hero, enemy, tower, spirit),
// enemy sight follows it, per-scenario time of day table (js/data/daynight.js).
const test = require('node:test'), assert = require('node:assert');
const load = require('./_load.js');
const FILES = ['js/data/i18n.js', 'js/data/i18n/s3.js', 'js/data/i18n/f1.js', 'js/data/i18n/scn.js',
  'js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/daynight.js', 'js/data/map.js', 'js/data/dotaworld.js', 'js/data/maps.js', 'js/data/difficulty.js',
  'js/data/combos.js', 'js/data/scenarios.js', 'js/data/ranks.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/stats.js', 'js/sim/towers.js', 'js/sim/ranked.js', 'js/ui/hudsteps.js'];
const IT = load(FILES);
const DN = IT.DayNight;

function world(tod) {
  const lo = IT.Loadout.normalize(IT.Loadout.default());
  const w = IT.World.create({ seed: 3, map: null, loadout: lo, fog: false, tod });
  const h = IT.Hero.create(w, lo, 0, 0);
  return { w, h };
}
// fake world: just the time of day (fast cycle stepping)
const bare = tod => ({ ents: [], tod: DN.make(tod), emit() {} });
const stepFor = (w, s, dt) => { for (let i = 0, n = Math.round(s / dt); i < n; i++) DN.tick(w, dt); };

test('Dota values: cycle 300 s per phase, 10 s ramp, KV vision pairs', () => {
  assert.equal(DN.CYCLE, 300); assert.equal(DN.RAMP, 10);
  assert.equal(IT.DOTA.hero.VisionDaytimeRange, 1800); assert.equal(IT.DOTA.hero.VisionNighttimeRange, 800);
  const fs = IT.DOTA.units.npc_dota_invoker_forged_spirit;
  assert.deepEqual([fs.VisionDaytimeRange, fs.VisionNighttimeRange], [1200, 800]);
  assert.deepEqual(DN.TOWER[1], [1900, 800]); assert.deepEqual(DN.TOWER[2], [1900, 1100]); assert.deepEqual(DN.TOWER[4], [1900, 1100]);
  assert.deepEqual([IT.GAME.ENEMY.vision, IT.GAME.ENEMY.visionNight], [1800, 800]);
});

test('cycle timing: day 0-300 s, sunset ramp 300-310 s, night until 600 s, then day', () => {
  const w = bare('cycle'), dt = 1 / 30;
  assert.equal(DN.factor(w), 0); assert.equal(DN.left(w), 300);
  stepFor(w, 299.9, dt);
  assert.equal(w.tod.night, false); assert.equal(DN.factor(w), 0);
  assert.ok(Math.abs(DN.progress(w) - 299.9 / 300) < 1e-3);
  stepFor(w, 0.2, dt);   // 300.1 s
  assert.equal(w.tod.night, true, 'night at 300 s');
  assert.ok(DN.factor(w) > 0 && DN.factor(w) < 0.05, 'ramp just started');
  stepFor(w, 4.9, dt);   // ~305 s: half way
  assert.ok(Math.abs(DN.factor(w) - 0.5) < 0.02, 'half way through the sunset');
  stepFor(w, 5.2, dt);   // ~310.2 s
  assert.equal(DN.factor(w), 1, 'fully dark 10 s after the flip');
  stepFor(w, 289.7, dt);   // ~599.9 s
  assert.equal(w.tod.night, true);
  stepFor(w, 0.2, dt);
  assert.equal(w.tod.night, false, 'day again at 600 s');
  stepFor(w, 11, dt);
  assert.equal(DN.factor(w), 0);
  assert.equal(DN.make('night').len, Infinity, 'fixed night never flips');
  assert.equal(DN.make('bogus').mode, 'day', 'unknown spec = day');
});

test('vision radius day / night / transition: hero, enemy, tower T1 + T2, Forge Spirit; refill dummy fixed 800', () => {
  const { w, h } = world('day');
  const en = IT.Units.spawnEnemy(w, { x: 3000, y: 0 });
  const dm = IT.Units.spawnEnemy(w, { x: 3000, y: 500, refill: true });
  const t1 = IT.Towers.spawn(w, { tier: 1, team: 1, x: 6000, y: 0 }), t2 = IT.Towers.spawn(w, { tier: 2, team: 1, x: 9000, y: 0 });
  const sp = IT.Units.spawnSpirit(w, h, 100, 0);
  const vis = () => [h.vision, en.vision, t1.vision, t2.vision, sp.vision, dm.vision];
  w.step();
  assert.deepEqual(vis(), [1800, 1800, 1900, 1900, 1200, 800], 'day');
  w.tod = DN.make('night'); w.step();
  assert.deepEqual(vis(), [800, 800, 800, 1100, 800, 800], 'night');
  w.tod = { mode: 'cycle', night: true, t: 0, len: 300, fade: 5 + w.dt, cycle: true }; w.step();   // half way through the sunset
  assert.deepEqual(vis(), [1300, 1300, 1350, 1500, 1000, 800], 'transition');
  assert.equal(DN.radius(w, en), 1300);
  // an enemy spawned mid-ramp gets the ramped value too
  assert.equal(IT.Units.spawnEnemy(w, { x: 0, y: 3000 }).vision, 1300);
});

test('a vision someone else set (destroyed tower 0, test override) is left alone', () => {
  const { w } = world('day');
  const tw = IT.Towers.spawn(w, { tier: 1, team: 1, x: 2000, y: 0 });
  const d = w.add({ kind: 'dummy', team: 1, x: 0, y: 500, hp: 100, vision: 1500 });
  w.step();
  tw.vision = 0; tw.destroyed = true;
  w.tod = DN.make('night'); w.step(); w.step();
  assert.equal(tw.vision, 0); assert.equal(d.vision, 1500);
});

test('enemy notice / sight uses the same radius: sees the hero at 1200 u by day, not by night', () => {
  const { w, h } = world('day');
  const en = IT.Units.spawnEnemy(w, { x: 1200, y: 0 });
  w.step();
  assert.equal(IT.Vision.canSee(w, en, h), true, 'day: 1800 covers 1200');
  assert.equal(IT.Vision.teamSees(w, 1, h), true);
  w.tod = DN.make('night'); w.step();
  assert.equal(IT.Vision.canSee(w, en, h), false, 'night: 800 does not');
  assert.equal(IT.Vision.teamSees(w, 1, h), false);
  en.x = 700; assert.equal(IT.Vision.canSee(w, en, h), true, 'night: 700 u is inside 800');
});

test('scenario table: every entry is a real scenario, default is day, specs resolve', () => {
  const ids = new Set(IT.SCENARIOS.map(s => s.id));
  for (const id of Object.keys(DN.SCENARIO)) assert.ok(ids.has(id), id + ' is a scenario');
  assert.equal(DN.forScenario('sleepy_target'), 'day');
  assert.equal(DN.forScenario('nope'), 'day');
  assert.equal(DN.forScenario(null), 'day');
  assert.equal(DN.make(DN.forScenario('ghost_escape')).night, true);
  const p = DN.make(DN.forScenario('plateau_escape'));
  assert.equal(p.night, false); assert.equal(p.len, 6); assert.equal(p.mode, 'nightAt');
  // burst / basics stay in daylight
  for (const s of IT.SCENARIOS) if ((s.tags || []).some(t => t === 'burst' || t === 'basics') && !(s.tags || []).includes('escape')) assert.equal(DN.forScenario(s.id), 'day', s.id);
});

function build(id) {
  const run = IT.Ranked.create({ mode: 'practice', diff: 'easy', scenario: id, seed: 5 });
  const pr = run.next(), m0 = IT.Maps.get('grounds');
  const w = IT.World.create({ seed: 5, map: m0, loadout: pr.lo, fog: pr.fog });
  DN.attach(w, { tod: 'day' });
  const h = IT.Hero.create(w, pr.lo, m0.spawns.hero.x, m0.spawns.hero.y);
  run.attach(w);
  return { run, w, h };
}

test('a night scenario starts dark (hero + foes 800) already in the countdown', () => {
  const { run, w, h } = build('ghost_escape');
  assert.equal(w.tod.night, true); assert.equal(DN.factor(w), 1);
  assert.equal(h.vision, 800);
  for (const e of run.dummies) assert.equal(e.vision, 800);
});

test('plateau_escape: daylight, sunset at 6 s of play, dark 10 s later', () => {
  const { run, w, h } = build('plateau_escape');
  assert.equal(h.vision, 1800);
  run.skip();
  for (let i = 0; i < 5.5 * 30; i++) w.step();
  assert.equal(h.vision, 1800, 'still day at 5.5 s');
  for (let i = 0; i < 5.5 * 30; i++) w.step();
  assert.ok(h.vision < 1800 && h.vision > 800, 'sunset at 11 s: ' + h.vision);
  for (let i = 0; i < 6 * 30; i++) w.step();
  if (run.phase === 'play') assert.equal(h.vision, 800, 'dark at 17 s');
  else assert.equal(DN.factor(w) > 0, true);
});
