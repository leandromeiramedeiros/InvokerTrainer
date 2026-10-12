'use strict';
// Combos: data integrity, availability, scoring, step matching, bot plays every combo, modes.
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

test('data: every combo is well-formed', () => {
  assert.ok(C.length >= 46);
  const ids = new Set();
  for (const c of C) {
    assert.ok(!ids.has(c.id), 'dup ' + c.id); ids.add(c.id);
    assert.ok(IT.COMBOS.TIER_BASE[c.tier], c.id);
    assert.ok(c.name.en && c.name.pt && c.tip.en && c.tip.pt, c.id);
    assert.ok(c.par > 0 && c.steps.length > 0, c.id);
    for (const s of c.steps) {
      assert.ok(['cast', 'item', 'attack', 'react', 'position', 'move'].includes(s.type), c.id);
      if (s.type === 'cast') assert.ok(IT.GAME.SPELL_ORBS[s.ability], c.id + ' ' + s.ability);
      if (s.type === 'item') assert.ok(IT.GAME.ITEM_DOTA[s.ability], c.id + ' ' + s.ability);
      if (s.type === 'position') assert.ok(s.minDist != null || s.maxDist != null, c.id);
      if (s.type === 'move') assert.ok(s.dist > 0, c.id);
      if (s.itemOnDummy) assert.equal(s.type, 'item', c.id);
    }
    assert.notEqual(c.steps[0].type, 'react', c.id);
  }
  for (const t of ['basic', 'intermediate', 'advanced', 'items']) assert.ok(C.some(c => c.tier === t), t);
});

test('available(): orbs, items, scepter, shard, grantMissing', () => {
  const none = Object.assign({}, IT.Loadout.default(), { items: [], scepter: false, shard: false });
  const a0 = IT.Combo.available(none).map(c => c.id);
  assert.ok(a0.includes('b_coldsnap'));
  assert.ok(!a0.includes('t_cataclysm') && !a0.includes('t_shard_emp') && !a0.includes('t_atos_sunstrike'));
  const g = IT.Combo.available(none, { grantMissing: true }).map(c => c.id);
  assert.ok(g.includes('t_atos_sunstrike') && g.includes('t_cataclysm') && g.includes('t_shard_emp'));
  const full = Object.assign({}, none, { items: ['atos'], scepter: true, scepterOrb: 'exort', shard: true });
  const a1 = IT.Combo.available(full).map(c => c.id);
  assert.ok(a1.includes('t_atos_sunstrike') && a1.includes('t_cataclysm') && a1.includes('t_shard_emp'));
  const weak = Object.assign({}, none, { heroLevel: 1, orbs: { quas: 1, wex: 0, exort: 0 } });
  const aw = IT.Combo.available(weak, { grantMissing: true }).map(c => c.id);
  assert.ok(aw.includes('b_coldsnap') && !aw.includes('b_sunstrike') && !aw.includes('b_emp'));
});

test('scoring: tier base, speed bonus, streak cap, perfect', () => {
  const c = IT.Combo.get('b_coldsnap'), B = IT.COMBOS.TIER_BASE.basic;
  assert.equal(IT.Combo.score(c, c.par, 0, false), Math.round(B * 1.5));
  assert.equal(IT.Combo.score(c, c.par * 3, 0, false), B);
  const mid = IT.Combo.score(c, c.par * 1.5, 0, false);
  assert.ok(mid > B && mid < Math.round(B * 1.5));
  assert.equal(IT.Combo.score(c, c.par * 3, 5, false), Math.round(B * 1.5));
  assert.equal(IT.Combo.score(c, c.par * 3, 50, false), B * 2);
  assert.equal(IT.Combo.score(c, c.par * 3, 0, true), Math.round(B * 1.25));
  assert.ok(IT.Combo.score(IT.Combo.get('a_tornado_meteor_blast'), 99, 0, false) > B);
});

test('bot completes every combo (items/scepter/shard granted)', () => {
  for (const c of C) {
    const { w, h } = mk({}, { seed: 3, fog: true });
    assert.ok(IT.Combo.start(w, c.id, { grantMissing: true }), 'start ' + c.id);
    play(w, h, c.id);
    const done = logOf(w, 'comboDone');
    const info = `${c.id}: phase=${w.combo.phase} step=${w.combo.stepIndex} fails=${logOf(w, 'comboFail').map(e => e.reason)}`;
    assert.equal(done.length, 1, info);
    assert.equal(done[0].id, c.id);
    assert.ok(done[0].score >= IT.COMBOS.TIER_BASE[c.tier], c.id);
    assert.equal(logOf(w, 'comboFail').length, 0, info);
  }
});

test('done refreshes cooldowns, invoke cd and mana', () => {
  const { w, h } = mk({ items: ['atos'] });
  IT.Combo.start(w, 'b_sunstrike');
  play(w, h, 'b_sunstrike');
  assert.equal(logOf(w, 'comboDone').length, 1);
  assert.equal(h.inv.invokeCd, 0);
  assert.equal(h.mana, h.maxMana);
  for (const k in h.cd) assert.equal(h.cd[k], 0);
});

