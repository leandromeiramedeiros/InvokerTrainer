'use strict';
const test = require('node:test'), assert = require('node:assert');
const IT = require('./_load.js')(['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js']);

function mk(lo) { const w = IT.World.create({ seed: 1 }); const h = IT.Hero.create(w, lo || null, 0, 0); return { w, h }; }
const run = (w, n) => { for (let i = 0; i < n; i++) w.step(); };
const orbs = (w, h, s) => { for (const c of s) IT.Invoke.orb(w, h, c); };
const fails = w => w.log.filter(e => e.type === 'fail').map(e => e.reason);

test('orb queue drops oldest', () => {
  const { w, h } = mk();
  orbs(w, h, 'QWEQ');
  assert.deepEqual(h.inv.orbs, ['W', 'E', 'Q']);
  assert.equal(w.log.filter(e => e.type === 'orb').length, 4);
});
test('unlearned orb fails', () => {
  const { w, h } = mk(IT.Loadout.normalize({ heroLevel: 1, orbs: { quas: 1 } }));
  assert.equal(IT.Invoke.orb(w, h, 'W'), false);
  assert.deepEqual(fails(w), ['locked']);
  assert.deepEqual(h.inv.orbs, []);
});
test('disabled/silenced block orbs', () => {
  const { w, h } = mk();
  IT.Status.add(w, h, 'silence', 5);
  IT.Invoke.orb(w, h, 'Q');
  IT.Status.add(w, h, 'stun', 5);
  IT.Status.remove(w, h, 'silence');
  IT.Invoke.orb(w, h, 'Q');
  assert.deepEqual(fails(w), ['silenced', 'disabled']);
});
test('invoke recipe, slots, swap, cooldown', () => {
  const { w, h } = mk(IT.Loadout.normalize({ heroLevel: 13, orbs: { quas: 4, wex: 3, exort: 3 } }));
  assert.equal(IT.Invoke.recipeOf(['W', 'Q', 'W']), 'tornado');
  orbs(w, h, 'QQQ'); IT.Invoke.invoke(w, h);
  assert.deepEqual(h.inv.slots, ['coldsnap', null]);
  assert.ok(h.inv.invokeCd > 0);
  orbs(w, h, 'EEE'); IT.Invoke.invoke(w, h);
  assert.deepEqual(fails(w), ['invokeCooldown']);
  run(w, 300);
  IT.Invoke.invoke(w, h);
  assert.deepEqual(h.inv.slots, ['sunstrike', 'coldsnap']);
  // already in slot 0: no-op
  const n = w.log.length; IT.Invoke.invoke(w, h); assert.equal(w.log.length, n);
  // swap w/o cooldown
  const cdBefore = h.inv.invokeCd;
  orbs(w, h, 'QQQ'); IT.Invoke.invoke(w, h);
  assert.deepEqual(h.inv.slots, ['coldsnap', 'sunstrike']);
  const ev = w.log.filter(e => e.type === 'invoke').pop();
  assert.equal(ev.swapped, true); assert.equal(ev.spell, 'coldsnap');
  assert.equal(h.inv.invokeCd, cdBefore);
  run(w, 300);
  // new spell pushes slot 0 to 1, drops old 1
  orbs(w, h, 'EEW'); IT.Invoke.invoke(w, h);
  assert.deepEqual(h.inv.slots, ['chaosmeteor', 'coldsnap']);
});
test('noRecipe with fewer than 3 orbs; unlearned orb in recipe', () => {
  const { w, h } = mk();
  orbs(w, h, 'QQ'); IT.Invoke.invoke(w, h);
  assert.deepEqual(fails(w), ['noRecipe']);
  const l = mk(IT.Loadout.normalize({ heroLevel: 1, orbs: { quas: 1 } }));
  l.h.inv.orbs = ['Q', 'W', 'E']; IT.Invoke.invoke(l.w, l.h);
  assert.deepEqual(fails(l.w), ['locked']);
});
test('invoke cooldown shrinks with orb levels', () => {
  const lo = IT.Loadout.normalize({ heroLevel: 13, orbs: { quas: 4, wex: 3, exort: 3 } });
  const a = mk(IT.Loadout.normalize({ heroLevel: 1, orbs: { quas: 1 } }));
  const b = mk(lo);
  orbs(a.w, a.h, 'QQQ'); IT.Invoke.invoke(a.w, a.h);
  orbs(b.w, b.h, 'QQQ'); IT.Invoke.invoke(b.w, b.h);
  assert.ok(a.h.inv.invokeCd > b.h.inv.invokeCd);
  assert.ok(Math.abs(b.h.inv.invokeCd - 3.6) < 1e-6   /* sum 10: between anchors 9 (4.0) and 12 (2.8) */);
  assert.ok(Math.abs(a.h.inv.invokeCd - 6.7) < 1e-6);
});
test('orb passives change stats', () => {
  const { w, h } = mk();
  run(w, 1);
  const ms0 = h.ms, hr0 = h.hpRegen, d0 = h.attack.max, as0 = h.attack.as;
  orbs(w, h, 'WWW'); run(w, 1);
  assert.ok(h.ms > ms0); assert.ok(h.attack.as > as0);
  orbs(w, h, 'QQQ'); run(w, 1);
  assert.ok(h.hpRegen > hr0);
  orbs(w, h, 'EEE'); run(w, 1);
  assert.equal(h.attack.max, d0 + 3 * IT.Values.get('invoker_exort', 'bonus_damage_per_instance', h.ctx));
  IT.Status.add(w, h, 'slow', 3, { data: { pct: 0.5 } }); run(w, 1);
  assert.ok(h.ms < ms0);
  IT.Status.add(w, h, 'hex', 3); run(w, 1);
  assert.equal(h.ms, 140);
});
test('status stats and regen', () => {
  const { w, h } = mk();
  IT.Status.add(w, h, 'alacrity', 2, { data: { stats: { as: 100, dmg: 10 } } });
  run(w, 1);
  assert.equal(h.attack.as, h.base.as + 100);
  h.hp = 10; h.mana = 0; run(w, 30);
  assert.ok(h.hp > 10 && h.mana > 0);
});
