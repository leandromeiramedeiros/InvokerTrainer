// Hand-authored stamps + per-direction composers for the invoker sheet.
import { G, stamp, mirror, arm, glow, glint, spark, disc, W, H } from './invoker_gen_core.mjs';

const chk = (name, rows, w) => { rows.forEach((r, i) => { if (r.length !== w) throw new Error(`${name} row ${i} len ${r.length} != ${w}: ${r}`); }); return rows; };

// collar fan from per-column top y and bottom y (inclusive); returns rows (lit left side)
function fan(w, h, top, bot, tips = [], band = 99) {
  const g = new G(w, h);
  const le = y => { for (let x = 0; x < w; x++) if (top[x] !== undefined && top[x] <= y && bot[x] >= y) return x; return 99; };
  for (let x = 0; x < w; x++) {
    if (top[x] === undefined) continue;
    for (let y = top[x]; y <= bot[x]; y++) {
      const e = le(y);
      let c;
      if (x >= band) c = y === top[x] ? 'y' : y === bot[x] ? 'N' : (y === top[x] + 1 ? 'U' : 'u'); // back view: gold rim, sage band, thin magenta edge
      else if (y === top[x]) c = tips.includes(x) ? 'Y' : 'y';
      else if (x === e) c = (y % 2) ? 'y' : 'G';
      else if (x === e + 1) c = 'y';
      else if (y === top[x] + 1) c = 'y';
      else if (x === w - 1 || (y === bot[x] && x >= 5)) c = 'N'; // thin magenta lining along the neck / inner edge
      else if (x <= 3) c = 'y';
      else c = x <= 7 ? 'G' : 'G';
      g.set(x, y, c);
    }
  }
  return g.rows();
}

// ================= SOUTH (front) =================
const FAN_S = fan(13, 15,
  [, 1, 2, 4, 3, 4, 5, 5, 4, 3, 2, 1, 1],
  [, 8, 10, 12, 13, 14, 14, 14, 14, 14, 14, 14, 14], [1, 4, 12]);

const HEAD_S = chk('HEAD_S', [
  '......jH', // y1 bun
  '.....HjH', // y2
  '...HHyyy', // y3 tie
  '..HjjHhH', // y4
  '.HjjHhiH', // y5
  'HjHhHihH', // y6
  'HjhHSSSS', // y7
  'HhHSiiSS', // y8 brow
  'HhSSEESS', // y9 lid
  'HhSSWISS', // y10 eye
  'hhSoIISs', // y11
  'hhSSSSSz', // y12
  '..sSSSSS', // y13
], 8);

const WING_S = chk('WING_S', [
  '.....yN......', // y10
  '.....yNG.....', // y11
  '....yNGG.....', // y12
  '....yNGGG....', // y13
  '...yNGGGGG...', // y14
  '...yNGGGGGG..', // y15
], 13);

const TORSO_S = chk('TORSO_S', [
  '......RRRwyll', // y14
  '.....RRwwwylL', // y15
  '.....RwwcwGlL', // y16
  '.....wwcwcGlL', // y17
  '.....wcwcwGlL', // y18
  '....GyyyyyyYy', // y19 belt
  '....GgGgGgGyy', // y20
  '...wwcwcwcGlL', // y21
  '...wcwcwcwGlL', // y22
  '...cwcwcTcGlD', // y23
  '..GyGyGyGyGyG', // y24 hem
], 13);

function capeS(sw) {
  const g = new G(13, 11);
  for (let r = 0; r < 11; r++) {
    const y = 15 + r, xl = r < 2 ? 4 : r < 5 ? 3 : 2;
    for (let x = xl; x < 13; x++) {
      let c = 'u';
      if (x === xl) c = 'U';
      else if (x === xl + 1) c = (y & 1) ? 'u' : 'U';
      else if (x === 6 + sw || x === 9 - sw) c = 'v';
      else if (x === 5 + sw || x === 8 - sw) c = (y & 1) ? 'u' : 'v';
      else if (x >= 10) c = ((x + y) & 1) ? 'v' : 'V';
      g.set(x, r, c);
    }
    if (r === 10) for (let x = xl; x < 13; x++) g.set(x, r, (x & 1) ? 'G' : 'y');
    if (r === 9) for (let x = xl; x < 13; x++) if (g.get(x, r) !== '.') g.set(x, r, (x + sw) % 3 ? 'v' : 'V');
  }
  return g.rows();
}

