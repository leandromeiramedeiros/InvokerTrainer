'use strict';
// v6 medal: run score = CLEAR (normalized scenario points) + RELIC (relic levels earned this run x weight), summary split,
// retuned per-run medal bands (tools/score_sample.mjs, DECISIONS.md "v6 medal"), splash / share breakdown line + i18n.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/difficulty.js', 'js/data/scenarios.js', 'js/data/ranks.js', 'js/data/relics.js',
  'js/data/i18n.js', 'js/data/i18n/s3.js', 'js/data/i18n/f1.js', 'js/data/i18n/scn.js', 'js/data/i18n/end.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/ranked.js', 'js/sim/stats.js', 'js/ui/endsplash.js'];
const IT = load(FILES);
const R = IT.Ranked, SC = IT.StatsCollector, RL = IT.RELICS, F = IT.Ranks.fromRun, map = IT.Map.build(IT.MAPDEF);

test('clear score: difficulty is a normalized bonus (ian x1 .. bambam x1.3), not df.mult', () => {
  const D = IT.DIFFICULTY;
  assert.equal(R.diffBonus(D.get('ian')), 1);
  assert.equal(R.diffBonus(D.get('bambam')), 1.3);
  for (let i = 1; i < D.order.length; i++) assert.ok(R.diffBonus(D.get(D.order[i])) > R.diffBonus(D.get(D.order[i - 1])));
  const at = id => R.scenarioScore(R.diffBonus(D.get(id)), 10, 10, 0);
  assert.equal(at('ian'), 150); assert.equal(at('bambam'), 195);
  assert.ok(at('bambam') / at('ian') <= 1.3 + 1e-9, 'difficulty adds at most +30 %');
  // infinite laps grow df.mult; the bonus stays capped
  assert.equal(R.diffBonus(R.infDifficulty(D.get('bambam'), 3)), 1.3);
});

test('relic score: delta / step x weight x K, capped per relic; spell-skill relics weigh 3x raw volume', () => {
  for (const r of RL.LIST) assert.ok([1, 2, 3].includes(r.weight), r.id);
  for (const id of ['sunstrike_kills', 'tornado_kills', 'multi_icewall', 'three_emp', 'three_deafening', 'multi_meteor', 'cataclysm_hits']) assert.equal(RL.BY[id].weight, 3, id);
  for (const id of ['alacrity_dmg', 'kills', 'meteor_dmg', 'emp_mana']) assert.equal(RL.BY[id].weight, 1, id);
  const K = SC.RELIC_K;
  assert.deepEqual(SC.relicScore({}), { score: 0, parts: [] });
  assert.equal(SC.relicScore(null).score, 0);
  assert.equal(SC.relicScore({ sunstrike_kills: 3 }).score, Math.round(3 / 15 * 3 * K));
  assert.equal(SC.relicScore({ alacrity_dmg: 25000 }).score, K);
  assert.equal(SC.relicScore({ alacrity_dmg: 1e7 }).score, Math.round(SC.RELIC_CAP * K), 'capped at RELIC_CAP levels');
  // 25000 alacrity damage (a full Dota level of raw volume) is worth less than 2x three Sun Strike kills
  assert.ok(SC.relicScore({ alacrity_dmg: 25000 }).score < 2 * SC.relicScore({ sunstrike_kills: 3 }).score);
  // same level of progress: a skill relic gives 3x a raw one
  assert.equal(SC.relicScore({ three_emp: 1 }).score, 3 * SC.relicScore({ kills: 15 }).score);
  const p = SC.relicScore({ sunstrike_kills: 3, kills: 3, meteor_dmg: 750 });
  assert.equal(p.score, p.parts.reduce((a, q) => a + q.pts, 0) || p.score);
  assert.equal(p.parts[0].id, 'sunstrike_kills', 'parts sorted by points');
  // trainer relics (no Dota step) normalize by their tier I threshold
  assert.equal(SC.relicScore({ meteor_dmg: 750 }).score, Math.round(0.5 * K));
});

