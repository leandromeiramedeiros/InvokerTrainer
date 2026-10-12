'use strict';
// v6 item 11: hero level per scenario (base level, seeded +-1 roll, feasibility clamp, foe hp from the rolled loadout, HUD "LV n");
// v6 item 17: pit_trap juke (the foe Blinks / Force Staffs into Roshan's pit, the kill only counts inside it).
// The bot is the scenarios_v5.test.js one; bot() also returns the run so a test can read its kills / casts.
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
const DF = IT.DIFFICULTY;
let build = function (id, diff, seed, mode) {
  const run = R.create({ mode: mode || 'practice', diff: diff || 'easy', scenario: id, seed: seed || 5 });
  const pr = run.next(), m0 = IT.Maps.get('grounds');
  const w = IT.World.create({ seed: seed || 5, map: m0, loadout: pr.lo, fog: pr.fog });
  const h = IT.Hero.create(w, pr.lo, m0.spawns.hero.x, m0.spawns.hero.y);
  run.attach(w);
  return { run, w, h, pr };
};
const thaw = run => { for (let i = 0; i < 600 && run.frozen(); i++) run.tick(1 / 30); };

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
// bot() with the run kept: m.first = first hero cast time per ability
function botRun(id, diff, seed) {
  let m = null; const b0 = build;
  build = (...a) => { m = b0(...a); m.first = {}; m.w.on('cast', p => { if (p.unit === m.h.id && m.first[p.ability] == null) m.first[p.ability] = m.w.t; }); return m; };
  try { const r = bot(id, diff, seed, !!process.env.LV_TRACE); return { r, m }; } finally { build = b0; }
}
// foes that died before the last mandatory step aimed at them was cast (d0 / lead -> foe 0, d1 -> foe 1, mid / self / gate -> every foe)
function early(m) {
  const need = m.pr.need || [], steps = m.pr.sc.steps || [], out = [];
  m.run.dummies.forEach((d, i) => {
    const k = m.run.st.kills.find(q => q.id === d.id); if (!k) return;
    let last = -1;
    for (const s of steps) {
      if (need.indexOf(s.a) < 0) continue;
      const to = s.at === 'd1' ? 1 : s.at === 'd0' || s.at === 'lead' ? 0 : -1;
      if (to >= 0 && to !== Math.min(i, m.run.dummies.length - 1) && !(to === 1 && m.run.dummies.length === 1)) continue;
      last = Math.max(last, m.first[s.a] != null ? m.first[s.a] : Infinity);
    }
    if (k.t < last - 1e-6) out.push(i);
  });
  return out;
}


const SEEDS = [1, 2, 3, 4, 5, 6];

test('diagnostic: bot sweep seeds 1-6 easy/common (LV_ALL=1, LV_ONLY=id)', { skip: !process.env.LV_ALL && !process.env.LV_ONLY }, () => {
  for (const sc of SC) {
    if (process.env.LV_ONLY && process.env.LV_ONLY !== sc.id) continue;
    for (const df of (process.env.LV_DIFF || 'easy,common').split(',')) {
      const out = [];
      for (const seed of (process.env.LV_SEED ? [+process.env.LV_SEED] : SEEDS)) {
        const { r, m } = botRun(sc.id, df, seed), e = early(m);
        out.push('L' + m.pr.lo.heroLevel + ':' + (r ? (r.ok ? 'ok' : r.reason + (r.detail ? '/' + r.detail : '')) : 'none') + (e.length ? '!early' + e.join('') : ''));
      }
      console.log(String(sc.hero.lvl).padStart(2), sc.id.padEnd(18), df.padEnd(6), out.join(' '));
    }
  }
});

// ---------------------------------------------------------------- item 11: hero level per scenario
// pre-existing bot failures (identical at 6afc533, before the level change): id|diff|seed
const KNOWN = new Set(['triple_kill|easy|3', 'triple_kill|easy|6', 'triple_kill|common|3', 'triple_kill|common|6',
  'shadow_strike|easy|3', 'shadow_strike|easy|4', 'shadow_strike|common|3', 'shadow_strike|common|4',
  'cataclysm_finish|common|2', 'cataclysm_finish|common|4', 'cataclysm_finish|common|5',
  'plateau_escape|common|1', 'plateau_escape|common|6',
  ...SEEDS.map(s => 'gauntlet|common|' + s)]);
