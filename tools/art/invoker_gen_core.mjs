// Shared drawing core for the invoker generator.
export const W = 26, H = 28;

export const PAL = {
  K: '#1a0f26',
  t: '#f6cfa6', S: '#e2a67c', s: '#b77a5c', z: '#7c4a42', o: '#e0846c',
  j: '#fff8d0', H: '#f6e096', h: '#cfae5c', i: '#8c6c3c',
  N: '#f27ad6', m: '#c23ca8', M: '#7e1f7c', Q: '#42103f',
  Y: '#fff3a0', y: '#f7c94a', G: '#c78e2a', g: '#7e531c',
  R: '#fffaf0', w: '#f1e6d2', c: '#d2c0a8', T: '#9f8c7c',
  l: '#cdbcf6', L: '#9a86dc', D: '#6a58b0', d: '#463a82',
  U: '#a874ec', u: '#7c4ecb', v: '#5530a2', V: '#37206e', X: '#1f1148',
  E: '#2a1840', I: '#5cd0f4', W: '#ffffff',
  B: '#8a5a34', b: '#c4924e', n: '#4a2c22',
  a: '#eaffff', p: '#f4e8ff',
  '1': '#7aeaff', '2': '#2aa8e0', '3': '#165a9c', '4': '#0a2a56',
  '5': '#c08cff', '6': '#8a4af0', '7': '#4a24a8', '8': '#1e0e56',
  '9': '#ffc040', '0': '#ff7a1c', '#': '#b8300c', '$': '#4a1208', A: '#fff4c0',
};

export const RAMPS = ['jHhi', 'tSsz', 'NmMQ', 'YyGg', 'RwcT', 'lLDd', 'UuvVX', 'bBn'];
export const darker = (c, cap = 9, ramps = RAMPS) => { for (const r of ramps) { const i = r.indexOf(c); if (i >= 0) return r[Math.min(i + 1, r.length - 1, Math.max(cap, i))]; } return c; };
export const lighter = (c, ramps = RAMPS) => { for (const r of ramps) { const i = r.indexOf(c); if (i >= 0) return r[Math.max(i - 1, 0)]; } return c; };

export class G {
  constructor(w = W, h = H) { this.w = w; this.h = h; this.a = Array.from({ length: h }, () => Array(w).fill('.')); }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? '.' : this.a[y][x]; }
  set(x, y, c) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.a[y][x] = c; }
  rows() { return this.a.map(r => r.join('')); }
}
export const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// Paste an ASCII stamp. '.' = transparent, ' ' = skip (keep dest). outline:true draws K around the stamp mask.
export function stamp(g, rows, ox, oy, opt = {}) {
  const op = (x, y) => y >= 0 && y < rows.length && x >= 0 && x < rows[y].length && rows[y][x] !== '.' ;
  if (opt.outline) for (let y = -1; y <= rows.length; y++) for (let x = -1; x <= rows[0].length; x++) {
    if (op(x, y)) continue;
    if (NB.some(([dx, dy]) => op(x + dx, y + dy))) g.set(ox + x, oy + y, 'K');
  }
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const c = r[x]; if (c === '.' || c === ' ') continue; g.set(ox + x, oy + y, c); } });
}
export function stampMask(g, mask, colorFn, opt = {}) {
  const has = (x, y) => mask.has(x + ',' + y);
  if (opt.outline) for (const k of mask) { const [x, y] = k.split(',').map(Number); for (const [dx, dy] of NB) if (!has(x + dx, y + dy)) g.set(x + dx, y + dy, 'K'); }
  for (const k of mask) { const [x, y] = k.split(',').map(Number); g.set(x, y, colorFn(x, y, has)); }
}
// mirror a left half (w cols) into full width; right half darkened one ramp step beyond `shiftFrom`, rim-lit at its edge.
export function mirror(left, o = {}) {
  const cap = o.cap ?? 9, shiftFrom = o.shiftFrom ?? 15, keep = o.keep ?? 'EIWKaY', rimFrom = o.rimFrom ?? 3;
  const w = left[0].length;
  return left.map((r, y) => {
    const right = [...r].reverse();
    const out = [];
    for (let x = 0; x < w; x++) out.push(r[x]);
    let last = -1;
    right.forEach((c, i) => { if (c !== '.') last = i; });
    right.forEach((c, i) => {
      const gx = w + i;
      let d = c;
      if (c !== '.' && !keep.includes(c) && gx >= shiftFrom) d = darker(c, cap, o.ramps);
      if (c !== '.' && i === last && i >= rimFrom && !o.noRim && !keep.includes(c)) d = lighter(c, o.ramps);
      out.push(d);
    });
    return out.join('');
  });
}

