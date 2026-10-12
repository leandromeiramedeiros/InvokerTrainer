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
            if (e[j] < ei && !(rp[i] && rp[j])) lo = Math.min(lo, e[j]);
          }
          if (lo < ei) mark.push(i, lo);
        }
        for (let k = 0; k < mark.length; k += 2) { g[mark[k]] = 2; e[mark[k]] = mark[k + 1]; rp[mark[k]] = 0; }
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
  const SPECS = [];
  function def(id, name, blurb, tags, W, H, seed, fn) { SPECS.push({ id, name, blurb, tags, W, H, seed, fn }); }
  const T = (tx, ty, team, tier) => ({ tx, ty, team, tier });

  def('midlane', { en: 'Mid Lane & River', pt: 'Mid e Rio' },
    { en: 'The diagonal mid lane crossing the river, jungle bluffs on both sides.', pt: 'A lane do meio cruzando o rio, com platôs de selva dos dois lados.' },
    ['river', 'open', 'highground', 'tower'], 144, 80, 11, A => {
      A.forest(0.62);
      const bank = A.Path([[50, 2], [62, 24], [72, 40], [84, 58], [96, 78]], 10, 2);
      A.clear(bank);
      const lane = [[4, 76], [34, 56], [60, 46], [84, 34], [112, 22], [140, 4]];
      A.clear(A.Path(lane, 7, 1.5)); A.dirt(A.Path(lane, 2.2, 0.8));
      for (const [x, y, r] of [[28, 20, 6], [52, 10, 5], [18, 40, 5], [112, 60, 6], [92, 70, 5], [128, 38, 5], [78, 12, 5], [64, 68, 5]]) A.clear(A.Ell(x, y, r, r * 0.8));
      A.river(A.Path([[50, 2], [62, 24], [72, 40], [84, 58], [96, 78]], 4.5, 1.5));
      A.paint(A.Ell(30, 24, 11, 7), { t: 0, e: 2 });
      A.slope(A.Rect(31, 29, 37, 37), [34, 37], [34, 29], 1, 2);
      A.paint(A.Ell(112, 56, 11, 7), { t: 0, e: 2 });
      A.slope(A.Rect(107, 43, 113, 51), [110, 43], [110, 51], 1, 2);
      return { hero: [72, 40], towers: [T(46, 51, 0, 1), T(20, 65, 0, 2), T(98, 28, 1, 1), T(124, 14, 1, 2)] };
    });

  function safeLane(A) {
    A.forest(0.6);
    A.clear(A.Path([[78, 2], [88, 30], [100, 60], [108, 78]], 9, 2));
    const lane = [[4, 68], [40, 66], [80, 64], [112, 60], [138, 46]];
    A.clear(A.Path(lane, 7, 1.5)); A.dirt(A.Path(lane, 2.2, 0.8));
    for (const [x, y, r] of [[30, 40, 6], [56, 22, 6], [24, 18, 5], [90, 20, 5], [124, 28, 5], [118, 72, 4], [42, 54, 4]]) A.clear(A.Ell(x, y, r, r * 0.8));
    A.river(A.Path([[78, 2], [88, 30], [100, 60], [108, 78]], 4.5, 1.5));
    A.paint(A.Ell(62, 44, 10, 6), { t: 0, e: 2 });
    A.slope(A.Rect(58, 49, 66, 58), [62, 58], [62, 49], 1, 2);
    A.paint(A.Ell(76, 24, 8, 5), { t: 0, e: 0 });
    A.slope(A.Rect(80, 21, 90, 28), [80, 24], [90, 24], 0, 1);
    return { hero: [70, 60], towers: [T(58, 65, 0, 1), T(24, 67, 0, 2), T(126, 54, 1, 1)] };
  }
  def('safelane_r', { en: 'Radiant Safe Lane', pt: 'Safe Lane Radiant' },
    { en: 'Bottom lane under the Radiant tier-1 tower, river to the east, a bluff above the lane.', pt: 'Lane de baixo sob a torre T1 Radiant, rio a leste e um platô acima da lane.' },
    ['river', 'open', 'highground', 'lowground', 'tower'], 144, 80, 22, safeLane);
  def('safelane_d', { en: 'Dire Safe Lane', pt: 'Safe Lane Dire' },
    { en: 'Top lane ending at the Dire tier-1 tower. Blink behind it, or bait it from the river.', pt: 'Lane de cima terminando na torre T1 Dire. Dê Blink atrás dela ou atraia do rio.' },
    ['river', 'open', 'highground', 'lowground', 'tower'], 144, 80, 22, A => {
      const r = safeLane(A); rot180(A);
      const f = (tx, ty) => [A.W - 1 - tx, A.H - 1 - ty];
      return { hero: f(74, 54), towers: r.towers.map(t => { const p = f(t.tx, t.ty); return T(p[0], p[1], 1 - t.team, t.tier); }) };
    });

  def('roshan', { en: "Roshan's Pit", pt: 'Fosso do Roshan' },
    { en: 'A sunken pit under the river with two ramps. Low ground cannot see out.', pt: 'Um fosso abaixo do rio com duas rampas. Quem está embaixo não enxerga para fora.' },
    ['river', 'lowground', 'pit'], 108, 60, 44, A => {
      A.forest(0.55);
      A.clear(A.Ell(54, 34, 24, 16));
      A.river(A.Path([[0, 8], [30, 11], [60, 8], [107, 11]], 4.2, 1.2));
      A.clear(A.Path([[0, 8], [30, 11], [60, 8], [107, 11]], 8, 1.5));
      A.river(A.Path([[0, 8], [30, 11], [60, 8], [107, 11]], 4.2, 1.2));
      A.paint(A.Ell(54, 34, 12, 9), { t: 0, e: 0 });
      A.dirt(A.Ell(54, 35, 8, 5));
      A.slope(A.Rect(49, 17, 59, 27), [54, 27], [54, 17], 0, 1);
      A.slope(A.Rect(63, 30, 74, 38), [63, 34], [74, 34], 0, 1);
      return { hero: [34, 18], towers: [], zones: [{ tag: 'pit', x0: 42, y0: 26, x1: 66, y1: 43 }] };
    });

  def('riverbed', { en: 'River Ramps', pt: 'Rampas do Rio' },
    { en: 'A sunken river valley walled by cliffs; four ramps lead up to jungle banks.', pt: 'Um vale de rio cercado por penhascos; quatro rampas sobem para as margens de selva.' },
    ['river', 'lowground', 'tower'], 126, 70, 55, A => {
      A.forest(0.58);
      const mid = [[0, 35], [40, 33], [80, 37], [125, 35]];
      A.clear(A.Path(mid, 16, 2));
      A.paint(A.Path(mid, 9, 1.5), { t: 0, e: 0 });
      A.river(A.Path(mid, 3.6, 1));
      for (const [x, y, r] of [[18, 12, 5], [60, 10, 5], [104, 12, 5], [20, 58, 5], [86, 58, 5], [118, 56, 4]]) A.clear(A.Ell(x, y, r, r * 0.8));
      A.slope(A.Rect(25, 14, 35, 32), [30, 32], [30, 14], 0, 1);
      A.slope(A.Rect(91, 14, 101, 32), [96, 32], [96, 14], 0, 1);
      A.slope(A.Rect(57, 38, 67, 56), [62, 38], [62, 56], 0, 1);
      A.slope(A.Rect(107, 38, 117, 56), [112, 38], [112, 56], 0, 1);
      return { hero: [60, 35], towers: [T(60, 12, 1, 1), T(86, 56, 0, 1)] };
    });

  def('jungle', { en: 'Jungle Camps', pt: 'Selva e Acampamentos' },
    { en: 'Dense jungle: camp clearings joined by narrow trails, an ancient plateau in the middle.', pt: 'Selva densa: clareiras de acampamentos ligadas por trilhas estreitas e um platô ancião no meio.' },
    ['jungle', 'highground', 'fog', 'choke'], 126, 70, 66, A => {
      A.forest(0.72);
      const camps = [[20, 16], [48, 12], [80, 18], [104, 12], [28, 46], [60, 52], [92, 50], [110, 34], [14, 60], [76, 64], [40, 30]];
      for (const [x, y] of camps) A.clear(A.Ell(x, y, 6, 5));
      const links = [[0, 1], [1, 2], [2, 3], [0, 10], [10, 4], [4, 8], [10, 5], [5, 6], [6, 7], [7, 3], [5, 9], [2, 7]];
      for (const [a, b] of links) { const p = [camps[a], camps[b]]; A.clear(A.Path(p, 2.4, 0.8)); A.dirt(A.Path(p, 1.1, 0.4)); }
      A.paint(A.Ell(62, 32, 12, 8), { t: 0, e: 2 });
      A.slope(A.Rect(57, 17, 67, 26), [62, 17], [62, 26], 1, 2);
      A.scatter(A.Ell(62, 32, 10, 6), 0.05);
      return { hero: [60, 52], towers: [] };
    });

  def('highground', { en: 'High-Ground Siege', pt: 'Cerco ao Terreno Alto' },
    { en: 'Enemy tier-2 and tier-3 towers guard a plateau; a ramp, a side trail, or Blink gets you up.', pt: 'Torres T2 e T3 inimigas guardam um platô; uma rampa, uma trilha lateral ou o Blink levam você ao topo.' },
    ['highground', 'tower', 'open'], 144, 80, 77, A => {
      A.forest(0.52);
      A.clear(A.Rect(4, 18, 82, 62)); A.dirt(A.Path([[6, 40], [84, 40]], 3.5, 1));
      A.paint(A.Rect(86, 8, 140, 72), { t: 0, e: 2 });
      A.slope(A.Rect(79, 34, 92, 46), [79, 40], [92, 40], 1, 2);
      A.slope(A.Rect(79, 12, 92, 20), [79, 16], [92, 16], 1, 2);
      A.clear(A.Rect(70, 8, 85, 24));
      A.slope(A.Rect(79, 12, 92, 20), [79, 16], [92, 16], 1, 2);
      A.dirt(A.Path([[92, 40], [138, 40]], 3, 1));
      A.scatter(A.Rect(88, 10, 138, 70), 0.04);
      return { hero: [34, 42], towers: [T(12, 40, 0, 2), T(70, 40, 1, 2), T(98, 33, 1, 3), T(98, 47, 1, 3), T(122, 37, 1, 4), T(122, 43, 1, 4)] };
    });

  def('triangle', { en: 'The Triangle', pt: 'O Triângulo' },
    { en: 'A walled triangular camp with a single mouth, next to the lane and the river.', pt: 'Um acampamento triangular murado com uma única entrada, ao lado da lane e do rio.' },
    ['river', 'choke', 'jungle', 'tower'], 108, 60, 88, A => {
      A.forest(0.6);
      const lane = [[2, 50], [40, 47], [70, 49], [106, 44]];
      A.clear(A.Path(lane, 7, 1.5)); A.dirt(A.Path(lane, 2.2, 0.8));
      A.clear(A.Ell(20, 20, 8, 6)); A.clear(A.Ell(88, 18, 7, 6));
      A.paint(A.Poly([[34, 10], [72, 10], [53, 42]]), { t: 2 });
      A.paint(A.Poly([[38, 13], [68, 13], [53, 37]]), { t: 0 });
      A.clear(A.Path([[53, 36], [53, 46]], 2.2, 0.3)); A.dirt(A.Path([[53, 36], [53, 46]], 1.4, 0.2));
      A.scatter(A.Poly([[40, 14], [66, 14], [53, 33]]), 0.03);
      A.clear(A.Path([[92, 0], [96, 30], [98, 59]], 8, 1.5));
      A.river(A.Path([[92, 0], [96, 30], [98, 59]], 4, 1));
      return { hero: [70, 52], towers: [T(20, 46, 0, 1)] };
    });

  def('shop', { en: 'Secret Shop', pt: 'Loja Secreta' },
    { en: 'Two raised shop nooks off the river, each with one narrow ramp.', pt: 'Dois nichos elevados de loja perto do rio, cada um com uma rampa estreita.' },
    ['river', 'choke', 'highground', 'tower'], 108, 60, 99, A => {
      A.forest(0.6);
      A.clear(A.Path([[56, 0], [52, 30], [58, 59]], 11, 2));
      A.clear(A.Rect(8, 36, 100, 50)); A.dirt(A.Path([[6, 44], [102, 44]], 2.5, 0.8));
      A.river(A.Path([[56, 0], [52, 30], [58, 59]], 4.5, 1));
      A.clear(A.Rect(12, 14, 44, 32));
      A.paint(A.Rect(15, 16, 29, 27), { t: 0, e: 2 });
      A.slope(A.Rect(29, 20, 40, 24), [40, 22], [29, 22], 1, 2);
      A.clear(A.Rect(70, 10, 100, 34));
      A.paint(A.Rect(79, 16, 93, 27), { t: 0, e: 2 });
      A.slope(A.Rect(68, 20, 79, 24), [68, 22], [79, 22], 1, 2);
      return { hero: [52, 28], towers: [T(26, 44, 0, 1), T(86, 44, 1, 1)] };
    });

  def('towerduel', { en: 'Tower Duel', pt: 'Duelo de Torres' },
    { en: 'Two tier-1 towers face each other across a shallow river; their ranges overlap.', pt: 'Duas torres T1 frente a frente, separadas por um rio raso; os alcances se sobrepõem.' },
    ['open', 'river', 'tower'], 108, 60, 111, A => {
      A.forest(0.5);
      A.clear(A.Rect(6, 6, 101, 53)); A.dirt(A.Path([[6, 30], [101, 30]], 3, 1));
      A.river(A.Path([[54, 0], [56, 30], [54, 59]], 3.5, 1));
      A.scatter(A.Rect(10, 8, 98, 52), 0.025);
      A.clear(A.Rect(30, 22, 78, 38)); A.dirt(A.Path([[6, 30], [101, 30]], 3, 1));
      A.river(A.Path([[54, 0], [56, 30], [54, 59]], 3.5, 1));
      return { hero: [54, 46], towers: [T(38, 30, 0, 1), T(70, 30, 1, 1), T(18, 30, 0, 2), T(90, 30, 1, 2)] };
    });

  def('cliffs', { en: 'Cliff Corridors', pt: 'Corredores de Penhasco' },
    { en: 'Three corridors split by thin cliff ridges. Blink and Force Staff cross them; legs take the long way round.', pt: 'Três corredores separados por penhascos finos. Blink e Force Staff atravessam; a pé é o caminho longo.' },
    ['highground', 'lowground', 'choke', 'tower'], 126, 70, 122, A => {
      A.forest(0.5);
      A.clear(A.Rect(6, 6, 119, 63)); A.dirt(A.Path([[8, 28], [118, 28]], 1.5, 0.6)); A.dirt(A.Path([[8, 41], [118, 41]], 1.5, 0.6));
      A.paint(A.Rect(8, 20, 110, 21), { t: 0, e: 2 });
      A.paint(A.Rect(16, 34, 118, 35), { t: 0, e: 2 });
      A.paint(A.Rect(8, 48, 110, 49), { t: 0, e: 2 });
      A.paint(A.Rect(94, 24, 112, 31), { t: 0, e: 2 });
      A.slope(A.Rect(85, 25, 95, 30), [85, 27], [95, 27], 1, 2);
      A.paint(A.Ell(40, 42, 9, 4), { t: 0, e: 0 });
      A.slope(A.Rect(47, 39, 56, 45), [47, 42], [56, 42], 0, 1);
      A.scatter(A.Rect(10, 52, 116, 62), 0.05);
      return { hero: [20, 28], towers: [T(96, 42, 1, 1), T(14, 56, 0, 1)] };
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
      for (const t of r.towers) { A.treesClear(t.tx, t.ty, 4); }
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
