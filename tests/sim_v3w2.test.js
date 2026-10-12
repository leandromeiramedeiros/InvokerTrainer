'use strict';
// v3 wave 2 sim: Hold/Stop, Ghost Walk auto-acquire, attack-move, Cataclysm self-cast, audio events, responsiveness.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js'];

function env(extra, opts) {
  const IT = load(FILES);
  const lo = Object.assign(IT.Loadout.default(), { heroLevel: 30, orbs: { quas: 4, wex: 4, exort: 4 } }, extra || {});
  const w = IT.World.create(Object.assign({ seed: 5, fog: false }, opts || {}));
  const h = IT.Hero.create(w, lo, 0, 0);
  h.facing = 0; h.maxMana = h.mana = 9999;
  const run = s => { for (let i = 0, n = Math.round(s * 30); i < n; i++) w.step(); };
  const dummy = (x, y, o) => {
    const d = IT.Units.spawnDummy(w, Object.assign({ x, y, preset: 'standard', skin: 'pedro', behavior: 'stationary' }, o || {}));
    d.visible = true;
    return d;
  };
  const evs = type => w.log.filter(e => e.ev === type);
  const slot = id => { h.inv.slots = [id, null]; h.cd[id] = 0; };
  return { IT, w, h, run, dummy, evs, slot };
}

// ---------------------------------------------------------------- #38 Hold
test('hold: never attacks (even targets in range) until any new order', () => {
  const e = env();
  e.dummy(300, 0);
  e.run(1);
  assert.ok(e.evs('attackStart').length > 0, 'idle auto-acquire normally attacks');
  const before = e.evs('attackStart').length;
  e.IT.Orders.issue(e.w, e.h, { type: 'hold' });
  assert.equal(e.h._wind, null);
  e.run(4);
  assert.equal(e.evs('attackStart').length, before);
  assert.equal(e.h.orders[0].type, 'hold');
  // a (queued) new order ends hold
  e.IT.Orders.issue(e.w, e.h, { type: 'move', x: 0, y: 0, queued: true });
  assert.ok(!e.h.orders.some(o => o.type === 'hold'));
  e.run(2);
  assert.ok(e.evs('attackStart').length > before, 'auto-acquire back after hold ended');
});
test('hold cancels an in-progress wind-up without spending the cooldown', () => {
  const e = env();
  e.dummy(300, 0);
  e.run(0.1);
  assert.ok(e.h._wind, 'winding up');
  e.IT.Orders.issue(e.w, e.h, { type: 'hold' });
  assert.equal(e.h._wind, null); assert.equal(e.h.attack.next, 0);
  e.run(2);
  assert.equal(e.evs('attack').length, 0);
});

// ---------------------------------------------------------------- #38 Stop
test('stop cancels wind-up, no cooldown consumed, auto-acquire resumes after ~0.2s', () => {
  const e = env();
  const d = e.dummy(300, 0);
  e.run(0.1);
  assert.ok(e.h._wind);
  const t0 = e.w.t;
  e.IT.Orders.issue(e.w, e.h, { type: 'stop' });
  assert.equal(e.h._wind, null); assert.equal(e.h.attack.next, 0);
  e.run(0.15);
  assert.equal(e.evs('attackStart').filter(x => x.t > t0).length, 0, 'suppressed right after stop');
  e.run(0.3);
  assert.ok(e.evs('attackStart').filter(x => x.t > t0).length > 0, 'resumes');
  e.run(1.5);
  assert.ok(d.hp < d.maxHp, 'attacks land again');
});
test('stop does not undo a cast', () => {
  const e = env();
  e.slot('ghostwalk');
  e.IT.Orders.issue(e.w, e.h, { type: 'cast', ability: 'ghostwalk' });
  e.run(0.2);
  e.IT.Orders.issue(e.w, e.h, { type: 'stop' });
  assert.ok(e.IT.Status.has(e.h, 'ghost'));
});

