'use strict';
// CEO v6 WP1 (gameplay core): fail toasts, KV-derived foe hp + every step must hit, invisibility escape, tower timer math,
// boots everywhere, no pre-invoked spells (countdown = invoke time), fog always on, Sun Strike pierces BKB, fun turns in ranked.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const { rig } = require('./input_rig');
const FILES = ['js/data/i18n.js', 'js/data/i18n/s3.js', 'js/data/i18n/f1.js', 'js/data/i18n/scn.js',
  'js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/dotaworld.js', 'js/data/maps.js', 'js/data/difficulty.js',
  'js/data/combos.js', 'js/data/scenarios.js', 'js/data/ranks.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/stats.js', 'js/sim/towers.js', 'js/sim/ranked.js'];
const IT = load(FILES);
const R = IT.Ranked, SC = IT.SCENARIOS, DF = IT.DIFFICULTY;
const DIFFS = ['ian', 'easy', 'common', 'hard', 'bambam'];

function build(id, diff, seed, mode) {
  const run = R.create({ mode: mode || 'sandbox', diff: diff || 'easy', scenario: id, seed: seed || 5 });
  const pr = run.next(), m0 = IT.Maps.get('grounds');
  const w = IT.World.create({ seed: seed || 5, map: m0, loadout: pr.lo, fog: pr.fog });
  const h = IT.Hero.create(w, pr.lo, m0.spawns.hero.x, m0.spawns.hero.y);
  run.attach(w);
  return { run, w, h, pr };
}
const thaw = run => { for (let i = 0; i < 600 && run.frozen(); i++) run.tick(1 / 30); };
const step = (w, n) => { for (let i = 0; i < n; i++) w.step(); };
const world = lo => {
  lo = IT.Loadout.normalize(Object.assign({}, IT.Loadout.default(), lo || {}));
  const w = IT.World.create({ seed: 7, map: IT.Maps.get('grounds'), loadout: lo, fog: false, autoAttack: false });
  return { w, h: IT.Hero.create(w, lo, 0, 0), lo };
};
const big = (w, x, y) => { const d = IT.Units.spawnDummy(w, { x, y, preset: 'training', skin: 'pedro' }); d.hp = d.maxHp = 1e6; return d; };

// ---------------------------------------------------------------- 1. fail toast
test('1: every scenario fail reason + method detail has an EN and PT toast string', () => {
  const keys = ['caught', 'cross', 'seen', 'method', 'escaped', 'tower', 'died', 'time', 'method.attack', 'method.missing', 'method.burst', 'method.other'];
  for (const k of keys) {
    const en = IT.I18N.en['cfail.' + k], pt = IT.I18N.pt['cfail.' + k];
    assert.ok(en && pt, 'cfail.' + k);
    assert.notEqual(en, pt, 'cfail.' + k + ' translated');
  }
  assert.match(IT.I18N.en['cfail.method.missing'], /\{spells\}/);
});

// ---------------------------------------------------------------- 2. foe hp from KV + every step must hit
test('2: foe hp = HP_SHARE x KV step damage x hpMul (sun_snipe: one Sun Strike)', () => {
  const sc = SC.get('sun_snipe');
  assert.deepEqual(sc.steps.filter(s => s.a !== 'move' && s.a !== 'attack').map(s => s.a), ['sunstrike']);
  for (const id of DIFFS) {
    const df = DF.get(id), lo = R.prepare(sc, df).lo;
    const ss = IT.Values.get('invoker_sun_strike', 'damage', IT.Loadout.ctx(lo));
    assert.ok(ss > 0, 'KV damage');
    const want = Math.round(Math.max(100, R.HP_SHARE * ss * (df.hpMul != null ? df.hpMul : 1)));
    assert.equal(R.foeHp(sc, df, lo)[0], want, id);
    const m = build('sun_snipe', id); thaw(m.run);
    assert.equal(m.run.dummies[0].maxHp, want, id + ' spawned');
  }
  assert.equal(R.HP_SHARE, 0.85);
});

