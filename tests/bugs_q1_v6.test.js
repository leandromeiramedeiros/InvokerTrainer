'use strict';
// CEO v6 queue bugs #51 (enemy Blink Dagger lockout after damage), #46 (enemy move speed >= hero base + item bonuses),
// #57 (multi-kill relics scoped per cast + per round), #56 (relics only in Ranked / Infinite).
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const load = require('./_load.js');
const src = fs.readFileSync(path.join(__dirname, 'levels_v6.test.js'), 'utf8');
const FILES0 = new Function('return ' + /const FILES = (\[[\s\S]*?\]);/.exec(src)[1])().concat(['js/data/relics.js', 'js/sim/stats.js']);
const IT = load(FILES0.filter((f, i) => FILES0.indexOf(f) === i));
const R = IT.Ranked, DF = IT.DIFFICULTY, SC = IT.StatsCollector;
const harness = src.slice(src.indexOf('let build = function'), src.indexOf('const SEEDS'));
const H = new Function('IT', 'R', 'process', harness + '\nreturn { build, botRun, early };')(IT, R, process);
const map = IT.Map.build(IT.MAPDEF);
const iv = (id, k) => IT.Values.item(IT.GAME.ITEM_DOTA[id], k);

function mk(mode, nFoes, items) {
  const lo = IT.Loadout.normalize(IT.Loadout.default());
  const w = IT.World.create({ seed: 4, map, loadout: lo, fog: false, autoAttack: false });
  const h = IT.Hero.create(w, lo, map.spawns.hero.x, map.spawns.hero.y);
  const foes = [];
  for (let i = 0; i < (nFoes || 0); i++) foes.push(IT.Units.spawnEnemy(w, { x: h.x + 500, y: h.y + i * 60, hp: 500, attack: false, items, telegraph: 0 }));
  if (mode) w.ranked = { mode };
  return { w, h, foes, S: SC.create(w) };
}
const dmg = (w, src, t, ability, amount, type) => IT.Combat.damage(w, { src: src.id, target: t, amount, type: type || 'pure', ability });

// ---------------------------------------------------------------- #51
test('#51: enemy Blink Dagger is locked for blink_damage_cooldown (3 s) after damage; Force Staff still works', () => {
  const { w, h, foes } = mk(null, 1, ['blink', 'forcestaff']);
  const e = foes[0], cd = iv('blink', 'blink_damage_cooldown');
  w.step();   // the items system installs its damage hook on the first tick
  assert.equal(cd, 3);
  const to = { x: e.x + 500, y: e.y };
  dmg(w, h, e, 'coldsnap', 20, 'magical');
  assert.equal(IT.Abilities.check(w, e, 'blink'), 'blinkDamaged');
  assert.equal(IT.Units.useItem(w, e, 'blink', to), false, 'no blink right after damage');
  assert.equal(IT.Units.useItem(w, e, 'forcestaff', { face: 0 }), true, 'Force Staff is not locked');
  for (let i = 0; i < 30 * 2.9; i++) w.step();
  assert.equal(IT.Abilities.check(w, e, 'blink'), 'blinkDamaged');
  for (let i = 0; i < 10; i++) w.step();
  assert.equal(IT.Abilities.check(w, e, 'blink'), null);
  assert.equal(IT.Units.useItem(w, e, 'blink', to), true, 'blink after the lockout');
});

test('#51: a scripted (dummy-escape) blink waits out the lockout too', () => {
  const lo = IT.Loadout.normalize(IT.Loadout.default());
  const w = IT.World.create({ seed: 4, map, loadout: lo, fog: false, autoAttack: false });
  const h = IT.Hero.create(w, lo, map.spawns.hero.x, map.spawns.hero.y);
  const d = IT.Units.spawnEnemy(w, { x: h.x + 500, y: h.y, hp: 5000, attack: false, scenario: { dummyEscape: 'blink_on_first_hit' }, behavior: 'stationary' });
  w.step();
  dmg(w, h, d, 'coldsnap', 10, 'magical');   // first hit: wants to blink, but the hit locked the Dagger
  const blinks = () => w.log.filter(e => e.type === 'blink' && e.unit === d.id);
  for (let i = 0; i < 30 * 2.5; i++) w.step();
  assert.equal(blinks().length, 0, 'no blink inside the 3 s lockout');
  for (let i = 0; i < 30 * 2; i++) w.step();
  assert.equal(blinks().length, 1, 'blinks once the lockout is over');
});

