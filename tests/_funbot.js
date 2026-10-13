'use strict';
// v6 item 28: the fun-set scripted bot (tests/fun_v6.test.js + scratch calibration). The _edgebot step bot plus the fun step fields:
//   wait 'tp' (until a foe channels a Town Portal) | 'pickup' (until a rune / Aegis lies on the map), untilEl (until that many s of play),
//   at 'pickup' (the nearest pickup) | 'land' (Ice Wall: walk up to the lifted foe, face it, wall where it drops), r (move radius; 9999 = order
//   the walk and go on to the next step, the walk resumes after each cast)
const { IT, FILES, build, prep } = require('./_edgebot.js');
const R = IT.Ranked;

function bot(id, diff, seed, trace) {
  const m = build(id, diff, seed), sc = m.pr.sc;
  const open = sc.steps.map(s => s.a).filter((a, i, l) => IT.GAME.SPELL_ORBS[a] && l.indexOf(a) === i).slice(0, 2).reverse();
  for (let i = 0; i < 600 && m.run.frozen(); i++) { for (const a of open) prep(m.w, m.h, a); m.run.tick(1 / 30); }
  const { w, h, run } = m, live = () => run.phase === 'play';
  const trail = [];
  const step = n => { for (let i = 0; i < (n || 1) && live(); i++) { w.step(); trail.push(run.dummies.map(d => ({ x: d.x, y: d.y }))); if (trail.length > 10) trail.shift(); } };
  const al = () => run.dummies.filter(d => !d.dead);
  const el = () => w.t - run.t0;
  const pickups = () => w.ents.filter(e => !e.dead && e.kind === 'pickup');
  const lifted = () => al().find(q => IT.Status.find(q, 'lift'));
  const channel = () => al().find(q => q.channel && q.channel.kind === 'tp');
  if (trace) {
    for (const n of ['kill', 'cast', 'heroDown', 'scnResult', 'channelStart', 'channelEnd', 'pickup', 'roshanDown', 'allyDown', 'towerDown']) w.on(n, p => console.log(el().toFixed(2), n, JSON.stringify(p).slice(0, 140)));
    console.log('hero', h.x | 0, h.y | 0, run.dummies.map(d => [d.x | 0, d.y | 0, d.hp | 0, d.ms | 0].join(':')).join(' '), 'spots', JSON.stringify(w.spots), w.gate ? 'gate ' + (w.gate.x | 0) + ':' + (w.gate.y | 0) : '', 'limit', m.pr.limit, 'lvl', m.pr.lo.heroLevel);
  }
  let casts = 0, tornT = null, lastMove = null; w.on('cast', p => { if (p.unit === h.id) { casts++; if (p.ability === 'tornado') tornT = w.t; } });
  h.autoAttack = !(sc.fail.includes('method') || sc.obj.type === 'pickup');
  for (const s of sc.steps) {
    if (!live()) break;
    const hold = (cond, sec) => { for (let k = 0; k < 30 * (sec || 12) && live() && !cond(); k++) { prep(w, h, s.a); step(); } };
    if (s.untilEl) hold(() => el() >= s.untilEl);
    if (s.wait === 'tp') hold(() => !!channel());
    if (s.wait === 'pickup') hold(() => pickups().length > 0);
    const until = w.t + (s.w || 0);
    while (live() && w.t < until - 1e-6) { prep(w, h, s.a); step(); }
    if (s.a === 'sunstrike' && tornT != null && w.t - tornT < 3) hold(() => !!lifted(), 3);
    if (s.a === 'sunstrike') for (let k = 0; k < 30 * 5 && live(); k++) { const f = lifted(); if (!f || IT.Status.find(f, 'lift').until - w.t <= 1.62) break; prep(w, h, s.a); step(); }
    hold(() => !IT.GAME.SPELL_ORBS[s.a] || h.inv.slots.includes(s.a), 14);
    const pickT = () => { const f = al().filter(q => !IT.Status.find(q, 'lift')), d = f.length ? f : al(); return s.at === 'd1' ? (d[1] || d[0]) : (d[0] || al()[0]); };
    if (s.near) hold(() => { const q = pickT(); return !q || Math.hypot(q.x - h.x, q.y - h.y) <= s.near; }, 10);
    if (s.a !== 'sunstrike' && s.a !== 'move' && s.a !== 'attack') hold(() => { const q = pickT(); return !q || !IT.Status.has(q, 'magicImmune'); }, 10);
    if (s.a === 'sunstrike' && s.at === 'd0' && !channel()) for (let k = 0; k < 90 && live(); k++) {
      const q = pickT(), o = q && trail[0] && trail[0][run.dummies.indexOf(q)];
      if (!q || !o || Math.hypot(q.x - o.x, q.y - o.y) / Math.max(1, trail.length - 1) * 30 < 40) break;
      step();
    }
    const aim = () => {
      const d = al(), t0 = s.at === 'land' ? (lifted() || pickT()) : pickT();
      let t = t0 ? { x: t0.x, y: t0.y, id: t0.id } : null;
      if (s.at === 'self') t = { x: h.x, y: h.y, id: h.id };
      else if (s.at === 'pickup') { const p = pickups().sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0]; t = p ? { x: p.x, y: p.y } : null; }
      else if (typeof s.at === 'string' && s.at.indexOf('spot:') === 0) t = R.spotOf(w, s.at.slice(5));
      else if (s.at === 'mid' && d.length) t = { x: d.reduce((a, q) => a + q.x, 0) / d.length, y: d.reduce((a, q) => a + q.y, 0) / d.length };
      else if (s.at === 'gate' && w.gate) t = { x: w.gate.x, y: w.gate.y };
      return t;
    };
    const t = aim();
    if (!t) break;
    if (s.a === 'move') { IT.Orders.issue(w, h, { type: 'move', x: t.x, y: t.y }); lastMove = s.r >= 9999 ? t : null; const rr = s.r || 450; for (let k = 0; k < 30 * 12 && live() && Math.hypot(h.x - t.x, h.y - t.y) > rr; k++) step(); continue; }
    if (s.a === 'attack') { IT.Orders.issue(w, h, { type: 'attack', target: t.id }); continue; }
    if (s.a === 'icewall') {   // the wall rises wall_place_distance in front of the hero: walk up to / face the target first
      const near = s.at === 'land' ? 260 : 1e9;
      for (let k = 0; k < 30 * 4 && live(); k++) {
        const q = aim(); if (!q) break;
        const d = Math.hypot(q.x - h.x, q.y - h.y);
        if (d <= near && k >= 3) break;
        if (k % 3 === 0) IT.Orders.issue(w, h, { type: 'move', x: q.x, y: q.y });
        prep(w, h, s.a); step();
      }
    }
    const c0 = casts;
    IT.Orders.issue(w, h, { type: 'cast', ability: s.a, x: t.x, y: t.y, target: t.id });
    const moving = s.at === 'mid' || s.at === 'd0' || s.at === 'd1';
    for (let k = 0; k < 30 * 8 && live() && casts === c0; k++) {
      step();
      if (moving && k % 6 === 5 && casts === c0 && h.orders[0] && h.orders[0].type === 'cast' && !h.orders[0]._ph) { const q = aim(); if (q) IT.Orders.issue(w, h, { type: 'cast', ability: s.a, x: q.x, y: q.y, target: q.id }); }
    }
    step(4);
    if (lastMove && live()) IT.Orders.issue(w, h, { type: 'move', x: lastMove.x, y: lastMove.y });   // r 9999 = walk on: resume after the cast
  }
  if (sc.obj.type === 'kill' && !sc.obj.how) for (let k = 0; k < 30 * 20 && live(); k += 15) {
    const f = al().sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
    if (f && f.visible && !(h.orders[0] && h.orders[0].type === 'attack' && h.orders[0].target === f.id)) IT.Orders.issue(w, h, { type: 'attack', target: f.id });
    step(15);
  }
  if (sc.obj.type === 'escape') for (let k = 0; k < 30 * 20 && live(); k += 10) {
    const f = al().sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
    if (f) { const a = Math.atan2(h.y - f.y, h.x - f.x), p = IT.Nav.nearestWalkable(w.map, h.x + Math.cos(a) * 500, h.y + Math.sin(a) * 500) || h; IT.Orders.issue(w, h, { type: 'move', x: p.x, y: p.y }); }
    step(10);
  }
  for (let k = 0; k < 30 * 60 && live(); k++) step();
  return run.result;
}

module.exports = { IT, FILES, build, prep, bot };
