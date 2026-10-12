// Lightmap (4px cells, additive point lights over a night ambient) + fog, bilinear-upscaled and Bayer-quantised,
// then multiplied over the scene.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const PX = IT.Pixel;
  const CELL = 4, LW = 120, LH = 68, LEVELS = 9;
  // v6: bright, near-neutral daylight inside vision (was a blue night ambient 0.30/0.37/0.60); outside vision keeps the old dark level
  const AMB = [0.86, 0.88, 0.90];
  const OUTV = [0.114, 0.141, 0.228];   // explored but not in vision (= old AMB * 0.38): very dark, terrain still readable
  const DARK = 0.015;
  const LK = 0.55;        // point lights scaled down over the brighter ambient so glows read without blowing the area out

  function create(VW, VH) {
    const LW = Math.ceil(VW / CELL), LH = Math.ceil(VH / CELL);   // grid follows the view size (zoom)
    const cv = document.createElement('canvas'); cv.width = VW; cv.height = VH;
    const cx = cv.getContext('2d'), img = cx.createImageData(VW, VH), u32 = new Uint32Array(img.data.buffer);
    const lr = new Float32Array(LW * LH), lg = new Float32Array(LW * LH), lb = new Float32Array(LW * LH);
    const cr = new Float32Array(LW), cg = new Float32Array(LW), cb = new Float32Array(LW);
    const xi0 = new Int32Array(VW), xi1 = new Int32Array(VW), xw = new Float32Array(VW);
    for (let x = 0; x < VW; x++) {
      const g = (x + 0.5) / CELL - 0.5, i = Math.floor(g);
      xi0[x] = Math.max(0, i); xi1[x] = Math.min(LW - 1, i + 1); xw[x] = Math.max(0, g - i);
    }
    let lights = 0;
    const L = {
      canvas: cv,
      buf: { lr, lg, lb, w: LW, h: LH },   // raw light grid (sand.js adds emissive cells)
      begin() {
        for (let i = 0; i < LW * LH; i++) { lr[i] = AMB[0]; lg[i] = AMB[1]; lb[i] = AMB[2]; }
        lights = 0;
      },
      // screen-space light: sx,sy px, radius px, rgb 0..255 array, intensity
      add(sx, sy, r, rgb, inten) {
        if (sx + r < 0 || sy + r < 0 || sx - r > VW || sy - r > VH) return;
        lights++;
        const x0 = Math.max(0, Math.floor((sx - r) / CELL)), x1 = Math.min(LW - 1, Math.floor((sx + r) / CELL));
        const y0 = Math.max(0, Math.floor((sy - r) / CELL)), y1 = Math.min(LH - 1, Math.floor((sy + r) / CELL));
        const r2 = r * r, ir = 1 / r, R = rgb[0] / 255 * inten * LK, Gc = rgb[1] / 255 * inten * LK, B = rgb[2] / 255 * inten * LK;
        for (let cy = y0; cy <= y1; cy++) {
          const dy = cy * CELL + 2 - sy;
          for (let cxx = x0; cxx <= x1; cxx++) {
            const dx = cxx * CELL + 2 - sx, d2 = dx * dx + dy * dy;
            if (d2 >= r2) continue;
            const f = 1 - Math.sqrt(d2) * ir, a = f * f, i = cy * LW + cxx;
            lr[i] += R * a; lg[i] += Gc * a; lb[i] += B * a;
          }
        }
      },
      get count() { return lights; },
      // clamp + fold fog into the LWxLH grid (120x68 at zoom 1) (shared by the CPU compose and the GL compositor)
      fold(camX, camY, fog, fogOn) {
        for (let cy = 0; cy < LH; cy++) for (let cxx = 0; cxx < LW; cxx++) {
          const i = cy * LW + cxx;
          let r = lr[i], g = lg[i], b = lb[i];
          if (r > 1.25) r = 1.25; if (g > 1.25) g = 1.25; if (b > 1.25) b = 1.25;
          if (fogOn) {
            const f = fog.sample(camX + cxx * CELL + 2, camY + cy * CELL + 2);
            if (f < 2) {
              if (f >= 1) {
                const t = f - 1;
                r = OUTV[0] + (r - OUTV[0]) * t; g = OUTV[1] + (g - OUTV[1]) * t; b = OUTV[2] + (b - OUTV[2]) * t;
              } else {
                r = DARK + (OUTV[0] - DARK) * f; g = DARK + (OUTV[1] - DARK) * f; b = DARK * 1.4 + (OUTV[2] - DARK * 1.4) * f;
              }
            }
          }
          lr[i] = r; lg[i] = g; lb[i] = b;
        }
      },
      // RGBA8 export for the GL compositor: value / 1.25 (grid is clamped to 1.25 by fold)
      pack(u8) {
        const k = 255 / 1.25;
        for (let i = 0, j = 0; i < LW * LH; i++, j += 4) {
          u8[j] = lr[i] * k; u8[j + 1] = lg[i] * k; u8[j + 2] = lb[i] * k; u8[j + 3] = 255;   // pass a Uint8ClampedArray
        }
      },
      compose(camX, camY, fog, fogOn) {
        L.fold(camX, camY, fog, fogOn);
        const LV = LEVELS;
        for (let y = 0; y < VH; y++) {
          const g = (y + 0.5) / CELL - 0.5, j = Math.floor(g), j0 = Math.max(0, j) * LW, j1 = Math.min(LH - 1, j + 1) * LW, wy = Math.max(0, g - j), wy1 = 1 - wy;
          for (let c = 0; c < LW; c++) {
            cr[c] = lr[j0 + c] * wy1 + lr[j1 + c] * wy;
            cg[c] = lg[j0 + c] * wy1 + lg[j1 + c] * wy;
            cb[c] = lb[j0 + c] * wy1 + lb[j1 + c] * wy;
          }
          const row = y * VW, by = ((y + camY) & 3) << 2;
          for (let x = 0; x < VW; x++) {
            const a = xi0[x], b = xi1[x], w1 = xw[x], w0 = 1 - w1;
            const bay = PX.BAYER4[by | ((x + camX) & 3)];
            let r = Math.floor((cr[a] * w0 + cr[b] * w1) * LV + bay) / LV;
            let g2 = Math.floor((cg[a] * w0 + cg[b] * w1) * LV + bay) / LV;
            let bl = Math.floor((cb[a] * w0 + cb[b] * w1) * LV + bay) / LV;
            r = r > 1 ? 255 : r < 0 ? 0 : (r * 255) | 0;
            g2 = g2 > 1 ? 255 : g2 < 0 ? 0 : (g2 * 255) | 0;
            bl = bl > 1 ? 255 : bl < 0 ? 0 : (bl * 255) | 0;
            u32[row + x] = (0xff000000 | (bl << 16) | (g2 << 8) | r) >>> 0;
          }
        }
        cx.putImageData(img, 0, 0);
      },
    };
    return L;
  }

  IT.Light = { create, AMB, OUTV, LW, LH, LEVELS, SCALE: 1.25 };
})(typeof window !== 'undefined' ? window : globalThis);
