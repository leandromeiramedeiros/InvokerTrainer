import fs from 'node:fs';
import { L, K, ellM, rectM, strokeM, union, shEll, shEdge, paint, rig, W, H, CX } from './lib.mjs';
import { portraits } from './portraits.mjs';

const BASE = { o: '#2a1a2e', w: '#f4f0e0', p: '#1c1426', m: '#3a1822', t: '#f0ead8', V: '#c8a0ff', U: '#7a50e0', W: '#f8f2ff', Y: '#ffe45c', Z: '#d89a2a' };
const hxiOf = P => Math.floor(P.hcx), yiOf = P => Math.round(P.hcy);

function eyesX(c, ex, ey) { for (const [dx, dy] of [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]]) c.set(ex + dx, ey + dy, 'p'); }

// ============ PEDRO ============
const pedro = {
  name: 'pedro',
  pal: {
    ...BASE,
    a: '#c4d8a4', b: '#a2bf8c', c: '#7e9c74', d: '#5c7a62',
    R: '#a2706a', r: '#80505a', q: '#643c4c', z: '#482a3c',
    N: '#6e6a8c', n: '#555174', k: '#3e3a5a', j: '#2c2a44',
    e: '#7a634e', f: '#584638', g: '#3e3030',
    h: '#4c4c36', y: '#6c6e4c', B: '#4a6054',
  },
  g: { hRx: 5.5, hRy: 5, tRx: 4.5, tRy: 4, tRxE: 3.5, legLen: 5, legW: 2, legX: 2.5, stride: 2.5, armW: 2, armLen: 8, armOut: 0, shOut: 1.8, handR: 1.4, headOv: 3.5, hx: -1, eHead: 3, eLean: -1, eArm: 3 },
  m: null,
  face(c, P) {
    const { p } = P, hx = hxiOf(P), yi = yiOf(P), top = Math.round(P.hcy - P.g.hRy);
    const strand = (x, y, h) => { for (let i = 0; i < h; i++) { c.set(x, y - i, i ? 'h' : 'h'); } c.set(x, y - h, 'o'); c.set(x - 1, y - h + 1, c.get(x - 1, y - h + 1) === '.' ? 'o' : c.get(x - 1, y - h + 1)); c.set(x + 1, y - h + 1, c.get(x + 1, y - h + 1) === '.' ? 'o' : c.get(x + 1, y - h + 1)); };
    const tuft = (x, y) => { strand(x, y, 2); strand(x + 2, y, 1); };
    const cap = (xa, xb, ya, yb) => { for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) { const ch = c.get(x, y); if (ch !== '.' && ch !== 'o') c.set(x, y, (x * 7 + y * 3) % 5 === 0 ? 'y' : 'h'); } };
    if (P.dir === 'n') {
      cap(hx - 5, hx + 6, top, yi - 1); for (let x = hx - 4; x <= hx + 5; x++) if ((x & 1)) c.set(x, yi, 'h');
      tuft(hx - 3, top - 1); tuft(hx + 2, top - 1); return;
    }
    if (P.dir === 'e') {
      const ex = hx + 3;
      cap(hx - 5, hx + 1, top, yi - 2); cap(hx - 5, hx - 3, yi - 1, yi);
      tuft(hx - 3, top - 1);
      c.set(hx - 1, yi, 'd'); c.set(hx - 1, yi + 1, 'c');
      if (p.eyes === 'x') eyesX(c, ex + 1, yi); else if (p.eyes === 'closed') { c.set(ex, yi, 'p'); c.set(ex + 1, yi, 'p'); }
      else { c.set(ex, yi - 1, 'B'); c.set(ex + 1, yi - 1, 'B'); c.set(ex, yi, 'w'); c.set(ex + 1, yi, 'p'); c.set(ex, yi + 1, 'B'); }
      c.set(hx + 4, yi + 3, 'm'); c.set(hx + 5, yi + 3, 'm'); c.set(hx + 4, yi + 4, 'm'); c.set(hx + 3, yi + 3, 't');
      return;
    }
    tuft(hx - 3, top - 1); strand(hx + 3, top, 2);
    for (const x of [hx - 1, hx, hx + 1, hx + 2]) c.set(x, top, 'h');
    const L1 = hx - 3, R1 = hx + 3;
    if (p.eyes === 'x') { eyesX(c, hx - 2, yi); eyesX(c, hx + 4, yi); }
    else if (p.eyes === 'closed') { for (const x of [L1, L1 + 1, R1, R1 + 1]) c.set(x, yi, 'p'); }
    else {
      c.set(L1, yi - 1, 'B'); c.set(L1 + 1, yi - 1, 'B'); c.set(L1, yi, 'w'); c.set(L1 + 1, yi, 'p'); c.set(L1, yi + 1, 'B'); c.set(L1 + 1, yi + 1, 'B');
      c.set(R1, yi - 2, 'B'); c.set(R1 + 1, yi - 2, 'B'); c.set(R1, yi - 1, 'w'); c.set(R1 + 1, yi - 1, 'w'); c.set(R1, yi, 'p'); c.set(R1 + 1, yi, 'w'); c.set(R1, yi + 1, 'B'); c.set(R1 + 1, yi + 1, 'B');
    }
    c.set(hx, yi + 1, 'c');
    if (p.mouth === 'o') { c.set(hx - 1, yi + 2, 'm'); c.set(hx, yi + 2, 'm'); c.set(hx + 1, yi + 2, 'm'); c.set(hx - 1, yi + 3, 'm'); c.set(hx, yi + 3, 'm'); c.set(hx + 1, yi + 3, 'm'); }
    else { c.set(hx - 1, yi + 2, 't'); c.set(hx, yi + 2, 'm'); c.set(hx + 1, yi + 2, 't'); c.set(hx - 1, yi + 3, 'm'); c.set(hx, yi + 3, 'm'); c.set(hx + 1, yi + 3, 'm'); c.set(hx + 1, yi + 4, 'w'); }
  },
  torsoDeco(c, P) {
    const hx = Math.floor(P.tcx), by = Math.round(P.tcy + P.tRy - 1);
    // ragged hem + rips
    c.set(hx - 2, by, 'z'); c.set(hx + 1, by, 'z'); c.set(hx + 3, by - 1, 'c'); c.set(hx - 3, by - 2, 'c'); c.set(hx - 2, by - 2, 'b');
    if (P.dir !== 'n') { c.set(hx, by - 3, 'q'); c.set(hx + 1, by - 4, 'q'); }
  },
  back(c, P) {
    if (P.dir === 'e') { // hunch hump
      const m = ellM(P.tcx - 2.5, P.tTop + 2.5, 3.6, 3.4);
      paint(c, m, shEll(P.tcx - 2.5, P.tTop + 2.5, 3.6, 3.4, pedro.m.torso, 0.14));
    } else { const cy = P.hcy + 2.5, m = ellM(P.tcx, cy, 6.8, 3.3); paint(c, m, shEll(P.tcx, cy, 6.8, 3.3, pedro.m.torso, 0.14)); }
  },
};
pedro.m = {
  head: ['a', 'b', 'c', 'd'], torso: ['R', 'r', 'q', 'z'], arm: ['a', 'b', 'c', 'd'], armD: ['b', 'c', 'd', 'd'],
  hand: ['a', 'b', 'c', 'd'], handD: ['b', 'c', 'd', 'd'], pants: ['N', 'N', 'n', 'k'], pantsD: ['n', 'n', 'k', 'j'], shoe: ['e', 'e', 'f', 'g'],
};

