// v6 #76 L1: world-space point-light list for the dynamic lighting pass (L3). Emitters register {x,y,z,r,g,b,radius,intensity,kind} per
// frame; list() culls + sorts by screen contribution, uniforms() packs <= 48 lights into flat Float32Arrays. All of it is a no-op while
// IT.Lights.enabled is false (default; the 2D cell lights in light.js stay the look until L5). World units; z = height above ground.
// Art direction (#76b): EXORT strongest (warm orange-gold, big, flickers), WEX strong (violet + white strobes, irregular), QUAS faint steady cool blue.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const MAXL = 48, POOL = 256;   // MAXL = IT.GL.MAXL (Ultra)
  const cl = (v, a, b) => v < a ? a : v > b ? b : v;
  // colours 0..1; base = intensity at full strength; rad = radius multiplier (world radius is given by the emitter)
  const ELEM = {
    exort: { r: 1.0, g: 0.6, b: 0.2, base: 1.0, rad: 1.0 },
    wex:   { r: 0.66, g: 0.36, b: 1.0, base: 0.5, rad: 0.75 },
    quas:  { r: 0.35, g: 0.68, b: 1.0, base: 0.2, rad: 0.6 },
  };
  const pool = []; let n = 0, stamp = null;
  for (let i = 0; i < POOL; i++) pool.push({ x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, radius: 0, intensity: 0, kind: '', score: 0 });

  // deterministic hash 0..1
  function hash(a, b) { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); }
  // Exort: fiery 0.7..1 wobble (incommensurate sines + a hash jitter)
  function flicker(t, seed) {
    seed = seed || 0;
    const v = 0.85 + 0.07 * Math.sin(t * 11.3 + seed) + 0.05 * Math.sin(t * 23.7 + seed * 2.1) + 0.04 * (hash(Math.floor(t * 18), seed) - 0.5) * 2;
    return cl(v, 0, 1);
  }
  // Wex: low pulsing base (0.2..0.35) + short bright bursts at irregular times (slots 0.13 s, ~45 % active, random strength)
  function strobe(t, seed) {
    seed = seed || 0;
    const u = t * 7.5 + seed * 0.37, slot = Math.floor(u), ph = u - slot, h = hash(slot, seed);
    const burst = h > 0.55 ? Math.exp(-ph * 9) * (0.55 + 0.45 * hash(slot, seed + 9)) : 0;
    return cl(0.27 + 0.08 * Math.sin(t * 13 + seed) + burst, 0, 1);
  }
  // Wex colour for a strobe value v: violet at rest -> white at the peak
  function strobeRgb(v) { const k = cl((v - 0.4) / 0.6, 0, 1), w = ELEM.wex; return [w.r + (1 - w.r) * k, w.g + (1 - w.g) * k, w.b + (1 - w.b) * k]; }
  // Mixed spell by orb share: shares {q,w,e} (counts or fractions) or a string like 'qwe' -> colour, base intensity, radius mult + normalised shares
  function blend(s) {
    let q = 0, w = 0, e = 0;
    if (typeof s === 'string') { for (const c of s.toLowerCase()) { if (c === 'q') q++; else if (c === 'w') w++; else if (c === 'e') e++; } }
    else if (s) { q = +s.q || 0; w = +s.w || 0; e = +s.e || 0; }
    const tot = q + w + e;
    if (!(tot > 0)) return { r: 1, g: 1, b: 1, base: 0, rad: 0, q: 0, w: 0, e: 0 };
    q /= tot; w /= tot; e /= tot;
    const Q = ELEM.quas, W = ELEM.wex, E = ELEM.exort;
    return {
      r: q * Q.r + w * W.r + e * E.r, g: q * Q.g + w * W.g + e * E.g, b: q * Q.b + w * W.b + e * E.b,
      base: q * Q.base + w * W.base + e * E.base, rad: q * Q.rad + w * W.rad + e * E.rad, q, w, e,
    };
  }

  const Lights = {
    enabled: false, MAX: MAXL, ELEM, flicker, strobe, strobeRgb, blend, hash,
    begin(R) { n = 0; if (R) stamp = R.time; },   // R: also stamps the frame, so emitters' frame(R) calls this frame do not reset again
    // idempotent per render frame (several modules call it; render.js may call begin() once instead)
    frame(R) { const s = R && R.time; if (s !== stamp) { stamp = s; n = 0; } },
    get count() { return n; },
    add(o) {
      if (!Lights.enabled || !o || n >= POOL) return;
      const radius = +o.radius, inten = +o.intensity;
      if (!(radius > 0) || !(inten > 0)) return;
      const p = pool[n++];
      p.x = +o.x || 0; p.y = +o.y || 0; p.z = +o.z || 0; p.r = +o.r || 0; p.g = +o.g || 0; p.b = +o.b || 0;
      p.radius = radius; p.intensity = inten; p.kind = o.kind || '';
    },
    // element light: el 'quas'|'wex'|'exort' or a blend() result; R.time drives flicker / strobe (quas steady); k scales intensity (fade)
    addElem(R, x, y, z, radius, el, k, seed, kind) {
      if (!Lights.enabled) return;
      Lights.frame(R);
      const E = typeof el === 'string' ? ELEM[el] : el; if (!E) return;
      let m = 1, r = E.r, g = E.g, b = E.b;
      const t = R ? R.time : 0, sd = seed || 0;
      if (typeof el === 'string') {
        if (el === 'exort') m = flicker(t, sd);
        else if (el === 'wex') { const s = strobe(t, sd), c = strobeRgb(s); m = s / 0.5; r = c[0]; g = c[1]; b = c[2]; }
      } else {   // blend: each share keeps its own motion; the Wex share whitens on a strobe peak
        const s = strobe(t, sd), c = strobeRgb(s), ww = el.w || 0;
        m = (el.e || 0) * flicker(t, sd) + ww * s / 0.5 + (el.q || 0);
        r += ww * (c[0] - ELEM.wex.r); g += ww * (c[1] - ELEM.wex.g); b += ww * (c[2] - ELEM.wex.b);
      }
      Lights.add({ x, y, z, r, g, b, radius: radius * E.rad, intensity: E.base * m * (k == null ? 1 : k), kind });
    },
    // view-px emitter helper (the 2D lights are in view px): sx,sy screen px, hpx extra height px, rgb 0..255
    addPx(R, sx, sy, hpx, rgb, rpx, inten, kind) {
      if (!Lights.enabled || !rgb) return;
      Lights.frame(R);
      const P = R.P;
      Lights.add({ x: (sx + R.camX) * P, y: (sy + R.camY) * P, z: (hpx || 0) * P, r: rgb[0] / 255, g: rgb[1] / 255, b: rgb[2] / 255, radius: rpx * P, intensity: inten, kind });
    },
    // k-means-lite for glow sand: points {x,y,z?,r,g,b,w?} -> <= k (<= 4) weighted-centroid lights {x,y,z,r,g,b,weight,n,span}
    cluster(pts, k) {
      k = cl(k | 0 || 4, 1, 4);
      const N = pts ? pts.length : 0; if (!N) return [];
      const wt = p => p.w > 0 ? p.w : 1;
      const cs = [{ x: pts[0].x, y: pts[0].y }];
      while (cs.length < Math.min(k, N)) {   // farthest-first seeding
        let bi = -1, bd = -1;
        for (let i = 0; i < N; i++) { let d = Infinity; for (const c of cs) { const dx = pts[i].x - c.x, dy = pts[i].y - c.y; d = Math.min(d, dx * dx + dy * dy); } if (d > bd) { bd = d; bi = i; } }
        if (bd <= 0) break;
        cs.push({ x: pts[bi].x, y: pts[bi].y });
      }
      const asg = new Int32Array(N);
      for (let it = 0; it < 4; it++) {
        for (let i = 0; i < N; i++) { let b = 0, bd = Infinity; for (let c = 0; c < cs.length; c++) { const dx = pts[i].x - cs[c].x, dy = pts[i].y - cs[c].y, d = dx * dx + dy * dy; if (d < bd) { bd = d; b = c; } } asg[i] = b; }
        for (let c = 0; c < cs.length; c++) {
          let sx = 0, sy = 0, sw = 0;
          for (let i = 0; i < N; i++) if (asg[i] === c) { const w = wt(pts[i]); sx += pts[i].x * w; sy += pts[i].y * w; sw += w; }
          if (sw > 0) { cs[c].x = sx / sw; cs[c].y = sy / sw; }
        }
      }
      const out = [];
      for (let c = 0; c < cs.length; c++) {
        let sw = 0, sz = 0, sr = 0, sg = 0, sb = 0, m = 0, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
        for (let i = 0; i < N; i++) if (asg[i] === c) {
          const p = pts[i], w = wt(p); sw += w; sz += (p.z || 0) * w; sr += (p.r || 0) * w; sg += (p.g || 0) * w; sb += (p.b || 0) * w; m++;
          if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x; if (p.y < miny) miny = p.y; if (p.y > maxy) maxy = p.y;
        }
        if (!m) continue;
        out.push({ x: cs[c].x, y: cs[c].y, z: sz / sw, r: sr / sw, g: sg / sw, b: sb / sw, weight: sw, n: m, span: Math.max(maxx - minx, maxy - miny) });
      }
      return out;
    },
    // visible lights, strongest first. cam = {x, y, w, h} world rect (top-left + size). score = intensity * radius^2 / (1 + dist to the view centre)
    list(cam, max) {
      max = cl(max | 0 || MAXL, 1, MAXL);
      const out = [];
      if (!Lights.enabled || !n) return out;
      const hasCam = cam && cam.w > 0 && cam.h > 0;
      const cx = hasCam ? cam.x + cam.w / 2 : 0, cy = hasCam ? cam.y + cam.h / 2 : 0;
      for (let i = 0; i < n; i++) {
        const p = pool[i];
        if (hasCam) {
          const m = p.radius + 0.1 * Math.max(cam.w, cam.h);   // margin: a light just off-screen still lights the edge
          if (p.x + m < cam.x || p.x - m > cam.x + cam.w || p.y + m < cam.y || p.y - m > cam.y + cam.h) continue;
        }
        const d = hasCam ? Math.hypot(p.x - cx, p.y - cy) : 0;
        p.score = p.intensity * p.radius * p.radius / (1 + d);
        out.push(p);
      }
      out.sort((a, b) => b.score - a.score);
      if (out.length > max) out.length = max;
      return out;
    },
    // flat shader uniforms: pos = (x - cam.x, y - cam.y, z) x max, col = rgb x max, rad = (radius, intensity) x max, count = live lights
    uniforms(cam, max) {
      max = cl(max | 0 || MAXL, 1, MAXL);
      const ls = Lights.list(cam, max), pos = new Float32Array(max * 3), col = new Float32Array(max * 3), rad = new Float32Array(max * 2);
      const ox = cam ? cam.x || 0 : 0, oy = cam ? cam.y || 0 : 0;
      for (let i = 0; i < ls.length; i++) {
        const p = ls[i];
        pos[i * 3] = p.x - ox; pos[i * 3 + 1] = p.y - oy; pos[i * 3 + 2] = p.z;
        col[i * 3] = p.r; col[i * 3 + 1] = p.g; col[i * 3 + 2] = p.b;
        rad[i * 2] = p.radius; rad[i * 2 + 1] = p.intensity;
      }
      return { pos, col, rad, count: ls.length, max };
    },
  };
  IT.Lights = Lights;
})(typeof window !== 'undefined' ? window : globalThis);
