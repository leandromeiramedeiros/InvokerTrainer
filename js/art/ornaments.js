// HUD / menu ornaments (v6 WP9): procedural pixel-art frames, ribbons, rules, gem caps, in our palette (dark plum, bronze / gold metal, magenta gems).
// Everything is built once at load into data URLs and published as CSS custom properties on :root (--orn-*), used by css/*.css through
// border-image (9-slice) and background-image, rendered with image-rendering:pixelated at integer scales (--fs).
//   IT.Ornaments.build(name) -> { w, h, px: Uint8ClampedArray RGBA }   (pure, no DOM; used by tests)
//   IT.Ornaments.names        -> list of asset names
//   IT.Ornaments.url(name)    -> cached data URL (browser only), IT.Ornaments.apply() publishes the CSS variables
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};

  const K = '#120a1c';   // outline
  const METAL = {
    bronze: { a: '#f3c568', b: '#c98a36', c: '#7a4a1e', w: '#fff0b8' },
    gold: { a: '#fff3a8', b: '#ffd23f', c: '#b4780f', w: '#ffffff' },
  };
  const GEM = {   // d dark, g body, G light
    mag: { d: '#5c0f58', g: '#e82bc0', G: '#ffc4f2' },
    gold: { d: '#8a5200', g: '#ffc22a', G: '#fff6bf' },
    red: { d: '#5a0a14', g: '#e8303e', G: '#ffb4ba' },
    grn: { d: '#0f4a24', g: '#3fd070', G: '#c8ffd8' },
    blu: { d: '#10307a', g: '#3a7cff', G: '#c0d8ff' },
  };
  const FABRIC = {   // ribbon: hi / body / dark / trim, tail = the darker folded part behind
    plum: { hi: '#5b3a9a', body: '#3a2270', dark: '#241447', trim: '#e0a840', t: ['#352068', '#241447', '#150a2c'] },
    mag: { hi: '#e24cba', body: '#a01c86', dark: '#5e0f50', trim: '#ffd23f', t: ['#8a1a72', '#5e0f50', '#33082d'] },
  };
  const HAIR = '#6a3d8f';

  const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  function Img(w, h) {
    const px = new Uint8ClampedArray(w * h * 4);
    return {
      w, h, px,
      set(x, y, c, a) { if (x < 0 || y < 0 || x >= w || y >= h) return; const k = (y * w + x) * 4, v = hex(c); px[k] = v[0]; px[k + 1] = v[1]; px[k + 2] = v[2]; px[k + 3] = a === undefined ? 255 : a; },
      has(x, y) { return x >= 0 && y >= 0 && x < w && y < h && px[(y * w + x) * 4 + 3] > 0; },
    };
  }
  // ---- 9-slice frame. c = corner size, e = edge thickness, boss = corner boss size, mid = repeating middle length.
  function frame(o) {
    const c = o.c, e = o.e, boss = o.boss, mid = o.mid || 17, S = 2 * c + mid, img = Img(S, S), M = o.metal || METAL.bronze;
    const dist = (X, Y) => [Math.min(X, S - 1 - X), Math.min(Y, S - 1 - Y)];
    const inM = (X, Y) => { if (X < 0 || Y < 0 || X >= S || Y >= S) return false; const [dx, dy] = dist(X, Y); return dx < e || dy < e || (dx < boss && dy < boss); };
    // shading: outline = mask pixel with a 4-neighbour outside; the pixel next to an outline on top / left is light, bottom / right dark
    const isOut = (X, Y) => inM(X, Y) && !(inM(X - 1, Y) && inM(X + 1, Y) && inM(X, Y - 1) && inM(X, Y + 1));
    for (let Y = 0; Y < S; Y++) for (let X = 0; X < S; X++) {
      if (!inM(X, Y)) continue;
      if (isOut(X, Y)) { img.set(X, Y, K); continue; }
      const hiN = isOut(X, Y - 1) || isOut(X - 1, Y), loN = isOut(X, Y + 1) || isOut(X + 1, Y);
      img.set(X, Y, hiN && !loN ? M.a : loN && !hiN ? M.c : M.b);
    }
    const along = S >> 1;   // centre of the middle tile
    if (o.rivets) {   // studs on the four edges, centre row of the band
      const r = e >> 1;
      const stud = (x, y) => { img.set(x, y, M.a); img.set(x - 1, y, M.c); img.set(x + 1, y, M.c); img.set(x, y - 1, M.c); img.set(x, y + 1, M.c); };
      stud(along, r); stud(along, S - 1 - r); stud(r, along); stud(S - 1 - r, along);
    } else if (o.glint) {   // thin frames: one bright pixel per edge tile
      img.set(along, 1, M.w); img.set(along, S - 2, M.b); img.set(1, along, M.w); img.set(S - 2, along, M.b);
    }
    if (o.hair) {   // inner violet hairline + soft shadow row, only on the straight run between the bosses
      for (let t = boss + 1; t < S - boss - 1; t++) {
        for (const [x, y, sx, sy] of [[t, e + 1, t, e + 2], [t, S - 2 - e, t, S - 3 - e], [e + 1, t, e + 2, t], [S - 2 - e, t, S - 3 - e, t]]) {
          img.set(x, y, HAIR); img.set(sx, sy, '#000000', 80);
        }
      }
    }
    if (o.gem) {   // gem set in every corner boss
      const G = o.gem, mid3 = (boss - 1) >> 1;   // centre pixel of the boss
      const cx = mid3, cy = mid3;
      for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const fx = sx ? -1 : 1, fy = sy ? -1 : 1, X = sx ? S - 1 : 0, Y = sy ? S - 1 : 0;
        const P = (dx, dy, col) => img.set(X + fx * dx, Y + fy * dy, col);
        if (o.ring) for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (Math.max(Math.abs(i), Math.abs(j)) === 2) P(cx + i, cy + j, K);
        if (o.gemSize === 1) { P(cx, cy, G.g); continue; }
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          // light from the top-left of the image, whatever the corner: pick the colour by absolute direction
          const ax = i * fx, ay = j * fy;
          P(cx + i, cy + j, ax === -1 && ay === -1 ? G.G : ax + ay >= 1 ? G.d : G.g);
        }
      }
    }
    return img;
  }

  // ---- ribbon: left tail (T) | tile (Mw) | right tail (T), height 16. The front band is 13 rows; the tails are the darker folded ends behind it, swallow-tailed.
  function ribbon(F) {
    const T = 14, Mw = 12, W = 2 * T + Mw, H = 16, img = Img(W, H);
    const band = (x, y) => x >= T - 4 && x < W - T + 4 && y >= 0 && y <= 12;
    const tail = (x, y) => {
      if (y < 3 || y > 15) return false;
      const xx = x < T ? x : x >= W - T ? W - 1 - x : -1;
      if (xx < 0) return false;
      return Math.abs(y - 9) > 5 - xx;   // V notch at the outer end
    };
    // tails first
    const tOut = (x, y) => tail(x, y) && !(tail(x - 1, y) && tail(x + 1, y) && tail(x, y - 1) && tail(x, y + 1));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!tail(x, y)) continue;
      if (tOut(x, y)) img.set(x, y, K);
      else img.set(x, y, tOut(x, y - 1) ? F.t[0] : tOut(x, y + 1) ? F.t[2] : F.t[1]);
    }
    // front band
    for (let y = 0; y <= 12; y++) for (let x = T - 4; x < W - T + 4; x++) {
      const end = x === T - 4 || x === W - T + 3;
      let col;
      if (y === 0 || y === 12 || end) col = K;
      else if (y === 1) col = F.hi;
      else if (y === 2 || y === 10) col = F.trim;
      else if (y === 11) col = F.dark;
      else col = F.body;
      img.set(x, y, col);
    }
    // stitch glints on the body rows
    for (let x = T; x < W - T; x += 4) img.set(x, 6, F.hi);
    // trim end studs
    for (const x of [T - 3, W - T + 2]) { img.set(x, 2, METAL.gold.w); img.set(x, 10, METAL.gold.w); }
    return img;
  }

  // ---- horizontal rule: diamond cap | line tile | diamond cap, height 7 (cap 9, tile 4)
  function rule(G) {
    const C = 9, Mw = 4, W = 2 * C + Mw, H = 7, img = Img(W, H);
    for (let x = C; x < W - C; x++) { img.set(x, 2, K); img.set(x, 3, METAL.bronze.b); img.set(x, 4, K); }
    img.set(C, 3, METAL.bronze.a); img.set(C + 2, 3, METAL.bronze.a);
    for (const side of [0, 1]) {
      const P = (x, y, c) => img.set(side ? W - 1 - x : x, y, c);
      // diamond 7x7 at x0..6 (centre x3), then a small tick
      for (let y = 0; y < 7; y++) { const hw = 3 - Math.abs(3 - y); for (let x = 3 - hw; x <= 3 + hw; x++) { const edge = x === 3 - hw || x === 3 + hw; P(x, y, edge ? K : (hw >= 2 && y < 3 && x <= 3 ? G.G : y > 3 ? G.d : G.g)); } }
      P(7, 3, METAL.bronze.c); P(8, 3, METAL.bronze.b); P(7, 2, K); P(7, 4, K); P(8, 2, K); P(8, 4, K);
    }
    return img;
  }

  // ---- bar end cap: bronze clasp 9x15 with a round gem (left end; the right end is this mirrored with scaleX(-1))
  function cap(G) {
    const W = 9, H = 15, img = Img(W, H);
    const inM = (x, y) => x >= 0 && x < W && y >= 0 && y < H && !((x < 2 && (y < 2 - x || y > H - 3 + x)));
    const isOut = (x, y) => inM(x, y) && !(inM(x - 1, y) && inM(x + 1, y) && inM(x, y - 1) && inM(x, y + 1));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!inM(x, y)) continue;
      if (isOut(x, y)) { img.set(x, y, K); continue; }
      const hi = isOut(x, y - 1) || isOut(x - 1, y), lo = isOut(x, y + 1) || isOut(x + 1, y);
      img.set(x, y, hi && !lo ? METAL.bronze.a : lo && !hi ? METAL.bronze.c : METAL.bronze.b);
    }
    // gem: ring + 5x5 rounded gem at the centre (4, 7)
    for (let y = 4; y <= 10; y++) for (let x = 1; x <= 7; x++) { const d = Math.hypot(x - 4, y - 7); if (d <= 3.4) img.set(x, y, K); }
    for (let y = 5; y <= 9; y++) for (let x = 2; x <= 6; x++) { if (Math.abs(x - 4) === 2 && Math.abs(y - 7) === 2) continue; img.set(x, y, x + y >= 12 ? G.d : G.g); }
    img.set(3, 6, G.G); img.set(4, 6, G.G); img.set(3, 7, G.G);
    return img;
  }

  // ---- small diamond gem 7x7 (nav marker / bullets)
  function gem(G) {
    const img = Img(7, 7);
    for (let y = 0; y < 7; y++) { const hw = 3 - Math.abs(3 - y); for (let x = 3 - hw; x <= 3 + hw; x++) { const edge = x === 3 - hw || x === 3 + hw; img.set(x, y, edge ? K : (y < 3 && x <= 3 ? G.G : y > 3 ? G.d : G.g)); } }
    return img;
  }

  // ---- faint engraved weave for panel interiors (4x4)
  function tex() {
    const img = Img(4, 4);
    img.set(0, 0, '#ffffff', 10); img.set(2, 2, '#000000', 34); img.set(1, 3, '#ffffff', 6); img.set(3, 1, '#000000', 18);
    return img;
  }

  const FR = { c: 12, e: 5, boss: 9, rivets: true, hair: true, gem: GEM.mag, ring: true };
  const TH = { c: 8, e: 4, boss: 7, glint: true, gem: GEM.mag };
  const MN = { c: 5, e: 3, boss: 5, glint: false, gem: GEM.mag, gemSize: 1 };
  const SPEC = {
    frame: () => frame(FR),
    'frame-gold': () => frame(Object.assign({}, FR, { metal: METAL.gold, gem: GEM.gold })),
    'frame-red': () => frame(Object.assign({}, FR, { gem: GEM.red })),
    thin: () => frame(TH),
    'thin-gold': () => frame(Object.assign({}, TH, { metal: METAL.gold, gem: GEM.gold })),
    'thin-red': () => frame(Object.assign({}, TH, { gem: GEM.red })),
    mini: () => frame(MN),
    'mini-gold': () => frame(Object.assign({}, MN, { metal: METAL.gold, gem: GEM.gold })),
    'mini-red': () => frame(Object.assign({}, MN, { gem: GEM.red })),
    'mini-grn': () => frame(Object.assign({}, MN, { gem: GEM.grn })),
    'rib-plum': () => ribbon(FABRIC.plum),
    'rib-mag': () => ribbon(FABRIC.mag),
    rule: () => rule(GEM.mag),
    'rule-gold': () => rule(GEM.gold),
    'cap-hp': () => cap(GEM.grn),
    'cap-mp': () => cap(GEM.blu),
    'cap-foe': () => cap(GEM.red),
    'gem-mag': () => gem(GEM.mag),
    'gem-gold': () => gem(GEM.gold),
    tex: () => tex(),
  };
  const names = Object.keys(SPEC);
  const built = {}, urls = {};
  function build(name) { if (!SPEC[name]) throw new Error('ornament: ' + name); return built[name] || (built[name] = SPEC[name]()); }
  function url(name) {
    if (urls[name]) return urls[name];
    const doc = G.document; if (!doc || !doc.createElement) return '';
    const im = build(name), cv = doc.createElement('canvas'); cv.width = im.w; cv.height = im.h;
    const cx = cv.getContext('2d'); if (!cx) return '';
    cx.putImageData(new ImageData(im.px, im.w, im.h), 0, 0);
    return (urls[name] = cv.toDataURL('image/png'));
  }
  function apply() {
    const doc = G.document; if (!doc || !doc.documentElement) return false;
    const st = doc.documentElement.style;
    for (const n of names) { const u = url(n); if (u) st.setProperty('--orn-' + n, 'url("' + u + '")'); }
    return true;
  }
  IT.Ornaments = { names, build, url, apply };
  try { apply(); } catch (e) { /* ornaments are decoration: plain borders remain */ }
})(typeof window !== 'undefined' ? window : globalThis);
