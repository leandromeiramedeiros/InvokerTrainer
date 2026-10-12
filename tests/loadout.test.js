'use strict';
const test = require('node:test'), assert = require('node:assert');
const IT = require('./_load.js')(['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/loadout.js', 'js/sim/hero.js']);

test('default loadout is valid level 30', () => {
  const l = IT.Loadout.default();
  assert.equal(l.heroLevel, 30);
  assert.deepEqual(l.items, []);
  assert.ok(IT.Loadout.validate(l).ok);
});
test('item validation', () => {
  const l = IT.Loadout.default();
  assert.ok(!IT.Loadout.validate(Object.assign({}, l, { items: ['blink', 'blink'] })).ok);
  assert.ok(!IT.Loadout.validate(Object.assign({}, l, { items: ['boots', 'travels'] })).ok);
  assert.ok(!IT.Loadout.validate(Object.assign({}, l, { items: ['nope'] })).ok);
  assert.ok(!IT.Loadout.validate(Object.assign({}, l, { items: ['refresher', 'atos', 'vyse', 'shiva', 'meteorhammer', 'bkb', 'blink'] })).ok);
  assert.ok(IT.Loadout.validate(Object.assign({}, l, { items: ['refresher', 'blink', 'travels', 'orchid', 'gleipnir'] })).ok);
  assert.ok(!IT.Loadout.validate(Object.assign({}, l, { items: ['treads'] })).ok, 'treads removed');
});
test('normalize fills defaults and ctx works', () => {
  const n = IT.Loadout.normalize({ heroLevel: 5, orbs: { quas: 2 } });
  assert.equal(n.orbs.wex, 0); assert.deepEqual(n.items, []);
  assert.equal(IT.Loadout.ctx(n).orbs.quas, 2);
});
test('hero stats level 1 vs 30', () => {
  const w1 = IT.World.create({ seed: 1 }), w30 = IT.World.create({ seed: 1 });
  const a = IT.Hero.create(w1, IT.Loadout.normalize({ heroLevel: 1, orbs: { quas: 1 } }), 0, 0);
  const b = IT.Hero.create(w30, null, 0, 0);
  assert.equal(w1.hero, a);
  assert.ok(b.maxHp > a.maxHp * 2 && b.maxMana > a.maxMana * 2);
  assert.ok(Math.abs(a.maxHp - (120 + 22 * (19 + 1))) < 1e-6);   // 1 quas level = +1 str
  assert.ok(b.armor > a.armor && b.hpRegen > a.hpRegen);
  assert.equal(a.ms, 280);
  assert.equal(a.team, 0); assert.equal(a.kind, 'hero'); assert.equal(a.items.length, 6);
  assert.ok(b.attack.as > a.attack.as);
});
// v4: orbs cap at 7 spent levels (real Dota 8/8/8 = STR 100/AGI 80/INT 146, HP 2298, mana 1827; each orb level is +1 attr)
test('stats audit: level 30, orbs 7/7/7 (Dota 8/8/8 minus 1 level each)', () => {
  const w = IT.World.create({ seed: 1 });
  const h = IT.Hero.create(w, IT.Loadout.normalize({ heroLevel: 30, orbs: { quas: 7, wex: 7, exort: 7 } }), 0, 0);
  assert.deepEqual(h.attr, { str: 98.5, agi: 79, int: 145 });
  assert.equal(h.maxHp, 120 + 22 * 98);                         // derived stats use the whole attribute: 2276
  assert.equal(h.maxMana, 1815);
  assert.equal(Math.round(h.armor), 12); assert.equal(Math.round(h.magicRes * 100), 40);
  assert.equal(h.attack.min, 164); assert.equal(h.attack.max, 170);
  assert.ok(Math.abs(h.base.hpRegen - 10.1) < 1e-9 && Math.abs(h.base.manaRegen - 7.25) < 1e-9);
  assert.equal(IT.Hero.maxHp(h.ctx), 2276);
  // odd levels: STR x.5 floors (L2 = 21.5 -> 21)
  const g = IT.Hero.create(IT.World.create({ seed: 1 }), IT.Loadout.normalize({ heroLevel: 2 }), 0, 0);
  assert.equal(g.maxHp, 120 + 22 * 21);
});
