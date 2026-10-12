'use strict';
// v4 progression + orders contract (PLAN-v4 G1-G4, C3, A3, B4/E1 sim side)
const test = require('node:test'), assert = require('node:assert');
const IT = require('./_load.js')(['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js', 'js/sim/units.js']);
IT.Combat = {
  damage(w, o) { const t = w.get(o.target); t.hp -= o.amount; w.emit('damage', { src: o.src, target: o.target, ability: o.ability, dmgType: o.type, raw: o.amount, dealt: o.amount, prevented: 0 }); return o.amount; },
};
const R = IT.RULES, near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + ' != ' + b);
const mk = (lo) => { const w = IT.World.create({ seed: 1, fog: false }); const h = IT.Hero.create(w, lo || null, 0, 0); h.facing = 0; return { w, h }; };
const run = (w, n) => { for (let i = 0; i < n; i++) w.step(); };
const evs = (w, type) => w.log.filter(e => e.type === type);
const dummy = (w, x, y) => w.add({ kind: 'dummy', team: 1, x, y, radius: 24, hp: 99999, maxHp: 99999, mana: 0, maxMana: 0, ms: 0, armor: 0, magicRes: 0, visible: true });

// ---- G1 invoke cooldown table
test('G1 invoke cooldown anchors, interpolation, scepter', () => {
  const T = [[3, 6.1, 5.8], [6, 4.9, 4.6], [9, 4.0, 3.7], [12, 2.8, 2.5], [15, 1.9, 1.6], [18, 0.7, 0.4]];
  for (const [s, a, b] of T) { near(R.invokeCooldown(s, false), a); near(R.invokeCooldown(s, true), b); }
  near(R.invokeCooldown(21, false), 0); near(R.invokeCooldown(20, true), 0); near(R.invokeCooldown(24, true), 0);
  near(R.invokeCooldown(10, false), 4.0 - 1.2 / 3);          // between 9 (4.0) and 12 (2.8)
  assert.ok(R.invokeCooldown(0, false) > 6.1);
  let prev = 99; for (let s = 0; s <= 24; s++) { const c = R.invokeCooldown(s, false); assert.ok(c <= prev + 1e-9); prev = c; }
});
test('G1 hero invoke cd follows spent orb levels', () => {
  const lo = IT.Loadout.normalize({ heroLevel: 9, orbs: { quas: 3, wex: 3, exort: 3 } });
  const { w, h } = mk(lo);
  for (const c of 'QQQ') IT.Invoke.orb(w, h, c);
  assert.ok(IT.Invoke.invoke(w, h));
  near(h.inv.invokeCd, 4.0);
});