test('2: every kill scenario derives hp from its steps; the combo out-damages the foe', () => {
  for (const sc of SC) {
    if (!['kill', 'kill_with', 'killN'].includes(sc.obj.type)) continue;
    const df = DF.get('easy'), pr = R.prepare(sc, df), c = R.comboDamage(sc, df, pr.lo);
    if (!pr.hp) continue;   // no credited damage (legacy fixed-hp scenario)
    c.foes.forEach((v, i) => { if (v > 0) assert.ok(pr.hp[i] <= v, sc.id + ' foe ' + i + ' hp ' + pr.hp[i] + ' > combo ' + v); });
    assert.deepEqual(pr.need, R.needOf(sc), sc.id);
  }
});

test('2: a kill that skipped a step spell fails "method / missing" naming it', () => {
  const sc = SC.find(s => s.obj.type === 'kill' && !s.obj.how && R.needOf(s).length >= 2);
  assert.ok(sc, 'a kill scenario with >= 2 needed spells');
  const m = build(sc.id, 'easy'); thaw(m.run);
  const need = m.run.pr.need, got = [];
  m.w.on('comboFail', p => got.push(p));
  m.run.st.used.add(need[0]);
  for (const d of m.run.dummies.slice()) IT.Combat.damage(m.w, { src: m.h.id, target: d, amount: 1e7, type: 'pure', ability: need[0] });
  m.w.step();
  assert.equal(m.run.result.ok, false);
  assert.equal(m.run.result.reason, 'method');
  assert.equal(m.run.result.detail, 'missing');
  assert.deepEqual(m.run.result.spells, need.slice(1));
  assert.ok(got[0] && got[0].s && got[0].s.indexOf(IT.t('spell.' + need[1])) >= 0, 'toast names the missing spell: ' + (got[0] && got[0].s));
});

// ---------------------------------------------------------------- 3. invisibility escape
test('3: a ghosted hero 400 u from its last-seen spot is never caught in 12 s; the chaser searches there', () => {
  const sc = SC.get('ghost_escape'), t0 = sc.obj.time;
  sc.obj.time = 30;   // run past the scenario's own 9 s
  try {
    const m = build('ghost_escape', 'bambam'); thaw(m.run);
    const { w, h, run } = m, d = run.dummies[0];
    step(w, 6);                                                  // the chaser sees the hero
    assert.ok(R.heroSeen(w), 'visible at first');
    assert.equal(run.result, null);
    const L = { x: h.x, y: h.y };
    IT.Status.add(w, h, 'ghost', 60, {});
    // 400 u away from the last-seen spot, away from the chaser
    const ux = (h.x - d.x) / Math.hypot(h.x - d.x, h.y - d.y), uy = (h.y - d.y) / Math.hypot(h.x - d.x, h.y - d.y);
    let p = { x: L.x + ux * 400, y: L.y + uy * 400 };
    if (!w.map.walkable(p.x, p.y)) p = IT.Nav.nearestWalkable(w.map, p.x, p.y);
    h.x = p.x; h.y = p.y; IT.Orders.clear ? IT.Orders.clear(w, h) : (h.orders.length = 0);
    let near = Infinity;
    for (let i = 0; i < 12 * 30; i++) {
      w.step();
      assert.ok(!R.heroSeen(w), 'hidden at ' + w.t.toFixed(1));
      assert.ok(!(run.result && run.result.reason === 'caught'), 'caught at ' + w.t.toFixed(1));
      assert.notEqual(run.phase, 'result');
      near = Math.min(near, Math.hypot(d.x - L.x, d.y - L.y));
    }
    assert.ok(near < 200, 'the chaser went to the last-seen point (closest ' + near.toFixed(0) + ')');
  } finally { sc.obj.time = t0; }
});