const BANDS = {   // story fit: laning 6-10, mid game 12-18, late game 20-25
  cold_start: [6, 10], sleepy_target: [6, 10], spirit_pack: [6, 10], river_rune: [6, 10], two_birds: [6, 10], uphill_snipe: [6, 10], sun_flee: [6, 10],
  river_guard: [12, 18], bridge_hold: [12, 18], ghost_slip: [12, 18], ghost_finish: [12, 18], fog_ambush: [12, 18], blast_push: [12, 18],
  force_chase: [12, 18], dust_escape: [12, 18], tower_dive: [12, 18], pit_trap: [12, 18], dust_hunt: [12, 18], bkb_bait: [12, 18],
  jungle_hold: [20, 25], cliff_blink: [20, 25], river_guard_2: [20, 25], highground_hold: [20, 25], tower_siege: [20, 25],
};

test('item 11: base levels sit in their story band; every scenario is feasible at its base level', () => {
  for (const id of Object.keys(BANDS)) {
    const sc = SC.find(s => s.id === id); assert.ok(sc, id);
    const b = R.baseLevel(sc);
    assert.ok(b >= BANDS[id][0] && b <= BANDS[id][1], id + ' base ' + b);
  }
  for (const sc of SC) for (const d of ['easy', 'common', 'hard']) {
    const f = R.feasible(sc, DF.get(d), R.baseLevel(sc));
    assert.ok(f.ok, sc.id + ' ' + d + ' infeasible at ' + R.baseLevel(sc) + ': ' + f.why);
  }
});

test('item 11: feasibility rejects missing orbs / short mana at level 1', () => {
  const sun = SC.find(s => s.id === 'sun_flee'), df = DF.get('common');
  const f1 = R.feasible(sun, df, 1);
  assert.equal(f1.ok, false);
  assert.ok(['orbs', 'mana', 'cd'].includes(f1.why), f1.why);
  assert.ok(R.feasible(sun, df, R.baseLevel(sun)).ok);
});

test('item 11: roll is seeded, within base +-1 (or clamped), and foe hp follows the rolled loadout', () => {
  for (const id of ['cold_start', 'blast_push', 'pit_trap', 'highground_hold', 'triple_kill']) {
    const sc = SC.find(s => s.id === id), base = R.baseLevel(sc);
    for (const seed of SEEDS) {
      const a = build(id, 'common', seed), b = build(id, 'common', seed);
      const lv = a.run.pr.lvl;
      assert.equal(a.pr.lo.heroLevel, b.pr.lo.heroLevel, id + ' seed ' + seed + ' not reproducible');
      assert.equal(lv.lvl, a.pr.lo.heroLevel);
      assert.equal(lv.base, base);
      if (!lv.clamped) assert.ok(Math.abs(lv.lvl - base) <= R.LVL_SPREAD, id + ' ' + lv.lvl);
      else assert.ok(Math.abs(lv.lvl - lv.rolled) <= R.LVL_SEARCH, id + ' clamp ' + lv.rolled + '->' + lv.lvl);
      assert.ok(lv.lvl >= 1 && lv.lvl <= 30);
      assert.ok(R.feasible(sc, a.pr.df, lv.lvl).ok, id + ' rolled infeasible');
      if (sc.obj.type === 'kill') assert.deepEqual(a.pr.hp, R.foeHp(sc, a.pr.df, a.pr.lo));
      assert.equal(R.hud(a.w).heroLevel, lv.lvl);
    }
  }
  // the level roll has its own stream: the ranked scenario sequence is unchanged by it
  const r1 = R.create({ mode: 'ranked', diff: 'common', seed: 42 }), r2 = R.create({ mode: 'ranked', diff: 'common', seed: 42 });
  const ids1 = [], ids2 = [];
  for (let i = 0; i < 4; i++) { ids1.push(r1.next().sc.id); ids2.push(r2.next().sc.id); }
  assert.deepEqual(ids1, ids2);
});

test('item 11: sandbox (no seed) rolls are random but stay within the spread', () => {
  const sc = SC.find(s => s.id === 'blast_push'), seen = new Set();
  for (let i = 0; i < 40; i++) { const r = R.create({ mode: 'practice', diff: 'easy', scenario: 'blast_push' }); seen.add(r.next().lo.heroLevel); }
  for (const l of seen) assert.ok(Math.abs(l - R.baseLevel(sc)) <= R.LVL_SPREAD, String(l));
  assert.ok(seen.size >= 2, 'no spread: ' + [...seen]);
});

test('item 11: countdown label "LV n"', () => {
  const { w } = build('cold_start', 'easy', 1);
  const rk = R.hud(w);
  assert.equal(IT.HudSteps.heroLv(rk), 'LV ' + rk.heroLevel);
  assert.equal(IT.HudSteps.heroLv(null), '');
});

