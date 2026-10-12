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

  // ---- v6 item 15 (Skin SHOP): per-skin recolour. A skin tint (IT.Skins.tintRgb, js/data/game.js) is applied to the sheet PALETTE (not per pixel), cached per
  // name|skin. `skin` (4th arg of canvas) forces one; the spell icons ('icons' sheet, spell keys only) follow the equipped player skin automatically.
  const palCache = new Map();
  const hexRgba = h => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length > 6 ? h.slice(6) : '']; };
  const toHex = c => '#' + [c[0], c[1], c[2]].map(v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('');
  function tintedPal(name, skin, keep) {
    const ck = name + '|' + skin + '|' + (keep || '');
    let p = palCache.get(ck);
    if (p) return p;
    const base = sheets[name] && sheets[name].pal, T = IT.Skins && IT.Skins.tintRgb;
    if (!base || !T) return base;
    p = {};
    for (const ch in base) {
      if (keep && keep.indexOf(ch) >= 0) { p[ch] = base[ch]; continue; }
      const [r, g, b, a] = hexRgba(base[ch]);
      p[ch] = toHex(T(skin, [r, g, b])) + a;
    }
    palCache.set(ck, p);
    return p;
  }
  const SPELL_ICON = { coldsnap: 1, ghostwalk: 1, icewall: 1, emp: 1, tornado: 1, alacrity: 1, sunstrike: 1, forgespirit: 1, chaosmeteor: 1, deafeningblast: 1 };
  // equipped player skin id ('default'|'kid'|'dark'|'exalted'): the SHOP choice when js/data/shop.js is loaded, else the Settings heroSkin (kid / dark)
  function playerSkin() {
    try {
      if (IT.Shop && IT.Shop.equipped) return IT.Shop.equipped('player') || 'default';
      const sk = IT.Settings && IT.Settings.get && IT.Settings.get().heroSkin;
      return HERO_SKINS[sk] ? sk : 'default';
    } catch (e) { return 'default'; }
  }

  // Cached canvas for a frame; mirror=true flips horizontally (west-facing from east frames). skin: recolour with that skin's tint (see above).
  function canvas(name, key, mirror, skin) {
    if (skin === undefined && name === 'icons' && SPELL_ICON[key]) skin = playerSkin();
    if (skin === 'default' || skin === 'scarecrow') skin = null;
    const ck = name + '|' + key + (mirror ? '|m' : '') + (skin ? '|' + skin : '');
    let cv = cache.get(ck);
    if (cv) return cv;
    const s = sheets[name];
    const rows = s && s.frames[key];
    if (!rows) return null;
    const pal = skin ? tintedPal(name, skin, name === 'forge' ? 'K' : '') : s.pal;
    const h = rows.length, w = rows[0].length;
    cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      ctx.fillStyle = pal[ch];
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

  // Hero skin sheet: the equipped SHOP skin (playerSkin); falls back to 'invoker' if a sheet is missing.
  const HERO_SKINS = { default: 'invoker', kid: 'invoker_kid', dark: 'invoker_dark', exalted: 'invoker_exalted' };
  function heroSheet() {
    const n = HERO_SKINS[playerSkin()];
    return n && sheets[n] ? n : 'invoker';
  }
  // training scarecrow sheet: 'scarecrow' or the bought 'scarecrow_raven' (js/art/dummies.js)
  const DUMMY_SHEETS = { scarecrow: 'scarecrow', raven: 'scarecrow_raven' };
  function dummySheet() {
    let sk = 'scarecrow';
    try { if (IT.Shop && IT.Shop.equipped) sk = IT.Shop.equipped('dummy') || 'scarecrow'; } catch (e) { /* default */ }
    const n = DUMMY_SHEETS[sk];
    return n && sheets[n] ? n : 'scarecrow';
  }
  // Forge Spirit sheet for the equipped player skin: a virtual sheet 'forge_<skin>' (same frames, tinted palette; the black outline K stays) registered lazily
  function forgeSheet() {
    const sk = playerSkin(), base = sheets.forge;
    if (!base || sk === 'default') return 'forge';
    const n = 'forge_' + sk;
    if (!sheets[n]) { const pal = tintedPal('forge', sk, 'K'); if (!pal) return 'forge'; sheets[n] = { pal, anchor: base.anchor, frames: base.frames }; }
    return n;
  }

  IT.Art = { sheet, frame, canvas, count, sheets, heroSheet, dummySheet, forgeSheet, playerSkin, HERO_SKINS, DUMMY_SHEETS };
})(typeof window !== 'undefined' ? window : globalThis);
