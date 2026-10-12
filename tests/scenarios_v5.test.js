'use strict';
// Scenarios v5: >= 30 scenarios on real v5 maps (with their towers), arena / tower / structure relative spots, easy -> advanced ramp,
// objective + fail checks, ranked ramp / twists (seeded), and a bot that clears every scenario it can script at easy.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const FILES = ['js/data/i18n.js', 'js/data/i18n/s3.js', 'js/data/i18n/f1.js', 'js/data/i18n/scn.js',
  'js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/dotaworld.js', 'js/data/maps.js', 'js/data/difficulty.js',
  'js/data/combos.js', 'js/data/scenarios.js', 'js/data/ranks.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/stats.js', 'js/sim/towers.js', 'js/sim/ranked.js', 'js/ui/hudsteps.js'];
const IT = load(FILES);
const R = IT.Ranked, SC = IT.SCENARIOS;
const OBJ = ['kill', 'kill_with', 'killN', 'push', 'destroyTower', 'rootAll', 'escape', 'hold', 'reach'];
const FAIL = ['time', 'died', 'cross', 'seen', 'method', 'escaped', 'caught', 'tower'];
const DIFFS = ['ian', 'easy', 'common', 'hard', 'bambam'];
// scenarios the scripted bot cannot play fairly (foes that read the hero and run / dodge with items: the bot has no chase logic)
const NO_BOT = new Set([]);   // ids the scripted bot cannot play (none so far)

function build(id, diff, seed, mode) {
  const run = R.create({ mode: mode || 'practice', diff: diff || 'easy', scenario: id, seed: seed || 5 });
  const pr = run.next(), m0 = IT.Maps.get('grounds');
  const w = IT.World.create({ seed: seed || 5, map: m0, loadout: pr.lo, fog: pr.fog });
  const h = IT.Hero.create(w, pr.lo, m0.spawns.hero.x, m0.spawns.hero.y);
  run.attach(w);
  return { run, w, h, pr };
}
function reach(map, x, y) {
  const W = map.w, H = map.h, seen = new Uint8Array(W * H), q = [map.toTile(x) + map.toTile(y) * W];
  seen[q[0]] = 1;
  for (let k = 0; k < q.length; k++) {
    const i = q[k], cx = i % W, cy = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx] || !map.walkableTile(nx, ny)) continue;
      seen[ny * W + nx] = 1; q.push(ny * W + nx);
    }
  }
  return p => !!seen[map.toTile(p.y) * W + map.toTile(p.x)];
}
const thaw = run => { for (let i = 0; i < 600 && run.frozen(); i++) run.tick(1 / 30); };

// ---------------------------------------------------------------- data
test('>= 30 scenarios, levels 1..10 with >= 3 each, sorted easy -> advanced, unique ids', () => {
  assert.ok(SC.length >= 30, 'count ' + SC.length);
  assert.equal(new Set(SC.map(s => s.id)).size, SC.length);
  for (let l = 1; l <= 10; l++) assert.ok(SC.filter(s => s.level === l).length >= 3, 'level ' + l);
  const lv = SC.map(s => s.level);
  assert.deepEqual(lv.slice().sort((a, b) => a - b), lv);
  for (const s of SC) assert.equal(s.tier, s.level <= 3 ? 1 : s.level <= 7 ? 2 : 3, s.id);
});

