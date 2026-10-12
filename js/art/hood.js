// Invoker HUD hood emblem (Dota layout) as shared pixel art: three orb sockets (Wex top, Quas left, Exort right) on a steel frame,
// Scepter = teardrop gem, Shard = gem trio below. Unowned: dark gems + muted orbs. Owned: the gem lights in the orb colour.
// Extracted from js/ui/hud.js so the loadout picker draws the SAME hood (hud.js can switch to these helpers; the constants are identical).
//   IT.Hood.layer('base') / ('scepter', orb) / ('shard', orb) -> cached W x H canvas (draw it at 0,0)
//   IT.Hood.Sand(canvas, { floor }) -> grain engine: setEmitters / burst / step(dt) / draw(); grains fall, pool on the floor, drain away.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const W = 34, H = 38;
  const ORB = { wex: [17, 5.5], quas: [5.5, 14.5], exort: [28.5, 14.5] }, OR = 5.2;
  const PAL = {   // e edge, m body, h highlight, glow halo, orb socket ramp [dark, mid, light]
    quas: { e: '#0e4c9a', m: '#2fa8ff', h: '#d8f6ff', glow: '#2fb4ff', orb: [[8, 40, 84], [42, 150, 230], [190, 240, 255]] },
    wex: { e: '#6a1aa8', m: '#cf48ff', h: '#ffe0ff', glow: '#c040ff', orb: [[56, 14, 84], [186, 70, 236], [255, 214, 255]] },
    exort: { e: '#a8400a', m: '#ff9a28', h: '#fff0b8', glow: '#ff8a1a', orb: [[84, 30, 6], [226, 132, 32], [255, 230, 150]] },
  };
  const SHARD_ORB = { ghostwalk: 'quas', emp: 'wex', sunstrike: 'exort' };   // shard spell -> the orb colour it lights
  const ORB_SHARD = { quas: 'ghostwalk', wex: 'emp', exort: 'sunstrike' };
  const STEEL = ['#0c1016', '#252e38', '#4a5866', '#7d8fa0'];
  const hhash = (x, y, s) => { let n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const rgb = c => 'rgb(' + c.map(v => Math.max(0, Math.min(255, v | 0))).join(',') + ')';
  const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  // teardrop (scepter): pointed top, round bottom. pixel list [x, y, edge, hl]
  const DROP = (() => {
    const px = [], inside = (x, y) => { const cy = 19.5, r = 4.6; if (y >= cy) return Math.hypot(x - 17, y - cy) <= r; const k = (y - 10.5) / (cy - 10.5); return k >= 0 && Math.abs(x - 17) <= r * Math.pow(k, 0.6); };
    for (let y = 10; y < 26; y++) for (let x = 10; x < 24; x++) {
      if (!inside(x + .5, y + .5)) continue;
      const edge = !(inside(x - .5, y + .5) && inside(x + 1.5, y + .5) && inside(x + .5, y - .5) && inside(x + .5, y + 1.5));
      px.push([x, y, edge, !edge && (x === 16 || (x === 15 && y > 17 && y < 21)) && y > 13 && y < 22]);
    }
    return px;
  })();
  // shard trio: shield in the middle, two round side gems
  const SHARD = (() => {
    const px = [], add = (inside, x0, x1, y0, y1, hx) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (!inside(x + .5, y + .5)) continue;
        const edge = !(inside(x - .5, y + .5) && inside(x + 1.5, y + .5) && inside(x + .5, y - .5) && inside(x + .5, y + 1.5));
        px.push([x, y, edge, !edge && hx(x, y)]);
      }
    };
    add((x, y) => y >= 30 && y <= 37 && Math.abs(x - 17) <= (y < 34 ? 3.2 : 3.2 - (y - 34) * 0.95), 13, 21, 29, 37, (x, y) => x === 16 && y < 34);
    for (const gx of [10.5, 23.5]) add((x, y) => Math.hypot(x - gx, y - 31.5) <= 2.6, gx - 3 | 0, gx + 3 | 0, 28, 35, (x, y) => x === (gx | 0) - 1 && y === 30);
    return px;
  })();
  function paintGem(cx, px, pal) {   // pal null = unlit (dark)
    for (const [x, y, edge, hl] of px) {
      cx.fillStyle = !pal ? (edge ? '#07060c' : (x < 17 ? '#2a2236' : '#1a1524')) : edge ? pal.e : hl ? pal.h : pal.m;
      cx.fillRect(x, y, 1, 1);
    }
    if (!pal && px === DROP) { cx.fillStyle = '#3a3248'; cx.fillRect(15, 15, 1, 3); }   // dark gem sheen
  }
  function paintOrb(cx, name, lit) {   // swirly orb in a steel socket ring
    const [ox, oy] = ORB[name], O = PAL[name].orb, seed = name.length * 7;
    for (let y = Math.floor(oy - OR - 1); y <= oy + OR + 1; y++) for (let x = Math.floor(ox - OR - 1); x <= ox + OR + 1; x++) {
      const d = Math.hypot(x + .5 - ox, y + .5 - oy);
      if (d > OR + 1) continue;
      if (d > OR) { cx.fillStyle = d > OR + .55 ? STEEL[0] : (y < oy ? STEEL[3] : STEEL[2]); cx.fillRect(x, y, 1, 1); continue; }
      const a = Math.atan2(y + .5 - oy, x + .5 - ox), sw = Math.sin(a * 2 + d * 1.3) * 0.5 + 0.5;   // swirl
      const k = (1 - d / OR) * 0.75 + sw * 0.25 + (hhash(x, y, seed) - 0.5) * 0.25 - ((x - ox) + (y - oy)) * 0.025;
      let c = k < 0.45 ? lerp3(O[0], O[1], k / 0.45) : lerp3(O[1], O[2], Math.min(1, (k - 0.45) / 0.55));
      if (!lit) c = lerp3(c, [26, 30, 38], 0.5);
      cx.fillStyle = rgb(c); cx.fillRect(x, y, 1, 1);
    }
  }
  function paintFrame(cx) {
    const P = (x, y, c) => { cx.fillStyle = c; cx.fillRect(x, y, 1, 1); };
    // top bracket: bar under the Wex orb reaching the side orbs, slanted ends
    for (let x = 7; x <= 26; x++) { P(x, 9, STEEL[3]); P(x, 10, STEEL[2]); P(x, 11, STEEL[1]); }
    for (let i = 0; i < 3; i++) { P(6 - i, 10 + i, STEEL[2]); P(27 + i, 10 + i, STEEL[2]); }
    // V brace from the bar down to the gem
    for (let i = 0; i < 6; i++) { P(9 + i, 12 + i, STEEL[2]); P(10 + i, 12 + i, STEEL[1]); P(24 - i, 12 + i, STEEL[2]); P(23 - i, 12 + i, STEEL[1]); }
    // filigree under the teardrop: stem + curled wings
    for (let y = 24; y <= 29; y++) { P(16, y, STEEL[3]); P(17, y, STEEL[2]); }
    const wing = [[15, 25], [14, 25], [13, 24], [12, 24], [11, 23], [10, 23], [10, 22], [11, 21], [13, 26], [12, 27], [11, 27], [10, 26], [14, 27], [15, 28], [9, 24], [8, 23]];
    for (const [x, y] of wing) { P(x, y, STEEL[2]); P(33 - x, y, STEEL[2]); }
    for (const [x, y] of [[13, 24], [11, 23], [12, 27]]) { P(x, y - 1, STEEL[3]); P(33 - x, y - 1, STEEL[3]); }
    P(16, 23, STEEL[3]); P(17, 23, STEEL[3]);
  }
  const cache = {};
  // base: frame + unlit orbs + dark gems; 'scepter' / 'shard': just the lit gem (+ its lit orb) on a transparent layer, in the colour of orb `name`
  function layer(kind, name) {
    const key = kind + ':' + (name || '');
    if (cache[key]) return cache[key];
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const cx = c.getContext('2d');
    if (kind === 'base') {
      paintFrame(cx);
      for (const n of ['quas', 'wex', 'exort']) paintOrb(cx, n, false);
      paintGem(cx, DROP, null); paintGem(cx, SHARD, null);
    } else if (PAL[name]) {
      paintGem(cx, kind === 'scepter' ? DROP : SHARD, PAL[name]);
      paintOrb(cx, name, true);
    }
    return (cache[key] = c);
  }

  // ---- sand: grains fall (gravity), land on the floor and pile up (angle of repose), the pile slowly drains. Grid units = canvas pixels.
  // A burst grain with its own `floor` just rests there and fades instead (screen-sized fx canvases).
  function Sand(cv, o) {
    o = o || {};
    const Wc = cv.width, floor = o.floor != null ? o.floor : cv.height, G0 = o.gravity || 70, MAXP = o.max || 90, PILE = o.pile || 5;
    const ps = [], pile = [], em = [];
    for (let x = 0; x < Wc; x++) pile.push([]);
    let drain = 0;
    const pileN = () => { let n = 0; for (const c of pile) n += c.length; return n; };
    const land = p => {
      let x = Math.max(0, Math.min(Wc - 1, p.x | 0));
      for (let i = 0; i < 6; i++) {
        const h = pile[x].length, hl = x > 0 ? pile[x - 1].length : 1e9, hr = x < Wc - 1 ? pile[x + 1].length : 1e9;
        if (hl < h - 1 && hl <= hr) x--; else if (hr < h - 1) x++; else break;
      }
      if (pile[x].length < PILE) pile[x].push(p.c);
    };
    const api = {
      setEmitters(list) { em.length = 0; for (const e of list || []) em.push(Object.assign({ acc: 0 }, e)); },   // { x0, x1, y, pal, rate, vx }
      burst(x, y, n, cols, opt) {
        opt = opt || {};
        for (let i = 0; i < n && ps.length < MAXP * 3; i++) {
          const a = Math.random() * Math.PI * 2, v = (opt.speed || 14) * (0.35 + Math.random());
          ps.push({ x: x + (Math.random() - 0.5) * (opt.spread || 3), y: y + (Math.random() - 0.5) * (opt.spread || 3), vx: Math.cos(a) * v, vy: Math.sin(a) * v - (opt.lift || 8), c: cols[(Math.random() * cols.length) | 0], floor: opt.floor, life: 0, max: opt.floor != null ? 1.3 + Math.random() * 0.8 : 99 });
        }
      },
      live() { return ps.length > 0 || em.length > 0 || pileN() > 0; },
      step(dt) {
        dt = Math.min(dt, 0.05);
        for (const e of em) {
          e.acc += dt * e.rate;
          while (e.acc >= 1 && ps.length < MAXP) {
            e.acc -= 1;
            ps.push({ x: e.x0 + Math.random() * (e.x1 - e.x0), y: e.y + Math.random() * 2, vx: (Math.random() - 0.5) * (e.vx || 6), vy: -1 - Math.random() * 4, c: Math.random() < 0.4 ? e.pal.h : e.pal.m, life: 0, max: 99 });
          }
          if (e.acc > 1) e.acc = 1;
        }
        for (let i = ps.length - 1; i >= 0; i--) {
          const p = ps[i];
          p.vy += G0 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.floor != null) {   // rest on the burst's own floor, then fade
            if (p.y >= p.floor) { p.y = p.floor; p.vy = 0; p.vx *= 0.4; }
            p.life += dt; if (p.life >= p.max) ps.splice(i, 1);
          } else if (p.y >= floor - 1 - (pile[Math.max(0, Math.min(Wc - 1, p.x | 0))] || []).length) { land(p); ps.splice(i, 1); }
          else if (p.x < -2 || p.x > Wc + 2) ps.splice(i, 1);
        }
        drain += dt * (em.length ? 5 : 11);   // the pile thins out; faster once nothing feeds it
        while (drain >= 1) {
          drain -= 1;
          const nz = []; for (let x = 0; x < Wc; x++) if (pile[x].length) nz.push(x);
          if (!nz.length) { drain = 0; break; }
          pile[nz[(Math.random() * nz.length) | 0]].pop();
        }
      },
      draw() {
        const cx = cv.getContext('2d');
        cx.clearRect(0, 0, cv.width, cv.height);
        for (let x = 0; x < Wc; x++) for (let k = 0; k < pile[x].length; k++) { cx.fillStyle = pile[x][k]; cx.fillRect(x, floor - 1 - k, 1, 1); }
        for (const p of ps) { cx.globalAlpha = p.floor != null ? Math.max(0, Math.min(1, (p.max - p.life) * 2)) : 0.95; cx.fillStyle = p.c; cx.fillRect(p.x | 0, p.y | 0, 1, 1); }
        cx.globalAlpha = 1;
      },
    };
    return api;
  }

  IT.Hood = { W, H, ORB, OR, PAL, SHARD_ORB, ORB_SHARD, layer, paintGem, paintOrb, paintFrame, DROP, SHARD, Sand };
})(typeof window !== 'undefined' ? window : globalThis);
