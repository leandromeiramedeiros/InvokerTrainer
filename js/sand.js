'use strict';
// Falling-sand sim (Noita-style) + renderer. Globals: Sand
const Sand = (() => {
  const W = 320, H = 180;
  const M = { EMPTY: 0, SAND: 1, STONE: 2, WATER: 3, ICE: 4, LAVA: 5, FIRE: 6, SMOKE: 7, STEAM: 8, SPARK: 9 };
  const T = { PINK: 0, GOLD: 1, GREEN: 2, CYAN: 3, PURPLE: 4, ORANGE: 5, WHITE: 6, ICE: 7, MAGENTA: 8, LIME: 9 };
  const TINTS = ['#ff5c9a', '#ffd23f', '#1fd69a', '#38c8ff', '#a66bff', '#ff8a2a', '#f4f1de', '#8fe9ff', '#ff6bf0', '#b6f542'];
  const cells = new Uint8Array(W * H), aux = new Uint8Array(W * H), tint = new Uint8Array(W * H), upd = new Uint8Array(W * H);
  let frame = 0;

  const rgba = (r, g, b, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const shade = (c, f) => rgba(Math.min(255, c[0] * f | 0), Math.min(255, c[1] * f | 0), Math.min(255, c[2] * f | 0));
  const sandCol = TINTS.map(h => { const c = hex(h); return [0.72, 0.86, 1, 1.14].map(f => shade(c, f)); });
  const sparkCol = TINTS.map(h => { const c = hex(h); return [shade(c, 1.1), rgba(255, 255, 255)]; });
  const stoneCol = [rgba(58, 52, 82), rgba(70, 62, 98), rgba(48, 44, 70), rgba(82, 74, 110)];
  const waterCol = [rgba(40, 120, 230), rgba(52, 140, 245), rgba(120, 200, 255)];
  const iceCol = [rgba(170, 235, 255), rgba(205, 248, 255), rgba(140, 215, 250)];
  const lavaCol = [rgba(255, 90, 20), rgba(255, 140, 30), rgba(255, 190, 50), rgba(220, 50, 15)];
  const fireCol = []; for (let i = 0; i < 64; i++) { const f = i / 63; fireCol.push(rgba(255, 60 + 190 * f | 0, 20 + 150 * f * f | 0)); }
  const smokeCol = [rgba(60, 50, 80), rgba(78, 66, 100), rgba(92, 82, 118)];
  const steamCol = [rgba(190, 200, 235), rgba(220, 228, 250)];

  const inb = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
  const rnd = n => (Math.random() * n) | 0;
  const get = (x, y) => (inb(x, y) ? cells[y * W + x] : M.STONE);
  function defAux(m) {
    switch (m) {
      case M.SAND: case M.STONE: return rnd(4);
      case M.LAVA: return 60 + rnd(60);
      case M.FIRE: return 20 + rnd(24);
      case M.SMOKE: return 30 + rnd(40);
      case M.STEAM: return 40 + rnd(40);
      case M.SPARK: return 24 + rnd(30);
      case M.ICE: return 150;
      default: return 0;
    }
  }
  function set(x, y, m, t = 0, a) {
    x |= 0; y |= 0; if (!inb(x, y)) return false;
    const i = y * W + x; cells[i] = m; tint[i] = t; aux[i] = a === undefined ? defAux(m) : a; upd[i] = 1; return true;
  }
  function add(x, y, m, t = 0, a) { x |= 0; y |= 0; return inb(x, y) && cells[y * W + x] === 0 ? set(x, y, m, t, a) : false; }
  function each(cx, cy, r, fn) {
    const r2 = r * r;
    for (let y = Math.max(0, cy - r | 0); y <= Math.min(H - 1, cy + r | 0); y++)
      for (let x = Math.max(0, cx - r | 0); x <= Math.min(W - 1, cx + r | 0); x++)
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r2) fn(x, y, y * W + x);
  }
  function burst(cx, cy, n, m, t, spread = 4) { for (let k = 0; k < n; k++) add(cx + (Math.random() - .5) * spread * 2, cy + (Math.random() - .5) * spread * 2, m, t); }
  const solidM = m => m === M.SAND || m === M.STONE || m === M.ICE;
  const solid = (x, y) => inb(x, y) && solidM(cells[y * W + x]);
  function surface(x, fromY = 0) {
    x = Math.max(0, Math.min(W - 1, x | 0));
    for (let y = Math.max(0, fromY | 0); y < H - 1; y++) if (solid(x, y) && solid(x, y + 1)) return y;
    return H - 1;
  }
  function count(x0, y0, x1, y1, ...mats) {
    let n = 0;
    for (let y = Math.max(0, y0 | 0); y <= Math.min(H - 1, y1 | 0); y++) for (let x = Math.max(0, x0 | 0); x <= Math.min(W - 1, x1 | 0); x++) if (mats.includes(cells[y * W + x])) n++;
    return n;
  }
  function swap(i, j) {
    let t = cells[i]; cells[i] = cells[j]; cells[j] = t;
    t = aux[i]; aux[i] = aux[j]; aux[j] = t;
    t = tint[i]; tint[i] = tint[j]; tint[j] = t;
    upd[i] = upd[j] = 1;
  }

  function genTerrain(kind) {
    cells.fill(0); aux.fill(0); tint.fill(0);
    const base = H - 6 - 16;
    for (let x = 0; x < W; x++) {
      const top = Math.round(base - 3 * Math.sin(x * 0.035) - 2 * Math.sin(x * 0.11 + 1));
      for (let y = top; y < H; y++) {
        if (y >= H - 6) set(x, y, M.STONE);
        else set(x, y, M.SAND, ((y >> 1) + (x >> 6) + (Math.sin(x * 0.07 + y * 0.2) > 0.6 ? 3 : 0)) % 10);
      }
    }
    if (kind === 'arena') for (const px of [40, 280]) for (let y = base - 4; y < H - 6; y++) for (let x = px - 3; x <= px + 3; x++) set(x, y, M.STONE);
  }

  function step() {
    frame++; upd.fill(0);
    const ltr = frame & 1;
    for (let y = H - 1; y >= 0; y--) {
      for (let xi = 0; xi < W; xi++) {
        const x = ltr ? xi : W - 1 - xi, i = y * W + x, m = cells[i];
        if (m === 0 || upd[i] || m === M.STONE) continue;
        const d = Math.random() < .5 ? -1 : 1, nx = x + d, okx = nx >= 0 && nx < W;
        switch (m) {
          case M.SAND: {
            if (y >= H - 1) break;
            const b = cells[i + W];
            if (b === 0 || b === M.WATER || (b >= M.FIRE && b !== M.LAVA)) { swap(i, i + W); break; }
            if (b === M.LAVA) { if (Math.random() < .05) { cells[i] = M.LAVA; aux[i] = 60 + rnd(60); } else if (Math.random() < .3) swap(i, i + W); break; }
            if (okx) { const c = cells[i + W + d]; if ((c === 0 || c === M.WATER || (c >= M.FIRE && c !== M.LAVA)) && cells[i + d] !== M.STONE) swap(i, i + W + d); }
            break;
          }
          case M.WATER: {
            if (y >= H - 1) break;
            const b = cells[i + W];
            if (b === 0 || b >= M.SMOKE) { swap(i, i + W); break; }
            if (okx) {
              if (cells[i + W + d] === 0) { swap(i, i + W + d); break; }
              if (cells[i + d] === 0) { swap(i, i + d); if (nx + d >= 0 && nx + d < W && cells[i + 2 * d] === 0) swap(i + d, i + 2 * d); }
            }
            break;
          }
          case M.LAVA: {
            if (--aux[i] <= 0 && Math.random() < .5) { cells[i] = M.STONE; aux[i] = rnd(4); break; }
            const k = rnd(4);
            if (!(k === 0 && x === 0) && !(k === 1 && x === W - 1)) {
              const j = k === 0 ? i - 1 : k === 1 ? i + 1 : k === 2 ? i - W : i + W;
              if (j >= 0 && j < W * H) {
                const n = cells[j];
                if (n === M.WATER) { cells[j] = M.STEAM; aux[j] = 40; cells[i] = M.STONE; aux[i] = rnd(4); break; }
                if (n === M.SAND && Math.random() < .04) { cells[j] = M.LAVA; aux[j] = 50 + rnd(50); }
                else if (n === M.ICE && Math.random() < .4) cells[j] = M.WATER;
                else if (n === 0 && k === 2 && Math.random() < .015) { cells[j] = M.FIRE; aux[j] = 14 + rnd(10); upd[j] = 1; }
              }
            }
            if (Math.random() < .35 && y < H - 1) {
              const b = cells[i + W];
              if (b === 0 || b >= M.SMOKE) swap(i, i + W);
              else if (okx) { if (cells[i + W + d] === 0) swap(i, i + W + d); else if (cells[i + d] === 0) swap(i, i + d); }
            }
            break;
          }
          case M.ICE:
            if (((frame + i) & 7) === 0 && --aux[i] <= 0) cells[i] = M.WATER;
            break;
          case M.FIRE: {
            if (--aux[i] <= 0) { if (Math.random() < .3) { cells[i] = M.SMOKE; aux[i] = 20 + rnd(30); } else cells[i] = 0; break; }
            const k = rnd(4);
            if (!(k === 0 && x === 0) && !(k === 1 && x === W - 1)) {
              const j = k === 0 ? i - 1 : k === 1 ? i + 1 : k === 2 ? i - W : i + W;
              if (j >= 0 && j < W * H) {
                const n = cells[j];
                if (n === M.WATER) { cells[j] = M.STEAM; aux[j] = 40; cells[i] = 0; break; }
                if (n === M.ICE) { cells[j] = M.WATER; cells[i] = 0; break; }
                if (n === M.SAND && Math.random() < .004) { cells[j] = M.LAVA; aux[j] = 40 + rnd(40); }
              }
            }
            if (y > 0 && Math.random() < .85) {
              const dx = Math.random() < .5 ? d : 0;
              if (x + dx >= 0 && x + dx < W && cells[i - W + dx] === 0) swap(i, i - W + dx);
            }
            break;
          }
          case M.SMOKE: case M.STEAM: {
            if (--aux[i] <= 0) { cells[i] = (m === M.STEAM && Math.random() < .12) ? M.WATER : 0; break; }
            if (y > 0) {
              if (cells[i - W] === 0 && Math.random() < .8) swap(i, i - W);
              else if (okx && cells[i - W + d] === 0) swap(i, i - W + d);
              else if (okx && cells[i + d] === 0) swap(i, i + d);
            }
            break;
          }
          case M.SPARK: {
            if (--aux[i] <= 0) { cells[i] = 0; break; }
            const ny = y + rnd(3) - 1;
            if (okx && ny >= 0 && ny < H && cells[ny * W + nx] === 0) swap(i, ny * W + nx);
            break;
          }
        }
      }
    }
  }

  // ---- rendering ----
  let cctx, gctx, img, gimg, px, gl;
  function init(cellCanvas, glowCanvas) {
    cellCanvas.width = glowCanvas.width = W; cellCanvas.height = glowCanvas.height = H;
    cctx = cellCanvas.getContext('2d'); gctx = glowCanvas.getContext('2d');
    img = cctx.createImageData(W, H); gimg = gctx.createImageData(W, H);
    px = new Uint32Array(img.data.buffer); gl = new Uint32Array(gimg.data.buffer);
  }
  function render() {
    const f3 = frame >> 3;
    for (let i = 0; i < W * H; i++) {
      const m = cells[i]; let c = 0, g = 0;
      switch (m) {
        case M.SAND: c = sandCol[tint[i]][aux[i] & 3]; break;
        case M.STONE: c = stoneCol[aux[i] & 3]; break;
        case M.WATER: c = i >= W && cells[i - W] === 0 ? waterCol[2] : waterCol[(i + f3) & 1]; break;
        case M.ICE: c = iceCol[(i * 7) % 3]; break;
        case M.LAVA: c = lavaCol[aux[i] < 12 ? 3 : (i + f3) & 3]; g = c; break;
        case M.FIRE: c = fireCol[Math.min(63, aux[i] * 2)]; g = c; break;
        case M.SMOKE: c = smokeCol[(i + f3) % 3]; break;
        case M.STEAM: c = steamCol[(i + f3) & 1]; break;
        case M.SPARK: c = sparkCol[tint[i]][aux[i] < 8 ? 1 : 0]; g = c; break;
      }
      px[i] = c; gl[i] = g;
    }
    cctx.putImageData(img, 0, 0); gctx.putImageData(gimg, 0, 0);
    return cctx;
  }
  return { W, H, M, T, TINTS, cells, tint, aux, inb, get, set, add, each, burst, solid, surface, count, genTerrain, step, init, render, rnd,
    cellsCanvas: () => cctx.canvas, glowCtx: () => gctx, get frame() { return frame; } };
})();
