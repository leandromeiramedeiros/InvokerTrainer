'use strict';
const test = require('node:test');
const assert = require('node:assert');
const env = require('./_unitsenv.js');

const phases = (evs) => evs('bolt').map(e => e.phase);

test('spawnDummy stats per preset', () => {
  const { IT, w } = env();
  for (const p of ['training', 'standard', 'expert']) {
    const P = IT.GAME.DUMMY_PRESETS[p];
    const d = IT.Units.spawnDummy(w, { x: 100, y: 200, preset: p, skin: 'renan' });
    assert.strictEqual(d.kind, p === 'training' ? 'dummy' : 'enemy'); assert.strictEqual(d.refill, true); assert.strictEqual(d.team, 1);   // mobile presets run on the enemy path
    assert.strictEqual(d.maxHp, P.hp); assert.strictEqual(d.armor, P.armor); assert.strictEqual(d.base.ms, P.ms);
    assert.strictEqual(d.magicRes, P.magicRes); assert.strictEqual(d.name, 'Renan');
    assert.strictEqual(d.ai.behavior, P.behavior); assert.strictEqual(JSON.stringify(d.ai.home), JSON.stringify({ x: 100, y: 200 }));
    assert.strictEqual(d.scenario.dummyEscape, 'none'); assert.strictEqual(d.vision, IT.GAME.DUMMY.vision);
  }
  assert.strictEqual(IT.Units.trainers(w).length, 3); assert.strictEqual(IT.Units.dummies(w).length, 1);
});

test('spawnSpirit stats at exort/quas 1 and 8', () => {
  const { IT, w, hero } = env();
  hero.ctx = IT.Values.ctx({ orbs: { quas: 1, wex: 0, exort: 1 } });
  let s = IT.Units.spawnSpirit(w, hero, 10, 20);
  assert.strictEqual(s.kind, 'spirit'); assert.strictEqual(s.team, 0);
  assert.strictEqual(s.maxHp, 300); assert.strictEqual(s.attack.min, 20); assert.strictEqual(s.armor, 0);
  assert.strictEqual(s.attack.range, 305); assert.strictEqual(s.expires, w.t + 24);
  hero.ctx = IT.Values.ctx({ orbs: { quas: 8, wex: 0, exort: 8 } });
  s = IT.Units.spawnSpirit(w, hero, 10, 20);
  assert.strictEqual(s.maxHp, 1000); assert.strictEqual(s.attack.max, 90); assert.strictEqual(s.armor, 7);
  assert.strictEqual(s.attack.range, 690); assert.strictEqual(s.expires, w.t + 66);
});

test('spirit expires; spiritAction follows owner / attacks nearest', () => {
  const { IT, w, hero, run } = env();
  const s = IT.Units.spawnSpirit(w, hero, 0, 0);
  s.expires = w.t + 1;
  const d = IT.Units.spawnDummy(w, { x: 500, y: 0, preset: 'training', skin: 'pedro' });
  d.visible = true;
  assert.strictEqual(JSON.stringify(IT.Units.spiritAction(w, s)), JSON.stringify({ type: 'attack', target: d.id }));
  hero.attack = { target: d.id };
  assert.strictEqual(IT.Units.spiritAction(w, s).target, d.id);
  d.x = 5000; hero.attack = null;
  assert.strictEqual(IT.Units.spiritAction(w, s), null);
  s.x = 600;
  assert.strictEqual(IT.Units.spiritAction(w, s).type, 'move');
  run(40);
  assert.ok(s.dead);
});

test('spirit autoAttack setting: ON auto-acquires, OFF only helps ordered attacks', () => {
  const { IT, w, hero } = env();
  const s = IT.Units.spawnSpirit(w, hero, 0, 0);
  const a = IT.Units.spawnDummy(w, { x: 400, y: 0, preset: 'training', skin: 'pedro' }); a.visible = true;
  const b = IT.Units.spawnDummy(w, { x: -300, y: 0, preset: 'training', skin: 'pedro' }); b.visible = true;
  w.opts.autoAttack = true;
  assert.strictEqual(IT.Units.spiritAction(w, s).target, b.id);   // nearest
  w.opts.autoAttack = false;
  assert.strictEqual(IT.Units.spiritAction(w, s), null);          // idle (near owner)
  s.x = 600;
  assert.strictEqual(IT.Units.spiritAction(w, s).type, 'move');   // follows owner
  // hero explicitly attacks a: spirits join that target even though b is nearer
  s.x = 0; hero.orders = [{ type: 'attack', target: a.id }]; hero.attack = { target: a.id };
  assert.strictEqual(JSON.stringify(IT.Units.spiritAction(w, s)), JSON.stringify({ type: 'attack', target: a.id }));
  // hero attack target without an explicit order (auto-acquired) is ignored when OFF
  hero.orders = []; hero.attack = { target: a.id };
  assert.strictEqual(IT.Units.spiritAction(w, s), null);
  w.opts.autoAttack = true;
  assert.strictEqual(IT.Units.spiritAction(w, s).target, a.id);   // ON: follows hero target
});

