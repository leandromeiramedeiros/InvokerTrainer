// Camera: world-unit top-left (x,y). Edge scroll (window edge via mouse.edge, or canvas edge via mouse.in), arrow keys,
// optional lock-to-hero, `follow` (center key held), speed scaled by the camSpeed setting.
// Centering never snaps except centerOn(): glideTo / follow / lock ease with a frame-rate independent exponential (tau ~0.16 s).
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const TAU = 0.16, TAU_FAR = 0.1;   // s: time constant; jumps over a full screen glide a bit quicker

  function create(map) {
    const GM = IT.GAME, P = GM.UNIT_PX, VW = GM.VIEW_W, VH = GM.VIEW_H;
    const cx = v => IT.U.clamp(v, 0, Math.max(0, map.W - VW * P));
    const cy = v => IT.U.clamp(v, 0, Math.max(0, map.H - VH * P));
    const cam = {
      x: 0, y: 0, lock: false, follow: false, speed: 2200, edge: 3, glide: null, tau: TAU,
      clamp() { cam.x = cx(cam.x); cam.y = cy(cam.y); },
      centerOn(x, y) { cam.glide = null; cam.x = x - VW * P / 2; cam.y = y - VH * P / 2; cam.clamp(); },   // instant (minimap, start)
      glideTo(x, y) { cam.glide = { x: cx(x - VW * P / 2), y: cy(y - VH * P / 2) }; },                       // eased
      // integer pixel offset of the view in map-pixel space
      get px() { return Math.round(cam.x / P); },
      get py() { return Math.round(cam.y / P); },
      toWorld(mx, my) { return { x: cam.px * P + mx * P, y: cam.py * P + my * P }; },
      toScreen(wx, wy) { return { x: wx / P - cam.px, y: wy / P - cam.py }; },
      update(dt, keys, mouse, hero) {
        let goal = null;
        if (hero && (cam.follow || cam.lock)) goal = { x: cx(hero.x - VW * P / 2), y: cy(hero.y - VH * P / 2) };
        else if (cam.glide) goal = cam.glide;
        if (goal) {
          const dx = goal.x - cam.x, dy = goal.y - cam.y, d = Math.hypot(dx, dy);
          if (d < 0.5) { cam.x = goal.x; cam.y = goal.y; if (goal === cam.glide) cam.glide = null; }
          else {
            const k = 1 - Math.exp(-dt / (d > VW * P ? Math.min(cam.tau, TAU_FAR) : cam.tau));
            cam.x += dx * k; cam.y += dy * k;
          }
        }
        const set = IT.Settings && IT.Settings.get ? IT.Settings.get() : null;
        const sp = cam.speed * dt * ((set && set.camSpeed) || 1), e = cam.edge, ed = mouse.edge || {};
        let moved = false;
        if (keys.has('ArrowLeft') || ed.l || (mouse.in && mouse.x < e)) { cam.x -= sp; moved = true; }
        if (keys.has('ArrowRight') || ed.r || (mouse.in && mouse.x > VW - e)) { cam.x += sp; moved = true; }
        if (keys.has('ArrowUp') || ed.u || (mouse.in && mouse.y < e)) { cam.y -= sp; moved = true; }
        if (keys.has('ArrowDown') || ed.d || (mouse.in && mouse.y > VH - e)) { cam.y += sp; moved = true; }
        if (moved) cam.glide = null;   // manual scrolling takes over from a glide
        cam.clamp();
        return moved;
      },
    };
    if (map) cam.clamp();
    return cam;
  }

  IT.Camera = { create };
})(typeof window !== 'undefined' ? window : globalThis);
