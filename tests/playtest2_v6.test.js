'use strict';
// CEO playtest 2: area defence wins on a wipe, foe hp share (bot-tuned), ghost_escape / ghost_slip rework, between-round result card
// (hold until a key / auto 3 s after 1 s, never eats a clock), no "Not invoked" toast.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const load = require('./_load.js');
const { rig } = require('./input_rig');
const FILES = ['js/data/i18n.js', 'js/data/i18n/s3.js', 'js/data/i18n/f1.js', 'js/data/i18n/scn.js',
  'js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/dotaworld.js', 'js/data/maps.js', 'js/data/difficulty.js',
  'js/data/combos.js', 'js/data/scenarios.js', 'js/data/ranks.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/stats.js', 'js/sim/towers.js', 'js/sim/ranked.js', 'js/ui/combobar.js'];
const IT = load(FILES);
const R = IT.Ranked, SC = IT.SCENARIOS, DF = IT.DIFFICULTY;
const DIFFS = ['ian', 'easy', 'common', 'hard', 'bambam'];

function build(id, diff, seed, mode) {
  const run = R.create({ mode: mode || 'practice', diff: diff || 'easy', scenario: id, seed: seed || 5 });
  const pr = run.next(), m0 = IT.Maps.get('grounds');
  const w = IT.World.create({ seed: seed || 5, map: m0, loadout: pr.lo, fog: pr.fog });
  const h = IT.Hero.create(w, pr.lo, m0.spawns.hero.x, m0.spawns.hero.y);
  run.attach(w);
  return { run, w, h, pr };
}
const thaw = run => { for (let i = 0; i < 600 && run.frozen(); i++) run.tick(1 / 30); };
const prep = (w, h, ab) => { if (h.inv.slots.includes(ab) || h.inv.invokeCd > 0) return; for (const ch of IT.GAME.SPELL_ORBS[ab]) IT.Invoke.orb(w, h, ch); IT.Invoke.invoke(w, h); };

// ---------------------------------------------------------------- 1. area defence: wiping every foe wins at once
test('1: hold / gate scenarios complete as a win the moment every foe is dead', () => {
  const ids = SC.filter(s => s.obj.type === 'hold' || (s.fail || []).indexOf('cross') >= 0).map(s => s.id);
  for (const id of ['river_guard', 'bridge_hold', 'jungle_hold', 'river_guard_2', 'highground_hold']) assert.ok(ids.includes(id), id);
  for (const id of ids) {
    const m = build(id, 'common'); thaw(m.run);
    assert.equal(m.run.phase, 'play', id);
    for (let i = 0; i < 3; i++) m.w.step();
    assert.equal(m.run.result, null, id + ': nothing decided yet');
    for (const d of m.run.dummies) { d.hp = 0; d.dead = true; }   // no step used: the wipe alone is the defence
    m.w.step();
    assert.ok(m.run.result && m.run.result.ok, id + ' -> ' + JSON.stringify(m.run.result));
    assert.ok(m.run.result.time < 1, id + ' immediately');
  }
});

test('1: a hold scenario with a foe still alive does not end early', () => {
  const m = build('bridge_hold', 'common'); thaw(m.run);
  const ds = m.run.dummies; assert.ok(ds.length > 1);
  for (const d of ds.slice(1)) { d.hp = 0; d.dead = true; }
  for (let i = 0; i < 30; i++) m.w.step();
  assert.ok(!m.run.result || m.run.result.reason === 'cross', 'one foe left: no win');
});

// ---------------------------------------------------------------- 2. foe hp share
test('2: foe hp = min(HP_CAP, HP_SHARE x hpMul) x credited step damage (0.9 / 0.9, bot-tuned)', () => {
  assert.equal(R.HP_SHARE, 0.9); assert.equal(R.HP_CAP, 0.9);
  const sc = SC.get('sun_snipe');
  for (const id of DIFFS) {
    const df = DF.get(id), lo = R.prepare(sc, df).lo, dmg = R.comboDamage(sc, df, lo).foes[0];
    assert.equal(R.foeHp(sc, df, lo)[0], Math.round(Math.max(100, dmg * Math.min(0.9, 0.9 * df.hpMul))), id);
  }
  // tiers above common are capped: the scripted steps always out-damage the foe by >= 10 %
  const lo = R.prepare(sc, DF.get('bambam')).lo, d = R.comboDamage(sc, DF.get('bambam'), lo).foes[0];
  assert.ok(R.foeHp(sc, DF.get('bambam'), lo)[0] <= d * 0.9 + 1);
});