// ============ RENAN ============
const renan = {
  name: 'renan',
  pal: {
    ...BASE,
    S: '#ffffff', a: '#ffeee0', b: '#f8c8a0', c: '#e0986c', d: '#ac6450',
    R: '#f2605e', r: '#d0404c', q: '#a02c46', z: '#6c1c38',
    N: '#7a8cb4', n: '#5a6c96', k: '#44547c', j: '#2e3a5a',
    e: '#4a2c28', u: '#ece4d4', v: '#b0a496', x: '#7c7266',
  },
  g: { hRx: 6.5, hRy: 5.5, tRx: 5.5, tRy: 3.5, tRxE: 4.5, legLen: 5, legW: 3, legX: 2.8, stride: 2.5, armW: 3, armLen: 5, armOut: 0.5, shOut: 1.2, handR: 1.5, headOv: 2, hx: 0, eHead: 2, eLean: 0, eArm: 1 },
  face(c, P) {
    const { p } = P, hx = hxiOf(P), yi = yiOf(P), top = Math.round(P.hcy - P.g.hRy);
    // specular
    const spec = [[-4, -3], [-3, -4], [-2, -5], [-3, -3], [-2, -4], [-1, -5], [0, -5]];
    if (P.dir !== 'e') { for (const [dx, dy] of spec) c.set(hx + dx, yi + dy, 'S'); c.set(hx + 2, yi - 5, 'a'); c.set(hx - 5, yi - 1, 'a'); }
    else { for (const [dx, dy] of spec) c.set(hx + dx - 1, yi + dy, 'S'); c.set(hx - 5, yi - 1, 'a'); }
    if (P.dir === 'n') {
      for (let x = hx - 4; x <= hx + 5; x++) if ((x & 1)) c.set(x, yi + 5, 'd');
      return;
    }
    if (P.dir === 'e') {
      const ex = hx + 3;
      c.set(hx - 2, yi + 1, 'c'); c.set(hx - 1, yi + 1, 'd'); c.set(hx - 2, yi, 'c'); c.set(hx - 1, yi, 'c'); // ear
      if (p.eyes === 'x') eyesX(c, ex + 1, yi); else if (p.eyes === 'closed') { c.set(ex, yi, 'p'); c.set(ex + 1, yi, 'p'); }
      else { c.set(ex, yi - 1, 'e'); c.set(ex + 1, yi - 2, 'e'); c.set(ex + 2, yi - 2, 'e'); c.set(ex + 1, yi - 1, 'e'); c.set(ex, yi, 'w'); c.set(ex + 1, yi, 'p'); }
      c.set(hx + 7, yi + 1, 'c'); c.set(hx + 7, yi + 2, 'd'); c.set(hx + 6, yi + 1, 'b');
      for (let x = hx + 1; x <= hx + 6; x++) if (x & 1) c.set(x, yi + 5, 'd');
      for (let x = hx + 3; x <= hx + 6; x++) c.set(x, yi + 4, 'm');
      return;
    }
    const L1 = hx - 4, R1 = hx + 3;
    if (p.eyes === 'x') { eyesX(c, hx - 3, yi); eyesX(c, hx + 4, yi); }
    else if (p.eyes === 'closed') { for (const x of [L1, L1 + 1, R1, R1 + 1]) c.set(x, yi, 'p'); }
    else {
      // thick grumpy brows
      const furrow = p.mean ? 1 : 0;
      for (const [dx, dy] of [[-5, -3], [-4, -2], [-3, -2], [-2, -1], [-5, -2], [4, -3], [3, -2], [2, -2], [1, -1], [4, -2]]) c.set(hx + dx + (dx > 0 ? 1 : 0) - (dx > 0 ? 0 : 0), yi + dy + furrow * 0, 'e');
      c.set(L1 + 1, yi, 'w'); c.set(L1 + 2, yi, 'p'); c.set(R1 + 1, yi, 'p'); c.set(R1 + 2, yi, 'w');
      c.set(L1 + 1, yi + 1, 'd'); c.set(L1 + 2, yi + 1, 'd'); c.set(R1 + 1, yi + 1, 'd'); c.set(R1 + 2, yi + 1, 'd');
    }
    c.set(hx, yi + 1, 'b'); c.set(hx + 1, yi + 1, 'c'); c.set(hx, yi + 2, 'd'); c.set(hx + 1, yi + 2, 'd');
    for (let x = hx - 4; x <= hx + 5; x++) if (((x + yi) & 1)) c.set(x, yi + 5, 'd');
    if (p.mouth === 'o') { c.set(hx - 1, yi + 3, 'm'); c.set(hx, yi + 3, 'm'); c.set(hx + 1, yi + 3, 'm'); c.set(hx - 1, yi + 4, 'm'); c.set(hx, yi + 4, 'm'); c.set(hx + 1, yi + 4, 'm'); c.set(hx - 1, yi + 3, 't'); c.set(hx + 1, yi + 3, 't'); }
    else { c.set(hx - 2, yi + 4, 'm'); c.set(hx - 1, yi + 4, 'm'); c.set(hx, yi + 4, 'm'); c.set(hx + 1, yi + 4, 'm'); c.set(hx + 2, yi + 3, 'm'); c.set(hx + 3, yi + 3, 'm'); }
  },
  preHead(c, P) {
    if (P.dir === 'e') return;
    const g = P.g;
    for (const sd of [-1, 1]) { const cx = P.hcx + sd * (g.hRx - 0.2), cy = P.hcy + 1; paint(c, ellM(cx, cy, 1.5, 2), shEll(cx, cy, 1.5, 2, renan.m.head, 0)); }
  },
  torsoDeco(c, P) {
    const hx = Math.floor(P.tcx), by = Math.round(P.tcy + P.tRy - 1);
    c.set(hx - 3, by, 'z'); c.set(hx - 2, by, 'z'); c.set(hx + 3, by, 'z'); c.set(hx + 4, by, 'z');
    if (P.dir === 's') { c.set(hx, by - 2, 'R'); c.set(hx + 1, by - 2, 'R'); c.set(hx - 1, by - 1, 'R'); c.set(hx, by - 1, 'u'); c.set(hx + 1, by - 1, 'u'); c.set(hx + 2, by - 1, 'R'); }
  },
};
renan.m = {
  head: ['a', 'b', 'c', 'd'], torso: ['R', 'r', 'q', 'z'], arm: ['b', 'b', 'c', 'd'], armD: ['c', 'c', 'd', 'd'],
  hand: ['a', 'b', 'c', 'd'], handD: ['b', 'c', 'd', 'd'], pants: ['N', 'N', 'n', 'k'], pantsD: ['n', 'n', 'k', 'j'], shoe: ['u', 'u', 'v', 'x'],
};

