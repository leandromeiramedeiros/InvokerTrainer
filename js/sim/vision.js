// Fog of war for team 0 via recursive shadowcasting + LOS helpers for team-1 AI. Pure.
// Elevation (map.elev 0 low, 1 ground, 2 high): tiles higher than the viewer are opaque and never revealed; trees/rocks block only
// at the viewer's own level (a high-ground viewer sees over lower trees and cliff lips).
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const SIGHT = 150;   // true-sight radius around a source (units)
  const MULT = [[1, 0, 0, 1], [0, 1, 1, 0], [0, -1, 1, 0], [-1, 0, 0, 1], [-1, 0, 0, -1], [0, -1, -1, 0], [0, 1, -1, 0], [1, 0, 0, -1]];

  let VE = 1;   // viewer elevation of the shadow() call in progress
  function cast(map, vis, cx, cy, row, start, end, r, r2, xx, xy, yx, yy) {
    if (start < end) return;
    const w = map.w, elev = map.elev;
    for (let j = row; j <= r; j++) {
      let dx = -j - 1; const dy = -j; let blocked = false, newStart = start;
      while (dx <= 0) {
        dx++;
        const X = cx + dx * xx + dy * xy, Y = cy + dx * yx + dy * yy;
        const lS = (dx - 0.5) / (dy + 0.5), rS = (dx + 0.5) / (dy - 0.5);
        if (start < rS) continue;
        if (end > lS) break;
        const inb = X >= 0 && Y >= 0 && X < w && Y < map.h, te = inb && elev ? elev[Y * w + X] : VE, hi = te > VE;
        if (!hi && inb && dx * dx + dy * dy <= r2) vis[Y * w + X] = 1;
        const b = hi || (te === VE && map.blocksSight(X, Y));
        if (blocked) {
          if (b) { newStart = rS; continue; }
          blocked = false; start = newStart;
        } else if (b && j < r) {
          blocked = true;
          cast(map, vis, cx, cy, j + 1, start, lS, r, r2, xx, xy, yx, yy);
          newStart = rS;
        }
      }
      if (blocked) break;
    }
  }

  function shadow(map, vis, x, y, radius) {
    const cx = map.toTile(x), cy = map.toTile(y), rt = radius / map.tile, r = Math.ceil(rt), r2 = (rt + 0.5) * (rt + 0.5);
    VE = map.elevAt ? map.elevAt(x, y) : 1;
    if (cx >= 0 && cy >= 0 && cx < map.w && cy < map.h) vis[cy * map.w + cx] = 1;
    for (const m of MULT) cast(map, vis, cx, cy, 1, 1.0, 0.0, r, r2, m[0], m[1], m[2], m[3]);
  }

  // true if no sight-blocking tile lies strictly between the endpoint tiles (grid traversal)
  function los(map, ax, ay, bx, by) {
    const t = map.tile, elev = map.elev, ve = map.elevAt ? map.elevAt(ax, ay) : 1;
    let tx = Math.floor(ax / t), ty = Math.floor(ay / t);
    const ex = Math.floor(bx / t), ey = Math.floor(by / t);
    if (tx === ex && ty === ey) return true;
    const dx = bx - ax, dy = by - ay;
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
    const tDX = dx ? Math.abs(t / dx) : Infinity, tDY = dy ? Math.abs(t / dy) : Infinity;
    let tMX = dx ? ((dx > 0 ? (tx + 1) * t - ax : ax - tx * t) / Math.abs(dx)) : Infinity;
    let tMY = dy ? ((dy > 0 ? (ty + 1) * t - ay : ay - ty * t) / Math.abs(dy)) : Infinity;
    for (let i = 0; i < 4096; i++) {
      if (tMX < tMY) { tx += sx; tMX += tDX; } else { ty += sy; tMY += tDY; }
      if (tx === ex && ty === ey) return true;
      const te = elev && tx >= 0 && ty >= 0 && tx < map.w && ty < map.h ? elev[ty * map.w + tx] : ve;
      if (te > ve || (te === ve && map.blocksSight(tx, ty))) return false;
    }
    return true;
  }

  function isGhost(e) {
    if (IT.Status && IT.Status.has) return IT.Status.has(e, 'ghost');
    return !!(e.statuses && e.statuses.some(s => s.type === 'ghost'));
  }
  const INVIS = ['ghost', 'invisible', 'invis', 'shadowblade'];
  // hidden from enemies unless revealed: Ghost Walk, Shadow Blade (any status named like the above) or an `invisible` flag
  function isHidden(e) {
    if (e.invisible) return true;
    const st = e.statuses; if (!st) return false;
    for (let i = 0; i < st.length; i++) if (INVIS.indexOf(st[i].type) >= 0) return true;
    return false;
  }
  function revealed(e) { return !!(IT.Status && IT.Status.revealed && IT.Status.revealed(e)); }

  // any alive ent of `team` with trueSight > 0 within that radius of target (Tower aura, Dust, Sentry...)
  function trueSighted(w, team, target) {
    for (const e of w.ents) {
      if (e.dead || e.team !== team || !(e.trueSight > 0)) continue;
      if (e.hp != null && e.hp <= 0 && e.kind !== 'thinker') continue;
      if (Math.hypot(target.x - e.x, target.y - e.y) <= e.trueSight) return true;
    }
    return false;
  }

  function canSee(w, viewer, target) {
    if (!viewer || !target || !(viewer.vision > 0)) return false;
    if (target.building) return true;
    if (isHidden(target) && !revealed(target) && !trueSighted(w, viewer.team, target)) return false;
    if (Math.hypot(target.x - viewer.x, target.y - viewer.y) > viewer.vision) return false;
    const m = w.map; if (!m) return true;
    if (m.elevAt && m.elevAt(target.x, target.y) > m.elevAt(viewer.x, viewer.y)) return false;   // high ground hides its units from below
    return los(m, viewer.x, viewer.y, target.x, target.y);
  }

  // does any vision-giving ent of `team` see target?
  function teamSees(w, team, target) {
    for (const e of w.ents) {
      if (e.dead || e.team !== team || !(e.vision > 0)) continue;
      if (e.hp != null && e.hp <= 0 && e.kind !== 'thinker') continue;
      if (e === target) return true;
      if (canSee(w, e, target)) return true;
    }
    return false;
  }

  function visibleAt(w, x, y) {
    if (w.fog === false) return true;
    if (!w.vis) return false;
    const m = w.map, tx = m.toTile(x), ty = m.toTile(y);
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return false;
    return w.vis[ty * m.w + tx] === 1;
  }

  function update(w) {
    const m = w.map; if (!m) return;
    if (!w.vis || w.vis.length !== m.w * m.h) w.vis = new Uint8Array(m.w * m.h);
    const vis = w.vis, fogOff = w.fog === false, src = [];
    if (fogOff) vis.fill(1);
    else {
      vis.fill(0);
      for (const e of w.ents) {
        if (e.dead || e.team !== 0 || !(e.vision > 0)) continue;
        if (e.kind !== 'thinker' && e.hp != null && e.hp <= 0) continue;
        src.push(e); shadow(m, vis, e.x, e.y, e.vision);
      }
    }
    for (const e of w.ents) {
      if (e.dead || e.team !== 1) continue;
      let v = fogOff;
      if (e.building) v = true;                                  // buildings are always visible once on the map
      else if (!v) {
        const tx = m.toTile(e.x), ty = m.toTile(e.y);
        v = tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && vis[ty * m.w + tx] === 1;
        if (!v) for (const s of src) if (Math.hypot(e.x - s.x, e.y - s.y) <= SIGHT && (!m.elevAt || m.elevAt(e.x, e.y) <= m.elevAt(s.x, s.y))) { v = true; break; }
      }
      if (v && !e.building && isHidden(e) && !revealed(e) && !trueSighted(w, 0, e)) v = false;   // invisible: needs detection
      const prev = !!e.visible;
      e.visible = v;
      if (v) e.lastSeen = { x: e.x, y: e.y, t: w.t };
      if (prev !== v) w.emit('visibility', { unit: e.id, visible: v });
    }
  }

  IT.World.system('vision', 70, (w) => {
    const per = 1 / IT.GAME.VISION_HZ;
    if (w._visT === undefined || w.t - w._visT >= per - 1e-9) { w._visT = w.t; update(w); }
  });

  IT.Vision = { los, canSee, trueSighted, teamSees, visibleAt, update, shadow, isHidden, SIGHT };
})(typeof window !== 'undefined' ? window : globalThis);
