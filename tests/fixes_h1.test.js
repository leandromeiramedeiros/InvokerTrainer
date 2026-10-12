'use strict';
// Batch H1 (final audit): kill_with auto-attack steals, hero death in every tier, hero BKB spell_reduce, i_bolt_cancel reachability.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const FILES = ['js/data/i18n.js', 'js/data/i18n/s3.js', 'js/data/i18n/f1.js', 'js/data/i18n/scn.js',
  'js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/dotaworld.js', 'js/data/maps.js', 'js/data/difficulty.js',
  'js/data/combos.js', 'js/data/scenarios.js', 'js/data/ranks.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/combo.js', 'js/sim/stats.js', 'js/sim/towers.js', 'js/sim/ranked.js', 'js/ui/hudsteps.js'];
const IT = load(FILES);
const R = IT.Ranked, SC = IT.SCENARIOS;
const KW = 'river_rune';   // kill_with chaosmeteor, fail ['method','time']

function build(id, diff, seed) {
  const run = R.create({ mode: 'practice', diff: diff || 'easy', scenario: id, seed: seed || 5 });
  const pr = run.next(), m0 = IT.Maps.get('grounds');
  const w = IT.World.create({ seed: seed || 5, map: m0, loadout: pr.lo, fog: pr.fog });
  const h = IT.Hero.create(w, pr.lo, m0.spawns.hero.x, m0.spawns.hero.y);
  run.attach(w);
  for (let i = 0; i < 600 && run.frozen(); i++) run.tick(1 / 30);
  return { run, w, h, pr };
}
const step = (w, n) => { for (let i = 0; i < n; i++) w.step(); };
const hit = (w, src, foe, ability, amount) => IT.Combat.damage(w, { src: src.id, target: foe, ability, type: ability ? 'magical' : 'physical', amount: amount || 1 });

// ---------------------------------------------------------------- BAD-1
test('BAD-1: a basic attack that finishes a foe an ability hit <= 0.5 s earlier credits that ability', () => {
  const { run, w, h } = build(KW);
  assert.equal(run.phase, 'play');
  const d = run.dummies[0];
  hit(w, h, d, 'chaosmeteor', 5);
  step(w, 3);
  hit(w, h, d, null, 1e6);   // the auto-attack lands the last point
  step(w, 2);
  assert.equal(run.result && run.result.ok, true, JSON.stringify(run.result));
});

test('BAD-1: an old ability hit (> 0.5 s) does not excuse the auto-attack kill; the fail says auto-attack', () => {
  const { run, w, h } = build(KW);
  const d = run.dummies[0], seen = [];
  w.on('scnResult', p => seen.push(p));
  hit(w, h, d, 'chaosmeteor', 5);
  step(w, 30);   // 1 s
  hit(w, h, d, null, 1e6);
  step(w, 2);
  assert.equal(run.result.ok, false);
  assert.equal(run.result.reason, 'method');
  assert.equal(run.result.detail, 'attack');
  assert.equal(seen[0].detail, 'attack');
  for (const lang of ['en', 'pt']) {
    IT.lang = lang;
    assert.ok(IT.hasT('scn.fail.method.attack') && IT.t('scn.fail.method.attack') !== 'scn.fail.method.attack', lang);
    assert.notEqual(IT.t('scn.fail.method.attack'), IT.t('scn.fail.method'), lang);
  }
  IT.lang = 'en';
});

test('BAD-1: an auto-attack kill with no ability involved still fails; a wrong ability fails without the attack detail', () => {
  const a = build(KW);
  hit(a.w, a.h, a.run.dummies[0], null, 1e6); step(a.w, 2);
  assert.equal(a.run.result.reason, 'method'); assert.equal(a.run.result.detail, 'attack');
  const b = build(KW);
  hit(b.w, b.h, b.run.dummies[0], 'sunstrike', 1e6); step(b.w, 2);   // wrong spell
  assert.equal(b.run.result.reason, 'method'); assert.equal(b.run.result.detail, null);
});

test('BAD-1: the hero does not auto-acquire during a kill_with scenario, but an explicit attack order works', () => {
  const { run, w, h } = build(KW);
  assert.equal(run.pr.sc.obj.type, 'kill_with');
  assert.equal(h.autoAttack, false);
  const d = run.dummies[0];
  // put the foe next to the hero (inside acquisition range): no attack starts by itself
  d.x = h.x + 200; d.y = h.y; d.statuses.length = 0;
  const dmg = [];
  w.on('damage', p => { if (p.src === h.id && p.target === d.id) dmg.push(p); });
  step(w, 90);
  assert.equal(dmg.length, 0, 'no auto-attack');
  assert.equal(h.attack.target == null, true);
  IT.Orders.issue(w, h, { type: 'attack', target: d.id });
  step(w, 90);
  assert.ok(dmg.length >= 1, 'explicit attack order works');
});

test('BAD-1: other objectives keep the hero auto-attack', () => {
  const sc = SC.find(s => s.obj.type === 'kill');
  const { h } = build(sc.id);
  assert.notEqual(h.autoAttack, false);
});

// ---------------------------------------------------------------- BAD-4
test('BAD-4: the hero falling ends every scenario as "died" at every tier (implicit fail, listed or not)', () => {
  const unlisted = SC.filter(s => (s.fail || []).indexOf('died') < 0);
  assert.ok(unlisted.length > 20, 'most scenarios do not list died');
  for (const diff of ['ian', 'common', 'hard', 'bambam']) {
    for (const sc of unlisted.slice(0, 8)) {
      const { run, w, h } = build(sc.id, diff);
      assert.equal(run.phase, 'play', sc.id);
      IT.Combat.damage(w, { src: run.dummies[0].id, target: h, ability: 'attack', type: 'pure', amount: h.maxHp * 5 });
      step(w, 2);
      assert.equal(run.result && run.result.reason, 'died', sc.id + ' @' + diff);
    }
  }
});

