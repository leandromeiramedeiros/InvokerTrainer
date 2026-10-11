// East (side view, facing right) composer.
import { G, stamp, arm, glow, glint, spark } from './invoker_gen_core.mjs';

const chk = (name, rows, w) => { rows.forEach((r, i) => { if (r.length !== w) throw new Error(`${name} row ${i} len ${r.length} != ${w}: ${r}`); }); return rows; };

// head, 12 wide, y1..y13 (placed at x=8)
const HEAD_E = chk('HEAD_E', [
  '...jHH........',
  '..HjHHH.......',
  '..yyHHHHH.....',
  '..HjjHHHH.....'.replace('HHHH.....','HHHHH....'),
  '.HjHhHHHHHH...',
  'HjHhHhHHHHHH..',
  'HHhHhHHSSSSSS.',
  'HhHhhHSSiiiSS.',
  'hHhHhSSSSEESS.',
  'hhHhhSSSSWISS.',
  'hhhhSSSSSSSSSo',
  '.hhhSSSSSSSSSs',
  '..hsSSSSSSSzS.',
  '...sSSSSSSSs..',
], 14);

// collar fan behind the head (13 wide), lit on the left
const COLLAR_E = (() => {
  const g = new G(13, 15);
  const top = [3, 2, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], bot = [10, 11, 12, 13, 14, 14, 14, 14, 14, 14, 14, 14, 14];
  for (let x = 0; x < 13; x++) for (let y = top[x]; y <= bot[x]; y++) {
    let c = 'y';
    if (y === top[x]) c = (x === 2 || x === 3) ? 'Y' : 'y';
    else if (y === top[x] + 1) c = 'y';
    else if (x === 0) c = (y & 1) ? 'y' : 'G';
    else if (x === 12 || (y === bot[x] && x >= 5)) c = 'N'; // thin magenta inner lining
    else if (x >= 8) c = 'G';
    else if (x >= 4) c = 'G';
    g.set(x, y, c);
  }
  return g.rows();
})();
const WING_E = chk('WING_E', [
  '..yN.', '..yNG', '.yNGG', '.yNGG',
], 5);

const TORSO_E = chk('TORSO_E', [
  '.RRRwwyl.', 'RRwwwcyll', 'RwwcwcGlL', 'wwcwcwGlL', 'wcwcwcGlL',
  'GyyyyyyyY', 'GgGgGgGgG', 'wcwcwcGlL', 'cwcwcwGlL', 'wcwcTcGlD', 'GyGyGyGyG',
], 9);

function capeE(sw) {
  const g = new G(11, 12);
  for (let r = 0; r < 12; r++) {
    const xl = Math.max(0, 3 - Math.floor(r / 3) - sw);
    for (let x = xl; x < 11; x++) {
      let c = 'u';
      const d = x - xl;
      if (d === 0) c = 'U';
      else if (d === 1) c = (r & 1) ? 'u' : 'U';
      else if (d === 4 + sw || d === 7) c = 'v';
      else if (d === 3 + sw || d === 6) c = (r & 1) ? 'u' : 'v';
      else if (x >= 9) c = 'V';
      g.set(x, r, c);
    }
    if (r === 11) for (let x = xl; x < 11; x++) g.set(x, r, (x & 1) ? 'G' : 'y');
    if (r === 10) for (let x = xl; x < 11; x++) g.set(x, r, (x + sw) % 3 ? 'v' : 'V');
  }
  return g.rows();
}

function bootE(g, x, kind, far) {
  const rows = { stand: ['bBBBB', 'nnnnn'], fwd: ['.bBBBB', 'bBBBBn', 'nnnnn.'], back: ['bBBB.', 'nnnnn'], up: ['bBBBB'] }[kind];
  const oy = kind === 'up' ? 25 : kind === 'fwd' ? 24 : 25;
  const w = Math.max(...rows.map(r => r.length));
  stamp(g, rows.map(r => r.padEnd(w, '.')).map(r => far ? r.replace(/b/g, 'B').replace(/B/g, 'B') : r), x, oy, { outline: true });
}

