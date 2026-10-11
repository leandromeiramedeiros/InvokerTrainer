// WebAudio synth engine: mixer (master/music/sfx/ui buses driven by IT.Settings.audio), voice DSL (T oscillator, N noise), one-shots + loops.
// Voices live in js/sfx.js / js/ui/uisound.js (SFX.define); music in js/music.js. No assets, no deps.
const SFX = (() => {
  let ctx = null, master = null, duck = null, noiseBuf = null, hooked = false, unfocused = false, vol = 0.5, active = 0;
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
      master.connect(duck); duck.connect(comp); comp.connect(ctx.destination);
      hook(); mix();
    }
    return ctx;
  }

  function getNoise(c) {
    if (!noiseBuf) {
      const len = c.sampleRate * 2; // 2s of white noise, shared
      noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  // Oscillator voice: pitch f -> f2 over d seconds.
  // o: type f f2 d g at a(attack) rel(hold until end-rel then decay) lp lp2 q hp det fm/fmd(vibrato Hz/depth) am/amd(tremolo) lin(linear pitch ramp) np(no pitch random)
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
    src.connect(g); g.connect(b.out);
    osc.start(t); osc.stop(end + 0.02);
    b.end = Math.max(b.end, end + 0.02);
  }

  // Filtered noise: filter f -> f2 (type ft, q) over d seconds. o: g at a(attack, 0 = instant) rel am/amd lin
  function N(b, o) {
    const c = b.c, t = b.t0 + (o.at || 0), end = t + o.d, G0 = o.g * b.gv, a = o.a || 0;
    const src = c.createBufferSource();
    src.buffer = getNoise(c); src.loop = true;
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
    if (o.am) {
      const tr = c.createGain(), l = c.createOscillator(), lg = c.createGain(), d = o.amd == null ? 0.7 : o.amd;
      tr.gain.value = 1 - d / 2; l.frequency.value = o.am; lg.gain.value = d / 2;
      l.connect(lg); lg.connect(tr.gain); l.start(t); l.stop(end + 0.02); b.nodes.push(tr, l, lg); s.connect(tr); s = tr;
    }
    s.connect(g); g.connect(b.out);
    src.start(t, Math.random() * 1.5);
    src.stop(end + 0.02);
    b.end = Math.max(b.end, end + 0.02);
  }

  const cleanup = (nodes, ms) => setTimeout(() => { for (const n of nodes) { try { if (n.stop) n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} } }, ms);

  // Schedules one sound, then disconnects its nodes after it ends. o: {vol, pan, bus, dur(info for builders), prio}
  function run(c, build, o) {
    o = o || {};
    if (active > 56 && !o.prio) return;
    const dest = bus[o.bus || 'sfx'] || bus.sfx;
    const b = { c, t0: c.currentTime + 0.01, out: dest, nodes: [], end: 0, opt: o, pv: 1 + rnd(-0.03, 0.03), gv: 1 + rnd(-0.08, 0.08) };
    if (o.vol != null || o.pan) {
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

  // Looping layered bed: filtered noise + optional oscillators. Returns {stop(), set(o)}; auto-stops after maxSec.
  // o: ft f f2 sweep(s) q g atk(s) wob(Hz amp-LFO) rel(s) vol pan bus maxSec osc:[{type f f2 g fm fmd lp}]
  function loop(o) {
    const c = getCtx();
    if (!c) return { stop() {}, set() {} };
    resume(c);
    const t = c.currentTime, G0 = o.g || 0.3, nodes = [];
    const src = c.createBufferSource(); src.buffer = getNoise(c); src.loop = true;
    const f = c.createBiquadFilter(); f.type = o.ft || 'lowpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f || 160, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + (o.sweep || 2));
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(G0, t + (o.atk || 0.08));
    nodes.push(src, f, g);
    if (o.wob) { // amplitude wobble for a rolling feel
      const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = o.wob; lg.gain.value = G0 * 0.5;
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
    let out = bus[o.bus || 'sfx'];
    if (o.vol != null || o.pan) {
      const vg = c.createGain(); vg.gain.value = o.vol == null ? 1 : o.vol; nodes.push(vg);
      g.connect(vg);
      if (o.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = o.pan; vg.connect(p); p.connect(out); nodes.push(p); } else vg.connect(out);
    } else g.connect(out);
    src.connect(f); f.connect(g);
    src.start(0, Math.random() * 1.5);
    let done = false, tm = null;
    const rel = o.rel || 0.15;
    const stop = () => {
      if (done) return; done = true; clearTimeout(tm);
      try { const n = c.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), n); g.gain.exponentialRampToValueAtTime(0.0001, n + rel); } catch (e) {}
      cleanup(nodes, rel * 1000 + 120);
    };
    if (o.maxSec) tm = setTimeout(stop, o.maxSec * 1000);
    return { stop };
  }

  const API = {
    enabled: true,
    // legacy master level for the sfx bus (sfx.js sets it); mixer re-applied on change
    get volume() { return vol; },
    set volume(v) { vol = v; mix(); },
    T, N, defs: DEFS, define(name, fn) { DEFS[name] = fn; },
    has(name) { return Object.prototype.hasOwnProperty.call(DEFS, name); },
    ctx: getCtx, bus: k => (getCtx(), bus[k]), noise: () => { const c = getCtx(); return c && getNoise(c); },
    mix, rnd, resume: () => resume(ctx),
    unlock() { const c = getCtx(); resume(c); return !!c; },
    loop,
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
