'use strict';
// v6 items 8 + 9: end-splash per-turn timeline, best combo / most used spell, tier -> effect table, i18n parity, share timeline line.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const load = require('./_load.js');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/difficulty.js', 'js/data/scenarios.js', 'js/data/ranks.js', 'js/data/relics.js',
  'js/data/i18n.js', 'js/data/i18n/s3.js', 'js/data/i18n/f1.js', 'js/data/i18n/scn.js', 'js/data/i18n/end.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/ranked.js', 'js/sim/stats.js', 'js/ui/endsplash.js'];
const IT = load(FILES);
const SP = IT.UI.Splash;

const turn = (n, ok, o) => Object.assign({ n, id: 'sc' + n, name: 'Scenario number ' + n, ok, reason: ok ? null : 'time', detail: null, time: 6, par: 8, limit: 20, points: ok ? 150 : 0, steps: ['sunstrike', 'coldsnap'], dmg: 100 }, o || {});
const eight = () => [...Array(8)].map((_, i) => turn(i, i % 2 === 0, { time: 4 + i, par: 8, points: i % 2 === 0 ? 150 + i * 10 : 0, reason: i % 2 ? ['time', 'died', 'method', 'seen'][i >> 1] : null }));

test('tier -> effect table: every column monotonic non-decreasing, 8 tiers', () => {
  for (const k of Object.keys(SP.FX)) {
    const col = SP.FX[k]; assert.equal(col.length, 8, k);
    for (let i = 1; i < 8; i++) assert.ok(col[i] >= col[i - 1], k + ' @' + i);
  }
  assert.equal(SP.FX.sandMax[0], 0); assert.equal(SP.FX.sandMax[1], 0);
  assert.equal(SP.FX.rays[0], 0);
  for (let i = 0; i < 6; i++) assert.equal(SP.FX.gold[i], 0);
  assert.equal(SP.FX.gold[6], 1); assert.equal(SP.FX.gold[7], 1);
  assert.ok(SP.FX.rain[7] > SP.FX.rain[5] && SP.FX.pile[7] > SP.FX.pile[3]);
  assert.equal(SP.fxOf(99).tier, 7); assert.equal(SP.fxOf(-3).tier, 0);
});

test('timeline model: 8-turn ranked summary', () => {
  const c = SP.timeline({ mode: 'ranked', turns: 8, log: eight() });
  assert.equal(c.length, 8);
  assert.deepEqual(c.map(x => x.n), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(c.map(x => x.state), ['ok', 'fail', 'ok', 'fail', 'ok', 'fail', 'ok', 'fail']);
  assert.equal(c[1].reason, 'time'); assert.equal(c[3].reason, 'died');
  assert.ok(c[0].under && !c[7].under);   // 4s vs par 8 / 11s vs par 8
  for (const x of c) { assert.ok(x.frac >= 0.04 && x.frac <= 1); assert.ok(x.short.length <= 11); }
  assert.equal(c[2].points, 170);
});

test('timeline model: missing turns, duplicate turn (last wins), infinite = last 8', () => {
  const miss = SP.timeline({ mode: 'ranked', turns: 8, log: [turn(0, true), turn(1, false)] });
  assert.equal(miss.length, 8); assert.equal(miss[2].state, 'none'); assert.equal(miss[7].state, 'none');
  assert.equal(SP.timeline({ mode: 'ranked' }).length, 8);
  assert.equal(SP.timeline(null).length, 8);
  const dup = SP.timeline({ mode: 'ranked', turns: 8, log: [turn(0, false), turn(0, true)] });
  assert.equal(dup[0].state, 'ok');
  const inf = SP.timeline({ mode: 'infinite', log: [...Array(12)].map((_, i) => turn(i, true)) });
  assert.equal(inf.length, 8); assert.equal(inf[0].n, 5); assert.equal(inf[7].n, 12);
  assert.equal(SP.timeline({ mode: 'infinite', log: [turn(0, true), turn(1, true)] }).length, 2);
});

test('best combo: top clear points, tie -> damage, null without clears; most used spell fallback', () => {
  const c = SP.timeline({ mode: 'ranked', turns: 8, log: eight() });
  assert.equal(SP.bestCombo(c).n, 7);   // +210 is the top clear
  const tie = SP.timeline({ mode: 'ranked', turns: 8, log: [turn(0, true, { points: 150, dmg: 10 }), turn(1, true, { points: 150, dmg: 90 }), turn(2, false)] });
  assert.equal(SP.bestCombo(tie).n, 2);
  const none = SP.timeline({ mode: 'ranked', turns: 8, log: [turn(0, false), turn(1, false)] });
  assert.equal(SP.bestCombo(none), null); assert.equal(SP.bestCombo([]), null); assert.equal(SP.bestCombo(null), null);
  assert.deepEqual(JSON.parse(JSON.stringify(SP.mostUsed({ spells: { sunstrike: { casts: 12 }, coldsnap: { casts: 7 }, tornado: { casts: 0 } } }))), { id: 'sunstrike', casts: 12 });
  assert.equal(SP.mostUsed({ spells: {} }), null); assert.equal(SP.mostUsed(null), null);
});

test('abbr caps length with an ellipsis', () => {
  assert.equal(SP.abbr('Short', 11), 'Short');
  const a = SP.abbr('A very long scenario name', 11);
  assert.ok(a.length <= 11 && a.endsWith('…'));
  assert.equal(SP.abbr('', 5), ''); assert.equal(SP.abbr(null, 5), '');
});

test('i18n: new end.* keys exist in EN and PT with matching placeholders', () => {
  const keys = ['end.sp.bestCombo', 'end.sp.topSpell', 'end.sp.casts', 'end.sp.pts', 'end.sp.dmgN', 'end.tl.title', 'end.tl.turn', 'end.tl.par', 'end.tl.skipped', 'end.tl.cleared', 'share.timeline'];
  const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join();
  for (const k of keys) {
    for (const l of ['en', 'pt']) assert.ok(IT.I18N[l][k], l + ' ' + k);
    assert.equal(ph(IT.I18N.en[k]), ph(IT.I18N.pt[k]), k);
  }
});

test('ranked summary records the per-turn log; share data carries the timeline', () => {
  const src = fs.readFileSync(require('node:path').join(__dirname, '..', 'js/sim/ranked.js'), 'utf8');
  assert.match(src, /run\.log\.push\(/); assert.match(src, /log: run\.log\.slice\(\)/);
  const m = { mode: 'ranked', score: 500, solved: 4, turns: 8, log: eight() };
  const d = SP.shareData(m, IT.StatsCollector.curated(IT.StatsCollector.blank(), m));
  assert.equal(d.timeline.length, 8);
  assert.deepEqual(d.timeline.map(x => x.state).slice(0, 2), ['ok', 'fail']);
});