// ============ VITINHO ============
const tailPts = { n: [[-3, 1], [-6, 1], [-7, -2], [-7, -5], [-5, -6], [-4, -4]], s: [[3, 1], [6, 1], [7, -2], [7, -5], [5, -6], [4, -4]], e: [[-3, 1], [-6, 1], [-8, -2], [-8, -5], [-6, -6], [-5, -4]] };
function drawTail(c, P) {
  const pts = tailPts[P.dir], tf = P.p.tail || 0;
  const ox = Math.round(P.tcx), oy = Math.round(P.hip);
  const sway = [0, 0, 1, 1][tf];
  const q = pts.map(([x, y], i) => [ox + x + (i >= 3 ? sway * (P.dir === 'e' || P.dir === 'n' ? -1 : 1) : 0), oy + y + (i >= 4 ? (tf % 2) : 0)]);
  let m = new Set();
  for (let i = 0; i < q.length - 1; i++) m = union(m, strokeM(q[i][0], q[i][1], q[i + 1][0], q[i + 1][1], 2));
  paint(c, m, shEdge(vitinho.m.torso));
  const [tx, ty] = q[q.length - 1];
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) c.set(tx + dx, ty + dy, 'T');
}
const vitinho = {
  name: 'vitinho',
  pal: {
    ...BASE,
    F: '#c8904c', f: '#a46e3a', g: '#7e502c', h: '#5a3822',
    T: '#fbe2b2', s: '#e8c088', u: '#c09462', v: '#9a7048',
    x: '#fffaf0', n: '#ff9aa8',
  },
  g: { hRx: 6, hRy: 5, tRx: 3.5, tRy: 3.5, tRxE: 3, legLen: 5, legW: 2, legX: 2, stride: 2, armW: 2, armLen: 9, armOut: 0.5, shOut: 0.8, handR: 1.3, headOv: 2, hx: 0, eHead: 2, eLean: 0, eArm: 2 },
  back(c, P) { drawTail(c, P); },
  torsoDeco(c, P) {
    const hx = Math.floor(P.tcx), cy = Math.round(P.tcy);
    if (P.dir === 'n') { }
    else if (P.dir === 's') { const m = ellM(P.tcx, P.tcy + 0.5, 2.2, 2.4); paint(c, m, shEll(P.tcx, P.tcy + 0.5, 2.2, 2.4, ['T', 'T', 's', 'u'], 0), false); }
    else { const m = ellM(P.tcx + 1.2, P.tcy + 0.5, 1.6, 2.4); paint(c, m, shEll(P.tcx + 1.2, P.tcy + 0.5, 1.6, 2.4, ['T', 'T', 's', 'u'], 0), false); }
  },
  preHead(c, P) {
    if (P.dir === 'e') {
      const cx = P.hcx - 2.5, cy = P.hcy - 1.5;
      paint(c, ellM(cx, cy, 2, 2.2), shEll(cx, cy, 2, 2.2, vitinho.m.head, 0));
      c.set(Math.round(cx), Math.round(cy), 's'); c.set(Math.round(cx) + 1, Math.round(cy), 's'); return;
    }
    for (const sd of [-1, 1]) {
      const cx = P.hcx + sd * (P.g.hRx + 0.3), cy = P.hcy - 0.8;
      paint(c, ellM(cx, cy, 2.2, 2.4), shEll(cx, cy, 2.2, 2.4, vitinho.m.head, 0));
      if (P.dir === 's') { const ix = Math.round(cx - sd * 0.0), iy = Math.round(cy); c.set(ix, iy, 'T'); c.set(ix, iy + 1, 's'); c.set(ix + (sd > 0 ? 0 : -1), iy, 'T'); }
    }
  },
  face(c, P) {
    const { p } = P, hx = hxiOf(P), yi = yiOf(P), top = Math.round(P.hcy - P.g.hRy);
    if (P.dir === 'n') { for (let x = hx - 3; x <= hx + 4; x++) if ((x + top) & 1) c.set(x, top + 1, 'F'); c.set(hx, yi + 1, 'g'); c.set(hx + 1, yi + 2, 'g'); c.set(hx - 2, yi + 2, 'g'); c.set(hx + 3, yi, 'g'); c.set(hx - 3, yi - 1, 'g'); return; }
    if (P.dir === 'e') {
      const ex = hx + 3;
      // muzzle
      const mx = P.hcx + 4, my = P.hcy + 1.5;
      paint(c, union(ellM(mx, my, 2.6, 2.3), ellM(P.hcx + 1.5, P.hcy - 0.5, 3, 3)), shEll(mx, my, 3, 3, ['T', 'T', 's', 'u'], 0));
      // re-outline head/muzzle border
      for (let k = 0; k < 1; k++) { }
      if (p.eyes === 'x') eyesX(c, ex + 1, yi - 1); else if (p.eyes === 'closed') { c.set(ex, yi - 1, 'p'); c.set(ex + 1, yi - 1, 'p'); }
      else { c.set(ex, yi - 2, 'h'); c.set(ex + 1, yi - 3, 'h'); c.set(ex + 2, yi - 3, 'h'); c.set(ex, yi - 1, 'w'); c.set(ex + 1, yi - 1, 'p'); c.set(ex, yi, 'w'); c.set(ex + 1, yi, 'w'); }
      c.set(hx + 7, yi + 1, 'v'); c.set(hx + 7, yi, 'v');
      if (p.mouth === 'o') { c.set(hx + 4, yi + 3, 'm'); c.set(hx + 5, yi + 3, 'm'); c.set(hx + 4, yi + 4, 'm'); c.set(hx + 5, yi + 4, 'm'); }
      else { c.set(hx + 3, yi + 3, 'm'); c.set(hx + 4, yi + 3, 't'); c.set(hx + 5, yi + 3, 't'); c.set(hx + 6, yi + 3, 'm'); c.set(hx + 5, yi + 4, 'm'); c.set(hx + 4, yi + 4, 'm'); }
      c.set(hx - 1, top + 1, 'g'); c.set(hx, top, 'g');
      return;
    }
    // face mask
    const mk = union(ellM(P.hcx - 2.4, P.hcy - 0.3, 2.9, 2.7), ellM(P.hcx + 2.4, P.hcy - 0.3, 2.9, 2.7), ellM(P.hcx, P.hcy + 1.8, 4.2, 3.2));
    for (const k of mk) { const [x, y] = k.split(',').map(Number); if (c.get(x, y) !== 'o' && c.get(x, y) !== '.') c.set(x, y, y > P.hcy + 2.2 ? 's' : 'T'); }
    // fur forehead curl
    c.set(hx, top + 1, 'g'); c.set(hx + 1, top + 1, 'g'); c.set(hx + 1, top + 2, 'g'); c.set(hx, top + 2, 'f');
    const L1 = hx - 3, R1 = hx + 2;
    if (p.eyes === 'x') { eyesX(c, hx - 2, yi); eyesX(c, hx + 3, yi); }
    else if (p.eyes === 'closed') { for (const x of [L1, L1 + 1, R1, R1 + 1]) c.set(x, yi, 'p'); }
    else {
      // mischievous: one brow up
      c.set(L1, yi - 2, 'h'); c.set(L1 + 1, yi - 2, 'h'); c.set(L1 + 2, yi - 1, 'h');
      c.set(R1 - 1, yi - 3, 'h'); c.set(R1, yi - 3, 'h'); c.set(R1 + 1, yi - 2, 'h');
      c.set(L1, yi - 1, 'w'); c.set(L1 + 1, yi - 1, 'w'); c.set(L1, yi, 'w'); c.set(L1 + 1, yi, 'p');
      c.set(R1, yi - 1, 'w'); c.set(R1 + 1, yi - 1, 'w'); c.set(R1, yi, 'p'); c.set(R1 + 1, yi, 'w');
    }
    c.set(hx, yi + 1, 'u'); c.set(hx + 1, yi + 1, 'u');
    if (p.mouth === 'o') { for (const x of [hx - 1, hx, hx + 1, hx + 2]) { c.set(x, yi + 3, 'm'); c.set(x, yi + 4, 'm'); } }
    else {
      c.set(hx - 3, yi + 2, 'm'); c.set(hx + 4, yi + 2, 'm');
      c.set(hx - 2, yi + 3, 'm'); c.set(hx + 3, yi + 3, 'm');
      for (let x = hx - 1; x <= hx + 2; x++) { c.set(x, yi + 3, 't'); c.set(x, yi + 4, 'm'); }
      c.set(hx - 2, yi + 4, 'm'); c.set(hx + 3, yi + 4, 'm');
      c.set(hx + 1, yi + 4, 'n'); c.set(hx, yi + 4, 'n');
    }
  },
};
vitinho.m = {
  head: ['F', 'F', 'f', 'g'], torso: ['F', 'f', 'g', 'h'], arm: ['F', 'f', 'g', 'h'], armD: ['f', 'g', 'h', 'h'],
  hand: ['T', 'T', 's', 'u'], handD: ['T', 's', 'u', 'v'], pants: ['F', 'f', 'g', 'h'], pantsD: ['f', 'g', 'h', 'h'], shoe: ['T', 's', 'u', 'v'],
};

