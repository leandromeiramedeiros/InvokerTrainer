// Training-ground map: deterministic generator + hand-placed features -> IT.MAPDEF; IT.Map.build(def) -> map.
// Tile types: 0 grass, 1 tree (blocks move+sight), 2 rock/cliff (blocks both), 3 deep water (blocks move), 4 dirt (cosmetic),
// 5 river (walkable shallow water), 6 structure footprint (blocks move, not sight; 3x3 around each tower).
// Optional def.elev (Uint8Array|row strings of '0'..'2'): 0 low, 1 ground, 2 high ground. def.ramp: Uint8Array mask. def.towers: [{tx,ty,team,tier}], def.structures: [{kind,tx,ty,hw,team}] (barracks, fort, filler, fountain, shop, outpost).
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const TILE = 48, W = 180, H = 100;
  const CH = '.T#~,';          // type -> row char

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function generate() {
    const rng = mulberry32(20240607);
    const g = new Uint8Array(W * H);
    const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y * W + x] = t; };
    const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 2 : g[y * W + x];
    const CX = 90, CY = 50;

    // value noise
    const CELL = 9, NW = Math.ceil(W / 3) + 3, NH = Math.ceil(H / 3) + 3;
    const lat = []; for (let i = 0; i < NW * NH; i++) lat.push(rng());
    const lat2 = []; for (let i = 0; i < NW * NH; i++) lat2.push(rng());
    const sm = t => t * t * (3 - 2 * t);
    function noise(L, x, y, cell) {
      const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = sm(fx - ix), ty = sm(fy - iy);
      const a = L[iy * NW + ix], b = L[iy * NW + ix + 1], c = L[(iy + 1) * NW + ix], d = L[(iy + 1) * NW + ix + 1];
      return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }

    // 1. forest everywhere outside clearing (noise + speckle)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const n = noise(lat, x, y, CELL) * 0.7 + noise(lat2, x, y, 4) * 0.3;
      if (n > 0.46 || rng() < 0.05) set(x, y, 1);
    }
    // 2. ring of dense tree line around the clearing, then clearing
    const RX = 24, RY = 17;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x - CX) / RX, dy = (y - CY) / RY;
      const jit = (noise(lat2, x, y, 5) - 0.5) * 0.35;
      const d = Math.sqrt(dx * dx + dy * dy) + jit;
      if (d < 1) set(x, y, 0);
      else if (d < 1.22 && rng() < 0.8) set(x, y, 1);
    }
    // 3. lanes carved from the clearing (dirt centre line)
    function carve(pts, hw, dirt) {
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
        const len = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
        for (let s = 0; s <= len; s++) {
          const px = ax + (bx - ax) * s / len, py = ay + (by - ay) * s / len;
          const wob = hw + (noise(lat, px, py, 6) - 0.5) * 2;
          for (let y = Math.floor(py - wob - 1); y <= Math.ceil(py + wob + 1); y++)
            for (let x = Math.floor(px - wob - 1); x <= Math.ceil(px + wob + 1); x++) {
              if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) continue;
              const d = Math.hypot(x - px, y - py);
              if (d <= wob) set(x, y, d <= 1.2 && dirt ? 4 : (get(x, y) === 3 ? 3 : 0));
            }
        }
      }
    }
    const lanes = [
      [[CX, CY], [CX, 3]],                  // N
      [[CX, CY], [60, 24], [32, 3]],        // NW
      [[CX, CY], [120, 24], [148, 3]],      // NE
      [[CX, CY], [4, CY]],                  // W
      [[CX, CY], [175, CY]],                // E
      [[CX, CY], [CX, 96]],                 // S
      [[CX, CY], [56, 76], [30, 96]],       // SW
      [[CX, CY], [124, 76], [150, 96]],     // SE
    ];
    // side corridors (narrower)
    const corr = [
      [[8, 78], [50, 80], [90, 76], [130, 80], [172, 78]],   // south east-west
      [[46, 24], [44, 50], [46, 80]],                        // west north-south
      [[134, 24], [136, 50], [134, 80]],                     // east north-south
      [[8, 32], [40, 34], [66, 40]],                         // west-north stub
      [[172, 32], [140, 34], [114, 40]],                     // east-north stub
    ];
    // 4. river (water strip, sinuous), lanes crossing it become fords
    const riverY = x => 17 + 3.2 * Math.sin(x / 17) + 1.5 * Math.sin(x / 7.3);
    for (let x = 0; x < W; x++) {
      const yc = riverY(x);
      for (let y = Math.floor(yc - 6); y <= Math.ceil(yc + 6); y++) {
        const d = Math.abs(y - yc);
        if (d <= 2.6) set(x, y, 3);
        else if (d <= 4.5 && get(x, y) === 1 && rng() < 0.7) set(x, y, 0);   // bank clearing
        else if (d <= 4.5 && get(x, y) === 0 && rng() < 0.15) set(x, y, 4);
      }
    }
    for (const l of lanes) carve(l, 3.2, true);
    for (const c of corr) carve(c, 2.2, true);
    // extra fords without lanes
    for (const fx of [14, 166]) carve([[fx, 5], [fx, 30]], 2.4, true);
    // wide ford at clearing edge ring of dirt
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x - CX) / RX, dy = (y - CY) / RY, d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0.62 && d < 0.68 && get(x, y) === 0 && rng() < 0.6) set(x, y, 4);
    }
    // 5. groves inside the clearing (cover close to open ground), kept away from the spawn
    const groves = [
      [-14, -8, 2.6], [13, -9, 2.2], [-16, 7, 2.4], [15, 8, 2.8], [0, -13, 2.0], [1, 12, 2.2],
      [-7, 2, 1.5], [8, -3, 1.4], [-5, -6, 1.2], [6, 7, 1.3],
    ];
    for (const [ox, oy, r] of groves) {
      for (let y = Math.floor(CY + oy - r - 1); y <= CY + oy + r + 1; y++)
        for (let x = Math.floor(CX + ox - r - 1); x <= CX + ox + r + 1; x++) {
          const d = Math.hypot(x - (CX + ox), y - (CY + oy));
          if (d <= r - 0.3 + (rng() - 0.5) * 1.2 && get(x, y) !== 3) set(x, y, 1);
        }
    }
    // single standing trees
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2, r = 5 + rng() * 15;
      const x = Math.round(CX + Math.cos(a) * r * 1.3), y = Math.round(CY + Math.sin(a) * r * 0.9);
      if (Math.hypot(x - CX, y - CY) > 6 && get(x, y) === 0) set(x, y, 1);
    }
    // 6. rock outcrops in the forest
    for (let i = 0; i < 40; i++) {
      const x = 4 + Math.floor(rng() * (W - 8)), y = 4 + Math.floor(rng() * (H - 8));
      const dx = (x - CX) / RX, dy = (y - CY) / RY;
      if (Math.hypot(dx, dy) < 1.3 || get(x, y) !== 1) continue;
      const r = 1 + rng() * 1.6;
      for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++)
        for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++)
          if (Math.hypot(xx - x, yy - y) <= r && get(xx, yy) === 1) set(xx, yy, 2);
    }
    // 7. border rocks (2 thick, ragged inner edge)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const e = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (e < 2 || (e === 2 && rng() < 0.5) || (e === 3 && rng() < 0.15)) set(x, y, 2);
    }
    // 8. clear hero spawn pad
    for (let y = CY - 4; y <= CY + 4; y++) for (let x = CX - 4; x <= CX + 4; x++) set(x, y, 0);

    const rows = [];
    for (let y = 0; y < H; y++) {
      let s = ''; for (let x = 0; x < W; x++) s += CH[g[y * W + x]];
      rows.push(s);
    }
    return rows;
  }

  const rows = generate();
  const center = (tx, ty) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
  // dummy spawns: ring positions in open ground, snapped to a spot with a clear 5x5 neighbourhood
  const dummies = [];
  (function () {
    const free = (tx, ty) => {
      for (let y = ty - 2; y <= ty + 2; y++) for (let x = tx - 2; x <= tx + 2; x++) {
        const c = rows[y] && rows[y][x]; if (c !== '.' && c !== ',') return false;
      }
      return true;
    };
    const spots = [[0, -1], [0.7, -0.7], [1, 0], [0.7, 0.7], [0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.7], [0.45, 0.1], [-0.4, -0.05]];
    spots.forEach(([a, b], i) => {
      const r = i < 8 ? 0.62 : 1;
      const tx = Math.round(90 + a * 24 * r), ty = Math.round(50 + b * 17 * r);
      for (let rad = 0; rad < 8; rad++) {
        let found = null;
        for (let dy = -rad; dy <= rad && !found; dy++) for (let dx = -rad; dx <= rad && !found; dx++)
          if (Math.max(Math.abs(dx), Math.abs(dy)) === rad && free(tx + dx, ty + dy)) found = [tx + dx, ty + dy];
        if (found) { dummies.push(center(found[0], found[1])); break; }
      }
    });
  })();

  IT.MAPDEF = { tile: TILE, w: W, h: H, rows, spawns: { hero: center(90, 50), dummies } };

  const CODE = { '.': 0, 'T': 1, '#': 2, '~': 3, ',': 4, 'r': 5, 'S': 6 };
  function build(def) {
    const tile = def.tile, w = def.w, h = def.h;
    const grid = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const r = def.rows[y] || '';
      for (let x = 0; x < w; x++) { const c = CODE[r[x]]; grid[y * w + x] = c == null ? 0 : c; }
    }
    const elev = new Uint8Array(w * h).fill(1);
    if (def.elev) {
      if (typeof def.elev[0] === 'string') for (let y = 0; y < h; y++) { const r = def.elev[y] || ''; for (let x = 0; x < w; x++) elev[y * w + x] = Math.min(2, (r.charCodeAt(x) - 48) | 0); }
      else elev.set(def.elev);
    }
    const towers = (def.towers || []).map(t => ({ x: t.tx * tile + tile / 2, y: t.ty * tile + tile / 2, team: t.team | 0, tier: t.tier || 1, tx: t.tx, ty: t.ty }));
    // static non-attacking buildings: { kind, team (-1 neutral), tx, ty, hw } footprint = (2hw+1)^2 tiles
    const structures = (def.structures || []).map(s => ({ kind: s.kind, team: s.team == null ? -1 : s.team, tx: s.tx, ty: s.ty, hw: s.hw || 1, x: s.tx * tile + tile / 2, y: s.ty * tile + tile / 2 }));
    // footprints are structure tiles on one flat level (the centre tile's elevation, no ramp)
    const stamp = (tx, ty, hw) => {
      const el = (tx < 0 || ty < 0 || tx >= w || ty >= h) ? 1 : elev[ty * w + tx];
      for (let y = ty - hw; y <= ty + hw; y++) for (let x = tx - hw; x <= tx + hw; x++) if (x >= 0 && y >= 0 && x < w && y < h) {
        grid[y * w + x] = 6; elev[y * w + x] = el; if (def.ramp) def.ramp[y * w + x] = 0;
      }
    };
    for (const t of towers) stamp(t.tx, t.ty, 1);
    for (const s of structures) stamp(s.tx, s.ty, s.hw);
    const map = {
      tile, w, h, W: w * tile, H: h * tile, grid, elev, ramp: def.ramp || null, towers, structures,
      spawns: def.spawns || { hero: { x: w * tile / 2, y: h * tile / 2 }, dummies: [] },
      cover: [],
      toTile: x => Math.floor(x / tile),
      at: (tx, ty) => (tx < 0 || ty < 0 || tx >= w || ty >= h) ? 2 : grid[ty * w + tx],
      walkableTile: (tx, ty) => { const t = (tx < 0 || ty < 0 || tx >= w || ty >= h) ? 2 : grid[ty * w + tx]; return t === 0 || t === 4 || t === 5; },
      blocksSight: (tx, ty) => { const t = (tx < 0 || ty < 0 || tx >= w || ty >= h) ? 2 : grid[ty * w + tx]; return t === 1 || t === 2; },
      center: (tx, ty) => ({ x: tx * tile + tile / 2, y: ty * tile + tile / 2 }),
      elevTile: (tx, ty) => (tx < 0 || ty < 0 || tx >= w || ty >= h) ? 1 : elev[ty * w + tx],
      elevAt: (x, y) => { const tx = Math.floor(x / tile), ty = Math.floor(y / tile); return (tx < 0 || ty < 0 || tx >= w || ty >= h) ? 1 : elev[ty * w + tx]; },
    };
    map.walkable = (x, y) => map.walkableTile(Math.floor(x / tile), Math.floor(y / tile));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!map.walkableTile(x, y)) continue;
      if (map.at(x + 1, y) === 1 || map.at(x - 1, y) === 1 || map.at(x, y + 1) === 1 || map.at(x, y - 1) === 1 ||
        map.at(x + 1, y + 1) === 1 || map.at(x - 1, y - 1) === 1 || map.at(x + 1, y - 1) === 1 || map.at(x - 1, y + 1) === 1) map.cover.push(map.center(x, y));
    }
    return map;
  }

  IT.Map = { build };
})(typeof window !== 'undefined' ? window : globalThis);
