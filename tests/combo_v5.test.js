'use strict';
// Batch D: timing-derived tips/windows, new staple combos, early/late/order feedback, anyOrder groups, tier scores.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/combos.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/combo.js', 'js/sim/stats.js'];
const IT = load(FILES);
const map = IT.Map.build(IT.MAPDEF);
const C = IT.COMBOS;
const ORB = { Q: 'quas', W: 'wex', E: 'exort' };

function mk(extra, o) {
  o = o || {};
  const lo = IT.Loadout.normalize(Object.assign({}, IT.Loadout.default(), extra || {}));
  const w = IT.World.create({ seed: o.seed || 7, map, loadout: lo, fog: !!o.fog, autoAttack: false });
  const sp = map.spawns.hero;
  const h = IT.Hero.create(w, lo, sp.x, sp.y);
  const d = IT.Units.spawnDummy(w, { x: h.x + 600, y: h.y, preset: 'training', skin: 'pedro' });
  const run = n => { for (let i = 0; i < n; i++) w.step(); };
  const runT = s => run(Math.round(s * 30));
  return { w, h, d, run, runT };
}
const dummyOf = w => w.query(e => e.kind === 'dummy')[0];
const logOf = (w, t) => w.log.filter(e => e.type === t);

// ---- generic bot: plays any combo from its step list
function prep(w, h, ab) {
  const def = IT.Abilities.get(ab);
  if (!def || def.kind === 'item' || !IT.GAME.SPELL_ORBS[ab]) return;
  if (h.inv.slots.includes(ab) || h.inv.invokeCd > 0) return;
  for (const ch of IT.GAME.SPELL_ORBS[ab]) IT.Invoke.orb(w, h, ch);
  IT.Invoke.invoke(w, h);
}
const act = w => w.combo.phase === 'active';
function play(w, h, id, o) {
  o = o || {};
  const c = IT.Combo.get(id), steps = c.steps;
  const hidden = steps.some(s => s.targetVisibility === 'hidden');
  if (!hidden) {   // bot walks up to the dummy (a spot with line of sight)
    const d0 = dummyOf(w);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, x = d0.x + Math.cos(a) * 450, y = d0.y + Math.sin(a) * 450;
      if (!map.walkable(x, y)) continue;
      h.x = x; h.y = y;
      if (IT.Vision.canSee(w, d0, h)) break;
    }
    w.step();
  if (c.scenario.stunBolt) for (let k = 0; k < 60 && act(w) && !logOf(w, 'bolt').some(e => e.phase === 'start' && e.t >= w.combo.startT); k++) w.step();
  }
  for (let i = 0; i < steps.length && act(w); i++) {
    const s = steps[i];
    const nextSpell = steps.slice(i).find(x => x.type === 'cast');
    const prev = steps[i - 1];
    const d1 = dummyOf(w), gap = Math.hypot(d1.x - h.x, d1.y - h.y);
    const win = IT.Combo.windowOf(c, i, IT.Combo.timing(h.ctx), { dist: gap });
    let wait = o.wait != null ? o.wait : win ? win.wait : (s.wait != null ? s.wait : 0.1);
    if (o.shift && o.shift.index === i) wait += o.shift.by;
    let refT = w.t;   // windows count from the ref step's cast, or from its hit when fx
    if (win && o.wait == null) {
      const row = () => w.combo.steps[win.ref];
      if (win.fx) for (let k = 0; k < 300 && act(w) && row().effT == null && w.combo.pending.some(q => q.idx === win.ref && q.state === 'open'); k++) w.step();
      refT = win.fx && row().effT != null ? row().effT : row().castT != null ? row().castT : w.t;
    }
    for (let k = 0; k < 900 && act(w) && w.t < refT + wait - 1e-6; k++) { if (nextSpell) prep(w, h, nextSpell.ability); w.step(); }
    if (!act(w)) return;
    if (s.type === 'cast' || s.type === 'item') {
      let guard = 0;
      while (s.type === 'cast' && !h.inv.slots.includes(s.ability) && guard++ < 400) { prep(w, h, s.ability); w.step(); }
      const spirit = s.onSpirit && w.query(e => e.kind === 'spirit' && e.owner === h.id)[0];
      const t = spirit || (s.selfCast || s.ability === 'alacrity') ? (spirit || h) : s.targetVisibility === 'hidden' ? w.combo.hint : dummyOf(w);
      if (s.ability === 'icewall') { h.x = t.x - 150; h.y = t.y; h.facing = 0; }   // bot steps up to the target and faces it
      const pull = steps[i + 1] && steps[i + 1].react === 'empPull';   // pull needs the target off-centre, toward the (clear) hero side
      const ang = Math.atan2(h.y - t.y, h.x - t.x), ox = pull ? Math.cos(ang) * 300 : 0, oy = pull ? Math.sin(ang) * 300 : 0;
      IT.Orders.issue(w, h, { queued: !!(prev && prev.ability === 'meteorhammer'), type: 'cast', ability: s.ability, x: t.x + ox, y: t.y + oy, target: t === h ? h.id : t.id && s.targetVisibility !== 'hidden' ? t.id : undefined });
      for (let k = 0; k < 90 && w.combo.stepIndex <= i && act(w); k++) w.step();
    } else if (s.type === 'position' || s.type === 'move') {
      const d0 = dummyOf(w), ang = Math.atan2(h.y - d0.y, h.x - d0.x);
      if (s.type === 'position') { const r = ((s.minDist || 0) + (s.maxDist || 600)) / 2; h.x = d0.x + Math.cos(ang) * r; h.y = d0.y + Math.sin(ang) * r; }
      else { const k = s.dir === 'toward' ? -1 : 1; IT.Orders.issue(w, h, { type: 'move', x: h.x + Math.cos(ang) * k * (s.dist + 60), y: h.y + Math.sin(ang) * k * (s.dist + 60) }); }
      for (let k = 0; k < 300 && w.combo.stepIndex <= i && act(w); k++) w.step();
    } else if (s.type === 'attack') {
      IT.Orders.issue(w, h, { type: 'attack', target: dummyOf(w).id });
      for (let k = 0; k < 600 && w.combo.stepIndex <= i && act(w); k++) w.step();
    } else {
      for (let k = 0; k < 300 && w.combo.stepIndex <= i && act(w); k++) w.step();
    }
  }
  for (let k = 0; k < 400 && act(w); k++) w.step();
}


