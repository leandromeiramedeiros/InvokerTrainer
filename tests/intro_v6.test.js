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
  assert.ok(I.text.hold >= 4 && I.text.hold <= 7, 'text phase 4-7 s: ' + I.text.hold);
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

test('66: the text phase = one element centre-stage at a time (stage + fly each), length from the element count, 4-7 s', () => {
  const fake = (name, win, lose, n) => ({ sc: { name: { en: name }, win: { en: win }, lose: { en: lose }, steps: Array.from({ length: n }, (_, i) => ({ a: ['sunstrike', 'coldsnap', 'emp', 'tornado', 'forgespirit', 'icewall', 'alacrity'][i] })) } });
  const EPS = 1e-9;
  const short = R.textPlan(fake('A', 'B', 'C', 0), 12), three = R.textPlan(fake('A', 'B', 'C', 3), 12), long = R.textPlan(fake('word '.repeat(10), 'word '.repeat(30), 'word '.repeat(30), 7), 12);
  assert.equal(R.TEXT_MIN, 4); assert.equal(R.TEXT_MAX, 7);
  assert.equal(short.hold, 4, 'a bare title / win / lose still holds 4 s'); assert.equal(long.hold, 7, 'many elements clamp at 7 s');
  assert.ok(three.hold >= 4 && three.hold <= 7);
  for (const p of [short, three, long]) {
    // order: title, VICTORY, DEFEAT, then the steps one by one; strictly one after the other (stage then fly), nothing overlaps
    assert.deepEqual(p.blocks.slice(0, 3).map(b => b.id), ['title', 'win', 'lose']);
    p.blocks.slice(3).forEach((b, i) => { assert.equal(b.id, 'step'); assert.equal(b.i, i); });
    assert.equal(p.blocks[0].at, 0);
    for (let i = 1; i < p.blocks.length; i++) assert.ok(Math.abs(p.blocks[i].at - (p.blocks[i - 1].at + p.blocks[i - 1].d)) < EPS, 'one after the other');
    for (const b of p.blocks) assert.ok(Math.abs(b.d - (b.stage + b.fly)) < EPS, 'd = stage + fly');
    const e = p.blocks[p.blocks.length - 1];
    assert.ok(Math.abs(p.end - (e.at + e.d)) < EPS); assert.ok(p.end <= p.hold - 0.3 + EPS, 'the last fly lands >= 0.3 s before the pan: ' + p.end + ' vs ' + p.hold);
  }
  // per-element timings when nothing is squeezed: title 0.8 + 0.3, steps 0.5 + 0.3, win / lose 0.5-0.8 + 0.3
  const b3 = three.blocks;
  assert.ok(Math.abs(b3[0].stage - 0.8) < EPS && Math.abs(b3[0].fly - 0.3) < EPS, 'title');
  for (const b of b3.slice(1, 3)) assert.ok(b.stage >= 0.5 - EPS && b.stage <= 0.8 + EPS && Math.abs(b.fly - 0.3) < EPS, b.id);
  for (const b of b3.slice(3)) assert.ok(Math.abs(b.stage - 0.5) < EPS && Math.abs(b.fly - 0.3) < EPS, 'step');
  assert.ok(Math.abs(three.raw - (0.8 + 0.3 + 2 * (0.5 + 0.3) + 0.3 + 3 * 0.8 + 0.2)) < 0.5, 'raw ~ sum of stages + flies: ' + three.raw);
  // squeezed (7 steps, long texts): every stage / fly shrinks together, the plan still fits
  assert.ok(long.blocks.every(b => b.stage < 0.8 + EPS && b.fly < 0.3 + EPS) && long.blocks[0].stage < 0.8);
  assert.ok(long.end <= 7 - 0.3 + EPS);
  assert.ok(R.textPlan(fake('a', 'b', 'c', 0), 6).hold <= 0.6 * 6 + EPS, 'a short countdown shortens the text phase');
  // the real plan is on the intro for every scenario: element order, within bounds, the pan starts only after the text phase
  for (const sc of SC) {
    const m = build(sc.id, 'common'), tp = m.run.intro.text;
    assert.deepEqual(tp.blocks.slice(0, 3).map(b => b.id), ['title', 'win', 'lose'], sc.id);
    assert.ok(tp.hold >= 4 - EPS && tp.hold <= 7 + EPS, sc.id + ': ' + tp.hold);
    assert.ok(m.run.intro.stops[1].t >= tp.hold - EPS, sc.id + ': pan after the text phase');
    assert.ok(tp.blocks.length <= 3 + 7, sc.id);
  }
  // frozen camera through the text phase: the first tourFocus after the hero stop starts at the end of the text phase
  const m = build('river_guard', 'common');
  for (let k = 0; k < Math.floor((m.run.intro.text.hold - 0.05) / DT); k++) m.run.tick(DT);
  assert.equal(m.ev.filter(e => e.ev === 'tourFocus' && e.i > 0).length, 0, 'no pan during the text phase');
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
    SCENARIOS: { get: () => ({ win: { en: 'Kill it' }, lose: { en: 'Die' } }) },
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
  assert.deepEqual(stings, ['introSlam']); assert.deepEqual(shakes, [5]);
  intro.t = 0.9; B.update(w, 0, false);
  assert.ok(toks[0].style.transition.startsWith('transform'), 'the title flies to its slot');
  intro.t = 1.2; B.update(w, 0, false);
  assert.deepEqual(stings.slice(0, 3), ['introSlam', 'introWhoosh', 'introWin']);
  intro.t = 2.1; B.update(w, 0, false); intro.t = 3.0; B.update(w, 0, false);
  assert.equal(stings.filter(s => s === 'introPunch').length, 1);
  intro.t = 3.8; B.update(w, 0, false);
  assert.equal(stings.filter(s => s === 'introPunch').length, 2); assert.ok(stings.indexOf('introLose') > stings.indexOf('introWin'));
  intro.t = 4.8; B.update(w, 0, false);
  assert.ok(brief.className.includes('fin') && !body.className.includes('bf-text'), 'the dim lifts and the real panel shows once the text phase ends');
  // the cancel path: an action ends the countdown -> overlay + dim + tokens vanish at once (no out animation)
  phase = 'play'; B.update(w, 0, false);
  assert.equal(brief.className, 'brief'); assert.equal(brief.kids.length, 0); assert.ok(!body.className.includes('briefing') && !body.className.includes('bf-text'));
  // ...also mid-slam: a fresh intro cancelled while the title is on stage
  phase = 'countdown'; w.ranked.intro = { t: 0.2, text: intro.text }; B.update(w, 0, false);
  assert.ok(stage.kids[0].className.includes('on') && body.className.includes('bf-text'));
  phase = 'play'; B.update(w, 0, false);
  assert.equal(stage.kids[0].className, 'brief'); assert.ok(!body.className.includes('bf-text') && !body.className.includes('briefing'));
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
