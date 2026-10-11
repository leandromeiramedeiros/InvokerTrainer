// Unit drawing: sprites by anim/facing, shadows, status visuals, orbs, bars/labels (HUD pass).
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const PX = IT.Pixel;
  const state = new Map();
  const cntCache = new Map();

  const has = (e, t) => { const s = e.statuses; for (let i = 0; i < s.length; i++) if (s[i].type === t) return true; return false; };
  function count(sheet, anim, dir) {
    const k = sheet + '|' + anim + '|' + dir;
    let n = cntCache.get(k);
    if (n === undefined) { n = IT.Art.count(sheet, anim, dir); cntCache.set(k, n); }
    return n;
  }
  const FALLBACK = { cast: 'attack', attack: 'idle', stunned: 'idle', blink: 'idle', walk: 'idle' };

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

  function sheetOf(e) {
    if (e.kind === 'hero') return 'invoker';
    if (e.kind === 'spirit') return 'forge';
    return IT.Art.sheets[e.skin] ? e.skin : 'pedro';
  }
  function isUnit(e) { return e.kind === 'hero' || e.kind === 'dummy' || e.kind === 'spirit'; }

  function st(R, e) {
    let s = state.get(e.id);
    if (!s) { s = { name: '', t0: R.time, lx: e.x, ly: e.y, moveT: -9, phase: Math.random() * 3 }; state.set(e.id, s); }
    return s;
  }

  function visible(R, e) {
    if (e.dead) return false;
    if (e.team === 1 && R.w.fog !== false && !e.visible) return false;
    return true;
  }

  function dirOf(f) {
    const c = Math.cos(f), s = Math.sin(f);
    if (Math.abs(s) > Math.abs(c)) return s > 0 ? 's' : 'n';
    return 'e';
  }

  // resolve the sprite for an entity at render time; returns { cv, ax, ay }
  const spin = ['s', 'e', 'n', 'w'];
  const out = { cv: null, ax: 0, ay: 0, mirror: false, sheep: false };
  function sprite(R, e, S) {
    const sheet = sheetOf(e), def = IT.Art.sheets[sheet];
    let anim = e.anim ? e.anim.name : 'idle';
    if (e.kind === 'spirit') anim = e._wind ? 'attack' : (R.time - S.moveT < 0.15 ? 'walk' : 'idle');
    let facing = e.facing;
    let dir = dirOf(facing), mirror = Math.cos(facing) < 0;
    const lifted = has(e, 'lift') || R.iz > 8;
    if (lifted) {
      const d = spin[Math.floor(R.time * 12) & 3];
      dir = d === 'w' ? 'e' : d; mirror = d === 'w';
    }
    if (has(e, 'stun') || has(e, 'frozen') && e.kind === 'dummy') { if (count(sheet, 'stunned', dir)) anim = 'stunned'; }
    if (has(e, 'hex')) {
      out.sheep = true; out.cv = sheep(((R.time * (anim === 'walk' ? 8 : 0)) & 1), Math.cos(facing) < 0);
      out.ax = 7; out.ay = 10; out.mirror = false;
      return out;
    }
    out.sheep = false;
    let n = count(sheet, anim, dir);
    while (!n && FALLBACK[anim]) { anim = FALLBACK[anim]; n = count(sheet, anim, dir); }
    if (!n) { anim = 'idle'; n = count(sheet, 'idle', dir); }
    if (S.name !== anim) { S.name = anim; S.t0 = R.time; }
    const et = R.time - S.t0 + S.phase;
    let idx;
    switch (anim) {
      case 'idle': idx = Math.floor(et * 3) % n; break;
      case 'walk': idx = Math.floor(et * 8 * IT.U.clamp((e.ms || 300) / 300, 0.6, 1.8)) % n; break;
      case 'stunned': idx = Math.floor(et * 5) % n; break;
      case 'cast': idx = Math.min(n - 1, Math.floor((R.time - S.t0) * 6)); break;
      case 'attack': idx = Math.min(n - 1, Math.floor((R.time - S.t0) * 12)); break;
      default: idx = Math.min(n - 1, Math.floor((R.time - S.t0) * 6));
    }
    out.cv = IT.Art.canvas(sheet, `${anim}_${dir}_${idx}`, mirror);
    out.ax = def.anchor[0]; out.ay = def.anchor[1]; out.mirror = mirror;
    return out;
  }

  function shadow(cx, x, y, rx, ry, a) {
    cx.fillStyle = `rgba(0,0,0,${a})`;
    for (let dy = -ry; dy <= ry; dy++) {
      const hw = Math.round(rx * Math.sqrt(1 - (dy * dy) / ((ry + 0.5) * (ry + 0.5))));
      cx.fillRect(x - hw, y + dy, hw * 2 + 1, 1);
    }
  }

  const ORB_NAME = { Q: 'orb_q', W: 'orb_w', E: 'orb_e' };
  function orbPositions(R, e, sx, sy) {
    const orbs = e.inv && e.inv.orbs;
    if (!orbs || !orbs.length) return null;
    return orbs;
  }
  function drawOrbs(R, e, sx, sy, front) {
    const orbs = e.inv && e.inv.orbs;
    if (!orbs) return;
    const cx = R.cx, n = orbs.length;
    for (let i = 0; i < n; i++) {
      const th = R.time * 2.6 + i * 2.0944, s = Math.sin(th);
      if ((s > 0) !== front) continue;
      const ox = Math.cos(th) * 12, oy = s * 5 - 12 + Math.sin(R.time * 5 + i) * 0.8;
      const cv = IT.Art.canvas('invoker', ORB_NAME[orbs[i]] || 'orb_q');
      if (cv) cx.drawImage(cv, Math.round(sx + ox - cv.width / 2), Math.round(sy + oy - cv.height / 2));
    }
  }

  function draw(R, e) {
    const cx = R.cx, w = R.w, S = st(R, e);
    R.interp(e);
    const P = R.P, gx = R.ix / P - R.camX, gy = R.iy / P - R.camY, zp = R.iz / P;
    const sxp = Math.round(gx), syp = Math.round(gy), sy = Math.round(gy - zp);
    if (Math.hypot(e.x - S.lx, e.y - S.ly) > 0.4) S.moveT = R.time;
    S.lx = e.x; S.ly = e.y;
    const sp = sprite(R, e, S);
    if (!sp.cv) return;
    const rr = Math.max(3, Math.round(e.radius / P));
    const zs = Math.min(0.5, zp / 60);
    shadow(cx, sxp, syp, Math.round(rr * (e.kind === 'spirit' ? 1.0 : 1.25) * (1 - zs)), Math.max(1, Math.round(rr * 0.45)), 0.38 - zs * 0.3);

    const imm = has(e, 'magicImmune'), ghost = has(e, 'ghost'), frozen = has(e, 'frozen');
    const root = has(e, 'root') || has(e, 'atosRoot');
    if (root) vines(R, sxp, syp, rr, true, has(e, 'atosRoot'));
    if (e.kind === 'hero') drawOrbs(R, e, sxp, sy, false);
    const dx = sxp - sp.ax, dy = sy - sp.ay;
    const bl = e.anim && e.anim.name === 'blink' && e.kind === 'dummy';
    let img = sp.cv;
    if (imm) {
      const pul = 0.55 + 0.25 * Math.sin(R.time * 6), gold = PX.tinted(img, '#ffd24a');
      cx.globalAlpha = pul;
      cx.drawImage(gold, dx - 1, dy); cx.drawImage(gold, dx + 1, dy); cx.drawImage(gold, dx, dy - 1); cx.drawImage(gold, dx, dy + 1);
      cx.globalAlpha = 1;
      R.glow(sxp, sy - 10, 22, '#ffcc40', 0.35 + 0.1 * Math.sin(R.time * 6));
    }
    if (ghost) {
      cx.globalAlpha = 0.65; cx.drawImage(PX.dithered(img, (R.time * 6) & 1), dx, dy); cx.globalAlpha = 1;
    } else if (bl) {
      const pr = IT.U.clamp((R.time - S.t0) / 0.35, 0, 1);
      cx.drawImage(PX.dithered(img, (R.time * 14) & 1), dx, dy);
      cx.globalAlpha = 0.25 + 0.5 * pr; cx.drawImage(PX.tinted(img, '#b070ff'), dx, dy); cx.globalAlpha = 1;
      if (Math.random() < 0.7) IT.Particles.emit({ x: e.x + (Math.random() - 0.5) * 70, y: e.y, z: Math.random() * 100, n: 1, ramp: 'purple', speed: 10, up: 25, life: 0.5, rest: 0.8 });
    } else {
      cx.drawImage(img, dx, dy);
    }
    if (frozen) {
      cx.globalAlpha = 0.6; cx.drawImage(PX.tinted(img, '#8fe6ff'), dx, dy); cx.globalAlpha = 1;
      cx.fillStyle = '#e8fbff';
      const h = img.height;
      for (let k = -2; k <= 2; k++) { const hh = 3 + ((k & 1) ? 3 : 5) + (k === 0 ? 2 : 0); cx.fillRect(sxp + k * 3 - 1, sy - hh - 1 + 1, 2, hh); cx.fillStyle = k & 1 ? '#8fe6ff' : '#e8fbff'; }
      cx.fillStyle = '#4cb6ec'; cx.fillRect(sxp - 8, sy - 1, 17, 1);
    } else if (has(e, 'slow')) {
      cx.globalAlpha = 0.18; cx.drawImage(PX.tinted(img, '#4cb6ec'), dx, dy); cx.globalAlpha = 1;
      cx.fillStyle = '#6cd0ff';
      for (let k = 0; k < 3; k++) {
        const ph = (R.time * 0.9 + k * 0.37) % 1;
        cx.fillRect(sxp - 5 + k * 5 + (k & 1), sy - img.height * 0.55 + ph * img.height * 0.5, 1, 2);
      }
    }
    if (has(e, 'hex')) { cx.globalAlpha = 0.22; cx.drawImage(PX.tinted(img, '#5cff6c'), dx, dy); cx.globalAlpha = 1; }
    if (root) vines(R, sxp, syp, rr, false, has(e, 'atosRoot'));
    if (e.kind === 'hero') drawOrbs(R, e, sxp, sy, true);
    S.sx = sxp; S.sy = sy; S.top = img.height - sp.ay;
  }

  function vines(R, x, y, r, back, atos) {
    const cx = R.cx, rx = r + 4, ry = Math.max(2, Math.round(r * 0.55)), n = 18;
    const c1 = atos ? '#b9a0ff' : '#3a8a24', c2 = atos ? '#ece0ff' : '#6ccc3c';
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.2832 + R.time * 0.3, s = Math.sin(a);
      if ((s < 0) !== back) continue;
      const px = Math.round(x + Math.cos(a) * rx), py = Math.round(y + s * ry);
      cx.fillStyle = c1; cx.fillRect(px, py, 2, 1);
      if (i % 3 === 0) { cx.fillStyle = c2; cx.fillRect(px, py - 1 - (i & 1), 1, 2); }
    }
  }

  // HUD pass (after lighting): bars, labels, stun stars
  function hud(R, e) {
    const S = state.get(e.id); if (!S || S.sx == null) return;
    const cx = R.cx, x = S.sx, top = S.sy - S.top;
    if (has(e, 'stun')) {
      for (let k = 0; k < 3; k++) {
        const a = R.time * 5 + k * 2.0944, sx = x + Math.cos(a) * 7, sy = top - 3 + Math.sin(a) * 2;
        cx.fillStyle = '#ffe040'; cx.fillRect(Math.round(sx) - 1, Math.round(sy), 3, 1); cx.fillRect(Math.round(sx), Math.round(sy) - 1, 1, 3);
        cx.fillStyle = '#fff8c0'; cx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
      }
    }
    if (has(e, 'hex') || !e.maxHp) return;
    let y;
    if (e.kind === 'dummy') {
      y = S.sy - 26;
      if (e.name) PX.text(cx, e.name, x, y - 7, '#f0e8ff', 'c');
      bar(cx, x - 9, y, 18, 2, e.hp / e.maxHp, '#e84040', '#2a0808');
      if (e.maxMana) bar(cx, x - 9, y + 2, 18, 1, e.mana / e.maxMana, '#4a8cff', '#0a1430');
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
    R.interp(e);
    const sx = R.ix / R.P - R.camX, sy = R.iy / R.P - R.camY - R.iz / R.P;
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
    } else if (e.kind === 'dummy' && e.anim && e.anim.name === 'cast') {
      R.light(sx, sy - 8, 40, [180, 100, 255], 0.5);
    }
  }

  function cleanup(w) {
    if (state.size < 64) return;
    for (const id of state.keys()) if (!w.byId.has(id)) state.delete(id);
  }

  IT.UnitDraw = { draw, hud, lights, isUnit, visible, has, state, cleanup, bar };
})(typeof window !== 'undefined' ? window : globalThis);