// ---- helpers
const NEW = ['i_emp_tornado', 'i_coldsnap_meteor', 'i_forge_alacrity_spirits', 'a_blast_push_meteor', 'a_tornado_emp_sun_meteor_blast', 't_refresher_full'];
const q = n => IT.Values.ctx(IT.Loadout.normalize(Object.assign({}, IT.Loadout.default(), { heroLevel: 30, orbs: { quas: n, wex: 7, exort: 7 } })));
const r1 = x => String(Math.round(x * 10) / 10);
const firstAt = c => c.steps.findIndex(s => typeof s.at === 'function');
function castNow(w, h, ab, tgt) {   // invoke if needed, order the cast, run until it is cast
  prep(w, h, ab);
  let g = 0; while (!h.inv.slots.includes(ab) && g++ < 400) w.step();
  const t = tgt || dummyOf(w), n = logOf(w, 'cast').length;
  IT.Orders.issue(w, h, { type: 'cast', ability: ab, x: t.x, y: t.y, target: t === h ? h.id : t.id });
  for (let k = 0; k < 90 && logOf(w, 'cast').length === n; k++) w.step();
}

test('tornado -> sun strike: wait = lift - 1.7 (+margin) per Quas level, tip shows the numbers', () => {
  const c = IT.Combo.get('i_tornado_sunstrike');
  let prevLift = 0;
  for (const qn of [1, 3, 5, 7]) {
    const ctx = q(qn), T = IT.Combo.timing(ctx);
    assert.ok(T.lift > prevLift, 'lift grows with Quas'); prevLift = T.lift;
    assert.equal(T.lift, IT.Values.get('invoker_tornado', 'lift_duration', ctx));
    assert.equal(T.ss, 1.7);
    const wait = IT.Combo.waitOf(c, 1, T);
    assert.ok(Math.abs(wait - Math.max(0, T.lift - 1.7 + 0.1)) < 1e-9, `Q${qn} wait ${wait}`);
    const en = IT.Combo.tipText(c, ctx, 'en'), pt = IT.Combo.tipText(c, ctx, 'pt');
    assert.ok(en.includes(r1(T.lift) + ' s') && en.includes('1.7 s'), en);
    assert.ok(pt.includes(r1(T.lift).replace('.', ',') + ' s') && pt.includes('1,7 s'), pt);
    if (wait > 0.05) assert.ok(en.includes(r1(wait) + ' s after'), en); else assert.ok(en.includes('right as'), en);
  }
  assert.equal(IT.Combo.waitOf(c, 1, IT.Combo.timing(q(1))), 0);   // lift < 1.7 at Quas 1: cast at once
  assert.ok(IT.Combo.waitOf(c, 1, IT.Combo.timing(q(7))) > 0.5);
  assert.ok(!/1\.3 s/.test(IT.Combo.tipText(c, q(7), 'en')), 'the old wrong "~1.3 s" is gone');
});

