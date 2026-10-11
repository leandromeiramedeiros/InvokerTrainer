// Pixel helpers: hashing, noise, Bayer dither, color ramps, bitmap font, cached tints, dotted shapes.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};

  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const bayer = (x, y) => BAYER4[((y & 3) << 2) | (x & 3)];

  function hash2(x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s | 0) + 1, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  const sm = t => t * t * (3 - 2 * t);
  function noise2(x, y, scale, seed) {
    const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = sm(fx - ix), ty = sm(fy - iy);
    const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }

  const rgb = h => { if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]; return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; };
  const hex = (r, g, b) => '#' + ((1 << 24) | (Math.max(0, Math.min(255, r | 0)) << 16) | (Math.max(0, Math.min(255, g | 0)) << 8) | Math.max(0, Math.min(255, b | 0))).toString(16).slice(1);
  const abgr = (r, g, b) => (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
  const abgrHex = h => { const c = rgb(h); return abgr(c[0], c[1], c[2]); };
  function mixHex(a, b, t) { const x = rgb(a), y = rgb(b); return hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); }

  // bright -> dark ramps for particles / fx
  const RAMPS = {
    fire: ['#fff2b0', '#ffc040', '#ff8a1c', '#d8480c', '#7a2208', '#3a1408'],
    ice: ['#ffffff', '#d4f6ff', '#8fe6ff', '#4cb6ec', '#2a78b8', '#1a4a7a'],
    purple: ['#ffffff', '#e6c8ff', '#b070ff', '#7a3ad8', '#4a2090', '#28104c'],
    gold: ['#ffffff', '#fff2a0', '#ffd24a', '#d89a1c', '#8a5a12', '#4a3010'],
    green: ['#f0ffd0', '#b4f070', '#6ccc3c', '#3a8a24', '#1e5016', '#0e2a0c'],
    white: ['#ffffff', '#e8eeff', '#b8c4e0', '#8090b0', '#4a5470', '#2a3044'],
    red: ['#ffffff', '#ffb0a0', '#ff5a4a', '#c02818', '#701408', '#340a04'],
    dirt: ['#d8c090', '#a88a58', '#7a6038', '#52402a', '#33281a', '#1c160e'],
  };
  for (const k in RAMPS) RAMPS[k + 'U'] = RAMPS[k].map(abgrHex);

  const ORB_RGB = { Q: [90, 215, 255], W: [185, 110, 255], E: [255, 150, 50] };
  const ORB_HEX = { Q: '#5ad7ff', W: '#b96eff', E: '#ff9632' };
  const ORB_RAMP = { Q: 'ice', W: 'purple', E: 'fire' };
  function mixOrbs(str) {
    let r = 0, g = 0, b = 0, n = 0;
    for (const ch of str || '') { const c = ORB_RGB[ch]; if (c) { r += c[0]; g += c[1]; b += c[2]; n++; } }
    return n ? [r / n | 0, g / n | 0, b / n | 0] : [255, 255, 255];
  }

  // ---- 3x5 bitmap font ----
  const FONT_SRC = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
    F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
    K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
    P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
    Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
    4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
    9: '111101111001110', '?': '110001010000010', '!': '010010010000010', '-': '000000111000000', '.': '000000000000010',
    '+': '000010111010000', '%': '101001010100101', ':': '000010000010000', ' ': '000000000000000',
  };
  const glyph = {};
  for (const k in FONT_SRC) glyph[k] = FONT_SRC[k];
  const textCache = new Map();
  // Cached canvas for text with a 1px outline. Width = 4*len+1.
  function textCanvas(str, color, outline) {
    str = String(str).toUpperCase();
    const key = str + '|' + color + '|' + (outline || '');
    let c = textCache.get(key);
    if (c) return c;
    if (textCache.size > 400) textCache.clear();
    const n = str.length, w = n * 4 + 1, h = 7;
    c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    const draw = (ox, oy, col) => {
      x.fillStyle = col;
      for (let i = 0; i < n; i++) {
        const g = glyph[str[i]] || glyph['?'];
        for (let p = 0; p < 15; p++) if (g[p] === '1') x.fillRect(1 + i * 4 + (p % 3) + ox, 1 + ((p / 3) | 0) + oy, 1, 1);
      }
    };
    if (outline !== null) {
      const o = outline || '#000';
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) draw(dx, dy, o);
    }
    draw(0, 0, color);
    textCache.set(key, c);
    return c;
  }
  // align: 'c' | 'l' | 'r'. y = top of glyph.
  function text(cx, str, x, y, color, align, outline) {
    const c = textCanvas(str, color || '#fff', outline);
    const ox = align === 'l' ? 0 : align === 'r' ? c.width : (c.width >> 1);
    cx.drawImage(c, (x | 0) - ox, (y | 0) - 1);
  }

  // ---- sprite variants (cached per source canvas) ----
  const tintCache = new WeakMap();
  function tinted(src, color) {       // silhouette filled with color
    let m = tintCache.get(src); if (!m) { m = {}; tintCache.set(src, m); }
    let c = m[color];
    if (c) return c;
    c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
    m[color] = c;
    return c;
  }
  const ditherCache = new WeakMap();
  function dithered(src, phase) {     // checkerboard-holed copy
    let m = ditherCache.get(src); if (!m) { m = []; ditherCache.set(src, m); }
    phase &= 1;
    let c = m[phase];
    if (c) return c;
    c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'destination-out';
    for (let yy = 0; yy < c.height; yy++) for (let xx = 0; xx < c.width; xx++) if (((xx + yy) & 1) === phase) x.fillRect(xx, yy, 1, 1);
    m[phase] = c;
    return c;
  }

  // ---- shapes ----
  // dotted ring of pixel radius r; phase rotates the dots
  function ring(cx, x, y, r, color, phase, density) {
    const n = Math.max(8, Math.round(6.283 * r / (density || 3)));
    cx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const a = (i / n + (phase || 0)) * 6.2832;
      cx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 1, 1);
    }
  }
  function solidRing(cx, x, y, r, color) {   // contiguous pixel circle outline
    cx.fillStyle = color;
    const n = Math.max(12, Math.round(6.283 * r * 1.3));
    let lx = 1e9, ly = 1e9;
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.2832, px = Math.round(x + Math.cos(a) * r), py = Math.round(y + Math.sin(a) * r);
      if (px === lx && py === ly) continue;
      cx.fillRect(px, py, 1, 1); lx = px; ly = py;
    }
  }
  function disc(cx, x, y, r, color) {
    cx.fillStyle = color;
    r = Math.max(0.5, r);
    const ri = Math.ceil(r);
    for (let dy = -ri; dy <= ri; dy++) {
      const hw = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy) + 0.25));
      cx.fillRect(Math.round(x) - hw, Math.round(y) + dy, hw * 2 + 1, 1);
    }
  }
  // dotted line; every = pixel spacing; phase scrolls
  function dotted(cx, x0, y0, x1, y1, color, every, phase) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    if (len < 1) return;
    cx.fillStyle = color;
    const ux = dx / len, uy = dy / len;
    for (let d = ((phase || 0) % every + every) % every; d < len; d += every) cx.fillRect(Math.round(x0 + ux * d), Math.round(y0 + uy * d), 1, 1);
  }

  // soft radial glow sprite (cached by color)
  const glowCache = {};
  function glowSprite(color) {
    let c = glowCache[color];
    if (c) return c;
    const s = 64;
    c = document.createElement('canvas'); c.width = c.height = s;
    const x = c.getContext('2d'), g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    const [r, gg, b] = rgb(color);
    g.addColorStop(0, `rgba(${r},${gg},${b},1)`); g.addColorStop(0.35, `rgba(${r},${gg},${b},0.45)`); g.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    glowCache[color] = c;
    return c;
  }

  IT.Pixel = { BAYER4, bayer, hash2, noise2, rgb, hex, abgr, abgrHex, mixHex, RAMPS, ORB_RGB, ORB_HEX, ORB_RAMP, mixOrbs, textCanvas, text, tinted, dithered, ring, solidRing, disc, dotted, glowSprite };
})(typeof window !== 'undefined' ? window : globalThis);
