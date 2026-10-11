'use strict';
// Scenarios: data integrity, loadouts valid, a bot solves each one (every difficulty), failure paths, scripted dummies.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/difficulty.js', 'js/data/scenarios.js', 'js/data/ranks.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/stats.js', 'js/sim/ranked.js'];
const IT = load(FILES);
const map = IT.Map.build(IT.MAPDEF);
const DEBUG = !!process.env.SCN_DEBUG;

function mk(id, diff, o) {
  o = o || {};
  const run = IT.Ranked.create({ mode: o.mode || 'practice', diff: diff || 'normal', scenario: id, seed: o.seed || 5, rating: o.rating });
  const pr = run.next(), sp = map.spawns.hero;
  const w = IT.World.create({ seed: o.seed || 5, map, loadout: pr.lo, fog: pr.fog, autoAttack: false });
  const h = IT.Hero.create(w, pr.lo, sp.x, sp.y);
  if (IT.StatsCollector) IT.StatsCollector.create(w);
  run.attach(w);
  return { run, w, h, pr };
}
// real-time part: countdown / result
function thaw(run, max) { for (let i = 0; i < (max || 400) && run.frozen(); i++) run.tick(1 / 30); }
const ds = run => run.dummies.filter(d => !d.dead);
function prep(w, h, ab) {
  if (!IT.GAME.SPELL_ORBS[ab] || h.inv.slots.includes(ab) || h.inv.invokeCd > 0) return;
  for (const ch of IT.GAME.SPELL_ORBS[ab]) IT.Invoke.orb(w, h, ch);
  IT.Invoke.invoke(w, h);
}

// bot: plays sc.sol. Dummies are held still unless the scenario scripts them.
function play(m, o) {
  o = o || {};
  const { w, h, run } = m, sol = run.pr.sc.sol, trail = [];
  const step = () => { w.step(); if (DEBUG && process.env.SCN_TRACE && Math.round(w.t * 30) % 6 === 0) console.log('POS', w.t.toFixed(2), run.dummies.map(d => Math.round(d.x) + ',' + Math.round(d.y) + ' mode=' + d.ai.mode + ' ms=' + d.ms + ' st=' + (d.status || []).map(s => s.id || s.type).join('+')).join(' ')); trail.push(run.dummies.map(d => ({ x: d.x, y: d.y }))); if (trail.length > 12) trail.shift(); };
  const live = () => run.phase === 'play';
  for (let i = 0; i < sol.length && live(); i++) {
    const s = sol[i], next = sol.slice(i).find(q => IT.GAME.SPELL_ORBS[q.a]);
    const until = w.t + (s.w || 0);
    for (let k = 0; k < 900 && live() && w.t < until - 1e-6; k++) { if (next) prep(w, h, next.a); step(); }
    if (!live()) break;
    let guard = 0;
    while (IT.GAME.SPELL_ORBS[s.a] && !h.inv.slots.includes(s.a) && guard++ < 400 && live()) { prep(w, h, s.a); step(); }
    const al = ds(run), d = al[s.at === 'd1' ? 1 : 0] || al[0];
    if (!d) break;
    let tx = d.x, ty = d.y, tid = d.id;
    if (s.at === 'self') { tx = h.x; ty = h.y; tid = h.id; }
    else if (s.at === 'mid') {
      if (al.length > 1) { tx = al.reduce((a, q) => a + q.x, 0) / al.length; ty = al.reduce((a, q) => a + q.y, 0) / al.length; tid = undefined; }
      else { const a = Math.atan2(d.y - h.y, d.x - h.x); tx = d.x - Math.cos(a) * 250; ty = d.y - Math.sin(a) * 250; tid = undefined; }
    } else if (s.at === 'lead') {
      const old = trail[0] && trail[0][0] || d, T = (trail.length - 1) / 30 || 1;
      const vx = (d.x - old.x) / T, vy = (d.y - old.y) / T;
      tx = d.x + vx * 1.8; ty = d.y + vy * 1.8; tid = undefined;
      if (DEBUG) console.log('LEAD', w.t.toFixed(2), Math.round(d.x), Math.round(d.y), 'v', Math.round(vx), Math.round(vy), 'T', T, 'to', Math.round(tx), Math.round(ty));
    }
    if (DEBUG) console.log('AT', w.t.toFixed(2), s.a, 'dummy', Math.round(d.x), Math.round(d.y), 'hp', Math.round(d.hp), 'aim', Math.round(tx), Math.round(ty));
    if (s.a === 'attack') IT.Orders.issue(w, h, { type: 'attack', target: d.id });
    else IT.Orders.issue(w, h, { type: 'cast', ability: s.a, x: tx, y: ty, target: tid });
    for (let k = 0; k < 10 && live(); k++) step();
  }
  if (run.pr.sc.obj.type === 'escape' && live()) IT.Orders.issue(w, h, { type: 'move', x: h.x + 800, y: h.y });   // slip away while invisible
  for (let k = 0; k < 30 * 40 && live(); k++) step();
  return run.result;
}

