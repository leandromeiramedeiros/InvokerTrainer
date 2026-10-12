'use strict';
// v5 scenario enemies: real enemy NPCs (distinct skins, hp = damage-to-kill, real death), difficulty numbers reaching them, hero auto-attack.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/difficulty.js', 'js/data/scenarios.js', 'js/data/ranks.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/stats.js', 'js/sim/ranked.js'];
const IT = load(FILES);
const map = IT.Map.build(IT.MAPDEF);
const DF = IT.DIFFICULTY, E = IT.GAME.ENEMY, AT = IT.GAME.ENEMY_ATTACK;

// four foes (more than the three skins), one fleeing, for the skin/name rotation
IT.SCENARIOS.push({
  id: 'zz_many', tier: 1, name: { en: 'x', pt: 'x' }, tip: { en: 'x', pt: 'x' }, goal: { en: 'x', pt: 'x' }, par: 10, hero: { lvl: 25 },
  dummies: [{ dx: 500, dy: 0, hp: 0.5 }, { dx: 500, dy: 200, hp: 0.5 }, { dx: 500, dy: -200, hp: 0.5 }, { dx: 700, dy: 0, hp: 0.5, mot: 'flee' }],
  obj: { type: 'kill' }, sol: [{ a: 'attack', at: 'd0' }],
});

function mk(id, diff, skin) {
  const run = IT.Ranked.create({ mode: 'practice', diff, scenario: id, seed: 5, skin });
  run.varRng = null;   // item 40: exact-value tests run un-varied (variation_v6.test.js covers the variation)
  const pr = run.next(), sp = map.spawns.hero;
  const w = IT.World.create({ seed: 5, map, loadout: pr.lo, fog: pr.fog, autoAttack: false });
  const h = IT.Hero.create(w, pr.lo, sp.x, sp.y);
  run.attach(w);
  return { run, w, h, pr };
}
const thaw = run => { for (let i = 0; i < 400 && run.frozen(); i++) run.tick(1 / 30); };

// plain world with the hero for hand-placed enemies
function bare() {
  const lo = IT.Loadout.normalize(Object.assign({}, IT.Loadout.default(), { items: [] }));
  const w = IT.World.create({ seed: 5, map, loadout: lo, fog: false, autoAttack: false });
  const sp = map.spawns.hero;
  const h = IT.Hero.create(w, lo, sp.x, sp.y);
  const foe = (dx, dy, o) => IT.Units.spawnEnemy(w, Object.assign({ x: h.x + dx, y: h.y + dy, skin: 'pedro', awareness: 1, reaction: 0.3 }, o || {}));
  const run = n => { for (let i = 0; i < n; i++) w.step(); };
  const evs = (type, f) => w.log.filter(e => e.type === type && (!f || f(e)));
  return { w, h, foe, run, evs };
}

test('scenario foes are real enemies: kind enemy, name/hp bar, distinct skins + names, rotated from the chosen skin', () => {
  const m = mk('zz_many', 'common', 'renan');
  assert.equal(m.run.dummies.length, 4);
  for (const e of m.run.dummies) { assert.equal(e.kind, 'enemy'); assert.ok(!e.scarecrow && !e.noHpBar); assert.ok(e.ai && e.attack); }
  const sk = m.run.dummies.map(e => e.skin);
  assert.deepEqual(sk, ['renan', 'vitinho', 'pedro', 'renan']);                       // starts at the chosen skin, then rotates
  assert.deepEqual(m.run.dummies.map(e => e.name), ['Renan', 'Vitinho', 'Pedro', 'Renan 2']);
  assert.equal(new Set(sk.slice(0, 3)).size, 3);
  const g = mk('gleipnir_cluster', 'common', 'pedro');
  assert.equal(new Set(g.run.dummies.map(e => e.skin)).size, 3);
});