test('3: visible contact within CAUGHT = caught', () => {
  const m = build('ghost_escape', 'easy'); thaw(m.run);
  const d = m.run.dummies[0];
  d.x = m.h.x + R.CAUGHT - 30; d.y = m.h.y;
  m.w.step();
  assert.equal(m.run.result && m.run.result.reason, 'caught');
});

test('3: a stun bolt cast is cancelled when the hero turns invisible', () => {
  const m = build('ghost_escape', 'easy'); thaw(m.run);
  const src = IT.Units.spawnDummy(m.w, { x: m.h.x + 500, y: m.h.y, preset: 'training', skin: 'pedro', scenario: { stunBolt: true } });
  let reason = null;
  m.w.on('bolt', p => { if (p.unit === src.id && p.phase === 'cancel') reason = p.reason; });
  for (let i = 0; i < 150 && !src.ai.bolt.active; i++) m.w.step();
  assert.ok(src.ai.bolt.active, 'the bolt cast started');
  IT.Status.add(m.w, m.h, 'ghost', 10, {});
  step(m.w, 3);
  assert.equal(src.ai.bolt.active, false);
  assert.equal(reason, 'lost');
});

// ---------------------------------------------------------------- 4. tower timer math
test('4: destroyTower limit: tCombo x 1.25 <= limit < tAttack at every tier (sim values)', () => {
  const towers = SC.filter(s => s.obj.type === 'destroyTower');
  assert.ok(towers.length >= 1);
  for (const sc of towers) for (const id of DIFFS) {
    const t = R.towerMath(sc, DF.get(id));
    assert.ok(t.tAttack > 0 && t.tCombo > 0, sc.id + ' ' + id);
    assert.ok(t.tCombo * 1.25 <= t.limit, sc.id + ' ' + id + ': combo ' + t.tCombo.toFixed(2) + ' x 1.25 > limit ' + t.limit);
    assert.ok(t.limit < t.tAttack, sc.id + ' ' + id + ': limit ' + t.limit + ' >= attack-only ' + t.tAttack.toFixed(2));
  }
});

// ---------------------------------------------------------------- 5. boots
test('5: every scenario carries boots or travels, <= 6 items', () => {
  for (const sc of SC) {
    const it = R.prepare(sc, DF.get('easy')).lo.items;
    assert.ok(it.includes('boots') || it.includes('travels'), sc.id + ' ' + it);
    assert.ok(it.length <= 6, sc.id + ' ' + it.length + ' items');
  }
});

// ---------------------------------------------------------------- 6. no pre-invoked; countdown = invoke time
test('6: nothing is pre-invoked; the hero starts with empty slots', () => {
  for (const sc of SC) {
    assert.ok(!(sc.hero && sc.hero.preinvoked), sc.id);
    const pre = R.prepare(sc, DF.get('easy')).lo.preinvoked;
    assert.ok(!(pre && pre.length), sc.id);
  }
  const m = build('sun_snipe', 'easy');
  assert.deepEqual(m.h.inv.slots.filter(Boolean), []);
});

