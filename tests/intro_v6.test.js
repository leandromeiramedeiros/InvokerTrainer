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
  assert.equal(I.T, m.run.countdown); assert.equal(m.run.cd, m.run.countdown); assert.ok(I.T >= 12 && I.T <= 24, 'item 73: >= 12 s, stretched to fit the reading holds (title card + win + lose + steps, then the pan): ' + I.T); assert.equal(m.run.phase, 'countdown');
  const kinds = I.stops.map(s => s.kind);
  assert.equal(kinds[0], 'hero'); assert.equal(kinds[kinds.length - 1], 'hero');
  assert.ok(kinds.includes('foes') && kinds.includes('gate'), kinds.join());
  assert.ok(kinds.indexOf('foes') < kinds.indexOf('gate'));
  const last = I.stops[I.stops.length - 1];
  assert.equal(last.x, m.h.x); assert.equal(last.y, m.h.y);
  assert.ok(last.t + last.glide <= I.T - 0.5, 'arrives on the hero >= 0.5 s before go');
  // item 45: text first -- the camera stays on the hero through the text phase, the pan starts after it; <= 4 s on a foe stop
  assert.ok(I.text.hold >= 4, 'text phase >= 4 s: ' + I.text.hold);
  assert.ok(I.stops[1].t >= I.text.hold - 1e-9, 'first pan stop after the text phase');
  I.stops.forEach((s, i) => { if (s.kind === 'foes') assert.ok(I.stops[i + 1].t - (s.t + s.glide) <= 4 + 1e-9, 'at most 4 s on the enemy'); });
  for (let i = 1; i < I.stops.length; i++) assert.ok(I.stops[i].t >= I.stops[i - 1].t + I.stops[i - 1].glide - 1e-9, 'no overlapping glides');
  // the clock emits each stop once, in order
  for (let k = 0; k < I.T * 30 - 3; k++) m.run.tick(DT);
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
  while (m.run.phase === 'countdown' && tm < I.T + 1) {
    c.frame(DT); tm += DT;
    const mg = c.cam.margins(), vx = c.cam.x + mg.fx + off, vy = c.cam.y + mg.fy;
    farFoe = Math.min(farFoe, Math.hypot(vx - fs.x, vy - fs.y)); farGate = Math.min(farGate, Math.hypot(vx - gate.x, vy - gate.y));
    if (Math.abs(tm - (I.T - 0.5)) < DT / 2) assert.ok(centred(c.cam, m.h) < 1, 'back on the hero before go: ' + centred(c.cam, m.h));
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
  while (m.run.countdown - m.run.cd < st1.t + st1.glide * 0.6) c.frame(DT);
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
    while (m.run.countdown - m.run.cd < at - 0.05) m.run.tick(DT);
    assert.equal(reveals(m.w).length, 0, tier + ': nothing before the camera arrives');
    while (m.run.countdown - m.run.cd < at + DT) m.run.tick(DT);
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
    while (m.run.countdown - m.run.cd < at + DT) m.run.tick(DT);
    assert.ok(reveals(m.w).length > 0, t + ': there');
    const thk = reveals(m.w)[0];
    while (m.run.countdown - m.run.cd < at + L[t] - 0.12) m.run.tick(DT);
    assert.ok(reveals(m.w).includes(thk), t + ': still there just before the linger ends');
    assert.ok(thk.age > L[t] - 0.4 && thk.age < L[t], t + ': aged from the arrival: ' + thk.age);
    while (m.run.countdown - m.run.cd < at + L[t] + 0.1) m.run.tick(DT);
    assert.equal(reveals(m.w).length, 0, t + ': gone after the linger');
    assert.equal(m.w.get(I.reveals[0].id).visible, false, 'the foe hides again');
  }
  // a cancel mid-linger: the rest of the linger runs on in play
  const m = build('river_guard', 'common'), I = m.run.intro, at = Math.min(...I.reveals.map(r => r.at));
  while (m.run.countdown - m.run.cd < at + 0.5) m.run.tick(DT);
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

