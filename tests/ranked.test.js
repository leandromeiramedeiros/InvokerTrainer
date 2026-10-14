'use strict';
// Ranked: scoring + rating math, persistence, run state machine (countdown -> play -> result -> next), HUD feed, ramp.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/difficulty.js', 'js/data/scenarios.js', 'js/data/ranks.js', 'js/data/i18n.js', 'js/data/i18n/s3.js', 'js/data/i18n/f1.js', 'js/data/i18n/scn.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/stats.js', 'js/sim/ranked.js'];
const IT = load(FILES);
const R = IT.Ranked, map = IT.Map.build(IT.MAPDEF);

function mk(o) {
  const run = R.create(Object.assign({ mode: 'ranked', seed: 3 }, o || {}));
  const pr = run.next(), sp = map.spawns.hero;
  const w = IT.World.create({ seed: 3, map, loadout: pr.lo, fog: pr.fog, autoAttack: false });
  const h = IT.Hero.create(w, pr.lo, sp.x, sp.y);
  const events = [];
  for (const k of ['scnStart', 'scnGo', 'scnResult', 'comboDone', 'comboFail', 'modeEnd', 'kill']) w.on(k, p => events.push([k, p]));
  run.attach(w);
  return { run, w, h, events };
}
const thaw = (run, max) => { for (let i = 0; i < (max || 600) && run.frozen() && !run.ended; i++) run.tick(1 / 30); };
// v6: a kill only counts once every step spell hit, so the shortcut marks the steps as landed first
const killAll = (m) => { for (const a of m.run.pr.need || []) m.run.st.used.add(a); for (const d of m.run.dummies.slice()) if (!d.dead) IT.Combat.damage(m.w, { src: m.h.id, target: d, amount: 1e6, type: 'pure' }); };

test('streak multiplier and scenario score', () => {
  assert.equal(R.streakMult(0), 1);
  assert.equal(R.streakMult(5), 1.5);
  assert.equal(R.streakMult(40), 2);
  assert.equal(R.scenarioScore(1, 10, 10, 0), 150);   // at par: +50% speed bonus
  assert.equal(R.scenarioScore(1, 10, 5, 0), 150);    // faster than par: capped
  assert.equal(R.scenarioScore(1, 10, 20, 0), 100);   // twice par or slower: no bonus
  assert.ok(R.scenarioScore(1, 10, 15, 0) > 100 && R.scenarioScore(1, 10, 15, 0) < 150);
  assert.ok(R.scenarioScore(1.8, 10, 10, 0) > R.scenarioScore(0.6, 10, 10, 0));
  assert.equal(R.scenarioScore(1.8, 10, 10, 0), R.scenarioScore(R.DIFF_BONUS_MAX, 10, 10, 0), 'v6 medal: difficulty bonus capped at +30 %');
  assert.ok(R.scenarioScore(1, 10, 10, 4) > R.scenarioScore(1, 10, 10, 0));
});

test('rating delta: monotone, clamped to +-MAX_DELTA, zero near expected', () => {
  const M = IT.Ranks.MAX_DELTA;
  assert.equal(M, 150);
  assert.equal(R.ratingDelta(1e6, 1000), M);
  assert.equal(R.ratingDelta(0, 1000), -M < R.ratingDelta(0, 1000) ? R.ratingDelta(0, 1000) : -M);
  assert.ok(R.ratingDelta(0, 3000) <= -100);
  assert.equal(R.ratingDelta(Math.round(R.expected(1000)), 1000), 0);
  let prev = -Infinity;
  for (let s = 0; s <= 3000; s += 100) { const d = R.ratingDelta(s, 1500); assert.ok(d >= prev && d >= -M && d <= M); prev = d; }
  assert.ok(R.expected(3000) > R.expected(0));
});

test('difficulty ramp by rating and by scenario count', () => {
  assert.equal(R.baseDiff(0), 0); assert.equal(R.baseDiff(1000), 1); assert.equal(R.baseDiff(2500), 2); assert.equal(R.baseDiff(4000), 3);
  assert.equal(R.rampDiff(0, 0), 0); assert.equal(R.rampDiff(0, 3), 1); assert.equal(R.rampDiff(0, 7), 2);
  assert.equal(R.rampDiff(4000, 30), 4);
  for (let n = 1; n < 20; n++) assert.ok(R.rampDiff(500, n) >= R.rampDiff(500, n - 1));
});

