// Enemy belief model (v6 item 27, juke): where a chaser THINKS the hero is. Pure sim (no rendering), one state per chaser (e.belief).
// It only ever reads the hero's real position while the enemy team SEES it (IT.Vision.teamSees); unseen, it works from that last
// observation alone. See DECISIONS.md "v6 item 27".
//   lastSeen {x, y, t} + lastVel (smoothed from consecutive sightings) -> predicted point = the last heading extrapolated for
//   min(now - t, horizon) x speed, then (tiers with bias > 0) re-scored against a few candidates: heading +-30/60 deg, the treeline
//   gaps / ramps of the map near that distance (features(): one scan per map, cached) and the hero's way home (Radiant base side).
//   confidence = 0.5 ^ ((now - t) / half). States (each change emits 'belief' { unit, state, from, x, y, px, py }):
//     idle -> seen -> lost (sight broke) -> predicted (walking to the live prediction) -> juked (reached it, nothing there: confused for
//     P.confused s) -> searching (a widening ring around the prediction; split bearings per chaser at hard+) -> seen ('reacquired').
// Tier params: IT.DIFFICULTY[tier].belief (js/data/difficulty.js), defaults below.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const DEF = { predict: 1, horizon: 2.5, bias: 0.5, half: 5, confused: 0.8, split: false, detect: false, recatch: false, ring0: 150, grow: 110, ringMax: 900, dustConf: 0.45, alts: 1 };
  const LOST_HOLD = 0.2, ARRIVE = 70, STILL = 30, FEAT_STEP = 3, TAU = Math.PI * 2;
  const params = df => Object.assign({}, DEF, (df && df.belief) || {});
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return Math.abs(d); };

  function create(e, P, o) {
    o = o || {};
    return { unit: e ? e.id : null, P: P || params(null), state: 'idle', since: 0, last: null, vel: { x: 0, y: 0 }, obs: null, pred: null, conf: 0,
      search: null, idx: o.idx || 0, n: o.n || 1, log: [], cand: null, reacq: null, jukedAt: null };
  }
  function set(w, B, state, extra) {
    if (B.state === state) return;
    const from = B.state;
    B.state = state; B.since = w.t;
    B.log.push(state); if (B.log.length > 24) B.log.shift();
    const p = B.pred || B.last || {};
    w.emit('belief', Object.assign({ unit: B.unit, state, from, x: B.last ? B.last.x : null, y: B.last ? B.last.y : null, px: p.x, py: p.y }, extra || {}));
  }

  // ---------------------------------------------------------------- map features (cached per map): treeline gaps + ramps
  // gap = a walkable tile with trees within 2 tiles on both sides along one axis while the other axis is open (a path through a
  // treeline); ramp = map.ramp mask. Sub-sampled on a FEAT_STEP grid so a map holds a few hundred points.
  function features(map) {
    if (!map) return [];
    if (map._beliefFeat) return map._beliefFeat;
    const out = [], tree = (x, y) => map.at(x, y) === 1, wk = (x, y) => map.walkableTile(x, y);
    const near = (x, y, dx, dy) => tree(x + dx, y + dy) || tree(x + 2 * dx, y + 2 * dy);
    const taken = new Set();
    for (let y = 1; y < map.h - 1; y++) for (let x = 1; x < map.w - 1; x++) {
      if (!wk(x, y)) continue;
      const key = Math.floor(x / FEAT_STEP) + ',' + Math.floor(y / FEAT_STEP);
      if (taken.has(key)) continue;
      let k = null;
      if (map.ramp && map.ramp[y * map.w + x]) k = 'ramp';
      else if ((near(x, y, 1, 0) && near(x, y, -1, 0) && wk(x, y - 1) && wk(x, y + 1)) || (near(x, y, 0, 1) && near(x, y, 0, -1) && wk(x - 1, y) && wk(x + 1, y))) k = 'gap';
      if (!k) continue;
      taken.add(key);
      const c = map.center(x, y);
      out.push({ x: c.x, y: c.y, k });
    }
    map._beliefFeat = out;
    return out;
  }
  // the hero's way home: the Radiant fountain if the map holds it, else the map's bottom-left corner (Radiant side, map-local coords)
  function home(map) {
    if (!map) return null;
    if (map._beliefHome !== undefined) return map._beliefHome;
    const f = (map.structures || []).find(s => s.kind === 'fountain' && s.team === 0);
    map._beliefHome = f ? map.center(f.tx, f.ty) : { x: 0, y: map.h * map.tile };
    return map._beliefHome;
  }
  // walk from p along ang up to len (24 u steps), stopping before an unwalkable tile
  function reachAlong(map, p, ang, len) {
    let q = { x: p.x, y: p.y };
    const c = Math.cos(ang), s = Math.sin(ang);
    for (let d = 24; d <= len + 1e-6; d += 24) { const n = { x: p.x + c * d, y: p.y + s * d }; if (map && !map.walkable(n.x, n.y)) break; q = n; }
    return q;
  }
  const FEAT_W = { gap: 0.6, ramp: 0.5 };
  // -> { x, y, alts:[{x,y,s}] best first } ; L = last seen, vel = last velocity, dt = s since L
  function predict(map, L, vel, dt, P) {
    const sp = Math.hypot(vel.x, vel.y);
    if (!(P.predict > 0) || sp < STILL || !L) return { x: L.x, y: L.y, alts: [{ x: L.x, y: L.y, s: 1 }] };
    const T = Math.min(Math.max(0, dt), P.horizon), D = sp * T * P.predict, ang = Math.atan2(vel.y, vel.x);
    const straight = reachAlong(map, L, ang, D);
    if (!(P.bias > 0) || D < 48) return { x: straight.x, y: straight.y, alts: [{ x: straight.x, y: straight.y, s: 1 }] };
    const hm = home(map), hAng = hm ? Math.atan2(hm.y - L.y, hm.x - L.x) : null;
    const score = (c, kind) => {
      const d = dist(L, c); if (d < 24) return -9;
      const a = Math.atan2(c.y - L.y, c.x - L.x), head = Math.cos(angDiff(a, ang));
      const homeB = hAng == null ? 0 : 0.25 * Math.max(0, Math.cos(angDiff(a, hAng)));
      return head + P.bias * ((FEAT_W[kind] || 0) + homeB) - 0.5 * Math.abs(d - D) / Math.max(1, D);
    };
    const cands = [{ x: straight.x, y: straight.y, s: score(straight, null) }];
    for (const da of [-1.05, -0.52, 0.52, 1.05]) { const q = reachAlong(map, L, ang + da, D); cands.push({ x: q.x, y: q.y, s: score(q, null) }); }
    for (const f of features(map)) {
      const d = dist(L, f); if (d > D * 1.3 + 48 || d < D * 0.4) continue;
      if (angDiff(Math.atan2(f.y - L.y, f.x - L.x), ang) > 1.3) continue;
      cands.push({ x: f.x, y: f.y, s: score(f, f.k), k: f.k });
    }
    cands.sort((a, b) => b.s - a.s);
    const alts = [];
    for (const c of cands) if (!alts.some(q => dist(q, c) < 250)) { alts.push(c); if (alts.length >= 3) break; }
    return { x: alts[0].x, y: alts[0].y, alts };
  }

  // ---------------------------------------------------------------- per-tick update: observe the hero, advance the state machine
  // sees = the enemy team sees the hero now. Returns B.
  function observe(w, B, h, sees) {
    const P = B.P;
    if (sees && h) {
      if (B.obs) {
        const dt = w.t - B.obs.t;
        if (dt >= 0.08) {
          if (dt <= 1.2) { const vx = (h.x - B.obs.x) / dt, vy = (h.y - B.obs.y) / dt; B.vel.x = B.vel.x * 0.35 + vx * 0.65; B.vel.y = B.vel.y * 0.35 + vy * 0.65; }
          else { B.vel.x = 0; B.vel.y = 0; }
          B.obs = { x: h.x, y: h.y, t: w.t };
        }
      } else { B.obs = { x: h.x, y: h.y, t: w.t }; B.vel.x = 0; B.vel.y = 0; }
      B.last = { x: h.x, y: h.y, t: w.t }; B.conf = 1; B.pred = { x: h.x, y: h.y }; B.cand = null; B.search = null;
      if (B.state !== 'seen') {
        const re = B.state !== 'idle' && (B.state !== 'lost' || w.t - B.since > 0.5);   // a vision flicker is not a reacquire
        if (re) B.reacq = w.t;
        set(w, B, 'seen', re ? { reacquired: true } : null);
      }
      return B;
    }
    B.obs = null;
    if (!B.last) return B;
    B.conf = Math.pow(0.5, Math.max(0, w.t - B.last.t) / P.half);
    if (B.state === 'seen') { set(w, B, 'lost'); return B; }
    if (B.state === 'lost' && w.t - B.last.t >= LOST_HOLD - 1e-9) { refresh(w, B); set(w, B, 'predicted'); return B; }
    if (B.state === 'predicted') refresh(w, B);
    if (B.state === 'juked' && w.t - B.since >= P.confused - 1e-9) {
      B.search = { t0: w.t, k: 0, to: null, cx: B.pred.x, cy: B.pred.y };
      set(w, B, 'searching');
    }
    return B;
  }
  // live prediction (chaser idx picks among the alternatives when the tier splits)
  function refresh(w, B) {
    const q = predict(w.map, B.last, B.vel, w.t - B.last.t, B.P);
    const pick = B.P.split && B.n > 1 && q.alts.length > 1 ? q.alts[B.idx % Math.min(q.alts.length, B.n)] : q;
    B.pred = { x: pick.x, y: pick.y }; B.cand = q.alts;
  }
  // the chaser stands at the prediction and the hero is not there
  function juke(w, B) {
    if (B.state !== 'predicted' && B.state !== 'lost') return;
    B.jukedAt = w.t;
    set(w, B, 'juked');
  }
  // next probe of the search ring (widening around the prediction; split bearings per chaser at hard+, else the pack shares one)
  function probe(w, B) {
    const S = B.search, P = B.P; if (!S) return null;
    const R = Math.min(P.ringMax, P.ring0 + P.grow * (w.t - S.t0));
    const base = P.split ? (B.idx / Math.max(1, B.n)) * TAU : 0;
    const a = base + S.k * 2.39996 + (w.rng() - 0.5) * 0.8, r = R * (0.6 + 0.4 * w.rng());
    S.k++;
    let p = { x: S.cx + Math.cos(a) * r, y: S.cy + Math.sin(a) * r };
    if (w.map && !w.map.walkable(p.x, p.y) && IT.Nav && IT.Nav.nearestWalkable) { const q = IT.Nav.nearestWalkable(w.map, p.x, p.y); if (q) p = { x: q.x, y: q.y }; }
    S.to = p;
    return p;
  }
  // the best guess of the hero's position (units.js routes the AI's heroAt through it)
  const where = B => (!B || !B.last ? null : B.state === 'seen' ? B.last : B.pred || B.last);

  // juke scenarios force the indicators; otherwise the beliefUI setting (undefined = on)
  function uiOn(w) {
    const r = w && w.ranked, sc = r && r.pr && r.pr.sc;
    if (sc && (sc.tags || []).indexOf('juke') >= 0) return true;
    const S = IT.Settings && IT.Settings.get ? IT.Settings.get() : null;
    return !S || S.beliefUI !== false;
  }

  IT.Belief = { DEF, LOST_HOLD, ARRIVE, params, create, observe, predict, refresh, juke, probe, where, features, home, uiOn, reachAlong };
})(typeof window !== 'undefined' ? window : globalThis);