test('data: scenarios are well-formed', () => {
  const S = IT.SCENARIOS, ids = new Set();
  assert.equal(S.length, 13);
  for (const sc of S) {
    assert.ok(!ids.has(sc.id), 'dup ' + sc.id); ids.add(sc.id);
    assert.ok(sc.name.en && sc.name.pt && sc.tip.en && sc.tip.pt && sc.goal.en && sc.goal.pt, sc.id);
    assert.ok([1, 2, 3].includes(sc.tier) && sc.par > 0 && sc.dummies.length > 0 && sc.sol.length > 0, sc.id);
    assert.ok(['kill', 'escape', 'rootAll'].includes(sc.obj.type), sc.id);
    for (const s of sc.sol) assert.ok(IT.GAME.SPELL_ORBS[s.a] || IT.GAME.ITEM_DOTA[s.a] || s.a === 'attack', sc.id + ' ' + s.a);
    for (const df of IT.DIFFICULTY.order) {
      const pr = IT.Ranked.prepare(sc, IT.DIFFICULTY.get(df), 'pedro');
      const v = IT.Loadout.validate(pr.lo);
      assert.ok(v.ok, sc.id + ' ' + df + ' ' + v.errors.join());
      assert.ok(pr.limit > 0, sc.id);
    }
  }
  for (const t of [1, 2, 3]) assert.ok(S.some(s => s.tier === t));
});

test('difficulty table covers every id', () => {
  const D = IT.DIFFICULTY;
  assert.deepEqual(D.order, ['ianzinho', 'easy', 'normal', 'hard', 'bambam']);
  for (const id of D.order) {
    const d = D.get(id);
    assert.ok(IT.GAME.DUMMY_PRESETS[d.preset] && ['stationary', 'wander', 'evasive'].includes(d.behavior), id);
    assert.ok(d.timer > 0 && d.mult > 0 && d.reaction >= 0, id);
  }
  assert.ok(D.ianzinho.hints && !D.hard.hints && D.bambam.fog && D.bambam.useBkb && D.hard.stunBolt && D.normal.reaction === 0.6 && D.bambam.reaction === 0.25);
  assert.ok(D.ianzinho.timer >= 2);
});

test('apply(): dummies placed on walkable ground, loadout swapped in place', () => {
  for (const sc of IT.SCENARIOS) {
    const m = mk(sc.id, 'normal');
    assert.equal(m.run.dummies.length, sc.dummies.length, sc.id);
    for (const d of m.run.dummies) assert.ok(map.walkable(d.x, d.y), sc.id);
    assert.equal(m.w.loadout.heroLevel, m.pr.lo.heroLevel);
    assert.deepEqual(m.h.items.filter(Boolean).map(i => i.id), sc.hero.items || []);
    assert.equal(m.w.paused, true, 'frozen in countdown');
  }
});

