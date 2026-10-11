export const W = 20, H = 24, CX = 9.5;
export class L {
  constructor(w = W, h = H) { this.w = w; this.h = h; this.g = Array.from({ length: h }, () => Array(w).fill('.')); }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? '.' : this.g[y][x]; }
  set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.g[y][x] = c; }
  rows() { return this.g.map(r => r.join('')); }
}
export const K = (x, y) => x + ',' + y;
export const ellM = (cx, cy, rx, ry) => { const s = new Set(); for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) { const a = (x - cx) / rx, b = (y - cy) / ry; if (a * a + b * b <= 1.12) s.add(K(x, y)); } return s; };
export const rectM = (x0, y0, x1, y1) => { const s = new Set(); for (let y = Math.round(y0); y <= Math.round(y1); y++) for (let x = Math.round(x0); x <= Math.round(x1); x++) s.add(K(x, y)); return s; };
export const strokeM = (x0, y0, x1, y1, w) => { const s = new Set(); const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2; for (let i = 0; i <= n; i++) { const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n); for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) s.add(K(x + a, y + b)); } return s; };
export const union = (...ms) => { const s = new Set(); for (const m of ms) for (const k of m) s.add(k); return s; };
export const shEll = (cx, cy, rx, ry, r, dith = 0.12) => (x, y) => {
  const v = -0.55 * (x - cx) / rx - 0.75 * (y - cy) / ry; const t = [0.85, 0.3, -0.35];
  let lv = v > t[0] ? 0 : v > t[1] ? 1 : v > t[2] ? 2 : 3;
  if (dith) for (let i = 0; i < 3; i++) if (Math.abs(v - t[i]) < dith) { lv = ((x + y) & 1) ? i + 1 : i; break; }
  return r[lv];
};
export const shEdge = r => (x, y, m) => {
  const u = m.has(K(x, y - 1)), l = m.has(K(x - 1, y)), d = m.has(K(x, y + 1)), rr = m.has(K(x + 1, y));
  if (!d || !rr) return r[3];
  if (!u && !l) return r[0];
  if (!u || !l) return r[1];
  return r[2];
};
export function paint(c, mask, sh, outline = true) {
  if (outline) for (const k of mask) { const [x, y] = k.split(',').map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!mask.has(K(x + dx, y + dy))) c.set(x + dx, y + dy, 'o'); }
  for (const k of mask) { const [x, y] = k.split(',').map(Number); c.set(x, y, sh(x, y, mask)); }
}
export function glow(c, x, y, big) {
  x = Math.round(x); y = Math.round(y);
  if (big) {
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]]) c.set(x + dx, y + dy, 'U');
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) c.set(x + dx, y + dy, 'V');
    c.set(x, y, 'W');
  } else { for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) c.set(x + dx, y + dy, 'U'); c.set(x, y, 'W'); }
}
export function stars(c, hx, hy, f) {
  const pts = f ? [[-5, 1], [5, -1], [0, -3]] : [[-4, -1], [4, 1], [1, -3]];
  for (const [dx, dy] of pts) { const x = Math.round(hx + dx), y = Math.round(hy + dy); c.set(x - 1, y, 'Z'); c.set(x + 1, y, 'Z'); c.set(x, y - 1, 'Z'); c.set(x, y + 1, 'Z'); c.set(x, y, 'Y'); }
}
export function vanish(c, f) {
  const g = c.g;
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    if (g[y][x] === '.') continue;
    if (f === 1) { if (((x + y) & 1) === 0) g[y][x] = '.'; else if (((x * 3 + y) % 5) === 0) g[y][x] = 'V'; }
  }
  const sp = f === 1 ? [[3, 12], [16, 14], [9, 8], [5, 18], [14, 19]] : [[3, 14], [16, 15], [10, 9]];
  for (const [x, y] of sp) { c.set(x - 1, y, 'V'); c.set(x + 1, y, 'V'); c.set(x, y - 1, 'V'); c.set(x, y + 1, 'V'); c.set(x, y, 'W'); }
}

