'use strict';
// CEO v6 items 13 + 39 + 45: the 12 s scenario intro (text phase first, then the camera pan) and the tiny start-reveal ring of unseen foes (all tiers).
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const { rig } = require('./input_rig');
const FILES = ['js/data/i18n.js', 'js/data/i18n/s3.js', 'js/data/i18n/f1.js', 'js/data/i18n/scn.js',
  'js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/dotaworld.js', 'js/data/maps.js', 'js/data/difficulty.js',
  'js/data/combos.js', 'js/data/scenarios.js', 'js/data/ranks.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/stats.js', 'js/sim/towers.js', 'js/sim/ranked.js', 'js/render/camera.js'];
const IT = load(FILES);
const R = IT.Ranked, SC = IT.SCENARIOS;
const DT = 1 / 30;

function build(id, diff, mode) {
  const run = R.create({ mode: mode || 'sandbox', diff: diff || 'common', scenario: id, seed: 5, rating: 1000 });
  const pr = run.next(), m0 = IT.Maps.get('grounds');
  const w = IT.World.create({ seed: 5, map: m0, loadout: pr.lo, fog: pr.fog });
  const h = IT.Hero.create(w, pr.lo, m0.spawns.hero.x, m0.spawns.hero.y);
  const ev = [];
  for (const k of ['tourFocus', 'tourEnd', 'scnGo']) w.on(k, p => ev.push(Object.assign({ ev: k }, p)));
  run.attach(w);
  return { run, w, h, ev, m0 };
}
const reveals = w => w.ents.filter(e => !e.dead && e.fx === 'startReveal');
// main.js tourWire, reproduced: glide to each stop (toured spots shifted right of centre), snap onto the hero at round start
function camRig(m) {
  const GM = IT.GAME, cam = IT.Camera.create(m.m0), off = 0.14 * GM.VIEW_W * GM.UNIT_PX;
  cam.centerOn(m.h.x, m.h.y);
  m.w.on('tourFocus', p => { if (p.i > 0) cam.glideTo(p.x - (p.kind === 'hero' ? 0 : off), p.y, Math.max(0.05, p.glide)); });
  m.w.on('scnGo', () => cam.release());   // item 45: a cancelled intro leaves the camera where it is
  const keys = new Set(), mouse = { in: false, x: 0, y: 0 };
  return { cam, frame(dt) { m.run.tick(dt); cam.script = m.run.touring(); cam.update(dt, keys, mouse, m.h); } };
}
const centred = (cam, h) => { const mg = cam.margins(); return Math.hypot(cam.x + mg.fx - h.x, cam.y + mg.fy - h.y); };

test('13: the intro is 12 s; tour = hero -> foe groups -> gate -> hero, ends on the hero before the round starts', () => {
  assert.equal(R.COUNTDOWN, 12);
  const m = build('river_guard', 'common'), I = m.run.intro;
  assert.ok(I, 'intro built');
  assert.equal(I.T, 12); assert.equal(m.run.cd, 12); assert.equal(m.run.phase, 'countdown');
  const kinds = I.stops.map(s => s.kind);
  assert.equal(kinds[0], 'hero'); assert.equal(kinds[kinds.length - 1], 'hero');
  assert.ok(kinds.includes('foes') && kinds.includes('gate'), kinds.join());
  assert.ok(kinds.indexOf('foes') < kinds.indexOf('gate'));
  const last = I.stops[I.stops.length - 1];
  assert.equal(last.x, m.h.x); assert.equal(last.y, m.h.y);
  assert.ok(last.t + last.glide <= 12 - 0.5, 'arrives on the hero >= 0.5 s before go');
  // item 45: text first -- the camera stays on the hero through the text phase, the pan starts after it; <= 4 s on a foe stop
  assert.ok(I.text.hold >= 3 && I.text.hold <= 6, 'text phase 3-6 s: ' + I.text.hold);
  assert.ok(I.stops[1].t >= I.text.hold - 1e-9, 'first pan stop after the text phase');
  I.stops.forEach((s, i) => { if (s.kind === 'foes') assert.ok(I.stops[i + 1].t - (s.t + s.glide) <= 4 + 1e-9, 'at most 4 s on the enemy'); });
  for (let i = 1; i < I.stops.length; i++) assert.ok(I.stops[i].t >= I.stops[i - 1].t + I.stops[i - 1].glide - 1e-9, 'no overlapping glides');
  // the clock emits each stop once, in order
  for (let k = 0; k < 12 * 30 - 3; k++) m.run.tick(DT);
  assert.equal(m.run.phase, 'countdown');
  const foc = m.ev.filter(e => e.ev === 'tourFocus');
  assert.deepEqual(foc.map(e => e.kind), kinds);
  const fs = foc.find(e => e.kind === 'foes');
  assert.ok(fs.ids.length > 0 && fs.ids.every(id => m.run.dummies.some(d => d.id === id)), 'foe stop names the foes');
  assert.equal(foc.find(e => e.kind === 'gate').x, m.w.gate.x);
  assert.equal(foc[foc.length - 1].last, true);
  m.run.tick(0.2); assert.equal(m.run.phase, 'play');
  // every scenario with a countdown gets an intro; a visible foe is always toured
  for (const sc of SC) {
    const b = build(sc.id, 'easy');
    assert.ok(b.run.intro, sc.id);
    if (b.run.dummies.some(d => d.visible)) assert.ok(b.run.intro.stops.some(s => s.kind === 'foes'), sc.id + ' tours its foes');
  }
});

