// Terrain: whole map pre-rendered once into an offscreen canvas (8px tiles), trees as y-sortable sprites, water shimmer.
// Maps with map.trees (real Dota tree entities, map-local units) get one true-scale sprite per tree (family palette, scale field);
// maps without it (grounds) keep the old one-sprite-per-'T'-tile forest. map.direAt/map.world give the Dire-half ground theme.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const PX = IT.Pixel;
  const A = h => PX.abgrHex(h);

  // v6: brighter, more saturated ground (lit by a near-neutral daylight ambient inside vision; fog outside vision stays dark)
  const GRASS = ['#3a6e30', '#447e36', '#4f8c3c'].map(A), GRASS_TUFT = A('#64a64a'), GRASS_DARK = A('#2c5626');
  const GRASS_D = ['#4a4c2c', '#555832', '#62643a'].map(A), GRASS_D_TUFT = A('#7a7840'), GRASS_D_DARK = A('#363a20');
  const DIRT_D = ['#603a2c', '#704634', '#80543e'].map(A), DIRT_D_PEB = A('#a07a5c');
  const FLOOR = ['#1c3a20', '#244628'].map(A), FLOOR_LEAF = A('#365e26');
  const DIRT = ['#76562e', '#866438', '#967242'].map(A), DIRT_PEB = A('#b49866');
  const WATER = ['#1a4e92', '#205ca8', '#286abc'].map(A), SHORE = A('#4a8cd0'), FOAM = A('#8cc8ec');
  const RIVER = ['#2480c8', '#2e94d8', '#3ca8e4'].map(A), RIVER_EDGE = A('#7cd2f2'), RIVER_SAND = A('#c4ae6e'), RIVER_FOAM = A('#c4f0fc');
  const STONE = ['#5c5c6a', '#6a6a78', '#787886'].map(A), STONE_LINE = A('#3e3e4a'), STONE_HI = A('#9a9aac');
  const ROCK = ['#463f56', '#544c66', '#625a76'].map(A);
  const R_HI = A('#c2b8d8'), R_HI2 = A('#9c92b4'), R_FACE = A('#302a40'), R_FACE2 = A('#3a344c'), R_EDGE = A('#1c1824'), R_LEFT = A('#80769c');

  const TREE_PAL = [
    { hi: '#5aa844', mid: '#408a36', sh: '#2e6a2c', dp: '#1c4a22', ol: '#0a1a10' },
    { hi: '#3eaa7c', mid: '#2c8a62', sh: '#1f6a4c', dp: '#144a36', ol: '#08181a' },
    { hi: '#84ae3e', mid: '#628e32', sh: '#466c2a', dp: '#2e4c1e', ol: '#0e1a0c' },
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
    c._ax = TAX; c._ay = TAY;
    return c;
  }

  // ---- true-scale trees: one baked sprite per (family, model variant, scale bucket)
  const FAM_PAL = {
    pine: { hi: '#62c04e', mid: '#409a3e', sh: '#2c7434', dp: '#1a522a', ol: '#09180f' },
    oak: { hi: '#a2d044', mid: '#72aa36', sh: '#4e842e', dp: '#335c22', ol: '#0e1a0c' },
    bamboo: { hi: '#acec6c', mid: '#74ca56', sh: '#4aa24a', dp: '#2c7036', ol: '#0a1c12' },
  };
  const DIRE_PALS = [
    { hi: '#946270', mid: '#6c4452', sh: '#4c3040', dp: '#30202e', ol: '#0c080e' },
    { hi: '#946450', mid: '#6c4638', sh: '#4c302c', dp: '#311f20', ol: '#0e0809' },
    { hi: '#7c62a0', mid: '#5a4676', sh: '#403254', dp: '#2a2038', ol: '#09080e' },
  ];
  const famOf = m => /^dire_tree/.test(m) ? 'dire' : /pine/.test(m) ? 'pine' : /bamboo/.test(m) ? 'bamboo' : 'oak';
  const strHash = str => { let h = 7; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; };
  const treeCache = {};

  function bakeTree(fam, v, kb) {
    const k = kb / 10, hwMax = { pine: 16, oak: 18, bamboo: 13, dire: 18 }[fam], hMax = { pine: 52, oak: 50, bamboo: 54, dire: 54 }[fam];
    const W = Math.ceil(hwMax * 2 * k) + 2, H = Math.ceil(hMax * k) + 2, cxm = W / 2, base = H - 2;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'), id = x.createImageData(W, H), u = new Uint32Array(id.data.buffer);
    const pal = fam === 'dire' ? DIRE_PALS[v % 3] : FAM_PAL[fam], col = {}; for (const q in pal) col[q] = A(pal[q]);
    const trunk = fam === 'dire' ? A('#3a2c34') : A('#4a3322'), trunkD = fam === 'dire' ? A('#241a22') : A('#2c1e12'), sd = 400 + v * 7 + kb;
    const put = (px, py, cc) => { px |= 0; py |= 0; if (px >= 0 && py >= 0 && px < W && py < H) u[py * W + px] = cc; };
    const tone = (bl, xx, yy) => { const l = bl + (PX.bayer(xx, yy) - 0.5) * 0.45; return l > 0.5 ? col.hi : l > 0.1 ? col.mid : l > -0.3 ? col.sh : col.dp; };
    const ell = (cx, cy, rx, ry) => {
      for (let yy = Math.floor(cy - ry); yy <= Math.ceil(cy + ry); yy++) for (let xx = Math.floor(cx - rx); xx <= Math.ceil(cx + rx); xx++) {
        const dx = (xx + 0.5 - cx) / rx, dy = (yy + 0.5 - cy) / ry, d = Math.hypot(dx, dy);
        if (d < 1) put(xx, yy, tone(-0.55 * dx - 0.75 * dy - d * 0.25, xx, yy));
      }
    };
    const tri = (cx, top, bot, hw) => {
      for (let yy = Math.floor(top); yy < Math.ceil(bot); yy++) {
        const wy = Math.max(1, hw * (yy + 0.5 - top) / (bot - top)) + (PX.hash2(yy, kb, sd) - 0.5) * 1.4, dy = (yy + 0.5 - (top + bot) / 2) / ((bot - top) / 2);
        for (let xx = Math.floor(cx - wy); xx <= Math.ceil(cx + wy); xx++) {
          const dx = (xx + 0.5 - cx) / wy; if (Math.abs(dx) >= 1) continue;
          put(xx, yy, tone(-0.55 * dx - 0.6 * dy - Math.abs(dx) * 0.25, xx, yy));
        }
      }
    };
    const trk = (w, y0) => { for (let yy = Math.round(y0); yy <= base; yy++) for (let i = 0; i < w; i++) put(Math.round(cxm - w / 2) + i, yy, i < w / 2 ? trunk : trunkD); };
    if (fam === 'pine') {
      const cb = base - 7 * k, ch = 44 * k;
      trk(Math.max(2, Math.round(3 * k)), cb - 3 * k);
      const hws = [5, 8, 11, 13.5, 16];
      for (let j = 0; j < 5; j++) { const top = cb - ch + j * ch * 0.19; tri(cxm, top, top + ch * 0.3, hws[j] * k); }
    } else if (fam === 'oak') {
      const cb = base - 8 * k, ym = cb - 19 * k, o = (v % 3 - 1) * 1.5 * k;
      trk(Math.max(3, Math.round(4 * k)), cb - 6 * k);
      ell(cxm, ym + 3 * k, 15 * k, 15 * k);
      ell(cxm - 8 * k + o, ym + 5 * k, 8 * k, 9 * k); ell(cxm + 8 * k - o, ym + 4 * k, 8 * k, 9 * k);
      ell(cxm - 5 * k, ym - 4 * k, 8 * k, 9 * k); ell(cxm + 5 * k + o, ym - 5 * k, 8 * k, 9 * k);
      ell(cxm + o, ym - 9 * k, 11 * k, 11 * k);
    } else if (fam === 'bamboo') {
      const xs = [-8, -5, -2, 1, 4, 7], hs = [34, 46, 40, 48, 36, 42], st = A('#7cb858'), stD = A('#4a8040'), jn = A('#2c5a30');
      for (let i = 0; i < 6; i++) {
        const sx = Math.round(cxm + xs[i] * k + (v % 2)), h = hs[(i + v) % 6] * k;
        for (let yy = Math.round(base - h); yy <= base; yy++) { put(sx, yy, ((base - yy) % 7) === 6 ? jn : st); put(sx + 1, yy, ((base - yy) % 7) === 6 ? jn : stD); }
      }
      for (let i = 0; i < 6; i++) {
        const h = hs[(i + v) % 6] * k, sx = cxm + xs[i] * k;
        ell(sx + 1, base - h + 3 * k, 6 * k, 2.6 * k); ell(sx - 4 * k, base - h * 0.7, 5 * k, 2.2 * k); ell(sx + 5 * k, base - h * 0.55, 5 * k, 2.2 * k);
      }
    } else {   // dire: gnarled, spiky, dark
      const cb = base - 8 * k, ym = cb - 20 * k, o = (v % 3 - 1) * 2 * k;
      trk(Math.max(2, Math.round(3 * k)), cb - 8 * k);
      tri(cxm - 10 * k + o, ym - 12 * k, ym + 4 * k, 5 * k); tri(cxm + 10 * k - o, ym - 9 * k, ym + 6 * k, 5 * k);
      ell(cxm, ym + 4 * k, 13 * k, 14 * k);
      ell(cxm - 9 * k, ym + 8 * k, 7 * k, 8 * k); ell(cxm + 9 * k, ym + 7 * k, 7 * k, 8 * k);
      tri(cxm + o, ym - 24 * k, ym - 4 * k, 8 * k);
      ell(cxm + o, ym - 5 * k, 8 * k, 8 * k);
    }
    // outline
    const solid = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) solid[i] = u[i] ? 1 : 0;
    for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
      const i = yy * W + xx; if (solid[i]) continue;
      if ((xx > 0 && solid[i - 1]) || (xx < W - 1 && solid[i + 1]) || (yy > 0 && solid[i - W]) || (yy < H - 1 && solid[i + W])) u[i] = col.ol;
    }
    x.putImageData(id, 0, 0);
    c._ax = Math.floor(cxm); c._ay = base; c._hh = base - 1; c._hw = Math.round(hwMax * k * 0.8);
    return c;
  }
  function treeSprite(model, s) {
    const fam = famOf(model), kb = Math.max(6, Math.min(10, Math.round(s * 10))), v = strHash(model) % 3, key = fam + v + ':' + kb;
    return treeCache[key] || (treeCache[key] = bakeTree(fam, v, kb));
  }

  function build(map) {
    const T = map.tile / IT.GAME.UNIT_PX, MW = map.w, MH = map.h, W = MW * T, H = MH * T;
    const base = document.createElement('canvas'); base.width = W; base.height = H;
    const bx = base.getContext('2d');
    const id = bx.createImageData(W, H), u = new Uint32Array(id.data.buffer);
    const at = (tx, ty) => map.at(tx, ty);
    const ent = !!map.trees, UP = IT.GAME.UNIT_PX;                   // entity trees (true scale) vs legacy per-tile forest
    const gox = map.world ? map.world.gx0 * T : 0, goy = map.world ? map.world.gy0 * T : 0;
    // Dire half (Dota x + y > 0 <=> world x px > y px): dithered diagonal blend so the boundary is not a tile staircase
    const direAt = map.world ? (x, y) => {
      let dd = (gox + x) - (goy + y);
      if (dd > 40) return true; if (dd < -40) return false;
      dd += (PX.noise2(x, y, 9, 21) - 0.5) * 16;
      return dd > 16 ? true : dd < -16 ? false : PX.bayer(x, y) < (dd + 16) / 32;
    } : null;

    const el = (tx, ty) => map.elevTile(tx, ty);
    const wet = t => t === 3 || t === 5, drt = t => t === 4 || t === 6 || t === 5 || t === 3;
    const grass = (x, y, dire) => {
      const n = PX.noise2(x, y, 14, 1) * 0.65 + PX.noise2(x, y, 5, 2) * 0.35;
      const v = n + (PX.bayer(x, y) - 0.5) * 0.24, G = dire ? GRASS_D : GRASS;
      if (PX.hash2(x, y, 9) < 0.014) return dire ? GRASS_D_TUFT : GRASS_TUFT;
      if (PX.hash2(x, y, 11) < 0.008) return dire ? GRASS_D_DARK : GRASS_DARK;
      return v < 0.44 ? G[0] : v < 0.57 ? G[1] : G[2];
    };
    const mul = (c, f) => {
      const r = (c & 255) * f | 0, g = ((c >> 8) & 255) * f | 0, b = ((c >> 16) & 255) * f | 0;
      return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
    };

    const shimmer = [];                                    // per water tile: 2 px positions
    const waterIdx = new Int32Array(MW * MH).fill(-1);
    const trees = [], treeRows = [];
    for (let i = 0; i < MH; i++) treeRows.push([]);

    // paint the tile rectangle [ax0,ax1) x [ay0,ay1) into the shared ImageData (the caller puts it on the canvas)
    const paint = (ax0, ay0, ax1, ay1) => { for (let ty = ay0; ty < ay1; ty++) for (let tx = ax0; tx < ax1; tx++) {
      const t = at(tx, ty), x0 = tx * T, y0 = ty * T;
      const up = at(tx, ty - 1), dn = at(tx, ty + 1), lf = at(tx - 1, ty), rt = at(tx + 1, ty);
      if (t === 3 || t === 5) {
        waterIdx[ty * MW + tx] = shimmer.length / 3;
        for (let k = 0; k < 2; k++) shimmer.push(x0 + (PX.hash2(tx, ty, 20 + k) * T | 0), y0 + (PX.hash2(tx, ty, 30 + k) * T | 0), PX.hash2(tx, ty, 40 + k));
      }
      for (let ly = 0; ly < T; ly++) for (let lx = 0; lx < T; lx++) {
        const x = x0 + lx, y = y0 + ly;
        let c;
        const dire = direAt !== null && (t === 0 || t === 4 || t === 1) && direAt(x, y);
        if (t === 0) c = grass(x, y, dire);
        else if (t === 6) {
          const v = PX.noise2(x, y, 5, 14) + (PX.bayer(x, y) - 0.5) * 0.2;
          c = v < 0.4 ? STONE[0] : v < 0.6 ? STONE[1] : STONE[2];
          if ((ly === 0 || lx === 0) && (tx + ty) % 2 === 0) c = STONE_LINE;
          else if (ly === 1 && lx > 0 && (tx + ty) % 2 === 1) c = STONE_HI;
        } else if (t === 5) {
          const v = PX.noise2(x * 1.0, y * 1.8, 7, 16) * 0.7 + PX.noise2(x, y, 3, 17) * 0.3 + (PX.bayer(x, y) - 0.5) * 0.22;
          c = v < 0.4 ? RIVER[0] : v < 0.58 ? RIVER[1] : RIVER[2];
          let d = 99;
          if (!wet(up)) d = Math.min(d, ly);
          if (!wet(dn)) d = Math.min(d, T - 1 - ly);
          if (!wet(lf)) d = Math.min(d, lx);
          if (!wet(rt)) d = Math.min(d, T - 1 - lx);
          if (d === 0) c = PX.bayer(x, y) > 0.5 ? RIVER_SAND : RIVER_EDGE;
          else if (d === 1 && PX.bayer(x, y) < 0.4) c = RIVER_EDGE;
          else if (d === 2 && PX.bayer(x, y) < 0.15) c = RIVER_FOAM;
        } else if (t === 1) {
          const v = PX.noise2(x, y, 6, 3) + (PX.bayer(x, y) - 0.5) * 0.3;
          c = ent ? mul(grass(x, y, dire), 0.84) : PX.hash2(x, y, 12) < 0.03 ? FLOOR_LEAF : v < 0.5 ? FLOOR[0] : FLOOR[1];
        } else if (t === 4) {
          const v = PX.noise2(x, y, 7, 4) + (PX.bayer(x, y) - 0.5) * 0.26;
          const DR = dire ? DIRT_D : DIRT;
          c = PX.hash2(x, y, 13) < 0.025 ? (dire ? DIRT_D_PEB : DIRT_PEB) : v < 0.42 ? DR[0] : v < 0.58 ? DR[1] : DR[2];
          let d = 99;
          if (!drt(up)) d = Math.min(d, ly);
          if (!drt(dn)) d = Math.min(d, T - 1 - ly);
          if (!drt(lf)) d = Math.min(d, lx);
          if (!drt(rt)) d = Math.min(d, T - 1 - lx);
          if (d < 3 && PX.hash2(x, y, 5) < (3 - d) / 3 * 0.85) c = grass(x, y, dire);
        } else if (t === 3) {
          const v = PX.noise2(x * 1.0, y * 1.8, 8, 6) * 0.7 + PX.noise2(x, y, 3, 8) * 0.3 + (PX.bayer(x, y) - 0.5) * 0.2;
          c = v < 0.4 ? WATER[0] : v < 0.56 ? WATER[1] : WATER[2];
          let d = 99;
          if (up !== 3 && up !== 5) d = Math.min(d, ly);
          if (dn !== 3 && dn !== 5) d = Math.min(d, T - 1 - ly);
          if (lf !== 3 && lf !== 5) d = Math.min(d, lx);
          if (rt !== 3 && rt !== 5) d = Math.min(d, T - 1 - lx);
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
        // elevation tint: plateaus lighter, pits darker and cooler
        if (t !== 2) {
          const e = el(tx, ty);
          if (e === 2) c = mul(c, 1.16); else if (e === 0) c = mul(mul(c, 0.8), 1);
        }
        // cliff shadow on ground just below a rock tile
        if (t !== 2 && up === 2) { if (ly === 0) c = mul(c, 0.6); else if (ly === 1) c = mul(c, 0.8); }
        u[y * W + x] = c;
      }
      if (t === 1 && !ent) {
        const h = PX.hash2(tx, ty, 77);
        const jx = (PX.hash2(tx, ty, 78) - 0.5) * 3, jy = (PX.hash2(tx, ty, 79) - 0.5) * 3;
        const tr = { x: Math.round(tx * T + T / 2 + jx), y: Math.round(ty * T + T - 1 + jy), p: (h * 3) | 0, s: ((h * 97) | 0) % 3, k: 1 };
        treeRows[ty].push(tr); trees.push(tr);
      }
    } };
    // Arena cap: huge maps (the 368x368 whole map) paint ground + tree shadows in CHUNK-tile squares only where the camera looks
    const AR = IT.GAME.ARENA, lazy = ent && !!AR && MW * MH > AR.LAZY_TILES;
    if (!lazy) { paint(0, 0, MW, MH); bx.putImageData(id, 0, 0); }

    let shadow = null;
    if (ent) {
      for (const e of map.trees) {
        const c = treeSprite(e.m, e.s), tr = { x: Math.round(e.x / UP), y: Math.round(e.y / UP), c, k: Math.max(0.6, Math.min(1, e.s)), hh: c._hh, hw: c._hw };
        const row = Math.max(0, Math.min(MH - 1, Math.floor(e.y / map.tile)));
        treeRows[row].push(tr); trees.push(tr);
      }
      bx.fillStyle = 'rgba(2,10,6,0.36)';        // ellipse shadow, offset right/down of the trunk
      shadow = tr => { const sw = Math.round(11 * tr.k); for (let dy = -2; dy <= 2; dy++) { const hw = Math.round(sw * Math.sqrt(1 - (dy / 2.8) * (dy / 2.8))); bx.fillRect(tr.x - hw + 3, tr.y + dy, hw * 2, 1); } };
      if (!lazy) for (const tr of trees) shadow(tr);
    } else {
      const spr = TREE_PAL.map(p => TREE_SHAPES.map(s => makeTree(p, s)));
      for (const tr of trees) { tr.c = spr[tr.p][tr.s]; tr.hh = 22; tr.hw = 11; }
      bx.fillStyle = 'rgba(2,10,6,0.38)';       // tree ground shadows (offset right/down, mostly under the trunk)
      for (const tr of trees) {
        bx.fillRect(tr.x - 4, tr.y - 1, 11, 3);
        bx.fillRect(tr.x - 2, tr.y - 2, 8, 1);
        bx.fillRect(tr.x - 2, tr.y + 2, 8, 1);
      }
    }
    for (const r of treeRows) r.sort((a, b) => a.y - b.y);

    const mm = buildMini(map);
    const ter = { map, base, W, H, T, trees, treeRows, shimmer, waterIdx, mini: mm, lazy, ensure: null, chunksDone: () => 0 };
    if (lazy) {
      const CH = AR.CHUNK, cs = CH * T, cw = Math.ceil(MW / CH), chn = Math.ceil(MH / CH), done = new Uint8Array(cw * chn), buckets = [];
      let nDone = 0;
      for (const tr of trees) {   // a tree's shadow spills ~14 px right and ~3 px up/down: bucket it into every chunk it touches
        const r = chunkRange(tr.x - 12, tr.y - 4, 30, 8, cs, cw, chn, 0);
        for (let cy = r.y0; cy <= r.y1; cy++) for (let cx = r.x0; cx <= r.x1; cx++) (buckets[cy * cw + cx] || (buckets[cy * cw + cx] = [])).push(tr);
      }
      const chunk = (cx, cy) => {
        const i = cy * cw + cx; if (done[i]) return; done[i] = 1; nDone++;
        const x0 = cx * CH, y0 = cy * CH, x1 = Math.min(MW, x0 + CH), y1 = Math.min(MH, y0 + CH);
        paint(x0, y0, x1, y1);
        bx.putImageData(id, 0, 0, x0 * T, y0 * T, (x1 - x0) * T, (y1 - y0) * T);
        const b = buckets[i]; if (!b) return;
        bx.save(); bx.beginPath(); bx.rect(x0 * T, y0 * T, (x1 - x0) * T, (y1 - y0) * T); bx.clip();
        bx.fillStyle = 'rgba(2,10,6,0.36)'; for (const tr of b) shadow(tr);
        bx.restore();
      };
      // paint every chunk the view touches now, plus (a couple per call) a one-chunk ring so scrolling never shows blanks
      ter.ensure = (camX, camY, VW, VH) => {
        const v = chunkRange(camX, camY, VW, VH, cs, cw, chn, 0);
        for (let cy = v.y0; cy <= v.y1; cy++) for (let cx = v.x0; cx <= v.x1; cx++) chunk(cx, cy);
        const m = chunkRange(camX, camY, VW, VH, cs, cw, chn, 1); let budget = 2;
        for (let cy = m.y0; cy <= m.y1 && budget > 0; cy++) for (let cx = m.x0; cx <= m.x1 && budget > 0; cx++) if (!done[cy * cw + cx]) { chunk(cx, cy); budget--; }
      };
      ter.chunksDone = () => nDone;
      ter.chunkCount = cw * chn;
    }
    return ter;
  }

  // Pure: the chunk index rectangle (inclusive, clamped to the cw x chn grid) covering the pixel box (x, y, w, h) grown by `margin` chunks.
  function chunkRange(x, y, w, h, cs, cw, chn, margin) {
    const m = margin || 0;
    return { x0: Math.max(0, Math.floor(x / cs) - m), y0: Math.max(0, Math.floor(y / cs) - m), x1: Math.min(cw - 1, Math.floor((x + w - 1) / cs) + m), y1: Math.min(chn - 1, Math.floor((y + h - 1) / cs) + m) };
  }

  // minimap colour per mini pixel (covered tiles averaged); 135x75
  const MINI_W = 135, MINI_H = 75;
  const MINI = [[44, 76, 44], [18, 40, 24], [92, 88, 104], [40, 88, 150], [104, 82, 56], [64, 140, 206], [86, 86, 96]];
  const ELEV_K = [0.78, 1, 1.2];
  function buildMini(map) {
    const w = MINI_W, h = MINI_H, rgb = new Uint8Array(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * map.w / w), x1 = Math.max(x0, Math.ceil((x + 1) * map.w / w) - 1), y0 = Math.floor(y * map.h / h), y1 = Math.max(y0, Math.ceil((y + 1) * map.h / h) - 1);
      let r = 0, g = 0, b = 0, n = 0;
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) { const c = MINI[map.at(tx, ty)] || MINI[0], k = ELEV_K[map.elevTile(tx, ty)] || 1, d = map.direAt && map.direAt(tx, ty) && (map.at(tx, ty) === 0 || map.at(tx, ty) === 4);
        r += c[0] * k * (d ? 1.12 : 1); g += c[1] * k * (d ? 0.9 : 1); b += c[2] * k * (d ? 0.72 : 1); n++; }
      const i = (y * w + x) * 3; rgb[i] = Math.min(255, r / n); rgb[i + 1] = Math.min(255, g / n); rgb[i + 2] = Math.min(255, b / n);
    }
    return { w, h, rgb };
  }

  const SHIM = ['#3f7bb4', '#6aa2d6', '#a4d4f0'];
  // blit visible region of the pre-rendered map + animated water pixels
  function draw(R, ter) {
    const cx = R.cx, VW = R.VW, VH = R.VH;
    if (ter.ensure) ter.ensure(R.camX, R.camY, VW, VH);
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

  IT.Terrain = { build, draw, chunkRange, TW, TH, TAX, TAY, MINI_W, MINI_H };
})(typeof window !== 'undefined' ? window : globalThis);