test('every scenario: bilingual texts, known obj / fail, steps, tags, loadout', () => {
  for (const sc of SC) {
    for (const k of ['name', 'flair', 'desc', 'win']) {
      if (sc.legacy && k === 'win') continue;
      assert.ok(sc[k] && sc[k].en && sc[k].pt && sc[k].en !== sc[k].pt || (sc[k] && sc[k].en && sc[k].pt), sc.id + ' ' + k);
    }
    if (!sc.legacy) for (const k of ['name', 'flair', 'desc', 'win']) assert.notEqual(sc[k].pt, sc[k].en, sc.id + ' ' + k + ' translated');
    assert.ok(sc.tip && sc.goal, sc.id + ' HUD aliases');
    assert.ok(OBJ.includes(sc.obj.type), sc.id + ' obj');
    assert.ok(sc.fail.length && sc.fail.every(f => FAIL.includes(f)), sc.id + ' fail');
    if (sc.obj.how || (sc.obj.type === 'killN' && sc.obj.one)) assert.ok(sc.fail.includes('method'), sc.id + ' method fail');
    if (sc.fail.includes('method') && !sc.legacy) assert.ok(sc.lose && sc.lose.en && sc.lose.pt, sc.id + ' method lose text');
    if (sc.fail.includes('cross')) assert.ok(sc.gate, sc.id + ' cross needs a gate');
    if (['push', 'killN'].includes(sc.obj.type)) assert.ok(sc.obj.n >= 2 && sc.units.length >= sc.obj.n, sc.id);
    if (!sc.units.length) assert.ok(['hold', 'destroyTower'].includes(sc.obj.type), sc.id);
    assert.ok(sc.par > 0 && sc.hero.lvl > 0 && sc.tags.length && sc.steps.length, sc.id);
    assert.ok(IT.HudSteps.derive(sc).length === sc.steps.length, sc.id + ' steps feed the HUD');
    const lo = R.prepare(sc, IT.DIFFICULTY.get('easy')).lo;
    for (const it of sc.hero.items || []) assert.ok(lo.items.includes(it), sc.id + ' item ' + it);
    for (const u of sc.units) for (const it of u.items || []) assert.ok(IT.GAME.ENEMY_ITEMS.includes(it), sc.id + ' foe item ' + it);
    for (const s of sc.steps) assert.ok(IT.HudSteps.kindOf(s.a), sc.id + ' step ' + s.a);
  }
});

test('specs never hold absolute coordinates', () => {
  const abs = s => s && (s.x != null || s.y != null);
  for (const sc of SC) {
    assert.ok(!abs(sc.hero.at) && !abs(sc.gate), sc.id);
    for (const u of sc.units) assert.ok(!abs(u), sc.id);
  }
});

// ---------------------------------------------------------------- maps + spots
test('every scenario map exists (a real v5 map, not the bare grounds) and has arenas', () => {
  const ids = new Set(IT.Maps.ids());
  for (const sc of SC) {
    assert.ok(ids.has(sc.map) && sc.map !== 'grounds', sc.id + ' map ' + sc.map);
    assert.ok(IT.Maps.get(sc.map).spawns.arenas.length > 50, sc.id);
  }
  assert.ok(new Set(SC.map(s => s.map)).size >= 15, 'map variety');
  assert.ok(SC.filter(s => IT.Maps.get(s.map).towers.length).length >= 15, 'tower maps');
});

test('where-specs resolve to a real arena (no silent fallback) on every scenario', () => {
  for (const sc of SC) {
    const m = build(sc.id, 'easy', 5), w = m.w;
    const hs = sc.hero.at;
    if (hs && hs.where) assert.ok(R.arenas(w, Object.assign({}, hs, { not: (hs.not || []).concat(hs.towers ? [] : ['dtower']) }), w.map.spawns.hero).length, sc.id + ' hero');
    if (sc.gate && sc.gate.where) assert.ok(R.arenas(w, sc.gate, m.h).length, sc.id + ' gate');
    sc.units.forEach((u, i) => {
      if (!u.where) return;
      const q = Object.assign({}, u, { not: (u.not || []).concat(u.towers ? [] : ['rtower']) });
      // the unit was placed from the hero's start, before any hero movement
      assert.ok(R.arenas(w, q, { x: m.h.x, y: m.h.y }).length, sc.id + ' unit ' + i);
    });
  }
});