function bootS(g, side, kind) {
  const x0 = side === 'L' ? 7 : 14;
  const A = { stand: ['bBBB', 'nnnn'], fwd: ['bBB.', 'bBBBn', 'nnnnn'], up: ['bBBn'] }[kind];
  const oy = kind === 'fwd' ? 24 : 25;
  const flip = side === 'R';
  const rows = A.map(r => (flip ? [...r].reverse().join('') : r));
  const wmax = Math.max(...rows.map(r => r.length));
  stamp(g, rows.map(r => r.padEnd(wmax, '.')), flip ? x0 + 4 - wmax : x0, oy, { outline: true });
}

export function basePose(anim, i) {
  const p = { hb: 0, hand: [[4, 21], [21, 21]], boots: ['stand', 'stand'], lift: [0, 0], sway: 0, glow: null, sparks: [], eyes: null, handR: [1, 1] };
  if (anim === 'idle') { p.hb = [0, 0, 1, 1][i]; p.hand = [[4, [21, 22, 22, 21][i]], [21, [21, 22, 22, 21][i]]]; p.sway = [0, 1, 1, 0][i]; }
  if (anim === 'walk') {
    p.hb = [1, 0, 1, 0][i]; p.sway = [1, 0, -1, 0][i];
    if (i === 0) { p.boots = ['fwd', 'up']; p.lift = [0, 1]; p.hand = [[4, 19], [21, 23]]; }
    if (i === 2) { p.boots = ['up', 'fwd']; p.lift = [1, 0]; p.hand = [[4, 23], [21, 19]]; }
  }
  if (anim === 'cast') { // Force Push: wind-up, both palms thrust forward, recover
    p.hb = [0, 0, 1][i];
    p.hand = [[[7, 18], [18, 18]], [[6, 18], [19, 18]], [[5, 20], [20, 20]]][i];
    p.handR = [[1, 1], [2, 2], [1, 1]][i];
    p.palm = [null, [[6, 18], [19, 18]], null][i];
  }
  if (anim === 'attack') {
    p.hand = [[4, 21], [[21, 14], [18, 20], [19, 19]][i]];
    p.hb = [0, 1, 0][i];
    p.glow = [null, { x: 18, y: 21, s: 3 }, { x: 19, y: 20, s: 1 }][i];
    p.handR = [1, [1, 2, 1][i]];
  }
  if (anim === 'stunned') {
    p.hb = 2 - i; p.hand = [[4, 22], [21, 22]]; p.eyes = 'x'; p.sway = i;
    p.sparks = i ? [[6, 1], [20, 2], [13, 0]] : [[8, 0], [18, 1], [13, 2]];
  }
  return p;
}

export function sStamps(g, anim, i) {
  const p = basePose(anim, i);
  stamp(g, mirror(capeS(p.sway), { shiftFrom: 14 }), 0, 15, { outline: true });
  const torso = mirror(TORSO_S, { shiftFrom: 15 }).map(r => [...r]);
  for (const [side, lf] of [[0, p.lift[0]], [1, p.lift[1]]]) if (lf) {
    const a = side ? 13 : 0, b = side ? 26 : 13;
    for (let x = a; x < b; x++) { if (torso[10][x] !== '.') torso[9][x] = torso[10][x]; torso[10][x] = '.'; }
  }
  stamp(g, torso.map(r => r.join('')), 0, 14, { outline: true });
  bootS(g, 'L', p.boots[0]); bootS(g, 'R', p.boots[1]);
  arm(g, 4, 16, p.hand[0][0], p.hand[0][1], { w: 3, hand: p.handR[0] });
  arm(g, 21, 16, p.hand[1][0], p.hand[1][1], { w: 3, hand: p.handR[1] });
  if (p.glow) glow(g, p.glow.x, p.glow.y, p.glow.s);
  if (p.palm) for (const [px, py] of p.palm) glint(g, px, py);
  const hy = p.hb;
  stamp(g, mirror(FAN_S, { shiftFrom: 14 }), 0, hy, { outline: true });
  stamp(g, mirror(HEAD_S, { shiftFrom: 12, cap: 2, noRim: true, keep: 'EIWKaYj' }), 5, 1 + hy, { outline: true });
  stamp(g, mirror(WING_S, { shiftFrom: 15 }), 0, 10 + hy, { outline: true });
  if (p.eyes === 'x') {
    const y = 9 + hy;
    g.set(9, y, 'E'); g.set(10, y + 1, 'E'); g.set(10, y, 'S'); g.set(9, y + 1, 'S');
    g.set(16, y, 'E'); g.set(15, y + 1, 'E'); g.set(15, y, 'S'); g.set(16, y + 1, 'S');
  }
  for (const [sx, sy] of p.sparks) spark(g, sx, sy);
}

