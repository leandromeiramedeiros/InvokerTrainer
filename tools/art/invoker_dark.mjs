// 'Dark Artistry' Invoker skin: tall plum coat, bronze horn spikes, flaming hair crown, mask face, violet mist at the feet.
// Same skeleton/poses as the default sheet (poseS/poseN/poseE), own stamps + palette.
import { stamp, mirror, arm, glow, glint, spark, bootT, flipRows, columns, spike, W } from './invoker_gen_core.mjs';
import { basePose as poseS, poseN } from './invoker_stamps.mjs';
import { poseE } from './invoker_stamps_e.mjs';

export const PAL_D = {
  K: '#120a1c',
  P: '#8e66ac', Q: '#684490', q: '#472b64', r: '#2c1a42',
  C: '#ffdca4', c: '#dc9852', D: '#a56130', d: '#5e3216',
  F: '#fffbd0', f: '#ffe468', Y: '#ffc22e', y: '#ffb020', O: '#ff8a1c', E: '#e0481a',
  M: '#f0eaf8', m: '#c8bcdc', N: '#9486b0', n: '#6a5a88', z: '#34244c', e: '#ffe45a',
  v: '#a874ecbb', u: '#7c4ecb88',
  W: '#ffffff', a: '#eaffff', p: '#f4e8ff', '5': '#c08cff', '6': '#8a4af0',
  '1': '#7aeaff', '2': '#2aa8e0', '3': '#165a9c', '4': '#0a2a56', '7': '#4a24a8', '8': '#1e0e56',
  '9': '#ffc040', '0': '#ff7a1c', '#': '#b8300c', '$': '#4a1208', A: '#fff4c0',
};
const RAMPS_D = ['PQqr', 'CcDd', 'FfYOE', 'MmNn'];
const KEEP = 'KWaeFfYyOEvu';
const MO = { ramps: RAMPS_D, keep: KEEP, noRim: true };
const chk = (name, rows, w) => { rows.forEach((r, i) => { if (r.length !== w) throw new Error(`${name} row ${i} len ${r.length} != ${w}: ${r}`); }); return rows; };
const HANDS = { h1: 'M', h2: 'm', h3: 'N' };
const SLEEVE = { w: 3, sleeve: 'Q', c: { sl: 'P', sd: 'r', b1: 'C', b2: 'D', ...HANDS } };
const darkC = c => { for (const r of RAMPS_D) { const i = r.indexOf(c); if (i >= 0) return r[Math.min(i + 1, r.length - 1)]; } return c; };

// bronze horn sweeping up/out from the left shoulder (9 wide, y2..17)
const HORN = chk('HORN', [
  '...CC...', '..CCc...', '.CCc....', 'CCc.....', 'CCc.....', 'CCc.....', 'CCcD....', 'CCcD....', '.CCcD...', '.CCcD...', '..CCcD..', '..CCcDD.', '...CccDD', '...CccDD',
], 8);

function mist(g, i, dir) { // violet arcane wisps around the feet (drawn after the outline pass, only on empty px)
  const put = (x, y, c) => { if (g.get(x, y) === '.') g.set(x, y, c); };
  const hw = dir === 'e' ? [4, 20] : [2, 23];
  for (let x = hw[0]; x <= hw[1]; x++) {
    if (((x + i * 2) & 3) < 2) put(x, 27, 'u');
    if (((x + i) % 3) === 0) put(x, 26, 'v');
    if (((x * 5 + i * 3) % 7) === 0) put(x, 25, 'u');
  }
  for (const [x, y] of [[3 + (i & 1), 24], [22 - (i & 1), 24], [hw[0] + 4, 23 - (i & 1)]]) put(x, y, 'u');
}

