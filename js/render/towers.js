// Tower sprites: pixel-art Radiant (allied, pale stone + gold/green) and Dire (enemy, dark stone + red) towers, baked once per
// team x tier. API: IT.TowerDraw.draw(R, e, sx, sy) sprite (y-sorted pass; sx, sy = screen px of the base centre),
// .hud(R, e, sx, sy) hp bar, .ground(R) selection + range rings, .lights(R), .proj(R, e, x, y, gy) tower shot, .reset().
// Static non-attacking buildings (map.structures: barracks, fort, filler, fountain, shop, outpost): .struct(R, s, sx, sy) (sx, sy = footprint centre), .structLights(R).
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const PX = IT.Pixel, TAU = Math.PI * 2;
  const SW = 32, SH = 64, AX = 16, AY = 58;     // sprite canvas, anchor (base centre) inside it
  const FOOT = 11;                              // px from the base centre to the front edge of the 3x3 footprint (12 px) minus a bit
  const OUT = '#0d0a12';
  // ramps: [hi, light, mid, dark, deep]
  const PAL = {
    0: { st: ['#d7d2bd', '#b3ad98', '#8c8774', '#665f55', '#43403c'], trim: '#e0b84a', trimD: '#8a6a22', roof: ['#5aa05a', '#3e7a44', '#285a30'], orb: '#9dff9d', orbC: [150, 255, 150], glow: '#7dff8a', bar: '#5dff7a' },
    2: { st: ['#cfc4a8', '#aa9f86', '#857b66', '#5e5646', '#3c372e'], trim: '#d4a640', trimD: '#7a5a1c', roof: ['#9a7a44', '#74582e', '#503a1e'], orb: '#ffe08a', orbC: [255, 220, 140], glow: '#ffd070', bar: '#ffd070' },
    1: { st: ['#6d6470', '#524a58', '#3d3644', '#2a242f', '#191520'], trim: '#a63a2a', trimD: '#5a1c16', roof: ['#7a2a2a', '#561c20', '#3a1216'], orb: '#ff7a4a', orbC: [255, 110, 60], glow: '#ff6a3a', bar: '#ff5a4a' },
  };
  const sprites = {};    // 'team:tier' -> canvas
  const rubble = {};     // team -> canvas

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // outline pass: transparent pixels touching an opaque one become OUT
  function outline(c) {
    const x = c.getContext('2d'), w = c.width, h = c.height, id = x.getImageData(0, 0, w, h), d = id.data, out = [];
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      if (d[(py * w + px) * 4 + 3] > 0) continue;
      const nb = (a, b) => a >= 0 && b >= 0 && a < w && b < h && d[(b * w + a) * 4 + 3] > 0;
      if (nb(px - 1, py) || nb(px + 1, py) || nb(px, py - 1) || nb(px, py + 1)) out.push(px, py);
    }
    x.fillStyle = OUT;
    for (let i = 0; i < out.length; i += 2) x.fillRect(out[i], out[i + 1], 1, 1);
  }

  // stone block span: light from the upper left, brick joints, per-pixel dither. Centre column ax, rows y0..y1, half-width hwTop -> hwBot
  function stone(x, P, ax, y0, y1, hwTop, hwBot, seed) {
    const st = P.st;
    for (let y = y0; y <= y1; y++) {
      const k = y1 === y0 ? 0 : (y - y0) / (y1 - y0), hw = Math.round(hwTop + (hwBot - hwTop) * k), x0 = ax - hw, x1 = ax + hw - 1, w = x1 - x0 + 1;
      for (let px = x0; px <= x1; px++) {
        const u = (px - x0) / Math.max(1, w - 1);
        let i = u < 0.16 ? 1 : u < 0.5 ? 2 : u < 0.8 ? 3 : 4;
        if (u < 0.05) i = 0;
        if (i === 1 && PX.bayer(px, y) > 0.55 + u) i = 2;
        const row = (y - y0) % 5;
        if (row === 4) i = Math.min(4, i + 1);                                           // horizontal mortar
        else if (((px + (((y - y0) / 5 | 0) & 1) * 3 + seed) % 6) === 0 && row !== 0) i = Math.min(4, i + 1);   // vertical joint
        x.fillStyle = st[i]; x.fillRect(px, y, 1, 1);
      }
    }
  }

  function bake(team, tier) {
    const P = PAL[team], c = canvas(SW, SH), x = c.getContext('2d');
    const block = (y0, y1, hwTop, hwBot, seed) => stone(x, P, AX, y0, y1, hwTop, hwBot, seed);
    const band = (y, hw, col) => { x.fillStyle = col; x.fillRect(AX - hw, y, hw * 2, 1); };
    const hT = { 1: 0, 2: 3, 3: 6, 4: 9 }[tier];   // taller shaft for higher tiers (shaft top shifts up)
    const top = AY - 32 - hT;                          // y of the shaft top
    // foundation (stepped)
    block(AY - 5, AY, 12, 12, 1);
    block(AY - 9, AY - 6, 10, 11, 2);
    band(AY - 9, 11, P.st[0]);
    // shaft (slightly tapered)
    block(top + 6, AY - 10, 7, 9, 3);
    // trim rings
    for (let y = top + 6 + 8; y < AY - 12; y += 11) { x.fillStyle = P.trim; x.fillRect(AX - 8, y, 16, 1); x.fillStyle = P.trimD; x.fillRect(AX - 8, y + 1, 16, 1); }
    // windows (dark slits with a coloured glint)
    for (let y = top + 11; y < AY - 14; y += 11) { x.fillStyle = '#120d18'; x.fillRect(AX - 1, y, 2, 4); x.fillStyle = P.trimD; x.fillRect(AX - 1, y + 3, 2, 1); }
    // balcony slab + upper turret
    block(top + 3, top + 5, 11, 11, 4);
    band(top + 3, 11, P.st[0]);
    x.fillStyle = P.trim; x.fillRect(AX - 11, top + 5, 22, 1);
    block(top - 5, top + 2, 6, 7, 5);
    // crenellations
    for (let i = -6; i < 6; i += 3) { x.fillStyle = P.st[2]; x.fillRect(AX + i, top - 8, 2, 3); x.fillStyle = P.st[0]; x.fillRect(AX + i, top - 8, 2, 1); }
    // roof / cap: Radiant = rounded green cap, Dire = spike
    if (team === 0) {
      for (let y = 0; y < 4; y++) { const hw = 4 - y; x.fillStyle = P.roof[y < 1 ? 0 : y < 3 ? 1 : 2]; x.fillRect(AX - hw - 1, top - 16 + y + 4, hw * 2 + 2, 1); }
    } else {
      for (let y = 0; y < 8; y++) { const hw = Math.max(0, 3 - (y >> 1)); x.fillStyle = P.roof[y < 3 ? 0 : y < 6 ? 1 : 2]; x.fillRect(AX - hw, top - 20 + y + 3, hw * 2 + 1, 1); }
      // side spikes on the balcony
      for (const s of [-1, 1]) for (let y = 0; y < 5; y++) { x.fillStyle = P.roof[1]; x.fillRect(AX + s * (11 + (y < 3 ? 0 : 1)) - (s < 0 ? 0 : 1), top + 3 - y, 1, 1); }
    }
    // tier pips on the foundation
    for (let i = 0; i < tier; i++) { x.fillStyle = P.trim; x.fillRect(AX - tier * 2 + 1 + i * 4, AY - 3, 2, 2); }
    outline(c);
    c._orbY = top - 8;   // orb centre (sprite px)
    return c;
  }

  function sprite(team, tier) {
    const k = team + ':' + tier;
    return sprites[k] || (sprites[k] = bake(team, tier));
  }

  function bakeRubble(team) {
    const P = PAL[team], c = canvas(34, 18), x = c.getContext('2d');
    x.fillStyle = 'rgba(8,6,10,0.55)';
    for (let yy = 0; yy < 7; yy++) { const hw = Math.round(14 * Math.sqrt(1 - Math.pow((yy - 3) / 3.6, 2))); x.fillRect(17 - hw, 9 + yy, hw * 2, 1); }   // scorch
    const blocks = [[6, 11, 7, 5], [12, 8, 8, 6], [20, 10, 7, 5], [9, 14, 6, 4], [18, 14, 8, 4], [14, 12, 5, 4], [24, 13, 5, 3], [3, 13, 5, 3]];
    blocks.forEach((b, i) => {
      const [bx, by, bw, bh] = b;
      x.fillStyle = P.st[2 + (i & 1)]; x.fillRect(bx, by, bw, bh);
      x.fillStyle = P.st[0 + (i % 3 === 0 ? 0 : 1)]; x.fillRect(bx, by, bw, 1); x.fillRect(bx, by, 1, bh);
      x.fillStyle = P.st[4]; x.fillRect(bx, by + bh - 1, bw, 1); x.fillRect(bx + bw - 1, by, 1, bh);
    });
    x.fillStyle = P.trim; x.fillRect(8, 12, 2, 1); x.fillRect(22, 11, 3, 1); x.fillRect(15, 15, 2, 1);
    outline(c);
    return c;
  }

  // ---- static structures (map.structures): baked per kind (+ sub-kind) x team; footprint half-size hw tiles (3x3 -> hw 1, fort 5x5 -> hw 2)
  // v6: every kind has its own silhouette: melee barracks (hip roof + sword shield + pennants), ranged barracks (dome + bow emblem),
  // Ancient (huge team crystal on a stepped dais), effigy filler (robed statue holding an orb), fountain (basin + spire),
  // home shop (striped awning stall), secret shop (indigo tent + moon), outpost (watch post + banner).
  const SDIM = { melee: [44, 46], range: [44, 46], fort: [72, 84], filler: [32, 48], fountain: [48, 46], shop: [44, 40], secret: [40, 42], outpost: [32, 52] };
  const CRYS = { 0: ['#f2fff4', '#a8ffb8', '#58d880', '#268a50', '#11502e'], 1: ['#ffe0d0', '#ff7a52', '#d0302a', '#7c1418', '#3c080c'], 2: ['#fff6d8', '#ffe08a', '#d8a640', '#8a6420', '#4a3410'] };
  const structSpr = {};

  function bakeStruct(kind, team) {
    const P = PAL[team < 0 ? 2 : team], CR = CRYS[team < 0 ? 2 : team], d = SDIM[kind] || SDIM.filler, w = d[0], h = d[1], ax = w >> 1, base = h - 1, c = canvas(w, h), x = c.getContext('2d');
    const blk = (y0, y1, a, b, seed) => stone(x, P, ax, y0, y1, a, b, seed);
    const rect = (px, py, rw, rh, col) => { x.fillStyle = col; x.fillRect(px, py, rw, rh); };
    // hip roof: rows y0..y1, half-width a -> b, shingle lines every 3 rows
    const roof = (y0, y1, a, b) => {
      for (let y = y0; y <= y1; y++) {
        const k = (y - y0) / Math.max(1, y1 - y0), hw = Math.round(a + (b - a) * k), line = (y - y0) % 3 === 2;
        x.fillStyle = line ? P.roof[2] : k < 0.25 ? P.roof[0] : P.roof[1]; x.fillRect(ax - hw, y, hw * 2, 1);
        x.fillStyle = P.roof[0]; x.fillRect(ax - hw, y, 1, 1);
      }
    };
    // faceted crystal: diamond from (cx, y0) to (cx, y1), widest hw at k = mid; lit left facet, dark right facet, white core streak
    const crystal = (cx, y0, y1, hw, mid) => {
      for (let y = y0; y <= y1; y++) {
        const k = (y - y0) / Math.max(1, y1 - y0), ww = Math.max(0, Math.round(k < mid ? hw * k / mid : hw * (1 - k) / (1 - mid)));
        for (let px = cx - ww; px <= cx + ww; px++) {
          const u = ww ? (px - cx) / ww : 0;
          x.fillStyle = u < -0.55 ? CR[1] : u < 0 ? CR[2] : u < 0.5 ? CR[3] : CR[4];
          if (px === cx - 1 && k > 0.12 && k < 0.8) x.fillStyle = CR[0];
          x.fillRect(px, y, 1, 1);
        }
      }
    };
    const door = (cx, y0, dw, dh) => { rect(cx - dw / 2 - 1, y0 - 1, dw + 2, dh + 1, P.trimD); rect(cx - dw / 2, y0, dw, dh, '#120d18'); };
    const pennant = (px, y0, dir) => { rect(px, y0, 1, 30 - y0, P.st[4]); for (let i = 0; i < 4; i++) rect(dir > 0 ? px + 1 : px - 4 + i, y0 + i, 4 - i, 1, i < 2 ? P.roof[0] : P.roof[1]); };
    let orbY = null;
    if (kind === 'melee') {   // barracks (melee): hip roof, shield + sword over the door, two pennants
      blk(30, base, 12, 12, 2); rect(ax - 12, 30, 24, 1, P.st[0]);
      roof(13, 29, 3, 15); rect(ax - 3, 12, 6, 1, P.trim);
      door(ax, 38, 4, 8);
      rect(ax - 4, 31, 8, 6, P.trim); rect(ax - 3, 32, 6, 4, P.roof[1]); rect(ax - 2, 36, 4, 1, P.trim);   // shield
      rect(ax, 29, 1, 9, '#e8e8f0'); rect(ax - 2, 33, 5, 1, P.trimD); rect(ax, 28, 1, 1, '#ffffff');      // sword
      for (const o of [-9, 7]) { rect(ax + o, 33, 2, 3, '#120d18'); rect(ax + o, 35, 2, 1, P.trimD); }
      pennant(ax - 12, 4, -1); pennant(ax + 11, 4, 1);
    } else if (kind === 'range') {   // barracks (ranged): low wall with arrow slits, dome roof, bow emblem
      blk(30, base, 12, 12, 5); rect(ax - 12, 30, 24, 1, P.st[0]);
      for (let y = 0; y < 15; y++) {   // dome
        const hw = Math.round(13 * Math.sqrt(Math.max(0, 1 - Math.pow((14 - y) / 15, 2))));
        for (let px = ax - hw; px < ax + hw; px++) { const u = (px - ax + hw) / Math.max(1, 2 * hw); rect(px, 15 + y, 1, 1, u < 0.3 ? P.roof[0] : u < 0.75 ? P.roof[1] : P.roof[2]); }
      }
      rect(ax - 1, 10, 2, 5, P.trim); rect(ax - 2, 9, 4, 1, P.trimD);
      for (let y = 18; y <= 27; y++) { const bx = ax - 5 + Math.round(3 * Math.sin((y - 18) / 9 * Math.PI)); rect(bx, y, 1, 1, P.trim); }   // bow arc
      rect(ax - 5, 18, 1, 10, '#e8e0c8'); rect(ax - 6, 22, 10, 1, '#e8e0c8'); rect(ax + 4, 21, 1, 3, '#ffffff');                // string + arrow
      for (const o of [-9, -4, 3, 8]) { rect(ax + o, 33, 1, 5, '#120d18'); rect(ax + o - 1, 35, 3, 1, '#120d18'); }               // cross slits
      door(ax, 39, 4, 7);
    } else if (kind === 'fort') {   // Ancient: stepped dais + huge team crystal + flanking shards
      blk(70, base, 22, 24, 1); rect(ax - 22, 70, 44, 1, P.st[0]);
      blk(62, 69, 16, 19, 3); rect(ax - 16, 62, 32, 1, P.st[0]); rect(ax - 19, 69, 38, 1, P.trim);
      for (const s of [-1, 1]) { crystal(ax + s * 15, 42, 66, 4, 0.55); blk(64, 70, 4, 5, 6 + s); }
      crystal(ax, 2, 64, 13, 0.45);
      rect(ax - 16, 61, 32, 1, P.trim);
      for (let i = -14; i < 14; i += 5) rect(ax + i, 66, 2, 2, P.trimD);
      orbY = 26;
    } else if (kind === 'filler') {   // effigy: robed statue (team cloth) on a wide plinth, both arms raised holding the team orb
      blk(37, base, 12, 12, 2); rect(ax - 12, 37, 24, 1, P.st[0]); rect(ax - 12, 41, 24, 1, P.trim);
      for (let y = 18; y < 37; y++) {   // robe: shoulders -> hem
        const hw = Math.round(5 + (y - 18) * 0.22);
        for (let px = ax - hw; px < ax + hw; px++) { const u = (px - ax + hw) / Math.max(1, 2 * hw); rect(px, y, 1, 1, u < 0.22 ? P.roof[0] : u < 0.62 ? P.roof[1] : P.roof[2]); }
      }
      rect(ax - 1, 19, 2, 17, P.trim); rect(ax - 6, 35, 12, 1, P.trimD); rect(ax - 5, 18, 10, 1, P.st[1]);   // stole + hem
      rect(ax - 3, 11, 6, 7, P.st[1]); rect(ax + 1, 12, 2, 6, P.st[3]); rect(ax - 3, 11, 6, 1, P.st[0]);    // stone face
      rect(ax - 4, 10, 8, 2, P.roof[1]); rect(ax - 4, 10, 1, 7, P.roof[1]); rect(ax + 3, 10, 1, 7, P.roof[2]);   // hood
      rect(ax - 2, 14, 1, 1, P.orb); rect(ax + 1, 14, 1, 1, P.orb);                                          // glowing eyes
      for (const sd of [-1, 1]) for (let i = 0; i < 12; i++) { const px = ax + sd * (5 - Math.round(i * 0.25)) - (sd > 0 ? 1 : 0); rect(px, 18 - i, 2, 1, i > 9 ? P.st[1] : P.roof[sd < 0 ? 0 : 2]); }   // raised arms
      orbY = 5;
    } else if (kind === 'fountain') {   // basin + central spire with a team crystal
      const cy = 37;
      for (let yy = -9; yy <= 9; yy++) {
        const hw = Math.round(22 * Math.sqrt(Math.max(0, 1 - (yy / 9.6) * (yy / 9.6))));
        rect(ax - hw, cy + yy, hw * 2, 1, yy < -3 ? P.st[1] : yy > 4 ? P.st[3] : P.st[2]);
      }
      rect(ax - 19, cy + 7, 38, 1, P.st[4]);
      for (let yy = -7; yy <= 6; yy++) {
        const hw = Math.round(18 * Math.sqrt(Math.max(0, 1 - (yy / 7.2) * (yy / 7.2))));
        for (let px = ax - hw; px < ax + hw; px++) rect(px, cy - 1 + yy, 1, 1, PX.bayer(px, yy + 40) > 0.55 ? '#7ae4ff' : yy < -2 ? '#2a98c8' : '#40b8e4');
      }
      blk(16, cy, 3, 5, 1); rect(ax - 5, 30, 10, 2, P.trim);
      crystal(ax, 2, 18, 4, 0.5);
      orbY = 9;
    } else if (kind === 'shop') {   // home shop: stone stall, striped awning, gold sign
      blk(24, base, 12, 12, 3); rect(ax - 12, 24, 24, 1, P.st[0]);
      roof(8, 23, 4, 15);
      for (let px = -14; px < 14; px += 4) { rect(ax + px, 25, 4, 4, (px / 4 & 1) ? '#f4f0e0' : P.trim); rect(ax + px, 28, 4, 1, P.trimD); }   // striped awning
      door(ax, 33, 4, 6); rect(ax + 6, 31, 5, 4, P.trim); rect(ax + 7, 32, 3, 2, '#fff2b0');
      rect(ax - 10, 31, 3, 3, '#c89040'); rect(ax - 10, 31, 3, 1, '#ffd070');   // gold crate
    } else if (kind === 'secret') {   // secret shop: indigo tent, crescent moon, hanging lantern
      for (let y = 4; y <= base - 2; y++) {
        const hw = Math.round((y - 4) * 0.55) + 1;
        for (let px = ax - hw; px < ax + hw; px++) { const u = (px - ax + hw) / Math.max(1, 2 * hw); rect(px, y, 1, 1, ((px - ax) & 3) === 0 ? '#2a1e5a' : u < 0.3 ? '#7a62d8' : u < 0.7 ? '#5440b0' : '#33287a'); }
      }
      rect(ax - 1, 1, 2, 4, '#c8b060');
      rect(ax - 4, base - 12, 8, 11, '#120d18'); rect(ax - 4, base - 12, 8, 1, '#7a62d8');
      for (const [mx, my] of [[0, 0], [1, 0], [-1, 1], [-1, 2], [-1, 3], [0, 4], [1, 4]]) rect(ax - 1 + mx, 12 + my, 1, 1, '#fff6c0');   // crescent
      rect(ax + 9, 22, 1, 4, '#3a2a1a'); rect(ax + 8, 26, 3, 3, '#ffd070'); rect(ax + 9, 27, 1, 1, '#ffffff');                          // lantern
      orbY = null;
    } else {   // outpost: neutral watch post with a banner and a glowing crystal
      blk(40, base, 10, 11, 2); rect(ax - 11, 40, 22, 1, P.st[0]);
      blk(20, 40, 5, 6, 3); rect(ax - 7, 18, 14, 3, P.trim); blk(18, 19, 7, 7, 4);
      rect(ax, 3, 1, 14, P.st[4]); rect(ax + 1, 3, 8, 5, P.roof[0]); rect(ax + 1, 7, 8, 1, P.roof[2]);
      rect(ax - 1, 30, 2, 5, '#120d18');
      orbY = 11;
    }
    outline(c);
    c._ax = ax; c._ay = base; c._orbY = orbY;
    return c;
  }

  const structFoot = s => (s.hw + 0.5) * 8 - 1;
  const subOf = (R, s) => (IT.Towers && IT.Towers.structSub && R && R.w ? IT.Towers.structSub(R.w.map, s) : s.sub || s.kind);
  const sprKind = sub => (sub === 'barracks' ? 'melee' : sub);
  const structSprite = (s, R) => { const k = sprKind(subOf(R, s)) + ':' + s.team; return structSpr[k] || (structSpr[k] = bakeStruct(sprKind(subOf(R, s)), s.team)); };

  // 32x32 HUD portrait of a building (tower entity or structure card): the sprite scaled to fit, pixel-crisp, bottom-aligned
  function portrait(U, w) {
    const c = canvas(32, 32); c.className = 'por';
    let spr = null;
    if (U.kind === 'tower') spr = U.destroyed ? (rubble[U.team] || (rubble[U.team] = bakeRubble(U.team))) : sprite(U.team, U.tier || 1);
    else if (U.structure) { const k = sprKind(U.sub || 'filler') + ':' + U.team; spr = structSpr[k] || (structSpr[k] = bakeStruct(sprKind(U.sub || 'filler'), U.team)); }
    if (!spr) return c;
    // crop the transparent margin, then scale by an integer-ish factor so it stays readable
    const id = spr.getContext('2d').getImageData(0, 0, spr.width, spr.height).data;
    let x0 = spr.width, y0 = spr.height, x1 = -1, y1 = -1;
    for (let y = 0; y < spr.height; y++) for (let x = 0; x < spr.width; x++) if (id[(y * spr.width + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return c;
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1, k = Math.min(30 / cw, 30 / ch), dw = Math.max(1, Math.round(cw * k)), dh = Math.max(1, Math.round(ch * k));
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(spr, x0, y0, cw, ch, Math.round((32 - dw) / 2), 31 - dh, dw, dh);
    void w;
    return c;
  }

  // (sx, sy) = screen px of the footprint centre
  function struct(R, s, sx, sy) {
    const cx = R.cx, x = Math.round(sx), y = Math.round(sy) + structFoot(s), spr = structSprite(s, R);
    if (x < -50 || x > R.VW + 50 || y < -10 || y - spr.height > R.VH + 10) return;
    const rx = (s.hw + 0.5) * 8 + 2;
    cx.fillStyle = 'rgba(0,0,0,0.3)';
    for (let i = 0; i < 6; i++) { const hw = Math.round(rx * Math.sqrt(1 - Math.pow((i - 2.5) / 3.2, 2))); cx.fillRect(x - hw + 3, y - 5 + i, hw * 2, 1); }
    cx.drawImage(spr, x - spr._ax, y - spr._ay);
    if (spr._orbY != null) {
      const P = PAL[s.team < 0 ? 2 : s.team], big = s.kind === 'fort', r = big ? 3 : 2, ox = x, oy = y - spr._ay + spr._orbY, pulse = 0.5 + 0.5 * Math.sin(R.time * 2.4 + s.tx);
      cx.fillStyle = OUT; cx.fillRect(ox - r - 1, oy - r, 2 * r + 2, 2 * r + 1); cx.fillRect(ox - r, oy - r - 1, 2 * r, 2 * r + 3);
      cx.fillStyle = s.kind === 'fountain' ? '#7ae8ff' : P.orb; cx.fillRect(ox - r, oy - r + 1, 2 * r, 2 * r - 1); cx.fillRect(ox - r + 1, oy - r, 2 * r - 2, 2 * r + 1);
      cx.fillStyle = '#fff'; cx.fillRect(ox - 1, oy - 1, 1, 1);
      R.glow(ox, oy, big ? 22 : 12, s.kind === 'fountain' ? '#6ad8ff' : P.glow, 0.3 + 0.2 * pulse);
    }
  }

  function structLights(R) {
    const sts = R.w.map.structures;
    for (let i = 0; i < sts.length; i++) {
      const s = sts[i], spr = structSprite(s, R); if (spr._orbY == null) continue;
      const sx = s.x / R.P - R.camX, sy = s.y / R.P - R.camY;
      if (sx < -60 || sx > R.VW + 60 || sy < -20 || sy - spr.height > R.VH + 60) continue;
      const P = PAL[s.team < 0 ? 2 : s.team];
      R.light(sx, sy + structFoot(s) - spr._ay + spr._orbY, s.kind === 'fort' ? 60 : 34, s.kind === 'fountain' ? [110, 220, 255] : P.orbC, s.kind === 'fort' ? 0.7 : 0.5);
    }
  }

  // ---- per-render state: muzzle flashes
  function hook(R) {
    if (R._towerHook) return;
    R._towerHook = true; R._tflash = new Map();
    R.w.on('towerAttack', p => R._tflash.set(p.unit, R.time));
    R._tdown = new Map(); R._thit = new Map();
    R.w.on('towerDown', p => R._tdown.set(p.unit, R.time));
    R.w.on('damage', p => { if (p.dealt > 0) R._thit.set(p.target, R.time); });
  }

  const dotRing = (R, x, y, r, col, a, phase) => {
    const cx = R.cx, n = Math.max(24, Math.round(TAU * r * 0.9));
    cx.fillStyle = col;
    for (let i = 0; i < n; i++) {
      if (((i + phase) & 3) > 1) continue;
      const ang = i / n * TAU, px = Math.round(x + Math.cos(ang) * r), py = Math.round(y + Math.sin(ang) * r);
      if (px < 0 || py < 0 || px >= R.VW || py >= R.VH) continue;
      if (a < 1 && PX.bayer(px + R.camX, py + R.camY) > a) continue;
      cx.fillRect(px, py, 1, 1);
    }
  };

  function tx(R, e) { R.interp(e); return [R.ix / R.P - R.camX, R.iy / R.P - R.camY]; }

  // y-sorted sprite. (sx, sy) = screen px of the tower's base centre.
  function draw(R, e, sx, sy) {
    hook(R);
    const cx = R.cx, x = Math.round(sx), y = Math.round(sy) + FOOT;
    if (x < -40 || x > R.VW + 40 || y < -10 || y - SH > R.VH + 10) return;
    if (e.destroyed) {
      const rb = rubble[e.team] || (rubble[e.team] = bakeRubble(e.team));
      cx.drawImage(rb, x - 17, y - 14);
      const td = R._tdown.get(e.id), age = td != null ? R.time - td : 99;
      if (age < 2.5) {        // falling dust
        const a = 1 - age / 2.5;
        for (let i = 0; i < 18; i++) {
          const px = x - 10 + ((i * 7 + 3) % 21), py = y - 10 - age * 14 - ((i * 5) % 9);
          if (PX.bayer(px + R.camX, py + R.camY) > a * 0.8) continue;
          cx.fillStyle = i & 1 ? '#8c8774' : '#665f55'; cx.fillRect(px, Math.round(py), 2, 1);
        }
      } else if (((R.time * 2 + e.id) | 0) % 3 === 0) { cx.fillStyle = 'rgba(80,76,84,0.5)'; cx.fillRect(x - 3 + (((R.time * 3) | 0) % 3), y - 15 - (((R.time * 5) | 0) % 4), 2, 2); }
      return;
    }
    const spr = sprite(e.team, e.tier);
    cx.drawImage(spr, x - AX, y - AY);
    // charged orb on top: pulses, flares right after a shot
    const P = PAL[e.team], t = R.time, tf = R._tflash.get(e.id), fl = tf != null ? Math.max(0, 1 - (t - tf) / 0.3) : 0;
    const ox = x, oy = y - AY + spr._orbY, r = 2 + (fl > 0.2 ? 1 : 0), pulse = 0.5 + 0.5 * Math.sin(t * 3 + e.id);
    cx.fillStyle = OUT; cx.fillRect(ox - r - 1, oy - r, 2 * r + 2, 2 * r + 1); cx.fillRect(ox - r, oy - r - 1, 2 * r, 2 * r + 3);
    cx.fillStyle = P.orb; cx.fillRect(ox - r, oy - r + 1, 2 * r, 2 * r - 1); cx.fillRect(ox - r + 1, oy - r, 2 * r - 2, 2 * r + 1);
    cx.fillStyle = '#fff'; cx.fillRect(ox - 1, oy - 1, 1 + (fl > 0.2 ? 1 : 0), 1);
    R.glow(ox, oy, 14 + fl * 10, P.glow, 0.35 + 0.25 * pulse + fl * 0.4);
    // hit flash
    const th = R._thit.get(e.id);
    if (th != null && t - th < 0.09) { cx.globalAlpha = 0.35; cx.drawImage(spr, x - AX, y - AY); cx.globalAlpha = 1; }
  }

  // hp bar (HUD pass, unlit)
  function hud(R, e, sx, sy) {
    const cx = R.cx, x = Math.round(sx), y = Math.round(sy) + FOOT;
    if (e.destroyed || x < -30 || x > R.VW + 30) return;
    const top = y - AY + sprite(e.team, e.tier)._orbY - 8, f = Math.max(0, Math.min(1, e.hp / e.maxHp)), w = 24;
    cx.fillStyle = '#000'; cx.fillRect(x - w / 2 - 1, top - 1, w + 2, 5);
    cx.fillStyle = '#220808'; cx.fillRect(x - w / 2, top, w, 3);
    cx.fillStyle = PAL[e.team].bar; cx.fillRect(x - w / 2, top, Math.round(w * f), 2);
    cx.fillStyle = 'rgba(255,255,255,0.35)'; cx.fillRect(x - w / 2, top, Math.round(w * f), 1);
    for (let i = 1; i < 4; i++) { cx.fillStyle = 'rgba(0,0,0,0.6)'; cx.fillRect(x - w / 2 + Math.round(w * i / 4), top, 1, 3); }
  }

  // ground layer: selection ring + attack range ring while the hero is near (or the tower is selected)
  function ground(R) {
    const w = R.w, h = w.hero;
    for (const e of w.ents) {
      if (e.dead || e.kind !== 'tower' || e.destroyed) continue;
      const [sx, sy] = tx(R, e), sel = IT.Input && IT.Input.selected === e.id;
      if (sx < -140 || sx > R.VW + 140 || sy < -140 || sy > R.VH + 140) continue;
      let a = 0;
      if (h && !h.dead && e.team !== h.team) {
        const d = Math.hypot(h.x - e.x, h.y - e.y), rng = e.attack.range;
        a = Math.max(0, Math.min(1, (rng + 450 - d) / 450)) * 0.55;   // fades in 450 u before the range edge
      }
      if (sel) a = Math.max(a, 0.7);
      if (a > 0.04) dotRing(R, sx, sy, e.attack.range / R.P, e.team === 1 ? '#ff5a4a' : '#5dff7a', a, (R.time * 6) | 0);
      if (sel) dotRing(R, sx, sy, 22, e.team === 1 ? '#ff5a4a' : '#5bff6e', 1, 0);
    }
    // selected static structure ('S<i>'): footprint ring (+ the fountain's attack range)
    const sv = IT.Input && IT.Input.selected, sts = w.map && w.map.structures;
    if (typeof sv === 'string' && sv[0] === 'S' && sts) {
      const s = sts[+sv.slice(1)];
      if (s) {
        const sx = s.x / R.P - R.camX, sy = s.y / R.P - R.camY, col = s.team === 1 ? '#ff5a4a' : s.team === 0 ? '#5bff6e' : '#ffd070';
        dotRing(R, sx, sy, (s.hw + 0.5) * 8 + 6, col, 1, 0);
        if (s.kind === 'fountain' && IT.Towers && IT.Towers.STRUCT_KV) dotRing(R, sx, sy, IT.Towers.STRUCT_KV.fountain.attack.range / R.P, col, 0.6, (R.time * 6) | 0);
      }
    }
  }

  function lights(R) {
    for (const e of R.w.ents) {
      if (e.dead || e.kind !== 'tower' || e.destroyed) continue;
      const [sx, sy] = tx(R, e);
      if (sx < -60 || sx > R.VW + 60 || sy < -20 || sy - SH > R.VH + 60) continue;
      const P = PAL[e.team], spr = sprite(e.team, e.tier);
      R.light(sx, sy + FOOT - AY + spr._orbY, 46, P.orbC, 0.7);
    }
  }

  // ground-pass blob shadows (shadows.js): one per standing tower; blob(R, x, y, rx, ry, alpha) in view px
  function shadows(R, blob) {
    const ents = R.w.ents, P = R.P;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || e.kind !== 'tower' || e.destroyed) continue;
      R.interp(e);
      blob(R, Math.round(R.ix / P - R.camX) + 3, Math.round(R.iy / P - R.camY) + FOOT, 14, 3, 0.42);
    }
  }

  // tower shot: Dire = ember fireball, Radiant = green-gold bolt. (x, y) = screen px with the height already applied, gy = ground y
  function proj(R, e, x, y, gy) {
    const cx = R.cx, t = R.time, dire = e.team === 1;
    const o = dire ? ['#3a0e0a', '#c02a14', '#ff8a2a', '#ffe6a0'] : ['#0e3a1a', '#2aa84a', '#a8ff7a', '#f4ffd0'];
    IT.FX.ddisc(R, x, y, 4, o[0], 1); IT.FX.ddisc(R, x, y, 3, o[1], 1); IT.FX.ddisc(R, x, y, 2, o[2], 1);
    cx.fillStyle = o[3]; cx.fillRect(x - 1, y - 1, 2, 2);
    if (((t * 24 + e.id) | 0) & 1) { cx.fillStyle = o[2]; cx.fillRect(x + 3, y - 2, 1, 1); cx.fillRect(x - 4, y + 1, 1, 1); }
    R.glow(x, y, 14, dire ? '#ff6a2a' : '#8aff6a', 0.6);
  }

  function reset() { for (const k in sprites) delete sprites[k]; for (const k in rubble) delete rubble[k]; for (const k in structSpr) delete structSpr[k]; }

  IT.TowerDraw = { draw, hud, ground, lights, proj, shadows, reset, struct, structLights, portrait, bakeStruct, SW, SH };
})(typeof window !== 'undefined' ? window : globalThis);
