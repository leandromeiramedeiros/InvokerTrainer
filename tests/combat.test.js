'use strict';
const test = require('node:test');
const assert = require('node:assert');
const env = require('./_unitsenv.js');
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);

function target(w, over) { return w.add(Object.assign({ kind: 'spirit', team: 1, x: 0, y: 0, radius: 16, hp: 5000, maxHp: 5000, mana: 100, maxMana: 100, armor: 0, magicRes: 0 }, over)); }

test('physical armor mitigation 0/5/10/-5', () => {
  const { IT, w } = env();
  for (const [a, mult] of [[0, 1], [5, 1 - 0.3 / 1.3], [10, 1 - 0.6 / 1.6], [-5, 1 + 0.3 / 1.3]]) {
    const t = target(w, { armor: a });
    near(IT.Combat.damage(w, { src: 1, target: t, type: 'physical', amount: 100 }), 100 * mult);
  }
});

test('magical uses magicRes; pure unchanged', () => {
  const { IT, w } = env();
  const t = target(w, { magicRes: 0.25, armor: 10 });
  near(IT.Combat.damage(w, { target: t, type: 'magical', amount: 100 }), 75);
  near(IT.Combat.damage(w, { target: t, type: 'pure', amount: 100 }), 100);
  const ev = w.log.filter(e => e.type === 'damage');
  near(ev[0].prevented, 25); near(ev[0].raw, 100);
});

test('BKB blocks magical, not pure/physical; pierce overrides', () => {
  const { IT, w } = env();
  const t = target(w);
  IT.Status.add(w, t, 'magicImmune', 10);
  assert.strictEqual(IT.Combat.damage(w, { target: t, type: 'magical', amount: 100 }), 0);
  assert.strictEqual(IT.Combat.damage(w, { target: t, type: 'pure', amount: 100 }), 100);
  assert.strictEqual(IT.Combat.damage(w, { target: t, type: 'physical', amount: 100 }), 100);
  assert.strictEqual(IT.Combat.damage(w, { target: t, type: 'magical', amount: 100, flags: { pierce: true } }), 100);
});

test('lifted targets are invulnerable unless allowLifted', () => {
  const { IT, w } = env();
  const t = target(w);
  IT.Status.add(w, t, 'lift', 2);
  assert.strictEqual(IT.Combat.damage(w, { target: t, type: 'pure', amount: 100 }), 0);
  assert.strictEqual(t.hp, 5000);
  assert.strictEqual(IT.Combat.damage(w, { target: t, type: 'pure', amount: 100, flags: { allowLifted: true } }), 100);
});

test('dummy refills below 25% hp', () => {
  const { IT, w, evs } = env();
  const d = IT.Units.spawnDummy(w, { x: 500, y: 0, preset: 'training', skin: 'pedro' });
  d.mana = 10;
  IT.Combat.damage(w, { target: d, type: 'pure', amount: 1800 });
  assert.strictEqual(d.hp, 700); assert.strictEqual(evs('refill').length, 0);
  IT.Combat.damage(w, { target: d, type: 'pure', amount: 100 });   // 600 < 625
  assert.strictEqual(d.hp, d.maxHp); assert.strictEqual(d.mana, d.maxMana);
  assert.strictEqual(evs('refill').length, 1);
});

test('hero down refills', () => {
  const { IT, w, hero, evs } = env();
  IT.Combat.damage(w, { target: hero, type: 'pure', amount: 5000 });
  assert.strictEqual(hero.hp, hero.maxHp);
  assert.strictEqual(evs('heroDown').length, 1);
});

test('heal / restoreMana clamp; manaBurn caps at current mana and BKB blocks', () => {
  const { IT, w } = env();
  const t = target(w, { hp: 10, mana: 30 });
  assert.strictEqual(IT.Combat.heal(w, t, 99999), 4990);
  assert.strictEqual(IT.Combat.manaBurn(w, 1, t, 50), 30);
  assert.strictEqual(t.mana, 0);
  assert.strictEqual(IT.Combat.restoreMana(t, 500), 100);
  IT.Status.add(w, t, 'magicImmune', 5);
  assert.strictEqual(IT.Combat.manaBurn(w, 1, t, 50), 0);
});

test('push moves target over duration; drag pulls to point', () => {
  const { IT, w, run } = env();
  const t = target(w, { x: 100, y: 100 });
  IT.Combat.push(w, t, 150, 0, 0.5);
  run(20);
  near(t.x, 250, 1); near(t.y, 100, 1e-6);
  assert.ok(!IT.Status.has(t, 'knockback'));
  IT.Combat.drag(w, t, 250, 400, 300);
  run(40);
  near(t.x, 250, 1e-6); near(t.y, 400, 1e-6);
  assert.ok(!IT.Status.has(t, 'knockback'));
});