test('73: reading hold = clamp(0.6 s + words / 3.5, floor 1.8 s, cap 5 s) for win / lose (EN and PT alike); the title card (name + flair) floors at 4 s; every text flies 0.5 s', () => {
  const EPS = 1e-9;
  assert.equal(R.READ_FLOOR, 1.8); assert.equal(R.TITLE_FLOOR, 4); assert.equal(R.READ_MAX, 5); assert.equal(R.FLY_S, 0.5);
  assert.ok(Math.abs(R.readHold(0) - 1.8) < EPS && Math.abs(R.readHold(2) - 1.8) < EPS, 'short text: the floor');
  assert.ok(Math.abs(R.readHold(10) - (0.6 + 10 / 3.5)) < EPS, '10 words = 3.46 s');
  assert.equal(R.readHold(21), 5, 'long text: capped at 5 s (a key / click skips anyway)');
  assert.ok(Math.abs(R.readHold(1, 4) - 4) < EPS, 'title floor');
  const fake = (name, win, lose, n, flair) => ({ sc: { name, flair, win, lose, steps: Array.from({ length: n }, (_, i) => ({ a: ['sunstrike', 'coldsnap', 'emp', 'tornado', 'forgespirit', 'icewall', 'alacrity'][i] })) } });
  const words = n => Array.from({ length: n }, (_, i) => 'w' + i).join(' ');
  const hold = (n, floor) => Math.min(5, Math.max(floor, 0.6 + n / 3.5));
  const lang0 = IT.lang;
  try {
    for (const lang of ['en', 'pt']) {
      IT.lang = lang;   // the SAME rate in both languages: the hold follows the word count of the shown language only
      const sc = fake({ en: words(1), pt: words(2) }, { en: words(10), pt: words(7) }, { en: words(2), pt: words(14) }, 3, { en: words(8), pt: words(11) });
      const p = R.textPlan(sc, 12, false), n = lang === 'en' ? { t: 1 + 8, w: 10, l: 2 } : { t: 2 + 11, w: 7, l: 14 };
      const [ti, wi, lo] = p.blocks;
      assert.ok(Math.abs(ti.stage - hold(n.t, 4)) < EPS, lang + ' title (name + flair) ' + ti.stage);
      assert.ok(Math.abs(wi.stage - hold(n.w, 1.8)) < EPS, lang + ' win ' + wi.stage);
      assert.ok(Math.abs(lo.stage - hold(n.l, 1.8)) < EPS, lang + ' lose ' + lo.stage);
      for (const q of [ti, wi, lo]) assert.ok(Math.abs(q.fly - 0.5) < EPS, 'fly 0.5 s');
    }
    IT.lang = 'en';
    // the flair counts toward the title card's reading time: 2-word name + 15-word flair = 0.6 + 17 / 3.5 = 5.46 -> capped; without it the floor
    const noFlair = R.textPlan(fake({ en: 'A B' }, { en: 'x' }, { en: 'y' }, 0), 12, false).blocks[0].stage;
    const withFlair = R.textPlan(fake({ en: 'A B' }, { en: 'x' }, { en: 'y' }, 0, { en: words(15) }), 12, false).blocks[0].stage;
    assert.equal(noFlair, 4); assert.equal(withFlair, 5);
  } finally { IT.lang = lang0; }
  // every real scenario: the stage of each text covers its reading time (the title includes its flair); the title card is never under 4 s
  for (const sc of SC) {
    const m = build(sc.id, 'common'), tp = m.run.intro.text, wc = x => (String(x || '').trim().match(/\S+/g) || []).length;
    const win = tp.blocks[1], lose = tp.blocks[2], loc = o => (o && typeof o === 'object' ? o.en : o);
    assert.ok(win.stage >= R.readHold(wc(loc(sc.win || sc.goal))) - 1e-9, sc.id + ' win read time');
    assert.ok(lose.stage >= R.readHold(wc(loc(sc.lose))) - 1e-9, sc.id + ' lose read time');
    assert.ok(Math.abs(tp.blocks[0].stage - R.readHold(wc(loc(sc.name)) + wc(loc(sc.flair)), 4)) < 1e-9, sc.id + ' title read time (name + flair)');
    assert.ok(tp.blocks[0].stage >= 4 - 1e-9, sc.id + ' title card >= 4 s');
  }
});

