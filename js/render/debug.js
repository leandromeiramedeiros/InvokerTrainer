// Placeholder renderer for the vertical slice: tiles, fog, rectangles, thinkers, HUD text.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const TILE_COL = ['#1d2b1a', '#0d1a0e', '#3a3632', '#14304a', '#2e2618'];

  function draw(cx, w, cam) {
    const P = IT.GAME.UNIT_PX, VW = IT.GAME.VIEW_W, VH = IT.GAME.VIEW_H;
    cx.fillStyle = '#000'; cx.fillRect(0, 0, VW, VH);
    const sx = x => Math.round((x - cam.x) / P), sy = y => Math.round((y - cam.y) / P);
    const m = w.map;
    if (m) {
      const tp = m.tile / P;
      const t0x = Math.max(0, Math.floor(cam.x / m.tile)), t0y = Math.max(0, Math.floor(cam.y / m.tile));
      const t1x = Math.min(m.w - 1, Math.ceil((cam.x + VW * P) / m.tile)), t1y = Math.min(m.h - 1, Math.ceil((cam.y + VH * P) / m.tile));
      for (let ty = t0y; ty <= t1y; ty++) for (let tx = t0x; tx <= t1x; tx++) {
        const t = m.grid[ty * m.w + tx];
        cx.fillStyle = TILE_COL[t] || '#f0f';
        const x = sx(tx * m.tile), y = sy(ty * m.tile);
        cx.fillRect(x, y, tp, tp);
        if (t === 1) { cx.fillStyle = '#1f4a22'; cx.fillRect(x + 1, y + 1, tp - 2, tp - 2); }
        if (w.fog && w.vis && !w.vis[ty * m.w + tx]) { cx.fillStyle = 'rgba(0,0,10,0.62)'; cx.fillRect(x, y, tp, tp); }
      }
    }
    // thinkers / danger zones
    for (const e of w.ents) {
      if (e.dead) continue;
      if (e.kind === 'thinker' || e.kind === 'proj') {
        const r = Math.max(1, (e.r || e.radius || 12) / P);
        cx.strokeStyle = e.color || (e.kind === 'proj' ? '#ff8' : '#fa4');
        cx.beginPath(); cx.arc(sx(e.x), sy(e.y), r, 0, IT.U.TAU); cx.stroke();
      }
    }
    // order waypoints
    if (w.hero && IT.Orders && IT.Orders.waypoints) {
      let px = sx(w.hero.x), py = sy(w.hero.y);
      cx.strokeStyle = '#4f4'; cx.setLineDash([2, 2]);
      for (const p of IT.Orders.waypoints(w.hero)) {
        cx.beginPath(); cx.moveTo(px, py); cx.lineTo(sx(p.x), sy(p.y)); cx.stroke();
        px = sx(p.x); py = sy(p.y); cx.fillStyle = '#4f4'; cx.fillRect(px - 1, py - 1, 3, 3);
      }
      cx.setLineDash([]);
    }
    // units
    for (const e of w.ents) {
      if (e.dead || e.kind === 'thinker' || e.kind === 'proj') continue;
      if (e.team === 1 && w.fog && !e.visible) {
        if (e.lastSeen) { cx.fillStyle = '#888'; cx.fillText('?', sx(e.lastSeen.x) - 2, sy(e.lastSeen.y) + 3); }
        continue;
      }
      const r = Math.max(2, Math.round(e.radius / P)), x = sx(e.x), y = sy(e.y) - Math.round((e.z || 0) / P);
      const st = e.statuses.map(s => s.type);
      cx.fillStyle = e.kind === 'hero' ? '#c8a' : e.kind === 'spirit' ? '#f84' : '#d44';
      if (st.includes('frozen')) cx.fillStyle = '#8df';
      if (st.includes('stun')) cx.fillStyle = '#ff4';
      if (st.includes('hex')) cx.fillStyle = '#6c6';
      cx.fillRect(x - r, y - r, 2 * r, 2 * r);
      cx.strokeStyle = '#fff';
      cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + Math.cos(e.facing) * r * 1.6, y + Math.sin(e.facing) * r * 1.6); cx.stroke();
      if (e.maxHp) {
        cx.fillStyle = '#300'; cx.fillRect(x - 8, y - r - 5, 16, 2);
        cx.fillStyle = e.team ? '#e33' : '#3e3'; cx.fillRect(x - 8, y - r - 5, Math.round(16 * e.hp / e.maxHp), 2);
      }
      if (e.name) { cx.fillStyle = '#fff'; cx.fillText(e.name, x - cx.measureText(e.name).width / 2, y - r - 7); }
      if (st.length) { cx.fillStyle = '#ccc'; cx.fillText(st.join(','), x - 10, y + r + 8); }
    }
  }

  IT.DebugRender = { draw };
})(typeof window !== 'undefined' ? window : globalThis);