// ---------------------------------------------------------------- #46
test('#46: enemy ms = rolled hero base (285..320 +- jitter) + boots / travels / Euls bonus, never below base, stable under the stats system', () => {
  const E = IT.GAME.ENEMY, lo = E.msBase[0], hi = E.msBase[1] + E.msJitter;
  const { w, h } = mk(null, 0);
  const bonus = { boots: iv('boots', 'bonus_movement_speed'), travels: iv('travels', 'bonus_movement_speed'), euls: iv('euls', 'bonus_movement_speed') };
  assert.equal(bonus.boots, 45); assert.equal(bonus.travels, 90); assert.ok(bonus.euls > 0, 'Euls KV bonus_movement_speed ' + bonus.euls);
  const skins = IT.GAME.SKINS.slice();
  for (const items of [[], ['boots'], ['travels'], ['euls'], ['travels', 'euls']]) for (let k = 0; k < skins.length; k++) {
    const e = IT.Units.spawnEnemy(w, { x: h.x + 600 + k * 40, y: h.y, skin: skins[k], hp: 500, attack: false, items });
    assert.ok(e.msBase >= lo && e.msBase <= hi, 'base ' + e.msBase);
    const want = e.msBase + (items.includes('travels') ? bonus.travels : items.includes('boots') ? bonus.boots : 0) + (items.includes('euls') ? bonus.euls : 0);
    assert.equal(e.ms, want, items + ' ' + skins[k]);
    for (let i = 0; i < 5; i++) w.step();   // the stats system recomputes e.ms from base.ms
    assert.equal(e.ms, want, 'after the stats tick ' + items);
    assert.ok(e.ms >= e.msBase, 'never below base');
  }
  const same = IT.Units.spawnEnemy(w, { x: h.x + 100, y: h.y + 300, skin: skins[0], hp: 500, attack: false });
  assert.equal(same.msBase, IT.Units.rollMs({ skin: skins[0], x: h.x + 100, y: h.y + 300 }, E), 'deterministic (no rng draw)');
});

test('#46: every scenario foe at every tier keeps ms >= its hero base (a Boots of Travel chaser = base + 90, no tier slowdown)', () => {
  const all = [];
  for (const sc of IT.SCENARIOS) for (const df of ['easy', 'common', 'ian']) {
    const m = H.build(sc.id, df, 2);
    m.run.dummies.forEach(d => {
      if (!d || d.kind !== 'enemy') return;
      assert.ok(d.msBase >= 285, sc.id + ' base ' + d.msBase);
      assert.ok(d.ms >= d.msBase, sc.id + ' ' + df + ' ms ' + d.ms + ' < base ' + d.msBase);
      all.push(d.ms);
    });
  }
  assert.ok(all.length > 50 && Math.min(...all) >= 285, 'min ' + Math.min(...all));
  const m = H.build('dust_escape', 'easy', 2), d = m.run.dummies[0], bt = m.pr.vary.boots[0];
  assert.ok(bt, 'booted chaser');
  assert.equal(d.ms, Math.max(d.msBase, 380 * DF.get('easy').chase) + IT.Units.bootBonus([bt]));
  assert.ok(d.ms >= d.msBase + IT.Units.bootBonus([bt]));
});

