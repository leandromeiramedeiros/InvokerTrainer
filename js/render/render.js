// Render orchestrator: layers, interpolation, lighting, bloom, minimap. Reads sim state only.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const PX = IT.Pixel;

  const MM_W = 135, MM_H = 75;

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

    const items = [];
    function push(y, fn, a) { items.push({ y, fn, a }); }
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
          push(sy, drawTree, t);
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
      for (const e of w.ents) {
        if (e.dead || !IT.UnitDraw.isUnit(e) || !IT.UnitDraw.visible(R, e)) continue;
        const px = MMX + Math.round(e.x * sx), py = MMY + Math.round(e.y * sy);
        cx.fillStyle = e.kind === 'hero' ? '#6dff8a' : e.kind === 'spirit' ? '#ff9a30' : '#ff4a4a';
        cx.fillRect(px - 1, py - 1, e.kind === 'hero' ? 3 : 2, e.kind === 'hero' ? 3 : 2);
      }
      for (const e of w.ents) {      // towers: always drawn (also in fog), green allied / red enemy / grey destroyed
        if (e.dead || e.kind !== 'tower') continue;
        const px = MMX + Math.round(e.x * sx), py = MMY + Math.round(e.y * sy);
        cx.fillStyle = '#000'; cx.fillRect(px - 2, py - 2, 5, 5);
        cx.fillStyle = e.destroyed ? '#7a7a82' : e.team === 0 ? '#5dff7a' : '#ff5a4a'; cx.fillRect(px - 1, py - 1, 3, 3);
      }
      cx.strokeStyle = '#fff'; cx.lineWidth = 1;
      cx.strokeRect(MMX + Math.round(cam.x * sx) + 0.5, MMY + Math.round(cam.y * sy) + 0.5, Math.round(VW * P * sx) - 1, Math.round(VH * P * sy) - 1);
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
      R.camX = Math.max(0, Math.min(ter.W - VW, cam.px + sx)); R.camY = Math.max(0, Math.min(ter.H - VH, cam.py + sy));
      const shade = !(IT.Settings && IT.Settings.get) || IT.Settings.get().fogShade !== false;   // setting: dark outside vision
      fog.shade = shade;
      const fogOn = w.fog !== false && shade, S = R.stats;
      // GL needs a live context; a lost/failed one drops back to the 2D multiply path + CSS glow
      setGL(!!(comp && comp.ok));
      R.cx = cx = useGL ? sceneCx : gameCx;
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
      let tm = performance.now();
      IT.Sand.drawGround(R);
      tSand += performance.now() - tm; tm = performance.now();
      IT.Particles.draw(R, 0);
      IT.FX.ground(R);
      IT.TowerDraw.ground(R);
      tFx += performance.now() - tm;

      // y-sorted pass: units, trees, tall fx
      items.length = 0;
      for (const e of w.ents) {
        if (e.dead || !IT.UnitDraw.isUnit(e) || !IT.UnitDraw.visible(R, e)) continue;
        R.interp(e);
        push(R.iy / P - R.camY, drawUnit, e);
      }
      for (const e of w.ents) {      // towers: buildings, always visible once on the map
        if (e.dead || e.kind !== 'tower') continue;
        R.interp(e);
        const sx = R.ix / P - R.camX, sy = R.iy / P - R.camY;
        push(sy, drawTower, { e, sx, sy });
      }
      const sts = w.map.structures;      // static buildings (barracks, fort, fillers, fountain, shops, outposts)
      for (let i = 0; i < sts.length; i++) {
        const s = sts[i], sx = s.x / P - R.camX, sy = s.y / P - R.camY;
        if (sx < -50 || sx > VW + 50 || sy < -40 || sy > VH + 90) continue;
        push(sy, drawStruct, { s, sx, sy });
      }
      drawTreesInto(R.camX, R.camY);
      tm = performance.now();
      IT.FX.sorted(R, push);
      tFx += performance.now() - tm;
      items.sort((a, b) => a.y - b.y);
      for (let i = 0; i < items.length; i++) { const it = items[i]; it.fn(it.a, R); }
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
        const ok = comp.present(comp.scene, light, glowCv, R.camX, R.camY, !document.body.classList.contains('nobloom'));
        tComp = performance.now() - tc;
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

  IT.Render = { create, MM_W, MM_H };
})(typeof window !== 'undefined' ? window : globalThis);
