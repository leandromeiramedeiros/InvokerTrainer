'use strict';
// v6 #30 open items (docs/GAMEPLAY-REVIEW-v6.md): I8 hpMul on kill foes, I11 dodged skillshot hint, I14 Deafening Blast push distance, I15 Cataclysm heroes only.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { IT, build, prep } = require('./_edgebot.js');
const R = IT.Ranked, DF = IT.DIFFICULTY;
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('I8: kill-foe hp ignores hpMul > 1 (capped at HP_CAP) and the difficulty header says so', () => {
  const sc = IT.SCENARIOS.find(s => s.id === 'sun_snipe'), lo = R.prepare(sc, DF.get('hard')).lo;
  const at = mul => R.foeHp(sc, Object.assign({}, DF.get('hard'), { hpMul: mul }), lo);
  assert.deepEqual(at(1.05), at(1)); assert.deepEqual(at(1.1), at(1));
  assert.ok(at(0.8)[0] < at(1)[0], 'hpMul < 1 still lowers it');
  assert.ok(DF.get('hard').hpMul > 1 && DF.get('bambam').hpMul > 1, 'kept for non-kill units (enemycard)');
  assert.match(src('js/data/difficulty.js'), /NON-KILL/);
});

// sun_snipe at hard: the foe sidesteps the Sun Strike; a missed step on a dodging foe reads 'dodged', a plain miss 'missing'
function miss(df, hints) {
  const m = build('sun_snipe', df, 5), { w, h, run } = m;
  for (let i = 0; i < 600 && run.frozen(); i++) { prep(w, h, 'sunstrike'); run.tick(1 / 30); }
  const d = run.dummies[0];
  h.x = d.x - 300; h.y = d.y;
  IT.Orders.issue(w, h, { type: 'cast', ability: 'sunstrike', x: d.x, y: d.y });
  for (let k = 0; k < 120 && run.phase === 'play'; k++) w.step();
  IT.Combat.damage(w, { src: h, target: d, ability: 'attack', type: 'pure', amount: 1e6 });
  const prev = IT.Settings; IT.Settings = { get: () => ({ hints }) };
  try { for (let k = 0; k < 10 && run.phase === 'play'; k++) w.step(); } finally { IT.Settings = prev; }
  return run.result;
}
test('I11: a Sun Strike that missed a foe that stepped out of it is detail "dodged" (hard), "missing" without exec.dodge or with hints off', () => {
  assert.equal(miss('hard', true).detail, 'dodged');
  assert.equal(miss('hard', false).detail, 'missing', 'hint gated by the hints setting');
  assert.equal(miss('common', true).detail, 'missing', 'common foes do not dodge');
  assert.deepEqual(miss('hard', true).spells, ['sunstrike']);
});
test('I11: hint.dodged / cfail.method.dodged / scn.fail.method.dodged exist in EN and PT', () => {
  const v6 = src('js/data/i18n/v6.js');
  for (const k of ['hint.dodged', 'cfail.method.dodged', 'scn.fail.method.dodged']) assert.equal(v6.split("'" + k + "'").length, 3, k + ' EN + PT');
  assert.match(v6, /'hint\.dodged': 'It dodged: lock it first'/);
});

test('I14: the Deafening Blast KV has no knockback distance / speed (only the duration), so KNOCK_SPEED stays a documented estimate', () => {
  const d = IT.DOTA.abilities.invoker_deafening_blast.values;
  assert.ok(d.knockback_duration);
  assert.ok(!Object.keys(d).some(k => /knockback_(distance|speed)|push_/.test(k)));
  assert.equal(IT.Spells.KNOCK_SPEED, 150);
});

test('I15: Cataclysm strikes enemy heroes (dummy / enemy / hero) and never other units', () => {
  const lo = IT.Loadout.normalize(Object.assign({}, IT.Loadout.default(), { heroLevel: 25, scepter: true, scepterOrb: 'exort' }));
  const w = IT.World.create({ seed: 3, map: IT.Maps.get('grounds'), loadout: lo, fog: false, autoAttack: false });
  const h = IT.Hero.create(w, lo, 0, 0);
  const mk = (x, kind) => { const d = IT.Units.spawnDummy(w, { x, y: 0, preset: 'training', skin: 'pedro' }); d.hp = d.maxHp = 1e6; if (kind) d.kind = kind; return d; };
  const hero = mk(700), spirit = mk(-700, 'spirit');
  IT.Abilities.get('sunstrike').cast(w, h, { target: h.id, x: h.x, y: h.y });
  for (let i = 0; i < 5 * 30; i++) w.step();
  assert.ok(hero.hp < hero.maxHp, 'the hero-like foe is struck');
  assert.equal(spirit.hp, spirit.maxHp, 'a non-hero unit is not');
});
