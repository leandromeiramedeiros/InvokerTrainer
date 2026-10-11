// Terrain: whole map pre-rendered once into an offscreen canvas (8px tiles), trees as y-sortable sprites, water shimmer.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const PX = IT.Pixel;
  const A = h => PX.abgrHex(h);

  const GRASS = ['#2b4b2b', '#345633', '#3d643a'].map(A), GRASS_TUFT = A('#4c7a47'), GRASS_DARK = A('#223d25');
  const FLOOR = ['#15251a', '#1b2f20'].map(A), FLOOR_LEAF = A('#27401f');
  const DIRT = ['#503f2b', '#5f4a33', '#6e583b'].map(A), DIRT_PEB = A('#8a7656');
  const WATER = ['#1b3f6a', '#214a7b', '#28558a'].map(A), SHORE = A('#3b6c98'), FOAM = A('#6ea0bc');
  const ROCK = ['#35323d', '#423e4b', '#4e4a59'].map(A);
  const R_HI = A('#9c98a8'), R_HI2 = A('#7a7686'), R_FACE = A('#26242d'), R_FACE2 = A('#2f2d38'), R_EDGE = A('#18161d'), R_LEFT = A('#66627a');

  const TREE_PAL = [
    { hi: '#4a8640', mid: '#356b33', sh: '#265128', dp: '#183a20', ol: '#0a1a10' },
    { hi: '#38866a', mid: '#296b55', sh: '#1e5042', dp: '#143a30', ol: '#08181a' },
    { hi: '#6a8a3a', mid: '#4f7030', sh: '#3a5428', dp: '#263c1c', ol: '#0e1a0c' },
  ];
  const TREE_SHAPES = [
    [[9, 11, 6.3], [5, 13, 4.3], [13, 13, 4.3], [9, 6.5, 4.6]],
    [[9, 11, 6.6], [4.5, 12, 3.8], [13.5, 12, 3.8], [7, 6.5, 4.2], [12, 7.5, 4]],
    [[9, 10.5, 6], [5.5, 14, 3.8], [12.5, 14.5, 3.6], [9, 6, 4.8]],
  ];
  const TW = 18, TH = 24, TAX = 9, TAY = 21;

  function makeTree(pal, shape) {
    const c = document.createElement('canvas'); c.width = TW; c.height = TH;
    const x = c.getContext('2d'), id = x.createImageData(TW, TH), u = new Uint32Array(id.data.buffer);
    const col = {}; for (const k in pal) col[k] = A(pal[k]);
    const trunk = A('#3b2a1c'), trunkD = A('#271a10');
    for (let y = 16; y <= 21; y++) { u[y * TW + 8] = trunk; u[y * TW + 9] = trunkD; u[y * TW + 7] = col.ol; u[y * TW + 10] = col.ol; }
    u[22 * TW + 8] = col.ol; u[22 * TW + 9] = col.ol;
    const inside = new Uint8Array(TW * TH), tone = new Float32Array(TW * TH);
    for (let y = 0; y < TH; y++) for (let xx = 0; xx < TW; xx++) {
      let best = 9, bl = 0;
      for (const [cx, cy, r] of shape) {
        const dx = xx + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy) / r;
        if (d < 1 && d < best) { best = d; bl = -0.55 * dx / r - 0.75 * dy / r - d * 0.25; }
      }
      if (best < 9) { inside[y * TW + xx] = 1; tone[y * TW + xx] = bl + (PX.bayer(xx, y) - 0.5) * 0.45; }
    }
    for (let y = 0; y < TH; y++) for (let xx = 0; xx < TW; xx++) {
      const i = y * TW + xx;
      if (inside[i]) {
        const l = tone[i];
        u[i] = l > 0.5 ? col.hi : l > 0.1 ? col.mid : l > -0.3 ? col.sh : col.dp;
      } else {
        const nb = (xx > 0 && inside[i - 1]) || (xx < TW - 1 && inside[i + 1]) || (y > 0 && inside[i - TW]) || (y < TH - 1 && inside[i + TW]);
        if (nb) u[i] = col.ol;
      }
    }
    x.putImageData(id, 0, 0);
    return c;
  }

  function build(map) {
    const T = map.tile / IT.GAME.UNIT_PX, MW = map.w, MH = map.h, W = MW * T, H = MH * T;
    const base = document.createElement('canvas'); base.width = W; base.height = H;
    const bx = base.getContext('2d');
    const id = bx.createImageData(W, H), u = new Uint32Array(id.data.buffer);
    const at = (tx, ty) => map.at(tx, ty);

    const grass = (x, y) => {
      const n = PX.noise2(x, y, 14, 1) * 0.65 + PX.noise2(x, y, 5, 2) * 0.35;
      const v = n + (PX.bayer(x, y) - 0.5) * 0.24;
      if (PX.hash2(x, y, 9) < 0.014) return GRASS_TUFT;
      if (PX.hash2(x, y, 11) < 0.008) return GRASS_DARK;
      return v < 0.44 ? GRASS[0] : v < 0.57 ? GRASS[1] : GRASS[2];
    };
    const mul = (c, f) => {
      const r = (c & 255) * f | 0, g = ((c >> 8) & 255) * f | 0, b = ((c >> 16) & 255) * f | 0;
      return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
    };

    const shimmer = [];                                    // per water tile: 2 px positions
    const waterIdx = new Int32Array(MW * MH).fill(-1);
    const trees = [], treeRows = [];
    for (let i = 0; i < MH; i++) treeRows.push([]);

    for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) {
      const t = at(tx, ty), x0 = tx * T, y0 = ty * T;
      const up = at(tx, ty - 1), dn = at(tx, ty + 1), lf = at(tx - 1, ty), rt = at(tx + 1, ty);
      if (t === 3) {
        waterIdx[ty * MW + tx] = shimmer.length / 3;
        for (let k = 0; k < 2; k++) shimmer.push(x0 + (PX.hash2(tx, ty, 20 + k) * T | 0), y0 + (PX.hash2(tx, ty, 30 + k) * T | 0), PX.hash2(tx, ty, 40 + k));
      }
      for (let ly = 0; ly < T; ly++) for (let lx = 0; lx < T; lx++) {
        const x = x0 + lx, y = y0 + ly;
        let c;
        if (t === 0) c = grass(x, y);
        else if (t === 1) {
          const v = PX.noise2(x, y, 6, 3) + (PX.bayer(x, y) - 0.5) * 0.3;
          c = PX.hash2(x, y, 12) < 0.03 ? FLOOR_LEAF : v < 0.5 ? FLOOR[0] : FLOOR[1];
        } else if (t === 4) {
          const v = PX.noise2(x, y, 7, 4) + (PX.bayer(x, y) - 0.5) * 0.26;
          c = PX.hash2(x, y, 13) < 0.025 ? DIRT_PEB : v < 0.42 ? DIRT[0] : v < 0.58 ? DIRT[1] : DIRT[2];
          let d = 99;
          if (up !== 4 && up !== 3) d = Math.min(d, ly);
          if (dn !== 4 && dn !== 3) d = Math.min(d, T - 1 - ly);
          if (lf !== 4 && lf !== 3) d = Math.min(d, lx);
          if (rt !== 4 && rt !== 3) d = Math.min(d, T - 1 - lx);
          if (d < 3 && PX.hash2(x, y, 5) < (3 - d) / 3 * 0.85) c = grass(x, y);
        } else if (t === 3) {
          const v = PX.noise2(x * 1.0, y * 1.8, 8, 6) * 0.7 + PX.noise2(x, y, 3, 8) * 0.3 + (PX.bayer(x, y) - 0.5) * 0.2;
          c = v < 0.4 ? WATER[0] : v < 0.56 ? WATER[1] : WATER[2];
          let d = 99;
          if (up !== 3) d = Math.min(d, ly);
          if (dn !== 3) d = Math.min(d, T - 1 - ly);
          if (lf !== 3) d = Math.min(d, lx);
          if (rt !== 3) d = Math.min(d, T - 1 - lx);
          if (d === 0) c = PX.bayer(x, y) > 0.45 ? FOAM : SHORE;
          else if (d < 3 && PX.bayer(x, y) < 0.5 - d * 0.15) c = SHORE;
        } else {   // rock / cliff
          const v = PX.noise2(x, y, 6, 7) + (PX.bayer(x, y) - 0.5) * 0.3;
          c = v < 0.42 ? ROCK[0] : v < 0.58 ? ROCK[1] : ROCK[2];
          if (up !== 2 && ly < 2) c = ly === 0 ? R_HI : R_HI2;
          else if (dn !== 2 && ly >= T - 3) c = ly === T - 1 ? R_EDGE : ((x % 3) === 0 ? R_FACE2 : R_FACE);
          else if (lf !== 2 && lx === 0) c = R_LEFT;
          else if (rt !== 2 && lx === T - 1) c = R_FACE;
        }
        // cliff shadow on ground just below a rock tile
        if (t !== 2 && up === 2) { if (ly === 0) c = mul(c, 0.6); else if (ly === 1) c = mul(c, 0.8); }
        u[y * W + x] = c;
      }
      if (t === 1) {
        const h = PX.hash2(tx, ty, 77);
        const jx = (PX.hash2(tx, ty, 78) - 0.5) * 3, jy = (PX.hash2(tx, ty, 79) - 0.5) * 3;
        const tr = { x: Math.round(tx * T + T / 2 + jx), y: Math.round(ty * T + T - 1 + jy), p: (h * 3) | 0, s: ((h * 97) | 0) % 3 };
        treeRows[ty].push(tr); trees.push(tr);
      }
    }
    bx.putImageData(id, 0, 0);

    // tree ground shadows (offset right/down, mostly under the trunk)
    bx.fillStyle = 'rgba(2,10,6,0.38)';
    for (const tr of trees) {
      bx.fillRect(tr.x - 4, tr.y - 1, 11, 3);
      bx.fillRect(tr.x - 2, tr.y - 2, 8, 1);
      bx.fillRect(tr.x - 2, tr.y + 2, 8, 1);
    }
    for (const r of treeRows) r.sort((a, b) => a.y - b.y);

    const spr = TREE_PAL.map(p => TREE_SHAPES.map(s => makeTree(p, s)));
    const mm = buildMini(map);
    return { base, W, H, T, trees, treeRows, spr, shimmer, waterIdx, mini: mm };
  }

  // minimap colour per mini pixel (covered tiles averaged); 135x75
  const MINI_W = 135, MINI_H = 75;
  const MINI = [[44, 76, 44], [18, 40, 24], [92, 88, 104], [40, 88, 150], [104, 82, 56]];
  function buildMini(map) {
    const w = MINI_W, h = MINI_H, rgb = new Uint8Array(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * map.w / w), x1 = Math.max(x0, Math.ceil((x + 1) * map.w / w) - 1), y0 = Math.floor(y * map.h / h), y1 = Math.max(y0, Math.ceil((y + 1) * map.h / h) - 1);
      let r = 0, g = 0, b = 0, n = 0;
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) { const c = MINI[map.at(tx, ty)]; r += c[0]; g += c[1]; b += c[2]; n++; }
      const i = (y * w + x) * 3; rgb[i] = r / n; rgb[i + 1] = g / n; rgb[i + 2] = b / n;
    }
    return { w, h, rgb };
  }

  const SHIM = ['#3f7bb4', '#6aa2d6', '#a4d4f0'];
  // blit visible region of the pre-rendered map + animated water pixels
  function draw(R, ter) {
    const cx = R.cx, VW = R.VW, VH = R.VH;
    cx.drawImage(ter.base, R.camX, R.camY, VW, VH, 0, 0, VW, VH);
    const T = ter.T, map = R.w.map;
    const tx0 = Math.max(0, Math.floor(R.camX / T)), ty0 = Math.max(0, Math.floor(R.camY / T));
    const tx1 = Math.min(map.w - 1, Math.floor((R.camX + VW) / T)), ty1 = Math.min(map.h - 1, Math.floor((R.camY + VH) / T));
    const sh = ter.shimmer, tm = R.time * 1.5;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const wi = ter.waterIdx[ty * map.w + tx];
      if (wi < 0) continue;
      for (let k = 0; k < 2; k++) {
        const j = (wi + k) * 3, ph = Math.floor(tm + sh[j + 2] * 6) % 6;
        if (ph > 2) continue;
        cx.fillStyle = SHIM[ph];
        cx.fillRect(sh[j] - R.camX, sh[j + 1] - R.camY, ph === 1 ? 2 : 1, 1);
      }
    }
  }

  IT.Terrain = { build, draw, TW, TH, TAX, TAY, MINI_W, MINI_H };
})(typeof window !== 'undefined' ? window : globalThis);