// ---------------- SOUTH ----------------
const FLAME_S = chk('FLAME_S', [
  '....f.', '..f.fY', '..fYYF', '.fYYFF', '.YOFFF', 'fYOYFF', 'YOYFMM', 'OEMMMM', 'YOMMMM', 'fOmMMM', '.OmMMn', '.EmmMM', '..nmmM', '...dnm',
], 6); // placed at x=7,y=1 ; rows 6.. face
const FACE_FIX = [[2, 8, 'z'], [3, 8, 'e'], [4, 8, 'e'], [3, 7, 'z'], [4, 7, 'z'], [4, 11, 'z'], [5, 11, 'z']];
function headS(hy) {
  const rows = mirror(FLAME_S, { shiftFrom: 99, ...MO }).map(r => [...r]);
  for (const [x, y, c] of FACE_FIX) { rows[y][x] = c; rows[y][11 - x] = c; }
  for (const x of [5, 6]) rows[0][x] = x === 5 ? 'f' : '.';
  const hd = rows.map(r => r.join(''));
  return hd;
}
const COLLAR_S = chk('COLLAR_S', [
  '......c......', '......cP.....', '......DQP....', '......DQQP...', '.....DqQQQPPP', '.....DqQQQQQQ', '.....DqqQQQQQ', '....DqqqqQQQQ', '....DqqqqQQQQ',
], 13);

function torsoS(back) {
  const R = [
    '....CcQQPPPPr', '...CCcQPPPPPr', '...CcDQQPPPQr', '...cDDQQPPQQr', '....dQQQPPQQr',
    '....DDDDDDDDD', '....DcDDDcDDD', '....DDDDDDDDD', '....qQQQPPQQr',
  ].map(r => [...r]);
  // twin round buckles (3x3 rings at cols 8..10) + chain link across the centre
  const ring = ['CcC', 'cqc', 'DcD'];
  if (!back) { ring.forEach((rw, dy) => [...rw].forEach((c, dx) => { R[5 + dy][8 + dx] = c; })); R[6][11] = 'c'; R[6][12] = 'c'; }
  return mirror(R.map(r => r.join('')), { shiftFrom: 15, ...MO });
}
function coatS(g, sw) {
  const T = [26, 25, 26, 24, 25, 26, 25, 23, 23, 25, 26, 25, 24, 26, 25, 26];
  columns(g, 4, 21, () => 19, x => T[(x - 4 + sw + 16) % 16], (x, y, t, b) => {
    const fold = ((x + sw) % 4) === 0, right = x >= 13;
    let c = fold ? 'Q' : 'P';
    if (x >= 9 && x < 13) c = fold ? 'Q' : 'P';
    if (right) c = fold ? 'q' : 'Q';
    if (y === b) c = (x & 1) ? 'c' : 'D'; // bronze tattered trim
    else if (y === b - 1 && !fold) c = right ? 'Q' : 'P';
    return c;
  });
}

export const compose = {};

compose.s = function (g, anim, i) {
  const p = poseS(anim, i);
  const hy = p.hb;
  // horns (behind everything)
  stamp(g, HORN, 0, 3 + hy, { outline: true });
  stamp(g, flipRows(HORN, darkC), 18, 3 + hy, { outline: true });
  coatS(g, p.sway);
  const tor = torsoS().map(r => [...r]);
  for (const [side, lf] of [[0, p.lift[0]], [1, p.lift[1]]]) if (lf) { /* lifted foot: keep simple */ }
  stamp(g, tor.map(r => r.join('')), 0, 14, { outline: true });
  for (const [sd, k] of [['L', p.boots[0]], ['R', p.boots[1]]]) bootT(g, sd, k, { b: 'c', B: 'r', n: 'K' });
  arm(g, 4, 16, p.hand[0][0], p.hand[0][1], { ...SLEEVE, hand: p.handR[0] });
  arm(g, 21, 16, p.hand[1][0], p.hand[1][1], { ...SLEEVE, hand: p.handR[1] });
  if (p.glow) glow(g, p.glow.x, p.glow.y, p.glow.s);
  if (p.palm) for (const [px, py] of p.palm) glint(g, px, py);
  stamp(g, mirror(COLLAR_S, { shiftFrom: 14, ...MO }), 0, hy, { outline: true });
  const hd = headS(hy).map(r => [...r]);
  stamp(g, hd.map(r => r.join('')), 7, 1 + hy, { outline: true });
  g.set(12, hy, 'f'); g.set(13, hy, 'f'); g.set(12, 1 + hy, 'Y'); g.set(13, 1 + hy, 'Y');
  if (p.eyes === 'x') { const y = 9 + hy; for (const x of [10, 11, 14, 15]) g.set(x, y, 'z'); }
  for (const [sx, sy] of p.sparks) spark(g, sx, sy);
};

