// Effects: thinkers/projectiles by ability/fx, one-shot fx events, damage numbers, pings, waypoints, telegraphs, markers.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const PX = IT.Pixel;
  const TAU = Math.PI * 2;

  let fxs = [];               // one-shots
  const tele = new Map();     // unit id -> { t0, dur, kind }
  const trail = new Map();    // entity id -> accumulated emit time
  const texts = [];
  const DMG_COL = { physical: '#ff6a58', magical: '#5aaaff', pure: '#ffd84a' };

  const pxs = (R, wx) => wx / R.P - R.camX;
  const pys = (R, wy) => wy / R.P - R.camY;
  const lit = (R, x, y) => { const f = R.fog; return !f || R.w.fog === false || f.levelAt(x, y) > 1.5; };
  const clamp = IT.U.clamp;

  // ring with ordered-dither alpha (a 0..1)
  function dring(R, x, y, r, color, a, dots) {
    if (a <= 0.02 || r < 0.5) return;
    const cx = R.cx, n = dots || Math.max(10, Math.round(TAU * r * 1.2));
    cx.fillStyle = color;
    let lx = 1e9, ly = 1e9;
    for (let i = 0; i < n; i++) {
      const ang = i / n * TAU, px = Math.round(x + Math.cos(ang) * r), py = Math.round(y + Math.sin(ang) * r);
      if (px === lx && py === ly) continue;
      lx = px; ly = py;
      if (a < 1 && PX.bayer(px + R.camX, py + R.camY) > a) continue;
      cx.fillRect(px, py, 1, 1);
    }
  }
  function ddisc(R, x, y, r, color, a) {
    const cx = R.cx; cx.fillStyle = color;
    const ri = Math.ceil(r);
    for (let dy = -ri; dy <= ri; dy++) {
      const hw = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
      for (let dx = -hw; dx <= hw; dx++) {
        const px = Math.round(x) + dx, py = Math.round(y) + dy;
        if (a < 1 && PX.bayer(px + R.camX, py + R.camY) > a) continue;
        cx.fillRect(px, py, 1, 1);
      }
    }
  }

  function spellRgb(e) {
    const key = e.ability || e.fx;
    const orbs = IT.GAME.SPELL_ORBS[key];
    if (orbs) return PX.mixOrbs(orbs);
    if (typeof e.color === 'string' && e.color[0] === '#') return PX.rgb(e.color);
    return [255, 255, 255];
  }
  const rgbHex = c => PX.hex(c[0], c[1], c[2]);

  // ---------- event hooks ----------
  function addFx(o) { o.t0 = o.t0 == null ? R_.time : o.t0; fxs.push(o); if (fxs.length > 200) fxs.shift(); return o; }
  let R_ = null;

  function burst(x, y, ramp, n, o) {
    IT.Particles.emit(Object.assign({ x, y, n, ramp, speed: 55, up: 75, spread: 30, life: 0.8, rest: 4 }, o || {}));
  }
  function nameRamp(name) {
    if (/ice|cold|frost|snap|wall|quas/i.test(name)) return 'ice';
    if (/sun|fire|meteor|exort|blast|forge|spirit/i.test(name)) return 'fire';
    if (/emp|tornado|wex|bolt|blink|purple/i.test(name)) return 'purple';
    if (/heal|green|root/i.test(name)) return 'green';
    return 'white';
  }

  function onFx(p) {
    const name = p.name, x = p.x, y = p.y;
    if (IT.Sand && IT.Sand.event) IT.Sand.event(p);
    switch (name) {
      case 'sunstrikeBeam': break;
      case 'sunstrikeHit': {
        const r = p.r || 175;
        addFx({ k: 'pillar', x, y, r, dur: 0.55, ramp: 'fire' });
        addFx({ k: 'wave', x, y, r0: 0.2 * r, r1: 1.15 * r, dur: 0.4, color: '#ffd070' });
        addFx({ k: 'flash', x, y, r, dur: 0.3, color: '#ffb040' });
        burst(x, y, 'fire', 110, { spread: r * 0.8, speed: 70, up: 120, life: 0.9, rest: 5 });
        R_.shake(2.5, 0.25);
        break;
      }
      case 'coldsnapFreeze':
        addFx({ k: 'shards', x, y, dur: 0.7, ramp: 'ice' });
        addFx({ k: 'wave', x, y, r0: 20, r1: 120, dur: 0.3, color: '#bff4ff' });
        burst(x, y, 'ice', 36, { spread: 40, speed: 60, up: 90 });
        break;
      case 'respawn':
        addFx({ k: 'wave', x, y, r0: 20, r1: 110, dur: 0.5, color: '#c8a0ff' });
        burst(x, y, 'purple', 26, { spread: 50, up: 60 });
        break;
      case 'boltTelegraph': tele.set(p.unit, { t0: R_.time, dur: p.dur || 1.2, target: p.target }); break;
      case 'blinkTell': tele.set(p.unit, { t0: R_.time, dur: p.dur || 0.35, kind: 'blink' }); break;
      case 'boltHit':
        addFx({ k: 'wave', x, y, r0: 10, r1: 90, dur: 0.3, color: '#d8a8ff' });
        burst(x, y, 'purple', 30, { spread: 20, speed: 70, up: 90 });
        break;
      case 'boltBlocked':
        addFx({ k: 'wave', x, y, r0: 20, r1: 90, dur: 0.35, color: '#ffe080' });
        burst(x, y, 'gold', 22, { spread: 10, speed: 60, up: 70 });
        break;
      case 'boltDodged': burst(x, y, 'white', 8, { spread: 10, speed: 30, up: 40 }); break;
      case 'dodge': burst(x, y, 'dirt', 14, { spread: 20, speed: 40, up: 40, rest: 2.5 }); break;
      case 'spiritExpire': burst(x, y, 'fire', 24, { spread: 20, speed: 40, up: 60 }); break;
      case 'meteorLand': case 'meteorImpact': {
        const r = p.r || 175;
        addFx({ k: 'wave', x, y, r0: r * 0.2, r1: r * 1.1, dur: 0.4, color: '#ffb050' });
        addFx({ k: 'flash', x, y, r, dur: 0.3, color: '#ff8a30' });
        burst(x, y, 'fire', 80, { spread: r * 0.7, speed: 80, up: 110, life: 0.9, rest: 5 });
        burst(x, y, 'dirt', 30, { spread: r * 0.6, speed: 60, up: 90, rest: 3 });
        R_.shake(2, 0.25);
        break;
      }
      case 'empBlast': {
        const r = p.r || 675;
        addFx({ k: 'wave', x, y, r0: r * 0.3, r1: r, dur: 0.4, color: '#c8a0ff' });
        addFx({ k: 'flash', x, y, r, dur: 0.3, color: '#9a50ff' });
        burst(x, y, 'purple', 80, { spread: r * 0.8, speed: 60, up: 100 });
        break;
      }
      case 'deafeningHit': burst(x, y, 'ice', 12, { spread: 10, speed: 50, up: 60 }); break;
      case 'tornadoLift': case 'tornadoLand': burst(x, y, 'white', 12, { spread: 25, speed: 40, up: 50, rest: 2 }); break;
      case 'refresh': addFx({ k: 'wave', x, y, r0: 10, r1: 80, dur: 0.5, color: '#fff2a0' }); burst(x, y, 'gold', 30, { spread: 20, up: 100 }); break;
      case 'atosHit': case 'hexHit': case 'meltingStrike': burst(x, y, name === 'hexHit' ? 'green' : name === 'atosHit' ? 'ice' : 'fire', 20, { spread: 14, speed: 40, up: 60 }); break;
      case 'bkb': addFx({ k: 'wave', x, y, r0: 10, r1: 90, dur: 0.5, color: '#ffd24a' }); burst(x, y, 'gold', 30, { spread: 20, up: 80 }); break;
      case 'atosDodged': case 'hexBlocked': case 'atosBlocked': burst(x, y, 'white', 8, { spread: 10, speed: 30, up: 40 }); break;
      case 'cataclysm': addFx({ k: 'wave', x, y, r0: 20, r1: 300, dur: 0.6, color: '#ffd070' }); break;
      case 'blinkStart': case 'blinkEnd': break;
      case 'iceWallEnd': burst(x, y, 'ice', 40, { spread: 80, speed: 40, up: 60 }); break;
      case 'ghostBreak': case 'ghostWalk': case 'alacrity': case 'forgeSpirit': burst(x, y, name === 'alacrity' ? 'gold' : 'white', 14, { spread: 20, speed: 30, up: 60 }); break;
      default: break;     // sunstrikeBeam/iceWall/tornado*/meteorFall/empCharge/shivaBlast/... handled by thinker drawers
    }
  }

  function onDamage(p) {
    const w = R_.w, t = w.byId.get(p.target);
    if (!t || t.dead) return;
    const dealt = p.dealt || 0;
    if (t.team === 1 && w.fog !== false && !t.visible) return;
    const col = DMG_COL[p.dmgType] || '#fff';
    if (dealt >= 1) {
      for (let i = texts.length - 1; i >= 0; i--) {
        const q = texts[i];
        if (q.target === t.id && q.col === col && R_.time - q.t0 < 0.3) { q.val += dealt; q.t0 = R_.time - 0.05; return; }
      }
      texts.push({ target: t.id, col, val: dealt, t0: R_.time, dx: (Math.random() - 0.5) * 8, x: t.x, y: t.y });
      if (texts.length > 40) texts.shift();
    }
    const ramp = p.dmgType === 'magical' ? 'ice' : p.dmgType === 'pure' ? 'gold' : 'red';
    IT.Particles.emit({ x: t.x, y: t.y, z: 60, n: Math.min(14, 3 + (dealt / 25 | 0)), ramp, speed: 40, up: 50, spread: 14, life: 0.6, rest: 3 });
  }

  function onOrder(p) {
    const w = R_.w, o = p.order;
    if (!w.hero || p.unit !== w.hero.id || !o) return;
    if (o.type === 'move' && o.x != null) addFx({ k: 'ping', x: o.x, y: o.y, dur: 0.55, color: '#5dff7a' });
    else if (o.type === 'attack' && o.target != null) {
      const t = w.byId.get(o.target);
      if (t) addFx({ k: 'ping', x: t.x, y: t.y, dur: 0.55, color: '#ff5a4a', unit: t.id });
    }
  }

  function onBlink(p) {
    if (IT.Sand && IT.Sand.blink) IT.Sand.blink(p);
    addFx({ k: 'wave', x: p.fromX, y: p.fromY, r0: 90, r1: 10, dur: 0.3, color: '#b070ff' });
    burst(p.fromX, p.fromY, 'purple', 50, { spread: 30, speed: 40, up: 110, life: 0.7 });
    addFx({ k: 'wave', x: p.x, y: p.y, r0: 10, r1: 100, dur: 0.35, color: '#e0c0ff' });
    addFx({ k: 'flash', x: p.x, y: p.y, r: 100, dur: 0.25, color: '#b070ff' });
    burst(p.x, p.y, 'purple', 50, { spread: 20, speed: 60, up: 90, life: 0.7 });
    tele.delete(p.unit);
  }

  function init(R) {
    R_ = R;
    const w = R.w;
    w.on('fx', onFx); w.on('damage', onDamage); w.on('order', onOrder); w.on('blink', onBlink);
    w.on('bolt', p => { if (p.phase === 'cancel' || p.phase === 'hit' || p.phase === 'blocked') tele.delete(p.unit); });
  }

  // ---------- per-frame update ----------
  function update(R, dt) {
    const w = R.w, t = R.time;
    fxs = fxs.filter(f => t - f.t0 < f.dur);
    for (let i = texts.length - 1; i >= 0; i--) if (t - texts[i].t0 > 1.0) texts.splice(i, 1);
    for (const [id, tl] of tele) if (t - tl.t0 > tl.dur + 0.1) tele.delete(id);
    // trails
    for (const e of w.ents) {
      if (e.dead || (e.kind !== 'proj' && e.kind !== 'thinker')) continue;
      const key = e.fx || e.ability;
      let rate = 0, ramp = 'white', o = {};
      switch (key) {
        case 'bolt': rate = 50; ramp = 'purple'; o = { speed: 10, up: 20, life: 0.4, rest: 1.2, z: 20 }; break;
        case 'atos': rate = 40; ramp = 'ice'; o = { speed: 10, up: 25, life: 0.4, rest: 1.2, z: 20 }; break;
        case 'tornado': rate = 30; ramp = 'white'; o = { speed: 50, up: 60, spread: 70, life: 0.6, rest: 1.5 }; break;
        case 'chaosmeteor': if (e.landed) { rate = 90; ramp = 'fire'; o = { speed: 30, up: 80, spread: 60, life: 0.9, rest: 5 }; } break;
        case 'deafeningblast': rate = 40; ramp = 'ice'; o = { speed: 20, up: 40, spread: 90, life: 0.5, rest: 2 }; break;
        case 'emp': rate = 14; ramp = 'purple'; o = { speed: 20, up: 70, spread: (e.r || 100) * 0.6, life: 0.7, rest: 1.5 }; break;
        case 'meteorhammer': rate = 40; ramp = 'fire'; o = { speed: 20, up: 20, life: 0.5, rest: 2 }; break;
        case 'sunstrike': rate = 10; ramp = 'gold'; o = { speed: 10, up: 60, spread: (e.r || 100) * 0.9, life: 0.8, rest: 1.5 }; break;
        case 'icewall': rate = 5; ramp = 'ice'; o = { speed: 10, up: 20, spread: 80, life: 0.8, rest: 2 }; break;
        default: break;
      }
      if (!rate) continue;
      if (e.team === 1 && !lit(R, e.x, e.y)) continue;
      let acc = (trail.get(e.id) || 0) + dt * rate;
      const n = acc | 0; acc -= n; trail.set(e.id, acc);
      if (n > 0) IT.Particles.emit(Object.assign({ x: e.x, y: e.y, n, ramp }, o));
    }
    if (trail.size > 200) for (const id of trail.keys()) if (!w.byId.has(id)) trail.delete(id);
  }

  // ---------- lights ----------
  function lights(R) {
    const w = R.w;
    for (const e of w.ents) {
      if (e.dead || (e.kind !== 'proj' && e.kind !== 'thinker')) continue;
      if (e.team === 1 && !lit(R, e.x, e.y)) continue;
      R.interp(e);
      const sx = R.ix / R.P - R.camX, sy = R.iy / R.P - R.camY - R.iz / R.P;
      const c = spellRgb(e), key = e.fx || e.ability;
      let r = Math.min(80, Math.max(26, (e.r || e.radius || 60) / R.P * 1.1)), inten = 0.55;
      if (key === 'sunstrike') { const rem = e.danger ? e.danger.at - R.simT : 1; inten = 0.25 + 0.5 * clamp(1 - rem, 0, 1); }
      else if (key === 'bolt') { r = 30; inten = 0.8; }
      else if (key === 'attack') { r = 30; inten = 0.75; c[0] = 255; c[1] = 150; c[2] = 55; R.light(sx, sy - 9, r, c, inten); continue; }
      else if (key === 'chaosmeteor') { r = 80; inten = 0.9; }
      R.light(sx, sy - 6, r, c, inten);
      R.glow(sx, sy - 6, Math.min(r * 0.4, 18), rgbHex(c), 0.4);
    }
    for (const f of fxs) {
      const age = (R.time - f.t0) / f.dur, sx = pxs(R, f.x), sy = pys(R, f.y);
      if (f.k === 'flash' || f.k === 'pillar') {
        const r = Math.min(110, (f.r || 120) / R.P * 1.8);
        R.light(sx, sy, r, f.k === 'pillar' ? [255, 190, 90] : PX.rgb(f.color || '#ffffff'), 1.4 * (1 - age));
        R.glow(sx, sy, r * 0.55, f.k === 'pillar' ? '#ffb050' : (f.color || '#fff'), 0.9 * (1 - age));
      } else if (f.k === 'shards') R.light(sx, sy, 50, [120, 220, 255], 0.9 * (1 - age));
      else if (f.k === 'wave') R.light(sx, sy, 50, PX.rgb(f.color), 0.5 * (1 - age));
    }
  }

  // ---------- ground layer ----------
  function ground(R) {
    const w = R.w, cx = R.cx, t = R.time;
    // waypoints
    const h = w.hero;
    if (h && h.orders.length && IT.Orders && IT.Orders.waypoints) {
      R.interp(h);
      let px = pxs(R, R.ix), py = pys(R, R.iy);
      const wp = IT.Orders.waypoints(h);
      for (let i = 0; i < wp.length; i++) {
        const q = wp[i], qx = pxs(R, q.x), qy = pys(R, q.y);
        const col = q.type === 'attack' ? '#ff6a58' : q.type === 'cast' ? '#6adcff' : '#5dff7a';
        PX.dotted(cx, px, py, qx, qy, col, 4, -t * 10);
        cx.fillStyle = '#000'; cx.fillRect(Math.round(qx) - 2, Math.round(qy) - 1, 5, 3); cx.fillRect(Math.round(qx) - 1, Math.round(qy) - 2, 3, 5);
        cx.fillStyle = col; cx.fillRect(Math.round(qx) - 1, Math.round(qy), 3, 1); cx.fillRect(Math.round(qx), Math.round(qy) - 1, 1, 3);
        px = qx; py = qy;
      }
    }
    // thinkers
    for (const e of w.ents) {
      if (e.dead || (e.kind !== 'thinker' && e.kind !== 'proj')) continue;
      if (e.team === 1 && !lit(R, e.x, e.y)) continue;
      R.interp(e);
      const x = pxs(R, R.ix), y = pys(R, R.iy);
      const key = e.fx || e.ability;
      const rr = (e.r || e.radius || 0) / R.P;
      switch (key) {
        case 'sunstrike': {
          const rem = e.danger ? Math.max(0, e.danger.at - R.simT) : 0, tot = Math.max(0.1, e.age + rem), f = clamp(e.age / tot, 0, 1);
          const c1 = f > 0.75 ? '#fff0a0' : '#ffb040';
          PX.ring(cx, x, y, rr, c1, t * 0.15, 3);
          dring(R, x, y, rr * 0.98, '#ff8a1c', 0.5);
          dring(R, x, y, Math.max(1, rr * f), '#ffd24a', 0.9);
          if (f > 0.5) ddisc(R, x, y, rr * f, '#ff8a1c', (f - 0.5) * 0.35);
          const tk = 3 + f * 3;
          cx.fillStyle = c1;
          cx.fillRect(Math.round(x) - 1, Math.round(y - rr - tk), 1, tk); cx.fillRect(Math.round(x) - 1, Math.round(y + rr + 1), 1, tk);
          cx.fillRect(Math.round(x - rr - tk), Math.round(y) - 1, tk, 1); cx.fillRect(Math.round(x + rr + 1), Math.round(y) - 1, tk, 1);
          break;
        }
        case 'emp': {
          PX.ring(cx, x, y, rr, '#b070ff', -t * 0.2, 3);
          dring(R, x, y, rr * (0.85 + 0.05 * Math.sin(t * 6)), '#7a3ad8', 0.5);
          const rem = e.danger ? Math.max(0, e.danger.at - R.simT) : 0;
          if (rem > 0) { const f = clamp(1 - rem / Math.max(0.1, e.age + rem), 0, 1); dring(R, x, y, rr * f, '#e6c8ff', 0.6); }
          break;
        }
        case 'shiva': {
          const f = clamp(e.ring / (e.ringMax || 1), 0, 1), r = e.ring / R.P;
          dring(R, x, y, r, '#bff4ff', 1 - f * 0.6); dring(R, x, y, r - 1, '#4cb6ec', 1 - f); dring(R, x, y, r - 3, '#4cb6ec', (1 - f) * 0.4);
          break;
        }
        case 'chaosmeteor': {
          if (!e.landed) PX.ring(cx, x, y, Math.max(rr, 8), '#ff8a1c', t * 0.2, 3);
          break;
        }
        case 'bolt': case 'atos': case 'tornado': case 'deafeningblast': case 'icewall': case 'meteorhammer': case 'stunbolt': break;
        default: {
          if (rr > 2) PX.ring(cx, x, y, rr, e.color && e.color[0] === '#' ? e.color : '#ffd24a', t * 0.1, 3);
        }
      }
    }
    // one-shot ground fx
    for (const f of fxs) {
      const age = (t - f.t0) / f.dur, x = pxs(R, f.x), y = pys(R, f.y);
      if (f.k === 'wave') {
        const r = (f.r0 + (f.r1 - f.r0) * Math.sqrt(age)) / R.P;
        dring(R, x, y, r, f.color, 1 - age); dring(R, x, y, r - 1, f.color, (1 - age) * 0.5);
      } else if (f.k === 'pillar' && age < 0.5) {
        ddisc(R, x, y, f.r / R.P * (0.5 + age), '#ff9a30', 0.5 * (1 - age * 2));
      } else if (f.k === 'ping') {
        const r = 3 + age * 7;
        dring(R, x, y, r, f.color, 1 - age);
        for (let k = 0; k < 4; k++) {          // converging chevrons
          const a = k * TAU / 4 + 0.785, d = 9 - age * 6.5, px = Math.round(x + Math.cos(a) * d), py = Math.round(y + Math.sin(a) * d);
          cx.fillStyle = f.color;
          const dx = -Math.sign(Math.cos(a)), dy = -Math.sign(Math.sin(a));
          cx.fillRect(px, py, 1, 1); cx.fillRect(px + dx, py, 1, 1); cx.fillRect(px, py + dy, 1, 1);
          cx.fillRect(px + dx * 2, py, 1, 1); cx.fillRect(px, py + dy * 2, 1, 1);
        }
      }
    }
    // telegraph rings under the dummy
    for (const [id, tl] of tele) {
      const e = w.byId.get(id); if (!e || e.dead || !UD().visible(R, e)) continue;
      R.interp(e);
      const x = pxs(R, R.ix), y = pys(R, R.iy), f = clamp((t - tl.t0) / tl.dur, 0, 1);
      if (tl.kind === 'blink') { dring(R, x, y, 18 * (1 - f) + 4, '#b070ff', 0.9); continue; }
      const r = 26 - f * 14;
      PX.ring(cx, x, y, r, f > 0.7 ? '#ff4a6a' : '#c070ff', -t * 0.4, 3);
      dring(R, x, y, 6 + f * 14, '#ff6a8a', 0.35);
      const tg = w.byId.get(tl.target);
      if (tg) { R.interp(tg); PX.dotted(cx, x, y, pxs(R, R.ix), pys(R, R.iy), '#b070ff', 5, -t * 14); }
    }
  }
  const UD = () => IT.UnitDraw;

  // ---------- sorted pass (tall things) ----------
  const items = [];
  function sorted(R, push) {
    const w = R.w;
    for (const e of w.ents) {
      if (e.dead || (e.kind !== 'thinker' && e.kind !== 'proj')) continue;
      const key = e.fx || e.ability;
      if (key !== 'tornado' && key !== 'icewall') continue;
      if (e.team === 1 && !lit(R, e.x, e.y)) continue;
      R.interp(e);
      const fn = key === 'tornado' ? drawTornado : drawIceWall;
      push(R.iy / R.P - R.camY, (a2, R2) => fn(R2, a2), e);
    }
  }
  function drawTornado(R, e) {
    R.interp(e);
    const cx = R.cx, x = Math.round(pxs(R, R.ix)), y = Math.round(pys(R, R.iy)), t = R.time;
    PX.dotted(cx, x, y, x, y, '#fff', 1, 0);
    const ramp = PX.RAMPS.white;
    for (let k = 0; k < 11; k++) {
      const h = k * 2.4, r = 2.5 + k * 0.85, ry = r * 0.32;
      for (let i = 0; i < 6; i++) {
        const a = t * (9 - k * 0.3) + k * 0.8 + i * TAU / 6, s = Math.sin(a);
        const px = Math.round(x + Math.cos(a) * r), py = Math.round(y - 3 - h + s * ry);
        cx.fillStyle = s > 0 ? ramp[2] : ramp[3];
        cx.fillRect(px, py, 2, 1);
        if (i === 0) { cx.fillStyle = '#b070ff'; cx.fillRect(px, py - 1, 1, 1); }
      }
    }
    cx.fillStyle = 'rgba(0,0,0,0.3)'; cx.fillRect(x - 4, y, 9, 2);
  }
  function drawIceWall(R, e) {
    const cx = R.cx, list = [];
    const len = e.ax != null ? Math.hypot(e.bx - e.ax, e.by - e.ay) / R.P : 8, n = Math.max(2, Math.round(len / 4));
    for (let i = 0; i <= n; i++) list.push(e.ax != null ? { x: e.ax + (e.bx - e.ax) * i / n, y: e.ay + (e.by - e.ay) * i / n, i } : { x: e.x, y: e.y, i });
    list.sort((a, b) => a.y - b.y);
    const grow = clamp(e.age / 0.35, 0, 1), t = R.time;
    for (const s of list) {
      const x = Math.round(pxs(R, s.x)), y = Math.round(pys(R, s.y));
      if (x < -10 || x > R.VW + 10 || y < -4 || y > R.VH + 20) continue;
      const hh = Math.round((9 + ((PX.hash2(s.i, 3, 11) * 5) | 0)) * grow), ww = 8;
      cx.fillStyle = 'rgba(0,0,0,0.3)'; cx.fillRect(x - 4, y - 1, 10, 3);
      cx.fillStyle = '#1a4a7a'; cx.fillRect(x - 4, y - hh - 1, ww + 1, hh + 2);
      cx.fillStyle = '#3a9ad8'; cx.fillRect(x - 3, y - hh, ww - 1, hh);
      cx.fillStyle = '#7fdcff'; cx.fillRect(x - 3, y - hh, ww - 1, Math.max(2, hh >> 2));
      cx.fillStyle = '#d8f8ff'; cx.fillRect(x - 3, y - hh, 3, 1); cx.fillRect(x - 3, y - hh, 1, Math.min(4, hh));
      cx.fillStyle = '#2a6ab0'; cx.fillRect(x + 2, y - (hh >> 1), 2, hh >> 1);
      if (((t * 3 + s.i) | 0) % 7 === 0) { cx.fillStyle = '#fff'; cx.fillRect(x - 1, y - hh + 3, 1, 1); }
    }
  }

  // basic attack projectile: solid pixel fireball (hero: faint arcane edge, spirit: pure molten)
  function drawFireball(R, e, x, by, gy) {
    const cx = R.cx, t = R.time, src = R.w.byId.get(e.src), arc = src && src.kind === 'hero', tg = R.w.byId.get(e.target);
    let dx = 1, dy = 0;
    if (tg) { dx = tg.x - e.x; dy = tg.y - e.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; }
    shadow(R, x, gy, 3);
    const fr = (t * 24 + e.id) | 0;
    for (let k = 5; k >= 1; k--) {     // flickering tail, hash-jittered
      const j = PX.hash2(fr + k * 7, e.id, 3);
      if (j < 0.18 * k) continue;
      const tx = Math.round(x - dx * (k * 1.7 + 1.5) + (PX.hash2(fr, k, 5) - 0.5) * 2), ty = Math.round(by - dy * (k * 1.7 + 1.5) * 0.8 + (PX.hash2(fr, k, 9) - 0.5) * 2 - k * 0.3);
      cx.fillStyle = PX.RAMPS.fire[Math.min(5, 1 + (k + 1) / 2 | 0)];
      cx.fillRect(tx, ty, k < 3 ? 2 : 1, k < 3 ? 2 : 1);
    }
    ddisc(R, x, by, 3.6, '#3a1408', 1);
    ddisc(R, x, by, 3, spiritOrHero(arc, '#c8480c'), 1);
    ddisc(R, x, by, 2.3, '#ff8a1c', 1);
    ddisc(R, x, by, 1.5, '#ffc040', 1);
    ddisc(R, x, by, 0.9, '#fff2b0', 1);
    cx.fillStyle = '#fff'; cx.fillRect(Math.round(x), Math.round(by), 1, 1);
    if (arc) {      // arcane tint at the core edge
      cx.fillStyle = '#d8a8ff';
      cx.fillRect(Math.round(x - dx * 2), Math.round(by - dy * 2), 1, 1); cx.fillRect(Math.round(x + dy * 2), Math.round(by - dx * 2), 1, 1);
    }
    cx.fillStyle = '#7a2208';        // lick pixels on the rim
    const f2 = (t * 18 + e.id) | 0;
    cx.fillRect(Math.round(x + Math.cos(f2) * 3), Math.round(by + Math.sin(f2) * 3), 1, 1);
    R.glow(x, by, 12, '#ff9a30', 0.7);
  }
  const spiritOrHero = (arc, c) => arc ? '#c04a10' : c;

  // ---------- air layer ----------
  function air(R) {
    const w = R.w, cx = R.cx, t = R.time;
    for (const e of w.ents) {
      if (e.dead || (e.kind !== 'thinker' && e.kind !== 'proj')) continue;
      if (e.team === 1 && !lit(R, e.x, e.y)) continue;
      R.interp(e);
      const x = Math.round(pxs(R, R.ix)), y = Math.round(pys(R, R.iy)), zp = R.iz / R.P;
      const key = e.fx || e.ability;
      switch (key) {
        case 'sunstrike': {
          const rem = e.danger ? Math.max(0, e.danger.at - R.simT) : 0;
          if (rem < 0.5) {      // sky column building up
            const f = 1 - rem / 0.5, hh = y, wd = f > 0.8 ? 2 : 1;
            cx.fillStyle = f > 0.8 ? '#fff6c0' : '#ffb040';
            for (let yy = y - 1; yy > -4; yy -= 2) if (PX.bayer(x + R.camX, yy + R.camY) < f) cx.fillRect(x - (wd >> 1), yy, wd, 1);
          }
          break;
        }
        case 'bolt': {
          shadow(R, x, y, 3);
          const by = y - 10 - zp;
          ddisc(R, x, by, 4, '#4a2090', 1); ddisc(R, x, by, 3, '#7a3ad8', 1); ddisc(R, x, by, 2, '#c8a0ff', 1);
          cx.fillStyle = '#fff'; cx.fillRect(x - 1, by - 1, 2, 2);
          if (((t * 20) | 0) & 1) { cx.fillStyle = '#e6c8ff'; cx.fillRect(x + 3, by - 2, 1, 1); cx.fillRect(x - 4, by + 1, 1, 1); }
          R.glow(x, by, 12, '#a060ff', 0.6);
          break;
        }
        case 'atos': {
          shadow(R, x, y, 3);
          const by = y - 10 - zp;
          ddisc(R, x, by, 3, '#3a2a8a', 1); ddisc(R, x, by, 2, '#8a80ff', 1);
          cx.fillStyle = '#e8e4ff'; cx.fillRect(x - 1, by - 1, 2, 2);
          const a = t * 12;
          cx.fillStyle = '#b8b0ff'; cx.fillRect(Math.round(x + Math.cos(a) * 5), Math.round(by + Math.sin(a) * 2), 1, 1);
          R.glow(x, by, 10, '#8a80ff', 0.5);
          break;
        }
        case 'emp': {
          const by = y - 4;
          const rem = e.danger ? Math.max(0, e.danger.at - R.simT) : 1;
          const pulse = 1 + 0.25 * Math.sin(t * 14), rb = (3 + (rem < 1 ? 1 - rem : 0) * 3) * pulse;
          ddisc(R, x, by, rb + 1.5, '#4a2090', 1); ddisc(R, x, by, rb, '#8a4af0', 1); ddisc(R, x, by, rb * 0.55, '#e6c8ff', 1);
          cx.fillStyle = '#fff';
          for (let k = 0; k < 4; k++) {            // crackling arcs
            const a = Math.random() * TAU, l = 5 + Math.random() * 8;
            let px = x, py = by;
            for (let s = 0; s < l; s++) { px += Math.cos(a) + (Math.random() - 0.5) * 1.6; py += Math.sin(a) + (Math.random() - 0.5) * 1.6; cx.fillRect(Math.round(px), Math.round(py), 1, 1); }
          }
          R.glow(x, by, 22, '#9a50ff', 0.7);
          break;
        }
        case 'attack': drawFireball(R, e, x, y - 9 - zp, y); break;
        case 'chaosmeteor': drawMeteor(R, e, x, y); break;
        case 'deafeningblast': drawBlast(R, e, x, y); break;
        case 'meteorhammer': drawHammer(R, e, x, y); break;
        default: break;
      }
    }
    // one-shot air fx
    for (const f of fxs) {
      const age = (t - f.t0) / f.dur, x = Math.round(pxs(R, f.x)), y = Math.round(pys(R, f.y));
      if (f.k === 'pillar') {
        const wd = Math.max(2, Math.round(f.r / R.P * 0.55 * (1 - age * 0.6)));
        for (let yy = y; yy > -4; yy--) {
          const fadeUp = 1 - (y - yy) / (y + 40);
          cx.fillStyle = age < 0.18 ? '#ffffff' : age < 0.4 ? '#ffe9a0' : '#ff9a30';
          const a = (1 - age) * Math.max(0.35, fadeUp);
          for (let xx = -wd; xx <= wd; xx++) {
            const edge = Math.abs(xx) / wd;
            if (PX.bayer(x + xx + R.camX, yy + R.camY) < a * (1 - edge * 0.7)) cx.fillRect(x + xx, yy, 1, 1);
          }
        }
        const rb = f.r / R.P * (0.25 + age * 0.45);
        ddisc(R, x, y, rb, '#ff7a1c', 0.8 * (1 - age)); ddisc(R, x, y, rb * 0.6, '#ffd060', 0.9 * (1 - age)); if (age < 0.25) ddisc(R, x, y, rb * 0.3, '#ffffff', 1);
      } else if (f.k === 'shards') {
        const ramp = PX.RAMPS.ice;
        for (let k = 0; k < 9; k++) {
          const a = k * TAU / 9 + 0.3, grow = age < 0.25 ? age / 0.25 : 1, len = (6 + (k % 3) * 3) * grow * (age > 0.6 ? 1 - (age - 0.6) / 0.4 : 1);
          for (let s = 1; s <= len; s++) {
            const px = Math.round(x + Math.cos(a) * (3 + s)), py = Math.round(y + Math.sin(a) * (3 + s) * 0.8 - s * 0.9);
            cx.fillStyle = s > len - 2 ? ramp[0] : ramp[2]; cx.fillRect(px, py, 1, 1);
            if (s < len * 0.6) { cx.fillStyle = ramp[3]; cx.fillRect(px + 1, py, 1, 1); }
          }
        }
      }
    }
  }

  function shadow(R, x, y, r) {
    R.cx.fillStyle = 'rgba(0,0,0,0.3)'; R.cx.fillRect(x - r, y, r * 2 + 1, 1); R.cx.fillRect(x - r + 1, y + 1, r * 2 - 1, 1);
  }

  // Chaos Meteor: falls from the sky onto the target, then rolls as a fireball.
  function drawMeteor(R, e, x, y) {
    const cx = R.cx, t = R.time;
    if (!e.landed) {
      const rem = e.danger ? Math.max(0, e.danger.at - R.simT) : 0, land = Math.max(0.1, e.age + rem);
      const f = clamp(1 - rem / land, 0, 1), hgt = rem * 150;
      const mx = x + hgt * 0.35, my = y - hgt;
      dring(R, x, y, 14 - f * 4, '#ff8a1c', 0.5 + 0.4 * f);
      for (let k = 6; k > 0; k--) {        // tail
        ddisc(R, mx + k * 2.4, my - k * 6, Math.max(1, 6 - k * 0.7), k > 3 ? '#a02a08' : '#d8480c', 0.7);
      }
      ddisc(R, mx, my, 7, '#4a1a0c', 1); ddisc(R, mx, my, 6, '#ff8a1c', 1); ddisc(R, mx - 1, my - 1, 4, '#ffd060', 1); ddisc(R, mx - 1, my - 1, 2, '#fff2b0', 1);
      R.glow(mx, my, 26, '#ff8a2a', 0.8);
      return;
    }
    const by = y - 6;
    shadow(R, x, y, 6);
    ddisc(R, x, by, 8, '#5a1a08', 1); ddisc(R, x, by, 7, '#c8400c', 1); ddisc(R, x - 1, by - 1, 5, '#ff8a1c', 1); ddisc(R, x - 1, by - 1, 3, '#ffd060', 1);
    cx.fillStyle = '#fff2b0'; cx.fillRect(x - 2, by - 2, 2, 2);
    cx.fillStyle = '#3a1408';
    const spin = t * 6;
    for (let k = 0; k < 3; k++) cx.fillRect(Math.round(x + Math.cos(spin + k * 2.1) * 4), Math.round(by + Math.sin(spin + k * 2.1) * 4), 1, 1);
    R.glow(x, by, 30, '#ff7a20', 0.9);
  }

  // Deafening Blast: expanding cone of arcs along facing.
  function drawBlast(R, e, x, y) {
    const cx = R.cx, cols = ['#ff9632', '#b96eff', '#5ad7ff'], front = e.front / R.P;
    if (front < 2) return;
    const dirs = e.dirs || [e.dir || 0], r0 = e.r / R.P;
    for (const a0 of dirs) {
      for (let band = 0; band < 3; band++) {
        const r = Math.max(2, front - band * 3), half = clamp((r0 + front * 0.15) / Math.max(r, 6), 0.15, 0.9);
        cx.fillStyle = cols[band];
        const n = Math.max(8, Math.round(half * r * 1.6));
        for (let i = 0; i < n; i++) {
          const k = i / (n - 1) - 0.5, a = a0 + k * 2 * half;
          const px = Math.round(x + Math.cos(a) * r), py = Math.round(y - 6 + Math.sin(a) * r * 0.9);
          if (PX.bayer(px + R.camX, py + R.camY) < 1.1 - Math.abs(k) * 0.7) cx.fillRect(px, py, 2, band === 0 ? 2 : 1);
        }
      }
      R.glow(x + Math.cos(a0) * front, y - 6 + Math.sin(a0) * front * 0.9, 16, '#8ad0ff', 0.4);
    }
  }

  function drawHammer(R, e, x, y) {
    const cx = R.cx, rem = e.danger ? Math.max(0, e.danger.at - R.simT) : 0;
    const hgt = rem * 120, hy = y - hgt, t = R.time;
    dring(R, x, y, (e.r || 100) / R.P, '#ff8a1c', 0.5);
    cx.fillStyle = '#2a2a34'; cx.fillRect(x - 3, hy - 6, 7, 5); cx.fillStyle = '#8a8a9a'; cx.fillRect(x - 3, hy - 6, 7, 2);
    cx.fillStyle = '#6a3a1c'; cx.fillRect(x, hy - 1, 1, 7);
    for (let k = 1; k < 5; k++) { cx.fillStyle = k > 2 ? '#a02a08' : '#ff8a1c'; cx.fillRect(x - 1 + ((k + (t * 20 | 0)) & 1), hy - 6 - k * 3, 2, 2); }
    R.glow(x, hy - 4, 16, '#ff8a2a', 0.6);
  }

  // ---------- HUD pass (after lighting) ----------
  function hud(R) {
    const w = R.w, cx = R.cx, t = R.time, VW = R.VW, VH = R.VH;
    // damage numbers
    for (const q of texts) {
      const age = (t - q.t0) / 1.0, e = w.byId.get(q.target);
      const wx = e && !e.dead ? e.x : q.x, wy = e && !e.dead ? e.y : q.y;
      const rise = 1 - (1 - Math.min(1, age * 1.6)) * (1 - Math.min(1, age * 1.6));
      let stag = 0; for (const o of texts) if (o !== q && o.target === q.target && o.t0 < q.t0 && q.t0 - o.t0 < 0.7) stag++;
      const x = Math.round(pxs(R, wx) + q.dx), y = Math.round(pys(R, wy) - 44 - rise * 12 - stag * 7);
      if (age > 0.6 && PX.bayer(x + R.camX, y + R.camY) < (age - 0.6) / 0.4) continue;
      PX.text(cx, String(Math.round(q.val)), x, y, q.col, 'c');
    }
    // stun bolt telegraph "!" + off-screen arrows
    for (const [id, tl] of tele) {
      if (tl.kind === 'blink') continue;
      const e = w.byId.get(id); if (!e || e.dead || !UD().visible(R, e)) continue;
      R.interp(e);
      const x = pxs(R, R.ix), y = pys(R, R.iy);
      if (x < 0 || y < 0 || x >= VW || y >= VH) R.edgeArrow(x, y, '#ff4a6a', '!');
      else if (((t * 8) | 0) & 1 || (t - tl.t0) / tl.dur > 0.7) PX.text(cx, '!', x, y - 44, '#ff5a7a', 'c');
    }
    // proj arrow if off-screen
    for (const e of w.ents) {
      if (e.dead || e.kind !== 'proj' || (e.fx || e.ability) !== 'bolt') continue;
      R.interp(e);
      const x = pxs(R, R.ix), y = pys(R, R.iy);
      if (x < 0 || y < 0 || x >= VW || y >= VH) R.edgeArrow(x, y, '#c070ff', null);
    }
    // hidden dummies: last seen "?"
    if (w.fog !== false) for (const e of w.ents) {
      if (e.dead || e.kind !== 'dummy' || e.visible || !e.lastSeen) continue;
      const age = w.t - e.lastSeen.t, a = clamp(1 - age / 30, 0.35, 1);
      const x = pxs(R, e.lastSeen.x), y = pys(R, e.lastSeen.y);
      if (x < -2 || y < -2 || x >= VW + 2 || y >= VH + 2) { R.edgeArrow(x, y, '#9a98b0', '?'); continue; }
      const bob = Math.round(Math.sin(t * 3 + e.id) * 1.5);
      cx.globalAlpha = a;
      PX.text(cx, '?', x, y - 12 + bob, '#d8d0ff', 'c');
      cx.fillStyle = '#d8d0ff'; cx.fillRect(Math.round(x), Math.round(y), 1, 1);
      PX.ring(cx, x, y, 5, '#8a80b0', t * 0.1, 3);
      cx.globalAlpha = 1;
    }
  }

  IT.FX = { init, update, lights, ground, sorted, air, hud, dring, ddisc, tele, addFx };
})(typeof window !== 'undefined' ? window : globalThis);
