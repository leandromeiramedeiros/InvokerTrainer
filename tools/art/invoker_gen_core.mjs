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
export const darker = (c, cap = 9) => { for (const r of RAMPS) { const i = r.indexOf(c); if (i >= 0) return r[Math.min(i + 1, r.length - 1, Math.max(cap, i))]; } return c; };
export const lighter = c => { for (const r of RAMPS) { const i = r.indexOf(c); if (i >= 0) return r[Math.max(i - 1, 0)]; } return c; };

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
      if (c !== '.' && !keep.includes(c) && gx >= shiftFrom) d = darker(c, cap);
      if (c !== '.' && i === last && i >= rimFrom && !o.noRim && !keep.includes(c)) d = lighter(c);
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
    if (hand.has(k) && !(sl.has(k) && sl.get(k) < 0.72)) return lit && !shd ? 't' : shd ? 's' : 'S';
    const t = sl.get(k);
    if (t > 0.5 && t <= 0.86) return shd && !lit ? 'G' : 'y';
    return lit && !shd ? 'R' : shd ? (sleeve === 'u' ? 'v' : 'c') : sleeve;
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

