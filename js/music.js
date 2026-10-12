// Procedural music (WebAudio, original): themes menu | sandbox | ranked + stingers. Owner: S5.
// One lookahead scheduler (setInterval + AudioContext time) drives the active theme; themes crossfade. Routed to the 'music' bus.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const LOOK = 0.4, TICK = 90, FADE = 1.6;
  const mf = m => 440 * Math.pow(2, (m - 69) / 12);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const SFX = () => G.SFX || IT.SFX;

  let c = null, out = null, tb = null, theme = null, want = null, target = 0, inten = 0, timer = 0, gesture = false, olds = [];

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

  // ---------------------------------------------------------------- themes: sd(x) step length (16th), init(th), step(th, i, t, sd, x)
  const A = 57, F = 53, Dm = 50, E = 52; // midi roots (A3, F3, D3, E3)
  const THEMES = {
    // slow arcane pad + drone, distant war drum, sparse bell plucks. Am F Dm E
    menu: {
      sd: () => 60 / 56 / 4,
      init(th) { drone(th, 55, 0.07, 260); },
      step(th, i, t, sd) {
        const s = i % 16, bar = Math.floor(i / 16) % 4, ch = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]][bar], root = [33, 29, 26, 28][bar];
        if (s === 0) {
          pad(th, t, ch, sd * 17, 0.07);
          pad(th, t, [ch[0] + 12, ch[2] + 12], sd * 17, 0.03);
          note(th, t, mf(root), sd * 15, { type: 'sine', g: 0.2, a: 0.5, rel: sd * 6 });
          if (bar % 2 === 0) taiko(th, t, bar === 0 ? 0.22 : 0.13);
        }
        if (bar === 3 && s === 8) tom(th, t, 0.1, 110);
        if ((s === 0 || s === 6 || s === 10 || s === 13) && Math.random() < (s === 0 ? 0.7 : 0.4)) {
          const f = mf(pick(ch) + pick([12, 24]));
          note(th, t, f, 1.5, { type: 'triangle', g: 0.06, a: 0.004 });
          note(th, t, f * 2.76, 0.25, { type: 'sine', g: 0.012, a: 0.002 });
          note(th, t + sd * 3, f, 1.0, { type: 'triangle', g: 0.025, a: 0.004 }); // echo
        }
      },
    },
    // ambient forest: low drone, wind, sparse pentatonic plucks with echo, birds
    sandbox: {
      sd: () => 0.5,
      init(th) {
        drone(th, 73.4, 0.05, 200);
        const S = SFX(), src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), l = c.createOscillator(), lg = c.createGain();
        src.buffer = S.noise(); src.loop = true; f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 0.6; g.gain.value = 0.018;
        l.frequency.value = 0.09; lg.gain.value = 0.012; l.connect(lg); lg.connect(g.gain);
        src.connect(f); f.connect(g); g.connect(th.g); src.start(); l.start(); th.nodes.push(src, f, g, l, lg);
      },
      step(th, i, t, sd) {
        const s = i % 16, bar = Math.floor(i / 16) % 4, ch = [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 48, 52]][bar];
        if (s === 0) pad(th, t, ch, sd * 18, 0.045);
        if (Math.random() < 0.15) {
          const f = mf(pick([62, 65, 67, 69, 72]) + pick([0, 12, 12])), g = rnd(0.04, 0.07);
          note(th, t, f, 2.0, { type: 'triangle', g, a: 0.005 });
          note(th, t + 0.75, f, 1.2, { type: 'triangle', g: g * 0.4, a: 0.005 });
          note(th, t + 1.5, f, 0.8, { type: 'triangle', g: g * 0.15, a: 0.005 });
        }
        if (Math.random() < 0.025) { // bird: two quick rising chirps
          const f = rnd(2800, 4200);
          for (let k = 0; k < 3; k++) note(th, t + k * 0.11, f * (1 + k * 0.05), 0.08, { type: 'sine', f2: f * 1.35, g: 0.012, a: 0.01 });
        }
      },
    },
    // tense ostinato; x (0..1) raises tempo and adds layers: hats, clap+taiko, strings, riser, double kick
    ranked: {
      sd: x => 60 / (118 + 34 * x) / 4,
      init(th) { drone(th, 55, 0.06, 300); drone(th, 82.4, 0.025, 500); },
      step(th, i, t, sd, x) {
        const s = i % 16, bar = Math.floor(i / 16) % 4, ch = [[57, 60, 64], [58, 62, 65], [57, 60, 64], [56, 59, 64]][bar], root = [33, 34, 33, 28][bar];
        const OST = [0, 0, 12, 0, 0, 7, 0, 12, 0, 0, 12, 0, 3, 0, 7, 12];
        note(th, t, mf(root + OST[s]), sd * 1.7, { type: 'sawtooth', g: (s % 4 === 0 ? 0.11 : 0.07) * (0.9 + 0.3 * x), a: 0.003, lp: 800 + 500 * x, lp2: 180 });
        if (s === 0) {
          pad(th, t, [ch[0], ch[1], ch[2] + (bar === 1 ? -1 : 0)], sd * 17, 0.045 + 0.03 * x);
          if (bar % 2 === 0) taiko(th, t, 0.3);
        }
        if (s % 4 === 0) kick(th, t, 0.3);
        if (x > 0.85 && (s === 6 || s === 14)) kick(th, t, 0.2);
        if (x > 0.25) hat(th, t, 0.02 + 0.03 * x);
        if (x > 0.45 && (s === 4 || s === 12)) { clap(th, t, 0.1 + 0.08 * x); }
        if (x > 0.5 && s === 15 && bar % 2 === 1) { tom(th, t, 0.16, 130); tom(th, t + sd * 0.5, 0.12, 105); }
        if (x > 0.65 && s % 2 === 0) pluck(th, t, mf(ch[(s >> 1) % 3] + 24), 0.04 + 0.03 * x, 0.25); // high strings
        if (x > 0.85 && s === 0 && bar % 2 === 1) nz(th, t, sd * 16, { ft: 'highpass', f: 3000, f2: 9000, g: 0.05, a: sd * 14 }); // riser
      },
    },
  };

  // ---------------------------------------------------------------- scheduler / transitions
  function tick() {
    if (!c || !theme || !audible()) return;
    if (G.document && G.document.hidden) return;
    const now = c.currentTime;
    inten += (target - inten) * 0.12;
    if (theme.t < now - 0.25) theme.t = now + 0.05; // resync after a stall
    let n = 0;
    while (theme.t < now + LOOK && n++ < 64) {
      const sd = theme.def.sd(inten);
      try { theme.def.step(theme, theme.i, theme.t, sd, inten); } catch (e) { if (!theme.err) { theme.err = 1; if (G.console) G.console.warn('music step', e); } } // never kill the scheduler
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
  function start(name) {
    if (!ready()) return;
    if (!tb) { tb = c.createGain(); tb.connect(out); }
    const def = THEMES[name];
    if (!def) return;
    if (theme) fadeOut(theme, FADE);
    const g = c.createGain(), t = c.currentTime;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + FADE);
    g.connect(tb);
    theme = { name, def, g, nodes: [], i: 0, t: t + 0.08 };
    try { def.init(theme); } catch (e) { /* ignore */ }
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

  const Music = {
    get theme() { return theme ? theme.name : null; },
    play(name) {
      if (!THEMES[name]) return;
      want = name;
      if (theme && theme.name === name) return;
      if (!ready()) { if (theme) { fadeOut(theme, FADE); theme = null; } return; } // started on first gesture via refresh()
      start(name);
    },
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
  };
  IT.Music = Music;
  if (IT.Settings && IT.Settings.onChange) IT.Settings.onChange(refresh);
  else if (G.document) G.document.addEventListener('DOMContentLoaded', () => { if (IT.Settings && IT.Settings.onChange) IT.Settings.onChange(refresh); });
})(typeof window !== 'undefined' ? window : globalThis);
