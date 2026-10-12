// Invoker hood pixel art for the Aghanim's picker, drawn procedurally on a 48x48 grid (Bayer-dithered ramps, like js/art/medals.js).
// IT.Hood.canvas(scepterOn, shardOn) -> cached 48x48 canvas. The two eyes are the two upgrades: left = Scepter (gold), right = Shard (cyan).
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const N = 48;
  // ramps: [outline, highlight, base, shade, deep]
  const CLOAK = ['#07030f', '#8a52c8', '#5a2f94', '#3a1c68', '#1e0e3c'];
  const TRIM = ['#2a1804', '#fff0a0', '#f2c444', '#c28a1a', '#7c5110'];
  const VOID = ['#000000', '#1a0e2e', '#10081e', '#0a0414', '#04020a'];
  const EYE = { off: ['#2a1a40', '#4a3468'], gold: ['#fff6c0', '#ffd650', '#c28a1a'], cyan: ['#e8ffff', '#5ae6ff', '#1a8a9e'] };
  const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const bay = (x, y) => B4[((y & 3) << 2) | (x & 3)];
  const cache = {};

  const half = y => (y < 20 ? 18 * Math.sqrt(Math.max(0, 1 - ((20 - y) / 19) * ((20 - y) / 19))) : 18 + (y - 20) * 0.42);   // hood dome, then a flaring cloak
  const inCloak = (x, y) => y >= 1 && y < 45 && Math.abs(x - 23.5) <= half(y) + (y > 40 ? -(y - 40) * 1.4 : 0);   // bottom trimmed in
  const inFace = (x, y) => ((x - 23.5) / 10.5) * ((x - 23.5) / 10.5) + ((y - 23.5) / 12.5) * ((y - 23.5) / 12.5) <= 1;
  const inRim = (x, y) => ((x - 23.5) / 12) * ((x - 23.5) / 12) + ((y - 23.5) / 14) * ((y - 23.5) / 14) <= 1;

  function draw(sc, sh) {
    const c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), px = new Array(N * N).fill(null);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!inCloak(x + 0.5, y + 0.5)) continue;
      let col;
      if (inFace(x + 0.5, y + 0.5)) {   // the void under the hood: darker towards the middle
        const d = Math.hypot((x + 0.5 - 23.5) / 10.5, (y + 0.5 - 23.5) / 12.5);
        col = VOID[d + bay(x, y) * 0.5 > 0.95 ? 1 : d > 0.55 ? 2 : d > 0.25 ? 3 : 4];
      } else if (inRim(x + 0.5, y + 0.5)) col = TRIM[bay(x, y) < 0.45 ? 2 : 3];   // gold rim around the opening
      else {   // cloak: lit from the upper left, deeper toward the bottom right, with folds
        const nx = (x - 23.5) / 22, ny = (y - 22) / 24;
        let l = 0.55 - nx * 0.45 - ny * 0.3 + Math.sin((x + y * 0.4) * 0.9) * 0.12;
        l += (bay(x, y) - 0.5) * 0.35;
        col = CLOAK[l > 0.78 ? 1 : l > 0.5 ? 2 : l > 0.24 ? 3 : 4];
      }
      px[y * N + x] = col;
    }
    // outline: any cloak pixel next to empty
    const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? null : px[y * N + x]);
    const out = px.slice();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (px[y * N + x] && (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1))) out[y * N + x] = CLOAK[0];
    // collar gem
    const gem = [[23, 41], [24, 41], [22, 42], [23, 42], [24, 42], [25, 42], [23, 43], [24, 43]];
    gem.forEach(([x, y], i) => { out[y * N + x] = sc || sh ? (sc && sh ? TRIM[1] : sc ? TRIM[2] : '#7ae0f0') : TRIM[4]; if (i === 0) out[y * N + x] = sc || sh ? '#ffffff' : TRIM[3]; });
    // eyes: 3x2 slits; a lit eye gets a 1px halo
    const eye = (cx, on, ramp) => {
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 3; dx++) out[(23 + dy) * N + cx + dx] = on ? (dy ? ramp[1] : ramp[0]) : EYE.off[dy ? 0 : 1];
      if (on) {
        for (let dx = -1; dx < 4; dx++) for (const dy of [-1, 2]) if (out[(23 + dy) * N + cx + dx] && bay(cx + dx, 23 + dy) < 0.5) out[(23 + dy) * N + cx + dx] = ramp[2];
        for (const dy of [0, 1]) for (const dx of [-1, 3]) if (bay(cx + dx, 23 + dy) < 0.6) out[(23 + dy) * N + cx + dx] = ramp[2];
      }
    };
    eye(14, sc, EYE.gold); eye(31, sh, EYE.cyan);
    for (let i = 0; i < out.length; i++) if (out[i]) { g.fillStyle = out[i]; g.fillRect(i % N, (i / N) | 0, 1, 1); }
    return c;
  }

  function canvas(sc, sh) {
    const k = (sc ? 1 : 0) + (sh ? 2 : 0);
    return cache[k] || (cache[k] = draw(!!sc, !!sh));
  }

  IT.Hood = { canvas, N };
})(typeof window !== 'undefined' ? window : globalThis);
