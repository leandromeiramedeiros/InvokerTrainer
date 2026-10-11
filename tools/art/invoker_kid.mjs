// 'Kid Invoker' skin: chibi (big head, small body), ahoge, pointy ears, glowing eyes, pink high-collar cape, navy tunic, bell sleeves.
// Poses are the default tall-skin poses remapped onto the small body (see mapP).
import { G, stamp, mirror, arm, glow, glint, spark, bootT, columns, flipRows } from './invoker_gen_core.mjs';
import { basePose as poseS, poseN } from './invoker_stamps.mjs';
import { poseE } from './invoker_stamps_e.mjs';

export const PAL_K = {
  K: '#1a0f26',
  t: '#fbd9b4', S: '#eab088', s: '#bc7e62', l: '#f0907a',
  j: '#fff4c4', H: '#f8e48a', h: '#d4b255', i: '#94722f',
  N: '#f58ae0', m: '#cc46b0', M: '#8a2a86', Q: '#4e1650',
  V: '#5a7ae0', v: '#3a58a8', X: '#22346e',
  Y: '#ffe27a', y: '#f7c94a', G: '#c78e2a', g: '#7e531c',
  R: '#fffaf0', w: '#f1e6d2', c: '#d2c0a8', T: '#e6d4aa', U: '#b09a70',
  e: '#ff5c7a', E: '#b02a4c', O: '#ffa63a', o: '#d06a1e', z: '#6a3a3a',
  B: '#8a5a34', b: '#c4924e', n: '#4a2c22',
  W: '#ffffff', a: '#eaffff', p: '#f4e8ff', '5': '#c08cff', '6': '#8a4af0',
  '1': '#7aeaff', '2': '#2aa8e0', '3': '#165a9c', '4': '#0a2a56', '7': '#4a24a8', '8': '#1e0e56',
  '9': '#ffc040', '0': '#ff7a1c', '#': '#b8300c', '$': '#4a1208', A: '#fff4c0',
};
const RAMPS_K = ['jHhi', 'tSsz', 'NmMQ', 'VvX', 'YyGg', 'RwcT', 'bBn', 'TU'];
const MO = { ramps: RAMPS_K, keep: 'KWaEeOon', noRim: true };
const chk = (name, rows, w) => { rows.forEach((r, i) => { if (r.length !== w) throw new Error(`${name} row ${i} len ${r.length} != ${w}: ${r}`); }); return rows; };
const SLEEVE = { w: 4, br: [9, 9], sleeve: 'v', c: { sl: 'V', sd: 'X', b1: 'Y', b2: 'G', h1: 't', h2: 'S', h3: 's' } };
export const compose = {};
// navy bell sleeve + gold-rimmed open cuff (white inside) + hand; v = cuff orientation (horizontal rim for hanging arms, vertical for arms pointing sideways)
function sleeve(g, sx, sy, hx, hy, o = {}) {
  const [x, y] = arm(g, sx, sy, hx, hy, { ...SLEEVE, ...o });
  if (o.side) { for (let k = -2; k <= 2; k++) g.set(x - 2, y + k, Math.abs(k) === 2 ? 'G' : 'y'); g.set(x - 3, y, 'R'); g.set(x - 3, y - 1, 'w'); g.set(x - 3, y + 1, 'w'); }
  else { for (let k = -2; k <= 2; k++) g.set(x + k, y - 2, Math.abs(k) === 2 ? 'G' : 'y'); g.set(x - 2, y - 1, 'R'); g.set(x + 2, y - 1, 'R'); }
}

// default (tall) pose -> kid body: hands pulled in towards the smaller shoulders, one px lower
const mapX = x => Math.round(12.5 + (x - 12.5) * 0.7);
function mapP(p) {
  const q = { ...p };
  q.hand = p.hand.map(([x, y]) => [mapX(x), Math.min(y + 1, 24)]);
  if (p.glow) q.glow = { ...p.glow, x: mapX(p.glow.x), y: p.glow.y + 1, s: Math.min(p.glow.s, 2) };
  if (p.palm) q.palm = p.palm.map(([x, y]) => [mapX(x), y + 1]);
  return q;
}

