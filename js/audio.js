// 8-bit style SFX synthesized with WebAudio. No assets, no deps.
const SFX = (() => {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function getCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    return ctx;
  }

  function getNoise(c) {
    if (!noiseBuf) {
      const len = c.sampleRate; // 1s of white noise, shared
      noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  // Oscillator voice: pitch f -> f2 over d seconds, exponential decay.
  function T(b, o) {
    const c = b.c, t = b.t0 + (o.at || 0), end = t + o.d;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, end);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.g, t + (o.a || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    let src = osc;
    if (o.lp) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      osc.connect(f);
      src = f;
      b.nodes.push(f);
    }
    src.connect(g);
    g.connect(b.out);
    osc.start(t);
    osc.stop(end + 0.02);
    b.nodes.push(osc, g);
    b.end = Math.max(b.end, end + 0.02);
  }

  // Filtered noise burst: filter f -> f2 (type ft) over d seconds, decaying.
  function N(b, o) {
    const c = b.c, t = b.t0 + (o.at || 0), end = t + o.d;
    const src = c.createBufferSource();
    src.buffer = getNoise(c);
    const f = c.createBiquadFilter();
    f.type = o.ft || 'bandpass';
    f.frequency.setValueAtTime(o.f, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, end);
    f.Q.value = o.q || 1;
    const g = c.createGain();
    g.gain.setValueAtTime(o.g, t);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    src.connect(f);
    f.connect(g);
    g.connect(b.out);
    src.start(t, Math.random() * 0.5);
    src.stop(end + 0.02);
    b.nodes.push(src, f, g);
    b.end = Math.max(b.end, end + 0.02);
  }

  // Schedules one sound, then disconnects its nodes after it ends.
  function run(c, build) {
    const b = { c, t0: c.currentTime + 0.01, out: master, nodes: [], end: 0 };
    build(b);
    const ms = Math.max(0, (b.end - c.currentTime) * 1000) + 200;
    setTimeout(() => {
      for (const n of b.nodes) {
        try { n.disconnect(); } catch (e) {}
      }
    }, ms);
  }

  const DEFS = {
    // UI and game events

    // icy chime
    orbQ(b) {
      T(b, { type: 'sine', f: 1760, f2: 1320, d: 0.08, g: 0.5 });
      T(b, { type: 'triangle', f: 2637, d: 0.06, g: 0.18 });
      N(b, { ft: 'highpass', f: 6000, d: 0.02, g: 0.08, q: 0.7 });
    },
    // electric zap blip
    orbW(b) {
      T(b, { type: 'sawtooth', f: 1200, f2: 300, d: 0.08, g: 0.22, lp: 3000 });
      T(b, { type: 'square', f: 2400, f2: 600, d: 0.05, g: 0.06 });
    },
    // warm low pluck
    orbE(b) {
      T(b, { type: 'triangle', f: 220, f2: 165, d: 0.08, g: 0.6, a: 0.005 });
      T(b, { type: 'sine', f: 110, f2: 82, d: 0.08, g: 0.3 });
    },
    // rising arpeggio shimmer
    invoke(b) {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
        T(b, { type: 'triangle', f, d: 0.09, g: 0.25, at: i * 0.035 });
      });
      N(b, { ft: 'highpass', f: 5000, f2: 9000, d: 0.25, g: 0.07, q: 0.7 });
    },
    // UI tick
    click(b) {
      T(b, { type: 'square', f: 1800, f2: 1200, d: 0.02, g: 0.15, a: 0.002 });
    },
    // low buzz
    fail(b) {
      T(b, { type: 'sawtooth', f: 110, f2: 90, d: 0.25, g: 0.3, a: 0.01, lp: 400 });
      T(b, { type: 'square', f: 55, d: 0.25, g: 0.12, a: 0.01, lp: 200 });
    },
    // two-note up chime
    success(b) {
      T(b, { type: 'square', f: 660, d: 0.08, g: 0.2, a: 0.003 });
      T(b, { type: 'square', f: 990, d: 0.14, g: 0.2, a: 0.003, at: 0.08 });
    },
    // tiny noise tick
    hit(b) {
      N(b, { ft: 'highpass', f: 2000, d: 0.02, g: 0.3, q: 0.7 });
    },
    // pop + downward blip
    kill(b) {
      N(b, { ft: 'bandpass', f: 800, d: 0.03, g: 0.4, q: 1 });
      T(b, { type: 'square', f: 600, f2: 150, d: 0.12, g: 0.18, at: 0.01 });
    },
    // low thud
    hurt(b) {
      T(b, { type: 'sine', f: 120, f2: 40, d: 0.2, g: 0.6, a: 0.003 });
      N(b, { ft: 'lowpass', f: 300, d: 0.1, g: 0.3, q: 0.7 });
    },
    // 3-note fanfare: G4 C5 E5
    wave(b) {
      T(b, { type: 'square', f: 392, d: 0.09, g: 0.18, a: 0.003 });
      T(b, { type: 'square', f: 523.25, d: 0.09, g: 0.18, a: 0.003, at: 0.09 });
      T(b, { type: 'square', f: 659.25, d: 0.25, g: 0.2, a: 0.003, at: 0.18 });
      T(b, { type: 'triangle', f: 659.25, d: 0.25, g: 0.2, a: 0.003, at: 0.18 });
      T(b, { type: 'triangle', f: 196, d: 0.43, g: 0.25, a: 0.003 });
    },
    // descending notes: E4 D4 C4 Bb3
    gameover(b) {
      [329.63, 293.66, 261.63, 233.08].forEach((f, i, arr) => {
        const last = i === arr.length - 1;
        T(b, { type: 'square', f, d: last ? 0.5 : 0.16, g: 0.2, a: 0.005, at: i * 0.16, lp: 2500 });
      });
    },

    // casts

    // icy crackle + falling chirp
    cast_coldsnap(b) {
      N(b, { ft: 'highpass', f: 3000, f2: 7000, d: 0.2, g: 0.3, q: 0.8 });
      for (let i = 0; i < 4; i++) {
        N(b, { ft: 'bandpass', f: 4000 + i * 800, d: 0.02, g: 0.12, q: 4, at: i * 0.04 });
      }
      T(b, { type: 'sine', f: 2000, f2: 800, d: 0.2, g: 0.14, a: 0.005 });
    },
    // airy whoosh with pitch sweep
    cast_ghostwalk(b) {
      N(b, { ft: 'bandpass', f: 400, f2: 1800, d: 0.4, g: 0.35, q: 2 });
      T(b, { type: 'sine', f: 440, f2: 220, d: 0.35, g: 0.08, a: 0.05 });
      T(b, { type: 'triangle', f: 660, f2: 990, d: 0.3, g: 0.05, a: 0.08 });
    },
    // crystalline slab: pitched-down pluck + glassy tick
    cast_icewall(b) {
      N(b, { ft: 'highpass', f: 4000, d: 0.1, g: 0.15, q: 0.7 });
      T(b, { type: 'triangle', f: 523.25, f2: 261.63, d: 0.3, g: 0.3 });
      T(b, { type: 'sine', f: 1046.5, d: 0.12, g: 0.1, at: 0.01 });
    },
    // electric buzz sweep + hiss
    cast_emp(b) {
      T(b, { type: 'sawtooth', f: 1500, f2: 150, d: 0.35, g: 0.22, lp: 2500 });
      N(b, { ft: 'highpass', f: 5000, d: 0.25, g: 0.1, q: 0.7 });
      T(b, { type: 'square', f: 90, f2: 45, d: 0.3, g: 0.12, a: 0.005 });
    },
    // wind rumble: lowpass noise sweep
    cast_tornado(b) {
      N(b, { ft: 'lowpass', f: 200, f2: 900, d: 0.5, g: 0.5, q: 1.2 });
      T(b, { type: 'sawtooth', f: 60, f2: 90, d: 0.5, g: 0.1, lp: 300 });
      N(b, { ft: 'bandpass', f: 1500, f2: 400, d: 0.45, g: 0.12, q: 3 });
    },
    // fast ascending triangle run with tick
    cast_alacrity(b) {
      [783.99, 987.77, 1174.66, 1567.98, 1975.53].forEach((f, i) => {
        T(b, { type: 'triangle', f, d: 0.06, g: 0.22, a: 0.002, at: i * 0.03 });
      });
      N(b, { ft: 'highpass', f: 4000, d: 0.04, g: 0.1, q: 0.7 });
    },
    // deep boom with bright chime
    cast_sunstrike(b) {
      T(b, { type: 'sine', f: 80, f2: 40, d: 0.45, g: 0.6, a: 0.003 });
      N(b, { ft: 'lowpass', f: 1200, f2: 300, d: 0.3, g: 0.3, q: 0.7 });
      T(b, { type: 'triangle', f: 1046.5, f2: 1568, d: 0.2, g: 0.15, at: 0.02 });
      T(b, { type: 'sine', f: 2093, d: 0.15, g: 0.08, at: 0.05 });
    },
    // anvil clang: inharmonic partials + strike
    cast_forgespirit(b) {
      [1, 2.76, 5.4].forEach((r, i) => {
        T(b, { type: 'square', f: 220 * r, d: 0.3 - i * 0.07, g: 0.12 / (i + 1), a: 0.002, lp: 3000 });
      });
      N(b, { ft: 'bandpass', f: 3000, d: 0.02, g: 0.3, q: 2 });
    },
    // falling whistle into impact
    cast_chaosmeteor(b) {
      T(b, { type: 'sawtooth', f: 900, f2: 60, d: 0.3, g: 0.18, lp: 2000, a: 0.02 });
      N(b, { ft: 'lowpass', f: 500, d: 0.15, g: 0.5, q: 0.8, at: 0.3 });
      T(b, { type: 'sine', f: 90, f2: 35, d: 0.2, g: 0.45, at: 0.3 });
    },
    // big explosion: sweeping noise + sub boom + crunch
    cast_deafeningblast(b) {
      N(b, { ft: 'lowpass', f: 1000, f2: 80, d: 0.5, g: 0.7, q: 0.7 });
      T(b, { type: 'sine', f: 60, f2: 30, d: 0.5, g: 0.6, a: 0.003 });
      T(b, { type: 'square', f: 300, f2: 50, d: 0.2, g: 0.12, lp: 1200 });
    },
  };

  return {
    enabled: true,
    volume: 0.35,
    play(name) {
      try {
        if (!this.enabled) return;
        if (!Object.prototype.hasOwnProperty.call(DEFS, name)) return;
        const c = getCtx();
        if (!c) return;
        if (c.state === 'suspended' && c.resume) {
          const p = c.resume();
          if (p && p.catch) p.catch(() => {});
        }
        master.gain.value = this.volume;
        run(c, DEFS[name]);
      } catch (e) {}
    },
  };
})();
