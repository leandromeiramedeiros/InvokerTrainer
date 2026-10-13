// Ground shadows (v6 WP-render): one batched pass in the ground layer, under every sprite.
//  - blob shadows for everything that stands or flies: units (own + visible foes), towers, spell/projectile entities;
//  - airborne units keep their shadow on the GROUND at the real position; it shrinks + lightens with height (scaleByHeight);
//  - Tornado-lifted units get a faint cyclone pillar from the ground shadow up to the unit;
//  - falling spells (Chaos Meteor) cast a shadow that grows + darkens toward the landing point (reads the thinker's danger.at).
// Fog: same gates as the sprites / bars (UnitDraw.visible for units, the vision level for team-1 entities); nothing for hidden things.
// Blobs are cached ellipse sprites (two-tone: soft rim, darker core) blitted with globalAlpha: 1 drawImage per shadow, no per-frame allocation.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const PX = IT.Pixel;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  // ---- height model: scale 1 -> S_MIN, alpha A_GROUND -> A_AIR over LIFT_HEIGHT (world units; clamps outside) ----
  const S_MIN = 0.55, A_GROUND = 0.45, A_AIR = 0.2, H_FALLBACK = 120;
  const liftH = () => { const S = IT.Spells; return S && S.LIFT_HEIGHT > 0 ? S.LIFT_HEIGHT : H_FALLBACK; };
  const hk = (z, h) => { z = +z; if (!(z > 0)) return 0; const H = h > 0 ? h : liftH(); return z >= H ? 1 : z / H; };
  const scaleK = k => 1 - (1 - S_MIN) * k;
  const alphaK = k => A_GROUND - (A_GROUND - A_AIR) * k;
  // z in world units (sim u.z); h = full-height override (default Spells.LIFT_HEIGHT). Monotonic non-increasing, bounded [S_MIN,1] / [A_AIR,A_GROUND].
  function scaleByHeight(z, h) { const k = hk(z, h); return { scale: scaleK(k), alpha: alphaK(k) }; }

  // ---- blob sprite cache ----
  const blobs = new Map();
  const RX_MAX = 48;
  function blobCv(rx, ry) {
    const key = rx * 256 + ry;
    let c = blobs.get(key);
    if (c) return c;
    c = document.createElement('canvas'); c.width = rx * 2 + 1; c.height = ry * 2 + 1;
    const x = c.getContext('2d');
    for (let pass = 0; pass < 2; pass++) {      // soft rim (alpha .78) then a darker core (alpha 1) at 60 % of the radius
      const k = pass ? 0.6 : 1, rr = Math.max(0.5, rx * k), yy = pass ? Math.max(0, Math.round(ry * k)) : ry;
      x.fillStyle = pass ? 'rgba(0,0,0,1)' : 'rgba(0,0,0,0.78)';
      for (let dy = -yy; dy <= yy; dy++) {
        const hw = Math.round(rr * Math.sqrt(Math.max(0, 1 - (dy * dy) / ((yy + 0.5) * (yy + 0.5)))));
        x.fillRect(rx - hw, ry + dy, hw * 2 + 1, 1);
      }
    }
    blobs.set(key, c);
    return c;
  }

  const NOS = { lA: 0 };
  let night = 1;   // alpha multiplier of the frame (set by ground(); a bit stronger at night so shadows stay readable under the dark tint)
  // screen-space blob (x, y = ellipse centre in view px); a = alpha 0..1 before the night boost
  function blob(R, x, y, rx, ry, a) {
    a *= night;
    if (a < 0.02) return;
    rx = Math.round(rx); ry = Math.round(ry);
    if (rx < 1) rx = 1; else if (rx > RX_MAX) rx = RX_MAX;
    if (ry < 1) ry = 1; else if (ry > RX_MAX) ry = RX_MAX;
    x = Math.round(x); y = Math.round(y);
    if (x + rx < 0 || y + ry < 0 || x - rx > R.VW || y - ry > R.VH) return;
    R.cx.globalAlpha = a > 0.85 ? 0.85 : a;
    R.cx.drawImage(blobCv(rx, ry), x - rx, y - ry);
  }

  // ---- fog gate for sim effects (units use UnitDraw.visible) ----
  const lit = (R, x, y) => { const f = R.fog; return !f || R.w.fog === false || f.levelAt(x, y) > 1.5; };

  // ---- Tornado cyclone pillar: faint helical wind column from the ground shadow (x, y) up h px to the lifted unit ----
  const STRAND = ['#5ad7ff', '#d24dff', '#e8f4ff'];   // quas cyan / wex magenta / white: the Tornado palette
  function pillar(R, x, y, h, rr, Av) {
    h = Math.round(h);
    if (h < 5 || Av < 0.05) return;
    const cx = R.cx, t = R.time, B = PX.BAYER4, cX = R.camX, cY = R.camY, VW = R.VW, VH = R.VH;
    if (y < 0 || y - h > VH || x < -20 || x > VW + 20) return;
    const r0 = 2 + rr * 0.35, r1 = r0 + 5 + rr * 0.25;     // narrow at the ground, wide at the unit
    for (let layer = 0; layer < 3; layer++) {              // body: three nested translucent columns -> edges fade out
      cx.globalAlpha = (0.05 + layer * 0.035) * Av;
      cx.fillStyle = layer === 2 ? '#e8f4ff' : '#7ad8ff';
      const shrink = layer * 1.6;
      for (let j = 0; j < h; j += 2) {
        const u = j / h, r = Math.max(1, r0 + (r1 - r0) * u - shrink), yy = y - j;
        if (yy < 0 || yy > VH) continue;
        cx.fillRect(Math.round(x - r), yy - 1, Math.round(r * 2) + 1, 2);
      }
    }
    for (let k = 0; k < 3; k++) {                          // 3 helical strands, front half brighter
      cx.fillStyle = STRAND[k];
      for (let j = 0; j < h; j++) {
        const u = j / h, a = t * 7 + u * 9 + k * TAU / 3, cs = Math.cos(a), r = r0 + (r1 - r0) * u;
        const px = Math.round(x + Math.sin(a) * r * 0.9), py = y - j;
        if (py < 0 || py > VH || px < 0 || px >= VW) continue;
        const env = Math.min(1, u * 5 + 0.1, (1 - u) * 4 + 0.35);   // fade at the foot / near the unit
        if (B[((py + cY) & 3) << 2 | ((px + cX) & 3)] > env * (cs > 0 ? 0.9 : 0.45)) continue;
        cx.globalAlpha = (cs > 0 ? 0.55 : 0.28) * Av;
        cx.fillRect(px, py, cs > 0 ? 2 : 1, 1);
      }
    }
  }

  // Deafening Blast: faint ground copy of the front arcs (the wave itself is drawn 6 px up)
  function blast(R, e, x, y) {
    const front = e.front / R.P;
    if (!(front >= 2)) return;
    const cx = R.cx, dirs = e.dirs || [e.dir || 0], r0 = e.r / R.P;
    cx.globalAlpha = 0.16 * night; cx.fillStyle = '#000';
    for (let d = 0; d < dirs.length; d++) {
      const a0 = dirs[d], r = Math.max(2, front), half = clamp((r0 + front * 0.15) / Math.max(r, 6), 0.15, 0.9), n = Math.max(8, Math.round(half * r * 1.6));
      for (let i = 0; i < n; i += 1) {
        const k = i / (n - 1) - 0.5, a = a0 + k * 2 * half;
        cx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.9), 2, 1);
      }
    }
  }

  // sim projectile / thinker entities (key = fx || ability): [rx, ry, alpha] of the ground blob
  const SPELL = {
    attack: [3, 1, 0.34], tower: [3, 1, 0.34], bolt: [3, 1, 0.34], atos: [3, 1, 0.34], gleipnir: [3, 1, 0.34],
    tornado: [6, 2, 0.34], emp: [5, 2, 0.3],
  };

  function ground(R) {
    if (IT.Shadows.off) return;
    const w = R.w, cx = R.cx, P = R.P, UD = IT.UnitDraw, A0 = cx.globalAlpha, ents = w.ents;
    const nf = IT.DayNight && IT.DayNight.factor ? IT.DayNight.factor(w) : 0;
    night = 1 + 0.45 * nf;
    const VW = R.VW, VH = R.VH;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead) continue;
      const kind = e.kind;
      if (kind === 'proj' || kind === 'thinker') {
        if (e.team === 1 && !lit(R, e.x, e.y)) continue;
        R.interp(e);
        const x = Math.round(R.ix / P - R.camX), y = Math.round(R.iy / P - R.camY);
        if (x < -60 || x > VW + 60 || y < -40 || y > VH + 60) continue;
        const key = e.fx || e.ability;
        const sp = SPELL[key];
        if (sp) {
          const k = hk(R.iz), s = scaleK(k);
          blob(R, x, y, sp[0] * s, sp[1] * s, sp[2] * alphaK(k) / A_GROUND);
        } else if (key === 'chaosmeteor') {
          if (e.landed) blob(R, x, y, 8, 3, 0.36);
          else {      // falling: the shadow grows and darkens toward the impact point (landing time = danger.at)
            const rem = e.danger ? Math.max(0, e.danger.at - R.simT) : 0, land = Math.max(0.1, e.age + rem), f = clamp(1 - rem / land, 0, 1);
            blob(R, x, y, 2 + 7 * f, 1 + 2.6 * f, 0.1 + 0.4 * f * f);
          }
        } else if (key === 'sunstrike') {      // faint disc under the sky column, only while it builds up
          const rem = e.danger ? Math.max(0, e.danger.at - R.simT) : 0;
          if (rem < 0.5) { const f = 1 - rem / 0.5, rr = Math.max(4, (e.r || 100) / P * 0.3 * f); blob(R, x, y, rr, rr, 0.22 * f); }
        } else if (key === 'deafeningblast') { blast(R, e, x, y); cx.globalAlpha = 1; }
        continue;
      }
      if (kind === 'pickup') {      // v6 item 28: rune / aegis float above the ground: small soft blob that breathes against the bob
        R.interp(e);
        const x = Math.round(R.ix / P - R.camX), y = Math.round(R.iy / P - R.camY);
        if (x < -30 || x > VW + 30 || y < -20 || y > VH + 20) continue;
        const aeg = (e.pickKind || (e.pick && e.pick.kind)) === 'aegis', ph = Math.sin(R.time * 2.4 + (e.id || 0)) * 0.5 + 0.5;
        blob(R, x, y + 1, (aeg ? 6 : 5) - ph * 1.2, (aeg ? 2.2 : 1.8) - ph * 0.4, 0.3 - ph * 0.08);
        continue;
      }
      if (!UD.isUnit(e) || !UD.visible(R, e)) continue;
      R.interp(e);
      const x = Math.round(R.ix / P - R.camX), y = Math.round(R.iy / P - R.camY);
      if (x < -30 || x > VW + 30 || y < -20 || y > VH + 20) continue;
      const S = UD.state.get(e.id), Av = (e.team === 1 || e.kind === 'roshan') && S ? clamp(S.va, 0, 1) : 1;
      if (Av < 0.02) continue;
      const L = e.statuses.length ? UD.liftOf(e) : null, eul = !!L && UD.isEuls(L);
      const zv = UD.visZ(L, eul, R.iz / P, S || NOS);                 // same visual lift as the sprite (px)
      const k = hk(zv * P / UD.LIFT_VIS);                              // tornado: k = z / LIFT_HEIGHT
      const rr = Math.max(3, Math.round(e.radius / P)), big = UD.isFoe(e) && (e.bkb || UD.has(e, 'magicImmune')), s = scaleK(k) * (big ? 1.1 : 1);
      blob(R, x, y + 1, rr * (e.kind === 'spirit' ? 1.0 : 1.25) * s * (e.kind === 'roshan' ? 1.1 : 1), rr * 0.5 * s * (e.kind === 'roshan' ? 1.1 : 1), alphaK(k) * Av);
      if (L && !eul && zv > 6) pillar(R, x, y, zv, rr, Av);
    }
    if (IT.TowerDraw && IT.TowerDraw.shadows) IT.TowerDraw.shadows(R, blob);
    cx.globalAlpha = A0;
  }

  IT.Shadows = { scaleByHeight, ground, blob, pillar, off: false, S_MIN, A_GROUND, A_AIR };
})(typeof window !== 'undefined' ? window : globalThis);