test('13: the camera tour visits the toured spots and ends exactly centred on the hero', () => {
  const m = build('river_guard', 'common'), c = camRig(m), I = m.run.intro;
  const fs = I.stops.find(s => s.kind === 'foes'), gate = I.stops.find(s => s.kind === 'gate');
  let tm = 0, farFoe = 1e9, farGate = 1e9;
  const GM = IT.GAME, off = 0.14 * GM.VIEW_W * GM.UNIT_PX;
  while (m.run.phase === 'countdown' && tm < 13) {
    c.frame(DT); tm += DT;
    const mg = c.cam.margins(), vx = c.cam.x + mg.fx + off, vy = c.cam.y + mg.fy;
    farFoe = Math.min(farFoe, Math.hypot(vx - fs.x, vy - fs.y)); farGate = Math.min(farGate, Math.hypot(vx - gate.x, vy - gate.y));
    if (Math.abs(tm - 11.5) < DT / 2) assert.ok(centred(c.cam, m.h) < 1, 'back on the hero before go: ' + centred(c.cam, m.h));
  }
  assert.ok(farFoe < 60, 'camera reached the foe group: ' + farFoe);
  assert.ok(farGate < 60, 'camera reached the gate: ' + farGate);
  c.frame(DT);
  assert.ok(centred(c.cam, m.h) < 1e-6, 'centred on the hero at round start');
});

test('13: move / attack / cast start the round (camera snaps to the hero); orbs + Invoke never do; skipTour keeps the countdown', () => {
  // input layer: orbs + Invoke during the countdown never call the skip hook, a right-click (move) does
  const r = rig({ autoAttack: false });
  let skips = 0;
  r.w.paused = true; r.w.ranked = { phase: 'countdown' };
  r.In.hooks.inspect = () => true;
  r.In.hooks.skip = () => { if (r.w.ranked.phase !== 'countdown') return false; skips++; r.w.ranked.phase = 'play'; r.w.paused = false; return true; };
  for (const k of ['q', 'w', 'e', 'r', 'e', 'r']) r.key(k);
  assert.equal(skips, 0, 'orbs / invoke'); assert.equal(r.w.ranked.phase, 'countdown');
  r.click(2);
  assert.equal(skips, 1, 'move starts it'); assert.equal(r.w.paused, false);
  // sim: invoke during the tour keeps it; a skip mid-tour (camera on the foes) snaps the camera onto the hero
  const m = build('river_guard', 'common'), c = camRig(m);
  for (const ch of IT.GAME.SPELL_ORBS.sunstrike) IT.Invoke.orb(m.w, m.h, ch);
  IT.Invoke.invoke(m.w, m.h);
  const st1 = m.run.intro.stops[1];
  while (12 - m.run.cd < st1.t + st1.glide * 0.6) c.frame(DT);
  assert.equal(m.run.phase, 'countdown'); assert.equal(m.run.touring(), true);
  assert.ok(centred(c.cam, m.h) > 200, 'camera away on the tour');
  const cx0 = c.cam.x, cy0 = c.cam.y;
  assert.equal(m.run.skip(), true);
  assert.equal(m.run.phase, 'play'); assert.equal(m.run.touring(), false);
  assert.equal(m.ev.filter(e => e.ev === 'scnGo')[0].early, true);
  for (let k = 0; k < 10; k++) c.cam.update(DT, new Set(), { in: false }, m.h);
  assert.ok(Math.abs(c.cam.x - cx0) < 1e-9 && Math.abs(c.cam.y - cy0) < 1e-9, 'item 45: the cancel does NOT re-centre the camera');
  assert.equal(c.cam.script, false); assert.equal(c.cam.glide, null);
  // skipTour (F1): ends only the tour
  const s = build('river_guard', 'common');
  for (let k = 0; k < 2 * 30; k++) s.run.tick(DT);
  const cd = s.run.cd;
  assert.equal(s.run.skipTour(), true);
  assert.equal(s.run.phase, 'countdown'); assert.equal(s.run.cd, cd); assert.equal(s.run.touring(), false);
  assert.ok(s.ev.some(e => e.ev === 'tourEnd' && e.skipped));
  assert.equal(s.run.skipTour(), false);
  const n = s.ev.filter(e => e.ev === 'tourFocus').length;
  for (let k = 0; k < 3 * 30; k++) s.run.tick(DT);
  assert.equal(s.ev.filter(e => e.ev === 'tourFocus').length, n, 'no more tour stops');
  assert.equal(reveals(s.w).length, 0, 'item 45: the reveals the camera never reached wait for round start');
  s.run.skip();
  assert.equal(reveals(s.w).length, s.run.intro.reveals.length, 'pending reveals appear at round start');
});

