'use strict';
// CEO v6 items 13 + 39: the 12 s scenario intro (briefing + camera tour) and the Sun-Strike-shaped start reveal of unseen foes.
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
  m.w.on('scnGo', () => { cam.script = false; cam.snap(m.h.x, m.h.y); });
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
  for (let k = 0; k < 4 * 30; k++) c.frame(DT);
  assert.equal(m.run.phase, 'countdown'); assert.equal(m.run.touring(), true);
  assert.ok(centred(c.cam, m.h) > 200, 'camera away on the tour');
  assert.equal(m.run.skip(), true);
  assert.equal(m.run.phase, 'play'); assert.equal(m.run.touring(), false);
  c.cam.update(DT, new Set(), { in: false }, m.h);
  assert.ok(centred(c.cam, m.h) < 1e-6, 'snapped onto the hero');
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
  assert.ok(reveals(s.w).length === s.run.intro.reveals.length, 'pending reveals appear at once');
});

test('39: an unseen foe gets a start reveal at common (when the tour reaches it), not at hard without sc.reveal', () => {
  assert.equal(R.revealOn({ reveal: false }, IT.DIFFICULTY.get('common')), true);
  assert.equal(R.revealOn({ reveal: false }, IT.DIFFICULTY.get('hard')), false);
  assert.equal(R.revealOn({ reveal: true }, IT.DIFFICULTY.get('bambam')), true);
  for (const id of ['sun_flee', 'uphill_snipe', 'sun_snipe', 'fog_ambush', 'blink_fog']) assert.equal(SC.get(id).reveal, true, id);
  assert.equal(SC.get('river_guard').reveal, false);
  const m = build('river_guard', 'common'), I = m.run.intro;
  assert.ok(I.unseen.length > 0, 'river_guard has foes in the fog');
  assert.equal(I.reveals.length, I.unseen.length);
  const at = Math.min(...I.reveals.map(r => r.at));
  assert.ok(at > 1, 'reveals wait for the camera');
  assert.equal(reveals(m.w).length, 0);
  for (const id of I.unseen) assert.equal(m.w.get(id).visible, false);
  while (12 - m.run.cd < at + DT) m.run.tick(DT);
  const rv = reveals(m.w);
  assert.ok(rv.length > 0, 'reveal spawned');
  for (const t of rv) {
    const f = m.w.get(t.foe);
    assert.ok(f && Math.hypot(f.x - t.x, f.y - t.y) < 1, 'on its foe');
    assert.equal(f.visible, true, 'the foe is revealed');
    assert.equal(t.team, 0); assert.equal(t.r, R.REVEAL_R);
  }
  // hard, no flag: none (and the hidden foes are not toured)
  const hd = build('river_guard', 'hard');
  assert.ok(hd.run.intro.unseen.length > 0); assert.equal(hd.run.intro.reveals.length, 0);
  assert.ok(!hd.run.intro.stops.some(s => s.ids.some(id => hd.run.intro.unseen.includes(id))), 'unseen foes not toured');
  hd.run.skip(); assert.equal(reveals(hd.w).length, 0);
  // hard with the flag: revealed
  const up = build('uphill_snipe', 'hard');
  assert.ok(up.run.intro.unseen.length > 0); assert.equal(up.run.intro.reveals.length, up.run.intro.unseen.length);
});

test('39: the start reveal lingers ~1 s of play, then the foe hides again', () => {
  const m = build('river_guard', 'common');
  m.run.skip();   // pending reveals appear at round start
  assert.equal(m.run.phase, 'play');
  const ids = m.run.intro.unseen;
  assert.equal(reveals(m.w).length, ids.length);
  const steps = Math.round(R.REVEAL_LINGER / DT);
  for (let k = 0; k < steps - 3; k++) m.w.step();
  assert.equal(reveals(m.w).length, ids.length, 'still there at ~0.9 s');
  assert.ok(ids.some(id => m.w.get(id).visible), 'foes visible while it lingers');
  for (let k = 0; k < 6; k++) m.w.step();
  assert.equal(reveals(m.w).length, 0, 'gone after ~1 s');
});