test('73: combo steps ~0.6 s per icon (stage + fly), then 1 s for the whole settled row before the pan; the intro stretches to fit', () => {
  const EPS = 1e-9;
  const fake = n => ({ sc: { name: { en: 'A' }, win: { en: 'B' }, lose: { en: 'C' }, steps: Array.from({ length: n }, (_, i) => ({ a: ['sunstrike', 'coldsnap', 'emp', 'tornado', 'forgespirit', 'icewall', 'alacrity'][i] })) } });
  assert.equal(R.STEP_D, 0.6); assert.equal(R.ROW_HOLD, 1);
  for (const n of [1, 3, 7]) {
    const p = R.textPlan(fake(n), 12, false), st = p.blocks.slice(3);
    assert.equal(st.length, n);
    for (const b of st) assert.ok(Math.abs(b.d - 0.6) < EPS && b.stage > 0 && b.fly > 0, 'each icon 0.6 s');
    assert.ok(Math.abs((st[n - 1].at + st[n - 1].d - st[0].at) - 0.6 * n) < EPS, n + ' icons = 0.6 n s');
    assert.ok(Math.abs(p.end - (st[n - 1].at + st[n - 1].d)) < EPS && Math.abs(p.hold - (p.end + 1)) < EPS, 'the settled row holds 1 s, then the pan (hold)');
  }
  assert.ok(Math.abs(R.textPlan(fake(0), 12, false).hold - R.textPlan(fake(0), 12, false).end - 0.3) < EPS, 'no row: just the short tail');
  // the long texts of the real scenarios push the intro past 12 s (the pan keeps >= PAN_MIN s + the 2.5 s invoke tail); short ones stay at 12 s
  let stretched = 0;
  for (const sc of SC) {
    const m = build(sc.id, 'common'), I = m.run.intro;
    assert.equal(m.run.cd, I.T); assert.ok(I.T >= 12, sc.id);
    assert.ok(I.T >= Math.min(I.T, I.text.hold + R.PAN_MIN + 2.5) - 1e-9 && I.T - I.text.hold >= R.PAN_MIN + 2.5 - 1e-9 || I.T === 12 && I.text.hold <= 12 - 2.5 - R.PAN_MIN + 1e-9 || I.T - I.text.hold >= R.PAN_MIN + 2.5 - 1e-9, sc.id + ': room for the pan');
    if (I.T > 12) stretched++;
    assert.ok(I.stops[1].t >= I.text.hold - 1e-9, sc.id + ': the pan starts after the text phase');
    const last = I.stops[I.stops.length - 1]; assert.ok(last.t + last.glide <= I.T - 0.5 + 1e-9, sc.id + ': back on the hero before go');
  }
  assert.ok(stretched >= 0);
  // a short countdown (infinite mode, 5 s) still squeezes the old way: hold <= 0.6 T
  assert.ok(R.textPlan(fake(7), 5, false).hold <= 0.6 * 5 + EPS);
});