test('BAD-4: the world still refills the hero (Free Play / sim keeps running)', () => {
  const lo = IT.Loadout.normalize(IT.Loadout.default());
  const w = IT.World.create({ seed: 3, map: IT.Maps.get('grounds'), loadout: lo, fog: false });
  const h = IT.Hero.create(w, lo, 0, 0);
  IT.Combat.damage(w, { src: 0, target: h, type: 'pure', amount: h.maxHp * 2 });
  assert.equal(h.hp, h.maxHp);
});

// ---------------------------------------------------------------- BAD-6
test('BAD-6: hero BKB = debuff immunity + spell_reduce magic damage cut (not full immunity)', () => {
  const lo = IT.Loadout.normalize(Object.assign({}, IT.Loadout.default(), { items: ['bkb'] }));
  const w = IT.World.create({ seed: 5, map: IT.Maps.get('grounds'), loadout: lo, fog: false, autoAttack: false });
  const h = IT.Hero.create(w, lo, 0, 0);
  const foe = IT.Units.spawnDummy(w, { x: 500, y: 0, preset: 'training', skin: 'pedro' });
  assert.ok(IT.Orders.issue(w, h, { type: 'cast', ability: 'bkb' }));
  step(w, 3);
  const mi = IT.Status.find(h, 'magicImmune');
  assert.ok(mi, 'magic immune');
  const red = IT.Values.item(IT.GAME.ITEM_DOTA.bkb, 'spell_reduce') / 100;
  assert.ok(red > 0.4 && red < 0.8, 'KV spell_reduce ' + red);
  assert.equal(mi.data.reduce, red);
  h.hp = h.maxHp;
  const dealt = IT.Combat.damage(w, { src: foe.id, target: h, ability: 'sunstrike', type: 'magical', amount: 1000 });
  assert.ok(dealt > 0, 'magic damage gets through');
  assert.ok(Math.abs(dealt - 1000 * (1 - red) * (1 - h.magicRes)) < 1e-6, 'reduced by spell_reduce and magic resistance: ' + dealt);
  assert.equal(IT.Combat.damage(w, { src: foe.id, target: h, ability: 'x', type: 'pure', amount: 10 }), 10, 'pure is untouched');
  assert.equal(IT.Status.add(w, h, 'stun', 2, { src: foe.id, ability: 'x' }), null, 'debuffs are still blocked');
});

// ---------------------------------------------------------------- BAD-9
test('BAD-9: i_bolt_cancel starts with a position step so the bolt can start', () => {
  const c = IT.COMBOS.find(x => x.id === 'i_bolt_cancel');
  assert.equal(c.steps[0].type, 'position');
  assert.ok(c.steps[0].maxDist <= IT.GAME.DUMMY.bolt.range, 'inside the bolt range');
  assert.equal(c.steps[1].ability, 'coldsnap');
  assert.equal(c.steps[2].react, 'boltCancel');
  assert.ok(c.scenario.stunBolt);
});

test('BAD-9: realistic run - from 1000 units the bolt does not start; walking in starts it and Cold Snap cancels it', () => {
  const map = IT.Map.build(IT.MAPDEF);
  const lo = IT.Loadout.normalize(Object.assign({}, IT.Loadout.default()));
  const w = IT.World.create({ seed: 3, map, loadout: lo, fog: false, autoAttack: false });
  const sp = map.spawns.hero, h = IT.Hero.create(w, lo, sp.x, sp.y);
  assert.ok(IT.Combo.start(w, 'i_bolt_cancel', { grantMissing: true }));
  const d = w.query(e => e.kind === 'dummy')[0];
  const logOf = t => w.log.filter(e => e.type === t);
  const put = r => {   // a walkable spot r units from the dummy
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2, x = d.x + Math.cos(a) * r, y = d.y + Math.sin(a) * r;
      if (!map.walkable(x, y)) continue;
      h.x = x; h.y = y;
      if (r > 700 || IT.Vision.canSee(w, d, h)) return;   // close spots need line of sight, as the bolt does
    }
    assert.fail('no spot with line of sight');
  };
  put(1000); step(w, 60);
  assert.equal(w.combo.stepIndex, 0, 'still waiting for the position step');
  assert.equal(logOf('bolt').filter(e => e.phase === 'start').length, 0, 'no bolt from 1000 units');
  put(600);
  for (let i = 0; i < 60 && !logOf('bolt').some(e => e.phase === 'start'); i++) w.step();
  assert.ok(logOf('bolt').some(e => e.phase === 'start'), 'bolt starts once inside 650');
  assert.equal(w.combo.stepIndex, 1);
  for (const ch of IT.GAME.SPELL_ORBS.coldsnap) IT.Invoke.orb(w, h, ch);
  IT.Invoke.invoke(w, h);
  IT.Orders.issue(w, h, { type: 'cast', ability: 'coldsnap', target: d.id, x: d.x, y: d.y });
  for (let i = 0; i < 90 && w.combo.phase === 'active'; i++) w.step();
  assert.equal(logOf('comboFail').length, 0, JSON.stringify(logOf('comboFail')));
  assert.equal(logOf('comboDone').length, 1);
});