test('every scenario builds on its map at every difficulty: towers spawned, hero + foes walkable and reachable', () => {
  for (const sc of SC) for (const df of DIFFS) {
    const m = build(sc.id, df, 5), map = m.w.map, h = m.h;
    assert.equal(map.id, sc.map, sc.id);
    assert.equal(m.w.ents.filter(e => e.kind === 'tower').length, map.towers.length, sc.id + ' towers');
    assert.ok(map.walkable(h.x, h.y), sc.id + ' hero walkable');
    const ok = reach(map, h.x, h.y);
    // v6 item 27: a unit with minDf only spawns from that tier up
    assert.equal(m.run.dummies.length, sc.units.filter(u => !u.minDf || DIFFS.indexOf(df) >= DIFFS.indexOf(u.minDf)).length, sc.id);
    for (const d of m.run.dummies) {
      assert.equal(d.kind, 'enemy', sc.id);
      assert.ok(map.walkable(d.x, d.y) && ok(d), sc.id + ' foe walkable + reachable');
      assert.ok(d.hp > 0 && d.hp === d.maxHp, sc.id + ' hp');
      if (!sc.units[0].towers) assert.ok(!map.towers.some(t => t.team === 0 && Math.hypot(t.x - d.x, t.y - d.y) < 700), sc.id + ' foe not under a Radiant tower');
    }
    if (!sc.hero.at || !sc.hero.at.tower) assert.ok(!map.towers.some(t => t.team === 1 && Math.hypot(t.x - h.x, t.y - h.y) < 720), sc.id + ' hero not under a Dire tower');
    if (sc.gate) assert.ok(m.w.gate && map.walkable(m.w.gate.x, m.w.gate.y) || m.w.gate.r >= 260, sc.id + ' gate');
    for (let i = 0; i < 20; i++) m.run.tick(1 / 30);
  }
});

test('relational spots keep their promise', () => {
  const el = (m, p) => m.w.map.elevAt(p.x, p.y);
  for (const id of ['uphill_snipe', 'cliff_blink']) { const m = build(id); assert.ok(el(m, m.h) < el(m, m.run.dummies[0]), id + ' hero below'); }
  const hh = build('highground_hold'); assert.ok(el(hh, hh.h) > el(hh, hh.run.dummies[0]), 'highground_hold hero above');
  for (const id of ['river_rune', 'sun_flee']) { const m = build(id); assert.ok(m.w.map.spawns.arenas.some(a => a.tags.includes('river') && Math.hypot(a.x - m.h.x, a.y - m.h.y) < 260), id + ' hero in the river'); }
  const dtw = m => m.w.ents.filter(e => e.kind === 'tower' && e.team === 1);
  const td = build('tower_dive'), d = td.run.dummies[0];
  assert.ok(dtw(td).some(t => Math.hypot(t.x - d.x, t.y - d.y) < 700), 'tower_dive: foe under the tower');
  assert.ok(!dtw(td).some(t => Math.hypot(t.x - td.h.x, t.y - td.h.y) < 760), 'tower_dive: hero starts outside its range');
  assert.ok(Math.hypot(d.x - td.h.x, d.y - td.h.y) < 1350, 'tower_dive: one blink (+ a step) away');
  const tt = build('tower_tornado');
  assert.ok(dtw(tt).some(t => Math.hypot(t.x - tt.run.dummies[0].x, t.y - tt.run.dummies[0].y) < 700), 'tower_tornado: foe in tower range');
  assert.ok(Math.hypot(tt.run.dummies[0].x - tt.h.x, tt.run.dummies[0].y - tt.h.y) < 2000, 'tower_tornado: in Tornado range');
  for (const id of ['river_guard', 'river_guard_2']) {
    const m = build(id), g = m.w.gate;
    assert.ok(m.w.map.spawns.arenas.some(a => a.tags.includes('river') && Math.hypot(a.x - g.x, a.y - g.y) < 50), id + ' gate in the river');
    for (const u of m.run.dummies) assert.ok(Math.hypot(u.x - m.h.x, u.y - m.h.y) > Math.hypot(g.x - m.h.x, g.y - m.h.y), id + ' foes beyond the gate');
  }
  const pt = build('pit_trap'), pf = pt.run.dummies[0];   // v6: the foe starts on the bank and jukes INTO the pit (levels_v6.test.js)
  assert.ok(!R.inPit(pt.w.map, pf.x, pf.y) && pf.juke && R.inPit(pt.w.map, pf.juke.x, pf.juke.y), 'pit_trap: foe on the bank, juke target in the pit');
});

test('seeded placement: same seed -> same spots; rand.pick varies them across seeds', () => {
  const pos = (id, seed) => { const m = build(id, 'easy', seed); return [m.h.x, m.h.y].concat(...m.run.dummies.map(d => [Math.round(d.x), Math.round(d.y)])).join(','); };
  for (const id of ['sleepy_target', 'two_birds', 'fog_ambush']) {
    assert.equal(pos(id, 7), pos(id, 7), id);
    assert.ok(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(s => pos(id, s))).size > 1, id + ' varies');
  }
});