// ---------------------------------------------------------------- attack point
test('attackStart precedes attack by the IAS-scaled attack point', () => {
  const e = env();
  e.dummy(300, 0);
  e.run(1);
  const st = e.evs('attackStart')[0], at = e.evs('attack')[0];
  assert.equal(st.src, e.h.id);
  const pt = e.IT.Hero.attackPoint(e.h);
  assert.ok(Math.abs(e.h.attack.point - 0.4) < 1e-9, 'Invoker base attack point 0.4');
  assert.ok(Math.abs((at.t - st.t) - pt) < 0.04, (at.t - st.t) + ' vs ' + pt);
  e.h.attack.as = 200;   // IAS halves it (stats system would overwrite; check the formula)
  assert.ok(Math.abs(e.IT.Hero.attackPoint(e.h) - 0.2) < 1e-9);
});
test('forge spirit attack point comes from the unit data and scales with IAS', () => {
  const e = env();
  const s = e.IT.Units.spawnSpirit(e.w, e.h, 100, 0);
  assert.equal(s.attack.point, e.IT.DOTA.units.npc_dota_invoker_forged_spirit.AttackAnimationPoint);
  assert.ok(e.IT.Hero.attackPoint(s) > 0);
});

// ---------------------------------------------------------------- #39 Ghost Walk
test('ghost walk: no idle auto-acquire; explicit attack still works', () => {
  const e = env();
  e.slot('ghostwalk');
  const d = e.dummy(300, 0);
  e.IT.Status.add(e.w, e.h, 'ghost', 10, { src: e.h.id, ability: 'ghostwalk' });
  e.run(2);
  assert.equal(e.evs('attackStart').length, 0);
  e.IT.Orders.issue(e.w, e.h, { type: 'attack', target: d.id });
  e.run(1);
  assert.ok(e.evs('attackStart').length > 0);
});
test('ghost walk start/end fx; attacking breaks it', () => {
  const e = env();
  e.slot('ghostwalk');
  const d = e.dummy(300, 0);
  e.IT.Orders.issue(e.w, e.h, { type: 'cast', ability: 'ghostwalk' });
  e.run(0.2);
  const fx = n => e.evs('fx').filter(x => x.name === n);
  assert.equal(fx('ghostWalk').length, 1);
  e.IT.Orders.issue(e.w, e.h, { type: 'attack', target: d.id });
  e.run(1);
  assert.equal(fx('ghostBreak').length, 1);
  assert.equal(fx('ghostWalkEnd').length, 1); assert.equal(fx('ghostWalkEnd')[0].broken, true);
});

// ---------------------------------------------------------------- #47 attack-move
test('attack-move: attacks enemies met en route, then continues; idle at the end', () => {
  const e = env({}, { autoAttack: false });
  const d = e.dummy(400, 0);
  d.hp = d.maxHp = 400;   // dies quickly-ish
  e.IT.Orders.issue(e.w, e.h, { type: 'attack', x: 1200, y: 0 });
  e.run(3);
  assert.ok(e.evs('attackStart').length > 0);
  assert.ok(e.h.x < 700, 'stopped to fight, not yet past');
  e.w.remove(d);
  e.run(6);
  assert.ok(Math.abs(e.h.x - 1200) < 1.5, 'continued to the point: ' + e.h.x);
  assert.equal(e.h.orders.length, 0);
  assert.equal(e.evs('orderDone').pop().ok, true);
  assert.equal(e.h.anim.name, 'idle');
});
test('attack-move: fogged dummy becomes a target the moment it turns visible', () => {
  const e = env({}, { fog: true, autoAttack: false });
  const d = e.dummy(900, 0);
  d.visible = false;
  e.IT.Orders.issue(e.w, e.h, { type: 'attack', x: 1500, y: 0 });
  e.run(1);
  assert.equal(e.evs('attackStart').length, 0);
  d.visible = true;   // revealed mid-walk (vision system would do this)
  e.run(0.5);
  assert.equal(e.h.orders[0]._tgt, d.id);
  e.run(3);
  assert.ok(e.evs('attackStart').length > 0);
  assert.ok(d.hp < d.maxHp);
  // target hidden again -> continue to the point
  d.visible = false;
  e.run(0.2);
  assert.equal(e.h.orders[0]._tgt, null);
  e.run(6);
  assert.ok(Math.abs(e.h.x - 1500) < 1.5);
});
test('attack-move sticks to its target instead of flip-flopping', () => {
  const e = env({}, { autoAttack: false });
  const a = e.dummy(350, 0), b = e.dummy(300, 100);
  e.IT.Orders.issue(e.w, e.h, { type: 'attack', x: 1200, y: 0 });
  e.run(0.4);
  const first = e.h.orders[0]._tgt;
  assert.ok(first === a.id || first === b.id);
  e.run(2);
  assert.equal(e.h.orders[0]._tgt, first);
  assert.ok(e.evs('attack').length >= 1);
});

