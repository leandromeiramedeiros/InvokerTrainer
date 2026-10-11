// Camera: world-unit top-left (x,y). Edge scroll, arrow keys, Space center, optional lock-to-hero.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};

  function create(map) {
    const GM = IT.GAME, P = GM.UNIT_PX, VW = GM.VIEW_W, VH = GM.VIEW_H;
    const cam = {
      x: 0, y: 0, lock: false, speed: 2200, edge: 3,
      clamp() {
        cam.x = IT.U.clamp(cam.x, 0, Math.max(0, map.W - VW * P));
        cam.y = IT.U.clamp(cam.y, 0, Math.max(0, map.H - VH * P));
      },
      centerOn(x, y) { cam.x = x - VW * P / 2; cam.y = y - VH * P / 2; cam.clamp(); },
      // integer pixel offset of the view in map-pixel space
      get px() { return Math.round(cam.x / P); },
      get py() { return Math.round(cam.y / P); },
      toWorld(mx, my) { return { x: cam.px * P + mx * P, y: cam.py * P + my * P }; },
      toScreen(wx, wy) { return { x: wx / P - cam.px, y: wy / P - cam.py }; },
      update(dt, keys, mouse, hero) {
        if (cam.lock && hero) {
          const k = 1 - Math.exp(-dt * 12);
          cam.x += (hero.x - VW * P / 2 - cam.x) * k;
          cam.y += (hero.y - VH * P / 2 - cam.y) * k;
        }
        const sp = cam.speed * dt, e = cam.edge;
        let moved = false;
        if (keys.has('ArrowLeft') || (mouse.in && mouse.x < e)) { cam.x -= sp; moved = true; }
        if (keys.has('ArrowRight') || (mouse.in && mouse.x > VW - e)) { cam.x += sp; moved = true; }
        if (keys.has('ArrowUp') || (mouse.in && mouse.y < e)) { cam.y -= sp; moved = true; }
        if (keys.has('ArrowDown') || (mouse.in && mouse.y > VH - e)) { cam.y += sp; moved = true; }
        cam.clamp();
        return moved;
      },
    };
    if (map) cam.clamp();
    return cam;
  }

  IT.Camera = { create };
})(typeof window !== 'undefined' ? window : globalThis);
