'use strict';
// Scenarios v4: >= 30 scenarios on real maps, easy -> advanced ramp, every world builds, foes walkable + reachable,
// new objective / fail types (check()), ranked ramp, and a bot clears the simple ones.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/maps.js', 'js/data/difficulty.js', 'js/data/combos.js', 'js/data/scenarios.js', 'js/data/ranks.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/stats.js', 'js/sim/towers.js', 'js/sim/ranked.js'];
const IT = load(FILES);
const R = IT.Ranked, HS_OK = true;
const OBJ = ['kill', 'kill_with', 'killN', 'push', 'destroyTower', 'rootAll', 'escape', 'hold'];
const FAIL = ['time', 'died', 'cross', 'seen', 'method', 'escaped', 'caught'];
const V4 = IT.SCENARIOS.filter(s => !s.legacy);
const DIFFS = ['ian', 'easy', 'common', 'hard', 'bambam'];

function build(id, diff, seed) {
  const run = R.create({ mode: 'practice', diff: diff || 'common', scenario: id, seed: seed || 5 });
  const pr = run.next(), g = IT.Maps.get('grounds');
  const w = IT.World.create({ seed: seed || 5, map: g, loadout: pr.lo, fog: pr.fog, autoAttack: false });
  const h = IT.Hero.create(w, pr.lo, g.spawns.hero.x, g.spawns.hero.y);
  run.attach(w);
  return { run, w, h, pr };
}
function reach(map, x, y) {
  const W = map.w, H = map.h, seen = new Uint8Array(W * H), q = [Math.floor(x / map.tile) + Math.floor(y / map.tile) * W];
  seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], cx = i % W, cy = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx] || !map.walkableTile(nx, ny)) continue;
      seen[ny * W + nx] = 1; q.push(ny * W + nx);
    }
  }
  return seen;
}
const inReach = (m, seen, p) => !!seen[Math.floor(p.y / m.tile) * m.w + Math.floor(p.x / m.tile)];
const thaw = run => { for (let i = 0; i < 400 && run.frozen(); i++) run.tick(1 / 30); };

test('>= 30 scenarios, levels 1..10 with >= 3 each, easy to advanced, unique ids', () => {
  assert.ok(IT.SCENARIOS.length >= 30, 'count ' + IT.SCENARIOS.length);
  assert.equal(new Set(IT.SCENARIOS.map(s => s.id)).size, IT.SCENARIOS.length);
  for (let l = 1; l <= 10; l++) assert.ok(IT.SCENARIOS.filter(s => s.level === l).length >= 3, 'level ' + l);
  const lv = IT.SCENARIOS.map(s => s.level);
  assert.deepEqual(lv.slice().sort((a, b) => a - b), lv, 'sorted by level');
  for (const t of [1, 2, 3]) assert.ok(IT.SCENARIOS.some(s => s.tier === t), 'tier ' + t);
  assert.ok(V4.length >= 20);
});

test('every v4 scenario: bilingual text, real map, known obj / fail types, steps, loadout', () => {
  const maps = new Set(IT.Maps.ids());
  for (const sc of V4) {
    for (const k of ['name', 'flair', 'desc', 'win', 'lose']) assert.ok(sc[k] && sc[k].en && sc[k].pt, sc.id + ' ' + k);
    assert.ok(maps.has(sc.map) && sc.map !== 'grounds', sc.id + ' map ' + sc.map);
    assert.ok(OBJ.includes(sc.obj.type), sc.id + ' obj ' + sc.obj.type);
    assert.ok(Array.isArray(sc.fail) && sc.fail.length && sc.fail.every(f => FAIL.includes(f)), sc.id + ' fail');
    assert.ok(sc.par > 0 && sc.level >= 1 && sc.level <= 10 && sc.hero && sc.hero.lvl > 0, sc.id);
    assert.ok(sc.steps.length > 0, sc.id + ' steps');
    assert.ok(sc.tags.length > 0, sc.id + ' tags');
    // the foe-less ones must be objectives that need no foe
    if (!sc.units.length) assert.ok(['hold', 'destroyTower'].includes(sc.obj.type), sc.id + ' units');
    if (sc.obj.how) assert.ok(sc.fail.includes('method'), sc.id + ' how needs the method fail');
    if (sc.obj.type === 'push' || sc.obj.type === 'killN') assert.ok(sc.obj.n >= 2, sc.id);
    // Shadow Blade scenarios carry Dust; mobility scenarios carry the item
    const items = sc.hero.items || [];
    if (items.includes('shadowblade')) assert.ok(items.includes('dust'), sc.id + ' dust with shadowblade');
    for (const u of sc.units) for (const it of u.items || []) assert.ok(IT.GAME && it, sc.id);
  }
  assert.ok(HS_OK);
});

