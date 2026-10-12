// Glowing cape / wings post-pass for the shop skins (v6 item 15): Dark Artistry (violet cloak, magenta glow) and Exalted (gold wings, red edge glow, ref 11.png).
// Takes one finished 26x28 frame (array of char arrays) and returns a PADDED frame (PX left/right, PY top) with the cape drawn BEHIND the sprite
// (only on empty px), a bright rim on the cape's outer edge (the "glow"), a 1px translucent halo outside it, and (back view) a cape panel over the back.
// Palette chars (add to the skin palette): L J I H G cape ramp light..dark, T trim, R / S glow rim (bright / dim, they chase along the edge per frame),
// g / h halo (translucent).
export const PX = 9, PY = 3, BW = 26, BH = 28;
export const CAPE_CHARS = 'LJIHGTRSgh';

// ---- shapes (left side, body coords 0..25 x 0..27; the right side mirrors x -> 25 - x). Vertex lists, even-odd filled.
const SHAPES = {
  wings: {
    sn: [[10, 10], [5, 3], [-1, 0], [0, 4], [-5, 3], [-3, 8], [-8, 9], [-5, 14], [-8, 17], [-4, 20], [-6, 24], [-2, 24], [-3, 27], [3, 26], [10, 22]],
    e: [[12, 10], [7, 3], [0, 0], [1, 4], [-5, 4], [-2, 9], [-8, 11], [-4, 15], [-7, 19], [-3, 21], [-5, 26], [3, 24], [12, 22]],
    back: [[8, 13], [17, 13], [19, 21], [17, 25], [13, 23], [9, 25], [6, 21]],
  },
  cloak: {
    sn: [[9, 11], [4, 12], [-1, 16], [-3, 22], [-2, 26], [2, 25], [4, 27], [8, 26], [10, 24]],
    e: [[12, 12], [6, 13], [0, 17], [-3, 24], [-2, 27], [3, 26], [6, 27], [11, 25]],
    back: [[7, 13], [18, 13], [20, 22], [17, 26], [13, 24], [9, 26], [5, 22]],
  },
};

function inside(poly, px, py) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// sway: a phase 0..2pi per anim frame moves the vertices sideways in proportion to their distance below the shoulder (cloth hangs and swings)
function shape(kind, dir, anim, i, n) {
  const S = SHAPES[kind], base = dir === 'e' ? S.e : S.sn;
  const ph = (i / Math.max(1, n)) * Math.PI * 2, amp = anim === 'walk' ? 1.6 : anim === 'idle' ? 0.9 : 1.2;
  const lift = anim === 'cast' && i === 1 ? -1.5 : anim === 'attack' && i === 1 ? -1 : 0;   // wings flare up on the cast / swing
  return base.map(([x, y]) => {
    const k = Math.max(0, (y - 2) / 24);
    const out = x < 9 ? -1 : 0;
    return [x + Math.sin(ph + y * 0.18) * amp * k * (kind === 'wings' ? 1.2 : 1) + out * Math.max(0, -lift) * 0.5, y + (y < 14 ? lift : 0)];
  });
}

// out: BH arrays of BW chars (the finished sprite incl. its K outline) -> padded rows (strings)
export function addCape(out, o) {
  const { kind, dir, anim, i, n } = o, W2 = BW + 2 * PX, H2 = BH + PY;
  const sp = Array.from({ length: H2 }, () => Array(W2).fill('.'));
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) sp[y + PY][x + PX] = out[y][x];
  const body = (x, y) => x >= 0 && y >= 0 && x < W2 && y < H2 && sp[y][x] !== '.';
  const mask = new Set();
  const key = (x, y) => y * 1000 + x;
  const polyL = shape(kind, dir, anim, i, n);
  const polyR = polyL.map(([x, y]) => [BW - 1 - x, y]);
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    const bx = x - PX + 0.5, by = y - PY + 0.5;
    if (inside(polyL, bx, by) || (dir !== 'e' && inside(polyR, bx, by))) mask.add(key(x, y));
  }
  const M = (x, y) => mask.has(key(x, y)) && !body(x, y);
  const empty = (x, y) => x >= 0 && y >= 0 && x < W2 && y < H2 && !body(x, y) && !mask.has(key(x, y));
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const g = sp.map(r => r.slice());
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    if (!M(x, y)) continue;
    // depth = steps to the nearest outside px (1 = outer rim)
    let d = 9;
    for (let r = 1; r <= 3 && d === 9; r++) for (let dy = -r; dy <= r && d === 9; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W2 || yy >= H2 || empty(xx, yy)) { d = r; break; }
    }
    const cx = (x - PX) / (BW - 1);                         // 0..1 across the body
    const nearBody = Math.abs(cx - 0.5) < 0.42 ? 1 : 0;
    const left = x < PX + BW / 2, stripe = (((left ? x + y * 1.5 : x - y * 1.5) | 0) % 4 + 4) % 4 === 0;   // feather ribs fan out from the shoulders
    let c;
    if (d === 1) c = ((x + y + i * 2) % 6) < 3 ? 'R' : 'S';
    else if (d === 2) c = 'L';
    else c = stripe ? 'I' : nearBody ? 'H' : 'J';
    if (d >= 3 && nearBody && y > BH / 2 + PY) c = stripe ? 'H' : 'G';
    g[y][x] = c;
  }
  // halo: empty px next to a rim px
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    if (!empty(x, y)) continue;
    if (N4.some(([dx, dy]) => M(x + dx, y + dy) && (g[y + dy][x + dx] === 'R' || g[y + dy][x + dx] === 'S'))) g[y][x] = 'g';
  }
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    if (g[y][x] !== '.' || !empty(x, y)) continue;
    if (N4.some(([dx, dy]) => g[y + dy] && g[y + dy][x + dx] === 'g')) g[y][x] = 'h';
  }
  // back view: the cape panel hangs over the back (drawn on top of the body), trimmed in T with a glow-free hem
  if (dir === 'n') {
    const P = SHAPES[kind].back.map(([x, y]) => [x + Math.sin(((i / Math.max(1, n)) * Math.PI * 2) + y * 0.3) * 0.5, y]);
    const pin = (x, y) => inside(P, x - PX + 0.5, y - PY + 0.5);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      if (!pin(x, y)) continue;
      const edge = N4.some(([dx, dy]) => !pin(x + dx, y + dy));
      const stripe = (((x * 2 + y) % 5) + 5) % 5 === 0;
      g[y][x] = edge ? 'T' : stripe ? 'I' : (y - PY) > 20 ? 'H' : 'J';
    }
  }
  return g.map(r => r.join(''));
}
