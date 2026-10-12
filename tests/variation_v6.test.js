'use strict';
// v6 item 40: per-play variation (pr.vary = { seed, posJit, hpMul, hp, reactionMul, boots }), seeded from the run rng in ranked.
// The bot sweep reuses the levels_v6 harness (build / bot / botRun / early are lifted from that file's source).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const load = require('./_load.js');
const src = fs.readFileSync(path.join(__dirname, 'levels_v6.test.js'), 'utf8');
const FILES = new Function('return ' + /const FILES = (\[[\s\S]*?\]);/.exec(src)[1])();
const IT = load(FILES);
const R = IT.Ranked, SC = IT.SCENARIOS, DF = IT.DIFFICULTY;
const harness = src.slice(src.indexOf('let build = function'), src.indexOf('const SEEDS'));
const H = new Function('IT', 'R', 'process', harness + '\nreturn { build, botRun, early };')(IT, R, process);

const mk = (id, diff, seed) => R.create({ mode: 'practice', diff, scenario: id, seed });
const varyOf = (id, diff, seed) => mk(id, diff, seed).next().vary;
const KILLS = SC.filter(s => s.obj.type === 'kill');

test('item 40: pr.vary shape and ranges', () => {
  const [lo, hi] = R.VARY.posJit;
  for (const sc of SC) for (const seed of [1, 2, 3]) {
    const v = varyOf(sc.id, 'common', seed);
    assert.ok(v, sc.id);
    for (const k of ['seed', 'posJit', 'hpMul', 'reactionMul', 'boots']) assert.ok(k in v, sc.id + ' ' + k);
    const pj = sc.vary && sc.vary.posJit != null ? sc.vary.posJit : null;
    if (pj == null) assert.ok(v.posJit >= lo && v.posJit <= hi, sc.id + ' posJit ' + v.posJit);
    else if (Array.isArray(pj)) assert.ok(v.posJit >= pj[0] && v.posJit <= pj[1], sc.id);
    else assert.equal(v.posJit, pj);
    assert.ok(Math.abs(v.hpMul - 1) <= 0.08 + 1e-9, sc.id + ' hpMul ' + v.hpMul);
    assert.ok(Math.abs(v.reactionMul - 1) <= 0.05 + 1e-9, sc.id + ' reactionMul ' + v.reactionMul);
    assert.equal(v.boots.length, (sc.units || sc.dummies || []).length);
  }
});

test('item 40: same seed -> identical variation and placement; different seeds differ', () => {
  for (const sc of SC) assert.deepEqual(varyOf(sc.id, 'common', 7), varyOf(sc.id, 'common', 7), sc.id);
  for (const id of ['cold_start', 'force_chase', 'river_guard_2', 'pit_trap', 'dust_hunt']) {
    const seen = new Set();
    for (const seed of [1, 2, 3, 4, 5, 6]) { const v = varyOf(id, 'common', seed); seen.add(JSON.stringify([v.seed, v.posJit, v.hpMul, v.reactionMul])); }
    assert.ok(seen.size >= 5, id + ' only ' + seen.size + ' distinct of 6');
  }
  const pos = (id, seed) => H.build(id, 'common', seed).run.dummies.map(d => (d.x | 0) + ':' + (d.y | 0)).join(' ');
  for (const id of ['cold_start', 'force_chase', 'two_birds']) {
    assert.equal(pos(id, 5), pos(id, 5), id + ' placement not reproducible');
    assert.notEqual(pos(id, 5), pos(id, 6), id + ' placement identical across seeds');
  }
});

test('item 40: seedless (practice) plays vary randomly', () => {
  const seen = new Set();
  for (let i = 0; i < 6; i++) seen.add(R.create({ mode: 'practice', diff: 'common', scenario: 'cold_start' }).next().vary.seed);
  assert.ok(seen.size >= 5);
});

test('item 40: foe hp within +-8% of the computed value; pr.hp stays the base', () => {
  let n = 0;
  for (const sc of KILLS) for (const diff of ['easy', 'common', 'hard']) for (const seed of [1, 2, 3, 4]) {
    const pr = mk(sc.id, diff, seed).next(), b = R.prepare(pr.sc, pr.df, pr.skin, pr.lo.heroLevel);
    assert.ok(b.vary == null, 'prepare() without a rng does not vary');
    if (!pr.hp) continue;
    assert.deepEqual(pr.hp, b.hp, sc.id + ' pr.hp is the base');
    pr.hp.forEach((h, i) => {
      const r = pr.vary.hp[i] / h;
      assert.ok(r >= 0.92 - 0.01 && r <= 1.08 + 0.01, sc.id + ' ' + diff + ' hp ratio ' + r.toFixed(3));
      n++;
    });
  }
  assert.ok(n > 100, 'checked ' + n);
});

const MOVER = { chase: 1, flee: 1, march: 1 };
test('item 40: chasers / fleers / marchers carry boots (travels from level 16), raising ms; still foes never', () => {
  let seenBoots = 0, seenTravels = 0;
  for (const sc of SC) for (const seed of [1, 2, 3]) {
    const m = H.build(sc.id, 'common', seed), v = m.pr.vary, lvl = m.pr.lo.heroLevel, us = sc.units || sc.dummies || [];
    us.forEach((u, i) => {
      const bt = v.boots[i], d = m.run.dummies[i];
      if (u.mot === 'still') return assert.equal(bt, null, sc.id + ' still foe got boots');
      if (u.boots === false || (sc.vary && sc.vary.boots === false)) return assert.equal(bt, null, sc.id + ' opt-out');
      if (MOVER[u.mot] && u.boots === undefined) {
        assert.equal(bt, lvl >= 16 ? 'travels' : 'boots', sc.id + ' lvl ' + lvl);
        if (bt === 'travels') seenTravels++; else seenBoots++;
      }
      if (bt && d && d.items) assert.ok(d.items.some(s => s && s.id === bt), sc.id + ' item missing on the foe card');
    });
  }
  assert.ok(seenBoots > 0 && seenTravels > 0, 'boots ' + seenBoots + ' travels ' + seenTravels);
  const df = DF.get('common'), m = H.build('dust_escape', 'common', 2), d = m.run.dummies[0], bt = m.pr.vary.boots[0];
  assert.ok(bt, 'dust_escape chaser has boots');
  assert.equal(d.ms, 380 * df.chase + IT.Units.bootBonus([bt]));
  assert.equal(IT.Units.bootBonus(['boots']), 45);
  assert.equal(IT.Units.bootBonus(['boots', 'travels']), 90);
  assert.equal(IT.Units.bootBonus(['bkb']), 0);
});

test('item 40: bot sweep with variation (easy seeds 1-6 clear, common seeds 1-3 kill no foe early)', () => {
  const KNOWN = new Set(['triple_kill', 'shadow_strike', 'cataclysm_finish', 'plateau_escape', 'gauntlet']);   // bot-limited at baseline too (see levels_v6 KNOWN)
  const bad = [];
  for (const sc of SC) for (const [df, seeds] of [['easy', [1, 2, 3, 4, 5, 6]], ['common', [1, 2, 3]]]) for (const seed of seeds) {
    const { r, m } = H.botRun(sc.id, df, seed), e = H.early(m);
    if (df === 'common' && e.length && sc.id !== 'gauntlet') bad.push(sc.id + '|' + df + '|' + seed + ' early foe ' + e.join(','));
    if (df === 'easy' && !KNOWN.has(sc.id) && !(r && r.ok)) bad.push(sc.id + '|' + df + '|' + seed + ' ' + (r ? r.reason + '/' + r.detail : 'none'));
  }
  assert.deepEqual(bad, []);
});