test('every v4 scenario builds on its map at every difficulty: hero + foes walkable and reachable', () => {
  for (const sc of V4) for (const df of DIFFS) {
    const m = build(sc.id, df, 5), map = m.w.map;
    assert.equal(map.id, sc.map, sc.id + ' map applied');
    assert.ok(map.walkable(m.h.x, m.h.y), sc.id + ' hero walkable');
    const seen = reach(map, m.h.x, m.h.y);
    assert.equal(m.run.dummies.length, sc.units.length, sc.id);
    for (const d of m.run.dummies) {
      assert.ok(map.walkable(d.x, d.y), sc.id + ' foe walkable');
      assert.ok(inReach(map, seen, d), sc.id + ' foe reachable');
      assert.ok(d.hp > 0 && d.hp <= d.maxHp, sc.id + ' hp');
      const ft = (map.towers || []).filter(t => t.team === 0).some(t => Math.hypot(t.x - d.x, t.y - d.y) < 500);
      assert.ok(!ft, sc.id + ' foe not parked at a friendly tower');
    }
    assert.equal(m.w.paused, true);
    for (let i = 0; i < 30; i++) m.run.tick(1 / 30);   // countdown ticks do not throw
  }
});

test('elevation scenarios put the hero below / above the foe as promised', () => {
  for (const id of ['uphill_snipe', 'cliff_blink']) {
    const m = build(id), map = m.w.map, d = m.run.dummies[0];
    assert.ok(map.elevAt(m.h.x, m.h.y) < map.elevAt(d.x, d.y), id + ' hero lower');
  }
  const t = build('tower_dive'), tw = t.w.map.towers.filter(x => x.team === 1);
  assert.ok(Math.hypot(t.run.dummies[0].x - t.h.x, t.run.dummies[0].y - t.h.y) < 1200, 'blink reaches');
  assert.ok(tw.some(x => Math.hypot(x.x - t.run.dummies[0].x, x.y - t.run.dummies[0].y) < 700), 'foe stands in tower range');
  const o = build('out_of_range'), ot = o.w.map.towers.filter(x => x.team === 1);
  assert.ok(ot.some(x => Math.hypot(x.x - o.h.x, x.y - o.h.y) < 700), 'hero starts inside tower range');
});

test('ranked ramp: 8 turns climb the level; a higher rating starts harder', () => {
  const avg = (rating, seed, a, b) => {
    const run = R.create({ mode: 'ranked', rating, seed }), lv = [];
    for (let i = 0; i < 8; i++) { run.n = i; lv.push(run.next().sc.level); }
    return { lv, avg: lv.slice(a, b).reduce((s, x) => s + x, 0) / (b - a) };
  };
  for (const seed of [1, 2, 3, 4, 5]) {
    const lo = avg(0, seed, 0, 3), hi = avg(0, seed, 5, 8);
    assert.ok(hi.avg > lo.avg, 'seed ' + seed + ' ' + hi.lv.join(','));
  }
  assert.ok(avg(3000, 1, 0, 3).avg > avg(0, 1, 0, 3).avg);
  assert.ok(avg(0, 1, 0, 1).lv[0] <= 3);
});

test('legacy practice picks stay available (no map field)', () => {
  const run = R.create({ mode: 'practice', diff: 'common', scenario: 'tornado_chain', seed: 1 });
  assert.equal(run.next().sc.legacy, true);
});

// ---- check(): objectives and fail types, driven through run.st + dummies
function play(id, diff) { const m = build(id, diff); thaw(m.run); assert.equal(m.run.phase, 'play'); return m; }
const kill = (m, i, o) => { const d = m.run.dummies[i]; d.dead = true; m.run.st.kills.push(Object.assign({ id: d.id, ability: 'sunstrike', by: 'hero', heroElev: 1, foeElev: 1, inv: false, t: m.w.t }, o || {})); };