// ================= NORTH (back) =================
const FAN_N = fan(13, 15,
  [, 1, 2, 4, 3, 6, 8, 9, 10, 10, 10, 10, 10],
  [, 8, 10, 12, 13, 14, 14, 14, 14, 14, 14, 14, 14], [1, 4], 8);

const HAIR_N = chk('HAIR_N', [
  '......jH', // y1
  '.....HjH', // y2
  '...HHyyy', // y3 tie
  '..HHjjHH', // y4
  '.HjHhHhH', // y5
  'HjHhHhHh', // y6
  'jHhHhHhh', // y7
  'HhHhHhhH', // y8
  'hHhHhhHh', // y9
  'HhHhhHhi', // y10
  '.hHhhHhi', // y11
  '..hhHhii', // y12
], 8);

function capeN(sw) {
  const g = new G(13, 11);
  for (let r = 0; r < 11; r++) {
    const y = 14 + r, xl = r < 1 ? 5 : r < 2 ? 4 : r < 4 ? 3 : 2;
    for (let x = xl; x < 13; x++) {
      let c = 'u';
      if (r === 0) c = (x & 1) ? 'G' : 'y';
      else if (x === xl) c = 'U';
      else if (x === xl + 1) c = (y & 1) ? 'u' : 'U';
      else if (x === 6 + sw || x === 9 - sw) c = 'v';
      else if (x === 5 + sw || x === 8 - sw) c = (y & 1) ? 'u' : 'v';
      else if (x >= 11) c = 'V';
      else if (x === 10 - sw) c = (y & 1) ? 'v' : 'V';
      g.set(x, r, c);
    }
    if (r === 10) for (let x = xl; x < 13; x++) g.set(x, r, (x & 1) ? 'G' : 'y');
    if (r === 9) for (let x = xl; x < 13; x++) if (g.get(x, r) !== '.') g.set(x, r, (x + sw) % 3 ? 'v' : 'V');
  }
  return g.rows();
}

export function poseN(anim, i) {
  const p = basePose(anim, i);
  if (anim === 'walk') { if (i === 0) p.hand = [[4, 23], [21, 19]]; if (i === 2) p.hand = [[4, 19], [21, 23]]; }
  if (anim === 'attack') { p.hand = [[4, 21], [[21, 14], [17, 12], [19, 14]][i]]; p.glow = [null, { x: 16, y: 10, s: 3 }, { x: 18, y: 12, s: 1 }][i]; }
  if (anim === 'cast') p.hand = [[[7, 18], [18, 18]], [[6, 8], [19, 8]], [[6, 19], [19, 19]]][i]; // push: hands out ahead past the head
  return p;
}
export function nStamps(g, anim, i) {
  const p = poseN(anim, i);
  stamp(g, mirror(capeN(p.sway), { shiftFrom: 14 }), 0, 14, { outline: true });
  bootS(g, 'L', p.boots[0]); bootS(g, 'R', p.boots[1]);
  const cast = anim === 'cast', hy = p.hb;
  if (!cast || i !== 1) { arm(g, 4, 16, p.hand[0][0], p.hand[0][1], { w: 3 }); arm(g, 21, 16, p.hand[1][0], p.hand[1][1], { w: 3 }); }
  stamp(g, mirror(HAIR_N, { shiftFrom: 12, cap: 2, noRim: true }), 5, 1 + hy, { outline: true });
  stamp(g, mirror(FAN_N, { shiftFrom: 14 }), 0, hy, { outline: true });
  if (cast && i === 1) {
    arm(g, 4, 15, p.hand[0][0], p.hand[0][1], { w: 3 }); arm(g, 21, 15, p.hand[1][0], p.hand[1][1], { w: 3 });
    glint(g, p.hand[0][0], p.hand[0][1], 0, -1); glint(g, p.hand[1][0], p.hand[1][1], 0, -1);
  }
  if (p.glow) glow(g, p.glow.x, p.glow.y, p.glow.s);
  for (const [sx, sy] of p.sparks) spark(g, sx, sy);
}

// ================= EAST (side) =================
export function eStamps(g, anim, i) {
  stamp(g, ['KKKK', 'KRRK', 'KKKK'], 10, 12);
}
