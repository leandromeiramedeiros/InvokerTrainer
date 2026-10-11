// Forge Spirit: molten lava elemental, 14x16, anchor [7,15]. s/n/e x idle2 walk4 attack2.
import { G, NB } from './invoker_gen_core.mjs';

const PAL = {
  K: '#1a0a10', r: '#9a8490', R: '#6a5662', q: '#42303e',
  o: '#ff9a28', O: '#ffd870', f: '#d4501c', E: '#fff6b0', j: '#ff7a1c',
};
const W = 14, H = 16;
const P = (g, rows, ox, oy) => rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] !== '.') g.set(ox + x, oy + y, r[x]); });
const chk = (rows) => { rows.forEach(r => { if (r.length !== W) throw new Error('forge row ' + r); }); return rows; };

const CROWN = [
  chk(['......jj......', '....j.jOj.j...', '....jOOOOOj...', '....fOEEOf....']),
  chk(['.......jj.....', '....j.Oj.j....', '...jOOOOOOj...', '....fOEEOf....']),
  chk(['.....jj.......', '...j.jOj.j....', '...jOOOOOj....', '....fOEEOf....']),
];
const rect = (g, x, y, w, h, c) => { for (let b = 0; b < h; b++) for (let a = 0; a < w; a++) g.set(x + a, y + b, c); };

function leg(g, x, lift, big) {
  const y = 13 - lift;
  P(g, ['rRq', 'rfq', big ? 'RRRq' : 'RRq'], x, y);
  if (lift) { g.set(x, y + 3, 'f'); }
}
function fist(g, x, y, big) {
  P(g, big ? ['oOo', 'OEO', 'ofo'] : ['oO', 'of'], x, y);
}

function bodyS(g, fi, back) {
  P(g, CROWN[fi], 0, 0);
  P(g, chk(back
    ? ['....rrRRRq....', '....rRRRRq....', '....qRRRRq....']
    : ['....rrRRRq....', '....rEqqEq....', '....qRffRq....']), 0, 4);
  P(g, chk([
    '..rrRjooRjqq..',
    '.rRRfffOOffqRq.'.slice(0,14),
    '.rRqffEEEffqq.'.slice(0,14),
    '..RRqfOOfqRR..',
    '....qffffq....',
  ]), 0, 7);
  if (back) { for (let y = 8; y < 12; y++) { g.set(6, y, y === 9 ? 'O' : 'f'); g.set(7, y, y === 10 ? 'O' : 'f'); } g.set(5, 9, 'f'); g.set(8, 10, 'f'); g.set(4, 8, 'j'); g.set(9, 8, 'j'); }
}

function armsS(g, a, fi) {
  // a: {l:[y,big], r:[y,big]}; arm from shoulder y8 to fist
  for (const [side, [fy, big]] of [[0, a.l], [1, a.r]]) {
    const x = side ? 12 : 0;
    for (let y = 8; y < fy; y++) { const c = (y === 9) ? 'f' : null; g.set(x, y, c || 'R'); g.set(x + 1, y, 'q'); if (!side) { g.set(x, y, c || 'r'); g.set(x + 1, y, 'R'); } }
    fist(g, big ? (side ? 10 : 1) - (side ? 0 : 1) + (side ? 0 : 0) : (side ? 12 : 0), fy, big);
  }
}

function frameS(anim, i, back) {
  const g = new G(W, H);
  const fi = anim === 'idle' ? i : anim === 'walk' ? [0, 1, 2, 1][i] : i;
  bodyS(g, fi % 3, back);
  let arms = { l: [11, 0], r: [11, 0] }, ll = 0, rl = 0;
  if (anim === 'idle') arms = { l: [11 + i, 0], r: [12 - i, 0] };
  if (anim === 'walk') {
    const s = [0, 1, 0, -1][i];
    arms = { l: [11 + s, 0], r: [11 - s, 0] };
    ll = [1, 0, 0, 0][i]; rl = [0, 0, 1, 0][i];
  }
  if (anim === 'attack') arms = i === 0 ? { l: [11, 0], r: [8, 1] } : { l: [11, 0], r: [12, 1] };
  armsS(g, arms, fi);
  leg(g, 4, ll); leg(g, 8, rl);
  if (anim === 'attack' && i === 1) { P(g, ['.jEj.', 'jEOEj', '.jEj.'], 9, 12); }
  return g;
}

function frameE(anim, i) {
  const g = new G(W, H);
  const fi = (anim === 'walk' ? [0, 1, 2, 1][i] : i) % 3;
  P(g, CROWN[fi], 0, 0);
  P(g, chk(['....rRRRRq....', '....rRRREq....', '....qRRffq....']), 0, 4);
  P(g, chk(['...rRRRooRq...', '...rRqfOfRq...', '...rqffEfqq...', '....qfOfRq....', '....qffffq....']), 0, 7);
  let sw = 0, lA = 0, lB = 0, xa = 5, xb = 7;
  if (anim === 'idle') sw = i;
  if (anim === 'walk') { sw = [-2, 0, 2, 0][i]; lA = [0, 1, 0, 0][i]; lB = [0, 0, 0, 1][i]; xa = 5 - sw; xb = 7 + sw; }
  // far arm
  g.set(9, 9, 'q'); g.set(9, 10, 'q'); fist(g, 8 - sw, 11, false);
  // legs (near = xa)
  leg(g, xb, lB); leg(g, xa, lA);
  // near arm
  const nx = 5 + sw + (anim === 'attack' ? (i === 0 ? -1 : 4) : 0), ny = anim === 'attack' && i === 1 ? 10 : 11;
  for (let y = 8; y < ny; y++) { g.set(Math.min(nx + 1, 8), y, 'R'); g.set(Math.min(nx + 1, 8) - 1, y, 'r'); }
  fist(g, nx, ny, anim === 'attack' && i === 1);
  if (anim === 'attack' && i === 1) P(g, ['.jEj.', 'jEOEj', '.jEj.'], 9, 9);
  return g;
}

export function buildForge() {
  const frames = {};
  const add = (name, g) => {
    const out = g.a.map(r => r.slice());
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g.a[y][x] === '.' && NB.some(([dx, dy]) => g.get(x + dx, y + dy) !== '.')) out[y][x] = 'K';
    frames[name] = out.map(r => r.join(''));
  };
  for (const dir of ['s', 'n', 'e']) {
    for (const [anim, n] of Object.entries({ idle: 2, walk: 4, attack: 2 })) for (let i = 0; i < n; i++) {
      add(`${anim}_${dir}_${i}`, dir === 'e' ? frameE(anim, i) : frameS(anim, i, dir === 'n'));
    }
  }
  return { pal: PAL, frames };
}