test('item 11: bot clears every scenario at easy, kills no foe early at common (seeds 1-6, known pre-existing fails excepted)', () => {
  const bad = [];
  for (const sc of SC) for (const df of ['easy', 'common']) for (const seed of SEEDS) {
    const key = sc.id + '|' + df + '|' + seed;
    const { r, m } = botRun(sc.id, df, seed), e = early(m);
    if (df === 'common' && e.length) bad.push(key + ' early foe ' + e.join(','));
    if (!(r && r.ok) && !KNOWN.has(key)) bad.push(key + ' ' + (r ? r.reason + '/' + r.detail : 'none'));
  }
  assert.deepEqual(bad, []);
});

// ---------------------------------------------------------------- item 17: pit_trap
test('item 17: pit region (crater flood fill), bank spawn, focus + how metadata', () => {
  for (const id of ['roshan_pit', 'roshan_pit_top']) {
    const map = IT.Maps.get(id), p = R.pitRegion(map);
    assert.ok(p && p.n >= 30, id + ' pit tiles ' + (p && p.n));
    assert.ok(R.inPit(map, p.x, p.y), id + ' deepest point in pit');
    assert.ok(map.walkable(p.x, p.y), id + ' deepest point walkable');
  }
  const sc = SC.find(s => s.id === 'pit_trap');
  assert.ok(sc.focus && sc.focus.includes('pit'));
  assert.deepEqual(sc.obj.how, { inside: 'pit' });
  for (const seed of SEEDS) {
    const m = build('pit_trap', 'common', seed); thaw(m.run);
    const e = m.run.dummies[0], P = R.pitRegion(m.w.map), q = R.pushEnd(m.w.map, e, P, 600);
    assert.ok(e.juke, 'juke set');
    assert.equal(R.inPit(m.w.map, e.x, e.y), false, 'seed ' + seed + ' starts on the bank');
    assert.ok(R.inPit(m.w.map, q.x, q.y), 'seed ' + seed + ' a force staff push lands inside');
  }
});

function jukeRun(seed, diff) {
  const m = build('pit_trap', diff || 'common', seed); thaw(m.run);
  const e = m.run.dummies[0], tele = [];
  m.w.on('telegraph', p => { if (p.unit === e.id) tele.push(p); });
  return { m, e, tele };
}

test('item 17: hurt -> the foe jukes into the pit (useItem path, telegraph with a speech line)', () => {
  for (const seed of SEEDS) {
    const { m, e, tele } = jukeRun(seed);
    IT.Combat.damage(m.w, { target: e, src: m.h.id, amount: 1, type: 'pure', ability: 'attack' });
    for (let i = 0; i < 30 * 6 && !e.juke.done; i++) m.w.step();
    for (let i = 0; i < 30 * 2; i++) m.w.step();
    assert.ok(e.juke.done, 'seed ' + seed + ' juke fired');
    assert.ok(R.inPit(m.w.map, e.x, e.y), 'seed ' + seed + ' foe inside the pit after the juke');
    assert.ok(tele.some(p => p.say === 'juke'), 'telegraph + speech');
    assert.ok(['blink', 'forcestaff'].includes(e.juke.item), String(e.juke.item));
  }
});

test('item 17: hero within ~500 u -> the foe jukes', () => {
  const { m, e } = jukeRun(2, 'easy');
  const p = IT.Nav.nearestWalkable(m.w.map, e.x + 380, e.y) || { x: e.x + 380, y: e.y };
  m.h.x = p.x; m.h.y = p.y;
  for (let i = 0; i < 30 * 6 && !e.juke.done; i++) m.w.step();
  assert.ok(e.juke.done, 'proximity juke');
});

test('item 17: a kill outside the pit fails on method (outside)', () => {
  const { m, e } = jukeRun(1);
  IT.Combat.damage(m.w, { target: e, src: m.h.id, amount: 1e6, type: 'pure', ability: 'chaosmeteor' });
  for (let i = 0; i < 30 && !m.run.result; i++) m.w.step();
  assert.ok(m.run.result && !m.run.result.ok, 'failed');
  assert.equal(m.run.result.reason, 'method');
  assert.equal(m.run.result.detail, 'outside');
});

test('item 17: bot clears pit_trap at easy and common (seeds 1-6), killing inside the pit', () => {
  for (const df of ['easy', 'common']) for (const seed of SEEDS) {
    const { r, m } = botRun('pit_trap', df, seed);
    assert.ok(r && r.ok, df + ' seed ' + seed + ' ' + (r && r.reason + '/' + r.detail));
    assert.equal(m.run.st.kills[0].inside, 'pit');
  }
});