// ============ POSES ============
function pose(cfg, anim, i, dir) {
  const AL = cfg.g.armLen, n = cfg.name;
  const e = dir === 'e';
  if (anim === 'idle') {
    const o = { dy: [0, 0, 1, 1][i] };
    if (n === 'pedro') { o.hx = [0, 1, 0, -1][i]; const a = [[0, 0], [0, 1], [0, 1], [0, 0]][i], b = [[0, 1], [0, 0], [0, 0], [0, 1]][i]; if (e) { o.aN = a; o.aF = b; } else { o.aL = a; o.aR = b; } }
    if (n === 'renan') { o.dy = [0, 1, 1, 0][i]; const fl = i === 1 || i === 2; if (e) { o.aN = [fl ? 1 : 0, fl ? -1 : 0]; o.aF = [fl ? 1 : 0, fl ? -1 : 0]; } else { o.aL = [fl ? -1 : 0, fl ? -1 : 0]; o.aR = [fl ? 1 : 0, fl ? -1 : 0]; } o.mean = i === 2; }
    if (n === 'vitinho') {
      o.dy = [0, 1, 0, 1][i]; o.tail = i;
      if ((i === 1 || i === 2)) { if (e) o.aN = [0, -AL + 1 + i % 2]; else o.aR = [-1, -AL - 1 + i % 2]; }
      else if (e) o.aN = [0, 0];
      if (i === 3) { o.aL = [0, 1]; }
    }
    return o;
  }
  if (anim === 'walk') {
    const o = e ? { step: [1, 0, -1, 0][i], dy: [1, 0, 1, 0][i], lL: [0, 1, 0, 0][i], lR: [0, 0, 0, 1][i], aN: [[-2, 0], [0, 0], [2, 0], [0, 0]][i], aF: [[2, 0], [0, 0], [-2, 0], [0, 0]][i] }
      : { dy: [1, 0, 1, 0][i], lL: [0, 1, 0, 0][i], lR: [0, 0, 0, 1][i], aL: [0, [1, 0, -1, 0][i]], aR: [0, [-1, 0, 1, 0][i]] };
    if (n === 'pedro') { o.hx = [0, -1, 0, 1][i]; const sw = [1, 0, -1, 0][i]; if (e) { o.aN = [sw, -3]; o.aF = [-sw, -4]; } else { o.aL = [0, -3 + sw]; o.aR = [0, -3 - sw]; } }
    if (n === 'vitinho') { o.tail = i; if (!e) { o.aL = [0, [2, 0, -2, 0][i]]; o.aR = [0, [-2, 0, 2, 0][i]]; } }
    if (n === 'renan') { o.lL = [0, 2, 0, 0][i]; o.lR = [0, 0, 0, 2][i]; }
    return o;
  }
  if (anim === 'cast') {
    let o;
    if (dir === 's') o = i === 0 ? { dy: 1, aR: [2, -AL - 2], mean: true, glowAt: (P, a) => [a[1].hx, a[1].hy - 2] } : { dy: 0, hy: 1, aR: [-3, -AL + 3], mouth: 'o', mean: true, glowAt: (P, a) => [a[1].hx, a[1].hy + 3], glowBig: true };
    else if (dir === 'n') o = i === 0 ? { dy: 1, aR: [2, -AL - 1], glowAt: (P, a) => [a[1].hx, a[1].hy - 2] } : { dy: 0, hy: 1, aR: [0, -AL - 3], glowAt: (P, a) => [a[1].hx, a[1].hy - 4], glowBig: true };
    else o = i === 0 ? { dy: 1, tx: -1, aN: [-4, -AL + 3], aF: [-3, 0], glowAt: (P, a) => [a[1].hx - 1, a[1].hy - 2] } : { dy: 0, tx: 1, hy: 1, mouth: 'o', aN: [5, -AL + 3], aF: [0, 0], glowAt: (P, a) => [a[1].hx + 3, a[1].hy], glowBig: true };
    if (n === 'vitinho') o.tail = i * 2;
    if (i === 1) o.mouth = 'o';
    return o;
  }
  if (anim === 'stunned') {
    const sg = i ? 1 : -1;
    const o = { dy: 2, hx: sg * 2, hy: 1, tx: -sg, eyes: 'x', stars: i, mouth: 'o', sq: 0.3 };
    if (e) { o.aN = [-1, 1]; o.aF = [0, 2]; o.hx = sg; } else { o.aL = [sg, 1]; o.aR = [sg, 1 + i]; }
    if (n === 'vitinho') o.tail = i + 2;
    return o;
  }
  // blink
  const o = i === 0 ? { sq: 0.8, dy: 0, eyes: 'closed' } : { sq: 1.3, dy: 1, eyes: 'closed', vanish: 1 };
  if (e) { o.aN = [-1, -4]; o.aF = [-1, -4]; } else { o.aL = [2, -4]; o.aR = [-2, -4]; }
  if (n === 'vitinho') o.tail = 1;
  return o;
}