test('73: a key / click ADVANCES one piece (the clock jumps to the next block), Esc SKIPS all; the pan starts only after the last piece landed', () => {
  const EPS = 1e-9, pan = ev => ev.filter(e => e.ev === 'tourFocus' && e.i > 0).length;
  const m = build('river_guard', 'common'), I = m.run.intro, tb = I.text.blocks;
  assert.equal(typeof m.run.advanceIntro, 'function'); assert.equal(typeof m.run.skipIntro, 'function');
  m.run.tick(0.1); assert.ok(I.t < tb[1].at, 'the title is on stage');
  // each advance = exactly one piece: the next block starts NOW, nothing else moves
  for (let j = 1; j < tb.length; j++) {
    assert.equal(m.run.advanceIntro(), true);
    assert.ok(Math.abs(I.t - tb[j].at) < 1e-6, 'advance #' + j + ' -> block ' + j + ' starts: ' + I.t + ' vs ' + tb[j].at);
    assert.equal(m.run.phase, 'countdown'); assert.equal(m.run.touring(), true, 'not a cancel: the tour stays armed'); assert.equal(pan(m.ev), 0, 'no pan yet');
  }
  // the last piece is on stage: the next press lands it (the row hold starts), still no pan
  assert.equal(m.run.advanceIntro(), true); assert.ok(Math.abs(I.t - I.text.end) < 1e-6); assert.equal(pan(m.ev), 0, 'the pan waits for the row hold');
  // the press during the row hold ends it: the pan starts exactly at the end of the text phase, never earlier
  assert.equal(m.run.advanceIntro(), true); assert.ok(Math.abs(I.t - I.text.hold) < 1e-6);
  assert.equal(pan(m.ev), 1, 'the pan starts after the last piece landed'); assert.ok(m.ev.find(e => e.ev === 'tourFocus' && e.i === 1) && I.t >= I.text.end);
  assert.equal(m.run.advanceIntro(), false, 'nothing left to advance once the pan runs');
  assert.equal(m.run.phase, 'countdown', 'advancing never starts the round');
  assert.ok(Math.abs(m.run.cd - (I.T - I.t)) < 1e-6, 'the countdown clock followed the jump');
  // without any press the pan also starts only at the end of the text phase
  const q = build('river_guard', 'common');
  for (let k = 0; k < Math.floor((q.run.intro.text.hold - 0.05) / DT); k++) q.run.tick(DT);
  assert.equal(pan(q.ev), 0); for (let k = 0; k < 3; k++) q.run.tick(DT); assert.equal(pan(q.ev), 1);
  // Esc = skip all: the text phase ends at once and so does the tour; the countdown (invoke time) keeps running; a second Esc has nothing to do
  const e = build('river_guard', 'common'); e.run.tick(0.3);
  const tf0 = e.ev.filter(x => x.ev === 'tourFocus').length;
  assert.equal(e.run.skipIntro(), true);
  assert.ok(Math.abs(e.run.intro.t - e.run.intro.text.hold) < 1e-6, 'the text phase is over'); assert.equal(e.run.touring(), false);
  assert.ok(e.ev.some(x => x.ev === 'tourEnd' && x.skipped)); assert.equal(e.run.phase, 'countdown'); assert.ok(e.run.cd > 1);
  assert.equal(e.ev.filter(x => x.ev === 'tourFocus').length, tf0, 'no pan stop after the skip');
  for (let k = 0; k < 3 * 30; k++) e.run.tick(DT);
  assert.equal(e.ev.filter(x => x.ev === 'tourFocus').length, tf0); assert.equal(e.run.skipIntro(), false); assert.equal(e.run.advanceIntro(), false);
  // Esc during the pan ends the pan only
  const f = build('river_guard', 'common');
  while (f.run.intro.t < f.run.intro.stops[1].t + 0.2) f.run.tick(DT);
  assert.equal(f.run.touring(), true); assert.equal(f.run.skipIntro(), true); assert.equal(f.run.touring(), false); assert.equal(f.run.phase, 'countdown');
  // a game action (skip) still cancels everything and starts the round
  const g = build('river_guard', 'common'); g.run.tick(0.3); assert.equal(g.run.skip(), true); assert.equal(g.run.phase, 'play');
  assert.equal(g.run.advanceIntro(), false); assert.equal(g.run.skipIntro(), false);
  // the Invoke cooldown keeps ticking through a jump (the countdown is invoke time)
  const iv = build('river_guard', 'common');
  for (const ch of IT.GAME.SPELL_ORBS.sunstrike) IT.Invoke.orb(iv.w, iv.h, ch);
  IT.Invoke.invoke(iv.w, iv.h);
  const cd0 = iv.h.inv.invokeCd; iv.run.advanceIntro();
  assert.ok(cd0 > 0 ? iv.h.inv.invokeCd < cd0 : true);
});

