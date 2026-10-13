'use strict';
// v6 #68: enemy move speed scales by difficulty (DIFFICULTY.msMul on the base, before boots / travels / Euls). The bot numbers reuse the
// levels_v6 harness. Also the v6 #67b rename emp_tornado_trap -> tornado_emp_drop (old id aliased).
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

test('#68: msMul per tier (ian .82, easy .88, common .95, hard 1, bambam 1), monotone', () => {
  const want = { ian: 0.82, easy: 0.88, common: 0.95, hard: 1, bambam: 1 };
  for (const k of Object.keys(want)) assert.equal(DF.get(k).msMul, want[k], k);
  const order = ['ian', 'easy', 'common', 'hard', 'bambam'].map(k => DF.get(k).msMul);
  for (let i = 1; i < order.length; i++) assert.ok(order[i] >= order[i - 1]);
});

test('#68: a chaser\'s ms = round(max(base, tier floor) x msMul) + boots; faster tiers are never slower', () => {
  for (const id of ['dust_escape', 'force_chase', 'cold_start']) for (const seed of [1, 2, 3]) {
    let prev = 0;
    for (const diff of ['ian', 'easy', 'common', 'hard', 'bambam']) {
      const m = H.build(id, diff, seed), df = DF.get(diff), sc = m.pr.sc, us = sc.units || sc.dummies || [];
      m.run.dummies.forEach((d, i) => {
        if (us[i] && us[i].msMul) return;   // a scenario's own booted-chaser multiplier replaces the item bonus
        const bt = m.pr.vary && m.pr.vary.boots && m.pr.vary.boots[i], bonus = bt ? IT.Units.bootBonus([bt]) : 0;
        if (us[i] && us[i].mot === 'chase') assert.equal(d.ms, Math.round(Math.max(d.msBase, 380 * df.chase) * df.msMul) + bonus, id + ' ' + diff + ' ' + seed);
      });
      const d0 = m.run.dummies[0]; assert.ok(d0.ms > 0);
      if (id === 'dust_escape') { assert.ok(d0.ms >= prev - 1, id + ' ' + diff + ' ' + d0.ms + ' < ' + prev); prev = d0.ms; }
    }
  }
});

test('#68: easy bot clears sun_flee (1-6) and plateau_escape (1-5); treeline_loop is in juke_v6 easy sweep', () => {
  const bad = [];
  for (const [id, seeds] of [['sun_flee', [1, 2, 3, 4, 5, 6]], ['plateau_escape', [1, 2, 3, 4, 5]]])
    for (const seed of seeds) { const { r } = H.botRun(id, 'easy', seed); if (!(r && r.ok)) bad.push(id + '|' + seed + ' ' + (r ? r.reason + '/' + r.detail : 'none')); }
  assert.deepEqual(bad, []);
});

test('#67b: emp_tornado_trap renamed tornado_emp_drop; the old id still resolves', () => {
  assert.ok(SC.find(s => s.id === 'tornado_emp_drop'));
  assert.ok(!SC.find(s => s.id === 'emp_tornado_trap'));
  assert.equal(SC.get('emp_tornado_trap').id, 'tornado_emp_drop');
  assert.equal(SC.get('tornado_emp_drop').id, 'tornado_emp_drop');
  assert.equal(SC.get('nope'), null);
  for (const k of ['name', 'desc', 'tip', 'win', 'lose', 'flair']) {
    assert.ok(IT.I18N.t ? IT.I18N.t('scn.tornado_emp_drop.' + k) !== 'scn.tornado_emp_drop.' + k : true, k);
  }
});