// ---------------------------------------------------------------- ranked
test('ranked loads the scenario map with its towers, swaps map per turn', () => {
  const run = R.create({ mode: 'ranked', rating: 0, seed: 3 });
  const pr = run.next(), m0 = IT.Maps.get('grounds');
  const w = IT.World.create({ seed: 3, map: m0, loadout: pr.lo, fog: pr.fog });
  IT.Hero.create(w, pr.lo, m0.spawns.hero.x, m0.spawns.hero.y);
  let swaps = 0; w.on('mapChange', () => swaps++);
  run.attach(w);
  const seen = [];
  for (let n = 0; n < 8 && !run.ended; n++) {
    assert.equal(w.map.id, run.pr.sc.map, 'turn ' + n);
    assert.equal(w.ents.filter(e => e.kind === 'tower' && !e.dead).length, w.map.towers.length, 'turn ' + n + ' towers');
    const hd = R.hud(w); assert.ok(hd.mapName && hd.level === run.pr.sc.level, 'hud map + level');
    seen.push(run.pr.sc.map);
    run.skip(); run.tick(0);
    run.result = null; run.phase = 'result'; run.hold = 0; run.tick(1 / 30);   // jump to the next turn
  }
  assert.ok(new Set(seen).size >= 3, 'several maps: ' + seen.join(','));
  assert.ok(swaps >= 3);
});

test('ranked ramp: 8 turns climb the level; higher rating starts harder; deterministic with a seed', () => {
  const lv = (rating, seed) => { const run = R.create({ mode: 'ranked', rating, seed }), out = []; for (let i = 0; i < 8; i++) { run.n = i; out.push(run.next()); } return out; };
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const l = lv(0, seed).map(p => p.sc.level);
    const a = (l[0] + l[1] + l[2]) / 3, b = (l[5] + l[6] + l[7]) / 3;
    assert.ok(b > a + 2, 'seed ' + seed + ': ' + l.join(','));
    assert.ok(l[0] <= 2, 'starts easy ' + l.join(','));
    assert.equal(new Set(lv(0, seed).map(p => p.sc.id)).size, 8, 'no repeats in a run');
    const x = lv(0, seed).map(p => p.sc.id + ':' + p.twist).join(), y = lv(0, seed).map(p => p.sc.id + ':' + p.twist).join();
    assert.equal(x, y, 'same seed, same run');
  }
  const avg = (r, s) => lv(r, s).slice(0, 3).reduce((t, p) => t + p.sc.level, 0) / 3;
  assert.ok(avg(4000, 1) > avg(0, 1) + 2);
});

test('ranked twists: 1-2 per stage of 3 turns, compatible with the scenario, applied to foes', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const run = R.create({ mode: 'ranked', rating: 0, seed });
    const tt = run.twistTurns;
    assert.equal(tt.filter(n => n < 3).length, 1, 'first stage');
    for (const s0 of [3, 6]) { const c = tt.filter(n => n >= s0 && n < s0 + 3).length; assert.ok(c >= 1 && c <= 2, 'stage ' + s0); }
    for (let i = 0; i < 8; i++) {
      run.n = i; const pr = run.next();
      if (pr.twist) { assert.ok(R.TWISTS[pr.twist].ok(pr.sc), pr.twist + ' ok'); if (pr.twist === 'fog') assert.equal(pr.fog, true); }
      else if (tt.includes(i)) assert.ok(!Object.keys(R.TWISTS).some(k => R.TWISTS[k].ok(pr.sc)), 'a twist turn only skips when none fits');
    }
  }
  assert.equal(R.create({ mode: 'practice', seed: 1 }).next().twist, null, 'practice: no twists');
  // tough + swift reach the spawned foes
  const base = build('sleepy_target', 'easy', 5).run.dummies[0];
  for (const [tw, f] of [['tough', d => d.maxHp / base.maxHp], ['swift', d => d.base.ms / base.base.ms]]) {
    const run = R.create({ mode: 'practice', diff: 'easy', scenario: 'sleepy_target', seed: 5 }), pr = run.next(); pr.twist = tw;
    const m0 = IT.Maps.get('grounds'), w = IT.World.create({ seed: 5, map: m0, loadout: pr.lo }); IT.Hero.create(w, pr.lo, 0, 0); run.attach(w);
    assert.ok(Math.abs(f(run.dummies[0]) - 1.15) < 0.02, tw);
  }
});