test('6: 10 s countdown (ranked + fixed sandbox); invoking does not start it; invokeCd ticks', () => {
  assert.equal(R.COUNTDOWN, 10);
  for (const mode of ['sandbox', 'ranked']) {
    const m = mode === 'ranked' ? (() => {
      const run = R.create({ mode: 'ranked', diff: 'easy', seed: 3, rating: 1000 }), pr = run.next(), m0 = IT.Maps.get('grounds');
      const w = IT.World.create({ seed: 3, map: m0, loadout: pr.lo, fog: pr.fog }), h = IT.Hero.create(w, pr.lo, m0.spawns.hero.x, m0.spawns.hero.y);
      run.attach(w); return { run, w, h };
    })() : build('sun_snipe', 'easy');
    const { run, w, h } = m;
    run.tick(0);
    assert.equal(run.phase, 'countdown', mode);
    assert.ok(Math.abs(run.cd - 10) < 1e-6, mode + ' cd ' + run.cd);
    for (const ch of IT.GAME.SPELL_ORBS.sunstrike) IT.Invoke.orb(w, h, ch);
    IT.Invoke.invoke(w, h);
    assert.ok(h.inv.slots.includes('sunstrike'), mode + ' invoked during the countdown');
    assert.equal(run.phase, 'countdown');
    const cd = h.inv.invokeCd;
    run.tick(0.5);
    if (cd > 0) assert.ok(Math.abs(h.inv.invokeCd - Math.max(0, cd - 0.5)) < 1e-6, 'invokeCd ticks: ' + cd + ' -> ' + h.inv.invokeCd);
    assert.equal(run.phase, 'countdown');
  }
  assert.ok(IT.I18N.en['rk.countdown.hint'] && IT.I18N.pt['rk.countdown.hint'] && IT.I18N.en['rk.countdown.hint'] !== IT.I18N.pt['rk.countdown.hint']);
});

test('6: input: Q/W/E/R during a scenario countdown run without starting it; a move starts it', () => {
  const r = rig({ autoAttack: false });
  let skips = 0;
  r.In.hooks.inspect = () => r.w.paused;
  r.In.hooks.skip = () => { if (!r.w.paused) return false; r.w.paused = false; skips++; return true; };
  r.w.paused = true; r.w.ranked = { phase: 'countdown' };
  r.key('q'); r.key('w'); r.key('e');
  assert.equal(skips, 0); assert.equal(r.w.paused, true);
  assert.equal(r.h.inv.orbs.length, 3, 'orbs taken');
  r.key('r');
  assert.equal(skips, 0, 'invoke does not start the run');
  assert.ok(r.h.inv.slots.some(Boolean), 'invoked');
  r.click(2);
  assert.equal(skips, 1, 'a move starts it');
});

// ---------------------------------------------------------------- 7. fog always on
test('7: fog always on: prepare().fog, no difficulty fog field, no fog twist', () => {
  for (const sc of SC) for (const id of DIFFS) assert.equal(R.prepare(sc, DF.get(id)).fog, true, sc.id + ' ' + id);
  for (const id of DIFFS) assert.equal(DF.get(id).fog, undefined, id);
  assert.ok(!('fog' in R.TWISTS));
});

// ---------------------------------------------------------------- 8. Sun Strike / Cataclysm pierce BKB
test('8: Sun Strike KV pierces spell immunity and is pure; full damage through a magicImmune / enemy BKB foe', () => {
  const kv = IT.DOTA.abilities.invoker_sun_strike;
  assert.equal(kv.spellImmunity, 'ENEMIES_YES');
  assert.equal(String(kv.damageType).toLowerCase(), 'pure');
  const hit = immune => {
    const { w, h } = world({ heroLevel: 25 });
    const d = big(w, 600, 0);
    if (immune === 'full') IT.Status.add(w, d, 'magicImmune', 30, {});
    if (immune === 'reduce') IT.Status.add(w, d, 'magicImmune', 30, { data: { reduce: IT.Values.item(IT.GAME.ITEM_DOTA.bkb, 'spell_reduce') / 100 } });
    const hp0 = d.hp;
    IT.Abilities.get('sunstrike').cast(w, h, { x: d.x, y: d.y });
    step(w, 3 * 30);
    return hp0 - d.hp;
  };
  const base = hit(null);
  assert.ok(base > 0, 'Sun Strike lands');
  assert.equal(hit('full'), base, 'magic immune');
  assert.equal(hit('reduce'), base, 'enemy BKB');
});