const HAIR_N = chk('HAIR_N', [
  '....f.', '..f.fY', '..fYYF', '.fYYFF', '.YOFFF', 'fYOYFF', 'YOYFfF', 'OYFfFF', 'YOYFFf', 'OYYFfF', '.OYYFF', '..OYYF', '...OEY',
], 6);
compose.n = function (g, anim, i) {
  const p = poseN(anim, i), hy = p.hb, cast = anim === 'cast';
  stamp(g, HORN, 0, 3 + hy, { outline: true });
  stamp(g, flipRows(HORN, darkC), 18, 3 + hy, { outline: true });
  coatS(g, p.sway);
  stamp(g, torsoS(true), 0, 14, { outline: true });
  for (const [sd, k] of [['L', p.boots[0]], ['R', p.boots[1]]]) bootT(g, sd, k, { b: 'c', B: 'r', n: 'K' });
  if (!cast || i !== 1) { arm(g, 4, 16, p.hand[0][0], p.hand[0][1], SLEEVE); arm(g, 21, 16, p.hand[1][0], p.hand[1][1], SLEEVE); }
  stamp(g, mirror(COLLAR_S, { shiftFrom: 14, ...MO }), 0, hy, { outline: true });
  stamp(g, mirror(HAIR_N, { shiftFrom: 99, ...MO }), 7, 1 + hy, { outline: true });
  g.set(12, hy, 'f'); g.set(13, hy, 'f'); g.set(12, 1 + hy, 'Y'); g.set(13, 1 + hy, 'Y');
  if (cast && i === 1) {
    arm(g, 4, 15, p.hand[0][0], p.hand[0][1], SLEEVE); arm(g, 21, 15, p.hand[1][0], p.hand[1][1], SLEEVE);
    glint(g, p.hand[0][0], p.hand[0][1], 0, -1); glint(g, p.hand[1][0], p.hand[1][1], 0, -1);
  }
  if (p.glow) glow(g, p.glow.x, p.glow.y, p.glow.s);
  for (const [sx, sy] of p.sparks) spark(g, sx, sy);
};

