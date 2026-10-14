// Unit drawing: sprites by anim/facing, shadows, status visuals, orbs, bars/labels (HUD pass).
// Covers hero, spirits, dummies (scarecrow) and enemies (+ their item visuals: BKB, Eul's, Shadow Blade, Force Staff, Blink, telegraph).
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const PX = IT.Pixel;
  const TAU = Math.PI * 2;
  const state = new Map();     // entity id -> per-unit draw state; reset whenever a new Render instance (new world) starts
  const cntCache = new Map();
  let boundR = null;
  // ids and R.time both restart per world: stale state (castUntil, t0, ...) from a previous run must never leak into the next one
  function bind(R) { if (boundR !== R) { state.clear(); boundR = R; } }

  const has = (e, t) => { const s = e.statuses; for (let i = 0; i < s.length; i++) if (s[i].type === t) return true; return false; };
  const find = (e, t) => { const s = e.statuses; for (let i = 0; i < s.length; i++) if (s[i].type === t) return s[i]; return null; };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const isFoe = e => e.kind === 'dummy' || e.kind === 'enemy';
  function count(sheet, anim, dir) {
    const k = sheet + '|' + anim + '|' + dir;
    let n = cntCache.get(k);
    if (n === undefined) { n = IT.Art.count(sheet, anim, dir); cntCache.set(k, n); }
    return n;
  }
  const FALLBACK = { cast: 'attack', attack: 'idle', stunned: 'idle', blink: 'idle', walk: 'idle' };

  // ---- lift (Tornado = lifted by the invoker's wind, Eul's = self cyclone) ----
  function liftOf(e) {
    const s = e.statuses;
    for (let i = 0; i < s.length; i++) { const t = s[i].type; if (t === 'lift' || t === 'cyclone' || t === 'euls') return s[i]; }
    return null;
  }
  const LIFT_VIS = 1.7;    // tornado victims are drawn LIFT_VIS x the sim height
  // visual lift in px (shared with shadows.js): tornado raised well above the sim height; Eul's hovers even without sim z
  const visZ = (L, eul, zp, S) => L && !eul ? zp * LIFT_VIS : eul ? Math.max(zp * 1.3, 15 * S.lA) : zp;
  const isEuls = s => !!s && (s.type === 'euls' || s.type === 'cyclone' || s.ability === 'euls' || !!(s.data && s.data.euls));
  const invisOf = e => has(e, 'invisible') || has(e, 'shadowblade') || has(e, 'invis') || has(e, 'invisFade') || e.invisible === true;
  const hiddenKind = e => invisOf(e) || has(e, 'ghost');
  const revealedOf = e => { try { return !!(IT.Status && IT.Status.revealed && IT.Status.revealed(e)); } catch (err) { return false; } };

  // ---- hex sheep ----
  const SHEEP_PAL = { W: '#f4f4f4', w: '#c4c4d2', K: '#2a2a30', k: '#44444c' };
  const SHEEP = [
    ['....WWWWWW.....', '...WWWWWWWW....', '..WWWWWWWWWWKK.', '..WWWwWWWWWWKKK', '..WWWWWWWWWWKKK', '..WWwWWWwWWWKK.', '...wWWWWWWWw...', '....wwwwwww....', '...K.K...K.K...', '...K.K...K.K...', '...k.k...k.k...'],
    ['....WWWWWW.....', '...WWWWWWWW....', '..WWWWWWWWWWKK.', '..WWWwWWWWWWKKK', '..WWWWWWWWWWKKK', '..WWwWWWwWWWKK.', '...wWWWWWWWw...', '....wwwwwww....', '..K..K...K..K..', '..K..K...K..K..', '..k..k...k..k..'],
  ];
  const sheepCv = [];
  function sheep(i, mirror) {
    const k = i * 2 + (mirror ? 1 : 0);
    if (sheepCv[k]) return sheepCv[k];
    const rows = SHEEP[i], h = rows.length, w = rows[0].length;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const ch = rows[yy][xx]; if (ch === '.') continue; x.fillStyle = SHEEP_PAL[ch]; x.fillRect(mirror ? w - 1 - xx : xx, yy, 1, 1); }
    return (sheepCv[k] = c);
  }

  // nearest-neighbour enlarged copy (BKB makes enemies bigger); cached per source canvas
  const scaleCache = new WeakMap();
  function scaledOf(src, k) {
    let m = scaleCache.get(src); if (!m) { m = {}; scaleCache.set(src, m); }
    let c = m[k];
    if (c) return c;
    c = document.createElement('canvas'); c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    x.drawImage(src, 0, 0, c.width, c.height);
    return (m[k] = c);
  }

  function sheetOf(e) {
    if (e.kind === 'hero') return IT.Art.heroSheet ? IT.Art.heroSheet() : 'invoker';
    if (e.kind === 'spirit') return IT.Art.forgeSheet ? IT.Art.forgeSheet() : 'forge';
    if (e.kind === 'dummy' && e.scarecrow && IT.Art.sheets.scarecrow) return IT.Art.dummySheet ? IT.Art.dummySheet() : 'scarecrow';
    if (e.kind === 'roshan') return IT.Art.sheets.roshan ? 'roshan' : 'pedro';
    if (e.kind === 'ally') return IT.Art.sheets[e.skin] ? e.skin : IT.Art.sheets.default ? 'default' : 'pedro';   // v6 item 28: the default enemy grunt, friendly name tag
    return IT.Art.sheets[e.skin] ? e.skin : 'pedro';
  }
  function isUnit(e) { return e.kind === 'hero' || e.kind === 'dummy' || e.kind === 'enemy' || e.kind === 'spirit' || e.kind === 'ally' || e.kind === 'roshan'; }
  // v6 item 28: Roshan (team 2) is fog-gated + faded like a foe; the ally (team 0) is always drawn
  const fadey = e => e.team === 1 || e.kind === 'roshan';
  const allyName = () => { const k = 'unit.ally', s = IT.t ? IT.t(k) : k; return s && s !== k ? s : (IT.lang === 'pt' ? 'Aliado' : 'Ally'); };
  const roshName = () => { const k = 'unit.roshan', s = IT.t ? IT.t(k) : k; return s && s !== k ? s : 'Roshan'; };
  const litAt = (R, x, y) => { const f = R.fog; return !f || R.w.fog === false || f.levelAt(x, y) > 1.5; };

  function st(R, e) {
    bind(R);
    let s = state.get(e.id);
    if (!s) { s = { name: '', t0: R.time, lx: e.x, ly: e.y, moveT: -9, phase: Math.random() * 3, va: fadey(e) ? 0 : 1, lA: 0 }; state.set(e.id, s); }
    return s;
  }

  // ---- visibility: hysteresis + fades (enemies/dummies popped in and out at fog edges and when vision ticked unevenly) ----
  // gem / tower / ward true sight (the sim's e.visible already folds it in; this keeps the gate honest when vision lags a tick)
  const trueSighted = (R, e) => { try { return !!(e.team === 1 && IT.Vision && IT.Vision.trueSighted && IT.Vision.trueSighted(R.w, 0, e)); } catch (err) { return false; } };
  const HOLD = 0.4, FADE_IN = 0.14, FADE_OUT = 0.3, INVIS_A = 0.5;   // detected stealth: half-transparent
  function visible(R, e) {
    if (e.dead) return false;
    if (!fadey(e)) return true;
    const S = st(R, e);
    if (S.vT === R.time) return S.va > 0.02;
    const dt = S.vT == null ? 1 : clamp(R.time - S.vT, 0, 0.25); S.vT = R.time;
    const inv = hiddenKind(e), rev = inv && (revealedOf(e) || e.revealed === true || trueSighted(R, e));
    let seen = R.w.fog === false ? true : e.kind === 'roshan' ? litAt(R, e.x, e.y) : !!e.visible;
    if (inv && !rev && !has(e, 'invisFade')) seen = false;   // Shadow Blade/Ghost Walk: gone unless dusted/revealed (fade phase: still shimmering)
    let tg;
    if (seen) { S.hold = R.time + HOLD; tg = inv ? (has(e, 'invisFade') ? 0.5 : INVIS_A) : 1; }
    else if (!inv && R.time < (S.hold || 0)) tg = S.tg == null ? 1 : S.tg;   // a one-off missed vision tick must not blink the unit out
    else tg = 0;
    S.tg = tg;
    const rate = tg > S.va ? 1 / FADE_IN : (inv ? 1 / 0.7 : 1 / FADE_OUT);
    S.va = tg > S.va ? Math.min(tg, S.va + dt * rate) : Math.max(tg, S.va - dt * rate);
    return S.va > 0.02;
  }

  function dirOf(f) {
    const c = Math.cos(f), s = Math.sin(f);
    if (Math.abs(s) > Math.abs(c)) return s > 0 ? 's' : 'n';
    return 'e';
  }

  // resolve the sprite for an entity at render time; returns { cv, ax, ay }
  const spin = ['s', 'e', 'n', 'w'];
  const out = { cv: null, ax: 0, ay: 0, mirror: false, sheep: false };
  function sprite(R, e, S, lifted) {
    const sheet = sheetOf(e), def = IT.Art.sheets[sheet] || IT.Art.sheets.pedro;
    let anim = e.anim ? e.anim.name : 'idle';
    if (e.kind === 'spirit') anim = e._wind ? 'attack' : (R.time - S.moveT < 0.15 ? 'walk' : 'idle');
    let facing = e.facing || 0;
    let dir = dirOf(facing), mirror = Math.cos(facing) < 0;
    if (lifted) {
      const d = spin[Math.floor(R.time * 12) & 3];
      dir = d === 'w' ? 'e' : d; mirror = d === 'w';
    }
    if (has(e, 'stun') || has(e, 'frozen') && isFoe(e)) { if (count(sheet, 'stunned', dir)) anim = 'stunned'; }
    if (has(e, 'hex')) {
      out.sheep = true; out.cv = sheep(((R.time * (anim === 'walk' ? 8 : 0)) & 1), Math.cos(facing) < 0);
      out.ax = 7; out.ay = 10; out.mirror = false;
      return out;
    }
    out.sheep = false;
    // render-driven cast pose (shows even with cast point 0); not over stun/lift. A stale/future stamp is ignored.
    const forced = e.kind === 'hero' && S.castUntil > R.time && S.castUntil < R.time + 1 && R.time >= S.castStart && !lifted && anim !== 'stunned';
    if (forced) anim = 'cast';
    let n = count(sheet, anim, dir);
    while (!n && FALLBACK[anim]) { anim = FALLBACK[anim]; n = count(sheet, anim, dir); }
    if (!n) { anim = 'idle'; n = count(sheet, 'idle', dir); }
    if (S.name !== anim) { S.name = anim; S.t0 = R.time; }
    if (S.t0 > R.time) S.t0 = R.time;
    const et = Math.max(0, R.time - S.t0 + S.phase);
    let idx = 0;
    if (n) {
      switch (anim) {
        case 'idle': idx = Math.floor(et * 3) % n; break;
        case 'walk': idx = Math.floor(et * 8 * IT.U.clamp((e.ms || 300) / 300, 0.6, 1.8)) % n; break;
        case 'stunned': idx = Math.floor(et * 5) % n; break;
        case 'cast': idx = forced ? Math.floor((R.time - S.castStart) * 14) : Math.floor((R.time - S.t0) * 6); break;
        case 'attack': idx = Math.floor((R.time - S.t0) * 12); break;
        default: idx = Math.floor((R.time - S.t0) * 6);
      }
      idx = clamp(idx, 0, n - 1);
    }
    let cv = n ? IT.Art.canvas(sheet, `${anim}_${dir}_${idx}`, mirror) : null;
    if (!cv) { cv = IT.Art.canvas(sheet, 'idle_s_0', false) || IT.Art.canvas('pedro', 'idle_s_0', false); mirror = false; }   // never leave a unit undrawn
    out.cv = cv;
    out.ax = def.anchor[0]; out.ay = def.anchor[1]; out.mirror = mirror;
    return out;
  }

  const ORB_NAME = { Q: 'orb_q', W: 'orb_w', E: 'orb_e' };
  function drawOrbs(R, e, sx, sy, front) {
    const orbs = e.inv && e.inv.orbs;
    if (!orbs) return;
    const cx = R.cx, n = orbs.length;
    for (let i = 0; i < n; i++) {
      const th = R.time * 2.6 + i * 2.0944, s = Math.sin(th);
      if ((s > 0) !== front) continue;
      const ox = Math.cos(th) * 12, oy = s * 5 - 12 + Math.sin(R.time * 5 + i) * 0.8;
      const cv = IT.Art.canvas('invoker', ORB_NAME[orbs[i]] || 'orb_q');
      R.noSil = true;   // light emitters never cast: the orbs stay out of the hero's shadow silhouette (and out of its foot anchor)
      if (cv) cx.drawImage(cv, Math.round(sx + ox - cv.width / 2), Math.round(sy + oy - cv.height / 2));
      R.noSil = false;
    }
  }

  // ---- body distortion for Shadow Blade: horizontal 2px strips wobbling sideways ----
  function shimmer(cx, img, dx, dy, t, a) {
    const h = img.height, w = img.width;
    cx.globalAlpha = a;
    for (let y = 0; y < h; y += 2) {
      const hh = Math.min(2, h - y), o = Math.round(Math.sin(t * 9 + y * 0.6) * 1.2);
      cx.drawImage(img, 0, y, w, hh, dx + o, dy + y, w, hh);
    }
  }

  // ---- cyclone / tornado swirl around a lifted unit: helical wind streaks, drawn in two halves around the sprite ----
  const WIND = ['#ffffff', '#e8f4ff', '#bfe0ff', '#8cc0f0'];
  function swirl(R, x, yBase, hgt, rx, front, n, eul) {
    const cx = R.cx, t = R.time;
    for (let s = 0; s < n; s++) {
      const base = t * (eul ? 7 : 9) + s * TAU / n, hp = (s * 0.37 + t * 0.9) % 1;
      for (let k = 0; k < 5; k++) {
        const a = base - k * 0.2, sn = Math.sin(a);
        if ((sn > 0) !== front) continue;
        const h = hgt * clamp(hp - k * 0.03, 0, 1), r = rx * (0.55 + 0.45 * (h / hgt));
        const px = Math.round(x + Math.cos(a) * r), py = Math.round(yBase - h + sn * r * 0.32);
        cx.fillStyle = WIND[Math.min(3, k)];
        cx.fillRect(px, py, k < 2 ? 2 : 1, 1);
      }
    }
    if (!front) return;
  }
  // mini funnel of stacked rings (Eul's): same language as the Tornado funnel but hugging the unit
  function funnel(R, x, yBase, hgt, front) {
    const cx = R.cx, t = R.time, rings = 6;
    for (let k = 0; k < rings; k++) {
      const h = (k + 0.5) / rings * hgt, r = 4 + (h / hgt) * 6 + Math.sin(t * 3 + k) * 0.6;
      for (let i = 0; i < 5; i++) {
        const a = t * (8 - k * 0.5) + k * 0.9 + i * TAU / 5, s = Math.sin(a);
        if ((s > 0) !== front) continue;
        cx.fillStyle = s > 0 ? '#ffffff' : '#a8d4ff';
        cx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(yBase - h + s * r * 0.32), 2, 1);
      }
    }
  }
  // Dota-style selection circle on the ground: thin 1px ellipse (green = own units, red = inspected foe)
  function selected(R, e) {
    const In = IT.Input, c = In && In.ctx;
    if (!c || c.w !== R.w || e.dead) return false;
    if (In.selected != null && !(In.ownCard && In.ownCard())) return In.selected === e.id;   // inspecting a foe / building replaces the unit selection (a spirit card keeps the group rings)
    return !!(In.sel && In.sel.units && In.sel.units.indexOf(e.id) >= 0);
  }
  function selRing(R, x, y, rr, foe) {
    const cx = R.cx, rx = rr + 3, ry = Math.max(2, Math.round(rx * 0.5)), n = Math.max(16, Math.round(TAU * rx * 1.3));
    let lx = 1e9, ly = 1e9;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU, px = Math.round(x + Math.cos(a) * rx), py = Math.round(y + Math.sin(a) * ry);
      if (px === lx && py === ly) continue;
      lx = px; ly = py; pts.push(px, py);
    }
    cx.fillStyle = 'rgba(0,0,0,0.45)';
    for (let i = 0; i < pts.length; i += 2) cx.fillRect(pts[i], pts[i + 1] + 1, 1, 1);
    cx.fillStyle = foe ? '#ff5a4a' : '#5bff6e';
    for (let i = 0; i < pts.length; i += 2) cx.fillRect(pts[i], pts[i + 1], 1, 1);
  }
  function liftMarker(R, x, y, rr, eul) {
    // ground marker under a lifted unit: pulsing dotted ring + tether of rising dots so it reads as "up in the air"
    const cx = R.cx, t = R.time, pul = 0.5 + 0.5 * Math.sin(t * 6);
    const rx = rr + 3 + pul * 2, ry = Math.max(2, Math.round(rx * 0.42)), n = 20;
    cx.fillStyle = eul ? '#8fe6ff' : '#e8f4ff';
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + t * 1.5;
      cx.fillRect(Math.round(x + Math.cos(a) * rx), Math.round(y + Math.sin(a) * ry), 1, 1);
    }
    cx.fillStyle = eul ? '#4cb6ec' : '#a8c8f0';
    cx.fillRect(x - 1, y, 3, 1); cx.fillRect(x, y - 1, 1, 3);
  }
  function tether(R, x, yGround, yUnit, eul) {
    const cx = R.cx, t = R.time;
    const len = yGround - yUnit; if (len < 4) return;
    for (let d = (t * 26) % 5; d < len; d += 5) {
      cx.fillStyle = d > len * 0.7 ? '#ffffff' : '#bfe0ff';
      cx.fillRect(x, Math.round(yGround - d), 1, 1);
    }
  }

  function draw(R, e, top) {
    const cx = R.cx, w = R.w, S = st(R, e);
    R.interp(e);
    const A0 = cx.globalAlpha;
    const P = R.P, gx = R.ix / P - R.camX, gy = R.iy / P - R.camY, zp = R.iz / P;
    const L = liftOf(e), eul = isEuls(L), lifted = !!L || R.iz > 8;
    if (!top) {
      const dt = clamp(R.time - (S.lT == null ? R.time : S.lT), 0, 0.1); S.lT = R.time;
      S.lA = clamp(S.lA + (L ? dt : -dt) / 0.22, 0, 1);
    }
    // visual lift: tornado victims are raised well above the sim height so they read as airborne; Eul's gets a hover even without sim z
    const zv = visZ(L, eul, zp, S);
    const sxp = Math.round(gx), syp = Math.round(gy), sy = Math.round(gy - zv);
    if (!top) {
      if (Math.hypot(e.x - S.lx, e.y - S.ly) > 0.4) S.moveT = R.time;
      S.lx = e.x; S.ly = e.y;
    }
    const sp = sprite(R, e, S, lifted);
    if (!sp.cv) return;
    const Av = A0 * (fadey(e) ? clamp(S.va, 0, 1) : 1);
    if (Av < 0.02) return;
    const bk = isFoe(e) && !!e.bkb || (isFoe(e) && has(e, 'magicImmune'));
    const sc = bk && !sp.sheep ? 1.2 : 1;
    let img = sp.cv, ax = sp.ax, ay = sp.ay;
    if (sc !== 1) { img = scaledOf(img, sc); ax = Math.round(ax * sc); ay = Math.round(ay * sc); }
    const rr = Math.max(3, Math.round(e.radius / P));
    const swr = Math.max(9, Math.round(img.width * 0.45));   // v6 #65: lift swirl radius follows the frame width (34-px Vitinian)
    const dx = sxp - ax, dy = sy - ay;
    const root = has(e, 'root') || has(e, 'atosRoot'), rk = root ? rootKind(e) : 0;
    const ghost = has(e, 'ghost'), frozen = has(e, 'frozen');
    const inv = isFoe(e) && invisOf(e);
    const imm = has(e, 'magicImmune') || bk;
    const hgtUnit = Math.max(8, syp - sy + img.height * 0.5);

    if (!top) {
      if (selected(R, e)) { cx.globalAlpha = Av; selRing(R, sxp, syp, rr, isFoe(e) || e.kind === 'roshan'); cx.globalAlpha = A0; }
      if (L) { liftMarker(R, sxp, syp, rr, eul); tether(R, sxp, syp, sy, eul); }
      if (has(e, 'revealed')) dustRing(R, e, sxp, syp, rr, Av);
      if (root) vines(R, sxp, syp, rr, true, rk);
      if (e.kind === 'hero') drawOrbs(R, e, sxp, sy, false);
      if (L) { cx.globalAlpha = Av; if (eul) funnel(R, sxp, syp - 2, Math.max(26, syp - sy + img.height), false); swirl(R, sxp, sy + 2, img.height, swr, false, eul ? 5 : 4, eul); }
      afterimages(R, e, S, Av);
    }
    cx.globalAlpha = Av;
    if (imm && !top) {
      const pul = 0.55 + 0.25 * Math.sin(R.time * 6), gold = PX.tinted(img, '#ffd24a');
      cx.globalAlpha = pul * Av;
      cx.drawImage(gold, dx - 1, dy); cx.drawImage(gold, dx + 1, dy); cx.drawImage(gold, dx, dy - 1); cx.drawImage(gold, dx, dy + 1);
      cx.globalAlpha = Av;
      R.glow(sxp, sy - 10, 22 * sc, '#ffcc40', (0.35 + 0.1 * Math.sin(R.time * 6)) * Av);
    }
    const bi = R.time - (S.blinkT == null ? -9 : S.blinkT) < 0.32;
    const bl = (e.anim && e.anim.name === 'blink' && isFoe(e)) || bi;
    if (inv) {
      shimmer(cx, img, dx, dy, R.time, Av);
      cx.globalAlpha = (0.1 + 0.08 * Math.sin(R.time * 7)) * Av; cx.drawImage(PX.tinted(img, '#a890ff'), dx, dy);
      if (!top) {   // detected (dust / gem / tower true sight): a faint pulsing shimmer outline
        const ol = PX.tinted(img, '#c8b8ff');
        cx.globalAlpha = (0.3 + 0.12 * Math.sin(R.time * 7)) * Av;
        cx.drawImage(ol, dx - 1, dy); cx.drawImage(ol, dx + 1, dy); cx.drawImage(ol, dx, dy - 1); cx.drawImage(ol, dx, dy + 1);
      }
    } else if (ghost) {
      cx.globalAlpha = 0.65 * Av; cx.drawImage(PX.dithered(img, (R.time * 6) & 1), dx, dy);
    } else if (bl) {
      const pr = bi ? clamp((R.time - S.blinkT) / 0.32, 0, 1) : clamp((R.time - S.t0) / 0.35, 0, 1);
      cx.globalAlpha = Av;
      cx.drawImage(PX.dithered(img, (R.time * 14) & 1), dx, dy);
      cx.globalAlpha = (0.25 + 0.5 * (bi ? 1 - pr : pr)) * Av; cx.drawImage(PX.tinted(img, '#b070ff'), dx, dy);
      if (!top && !bi && Math.random() < 0.7) IT.Particles.emit({ x: e.x + (Math.random() - 0.5) * 70, y: e.y, z: Math.random() * 100, n: 1, ramp: 'purple', speed: 10, up: 25, life: 0.5, rest: 0.8 });
    } else {
      cx.drawImage(img, dx, dy);
    }
    cx.globalAlpha = Av;
    if (bk) {      // BKB: golden-yellow body
      cx.globalAlpha = (0.42 + 0.14 * Math.sin(R.time * 5)) * Av; cx.drawImage(PX.tinted(img, '#ffc830'), dx, dy);
      cx.globalAlpha = 0.16 * Av; cx.drawImage(PX.tinted(img, '#fff4b0'), dx, dy);
      cx.globalAlpha = Av;
    }
    const al = top ? null : alacOf(R, e, S);
    if (al) alacTint(R, img, dx, dy, S, al, Av);
    if (frozen) {
      cx.globalAlpha = 0.6 * Av; cx.drawImage(PX.tinted(img, '#8fe6ff'), dx, dy); cx.globalAlpha = Av;
      cx.fillStyle = '#e8fbff';
      for (let k = -2; k <= 2; k++) { const hh = 3 + ((k & 1) ? 3 : 5) + (k === 0 ? 2 : 0); cx.fillRect(sxp + k * 3 - 1, sy - hh - 1 + 1, 2, hh); cx.fillStyle = k & 1 ? '#8fe6ff' : '#e8fbff'; }
      cx.fillStyle = '#4cb6ec'; cx.fillRect(sxp - 8, sy - 1, 17, 1);
    } else if (has(e, 'slow')) {
      cx.globalAlpha = 0.18 * Av; cx.drawImage(PX.tinted(img, '#4cb6ec'), dx, dy); cx.globalAlpha = Av;
      cx.fillStyle = '#6cd0ff';
      for (let k = 0; k < 3; k++) {
        const ph = (R.time * 0.9 + k * 0.37) % 1;
        cx.fillRect(sxp - 5 + k * 5 + (k & 1), sy - img.height * 0.55 + ph * img.height * 0.5, 1, 2);
      }
    }
    if (has(e, 'hex')) { cx.globalAlpha = 0.22 * Av; cx.drawImage(PX.tinted(img, '#5cff6c'), dx, dy); cx.globalAlpha = Av; }
    if (L) {      // front halves of the swirl (+ light from inside a cyclone)
      cx.globalAlpha = Av;
      if (eul) funnel(R, sxp, syp - 2, Math.max(26, syp - sy + img.height), true);
      swirl(R, sxp, sy + 2, img.height, swr, true, eul ? 5 : 4, eul);
    }
    cx.globalAlpha = A0;
    if (top) return;
    if (root) vines(R, sxp, syp, rr, false, rk);
    if (e.kind === 'hero') drawOrbs(R, e, sxp, sy, true);
    windGlow(R, e, S, sxp, sy);
    S.sx = sxp; S.sy = sy; S.top = ay; S.cvImg = sp.cv; S.cvAx = sp.ax; S.cvAy = sp.ay; S.sc = sc;
    if (L && Math.random() < 0.5) IT.Particles.emit({ x: e.x + (Math.random() - 0.5) * 40, y: e.y + (Math.random() - 0.5) * 20, z: Math.max(0, zp * 6 * 0.2), n: 1, ramp: 'white', speed: 25, up: 10, spread: 10, life: 0.4, rest: 0.6 });
    forceTrail(R, e, S);
    if (al) alacSigil(R, S, sxp, sy - (e.kind === 'hero' ? S.top + 14 : e.scarecrow ? 42 : S.top + 10), al);
  }

  // Dust of Appearance debuff ('revealed'): a slowly turning ring of gold dust motes at the feet + a few drifting up; it thins out in the last 1.5 s.
  function dustRing(R, e, sx, sy, rr, Av) {
    const cx = R.cx, s = find(e, 'revealed'), left = s && isFinite(s.until) ? s.until - R.w.t : 99, f = clamp(left / 1.5, 0, 1);
    if (f <= 0) return;
    const n = 16, rx = rr + 7, ry = Math.max(3, (rr + 7) * 0.45);
    for (let i = 0; i < n; i++) {
      const a = R.time * 1.4 + i / n * TAU, px = Math.round(sx + Math.cos(a) * rx), py = Math.round(sy + Math.sin(a) * ry);
      if (f < 1 && PX.bayer(px + R.camX, py + R.camY) > f) continue;
      cx.globalAlpha = (0.55 + 0.35 * Math.sin(R.time * 5 + i)) * Av;
      cx.fillStyle = i & 1 ? '#f0e2b0' : '#e8c060';
      cx.fillRect(px, py, 1, 1); if (!(i & 3)) cx.fillRect(px, py - 1, 1, 1);
    }
    cx.globalAlpha = Av;
    if (Math.random() < 0.18) IT.Particles.emit({ x: e.x + (Math.random() - 0.5) * 50, y: e.y + (Math.random() - 0.5) * 30, z: 4, n: 1, ramp: 'gold', speed: 6, up: 30, spread: 6, life: 0.9, rest: 1 });
  }

  // lifted units are re-drawn on top of the dust/funnel layers so their lower half never disappears into the plume
  function overlay(R) {
    bind(R);
    const w = R.w;
    for (const e of w.ents) {
      if (e.dead || !isUnit(e) || !liftOf(e) || !visible(R, e)) continue;
      draw(R, e, true);
    }
  }

  // ---- Force Staff push trail + Blink departure ghost: fading tinted copies at earlier positions ----
  function forceTrail(R, e, S) {
    if (!(S.forceUntil > R.time) && !has(e, 'knockback') && !has(e, 'force') && !has(e, 'forcestaff')) { S.hist = null; return; }
    if (!S.hist) S.hist = [];
    const h = S.hist;
    if (!h.length || R.time - h[h.length - 1].t > 0.03) { h.push({ t: R.time, x: e.x, y: e.y }); if (h.length > 8) h.shift(); }
    if (Math.random() < 0.8) IT.Particles.emit({ x: e.x, y: e.y, z: 14, n: 1, ramp: 'cyan', speed: 12, up: 14, spread: 14, life: 0.45, rest: 0.8 });
  }
  function afterimages(R, e, S, Av) {
    const cx = R.cx, P = R.P, img = S.cvImg;
    if (!img) return;
    const sc = S.sc || 1, ax = Math.round(S.cvAx * sc), ay = Math.round(S.cvAy * sc);
    const im = sc === 1 ? img : scaledOf(img, sc);
    const h = S.hist;
    if (h && h.length > 1) {
      for (let i = 0; i < h.length - 1; i++) {
        const q = h[i], age = R.time - q.t; if (age > 0.3) continue;
        cx.globalAlpha = 0.5 * (1 - age / 0.3) * Av;
        cx.drawImage(PX.tinted(im, i & 1 ? '#6cd0ff' : '#b8f0ff'), Math.round(q.x / P - R.camX) - ax, Math.round(q.y / P - R.camY) - ay);
      }
    }
    const g = S.ghost;
    if (g) {
      const age = R.time - g.t0;
      if (age > 0.4) S.ghost = null;
      else {
        cx.globalAlpha = 0.7 * (1 - age / 0.4) * Av;
        const gi = g.img;
        cx.drawImage(PX.dithered(PX.tinted(gi, '#b070ff'), (R.time * 14) & 1), Math.round(g.x / P - R.camX) - g.ax, Math.round(g.y / P - R.camY) - g.ay);
      }
    }
    cx.globalAlpha = Av;
  }
  // sim/fx events routed here by fx.js (all optional / guarded)
  function event(R, name, p) {
    bind(R);
    const e = p && p.unit != null ? R.w.get(p.unit) : null; if (!e) return;
    const S = st(R, e);
    if (name === 'blink') {
      S.blinkT = R.time;
      if (S.cvImg && p.fromX != null) S.ghost = { x: p.fromX, y: p.fromY, t0: R.time, img: S.sc && S.sc !== 1 ? scaledOf(S.cvImg, S.sc) : S.cvImg, ax: Math.round(S.cvAx * (S.sc || 1)), ay: Math.round(S.cvAy * (S.sc || 1)) };
    } else if (name === 'forcestaff') { S.forceUntil = R.time + 0.7; S.hist = []; }
  }

  // ---- Alacrity: tint-pulse at cast, purple shimmer, rotating sigil crest above the head ----
  function alacOf(R, e, S) {
    let st = null;
    for (let i = 0; i < e.statuses.length; i++) if (e.statuses[i].type === 'alacrity') { st = e.statuses[i]; break; }
    if (!st) { S.alU = 0; return null; }
    if (!S.alU || st.until - S.alU > 0.5 || R.time - S.alSeen > 0.3) S.alT0 = R.time;
    S.alU = st.until; S.alSeen = R.time;
    const age = R.time - S.alT0, rem = st.until - R.simT;
    return { age, a: Math.min(1, age / 0.3, Math.max(0, rem / 0.5)) };
  }
  function alacTint(R, img, dx, dy, S, al, Av) {
    const cx = R.cx, t = R.time, K = Av == null ? 1 : Av;
    if (al.age < 0.45) { cx.globalAlpha = 0.85 * (1 - al.age / 0.45) * K; cx.drawImage(PX.tinted(img, '#d8a0ff'), dx, dy); }
    cx.globalAlpha = (0.1 + 0.08 * Math.sin(t * 5)) * al.a * K; cx.drawImage(PX.tinted(img, '#b070ff'), dx, dy);
    const h = img.height, by = Math.floor((t * 22) % (h + 10)) - 5, y0 = Math.max(0, by), y1 = Math.min(h, by + 2);
    if (y1 > y0) { cx.globalAlpha = 0.55 * al.a * K; cx.drawImage(PX.tinted(img, '#f0d0ff'), 0, y0, img.width, y1 - y0, dx, dy + y0, img.width, y1 - y0); }
    cx.globalAlpha = K;
  }
  function alacSigil(R, S, x, y, al) {
    const cx = R.cx, t = R.time, a = al.a, B = PX.BAYER4, cX = R.camX, cY = R.camY;
    const put = (px, py, c) => { px = Math.round(px); py = Math.round(py); if (a < 1 && B[((py + cY) & 3) << 2 | ((px + cX) & 3)] > a) return; cx.fillStyle = c; cx.fillRect(px, py, 1, 1); };
    const r1 = t * 1.6, r2 = -t * 2.4;
    for (let i = 0; i < 24; i++) {     // outer ring
      const th = r1 + i / 24 * 6.2832, sn = Math.sin(th);
      put(x + Math.cos(th) * 10, y + sn * 4, (i & 1) ? (sn > 0 ? '#c890ff' : '#7a3ad8') : (sn > 0 ? '#b070ff' : '#4a2090'));
    }
    for (let i = 0; i < 12; i++) {     // inner ring (orange)
      const th = r2 + i / 12 * 6.2832, sn = Math.sin(th);
      put(x + Math.cos(th) * 6, y + sn * 2.4, (i & 1) ? (sn > 0 ? '#ffc860' : '#c06010') : (sn > 0 ? '#ff9a30' : '#8a3a08'));
    }
    for (let k = 0; k < 4; k++) {      // rune spikes
      const th = r1 + k * 1.5708, c = Math.cos(th), sn = Math.sin(th);
      put(x + c * 12, y + sn * 4.8, '#e6c8ff'); put(x + c * 13, y + sn * 5.2, '#7a3ad8');
    }
    const pl = Math.sin(t * 6) > 0;
    put(x, y, '#fff'); put(x - 1, y, pl ? '#ffc860' : '#ff9a30'); put(x + 1, y, pl ? '#ffc860' : '#ff9a30'); put(x, y - 1, pl ? '#ff9a30' : '#b070ff'); put(x, y + 1, pl ? '#ff9a30' : '#b070ff');
    for (let j = 0; j < 3; j++) {      // orbiting sparks with fading trails
      const base = t * 3.2 + j * 2.0944;
      for (let k = 0; k < 4; k++) { const th = base - k * 0.22; put(x + Math.cos(th) * 8, y + Math.sin(th) * 3.2 - 1, PX.RAMPS.gold[k === 0 ? 0 : k + 1]); }
    }
    R.glow(x, y, 15, '#b070ff', 0.5 * a);
    R.light(x, y, 30, [200, 120, 255], 0.5 * a);
  }

  function rootKind(e) {
    let k = 0;
    for (let i = 0; i < e.statuses.length; i++) { const s = e.statuses[i]; if (s.type === 'atosRoot') return 2; if (s.type === 'root' && s.ability === 'gleipnir') k = 1; }
    return k;
  }
  // chained root: two rings of alternating flat/edge-on links (feet, plus a waist band across the front)
  function chains(R, x, y, r, back, kind) {
    const cx = R.cx, t = R.time, rx = r + 4, ry = Math.max(2, Math.round(r * 0.55)), n = 16, gold = kind === 1;
    const lo = gold ? '#8a5a10' : '#15101f', mid = gold ? '#ffd24a' : '#3a3060', hi = gold ? '#fff2b0' : '#a898ff';
    for (let ring = 0; ring < 2; ring++) {
      if (ring && back) continue;
      const yy = y - ring * 9, rr2 = rx - ring * 1.5;
      for (let i = 0; i < n; i++) {
        const a = i / n * 6.2832 + t * (ring ? -0.25 : 0.25), s = Math.sin(a);
        if (ring ? s < 0 : (s < 0) !== back) continue;
        const px = Math.round(x + Math.cos(a) * rr2), py = Math.round(yy + s * ry);
        cx.fillStyle = mid;
        if (i & 1) { cx.fillRect(px - 1, py - 1, 3, 2); cx.fillStyle = lo; cx.fillRect(px, py, 1, 1); cx.fillStyle = hi; cx.fillRect(px - 1, py - 1, 1, 1); }
        else { cx.fillRect(px, py - 1, 1, 3); cx.fillStyle = lo; cx.fillRect(px + 1, py, 1, 1); cx.fillStyle = hi; cx.fillRect(px, py - 1, 1, 1); }
        if ((((t * 7) | 0) + i * 5) % 23 === 0) { cx.fillStyle = '#fff'; cx.fillRect(px, py - 1, 1, 1); }
      }
    }
    if (!back) R.glow(x, y - 4, 14, gold ? '#ffc840' : '#6a50d0', 0.25 + 0.1 * Math.sin(t * 5));
  }
  function vines(R, x, y, r, back, kind) {
    if (kind) { chains(R, x, y, r, back, kind); return; }
    const cx = R.cx, rx = r + 4, ry = Math.max(2, Math.round(r * 0.55)), n = 18;
    const c1 = '#3a8a24', c2 = '#6ccc3c';
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.2832 + R.time * 0.3, s = Math.sin(a);
      if ((s < 0) !== back) continue;
      const px = Math.round(x + Math.cos(a) * rx), py = Math.round(y + s * ry);
      cx.fillStyle = c1; cx.fillRect(px, py, 2, 1);
      if (i % 3 === 0) { cx.fillStyle = c2; cx.fillRect(px, py - 1 - (i & 1), 1, 2); }
    }
  }

  // ---- attack wind-up: an orb (colour of the held orbs; spirits: fire) gathers at the hand, sparks converge, pops on release. Cancelled: just vanishes.
  function windGlow(R, e, S, x, sy) {
    const wd = e._wind, t = R.time, fx = IT.FX, cx = R.cx, OP = fx.orbPal(e), WC = OP.ramp;
    const ox = x + Math.round(Math.cos(e.facing) * 4), oy = sy - 10;
    if (!wd) {
      S.wdObj = null; S.wdP = 0;
      const k = (t - (S.relT || -9)) / 0.14;
      if (k >= 0 && k < 1) {      // release pop (the projectile spawns this tick)
        fx.ddisc(R, ox, oy, 1 + 4 * (1 - k), WC[3], 1 - k * 0.6); fx.ddisc(R, ox, oy, 2.5 * (1 - k), WC[4], 1);
        R.glow(ox, oy, 14, OP.glow, 0.7 * (1 - k)); S.wdP = 1 - k;
      }
      return;
    }
    if (S.wdObj !== wd) {
      S.wdObj = wd; let tot = wd.t;
      try { if (e.attack && IT.Hero) tot = IT.Hero.attackPoint(e) || tot; } catch (err) { /* keep wd.t */ }
      S.wdTot = Math.max(0.05, tot);
    }
    const p = IT.U.clamp(1 - (wd.t + (1 - R.alpha) * (R.w.dt || 1 / 30)) / S.wdTot, 0, 1), e2 = p * p * (3 - 2 * p);
    const r = 0.9 + 2.7 * e2;
    fx.ddisc(R, ox, oy, r + 0.8, WC[0], 1); fx.ddisc(R, ox, oy, r, WC[1], 1); fx.ddisc(R, ox, oy, r * 0.78, WC[2], 1);
    if (p > 0.35) fx.ddisc(R, ox, oy, r * 0.5, WC[3], 1);
    if (p > 0.7) fx.ddisc(R, ox, oy, r * 0.28, WC[4], 1);
    for (let k = 0; k < 4; k++) {       // sparks spiral into the orb
      const a = t * 9 + k * 1.5708, d = 3 + (1 - p) * 7;
      cx.fillStyle = k & 1 ? WC[3] : WC[2];
      cx.fillRect(Math.round(ox + Math.cos(a) * d), Math.round(oy + Math.sin(a) * d * 0.7), 1, 1);
    }
    R.glow(ox, oy, 6 + 9 * p, OP.glow, 0.2 + 0.55 * p);
    S.wdP = p;
  }
  // sim 'attack' = launch: arm the release pop
  function launched(R, p) { bind(R); const S = state.get(p.src); if (S) S.relT = R.time; }

  // ---- D2 telegraph: pulsing "!" + the item's icon above the head until the item fires ----
  const ITEM_COL = { bkb: '#ffd24a', blink: '#7aa8ff', shadowblade: '#a070e0', euls: '#7ae0ff', forcestaff: '#6ad0ff' };
  const ITEM_LET = { bkb: 'B', blink: 'K', shadowblade: 'S', euls: 'E', forcestaff: 'F' };
  function telegraph(R, e, x, y) {
    const tl = e.tele; if (!tl) return;
    const rem = tl.until - R.simT; if (rem < -0.05) return;
    const tot = Math.max(0.15, tl.until - (tl.at != null ? tl.at : tl.until - 1));
    const f = clamp(1 - rem / tot, 0, 1), cx = R.cx, t = R.time;
    const on = Math.sin(t * TAU * (2.5 + 5 * f)) > -0.15;
    const bob = Math.round(Math.sin(t * 8) * 1), col = ITEM_COL[tl.item] || '#ffd24a';
    const x0 = Math.round(x) - 11, y0 = Math.round(y) + bob;
    cx.fillStyle = '#000'; cx.fillRect(x0 - 1, y0 - 2, 22, 17);
    cx.fillStyle = on ? '#ff3a3a' : '#ffd24a';
    cx.fillRect(x0 + 1, y0, 3, 8); cx.fillRect(x0 + 1, y0 + 10, 3, 3);
    cx.fillStyle = '#fff'; cx.fillRect(x0 + 1, y0, 1, 8);
    cx.fillStyle = col; cx.fillRect(x0 + 6, y0 - 1, 14, 14);
    cx.fillStyle = '#0c0818'; cx.fillRect(x0 + 7, y0, 12, 12);
    const ic = IT.Art.canvas('icons', tl.item) || IT.Art.canvas('icons', tl.item + '_item');
    if (ic) { const sm = cx.imageSmoothingEnabled; cx.imageSmoothingEnabled = true; cx.drawImage(ic, x0 + 7, y0, 12, 12); cx.imageSmoothingEnabled = sm; }
    else { cx.fillStyle = col; cx.fillRect(x0 + 9, y0 + 2, 8, 8); PX.text(cx, ITEM_LET[tl.item] || '?', x0 + 13, y0 + 3, '#000', 'c'); }
    cx.fillStyle = '#000'; cx.fillRect(x0 + 6, y0 + 14, 14, 2);
    cx.fillStyle = on ? '#ff5a4a' : '#ffd24a'; cx.fillRect(x0 + 7, y0 + 14, Math.max(0, Math.round(12 * (1 - f))), 1);
  }

  // ---- status icons: a row (max 4, disables first) of 11x11 pixel icons above the bars of every visible unit. Art: IT.Art sheet 'status' (11 px) + 'statusL' (22 px, HUD row), icons.js tail.
  // STATUS_ICON: sim status type -> [icon key, priority (higher = shown first)]. STATUS_NONE: sim statuses that are internal (no icon).
  const STATUS_ICON = {
    stun: ['stun', 100], hex: ['hex', 95], lift: ['lift', 90], frozen: ['frozen', 85],
    root: ['root', 80], atosRoot: ['root', 80], leash: ['root', 80],
    silence: ['silence', 70], disarm: ['disarm', 60], revealed: ['revealed', 55], magicImmune: ['bkb', 50],
    slow: ['slow', 40], burn: ['burn', 35], coldsnap: ['chill', 30], knockback: ['knockback', 28], melt: ['melt', 25], alacrity: ['alacrity', 20],
    ghost: ['ghost', 15], invisible: ['ghost', 15], invisFade: ['ghost', 15],   // own hero only (an enemy one is not drawn at all)
  };
  const STATUS_NONE = { channel: 1, itemStats: 1, shivaAura: 1, towerProt: 1 };
  // buff (green frame) / debuff (red frame) / dual (a buff when the unit put it on itself, e.g. Eul's cyclone or a Force Staff push, else a debuff)
  const STATUS_KIND = {
    stun: 'debuff', hex: 'debuff', frozen: 'debuff', root: 'debuff', atosRoot: 'debuff', leash: 'debuff', silence: 'debuff', disarm: 'debuff', revealed: 'debuff',
    slow: 'debuff', burn: 'debuff', coldsnap: 'debuff', melt: 'debuff', lift: 'dual', knockback: 'dual',
    magicImmune: 'buff', alacrity: 'buff', ghost: 'buff', invisible: 'buff', invisFade: 'buff',
  };
  const MAX_STATUS_ICONS = 4, ICON_W = 11, MAX_STATUS_HUD = 8;
  // true when status `s` (type known) is a buff for unit e
  function statusIsBuff(type, e, s) {
    const k = STATUS_KIND[type];
    return k === 'buff' || (k === 'dual' && !!s && s.src === e.id);
  }
  // all icon entries of e, uncapped: [{ key, type, pri, left, buff, count }] one per icon key (longest remaining wins; count = merged types or data.stacks), best first. `now` = world time.
  function statusList(e, now) {
    const out = [], ss = e.statuses;
    if (!ss) return out;
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i], m = STATUS_ICON[s.type];
      if (!m || s.hidden) continue;
      if (m[0] === 'ghost' && e.team !== 0) continue;
      const left = isFinite(s.until) ? s.until - now : Infinity, stk = s.data && s.data.stacks > 1 ? s.data.stacks : 1;
      let o = null;
      for (let j = 0; j < out.length; j++) if (out[j].key === m[0]) { o = out[j]; break; }
      if (o) { o.count += stk > 1 ? stk : 1; if (left > o.left) { o.left = left; o.type = s.type; o.buff = statusIsBuff(s.type, e, s); } }
      else out.push({ key: m[0], type: s.type, pri: m[1], left, buff: statusIsBuff(s.type, e, s), count: stk });
    }
    out.sort((a, b) => b.pri - a.pri);
    return out;
  }
  // -> the first MAX_STATUS_ICONS of statusList (the 11-px world row)
  function statusIcons(e, now) {
    const out = statusList(e, now);
    if (out.length > MAX_STATUS_ICONS) out.length = MAX_STATUS_ICONS;
    return out;
  }
  // Distance (stage px) from the unit's feet to the BOTTOM of the world status row. The row clears, from lowest to highest: the sprite top (a hexed / frog hero is short,
  // but its orbs still orbit up to ORB_TOP above the feet), the name tag / bars stack, the enemy telegraph, and the Alacrity sigil ring.
  const ORB_TOP = 24;   // drawOrbs: centre -12 -5 (orbit) -0.8 (bob), 6-px orb => top edge ~21; +3 margin
  function statusRowD(e, S) {
    const hero = e.kind === 'hero', scare = e.kind === 'dummy' && e.scarecrow;
    let base = S.top || 0;
    if (hero && e.inv && e.inv.orbs && e.inv.orbs.length) base = Math.max(base, ORB_TOP);
    const named = (isFoe(e) && e.name && !e.noHpBar && e.maxHp || e.kind === 'ally' || e.kind === 'roshan') && !has(e, 'hex');
    let D = base + (scare ? 4 : named ? 16 : e.kind === 'spirit' ? 7 : 8) + (e.kind === 'enemy' && e.tele ? 20 : 0);
    if (has(e, 'alacrity')) D = Math.max(D, (hero ? (S.top || 0) + 14 : scare ? 42 : (S.top || 0) + 10) + 7);   // alacSigil ring + runes reach 5 px above their centre
    return D;
  }
  // Row centred on x, icon bottoms at yb; a 1-px pip under each icon shows the remaining duration (relative to the longest seen); last 0.6 s blink.
  function statusRow(R, e, S, x, yb) {
    const list = statusIcons(e, R.w.t); if (!list.length) return;
    const cx = R.cx, n = list.length, x0 = Math.round(x - (n * ICON_W + (n - 1)) / 2), tot = S.stTot || (S.stTot = {});
    for (let i = 0; i < n; i++) {
      const it = list[i], cv = IT.Art.canvas('status', 'st_' + it.key); if (!cv) continue;
      const ix = x0 + i * (ICON_W + 1), finite = isFinite(it.left);
      if (finite) { if (!(tot[it.key] >= it.left)) tot[it.key] = it.left; if (it.left < 0.6 && ((R.time * 8) | 0) & 1) continue; }
      cx.drawImage(cv, ix, yb - ICON_W - 1);
      if (finite && tot[it.key] > 0.5) {
        const f = clamp(it.left / tot[it.key], 0, 1);
        cx.fillStyle = '#08080e'; cx.fillRect(ix + 1, yb - 1, ICON_W - 2, 1);
        cx.fillStyle = '#e8e8f0'; cx.fillRect(ix + 1, yb - 1, Math.max(1, Math.round((ICON_W - 2) * f)), 1);
      }
    }
    for (const k in tot) if (!list.some(l => l.key === k)) delete tot[k];
  }

  // HUD pass (after lighting): bars, labels, stun stars
  function hud(R, e) {
    bind(R);
    const S = state.get(e.id); if (!S || S.sx == null) return;
    const cx = R.cx, x = S.sx, top = S.sy - S.top;   // top = the sprite's head line (S.top = anchor y), so the name / bars / status row ride on it for any frame height
    const hb = S.cvImg && S.cvImg.width > 24 ? (S.cvImg.width > 30 ? 13 : 11) : 10;   // v6 #65: half bar width (20 px default; wider for the 34-px Vitinian)
    if (fadey(e) && S.va < 0.5) return;
    if (has(e, 'stun')) {
      for (let k = 0; k < 3; k++) {
        const a = R.time * 5 + k * 2.0944, sx = x + Math.cos(a) * 7, sy = top - 3 + Math.sin(a) * 2;
        cx.fillStyle = '#ffe040'; cx.fillRect(Math.round(sx) - 1, Math.round(sy), 3, 1); cx.fillRect(Math.round(sx), Math.round(sy) - 1, 1, 3);
        cx.fillStyle = '#fff8c0'; cx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
      }
    }
    if (e.kind === 'enemy' && e.tele) telegraph(R, e, x, top - (e.maxHp ? 30 : 20));
    if (e.statuses.length) {   // same gate as the bars (visible() + va >= 0.5 above); above name tag / bars / telegraph
      statusRow(R, e, S, x, S.sy - statusRowD(e, S));
    }
    if (has(e, 'hex') || !e.maxHp) return;
    let y;
    if (e.kind === 'dummy' && e.scarecrow) {
      return;   // scarecrow: no name tag, no bars
    } else if (isFoe(e)) {
      if (e.name) PX.text(cx, e.name, x, top - 14, '#f0e8ff', 'c');
      if (e.noHpBar) return;
      y = top - 6;
      bar(cx, x - hb, y, hb * 2, 2, e.hp / e.maxHp, '#e84040', '#2a0808');
      if (e.maxMana) bar(cx, x - hb, y + 2, hb * 2, 1, e.mana / e.maxMana, '#4a8cff', '#0a1430');
    } else if (e.kind === 'roshan') {      // v6 item 28: wide bar + name, warm gold/red
      PX.text(cx, e.name || roshName(), x, top - 15, '#ffd890', 'c');
      y = top - 7;
      bar(cx, x - 17, y, 34, 3, e.hp / e.maxHp, '#d8402a', '#2a0a06');
      cx.fillStyle = '#d8a040'; cx.fillRect(x - 18, y - 1, 1, 5); cx.fillRect(x + 17, y - 1, 1, 5);
    } else if (e.kind === 'ally') {        // friendly tag: blue-green name, teal bar
      PX.text(cx, e.name || allyName(), x, top - 14, '#8ae8c8', 'c');
      y = top - 6;
      bar(cx, x - hb, y, hb * 2, 2, e.hp / e.maxHp, '#3ad8a0', '#06241c');
      if (e.maxMana) bar(cx, x - hb, y + 2, hb * 2, 1, e.mana / e.maxMana, '#4a8cff', '#0a1430');
    } else if (e.kind === 'hero') {
      y = top - 5;
      bar(cx, x - 9, y, 18, 2, e.hp / e.maxHp, '#48d858', '#082a0c');
      if (e.maxMana) bar(cx, x - 9, y + 2, 18, 1, e.mana / e.maxMana, '#4a8cff', '#0a1430');
    } else {
      y = top - 4;
      bar(cx, x - 6, y, 12, 1, e.hp / e.maxHp, '#48d858', '#082a0c');
    }
  }
  function bar(cx, x, y, w, h, f, fg, bg) {
    f = IT.U.clamp(f, 0, 1);
    cx.fillStyle = '#000'; cx.fillRect(x - 1, y - 1, w + 2, h + 2);
    cx.fillStyle = bg; cx.fillRect(x, y, w, h);
    cx.fillStyle = fg; cx.fillRect(x, y, Math.round(w * f), h);
  }

  function lights(R, e) {
    bind(R);
    R.interp(e);
    const sx = R.ix / R.P - R.camX, sy = R.iy / R.P - R.camY - R.iz / R.P;
    const S0 = state.get(e.id);
    const LT = IT.Lights;
    if (LT && LT.enabled) {   // #76 L1: world-space point lights; orb element -> intensity hierarchy (Exort >> Wex > Quas)
      LT.frame(R);
      if (e.kind === 'hero') {
        const orbs = e.inv.orbs, EL = { Q: 'quas', W: 'wex', E: 'exort' };
        for (let i = 0; i < orbs.length; i++) {
          const th = R.time * 2.6 + i * 2.0944;
          LT.addElem(R, R.ix + Math.cos(th) * 72, R.iy + Math.sin(th) * 30, 80 + R.iz, 150, EL[orbs[i]], 0.8, (e.id | 0) * 3 + i, 'orb');
        }
        if (S0 && S0.alU > R.simT) LT.addElem(R, R.ix, R.iy, 60 + R.iz, 260, LT.blend('WWE'), 1, e.id | 0, 'alacrity');   // Alacrity: Wex strobes + fiery tint
      } else if (e.kind === 'spirit') LT.addElem(R, R.ix, R.iy, 50 + R.iz, 240, 'exort', 0.9, e.id | 0, 'spirit');
    }
    if (S0 && S0.wdP > 0) R.light(sx + Math.cos(e.facing) * 4, sy - 10, 14 + 26 * S0.wdP, [255, 150, 60], 0.15 + 0.55 * S0.wdP);
    if (e.kind === 'hero') {
      const orbs = e.inv.orbs, o = PX.mixOrbs(orbs.join(''));
      const k = orbs.length ? 0.4 : 0, base = [255, 238, 214];
      const col = [base[0] + (o[0] - base[0]) * k, base[1] + (o[1] - base[1]) * k, base[2] + (o[2] - base[2]) * k];
      R.light(sx, sy - 6, 112 + Math.sin(R.time * 3) * 1.5, col, 1.0);
      for (let i = 0; i < orbs.length; i++) {
        const th = R.time * 2.6 + i * 2.0944, c = PX.ORB_RGB[orbs[i]];
        const ox = sx + Math.cos(th) * 12, oy = sy + Math.sin(th) * 5 - 12;
        R.light(ox, oy, 34, c, 0.55);
        R.glow(ox, oy, 9, PX.ORB_HEX[orbs[i]], 0.55);
      }
      if (e.statuses.length && has(e, 'magicImmune')) R.light(sx, sy - 8, 60, [255, 210, 80], 0.5);
    } else if (e.kind === 'spirit') {
      R.light(sx, sy - 6, 46, [255, 140, 50], 0.7);
      R.glow(sx, sy - 8, 12, '#ff8a2a', 0.3);
    } else if (e.kind === 'roshan') {
      if (e.anim && e.anim.name === 'attack') R.light(sx, sy - 12, 48, [255, 120, 60], 0.35);
      R.light(sx, sy - 18, 22, [255, 150, 40], 0.18);      // faint eye-glow
    } else if (e.kind === 'ally') {
      R.light(sx, sy - 8, 30, [120, 255, 200], 0.18);
    } else if (isFoe(e)) {
      if (e.anim && e.anim.name === 'cast') R.light(sx, sy - 8, 40, [180, 100, 255], 0.5);
      if (e.bkb || has(e, 'magicImmune')) R.light(sx, sy - 8, 54, [255, 205, 70], 0.55);
      const L = liftOf(e);
      if (L && isEuls(L)) R.light(sx, sy - 8, 50, [150, 220, 255], 0.5);
      if (e.tele) R.light(sx, sy - 14, 30, [255, 70, 50], 0.25 + 0.2 * Math.sin(R.time * 14));
    }
  }

  function cleanup(w) {
    if (state.size < 64) return;
    for (const id of state.keys()) if (!w.byId.has(id)) state.delete(id);
  }

  // hero cast/item event -> brief cast pose (orb presses and Invoke never emit 'cast')
  function castFlash(R, p) {
    const e = R.w.get(p.unit); if (!e || e.kind !== 'hero') return;
    const S = st(R, e); S.castStart = R.time; S.castUntil = R.time + 0.22; S.name = '';
  }

  IT.UnitDraw = { liftOf, isEuls, visZ, LIFT_VIS, statusIcons, statusList, statusIsBuff, statusRowD, STATUS_ICON, STATUS_NONE, STATUS_KIND, MAX_STATUS_HUD, draw, hud, lights, isUnit, isFoe, allyName, roshName, visible, has, state, cleanup, bar, castFlash, launched, overlay, event, bind };
})(typeof window !== 'undefined' ? window : globalThis);
