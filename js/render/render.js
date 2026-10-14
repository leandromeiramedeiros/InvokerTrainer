// Render orchestrator: layers, interpolation, lighting, bloom, minimap. Reads sim state only.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const PX = IT.Pixel;

  const MM_W = 135, MM_H = 75;

  // ---- minimap helpers (v6 items 47/48/53), pure ----
  // Dota-style directional pin: a teardrop whose tip points along `facing` (radians, world axes: y down = minimap y down).
  // Round body radius `size` centred on (x, y); the tip sits TIP x size ahead. -> [[x, y], ...] (tip first, then the arc round the back)
  const TIP = 1.9, PIN_ARC = 10;
  function pin(x, y, facing, size) {
    const a = Math.acos(1 / TIP), pts = [[x + Math.cos(facing) * size * TIP, y + Math.sin(facing) * size * TIP]];
    for (let i = 0; i <= PIN_ARC; i++) {
      const t = facing + a + (Math.PI * 2 - 2 * a) * (i / PIN_ARC);
      pts.push([x + Math.cos(t) * size, y + Math.sin(t) * size]);
    }
    return pts;
  }
  // stealth that hides a unit from the player's team: Vision.isHidden (Ghost Walk / Shadow Blade / invisible flag) or the Shadow Blade fade-out
  function stealthy(e) {
    if (IT.Vision && IT.Vision.isHidden && IT.Vision.isHidden(e)) return true;
    if (e.invisible === true) return true;
    const st = e.statuses; if (!st) return false;
    for (let i = 0; i < st.length; i++) if (st[i].type === 'invisFade' || st[i].type === 'invisible' || st[i].type === 'shadowblade' || st[i].type === 'ghost') return true;
    return false;
  }
  // true sight on `e` for the player team (team 0): own dust ('revealed'), a gem carrier / tower / ward within its trueSight radius
  function detected(w, e) {
    if (e.revealed === true || (IT.Status && IT.Status.revealed && IT.Status.revealed(e))) return true;
    return !!(IT.Vision && IT.Vision.trueSighted && IT.Vision.trueSighted(w, 0, e));
  }
  // does the minimap show unit e? the player's side always; any other stealthy unit only while detected
  function showsUnit(w, e) {
    if (e.team === 0 || e.kind === 'hero') return true;
    return !stealthy(e) || detected(w, e);
  }
  // detected-but-stealthy units draw half-transparent on the minimap too
  const unitAlpha = (w, e) => (e.team !== 0 && e.kind !== 'hero' && stealthy(e) ? 0.5 : 1);
  const MM_COL = { hero: '#6dff8a', foe: '#ff4a4a', ally: '#3fe0cc', roshan: '#a01818', spirit: '#ff9a30' };
  const MM_SIZE = { hero: 2.5, foe: 2.1, ally: 1.8, roshan: 2.7, spirit: 1.4 };
  const mmClass = e => e.kind === 'hero' ? 'hero' : e.kind === 'ally' ? 'ally' : e.kind === 'roshan' ? 'roshan' : e.kind === 'spirit' ? 'spirit' : 'foe';

  // ---- v6 #76 L3 G-buffer helpers, pure ----
  // y-sorted item kind -> material (docs/LIGHTING-v6.md): units 1, trees / towers / buildings 2, anything else in the pass (FX, pickups) 3 = emissive
  const G_MAT = { unit: 1, tree: 2, tower: 2, struct: 2 };
  const gMatOf = k => G_MAT[k] || 3;
  // IT.Normals RGBA (RG normal, B height, A = material x 85) -> the G-buffer texel (RG, B = height6 << 2 | material, A 255). Sprites (opaque false)
  // keep A 0 where the silhouette is empty so drawImage leaves what is below; terrain (opaque true) writes every texel (A 0 = ground).
  function gEncode(src, n, opaque) {
    const out = new Uint8ClampedArray(n * 4);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const a = src[p + 3];
      if (!a && !opaque) continue;
      const mat = Math.min(3, Math.round(a / 85)), h = Math.min(63, Math.round(src[p + 2] * 63 / 255));
      out[p] = src[p]; out[p + 1] = src[p + 1]; out[p + 2] = (h << 2) | mat; out[p + 3] = 255;
    }
    return out;
  }
  // fog field -> per light-cell vision 0..255 (255 in vision, 0 at f <= 1): the dynamic light is scaled by it, so fog stays unlit
  function visMask(out, lw, lh, cell, camX, camY, sample) {
    for (let cy = 0, i = 0; cy < lh; cy++) for (let c = 0; c < lw; c++, i++) {
      const f = sample ? sample(camX + c * cell + cell / 2, camY + cy * cell + cell / 2) : 2;
      out[i] = f >= 2 ? 255 : f <= 1 ? 0 : Math.round((f - 1) * 255);
    }
    return out;
  }

  // ---- v6 #76 L4: silhouette shadow transform, pure. light {x, y, z}: screen px, z = height px; caster {x, y}: foot in screen px.
  // The sprite (local x = u, y = -height above the foot) is sheared away from the light: x' = sx*u + shear*height, y' = foot + ky*height.
  // len = shadow length per px of sprite height = distance / lightZ, clamped; shear = its x part; ky = its y part, floored so a light level with the
  // caster still gives the shadow some depth. Canvas matrix: setTransform(sx, 0, -shear, -ky, footX, footY).
  const SH_LMAX = 1.2, SH_FLAT = 0.18, SH_ZMIN = 10;
  function shadowXform(light, caster) {
    const dx = caster.x - light.x, dy = caster.y - light.y, d = Math.hypot(dx, dy), lz = Math.max(SH_ZMIN, light.z || 0);
    if (!(d > 1e-6)) return { sx: 1, shear: 0, len: 0, ky: 0 };
    const len = Math.min(SH_LMAX, d / lz), kr = dy / d * len;
    return { sx: 1, shear: dx / d * len, len, ky: (kr < 0 ? -1 : 1) * Math.max(0.5 * Math.abs(kr), SH_FLAT * len) };
  }
  // key light (sun / moon) shadow: directional, so one transform for every caster. dir = toward the light (screen px, y down, z up); len per px of height.
  function keyXform(dir, len) {
    const h = Math.hypot(dir[0], dir[1]);
    return h > 1e-6 ? shadowXform({ x: dir[0] / h * 1e4, y: dir[1] / h * 1e4, z: 1e4 / len }, { x: 0, y: 0 }) : { sx: 1, shear: 0, len: 0, ky: 0 };
  }
  const SH_MAX = 120, SH_TREES = 40, LC_WIN = 60, LC_WARN = 6, SH_MINPX = 6, SH_MINSC = 0.03, SH_CAND = 14, SH_REC = 600, SH_GAIN = 2.5, SH_BAKE = 16, SH_BAKE_ULTRA = 32;   // default per-frame caps (the live ones are LEVELS[lv].casters / .trees); light candidates per caster; record cap; lighting-cost window (frames) + warn threshold (ms)

  // L5: lighting cost = G-buffer taps + shadow pass + present, averaged over LC_WIN lit frames. Logs once if 'high' averages > LC_WARN ms; never downgrades.
  const LC = { avg: 0, n: 0, sum: 0, level: 'off', warned: false };
  function lcSample(ms, level) {
    if (level !== LC.level) { LC.level = level; LC.n = 0; LC.sum = 0; }
    LC.sum += ms; if (++LC.n < LC_WIN) return;
    LC.avg = LC.sum / LC.n; LC.n = 0; LC.sum = 0;
    if ((level === 'high' || level === 'ultra') && LC.avg > LC_WARN && !LC.warned) {
      LC.warned = true;
      try { console.info('[Lighting] ' + level + ' averages ' + LC.avg.toFixed(1) + ' ms/frame over ' + LC_WIN + ' frames (budget ' + LC_WARN + ' ms); consider a lower level'); } catch (e) { /* ignore */ }
    }
  }
  const lightingCost = () => ({ avg: LC.avg, level: LC.level, over: (LC.level === 'high' || LC.level === 'ultra') && LC.avg > LC_WARN, budget: LC_WARN, window: LC_WIN });

  function create(w, cv, glowCv, cam) {
    const GM = IT.GAME, P = GM.UNIT_PX;
    let VW = GM.VIEW_W, VH = GM.VIEW_H;   // live: R.resize() follows scroll-wheel zoom
    const gameCx = cv.getContext('2d'), gx = glowCv.getContext('2d');
    gameCx.imageSmoothingEnabled = false;
    // GL path: the lit scene is drawn to an offscreen canvas, the unlit HUD to #game (transparent overlay), GL composites underneath
    let comp = null, sceneCx = null, useGL = false;
    try {
      const litCv = document.getElementById('lit');
      if (litCv && IT.GL && IT.Light) comp = IT.GL.create(litCv, VW, VH, Math.ceil(VW / 4), Math.ceil(VH / 4));
    } catch (e) { comp = null; }
    if (comp) {
      const sc = document.createElement('canvas'); sc.width = VW; sc.height = VH;
      sceneCx = sc.getContext('2d', { alpha: false }); sceneCx.imageSmoothingEnabled = false;
      comp.scene = sc;
    }
    const setGL = on => {
      if (on === useGL) return;
      useGL = on; document.body.classList.toggle('gl', on);
      if (!on) gameCx.clearRect(0, 0, VW, VH);
    };
    let cx = gameCx;
    let ter = IT.Terrain.build(w.map);
    let fog = IT.Fog.create(w.map);
    let light = IT.Light.create(VW, VH);
    IT.Particles.init(VW, VH);
    const prev = new Map();
    // minimap: own canvas (#mm) at a fixed screen size, independent of the zoomed view resolution
    const MMX = 1, MMY = 1, MM_BX = 3, MM_BY = GM.VIEW_H_BASE - MM_H - 3;   // MM_B*: top-left in base (480x270) screen px
    let mmCv = document.getElementById('mm');
    if (!mmCv) { mmCv = document.createElement('canvas'); mmCv.id = 'mm'; const st = cv.parentNode; st.insertBefore(mmCv, document.getElementById('hud')); }
    mmCv.width = MM_W + 2; mmCv.height = MM_H + 2;
    const mmCx = mmCv.getContext('2d'); mmCx.imageSmoothingEnabled = false;

    // minimap layers (rebuilt by R.setMap)
    const mmBase = document.createElement('canvas'); mmBase.width = MM_W; mmBase.height = MM_H;
    const mmFog = document.createElement('canvas'); mmFog.width = MM_W; mmFog.height = MM_H;
    const mmFogC = mmFog.getContext('2d'), mmImg = mmFogC.createImageData(MM_W, MM_H);
    let mmTick = 0;
    // minimap pixel -> tile index pairs for fog sampling (2x2 around the pixel centre)
    const mmIx0 = new Int32Array(MM_W), mmIx1 = new Int32Array(MM_W), mmIy0 = new Int32Array(MM_H), mmIy1 = new Int32Array(MM_H);
    function buildMM() {
      const c = mmBase.getContext('2d'), img = c.createImageData(MM_W, MM_H), m = ter.mini;
      for (let i = 0; i < MM_W * MM_H; i++) { img.data[i * 4] = m.rgb[i * 3]; img.data[i * 4 + 1] = m.rgb[i * 3 + 1]; img.data[i * 4 + 2] = m.rgb[i * 3 + 2]; img.data[i * 4 + 3] = 255; }
      c.putImageData(img, 0, 0);
      mmTick = 0;
      for (let x = 0; x < MM_W; x++) { const c2 = (x + 0.5) * w.map.w / MM_W - 0.5; mmIx0[x] = Math.max(0, Math.min(w.map.w - 1, Math.floor(c2))); mmIx1[x] = Math.min(w.map.w - 1, mmIx0[x] + 1); }
      for (let y = 0; y < MM_H; y++) { const c2 = (y + 0.5) * w.map.h / MM_H - 0.5; mmIy0[y] = Math.max(0, Math.min(w.map.h - 1, Math.floor(c2))); mmIy1[y] = Math.min(w.map.h - 1, mmIy0[y] + 1); }
    }
    buildMM();

    const R = {
      cx: gameCx, gx, w, P, VW, VH, camX: 0, camY: 0, time: 0, simT: 0, alpha: 1, fog, ter, lightmap: light,
      ix: 0, iy: 0, iz: 0, shakeAmp: 0, shakeEnd: 0, shakeT: 0,
      stats: { ms: 0, avg: 0, max: 0, lights: 0, parts: 0, items: 0, sand: 0, frames: 0, tLight: 0, tSand: 0, tFx: 0, tComp: 0, gl: '2d' },
      showDebug: false,
      snapshot() {
        for (const e of w.ents) {
          let a = prev.get(e.id);
          if (!a) { a = new Float64Array(3); prev.set(e.id, a); }
          a[0] = e.x; a[1] = e.y; a[2] = e.z || 0;
        }
        if (prev.size > 400) for (const id of prev.keys()) if (!w.byId.has(id)) prev.delete(id);
      },
      interp(e) {
        const a = prev.get(e.id), k = R.alpha, z = e.z || 0;
        if (!a || k >= 1 || Math.abs(e.x - a[0]) + Math.abs(e.y - a[1]) > 400) { R.ix = e.x; R.iy = e.y; R.iz = z; return; }
        R.ix = a[0] + (e.x - a[0]) * k; R.iy = a[1] + (e.y - a[1]) * k; R.iz = a[2] + (z - a[2]) * k;
      },
      glow(x, y, r, color, a) {
        if (x + r < 0 || y + r < 0 || x - r > VW || y - r > VH) return;
        gx.globalAlpha = Math.min(1, a == null ? 1 : a);
        gx.drawImage(PX.glowSprite(color), x - r, y - r, r * 2, r * 2);
      },
      light(sx, sy, r, rgb, i) { light.add(sx, sy, r, rgb, i); },
      shake(amp, dur) { R.shakeAmp = amp; R.shakeEnd = R.time + dur; R.shakeDur = dur; },
      edgeArrow(x, y, color, label) {
        const mx = VW / 2, my = VH / 2, dx = x - mx, dy = y - my;
        const k = Math.min((mx - 10) / Math.max(1e-3, Math.abs(dx)), (my - 10) / Math.max(1e-3, Math.abs(dy)));
        const ex = Math.round(mx + dx * k), ey = Math.round(my + dy * k), a = Math.atan2(dy, dx);
        cx.fillStyle = '#000';
        for (let s = 0; s < 5; s++) for (let t = -s; t <= s; t++) cx.fillRect(Math.round(ex - Math.cos(a) * s * 1.2 - Math.sin(a) * t * 0.8) - 1, Math.round(ey - Math.sin(a) * s * 1.2 + Math.cos(a) * t * 0.8) - 1, 3, 3);
        cx.fillStyle = color;
        for (let s = 0; s < 5; s++) for (let t = -s; t <= s; t++) cx.fillRect(Math.round(ex - Math.cos(a) * s * 1.2 - Math.sin(a) * t * 0.8), Math.round(ey - Math.sin(a) * s * 1.2 + Math.cos(a) * t * 0.8), 1, 1);
        if (label) PX.text(cx, label, ex - Math.cos(a) * 9, ey - Math.sin(a) * 9 - 2, color, 'c');
      },
      mmHit(mx, my) {
        mx = mx * GM.VIEW_W_BASE / VW - MM_BX + MMX; my = my * GM.VIEW_H_BASE / VH - MM_BY + MMY;   // view px -> minimap canvas px
        if (mx < MMX || my < MMY || mx >= MMX + MM_W || my >= MMY + MM_H) return null;
        return { x: (mx - MMX) / MM_W * w.map.W, y: (my - MMY) / MM_H * w.map.H };
      },
      // new map on the same world (map swap between scenarios): terrain, fog and minimap tables are rebuilt, old snapshots dropped
      setMap(map) {
        if (map) w.map = map;
        ter = R.ter = IT.Terrain.build(w.map);
        fog = R.fog = IT.Fog.create(w.map);
        prev.clear(); buildMM();
      },
      // scroll-wheel zoom: GM.VIEW_W/VIEW_H changed -> rebuild every view-sized buffer in place (world listeners untouched)
      resize() {
        VW = R.VW = GM.VIEW_W; VH = R.VH = GM.VIEW_H;
        cv.width = glowCv.width = VW; cv.height = glowCv.height = VH;
        gameCx.imageSmoothingEnabled = false;
        if (comp) { comp.scene.width = VW; comp.scene.height = VH; sceneCx.imageSmoothingEnabled = false; comp.resize(VW, VH, Math.ceil(VW / 4), Math.ceil(VH / 4)); }
        light = R.lightmap = IT.Light.create(VW, VH);
        IT.Particles.init(VW, VH);
        IT.Sand.resize(R);
      },
    };
    IT.FX.init(R);
    IT.Sand.init(R);
    // VFX never carries over: a new world, a scenario swap / redo (scnStart) or a sandbox reset starts clean
    R.clearVfx = () => { IT.Particles.clear(); IT.Sand.clear(); IT.FX.clear(); };
    R.clearVfx();
    w.on('mapChange', () => { if (w.map !== R.ter.map) R.setMap(w.map); });
    w.on('scnStart', () => R.clearVfx());
    w.on('cast', p => { if (p.kind !== 'item') IT.UnitDraw.castFlash(R, p); });   // spells only; items have no pose
    w.on('attack', p => IT.UnitDraw.launched(R, p));                                // wind-up release pop

    // ---- v6 #76 L3: G-buffer canvas (view size, opaque), filled only while lighting is on: terrain normals blitted at the camera offset, then every
    // drawImage of the y-sorted pass is mirrored with that image's pillow normals (IT.Normals.fromCanvas, cached per source canvas: mirrored west
    // frames, skins and scaled copies get their own correct normals), same rect, same order. Faint overlays (alpha < .5) and additive draws are skipped.
    let gCv = null, gCx = null, gMat = -1, gBudget = 0, gVis = null, gT = 0;
    // L4: casters recorded by the same drawImage tap (units / trees / buildings, >= 6 px), drawn once the frame's lights are known
    let shCv = null, shCx = null, skCv = null, skCx = null, sN = 0, sOn = false, sBudget = 0, gFootX = NaN, gFootY = 0, gTree = false, gUnit = false, shDrawn = 0;
    const sRec = [], sCache = new WeakMap(), bI = [], bS = [], cI = [], shOut = { p: null, k: null };
    function shCanvas(key) {    // two view-size coverage canvases (alpha = shadowed): point lights (shCv) and the key light (skCv); cleared per use
      let cv = key ? skCv : shCv;
      if (!cv) { cv = document.createElement('canvas'); if (key) skCv = cv; else shCv = cv; }
      if (cv.width !== VW || cv.height !== VH) { cv.width = VW; cv.height = VH; }
      const x = cv.getContext('2d');
      x.imageSmoothingEnabled = false; x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
      x.clearRect(0, 0, VW, VH);
      if (key) skCx = x; else shCx = x;
      return x;
    }
    function silhouette(src) {      // black copy of the source (cached per source canvas / atlas); null while the bake budget is spent
      let c = sCache.get(src);
      if (c !== undefined) return c;
      if (sBudget <= 0) return null;
      sBudget--; c = null;
      try {
        if (src.width && src.height) {
          c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
          const x = c.getContext('2d'); x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
        }
      } catch (e) { c = null; }
      sCache.set(src, c);
      return c;
    }
    function record(img, a) {
      const n = a.length;
      let sx = 0, sy = 0, sw = img.width, sh = img.height, dx = a[1], dy = a[2], dw = sw, dh = sh;
      if (n === 5) { dw = a[3]; dh = a[4]; } else if (n === 9) { sx = a[1]; sy = a[2]; sw = a[3]; sh = a[4]; dx = a[5]; dy = a[6]; dw = a[7]; dh = a[8]; }
      if (!(dw >= SH_MINPX && dh >= SH_MINPX) || sN >= SH_REC) return;
      if (gFootX !== gFootX) gFootX = dx + dw / 2;
      let r = sRec[sN++]; if (!r) r = sRec[sN - 1] = {};
      r.src = img; r.sx = sx; r.sy = sy; r.sw = sw; r.sh = sh; r.dx = dx; r.dy = dy; r.dw = dw; r.dh = dh; r.fx = gFootX; r.fy = gFootY; r.tree = gTree; r.unit = gUnit;
    }
    // u: screen-px light uniforms (strongest first by steady `base` intensity). Per caster: ONE hard key-light (sun / moon, fixed direction, K.len px per
    // px of height) silhouette into the key canvas, plus the `per` strongest CASTING lights (u.cast; hero orbs never cast) reaching the foot into the point
    // canvas, each drawn with alpha = its steady contribution at the foot (a*a*base) faded by its margin over the first light left out, so a light entering
    // or leaving the set grows from zero instead of popping. LV.structs false: units only (towers / buildings / trees cast from High up).
    // Returns { p: point canvas | null, k: key canvas | null } (reused object).
    function drawShadows(u, per, LV, K) {
      shDrawn = 0; shOut.p = shOut.k = null;
      const cMax = LV ? LV.casters : SH_MAX, tMax = LV ? LV.trees : SH_TREES, all = !LV || LV.structs !== false;
      const kX = K && K.len > 0 ? keyXform(K.dir, K.len) : null;
      if (!sN || !per || (!u.count && !kX)) return shOut;
      const P3 = u.pos, R2 = u.rad, BS = u.base || null, CA = u.cast || null;
      let nC = 0;
      for (let l = 0; l < u.count && nC < SH_CAND; l++) if (!CA || CA[l]) cI[nC++] = l;
      let gk = null, gp = null, trees = 0;
      for (let i = 0; i < sN && shDrawn < cMax; i++) {
        const r = sRec[i];
        if (!all && !r.unit) continue;
        if (r.tree && trees >= tMax) continue;
        if (r.tree) trees++;
        const sil = silhouette(r.src); if (!sil) continue;
        if (kX) {
          if (!gk) gk = shCanvas(true);
          gk.setTransform(1, 0, -kX.shear, -kX.ky, r.fx, r.fy);
          gk.drawImage(sil, r.sx, r.sy, r.sw, r.sh, r.dx - r.fx, r.dy - r.fy, r.dw, r.dh);
          shDrawn++;
        }
        let nb = 0;     // the `per`+1 strongest casting lights reaching the foot (insertion into bI / bS, strongest first)
        for (let q = 0; q < nC; q++) {
          const l = cI[q], d = Math.hypot(r.fx - P3[l * 3], r.fy - P3[l * 3 + 1]), rad = R2[l * 2];
          if (d >= rad) continue;
          const a = 1 - d / rad, sc = a * a * (BS ? BS[l] : R2[l * 2 + 1]);
          if (sc <= SH_MINSC || (nb > per && sc <= bS[nb - 1])) continue;
          let j = Math.min(nb, per);
          while (j > 0 && bS[j - 1] < sc) { bI[j] = bI[j - 1]; bS[j] = bS[j - 1]; j--; }
          bI[j] = l; bS[j] = sc; if (nb <= per) nb++;
        }
        if (!nb) continue;
        const nxt = nb > per ? bS[per] : 0, nd = Math.min(nb, per);
        for (let k = 0; k < nd; k++) {
          const l = bI[k], sc = bS[k];
          let t = nxt > 0 ? (sc - nxt) / (0.35 * sc) : 1; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const wgt = Math.min(1, (sc - SH_MINSC) * SH_GAIN * t * t * (3 - 2 * t));
          if (wgt < 0.02) continue;
          const X = shadowXform({ x: P3[l * 3], y: P3[l * 3 + 1], z: P3[l * 3 + 2] }, { x: r.fx, y: r.fy });
          if (X.len < 0.08) continue;
          if (!gp) gp = shCanvas(false);
          gp.globalAlpha = wgt;
          gp.setTransform(X.sx, 0, -X.shear, -X.ky, r.fx, r.fy);
          gp.drawImage(sil, r.sx, r.sy, r.sw, r.sh, r.dx - r.fx, r.dy - r.fy, r.dw, r.dh);
          shDrawn++;
        }
      }
      if (gk) { gk.setTransform(1, 0, 0, 1, 0, 0); shOut.k = skCv; }
      if (gp) { gp.setTransform(1, 0, 0, 1, 0, 0); gp.globalAlpha = 1; shOut.p = shCv; }
      return shOut;
    }
    const gCache = new WeakMap(), drawImg = typeof CanvasRenderingContext2D !== 'undefined' ? CanvasRenderingContext2D.prototype.drawImage : null;
    function gCanvas() {
      if (!gCv) { gCv = document.createElement('canvas'); gCv.width = VW; gCv.height = VH; gCx = gCv.getContext('2d', { alpha: false }); }
      if (gCv.width !== VW || gCv.height !== VH) { gCv.width = VW; gCv.height = VH; gCx = gCv.getContext('2d', { alpha: false }); }
      gCx.imageSmoothingEnabled = false; gCx.globalAlpha = 1; gCx.globalCompositeOperation = 'source-over';
      return gCx;
    }
    function encCanvas(data, w, h, opaque) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'), id = x.createImageData(w, h);
      id.data.set(gEncode(data, w * h, opaque)); x.putImageData(id, 0, 0);
      return c;
    }
    function gNormal(src, mat) {
      let m = gCache.get(src);
      if (m && m[mat] !== undefined) return m[mat];
      if (gBudget <= 0) return null;             // bake budget spent: this sprite reads as ground for a frame or two
      gBudget--;
      if (!m) { m = {}; gCache.set(src, m); }
      let c = null;
      try { if (src.width && src.height) { const n = IT.Normals.fromCanvas(src, { material: mat }); c = encCanvas(n.data, n.w, n.h, false); } } catch (e) { c = null; }   // not a canvas
      return (m[mat] = c);
    }
    function gDraw(img) {
      const a = arguments;
      drawImg.apply(this, a);
      if (gMat < 0 || this.globalAlpha < 0.5 || this.globalCompositeOperation !== 'source-over') return;
      const tg = performance.now();   // L5: G-buffer cost = everything after the albedo draw
      if (sOn && (gMat === 1 || gMat === 2)) record(img, a);
      const n = gNormal(img, gMat); if (!n) { gT += performance.now() - tg; return; }
      if (a.length === 3) gCx.drawImage(n, a[1], a[2]);
      else if (a.length === 5) gCx.drawImage(n, a[1], a[2], a[3], a[4]);
      else if (a.length === 9) gCx.drawImage(n, a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8]);
      gT += performance.now() - tg;
    }
    // terrain part, same rect as IT.Terrain.draw; the void off the map is flat ground
    function gTerrain() {
      const g = gCanvas(), camX = R.camX, camY = R.camY;
      g.fillStyle = 'rgb(128,128,0)'; g.fillRect(0, 0, VW, VH);
      if (ter._gCv === undefined) { const n = ter.normals ? ter.normals() : null; ter._gCv = n ? encCanvas(n.data, n.w, n.h, true) : null; }
      if (!ter._gCv) return;
      const mx0 = Math.max(0, -camX), my0 = Math.max(0, -camY), mx1 = Math.min(VW, ter.W - camX), my1 = Math.min(VH, ter.H - camY);
      if (mx1 > mx0 && my1 > my0) g.drawImage(ter._gCv, mx0 + camX, my0 + camY, mx1 - mx0, my1 - my0, mx0, my0, mx1 - mx0, my1 - my0);
    }

    const items = [];
    function push(y, fn, a, k) { items.push({ y, fn, a, k }); }
    const drawUnit = (e) => IT.UnitDraw.draw(R, e);

    function drawTreesInto(camX, camY) {
      const T = ter.T, map = w.map;
      const ty0 = Math.max(0, Math.floor(camY / T) - 1), ty1 = Math.min(map.h - 1, Math.floor((camY + VH) / T) + 7);   // canopies reach ~50 px above the trunk
      const tx0 = camX - 22, tx1 = camX + VW + 22;
      for (let ty = ty0; ty <= ty1; ty++) {
        const row = ter.treeRows[ty];
        for (let i = 0; i < row.length; i++) {
          const t = row[i];
          if (t.x < tx0 || t.x > tx1) continue;
          const sy = t.y - camY;
          if (sy < -4 || sy - t.hh > VH) continue;
          push(sy, drawTree, t, 'tree');
        }
      }
    }
    // the y-sorted pass runs after every R.interp(), so position is captured at push time (R.ix/iy would be stale by then)
    function drawTower(a) { IT.TowerDraw.draw(R, a.e, a.sx, a.sy); }
    function drawStruct(a) { IT.TowerDraw.struct(R, a.s, a.sx, a.sy); }
    function drawTree(t) {
      cx.drawImage(t.c, t.x - R.camX - t.c._ax, t.y - R.camY - t.c._ay);
    }

    function minimap() {
      const cx = mmCx;
      cx.fillStyle = '#000'; cx.fillRect(MMX - 1, MMY - 1, MM_W + 2, MM_H + 2);
      cx.drawImage(mmBase, MMX, MMY);
      const fogOn = w.fog !== false && fog.shade, W = w.map.w;
      if (fogOn) {
        if ((mmTick++ % 6) === 0) {
          const u = new Uint32Array(mmImg.data.buffer), cur = fog.cur;
          for (let y = 0; y < MM_H; y++) for (let x = 0; x < MM_W; x++) {
            const k = y * MM_W + x, x0 = mmIx0[x], x1 = mmIx1[x], y0 = mmIy0[y] * W, y1 = mmIy1[y] * W;
            const f = (cur[y0 + x0] + cur[y0 + x1] + cur[y1 + x0] + cur[y1 + x1]) * 0.25;
            const a = f >= 2 ? 0 : (2 - f) * 130;
            u[k] = (Math.round(a) << 24) | 0x100804;
          }
          mmFogC.putImageData(mmImg, 0, 0);
        }
        cx.drawImage(mmFog, MMX, MMY);
      }
      const sx = MM_W / w.map.W, sy = MM_H / w.map.H;
      for (const e of w.ents) {      // towers: always drawn (also in fog), green allied / red enemy / grey destroyed
        if (e.dead || e.kind !== 'tower') continue;
        const px = MMX + Math.round(e.x * sx), py = MMY + Math.round(e.y * sy);
        cx.fillStyle = '#000'; cx.fillRect(px - 2, py - 2, 5, 5);
        cx.fillStyle = e.destroyed ? '#7a7a82' : e.team === 0 ? '#5dff7a' : '#ff5a4a'; cx.fillRect(px - 1, py - 1, 3, 3);
      }
      cx.lineJoin = 'round'; cx.lineWidth = 1;
      for (let pass = 0; pass < 2; pass++) for (const e of w.ents) {      // pass 0: everyone, pass 1: the hero on top
        if (e.dead || !IT.UnitDraw.isUnit(e) || (e.kind === 'hero') !== (pass === 1) || !IT.UnitDraw.visible(R, e) || !showsUnit(w, e)) continue;
        const cl = mmClass(e), pts = pin(MMX + e.x * sx, MMY + e.y * sy, e.facing || 0, MM_SIZE[cl]);
        cx.globalAlpha = unitAlpha(w, e);
        cx.beginPath(); cx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) cx.lineTo(pts[i][0], pts[i][1]);
        cx.closePath();
        cx.strokeStyle = 'rgba(0,0,0,0.85)'; cx.stroke();
        cx.fillStyle = MM_COL[cl]; cx.fill();
        cx.globalAlpha = 1;
      }
      cx.strokeStyle = '#fff'; cx.lineWidth = 1;
      // viewport rect, clipped to the map (the camera may overscroll past it)
      const vx = Math.round(cam.x * sx), vy = Math.round(cam.y * sy);
      const rx0 = Math.max(0, vx), ry0 = Math.max(0, vy), rx1 = Math.min(MM_W, vx + Math.round(VW * P * sx)), ry1 = Math.min(MM_H, vy + Math.round(VH * P * sy));
      if (rx1 > rx0 && ry1 > ry0) cx.strokeRect(MMX + rx0 + 0.5, MMY + ry0 + 0.5, rx1 - rx0 - 1, ry1 - ry0 - 1);
    }

    R.render = function (alpha, dtReal) {
      const t0 = performance.now();
      dtReal = Math.min(0.1, dtReal || 0.0167);
      R.alpha = alpha == null ? 1 : alpha;
      R.time += dtReal; R.simT = w.t;
      // camera (+ shake), integer pixel offsets inside the terrain bitmap
      let sx = 0, sy = 0;
      if (R.time < R.shakeEnd) {
        const k = (R.shakeEnd - R.time) / (R.shakeDur || 0.25), a = R.shakeAmp * k;
        sx = Math.round((Math.random() - 0.5) * 2 * a); sy = Math.round((Math.random() - 0.5) * 2 * a);
      }
      R.camX = cam.px + sx; R.camY = cam.py + sy;   // may run past the map (overscroll): terrain.draw paints the void
      const shade = true;   // fog shading is always on (CEO: no setting; Free Play's loadout fog checkbox is the only fog switch)
      fog.shade = shade;
      const fogOn = w.fog !== false && shade, S = R.stats;
      // GL needs a live context; a lost/failed one drops back to the 2D multiply path + CSS glow
      setGL(!!(comp && comp.ok));
      R.cx = cx = useGL ? sceneCx : gameCx;
      // v6 #76 L3: dynamic lighting only on the GL path with a level above 'off' (IT.GL.setLighting / comp.setLighting)
      const LT = IT.Lights;
      if (LT) LT.begin(R);
      const lit = !!(useGL && drawImg && comp.lighting && comp.lighting !== 'off' && LT && LT.enabled && IT.Normals);
      gBudget = lit && comp.lighting === 'ultra' ? 12 : 6;
      R.sil = lit ? comp.levelInfo() : null;       // shadows.js: which grounded casters already get a silhouette shadow (blob -> small contact shadow)
      fog.update(w, R.fogSnap ? 1 : dtReal, R.camX, R.camY, VW, VH);
      IT.Particles.update(dtReal);
      const tf0 = performance.now();
      IT.FX.update(R, dtReal);
      const tf1 = performance.now();
      IT.Sand.update(R, dtReal);
      let tSand = performance.now() - tf1, tFx = tf1 - tf0;
      gx.globalCompositeOperation = 'source-over'; gx.clearRect(0, 0, VW, VH); gx.globalCompositeOperation = 'lighter';
      light.begin(IT.DayNight ? IT.DayNight.factor(w) : 0);   // v6: night tint + falloff

      IT.Terrain.draw(R, ter);
      if (lit) gTerrain();
      let tm = performance.now();
      IT.Sand.drawGround(R);
      tSand += performance.now() - tm; tm = performance.now();
      if (IT.Shadows) IT.Shadows.ground(R);      // v6: blob shadows under everything, beneath ground particles / fx
      IT.Particles.draw(R, 0);
      IT.FX.ground(R);
      IT.TowerDraw.ground(R);
      tFx += performance.now() - tm;

      // y-sorted pass: units, trees, tall fx
      items.length = 0;
      for (const e of w.ents) {
        if (e.dead || !IT.UnitDraw.isUnit(e) || !IT.UnitDraw.visible(R, e)) continue;
        R.interp(e);
        push(R.iy / P - R.camY, drawUnit, e, 'unit');
      }
      for (const e of w.ents) {      // towers: buildings, always visible once on the map
        if (e.dead || e.kind !== 'tower') continue;
        R.interp(e);
        const sx = R.ix / P - R.camX, sy = R.iy / P - R.camY;
        push(sy, drawTower, { e, sx, sy }, 'tower');
      }
      const sts = w.map.structures;      // static buildings (barracks, fort, fillers, fountain, shops, outposts)
      for (let i = 0; i < sts.length; i++) {
        const s = sts[i], sx = s.x / P - R.camX, sy = s.y / P - R.camY;
        if (sx < -50 || sx > VW + 50 || sy < -40 || sy > VH + 90) continue;
        push(sy, drawStruct, { s, sx, sy }, 'struct');
      }
      drawTreesInto(R.camX, R.camY);
      tm = performance.now();
      IT.FX.sorted(R, push);
      tFx += performance.now() - tm;
      items.sort((a, b) => a.y - b.y);
      if (lit) {     // same order / rects into the G-buffer: tap the scene context's drawImage for the pass
        sceneCx.drawImage = gDraw;
        sN = 0; sOn = comp.levelInfo().shadows > 0; sBudget = comp.lighting === 'ultra' ? SH_BAKE_ULTRA : SH_BAKE; gT = 0;
        try { for (let i = 0; i < items.length; i++) { const it = items[i]; gMat = gMatOf(it.k); gTree = it.k === 'tree'; gUnit = it.k === 'unit'; gFootY = it.y; gFootX = gTree ? it.a.x - R.camX : NaN; it.fn(it.a, R); } }
        finally { gMat = -1; delete sceneCx.drawImage; }
      } else { sN = 0; for (let i = 0; i < items.length; i++) { const it = items[i]; it.fn(it.a, R); } }
      R.stats.items = items.length;

      // keep the hero readable behind canopies
      const h = w.hero;
      if (h && !h.dead) {
        R.interp(h);
        const hx = R.ix / P, hy = R.iy / P;
        let behind = false;
        for (const it of items) if (it.fn === drawTree && it.a.y > hy && it.a.y - it.a.hh < hy - 4 && Math.abs(it.a.x - hx) < it.a.hw) { behind = true; break; }
        if (behind) { cx.globalAlpha = 0.4; IT.UnitDraw.draw(R, h); cx.globalAlpha = 1; }
      }

      tm = performance.now();
      IT.FX.air(R);
      const ta = performance.now();
      IT.Sand.drawAir(R);
      const tb = performance.now();
      IT.Particles.draw(R, 1);
      tFx += ta - tm; tSand += tb - ta;

      // lighting
      const tl0 = performance.now();
      for (const e of w.ents) if (!e.dead && IT.UnitDraw.isUnit(e) && IT.UnitDraw.visible(R, e)) IT.UnitDraw.lights(R, e);
      tm = performance.now();
      IT.FX.lights(R);
      IT.TowerDraw.lights(R);
      IT.TowerDraw.structLights(R);
      const tl1 = performance.now();
      IT.Sand.lights(R);
      const tl2 = performance.now();
      tFx += tl1 - tm; tSand += tl2 - tl1;
      let tLight, tComp;
      if (useGL) {
        light.fold(R.camX, R.camY, fog, fogOn);
        tLight = performance.now() - tl0 - (tl2 - tl1) - (tl1 - tm);
        const tc = performance.now();
        let litArg = null;
        if (lit) {
          const lb = light.buf, n = lb.w * lb.h;
          if (!gVis || gVis.length !== n) gVis = new Uint8Array(n);
          const u = IT.GL.toScreen(LT.uniforms({ x: R.camX * P, y: R.camY * P, w: VW * P, h: VH * P }, comp.levelInfo().lights), P);
          const sh = sOn ? drawShadows(u, comp.levelInfo().shadows, comp.levelInfo(), IT.GL.keyLight(light.night, comp.lighting)) : null;
          litArg = { gbuf: gCv, shadow: sh && sh.p, keyShadow: sh && sh.k, u, night: light.night, vis: visMask(gVis, lb.w, lb.h, 4, R.camX, R.camY, fogOn ? (x, y) => fog.sample(x, y) : null) };
          S.dyn = u.count; S.shd = shDrawn; 
        }
        const ok = comp.present(comp.scene, light, glowCv, R.camX, R.camY, !document.body.classList.contains('nobloom'), litArg);
        tComp = performance.now() - tc;
        if (lit) lcSample(gT + tComp, comp.lighting);   // G-buffer taps + (uniforms + shadows + present, all inside tComp; present includes the base composite)
        gameCx.clearRect(0, 0, VW, VH);        // overlay: unlit HUD only
        if (!ok) {                              // present() failed mid-frame: redo this frame's lighting on the 2D path next frame
          setGL(false);
        }
      } else {
        light.compose(R.camX, R.camY, fog, fogOn);
        const tc = performance.now();
        tLight = tc - tl0 - (tl2 - tl1) - (tl1 - tm);
        cx.globalCompositeOperation = 'multiply';
        cx.drawImage(light.canvas, 0, 0);
        cx.globalCompositeOperation = 'source-over';
        tComp = performance.now() - tc;
      }

      // HUD layer
      if (useGL) R.cx = cx = gameCx;
      const th0 = performance.now();
      for (const e of w.ents) if (!e.dead && IT.UnitDraw.isUnit(e) && IT.UnitDraw.visible(R, e)) IT.UnitDraw.hud(R, e);
      for (const e of w.ents) if (!e.dead && e.kind === 'tower') { R.interp(e); IT.TowerDraw.hud(R, e, R.ix / P - R.camX, R.iy / P - R.camY); }
      IT.FX.hud(R);
      minimap();
      tFx += performance.now() - th0;
      IT.UnitDraw.cleanup(w);
      gx.globalAlpha = 1;

      const ms = performance.now() - t0;
      S.tLight = S.tLight * 0.9 + tLight * 0.1; S.tSand = S.tSand * 0.9 + tSand * 0.1; S.tFx = S.tFx * 0.9 + tFx * 0.1; S.tComp = S.tComp * 0.9 + tComp * 0.1;
      S.gl = useGL ? comp.kind : '2d';
      S.ms = ms; S.avg = S.avg ? S.avg * 0.95 + ms * 0.05 : ms; if (ms > S.max) S.max = ms; S.frames++;
      S.lights = light.count; S.parts = IT.Particles.live; S.sand = IT.Sand.count;
    };
    return R;
  }

  IT.Render = { create, shadowXform, keyXform, lightingCost, lcSample, LC_WARN, LC_WIN, SH_LMAX, SH_MAX, SH_TREES, MM_W, MM_H, G_MAT, gMatOf, gEncode, visMask };
  IT.Minimap = { pin, showsUnit, stealthy, detected, unitAlpha, TIP, COL: MM_COL, SIZE: MM_SIZE };
})(typeof window !== 'undefined' ? window : globalThis);
