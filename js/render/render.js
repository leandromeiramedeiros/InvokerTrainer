// Render orchestrator: layers, interpolation, lighting, bloom, minimap. Reads sim state only.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const PX = IT.Pixel;

  const MM_W = 90, MM_H = 50;

  function create(w, cv, glowCv, cam) {
    const GM = IT.GAME, P = GM.UNIT_PX, VW = GM.VIEW_W, VH = GM.VIEW_H;
    const cx = cv.getContext('2d'), gx = glowCv.getContext('2d');
    cx.imageSmoothingEnabled = false;
    const ter = IT.Terrain.build(w.map);
    const fog = IT.Fog.create(w.map);
    const light = IT.Light.create(VW, VH);
    IT.Particles.init(VW, VH);
    const prev = new Map();
    const MMX = VW - MM_W - 3, MMY = VH - MM_H - 3;

    // minimap layers
    const mmBase = document.createElement('canvas'); mmBase.width = MM_W; mmBase.height = MM_H;
    {
      const c = mmBase.getContext('2d'), img = c.createImageData(MM_W, MM_H), m = ter.mini;
      for (let i = 0; i < MM_W * MM_H; i++) { img.data[i * 4] = m.rgb[i * 3]; img.data[i * 4 + 1] = m.rgb[i * 3 + 1]; img.data[i * 4 + 2] = m.rgb[i * 3 + 2]; img.data[i * 4 + 3] = 255; }
      c.putImageData(img, 0, 0);
    }
    const mmFog = document.createElement('canvas'); mmFog.width = MM_W; mmFog.height = MM_H;
    const mmFogC = mmFog.getContext('2d'), mmImg = mmFogC.createImageData(MM_W, MM_H);
    let mmTick = 0;

    const R = {
      cx, w, P, VW, VH, camX: 0, camY: 0, time: 0, simT: 0, alpha: 1, fog, ter, light,
      ix: 0, iy: 0, iz: 0, shakeAmp: 0, shakeEnd: 0, shakeT: 0,
      stats: { ms: 0, avg: 0, max: 0, lights: 0, parts: 0, items: 0, frames: 0 },
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
        if (mx < MMX || my < MMY || mx >= MMX + MM_W || my >= MMY + MM_H) return null;
        return { x: (mx - MMX) / MM_W * w.map.W, y: (my - MMY) / MM_H * w.map.H };
      },
    };
    IT.FX.init(R);

    const items = [];
    function push(y, fn, a) { items.push({ y, fn, a }); }
    const drawUnit = (e) => IT.UnitDraw.draw(R, e);

    function drawTreesInto(camX, camY) {
      const T = ter.T, map = w.map;
      const ty0 = Math.max(0, Math.floor(camY / T) - 1), ty1 = Math.min(map.h - 1, Math.floor((camY + VH) / T) + 4);
      const tx0 = camX - 12, tx1 = camX + VW + 12;
      for (let ty = ty0; ty <= ty1; ty++) {
        const row = ter.treeRows[ty];
        for (let i = 0; i < row.length; i++) {
          const t = row[i];
          if (t.x < tx0 || t.x > tx1) continue;
          const sy = t.y - camY;
          if (sy < -4 || sy - IT.Terrain.TAY > VH) continue;
          push(sy, drawTree, t);
        }
      }
    }
    function drawTree(t) {
      cx.drawImage(ter.spr[t.p][t.s], t.x - R.camX - IT.Terrain.TAX, t.y - R.camY - IT.Terrain.TAY);
    }

    function minimap() {
      cx.fillStyle = '#000'; cx.fillRect(MMX - 1, MMY - 1, MM_W + 2, MM_H + 2);
      cx.drawImage(mmBase, MMX, MMY);
      const fogOn = w.fog !== false, W = w.map.w;
      if (fogOn) {
        if ((mmTick++ % 6) === 0) {
          const u = new Uint32Array(mmImg.data.buffer), cur = fog.cur;
          for (let y = 0; y < MM_H; y++) for (let x = 0; x < MM_W; x++) {
            const i = (y * 2) * W + x * 2, f = (cur[i] + cur[i + 1] + cur[i + W] + cur[i + W + 1]) * 0.25;
            const a = f >= 2 ? 0 : f >= 1 ? (2 - f) * 90 : 90 + (1 - f) * 150;
            u[y * MM_W + x] = (Math.round(a) << 24) | 0x100804;
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
      const fogOn = w.fog !== false;
      fog.update(w, R.fogSnap ? 1 : dtReal, R.camX, R.camY, VW, VH);
      IT.Particles.update(dtReal);
      IT.FX.update(R, dtReal);
      gx.globalCompositeOperation = 'source-over'; gx.clearRect(0, 0, VW, VH); gx.globalCompositeOperation = 'lighter';
      light.begin();

      IT.Terrain.draw(R, ter);
      IT.Particles.draw(R, 0);
      IT.FX.ground(R);

      // y-sorted pass: units, trees, tall fx
      items.length = 0;
      for (const e of w.ents) {
        if (e.dead || !IT.UnitDraw.isUnit(e) || !IT.UnitDraw.visible(R, e)) continue;
        R.interp(e);
        push(R.iy / P - R.camY, drawUnit, e);
      }
      drawTreesInto(R.camX, R.camY);
      IT.FX.sorted(R, push);
      items.sort((a, b) => a.y - b.y);
      for (let i = 0; i < items.length; i++) { const it = items[i]; it.fn(it.a, R); }
      R.stats.items = items.length;

      // keep the hero readable behind canopies
      const h = w.hero;
      if (h && !h.dead) {
        R.interp(h);
        const hx = R.ix / P, hy = R.iy / P;
        let behind = false;
        for (const it of items) if (it.fn === drawTree && it.a.y > hy && it.a.y < hy + 22 && Math.abs(it.a.x - hx) < 11) { behind = true; break; }
        if (behind) { cx.globalAlpha = 0.4; IT.UnitDraw.draw(R, h); cx.globalAlpha = 1; }
      }

      IT.FX.air(R);
      IT.Particles.draw(R, 1);

      // lighting
      for (const e of w.ents) if (!e.dead && IT.UnitDraw.isUnit(e) && IT.UnitDraw.visible(R, e)) IT.UnitDraw.lights(R, e);
      IT.FX.lights(R);
      light.compose(R.camX, R.camY, fog, fogOn);
      cx.globalCompositeOperation = 'multiply';
      cx.drawImage(light.canvas, 0, 0);
      cx.globalCompositeOperation = 'source-over';

      // HUD layer
      for (const e of w.ents) if (!e.dead && IT.UnitDraw.isUnit(e) && IT.UnitDraw.visible(R, e)) IT.UnitDraw.hud(R, e);
      IT.FX.hud(R);
      minimap();
      IT.UnitDraw.cleanup(w);
      gx.globalAlpha = 1;

      const ms = performance.now() - t0, S = R.stats;
      S.ms = ms; S.avg = S.avg ? S.avg * 0.95 + ms * 0.05 : ms; if (ms > S.max) S.max = ms; S.frames++;
      S.lights = light.count; S.parts = IT.Particles.live;
    };
    return R;
  }

  IT.Render = { create, MM_W, MM_H };
})(typeof window !== 'undefined' ? window : globalThis);
