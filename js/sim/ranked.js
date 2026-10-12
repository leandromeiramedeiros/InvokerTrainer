// Ranked / Combo Practice / scenario sandbox: scoring, rating, run state machine, scenario swap + objectives. Owner: S3.
// Pure (no DOM). Persistent rating lives in localStorage 'it2.rank' (guarded; in-memory fallback).
// Flow of a scenario run: countdown (world frozen) -> play (sim time) -> result (frozen) -> next scenario.
// main.js drives tick(realDt) while frozen; the 'ranked' sim system drives it per step while playing.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const KEY = 'it2.rank', IKEY = 'it2.inf';
  const TURNS = 8, COUNTDOWN = 10, SOLO_COUNTDOWN = 3, RESULT_HOLD = 1.6, SLACK = 6, CAUGHT = 110, ESCAPED = 1900, HIST = 40, ASSIST = 0.5;
  // v6: tags of the "fun" scenarios (fog, invisibility, river, prediction, vision); a ranked run gives at least FUN_TURNS of its turns to them
  const FUN_TAGS = ['fog', 'invisible', 'river', 'prediction', 'vision'], FUN_TURNS = 4;
  const isFun = sc => (sc.tags || []).some(t => FUN_TAGS.indexOf(t) >= 0);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lang = () => IT.lang || 'en';
  const loc = o => (o && typeof o === 'object' ? o[lang()] || o.en : o);
  const TIER_NAME = ['basic', 'intermediate', 'advanced'];
  const INF_MIN_LEVEL = 6, INF_COUNTDOWN = 5;   // infinite run: the hard end of the scenario pool, bambam, 5 s countdown
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
      timer: Math.max(0.6, base.timer * Math.pow(0.95, lap)), mult: base.mult * (1 + 0.15 * lap),
    });
  }

  // ---------------------------------------------------------------- scenario preparation (pure)
  // sc + difficulty -> { sc, df, lo, fog, par, limit, skin, hp (per-foe hp of kill scenarios, or null), need (step abilities that must hit) }
  // v6: no pre-invoked spells (the countdown is for invoking), fog of war always on, kill-scenario foe hp derived from the steps (foeHp).
  function prepare(sc, df, skin) {
    const H = sc.hero || {}, base = IT.RULES.autoLoadout(H.lvl || 25, H.style || 'qe'), cut = df.orbCut || 0;
    const orbs = {};
    for (const k of IT.RULES.orbs) orbs[k] = base.orbs[k] > 0 ? Math.max(1, base.orbs[k] - cut) : 0;
    const lo = IT.Loadout.normalize({
      heroLevel: base.heroLevel, orbs, talents: base.talents, scepter: !!H.scepter, scepterOrb: H.scepter || null,
      shard: !!H.shard, shardSpell: H.shard || null, items: (H.items || []).slice(), skin: skin || IT.GAME.SKINS[0], preset: df.preset, mode: 'free',
    });
    const esc = sc.obj.type === 'escape' || sc.obj.type === 'hold';
    const limit = esc ? sc.obj.time : sc.limit != null ? sc.limit : Math.ceil(sc.par * df.timer + SLACK);
    const kill = !!KILL_TYPES[sc.obj.type];
    return { sc, df, lo, fog: true, par: sc.par, limit, skin: lo.skin, twist: null, hp: kill ? foeHp(sc, df, lo) : null, need: kill ? needOf(sc) : [] };
  }

  // ---------------------------------------------------------------- v6: foe hp from the scenario's own combo (pure, IT.Values with the scenario loadout ctx)
  // Every damaging step is credited at its full KV value (effective: x armor for physical, x (1 - ENEMY.magicRes) for magical):
  //   Chaos Meteor = impacts on a still target ((r + hull) / (speed x interval) + 1) x main_damage + burn_dps x burn_duration;
  //   Sun Strike = damage (pure; a 'mid' strike is split over the foes, Cataclysm = count x pct x damage on each); Deafening Blast = damage;
  //   Tornado = base + quas + wex damage; Cold Snap = freeze_damage x SNAP_PROCS; EMP = min(mana_burned, foe mana) x damage_per_mana_pct;
  //   Ice Wall = 0 (a zone the foe may never touch); Forge Spirits = count x spirit dps x ATTACK_WINDOW; an 'attack' step = hero dps (+ Alacrity when the
  //   steps cast it) x ATTACK_WINDOW; Gleipnir / Meteor Hammer = their KV unit damage. Steps at d0/lead credit foe 0, d1 foe 1, mid (and
  //   Cataclysm) every foe. foe hp = HP_SHARE x credited damage x tier hpMul: the whole combo is needed, with ~15% slack for a sloppy hit.
  const KILL_TYPES = { kill: 1, kill_with: 1, killN: 1 }, TOWER_HULL = 72;   // towers.js RADIUS
  const HP_SHARE = 0.85, ATTACK_WINDOW = 4, SNAP_PROCS = 3, IN_FLIGHT = 2;
  const NO_NEED = { move: 1, attack: 1 };
  // step abilities that cannot hit a foe: they count once the hero casts them (Ice Wall is a zone in front of the hero: a slow / block, not a hit)
  const SELF_OK = { ghostwalk: 1, alacrity: 1, blink: 1, refresher: 1, forcestaff: 1, bkb: 1, boots: 1, travels: 1, icewall: 1 };
  const needOf = sc => (sc.steps || []).map(s => s.a).filter((a, i, l) => !NO_NEED[a] && l.indexOf(a) === i);
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
    // a foe that pops its BKB (useBkb) takes KV spell_reduce % less magic damage from every step after the opener
    const bkb = all.map(i => { const u = (sc.units || [])[i] || {}; return u.useBkb && (u.items || []).indexOf('bkb') >= 0 ? 1 - gi('bkb', 'spell_reduce') / 100 : 1; });
    let si = -1;
    for (const s of steps) {
      si++;
      const a = s.a, to = s.at === 'd1' ? [Math.min(1, n - 1)] : s.at === 'mid' || (a === 'sunstrike' && s.at === 'self' && cata > 0) ? all : s.at === 'tower' ? [] : [0];
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
      if (!(d > 0) || !to.length) continue;
      const mag = a !== 'sunstrike' && a !== 'forgespirit' && a !== 'attack';
      parts.push({ a, foes: to, dmg: d });
      for (const i of to) foes[i] += mag && si > 0 ? d * bkb[i] : d;
    }
    return { foes, parts };
  }
  // per-foe hp (null when the steps credit no damage at all: the old fixed formula applies)
  function foeHp(sc, df, lo) {
    const c = comboDamage(sc, df, lo), pos = c.foes.filter(v => v > 0);
    if (!pos.length) return null;
    const lo0 = Math.min.apply(null, pos), mul = df.hpMul != null ? df.hpMul : 1;
    return c.foes.map(v => Math.round(Math.max(100, HP_SHARE * (v > 0 ? v : lo0) * mul)));
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
    return { hp, walk, setup, tAttack, tCombo, tHammer, hammer: ham ? ham.impact + ham.burn * ham.dur : 0, limit: sc.limit != null ? sc.limit : Math.ceil(sc.par * df.timer + SLACK) };
  }

  // world fog for main.js start(): a scenario run (ranked / infinite / sandbox scenario: `pr` = its first prepared scenario) always uses the
  // scenario's fog (always on, v6); only Free Play (pr null) honours the loadout's "Fog of war" checkbox (opts.fog, default on)
  const worldFog = (opts, pr) => (pr ? pr.fog !== false : !(opts && opts.fog === false));

  // tier dummy behaviour -> enemy NPC behaviour ('evasive' foes wander and dodge ground danger on foot)
  const ENEMY_BEHAVIOR = { stationary: 'stationary', wander: 'wander', evasive: 'wander' };

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
  // tags of arena a seen from base (static map tags + relative ones)
  function tagsOf(w, a, base) {
    const map = w.map, ea = map.elevAt(a.x, a.y), eb = map.elevAt(base.x, base.y), out = a.tags.slice();
    out.push(ea > eb ? 'high' : ea < eb ? 'low' : 'level');
    const V = IT.Vision, far = Math.hypot(a.x - base.x, a.y - base.y) > HERO_SIGHT;
    out.push(far || ea > eb || (V && !V.los(map, base.x, base.y, a.x, a.y)) ? 'hidden' : 'seen');
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
      if (s.has && !arenas(w, s.has, a).some(b => { const db = dist2(a, b); return db >= (s.has.d || [0, 1e9])[0] && db <= (s.has.d || [0, 1e9])[1]; })) return false;
      return true;
    };
    const all = ((map.spawns && map.spawns.arenas) || []).filter(ok);
    let pool = all.filter(a => dist(a) >= d[0] && dist(a) <= d[1]);
    if (!pool.length) pool = all;
    return pool.sort((a, b) => Math.abs(dist(a) - mid) - Math.abs(dist(b) - mid));
  }
  const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
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
      const q = { x: p.x + (w.rng() * 2 - 1) * o.jit, y: p.y + (w.rng() * 2 - 1) * o.jit };
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
    if (o.jit) p = jitter(w, p, base, o, s);
    return nearWalk(w, p.x, p.y);
  }

  // ranked twists: one cheap modifier on top of a scenario (picked per stage, seeded). ok(sc) = compatible. (v6: no 'fog' twist, fog is always on)
  const TWISTS = {
    swift: { ok: sc => (sc.units || []).length > 0, name: { en: 'Swift foes (+15% speed)', pt: 'Inimigos velozes (+15% velocidade)' } },
    tough: { ok: sc => (sc.units || []).length > 0 && sc.obj.type !== 'push' && sc.obj.type !== 'rootAll', name: { en: 'Tough foes (+15% HP)', pt: 'Inimigos resistentes (+15% de vida)' } },
    alert: { ok: sc => (sc.units || []).length > 0 && (sc.fail || []).indexOf('seen') < 0, name: { en: 'Alert foes', pt: 'Inimigos atentos' } },
  };

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
    const out = [], placed = [], E = IT.GAME.ENEMY, SK = IT.GAME.SKINS, s0 = Math.max(0, SK.indexOf(pr.skin)), tw = pr.twist;
    w.gate = sc.gate ? Object.assign(spot(w, sc.gate, sp, placed, { pick: R.pick }), { r: sc.gate.r || 260 }) : null;   // 'cross' line (a circle on the map)
    (sc.units || sc.dummies || []).forEach((d, i) => {
      const p = spot(w, d, sp, placed, { pick: R.pick, jit: d.of != null ? 0 : R.jit || 0, role: 'unit' }), mot = d.mot;
      placed[i] = p;
      const items = d.items || (df.useBkb || d.useBkb ? ['bkb'] : undefined);
      const skin = SK[(s0 + i) % SK.length], lap = Math.floor(i / SK.length);   // every foe wears a different NPC hero skin + name
      // real enemy NPC, dies at 0 hp. Kill scenarios: hp = 0.85 x the damage of the scenario's own steps x tier hpMul (foeHp); the others keep
      // the old line (d.hp = start fraction on the old 25% kill line x ENEMY.hp x hpMul)
      const need = d.hp != null && d.hp < 1 ? Math.max(0.05, d.hp - 0.25) : 0.75;
      const base = pr.hp && pr.hp[i] != null ? pr.hp[i] : need * E.hp * (df.hpMul != null ? df.hpMul : 1);
      const hp = Math.round(Math.max(100, base * (tw === 'tough' ? 1.15 : 1)));
      // per-unit awareness (a notice delay of df.notice x (1 - aw) s) is the scenario's base, nudged by the tier (+-0.2); 'alert' twist adds 0.3
      const aw = clamp((d.aware != null ? d.aware + (df.awareness - 0.6) * 0.5 : df.awareness) + (tw === 'alert' ? 0.3 : 0), 0, 1);
      const e = IT.Units.spawnEnemy(w, {
        x: p.x, y: p.y, skin, name: IT.GAME.SKIN_NAMES[skin] + (lap ? ' ' + (lap + 1) : ''), hp, armor: E.armor + (df.armorAdd || 0),
        behavior: d.behavior || (mot ? 'stationary' : ENEMY_BEHAVIOR[df.behavior] || 'stationary'),
        scenario: { stunBolt: df.stunBolt, dummyEscape: mot ? 'none' : df.escape, blinkAfter: df.blinkAfter },
        useBkb: !!(df.useBkb || d.useBkb), items,
        telegraph: df.telegraph, awareness: aw, notice: df.notice, reaction: mot === 'still' ? 99 : df.reaction,
        dmgMul: df.dmgMul, fights: !!df.fights && mot !== 'flee',
      });
      e.hpRegen = 0; e.base.hpRegen = 0;
      if (mot === 'flee' || mot === 'chase' || mot === 'march') { const ms = mot === 'flee' ? 330 * df.flee : mot === 'march' ? 270 * df.chase : 380 * df.chase; e.ms = ms; e.base.ms = ms; }
      if (tw === 'swift') { e.ms = Math.round(e.ms * 1.15); e.base.ms = e.ms; }
      e.scn = { mot: mot || null, next: 0, lastSeen: null, search: null, idx: i, n: (sc.units || sc.dummies || []).length };
      out.push(e);
    });
    if (out.length) hero.facing = Math.atan2(out[0].y - hero.y, out[0].x - hero.x);   // start facing the first foe (Force Staff pushes that way)
    return out;
  }

  // the enemy team sees the hero (shared vision: units + towers; Ghost Walk hides it unless true sight / a reveal)
  const heroSeen = w => { const h = w.hero; if (!h) return false; return IT.Vision && IT.Vision.teamSees && w.map ? IT.Vision.teamSees(w, 1, h) : !IT.Status.has(h, 'ghost'); };
  const SEARCH_R0 = 150, SEARCH_GROW = 110, SEARCH_MAX = 900;   // chaser search ring around the last seen spot: radius 150 + 110/s, max 900

  // ---------------------------------------------------------------- run
  // opts: { mode:'ranked'|'sandbox'|'infinite' (default 'sandbox'; any other name is a neutral untimed-by-turns run, SOLO_COUNTDOWN s), diff:id, scenario:id (sandbox, fixed), rating, seed, skin, runSeconds }
  // 'infinite': bambam scenarios from the hard end of the pool in a seeded shuffled order (a fresh shuffle each lap, harder each lap, twists from the 3rd),
  //   until the first failed scenario; the summary carries cleared + the persisted best-ever.
  function create(opts) {
    opts = opts || {};
    const mode = opts.mode || 'sandbox', ranked = mode === 'ranked', infinite = mode === 'infinite', fixed = opts.scenario ? IT.SCENARIOS.get(opts.scenario) : null;
    const rating = opts.rating != null ? opts.rating : ranked ? profile().rating : 0;
    const rng = IT.U.mulberry32(opts.seed == null ? (Math.random() * 1e9) | 0 : opts.seed);
    const run = {
      mode, ranked, infinite, fixed, rating, rng, skin: opts.skin, phase: 'idle', cd: 0, hold: 0,
      runLeft: ranked && opts.runSeconds ? opts.runSeconds : null, turns: ranked ? (opts.turns || TURNS) : null, score: 0, streak: 0, bestStreak: 0, solved: 0, failed: 0, n: 0,
      pr: null, dummies: [], result: null, ended: false, summary: null, w: null, onSwap: null, recent: [], t0: 0, caught: false, bag: [], lastId: null, failId: null, maxLevel: 0,
      diffId: IT.DIFFICULTY.migrate(opts.diff || 'common'),
      // v6: a fixed sandbox scenario also gets the full countdown (nothing is pre-invoked: it is the time to invoke)
      countdown: ranked ? COUNTDOWN : infinite ? INF_COUNTDOWN : fixed && mode === 'sandbox' ? COUNTDOWN : SOLO_COUNTDOWN,
    };
    const DF = () => IT.DIFFICULTY;

    const infPool = () => { const l = IT.SCENARIOS.filter(s => (s.level || s.tier * 3) >= INF_MIN_LEVEL); return l.length ? l : IT.SCENARIOS.slice(); };
    const infSize = infinite ? infPool().length : 1;
    run.lap = () => (infinite ? Math.floor(run.n / infSize) : 0);   // full passes over the pool so far
    run.diffIndex = () => (ranked ? rampDiff(rating, run.n) : infinite ? DF().order.length - 1 : DF().get(run.diffId).idx);
    run.difficulty = () => (infinite ? infDifficulty(DF().get(run.diffIndex()), run.lap()) : DF().get(run.diffIndex()));

    // ranked ramp: the n-th scenario aims at level 1 + n (+2 per rating band), picked among levels within +-r (widening until >= 3)
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
        for (let r = 0; r <= 9; r++) { pool = base.filter(s => Math.abs((s.level || s.tier * 3) - tg) <= r); if (pool.length >= (fun ? 2 : 3)) break; }
        if (!pool.length) pool = all;
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
      run.pr = prepare(sc, run.difficulty(), run.skin);
      run.pr.twist = twist(sc);
      run.recent.push(sc.id); if (run.recent.length > Math.max(6, run.turns || 0)) run.recent.shift();
      return run.pr;
    };

    // used = step abilities that hit a foe (or, SELF_OK, were cast); hurt = a foe damaged the hero (escape: caught)
    const freshSt = () => ({ last: {}, abil: {}, kills: [], casts: {}, blasts: [], towers: [], hit: null, used: new Set(), castAt: {}, hurt: false });
    function enter(w) {
      run.dummies = apply(w, run.pr);
      // v6 (fog always on): the world is frozen through the countdown, so refresh the fog now -- the start picture is the real one and
      // a foe in plain sight is targetable on the first frame of play
      if (IT.Vision && IT.Vision.update && w.map) { IT.Vision.update(w); w._visT = w.t; }
      run.st = freshSt();   // objective bookkeeping (v5), filled by the attach() listeners
      run.result = null; run.caught = false; run.died = false; run.t0 = w.t;
      // kill_with, and (v6) every kill scenario whose steps must all hit: the hero does not auto-acquire (as on Hold), so a stray auto-attack
      // cannot finish the foe before the combo lands; an explicit attack / attack-move order still works
      if (w.hero) { if (run.pr.sc.obj.type === 'kill_with' || (run.pr.need && run.pr.need.length)) w.hero.autoAttack = false; else delete w.hero.autoAttack; }
      run.maxLevel = Math.max(run.maxLevel, run.pr.sc.level || 0);
      run.phase = run.countdown > 0 ? 'countdown' : 'play'; run.cd = run.countdown;
      w.paused = run.phase !== 'play';
      w.emit('scnStart', { id: run.pr.sc.id, n: run.n, diff: run.pr.df.id });
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
        const k = Object.assign({ id: p.unit }, st().last[p.unit] || {}, { t: w.t }), a = st().abil[p.unit];
        if (k.ability === 'attack' && a && w.t - a.t <= ASSIST) k.assist = a;   // an ability hurt it just before the basic attack finished it
        st().kills.push(k);
      });
      w.on('cast', p => {
        if (p.unit !== w.hero.id || run.phase !== 'play') return;
        const s = st(); s.casts[p.ability] = (s.casts[p.ability] || 0) + 1; s.castAt[p.ability] = w.t;
        if (SELF_OK[p.ability]) s.used.add(p.ability);
        if (p.ability === 'deafeningblast') s.blasts.push(new Set());
      });
      w.on('towerDown', p => { if (run.phase === 'play') st().towers.push({ team: p.team, tier: p.tier }); });
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
        if (ranked || infinite) pts = scenarioScore(pr.df.mult, pr.par, time, run.streak - 1);
        run.score += pts;
        w.emit('comboDone', { id: pr.sc.id, tier: TIER_NAME[pr.sc.tier - 1] || 'basic', score: pts, time });
      } else {
        run.failed++; run.streak = 0; run.failId = pr.sc.id;
        w.emit('comboFail', { id: pr.sc.id, reason, detail: detail || null, spells: spells || null, s: reason === 'method' ? methodText(detail, spells) : '' });
      }
      run.result = { ok, reason: reason || null, detail: detail || null, spells: spells || null, points: pts, time };
      run.phase = 'result'; run.hold = RESULT_HOLD; w.paused = true;
      w.emit('scnResult', { id: pr.sc.id, ok, reason: reason || null, detail: detail || null, points: pts, time });
    }

    // does one recorded kill satisfy an objective's "how"? { ability:[ids], by:'hero'|'spirit', low (hero below the foe), high, inv (hero invisible) }
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
      // 'attack' => the toast says it was an auto-attack and names what the scenario wanted
      if (o.how) { const bad = st.kills.find(k => !killOk(k, o.how)); if (bad) return conclude(false, 'method', bad.ability === 'attack' ? 'attack' : 'other', bad.ability === 'attack' ? (o.how.ability || pr.need) : null); }
      // v6: a kill only counts once every step spell / item hit a foe (or, self ones, was cast); the toast names the missing ones.
      // A spell still in flight at the kill (cast within IN_FLIGHT s: Sun Strike delay, Blast wave, Meteor fall) counts too, so a Meteor
      // burn that finishes the foe a moment before the last nuke lands is not a fail
      const won = () => { const miss = (pr.need || []).filter(a => !st.used.has(a) && !(st.castAt[a] != null && w.t - st.castAt[a] <= IN_FLIGHT)); return miss.length ? conclude(false, 'method', 'missing', miss) : conclude(true); };
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
      else if (o.type === 'escape') {
        // v6: caught = a foe hurt the hero, or the hero is VISIBLE to the enemy team (Ghost Walk hides it unless a Dire tower's true sight /
        // a reveal shows it) with a foe within CAUGHT
        if (st.hurt) return conclude(false, 'caught');
        if (heroSeen(w)) for (const d of alive) if (Math.hypot(d.x - h.x, d.y - h.y) < CAUGHT) return conclude(false, 'caught');
        if (el >= o.time) return conclude(true);
        return;
      }
      else if (o.type === 'hold') { if (el >= o.time) return conclude(true); return; }
      for (const d of alive) if ((d.scn.mot === 'flee' || fail.indexOf('escaped') >= 0) && Math.hypot(d.x - h.x, d.y - h.y) > ESCAPED) return conclude(false, 'escaped');
      if (mode !== 'sandbox' && el >= pr.limit) return conclude(false, 'time');
    }

    // scripted dummies: flee (run directly away from the hero) / march (to the gate) / chase (by sight, see chase())
    function script(w) {
      const h = w.hero;
      let seen = null;   // lazily: only chasers need it
      for (const d of run.dummies) {
        if (d.dead || (d.scn.mot !== 'flee' && d.scn.mot !== 'chase' && d.scn.mot !== 'march') || w.t < d.scn.next || !IT.Status.canMove(d)) continue;
        if (d.orders[0] && d.orders[0].type === 'attack') continue;   // a chaser that has reached the hero is busy hitting it
        d.scn.next = w.t + 0.35;
        if (d.scn.mot === 'march') { if (w.gate && (!d.orders[0] || d.orders[0].type !== 'move')) IT.Orders.issue(w, d, { type: 'move', x: w.gate.x, y: w.gate.y }); }   // walks to the line it must not cross
        else if (d.scn.mot === 'flee') {
          const a = Math.atan2(d.y - h.y, d.x - h.x);
          let x = d.x + Math.cos(a) * 900, y = d.y + Math.sin(a) * 900;
          if (!w.map.walkable(x, y)) {   // wall ahead: slide sideways
            const p = IT.Nav.nearestWalkable(w.map, x, y); if (p) { x = p.x; y = p.y; }
          }
          IT.Orders.issue(w, d, { type: 'move', x, y });
        } else { if (seen == null) seen = heroSeen(w); chase(w, d, h, seen); }
      }
    }
    // chase (v6): while the enemy team SEES the hero, run at it and remember the spot. Unseen (Ghost Walk outside a Dire tower's true sight,
    // fog, high ground), the hero's real position is never read: walk to the last seen spot, then search a widening ring around it, each
    // chaser on its own bearing (spread apart).
    function chase(w, d, h, seen) {
      const c = d.scn;
      if (seen) { c.lastSeen = { x: h.x, y: h.y, t: w.t }; c.search = null; IT.Orders.issue(w, d, { type: 'move', x: h.x, y: h.y }); return; }
      if (!c.lastSeen) c.lastSeen = { x: d.x, y: d.y, t: w.t, own: true };   // never saw it: search around itself
      const L = c.lastSeen;
      if (!c.search) {
        if (Math.hypot(d.x - L.x, d.y - L.y) > 60) { IT.Orders.issue(w, d, { type: 'move', x: L.x, y: L.y }); return; }
        // a Dust carrier holds the last-seen spot for its reaction time + telegraph, dusts it once (IT.Units.useDust), then searches
        if (!L.own && IT.Units.useDust(w, d, L)) { if (d.orders.length) IT.Orders.issue(w, d, { type: 'stop' }); return; }
        c.search = { t0: w.t, k: 0, to: null };
      }
      const S = c.search, o = d.orders[0];
      if (S.to && o && o.type === 'move' && Math.hypot(d.x - S.to.x, d.y - S.to.y) > 50) return;   // still walking to the current probe
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
      const sum = { mode, combos: run.solved, solved: run.solved, fails: run.failed, bestStreak: run.bestStreak, score: ranked || infinite ? run.score : 0, reason: reason || 'time',
        turns: run.turns, diff: run.pr ? run.pr.df.id : null, level: run.maxLevel || null };
      if (ranked && (run.n > 0 || run.solved + run.failed > 0)) sum.rank = record(run.score);
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
      if (run.phase === 'countdown') {
        const inv = w.hero && w.hero.inv;   // v6: Invoke works during the countdown, so its cooldown ticks too (the world is frozen)
        if (inv && inv.invokeCd > 0) { inv.invokeCd -= dt; if (inv.invokeCd < 1e-9) inv.invokeCd = 0; }
        run.cd -= dt; if (run.cd <= 0) go();
      }
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
      score: r.ranked || r.infinite ? r.score : null, cleared: r.infinite ? r.solved : null,
      scenario: loc(pr.sc.name), objective: loc(pr.sc.goal),
      // extras
      mode: r.mode, id: pr.sc.id, n: r.n, solved: r.solved, failed: r.failed, streak: r.streak, bestStreak: r.bestStreak,
      diff: pr.df.id, diffDesc: loc(pr.df.desc), hints: !!pr.df.hints, tip: loc(pr.sc.tip), spells: sol.filter(s => IT.GAME.SPELL_ORBS[s.a]).map(s => s.a),
      result: r.result, level: pr.sc.level || null, mapName: w.map && w.map.name ? loc(w.map.name) : null,
      twist: pr.twist ? pr.twist : null, twistName: pr.twist && TWISTS[pr.twist] ? loc(TWISTS[pr.twist].name) : null,
    };
  }

  IT.Ranked = {
    TURNS, COUNTDOWN, RESULT_HOLD,
    streakMult, scenarioScore, expected, ratingDelta, baseDiff, rampDiff, rankKey, INF_MIN_LEVEL, INF_COUNTDOWN,
    infiniteProfile, infiniteResult, recordInfinite, resetInfinite, infDifficulty,
    profile, record, reset, load, prepare, apply, create, hud, spot, arenas, TWISTS,
    comboDamage, foeHp, towerMath, fightTime, worldFog, needOf, heroSeen, FUN_TAGS, FUN_TURNS, isFun, CAUGHT, HP_SHARE, ATTACK_WINDOW,
  };
})(typeof window !== 'undefined' ? window : globalThis);
