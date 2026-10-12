// Shared frame builder for skin sheets: composes every anim/dir frame with per-dir composers, adds the global outline, orbs + portrait.
import { G, W, H, NB } from './invoker_gen_core.mjs';
import { orbs, portrait } from './invoker_icons.mjs';

export const ANIMS = { idle: 4, walk: 4, cast: 3, attack: 3, stunned: 2 };

export function buildFrames(comps, o = {}) {
  const frames = {};
  let plain0 = null;
  for (const dir of ['s', 'n', 'e']) for (const [anim, n] of Object.entries(ANIMS)) for (let i = 0; i < n; i++) {
    const g = new G();
    comps[dir](g, anim, i);
    const out = g.a.map(r => r.slice());
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g.a[y][x] === '.' && NB.some(([dx, dy]) => g.get(x + dx, y + dy) !== '.')) out[y][x] = 'K';
    if (o.post) { const h = new G(); h.a = out; o.post(h, i, dir, anim); }
    const rows = out.map(r => r.join(''));
    if (anim === 'idle' && dir === 's' && i === 0) plain0 = rows;   // portrait source stays the plain 26x28 frame even when the sheet is padded
    frames[`${anim}_${dir}_${i}`] = o.pad ? o.pad(out, { dir, anim, i, n }) : rows;
  }
  for (const k of ['q', 'w', 'e']) frames['orb_' + k] = orbs[k];
  frames.portrait = portrait(plain0, o.portraitY || 0);
  return frames;
}

// keep only palette entries a sheet uses
export function trimPal(pal, frames) {
  const used = new Set(); for (const k in frames) for (const r of frames[k]) for (const c of r) used.add(c);
  const out = {}; for (const c of used) if (c !== '.') { if (!(c in pal)) throw new Error('missing palette colour ' + c); out[c] = pal[c]; }
  return out;
}
export const fmt = o => '{\n' + Object.entries(o).map(([k, v]) => `  ${k}: [\n${v.map(r => `    '${r}'`).join(',\n')}\n  ]`).join(',\n') + '\n  }';
export const palStr = p => '{ ' + Object.entries(p).map(([k, v]) => `'${k}':'${v}'`).join(', ') + ' }';
