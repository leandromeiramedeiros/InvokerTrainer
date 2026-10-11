'use strict';
const test = require('node:test'), assert = require('node:assert');
const IT = require('./_load.js')(['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js']);

IT.Combat = {   // stub: plain damage
  damage(w, o) { const t = w.get(o.target); t.hp -= o.amount; w.emit('damage', { src: o.src, target: o.target, ability: o.ability, dmgType: o.type, raw: o.amount, dealt: o.amount, prevented: 0 }); return o.amount; },
};
let chanEnds = [], casts = [];
IT.Abilities.def('fakept', { kind: 'spell', target: 'point', range: () => 300, castPoint: () => 0.3, manaCost: () => 50, cooldown: () => 5, cast(w, c, o) { casts.push({ t: w.t, x: o.x, y: o.y }); } });
IT.Abilities.def('fakechan', { kind: 'spell', target: 'none', range: () => 0, castPoint: () => 0, manaCost: () => 10, cooldown: () => 1, channel: () => 1, cast() {}, channelEnd(w, c, o, intr) { chanEnds.push(intr); } });
IT.Abilities.def('fakeunit', { kind: 'spell', target: 'unit', range: () => 200, castPoint: () => 0, manaCost: () => 10, cooldown: () => 1, cast(w, c, o) { casts.push({ target: o.target }); } });

function mk(opts) {
  const w = IT.World.create(Object.assign({ seed: 1, fog: false }, opts));
  const h = IT.Hero.create(w, null, 0, 0);
  h.facing = 0; h.inv.slots = ['fakept', 'fakechan'];
  chanEnds = []; casts = [];
  return { w, h };
}
const run = (w, n) => { for (let i = 0; i < n; i++) w.step(); };
const evs = (w, type) => w.log.filter(e => e.ev === type);
const dummy = (w, x, y) => w.add({ kind: 'dummy', team: 1, x, y, radius: 24, hp: 5000, maxHp: 5000, mana: 0, maxMana: 0, ms: 0, armor: 0, magicRes: 0, visible: true });