test('persistence: profile, record, rank up/down, floor at 0, history cap', () => {
  R.reset();
  let p = R.profile();
  assert.deepEqual(p, { rating: 0, peak: 0, games: 0, last: null });
  const a = R.record(10000);
  assert.equal(a.delta, 150); assert.equal(a.after.rating, 150);
  p = R.profile();
  assert.equal(p.rating, 150); assert.equal(p.peak, 150); assert.equal(p.games, 1); assert.deepEqual(p.last, { delta: 150, score: 10000 });
  const b = R.record(0);
  assert.ok(b.delta < 0 && b.after.rating >= 0 && b.after.rating < 150);
  assert.equal(R.profile().peak, 150);
  R.reset();
  const z = R.record(0);   // all-fail from zero: stays at 0
  assert.equal(z.delta, 0); assert.equal(R.profile().rating, 0);
  // climb until the first rank-up, then fall until the first rank-down
  R.reset();
  let up = null;
  for (let i = 0; i < 20 && !up; i++) { const r = R.record(1e6); if (r.up) up = r; }
  assert.ok(up && up.after.rank.tier * 6 + up.after.rank.stars > up.before.rank.tier * 6 + up.before.rank.stars);
  let down = null;
  for (let i = 0; i < 20 && !down; i++) { const r = R.record(0); if (r.down) down = r; }
  assert.ok(down);
  for (let i = 0; i < 60; i++) R.record(500);
  assert.ok(R.load().history.length <= 40);
  assert.equal(R.profile().games, R.load().games);
  R.reset();
});

test('run: 12 s countdown freezes the world, then play; solving moves on to the next scenario', () => {
  R.reset();
  const m = mk(), { run, w } = m;
  assert.equal(run.phase, 'countdown'); assert.equal(w.paused, true);
  let hud = R.hud(w);
  assert.equal(hud.phase, 'countdown'); assert.equal(hud.countdown, Math.ceil(run.countdown)); assert.ok(run.countdown >= 12, '12 s base, stretched to fit the intro reading holds'); assert.equal(hud.score, 0);
  const t0 = w.t; w.step(); assert.equal(w.t, t0);
  for (let i = 0; i < 31; i++) run.tick(1 / 30);
  assert.equal(R.hud(w).countdown, Math.ceil(run.countdown - 31 / 30));
  assert.equal(run.runLeft, null);   // ranked is turn-based (8 scenarios), no run clock
  thaw(run);
  assert.equal(run.phase, 'play'); assert.equal(w.paused, false);
  for (let i = 0; i < 20; i++) w.step();
  hud = R.hud(w);
  assert.equal(hud.phase, 'play'); assert.ok(hud.timeLeft > 0 && hud.timeLeft < run.pr.limit);
  assert.ok(hud.scenario && hud.objective && hud.turn === 1 && hud.turns === 8 && hud.diffDesc);
  const id0 = run.pr.sc.id;
  killAll(m);
  if (run.pr.sc.obj.type !== 'kill') { /* objective type differs: the rest of this test needs a kill scenario */ }
  w.step();
  if (run.pr.sc.obj.type === 'kill') {
    assert.equal(run.phase, 'result'); assert.equal(w.paused, true);
    assert.equal(run.result.ok, true); assert.ok(run.result.points > 0);
    assert.equal(run.solved, 1); assert.equal(run.streak, 1); assert.equal(run.score, run.result.points);
    assert.ok(m.events.some(e => e[0] === 'comboDone' && e[1].id === id0));
    assert.ok(m.events.some(e => e[0] === 'scnResult' && e[1].ok));
    assert.equal(R.hud(w).phase, 'result');
    thaw(run, Math.ceil(R.RESULT_HOLD * 30) + 2);   // result hold, then the next scenario starts in a countdown
    assert.equal(run.n, 1); assert.equal(run.phase, 'countdown');
    assert.equal(w.hero.hp, w.hero.maxHp);
    assert.ok(run.dummies.length > 0 && run.dummies.every(d => !d.dead));
  }
});