test('8: Cataclysm strikes deal the same damage to a BKB foe', () => {
  let checked = 0;
  for (let seed = 1; seed <= 12 && checked < 2; seed++) {
    const hit = immune => {
      const lo = IT.Loadout.normalize(Object.assign({}, IT.Loadout.default(), { heroLevel: 25, scepter: true, scepterOrb: 'exort' }));
      const w = IT.World.create({ seed, map: IT.Maps.get('grounds'), loadout: lo, fog: false, autoAttack: false });
      const h = IT.Hero.create(w, lo, 0, 0), d = big(w, 700, 0);
      if (immune) IT.Status.add(w, d, 'magicImmune', 30, { data: { reduce: 0.6 } });
      const hp0 = d.hp;
      IT.Abilities.get('sunstrike').cast(w, h, { target: h.id, x: h.x, y: h.y });
      step(w, 4 * 30);
      return hp0 - d.hp;
    };
    const a = hit(false);
    if (!(a > 0)) continue;
    assert.equal(hit(true), a, 'seed ' + seed);
    checked++;
  }
  assert.ok(checked >= 1, 'some Cataclysm strike landed');
});

// ---------------------------------------------------------------- 9. fun turns
test('9: >= 4 fun-tagged scenarios in every 8-turn ranked run (50 seeds)', () => {
  assert.ok(SC.filter(R.isFun).length >= 8, 'fun pool');
  for (let seed = 1; seed <= 50; seed++) for (const rating of [0, 1500, 3000]) {
    const run = R.create({ mode: 'ranked', diff: 'easy', seed, rating });
    let fun = 0;
    for (let n = 0; n < R.TURNS; n++) { run.n = n; if (R.isFun(run.next().sc)) fun++; }
    assert.ok(fun >= R.FUN_TURNS, 'seed ' + seed + ' rating ' + rating + ': ' + fun);
  }
});

// ---------------------------------------------------------------- 10. v6 follow-ups: enemy Dust, Meteor Hammer in the tower math, Free Play fog
// Dust escape harness: the run sees the hero, then it turns invisible (Ghost Walk) and is put `off` u from the last-seen spot, away from the
// carrier. Returns the dust casts ({t, x, y}), the telegraph shouts, the last-seen spot, the carrier and the result.
function dustRun(id, diff, off, secs, after) {
  const sc = SC.get(id), t0 = sc.obj.time;
  sc.obj.time = 60;
  try {
    const m = build(id, diff); thaw(m.run);
    const { w, h, run } = m, d = run.dummies.find(u => u.items && u.items.some(s => s && s.id === 'dust'));
    const casts = [], shouts = [];
    w.on('itemUse', p => { if (p.ability === 'dust') { const u = w.get(p.unit); casts.push({ t: w.t, x: u.x, y: u.y, unit: p.unit }); } });
    w.on('telegraph', p => { if (p.item === 'dust') shouts.push(w.t); });
    for (let i = 0; i < 30 && !d.scn.lastSeen; i++) w.step();    // the chasers see the hero (the scripted chase records the spot)
    assert.ok(R.heroSeen(w) && d.scn.lastSeen && !d.scn.lastSeen.own, id + ': seen at first');
    IT.Status.add(w, h, 'ghost', 60, {});
    const L = { x: h.x, y: h.y }, Lseen = Object.assign({}, d.scn.lastSeen);
    if (off > 0) {
      const dx = h.x - d.x, dy = h.y - d.y, l = Math.hypot(dx, dy) || 1;
      let p = { x: L.x + dx / l * off, y: L.y + dy / l * off };
      if (!w.map.walkable(p.x, p.y)) p = IT.Nav.nearestWalkable(w.map, p.x, p.y);
      h.x = p.x; h.y = p.y;
    }
    h.orders.length = 0; h.path.length = 0;
    let seenAfter = false;
    for (let i = 0; i < secs * 30 && !run.result; i++) {
      w.step();
      if (casts.length && R.heroSeen(w)) seenAfter = true;
      if (after) after(m, casts);
    }
    return { m, d, casts, shouts, L, Lseen, seenAfter, result: run.result };
  } finally { sc.obj.time = t0; }
}