// generic rig. cfg: {g, m, back, torsoDeco, preHead, headShape, face}
export function rig(cfg, dir, p) {
  const c = new L(), g = cfg.g, m = cfg.m;
  const dy = p.dy || 0, sq = p.sq || 0;
  const legLen = g.legLen - sq * 2;
  const tRy = g.tRy - sq * 1.2;
  const hip = 21 - legLen + 1;
  const tcy = hip + 1.5 - tRy + dy;
  const tTop = tcy - tRy;
  const hcy = tTop + g.headOv - g.hRy + (p.hy || 0);
  const side = dir === 'e';
  const tcx = CX + (p.tx || 0) + (side ? (g.eLean || 0) : 0);
  const hcx = CX + (g.hx || 0) + (p.hx || 0) + (side ? g.eHead : 0);
  const tRx = side ? g.tRxE : g.tRx;
  const pose = { dir, p, g, tcx, tcy, tRx, tRy, hcx, hcy, hip, legLen, dy, tTop };
  if (cfg.back) cfg.back(c, pose);
  const lifts = [p.lL || 0, p.lR || 0];
  const drawLeg = (x0, w, lift, shoeW, shoeX, dark) => {
    const top = hip + dy, bot = 21 - lift;
    paint(c, rectM(x0, top, x0 + w - 1, bot), shEdge(dark ? m.pantsD : m.pants));
    paint(c, rectM(shoeX, bot - 1, shoeX + shoeW - 1, bot), shEdge(m.shoe));
  };
  if (!side) {
    for (const sd of [-1, 1]) {
      const x0 = Math.round(CX - 0.5 + sd * g.legX - (g.legW - 1) / 2 + (p.tx || 0) * 0.3);
      drawLeg(x0, g.legW, lifts[sd < 0 ? 0 : 1], g.legW + 1, sd < 0 ? x0 - 1 : x0, false);
    }
  } else {
    const st = p.step || 0;
    const fx = Math.round(tcx - 1 - st * g.stride), nx = Math.round(tcx - 1 + st * g.stride);
    drawLeg(fx, g.legW, lifts[1], g.legW + 1, fx, true);
    drawLeg(nx, g.legW, lifts[0], g.legW + 1, nx, false);
  }
  const sh = tcy - tRy + 2.5;
  const armPts = [];
  if (!side) {
    for (const sd of [-1, 1]) {
      const a = (sd < 0 ? p.aL : p.aR) || [0, 0];
      const sx = tcx + sd * (tRx + (g.shOut ?? 0.5));
      armPts.push({ sd, sx, sy: sh, hx: sx + sd * (g.armOut || 0) + a[0], hy: sh + g.armLen + a[1] });
    }
  } else {
    const aN = p.aN || [0, 0], aF = p.aF || [0, 0];
    armPts.push({ far: true, sx: tcx + 1, sy: sh, hx: tcx + 1 + g.eArm + aF[0], hy: sh + g.armLen + aF[1] });
    armPts.push({ near: true, sx: tcx - 1, sy: sh, hx: tcx - 1 + g.eArm + aN[0], hy: sh + g.armLen + aN[1] });
  }
  const drawArm = a => {
    const aw = g.armW;
    const x0 = Math.round(a.sx - aw / 2 + 0.5), y0 = Math.round(a.sy);
    const x1 = Math.round(a.hx - aw / 2 + 0.5), y1 = Math.round(a.hy);
    paint(c, strokeM(x0, y0, x1, y1, aw), shEdge(a.far ? m.armD : m.arm));
    paint(c, ellM(a.hx, a.hy + 0.5, g.handR, g.handR), shEll(a.hx, a.hy + 0.5, g.handR, g.handR, a.far ? m.handD : m.hand, 0));
  };
  if (side) drawArm(armPts[0]);
  paint(c, ellM(tcx, tcy, tRx, tRy), shEll(tcx, tcy, tRx, tRy, m.torso, 0.14));
  if (cfg.torsoDeco) cfg.torsoDeco(c, pose);
  if (!side) for (const a of armPts) drawArm(a); else drawArm(armPts[1]);
  if (cfg.preHead) cfg.preHead(c, pose);
  const hm = ellM(hcx, hcy, g.hRx, g.hRy);
  if (cfg.headShape) cfg.headShape(c, pose, hm); else paint(c, hm, shEll(hcx, hcy, g.hRx, g.hRy, m.head, 0.1));
  cfg.face(c, pose);
  if (p.glowAt) { const [gx, gy] = p.glowAt(pose, armPts); glow(c, gx, gy, !!p.glowBig); }
  if (p.stars !== undefined) stars(c, hcx, hcy - g.hRy - 1, p.stars);
  if (p.vanish !== undefined) vanish(c, p.vanish);
  return c.rows();
}