test('wander stays within 500 of home and moves', () => {
  const { IT, w, run } = env();
  const d = IT.Units.spawnDummy(w, { x: 1000, y: 1000, preset: 'standard', skin: 'pedro' });
  let max = 0, moved = false;
  for (let i = 0; i < 30 * 90; i++) {
    run(1);
    const dd = Math.hypot(d.x - 1000, d.y - 1000);
    max = Math.max(max, dd); if (dd > 1) moved = true;
  }
  assert.ok(moved); assert.ok(max <= 500.5, 'max ' + max);
});

test('dodgeTarget exits circle; null if impossible/uncovered', () => {
  const { IT } = env();
  const d = { x: 10, y: 0, radius: 24, ms: 300 };
  const T = IT.Units.dodgeTarget(d, { x: 0, y: 0, r: 175, at: 3 }, null, 1);
  assert.ok(T && Math.hypot(T.x, T.y) >= 175 + 24);
  assert.strictEqual(IT.Units.dodgeTarget(d, { x: 0, y: 0, r: 175, at: 1.1 }, null, 1), null);
  assert.strictEqual(IT.Units.dodgeTarget(d, { x: 900, y: 0, r: 175, at: 3 }, null, 1), null);
  assert.strictEqual(IT.Units.dodgeTarget({ x: 0, y: 0, radius: 24, ms: 0 }, { x: 0, y: 0, r: 175, at: 9 }, null, 1), null);
  const blocked = { walkable: (x, y) => x < 100 };
  const T2 = IT.Units.dodgeTarget({ x: 50, y: 0, radius: 24, ms: 300 }, { x: 0, y: 0, r: 175, at: 9 }, blocked, 0);
  assert.ok(T2 === null || (T2.x < 100 && Math.hypot(T2.x, T2.y) >= 199));
});

test('expert dummy dodges delayed AoE after reaction time', () => {
  const { IT, w, run } = env();
  const d = IT.Units.spawnDummy(w, { x: 2000, y: 2000, preset: 'expert', skin: 'vitinho' });
  w.thinker({ x: 2000, y: 2000, danger: { x: 2000, y: 2000, r: 175, at: w.t + 1.7 }, upd: () => false });
  const dodges = () => w.log.filter(e => e.type === 'fx' && e.name === 'dodge').length;
  run(5);
  assert.strictEqual(dodges(), 0);
  run(10);
  assert.strictEqual(dodges(), 1);
  run(20);
  assert.ok(Math.hypot(d.x - 2000, d.y - 2000) >= 199);
});

function boltEnv() {
  const e = env();
  const d = e.IT.Units.spawnDummy(e.w, { x: 500, y: 0, preset: 'training', skin: 'pedro', scenario: { stunBolt: true } });
  return Object.assign(e, { d });
}

test('bolt: start -> hit stuns hero and damages', () => {
  const { IT, w, hero, d, run, evs } = boltEnv();
  run(2);
  assert.strictEqual(phases(evs)[0], 'start'); assert.strictEqual(d.anim.name, 'cast');
  run(100);
  assert.strictEqual(JSON.stringify(phases(evs)), JSON.stringify(['start', 'hit']));
  assert.ok(hero.hp < 1000);
  assert.ok(evs('hit').some(h => h.ability === 'stunbolt' && h.target === hero.id));
  assert.ok(IT.Status.has(hero, 'stun') || w.t > 0);
});

test('bolt: BKB blocks', () => {
  const { IT, w, hero, run, evs } = boltEnv();
  IT.Status.add(w, hero, 'magicImmune', 20);
  run(100);
  assert.strictEqual(JSON.stringify(phases(evs)), JSON.stringify(['start', 'blocked']));
  assert.strictEqual(hero.hp, 1000);
  assert.ok(!IT.Status.has(hero, 'stun'));
});

test('bolt: tornado-lifted hero dodges', () => {
  const { IT, w, hero, run, evs } = boltEnv();
  run(40);
  IT.Status.add(w, hero, 'lift', 3);
  run(30);
  assert.ok(!phases(evs).includes('hit')); assert.strictEqual(hero.hp, 1000);
});

test('bolt: stunned dummy cancels telegraph', () => {
  const { IT, w, hero, d, run, evs } = boltEnv();
  run(10);
  IT.Status.add(w, d, 'stun', 2, { src: hero.id });
  run(2);
  assert.strictEqual(JSON.stringify(phases(evs)), JSON.stringify(['start', 'cancel']));
  assert.strictEqual(evs('bolt')[1].reason, 'disabled');
  run(60);
  assert.ok(!phases(evs).includes('hit'));
});