// ---------------------------------------------------------------- #40 Cataclysm
test('sun strike cast on the hero passes check and cataclysms with scepter on exort', () => {
  const e = env({ scepter: true, scepterOrb: 'exort' }, { autoAttack: false });
  const d = e.dummy(500, 0);
  e.slot('sunstrike');
  const order = { type: 'cast', ability: 'sunstrike', target: e.h.id };
  assert.equal(e.IT.Abilities.check(e.w, e.h, 'sunstrike', order), null);
  assert.equal(e.IT.Orders.issue(e.w, e.h, order), true);
  e.run(0.1);
  assert.equal(e.evs('fx').filter(x => x.name === 'cataclysm').length, 1);
  assert.equal(e.evs('fx').filter(x => x.name === 'sunstrikeBeam').length, e.IT.Values.get('invoker_sun_strike', 'cataclysm_count', e.h.ctx));
  assert.ok(Math.abs(e.h.cd.sunstrike - e.IT.Values.get('invoker_sun_strike', 'cataclysm_cooldown', e.h.ctx)) < 0.1);
  assert.ok(d);
});
test('sun strike on the hero without scepter: plain strike at the hero, no error', () => {
  const e = env({}, { autoAttack: false });
  e.slot('sunstrike');
  const order = { type: 'cast', ability: 'sunstrike', target: e.h.id };
  assert.equal(e.IT.Abilities.check(e.w, e.h, 'sunstrike', order), null);
  assert.equal(e.IT.Orders.issue(e.w, e.h, order), true);
  e.run(0.1);
  assert.equal(e.evs('fx').filter(x => x.name === 'cataclysm').length, 0);
  const b = e.evs('fx').filter(x => x.name === 'sunstrikeBeam');
  assert.equal(b.length, 1);
  assert.ok(Number.isFinite(b[0].x) && Math.abs(b[0].x - e.h.x) < 1 && Math.abs(b[0].y - e.h.y) < 1);
  e.run(2);
  assert.equal(e.evs('fx').filter(x => x.name === 'sunstrikeHit').length, 1);
});