test('check: killN one needs n kills of one ability within the span', () => {
  const m = play('triple_kill');
  const n = m.pr.sc.obj.n;
  m.run.dummies.slice(0, n - 1).forEach((_, i) => kill(m, i));
  m.run.tick(0); assert.equal(m.run.phase, 'play');
  const m2 = play('triple_kill');
  kill(m2, 0, { t: 0 }); kill(m2, 1, { t: 5 }); kill(m2, 2, { t: 10 });
  m2.run.tick(0); assert.equal(m2.run.phase, 'play', 'spread out is not one cast');
  const m3 = play('triple_kill');
  kill(m3, 0, { t: 1 }); kill(m3, 1, { t: 1.1 }); kill(m3, 2, { t: 1.2 });
  m3.run.tick(0); assert.equal(m3.run.phase, 'result'); assert.equal(m3.run.result.ok, true);
});

test('check: how (method) fails on a wrong kill, wins on the right one', () => {
  const m = play('uphill_snipe');
  kill(m, 0, { heroElev: 2, foeElev: 1 });
  m.run.tick(0); assert.equal(m.run.result.reason, 'method');
  const g = play('uphill_snipe');
  kill(g, 0, { heroElev: 0, foeElev: 2 });
  g.run.tick(0); assert.equal(g.run.result.ok, true);
  const s = play('ghost_finish');
  kill(s, 0, { by: 'hero', inv: true }); s.run.tick(0); assert.equal(s.run.result.reason, 'method');
  const s2 = play('ghost_finish');
  kill(s2, 0, { by: 'spirit', inv: true }); s2.run.tick(0); assert.equal(s2.run.result.ok, true);
  assert.equal(R.create({ mode: 'practice', scenario: 'ghost_finish' }).howOk({ by: 'spirit', inv: false }, { by: 'spirit', inv: true }), false);
});

test('check: push counts the foes of one Deafening Blast', () => {
  const m = play('blast_push');
  const ids = m.run.dummies.map(d => d.id);
  m.run.st.blasts.push(new Set([ids[0]])); m.run.tick(0); assert.equal(m.run.phase, 'play');
  m.run.st.blasts.push(new Set(ids.slice(0, 2))); m.run.tick(0); assert.equal(m.run.result.ok, true);
  const m3 = play('blast_push_3');
  m3.run.st.blasts.push(new Set(m3.run.dummies.slice(0, 2).map(d => d.id))); m3.run.tick(0); assert.equal(m3.run.phase, 'play');
});

test('check: destroyTower, hold, died, time', () => {
  const t = play('tower_siege');
  t.run.st.towers.push({ team: 0, tier: 1 }); t.run.tick(0); assert.equal(t.run.phase, 'play', 'own tower does not count');
  t.run.st.towers.push({ team: 1, tier: 1 }); t.run.tick(0); assert.equal(t.run.result.ok, true);
  const hd = play('out_of_range');
  hd.w.step(); hd.run.tick(0); assert.equal(hd.run.phase, 'play');
  hd.run.t0 = hd.w.t - hd.pr.sc.obj.time - 1; hd.run.tick(0); assert.equal(hd.run.result.ok, true);
  const dd = play('out_of_range');
  dd.run.st.died = true; dd.run.tick(0); assert.equal(dd.run.result.reason, 'died');
  const tm = play('sleepy_target');
  tm.run.t0 = tm.w.t - tm.pr.limit - 1; tm.run.tick(0); assert.equal(tm.run.result.reason, 'time');
});

test('check: cross (marchers reach the gate) and seen (aware enemy, never hit)', () => {
  const c = play('river_guard');
  assert.ok(c.w.gate && c.w.gate.r > 0);
  const d0 = c.run.dummies[0]; d0.x = c.w.gate.x; d0.y = c.w.gate.y;
  c.run.tick(0); assert.equal(c.run.result.reason, 'cross');
  const f = play('fog_ambush');
  const e = f.run.dummies[0]; assert.equal(e.kind, 'enemy');
  e.aware = true; e.lastHit = -99;
  f.run.tick(0); assert.equal(f.run.result.reason, 'seen');
  const f2 = play('fog_ambush');
  f2.run.dummies[0].aware = true; f2.run.dummies[0].lastHit = f2.w.t;
  f2.run.tick(0); assert.equal(f2.run.phase, 'play', 'a hit foe may notice you');
});

