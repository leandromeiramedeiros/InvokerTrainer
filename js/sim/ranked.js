// Ranked / Combo Practice / scenario sandbox: scoring, rating, run state machine, scenario swap + objectives. Owner: S3.
// Pure (no DOM). Persistent rating lives in localStorage 'it2.rank' (guarded; in-memory fallback).
// Flow of a scenario run: countdown (world frozen; v6 item 13: the 12 s intro = briefing + camera tour) -> play (sim time) -> result (frozen) -> next scenario.
// main.js drives tick(realDt) while frozen; the 'ranked' sim system drives it per step while playing.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const KEY = 'it2.rank', IKEY = 'it2.inf';
  // playtest 2: the result card holds >= RESULT_MIN s, then any key / click continues (run.cont), else it auto-continues RESULT_AUTO s later
  const RESULT_MIN = 1.0, RESULT_AUTO = 3.0;
  const TURNS = 8, COUNTDOWN = 12, SOLO_COUNTDOWN = 3, RESULT_HOLD = RESULT_MIN + RESULT_AUTO, SLACK = 6, CAUGHT = 110, ESCAPED = 1900, HIST = 40, ASSIST = 0.5;
  // v6: tags of the "fun" scenarios (fog, invisibility, river, prediction, vision); a ranked run gives at least FUN_TURNS of its turns to them
  const FUN_TAGS = ['fog', 'invisible', 'river', 'prediction', 'vision', 'juke', 'fun'], FUN_TURNS = 4;   // v6 item 28: 'fun' = the research-driven set
  const isFun = sc => (sc.tags || []).some(t => FUN_TAGS.indexOf(t) >= 0);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lang = () => IT.lang || 'en';
  const loc = o => (o && typeof o === 'object' ? o[lang()] || o.en : o);
  const TIER_NAME = ['basic', 'intermediate', 'advanced'];
  const INF_MIN_LEVEL = 6, INF_COUNTDOWN = 5;   // infinite run: the hard end of the scenario pool, bambam, 5 s countdown
  const maxDelta = () => (IT.Ranks && IT.Ranks.MAX_DELTA) || 150;

  // ---------------------------------------------------------------- pure math
  const streakMult = s => Math.min(2, 1 + 0.1 * Math.max(0, s | 0));
  // v6 medal: the CLEAR part of a run's score. Points for one solved scenario: 100 x speed (par or faster = +50%) x streak x difficulty bonus.
  // The bonus is normalized (diffBonus: ian x1 .. bambam x1.3), NOT df.mult (0.6..1.8): a clean clear is worth the same base at any
  // difficulty, so bulkier foes / a harder ramp add at most +30 %. A number > DIFF_BONUS_MAX passed in (old callers: df.mult) is capped.
  const DIFF_BONUS_MAX = 1.3;
  const diffBonus = df => 1 + (DIFF_BONUS_MAX - 1) * clamp((df && df.idx != null ? df.idx : 2) / 4, 0, 1);
  function scenarioScore(bonus, par, time, streak) {
    const f = clamp((2 * par - time) / par, 0, 1);
    return Math.round(100 * clamp(bonus, 1, DIFF_BONUS_MAX) * (1 + 0.5 * f) * streakMult(streak));
  }
  const expected = rating => 350 + 0.45 * Math.max(0, rating);
  function ratingDelta(score, rating) {
    const e = expected(rating), M = maxDelta();
    return clamp(Math.round(M * Math.tanh((score - e) / (0.5 * e + 200))), -M, M);
  }
  // difficulty index (0..4) for the n-th scenario of a ranked run: starts by rating, then +1 every 3 scenarios
  const baseDiff = rating => (rating < 800 ? 0 : rating < 2000 ? 1 : rating < 3500 ? 2 : 3);
  const rampDiff = (rating, n) => Math.min(4, baseDiff(rating) + Math.floor(n / 3));
  // #77 (review I1): the ramp never sends a level >= TOP_LVL scenario above hard (bambam x L9-10 was the top band's curve break), and a
  // scenario's own `maxDf` (tier id) caps it further (the ones a frame-perfect bot cannot clear above it yet). Ranked only: a chosen tier is kept.
  const TOP_LVL = 9, TOP_CAP = 3, PICK_R0 = 1;   // PICK_R0: #77 I2 ranked pick window (+- levels)
  const capDiff = (i, sc) => {
    if (!sc) return i;
    if ((sc.level || 0) >= TOP_LVL) i = Math.min(i, TOP_CAP);
    if (sc.maxDf && IT.DIFFICULTY) i = Math.min(i, IT.DIFFICULTY.get(sc.maxDf).idx);
    return i;
  };
  // #77 (review I6): time limit = par x tier timer + the tier's own slack (df.slack: ian 6 .. hard / bambam 1; SLACK when a tier has none);
  // a fixed sc.limit wins. Tuned on the levels bot: median clear ~40% of the limit at hard, ~47% at bambam, every clear <= 80%.
  const limitOf = (sc, df) => (sc.limit != null ? sc.limit : Math.ceil(sc.par * df.timer + (df.slack != null ? df.slack : SLACK)));
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

  // ---------------------------------------------------------------- infinite run: best-ever (own key, same guarded storage)
  let imem = null;
  const iblank = () => ({ best: 0, games: 0, last: 0 });
  function infiniteProfile() {
    try { const s = G.localStorage && G.localStorage.getItem(IKEY); if (s) return Object.assign(iblank(), JSON.parse(s)); } catch (e) { /* fall through */ }
    return imem ? Object.assign(iblank(), imem) : iblank();
  }
  // pure: previous best + this run's cleared count -> { cleared, prev, best, isNew }
  function infiniteResult(prev, cleared) {
    const p = Math.max(0, prev | 0), n = Math.max(0, cleared | 0);
    return { cleared: n, prev: p, best: Math.max(p, n), isNew: n > p };
  }
  function recordInfinite(cleared) {
    const p = infiniteProfile(), r = infiniteResult(p.best, cleared);
    p.best = r.best; p.games = (p.games | 0) + 1; p.last = r.cleared;
    imem = p;
    try { G.localStorage && G.localStorage.setItem(IKEY, JSON.stringify(p)); } catch (e) { /* in-memory only */ }
    return r;
  }
  function resetInfinite() { imem = null; try { G.localStorage && G.localStorage.removeItem(IKEY); } catch (e) { /* ignore */ } }
  // infinite difficulty: bambam, hardening every full pass over the pool (lap): bulkier + harder-hitting foes, quicker reactions, tighter timer
  function infDifficulty(base, lap) {
    if (!(lap > 0)) return base;
    return Object.assign({}, base, {
      hpMul: base.hpMul * (1 + 0.12 * lap), dmgMul: base.dmgMul * (1 + 0.1 * lap), reaction: Math.max(0.1, base.reaction * Math.pow(0.9, lap)),
      timer: Math.max(0.45, base.timer * Math.pow(0.95, lap)), mult: base.mult * (1 + 0.15 * lap),
    });
  }

  // ---------------------------------------------------------------- scenario preparation (pure)
  // sc + difficulty -> { sc, df, lo, fog, par, limit, skin, hp (per-foe hp of kill scenarios, or null), need (step abilities that must hit) }
  // v6: no pre-invoked spells (the countdown is for invoking), fog of war always on, kill-scenario foe hp derived from the steps (foeHp).
  // v6 item 11: `lvl` = the hero level of this play (rollLevel: the scenario's base level +-1, feasibility-clamped); omitted = the base level
  function prepare(sc, df, skin, lvl, vrng) {
    const lo = loadoutAt(sc, df, lvl != null ? lvl : baseLevel(sc), skin);
    const esc = sc.obj.type === 'escape' || sc.obj.type === 'hold';
    const limit = esc ? sc.obj.time : limitOf(sc, df);
    const kill = !!KILL_TYPES[sc.obj.type];
    const pr = { sc, df, lo, fog: true, par: sc.par, limit, skin: lo.skin, twist: null, hp: kill ? foeHp(sc, df, lo) : null, need: kill || survive(sc) ? needOf(sc) : [], vary: null };
    if (vrng) pr.vary = variation(sc, df, pr, lo.heroLevel, vrng);   // v6 item 40: per-play variation (seeded by the run)
    return pr;
  }
  // the scenario loadout at hero level L: IT.RULES.autoLoadout(L, style) (real point / orb-gate rules), the tier's orb cut, scepter / shard / items
  function loadoutAt(sc, df, L, skin) {
    const H = sc.hero || {}, base = IT.RULES.autoLoadout(L, H.style || 'qe'), cut = df.orbCut || 0;
    const orbs = {};
    for (const k of IT.RULES.orbs) orbs[k] = base.orbs[k] > 0 ? Math.max(1, base.orbs[k] - cut) : 0;
    return IT.Loadout.normalize({
      heroLevel: base.heroLevel, orbs, talents: base.talents, scepter: !!H.scepter, scepterOrb: H.scepter || null,
      shard: !!H.shard, shardSpell: H.shard || null, items: (H.items || []).slice(), skin: skin || IT.GAME.SKINS[0], preset: df.preset, mode: 'free',
    });
  }

  // ---------------------------------------------------------------- v6 item 11: hero level per scenario (see DECISIONS.md "v6 item 11")
  // sc.hero.lvl = the story's base level (laning 6-10, mid game 12-18, late 20-25, legacy / level-30 sets stay high). Each play rolls
  // base +-1 (run.lvRng: seeded by the run seed -> reproducible in ranked; a seedless sandbox run is random), then the roll must be
  // feasible (feasible()): every step spell invokable (its orbs >= 1), max mana >= the whole combo's mana (KV manaCost at those orb
  // levels + item costs), cooldowns within the limit (a spell / item reused before a Refresher: (uses - 1) x cd; invokes beyond the 2
  // countdown slots: (distinct spells - 2) x Invoke cd), and destroyTower keeps its towerMath window. Infeasible -> the nearest feasible
  // level within +-LVL_SEARCH of the roll (ties go up), else the base level.
  const LVL_MIN = 1, LVL_MAX = 30, LVL_SPREAD = 1, LVL_SEARCH = 3, ORB_KEY = { Q: 'quas', W: 'wex', E: 'exort' };
  const baseLevel = sc => clamp(Math.round((sc.hero && sc.hero.lvl) || 25), LVL_MIN, LVL_MAX);
  function feasible(sc, df, L) {
    const lo = loadoutAt(sc, df, L), ctx = IT.Loadout.ctx(lo), V = IT.Values, steps = (sc.steps || []).filter(s => !NO_NEED[s.a]);
    const isSpell = a => !!IT.GAME.SPELL_ORBS[a];
    for (const s of steps) if (isSpell(s.a) && IT.GAME.SPELL_ORBS[s.a].split('').some(c => !(lo.orbs[ORB_KEY[c]] > 0))) return { ok: false, why: 'orbs', a: s.a };
    const GD = IT.GAME.SPELL_DOTA, cost = a => num(isSpell(a) ? V.manaCost(GD[a], ctx) : (() => { try { return V.item(IT.GAME.ITEM_DOTA[a], 'manaCost'); } catch (e) { return 0; } })());
    const cdOf = a => num(isSpell(a) ? V.cooldown(GD[a], ctx) : (() => { try { return V.item(IT.GAME.ITEM_DOTA[a], 'cooldown'); } catch (e) { return 0; } })());
    const mana = steps.reduce((t, s) => t + cost(s.a), 0), maxMana = IT.Hero.maxMana(ctx);
    if (mana > maxMana) return { ok: false, why: 'mana', mana, maxMana };
    const esc = sc.obj.type === 'escape' || sc.obj.type === 'hold';
    const limit = esc ? sc.obj.time : limitOf(sc, df);
    let use = {}, cdNeed = 0;
    for (const s of steps) {
      if (s.a === 'refresher') { use = {}; continue; }
      use[s.a] = (use[s.a] || 0) + 1;
      if (use[s.a] > 1) cdNeed = Math.max(cdNeed, (use[s.a] - 1) * cdOf(s.a));
    }
    const distinct = steps.map(s => s.a).filter((a, i, l) => isSpell(a) && l.indexOf(a) === i).length;
    const inv = Math.max(0, distinct - 2) * num(V.invokeCooldown(ctx));
    if (cdNeed > limit || inv > limit) return { ok: false, why: 'cd', cdNeed, inv, limit };
    if (sc.obj.type === 'destroyTower' && IT.Towers) {   // towers.js not loaded (headless tests): skip the tower window check
      const t = towerMath(sc, df, lo);
      if (!(t.tCombo * 1.25 <= t.limit && t.limit < t.tAttack && (t.tHammer == null || t.limit < t.tHammer))) return { ok: false, why: 'tower', t };
    }
    return { ok: true, mana, maxMana };
  }
  // -> { lvl (the level to play), rolled (base +-1 before the check), base, clamped }
  function rollLevel(sc, df, rng) {
    const base = baseLevel(sc), r = rng ? Math.floor(rng() * (2 * LVL_SPREAD + 1)) % (2 * LVL_SPREAD + 1) - LVL_SPREAD : 0;
    const rolled = clamp(base + r, LVL_MIN, LVL_MAX);
    for (let d = 0; d <= LVL_SEARCH; d++) for (const L of d ? [rolled + d, rolled - d] : [rolled]) {
      if (L >= LVL_MIN && L <= LVL_MAX && feasible(sc, df, L).ok) return { lvl: L, rolled, base, clamped: L !== rolled };
    }
    return { lvl: base, rolled, base, clamped: base !== rolled };
  }

  // ---------------------------------------------------------------- v6: foe hp from the scenario's own combo (pure, IT.Values with the scenario loadout ctx)
  // Every damaging step is credited at its full KV value (effective: x armor for physical, x (1 - ENEMY.magicRes) for magical):
  //   Chaos Meteor = impacts on a still target ((r + hull) / (speed x interval) + 1) x main_damage + burn_dps x burn_duration;
  //   Sun Strike = damage (pure; a 'mid' strike is split over the foes, Cataclysm = count x pct x damage on each); Deafening Blast = damage;
  //   Tornado = base + quas + wex damage; Cold Snap = freeze_damage x SNAP_PROCS; EMP = min(mana_burned, foe mana) x damage_per_mana_pct;
  //   Ice Wall = 0 (a zone the foe may never touch); Forge Spirits = count x spirit dps x ATTACK_WINDOW; an 'attack' step = hero dps (+ Alacrity when the
  //   steps cast it) x ATTACK_WINDOW; Gleipnir / Meteor Hammer = their KV unit damage. Steps at d0/lead credit foe 0, d1 foe 1, mid (and
  //   Cataclysm) every foe. foe hp = min(HP_CAP, HP_SHARE x tier hpMul) x credited damage: the whole combo is needed, with ~10% slack for a
  //   sloppy hit (playtest 2: 0.85 -> 0.9; bot sweep: any fraction > 0.9 of the credited damage breaks scripted clears, see DECISIONS.md).
  const KILL_TYPES = { kill: 1, kill_with: 1, killN: 1 }, TOWER_HULL = 72;   // towers.js RADIUS
  const HP_SHARE = 0.9, HP_CAP = 0.9, ATTACK_WINDOW = 4, SNAP_PROCS = 3, IN_FLIGHT = 2;
  const NO_NEED = { move: 1, attack: 1 };
  // units.js DISABLES minus Tornado: a lifted foe cannot act, so its BKB comes only after the drop, when the steps timed to the landing already hit
  const BKB_DISABLES = { coldsnap: 1, atos: 1, vyse: 1, orchid: 1, gleipnir: 1, meteorhammer: 1 };
  // step abilities that cannot hit a foe: they count once the hero casts them (Ice Wall is a zone in front of the hero: a slow / block, not a hit)
  const SELF_OK = { ghostwalk: 1, alacrity: 1, blink: 1, refresher: 1, forcestaff: 1, bkb: 1, boots: 1, travels: 1, icewall: 1 };
  const needOf = sc => (sc.steps || []).map(s => s.a).filter((a, i, l) => !NO_NEED[a] && l.indexOf(a) === i);
  // #30: a timed escape (no `unseen` streak) also needs its recipe: chasers at ian-common (<= 307 u/s from 1100+ u) never reach a hero
  // walking straight away (Invoker 280) inside 12-14 s, so plain walking cleared ghost_escape / pinned_escape / smoke_gank_escape ...
  const survive = sc => sc.obj.type === 'escape' && !sc.obj.unseen;
  const SPELL_DOTA = { coldsnap: 'invoker_cold_snap', icewall: 'invoker_ice_wall', emp: 'invoker_emp', tornado: 'invoker_tornado', alacrity: 'invoker_alacrity',
    sunstrike: 'invoker_sun_strike', forgespirit: 'invoker_forge_spirit', chaosmeteor: 'invoker_chaos_meteor', deafeningblast: 'invoker_deafening_blast' };
  const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);
  // hero / Forge Spirit physical attack dps against `armor` (KV hero + unit tables; Alacrity optional)
  function attackDps(ctx, armor, ala) {
    const V = IT.Values, hd = IT.DOTA.hero, at = IT.Hero.attrs(ctx), g = k => num(V.get('invoker_alacrity', k, ctx)), m = IT.Combat.armorMult(armor);
    const as = ((hd.BaseAttackSpeed || 100) + at.agi + (ala ? g('bonus_attack_speed') : 0)) / 100;
    const hero = ((hd.AttackDamageMin + hd.AttackDamageMax) / 2 + at.int + (ala ? g('bonus_damage') : 0)) * m * as / hd.AttackRate;
    const f = k => num(V.get('invoker_forge_spirit', k, ctx)), su = IT.DOTA.units.npc_dota_invoker_forged_spirit;
    const count = Math.max(1, Math.min(f('extra_spirit_count_quas'), f('extra_spirit_count_exort')));
    return { hero, spirit: f('spirit_damage') * m / (su.AttackRate || 1.5), count };
  }
  // -> { foes:[credited effective damage per foe], parts:[{ a, foes:[i], dmg (per foe) }] }
  function comboDamage(sc, df, lo) {
    const ctx = IT.Loadout.ctx(lo), V = IT.Values, E = IT.GAME.ENEMY, n = Math.max(1, (sc.units || []).length);
    const g = (k, key) => num(V.get(SPELL_DOTA[k], key, ctx));
    const gi = (id, key) => { try { return num(V.item(IT.GAME.ITEM_DOTA[id], key)); } catch (e) { return 0; } };
    const mres = 1 - (E.magicRes || 0), steps = sc.steps || [], all = [];
    for (let i = 0; i < n; i++) all.push(i);
    const cata = g('sunstrike', 'cataclysm_count'), A = attackDps(ctx, E.armor + (df.armorAdd || 0), steps.some(s => s.a === 'alacrity'));
    const parts = [], foes = all.map(() => 0);
    // #77 (review I3): a foe that carries a BKB (its own useBkb + 'bkb', or the tier BKB: df.useBkb, no own items, not a marcher) pops it
    // on the first DISABLE cast at it (units.js DISABLES -> defend), so it takes KV spell_reduce % less magic damage from every LATER step;
    // the disable step itself and anything before it land in full (trace: the pop beats a Meteor cast right after the disable). No disable in the steps = it never pops (full credit).
    const red = 1 - gi('bkb', 'spell_reduce') / 100, ulist = sc.units || [];
    const carries = u => { if (!u || (u.minDf && TIER_ORDER.indexOf(df.id) >= 0 && TIER_ORDER.indexOf(df.id) < TIER_ORDER.indexOf(u.minDf))) return false;
      const mot = IT.Intent && IT.Intent.engine ? IT.Intent.engine(IT.Intent.of(u).kind, u).mot : u.mot;
      const items = u.items || ((df.useBkb && mot !== 'march') || u.useBkb ? ['bkb'] : []);
      return items.indexOf('bkb') >= 0 && !u.bkbOn; };
    const bkb = all.map(i => (carries(ulist[i]) ? red : 1)), popped = all.map(() => false);
    for (const s of steps) {
      const a = s.a, to = s.at === 'd1' ? [Math.min(1, n - 1)] : s.at === 'mid' || (a === 'sunstrike' && s.at === 'self' && cata > 0) ? all : s.at === 'tower' ? [] : [0];
      const dis = BKB_DISABLES[a];
      let d = 0;
      if (a === 'sunstrike') d = s.at === 'self' ? (cata > 0 ? cata * g(a, 'damage') * g(a, 'cataclysm_damage_pct') / 100 : 0) : g(a, 'damage') / (s.at === 'mid' ? n : 1);
      else if (a === 'chaosmeteor') d = ((Math.floor((g(a, 'area_of_effect') + E.radius) / Math.max(1, g(a, 'travel_speed') * g(a, 'damage_interval'))) + 1) * g(a, 'main_damage') + g(a, 'burn_dps') * g(a, 'burn_duration')) * mres;
      else if (a === 'deafeningblast') d = g(a, 'damage') * mres;
      else if (a === 'tornado') d = (g(a, 'base_damage') + g(a, 'quas_damage') + g(a, 'wex_damage')) * mres;
      else if (a === 'coldsnap') d = g(a, 'freeze_damage') * Math.min(SNAP_PROCS, Math.floor(g(a, 'duration') / Math.max(0.1, g(a, 'freeze_cooldown'))) + 1) * mres;
      else if (a === 'emp') d = Math.min(g(a, 'mana_burned'), E.mana) * g(a, 'damage_per_mana_pct') / 100 * mres;
      else if (a === 'forgespirit') d = A.count * A.spirit * ATTACK_WINDOW;
      else if (a === 'attack') d = A.hero * ATTACK_WINDOW;
      else if (a === 'gleipnir') d = gi(a, 'damage') * mres;
      else if (a === 'meteorhammer') d = (gi(a, 'impact_damage_units') + gi(a, 'burn_dps_units') * gi(a, 'burn_duration')) * mres;
      const mag = a !== 'sunstrike' && a !== 'forgespirit' && a !== 'attack';
      if (d > 0 && to.length) {
        const eff = to.map(i => (mag && popped[i] ? d * bkb[i] : d));   // per foe in `to`, after its BKB
        parts.push({ a, foes: to, dmg: d, eff });
        to.forEach((i, k) => { foes[i] += eff[k]; });
      }
      if (dis) for (const i of to) popped[i] = true;
    }
    return { foes, parts };
  }
  // per-foe hp (null when the steps credit no damage at all: the old fixed formula applies)
  function foeHp(sc, df, lo) {
    const c = comboDamage(sc, df, lo), pos = c.foes.filter(v => v > 0);
    if (!pos.length) return null;
    const lo0 = Math.min.apply(null, pos), mul = df.hpMul != null ? df.hpMul : 1;
    const f = Math.min(HP_CAP, HP_SHARE * mul);
    return c.foes.map(v => Math.round(Math.max(100, (v > 0 ? v : lo0) * f)));
  }

  // ---------------------------------------------------------------- v6 item 40: per-play variation (see DECISIONS.md "v6 item 40")
  // Each play draws (run.varRng: seeded by the run seed -> reproducible in ranked, random in a seedless sandbox run) one posJit (extra +-u of
  // start-position jitter on top of rand.jit, the spot rules still hold), one hpMul (foe hp +-8%, clamped so the whole combo still kills and no
  // foe dies before its last damaging step), one reactionMul (+-5% enemy reaction) and, per foe, a boot item (chase / flee / march foes and
  // 'escape' behaviours: boots, travels from hero level 16 for the scripted movers; 'still' foes never). sc.vary overrides:
  // { posJit: [lo, hi] | n | 0, hp: frac | [lo, hi] (fractions, e.g. [-0.08, 0]), reaction: frac, boots: false | 'boots' | 'travels' }; a unit's own `boots` (false | id) wins.
  const VARY = { posJit: [80, 150], hp: 0.08, reaction: 0.05, travelsLvl: 16, floor: 1.02 };
  const MOVERS = { chase: 1, flee: 1, march: 1 }, RUNNERS = { escape: 1, disable_escape: 1 };
  function bootFor(sc, d, lvl) {
    const v = sc.vary || {};
    if (d.boots !== undefined) return d.boots || null;
    if (v.boots === false || d.mot === 'still') return null;
    if (v.boots) return v.boots;
    if (MOVERS[d.mot]) return lvl >= VARY.travelsLvl ? 'travels' : 'boots';
    return !d.mot && RUNNERS[d.behavior] ? 'boots' : null;
  }
  function variation(sc, df, pr, lvl, rng) {
    const v = sc.vary || {}, units = sc.units || sc.dummies || [];
    const pj = v.posJit != null ? v.posJit : VARY.posJit, hpF = v.hp != null ? v.hp : VARY.hp, rF = v.reaction != null ? v.reaction : VARY.reaction;
    const seed = Math.floor(rng() * 0x7fffffff), u1 = rng(), u2 = rng(), u3 = rng();
    const posJit = Array.isArray(pj) ? Math.round(pj[0] + (pj[1] - pj[0]) * u1) : pj;
    const hr = Array.isArray(hpF) ? hpF : [-hpF, hpF], hpMul = Math.round((1 + hr[0] + (hr[1] - hr[0]) * u2) * 1000) / 1000, reactionMul = Math.round((1 + (u3 * 2 - 1) * rF) * 1000) / 1000;
    let hp = null;
    if (pr.hp) {   // kill scenarios: hp x hpMul, never above HP_CAP x the credited damage (the steps must still kill), never below the credited damage minus the foe's last damaging part
      const c = comboDamage(sc, df, pr.lo), pos = c.foes.filter(x => x > 0), lo0 = Math.min.apply(null, pos);
      hp = pr.hp.map((b, i) => {
        const cred = c.foes[i] > 0 ? c.foes[i] : lo0;
        let last = 0; for (const q of c.parts) { const k = q.foes.indexOf(i); if (k >= 0) last = q.eff ? q.eff[k] : q.dmg; }
        const cap = Math.max(b, Math.round(Math.max(100, cred * HP_CAP))), floor = Math.min(b, Math.max(100, Math.round((cred - last) * VARY.floor)));
        return clamp(Math.round(b * hpMul), floor, cap);
      });
    }
    return { seed, posJit, hpMul, hp, reactionMul, boots: units.map(d => bootFor(sc, d, lvl)) };
  }

  // ---------------------------------------------------------------- v6: destroyTower timer math (pure; see DECISIONS.md "v6 WP1")
  // tAttack = walk into attack range + tower hp / (hero auto-attack dps x 0.5 reinforced, tower armor);
  // tCombo  = walk + cast points (+ channels) + the fight: (hero with Alacrity x 0.5 + Forge Spirits x 0.6) dps, plus Meteor Hammer's building
  //           damage when a step channels it (KV impact_damage_buildings on landing (land_time after the channel) + burn_dps_buildings for
  //           burn_duration, magical: towers have 0 magic resistance); tHammer = the same with Meteor Hammer + plain hero attacks only.
  // A scenario's limit must satisfy tCombo x 1.25 <= limit < tAttack (tests/ceo_v6_core.test.js).
  // s to bring `hp` down at `dps` (+ the hammer {impact, burn, dur, land}: impact at `land`, burn per second after it)
  function fightTime(hp, dps, ham) {
    if (!ham) return hp / dps;
    const dealt = t => dps * t + (t >= ham.land ? ham.impact + ham.burn * Math.min(ham.dur, Math.floor(t - ham.land + 1e-9)) : 0);
    let lo = 0, hi = hp / dps;
    if (dealt(hi) < hp) return hi;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (dealt(m) >= hp) hi = m; else lo = m; }
    return hi;
  }
  function towerMath(sc, df, lo) {
    lo = lo || prepare(sc, df).lo;
    const ctx = IT.Loadout.ctx(lo), V = IT.Values, T = IT.Towers.TIERS[1], hp = sc.towerHp || T.hp;
    const steps = sc.steps || [], has = a => steps.some(s => s.a === a), hd = IT.DOTA.hero;
    const boot = lo.items.indexOf('travels') >= 0 ? 'travels' : lo.items.indexOf('boots') >= 0 ? 'boots' : null;
    const ms = hd.MovementSpeed + (boot ? num(V.item(IT.GAME.ITEM_DOTA[boot], 'bonus_movement_speed')) : 0);
    const start = sc.hero && sc.hero.at && sc.hero.at.ahead != null ? Math.abs(sc.hero.at.ahead) : 950;
    const walk = Math.max(0, start - hd.AttackRange - TOWER_HULL) / ms;
    const plain = attackDps(ctx, T.armor, false), combo = attackDps(ctx, T.armor, has('alacrity'));
    const tAttack = walk + hp / (plain.hero * 0.5);
    const spirits = has('forgespirit') ? combo.count * combo.spirit * 0.6 : 0;
    const MH = IT.GAME.ITEM_DOTA.meteorhammer, gi = k => { try { return num(V.item(MH, k)); } catch (e) { return 0; } };
    const ham = has('meteorhammer') ? { impact: gi('impact_damage_buildings'), burn: gi('burn_dps_buildings') * (gi('burn_interval') || 1), dur: gi('burn_duration') / (gi('burn_interval') || 1), land: gi('land_time') } : null;
    const castOf = a => { const id = SPELL_DOTA[a] || IT.GAME.ITEM_DOTA[a]; return num(V.castPoint && V.castPoint(id, ctx)) + num(V.channelTime && V.channelTime(id, ctx)) + (a === 'meteorhammer' ? gi('max_duration') : 0); };   // item channel (KV max_duration)
    let setup = 0;
    for (const s of steps) if (s.a !== 'move' && s.a !== 'attack') setup += castOf(s.a);
    const tCombo = walk + setup + fightTime(hp, combo.hero * 0.5 + spirits, ham);
    const tHammer = ham ? walk + castOf('meteorhammer') + fightTime(hp, plain.hero * 0.5, ham) : null;
    return { hp, walk, setup, tAttack, tCombo, tHammer, hammer: ham ? ham.impact + ham.burn * ham.dur : 0, limit: limitOf(sc, df) };
  }

  // world fog for main.js start(): a scenario run (ranked / infinite / sandbox scenario: `pr` = its first prepared scenario) always uses the
  // scenario's fog (always on, v6); only Free Play (pr null) honours the loadout's "Fog of war" checkbox (opts.fog, default on)
  const worldFog = (opts, pr) => (pr ? pr.fog !== false : !(opts && opts.fog === false));

  // v6 #50: a scenario foe's behaviour comes from its intent (IT.Intent.engine); the tier row's behavior / escape / blinkAfter only drive
  // the legacy fallback dummy (Free Play presets). The tier scales EXECUTION (df.exec) only.

  // ---------------------------------------------------------------- spots (v5): a hero / unit / gate position spec -> walkable {x, y}
  // Specs never hold absolute coordinates; they are relative to the map's arenas, towers, structures or other spots:
  //   { dx, dy }                                   offset from `base` (unit: the hero start; hero: the map spawn); also the fallback of a
  //                                                where-spec on a map without arenas (the bare test map)
  //   { where:[tags], not:[tags], d:[min,max], clear, has:{spot}, beyond:'gate', i, ox, oy }
  //        an arena of the map (js/data/maps.js: open highground lowground river tower choke fog pit ...) plus tags relative to base:
  //        high / low / level (elevation vs base), hidden / seen (base's line of sight), dtower / rtower (inside a Dire / Radiant
  //        tower's range), clear:r = (2r+1)^2 tiles walkable at one elevation, has = another spot query must resolve from it,
  //        beyond:'gate' = farther than the gate, roughly in its direction. Sorted by |dist - mid(d)|; i (or the seeded pick) chooses.
  //   { tower:{team,i}, ahead, side }             relative to the i-th nearest tower of a team (ahead > 0 = beyond it, seen from base)
  //   { struct:{kind,team,i}, ahead, side }       same around a structure (outpost, barracks, fort, fountain, shop, filler)
  //   { gate:true, ahead, side }                   relative to the scenario gate (the line foes must not cross)
  //   { of:k, dx, dy, ahead, side }                relative to unit k (already placed); ahead/side oriented base -> unit k
  const TOWER_REACH = 760;   // tower range 700 + hull + margin
  const HERO_SIGHT = 1800;
  const nearWalk = (w, x, y) => {
    if (!w.map.walkable(x, y) && IT.Nav && IT.Nav.nearestWalkable) { const p = IT.Nav.nearestWalkable(w.map, x, y); if (p) return { x: p.x, y: p.y }; }
    return { x, y };
  };
  const byDist = (base, l) => l.slice().sort((a, b) => Math.hypot(a.x - base.x, a.y - base.y) - Math.hypot(b.x - base.x, b.y - base.y));
  function towerOf(map, base, q) {
    const l = byDist(base, (map.towers || []).filter(t => t.team === (q.team == null ? 1 : q.team)));
    return l[Math.min(q.i | 0, l.length - 1)] || null;
  }
  function structOf(map, base, q) {
    const l = byDist(base, (map.structures || []).filter(s => (!q.kind || s.kind === q.kind) && (q.team == null || s.team === q.team)).map(s => Object.assign({}, s, map.center(s.tx, s.ty))));
    return l[Math.min(q.i | 0, l.length - 1)] || null;
  }
  function clearAround(map, x, y, r) {
    const tx = map.toTile(x), ty = map.toTile(y), el = map.elevTile(tx, ty);
    for (let j = ty - r; j <= ty + r; j++) for (let i = tx - r; i <= tx + r; i++) if (!map.walkableTile(i, j) || map.elevTile(i, j) !== el) return false;
    return true;
  }
  const nearTower = (map, a, team) => (map.towers || []).some(t => t.team === team && Math.hypot(t.x - a.x, t.y - a.y) < TOWER_REACH);
  // ---------------------------------------------------------------- v6 item 17: Roshan's pit (the walled crater, not the zone box)
  // maps.js tags 'pit' on every arena inside a 19 x 19-tile box around Roshan's spot (IT.DOTAWORLD.ents.roshan), but in the extracted map
  // that spot is a solid rock and the box also covers the open river around it. The crater itself is the walkable pocket the rock and the
  // pit walls close in: tiles where >= PIT_ENC of 8 rays hit an unwalkable tile within PIT_RAY tiles, flood-filled from the most enclosed
  // tile of the box. pitRegion(map) -> { tiles:Set(ty * w + tx), x, y (world, the deepest tile), n } | null (cached on the map).
  const PIT_BOX = 9, PIT_RAY = 8, PIT_ENC = 6, D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  function pitRegion(map) {
    if (!map || map._pit !== undefined) return map ? map._pit : null;
    let out = null;
    const ros = (IT.DOTAWORLD && IT.DOTAWORLD.ents && IT.DOTAWORLD.ents.roshan) || [], g = map.world;
    const wk = (x, y) => x >= 0 && y >= 0 && x < map.w && y < map.h && map.walkableTile(x, y);
    const enc = (x, y) => D8.filter(([dx, dy]) => { for (let k = 1; k <= PIT_RAY; k++) if (!wk(x + dx * k, y + dy * k)) return true; return false; }).length;
    if (g && IT.Maps && IT.Maps.worldToTile) for (const r of ros) {
      const q = IT.Maps.worldToTile(r.x, r.y), cx = Math.floor(q[0]) - g.gx0, cy = Math.floor(q[1]) - g.gy0;
      if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) continue;
      const E = {}, inBox = (x, y) => Math.abs(x - cx) <= PIT_BOX && Math.abs(y - cy) <= PIT_BOX;
      let seed = null, best = -1;
      for (let y = cy - PIT_BOX; y <= cy + PIT_BOX; y++) for (let x = cx - PIT_BOX; x <= cx + PIT_BOX; x++) {
        if (!wk(x, y)) continue;
        const e = E[y * map.w + x] = enc(x, y);
        if (e > best || (e === best && Math.hypot(x - cx, y - cy) < Math.hypot(seed[0] - cx, seed[1] - cy))) { best = e; seed = [x, y]; }
      }
      if (!seed || best < PIT_ENC) continue;
      const tiles = new Set([seed[1] * map.w + seed[0]]), qu = [seed];
      for (let k = 0; k < qu.length; k++) for (const [dx, dy] of D8.slice(0, 4)) {
        const x = qu[k][0] + dx, y = qu[k][1] + dy, i = y * map.w + x;
        if (!inBox(x, y) || tiles.has(i) || !wk(x, y) || !(E[i] >= PIT_ENC)) continue;
        tiles.add(i); qu.push([x, y]);
      }
      // the deepest tile: the most enclosed, nearest the pocket's centroid
      const mx = qu.reduce((a, t) => a + t[0], 0) / qu.length, my = qu.reduce((a, t) => a + t[1], 0) / qu.length;
      const deep = qu.slice().sort((a, b) => E[b[1] * map.w + b[0]] - E[a[1] * map.w + a[0]] || Math.hypot(a[0] - mx, a[1] - my) - Math.hypot(b[0] - mx, b[1] - my))[0];
      const c = map.center(deep[0], deep[1]);
      out = { tiles, x: c.x, y: c.y, n: tiles.size };
      break;
    }
    map._pit = out;
    return out;
  }
  const inPit = (map, x, y) => { const p = pitRegion(map); return !!p && p.tiles.has(map.toTile(y) * map.w + map.toTile(x)); };
  // v6 #67 pit_blast_in: obj.how.mouth = a foe dying within MOUTH_TOL[tier] u of a crater tile (the bank by the mouth) counts as inside:
  // looser at the low tiers, tight at hard / bambam. Distance to the nearest crater tile (centre, half-tile slack).
  const MOUTH_TOL = { ian: 90, easy: 70, common: 50, hard: 30, bambam: 15 };
  function pitGap(map, x, y) {
    const p = pitRegion(map); if (!p) return Infinity;
    let best = Infinity;
    p.tiles.forEach(i => { const c = map.center(i % map.w, Math.floor(i / map.w)); best = Math.min(best, Math.hypot(c.x - x, c.y - y)); });
    return Math.max(0, best - map.tile / 2);
  }
  // a Force Staff push (KV push_length) from p toward the pit's deepest point: the walkable end of the push (walls stop it)
  function pushEnd(map, p, to, len) {
    const a = Math.atan2(to.y - p.y, to.x - p.x);
    let q = { x: p.x, y: p.y };
    for (let s = 16; s <= len; s += 16) { const n = { x: p.x + Math.cos(a) * s, y: p.y + Math.sin(a) * s }; if (!map.walkable(n.x, n.y)) break; q = n; }
    return q;
  }
  // { pit:'bank', d:[min,max] } spot: a walkable point outside the crater, d from its deepest point, from where a Force Staff push toward
  // that point ends inside the crater (and a Blink reaches it); seeded among the n best (closest to mid(d))
  function pitBank(w, s, o) {
    const map = w.map, P = pitRegion(map); if (!P) return null;
    const d = s.d || [400, 600], mid = (d[0] + d[1]) / 2, len = IT.Values && IT.Values.item ? (num(IT.Values.item(IT.GAME.ITEM_DOTA.forcestaff, 'push_length')) || 600) : 600, el = map.elevAt(P.x, P.y);
    const out = [];
    for (let a = 0; a < 64; a++) for (const r of [d[0], mid, d[1]]) {
      const t = (a / 64) * Math.PI * 2, x = P.x + Math.cos(t) * r, y = P.y + Math.sin(t) * r;
      if (!map.walkable(x, y) || inPit(map, x, y) || map.elevAt(x, y) !== el) continue;
      const e = pushEnd(map, { x, y }, P, len); if (!inPit(map, e.x, e.y)) continue;
      out.push({ x, y, k: Math.abs(r - mid) });
    }
    if (!out.length) return null;
    out.sort((a, b) => a.k - b.k);
    const n = Math.max(1, Math.min(out.length, (o && o.pick) || 1) * 4), c = out[Math.floor(w.rng() * n) % n];
    return { x: c.x, y: c.y };
  }
  // tags of arena a seen from base (static map tags + relative ones)
  function tagsOf(w, a, base) {
    const map = w.map, ea = map.elevAt(a.x, a.y), eb = map.elevAt(base.x, base.y), out = a.tags.slice();
    out.push(ea > eb ? 'high' : ea < eb ? 'low' : 'level');
    const V = IT.Vision, far = Math.hypot(a.x - base.x, a.y - base.y) > HERO_SIGHT;
    out.push(far || ea > eb || (V && !V.los(map, base.x, base.y, a.x, a.y)) ? 'hidden' : 'seen');
    if (inPit(map, a.x, a.y)) out.push('inpit');   // v6: inside Roshan's crater (pitRegion), not just the zone box
    if (nearTower(map, a, 1)) out.push('dtower');
    if (nearTower(map, a, 0)) out.push('rtower');
    return out;
  }
  function beyondGate(w, a, base) {
    const g = w.gate; if (!g) return false;
    const gx = g.x - base.x, gy = g.y - base.y, gl = Math.hypot(gx, gy) || 1, ax = a.x - base.x, ay = a.y - base.y, al = Math.hypot(ax, ay) || 1;
    return al > gl + 350 && (ax * gx + ay * gy) / (al * gl) > 0.7;
  }
  // candidate arenas for a where-spec, best first
  function arenas(w, s, base) {
    const map = w.map, need = s.where || [], not = s.not || [], d = s.d || [400, 1800], mid = (d[0] + d[1]) / 2;
    const dist = a => Math.hypot(a.x - base.x, a.y - base.y);
    const ok = a => {
      const tg = tagsOf(w, a, base);
      if (!need.every(t => tg.indexOf(t) >= 0) || not.some(t => tg.indexOf(t) >= 0)) return false;
      if (s.clear && !clearAround(map, a.x, a.y, s.clear)) return false;
      if (s.beyond === 'gate' && !beyondGate(w, a, base)) return false;
      if (s.unseenBy && !unseenBy(w, a, s.unseenBy)) return false;   // v6 item 27: out of the listed placed units' / spots' sight
      if (s.turn && s._o && turnDeg(s._o, base, a) < s.turn) return false;   // v6 item 27: o -> base -> a bends by >= turn degrees
      if (s.far && !s.far.every(([k, m]) => { const u = typeof k === 'string' ? w.spots && w.spots[k] : w._placed && w._placed[k]; return !u || dist2(a, u) >= m; })) return false;
      if (s.has && !arenas(w, s.has, a).some(b => { const db = dist2(a, b); return db >= (s.has.d || [0, 1e9])[0] && db <= (s.has.d || [0, 1e9])[1]; })) return false;
      return true;
    };
    const all = ((map.spawns && map.spawns.arenas) || []).filter(ok);
    let pool = all.filter(a => dist(a) >= d[0] && dist(a) <= d[1]);
    if (!pool.length && !s.strict) pool = all;   // v6 item 27: strict = d is a hard bound (no match -> the spot falls back to its base)
    return pool.sort((a, b) => Math.abs(dist(a) - mid) - Math.abs(dist(b) - mid));
  }
  const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const turnDeg = (o, b, a) => { const u = Math.atan2(b.y - o.y, b.x - o.x), v = Math.atan2(a.y - b.y, a.x - b.x); let d = Math.abs(u - v) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; return d * 180 / Math.PI; };
  // v6 item 27: arena a is hidden from every listed viewer k: a placed unit index, or a named spot already resolved (beyond HERO_SIGHT,
  // above it, or behind trees / cliffs)
  function unseenBy(w, a, ks) {
    const V = IT.Vision, map = w.map;
    return ks.every(k => {
      const u = typeof k === 'string' ? w.spots && w.spots[k] : w._placed && w._placed[k]; if (!u) return true;
      return dist2(a, u) > HERO_SIGHT || map.elevAt(a.x, a.y) > map.elevAt(u.x, u.y) || (V && !V.los(map, u.x, u.y, a.x, a.y));
    });
  }
  // relative to an anchor (tower / structure / gate), oriented by base -> anchor
  function around(anchor, base, s) {
    const dd = Math.hypot(anchor.x - base.x, anchor.y - base.y) || 1, ux = (anchor.x - base.x) / dd, uy = (anchor.y - base.y) / dd;
    return { x: anchor.x + ux * (s.ahead || 0) - uy * (s.side || 0) + (s.dx || 0), y: anchor.y + uy * (s.ahead || 0) + ux * (s.side || 0) + (s.dy || 0) };
  }
  // seeded jitter of a resolved spot: up to 6 draws, each must stay walkable on the same elevation, keep (or not enter) the tower rules
  // and keep the line of sight to base; none fits -> the spot stays put
  function jitter(w, p, base, o, s) {
    const map = w.map, V = IT.Vision, e0 = map.elevAt(p.x, p.y), los0 = V && V.los ? V.los(map, base.x, base.y, p.x, p.y) : true;
    for (let k = 0; k < 6; k++) {
      const rn = o.rng || w.rng, q = { x: p.x + (rn() * 2 - 1) * o.jit, y: p.y + (rn() * 2 - 1) * o.jit };
      if (!map.walkable(q.x, q.y) || map.elevAt(q.x, q.y) !== e0) continue;
      if (!s.towers && nearTower(map, q, o.role === 'hero' ? 1 : 0) && !nearTower(map, p, o.role === 'hero' ? 1 : 0)) continue;
      if (V && V.los && V.los(map, base.x, base.y, q.x, q.y) !== los0) continue;
      return q;
    }
    return p;
  }
  // resolve a spot. pick = seeded choice among the best `pick` arenas (scenario rand.pick), jit = +-units of seeded jitter (see jitter)
  function spot(w, s, base, placed, o) {
    o = o || {};
    const map = w.map;
    let p = { x: base.x + (s.dx || 0), y: base.y + (s.dy || 0) };
    if (s.from != null) {   // v6 item 27: measure d / tags from a named spot (or placed unit k) instead of the hero start; turn is relative to that leg
      const f = typeof s.from === 'string' ? w.spots && w.spots[s.from] : placed[s.from];
      if (f) { s = Object.assign({}, s, { _o: base }); base = f; }
    }
    if (s.where) {
      // by default the hero never starts inside a Dire tower's range and foes never stand in a Radiant tower's (towers:true opts out)
      const q = s.towers || !o.role ? s : Object.assign({}, s, { not: (s.not || []).concat(o.role === 'hero' ? ['dtower'] : ['rtower']) });
      const l = arenas(w, q, base), k = Math.max(1, Math.min(l.length, o.pick || 1));
      const a = l.length ? l[s.i != null ? Math.min(s.i | 0, l.length - 1) : (k > 1 ? Math.floor(w.rng() * k) % k : 0)] : null;
      if (a) p = { x: a.x + (s.ox || 0), y: a.y + (s.oy || 0) };
    } else if (s.tower) { const t = towerOf(map, base, s.tower); if (t) p = around(t, base, s); }
    else if (s.struct) { const t = structOf(map, base, s.struct); if (t) p = around(t, base, s); }
    else if (s.gate && w.gate) p = around(w.gate, base, s);
    else if (s.of != null && placed[s.of]) p = around(placed[s.of], base, s);
    else if (s.spot && w.spots && w.spots[s.spot]) p = around(w.spots[s.spot], base, s);
    else if (s.pit === 'deep') { const r = pitRegion(map); if (r) p = { x: r.x + (s.dx || 0), y: r.y + (s.dy || 0) }; }   // v6 item 28: the crater's deepest tile + offset
    else if (s.pit) { const q = pitBank(w, s, o); if (q) return q; }
    if (o.jit) p = jitter(w, p, base, o, s);
    return nearWalk(w, p.x, p.y);
  }

  // ranked twists: one cheap modifier on top of a scenario (picked per stage, seeded). ok(sc) = compatible. (v6: no 'fog' twist, fog is always on)
  const TWISTS = {
    swift: { ok: sc => (sc.units || []).length > 0, name: { en: 'Swift foes (+15% speed)', pt: 'Inimigos velozes (+15% velocidade)' } },
    tough: { ok: sc => (sc.units || []).length > 0 && sc.obj.type !== 'push' && sc.obj.type !== 'rootAll', name: { en: 'Tough foes (+15% HP)', pt: 'Inimigos resistentes (+15% de vida)' } },
    alert: { ok: sc => (sc.units || []).length > 0 && (sc.fail || []).indexOf('seen') < 0, name: { en: 'Alert foes', pt: 'Inimigos atentos' } },
  };

  // v6 item 27 (juke): per-unit extras. A chaser (mot 'chase') gets a belief (IT.Belief, tier params df.belief; idx / n among the
  // scenario's chasers, for split predictions + search bearings); unit `gem` = a Gem of True Sight carrier (passive true-sight aura,
  // IT.Values item_gem radius, 900 fallback: no gem in the KV dump); unit `recatch` = at tiers whose belief lists recatch items
  // (hard: Force Staff, bambam: Blink + Force Staff) the chaser gets them in its free slots (chase() uses them on a reacquire).
  const GOAL_R = 220, GEM_R = 900;
  function jukeUnit(w, e, d, df, i, list) {
    if (d.gem) { e.trueSight = (IT.Values && IT.Values.item ? IT.Values.item('item_gem', 'radius') : 0) || GEM_R; e.gem = true; }
    if (d.mot !== 'chase' || !IT.Belief) return;
    const P = IT.Belief.params(df), idx = list.slice(0, i).filter(u => u.mot === 'chase').length, n = list.filter(u => u.mot === 'chase').length;
    e.belief = IT.Belief.create(e, P, { idx, n });
    if (d.recatch && Array.isArray(P.recatch) && e.items) for (const id of P.recatch) {
      if (e.items.some(s => s && s.id === id)) continue;
      const k = e.items.indexOf(null); if (k >= 0) e.items[k] = { id, cd: 0, charges: 0 };
    }
  }
  const spotOf = (w, name) => (w && w.spots && w.spots[name]) || null;
  const TIER_ORDER = ['ian', 'easy', 'common', 'hard', 'bambam'];
  const tierOn = (d, df) => !d.minDf || !df || TIER_ORDER.indexOf(df.id) < 0 || TIER_ORDER.indexOf(df.id) >= TIER_ORDER.indexOf(d.minDf);

  // v6 item 28 (fun scenarios): extras resolved after the units + named spots. A spec is a spot name (w.spots) or a spot() spec.
  //   sc.ally      [{ at, hp?, frac?, skin? }]            a stationary friendly hero (IT.Units.spawnAlly; fail 'allyDied')
  //   sc.roshan    { at?, hp?, frac?, armor?, scriptHits?, ttl? }   Roshan (default: the crater's deepest tile); ttl = s of play -> dies anyway
  //   sc.pickups   [{ kind: 'rune'|'aegis', at, t? }]      t = s of play before it spawns (0 / none: at once)
  //   sc.allyTowerHp / sc.allyTowerBusy                   our towers' hp / busy with creeps (they never shoot the scenario foe)
  //   unit fields: tpPlan { after, near?, dest?, remove? } (planned TP channel), grab { kinds, at? } (rune / Aegis contest),
  //                bkbOn (BKB popped at the start; needs 'bkb' in items), intent.target ('ally' | 'roshan' | 'tower': intent attack_ally)
  function funExtras(w, sc, sp, placed, R, extra) {
    const at = s => (typeof s === 'string' ? spotOf(w, s) : s ? spot(w, s, sp, placed, { pick: R.pick, role: 'hero' }) : null);
    w._pk = []; w._roshTtl = null;
    if (sc.allyTowerHp || sc.allyTowerBusy) for (const t of w.ents) if (t.kind === 'tower' && t.team === 0 && !t.dead) {
      if (sc.allyTowerHp) { t.hp = t.maxHp = sc.allyTowerHp; }
      if (sc.allyTowerBusy && t.attack) { t.attack.range = 0; t.attack.target = null; t.busy = true; }
    }
    for (const a of sc.ally || []) { const p = at(a.at); if (p) IT.Units.spawnAlly(w, { x: p.x, y: p.y, hp: a.hp, frac: a.frac, skin: a.skin }); }
    if (sc.roshan) {
      const r = pitRegion(w.map), p = sc.roshan.at ? at(sc.roshan.at) : r ? { x: r.x, y: r.y } : null;
      if (p) IT.Units.spawnRoshan(w, { x: p.x, y: p.y, hp: sc.roshan.hp, frac: sc.roshan.frac, armor: sc.roshan.armor, scriptHits: sc.roshan.scriptHits });
      w._roshTtl = sc.roshan.ttl != null ? sc.roshan.ttl : null;
    }
    for (const q of sc.pickups || []) {
      const p = at(q.at); if (!p) continue;
      if (!(q.t > 0)) IT.Units.spawnPickup(w, { kind: q.kind, x: p.x, y: p.y });
      else w._pk.push({ kind: q.kind, x: p.x, y: p.y, t: q.t, done: false });
    }
    for (const [e, d, I0] of extra) {
      if (e.intent) e.intent.target = I0.target || null;
      if (d.tpPlan) e.tpPlan = { after: d.tpPlan.after || 0, near: d.tpPlan.near != null ? d.tpPlan.near : null, dest: d.tpPlan.dest ? at(d.tpPlan.dest) : null, remove: !!d.tpPlan.remove, done: false, t0: null };
      if (d.grab) e.grab = { kinds: d.grab.kinds || ['rune'], at: d.grab.at ? at(d.grab.at) : null, seen: null, goAt: 0 };
      if (d.bkbOn && e.items && e.items.some(s => s && s.id === 'bkb')) {
        const def = IT.Abilities && IT.Abilities.get('bkb');
        if (def) { w.emit('itemUse', { unit: e.id, ability: 'bkb' }); def.cast(w, e, {}); }
      }
    }
  }
  // the play-time half of funExtras (ranked script): timed pickups, Roshan's ttl
  function funTick(w, el) {
    if (w._pk) for (const q of w._pk) if (!q.done && el >= q.t - 1e-9) { q.done = true; IT.Units.spawnPickup(w, { kind: q.kind, x: q.x, y: q.y }); }
    if (w._roshTtl != null && el >= w._roshTtl - 1e-9) { w._roshTtl = null; const r = w.ents.find(e => e.kind === 'roshan' && !e.dead); if (r) IT.Units.killRoshan(w, r, null); }
  }

  // swap the world over to a prepared scenario, in place (hero kept, everything else removed)
  function apply(w, pr) {
    const hero = w.hero, df = pr.df, sc = pr.sc;
    const nm = IT.Maps && IT.Maps.get ? IT.Maps.get(sc.map || 'grounds') : null;   // scenario map (default: the Training Grounds)
    const swapped = !!nm && nm !== w.map;
    if (swapped) w.map = nm;
    const R = sc.rand || {}, sp0 = w.map.spawns.hero, H = sc.hero || {};
    const sp = H.at && H.at !== 'spawn' ? spot(w, H.at, sp0, [], { pick: R.pick, role: 'hero' }) : sp0;   // the hero may start elsewhere (high ground, near a tower ...)
    for (const e of w.ents) if (e !== hero && !e.dead) w.remove(e);
    w.ents = w.ents.filter(e => !e.dead);
    for (const [id, e] of w.byId) if (e.dead) w.byId.delete(id);
    if (swapped) w.emit('mapChange', { map: nm.id });
    if (IT.Towers && IT.Towers.spawnAll && w.map.towers && w.map.towers.length) IT.Towers.spawnAll(w, w.map);
    if (sc.towerHp) for (const e of w.ents) if (e.kind === 'tower' && e.team === 1) { e.hp = e.maxHp = sc.towerHp; }   // a weakened tower (creep-damaged; see towerMath)
    hero.statuses.length = 0; hero.orders.length = 0; hero.path.length = 0;
    hero.cd = {}; hero.inv = { orbs: [], slots: [null, null], invokeCd: 0 };
    hero._wind = null; hero._blinkLock = null; hero._pg = null; hero.channel = null;
    if (hero.attack) hero.attack.target = null;
    hero.anim = { name: 'idle', t: 0 };
    hero.x = sp.x; hero.y = sp.y; hero.z = 0; hero.facing = Math.PI / 2;
    IT.Hero.refresh(w, hero, pr.lo);   // v6: nothing pre-invoked, the countdown is the time to invoke
    hero.hp = hero.maxHp; hero.mana = hero.maxMana;
    hero.items = []; for (let i = 0; i < 6; i++) hero.items.push(pr.lo.items[i] ? { id: pr.lo.items[i], cd: 0, charges: 0 } : null);
    hero.lastSeen = { x: hero.x, y: hero.y, t: w.t };
    w.fog = pr.fog; w.loadout = pr.lo;
    const out = [], placed = [], E = IT.GAME.ENEMY, SK = IT.Skins ? IT.Skins.pool('enemy') : IT.GAME.SKINS, s0 = Math.max(0, SK.indexOf(pr.skin)), tw = pr.twist, vy = pr.vary;
    w.gate = sc.gate ? Object.assign(spot(w, sc.gate, sp, placed, { pick: R.pick }), { r: sc.gate.r || 260 }) : null;   // 'cross' line (a circle on the map)
    w._placed = placed; w.spots = {};   // v6 item 27: spot filters relative to placed units (unseenBy / far); named spots resolve after the units
    const ulist = sc.units || sc.dummies || [], jlist = ulist.filter(d => tierOn(d, df)), extra = [];
    ulist.forEach((d, i) => {
      // v6 #50: the unit's intent (scenario data, IT.Intent.of derives one from mot / behavior) -> its engine (script mot / AI behavior)
      const I0 = IT.Intent.of(d), eng = IT.Intent.engine(I0.kind, d), mot = eng.mot, boot = vy ? vy.boots[i] : null;
      const p = spot(w, d, sp, placed, { pick: R.pick, jit: d.of != null ? 0 : (R.jit || 0) + (vy ? vy.posJit : 0), rng: vy ? IT.U.mulberry32((vy.seed + i * 7919) >>> 0) : null, role: 'unit' });
      placed[i] = p;
      if (!tierOn(d, df)) return;   // v6 item 27: unit `minDf` (tier id) = only at that tier and above (its spot stays placed for `of` offsets)
      const items0 = d.items || ((df.useBkb && mot !== 'march') || d.useBkb ? ['bkb'] : undefined);   // #30: the tier BKB skips marchers (a BKB wave beats any Invoker hold)
      const items = boot ? (items0 || []).filter(x => x !== boot).concat(boot) : items0;
      const skin = SK[(s0 + i) % SK.length], lap = Math.floor(i / SK.length);   // every foe wears a different NPC hero skin + name
      // real enemy NPC, dies at 0 hp. Kill scenarios: hp = min(HP_CAP, HP_SHARE x tier hpMul) x the damage of the scenario's own steps (foeHp); the others keep
      // the old line (d.hp = start fraction on the old 25% kill line x ENEMY.hp x hpMul)
      const need = d.hp != null && d.hp < 1 ? Math.max(0.05, d.hp - 0.25) : 0.75;
      const base = vy && vy.hp && vy.hp[i] != null ? vy.hp[i] : pr.hp && pr.hp[i] != null ? pr.hp[i] : need * E.hp * (df.hpMul != null ? df.hpMul : 1) * (vy ? vy.hpMul : 1);
      const hp = Math.round(Math.max(100, base * (tw === 'tough' ? 1.15 : 1)));
      // per-unit awareness (a notice delay of df.notice x (1 - aw) s) is the scenario's base, nudged by the tier (+-0.2); 'alert' twist adds 0.3
      const aw = clamp((d.aware != null ? d.aware + (df.awareness - 0.6) * 0.5 : df.awareness) + (tw === 'alert' ? 0.3 : 0), 0, 1);
      const e = IT.Units.spawnEnemy(w, {
        x: p.x, y: p.y, skin, name: IT.GAME.SKIN_NAMES[skin] + (lap ? ' ' + (lap + 1) : ''), hp, armor: E.armor + (df.armorAdd || 0),
        behavior: eng.behavior,   // v6 #50: the tier no longer picks stand / wander / scripted blink; it only scales execution (e.exec)
        scenario: { stunBolt: df.stunBolt, dummyEscape: 'none', blinkAfter: null },
        useBkb: !!(df.useBkb || d.useBkb), items,
        telegraph: df.telegraph, awareness: aw, notice: df.notice, reaction: mot === 'still' ? 99 : df.reaction * (vy ? vy.reactionMul : 1),
        dmgMul: df.dmgMul, fights: !!df.fights && mot !== 'flee' && mot !== 'march',   // #30: a marcher keeps marching (fighting made hold scenarios an auto-attack win at hard+)
        attack: d.attack || undefined,   // v6 item 28: 'melee' | 'ranged' override of the skin's attack profile (a melee tower / Roshan hitter)
        juke: d.juke === 'pit' && pitRegion(w.map) ? { x: pitRegion(w.map).x, y: pitRegion(w.map).y, near: d.near || 500 } : null,   // v6 pit_trap
      });
      e.hpRegen = 0; e.base.hpRegen = 0;
      // scripted movers: max(rolled base, tier speed) x tier msMul + the boot item's KV bonus_movement_speed (v6 item 40); a msMul unit already models its boots (playtest 2): msMul only
      if (mot === 'flee' || mot === 'chase' || mot === 'march' || mot === 'kite') { const tier = mot === 'flee' || mot === 'kite' ? 330 * df.flee : mot === 'march' ? 270 * df.chase : 380 * df.chase, ms = Math.round(Math.max(e.msBase, tier) * (df.msMul || 1)) + (d.msMul ? 0 : IT.Units.itemMs(items)); e.ms = ms; e.base.ms = ms; }   // v6 #46: never below the rolled hero base (tier speed only raises it); v6 #68: x the tier's msMul (ian .82 .. hard 1) on that base, BEFORE the boots
      if (d.msMul && mot) { e.ms = Math.round(e.ms * d.msMul); e.base.ms = e.ms; }
      if (tw === 'swift') { e.ms = Math.round(e.ms * 1.15); e.base.ms = e.ms; }
      e.scn = { mot: mot || null, next: 0, lastSeen: null, search: null, idx: i, n: (sc.units || sc.dummies || []).length };
      e.exec = df.exec || null;   // v6 #50: tier EXECUTION (jitter, item / blink probability, prediction, sway, dodge, Ghost-Walk Dust)
      if (IT.Belief) e.beliefP = IT.Belief.params(df);
      if (d.blinker || I0.kind === 'blink_in') e.innate = IT.Intent.newInnate(w);   // v6 #52 innate blink
      IT.Intent.attach(e, d, df.reaction * (vy ? vy.reactionMul : 1));
      jukeUnit(w, e, d, df, jlist.indexOf(d), jlist);   // v6 item 27: belief (chasers), Gem, re-catch items
      if (mot === 'chase' && !e.belief && IT.Belief) e.belief = IT.Belief.create(e, e.beliefP, { idx: 0, n: 1 });
      // #77 (review I4): in a juke scenario a chaser is never slower than the hero x the tier's belief.floor (ian / easy): walking straight
      // away no longer wins at the low tiers (it out-paced the x0.82 / x0.88 chasers); only breaking sight does
      const fl = e.beliefP && e.beliefP.floor;
      if (fl && mot === 'chase' && (sc.tags || []).indexOf('juke') >= 0) { const hm = Math.round(((IT.DOTA.hero && IT.DOTA.hero.MovementSpeed) || 280) + IT.Units.itemMs(pr.lo.items || [])); if (e.ms < hm * fl) { e.ms = Math.round(hm * fl); e.base.ms = e.ms; } }
      extra.push([e, d, I0]);
      out.push(e);
    });
    // v6 item 27: named spots (sc.spots { name: spec }, resolved from the hero start after the units; a spec may sit relative to an earlier
    // spot: { spot:'name', ahead, side }) -> w.spots; the 'reach' objective's spot is the goal ring (w.goal)
    w.spots = {};
    for (const k of Object.keys(sc.spots || {})) w.spots[k] = spot(w, sc.spots[k], sp, placed, { pick: R.pick, role: 'hero' });
    w.goal = sc.obj.type === 'reach' && w.spots[sc.obj.spot] ? Object.assign({}, w.spots[sc.obj.spot], { r: sc.obj.r || GOAL_R }) : null;
    funExtras(w, sc, sp, placed, R, extra);
    if (out.length) hero.facing = Math.atan2(out[0].y - hero.y, out[0].x - hero.x);   // start facing the first foe (Force Staff pushes that way)
    return out;
  }

  // the enemy team sees the hero (shared vision: units + towers; Ghost Walk hides it unless true sight / a reveal)
  const heroSeen = w => { const h = w.hero; if (!h) return false; return IT.Vision && IT.Vision.teamSees && w.map ? IT.Vision.teamSees(w, 1, h) : !IT.Status.has(h, 'ghost'); };
  const SEARCH_R0 = 150, SEARCH_GROW = 110, SEARCH_MAX = 900;
  // chaser search ring around the last seen spot: radius 150 + 110/s, max 900
  const DETECT = { dust: 1, gem: 1, sentry: 1 };   // v6 item 27: foe item uses that count as burnt detection (obj.burn)

  // ---------------------------------------------------------------- v6 items 13 + 39 + 45: the pre-round intro (pure data + world reads)
  // Item 45, the 12 s countdown in two phases. (1) TEXT FIRST, the camera stays on the hero: the briefing animates each block in on its own
  // (title, VICTORY, DEFEAT, then every combo step), the phase length is the reading time (words x 0.25 s + 0.4 s per block, clamped 3-6 s,
  // I.text = { hold, blocks:[{ id, i, at, d }] } read by js/ui/briefing.js). (2) THEN the pan: each foe group the player may see (centroid,
  // nearest first, <= STAY_MAX s on it) -> the gate -> sc.focus areas -> back to the hero, arriving before the round starts (the pan phase
  // shrinks when the text phase is long).
  // Start reveal (items 39 + 45, ALL tiers): every foe UNSEEN at enter() gets a tiny ring of vision (a team-0 thinker, fx 'startReveal': a plain faint
  // ring, no VFX) once the camera has ARRIVED on it; the clock (df.revealLinger s: ian 2.5, easy 2, common 1.5, hard 1.1, bambam 0.8) starts there
  // and runs on the countdown clock. The foe already faces the way it will move next (faceFoes). Reveals the pan never reached (a cancelled intro,
  // F1) appear at round start and linger in play.
  const INTRO_MIN = 5, GROUP_R = 900, TOUR_MAX = 4, REVEAL_LINGER = 1.5, REVEAL_R = 250, REVEAL_VIS = 260;
  const STAGE_MIN = 0.5, STAGE_MAX = 0.8, FLY_S = 0.3, TEXT_MIN = 4, TEXT_MAX = 7, TEXT_TAIL = 0.3, STAY_MAX = 4, STAY_OTHER = 1.0;
  // item 73, reading time: a centre-stage text holds max(floor, READ_BASE + words / READ_WPS) s (~210 wpm, EN and PT alike; floor 1.2 s, the title 0.8 s);
  // a combo step punches in for STEP_D s in all (icons need no reading) and the whole settled row then holds ROW_HOLD s before the pan
  const READ_FLOOR = 1.2, TITLE_FLOOR = 0.8, READ_BASE = 0.35, READ_WPS = 3.5, STEP_D = 0.45, STEP_FLY = 0.2, ROW_HOLD = 1.0, PAN_MIN = 2.5, TAIL_S = 2.5;
  const readHold = (words, floor) => Math.max(floor == null ? READ_FLOOR : floor, READ_BASE + words / READ_WPS);
  const revealOn = () => true;   // item 45: every tier gets the tiny start reveal
  const revealLinger = df => (df && df.revealLinger > 0 ? df.revealLinger : REVEAL_LINGER);
  const wordsOf = t => (String(t == null ? '' : t).trim().match(/\S+/g) || []).length;
  // the briefing's chips: HudSteps.derive minus consecutive repeats, at most 7 (the same rule as js/ui/briefing.js)
  function introSteps(sc) {
    const l = IT.HudSteps && IT.HudSteps.derive ? IT.HudSteps.derive(sc) : (sc.steps || sc.sol || []).map(s => ({ k: 'spell', id: s && (s.a || s.ability) }));
    return l.filter((a, i, q) => !(i && q[i - 1].k === a.k && q[i - 1].id === a.id)).slice(0, 7);
  }
  // item 66 + 73, the text phase = one element centre-stage at a time: the title / VICTORY / DEFEAT stay readHold(words) s big in the middle, then FLY
  // 0.3 s to their slot; every combo step punches in for STEP_D s (stage + fly); the settled row then holds ROW_HOLD s; the pan starts after that.
  // natural plan (countdown >= COUNTDOWN): hold = end + ROW_HOLD (the intro is stretched to fit, see buildIntro). A short countdown (infinite, 5 s)
  // squeezes the old way (every stage / fly shrinks together, hold <= 0.6 T). blocks[] = { id, i, at, stage, fly, d (= stage + fly) } read by js/ui/briefing.js
  function loseWords(sc, timed) {
    let n = wordsOf(loc(sc.lose));
    const HS = IT.HudSteps, tr = IT.t;
    if (HS && HS.loseKeys && tr && IT.hasT) for (const k of HS.loseKeys(sc, timed).filter(q => !(sc.lose && q === 'method') && IT.hasT('f1.lose.' + q))) n += wordsOf(tr('f1.lose.' + k));
    return n;
  }
  function textPlan(pr, T, timed) {
    const sc = pr.sc, steps = introSteps(sc);
    const blocks = [{ id: 'title', i: 0, st: readHold(wordsOf(loc(sc.name)), TITLE_FLOOR), fl: FLY_S }, { id: 'win', i: 0, st: readHold(wordsOf(loc(sc.win || sc.goal))), fl: FLY_S },
      { id: 'lose', i: 0, st: readHold(loseWords(sc, timed !== false)), fl: FLY_S }];
    steps.forEach((a, i) => blocks.push({ id: 'step', i, st: STEP_D - STEP_FLY, fl: STEP_FLY }));
    const raw = blocks.reduce((q, b) => q + b.st + b.fl, 0), tail = steps.length ? ROW_HOLD : TEXT_TAIL;
    let hold, k;
    if (T >= COUNTDOWN) { hold = raw + tail; k = 1; }
    else { hold = Math.min(Math.max(raw + TEXT_TAIL, TEXT_MIN), TEXT_MAX, 0.6 * T); k = Math.min(1, Math.max(0.1, hold - TEXT_TAIL) / raw); }
    let at = 0;
    for (const b of blocks) { b.at = at; b.stage = b.st * k; b.fly = b.fl * k; b.d = b.stage + b.fly; at += b.d; delete b.st; delete b.fl; }
    return { hold, raw, end: at, blocks };
  }
  function focusSpot(w, f, base) {
    if (f === 'pit') { const p = pitRegion(w.map); return p ? { x: p.x, y: p.y, r: 380 } : null; }
    if (f === 'gate') return w.gate ? { x: w.gate.x, y: w.gate.y, r: w.gate.r } : null;
    if (f === 'tower') { const t = towerOf(w.map, base, { team: 1 }); return t ? { x: t.x, y: t.y, r: 700 } : null; }
    if (f === 'ourTower') { const t = towerOf(w.map, base, { team: 0 }); return t ? { x: t.x, y: t.y, r: 500 } : null; }   // v6 item 28: our tower under attack
    if (f === 'goal') return w.goal ? { x: w.goal.x, y: w.goal.y, r: w.goal.r } : null;   // v6 item 27: the 'reach' ring
    if (typeof f === 'string' && f.indexOf('spot:') === 0) { const p = spotOf(w, f.slice(5)); return p ? { x: p.x, y: p.y, r: 300 } : null; }
    return null;
  }
  // -> { T, t, text, linger, stops:[{ kind:'hero'|'foes'|'gate'|'focus', x, y, r, ids, t (start), glide (s) }], reveals:[{ id, x, y, at (camera arrival; null = never toured), linger, done }], unseen:[ids], cur, tour }
  function buildIntro(w, pr, foes, T, timed) {
    const h = w.hero, sc = pr.sc, k = T / 12, live = foes.filter(e => !e.dead), linger = revealLinger(pr.df);
    const unseen = live.filter(e => !e.visible), rev = revealOn(sc, pr.df);
    const reveals = rev ? unseen.map(e => ({ id: e.id, x: e.x, y: e.y, at: null, linger, done: false, start: null, thk: null, gone: false })) : [];
    const shown = live.filter(e => e.visible || reveals.some(r => r.id === e.id));
    const groups = [];
    for (const e of byDist(h, shown)) {
      const g = groups.find(q => Math.hypot(q.x - e.x, q.y - e.y) < GROUP_R);
      if (g) { g.ids.push(e.id); g.sx += e.x; g.sy += e.y; g.x = g.sx / g.ids.length; g.y = g.sy / g.ids.length; }
      else groups.push({ x: e.x, y: e.y, sx: e.x, sy: e.y, ids: [e.id] });
    }
    let mid = groups.map(g => ({ kind: 'foes', x: g.x, y: g.y, r: 160, ids: g.ids }));
    if (w.gate) mid.push({ kind: 'gate', x: w.gate.x, y: w.gate.y, r: w.gate.r, ids: [] });
    for (const f of sc.focus || []) { const p = focusSpot(w, f, h); if (p) mid.push({ kind: 'focus', focus: f, x: p.x, y: p.y, r: p.r, ids: [] }); }
    mid = mid.filter((s, i) => !mid.slice(0, i).some(q => Math.hypot(q.x - s.x, q.y - s.y) < 150)).slice(0, TOUR_MAX);
    // item 73: the reading holds stretch the intro when they need to (the pan keeps >= PAN_MIN s + the invoke tail); k scales the pan only
    const text = textPlan(pr, T, timed);
    if (T >= COUNTDOWN) T = Math.max(T, Math.ceil((text.hold + PAN_MIN + TAIL_S) * 2) / 2);
    const back = T - TAIL_S * k, avail = Math.max(0, back - text.hold);
    // pan phase: glide + stay per stop (a foe stop stays the linger + 0.3 s, <= STAY_MAX; the others STAY_OTHER); too long -> glides + other stays shrink first, then all
    let gl = 1.1 * k;
    const stay = mid.map(s => (s.kind === 'foes' ? Math.min(STAY_MAX, linger + 0.3) : STAY_OTHER * k)), sum = () => mid.length * gl + stay.reduce((q, v) => q + v, 0);
    if (mid.length && sum() > avail) {
      gl *= Math.max(0.6, avail / sum());
      mid.forEach((s, i) => { if (s.kind !== 'foes') stay[i] = 0.5 * k; });
      if (sum() > avail) { const f = avail / sum(); gl *= f; for (let i = 0; i < stay.length; i++) stay[i] *= f; }
    }
    const stops = [{ kind: 'hero', x: h.x, y: h.y, r: 0, ids: [], t: 0, glide: 0 }];
    let cur = mid.length ? text.hold : back;
    mid.forEach((s, i) => { stops.push(Object.assign(s, { t: cur, glide: gl })); cur += gl + stay[i]; });
    stops.push({ kind: 'hero', x: h.x, y: h.y, r: 0, ids: [], t: Math.min(cur, back), glide: 1.2 * k });
    for (const r of reveals) { const s = stops.find(q => q.ids.indexOf(r.id) >= 0); r.at = s ? s.t + s.glide : null; }
    return { T, t: 0, text, linger, stops, reveals, unseen: unseen.map(e => e.id), cur: -1, tour: true };
  }
  // the start reveal: a tiny team-0 ring of vision at the foe's spot. Its clock (r.linger s) is the countdown clock from `start` (the camera's
  // arrival); introStep ages it there (the world is frozen), play ages it on from where it was. Nothing but a faint ring is drawn (fx.js).
  function spawnReveal(w, r, start) {
    r.done = true; r.start = start == null ? null : start;
    const e = w.get(r.id), x = e && !e.dead ? e.x : r.x, y = e && !e.dead ? e.y : r.y;
    r.thk = w.thinker({ x, y, r: REVEAL_R, team: 0, fx: 'startReveal', color: '#e9eef8', vision: REVEAL_VIS, foe: r.id, linger: r.linger, upd: (w2, t) => t.age >= t.linger - 1e-9 });
    if (IT.Vision && IT.Vision.update && w.map) { IT.Vision.update(w); w._visT = w.t; }
  }
  // v6 item 45: each foe starts out FACING the way it moves next (what the player can read off the reveal): a runner away from the hero, a marcher
  // toward its gate, a chaser toward the hero (its belief starts on him). The others keep their stance.
  function faceFoes(w, foes) {
    const h = w.hero; if (!h) return;
    for (const e of foes) {
      const m = e.scn && e.scn.mot; let a = null;
      if (m === 'flee') a = Math.atan2(e.y - h.y, e.x - h.x);
      else if (m === 'march' && w.gate) a = Math.atan2(w.gate.y - e.y, w.gate.x - e.x);
      else if (m === 'chase') a = Math.atan2(h.y - e.y, h.x - e.x);
      if (a != null && isFinite(a)) e.facing = a;
    }
  }

  // ---------------------------------------------------------------- run
  // opts: { mode:'ranked'|'sandbox'|'infinite' (default 'sandbox'; any other name is a neutral untimed-by-turns run, SOLO_COUNTDOWN s), diff:id, scenario:id (sandbox, fixed), rating, seed, skin, runSeconds }
  // 'infinite': bambam scenarios from the hard end of the pool in a seeded shuffled order (a fresh shuffle each lap, harder each lap, twists from the 3rd),
  //   until the first failed scenario; the summary carries cleared + the persisted best-ever.
  function create(opts) {
    opts = opts || {};
    const mode = opts.mode || 'sandbox', ranked = mode === 'ranked', infinite = mode === 'infinite', fixed = opts.scenario ? IT.SCENARIOS.get(opts.scenario) : null;
    const rating = opts.rating != null ? opts.rating : ranked ? profile().rating : 0;
    const seed = opts.seed == null ? (Math.random() * 1e9) | 0 : opts.seed, rng = IT.U.mulberry32(seed);
    const varRng = IT.U.mulberry32((seed ^ 0x9e3779b1) >>> 0);   // v6 item 40: per-play variation (own stream)
    const lvRng = IT.U.mulberry32((seed ^ 0x5bd1e995) >>> 0);   // v6 item 11: hero level rolls (own stream: picks / twists stay as they were)
    const run = {
      mode, ranked, infinite, fixed, rating, rng, lvRng, varRng, skin: opts.skin, phase: 'idle', cd: 0, hold: 0,
      runLeft: ranked && opts.runSeconds ? opts.runSeconds : null, turns: ranked ? (opts.turns || TURNS) : null, log: [], dmgMark: 0, score: 0, streak: 0, bestStreak: 0, solved: 0, failed: 0, n: 0,
      pr: null, dummies: [], intro: null, result: null, ended: false, summary: null, w: null, onSwap: null, recent: [], t0: 0, caught: false, bag: [], lastId: null, failId: null, maxLevel: 0,
      diffId: IT.DIFFICULTY.migrate(opts.diff || 'common'),
      // v6: a fixed sandbox scenario also gets the full countdown (nothing is pre-invoked: it is the time to invoke); item 13: the 12 s intro
      countdown: ranked ? COUNTDOWN : infinite ? INF_COUNTDOWN : fixed && mode === 'sandbox' ? COUNTDOWN : SOLO_COUNTDOWN, cd0: 0,
    };
    run.cd0 = run.countdown;
    const DF = () => IT.DIFFICULTY;

    const infPool = () => { const l = IT.SCENARIOS.filter(s => (s.level || s.tier * 3) >= INF_MIN_LEVEL); return l.length ? l : IT.SCENARIOS.slice(); };
    const infSize = infinite ? infPool().length : 1;
    run.lap = () => (infinite ? Math.floor(run.n / infSize) : 0);   // full passes over the pool so far
    // sc = the scenario being prepared (run.next); default = the one in play (stats.js, kill bookkeeping)
    run.diffIndex = sc => (ranked ? capDiff(rampDiff(rating, run.n), sc || (run.pr && run.pr.sc)) : infinite ? DF().order.length - 1 : DF().get(run.diffId).idx);
    run.difficulty = sc => (infinite ? infDifficulty(DF().get(run.diffIndex()), run.lap()) : DF().get(run.diffIndex(sc)));

    // ranked ramp: the n-th scenario aims at level 1 + n (+2 per rating band), picked among levels within +-r (widening until >= 3)
    run.played = {};   // #77 I2: id -> plays this run (pick weighting)
    run.levelTarget = () => clamp(Math.round(1 + run.n + 2 * baseDiff(rating)), 1, 10);
    // twists: 1 in the first stage (turns 0-2), 1-2 in each later stage (3-5, 6-7); turns chosen up front from the seed
    run.twistTurns = [];
    if (ranked) {
      const T = run.turns || TURNS;
      for (let s0 = 0; s0 < T; s0 += 3) {
        const len = Math.min(3, T - s0), want = s0 === 0 ? 1 : 1 + (rng() < 0.5 ? 1 : 0), ids = [];
        for (let i = 0; i < len; i++) ids.push(s0 + i);
        for (let k = 0; k < Math.min(want, len); k++) run.twistTurns.push(ids.splice(Math.floor(rng() * ids.length) % ids.length, 1)[0]);
      }
      run.twistTurns.sort((a, b) => a - b);
    }
    // v6: FUN_TURNS turns (seeded) draw from the fun pool (fog / invisible / river / prediction / vision tags)
    run.funTurns = [];
    if (ranked) {
      const T = run.turns || TURNS, ids = [];
      for (let i = 0; i < T; i++) ids.push(i);
      for (let k = 0; k < Math.min(FUN_TURNS, T); k++) run.funTurns.push(ids.splice(Math.floor(rng() * ids.length) % ids.length, 1)[0]);
      run.funTurns.sort((a, b) => a - b);
    }
    // infinite: draw from a shuffled bag of the pool (never the same scenario twice in a row across a refill)
    function infPick() {
      if (!run.bag.length) {
        const b = infPool();
        for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)) % (i + 1), t = b[i]; b[i] = b[j]; b[j] = t; }
        if (b.length > 1 && b[b.length - 1].id === run.lastId) { const t = b[0]; b[0] = b[b.length - 1]; b[b.length - 1] = t; }
        run.bag = b;
      }
      const sc = run.bag.pop(); run.lastId = sc.id; return sc;
    }
    function pick() {
      if (fixed) return fixed;
      if (infinite) return infPick();
      const all = IT.SCENARIOS;
      let pool = all;
      if (ranked) {
        const tg = run.levelTarget(), fun = run.funTurns.indexOf(run.n) >= 0, base = fun ? all.filter(s => isFun(s) && !run.recent.includes(s.id)) : all;
        // #77 (review I2): the window is always >= +-1 level (the L9-10 band alone was 11 scenarios: the same ones every top run), widened
        // until >= 3 (2 on fun turns); then weighted: on-target level x2, played earlier in this run (run.played) x0.35
        for (let r = PICK_R0; r <= 9; r++) { pool = base.filter(s => Math.abs((s.level || s.tier * 3) - tg) <= r); if (pool.length >= (fun ? 2 : 3)) break; }
        if (!pool.length) pool = all;
        const fresh = pool.filter(s => !run.recent.includes(s.id));
        if (fresh.length) pool = fresh;
        const wt = pool.map(s => ((s.level || s.tier * 3) === tg ? 2 : 1) * (run.played[s.id] ? 0.35 : 1));
        let x = rng() * wt.reduce((a, v) => a + v, 0);
        for (let i = 0; i < pool.length; i++) { x -= wt[i]; if (x < 0) return pool[i]; }
        return pool[pool.length - 1];
      }
      const fresh = pool.filter(s => !run.recent.includes(s.id));
      if (fresh.length) pool = fresh;
      return pool[Math.floor(rng() * pool.length) % pool.length];
    }
    function twist(sc) {
      if (infinite) {   // from the 3rd scenario: every other one in the first lap, every one after
        if (run.n < 2 || (run.lap() < 1 && run.n % 2 === 0)) return null;
        const okI = Object.keys(TWISTS).filter(k => TWISTS[k].ok(sc));
        return okI.length ? okI[Math.floor(rng() * okI.length) % okI.length] : null;
      }
      if (!ranked || run.twistTurns.indexOf(run.n) < 0) return null;
      const ok = Object.keys(TWISTS).filter(k => TWISTS[k].ok(sc));
      return ok.length ? ok[Math.floor(rng() * ok.length) % ok.length] : null;
    }
    // choose + prepare the next scenario (does not touch the world). main.js uses .lo/.fog to create the world.
    run.next = () => {
      const sc = pick();
      const df = run.difficulty(sc), lv = rollLevel(sc, df, run.lvRng);
      run.pr = prepare(sc, df, run.skin, lv.lvl, run.varRng);
      run.pr.lvl = lv;
      run.pr.twist = twist(sc);
      run.recent.push(sc.id); if (run.recent.length > Math.max(6, run.turns || 0)) run.recent.shift();
      run.played[sc.id] = (run.played[sc.id] || 0) + 1;
      return run.pr;
    };

    // used = step abilities that hit a foe (or, SELF_OK, were cast); hurt = a foe damaged the hero (escape: caught)
    const freshSt = () => ({ last: {}, abil: {}, kills: [], casts: {}, blasts: [], towers: [], hit: null, used: new Set(), castAt: {}, hurt: false, burned: 0, burnAt: null, unseenFrom: null,
      picked: null, allyDied: false, openInv: null, dz: {}, dodged: new Set() });   // v6 item 28: first pickup { team, kind, unit }, ally fell, the hero's first cast came from invisibility
    function enter(w) {
      run.dummies = apply(w, run.pr);
      faceFoes(w, run.dummies);
      // v6 (fog always on): the world is frozen through the countdown, so refresh the fog now -- the start picture is the real one and
      // a foe in plain sight is targetable on the first frame of play
      if (IT.Vision && IT.Vision.update && w.map) { IT.Vision.update(w); w._visT = w.t; }
      run.st = freshSt();   // objective bookkeeping (v5), filled by the attach() listeners
      run.result = null; run.caught = false; run.died = false; run.t0 = w.t;
      // kill_with, and (v6) every kill scenario whose steps must all hit: the hero does not auto-acquire (as on Hold), so a stray auto-attack
      // cannot finish the foe before the combo lands; an explicit attack / attack-move order still works
      if (w.hero) { if (run.pr.sc.obj.type === 'kill_with' || (run.pr.need && run.pr.need.length && KILL_TYPES[run.pr.sc.obj.type])) w.hero.autoAttack = false; else delete w.hero.autoAttack; }
      run.maxLevel = Math.max(run.maxLevel, run.pr.sc.level || 0);
      run.countdown = run.cd0; run.phase = run.cd0 > 0 ? 'countdown' : 'play'; run.cd = run.countdown;
      w.paused = run.phase !== 'play';
      run.intro = run.phase === 'countdown' && run.cd0 >= INTRO_MIN ? buildIntro(w, run.pr, run.dummies, run.cd0, run.mode !== 'sandbox') : null;
      if (run.intro) run.countdown = run.cd = run.intro.T;   // item 73: the reading holds may stretch the countdown
      w.emit('scnStart', { id: run.pr.sc.id, n: run.n, diff: run.pr.df.id });
      introStep(w);
    }
    // advance the intro to the countdown clock: 'tourFocus' for each stop reached (main.js glides the camera, fx.js pulses the focused
    // foes / gate ring); a start reveal spawns when the camera has ARRIVED on its foe (the tour is on), ages on the countdown clock from there and
    // ends after its linger. A skipped / cancelled tour spawns the reveals it never reached at round start (go).
    function introStep(w) {
      const I = run.intro; if (!I) return;
      I.t = Math.max(0, run.countdown - run.cd);
      while (I.tour && I.cur + 1 < I.stops.length && I.stops[I.cur + 1].t <= I.t + 1e-9) {
        const i = ++I.cur, s = I.stops[i], nx = I.stops[i + 1];
        w.emit('tourFocus', { i, kind: s.kind, focus: s.focus || null, x: s.x, y: s.y, r: s.r, ids: s.ids.slice(), glide: s.glide, hold: (nx ? nx.t : I.T) - s.t - s.glide, last: !nx });
      }
      for (const r of I.reveals) {
        if (!r.done && I.tour && r.at != null && r.at <= I.t + 1e-9) spawnReveal(w, r, r.at);
        if (r.done && !r.gone && r.start != null && r.thk && !r.thk.dead) {
          const el = Math.max(0, I.t - r.start);
          if (el >= r.linger - 1e-9) { r.gone = true; w.remove(r.thk); if (IT.Vision && IT.Vision.update && w.map) { IT.Vision.update(w); w._visT = w.t; } }
          else r.thk.age = el;
        }
      }
    }

    run.frozen = () => run.phase !== 'play';
    run.attach = (w, onSwap) => {
      run.w = w; w.ranked = run; run.onSwap = onSwap || null;
      if (!run.pr) run.next();
      w.on('heroDown', () => { if (run.phase === 'play') run.died = true; });   // foes hit back now: the hero can fall
      const foeOf = id => { const e = w.get(id); return e && run.dummies.indexOf(e) >= 0 ? e : null; };
      const st = () => run.st || (run.st = freshSt());
      const ours = id => { const s = w.get(id); return !!s && s.team === 0; };
      const touch = () => { if (st().hit == null) st().hit = w.t; };
      // which of our abilities reached a foe: a Forge Spirit's attacks count as 'forgespirit'
      const use = (src, ability) => { const s = w.get(src); if (!s || s.team !== 0) return; st().used.add(s.kind === 'spirit' ? 'forgespirit' : ability || 'attack'); };
      // how each foe was last hurt (read by the 'kill' listener) + the first touch of the run (for the 'seen' fail)
      w.on('damage', p => {
        if (run.phase !== 'play') return;
        if (w.hero && p.target === w.hero.id && foeOf(p.src) && !(p.dealt <= 0)) st().hurt = true;
        const f = foeOf(p.target); if (!f) return;
        const h = w.hero, s = w.get(p.src);
        if (ours(p.src)) { touch(); use(p.src, p.ability); }
        const rec = { ability: p.ability || 'attack', by: s ? s.kind : 'other', heroElev: w.map.elevAt(h.x, h.y), foeElev: w.map.elevAt(f.x, f.y), inv: !!IT.Status.invisible(h) };
        st().last[p.target] = rec;
        if (p.ability && ours(p.src)) st().abil[p.target] = Object.assign({ t: w.t }, rec);   // last ability (non-attack) hit, to credit a basic attack that lands the final blow
      });
      w.on('hit', p => { if (run.phase === 'play' && foeOf(p.target) && ours(p.src)) { touch(); use(p.src, p.ability); } });
      w.on('status', p => {
        if (run.phase !== 'play' || !foeOf(p.target)) return;
        if (ours(p.src)) { touch(); if (p.ability) use(p.src, p.ability); }   // Tornado lift, Cold Snap ... count as the first touch
        if (p.status === 'disarm' && p.ability === 'deafeningblast') { const b = st().blasts; if (b.length) b[b.length - 1].add(p.target); }   // foes one blast pushed
      });
      w.on('kill', p => {
        if (run.phase !== 'play' || !foeOf(p.unit)) return;
        const f = w.get(p.unit), k = Object.assign({ id: p.unit }, st().last[p.unit] || {}, { t: w.t }), a = st().abil[p.unit];
        if (f && w.map) k.inside = inPit(w.map, f.x, f.y) || (run.pr && run.pr.sc.obj.how && run.pr.sc.obj.how.mouth && pitGap(w.map, f.x, f.y) <= (MOUTH_TOL[run.difficulty().id] || 0)) ? 'pit' : null;   // v6: where it died (obj.how.inside; how.mouth = + the tier's mouth tolerance)
        if (k.ability === 'attack' && a && w.t - a.t <= ASSIST) k.assist = Object.assign({}, a, { inside: k.inside });   // an ability hurt it just before the basic attack finished it
        k.channel = f && f.channel ? f.channel.kind : null;   // v6 item 28: killed mid-channel (obj.how.channel: 'tp')
        k.openInv = st().openInv === true;                    // v6 item 28: the hero opened from invisibility (obj.how.openInv)
        if (k.assist) { k.assist.channel = k.channel; k.assist.openInv = k.openInv; }
        st().kills.push(k);
      });
      w.on('pickup', p => { if (run.phase === 'play' && !st().picked) st().picked = { team: p.team, kind: p.kind, unit: p.unit }; });   // v6 item 28
      w.on('allyDown', () => { if (run.phase === 'play') st().allyDied = true; });
      w.on('cast', p => {
        if (p.unit !== w.hero.id || run.phase !== 'play') return;
        const s = st(); s.casts[p.ability] = (s.casts[p.ability] || 0) + 1; s.castAt[p.ability] = w.t;
        // v6 item 28: was the hero's first offensive cast made from Ghost Walk? (this listener runs before Ghost Walk's own break listener)
        if (s.openInv == null && p.ability !== 'ghostwalk' && p.ability !== 'invoke') s.openInv = !!IT.Status.invisible(w.hero);
        if (SELF_OK[p.ability]) s.used.add(p.ability);
        if (p.ability === 'deafeningblast') s.blasts.push(new Set());
      });
      w.on('towerDown', p => { if (run.phase === 'play') st().towers.push({ team: p.team, tier: p.tier }); });
      w.on('itemUse', p => { if (run.phase === 'play' && foeOf(p.unit) && DETECT[p.ability]) { st().burned++; st().burnAt = w.t; } });   // v6 item 27: detection the foes burned
      enter(w);
      return run;
    };

    // localized names of spells / items ('a, b')
    const names = l => l.map(a => (IT.hasT && IT.hasT('spell.' + a) ? IT.t('spell.' + a) : IT.hasT && IT.hasT('item.' + a) ? IT.t('item.' + a) : a)).join(', ');
    // the toast detail of a 'method' fail: cfail.method.<detail> with {spells}
    const methodText = (detail, spells) => (IT.t && IT.hasT && IT.hasT('cfail.method.' + (detail || 'other')) ? IT.t('cfail.method.' + (detail || 'other'), { spells: names(spells || []) }) : detail || '');
    function conclude(ok, reason, detail, spells) {
      const w = run.w, pr = run.pr, time = w.t - run.t0;
      let pts = 0;
      if (ok) {
        run.solved++; run.streak++; run.bestStreak = Math.max(run.bestStreak, run.streak);
        if (ranked || infinite) pts = scenarioScore(diffBonus(pr.df), pr.par, time, run.streak - 1);
        run.score += pts;
        w.emit('comboDone', { id: pr.sc.id, tier: TIER_NAME[pr.sc.tier - 1] || 'basic', score: pts, time });
      } else {
        run.failed++; run.streak = 0; run.failId = pr.sc.id;
        w.emit('comboFail', { id: pr.sc.id, reason, detail: detail || null, spells: spells || null, s: reason === 'method' ? methodText(detail, spells) : '' });
      }
      // v6 end splash: one record per concluded scenario (timeline strip + best combo): id, name, ok, fail reason, time / par / limit, points, step abilities, damage dealt this turn
      const dealt = w._stats && w._stats.data && w._stats.data.damage ? Math.round(w._stats.data.damage.dealt.total || 0) : 0;
      run.log.push({ n: run.n, id: pr.sc.id, name: pr.sc.name, ok: !!ok, reason: ok ? null : reason || null, detail: ok ? null : detail || null, time: Math.round(time * 10) / 10, par: pr.par, limit: pr.limit, points: pts,
        steps: (pr.sc.steps || []).map(s => s.a).filter(a => a && a !== 'move'), dmg: Math.max(0, dealt - run.dmgMark) });
      run.dmgMark = dealt;
      run.result = { ok, reason: reason || null, detail: detail || null, spells: spells || null, points: pts, time };
      run.phase = 'result'; run.hold = RESULT_HOLD; run.held = 0; w.paused = true;
      w.emit('scnResult', { id: pr.sc.id, ok, reason: reason || null, detail: detail || null, points: pts, time });
    }

    // does one recorded kill satisfy an objective's "how"? { ability:[ids], by:'hero'|'spirit', low (hero below the foe), high, inv (hero invisible),
    // inside:'pit' (the foe died inside Roshan's crater, pitRegion) }
    const howOk = (k, how) => {
      if (!how) return true;
      if (how.ability && how.ability.indexOf(k.ability) < 0) return false;
      if (how.by && k.by !== how.by) return false;
      if (how.low && !(k.heroElev < k.foeElev)) return false;
      if (how.high && !(k.heroElev > k.foeElev)) return false;
      if (how.inv && !k.inv) return false;
      if (how.inside && k.inside !== how.inside) return false;
      if (how.channel && k.channel !== how.channel) return false;   // v6 item 28: died mid-channel (TP)
      if (how.openInv && !k.openInv) return false;                  // v6 item 28: the fight opened from Ghost Walk
      return true;
    };
    run.howOk = howOk;
    // a kill passes the objective's `how`, or it was a basic attack finishing a foe that a qualifying ability hit <= ASSIST s earlier (that ability gets the credit)
    const killOk = (k, how) => howOk(k, how) || (k.ability === 'attack' && !!k.assist && howOk(k.assist, how));
    run.killOk = killOk;
    // n kills by one ability within `span` s of each other (one cast)
    const burst = (kills, n, span) => {
      const by = {};
      for (const k of kills) (by[k.ability] = by[k.ability] || []).push(k.t);
      return Object.keys(by).some(a => { const t = by[a].sort((x, y) => x - y); for (let i = 0; i + n - 1 < t.length; i++) if (t[i + n - 1] - t[i] <= span) return true; return false; });
    };
    run.burst = burst;
    const killsOk = (o, kills) => (o.one ? burst(kills, o.n, o.span || 1.2) : kills.length >= o.n);

    function check(w) {
      const pr = run.pr, sc = pr.sc, o = sc.obj, h = w.hero, el = w.t - run.t0, st = run.st;
      const alive = run.dummies.filter(d => !d.dead), fail = sc.fail || [];
      // fail conditions first (a lethal mistake beats a simultaneous win)
      // the hero falling always ends the scenario in every tier; the world refills its hp so the sim keeps running (see Combat.damage)
      if (run.died) return conclude(false, 'died');
      if (fail.indexOf('cross') >= 0 && w.gate) for (const d of alive) if (Math.hypot(d.x - w.gate.x, d.y - w.gate.y) < w.gate.r) return conclude(false, 'cross');
      // tower: the hero stepped into a living Dire tower's range
      if (fail.indexOf('tower') >= 0) for (const e of w.ents) if (e.kind === 'tower' && e.team === 1 && !e.dead && e.hp > 0 && Math.hypot(e.x - h.x, e.y - h.y) < e.attack.range + (h.radius || 0)) return conclude(false, 'tower');
      // seen: an enemy noticed the hero (vision) before anything of ours had touched a foe
      if (fail.indexOf('seen') >= 0 && st.hit == null) for (const d of alive) if (d.kind === 'enemy' && d.aware) return conclude(false, 'seen');
      // v6 item 28: our ally fell / our tower fell / a Town Portal finished (also a TP'd unit that left the map) / the pickup race
      if (st.allyDied && fail.indexOf('allyDied') >= 0) return conclude(false, 'allyDied');
      if (fail.indexOf('towerLost') >= 0 && st.towers.some(t => t.team === 0)) return conclude(false, 'towerLost');
      for (const d of run.dummies) if (d.tpEscaped) return conclude(false, 'escaped');   // v6 #50 farm_then_tp / item 28 tpPlan: the Town Portal finished
      if (o.type === 'pickup' && st.picked && (!o.kind || st.picked.kind === o.kind)) return st.picked.team === 0 ? conclude(true) : conclude(false, 'taken', st.picked.kind);
      // 'attack' => the toast says it was an auto-attack and names what the scenario wanted
      if (o.how) {
        const bad = st.kills.find(k => !killOk(k, o.how));
        if (bad && o.how.inside && bad.inside !== o.how.inside) return conclude(false, 'method', 'outside');   // v6 pit_trap: died outside the pit
        if (bad && bad.ability !== 'attack' && o.how.channel && bad.channel !== o.how.channel) return conclude(false, 'method', 'channel');   // v6 item 28: not mid-TP
        if (bad && bad.ability !== 'attack' && o.how.openInv && !bad.openInv) return conclude(false, 'method', 'openInv');                 // v6 item 28: not from Ghost Walk
        if (bad) return conclude(false, 'method', bad.ability === 'attack' ? 'attack' : 'other', bad.ability === 'attack' ? (o.how.ability || pr.need) : null);
      }
      // v6: a kill only counts once every step spell / item hit a foe (or, self ones, was cast); the toast names the missing ones.
      // A spell still in flight at the kill (cast within IN_FLIGHT s: Sun Strike delay, Blast wave, Meteor fall) counts too, so a Meteor
      // burn that finishes the foe a moment before the last nuke lands is not a fail
      // playtest 2: area defence (every 'hold' and every gate / 'cross' scenario): wiping out every foe IS the defence -> an immediate win
      if ((o.type === 'hold' || (fail.indexOf('cross') >= 0 && w.gate)) && run.dummies.length && !alive.length) return conclude(true);
      // #30: in an escape a cast is enough (a chaser may BKB the Tornado)
      // #30 I11: a foe that stood in one of our ground zones (Sun Strike / Meteor / EMP) when it appeared and walked out of it on a tier with
      // exec.dodge sidestepped it: a step of that spell that then misses is reported as 'dodged' (hint: lock it first), not a plain 'missing'
      for (const z of w.ents) {
        if (!z.danger || z.team !== h.team) continue;
        let rec = st.dz[z.id];
        if (!rec) { rec = st.dz[z.id] = { ab: z.ability, in: new Set() }; for (const d of alive) if (Math.hypot(d.x - z.danger.x, d.y - z.danger.y) <= z.danger.r + (d.radius || 0)) rec.in.add(d.id); }
        for (const d of alive) if (rec.in.has(d.id) && d.exec && d.exec.dodge && Math.hypot(d.x - z.danger.x, d.y - z.danger.y) > z.danger.r + (d.radius || 0)) st.dodged.add(rec.ab);
      }
      const won = () => {
        const miss = (pr.need || []).filter(a => !st.used.has(a) && !(st.castAt[a] != null && w.t - st.castAt[a] <= IN_FLIGHT) && !(o.type === 'escape' && st.casts[a]));
        if (!miss.length) return conclude(true);
        const dodged = miss.some(a => st.dodged.has(a)), hintsOff = IT.Settings && IT.Settings.get && IT.Settings.get().hints === false;   // the 'dodged' text is a hint: gated by the player hints setting
        return conclude(false, 'method', dodged && !hintsOff ? 'dodged' : 'missing', miss);
      };
      if (o.type === 'kill' || o.type === 'kill_with') { if (!alive.length) return won(); }
      else if (o.type === 'killN') {
        if (killsOk(o, st.kills)) return won();
        // impossible now: everyone dead, or (one cast) too few left and the last kill is too old to join a new burst
        const lastK = st.kills.length ? st.kills[st.kills.length - 1].t : -1e9;
        if (!alive.length || (o.one ? alive.length < o.n && w.t - lastK > (o.span || 1.2) : alive.length + st.kills.length < o.n)) return conclude(false, 'method', o.one ? 'burst' : 'other');
      }
      else if (o.type === 'push') { if (st.blasts.some(b => b.size >= o.n)) return conclude(true); }
      else if (o.type === 'destroyTower') { if (st.towers.some(t => t.team === (o.team == null ? 1 : o.team))) return conclude(true); }
      else if (o.type === 'rootAll') { if (alive.length && alive.every(d => IT.Status.has(d, 'root') || IT.Status.has(d, 'atosRoot'))) return conclude(true); }
      else if (o.type === 'escape' || o.type === 'reach') {
        // v6: caught = a foe hurt the hero, or the hero is VISIBLE to the enemy team (Ghost Walk hides it unless a Dire tower's true sight /
        // a reveal shows it) with a foe within CAUGHT
        // playtest 2: obj.caught = a per-scenario visible-contact distance; obj.bump = a foe that walks into the INVISIBLE hero finds it too
        if (st.hurt) return conclude(false, 'caught');
        const vis = heroSeen(w), reach = vis ? o.caught || CAUGHT : o.bump || 0;
        if (reach > 0) for (const d of alive) if (Math.hypot(d.x - h.x, d.y - h.y) < reach) return conclude(false, 'caught', vis ? null : 'bump');
        // v6 item 27 (juke): obj.unseen = win once the enemy team has not seen the hero for that many s in a row; obj.burn = the foes must
        // first spend that many detection items (Dust, itemUse events; the unseen streak counts from the last burn); 'reach' = get into
        // the goal ring (w.goal, obj.spot); obj.noInvis = a juke without Ghost Walk (casting it is the 'method' fail)
        if (o.noInvis && st.casts.ghostwalk) return conclude(false, 'method', 'invis');
        if (vis) st.unseenFrom = null; else if (st.unseenFrom == null) st.unseenFrom = w.t;
        if (st.burnAt != null && st.unseenFrom != null && st.unseenFrom < st.burnAt) st.unseenFrom = st.burnAt;
        const burnOk = !o.burn || st.burned >= o.burn;
        if (o.type === 'reach') { if (burnOk && w.goal && Math.hypot(h.x - w.goal.x, h.y - w.goal.y) < w.goal.r) return conclude(true); }
        else {
          if (o.unseen && burnOk && st.unseenFrom != null && w.t - st.unseenFrom >= o.unseen - 1e-9) return conclude(true);
          if (el >= o.time) return !burnOk ? conclude(false, 'method', 'burn') : o.unseen ? conclude(false, 'time') : won();
          return;
        }
      }
      else if (o.type === 'hold') { if (el >= o.time) return conclude(true); return; }
      for (const d of alive) if ((d.scn.mot === 'flee' || fail.indexOf('escaped') >= 0) && Math.hypot(d.x - h.x, d.y - h.y) > ESCAPED) return conclude(false, 'escaped');
      if (mode !== 'sandbox' && el >= pr.limit) return conclude(false, 'time');
    }

    // scripted dummies: flee (run directly away from the hero) / march (to the gate) / chase (by sight, see chase())
    function script(w) {
      const h = w.hero;
      funTick(w, w.t - run.t0);   // v6 item 28: timed pickups, Roshan's ttl
      let seen = null;   // lazily: only chasers need it
      for (const d of run.dummies) {
        if (d.dead || (d.scn.mot !== 'flee' && d.scn.mot !== 'chase' && d.scn.mot !== 'march' && d.scn.mot !== 'kite') || w.t < d.scn.next || !IT.Status.canMove(d)) continue;
        if (d.orders[0] && d.orders[0].type === 'attack') continue;   // a chaser that has reached the hero is busy hitting it
        if (IT.Intent && IT.Intent.held(w, d)) continue;   // v6 #52: innate blink wind-up / Cold Snap deny / TP channel
        d.scn.next = w.t + 0.35;
        const J = IT.Intent ? IT.Intent.jit : () => ({ x: 0, y: 0 });   // v6 #50: tier waypoint error (exec.jitter)
        if (d.scn.mot === 'march') {   // walks to the line it must not cross
          if (w.gate && (!d.orders[0] || d.orders[0].type !== 'move')) { const j = J(w, d, Math.min(1, 0.6 * w.gate.r / Math.max(1, (d.exec && d.exec.jitter) || 1))); IT.Orders.issue(w, d, { type: 'move', x: w.gate.x + j.x, y: w.gate.y + j.y }); }
        } else if (d.scn.mot === 'kite') kite(w, d, h);
        else if (d.scn.mot === 'flee') {
          const a = (d.intent && d.intent.kind === 'flee_to_tower' && IT.Intent ? IT.Intent.fleeAng(w, d, h) : Math.atan2(d.y - h.y, d.x - h.x));
          let x = d.x + Math.cos(a) * 900, y = d.y + Math.sin(a) * 900;
          if (!w.map.walkable(x, y)) {   // wall ahead: slide sideways
            const p = IT.Nav.nearestWalkable(w.map, x, y); if (p) { x = p.x; y = p.y; }
          }
          IT.Orders.issue(w, d, { type: 'move', x, y });
        } else { if (seen == null) seen = heroSeen(w); chase(w, d, h, seen); }
      }
    }
    // chase (v6): while the enemy team SEES the hero, run at it and remember the spot. Unseen (Ghost Walk outside a Dire tower's true sight,
    // fog, high ground), the hero's real position is never read.
    // v6 item 27: a chaser with a belief (IT.Belief, see belief.js) walks to the LIVE prediction (last heading x time, biased toward gaps /
    // ramps / home at higher tiers), stands confused there ('juked'), then searches a widening ring around it (split bearings at hard+).
    // Detection: a Dust carrier dusts on arriving at the prediction (useDust: hidden hero only, reaction wait, telegraph); at hard+ (P.detect)
    // also early, mid-walk, once confidence >= P.dustConf and the prediction is within half the dust radius. Re-catch (hard+): on a reacquire a chaser holding P.recatch items Blinks short of the hero / Force Staffs toward it, telegraphed ('blinkTell').
    function chase(w, d, h, seen) {
      const c = d.scn, B = d.belief;
      if (!B || !IT.Belief) return chaseRing(w, d, h, seen);
      const Bel = IT.Belief, P = B.P;
      Bel.observe(w, B, h, seen);
      if (seen) {
        c.lastSeen = { x: h.x, y: h.y, t: w.t }; c.search = null;
        if (recatch(w, d, h, B)) return;
        IT.Orders.issue(w, d, { type: 'move', x: h.x, y: h.y }); return;   // (chase quality per tier = the belief params, df.belief)
      }
      if (!B.last) {   // never saw it: search around itself (no '?': it was never fooled)
        B.last = { x: d.x, y: d.y, t: w.t }; B.pred = { x: d.x, y: d.y }; B.own = true;
        B.state = 'searching'; B.since = w.t; B.search = { t0: w.t, k: 0, to: null, cx: d.x, cy: d.y };
      }
      if (!c.lastSeen) c.lastSeen = { x: B.last.x, y: B.last.y, t: B.last.t, own: !!B.own };
      const L = { x: B.pred.x, y: B.pred.y, t: B.last.t };   // Dust spot = the prediction (= last seen for a standing hero)
      if (d.tele) return;   // telegraphing an item
      if (B.state === 'lost') return;   // a beat before it commits to a guess (LOST_HOLD)
      const sensed = !!(B.last && B.last.sensed);   // v6 #58: a Ghost-Walk guess: no early mid-walk Dust (the tier-rolled one is units.js tickGhostSense)
      if (B.state === 'predicted') {
        if (P.detect && !B.own && !sensed && B.conf >= P.dustConf && Math.hypot(d.x - L.x, d.y - L.y) <= dustR() * 0.5 && IT.Units.useDust(w, d, { x: d.x, y: d.y, t: B.last.t })) { if (d.orders.length) IT.Orders.issue(w, d, { type: 'stop' }); return; }
        if (Math.hypot(d.x - L.x, d.y - L.y) > Bel.ARRIVE) {
          const o = d.orders[0];
          if (!o || o.type !== 'move' || Math.hypot(o.x - L.x, o.y - L.y) > 30) IT.Orders.issue(w, d, { type: 'move', x: L.x, y: L.y });
          return;
        }
        Bel.juke(w, B);
      }
      // a Dust carrier holds the predicted spot for its reaction time + telegraph, dusts it once (IT.Units.useDust), then searches
      if (!B.own && IT.Units.useDust(w, d, L)) { if (d.orders.length) IT.Orders.issue(w, d, { type: 'stop' }); return; }
      if (B.state === 'juked') { if (d.orders.length) IT.Orders.issue(w, d, { type: 'stop' }); return; }
      if (B.state !== 'searching') return;
      const S = B.search, o = d.orders[0];
      c.search = S;
      if (S.to && o && o.type === 'move' && Math.hypot(d.x - S.to.x, d.y - S.to.y) > 50) return;   // still walking to the current probe
      const p = Bel.probe(w, B);
      if (p) IT.Orders.issue(w, d, { type: 'move', x: p.x, y: p.y });
    }
    const dustR = () => (IT.Values && IT.Values.item ? IT.Values.item('item_dust', 'radius') : 0) || 1050;
    // hard+ re-catch: just reacquired (<= 1 s) -> Blink to a point short of the hero, else Force Staff toward it
    function recatch(w, d, h, B) {
      const R = B.P.recatch;
      if (!Array.isArray(R) || !R.length || d.tele || !d.items || !IT.Units.useItem || !IT.Status.canAct(d)) return false;
      const dd = Math.hypot(h.x - d.x, h.y - d.y), fresh = B.reacq != null && w.t - B.reacq <= 1.0;
      if (!fresh) return false;   // only right after a reacquire (a re-catch, not an opener)
      const ang = Math.atan2(h.y - d.y, h.x - d.x), has = id => R.indexOf(id) >= 0 && d.items.some(s => s && s.id === id);
      const tell = () => w.emit('fx', { name: 'blinkTell', x: d.x, y: d.y, unit: d.id, dur: Math.max(0.35, d.telegraph || 0) });
      if (has('blink') && dd > 350) {
        const range = (IT.Values.item('item_blink', 'blink_range') || 1200) * 0.95, k = Math.min(range, dd - 150);
        const p = nearWalk(w, d.x + Math.cos(ang) * k, d.y + Math.sin(ang) * k);
        if (dd - 150 <= range + 1 && IT.Units.useItem(w, d, 'blink', { x: p.x, y: p.y })) { tell(); return true; }
      }
      if (has('forcestaff') && dd > 300 && dd < 800 && IT.Units.useItem(w, d, 'forcestaff', { face: ang })) { d.facing = ang; tell(); return true; }
      return false;
    }
    // v6 #50 intent 'kite': keep ENEMY.intent.kite.min..max from the hero (back off along the tower-bent flee line, close in while seen)
    function kite(w, d, h) {
      const K = IT.GAME.ENEMY.intent.kite, B = d.belief, seen = heroSeen(w);
      const at = seen ? h : (B && IT.Belief ? IT.Belief.where(B) : null) || (d.ai && d.ai.heroAt) || null;
      if (!at) return;
      const dd = Math.hypot(at.x - d.x, at.y - d.y), j = IT.Intent.jit(w, d, 0.5);
      if (dd < K.min) { const a = IT.Intent.fleeAng(w, d, at), p = nearWalk(w, d.x + Math.cos(a) * 400 + j.x, d.y + Math.sin(a) * 400 + j.y); IT.Orders.issue(w, d, { type: 'move', x: p.x, y: p.y }); }
      else if (dd > K.max && seen) { const a = Math.atan2(at.y - d.y, at.x - d.x), k = dd - (K.min + K.max) / 2, p = nearWalk(w, d.x + Math.cos(a) * k + j.x, d.y + Math.sin(a) * k + j.y); IT.Orders.issue(w, d, { type: 'move', x: p.x, y: p.y }); }
      else if (d.orders.length && d.orders[0].type === 'move') IT.Orders.issue(w, d, { type: 'stop' });
    }
    // the pre-belief chase (no IT.Belief loaded): last seen spot, Dust, then a widening ring around it
    function chaseRing(w, d, h, seen) {
      const c = d.scn;
      if (seen) { c.lastSeen = { x: h.x, y: h.y, t: w.t }; c.search = null; IT.Orders.issue(w, d, { type: 'move', x: h.x, y: h.y }); return; }
      if (!c.lastSeen) c.lastSeen = { x: d.x, y: d.y, t: w.t, own: true };   // never saw it: search around itself
      const L = c.lastSeen;
      if (!c.search) {
        if (Math.hypot(d.x - L.x, d.y - L.y) > 60) { IT.Orders.issue(w, d, { type: 'move', x: L.x, y: L.y }); return; }
        if (!L.own && IT.Units.useDust(w, d, L)) { if (d.orders.length) IT.Orders.issue(w, d, { type: 'stop' }); return; }
        c.search = { t0: w.t, k: 0, to: null };
      }
      const S = c.search, o = d.orders[0];
      if (S.to && o && o.type === 'move' && Math.hypot(d.x - S.to.x, d.y - S.to.y) > 50) return;
      const R = Math.min(SEARCH_MAX, SEARCH_R0 + SEARCH_GROW * (w.t - S.t0));
      const a = (c.idx / Math.max(1, c.n)) * Math.PI * 2 + S.k * 2.39996 + (w.rng() - 0.5) * 0.8, r = R * (0.6 + 0.4 * w.rng());
      S.k++;
      S.to = nearWalk(w, L.x + Math.cos(a) * r, L.y + Math.sin(a) * r);
      IT.Orders.issue(w, d, { type: 'move', x: S.to.x, y: S.to.y });
    }

    function finish(reason) {
      if (run.ended) return run.summary;
      run.ended = true;
      const w = run.w;
      if (w) w.paused = true;
      // v6 medal: score = clearScore (scenario points, run.score) + relicScore (this run's relic progress, StatsCollector.relicScore; ranked only)
      const SC = IT.StatsCollector, rel = ranked && w && w._stats && SC && SC.relicScore ? SC.relicScore(w._stats.data.relics) : { score: 0, parts: [] };
      const clearScore = ranked || infinite ? run.score : 0, relicScore = ranked ? rel.score : 0;
      const sum = { mode, combos: run.solved, solved: run.solved, fails: run.failed, bestStreak: run.bestStreak, score: clearScore + relicScore, clearScore, relicScore, relicParts: rel.parts, reason: reason || 'time',
        turns: run.turns, diff: run.pr ? run.pr.df.id : null, level: run.maxLevel || null, log: run.log.slice() };
      if (ranked && (run.n > 0 || run.solved + run.failed > 0)) sum.rank = record(sum.score);
      if (infinite) {
        const r = recordInfinite(run.solved), sc = run.failId ? IT.SCENARIOS.get(run.failId) : null;
        Object.assign(sum, { cleared: r.cleared, best: r.best, prevBest: r.prev, newBest: r.isNew && r.cleared > 0, failId: run.failId, failName: sc ? sc.name : null, failReason: run.result && !run.result.ok ? run.result.reason : null, failDetail: run.result && !run.result.ok ? run.result.detail : null, laps: run.lap() });
      }
      run.summary = sum;
      if (w) w.emit('modeEnd', sum);
      return sum;
    }
    run.finish = finish;

    function nextScenario() {
      const w = run.w;
      run.n++;
      if (run.turns != null && run.n >= run.turns) { finish('turns'); return; }   // ranked: fixed number of scenarios
      if (infinite && run.failed > 0) { finish('fail'); return; }   // infinite: the first failed scenario ends the run
      run.next();
      enter(w);
      if (run.onSwap) run.onSwap(run);
    }

    run.redo = () => { if (run.w && !run.ended) { enter(run.w); if (run.onSwap) run.onSwap(run); } };   // replay the current scenario

    // round start: the tour ends, reveals the camera never reached appear now (full linger, aged by play). 'scnGo' { early }: early = an action
    // cancelled the intro (main.js releases the camera where it is, item 45: no re-centre)
    function go() {
      const w = run.w, I = run.intro, early = run.cd > 1e-6;
      if (I) { I.tour = false; introStep(w); for (const r of I.reveals) if (!r.done) spawnReveal(w, r, null); }
      run.cd = 0; run.phase = 'play'; run.t0 = w.t; w.paused = false; w.emit('scnGo', { early });
    }
    // skip the pre-scenario countdown (any action key / Start button); false if not counting down
    run.skip = () => { if (run.ended || !run.w || run.phase !== 'countdown') return false; go(); return true; };
    // v6 item 13: end only the camera tour (F1 / center): the camera goes back to the hero, the briefing + countdown keep running
    run.skipTour = () => {
      const I = run.intro;
      if (run.ended || !run.w || run.phase !== 'countdown' || !I || !I.tour) return false;
      I.tour = false; run.w.emit('tourEnd', { skipped: true });
      return true;
    };
    // item 73: the first key / click ADVANCES one piece of the text phase (the clock jumps to the next block's start; after the last piece landed, to the
    // end of the row hold = the pan); Esc SKIPS all (the rest of the text phase + the pan; the countdown itself keeps running). false = nothing to do
    function jump(d) {
      if (d <= 0) return;
      const w = run.w, inv = w.hero && w.hero.inv;
      if (inv && inv.invokeCd > 0) { inv.invokeCd -= d; if (inv.invokeCd < 1e-9) inv.invokeCd = 0; }
      run.cd = Math.max(1e-6, run.cd - d); introStep(w);
    }
    run.advanceIntro = () => {
      const I = run.intro;
      if (run.ended || !run.w || run.phase !== 'countdown' || !I || !I.text || I.t >= I.text.hold - 1e-9) return false;
      const tp = I.text, nx = tp.blocks.find(b => b.at > I.t + 1e-9);
      jump((nx ? nx.at : I.t < tp.end - 1e-9 ? tp.end : tp.hold) - I.t);
      return true;
    };
    run.skipIntro = () => {
      const I = run.intro;
      if (run.ended || !run.w || run.phase !== 'countdown' || !I) return false;
      const live = I.text && I.t < I.text.hold - 1e-9, tour = !!I.tour;
      if (!live && !tour) return false;
      if (tour) { I.tour = false; run.w.emit('tourEnd', { skipped: true }); }
      if (live) jump(I.text.hold - I.t);
      return true;
    };
    run.touring = () => !!(run.intro && run.intro.tour && run.phase === 'countdown' && !run.ended);
    // playtest 2: leave the result card (any key / click). false while not in 'result' or before RESULT_MIN s have shown it
    run.cont = () => { if (run.ended || !run.w || run.phase !== 'result' || (run.held || 0) < RESULT_MIN) return false; nextScenario(); return true; };

    // advance by dt seconds. Frozen phases come from main.js (real dt), play comes from the sim system (w.dt)
    run.tick = dt => {
      if (run.ended || !run.w) return;
      const w = run.w;
      // the result card is a pause: it never eats the run clock (nor the scenario timer: w.t is frozen)
      if (run.runLeft != null && run.phase !== 'idle' && run.phase !== 'result') {
        run.runLeft -= dt;
        if (run.runLeft <= 0) { run.runLeft = 0; finish('time'); return; }
      }
      if (run.phase === 'countdown') {
        const inv = w.hero && w.hero.inv;   // v6: Invoke works during the countdown, so its cooldown ticks too (the world is frozen)
        if (inv && inv.invokeCd > 0) { inv.invokeCd -= dt; if (inv.invokeCd < 1e-9) inv.invokeCd = 0; }
        run.cd -= dt; introStep(w); if (run.cd <= 0) go();
      }
      else if (run.phase === 'result') { run.held = (run.held || 0) + dt; run.hold -= dt; if (run.hold <= 0) nextScenario(); }
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
      score: r.ranked || r.infinite ? r.score : null, cleared: r.infinite ? r.solved : null,
      scenario: loc(pr.sc.name), objective: loc(pr.sc.goal),
      // extras
      mode: r.mode, id: pr.sc.id, n: r.n, solved: r.solved, failed: r.failed, streak: r.streak, bestStreak: r.bestStreak,
      diff: pr.df.id, diffDesc: loc(pr.df.desc), hints: !!pr.df.hints, tip: loc(pr.sc.tip), spells: sol.filter(s => IT.GAME.SPELL_ORBS[s.a]).map(s => s.a),
      result: r.result,
      // result card: canGo once RESULT_MIN s have shown it; auto = whole seconds to the auto-continue
      hold: r.phase === 'result' ? { canGo: (r.held || 0) >= RESULT_MIN, auto: Math.max(0, Math.ceil(r.hold - 1e-9)), held: r.held || 0 } : null,
      level: pr.sc.level || null, heroLevel: pr.lo.heroLevel, mapName: w.map && w.map.name ? loc(w.map.name) : null,
      twist: pr.twist ? pr.twist : null, twistName: pr.twist && TWISTS[pr.twist] ? loc(TWISTS[pr.twist].name) : null,
    };
  }

  IT.Ranked = {
    TURNS, COUNTDOWN, INTRO_MIN, REVEAL_LINGER, REVEAL_R, REVEAL_VIS, revealOn, revealLinger, buildIntro, textPlan, readHold, STEP_D, ROW_HOLD, PAN_MIN, READ_FLOOR, TITLE_FLOOR, STAGE_MIN, STAGE_MAX, FLY_S, TEXT_MIN, TEXT_MAX, faceFoes, RESULT_HOLD, RESULT_MIN, RESULT_AUTO,
    streakMult, scenarioScore, diffBonus, DIFF_BONUS_MAX, expected, ratingDelta, baseDiff, rampDiff, capDiff, TOP_LVL, rankKey, INF_MIN_LEVEL, INF_COUNTDOWN,
    infiniteProfile, infiniteResult, recordInfinite, resetInfinite, infDifficulty,
    GOAL_R, GEM_R, spotOf, jukeUnit, DETECT,
    profile, record, reset, load, prepare, pitRegion, inPit, pitGap, MOUTH_TOL, pushEnd, loadoutAt, baseLevel, feasible, rollLevel, LVL_SPREAD, LVL_SEARCH, apply, create, hud, spot, arenas, TWISTS, variation, VARY,
    comboDamage, foeHp, towerMath, limitOf, PICK_R0, fightTime, worldFog, needOf, heroSeen, FUN_TAGS, FUN_TURNS, isFun, CAUGHT, HP_SHARE, HP_CAP, ATTACK_WINDOW,
  };
})(typeof window !== 'undefined' ? window : globalThis);
