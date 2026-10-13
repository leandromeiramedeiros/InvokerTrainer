// Effects: thinkers/projectiles by ability/fx, one-shot fx events, damage numbers, pings, waypoints, telegraphs, markers.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const PX = IT.Pixel;
  const TAU = Math.PI * 2;

  let fxs = [];               // one-shots
  const tele = new Map();     // unit id -> { t0, dur, kind }
  const trail = new Map();    // entity id -> accumulated emit time
  const pathRec = new Map();  // unit id -> render time of the player's last move/attack/cast order (animated path line, ~1 s)
  const PATH_LIFE = 1.0, PATH_FADE = 0.4, ORDER_COL = { attack: '#ff6a58', cast: '#6adcff', move: '#5dff7a' };
  const texts = [];
  const DMG_COL = { physical: '#ff6a58', magical: '#5aaaff', pure: '#ffd84a' };

  const pxs = (R, wx) => wx / R.P - R.camX;
  const pys = (R, wy) => wy / R.P - R.camY;
  const lit = (R, x, y) => { const f = R.fog; return !f || R.w.fog === false || f.levelAt(x, y) > 1.5; };
  const clamp = IT.U.clamp;

  // Meteor Hammer channel circles: { x, y, r, t0, until, fall (render time of meteorFall), dly, end (fade-out start) }
  const chans = [];
  const hammerR = () => { try { const v = IT.Values.item(IT.GAME.ITEM_DOTA.meteorhammer, 'impact_radius'); if (v > 0) return v; } catch (err) { /* fall through */ } return 400; };
  function findChan(x, y) { for (let i = chans.length - 1; i >= 0; i--) if (Math.hypot(chans[i].x - x, chans[i].y - y) < 30 && chans[i].end == null) return chans[i]; return null; }
  function endChan(x, y) { const c = findChan(x, y); if (c) c.end = R_.time; }

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

  function onFx(p) {
    const name = p.name, x = p.x, y = p.y;
    if (name === 'meteorChannel') {     // sand.js reads p.r / p.dur too
      p.r = p.r || hammerR();
      chans.push({ x, y, r: p.r, t0: R_.time, until: R_.time + (p.dur || 2.5) + 0.2, fall: null, dly: 1, end: null });
      if (chans.length > 4) chans.shift();
    }
    if (IT.Sand && IT.Sand.event) IT.Sand.event(p);
    if (name === 'iceWall' || name === 'iceFloe') { iwReg.set(x + '|' + y, { dur: p.dur, ax: p.ax, ay: p.ay, bx: p.bx, by: p.by }); if (iwReg.size > 8) iwReg.delete(iwReg.keys().next().value); }
    else if (name === 'iceFloeRoot') { iwRoots.push({ unit: p.unit, t0: R_.time, dur: p.dur || 2.5, sx: 0, sy: 0, fade: 1 }); if (iwRoots.length > 12) iwRoots.shift(); }
    switch (name) {
      case 'meteorFall': {
        let c = findChan(x, y);
        if (!c) { c = { x, y, r: p.r || hammerR(), t0: R_.time - 0.3, until: 0, fall: null, dly: 1, end: null }; chans.push(c); }
        c.fall = R_.time; c.dly = Math.max(0.1, p.delay || 1.3); c.until = R_.time + c.dly + 0.4;
        break;
      }
      case 'meteorCancel': endChan(x, y); break;
      case 'sunstrikeBeam': break;
      case 'startReveal': break;   // v6 item 45: a plain faint ring only (ground pass), no event VFX
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
      // v6 #52: an innate blink wind-up (turn + cast point, units.js startBlink) -> contracting ring + dotted line to the landing spot;
      // denied (Cold Snap / a disable mid wind-up) -> the ring shatters
      case 'blinkWindup': tele.set(p.unit, { t0: R_.time, dur: p.dur || 0.3, kind: 'blinkWindup', tx: p.tx, ty: p.ty }); break;
      case 'blinkDenied':
        tele.delete(p.unit);
        addFx({ k: 'wave', x, y, r0: 30, r1: 6, dur: 0.25, color: '#bff4ff' });
        burst(x, y, 'ice', 16, { spread: 18, speed: 50, up: 60 });
        break;
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
      case 'meteorImpact': {      // Meteor Hammer: cyan
        const r = p.r || 400;
        endChan(x, y);
        addFx({ k: 'wave', x, y, r0: r * 0.15, r1: r * 1.1, dur: 0.45, color: '#6cf0ff' });
        addFx({ k: 'wave', x, y, r0: r * 0.08, r1: r * 0.7, dur: 0.3, color: '#ffffff' });
        addFx({ k: 'flash', x, y, r, dur: 0.35, color: '#20b8e8' });
        burst(x, y, 'cyan', 70, { spread: r * 0.6, speed: 75, up: 110, life: 0.9, rest: 5 });
        burst(x, y, 'white', 20, { spread: r * 0.3, speed: 55, up: 90, life: 0.6, rest: 3 });
        burst(x, y, 'dirt', 26, { spread: r * 0.55, speed: 60, up: 90, rest: 3 });
        R_.shake(2.2, 0.25);
        break;
      }
      case 'meteorLand': {
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
      case 'refresh':        // green swirl
        addFx({ k: 'swirl', x, y, dur: 0.9, color: '#6aff8a' });
        addFx({ k: 'wave', x, y, r0: 10, r1: 80, dur: 0.5, color: '#9dffb0' });
        burst(x, y, 'green', 30, { spread: 20, up: 110 });
        break;
      case 'atosLaunch': burst(x, y, 'purple', 8, { spread: 6, speed: 25, up: 40 }); break;
      case 'atosHit':        // dark chain snaps shut
        addFx({ k: 'chainring', x, y, dur: 0.7, dark: true, unit: p.unit });
        addFx({ k: 'wave', x, y, r0: 8, r1: 60, dur: 0.35, color: '#6a5aa8' });
        burst(x, y, 'purple', 18, { spread: 12, speed: 40, up: 60 });
        break;
      case 'hexHit':         // green poof
        addFx({ k: 'wave', x, y, r0: 6, r1: 70, dur: 0.4, color: '#6aff7a' });
        addFx({ k: 'flash', x, y, r: 60, dur: 0.25, color: '#5cff6c' });
        burst(x, y, 'green', 34, { spread: 14, speed: 50, up: 70 });
        burst(x, y, 'white', 14, { spread: 12, speed: 35, up: 45, rest: 2 });
        break;
      case 'meltingStrike': burst(x, y, 'fire', 20, { spread: 14, speed: 40, up: 60 }); break;
      case 'gleipnirLaunch': {
        const r = p.r || 300;
        addFx({ k: 'wave', x, y, r0: r * 0.3, r1: r, dur: 0.4, color: '#ffd24a' });
        burst(x, y, 'gold', 14, { spread: r * 0.5, speed: 30, up: 50 });
        break;
      }
      case 'gleipnirHit':    // golden chains lash the target
        addFx({ k: 'chainring', x, y, dur: 0.8, dark: false, unit: p.unit });
        addFx({ k: 'wave', x, y, r0: 8, r1: 60, dur: 0.35, color: '#ffd24a' });
        burst(x, y, 'gold', 22, { spread: 10, speed: 45, up: 60 });
        break;
      case 'orchidHit':      // soul burn
        addFx({ k: 'wave', x, y, r0: 6, r1: 50, dur: 0.4, color: '#c070ff' });
        burst(x, y, 'purple', 26, { spread: 8, speed: 25, up: 90, life: 1 });
        break;
      case 'orchidBurst':
        addFx({ k: 'flash', x, y, r: 90, dur: 0.3, color: '#b050ff' });
        addFx({ k: 'wave', x, y, r0: 8, r1: 110, dur: 0.45, color: '#e0a0ff' });
        burst(x, y, 'purple', 60, { spread: 18, speed: 70, up: 110 });
        R_.shake(1, 0.15);
        break;
      case 'shivaBlast': {
        const r = p.r || 900;
        addFx({ k: 'flash', x, y, r, dur: 0.35, color: '#bff4ff' });
        addFx({ k: 'wave', x, y, r0: 10, r1: r, dur: Math.min(1.2, r / (p.speed || 600)), color: '#6cd0ff' });
        burst(x, y, 'ice', 50, { spread: Math.min(r * 0.25, 140), speed: 70, up: 80 });
        break;
      }
      case 'bkb':
        addFx({ k: 'wave', x, y, r0: 10, r1: 90, dur: 0.5, color: '#ffd24a' });
        addFx({ k: 'wave', x, y, r0: 4, r1: 50, dur: 0.3, color: '#fff2a0' });
        addFx({ k: 'flash', x, y, r: 90, dur: 0.5, color: '#ffd24a' });
        burst(x, y, 'gold', 40, { spread: 20, up: 90 });
        break;
      case 'atosDodged': case 'hexBlocked': case 'atosBlocked': burst(x, y, 'white', 8, { spread: 10, speed: 30, up: 40 }); break;
      case 'dustBlast': {   // Dust of Appearance (player or enemy): a sparkling cloud bursts out to the reveal radius and hangs there a moment
        const r = p.r || 1050;
        addFx({ k: 'wave', x, y, r0: r * 0.08, r1: r, dur: 0.7, color: '#f0e2b0' });
        addFx({ k: 'cloud', x, y, r, dur: p.linger > 0 ? p.linger : 1.8, hold: p.linger > 0, color: '#e8d49a' });   // linger_duration: the area stays (and re-applies to newcomers) that long
        addFx({ k: 'flash', x, y, r: 160, dur: 0.4, color: '#fff2c0' });
        burst(x, y, 'gold', 60, { spread: Math.min(r * 0.3, 240), speed: 45, up: 90, life: 1.1, rest: 3 });
        burst(x, y, 'dirt', 26, { spread: 70, speed: 40, up: 70, rest: 2 });
        break;
      }
      case 'dustReveal': {  // the debuff lands on a unit: a gold puff + a ring that closes in on it
        addFx({ k: 'wave', x, y, r0: 46, r1: 12, dur: 0.45, color: '#f0e2b0' });
        burst(x, y, 'gold', 16, { spread: 14, speed: 35, up: 70, life: 0.9, rest: 2 });
        break;
      }
      case 'roshanDown': onRoshanDown(p); break;
      case 'cataclysm': addFx({ k: 'wave', x, y, r0: 20, r1: 300, dur: 0.6, color: '#ffd070' }); break;
      case 'blinkStart': case 'blinkEnd': break;
      case 'iceWallEnd': iceWallEnd(x, y); break;
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
    const w = R_.w, o = p.order, u = w.byId.get(p.unit);
    if (o && u && !u.dead && !o.queued && u.team === 0 && (u === w.hero || (u.kind === 'spirit' && o.player)) && ORDER_COL[o.type]) pathRec.set(u.id, R_.time);
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
    addFx({ k: 'wave', x: p.fromX, y: p.fromY, r0: 60, r1: 6, dur: 0.25, color: '#6cb8ff' });
    addFx({ k: 'flash', x: p.fromX, y: p.fromY, r: 90, dur: 0.25, color: '#7a9aff' });
    burst(p.fromX, p.fromY, 'purple', 36, { spread: 30, speed: 40, up: 110, life: 0.7 });
    burst(p.fromX, p.fromY, 'cyan', 18, { spread: 24, speed: 40, up: 100, life: 0.7 });
    addFx({ k: 'wave', x: p.x, y: p.y, r0: 10, r1: 100, dur: 0.35, color: '#e0c0ff' });
    addFx({ k: 'wave', x: p.x, y: p.y, r0: 6, r1: 70, dur: 0.3, color: '#6cb8ff' });
    addFx({ k: 'flash', x: p.x, y: p.y, r: 100, dur: 0.25, color: '#9a8aff' });
    burst(p.x, p.y, 'purple', 36, { spread: 20, speed: 60, up: 90, life: 0.7 });
    burst(p.x, p.y, 'cyan', 18, { spread: 20, speed: 60, up: 90, life: 0.7 });
    tele.delete(p.unit);
  }

  // ---------- Invoke burst: 0.3-0.4 s of misty sand from the hands and the three orbs, tinted by the orbs held now ----------
  const MIST = {};
  function mistRamp(orbs) {
    const key = 'invoke_' + SKIN + orbs;
    if (MIST[key]) return MIST[key];
    const os = orbs.split('').filter(o => ORB_RGB[o]);
    let b = [222, 222, 236];
    if (os.length) { b = [0, 0, 0]; for (const o of os) for (let i = 0; i < 3; i++) b[i] += ORB_RGB[o][i] / os.length; }
    const sand = mixc(b, [200, 170, 120], 0.25);       // a little desert in the mist
    const L = [mixc(b, [255, 255, 255], 0.8), mixc(b, [255, 255, 255], 0.45), b, sand, mixc(b, [30, 20, 40], 0.55), mixc(b, [10, 6, 20], 0.8)];
    return (MIST[key] = IT.Particles.addRamp(key, L.map(hex)));
  }
  function onInvoke(p) {
    const R = R_, u = R && R.w.byId.get(p.unit);
    if (!u || u.dead || !u.inv || !u.inv.orbs) return;
    if (u.team === 1 && !lit(R, u.x, u.y)) return;
    const orbs = u.inv.orbs.join(''), ramp = mistRamp(orbs), P = R.P, z0 = (u.z || 0), t = R.time;
    for (let i = 0; i < orbs.length; i++) {         // same orbit as UnitDraw.drawOrbs: 12 px wide, 5 px deep, 12 px up
      const th = t * 2.6 + i * 2.0944;
      IT.Particles.emit({ x: u.x + Math.cos(th) * 12 * P, y: u.y, z: z0 + (12 - Math.sin(th) * 5) * P, n: 5, ramp, speed: 22, up: 34, spread: 3 * P, life: 0.35, settle: false });
    }
    for (let h = -1; h <= 1; h += 2) IT.Particles.emit({ x: u.x + h * 5 * P, y: u.y, z: z0 + 8 * P, n: 4, ramp, speed: 18, up: 28, spread: 2 * P, life: 0.3, settle: false });
  }

  function init(R) {
    R_ = R;
    const w = R.w;
    w.on('channelStart', onChannelStart); w.on('channelEnd', onChannelEnd); w.on('pickup', onPickup); w.on('roshanDown', onRoshanDown);   // v6 item 28
    w.on('fx', onFx); w.on('damage', onDamage); w.on('order', onOrder); w.on('blink', onBlink); w.on('invoke', onInvoke);
    w.on('bolt', p => { if (p.phase === 'cancel' || p.phase === 'hit' || p.phase === 'blocked') tele.delete(p.unit); });
    // v6 item 13: the intro camera tour focuses a foe group / the gate / a focus area -> pulse its markers while the camera is on it
    w.on('tourFocus', p => { tour = p.kind === 'hero' ? null : Object.assign({}, p, { t0: R_.time, w }); });
    w.on('tourEnd', () => { tour = null; }); w.on('scnGo', () => { tour = null; });
    if (IT.BeliefFX) IT.BeliefFX.init(R);   // v6 item 27: enemy belief indicators (js/render/belief.js)
  }
  let tour = null;                 // the focused tour stop { kind, x, y, r, ids, glide, hold, t0 }
  const revT = new Map();          // start-reveal thinker id -> render time first drawn (the world is frozen in the countdown, so it animates on render time)

  // drop every one-shot / channel / telegraph / damage number / order path (scenario swap, restart)
  function clear() { iwReg.clear(); iwLay.clear(); iwRoots.length = 0; tour = null; revT.clear(); fxs = []; chans.length = 0; texts.length = 0; tele.clear(); trail.clear(); pathRec.clear(); tpPos.clear(); pkPos.clear(); roshPos.clear(); if (IT.BeliefFX) IT.BeliefFX.clear(); }

  // ---------- per-frame update ----------
  function update(R, dt) {
    const w = R.w, t = R.time;
    applySkin(); ravenFeathers(R, dt); updateV28(R, dt);
    fxs = fxs.filter(f => t - f.t0 < f.dur);
    for (let i = chans.length - 1; i >= 0; i--) { const c = chans[i]; if (t > c.until || (c.end != null && t - c.end > 0.35)) chans.splice(i, 1); }
    for (let i = texts.length - 1; i >= 0; i--) if (t - texts[i].t0 > 1.0) texts.splice(i, 1);
    for (const [id, tl] of tele) if (t - tl.t0 > tl.dur + 0.1) tele.delete(id);
    // trails
    for (const e of w.ents) {
      if (e.dead || (e.kind !== 'proj' && e.kind !== 'thinker')) continue;
      const key = e.fx || e.ability;
      let rate = 0, ramp = 'white', o = {};
      switch (key) {
        case 'bolt': rate = 50; ramp = 'purple'; o = { speed: 10, up: 20, life: 0.4, rest: 1.2, z: 20 }; break;
        case 'atos': rate = 26; ramp = 'purple'; o = { speed: 8, up: 18, life: 0.35, rest: 1.2, z: 20 }; break;
        case 'gleipnir': rate = 34; ramp = 'gold'; o = { speed: 10, up: 22, life: 0.4, rest: 1.2, z: 20 }; break;
        case 'tornado': rate = 30; ramp = 'white'; o = { speed: 50, up: 60, spread: 70, life: 0.6, rest: 1.5 }; break;
        case 'chaosmeteor': if (e.landed) { rate = 90; ramp = 'fire'; o = { speed: 30, up: 80, spread: 60, life: 0.9, rest: 5 }; } break;
        case 'deafeningblast': rate = 40; ramp = 'ice'; o = { speed: 20, up: 40, spread: 90, life: 0.5, rest: 2 }; break;
        case 'emp': rate = 14; ramp = 'purple'; o = { speed: 20, up: 70, spread: (e.r || 100) * 0.6, life: 0.7, rest: 1.5 }; break;
        case 'sunstrike': rate = 10; ramp = 'gold'; o = { speed: 10, up: 60, spread: (e.r || 100) * 0.9, life: 0.8, rest: 1.5 }; break;
        case 'icewall': iceWallParticles(R, e, dt); break;
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
      if (key === 'icewall') { iceWallLights(R, e); continue; }
      let r = Math.min(80, Math.max(26, (e.r || e.radius || 60) / R.P * 1.1)), inten = 0.55;
      if (key === 'sunstrike') { const rem = e.danger ? e.danger.at - R.simT : 1; inten = 0.25 + 0.5 * clamp(1 - rem, 0, 1); }
      else if (key === 'startReveal') continue;   // v6 item 45: no light
      else if (key === 'bolt') { r = 30; inten = 0.8; }
      else if (key === 'attack') { const g = orbPal(w.byId.get(e.src)).rgb; r = 30; inten = 0.75; c[0] = g[0]; c[1] = g[1]; c[2] = g[2]; R.light(sx, sy - 9, r, c, inten); continue; }
      else if (key === 'tower') { r = 30; inten = 0.75; const g = e.team === 1 ? [255, 120, 50] : [140, 255, 110]; c[0] = g[0]; c[1] = g[1]; c[2] = g[2]; R.light(sx, sy - 9, r, c, inten); continue; }
      else if (key === 'chaosmeteor') { r = 80; inten = 0.9; }
      else if (key === 'meteorhammer') { c[0] = 40; c[1] = 190; c[2] = 255; inten = 0.7; }
      else if (key === 'gleipnir') { r = 34; inten = 0.8; c[0] = 255; c[1] = 200; c[2] = 70; }
      else if (key === 'atos') { r = 30; inten = 0.55; c[0] = 130; c[1] = 90; c[2] = 230; }
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
      else if (f.k === 'swirl') R.light(sx, sy - 10, 45, [90, 255, 130], 0.7 * (1 - age));
      else if (f.k === 'chainring') R.light(sx, sy - 8, 30, f.dark ? [120, 90, 220] : [255, 200, 70], 0.7 * (1 - age));
    }
    iceFloeRootLights(R);
    tpLights(R); pickLights(R); roshLights(R);
    for (const c of chans) {
      const age = R.time - c.t0, fade = c.end != null ? 1 - clamp((R.time - c.end) / 0.3, 0, 1) : 1;
      R.light(pxs(R, c.x), pys(R, c.y), Math.min(120, c.r / R.P * 1.25), [40, 190, 255], (0.5 + 0.15 * Math.sin(R.time * 5) + (c.fall != null ? 0.25 : 0)) * fade * clamp(age / 0.25, 0, 1));
    }
  }

  // ---------- order path lines ----------
  // Animated marching dashes from the unit along its nav path (sim `u.path`, else straight) to the order target; fades after ~1 s.
  function drawOrderPaths(R) {
    const w = R.w, cx = R.cx, t = R.time;
    for (const [id, t0] of pathRec) {
      const u = w.byId.get(id), hd = u && !u.dead ? u.orders[0] : null, age = t - t0;
      if (!hd || age > PATH_LIFE || !ORDER_COL[hd.type]) { pathRec.delete(id); continue; }
      if (hd.type === 'cast' && !u.path.length) continue;   // in-range cast: nothing to walk
      const wp = IT.Orders && IT.Orders.waypoints ? IT.Orders.waypoints(u)[0] : null;
      const tx = wp ? wp.x : hd.x, ty = wp ? wp.y : hd.y;
      if (tx == null || ty == null) continue;
      const a = age < PATH_LIFE - PATH_FADE ? 1 : Math.max(0, (PATH_LIFE - age) / PATH_FADE);
      R.interp(u);
      const pts = [pxs(R, R.ix), pys(R, R.iy)];
      for (const q of u.path) pts.push(pxs(R, q.x), pys(R, q.y));
      const ex = pxs(R, tx), ey = pys(R, ty), n = pts.length;
      if (Math.hypot(ex - pts[n - 2], ey - pts[n - 1]) > 1.5) pts.push(ex, ey);
      pathLine(R, pts, ORDER_COL[hd.type], a, t * 14);
      const x = Math.round(ex), y = Math.round(ey);   // target cross
      cx.fillStyle = '#000'; cx.fillRect(x - 2, y - 1, 5, 3); cx.fillRect(x - 1, y - 2, 3, 5);
      cx.fillStyle = ORDER_COL[hd.type]; cx.fillRect(x - 1, y, 3, 1); cx.fillRect(x, y - 1, 1, 3);
    }
  }
  function pathLine(R, pts, col, a, phase) {
    const cx = R.cx;
    let d = 0;
    for (let i = 2; i < pts.length; i += 2) {
      const x0 = pts[i - 2], y0 = pts[i - 1], dx = pts[i] - x0, dy = pts[i + 1] - y0, len = Math.hypot(dx, dy);
      if (len < 0.5) continue;
      const ux = dx / len, uy = dy / len;
      for (let s = 0; s < len; s++, d++) {
        if ((((d - phase) % 6) + 6) % 6 >= 3) continue;
        const px = Math.round(x0 + ux * s), py = Math.round(y0 + uy * s);
        if (px < 0 || py < 0 || px >= R.VW || py >= R.VH) continue;
        if (a < 1 && PX.bayer(px + R.camX, py + R.camY) > a) continue;
        cx.fillStyle = 'rgba(0,0,0,0.5)'; cx.fillRect(px, py + 1, 1, 1);
        cx.fillStyle = col; cx.fillRect(px, py, 1, 1);
      }
    }
  }

  // ---------- ground layer ----------
  function ground(R) {
    const w = R.w, cx = R.cx, t = R.time;
    // waypoints
    const h = w.hero;
    drawOrderPaths(R);
    if (h && h.orders.length && IT.Orders && IT.Orders.waypoints) {
      R.interp(h);
      let px = pxs(R, R.ix), py = pys(R, R.iy);
      const wp = IT.Orders.waypoints(h);
      for (let i = 0; i < wp.length; i++) {
        const q = wp[i], qx = pxs(R, q.x), qy = pys(R, q.y);
        const col = ORDER_COL[q.type] || ORDER_COL.move;
        if (i === 0) { if (wp.length === 1) break; }   // leg 0 is the animated fading path (drawOrderPaths); only queued legs stay as dotted lines
        else PX.dotted(cx, px, py, qx, qy, col, 4, -t * 10);
        cx.fillStyle = '#000'; cx.fillRect(Math.round(qx) - 2, Math.round(qy) - 1, 5, 3); cx.fillRect(Math.round(qx) - 1, Math.round(qy) - 2, 3, 5);
        cx.fillStyle = col; cx.fillRect(Math.round(qx) - 1, Math.round(qy), 3, 1); cx.fillRect(Math.round(qx), Math.round(qy) - 1, 1, 3);
        px = qx; py = qy;
      }
    }
    // meteor hammer channel circles: translucent wash + double rim + counter-rotating runes
    for (const c of chans) {
      const x = pxs(R, c.x), y = pys(R, c.y), r = c.r / R.P;
      if (x + r < 0 || y + r < 0 || x - r > R.VW || y - r > R.VH) continue;
      const age = t - c.t0, grow = clamp(age / 0.25, 0, 1), fade = c.end != null ? 1 - clamp((t - c.end) / 0.3, 0, 1) : 1;
      const fall = c.fall != null, pul = 0.5 + 0.5 * Math.sin(t * (fall ? 12 : 5)), rg = r * (1 - (1 - grow) * (1 - grow));
      cx.fillStyle = '#1272b8'; cx.globalAlpha = (0.1 + 0.08 * pul + (fall ? 0.08 : 0)) * fade;
      const ri = Math.ceil(rg), xi = Math.round(x), yi = Math.round(y);
      for (let dy = -ri; dy <= ri; dy++) { const hw = Math.floor(Math.sqrt(Math.max(0, rg * rg - dy * dy))); cx.fillRect(xi - hw, yi + dy, hw * 2 + 1, 1); }
      cx.globalAlpha = fade;
      PX.ring(cx, x, y, rg * 0.66, '#6cf0ff', t * 0.3, 3);
      PX.ring(cx, x, y, rg * 0.33, '#20b8e8', -t * 0.45, 3);
      cx.globalAlpha = 1;
      dring(R, x, y, rg, '#d8fbff', 0.9 * fade);
      dring(R, x, y, rg - 1, '#20b8e8', (0.55 + 0.35 * pul) * fade);
      dring(R, x, y, rg - 3, '#1272b8', 0.4 * fade);
      if (fall) dring(R, x, y, Math.max(1, rg * clamp((t - c.fall) / c.dly, 0, 1)), '#ffffff', 0.7 * fade);
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
        case 'startReveal': {   // v6 item 45: a tiny plain faint ring of vision, no VFX; it fades out over its linger (e.age counts the intro seconds since the camera arrived)
          const fa = 1 - clamp(e.age / Math.max(0.1, e.linger || 1), 0, 1);
          if (fa > 0) dring(R, x, y, rr, '#e9eef8', 0.5 * fa);
          break;
        }
        case 'icewall': iceWallGround(R, e); break;
        case 'bolt': case 'atos': case 'gleipnir': case 'tornado': case 'deafeningblast': case 'meteorhammer': case 'stunbolt': break;
        default: {
          if (rr > 2) PX.ring(cx, x, y, rr, e.color && e.color[0] === '#' ? e.color : '#ffd24a', t * 0.1, 3);
        }
      }
    }
    iceFloeRootsGround(R);
    tpGround(R); pickGround(R); roshGround(R);
    // one-shot ground fx
    for (const f of fxs) {
      const age = (t - f.t0) / f.dur, x = pxs(R, f.x), y = pys(R, f.y);
      if (f.k === 'wave') {
        const r = (f.r0 + (f.r1 - f.r0) * Math.sqrt(age)) / R.P;
        dring(R, x, y, r, f.color, 1 - age); dring(R, x, y, r - 1, f.color, (1 - age) * 0.5);
      } else if (f.k === 'cloud') {   // dust cloud edge: the reveal radius, dithered, fading
        const r = f.r / R.P, fa = f.hold ? (age < 0.85 ? 1 : (1 - age) / 0.15) * (0.75 + 0.1 * Math.sin(t * 2.5)) : 1 - age;   // hold: lingers at near-full strength, fades in the last 15 %
        dring(R, x, y, r, f.color, 0.85 * fa); dring(R, x, y, r * 0.66, f.color, 0.3 * fa); dring(R, x, y, r * 0.33, f.color, 0.2 * fa);
        if (f.hold && fa > 0.3 && Math.random() < 0.5) {   // drifting motes inside the cloud
          const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * f.r;
          IT.Particles.emit({ x: f.x + Math.cos(a) * d, y: f.y + Math.sin(a) * d, z: 10, n: 1, ramp: 'gold', speed: 8, up: 18, spread: 6, life: 1.4, rest: 2 });
        }
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
      if (tl.kind === 'blinkWindup') {
        dring(R, x, y, 34 * (1 - f) + 6, f > 0.6 ? '#e0a0ff' : '#b070ff', 0.95);
        dring(R, x, y, 10, '#6cb8ff', 0.4 + 0.5 * f);
        if (tl.tx != null) { const qx = pxs(R, tl.tx), qy = pys(R, tl.ty); PX.dotted(cx, x, y, x + (qx - x) * f, y + (qy - y) * f, '#b070ff', 4, -t * 16); }
        continue;
      }
      const r = 26 - f * 14;
      PX.ring(cx, x, y, r, f > 0.7 ? '#ff4a6a' : '#c070ff', -t * 0.4, 3);
      dring(R, x, y, 6 + f * 14, '#ff6a8a', 0.35);
      const tg = w.byId.get(tl.target);
      if (tg) { R.interp(tg); PX.dotted(cx, x, y, pxs(R, R.ix), pys(R, R.iy), '#b070ff', 5, -t * 14); }
    }
  }

  // ---------- v6 item 28: enemy TP channel, pickups (rune / aegis), Roshan death ----------
  // Everything reads the sim defensively: e.channel = { kind:'tp', t0, dur, x, y } (sim time), pickups are e.kind === 'pickup' (e.pickKind | e.pick.kind),
  // Roshan is e.kind === 'roshan'. Events (channelStart / channelEnd / pickup / roshanDown) only add the one-shot puffs; the looping visuals are derived
  // from the entities each frame, so a missed event can never leave a stuck column.
  const tpPos = new Map();     // unit id -> { x, y, dx, dy, seen } last position + destination while channelling
  const pkPos = new Map();     // pickup id -> { x, y, kind, hex, seen } (the pickup event fires after the entity is gone)
  const roshPos = new Map();   // roshan id -> { x, y, facing, seen }
  const RUNE_HEX = ['#ffd24a', '#ff5a4a', '#4a7aff', '#4aff7a', '#4af0ff', '#ff6ae0', '#a07aff'];
  const RUNE_RAMP = ['gold', 'red', 'ice', 'green', 'cyan', 'purple', 'purple'];
  const NRUNE = RUNE_HEX.length, PICK_R = 100;
  const tpOf = e => { const c = e.channel; return c && c.kind === 'tp' ? c : null; };
  const pkKind = e => e.pickKind || (e.pick && e.pick.kind) || 'rune';
  const mixHex = (a, b, k) => { const A = PX.rgb(a), B = PX.rgb(b); return PX.hex(A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k); };
  // rune colour cycling: hue index pair + smoothstep blend (per-pickup phase so two runes are never in step)
  function runeHue(R, id) {
    const f = R.time * 1.1 + (id || 0) * 0.37, i = Math.floor(f), u = f - i, s = u * u * (3 - 2 * u);
    const i0 = ((i % NRUNE) + NRUNE) % NRUNE, i1 = (i0 + 1) % NRUNE;
    return { i0, i1, u: s, hex: mixHex(RUNE_HEX[i0], RUNE_HEX[i1], s), ramp: RUNE_RAMP[s < 0.5 ? i0 : i1] };
  }
  // alpha a unit is drawn with (0 hidden): the same fog hysteresis as the sprite
  function unitA(R, e) {
    const U = UD();
    if (e.dead || !U.visible(R, e)) return 0;
    const S = U.state.get(e.id);
    return e.team === 1 && S ? clamp(S.va, 0, 1) : 1;
  }
  const recent = (k, x, y, win) => { for (let i = fxs.length - 1; i >= 0; i--) { const f = fxs[i]; if (f.k === k && R_.time - f.t0 < win && Math.hypot(f.x - x, f.y - y) < 40) return true; } return false; };

  function onChannelStart(p) {
    const e = R_.w.byId.get(p.unit); if (!e || (p.kind && p.kind !== 'tp') || !lit(R_, e.x, e.y)) return;
    addFx({ k: 'wave', x: e.x, y: e.y, r0: 70, r1: 14, dur: 0.45, color: '#bfeaff' });
    addFx({ k: 'flash', x: e.x, y: e.y, r: 70, dur: 0.3, color: '#8fe6ff' });
    burst(e.x, e.y, 'ice', 10, { spread: 12, speed: 25, up: 60 });
  }
  function onChannelEnd(p) {
    if (p.kind && p.kind !== 'tp') return;
    const c = tpPos.get(p.unit), e = R_.w.byId.get(p.unit);
    tpPos.delete(p.unit);
    const x = c ? c.x : e ? e.x : null, y = c ? c.y : e ? e.y : null;
    if (x == null || !lit(R_, x, y)) return;
    if (p.interrupted) {      // cancelled: the column pops into a cold puff of mist + a few shards
      addFx({ k: 'wave', x, y, r0: 12, r1: 85, dur: 0.4, color: '#e8f4ff' });
      addFx({ k: 'wave', x, y, r0: 6, r1: 50, dur: 0.3, color: '#8fe6ff' });
      addFx({ k: 'flash', x, y, r: 80, dur: 0.3, color: '#d4f6ff' });
      addFx({ k: 'shards', x, y, dur: 0.6 });
      burst(x, y, 'white', 24, { spread: 22, speed: 55, up: 70, rest: 2.5 });
      burst(x, y, 'ice', 10, { spread: 14, speed: 40, up: 50 });
    } else {                  // completed: departs in a flash, lands at the destination (if we can see it)
      addFx({ k: 'flash', x, y, r: 150, dur: 0.5, color: '#d4f6ff' });
      addFx({ k: 'wave', x, y, r0: 10, r1: 120, dur: 0.5, color: '#bfeaff' });
      burst(x, y, 'ice', 30, { spread: 16, speed: 30, up: 130, life: 1.0 });
      const dx = c ? c.dx : null, dy = c ? c.dy : null;
      if (dx != null && lit(R_, dx, dy)) {
        addFx({ k: 'wave', x: dx, y: dy, r0: 90, r1: 12, dur: 0.5, color: '#bfeaff' });
        addFx({ k: 'flash', x: dx, y: dy, r: 110, dur: 0.4, color: '#d4f6ff' });
        burst(dx, dy, 'ice', 20, { spread: 14, speed: 30, up: 90 });
      }
    }
  }
  function onPickup(p) {
    const w = R_.w, c = pkPos.get(p.id), u = p.unit != null ? w.byId.get(p.unit) : null;
    const x = c ? c.x : u ? u.x : p.x, y = c ? c.y : u ? u.y : p.y;
    if (x == null || recent('pkring', x, y, 0.3)) return;
    pkPos.delete(p.id);
    const kind = p.kind || (c && c.kind) || 'rune';
    const hex = kind === 'aegis' ? '#ffd24a' : (c && c.hex) || runeHue(R_, p.id).hex;
    addFx({ k: 'pkring', x, y, dur: 0.6, color: hex });
    addFx({ k: 'wave', x, y, r0: 14, r1: kind === 'aegis' ? 190 : 140, dur: 0.5, color: hex });
    addFx({ k: 'flash', x, y, r: kind === 'aegis' ? 150 : 110, dur: 0.45, color: hex });
    addFx({ k: 'pkrise', x, y, dur: 0.9, pick: kind, hex, hue: c && c.hue });
    burst(x, y, kind === 'aegis' ? 'gold' : RUNE_RAMP[c && c.hue != null ? c.hue : 0], kind === 'aegis' ? 34 : 22, { spread: 14, speed: 40, up: 100, life: 0.9, rest: 2 });
  }
  function onRoshanDown(p) {
    const w = R_.w, u = p.unit != null ? w.byId.get(p.unit) : null;
    let c = p.unit != null ? roshPos.get(p.unit) : null;
    if (!c) for (const v of roshPos.values()) c = v;      // any cached roshan
    const x = p.x != null ? p.x : u ? u.x : c ? c.x : null, y = p.y != null ? p.y : u ? u.y : c ? c.y : null;
    if (x == null || recent('roshdeath', x, y, 1)) return;
    addFx({ k: 'roshdeath', x, y, facing: c ? c.facing : (u && u.facing) || 0, dur: 3.2 });
    addFx({ k: 'wave', x, y, r0: 20, r1: 260, dur: 0.7, color: '#c8a070' });
    burst(x, y, 'dirt', 50, { spread: 70, speed: 60, up: 55, life: 1.3, rest: 3 });
    burst(x, y, 'dirt', 24, { spread: 30, speed: 25, up: 90, life: 1.6, rest: 2 });
  }

  // per-frame cache + looping particles (called from update)
  function updateV28(R, dt) {
    const w = R.w, t = R.time;
    for (const e of w.ents) {
      if (e.dead) continue;
      if (e.kind === 'pickup') {
        const k = pkKind(e), hue = k === 'rune' ? runeHue(R, e.id) : null;
        pkPos.set(e.id, { x: e.x, y: e.y, kind: k, hex: hue ? hue.hex : '#ffd24a', hue: hue ? hue.i0 : null, seen: t });
        if (Math.random() < dt * (k === 'aegis' ? 7 : 5)) {      // little motes drifting up off the pedestal
          const a = Math.random() * TAU, d = Math.random() * 60;
          IT.Particles.emit({ x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d * 0.7, z: 6, n: 1, ramp: k === 'aegis' ? 'gold' : hue.ramp, speed: 4, up: 26, spread: 4, life: 0.9, rest: 1 });
        }
      } else if (e.kind === 'roshan') roshPos.set(e.id, { x: e.x, y: e.y, facing: e.facing || 0, seen: t });
      const ch = tpOf(e);
      if (ch) {
        tpPos.set(e.id, { x: e.x, y: e.y, dx: ch.x, dy: ch.y, seen: t });
        if (unitA(R, e) > 0.5 && Math.random() < dt * 22) {      // cold motes spiralling up the column
          const a = Math.random() * TAU, d = 14 + Math.random() * 26;
          IT.Particles.emit({ x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d * 0.8, z: 2, n: 1, ramp: Math.random() < 0.5 ? 'ice' : 'white', speed: 3, up: 55, spread: 3, life: 0.8, rest: 1 });
        }
      }
    }
    for (const m of [tpPos, pkPos, roshPos]) for (const [id, c] of m) if (t - c.seen > 4) m.delete(id);
  }

  // ---- TP channel: ring + progress ring under the unit (ground), column (air), destination marker (ground) ----
  function tpGround(R) {
    const w = R.w, cx = R.cx, t = R.time, A0 = cx.globalAlpha;
    for (const e of w.ents) {
      const ch = tpOf(e); if (!ch) continue;
      const Av = unitA(R, e);
      R.interp(e);
      const x = pxs(R, R.ix), y = pys(R, R.iy), dur = ch.dur > 0 ? ch.dur : 3, p = clamp((w.t - ch.t0) / dur, 0, 1);
      if (Av > 0.02 && x > -40 && x < R.VW + 40 && y > -40 && y < R.VH + 40) {
        const rr = Math.max(9, Math.round(e.radius / R.P * 1.5)), grow = clamp((w.t - ch.t0) / 0.25, 0, 1), hot = p > 0.82 ? 0.5 + 0.5 * Math.sin(t * 28) : 0;
        cx.globalAlpha = Av;
        ddisc(R, x, y, rr * grow, '#4cb6ec', (0.12 + 0.05 * Math.sin(t * 6) + p * 0.1) * Av);
        dring(R, x, y, rr * grow, '#8fe6ff', 0.9 * Av);
        dring(R, x, y, rr * grow * 0.62, '#d4f6ff', (0.45 + 0.3 * hot) * Av);
        for (let i = 0; i < 6; i++) {      // rotating runes
          const a = t * 1.8 + i * TAU / 6, px = Math.round(x + Math.cos(a) * (rr + 3)), py = Math.round(y + Math.sin(a) * (rr + 3));
          cx.globalAlpha = Av * 0.85; cx.fillStyle = i & 1 ? '#ffffff' : '#8fe6ff'; cx.fillRect(px, py, 2, 1); cx.fillRect(px, py - 1, 1, 3);
        }
        // progress ring (clockwise from 12 o'clock), dim track behind it
        const pr = rr + 7, n = Math.max(24, Math.round(TAU * pr * 1.3));
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + i / n * TAU, px = Math.round(x + Math.cos(a) * pr), py = Math.round(y + Math.sin(a) * pr * 0.8), done = i / n <= p;
          cx.globalAlpha = (done ? 0.95 : 0.28) * Av; cx.fillStyle = done ? (p > 0.82 && hot > 0.5 ? '#ffffff' : '#bfeaff') : '#4a78a0';
          cx.fillRect(px, py, 1, 1);
        }
      }
      // destination marker: faint ring + ticks where the unit will land (only if that spot is seen)
      if (ch.x != null && lit(R, ch.x, ch.y)) {
        const dx = pxs(R, ch.x), dy = pys(R, ch.y);
        if (dx > -20 && dx < R.VW + 20 && dy > -20 && dy < R.VH + 20) {
          const pul = 0.5 + 0.5 * Math.sin(t * 4), a = (0.28 + 0.12 * pul) * Math.max(Av, 0.4);
          dring(R, dx, dy, 9 + pul, '#8fe6ff', a);
          cx.globalAlpha = a + 0.1; cx.fillStyle = '#d4f6ff';
          for (let k = 0; k < 4; k++) { const ax = Math.cos(k * TAU / 4 + t * 0.6) * 14, ay = Math.sin(k * TAU / 4 + t * 0.6) * 14; cx.fillRect(Math.round(dx + ax), Math.round(dy + ay * 0.8), 1, 1); }
          cx.fillRect(Math.round(dx), Math.round(dy), 1, 1);
        }
      }
    }
    cx.globalAlpha = A0;
  }
  // blue-white light column + helical strands, drawn over the unit (air pass)
  function tpAir(R) {
    const w = R.w, cx = R.cx, t = R.time, B = PX.BAYER4, A0 = cx.globalAlpha;
    for (const e of w.ents) {
      const ch = tpOf(e); if (!ch) continue;
      const Av = unitA(R, e); if (Av < 0.05) continue;
      R.interp(e);
      const x = Math.round(pxs(R, R.ix)), y = Math.round(pys(R, R.iy));
      if (x < -30 || x > R.VW + 30 || y < -20 || y > R.VH + 90) continue;
      const dur = ch.dur > 0 ? ch.dur : 3, age = w.t - ch.t0, p = clamp(age / dur, 0, 1), grow = clamp(age / 0.3, 0, 1), H = Math.round(62 * grow);
      const hw0 = 6 + Math.max(1, Math.round(e.radius / R.P * 0.5)) + (p > 0.82 ? Math.sin(t * 30) : 0);
      for (let layer = 0; layer < 3; layer++) {          // three nested translucent shafts: blue skirt, pale core, white spine
        cx.fillStyle = layer === 0 ? '#4cb6ec' : layer === 1 ? '#bfeaff' : '#ffffff';
        const hw = Math.max(1, hw0 - layer * 2.5);
        for (let j = 0; j < H; j += 2) {
          const u = j / H, a = (layer === 0 ? 0.13 : layer === 1 ? 0.16 : 0.22) * Av * (1 - u * u) * (0.8 + 0.2 * Math.sin(t * 9 + j * 0.3)), r = hw * (1 + 0.15 * u);
          if (a < 0.02) continue;
          cx.globalAlpha = a;
          cx.fillRect(Math.round(x - r), y - j - 2, Math.round(r * 2) + 1, 2);
        }
      }
      for (let k = 0; k < 3; k++) {                       // helical strands, front half brighter
        for (let j = 0; j < H; j++) {
          const u = j / H, a = t * 6 - u * 9 + k * TAU / 3, cs = Math.cos(a), r = hw0 * (0.95 + 0.2 * u), px = Math.round(x + Math.sin(a) * r), py = y - j;
          const env = Math.min(1, u * 6 + 0.15, (1 - u) * 3 + 0.1);
          if (B[((py + R.camY) & 3) << 2 | ((px + R.camX) & 3)] > env * (cs > 0 ? 0.95 : 0.5)) continue;
          cx.globalAlpha = (cs > 0 ? 0.75 : 0.35) * Av; cx.fillStyle = k === 0 ? '#ffffff' : '#8fe6ff';
          cx.fillRect(px, py, cs > 0 ? 2 : 1, 1);
        }
      }
      R.glow(x, y - 6, 16 + 4 * Math.sin(t * 8), '#8fe6ff', 0.25 * Av * grow);
    }
    cx.globalAlpha = A0;
  }
  function tpLights(R) {
    for (const e of R.w.ents) {
      const ch = tpOf(e); if (!ch) continue;
      const Av = unitA(R, e); if (Av < 0.05) continue;
      R.interp(e);
      const sx = R.ix / R.P - R.camX, sy = R.iy / R.P - R.camY, p = clamp((R.w.t - ch.t0) / (ch.dur > 0 ? ch.dur : 3), 0, 1);
      R.light(sx, sy - 14, 62 + 18 * p, [120, 200, 255], (0.55 + 0.35 * p + 0.1 * Math.sin(R.time * 9)) * Av);
      R.glow(sx, sy - 14, 20, '#bfeaff', 0.3 * Av);
    }
  }

  // ---- pickups: ground ring + dither disc (ground), bobbing sprite (sorted), light ----
  const bobOf = (R, e) => 11 + Math.sin(R.time * 2.4 + (e.id || 0) * 1.7) * 2.5;
  function pickGround(R) {
    const cx = R.cx, t = R.time, A0 = cx.globalAlpha;
    for (const e of R.w.ents) {
      if (e.dead || e.kind !== 'pickup') continue;
      R.interp(e);
      const x = pxs(R, R.ix), y = pys(R, R.iy);
      if (x < -40 || x > R.VW + 40 || y < -40 || y > R.VH + 40) continue;
      const k = pkKind(e), hex = k === 'aegis' ? '#ffd24a' : runeHue(R, e.id).hex, pul = 0.5 + 0.5 * Math.sin(t * 3 + (e.id || 0)), rp = PICK_R / R.P;
      ddisc(R, x, y, rp * (0.5 + 0.08 * pul), hex, 0.1 + 0.06 * pul);
      dring(R, x, y, rp, hex, 0.35 + 0.15 * pul);
      dring(R, x, y, rp * 0.55, hex, 0.3);
      cx.fillStyle = hex;
      for (let i = 0; i < 4; i++) { const a = t * 0.9 + i * TAU / 4; cx.globalAlpha = 0.8; cx.fillRect(Math.round(x + Math.cos(a) * rp), Math.round(y + Math.sin(a) * rp), 2, 1); }
    }
    cx.globalAlpha = A0;
  }
  function drawPickup(e, R) {
    R.interp(e);
    const cx = R.cx, A0 = cx.globalAlpha, x = Math.round(pxs(R, R.ix)), y = Math.round(pys(R, R.iy)), bob = bobOf(R, e), k = pkKind(e), t = R.time;
    if (k === 'aegis') {
      const cv = IT.Art.canvas('aegis', ((t * 2.2 + (e.id || 0)) % 4) < 0.5 ? 'shield_1' : 'shield_0'), def = IT.Art.sheets.aegis;
      if (cv) {
        R.glow(x, y - bob - 8, 15 + 2 * Math.sin(t * 4), '#ffd24a', 0.45);
        cx.drawImage(cv, x - def.anchor[0], Math.round(y - bob - def.anchor[1]));
      }
    } else {
      const h = runeHue(R, e.id), def = IT.Art.sheets['rune' + h.i0], fr = 'orb_' + (((t * 5) | 0) & 1);
      if (def) {
        const a = IT.Art.canvas('rune' + h.i0, fr), b = IT.Art.canvas('rune' + h.i1, fr), ox = x - def.anchor[0], oy = Math.round(y - bob - def.anchor[1]);
        R.glow(x, y - bob - 7, 11 + 1.5 * Math.sin(t * 5), h.hex, 0.5);
        if (a) cx.drawImage(a, ox, oy);
        if (b && h.u > 0.02) { cx.globalAlpha = A0 * h.u; cx.drawImage(b, ox, oy); cx.globalAlpha = A0; }
      }
    }
    cx.globalAlpha = A0;
  }
  function pickLights(R) {
    for (const e of R.w.ents) {
      if (e.dead || e.kind !== 'pickup') continue;
      R.interp(e);
      const sx = R.ix / R.P - R.camX, sy = R.iy / R.P - R.camY - bobOf(R, e) - 6, k = pkKind(e);
      const c = k === 'aegis' ? [255, 210, 90] : PX.rgb(runeHue(R, e.id).hex);
      R.light(sx, sy, k === 'aegis' ? 56 : 44, c, 0.55 + 0.15 * Math.sin(R.time * 4 + (e.id || 0)));
    }
  }

  // ---- Roshan death: collapses through the 4 death frames, lies there, the Aegis glow rises from the body, then it all fades ----
  function drawRoshDeath(f, R) {
    const age = R.time - f.t0, cx = R.cx, A0 = cx.globalAlpha, def = IT.Art.sheets.roshan; if (!def) return;
    const fi = Math.min(3, Math.floor(age / 0.28)), cs = Math.cos(f.facing || 0), sn = Math.sin(f.facing || 0);
    const dir = Math.abs(sn) > Math.abs(cs) ? (sn > 0 ? 's' : 'n') : 'e', mirror = cs < 0 && dir === 'e';
    const cv = IT.Art.canvas('roshan', 'death_' + dir + '_' + fi, mirror); if (!cv) return;
    const x = Math.round(pxs(R, f.x)), y = Math.round(pys(R, f.y)), ax = mirror ? cv.width - 1 - def.anchor[0] : def.anchor[0];
    const fade = age < 2.1 ? 1 : clamp(1 - (age - 2.1) / 1.0, 0, 1);
    if (fade <= 0.02) return;
    cx.globalAlpha = A0 * fade;
    cx.drawImage(cv, x - ax, y - def.anchor[1]);
    cx.globalAlpha = A0;
  }
  function roshGround(R) {
    const cx = R.cx, t = R.time, A0 = cx.globalAlpha;
    for (const f of fxs) {
      if (f.k !== 'roshdeath') continue;
      const age = t - f.t0, x = pxs(R, f.x), y = pys(R, f.y);
      const g = clamp((age - 0.8) / 0.6, 0, 1) * (age > 2.3 ? clamp(1 - (age - 2.3) / 0.9, 0, 1) : 1);   // aegis glow: rises after the thud, fades with the corpse
      if (g > 0.02) {
        const pul = 0.5 + 0.5 * Math.sin(t * 5);
        ddisc(R, x, y, 20 * g, '#ffd24a', 0.16 * g + 0.05 * pul * g);
        dring(R, x, y, 20 * g, '#ffe890', 0.7 * g);
        dring(R, x, y, 11 * g, '#fff2b0', 0.5 * g);
        if (Math.random() < 0.5 * g) IT.Particles.emit({ x: f.x + (Math.random() - 0.5) * 220, y: f.y + (Math.random() - 0.5) * 140, z: 4, n: 1, ramp: 'gold', speed: 5, up: 45, spread: 4, life: 1.1, rest: 1 });
      }
      if (age > 0.55 && age < 0.62 && !f.dusted) { f.dusted = true; burst(f.x, f.y, 'dirt', 40, { spread: 80, speed: 70, up: 40, life: 1.2, rest: 3 }); addFx({ k: 'wave', x: f.x, y: f.y, r0: 30, r1: 170, dur: 0.5, color: '#a88a58' }); }
    }
    cx.globalAlpha = A0;
  }
  function roshAir(R) {
    const cx = R.cx, t = R.time, A0 = cx.globalAlpha, B = PX.BAYER4;
    for (const f of fxs) {
      const age = t - f.t0, x = Math.round(pxs(R, f.x)), y = Math.round(pys(R, f.y));
      if (f.k === 'roshdeath') {      // golden pillar of the Aegis dropping: thin beam over the body, fading with it
        const g = clamp((age - 0.8) / 0.5, 0, 1) * (age > 2.3 ? clamp(1 - (age - 2.3) / 0.9, 0, 1) : 1);
        if (g > 0.02) {
          const H = Math.round(70 * g), hw = 4 + 1.5 * Math.sin(t * 6);
          for (let j = 0; j < H; j += 2) {
            const u = j / H;
            cx.fillStyle = '#ffd24a'; cx.globalAlpha = 0.16 * g * (1 - u);
            cx.fillRect(Math.round(x - hw), y - 6 - j, Math.round(hw * 2) + 1, 2);
            cx.fillStyle = '#fff6c0'; cx.globalAlpha = 0.24 * g * (1 - u);
            cx.fillRect(x - 1, y - 6 - j, 3, 2);
          }
          cx.globalAlpha = A0;
          R.glow(x, y - 10, 24 * g, '#ffd24a', 0.4 * g);
        }
      } else if (f.k === 'pkrise') {  // the picked-up sprite lifts off and fades
        const u = age / f.dur, cv = f.pick === 'aegis' ? IT.Art.canvas('aegis', 'shield_1') : IT.Art.canvas('rune' + (f.hue != null ? f.hue : 0), 'orb_1'), def = f.pick === 'aegis' ? IT.Art.sheets.aegis : IT.Art.sheets['rune' + (f.hue != null ? f.hue : 0)];
        if (cv && def) {
          const rise = 14 + 34 * (1 - (1 - u) * (1 - u)), py = Math.round(y - rise - def.anchor[1]), px = x - def.anchor[0];
          cx.globalAlpha = A0 * (1 - u);
          for (let yy = 0; yy < cv.height; yy += 1) {
            if (u > 0.4 && B[((yy + py + R.camY) & 3) << 2] > 1 - (u - 0.4) / 0.6) continue;
            cx.drawImage(cv, 0, yy, cv.width, 1, px, py + yy, cv.width, 1);
          }
          cx.globalAlpha = A0;
          R.glow(x, y - rise - 6, 14 * (1 - u * 0.5), f.hex, 0.5 * (1 - u));
        }
      } else if (f.k === 'pkring') {  // ground-hugging expanding ring (squashed) under the pickup
        const r = 8 + age / f.dur * 34;
        dring(R, x, y, r, f.color, 1 - age / f.dur);
        dring(R, x, y, r * 0.6, '#ffffff', 0.7 * (1 - age / f.dur));
      }
    }
    cx.globalAlpha = A0;
  }
  function roshLights(R) {
    for (const f of fxs) {
      if (f.k !== 'roshdeath') continue;
      const age = R.time - f.t0, g = clamp((age - 0.8) / 0.6, 0, 1) * (age > 2.3 ? clamp(1 - (age - 2.3) / 0.9, 0, 1) : 1);
      if (g > 0.02) R.light(pxs(R, f.x), pys(R, f.y) - 8, 78, [255, 210, 90], 0.95 * g);
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
      if (key === 'icewall') { pushIceWall(R, e, push); continue; }
      push(R.iy / R.P - R.camY, (a2, R2) => drawTornado(R2, a2), e);
    }
    pushIceFloeRoots(R, push);
    for (const e of w.ents) {      // v6 item 28: pickups bob in the y-sorted pass
      if (e.dead || e.kind !== 'pickup') continue;
      R.interp(e);
      push(R.iy / R.P - R.camY, drawPickup, e);
    }
    for (const f of fxs) if (f.k === 'roshdeath') push(pys(R, f.y) + 0.5, drawRoshDeath, f);
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
  }
  // ---------- Ice Wall (v6 item 41) ----------
  // Same footprint as the sim (segment A-B, half-width r): shards stand in three rows along it (|offset| <= 0.4 r), seeded by the thinker id so
  // the layout never changes between frames. Sprites are pre-rendered once per (h, w, variant); per frame is drawImage only.
  // Timeline (thinker age minus the Ice Floe formation delay): shards rise centre-outward (IW.STAG + IW.RISE ~ 0.35 s), the last IW.MELT s melt out
  // (shrink + fade + whiten, staggered). Floe: before the rise a dotted footprint outline closes in; a rooted unit gets an ice-spike ring + glow.
  const IW = { RISE: 0.2, STAG: 0.15, MELT: 0.6, MELTD: 0.35, NCH: 14, HMIN: 8, HMAX: 22, WMIN: 3, WMAX: 8 };
  const iwReg = new Map();     // 'x|y' -> { dur, ax, ay, bx, by } from the sim's iceWall / iceFloe fx events
  const iwLay = new Map();     // thinker id -> { lay, dur, delay, life, acc, items[] }
  const iwRoots = [];          // Ice Floe roots { unit, t0, dur, sx, sy, fade, front }
  const iwSpr = new Map();
  const IW_ROWS = [{ o: -0.3, st: 4.6, lo: 8, hi: 16 }, { o: 0.3, st: 4.6, lo: 8, hi: 16 }, { o: 0, st: 3.4, lo: 11, hi: 22 }];   // offset (x width), stride px, height range
  const mulberry = a => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  // pure: deterministic per seed. Positions in world units; s = along the wall from its centre (|s| <= L/2), o = across (|o| <= 0.4 width).
  function iceWallLayout(seed, ax, ay, bx, by, width, P) {
    P = P || 6;
    const L = Math.hypot(bx - ax, by - ay), half = L / 2, ux = L > 0 ? (bx - ax) / L : 1, uy = L > 0 ? (by - ay) / L : 0, px = -uy, py = ux;
    const mx = (ax + bx) / 2, my = (ay + by) / 2, rnd = mulberry((seed | 0) * 2654435761 + 1013904223), shards = [];
    for (let ri = 0; ri < IW_ROWS.length; ri++) {
      const row = IW_ROWS[ri], stride = row.st * P;
      for (let s = -half + rnd() * stride * 0.4; s <= half; s += stride * (0.6 + 0.8 * rnd())) {
        const taper = 1 - 0.3 * Math.abs(s) / (half || 1);
        const h = clamp(Math.round((row.lo + (row.hi - row.lo) * Math.pow(rnd(), 1.3)) * taper), IW.HMIN, IW.HMAX);
        const w = clamp(Math.round(h * 0.28 + 1.2 + rnd() * 2.6), IW.WMIN, IW.WMAX);
        const o = (row.o + (rnd() - 0.5) * 0.2) * width;
        shards.push({ i: shards.length, s, o, wx: mx + ux * s + px * o, wy: my + uy * s + py * o, h, w, v: (rnd() * 3) | 0, d: half > 0 ? Math.abs(s) / half : 0, jr: rnd(), jm: rnd(), row: ri });
      }
    }
    const chunks = [], chunkY = [];
    for (let k = 0; k < IW.NCH; k++) chunks.push([]);
    for (const sh of shards) chunks[Math.min(IW.NCH - 1, Math.max(0, Math.floor((sh.s + half) / Math.max(L, 1) * IW.NCH)))].push(sh);
    for (const c of chunks) { c.sort((a, b) => a.wy - b.wy || a.row - b.row); chunkY.push(c.length ? c.reduce((a, b) => a + b.wy, 0) / c.length : my); }
    return { L, half, mx, my, shards, chunks, chunkY };
  }
  // pure: [rise 0..1, melt 0..1] of a shard at wall age `age` (s since the wall rose) for a wall lasting `dur`
  function iceWallPhase(age, dur, sh) {
    return [clamp((age - (IW.STAG * sh.d + 0.02 * sh.jr)) / IW.RISE, 0, 1), clamp((age - (dur - IW.MELT + (IW.MELT - IW.MELTD) * sh.jm)) / IW.MELTD, 0, 1)];
  }

  // pre-rendered shard: dithered dark-blue base -> pale cyan -> white tip, lit left facet / shaded right facet, bright facet edge, specular,
  // cracks on the tall ones, dark-blue outline. glint = white silhouette (sheen / melt gleam / sparkle overlay).
  const LIT = ['#1d5a9a', '#3a9ad8', '#7fdcff', '#c6f2ff', '#ffffff'], SHD = ['#173f78', '#2a78b8', '#4cb6ec', '#9be6ff', '#d4f6ff'];
  function iceWallSprite(h, w, v) {
    const key = (h << 8) | (w << 3) | v;
    let sp = iwSpr.get(key);
    if (sp) return sp;
    const W = w + 2, H = h + 1, rng = mulberry(key * 7919 + 13), tc = clamp(v === 0 ? 1 : v === 2 ? w - 2 : w >> 1, 0, w - 1);
    const grid = new Array(W * H).fill(null), top = [];
    for (let c = 0; c < w; c++) {
      const d = c === tc ? 0 : c < tc ? (tc - c) / Math.max(1, tc) : (c - tc) / Math.max(1, w - 1 - tc);
      let hc = Math.round(h * (1 - 0.7 * Math.pow(d, 1.1)));
      if (c !== tc && rng() < 0.4) hc--;
      top.push(c === tc ? h : clamp(hc, 3, h));
    }
    for (let c = 0; c < w; c++) {
      for (let r = 0; r < top[c]; r++) {
        const y = H - 1 - r, x = c + 1, pal = c < tc ? LIT : SHD;
        let idx = Math.floor(r / h * 5 + (PX.bayer(c, r) - 0.5) * 1.1);
        if (r < 2) grid[y * W + x] = c < tc ? '#17487f' : '#123a6a';
        else { if (c === tc) idx++; grid[y * W + x] = pal[clamp(idx, 0, 4)]; }
      }
    }
    grid[(H - h) * W + tc + 1] = '#ffffff';
    if (h >= 12 && tc + 2 < W) { grid[(H - h + 2) * W + tc + 2] = '#ffffff'; grid[(H - h + 3) * W + tc + 2] = '#e4faff'; }    // specular
    if (h >= 15) {                                                                                                          // cracks
      for (let n = 0, nn = 1 + (rng() < 0.5 ? 1 : 0); n < nn; n++) {
        let x = 1 + clamp(Math.floor(rng() * w), 0, w - 1), r = Math.floor(h * (0.45 + 0.25 * rng()));
        for (let st = 0, ln = 4 + Math.floor(rng() * 3); st < ln && r > 2; st++, r--) {
          const y = H - 1 - r;
          if (grid[y * W + x]) { grid[y * W + x] = '#2f7fc4'; if (x + 1 < W - 1 && grid[y * W + x + 1] && st % 2 === 0) grid[y * W + x + 1] = '#e4faff'; }
          x = clamp(x + (rng() < 0.4 ? -1 : rng() < 0.5 ? 1 : 0), 1, w);
        }
      }
    }
    const out = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (grid[y * W + x]) continue;
      if ((x > 0 && grid[y * W + x - 1]) || (x < W - 1 && grid[y * W + x + 1]) || (y < H - 1 && grid[(y + 1) * W + x])) out.push(y * W + x);
    }
    for (const i of out) grid[i] = '#12386a';
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c2 = cv.getContext('2d');
    for (let i = 0; i < grid.length; i++) if (grid[i]) { c2.fillStyle = grid[i]; c2.fillRect(i % W, (i / W) | 0, 1, 1); }
    const glint = document.createElement('canvas'); glint.width = W; glint.height = H;
    const g2 = glint.getContext('2d');
    g2.drawImage(cv, 0, 0); g2.globalCompositeOperation = 'source-in'; g2.fillStyle = '#ffffff'; g2.fillRect(0, 0, W, H);
    sp = { cv, glint, w: W, h: H, ax: W >> 1, tip: tc + 1 };
    iwSpr.set(key, sp);
    return sp;
  }

  // blit a sprite standing on base line y, centred on x: rise 0..1 crops from the top (tip emerges first), hs < 1 squashes toward the base (melt)
  function iwBlit(cx, sp, x, y, rise, hs, al, gl) {
    const W = sp.w, H = sp.h, dx = x - sp.ax;
    let sh = H, dh = H;
    if (hs < 1) dh = Math.max(1, Math.round(H * hs)); else if (rise < 1) sh = dh = Math.max(1, Math.round(H * rise));
    if (al < 1) cx.globalAlpha = al;
    cx.drawImage(sp.cv, 0, 0, W, sh, dx, y - dh, W, dh);
    if (gl > 0.03) { cx.globalAlpha = Math.min(1, al * gl); cx.drawImage(sp.glint, 0, 0, W, sh, dx, y - dh, W, dh); }
    cx.globalAlpha = 1;
  }

  // per-thinker state (layout cached by id); life = seconds since the wall rose (< 0: Ice Floe still forming)
  function iwState(R, e) {
    if (e.ax == null) return null;
    let st = iwLay.get(e.id);
    if (!st) {
      const reg = iwReg.get(e.x + '|' + e.y);
      st = { lay: iceWallLayout(e.id, e.ax, e.ay, e.bx, e.by, e.r, R.P), dur: reg && reg.dur > 0 ? reg.dur : 3, delay: e.danger ? Math.max(0, e.danger.at - R.simT + e.age) : 0, life: 0, acc: 0, items: [] };
      for (let k = 0; k < IW.NCH; k++) st.items.push({ st, k });
      iwLay.set(e.id, st);
    }
    st.life = e.age + clamp(R.alpha, 0, 1) * (R.w.dt || 1 / 30) - st.delay;
    return st;
  }
  const iwVis = (st) => st.life < 0 ? 0 : clamp(st.life / 0.3, 0, 1) * (1 - clamp((st.life - (st.dur - IW.MELT)) / IW.MELT, 0, 1) * 0.8);

  // ground: frost patch + melt puddle + cast shadow under every shard (below the units); Ice Floe forming -> footprint outline
  function iceWallGround(R, e) {
    const st = iwState(R, e); if (!st) return;
    if (st.life < 0) { iceWallTelegraph(R, e, st); return; }
    const cx = R.cx, P = R.P, sh = st.lay.shards, VW = R.VW, VH = R.VH, life = st.life, dur = st.dur;
    if (life > dur + 0.1) return;
    for (let pass = 0; pass < 3; pass++) {
      cx.fillStyle = pass === 0 ? '#cdeeff' : pass === 1 ? '#6cc4f4' : '#000';
      for (let i = 0; i < sh.length; i++) {
        const s = sh[i], x = Math.round(s.wx / P - R.camX), y = Math.round(s.wy / P - R.camY);
        if (x < -20 || x > VW + 20 || y < -20 || y > VH + 30) continue;
        const ph = iceWallPhase(life, dur, s), er = 1 - (1 - ph[0]) * (1 - ph[0]) * (1 - ph[0]), m = ph[1];
        if (er <= 0 || m >= 1) { if (!(pass === 1 && m > 0)) continue; }
        if (pass === 0) { cx.globalAlpha = 0.22 * er * (1 - m); cx.fillRect(x - (s.w >> 1) - 2, y - 1, s.w + 4, 3); }
        else if (pass === 1) { if (m <= 0) continue; cx.globalAlpha = 0.32 * Math.sin(Math.PI * Math.min(1, m * 0.9 + 0.05)); cx.fillRect(x - (s.w >> 1) - 3, y, s.w + 6, 2); }
        else { cx.globalAlpha = 0.3 * er * (1 - m); cx.fillRect(x - 1, y, s.w + 1 + Math.round(s.h * 0.22 * er), 2); }
      }
    }
    cx.globalAlpha = 1;
  }
  function iceWallTelegraph(R, e, st) {
    const cx = R.cx, P = R.P, t = R.time, f = clamp(1 + st.life / Math.max(0.1, st.delay), 0, 1);
    const ax = pxs(R, e.ax), ay = pys(R, e.ay), bx = pxs(R, e.bx), by = pys(R, e.by), r = e.r / P, L = Math.hypot(bx - ax, by - ay) || 1;
    const ux = (bx - ax) / L, uy = (by - ay) / L, px = -uy, py = ux, fa = 0.45 + 0.4 * f;
    for (let pass = 0; pass < 2; pass++) {
      const k = pass ? 0.15 + 0.85 * (1 - f) : 1, rr = r * k;
      cx.globalAlpha = pass ? 0.55 : fa;
      PX.dotted(cx, ax + px * rr, ay + py * rr, bx + px * rr, by + py * rr, pass ? '#6cd0ff' : '#bff4ff', 4, -t * 10);
      PX.dotted(cx, ax - px * rr, ay - py * rr, bx - px * rr, by - py * rr, pass ? '#6cd0ff' : '#bff4ff', 4, -t * 10);
    }
    cx.globalAlpha = fa; cx.fillStyle = '#bff4ff';
    for (let end = 0; end < 2; end++) {        // round caps (the sim footprint is a capsule)
      const ex = end ? bx : ax, ey = end ? by : ay, dir = end ? 1 : -1, n = Math.max(6, Math.round(Math.PI * r / 3));
      for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + Math.PI * i / n, c = Math.cos(a) * dir * r, d = Math.sin(a) * r; cx.fillRect(Math.round(ex + ux * c + px * d), Math.round(ey + uy * c + py * d), 1, 1); }
    }
    cx.globalAlpha = 1;
  }

  // sorted pass: one item per chunk of the wall (so units walking through it interleave correctly)
  function pushIceWall(R, e, push) {
    const st = iwState(R, e); if (!st || st.life < 0 || st.life > st.dur + 0.1) return;
    const lay = st.lay, P = R.P, ch = lay.chunks;
    for (let k = 0; k < ch.length; k++) if (ch[k].length) push(lay.chunkY[k] / P - R.camY, drawWallChunk, st.items[k]);
  }
  function drawWallChunk(a, R) {
    const st = a.st, sh = st.lay.chunks[a.k], cx = R.cx, P = R.P, t = R.time, life = st.life, dur = st.dur, L = st.lay.L || 1, VW = R.VW, VH = R.VH;
    for (let i = 0; i < sh.length; i++) {
      const s = sh[i], x = Math.round(s.wx / P - R.camX), y = Math.round(s.wy / P - R.camY);
      if (x < -12 || x > VW + 12 || y < -2 || y > VH + 30) continue;
      const ph = iceWallPhase(life, dur, s), rise = ph[0], m = ph[1];
      if (rise <= 0 || m >= 1) continue;
      const er = 1 - (1 - rise) * (1 - rise) * (1 - rise), sp = iceWallSprite(s.h, s.w, s.v);
      let gl = m * 0.5;
      const band = (((s.s + s.o * 0.9) / L * 1.2 + t * 0.13) % 1 + 1) % 1;       // drifting sheen band, slanted across the rows
      if (band < 0.09 && er >= 1) gl = Math.max(gl, 0.42 * Math.sin(Math.PI * band / 0.09));
      iwBlit(cx, sp, x, y, er, m > 0 ? 1 - 0.85 * m : 1, 1 - 0.6 * m, gl);
      if (er >= 1 && m <= 0 && s.h >= 14 && PX.hash2(s.i, (t * 5) | 0, 77) > 0.985) {          // rare sparkle on the tall tips
        const tx = x - sp.ax + sp.tip, ty = y - sp.h + 1;
        cx.fillStyle = '#fff'; cx.fillRect(tx, ty - 1, 1, 3); cx.fillRect(tx - 1, ty, 3, 1);
      }
    }
  }

  // frost mist rolling off the bases (low count), meltwater + mist in the last IW.MELT s; Floe forming: frost gathers along the footprint
  function iceWallParticles(R, e, dt) {
    if (e.team === 1 && !lit(R, e.x, e.y)) return;
    const st = iwState(R, e); if (!st) return;
    const sh = st.lay.shards, life = st.life, melting = life > st.dur - IW.MELT;
    if (!sh.length) return;
    const rate = life < 0 ? 7 : melting ? 20 : life < 0.5 ? 4 : 6;
    st.acc += dt * rate;
    const n = st.acc | 0; st.acc -= n;
    for (let i = 0; i < n; i++) {
      const s = life < 0 ? null : sh[(Math.random() * sh.length) | 0];
      let x, y;
      if (s) { x = s.wx; y = s.wy; }
      else { const f = Math.random(), side = Math.random() < 0.5 ? -1 : 1; x = e.ax + (e.bx - e.ax) * f + (-(e.by - e.ay) / st.lay.L) * e.r * side; y = e.ay + (e.by - e.ay) * f + ((e.bx - e.ax) / st.lay.L) * e.r * side; }
      if (melting && Math.random() < 0.5) IT.Particles.emit({ x, y, z: 4, zr: 8, n: 1, ramp: 'meltwater', speed: 8, up: 10, spread: 14, life: 0.5, rest: 1.4 });
      else IT.Particles.emit({ x, y, z: 0, zr: 3, n: 1, ramp: 'frost', speed: 14, up: 16, spread: 14, life: 0.7, rest: 1.6 });
    }
  }
  function iceWallEnd(x, y) {
    const reg = iwReg.get(x + '|' + y);
    iwReg.delete(x + '|' + y);
    const n = 14;
    for (let i = 0; i < n; i++) {
      const f = Math.random(), px = reg && reg.ax != null ? reg.ax + (reg.bx - reg.ax) * f : x, py = reg && reg.ax != null ? reg.ay + (reg.by - reg.ay) * f : y;
      IT.Particles.emit({ x: px, y: py, z: 2, zr: 10, n: 1, ramp: i & 1 ? 'meltwater' : 'frost', speed: 20, up: 30, spread: 10, life: 0.7, rest: 1.6 });
    }
  }

  // night: five soft self-lights along the wall (scaled by rise/melt) so it stays readable; sheen is a normal sprite overlay
  function iceWallLights(R, e) {
    const st = iwState(R, e); if (!st) return;
    const v = st.life < 0 ? 0.12 : iwVis(st), lay = st.lay, P = R.P;
    if (v <= 0.02) return;
    const ux = e.ax != null ? (e.bx - e.ax) / (lay.L || 1) : 1, uy = e.ax != null ? (e.by - e.ay) / (lay.L || 1) : 0, N = 5;
    for (let i = 0; i < N; i++) {
      const s = (-0.5 + (i + 0.5) / N) * lay.L, sx = (lay.mx + ux * s) / P - R.camX, sy = (lay.my + uy * s) / P - R.camY - 7;
      R.light(sx, sy, 34, [150, 215, 255], 0.42 * v);
      R.glow(sx, sy, 14, '#9fe0ff', 0.16 * v);
    }
  }

  // ---- Ice Floe root: ice-spike ring around the rooted unit + pulsing ground ring + glow ----
  function rootLive(R, r) {
    const u = R.w.byId.get(r.unit), age = R.time - r.t0;
    if (!u || u.dead || age > r.dur + 0.1 || age < 0) return null;
    if (u.team === 1 && !lit(R, u.x, u.y)) return null;
    return u;
  }
  function iceFloeRootsGround(R) {
    for (let i = iwRoots.length - 1; i >= 0; i--) {
      const r = iwRoots[i], u = R.w.byId.get(r.unit);
      if (!u || u.dead || R.time - r.t0 > r.dur + 0.1) { iwRoots.splice(i, 1); continue; }
      if (!rootLive(R, r)) continue;
      R.interp(u);
      const x = pxs(R, R.ix), y = pys(R, R.iy), age = R.time - r.t0, fade = clamp((r.t0 + r.dur - R.time) / 0.35, 0, 1), grow = clamp(age / 0.25, 0, 1);
      const pul = 0.5 + 0.5 * Math.sin(R.time * 6);
      dring(R, x, y, 13 * grow, '#8fe6ff', (0.55 + 0.3 * pul) * fade);
      dring(R, x, y, 10 * grow, '#e4faff', 0.35 * fade);
      R.cx.fillStyle = '#6cc4f4'; R.cx.globalAlpha = 0.16 * fade;
      R.cx.fillRect(Math.round(x) - 12, Math.round(y) - 2, 25, 5); R.cx.globalAlpha = 1;
    }
  }
  function iceFloeRootLights(R) {
    for (const r of iwRoots) {
      const u = rootLive(R, r); if (!u) continue;
      R.interp(u);
      const sx = pxs(R, R.ix), sy = pys(R, R.iy), fade = clamp((r.t0 + r.dur - R.time) / 0.35, 0, 1) * clamp((R.time - r.t0) / 0.2, 0, 1), pul = 0.5 + 0.5 * Math.sin(R.time * 6);
      R.light(sx, sy - 6, 36, [120, 220, 255], (0.6 + 0.2 * pul) * fade);
      R.glow(sx, sy - 6, 20, '#8fe6ff', 0.4 * fade);
    }
  }
  function pushIceFloeRoots(R, push) {
    for (const r of iwRoots) {
      const u = rootLive(R, r); if (!u) continue;
      R.interp(u);
      r.sx = pxs(R, R.ix); r.sy = pys(R, R.iy);
      r.fade = clamp((r.t0 + r.dur - R.time) / 0.35, 0, 1);
      r.front = false; push(r.sy - 0.5, drawRootSpikes, r);
      r.front = true; push(r.sy + 0.5, drawRootSpikes, r);
    }
  }
  function drawRootSpikes(r, R) {
    const age = R.time - r.t0, t = R.time, n = 8, cx = R.cx;
    for (let i = 0; i < n; i++) {
      const a = i * TAU / n + 0.3, sn = Math.sin(a);
      if ((sn > 0) !== r.front) continue;
      const k = clamp(age / 0.25 - i * 0.04, 0, 1), er = 1 - (1 - k) * (1 - k);
      if (er <= 0) continue;
      const h = 7 + ((PX.hash2(i, 5, 31) * 4) | 0), sp = iceWallSprite(h, 3 + (i & 1), i % 3);
      const x = Math.round(r.sx + Math.cos(a) * 12), y = Math.round(r.sy + sn * 5);
      const gl = 0.25 + 0.25 * Math.sin(t * 6 + i);
      iwBlit(cx, sp, x, y, er, r.fade < 1 ? Math.max(0.15, r.fade) : 1, 0.55 + 0.45 * r.fade, gl);
    }
  }

  // hero attack orb colour = mix of the orbs held right now (none -> white). ramp: [rim, dark, base, light, core], rgb = light colour
  const ORB_RGB = { Q: [60, 192, 255], W: [210, 77, 255], E: [255, 160, 44] }, ORB_CACHE = {};
  const FIRE = { ramp: ['#3a1408', '#c8480c', '#ff8a1c', '#ffc040', '#fff2b0'], glow: '#ff9a30', rgb: [255, 150, 55], tail: null };
  const hex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mixc = (c, d, k) => c.map((v, i) => v + (d[i] - v) * k);
  function orbPal(u) {
    if (!u || u.kind !== 'hero' || !u.inv) return FIRE;
    const key = (u.inv.orbs || []).join('');
    let p = ORB_CACHE[key];
    if (!p) {
      const os = (u.inv.orbs || []).filter(o => ORB_RGB[o]);
      let b = [222, 222, 236];
      if (os.length) { b = [0, 0, 0]; for (const o of os) for (let i = 0; i < 3; i++) b[i] += ORB_RGB[o][i] / os.length; }
      const ramp = [hex(mixc(b, [10, 6, 20], 0.8)), hex(mixc(b, [0, 0, 0], 0.35)), hex(b), hex(mixc(b, [255, 255, 255], 0.45)), hex(mixc(b, [255, 255, 255], 0.82))];
      p = ORB_CACHE[key] = { ramp, glow: ramp[3], rgb: mixc(b, [255, 255, 255], 0.3).map(Math.round), tail: [ramp[1], ramp[2], ramp[2], ramp[3], ramp[3], ramp[4]] };
    }
    return p;
  }

  // ---------- v6 item 15: player SKIN palette (Kid / Dark Artistry / Exalted) ----------
  // The equipped skin recolours the three orb colours (IT.Skins.tintRgb); the orb-derived spell colours (orbPal, mistRamp, PX.mixOrbs / ORB_HEX) follow.
  // Applied in place when the skin changes, checked once per update(). Raven scarecrow: drifting feathers.
  let SKIN = 'default';
  const ORB0 = { Q: ORB_RGB.Q.slice(), W: ORB_RGB.W.slice(), E: ORB_RGB.E.slice() };
  const PXORB0 = { Q: PX.ORB_RGB.Q.slice(), W: PX.ORB_RGB.W.slice(), E: PX.ORB_RGB.E.slice() };
  function applySkin() {
    const sk = IT.Art && IT.Art.playerSkin ? IT.Art.playerSkin() : 'default';
    if (sk === SKIN) return;
    SKIN = sk;
    const T = IT.Skins && IT.Skins.tintRgb && sk !== 'default' ? c => IT.Skins.tintRgb(sk, c).map(Math.round) : c => c.slice();
    for (const o of 'QWE') {
      ORB_RGB[o] = T(ORB0[o]);
      const c = T(PXORB0[o]); PX.ORB_RGB[o] = c; PX.ORB_HEX[o] = PX.hex(c[0], c[1], c[2]);
    }
    for (const k in ORB_CACHE) delete ORB_CACHE[k];
  }
  let featherAcc = 0, featherRamp = null;
  function ravenFeathers(R, dt) {
    if (!IT.Art || !IT.Art.dummySheet || IT.Art.dummySheet() !== 'scarecrow_raven' || !IT.Particles) return;
    if (!featherRamp) featherRamp = IT.Particles.addRamp('raven_feather', ['#2b2d40', '#4a5072', '#8a92bd', '#5a3a7c']);
    featherAcc += dt * 1.4;
    for (const e of R.w.ents) {
      if (e.dead || e.kind !== 'dummy' || !e.scarecrow || !lit(R, e.x, e.y) || featherAcc < 1) continue;
      featherAcc -= 1;
      IT.Particles.emit({ x: e.x + (Math.random() - 0.5) * 14, y: e.y, n: 1, ramp: featherRamp, speed: 5, up: 6, spread: 10, life: 1.8, settle: false, z: 26 });
    }
    if (featherAcc > 3) featherAcc = 0;
  }

  // basic attack projectile: solid pixel orb (hero: colour of its current orbs, spirit: molten fire)
  function drawFireball(R, e, x, by, gy) {
    const cx = R.cx, t = R.time, src = R.w.byId.get(e.src), arc = src && src.kind === 'hero', tg = R.w.byId.get(e.target);
    const P = orbPal(src), C = P.ramp;
    let dx = 1, dy = 0;
    if (tg) { dx = tg.x - e.x; dy = tg.y - e.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; }
    const fr = (t * 24 + e.id) | 0;
    for (let k = 5; k >= 1; k--) {     // flickering tail, hash-jittered
      const j = PX.hash2(fr + k * 7, e.id, 3);
      if (j < 0.18 * k) continue;
      const tx = Math.round(x - dx * (k * 1.7 + 1.5) + (PX.hash2(fr, k, 5) - 0.5) * 2), ty = Math.round(by - dy * (k * 1.7 + 1.5) * 0.8 + (PX.hash2(fr, k, 9) - 0.5) * 2 - k * 0.3);
      cx.fillStyle = (P.tail || PX.RAMPS.fire)[Math.min(5, 1 + (k + 1) / 2 | 0)];
      cx.fillRect(tx, ty, k < 3 ? 2 : 1, k < 3 ? 2 : 1);
    }
    ddisc(R, x, by, 3.6, C[0], 1);
    ddisc(R, x, by, 3, C[1], 1);
    ddisc(R, x, by, 2.3, C[2], 1);
    ddisc(R, x, by, 1.5, C[3], 1);
    ddisc(R, x, by, 0.9, C[4], 1);
    cx.fillStyle = '#fff'; cx.fillRect(Math.round(x), Math.round(by), 1, 1);
    cx.fillStyle = arc ? C[1] : '#7a2208';        // lick pixels on the rim
    const f2 = (t * 18 + e.id) | 0;
    cx.fillRect(Math.round(x + Math.cos(f2) * 3), Math.round(by + Math.sin(f2) * 3), 1, 1);
    R.glow(x, by, 12, P.glow, 0.7);
  }

  // ---------- air layer ----------
  function air(R) {
    const w = R.w, cx = R.cx, t = R.time;
    tpAir(R); roshAir(R);
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
          const by = y - 10 - zp;
          ddisc(R, x, by, 4, '#4a2090', 1); ddisc(R, x, by, 3, '#7a3ad8', 1); ddisc(R, x, by, 2, '#c8a0ff', 1);
          cx.fillStyle = '#fff'; cx.fillRect(x - 1, by - 1, 2, 2);
          if (((t * 20) | 0) & 1) { cx.fillStyle = '#e6c8ff'; cx.fillRect(x + 3, by - 2, 1, 1); cx.fillRect(x - 4, by + 1, 1, 1); }
          R.glow(x, by, 12, '#a060ff', 0.6);
          break;
        }
        case 'atos': drawChainProj(R, e, x, y - 10 - zp, y, false); break;
        case 'gleipnir': drawChainProj(R, e, x, y - 10 - zp, y, true); break;
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
        case 'tower': IT.TowerDraw.proj(R, e, x, y - 9 - zp, y); break;
        case 'chaosmeteor': drawMeteor(R, e, x, y); break;
        case 'deafeningblast': drawBlast(R, e, x, y); break;
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
      } else if (f.k === 'swirl') {      // Refresher: three green helix strands rising
        const ramp = PX.RAMPS.green, grow = Math.min(1, age * 3), fadeA = 1 - age * age;
        for (let s = 0; s < 3; s++) for (let j = 0; j < 16; j++) {
          const u = j / 16, a = s * TAU / 3 + age * 10 - u * 5, sn = Math.sin(a);
          const px = Math.round(x + Math.cos(a) * 11 * (1 - u * 0.7) * (1 - age * 0.4)), py = Math.round(y - 2 - u * 34 * (0.3 + 0.7 * grow) + sn * 3);
          if (PX.bayer(px + R.camX, py + R.camY) > fadeA) continue;
          cx.fillStyle = ramp[Math.min(5, 1 + ((u * 3) | 0) + (sn > 0 ? 0 : 1))];
          cx.fillRect(px, py, (j & 1) ? 1 : 2, 1);
        }
        R.glow(x, y - 14, 18, '#5cff7a', 0.5 * (1 - age));
      } else if (f.k === 'chainring') {    // gold (Gleipnir) / dark (Atos) links snap shut around the target
        const u = f.unit != null ? w.byId.get(f.unit) : null;
        let cxp = x, cyp = y;
        if (u && !u.dead) { R.interp(u); cxp = Math.round(pxs(R, R.ix)); cyp = Math.round(pys(R, R.iy)); }
        const k = Math.min(1, age / 0.35), rad = 18 - 11 * k * k, a1 = age < 0.35 ? 1 : 1 - (age - 0.35) / 0.65;
        const lo = f.dark ? '#15101f' : '#8a5a10', mid = f.dark ? '#3a3060' : '#ffd24a', hi = f.dark ? '#a898ff' : '#fff2b0';
        for (let i = 0; i < 12; i++) {
          const ang = i / 12 * TAU + age * 3, px = Math.round(cxp + Math.cos(ang) * rad), py = Math.round(cyp - 8 + Math.sin(ang) * rad * 0.5);
          if (a1 < 1 && PX.bayer(px + R.camX, py + R.camY) > a1) continue;
          cx.fillStyle = mid;
          if (i & 1) { cx.fillRect(px - 1, py - 1, 3, 2); cx.fillStyle = hi; cx.fillRect(px - 1, py - 1, 1, 1); } else { cx.fillRect(px, py - 1, 1, 3); cx.fillStyle = lo; cx.fillRect(px + 1, py, 1, 1); }
        }
        if (age > 0.3 && age < 0.45) ddisc(R, cxp, cyp - 8, 6, f.dark ? '#a898ff' : '#fff2b0', 0.5);
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

  // Gleipnir (gold) / Atos (dark violet): a chain of links trails back toward the caster behind a hooked head.
  function drawChainProj(R, e, x, by, gy, gold) {
    const cx = R.cx, t = R.time, src = R.w.byId.get(e.src);
    const lo = gold ? '#8a5a10' : '#15101f', mid = gold ? '#ffd24a' : '#3a3060', hi = gold ? '#fff2b0' : '#a898ff';
    let sx = x - 1, sy = by;
    if (src) { R.interp(src); sx = pxs(R, R.ix); sy = pys(R, R.iy) - 10; }
    let dx = sx - x, dy = sy - by; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const n = (Math.min(l, 46) / 2.6) | 0;
    for (let i = 1; i <= n; i++) {
      const d = 2 + i * 2.6, sag = Math.sin(i * 0.9 + t * 14) * 0.7 * (i / n);
      const px = Math.round(x + dx * d - dy * sag), py = Math.round(by + dy * d + dx * sag);
      if (i > n - 4 && PX.bayer(px + R.camX, py + R.camY) > (n - i + 1) / 5) continue;
      cx.fillStyle = mid;
      if (i & 1) { cx.fillRect(px - 1, py - 1, 3, 2); cx.fillStyle = lo; cx.fillRect(px, py, 1, 1); cx.fillStyle = hi; cx.fillRect(px - 1, py - 1, 1, 1); }
      else { cx.fillRect(px, py - 1, 1, 3); cx.fillStyle = lo; cx.fillRect(px + 1, py, 1, 1); cx.fillStyle = hi; cx.fillRect(px, py - 1, 1, 1); }
    }
    if (gold) { ddisc(R, x, by, 3.4, lo, 1); ddisc(R, x, by, 2.6, mid, 1); ddisc(R, x, by, 1.5, hi, 1); }
    else { ddisc(R, x, by, 3.6, '#6a50d0', 1); ddisc(R, x, by, 2.8, lo, 1); ddisc(R, x, by, 1.6, mid, 1); }
    cx.fillStyle = '#fff'; cx.fillRect(x, by, 1, 1);
    const a = t * 12; cx.fillStyle = hi;
    cx.fillRect(Math.round(x + Math.cos(a) * 5), Math.round(by + Math.sin(a) * 2.5), 1, 1);
    if (gold) cx.fillRect(Math.round(x - Math.cos(a) * 5), Math.round(by - Math.sin(a) * 2.5), 1, 1);
    R.glow(x, by, gold ? 14 : 11, gold ? '#ffc840' : '#6a50d0', gold ? 0.65 : 0.5);
  }

  // ---------- gate line: the 'cross' ring a scenario foe must not reach (w.gate = { x, y, r }) ----------
  // animated marching dashes on the ground in the scenario accent (HUD magenta), drawn in the unlit HUD pass so fog never hides it
  const GATE_COL = '#ff3fd0';
  function gateLine(R) {
    const g = R.w.gate; if (!g || !(g.r > 0)) return;
    const cx = R.cx, t = R.time, VW = R.VW, VH = R.VH;
    const x = pxs(R, g.x), y = pys(R, g.y), r = g.r / R.P;
    if (x + r < 0 || y + r < 0 || x - r >= VW || y - r >= VH) return;
    const col = g.color || GATE_COL, n = Math.max(24, Math.round(TAU * r * 1.1)), dash = 7, phase = t * 9;
    const ry = r;   // true circle: it is the exact trigger radius (top-down map)
    let lx = 1e9, ly = 1e9;
    for (let i = 0; i < n; i++) {
      const ang = i / n * TAU, px = Math.round(x + Math.cos(ang) * r), py = Math.round(y + Math.sin(ang) * ry);
      if (px === lx && py === ly) continue;
      lx = px; ly = py;
      if (px < 0 || py < 0 || px >= VW || py >= VH) continue;
      const d = i / n * TAU * r - phase;
      const on = (((d % dash) + dash) % dash) < 4;
      if (on) {
        cx.fillStyle = 'rgba(0,0,0,0.55)'; cx.fillRect(px, py + 1, 1, 1);
        cx.fillStyle = col; cx.fillRect(px, py, 1, 1);
        if (px + 1 < VW) { cx.fillStyle = col; cx.fillRect(px + 1, py, 1, 1); }   // 2 px thick horizontally keeps it readable at any zoom
      } else if (PX.bayer(px + R.camX, py + R.camY) < 0.22) { cx.fillStyle = col; cx.fillRect(px, py, 1, 1); }   // faint dither between dashes
    }
    // faint inner dither ring so the area it guards reads as a zone
    dring(R, x, y, r * 0.94, col, 0.16, Math.max(24, Math.round(TAU * r * 0.5)));
  }

  // ---------- intro tour focus pulse (v6 item 13): gate ring / focus area / each focused foe, while the camera is on it ----------
  function tourPulse(R) {
    if (!tour || tour.w !== R.w) return;
    const t = R.time, age = t - tour.t0, dur = Math.max(0.3, tour.glide + tour.hold);
    if (age > dur + 0.2) return;
    const fa = clamp(age / 0.3, 0, 1) * (1 - clamp((age - dur) / 0.2, 0, 1)), pul = 0.5 + 0.5 * Math.sin(age * 9);
    if (tour.kind === 'gate' || tour.kind === 'focus') {
      const g = tour.kind === 'gate' ? R.w.gate || tour : tour, x = pxs(R, g.x), y = pys(R, g.y), r = (g.r || 200) / R.P;
      const col = tour.kind === 'gate' ? (g.color || GATE_COL) : '#ffd24a';
      dring(R, x, y, r + 1 + pul * 3, col, 0.9 * fa); dring(R, x, y, r * (1 - 0.25 * ((age * 0.8) % 1)), col, 0.45 * fa);
      return;
    }
    for (const id of tour.ids || []) {
      const e = R.w.byId.get(id); if (!e || e.dead || !UD().visible(R, e)) continue;
      R.interp(e);
      const x = pxs(R, R.ix), y = pys(R, R.iy) - 6, r = 11 + pul * 4, k = Math.round(r * 0.45);
      dring(R, x, y, r, '#ff4a6a', 0.85 * fa); dring(R, x, y, r + 3 + pul * 2, '#ffd24a', 0.4 * fa);
      R.cx.globalAlpha = fa; R.cx.fillStyle = '#ff4a6a';   // corner brackets
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const bx = Math.round(x + sx * (r + 4)), by = Math.round(y + sy * (r + 4)); R.cx.fillRect(Math.min(bx, bx - sx * k), by, k, 1); R.cx.fillRect(bx, Math.min(by, by - sy * k), 1, k); }
      R.cx.globalAlpha = 1;
      const sx = pxs(R, R.ix), sy = pys(R, R.iy);
      if (sx < 0 || sy < 0 || sx >= R.VW || sy >= R.VH) R.edgeArrow(sx, sy, '#ff4a6a', '!');
    }
  }

  // ---------- HUD pass (after lighting) ----------
  function hud(R) {
    const w = R.w, cx = R.cx, t = R.time, VW = R.VW, VH = R.VH;
    gateLine(R);
    tourPulse(R);
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
      if (tl.kind === 'blink' || tl.kind === 'blinkWindup') continue;
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
      if (e.dead || !(e.kind === 'dummy' || e.refill) || e.visible || !e.lastSeen) continue;
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
    if (IT.BeliefFX) IT.BeliefFX.hud(R);   // v6 item 27: last-seen ghost, prediction arrow, '?' / '!', Gem ring, item chips
  }

  IT.FX = { init, clear, update, lights, ground, sorted, air, hud, dring, ddisc, tele, addFx, onChannelStart, onChannelEnd, onPickup, onRoshanDown, runeHue, tpOf, pkKind, orbPal, iceWallLayout, iceWallPhase, iceWallSprite, IW };
})(typeof window !== 'undefined' ? window : globalThis);
