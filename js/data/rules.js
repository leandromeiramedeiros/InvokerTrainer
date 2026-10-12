(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};

  const ORBS = ['quas', 'wex', 'exort'];
  const TALENT_LEVELS = [10, 15, 20, 25];
  const TALENT_SECOND_LEVELS = [27, 28, 29, 30]; // tier i's other talent unlocks at 26+i
  const TIERS = [
    { level: 10, left: 'special_bonus_unique_invoker_3', right: 'special_bonus_unique_invoker_ice_wall_dps' },
    { level: 15, left: 'special_bonus_unique_invoker_9', right: 'special_bonus_unique_invoker_5' },
    { level: 20, left: 'special_bonus_unique_invoker_forged_spirit_armor_reduction', right: 'special_bonus_unique_invoker_additional_chaos_meteors' },
    { level: 25, left: 'special_bonus_unique_invoker_13', right: 'special_bonus_unique_invoker_2' }
  ];
  const BONUS_POINT_LEVELS = [6, 12, 18]; // Invoke innate: +1 ability point (7.41b)
  const MAX_HERO_LEVEL = 30;

  // ---- Batch P research (point economy), see also docs/AUDIT-v5.md ----
  // * Patch 7.40 (dota2.com/datafeed/patchnotes?version=7.40): "Talents no longer require a skill point to level. Now talents are
  //   learned by using their own talent points available at levels 10, 15, 20, 25, 27, 28, 29, and 30. This results in all +2 All
  //   Attributes bonuses skilled by level 22" => an ordinary hero has 15 ability levels + 7 Attribute Bonus levels = 22 skill points,
  //   one per hero level 1..22, none after 22 (talent points are separate).
  // * Patch 7.41b (Liquipedia Version_7.41b, 2026-04-07; dota2.com/patches/7.41b): "Invoke now grants Invoker 1 ability point bonus
  //   at hero level 6/12/18" => the 6/12/18 bonus points are REAL (KV invoker_invoke first/second/third_ability_level = 6/12/18).
  //   Invoke itself is innate (MaxLevel 1, NOT_LEARNABLE) and never costs a point or levels up.
  // * KV npc_dota_hero_invoker.txt (SteamDatabase master): Ability1-3 orbs MaxLevel 8 (7.41: "Max Level increased from 7 to 8"; the
  //   Scepter adds +1 to ONE chosen orb), no RequiredLevel override => default basic-ability gate, orb level n needs hero level 2n-1.
  //   Invoker has no Attribute Bonus ability slot (invoker_attribute_bonus is defined but not in Ability1..25). Talents are
  //   Ability17..24, two per tier at 10/15/20/25; a tier's second talent is only reachable through the 27-30 talent points.
  // * Not verifiable (Liquipedia/fandom return 403/402 to our fetcher): whether the engine hands out exactly 1 skill point per level
  //   up to 22 for Invoker, and whether the 27-30 points are auto-spent. We therefore implement the trainer's own single-pool model:
  //   18 base + 3 Invoke bonus + 8 talent points = 29 = 3 orbs x 7 + 8 talents (trainer orb cap is 7 spent levels, G3).
  //   The real game would give 22 + 3 skill points + 8 separate talent points (33) against 24 orb levels (cap 8) + 8 talents.
  // ONE point pool (batch P). Sinks: 3 orbs x 7 spent levels = 21, plus 8 talents x 1 point = 29 in total.
  //   base ability points  : 1 per hero level 1..BASE_POINT_CAP (18). 18 = 21 orb levels - the 3 Invoke bonus points.
  //   Invoke bonus points  : +1 at hero level 6, 12, 18 (official, patch 7.41b)
  //   talent points        : +1 at hero level 10, 15, 20, 25, 27, 28, 29, 30 (official, patch 7.40); each talent costs ONE point
  // => 18 + 3 + 8 = 29 at level 30, which the sinks absorb exactly (0 left when maxed).
  const BASE_POINT_CAP = 18;
  const abilityPointsAt = L => Math.min(Math.max(0, L | 0), BASE_POINT_CAP) + BONUS_POINT_LEVELS.filter(b => L >= b).length;
  // talent points unlocked at hero level L (7.40: own points; here they are paid from the same pool)
  function talentPointsAt(L) { return TALENT_LEVELS.filter(x => L >= x).length + TALENT_SECOND_LEVELS.filter(x => L >= x).length; }

  // cumulative points in the single pool at hero level L (index L-1)
  const pointsAtLevel = [];
  for (let L = 1; L <= MAX_HERO_LEVEL; L++) pointsAtLevel.push(abilityPointsAt(L) + talentPointsAt(L));

  // v4 (plan G3): orbs start LOCKED (level 0 = unusable), max 7 spent levels per orb (8 with the Scepter orb bonus).
  // orbReqLevel[n-1] = min hero level to learn orb level n until hero level 13 (rule: 2n-1); lvl 14+ is unrestricted.
  // Orb level 8 = scepter bonus: free, no point, no gate.
  const ORB_MAX = 7;
  const GATE_UNTIL = 13;
  const orbReqLevel = [1, 3, 5, 7, 9, 11, 13];

  // Pick orders (orb raised by each successive point). autoLoadout skips an orb's picks beyond ORB_MAX (7): 21 picks = 7/7/7.
  const ORDER_QE = [
    'quas', 'exort', 'quas', 'exort', 'quas', 'exort', 'wex',
    'quas', 'exort', 'quas', 'exort', 'quas', 'exort',
    'quas', 'exort', 'quas', 'exort',
    'wex', 'wex', 'wex', 'wex', 'wex', 'wex', 'wex'];
  const ORDER_QW = [
    'quas', 'wex', 'quas', 'wex', 'quas', 'wex', 'exort',
    'quas', 'wex', 'quas', 'wex', 'quas', 'wex',
    'quas', 'wex', 'quas', 'wex',
    'exort', 'exort', 'exort', 'exort', 'exort', 'exort', 'exort'];

  const T = TIERS;
  const TALENTS_QE = [T[0].right, T[1].left, T[2].right, T[3].left];
  const TALENTS_QW = [T[0].left, T[1].right, T[2].left, T[3].left];

  function clampLvl(l) { return Math.max(0, Math.min(MAX_HERO_LEVEL, l | 0)); }
  function pointsAvailable(heroLevel) { const L = clampLvl(heroLevel); return L < 1 ? 0 : pointsAtLevel[L - 1]; }
  function orbsSpent(lo) { const o = (lo && lo.orbs) || {}; return ORBS.reduce((s, k) => s + (o[k] | 0), 0); }
  // known talents picked (each costs one point from the single pool; unknown names are free / ignored)
  function talentsSpent(lo) { return lo && Array.isArray(lo.talents) ? new Set(lo.talents.filter(n => tierOf(n) >= 0)).size : 0; }
  function pointsSpent(lo) { return orbsSpent(lo) + talentsSpent(lo); }
  function pointsLeft(lo) { return pointsAvailable(lo && lo.heroLevel) - pointsSpent(lo); }
  function orbGate(n) { return n >= 1 && n <= ORB_MAX ? orbReqLevel[n - 1] : (n === ORB_MAX + 1 ? 0 : Infinity); }
  // max spent level an orb may have at hero level L (gate 2n-1 until lvl 13, unrestricted after)
  function orbCap(L) { L = clampLvl(L); if (L < 1) return 0; return L > GATE_UNTIL ? ORB_MAX : Math.min(ORB_MAX, (L + 1) >> 1); }
  // Auto-fix an illegal orb set for hero level L: clamp to the gate cap, then shave the highest orbs until points suffice.
  // `reserve` = points already committed elsewhere (talents).
  function fixOrbs(L, o, reserve) {
    o = o || {};
    const cap = orbCap(L), out = {};
    for (const k of ORBS) { const v = o[k] != null ? o[k] : o[k[0]]; out[k] = Math.max(0, Math.min(cap, Math.round(Number(v)) || 0)); }
    let over = orbsSpent({ orbs: out }) - (pointsAvailable(L) - Math.max(0, reserve | 0));
    while (over > 0) {
      let b = null;
      for (const k of ORBS) if (out[k] > 0 && (b === null || out[k] >= out[b])) b = k;
      out[b]--; over--;
    }
    return out;
  }
  // Invoke cooldown by orb-level sum (plan G1). Anchors [sum, cd]; linear between; 7 - 0.3*sum below 3; 0 from 21.
  // Aghanim's Scepter column = flat -0.3 s (the plan's parenthesised figures: 5.8 / 4.6 / 3.7 / 2.5 / 1.6 / 0.4; sum 20 + Aghs = 0).
  // NOTE vs Valve KV (invoker_invoke: cooldown 7, cooldown_reduction_per_orb 0.3): the KV is exactly 7 - 0.3*sum, which equals the
  // plan anchors only when "L" is read as HERO level with every point spent (3 -> 6.1, 6 -> 4.9, 9 -> 4.0, 12 -> 2.8, 15 -> 1.9,
  // 18 -> 0.7). The plan keys them by Q+W+E sum (max 7/7/7 = 21 -> 0), so the plan table is what we implement.
  const INVOKE_CD = [[3, 6.1], [6, 4.9], [9, 4.0], [12, 2.8], [15, 1.9], [18, 0.7], [21, 0]];
  function invokeCooldown(sum, scepter) {
    sum = Math.max(0, Number(sum) || 0);
    let cd;
    if (sum <= 3) cd = 7 - 0.3 * sum;
    else if (sum >= 21) cd = 0;
    else {
      let i = 0;
      while (i < INVOKE_CD.length - 2 && sum >= INVOKE_CD[i + 1][0]) i++;
      const a = INVOKE_CD[i], b = INVOKE_CD[i + 1];
      cd = a[1] + (b[1] - a[1]) * (sum - a[0]) / (b[0] - a[0]);
    }
    if (scepter) cd -= 0.3;
    return Math.max(0, Math.round(cd * 1e6) / 1e6);
  }
  function tierOf(name) {
    for (let i = 0; i < T.length; i++) if (T[i].left === name || T[i].right === name) return i;
    return -1;
  }
  const ALL_TALENTS = T.flatMap(t => [t.left, t.right]);
  const FREE_PICK_LEVEL = 27;   // plan G4: from lvl 27 the "other" talents may be picked in any tier; all 8 are granted at 30
  // Talent picking rules at hero level L: { points, firstPicks, extra, perTier, anyTier, all }
  function talentsAllowed(L) {
    L = clampLvl(L);
    const points = talentPointsAt(L), first = TALENT_LEVELS.filter(x => L >= x).length;
    return { points, firstPicks: first, extra: points - first, perTier: L >= FREE_PICK_LEVEL ? 2 : 1, anyTier: L >= FREE_PICK_LEVEL, all: L >= MAX_HERO_LEVEL };
  }
  // Auto-fix a talent list for hero level L (unknown names are left alone). Each talent costs one pool point, so at most
  // `room` known talents are kept (room = pool points not spent on orbs; default unlimited). A missing list (not an array)
  // at level 30 means "all 8" (legacy default); an explicit array is respected, so talents stay a choice.
  function fixTalents(L, tal, room) {
    L = clampLvl(L);
    if (!Array.isArray(tal)) tal = L >= MAX_HERO_LEVEL ? ALL_TALENTS : [];
    const al = talentsAllowed(L), per = [0, 0, 0, 0], seen = new Set(), out = [];
    const cap = Math.min(al.points, room == null ? Infinity : Math.max(0, room | 0));
    let n = 0;
    for (const name of tal) {
      if (typeof name !== 'string' || seen.has(name)) continue;
      seen.add(name);
      const t = tierOf(name);
      if (t < 0) { out.push(name); continue; }
      if (L < T[t].level || per[t] >= al.perTier || n >= cap) continue;
      per[t]++; n++; out.push(name);
    }
    return out;
  }

  function validate(lo) {
    const errors = [];
    if (!lo || typeof lo !== 'object') return { ok: false, errors: ['loadout missing'] };
    const L = lo.heroLevel;
    if (!Number.isInteger(L) || L < 1 || L > MAX_HERO_LEVEL) return { ok: false, errors: ['heroLevel must be an integer 1..30'] };
    const o = lo.orbs || {};
    if (lo.scepter) {
      const sc = lo.scepterOrb || (ORBS.includes(lo.scepter) ? lo.scepter : null);
      if (!ORBS.includes(sc)) errors.push('scepter needs scepterOrb (quas|wex|exort)');
    }
    for (const k of ORBS) {
      const v = o[k] === undefined ? 0 : o[k];
      if (!Number.isInteger(v) || v < 0) { errors.push(k + ' must be a non-negative integer'); continue; }
      if (v > ORB_MAX) errors.push(k + ' max is ' + ORB_MAX + ' (spent points; the Scepter bonus is free)');
      else if (v > 0 && orbReqLevel[v - 1] > L) errors.push(k + ' level ' + v + ' needs hero level ' + orbReqLevel[v - 1]);
    }
    const avail = pointsAvailable(L), spent = pointsSpent(lo);
    if (spent > avail) errors.push('spent ' + spent + ' points (orbs + talents) but only ' + avail + ' available at level ' + L);
    const tal = Array.isArray(lo.talents) ? lo.talents : [];
    const seen = new Set(), perTier = [0, 0, 0, 0], al = talentsAllowed(L);
    let count = 0;
    for (const n of tal) {
      if (seen.has(n)) { errors.push('duplicate talent ' + n); continue; }
      seen.add(n);
      const t = tierOf(n);
      if (t < 0) { errors.push('unknown talent ' + n); continue; }
      if (L < T[t].level) errors.push('talent ' + n + ' needs hero level ' + T[t].level);
      perTier[t]++; count++;
      if (perTier[t] === 2 && !al.anyTier) errors.push('second talent of tier ' + T[t].level + ' needs hero level ' + FREE_PICK_LEVEL);
    }
    if (count > al.points) errors.push('picked ' + count + ' talents but only ' + al.points + ' available at level ' + L);
    return { ok: errors.length === 0, errors };
  }

  // Default build: spends EVERY point of the pool (0 left at every level). Talents first (the style's pick per unlocked tier,
  // then the other talent of each tier as the 27..30 points arrive), the rest on orbs in `order`, skipping gated picks.
  function autoLoadout(heroLevel, style) {
    const L = clampLvl(heroLevel), qw = style === 'qw';
    const order = (qw ? ORDER_QW : ORDER_QE).slice();
    const orbs = { quas: 0, wex: 0, exort: 0 };
    const tl = qw ? TALENTS_QW : TALENTS_QE;
    const want = tl.filter((_, i) => L >= TALENT_LEVELS[i]);
    tl.forEach((n, i) => { if (L >= TALENT_SECOND_LEVELS[i]) want.push(T[i].left === n ? T[i].right : T[i].left); });
    const talents = fixTalents(L, want);
    let pts = pointsAvailable(L) - talents.length;
    while (pts > 0 && order.length) {
      const i = order.findIndex(k => orbs[k] < ORB_MAX && orbReqLevel[orbs[k]] <= L);
      if (i < 0) break;
      orbs[order[i]]++; order.splice(i, 1); pts--;
    }
    return { heroLevel: L, orbs, talents, scepter: false, shard: false };
  }

  // Everything the loadout / level-up UI needs to know about hero level `lvl` with spent `orbs` {quas,wex,exort} (q/w/e ok).
  // scepter: falsy | true | 'quas'|'wex'|'exort' (the orb that gets the free +1 level).
  // talents (optional): array of picked talent names or a plain count; each costs one point of the same pool.
  function levelInfo(lvl, orbs, scepter, talents) {
    const L = Math.max(1, clampLvl(lvl || 1)), o = {};
    for (const k of ORBS) { const v = orbs ? (orbs[k] != null ? orbs[k] : orbs[k[0]]) : 0; o[k] = Math.max(0, Math.round(Number(v)) || 0); }
    const orbSum = o.quas + o.wex + o.exort, tSpent = Array.isArray(talents) ? talentsSpent({ talents }) : Math.max(0, talents | 0);
    const spent = orbSum + tSpent, points = pointsAvailable(L), bank = points - spent, cap = orbCap(L);
    const sc = ORBS.includes(scepter) ? scepter : null, canRaise = {}, locked = {}, eff = {};
    for (const k of ORBS) {
      canRaise[k] = bank > 0 && o[k] < cap;
      eff[k] = o[k] + (sc === k ? 1 : 0);
      locked[k] = eff[k] < 1;
    }
    return {
      level: L, points, spent, spentOrbs: orbSum, spentTalents: tSpent, bank, legal: bank >= 0 && ORBS.every(k => o[k] <= cap),
      maxPerOrb: ORB_MAX, maxEff: scepter ? ORB_MAX + 1 : ORB_MAX, orbCap: cap, gated: L <= GATE_UNTIL,
      bonusPointLevels: BONUS_POINT_LEVELS, nextBonusLevel: BONUS_POINT_LEVELS.find(x => x > L) || null,
      canRaise, locked, eff, sum: orbSum, invokeCd: invokeCooldown(orbSum, !!scepter),
      talentsAllowed: talentsAllowed(L),
    };
  }

  // per-hero-level view of a pick order: array[30] of arrays of orbs learned at that level (ungated, as ability points arrive;
  // talent points are not part of it)
  function perLevel(order) {
    const out = []; let used = 0;
    for (let L = 1; L <= MAX_HERO_LEVEL; L++) {
      const n = abilityPointsAt(L) - abilityPointsAt(L - 1);
      out.push(order.slice(used, used + n)); used += n;
    }
    return out;
  }

  IT.RULES = {
    maxHeroLevel: MAX_HERO_LEVEL,
    pointsAtLevel,            // the single pool (ability + Invoke bonus + talent points), cumulative, index = hero level - 1
    abilityPointsAt,          // orb-type part of the pool (base 1/level to 18 + Invoke bonus 6/12/18)
    basePointCap: BASE_POINT_CAP,
    bonusPointLevels: BONUS_POINT_LEVELS,
    talentLevels: TALENT_LEVELS,
    talentSecondLevels: TALENT_SECOND_LEVELS, // tier i (0-based): other talent at 27+i
    talentTiers: TIERS,
    orbs: ORBS,
    orbMax: ORB_MAX,          // 7 spent levels per orb (plan G3); the Scepter orb reaches 8
    orbMaxScepter: ORB_MAX + 1,
    gateUntilLevel: GATE_UNTIL,
    freePickLevel: FREE_PICK_LEVEL,
    allTalents: ALL_TALENTS,
    scepterBonusLevels: 1, // free, ONE chosen orb
    orbReqLevel,
    orbGate, orbCap, fixOrbs, fixTalents, talentsAllowed, levelInfo, invokeCooldown, invokeCdAnchors: INVOKE_CD,
    autoBuild: { qe: perLevel(ORDER_QE), qw: perLevel(ORDER_QW), orderQE: ORDER_QE, orderQW: ORDER_QW, talentsQE: TALENTS_QE, talentsQW: TALENTS_QW },
    autoLoadout,
    pointsAvailable, pointsSpent, pointsLeft, orbsSpent, talentsSpent, talentPointsAt, validate,
    notes: [
      'v4 plan G3 overrides the KV: orbs start locked, max 7 spent levels (KV says 8), 8 with the Scepter orb; gate 2n-1 until hero lvl 13, lvl 14+ unrestricted; unspent points bank.',
      'KV npc_dota_hero_invoker.txt (SteamDatabase master, 7.41f era): orbs MaxLevel 8, max_level 8 +1 via special_bonus_scepter_1; no RequiredLevel/LevelsBetweenUpgrades override on orbs => default basic-ability gate (orb level n needs hero level 2n-1).',
      'Invoke: innate, MaxLevel 1, not learnable. KV keys first/second/third_ability_level = 6/12/18 = hero levels granting +1 ability point (patch 7.41b: additional Ability Point at hero levels 6, 12, 18; Liquipedia Invoker).',
      'Batch P single pool: points(L) = min(L,18) + #{6,12,18 <= L} + #{10,15,20,25,27,28,29,30 <= L}; 29 at lvl 30 = 3 orbs x 7 + 8 talents at 1 point each; 0 left when maxed. Old model (L + bonus = 33, talents free) left 12 over.',
      'Talents (7.40 patch notes): talent points at levels 10,15,20,25,27,28,29,30 (real game: separate from skill points; trainer: paid from the same pool, 1 each). First pick of tier i at 10/15/20/25, other talent of tier i at 27/28/29/30.',
      'Real-game points (7.40 + 7.41b): 1 skill point per hero level 1..22 (15 abilities + 7 attribute levels; Invoker has no Attribute Bonus) + Invoke bonus at 6/12/18; the trainer trims the base to 1..18 so the pool equals what its sinks absorb.',
      'Scepter (7.41): inert until activated; +1 current+max level to a single chosen orb; free, not a spent point. Shard has no level effect.',
      'Liquipedia claims the orb upgrading restriction is removed at hero level 14 - unverified; gate 2n-1 kept (orb 8 needs hero 15).',
      'autoBuild orders are heuristic common QE/QW mid builds, not from a verified guide.',
      'Sources: https://raw.githubusercontent.com/SteamDatabase/GameTracking-Dota2/master/game/dota/pak01_dir/scripts/npc/heroes/npc_dota_hero_invoker.txt ; https://liquipedia.net/dota2/Invoker ; https://liquipedia.net/dota2/Experience ; https://www.dota2.com/datafeed/patchnotes?version=7.40 (7.41, 7.41b) ; https://liquipedia.net/dota2/Version_7.41b'
    ]
  };
})(typeof window !== 'undefined' ? window : globalThis);
