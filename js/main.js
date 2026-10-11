// Vertical-slice bootstrap: world + map + hero + dummy, input, fixed-step loop, debug render.
(function (G) {
  'use strict';
  const IT = G.IT;
  const GM = IT.GAME, P = GM.UNIT_PX, VW = GM.VIEW_W, VH = GM.VIEW_H;
  const cv = document.getElementById('game'), cx = cv.getContext('2d');
  cx.font = '8px monospace'; cx.imageSmoothingEnabled = false;
  const dbg = document.getElementById('dbg');

  const loadout = IT.Loadout.default();
  const map = IT.Map.build(IT.MAPDEF);
  const w = IT.World.create({ seed: 7, map, loadout, fog: true, autoAttack: true });
  const sp = map.spawns.hero;
  const hero = IT.Hero.create(w, loadout, sp.x, sp.y);
  const d0 = map.spawns.dummies[0];
  IT.Units.spawnDummy(w, { x: d0.x, y: d0.y, preset: 'training', skin: 'pedro' });

  const cam = { x: hero.x - VW * P / 2, y: hero.y - VH * P / 2 };
  const mouse = { x: 0, y: 0, in: false };
  const keys = new Set();
  const log = [];
  w.on('*', e => {
    if (['spawn', 'despawn', 'status', 'statusEnd', 'visibility', 'fx', 'order', 'attack', 'attackHit'].includes(e.type)) return;
    log.push(`${e.t.toFixed(1)} ${e.type} ${e.reason || e.spell || e.ability || e.orb || ''} ${e.dealt != null ? Math.round(e.dealt) : ''}`);
    if (log.length > 12) log.shift();
  });

  function fit() {
    const s = Math.max(1, Math.floor(Math.min(innerWidth / VW, innerHeight / VH)));
    cv.style.width = VW * s + 'px'; cv.style.height = VH * s + 'px';
  }
  addEventListener('resize', fit); fit();

  const world = () => ({ x: cam.x + mouse.x * P, y: cam.y + mouse.y * P });
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

  cv.addEventListener('mousemove', ev => {
    const r = cv.getBoundingClientRect();
    mouse.x = (ev.clientX - r.left) / r.width * VW; mouse.y = (ev.clientY - r.top) / r.height * VH; mouse.in = true;
  });
  cv.addEventListener('mouseleave', () => { mouse.in = false; });
  cv.addEventListener('contextmenu', ev => ev.preventDefault());
  cv.addEventListener('mousedown', ev => {
    if (ev.button !== 2) return;
    const p = world(), t = unitAt(p, 1);
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
    else if (k === ' ') { cam.x = hero.x - VW * P / 2; cam.y = hero.y - VH * P / 2; }
    else if (k === 'G') w.fog = !w.fog;
    else if (k === 'C') { hero.cd = {}; hero.inv.invokeCd = 0; hero.mana = hero.maxMana; }
    else return;
    ev.preventDefault();
  });
  addEventListener('keyup', ev => keys.delete(ev.key));

  function moveCam(dt) {
    const sp = 1800 * dt, edge = 4;
    if (keys.has('ArrowLeft') || (mouse.in && mouse.x < edge)) cam.x -= sp;
    if (keys.has('ArrowRight') || (mouse.in && mouse.x > VW - edge)) cam.x += sp;
    if (keys.has('ArrowUp') || (mouse.in && mouse.y < edge)) cam.y -= sp;
    if (keys.has('ArrowDown') || (mouse.in && mouse.y > VH - edge)) cam.y += sp;
    cam.x = IT.U.clamp(cam.x, 0, map.W - VW * P); cam.y = IT.U.clamp(cam.y, 0, map.H - VH * P);
  }

  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    acc += dt;
    while (acc >= w.dt) { w.step(); acc -= w.dt; }
    moveCam(dt);
    IT.DebugRender.draw(cx, w, cam);
    const inv = hero.inv;
    dbg.textContent =
      `orbs ${inv.orbs.join('')}  slots ${inv.slots.map(s => s || '-').join(' | ')}  invokeCd ${inv.invokeCd.toFixed(1)}\n` +
      `hp ${Math.round(hero.hp)}/${Math.round(hero.maxHp)}  mana ${Math.round(hero.mana)}/${Math.round(hero.maxMana)}  ms ${Math.round(hero.ms)}\n` +
      `cd ${Object.entries(hero.cd).filter(([, v]) => v > 0).map(([k, v]) => k + ' ' + v.toFixed(1)).join('  ')}\n` +
      `QWE orbs  R invoke  D/F cast  RMB move/attack  Shift queue  S stop  H hold  G fog  C refresh  Space cam\n\n` +
      log.join('\n');
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  G.IT.dev = { w, hero, cam };
})(window);