test('countdown freezes the world, then play starts', () => {
  const m = mk('sun_snipe', 'normal');
  const t0 = m.w.t;
  assert.equal(m.run.phase, 'countdown');
  m.w.step(); m.w.step();
  assert.equal(m.w.t, t0);
  let hud = IT.Ranked.hud(m.w);
  assert.equal(hud.phase, 'countdown'); assert.equal(hud.countdown, 3);
  thaw(m.run);
  assert.equal(m.run.phase, 'play'); assert.equal(m.w.paused, false);
  m.w.step(); assert.ok(m.w.t > t0);
  hud = IT.Ranked.hud(m.w);
  assert.equal(hud.phase, 'play'); assert.ok(hud.scenario && hud.objective && hud.timeLeft > 0);
});

for (const df of ['ianzinho', 'easy', 'normal', 'hard', 'bambam']) {
  test('bot solves every scenario at ' + df, () => {
    const bad = [];
    for (const sc of IT.SCENARIOS) {
      if (process.env.SCN_ONLY && process.env.SCN_ONLY !== sc.id + ':' + df) continue;
      const m = mk(sc.id, df);
      // hold wandering/evasive dummies still so the bot's static aim is fair; scripted ones keep moving
      for (const d of m.run.dummies) {
        d.ai.useBkb = false; d.scenario.stunBolt = false; d.scenario.dummyEscape = 'none';   // the bot is naive: no bolt stuns, no BKB pops, no blinks
        if (!d.scn.mot) { d.ai.behavior = 'stationary'; d.ms = 0; d.base.ms = 0; }
      }
      thaw(m.run);
      const r = play(m);
      if (DEBUG) console.log(df, sc.id, JSON.stringify(r), m.run.dummies.map(d => d.dead ? 'dead' : Math.round(d.hp / d.maxHp * 100) + '%').join(','), 'mana', Math.round(m.h.mana));
      if (DEBUG && process.env.SCN_ONLY === sc.id + ':' + df) console.log(m.w.log.filter(e => ['damage', 'status', 'cast', 'hit', 'miss', 'statusEnd', 'fx'].includes(e.ev)).map(e => e.ev + ' t=' + e.t.toFixed(2) + ' ' + (e.ability || e.status || e.name || '') + (e.x != null ? ' @' + Math.round(e.x) + ',' + Math.round(e.y) : '') + ' ' + (e.dealt != null ? Math.round(e.dealt) : '') + ' tgt=' + (e.target || e.unit)).join(' | '));
      if (!(r && r.ok)) bad.push(sc.id + ':' + (r && r.reason) + ':' + m.run.dummies.map(d => d.dead ? 'dead' : Math.round(d.hp / d.maxHp * 100) + '%').join('/'));
    }
    assert.deepEqual(bad, []);
  });
}

// calibration helper: SCN_CAL=1 prints the damage each kill scenario deals at BAMBAM as a fraction of max hp
if (process.env.SCN_CAL) test('calibrate', () => {
  IT.GAME.DUMMY.refillBelow = 0;
  for (const sc of IT.SCENARIOS) {
    if (sc.obj.type !== 'kill') continue;
    const m = mk(sc.id, process.env.SCN_CAL);
    for (const d of m.run.dummies) { d.ai.useBkb = false; d.scenario.stunBolt = false; d.scenario.dummyEscape = 'none'; d.hp = d.maxHp; if (!d.scn.mot) { d.ai.behavior = 'stationary'; d.ms = 0; d.base.ms = 0; } }
    let sum = 0; m.w.on('damage', p => { if (p.target !== m.h.id) sum += p.dealt; });
    thaw(m.run);
    play(m);
    const tot = sum / m.run.dummies.length / m.run.dummies[0].maxHp;
    console.log('CAL', sc.id, tot.toFixed(3));
  }
});
