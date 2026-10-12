// SFX voices (v5 sound redesign): every one-shot used by the game, synthesised from scratch with WebAudio (no samples, nothing copied from any game).
// Loaded after audio.js, before sfx.js (event mapping) and ui/uisound.js (button kinds). Registers voices with SFX.define(id, builder(b)).
// Each voice follows the layer recipe of the Dota 2 original it echoes: TRANSIENT (click / crack) + BODY (tuned oscillators, FM, filtered noise) + TAIL (shimmer / rumble / sizzle).
// Palette: FM bells (T mr/mi) for glass + metal, 'crackle' noise (sparse clicks) for fire / electricity / ice, 'brown' noise for rumble, 'pink' for wind + air, tanh waveshaping (dist) for weight.
// Dev: IT.SFX.board() opens an on-screen sound board (play + offline-measure every voice); IT.SFX.ids() lists them.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const SFX = G.SFX || IT.SFX;
  if (!SFX || !SFX.define) return;
  const T = SFX.T, N = SFX.N, D = SFX.define;
  const R = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const dur = (b, d, min) => Math.max(min || 0.4, (b.opt && b.opt.dur) || d);

  // ------------------------------------------------------------------ shared building blocks
  // FM bell: carrier + decaying modulator at a non-integer ratio = glassy ping with a bright strike that mellows
  const bell = (b, f, g, d, at, mi, mr) => T(b, { type: 'sine', f, d, g, a: 0.002, at: at || 0, mr: mr || 3.5, mi: mi == null ? 1.2 : mi, mdec: 0.03 });
  // glass / ice ring: inharmonic partials, higher ones die first
  const glass = (b, f, g, at, d) => [1, 2.32, 4.25, 6.63].forEach((r, i) => T(b, { type: 'sine', f: f * r, d: (d || 0.5) / (1 + i * 0.6), g: g / (1 + i * 0.7), a: 0.001, at: at || 0 }));
  // metallic clang: inharmonic partials (anvil, shield, chains)
  const clang = (b, f, g, at) => [1, 2.76, 5.4, 8.9].forEach((r, i) => T(b, { type: i ? 'sine' : 'triangle', f: f * r, d: 0.42 - i * 0.07, g: g / (i + 1), a: 0.002, at: at || 0 }));
  // gong: slow-beating inharmonic partials with a strike
  const gong = (b, f, g, at, d) => [[1, 1], [1.51, 0.55], [2.02, 0.5], [2.74, 0.35], [3.9, 0.22], [5.4, 0.14]].forEach(([r, k], i) => {
    T(b, { type: 'sine', f: f * r, d: (d || 1.8) / (1 + i * 0.35), g: g * k, a: i ? 0.004 : 0.006, at: at || 0, fm: 0.9 + i * 0.37, fmd: f * r * 0.004 });
    if (i < 3) T(b, { type: 'sine', f: f * r * 1.006, d: (d || 1.8) / (1 + i * 0.35), g: g * k * 0.6, a: 0.006, at: at || 0 });
  });
  // sparse crackle bed (fire / electricity / ice fracture): ONE noise node reading the clicky buffer, bandpassed
  const spark = (b, t0, d, g, f0, f1, q, o) => N(b, Object.assign({ nk: 'crackle', ft: 'bandpass', f: f0, f2: f1, q: q || 1.5, d, g, at: t0 }, o));
  // sub / body thump with a falling pitch
  const boom = (b, f0, f1, d, g, at, dist) => T(b, { type: 'sine', f: f0, f2: f1, d, g, a: 0.003, at: at || 0, dist });
  // rumble: brown noise through a moving lowpass
  const rumble = (b, f0, f1, d, g, at, a) => N(b, { nk: 'brown', ft: 'lowpass', f: f0, f2: f1, d, g, at: at || 0, a: a || 0, q: 0.7 });
  // wind / air: pink noise through a moving bandpass
  const air = (b, f0, f1, d, g, at, a, q, o) => N(b, Object.assign({ nk: 'pink', ft: 'bandpass', f: f0, f2: f1, d, g, at: at || 0, a: a || 0, q: q || 1.1 }, o));
  const chainTicks = (b, n, at0, gap, g) => { for (let i = 0; i < n; i++) T(b, { type: 'square', f: R(1800, 3400), f2: R(900, 1500), d: 0.025, g, a: 0.002, at: at0 + i * gap + R(0, 0.012), lp: 5000 }); };
  const arp = (b, notes, gap, fn) => notes.forEach((f, i) => fn(f, i, i * gap));

  // ================================================================== core one-shots (input.js / combo bar)
  D('click', b => { // unit select / order click: crisp little metallic tick
    N(b, { ft: 'bandpass', f: 2800, d: 0.012, g: 0.12, q: 1.5 });
    T(b, { type: 'triangle', f: 1300, f2: 850, d: 0.04, g: 0.12, a: 0.002 });
    T(b, { type: 'sine', f: 260, f2: 170, d: 0.045, g: 0.08, a: 0.002 });
  });
  D('success', b => { bell(b, 2093, 0.1, 0.4, 0.02); T(b, { type: 'sine', f: 3136, d: 0.2, g: 0.03, at: 0.05 }); }); // tiny sparkle on top of comboDone
  D('fail', b => { // muted dull thud
    T(b, { type: 'sine', f: 145, f2: 62, d: 0.2, g: 0.38, a: 0.004 });
    rumble(b, 260, 90, 0.16, 0.7);
    T(b, { type: 'triangle', f: 90, f2: 70, d: 0.18, g: 0.07, lp: 300 });
  });
  D('hit', b => { N(b, { ft: 'bandpass', f: 1800, d: 0.035, g: 0.34, q: 1 }); boom(b, 230, 70, 0.1, 0.34); }); // punchy and short
  D('hurt', b => { // hero takes damage: body thud + dull crunch
    boom(b, 135, 42, 0.26, 0.55);
    rumble(b, 420, 120, 0.16, 0.9);
    N(b, { ft: 'bandpass', f: 1200, d: 0.04, g: 0.16, q: 1.1 });
    T(b, { type: 'sawtooth', f: 210, f2: 120, d: 0.14, g: 0.06, lp: 600, at: 0.01 });
  });
  D('kill', b => { // a unit dies: pop + crumple
    N(b, { ft: 'bandpass', f: 900, d: 0.05, g: 0.4, q: 1 });
    T(b, { type: 'sine', f: 520, f2: 100, d: 0.18, g: 0.32, a: 0.003 });
    spark(b, 0.02, 0.18, 0.5, 1600, 700, 1.2);
    T(b, { type: 'triangle', f: 1300, f2: 300, d: 0.12, g: 0.07, at: 0.01 });
    rumble(b, 500, 100, 0.2, 0.7, 0.02);
  });

  // ================================================================== orbs (Quas / Wex / Exort UI feedback)
  // Quas: icy crystalline chime. FM glass ping + a ring of inharmonic shards + frosty air
  D('orbQ', b => {
    const f = pick([1760, 1976, 2093, 2349]);
    N(b, { ft: 'highpass', f: 7500, d: 0.02, g: 0.09, q: 0.7 });
    bell(b, f, 0.27, 0.5, 0, 1.3);
    T(b, { type: 'sine', f: f * 2.32, d: 0.22, g: 0.07, a: 0.002 });
    T(b, { type: 'sine', f: f * 1.5, d: 0.45, g: 0.05, a: 0.01, fm: 8, fmd: f * 0.012, at: 0.02 });
    air(b, 7000, 11000, 0.26, 0.05, 0.01, 0.03);
  });
  // Wex: crackly electric zap. spark burst + FM zip + 50 Hz-ish buzz
  D('orbW', b => {
    spark(b, 0, 0.17, 0.55, 4200, 6500, 0.9);
    T(b, { type: 'sawtooth', f: 480, f2: 3200, d: 0.07, g: 0.12, lp: 5200, a: 0.002, dist: 3 });
    T(b, { type: 'sine', f: 1500, f2: 560, d: 0.12, g: 0.1, a: 0.002, mr: 7.01, mi: 2.4, mdec: 0.1 });
    N(b, { ft: 'bandpass', f: R(3500, 6000), d: 0.015, g: 0.18, q: 6, at: 0.05 });
    N(b, { ft: 'bandpass', f: R(2500, 5000), d: 0.015, g: 0.12, q: 6, at: 0.1 });
    T(b, { type: 'sawtooth', f: 110, d: 0.15, g: 0.05, lp: 800, am: 70, amd: 0.9, at: 0.02 });
  });
  // Exort: warm fiery whoosh. pink 'fwoomp' swell + low ignition thump + embers
  D('orbE', b => {
    air(b, 260, 1700, 0.3, 0.7, 0, 0.07, 0.7, { ft: 'lowpass' });
    rumble(b, 380, 140, 0.26, 1.1, 0, 0.03);
    boom(b, 125, 62, 0.24, 0.4);
    T(b, { type: 'triangle', f: 220, f2: 340, d: 0.18, g: 0.07, a: 0.02, dist: 2 });
    spark(b, 0.06, 0.24, 0.3, 2400, 1200, 0.8, { hp: 700 });
  });

  // ================================================================== invoke: rising magical swirl, a soft 'whoomp', shimmer tail
  D('invoke', b => {
    air(b, 280, 4300, 0.55, 0.32, 0, 0.26, 1.8);
    air(b, 3000, 700, 0.5, 0.13, 0.1, 0.18, 1.2);
    // rising glissando chord (slight chorus)
    T(b, { type: 'triangle', f: 196, f2: 392, d: 0.5, g: 0.13, a: 0.22, lin: true });
    T(b, { type: 'sawtooth', f: 197, f2: 395, d: 0.5, g: 0.05, a: 0.22, lp: 700, lp2: 2600, det: 9, lin: true });
    T(b, { type: 'sine', f: 523, f2: 1047, d: 0.45, g: 0.07, a: 0.2, lin: true, fm: 7, fmd: 8 });
    // the whoomp
    boom(b, 155, 52, 0.3, 0.5, 0.4);
    rumble(b, 900, 150, 0.24, 0.9, 0.4);
    N(b, { ft: 'highpass', f: 3000, d: 0.02, g: 0.13, at: 0.4 });
    // shimmer tail: rising bell arpeggio + sparkle
    arp(b, [1568, 2093, 2637, 3136], 0.055, (f, i, t) => bell(b, f, 0.08, 0.5, 0.43 + t, 1));
    air(b, 6500, 11000, 0.5, 0.05, 0.38, 0.05, 0.6, { ft: 'highpass' });
  });
  D('invokeSwap', b => { // re-ordering invoked slots: quick 'tk-ting'
    T(b, { type: 'triangle', f: 880, f2: 1320, d: 0.08, g: 0.18 });
    bell(b, 1568, 0.1, 0.25, 0.05);
    air(b, 5000, 9000, 0.1, 0.05, 0, 0, 0.8, { ft: 'highpass' });
  });
  D('failSoft', b => { T(b, { type: 'sine', f: 320, f2: 200, d: 0.1, g: 0.16, a: 0.006 }); rumble(b, 300, 120, 0.06, 0.25); });

  // ================================================================== hero + spirit attacks
  D('atkPre', b => { // Invoker wind-up: soft magic swish
    air(b, 500, 2000, 0.14, 0.12, 0, 0.07, 1.2);
    T(b, { type: 'sine', f: 420, f2: 900, d: 0.13, g: 0.06, a: 0.06 });
    T(b, { type: 'sine', f: 2600, d: 0.1, g: 0.022, at: 0.05, fm: 9, fmd: 30 });
  });
  D('atkLaunch', b => { // orb leaves the hand: zippy 'pew'
    air(b, 3000, 900, 0.09, 0.2, 0, 0, 1.6, { nk: 'white' });
    T(b, { type: 'sine', f: 1500, f2: 480, d: 0.1, g: 0.15, a: 0.003, mr: 2, mi: 0.8, mdec: 0.1 });
    T(b, { type: 'triangle', f: 2300, f2: 1100, d: 0.07, g: 0.05, a: 0.002 });
    boom(b, 190, 120, 0.07, 0.12);
  });
  D('atkImpact', b => { // soft arcane pop
    N(b, { ft: 'bandpass', f: 1700, d: 0.05, g: 0.3, q: 1 });
    boom(b, 290, 90, 0.11, 0.3);
    T(b, { type: 'sine', f: 2200, f2: 1500, d: 0.12, g: 0.05, at: 0.01, mr: 2.5, mi: 0.5 });
    N(b, { ft: 'highpass', f: 5000, d: 0.03, g: 0.08, at: 0.01 });
  });
  // Forge Spirit: 4 fiery launch variants + 4 sizzling splat impacts
  D('spiritLaunch', b => {
    const k = Math.floor(Math.random() * 4), f = [1500, 1900, 1250, 2200][k];
    air(b, f, f * 0.38, 0.09, 0.2, 0, 0, 2, { nk: 'white' });
    T(b, { type: 'sine', f: f * 0.45, f2: f * 0.17, d: 0.09, g: 0.1 });
    T(b, { type: 'sawtooth', f: 160 + k * 25, f2: 90, d: 0.1, g: 0.07, lp: 700 });
    spark(b, 0.02, 0.1, 0.25, 3500, 2500, 1);
  });
  D('spiritImpact', b => {
    const k = Math.floor(Math.random() * 4), f = [700, 950, 560, 1200][k];
    N(b, { ft: 'lowpass', f: 2200, f2: 300, d: 0.14, g: 0.24 });
    boom(b, 200 - k * 15, 70, 0.11, 0.28);
    N(b, { ft: 'bandpass', f, d: 0.04, g: 0.2, q: 3, at: 0.01 });
    spark(b, 0.02, 0.2, 0.4, 4500, 2200, 0.9);
  });
  D('genHit', b => { N(b, { ft: 'highpass', f: 2000, d: 0.02, g: 0.3, q: 0.7 }); boom(b, 185, 80, 0.07, 0.22); });
  D('footstep', b => { // soft boot on stone / sand; random brightness gives the 'variants'
    const f = R(105, 190);
    T(b, { type: 'sine', f, f2: f * 0.5, d: 0.07, g: 0.34, a: 0.002 });
    N(b, { ft: 'bandpass', f: R(450, 1100), d: 0.05, g: 0.2, q: 1.2 });
    N(b, { ft: 'highpass', f: R(3000, 5200), d: 0.02, g: 0.05, at: 0.005 });
  });

  // ================================================================== Cold Snap: icy swoosh + sharp ice crack + shatter tinkle
  D('cast_coldsnap', b => {
    air(b, 600, 5200, 0.22, 0.3, 0, 0.1, 1.1);
    N(b, { ft: 'highpass', f: 5500, f2: 9000, d: 0.16, g: 0.1, a: 0.08 });
    T(b, { type: 'sine', f: 500, f2: 2600, d: 0.18, g: 0.09, lin: true, a: 0.05 });
    boom(b, 150, 80, 0.16, 0.22, 0.1);
    N(b, { ft: 'highpass', f: 5000, d: 0.025, g: 0.3, at: 0.15 });
    glass(b, 2637, 0.12, 0.16, 0.5);
  });
  D('csTarget', b => { // freeze: heavy ice crack, crystallising crackle, a low freeze-thud
    N(b, { ft: 'highpass', f: 4200, f2: 2500, d: 0.07, g: 0.5, q: 0.8 });
    N(b, { ft: 'bandpass', f: 3600, d: 0.04, g: 0.3, q: 6, at: 0.03 });
    spark(b, 0.03, 0.3, 0.6, 6500, 3200, 1.1);
    T(b, { type: 'sine', f: 1900, f2: 700, d: 0.2, g: 0.16, a: 0.004, mr: 2.8, mi: 1, mdec: 0.05 });
    boom(b, 170, 85, 0.16, 0.3);
    glass(b, 3136, 0.12, 0.05, 0.6);
    air(b, 8000, 12000, 0.3, 0.05, 0.05, 0.03, 0.6, { ft: 'highpass' });
  });
  D('csProc', b => { // each damage-triggered re-freeze: short sharp crack + small shatter
    const f = R(3200, 4200);
    N(b, { ft: 'highpass', f: 6500, d: 0.03, g: 0.34 });
    T(b, { type: 'sine', f, f2: f * 0.3, d: 0.13, g: 0.17, a: 0.002 });
    spark(b, 0.015, 0.14, 0.4, 7500, 4000, 1.4);
    bell(b, R(3500, 4600), 0.1, 0.22, 0.03, 0.8);
    bell(b, R(2600, 3400), 0.06, 0.18, 0.07, 0.8);
  });

  // ================================================================== Ghost Walk: airy hollow whoosh, a breath of cold, faint ghostly wail
  D('cast_ghostwalk', b => {
    air(b, 250, 1700, 0.45, 0.55, 0, 0.38, 1.6);
    air(b, 1300, 450, 0.7, 0.14, 0.4, 0.05, 0.8);
    T(b, { type: 'sine', f: 330, f2: 210, d: 0.85, g: 0.07, a: 0.15, fm: 5, fmd: 6 });
    T(b, { type: 'sine', f: 497, f2: 320, d: 0.75, g: 0.04, a: 0.15, det: 9, at: 0.05 });
    T(b, { type: 'sine', f: 95, f2: 60, d: 0.5, g: 0.3, a: 0.2, at: 0.3 }); // soft hollow thump as you fade
    arp(b, [2349, 1760, 1318.5, 988], 0.09, (f, i, t) => bell(b, f, 0.035, 0.3, 0.42 + t, 0.5));
  });
  D('ghostBreak', b => {
    air(b, 500, 2600, 0.15, 0.22, 0, 0.12, 1.4);
    T(b, { type: 'sine', f: 900, f2: 200, d: 0.12, g: 0.2, at: 0.13 });
    N(b, { ft: 'highpass', f: 4000, d: 0.06, g: 0.15, at: 0.13 });
  });

  // ================================================================== Ice Wall: low grinding rise + crunchy crystal formation, per-tick crunch, glassy shatter
  D('cast_icewall', b => {
    spark(b, 0.02, 0.36, 0.7, 2600, 800, 1.6);
    rumble(b, 450, 130, 0.34, 1.1, 0, 0.01);
    boom(b, 90, 48, 0.4, 0.4, 0.005);
    T(b, { type: 'sine', f: 600, f2: 2200, d: 0.28, g: 0.05, lin: true, a: 0.1 });
    air(b, 2400, 900, 0.3, 0.14, 0, 0.02, 3, { am: 34, amd: 0.9 });
  });
  D('iceWall', b => { // wall erupting: grinding crunch + rising glassy tinkles
    spark(b, 0.03, 0.7, 0.7, 1500, 3800, 1.1, { a: 0.04 });
    rumble(b, 520, 180, 0.6, 1.2, 0, 0.02);
    N(b, { ft: 'bandpass', f: 900, f2: 380, d: 0.6, g: 0.22, q: 4, a: 0.03, am: 26, amd: 0.9 });
    boom(b, 95, 52, 0.38, 0.45, 0.005);
    arp(b, [1568, 1760, 2093, 2349, 2637, 3136], 0.07, (f, i, t) => T(b, { type: 'sine', f: f * R(0.98, 1.02), f2: f * 0.9, d: 0.24, g: 0.07, a: 0.003, at: 0.04 + t, mr: 2.76, mi: 0.6, mdec: 0.05 }));
    air(b, 6000, 10000, 0.5, 0.05, 0.05, 0.05, 0.6, { ft: 'highpass' });
  });
  D('iceCrunch', b => { // a tick of frosty crunch on a damaged enemy (randomised colour = the 6 variants)
    N(b, { ft: 'bandpass', f: R(1400, 3600), d: 0.06, g: 0.3, q: 2 });
    rumble(b, R(600, 1100), 250, 0.07, 0.8);
    spark(b, 0.005, 0.1, 0.35, R(4500, 8000), 3000, 1.2);
    T(b, { type: 'sine', f: R(450, 900), f2: 200, d: 0.06, g: 0.1, a: 0.002 });
  });
  D('iceWallEnd', b => { // wall shatters
    N(b, { ft: 'highpass', f: 4500, f2: 2500, d: 0.35, g: 0.24, q: 0.7 });
    spark(b, 0, 0.5, 0.7, 6000, 2800, 0.9);
    for (let i = 0; i < 5; i++) bell(b, R(2400, 5200), 0.07, 0.25, R(0, 0.3), 0.6);
    T(b, { type: 'sine', f: 1400, f2: 500, d: 0.2, g: 0.09 });
    boom(b, 100, 50, 0.25, 0.22, 0.004);
  });

  // ================================================================== E.M.P.: zap on cast, building electric hum, dull bass pop discharge, mana-burn siphon
  D('cast_emp', b => {
    T(b, { type: 'sawtooth', f: 90, f2: 380, d: 0.2, g: 0.1, lin: true, a: 0.03, lp: 1500, am: 36, amd: 0.8, dist: 2 });
    T(b, { type: 'sine', f: 400, f2: 1300, d: 0.16, g: 0.08, lin: true, a: 0.02, mr: 2, mi: 1.2, mdec: 0.3 });
    spark(b, 0.01, 0.22, 0.45, 5000, 3000, 0.9);
  });
  D('empCrackle', b => { // target area, over the delay: hum pitch + intensity build, increasingly dense crackle
    const d = dur(b, 2.9), a = d * 0.85;
    T(b, { type: 'sawtooth', f: 70, f2: 240, d, g: 0.09, a, lp: 500, lp2: 2000, am: 11, amd: 0.5, rel: 0.04, lin: true, dist: 1.5 });
    T(b, { type: 'square', f: 140, f2: 480, d, g: 0.025, a, lp: 1500, rel: 0.04, lin: true });
    T(b, { type: 'sine', f: 900, f2: 3400, d, g: 0.03, a, fm: 7, fmd: 30, rel: 0.04 });
    T(b, { type: 'sine', f: 220, f2: 520, d, g: 0.05, a: d * 0.7, am: 14, amd: 0.9, rel: 0.04, lin: true });
    spark(b, 0, d, 0.55, 3500, 6500, 0.8, { a, rel: 0.04 });
    spark(b, 0, d, 0.25, 1500, 2600, 1.2, { a: d * 0.95, rel: 0.03, ft: 'bandpass' });
  });
  D('empPop', b => { // dull bass discharge: sub drop, lowpassed noise body, a short zap
    boom(b, 170, 34, 0.55, 0.62, 0, 2.5);
    rumble(b, 700, 80, 0.5, 1.7);
    N(b, { ft: 'bandpass', f: 2600, f2: 400, d: 0.26, g: 0.34, q: 0.8, lp: 3500 });
    T(b, { type: 'sawtooth', f: 1900, f2: 90, d: 0.16, g: 0.14, lp: 3200 });
    T(b, { type: 'sawtooth', f: 130, f2: 100, d: 0.35, g: 0.09, lp: 800, am: 55, at: 0.02 });
    spark(b, 0.04, 0.42, 0.5, 4500, 1800, 0.9);
  });
  D('empDrain', b => { // mana siphon per unit
    T(b, { type: 'sawtooth', f: 1300, f2: 300, d: 0.14, g: 0.09, lp: 3000, dist: 2 });
    T(b, { type: 'sine', f: 700, f2: 2600, d: 0.14, g: 0.06, lin: true, at: 0.04, mr: 3, mi: 0.8 });
    spark(b, 0, 0.16, 0.4, 5000, 3000, 1);
  });

  // ================================================================== Tornado: windy rushing sweep, gust lift, soft body thud
  D('cast_tornado', b => {
    air(b, 200, 1400, 0.6, 0.65, 0, 0.22, 1.1);
    air(b, 1800, 5200, 0.55, 0.12, 0.05, 0.25, 0.9);
    T(b, { type: 'sawtooth', f: 70, f2: 115, d: 0.5, g: 0.08, lp: 320, a: 0.1 });
    T(b, { type: 'sine', f: 700, f2: 1150, d: 0.5, g: 0.035, a: 0.2, fm: 6, fmd: 40 });
  });
  D('cast_tornado_dark', b => { // Dark Artistry skin: lower, growling
    air(b, 110, 800, 0.8, 0.7, 0, 0.3, 1.0);
    rumble(b, 400, 80, 0.7, 1.3, 0.15);
    T(b, { type: 'sawtooth', f: 46, f2: 80, d: 0.75, g: 0.2, lp: 240, a: 0.2, dist: 2 });
    T(b, { type: 'sawtooth', f: 65, f2: 113, d: 0.6, g: 0.07, lp: 400, a: 0.2, det: 30 });
    T(b, { type: 'sine', f: 480, f2: 300, d: 0.7, g: 0.04, a: 0.3, fm: 4, fmd: 30 });
    boom(b, 52, 30, 0.5, 0.45, 0.05);
  });
  D('tornadoLift', b => { // gust snatching the unit up
    const f = R(380, 820);
    air(b, f, f * R(2.2, 3.4), 0.26, 0.24, 0, 0.05, 1.5);
    T(b, { type: 'sine', f: R(180, 240), f2: R(460, 600), d: 0.26, g: 0.13, a: 0.04 });
    T(b, { type: 'triangle', f: R(900, 1400), f2: R(1500, 2200), d: 0.18, g: 0.03, a: 0.05, fm: 7, fmd: 40 });
  });
  D('tornadoLand', b => { // soft body thud
    boom(b, R(90, 135), 42, 0.18, 0.36);
    rumble(b, R(350, 650), 150, 0.13, 0.8);
    N(b, { ft: 'bandpass', f: R(900, 1500), d: 0.04, g: 0.1, q: 1.4, at: 0.01 });
  });
  D('twisterWhirl', b => { // scepter twister lifetime swirl
    const d = dur(b, 2);
    air(b, 300, 950, d, 0.22, 0, d * 0.2, 1.6, { rel: 0.2, am: 3, amd: 0.5 });
    T(b, { type: 'sine', f: 560, f2: 820, d, g: 0.014, a: d * 0.25, fm: 5, fmd: 40, rel: 0.2 });
  });

  // ================================================================== Alacrity: quick bright electric-fire buff
  D('cast_alacrity', b => {
    T(b, { type: 'sawtooth', f: 160, f2: 1900, d: 0.2, g: 0.09, a: 0.02, lp: 3000, dist: 3, lin: true }); // electric zip up
    spark(b, 0, 0.4, 0.55, 4500, 6500, 0.9);
    air(b, 400, 2200, 0.26, 0.28, 0.04, 0.1, 0.8, { ft: 'lowpass' }); // flame whoosh
    boom(b, 230, 120, 0.2, 0.28, 0.14);
    arp(b, [1175, 1760, 2349], 0.055, (f, i, t) => bell(b, f, 0.12 - i * 0.02, 0.35, 0.16 + t, 1.2)); // bright ding
    T(b, { type: 'sawtooth', f: 98, d: 0.35, g: 0.04, lp: 340, am: 30, amd: 0.9, at: 0.2 }); // purr
    air(b, 7000, 11000, 0.25, 0.05, 0.15, 0.02, 0.6, { ft: 'highpass' });
  });

  // ================================================================== Sun Strike: charge-up hum, then a bright heavy beam impact with sizzle
  D('castSun', b => {
    bell(b, 1568, 0.12, 0.3, 0, 1);
    T(b, { type: 'triangle', f: 700, f2: 1400, d: 0.14, g: 0.09 });
    air(b, 1200, 4000, 0.18, 0.08, 0, 0.08);
  });
  D('sunBeam', b => { // the beam column over the 1.7 s delay: swelling hum + rising holy chimes + building sizzle
    const d = dur(b, 1.7), a = d * 0.85, sc = [784, 880, 988, 1175, 1318.5, 1568, 1760, 1976, 2349];
    T(b, { type: 'sawtooth', f: 110, f2: 330, d, g: 0.04, a, lp: 600, lp2: 2800, rel: 0.04, dist: 1.5 });
    T(b, { type: 'sawtooth', f: 111.5, f2: 334, d, g: 0.03, a, lp: 600, lp2: 2800, rel: 0.04 });
    T(b, { type: 'triangle', f: 330, f2: 990, d, g: 0.05, a, fm: 5, fmd: 8, rel: 0.04 });
    T(b, { type: 'sine', f: 60, f2: 170, d, g: 0.12, a, rel: 0.04 });
    spark(b, 0, d, 0.3, 4500, 7500, 0.8, { a, rel: 0.04 });
    N(b, { ft: 'highpass', f: 4000, f2: 9500, d, g: 0.035, a, rel: 0.04 });
    const n = Math.max(5, Math.round(d * 5));
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1), f = sc[Math.min(sc.length - 1, Math.floor(k * sc.length))], at = Math.min(d - 0.12, d * Math.pow(i / n, 0.85));
      bell(b, f, 0.04 + 0.07 * k, 0.4, at, 0.8);
    }
  });
  D('sunImpact', b => { // detonation: crack, sub drop, roaring body, searing wash, bright metallic ring, long sizzle
    N(b, { ft: 'highpass', f: 2800, d: 0.06, g: 0.5 });
    boom(b, 98, 26, 1.0, 0.62, 0.002, 2.2);
    boom(b, 55, 40, 0.6, 0.3, 0.04);
    rumble(b, 3000, 120, 1.1, 2.1);
    air(b, 3500, 900, 0.8, 0.28, 0, 0.02, 0.8);
    T(b, { type: 'sawtooth', f: 900, f2: 420, d: 0.5, g: 0.09, lp: 3500, a: 0.004, dist: 4 });
    [1568, 2349, 3136].forEach((f, i) => bell(b, f, 0.07, 0.9 - i * 0.2, i * 0.015, 1.5));
    spark(b, 0.04, 1.1, 0.7, 5500, 2200, 0.9, { a: 0.01 });
    N(b, { ft: 'bandpass', f: 420, f2: 200, d: 0.7, g: 0.16, a: 0.03, q: 0.8 });
  });
  D('cataclysm', b => { // scepter: rising rumble with distant chimes
    const d = 1.2;
    rumble(b, 90, 800, d, 1.3, 0, d * 0.8);
    T(b, { type: 'sawtooth', f: 40, f2: 110, d, g: 0.12, a: d * 0.8, lp: 300, rel: 0.1, dist: 2 });
    arp(b, [784, 1175, 1568, 2349], 0.2, (f, i, t) => bell(b, f, 0.05, 0.7, 0.2 + t, 0.8));
    spark(b, 0.3, 0.9, 0.3, 3000, 6000, 1, { a: 0.5 });
  });

  // ================================================================== Forge Spirit: dark low cast, fiery summon pop with forge clang
  D('cast_forgespirit', b => {
    T(b, { type: 'sawtooth', f: 74, f2: 52, d: 0.5, g: 0.15, lp: 320, a: 0.06, dist: 2 });
    T(b, { type: 'sawtooth', f: 112, f2: 78, d: 0.4, g: 0.05, lp: 500, a: 0.05, fm: 5, fmd: 6 });
    boom(b, 120, 55, 0.32, 0.4, 0.004);
    air(b, 240, 1000, 0.35, 0.5, 0, 0.15, 0.8, { ft: 'lowpass' });
    spark(b, 0.1, 0.35, 0.25, 2200, 1200, 1);
  });
  D('spiritSpawn', b => { // fiery summon pop
    boom(b, 140, 45, 0.34, 0.5, 0.003, 1.8);
    N(b, { ft: 'bandpass', f: 1300, d: 0.04, g: 0.3, q: 1.2 }); // pop click
    clang(b, 310, 0.15, 0.02);
    air(b, 260, 2600, 0.4, 0.5, 0, 0.1, 0.7, { ft: 'lowpass' });
    rumble(b, 300, 1200, 0.3, 0.9, 0, 0.09);
    spark(b, 0.06, 0.6, 0.55, 2800, 1400, 0.9);
    for (let i = 0; i < 6; i++) {
      const t = R(0.1, 0.6), f = R(280, 900);
      N(b, { ft: 'bandpass', f, f2: f * 1.8, d: R(0.04, 0.09), g: R(0.1, 0.2), q: 7, at: t });
      T(b, { type: 'sine', f: f * 0.6, f2: f * 1.3, d: 0.06, g: 0.07, at: t, a: 0.01 });
    }
  });
  D('spiritExpire', b => {
    air(b, 1600, 280, 0.4, 0.14, 0.02, 0.02, 1.2);
    T(b, { type: 'sine', f: 300, f2: 90, d: 0.32, g: 0.14, a: 0.01 });
    spark(b, 0.04, 0.4, 0.35, 3500, 1800, 1);
  });

  // ================================================================== Chaos Meteor: launch whoosh, low rumbling fall, heavy impact, burn tick, crumble
  D('castMeteor', b => {
    air(b, 400, 2300, 0.3, 0.3, 0, 0.08, 1.3);
    T(b, { type: 'sawtooth', f: 130, f2: 520, d: 0.25, g: 0.09, lp: 1500, a: 0.05, dist: 2 });
    rumble(b, 320, 90, 0.4, 0.8, 0.05);
    spark(b, 0.05, 0.3, 0.4, 3000, 1800, 1);
  });
  D('meteorWhistle', b => { // incoming: deep rumble rising + doppler-ish whistle over the land delay
    const d = dur(b, 1.3), a = d * 0.8;
    rumble(b, 80, 520, d, 2.0, 0, a);
    T(b, { type: 'sawtooth', f: 38, f2: 105, d, g: 0.15, a, lp: 200, lp2: 650, rel: 0.05, dist: 2 });
    air(b, 600, 2800, d, 0.14, 0, a, 1);
    T(b, { type: 'sine', f: 1700, f2: 500, d, g: 0.025, a: d * 0.5, fm: 6, fmd: 30, rel: 0.04 });
  });
  D('meteorLand', b => { // heavy impact: sub boom, shaking rumble, rock debris, fire blossom
    N(b, { ft: 'highpass', f: 2500, d: 0.06, g: 0.4 });
    boom(b, 112, 26, 1.0, 0.66, 0.002, 2.5);
    rumble(b, 1000, 70, 0.9, 2.3);
    T(b, { type: 'sawtooth', f: 210, f2: 40, d: 0.3, g: 0.18, lp: 800, dist: 3 });
    air(b, 2200, 700, 0.5, 0.14, 0.02, 0.02, 0.8);
    spark(b, 0.05, 0.9, 0.55, 1300, 450, 1.1, { a: 0.01 });
    for (let i = 0; i < 7; i++) N(b, { ft: 'bandpass', f: R(300, 900), d: 0.05, g: R(0.1, 0.22), q: 3, at: 0.1 + R(0, 0.5) });
  });
  D('meteorBurn', b => { // Lina-like fire hit
    N(b, { ft: 'bandpass', f: R(900, 1800), d: 0.08, g: 0.26, q: 1.2 });
    boom(b, R(200, 280), 90, 0.11, 0.22);
    spark(b, 0, 0.14, 0.4, 3500, 1800, 1);
    rumble(b, 1600, 400, 0.15, 0.5, 0.01);
  });
  D('meteorCrumble', b => { // rocks fall apart
    rumble(b, 1000, 120, 0.85, 1.4, 0, 0.02);
    boom(b, 75, 34, 0.6, 0.32, 0.01);
    for (let i = 0; i < 12; i++) N(b, { ft: 'bandpass', f: R(180, 900), d: 0.05, g: R(0.12, 0.26), q: 3, at: R(0, 0.75) });
    N(b, { ft: 'highpass', f: 3500, d: 0.2, g: 0.07, at: 0.03 });
  });

  // ================================================================== Deafening Blast: low sonic boom + wide noise wash (stereo-spread)
  D('cast_deafeningblast', b => {
    N(b, { ft: 'bandpass', f: 300, f2: 3800, d: 0.5, g: 0.4, q: 1.2, a: 0.12, pan: -0.55 });
    N(b, { ft: 'bandpass', f: 380, f2: 3200, d: 0.5, g: 0.4, q: 1.2, a: 0.12, pan: 0.55 });
    boom(b, 74, 26, 0.75, 0.78, 0.004, 2);
    T(b, { type: 'sawtooth', f: 420, f2: 55, d: 0.26, g: 0.18, lp: 1500, dist: 3 });
    T(b, { type: 'sine', f: 1200, f2: 2600, d: 0.3, g: 0.06, a: 0.15 });
    N(b, { ft: 'highpass', f: 3000, d: 0.08, g: 0.3, at: 0.1 });
    rumble(b, 800, 90, 0.85, 1.4, 0.1);
    air(b, 900, 200, 0.9, 0.14, 0.2, 0, 0.7);
  });
  D('cast_deafeningblast_dark', b => {
    N(b, { ft: 'bandpass', f: 140, f2: 2200, d: 0.65, g: 0.4, q: 1.0, a: 0.2, pan: -0.55 });
    N(b, { ft: 'bandpass', f: 170, f2: 1900, d: 0.65, g: 0.4, q: 1.0, a: 0.2, pan: 0.55 });
    boom(b, 52, 20, 0.95, 0.88, 0.004, 2.5);
    T(b, { type: 'sawtooth', f: 260, f2: 38, d: 0.4, g: 0.22, lp: 900, dist: 3 });
    T(b, { type: 'sawtooth', f: 62, f2: 41, d: 0.8, g: 0.1, lp: 300, det: 40, a: 0.1 });
    T(b, { type: 'sine', f: 700, f2: 1500, d: 0.4, g: 0.05, a: 0.25, fm: 3, fmd: 30 });
    N(b, { ft: 'highpass', f: 2200, d: 0.1, g: 0.3, at: 0.18 });
    rumble(b, 480, 70, 1.0, 1.6, 0.15);
  });
  D('deafeningHit', b => { // per-unit concussion
    boom(b, 165, 60, 0.17, 0.3);
    N(b, { ft: 'bandpass', f: 1100, d: 0.07, g: 0.2, q: 1.2 });
    T(b, { type: 'sine', f: 900, f2: 300, d: 0.1, g: 0.05, a: 0.004 });
    rumble(b, 500, 120, 0.15, 0.6);
  });

  // ================================================================== items
  D('refresher', b => { // bright shimmering reset: rising bell run, sparkle, upward sweep
    arp(b, [523.25, 783.99, 1046.5, 1567.98, 2093, 3135.96], 0.055, (f, i, t) => { bell(b, f, 0.16, 0.5, t, 1.1); T(b, { type: 'sine', f: f * 2.76, d: 0.12, g: 0.025, at: t }); });
    T(b, { type: 'sine', f: 130, f2: 260, d: 0.4, g: 0.18, a: 0.1 });
    air(b, 400, 5200, 0.3, 0.14, 0, 0.2, 1.2);
    N(b, { ft: 'highpass', f: 6000, f2: 11000, d: 0.55, g: 0.06, a: 0.1 });
    spark(b, 0.1, 0.5, 0.25, 6000, 9000, 1.5);
    glass(b, 3520, 0.05, 0.3, 0.6);
  });
  // Rod of Atos: whip crack + chain rattle (launch), root clank + magical bind (hit)
  D('atosLaunch', b => {
    air(b, 800, 3600, 0.12, 0.14, 0, 0.05, 1.4, { nk: 'white' });
    T(b, { type: 'sawtooth', f: 300, f2: 800, d: 0.12, g: 0.07, lp: 2000, a: 0.04 });
    N(b, { ft: 'highpass', f: 3500, d: 0.03, g: 0.32, at: 0.1 });
    T(b, { type: 'sine', f: 1700, f2: 500, d: 0.08, g: 0.1, at: 0.1 });
    chainTicks(b, 7, 0.02, 0.03, 0.055);
  });
  D('atosHit', b => {
    clang(b, 520, 0.16);
    N(b, { ft: 'highpass', f: 3000, d: 0.05, g: 0.3 });
    boom(b, 100, 55, 0.26, 0.34);
    T(b, { type: 'sine', f: 250, f2: 420, d: 0.2, g: 0.07, a: 0.03, at: 0.04 });
    chainTicks(b, 4, 0.05, 0.035, 0.05);
  });
  D('whiff', b => { air(b, 1800, 500, 0.12, 0.1, 0, 0.02, 1.2); });
  // Gleipnir: rattling chain launch, heavy chains snapping around the target
  D('fx:gleipnirLaunch', b => {
    air(b, 700, 2400, 0.22, 0.14, 0, 0.03, 1.5);
    T(b, { type: 'sawtooth', f: 200, f2: 600, d: 0.2, g: 0.07, lp: 1800 });
    chainTicks(b, 11, 0.01, 0.028, 0.06);
  });
  D('fx:gleipnirHit', b => {
    clang(b, 380, 0.18); clang(b, 410, 0.1, 0.05);
    N(b, { ft: 'highpass', f: 2500, d: 0.06, g: 0.3 });
    boom(b, 85, 45, 0.4, 0.4);
    T(b, { type: 'sawtooth', f: 90, d: 0.5, g: 0.06, lp: 400, am: 9, amd: 0.8, at: 0.1 });
    chainTicks(b, 8, 0.08, 0.04, 0.05);
  });
  D('castitem_gleipnir', b => { chainTicks(b, 4, 0, 0.04, 0.04); T(b, { type: 'sine', f: 300, f2: 500, d: 0.12, g: 0.1, a: 0.02 }); });
  D('chainRelease', b => { chainTicks(b, 5, 0, 0.035, 0.045); T(b, { type: 'sine', f: 500, f2: 250, d: 0.12, g: 0.06, a: 0.004 }); });
  // Orchid Malevolence: ghostly cast, soul-burn sear on the target, burst when it ends
  D('castitem_orchid', b => {
    air(b, 2200, 500, 0.3, 0.08, 0, 0.08, 2);
    T(b, { type: 'sine', f: 880, f2: 1320, d: 0.25, g: 0.07, a: 0.03, fm: 5.5, fmd: 10 });
  });
  D('fx:orchidHit', b => {
    [880, 1318.5].forEach((f, i) => T(b, { type: 'sine', f, f2: f * 0.94, d: 0.9, g: 0.1, a: 0.03, at: i * 0.11, fm: 5.5, fmd: 8, det: i ? 11 : -7 }));
    T(b, { type: 'sine', f: 1760, d: 0.8, g: 0.04, a: 0.2, at: 0.1, det: 14 });
    air(b, 3200, 700, 0.5, 0.12, 0, 0.04, 2);
    T(b, { type: 'sawtooth', f: 160, f2: 90, d: 0.45, g: 0.06, lp: 500, a: 0.05 });
    spark(b, 0.05, 0.6, 0.3, 4000, 2200, 1.2);
  });
  D('fx:orchidBurst', b => {
    boom(b, 420, 90, 0.3, 0.42);
    N(b, { ft: 'bandpass', f: 1600, f2: 260, d: 0.25, g: 0.36, q: 1 });
    N(b, { ft: 'highpass', f: 4500, d: 0.08, g: 0.22 });
    arp(b, [1318.5, 987.77, 659.25], 0.07, (f, i, t) => T(b, { type: 'sine', f, d: 0.5, g: 0.1, a: 0.01, at: 0.05 + t, fm: 6, fmd: 10 }));
  });
  // Scythe of Vyse: a comedic pop - smoke poof, a cartoon 'boing' up-and-down, and a goat-ish 'baa' as the victim lands
  D('hex', b => {
    air(b, 900, 280, 0.22, 0.34, 0, 0.01, 0.8);                          // poof
    N(b, { ft: 'bandpass', f: 1500, d: 0.03, g: 0.3, q: 1.2 });            // pop
    T(b, { type: 'sine', f: 1600, f2: 260, d: 0.05, g: 0.28, a: 0.002 });
    T(b, { type: 'sine', f: 240, f2: 1050, d: 0.1, g: 0.2, a: 0.004, at: 0.04, fm: 14, fmd: 40 });    // boing up
    T(b, { type: 'sine', f: 1050, f2: 330, d: 0.14, g: 0.17, a: 0.004, at: 0.14, fm: 14, fmd: 40 });  // ...and down
    T(b, { type: 'sawtooth', f: 330, f2: 250, d: 0.4, g: 0.12, at: 0.3, a: 0.03, lp: 1300, lp2: 700, fm: 30, fmd: 22, rel: 0.12 });
    T(b, { type: 'square', f: 660, f2: 500, d: 0.36, g: 0.035, at: 0.3, a: 0.03, lp: 1800, fm: 30, fmd: 30, rel: 0.1 });
    bell(b, 2349, 0.05, 0.25, 0.04, 0.6);
  });
  D('hexEnd', b => {
    air(b, 300, 1100, 0.18, 0.28, 0, 0.02, 0.9);
    T(b, { type: 'sine', f: 200, f2: 900, d: 0.1, g: 0.14, a: 0.003 });
    bell(b, 1568, 0.07, 0.22, 0.08, 0.8);
  });
  D('blocked', b => { // Linken's / BKB style deflect: bright 'tink'
    clang(b, 1200, 0.15);
    N(b, { ft: 'highpass', f: 4000, d: 0.05, g: 0.2 });
    bell(b, 2400, 0.07, 0.3, 0.02, 0.8);
  });
  // Shiva's Guard: icy wave expanding outward (dur = r / speed)
  D('shiva', b => {
    const d = dur(b, 0.7, 0.5);
    air(b, 600, 5600, d, 0.34, 0, d * 0.25, 2, { nk: 'white' });
    N(b, { ft: 'highpass', f: 6000, d: d * 0.9, g: 0.06, a: 0.1 });
    boom(b, 145, 48, 0.62, 0.52, 0.004, 1.8);
    N(b, { ft: 'highpass', f: 3500, d: 0.06, g: 0.28 });
    T(b, { type: 'sawtooth', f: 90, f2: 180, d, g: 0.05, lp: 400, a: d * 0.4 });
    spark(b, 0.05, d, 0.45, 6500, 3000, 1, { a: 0.03 });
    for (let i = 0; i < 6; i++) bell(b, R(1800, 3800), 0.06, 0.26, 0.08 + i * (d / 8) + R(0, 0.03), 0.8);
  });
  D('iceHit', b => {
    bell(b, R(2400, 3400), 0.13, 0.22, 0, 1);
    N(b, { ft: 'highpass', f: 6000, d: 0.04, g: 0.12 });
    spark(b, 0.01, 0.1, 0.25, 7000, 4000, 1.5);
  });
  // Meteor Hammer: channel start, falling rocks over the land delay, big impact (stun + crunch), fizzle on cancel
  D('hammerStart', b => {
    T(b, { type: 'sawtooth', f: 90, f2: 210, d: 0.55, g: 0.11, lp: 500, a: 0.3 });
    air(b, 380, 1300, 0.5, 0.13, 0, 0.35, 1.2);
    T(b, { type: 'sine', f: 55, d: 0.3, g: 0.3, a: 0.01 });
  });
  D('hammerFall', b => {
    const d = dur(b, 0.9), a = d * 0.75;
    rumble(b, 100, 700, d, 1.7, 0, a);
    air(b, 500, 2600, d, 0.12, 0, a, 1);
    T(b, { type: 'sawtooth', f: 45, f2: 120, d, g: 0.1, a, lp: 250, rel: 0.05 });
    for (let i = 0; i < 6; i++) N(b, { ft: 'bandpass', f: R(400, 1600), d: 0.04, g: R(0.05, 0.12), q: 4, at: R(0.05, Math.max(0.1, d - 0.05)) });
  });
  D('hammerImpact', b => {
    boom(b, 125, 30, 0.65, 0.72, 0.003, 2.2);
    rumble(b, 1300, 90, 0.5, 2.2);
    N(b, { ft: 'highpass', f: 3000, d: 0.06, g: 0.34 });
    clang(b, 160, 0.1, 0.01);
    N(b, { ft: 'bandpass', f: 2200, f2: 700, d: 0.3, g: 0.1, q: 0.8, a: 0.02 });
    for (let i = 0; i < 5; i++) N(b, { ft: 'bandpass', f: R(300, 900), d: 0.05, g: R(0.1, 0.2), q: 3, at: 0.08 + R(0, 0.35) });
  });
  D('hammerCancel', b => {
    T(b, { type: 'sawtooth', f: 200, f2: 60, d: 0.25, g: 0.1, lp: 600 });
    air(b, 1200, 250, 0.2, 0.1, 0, 0, 1);
  });
  // Black King Bar: deep golden gong, war-drum thump, brass swell, sparkle
  D('bkb', b => {
    boom(b, 95, 45, 0.45, 0.62, 0.004, 1.6);
    boom(b, 120, 55, 0.35, 0.4, 0.14);
    gong(b, 146.8, 0.17, 0.02, 1.9);
    rumble(b, 600, 160, 0.25, 1.1);
    air(b, 280, 760, 0.7, 0.18, 0, 0.2, 1.2);
    [196, 293.66, 392].forEach((f, i) => T(b, { type: 'sawtooth', f, f2: f * 1.02, d: 0.8, g: 0.05, a: 0.2, lp: 1400, at: 0.06, fm: 5.5, fmd: f * 0.01 + i }));
    arp(b, [783.99, 1174.7, 1568], 0.05, (f, i, t) => bell(b, f, 0.07, 0.8, 0.12 + t, 0.8, 2.01));
    N(b, { ft: 'highpass', f: 5000, d: 0.5, g: 0.05, a: 0.1, at: 0.1 });
  });
  D('bkbEnd', b => { // power down
    T(b, { type: 'sine', f: 900, f2: 180, d: 0.3, g: 0.1, a: 0.01 });
    air(b, 3000, 400, 0.26, 0.14, 0, 0, 1.2);
    boom(b, 110, 55, 0.25, 0.2, 0.01);
    gong(b, 110, 0.05, 0, 0.5);
  });
  // Blink Dagger: fast zippy teleport out / in
  D('blink', b => {
    air(b, 3600, 700, 0.12, 0.28, 0, 0, 1.5, { nk: 'white' });
    T(b, { type: 'sine', f: 2800, f2: 280, d: 0.1, g: 0.24, a: 0.002, mr: 2.4, mi: 1.5, mdec: 0.1 });
    N(b, { ft: 'highpass', f: 5000, d: 0.05, g: 0.1 });
    bell(b, 3520, 0.04, 0.2, 0.04, 0.6);
  });
  D('blinkIn', b => {
    air(b, 600, 4200, 0.1, 0.2, 0.05, 0, 1.5, { nk: 'white' });
    T(b, { type: 'sine', f: 400, f2: 2500, d: 0.1, g: 0.2, at: 0.05, a: 0.003 });
    boom(b, 125, 70, 0.1, 0.28, 0.14);
    N(b, { ft: 'highpass', f: 5500, d: 0.08, g: 0.12, at: 0.14 });
  });
  // Boots of Travel: shimmering charge, fizzle, arrival thump + whoosh
  D('tpStart', b => {
    T(b, { type: 'sine', f: 330, f2: 660, d: 0.4, g: 0.12, a: 0.1 });
    air(b, 700, 3000, 0.4, 0.16, 0, 0.2, 1.6);
    arp(b, [1046.5, 1568, 2093], 0.07, (f, i, t) => bell(b, f, 0.05, 0.35, 0.1 + t, 0.8));
  });
  D('tpCancel', b => { T(b, { type: 'sine', f: 800, f2: 200, d: 0.2, g: 0.1, a: 0.005 }); air(b, 2500, 400, 0.18, 0.1, 0, 0, 1.2); });
  D('tpArrive', b => {
    air(b, 4000, 400, 0.35, 0.3, 0, 0, 1.0, { nk: 'white' });
    boom(b, 130, 45, 0.4, 0.5, 0.004);
    N(b, { ft: 'highpass', f: 4500, d: 0.08, g: 0.2 });
    arp(b, [2093, 1568, 1046.5], 0.06, (f, i, t) => bell(b, f, 0.06, 0.4, 0.05 + t, 0.8));
  });
  // Force Staff: sudden 'whump' shove + wind streak
  D('fx:forceStaff', b => {
    boom(b, 180, 60, 0.2, 0.5, 0.002, 1.5);
    air(b, 400, 3000, 0.22, 0.34, 0, 0.03, 1.4);
    T(b, { type: 'sine', f: 600, f2: 1500, d: 0.18, g: 0.07, lin: true });
    rumble(b, 500, 150, 0.15, 0.7);
  });
  // Eul's Scepter: whirling cyclone that lifts - swirling wind, rising pitch, sparkle
  D('fx:eulsCyclone', b => {
    const d = dur(b, 1.6, 0.8);
    air(b, 300, 1400, d, 0.36, 0, d * 0.15, 1.4, { am: 5, amd: 0.5, rel: 0.25 });
    air(b, 2200, 800, d, 0.1, 0.05, d * 0.2, 1.1, { am: 3.2, amd: 0.6, rel: 0.25 });
    T(b, { type: 'sine', f: 380, f2: 900, d, g: 0.05, a: d * 0.2, fm: 6, fmd: 30, rel: 0.25 });
    boom(b, 150, 70, 0.2, 0.3);
    arp(b, [1568, 2093, 2637], 0.06, (f, i, t) => bell(b, f, 0.05, 0.4, 0.05 + t, 0.8));
  });
  // Dust of Appearance: dry powdery 'foof'
  D('fx:dustBlast', b => {
    air(b, 2600, 700, 0.35, 0.34, 0, 0.01, 0.7, { nk: 'white' });
    rumble(b, 700, 200, 0.2, 0.9);
    boom(b, 140, 70, 0.14, 0.3);
    spark(b, 0.02, 0.25, 0.3, 5000, 3000, 1);
    bell(b, 2093, 0.04, 0.3, 0.1, 0.5);
  });
  // Shadow Blade: metallic 'shing' then the air fades; reappear = blade slash
  D('fx:shadowFade', b => {
    clang(b, 1750, 0.06);
    air(b, 4500, 800, 0.4, 0.2, 0.02, 0.01, 1.4);
    T(b, { type: 'sine', f: 800, f2: 200, d: 0.35, g: 0.06, a: 0.05 });
  });
  D('fx:shadowOn', b => {
    air(b, 800, 4800, 0.1, 0.24, 0, 0, 1.4, { nk: 'white' });
    clang(b, 2100, 0.07);
    boom(b, 140, 80, 0.1, 0.18, 0.02);
  });
  D('fx:invisBreak', b => { air(b, 1500, 5000, 0.12, 0.2, 0, 0, 1.2, { nk: 'white' }); bell(b, 2200, 0.06, 0.2, 0.02, 0.6); });
  D('fx:respawn', b => { arp(b, [880, 1318.5, 1760], 0.07, (f, i, t) => bell(b, f, 0.08, 0.35, t, 0.8)); air(b, 500, 3000, 0.25, 0.08, 0, 0.1, 1); });
  D('fx:dodge', b => { air(b, 2200, 600, 0.1, 0.1, 0, 0, 1.2, { nk: 'white' }); });
  D('fx:boltDodged', b => { air(b, 2200, 600, 0.1, 0.1, 0, 0, 1.2, { nk: 'white' }); });

  // ================================================================== combat extras (towers, hero death, enemy bolt)
  D('dmgTick', b => { N(b, { ft: 'bandpass', f: 1500, d: 0.015, g: 0.1, q: 2 }); });
  D('boltWarn', b => { [0, 0.16, 0.32].forEach((t, i) => bell(b, 880 + i * 110, 0.13, 0.12, t, 0.5)); });
  D('boltHit', b => { // stun bolt
    T(b, { type: 'sawtooth', f: 1200, f2: 90, d: 0.28, g: 0.22, lp: 3000, dist: 3 });
    N(b, { ft: 'bandpass', f: 2500, f2: 600, d: 0.15, g: 0.32, q: 1 });
    boom(b, 90, 60, 0.3, 0.4);
    spark(b, 0.02, 0.2, 0.4, 5000, 3000, 1);
    T(b, { type: 'sine', f: 1900, d: 0.45, g: 0.05, am: 40, at: 0.05, a: 0.02 });
  });
  D('dummyBlinkTell', b => { T(b, { type: 'sine', f: 600, f2: 1800, d: 0.3, g: 0.08, a: 0.1 }); });
  D('dummyBlink', b => { T(b, { type: 'sine', f: 1800, f2: 400, d: 0.1, g: 0.14 }); N(b, { ft: 'bandpass', f: 2500, d: 0.08, g: 0.12, q: 2 }); });
  // tower shot: deep bolt launch - low 'thoom' with a metallic zing and a fiery crackle
  D('towerShot', b => {
    boom(b, 210, 70, 0.22, 0.5, 0.002, 1.6);
    air(b, 1800, 500, 0.2, 0.18, 0, 0.01, 1.4);
    T(b, { type: 'sawtooth', f: 520, f2: 180, d: 0.2, g: 0.07, lp: 1800, dist: 2 });
    T(b, { type: 'sine', f: 1500, f2: 700, d: 0.3, g: 0.05, mr: 2.76, mi: 1, mdec: 0.1 });
    spark(b, 0.02, 0.2, 0.35, 3500, 1800, 1);
  });
  // tower falls: groaning collapse - long rumble, debris crash, boom
  D('towerDown', b => {
    boom(b, 90, 24, 1.2, 0.7, 0.003, 2);
    rumble(b, 900, 60, 1.6, 2.4, 0, 0.01);
    for (let i = 0; i < 16; i++) N(b, { ft: 'bandpass', f: R(200, 1400), d: R(0.04, 0.09), g: R(0.1, 0.25), q: 3, at: R(0.05, 1.3) });
    clang(b, 140, 0.12, 0.05);
    N(b, { ft: 'highpass', f: 3000, d: 0.3, g: 0.14, at: 0.02 });
    air(b, 1200, 200, 1.0, 0.12, 0.1, 0.1, 0.8);
  });
  // Invoker death: falling drone + collapse thud + reversed swish
  D('heroDeath', b => {
    T(b, { type: 'sawtooth', f: 330, f2: 70, d: 0.8, g: 0.12, lp: 900, lp2: 250, a: 0.02, dist: 1.5 });
    T(b, { type: 'sine', f: 660, f2: 140, d: 0.7, g: 0.07, a: 0.02, fm: 5, fmd: 10 });
    boom(b, 110, 36, 0.5, 0.6, 0.3);
    rumble(b, 500, 90, 0.4, 1.3, 0.3);
    air(b, 4000, 400, 0.5, 0.14, 0, 0.02, 1);
  });

  // ================================================================== combo / progression feedback
  D('comboStep', b => { bell(b, 1175, 0.17, 0.3, 0, 1); T(b, { type: 'sine', f: 2350, d: 0.08, g: 0.05 }); });
  D('comboDone', b => { // satisfying chime: major arpeggio of bells, a held shimmer
    arp(b, [523.25, 659.25, 783.99, 1046.5], 0.075, (f, i, t) => { bell(b, f, 0.15, 0.55, t, 1.1); T(b, { type: 'triangle', f, d: 0.16, g: 0.07, a: 0.003, at: t }); });
    bell(b, 1568, 0.12, 0.8, 0.3, 1);
    boom(b, 130, 90, 0.22, 0.2, 0.005);
    air(b, 7000, 11000, 0.35, 0.04, 0.28, 0.05, 0.6, { ft: 'highpass' });
  });
  D('comboPerfect', b => {
    arp(b, [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568], 0.065, (f, i, t) => { bell(b, f, 0.14, 0.6, t, 1.1); bell(b, f * 2, 0.04, 0.3, t, 0.8); });
    arp(b, [1568, 1976, 2349, 3136], 0.05, (f, i, t) => bell(b, f, 0.07, 0.7, 0.4 + t, 1));
    T(b, { type: 'triangle', f: 261.63, d: 0.9, g: 0.15, at: 0.4, a: 0.01 });
    T(b, { type: 'triangle', f: 392, d: 0.9, g: 0.08, at: 0.4, a: 0.01 });
    boom(b, 130, 80, 0.3, 0.26, 0.005);
    spark(b, 0.42, 0.5, 0.12, 6500, 9500, 1.5);
    air(b, 7000, 12000, 0.6, 0.05, 0.4, 0.1, 0.6, { ft: 'highpass' });
  });
  D('comboFail', b => { // muted dull thud, no melody
    boom(b, 120, 55, 0.3, 0.42, 0.004);
    rumble(b, 320, 100, 0.22, 0.9);
    T(b, { type: 'triangle', f: 98, f2: 78, d: 0.3, g: 0.09, lp: 320, at: 0.03 });
  });
  D('timerTick', b => { bell(b, 1400, 0.1, 0.1, 0, 0.3); });
  D('timerTickLast', b => { bell(b, 1900, 0.15, 0.16, 0, 0.4); boom(b, 220, 150, 0.06, 0.15); });
  D('cdTick', b => { bell(b, 880, 0.2, 0.28, 0, 0.7); boom(b, 140, 100, 0.08, 0.16); });
  D('cdGo', b => { // GO: bright rising burst
    arp(b, [659.25, 987.77, 1318.5], 0.045, (f, i, t) => bell(b, f, 0.18, 0.5, t, 1.1));
    air(b, 600, 6000, 0.22, 0.2, 0, 0.12, 1);
    boom(b, 160, 70, 0.25, 0.42, 0.01);
    spark(b, 0.1, 0.3, 0.25, 6000, 9000, 1.4);
  });
  D('levelUp', b => { // rising whoosh into a golden chord and sparkle
    air(b, 300, 4500, 0.35, 0.25, 0, 0.25, 1.4);
    T(b, { type: 'triangle', f: 261.63, f2: 523.25, d: 0.35, g: 0.12, a: 0.2, lin: true });
    arp(b, [523.25, 659.25, 783.99, 1046.5], 0.03, (f, i, t) => { bell(b, f, 0.13, 1.0, 0.33 + t, 1); T(b, { type: 'triangle', f, d: 0.5, g: 0.05, at: 0.33 + t, a: 0.01 }); });
    arp(b, [2093, 2637, 3136, 3951], 0.06, (f, i, t) => bell(b, f, 0.06, 0.5, 0.4 + t, 0.8));
    boom(b, 120, 80, 0.3, 0.3, 0.32);
    air(b, 7000, 11000, 0.5, 0.04, 0.35, 0.05, 0.6, { ft: 'highpass' });
  });

  // ================================================================== UI (ui/uisound.js maps button kinds to these)
  D('ui_hover', b => { // soft glassy tick
    T(b, { type: 'sine', f: 2300, f2: 1900, d: 0.03, g: 0.07, a: 0.002 });
    N(b, { ft: 'highpass', f: 6500, d: 0.012, g: 0.035, q: 0.7 });
  });
  D('ui_click', b => { // crisp short click: transient + little pitched body
    N(b, { ft: 'bandpass', f: 3200, d: 0.014, g: 0.12, q: 1.2 });
    T(b, { type: 'triangle', f: 1500, f2: 900, d: 0.045, g: 0.14, a: 0.002 });
    T(b, { type: 'sine', f: 300, f2: 180, d: 0.05, g: 0.1, a: 0.002 });
  });
  D('ui_back', b => { // falling two-note, muted
    T(b, { type: 'triangle', f: 880, f2: 840, d: 0.05, g: 0.1, a: 0.002 });
    T(b, { type: 'triangle', f: 587, f2: 520, d: 0.09, g: 0.1, a: 0.002, at: 0.045 });
    N(b, { ft: 'bandpass', f: 1800, d: 0.012, g: 0.06, q: 1 });
  });
  D('ui_start', b => { // primary action: low thump + rising open fifth + shimmer
    boom(b, 140, 55, 0.3, 0.4);
    rumble(b, 900, 200, 0.18, 0.7);
    arp(b, [220, 330, 440], 0.04, (f, i, t) => T(b, { type: 'triangle', f, d: 0.45, g: 0.1, a: 0.012, at: 0.03 + t }));
    bell(b, 880, 0.08, 0.5, 0.14, 0.8);
    N(b, { ft: 'highpass', f: 6000, f2: 10000, d: 0.3, g: 0.05, a: 0.06, at: 0.08 });
  });
  D('ui_error', b => {
    T(b, { type: 'square', f: 180, f2: 150, d: 0.09, g: 0.1, lp: 900 });
    T(b, { type: 'square', f: 170, f2: 130, d: 0.13, g: 0.1, lp: 800, at: 0.1 });
  });
  D('ui_level', b => { bell(b, 1568, 0.13, 0.4, 0, 0.9); bell(b, 2349, 0.08, 0.4, 0.05, 0.9); air(b, 5000, 9000, 0.12, 0.04, 0, 0, 0.8, { ft: 'highpass' }); });

  // ================================================================== dev tools
  const ids = () => Object.keys(SFX.defs).sort();
  SFX.ids = ids;
  // sequentially auditions a list of ids (console: IT.SFX.audition(['bkb','blink'], 1200))
  SFX.audition = (list, gap) => {
    list = list || ids(); gap = gap || 1100;
    list.forEach((id, i) => setTimeout(() => SFX.playEx(id, { prio: true, dur: 1.7 }), i * gap));
    return list.length;
  };
  // on-screen sound board (dev only): click a voice to play it; 'measure all' renders each offline and prints peak / length
  SFX.board = () => {
    const doc = G.document;
    if (!doc) return null;
    const old = doc.getElementById('sfx-board');
    if (old) { old.remove(); return null; }
    SFX.unlock();
    const root = doc.createElement('div');
    root.id = 'sfx-board';
    root.style.cssText = 'position:fixed;inset:20px;z-index:99999;background:#0c0f14ee;color:#dfe6ee;font:12px/1.35 monospace;overflow:auto;padding:12px;border:1px solid #556;border-radius:6px';
    const head = doc.createElement('div');
    head.style.cssText = 'display:flex;gap:10px;align-items:center;margin-bottom:8px';
    head.innerHTML = '<b>IT.SFX board</b>';
    const mk = (txt, fn) => { const x = doc.createElement('button'); x.textContent = txt; x.style.cssText = 'cursor:pointer;padding:2px 8px'; x.onclick = fn; head.appendChild(x); return x; };
    const out = doc.createElement('span');
    mk('measure all', async () => {
      let hot = 0;
      for (const id of ids()) {
        const m = await SFX.render(id, { secs: 4 });
        const cell = root.querySelector('[data-id="' + id.replace(/"/g, '') + '"] i');
        if (m && cell) { const db = 20 * Math.log10(Math.max(1e-6, m.peak)); cell.textContent = ' ' + db.toFixed(1) + 'dB ' + m.dur.toFixed(2) + 's'; if (db > -0.5) { cell.style.color = '#f66'; hot++; } }
      }
      out.textContent = hot ? hot + ' voices hit 0 dBFS' : 'all voices under 0 dBFS';
    });
    mk('close', () => root.remove());
    head.appendChild(out);
    root.appendChild(head);
    const grid = doc.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:4px';
    ids().forEach(id => {
      const bt = doc.createElement('button');
      bt.dataset.id = id;
      bt.style.cssText = 'cursor:pointer;text-align:left;padding:3px 6px;background:#1a212b;color:#dfe6ee;border:1px solid #334';
      bt.innerHTML = id.replace(/</g, '&lt;') + '<i style="color:#8a98a8"></i>';
      bt.onclick = () => SFX.playEx(id, { prio: true, dur: 1.7 });
      grid.appendChild(bt);
    });
    root.appendChild(grid);
    doc.body.appendChild(root);
    return root;
  };
})(typeof window !== 'undefined' ? window : globalThis);