// ---- G2/G3/G4 level info + normalize
test('G2 points schedule + bank + gate (levelInfo)', () => {
  const a = IT.Hero.levelInfo(1, { quas: 0, wex: 0, exort: 0 }, false);
  assert.equal(a.points, 1); assert.equal(a.spent, 0); assert.equal(a.bank, 1); assert.equal(a.maxPerOrb, 7);
  assert.equal(IT.Hero.levelInfo(6, {}, false).points, 7);        // 6 + bonus
  assert.equal(IT.Hero.levelInfo(12, {}, false).points, 15);       // batch P single pool: 12 + 2 bonus + 1 talent point
  assert.equal(IT.Hero.levelInfo(18, {}, false).points, 23);       // 18 + 3 bonus + 2 talent points
  assert.equal(IT.Hero.levelInfo(5, { quas: 3, wex: 0, exort: 0 }, false).bank, 2);
  assert.equal(IT.Hero.levelInfo(5, {}, false).orbCap, 3);         // 2N-1 <= 5
  assert.equal(IT.Hero.levelInfo(13, {}, false).orbCap, 7);
  assert.equal(IT.Hero.levelInfo(14, {}, false).orbCap, 7);
  assert.equal(IT.Hero.levelInfo(20, { quas: 7, wex: 7, exort: 7 }, true).maxEff, 8);
  near(IT.Hero.levelInfo(18, { quas: 7, wex: 7, exort: 7 }, false).invokeCd, 0);
  assert.equal(IT.Hero.levelInfo(1, { quas: 0, wex: 0, exort: 0 }, false).locked.wex, true);
  assert.equal(IT.Hero.levelInfo(1, { quas: 1, wex: 0, exort: 0 }, false).locked.quas, false);
  assert.equal(IT.Hero.levelInfo(10, {}, false).talentsAllowed.points, 1);
  assert.equal(IT.Hero.levelInfo(30, {}, false).talentsAllowed.all, true);
});
test('G3 normalize auto-fixes illegal orb sets and talents', () => {
  let l = IT.Loadout.normalize({ heroLevel: 1, orbs: { quas: 5, wex: 5, exort: 5 } });
  assert.deepEqual(l.orbs, { quas: 1, wex: 0, exort: 0 });         // 1 point, gate cap 1
  l = IT.Loadout.normalize({ heroLevel: 5, orbs: { quas: 7, wex: 0, exort: 0 } });
  assert.equal(l.orbs.quas, 3);                                     // gate: 2N-1 <= 5
  l = IT.Loadout.normalize({ heroLevel: 9, orbs: { quas: 5, wex: 5, exort: 5 } });
  assert.ok(R.validate(l).ok); assert.equal(l.orbs.quas + l.orbs.wex + l.orbs.exort, 10);
  l = IT.Loadout.normalize({ heroLevel: 14, orbs: { quas: 7, wex: 7, exort: 0 } });
  assert.deepEqual(l.orbs, { quas: 7, wex: 7, exort: 0 });         // gate over, points bank ok
  l = IT.Loadout.normalize({ heroLevel: 25, orbs: { quas: 12, wex: 0, exort: 0 } });
  assert.equal(l.orbs.quas, 7);
  l = IT.Loadout.normalize({ heroLevel: 5, orbs: { quas: 1 }, talents: [R.talentTiers[0].left] });
  assert.deepEqual(l.talents, []);                                  // tier 10 not reached
  l = IT.Loadout.normalize({ heroLevel: 30, orbs: {}, talents: [] });
  assert.equal(l.talents.length, 0);                                // batch P: an explicit list is respected (talents cost points)
  l = IT.Loadout.normalize({ heroLevel: 30, orbs: {} });
  assert.equal(l.talents.length, 8);                                // no list at 30 = legacy default, all 8
  assert.equal(IT.Loadout.normalize({ lvl: 9, orbs: { quas: 5 } }).heroLevel, 9);
});
test('G3 locked orb does nothing', () => {
  const { w, h } = mk(IT.Loadout.normalize({ heroLevel: 1, orbs: { quas: 1 } }));
  assert.equal(IT.Invoke.orb(w, h, 'W'), false);
  assert.equal(IT.Invoke.orb(w, h, 'E'), false);
  assert.deepEqual(evs(w, 'fail').map(e => e.reason), ['locked', 'locked']);
  assert.deepEqual(h.inv.orbs, []);
  assert.ok(IT.Invoke.orb(w, h, 'Q'));
});
test('G3 scepter orb unlocks an otherwise empty orb', () => {
  const { w, h } = mk(IT.Loadout.normalize({ heroLevel: 1, orbs: { quas: 1 }, scepter: true, scepterOrb: 'wex' }));
  assert.equal(IT.Invoke.orb(w, h, 'W'), true);
});

// ---- C3 preinvoked
test('C3 preinvoked fills invoke slots (and orbs when unlocked)', () => {
  const full = { quas: 7, wex: 7, exort: 7 };
  let l = IT.Loadout.normalize({ heroLevel: 25, orbs: full, preinvoked: ['sunstrike', 'coldsnap'] });
  assert.deepEqual(l.preinvoked, ['sunstrike', 'coldsnap']);
  let { h } = mk(l);
  assert.deepEqual(h.inv.slots, ['sunstrike', 'coldsnap']);
  assert.deepEqual(h.inv.orbs, ['E', 'E', 'E']);
  ({ h } = mk(IT.Loadout.normalize({ heroLevel: 25, orbs: full, preinvoked: ['tornado'] })));
  assert.deepEqual(h.inv.slots, ['tornado', null]);
  // locked orbs -> slots still set, orb row left empty
  ({ h } = mk(IT.Loadout.normalize({ heroLevel: 1, orbs: { quas: 1 }, preinvoked: ['sunstrike'] })));
  assert.deepEqual(h.inv.slots, ['sunstrike', null]); assert.deepEqual(h.inv.orbs, []);
  assert.deepEqual(IT.Loadout.normalize({ preinvoked: ['nope', 'ghostwalk', 'ghostwalk', 'emp'] }).preinvoked, ['ghostwalk', 'emp']);
  ({ h } = mk(IT.Loadout.normalize({})));
  assert.deepEqual(h.inv.slots, [null, null]);
});