// ---------------------------------------------------------------- check(): objectives + fails
function play(id, diff) { const m = build(id, diff); thaw(m.run); assert.equal(m.run.phase, 'play', id); return m; }
// (v6: the step spells are marked as landed; the missing-hit fail is covered in ceo_v6_core.test.js)
const kill = (m, i, o) => { const d = m.run.dummies[i]; d.dead = true; for (const a of m.run.pr.need) m.run.st.used.add(a); m.run.st.kills.push(Object.assign({ id: d.id, ability: 'sunstrike', by: 'hero', heroElev: 1, foeElev: 1, inv: false, t: m.w.t }, o || {})); };
const res = m => (m.run.tick(0), m.run.result);

test('check: kill / kill_with / killN one-cast / method', () => {
  const k = play('sleepy_target'); kill(k, 0); assert.equal(res(k).ok, true);
  const kw = play('river_rune'); kill(kw, 0, { ability: 'sunstrike' }); assert.equal(res(kw).reason, 'method');
  const kw2 = play('river_rune'); kill(kw2, 0, { ability: 'chaosmeteor' }); assert.equal(res(kw2).ok, true);
  const t1 = play('triple_kill'); kill(t1, 0, { t: 1 }); kill(t1, 1, { t: 1.1 }); assert.equal(res(t1), null, 'two of three: still playing');
  kill(t1, 2, { t: 1.2 }); assert.equal(res(t1).ok, true);
  const t2 = play('triple_kill'); kill(t2, 0, { t: 0 }); kill(t2, 1, { t: 5 }); kill(t2, 2, { t: 10 }); assert.equal(res(t2).reason, 'method', 'three casts');
  const t3 = play('two_birds'); kill(t3, 0, { t: 1, ability: 'sunstrike' }); kill(t3, 1, { t: 1.1, ability: 'chaosmeteor' }); assert.equal(res(t3).reason, 'method', 'two spells');
});

test('check: how = low ground / spirit while invisible', () => {
  const a = play('uphill_snipe'); kill(a, 0, { heroElev: 2, foeElev: 1 }); assert.equal(res(a).reason, 'method');
  const b = play('uphill_snipe'); kill(b, 0, { heroElev: 0, foeElev: 2 }); assert.equal(res(b).ok, true);
  const c = play('ghost_finish'); kill(c, 0, { by: 'hero', inv: true }); assert.equal(res(c).reason, 'method');
  const d = play('ghost_finish'); kill(d, 0, { by: 'spirit', inv: false }); assert.equal(res(d).reason, 'method');
  const e = play('ghost_finish'); kill(e, 0, { by: 'spirit', inv: true }); assert.equal(res(e).ok, true);
});

test('check: push counts the foes of one Deafening Blast', () => {
  const m = play('blast_push'), ids = m.run.dummies.map(d => d.id);
  m.run.st.blasts.push(new Set([ids[0]])); assert.equal(res(m), null);
  m.run.st.blasts.push(new Set(ids.slice(0, 2))); assert.equal(res(m).ok, true);
  const m3 = play('blast_push_3'); m3.run.st.blasts.push(new Set(m3.run.dummies.slice(0, 2).map(d => d.id))); assert.equal(res(m3), null, '2 of 3');
});

test('check: destroyTower / died / time / tower range / escaped', () => {
  const t = play('tower_siege');
  t.run.st.towers.push({ team: 0, tier: 1 }); assert.equal(res(t), null, 'own tower does not count');
  t.run.st.towers.push({ team: 1, tier: 1 }); assert.equal(res(t).ok, true);
  const d = play('tower_dive'); d.run.died = true; assert.equal(res(d).reason, 'died');
  const tm = play('sleepy_target'); tm.run.t0 = tm.w.t - tm.pr.limit - 1; assert.equal(res(tm).reason, 'time');
  const tr = play('tower_tornado'); assert.equal(res(tr), null);
  const tw = tr.w.ents.find(e => e.kind === 'tower' && e.team === 1); tr.h.x = tw.x + 300; tr.h.y = tw.y; assert.equal(res(tr).reason, 'tower');
  const es = play('sun_flee'), f = es.run.dummies[0]; f.x = es.h.x + 2500; f.y = es.h.y; assert.equal(res(es).reason, 'escaped');
});