// ---------- shared bits ----------
const AHOGE = [[6, -1, 'H'], [6, -2, 'H'], [7, -3, 'H'], [8, -3, 'h'], [8, -2, 'h']]; // cowlick curl above head top (S/N), head x origin 6 -> abs = hx + dx

function capeBack(g, x0, x1, topF, hem, outside) { // pink cape / collar behind the body
  columns(g, x0, x1, topF, hem, (x, y, t, b) => {
    const xx = Math.min(x, 25 - x), right = x > 12;
    let c;
    if (y === t) c = xx === 4 ? 'Y' : 'y';
    else if (y === t + 1) c = 'N';
    else if (xx <= 4) c = 'N';
    else if (xx <= 6) c = 'm';
    else if (xx <= 8) c = 'M';
    else c = 'Q';
    if (outside && c !== 'y' && c !== 'Y') c = xx <= 4 ? 'N' : (x + 1) % 4 === 0 ? 'M' : 'm';
    if (right && c !== 'y' && c !== 'Y') c = { N: 'm', m: 'M', M: 'Q', Q: 'Q' }[c];
    if (y === b) c = (x & 1) ? 'M' : 'm';
    return c;
  });
}

// ---------- SOUTH ----------
const HEAD_S = chk('HEAD_S', [
  '..HHHHH', '.HjjHHH', 'HjHhHHh', 'HHhHHhH', 'HhHSHhS', 'hSSSSSS', 'hSSnnSS', 'hSSWWSS', 'hSSWWSS', '.SlSSSS', '..sSSSS',
], 7);
function headS(g, hx, hy) {
  const rows = mirror(HEAD_S, { shiftFrom: 99, ...MO }).map(r => [...r]);
  for (const [x, y, c] of [[6, 9, 'z'], [7, 9, 'z'], [8, 9, 'z'], [9, 8, 'z'], [6, 4, 'S'], [7, 4, 'S']]) rows[y][x] = c;
  return rows.map(r => r.join(''));
}
function earsS(g, hx, hy) {
  const L = ['S..', 'SS.', '.SS', '.Ss'], R = ['..S', '.SS', 'SS.', 'sS.'];
  stamp(g, L, hx - 3, hy + 3, { outline: true }); stamp(g, R, hx + 14, hy + 3, { outline: true });
}
function ahoge(g, ox, oy, flip) {
  for (const [dx, dy, c] of AHOGE) g.set(ox + (flip ? -dx : dx), oy + dy, c);
}
function torsoS(g) {
  // rows y16..21 (+ belt y19-20 incl) ; shell buckle centre
  const rows = [
    '.yVVVVVVVVy.', '.yVVVVVVVVy.', '.yvVVVVVVvy.', 'BBBBBBBBBBBB', 'BbBBYyBBBBnB', '.yvvvvvvvvy.',
  ];
  rows[2] = '.yvVVVVVVvy.';
  stamp(g, rows, 7, 16, { outline: true });
  // buckle: gold shell
  stamp(g, ['YY', 'yG'], 12, 19);
  // brooch + bow
  g.set(12, 16, 'e'); g.set(13, 16, 'E'); g.set(11, 16, 'y'); g.set(14, 16, 'y');
  stamp(g, ['OooO', '.OO.'], 11, 17);
}
function legsS(g, p) {
  // baggy brown pants + beige boots
  stamp(g, ['BBBBBBBBBBBB', 'bBBBnnBBBBBn', 'bBBn..nBBBn.'].map(r => r.slice(0, 12)), 7, 22, { outline: true });
  for (const [sd, k] of [['L', p.boots[0]], ['R', p.boots[1]]]) bootT(g, sd, k, { b: 'T', B: 'T', n: 'U' });
}
compose.s = function (g, anim, i) {
  const p = mapP(poseS(anim, i)), hy = p.hb;
  capeBack(g, 3, 22, x => { const xx = Math.min(x, 25 - x); return [0, 0, 0, 8, 7, 8, 10, 12, 14, 14, 14, 14, 14][xx] + hy; }, x => 22 - (x < 5 || x > 20 ? 1 : 0));
  legsS(g, p);
  torsoS(g);
  sleeve(g, 7, 17, p.hand[0][0], p.hand[0][1], { hand: p.handR[0] });
  sleeve(g, 18, 17, p.hand[1][0], p.hand[1][1], { hand: p.handR[1] });
  if (p.glow) glow(g, p.glow.x, p.glow.y, p.glow.s);
  if (p.palm) for (const [px, py] of p.palm) glint(g, px, py);
  earsS(g, 6, 5 + hy);
  stamp(g, headS(g, 6, 5 + hy), 6, 5 + hy, { outline: true });
  ahoge(g, 6, 5 + hy, false);
  if (p.eyes === 'x') { const y = 12 + hy; for (const x of [9, 10, 15, 16]) g.set(x, y, 'z'); g.set(9, y - 1, 'z'); g.set(10, y - 1, 'z'); g.set(15, y - 1, 'z'); g.set(16, y - 1, 'z'); }
  for (const [sx, sy] of p.sparks) spark(g, sx, sy);
};