test('EMP and Meteor timings in the tornado combos come from the KV, not constants', () => {
  for (const qn of [1, 7]) {
    const ctx = q(qn), T = IT.Combo.timing(ctx);
    assert.equal(T.emp, IT.Values.get('invoker_emp', 'delay', ctx)); assert.equal(T.emp, 2.9);
    assert.equal(T.meteor, IT.Values.get('invoker_chaos_meteor', 'land_time', ctx)); assert.equal(T.meteor, 1.3);
    for (const id of ['i_tornado_emp', 'a_tornado_emp_meteor_blast', 'a_tornado_meteor_blast', 'a_tornado_sunstrike_meteor']) {
      const c = IT.Combo.get(id), en = IT.Combo.tipText(c, ctx, 'en');
      assert.ok(en.includes(r1(T.lift) + ' s'), id + ': ' + en);
      if (/emp/.test(id)) assert.ok(en.includes('2.9 s'), id);
      if (/meteor/.test(id)) assert.ok(en.includes('1.3 s'), id);
    }
    // meteor lands as the Tornado drops: wait = lift - 1.3 (+margin), never negative
    const m = IT.Combo.get('a_tornado_meteor_blast');
    assert.ok(Math.abs(IT.Combo.waitOf(m, 1, T) - Math.max(0, T.lift - 1.3 + 0.1)) < 1e-9);
    // EMP right after the tornado hit: wait = lift - 2.9 (negative = before the hit lands)
    const e = IT.Combo.windowOf(IT.Combo.get('i_tornado_emp'), 1, T, {});
    assert.ok(Math.abs(e.wait - (T.lift - 2.9)) < 1e-9 && e.wait < 0 && e.hi > 0);
  }
  for (const c of C) if (c.tipFn) { const t = c.tip; assert.ok(t.en && t.pt, c.id); }   // default-build getter
});