test('45: the reveal exists at every tier incl. bambam; the clock starts when the camera ARRIVES on the foe; a tiny plain ring', () => {
  for (const t of ['ian', 'easy', 'common', 'hard', 'bambam']) assert.equal(R.revealOn(SC.get('river_guard'), IT.DIFFICULTY.get(t)), true, t);
  assert.equal(R.REVEAL_R, 250);
  for (const tier of ['ian', 'common', 'hard', 'bambam']) {
    const m = build('river_guard', tier), I = m.run.intro;
    assert.ok(I.unseen.length > 0, 'river_guard has foes in the fog');
    assert.equal(I.reveals.length, I.unseen.length, tier + ': a reveal for every unseen foe');
    for (const r of I.reveals) {
      const s = I.stops.find(q => q.ids.includes(r.id));
      assert.ok(s, tier + ': toured'); assert.ok(Math.abs(r.at - (s.t + s.glide)) < 1e-9, 'reveal clock = camera arrival');
    }
    const at = Math.min(...I.reveals.map(r => r.at));
    assert.ok(at > I.text.hold, 'only after the text phase + the glide');
    assert.equal(reveals(m.w).length, 0);
    for (const id of I.unseen) assert.equal(m.w.get(id).visible, false);
    while (12 - m.run.cd < at - 0.05) m.run.tick(DT);
    assert.equal(reveals(m.w).length, 0, tier + ': nothing before the camera arrives');
    while (12 - m.run.cd < at + DT) m.run.tick(DT);
    const rv = reveals(m.w);
    assert.ok(rv.length > 0, tier + ': reveal spawned on arrival');
    for (const t of rv) {
      const f = m.w.get(t.foe);
      assert.ok(f && Math.hypot(f.x - t.x, f.y - t.y) < 1, 'on its foe');
      assert.equal(f.visible, true, 'the foe is revealed');
      assert.equal(t.team, 0); assert.equal(t.r, R.REVEAL_R); assert.ok(t.vision <= 300, 'tiny vision');
    }
  }
});

