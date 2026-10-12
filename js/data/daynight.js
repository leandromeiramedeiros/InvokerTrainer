// Day / night cycle (v6): time of day on the world (w.tod), per-unit day / night vision radius, per-scenario time of day.
// Values from the local Dota install (build 6957), see DECISIONS.md "v6 day / night":
//   cycle: server.dll ConVar dota_time_of_day_rate ("Rate at which time of day changes relative to game seconds") default
//          0.00166667 = 1/600 per game second -> a 600 s day, 300 s light + 300 s night (game starts at daytime).
//   hero 1800 / 800 (npc_dota_hero_base VisionDaytimeRange / VisionNighttimeRange; Invoker inherits), Forge Spirit 1200 / 800,
//   towers T1 1900 / 800, T2-T4 1900 / 1100, lane creeps 750 / 750 (npc_units.txt; no creeps in the trainer).
// Pure data + helpers; the 'daynight' sim system (world.js) calls tick(). Loaded after js/data/game.js.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};

  const CYCLE = 300;   // s per phase (dota_time_of_day_rate 1/600 per s: full day 600 s, half light, half dark)
  const RAMP = 10;     // s sunset / sunrise ramp of vision + light (trainer assumption: Dota fades the light, the vision flips)
  const TOWER = { 1: [1900, 800], 2: [1900, 1100], 3: [1900, 1100], 4: [1900, 1100] };   // npc_units.txt npc_dota_*_tower<N>*
  const CREEP = [750, 750];   // npc_units.txt npc_dota_creep_*_melee / _ranged (reference only)

  // Per-scenario time of day (keyed by scenario id; default 'day'). 'night' = whole scenario at night; { nightAt: s } = starts in daylight,
  // sunset begins s seconds into play (fully dark RAMP s later). Rule: full night only when every foe starts within night vision (800)
  // of the hero, so the opening picture is the same; foes placed farther out get a sunset during the scenario instead.
  const SCENARIO = {
    ghost_escape: 'night',          // booted chaser 450-550 away (playtest 2): night vision 800 still sees it, Ghost Walk breaks its 800 sight sooner
    ghost_finish: 'night',          // still foe 600-800 away: sneak in invisible, spirits finish
    ghost_slip: { nightAt: 5 },     // booted chasers 600-750 away (playtest 2): seen by day, the dark closes in mid-escape
    dust_escape: { nightAt: 5 },    // Dust carrier 750-950 away
    plateau_escape: { nightAt: 6 }, // chasers 800-1200 below the plateau
    shadow_strike: { nightAt: 3 },  // two wanderers 1000-1250 away: spot them, then walk in under the dark
    fog_ambush: { nightAt: 4 },     // still foe 1000-1300 away in the fog: strike before dark or lose sight of it
    blink_fog: { nightAt: 6 },      // foe 890-1130 away, Blink range 1200
    night_juke: 'night',            // v6 item 27: the pack starts 620-760 u away (night sight 800); the other juke scenarios play by day (sight 1800)
    river_mouth_ambush: { nightAt: 4 }, // v6 item 29: the sentry stands 1000-1300 u away in the mist: strike before the dark closes in
  };

  const VALID = { day: 1, night: 1, cycle: 1 };

  // spec: 'day' | 'night' | 'cycle' | { nightAt: s } -> w.tod { mode, night, t (s into the phase), len (phase length, Infinity = fixed), fade, cycle }
  function make(spec) {
    if (spec && typeof spec === 'object' && spec.nightAt != null) return { mode: 'nightAt', night: false, t: 0, len: Math.max(0, +spec.nightAt || 0), fade: 0, cycle: false };
    const m = VALID[spec] ? spec : 'day';
    return { mode: m, night: m === 'night', t: 0, len: m === 'cycle' ? CYCLE : Infinity, fade: 0, cycle: m === 'cycle' };
  }
  const forScenario = id => (id && Object.prototype.hasOwnProperty.call(SCENARIO, id) ? SCENARIO[id] : 'day');

  // 0 = full day .. 1 = full night (linear over the RAMP after a flip). No w.tod: the legacy `w.night` / `map.night` flags.
  function factor(w) {
    if (!w) return 0;
    if (w.night || (w.map && w.map.night)) return 1;   // legacy flags (tests, a night map) force full night
    const d = w.tod; if (!d) return 0;
    const r = Math.max(0, Math.min(1, (d.fade || 0) / RAMP));
    return d.night ? 1 - r : r;
  }
  const isNight = w => factor(w) >= 0.5;
  const lerp = (w, day, night) => Math.round(day + (night - day) * factor(w));

  // [day, night] vision of a unit, or null when the time of day does not change it (spell / item vision thinkers, wards ...)
  function pair(e) {
    if (!e) return null;
    if (e.visionDay != null && e.visionNight != null) return [e.visionDay, e.visionNight];
    const GM = IT.GAME || {}, D = IT.DOTA || {};
    switch (e.kind) {
      case 'hero': { const h = D.hero || {}; return [h.VisionDaytimeRange || 1800, h.VisionNighttimeRange || 800]; }
      case 'enemy': {
        if (e.refill) { const v = (GM.DUMMY && GM.DUMMY.vision) || 800; return [v, v]; }   // training dummy: fixed 800
        const E = GM.ENEMY || {}; return [E.vision || 1800, E.visionNight || 800];
      }
      case 'dummy': { const v = (GM.DUMMY && GM.DUMMY.vision) || 800; return [v, v]; }
      case 'spirit': { const u = (D.units && D.units.npc_dota_invoker_forged_spirit) || {}; return [u.VisionDaytimeRange || 1200, u.VisionNighttimeRange || 800]; }
      case 'tower': return TOWER[Math.max(1, Math.min(4, e.tier | 0 || 1))];
      default: return null;
    }
  }
  function radius(w, e) { const p = pair(e); return p ? lerp(w, p[0], p[1]) : null; }

  // write every managed unit's e.vision for the current time of day. A unit whose vision something else set (a test override, a
  // destroyed tower's 0) is left alone from then on (e._dnFixed).
  function apply(w) {
    for (const e of w.ents) {
      if (e.dead || e._dnFixed) continue;
      const p = pair(e); if (!p) continue;
      if (e._dnv === undefined) {
        const lo = Math.min(p[0], p[1]), hi = Math.max(p[0], p[1]);
        if (!(e.vision >= lo && e.vision <= hi)) { e._dnFixed = true; continue; }
      } else if (e.vision !== e._dnv) { e._dnFixed = true; continue; }
      if (e.destroyed) { e._dnFixed = true; continue; }
      e.vision = e._dnv = lerp(w, p[0], p[1]);
    }
  }

  function tick(w, dt) {
    const d = w.tod;
    if (d) {
      d.t += dt;
      if (d.fade > 0) d.fade = Math.max(0, d.fade - dt);
      if (d.t >= d.len) {
        d.t -= d.len; d.night = !d.night; d.fade = RAMP;
        d.len = d.cycle ? CYCLE : Infinity;
        if (!d.cycle) d.t = 0;
        w.emit('timeOfDay', { night: d.night });
      }
    }
    apply(w);
  }

  // s left in the current phase (Infinity when it never flips); progress 0..1 through it (0 when fixed)
  const left = w => (w && w.tod ? Math.max(0, w.tod.len - w.tod.t) : Infinity);
  const progress = w => (w && w.tod && isFinite(w.tod.len) && w.tod.len > 0 ? Math.min(1, w.tod.t / w.tod.len) : 0);

  // set the time of day now (vision radii applied at once, fog refreshed when a map is loaded)
  function set(w, spec) {
    w.tod = make(spec);
    apply(w);
    if (IT.Vision && IT.Vision.update && w.map) { IT.Vision.update(w); w._visT = w.t; }
    return w.tod;
  }

  // main.js start(): Free Play -> opts.tod ('day' | 'night' | 'cycle'); scenario runs -> the SCENARIO table at every scenario start
  // (ranked swaps scenarios inside one world; 'scnStart' fires after the scenario's units are placed and the fog refreshed)
  function attach(w, opts) {
    w.tod = make(opts && opts.tod);
    return w.on('scnStart', p => set(w, forScenario(p.id)));
  }

  IT.DayNight = { CYCLE, RAMP, TOWER, CREEP, SCENARIO, make, forScenario, factor, isNight, lerp, pair, radius, apply, tick, left, progress, set, attach };
})(typeof window !== 'undefined' ? window : globalThis);