test('new combos exist, are well-formed and the bot completes them', () => {
  for (const id of NEW) {
    const c = IT.Combo.get(id); assert.ok(c, id);
    assert.ok(c.tip.en.length > 20 && c.tip.pt.length > 20, id);
    const { w, h } = mk({}, { seed: 5 });
    assert.ok(IT.Combo.start(w, id, { grantMissing: true }), id);
    play(w, h, id);
    assert.equal(logOf(w, 'comboDone').length, 1, id + ' fails=' + logOf(w, 'comboFail').map(e => e.reason));
  }
  const rf = IT.Combo.get('t_refresher_full').steps.map(s => s.ability);
  assert.deepEqual(rf, ['tornado', 'emp', 'chaosmeteor', 'deafeningblast', 'refresher', 'chaosmeteor', 'deafeningblast']);
  assert.deepEqual(IT.Combo.get('a_tornado_emp_sun_meteor_blast').steps.map(s => s.ability), ['tornado', 'emp', 'sunstrike', 'chaosmeteor', 'deafeningblast']);
  assert.deepEqual(IT.Combo.get('i_emp_tornado').steps.filter(s => s.type === 'cast').map(s => s.ability), ['emp', 'tornado']);
  assert.ok(IT.Combo.get('i_forge_alacrity_spirits').steps.some(s => s.onSpirit));
});

test('mistimed: too late fails with reason late (and s > 0) on every windowed combo', () => {
  for (const c of C) {
    const i = firstAt(c); if (i < 0) continue;
    const { w, h } = mk({}, { seed: 11 });
    const win = IT.Combo.windowOf(c, i, IT.Combo.timing(h.ctx), { dist: 500 });
    IT.Combo.start(w, c.id, { grantMissing: true });
    play(w, h, c.id, { shift: { index: i, by: win.hi - win.wait + 0.6 } });   // just past the window
    const f = logOf(w, 'comboFail')[0];
    assert.ok(f && f.reason === 'late' && f.s > 0, `${c.id}: ${f && f.reason}`);
    assert.equal(logOf(w, 'comboDone').length, 0, c.id);
  }
});

test('mistimed: too early fails with reason early where the window has a lower bound', () => {
  let n = 0;
  for (const c of C) {
    const i = firstAt(c); if (i < 0) continue;
    const { w, h } = mk({}, { seed: 11 });
    const win = IT.Combo.windowOf(c, i, IT.Combo.timing(h.ctx), { dist: 500 });
    if (win.lo < 0.15) continue;
    IT.Combo.start(w, c.id, { grantMissing: true });
    play(w, h, c.id, { shift: { index: i, by: -win.wait } });   // cast straight on the ref
    const f = logOf(w, 'comboFail')[0];
    assert.ok(f && f.reason === 'early' && f.s > 0, `${c.id}: ${f && f.reason}`);
    n++;
  }
  assert.ok(n >= 10, 'early checked on ' + n + ' combos');
});

test('tornado -> sun strike cast at the hit is rejected early; the right delay lands', () => {
  const run = by => {
    const { w, h } = mk({}, { seed: 2 });
    IT.Combo.start(w, 'i_tornado_sunstrike', { grantMissing: true });
    play(w, h, 'i_tornado_sunstrike', { shift: { index: 1, by } });
    return w;
  };
  const T = IT.Combo.timing(mk().h.ctx), wait = IT.Combo.waitOf(IT.Combo.get('i_tornado_sunstrike'), 1, T);
  assert.ok(wait > 0.4);
  const bad = run(-wait);
  assert.equal(logOf(bad, 'comboFail')[0].reason, 'early');
  assert.equal(logOf(run(0), 'comboDone').length, 1);
});

test('tolerance is wider on easy tiers', () => {
  assert.ok(IT.Combo.TOL.basic > IT.Combo.TOL.intermediate && IT.Combo.TOL.intermediate > IT.Combo.TOL.advanced);
  const step = { type: 'cast', ability: 'emp', at: () => ({ ref: 0, wait: 1, early: 0.5, late: 1 }) };
  const mkc = tier => ({ tier, steps: [{ type: 'cast', ability: 'tornado' }, step] });
  const wd = tier => { const x = IT.Combo.windowOf(mkc(tier), 1, {}, {}); return x.hi - x.lo; };
  assert.ok(wd('basic') > wd('intermediate') && wd('intermediate') > wd('advanced'));
  assert.equal(wd('advanced'), 1.5);
});