export function poseE(anim, i) {
  const p = { hb: 0, near: [15, 22], far: [11, 22], boots: [[12, 'stand', 0], [10, 'stand', 1]], sway: 0, glow: null, sparks: [], eyes: null, wing: 0 };
  if (anim === 'idle') { p.hb = [0, 0, 1, 1][i]; p.near = [15, [21, 22, 22, 21][i]]; p.far = [11, [22, 22, 21, 21][i]]; p.sway = [0, 0, 1, 1][i]; }
  if (anim === 'walk') {
    p.hb = [1, 0, 1, 0][i]; p.sway = [1, 0, 1, 0][i] ? 1 : 0;
    if (i === 0) { p.boots = [[14, 'fwd', 0], [7, 'back', 1]]; p.near = [9, 20]; p.far = [17, 20]; }
    if (i === 1) { p.boots = [[11, 'stand', 0], [11, 'up', 1]]; p.near = [12, 22]; p.far = [14, 22]; }
    if (i === 2) { p.boots = [[7, 'back', 0], [14, 'fwd', 1]]; p.near = [18, 20]; p.far = [9, 20]; }
    if (i === 3) { p.boots = [[11, 'up', 0], [11, 'stand', 1]]; p.near = [14, 22]; p.far = [12, 22]; }
  }
  if (anim === 'cast') { // Force Push: both arms out to the right
    p.hb = [0, 0, 1][i]; p.near = [[16, 18], [22, 17], [18, 18]][i]; p.far = [[15, 17], [21, 15], [17, 17]][i];
    p.palm = i === 1 ? [p.near, p.far] : null;
  }
  if (anim === 'attack') {
    p.hb = [0, 1, 0][i]; p.near = [[11, 19], [22, 18], [20, 18]][i]; p.far = [11, 22];
    p.glow = [null, { x: 23, y: 18, s: 3 }, { x: 21, y: 18, s: 1 }][i];
    p.boots = i === 1 ? [[13, 'fwd', 0], [9, 'back', 1]] : [[12, 'stand', 0], [10, 'stand', 1]];
  }
  if (anim === 'stunned') {
    p.hb = 2 - i; p.near = [14, 23]; p.far = [11, 23]; p.eyes = 'x'; p.sway = i;
    p.sparks = i ? [[8, 1], [20, 2], [14, 0]] : [[10, 0], [19, 1], [14, 2]];
  }
  return p;
}

export function eStamps(g, anim, i) {
  const p = poseE(anim, i);
  const hy = p.hb;
  stamp(g, capeE(p.sway), 3, 14, { outline: true });
  // far boot + far arm behind torso
  bootE(g, p.boots[1][0], p.boots[1][1], true);
  arm(g, 11, 16, p.far[0], p.far[1], { w: 3, sleeve: 'u' });
  stamp(g, TORSO_E, 9, 14, { outline: true });
  bootE(g, p.boots[0][0], p.boots[0][1], false);
  stamp(g, COLLAR_E, 2, hy, { outline: true });
  arm(g, 13, 16, p.near[0], p.near[1], { w: 3, hand: anim === 'cast' || anim === 'attack' ? 1 : 1 });
  if (p.glow) glow(g, p.glow.x, p.glow.y, p.glow.s);
  if (p.palm) for (const [px, py] of p.palm) glint(g, px, py, 1, 0);
  stamp(g, HEAD_E, 7, 1 + hy, { outline: true });
  stamp(g, WING_E, 12, 14 + hy, { outline: true });
  if (p.eyes === 'x') {
    const y = 9 + hy;
    g.set(16, y, 'E'); g.set(17, y + 1, 'E'); g.set(17, y, 'S'); g.set(16, y + 1, 'S');
    
  }
  for (const [sx, sy] of p.sparks) spark(g, sx, sy);
}
