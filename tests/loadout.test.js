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
  assert.ok(!IT.Loadout.validate(Object.assign({}, l, { items: ['boots', 'treads'] })).ok);
  assert.ok(!IT.Loadout.validate(Object.assign({}, l, { items: ['nope'] })).ok);
  assert.ok(!IT.Loadout.validate(Object.assign({}, l, { items: ['refresher', 'atos', 'vyse', 'shiva', 'meteorhammer', 'bkb', 'blink'] })).ok);
  assert.ok(IT.Loadout.validate(Object.assign({}, l, { items: ['refresher', 'blink', 'treads'] })).ok);
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
