// Ranked / Combo Practice / scenario sandbox: scoring, rating, run state machine, scenario swap + objectives. Owner: S3.
// Pure (no DOM). Persistent rating lives in localStorage 'it2.rank' (guarded; in-memory fallback).
// Flow of a scenario run: countdown (world frozen) -> play (sim time) -> result (frozen) -> next scenario.
// main.js drives tick(realDt) while frozen; the 'ranked' sim system drives it per step while playing.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const KEY = 'it2.rank';
  const RUN_SECONDS = 300, TURNS = 8, COUNTDOWN = 10, PRACTICE_COUNTDOWN = 3, RESULT_HOLD = 1.6, SLACK = 6, CAUGHT = 110, ESCAPED = 1900, HIST = 40;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lang = () => IT.lang || 'en';
  const loc = o => (o && typeof o === 'object' ? o[lang()] || o.en : o);
  const TIER_NAME = ['basic', 'intermediate', 'advanced'];
  const maxDelta = () => (IT.Ranks && IT.Ranks.MAX_DELTA) || 150;

  // ---------------------------------------------------------------- pure math
  const streakMult = s => Math.min(2, 1 + 0.1 * Math.max(0, s | 0));
  // points for one solved scenario: difficulty x speed (par or faster = +50%) x streak
  function scenarioScore(diffMult, par, time, streak) {
    const f = clamp((2 * par - time) / par, 0, 1);
    return Math.round(100 * diffMult * (1 + 0.5 * f) * streakMult(streak));
  }
  const expected = rating => 350 + 0.45 * Math.max(0, rating);
  function ratingDelta(score, rating) {
    const e = expected(rating), M = maxDelta();
    return clamp(Math.round(M * Math.tanh((score - e) / (0.5 * e + 200))), -M, M);
  }
  // difficulty index (0..4) for the n-th scenario of a ranked run: starts by rating, then +1 every 3 scenarios
  const baseDiff = rating => (rating < 800 ? 0 : rating < 2000 ? 1 : rating < 3500 ? 2 : 3);
  const rampDiff = (rating, n) => Math.min(4, baseDiff(rating) + Math.floor(n / 3));
  const rankKey = r => r.tier * 6 + r.stars;

  // ---------------------------------------------------------------- storage
  let mem = null;
  const blank = () => ({ rating: 0, peak: 0, games: 0, history: [] });
  function load() {
    try { const s = G.localStorage && G.localStorage.getItem(KEY); if (s) { const o = JSON.parse(s); return Object.assign(blank(), o, { history: Array.isArray(o.history) ? o.history : [] }); } } catch (e) { /* fall through */ }
    return mem ? Object.assign(blank(), mem) : blank();
  }
  function save(p) {
    mem = p;
    try { G.localStorage && G.localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* in-memory only */ }
  }
  function profile() {
    const p = load(), l = p.history[p.history.length - 1];
    return { rating: p.rating, peak: p.peak, games: p.games, last: l ? { delta: l.delta, score: l.score } : null };
  }
  // fold a finished run's score into the rating; returns { score, delta, before:{rating,rank}, after:{rating,rank}, up, down }
  function record(score) {
    const p = load(), r0 = p.rating, b = IT.Ranks.fromRating(r0);
    const r1 = Math.max(0, r0 + ratingDelta(score, r0)), a = IT.Ranks.fromRating(r1);
    p.rating = r1; p.peak = Math.max(p.peak || 0, r1); p.games = (p.games || 0) + 1;
    p.history.push({ score, delta: r1 - r0, rating: r1 });
    if (p.history.length > HIST) p.history.splice(0, p.history.length - HIST);
    save(p);
    return { score, delta: r1 - r0, before: { rating: r0, rank: b }, after: { rating: r1, rank: a }, up: rankKey(a) > rankKey(b), down: rankKey(a) < rankKey(b) };
  }
  function reset() { mem = null; try { G.localStorage && G.localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

  // ---------------------------------------------------------------- scenario preparation (pure)
  // sc + difficulty -> { sc, df, lo, fog, par, limit, skin }
  function prepare(sc, df, skin) {
    const H = sc.hero || {}, base = IT.RULES.autoLoadout(H.lvl || 25, H.style || 'qe'), cut = df.orbCut || 0;
    const orbs = {};
    for (const k of IT.RULES.orbs) orbs[k] = base.orbs[k] > 0 ? Math.max(1, base.orbs[k] - cut) : 0;
    const lo = IT.Loadout.normalize({
      heroLevel: base.heroLevel, orbs, talents: base.talents, scepter: !!H.scepter, scepterOrb: H.scepter || null,
      shard: !!H.shard, shardSpell: H.shard || null, items: (H.items || []).slice(), skin: skin || IT.GAME.SKINS[0], preset: df.preset, mode: 'free', preinvoked: H.preinvoked,
    });
    const esc = sc.obj.type === 'escape' || sc.obj.type === 'hold';
    return { sc, df, lo, fog: sc.fog != null ? !!sc.fog : !!df.fog, par: sc.par, limit: esc ? sc.obj.time : Math.ceil(sc.par * df.timer + SLACK), skin: lo.skin };
  }

  // ---- spot resolution (v4): a unit / hero / gate position spec -> walkable {x, y}
  //   { dx, dy }                         offset from the hero start (legacy)
  //   { x, y }                           absolute map position
  //   { where:[tags], not:[tags], d:[min,max], i }   the i-th arena of the map (tags: open highground lowground river tower choke fog pit jungle ...)
  //                                      whose distance to the hero start is closest to the middle of d; + optional dx, dy
  //   { tower:{team,i}, ahead, side }    relative to the i-th (nearest first) tower of a team; ahead>0 = beyond it, seen from the hero start
  //   { gate:true, ahead, side }         relative to the 'cross' gate, seen from the hero start (ahead>0 = beyond it)
  //   { of:k, dx, dy }                   relative to unit k (already placed)
  const nearWalk = (w, x, y) => {
    if (!w.map.walkable(x, y) && IT.Nav && IT.Nav.nearestWalkable) { const p = IT.Nav.nearestWalkable(w.map, x, y); if (p) return { x: p.x, y: p.y }; }
    return { x, y };
  };
  function towerOf(map, base, q) {
    const l = (map.towers || []).filter(t => t.team === (q.team == null ? 1 : q.team)).sort((a, b) => Math.hypot(a.x - base.x, a.y - base.y) - Math.hypot(b.x - base.x, b.y - base.y));
    return l[Math.min(q.i | 0, l.length - 1)] || null;
  }
  function arenaOf(map, s, base) {
    const need = s.where || [], not = s.not || [], d = s.d || [500, 1800], mid = (d[0] + d[1]) / 2;
    const dist = a => Math.hypot(a.x - base.x, a.y - base.y);
    const all = ((map.spawns && map.spawns.arenas) || []).filter(a => need.every(t => a.tags.indexOf(t) >= 0) && !not.some(t => a.tags.indexOf(t) >= 0));
    let pool = all.filter(a => dist(a) >= d[0] && dist(a) <= d[1]);
    if (!pool.length) pool = all;
    pool.sort((a, b) => Math.abs(dist(a) - mid) - Math.abs(dist(b) - mid));
    return pool[Math.min(s.i | 0, pool.length - 1)] || null;
  }
  function spot(w, s, base, placed, jit) {
    const map = w.map;
    let x = base.x + (s.dx || 0), y = base.y + (s.dy || 0);
    if (s.x != null && s.y != null) { x = s.x + (s.dx || 0); y = s.y + (s.dy || 0); }   // absolute (fixed maps)
    else if (s.where) {
      const a = arenaOf(map, s, base);
      if (a) { x = a.x + (s.dx || 0); y = a.y + (s.dy || 0); }
    } else if (s.tower) {
      const t = towerOf(map, base, s.tower);
      if (t) {
        const dd = Math.hypot(t.x - base.x, t.y - base.y) || 1, ux = (t.x - base.x) / dd, uy = (t.y - base.y) / dd;
        x = t.x + ux * (s.ahead || 0) - uy * (s.side || 0) + (s.dx || 0); y = t.y + uy * (s.ahead || 0) + ux * (s.side || 0) + (s.dy || 0);
      }
    } else if (s.gate && w.gate) {
      const g = w.gate, dd = Math.hypot(g.x - base.x, g.y - base.y) || 1, ux = (g.x - base.x) / dd, uy = (g.y - base.y) / dd;
      x = g.x + ux * (s.ahead || 0) - uy * (s.side || 0) + (s.dx || 0); y = g.y + uy * (s.ahead || 0) + ux * (s.side || 0) + (s.dy || 0);
    } else if (s.of != null && placed[s.of]) { x = placed[s.of].x + (s.dx || 0); y = placed[s.of].y + (s.dy || 0); }
    if (jit) { x += (w.rng() * 2 - 1) * jit; y += (w.rng() * 2 - 1) * jit; }
    return nearWalk(w, x, y);
  }

  // swap the world over to a prepared scenario, in place (hero kept, everything else removed)
  function apply(w, pr) {
    const hero = w.hero, df = pr.df, sc = pr.sc;
    const nm = IT.Maps && IT.Maps.get ? IT.Maps.get(sc.map || 'grounds') : null;   // scenario map (default: the Training Grounds)
    const swapped = !!nm && nm !== w.map;
    if (swapped) w.map = nm;
    const sp0 = w.map.spawns.hero, sc0 = sc.hero || {};
    const sp = sc0.at && sc0.at !== 'spawn' ? spot(w, sc0.at, sp0, [], 0) : sp0;   // v4: the hero may start elsewhere (high ground, near a tower ...)
    for (const e of w.ents) if (e !== hero && !e.dead) w.remove(e);
    w.ents = w.ents.filter(e => !e.dead);
    for (const [id, e] of w.byId) if (e.dead) w.byId.delete(id);
    if (swapped) w.emit('mapChange', { map: nm.id });
    if (IT.Towers && IT.Towers.spawnAll && w.map.towers && w.map.towers.length) IT.Towers.spawnAll(w, w.map);
    if (sc.towerHp) for (const e of w.ents) if (e.kind === 'tower' && e.team === 1) { e.hp = e.maxHp = sc.towerHp; }   // winnable tower kills
    hero.statuses.length = 0; hero.orders.length = 0; hero.path.length = 0;
    hero.cd = {}; hero.inv = { orbs: [], slots: [null, null], invokeCd: 0 };
    hero._wind = null; hero._blinkLock = null; hero._pg = null; hero.channel = null;
    if (hero.attack) hero.attack.target = null;
    hero.anim = { name: 'idle', t: 0 };
    hero.x = sp.x; hero.y = sp.y; hero.z = 0; hero.facing = Math.PI / 2;
    IT.Hero.refresh(w, hero, pr.lo);
    if (pr.lo.preinvoked && pr.lo.preinvoked.length) IT.Hero.applyPreinvoked(hero, pr.lo);
    hero.hp = hero.maxHp; hero.mana = hero.maxMana;
    hero.items = []; for (let i = 0; i < 6; i++) hero.items.push(pr.lo.items[i] ? { id: pr.lo.items[i], cd: 0, charges: 0 } : null);
    hero.lastSeen = { x: hero.x, y: hero.y, t: w.t };
    w.fog = pr.fog; w.loadout = pr.lo;
    const out = [], placed = [], jit = (sc.rand && sc.rand.jit) || 0, E = IT.GAME.ENEMY;
    w.gate = sc.gate ? Object.assign(spot(w, sc.gate, sp, placed, 0), { r: sc.gate.r || 260 }) : null;   // 'cross' line (a circle on the map)
    (sc.units || sc.dummies).forEach((d, i) => {
      const p = spot(w, d, sp, placed, d.of != null ? 0 : jit), mot = d.mot;
      placed[i] = p;
      let e;
      if (d.type === 'enemy') {   // v4 NPC hero: AI behavior + items, tier numbers from the difficulty
        const need = d.hp != null && d.hp < 1 ? Math.max(0.05, d.hp - 0.25) : 0.75;   // same "damage to kill" as a dummy with this hp fraction
        const hp = Math.round(Math.max(100, need * E.hp * (df.hpMul || 1)));
        e = IT.Units.spawnEnemy(w, {
          x: p.x, y: p.y, skin: pr.skin, behavior: d.behavior || 'stationary', items: d.items, hp, armor: E.armor + (df.armorAdd || 0),
          telegraph: df.telegraph, awareness: d.aware != null ? d.aware : df.awareness, reaction: mot === 'still' ? 99 : df.reaction,
        });
        e.hpRegen = 0; e.base.hpRegen = 0;
      } else {
        const items = d.items || (df.useBkb || d.useBkb ? ['bkb'] : undefined);
        e = IT.Units.spawnDummy(w, {
          x: p.x, y: p.y, preset: df.preset, skin: pr.skin, behavior: mot ? 'stationary' : df.behavior,
          scenario: { stunBolt: df.stunBolt, dummyEscape: mot ? 'none' : df.escape, blinkAfter: df.blinkAfter },
          useBkb: !!(df.useBkb || d.useBkb), items,
        });
        e.scarecrow = false; e.noHpBar = false;   // scenario foes look like enemies (skin, name, hp bar, dummychat)
        e.reaction = mot === 'still' ? 99 : df.reaction; e.hpRegen = 0; e.base.hpRegen = 0;
        if (d.hp != null && d.hp < 1) e.hp = e.maxHp * Math.min(1, 0.25 + (d.hp - 0.25) * (df.hpMul || df.hp || 1));
      }
      if (mot === 'flee' || mot === 'chase' || mot === 'march') { const ms = mot === 'flee' ? 330 * df.flee : mot === 'march' ? 250 * df.chase : 380 * df.chase; e.ms = ms; e.base.ms = ms; }
      e.scn = { mot: mot || null, next: 0, lastSeen: null };
      out.push(e);
    });
    if (sc.hero && sc.hero.at && out.length) hero.facing = Math.atan2(out[0].y - hero.y, out[0].x - hero.x);
    return out;
  }

  // ---------------------------------------------------------------- run
  // opts: { mode:'ranked'|'practice'|'sandbox', diff:id (practice), scenario:id (sandbox, fixed), rating, seed, skin, runSeconds }
  function create(opts) {
    opts = opts || {};
    const mode = opts.mode || 'practice', ranked = mode === 'ranked', fixed = opts.scenario ? IT.SCENARIOS.get(opts.scenario) : null;
    const rating = opts.rating != null ? opts.rating : ranked ? profile().rating : 0;
    const rng = IT.U.mulberry32(opts.seed == null ? (Math.random() * 1e9) | 0 : opts.seed);
    const run = {
      mode, ranked, fixed, rating, rng, skin: opts.skin, phase: 'idle', cd: 0, hold: 0,
      runLeft: ranked && opts.runSeconds ? opts.runSeconds : null, turns: ranked ? (opts.turns || TURNS) : null, score: 0, streak: 0, bestStreak: 0, solved: 0, failed: 0, n: 0,
      pr: null, dummies: [], result: null, ended: false, summary: null, w: null, onSwap: null, recent: [], t0: 0, caught: false,
      diffId: IT.DIFFICULTY.migrate(opts.diff || 'common'),
      countdown: ranked ? COUNTDOWN : fixed && mode === 'sandbox' ? 0 : PRACTICE_COUNTDOWN,
    };
    const DF = () => IT.DIFFICULTY;

    run.diffIndex = () => (ranked ? rampDiff(rating, run.n) : DF().get(run.diffId).idx);
    run.difficulty = () => DF().get(run.diffIndex());

    // ranked ramp: the n-th scenario of a run aims at level 1 + n (+2 per rating band), picked among levels within +-1 (widening if empty)
    run.levelTarget = () => clamp(Math.round(1 + run.n + 2 * baseDiff(rating)), 1, 10);
    function pick() {
      if (fixed) return fixed;
      const all = IT.SCENARIOS;
      let pool = all;
      if (ranked) {
        const tg = run.levelTarget();
        for (let r = 1; r <= 9; r++) { pool = all.filter(s => Math.abs((s.level || s.tier * 3) - tg) <= r); if (pool.length >= 3) break; }
      }
      const fresh = pool.filter(s => !run.recent.includes(s.id));
      if (fresh.length) pool = fresh;
      return pool[Math.floor(rng() * pool.length) % pool.length];
    }
    // choose + prepare the next scenario (does not touch the world). main.js uses .lo/.fog to create the world.
    run.next = () => { run.pr = prepare(pick(), run.difficulty(), run.skin); run.recent.push(run.pr.sc.id); if (run.recent.length > 4) run.recent.shift(); return run.pr; };

    function enter(w) {
      run.dummies = apply(w, run.pr);
      run.st = { last: {}, kills: [], casts: {}, blasts: [], towers: [], died: false };   // objective bookkeeping (v4), filled by attach() listeners
      run.result = null; run.caught = false; run.t0 = w.t;
      run.phase = run.countdown > 0 ? 'countdown' : 'play'; run.cd = run.countdown;
      w.paused = run.phase !== 'play';
      w.emit('scnStart', { id: run.pr.sc.id, n: run.n, diff: run.pr.df.id });
    }

    run.frozen = () => run.phase !== 'play';
    run.attach = (w, onSwap) => {
      run.w = w; w.ranked = run; run.onSwap = onSwap || null;
      if (!run.pr) run.next();
      const isFoeId = id => { const e = w.get(id); return !!e && run.dummies.includes(e); };
      const st = () => run.st || (run.st = { last: {}, kills: [], casts: {}, blasts: [], towers: [], died: false });
      // how each foe was last hurt (registered before the dummy-kill listener below so 'kill' sees it)
      w.on('damage', p => {
        if (run.phase !== 'play' || !isFoeId(p.target)) return;
        const h = w.hero, f = w.get(p.target), s = w.get(p.src);
        st().last[p.target] = { ability: p.ability || 'attack', by: s ? s.kind : 'other', heroElev: w.map.elevAt(h.x, h.y), foeElev: w.map.elevAt(f.x, f.y), inv: !!IT.Status.invisible(h), t: w.t };
      });
      w.on('kill', p => { if (run.phase === 'play' && isFoeId(p.unit)) st().kills.push(Object.assign({ id: p.unit }, st().last[p.unit] || {})); });
      w.on('cast', p => {
        if (p.unit !== w.hero.id || run.phase !== 'play') return;
        const s = st(); s.casts[p.ability] = (s.casts[p.ability] || 0) + 1;
        if (p.ability === 'deafeningblast') s.blasts.push(new Set());
      });
      w.on('status', p => {   // Deafening Blast disarms every unit it pushes: count the foes one blast moved
        if (p.status !== 'disarm' || p.ability !== 'deafeningblast' || !isFoeId(p.target)) return;
        const b = st().blasts; if (b.length) b[b.length - 1].add(p.target);
      });
      w.on('towerDown', p => { if (run.phase === 'play') st().towers.push({ team: p.team, tier: p.tier }); });
      w.on('heroDown', () => { if (run.phase === 'play') st().died = true; });
      w.on('damage', p => {   // dummies die below the refill threshold so they never refill
        if (run.phase !== 'play') return;
        const d = w.get(p.target);
        if (!d || d.kind !== 'dummy' || !run.dummies.includes(d)) return;
        if (d.hp <= 0 || d.hp < d.maxHp * ((IT.GAME.DUMMY && IT.GAME.DUMMY.refillBelow) || 0.25)) { d.killed = true; w.emit('kill', { unit: d.id }); w.remove(d); }
      });
      enter(w);
      return run;
    };

    function conclude(ok, reason) {
      const w = run.w, pr = run.pr, time = w.t - run.t0;
      let pts = 0;
      if (ok) {
        run.solved++; run.streak++; run.bestStreak = Math.max(run.bestStreak, run.streak);
        if (ranked) pts = scenarioScore(pr.df.mult, pr.par, time, run.streak - 1);
        run.score += pts;
        w.emit('comboDone', { id: pr.sc.id, tier: TIER_NAME[pr.sc.tier - 1] || 'basic', score: pts, time });
      } else {
        run.failed++; run.streak = 0;
        w.emit('comboFail', { id: pr.sc.id, reason });
      }
      run.result = { ok, reason: reason || null, points: pts, time };
      run.phase = 'result'; run.hold = RESULT_HOLD; w.paused = true;
      w.emit('scnResult', { id: pr.sc.id, ok, reason: reason || null, points: pts, time });
    }

    // does one recorded kill satisfy an objective's "how" spec? { ability:[ids], by:'hero'|'spirit', low:true (hero below the foe), high:true, inv:true (hero invisible) }
    const howOk = (k, how) => {
      if (!how) return true;
      if (how.ability && how.ability.indexOf(k.ability) < 0) return false;
      if (how.by && k.by !== how.by) return false;
      if (how.low && !(k.heroElev < k.foeElev)) return false;
      if (how.high && !(k.heroElev > k.foeElev)) return false;
      if (how.inv && !k.inv) return false;
      return true;
    };
    run.howOk = howOk;
    // kills of one cast: same ability, within 'span' seconds of each other, >= n of them
    const burst = (kills, n, span) => {
      const by = {};
      for (const k of kills) (by[k.ability] = by[k.ability] || []).push(k.t);
      return Object.keys(by).some(a => { const t = by[a].sort((x, y) => x - y); for (let i = 0; i + n - 1 < t.length; i++) if (t[i + n - 1] - t[i] <= span) return true; return false; });
    };
    run.burst = burst;

    function check(w) {
      const pr = run.pr, sc = pr.sc, o = sc.obj, h = w.hero, el = w.t - run.t0, st = run.st;
      const alive = run.dummies.filter(d => !d.dead), fail = sc.fail || [];
      // fail conditions first (a lethal mistake beats a simultaneous win)
      if (fail.indexOf('died') >= 0 && st.died) return conclude(false, 'died');
      if (fail.indexOf('cross') >= 0 && w.gate) for (const d of alive) if (Math.hypot(d.x - w.gate.x, d.y - w.gate.y) < w.gate.r) return conclude(false, 'cross');
      if (fail.indexOf('seen') >= 0) for (const d of alive) if (d.kind === 'enemy' && d.aware && d.lastHit < -50) return conclude(false, 'seen');
      if (o.how && st.kills.some(k => !howOk(k, o.how))) return conclude(false, 'method');
      if (o.type === 'kill' || o.type === 'kill_with') { if (!alive.length) return conclude(true); }
      else if (o.type === 'killN') {
        if (o.one ? burst(st.kills, o.n, o.span || 1.2) : st.kills.length >= o.n) return conclude(true);
      }
      else if (o.type === 'push') { if (st.blasts.some(b => b.size >= o.n)) return conclude(true); }
      else if (o.type === 'destroyTower') { if (st.towers.some(t => t.team === (o.team == null ? 1 : o.team))) return conclude(true); }
      else if (o.type === 'rootAll') { if (alive.length && alive.every(d => IT.Status.has(d, 'root') || IT.Status.has(d, 'atosRoot'))) return conclude(true); }
      else if (o.type === 'escape') {
        for (const d of alive) if (Math.hypot(d.x - h.x, d.y - h.y) < CAUGHT) return conclude(false, 'caught');
        if (el >= o.time) return conclude(true);
        return;
      }
      else if (o.type === 'hold') { if (el >= o.time) return conclude(true); return; }
      for (const d of alive) if ((d.scn.mot === 'flee' || fail.indexOf('escaped') >= 0) && Math.hypot(d.x - h.x, d.y - h.y) > ESCAPED) return conclude(false, 'escaped');
      if (mode !== 'sandbox' && el >= pr.limit) return conclude(false, 'time');
    }

    // scripted dummies: flee (run directly away from the hero) / chase (run at the hero; lose it while it is invisible)
    function script(w) {
      const h = w.hero, ghost = IT.Status.has(h, 'ghost');
      for (const d of run.dummies) {
        if (d.dead || (d.scn.mot !== 'flee' && d.scn.mot !== 'chase' && d.scn.mot !== 'march') || w.t < d.scn.next || !IT.Status.canMove(d)) continue;
        d.scn.next = w.t + 0.35;
        if (d.scn.mot === 'march') { if (w.gate) IT.Orders.issue(w, d, { type: 'move', x: w.gate.x, y: w.gate.y }); }   // walks to the line it must not cross
        else if (d.scn.mot === 'flee') {
          const a = Math.atan2(d.y - h.y, d.x - h.x);
          let x = d.x + Math.cos(a) * 900, y = d.y + Math.sin(a) * 900;
          if (!w.map.walkable(x, y)) {   // wall ahead: slide sideways
            const p = IT.Nav.nearestWalkable(w.map, x, y); if (p) { x = p.x; y = p.y; }
          }
          IT.Orders.issue(w, d, { type: 'move', x, y });
        } else {
          const gap = Math.hypot(d.x - h.x, d.y - h.y);
          if (ghost && gap > 170) {   // invisible: it only walks to where it last saw you
            if (!d.scn.lastSeen) d.scn.lastSeen = { x: h.x, y: h.y };
            if (Math.hypot(d.x - d.scn.lastSeen.x, d.y - d.scn.lastSeen.y) > 40) IT.Orders.issue(w, d, { type: 'move', x: d.scn.lastSeen.x, y: d.scn.lastSeen.y });
            else IT.Orders.issue(w, d, { type: 'stop' });
          } else { d.scn.lastSeen = null; IT.Orders.issue(w, d, { type: 'move', x: h.x, y: h.y }); }
        }
      }
    }

    function finish(reason) {
      if (run.ended) return run.summary;
      run.ended = true;
      const w = run.w;
      if (w) w.paused = true;
      const sum = { mode, combos: run.solved, solved: run.solved, fails: run.failed, bestStreak: run.bestStreak, score: ranked ? run.score : 0, reason: reason || 'time' };
      if (ranked && (run.n > 0 || run.solved + run.failed > 0)) sum.rank = record(run.score);
      run.summary = sum;
      if (w) w.emit('modeEnd', sum);
      return sum;
    }
    run.finish = finish;

    function nextScenario() {
      const w = run.w;
      run.n++;
      if (run.turns != null && run.n >= run.turns) { finish('turns'); return; }   // ranked: fixed number of scenarios
      run.next();
      enter(w);
      if (run.onSwap) run.onSwap(run);
    }

    run.redo = () => { if (run.w && !run.ended) { enter(run.w); if (run.onSwap) run.onSwap(run); } };   // replay the current scenario

    function go() { const w = run.w; run.cd = 0; run.phase = 'play'; run.t0 = w.t; w.paused = false; w.emit('scnGo', {}); }
    // skip the pre-scenario countdown (any action key / Start button); false if not counting down
    run.skip = () => { if (run.ended || !run.w || run.phase !== 'countdown') return false; go(); return true; };

    // advance by dt seconds. Frozen phases come from main.js (real dt), play comes from the sim system (w.dt)
    run.tick = dt => {
      if (run.ended || !run.w) return;
      const w = run.w;
      if (run.runLeft != null && run.phase !== 'idle') {
        run.runLeft -= dt;
        if (run.runLeft <= 0) { run.runLeft = 0; finish('time'); return; }
      }
      if (run.phase === 'countdown') { run.cd -= dt; if (run.cd <= 0) go(); }
      else if (run.phase === 'result') { run.hold -= dt; if (run.hold <= 0) nextScenario(); }
      else if (run.phase === 'play') { script(w); check(w); }
    };
    return run;
  }

  // the sim drives the play phase
  IT.World.system('ranked', 95, (w, dt) => { const r = w.ranked; if (r && !r.ended && r.phase === 'play') r.tick(dt); });

  // HUD feed. null when the world has no scenario run.
  function hud(w) {
    const r = w && w.ranked;
    if (!r || !r.pr) return null;
    const pr = r.pr, el = r.phase === 'play' ? w.t - r.t0 : 0, sol = pr.sc.sol || [];
    return {
      phase: r.phase === 'idle' ? 'countdown' : r.phase,
      countdown: r.phase === 'countdown' ? Math.max(1, Math.ceil(r.cd - 1e-9)) : 0,
      timeLeft: r.mode === 'sandbox' ? null : Math.max(0, pr.limit - el),
      runLeft: r.runLeft, turn: r.turns != null ? Math.min(r.turns, r.n + 1) : null, turns: r.turns,
      score: r.ranked ? r.score : null,
      scenario: loc(pr.sc.name), objective: loc(pr.sc.goal),
      // extras
      mode: r.mode, id: pr.sc.id, n: r.n, solved: r.solved, failed: r.failed, streak: r.streak, bestStreak: r.bestStreak,
      diff: pr.df.id, diffDesc: loc(pr.df.desc), hints: !!pr.df.hints, tip: loc(pr.sc.tip), spells: sol.filter(s => IT.GAME.SPELL_ORBS[s.a]).map(s => s.a),
      result: r.result,
    };
  }

  IT.Ranked = {
    RUN_SECONDS, TURNS, COUNTDOWN, PRACTICE_COUNTDOWN, RESULT_HOLD,
    streakMult, scenarioScore, expected, ratingDelta, baseDiff, rampDiff, rankKey,
    profile, record, reset, load, prepare, apply, create, hud, spot,
  };
})(typeof window !== 'undefined' ? window : globalThis);