test('wrong order / foreign spell / wrong target emit comboHint and do not advance', () => {
  const { w, h } = mk({}, { seed: 4 });
  IT.Combo.start(w, 'i_tornado_emp', { grantMissing: true });
  castNow(w, h, 'emp');
  let hint = logOf(w, 'comboHint').pop();
  assert.ok(hint, 'order hint');
  assert.equal(hint.kind, 'order'); assert.equal(hint.got, 'emp'); assert.equal(hint.expected, 'tornado');
  assert.equal(w.combo.stepIndex, 0); assert.ok(w.combo.extra >= 1);
  castNow(w, h, 'ghostwalk');
  hint = logOf(w, 'comboHint').pop();
  assert.equal(hint.kind, 'extra'); assert.equal(hint.got, 'ghostwalk');
  // alacrity on the hero instead of on a spirit
  const b = mk({}, { seed: 4 });
  IT.Combo.start(b.w, 'i_forge_alacrity_spirits', { grantMissing: true });
  castNow(b.w, b.h, 'forgespirit');
  b.runT(0.3);
  castNow(b.w, b.h, 'alacrity', b.h);
  hint = logOf(b.w, 'comboHint').pop();
  assert.ok(hint && hint.kind === 'target' && hint.got === 'alacrity');
  assert.equal(b.w.combo.stepIndex, 1);
});

test('i18n: feedback keys exist in en and pt', () => {
  const I = load(['js/data/i18n.js']);
  for (const k of ['cfail.early', 'cfail.late', 'chint.order', 'chint.target', 'chint.extra']) {
    assert.ok(I.hasT(k), k);
    const en = I.t(k, { s: 1.2, got: 'A', exp: 'B' });
    assert.ok(en && en !== k && !/\{/.test(en), k);
  }
});

test('anyOrder: group steps complete in either order, and a finished member stays finished', () => {
  for (const order of [['forgespirit', 'alacrity'], ['alacrity', 'forgespirit']]) {
    const { w, h } = mk({}, { seed: 6 });
    IT.Combo.start(w, 'i_forge_alacrity_burst', { grantMissing: true });
    for (const ab of order) castNow(w, h, ab, ab === 'alacrity' ? h : undefined);
    assert.equal(w.combo.stepIndex, 2, order.join()); assert.equal(logOf(w, 'comboHint').length, 0);
    IT.Orders.issue(w, h, { type: 'attack', target: dummyOf(w).id });
    for (let k = 0; k < 600 && act(w); k++) w.step();
    assert.equal(logOf(w, 'comboDone').length, 1, order.join());
  }
  // gleipnir group (SS + Meteor either order) then the Blast
  const g = IT.Combo.get('t_gleipnir_burst').steps;
  assert.equal(g[1].group, g[2].group); assert.notEqual(g[3].group, g[1].group);
  const { w, h } = mk({}, { seed: 6 });
  IT.Combo.start(w, 'i_forge_alacrity_burst', { grantMissing: true });
  castNow(w, h, 'forgespirit'); castNow(w, h, 'forgespirit');   // repeating a finished group member is just extra
  assert.equal(w.combo.stepIndex, 1);
});

test('tier scores are monotonic', () => {
  const B = IT.COMBOS.TIER_BASE, order = IT.COMBOS.TIERS;
  assert.deepEqual(order, ['basic', 'intermediate', 'advanced', 'items']);
  for (let i = 1; i < order.length; i++) assert.ok(B[order[i]] > B[order[i - 1]], order[i]);
  const worst = t => Math.min(...C.filter(c => c.tier === t).map(c => IT.Combo.score(c, 999, 0, false)));
  for (let i = 1; i < order.length; i++) assert.ok(worst(order[i]) > worst(order[i - 1]));
});
