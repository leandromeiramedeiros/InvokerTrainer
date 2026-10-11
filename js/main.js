// Bootstrap: world + map + hero + dummy, input, fixed-step loop with interpolated rendering.
(function (G) {
  'use strict';
  const IT = G.IT;
  const GM = IT.GAME, P = GM.UNIT_PX, VW = GM.VIEW_W, VH = GM.VIEW_H;
  const cv = document.getElementById('game'), glowCv = document.getElementById('glow');
  const stage = document.getElementById('stage'), dbg = document.getElementById('dbg');

  const loadout = IT.Loadout.default();
  const map = IT.Map.build(IT.MAPDEF);
  const w = IT.World.create({ seed: 7, map, loadout, fog: true, autoAttack: true });
  const sp = map.spawns.hero;
  const hero = IT.Hero.create(w, loadout, sp.x, sp.y);
  const d0 = map.spawns.dummies[0];
  IT.Units.spawnDummy(w, { x: d0.x, y: d0.y, preset: 'training', skin: 'pedro' });

  const cam = IT.Camera.create(map);
  cam.centerOn(hero.x, hero.y);
  const R = IT.Render.create(w, cv, glowCv, cam);
  const mouse = { x: 0, y: 0, in: false };
  const keys = new Set();
  const log = [];
  w.on('*', e => {
    if (['spawn', 'despawn', 'status', 'statusEnd', 'visibility', 'fx', 'order', 'attack', 'attackHit', 'damage'].includes(e.type)) return;
    log.push(`${e.t.toFixed(1)} ${e.type} ${e.reason || e.spell || e.ability || e.orb || ''}`);
    if (log.length > 8) log.shift();
  });

  function fit() {
    const s = Math.max(1, Math.floor(Math.min(innerWidth / VW, innerHeight / VH)));
    stage.style.width = VW * s + 'px'; stage.style.height = VH * s + 'px'; stage.style.setProperty('--u', s + 'px');
  }
  addEventListener('resize', fit); fit();

  const world = () => cam.toWorld(mouse.x, mouse.y);
  function unitAt(p, team) {
    let best = null, bd = 60 * 60;
    for (const e of w.ents) {
      if (e.dead || e.team !== team || e.kind === 'thinker' || e.kind === 'proj') continue;
      if (w.fog && team === 1 && !e.visible) continue;
      const d = IT.U.dist2(e.x, e.y, p.x, p.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  const setMouse = ev => {
    const r = cv.getBoundingClientRect();
    mouse.x = (ev.clientX - r.left) / r.width * VW; mouse.y = (ev.clientY - r.top) / r.height * VH;
  };
  let mmDrag = false;
  cv.addEventListener('mousemove', ev => { setMouse(ev); mouse.in = !mmDrag; if (mmDrag) miniMove(); });
  cv.addEventListener('mouseleave', () => { mouse.in = false; });
  addEventListener('mouseup', () => { mmDrag = false; });
  cv.addEventListener('contextmenu', ev => ev.preventDefault());
  function miniMove() {
    const m = R.mmHit(mouse.x, mouse.y); if (!m) return false;
    cam.lock = false; cam.centerOn(m.x, m.y); return true;
  }
  cv.addEventListener('mousedown', ev => {
    setMouse(ev);
    if (ev.button === 0 && miniMove()) { mmDrag = true; return; }
    if (ev.button !== 2) return;
    const m = R.mmHit(mouse.x, mouse.y);
    const p = m || world(), t = m ? null : unitAt(p, 1);
    IT.Orders.issue(w, hero, t ? { type: 'attack', target: t.id, queued: ev.shiftKey } : { type: 'move', x: p.x, y: p.y, queued: ev.shiftKey });
  });

  function castSlot(i, queued) {
    const id = hero.inv.slots[i]; if (!id) return;
    const d = IT.Abilities.get(id); if (!d) return;
    const p = world(), o = { type: 'cast', ability: id, queued };
    if (d.target === 'unit') { const t = unitAt(p, 1); if (!t) return; o.target = t.id; }
    else if (d.target === 'point') { o.x = p.x; o.y = p.y; }
    IT.Orders.issue(w, hero, o);
  }

  addEventListener('keydown', ev => {
    const k = ev.key.toUpperCase();
    keys.add(ev.key);
    if (ev.repeat) return;
    if (k === 'Q' || k === 'W' || k === 'E') IT.Invoke.orb(w, hero, k);
    else if (k === 'R') IT.Invoke.invoke(w, hero);
    else if (k === 'D') castSlot(0, ev.shiftKey);
    else if (k === 'F') castSlot(1, ev.shiftKey);
    else if (k === 'S') IT.Orders.issue(w, hero, { type: 'stop' });
    else if (k === 'H') IT.Orders.issue(w, hero, { type: 'hold' });
    else if (k === ' ') cam.centerOn(hero.x, hero.y);
    else if (k === 'Y') cam.lock = !cam.lock;
    else if (k === 'F3') R.showDebug = !R.showDebug;
    else if (k === 'G') w.fog = !w.fog;
    else if (k === 'C') { hero.cd = {}; hero.inv.invokeCd = 0; hero.mana = hero.maxMana; }
    else return;
    ev.preventDefault();
  });
  addEventListener('keyup', ev => keys.delete(ev.key));
  addEventListener('blur', () => keys.clear());

  function debugText() {
    const S = R.stats, inv = hero.inv;
    return `render ${S.ms.toFixed(2)}ms avg ${S.avg.toFixed(2)} max ${S.max.toFixed(1)}  lights ${S.lights} parts ${S.parts} items ${S.items}  lock ${cam.lock ? 'on' : 'off'}\n` +
      `orbs ${inv.orbs.join('')}  slots ${inv.slots.map(s => s || '-').join(' | ')}  invokeCd ${inv.invokeCd.toFixed(1)}\n` +
      `hp ${Math.round(hero.hp)}/${Math.round(hero.maxHp)}  mana ${Math.round(hero.mana)}/${Math.round(hero.maxMana)}\n` +
      `QWE orbs  R invoke  D/F cast  RMB move  S stop  H hold  G fog  C refresh  Space cam  Y lock  F3 debug\n` + log.join('\n');
  }

  let last = performance.now(), acc = 0, dbgT = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (G.IT.dev && G.IT.dev.paused) { requestAnimationFrame(frame); return; }
    acc += dt;
    while (acc >= w.dt) { R.snapshot(); w.step(); acc -= w.dt; }
    cam.update(dt, keys, mouse, hero);
    R.render(acc / w.dt, dt);
    dbgT += dt;
    if (dbgT > 0.25) { dbgT = 0; dbg.textContent = R.showDebug ? debugText() : ''; R.stats.max *= 0.5; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  G.IT.dev = {
    w, hero, cam, R, paused: false,
    // step the sim n ticks then draw once (rAF is throttled in hidden panes)
    render(n) { for (let i = 0; i < (n || 0); i++) { R.snapshot(); w.step(); } R.fogSnap = (n || 0) > 5; R.render(1, 1 / 60); R.fogSnap = false; },
  };
})(window);
