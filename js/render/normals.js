// v6 #76 L2: normal/height G-buffer sources (docs/LIGHTING-v6.md). Pure typed-array code (node-testable); canvases are lazy.
// Texel: RG = normal xy (n*0.5+0.5)*255, screen space (+x right, +y DOWN; z = sqrt(1-x^2-y^2) implied), B = height 0..255,
// A = material*85 (0 ground, 85 unit, 170 tree/cliff, 255 emissive). Fully transparent sprite pixels are 0,0,0,0.
// NOTE: a 2D canvas premultiplies, so alpha 0 (ground) would lose RG/B: upload `.data` (raw RGBA) to GL, treat `.canvas()` as debug.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const MAT = { ground: 0, unit: 1, tree: 2, emissive: 3 };
  const BIG = 9999, THRESH = 128;
  const now = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const enc = v => Math.round((v * 0.5 + 0.5) * 255);

  // 8SSEDT: per-pixel offset (dx,dy) to the nearest source pixel (src[i] = 1). Image border counts as non-source.
  function edt(src, W, H) {
    const gx = new Int16Array(W * H), gy = new Int16Array(W * H);
    for (let i = 0; i < W * H; i++) { if (!src[i]) { gx[i] = BIG; gy[i] = BIG; } }
    const cmp = (x, y, ox, oy) => {
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
      const j = ny * W + nx, ax = gx[j] + ox, ay = gy[j] + oy, i = y * W + x;
      if (gx[j] >= BIG) return;
      if (ax * ax + ay * ay < gx[i] * gx[i] + gy[i] * gy[i]) { gx[i] = ax; gy[i] = ay; }
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) { cmp(x, y, -1, 0); cmp(x, y, 0, -1); cmp(x, y, -1, -1); cmp(x, y, 1, -1); }
      for (let x = W - 1; x >= 0; x--) cmp(x, y, 1, 0);
    }
    for (let y = H - 1; y >= 0; y--) {
      for (let x = W - 1; x >= 0; x--) { cmp(x, y, 1, 0); cmp(x, y, 0, 1); cmp(x, y, -1, 1); cmp(x, y, 1, 1); }
      for (let x = 0; x < W; x++) cmp(x, y, -1, 0);
    }
    const d = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) d[i] = gx[i] >= BIG ? BIG : Math.sqrt(gx[i] * gx[i] + gy[i] * gy[i]);
    return d;
  }

  // Signed distance (Float32Array w*h): > 0 inside the silhouette (alpha >= 128), < 0 outside, ~0.5 at the boundary pixels. The frame border counts
  // as outside (a sprite touching the frame still slopes down there). alpha: array/typed array of 0..255.
  function sdf(alpha, w, h) {
    const W = w + 2, H = h + 2, ins = new Uint8Array(W * H), out = new Uint8Array(W * H);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const a = alpha[y * w + x] >= THRESH ? 1 : 0, i = (y + 1) * W + x + 1;
      ins[i] = a; out[i] = a ? 0 : 1;
    }
    for (let x = 0; x < W; x++) { out[x] = 1; out[(H - 1) * W + x] = 1; }
    for (let y = 0; y < H; y++) { out[y * W] = 1; out[y * W + W - 1] = 1; }
    const dIn = edt(out, W, H), dOut = edt(ins, W, H), s = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y + 1) * W + x + 1;
      s[y * w + x] = ins[i] ? dIn[i] - 0.5 : -(Math.min(dOut[i], 60) - 0.5);
    }
    return s;
  }

  // "Pillow" normal map of one frame: dome profile over the silhouette distance. opts: material (1), maxR (10: dome radius cap in px, bigger
  // sprites get a flat top), height (1: scales B). Returns Uint8ClampedArray w*h*4 (see the encoding at the top).
  function pillow(alpha, w, h, opts) {
    const o = opts || {}, mat = ((o.material == null ? MAT.unit : o.material) * 85) | 0, maxR = o.maxR || 10, hk = o.height == null ? 1 : o.height;
    const out = new Uint8ClampedArray(w * h * 4), s = sdf(alpha, w, h);
    let dmax = 0;
    for (let i = 0; i < s.length; i++) if (s[i] > dmax) dmax = s[i];
    if (dmax <= 0) return out;
    const R = Math.max(1, Math.min(dmax, maxR));
    // 3x3 box blur of the field for a stable gradient (outside values are clamped so far-away pixels do not dominate)
    const sm = new Float32Array(w * h), at = (x, y) => s[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let a = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) a += Math.max(-3, at(x + i, y + j));
      sm[y * w + x] = a / 9;
    }
    const sat = (x, y) => sm[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const d = s[y * w + x], p = (y * w + x) * 4;
      if (d <= 0) continue;
      const t = Math.min(1, d / R), k = 1 - t;                       // sphere: tilt sin = 1-t, height sqrt(1-(1-t)^2)
      let gx = sat(x + 1, y) - sat(x - 1, y), gy = sat(x, y + 1) - sat(x, y - 1);
      const gl = Math.hypot(gx, gy);
      if (gl > 1e-4) { gx /= gl; gy /= gl; } else { gx = 0; gy = 0; }
      const nx = -gx * k, ny = -gy * k;                              // gradient points inward: the normal points to the nearest edge
      out[p] = enc(nx); out[p + 1] = enc(ny);
      out[p + 2] = Math.round(Math.sqrt(1 - k * k) * hk * 255);
      out[p + 3] = mat || 85;
    }
    return out;
  }

  // ---- sheets: normals packed in one atlas (shelf packing), albedo atlas built lazily in the same layout
  function pack(sizes, maxW) {
    maxW = maxW || 1024;
    const rects = {}; let x = 0, y = 0, rowH = 0, W = 0;
    for (const s of sizes) {
      if (x + s.w + 1 > maxW && x > 0) { y += rowH + 1; x = 0; rowH = 0; }
      rects[s.key] = { x, y, w: s.w, h: s.h };
      x += s.w + 1; if (s.h > rowH) rowH = s.h; if (x > W) W = x;
    }
    return { rects, w: Math.max(1, W), h: Math.max(1, y + rowH) };
  }
  const alphaOf = (rows, pal) => {
    const w = rows[0].length, h = rows.length, a = new Uint8Array(w * h), lut = {};
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = rows[y][x]; if (ch === '.') continue;
      let v = lut[ch];
      if (v === undefined) { const c = pal[ch] || ''; v = lut[ch] = c.length > 7 ? parseInt(c.slice(7, 9), 16) : 255; }
      a[y * w + x] = v;
    }
    return a;
  };
  const sheetCache = new WeakMap();
  function mkCanvas(w, h) { if (typeof document === 'undefined') return null; const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // forSheet(nameOrDef, opts): { w, h, rects: {key:{x,y,w,h}}, data (RGBA normals), image {data,width,height}, ms, uv(key), canvas(), albedo() }.
  // The same rect indexes the normal atlas and the albedo atlas. West-facing frames are mirrored east frames: flip x in the sampler and negate normal.x.
  function forSheet(sheet, opts) {
    const def = typeof sheet === 'string' ? (IT.Art && IT.Art.sheets[sheet]) : sheet;
    if (!def || !def.frames) return null;
    let c = sheetCache.get(def); if (c) return c;
    const t0 = now(), keys = Object.keys(def.frames), o = opts || {};
    const sizes = keys.map(k => ({ key: k, w: def.frames[k][0].length, h: def.frames[k].length }));
    const L = pack(sizes, o.maxW), data = new Uint8ClampedArray(L.w * L.h * 4);
    for (const k of keys) {
      const rows = def.frames[k], r = L.rects[k], px = pillow(alphaOf(rows, def.pal), r.w, r.h, o);
      for (let y = 0; y < r.h; y++) data.set(px.subarray(y * r.w * 4, (y + 1) * r.w * 4), ((r.y + y) * L.w + r.x) * 4);
    }
    let nc = null, ac = null;
    c = {
      w: L.w, h: L.h, rects: L.rects, data, image: { data, width: L.w, height: L.h }, ms: now() - t0,
      uv: k => { const r = L.rects[k]; return r && [r.x / L.w, r.y / L.h, (r.x + r.w) / L.w, (r.y + r.h) / L.h]; },
      canvas() {   // debug view only (premultiplied)
        if (nc || !(nc = mkCanvas(L.w, L.h))) return nc;
        const x = nc.getContext('2d'), id = x.createImageData(L.w, L.h); id.data.set(data); x.putImageData(id, 0, 0); return nc;
      },
      albedo() {
        if (ac || !(ac = mkCanvas(L.w, L.h))) return ac;
        const x = ac.getContext('2d');
        for (const k of keys) {
          const rows = def.frames[k], r = L.rects[k];
          for (let y = 0; y < r.h; y++) for (let xx = 0; xx < r.w; xx++) { const ch = rows[y][xx]; if (ch === '.') continue; x.fillStyle = def.pal[ch]; x.fillRect(r.x + xx, r.y + y, 1, 1); }
        }
        return ac;
      },
    };
    sheetCache.set(def, c);
    return c;
  }
  // Pillow data for an arbitrary canvas (baked trees etc.): { w, h, data, image }; browser only.
  function fromCanvas(cv, opts) {
    const w = cv.width, h = cv.height, src = cv.getContext('2d').getImageData(0, 0, w, h).data, a = new Uint8Array(w * h);
    for (let i = 0; i < a.length; i++) a[i] = src[i * 4 + 3];
    const data = pillow(a, w, h, opts || { material: MAT.tree });
    return { w, h, data, image: { data, width: w, height: h } };
  }
  // sheets are only worth baking while the lighting pass is on
  const active = () => !!(IT.Lights && IT.Lights.enabled);

  // ---- terrain
  // Pure: { nx, ny, h, mat } of one tile. nx/ny in -1..1 (tilt toward the LOWER tier), h = elevation tier / maxE (0..1), mat 0 ground / 2 rock.
  function tileNormal(map, tx, ty, maxE) {
    const TR = IT.Terrain, E = TR.EDGE, f = TR.edgeFlags(map, tx, ty), t = map.at(tx, ty), e = map.elevTile(tx, ty);
    let vx = 0, vy = 0, mag = 0.75, h = e / maxE, mat = 0;
    if (t === 2) {
      mat = 2;
      if (f & (E.FACE_S | E.LIP_N)) vy += 1;
      if (f & (E.FOOT_N | E.LIP_S)) vy -= 1;
      if (f & (E.LIP_W | E.FACE_E)) vx += 1;
      if (f & (E.FOOT_W | E.LIP_E)) vx -= 1;
      let hi = -1;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) if (map.at(tx + dx, ty + dy) !== 2) hi = Math.max(hi, map.elevTile(tx + dx, ty + dy));
      if (hi < 0) hi = e;
      h = (hi - ((f & (E.FACE_S | E.FOOT_N | E.FOOT_W | E.FACE_E)) ? 0.5 : 0)) / maxE;
    } else if (f & E.RAMP) {
      const d = TR.rampDir(map, tx, ty); vx = d[0]; vy = d[1]; mag = 0.45;
    } else {
      mag = 0.5;
      if (f & E.HI_N) vy -= 1; if (f & E.HI_S) vy += 1; if (f & E.HI_W) vx -= 1; if (f & E.HI_E) vx += 1;
    }
    const l = Math.hypot(vx, vy);
    return { nx: l ? vx / l * mag : 0, ny: l ? vy / l * mag : 0, h: Math.max(0, Math.min(1, h)), mat };
  }
  // Terrain normal/height buffer for a built terrain (info = IT.Terrain.build result: { W, H, T }); cached ON `info`, so it lives and dies with the
  // terrain canvas (render.js rebuilds `ter` on a map change/zoom). Returns { w, h, data, image, maxE, ms, canvas() }; same pixel grid as ter.base.
  function terrain(map, info) {
    if (info && info._normals) return info._normals;
    const t0 = now(), T = info.T, W = info.W, H = info.H, MW = map.w, MH = map.h, data = new Uint8ClampedArray(W * H * 4);
    let maxE = 1;
    for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) { const e = map.elevTile(tx, ty); if (e > maxE) maxE = e; }
    const px = new Uint8ClampedArray(4);
    for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) {
      const n = tileNormal(map, tx, ty, maxE);
      px[0] = enc(n.nx); px[1] = enc(n.ny); px[2] = Math.round(n.h * 255); px[3] = n.mat * 85;
      for (let y = 0; y < T; y++) {
        let p = ((ty * T + y) * W + tx * T) * 4;
        for (let x = 0; x < T; x++, p += 4) { data[p] = px[0]; data[p + 1] = px[1]; data[p + 2] = px[2]; data[p + 3] = px[3]; }
      }
    }
    let cv = null;
    const r = {
      w: W, h: H, data, image: { data, width: W, height: H }, maxE, ms: now() - t0,
      canvas() { if (cv || !(cv = mkCanvas(W, H))) return cv; const x = cv.getContext('2d'), id = x.createImageData(W, H); id.data.set(data); x.putImageData(id, 0, 0); return cv; },
    };
    info._normals = r;
    return r;
  }

  IT.Normals = { sdf, pillow, forSheet, fromCanvas, terrain, tileNormal, pack, active, MAT, enc };
})(typeof window !== 'undefined' ? window : globalThis);
