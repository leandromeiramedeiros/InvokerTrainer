// Pixel-art rank medals, drawn procedurally on a 64x64 grid (nearest-neighbour scaled). Owner: S6.
// IT.Medals.canvas(tier 0..7, stars 0..5, px) -> cached canvas; .pip(tier, px) small HUD pip; .el(rating, px, label) -> DOM.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const N = 64;
  const NAMES = ['Herald', 'Guardian', 'Crusader', 'Archon', 'Legend', 'Ancient', 'Divine', 'Immortal'];
  const IDS = ['herald', 'guardian', 'crusader', 'archon', 'legend', 'ancient', 'divine', 'immortal'];

  // ramps: [outline, highlight, base, shade, deep]
  const R = {
    bronze: ['#231a08', '#e8d684', '#b09844', '#7a672a', '#4a3c16'],
    backing: ['#0a0806', '#4e4436', '#2e281f', '#1e1a13', '#12100b'],
    steel: ['#11151b', '#eef3f8', '#aeb8c6', '#737e90', '#464e5e'],
    darksteel: ['#07090c', '#566072', '#313846', '#202530', '#12151c'],
    copper: ['#2a1006', '#f2b070', '#c0703a', '#8c4824', '#52260f'],
    gold: ['#321e04', '#fff4a8', '#f2c444', '#c28a1a', '#7c5110'],
    goldlt: ['#3a2406', '#ffffd0', '#ffe070', '#e0a824', '#9a6a14'],
    teal: ['#05262a', '#a8f6ee', '#2ec6be', '#1a8a8e', '#0e5058'],
    inkgreen: ['#030a06', '#2f5e40', '#183a2a', '#0e251b', '#07130d'],
    ink: ['#04030a', '#202030', '#121220', '#0b0b16', '#06060c'],
    crimson: ['#2a0208', '#ff9c9c', '#e42234', '#a40e22', '#5c0614'],
    purpleban: ['#0a0414', '#5c3c90', '#34205e', '#20123e', '#120a26'],
    violet: ['#1e0a40', '#e6b8ff', '#9c52e4', '#6a2cb4', '#42197c'],
    pink: ['#4a0030', '#ffe6f4', '#ff74c4', '#d02a94', '#82105e'],
    green: ['#052a0e', '#d8ffa0', '#58cc34', '#2c8a22', '#145014'],
    greenglow: ['#0a3a14', '#f0ffc8', '#9cf060', '#4cb83a', '#25782a'],
    wing: ['#17305e', '#ffffff', '#dcecff', '#9fc6f2', '#6e9cd6'],
    wingdk: ['#14285a', '#f4faff', '#c4dcfa', '#86b0ea', '#5882c8'],
    fire: ['#3a0804', '#ffe890', '#ff9a24', '#e04c10', '#8a1c08'],
    flame: ['#4a0a04', '#fff0a0', '#ffb030', '#f06418', '#b02a0c'],
    orb: ['#322004', '#ffffff', '#ffd650', '#d8921c', '#8a5410'],
  };
  const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const bay = (x, y) => B4[((y & 3) << 2) | (x & 3)];
  const RAD = Math.PI / 180;

  let buf;   // current pixel buffer (colors or null)
  const px = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < N && y < N) buf[y * N + x] = c; };

  // ---- masks
  function poly(pts) {
    const m = new Uint8Array(N * N), n = pts.length;
    for (let y = 0; y < N; y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x + 0.5 < xs[k + 1] && x < N; x++) m[y * N + x] = 1;
    }
    return m;
  }
  function fn(f) {
    const m = new Uint8Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (f(x + 0.5, y + 0.5)) m[y * N + x] = 1;
    return m;
  }
  const disc = (cx, cy, r) => fn((x, y) => (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r);
  const sub = (a, b) => a.map((v, i) => v && !b[i] ? 1 : 0);
  const mx = x => 64 - x;
  const mir = pts => pts.map(p => [64 - p[0], p[1]]);
  const diamond = (cx, cy, hw, hh, c) => c ? [[cx - c, cy - hh], [cx + c, cy - hh], [cx + hw, cy - c * 1.2], [cx + hw, cy + c * 1.2], [cx + c, cy + hh], [cx - c, cy + hh], [cx - hw, cy + c * 1.2], [cx - hw, cy - c * 1.2]] : [[cx, cy - hh], [cx + hw, cy], [cx, cy + hh], [cx - hw, cy]];
  function star(cx, cy, n, ro, ri, rot) {
    const p = [];
    for (let i = 0; i < n * 2; i++) { const a = ((rot == null ? -90 : rot) + i * 180 / n) * RAD, r = i & 1 ? ri : ro; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return p;
  }
  // pointed leaf centred (cx,cy), half-length a, half-width b, angle deg
  function leaf(cx, cy, a, b, ang) {
    const ca = Math.cos(ang * RAD), sa = Math.sin(ang * RAD);
    return fn((x, y) => { const dx = x - cx, dy = y - cy, u = dx * ca + dy * sa, v = -dx * sa + dy * ca; if (Math.abs(u) >= a) return false; return Math.abs(v) <= b * Math.pow(1 - Math.abs(u) / a, 0.55) + 0.3; });
  }

  // ---- painting: outline ring, top-left bevel, dithered vertical gradient
  function paint(m, rp, o) {
    o = o || {};
    const d = new Uint8Array(N * N);
    let y0 = N, y1 = -1;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (m[y * N + x]) { d[y * N + x] = 99; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (y1 < 0) return;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x; if (!d[i]) continue; d[i] = Math.min(d[i], (x ? d[i - 1] : 0) + 1, (y ? d[i - N] : 0) + 1); }
    for (let y = N - 1; y >= 0; y--) for (let x = N - 1; x >= 0; x--) { const i = y * N + x; if (!d[i]) continue; d[i] = Math.min(d[i], (x < N - 1 ? d[i + 1] : 0) + 1, (y < N - 1 ? d[i + N] : 0) + 1); }
    const at = (x, y) => x < 0 || y < 0 || x >= N || y >= N ? 0 : d[y * N + x];
    const H = y1 - y0 + 1;
    for (let y = y0; y <= y1; y++) for (let x = 0; x < N; x++) {
      const v = d[y * N + x]; if (!v) continue;
      let c;
      if (v === 1 && !o.noline) c = o.line || rp[0];
      else if (v <= 2 && !o.flat) {
        if (at(x, y - 1) <= 1 || at(x - 1, y) <= 1) c = rp[1];
        else if (at(x, y + 1) <= 1 || at(x + 1, y) <= 1) c = rp[3];
        else c = rp[2];
      } else {
        const t = (y - y0 + 0.5) / H;
        if (o.flat) c = rp[2];
        else if (t < 0.3) c = rp[2];
        else if (t < 0.7) c = bay(x, y) < (t - 0.3) / 0.4 * 0.8 ? rp[3] : rp[2];
        else c = bay(x, y) < 0.8 + (t - 0.7) * 0.6 ? (bay(x + 2, y + 1) < (t - 0.7) / 0.3 * 0.7 ? rp[4] : rp[3]) : rp[2];
      }
      buf[y * N + x] = c;
    }
  }
  const layer = (pts, rp, o) => paint(pts instanceof Uint8Array ? pts : poly(pts), rp, o);
  const both = (pts, rp, o) => { layer(pts, rp, o); layer(mir(pts), rp, o); };

  function gem(cx, cy, r, rp) {
    paint(disc(cx, cy, r), rp, { flat: true });
    px(cx - r * 0.45, cy - r * 0.45, rp[1]);
    if (r >= 3) { px(cx - r * 0.45 + 1, cy - r * 0.45, rp[1]); px(cx + r * 0.35, cy + r * 0.4, rp[3]); px(cx + r * 0.1, cy + r * 0.5, rp[3]); }
    if (r >= 2.5) px(cx - r * 0.45, cy - r * 0.45, '#ffffff');
  }
  function aura(cx, cy, rx, ry, cols, k) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (buf[y * N + x]) continue;
      const dd = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry); if (dd >= 1) continue;
      const v = (1 - dd) * (k || 1);
      if (v > bay(x, y) * 0.85) buf[y * N + x] = cols[v > 0.62 ? 0 : v > 0.38 ? 1 : 2];
    }
  }
  function feather(rx, ry, ang, len, w) {   // left-side feather, ang deg from straight-out(-x), +down
    const a = ang * RAD, dx = -Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
    return [[rx + nx * w * 0.45, ry + ny * w * 0.45], [rx + dx * len * 0.6 + nx * w * 0.6, ry + dy * len * 0.6 + ny * w * 0.6], [rx + dx * len, ry + dy * len], [rx + dx * len * 0.6 - nx * w * 0.6, ry + dy * len * 0.6 - ny * w * 0.6], [rx - nx * w * 0.45, ry - ny * w * 0.45]];
  }
  // feather rows: each [angles[], len[], w], drawn lowest feather first so upper ones overlap
  function wings(rx, ry, rows, rp) {
    rows.forEach(row => {
      const [angs, lens, w, rr] = row;
      for (let i = angs.length - 1; i >= 0; i--) both(feather(rx, ry, angs[i], lens[i], w), rr || rp);
    });
  }

  // ---- tiers
  function herald() {
    layer(diamond(32, 28, 21, 25), R.backing);
    // leafy green glow, left
    aura(15, 30, 16, 22, [R.greenglow[2], R.green[2], R.green[3]], 0.95);
    [[[9, 34], [12, 23], [17, 33], [13, 42]], [[3, 31], [7, 24], [11, 33], [7, 38]], [[11, 20], [16, 14], [18, 24], [14, 26]]].forEach(p => layer(p, R.green));
    layer(diamond(32, 28, 17, 21), R.bronze);
    layer(diamond(32, 28, 11.5, 15), R.ink);
    layer(diamond(32, 28, 7.5, 9.5), R.inkgreen, { flat: true });
    gem(32, 28, 3.6, R.greenglow);
    [[32, 6], [32, 50], [14, 28], [50, 28]].forEach(p => gem(p[0], p[1], 2.2, R.bronze));
  }
  function guardian() {
    layer(diamond(32, 28, 24, 26, 5), R.steel);
    layer(diamond(32, 28, 19, 21, 4), R.darksteel, { flat: true });
    layer(diamond(32, 29, 16, 18), R.copper);
    layer([[18, 13], [32, 23], [46, 13], [46, 19], [32, 29], [18, 19]], R.darksteel);
    layer(diamond(32, 31, 9, 10), R.copper);
    gem(27, 35, 2.6, R.gold); gem(37, 35, 2.6, R.gold);
    layer(diamond(32, 47, 4, 5), R.steel);
  }
  function crusader() {
    // two outward-pointing chevrons each side
    both([[2, 28], [19, 9], [26, 9], [11, 28], [26, 47], [19, 47]], R.steel);
    both([[12, 28], [22, 16], [28, 16], [20, 28], [28, 40], [22, 40]], R.steel);
    layer(diamond(32, 28, 15, 22, 3.5), R.steel);
    layer(diamond(32, 28, 12.5, 19.5, 3), R.teal);
    layer(diamond(32, 28, 7, 12), R.teal, { noline: false });
    layer(diamond(32, 28, 4, 7), R.ink, { flat: true });
    layer([[32, 22], [34.5, 28], [32, 34], [29.5, 28]], R.gold, { flat: true });
    px(32, 27, '#fff4a8');
    both([[3, 25], [3, 31], [5, 28]], R.goldlt, { noline: true, flat: true });
  }
  function archon() {
    layer([[19, 3], [45, 3], [45, 44], [32, 55], [19, 44]], R.inkgreen);
    layer([[22, 6], [42, 6], [42, 42], [32, 51], [22, 42]], R.ink, { flat: true });
    // golden laurel crescents
    for (let i = 0; i < 8; i++) {
      const th = (100 + i * 21) * RAD, cx = 33, cy = 29, r = 21 - Math.abs(i - 3) * 0.6;
      const x = cx + Math.cos(th) * r, y = cy + Math.sin(th) * r, ang = th / RAD + 90 + 12;
      layer(leaf(x, y, 7.2, 3.1, ang), R.gold);
      layer(leaf(mx(x), y, 7.2, 3.1, 180 - ang), R.gold);
    }
    layer(star(32, 27, 4, 15, 4, -90), R.steel);
    layer(star(32, 27, 4, 8, 3, -45), R.steel, { noline: true });
    gem(32, 27, 4, R.teal);
    px(32, 10, '#ffffff');
  }
  function legend() {
    layer([[20, 3], [44, 3], [44, 43], [32, 53], [20, 43]], R.purpleban);
    layer([[23, 6], [41, 6], [41, 41], [32, 49], [23, 41]], R.ink, { flat: true });
    wings(25, 25, [[[-66, -46, -26, -6, 14, 32], [18, 23, 25, 25, 22, 17], 7.5]], R.gold);
    layer(diamond(32, 26, 13, 18, 3), R.gold);
    layer(diamond(32, 26, 9.5, 14, 2.5), R.ink, { flat: true });
    // crimson flower
    [[0, -5.2], [5.2, 0], [0, 5.2], [-5.2, 0]].forEach(p => layer(disc(32 + p[0], 26 + p[1], 3.4), R.crimson));
    gem(32, 26, 3, R.fire);
    // sword point
    layer([[28.5, 41], [35.5, 41], [34, 47], [32, 56], [30, 47]], R.goldlt);
    layer([[26, 42], [38, 42], [38, 44], [26, 44]], R.gold);
  }
  const ANGELS = [
    [[-62, -44, -26, -8, 10, 28, 46], [27, 30, 31, 30, 28, 23, 17], 9],
    [[-50, -30, -10, 10, 28, 46], [20, 22, 22, 21, 17, 12], 8, R.wingdk],
  ];
  function ancient() {
    wings(25, 26, ANGELS, R.wing);
    layer([[21, 3], [43, 3], [43, 43], [32, 51], [21, 43]], R.purpleban);
    layer([[24, 6], [40, 6], [40, 41], [32, 47], [24, 41]], R.ink, { flat: true });
    layer([[26, 45], [38, 45], [32, 56]], R.goldlt);
    layer([[20, 3], [44, 3], [44, 8], [20, 8]], R.gold);
    layer(star(32, 26, 8, 13, 6.2, -90), R.violet);
    layer(star(32, 26, 4, 8, 4, -90), R.violet, { noline: true });
    gem(32, 26, 3.8, R.pink);
  }
  function divine() {
    wings(24, 28, ANGELS.map(r => [r[0].map(a => a), r[1].map(l => l + 3), r[2] + 1, r[3]]), R.wing);
    layer([[22, 4], [42, 4], [42, 44], [32, 54], [22, 44]], R.ink);
    layer([[25, 7], [39, 7], [39, 42], [32, 49], [25, 42]], R.purpleban, { flat: true });
    layer([[30.2, 26], [33.8, 26], [33.8, 46], [32, 54], [30.2, 46]], R.orb);
    layer(fn((x, y) => Math.abs(x - 32) / 7 + Math.abs(y - 31) / 3.2 <= 1), R.orb);
    layer(fn((x, y) => Math.abs(x - 32) / 4.5 + Math.abs(y - 40) / 2.4 <= 1), R.orb);
    gem(32, 19, 8.2, R.orb);
    px(29, 15, '#ffffff'); px(30, 14, '#ffffff'); px(29, 16, '#ffffe0');
    layer(diamond(32, 8, 2.6, 3.6), R.goldlt);
  }
  function immortal() {
    aura(32, 22, 30, 28, [R.fire[2], R.fire[3], R.fire[4]], 0.85);
    wings(24, 32, ANGELS.map(r => [r[0], r[1].map(l => l + 3), r[2] + 1, r[3]]), R.wing);
    // flaming crown: big red/orange tongues, small yellow ones inside
    [[17, 13, 9], [24, 5, 10], [32, 0, 11], [40, 5, 10], [47, 13, 9]].forEach((f, i) => {
      const x = f[0], t = f[1], w = f[2], l = i & 1 ? 1 : -1;
      layer([[x - w / 2, 31], [x - w / 2 - 0.5 * l, t + 12], [x - 1.5, t + 5], [x + 0.5 * l, t], [x + 2, t + 7], [x + w / 2 + 0.5 * l, t + 13], [x + w / 2, 31]], R.flame);
    });
    [[24, 11, 4], [32, 6, 5], [40, 11, 4]].forEach(f => layer([[f[0] - f[2] / 2, 26], [f[0], f[1]], [f[0] + f[2] / 2, 26]], R.fire, { noline: true, flat: true }));
    layer(diamond(32, 35, 14, 19, 3), R.gold);
    layer(diamond(32, 35, 10, 15, 2.5), R.crimson);
    layer(star(32, 35, 4, 9, 3.2, -90), R.fire, { noline: true });
    gem(32, 35, 4.4, R.fire);
    gem(32, 19, 2.4, R.crimson);
    layer([[29, 52], [35, 52], [32, 60]], R.goldlt);
  }
  const TIER = [herald, guardian, crusader, archon, legend, ancient, divine, immortal];

  // 9x9 star bitmap
  const STAR = ['....#....', '....#....', '...###...', '#########', '.#######.', '..#####..', '..#####..', '.###.###.', '.##...##.'];
  function stars(n) {
    const w = 10, x0 = Math.round(32 - (n * w - 1) / 2), y0 = 55;
    for (let k = 0; k < n; k++) {
      const m = new Uint8Array(N * N);
      for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (STAR[y][x] === '#') m[(y0 + y) * N + x0 + k * w + x] = 1;
      paint(m, R.goldlt, { flat: false });
    }
  }

  // ---- public
  const cache = new Map();
  function base(tier, nst) {
    const key = tier + '|' + nst;
    let c = cache.get(key);
    if (c) return c;
    buf = new Array(N * N).fill(null);
    TIER[tier]();
    if (tier < 7 && nst > 0) stars(Math.min(5, nst));
    c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d');
    for (let i = 0; i < N * N; i++) if (buf[i]) { x.fillStyle = buf[i]; x.fillRect(i % N, (i / N) | 0, 1, 1); }
    cache.set(key, c);
    return c;
  }
  function canvas(tier, nst, size) {
    tier = Math.max(0, Math.min(7, tier | 0)); nst = tier === 7 ? 0 : Math.max(0, Math.min(5, nst | 0)); size = size | 0 || 64;
    const key = 's' + tier + '|' + nst + '|' + size;
    let c = cache.get(key);
    if (c) return c;
    const b = base(tier, nst);
    if (size === N) return b;
    c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    x.drawImage(b, 0, 0, size, size);
    cache.set(key, c);
    return c;
  }

  // HUD pip: 16x16 hand-built mini badge (tier colour diamond + star pips)
  const PIPC = [R.bronze, R.steel, R.teal, R.gold, R.crimson, R.violet, R.wing, R.fire];
  function pip(tier, size) {
    tier = Math.max(0, Math.min(7, tier | 0)); size = size | 0 || 18;
    const key = 'p' + tier + '|' + size;
    let c = cache.get(key);
    if (c) return c;
    buf = new Array(N * N).fill(null);
    const rp = PIPC[tier];
    if (tier >= 2) { both([[1, 8], [5, 4], [7, 4], [4, 8], [7, 12], [5, 12]], tier >= 6 ? R.wing : R.steel); }
    paint(poly(diamond(8, 8, 6, 7)), rp);
    paint(poly(diamond(8, 8, 3, 3.6)), tier === 6 ? R.orb : tier === 7 ? R.fire : R.ink, { flat: true });
    if (tier === 7) { px(8, 1, R.fire[2]); px(7, 0, R.fire[3]); px(9, 0, R.fire[3]); }
    const small = document.createElement('canvas'); small.width = small.height = 16;
    const x = small.getContext('2d');
    for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 16; xx++) { const v = buf[yy * N + xx]; if (v) { x.fillStyle = v; x.fillRect(xx, yy, 1, 1); } }
    c = document.createElement('canvas'); c.width = c.height = size;
    const y2 = c.getContext('2d'); y2.imageSmoothingEnabled = false; y2.drawImage(small, 0, 0, size, size);
    cache.set(key, c);
    return c;
  }

  function name(tier) { const k = 'rank.' + IDS[tier]; return IT.hasT && IT.hasT(k) ? IT.t(k) : NAMES[tier]; }
  // DOM: medal canvas + rank name (+ optional label line). rating -> IT.Ranks.fromRating
  function el(rating, size, label) {
    const r = IT.Ranks.fromRating(rating);
    const d = document.createElement('div');
    d.className = 'medal'; d.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;gap:2px;text-align:center';
    const c = canvas(r.tier, r.stars, size || 64);
    const cv = document.createElement('canvas'); cv.width = cv.height = c.width; cv.className = 'medal-cv';
    cv.style.cssText = 'image-rendering:pixelated;width:' + c.width + 'px;height:' + c.height + 'px';
    cv.getContext('2d').drawImage(c, 0, 0);
    const n = document.createElement('span'); n.className = 'medal-name'; n.textContent = name(r.tier) + (r.stars ? ' ' + r.stars : '');
    d.append(cv, n);
    if (label) { const l = document.createElement('span'); l.className = 'medal-label'; l.textContent = label; d.appendChild(l); }
    return d;
  }

  IT.Medals = { canvas, pip, el, name, NAMES, IDS };
})(typeof window !== 'undefined' ? window : globalThis);
