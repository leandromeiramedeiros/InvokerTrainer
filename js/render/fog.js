// Fog of war (render side, Dota style, no memory): smoothed per-tile fog level (1 = outside vision: dark, 2 = visible).
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};

  function create(map) {
    const N = map.w * map.h;
    const f = {
      cur: new Float32Array(N).fill(1),   // level tracks real vision even when the shading setting is off (fx gating uses it)
      // call once per frame
      update(w, dt, camX, camY, VW, VH) {
        const vis = w.vis, off = w.fog === false || !vis;
        const T = 8, tx0 = Math.max(0, (camX / T | 0) - 3), ty0 = Math.max(0, (camY / T | 0) - 3);
        const tx1 = Math.min(map.w - 1, ((camX + VW) / T | 0) + 3), ty1 = Math.min(map.h - 1, ((camY + VH) / T | 0) + 3);
        const k = Math.min(1, dt * 9), cur = f.cur;
        for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
          const i = ty * map.w + tx;
          const tg = off || vis[i] ? 2 : 1;
          const d = tg - cur[i];
          cur[i] = Math.abs(d) < 0.02 ? tg : cur[i] + d * k;
        }
      },
      // bilinear fog level at map-pixel (px,py); tile centres are sample points
      sample(px, py) {
        const T = 8, fx = px / T - 0.5, fy = py / T - 0.5;
        let x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = fx - x0, ty = fy - y0;
        const W = map.w, H = map.h, cur = f.cur;
        let x1 = x0 + 1, y1 = y0 + 1;   // outside the map (camera overscroll) samples the nearest edge tile
        if (x0 < 0) x0 = 0; else if (x0 > W - 1) x0 = W - 1;
        if (y0 < 0) y0 = 0; else if (y0 > H - 1) y0 = H - 1;
        if (x1 < 0) x1 = 0; else if (x1 > W - 1) x1 = W - 1;
        if (y1 < 0) y1 = 0; else if (y1 > H - 1) y1 = H - 1;
        const a = cur[y0 * W + x0], b = cur[y0 * W + x1], c = cur[y1 * W + x0], d = cur[y1 * W + x1];
        return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
      },
      levelAt(wx, wy) {
        const tx = Math.floor(wx / map.tile), ty = Math.floor(wy / map.tile);
        if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return 0;
        return f.cur[ty * map.w + tx];
      },
    };
    return f;
  }

  IT.Fog = { create };
})(typeof window !== 'undefined' ? window : globalThis);