// ---------------------------------------------------------------- 3. ghost_escape / ghost_slip
// a player who reads the card: Ghost Walk (invoked in the countdown) at once, then keep walking away from the nearest foe
function escapeBot(id, diff, seed, stay) {
  const m = build(id, diff, seed), { run, w, h } = m;
  for (let i = 0; i < 600 && run.frozen(); i++) { prep(w, h, 'ghostwalk'); run.tick(1 / 30); }
  const live = () => run.phase === 'play';
  IT.Orders.issue(w, h, { type: 'cast', ability: 'ghostwalk' });
  for (let k = 0; k < 30 * 30 && live(); k += 10) {
    const f = run.dummies.filter(d => !d.dead).sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
    if (!stay && f && k > 5) { const a = Math.atan2(h.y - f.y, h.x - f.x), p = IT.Nav.nearestWalkable(w.map, h.x + Math.cos(a) * 500, h.y + Math.sin(a) * 500) || h; IT.Orders.issue(w, h, { type: 'move', x: p.x, y: p.y }); }
    for (let i = 0; i < 10 && live(); i++) w.step();
  }
  return run.result;
}

test('3: ghost_escape data: jungle choke start, one booted chaser 450-550 u away, 12 s, visible contact 180, bump 80, night', () => {
  const sc = SC.get('ghost_escape');
  assert.equal(sc.map, 'rad_triangle');
  assert.deepEqual(sc.obj, { type: 'escape', time: 12, caught: 180, bump: 80 });
  assert.equal(sc.units.length, 1); assert.equal(sc.units[0].mot, 'chase'); assert.ok(sc.units[0].msMul > 1); assert.equal(sc.units[0].aware, 1);
  assert.ok(!(sc.units[0].items || []).includes('dust'), 'no Dust: the lesson is to keep moving');
  assert.ok(sc.desc.en.includes('12') && sc.desc.pt.includes('12'));
  if (IT.DayNight) assert.equal(IT.DayNight.forScenario('ghost_escape'), 'night');
  for (let seed = 1; seed <= 6; seed++) for (const df of ['ian', 'common', 'bambam']) {
    const m = build('ghost_escape', df, seed), d = m.run.dummies[0], dist = Math.hypot(d.x - m.h.x, d.y - m.h.y);
    assert.ok(dist >= 380 && dist <= 650, 's' + seed + ' ' + df + ' chaser at ' + Math.round(dist));
    assert.equal(d.ms, Math.round(Math.max(d.msBase, 380 * DF.get(df).chase) * sc.units[0].msMul), df + ' booted chaser speed');
    assert.ok(m.w.map.walkable(m.h.x, m.h.y) && m.w.map.walkable(d.x, d.y));
  }
});

test('3: ghost_escape + ghost_slip: Ghost Walk + walking away wins every tier; Ghost Walk then standing still is found (bump)', () => {
  const bad = [];
  for (const id of ['ghost_escape', 'ghost_slip']) for (const df of DIFFS) for (const seed of [5, 8]) {
    const ok = escapeBot(id, df, seed, false);
    if (!(ok && ok.ok)) bad.push(id + ':' + df + ':s' + seed + ' scripted ' + (ok && ok.reason));
    const st = escapeBot(id, df, seed, true);
    if (!st || st.ok || st.reason !== 'caught' || st.detail !== 'bump') bad.push(id + ':' + df + ':s' + seed + ' stand-still ' + JSON.stringify(st));
  }
  assert.deepEqual(bad, []);
});

test('3: a visible hero is caught at the scenario contact distance (180), a hidden one only by a bump (80)', () => {
  const m = build('ghost_escape', 'easy'); thaw(m.run);
  const d = m.run.dummies[0];
  d.x = m.h.x + 150; d.y = m.h.y; d.scn.mot = null;
  m.w.step();
  assert.equal(m.run.result && m.run.result.reason, 'caught');
  assert.equal(m.run.result.detail, null);
  const m2 = build('ghost_escape', 'easy'); thaw(m2.run);
  const d2 = m2.run.dummies[0]; d2.scn.mot = null; d2.orders.length = 0;
  IT.Status.add(m2.w, m2.h, 'ghost', 60, {});
  d2.x = m2.h.x + 150; d2.y = m2.h.y; m2.w.step();
  assert.equal(m2.run.result, null, 'invisible at 150 u: not found');
  d2.x = m2.h.x + 60; m2.w.step();
  assert.equal(m2.run.result && m2.run.result.detail, 'bump');
});