test('check: cross (a marcher reaches the gate), seen = noticed before our first touch (never hit)', () => {
  const c = play('river_guard'); assert.ok(c.w.gate.r > 0);
  const d0 = c.run.dummies[0]; d0.x = c.w.gate.x; d0.y = c.w.gate.y; assert.equal(res(c).reason, 'cross');
  const f = play('fog_ambush'); const e = f.run.dummies[0];
  e.aware = true; e.lastHit = -1e9; assert.equal(res(f).reason, 'seen');
  const f2 = play('fog_ambush'); f2.run.st.hit = f2.w.t; f2.run.dummies[0].aware = true; assert.equal(res(f2), null, 'touched first: being noticed is fine');
  // the old WIP bug: lastHit < -50 was read as "never hit"; v5 tracks our first touch instead
  const f3 = play('fog_ambush'); f3.run.dummies[0].lastHit = 0; f3.run.dummies[0].aware = true; assert.equal(res(f3).reason, 'seen', 'lastHit alone does not count as our touch');
  const f4 = play('fog_ambush'); f4.w.emit('status', { target: f4.run.dummies[0].id, status: 'lift', src: f4.h.id, ability: 'tornado' }); f4.run.dummies[0].aware = true;
  assert.equal(res(f4), null, 'a Tornado lift is a touch');
});

test('march: guards walk to the gate on their own', () => {
  for (const id of ['river_guard', 'highground_hold']) {
    const m = play(id), g = m.w.gate, d = m.run.dummies[0], d0 = Math.hypot(d.x - g.x, d.y - g.y);
    for (let i = 0; i < 30 * 4; i++) m.w.step();
    assert.ok(Math.hypot(d.x - g.x, d.y - g.y) < d0 - 250, id + ' closing in');
  }
});

