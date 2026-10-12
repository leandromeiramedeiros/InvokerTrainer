// Tower sprites: pixel-art Radiant (allied, pale stone + gold/green) and Dire (enemy, dark stone + red) towers, baked once per
// team x tier. API: IT.TowerDraw.draw(R, e, sx, sy) sprite (y-sorted pass; sx, sy = screen px of the base centre),
// .hud(R, e, sx, sy) hp bar, .ground(R) selection + range rings, .lights(R), .proj(R, e, x, y, gy) tower shot, .reset().
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

  function bake(team, tier) {
    const P = PAL[team], c = canvas(SW, SH), x = c.getContext('2d');
    const st = P.st;
    // stone block span: light from the upper left, brick joints, per-pixel dither
    const block = (y0, y1, hwTop, hwBot, seed) => {
      for (let y = y0; y <= y1; y++) {
        const k = y1 === y0 ? 0 : (y - y0) / (y1 - y0), hw = Math.round(hwTop + (hwBot - hwTop) * k), x0 = AX - hw, x1 = AX + hw - 1, w = x1 - x0 + 1;
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
    };
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
    // ground shadow
    cx.fillStyle = 'rgba(0,0,0,0.32)';
    for (let i = 0; i < 6; i++) { const hw = 14 - Math.abs(i - 2) * 2 - (i > 3 ? 2 : 0); cx.fillRect(x - hw + 3, y - 3 + i, hw * 2, 1); }
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

  // tower shot: Dire = ember fireball, Radiant = green-gold bolt. (x, y) = screen px with the height already applied, gy = ground y
  function proj(R, e, x, y, gy) {
    const cx = R.cx, t = R.time, dire = e.team === 1;
    cx.fillStyle = 'rgba(0,0,0,0.3)'; cx.fillRect(x - 2, gy, 5, 2);
    const o = dire ? ['#3a0e0a', '#c02a14', '#ff8a2a', '#ffe6a0'] : ['#0e3a1a', '#2aa84a', '#a8ff7a', '#f4ffd0'];
    IT.FX.ddisc(R, x, y, 4, o[0], 1); IT.FX.ddisc(R, x, y, 3, o[1], 1); IT.FX.ddisc(R, x, y, 2, o[2], 1);
    cx.fillStyle = o[3]; cx.fillRect(x - 1, y - 1, 2, 2);
    if (((t * 24 + e.id) | 0) & 1) { cx.fillStyle = o[2]; cx.fillRect(x + 3, y - 2, 1, 1); cx.fillRect(x - 4, y + 1, 1, 1); }
    R.glow(x, y, 14, dire ? '#ff6a2a' : '#8aff6a', 0.6);
  }

  function reset() { for (const k in sprites) delete sprites[k]; for (const k in rubble) delete rubble[k]; }

  IT.TowerDraw = { draw, hud, ground, lights, proj, reset, SW, SH };
})(typeof window !== 'undefined' ? window : globalThis);
