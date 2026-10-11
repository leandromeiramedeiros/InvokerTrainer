// Value lookup over IT.DOTA (baked from Valve KV by tools/bake.mjs). Pure, no DOM.
//
// DEVIATIONS from the original spec shape (see IT.DOTA in js/data/dota.js):
//  * talents: the KV has NO AbilityValues for special_bonus_* abilities; their numbers live as modifier keys on
//    the affected ability's value. So IT.DOTA.talents[name] = { affects:[{ability,key,op,n|v}], tier, side, inTree }.
//    `inTree:false` = referenced as a modifier but not in the hero's 8 talent slots at this patch
//    (e.g. special_bonus_unique_invoker_11 Sun Strike -4s cd, special_bonus_unique_invoker_cold_snap_heal).
//    The lookup still honours any name placed in ctx.talents; legality is the caller's job.
//  * hero.talents = [[t10a,t10b],[t15a,t15b],[t20a,t20b],[t25a,t25b]] taken from Ability17..24; first KV slot of
//    each pair is assumed to be the RIGHT-hand talent, so the pair is emitted [left,right] (side flag in talents).
//  * Orb arrays have 9 entries (levels 1..9); base MaxLevel is 8. Scepter adds `scepter_bonus_levels` (+1 via
//    special_bonus_scepter_N) to each orb's EFFECTIVE level, giving level 9 (index 8). Index is clamped to
//    [0, len-1]; arrays of length 1 always use index 0. The bonus is added even if the orb is at 0.
//    Facet mods (special_bonus_facet_*) are dropped (all facets are Deprecated in the KV).
//  * Mods: op '+','-','x','=' (n or v:[...] for per-level replacement arrays), '+%' (n signed percent, value*(1+n/100)).
//    Plain numbers are additive. Applied in listed order, '=' first.
//  * Top-level AbilityCooldown/ManaCost/CastRange/CastPoint/ChannelTime (and AbilityDuration if present) are exposed
//    as arrays on the ability (cooldown, manaCost, castRange, castPoint, channelTime, duration); when they live in
//    AbilityValues they are ALSO in values.AbilityCooldown etc. (carrying the mods). Missing ones default to [0].
//  * Extra: hero.HullRadius / units.*.HullRadius from a hull-name table in bake.mjs; meta.versionDate.
(function(G){ 'use strict';
  const IT = G.IT = G.IT || {};
  const D = IT.DOTA;
  const ORB = { quas: 'invoker_quas', wex: 'invoker_wex', exort: 'invoker_exort' };
  const LEVELKEY = { quaslevel: 'quas', wexlevel: 'wex', exortlevel: 'exort' };
  const ORB_OF = { invoker_quas: 'quas', invoker_wex: 'wex', invoker_exort: 'exort' };

  function active(m, ctx) {
    if (m.src === 'scepter') return !!ctx.scepter;
    if (m.src === 'shard') return !!ctx.shard;
    return ctx.talentSet.has(m.src);
  }
  // modded array for an entry (no level selection)
  function applyMods(e, ctx) {
    let v = e.v.slice();
    const ms = e.mods.filter((m) => active(m, ctx));
    for (const m of ms) if (m.op === '=') v = m.v ? m.v.slice() : v.map(() => m.n);
    for (const m of ms) {
      if (m.op === '+') v = v.map((x) => x + m.n);
      else if (m.op === '-') v = v.map((x) => x - m.n);
      else if (m.op === 'x') v = v.map((x) => x * m.n);
      else if (m.op === '+%') v = v.map((x) => x * (1 + m.n / 100));
    }
    return v;
  }
  function entry(ability, key) {
    const a = D.abilities[ability];
    return a && a.values[key];
  }
  function raw(ability, key, ctx, idx) {
    const e = entry(ability, key);
    if (!e) return 0;
    if (e.requiresScepter && !ctx.scepter) return 0;
    if (e.requiresShard && !ctx.shard) return 0;
    const v = applyMods(e, ctx);
    return v[Math.max(0, Math.min(v.length - 1, idx))];
  }
  function bonusLevels(orb, ctx) {
    // 7.41: Scepter grants the bonus level to ONE chosen orb (loadout.scepterOrb); without a choice, none.
    return ctx.scepter && ctx.scepterOrb === orb ? raw(ORB[orb], 'scepter_bonus_levels', ctx, 0) : 0;
  }

  const Values = {};
  Values.SPELL_IDS = {
    coldsnap: 'invoker_cold_snap', ghostwalk: 'invoker_ghost_walk', icewall: 'invoker_ice_wall', emp: 'invoker_emp',
    tornado: 'invoker_tornado', alacrity: 'invoker_alacrity', sunstrike: 'invoker_sun_strike',
    forgespirit: 'invoker_forge_spirit', chaosmeteor: 'invoker_chaos_meteor', deafeningblast: 'invoker_deafening_blast',
  };

  // loadout: { heroLevel, orbs:{quas,wex,exort}, talents:[names], scepter, scepterOrb:'quas'|'wex'|'exort', shard } -> immutable-ish ctx
  Values.ctx = function (loadout) {
    const l = loadout || {};
    const o = l.orbs || {};
    const ctx = {
      heroLevel: l.heroLevel || 1,
      orbs: { quas: o.quas || 0, wex: o.wex || 0, exort: o.exort || 0 },
      talents: (l.talents || []).slice(),
      scepter: !!l.scepter,
      scepterOrb: l.scepterOrb || null,
      shard: !!l.shard,
    };
    ctx.talentSet = new Set(ctx.talents);
    ctx.eff = {};
    for (const k of ['quas', 'wex', 'exort']) ctx.eff[k] = ctx.orbs[k] + bonusLevels(k, ctx);
    return ctx;
  };

  Values.has = function (ability, key) { return !!entry(ability, key); };

  // number for `key` of `ability` under ctx (0 if missing or gated by requiresScepter/requiresShard).
  Values.get = function (ability, key, ctx) {
    const e = entry(ability, key);
    if (!e) return 0;
    let lvl;
    const lk = LEVELKEY[e.levelkey];
    if (lk) lvl = ctx.eff[lk];
    else if (ORB_OF[ability]) lvl = ctx.eff[ORB_OF[ability]];
    else lvl = 1;
    return raw(ability, key, ctx, lvl - 1);
  };

  function top(ability, field, key, ctx) {
    if (entry(ability, key)) return Values.get(ability, key, ctx);
    const a = D.abilities[ability];
    return a && a[field] ? a[field][0] : 0;
  }
  Values.cooldown = (ab, ctx) => top(ab, 'cooldown', 'AbilityCooldown', ctx);
  Values.manaCost = (ab, ctx) => top(ab, 'manaCost', 'AbilityManaCost', ctx);
  Values.castRange = (ab, ctx) => top(ab, 'castRange', 'AbilityCastRange', ctx);
  Values.castPoint = (ab, ctx) => top(ab, 'castPoint', 'AbilityCastPoint', ctx);
  Values.channelTime = (ab, ctx) => top(ab, 'channelTime', 'AbilityChannelTime', ctx);

  // Invoke cooldown = invoker_invoke.AbilityCooldown (7) - cooldown_reduction_per_orb (0.3) * (sum of effective orb
  // levels), floored at 0. Key names verified in KV; the per-orb-LEVEL (not per-orb-count) reading and floor are
  // assumptions about engine behaviour.
  Values.invokeCooldown = function (ctx) {
    const base = top('invoker_invoke', 'cooldown', 'AbilityCooldown', ctx);
    const per = Values.get('invoker_invoke', 'cooldown_reduction_per_orb', ctx);
    return Math.max(0, base - per * (ctx.eff.quas + ctx.eff.wex + ctx.eff.exort));
  };

  // items: value by key (AbilityValues first, then top-level numeric field e.g. cost/cooldown/castRange). idx = level index.
  Values.item = function (name, key, idx) {
    const it = D.items[name];
    if (!it) return 0;
    const i = idx || 0;
    const e = it.values[key];
    const arr = e ? e.v : Array.isArray(it[key]) ? it[key] : null;
    if (arr) return arr[Math.max(0, Math.min(arr.length - 1, i))];
    return typeof it[key] === 'number' ? it[key] : 0;
  };

  Values.hero = (key) => D.hero[key];
  Values.unit = (name, key) => D.units[name] && D.units[name][key];
  // talent tier gating helper: true if hero level reaches the talent's tier
  Values.talentUnlocked = function (name, heroLevel) {
    const t = D.talents[name];
    return !!t && t.tier != null && heroLevel >= t.tier;
  };

  IT.Values = Values;
})(typeof window!=='undefined'?window:globalThis);