// ---------------------------------------------------------------- bot
function prep(w, h, ab) {
  if (!IT.GAME.SPELL_ORBS[ab] || h.inv.slots.includes(ab) || h.inv.invokeCd > 0) return;
  for (const ch of IT.GAME.SPELL_ORBS[ab]) IT.Invoke.orb(w, h, ch);
  IT.Invoke.invoke(w, h);
}
function bot(id, diff, seed, trace) {
  const m = build(id, diff, seed);
  // v6: nothing is pre-invoked; the countdown is for invoking the opening spells (orbs + Invoke do not start the round)
  const open = m.pr.sc.steps.map(s => s.a).filter((a, i, l) => IT.GAME.SPELL_ORBS[a] && l.indexOf(a) === i).slice(0, 2).reverse();
  for (let i = 0; i < 600 && m.run.frozen(); i++) { for (const a of open) prep(m.w, m.h, a); m.run.tick(1 / 30); }
  const { w, h, run } = m, live = () => run.phase === 'play';
  const trail = [];
  const step = n => { for (let i = 0; i < (n || 1) && live(); i++) { const s0 = Math.floor(w.t); w.step(); if (trace && Math.floor(w.t) > s0) w.emit('trace1s', {}); trail.push(run.dummies.map(d => ({ x: d.x, y: d.y }))); if (trail.length > 10) trail.shift(); } };
  const al = () => run.dummies.filter(d => !d.dead);
  if (trace) { for (const n of ['kill', 'damage', 'cast', 'heroDown', 'towerDown', 'scnResult']) w.on(n, p => console.log(w.t.toFixed(2), n, JSON.stringify(p).slice(0, 140))); console.log('hero', h.x | 0, h.y | 0, run.dummies.map(d => [d.x | 0, d.y | 0, d.hp | 0].join(':')).join(' '), w.gate ? 'gate ' + (w.gate.x | 0) + ':' + (w.gate.y | 0) + ':' + w.gate.r : ''); w.on('trace1s', () => { console.log(w.t.toFixed(1), 'pos', run.dummies.map(d => d.dead ? '-' : (d.x | 0) + ':' + (d.y | 0) + '@' + (Math.hypot(d.x - h.x, d.y - h.y) | 0)).join(' ')); }); }
  let casts = 0, tornT = null; w.on('cast', p => { if (p.unit === h.id) { casts++; if (p.ability === 'tornado') tornT = w.t; } });
  if (m.pr.sc.fail.includes('method')) h.autoAttack = false;   // a player going for a specific kill keeps auto-attack off (or holds Stop)
  for (const s of m.pr.sc.steps) {
    if (!live()) break;
    const until = w.t + (s.w || 0);
    while (live() && w.t < until - 1e-6) { prep(w, h, s.a); step(); }
    // Sun Strike on a Tornado-lifted foe: cast so the beam lands just after the drop (lift time left <= the 1.7 s delay)
    // (a Tornado still on its way: wait for the lift first)
    if (s.a === 'sunstrike' && tornT != null && w.t - tornT < 3) for (let k = 0; k < 30 * 3 && live() && !al().some(q => IT.Status.find(q, 'lift')); k++) { prep(w, h, s.a); step(); }
    if (s.a === 'sunstrike') for (let k = 0; k < 30 * 5 && live(); k++) { const f = al().find(q => IT.Status.find(q, 'lift')); if (!f || IT.Status.find(f, 'lift').until - w.t <= 1.62) break; prep(w, h, s.a); step(); }
    for (let k = 0; k < 400 && IT.GAME.SPELL_ORBS[s.a] && !h.inv.slots.includes(s.a) && live(); k++) { prep(w, h, s.a); step(); }
    // near: hold until the target walks within that range (a defender waits for marchers to come to him)
    const pickT = () => { const f = al().filter(q => !IT.Status.find(q, 'lift')), d = f.length ? f : al(); return s.at === 'd1' ? (d[1] || d[0]) : (d[0] || al()[0]); };
    if (s.near) for (let k = 0; k < 30 * 10 && live(); k++) { const q = pickT(); if (!q || Math.hypot(q.x - h.x, q.y - h.y) <= s.near) break; prep(w, h, s.a); step(); }
    // a foe under BKB: wait it out before a magic spell (Sun Strike is pure and goes through)
    if (s.a !== 'sunstrike' && s.a !== 'move' && s.a !== 'attack') for (let k = 0; k < 30 * 10 && live(); k++) { const q = pickT(); if (!q || !IT.Status.has(q, 'magicImmune')) break; prep(w, h, s.a); step(); }
    // Sun Strike on a running foe: give it up to 3 s to stop (it flees to a spot, then stands), then lead what is left
    if (s.a === 'sunstrike' && s.at === 'd0') for (let k = 0; k < 90 && live(); k++) {
      const q = pickT(), o = q && trail[0] && trail[0][run.dummies.indexOf(q)];
      if (!q || !o || Math.hypot(q.x - o.x, q.y - o.y) / Math.max(1, trail.length - 1) * 30 < 40) break;
      step();
    }
    // v6 fog is always on: a foe out of sight cannot be targeted, so walk toward it until it shows (a player scouts the same way)
    const unitT = (IT.Abilities.get(s.a) || {}).target === 'unit';   // point spells go into the fog fine
    if (unitT && (s.at === 'd0' || s.at === 'd1')) for (let k = 0; k < 30 * 8 && live(); k++) {
      const q = pickT(); if (!q || q.visible) break;
      if (k % 6 === 0) IT.Orders.issue(w, h, { type: 'move', x: q.x, y: q.y });
      prep(w, h, s.a); step();
    }
    const aim = () => {
      const d = al(), t0 = pickT();
      let t = t0 ? { x: t0.x, y: t0.y, id: t0.id } : null;
      if (s.at === 'self') t = { x: h.x, y: h.y, id: h.id };
      else if (s.at === 'mid' && d.length) t = { x: d.reduce((a, q) => a + q.x, 0) / d.length, y: d.reduce((a, q) => a + q.y, 0) / d.length };
      else if (s.at === 'gate' && w.gate) t = { x: w.gate.x, y: w.gate.y };
      else if (s.at === 'tower') { const tw = w.ents.filter(q => q.kind === 'tower' && q.team === 1 && !q.dead).sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0]; t = tw ? { x: tw.x, y: tw.y, id: tw.id } : null; }
      else if (s.at === 'lead' && t0) {
        const o = trail[0] && trail[0][run.dummies.indexOf(t0)] || t0, T = Math.max(1, trail.length - 1) / 30;
        t = { x: t0.x + (t0.x - o.x) / T * 1.75, y: t0.y + (t0.y - o.y) / T * 1.75 };
      }
      return t;
    };
    const t = aim();
    if (!t) break;
    if (s.a === 'move') { IT.Orders.issue(w, h, { type: 'move', x: t.x, y: t.y }); for (let k = 0; k < 30 * 8 && live() && Math.hypot(h.x - t.x, h.y - t.y) > 450; k++) step(); continue; }
    if (s.a === 'attack') { IT.Orders.issue(w, h, { type: 'attack', target: t.id }); continue; }
    const c0 = casts;   // before the order: an instant item cast fires inside issue()
    IT.Orders.issue(w, h, { type: 'cast', ability: s.a, x: t.x, y: t.y, target: t.id });
    // orders walk into range by themselves; a point cast on moving foes is re-aimed while the hero walks (v6: nothing pre-placed)
    const moving = s.at === 'mid' || s.at === 'd0' || s.at === 'd1' || s.at === 'lead';
    for (let k = 0; k < 30 * 8 && live() && casts === c0; k++) {
      step();
      if (moving && k % 6 === 5 && casts === c0 && h.orders[0] && h.orders[0].type === 'cast' && !h.orders[0]._ph) { const q = aim(); if (q) IT.Orders.issue(w, h, { type: 'cast', ability: s.a, x: q.x, y: q.y, target: q.id }); }
    }
    step(4);
  }
  // v6: the hero does not auto-acquire in a combo kill; after the steps a player right-clicks what is left (plain kill objectives)
  if (m.pr.sc.obj.type === 'kill' && !m.pr.sc.obj.how) for (let k = 0; k < 30 * 20 && live(); k += 15) {
    const f = al().sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
    if (f && f.visible && !(h.orders[0] && h.orders[0].type === 'attack' && h.orders[0].target === f.id)) IT.Orders.issue(w, h, { type: 'attack', target: f.id });
    step(15);
  }
  // escape: keep walking away from the nearest foe
  if (m.pr.sc.obj.type === 'escape') for (let k = 0; k < 30 * 20 && live(); k += 10) {
    const f = al().sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
    if (f) { const a = Math.atan2(h.y - f.y, h.x - f.x), p = IT.Nav.nearestWalkable(w.map, h.x + Math.cos(a) * 500, h.y + Math.sin(a) * 500) || h; IT.Orders.issue(w, h, { type: 'move', x: p.x, y: p.y }); }
    step(10);
  }
  for (let k = 0; k < 30 * 60 && live(); k++) step();
  return run.result;
}