const ANIMS = { idle: 4, walk: 4, cast: 2, stunned: 2, blink: 2 };
function build(cfg) {
  const frames = {};
  for (const dir of ['s', 'n', 'e']) for (const [a, cnt] of Object.entries(ANIMS)) for (let i = 0; i < cnt; i++) frames[`${a}_${dir}_${i}`] = rig(cfg, dir, pose(cfg, a, i, dir));
  frames.portrait = portraits[cfg.name]();
  return frames;
}

const chars = { pedro, renan, vitinho };
let out = "// Training-dummy skins: Pedro (zombie shamble), Renan (bald tank), Vitinho (monkey). 20x24 frames, anchor = feet [10,22]; portrait 32x32.\n// Generated from a procedural pixel rig, then frozen as ASCII.\n(function (G) {\n  'use strict';\n  const IT = G.IT;\n";
const used = {};
for (const [name, cfg] of Object.entries(chars)) {
  const frames = build(cfg);
  const fr = Object.entries(frames).map(([k, rows]) => `    ${k}: [\n${rows.map(r => `      '${r}'`).join(',\n')}\n    ]`).join(',\n');
  const palStr = Object.entries(cfg.pal).map(([k, v]) => `${k}: '${v}'`).join(', ');
  // verify chars
  for (const [k, rows] of Object.entries(frames)) for (const r of rows) for (const ch of r) if (ch !== '.' && !(ch in cfg.pal)) throw new Error(name + ' ' + k + ' bad char ' + ch);
  out += `  IT.Art.sheet('${name}', {\n    pal: { ${palStr} },\n    anchor: [10, 22],\n    frames: {\n${fr}\n    }\n  });\n`;
}
out += "})(typeof window !== 'undefined' ? window : globalThis);\n";
fs.writeFileSync('C:/Users/leandro/Documents/Projects/Git/InvokerTrainer/js/art/dummies.js', out);
console.log('ok', out.length);
