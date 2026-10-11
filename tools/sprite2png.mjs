// Renders art sheets to PNG for review (no deps). Usage:
//   node tools/sprite2png.mjs <sheet> [scale=6] [bg=#1a2030]   -> tools/out/<sheet>.png (contact sheet, labeled rows by anim)
//   node tools/sprite2png.mjs <sheet> --ingame                  -> tools/out/<sheet>_ingame.png (frames at 1x and 3x on terrain)
// Loads js/art/art.js + every js/art/*.js.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ console, Math });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/art/art.js'), 'utf8'), ctx);
for (const f of fs.readdirSync(path.join(ROOT, 'js/art')).sort()) {
  if (f === 'art.js' || !f.endsWith('.js')) continue;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/art', f), 'utf8'), ctx, { filename: f });
}
const Art = ctx.IT.Art;
const [name, a2, a3] = process.argv.slice(2);
if (!name || !Art.sheets[name]) { console.log('sheets:', Object.keys(Art.sheets).join(', ')); process.exit(name ? 1 : 0); }
const S = Art.sheets[name];
const ingame = a2 === '--ingame';
const scale = ingame ? 1 : +(a2 || 6);
const bg = hex(ingame ? '#2a3324' : (a3 || '#1a2030'));

function hex(h) { h = h.replace('#', ''); if (h.length === 6) h += 'ff'; return [0, 2, 4, 6].map(i => parseInt(h.slice(i, i + 2), 16)); }
const keys = Object.keys(S.frames);
// group by anim prefix (before last two _ parts) for rows
const groups = new Map();
for (const k of keys) { const m = k.match(/^(.*)_[sne]_\d+$/); const g = m ? k.replace(/_\d+$/, '') : '_icons'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(k); }
const pad = 2;
let maxW = 0, maxH = 0;
for (const k of keys) { maxW = Math.max(maxW, S.frames[k][0].length); maxH = Math.max(maxH, S.frames[k].length); }
const cols = Math.max(...[...groups.values()].map(g => g.length));
const scales = ingame ? [1, 3] : [scale];
const cellW = maxW + pad, cellH = maxH + pad;
const W = scales.reduce((a, s) => a + (cellW * cols) * s + 8, 8);
const H = groups.size * cellH * Math.max(...scales) + 8;
const img = new Uint8Array(W * H * 4);
for (let i = 0; i < W * H; i++) img.set(bg, i * 4);
// in-game view: speckled grass so contrast is honest
if (ingame) for (let i = 0; i < W * H; i++) { const r = (Math.sin(i * 12.9898) * 43758.5453) % 1; if (Math.abs(r) < 0.08) img.set(hex('#344029'), i * 4); }
function put(x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4, a = c[3] / 255;
  for (let k = 0; k < 3; k++) img[i + k] = Math.round(img[i + k] * (1 - a) + c[k] * a);
  img[i + 3] = 255;
}
let ox = 4;
for (const s of scales) {
  let row = 0;
  for (const [, ks] of groups) {
    ks.forEach((k, ci) => {
      const rows = S.frames[k];
      const x0 = ox + ci * cellW * s, y0 = 4 + row * cellH * Math.max(...scales) + (maxH - rows.length) * s;
      rows.forEach((r, y) => [...r].forEach((ch, x) => {
        if (ch === '.') return;
        const c = hex(S.pal[ch]);
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(x0 + x * s + dx, y0 + y * s + dy, c);
      }));
    });
    row++;
  }
  ox += cellW * cols * s + 8;
}
// PNG encode
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = b => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; Buffer.from(img.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
fs.mkdirSync(path.join(ROOT, 'tools/out'), { recursive: true });
const out = path.join(ROOT, 'tools/out', name + (ingame ? '_ingame' : '') + '.png');
fs.writeFileSync(out, png);
console.log(out, `${W}x${H}`, 'rows:', [...groups.keys()].join(' '));