test('10: Dust only on the labelled escape scenarios (one carrier each), texts say so; ENEMY_ITEMS has dust', () => {
  assert.ok(IT.GAME.ENEMY_ITEMS.includes('dust'));
  const carriers = SC.filter(s => (s.units || []).some(u => (u.items || []).includes('dust'))).map(s => s.id).sort();
  assert.deepEqual(carriers, ['dust_escape', 'plateau_escape']);
  for (const id of carriers) {
    const sc = SC.get(id);
    assert.equal(sc.obj.type, 'escape', id);
    assert.equal(sc.units.filter(u => (u.items || []).includes('dust')).length, 1, id + ': exactly one carrier');
    assert.ok(sc.units.length >= 2, id);
    assert.match(sc.desc.en, /Dust/, id); assert.match(sc.desc.pt, /Dust/, id); assert.match(sc.flair.en, /Dust/, id);
  }
  assert.ok(IT.I18N.en['dc.dust.0'] && IT.I18N.pt['dc.dust.0'] && IT.I18N.en['dc.dust.0'] !== IT.I18N.pt['dc.dust.0']);
  const m = build('dust_escape', 'easy'); thaw(m.run);
  assert.ok(m.run.dummies[0].items.some(s => s && s.id === 'dust'), 'the HUD-readable enemy slot holds Dust');
});

test('10: Dust at the last-seen spot after reaction + telegraph: a hero inside the KV radius is revealed and caught', () => {
  const R0 = IT.Values.item(IT.GAME.ITEM_DOTA.dust, 'radius'), df = DF.get('common');
  assert.ok(R0 > 500, 'KV radius ' + R0);
  const r = dustRun('dust_escape', 'common', 500, 20);
  assert.equal(r.casts.length, 1, 'dusted once');
  const c = r.casts[0];
  assert.ok(Math.hypot(c.x - r.L.x, c.y - r.L.y) <= IT.GAME.ENEMY.dustAt + 1, 'cast at the last-seen spot (' + Math.hypot(c.x - r.L.x, c.y - r.L.y).toFixed(0) + ')');
  assert.ok(c.t >= r.Lseen.t + df.reaction + df.telegraph - 0.05, 'after reaction + telegraph: ' + c.t.toFixed(2) + ' vs lost ' + r.Lseen.t.toFixed(2));
  assert.equal(r.shouts.length, 1, 'telegraphed ("Dust!")');
  assert.ok(r.seenAfter, 'the dusted hero is seen');
  assert.ok(r.result && r.result.reason === 'caught', 'caught: ' + JSON.stringify(r.result));
  assert.ok(!r.d.items.some(s => s && s.id === 'dust'), 'the charge is consumed');
});

test('10: a hero that kept moving (500 u beyond the dust radius) is never revealed nor caught', () => {
  const R0 = IT.Values.item(IT.GAME.ITEM_DOTA.dust, 'radius');
  const r = dustRun('dust_escape', 'common', R0 + 500, 20, (m) => assert.ok(!IT.Status.revealed(m.h), 'revealed at ' + m.w.t.toFixed(1)));
  assert.equal(r.casts.length, 1, 'the carrier still dusts the spot');
  assert.ok(!r.seenAfter, 'never seen');
  assert.ok(!(r.result && r.result.reason === 'caught'), 'never caught');
});

