// Art registry. Sheets of ASCII pixel frames, 1 char = 1 px, '.' = transparent.
// IT.Art.sheet(name, { pal:{ch:'#rrggbb'|'#rrggbbaa'}, anchor:[x,y], frames:{ key:[rows] } })
// Frame keys: `${anim}_${dir}_${i}` with dir in s|n|e (west = mirrored east), or plain names for icons.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const sheets = {};
  const cache = new Map();

  function sheet(name, def) {
    for (const k in def.frames) {
      const rows = def.frames[k];
      const w = rows[0].length;
      for (const r of rows) if (r.length !== w) throw new Error(`art ${name}.${k}: ragged row "${r}"`);
      for (const r of rows) for (const ch of r) if (ch !== '.' && !(ch in def.pal)) throw new Error(`art ${name}.${k}: unknown color '${ch}'`);
    }
    sheets[name] = def;
  }

  function frame(name, key) {
    const s = sheets[name];
    return s && s.frames[key];
  }

  // Cached canvas for a frame; mirror=true flips horizontally (west-facing from east frames).
  function canvas(name, key, mirror) {
    const ck = name + '|' + key + (mirror ? '|m' : '');
    let cv = cache.get(ck);
    if (cv) return cv;
    const s = sheets[name];
    const rows = s && s.frames[key];
    if (!rows) return null;
    const h = rows.length, w = rows[0].length;
    cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      ctx.fillStyle = s.pal[ch];
      ctx.fillRect(mirror ? w - 1 - x : x, y, 1, 1);
    }
    cache.set(ck, cv);
    return cv;
  }

  // Frame count of an animation for a direction (counts consecutive indices from 0).
  function count(name, anim, dir) {
    const s = sheets[name];
    if (!s) return 0;
    let n = 0;
    while (s.frames[`${anim}_${dir}_${n}`]) n++;
    return n;
  }

  IT.Art = { sheet, frame, canvas, count, sheets };
})(typeof window !== 'undefined' ? window : globalThis);
