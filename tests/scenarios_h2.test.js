'use strict';
// H2: enemy vision 1800 (800 at night) + awareness as a notice delay, hold / escape scenarios, rand.jit on the early levels.
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
const DIFFS = ['ian', 'easy', 'common', 'hard', 'bambam'];
const NEW = ['bridge_hold', 'ghost_slip', 'jungle_hold', 'plateau_escape'];
const JIT_EXEMPT = new Set(['sun_flee']);   // a fleeing foe with a jittered start can run into a Radiant tower (that kill would count as 'method')
// v6 item 27: Bam-Bam's belief extrapolates the bot's straight-line run (walk away from the nearest foe) and Dusts the predicted spot:
// the naive escape is meant to lose there (tests/juke_v6.test.js); a real juke still clears it
const BELIEF_OK = new Set(['plateau_escape:bambam:s5']);

function build(id, diff, seed) {
  const run = R.create({ mode: 'practice', diff: diff || 'easy', scenario: id, seed: seed || 5 });
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
function play(id, diff, seed) { const m = build(id, diff, seed); thaw(m.run); assert.equal(m.run.phase, 'play', id); return m; }
/** idle hero until the run ends (or maxS) */
function idle(id, diff, seed, maxS) { const m = play(id, diff, seed); for (let i = 0; i < 30 * (maxS || 60) && m.run.phase === 'play'; i++) m.w.step(); return m; }

// ---------------------------------------------------------------- bot (same as tests/scenarios_v5.test.js)
function prep(w, h, ab) {
  if (!IT.GAME.SPELL_ORBS[ab] || h.inv.slots.includes(ab) || h.inv.invokeCd > 0) return;
  for (const ch of IT.GAME.SPELL_ORBS[ab]) IT.Invoke.orb(w, h, ch);
  IT.Invoke.invoke(w, h);
}
function bot(id, diff, seed, trace) {
  const m = build(id, diff, seed); thaw(m.run);
  const { w, h, run } = m, live = () => run.phase === 'play';
  const trail = [];
  const step = n => { for (let i = 0; i < (n || 1) && live(); i++) { const s0 = Math.floor(w.t); w.step(); if (trace && Math.floor(w.t) > s0) w.emit('trace1s', {}); trail.push(run.dummies.map(d => ({ x: d.x, y: d.y }))); if (trail.length > 10) trail.shift(); } };
  const al = () => run.dummies.filter(d => !d.dead);
  if (trace) { for (const n of ['kill', 'damage', 'cast', 'heroDown', 'towerDown', 'scnResult']) w.on(n, p => console.log(w.t.toFixed(2), n, JSON.stringify(p).slice(0, 140))); console.log('hero', h.x | 0, h.y | 0, run.dummies.map(d => [d.x | 0, d.y | 0, d.hp | 0].join(':')).join(' '), w.gate ? 'gate ' + (w.gate.x | 0) + ':' + (w.gate.y | 0) + ':' + w.gate.r : ''); w.on('trace1s', () => { console.log(w.t.toFixed(1), 'pos', run.dummies.map(d => d.dead ? '-' : (d.x | 0) + ':' + (d.y | 0) + '@' + (Math.hypot(d.x - h.x, d.y - h.y) | 0)).join(' ')); }); }
  let casts = 0; w.on('cast', p => { if (p.unit === h.id) casts++; });
  if (m.pr.sc.fail.includes('method')) h.autoAttack = false;   // a player going for a specific kill keeps auto-attack off (or holds Stop)
  for (const s of m.pr.sc.steps) {
    if (!live()) break;
    const until = w.t + (s.w || 0);
    while (live() && w.t < until - 1e-6) { prep(w, h, s.a); step(); }
    // Sun Strike on a Tornado-lifted foe: cast so the beam lands just after the drop (lift time left <= the 1.7 s delay)
    if (s.a === 'sunstrike') for (let k = 0; k < 30 * 5 && live(); k++) { const f = al().find(q => IT.Status.find(q, 'lift')); if (!f || IT.Status.find(f, 'lift').until - w.t <= 1.62) break; prep(w, h, s.a); step(); }
    for (let k = 0; k < 400 && IT.GAME.SPELL_ORBS[s.a] && !h.inv.slots.includes(s.a) && live(); k++) { prep(w, h, s.a); step(); }
    // near: hold until the target walks within that range (a defender waits for marchers to come to him)
    const pickT = () => { const f = al().filter(q => !IT.Status.find(q, 'lift')), d = f.length ? f : al(); return s.at === 'd1' ? (d[1] || d[0]) : (d[0] || al()[0]); };
    if (s.near) for (let k = 0; k < 30 * 10 && live(); k++) { const q = pickT(); if (!q || Math.hypot(q.x - h.x, q.y - h.y) <= s.near) break; prep(w, h, s.a); step(); }
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
    if (!t) break;
    if (s.a === 'move') { IT.Orders.issue(w, h, { type: 'move', x: t.x, y: t.y }); for (let k = 0; k < 30 * 8 && live() && Math.hypot(h.x - t.x, h.y - t.y) > 450; k++) step(); continue; }
    if (s.a === 'attack') { IT.Orders.issue(w, h, { type: 'attack', target: t.id }); continue; }
    IT.Orders.issue(w, h, { type: 'cast', ability: s.a, x: t.x, y: t.y, target: t.id });
    const c0 = casts;
    for (let k = 0; k < 30 * 8 && live() && casts === c0; k++) step();   // orders walk into range by themselves
    step(4);
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


// ---------------------------------------------------------------- BAD-5: vision + awareness
test('enemy hero vision is 1800 by day and 800 by night', () => {
  const E = IT.GAME.ENEMY;
  assert.equal(E.vision, 1800); assert.equal(E.visionNight, 800);
  for (const df of DIFFS) for (const e of build('fog_ambush', df).run.dummies) assert.equal(e.vision, 1800, df);
  const w = IT.World.create({ seed: 1, map: IT.Maps.get('grounds'), loadout: build('fog_ambush').pr.lo });
  assert.equal(IT.Units.spawnEnemy(w, { x: 0, y: 0 }).vision, 1800);
  w.night = true;
  assert.equal(IT.Units.spawnEnemy(w, { x: 0, y: 0 }).vision, 800);
  assert.equal(IT.GAME.DUMMY.vision, 800, 'the training dummy keeps its 800');
});

test('awareness is a notice delay scaled by tier, not a radius', () => {
  const D = IT.DIFFICULTY;
  const notice = DIFFS.map(d => D.get(d).notice);
  assert.ok(notice.every(n => n > 0), 'every tier has a notice time');
  for (let i = 1; i < notice.length; i++) assert.ok(notice[i] < notice[i - 1], 'harder tiers notice sooner');
  assert.equal(build('fog_ambush', 'hard').run.dummies[0].notice, D.get('hard').notice, 'the tier notice reaches the foe');
  // a foe in plain sight (hero idle) needs notice x (1 - awareness) seconds before it registers the hero
  for (const aw of [0, 0.5, 0.9]) {
    const m = play('fog_ambush', 'common'), e = m.run.dummies[0];
    e.awareness = aw; e.aware = false;
    let tSee = null, tAware = null;
    for (let i = 0; i < 30 * 12 && tAware == null; i++) {
      m.w.step();
      if (tSee == null && IT.Vision.teamSees(m.w, 1, m.h)) tSee = m.w.t;
      if (e.aware) tAware = m.w.t;
    }
    assert.ok(tSee != null, 'the foe sees an idle hero in the open (aw ' + aw + ')');
    const need = D.get('common').notice * (1 - aw);
    assert.ok(tAware != null, 'aware at aw ' + aw);
    assert.ok(tAware - tSee >= need - 0.35, 'aw ' + aw + ': aware after ' + (tAware - tSee).toFixed(2) + 's, delay ' + need.toFixed(2));
    assert.ok(tAware - tSee <= need + 0.5, 'aw ' + aw + ': and not much later');
  }
});

test("fog_ambush: 'seen' fires at common when the player stands in plain sight; sooner on harder tiers", () => {
  const t = {};
  for (const df of DIFFS) {
    const m = idle('fog_ambush', df, 5, 20), r = m.run.result;
    assert.ok(r && r.reason === 'seen', df + ' -> ' + (r && r.reason));
    t[df] = r.time;
  }
  assert.ok(t.common > 1 && t.common < 6, 'common: ' + t.common);
  for (let i = 1; i < DIFFS.length; i++) assert.ok(t[DIFFS[i]] <= t[DIFFS[i - 1]] + 1e-6, 'monotone ' + JSON.stringify(t));
});

test('invisibility, distance and night vision still stop a foe from noticing; the timer drains out of sight', () => {
  const noticed = (mut, secs) => {
    const m = play('fog_ambush', 'bambam'); mut(m);
    for (let i = 0; i < 30 * (secs || 8); i++) { m.w.step(); if (m.run.dummies[0].aware) return true; }
    return false;
  };
  const away = (m, d) => { const e = m.run.dummies[0], a = Math.atan2(m.h.y - e.y, m.h.x - e.x); m.h.x = e.x + Math.cos(a) * d; m.h.y = e.y + Math.sin(a) * d; };
  assert.equal(noticed(() => {}), true, 'baseline: an idle hero in the open is noticed');
  assert.equal(noticed(m => { m.h.invisible = true; }), false, 'invisible hero');
  assert.equal(noticed(m => away(m, 2600)), false, 'beyond 1800');
  assert.equal(noticed(m => { m.run.dummies[0].vision = 800; away(m, 1200); }), false, 'night vision 800');
  const m = play('fog_ambush', 'common'), e = m.run.dummies[0], need = e.notice * (1 - e.awareness);
  let k = 0; while (!(e.ai.notice > 0) && k++ < 300) m.w.step();
  assert.ok(e.ai.notice > 0 && !e.aware, 'timer filling');
  m.h.invisible = true;
  for (let i = 0; i < 30 * 3; i++) m.w.step();
  assert.ok(e.ai.notice < need * 0.5 && !e.aware, 'drained after 3 s hidden');
});

// ---------------------------------------------------------------- BAD-7: hold / escape scenarios
test('new hold / escape scenarios: well-formed, on v5 maps', () => {
  for (const id of NEW) {
    const sc = SC.find(s => s.id === id); assert.ok(sc, id);
    assert.ok(['hold', 'escape'].includes(sc.obj.type), id + ' ' + sc.obj.type);
    assert.ok(sc.obj.time >= 10, id);
    assert.ok(!sc.legacy && IT.Maps.get(sc.map), id + ' map');
    for (const k of ['name', 'flair', 'desc', 'win']) assert.ok(sc[k].en && sc[k].pt && sc[k].en !== sc[k].pt, id + ' ' + k);
    assert.ok(sc.desc.en.includes(String(sc.obj.time)) && sc.desc.pt.includes(String(sc.obj.time)), id + ' desc names the ' + sc.obj.time + ' s');
    assert.ok(sc.level >= 4 && sc.level <= 9, id);
  }
  assert.equal(NEW.filter(id => SC.find(s => s.id === id).obj.type === 'hold').length, 2);
  assert.equal(NEW.filter(id => SC.find(s => s.id === id).obj.type === 'escape').length, 2);
  assert.ok(SC.filter(s => s.obj.type === 'hold').length >= 2, "'hold' is no longer unused");
});

test('new scenarios: an idle hero loses every tier, the bot wins every tier (two seeds)', () => {
  for (const id of NEW) for (const df of DIFFS) {
    const r = idle(id, df, 5, 60).run.result;
    assert.ok(r && !r.ok, id + ' ' + df + ' idle must not win');
  }
  const bad = [];
  for (const id of NEW) for (const df of DIFFS) for (const seed of [5, 8]) {
    const r = bot(id, df, seed);
    if (!(r && r.ok) && !BELIEF_OK.has(id + ':' + df + ':s' + seed)) bad.push(id + ':' + df + ':s' + seed + ':' + (r && r.reason));
  }
  assert.deepEqual(bad, []);
});

test('fog_ambush stays winnable for the bot (ian..hard) now that foes see 1800', () => {
  for (const df of ['ian', 'easy', 'common', 'hard']) { const r = bot('fog_ambush', df, 5); assert.ok(r && r.ok, df + ' ' + (r && r.reason)); }
});

// ---------------------------------------------------------------- BAD-7: rand.jit
test('every level 1-4 scenario has rand.jit (except the documented exemption)', () => {
  const low = SC.filter(s => s.level <= 4 && !s.legacy);
  assert.ok(low.length >= 9, 'low-level scenarios: ' + low.length);
  // v6 item 27: juke scenarios use a fixed arena on purpose (rand.pick 1, posJit 0: the route is the puzzle; tests/juke_v6.test.js)
  for (const s of low) if (!JIT_EXEMPT.has(s.id) && (s.tags || []).indexOf('juke') < 0) assert.ok(s.rand && s.rand.jit > 0, s.id + ' jit');
});

test('jit moves the foes across seeds, stays deterministic per seed, and keeps spots valid', () => {
  const ids = SC.filter(s => s.level <= 4 && !s.legacy && s.rand && s.rand.jit > 0).map(s => s.id);
  assert.ok(ids.length >= 8, 'jittered scenarios: ' + ids.length);
  const pos = (id, seed) => { const m = build(id, 'easy', seed); return m.run.dummies.map(d => Math.round(d.x) + ',' + Math.round(d.y)).join('|'); };
  for (const id of ids) {
    assert.equal(pos(id, 7), pos(id, 7), id + ' deterministic');
    assert.ok(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(s => pos(id, s))).size >= 3, id + ' varies');
    for (let seed = 1; seed <= 8; seed++) {
      const m = build(id, 'easy', seed), map = m.w.map, ok = reach(map, m.h.x, m.h.y);
      for (const d of m.run.dummies) {
        assert.ok(map.walkable(d.x, d.y) && ok(d), id + ' s' + seed + ' foe walkable + reachable');
        assert.ok(!map.towers.some(t => t.team === 0 && Math.hypot(t.x - d.x, t.y - d.y) < 700), id + ' s' + seed + ' foe not under a Radiant tower');
      }
    }
  }
});

test('jit offsets a foe by at most about rand.jit from its unjittered spot', () => {
  const sc = SC.find(s => s.id === 'sleepy_target'); assert.ok(sc && sc.rand && sc.rand.jit > 0);
  const at = (jit, seed) => {
    const saved = sc.rand.jit; sc.rand.jit = jit;
    try { const d = build('sleepy_target', 'easy', seed).run.dummies[0]; return { x: d.x, y: d.y }; } finally { sc.rand.jit = saved; }
  };
  let moved = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const a = at(0, seed), b = at(sc.rand.jit, seed), dist = Math.hypot(a.x - b.x, a.y - b.y);
    assert.ok(dist <= sc.rand.jit * 2.5 + 100, 's' + seed + ' moved ' + Math.round(dist));
    if (dist > 5) moved++;
  }
  assert.ok(moved >= 5, 'jit changes the spot on most seeds: ' + moved);
});

test('hold / escape scenarios resolve foes on every seed', () => {
  for (const id of ['bridge_hold', 'jungle_hold', 'ghost_slip', 'plateau_escape']) for (let seed = 1; seed <= 6; seed++) {
    const m = build(id, 'common', seed), map = m.w.map, ok = reach(map, m.h.x, m.h.y);
    assert.ok(map.walkable(m.h.x, m.h.y), id + ' hero');
    for (const d of m.run.dummies) assert.ok(map.walkable(d.x, d.y) && ok(d), id + ' s' + seed);
  }
});
