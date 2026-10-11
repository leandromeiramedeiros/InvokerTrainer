// Per-pixel particles with height: fly, fall, settle as grains that cool and dither away. Capped ring buffer.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const PX = IT.Pixel;
  const CAP = 2200, GRAV = 190;
  const x = new Float32Array(CAP), y = new Float32Array(CAP), z = new Float32Array(CAP);
  const vx = new Float32Array(CAP), vy = new Float32Array(CAP), vz = new Float32Array(CAP);
  const age = new Float32Array(CAP), life = new Float32Array(CAP), rest = new Float32Array(CAP), c0 = new Float32Array(CAP);
  const ramp = new Uint8Array(CAP), st = new Uint8Array(CAP);   // st: 0 free, 1 air, 2 settled
  const RAMP_ID = Object.keys(PX.RAMPS).filter(k => k.endsWith('U')).map(k => k.slice(0, -1));
  const RAMP_U = RAMP_ID.map(k => PX.RAMPS[k + 'U']);
  const rampIdx = n => Math.max(0, RAMP_ID.indexOf(n));
  let head = 0, live = 0;

  let layers = null;
  function mkLayer(VW, VH) {
    const cv = document.createElement('canvas'); cv.width = VW; cv.height = VH;
    const c = cv.getContext('2d'), img = c.createImageData(VW, VH);
    return { cv, c, img, u: new Uint32Array(img.data.buffer) };
  }
  function init(VW, VH) { layers = [mkLayer(VW, VH), mkLayer(VW, VH)]; }

  const P = () => IT.GAME.UNIT_PX;
  // opts: x,y world units; z world units; n; ramp; speed px/s; up px/s; spread world-unit radius; life s airborne cap; rest s on ground
  function emit(o) {
    const n = o.n || 8, p = P(), ri = rampIdx(o.ramp || 'fire');
    const sp = o.speed == null ? 40 : o.speed, up = o.up == null ? 60 : o.up, spread = (o.spread || 0) / p;
    const ang0 = o.dir == null ? 0 : o.dir, arc = o.dir == null ? 6.2832 : (o.arc == null ? 0.6 : o.arc);
    for (let k = 0; k < n; k++) {
      const i = head; head = (head + 1) % CAP;
      if (st[i] === 0) live++;
      const a = ang0 + (Math.random() - 0.5) * arc + (o.dir == null ? Math.random() * 6.2832 : 0), s = sp * (0.3 + Math.random() * 0.9);
      const rr = spread * Math.sqrt(Math.random()), ra = Math.random() * 6.2832;
      x[i] = o.x / p + Math.cos(ra) * rr; y[i] = o.y / p + Math.sin(ra) * rr; z[i] = (o.z || 0) / p + Math.random() * (o.zr || 0);
      vx[i] = Math.cos(a) * s + (o.vx || 0); vy[i] = Math.sin(a) * s * 0.7 + (o.vy || 0); vz[i] = up * (0.4 + Math.random() * 0.9);
      age[i] = 0; life[i] = (o.life || 1.2) * (0.6 + Math.random() * 0.8); rest[i] = (o.rest == null ? 3.5 : o.rest) * (0.6 + Math.random() * 0.8);
      c0[i] = Math.random() * 2; ramp[i] = ri; st[i] = 1;
      if (o.settle === false) { rest[i] = 0.01; }
    }
  }

  function update(dt) {
    for (let i = 0; i < CAP; i++) {
      const s = st[i]; if (!s) continue;
      if (s === 1) {
        age[i] += dt;
        x[i] += vx[i] * dt; y[i] += vy[i] * dt; z[i] += vz[i] * dt;
        vz[i] -= GRAV * dt; vx[i] *= 1 - 1.2 * dt; vy[i] *= 1 - 1.2 * dt;
        if (z[i] <= 0) {
          z[i] = 0;
          if (vz[i] < -50 && age[i] < 3) { vz[i] = -vz[i] * 0.25; vx[i] *= 0.5; vy[i] *= 0.5; }
          else { st[i] = 2; age[i] = 0; }
        } else if (age[i] > life[i] * 3) { st[i] = 2; z[i] = 0; age[i] = 0; }
      } else {
        age[i] += dt;
        if (age[i] >= rest[i]) { st[i] = 0; live--; }
      }
    }
  }

  // layer 0: settled grains (below units), layer 1: airborne
  function draw(R, layer) {
    const L = layers[layer], u = L.u, VW = R.VW, VH = R.VH, cx = R.camX, cy = R.camY;
    u.fill(0);
    let any = false;
    for (let i = 0; i < CAP; i++) {
      const s = st[i]; if (!s || (s === 2) !== (layer === 0)) continue;
      const sx = Math.round(x[i]) - cx, sy = Math.round(y[i] - z[i]) - cy;
      if (sx < 0 || sy < 0 || sx >= VW || sy >= VH) continue;
      const pal = RAMP_U[ramp[i]];
      let col;
      if (s === 1) {
        const t = age[i] / (life[i] * 1.5);
        col = pal[Math.min(5, (c0[i] + t * (4 - c0[i])) | 0)];
      } else {
        const t = age[i] / rest[i];
        if (t > 0.55 && PX.bayer(sx + cx, sy + cy) < (t - 0.55) / 0.45) continue;   // dither away
        col = pal[Math.min(5, (c0[i] + 1 + t * (5 - c0[i])) | 0)];
      }
      u[sy * VW + sx] = col; any = true;
    }
    if (!any) return;
    L.c.putImageData(L.img, 0, 0);
    R.cx.drawImage(L.cv, 0, 0);
  }

  IT.Particles = { init, emit, update, draw, get live() { return live; }, CAP };
})(typeof window !== 'undefined' ? window : globalThis);
