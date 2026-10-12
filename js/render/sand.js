// Falling-sand VFX layer (visual only, never touches the sim, never reveals fog). Owner: S4.
// Ground: ring-buffer cellular automaton, 1 cell = 1 screen px, world-anchored (heightfield piles, magma flow, cooling, crumble).
// Air: pooled "flyers" with height z (fire, sparks, embers, drops, grains, mist...) that land and deposit into the grid.
// Emissive pixels feed the lightmap (light.js) and the bloom canvas; the colour layers are drawn BEFORE the fog multiply.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const PX = IT.Pixel;
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------- grid
  const GW = 1024, GH = 512, GM = GW - 1, HM = GH - 1, N = GW * GH, NM = N - 1, CWn = 32, CHn = 16;
  const mat = new Uint8Array(N), hgt = new Uint8Array(N), tmp = new Uint8Array(N), age = new Uint8Array(N), sd = new Uint8Array(N), stamp = new Uint8Array(N);
  const cnt = new Int32Array(CWn * CHn);
  const E = 0, MAGMA = 1, STONE = 2, ASH = 3, EMBER = 4, DUSTP = 5, DUSTW = 6, DUSTG = 7, FROST = 8, MELT = 9, DUSTC = 10, GLASS = 11;
  const DX = [1, -1, 0, 0, 1, -1, 1, -1], DY = [0, 0, 1, -1, 1, -1, -1, 1];
  const CAPC = 26000;

  // seconds of life -> per-tick age-step probability (60 Hz)
  const life = s => 255 / (s * 60);
  const AGEP = new Float32Array(16);
  AGEP[STONE] = life(0.9); AGEP[ASH] = life(1.0); AGEP[GLASS] = life(1.5); AGEP[DUSTP] = life(2.4); AGEP[DUSTW] = life(2.0); AGEP[DUSTG] = life(2.4); AGEP[DUSTC] = life(2.0); AGEP[FROST] = life(2.0); AGEP[MELT] = life(0.7);   // ~1/3 of v3: settled sand must not linger
  const FLOWTO = new Uint8Array(16);   // magma may displace these
  for (const m of [E, MAGMA, ASH, EMBER, DUSTP, DUSTW, DUSTG, DUSTC, FROST, MELT, GLASS]) FLOWTO[m] = 1;
  const isDust = m => m === DUSTP || m === DUSTW || m === DUSTG || m === DUSTC || m === GLASS;
  // what a tornado / blast can lift off the ground, and the dust it becomes (magma and live embers stay)
  const LIFTMAP = new Uint8Array(16); LIFTMAP[STONE] = DUSTW; LIFTMAP[ASH] = DUSTW; LIFTMAP[DUSTP] = DUSTP; LIFTMAP[DUSTW] = DUSTW; LIFTMAP[DUSTG] = DUSTG; LIFTMAP[DUSTC] = DUSTC; LIFTMAP[GLASS] = GLASS; LIFTMAP[FROST] = DUSTC;

  let rs = 2463534242;
  function rnd() { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; return (rs >>> 0) / 4294967296; }
  const rr = (a, b) => a + (b - a) * rnd();
  const ri = n => (rnd() * n) | 0;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  let VW = 480, VH = 270, P = 6, camX = 0, camY = 0, OX = 0, OY = 0, hasCam = false;
  let tk = 0, sf = 1, agm = 1, tickAcc = 0, total = 0, clock = 0, tkp = 0;
  let R_ = null;

  const nb = (i, d) => ((((i >> 10) + DY[d]) & HM) << 10) | (((i & GM) + DX[d]) & GM);
  const chunkOf = i => (i >> 15) * CWn + ((i & GM) >> 5);
  const worldX = gx => OX + ((gx - OX) & GM), worldY = gy => OY + ((gy - OY) & HM);

  function kill(i) { mat[i] = 0; hgt[i] = 0; }

  // place material at integer world px. Merges with same material, magma overrides.
  function dep(wx, wy, m, h, t, a) {
    wx |= 0; wy |= 0;
    const rx = wx - OX, ry = wy - OY;
    if (rx < 0 || rx >= GW || ry < 0 || ry >= GH || total > CAPC * 1.25) return;
    const i = ((wy & HM) << 10) | (wx & GM), cm = mat[i];
    if (cm === E) { mat[i] = m; hgt[i] = h; tmp[i] = t; age[i] = a || 0; sd[i] = (rnd() * 256) | 0; stamp[i] = 0; cnt[chunkOf(i)]++; return; }
    if (cm === m) {
      const nh = Math.min(255, hgt[i] + h);
      if (m === MAGMA) tmp[i] = ((tmp[i] * hgt[i] + t * h) / nh) | 0;
      else if (m === EMBER) tmp[i] = Math.max(tmp[i], t);
      hgt[i] = nh; return;
    }
    if (m === MAGMA && cm !== STONE) { mat[i] = MAGMA; hgt[i] = Math.min(255, h + (hgt[i] >> 1)); tmp[i] = t; age[i] = 0; return; }
    if (m === MAGMA) { mat[i] = MAGMA; hgt[i] = h; tmp[i] = t; age[i] = 0; return; }   // remelt crust
    if (m === EMBER && (cm === ASH || isDust(cm))) { tmp[i] = Math.max(tmp[i], t); }
  }
  function discDep(x, y, r, m, h, t, prob) {
    const r2 = r * r, x0 = Math.round(x), y0 = Math.round(y), n = Math.ceil(r);
    for (let dy = -n; dy <= n; dy++) for (let dx = -n; dx <= n; dx++) {
      if (dx * dx + dy * dy > r2 || (prob < 1 && rnd() > prob)) continue;
      dep(x0 + dx, y0 + dy, m, h, t, 0);
    }
  }

  // ---------------------------------------------------------------- cellular step
  function topple(i, m, h, thr) {
    const n = nb(i, ri(8)), mn = mat[n];
    let hn;
    if (mn === E) hn = 0; else if (mn === m) hn = hgt[n]; else return;
    if (h <= hn + thr) return;
    hgt[i] = h - 1;
    if (mn === E) { mat[n] = m; hgt[n] = 1; tmp[n] = tmp[i]; age[n] = age[i]; sd[n] = sd[i]; cnt[chunkOf(n)]++; } else hgt[n] = hn + 1;
    stamp[n] = sf;
  }
  function ageStep(i, m, h) {
    const p = AGEP[m] * agm * (h < 3 ? 1.5 : 1);
    if (rnd() < p) { const a = age[i] + 1; if (a >= 255) return false; age[i] = a; }
    return true;
  }
  function liquid(i, m, h, visc, intoOk) {
    if (rnd() >= visc) return;
    const n = nb(i, ri(8)), mn = mat[n];
    if (!intoOk[mn]) return;
    const hn = mn === m ? hgt[n] : 0, d = h - hn;
    if (d < 2) return;
    const a = Math.min(d >> 1, (d >> 2) + 1);
    if (mn === m) { tmp[n] = ((tmp[n] * hn + tmp[i] * a) / (hn + a)) | 0; hgt[n] = hn + a; }
    else {
      if (mn === FROST || mn === MELT) steam(n);
      mat[n] = m; hgt[n] = a; tmp[n] = tmp[i]; age[n] = 0; sd[n] = (rnd() * 256) | 0; cnt[chunkOf(n)]++;
    }
    stamp[n] = sf; hgt[i] = h - a;
  }
  const MELT_INTO = new Uint8Array(16); MELT_INTO[E] = 1; MELT_INTO[MELT] = 1;
  function steam(n) { fly(K_MIST, worldX(n & GM), worldY(n >> 10), 1, rr(-4, 4), rr(-4, 4), rr(10, 22), rr(0.8, 1.6), 1, 0); }

  function step(i) {
    const m = mat[i];
    if (stamp[i] === sf) return 1;
    const h = hgt[i];
    switch (m) {
      case MAGMA: {
        let t = tmp[i];
        if (rnd() < (h > 12 ? 0.2 : h > 5 ? 0.32 : 0.55) * agm) { t -= 2; tmp[i] = t; }
        if (t <= 92) { mat[i] = STONE; tmp[i] = 44; age[i] = 90; return 1; }
        liquid(i, MAGMA, h, (t - 92) * 0.0048, FLOWTO);
        if (t > 130) {   // surface fire, bubbles, embers
          const q = rnd();
          if (q < 0.0016 * (h > 3 ? 1 : 0.4)) fly(K_FIRE, worldX(i & GM) + rnd(), worldY(i >> 10), 0, rr(-4, 4), rr(-3, 3), rr(14, 40), rr(0.35, 0.8), 0, 0);
          else if (q < 0.0021) fly(K_EMBER, worldX(i & GM), worldY(i >> 10), 0, rr(-12, 12), rr(-8, 8), rr(30, 80), rr(1, 2), 0, 0);
        }
        return 1;
      }
      case STONE: {
        const g = tmp[i]; if (g > 0 && rnd() < 0.2) tmp[i] = g - 1;
        if (!ageStep(i, m, h)) { kill(i); return 0; }
        return 1;
      }
      case ASH: {
        const g = tmp[i]; if (g > 0 && rnd() < 0.12) tmp[i] = g - 1;
        if (h > 2) topple(i, m, h, 2);
        if (!ageStep(i, m, hgt[i])) { kill(i); return 0; }
        return 1;
      }
      case EMBER:
        if (rnd() < 0.8 * agm && --tmp[i] <= 0) { kill(i); return 0; }
        return 1;
      case FROST: {
        const g = tmp[i];
        if (g > 0 && rnd() < 0.035) {
          const n = nb(i, ri(4));
          if (mat[n] === E) {
            let c = 0;
            for (let d = 0; d < 4; d++) if (mat[nb(n, d)] === FROST) c++;
            if (c <= 1) { mat[n] = FROST; hgt[n] = Math.max(2, h - 1); tmp[n] = g - 1; age[n] = age[i]; sd[n] = (rnd() * 256) | 0; cnt[chunkOf(n)]++; stamp[n] = sf; }
          }
        }
        if (!ageStep(i, m, h)) { mat[i] = MELT; age[i] = 0; tmp[i] = 0; }
        return 1;
      }
      case MELT:
        if (h > 1) liquid(i, MELT, h, 0.4, MELT_INTO);
        if (!ageStep(i, m, hgt[i])) { kill(i); return 0; }
        return 1;
      default:   // dust
        if (h > 2) topple(i, m, h, 2);
        if (!ageStep(i, m, hgt[i])) { kill(i); return 0; }
        return 1;
    }
  }

  function inRange(cx, cy, mg) {
    const csx = ((cx << 5) - camX) & GM, csy = ((cy << 5) - camY) & HM;
    return (csx < VW + mg || csx + 31 >= GW - mg) && (csy < VH + mg || csy + 31 >= GH - mg);
  }

  function tick() {
    tk++; sf = (tk & 255) || 1;
    const flip = tk & 1;
    let tot = 0;
    for (let cy = 0; cy < CHn; cy++) for (let cx = 0; cx < CWn; cx++) {
      const c = cy * CWn + cx, n0 = cnt[c];
      if (!n0) continue;
      if (!inRange(cx, cy, 24)) { tot += n0; continue; }
      cnt[c] = 0;
      let k = 0;
      const x0 = cx << 5, y0 = cy << 5;
      for (let r = 0; r < 32; r++) {
        const base = (y0 + (flip ? 31 - r : r)) << 10;
        for (let q = 0; q < 32; q++) {
          const i = base | (x0 + (flip ? 31 - q : q));
          if (mat[i] !== E) k += step(i);
        }
      }
      cnt[c] += k; tot += cnt[c];
    }
    total = tot; agm = (tot > CAPC ? 2.5 : 1) * (tot > 9000 ? 2 : 1);
  }

  // lift a bit of sand off the ground at world px (x,y): returns the dust material it becomes, or 0
  function cellAt(wx, wy) {
    wx |= 0; wy |= 0; const rx = wx - OX, ry = wy - OY;
    if (rx < 0 || rx >= GW || ry < 0 || ry >= GH) return -1;
    return ((wy & HM) << 10) | (wx & GM);
  }
  function lift(wx, wy) {
    const i = cellAt(wx, wy); if (i < 0) return 0;
    const m = LIFTMAP[mat[i]]; if (!m) return 0;
    const h = hgt[i]; if (h <= 3) kill(i); else hgt[i] = h - 3;
    return m;
  }

  // ---------------------------------------------------------------- flyers
  const FC = 14000;
  const px = new Float32Array(FC), py = new Float32Array(FC), pz = new Float32Array(FC);
  const pvx = new Float32Array(FC), pvy = new Float32Array(FC), pvz = new Float32Array(FC);
  const pox = new Float32Array(FC), poy = new Float32Array(FC);
  const page = new Float32Array(FC), plife = new Float32Array(FC);
  const pk = new Uint8Array(FC), pm = new Uint8Array(FC), pc = new Uint8Array(FC), pg = new Uint8Array(FC);
  let fhead = 0, flive = 0;
  const K_FIRE = 1, K_SMOKE = 2, K_EMBER = 3, K_SPARK = 4, K_DROP = 5, K_GRAIN = 6, K_SHARD = 7, K_MIST = 8, K_MOTE = 9, K_ARC = 10, K_VORT = 11, K_ROCK = 12, K_PULL = 13;
  // palette ids (m for sparks/motes/embers)
  const PAL_FIRE = 0, PAL_PURPLE = 1, PAL_ICE = 2, PAL_GOLD = 3, PAL_WHITE = 4, PAL_GREEN = 5, PAL_CYAN = 6, PAL_RED = 7;
  // element-flavoured vividness: Exort orange/red/gold, Wex violet/cyan, Quas icy blue/white
  function vv(p) {
    const q = rnd();
    if (p === PAL_FIRE) return q < 0.2 ? PAL_GOLD : q < 0.36 ? PAL_RED : PAL_FIRE;
    if (p === PAL_PURPLE) return q < 0.3 ? PAL_CYAN : PAL_PURPLE;
    if (p === PAL_ICE) return q < 0.3 ? PAL_WHITE : PAL_ICE;
    return p;
  }

  // x,y in world px (float), z px, v px/s, life s. m: material / palette, g: kind-specific param
  function fly(k, x, y, z, vx, vy, vz, lf, m, g) {
    const i = fhead; fhead = (fhead + 1) % FC;
    if (!pk[i]) flive++;
    px[i] = x; py[i] = y; pz[i] = z; pvx[i] = vx; pvy[i] = vy; pvz[i] = vz;
    page[i] = 0; plife[i] = lf; pk[i] = k; pm[i] = m; pg[i] = g; pc[i] = (rnd() * 256) | 0;
    return i;
  }
  function fkill(i) { pk[i] = 0; flive--; }

  function flyEnd(i, k) {
    if (k === K_FIRE) { if (rnd() < 0.3) fly(K_SMOKE, px[i], py[i], pz[i], pvx[i] * 0.3, pvy[i] * 0.3, rr(8, 22), rr(0.8, 1.6), 0, 0); }
    else if (k === K_VORT) {   // flung out of the spiral: tangent + outward
      const th = pc[i] / 256 * TAU + pvy[i] * page[i], rho = pvx[i] * (pg[i] ? 0.2 : 1) + 0.3 * pz[i], om = pvy[i], ro = rr(18, 46);
      fly(K_GRAIN, px[i], py[i], pz[i], -Math.sin(th) * om * rho * 0.9 + Math.cos(th) * ro, Math.cos(th) * om * rho * 0.6 + Math.sin(th) * ro * 0.7, rr(0, 30), 3, pm[i], 3);
    }
    else if (k === K_PULL) { if (rnd() < 0.5) fly(K_SPARK, px[i], py[i], pz[i], rr(-30, 30), rr(-20, 20), rr(20, 60), rr(0.2, 0.5), vv(PAL_PURPLE), 0); }
    else if (k === K_ROCK) rockLand(pox[i], poy[i], pm[i], pg[i]);
    fkill(i);
  }

  function flyUpdate(dt) {
    for (let i = 0; i < FC; i++) {
      const k = pk[i]; if (!k) continue;
      const a = page[i] + dt; page[i] = a;
      if (a < 0) continue;
      if (a >= plife[i]) { flyEnd(i, k); continue; }
      switch (k) {
        case K_FIRE:
          pvz[i] += 55 * dt; pvz[i] *= 1 - (pg[i] ? 0.15 : 0.9) * dt;
          pvx[i] += (rnd() - 0.5) * 240 * dt; pvx[i] *= 1 - 2.5 * dt; pvy[i] *= 1 - 2.5 * dt;
          px[i] += pvx[i] * dt; py[i] += pvy[i] * dt; pz[i] += pvz[i] * dt; if (pz[i] < 0) pz[i] = 0;
          break;
        case K_SMOKE:
          pvz[i] += 12 * dt; pvx[i] += (rnd() - 0.5) * 80 * dt; pvx[i] *= 1 - 1.2 * dt;
          px[i] += pvx[i] * dt; py[i] += pvy[i] * dt; pz[i] += pvz[i] * dt;
          break;
        case K_EMBER:
          pvz[i] -= 115 * dt; pvx[i] += (rnd() - 0.5) * 170 * dt; pvy[i] += (rnd() - 0.5) * 120 * dt;
          pvx[i] *= 1 - 1.5 * dt; pvy[i] *= 1 - 1.5 * dt;
          px[i] += pvx[i] * dt; py[i] += pvy[i] * dt; pz[i] += pvz[i] * dt;
          if (pz[i] <= 0) { pz[i] = 0; if (rnd() < 0.55) dep(px[i], py[i], EMBER, 1, 90 + ((rnd() * 165) | 0), pm[i]); fkill(i); }
          break;
        case K_SPARK:
          pvz[i] -= 260 * dt; pvx[i] *= 1 - 0.6 * dt; pvy[i] *= 1 - 0.6 * dt;
          px[i] += pvx[i] * dt; py[i] += pvy[i] * dt; pz[i] += pvz[i] * dt;
          if (pz[i] <= 0) {
            pz[i] = 0;
            if (pvz[i] < -22) { pvz[i] = -pvz[i] * 0.55; pvx[i] *= 0.75; pvy[i] *= 0.75; } else { pvz[i] = 0; pvx[i] *= 1 - 7 * dt; pvy[i] *= 1 - 7 * dt; }
          }
          break;
        case K_DROP: case K_GRAIN: case K_SHARD: {
          pvz[i] -= (k === K_DROP ? 150 : k === K_GRAIN ? 160 : 200) * dt;
          if (k !== K_DROP) { pvx[i] *= 1 - 0.8 * dt; pvy[i] *= 1 - 0.8 * dt; }
          px[i] += pvx[i] * dt; py[i] += pvy[i] * dt; pz[i] += pvz[i] * dt;
          if (pz[i] <= 0) {
            pz[i] = 0;
            if (k === K_DROP) {
              dep(px[i], py[i], MAGMA, pg[i] || 8, 250 - ((rnd() * 20) | 0), 0);
              if (rnd() < 0.08) fly(K_SPARK, px[i], py[i], 0, rr(-30, 30), rr(-20, 20), rr(30, 70), rr(0.3, 0.7), PAL_FIRE, 0);
            } else if (k === K_GRAIN) {
              const m = pm[i];
              if (pvz[i] < -60 && rnd() < 0.3) fly(K_GRAIN, px[i], py[i], 0.5, pvx[i] * 0.5 + rr(-10, 10), pvy[i] * 0.5 + rr(-8, 8), -pvz[i] * 0.34, 3, m, 2);   // impact scatter
              dep(px[i], py[i], m, pg[i] || 3, m === ASH ? 120 + (pc[i] >> 1) : 0, 0);
            } else dep(px[i], py[i], FROST, 5, 4 + (pc[i] & 3), 0);
            fkill(i);
          }
          break;
        }
        case K_MIST:
          pvz[i] += 6 * dt; pvx[i] += (rnd() - 0.5) * 70 * dt; pvy[i] += (rnd() - 0.5) * 50 * dt; pvx[i] *= 1 - 0.8 * dt; pvy[i] *= 1 - 0.8 * dt;
          px[i] += pvx[i] * dt; py[i] += pvy[i] * dt; pz[i] += pvz[i] * dt;
          break;
        case K_MOTE:
          pvx[i] += (rnd() - 0.5) * 90 * dt; pvy[i] += (rnd() - 0.5) * 60 * dt; pvx[i] *= 1 - 0.6 * dt; pvy[i] *= 1 - 0.6 * dt;
          px[i] += pvx[i] * dt; py[i] += pvy[i] * dt; pz[i] += pvz[i] * dt; if (pz[i] < 0) pz[i] = 0;
          break;
        case K_VORT: {
          const th = pc[i] / 256 * TAU + pvy[i] * a, z = pz[i] + pvz[i] * dt, rho = pvx[i] * (pg[i] ? 1 - 0.8 * a / plife[i] : 1) + 0.3 * z;
          pz[i] = z; px[i] = pox[i] + Math.cos(th) * rho; py[i] = poy[i] + Math.sin(th) * rho * 0.7;
          break;
        }
        case K_ROCK: {   // falling fragment: accelerating dive from up-right, cyan flame trail
          const s = a / plife[i], e = s * s;
          pz[i] = pvz[i] * (1 - e); px[i] = pox[i] + pvx[i] * (1 - e); py[i] = poy[i] + pvy[i] * (1 - e);
          for (let n = rate(1000 + (i & 63), 150, dt); n-- > 0;) fly(K_FIRE, px[i] + rr(-1.5, 1.5), py[i], pz[i] + rr(-1, 4), rr(-6, 6) - pvx[i] * 0.3, rr(-3, 3), rr(5, 30), rr(0.25, 0.5), pm[i], 0);
          if (rnd() < 14 * dt) fly(K_EMBER, px[i], py[i], pz[i], rr(-10, 10), rr(-6, 6), rr(0, 20), rr(0.5, 1.1), pm[i], 0);
          break;
        }
        case K_PULL: {   // drawn inward along a twisting path
          const s = a / plife[i], e = s * s, an = e * 2.4, c = Math.cos(an), sn = Math.sin(an), dx = (pvx[i] - pox[i]) * (1 - e), dy = (pvy[i] - poy[i]) * (1 - e);
          px[i] = pox[i] + dx * c - dy * sn * 0.8; py[i] = poy[i] + dx * sn * 0.8 + dy * c;
          pz[i] = 2 + 12 * Math.sin(s * Math.PI);
          break;
        }
        default: break;   // K_ARC static
      }
    }
  }

  // ---------------------------------------------------------------- palettes
  const A = (r, g, b) => (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
  const ch = c => c < 0 ? 0 : c > 255 ? 255 : c | 0;
  function shadeSet(cols) {
    const o = new Uint32Array(cols.length * 9);
    cols.forEach((c, ci) => { for (let d = -4; d <= 4; d++) { const f = 1 + d * 0.1; o[ci * 9 + d + 4] = A(ch(c[0] * f), ch(c[1] * f), ch(c[2] * f)); } });
    return o;
  }
  const SH = {
    stone: shadeSet([[30, 27, 38], [40, 35, 48], [24, 21, 30], [50, 44, 58]]),
    ash: shadeSet([[38, 30, 26], [50, 40, 34], [28, 22, 20], [62, 50, 42]]),
    dustP: shadeSet([[122, 58, 216], [176, 112, 255], [230, 200, 255], [74, 32, 144]]),
    dustW: shadeSet([[128, 144, 176], [184, 196, 224], [232, 238, 255], [74, 84, 112]]),
    dustG: shadeSet([[216, 154, 28], [255, 210, 74], [255, 242, 160], [138, 90, 18]]),
    dustC: shadeSet([[76, 182, 236], [143, 230, 255], [212, 246, 255], [42, 120, 184]]),
    glass: shadeSet([[255, 214, 90], [255, 238, 150], [255, 176, 40], [214, 126, 22]]),
    frost: shadeSet([[76, 182, 236], [143, 230, 255], [212, 246, 255], [190, 240, 255]]),
    melt: shadeSet([[42, 120, 184], [76, 182, 236], [143, 230, 255], [28, 80, 140]]),
  };
  const DUSTSET = { [DUSTP]: SH.dustP, [DUSTW]: SH.dustW, [DUSTG]: SH.dustG, [DUSTC]: SH.dustC, [GLASS]: SH.glass };
  const MAG = new Uint32Array(256), MAGC = [];
  {
    const st = [[90, [58, 10, 4]], [125, [130, 24, 6]], [160, [200, 60, 10]], [195, [240, 96, 16]], [225, [255, 138, 28]], [245, [255, 186, 56]], [255, [255, 226, 120]]];
    for (let t = 0; t < 256; t++) {
      let j = 0; while (j < st.length - 2 && t > st[j + 1][0]) j++;
      const a = st[j], b = st[j + 1], f = clamp((t - a[0]) / (b[0] - a[0]), 0, 1);
      const c = [a[1][0] + (b[1][0] - a[1][0]) * f, a[1][1] + (b[1][1] - a[1][1]) * f, a[1][2] + (b[1][2] - a[1][2]) * f];
      MAGC.push(c); MAG[t] = A(ch(c[0]), ch(c[1]), ch(c[2]));
    }
  }
  const RAMP = n => PX.RAMPS[n + 'U'];
  const PALS = [RAMP('fire'), RAMP('purple'), RAMP('ice'), RAMP('gold'), RAMP('white'), RAMP('green'), RAMP('cyan'), RAMP('red')];
  const SMOKEC = [A(34, 30, 40), A(50, 44, 58), A(70, 62, 80)];
  const MISTC = [[A(184, 196, 224), A(232, 238, 255), A(143, 230, 255)], [A(143, 230, 255), A(212, 246, 255), A(255, 255, 255)]];
  const WHITE = A(255, 255, 255);
  const mix = (a, b, t) => {
    const r = (a & 255) + ((b & 255) - (a & 255)) * t, g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t, bl = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t;
    return A(r | 0, g | 0, bl | 0);
  };

  // ---------------------------------------------------------------- render buffers / emissive accumulation
  let LWn = 120, LHn = 68;   // emissive grid (4 px cells) = view size / 4, rebuilt by init() on zoom
  let er = new Float32Array(LWn * LHn), eg = new Float32Array(LWn * LHn), eb = new Float32Array(LWn * LHn);
  let gLayer = null, aLayer = null, glowCv = null, glowC = null, glowImg = null, glowU = null, emAny = false;
  // layer = offscreen canvas + ImageData. uLo/uHi: rows of the pixel buffer that may be non-zero; cLo/cHi: rows of the canvas that may be non-zero.
  // Only the dirty rows are cleared / uploaded / blitted each frame.
  const mk = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d'), img = c.createImageData(w, h); return { cv, c, img, u: new Uint32Array(img.data.buffer), uLo: h, uHi: -1, cLo: h, cHi: -1 }; };
  function layerReset(L) { L.u.fill(0); L.c.clearRect(0, 0, L.cv.width, L.cv.height); L.uLo = L.cLo = L.cv.height; L.uHi = L.cHi = -1; }
  function layerClear(L) { if (L.uHi >= L.uLo) L.u.fill(0, L.uLo * VW, (L.uHi + 1) * VW); }
  function layerBlit(L, R, lo, hi) {
    if (lo < 0) lo = 0; if (hi > VH - 1) hi = VH - 1;
    const a = Math.min(lo, L.cLo), b = Math.max(hi, L.cHi);
    L.c.putImageData(L.img, 0, 0, 0, a, VW, b - a + 1);
    L.cLo = lo; L.cHi = hi; L.uLo = lo; L.uHi = hi;
    R.cx.drawImage(L.cv, 0, lo, VW, hi - lo + 1, 0, lo, VW, hi - lo + 1);
  }
  function glowAdd(sx, sy, col, w) {
    const k = (sy >> 2) * LWn + (sx >> 2), f = w / 255;
    er[k] += (col & 255) * f; eg[k] += ((col >> 8) & 255) * f; eb[k] += ((col >> 16) & 255) * f; emAny = true;
  }
  const B4 = PX.BAYER4;

  let gHad = false;
  function drawGround(R) {
    if (!total && !gHad) return;
    const u = gLayer.u; layerClear(gLayer);
    let any = false, lo = VH, hi = -1;
    for (let cy = 0; cy < CHn; cy++) for (let cx = 0; cx < CWn; cx++) {
      const c = cy * CWn + cx;
      if (!cnt[c]) continue;
      const csx = ((cx << 5) - camX) & GM, csy = ((cy << 5) - camY) & HM;
      if (!(csx < VW || csx + 31 >= GW) || !(csy < VH || csy + 31 >= GH)) continue;
      for (let r = 0; r < 32; r++) {
        const gy = (cy << 5) | r, sy = (gy - camY) & HM;
        if (sy >= VH) continue;
        const wy = camY + sy;
        for (let q = 0; q < 32; q++) {
          const gx = (cx << 5) | q, i = (gy << 10) | gx, m = mat[i];
          if (m === E) continue;
          const sx = (gx - camX) & GM;
          if (sx >= VW) continue;
          const wx = camX + sx, h = hgt[i], s = sd[i];
          let col = 0;
          // slope light from upper-left
          let sl = hgt[nb(i, 4)] - hgt[nb(i, 5)]; sl = sl < -4 ? 0 : sl > 4 ? 8 : sl + 4;
          switch (m) {
            case MAGMA: {
              const t = tmp[i];
              let ti = t + (h > 10 ? 10 : 0) + (((s + (tk >> 2)) & 7) < 2 ? 12 : 0) - (sl < 3 ? 6 : 0);
              ti = ti > 255 ? 255 : ti < 90 ? 90 : ti;
              col = MAG[ti];
              glowAdd(sx, sy, col, ((t - 90) / 165) * 0.55);
              break;
            }
            case STONE: {
              const g = tmp[i];
              col = SH.stone[(s & 3) * 9 + sl];
              if (g > 0 && (s & 7) < 3) { col = mix(col, MAG[clamp(g * 2 + 100, 90, 255)], clamp(g / 40, 0, 1)); glowAdd(sx, sy, col, g / 64 * 0.3); }
              else if (g > 0) col = mix(col, MAG[130], clamp(g / 120, 0, 0.5));
              break;
            }
            case ASH: {
              const g = tmp[i];
              col = SH.ash[(s & 3) * 9 + sl];
              if (g > 0 && (s & 3) === 0 && (((s >> 2) + (tk >> 3)) & 3) !== 0) { col = MAG[clamp(g + 120, 90, 255)]; glowAdd(sx, sy, col, g / 255 * 0.5); }
              break;
            }
            case EMBER: {
              const t = tmp[i];
              if (((s + (tk >> 2)) & 7) === 0) continue;
              const pal = PALS[age[i] < 8 ? age[i] : 0], idx = t > 200 ? 0 : t > 130 ? 1 : t > 80 ? 2 : t > 40 ? 3 : 4;
              col = pal[idx];
              glowAdd(sx, sy, col, t / 255 * 0.5);
              break;
            }
            case FROST: {
              col = SH.frost[(s & 3) * 9 + sl];
              if ((((s * 13) + (tk >> 2)) & 31) === 0) { col = WHITE; glowAdd(sx, sy, col, 0.5); }
              else glowAdd(sx, sy, col, 0.05);
              break;
            }
            case MELT: col = SH.melt[(s & 3) * 9 + sl]; break;
            default: {
              col = DUSTSET[m][(s & 3) * 9 + sl];
              if ((((s * 11) + (tk >> 3)) & (m === GLASS ? 7 : 31)) === 0) { col = WHITE; glowAdd(sx, sy, col, 0.4); }
              else if ((s & 3) === 0) glowAdd(sx, sy, col, m === GLASS ? 0.3 : 0.07);
            }
          }
          if (m !== MAGMA && m !== EMBER) {
            const a = age[i];
            if (a > 90 && B4[((wy & 3) << 2) | (wx & 3)] < (a - 90) / 165) continue;   // dither away over the last ~65% of its life
          }
          u[sy * VW + sx] = col; any = true;
          if (sy < lo) lo = sy; if (sy > hi) hi = sy;
        }
      }
    }
    gHad = any;
    if (!any) { gLayer.uLo = VH; gLayer.uHi = -1; return; }
    layerBlit(gLayer, R, lo, hi);
  }

  let aHad = false;
  function drawAir(R) {
    if (!flive && !aHad) return;
    const u = aLayer.u; layerClear(aLayer);
    let any = false, lo = VH, hi = -1;
    for (let i = 0; i < FC; i++) {
      const k = pk[i]; if (!k) continue;
      const a = page[i]; if (a < 0) continue;
      const t = a / plife[i], x = Math.round(px[i]) - camX, yy = Math.round(py[i] - pz[i]) - camY;
      if (x < 0 || yy < 0 || x >= VW || yy >= VH) continue;
      const o = yy * VW + x, c = pc[i];
      let col = 0, w = 0;
      switch (k) {
        case K_FIRE: {
          const pal = PALS[pm[i]], idx = Math.min(5, (t * 5.4 + (c & 1) * 0.6 + (rnd() < 0.12 ? 1 : 0)) | 0);
          col = pal[idx]; w = (1 - t) * 0.5;
          u[o] = col;
          if ((c & 3) === 0 && t < 0.5 && x + 1 < VW) u[o + 1] = col;
          break;
        }
        case K_SMOKE: {
          if (B4[(((yy + camY) & 3) << 2) | ((x + camX) & 3)] > Math.sin(t * Math.PI) * 0.55) continue;
          col = SMOKEC[Math.min(2, (t * 3) | 0)];
          break;
        }
        case K_EMBER: {
          if (rnd() < 0.18) continue;
          col = PALS[pm[i]][Math.min(4, (t * 4.5 + (c & 1)) | 0)]; w = (1 - t) * 0.45;
          break;
        }
        case K_SPARK: {
          const pal = PALS[pm[i]], idx = Math.min(2, (t * 3.2) | 0);
          col = pal[idx]; w = 0.8 * (1 - t * 0.6);
          u[o] = col;
          const tx = Math.round(px[i] - pvx[i] * 0.035) - camX, ty = Math.round(py[i] - pz[i] + pvz[i] * 0.035) - camY;
          if (tx >= 0 && ty >= 0 && tx < VW && ty < VH && (tx !== x || ty !== yy)) u[ty * VW + tx] = pal[Math.min(4, idx + 2)];
          break;
        }
        case K_DROP: {
          col = PALS[PAL_FIRE][(c & 1) + (t > 0.6 ? 1 : 0)]; w = 0.55; u[o] = col;
          if (pg[i] > 11 && x + 1 < VW) u[o + 1] = col;
          break;
        }
        case K_GRAIN: col = pm[i] === ASH ? SH.ash[(c & 3) * 9 + 6] : DUSTSET[pm[i]][(c & 3) * 9 + 4]; if (pm[i] === ASH) w = 0.12, col = PALS[PAL_FIRE][2 + (c & 1)]; else if (pm[i] === GLASS) w = 0.2; break;
        case K_ROCK: {
          const sz = pg[i], cy = PALS[pm[i]];
          col = SH.stone[(c & 3) * 9 + 5]; w = 0.8; u[o] = col;
          if (x + 1 < VW) u[o + 1] = SH.stone[(c & 3) * 9 + 7];
          if (sz > 1 && yy + 1 < VH) { u[o + VW] = cy[3]; if (x + 1 < VW) u[o + VW + 1] = SH.stone[(c & 3) * 9 + 3]; }
          if (yy > 0) u[o - VW] = cy[2];
          if (x > 0) u[o - 1] = cy[1];
          break;
        }
        case K_PULL: col = DUSTSET[pm[i]][(c & 3) * 9 + 5]; w = 0.1; if (t > 0.7) col = WHITE; break;
        case K_SHARD: col = PALS[PAL_ICE][c & 1]; w = 0.35; u[o] = col; if (yy + 1 < VH) u[o + VW] = PALS[PAL_ICE][2]; break;
        case K_MIST: {
          if (B4[(((yy + camY) & 3) << 2) | ((x + camX) & 3)] > Math.sin(t * Math.PI) * 0.5) continue;
          col = MISTC[pm[i]][c % 3]; w = pm[i] ? 0.05 : 0;
          break;
        }
        case K_MOTE: {
          const tw = (c + (a * 14) | 0) & 3;
          if (tw === 0 && t > 0.15) continue;
          col = PALS[pm[i]][Math.min(4, (t * 4 + (tw === 1 ? 0 : 1)) | 0)]; w = (1 - t) * 0.5;
          break;
        }
        case K_ARC: {
          const core = pg[i];
          col = t < 0.4 ? WHITE : PALS[pm[i]][1];
          w = (1 - t) * 0.9;
          if (core) {
            if (x > 0 && B4[(((yy + camY) & 3) << 2) | ((x - 1 + camX) & 3)] > t) u[o - 1] = PALS[pm[i]][2];
            if (x + 1 < VW && B4[(((yy + camY) & 3) << 2) | ((x + 1 + camX) & 3)] > t) u[o + 1] = PALS[pm[i]][2];
          }
          break;
        }
        case K_VORT: {
          col = DUSTSET[pm[i]][(c & 3) * 9 + 5 + (t < 0.5 ? 0 : -2)];
          break;
        }
        default: break;
      }
      u[o] = col; any = true;
      if (yy < lo) lo = yy; if (yy > hi) hi = yy;
      if (w > 0.01) glowAdd(x, yy, col, w);
    }
    aHad = any;
    if (!any) { aLayer.uLo = VH; aLayer.uHi = -1; return; }
    layerBlit(aLayer, R, lo - 8, hi + 8);
  }

  // feed emissive accumulation into lightmap + bloom canvas. Fog-gated for the bloom (light.compose handles fog for the lightmap).
  const LK = 0.105, GK = 0.12;
  function lights(R) {
    if (!emAny) return;
    const lb = R.lightmap.buf, fog = R.fog, fogOn = R.w.fog !== false;
    const gu = glowU; gu.fill(0xff000000);
    let g = false;
    for (let y = 0; y < LHn; y++) for (let x = 0; x < LWn; x++) {
      const k = y * LWn + x, r = er[k], gg = eg[k], b = eb[k];
      if (r + gg + b < 0.04) continue;
      // light, 3x3 spread
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= LHn) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= LWn) continue;
          const f = LK * (dx === 0 && dy === 0 ? 1 : dx === 0 || dy === 0 ? 0.5 : 0.25), j = yy * LWn + xx;
          lb.lr[j] += r * f; lb.lg[j] += gg * f; lb.lb[j] += b * f;
        }
      }
      let gf = 1;
      if (fogOn) gf = clamp(fog.sample(camX + x * 4 + 2, camY + y * 4 + 2) - 1.3, 0, 0.7) / 0.7;
      if (gf <= 0) continue;
      gu[k] = A(ch(r * GK * 255 * gf), ch(gg * GK * 255 * gf), ch(b * GK * 255 * gf)); g = true;
    }
    er.fill(0); eg.fill(0); eb.fill(0); emAny = false;
    if (!g) return;
    glowC.putImageData(glowImg, 0, 0);
    R.gx.globalAlpha = 1;
    R.gx.drawImage(glowCv, 0, 0, VW, VH);
  }

  // ---------------------------------------------------------------- camera shift
  function begin(R) {
    const cx = R.camX | 0, cy = R.camY | 0;
    const mx = (GW - VW) >> 1, my = (GH - VH) >> 1;
    if (!hasCam) { hasCam = true; camX = cx; camY = cy; }
    const dx = cx - camX, dy = cy - camY;
    const nox = cx - mx, noy = cy - my;
    if (Math.abs(dx) >= GW - 32 || Math.abs(dy) >= GH - 32) clearAll();
    else {
      if (dx > 0) clearCols(OX + GW, dx); else if (dx < 0) clearCols(nox, -dx);
      if (dy > 0) clearRows(OY + GH, dy); else if (dy < 0) clearRows(noy, -dy);
    }
    camX = cx; camY = cy; OX = nox; OY = noy;
  }
  function clearCols(w0, n) {
    for (let k = 0; k < n; k++) { const c = (w0 + k) & GM; for (let y = 0; y < GH; y++) { const i = (y << 10) | c; mat[i] = 0; hgt[i] = 0; } }
  }
  function clearRows(w0, n) {
    for (let k = 0; k < n; k++) { const r = ((w0 + k) & HM) << 10; mat.fill(0, r, r + GW); hgt.fill(0, r, r + GW); }
  }
  function clearAll() { mat.fill(0); hgt.fill(0); cnt.fill(0); }

  // ---------------------------------------------------------------- spawning helpers (world units in, px out)
  const wp = v => v / P;
  function lit(x, y) { const f = R_.fog; return !f || R_.w.fog === false || f.levelAt(x, y) > 1.4; }
  const DSC = [0, 0];   // scratch result: copy before the next disc() call
  function disc(x, y, r) { const a = rnd() * TAU, d = r * Math.sqrt(rnd()); DSC[0] = x + Math.cos(a) * d; DSC[1] = y + Math.sin(a) * d * 0.85; return DSC; }

  function flames(x, y, n, rad, up, lf, jet) {
    for (let k = 0; k < n; k++) { const p = disc(x, y, rad); fly(K_FIRE, p[0], p[1], rr(0, 4), rr(-6, 6), rr(-3, 3), rr(up * 0.5, up), rr(lf * 0.6, lf), 0, jet ? 1 : 0); }
  }
  function embers(x, y, n, rad, spd, up, pal, z) {
    for (let k = 0; k < n; k++) { const p = disc(x, y, rad), a = rnd() * TAU, s = rr(0.2, 1) * spd; fly(K_EMBER, p[0], p[1], z || 0, Math.cos(a) * s, Math.sin(a) * s * 0.7, rr(up * 0.4, up), rr(1.2, 3), vv(pal || 0), 0); }
  }
  function sparks(x, y, n, spd, up, pal, z) {
    for (let k = 0; k < n; k++) { const a = rnd() * TAU, s = rr(0.2, 1) * spd; fly(K_SPARK, x, y, z || 0, Math.cos(a) * s, Math.sin(a) * s * 0.7, rr(up * 0.4, up), rr(0.4, 1), vv(pal), 0); }
  }
  function smoke(x, y, n, rad, up) {
    for (let k = 0; k < n; k++) { const p = disc(x, y, rad); fly(K_SMOKE, p[0], p[1], rr(0, 8), rr(-8, 8), rr(-4, 4), rr(up * 0.5, up), rr(1, 2.2), 0, 0); }
  }
  function motes(x, y, n, rad, up, pal, z, lf) {
    for (let k = 0; k < n; k++) { const p = disc(x, y, rad); fly(K_MOTE, p[0], p[1], (z || 0) + rr(0, 10), rr(-10, 10), rr(-6, 6), rr(up * 0.4, up), rr(0.6, 1) * (lf || 1.2), vv(pal), 0); }
  }
  function mist(x, y, n, rad, kind, z, up) {
    for (let k = 0; k < n; k++) { const p = disc(x, y, rad); fly(K_MIST, p[0], p[1], rr(0, 4) + (z || 0), rr(-8, 8), rr(-5, 5), rr(up == null ? 4 : up * 0.3, up == null ? 14 : up), rr(1.2, 2.6), kind || 0, 0); }
  }
  // magma fountain: drops land within `rad` px of centre
  function lavaBurst(x, y, n, rad, hMax) {
    for (let k = 0; k < n; k++) {
      const vz = rr(60, 150), T = 2 * vz / 150, a = rnd() * TAU, d = rad * Math.sqrt(rnd());
      fly(K_DROP, x, y, rr(0, 3), Math.cos(a) * d / T, Math.sin(a) * d * 0.85 / T, vz, T + 0.5, 0, 6 + ri(hMax || 10));
    }
  }
  function grains(x, y, n, rad, up, m, h, z, spd) {
    for (let k = 0; k < n; k++) { const p = disc(x, y, rad), a = rnd() * TAU, s = rr(0.2, 1) * (spd || 20); fly(K_GRAIN, p[0], p[1], z || 0, Math.cos(a) * s, Math.sin(a) * s * 0.7, rr(up * 0.3, up), 4, m, h || 3); }
  }

  // jagged lightning (pixel path); arcs appear along the path over `dur`
  function bolt(x0, y0, x1, y1, delay, dur, pal, depth) {
    let pts = [[x0, y0], [x1, y1]];
    for (let lv = 0; lv < 3; lv++) {
      const n = [pts[0]];
      for (let j = 1; j < pts.length; j++) {
        const a = pts[j - 1], b = pts[j], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), o = (rnd() - 0.5) * l * 0.5;
        n.push([(a[0] + b[0]) / 2 - dy / (l || 1) * o, (a[1] + b[1]) / 2 + dx / (l || 1) * o], b);
      }
      pts = n;
    }
    let acc = 0; const total = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
    for (let j = 1; j < pts.length; j++) {
      const a = pts[j - 1], b = pts[j], l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(l));
      for (let s = 0; s < n; s++) {
        const f = s / n, d = (acc + l * f) / total;
        const i = fly(K_ARC, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 0, 0, 0, 0, rr(0.1, 0.26), pal, depth ? 0 : 1);
        page[i] = -(delay + d * dur);
        if (depth < 2 && rnd() < 0.045 * (depth ? 0.5 : 1) && total > 12) {
          const ba = Math.atan2(y1 - y0, x1 - x0) + rr(-0.9, 0.9), bl = total * rr(0.25, 0.5);
          bolt(px[i], py[i], px[i] + Math.cos(ba) * bl, py[i] + Math.sin(ba) * bl, delay + d * dur, dur * 0.4, pal, depth + 1);
        }
      }
      acc += l;
    }
  }
  // vertical strike from the sky
  function strike(x, y, delay, pal, h) {
    h = h || 150;
    let jx = 0;
    for (let z = 0; z < h; z++) {
      jx += rr(-0.9, 0.9); jx *= 0.96;
      const i = fly(K_ARC, x + jx, y, z, 0, 0, 0, rr(0.08, 0.2), pal, 1);
      page[i] = -(delay + (h - z) * 0.0006);
    }
    const i = fly(K_ARC, x, y, 0, 0, 0, 0, 0.3, pal, 1); page[i] = -delay;
  }

  // ---- Meteor Hammer: cyan-flamed rock fragments + channel circle emitters
  function rockLand(x, y, pal, sz) {
    sparks(x, y, 16, 100, 130, pal, 1); sparks(x, y, 5, 70, 90, PAL_WHITE, 1);
    motes(x, y, 6, 4, 40, pal, 0, 0.9);
    grains(x, y, 14, 3, 70, DUSTC, 2, 2, 50);
    for (let k = 0; k < 7; k++) fly(K_FIRE, x + rr(-3, 3), y + rr(-2, 2), rr(0, 3), rr(-8, 8), rr(-5, 5), rr(30, 90), rr(0.25, 0.55), pal, 0);
    for (let k = 0; k < 3; k++) dep(x + rr(-3, 3), y + rr(-2, 2), EMBER, 1, 70 + ri(60), pal);
    if (sz > 1) smoke(x, y, 3, 3, 30);
  }
  function rocks(x, y, r, delay) {
    const n = 8 + ri(3);
    for (let k = 0; k < n; k++) {
      const a = rnd() * TAU, d = r * 0.92 * Math.sqrt(rnd()), tx = x + Math.cos(a) * d, ty = y + Math.sin(a) * d * 0.85;
      const T = Math.min(rr(0.42, 0.62), delay * 0.85), land = delay * rr(0.6, 1), i = fly(K_ROCK, tx, ty, 0, rr(26, 52), rr(-12, -3), 150, T, PAL_CYAN, 1 + ri(2));
      pox[i] = tx; poy[i] = ty; page[i] = -Math.max(0, land - T);
    }
  }
  const chans = [];   // active hammer channels { wx, wy, x, y, r, until }

  // ---------------------------------------------------------------- events from fx.js
  const timers = [];   // { t, fn }
  const later = (d, fn) => timers.push({ t: clock + d, fn });
  const walls = [];

  function extendChan(p, d) { let hit = false; for (const c of chans) if (Math.hypot(c.wx - p.x, c.wy - p.y) < 30) { c.until = clock + d; hit = true; } if (!hit) chans.push({ wx: p.x, wy: p.y, x: wp(p.x), y: wp(p.y), r: wp(p.r || 400), until: clock + d }); }
  function swirl(x, y, pal, rad, h, steps, dur) {
    for (let k = 0; k < steps; k++) later(k * dur / steps, () => {
      for (let s = 0; s < 3; s++) { const a = k * 0.55 + s * 2.094, d = rad * (1 - 0.5 * k / steps); fly(K_MOTE, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, k * h / steps, -Math.sin(a) * 16, Math.cos(a) * 10, rr(25, 50), rr(0.5, 0.9), vv(pal), 0); }
    });
  }
  function dropChan(p) { for (let k = chans.length - 1; k >= 0; k--) if (Math.hypot(chans[k].wx - p.x, chans[k].wy - p.y) < 30) chans.splice(k, 1); }
  function event(p) {
    if (!R_ || p.x == null || !lit(p.x, p.y)) return;
    const x = wp(p.x), y = wp(p.y);
    switch (p.name) {
      case 'sunstrikeHit': {
        const r = wp(p.r || 175);
        flames(x, y, 190, r * 0.55, 240, 1.0, true);
        embers(x, y, 170, r * 0.5, 55, 190, PAL_FIRE, 0);
        sparks(x, y, 60, 90, 170, PAL_FIRE, 2);
        smoke(x, y, 50, r * 0.6, 60);
        // gold glass cinders (rest on the ground, glint), then scorched ash
        for (let k = 0; k < 70; k++) { const q = disc(x, y, r * 0.95); dep(q[0], q[1], GLASS, 2 + ri(3), 0, 0); }
        grains(x, y, 46, r * 0.5, 120, GLASS, 3, 4, 60);
        sparks(x, y, 36, 110, 160, PAL_GOLD, 2);
        // scorched pile with glowing embers: rim pushed outward
        for (let dy = -r - 3; dy <= r + 3; dy++) for (let dx = -r - 3; dx <= r + 3; dx++) {
          const d = Math.hypot(dx, dy) / r;
          if (d > 1.12 || rnd() > (d < 0.85 ? 0.6 : 0.85 - (d - 0.85) * 2.5)) continue;
          const rim = Math.max(0, 1 - Math.abs(d - 0.92) / 0.22);
          dep(x + dx, y + dy, ASH, 2 + (rim * 7 + rnd() * 2) | 0, 150 + ri(100), 0);
          if (rnd() < 0.05) dep(x + dx, y + dy, EMBER, 1, 120 + ri(135), 0);
        }
        // second wave
        later(0.12, () => { flames(x, y, 120, r * 0.5, 220, 0.9, true); embers(x, y, 80, r * 0.5, 40, 150, PAL_FIRE); });
        later(0.28, () => { flames(x, y, 70, r * 0.4, 160, 0.8, true); embers(x, y, 50, r * 0.6, 30, 120, PAL_GOLD); });
        break;
      }
      case 'meteorFall': if (p.ability === 'meteorhammer') rocks(x, y, wp(p.r || 400), p.delay || 1.2); extendChan(p, (p.delay || 1.2) + 0.1); break;
      case 'meteorCancel': dropChan(p); motes(x, y, 24, wp(p.r || 400) * 0.5, 30, PAL_CYAN, 0, 0.8); break;
      case 'meteorChannel': chans.push({ wx: p.x, wy: p.y, x, y, r: wp(p.r || 400), until: clock + (p.dur || 2.5) + 0.2 }); if (chans.length > 4) chans.shift(); break;
      case 'meteorImpact': {   // hammer: cyan burst
        const r = wp(p.r || 400); dropChan(p);
        sparks(x, y, 90, 130, 170, PAL_CYAN, 2); sparks(x, y, 30, 90, 130, PAL_WHITE, 2);
        motes(x, y, 40, r * 0.7, 80, PAL_CYAN, 0, 1.2);
        grains(x, y, 120, r * 0.7, 90, DUSTC, 3, 3, 70);
        for (let k = 0; k < 40; k++) { const q = disc(x, y, r * 0.7); fly(K_FIRE, q[0], q[1], rr(0, 4), rr(-6, 6), rr(-4, 4), rr(40, 120), rr(0.3, 0.7), PAL_CYAN, 0); }
        for (let k = 0; k < 14; k++) { const q = disc(x, y, r * 0.8); dep(q[0], q[1], EMBER, 1, 90 + ri(100), PAL_CYAN); }
        smoke(x, y, 16, r * 0.5, 40);
        break;
      }
      case 'meteorLand': {
        const r = wp(p.r || 175);
        lavaBurst(x, y, Math.round(r * 11), r * 0.95, 12);
        flames(x, y, 110, r * 0.6, 180, 0.9, true);
        sparks(x, y, 70, 110, 170, PAL_FIRE, 2);
        embers(x, y, 70, r * 0.6, 50, 140, PAL_FIRE);
        smoke(x, y, 40, r * 0.6, 55);
        discDep(x, y, r * 0.3, MAGMA, 20, 255, 1);
        break;
      }
      case 'meteorEnd': {
        const r = wp(p.r || 175);
        lavaBurst(x, y, 40, r * 0.4, 10); flames(x, y, 40, r * 0.3, 120, 0.7); sparks(x, y, 20, 70, 110, PAL_FIRE, 2); smoke(x, y, 16, r * 0.3, 40);
        break;
      }
      case 'empBlast': {
        const r = wp(p.r || 675);
        for (let k = 0; k < 11; k++) {
          const a = k / 11 * TAU + rr(-0.2, 0.2), d = r * rr(0.45, 0.95);
          bolt(x, y, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, rr(0, 0.05), 0.2, PAL_PURPLE, 0);
        }
        for (let k = 0; k < 12; k++) {
          const q2 = disc(x, y, r * 0.8), p2x = q2[0], p2y = q2[1];
          strike(p2x, p2y, rr(0.02, 0.45), k & 1 ? PAL_WHITE : PAL_PURPLE, 150);
          later(0.05, () => { sparks(p2x, p2y, 8, 90, 90, PAL_PURPLE); if (rnd() < 0.5) dep(p2x, p2y, EMBER, 1, 150, 1); });
        }
        for (let i = 0; i < FC; i++) if (pk[i] === K_PULL) {   // whatever was being drawn in pops outward
          const a = rnd() * TAU, s = rr(40, 140);
          pk[i] = K_GRAIN; page[i] = 0; plife[i] = 3; pg[i] = 3; pz[i] = rr(2, 8);
          pvx[i] = Math.cos(a) * s; pvy[i] = Math.sin(a) * s * 0.7; pvz[i] = rr(40, 120);
        }
        sparks(x, y, 130, r * 1.2, 120, PAL_PURPLE, 3);
        sparks(x, y, 50, r * 0.9, 100, PAL_WHITE, 3);
        motes(x, y, 90, r * 0.8, 70, PAL_PURPLE, 0, 1.6);
        grains(x, y, 160, r * 0.9, 80, DUSTP, 4, 6, 40);
        break;
      }
      case 'coldsnapFreeze': {
        for (let k = 0; k < 14; k++) {
          const a = rnd() * TAU, d = rr(5, 18), vz = rr(60, 110), T = 2 * vz / 200;
          fly(K_SHARD, x, y, rr(0, 6), Math.cos(a) * d / T, Math.sin(a) * d * 0.8 / T, vz, T + 0.4, 0, 0);
        }
        for (let k = 0; k < 7; k++) { const q = disc(x, y, 6); dep(q[0], q[1], FROST, 6, 5 + ri(4), 0); }
        mist(x, y, 18, 8, 1, 0, 24);
        motes(x, y, 16, 10, 40, PAL_ICE, 0, 1.2);
        grains(x, y, 34, 8, 50, DUSTC, 3, 26, 14);
        sparks(x, y, 14, 60, 90, PAL_ICE, 2);
        break;
      }
      case 'iceWall': {
        const ax = wp(p.ax), ay = wp(p.ay), bx = wp(p.bx), by = wp(p.by);
        walls.push({ x: p.x, y: p.y, ax, ay, bx, by, r: wp(p.r || 100) }); if (walls.length > 6) walls.shift();
        for (let k = 0; k < 36; k++) {
          const f = rnd(), sx = ax + (bx - ax) * f, sy = ay + (by - ay) * f, vz = rr(40, 90), T = 2 * vz / 200;
          fly(K_SHARD, sx, sy, 0, rr(-6, 6), rr(-6, 6), vz, T + 0.4, 0, 0);
          if (k < 22) dep(sx + rr(-3, 3), sy + rr(-3, 3), FROST, 5, 4 + ri(4), 0);
        }
        break;
      }
      case 'iceWallEnd': {
        let w = null, bd = 1e9;
        for (const q of walls) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; w = q; } }
        if (!w) w = { ax: x - 20, ay: y, bx: x + 20, by: y, r: 6 };
        for (let k = 0; k < 150; k++) {
          const f = rnd(), sx = w.ax + (w.bx - w.ax) * f, sy = w.ay + (w.by - w.ay) * f;
          if (k < 90) fly(K_GRAIN, sx, sy, rr(0, 10), rr(-25, 25), rr(-15, 15), rr(20, 90), 3, DUSTC, 3);
          else fly(K_SHARD, sx, sy, rr(2, 12), rr(-30, 30), rr(-20, 20), rr(30, 90), 1.4, 0, 0);
        }
        for (let k = 0; k < 40; k++) { const f = rnd(); fly(K_MIST, w.ax + (w.bx - w.ax) * f, w.ay + (w.by - w.ay) * f, 2, rr(-10, 10), rr(-8, 8), rr(6, 16), rr(1, 2), 1, 0); }
        break;
      }
      case 'tornadoLift': case 'tornadoLand': grains(x, y, 34, 5, 90, DUSTW, 3, 0, 40); break;
      case 'deafeningHit': grains(x, y, 30, 5, 100, DUSTC, 3, 6, 40); sparks(x, y, 10, 70, 100, PAL_ICE, 6); break;
      case 'alacrity': {
        for (let k = 0; k < 70; k++) {
          const a = rnd() * TAU, d = rr(2, 9);
          fly(K_MOTE, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, rr(0, 6), Math.cos(a + 1.6) * 20, Math.sin(a + 1.6) * 12, rr(30, 90), rr(0.7, 1.4), k & 1 ? PAL_PURPLE : PAL_GOLD, 0);
        }
        sparks(x, y, 16, 50, 70, PAL_GOLD, 6);
        grains(x, y, 24, 3, 20, DUSTG, 2, 0, 40);
        break;
      }
      case 'respawn': motes(x, y, 50, 8, 80, PAL_PURPLE, 0, 1.4); sparks(x, y, 14, 60, 90, PAL_PURPLE, 4); break;
      case 'refresh': swirl(x, y, PAL_GREEN, 12, 40, 14, 0.7); motes(x, y, 30, 8, 110, PAL_GREEN, 0, 1.3); sparks(x, y, 14, 60, 100, PAL_GREEN, 4); break;
      case 'bkb': motes(x, y, 40, 12, 70, PAL_GOLD, 0, 1.3); sparks(x, y, 14, 70, 90, PAL_GOLD, 6); break;
      case 'boltHit': sparks(x, y, 28, 90, 110, PAL_PURPLE, 4); for (let k = 0; k < 4; k++) { const a = rnd() * TAU; bolt(x, y - 4, x + Math.cos(a) * 14, y - 4 + Math.sin(a) * 9, 0, 0.08, PAL_PURPLE, 1); } break;
      case 'boltBlocked': sparks(x, y, 22, 80, 90, PAL_GOLD, 4); break;
      case 'boltDodged': sparks(x, y, 6, 40, 50, PAL_WHITE, 4); break;
      case 'dodge': grains(x, y, 12, 3, 40, DUSTW, 2, 0, 30); break;
      case 'atosHit': sparks(x, y, 18, 60, 80, PAL_PURPLE, 6); motes(x, y, 16, 6, 40, PAL_PURPLE, 4); grains(x, y, 14, 4, 50, DUSTP, 3, 3, 30); break;
      case 'hexHit': motes(x, y, 40, 10, 70, PAL_GREEN, 2, 1); sparks(x, y, 18, 70, 80, PAL_GREEN, 6); smoke(x, y, 10, 6, 40); break;
      case 'gleipnirLaunch': {
        const r = wp(p.r || 300);
        for (let k = 0; k < 36; k++) { const a = k / 36 * TAU; fly(K_SPARK, x + Math.cos(a) * r, y + Math.sin(a) * r, 0, 0, 0, rr(30, 70), rr(0.3, 0.7), PAL_GOLD, 0); }
        motes(x, y, 14, r * 0.5, 40, PAL_GOLD, 0, 1);
        break;
      }
      case 'gleipnirHit': sparks(x, y, 26, 80, 100, PAL_GOLD, 6); motes(x, y, 16, 6, 60, PAL_GOLD, 0, 1); grains(x, y, 20, 5, 60, DUSTG, 3, 4, 40); break;
      case 'orchidHit': motes(x, y, 26, 6, 90, PAL_PURPLE, 0, 1.3); sparks(x, y, 14, 50, 90, PAL_PURPLE, 6); break;
      case 'orchidBurst':
        sparks(x, y, 44, 110, 130, PAL_PURPLE, 6); motes(x, y, 40, 10, 100, PAL_PURPLE, 0, 1.2); grains(x, y, 24, 6, 70, DUSTP, 3, 4, 50);
        for (let k = 0; k < 5; k++) { const a = rnd() * TAU; bolt(x, y - 6, x + Math.cos(a) * 18, y - 6 + Math.sin(a) * 11, 0, 0.1, PAL_PURPLE, 1); }
        break;
      case 'meltingStrike': lavaBurst(x, y, 10, 6, 6); sparks(x, y, 10, 60, 90, PAL_FIRE, 4); break;
      case 'forgeSpirit': {
        const n = p.count || 1;
        lavaBurst(x, y, 24 * n, 8, 9); flames(x, y, 30 * n, 5, 90, 0.7); embers(x, y, 18 * n, 6, 30, 90, PAL_FIRE);
        discDep(x, y, 4, MAGMA, 8, 250, 0.8);
        break;
      }
      case 'spiritExpire': lavaBurst(x, y, 24, 7, 8); flames(x, y, 26, 4, 90, 0.7); smoke(x, y, 12, 4, 30); break;
      case 'ghostWalk': mist(x, y, 70, wp(p.r || 300) * 0.35, 0, 0, 14); motes(x, y, 20, 10, 40, PAL_WHITE, 4); break;
      case 'ghostBreak': mist(x, y, 50, 10, 0, 6, 22); motes(x, y, 20, 8, 50, PAL_WHITE, 6); break;
      case 'shivaBlast': {
        mist(x, y, 40, 6, 1, 0, 18); grains(x, y, 60, 6, 60, DUSTC, 3, 8, 30);
        const r = wp(p.r || 900), T = Math.min(1.2, (p.r || 900) / (p.speed || 600));   // expanding frost ring tracks the sim wave
        for (let k = 1; k <= 8; k++) later(T * k / 8, () => { const rad = r * k / 8, n = Math.min(40, 8 + (rad | 0)); for (let j = 0; j < n; j++) { const a = j / n * TAU + rnd() * 0.2; fly(K_SPARK, x + Math.cos(a) * rad, y + Math.sin(a) * rad, 0, 0, 0, rr(20, 55), rr(0.3, 0.6), PAL_ICE, 0); } });
        break;
      }
      default: break;
    }
  }
  function blink(p) {
    if (!R_) return;
    for (const q of [[p.fromX, p.fromY], [p.x, p.y]]) {
      if (!lit(q[0], q[1])) continue;
      const x = wp(q[0]), y = wp(q[1]);
      motes(x, y, 40, 8, 90, PAL_PURPLE, 0, 1.2); sparks(x, y, 20, 90, 110, PAL_PURPLE, 6);
      motes(x, y, 20, 8, 90, PAL_CYAN, 0, 1.2); sparks(x, y, 12, 90, 110, PAL_CYAN, 6);
      for (let k = 0; k < 3; k++) { const a = rnd() * TAU; bolt(x, y - 8, x + Math.cos(a) * 16, y - 8 + Math.sin(a) * 10, 0, 0.1, PAL_PURPLE, 1); }
    }
  }

  // ---------------------------------------------------------------- continuous emitters (thinkers, units, statuses)
  const accm = new Map();
  function rate(key, r, dt) { const a = (accm.get(key) || 0) + r * dt, n = a | 0; accm.set(key, a - n); return n; }
  const S_ = (e, t) => { for (const s of e.statuses) if (s.type === t) return s; return null; };

  function thinkers(R, dt) {
    const w = R.w;
    if (accm.size > 600) accm.clear();
    for (const e of w.ents) {
      if (e.dead) continue;
      const kind = e.kind, id = e.id * 8;
      if (kind === 'thinker' || kind === 'proj') {
        if (e.team === 1 && !lit(e.x, e.y)) continue;
        const key = e.fx || e.ability, x = wp(e.x), y = wp(e.y);
        switch (key) {
          case 'chaosmeteor':
            if (!e.landed) {
              const rem = e.danger ? Math.max(0, e.danger.at - R.simT) : 0, hh = rem * 150, mx = x + hh * 0.35;
              for (let n = rate(id, 240, dt); n-- > 0;) fly(K_FIRE, mx + rr(-4, 4), y + rr(-1, 1), hh + rr(-4, 4), rr(-8, 8), 0, rr(5, 30), rr(0.35, 0.7), 0, 0);
              for (let n = rate(id + 1, 40, dt); n-- > 0;) fly(K_SMOKE, mx + 6, y, hh + 8, rr(-6, 6), 0, rr(6, 14), rr(1, 1.8), 0, 0);
              for (let n = rate(id + 2, 30, dt); n-- > 0;) fly(K_EMBER, mx, y, hh, rr(10, 30), rr(-6, 6), rr(-10, 20), rr(1, 2), 0, 0);
            } else if (!e.done) {
              const r = wp(e.r || 175);
              discDep(x, y, 3.3, MAGMA, 4, 250, 0.75);
              for (let n = rate(id, 140, dt); n-- > 0;) { const p = disc(x, y, r * 0.25); fly(K_FIRE, p[0], p[1], rr(2, 8), rr(-6, 6), rr(-4, 4), rr(25, 70), rr(0.4, 0.8), 0, 0); }
              for (let n = rate(id + 1, 40, dt); n-- > 0;) { const p = disc(x, y, r * 0.3), vz = rr(60, 130), T = 2 * vz / 150, a = rnd() * TAU, d = rr(4, 16); fly(K_DROP, p[0], p[1], 3, Math.cos(a) * d / T, Math.sin(a) * d * 0.8 / T, vz, T + 0.5, 0, 6 + ri(6)); }
              for (let n = rate(id + 2, 50, dt); n-- > 0;) embers(x, y, 1, r * 0.3, 20, 100, PAL_FIRE, 4);
              for (let n = rate(id + 3, 24, dt); n-- > 0;) sparks(x, y, 1, 70, 100, PAL_FIRE, 4);
              for (let n = rate(id + 4, 22, dt); n-- > 0;) smoke(x, y, 1, r * 0.3, 35);
            }
            break;
          case 'attack':   // fireball tail: short flickering embers
            for (let n = rate(id, 55, dt); n-- > 0;) fly(K_EMBER, x + rr(-1, 1), y + rr(-1, 1), 9 + rr(-1.5, 1.5), rr(-6, 6), rr(-4, 4), rr(5, 30), rr(0.25, 0.6), PAL_FIRE, 0);
            for (let n = rate(id + 1, 25, dt); n-- > 0;) fly(K_FIRE, x, y, 9 + rr(-1, 1), rr(-5, 5), rr(-3, 3), rr(0, 15), rr(0.12, 0.3), 0, 0);
            break;
          case 'meteorhammer': {
            const rem = e.danger ? Math.max(0, e.danger.at - R.simT) : 0, r = wp(e.r || 400);
            if (rem > 0) for (let n = rate(id, 30, dt); n-- > 0;) { const q = disc(x, y, r); fly(K_MOTE, q[0], q[1], rr(0, 4), 0, 0, rr(10, 40), rr(0.5, 1), PAL_CYAN, 0); }
            break;
          }
          case 'sunstrike': {
            const rem = e.danger ? Math.max(0, e.danger.at - R.simT) : 0, f = clamp(1 - rem / Math.max(0.1, e.age + rem), 0, 1), r = wp(e.r || 175);
            for (let n = rate(id, 20 + 160 * f * f, dt); n-- > 0;) {
              const a = rnd() * TAU, d = r * rr(0.7, 1);
              fly(K_FIRE, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.85, 0, -Math.cos(a) * 6, -Math.sin(a) * 5, rr(15, 50) * (1 + f), rr(0.3, 0.7), 0, 0);
            }
            if (f > 0.55) for (let n = rate(id + 1, 60 * f, dt); n-- > 0;) { const p = disc(x, y, r * 0.5); fly(K_FIRE, p[0], p[1], 0, 0, 0, rr(60, 160), rr(0.3, 0.6), 0, 1); }
            break;
          }
          case 'emp': {
            const rem = e.danger ? Math.max(0, e.danger.at - R.simT) : 1, f = clamp(1 - rem / Math.max(0.1, e.age + rem), 0, 1), r = wp(e.r || 675);
            for (let n = rate(id, 6 + 14 * f, dt); n-- > 0;) { const a = rnd() * TAU, l = rr(6, 14 + 10 * f); bolt(x, y - 4, x + Math.cos(a) * l, y - 4 + Math.sin(a) * l * 0.7, 0, 0.06, PAL_PURPLE, 1); }
            for (let n = rate(id + 1, 16 + 40 * f, dt); n-- > 0;) {
              const a = rnd() * TAU, d = r * rr(0.3, 1), T = rr(0.5, 1.0);
              fly(K_MOTE, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, rr(0, 6), -Math.cos(a) * d / T, -Math.sin(a) * d * 0.8 / T, rr(0, 12), T, PAL_PURPLE, 0);
            }
            for (let n = rate(id + 2, 12, dt); n-- > 0;) sparks(x, y, 1, 60, 110, PAL_PURPLE, 4);
            for (let n = rate(id + 3, 50 + 150 * f, dt); n-- > 0;) {   // sand + mana dust converge on the centre; empBlast pops them back out
              const a = rnd() * TAU, d = r * rr(0.2, 0.95), sx = x + Math.cos(a) * d, sy = y + Math.sin(a) * d * 0.8;
              let m = lift(sx, sy); if (!m) { if (rnd() > 0.3) continue; m = DUSTP; }
              const i = fly(K_PULL, sx, sy, 0, sx, sy, 0, rr(0.55, 0.95), m, 0);
              pox[i] = x; poy[i] = y - 3;
            }
            break;
          }
          case 'tornado': {
            const r = Math.max(4, Math.min(22, wp(e.r || 100) * 0.4));
            for (let n = rate(id, 170, dt); n-- > 0;) {
              const i = fly(K_VORT, 0, 0, rr(0, 4), rr(2, r), rr(-9, -4) * (rnd() < 0.15 ? -1 : 1), rr(34, 56), rr(0.5, 0.85), rnd() < 0.7 ? DUSTW : DUSTP, 0);
              pox[i] = x; poy[i] = y; px[i] = x; py[i] = y;
            }
            for (let n = rate(id + 1, 40, dt); n-- > 0;) { const p = disc(x, y, r * 3.2); fly(K_GRAIN, p[0], p[1], 0, rr(-10, 10), rr(-8, 8), rr(10, 40), 3, DUSTW, 2); }
            // suction: ground sand around the funnel is drawn in, spirals up and is flung out
            for (let n = rate(id + 3, 150, dt); n-- > 0;) {
              const a = rnd() * TAU, d = rr(r * 1.2, r * 4.2), m = lift(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7);
              if (!m) continue;
              const i = fly(K_VORT, x, y, rr(0, 3), d, rr(-9, -5), rr(34, 56), rr(0.6, 1), m, 1);
              pox[i] = x; poy[i] = y; pc[i] = ((a / TAU * 256) | 0) & 255;
            }
            break;
          }
          case 'icewall': {
            if (e.ax == null) break;
            const ax = wp(e.ax), ay = wp(e.ay), bx = wp(e.bx), by = wp(e.by), r = wp(e.r || 100);
            const at = (f, j) => [ax + (bx - ax) * f + rr(-j, j), ay + (by - ay) * f + rr(-j, j)];
            for (let n = rate(id, 40, dt); n-- > 0;) { const q = at(rnd(), r * 0.7); fly(K_MIST, q[0], q[1], rr(0, 4), rr(-8, 8), rr(-5, 5), rr(2, 10), rr(1.2, 2.4), 1, 0); }
            for (let n = rate(id + 1, 14, dt); n-- > 0;) { const q = at(rnd(), 3); fly(K_MOTE, q[0], q[1], rr(2, 16), rr(-8, 8), rr(-4, 4), rr(6, 28), rr(0.6, 1.4), PAL_ICE, 0); }
            for (let n = rate(id + 2, 7, dt); n-- > 0;) { const q = at(rnd(), r * 1.2); dep(q[0], q[1], FROST, 5, 3 + ri(4), 0); }
            break;
          }
          case 'deafeningblast': {
            const front = wp(e.front || 0);
            if (front < 2) break;
            const half = clamp((wp(e.r || 100) + front * 0.15) / Math.max(front, 6), 0.15, 0.9);
            for (const a0 of e.dirs || [e.dir || 0]) {
              for (let n = rate(id, 640, dt); n-- > 0;) {
                const a = a0 + rr(-half, half), rad = Math.max(2, front - rr(0, 7)), gx = x + Math.cos(a) * rad, gy = y + Math.sin(a) * rad * 0.9;
                const m = [DUSTG, DUSTP, DUSTC][ri(3)];
                fly(K_GRAIN, gx, gy, rr(2, 8), Math.cos(a) * 25 + rr(-14, 14), Math.sin(a) * 18 + rr(-10, 10), rr(15, 80), 3, m, 3);
              }
              for (let n = rate(id + 3, 300, dt); n-- > 0;) {   // the cone shoves existing sand along with it
                const a = a0 + rr(-half, half), rad = Math.max(2, front - rr(0, 16)), gx = x + Math.cos(a) * rad, gy = y + Math.sin(a) * rad * 0.9, m = lift(gx, gy);
                if (m) fly(K_GRAIN, gx, gy, rr(1, 4), Math.cos(a) * rr(45, 100), Math.sin(a) * rr(30, 75), rr(25, 75), 3, m, 3);
              }
              for (let n = rate(id + 1, 110, dt); n-- > 0;) {
                const a = a0 + rr(-half, half), rad = Math.max(2, front - rr(0, 5));
                fly(K_MOTE, x + Math.cos(a) * rad, y + Math.sin(a) * rad * 0.9, rr(2, 10), Math.cos(a) * 16, Math.sin(a) * 12, rr(10, 50), rr(0.4, 1), [PAL_GOLD, PAL_PURPLE, PAL_ICE][ri(3)], 0);
              }
            }
            break;
          }
          case 'shiva': {
            const ring = wp(e.ring || 0);
            if (ring < 2) break;
            for (let n = rate(id, Math.min(500, ring * 8), dt); n-- > 0;) {
              const a = rnd() * TAU, gx = x + Math.cos(a) * ring, gy = y + Math.sin(a) * ring;
              fly(K_GRAIN, gx, gy, rr(0, 5), Math.cos(a) * 14, Math.sin(a) * 10, rr(10, 60), 3, DUSTC, 3);
              if (rnd() < 0.1) fly(K_MOTE, gx, gy, rr(0, 6), 0, 0, rr(8, 30), rr(0.5, 1), PAL_ICE, 0);
            }
            for (let n = rate(id + 1, 5, dt); n-- > 0;) { const a = rnd() * TAU; dep(x + Math.cos(a) * ring, y + Math.sin(a) * ring * 0.9, FROST, 5, 3 + ri(3), 0); }
            for (let n = rate(id + 2, 30, dt); n-- > 0;) { const a = rnd() * TAU; fly(K_MIST, x + Math.cos(a) * ring, y + Math.sin(a) * ring, 1, 0, 0, rr(4, 14), rr(1, 2), 1, 0); }
            break;
          }
          case 'ghostwalk': {
            const r = Math.min(wp(e.r || 300) * 0.5, 36);
            for (let n = rate(id, 38, dt); n-- > 0;) { const p = disc(x, y, r); fly(K_MIST, p[0], p[1], rr(0, 8), rr(-6, 6), rr(-4, 4), rr(3, 12), rr(1.4, 2.8), 0, 0); }
            for (let n = rate(id + 1, 5, dt); n-- > 0;) motes(x, y, 1, r, 30, PAL_WHITE, 2, 1.6);
            break;
          }
          default: break;
        }
      } else if (kind === 'spirit' || kind === 'hero' || kind === 'dummy' || kind === 'enemy') {
        const x = wp(e.x), y = wp(e.y);
        if (kind === 'spirit') {
          if (!lit(e.x, e.y)) continue;
          for (let n = rate(id, 6, dt); n-- > 0;) fly(K_DROP, x + rr(-3, 3), y, rr(8, 14), rr(-8, 8), rr(-5, 5), rr(0, 20), 0.8, 0, 3 + ri(4));
          for (let n = rate(id + 1, 14, dt); n-- > 0;) fly(K_FIRE, x + rr(-3, 3), y, rr(4, 16), rr(-4, 4), 0, rr(10, 40), rr(0.3, 0.6), 0, 0);
          for (let n = rate(id + 2, 6, dt); n-- > 0;) fly(K_EMBER, x, y, rr(6, 14), rr(-14, 14), rr(-8, 8), rr(10, 50), rr(1, 2), PAL_FIRE, 0);
          if (rnd() < 0.18) dep(x + rr(-2, 2), y + rr(-1, 1), MAGMA, 3, 240, 0);
        }
        if (!e.statuses.length || (e.team === 1 && !lit(e.x, e.y))) continue;
        let s;
        if ((s = S_(e, 'burn'))) {
          const bp = s.ability === 'meteorhammer' ? PAL_CYAN : PAL_FIRE, br = bp === PAL_CYAN ? 14 : 28;
          for (let n = rate(id + 3, br, dt); n-- > 0;) fly(K_FIRE, x + rr(-4, 4), y + rr(-1, 1), rr(2, 22), rr(-3, 3), 0, rr(15, 45), rr(0.3, 0.6), bp, 0);
          for (let n = rate(id + 4, 7, dt); n-- > 0;) fly(K_EMBER, x + rr(-4, 4), y, rr(8, 26), rr(-14, 14), rr(-8, 8), rr(10, 40), rr(0.8, 1.6), bp, 0);
        }
        if ((s = S_(e, 'alacrity'))) {
          for (let n = rate(id + 5, 16, dt); n-- > 0;) {
            const a = rnd() * TAU, d = rr(5, 10);
            fly(K_MOTE, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, rr(0, 22), Math.cos(a + 1.6) * 14, Math.sin(a + 1.6) * 9, rr(8, 40), rr(0.6, 1.2), rnd() < 0.55 ? PAL_PURPLE : PAL_GOLD, 0);
          }
        }
        if (S_(e, 'slow') || S_(e, 'frozen')) for (let n = rate(id + 6, 7, dt); n-- > 0;) fly(K_MOTE, x + rr(-5, 5), y, rr(2, 24), rr(-4, 4), 0, rr(-6, 10), rr(0.5, 1), PAL_ICE, 0);
        if (S_(e, 'ghost')) for (let n = rate(id + 7, 20, dt); n-- > 0;) fly(K_MIST, x + rr(-6, 6), y + rr(-2, 2), rr(0, 22), rr(-5, 5), 0, rr(2, 10), rr(1, 2), 0, 0);
        if ((s = S_(e, 'silence')) && s.ability === 'orchid') {    // soul burn: violet flames + wisps
          for (let n = rate(500000 + id, 16, dt); n-- > 0;) fly(K_FIRE, x + rr(-4, 4), y + rr(-1, 1), rr(4, 24), rr(-3, 3), 0, rr(20, 50), rr(0.4, 0.8), PAL_PURPLE, 0);
          for (let n = rate(500001 + id, 6, dt); n-- > 0;) fly(K_MOTE, x + rr(-5, 5), y, rr(8, 26), rr(-8, 8), rr(-5, 5), rr(15, 45), rr(0.8, 1.4), PAL_PURPLE, 0);
        }
        if ((s = S_(e, 'root')) && s.ability === 'gleipnir') for (let n = rate(500002 + id, 10, dt); n-- > 0;) { const a = rnd() * TAU; fly(K_SPARK, x + Math.cos(a) * 8, y + Math.sin(a) * 4, rr(0, 18), 0, 0, rr(10, 30), rr(0.3, 0.6), PAL_GOLD, 0); }
        if (S_(e, 'atosRoot')) for (let n = rate(500003 + id, 8, dt); n-- > 0;) { const a = rnd() * TAU; fly(K_MOTE, x + Math.cos(a) * 8, y + Math.sin(a) * 4, rr(0, 14), 0, 0, rr(6, 20), rr(0.5, 0.9), PAL_PURPLE, 0); }
        if (S_(e, 'magicImmune')) for (let n = rate(id + 6, 8, dt); n-- > 0;) { const a = rnd() * TAU; fly(K_MOTE, x + Math.cos(a) * 9, y + Math.sin(a) * 5, rr(0, 24), 0, 0, rr(6, 30), rr(0.5, 1), PAL_GOLD, 0); }
      }
    }
  }

  // ---------------------------------------------------------------- frame update
  function update(R, dt) {
    R_ = R; P = R.P;
    begin(R);
    dt = Math.min(0.05, dt); clock += dt;
    for (let i = timers.length - 1; i >= 0; i--) if (clock >= timers[i].t) { const f = timers[i].fn; timers.splice(i, 1); f(); }
    thinkers(R, dt);
    for (let k = chans.length - 1; k >= 0; k--) {
      const c = chans[k];
      if (clock > c.until) { chans.splice(k, 1); continue; }
      if (!lit(c.wx, c.wy)) continue;
      const id = 90000 + k * 8;
      for (let n = rate(id, 70, dt); n-- > 0;) { const a = rnd() * TAU; fly(K_MOTE, c.x + Math.cos(a) * c.r, c.y + Math.sin(a) * c.r, rr(0, 3), 0, 0, rr(14, 46), rr(0.5, 1), PAL_CYAN, 0); }
      for (let n = rate(id + 1, 14, dt); n-- > 0;) { const a = rnd() * TAU; fly(K_SPARK, c.x + Math.cos(a) * c.r, c.y + Math.sin(a) * c.r, 0, 0, 0, rr(30, 70), rr(0.3, 0.7), PAL_CYAN, 0); }
      for (let n = rate(id + 2, 18, dt); n-- > 0;) { const q = disc(c.x, c.y, c.r * 0.8); fly(K_MOTE, q[0], q[1], rr(0, 3), 0, 0, rr(6, 26), rr(0.5, 1.1), PAL_CYAN, 0); }
    }
    flyUpdate(dt);
    tickAcc += dt;
    let n = 0;
    const heavy = total > 9000;   // thin the CA out under heavy load (ageing is doubled in tick() to compensate)
    while (tickAcc >= 1 / 60 && n < 3) { if (!heavy || (tkp++ & 1) === 0) tick(); tickAcc -= 1 / 60; n++; }
    if (tickAcc > 0.05) tickAcc = 0;
  }

  function buffers() {   // view-sized layers + emissive grid; (re)built when the view size changes
    if (gLayer && gLayer.cv.width === VW && gLayer.cv.height === VH) return;
    gLayer = mk(VW, VH); aLayer = mk(VW, VH);
    LWn = Math.ceil(VW / 4); LHn = Math.ceil(VH / 4);
    er = new Float32Array(LWn * LHn); eg = new Float32Array(LWn * LHn); eb = new Float32Array(LWn * LHn);
    const g = mk(LWn, LHn); glowCv = g.cv; glowC = g.c; glowImg = g.img; glowU = g.u;
  }
  // zoom: keep the simulated cells, only rebuild the view-sized buffers
  function resize(R) { VW = R.VW; VH = R.VH; buffers(); emAny = false; }

  function clear() {   // drop all sand / flyers / timers (scenario swap, restart)
    layerReset(gLayer); layerReset(aLayer); chans.length = 0; clearAll(); stamp.fill(0); fhead = 0; flive = 0; pk.fill(0); timers.length = 0; accm.clear(); walls.length = 0; hasCam = false; total = 0; gHad = aHad = false;
  }
  function init(R) {
    R_ = R; VW = R.VW; VH = R.VH; P = R.P;
    buffers();
    clear();
  }

  IT.Sand = {
    init, clear, resize, update, drawGround, drawAir, lights, event, blink, fly, dep, discDep, bolt, strike,
    get count() { return total + flive; }, get cells() { return total; }, get flyers() { return flive; },
    KIND: { FIRE: K_FIRE, SMOKE: K_SMOKE, EMBER: K_EMBER, SPARK: K_SPARK, DROP: K_DROP, GRAIN: K_GRAIN, SHARD: K_SHARD, MIST: K_MIST, MOTE: K_MOTE, ARC: K_ARC },
  };
})(typeof window !== 'undefined' ? window : globalThis);