// ---------- limbs ----------
function line(x0, y0, x1, y1) {
  const pts = []; const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) pts.push([Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), i / n]);
  return pts;
}
// arm: sleeve (cream) with gold bracer and skin hand. returns hand centre.
export function arm(g, sx, sy, ex, ey, o = {}) {
  const wd = o.w ?? 3, sleeve = o.sleeve ?? 'w', hr = o.hand ?? 1;
  const br = o.br ?? [0.5, 0.86];
  const C = { sl: 'R', b1: 'y', b2: 'G', h1: 't', h2: 'S', h3: 's', ...o.c }; // colour overrides: sl lit, sd shade, b1/b2 bracer, h1..h3 skin
  const sl = new Map();
  const off = Math.floor(wd / 2);
  for (const [x, y, t] of line(sx, sy, ex, ey)) {
    if (t > 0.86) continue;
    for (let a = 0; a < wd; a++) for (let b = 0; b < wd; b++) sl.set((x + a - off) + ',' + (y + b - off), t);
  }
  const mask = new Set(sl.keys());
  const hand = new Set();
  for (let a = -hr; a <= hr; a++) for (let b = -hr; b <= hr; b++) { if (hr > 0 && Math.abs(a) + Math.abs(b) > hr + 1) continue; hand.add((ex + a) + ',' + (ey + b)); }
  const all = new Set([...mask, ...hand]);
  const has = (x, y) => all.has(x + ',' + y);
  stampMask(g, all, (x, y) => {
    const lit = !has(x, y - 1) || !has(x - 1, y), shd = !has(x, y + 1) || !has(x + 1, y);
    const k = x + ',' + y;
    if (hand.has(k) && !(sl.has(k) && sl.get(k) < 0.72)) return lit && !shd ? C.h1 : shd ? C.h3 : C.h2;
    const t = sl.get(k);
    if (t > br[0] && t <= br[1]) return shd && !lit ? C.b2 : C.b1;
    return lit && !shd ? C.sl : shd ? (C.sd ?? (sleeve === 'u' ? 'v' : 'c')) : sleeve;
  }, { outline: true });
  return [ex, ey];
}

export function disc(g, cx, cy, r, c) { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) g.set(cx + x, cy + y, c); }
// arcane glow: soft halo + white core centred at (cx,cy). size 1..3
export function glow(g, cx, cy, size = 2, pal = ['a', 'p', '5', '6']) {
  const [core, mid, halo, edge] = pal;
  if (size >= 3) { disc(g, cx, cy, 4, edge); }
  disc(g, cx, cy, size >= 2 ? 3 : 2, halo);
  disc(g, cx, cy, size >= 2 ? 2 : 1, mid);
  disc(g, cx, cy, size >= 2 ? 1 : 0, core);
  if (size >= 2) for (const [dx, dy] of [[0, -5], [0, 5], [-5, 0], [5, 0]]) { g.set(cx + dx, cy + dy, mid); }
}
export function spark(g, x, y, c = 'Y', c2 = 'y') { g.set(x, y, c); g.set(x - 1, y, c2); g.set(x + 1, y, c2); g.set(x, y - 1, c2); g.set(x, y + 1, c2); }


// palm glint (Force Push): bright centre; (dx,dy) = push direction, sparkles fly out that way; (0,0) = towards the viewer
export function glint(g, x, y, dx = 0, dy = 0) {
  g.set(x, y, 'W');
  if (!dx && !dy) { g.set(x - 1, y, 'a'); g.set(x + 1, y, 'a'); g.set(x, y - 1, 'a'); return; }
  g.set(x + dx * 2, y + dy * 2, 'W'); g.set(x + dx * 2 + dy, y + dy * 2 + dx, 'a'); g.set(x + dx * 2 - dy, y + dy * 2 - dx, 'a'); g.set(x + dx * 3, y + dy * 3, 'a');
}

// generic boot (south/north): rows use top/base/sole colour map m = {b,B,n}
export function bootT(g, side, kind, m, oy0 = 25) {
  const x0 = side === 'L' ? 7 : 14;
  const A = { stand: ['bBBB', 'nnnn'], fwd: ['bBB.', 'bBBBn', 'nnnnn'], up: ['bBBn'] }[kind];
  const oy = kind === 'fwd' ? oy0 - 1 : oy0;
  const flip = side === 'R';
  const rows = A.map(r => [...(flip ? [...r].reverse().join('') : r)].map(c => m[c] ?? c).join(''));
  const wmax = Math.max(...rows.map(r => r.length));
  stamp(g, rows.map(r => r.padEnd(wmax, '.')), flip ? x0 + 4 - wmax : x0, oy, { outline: true });
}
// flip rows horizontally; optional per-char map (e.g. darken for the far side)
export const flipRows = (rows, f = c => c) => rows.map(r => [...r].reverse().map(f).join(''));
// fill a column-wise silhouette: top(x)..bot(x) with colour fn(x,y,top,bot); returns nothing, draws with outline
export function columns(g, x0, x1, top, bot, col, outline = true) {
  const mask = new Set();
  for (let x = x0; x <= x1; x++) for (let y = top(x); y <= bot(x); y++) mask.add(x + ',' + y);
  stampMask(g, mask, (x, y) => col(x, y, top(x), bot(x)), { outline });
}

// tapered curved spike along points [[x,y,width]...] (width = pixels thick, horizontal). cols = [lit, base, shade]
export function spike(g, pts, cols, dx = 0, dy = 0, dark = null) {
  const mask = new Set();
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, y0, w0] = pts[k], [x1, y1, w1] = pts[k + 1], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n), w = Math.max(1, Math.round(w0 + (w1 - w0) * i / n));
      for (let a = 0; a < w; a++) mask.add((x + a + dx) + ',' + (y + dy));
    }
  }
  const has = (x, y) => mask.has(x + ',' + y);
  stampMask(g, mask, (x, y) => { const c = !has(x - 1, y) ? cols[0] : !has(x + 1, y) ? cols[2] : cols[1]; return dark ? dark(c) : c; }, { outline: true });
}