// ---------- NORTH ----------
const HAIR_N = chk('HAIR_N', [
  '..HHHHH', '.HjjHHH', 'HjHhHHh', 'HHhHhHH', 'HhHHhHH', 'hHhHhHh', 'hhHhHhH', 'hHhhHhh', '.hhHhHh', '..hhHhi', '...hhhi',
], 7);
compose.n = function (g, anim, i) {
  const p = mapP(poseN(anim, i)), hy = p.hb, cast = anim === 'cast';
  if (cast) p.hand = [[[8, 19], [17, 19]], [[6, 8], [19, 8]], [[7, 20], [18, 20]]][i];
  legsS(g, p);
  capeBack(g, 5, 20, x => { const xx = Math.min(x, 25 - x); return [0, 0, 0, 0, 0, 12, 12, 12, 13, 13, 13, 13, 13][xx] + (hy > 0 ? 0 : 0); }, x => 23 - ((x + p.sway) % 3 === 0 ? 1 : 0), true);
  if (!cast || i !== 1) { sleeve(g, 7, 17, p.hand[0][0], p.hand[0][1]); sleeve(g, 18, 17, p.hand[1][0], p.hand[1][1]); }
  // high collar rising behind the head
  capeBack(g, 3, 22, x => { const xx = Math.min(x, 25 - x); return [0, 0, 0, 8, 7, 8, 10, 12, 14, 14, 14, 14, 14][xx] + hy; }, x => 15 + hy, true);
  const hair = mirror(HAIR_N, { shiftFrom: 99, ...MO });
  earsS(g, 6, 5 + hy);
  stamp(g, hair, 6, 5 + hy, { outline: true });
  ahoge(g, 6, 5 + hy, false);
  if (cast && i === 1) {
    sleeve(g, 7, 16, p.hand[0][0], p.hand[0][1]); sleeve(g, 18, 16, p.hand[1][0], p.hand[1][1]);
    glint(g, p.hand[0][0], p.hand[0][1], 0, -1); glint(g, p.hand[1][0], p.hand[1][1], 0, -1);
  }
  if (p.glow) glow(g, p.glow.x, p.glow.y, p.glow.s);
  for (const [sx, sy] of p.sparks) spark(g, sx, sy);
};

