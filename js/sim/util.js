// Math + misc helpers shared by the sim. Pure.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const TAU = Math.PI * 2;
  const U = {
    TAU,
    clamp: (v, a, b) => v < a ? a : v > b ? b : v,
    lerp: (a, b, t) => a + (b - a) * t,
    dist: (a, b) => Math.hypot(b.x - a.x, b.y - a.y),
    dist2: (ax, ay, bx, by) => (bx - ax) * (bx - ax) + (by - ay) * (by - ay),
    angle: (a, b) => Math.atan2(b.y - a.y, b.x - a.x),
    // signed shortest difference b - a in (-PI, PI]
    angDiff: (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d <= -Math.PI) d += TAU; return d; },
    // distance from point p to segment ab
    segDist(px, py, ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 ? U.clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    },
    mulberry32(seed) {
      let a = seed >>> 0;
      return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
  };
  IT.U = U;
})(typeof window !== 'undefined' ? window : globalThis);