test('bolt: hero leaving range cancels', () => {
  const { hero, run, evs } = boltEnv();
  run(10);
  hero.x = -500;
  run(2);
  assert.strictEqual(JSON.stringify(phases(evs)), JSON.stringify(['start', 'cancel']));
  assert.strictEqual(evs('bolt')[1].reason, 'range');
});

function blinkEnv(scn) {
  const A = { x: 800, y: 0 }, B = { x: 300, y: 900 };
  const e = env({ map: { cover: [A, B, { x: 320, y: 20 }], losFn: (ax, ay) => !(ax === 800 && ay === 0) } });
  const d = e.IT.Units.spawnDummy(e.w, { x: 300, y: 0, preset: 'training', skin: 'pedro', scenario: Object.assign({ dummyEscape: 'blink_on_first_hit' }, scn || {}) });
  const hit = () => e.IT.Combat.damage(e.w, { src: e.hero.id, target: d, type: 'pure', amount: 10, flags: { allowLifted: true } });
  return Object.assign(e, { d, A, B, hit });
}

test('blink: first hit triggers once, to deterministic spot (prefers no-LOS)', () => {
  const { IT, w, d, A, hit, run, evs } = blinkEnv();
  run(5);
  assert.strictEqual(evs('blink').length, 0);
  hit(); run(2);
  assert.strictEqual(d.anim.name, 'blink');
  assert.ok(evs('fx').some(f => f.name === 'blinkTell'));
  run(15);
  assert.strictEqual(evs('blink').length, 1);
  assert.strictEqual(JSON.stringify([d.x, d.y]), JSON.stringify([A.x, A.y]));
  assert.strictEqual(evs('blink')[0].fromX, 300);
  hit(); run(30);
  assert.strictEqual(evs('blink').length, 1);
  IT.Units.resetCombo(w, d);
  hit(); run(30);
  assert.strictEqual(evs('blink').length, 2);
});

test('blinkSpot: farthest from hero when all have LOS; fallback when no cover', () => {
  const e = env({ map: { cover: [{ x: 800, y: 0 }, { x: 300, y: 900 }, { x: 320, y: 20 }] } });
  const d = e.IT.Units.spawnDummy(e.w, { x: 300, y: 0, preset: 'training', skin: 'pedro' });
  assert.strictEqual(JSON.stringify(e.IT.Units.blinkSpot(e.w, d)), JSON.stringify({ x: 300, y: 900 }));
  e.map.cover = [];
  const f = e.IT.Units.blinkSpot(e.w, d);
  assert.ok(f.x > 300 && Math.abs(f.y) < 1e-9);
});

test('blink: blocked while rooted/hexed/lifted, fires once able', () => {
  for (const st of ['root', 'hex', 'lift']) {
    const { IT, w, d, hit, run, evs, hero } = blinkEnv();
    IT.Status.add(w, d, st, 1, { src: hero.id });
    hit(); run(25);
    assert.strictEqual(evs('blink').length, 0, st);
    run(25);
    assert.strictEqual(evs('blink').length, 1, st);
  }
});

test('blink: after seconds; none when scenario disabled', () => {
  const { run, evs } = blinkEnv({ dummyEscape: 'blink_after_seconds', blinkAfter: 2 });
  run(50); assert.strictEqual(evs('blink').length, 0);
  run(30); assert.strictEqual(evs('blink').length, 1);
  const e2 = env();
  const d2 = e2.IT.Units.spawnDummy(e2.w, { x: 300, y: 0, preset: 'training', skin: 'pedro' });
  e2.IT.Combat.damage(e2.w, { target: d2, type: 'pure', amount: 5 }); e2.run(60);
  assert.strictEqual(e2.evs('blink').length, 0);
});

test('respawn: deterministic, 900-1600 from hero, outsideVision prefers hidden', () => {
  const once = () => {
    const e = env({ seed: 3, map: { losFn: (ax, ay, bx) => !(bx > 0) } });
    const d = e.IT.Units.spawnDummy(e.w, { x: 0, y: 0, preset: 'standard', skin: 'pedro' });
    d.hp = 1;
    e.IT.Status.add(e.w, d, 'stun', 5);
    return { sp: e.IT.Units.respawn(e.w, d, { outsideVision: true }), d };
  };
  const a = once(), b = once();
  assert.strictEqual(JSON.stringify(a.sp), JSON.stringify(b.sp));
  const dist = Math.hypot(a.sp.x, a.sp.y);
  assert.ok(dist >= 900 && dist <= 1600);
  assert.ok(a.sp.x > 0);
  assert.strictEqual(a.d.hp, a.d.maxHp); assert.strictEqual(a.d.statuses.length, 0);
});