// ---------- EAST ----------
const HEAD_E = chk('HEAD_E', [
  '...HHHHHH.....', '..HjjHHHHHH...', '.HjHhHHHHHHH..', 'HHhHhHHHHHHHH.', 'HhHhHHhHHSSSS.', 'HhHhHHHSSSSSSS', 'hhHhHHSSSnnSSS',
  'hhHhHSSSSWWSSS', '.hhHSSSSWWSlSz', '..hhSSSSSSSSS.', '...hsSSSSSSs..',
], 14);
function bootEk(g, x, kind, far) {
  const rows = { stand: ['TTTT', 'UUUU'], fwd: ['.TTTT', 'TTTTU', 'UUUU.'], back: ['TTT.', 'UUUUU'], up: ['TTTT'] }[kind];
  const oy = kind === 'fwd' ? 24 : 25;
  const w = Math.max(...rows.map(r => r.length));
  stamp(g, rows.map(r => r.padEnd(w, '.')).map(r => far ? r.replace(/T/g, 'U') : r), x, oy, { outline: true });
}
compose.e = function (g, anim, i) {
  const q = poseE(anim, i), hy = q.hb;
  const p = { ...q, near: [q.near[0] - 1, Math.min(q.near[1] + 1, 24)], far: [q.far[0] - 1, Math.min(q.far[1] + 1, 24)] };
  if (q.glow) p.glow = { ...q.glow, x: q.glow.x - 1, y: q.glow.y + 1, s: Math.min(q.glow.s, 2) };
  if (q.palm) p.palm = [p.near, p.far];
  // cape trailing behind + tall collar behind head
  columns(g, 3, 9, x => (x < 6 ? 7 + (x === 4 ? -1 : 0) : 12) + hy * (x < 6 ? 1 : 0), x => 22 - (x < 5 ? 1 : 0) - ((x + p.sway) % 3 === 0 ? 1 : 0), (x, y, t, b) => {
    if (y === t) return x === 4 ? 'Y' : 'y';
    if (y === b) return (x & 1) ? 'M' : 'm';
    if (y === t + 1 || x === 3) return 'N';
    return x < 6 ? 'm' : x < 8 ? 'M' : 'Q';
  });
  bootEk(g, p.boots[1][0], p.boots[1][1], true);
  sleeve(g, 11, 17, p.far[0], p.far[1], { sleeve: 'X', c: { ...SLEEVE.c, sl: 'v' }, side: p.far[0] > 14 });
  stamp(g, ['BBBBBB', 'bBBnBB', '.nBnn.'], 9, 22, { outline: true });
  stamp(g, ['yVVVVy', 'yVVVVv', 'yvVVvv', 'BBBBBB', 'BbYyBn', 'yvvvvv'].map(r => r.padEnd(6, '.')), 9, 16, { outline: true });
  stamp(g, ['OO', 'oO'], 14, 17); g.set(14, 16, 'e');
  bootEk(g, p.boots[0][0], p.boots[0][1], false);
  sleeve(g, 12, 17, p.near[0], p.near[1], { side: p.near[0] > 14 });
  if (p.glow) glow(g, p.glow.x, p.glow.y, p.glow.s);
  if (p.palm) for (const [px, py] of p.palm) glint(g, px, py, 1, 0);
  stamp(g, HEAD_E, 6, 5 + hy, { outline: true });
  stamp(g, ['S.', 'SS', '.s'], 9, 9 + hy, { outline: true }); // ear pointing back
  for (const [dx, dy, c] of [[6, -1, 'H'], [6, -2, 'H'], [7, -3, 'H'], [8, -3, 'h'], [8, -2, 'h']]) g.set(6 + dx, 5 + hy + dy, c);
  if (p.eyes === 'x') { const y = 12 + hy; for (const [x, yy] of [[16, y], [17, y], [16, y - 1], [17, y - 1]]) g.set(x, yy, 'z'); }
  for (const [sx, sy] of p.sparks) spark(g, sx, sy);
};