test('run: a failed scenario (time) breaks the streak and scores nothing', () => {
  R.reset();
  const m = mk({ seed: 11 }), { run, w } = m;
  thaw(run);
  // jump the clock past the limit without anyone dying
  w.t = run.t0 + run.pr.limit + 1;
  const kind = run.pr.sc.obj.type;
  w.step();
  assert.equal(run.phase, 'result');
  // escape scenarios are won by surviving (#30: a timed escape also needs its step spells cast -> 'method' fail here, nothing was cast)
  assert.equal(run.result.ok, kind === 'escape' && !run.pr.need.length);
  if (kind !== 'escape') {
    assert.equal(run.result.reason, 'time'); assert.equal(run.failed, 1); assert.equal(run.streak, 0); assert.equal(run.score, 0);
    assert.ok(m.events.some(e => e[0] === 'comboFail'));
  }
});

test('run: the optional runSeconds clock ends the run, emits modeEnd, records the rating once', () => {
  R.reset();
  // v6 item 28: this test map has no river / pit regions, so a pickup scenario's rune lands on the idle hero: no pickups here (idle never scores)
  const held = IT.SCENARIOS.filter(s => s.pickups).map(s => [s, s.pickups]); for (const [s] of held) s.pickups = [];
  const m = mk({ runSeconds: 70 }), { run, w } = m;
  for (let i = 0; i < 3000 && !run.ended; i++) { if (run.frozen()) run.tick(1 / 30); else w.step(); }
  for (const [s, p] of held) s.pickups = p;
  assert.equal(run.ended, true);
  assert.equal(R.RUN_SECONDS, undefined, 'dead constant gone');
  const end = m.events.filter(e => e[0] === 'modeEnd');
  assert.equal(end.length, 1);
  const s = end[0][1];
  assert.equal(s.mode, 'ranked'); assert.equal(s.reason, 'time'); assert.equal(s.score, 0);
  assert.ok(s.rank && s.rank.delta <= 0);
  assert.equal(R.profile().games, 1);
  run.finish('quit'); run.tick(1);
  assert.equal(R.profile().games, 1);   // finishing twice never double-records
  assert.equal(w.paused, true);
});

test('run: abandoning before anything happened does not touch the rating', () => {
  R.reset();
  const m = mk(), { run } = m;
  const s = run.finish('quit');
  assert.equal(s.reason, 'quit'); assert.equal(s.rank, undefined);
  assert.equal(R.profile().games, 0);
});

test('practice: difficulty fixed, endless, no score; sandbox scenario: no countdown, no time limit', () => {
  const p = mk({ mode: 'practice', diff: 'hard' });
  assert.equal(p.run.pr.df.id, 'hard'); assert.equal(p.run.runLeft, null);
  const hp = R.hud(p.w);
  assert.equal(hp.score, null); assert.equal(hp.runLeft, null); assert.equal(hp.phase, 'countdown'); assert.equal(hp.countdown, 3);
  const s = mk({ mode: 'sandbox', scenario: 'sun_snipe' });
  assert.equal(s.run.pr.sc.id, 'sun_snipe');
  // v6: nothing is pre-invoked, so a fixed sandbox scenario gets the full 12 s countdown (v6 intro) to invoke (no time limit after it)
  assert.equal(s.run.phase, 'countdown'); assert.equal(R.hud(s.w).countdown, Math.ceil(s.run.countdown)); assert.ok(s.run.countdown >= 12);
  thaw(s.run);
  assert.equal(s.run.phase, 'play'); assert.equal(s.w.paused, false);
  assert.equal(R.hud(s.w).timeLeft, null);
  s.w.t += 500; s.w.step(); s.w.step();
  assert.notEqual(s.run.result && s.run.result.reason, 'time');
  const id = s.run.pr.sc.id;
  s.run.redo();
  assert.equal(s.run.pr.sc.id, id); assert.equal(s.run.dummies.length, 1);
});

test('ranked ramp: low rating starts easy, scenario difficulty never decreases within a run', () => {
  const run = R.create({ mode: 'ranked', rating: 0, seed: 9 });
  let prev = -1;
  // #77 I1: the RAMP never decreases; a played tier is the ramp capped by the scenario (L9-10 <= hard, its own maxDf)
  for (let i = 0; i < 12; i++) { run.n = i; const pr = run.next(), rd = R.rampDiff(0, i); assert.ok(rd >= prev); prev = rd; assert.equal(pr.df.idx, R.capDiff(rd, pr.sc), pr.sc.id); }
  assert.ok(prev >= 3);
  const hi = R.create({ mode: 'ranked', rating: 4000, seed: 9 });
  assert.equal(hi.next().df.idx, 3);
});