test('ranked summary carries score = clearScore + relicScore (relics of this run only, ranked only)', () => {
  R.reset();
  const run = R.create({ mode: 'ranked', seed: 3 }), pr = run.next(), sp = map.spawns.hero;
  const w = IT.World.create({ seed: 3, map, loadout: pr.lo, fog: pr.fog, autoAttack: false });
  IT.Hero.create(w, pr.lo, sp.x, sp.y);
  const S = SC.create(w);
  let end = null; w.on('modeEnd', p => { end = p; });
  run.attach(w);
  run.score = 740; run.n = 3;   // clear points so far (3 turns played: the rating records)
  S.data.relics.sunstrike_kills = 3; S.data.relics.kills = 6;
  const sum = run.finish('quit');
  const rel = SC.relicScore({ sunstrike_kills: 3, kills: 6 }).score;
  assert.equal(sum.clearScore, 740); assert.equal(sum.relicScore, rel); assert.equal(sum.score, 740 + rel);
  assert.ok(Array.isArray(sum.relicParts) && sum.relicParts.length === 2);
  assert.equal(end, sum);
  assert.equal(sum.rank.score, sum.score, 'the stored rating folds the total');
  // infinite: no relic part
  const ir = R.create({ mode: 'infinite', seed: 3 }), ip = ir.next();
  const w2 = IT.World.create({ seed: 3, map, loadout: ip.lo, fog: ip.fog, autoAttack: false });
  IT.Hero.create(w2, ip.lo, sp.x, sp.y);
  const S2 = SC.create(w2); ir.attach(w2); ir.score = 300; S2.data.relics.kills = 30;
  const s2 = ir.finish('quit');
  assert.equal(s2.relicScore, 0); assert.equal(s2.score, 300); assert.equal(s2.clearScore, 300);
});

test('medal bands: clean lowest ramp ~ Legend / Ancient, perfect hard p50 Divine, Immortal = 8/8 + top band', () => {
  const name = m => F(m).name;
  assert.deepEqual(Array.from(IT.Ranks.RUN_START), [0, 400, 800, 1250, 1700, 2150, 2600, 2850]);
  // sampled (tools/score_sample.mjs): clean ian-ramp 8/8 p10 / p50 / p95 ~ 2070 / 2220 / 2430
  assert.equal(name({ score: 2070, solved: 8, turns: 8 }), 'Legend');
  assert.equal(name({ score: 2220, solved: 8, turns: 8 }), 'Ancient');
  assert.equal(name({ score: 2430, solved: 8, turns: 8 }), 'Ancient');
  assert.equal(name({ score: 2680, solved: 8, turns: 8 }), 'Divine');
  assert.equal(name({ score: 2870, solved: 8, turns: 8 }), 'Immortal');
  assert.equal(name({ score: 2870, solved: 7, turns: 8 }), 'Divine', 'Immortal needs 8/8');
  assert.equal(name({ score: 2870, solved: 5, turns: 8 }), 'Legend', 'RUN_CAP by clears');
  assert.deepEqual(Array.from(IT.Ranks.RUN_CAP), [0, 1, 1, 2, 3, 4, 5, 6, 7]);
});

test('splash / share breakdown line: "Clear X + Relics Y = Z" (EN / PT), ranked only', () => {
  const B = IT.UI.Splash.breakdown;
  IT.setLang('en');
  assert.equal(B({ mode: 'ranked', score: 950, clearScore: 740, relicScore: 210 }), 'Clear 740 + Relics 210 = 950');
  assert.equal(B({ mode: 'ranked', score: 2950, clearScore: 2100, relicScore: 850 }), 'Clear 2,100 + Relics 850 = 2,950');
  assert.equal(B({ mode: 'infinite', score: 300, clearScore: 300, relicScore: 0 }), '');
  assert.equal(B({ mode: 'ranked', score: 300 }), '', 'old summaries without the split: no line');
  IT.setLang('pt');
  assert.equal(B({ mode: 'ranked', score: 950, clearScore: 740, relicScore: 210 }), 'Cenários 740 + Relíquias 210 = 950');
  IT.setLang('en');
  for (const k of ['end.sp.breakdown', 'end.sp.breakdown.d']) { assert.ok(IT.I18N.en[k], k); assert.ok(IT.I18N.pt[k], k); }
  const d = IT.UI.Splash.shareData({ mode: 'ranked', score: 950, clearScore: 740, relicScore: 210, solved: 8, turns: 8 }, { tiles: [], cleared: 8, ornament: 0, medal: F({ score: 950, solved: 8, turns: 8 }), damage: { total: 0, bySpell: [] } });
  assert.equal(d.breakdown, 'Clear 740 + Relics 210 = 950');
});
