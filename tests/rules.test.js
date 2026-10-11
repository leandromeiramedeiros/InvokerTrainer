'use strict';
const test = require('node:test');
const assert = require('node:assert');
const IT = require('./_load.js')(['js/data/rules.js']);
const R = IT.RULES;

const base = (o) => Object.assign({ heroLevel: 1, orbs: { quas: 0, wex: 0, exort: 0 }, talents: [], scepter: false, shard: false }, o);
const orbs = (quas, wex, exort) => ({ quas, wex, exort });

test('points schedule', () => {
  assert.strictEqual(R.pointsAtLevel.length, 30);
  assert.strictEqual(R.pointsAtLevel[0], 1);
  assert.strictEqual(R.pointsAtLevel[4], 5);
  assert.strictEqual(R.pointsAtLevel[5], 7);
  assert.strictEqual(R.pointsAtLevel[11], 14);
  assert.strictEqual(R.pointsAtLevel[17], 21);
  assert.strictEqual(R.pointsAtLevel[29], 33);
});

test('gate and tiers', () => {
  assert.strictEqual(R.orbReqLevel.slice(0, 8).join(), "1,3,5,7,9,11,13,15");
  assert.strictEqual(R.orbGate(8), 15);
  assert.strictEqual(R.talentTiers.map(t => t.level).join(), "10,15,20,25");
  assert.strictEqual(R.talentTiers.flatMap(t => [t.left, t.right]).length, 8);
});

test('validate orbs', () => {
  assert.ok(R.validate(base({ orbs: orbs(1, 0, 0) })).ok);
  assert.ok(!R.validate(base({ orbs: orbs(2, 0, 0) })).ok);
  assert.ok(!R.validate(base({ heroLevel: 5, orbs: orbs(4, 0, 0) })).ok);
  assert.ok(R.validate(base({ heroLevel: 7, orbs: orbs(4, 3, 0) })).ok);
  assert.ok(!R.validate(base({ heroLevel: 5, orbs: orbs(3, 2, 1) })).ok);
  assert.ok(R.validate(base({ heroLevel: 6, orbs: orbs(3, 2, 2) })).ok);
  assert.ok(!R.validate(base({ heroLevel: 6, orbs: orbs(3, 2, 3) })).ok);
  assert.ok(!R.validate(base({ heroLevel: 14, orbs: orbs(8, 0, 0) })).ok);
  assert.ok(R.validate(base({ heroLevel: 21, orbs: orbs(8, 8, 8) })).ok);
  assert.ok(!R.validate(base({ heroLevel: 20, orbs: orbs(8, 8, 8) })).ok);
  assert.ok(!R.validate(base({ heroLevel: 30, orbs: orbs(9, 0, 0) })).ok);
  assert.ok(!R.validate(base({ heroLevel: 0 })).ok);
});

test('scepter is a free level on one orb', () => {
  const lo = base({ heroLevel: 21, orbs: orbs(8, 8, 8), scepter: true, scepterOrb: 'quas' });
  assert.ok(R.validate(lo).ok);
  assert.strictEqual(R.pointsLeft(lo), 0);
  assert.ok(!R.validate(base({ scepter: true })).ok);
});

test('validate talents', () => {
  const [t1, t2] = R.talentTiers;
  assert.ok(!R.validate(base({ heroLevel: 9, talents: [t1.left] })).ok);
  assert.ok(R.validate(base({ heroLevel: 10, talents: [t1.left] })).ok);
  assert.ok(!R.validate(base({ heroLevel: 25, talents: [t1.left, t1.right] })).ok);
  assert.ok(R.validate(base({ heroLevel: 27, talents: [t1.left, t1.right] })).ok);
  assert.ok(!R.validate(base({ heroLevel: 27, talents: [t1.left, t2.left, t2.right] })).ok);
  assert.ok(!R.validate(base({ heroLevel: 30, talents: ['nope'] })).ok);
  assert.ok(!R.validate(base({ heroLevel: 30, talents: [t1.left, t1.left] })).ok);
  assert.ok(R.validate(base({ heroLevel: 30, talents: R.talentTiers.flatMap(t => [t.left, t.right]) })).ok);
  assert.strictEqual(R.talentPointsAt(30), 8);
  assert.strictEqual(R.talentPointsAt(26), 4);
});

test('auto build legal at every level and maxes', () => {
  for (const style of ['qe', 'qw']) {
    for (let L = 1; L <= 30; L++) {
      const v = R.validate(R.autoLoadout(L, style));
      assert.ok(v.ok, style + ' L' + L + ' ' + v.errors.join(';'));
    }
    assert.strictEqual(JSON.stringify(R.autoLoadout(30, style).orbs), JSON.stringify(orbs(8, 8, 8)));
    assert.strictEqual(R.autoBuild[style].length, 30);
    assert.strictEqual(R.autoBuild[style].flat().length, 24);
  }
});
