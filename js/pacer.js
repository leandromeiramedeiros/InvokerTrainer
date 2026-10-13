// exact fps cap: time-budget accumulator over rAF deltas (IT.Pacer.make().step(rawMs, cap) -> render this frame?)
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  IT.Pacer = {
    make() {
      let budget = 0;
      return {
        step(raw, cap) {
          if (!(cap > 0)) { budget = 0; return true; }                   // 0 = display rate: every frame
          const target = 1000 / cap;
          budget = Math.min(target * 2, budget + raw);                 // stalls never bank a burst
          if (budget < target - 1) return false;                         // ~1 ms slack: rAF jitter must not drop a frame
          budget = Math.max(0, Math.min(target, budget - target));       // cap at/above the display rate: renders every frame
          return true;
        },
      };
    },
    // rendered frames/s: tick(now ms) once per game render; returns the rate every ~500 ms, else null
    counter() {
      let t0 = -1, n = 0;
      return { tick(now) { if (t0 < 0) { t0 = now; return null; } n++; if (now - t0 < 500) return null; const r = n * 1000 / (now - t0); t0 = now; n = 0; return r; }, reset() { t0 = -1; n = 0; } };
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
