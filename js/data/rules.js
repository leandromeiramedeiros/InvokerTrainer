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

  // cumulative orb-capable ability points at hero level L (index L-1)
  const pointsAtLevel = [];
  for (let L = 1; L <= MAX_HERO_LEVEL; L++) pointsAtLevel.push(L + BONUS_POINT_LEVELS.filter(b => L >= b).length);

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
  function pointsSpent(lo) { const o = (lo && lo.orbs) || {}; return ORBS.reduce((s, k) => s + (o[k] | 0), 0); }
  function pointsLeft(lo) { return pointsAvailable(lo && lo.heroLevel) - pointsSpent(lo); }
  function orbGate(n) { return n >= 1 && n <= ORB_MAX ? orbReqLevel[n - 1] : (n === ORB_MAX + 1 ? 0 : Infinity); }
  // max spent level an orb may have at hero level L (gate 2n-1 until lvl 13, unrestricted after)
  function orbCap(L) { L = clampLvl(L); if (L < 1) return 0; return L > GATE_UNTIL ? ORB_MAX : Math.min(ORB_MAX, (L + 1) >> 1); }
  // Auto-fix an illegal orb set for hero level L: clamp to the gate cap, then shave the highest orbs until points suffice.
  function fixOrbs(L, o) {
    o = o || {};
    const cap = orbCap(L), out = {};
    for (const k of ORBS) { const v = o[k] != null ? o[k] : o[k[0]]; out[k] = Math.max(0, Math.min(cap, Math.round(Number(v)) || 0)); }
    let over = pointsSpent({ orbs: out }) - pointsAvailable(L);
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
  // talent points unlocked at hero level L (7.40: own points, not skill points)
  function talentPointsAt(L) { return TALENT_LEVELS.filter(x => L >= x).length + TALENT_SECOND_LEVELS.filter(x => L >= x).length; }
  const ALL_TALENTS = T.flatMap(t => [t.left, t.right]);
  const FREE_PICK_LEVEL = 27;   // plan G4: from lvl 27 the "other" talents may be picked in any tier; all 8 are granted at 30
  // Talent picking rules at hero level L: { points, firstPicks, extra, perTier, anyTier, all }
  function talentsAllowed(L) {
    L = clampLvl(L);
    const points = talentPointsAt(L), first = TALENT_LEVELS.filter(x => L >= x).length;
    return { points, firstPicks: first, extra: points - first, perTier: L >= FREE_PICK_LEVEL ? 2 : 1, anyTier: L >= FREE_PICK_LEVEL, all: L >= MAX_HERO_LEVEL };
  }
  // Auto-fix a talent list for hero level L (unknown names are left alone; lvl 30 grants all 8).
  function fixTalents(L, tal) {
    L = clampLvl(L);
    tal = Array.isArray(tal) ? tal : [];
    if (L >= MAX_HERO_LEVEL) return ALL_TALENTS.concat(tal.filter(n => typeof n === 'string' && tierOf(n) < 0));
    const al = talentsAllowed(L), per = [0, 0, 0, 0], seen = new Set(), out = [];
    let n = 0;
    for (const name of tal) {
      if (typeof name !== 'string' || seen.has(name)) continue;
      seen.add(name);
      const t = tierOf(name);
      if (t < 0) { out.push(name); continue; }
      if (L < T[t].level || per[t] >= al.perTier || n >= al.points) continue;
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
    if (spent > avail) errors.push('spent ' + spent + ' points but only ' + avail + ' available at level ' + L);
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

  // Greedy: spend points in `order`, skipping gated picks until later; returns a legal loadout at heroLevel.
  function autoLoadout(heroLevel, style) {
    const L = clampLvl(heroLevel), qw = style === 'qw';
    const order = (qw ? ORDER_QW : ORDER_QE).slice();
    const orbs = { quas: 0, wex: 0, exort: 0 };
    let pts = pointsAvailable(L);
    while (pts > 0 && order.length) {
      const i = order.findIndex(k => orbs[k] < ORB_MAX && orbReqLevel[orbs[k]] <= L);
      if (i < 0) break;
      orbs[order[i]]++; order.splice(i, 1); pts--;
    }
    const tl = qw ? TALENTS_QW : TALENTS_QE;
    const talents = tl.filter((_, i) => L >= TALENT_LEVELS[i]);
    return { heroLevel: L, orbs, talents: fixTalents(L, talents), scepter: false, shard: false };
  }

  // Everything the loadout / level-up UI needs to know about hero level `lvl` with spent `orbs` {quas,wex,exort} (q/w/e ok).
  // scepter: falsy | true | 'quas'|'wex'|'exort' (the orb that gets the free +1 level).
  function levelInfo(lvl, orbs, scepter) {
    const L = Math.max(1, clampLvl(lvl || 1)), o = {};
    for (const k of ORBS) { const v = orbs ? (orbs[k] != null ? orbs[k] : orbs[k[0]]) : 0; o[k] = Math.max(0, Math.round(Number(v)) || 0); }
    const spent = o.quas + o.wex + o.exort, points = pointsAvailable(L), bank = points - spent, cap = orbCap(L);
    const sc = ORBS.includes(scepter) ? scepter : null, canRaise = {}, locked = {}, eff = {};
    for (const k of ORBS) {
      canRaise[k] = bank > 0 && o[k] < cap;
      eff[k] = o[k] + (sc === k ? 1 : 0);
      locked[k] = eff[k] < 1;
    }
    return {
      level: L, points, spent, bank, legal: bank >= 0 && ORBS.every(k => o[k] <= cap),
      maxPerOrb: ORB_MAX, maxEff: scepter ? ORB_MAX + 1 : ORB_MAX, orbCap: cap, gated: L <= GATE_UNTIL,
      bonusPointLevels: BONUS_POINT_LEVELS, nextBonusLevel: BONUS_POINT_LEVELS.find(x => x > L) || null,
      canRaise, locked, eff, sum: spent, invokeCd: invokeCooldown(spent, !!scepter),
      talentsAllowed: talentsAllowed(L),
    };
  }

  // per-hero-level view of a pick order: array[30] of arrays of orbs learned at that level (ungated, as points arrive)
  function perLevel(order) {
    const out = []; let used = 0;
    for (let L = 1; L <= MAX_HERO_LEVEL; L++) {
      const n = pointsAtLevel[L - 1] - (L > 1 ? pointsAtLevel[L - 2] : 0);
      out.push(order.slice(used, used + n)); used += n;
    }
    return out;
  }

  IT.RULES = {
    maxHeroLevel: MAX_HERO_LEVEL,
    pointsAtLevel,
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
    pointsAvailable, pointsSpent, pointsLeft, talentPointsAt, validate,
    notes: [
      'v4 plan G3 overrides the KV: orbs start locked, max 7 spent levels (KV says 8), 8 with the Scepter orb; gate 2n-1 until hero lvl 13, lvl 14+ unrestricted; unspent points bank.',
      'KV npc_dota_hero_invoker.txt (SteamDatabase master, 7.41f era): orbs MaxLevel 8, max_level 8 +1 via special_bonus_scepter_1; no RequiredLevel/LevelsBetweenUpgrades override on orbs => default basic-ability gate (orb level n needs hero level 2n-1).',
      'Invoke: innate, MaxLevel 1, not learnable. KV keys first/second/third_ability_level = 6/12/18 = hero levels granting +1 ability point (patch 7.41b: additional Ability Point at hero levels 6, 12, 18; Liquipedia Invoker).',
      'Ability points: 1 per hero level 1..30 (Liquipedia Experience/Abilities). Invoker has no Attribute Bonus (Liquipedia Attributes). 33 points total vs 24 orb levels needed.',
      'Talents (7.40 general notes): no skill point; separate talent points at levels 10,15,20,25,27,28,29,30. First pick of tier i at 10/15/20/25, other talent of tier i at 27/28/29/30 (Liquipedia Talents/Experience).',
      'Scepter (7.41): inert until activated; +1 current+max level to a single chosen orb; free, not a spent point. Shard has no level effect.',
      'Liquipedia claims the orb upgrading restriction is removed at hero level 14 - unverified; gate 2n-1 kept (orb 8 needs hero 15).',
      'autoBuild orders are heuristic common QE/QW mid builds, not from a verified guide.',
      'Sources: https://raw.githubusercontent.com/SteamDatabase/GameTracking-Dota2/master/game/dota/pak01_dir/scripts/npc/heroes/npc_dota_hero_invoker.txt ; https://liquipedia.net/dota2/Invoker ; https://liquipedia.net/dota2/Experience ; https://www.dota2.com/datafeed/patchnotes?version=7.40 (7.41, 7.41b)'
    ]
  };
})(typeof window !== 'undefined' ? window : globalThis);