// ---------------------------------------------------------------- audio events
test('audio fx: coldsnap proc, ice wall tick, meteor roll/burn, shiva hit', () => {
  const e = env({}, { autoAttack: false });
  const d = e.dummy(150, 0);
  d.hp = d.maxHp = 1e6;
  e.slot('coldsnap');
  e.IT.Orders.issue(e.w, e.h, { type: 'cast', ability: 'coldsnap', target: d.id });
  e.run(0.1);
  const fx = n => e.evs('fx').filter(x => x.name === n);
  assert.equal(fx('coldsnapProc').length, 0);
  assert.equal(fx('coldsnapFreeze').length, 1);
  e.run(1.2);   // freeze_cooldown elapsed
  e.IT.Combat.damage(e.w, { src: e.h.id, target: d, ability: 'attack', type: 'physical', amount: 500 });
  assert.equal(fx('coldsnapProc').length, 1);
  assert.equal(fx('coldsnapFreeze').length, 2);

  e.slot('icewall');
  e.IT.Orders.issue(e.w, e.h, { type: 'cast', ability: 'icewall' });
  e.run(3);
  assert.ok(fx('iceWallTick').length >= 1 || e.evs('fx').filter(x => x.name === 'iceWall').length === 1);

  const e2 = env({}, { autoAttack: false });
  const d2 = e2.dummy(500, 0); d2.hp = d2.maxHp = 1e6;
  e2.slot('chaosmeteor');
  e2.IT.Orders.issue(e2.w, e2.h, { type: 'cast', ability: 'chaosmeteor', x: 500, y: 0 });
  e2.run(5);
  const f2 = n => e2.evs('fx').filter(x => x.name === n);
  const nm = Math.round(e2.IT.Values.get('invoker_chaos_meteor', 'meteor_count', e2.h.ctx));
  assert.equal(f2('meteorLand').length, nm); assert.equal(f2('meteorRoll').length, nm); assert.equal(f2('meteorEnd').length, nm);
  assert.ok(f2('meteorHit').length >= 1);
  assert.ok(f2('meteorBurn').length >= 1);
});
test('audio fx: items', () => {
  const e = env({ items: ['shiva', 'meteorhammer', null, null, null, null] }, { autoAttack: false });
  const d = e.dummy(300, 0); d.hp = d.maxHp = 1e6;
  const fx = n => e.evs('fx').filter(x => x.name === n);
  e.IT.Orders.issue(e.w, e.h, { type: 'cast', ability: 'shiva' });
  e.run(2);
  assert.equal(fx('shivaBlast').length, 1); assert.equal(fx('shivaHit').length, 1);
  e.IT.Orders.issue(e.w, e.h, { type: 'cast', ability: 'meteorhammer', x: 300, y: 0 });
  e.run(8);
  assert.equal(fx('meteorChannel')[0].ability, 'meteorhammer');
  assert.equal(fx('meteorImpact')[0].ability, 'meteorhammer');
  assert.ok(fx('hammerBurn').length >= 1);
});

