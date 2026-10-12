// Map registry (owner MAPS, see docs/MAPS-v3.md + PLAN-v4). IT.Maps.get(id) -> built map (cached, lazily generated).
// Maps are generated deterministically from small shape programs (ellipses, paths, rects, ramps), then cliffs are derived
// from the elevation field (rock wherever a higher tile touches a lower one, except on ramps).
// map = IT.Map.build(...) + { id, name, blurb, tags, elev, elevAt, ramp, towers, spawns:{ hero, dummies, arenas:[{x,y,tags,tw?}] } }.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const TILE = 48, CH = '.T#~,rS';
  const HERO_SIGHT = 1800, TOWER_R = 15;   // tiles (tower range 700 u = 14.6 tiles)

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

  // ------------------------------------------------------------------ generator toolkit
  function Gen(W, H, seed) {
    const rng = mulberry32(seed), N = W * H;
    const g = new Uint8Array(N), e = new Uint8Array(N).fill(1), rp = new Uint8Array(N);
    const hs = (x, y, s) => {
      let h = Math.imul(x * 374761393 + y * 668265263 + s * 1274126177 + seed * 40503, 1274126177);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    const sm = t => t * t * (3 - 2 * t);
    const nz = (x, y, c, s) => {
      const fx = x / c, fy = y / c, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy), q = s || 0;
      const a = hs(ix, iy, q), b = hs(ix + 1, iy, q), cc = hs(ix, iy + 1, q), d = hs(ix + 1, iy + 1, q);
      return (a + (b - a) * tx) * (1 - ty) + (cc + (d - cc) * tx) * ty;
    };
    const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    // shapes: { b:[x0,y0,x1,y1], has(x,y) }
    const Rect = (x0, y0, x1, y1) => ({ b: [x0, y0, x1, y1], has: (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 });
    const Ell = (cx, cy, rx, ry, wob) => {
      const wb = wob == null ? 0.22 : wob;
      return { b: [cx - rx * 1.4, cy - ry * 1.4, cx + rx * 1.4, cy + ry * 1.4], has: (x, y) => Math.hypot((x - cx) / rx, (y - cy) / ry) + (nz(x, y, 5, 3) - 0.5) * wb * 2 < 1 };
    };
    const Path = (pts, hw, wob) => {
      const wb = wob == null ? 1.2 : wob, pad = hw + wb + 2;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
      return {
        b: [x0 - pad, y0 - pad, x1 + pad, y1 + pad],
        has: (x, y) => {
          let best = 1e9;
          for (let i = 0; i + 1 < pts.length; i++) {
            const ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
            const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
            const d = Math.hypot(x - (ax + dx * t), y - (ay + dy * t)); if (d < best) best = d;
          }
          return best <= hw + (nz(x, y, 6, 5) - 0.5) * wb * 2;
        },
      };
    };
    const Poly = pts => {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
      return {
        b: [x0, y0, x1, y1],
        has: (x, y) => {
          let c = false;
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
          }
          return c;
        },
      };
    };
    const A = {
      W, H, g, e, rp, rng, nz, hs, Rect, Ell, Path, Poly, inb,
      // paint a shape: o = { t, e, r (ramp flag), where(t, e) }
      paint(shape, o) {
        const b = shape.b, x0 = Math.max(0, Math.floor(b[0])), y0 = Math.max(0, Math.floor(b[1])), x1 = Math.min(W - 1, Math.ceil(b[2])), y1 = Math.min(H - 1, Math.ceil(b[3]));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const i = y * W + x;
          if (!shape.has(x, y)) continue;
          if (o.where && !o.where(g[i], e[i])) continue;
          if (o.t != null) g[i] = o.t;
          if (o.e != null) e[i] = o.e;
          if (o.r != null) rp[i] = o.r;
        }
      },
      forest(dens, cell) {
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (g[y * W + x] !== 0) continue;
          const n = nz(x, y, cell || 9, 1) * 0.7 + nz(x, y, 4, 2) * 0.3;
          if (n > 1 - dens || rng() < 0.03) g[y * W + x] = 1;
        }
      },
      // random single trees / groves inside a shape
      scatter(shape, p) { A.paint({ b: shape.b, has: (x, y) => shape.has(x, y) && rng() < p }, { t: 1, where: t => t === 0 }); },
      clear(shape) { A.paint(shape, { t: 0, where: t => t !== 2 }); },
      dirt(shape) { A.paint(shape, { t: 4, where: t => t !== 2 && t !== 5 }); },
      river(shape) { A.paint(shape, { t: 5 }); },
      // slope between points a (elevation e0) and b (elevation e1) inside shape: walkable dirt ramp, elevation by progress
      slope(shape, a, b, e0, e1) {
        const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
        const bb = shape.b, x0 = Math.max(0, Math.floor(bb[0])), y0 = Math.max(0, Math.floor(bb[1])), x1 = Math.min(W - 1, Math.ceil(bb[2])), y1 = Math.min(H - 1, Math.ceil(bb[3]));
        const lv = Math.abs(e1 - e0) + 1;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          if (!shape.has(x, y)) continue;
          const s = Math.max(0, Math.min(0.999, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)), k = Math.floor(s * lv);
          const i = y * W + x;
          g[i] = 4; e[i] = e0 < e1 ? e0 + k : e0 - k; rp[i] = 1;
        }
      },
      treesClear(tx, ty, r) {
        for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) if (inb(x, y) && g[y * W + x] === 1 && Math.hypot(x - tx, y - ty) <= r) g[y * W + x] = 0;
      },
      // cliffs: a higher tile touching a lower one becomes rock (elevation of the lower side), unless both are ramp tiles
      cliffs() {
        const mark = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = y * W + x, ei = e[i];
          let lo = ei;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy; if (!inb(nx, ny)) continue;
            const j = ny * W + nx;
            if (e[j] >= ei || (rp[i] && rp[j])) continue;
            if (rp[i]) mark.push(j, e[j]);   // ramp side: wall the lower neighbour, never the ramp itself
            else lo = Math.min(lo, e[j]);
          }
          if (lo < ei) mark.push(i, lo);
        }
        for (let k = 0; k < mark.length; k += 2) { g[mark[k]] = 2; e[mark[k]] = mark[k + 1]; rp[mark[k]] = 0; }
      },
      // trails: cut trees along the cheapest path so every tower and every sizeable pocket (valley, plateau, island) joins the hero's region
      connect(hero, towers) {
        const N = W * H, ok = i => g[i] === 0 || g[i] === 4 || g[i] === 5, pass = i => g[i] !== 2 && g[i] !== 3;
        const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        let hi0 = hero[1] * W + hero[0];
        if (!ok(hi0)) { let best = 1e9; for (let i = 0; i < N; i++) if (ok(i)) { const d = Math.hypot(i % W - hero[0], ((i / W) | 0) - hero[1]); if (d < best) { best = d; hi0 = i; } } }
        for (let round = 0; round < 16; round++) {
          const lab = new Int32Array(N).fill(-1), sz = [];
          for (let s0 = 0; s0 < N; s0++) {
            if (lab[s0] >= 0 || !ok(s0)) continue;
            const c = sz.length, q = [s0]; lab[s0] = c;
            for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W, y = (i / W) | 0; for (const [dx, dy] of NB) { const nx = x + dx, ny = y + dy; if (!inb(nx, ny)) continue; const j = ny * W + nx; if (lab[j] < 0 && ok(j)) { lab[j] = c; q.push(j); } } }
            sz.push(q.length);
          }
          const hc = lab[hi0], cand = [];
          for (const t of towers) { let c = -1; for (let r = 0; r < 4 && c < 0; r++) for (let dy = -r; dy <= r && c < 0; dy++) for (let dx = -r; dx <= r; dx++) { const x = t.tx + dx, y = t.ty + dy; if (inb(x, y) && lab[y * W + x] >= 0 && Math.max(Math.abs(dx), Math.abs(dy)) === r) { c = lab[y * W + x]; break; } } if (c >= 0 && c !== hc && cand.indexOf(c) < 0) cand.push(c); }
          for (let c = 0; c < sz.length; c++) if (c !== hc && sz[c] >= 100 && cand.indexOf(c) < 0) cand.push(c);
          let hit = -1, target = -1, prev = null;
          for (const tc of cand) {
            const dist = new Int32Array(N).fill(1e9); prev = new Int32Array(N).fill(-1);
            let stack = [];
            for (let i = 0; i < N; i++) if (lab[i] === tc) { dist[i] = 0; stack.push(i); }
            let next = [], d = 0;
            while (hit < 0 && (stack.length || next.length)) {
              while (stack.length && hit < 0) {
                const i = stack.pop(); if (dist[i] !== d) continue;
                if (lab[i] === hc) { hit = i; break; }
                const x = i % W, y = (i / W) | 0;
                for (const [dx, dy] of NB) { const nx = x + dx, ny = y + dy; if (!inb(nx, ny)) continue; const j = ny * W + nx; if (!pass(j)) continue; const nd = d + (g[j] === 1 ? 1 : 0); if (nd < dist[j]) { dist[j] = nd; prev[j] = i; (nd === d ? stack : next).push(j); } }
              }
              if (hit >= 0) break;
              stack = next; next = []; d++;
            }
            if (hit >= 0) { target = tc; break; }
          }
          if (hit < 0) return;
          for (let i = hit; i >= 0 && lab[i] !== target; i = prev[i]) {
            for (const o of [0, 1, W]) if (g[i + o] === 1) g[i + o] = 0;
            if (g[i] === 1) g[i] = 0;
          }
        }
      },
      rim() {
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const d = Math.min(x, y, W - 1 - x, H - 1 - y);
          if (d < 2 || (d === 2 && hs(x, y, 9) < 0.5) || (d === 3 && hs(x, y, 10) < 0.15)) { g[y * W + x] = 2; }
        }
      },
    };
    return A;
  }

  // 180 degree rotation of a finished generator (teams swapped by the caller)
  function rot180(A) {
    const { W, H } = A, N = W * H;
    for (const arr of [A.g, A.e, A.rp]) for (let i = 0, j = N - 1; i < j; i++, j--) { const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  }

  // ------------------------------------------------------------------ map programs
  // Every region below is carved from the reference Dota 2 map (reference/dota_map.jpg) at the Training Grounds scale
  // (1 tile = 48 u; 144x80 tiles = roughly a third of the map width). Conventions: elevation 1 = the lanes and jungles,
  // 0 = the river valley (reached only by the stair ramps), 2 = Dire plateaus / bases. Radiant ground is grass + dense forest,
  // Dire ground is dirt with sparse root clumps.
  const SPECS = [];
  function def(id, name, blurb, tags, W, H, seed, fn) { SPECS.push({ id, name, blurb, tags, W, H, seed, fn }); }
  const T = (tx, ty, team, tier) => ({ tx, ty, team, tier });
  const road = (A, pts, w) => { A.clear(A.Path(pts, w + 2.5, 1.2)); A.dirt(A.Path(pts, w, 0.7)); };
  const glade = (A, x, y, rx, ry) => A.clear(A.Ell(x, y, rx, ry));
  const ground = (A, shape) => A.paint(shape, { t: 4, where: t => t === 0 });
  const valley = (A, pts, hw, rw, e) => { A.clear(A.Path(pts, hw + 1.5, 1.2)); A.paint(A.Path(pts, hw, 1), { t: 0, e: e == null ? 0 : e }); A.river(A.Path(pts, rw, 0.8)); };
  const lake = (A, x, y, rx, ry, rw, e) => { A.paint(A.Ell(x, y, rx, ry), { t: 0, e: e == null ? 0 : e }); A.river(A.Ell(x, y, rw[0], rw[1])); };
  // stair cut: a -> b is a rough guide; the cut snaps onto the first elevation step found along it (so it always straddles the cliff edge)
  const ramp = (A, a, b, w, e0, e1) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, EXT = 12, vx = (b[0] - a[0]) / L, vy = (b[1] - a[1]) / L;
    const s0 = [a[0] - vx * EXT, a[1] - vy * EXT], dx0 = (L + 2 * EXT) * vx, dy0 = (L + 2 * EXT) * vy, l0 = L + 2 * EXT, n = Math.ceil(l0 * 4);
    const at = (x, y) => { const tx = Math.round(x), ty = Math.round(y); return A.inb(tx, ty) ? A.e[ty * A.W + tx] : -1; };
    const es = at(s0[0], s0[1]);
    if (es >= 0) {
      let first = -1, last = -1, prev = es, ef = es, sg = 0;
      for (let k = 1; k <= n; k++) {
        const ev = at(s0[0] + dx0 * k / n, s0[1] + dy0 * k / n);
        if (ev < 0 || ev === prev) continue;
        if (!sg) sg = Math.sign(ev - es);
        if (Math.sign(ev - prev) !== sg) break;   // only follow a monotonic climb / drop
        if (first < 0) first = k;
        last = k; prev = ev; ef = ev;
      }
      if (first >= 0) {
        const f = first / n * l0, t = last / n * l0, c = (f + t) / 2, h = Math.max(4.5, (t - f) / 2 + 3);
        a = [s0[0] + vx * (c - h), s0[1] + vy * (c - h)]; b = [s0[0] + vx * (c + h), s0[1] + vy * (c + h)]; e0 = es; e1 = ef;
      }
    }
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    // open the approach on both ends (trees only), then cut the stair
    A.paint(A.Path([[a[0] - ux * 4, a[1] - uy * 4], [b[0] + ux * 4, b[1] + uy * 4]], w / 2 + 2, 0.4), { t: 0, where: t => t === 1 });
    A.slope(A.Path([a, b], w, 0.2), a, b, e0, e1);
  };
  const plateau = (A, shape, e) => A.paint(shape, { t: 0, e: e == null ? 2 : e });
  const wall = (A, pts, w) => A.paint(A.Path(pts, w, 0.3), { t: 2 });
  const gap = (A, shape) => A.paint(shape, { t: 0, where: t => t === 2 });
  const rad = A => A.forest(0.6);
  const dire = A => A.forest(0.34, 7);

  // 1 -- mid lane, Radiant side of the river
  def('mid_rad', { en: 'Mid Lane', pt: 'Lane do Meio' },
    { en: 'The diagonal mid road runs into the river; stone stairs drop to the water, Dire bluff beyond.', pt: 'A estrada diagonal do meio desce ao rio por escadas de pedra, com o platô Dire do outro lado.' },
    ['river', 'highground', 'lowground', 'tower'], 144, 80, 11, A => {
      rad(A);
      road(A, [[2, 74], [26, 62], [50, 48], [66, 36], [82, 24]], 4);
      road(A, [[0, 42], [30, 38], [52, 36]], 2.5); road(A, [[6, 12], [30, 22], [40, 34]], 2.5); road(A, [[56, 78], [80, 62], [104, 60], [126, 68]], 2.5);
      for (const [x, y, rx, ry] of [[12, 12, 7, 5], [46, 12, 8, 6], [90, 40, 8, 5], [20, 62, 6, 5], [72, 66, 6, 4]]) glade(A, x, y, rx, ry);
      valley(A, [[64, 0], [84, 14], [104, 30], [124, 48], [143, 66]], 10, 6);
      plateau(A, A.Poly([[94, 0], [144, 0], [144, 22], [118, 18], [100, 12]]), 2); ground(A, A.Poly([[94, 0], [144, 0], [144, 22], [118, 18], [100, 12]]));
      ramp(A, [68, 16], [79, 9], 2.6, 1, 0); ramp(A, [97, 38], [107, 28], 2.6, 1, 0); ramp(A, [123, 62], [132, 54], 2.6, 1, 0);
      ramp(A, [84, 14], [112, 4], 2.6, 0, 2);
      return { hero: [52, 44], towers: [T(58, 42, 0, 1), T(26, 60, 0, 2), T(118, 8, 1, 2)] };
    });

  // 2 -- the broad river basin
  def('mid_river', { en: 'River Basin', pt: 'Bacia do Rio' },
    { en: 'A wide sunken river between two banks. Stairs and a Dire outpost tower overlook the water.', pt: 'Um rio largo e afundado entre duas margens. Escadas e uma torre Dire vigiam a água.' },
    ['river', 'lowground', 'highground', 'tower'], 144, 80, 12, A => {
      rad(A); dire(A);
      valley(A, [[0, 6], [40, 22], [80, 48], [120, 66], [143, 72]], 16, 13);
      ground(A, A.Poly([[34, 0], [144, 0], [144, 56], [112, 54], [96, 44], [66, 28], [40, 12]]));
      road(A, [[2, 78], [10, 52], [26, 40]], 3); road(A, [[0, 24], [8, 30]], 2);
      glade(A, 14, 62, 9, 6); glade(A, 120, 24, 9, 6); glade(A, 100, 16, 8, 5);
      ramp(A, [26, 40], [36, 32], 2.6, 1, 0); ramp(A, [48, 70], [58, 60], 2.6, 1, 0); ramp(A, [106, 38], [95, 48], 2.6, 1, 0); ramp(A, [128, 52], [120, 60], 2.6, 1, 0);
      return { hero: [66, 44], towers: [T(118, 30, 1, 2), T(14, 56, 0, 1), T(128, 8, 1, 1)] };
    });

  // 3 -- Roshan's pit
  def('rosh_pit', { en: "Roshan's Pit", pt: 'Fosso do Roshan' },
    { en: 'A walled crater in the middle of the river with one mouth to the east. Dire plateau above, Radiant jungle below.', pt: 'Uma cratera murada no meio do rio com uma boca a leste. Platô Dire acima e selva Radiant abaixo.' },
    ['river', 'lowground', 'pit', 'choke'], 144, 80, 13, A => {
      rad(A); dire(A);
      ground(A, A.Poly([[0, 0], [144, 0], [144, 80], [100, 80], [96, 56], [84, 40], [46, 22], [0, 20]]));
      valley(A, [[0, 30], [30, 30], [60, 42], [100, 34], [143, 40]], 20, 16);
      A.paint(A.Ell(60, 40, 13, 12), { t: 2, e: 0 }); A.paint(A.Ell(60, 40, 9, 8), { t: 0, e: 0 }); gap(A, A.Rect(66, 36, 78, 44));
      A.dirt(A.Ell(58, 42, 6, 5));
      road(A, [[2, 70], [24, 62], [30, 52]], 3); glade(A, 12, 62, 10, 8);
      ramp(A, [26, 52], [34, 44], 2.6, 1, 0); ramp(A, [44, 18], [50, 28], 2.6, 1, 0); ramp(A, [88, 56], [82, 46], 2.6, 1, 0);
      return { hero: [34, 38], towers: [], zones: [{ tag: 'pit', x0: 48, y0: 28, x1: 72, y1: 52 }] };
    });

  // 4 -- the shell cove
  def('shell_cove', { en: 'Shell Cove', pt: 'Enseada das Conchas' },
    { en: 'A bone-white shell island in a broad lake. Radiant jungle on the shore, Dire bluff above.', pt: 'Uma ilha de conchas brancas num lago largo. Selva Radiant na margem e platô Dire acima.' },
    ['river', 'lowground', 'tower'], 144, 80, 14, A => {
      rad(A); dire(A);
      ground(A, A.Poly([[60, 0], [144, 0], [144, 40], [112, 44], [100, 30], [90, 14], [62, 10]]));
      valley(A, [[20, 14], [50, 26], [80, 36], [110, 46], [143, 52]], 22, 17);
      A.paint(A.Ell(72, 40, 14, 12), { t: 0, e: 1 });
      wall(A, [[62, 32], [70, 28], [80, 32], [84, 42], [78, 50]], 2.4); gap(A, A.Rect(74, 44, 82, 48));
      road(A, [[2, 20], [18, 16], [24, 22]], 3); road(A, [[110, 64], [126, 56], [143, 60]], 3);
      glade(A, 8, 28, 8, 8); glade(A, 122, 64, 12, 8); glade(A, 58, 70, 10, 6);
      ramp(A, [24, 14], [32, 22], 2.6, 1, 0); ramp(A, [40, 52], [48, 44], 2.6, 1, 0); ramp(A, [88, 62], [96, 54], 2.6, 1, 0); ramp(A, [72, 4], [80, 14], 2.6, 1, 0);
      ramp(A, [104, 22], [110, 32], 2.6, 1, 0);
      return { hero: [50, 36], towers: [T(120, 62, 0, 1), T(118, 14, 1, 1)] };
    });

  // 5 -- Radiant offlane / secret-shop approach
  def('off_rad', { en: 'Radiant Offlane', pt: 'Offlane Radiant' },
    { en: 'The stone road up the left edge, a stone-ringed pond to the north-west and the river top-right.', pt: 'A estrada de pedra pela borda esquerda, um lago com anel de pedra a noroeste e o rio no canto superior direito.' },
    ['river', 'lowground', 'tower'], 144, 80, 15, A => {
      rad(A);
      road(A, [[60, 0], [60, 80]], 3.2); road(A, [[70, 2], [100, 10], [120, 20], [140, 30]], 2.5); road(A, [[80, 30], [100, 40], [110, 52]], 2.5); road(A, [[8, 62], [40, 56], [58, 50]], 2.5);
      lake(A, 28, 22, 18, 24, [10, 16]); wall(A, [[24, 24], [28, 20], [32, 24], [28, 28], [24, 24]], 1.4); A.paint(A.Ell(28, 24, 3.4, 3.4), { t: 0, e: 0 });
      ramp(A, [30, 52], [30, 38], 2.6, 1, 0); ramp(A, [54, 24], [44, 24], 2.6, 1, 0);
      valley(A, [[104, 0], [124, 12], [143, 26]], 8, 5);
      ramp(A, [112, 30], [120, 22], 2.6, 1, 0); ramp(A, [92, 24], [96, 18], 2.4, 1, 0);
      glade(A, 106, 50, 6, 5); glade(A, 108, 64, 7, 5); glade(A, 20, 60, 7, 5);
      return { hero: [64, 46], towers: [T(62, 32, 0, 1), T(62, 62, 0, 2), T(106, 56, 0, 3)] };
    });

  // 6 -- Dire top corner with the outpost
  def('dire_corner', { en: 'Dire Outpost Corner', pt: 'Canto do Posto Dire' },
    { en: 'Grey Dire ground with an outpost ring, root thickets, and a river cove with stairs to the north.', pt: 'Terreno cinzento Dire com um posto, matas de raízes e uma enseada de rio com escadas ao norte.' },
    ['river', 'lowground', 'highground', 'tower'], 144, 80, 16, A => {
      dire(A); ground(A, A.Rect(0, 0, 143, 79));
      valley(A, [[72, 0], [90, 8], [110, 14], [143, 8]], 8, 5);
      lake(A, 100, 8, 30, 10, [20, 6]);
      ramp(A, [74, 24], [82, 16], 2.6, 1, 0); ramp(A, [120, 22], [124, 14], 2.6, 1, 0);
      plateau(A, A.Ell(42, 28, 8, 8), 2); A.paint(A.Ell(42, 28, 4.5, 4.5), { t: 4, e: 2 });
      ramp(A, [42, 38], [42, 34], 3, 1, 2);
      road(A, [[0, 40], [30, 46], [50, 40], [90, 50], [140, 46]], 3); glade(A, 40, 66, 12, 7); glade(A, 96, 36, 9, 6); glade(A, 124, 62, 10, 7);
      wall(A, [[34, 4], [34, 16]], 1.2); gap(A, A.Rect(33, 9, 35, 11));
      return { hero: [30, 46], towers: [T(70, 66, 1, 1), T(120, 40, 1, 2), T(24, 20, 1, 3)] };
    });

  // 7 -- twin waterfalls
  def('twin_falls', { en: 'Twin Waterfalls', pt: 'Cachoeiras Gêmeas' },
    { en: 'A narrow river gorge with a waterfall and stone bridges, a lake to the east and Dire ground on both rims.', pt: 'Um desfiladeiro estreito com cachoeira e pontes de pedra, um lago a leste e terreno Dire nas duas bordas.' },
    ['river', 'lowground', 'choke', 'tower'], 144, 80, 17, A => {
      dire(A); ground(A, A.Rect(0, 0, 143, 79));
      valley(A, [[56, 0], [56, 30], [58, 80]], 9, 6);
      lake(A, 100, 24, 22, 14, [16, 9]);
      A.paint(A.Rect(46, 40, 72, 52), { t: 0, e: 1 }); A.dirt(A.Rect(46, 40, 72, 52));
      ramp(A, [38, 24], [48, 24], 2.8, 1, 0); ramp(A, [38, 56], [48, 56], 2.8, 1, 0); ramp(A, [76, 36], [66, 36], 2.8, 1, 0); ramp(A, [88, 44], [92, 36], 2.4, 1, 0);
      road(A, [[0, 56], [30, 54], [38, 56]], 3); road(A, [[76, 56], [110, 50], [143, 54]], 3);
      glade(A, 20, 36, 10, 7); glade(A, 126, 66, 10, 7); glade(A, 100, 62, 8, 6);
      return { hero: [32, 40], towers: [T(24, 56, 1, 1), T(118, 52, 1, 2)] };
    });

  // 8 -- Dire wall, crater and lava cliffs
  def('dire_ridge', { en: 'Dire Ridge', pt: 'Cume Dire' },
    { en: 'A broken stone wall splits the grey plateau; lava cliffs on the right, a crater shrine to the south.', pt: 'Um muro de pedra partido corta o platô cinzento; penhascos de lava à direita e um santuário em cratera ao sul.' },
    ['highground', 'choke', 'tower'], 144, 80, 18, A => {
      dire(A); ground(A, A.Rect(0, 0, 143, 79));
      lake(A, 24, 18, 24, 12, [14, 6]);
      A.paint(A.Rect(88, 0, 143, 30), { t: 2 });
      wall(A, [[68, 38], [68, 80]], 1.4); gap(A, A.Rect(66, 50, 71, 58)); gap(A, A.Rect(66, 68, 71, 72));
      plateau(A, A.Ell(120, 66, 14, 10), 2); A.dirt(A.Ell(120, 66, 14, 10)); ramp(A, [105, 66], [112, 66], 3, 1, 2);
      glade(A, 38, 62, 12, 8); glade(A, 100, 54, 12, 7); glade(A, 20, 44, 9, 5);
      ramp(A, [32, 28], [30, 22], 2.6, 1, 0);
      return { hero: [50, 56], towers: [T(88, 56, 1, 3), T(54, 52, 1, 2), T(112, 44, 1, 3)] };
    });

  // 9 -- Dire ancient
  def('dire_base', { en: 'Dire Ancient', pt: 'Ancião Dire' },
    { en: 'The lava-ringed Dire base on its plateau: barracks lanes, the ancient and tier-4 towers, a ramp in each corner.', pt: 'A base Dire cercada de lava em seu platô: barracas, o ancião e torres T4, com uma rampa em cada canto.' },
    ['highground', 'tower', 'open'], 144, 80, 19, A => {
      dire(A); ground(A, A.Rect(0, 0, 143, 79));
      A.paint(A.Rect(108, 0, 143, 79), { t: 2 });
      plateau(A, A.Rect(0, 0, 107, 79), 1);
      plateau(A, A.Poly([[12, 6], [100, 6], [104, 40], [96, 74], [14, 74]]), 2); ground(A, A.Poly([[12, 6], [100, 6], [104, 40], [96, 74], [14, 74]]));
      ramp(A, [86, 22], [96, 14], 3, 1, 2); ramp(A, [26, 80], [26, 72], 3, 1, 2); ramp(A, [14, 28], [22, 28], 3, 1, 2);
      glade(A, 72, 38, 10, 8); A.dirt(A.Ell(72, 38, 8, 6));
      road(A, [[22, 20], [72, 38], [90, 60]], 2.5); road(A, [[22, 28], [40, 56], [60, 66]], 2.5);
      return { hero: [58, 44], towers: [T(40, 22, 1, 3), T(44, 60, 1, 3), T(62, 70, 1, 3), T(70, 24, 1, 4), T(86, 44, 1, 4)] };
    });

  // 10 -- Dire jungle
  def('dire_jungle', { en: 'Dire Jungle', pt: 'Selva Dire' },
    { en: 'Grey jungle pockets ringed by root thickets, a stone gate in the middle and an outpost tower below.', pt: 'Bolsões cinzentos de selva cercados de raízes, um portão de pedra no meio e uma torre de posto abaixo.' },
    ['jungle', 'fog', 'choke', 'tower'], 144, 80, 20, A => {
      A.forest(0.6, 6); ground(A, A.Rect(0, 0, 143, 79));
      const camps = [[18, 22, 8, 6], [48, 16, 9, 6], [60, 34, 8, 6], [112, 18, 9, 6], [40, 50, 9, 6], [100, 50, 9, 6], [128, 40, 8, 6], [76, 56, 8, 5], [24, 66, 8, 5]];
      for (const [x, y, rx, ry] of camps) glade(A, x, y, rx, ry);
      for (const [a, b] of [[0, 1], [1, 2], [2, 4], [4, 8], [2, 7], [7, 5], [5, 6], [6, 3], [3, 1], [0, 4]]) { const p = [[camps[a][0], camps[a][1]], [camps[b][0], camps[b][1]]]; A.clear(A.Path(p, 2.6, 0.9)); A.dirt(A.Path(p, 1.2, 0.4)); }
      glade(A, 86, 38, 12, 5); wall(A, [[78, 36], [96, 36]], 1.2); gap(A, A.Rect(84, 34, 90, 38));
      lake(A, 12, 6, 16, 8, [10, 4]); ramp(A, [24, 14], [20, 10], 2.4, 1, 0);
      return { hero: [60, 40], towers: [T(86, 70, 1, 1), T(50, 68, 1, 2)] };
    });

  // 11 -- Dire right edge lowland with an outpost
  def('dire_lowland', { en: 'Dire Lowland', pt: 'Várzea Dire' },
    { en: 'A boggy lowland around a Dire outpost under the plateau edge cliffs; a wooden bridge and stone steps climb out.', pt: 'Uma várzea pantanosa em volta de um posto Dire sob os penhascos da borda; ponte de madeira e degraus de pedra levam para cima.' },
    ['lowground', 'river', 'choke', 'tower'], 144, 80, 21, A => {
      dire(A); ground(A, A.Rect(0, 0, 143, 79));
      lake(A, 108, 40, 22, 30, [14, 22]);
      A.paint(A.Rect(128, 0, 143, 79), { t: 2 });
      A.paint(A.Ell(108, 28, 7, 7), { t: 4, e: 0 }); wall(A, [[102, 28], [108, 22], [114, 28]], 1); A.paint(A.Ell(108, 28, 4, 4), { t: 4, e: 0 });
      ramp(A, [88, 42], [96, 36], 2.6, 1, 0); ramp(A, [100, 12], [104, 20], 2.4, 1, 0); ramp(A, [118, 72], [116, 62], 3, 1, 0);
      road(A, [[0, 56], [30, 50], [60, 56], [86, 44]], 3); glade(A, 30, 20, 9, 6); glade(A, 64, 24, 10, 6);
      return { hero: [70, 54], towers: [T(110, 6, 1, 2), T(30, 46, 1, 1)] };
    });

  // 12 -- Radiant ancient
  def('rad_base', { en: 'Radiant Ancient', pt: 'Ancião Radiant' },
    { en: 'The Radiant base: open lawns, cherry trees, the ancient and tier-4 towers, a stone road and ramps to the lanes.', pt: 'A base Radiant: gramados abertos, cerejeiras, o ancião e torres T4, estrada de pedra e rampas para as lanes.' },
    ['open', 'highground', 'tower'], 144, 80, 22, A => {
      A.forest(0.2, 8);
      A.paint(A.Rect(0, 0, 25, 79), { t: 2 });
      glade(A, 90, 40, 52, 36);
      plateau(A, A.Poly([[34, 8], [104, 4], [140, 40], [112, 80], [34, 80]]), 2);
      A.clear(A.Poly([[34, 8], [104, 4], [140, 40], [112, 80], [34, 80]]));
      road(A, [[96, 6], [110, 18], [122, 36], [122, 60]], 3); road(A, [[30, 14], [60, 8]], 2.5);
      ramp(A, [60, 4], [60, 10], 3.4, 1, 2); ramp(A, [118, 2], [112, 8], 3, 1, 2); ramp(A, [32, 64], [38, 64], 3, 1, 2);
      return { hero: [70, 42], towers: [T(64, 26, 0, 3), T(94, 34, 0, 3), T(100, 70, 0, 3), T(74, 56, 0, 4), T(86, 34, 0, 4)] };
    });

  // 13 -- Radiant jungle
  def('rad_jungle', { en: 'Radiant Jungle', pt: 'Selva Radiant' },
    { en: 'Sun-baked trails through the Radiant jungle, a stone road, camp clearings and a pond with a waterfall.', pt: 'Trilhas ensolaradas pela selva Radiant, estrada de pedra, clareiras de acampamento e um lago com cachoeira.' },
    ['jungle', 'river', 'tower'], 144, 80, 23, A => {
      A.forest(0.64, 6);
      road(A, [[60, 30], [90, 20], [110, 10]], 3); road(A, [[0, 24], [30, 20], [60, 28], [80, 44]], 2.5); road(A, [[40, 44], [60, 60], [90, 54], [120, 40]], 2.5); road(A, [[30, 8], [30, 40], [50, 52]], 2.2);
      for (const [x, y, rx, ry] of [[36, 10, 8, 6], [90, 12, 8, 6], [12, 20, 7, 5], [100, 30, 8, 6], [60, 40, 7, 6], [88, 64, 8, 6], [20, 60, 8, 6], [120, 22, 7, 5]]) glade(A, x, y, rx, ry);
      lake(A, 128, 62, 20, 20, [14, 14]); ramp(A, [112, 44], [118, 50], 2.8, 1, 0);
      return { hero: [64, 40], towers: [T(40, 72, 0, 2), T(44, 52, 0, 1)] };
    });

  // 14 -- bottom lane waterfall
  def('bot_falls', { en: 'Bottom Waterfall', pt: 'Cachoeira Inferior' },
    { en: 'A stone bridge over a waterfall river on the bottom lane, with the lane road and a gated lower pool.', pt: 'Uma ponte de pedra sobre um rio com cachoeira na lane de baixo, com a estrada da lane e um lago inferior com portão.' },
    ['river', 'choke', 'lowground', 'tower'], 144, 80, 24, A => {
      rad(A);
      valley(A, [[62, 0], [62, 36], [64, 80]], 8, 5);
      lake(A, 70, 74, 60, 10, [52, 6]);
      A.paint(A.Rect(52, 34, 72, 50), { t: 0, e: 1 }); A.dirt(A.Rect(52, 36, 72, 48));
      road(A, [[0, 40], [52, 40]], 3.6); road(A, [[72, 40], [144, 38]], 3.6);
      road(A, [[2, 8], [30, 14], [50, 6]], 2.5); road(A, [[80, 6], [100, 16], [126, 10]], 2.5);
      for (const [x, y, rx, ry] of [[14, 24, 9, 6], [20, 52, 8, 5], [112, 22, 9, 6], [96, 52, 8, 5], [136, 50, 6, 5]]) glade(A, x, y, rx, ry);
      ramp(A, [60, 54], [60, 60], 2.8, 1, 0); ramp(A, [100, 62], [100, 68], 2.8, 1, 0);
      return { hero: [86, 40], towers: [T(100, 40, 0, 1), T(30, 40, 0, 2), T(126, 36, 1, 1)] };
    });

  // 15 -- bottom-right corner / safe lane outpost
  def('bot_corner', { en: 'Safe Lane Outpost', pt: 'Posto da Safe Lane' },
    { en: 'The south-east corner: a Radiant outpost ring in thick jungle, a tower with a shrine below and a pond.', pt: 'O canto sudeste: um posto Radiant na selva densa, uma torre com santuário abaixo e um lago.' },
    ['jungle', 'tower', 'lowground'], 144, 80, 25, A => {
      rad(A);
      A.paint(A.Rect(134, 0, 143, 79), { t: 2 });
      road(A, [[0, 10], [30, 14], [60, 10]], 2.5); road(A, [[0, 42], [40, 44], [70, 36]], 3); road(A, [[60, 20], [100, 20], [126, 24]], 2.5); road(A, [[70, 36], [90, 48], [100, 80]], 2.5);
      for (const [x, y, rx, ry] of [[12, 22, 8, 6], [40, 26, 8, 6], [20, 52, 7, 5], [124, 40, 8, 6], [70, 62, 7, 5]]) glade(A, x, y, rx, ry);
      plateau(A, A.Ell(92, 14, 10, 8), 2); A.dirt(A.Ell(92, 14, 8, 6)); ramp(A, [92, 26], [92, 20], 3, 1, 2);
      lake(A, 8, 72, 18, 10, [12, 6]);
      return { hero: [70, 40], towers: [T(88, 50, 0, 1), T(92, 74, 0, 2)] };
    });

  // 16 -- lotus pool in the Radiant jungle
  def('lotus', { en: 'Lotus Pool', pt: 'Lago de Lótus' },
    { en: 'A shrine pool tucked into the Radiant jungle, with the river and its stair-cut bank to the north-east.', pt: 'Um lago santuário escondido na selva Radiant, com o rio e sua margem de escadas a nordeste.' },
    ['jungle', 'river', 'lowground', 'tower'], 144, 80, 26, A => {
      rad(A);
      valley(A, [[84, 0], [104, 20], [124, 34], [143, 40]], 14, 9);
      A.paint(A.Ell(110, 58, 14, 10), { t: 0 });
      road(A, [[0, 14], [20, 12], [40, 24], [56, 36], [74, 44]], 3); road(A, [[0, 70], [30, 60], [60, 66]], 2.5); road(A, [[40, 30], [20, 40], [10, 60]], 2.2);
      for (const [x, y, rx, ry] of [[20, 24, 8, 6], [44, 10, 7, 5], [66, 58, 8, 6], [92, 60, 8, 6], [30, 56, 8, 6], [100, 46, 6, 4]]) glade(A, x, y, rx, ry);
      lake(A, 44, 14, 6, 4, [3.4, 2]);
      ramp(A, [62, 28], [70, 22], 2.6, 1, 0); ramp(A, [84, 40], [92, 34], 2.6, 1, 0); ramp(A, [118, 52], [122, 44], 2.6, 1, 0); ramp(A, [88, 4], [94, 10], 2.6, 1, 0);
      return { hero: [50, 40], towers: [T(70, 66, 0, 2)] };
    });

  // 17 -- Radiant top ramps
  def('rad_top', { en: 'Radiant Top Ramps', pt: 'Rampas do Topo Radiant' },
    { en: 'The Radiant jungle meets the river under Dire cliffs: stone road, rune stairs and a crater to the east.', pt: 'A selva Radiant encontra o rio sob penhascos Dire: estrada de pedra, escadas e uma cratera a leste.' },
    ['river', 'highground', 'lowground', 'tower'], 144, 80, 27, A => {
      rad(A); dire(A);
      ground(A, A.Poly([[0, 0], [144, 0], [144, 22], [100, 20], [60, 14], [0, 18]]));
      valley(A, [[0, 30], [40, 28], [80, 36], [120, 40], [143, 36]], 14, 9);
      A.paint(A.Rect(34, 20, 64, 76), { t: 0, e: 1 });
      road(A, [[44, 22], [44, 60], [50, 76]], 3.6); road(A, [[28, 56], [60, 66]], 2.5); road(A, [[0, 70], [30, 62]], 2.5);
      for (const [x, y, rx, ry] of [[22, 60, 8, 6], [60, 52, 6, 5], [52, 68, 7, 5], [10, 50, 7, 5]]) glade(A, x, y, rx, ry);
      ramp(A, [50, 36], [56, 30], 3, 1, 0); ramp(A, [14, 48], [20, 42], 2.6, 1, 0); ramp(A, [84, 22], [88, 30], 2.6, 1, 0); ramp(A, [132, 42], [128, 36], 2.6, 1, 0);
      A.paint(A.Ell(100, 36, 13, 11), { t: 2, e: 0 }); A.paint(A.Ell(100, 36, 9, 8), { t: 0, e: 0 }); gap(A, A.Rect(88, 32, 94, 38));
      return { hero: [46, 46], towers: [T(52, 62, 0, 1), T(120, 54, 0, 1)] };
    });

  // 18 -- Radiant secret shop
  def('rad_shop', { en: 'Radiant Secret Shop', pt: 'Loja Secreta Radiant' },
    { en: 'A stone-ringed shop platform on an island pond, reached by a stair on its south bank.', pt: 'Uma plataforma de loja com anel de pedra numa ilha de lago, acessível por uma escada na margem sul.' },
    ['river', 'lowground', 'choke', 'tower'], 144, 80, 28, A => {
      rad(A);
      lake(A, 28, 36, 26, 34, [18, 26]); A.paint(A.Ell(28, 44, 7, 7), { t: 0, e: 0 }); A.paint(A.Ell(28, 44, 6.4, 6.4), { t: 4, e: 0 });
      ramp(A, [28, 66], [28, 54], 3, 1, 0); ramp(A, [46, 22], [38, 28], 2.6, 1, 0);
      road(A, [[60, 0], [60, 80]], 3.4); road(A, [[40, 28], [70, 44], [96, 46], [110, 36]], 2.5); road(A, [[60, 60], [90, 60], [120, 70]], 2.5);
      valley(A, [[104, 0], [124, 12], [143, 22]], 12, 8); A.paint(A.Rect(110, 70, 143, 79), { t: 2 });
      ramp(A, [100, 32], [108, 26], 2.6, 1, 0); ramp(A, [122, 38], [128, 32], 2.6, 1, 0);
      for (const [x, y, rx, ry] of [[70, 18, 8, 6], [94, 28, 7, 5], [78, 68, 8, 6], [118, 52, 8, 6]]) glade(A, x, y, rx, ry);
      return { hero: [70, 52], towers: [T(82, 38, 0, 1), T(128, 62, 0, 2)] };
    });

  // 19 -- Dire jungle wall
  def('dire_wall', { en: 'Dire Wall Jungle', pt: 'Selva do Muro Dire' },
    { en: 'Grey jungle on the east edge, split by a long cliff wall with one gap; an outpost tower in the south.', pt: 'Selva cinzenta na borda leste, dividida por um longo muro de penhasco com uma abertura; torre de posto ao sul.' },
    ['jungle', 'highground', 'choke', 'tower'], 144, 80, 29, A => {
      A.forest(0.55, 6); ground(A, A.Rect(0, 0, 143, 79));
      A.paint(A.Rect(128, 0, 143, 79), { t: 2 });
      wall(A, [[0, 4], [70, 4]], 1.3); gap(A, A.Rect(44, 2, 52, 6));
      wall(A, [[40, 36], [40, 60]], 1.2); gap(A, A.Rect(38, 46, 42, 52));
      for (const [x, y, rx, ry] of [[12, 22, 9, 6], [42, 16, 8, 6], [66, 30, 8, 6], [94, 18, 8, 6], [118, 36, 7, 6], [86, 54, 9, 6], [22, 52, 8, 6], [60, 66, 8, 5], [114, 66, 7, 5]]) glade(A, x, y, rx, ry);
      road(A, [[0, 30], [40, 32], [70, 30], [110, 40]], 2.5); road(A, [[20, 54], [60, 66], [100, 66]], 2.5);
      plateau(A, A.Ell(110, 40, 8, 6), 2); ramp(A, [102, 44], [106, 42], 2.6, 1, 2);
      return { hero: [64, 46], towers: [T(8, 62, 1, 1), T(110, 74, 1, 2)] };
    });

  // 20 -- Radiant fountain
  def('rad_fountain', { en: 'Radiant Fountain', pt: 'Fonte Radiant' },
    { en: 'The fountain lawn in the bottom-left corner: cherry grove, shrines, a stone road and a pond with a waterfall.', pt: 'O gramado da fonte no canto inferior esquerdo: cerejeiras, santuários, estrada de pedra e um lago com cachoeira.' },
    ['open', 'tower', 'river'], 144, 80, 30, A => {
      A.forest(0.25, 8);
      A.paint(A.Poly([[0, 0], [20, 0], [24, 50], [0, 80]]), { t: 2 });
      glade(A, 90, 24, 50, 18); glade(A, 40, 28, 18, 14);
      road(A, [[100, 0], [106, 30], [108, 60]], 3.2); road(A, [[130, 0], [135, 30]], 2.5);
      lake(A, 124, 58, 20, 10, [16, 6]);
      plateau(A, A.Rect(52, 6, 108, 44), 2);
      ramp(A, [112, 20], [106, 20], 3, 1, 2); ramp(A, [78, 46], [78, 40], 3, 1, 2); ramp(A, [48, 24], [54, 24], 3, 1, 2);
      return { hero: [78, 24], towers: [T(90, 22, 0, 4), T(90, 30, 0, 4), T(66, 14, 0, 3), T(110, 46, 0, 3)] };
    });

  // 21 -- Dire mid cliffs
  def('dire_cliffs', { en: 'Dire Mid Cliffs', pt: 'Penhascos do Meio Dire' },
    { en: 'A diagonal cliff wall with a stair gap cuts across Dire ground; lava-lit shrines and root thickets on both sides.', pt: 'Um muro de penhasco diagonal com uma abertura de escada corta o terreno Dire; santuários com lava e matas de raízes nos dois lados.' },
    ['highground', 'choke', 'tower'], 144, 80, 31, A => {
      dire(A); ground(A, A.Rect(0, 0, 143, 79));
      wall(A, [[44, 12], [60, 20], [76, 34], [92, 46], [104, 56]], 1.3); gap(A, A.Ell(70, 28, 3, 3)); gap(A, A.Ell(98, 51, 3, 3));
      wall(A, [[104, 56], [143, 60]], 1.2);
      plateau(A, A.Poly([[88, 0], [143, 0], [143, 40], [100, 30]]), 2); ramp(A, [86, 22], [94, 16], 3, 1, 2);
      for (const [x, y, rx, ry] of [[16, 20, 9, 6], [24, 56, 9, 6], [60, 56, 9, 6], [120, 66, 9, 6], [112, 44, 7, 5]]) glade(A, x, y, rx, ry);
      road(A, [[0, 40], [40, 40], [80, 52], [110, 70]], 3);
      return { hero: [40, 44], towers: [T(106, 14, 1, 2), T(24, 68, 1, 1), T(96, 66, 1, 1)] };
    });

  // ------------------------------------------------------------------ derived spawns
  function reachFrom(map, tx, ty) {
    const W = map.w, H = map.h, seen = new Uint8Array(W * H), q = [tx + ty * W];
    if (!map.walkableTile(tx, ty)) return seen;
    seen[q[0]] = 1;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx] || !map.walkableTile(nx, ny)) continue;
        seen[ny * W + nx] = 1; q.push(ny * W + nx);
      }
    }
    return seen;
  }
  // all tiles in the (2r+1)^2 box walkable and at the centre's elevation
  function clearBox(map, tx, ty, r) {
    const el = map.elevTile(tx, ty);
    for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) if (!map.walkableTile(x, y) || map.elevTile(x, y) !== el) return false;
    return true;
  }
  function nearestWalk(map, tx, ty) {
    for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
      if (Math.max(Math.abs(dx), Math.abs(dy)) === r && clearBox(map, tx + dx, ty + dy, 1)) return [tx + dx, ty + dy];
    return [tx, ty];
  }

  function deriveDummies(map, reach, ht) {
    const W = map.w, cands = [];
    for (let y = 3; y < map.h - 3; y++) for (let x = 3; x < W - 3; x++) {
      if (!reach[y * W + x] || !clearBox(map, x, y, 2) || map.at(x, y) === 5) continue;
      const d = Math.hypot(x - ht[0], y - ht[1]);
      if (d >= 7 && d <= 55) cands.push([x, y, d]);
    }
    for (const sep of [9, 7, 5, 3]) {
      const sel = [];
      let first = null;
      for (const c of cands) if (!first || Math.abs(c[2] - 13) < Math.abs(first[2] - 13)) first = c;
      if (!first) break;
      sel.push(first);
      while (sel.length < 12) {
        let best = null, bs = -1;
        for (const c of cands) {
          let m = 1e9; for (const s of sel) m = Math.min(m, Math.hypot(c[0] - s[0], c[1] - s[1]));
          if (m > bs) { bs = m; best = c; }
        }
        if (!best || bs < sep) break;
        sel.push(best);
      }
      if (sel.length >= 8 || sep === 3) return sel.sort((a, b) => a[2] - b[2]).map(c => map.center(c[0], c[1]));
    }
    return [];
  }

  function deriveArenas(map, reach, ht, zones) {
    const W = map.w, H = map.h, out = [], towers = map.towers;
    const hero = map.spawns.hero, V = IT.Vision;
    const run = (x, y, dx, dy) => {
      let n = 1; const el = map.elevTile(x, y);
      for (let s = 1; s < 12; s++) { if (map.walkableTile(x + dx * s, y + dy * s) && map.elevTile(x + dx * s, y + dy * s) === el) n++; else break; }
      for (let s = 1; s < 12; s++) { if (map.walkableTile(x - dx * s, y - dy * s) && map.elevTile(x - dx * s, y - dy * s) === el) n++; else break; }
      return n;
    };
    for (let y = 2; y < H - 2; y += 5) for (let x = 2; x < W - 2; x += 5) {
      if (!reach[y * W + x] || !clearBox(map, x, y, 1)) continue;
      const tags = [], c = map.center(x, y), el = map.elevTile(x, y);
      if (clearBox(map, x, y, 3)) tags.push('open');
      if (el === 2) tags.push('highground'); else if (el === 0) tags.push('lowground');
      let wet = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (map.at(x + dx, y + dy) === 5) wet = true;
      if (wet) tags.push('river');
      let tw = -1, td = 1e9;
      for (const t of towers) { const d = Math.hypot(t.x - c.x, t.y - c.y) / map.tile; if (d <= TOWER_R && d < td) { td = d; tw = t.team; } }
      if (tw >= 0) tags.push('tower');
      if (Math.min(run(x, y, 1, 0), run(x, y, 0, 1)) <= 6) tags.push('choke');
      let hidden = Math.hypot(c.x - hero.x, c.y - hero.y) > HERO_SIGHT;
      if (!hidden && V) hidden = map.elevAt(c.x, c.y) > map.elevAt(hero.x, hero.y) || !V.los(map, hero.x, hero.y, c.x, c.y);
      if (hidden) tags.push('fog');
      for (const z of zones || []) if (x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) tags.push(z.tag);
      const a = { x: c.x, y: c.y, tags };
      if (tw >= 0) a.tw = tw;
      out.push(a);
    }
    return out;
  }

  function finish(map, ht, zones, keepDummies) {
    const reach = reachFrom(map, ht[0], ht[1]);
    if (!keepDummies) map.spawns.dummies = deriveDummies(map, reach, ht);
    map.spawns.arenas = deriveArenas(map, reach, ht, zones);
    return map;
  }

  // ------------------------------------------------------------------ registry
  const GROUNDS = { id: 'grounds', name: { en: 'Training Grounds', pt: 'Campo de Treino' }, blurb: { en: 'The classic forest clearing with fords across the water.', pt: 'A clareira clássica na floresta com vaus sobre a água.' }, tags: ['open'] };
  const list = [GROUNDS].concat(SPECS.map(s => ({ id: s.id, name: s.name, blurb: s.blurb, tags: s.tags })));
  const cache = {}, thumbs = {};

  function make(id) {
    let m;
    if (id === 'grounds') {
      m = IT.Map.build(IT.MAPDEF);
      m.towers = [];
      const hs = m.spawns.hero;
      finish(m, [m.toTile(hs.x), m.toTile(hs.y)], null, true);
    } else {
      const s = SPECS.find(q => q.id === id), A = Gen(s.W, s.H, s.seed);
      const r = s.fn(A);
      A.rim(); A.cliffs();
      // a tower needs a flat 3x3 of open ground (no cliff, ramp, water): slide it to the nearest such spot
      const flat = (x, y) => {
        const el = A.e[y * A.W + x];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!A.inb(x + dx, y + dy)) return false;
          const i = (y + dy) * A.W + x + dx;
          if (A.e[i] !== el || A.rp[i] || (A.g[i] !== 0 && A.g[i] !== 1 && A.g[i] !== 4)) return false;
        }
        return true;
      };
      for (const t of r.towers) {
        if (flat(t.tx, t.ty)) continue;
        let best = null, bd = 1e9;
        for (let y = t.ty - 12; y <= t.ty + 12; y++) for (let x = t.tx - 12; x <= t.tx + 12; x++) if (A.inb(x, y) && flat(x, y)) { const d = Math.hypot(x - t.tx, y - t.ty); if (d < bd) { bd = d; best = [x, y]; } }
        if (best) { t.tx = best[0]; t.ty = best[1]; }
      }
      for (const t of r.towers) { A.treesClear(t.tx, t.ty, 4); }
      A.connect(r.hero, r.towers);
      A.cliffsFixTowers && A.cliffsFixTowers();
      const rows = [];
      for (let y = 0; y < A.H; y++) { let q = ''; for (let x = 0; x < A.W; x++) q += CH[A.g[y * A.W + x]]; rows.push(q); }
      // keep towers off cliffs: footprints sit on a tile of their own elevation, nudge hero spawn onto clear ground
      const raw = IT.Map.build({ tile: TILE, w: A.W, h: A.H, rows, elev: A.e, ramp: A.rp, towers: r.towers });
      const ht = nearestWalk(raw, r.hero[0], r.hero[1]);
      raw.spawns = { hero: raw.center(ht[0], ht[1]), dummies: [] };
      m = finish(raw, ht, r.zones, false);
    }
    const meta = list.find(q => q.id === id);
    m.id = id; m.name = meta.name; m.blurb = meta.blurb; m.tags = meta.tags;
    return m;
  }

  function get(id) {
    if (!list.some(m => m.id === id)) id = 'grounds';
    return cache[id] || (cache[id] = make(id));
  }

  // tile-colour preview (browser only), cached per id/size
  const THUMB_RGB = [[56, 94, 56], [20, 44, 28], [96, 92, 108], [40, 88, 150], [110, 88, 58], [70, 140, 214], [70, 66, 80]];
  function thumb(id, w, h) {
    w = w || 96; h = h || 54;
    const key = id + ':' + w + 'x' + h;
    if (thumbs[key]) return thumbs[key];
    const m = get(id), c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), img = x.createImageData(w, h);
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const tx = Math.min(m.w - 1, Math.floor((px + 0.5) * m.w / w)), ty = Math.min(m.h - 1, Math.floor((py + 0.5) * m.h / h));
      const col = THUMB_RGB[m.at(tx, ty)] || THUMB_RGB[0], el = m.elevTile(tx, ty), k = el === 2 ? 1.28 : el === 0 ? 0.75 : 1, i = (py * w + px) * 4;
      img.data[i] = Math.min(255, col[0] * k); img.data[i + 1] = Math.min(255, col[1] * k); img.data[i + 2] = Math.min(255, col[2] * k * (el === 2 ? 0.9 : 1)); img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    for (const t of m.towers) {
      const px = Math.round(t.x / m.W * w), py = Math.round(t.y / m.H * h);
      x.fillStyle = '#000'; x.fillRect(px - 2, py - 2, 5, 5);
      x.fillStyle = t.team === 0 ? '#5dff7a' : '#ff5a4a'; x.fillRect(px - 1, py - 1, 3, 3);
    }
    x.fillStyle = '#ffe9a0'; x.fillRect(Math.round(m.spawns.hero.x / m.W * w) - 1, Math.round(m.spawns.hero.y / m.H * h) - 1, 3, 3);
    return (thumbs[key] = c);
  }

  IT.Maps = { list, ids: () => list.map(m => m.id), get, thumb: typeof document !== 'undefined' ? thumb : null };
})(typeof window !== 'undefined' ? window : globalThis);
