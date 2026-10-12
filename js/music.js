// Procedural music (WebAudio, original): situation tracks menu | sandbox | countdown | play | escape | splash | result_win | result_fail (+ lowtime layer) + stingers. Owner: S5 / v6 WP10.
// One lookahead scheduler (setInterval + AudioContext time) drives the active theme; themes crossfade. Routed to the 'music' bus.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const LOOK = 0.4, TICK = 90, FADE = 1.6, LOW_TIME = 8;
  const mf = m => 440 * Math.pow(2, (m - 69) / 12);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const SFX = () => G.SFX || IT.SFX;

  let c = null, out = null, tb = null, theme = null, want = null, target = 0, inten = 0, timer = 0, gesture = false, olds = [], low = false, wantLow = false;

  function settings() { try { return IT.Settings && IT.Settings.get && IT.Settings.get(); } catch (e) { return null; } }
  function audible() { const s = settings(); return !s || (s.sound !== false && (!s.audio || (s.audio.musicOn !== false && s.audio.music > 0))); }
  function ready() {
    const S = SFX();
    if (!S || !S.ctx) return false;
    if (!gesture && !(G.navigator && G.navigator.userActivation && G.navigator.userActivation.hasBeenActive)) return false; // wait for a user gesture
    if (!c) {
      c = S.ctx(); if (!c) return false;
      out = c.createGain(); out.connect(S.bus('music'));
    }
    return true;
  }

  // ---------------------------------------------------------------- primitives (th = {g: destination gain})
  function fin(src, nodes) { src.onended = () => { for (const n of nodes) { try { n.disconnect(); } catch (e) {} } }; }
  // oscillator note. o: type g a(attack) rel(hold until d-rel) f2 det lp lp2
  function note(th, t, f, d, o) {
    const os = c.createOscillator(), g = c.createGain(), a = o.a || 0.005, G0 = o.g || 0.1, nodes = [os, g];
    os.type = o.type || 'triangle';
    os.frequency.setValueAtTime(f, t);
    if (o.f2) os.frequency.exponentialRampToValueAtTime(o.f2, t + d);
    if (o.det) os.detune.value = o.det;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(G0, t + Math.min(a, d * 0.9));
    if (o.rel != null) g.gain.setValueAtTime(G0, Math.max(t + a, t + d - o.rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    let s = os;
    if (o.lp) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(o.lp, t); if (o.lp2) fl.frequency.exponentialRampToValueAtTime(o.lp2, t + d); os.connect(fl); s = fl; nodes.push(fl); }
    s.connect(g); g.connect(th.g); os.start(t); os.stop(t + d + 0.05); fin(os, nodes);
  }
  // filtered noise burst. o: ft f f2 q g a d
  function nz(th, t, d, o) {
    const S = SFX(), src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), G0 = o.g || 0.1;
    src.buffer = S.noise(); src.loop = true;
    f.type = o.ft || 'bandpass'; f.frequency.setValueAtTime(o.f, t); if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + d); f.Q.value = o.q || 1;
    if (o.a) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(G0, t + o.a); } else g.gain.setValueAtTime(G0, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(f); f.connect(g); g.connect(th.g); src.start(t, Math.random()); src.stop(t + d + 0.05); fin(src, [src, f, g]);
  }
  // plucked string: bright saw, filter closes fast, soft octave
  function pluck(th, t, f, g, d) {
    d = d || 0.55;
    note(th, t, f, d, { type: 'sawtooth', g: g, a: 0.004, lp: Math.min(f * 9, 5000), lp2: f * 1.3 });
    note(th, t, f * 2, d * 0.5, { type: 'triangle', g: g * 0.35, a: 0.003 });
  }
  // choir-like pad: detuned saws + vibrato + two vowel formants, slow swell. ms = midi notes
  function pad(th, t, ms, d, g) {
    const pg = c.createGain(), sum = c.createGain(), body = c.createBiquadFilter(), b1 = c.createBiquadFilter(), b2 = c.createBiquadFilter();
    const lfo = c.createOscillator(), lg = c.createGain(), nodes = [pg, sum, body, b1, b2, lfo, lg], a = d * 0.38;
    body.type = 'lowpass'; body.frequency.value = 1500;
    b1.type = b2.type = 'bandpass'; b1.frequency.value = 650; b2.frequency.value = 1100; b1.Q.value = b2.Q.value = 2.2;
    pg.gain.setValueAtTime(0.0001, t); pg.gain.exponentialRampToValueAtTime(g, t + a); pg.gain.setValueAtTime(g, t + d - a * 0.9); pg.gain.exponentialRampToValueAtTime(0.0001, t + d);
    lfo.frequency.value = rnd(4.6, 5.6); lg.gain.value = 8; lfo.connect(lg);
    for (const m of ms) for (const dt of [-9, 9]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mf(m); o.detune.value = dt; lg.connect(o.detune);
      o.connect(sum); o.start(t); o.stop(t + d + 0.1); nodes.push(o);
    }
    sum.connect(body); sum.connect(b1); sum.connect(b2);
    const mix = c.createGain(); mix.gain.value = 0.5; nodes.push(mix);
    body.connect(mix); b1.connect(mix); b2.connect(mix); mix.connect(pg); pg.connect(th.g);
    lfo.start(t); lfo.stop(t + d + 0.1); fin(lfo, nodes);
  }
  const kick = (th, t, g) => { note(th, t, 125, 0.28, { type: 'sine', f2: 42, g, a: 0.002 }); nz(th, t, 0.02, { ft: 'highpass', f: 1500, g: g * 0.25 }); };
  const taiko = (th, t, g) => { note(th, t, 92, 0.6, { type: 'sine', f2: 46, g, a: 0.003 }); note(th, t, 180, 0.22, { type: 'sine', f2: 95, g: g * 0.35, a: 0.002 }); nz(th, t, 0.1, { ft: 'lowpass', f: 600, f2: 150, g: g * 0.7 }); };
  const tom = (th, t, g, f) => { note(th, t, f, 0.35, { type: 'sine', f2: f * 0.55, g, a: 0.002 }); nz(th, t, 0.05, { ft: 'bandpass', f: 900, g: g * 0.3 }); };
  const clap = (th, t, g) => { nz(th, t, 0.13, { ft: 'bandpass', f: 1500, q: 0.8, g }); nz(th, t + 0.012, 0.09, { ft: 'bandpass', f: 2400, g: g * 0.7 }); };
  const hat = (th, t, g) => nz(th, t, 0.035, { ft: 'highpass', f: 7500, g });

  // sustained drone: detuned saws + sub, slow filter motion. Returns nodes to stop later.
  function drone(th, f, g, lp) {
    const t = c.currentTime, nodes = [], gn = c.createGain(), fl = c.createBiquadFilter(), lfo = c.createOscillator(), lg = c.createGain();
    fl.type = 'lowpass'; fl.frequency.value = lp; fl.Q.value = 1.5; gn.gain.value = g;
    lfo.frequency.value = rnd(0.06, 0.12); lg.gain.value = lp * 0.4; lfo.connect(lg); lg.connect(fl.frequency); lfo.start(t);
    nodes.push(gn, fl, lfo, lg);
    for (const [ty, ff, dt, k] of [['sawtooth', f, -7, 0.5], ['sawtooth', f * 1.5, 6, 0.25], ['sine', f / 2, 0, 0.9]]) {
      const o = c.createOscillator(), og = c.createGain(); o.type = ty; o.frequency.value = ff; o.detune.value = dt; og.gain.value = k;
      o.connect(og); og.connect(fl); o.start(t); nodes.push(o, og);
    }
    fl.connect(gn); gn.connect(th.g);
    th.nodes.push(...nodes);
  }

  // ---------------------------------------------------------------- themes: sd(x, low) step length (16th), init(th), step(th, i, t, sd, x, low)
  // 8th-note melody helper: arr = 8 slots per bar (0 = hold/rest), s = 16th step in the bar; fn(midi, seconds)
  function mel(arr, s, sd, fn) {
    if (s & 1) return;
    const k = s >> 1, m = arr[k]; if (!m) return;
    let n = 1; while (n < 4 && k + n < 8 && !arr[k + n]) n++;
    fn(m, n * 2 * sd);
  }
  const lead = (th, t, m, d, g) => { // bright square + detuned saw + soft sub-octave
    const f = mf(m);
    note(th, t, f, d * 0.95, { type: 'square', g: g * 0.55, a: 0.006, lp: 3400, lp2: 1800 });
    note(th, t, f, d * 0.95, { type: 'sawtooth', g: g * 0.5, a: 0.008, det: 7, lp: 2800, lp2: 1500 });
    note(th, t, f / 2, d * 0.9, { type: 'triangle', g: g * 0.5, a: 0.01 });
  };
  const bass = (th, t, m, d, g, lp) => { note(th, t, mf(m), d, { type: 'sawtooth', g, a: 0.004, lp: lp || 700, lp2: 220 }); note(th, t, mf(m), d, { type: 'sine', g: g * 1.1, a: 0.006 }); };
  const stab = (th, t, ms, d, g, lp) => ms.forEach((m, k) => note(th, t + k * 0.006, mf(m), d, { type: 'sawtooth', g, a: 0.004, det: k % 2 ? 6 : -6, lp: lp || 2600, lp2: 700 }));
  const crash = (th, t, g, d) => nz(th, t, d || 1.2, { ft: 'highpass', f: 5500, g, a: 0.003 });
  const beep = (th, t, f, g) => note(th, t, f, 0.06, { type: 'sine', g, a: 0.002 });

  // low-time layer (< 8 s left): clock ticks on the beat, a bar-long noise riser, extra kick before the bar line
  function lowLayer(th, s, t, sd) {
    if (s % 4 === 0) beep(th, t, s === 0 ? 2093 : 1568, 0.05);
    if (s % 4 === 2) beep(th, t, 1175, 0.025);
    if (s === 0) nz(th, t, sd * 16, { ft: 'highpass', f: 1800, f2: 9000, g: 0.05, a: sd * 14 });
    if (s === 14 || s === 15) kick(th, t, 0.16);
  }

  const MENU_PROG = ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G'];
  const MENU_CH = { C: [60, 64, 67], G: [55, 59, 62], Am: [57, 60, 64], F: [53, 57, 60] }, MENU_RT = { C: 36, G: 43, Am: 45, F: 41 };
  const MENU_LEAD = [[76, 0, 79, 0, 81, 79, 76, 0], [74, 0, 79, 0, 83, 0, 81, 79], [81, 0, 84, 0, 81, 0, 79, 81], [77, 0, 81, 0, 84, 0, 81, 0],
    [84, 0, 83, 81, 79, 0, 76, 79], [74, 76, 79, 0, 83, 0, 79, 0], [81, 0, 77, 0, 81, 84, 0, 81], [83, 0, 81, 0, 79, 0, 74, 0]];

  const PLAY_PROG = ['Dm', 'Bb', 'C', 'A'];
  const PLAY_CH = { Dm: [50, 53, 57], Bb: [46, 50, 53], C: [48, 52, 55], A: [45, 49, 52] }, PLAY_RT = { Dm: 38, Bb: 34, C: 36, A: 33 };
  const PLAY_ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 4, 3, 2, 1];
  const PLAY_LEAD = [[74, 0, 77, 0, 81, 0, 79, 77], [70, 0, 74, 0, 77, 0, 74, 70], [72, 0, 76, 0, 79, 0, 76, 72], [76, 0, 81, 0, 85, 0, 88, 85]];

  const ESC_PROG = ['Am', 'F', 'G', 'E'];
  const ESC_CH = { Am: [45, 48, 52], F: [41, 45, 48], G: [43, 47, 50], E: [40, 44, 47] }, ESC_RT = { Am: 33, F: 29, G: 31, E: 28 };
  const ESC_LEAD = [[81, 0, 81, 0, 84, 0, 83, 81], [77, 0, 77, 0, 81, 0, 79, 77], [79, 0, 79, 0, 83, 0, 81, 79], [80, 0, 83, 0, 88, 0, 86, 83]];

  const SPL_PROG = ['E', 'B', 'C#m', 'A', 'E', 'B', 'A', 'B'];
  const SPL_CH = { E: [52, 56, 59], B: [47, 51, 54], 'C#m': [49, 52, 56], A: [45, 49, 52] }, SPL_RT = { E: 40, B: 35, 'C#m': 37, A: 33 };
  const SPL_LEAD = [[76, 0, 80, 0, 83, 0, 88, 0], [87, 0, 83, 0, 78, 0, 83, 0], [85, 0, 88, 0, 85, 0, 80, 0], [81, 0, 85, 0, 88, 0, 85, 0],
    [88, 0, 83, 0, 80, 0, 83, 0], [83, 0, 87, 0, 90, 0, 87, 0], [88, 0, 85, 0, 81, 0, 85, 88], [90, 0, 0, 0, 87, 0, 83, 0]];

  const RLX_PROG = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]], RLX_RT = [29, 28, 26, 24];

  const THEMES = {
    // MENU: upbeat, bright C major, 126 BPM. C G Am F C G F G, catchy square lead, four-on-the-floor, bouncing bass, off-beat stabs
    menu: {
      sd: () => 60 / 126 / 4,
      init(th) { drone(th, 65.4, 0.015, 900); },
      step(th, i, t, sd) {
        const s = i % 16, bar = Math.floor(i / 16) % 8, k = MENU_PROG[bar], ch = MENU_CH[k], root = MENU_RT[k], hi = bar >= 4;
        if (s % 4 === 0) kick(th, t, 0.24);
        if (s === 4 || s === 12) clap(th, t, 0.08);
        if (s % 4 === 2) hat(th, t, 0.035); else if ((s & 1) && hi) hat(th, t, 0.012);
        if (!(s & 1)) bass(th, t, root + (s % 8 === 6 ? 12 : s % 8 === 4 ? 7 : 0), sd * 1.7, 0.1);
        if (s === 3 || s === 6 || s === 10 || s === 14) stab(th, t, ch, sd * 1.5, 0.028, 2400);
        if (s === 0) pad(th, t, ch.map(m => m - 12), sd * 17, 0.03);
        if (s === 0 && bar % 4 === 0) crash(th, t, 0.05);
        mel(MENU_LEAD[bar], s, sd, (m, d) => lead(th, t, m, d, 0.07));
        if (hi && (s & 1)) note(th, t, mf(ch[(s >> 1) % 3] + 24), sd * 1.2, { type: 'triangle', g: 0.03, a: 0.003 }); // sparkle arp
        if (bar === 7 && s >= 12) tom(th, t, 0.1, 210 - (s - 12) * 24);
      },
    },
    // SANDBOX (Free Play): relaxed 78 BPM, soft Rhodes-ish chords, quiet beat, wind, pentatonic pluck + echo
    sandbox: {
      sd: () => 60 / 78 / 4,
      init(th) {
        drone(th, 87.3, 0.025, 240);
        const S = SFX(), src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), l = c.createOscillator(), lg = c.createGain();
        src.buffer = S.noise(); src.loop = true; f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 0.6; g.gain.value = 0.012;
        l.frequency.value = 0.09; lg.gain.value = 0.008; l.connect(lg); lg.connect(g.gain);
        src.connect(f); f.connect(g); g.connect(th.g); src.start(); l.start(); th.nodes.push(src, f, g, l, lg);
      },
      step(th, i, t, sd) {
        const s = i % 16, bar = Math.floor(i / 16) % 4, ch = RLX_PROG[bar];
        if (s === 0 || s === 10) ch.forEach((m, k) => { note(th, t + k * 0.02, mf(m), sd * 8, { type: 'triangle', g: 0.04, a: 0.01 }); note(th, t + k * 0.02, mf(m + 12), sd * 4, { type: 'sine', g: 0.012, a: 0.01 }); });
        if (s === 0) pad(th, t, ch.slice(0, 3), sd * 17, 0.03);
        if (s === 0 || s === 8 || s === 11) note(th, t, mf(RLX_RT[bar] + (s === 11 ? 7 : 0) + 12), sd * 5, { type: 'sine', g: 0.12, a: 0.01 });
        if (s === 0 || s === 10) kick(th, t, 0.1);
        if (s === 8) nz(th, t, 0.08, { ft: 'bandpass', f: 1800, g: 0.03 });
        if (s % 4 === 2) hat(th, t, 0.012);
        if (Math.random() < 0.09) {
          const f = mf(pick([72, 74, 76, 79, 81, 84])), g = rnd(0.03, 0.05);
          note(th, t, f, 1.6, { type: 'triangle', g, a: 0.005 });
          note(th, t + 0.55, f, 1.0, { type: 'triangle', g: g * 0.4, a: 0.005 });
          note(th, t + 1.1, f, 0.7, { type: 'triangle', g: g * 0.15, a: 0.005 });
        }
        if (Math.random() < 0.012) { const f = rnd(2800, 4200); for (let k = 0; k < 3; k++) note(th, t + k * 0.11, f * (1 + k * 0.05), 0.08, { type: 'sine', f2: f * 1.35, g: 0.01, a: 0.01 }); }
      },
    },
    // COUNTDOWN: tense pulse that builds over ~4 bars (filter opens, heartbeat kick, bar-long risers, tritone pad, closing tom fill)
    countdown: {
      sd: () => 60 / 124 / 4,
      init(th) { drone(th, 36.7, 0.05, 220); },
      step(th, i, t, sd) {
        const s = i % 16, bar = Math.floor(i / 16), b = Math.min(1, i / 64);
        if (!(s & 1)) note(th, t, mf(bar % 4 === 3 && s >= 8 ? 37 : 38), sd * 1.6, { type: 'sawtooth', g: 0.05 + 0.08 * b, a: 0.003, lp: 260 + 1000 * b, lp2: 160 });
        if (s === 0) { pad(th, t, [50, 56], sd * 17, 0.025 + 0.03 * b); if (bar >= 1) kick(th, t, 0.1 + 0.2 * b); }
        if (bar >= 1 && s === 3) kick(th, t, 0.07 + 0.12 * b);
        if (bar >= 2 && s % 4 === 0 && s) kick(th, t, 0.14 + 0.14 * b);
        if (b > 0.4 && s % 4 === 2) hat(th, t, 0.02 + 0.02 * b);
        if (s === 0) nz(th, t, sd * 16, { ft: 'highpass', f: 700, f2: 8000, g: 0.025 + 0.05 * b, a: sd * 14 });
        if (bar >= 2 && s === 8) pluck(th, t, mf(74), 0.035, 0.4);
        if (bar >= 2 && s >= 12) tom(th, t, 0.08 + (s - 12) * 0.03, 150 - (s - 12) * 8);
        if (bar >= 3 && s === 8) taiko(th, t, 0.22);
      },
    },
    // PLAY: driving D minor battle track, 140 BPM (x -> 152). Dm Bb C A: 16th arpeggio, pumping bass, kick/clap/hats, taiko; lead riff in bars 5-8; x adds layers
    play: {
      sd: (x, low) => 60 / ((140 + 12 * x) * (low ? 1.05 : 1)) / 4,
      init(th) { drone(th, 73.4, 0.04, 320); },
      step(th, i, t, sd, x, low) {
        const s = i % 16, cyc = Math.floor(i / 16) % 8, bar = cyc % 4, k = PLAY_PROG[bar], ch = PLAY_CH[k], root = PLAY_RT[k];
        const tones = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24, ch[1] + 24];
        pluck(th, t, mf(tones[PLAY_ARP[s]]), 0.05 + 0.02 * x, sd * 2.2);
        if (!(s & 1)) bass(th, t, root + (s % 8 === 6 ? 12 : 0), sd * 1.7, s % 4 === 0 ? 0.11 : 0.075, 800);
        if (s === 0) { pad(th, t, ch, sd * 17, 0.04 + 0.02 * x); if (bar % 2 === 0) taiko(th, t, 0.25); }
        if (s === 0 || s === 6 || s === 8 || (x > 0.5 && s === 14)) kick(th, t, 0.28);
        if (s === 4 || s === 12) clap(th, t, 0.09 + 0.05 * x);
        if (!(s & 1)) hat(th, t, 0.02 + 0.015 * x); else if (x > 0.5) hat(th, t, 0.012);
        if (cyc >= 4) mel(PLAY_LEAD[bar], s, sd, (m, d) => { note(th, t, mf(m), d * 0.9, { type: 'sawtooth', g: 0.055 + 0.02 * x, a: 0.01, det: 8, lp: 2400, lp2: 1200 }); note(th, t, mf(m - 12), d * 0.9, { type: 'square', g: 0.025, a: 0.01, lp: 1500 }); });
        if (bar === 3 && s >= 12 && !(s & 1)) tom(th, t, 0.13, 170 - (s - 12) * 10);
        if (x > 0.65 && s % 4 === 2) stab(th, t, ch.map(m => m + 24), sd * 1.2, 0.012);
        if (cyc === 0 && s === 0) crash(th, t, 0.04, 1.0);
        if (low) lowLayer(th, s, t, sd);
      },
    },
    // ESCAPE / HOLD: pursuit. A minor, 158 BPM (x -> 172), galloping bass, relentless 16th hats, 4-on-the-floor + snare ghost, siren glide, off-beat arp, hook in bars 5-8
    escape: {
      sd: (x, low) => 60 / ((158 + 14 * x) * (low ? 1.04 : 1)) / 4,
      init(th) { drone(th, 55, 0.045, 380); },
      step(th, i, t, sd, x, low) {
        const s = i % 16, cyc = Math.floor(i / 16) % 8, bar = cyc % 4, k = ESC_PROG[bar], ch = ESC_CH[k], root = ESC_RT[k];
        if (s % 4 !== 1) bass(th, t, root + (s % 8 === 7 ? 12 : 0), sd * 0.95, s % 4 === 0 ? 0.11 : 0.08, 900); // gallop: x . x x
        if (s % 4 === 0) kick(th, t, 0.28);
        if (s === 10) kick(th, t, 0.18);
        if (s === 4 || s === 12) clap(th, t, 0.11);
        if (s === 15 || (x > 0.5 && s === 7)) clap(th, t, 0.05);
        hat(th, t, s % 2 ? 0.014 : 0.03);
        if (s & 1) note(th, t, mf(ch[(s >> 1) % 3] + 24), sd * 1.3, { type: 'triangle', g: 0.04, a: 0.003 });
        if (s === 0 || s === 3 || s === 6 || s === 10) stab(th, t, ch.map(m => m + 12), sd * 1.2, 0.02, 2200);
        if (s === 0) { pad(th, t, ch, sd * 17, 0.04); if (bar % 2 === 0) taiko(th, t, 0.24); }
        if (s === 0 && bar % 2 === 0) note(th, t, mf(root + 36), sd * 30, { type: 'sawtooth', f2: mf(root + 43), g: 0.022, a: sd * 20, lp: 2400, lp2: 3500 }); // siren
        if (cyc >= 4) mel(ESC_LEAD[bar], s, sd, (m, d) => lead(th, t, m, d, 0.06));
        if (bar === 3 && s >= 12) tom(th, t, 0.12, 190 - (s - 12) * 18);
        if (low) lowLayer(th, s, t, sd);
      },
    },
    // SPLASH: triumphant E major, 104 BPM. Opens on the medal-stinger motif (E major triad rising), brass chords, taiko, choir pad, sparkles
    splash: {
      sd: () => 60 / 104 / 4,
      init(th) { drone(th, 82.4, 0.03, 600); },
      step(th, i, t, sd) {
        const s = i % 16, bar = Math.floor(i / 16) % 8, k = SPL_PROG[bar], ch = SPL_CH[k], root = SPL_RT[k];
        if (s === 0) {
          taiko(th, t, bar % 2 ? 0.2 : 0.34);
          pad(th, t, ch.map(m => m + 12), sd * 17, 0.06);
          chord(th, t, ch, sd * 8, 0.07);
          note(th, t, mf(root), sd * 16, { type: 'sine', g: 0.22, a: 0.02, rel: sd * 3 });
          note(th, t, mf(root + 12), sd * 15, { type: 'sawtooth', g: 0.06, a: 0.02, lp: 600 });
        }
        if (s === 8) chord(th, t, ch, sd * 7, 0.05);
        if (s === 6 || s === 14) tom(th, t, 0.08, 140);
        if (s % 4 === 2) hat(th, t, 0.02);
        if (s === 4 || s === 12) nz(th, t, 0.1, { ft: 'bandpass', f: 1800, g: 0.05 });
        mel(SPL_LEAD[bar], s, sd, (m, d) => { note(th, t, mf(m), d * 0.95, { type: 'sawtooth', g: 0.07, a: 0.03, det: 7, lp: 3200, lp2: 1800 }); note(th, t, mf(m - 12), d * 0.95, { type: 'triangle', g: 0.05, a: 0.03 }); });
        if (s & 1) note(th, t, mf(ch[(s >> 1) % 3] + 36), sd * 1.5, { type: 'sine', g: 0.022, a: 0.003 }); // sparkles
        if (bar === 3 && s >= 12) tom(th, t, 0.1 + (s - 12) * 0.02, 180 - (s - 12) * 8);
        if (bar === 7 && s >= 8) tom(th, t, 0.1 + (s - 8) * 0.012, 200 - (s - 8) * 6);
        if (bar === 0 && s === 0) crash(th, t, 0.07, 1.8);
      },
    },
    // RESULT stingers: a short phrase over the first ~1.4 s, then silence (the next scenario's countdown crossfades in)
    result_win: {
      sd: () => 60 / 132 / 4, fade: 0.05,
      step(th, i, t, sd) {
        if (i === 0) { taiko(th, t, 0.34); pad(th, t, [57, 61, 64], sd * 14, 0.05); crash(th, t, 0.04, 1.0); }
        if (i < 8 && i % 2 === 0) { const m = [69, 73, 76, 81][i >> 1]; note(th, t, mf(m), 0.6, { type: 'triangle', g: 0.12, a: 0.004 }); note(th, t, mf(m + 12), 0.3, { type: 'sine', g: 0.03, a: 0.003 }); }
        if (i === 8) { stab(th, t, [57, 61, 64, 69], sd * 8, 0.04, 2400); lead(th, t, 88, sd * 8, 0.07); }
        if (i >= 8 && i < 12) note(th, t, mf([93, 97, 100, 105][i - 8]), 0.5, { type: 'sine', g: 0.035, a: 0.004 });
      },
    },
    result_fail: {
      sd: () => 60 / 100 / 4, fade: 0.05,
      step(th, i, t, sd) {
        if (i === 0) { note(th, t, 70, 0.8, { type: 'sine', f2: 36, g: 0.28, a: 0.005 }); pad(th, t, [45, 48, 51], sd * 12, 0.04); }
        if (i % 3 === 0 && i < 12) { const m = [64, 62, 60, 57][i / 3]; note(th, t, mf(m - 12), i === 9 ? 1.0 : 0.45, { type: 'sawtooth', g: 0.09, a: 0.02, lp: 900, lp2: 300 }); }
        if (i === 9) taiko(th, t, 0.2);
      },
    },
  };
  THEMES.ranked = THEMES.play; // legacy name


  // ---------------------------------------------------------------- scheduler / transitions
  function tick() {
    if (!c || !theme || !audible()) return;
    if (G.document && G.document.hidden) return;
    const now = c.currentTime;
    inten += (target - inten) * 0.12;
    if (theme.t < now - 0.25) theme.t = now + 0.05; // resync after a stall
    let n = 0;
    while (theme.t < now + LOOK && n++ < 64) {
      const sd = theme.def.sd(inten, low);
      try { theme.def.step(theme, theme.i, theme.t, sd, inten, low); } catch (e) { if (!theme.err) { theme.err = 1; if (G.console) G.console.warn('music step', e); } } // never kill the scheduler
      theme.t += sd; theme.i++;
    }
  }
  function killTheme(th) {
    for (const n of th.nodes) { try { if (n.stop) n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} }
    try { th.g.disconnect(); } catch (e) {}
  }
  function fadeOut(th, sec) {
    const t = c.currentTime;
    th.g.gain.cancelScheduledValues(t); th.g.gain.setValueAtTime(th.g.gain.value, t); th.g.gain.linearRampToValueAtTime(0, t + sec);
    olds.push(th);
    setTimeout(() => { killTheme(th); olds = olds.filter(o => o !== th); }, sec * 1000 + 600);
  }
  function start(name, fade) {
    if (!ready()) return;
    if (!tb) { tb = c.createGain(); tb.connect(out); }
    const def = THEMES[name];
    if (!def) return;
    fade = fade != null ? fade : def.fade != null ? def.fade : FADE;
    if (theme) fadeOut(theme, Math.max(0.15, Math.min(FADE, fade * 2)));
    const g = c.createGain(), t = c.currentTime;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + fade);
    g.connect(tb);
    theme = { name, def, g, nodes: [], i: 0, t: t + 0.08 };
    low = wantLow; inten = def.x0 != null ? def.x0 : inten;
    try { def.init && def.init(theme); } catch (e) { /* ignore */ }
    if (!timer) timer = setInterval(tick, TICK);
    tick();
  }
  function refresh() { // (re)start when allowed: after the first gesture or a settings change
    if (want && !theme) start(want);
  }
  if (G.addEventListener) {
    const un = () => { gesture = true; refresh(); for (const e of ['pointerdown', 'mousedown', 'keydown', 'touchstart']) G.removeEventListener(e, un, true); };
    for (const e of ['pointerdown', 'mousedown', 'keydown', 'touchstart']) G.addEventListener(e, un, true);
  }

  // ---------------------------------------------------------------- stingers
  const chord = (th, t, ms, d, g, ty) => ms.forEach((m, k) => note(th, t + k * 0.012, mf(m), d, { type: ty || 'sawtooth', g, a: 0.02, lp: 1800, lp2: 600, det: k % 2 ? 6 : -6 }));
  const STING = {
    up(th, t) { // rank up: war drums + rising brass triad + bright held chord
      taiko(th, t, 0.4); taiko(th, t + 0.2, 0.3); tom(th, t + 0.38, 0.25, 130);
      chord(th, t + 0.1, [45, 52, 57], 0.5, 0.1); chord(th, t + 0.38, [49, 56, 61], 0.5, 0.11);
      chord(th, t + 0.66, [57, 61, 64, 69], 1.9, 0.12);
      pad(th, t + 0.66, [69, 73, 76, 81], 2.2, 0.06);
      nz(th, t + 0.62, 1.8, { ft: 'highpass', f: 5000, f2: 9000, g: 0.07, a: 0.05 });
      [93, 97, 100, 105].forEach((m, k) => note(th, t + 0.7 + k * 0.07, mf(m), 0.8, { type: 'sine', g: 0.04, a: 0.004 }));
      return 2.8;
    },
    down(th, t) { // rank down: falling minor brass + dull thud
      [64, 62, 60, 57].forEach((m, k) => note(th, t + k * 0.26, mf(m - 12), k === 3 ? 1.4 : 0.4, { type: 'sawtooth', g: 0.1, a: 0.03, lp: 900, lp2: 300 }));
      taiko(th, t + 0.8, 0.3); note(th, t + 0.8, 60, 1.2, { type: 'sine', f2: 35, g: 0.25, a: 0.01 });
      return 2.2;
    },
    reveal(th, t) { // end splash, rank unchanged: drum roll -> hit on the medal pop (0.66 s) -> bright chord + sparkle
      [0, 0.16, 0.3, 0.42, 0.52, 0.6].forEach((d, k) => tom(th, t + d, 0.12 + k * 0.035, 150 - k * 6));
      nz(th, t, 0.66, { ft: 'bandpass', f: 500, f2: 6000, q: 1.1, g: 0.1, a: 0.6 });
      taiko(th, t + 0.66, 0.45);
      chord(th, t + 0.66, [52, 59, 64, 71], 1.5, 0.1);
      pad(th, t + 0.66, [64, 68, 71, 76], 1.8, 0.05);
      [88, 92, 95, 100].forEach((m, k) => note(th, t + 0.72 + k * 0.08, mf(m), 0.7, { type: 'sine', g: 0.035, a: 0.004 }));
      return 2.4;
    },
    start(th, t) { // match start: drum hits, riser, accent
      tom(th, t, 0.3, 120); tom(th, t + 0.25, 0.28, 120); tom(th, t + 0.5, 0.32, 100);
      nz(th, t, 0.8, { ft: 'bandpass', f: 400, f2: 5000, q: 1.2, g: 0.12, a: 0.7 });
      note(th, t, mf(45), 0.85, { type: 'sawtooth', f2: mf(57), g: 0.08, a: 0.6, lp: 700, lp2: 2000 });
      taiko(th, t + 0.82, 0.45); chord(th, t + 0.82, [45, 52, 57], 0.9, 0.12);
      return 1.8;
    },
    success(th, t) { // bright major arpeggio
      [69, 73, 76, 81].forEach((m, k) => { note(th, t + k * 0.075, mf(m), 0.6, { type: 'triangle', g: 0.12, a: 0.004 }); note(th, t + k * 0.075, mf(m + 12), 0.3, { type: 'sine', g: 0.03, a: 0.003 }); });
      pad(th, t, [57, 61, 64], 1.2, 0.04);
      return 1.4;
    },
    fail(th, t) { // low tritone drop
      note(th, t, mf(45), 0.7, { type: 'sawtooth', f2: mf(42), g: 0.1, a: 0.02, lp: 500 });
      note(th, t, mf(51), 0.7, { type: 'sawtooth', f2: mf(47), g: 0.07, a: 0.02, lp: 500 });
      note(th, t + 0.05, 70, 0.5, { type: 'sine', f2: 38, g: 0.3, a: 0.005 });
      return 1.0;
    },
  };

  const ALIAS = { ranked: 'play', infinite: 'play', hold: 'escape', result: 'result_win', win: 'result_win', fail: 'result_fail' };
  const Music = {
    get theme() { return theme ? theme.name : null; },
    get low() { return low; },
    names() { return Object.keys(THEMES).filter(k => k !== 'ranked'); },
    // switch the situation track with a crossfade: menu | sandbox | countdown | play | escape | splash | result_win | result_fail
    situation(name, o) {
      name = ALIAS[name] || name;
      if (!THEMES[name]) return;
      if (o && o.low != null) Music.lowtime(o.low);
      want = name;
      if (theme && theme.name === name) return;
      if (!ready()) { if (theme) { fadeOut(theme, FADE); theme = null; } return; } // started on first gesture via refresh()
      const prev = theme ? theme.name : '';
      let fade = o && o.fade;
      if (fade == null && prev === 'countdown' && (name === 'play' || name === 'escape')) { fade = 0.25; if (audible()) Music.stinger('start'); } // go!
      else if (fade == null && prev.indexOf('result_') === 0) fade = 0.4;
      start(name, fade);
    },
    lowtime(on) { wantLow = !!on; low = wantLow; },
    // per-frame hook: derive the situation from the world (scenario run phase / objective / time left); no run = Free Play sandbox
    sync(w) {
      const r = w && w.ranked, pr = r && r.pr;
      if (!r || !pr) { Music.situation('sandbox', { low: false }); return; }
      if (r.phase === 'result') { Music.situation(r.result && r.result.ok ? 'result_win' : 'result_fail', { low: false }); return; }
      if (r.phase !== 'play') { Music.situation('countdown', { low: false }); return; }
      const ty = pr.sc && pr.sc.obj && pr.sc.obj.type, left = r.mode === 'sandbox' ? null : pr.limit - (w.t - r.t0);
      Music.situation(ty === 'escape' || ty === 'hold' ? 'escape' : 'play', { low: left != null && left < LOW_TIME });
    },
    play(name) { Music.situation(name); },
    stop() {
      want = null;
      if (theme && c) { fadeOut(theme, 1.0); theme = null; }
      if (timer) { clearInterval(timer); timer = 0; }
    },
    intensity(x) { target = Math.max(0, Math.min(1, +x || 0)); },
    stinger(kind) {
      if (!STING[kind] || !audible() || !ready()) return;
      if (!tb) { tb = c.createGain(); tb.connect(out); }
      const t = c.currentTime + 0.03, sg = c.createGain();
      sg.connect(out);
      const len = STING[kind]({ g: sg }, t);
      setTimeout(() => { try { sg.disconnect(); } catch (e) {} }, (len + 1.5) * 1000);
      // duck the theme under the stinger
      tb.gain.cancelScheduledValues(t); tb.gain.setTargetAtTime(0.3, t, 0.05); tb.gain.setTargetAtTime(1, t + len, 0.5);
    },
    refresh,
    _tick: tick, // test hook
  };
  IT.Music = Music;
  if (IT.Settings && IT.Settings.onChange) IT.Settings.onChange(refresh);
  else if (G.document) G.document.addEventListener('DOMContentLoaded', () => { if (IT.Settings && IT.Settings.onChange) IT.Settings.onChange(refresh); });
})(typeof window !== 'undefined' ? window : globalThis);