// ---------------------------------------------------------------- #43 responsiveness
test('no-target spell starts inside issue() even while walking; move spam cannot erase it', () => {
  const e = env();
  e.slot('ghostwalk');
  e.IT.Orders.issue(e.w, e.h, { type: 'move', x: 2000, y: 0 });
  e.run(0.3);
  assert.ok(e.h.x > 10);
  e.IT.Orders.issue(e.w, e.h, { type: 'cast', ability: 'ghostwalk' });
  assert.equal(e.evs('castStart').length, 1, 'cast point began synchronously');
  assert.equal(e.h.orders.length, 1, 'cast replaced the move');
  for (let i = 0; i < 5; i++) { e.IT.Orders.issue(e.w, e.h, { type: 'move', x: 2000, y: 0 }); e.run(0.02); }
  assert.ok(e.IT.Status.has(e.h, 'ghost'), 'ghost walk was cast despite move spam');
  assert.equal(e.evs('cast').filter(c => c.ability === 'ghostwalk').length, 1);
  e.run(0.3);
  const x1 = e.h.x; e.run(0.3);
  assert.ok(e.h.x > x1, 'moved again after the cast');
});
test('point spell: facing the target while moving casts at once; facing away turns first and a move cancels it', () => {
  const e = env();
  e.slot('chaosmeteor');
  e.IT.Orders.issue(e.w, e.h, { type: 'move', x: 2000, y: 0 });
  e.run(0.3);
  e.IT.Orders.issue(e.w, e.h, { type: 'cast', ability: 'chaosmeteor', x: 400, y: 10 });
  assert.equal(e.evs('castStart').filter(c => c.ability === 'chaosmeteor').length, 1, 'no turn needed: cast point starts immediately');
  e.run(0.2);
  assert.equal(e.evs('cast').filter(c => c.ability === 'chaosmeteor').length, 1);

  const f = env();
  f.slot('chaosmeteor');
  f.IT.Orders.issue(f.w, f.h, { type: 'move', x: 2000, y: 0 });
  f.run(0.3);
  f.IT.Orders.issue(f.w, f.h, { type: 'cast', ability: 'chaosmeteor', x: -900, y: 0 });
  assert.equal(f.evs('castStart').length, 0, 'must turn first');
  assert.equal(f.h.orders[0].type, 'cast');
  f.IT.Orders.issue(f.w, f.h, { type: 'move', x: 2000, y: 0 });   // player choice: cancels the turning cast
  f.run(1);
  assert.equal(f.evs('cast').filter(c => c.ability === 'chaosmeteor').length, 0);

  const g = env();
  g.slot('chaosmeteor');
  g.h.facing = 0;
  g.IT.Orders.issue(g.w, g.h, { type: 'cast', ability: 'chaosmeteor', x: -900, y: 0 });
  g.run(1);
  assert.equal(g.evs('cast').filter(c => c.ability === 'chaosmeteor').length, 1, 'turn then cast');
});
test('an order issued during a short cast point does not erase the cast', () => {
  const e = env();
  e.IT.Abilities.def('slowpt', { kind: 'spell', target: 'none', range: () => 0, castPoint: () => 0.08, manaCost: () => 1, cooldown: () => 1, cast() { e.casted = true; } });
  e.h.inv.slots = ['slowpt', null];
  e.IT.Orders.issue(e.w, e.h, { type: 'cast', ability: 'slowpt' });
  assert.equal(e.h.orders[0]._ph, 'point');
  e.IT.Orders.issue(e.w, e.h, { type: 'move', x: 500, y: 0 });
  assert.equal(e.h.orders.length, 2);
  e.run(0.5);
  assert.ok(e.casted, 'cast went off');
  assert.ok(e.h.x > 10, 'then the move ran');
  // Stop still cancels it
  e.casted = false; e.h.cd.slowpt = 0;
  e.IT.Orders.issue(e.w, e.h, { type: 'cast', ability: 'slowpt' });
  e.IT.Orders.issue(e.w, e.h, { type: 'stop' });
  e.run(0.3);
  assert.ok(!e.casted);
});
test('re-issuing the same move does not reset movement', () => {
  const e = env();
  e.IT.Orders.issue(e.w, e.h, { type: 'move', x: 1000, y: 0 });
  e.run(0.5);
  const o = e.h.orders[0], x0 = e.h.x, path = e.h.path.length;
  e.IT.Orders.issue(e.w, e.h, { type: 'move', x: 1000, y: 0 });
  assert.equal(e.h.orders[0], o); assert.equal(e.h.path.length, path);
  e.run(1 / 30);
  assert.ok(e.h.x > x0);
  assert.equal(e.evs('order').filter(x => x.order.type === 'move').length, 2, 'still reported for UI feedback');
});
test('issue() never silently rejects: always emits fail with a reason', () => {
  const e = env();
  const cases = [
    [{ type: 'bogus' }, 'unknown'],
    [{ type: 'move' }, 'badOrder'],
    [{ type: 'attack' }, 'badOrder'],
    [{ type: 'attack', target: 99999 }, 'gone'],
    [{ type: 'cast', ability: 'nope' }, 'unknown'],
    [{ type: 'cast', ability: 'icewall' }, 'notInvoked'],
    [{ type: 'cast', ability: 'sunstrike', x: 1 }, 'badOrder'],
  ];
  for (const [o, reason] of cases) {
    const n = e.evs('fail').length;
    assert.equal(e.IT.Orders.issue(e.w, e.h, o), false, JSON.stringify(o));
    const f = e.evs('fail');
    assert.equal(f.length, n + 1, JSON.stringify(o));
    assert.equal(f[f.length - 1].reason, reason);
  }
  e.IT.Status.add(e.w, e.h, 'stun', 1);
  const n = e.evs('fail').length;
  assert.equal(e.IT.Orders.issue(e.w, e.h, { type: 'move', x: 5, y: 5 }), false);
  assert.equal(e.evs('fail').length, n + 1);
  assert.equal(e.evs('fail').pop().reason, 'disabled');
});
test('A3: move during wind-up keeps the swing; Stop cancels it immediately', () => {
  const e = env();
  e.dummy(300, 0);
  e.run(0.1);
  assert.ok(e.h._wind);
  e.IT.Orders.issue(e.w, e.h, { type: 'move', x: -500, y: 0 });
  assert.ok(e.h._wind);                      // the wind-up survives a move order (it lands, then the hero walks)
  assert.ok(e.h.attack.next > 0);
  e.IT.Orders.issue(e.w, e.h, { type: 'stop' });
  assert.equal(e.h._wind, null);
  assert.equal(e.h.attack.next, 0);
});