// ---------------------------------------------------------------- #57
test('#57: two rounds with 2 hits each never make a 3-hero relic tick (hit sets are per cast and per round)', () => {
  const { w, h, foes, S } = mk('ranked', 5);
  for (const ab of ['emp', 'deafeningblast']) {
    w.emit('cast', { unit: h.id, ability: ab });
    for (const f of foes.slice(0, 2)) w.emit('hit', { src: h.id, target: f.id, ability: ab });
    w.emit('scnStart', { id: 'x', n: 2 });   // next round, still inside the old window
    w.t += 0.5;
    w.emit('cast', { unit: h.id, ability: ab });
    for (const f of foes.slice(2, 4)) w.emit('hit', { src: h.id, target: f.id, ability: ab });
    w.emit('scnStart', { id: 'x', n: 3 });   // late hits with no live cast of this round never count
    w.emit('hit', { src: h.id, target: foes[4].id, ability: ab });
  }
  for (const ab of ['icewall', 'chaosmeteor']) {   // 2-hero relics: 1 hit per round x 2 rounds
    w.emit('cast', { unit: h.id, ability: ab });
    w.emit('hit', { src: h.id, target: foes[0].id, ability: ab });
    w.emit('scnStart', { id: 'x', n: 4 });
    w.emit('cast', { unit: h.id, ability: ab });
    w.emit('hit', { src: h.id, target: foes[1].id, ability: ab });
  }
  const r = S.summary().relics;
  for (const k of ['three_emp', 'three_deafening', 'multi_icewall', 'multi_meteor']) assert.equal(r[k], undefined, k + ' ticked across rounds');
  // control: a real 3-hero cast inside one round still counts
  w.emit('scnStart', { id: 'x', n: 5 });
  w.emit('cast', { unit: h.id, ability: 'emp' });
  for (const f of foes.slice(0, 3)) w.emit('hit', { src: h.id, target: f.id, ability: 'emp' });
  assert.equal(S.summary().relics.three_emp, 1);
});

test('#57: the kill chain (Triple Kill / Rampage) resets each round', () => {
  const { w, h, foes, S } = mk('ranked', 3);
  dmg(w, h, foes[0], 'attack', 1e5, 'physical'); dmg(w, h, foes[1], 'attack', 1e5, 'physical');
  w.emit('scnStart', { id: 'x', n: 2 });
  w.t += 1;
  dmg(w, h, foes[2], 'attack', 1e5, 'physical');
  assert.equal(S.summary().relics.kills, 3);
  assert.equal(S.summary().relics.triple_kills, undefined, '2 + 1 kills across rounds is not a Triple Kill');
  const b = mk('ranked', 3);   // the same three inside one round
  for (const f of b.foes) dmg(b.w, b.h, f, 'attack', 1e5, 'physical');
  assert.equal(b.S.summary().relics.triple_kills, 1);
});

// ---------------------------------------------------------------- #56
test('#56: relic progress, points and the tier toast only in Ranked / Infinite (not Free Play, practice, sandbox)', () => {
  for (const [mode, on] of [['ranked', true], ['infinite', true], ['sandbox', false], ['practice', false], [null, false]]) {
    const fired = [], prev = SC.hooks;
    SC.hooks = { base: () => ({ kills: 74 }), tier: e => fired.push(e) };
    try {
      const { w, h, foes, S } = mk(mode, 2);
      dmg(w, h, foes[0], 'attack', 1e5, 'physical'); dmg(w, h, foes[1], 'attack', 1e5, 'physical');
      const r = S.summary();
      assert.equal(!!r.relics.kills, on, String(mode) + ' relics ' + JSON.stringify(r.relics));
      assert.equal(r.points > 0, on, String(mode) + ' points ' + r.points);
      assert.equal(fired.length > 0, on, String(mode) + ' toast hook');
    } finally { SC.hooks = prev; }
  }
});

test('#56: a real Ranked.create run books relics only in ranked / infinite (sandbox scenario practice books none)', () => {
  for (const [mode, on] of [['sandbox', false], ['ranked', true], ['infinite', true]]) {
    const run = R.create({ mode, diff: 'easy', scenario: mode === 'sandbox' ? 'cold_start' : undefined, seed: 3 });
    assert.equal(run.mode, mode);
    const lo = IT.Loadout.normalize(IT.Loadout.default());
    const w = IT.World.create({ seed: 3, map, loadout: lo, fog: false, autoAttack: false });
    IT.Hero.create(w, lo, map.spawns.hero.x, map.spawns.hero.y);
    const S = SC.create(w); run.attach(w);
    const e = IT.Units.spawnEnemy(w, { x: w.hero.x + 300, y: w.hero.y, hp: 100, attack: false });
    dmg(w, w.hero, e, 'attack', 1e5, 'physical');
    assert.equal(!!S.summary().relics.kills, on, mode);
  }
});
