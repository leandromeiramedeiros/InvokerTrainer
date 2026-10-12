// WebAudio synth engine: mixer (master/music/sfx/ui buses driven by IT.Settings.audio), voice DSL (T oscillator, N noise), one-shots + loops.
// Voices live in js/sfx.js / js/ui/uisound.js (SFX.define); music in js/music.js. No assets, no deps.
const SFX = (() => {
  let ctx = null, master = null, duck = null, noiseBufs = {}, verbIn = null, echoIn = null, curves = {}, hooked = false, unfocused = false, vol = 0.5, active = 0, liveLoops = 0;
  const bus = {};
  const G = typeof window !== 'undefined' ? window : globalThis;
  const settings = () => { try { return G.IT && G.IT.Settings && G.IT.Settings.get && G.IT.Settings.get(); } catch (e) { return null; } };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const resume = c => { if (c && c.state === 'suspended' && c.resume) { const p = c.resume(); if (p && p.catch) p.catch(() => {}); } };

  // push settings (master/music/sfx/ui/musicOn/sound/muteUnfocused) into the bus gains
  function mix() {
    if (!ctx) return;
    const s = settings(), a = (s && s.audio) || { master: 0.8, music: 0.5, sfx: 0.8, ui: 0.6, musicOn: true, muteUnfocused: true };
    const on = !s || s.sound !== false, t = ctx.currentTime;
    const set = (g, v) => { try { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(Math.max(0, v), t, 0.03); } catch (e) {} };
    set(master, on ? a.master : 0);
    set(bus.sfx, a.sfx * vol * 2);
    set(bus.ui, a.ui);
    set(bus.music, a.musicOn ? a.music : 0);
    set(duck, a.muteUnfocused && unfocused ? 0 : 1);
  }
  function hook() {
    if (hooked) return;
    const S = G.IT && G.IT.Settings;
    if (S && S.onChange) { S.onChange(mix); hooked = true; }
  }

  function getCtx() {
    if (!ctx) {
      const AC = G.AudioContext || G.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); duck = ctx.createGain();
      const comp = ctx.createDynamicsCompressor(); // glue + keeps layered casts from clipping
      comp.threshold.value = -12; comp.knee.value = 14; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
      for (const k of ['music', 'sfx', 'ui']) { bus[k] = ctx.createGain(); bus[k].connect(master); }
      const lim = ctx.createDynamicsCompressor(); // brick-wall-ish limiter: stacked layers can never clip the output
      lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.09;
      master.connect(duck); duck.connect(comp); comp.connect(lim); lim.connect(ctx.destination);
      hook(); mix();
    }
    return ctx;
  }

  // Shared 2 s noise buffers, built once per kind. white | pink (-3 dB/oct) | brown (-6 dB/oct, rumble) | crackle (sparse sharp clicks: fire, electricity, ice)
  function getNoise(c, kind) {
    kind = kind || 'white';
    if (noiseBufs[kind]) return noiseBufs[kind];
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    if (kind === 'pink') { // Paul Kellet's economy filter
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
    } else if (kind === 'brown') {
      let l = 0;
      for (let i = 0; i < len; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; }
    } else if (kind === 'crackle') { // ~70 random clicks/s, each 1-3 samples of impulse + short decaying ring, wildly varying amplitude
      for (let i = 0; i < len; i++) d[i] = 0;
      for (let i = 0; i < len - 40;) {
        i += 1 + Math.floor(-Math.log(1 - Math.random()) * c.sampleRate / 70);
        if (i >= len - 40) break;
        const a = Math.pow(Math.random(), 2) * (Math.random() < 0.5 ? -1 : 1), n = 2 + Math.floor(Math.random() * 14);
        for (let k = 0; k < n; k++) d[i + k] += a * Math.pow(1 - k / n, 2) * (k % 2 ? -0.6 : 1);
      }
    } else for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return (noiseBufs[kind] = buf);
  }

  // waveshaper curve cache: tanh soft clip, drive k (1 = gentle .. 12 = hard fuzz)
  function getCurve(k) {
    k = Math.max(1, Math.min(16, Math.round(k * 2) / 2));
    if (!curves[k]) {
      const n = 1024, a = new Float32Array(n), nt = Math.tanh(k);
      for (let i = 0; i < n; i++) a[i] = Math.tanh(((i / (n - 1)) * 2 - 1) * k) / nt;
      curves[k] = a;
    }
    return curves[k];
  }
  function shaper(c, k) { const w = c.createWaveShaper(); w.curve = getCurve(k); w.oversample = '2x'; return w; }

  // Oscillator voice: pitch f -> f2 over d seconds.
  // o: type f f2 d g at a(attack) rel(hold until end-rel then decay) lp lp2 q hp det fm/fmd(vibrato Hz/depth) am/amd(tremolo) lin(linear pitch ramp) np(no pitch random)
  //    mr/mi/mdec: FM synthesis - modulator at f*mr (follows the pitch ramp), index mi (x carrier f), decaying to mdec*mi over d (default 0.15) - bells, zaps, metal
  //    dist: waveshaper drive (1..16) after the filters; pan: -1..1 static stereo position
  function T(b, o) {
    const c = b.c, t = b.t0 + (o.at || 0), end = t + o.d, pv = o.np ? 1 : b.pv, G0 = o.g * b.gv, a = o.a || 0.004;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'square';
    if (o.det) osc.detune.value = o.det;
    osc.frequency.setValueAtTime(o.f * pv, t);
    if (o.f2) osc.frequency[o.lin ? 'linearRampToValueAtTime' : 'exponentialRampToValueAtTime'](o.f2 * pv, end);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(G0, t + Math.min(a, o.d * 0.9));
    if (o.rel != null) g.gain.setValueAtTime(G0, Math.max(t + a, end - o.rel));
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    b.nodes.push(osc, g);
    let src = osc;
    if (o.mr) {
      const m = c.createOscillator(), mg = c.createGain(), ix = (o.mi == null ? 2 : o.mi) * o.f * pv;
      m.type = 'sine'; m.frequency.setValueAtTime(o.f * o.mr * pv, t);
      if (o.f2) m.frequency[o.lin ? 'linearRampToValueAtTime' : 'exponentialRampToValueAtTime'](o.f2 * o.mr * pv, end);
      mg.gain.setValueAtTime(ix, t); mg.gain.exponentialRampToValueAtTime(Math.max(0.001, ix * (o.mdec == null ? 0.15 : o.mdec)), end);
      m.connect(mg); mg.connect(osc.frequency); m.start(t); m.stop(end + 0.02); b.nodes.push(m, mg);
    }
    if (o.fm) {
      const l = c.createOscillator(), lg = c.createGain();
      l.frequency.value = o.fm; lg.gain.value = o.fmd || o.f * 0.015;
      l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(end + 0.02); b.nodes.push(l, lg);
    }
    const chain = f => { src.connect(f); src = f; b.nodes.push(f); };
    if (o.lp) {
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = o.q || 0.7;
      f.frequency.setValueAtTime(o.lp, t); if (o.lp2) f.frequency.exponentialRampToValueAtTime(o.lp2, end); chain(f);
    }
    if (o.hp) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = o.hp; chain(f); }
    if (o.am) {
      const tr = c.createGain(), l = c.createOscillator(), lg = c.createGain(), d = o.amd == null ? 0.6 : o.amd;
      tr.gain.value = 1 - d / 2; l.frequency.value = o.am; lg.gain.value = d / 2;
      l.connect(lg); lg.connect(tr.gain); l.start(t); l.stop(end + 0.02); b.nodes.push(l, lg); chain(tr);
    }
    if (o.dist) chain(shaper(c, o.dist));
    src.connect(g); g.connect(b.out);
    if (o.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = o.pan; g.disconnect(); g.connect(p); p.connect(b.out); b.nodes.push(p); }
    osc.start(t); osc.stop(end + 0.02);
    b.end = Math.max(b.end, end + 0.02);
  }

  // Filtered noise: filter f -> f2 (type ft, q) over d seconds. o: g at a(attack, 0 = instant) rel am/amd lin
  //    nk: noise kind (white pink brown crackle)  lp/hp: extra band-limit filters after the main one  dist: waveshaper drive  pan: -1..1
  function N(b, o) {
    const c = b.c, t = b.t0 + (o.at || 0), end = t + o.d, G0 = o.g * b.gv, a = o.a || 0;
    const src = c.createBufferSource();
    src.buffer = getNoise(c, o.nk); src.loop = true;
    const f = c.createBiquadFilter(), g = c.createGain();
    f.type = o.ft || 'bandpass';
    f.frequency.setValueAtTime(o.f * (o.np ? 1 : b.pv), t);
    if (o.f2) f.frequency[o.lin ? 'linearRampToValueAtTime' : 'exponentialRampToValueAtTime'](o.f2 * (o.np ? 1 : b.pv), end);
    f.Q.value = o.q || 1;
    if (a > 0) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(G0, t + a); } else g.gain.setValueAtTime(G0, t);
    if (o.rel != null) g.gain.setValueAtTime(G0, Math.max(t + a, end - o.rel));
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    src.connect(f); b.nodes.push(src, f, g);
    let s = f;
    const chain = n => { s.connect(n); s = n; b.nodes.push(n); };
    if (o.lp) { const l = c.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = o.lp; chain(l); }
    if (o.hp) { const l = c.createBiquadFilter(); l.type = 'highpass'; l.frequency.value = o.hp; chain(l); }
    if (o.am) {
      const tr = c.createGain(), l = c.createOscillator(), lg = c.createGain(), d = o.amd == null ? 0.7 : o.amd;
      tr.gain.value = 1 - d / 2; l.frequency.value = o.am; lg.gain.value = d / 2;
      l.connect(lg); lg.connect(tr.gain); l.start(t); l.stop(end + 0.02); b.nodes.push(l, lg); chain(tr);
    }
    if (o.dist) chain(shaper(c, o.dist));
    s.connect(g); g.connect(b.out);
    if (o.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = o.pan; g.disconnect(); g.connect(p); p.connect(b.out); b.nodes.push(p); }
    src.start(t, Math.random() * 1.5);
    src.stop(end + 0.02);
    b.end = Math.max(b.end, end + 0.02);
  }

  const cleanup = (nodes, ms) => setTimeout(() => { for (const n of nodes) { try { if (n.stop) n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} } }, ms);

  // Shared short room reverb (built lazily on first use, so it costs nothing until a big sound asks for it). Output joins the sfx bus.
  function getVerb(c) {
    if (!verbIn) {
      const len = Math.floor(c.sampleRate * 0.9), ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      verbIn = c.createGain();
      const cv = c.createConvolver(), out = c.createGain();
      cv.buffer = ir; out.gain.value = 0.55;
      verbIn.connect(cv); cv.connect(out); out.connect(bus.sfx);
    }
    return verbIn;
  }

  // Shared feedback-delay "shimmer" send: 2 detuned taps (0.17 / 0.23 s), darkening loop, joins the sfx bus. Lazily built.
  function getEcho(c) {
    if (!echoIn) {
      echoIn = c.createGain();
      const out = c.createGain(), mk = (dt, pan) => {
        const d = c.createDelay(0.6), fb = c.createGain(), lp = c.createBiquadFilter(), p = c.createStereoPanner ? c.createStereoPanner() : null;
        d.delayTime.value = dt; fb.gain.value = 0.42; lp.type = 'lowpass'; lp.frequency.value = 3600;
        echoIn.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d);
        if (p) { p.pan.value = pan; lp.connect(p); p.connect(out); } else lp.connect(out);
      };
      mk(0.17, -0.5); mk(0.23, 0.5);
      out.gain.value = 0.5; out.connect(bus.sfx);
    }
    return echoIn;
  }

  // Schedules one sound, then disconnects its nodes after it ends.
  // o: {vol, pan, bus, dur(info for builders), prio(never dropped), low(first to be dropped under load), verb(0..1 reverb send), echo(0..1 feedback-delay send)}
  function run(c, build, o) {
    o = o || {};
    if (!o.prio && active > (o.low ? 26 : 56)) return;
    const dest = bus[o.bus || 'sfx'] || bus.sfx;
    const b = { c, t0: c.currentTime + 0.01, out: dest, nodes: [], end: 0, opt: o, pv: 1 + rnd(-0.03, 0.03), gv: 1 + rnd(-0.08, 0.08) };
    if (o.vol != null || o.pan || o.verb || o.echo) {
      const vg = c.createGain();
      vg.gain.value = o.vol == null ? 1 : o.vol;
      b.nodes.push(vg);
      let last = vg;
      if (o.pan && c.createStereoPanner) {
        const p = c.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, o.pan));
        vg.connect(p); b.nodes.push(p); last = p;
      }
      last.connect(dest);
      if (o.verb) { const vs = c.createGain(); vs.gain.value = o.verb; last.connect(vs); vs.connect(getVerb(c)); b.nodes.push(vs); }
      if (o.echo) { const es = c.createGain(); es.gain.value = o.echo; last.connect(es); es.connect(getEcho(c)); b.nodes.push(es); }
      b.out = vg;
    }
    build(b);
    active++;
    const ms = Math.max(0, (b.end - c.currentTime) * 1000) + 200;
    setTimeout(() => { active--; }, ms);
    cleanup(b.nodes, ms);
  }

  // Basic one-shots shared by the UI / combo bar (input.js: click, fail, success).
  const DEFS = {
    click(b) { T(b, { type: 'square', f: 1800, f2: 1200, d: 0.02, g: 0.15, a: 0.002 }); },
    fail(b) {
      T(b, { type: 'sawtooth', f: 110, f2: 90, d: 0.25, g: 0.3, a: 0.01, lp: 400 });
      T(b, { type: 'square', f: 55, d: 0.25, g: 0.12, a: 0.01, lp: 200 });
    },
    success(b) {
      T(b, { type: 'square', f: 660, d: 0.08, g: 0.2, a: 0.003 });
      T(b, { type: 'square', f: 990, d: 0.14, g: 0.2, a: 0.003, at: 0.08 });
    },
    hit(b) { N(b, { ft: 'highpass', f: 2000, d: 0.02, g: 0.3, q: 0.7 }); },
    hurt(b) {
      T(b, { type: 'sine', f: 120, f2: 40, d: 0.2, g: 0.6, a: 0.003 });
      N(b, { ft: 'lowpass', f: 300, d: 0.1, g: 0.3, q: 0.7 });
    },
    kill(b) {
      N(b, { ft: 'bandpass', f: 800, d: 0.03, g: 0.4, q: 1 });
      T(b, { type: 'square', f: 600, f2: 150, d: 0.12, g: 0.18, at: 0.01 });
    },
  };

  // Looping layered bed: filtered noise + optional oscillators. Returns {stop(), set({vol,pan}), alive()}; auto-stops after maxSec.
  // o: ft f f2 sweep(s) q g atk(s) wob(Hz amp-LFO) rel(s) vol pan bus maxSec dyn(allow set() vol/pan) prio osc:[{type f f2 g fm fmd lp}]
  // At most 14 loops run at once (extra ones are silently refused unless o.prio).
  const NOOP = { stop() {}, set() {}, alive() { return false; } };
  function loop(o) {
    const c = getCtx();
    if (!c) return NOOP;
    if (liveLoops >= 14 && !o.prio) return NOOP;
    resume(c);
    const t = c.currentTime, G0 = o.g || 0.3, nodes = [];
    const src = c.createBufferSource(); src.buffer = getNoise(c, o.nk); src.loop = true;
    const f = c.createBiquadFilter(); f.type = o.ft || 'lowpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f || 160, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + (o.sweep || 2));
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(G0, t + (o.atk || 0.08));
    nodes.push(src, f, g);
    if (o.wob) { // amplitude wobble for a rolling feel
      const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = o.wob; lg.gain.value = G0 * (o.wobd == null ? 0.5 : o.wobd);
      l.connect(lg); lg.connect(g.gain); l.start(); nodes.push(l, lg);
    }
    for (const p of o.osc || []) {
      const os = c.createOscillator(), og = c.createGain(); os.type = p.type || 'sine';
      os.frequency.setValueAtTime(p.f, t); if (p.f2) os.frequency.exponentialRampToValueAtTime(p.f2, t + (o.sweep || 2));
      og.gain.value = p.g || 0.05; nodes.push(os, og);
      if (p.fm) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = p.fm; lg.gain.value = p.fmd || p.f * 0.02; l.connect(lg); lg.connect(os.frequency); l.start(); nodes.push(l, lg); }
      let s = os;
      if (p.lp) { const lf = c.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.value = p.lp; os.connect(lf); s = lf; nodes.push(lf); }
      s.connect(og); og.connect(g); os.start();
    }
    const out = bus[o.bus || 'sfx'];
    let vg = null, pn = null;
    if (o.vol != null || o.pan || o.dyn) {
      vg = c.createGain(); vg.gain.value = o.vol == null ? 1 : o.vol; nodes.push(vg);
      g.connect(vg);
      if ((o.pan || o.dyn) && c.createStereoPanner) { pn = c.createStereoPanner(); pn.pan.value = o.pan || 0; vg.connect(pn); pn.connect(out); nodes.push(pn); } else vg.connect(out);
    } else g.connect(out);
    src.connect(f); f.connect(g);
    src.start(0, Math.random() * 1.5);
    liveLoops++;
    let done = false, tm = null;
    const rel = o.rel || 0.15;
    const stop = () => {
      if (done) return; done = true; clearTimeout(tm);
      try { const n = c.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), n); g.gain.exponentialRampToValueAtTime(0.0001, n + rel); } catch (e) {}
      cleanup(nodes, rel * 1000 + 120);
      setTimeout(() => { liveLoops--; }, rel * 1000 + 120);
    };
    const set = p => {
      if (done || !p) return;
      const n = c.currentTime;
      try {
        if (p.vol != null && vg) vg.gain.setTargetAtTime(Math.max(0, p.vol), n, 0.08);
        if (p.pan != null && pn) pn.pan.setTargetAtTime(Math.max(-1, Math.min(1, p.pan)), n, 0.08);
      } catch (e) {}
    };
    if (o.maxSec) tm = setTimeout(stop, o.maxSec * 1000);
    return { stop, set, alive: () => !done };
  }

  // Dev/test: renders one voice offline (no sound, no bus) and measures it. Resolves {peak, rms, dur, centroid, silent}. Needs OfflineAudioContext.
  function render(name, o) {
    o = o || {};
    const OAC = G.OfflineAudioContext || G.webkitOfflineAudioContext;
    if (!OAC || !DEFS[name]) return Promise.resolve(null);
    const sr = 44100, secs = o.secs || 5, c = new OAC(1, sr * secs, sr), g = c.createGain();
    g.gain.value = (o.vol == null ? 1 : o.vol); g.connect(c.destination);
    const b = { c, t0: 0.01, out: g, nodes: [], end: 0, opt: o, pv: 1, gv: 1 };
    DEFS[name](b);
    return c.startRendering().then(buf => {
      const d = buf.getChannelData(0);
      let pk = 0, sum = 0, last = 0, zc = 0;
      for (let i = 0; i < d.length; i++) { const v = d[i]; if (Math.abs(v) > pk) pk = Math.abs(v); sum += v * v; if (Math.abs(v) > 0.003) last = i; if (i && (d[i - 1] < 0) !== (v < 0)) zc++; }
      return { name, peak: pk, rms: Math.sqrt(sum / d.length), dur: last / sr, planned: b.end, zcr: zc / secs / 2, silent: pk < 0.003, nodes: b.nodes.length };
    });
  }

  const API = {
    enabled: true,
    render, getNoise: k => { const c = getCtx(); return c && getNoise(c, k); }, shaper: k => { const c = getCtx(); return c && shaper(c, k); },
    // legacy master level for the sfx bus (sfx.js sets it); mixer re-applied on change
    get volume() { return vol; },
    set volume(v) { vol = v; mix(); },
    T, N, defs: DEFS, define(name, fn) { DEFS[name] = fn; },
    has(name) { return Object.prototype.hasOwnProperty.call(DEFS, name); },
    ctx: getCtx, bus: k => (getCtx(), bus[k]), noise: k => { const c = getCtx(); return c && getNoise(c, k); },
    mix, rnd, resume: () => resume(ctx),
    unlock() { const c = getCtx(); resume(c); return !!c; },
    loop,
    loops() { return liveLoops; },
    playEx(name, o) {
      try {
        if (!this.enabled || !this.has(name)) return;
        const c = getCtx();
        if (!c) return;
        resume(c);
        run(c, DEFS[name], o);
      } catch (e) {}
    },
    play(name) { this.playEx(name); },
  };

  // unlock the AudioContext on the first user gesture
  if (typeof window !== 'undefined') {
    const EV = ['pointerdown', 'mousedown', 'keydown', 'touchstart'];
    const un = () => {
      API.unlock();
      if (ctx && ctx.state === 'running') for (const e of EV) window.removeEventListener(e, un, true);
    };
    for (const e of EV) window.addEventListener(e, un, true);
    // duck to silence when the window loses focus / tab hidden (if audio.muteUnfocused)
    const foc = v => { unfocused = v; mix(); };
    window.addEventListener('blur', () => foc(true));
    window.addEventListener('focus', () => foc(false));
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => foc(document.hidden || false));
      document.addEventListener('DOMContentLoaded', hook);
      unfocused = !!document.hidden;
    }
  }
  return API;
})();
if (typeof window !== 'undefined') { window.SFX = SFX; (window.IT = window.IT || {}).SFX = SFX; }
