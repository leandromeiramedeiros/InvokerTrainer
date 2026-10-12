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
    const esc = sc.obj.type === 'escape';
    return { sc, df, lo, fog: sc.fog != null ? !!sc.fog : !!df.fog, par: sc.par, limit: esc ? sc.obj.time : Math.ceil(sc.par * df.timer + SLACK), skin: lo.skin };
  }

  // tier dummy behaviour -> enemy NPC behaviour ('evasive' foes wander and dodge ground danger on foot)
  const ENEMY_BEHAVIOR = { stationary: 'stationary', wander: 'wander', evasive: 'wander' };

  // spawn point of a dummy def (walkable)
  function place(w, d) {
    const sp = w.map.spawns.hero;
    let x = sp.x + d.dx, y = sp.y + d.dy;
    if (!w.map.walkable(x, y) && IT.Nav && IT.Nav.nearestWalkable) { const p = IT.Nav.nearestWalkable(w.map, x, y); if (p) { x = p.x; y = p.y; } }
    return { x, y };
  }

  // swap the world over to a prepared scenario, in place (hero kept, everything else removed)
  function apply(w, pr) {
    const hero = w.hero, df = pr.df, sc = pr.sc;
    const nm = IT.Maps && IT.Maps.get ? IT.Maps.get(sc.map || 'grounds') : null;   // scenario map (default: the Training Grounds)
    const swapped = !!nm && nm !== w.map;
    if (swapped) w.map = nm;
    const sp = w.map.spawns.hero;
    for (const e of w.ents) if (e !== hero && !e.dead) w.remove(e);
    w.ents = w.ents.filter(e => !e.dead);
    for (const [id, e] of w.byId) if (e.dead) w.byId.delete(id);
    if (swapped) w.emit('mapChange', { map: nm.id });
    if (IT.Towers && IT.Towers.spawnAll && w.map.towers && w.map.towers.length) IT.Towers.spawnAll(w, w.map);
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
    const out = [], E = IT.GAME.ENEMY, SK = IT.GAME.SKINS, s0 = Math.max(0, SK.indexOf(pr.skin));
    sc.dummies.forEach((d, i) => {
      const p = place(w, d), mot = d.mot;
      const items = d.items || (df.useBkb || d.useBkb ? ['bkb'] : undefined);
      const skin = SK[(s0 + i) % SK.length], lap = Math.floor(i / SK.length);   // every foe wears a different NPC hero skin + name
      // real enemy NPC: hp = the damage the scenario needs to kill it (d.hp = start fraction on the old 25% kill line) x tier hpMul; dies at 0 hp
      const need = d.hp != null && d.hp < 1 ? Math.max(0.05, d.hp - 0.25) : 0.75;
      const hp = Math.round(Math.max(100, need * E.hp * (df.hpMul != null ? df.hpMul : 1)));
      const e = IT.Units.spawnEnemy(w, {
        x: p.x, y: p.y, skin, name: IT.GAME.SKIN_NAMES[skin] + (lap ? ' ' + (lap + 1) : ''), hp, armor: E.armor + (df.armorAdd || 0),
        behavior: d.behavior || (mot ? 'stationary' : ENEMY_BEHAVIOR[df.behavior] || 'stationary'),
        scenario: { stunBolt: df.stunBolt, dummyEscape: mot ? 'none' : df.escape, blinkAfter: df.blinkAfter },
        useBkb: !!(df.useBkb || d.useBkb), items,
        telegraph: df.telegraph, awareness: d.aware != null ? d.aware : df.awareness, reaction: mot === 'still' ? 99 : df.reaction,
        dmgMul: df.dmgMul, fights: !!df.fights && mot !== 'flee',
      });
      e.hpRegen = 0; e.base.hpRegen = 0;
      if (mot === 'flee' || mot === 'chase') { const ms = mot === 'flee' ? 330 * df.flee : 380 * df.chase; e.ms = ms; e.base.ms = ms; }
      e.scn = { mot: mot || null, next: 0, lastSeen: null };
      out.push(e);
    });
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

    function pick() {
      if (fixed) return fixed;
      const all = IT.SCENARIOS, di = run.diffIndex();
      let pool = ranked ? all.filter(s => s.tier <= Math.min(3, 1 + di)) : all;
      const fresh = pool.filter(s => !run.recent.includes(s.id));
      if (fresh.length) pool = fresh;
      return pool[Math.floor(rng() * pool.length) % pool.length];
    }
    // choose + prepare the next scenario (does not touch the world). main.js uses .lo/.fog to create the world.
    run.next = () => { run.pr = prepare(pick(), run.difficulty(), run.skin); run.recent.push(run.pr.sc.id); if (run.recent.length > 4) run.recent.shift(); return run.pr; };

    function enter(w) {
      run.dummies = apply(w, run.pr);
      run.result = null; run.caught = false; run.died = false; run.t0 = w.t;
      run.phase = run.countdown > 0 ? 'countdown' : 'play'; run.cd = run.countdown;
      w.paused = run.phase !== 'play';
      w.emit('scnStart', { id: run.pr.sc.id, n: run.n, diff: run.pr.df.id });
    }

    run.frozen = () => run.phase !== 'play';
    run.attach = (w, onSwap) => {
      run.w = w; w.ranked = run; run.onSwap = onSwap || null;
      if (!run.pr) run.next();
      w.on('heroDown', () => { if (run.phase === 'play') run.died = true; });   // foes hit back now: the hero can fall
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

    function check(w) {
      const pr = run.pr, o = pr.sc.obj, h = w.hero, el = w.t - run.t0;
      const alive = run.dummies.filter(d => !d.dead);
      if (run.died) return conclude(false, 'died');
      if (o.type === 'kill') { if (!alive.length) return conclude(true); }
      else if (o.type === 'rootAll') { if (alive.length && alive.every(d => IT.Status.has(d, 'root') || IT.Status.has(d, 'atosRoot'))) return conclude(true); }
      else if (o.type === 'escape') {
        for (const d of alive) if (Math.hypot(d.x - h.x, d.y - h.y) < CAUGHT) return conclude(false, 'caught');
        if (el >= o.time) return conclude(true);
        return;
      }
      for (const d of alive) if (d.scn.mot === 'flee' && Math.hypot(d.x - h.x, d.y - h.y) > ESCAPED) return conclude(false, 'escaped');
      if (mode !== 'sandbox' && el >= pr.limit) return conclude(false, 'time');
    }

    // scripted dummies: flee (run directly away from the hero) / chase (run at the hero; lose it while it is invisible)
    function script(w) {
      const h = w.hero, ghost = IT.Status.has(h, 'ghost');
      for (const d of run.dummies) {
        if (d.dead || (d.scn.mot !== 'flee' && d.scn.mot !== 'chase') || w.t < d.scn.next || !IT.Status.canMove(d)) continue;
        if (d.orders[0] && d.orders[0].type === 'attack') continue;   // a chaser that has reached the hero is busy hitting it
        d.scn.next = w.t + 0.35;
        if (d.scn.mot === 'flee') {
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
    profile, record, reset, load, prepare, apply, create, hud,
  };
})(typeof window !== 'undefined' ? window : globalThis);
