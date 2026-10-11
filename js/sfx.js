// IT.Sfx: maps sim events to synth sounds (extends the SFX DSL in audio.js). attach(w) subscribes; detaches the previous world.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const SFX = G.SFX || IT.SFX;
  const MASTER = 0.5, HALF_VIEW = 1440, FALLOFF = 2600;

  // ---------------------------------------------------------------- new synth entries
  if (SFX && SFX.define) {
    const T = SFX.T, N = SFX.N, D = SFX.define;
    D('invokeSwap', b => { T(b, { type: 'triangle', f: 880, f2: 1320, d: 0.07, g: 0.22 }); T(b, { type: 'triangle', f: 1320, f2: 990, d: 0.08, g: 0.16, at: 0.05 }); N(b, { ft: 'highpass', f: 6000, d: 0.08, g: 0.05 }); });
    D('failSoft', b => { T(b, { type: 'sine', f: 330, f2: 220, d: 0.09, g: 0.16, a: 0.006 }); });
    // lighter cast cues where the full cast_* sound would clash with the delayed impact
    D('castSun', b => { T(b, { type: 'triangle', f: 700, f2: 1400, d: 0.14, g: 0.16 }); T(b, { type: 'sine', f: 2100, d: 0.1, g: 0.06, at: 0.03 }); });
    D('castMeteor', b => { N(b, { ft: 'bandpass', f: 500, f2: 1200, d: 0.2, g: 0.2, q: 1.5 }); T(b, { type: 'sawtooth', f: 200, f2: 400, d: 0.18, g: 0.1, lp: 1500 }); });
    D('sunBeam', b => { T(b, { type: 'sine', f: 300, f2: 900, d: 0.6, g: 0.12, a: 0.3 }); T(b, { type: 'triangle', f: 1500, f2: 2200, d: 0.5, g: 0.05, a: 0.3 }); });
    D('sunImpact', b => { T(b, { type: 'sine', f: 110, f2: 38, d: 0.5, g: 0.65, a: 0.003 }); N(b, { ft: 'lowpass', f: 1800, f2: 200, d: 0.35, g: 0.45 }); T(b, { type: 'triangle', f: 1568, f2: 784, d: 0.25, g: 0.15 }); });
    D('empCrackle', b => { for (let i = 0; i < 10; i++) N(b, { ft: 'bandpass', f: 3000 + (i % 4) * 900, d: 0.02, g: 0.1 + i * 0.012, q: 5, at: i * 0.07 }); T(b, { type: 'sawtooth', f: 80, f2: 200, d: 0.7, g: 0.05, lp: 400, a: 0.2 }); });
    D('empPop', b => { T(b, { type: 'sine', f: 180, f2: 45, d: 0.25, g: 0.5, a: 0.002 }); N(b, { ft: 'bandpass', f: 2500, f2: 600, d: 0.18, g: 0.4, q: 1 }); T(b, { type: 'square', f: 900, f2: 120, d: 0.1, g: 0.1 }); });
    D('meteorWhistle', b => { T(b, { type: 'sawtooth', f: 1100, f2: 120, d: 0.9, g: 0.1, lp: 1800, a: 0.1 }); });
    D('meteorLand', b => { N(b, { ft: 'lowpass', f: 700, f2: 120, d: 0.4, g: 0.6 }); T(b, { type: 'sine', f: 100, f2: 30, d: 0.45, g: 0.65, a: 0.003 }); });
    D('iceCrack', b => { N(b, { ft: 'highpass', f: 5000, d: 0.05, g: 0.3 }); N(b, { ft: 'bandpass', f: 3500, d: 0.03, g: 0.2, q: 6, at: 0.05 }); T(b, { type: 'triangle', f: 700, f2: 300, d: 0.25, g: 0.2 }); });
    D('freezeTick', b => { T(b, { type: 'sine', f: 2400, f2: 1600, d: 0.06, g: 0.2 }); N(b, { ft: 'highpass', f: 6500, d: 0.03, g: 0.12 }); });
    D('spiritSpawn', b => { T(b, { type: 'triangle', f: 200, f2: 500, d: 0.2, g: 0.2 }); T(b, { type: 'square', f: 600, f2: 900, d: 0.1, g: 0.06, at: 0.08, lp: 2500 }); N(b, { ft: 'bandpass', f: 2000, d: 0.04, g: 0.15, q: 2 }); });
    D('ghostBreak', b => { T(b, { type: 'sine', f: 220, f2: 520, d: 0.2, g: 0.14 }); N(b, { ft: 'bandpass', f: 1800, f2: 500, d: 0.2, g: 0.15, q: 2 }); });
    D('refresher', b => { [523.25, 783.99, 1046.5, 1567.98].forEach((f, i) => T(b, { type: 'sine', f, d: 0.25, g: 0.2, a: 0.01, at: i * 0.06 })); N(b, { ft: 'highpass', f: 6000, f2: 10000, d: 0.4, g: 0.06 }); });
    D('atosLaunch', b => { T(b, { type: 'sawtooth', f: 400, f2: 900, d: 0.15, g: 0.12, lp: 2000 }); N(b, { ft: 'bandpass', f: 1200, d: 0.1, g: 0.12, q: 2 }); });
    D('atosHit', b => { T(b, { type: 'square', f: 300, f2: 120, d: 0.2, g: 0.16, lp: 1500 }); T(b, { type: 'sine', f: 90, d: 0.25, g: 0.3 }); N(b, { ft: 'bandpass', f: 800, d: 0.1, g: 0.2 }); });
    D('hex', b => { [900, 700, 500, 380].forEach((f, i) => T(b, { type: 'square', f, f2: f * 0.8, d: 0.07, g: 0.12, at: i * 0.05, lp: 2500 })); });
    D('blocked', b => { T(b, { type: 'triangle', f: 1200, f2: 1000, d: 0.12, g: 0.18 }); N(b, { ft: 'highpass', f: 4000, d: 0.05, g: 0.2 }); T(b, { type: 'sine', f: 2400, d: 0.2, g: 0.06, at: 0.02 }); });
    D('shiva', b => { N(b, { ft: 'lowpass', f: 3000, f2: 150, d: 0.7, g: 0.45 }); T(b, { type: 'sine', f: 140, f2: 50, d: 0.5, g: 0.45, a: 0.003 }); T(b, { type: 'triangle', f: 1400, f2: 500, d: 0.5, g: 0.1 }); });
    D('hammerStart', b => { T(b, { type: 'sawtooth', f: 120, f2: 240, d: 0.3, g: 0.14, lp: 600, a: 0.05 }); T(b, { type: 'sine', f: 60, d: 0.2, g: 0.3 }); });
    D('hammerImpact', b => { T(b, { type: 'sine', f: 120, f2: 35, d: 0.35, g: 0.55, a: 0.003 }); N(b, { ft: 'lowpass', f: 900, f2: 150, d: 0.25, g: 0.45 }); T(b, { type: 'square', f: 400, f2: 80, d: 0.08, g: 0.1 }); });
    D('bkb', b => { T(b, { type: 'triangle', f: 330, f2: 660, d: 0.25, g: 0.25, a: 0.02 }); T(b, { type: 'sine', f: 990, d: 0.4, g: 0.12, at: 0.08 }); N(b, { ft: 'highpass', f: 5000, d: 0.3, g: 0.06 }); });
    D('blink', b => { T(b, { type: 'sine', f: 2500, f2: 300, d: 0.1, g: 0.25, a: 0.002 }); N(b, { ft: 'bandpass', f: 3000, f2: 800, d: 0.12, g: 0.25, q: 1.5 }); T(b, { type: 'sine', f: 400, f2: 2200, d: 0.1, g: 0.18, at: 0.1 }); });
    D('dmgTick', b => { N(b, { ft: 'bandpass', f: 1500, d: 0.015, g: 0.1, q: 2 }); });
    D('boltWarn', b => { [0, 0.16, 0.32].forEach((t, i) => { T(b, { type: 'square', f: 880 + i * 110, d: 0.08, g: 0.13, a: 0.003, at: t, lp: 3000 }); }); });
    D('boltHit', b => { T(b, { type: 'sawtooth', f: 800, f2: 90, d: 0.25, g: 0.25, lp: 2500 }); N(b, { ft: 'bandpass', f: 2200, d: 0.12, g: 0.3, q: 1 }); T(b, { type: 'sine', f: 70, d: 0.25, g: 0.4 }); });
    D('dummyBlinkTell', b => { T(b, { type: 'sine', f: 600, f2: 1800, d: 0.3, g: 0.08, a: 0.1 }); });
    D('dummyBlink', b => { T(b, { type: 'sine', f: 1800, f2: 400, d: 0.1, g: 0.14 }); N(b, { ft: 'bandpass', f: 2500, d: 0.08, g: 0.12, q: 2 }); });
    D('comboStep', b => { T(b, { type: 'triangle', f: 1175, d: 0.1, g: 0.18, a: 0.003 }); T(b, { type: 'sine', f: 2350, d: 0.08, g: 0.06 }); });
    D('comboDone', b => { [523.25, 659.25, 783.99].forEach((f, i) => T(b, { type: 'square', f, d: 0.12, g: 0.14, at: i * 0.08, a: 0.003 })); T(b, { type: 'triangle', f: 1046.5, d: 0.35, g: 0.2, at: 0.24 }); });
    D('comboPerfect', b => { [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) => { T(b, { type: 'square', f, d: 0.12, g: 0.13, at: i * 0.07, a: 0.003 }); T(b, { type: 'triangle', f: f * 2, d: 0.1, g: 0.06, at: i * 0.07 }); }); T(b, { type: 'triangle', f: 1568, d: 0.6, g: 0.22, at: 0.42 }); T(b, { type: 'triangle', f: 261.63, d: 0.8, g: 0.2, at: 0.4 }); N(b, { ft: 'highpass', f: 7000, d: 0.5, g: 0.06, at: 0.42 }); });
    D('comboFail', b => { T(b, { type: 'sawtooth', f: 260, f2: 130, d: 0.3, g: 0.18, lp: 900, a: 0.01 }); T(b, { type: 'square', f: 130, f2: 65, d: 0.3, g: 0.08, lp: 400, at: 0.08 }); });
    D('timerTick', b => { T(b, { type: 'square', f: 1400, d: 0.03, g: 0.1, a: 0.002 }); });
    D('timerTickLast', b => { T(b, { type: 'square', f: 1900, d: 0.06, g: 0.14, a: 0.002 }); });
  }

  // ---------------------------------------------------------------- engine

  // throttle: max per window per id
  const MAXN = { dmgTick: 2, hit: 3, freezeTick: 3, failSoft: 1, orbQ: 3, orbW: 3, orbE: 3, comboStep: 2, blocked: 2, timerTick: 1 };
  const hist = Object.create(null);
  function throttled(id) {
    const now = performance.now(), n = MAXN[id] || 2, a = hist[id] || (hist[id] = []);
    while (a.length && now - a[0] > 100) a.shift();
    if (a.length >= n) return true;
    a.push(now); return false;
  }

  function soundOn() {
    try { const s = IT.Settings && IT.Settings.get && IT.Settings.get(); return !s || s.sound !== false; } catch (e) { return true; }
  }

  let off = [], timer = 0, loops = [], lastFail = 0;
  const Sfx = {
    w: null, calls: 0, master: MASTER, SFX,
    // listener = camera centre, else hero
    listener() {
      const w = this.w, dev = IT.dev, cam = dev && dev.cam && dev.w === w ? dev.cam : null;
      if (cam && IT.GAME) return { x: cam.x + IT.GAME.VIEW_W * IT.GAME.UNIT_PX / 2, y: cam.y + IT.GAME.VIEW_H * IT.GAME.UNIT_PX / 2 };
      const h = w && w.hero; return h ? { x: h.x, y: h.y } : null;
    },
    // pos {x,y} optional. Returns true if the sound was sent to the synth.
    play(id, pos, opt) {
      if (!SFX || !SFX.playEx || !this.w) return false;
      if (!soundOn()) return false;
      if (throttled(id)) return false;
      let vol = (opt && opt.vol) || 1, pan = 0;
      if (pos && pos.x != null) {
        const l = this.listener();
        if (l) {
          const dx = pos.x - l.x, d = Math.hypot(dx, pos.y - l.y);
          vol *= Math.max(0.12, 1 - Math.pow(d / FALLOFF, 1.3));
          pan = Math.max(-0.85, Math.min(0.85, dx / HALF_VIEW));
        }
      }
      this.calls++;
      SFX.playEx(id, { vol, pan });
      return true;
    },
    loop(spec, pos, maxSec) {
      if (!SFX || !SFX.loop || !soundOn()) return { stop() {} };
      let vol = 1, pan = 0;
      const l = pos && this.listener();
      if (l) { vol = Math.max(0.12, 1 - Math.pow(Math.hypot(pos.x - l.x, pos.y - l.y) / FALLOFF, 1.3)); pan = Math.max(-0.85, Math.min(0.85, (pos.x - l.x) / HALF_VIEW)); }
      const h = SFX.loop(Object.assign({ vol, pan, maxSec }, spec));
      loops.push(h); this.calls++;
      return h;
    },
    stopLoops() { for (const h of loops) h.stop(); loops = []; },
    detach() {
      for (const f of off) { try { f(); } catch (e) {} }
      off = []; clearInterval(timer); timer = 0; this.stopLoops(); this.w = null;
    },
    attach(w) {
      this.detach();
      if (!SFX) return;
      this.w = w;
      if (SFX.volume != null) SFX.volume = MASTER;
      const S = this, P = (id, pos, o) => S.play(id, pos, o);
      const hero = () => w.hero;
      const isHero = id => w.hero && id === w.hero.id;
      const posOf = id => { const e = w.get(id); return e ? { x: e.x, y: e.y } : null; };
      const on = (t, f) => off.push(w.on(t, f));
      let rumble = null, hammer = null, hammerTm = 0;

      on('orb', p => { if (isHero(p.unit)) P('orb' + p.orb); });
      on('invoke', p => { if (isHero(p.unit)) P(p.swapped ? 'invokeSwap' : 'invoke'); });
      on('fail', p => {
        if (!isHero(p.unit)) return;
        const n = performance.now(); if (n - lastFail < 250) return; lastFail = n; P('failSoft');
      });

      const CAST = { sunstrike: 'castSun', chaosmeteor: 'castMeteor', forgespirit: null };
      on('cast', p => {
        if (p.kind === 'item') return;
        const id = Object.prototype.hasOwnProperty.call(CAST, p.ability) ? CAST[p.ability] : 'cast_' + p.ability;
        if (!id) return;
        P(id, isHero(p.unit) ? null : (p.x != null ? p : posOf(p.unit)));
      });

      on('hit', p => { if (p.ability === 'attack') P('hit', posOf(p.target)); });
      on('damage', p => {
        if (!(p.dealt > 0)) return;
        if (isHero(p.target)) { P('hurt', null, { vol: 0.6 }); return; }
        P('dmgTick', posOf(p.target), { vol: Math.min(1.4, 0.6 + p.dealt / 300) });
      });

      on('blink', p => { if (!isHero(p.unit)) P('dummyBlink', p); });

      on('fx', f => {
        const pos = f;
        switch (f.name) {
          case 'sunstrikeBeam': P('sunBeam', pos); break;
          case 'sunstrikeHit': P('sunImpact', pos); break;
          case 'empCharge': P('empCrackle', pos); break;
          case 'empBlast': P('empPop', pos); break;
          case 'meteorFall':
            if (f.dir != null) P('meteorWhistle', pos);
            else if (hammer) { hammer.stop(); hammer = null; clearTimeout(hammerTm); }
            break;
          case 'meteorLand':
            P('meteorLand', pos);
            if (rumble) rumble.stop();
            rumble = S.loop({ ft: 'lowpass', f: 140, q: 1.2, g: 0.45, wob: 7 }, pos, 8);
            break;
          case 'meteorEnd': if (rumble) { rumble.stop(); rumble = null; } break;
          case 'iceWall': P('iceCrack', pos); break;
          case 'coldsnapFreeze': P('freezeTick', pos); break;
          case 'forgeSpirit': P('spiritSpawn', pos); P('cast_forgespirit', pos, { vol: 0.7 }); break;
          case 'ghostBreak': P('ghostBreak', pos); break;
          case 'refresh': P('refresher', pos); break;
          case 'atosLaunch': P('atosLaunch', pos); break;
          case 'atosHit': P('atosHit', pos); break;
          case 'atosBlocked': case 'hexBlocked': case 'boltBlocked': P('blocked', pos); break;
          case 'hexHit': P('hex', pos); break;
          case 'shivaBlast': P('shiva', pos); break;
          case 'meteorChannel':
            P('hammerStart', pos);
            if (hammer) hammer.stop();
            hammer = S.loop({ ft: 'bandpass', f: 220, q: 3, g: 0.2, wob: 11 }, pos, (f.dur || 2.5) + 0.3);
            break;
          case 'meteorCancel': if (hammer) { hammer.stop(); hammer = null; } break;
          case 'meteorImpact': P('hammerImpact', pos); break;
          case 'bkb': P('bkb', pos); break;
          case 'blinkStart': P('blink', pos); break;
          case 'blinkEnd': break;
          case 'boltTelegraph': P('boltWarn', pos); break;
          case 'boltHit': P('boltHit', pos); break;
          case 'blinkTell': P('dummyBlinkTell', pos); break;
          default: break;
        }
      });

      on('comboStep', p => { if (!p.done) P('comboStep'); });
      on('comboDone', p => { P(p.perfect ? 'comboPerfect' : 'comboDone'); });
      on('comboFail', () => P('comboFail'));
      on('modeEnd', () => S.stopLoops());

      // timed mode: tick each second in the last 10
      let lastSec = Infinity;
      timer = setInterval(() => {
        if (S.w !== w) return;
        const c = w.combo;
        if (!c || c.mode !== 'timed' || c.ended || w.paused || c.timeLeft == null) { lastSec = Infinity; return; }
        const s = Math.ceil(c.timeLeft);
        if (s <= 10 && s >= 1 && s < lastSec) P(s <= 3 ? 'timerTickLast' : 'timerTick');
        lastSec = Math.min(lastSec, s);
      }, 100);
    },
  };
  IT.Sfx = Sfx;

  // unlock AudioContext on first gesture
  const unlock = () => {
    if (SFX && SFX.unlock) SFX.unlock();
    for (const e of ['pointerdown', 'mousedown', 'keydown', 'touchstart']) G.removeEventListener(e, unlock, true);
  };
  for (const e of ['pointerdown', 'mousedown', 'keydown', 'touchstart']) G.addEventListener(e, unlock, true);
})(typeof window !== 'undefined' ? window : globalThis);
