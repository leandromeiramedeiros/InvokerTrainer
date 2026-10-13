'use strict';
// #77 (CEO picks on docs/GAMEPLAY-REVIEW-v6.md): I1 top-band difficulty cap, I3 BKB in the foe hp credit, I5 pit_in_out, I6 timers,
// I2 top-level pool, I4 tiered juke awareness.
const test = require('node:test');
const assert = require('node:assert');
const E = require('./_edgebot.js');
const { IT } = E, R = IT.Ranked, DF = IT.DIFFICULTY;
const sc = id => IT.SCENARIOS.find(s => s.id === id);

test('I1: ranked never sends L9-10 above hard; maxDf caps further', () => {
  assert.strictEqual(R.capDiff(4, sc('refresher_double')), 3);
  assert.strictEqual(R.capDiff(4, sc('tornado_chain')), 4, 'L8 keeps bambam');
  assert.strictEqual(R.capDiff(4, sc('gauntlet')), DF.get('common').idx);
  assert.strictEqual(R.capDiff(1, sc('gauntlet')), 1, 'never raises');
  for (const s of IT.SCENARIOS) if (s.maxDf) assert.ok(DF.get(s.maxDf), s.id + ' maxDf is a tier');
});

test('I3: a BKB carrier takes less credited magic damage only after a disable step', () => {
  const s = sc('gleipnir_burst'), lo = R.prepare(s, DF.get('hard')).lo;
  const hard = R.comboDamage(s, DF.get('hard'), lo), bam = R.comboDamage(s, DF.get('bambam'), lo);
  assert.ok(bam.foes[0] < hard.foes[0], 'tier BKB (bambam) lowers the credit');
  const t = sc('tornado_icewall_landing') || sc('tornado_chain'), b2 = R.comboDamage(t, DF.get('bambam'), lo);
  assert.ok(b2.parts.every(p => p.eff.every((v, k) => v <= p.dmg)), 'eff never above raw');
  const noDis = IT.SCENARIOS.find(x => x.level && (x.steps || []).length && !(x.steps || []).some(st => ['coldsnap', 'atos', 'vyse', 'orchid', 'gleipnir', 'meteorhammer'].indexOf(st.a) >= 0) && x.obj && x.obj.type === 'kill');
  if (noDis) { const c = R.comboDamage(noDis, DF.get('bambam'), lo); assert.ok(c.parts.every(p => p.eff.every((v) => v === p.dmg)), noDis.id + ': no disable, full credit'); }
});

test('I5: pit_in_out is clearable: the route leaves the crater by its west lip (cover in the crater, hide outside), capped at common', () => {
  const s = sc('pit_in_out');
  assert.deepEqual([s.spots.cover.dx, s.spots.cover.dy, s.spots.hide.dx, s.spots.hide.dy], [-624, -480, -732, -1508]);
  assert.strictEqual(s.maxDf, 'common');
  assert.ok(s.tags.indexOf('fun') >= 0, 'keeps its fun tag (bot clears ian-common)');
});

test('I6: limit = par x timer + the tier slack; hard / bambam tight, ian / easy roomy, fixed limits kept', () => {
  const lim = (id, d) => R.limitOf(sc(id), DF.get(d));
  assert.deepEqual(['ian', 'easy', 'common', 'hard', 'bambam'].map(d => DF.get(d).slack), [6, 5, 4, 1, 1]);
  const s = sc('gleipnir_burst');
  assert.strictEqual(lim('gleipnir_burst', 'hard'), Math.ceil(s.par * DF.get('hard').timer + 1));
  assert.ok(lim('gleipnir_burst', 'ian') > 2 * lim('gleipnir_burst', 'bambam'));
  const fx = IT.SCENARIOS.find(x => x.limit != null);
  if (fx) assert.strictEqual(R.limitOf(fx, DF.get('bambam')), fx.limit);
  for (const x of IT.SCENARIOS) for (const d of ['hard', 'bambam']) assert.strictEqual(R.prepare(x, DF.get(d)).limit, x.obj.type === 'escape' || x.obj.type === 'hold' ? x.obj.time : R.limitOf(x, DF.get(d)), x.id);
});

test('I2: ranked pick window is >= +-1 level and favours unplayed on-target scenarios', () => {
  assert.ok(R.PICK_R0 >= 1);
  const seen = new Set();
  for (let seed = 1; seed <= 30; seed++) { const run = R.create({ mode: 'ranked', rating: 4000, seed }); run.n = 6; seen.add(run.next().sc.id); }
  assert.ok(seen.size >= 8, 'top band variety ' + seen.size);
  const lv = [...seen].map(id => sc(id).level);
  assert.ok(lv.some(l => l === 8) || lv.some(l => l === 9), 'neighbour levels reachable ' + lv.join(','));
});
