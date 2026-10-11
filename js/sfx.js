// IT.Sfx: maps sim events to layered synth voices (extends the SFX DSL in audio.js). attach(w) subscribes; detaches the previous world.
// Each spell voice = transient (noise/click) + body (oscillators) + tail (shimmer/rumble), randomized slightly per play (b.pv/b.gv).
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const SFX = G.SFX || IT.SFX;
  const MASTER = 0.5, HALF_VIEW = 1440, FALLOFF = 2600;
  const R = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];

  // ---------------------------------------------------------------- voices
  if (SFX && SFX.define) {
    const T = SFX.T, N = SFX.N, D = SFX.define;
    const dur = (b, d) => Math.max(0.4, (b.opt && b.opt.dur) || d);

    // ---- orbs: icy chime / electric zip / fiery whoosh
    D('orbQ', b => {
      const f = pick([1568, 1760, 1976, 2349]);
      N(b, { ft: 'highpass', f: 7000, d: 0.02, g: 0.1, q: 0.7 });
      T(b, { type: 'sine', f, f2: f * 0.96, d: 0.18, g: 0.4, a: 0.003 });
      T(b, { type: 'sine', f: f * 2.76, d: 0.09, g: 0.1, a: 0.002 });
      T(b, { type: 'triangle', f: f * 1.5, d: 0.34, g: 0.06, a: 0.01, fm: 8, fmd: f * 0.01 });
    });
    D('orbW', b => {
      N(b, { ft: 'bandpass', f: 3000, f2: 9000, d: 0.06, g: 0.14, q: 1.5 });
      T(b, { type: 'sawtooth', f: 700, f2: 2600, d: 0.07, g: 0.14, lp: 4500, a: 0.002 });
      T(b, { type: 'square', f: 3200, f2: 700, d: 0.06, g: 0.04, at: 0.02 });
      N(b, { ft: 'bandpass', f: R(3500, 6000), d: 0.015, g: 0.14, q: 6, at: 0.05 });
      N(b, { ft: 'bandpass', f: R(2500, 5000), d: 0.015, g: 0.1, q: 6, at: 0.09 });
      T(b, { type: 'sawtooth', f: 120, d: 0.12, g: 0.05, lp: 700, am: 60, at: 0.02 });
    });
    D('orbE', b => {
      N(b, { ft: 'lowpass', f: 300, f2: 1500, d: 0.24, g: 0.36, q: 0.8, a: 0.07 });
      N(b, { ft: 'bandpass', f: 900, f2: 300, d: 0.2, g: 0.12, q: 1 });
      T(b, { type: 'sine', f: 110, f2: 68, d: 0.2, g: 0.4, a: 0.012 });
      T(b, { type: 'triangle', f: 220, f2: 150, d: 0.14, g: 0.1, a: 0.01 });
      N(b, { ft: 'bandpass', f: R(2500, 4000), d: 0.015, g: 0.08, q: 5, at: 0.09 });
    });

    // ---- invoke: rising arcane chord (minor, open fifth) + riser + sparkle
    D('invoke', b => {
      [110, 220, 329.63, 440, 523.25, 659.25, 880].forEach((f, i) => {
        T(b, { type: i < 2 ? 'sawtooth' : 'triangle', f, f2: f * 1.012, d: 0.55 - i * 0.03, g: i < 2 ? 0.08 : 0.15, a: 0.03 + i * 0.012, at: i * 0.03, lp: i < 2 ? 500 : 0, rel: 0.05 });
        T(b, { type: 'sine', f: f * 2.005, d: 0.35, g: 0.04, a: 0.03, at: i * 0.03 });
      });
      T(b, { type: 'sine', f: 300, f2: 1500, d: 0.3, g: 0.08, a: 0.1, lin: true });
      N(b, { ft: 'highpass', f: 3000, f2: 10000, d: 0.4, g: 0.07, a: 0.12, q: 0.7 });
      T(b, { type: 'sine', f: 1760, d: 0.3, g: 0.07, at: 0.24, fm: 7, fmd: 14 });
      T(b, { type: 'sine', f: 2349, d: 0.25, g: 0.05, at: 0.3 });
    });
    D('invokeSwap', b => {
      T(b, { type: 'triangle', f: 880, f2: 1320, d: 0.08, g: 0.2 });
      T(b, { type: 'triangle', f: 1320, f2: 990, d: 0.1, g: 0.15, at: 0.05 });
      N(b, { ft: 'highpass', f: 6000, d: 0.1, g: 0.05 });
    });
    D('failSoft', b => { T(b, { type: 'sine', f: 330, f2: 220, d: 0.09, g: 0.16, a: 0.006 }); });

    // ---- Cold Snap: ice crack + glassy tail; freezeTick = shatter tick per proc
    D('cast_coldsnap', b => {
      N(b, { ft: 'highpass', f: 5000, f2: 2500, d: 0.07, g: 0.36, q: 0.8 });
      N(b, { ft: 'bandpass', f: 3500, d: 0.035, g: 0.25, q: 6, at: 0.03 });
      T(b, { type: 'sine', f: 1900, f2: 700, d: 0.2, g: 0.18, a: 0.004 });
      T(b, { type: 'sine', f: 170, f2: 90, d: 0.14, g: 0.25, a: 0.003 });
      T(b, { type: 'triangle', f: 2500, d: 0.4, g: 0.05, a: 0.02, fm: 9, fmd: 40, at: 0.04 });
      N(b, { ft: 'highpass', f: 8000, d: 0.3, g: 0.05, a: 0.03, at: 0.05 });
    });
    D('freezeTick', b => {
      const f = R(2000, 3600);
      T(b, { type: 'sine', f, f2: f * 0.6, d: 0.08, g: 0.2, a: 0.002 });
      N(b, { ft: 'highpass', f: 6500, d: 0.03, g: 0.14 });
      N(b, { ft: 'bandpass', f: R(4000, 7000), d: 0.015, g: 0.12, q: 8, at: 0.025 });
    });

    // ---- Ghost Walk: breathy fade + reverse swell
    D('cast_ghostwalk', b => {
      N(b, { ft: 'bandpass', f: 250, f2: 1600, d: 0.45, g: 0.5, q: 1.6, a: 0.38 });
      N(b, { ft: 'bandpass', f: 1300, f2: 450, d: 0.7, g: 0.14, q: 0.8, a: 0.05, at: 0.4 });
      T(b, { type: 'sine', f: 330, f2: 210, d: 0.85, g: 0.07, a: 0.15, fm: 5, fmd: 6 });
      T(b, { type: 'sine', f: 497, f2: 320, d: 0.75, g: 0.04, a: 0.15, det: 9, at: 0.05 });
    });
    D('ghostBreak', b => {
      N(b, { ft: 'bandpass', f: 500, f2: 2600, d: 0.15, g: 0.22, q: 1.5, a: 0.12 });
      T(b, { type: 'sine', f: 900, f2: 200, d: 0.12, g: 0.2, at: 0.13 });
      N(b, { ft: 'highpass', f: 4000, d: 0.06, g: 0.15, at: 0.13 });
    });

    // ---- Ice Wall: charge cue, then grinding crystal build (fx iceWall), shatter at end
    D('cast_icewall', b => {
      T(b, { type: 'sine', f: 500, f2: 1300, d: 0.14, g: 0.12, lin: true, a: 0.02 });
      N(b, { ft: 'highpass', f: 5000, d: 0.08, g: 0.14, q: 0.7 });
    });
    D('iceWall', b => {
      N(b, { ft: 'bandpass', f: 1000, f2: 380, d: 0.6, g: 0.34, q: 4, a: 0.03, am: 26, amd: 0.9 });
      N(b, { ft: 'lowpass', f: 450, f2: 200, d: 0.55, g: 0.3, am: 13, amd: 0.8 });
      T(b, { type: 'sine', f: 95, f2: 52, d: 0.35, g: 0.4, a: 0.005 });
      [1568, 1760, 2093, 2349, 2637, 3136].forEach((f, i) => T(b, { type: 'sine', f: f * R(0.98, 1.02), f2: f * 0.9, d: 0.22, g: 0.07, a: 0.003, at: 0.04 + i * 0.07 }));
      N(b, { ft: 'highpass', f: 6000, d: 0.5, g: 0.06, a: 0.05, at: 0.05 });
    });
    D('iceWallEnd', b => {
      N(b, { ft: 'highpass', f: 4500, f2: 2500, d: 0.35, g: 0.25, q: 0.7 });
      for (let i = 0; i < 7; i++) N(b, { ft: 'bandpass', f: R(3000, 8000), d: 0.02, g: 0.14, q: 7, at: R(0, 0.3) });
      T(b, { type: 'sine', f: 1400, f2: 500, d: 0.2, g: 0.1 });
    });

    // ---- EMP: charging hum rising over the delay (fx empCharge, opt.dur = delay), then heavy zap/pop (fx empBlast)
    D('cast_emp', b => {
      T(b, { type: 'sine', f: 400, f2: 900, d: 0.16, g: 0.1, lin: true, a: 0.02, am: 30 });
      N(b, { ft: 'highpass', f: 6000, d: 0.12, g: 0.07 });
    });
    D('empCrackle', b => {
      const d = dur(b, 2.9), a = d * 0.85;
      T(b, { type: 'sawtooth', f: 70, f2: 240, d, g: 0.09, a, lp: 500, lp2: 2000, am: 11, amd: 0.5, rel: 0.04, lin: true });
      T(b, { type: 'square', f: 140, f2: 480, d, g: 0.03, a, lp: 1500, rel: 0.04, lin: true });
      T(b, { type: 'sine', f: 900, f2: 3400, d, g: 0.035, a, fm: 7, fmd: 30, rel: 0.04 });
      const n = Math.floor(8 + d * 8);
      for (let i = 0; i < n; i++) { const k = Math.pow(i / n, 1.6); N(b, { ft: 'bandpass', f: R(2800, 6500), d: 0.02, g: 0.05 + 0.1 * k, q: 5, at: Math.min(d - 0.05, d * k + R(0, 0.05)) }); }
    });
    D('empPop', b => {
      T(b, { type: 'sine', f: 210, f2: 36, d: 0.4, g: 0.5, a: 0.002 });
      N(b, { ft: 'bandpass', f: 3200, f2: 400, d: 0.28, g: 0.5, q: 0.8 });
      T(b, { type: 'sawtooth', f: 1900, f2: 90, d: 0.16, g: 0.2, lp: 3200 });
      N(b, { ft: 'highpass', f: 6000, d: 0.1, g: 0.3 });
      T(b, { type: 'sawtooth', f: 130, f2: 100, d: 0.35, g: 0.1, lp: 900, am: 55, at: 0.02 });
      for (let i = 0; i < 6; i++) N(b, { ft: 'bandpass', f: R(2500, 6000), d: 0.02, g: 0.12, q: 5, at: 0.08 + i * R(0.03, 0.06) });
    });

    // ---- Tornado: whoosh at cast, wind loop (fx tornadoStart) swelling with a whistle, lift/land
    D('cast_tornado', b => {
      N(b, { ft: 'bandpass', f: 200, f2: 1300, d: 0.6, g: 0.55, q: 1.2, a: 0.22 });
      T(b, { type: 'sawtooth', f: 70, f2: 115, d: 0.5, g: 0.09, lp: 320, a: 0.1 });
      T(b, { type: 'sine', f: 700, f2: 1150, d: 0.5, g: 0.04, a: 0.2, fm: 6, fmd: 40 });
    });
    D('tornadoLift', b => {
      T(b, { type: 'sine', f: 200, f2: 520, d: 0.25, g: 0.14, a: 0.04 });
      N(b, { ft: 'bandpass', f: 500, f2: 1600, d: 0.25, g: 0.18, q: 1.5, a: 0.05 });
    });
    D('tornadoLand', b => {
      T(b, { type: 'sine', f: 110, f2: 50, d: 0.18, g: 0.3, a: 0.003 });
      N(b, { ft: 'lowpass', f: 500, d: 0.12, g: 0.25 });
    });

    // ---- Alacrity: bright sparkle run + purr
    D('cast_alacrity', b => {
      const sc = [1046.5, 1318.5, 1568, 1760, 2093, 2349, 2637, 3136];
      for (let i = 0; i < 8; i++) {
        const f = sc[i] * (R(0.99, 1.01));
        T(b, { type: 'sine', f, d: 0.24, g: 0.1, a: 0.002, at: i * 0.028 + R(0, 0.01) });
        T(b, { type: 'triangle', f: f * 2, d: 0.1, g: 0.03, a: 0.002, at: i * 0.028 });
      }
      N(b, { ft: 'highpass', f: 8000, d: 0.4, g: 0.05, a: 0.05 });
      T(b, { type: 'triangle', f: 1568, d: 0.45, g: 0.12, a: 0.01, at: 0.2 });
      T(b, { type: 'sawtooth', f: 88, f2: 96, d: 0.45, g: 0.1, lp: 320, am: 24, amd: 0.9, a: 0.05, at: 0.05 });
    });

    // ---- Sun Strike: light cue, high rising whine over the delay (fx sunstrikeBeam), deep boom + crackle (sunstrikeHit)
    D('castSun', b => {
      T(b, { type: 'triangle', f: 700, f2: 1400, d: 0.14, g: 0.15 });
      T(b, { type: 'sine', f: 2100, d: 0.12, g: 0.06, at: 0.03 });
      N(b, { ft: 'highpass', f: 6000, d: 0.1, g: 0.05 });
    });
    D('sunBeam', b => {
      const d = dur(b, 1.7), a = d * 0.85;
      T(b, { type: 'sine', f: 500, f2: 2700, d, g: 0.11, a, fm: 7, fmd: 25, rel: 0.04 });
      T(b, { type: 'triangle', f: 1000, f2: 3600, d, g: 0.03, a, rel: 0.04 });
      T(b, { type: 'sawtooth', f: 60, f2: 170, d, g: 0.05, a, lp: 400, rel: 0.04 });
      N(b, { ft: 'highpass', f: 4000, f2: 9500, d, g: 0.05, a, rel: 0.04 });
    });
    D('sunImpact', b => {
      N(b, { ft: 'highpass', f: 3000, d: 0.06, g: 0.4 });
      T(b, { type: 'sine', f: 105, f2: 28, d: 0.85, g: 0.6, a: 0.003 });
      N(b, { ft: 'lowpass', f: 2400, f2: 140, d: 0.65, g: 0.42 });
      N(b, { ft: 'bandpass', f: 420, f2: 200, d: 0.7, g: 0.2, a: 0.03, q: 0.8 });
      T(b, { type: 'triangle', f: 1568, f2: 600, d: 0.3, g: 0.11 });
      for (let i = 0; i < 9; i++) N(b, { ft: 'bandpass', f: R(2500, 6500), d: 0.02, g: R(0.08, 0.18), q: 4, at: 0.06 + R(0, 0.5) });
    });

    // ---- Forge Spirit: molten bubbling + summon thump; spirit attacks = small fire spit
    D('spiritSpawn', b => {
      T(b, { type: 'sine', f: 135, f2: 45, d: 0.32, g: 0.55, a: 0.004 });
      N(b, { ft: 'lowpass', f: 200, f2: 1300, d: 0.3, g: 0.32, a: 0.09, q: 0.8 });
      for (let i = 0; i < 9; i++) {
        const t = R(0.05, 0.6), f = R(280, 900);
        N(b, { ft: 'bandpass', f, f2: f * 1.8, d: R(0.04, 0.09), g: R(0.1, 0.2), q: 7, at: t });
        T(b, { type: 'sine', f: f * 0.6, f2: f * 1.3, d: 0.06, g: 0.08, at: t, a: 0.01 });
      }
      N(b, { ft: 'highpass', f: 5000, d: 0.35, g: 0.05, a: 0.1, at: 0.1 });
      T(b, { type: 'triangle', f: 330, f2: 660, d: 0.15, g: 0.1, at: 0.05 });
    });
    D('spiritSpit', b => {
      N(b, { ft: 'bandpass', f: 1900, f2: 700, d: 0.07, g: 0.2, q: 2 });
      T(b, { type: 'sine', f: 750, f2: 300, d: 0.07, g: 0.09 });
      N(b, { ft: 'highpass', f: 3500, d: 0.02, g: 0.14, at: 0.05 });
    });

    // ---- Chaos Meteor: cue, low approaching rumble (fx meteorFall dir, opt.dur = delay), impact, grind loop in engine
    D('castMeteor', b => {
      N(b, { ft: 'bandpass', f: 500, f2: 1200, d: 0.2, g: 0.2, q: 1.5 });
      T(b, { type: 'sawtooth', f: 200, f2: 400, d: 0.18, g: 0.1, lp: 1500 });
    });
    D('meteorWhistle', b => {
      const d = dur(b, 1.3), a = d * 0.8;
      N(b, { ft: 'lowpass', f: 80, f2: 520, d, g: 0.55, q: 0.8, a, rel: 0.05 });
      T(b, { type: 'sawtooth', f: 38, f2: 105, d, g: 0.16, a, lp: 200, lp2: 650, rel: 0.05 });
      N(b, { ft: 'bandpass', f: 600, f2: 2800, d, g: 0.14, q: 1, a, rel: 0.05 });
    });
    D('meteorLand', b => {
      N(b, { ft: 'highpass', f: 2500, d: 0.06, g: 0.35 });
      T(b, { type: 'sine', f: 110, f2: 26, d: 0.85, g: 0.62, a: 0.003 });
      N(b, { ft: 'lowpass', f: 950, f2: 90, d: 0.7, g: 0.5 });
      T(b, { type: 'sawtooth', f: 210, f2: 40, d: 0.3, g: 0.2, lp: 800 });
      for (let i = 0; i < 6; i++) N(b, { ft: 'bandpass', f: R(300, 900), d: 0.05, g: R(0.1, 0.2), q: 3, at: 0.1 + R(0, 0.45) });
    });

    // ---- Deafening Blast: sonic boom whoosh
    D('cast_deafeningblast', b => {
      N(b, { ft: 'bandpass', f: 300, f2: 3800, d: 0.5, g: 0.5, q: 1.2, a: 0.12 });
      T(b, { type: 'sine', f: 72, f2: 26, d: 0.65, g: 0.75, a: 0.004 });
      T(b, { type: 'sawtooth', f: 420, f2: 55, d: 0.26, g: 0.2, lp: 1500 });
      T(b, { type: 'sine', f: 1200, f2: 2600, d: 0.3, g: 0.07, a: 0.15 });
      N(b, { ft: 'highpass', f: 3000, d: 0.08, g: 0.3, at: 0.1 });
      N(b, { ft: 'lowpass', f: 700, f2: 100, d: 0.7, g: 0.3, at: 0.1 });
    });
    D('deafeningHit', b => {
      T(b, { type: 'sine', f: 160, f2: 60, d: 0.16, g: 0.3, a: 0.003 });
      N(b, { ft: 'bandpass', f: 1100, d: 0.07, g: 0.2, q: 1.2 });
    });

    // ---- items
    D('refresher', b => {
      [523.25, 783.99, 1046.5, 1567.98, 2093].forEach((f, i) => {
        T(b, { type: 'sine', f, d: 0.4, g: 0.18, a: 0.01, at: i * 0.06 });
        T(b, { type: 'sine', f: f * 2.76, d: 0.12, g: 0.03, at: i * 0.06 });
      });
      T(b, { type: 'sine', f: 130, f2: 260, d: 0.4, g: 0.2, a: 0.1 });
      N(b, { ft: 'highpass', f: 6000, f2: 11000, d: 0.5, g: 0.07, a: 0.1 });
    });
    const chainTicks = (b, n, at0, gap, g) => { for (let i = 0; i < n; i++) T(b, { type: 'square', f: R(1800, 3400), f2: R(900, 1500), d: 0.025, g, a: 0.002, at: at0 + i * gap + R(0, 0.012), lp: 5000 }); };
    const clang = (b, f, g, at) => [1, 2.76, 5.4].forEach((r, i) => T(b, { type: 'triangle', f: f * r, d: 0.34 - i * 0.09, g: g / (i + 1), a: 0.002, at: at || 0 }));
    D('atosLaunch', b => {
      N(b, { ft: 'bandpass', f: 1000, f2: 3200, d: 0.14, g: 0.14, q: 1.5, a: 0.02 });
      T(b, { type: 'sawtooth', f: 300, f2: 800, d: 0.15, g: 0.09, lp: 2000 });
      chainTicks(b, 7, 0.01, 0.03, 0.06);
    });
    D('atosHit', b => {
      clang(b, 520, 0.16);
      N(b, { ft: 'highpass', f: 3000, d: 0.05, g: 0.3 });
      T(b, { type: 'sine', f: 100, f2: 55, d: 0.25, g: 0.35, a: 0.003 });
      chainTicks(b, 4, 0.05, 0.035, 0.05);
    });
    D('fx:gleipnirLaunch', b => {
      N(b, { ft: 'bandpass', f: 700, f2: 2400, d: 0.2, g: 0.15, q: 1.5, a: 0.03 });
      T(b, { type: 'sawtooth', f: 200, f2: 600, d: 0.2, g: 0.08, lp: 1800 });
      chainTicks(b, 11, 0.01, 0.028, 0.06);
    });
    D('fx:gleipnirHit', b => {
      clang(b, 380, 0.18); clang(b, 410, 0.1, 0.05);
      N(b, { ft: 'highpass', f: 2500, d: 0.06, g: 0.3 });
      T(b, { type: 'sine', f: 85, f2: 45, d: 0.4, g: 0.4, a: 0.003 });
      T(b, { type: 'sawtooth', f: 90, d: 0.5, g: 0.06, lp: 400, am: 9, amd: 0.8, at: 0.1 });
      chainTicks(b, 8, 0.08, 0.04, 0.05);
    });
    D('castitem_gleipnir', b => { chainTicks(b, 4, 0, 0.04, 0.04); T(b, { type: 'sine', f: 300, f2: 500, d: 0.12, g: 0.1, a: 0.02 }); });
    // Orchid: eerie hollow chime (silence) on cast, burst when it ends
    D('castitem_orchid', b => {
      N(b, { ft: 'bandpass', f: 2200, f2: 500, d: 0.35, g: 0.08, q: 2, a: 0.1 });
      [880, 1318.5].forEach((f, i) => T(b, { type: 'sine', f, f2: f * 0.97, d: 0.9, g: 0.12, a: 0.03, at: i * 0.11, fm: 5.5, fmd: 8, det: i ? 11 : -7 }));
      T(b, { type: 'sine', f: 1760, d: 0.8, g: 0.04, a: 0.2, at: 0.1, det: 14 });
    });
    D('fx:orchidBurst', b => {
      T(b, { type: 'sine', f: 420, f2: 90, d: 0.3, g: 0.45, a: 0.003 });
      N(b, { ft: 'bandpass', f: 1600, f2: 260, d: 0.25, g: 0.38, q: 1 });
      N(b, { ft: 'highpass', f: 4500, d: 0.08, g: 0.22 });
      [1318.5, 987.77, 659.25].forEach((f, i) => T(b, { type: 'sine', f, d: 0.5, g: 0.1, a: 0.01, at: 0.05 + i * 0.07, fm: 6, fmd: 10 }));
    });
    D('hex', b => { // Vyse poof: smoke puff + wobbling descending croak + pop
      N(b, { ft: 'bandpass', f: 900, f2: 280, d: 0.24, g: 0.38, q: 0.8, a: 0.01 });
      T(b, { type: 'sine', f: 1000, f2: 90, d: 0.07, g: 0.2, a: 0.002 });
      [900, 700, 520, 400].forEach((f, i) => T(b, { type: 'square', f, f2: f * 0.7, d: 0.09, g: 0.1, at: 0.05 + i * 0.055, lp: 2500, fm: 28, fmd: f * 0.12 }));
      T(b, { type: 'triangle', f: 1760, f2: 2349, d: 0.15, g: 0.05, at: 0.02 });
    });
    D('blocked', b => {
      T(b, { type: 'triangle', f: 1200, f2: 1000, d: 0.14, g: 0.18 });
      N(b, { ft: 'highpass', f: 4000, d: 0.05, g: 0.2 });
      T(b, { type: 'sine', f: 2400, d: 0.25, g: 0.06, at: 0.02, fm: 7, fmd: 20 });
    });
    D('shiva', b => { // frost ring: outward sweep, low pulse, scattering glass
      N(b, { ft: 'bandpass', f: 700, f2: 5200, d: 0.65, g: 0.32, q: 2, a: 0.15 });
      N(b, { ft: 'highpass', f: 6000, d: 0.55, g: 0.06, a: 0.1 });
      T(b, { type: 'sine', f: 145, f2: 48, d: 0.55, g: 0.5, a: 0.004 });
      N(b, { ft: 'highpass', f: 3500, d: 0.06, g: 0.28 });
      for (let i = 0; i < 6; i++) T(b, { type: 'sine', f: R(1500, 3600), f2: 900, d: 0.25, g: 0.06, a: 0.003, at: 0.08 + i * 0.06 + R(0, 0.03) });
    });
    D('hammerStart', b => {
      T(b, { type: 'sawtooth', f: 90, f2: 210, d: 0.55, g: 0.12, lp: 500, a: 0.3 });
      N(b, { ft: 'bandpass', f: 380, f2: 1300, d: 0.5, g: 0.13, q: 1.2, a: 0.35 });
      T(b, { type: 'sine', f: 55, d: 0.3, g: 0.3, a: 0.01 });
    });
    D('hammerImpact', b => {
      T(b, { type: 'sine', f: 125, f2: 30, d: 0.55, g: 0.7, a: 0.003 });
      N(b, { ft: 'lowpass', f: 1300, f2: 110, d: 0.38, g: 0.6 });
      N(b, { ft: 'highpass', f: 3000, d: 0.06, g: 0.3 });
      clang(b, 160, 0.1, 0.01);
    });
    D('bkb', b => {
      [392, 587.33, 784, 1174.7].forEach((f, i) => T(b, { type: 'triangle', f, f2: f * 1.02, d: 0.5, g: 0.16, a: 0.02, at: i * 0.045 }));
      T(b, { type: 'sine', f: 1568, d: 0.5, g: 0.08, at: 0.1, fm: 6, fmd: 12 });
      T(b, { type: 'sine', f: 95, f2: 60, d: 0.3, g: 0.35, a: 0.005 });
      N(b, { ft: 'highpass', f: 5000, d: 0.3, g: 0.06, a: 0.1 });
    });
    D('blink', b => {
      N(b, { ft: 'bandpass', f: 3500, f2: 700, d: 0.12, g: 0.28, q: 1.5 });
      T(b, { type: 'sine', f: 2600, f2: 280, d: 0.1, g: 0.25, a: 0.002 });
      T(b, { type: 'sine', f: 400, f2: 2400, d: 0.12, g: 0.18, at: 0.1 });
      N(b, { ft: 'highpass', f: 5000, d: 0.08, g: 0.12, at: 0.1 });
    });

    // ---- hero / combat
    D('heroAttack', b => { // swing + thwack
      N(b, { ft: 'bandpass', f: 700, f2: 2400, d: 0.07, g: 0.1, q: 1, a: 0.03 });
      N(b, { ft: 'bandpass', f: 1500, d: 0.045, g: 0.33, q: 1, at: 0.06 });
      T(b, { type: 'sine', f: 200, f2: 80, d: 0.09, g: 0.3, a: 0.003, at: 0.06 });
    });
    D('dmgTick', b => { N(b, { ft: 'bandpass', f: 1500, d: 0.015, g: 0.1, q: 2 }); });
    D('boltWarn', b => { [0, 0.16, 0.32].forEach((t, i) => { T(b, { type: 'square', f: 880 + i * 110, d: 0.08, g: 0.13, a: 0.003, at: t, lp: 3000 }); }); });
    D('boltHit', b => { // stun bolt
      T(b, { type: 'sawtooth', f: 1200, f2: 90, d: 0.28, g: 0.25, lp: 3000 });
      N(b, { ft: 'bandpass', f: 2500, f2: 600, d: 0.15, g: 0.32, q: 1 });
      T(b, { type: 'sine', f: 75, d: 0.3, g: 0.4 });
      T(b, { type: 'sine', f: 1900, d: 0.45, g: 0.05, am: 40, at: 0.05, a: 0.02 });
    });
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
  const MAXN = { dmgTick: 2, hit: 3, freezeTick: 3, failSoft: 1, orbQ: 3, orbW: 3, orbE: 3, comboStep: 2, blocked: 2, timerTick: 1, spiritSpit: 3, tornadoLift: 2, tornadoLand: 2, heroAttack: 2 };
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
    // pos {x,y} optional; opt {vol, dur}. Returns true if the sound was sent to the synth.
    play(id, pos, opt) {
      if (!SFX || !SFX.playEx || !this.w) return false;
      if (!soundOn() || !SFX.has(id)) return false;
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
      SFX.playEx(id, { vol, pan, dur: opt && opt.dur });
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
      const isHero = id => w.hero && id === w.hero.id;
      const posOf = id => { const e = w.get(id); return e ? { x: e.x, y: e.y } : null; };
      const on = (t, f) => off.push(w.on(t, f));
      const stopH = h => { if (h) h.forEach(l => l.stop()); return null; };
      let rumble = null, hammer = null, tornado = null;

      on('orb', p => { if (isHero(p.unit)) P('orb' + p.orb); });
      on('invoke', p => { if (isHero(p.unit)) P(p.swapped ? 'invokeSwap' : 'invoke'); });
      on('fail', p => {
        if (!isHero(p.unit)) return;
        const n = performance.now(); if (n - lastFail < 250) return; lastFail = n; P('failSoft');
      });

      // spell casts: lighter cue where a delayed fx carries the main sound
      const CAST = { sunstrike: 'castSun', chaosmeteor: 'castMeteor', forgespirit: null };
      on('cast', p => {
        const at = isHero(p.unit) ? null : (p.x != null ? p : posOf(p.unit));
        if (p.kind === 'item') { P('castitem_' + p.ability, at); return; }
        const id = Object.prototype.hasOwnProperty.call(CAST, p.ability) ? CAST[p.ability] : 'cast_' + p.ability;
        if (id) P(id, at);
      });

      on('hit', p => {
        if (p.ability !== 'attack') return;
        const s = w.get(p.src);
        if (s && s.kind === 'spirit') P('spiritSpit', posOf(p.src));
        else if (isHero(p.src)) P('heroAttack', posOf(p.target));
        else P('hit', posOf(p.target));
      });
      on('damage', p => {
        if (!(p.dealt > 0)) return;
        if (isHero(p.target)) { P('hurt', null, { vol: 0.6 }); return; }
        P('dmgTick', posOf(p.target), { vol: Math.min(1.4, 0.6 + p.dealt / 300) });
      });

      on('blink', p => { if (!isHero(p.unit)) P('dummyBlink', p); });

      on('fx', f => {
        const pos = f;
        switch (f.name) {
          case 'sunstrikeBeam': P('sunBeam', pos, { dur: f.delay }); break;
          case 'sunstrikeHit': P('sunImpact', pos); break;
          case 'empCharge': P('empCrackle', pos, { dur: f.delay }); break;
          case 'empBlast': P('empPop', pos); break;
          case 'meteorFall':
            if (f.dir != null) P('meteorWhistle', pos, { dur: f.delay });
            else if (hammer) { hammer.stop(); hammer = null; }
            break;
          case 'meteorLand':
            P('meteorLand', pos);
            rumble = stopH(rumble);
            rumble = [
              S.loop({ ft: 'lowpass', f: 150, q: 1.3, g: 0.42, wob: 6, atk: 0.3, rel: 0.5, osc: [{ type: 'sawtooth', f: 48, g: 0.05, lp: 200, fm: 3 }] }, pos, 8),
              S.loop({ ft: 'bandpass', f: 420, q: 4, g: 0.1, wob: 17, atk: 0.4, rel: 0.4 }, pos, 8), // rolling grind
            ];
            break;
          case 'meteorEnd': rumble = stopH(rumble); break;
          case 'iceWall': P('iceWall', pos); break;
          case 'iceWallEnd': P('iceWallEnd', pos); break;
          case 'coldsnapFreeze': P('freezeTick', pos); break;
          case 'forgeSpirit': P('spiritSpawn', pos); break;
          case 'ghostBreak': P('ghostBreak', pos); break;
          case 'tornadoStart':
            tornado = stopH(tornado);
            tornado = [S.loop({ ft: 'bandpass', f: 250, f2: 800, sweep: 2.5, q: 1.4, g: 0.3, atk: 1, rel: 0.8, wob: 2.5,
              osc: [{ type: 'sine', f: 620, f2: 980, g: 0.018, fm: 4, fmd: 60 }, { type: 'triangle', f: 1240, f2: 1560, g: 0.007, fm: 6, fmd: 80 }] }, pos, 10)];
            break;
          case 'tornadoEnd': tornado = stopH(tornado); break;
          case 'tornadoLift': P('tornadoLift', pos); break;
          case 'tornadoLand': P('tornadoLand', pos); break;
          case 'deafeningHit': P('deafeningHit', pos); break;
          case 'refresh': P('refresher', pos); break;
          case 'atosLaunch': P('atosLaunch', pos); break;
          case 'atosHit': P('atosHit', pos); break;
          case 'atosBlocked': case 'hexBlocked': case 'boltBlocked': case 'gleipnirBlocked': P('blocked', pos); break;
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
          default: if (f.name && SFX && SFX.has('fx:' + f.name)) P('fx:' + f.name, pos, { dur: f.dur || f.delay }); break; // gleipnirLaunch/Hit, orchidBurst...
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
})(typeof window !== 'undefined' ? window : globalThis);