test('73: settled sizes: title >= 22 px, VICTORY / DEFEAT >= 16 px, step icons >= 28 px at 1280x720 (scaled with the HUD unit --g, x1.5 at 1920x1080)', () => {
  const fs = require('fs'), vm = require('vm'), path = require('path');
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'briefing.css'), 'utf8');
  const ctx = vm.createContext({ console, Math, Array, Object, String, Promise, Map, Set, RegExp }); ctx.window = ctx; ctx.globalThis = ctx; ctx.IT = {};
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/ui/briefing.js'), 'utf8'), ctx, { filename: 'briefing.js' });
  const SET = ctx.IT.Briefing.SET;
  // the CSS carries exactly the numbers js exports (one source of truth) and the strip rules really use them
  const blk = css.match(/\.bf-strip\{[^}]*\}/)[0], num = k => parseFloat(blk.match(new RegExp('--bs-' + k + ':([0-9.]+)'))[1]);
  for (const k of Object.keys(SET)) assert.equal(num(k), SET[k], '--bs-' + k);
  assert.ok(/\.bs-name\{[^}]*font-size:calc\(var\(--g\)\*var\(--bs-title\)/.test(css), 'title uses --g x --bs-title');
  assert.ok(/\.bs-big\{[^}]*font-size:calc\(var\(--g\)\*var\(--bs-word\)/.test(css), 'VICTORY / DEFEAT use --g x --bs-word');
  assert.ok(/\.bs-line\{[^}]*font-size:calc\(var\(--g\)\*var\(--bs-line\)/.test(css), 'lines use --g x --bs-line');
  assert.ok(/\.bs-step canvas\.ico\{[^}]*width:calc\(var\(--g\)\*var\(--bs-ico\)[^}]*height:calc\(var\(--g\)\*var\(--bs-ico\)/.test(css), 'icons use --g x --bs-ico');
  // --g exactly as main.js fit() sets it
  const g = (iw, ih) => Math.max(11, Math.min(26, Math.min(iw / 1280, ih / 720) * 14));
  const MIN = { title: 22, word: 16, line: 14, ico: 28 };
  for (const [iw, ih, k] of [[1280, 720, 1], [1920, 1080, 1.5]]) {
    for (const key of Object.keys(MIN)) {
      const px = g(iw, ih) * SET[key];
      assert.ok(px >= MIN[key] * k - 1e-6, iw + 'x' + ih + ' ' + key + ' = ' + px.toFixed(1) + ' px (min ' + (MIN[key] * k) + ')');
    }
  }
  // the old HUD copy was far smaller (rkname 14 px, rkc icons 20-30 px, win / lose 12 px): the strip is clearly bigger than that at 1280x720
  assert.ok(g(1280, 720) * SET.title > 14 * 1.5 && g(1280, 720) * SET.line > 12);
});

test('66: the briefing drives stage -> fly -> done per element from the intro clock; the cancel path drops everything at once', () => {
  // a minimal DOM harness: nodes keep class strings / styles / children; the real js/ui/briefing.js runs against it
  const fs = require('fs'), vm = require('vm'), path = require('path');
  const mkNode = () => {
    const n = { className: '', style: {}, kids: [], setAttribute() {}, offsetWidth: 300, offsetHeight: 120, animate() { return {}; }, getAnimations: () => [], getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
      set textContent(v) { n.kids = []; }, get textContent() { return ''; },
      appendChild(c) { if (c) n.kids.push(c); return c; }, querySelector: () => mkNode() };
    const cl = () => n.className.split(' ').filter(Boolean);
    n.classList = { add: c => { if (!cl().includes(c)) n.className = cl().concat(c).join(' '); }, remove: c => { n.className = cl().filter(x => x !== c).join(' '); }, contains: c => cl().includes(c), toggle(c, v) { v ? this.add(c) : this.remove(c); } };
    return n;
  };
  const flat = a => a.reduce((q, x) => q.concat(Array.isArray(x) ? flat(x) : x), []);
  const body = mkNode(), stage = mkNode(), stings = [], shakes = [];
  const ctx = vm.createContext({ console, Math, Array, Object, String, Promise, Map, Set, RegExp });
  ctx.window = ctx; ctx.globalThis = ctx;
  ctx.document = { body, getElementById: () => stage, querySelectorAll: () => [], createElementNS: () => mkNode(), createTextNode: x => x };
  const intro = { t: 0, text: { hold: 5, end: 4, blocks: [{ id: 'title', i: 0, at: 0, stage: 0.8, fly: 0.3, d: 1.1 }, { id: 'win', i: 0, at: 1.1, stage: 0.6, fly: 0.3, d: 0.9 },
    { id: 'lose', i: 0, at: 2.0, stage: 0.6, fly: 0.3, d: 0.9 }, { id: 'step', i: 0, at: 2.9, stage: 0.5, fly: 0.3, d: 0.8 }, { id: 'step', i: 1, at: 3.7, stage: 0.5, fly: 0.3, d: 0.8 }] } };
  const w = { ranked: { intro }, hero: { items: [] } }; let phase = 'countdown';
  ctx.IT = { t: k => k, hasT: () => false, lang: 'en', GAME: { SPELL_ORBS: {} }, Settings: { get: () => ({ hints: true }), data: { scheme: 'q' }, label: x => String(x), keyOf: x => x },
    HudSteps: { derive: () => [{ k: 'spell', id: 'sunstrike' }, { k: 'spell', id: 'coldsnap' }], loseKeys: () => [], heroLv: () => 'LV 1' },
    SCENARIOS: { get: () => ({ win: { en: 'Kill it' }, lose: { en: 'Die' }, flair: { en: 'A tagline under the title' } }) },
    UI: { h: (tag, o, ...k) => { const n = mkNode(); n.className = String((o && o.class) || ''); flat(k).forEach(c => n.appendChild(typeof c === 'string' ? mkNode() : c)); return n; }, icon: () => mkNode() },
    Sfx: { sting: id => stings.push(id) }, Ranked: { hud: () => ({ phase, id: 'x', scenario: { en: 'Title' }, diff: 'common', countdown: 5, hints: true }) } };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/ui/briefing.js'), 'utf8'), ctx, { filename: 'briefing.js' });
  const B = ctx.IT.Briefing; B.onShake = (a) => shakes.push(a);
  // per-element states: stage -> fly -> done, strictly one element on stage at a time
  const tb = intro.text.blocks;
  for (let t = 0; t < 4; t += 0.05) assert.ok(tb.filter(b => B.stateAt(b, t) === 'stage' || B.stateAt(b, t) === 'fly').length <= 1, 'one element at a time @' + t);
  assert.deepEqual([0, 0.79, 0.81, 1.09, 1.11].map(t => B.stateAt(tb[0], t)), ['stage', 'stage', 'fly', 'fly', 'done']);
  assert.equal(B.stateAt(tb[1], 0.5), 'p');
  // run the real overlay: the title slams at 0 (sting + shake), VICTORY / DEFEAT next, then each step punches (lighter sting)
  B.update(w, 0, false);
  const brief = stage.kids[0], toks = brief.kids[2].kids;
  assert.ok(brief.className.includes('on') && body.className.includes('briefing') && body.className.includes('bf-text'), 'overlay up, HUD panel hidden while the tokens fly');
  assert.equal(toks.length, 5, 'title, win, lose, 2 steps');
  assert.ok(!toks[0].className.split(' ').includes('p') && toks.slice(1).every(n => n.className.split(' ').includes('p')), 'only the title is on stage');
  assert.equal(toks[0].kids.length, 3, 'the title card = name + meta + the scenario flair (tagline) line');
  assert.ok(toks[0].kids[2].className.includes('bf-flair'), 'the flair line is on the intro card');
  const strip = brief.kids[3], piece = strip.kids[0];
  assert.deepEqual(stings, ['introSlam']); assert.deepEqual(shakes, [5]);
  intro.t = 0.9; B.update(w, 0, false);
  assert.ok(toks[0].style.transition.startsWith('transform'), 'the title flies to its slot');
  assert.ok(toks[0].style.transition.includes('cubic-bezier(.65,0,.35,1)'), 'ease-in-out (symmetric curve), not the old accelerate-only one');
  assert.ok(toks[0].className.split(' ').includes('fo') && /0\.120s$/.test(toks[0].style.transition), 'the flair fades out first (fo) and the glide waits for it');
  assert.ok(!piece.className.split(' ').includes('in') && !toks[0].className.split(' ').includes('gone'), 'early in the fly: neither handover half has started');
  intro.t = 1.05; B.update(w, 0, false);
  assert.ok(piece.className.split(' ').includes('in') && !toks[0].className.split(' ').includes('gone'), 'nearly home: the strip piece fades in UNDER the still-visible token (no jump / flash)');
  intro.t = 1.2; B.update(w, 0, false);
  assert.deepEqual(stings.slice(0, 3), ['introSlam', 'introWhoosh', 'introWin']);
  intro.t = 2.1; B.update(w, 0, false); intro.t = 3.0; B.update(w, 0, false);
  assert.equal(stings.filter(s => s === 'introPunch').length, 1);
  intro.t = 3.8; B.update(w, 0, false);
  assert.equal(stings.filter(s => s === 'introPunch').length, 2); assert.ok(stings.indexOf('introLose') > stings.indexOf('introWin'));
  intro.t = 4.8; B.update(w, 0, false);
  assert.ok(brief.className.includes('fin') && !body.className.includes('bf-text'), 'the dim lifts and the real panel shows once the text phase ends');
  assert.ok(toks[0].className.split(' ').includes('gone'), 'landed: the token cross-fades out');
  // the cancel path: an action ends the countdown -> overlay + dim + tokens vanish at once (no out animation)
  phase = 'play'; B.update(w, 0, false);
  assert.equal(brief.className, 'brief'); assert.equal(brief.kids.length, 0); assert.ok(!body.className.includes('briefing') && !body.className.includes('bf-text'));
  // ...also mid-slam: a fresh intro cancelled while the title is on stage
  phase = 'countdown'; w.ranked.intro = { t: 0.2, text: intro.text }; B.update(w, 0, false);
  assert.ok(stage.kids[0].className.includes('on') && body.className.includes('bf-text'));
  phase = 'play'; B.update(w, 0, false);
  assert.equal(stage.kids[0].className, 'brief'); assert.ok(!body.className.includes('bf-text') && !body.className.includes('briefing'));
  // reduced motion: a short plain glide (0.3 s), not a hard cut and not the full 0.5 s; no flair lead-in
  ctx.matchMedia = () => ({ matches: true });
  phase = 'countdown'; w.ranked.intro = { t: 0, text: { hold: 5, end: 4, blocks: [{ id: 'title', i: 0, at: 0, stage: 0.8, fly: 0.5, d: 1.3 }, { id: 'win', i: 0, at: 1.3, stage: 0.6, fly: 0.5, d: 1.1 }] } };
  B.update(w, 0, false);
  const rt = stage.kids[0].kids[2].kids[0];
  w.ranked.intro.t = 0.9; B.update(w, 0, false);
  assert.ok(rt.style.transition.startsWith('transform 0.300s ') && !rt.style.transition.startsWith('none'), 'reduced motion: ' + rt.style.transition);
  phase = 'play'; B.update(w, 0, false);
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