test('mustHit: a missed sunstrike fails, then auto-retries', () => {
  const { w, h, runT } = mk();
  IT.Combo.start(w, 'b_sunstrike');
  prep(w, h, 'sunstrike');
  const d = dummyOf(w);
  IT.Orders.issue(w, h, { type: 'cast', ability: 'sunstrike', x: d.x + 1500, y: d.y + 1500 });
  runT(3);
  const fails = logOf(w, 'comboFail');
  assert.equal(fails.length, 1); assert.equal(fails[0].reason, 'miss');
  assert.equal(w.combo.streak, 0);
  runT(IT.Combo.FAIL_DELAY + 0.3);
  assert.equal(w.combo.phase, 'active'); assert.equal(w.combo.current, 'b_sunstrike'); assert.equal(w.combo.stepIndex, 0);
  assert.equal(logOf(w, 'comboStart').length, 2);
});

test('late: second step past its window fails', () => {
  const { w, h } = mk();
  IT.Combo.start(w, 'i_tornado_emp', { grantMissing: true });
  play(w, h, 'i_tornado_emp', { wait: 10 });
  assert.ok(logOf(w, 'comboFail').some(e => e.reason === 'late'));
  assert.equal(logOf(w, 'comboDone').length, 0);
});

test('wrong cast does not advance and ruins perfect', () => {
  const { w, h, runT } = mk();
  IT.Combo.start(w, 'b_coldsnap');
  prep(w, h, 'ghostwalk');
  IT.Orders.issue(w, h, { type: 'cast', ability: 'ghostwalk' });
  runT(1);
  assert.equal(w.combo.stepIndex, 0); assert.equal(w.combo.extra, 1);
  play(w, h, 'b_coldsnap');
  const done = logOf(w, 'comboDone');
  assert.equal(done.length, 1); assert.equal(done[0].perfect, false);
});

test('hidden-step combo respawns the dummy outside vision (fog on)', () => {
  const { w, h } = mk({}, { fog: true });
  IT.Combo.start(w, 'i_blind_sunstrike');
  assert.equal(w.combo.phase, 'active');
  const d = dummyOf(w);
  assert.ok(Math.hypot(d.x - h.x, d.y - h.y) >= 800);
  assert.ok(w.combo.hint);
});

test('stop: ends the sandbox mode once with a modeEnd summary', () => {
  const { w } = mk();
  const s = IT.Combo.stop(w);
  const e = logOf(w, 'modeEnd');
  assert.equal(e.length, 1); assert.equal(e[0].mode, 'sandbox'); assert.equal(s.reason, 'stopped');
  assert.equal(w.combo.ended, true);
  IT.Combo.stop(w);
  assert.equal(logOf(w, 'modeEnd').length, 1);
});

test('position step: completes only when the hero-dummy gap is in range', () => {
  const { w, h, d, runT } = mk();
  IT.Combo.start(w, 'i_icewall_position');
  const dd = dummyOf(w);
  h.x = dd.x - 500; h.y = dd.y; runT(0.5);
  assert.equal(w.combo.stepIndex, 0);
  h.x = dd.x - 200; runT(0.2);
  assert.equal(w.combo.stepIndex, 1);
});

test('move step: needs the hero to walk the distance toward the dummy', () => {
  const { w, h, runT } = mk();
  IT.Combo.start(w, 'i_ghost_approach');
  prep(w, h, 'ghostwalk');
  IT.Orders.issue(w, h, { type: 'cast', ability: 'ghostwalk' });
  runT(1);
  assert.equal(w.combo.stepIndex, 1);
  const dd = dummyOf(w), a = Math.atan2(dd.y - h.y, dd.x - h.x);
  h.x += Math.cos(a) * 100; h.y += Math.sin(a) * 100; runT(0.2);
  assert.equal(w.combo.stepIndex, 1);   // not far enough
  h.x += Math.cos(a) * 250; h.y += Math.sin(a) * 250; runT(0.2);
  assert.equal(w.combo.stepIndex, 2);
});

test('itemOnDummy: step stays pending until the item hits; a miss fails it', () => {
  const { w, h, run, runT } = mk({ items: ['atos'] });
  IT.Combo.start(w, 't_atos_sunstrike');
  const dd = dummyOf(w);
  h.x = dd.x - 700; h.y = dd.y; w.step();
  assert.ok(w.combo.def.steps[0].itemOnDummy);
  IT.Orders.issue(w, h, { type: 'cast', ability: 'atos', target: dd.id, x: dd.x, y: dd.y });
  for (let k = 0; k < 90 && w.combo.stepIndex < 1; k++) run(1);
  assert.equal(w.combo.steps[0].status, 'pending');
  w.emit('miss', { src: h.id, ability: 'atos', x: dd.x, y: dd.y });
  run(1);
  assert.equal(logOf(w, 'comboFail')[0].reason, 'miss');
  runT(0.1);
});