test('foe hp = the scenario damage-to-kill x tier hpMul (every value, also > 1); it empties exactly on the kill and the foe really dies', () => {
  for (const df of DF.order) {
    const m = mk('sun_snipe', df);                         // v6: hp = HP_SHARE x the steps' KV damage (Ranked.foeHp) x hpMul
    const e = m.run.dummies[0], want = IT.Ranked.foeHp(m.run.pr.sc, DF.get(df), m.run.pr.lo)[0];
    for (const a of m.run.pr.need) m.run.st.used.add(a);   // the steps landed (a kill only counts once they all hit)
    assert.equal(e.maxHp, want, df); assert.equal(e.hp, want, df);
    assert.equal(e.hpRegen, 0);
    thaw(m.run);
    IT.Combat.damage(m.w, { src: m.h, target: e, type: 'pure', amount: want - 1 });
    assert.equal(e.hp, 1); assert.ok(!e.dead, df + ' still alive at 1 hp');
    for (let i = 0; i < 5; i++) m.w.step();
    assert.equal(m.run.phase, 'play');
    IT.Combat.damage(m.w, { src: m.h, target: e, type: 'pure', amount: 1 });
    assert.equal(e.hp, 0); assert.ok(e.dead && e.killed);
    assert.equal(m.w.log.filter(x => x.type === 'kill' && x.unit === e.id).length, 1);
    assert.equal(m.w.log.filter(x => x.type === 'refill').length, 0);
    m.w.step();
    assert.equal(m.run.phase, 'result'); assert.ok(m.run.result.ok, df);
  }
  assert.ok(DF.get('ian').hpMul < 1 && DF.get('bambam').hpMul > 1);
});

test('difficulty fields reach the scenario enemies: armor, telegraph, awareness, reaction, bkb, attack damage, fights', () => {
  const seen = {};
  for (const df of DF.order) {
    const d = DF.get(df), m = mk('atos_vyse_lock', df), e = m.run.dummies[0];
    assert.equal(e.armor, E.armor + d.armorAdd, df);
    assert.equal(e.telegraph, d.telegraph, df);
    assert.equal(e.awareness, d.awareness, df);
    assert.equal(e.reaction, d.reaction, df);
    assert.equal(e.fights, !!d.fights, df);
    assert.equal(!!(e.items && e.items.some(s => s && s.id === 'bkb')), !!d.useBkb, df);
    assert.equal(e.scenario.stunBolt, d.stunBolt, df);
    const k = IT.GAME.ENEMY_ATTACK_KIND[e.skin];
    assert.equal(e.attack.min, Math.round(AT[k].min * d.dmgMul), df);
    assert.equal(e.attack.max, Math.round(AT[k].max * d.dmgMul), df);
    seen[df] = e;
  }
  assert.ok(seen.bambam.armor > seen.common.armor && seen.common.armor > seen.ian.armor);
  assert.ok(seen.ian.telegraph > seen.hard.telegraph && seen.hard.telegraph > seen.bambam.telegraph);
  assert.ok(seen.ian.reaction > seen.bambam.reaction && seen.ian.awareness < seen.bambam.awareness);
  assert.ok(seen.ian.attack.min < seen.common.attack.min && seen.common.attack.min < seen.bambam.attack.min);
  // the tier armor really cuts the hero's physical damage
  const hit = e => IT.Combat.damage(mk('sun_snipe', 'common').w, { src: 0, target: e, type: 'physical', amount: 100 });
  assert.ok(hit(seen.ian) > hit(seen.bambam));
});

test('enemy hero auto-attack: ranged / melee profiles from the skin, hits the hero at the BAT cadence', () => {
  const { w, h, foe, run, evs } = bare();
  const e = foe(450, 0, { behavior: 'defend', hp: 9999 });
  assert.equal(e.atkKind, 'ranged');
  assert.deepEqual([e.attack.range, e.attack.bat, e.attack.min, e.attack.max], [600, 1.7, 46, 54]);
  const m = foe(0, 200, { skin: 'renan', hp: 9999, behavior: 'stationary' });
  assert.deepEqual([m.atkKind, m.attack.range, m.attack.min], ['melee', 150, 50]);
  h.hp = h.maxHp = 50000;
  run(30 * 10);
  const starts = evs('attackStart', x => x.src === e.id), hits = evs('attackHit', x => x.src === e.id && x.target === h.id);
  assert.ok(starts.length >= 5 && starts.length <= 7, 'attack starts ' + starts.length);
  for (let i = 1; i < starts.length; i++) assert.ok(Math.abs(starts[i].t - starts[i - 1].t - 1.7) < 0.05, 'BAT 1.7');
  assert.ok(hits.length >= 5 && hits.length <= 7);
  const dmg = evs('damage', x => x.src === e.id && x.target === h.id);
  assert.equal(dmg.length, hits.length);
  for (const d of dmg) {
    assert.equal(d.dmgType, 'physical'); assert.ok(d.raw >= 46 && d.raw <= 54);
    assert.ok(Math.abs(d.dealt - d.raw * IT.Combat.armorMult(h.armor)) < 1e-6);
  }
  assert.ok(dmg.reduce((a, d) => a + d.dealt, 0) > 100 && h.hp < h.maxHp && !h.dead);
  assert.equal(evs('attackStart', x => x.src === m.id).length, 0, 'a plain stationary foe never attacks');
});