// ---------------------------------------------------------------- 4. result card hold
test('4: the result phase holds >= RESULT_MIN s, any key continues after that, else auto RESULT_AUTO s later', () => {
  assert.equal(R.RESULT_MIN, 1); assert.equal(R.RESULT_AUTO, 3); assert.equal(R.RESULT_HOLD, 4);
  const m = build('sleepy_target', 'easy', 5, 'ranked'); thaw(m.run);
  const { run, w } = m;
  for (const d of run.dummies) { d.hp = 0; d.dead = true; }
  run.pr.need = [];
  w.step();
  assert.equal(run.phase, 'result'); assert.equal(w.paused, true);
  const t0 = w.t, n0 = run.n;
  assert.equal(run.cont(), false, 'too early');
  for (let i = 0; i < 27; i++) run.tick(1 / 30);
  assert.equal(run.cont(), false, '0.9 s: still too early');
  let hd = R.hud(w); assert.equal(hd.hold.canGo, false); assert.equal(hd.hold.auto, 4);
  for (let i = 0; i < 4; i++) run.tick(1 / 30);
  hd = R.hud(w); assert.equal(hd.hold.canGo, true); assert.equal(hd.hold.auto, 3);
  assert.equal(run.phase, 'result');
  assert.equal(run.cont(), true);
  assert.equal(run.n, n0 + 1); assert.equal(run.phase, 'countdown', 'next scenario');
  assert.equal(w.t, t0, 'sim time frozen through the card');
  // auto-continue
  thaw(run);
  for (const d of run.dummies) { d.hp = 0; d.dead = true; }
  run.pr.need = []; w.step();
  assert.equal(run.phase, 'result');
  const n1 = run.n;
  for (let i = 0; i < Math.round(3.9 * 30); i++) run.tick(1 / 30);
  assert.equal(run.phase, 'result', 'still showing at 3.9 s');
  for (let i = 0; i < 6; i++) run.tick(1 / 30);
  assert.equal(run.n, n1 + 1, 'auto-continued after 4 s');
});

test('4: the result card never eats the run clock', () => {
  const m = build('sleepy_target', 'easy', 5, 'ranked'); thaw(m.run);
  const { run, w } = m;
  run.runLeft = 100;
  for (const d of run.dummies) { d.hp = 0; d.dead = true; }
  run.pr.need = []; w.step();
  assert.equal(run.phase, 'result');
  const left = run.runLeft;
  for (let i = 0; i < 60; i++) run.tick(1 / 30);
  assert.equal(run.runLeft, left);
});

test('4: input: during the result card any key / click calls run.cont (consumed); modifiers alone do not', () => {
  const r = rig({ autoAttack: false });
  let conts = 0, skips = 0;
  r.In.hooks.inspect = () => r.w.paused;
  r.In.hooks.skip = () => { skips++; return true; };
  r.w.paused = true; r.w.ranked = { phase: 'result', cont() { conts++; return true; } };
  r.key('Shift');
  assert.equal(conts, 0, 'a lone modifier');
  r.key('q');
  assert.equal(conts, 1); assert.equal(r.h.inv.orbs.length, 0, 'the key is consumed, no orb');
  r.click(2);
  assert.equal(conts, 2); assert.equal(skips, 0, 'RMB continues, it does not start anything');
  r.click(0);
  assert.equal(conts, 3);
});

test('4: combobar result text: one big line + a smaller reason line + the countdown', () => {
  const CB = IT.ComboBar;
  const ok = CB.resultText({ ok: true, points: 120, time: 4.21 }, { auto: 3, canGo: true }, true);
  assert.equal(ok.big, 'CLEARED +120'); assert.equal(ok.small, 'in 4.2 s'); assert.match(ok.cont, /any key.*3/);
  assert.equal(CB.resultText({ ok: true, points: 0, time: 2 }, null, false).big, 'CLEARED');
  const f = CB.resultText({ ok: false, reason: 'caught', detail: null }, { auto: 2, canGo: true }, true);
  assert.equal(f.big, 'FAILED: Caught'); assert.ok(f.small.length > 0 && f.small !== f.big);
  assert.match(CB.resultText({ ok: false, reason: 'caught', detail: 'bump' }, null, true).small, /walked into you/);
  const mm = CB.resultText({ ok: false, reason: 'method', detail: 'missing', spells: ['emp'] }, null, true);
  assert.equal(mm.big, 'FAILED: Wrong method'); assert.match(mm.small, /E\.?M\.?P/);
  for (const k of ['caught', 'cross', 'seen', 'method', 'escaped', 'tower', 'died', 'time']) {
    assert.ok(IT.I18N.en['rc.r.' + k] && IT.I18N.pt['rc.r.' + k] && IT.I18N.en['rc.r.' + k] !== IT.I18N.pt['rc.r.' + k], k);
  }
  assert.equal(CB.resultText(null), null);
});

// ---------------------------------------------------------------- 4. no "Not invoked" toast
test('4: casting a spell that is not invoked does nothing: no fail event, no i18n string', () => {
  assert.equal(IT.I18N.en['fail.notInvoked'], undefined);
  assert.equal(IT.I18N.pt['fail.notInvoked'], undefined);
  const r = rig({ autoAttack: false });
  r.In.castId('icewall'); r.In.castId('ghostwalk'); r.In.castId('sunstrike');
  r.at(500);
  assert.deepEqual(r.fails, []); assert.deepEqual(r.casts, []);
  assert.equal(r.IT.Abilities.check(r.w, r.h, 'icewall', null), 'notInvoked', 'the sim reason key stays (orders / tests)');
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'data', 'i18n.js'), 'utf8');
  assert.ok(!/notInvoked/.test(src));
});