test('bot clears every scriptable scenario at easy', () => {
  const bad = [];
  for (const sc of SC) {
    if (NO_BOT.has(sc.id) || (sc.tags || []).indexOf('juke') >= 0) continue;   // juke: needs belief + day/night + the spot bot (tests/juke_v6.test.js)
    const r = bot(sc.id, 'easy', 5);
    if (!r || !r.ok) bad.push(sc.id + ':' + (r ? r.reason : 'none'));
  }
  assert.deepEqual(bad, []);
  assert.ok(SC.length - NO_BOT.size >= 30);
});

test('diagnostic: bot over every scenario (SCN_ALL=1, SCN_ONLY=id, SCN_TRACE=1)', { skip: !process.env.SCN_ALL && !process.env.SCN_ONLY }, () => {
  for (const sc of SC) {
    if (process.env.SCN_ONLY && process.env.SCN_ONLY !== sc.id) continue;
    for (const df of (process.env.SCN_DIFF || 'easy,common,bambam').split(',')) {
      const r = bot(sc.id, df, +(process.env.SCN_SEED || 5), !!process.env.SCN_TRACE);
      console.log(sc.level, sc.id, df, r ? (r.ok ? 'ok ' + r.time.toFixed(1) : r.reason + ' ' + r.time.toFixed(1)) : 'none');
    }
  }
});