test('who fights back: defend always, hard+ foes when aware, others only when cornered; out of reach / unseen = no attack', () => {
  const { w, h, foe, run, evs } = bare();
  h.hp = h.maxHp = 50000;
  const on = e => evs('attackStart', x => x.src === e.id).length;
  const calm = foe(400, 0, { hp: 9999 });                              // stationary, not hard+: stays peaceful
  const hard = foe(0, -400, { hp: 9999, fights: true });
  const far = foe(-1500, 0, { hp: 9999, behavior: 'defend' });         // far beyond 600 + leash (and its 800 vision)
  const rooted = foe(0, 400, { hp: 9999, behavior: 'escape', skin: 'vitinho' });
  IT.Status.add(w, rooted, 'root', 6, { src: h.id });                  // cannot flee -> cornered -> fights back
  run(30 * 6);
  assert.equal(on(calm), 0);
  assert.ok(on(hard) >= 2);
  assert.equal(on(far), 0);
  assert.ok(on(rooted) >= 2, 'cornered escape-type foe attacks');
  // melee guard steps in within its leash, then walks home when the hero leaves
  const g = foe(300, 0, { skin: 'renan', behavior: 'defend', hp: 9999 });
  const home = { x: g.x, y: g.y };
  run(30 * 4);
  assert.ok(on(g) >= 1 && Math.hypot(g.x - home.x, g.y - home.y) > 20, 'melee guard closed in');
  h.x -= 3000; h.y -= 0;
  run(30 * 12);
  assert.ok(Math.hypot(g.x - home.x, g.y - home.y) < 60, 'guard went home');
});

test('a disabled foe does not attack; a lifted / invisible hero is not attacked', () => {
  const { w, h, foe, run, evs } = bare();
  h.hp = h.maxHp = 50000;
  const e = foe(400, 0, { behavior: 'defend', hp: 9999 });
  IT.Status.add(w, e, 'stun', 4, { src: h.id });
  run(30 * 3);
  assert.equal(evs('attackStart', x => x.src === e.id).length, 0);
  run(30 * 3);                                                         // stun over: it attacks
  assert.ok(evs('attackStart', x => x.src === e.id).length >= 1);
  const n = evs('attackStart', x => x.src === e.id).length;
  IT.Status.add(w, h, 'lift', 4, { src: e.id });
  run(30 * 3);
  assert.equal(evs('attackStart', x => x.src === e.id).length, n, 'lifted hero (tornado) is not attacked');
});

test('the hero can fall in a scenario: scenario fails with reason died', () => {
  const m = mk('sun_snipe', 'bambam');
  thaw(m.run);
  IT.Combat.damage(m.w, { src: m.run.dummies[0], target: m.h, type: 'pure', amount: m.h.maxHp + 10 });
  m.w.step();
  assert.equal(m.run.phase, 'result');
  assert.equal(m.run.result.ok, false); assert.equal(m.run.result.reason, 'died');
  assert.ok(IT.Ranked && true);
});

test('scarecrow dummies unchanged: no attack, no hp bar, never die, refill', () => {
  const { w, h, run, evs } = bare();
  const d = IT.Units.spawnDummy(w, { x: h.x + 300, y: h.y, preset: 'training', skin: 'pedro' });
  assert.equal(d.kind, 'dummy'); assert.equal(d.attack, null); assert.equal(d.noHpBar, true); assert.equal(d.scarecrow, true);
  IT.Combat.damage(w, { src: h, target: d, type: 'pure', amount: d.maxHp * 0.8 });
  assert.equal(d.hp, d.maxHp); assert.equal(evs('refill').length, 1);
  IT.Combat.damage(w, { src: h, target: d, type: 'pure', amount: d.maxHp * 9 });
  assert.ok(!d.dead && d.hp > 0 && evs('kill').length === 0);
  const hp0 = h.hp; run(30 * 5);
  assert.equal(h.hp, hp0);
});
