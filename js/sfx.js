// IT.Sfx: maps sim events to layered synth voices (extends the SFX DSL in audio.js). attach(w) subscribes; detaches the previous world.
// Voices (js/sfxvoices.js) are modelled on the Dota 2 Invoker sound layers (dota2.fandom.com/wiki/Invoker/Sounds): every ability has its own
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

  // Voices live in js/sfxvoices.js (loaded first); this file only maps sim events to them.
  // v6 WP6: one relic-tier fanfare (short, soft: a brass-ish triad + bell sparkle, under the action; higher tier = one more note)
  if (SFX && SFX.define && SFX.T && SFX.N) {
    const T = SFX.T, N = SFX.N;
    SFX.define('relicTier', b => {
      const tier = Math.max(1, Math.min(5, (b.opt && b.opt.tier) || 1)), notes = [523.25, 659.25, 783.99, 1046.5, 1318.5].slice(0, 2 + Math.min(3, tier));
      notes.forEach((f, i) => {
        const at = i * 0.075;
        T(b, { type: 'sawtooth', f, d: 0.32, g: 0.035, a: 0.012, at, lp: 2200 });
        T(b, { type: 'sine', f, d: 0.6, g: 0.06, a: 0.002, at, mr: 3.5, mi: 1, mdec: 0.03 });
      });
      const end = notes.length * 0.075;
      T(b, { type: 'triangle', f: notes[notes.length - 1] * 2, d: 0.7, g: 0.035, a: 0.004, at: end });
      N(b, { nk: 'pink', ft: 'highpass', f: 6000, d: 0.5, g: 0.03, at: end, q: 0.7 });
    });
  }

  // item 14: SPECIAL relic level-up (multi-hero Ice Wall / EMP / Deafening Blast / Chaos Meteor): a sub boom + rising noise swell, a wide two-octave
  // arpeggio (detuned saw pairs + FM bells), then a held major chord with a long shimmer tail. ~2 s, clearly bigger than relicTier.
  if (SFX && SFX.define && SFX.T && SFX.N) {
    const T = SFX.T, N = SFX.N;
    SFX.define('relicSpecial', b => {
      T(b, { type: 'sine', f: 90, f2: 38, d: 0.9, g: 0.16, a: 0.004 });
      N(b, { nk: 'brown', ft: 'lowpass', f: 300, f2: 1200, d: 0.5, g: 0.07, a: 0.2, q: 0.7 });
      N(b, { nk: 'pink', ft: 'bandpass', f: 800, f2: 5200, d: 0.45, g: 0.05, a: 0.4, q: 1.1 });
      const arp = [392, 523.25, 659.25, 783.99, 1046.5, 1318.5, 1568];
      arp.forEach((f, i) => {
        const at = 0.28 + i * 0.07;
        T(b, { type: 'sawtooth', f, d: 0.5, g: 0.032, a: 0.01, at, lp: 2600 });
        T(b, { type: 'sawtooth', f: f * 1.006, d: 0.5, g: 0.026, a: 0.01, at, lp: 2600 });
        T(b, { type: 'sine', f: f * 2, d: 0.8, g: 0.05, a: 0.002, at, mr: 3.5, mi: 1.2, mdec: 0.04 });
      });
      const end = 0.28 + arp.length * 0.07;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        T(b, { type: 'sawtooth', f, d: 1.5, g: 0.034, a: 0.03, at: end, lp: 2400 });
        T(b, { type: 'sine', f: f * 2, d: 1.7, g: 0.05, a: 0.004, at: end + i * 0.04, mr: 3.5, mi: 1, mdec: 0.05 });
      });
      T(b, { type: 'triangle', f: 2093, d: 1.4, g: 0.04, a: 0.004, at: end + 0.1 });
      N(b, { nk: 'pink', ft: 'highpass', f: 6000, d: 1.1, g: 0.04, at: end, q: 0.7 });
    });
  }

  // v6 item 69 (shop): coin clink on press, rising chime on unlock, short fanfare for premium skins, dull thud when you cannot afford it
  if (SFX && SFX.define && SFX.T && SFX.N) {
    const T = SFX.T, N = SFX.N;
    SFX.define('shopCoin', b => {
      N(b, { nk: 'white', ft: 'highpass', f: 5000, d: 0.025, g: 0.05, a: 0 });
      T(b, { type: 'sine', f: 2637, d: 0.22, g: 0.07, a: 0.001, mr: 2.76, mi: 0.9, mdec: 0.05 });
      T(b, { type: 'sine', f: 3951, d: 0.3, g: 0.05, a: 0.001, at: 0.06, mr: 2.76, mi: 0.8, mdec: 0.05 });
    });
    SFX.define('shopChime', b => {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
        const at = i * 0.07;
        T(b, { type: 'sine', f, d: 0.6, g: 0.07, a: 0.003, at, mr: 3.5, mi: 1, mdec: 0.04 });
        T(b, { type: 'triangle', f: f * 2, d: 0.35, g: 0.025, a: 0.003, at });
      });
      N(b, { nk: 'pink', ft: 'highpass', f: 6500, d: 0.5, g: 0.025, at: 0.3, q: 0.7 });
    });
    SFX.define('shopFanfare', b => {
      T(b, { type: 'sine', f: 110, f2: 55, d: 0.5, g: 0.12, a: 0.004 });
      [[392, 0], [523.25, 0.09], [659.25, 0.18], [783.99, 0.27], [1046.5, 0.38]].forEach(([f, at]) => {
        T(b, { type: 'sawtooth', f, d: 0.34, g: 0.035, a: 0.01, at, lp: 2400 });
        T(b, { type: 'sawtooth', f: f * 1.006, d: 0.34, g: 0.026, a: 0.01, at, lp: 2400 });
        T(b, { type: 'sine', f: f * 2, d: 0.7, g: 0.05, a: 0.002, at, mr: 3.5, mi: 1.1, mdec: 0.04 });
      });
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => T(b, { type: 'sawtooth', f, d: 1.1, g: 0.03, a: 0.03, at: 0.5, lp: 2400 }));
      T(b, { type: 'triangle', f: 2093, d: 1, g: 0.035, a: 0.004, at: 0.55 });
      N(b, { nk: 'pink', ft: 'highpass', f: 6000, d: 0.9, g: 0.035, at: 0.5, q: 0.7 });
    });
    SFX.define('shopThud', b => {
      T(b, { type: 'sine', f: 140, f2: 55, d: 0.2, g: 0.2, a: 0.003 });
      N(b, { nk: 'brown', ft: 'lowpass', f: 420, f2: 180, d: 0.14, g: 0.12, a: 0, q: 0.7 });
    });
  }

  // v6 item 66 (scenario intro stings): introSlam = the title slam (sub boom + noise crack + a brass hit), introWin = bright rising triad, introLose = low
  // falling minor hit, introPunch = a short tick + thump (one combo step punching in, lighter), introWhoosh = a soft swoosh as an element flies to the HUD
  if (SFX && SFX.define && SFX.T && SFX.N) {
    const T = SFX.T, N = SFX.N;
    SFX.define('introSlam', b => {
      T(b, { type: 'sine', f: 120, f2: 34, d: 0.7, g: 0.2, a: 0.002 });
      N(b, { nk: 'white', ft: 'bandpass', f: 2400, f2: 400, d: 0.22, g: 0.1, a: 0, q: 0.8 });
      N(b, { nk: 'brown', ft: 'lowpass', f: 900, f2: 120, d: 0.5, g: 0.1, a: 0.002, q: 0.7 });
      [196, 293.66, 392].forEach(f => { T(b, { type: 'sawtooth', f, d: 0.55, g: 0.04, a: 0.006, at: 0.02, lp: 1800 }); T(b, { type: 'sawtooth', f: f * 1.007, d: 0.55, g: 0.03, a: 0.006, at: 0.02, lp: 1800 }); });
      T(b, { type: 'sine', f: 1568, d: 0.5, g: 0.04, a: 0.002, at: 0.05, mr: 3.5, mi: 1, mdec: 0.05 });
    });
    SFX.define('introWin', b => {
      N(b, { nk: 'pink', ft: 'highpass', f: 3000, d: 0.12, g: 0.05, a: 0 });
      [523.25, 659.25, 783.99].forEach((f, i) => { T(b, { type: 'triangle', f, d: 0.4, g: 0.07, a: 0.004, at: i * 0.07 }); T(b, { type: 'sine', f: f * 2, d: 0.5, g: 0.04, a: 0.002, at: i * 0.07, mr: 3.5, mi: 0.8, mdec: 0.04 }); });
      T(b, { type: 'sine', f: 90, f2: 55, d: 0.3, g: 0.1, a: 0.003 });
    });
    SFX.define('introLose', b => {
      T(b, { type: 'sine', f: 100, f2: 40, d: 0.55, g: 0.16, a: 0.003 });
      N(b, { nk: 'brown', ft: 'lowpass', f: 700, f2: 150, d: 0.4, g: 0.09, a: 0.003 });
      [185, 220, 277.18].forEach((f, i) => T(b, { type: 'sawtooth', f, f2: f * 0.94, d: 0.5, g: 0.04, a: 0.01, at: i * 0.04, lp: 1100 }));
    });
    SFX.define('introPunch', b => {
      T(b, { type: 'sine', f: 180, f2: 70, d: 0.14, g: 0.12, a: 0.001 });
      N(b, { nk: 'white', ft: 'highpass', f: 3500, d: 0.03, g: 0.05, a: 0 });
      T(b, { type: 'square', f: 880, f2: 1320, d: 0.06, g: 0.03, a: 0.001, lp: 3000 });
    });
    SFX.define('introWhoosh', b => {
      N(b, { nk: 'pink', ft: 'bandpass', f: 500, f2: 3200, d: 0.28, g: 0.04, a: 0.08, q: 1.2 });
    });
  }

  // v6 item 27 (juke): two short belief stings. beliefHuh = a chaser reached its guess and you are not there (a falling, wobbling
  // two-note "huh?"); beliefAlert = it found you again (a bright rising double ping + click).
  if (SFX && SFX.define && SFX.T && SFX.N) {
    const T = SFX.T, N = SFX.N;
    SFX.define('beliefHuh', b => {
      T(b, { type: 'triangle', f: 660, f2: 520, d: 0.16, g: 0.07, a: 0.006 });
      T(b, { type: 'triangle', f: 560, f2: 430, d: 0.24, g: 0.07, a: 0.006, at: 0.15, mr: 9, mi: 0.4, mdec: 0.2 });
      N(b, { nk: 'pink', ft: 'bandpass', f: 1800, d: 0.08, g: 0.015, q: 2 });
    });
    SFX.define('beliefAlert', b => {
      N(b, { nk: 'white', ft: 'highpass', f: 4000, d: 0.03, g: 0.04 });
      T(b, { type: 'square', f: 880, f2: 1320, d: 0.07, g: 0.045, a: 0.002, lp: 3000 });
      T(b, { type: 'square', f: 1175, f2: 1760, d: 0.1, g: 0.045, a: 0.002, at: 0.08, lp: 3200 });
      T(b, { type: 'sine', f: 1760, d: 0.25, g: 0.04, a: 0.002, at: 0.08 });
    });
  }

  // ---------------------------------------------------------------- engine

  // Per-voice metadata. verb = reverb send, prio = never dropped under load, low = first to be dropped,
  // grp = shared throttle group, vol = base level (the wiki's relative levels).
  const META = {
    cast_coldsnap: { vol: 0.5 }, csProc: { vol: 0.5, grp: 'tick' }, cast_icewall: { vol: 0.6, verb: 0.15 }, iceCrunch: { grp: 'tick', low: 1 },
    cast_forgespirit: { vol: 0.85 }, tornadoLift: { vol: 0.8, grp: 'hit' }, tornadoLand: { grp: 'hit', low: 1 }, meteorBurn: { vol: 0.5, grp: 'tick', low: 1 },
    meteorCrumble: { vol: 0.5, verb: 0.3 }, atkImpact: { vol: 0.5, low: 1 }, atkPre: { low: 1 }, spiritLaunch: { low: 1 }, spiritImpact: { low: 1 },
    footstep: { vol: 0.4, low: 1, grp: 'step' }, dmgTick: { grp: 'tick', low: 1 }, empDrain: { vol: 0.6, grp: 'tick', low: 1 }, iceHit: { vol: 0.5, grp: 'tick', low: 1 },
    empPop: { prio: 1, verb: 0.3, vol: 0.8 }, sunImpact: { prio: 1, verb: 0.35, vol: 0.8 }, meteorLand: { prio: 1, verb: 0.4, vol: 0.8 }, hammerImpact: { prio: 1, verb: 0.3, vol: 0.8 },
    cast_deafeningblast: { prio: 1, verb: 0.45, vol: 0.8 }, cast_deafeningblast_dark: { prio: 1, verb: 0.5, vol: 0.7 }, cast_tornado_dark: { verb: 0.3 },
    bkb: { prio: 1, verb: 0.3 }, refresher: { verb: 0.3 }, shiva: { prio: 1, verb: 0.3 }, cataclysm: { prio: 1, verb: 0.4 }, tpArrive: { verb: 0.2 },
    cast_ghostwalk: { verb: 0.25 }, invoke: { verb: 0.15 }, spiritSpawn: { verb: 0.2 }, deafeningHit: { grp: 'hit' }, 'fx:gleipnirHit': { grp: 'hit', verb: 0.15, vol: 0.8 },
    'fx:orchidBurst': { verb: 0.2 }, sunBeam: { verb: 0.15 },
    towerShot: { vol: 0.8, low: 1, grp: 'hit' }, towerDown: { prio: 1, verb: 0.35, vol: 0.5 }, kill: { vol: 0.7, grp: 'hit', low: 1 }, heroDeath: { prio: 1, verb: 0.3, vol: 0.8 },
    cdTick: { prio: 1 }, cdGo: { prio: 1 }, levelUp: { verb: 0.25 }, beliefHuh: { vol: 0.7, verb: 0.15 }, beliefAlert: { prio: 1, vol: 0.75 },
  };
  // throttle: max per 100 ms per id, plus per-group caps so per-tick sounds never pile up into a harsh buzz
  const MAXN = { dmgTick: 2, hit: 3, csProc: 2, csTarget: 2, failSoft: 1, orbQ: 3, orbW: 3, orbE: 3, comboStep: 2, blocked: 2, spiritLaunch: 3, spiritImpact: 3,
    tornadoLift: 2, tornadoLand: 2, atkPre: 2, atkLaunch: 2, atkImpact: 2, iceCrunch: 3, meteorBurn: 2, empDrain: 2, iceHit: 2, footstep: 1, sunBeam: 3, empCrackle: 2, meteorWhistle: 2, sunImpact: 3, meteorLand: 2, towerShot: 2, towerDown: 1, kill: 2, heroDeath: 1, cdTick: 1, cdGo: 1 };
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
    try { return !!(IT.Art && IT.Art.playerSkin) && IT.Art.playerSkin() === 'dark'; } catch (e) { return false; }   // the Shop's equipped skin
  }

  // loop-group handle: several audio loops driven as one
  function group(hs) {
    return { stop() { hs.forEach(h => h.stop()); }, set(p) { hs.forEach(h => h.set(p)); }, alive() { return hs.some(h => h.alive && h.alive()); } };
  }

  // loop specs
  const LOOPS = {
    tornado: [
      { nk: 'pink', ft: 'bandpass', f: 250, f2: 800, sweep: 2.5, q: 1.4, g: 0.3, atk: 1, rel: 0.8, wob: 2.5,
        osc: [{ type: 'sine', f: 620, f2: 980, g: 0.018, fm: 4, fmd: 60 }, { type: 'triangle', f: 1240, f2: 1560, g: 0.007, fm: 6, fmd: 80 }] },
      { nk: 'brown', ft: 'lowpass', f: 180, q: 1.1, g: 0.2, atk: 0.8, rel: 0.8, wob: 1.3 },
    ],
    meteor: [
      { nk: 'brown', ft: 'lowpass', f: 150, q: 1.3, g: 0.42, wob: 6, atk: 0.3, rel: 0.5, osc: [{ type: 'sawtooth', f: 48, g: 0.05, lp: 200, fm: 3 }] },
      { nk: 'pink', ft: 'bandpass', f: 420, q: 4, g: 0.1, wob: 17, atk: 0.4, rel: 0.4 },
      { nk: 'crackle', ft: 'highpass', f: 2600, q: 0.7, g: 0.12, wob: 29, wobd: 1, atk: 0.4, rel: 0.4 }, // fire crackle
    ],
    idle: { nk: 'pink', ft: 'bandpass', f: 480, q: 0.7, g: 0.028, atk: 1.2, rel: 0.6, wob: 0.35, osc: [{ type: 'sine', f: 98, g: 0.012, fm: 0.4, fmd: 3 }, { type: 'sine', f: 147, g: 0.007, fm: 0.27, fmd: 3 }] },
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
    // v6 item 66: a flat (unattenuated, centred) UI sting for the scenario intro (js/ui/briefing.js)
    sting(id, vol) {
      if (!SFX || !SFX.playEx || !soundOn() || !SFX.has(id)) return false;
      SFX.playEx(id, { vol: vol || 1, pan: 0, verb: 0.2, prio: 1 });
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
    // relic tier completed (js/ui/relics.js toast): unpositioned, quiet, at most one per 400 ms
    relic(tier) {
      if (!SFX || !SFX.playEx || !SFX.has('relicTier') || !soundOn() || !once('relicTier', 400)) return false;
      this.calls++;
      SFX.playEx('relicTier', { vol: 0.7, pan: 0, tier, verb: 0.3, prio: 1 });
      return true;
    },
    // special relic level-up (js/ui/relics.js special toast): bigger fanfare, still unpositioned and under the action; one per 800 ms
    relicSpecial(tier) {
      if (!SFX || !SFX.playEx || !SFX.has('relicSpecial') || !soundOn() || !once('relicSpecial', 800)) return false;
      this.calls++;
      SFX.playEx('relicSpecial', { vol: 0.8, pan: 0, tier, verb: 0.45, prio: 1 });
      return true;
    },
    // v6 item 69 (shop purchase feedback): unpositioned, on the sfx bus (follows the SFX volume); kinds: coin | unlock | premium | poor
    shop(kind) {
      const id = kind === 'coin' ? 'shopCoin' : kind === 'unlock' ? 'shopChime' : kind === 'premium' ? 'shopFanfare' : kind === 'poor' ? 'shopThud' : null;
      if (!id || !SFX || !SFX.playEx || !SFX.has(id) || !soundOn() || !once(id, 120)) return false;
      this.calls++;
      SFX.playEx(id, { vol: kind === 'poor' ? 0.9 : 0.8, pan: 0, verb: kind === 'premium' ? 0.4 : 0.2, prio: 1 });
      return true;
    },
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
      // v6 item 27: belief stings (juked '?' / reacquired '!'), one per 0.4 s whatever the pack size; gated like the markers (IT.Belief.uiOn)
      on('belief', p => {
        if (!(p.state === 'juked' || (p.state === 'seen' && p.reacquired)) || !IT.Belief || !IT.Belief.uiOn(w) || !once('belief:' + p.state, 400)) return;
        P(p.state === 'juked' ? 'beliefHuh' : 'beliefAlert', posOf(p.unit));
      });
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

      // ---- towers, deaths, scenario countdown
      on('towerAttack', p => P('towerShot', posOf(p.unit)));
      on('towerDown', p => P('towerDown', posOf(p.unit)));
      on('kill', p => { if (!isHero(p.unit)) P('kill', posOf(p.unit)); });
      on('heroDown', p => { if (isHero(p.unit)) P('heroDeath'); });
      on('scnGo', () => P('cdGo'));
      on('levelUp', () => P('levelUp'));

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

      let lastCd = 0;
      timer = setInterval(() => {
        if (S.w !== w) return;
        // scenario countdown: a tick on every number (3, 2, 1)
        try {
          const hd = IT.Ranked && IT.Ranked.hud && IT.Ranked.hud(w), cd = hd && hd.phase === 'countdown' ? hd.countdown : 0;
          if (cd && cd !== lastCd) P('cdTick');
          lastCd = cd || 0;
        } catch (e) {}
      }, 100);
    },
  };
  IT.Sfx = Sfx;
})(typeof window !== 'undefined' ? window : globalThis);
