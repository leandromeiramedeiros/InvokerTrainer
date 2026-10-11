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

  // orbReqLevel[n-1] = min hero level to learn orb level n (default Dota basic-ability rule: 2n-1).
  // Index 8 (orb level 9) = scepter bonus: free, no point, no gate.
  const orbReqLevel = [1, 3, 5, 7, 9, 11, 13, 15, 0];

  // Pick orders (orb raised by each successive point). 24 picks = 8/8/8.
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
  function orbGate(n) { return n >= 1 && n <= 8 ? orbReqLevel[n - 1] : (n === 9 ? 0 : Infinity); }
  function tierOf(name) {
    for (let i = 0; i < T.length; i++) if (T[i].left === name || T[i].right === name) return i;
    return -1;
  }
  // talent points unlocked at hero level L (7.40: own points, not skill points)
  function talentPointsAt(L) { return TALENT_LEVELS.filter(x => L >= x).length + TALENT_SECOND_LEVELS.filter(x => L >= x).length; }

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
      if (v > 8) errors.push(k + ' max is 8 (spent points)');
      else if (v > 0 && orbReqLevel[v - 1] > L) errors.push(k + ' level ' + v + ' needs hero level ' + orbReqLevel[v - 1]);
    }
    const avail = pointsAvailable(L), spent = pointsSpent(lo);
    if (spent > avail) errors.push('spent ' + spent + ' points but only ' + avail + ' available at level ' + L);
    const tal = Array.isArray(lo.talents) ? lo.talents : [];
    const seen = new Set(), perTier = [0, 0, 0, 0];
    for (const n of tal) {
      if (seen.has(n)) { errors.push('duplicate talent ' + n); continue; }
      seen.add(n);
      const t = tierOf(n);
      if (t < 0) { errors.push('unknown talent ' + n); continue; }
      if (L < T[t].level) errors.push('talent ' + n + ' needs hero level ' + T[t].level);
      perTier[t]++;
      if (perTier[t] === 2 && L < TALENT_SECOND_LEVELS[t]) errors.push('second talent of tier ' + T[t].level + ' needs hero level ' + TALENT_SECOND_LEVELS[t]);
    }
    return { ok: errors.length === 0, errors };
  }

  // Greedy: spend points in `order`, skipping gated picks until later; returns a legal loadout at heroLevel.
  function autoLoadout(heroLevel, style) {
    const L = clampLvl(heroLevel), qw = style === 'qw';
    const order = (qw ? ORDER_QW : ORDER_QE).slice();
    const orbs = { quas: 0, wex: 0, exort: 0 };
    let pts = pointsAvailable(L);
    while (pts > 0 && order.length) {
      const i = order.findIndex(k => orbs[k] < 8 && orbReqLevel[orbs[k]] <= L);
      if (i < 0) break;
      orbs[order[i]]++; order.splice(i, 1); pts--;
    }
    const tl = qw ? TALENTS_QW : TALENTS_QE;
    const talents = tl.filter((_, i) => L >= TALENT_LEVELS[i]);
    return { heroLevel: L, orbs, talents, scepter: false, shard: false };
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
    orbMax: 8,
    scepterBonusLevels: 1, // free, ONE chosen orb (7.41); that orb max becomes 9
    orbReqLevel,
    orbGate,
    autoBuild: { qe: perLevel(ORDER_QE), qw: perLevel(ORDER_QW), orderQE: ORDER_QE, orderQW: ORDER_QW, talentsQE: TALENTS_QE, talentsQW: TALENTS_QW },
    autoLoadout,
    pointsAvailable, pointsSpent, pointsLeft, talentPointsAt, validate,
    notes: [
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
