'use strict';
// Batch P: the single point pool (orbs + talents at 1 point each), 0 left at level 30, gates, loadout normalize/trim, i18n.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PACKS = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/src="(js\/data\/i18n\/\w+\.js)(?:\?v=\w+)?"/g)].map(m => m[1]);   // later packs override earlier ones
const IT = require('./_load.js')(['js/data/i18n.js'].concat(PACKS, ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/dotaworld.js', 'js/data/maps.js', 'js/data/difficulty.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js']));
const R = IT.RULES;
const J = JSON.stringify;
const STYLES = ['qe', 'qw'];
const base = (o) => Object.assign({ heroLevel: 1, orbs: { quas: 0, wex: 0, exort: 0 }, talents: [], scepter: false, shard: false }, o);
const ALL8 = R.talentTiers.flatMap(t => [t.left, t.right]);

test('pool: ability points + Invoke bonus + talent points, 29 at level 30, never negative, monotonic', () => {
  assert.strictEqual(R.pointsAtLevel.length, 30);
  let prev = 0;
  for (let L = 1; L <= 30; L++) {
    const p = R.pointsAvailable(L);
    assert.ok(p >= 1 && p >= prev, 'level ' + L + ' pool ' + p);
    assert.strictEqual(p, R.abilityPointsAt(L) + R.talentPointsAt(L), 'level ' + L);
    prev = p;
  }
  assert.strictEqual(R.pointsAvailable(1), 1);
  assert.strictEqual(R.pointsAvailable(5), 5);
  assert.strictEqual(R.pointsAvailable(6), 7);     // Invoke bonus
  assert.strictEqual(R.pointsAvailable(10), 12);   // 10 + 1 bonus + 1 talent point
  assert.strictEqual(R.pointsAvailable(18), 23);   // 18 + 3 bonus + 2 talent points
  assert.strictEqual(R.pointsAvailable(26), 25);
  assert.strictEqual(R.pointsAvailable(30), 29);
  assert.strictEqual(R.abilityPointsAt(30), 21);   // = 3 orbs x 7
  assert.strictEqual(R.talentPointsAt(30), 8);     // = 8 talents x 1
  assert.strictEqual(R.pointsAvailable(30), R.orbMax * 3 + R.allTalents.length);
  assert.strictEqual(R.pointsAvailable(0), 0);
  assert.strictEqual(R.pointsAvailable(99), 29);
});

test('default / auto build spends every point at every level 1..30 (0 left) and is legal', () => {
  for (const style of STYLES) {
    for (let L = 1; L <= 30; L++) {
      const lo = R.autoLoadout(L, style);
      assert.strictEqual(R.pointsLeft(lo), 0, style + ' L' + L + ' left ' + R.pointsLeft(lo));
      assert.strictEqual(R.pointsSpent(lo), R.pointsAvailable(L), style + ' L' + L);
      const v = R.validate(lo);
      assert.ok(v.ok, style + ' L' + L + ' ' + v.errors.join(';'));
      const n = IT.Loadout.normalize(lo);                       // normalize must not change a legal auto build
      assert.strictEqual(J(n.orbs), J(lo.orbs), style + ' L' + L);
      assert.strictEqual(J(n.talents), J(lo.talents), style + ' L' + L);
    }
    const f = R.autoLoadout(30, style);
    assert.strictEqual(J(f.orbs), J({ quas: 7, wex: 7, exort: 7 }));
    assert.strictEqual(J(f.talents.slice().sort()), J(ALL8.slice().sort()));
  }
  const d = IT.Loadout.default();   // the default loadout is the level-30 auto build
  assert.strictEqual(d.heroLevel, 30);
  assert.strictEqual(R.pointsLeft(d), 0);
});

test('talents cost exactly one point each, from the same pool as the orbs', () => {
  const [t1, t2] = R.talentTiers;
  const lo = base({ heroLevel: 10, orbs: { quas: 5, wex: 5, exort: 1 } });   // 11 of 12 spent
  assert.strictEqual(R.pointsLeft(lo), 1);
  lo.talents = [t1.left];
  assert.strictEqual(R.pointsSpent(lo), 12);
  assert.strictEqual(R.pointsLeft(lo), 0);
  assert.ok(R.validate(lo).ok);
  lo.orbs = { quas: 5, wex: 5, exort: 2 };                                    // one orb point too many once the talent is paid
  const bad = R.validate(lo);
  assert.ok(!bad.ok && /points/.test(bad.errors.join()), bad.errors.join());
  assert.strictEqual(R.pointsLeft(lo), -1);
  // level info reports orbs / talents separately and subtracts both from the bank
  const li = IT.Hero.levelInfo(10, { quas: 5, wex: 5, exort: 1 }, false, [t1.left]);
  assert.strictEqual(li.spentOrbs, 11); assert.strictEqual(li.spentTalents, 1); assert.strictEqual(li.spent, 12); assert.strictEqual(li.bank, 0);
  assert.strictEqual(li.sum, 11);                                            // invoke cooldown still keys on the orb sum only
  assert.strictEqual(IT.Hero.levelInfo(10, { quas: 5, wex: 5, exort: 1 }, false, 1).bank, 0);   // a plain count works too
  assert.strictEqual(li.canRaise.quas, false);
  assert.strictEqual(IT.Hero.levelInfo(10, { quas: 5, wex: 5, exort: 1 }, false).canRaise.exort, true);
  // everything maxed at 30 leaves nothing
  const max = base({ heroLevel: 30, orbs: { quas: 7, wex: 7, exort: 7 }, talents: ALL8.slice() });
  assert.ok(R.validate(max).ok);
  assert.strictEqual(R.pointsSpent(max), 29); assert.strictEqual(R.pointsLeft(max), 0);
  // unknown names cost nothing and a duplicate is not paid twice
  assert.strictEqual(R.talentsSpent({ talents: [t1.left, t1.left, 'nope'] }), 1);
  void t2;
});

test('talent and orb gates are respected', () => {
  const [t1, t2, t3, t4] = R.talentTiers;
  assert.ok(!R.validate(base({ heroLevel: 9, talents: [t1.left] })).ok);
  assert.ok(R.validate(base({ heroLevel: 10, talents: [t1.right] })).ok);
  assert.ok(!R.validate(base({ heroLevel: 14, talents: [t2.left] })).ok);
  assert.ok(R.validate(base({ heroLevel: 15, talents: [t1.left, t2.left] })).ok);
  assert.ok(!R.validate(base({ heroLevel: 26, talents: [t1.left, t1.right] })).ok);       // a tier's second talent waits for 27+
  assert.ok(R.validate(base({ heroLevel: 27, talents: [t1.left, t1.right] })).ok);
  assert.ok(!R.validate(base({ heroLevel: 27, talents: [t1.left, t2.left, t3.left, t4.left, t1.right, t2.right] })).ok);   // 6 > 5 slots
  assert.ok(R.validate(base({ heroLevel: 28, talents: [t1.left, t2.left, t3.left, t4.left, t1.right, t2.right] })).ok);
  // orb gate 2n-1 until level 13, then unrestricted (the pool must also cover it)
  assert.ok(!R.validate(base({ heroLevel: 5, orbs: { quas: 4, wex: 0, exort: 0 } })).ok);
  assert.ok(R.validate(base({ heroLevel: 7, orbs: { quas: 4, wex: 0, exort: 0 } })).ok);
  assert.ok(R.validate(base({ heroLevel: 13, orbs: { quas: 7, wex: 6, exort: 0 } })).ok);
  assert.ok(!R.validate(base({ heroLevel: 30, orbs: { quas: 8, wex: 0, exort: 0 } })).ok);
  assert.strictEqual(R.orbCap(1), 1); assert.strictEqual(R.orbCap(12), 6); assert.strictEqual(R.orbCap(13), 7); assert.strictEqual(R.orbCap(30), 7);
  assert.strictEqual(R.talentLevels.join(), '10,15,20,25');
  assert.strictEqual(R.talentSecondLevels.join(), '27,28,29,30');
});

test('normalize: orbs first, talents get the points left; legacy no-list default only at 30', () => {
  const [t1, t2, t3, t4] = R.talentTiers;
  // 7/7/7 at level 25 leaves 4 points: exactly the four first-pick talents fit
  let l = IT.Loadout.normalize({ heroLevel: 25, orbs: { quas: 7, wex: 7, exort: 7 }, talents: [t1.left, t2.left, t3.left, t4.left] });
  assert.strictEqual(l.talents.length, 4); assert.strictEqual(R.pointsLeft(l), 0);
  // 7/7/7 at level 17 (pool 21) leaves no point for a talent
  l = IT.Loadout.normalize({ heroLevel: 17, orbs: { quas: 7, wex: 7, exort: 7 }, talents: [t1.left, t2.left] });
  assert.strictEqual(J(l.talents), '[]'); assert.ok(R.validate(l).ok);
  // an over-spent request is trimmed to a legal one at every level
  for (let L = 1; L <= 30; L++) {
    l = IT.Loadout.normalize({ heroLevel: L, orbs: { quas: 9, wex: 9, exort: 9 }, talents: ALL8.slice() });
    assert.ok(R.validate(l).ok, 'L' + L + ' ' + R.validate(l).errors.join(';'));
    assert.ok(R.pointsLeft(l) >= 0, 'L' + L);
  }
  assert.strictEqual(IT.Loadout.normalize({ heroLevel: 30 }).talents.length, 8);                     // no list: all 8
  assert.strictEqual(IT.Loadout.normalize({ heroLevel: 30, talents: [t1.left] }).talents.length, 1);  // explicit list: respected
  assert.strictEqual(IT.Loadout.normalize({ heroLevel: 29 }).talents.length, 0);
});

test('loadout UI trim keeps the pool balanced when the level drops', () => {
  // js/ui/loadout.js needs a DOM; evaluate only its trim() through a minimal stub
  const vm = require('vm');
  const src = fs.readFileSync(path.join(ROOT, 'js/ui/loadout.js'), 'utf8');
  const ctx = vm.createContext({ IT: IT, console, Math, JSON, Object, Array, Number, String, Set, Map, Infinity });
  ctx.window = ctx; ctx.globalThis = ctx;
  ctx.IT.UI = {}; ctx.IT.lang = 'en'; ctx.localStorage = { getItem() { return null; }, setItem() {} };
  ctx.IT.EnemyCard = { normalize: () => ({ count: 0, items: [], list: [] }) };
  ctx.IT.DIFFICULTY = { order: ['common'], migrate: d => d };
  ctx.IT.Maps = { ids: () => ['grounds'] };
  vm.runInContext(src, ctx);
  const trim = ctx.IT.UI.LoadoutScreen.trim;
  const full = () => ({ heroLevel: 30, orbs: { quas: 7, wex: 7, exort: 7 }, talents: ALL8.slice() });
  for (let L = 29; L >= 1; L--) {
    const lo = full(); lo.heroLevel = L;
    trim(lo);
    assert.ok(R.pointsLeft(lo) >= 0, 'L' + L + ' left ' + R.pointsLeft(lo));
    assert.ok(R.validate(lo).ok, 'L' + L + ' ' + R.validate(lo).errors.join(';'));
    assert.ok(lo.talents.length <= R.talentPointsAt(L), 'L' + L);
  }
  const lo = full(); lo.heroLevel = 29; trim(lo);
  assert.strictEqual(lo.talents.length, 7); assert.strictEqual(R.pointsLeft(lo), 0);   // lvl 29 pool 28 = 21 orbs + 7 talents
});

test('i18n: the point / talent UI strings exist in en and pt with the same placeholders', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/ui/loadout.js'), 'utf8');
  const keys = new Set([...src.matchAll(/\bt\('((?:lo\.(?:available|spent|left|talent\w*|fix|auto|level)|tip\.(?:noPoints|gate|talent\w*|maxOrb|minOrb|auto\w+))[\w.]*)'/g)].map(m => m[1]));
  ['lo.available', 'lo.spent', 'lo.left', 'lo.talentPts', 'tip.noPoints'].forEach(k => keys.add(k));
  assert.ok(keys.size >= 8, 'scanned ' + keys.size);
  const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join();
  for (const k of keys) {
    IT.lang = 'en'; assert.ok(IT.hasT(k) && IT.t(k) !== k, 'en ' + k);
    const en = IT.t(k);
    IT.lang = 'pt'; assert.ok(IT.hasT(k) && IT.t(k) !== k, 'pt ' + k);
    assert.strictEqual(ph(IT.t(k)), ph(en), 'placeholders ' + k);
  }
  IT.lang = 'en';
});