// ---------------- EAST (facing right) ----------------
const HEAD_E = chk('HEAD_E', [
  '....f.........', '...fYF........', '..fYYFFf......', '.fYOYFFFf.....', 'fYOYFFFFYf....', 'YOYFFFFFYYf...', 'OYFFFFFYYMMM..',
  'YOYFFFFFMMMMM.', 'OEYFFFFMzzeeM.', '.OYYFFMMMMMMMm', '..OYYYMMMMMMm.', '...OEYmMMMMzz.', '.....nmMMMmn..', '......nNmmn...',
], 14);
const TORSO_E = (() => {
  const R = [];
  for (let y = 0; y < 11; y++) {
    let r = '';
    for (let x = 0; x < 9; x++) r += x === 0 ? (y < 2 ? 'C' : 'P') : x < 3 ? 'Q' : x < 6 ? 'q' : 'r';
    if (y === 0) r = '.CcQQQPP.';
    R.push([...r]);
  }
  for (const y of [5, 6, 7]) for (let x = 0; x < 9; x++) R[y][x] = y === 6 ? 'D' : 'c';
  [['C', 'c', 'C'], ['c', 'q', 'c'], ['D', 'c', 'D']].forEach((rw, dy) => rw.forEach((c, dx) => { R[5 + dy][5 + dx] = c; }));
  for (let x = 0; x < 9; x++) R[10][x] = x & 1 ? 'c' : 'D';
  return R.map(r => r.join(''));
})();
const COLLAR_E = (() => {
  const top = [3, 2, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], bot = [10, 11, 12, 13, 14, 14, 14, 14, 14, 14, 14, 14, 14];
  const rows = Array.from({ length: 15 }, () => Array(13).fill('.'));
  for (let x = 0; x < 13; x++) for (let y = top[x]; y <= bot[x]; y++) rows[y][x] = y === top[x] ? (x < 4 ? 'C' : 'c') : y === top[x] + 1 ? 'P' : x === 0 ? 'D' : x < 4 ? 'Q' : x < 8 ? 'q' : 'r';
  return rows.map(r => r.join(''));
})();
function coatE(g, sw) {
  const T = [25, 26, 24, 26, 25, 23, 25, 26, 24, 25, 26];
  columns(g, 3, 13, x => (x < 6 ? 18 : 19), x => T[(x - 3 + sw + 11) % 11], (x, y, t, b) => {
    const fold = ((x + sw) % 4) === 1;
    let c = fold ? 'q' : x < 7 ? 'Q' : 'q';
    if (y === b) c = (x & 1) ? 'c' : 'D';
    return c;
  });
}
function bootEd(g, x, kind, far) {
  const rows = { stand: ['cDDDD', 'KKKKK'], fwd: ['.cDDDD', 'cDDDDK', 'KKKKK.'], back: ['cDDD.', 'KKKKK'], up: ['cDDDD'] }[kind];
  const oy = kind === 'fwd' ? 24 : 25;
  const w = Math.max(...rows.map(r => r.length));
  stamp(g, rows.map(r => r.padEnd(w, '.')).map(r => far ? r.replace(/c/g, 'D') : r), x, oy, { outline: true });
}
compose.e = function (g, anim, i) {
  const p = poseE(anim, i), hy = p.hb;
  const far = { ...SLEEVE, sleeve: 'q', c: { ...SLEEVE.c, sl: 'Q' } };
  coatE(g, p.sway);
  bootEd(g, p.boots[1][0], p.boots[1][1], true);
  arm(g, 11, 16, p.far[0], p.far[1], far);
  stamp(g, TORSO_E, 9, 14, { outline: true });
  bootEd(g, p.boots[0][0], p.boots[0][1], false);
  stamp(g, COLLAR_E, 2, hy, { outline: true });
  const hp = [[9, 16, 3], [7, 14, 3], [5, 12, 2], [3, 9, 2], [2, 6, 2], [3, 4, 1], [5, 2, 1]];
  spike(g, hp, ['C', 'c', 'D'], -2, 2 + hy, c => ({ C: 'c', c: 'D', D: 'd' }[c] ?? c)); // far horn, behind + darker
  spike(g, hp, ['C', 'c', 'D'], 0, hy);
  arm(g, 13, 16, p.near[0], p.near[1], SLEEVE);
  if (p.glow) glow(g, p.glow.x, p.glow.y, p.glow.s);
  if (p.palm) for (const [px, py] of p.palm) glint(g, px, py, 1, 0);
  stamp(g, HEAD_E, 7, 1 + hy, { outline: true });
  g.set(11, hy, 'f'); g.set(10, 1 + hy, 'Y');
  if (p.eyes === 'x') { const y = 9 + hy; g.set(16, y, 'z'); g.set(17, y + 1, 'z'); g.set(17, y, 'z'); g.set(16, y + 1, 'z'); }
  for (const [sx, sy] of p.sparks) spark(g, sx, sy);
};
compose.mist = mist;
