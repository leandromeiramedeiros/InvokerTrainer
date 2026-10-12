'use strict';
// shared by tests/edge_v6.test.js (and scratch searches): the full sim stack + the scenarios_v5 scripted bot (spot moves added for juke scenarios)
const load = require('./_load.js');
const FILES = ['js/data/i18n.js', 'js/data/i18n/s3.js', 'js/data/i18n/f1.js', 'js/data/i18n/scn.js',
  'js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/dotaworld.js', 'js/data/maps.js', 'js/data/difficulty.js', 'js/data/daynight.js',
  'js/data/combos.js', 'js/data/scenarios.js', 'js/data/ranks.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/belief.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/stats.js', 'js/sim/towers.js', 'js/sim/ranked.js'];
const IT = load(FILES);
const R = IT.Ranked, SC = IT.SCENARIOS;
const EDGE = SC.filter(s => (s.tags || []).indexOf('edge') >= 0);
const STRIPS = ['edgeN', 'edgeS', 'edgeW', 'edgeE'];

function build(id, diff, seed) {
  const run = R.create({ mode: 'practice', diff, scenario: id, seed });
  const pr = run.next(), m0 = IT.Maps.get('grounds');
  const w = IT.World.create({ seed, map: m0, loadout: pr.lo, fog: pr.fog });
  IT.DayNight.attach(w, { scenario: id });
  const h = IT.Hero.create(w, pr.lo, m0.spawns.hero.x, m0.spawns.hero.y);
  run.attach(w);
  return { run, w, h, pr };
}
function prep(w, h, ab) {
  if (!IT.GAME.SPELL_ORBS[ab] || h.inv.slots.includes(ab) || h.inv.invokeCd > 0) return;
  for (const ch of IT.GAME.SPELL_ORBS[ab]) IT.Invoke.orb(w, h, ch);
  IT.Invoke.invoke(w, h);
}
// the scripted bot (scenarios_v5 / levels_v6 one + 'spot:<name>' moves for the juke scenario)
function bot(id, diff, seed, trace) {
  const m = build(id, diff, seed), juke = (m.pr.sc.tags || []).indexOf('juke') >= 0;
  const open = m.pr.sc.steps.map(s => s.a).filter((a, i, l) => IT.GAME.SPELL_ORBS[a] && l.indexOf(a) === i).slice(0, 2).reverse();
  for (let i = 0; i < 600 && m.run.frozen(); i++) { for (const a of open) prep(m.w, m.h, a); m.run.tick(1 / 30); }
  const { w, h, run } = m, live = () => run.phase === 'play';
  const trail = [];
  const step = n => { for (let i = 0; i < (n || 1) && live(); i++) { const s0 = Math.floor(w.t); w.step(); if (trace && Math.floor(w.t) > s0) w.emit('trace1s', {}); trail.push(run.dummies.map(d => ({ x: d.x, y: d.y }))); if (trail.length > 10) trail.shift(); } };
  const al = () => run.dummies.filter(d => !d.dead);
  if (trace) {
    for (const n of ['kill', 'damage', 'cast', 'heroDown', 'scnResult']) w.on(n, p => console.log(w.t.toFixed(2), n, JSON.stringify(p).slice(0, 140)));
    console.log('hero', h.x | 0, h.y | 0, run.dummies.map(d => [d.x | 0, d.y | 0, d.hp | 0].join(':')).join(' '), w.gate ? 'gate ' + (w.gate.x | 0) + ':' + (w.gate.y | 0) + ':' + w.gate.r : '', 'map', w.map.W, w.map.H);
    w.on('trace1s', () => { console.log(w.t.toFixed(1), 'hero', h.x | 0, h.y | 0, 'foes', run.dummies.map(d => d.dead ? '-' : (d.x | 0) + ':' + (d.y | 0) + '@' + (Math.hypot(d.x - h.x, d.y - h.y) | 0)).join(' ')); });
  }
  let casts = 0, tornT = null; w.on('cast', p => { if (p.unit === h.id) { casts++; if (p.ability === 'tornado') tornT = w.t; } });
  if (m.pr.sc.fail.includes('method')) h.autoAttack = false;
  for (const s of m.pr.sc.steps) {
    if (!live()) break;
    const until = w.t + (s.w || 0);
    while (live() && w.t < until - 1e-6) { prep(w, h, s.a); step(); }
    if (s.a === 'sunstrike' && tornT != null && w.t - tornT < 3) for (let k = 0; k < 30 * 3 && live() && !al().some(q => IT.Status.find(q, 'lift')); k++) { prep(w, h, s.a); step(); }
    if (s.a === 'sunstrike') for (let k = 0; k < 30 * 5 && live(); k++) { const f = al().find(q => IT.Status.find(q, 'lift')); if (!f || IT.Status.find(f, 'lift').until - w.t <= 1.62) break; prep(w, h, s.a); step(); }
    for (let k = 0; k < 400 && IT.GAME.SPELL_ORBS[s.a] && !h.inv.slots.includes(s.a) && live(); k++) { prep(w, h, s.a); step(); }
    const pickT = () => { const f = al().filter(q => !IT.Status.find(q, 'lift')), d = f.length ? f : al(); return s.at === 'd1' ? (d[1] || d[0]) : (d[0] || al()[0]); };
    if (s.near) for (let k = 0; k < 30 * 10 && live(); k++) { const q = pickT(); if (!q || Math.hypot(q.x - h.x, q.y - h.y) <= s.near) break; prep(w, h, s.a); step(); }
    if (s.a !== 'sunstrike' && s.a !== 'move' && s.a !== 'attack') for (let k = 0; k < 30 * 10 && live(); k++) { const q = pickT(); if (!q || !IT.Status.has(q, 'magicImmune')) break; prep(w, h, s.a); step(); }
    if (s.a === 'sunstrike' && s.at === 'd0') for (let k = 0; k < 90 && live(); k++) {
      const q = pickT(), o = q && trail[0] && trail[0][run.dummies.indexOf(q)];
      if (!q || !o || Math.hypot(q.x - o.x, q.y - o.y) / Math.max(1, trail.length - 1) * 30 < 40) break;
      step();
    }
    const unitT = (IT.Abilities.get(s.a) || {}).target === 'unit';
    if (unitT && (s.at === 'd0' || s.at === 'd1')) for (let k = 0; k < 30 * 8 && live(); k++) {
      const q = pickT(); if (!q || q.visible) break;
      if (k % 6 === 0) IT.Orders.issue(w, h, { type: 'move', x: q.x, y: q.y });
      prep(w, h, s.a); step();
    }
    const aim = () => {
      const d = al(), t0 = pickT();
      let t = t0 ? { x: t0.x, y: t0.y, id: t0.id } : null;
      if (s.at === 'self') t = { x: h.x, y: h.y, id: h.id };
      else if (typeof s.at === 'string' && s.at.indexOf('spot:') === 0) t = R.spotOf(w, s.at.slice(5));
      else if (s.at === 'mid' && d.length) t = { x: d.reduce((a, q) => a + q.x, 0) / d.length, y: d.reduce((a, q) => a + q.y, 0) / d.length };
      else if (s.at === 'gate' && w.gate) t = { x: w.gate.x, y: w.gate.y };
      else if (s.at === 'lead' && t0) {
        const o = trail[0] && trail[0][run.dummies.indexOf(t0)] || t0, T = Math.max(1, trail.length - 1) / 30;
        t = { x: t0.x + (t0.x - o.x) / T * 1.75, y: t0.y + (t0.y - o.y) / T * 1.75 };
      }
      return t;
    };
    const t = aim();
    if (!t) break;
    if (s.a === 'move') { IT.Orders.issue(w, h, { type: 'move', x: t.x, y: t.y }); const rr = juke ? 80 : 450; for (let k = 0; k < 30 * (juke ? 12 : 8) && live() && Math.hypot(h.x - t.x, h.y - t.y) > rr; k++) step(); continue; }
    if (s.a === 'attack') { IT.Orders.issue(w, h, { type: 'attack', target: t.id }); continue; }
    const c0 = casts;
    IT.Orders.issue(w, h, { type: 'cast', ability: s.a, x: t.x, y: t.y, target: t.id });
    const moving = s.at === 'mid' || s.at === 'd0' || s.at === 'd1' || s.at === 'lead';
    for (let k = 0; k < 30 * 8 && live() && casts === c0; k++) {
      step();
      if (moving && k % 6 === 5 && casts === c0 && h.orders[0] && h.orders[0].type === 'cast' && !h.orders[0]._ph) { const q = aim(); if (q) IT.Orders.issue(w, h, { type: 'cast', ability: s.a, x: q.x, y: q.y, target: q.id }); }
    }
    step(4);
  }
  if (!juke && m.pr.sc.obj.type === 'kill' && !m.pr.sc.obj.how) for (let k = 0; k < 30 * 20 && live(); k += 15) {
    const f = al().sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
    if (f && f.visible && !(h.orders[0] && h.orders[0].type === 'attack' && h.orders[0].target === f.id)) IT.Orders.issue(w, h, { type: 'attack', target: f.id });
    step(15);
  }
  if (!juke && m.pr.sc.obj.type === 'escape') for (let k = 0; k < 30 * 20 && live(); k += 10) {
    const f = al().sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
    if (f) { const a = Math.atan2(h.y - f.y, h.x - f.x), p = IT.Nav.nearestWalkable(w.map, h.x + Math.cos(a) * 500, h.y + Math.sin(a) * 500) || h; IT.Orders.issue(w, h, { type: 'move', x: p.x, y: p.y }); }
    step(10);
  }
  for (let k = 0; k < 30 * 60 && live(); k++) step();
  return run.result;
}

module.exports = { IT, FILES, build, prep, bot };