// ---- A3 RMB spam must not cancel the attack
const attacks = w => evs(w, 'attack').length;
test('A3 spamming RMB on the target (same-target attack) still lands attacks', () => {
  const { w, h } = mk(); const d = dummy(w, 400, 0);
  for (let i = 0; i < 150; i++) { if (i % 3 === 0) IT.Orders.issue(w, h, { type: 'attack', target: d.id }); w.step(); }
  assert.ok(attacks(w) >= 3, 'attacks ' + attacks(w));
  assert.ok(d.hp < d.maxHp);
});
test('A3 spamming RMB on the ground next to the target still lands attacks', () => {
  const { w, h } = mk(); const d = dummy(w, 400, 0);
  IT.Orders.issue(w, h, { type: 'attack', target: d.id });
  for (let i = 0; i < 150; i++) { if (i % 2 === 0) IT.Orders.issue(w, h, { type: 'move', x: 430 + (i % 4) * 5, y: 40 }); w.step(); }
  assert.ok(attacks(w) >= 3, 'attacks ' + attacks(w));
  assert.equal(h.orders[0] && h.orders[0].type, 'attack');
});
test('A3 spam during the chase (target out of range) keeps chasing and then attacks', () => {
  const { w, h } = mk(); const d = dummy(w, 1200, 0);
  IT.Orders.issue(w, h, { type: 'attack', target: d.id });
  for (let i = 0; i < 300; i++) { if (i % 2 === 0) IT.Orders.issue(w, h, { type: 'attack', target: d.id }); w.step(); }
  assert.ok(h.x > 300, 'x ' + h.x); assert.ok(attacks(w) >= 1);
});
test('A3 a far move during the wind-up lets the swing land, then walks', () => {
  const { w, h } = mk(); const d = dummy(w, 400, 0);
  IT.Orders.issue(w, h, { type: 'attack', target: d.id });
  let n = 0; while (!h._wind && n++ < 60) w.step();
  assert.ok(h._wind, 'wind-up started');
  IT.Orders.issue(w, h, { type: 'move', x: -500, y: 0 });
  run(w, 30);
  assert.equal(attacks(w), 1); assert.ok(d.hp < d.maxHp);
  run(w, 60); assert.ok(h.x < 0);
});
test('A3 Stop still cancels the wind-up (no attack)', () => {
  const { w, h } = mk(); const d = dummy(w, 400, 0);
  IT.Orders.issue(w, h, { type: 'attack', target: d.id });
  let n = 0; while (!h._wind && n++ < 60) w.step();
  IT.Orders.issue(w, h, { type: 'stop' });
  run(w, 4);                                                        // idle auto-acquire is blocked for 0.2 s after Stop
  assert.equal(attacks(w), 0); assert.equal(h._wind, null);
});

// ---- B4/E1 issueGroup
function squad() {
  const { w, h } = mk();
  const s1 = IT.Units.spawnSpirit(w, h, 100, 60), s2 = IT.Units.spawnSpirit(w, h, 100, -60);
  s1.facing = s2.facing = 0;
  return { w, h, s1, s2 };
}
test('B4 issueGroup: move sends everyone (spread), stop/hold apply to all', () => {
  const { w, h, s1, s2 } = squad();
  assert.ok(IT.Orders.issueGroup(w, [h, s1, s2], { type: 'move', x: 600, y: 0 }));
  run(w, 200);
  for (const u of [h, s1, s2]) assert.ok(Math.hypot(u.x - 600, u.y) < 80, u.kind + ' at ' + u.x + ',' + u.y);
  IT.Orders.issueGroup(w, [h.id, s1.id, s2.id], { type: 'hold' });
  assert.ok([h, s1, s2].every(u => u.orders[0] && u.orders[0].type === 'hold'));
  IT.Orders.issueGroup(w, [h, s1, s2], { type: 'stop' });
  assert.ok([h, s1, s2].every(u => u.orders.length === 0));
  assert.equal(IT.Orders.issueGroup(w, [], { type: 'stop' }), false);
});
test('B4 issueGroup: attack target / attack-move', () => {
  const { w, h, s1, s2 } = squad(); const d = dummy(w, 450, 0);
  IT.Orders.issueGroup(w, [h, s1, s2], { type: 'attack', target: d.id });
  assert.ok([h, s1, s2].every(u => u.orders[0].type === 'attack' && u.orders[0].target === d.id));
  run(w, 150);
  assert.ok(d.hp < d.maxHp);
  const q = squad(); const d2 = dummy(q.w, 700, 0);
  IT.Orders.issueGroup(q.w, [q.h, q.s1, q.s2], { type: 'attack', x: 900, y: 0 });
  run(q.w, 200);
  assert.ok(d2.hp < d2.maxHp);
});
test('E1 spirits under a player order are not reassigned by their AI', () => {
  const { w, s1, s2 } = squad(); dummy(w, 500, 0);
  IT.Orders.issueGroup(w, [s1], { type: 'hold' });
  run(w, 90);                                                       // the AI would have sent s1 after the dummy by now
  assert.equal(s1.orders[0].type, 'hold');
  assert.equal(s1._wind, null); assert.equal(s1.x, 100);
  IT.Orders.issueGroup(w, [s2], { type: 'move', x: 100, y: -300 });
  run(w, 120);
  assert.ok(Math.hypot(s2.x - 100, s2.y + 300) < 60);              // reached the point; AI did not pull it back
  assert.equal(IT.Orders.issue(w, s1, { type: 'move', x: 0, y: 0 }), false);   // a plain (AI) issue is ignored
  assert.ok(IT.Orders.issue(w, s1, { type: 'move', x: 0, y: 0, player: true }));
});