test('45: linger from arrival per tier: ian 2.5, easy 2.0, common 1.5, hard 1.1, bambam 0.8; the ring ages on the intro clock then goes', () => {
  const L = { ian: 2.5, easy: 2.0, common: 1.5, hard: 1.1, bambam: 0.8 };
  for (const t of Object.keys(L)) {
    assert.equal(IT.DIFFICULTY.get(t).revealLinger, L[t], t);
    const m = build('river_guard', t), I = m.run.intro;
    assert.equal(I.linger, L[t]);
    const at = Math.min(...I.reveals.map(r => r.at));
    while (12 - m.run.cd < at + DT) m.run.tick(DT);
    assert.ok(reveals(m.w).length > 0, t + ': there');
    const thk = reveals(m.w)[0];
    while (12 - m.run.cd < at + L[t] - 0.12) m.run.tick(DT);
    assert.ok(reveals(m.w).includes(thk), t + ': still there just before the linger ends');
    assert.ok(thk.age > L[t] - 0.4 && thk.age < L[t], t + ': aged from the arrival: ' + thk.age);
    while (12 - m.run.cd < at + L[t] + 0.1) m.run.tick(DT);
    assert.equal(reveals(m.w).length, 0, t + ': gone after the linger');
    assert.equal(m.w.get(I.reveals[0].id).visible, false, 'the foe hides again');
  }
  // a cancel mid-linger: the rest of the linger runs on in play
  const m = build('river_guard', 'common'), I = m.run.intro, at = Math.min(...I.reveals.map(r => r.at));
  while (12 - m.run.cd < at + 0.5) m.run.tick(DT);
  const thk = reveals(m.w)[0]; m.run.skip();
  assert.ok(reveals(m.w).includes(thk));
  for (let k = 0; k < Math.round(0.8 / DT); k++) m.w.step();
  assert.ok(reveals(m.w).includes(thk), 'still lingering');
  for (let k = 0; k < Math.round(0.5 / DT); k++) m.w.step();
  assert.equal(reveals(m.w).length, 0, 'gone at 1.5 s from arrival');
  // never reached by the pan (cancelled at once): appears at round start with its full linger
  const n = build('river_guard', 'bambam'); n.run.skip();
  assert.equal(reveals(n.w).length, n.run.intro.unseen.length);
  for (let k = 0; k < Math.round(0.9 / DT); k++) n.w.step();
  assert.equal(reveals(n.w).length, 0, 'bambam 0.8 s of play');
});

test('45: the text phase length comes from the reading length (words x 0.25 s + 0.4 s per block, 3-6 s); blocks animate one after the other', () => {
  const fake = (name, win, lose, n) => ({ sc: { name: { en: name }, win: { en: win }, lose: { en: lose }, steps: Array.from({ length: n }, () => ({ a: 'sunstrike' })) } });
  const short = R.textPlan(fake('A', 'B', 'C', 0), 12), long = R.textPlan(fake('word '.repeat(10), 'word '.repeat(30), 'word '.repeat(30), 7), 12);
  assert.equal(short.hold, 3); assert.equal(long.hold, 6);
  const mid = R.textPlan(fake('one two three four', 'win it all now and then', 'lose it', 0), 12);
  assert.ok(Math.abs(mid.raw - ((4 + 6 + 6) * 0.25 + 3 * 0.4)) < 1e-9, 'raw = ' + mid.raw);   // title 4 + win 6 + lose 2+4 words, 3 blocks
  assert.equal(mid.hold, mid.raw); assert.ok(mid.hold > 3 && mid.hold < 6);
  for (const p of [short, mid, long]) {
    for (let i = 1; i < p.blocks.length; i++) assert.ok(Math.abs(p.blocks[i].at - (p.blocks[i - 1].at + p.blocks[i - 1].d)) < 1e-9, 'one after the other');
    const e = p.blocks[p.blocks.length - 1]; assert.ok(e.at + e.d <= p.hold + 1e-9, 'all blocks fit the text phase');
    assert.equal(p.blocks[0].at, 0);
  }
  assert.ok(R.textPlan(fake('a', 'b', 'c', 0), 6).hold <= 3, 'a short countdown halves the text phase');
  // the real plan is on the intro: title, VICTORY, DEFEAT first, then the steps; the pan starts after it
  const m = build('river_guard', 'common');
  assert.deepEqual(m.run.intro.text.blocks.slice(0, 3).map(b => b.id), ['title', 'win', 'lose']);
  assert.ok(m.run.intro.text.hold >= 3 && m.run.intro.text.hold <= 6);
  assert.ok(m.run.intro.stops[1].t >= m.run.intro.text.hold);
});

test('45: every moving foe already FACES the way it moves next (flee: away from the hero, march: toward the gate, chase: toward the hero)', () => {
  const ang = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  let seen = 0;
  for (const sc of SC) {
    if (!(sc.units || sc.dummies || []).some(d => d.mot === 'flee' || d.mot === 'march' || d.mot === 'chase')) continue;
    const m = build(sc.id, 'bambam');
    for (const e of m.run.dummies) {
      const mot = e.scn.mot; let want = null;
      if (mot === 'flee') want = Math.atan2(e.y - m.h.y, e.x - m.h.x);
      else if (mot === 'march' && m.w.gate) want = Math.atan2(m.w.gate.y - e.y, m.w.gate.x - e.x);
      else if (mot === 'chase') want = Math.atan2(m.h.y - e.y, m.h.x - e.x);
      if (want == null) continue;
      assert.ok(ang(e.facing, want) < 1e-9, sc.id + ' ' + mot + ' facing'); seen++;
    }
  }
  assert.ok(seen >= 5, 'flee + march + chase covered: ' + seen);
});
