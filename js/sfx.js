// IT.Sfx: maps sim events to layered synth voices (extends the SFX DSL in audio.js). attach(w) subscribes; detaches the previous world.
// Voices are modelled on the Dota 2 Invoker sound layers (dota2.fandom.com/wiki/Invoker/Sounds): every ability has its own
// cast / delay-charge / impact / loop-for-lifetime / per-target hit / end layer, mixed at the wiki's relative levels.
// Each voice = transient (noise/click) + body (oscillators) + tail (shimmer/rumble), randomized slightly per play (b.pv/b.gv).
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const SFX = G.SFX || IT.SFX;
  const MASTER = 0.5, HALF_VIEW = 1440, FALLOFF = 2600;
  const R = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // ---------------------------------------------------------------- voices
  if (SFX && SFX.define) {
    const T = SFX.T, N = SFX.N, D = SFX.define;
    const dur = (b, d) => Math.max(0.4, (b.opt && b.opt.dur) || d);
    // metallic clang: inharmonic partials
    const clang = (b, f, g, at) => [1, 2.76, 5.4, 8.9].forEach((r, i) => T(b, { type: i ? 'sine' : 'triangle', f: f * r, d: 0.36 - i * 0.07, g: g / (i + 1), a: 0.002, at: at || 0 }));
    const chainTicks = (b, n, at0, gap, g) => { for (let i = 0; i < n; i++) T(b, { type: 'square', f: R(1800, 3400), f2: R(900, 1500), d: 0.025, g, a: 0.002, at: at0 + i * gap + R(0, 0.012), lp: 5000 }); };
    const crackles = (b, n, t0, t1, g, f0, f1) => { for (let i = 0; i < n; i++) N(b, { ft: 'bandpass', f: R(f0, f1), d: 0.018, g: g * R(0.6, 1.2), q: 6, at: R(t0, t1) }); };

    // ---- orbs: icy chime / electric zip / fiery whoosh (Quas/Wex/Exort have no sounds in the game; these are UI feedback)
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

    // ================================================================= hero attacks
    // Invoker: pre-attack (wind-up swish) + projectile launch (magic zip) + impact (soft arcane pop, plays at 50%)
    D('atkPre', b => {
      N(b, { ft: 'bandpass', f: 500, f2: 1900, d: 0.14, g: 0.11, q: 1.2, a: 0.07 });
      T(b, { type: 'sine', f: 420, f2: 880, d: 0.13, g: 0.06, a: 0.06 });
      T(b, { type: 'sine', f: 2600, d: 0.1, g: 0.025, at: 0.05, fm: 9, fmd: 30 });
    });
    D('atkLaunch', b => {
      N(b, { ft: 'bandpass', f: 3000, f2: 900, d: 0.09, g: 0.17, q: 1.6 });
      T(b, { type: 'sine', f: 1500, f2: 480, d: 0.1, g: 0.16, a: 0.003 });
      T(b, { type: 'triangle', f: 2300, f2: 1100, d: 0.07, g: 0.05, a: 0.002 });
      T(b, { type: 'sine', f: 190, f2: 120, d: 0.07, g: 0.12, a: 0.003 });
    });
    D('atkImpact', b => {
      N(b, { ft: 'bandpass', f: 1700, d: 0.05, g: 0.3, q: 1 });
      T(b, { type: 'sine', f: 280, f2: 90, d: 0.1, g: 0.3, a: 0.003 });
      T(b, { type: 'sine', f: 2200, f2: 1500, d: 0.12, g: 0.05, at: 0.01 });
      N(b, { ft: 'highpass', f: 5000, d: 0.03, g: 0.08, at: 0.01 });
    });
    // Forge Spirit: 4 launch variants (fire spits) + 4 impact variants (sizzling splats)
    D('spiritLaunch', b => {
      const k = Math.floor(Math.random() * 4), f = [1500, 1900, 1250, 2200][k];
      N(b, { ft: 'bandpass', f, f2: f * 0.38, d: 0.08, g: 0.2, q: 2 });
      T(b, { type: 'sine', f: f * 0.45, f2: f * 0.17, d: 0.08, g: 0.1 });
      T(b, { type: 'sawtooth', f: 160 + k * 25, f2: 90, d: 0.09, g: 0.07, lp: 700 });
      N(b, { ft: 'highpass', f: 3500, d: 0.02, g: 0.12, at: 0.05 });
    });
    D('spiritImpact', b => {
      const k = Math.floor(Math.random() * 4), f = [700, 950, 560, 1200][k];
      N(b, { ft: 'lowpass', f: 2200, f2: 300, d: 0.13, g: 0.26 });
      T(b, { type: 'sine', f: 200 - k * 15, f2: 70, d: 0.1, g: 0.28, a: 0.003 });
      N(b, { ft: 'bandpass', f, d: 0.04, g: 0.2, q: 3, at: 0.01 });
      crackles(b, 3, 0.03, 0.14, 0.09, 3000, 6500);
    });
    D('genHit', b => { N(b, { ft: 'highpass', f: 2000, d: 0.02, g: 0.3, q: 0.7 }); T(b, { type: 'sine', f: 180, f2: 80, d: 0.06, g: 0.2, a: 0.003 }); });
    D('footstep', b => { // soft boot on stone/sand; random brightness gives the 7 "variants"
      const f = R(105, 190);
      T(b, { type: 'sine', f, f2: f * 0.5, d: 0.07, g: 0.34, a: 0.002 });
      N(b, { ft: 'bandpass', f: R(450, 1100), d: 0.05, g: 0.2, q: 1.2 });
      N(b, { ft: 'highpass', f: R(3000, 5200), d: 0.02, g: 0.05, at: 0.005 });
    });

    // ================================================================= Cold Snap
    // cast = Time Walk-like rush + glassy ring (at 50%); target = freeze crystallise; proc = Lich-projectile-like icy zip + shards (50%)
    D('cast_coldsnap', b => {
      N(b, { ft: 'bandpass', f: 350, f2: 4800, d: 0.2, g: 0.34, q: 1.1, a: 0.1 });
      N(b, { ft: 'highpass', f: 5000, f2: 9000, d: 0.16, g: 0.12, a: 0.08 });
      T(b, { type: 'sine', f: 500, f2: 2600, d: 0.18, g: 0.1, lin: true, a: 0.05 });
      T(b, { type: 'sine', f: 140, f2: 80, d: 0.16, g: 0.2, a: 0.005, at: 0.1 });
      T(b, { type: 'sine', f: 3136, f2: 2900, d: 0.4, g: 0.07, a: 0.01, at: 0.17, fm: 8, fmd: 40 });
      T(b, { type: 'sine', f: 2093, d: 0.3, g: 0.05, at: 0.19 });
    });
    D('csTarget', b => {
      N(b, { ft: 'highpass', f: 5000, f2: 2500, d: 0.07, g: 0.36, q: 0.8 });
      N(b, { ft: 'bandpass', f: 3500, d: 0.035, g: 0.25, q: 6, at: 0.03 });
      T(b, { type: 'sine', f: 1900, f2: 700, d: 0.2, g: 0.18, a: 0.004 });
      T(b, { type: 'sine', f: 170, f2: 90, d: 0.14, g: 0.25, a: 0.003 });
      T(b, { type: 'triangle', f: 2500, d: 0.42, g: 0.05, a: 0.02, fm: 9, fmd: 40, at: 0.04 });
      N(b, { ft: 'highpass', f: 8000, d: 0.3, g: 0.05, a: 0.03, at: 0.05 });
      crackles(b, 4, 0.04, 0.22, 0.1, 4000, 8000);
    });
    D('csProc', b => {
      const f = R(3000, 4000);
      T(b, { type: 'sine', f, f2: f * 0.28, d: 0.13, g: 0.2, a: 0.002 });
      N(b, { ft: 'bandpass', f: 5000, f2: 2000, d: 0.07, g: 0.2, q: 2 });
      crackles(b, 3, 0.04, 0.16, 0.12, 5000, 9000);
      T(b, { type: 'sine', f: R(2000, 3000), d: 0.12, g: 0.06, at: 0.05 });
    });

    // ================================================================= Ghost Walk: breathy fade + reverse swell + shimmer
    D('cast_ghostwalk', b => {
      N(b, { ft: 'bandpass', f: 250, f2: 1600, d: 0.45, g: 0.5, q: 1.6, a: 0.38 });
      N(b, { ft: 'bandpass', f: 1300, f2: 450, d: 0.7, g: 0.14, q: 0.8, a: 0.05, at: 0.4 });
      T(b, { type: 'sine', f: 330, f2: 210, d: 0.85, g: 0.07, a: 0.15, fm: 5, fmd: 6 });
      T(b, { type: 'sine', f: 497, f2: 320, d: 0.75, g: 0.04, a: 0.15, det: 9, at: 0.05 });
      [2349, 1760, 1318.5, 988].forEach((f, i) => T(b, { type: 'sine', f, d: 0.28, g: 0.035, a: 0.01, at: 0.42 + i * 0.09 }));
    });
    D('ghostBreak', b => {
      N(b, { ft: 'bandpass', f: 500, f2: 2600, d: 0.15, g: 0.22, q: 1.5, a: 0.12 });
      T(b, { type: 'sine', f: 900, f2: 200, d: 0.12, g: 0.2, at: 0.13 });
      N(b, { ft: 'highpass', f: 4000, d: 0.06, g: 0.15, at: 0.13 });
    });

    // ================================================================= Ice Wall
    // cast = low-pitched Cold Feet crackle (60%); build = grinding crystal growth; per-tick crunch on each damaged enemy (30-50%); end shatter
    D('cast_icewall', b => {
      N(b, { ft: 'bandpass', f: 2400, f2: 700, d: 0.34, g: 0.3, q: 3, a: 0.02, am: 34, amd: 0.9 });
      T(b, { type: 'sine', f: 220, f2: 110, d: 0.3, g: 0.2, a: 0.01 });
      T(b, { type: 'sine', f: 88, f2: 48, d: 0.38, g: 0.4, a: 0.005 });
      N(b, { ft: 'lowpass', f: 600, f2: 150, d: 0.3, g: 0.22, a: 0.01 });
      crackles(b, 5, 0.02, 0.3, 0.14, 1500, 3500);
    });
    D('iceWall', b => {
      N(b, { ft: 'bandpass', f: 1000, f2: 380, d: 0.6, g: 0.34, q: 4, a: 0.03, am: 26, amd: 0.9 });
      N(b, { ft: 'lowpass', f: 450, f2: 200, d: 0.55, g: 0.3, am: 13, amd: 0.8 });
      T(b, { type: 'sine', f: 95, f2: 52, d: 0.35, g: 0.4, a: 0.005 });
      [1568, 1760, 2093, 2349, 2637, 3136].forEach((f, i) => T(b, { type: 'sine', f: f * R(0.98, 1.02), f2: f * 0.9, d: 0.22, g: 0.07, a: 0.003, at: 0.04 + i * 0.07 }));
      N(b, { ft: 'highpass', f: 6000, d: 0.5, g: 0.06, a: 0.05, at: 0.05 });
    });
    D('iceCrunch', b => { // frosty crunch, pitch/colour randomised per play (the 6 target variants)
      N(b, { ft: 'bandpass', f: R(1400, 3600), d: 0.06, g: 0.3, q: 2 });
      N(b, { ft: 'lowpass', f: R(600, 1100), d: 0.07, g: 0.2 });
      T(b, { type: 'sine', f: R(450, 900), f2: 200, d: 0.06, g: 0.12, a: 0.002 });
      crackles(b, 2, 0.02, 0.09, 0.1, 4500, 8500);
    });
    D('iceWallEnd', b => {
      N(b, { ft: 'highpass', f: 4500, f2: 2500, d: 0.35, g: 0.25, q: 0.7 });
      for (let i = 0; i < 7; i++) N(b, { ft: 'bandpass', f: R(3000, 8000), d: 0.02, g: 0.14, q: 7, at: R(0, 0.3) });
      T(b, { type: 'sine', f: 1400, f2: 500, d: 0.2, g: 0.1 });
      T(b, { type: 'sine', f: 100, f2: 50, d: 0.25, g: 0.2, a: 0.004 });
    });

    // ================================================================= E.M.P.
    // cast = electric zap on Invoker; target = crackling hum that swells over the delay; effect = deep discharge + zap; drain = per-unit mana-burn siphon
    D('cast_emp', b => {
      T(b, { type: 'sawtooth', f: 90, f2: 340, d: 0.2, g: 0.1, lin: true, a: 0.03, lp: 1400, am: 36, amd: 0.8 });
      T(b, { type: 'sine', f: 400, f2: 1300, d: 0.16, g: 0.09, lin: true, a: 0.02 });
      N(b, { ft: 'highpass', f: 6000, d: 0.12, g: 0.07 });
      crackles(b, 4, 0.02, 0.18, 0.1, 3000, 7000);
    });
    D('empCrackle', b => {
      const d = dur(b, 2.9), a = d * 0.85;
      T(b, { type: 'sawtooth', f: 70, f2: 240, d, g: 0.09, a, lp: 500, lp2: 2000, am: 11, amd: 0.5, rel: 0.04, lin: true });
      T(b, { type: 'square', f: 140, f2: 480, d, g: 0.03, a, lp: 1500, rel: 0.04, lin: true });
      T(b, { type: 'sine', f: 900, f2: 3400, d, g: 0.035, a, fm: 7, fmd: 30, rel: 0.04 });
      T(b, { type: 'sine', f: 220, f2: 520, d, g: 0.05, a: d * 0.7, am: 14, amd: 0.9, rel: 0.04, lin: true }); // pulsing mana-drain hum
      const n = Math.floor(6 + d * 5);
      for (let i = 0; i < n; i++) { const k = Math.pow(i / n, 1.6); N(b, { ft: 'bandpass', f: R(2800, 6500), d: 0.02, g: 0.05 + 0.1 * k, q: 5, at: Math.min(d - 0.05, d * k + R(0, 0.05)) }); }
    });
    D('empPop', b => {
      T(b, { type: 'sine', f: 210, f2: 36, d: 0.45, g: 0.5, a: 0.002 });
      N(b, { ft: 'bandpass', f: 3200, f2: 400, d: 0.28, g: 0.5, q: 0.8 });
      T(b, { type: 'sawtooth', f: 1900, f2: 90, d: 0.16, g: 0.2, lp: 3200 });
      N(b, { ft: 'highpass', f: 6000, d: 0.1, g: 0.3 });
      T(b, { type: 'sawtooth', f: 130, f2: 100, d: 0.35, g: 0.1, lp: 900, am: 55, at: 0.02 });
      N(b, { ft: 'lowpass', f: 500, f2: 80, d: 0.5, g: 0.3, at: 0.02 });
      crackles(b, 6, 0.08, 0.4, 0.12, 2500, 6000);
    });
    D('empDrain', b => {
      T(b, { type: 'sawtooth', f: 1300, f2: 300, d: 0.14, g: 0.1, lp: 3000 });
      T(b, { type: 'sine', f: 700, f2: 2600, d: 0.14, g: 0.07, lin: true, at: 0.04 });
      crackles(b, 3, 0, 0.12, 0.1, 3000, 7000);
    });

    // ================================================================= Tornado
    // cast = wind whoosh (Dark Artistry: darker, with a sub drop); travel loop in engine; target = gust lift (80%); landing = body thuds (25-35%)
    D('cast_tornado', b => {
      N(b, { ft: 'bandpass', f: 200, f2: 1300, d: 0.6, g: 0.55, q: 1.2, a: 0.22 });
      T(b, { type: 'sawtooth', f: 70, f2: 115, d: 0.5, g: 0.09, lp: 320, a: 0.1 });
      T(b, { type: 'sine', f: 700, f2: 1150, d: 0.5, g: 0.04, a: 0.2, fm: 6, fmd: 40 });
    });
    D('cast_tornado_dark', b => {
      N(b, { ft: 'bandpass', f: 110, f2: 800, d: 0.8, g: 0.55, q: 1.0, a: 0.3 });
      N(b, { ft: 'lowpass', f: 400, f2: 80, d: 0.7, g: 0.3, at: 0.15 });
      T(b, { type: 'sawtooth', f: 46, f2: 80, d: 0.75, g: 0.2, lp: 240, a: 0.2 });
      T(b, { type: 'sawtooth', f: 65, f2: 113, d: 0.6, g: 0.07, lp: 400, a: 0.2, det: 30 }); // tritone-ish growl
      T(b, { type: 'sine', f: 480, f2: 300, d: 0.7, g: 0.04, a: 0.3, fm: 4, fmd: 30 });
      T(b, { type: 'sine', f: 52, f2: 30, d: 0.5, g: 0.45, a: 0.004, at: 0.05 });
    });
    D('tornadoLift', b => { // gust snatching the unit up
      const f = R(380, 820);
      N(b, { ft: 'bandpass', f, f2: f * R(2.2, 3.4), d: 0.26, g: 0.2, q: 1.5, a: 0.05 });
      T(b, { type: 'sine', f: R(180, 240), f2: R(460, 600), d: 0.26, g: 0.14, a: 0.04 });
      T(b, { type: 'triangle', f: R(900, 1400), f2: R(1500, 2200), d: 0.18, g: 0.03, a: 0.05, fm: 7, fmd: 40 });
    });
    D('tornadoLand', b => { // soft body thud
      T(b, { type: 'sine', f: R(90, 135), f2: 42, d: 0.17, g: 0.36, a: 0.003 });
      N(b, { ft: 'lowpass', f: R(350, 650), d: 0.12, g: 0.26 });
      N(b, { ft: 'bandpass', f: R(900, 1500), d: 0.04, g: 0.1, q: 1.4, at: 0.01 });
    });
    D('twisterWhirl', b => { // scepter twister lifetime swirl
      const d = dur(b, 2);
      N(b, { ft: 'bandpass', f: 300, f2: 950, d, g: 0.2, q: 1.6, a: d * 0.2, rel: 0.2, am: 3, amd: 0.5 });
      T(b, { type: 'sine', f: 560, f2: 820, d, g: 0.015, a: d * 0.25, fm: 5, fmd: 40, rel: 0.2 });
    });

    // ================================================================= Alacrity: electric buzz charge into a bright surge
    D('cast_alacrity', b => {
      T(b, { type: 'sawtooth', f: 90, f2: 340, d: 0.36, g: 0.11, a: 0.25, lp: 700, lp2: 3200, am: 32, amd: 0.85, lin: true });
      T(b, { type: 'square', f: 180, f2: 700, d: 0.3, g: 0.03, a: 0.22, lp: 1800, lin: true });
      for (let i = 0; i < 8; i++) N(b, { ft: 'bandpass', f: R(3000, 7500), d: 0.018, g: 0.05 + i * 0.015, q: 6, at: 0.02 + i * 0.04 + R(0, 0.02) });
      T(b, { type: 'triangle', f: 880, f2: 1760, d: 0.12, g: 0.14, at: 0.33 });
      T(b, { type: 'sine', f: 1568, d: 0.4, g: 0.1, a: 0.004, at: 0.36 });
      T(b, { type: 'sine', f: 2349, d: 0.3, g: 0.06, at: 0.38 });
      T(b, { type: 'sine', f: 200, f2: 120, d: 0.2, g: 0.3, a: 0.005, at: 0.34 });
      N(b, { ft: 'highpass', f: 7000, d: 0.3, g: 0.06, a: 0.02, at: 0.34 });
      T(b, { type: 'sawtooth', f: 96, d: 0.4, g: 0.05, lp: 320, am: 26, amd: 0.9, at: 0.4 }); // purr tail
    });

    // ================================================================= Sun Strike
    // castSun = soft cue on Invoker; sunBeam = at the target for the whole delay: rising holy chimes + pad; sunImpact = bright searing blast
    D('castSun', b => {
      T(b, { type: 'triangle', f: 700, f2: 1400, d: 0.14, g: 0.11 });
      T(b, { type: 'sine', f: 2100, d: 0.12, g: 0.05, at: 0.03 });
    });
    D('sunBeam', b => {
      const d = dur(b, 1.7), a = d * 0.85, sc = [784, 880, 988, 1175, 1318.5, 1568, 1760, 1976, 2349];
      T(b, { type: 'triangle', f: 330, f2: 990, d, g: 0.06, a, fm: 5, fmd: 8, rel: 0.04 });
      T(b, { type: 'sine', f: 660, f2: 1980, d, g: 0.035, a, rel: 0.04, det: 8 });
      T(b, { type: 'sawtooth', f: 60, f2: 170, d, g: 0.04, a, lp: 400, rel: 0.04 });
      N(b, { ft: 'highpass', f: 4000, f2: 9500, d, g: 0.04, a, rel: 0.04 });
      const n = Math.max(5, Math.round(d * 5));
      for (let i = 0; i < n; i++) {
        const k = i / (n - 1), f = sc[Math.min(sc.length - 1, Math.floor(k * sc.length))], at = Math.min(d - 0.12, d * Math.pow(i / n, 0.85));
        T(b, { type: 'sine', f, d: 0.4, g: 0.04 + 0.07 * k, a: 0.003, at });
        T(b, { type: 'sine', f: f * 2.76, d: 0.14, g: 0.015 + 0.02 * k, a: 0.002, at });
      }
    });
    D('sunImpact', b => {
      N(b, { ft: 'highpass', f: 3000, d: 0.06, g: 0.4 });
      T(b, { type: 'sine', f: 105, f2: 28, d: 0.85, g: 0.6, a: 0.003 });
      N(b, { ft: 'lowpass', f: 2400, f2: 140, d: 0.65, g: 0.42 });
      N(b, { ft: 'bandpass', f: 420, f2: 200, d: 0.7, g: 0.2, a: 0.03, q: 0.8 });
      N(b, { ft: 'bandpass', f: 4200, f2: 1600, d: 0.55, g: 0.2, a: 0.02, q: 0.9 }); // searing hiss
      [1568, 2093, 2637].forEach((f, i) => T(b, { type: 'sine', f, f2: f * 0.5, d: 0.5, g: 0.07, a: 0.004, at: i * 0.02 }));
      T(b, { type: 'triangle', f: 1568, f2: 600, d: 0.3, g: 0.11 });
      for (let i = 0; i < 9; i++) N(b, { ft: 'bandpass', f: R(2500, 6500), d: 0.02, g: R(0.08, 0.18), q: 4, at: 0.06 + R(0, 0.5) });
    });
    D('cataclysm', b => {
      const d = 1.2;
      N(b, { ft: 'lowpass', f: 90, f2: 700, d, g: 0.4, a: d * 0.8, rel: 0.1 });
      T(b, { type: 'sawtooth', f: 40, f2: 110, d, g: 0.12, a: d * 0.8, lp: 300, rel: 0.1 });
      [784, 1175, 1568, 2349].forEach((f, i) => T(b, { type: 'sine', f, d: 0.7, g: 0.05, a: 0.02, at: 0.2 + i * 0.2 }));
    });

    // ================================================================= Forge Spirit
    // cast = low-pitched dark cast on Invoker; spawn = molten forge clang + whoosh + bubbles at the spirit; expire = ember fade
    D('cast_forgespirit', b => {
      T(b, { type: 'sawtooth', f: 74, f2: 52, d: 0.5, g: 0.16, lp: 320, a: 0.06 });
      T(b, { type: 'sawtooth', f: 112, f2: 78, d: 0.4, g: 0.06, lp: 500, a: 0.05, fm: 5, fmd: 6 });
      T(b, { type: 'sine', f: 120, f2: 55, d: 0.32, g: 0.4, a: 0.004 });
      N(b, { ft: 'lowpass', f: 240, f2: 900, d: 0.35, g: 0.28, a: 0.15, q: 0.8 });
      T(b, { type: 'sine', f: 340, f2: 180, d: 0.4, g: 0.04, a: 0.1, fm: 6, fmd: 10 });
    });
    D('spiritSpawn', b => {
      T(b, { type: 'sine', f: 135, f2: 45, d: 0.32, g: 0.5, a: 0.004 });
      clang(b, 310, 0.17, 0.02); // forge anvil strike
      N(b, { ft: 'bandpass', f: 300, f2: 2200, d: 0.38, g: 0.22, q: 1.2, a: 0.12 }); // hot whoosh
      N(b, { ft: 'lowpass', f: 200, f2: 1300, d: 0.3, g: 0.3, a: 0.09, q: 0.8 });
      for (let i = 0; i < 8; i++) {
        const t = R(0.1, 0.65), f = R(280, 900);
        N(b, { ft: 'bandpass', f, f2: f * 1.8, d: R(0.04, 0.09), g: R(0.1, 0.2), q: 7, at: t });
        T(b, { type: 'sine', f: f * 0.6, f2: f * 1.3, d: 0.06, g: 0.08, at: t, a: 0.01 });
      }
      N(b, { ft: 'highpass', f: 5000, d: 0.35, g: 0.05, a: 0.1, at: 0.1 });
    });
    D('spiritExpire', b => {
      N(b, { ft: 'bandpass', f: 1600, f2: 280, d: 0.4, g: 0.14, q: 1.2, a: 0.02 });
      T(b, { type: 'sine', f: 300, f2: 90, d: 0.32, g: 0.14, a: 0.01 });
      crackles(b, 4, 0.05, 0.35, 0.07, 2500, 5000);
    });

    // ================================================================= Chaos Meteor
    // cast = fiery launch whoosh; fall = incoming rumble (over the land delay); land = heavy boom; loop in engine; burn = Lina-like fire hit (50%); crumble at end (50%)
    D('castMeteor', b => {
      N(b, { ft: 'bandpass', f: 400, f2: 2200, d: 0.3, g: 0.26, q: 1.4, a: 0.08 });
      T(b, { type: 'sawtooth', f: 130, f2: 520, d: 0.25, g: 0.1, lp: 1500, a: 0.05 });
      N(b, { ft: 'lowpass', f: 300, f2: 90, d: 0.4, g: 0.2, at: 0.05 });
      crackles(b, 4, 0.05, 0.3, 0.09, 2000, 5000);
    });
    D('meteorWhistle', b => {
      const d = dur(b, 1.3), a = d * 0.8;
      N(b, { ft: 'lowpass', f: 80, f2: 520, d, g: 0.55, q: 0.8, a, rel: 0.05 });
      T(b, { type: 'sawtooth', f: 38, f2: 105, d, g: 0.16, a, lp: 200, lp2: 650, rel: 0.05 });
      N(b, { ft: 'bandpass', f: 600, f2: 2800, d, g: 0.14, q: 1, a, rel: 0.05 });
      T(b, { type: 'sine', f: 500, f2: 1700, d, g: 0.03, a, fm: 6, fmd: 30, rel: 0.04 });
    });
    D('meteorLand', b => {
      N(b, { ft: 'highpass', f: 2500, d: 0.06, g: 0.35 });
      T(b, { type: 'sine', f: 110, f2: 26, d: 0.9, g: 0.62, a: 0.003 });
      N(b, { ft: 'lowpass', f: 950, f2: 90, d: 0.75, g: 0.5 });
      T(b, { type: 'sawtooth', f: 210, f2: 40, d: 0.3, g: 0.2, lp: 800 });
      N(b, { ft: 'bandpass', f: 2200, f2: 700, d: 0.5, g: 0.12, q: 0.8, a: 0.02 }); // fire blossom
      for (let i = 0; i < 6; i++) N(b, { ft: 'bandpass', f: R(300, 900), d: 0.05, g: R(0.1, 0.2), q: 3, at: 0.1 + R(0, 0.45) });
    });
    D('meteorBurn', b => {
      N(b, { ft: 'bandpass', f: R(900, 1800), d: 0.08, g: 0.28, q: 1.2 });
      T(b, { type: 'sine', f: R(200, 280), f2: 90, d: 0.1, g: 0.24, a: 0.003 });
      N(b, { ft: 'lowpass', f: 1600, f2: 400, d: 0.14, g: 0.14, a: 0.01 });
      N(b, { ft: 'highpass', f: 4000, d: 0.025, g: 0.08 });
    });
    D('meteorCrumble', b => {
      N(b, { ft: 'lowpass', f: 1000, f2: 140, d: 0.85, g: 0.34, a: 0.02 });
      T(b, { type: 'sine', f: 75, f2: 34, d: 0.6, g: 0.32, a: 0.01 });
      for (let i = 0; i < 11; i++) N(b, { ft: 'bandpass', f: R(180, 900), d: 0.05, g: R(0.12, 0.26), q: 3, at: R(0, 0.75) });
      N(b, { ft: 'highpass', f: 3500, d: 0.2, g: 0.07, at: 0.03 });
    });

    // ================================================================= Deafening Blast: wide sonic boom (Dark Artistry: lower, growling)
    D('cast_deafeningblast', b => {
      N(b, { ft: 'bandpass', f: 300, f2: 3800, d: 0.5, g: 0.5, q: 1.2, a: 0.12 });
      T(b, { type: 'sine', f: 72, f2: 26, d: 0.7, g: 0.75, a: 0.004 });
      T(b, { type: 'sawtooth', f: 420, f2: 55, d: 0.26, g: 0.2, lp: 1500 });
      T(b, { type: 'sine', f: 1200, f2: 2600, d: 0.3, g: 0.07, a: 0.15 });
      N(b, { ft: 'highpass', f: 3000, d: 0.08, g: 0.3, at: 0.1 });
      N(b, { ft: 'lowpass', f: 700, f2: 100, d: 0.8, g: 0.3, at: 0.1 });
      N(b, { ft: 'bandpass', f: 900, f2: 200, d: 0.9, g: 0.14, q: 0.7, at: 0.2 }); // rolling wavefront
    });
    D('cast_deafeningblast_dark', b => {
      N(b, { ft: 'bandpass', f: 140, f2: 2200, d: 0.65, g: 0.5, q: 1.0, a: 0.2 });
      T(b, { type: 'sine', f: 52, f2: 20, d: 0.95, g: 0.85, a: 0.004 });
      T(b, { type: 'sawtooth', f: 260, f2: 38, d: 0.4, g: 0.24, lp: 900 });
      T(b, { type: 'sawtooth', f: 62, f2: 41, d: 0.8, g: 0.1, lp: 300, det: 40, a: 0.1 });
      T(b, { type: 'sine', f: 700, f2: 1500, d: 0.4, g: 0.05, a: 0.25, fm: 3, fmd: 30 });
      N(b, { ft: 'highpass', f: 2200, d: 0.1, g: 0.3, at: 0.18 });
      N(b, { ft: 'lowpass', f: 480, f2: 70, d: 1.0, g: 0.34, at: 0.15 });
    });
    D('deafeningHit', b => {
      T(b, { type: 'sine', f: 160, f2: 60, d: 0.16, g: 0.3, a: 0.003 });
      N(b, { ft: 'bandpass', f: 1100, d: 0.07, g: 0.2, q: 1.2 });
      T(b, { type: 'sine', f: 900, f2: 300, d: 0.1, g: 0.05, a: 0.004 });
    });

    // ================================================================= items
    // Refresher: bright shimmering reset
    D('refresher', b => {
      [523.25, 783.99, 1046.5, 1567.98, 2093, 3135.96].forEach((f, i) => {
        T(b, { type: 'sine', f, d: 0.42, g: 0.17, a: 0.01, at: i * 0.055 });
        T(b, { type: 'sine', f: f * 2.76, d: 0.12, g: 0.03, at: i * 0.055 });
      });
      T(b, { type: 'sine', f: 130, f2: 260, d: 0.4, g: 0.2, a: 0.1 });
      N(b, { ft: 'bandpass', f: 400, f2: 5000, d: 0.3, g: 0.14, q: 1.2, a: 0.2 }); // upward reset sweep
      N(b, { ft: 'highpass', f: 6000, f2: 11000, d: 0.55, g: 0.07, a: 0.1 });
      crackles(b, 5, 0.1, 0.5, 0.06, 5000, 9000);
    });
    // Rod of Atos: whip crack + chain (launch), root clank + magical bind (hit)
    D('atosLaunch', b => {
      N(b, { ft: 'bandpass', f: 800, f2: 3600, d: 0.12, g: 0.14, q: 1.4, a: 0.05 });
      T(b, { type: 'sawtooth', f: 300, f2: 800, d: 0.12, g: 0.07, lp: 2000, a: 0.04 });
      N(b, { ft: 'highpass', f: 3500, d: 0.03, g: 0.3, at: 0.1 }); // whip crack
      T(b, { type: 'sine', f: 1700, f2: 500, d: 0.08, g: 0.1, at: 0.1 });
      chainTicks(b, 7, 0.02, 0.03, 0.055);
    });
    D('atosHit', b => {
      clang(b, 520, 0.16);
      N(b, { ft: 'highpass', f: 3000, d: 0.05, g: 0.3 });
      T(b, { type: 'sine', f: 100, f2: 55, d: 0.25, g: 0.35, a: 0.003 });
      T(b, { type: 'sine', f: 250, f2: 420, d: 0.2, g: 0.07, a: 0.03, at: 0.04 }); // magical bind
      chainTicks(b, 4, 0.05, 0.035, 0.05);
    });
    D('whiff', b => { N(b, { ft: 'bandpass', f: 1800, f2: 500, d: 0.12, g: 0.1, q: 1.2, a: 0.02 }); });
    // Gleipnir: chain launch (rattling), heavy chains snapping around the target
    D('fx:gleipnirLaunch', b => {
      N(b, { ft: 'bandpass', f: 700, f2: 2400, d: 0.22, g: 0.15, q: 1.5, a: 0.03 });
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
    D('chainRelease', b => { chainTicks(b, 5, 0, 0.035, 0.045); T(b, { type: 'sine', f: 500, f2: 250, d: 0.12, g: 0.06, a: 0.004 }); });
    // Orchid Malevolence: ghostly cast, soul-burn sear on the target, burst when it ends
    D('castitem_orchid', b => {
      N(b, { ft: 'bandpass', f: 2200, f2: 500, d: 0.3, g: 0.08, q: 2, a: 0.08 });
      T(b, { type: 'sine', f: 880, f2: 1320, d: 0.25, g: 0.08, a: 0.03, fm: 5.5, fmd: 10 });
    });
    D('fx:orchidHit', b => { // soul burn: hollow wail + sizzling embers
      [880, 1318.5].forEach((f, i) => T(b, { type: 'sine', f, f2: f * 0.94, d: 0.9, g: 0.1, a: 0.03, at: i * 0.11, fm: 5.5, fmd: 8, det: i ? 11 : -7 }));
      T(b, { type: 'sine', f: 1760, d: 0.8, g: 0.04, a: 0.2, at: 0.1, det: 14 });
      N(b, { ft: 'bandpass', f: 3200, f2: 700, d: 0.5, g: 0.12, q: 2, a: 0.04 });
      T(b, { type: 'sawtooth', f: 160, f2: 90, d: 0.45, g: 0.06, lp: 500, a: 0.05 });
      crackles(b, 5, 0.05, 0.6, 0.06, 2500, 6000);
    });
    D('fx:orchidBurst', b => {
      T(b, { type: 'sine', f: 420, f2: 90, d: 0.3, g: 0.45, a: 0.003 });
      N(b, { ft: 'bandpass', f: 1600, f2: 260, d: 0.25, g: 0.38, q: 1 });
      N(b, { ft: 'highpass', f: 4500, d: 0.08, g: 0.22 });
      [1318.5, 987.77, 659.25].forEach((f, i) => T(b, { type: 'sine', f, d: 0.5, g: 0.1, a: 0.01, at: 0.05 + i * 0.07, fm: 6, fmd: 10 }));
    });
    // Scythe of Vyse: smoke poof, then a goat-ish "baa" (formant-filtered buzz with fast tremor)
    D('hex', b => {
      N(b, { ft: 'bandpass', f: 900, f2: 280, d: 0.24, g: 0.38, q: 0.8, a: 0.01 });
      T(b, { type: 'sine', f: 1000, f2: 90, d: 0.07, g: 0.2, a: 0.002 });
      T(b, { type: 'triangle', f: 1760, f2: 2349, d: 0.15, g: 0.05, at: 0.02 });
      T(b, { type: 'sawtooth', f: 330, f2: 250, d: 0.42, g: 0.13, at: 0.12, a: 0.03, lp: 1300, lp2: 700, fm: 30, fmd: 22, rel: 0.12 });
      T(b, { type: 'square', f: 660, f2: 500, d: 0.4, g: 0.04, at: 0.12, a: 0.03, lp: 1800, fm: 30, fmd: 30, rel: 0.1 });
      N(b, { ft: 'bandpass', f: 1500, d: 0.35, g: 0.05, q: 3, at: 0.13, a: 0.03, am: 28, amd: 0.9 });
    });
    D('hexEnd', b => {
      N(b, { ft: 'bandpass', f: 300, f2: 1100, d: 0.18, g: 0.28, q: 0.9, a: 0.02 });
      T(b, { type: 'sine', f: 200, f2: 900, d: 0.1, g: 0.14, a: 0.003 });
      T(b, { type: 'triangle', f: 1568, d: 0.12, g: 0.05, at: 0.08 });
    });
    D('blocked', b => {
      T(b, { type: 'triangle', f: 1200, f2: 1000, d: 0.14, g: 0.18 });
      N(b, { ft: 'highpass', f: 4000, d: 0.05, g: 0.2 });
      T(b, { type: 'sine', f: 2400, d: 0.25, g: 0.06, at: 0.02, fm: 7, fmd: 20 });
    });
    // Shiva's Guard: icy wave expanding outward (dur = r / speed)
    D('shiva', b => {
      const d = Math.max(0.5, (b.opt && b.opt.dur) || 0.7);
      N(b, { ft: 'bandpass', f: 600, f2: 5600, d, g: 0.34, q: 2, a: d * 0.25 });
      N(b, { ft: 'highpass', f: 6000, d: d * 0.9, g: 0.07, a: 0.1 });
      T(b, { type: 'sine', f: 145, f2: 48, d: 0.6, g: 0.5, a: 0.004 });
      N(b, { ft: 'highpass', f: 3500, d: 0.06, g: 0.28 });
      T(b, { type: 'sawtooth', f: 90, f2: 180, d, g: 0.05, lp: 400, a: d * 0.4 });
      for (let i = 0; i < 6; i++) T(b, { type: 'sine', f: R(1500, 3600), f2: 900, d: 0.25, g: 0.06, a: 0.003, at: 0.08 + i * (d / 8) + R(0, 0.03) });
    });
    D('iceHit', b => {
      T(b, { type: 'sine', f: R(2200, 3400), f2: 1200, d: 0.09, g: 0.14, a: 0.002 });
      N(b, { ft: 'highpass', f: 6000, d: 0.04, g: 0.12 });
      N(b, { ft: 'bandpass', f: R(4000, 7000), d: 0.015, g: 0.1, q: 8, at: 0.03 });
    });
    // Meteor Hammer: channel start, falling rocks over the land delay, big impact (stun + crunch), fizzle on cancel
    D('hammerStart', b => {
      T(b, { type: 'sawtooth', f: 90, f2: 210, d: 0.55, g: 0.12, lp: 500, a: 0.3 });
      N(b, { ft: 'bandpass', f: 380, f2: 1300, d: 0.5, g: 0.13, q: 1.2, a: 0.35 });
      T(b, { type: 'sine', f: 55, d: 0.3, g: 0.3, a: 0.01 });
    });
    D('hammerFall', b => {
      const d = dur(b, 0.9), a = d * 0.75;
      N(b, { ft: 'lowpass', f: 100, f2: 700, d, g: 0.4, a, rel: 0.05, q: 0.8 });
      N(b, { ft: 'bandpass', f: 500, f2: 2600, d, g: 0.12, a, rel: 0.05, q: 1 });
      T(b, { type: 'sawtooth', f: 45, f2: 120, d, g: 0.1, a, lp: 250, rel: 0.05 });
      for (let i = 0; i < 6; i++) N(b, { ft: 'bandpass', f: R(400, 1600), d: 0.04, g: R(0.05, 0.12), q: 4, at: R(0.05, Math.max(0.1, d - 0.05)) }); // pebbles streaking down
    });
    D('hammerImpact', b => {
      T(b, { type: 'sine', f: 125, f2: 30, d: 0.6, g: 0.7, a: 0.003 });
      N(b, { ft: 'lowpass', f: 1300, f2: 110, d: 0.42, g: 0.6 });
      N(b, { ft: 'highpass', f: 3000, d: 0.06, g: 0.3 });
      clang(b, 160, 0.1, 0.01);
      N(b, { ft: 'bandpass', f: 2200, f2: 700, d: 0.3, g: 0.1, q: 0.8, a: 0.02 });
      for (let i = 0; i < 5; i++) N(b, { ft: 'bandpass', f: R(300, 900), d: 0.05, g: R(0.1, 0.2), q: 3, at: 0.08 + R(0, 0.35) });
    });
    D('hammerCancel', b => {
      T(b, { type: 'sawtooth', f: 200, f2: 60, d: 0.25, g: 0.1, lp: 600 });
      N(b, { ft: 'bandpass', f: 1200, f2: 250, d: 0.2, g: 0.1, q: 1 });
    });
    // Black King Bar: war-drum thump, golden brass roar, shimmer; power-down on expiry
    D('bkb', b => {
      T(b, { type: 'sine', f: 95, f2: 45, d: 0.4, g: 0.6, a: 0.004 });
      T(b, { type: 'sine', f: 120, f2: 55, d: 0.35, g: 0.45, a: 0.004, at: 0.13 });
      N(b, { ft: 'lowpass', f: 700, f2: 200, d: 0.2, g: 0.3 });
      N(b, { ft: 'bandpass', f: 280, f2: 760, d: 0.7, g: 0.2, q: 1.2, a: 0.2 }); // roar
      [196, 293.66, 392].forEach((f, i) => T(b, { type: 'sawtooth', f, f2: f * 1.02, d: 0.75, g: 0.06, a: 0.18, lp: 1400, at: 0.06, fm: 5.5, fmd: f * 0.01 + i }));
      [783.99, 1174.7, 1568].forEach((f, i) => T(b, { type: 'triangle', f, d: 0.6, g: 0.08, a: 0.02, at: 0.12 + i * 0.05 }));
      N(b, { ft: 'highpass', f: 5000, d: 0.5, g: 0.06, a: 0.1, at: 0.1 });
    });
    D('bkbEnd', b => {
      T(b, { type: 'sine', f: 900, f2: 180, d: 0.3, g: 0.1, a: 0.01 });
      N(b, { ft: 'bandpass', f: 3000, f2: 400, d: 0.26, g: 0.14, q: 1.2 });
      T(b, { type: 'sine', f: 110, f2: 55, d: 0.25, g: 0.2, a: 0.01 });
    });
    // Blink Dagger: fast zap out, zap in
    D('blink', b => {
      N(b, { ft: 'bandpass', f: 3500, f2: 700, d: 0.12, g: 0.28, q: 1.5 });
      T(b, { type: 'sine', f: 2600, f2: 280, d: 0.1, g: 0.25, a: 0.002 });
      N(b, { ft: 'highpass', f: 5000, d: 0.05, g: 0.1 });
    });
    D('blinkIn', b => {
      N(b, { ft: 'bandpass', f: 600, f2: 4000, d: 0.1, g: 0.2, q: 1.5, at: 0.05 });
      T(b, { type: 'sine', f: 400, f2: 2400, d: 0.1, g: 0.2, at: 0.05, a: 0.003 });
      T(b, { type: 'sine', f: 120, f2: 70, d: 0.1, g: 0.25, a: 0.003, at: 0.14 });
      N(b, { ft: 'highpass', f: 5500, d: 0.08, g: 0.12, at: 0.14 });
    });
    // Boots of Travel: teleport channel start, fizzle, arrival thump + whoosh
    D('tpStart', b => {
      T(b, { type: 'sine', f: 330, f2: 660, d: 0.4, g: 0.12, a: 0.1 });
      N(b, { ft: 'bandpass', f: 700, f2: 3000, d: 0.4, g: 0.16, q: 1.6, a: 0.2 });
      [1046.5, 1568, 2093].forEach((f, i) => T(b, { type: 'sine', f, d: 0.3, g: 0.05, a: 0.01, at: 0.1 + i * 0.07 }));
    });
    D('tpCancel', b => { T(b, { type: 'sine', f: 800, f2: 200, d: 0.2, g: 0.1, a: 0.005 }); N(b, { ft: 'bandpass', f: 2500, f2: 400, d: 0.18, g: 0.1, q: 1.2 }); });
    D('tpArrive', b => {
      N(b, { ft: 'bandpass', f: 4000, f2: 400, d: 0.35, g: 0.3, q: 1.0 });
      T(b, { type: 'sine', f: 130, f2: 45, d: 0.4, g: 0.5, a: 0.004 });
      N(b, { ft: 'highpass', f: 4500, d: 0.08, g: 0.2 });
      [2093, 1568, 1046.5].forEach((f, i) => T(b, { type: 'sine', f, d: 0.35, g: 0.06, a: 0.005, at: 0.05 + i * 0.06 }));
    });

    // ---- hero / combat
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

  // Per-voice metadata. verb = reverb send, prio = never dropped under load, low = first to be dropped,
  // grp = shared throttle group, vol = base level (the wiki's relative levels).
  const META = {
    cast_coldsnap: { vol: 0.5 }, csProc: { vol: 0.5, grp: 'tick' }, cast_icewall: { vol: 0.6, verb: 0.15 }, iceCrunch: { grp: 'tick', low: 1 },
    cast_forgespirit: { vol: 0.85 }, tornadoLift: { vol: 0.8, grp: 'hit' }, tornadoLand: { grp: 'hit', low: 1 }, meteorBurn: { vol: 0.5, grp: 'tick', low: 1 },
    meteorCrumble: { vol: 0.5, verb: 0.3 }, atkImpact: { vol: 0.5, low: 1 }, atkPre: { low: 1 }, spiritLaunch: { low: 1 }, spiritImpact: { low: 1 },
    footstep: { vol: 0.4, low: 1, grp: 'step' }, dmgTick: { grp: 'tick', low: 1 }, empDrain: { vol: 0.6, grp: 'tick', low: 1 }, iceHit: { vol: 0.5, grp: 'tick', low: 1 },
    empPop: { prio: 1, verb: 0.3 }, sunImpact: { prio: 1, verb: 0.35 }, meteorLand: { prio: 1, verb: 0.4 }, hammerImpact: { prio: 1, verb: 0.3 },
    cast_deafeningblast: { prio: 1, verb: 0.45 }, cast_deafeningblast_dark: { prio: 1, verb: 0.5 }, cast_tornado_dark: { verb: 0.3 },
    bkb: { prio: 1, verb: 0.3 }, refresher: { verb: 0.3 }, shiva: { prio: 1, verb: 0.3 }, cataclysm: { prio: 1, verb: 0.4 }, tpArrive: { verb: 0.2 },
    cast_ghostwalk: { verb: 0.25 }, invoke: { verb: 0.15 }, spiritSpawn: { verb: 0.2 }, deafeningHit: { grp: 'hit' }, 'fx:gleipnirHit': { grp: 'hit', verb: 0.15 },
    'fx:orchidBurst': { verb: 0.2 }, sunBeam: { verb: 0.15 },
  };
  // throttle: max per 100 ms per id, plus per-group caps so per-tick sounds never pile up into a harsh buzz
  const MAXN = { dmgTick: 2, hit: 3, csProc: 2, csTarget: 2, failSoft: 1, orbQ: 3, orbW: 3, orbE: 3, comboStep: 2, blocked: 2, timerTick: 1, spiritLaunch: 3, spiritImpact: 3,
    tornadoLift: 2, tornadoLand: 2, atkPre: 2, atkLaunch: 2, atkImpact: 2, iceCrunch: 3, meteorBurn: 2, empDrain: 2, iceHit: 2, footstep: 1, sunBeam: 3, empCrackle: 2, meteorWhistle: 2, sunImpact: 3, meteorLand: 2 };
  const GMAX = { tick: 4, hit: 4, step: 1 };
  const hist = Object.create(null);
  function throttled(id, grp) {
    const now = nowMs();
    const chk = (key, n) => { const a = hist[key] || (hist[key] = []); while (a.length && now - a[0] > 100) a.shift(); return a.length >= n; };
    if (chk(id, MAXN[id] || 2) || (grp && chk('g:' + grp, GMAX[grp] || 4))) return true;
    hist[id].push(now); if (grp) hist['g:' + grp].push(now);
    return false;
  }
  const gap = Object.create(null); // per-key minimum spacing (ms), used to dedupe repeated events for the same target
  function once(key, ms) { const n = nowMs(); if (n - (gap[key] || -1e9) < ms) return false; gap[key] = n; return true; }

  function soundOn() {
    try { const s = IT.Settings && IT.Settings.get && IT.Settings.get(); return !s || s.sound !== false; } catch (e) { return true; }
  }
  function darkSkin() {
    try { const s = IT.Settings && IT.Settings.get && IT.Settings.get(); return !!s && s.heroSkin === 'dark'; } catch (e) { return false; }
  }

  // loop-group handle: several audio loops driven as one
  function group(hs) {
    return { stop() { hs.forEach(h => h.stop()); }, set(p) { hs.forEach(h => h.set(p)); }, alive() { return hs.some(h => h.alive && h.alive()); } };
  }

  // loop specs
  const LOOPS = {
    tornado: [
      { ft: 'bandpass', f: 250, f2: 800, sweep: 2.5, q: 1.4, g: 0.3, atk: 1, rel: 0.8, wob: 2.5,
        osc: [{ type: 'sine', f: 620, f2: 980, g: 0.018, fm: 4, fmd: 60 }, { type: 'triangle', f: 1240, f2: 1560, g: 0.007, fm: 6, fmd: 80 }] },
      { ft: 'lowpass', f: 180, q: 1.1, g: 0.2, atk: 0.8, rel: 0.8, wob: 1.3 },
    ],
    meteor: [
      { ft: 'lowpass', f: 150, q: 1.3, g: 0.42, wob: 6, atk: 0.3, rel: 0.5, osc: [{ type: 'sawtooth', f: 48, g: 0.05, lp: 200, fm: 3 }] },
      { ft: 'bandpass', f: 420, q: 4, g: 0.1, wob: 17, atk: 0.4, rel: 0.4 },
      { ft: 'highpass', f: 2600, q: 0.7, g: 0.05, wob: 29, wobd: 1, atk: 0.4, rel: 0.4 }, // fire crackle
    ],
    idle: { ft: 'bandpass', f: 480, q: 0.7, g: 0.028, atk: 1.2, rel: 0.6, wob: 0.35, osc: [{ type: 'sine', f: 98, g: 0.012, fm: 0.4, fmd: 3 }, { type: 'sine', f: 147, g: 0.007, fm: 0.27, fmd: 3 }] },
  };

  let off = [], timer = 0, trkTimer = 0, loops = [], lastFail = 0, trk = [];
  const Sfx = {
    w: null, calls: 0, master: MASTER, SFX, META,
    // listener = camera centre, else hero
    listener() {
      const w = this.w, dev = IT.dev, cam = dev && dev.cam && dev.w === w ? dev.cam : null;
      if (cam && IT.GAME) return { x: cam.x + IT.GAME.VIEW_W * IT.GAME.UNIT_PX / 2, y: cam.y + IT.GAME.VIEW_H * IT.GAME.UNIT_PX / 2 };
      const h = w && w.hero; return h ? { x: h.x, y: h.y } : null;
    },
    // distance attenuation + stereo pan for a world position (null pos = unattenuated / centre)
    atten(pos) {
      if (!pos || pos.x == null) return { vol: 1, pan: 0 };
      const l = this.listener();
      if (!l) return { vol: 1, pan: 0 };
      const dx = pos.x - l.x, d = Math.hypot(dx, pos.y - l.y);
      return { vol: Math.max(0.12, 1 - Math.pow(d / FALLOFF, 1.3)), pan: Math.max(-0.85, Math.min(0.85, dx / HALF_VIEW)) };
    },
    // pos {x,y} optional; opt {vol, dur}. Returns true if the sound was sent to the synth.
    play(id, pos, opt) {
      if (!SFX || !SFX.playEx || !this.w) return false;
      if (!soundOn() || !SFX.has(id)) return false;
      const m = META[id] || {};
      if (throttled(id, m.grp)) return false;
      const a = this.atten(pos);
      const vol = ((opt && opt.vol) || 1) * (m.vol || 1) * a.vol;
      this.calls++;
      SFX.playEx(id, { vol, pan: a.pan, dur: opt && opt.dur, verb: m.verb, prio: m.prio, low: m.low });
      return true;
    },
    // starts a loop bed; pos optional (static position). Returns a handle {stop,set,alive}
    loop(spec, pos, maxSec) {
      if (!SFX || !SFX.loop || !soundOn()) return { stop() {}, set() {}, alive() { return false; } };
      const a = this.atten(pos);
      const h = SFX.loop(Object.assign({ vol: a.vol, pan: a.pan, maxSec, dyn: true }, spec));
      loops.push(h); this.calls++;
      return h;
    },
    stopLoops() { for (const h of loops) h.stop(); loops = []; trk = []; },
    detach() {
      for (const f of off) { try { f(); } catch (e) {} }
      off = []; clearInterval(timer); clearInterval(trkTimer); timer = trkTimer = 0; this.stopLoops(); this.w = null;
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
      const paused = () => !!(w.paused || (IT.dev && IT.dev.paused && IT.dev.w === w));

      // ---- loops that follow an entity (tornado / meteor) and die with it. find() resolves the entity lazily.
      const follow = (kind, h, pos, find, base) => { trk.push({ kind, h, pos, find, ent: null, base: base || 1 }); return h; };
      const stopKind = (kind, near) => {
        let best = -1, bd = Infinity;
        trk.forEach((k, i) => {
          if (k.kind !== kind) return;
          const e = k.ent || k.pos, d = near && e ? Math.hypot(e.x - near.x, e.y - near.y) : 0;
          if (d < bd) { bd = d; best = i; }
        });
        if (best >= 0) { trk[best].h.stop(); trk.splice(best, 1); }
      };
      const capKind = (kind, n) => { while (trk.filter(k => k.kind === kind).length >= n) stopKind(kind, null); };
      const claimed = new Set();
      const findThinker = (ability, pred, pt) => () => {
        const c = w.query(u => u.kind === 'thinker' && u.ability === ability && !claimed.has(u.id) && pred(u));
        if (pt) c.sort((a, b) => Math.hypot(a.x - pt.x, a.y - pt.y) - Math.hypot(b.x - pt.x, b.y - pt.y));
        const e = c[0];
        if (e) claimed.add(e.id);
        return e || null;
      };
      const stopFollowed = k => { k.h.stop(); };
      trkTimer = setInterval(() => {
        if (S.w !== w) return;
        const mute = paused();
        for (let i = trk.length - 1; i >= 0; i--) {
          const k = trk[i];
          if (!k.h.alive()) { trk.splice(i, 1); continue; }
          if (!k.ent && k.find) k.ent = k.find();
          if (k.ent && k.ent.dead) { stopFollowed(k); trk.splice(i, 1); continue; }
          const a = S.atten(k.ent ? { x: k.ent.x, y: k.ent.y } : k.pos);
          k.h.set({ vol: mute ? 0 : a.vol * k.base, pan: a.pan });
        }
        stepSounds(mute);
      }, 80);

      // ---- footsteps (40% level) + quiet idle bed that gets louder while moving (10%)
      let idle = null, lx = null, ly = null, stride = 0, movingFor = 0;
      const STRIDE = 105;
      function startIdle() {
        if (idle && idle.alive()) return;
        idle = S.loop(LOOPS.idle, null, 0);
        trk.push({ kind: 'idle', h: idle, pos: null, find: null, ent: null, base: 0.4, idle: true });
      }
      function stepSounds(mute) {
        const h = w.hero;
        if (!h || h.dead) return;
        const dx = lx == null ? 0 : h.x - lx, dy = lx == null ? 0 : h.y - ly, d = Math.hypot(dx, dy);
        lx = h.x; ly = h.y;
        const moving = d > 0.4 && d < 150 && !mute;   // > 150 units in 80 ms = blink / teleport, not walking
        movingFor = moving ? Math.min(1, movingFor + 0.25) : Math.max(0, movingFor - 0.15);
        const it = trk.find(k => k.idle);
        if (it) it.base = 0.4 + 0.6 * movingFor;
        if (!moving) { stride = STRIDE * 0.6; return; }
        stride += d;
        if (stride >= STRIDE) { stride -= STRIDE; P('footstep'); }
      }
      startIdle();

      on('orb', p => { if (isHero(p.unit)) P('orb' + p.orb); });
      on('invoke', p => { if (isHero(p.unit)) P(p.swapped ? 'invokeSwap' : 'invoke'); });
      on('fail', p => {
        if (!isHero(p.unit)) return;
        const n = nowMs(); if (n - lastFail < 250) return; lastFail = n; P('failSoft');
      });

      // ---- spell / item casts. Lighter cue where a delayed fx carries the main sound; Dark Artistry swaps Tornado + Deafening Blast casts.
      const CAST = { sunstrike: 'castSun', chaosmeteor: 'castMeteor' };
      let tpAt = -1;
      const tpStart = (pos, dur) => {
        if (nowMs() - tpAt < 150) return;
        tpAt = nowMs(); P('tpStart', pos);
        stopKind('tp', null);
        follow('tp', S.loop({ ft: 'bandpass', f: 600, f2: 3000, sweep: dur || 3, q: 2, g: 0.07, atk: 0.4, rel: 0.25, wob: 5,
          osc: [{ type: 'sine', f: 330, f2: 990, g: 0.03, fm: 5, fmd: 15 }, { type: 'sine', f: 660, f2: 1980, g: 0.015 }] }, null, (dur || 3) + 0.5), null, null, 1);
      };
      on('cast', p => {
        const at = isHero(p.unit) ? null : (p.x != null ? p : posOf(p.unit));
        if (p.kind === 'item') {
          if (p.ability === 'travels' || p.ability === 'tp') { tpStart(at, p.dur); return; }
          P('castitem_' + p.ability, at); return;
        }
        let id = Object.prototype.hasOwnProperty.call(CAST, p.ability) ? CAST[p.ability] : 'cast_' + p.ability;
        if (id && darkSkin() && SFX.has(id + '_dark')) id += '_dark';
        if (id) P(id, at);
      });

      // ---- attacks: pre-attack (wind-up) -> launch -> impact. attackStart comes from the sim's wind-up; if it is never emitted, pre plays with the launch.
      let sawStart = false;
      const kindOf = id => { const e = w.get(id); return e ? e.kind : null; };
      on('attackStart', p => {
        sawStart = true;
        if (isHero(p.src)) P('atkPre', posOf(p.src));
      });
      on('attack', p => {
        const k = kindOf(p.src), pos = posOf(p.src);
        if (k === 'spirit') P('spiritLaunch', pos);
        else if (isHero(p.src)) {
          if (!sawStart) { P('atkPre', pos); setTimeout(() => { if (S.w === w) P('atkLaunch', pos); }, 70); } else P('atkLaunch', pos);
        } else P('atkLaunch', pos, { vol: 0.7 });
      });
      on('attackHit', p => {
        const k = kindOf(p.src), pos = posOf(p.target);
        if (k === 'spirit') P('spiritImpact', pos);
        else if (isHero(p.src)) P('atkImpact', pos);
        else P('genHit', pos);
      });

      // ---- Cold Snap: first freeze = target sound, later freezes (damage trigger) = proc sound
      const coldProc = (unit, pos) => { if (once('csP' + unit, 150)) P('csProc', pos); };
      const burn = (unit, pos) => { if (once('mb' + unit, 220)) P('meteorBurn', pos); };

      // ---- damage-driven per-tick voices (ice wall crunch, meteor burn); everything else is voiced by its own fx
      const VOICED = new Set(['attack', 'coldsnap', 'emp', 'tornado', 'sunstrike', 'deafeningblast', 'orchid', 'shiva', 'atos', 'gleipnir', 'vyse', 'stunbolt', 'forgespirit', 'icewall', 'chaosmeteor', 'meteorhammer']);
      let hammerImpactT = -1;
      on('damage', p => {
        if (isHero(p.target)) { if (p.dealt > 0) P('hurt', null, { vol: 0.6 }); return; }
        if (!(p.dealt > 0)) return;
        const pos = posOf(p.target);
        if (p.ability === 'icewall') { if (once('ic' + p.target, 160)) P('iceCrunch', pos, { vol: R(0.6, 1) }); return; } // 30-50% of the wall's level
        if (p.ability === 'chaosmeteor' || p.ability === 'meteorhammer') {
          if (p.ability === 'meteorhammer' && Math.abs(w.t - hammerImpactT) < 0.07) return; // the impact itself has its own voice
          burn(p.target, pos);
          return;
        }
        if (VOICED.has(p.ability)) return;
        P('dmgTick', pos, { vol: Math.min(1.4, 0.6 + p.dealt / 300) });
      });

      on('blink', p => { if (!isHero(p.unit)) P('dummyBlink', p); });

      // ---- status ends: hex poof back, BKB power-down, chains release
      on('statusEnd', p => {
        const pos = posOf(p.target);
        if (p.status === 'hex') P('hexEnd', pos);
        else if (p.status === 'magicImmune' && isHero(p.target)) P('bkbEnd');
        else if ((p.status === 'root' || p.status === 'atosRoot') && once('rr' + p.target, 200)) P('chainRelease', pos);
      });

      // ---- fx events
      const tornadoLoop = (f) => {
        capKind('tornado', 3);
        const h = group(LOOPS.tornado.map(sp => S.loop(sp, f, 12)));
        follow('tornado', h, { x: f.x, y: f.y }, findThinker('tornado', e => e.dir === f.dir), 1);
      };
      const meteorLoop = (f) => {
        capKind('meteor', 3);
        const h = group(LOOPS.meteor.map(sp => S.loop(sp, f, (f.dur || 6) + 1)));
        follow('meteor', h, { x: f.x, y: f.y }, findThinker('chaosmeteor', e => e.landed && Math.hypot(e.x - f.x, e.y - f.y) < 400, f), 1);
      };
      let hammer = null;
      const stopHammer = () => { if (hammer) { hammer.stop(); hammer = null; } };
      on('fx', f => {
        const pos = f;
        switch (f.name) {
          // Sun Strike
          case 'sunstrikeBeam': P('sunBeam', pos, { dur: f.delay }); break;
          case 'sunstrikeHit': P('sunImpact', pos); break;
          case 'cataclysm': P('cataclysm', null); break;
          // EMP: target hum over the delay, then discharge
          case 'empCharge': P('empCrackle', pos, { dur: f.delay }); break;
          case 'empBlast': case 'empDetonate': P('empPop', pos); break;
          case 'empHit': case 'empDrain': P('empDrain', pos); break;
          // Chaos Meteor: incoming rumble, land boom + rolling loop that follows it, end crumble
          case 'meteorFall':
            if (f.ability === 'meteorhammer') { stopHammer(); P('hammerFall', pos, { dur: f.delay }); }
            else P('meteorWhistle', pos, { dur: f.delay });
            break;
          case 'meteorLand': P('meteorLand', pos); break;
          case 'meteorRoll': meteorLoop(f); break;
          case 'meteorEnd': stopKind('meteor', f); P('meteorCrumble', pos); break;
          case 'meteorHit': case 'meteorBurn': case 'hammerBurn': case 'burnTick': burn(f.unit, pos); break;
          // Ice Wall / Cold Snap
          case 'iceWall': P('iceWall', pos); break;
          case 'iceWallEnd': P('iceWallEnd', pos); break;
          case 'iceWallTick': case 'icewallTick': if (once('ic' + f.unit, 160)) P('iceCrunch', pos, { vol: R(0.6, 1) }); break;
          case 'coldsnapFreeze': if (!f.proc && once('csT' + f.unit, 150)) P('csTarget', pos); break; // proc freezes are voiced by coldsnapProc
          case 'coldsnapProc': coldProc(f.unit, pos); break;
          // Forge Spirit
          case 'forgeSpirit': P('spiritSpawn', pos); break;
          case 'spiritExpire': P('spiritExpire', pos); break;
          case 'ghostBreak': P('ghostBreak', pos); break;
          case 'ghostWalkEnd': if (!f.broken) P('ghostBreak', pos, { vol: 0.5 }); break;
          case 'meltingStrike': P('spiritImpact', pos, { vol: 0.8 }); break;
          // Tornado: travel loop for its lifetime, gust per victim, thud when they land
          case 'tornadoStart': tornadoLoop(f); break;
          case 'tornadoEnd': stopKind('tornado', f); break;
          case 'tornadoLift': case 'tornadoHit': P('tornadoLift', pos); break;
          case 'tornadoLand': P('tornadoLand', pos, { vol: R(0.7, 1) }); break; // landing thuds at 25-35% (voice base is ~0.35)
          case 'twister': P('twisterWhirl', pos, { dur: f.dur }); break;
          case 'deafeningHit': P('deafeningHit', pos); break;
          // items
          case 'refresh': P('refresher', pos); break;
          case 'atosLaunch': P('atosLaunch', pos); break;
          case 'atosHit': P('atosHit', pos); break;
          case 'atosDodged': P('whiff', pos); break;
          case 'atosBlocked': case 'hexBlocked': case 'boltBlocked': case 'gleipnirBlocked': case 'orchidBlocked': P('blocked', pos); break;
          case 'hexHit': P('hex', pos); break;
          case 'shivaHit': P('iceHit', pos); break;
          case 'shivaBlast': P('shiva', pos, { dur: f.r && f.speed ? f.r / f.speed : 0.7 }); break;
          case 'meteorChannel':
            P('hammerStart', pos);
            stopHammer();
            hammer = S.loop({ ft: 'bandpass', f: 200, f2: 900, sweep: f.dur || 2.5, q: 2, g: 0.14, wob: 9, atk: 0.4, rel: 0.3,
              osc: [{ type: 'sawtooth', f: 55, f2: 140, g: 0.05, lp: 300 }, { type: 'sine', f: 110, f2: 330, g: 0.03, fm: 6, fmd: 8 }] }, null, (f.dur || 2.5) + 0.3);
            break;
          case 'meteorCancel': stopHammer(); P('hammerCancel', null); break;
          case 'meteorImpact': stopHammer(); hammerImpactT = w.t; P('hammerImpact', pos); break;
          case 'bkb': P('bkb', pos); break;
          case 'blinkStart': case 'blinkOut': P('blink', pos); break;
          case 'blinkEnd': case 'blinkIn': P('blinkIn', pos); break;
          case 'tpStart': case 'teleportStart': case 'travelsStart': tpStart(pos, f.dur); break;
          case 'tpCancel': case 'teleportCancel': case 'travelsCancel': stopKind('tp', null); P('tpCancel', pos); break;
          case 'tpEnd': case 'tpArrive': case 'teleportEnd': case 'teleportArrive': case 'travelsArrive': stopKind('tp', null); P('tpArrive', pos); break;
          // dummy AI
          case 'boltTelegraph': P('boltWarn', pos); break;
          case 'boltHit': P('boltHit', pos); break;
          case 'blinkTell': P('dummyBlinkTell', pos); break;
          default: if (f.name && SFX && SFX.has('fx:' + f.name)) P('fx:' + f.name, pos, { dur: f.dur || f.delay }); break; // gleipnirLaunch/Hit, orchidHit/Burst...
        }
      });
      on('despawn', p => { if (hammer && w.hero && p.ent === w.hero.id) stopHammer(); });

      on('comboStep', p => { if (!p.done) P('comboStep'); });
      on('comboDone', p => { P(p.perfect ? 'comboPerfect' : 'comboDone'); });
      on('comboFail', () => P('comboFail'));
      on('modeEnd', () => { S.stopLoops(); hammer = null; idle = null; });
      on('modeStart', () => { if (!idle || !idle.alive()) startIdle(); });

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