test('move order arrives and completes', () => {
  const { w, h } = mk();
  IT.Orders.issue(w, h, { type: 'move', x: 280, y: 0 });
  run(w, 20);
  assert.ok(h.x > 0 && h.x < 280); assert.equal(h.anim.name, 'walk');
  run(w, 20);
  assert.equal(h.x, 280); assert.equal(h.orders.length, 0);
  assert.equal(evs(w, 'orderDone').pop().ok, true);
  run(w, 1); assert.equal(h.anim.name, 'idle');
});
test('turning delays move start', () => {
  const { w, h } = mk();
  h.facing = Math.PI;
  IT.Orders.issue(w, h, { type: 'move', x: 500, y: 0 });
  run(w, 3);
  assert.equal(h.x, 0);
  run(w, 10);
  assert.ok(h.x > 0);
});
test('cast walks into range, waits cast point, spends mana and cooldown', () => {
  const { w, h } = mk();
  const m0 = h.mana;
  IT.Orders.issue(w, h, { type: 'cast', ability: 'fakept', x: 700, y: 0 });
  run(w, 60);
  assert.ok(Math.abs(700 - h.x) <= 300 + 1);
  assert.equal(casts.length, 1);
  const start = evs(w, 'castStart')[0], cast = evs(w, 'cast')[0];
  assert.ok(Math.abs(cast.t - start.t - 0.3) < 0.04);
  assert.ok(m0 - h.mana > 49 - h.manaRegen * 3);
  assert.ok(h.cd.fakept > 3);
  assert.equal(h.orders.length, 0);
});
test('invalid non-queued cast rejected without touching queue; invalid queued skipped', () => {
  const { w, h } = mk();
  IT.Orders.issue(w, h, { type: 'move', x: 1000, y: 0 });
  assert.equal(IT.Orders.issue(w, h, { type: 'cast', ability: 'nope', x: 1, y: 1 }), false);
  assert.equal(h.orders.length, 1);
  assert.equal(evs(w, 'fail').length, 1);
  h.inv.slots = [null, null];
  IT.Orders.issue(w, h, { type: 'move', x: 100, y: 0 });   // replaces
  IT.Orders.issue(w, h, { type: 'cast', ability: 'fakept', x: 1, y: 1, queued: true });
  IT.Orders.issue(w, h, { type: 'move', x: 200, y: 0, queued: true });
  run(w, 40);
  const skipped = evs(w, 'orderDone').filter(e => e.order.type === 'cast');
  assert.equal(skipped.length, 1); assert.equal(skipped[0].ok, false);
  assert.equal(h.x, 200);
});
test('queued move waits for channel; non-queued cancels it', () => {
  const { w, h } = mk();
  IT.Orders.issue(w, h, { type: 'cast', ability: 'fakechan' });
  run(w, 2);
  assert.ok(IT.Status.has(h, 'channel')); assert.equal(h.anim.name, 'cast');
  IT.Orders.issue(w, h, { type: 'move', x: 600, y: 0, queued: true });
  run(w, 20);
  assert.equal(h.x, 0);
  run(w, 15);
  assert.deepEqual(chanEnds, [false]);
  run(w, 10);
  assert.ok(h.x > 0);
  h.cd.fakechan = 0; h.mana = h.maxMana;
  chanEnds = [];
  IT.Orders.issue(w, h, { type: 'cast', ability: 'fakechan' });
  run(w, 3);
  IT.Orders.issue(w, h, { type: 'move', x: 0, y: 0 });
  assert.deepEqual(chanEnds, [true]);
  assert.ok(!IT.Status.has(h, 'channel'));
});
test('stun clears queue; invoke mid-queue keeps it', () => {
  const { w, h } = mk();
  IT.Orders.issue(w, h, { type: 'move', x: 600, y: 0 });
  IT.Orders.issue(w, h, { type: 'move', x: 600, y: 300, queued: true });
  h.inv.orbs = ['Q', 'Q', 'Q'];
  run(w, 3);
  IT.Invoke.invoke(w, h);
  assert.equal(h.orders.length, 2);
  IT.Status.add(w, h, 'stun', 1);
  assert.equal(h.orders.length, 0);
  assert.equal(IT.Orders.issue(w, h, { type: 'move', x: 1, y: 1 }), false);
  run(w, 1); assert.equal(h.anim.name, 'stunned');
});
test('unit cast fails when target vanishes', () => {
  const { w, h } = mk();
  h.inv.slots = ['fakeunit', null];
  const d = dummy(w, 900, 0);
  IT.Orders.issue(w, h, { type: 'cast', ability: 'fakeunit', target: d.id });
  run(w, 5);
  w.remove(d); run(w, 2);
  assert.equal(h.orders.length, 0);
  assert.equal(evs(w, 'fail').pop().reason, 'targetHidden');
});
test('attack loop cadence and damage', () => {
  const { w, h } = mk({ autoAttack: false });
  const d = dummy(w, 400, 0);
  IT.Orders.issue(w, h, { type: 'attack', target: d.id });
  run(w, 150);
  const at = evs(w, 'attack');
  assert.ok(at.length >= 4);
  const per = IT.Hero.attackTime(h);
  assert.ok(Math.abs((at[2].t - at[1].t) - per) < 0.04, 'period ' + (at[2].t - at[1].t) + ' vs ' + per);
  assert.ok(d.hp < 5000);
  assert.ok(evs(w, 'attackHit').length >= evs(w, 'damage').length);
  const dm = evs(w, 'damage')[0];
  assert.ok(dm.raw >= h.attack.min - 1e-9 && dm.raw <= h.attack.max + 1e-9);
  IT.Status.add(w, h, 'disarm', 5);
  run(w, 20);   // flush in-flight projectile
  const n = evs(w, 'attack').length; run(w, 90);
  assert.equal(evs(w, 'attack').length, n);
});
test('idle auto-acquire attacks; hold does not walk; autoAttack:false disables', () => {
  let { w, h } = mk();
  dummy(w, 500, 0);
  run(w, 90);
  assert.ok(evs(w, 'attack').length > 0);
  ({ w, h } = mk());
  dummy(w, 700, 0);
  IT.Orders.issue(w, h, { type: 'hold' });
  run(w, 60);
  assert.equal(h.x, 0); assert.equal(evs(w, 'attack').length, 0);
  ({ w, h } = mk({ autoAttack: false }));
  dummy(w, 500, 0); run(w, 90);
  assert.equal(evs(w, 'attack').length, 0);
});
test('waypoints and stop', () => {
  const { w, h } = mk();
  IT.Orders.issue(w, h, { type: 'move', x: 600, y: 0 });
  IT.Orders.issue(w, h, { type: 'move', x: 600, y: 300, queued: true });
  assert.deepEqual(IT.Orders.waypoints(h).map(p => p.type), ['move', 'move']);
  assert.equal(IT.Orders.current(h).x, 600);
  IT.Orders.issue(w, h, { type: 'stop' });
  assert.equal(h.orders.length, 0);
});