test('10: Dust is used at most once per scenario; never on a visible hero or away from the spot', () => {
  // seen -> ghost -> dusted -> seen again -> ghost again: still one cast
  let again = false;
  const r = dustRun('dust_escape', 'common', 1600, 25, (m, casts) => {
    if (casts.length && !again && m.w.t > casts[0].t + 2) {
      again = true;
      IT.Status.remove(m.w, m.h, 'ghost'); IT.Status.remove(m.w, m.h, 'revealed');
      const d = m.run.dummies[0]; m.h.x = d.x + 300; m.h.y = d.y;    // in plain sight again, out of CAUGHT
      for (let i = 0; i < 14; i++) m.w.step();
      IT.Status.add(m.w, m.h, 'ghost', 60, {});
    }
  });
  assert.ok(again, 'the second loss happened');
  assert.equal(r.casts.length, 1);
  const m = build('dust_escape', 'common'); thaw(m.run);
  let n = 0; m.w.on('itemUse', p => { if (p.ability === 'dust') n++; });
  step(m.w, 10);
  const d = m.run.dummies[0];
  assert.equal(IT.Units.useDust(m.w, d, { x: d.x, y: d.y, t: -9 }), false, 'visible hero: no dust');
  IT.Status.add(m.w, m.h, 'ghost', 60, {});
  assert.equal(IT.Units.useDust(m.w, d, { x: d.x + 500, y: d.y, t: -9 }), false, 'not standing at the spot');
  assert.equal(n, 0);
});

// ---------------------------------------------------------------- 10. tower math with Meteor Hammer vs buildings
test('10: towerMath counts Meteor Hammer building damage (KV impact + burn x duration); tower_siege needs the full combo', () => {
  const sc = SC.get('tower_siege'), gi = k => IT.Values.item(IT.GAME.ITEM_DOTA.meteorhammer, k);
  for (const id of DIFFS) {
    const t = R.towerMath(sc, DF.get(id));
    assert.equal(t.hammer, gi('impact_damage_buildings') + gi('burn_dps_buildings') * gi('burn_duration'), id);
    const noHam = R.towerMath(Object.assign({}, sc, { steps: sc.steps.filter(s => s.a !== 'meteorhammer') }), DF.get(id));
    assert.ok(t.tCombo - t.setup < noHam.tCombo - noHam.setup, id + ': the hammer shortens the fight');
    assert.ok(t.tCombo * 1.25 <= t.limit && t.limit < t.tHammer && t.tHammer < t.tAttack,
      id + ': ' + [t.tCombo * 1.25, t.limit, t.tHammer, t.tAttack].map(v => v.toFixed(2)).join(' / '));
  }
  assert.ok(Math.abs(R.fightTime(100, 10, null) - 10) < 1e-9);
  assert.ok(Math.abs(R.fightTime(390, 100, { impact: 90, burn: 50, dur: 6, land: 0 }) - 2) < 1e-6, '90 impact + 2 burn ticks + 2 s of hits');
});

// ---------------------------------------------------------------- 10. Free Play fog toggle
test('10: the Free Play "Fog of war" checkbox is honoured only in Free Play; scenario runs keep fog on', () => {
  assert.equal(R.worldFog({ mode: 'sandbox', fog: false }, null), false);
  assert.equal(R.worldFog({ mode: 'sandbox', fog: true }, null), true);
  assert.equal(R.worldFog({ mode: 'sandbox' }, null), true, 'default on');
  for (const mode of ['ranked', 'infinite', 'sandbox']) {
    const sid = mode === 'sandbox' ? 'ghost_slip' : undefined;
    const run = R.create({ mode, diff: 'easy', scenario: sid, seed: 4 }), pr = run.next();
    assert.equal(R.worldFog({ mode, fog: false, scenario: sid || null }, pr), true, mode);
  }
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
  assert.match(src, /fog: IT\.Ranked\.worldFog\(opts, scn \? pr : null\)/, 'main.js start() uses worldFog');
  assert.match(src, /const isScn = o => o\.mode === 'ranked' \|\| o\.mode === 'infinite' \|\| \(o\.mode === 'sandbox' && !!o\.scenario\)/);
  const lo = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui', 'loadout.js'), 'utf8');
  assert.match(lo, /mode: 'sandbox', count: 1, fog: st\.fog/, 'Free Play passes the checkbox as opts.fog');
});