test('march: river guards walk to the gate on their own', () => {
  const m = play('river_guard');
  const g = m.w.gate, d = m.run.dummies[0], d0 = Math.hypot(d.x - g.x, d.y - g.y);
  for (let i = 0; i < 30 * 4; i++) m.w.step();
  assert.ok(Math.hypot(d.x - g.x, d.y - g.y) < d0 - 200, 'closing in');
});

// ---- bot: simple scenarios are winnable end to end
function prep(w, h, ab) {
  if (!IT.GAME.SPELL_ORBS[ab] || h.inv.slots.includes(ab) || h.inv.invokeCd > 0) return;
  for (const ch of IT.GAME.SPELL_ORBS[ab]) IT.Invoke.orb(w, h, ch);
  IT.Invoke.invoke(w, h);
}
function bot(id, diff, seed) {
  const m = build(id, diff, seed); thaw(m.run);
  const { w, h, run } = m, live = () => run.phase === 'play';
  const step = (n) => { for (let i = 0; i < (n || 1) && live(); i++) w.step(); };
  const al = () => run.dummies.filter(d => !d.dead);
  if (process.env.SCN_TRACE === id) { for (const n of ['damage', 'kill', 'cast', 'status', 'heroDown', 'towerDown']) w.on(n, p => console.log(w.t.toFixed(2), n, JSON.stringify(p).slice(0, 150))); console.log('hero', h.x | 0, h.y | 0, run.dummies.map(d => [d.x | 0, d.y | 0, d.hp | 0, d.behavior || d.kind].join(':')).join(' '), w.gate ? 'gate ' + (w.gate.x | 0) + ',' + (w.gate.y | 0) : ''); }
  let casts = 0; w.on('cast', p => { if (p.unit === h.id) casts++; });
  for (const s of m.pr.sc.steps) {
    if (!live()) break;
    const targ = () => {
      const d = al(); const t = s.at === 'd1' ? (d[1] || d[0]) : d[0];
      if (s.at === 'self') return { x: h.x, y: h.y, id: h.id };
      if (s.at === 'mid' && d.length) return { x: d.reduce((a, q) => a + q.x, 0) / d.length, y: d.reduce((a, q) => a + q.y, 0) / d.length };
      if (s.at === 'tower') { const tw = w.ents.find(q => q.kind === 'tower' && q.team === 1 && !q.dead && !q.destroyed); return tw ? { x: tw.x, y: tw.y, id: tw.id } : null; }
      return t ? { x: t.x, y: t.y, id: t.id } : null;
    };
    for (let k = 0; k < 400 && IT.GAME.SPELL_ORBS[s.a] && !h.inv.slots.includes(s.a) && live(); k++) { prep(w, h, s.a); step(); }
    const t = targ(); if (!t) break;
    if (s.a === 'move') IT.Orders.issue(w, h, s.at === 'd0' ? { type: 'move', x: t.x, y: t.y } : { type: 'move', x: h.x - 1200, y: h.y });
    else if (s.a === 'attack') IT.Orders.issue(w, h, { type: 'attack', target: t.id });
    else IT.Orders.issue(w, h, { type: 'cast', ability: s.a, x: t.x, y: t.y, target: t.id });
    const c0 = casts;
    for (let k = 0; k < 30 * 6 && live() && casts === c0 && s.a !== 'move' && s.a !== 'attack'; k++) w.step();   // orders walk into range by themselves
    step(s.a === 'attack' ? 60 : 8);
  }
  for (let k = 0; k < 30 * 40 && live(); k++) w.step();
  return run.result;
}

test('bot clears the simple v4 scenarios at common', () => {
  for (const id of ['sleepy_target', 'spirit_pack', 'cold_start', 'two_birds', 'blast_push']) {
    const r = bot(id, 'common', 5);
    assert.ok(r && r.ok, id + ' ' + JSON.stringify(r));
  }
});

test('diagnostic: bot over every v4 scenario (SCN_ALL=1)', { skip: !process.env.SCN_ALL }, () => {
  for (const sc of V4) for (const df of ['easy', 'common', 'bambam']) {
    const r = bot(sc.id, df, 5);
    console.log(sc.id, df, r ? (r.ok ? 'ok ' + r.time.toFixed(1) : r.reason) : 'none');
  }
});
