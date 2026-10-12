// Rank bands + rating -> medal. Pure. Owner: S6.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  // Rank bands (persistent rating, MMR-like). ~154 rating per star; Immortal has no stars.
  const TIERS = ['herald', 'guardian', 'crusader', 'archon', 'legend', 'ancient', 'divine', 'immortal'];
  const NAMES = ['Herald', 'Guardian', 'Crusader', 'Archon', 'Legend', 'Ancient', 'Divine', 'Immortal'];
  const START = [0, 770, 1540, 2310, 3080, 3850, 4620, 5420];   // tier lower bounds
  function fromRating(r) {
    r = Math.max(0, Number(r) || 0);
    let tier = 0;
    for (let i = 0; i < START.length; i++) if (r >= START[i]) tier = i;
    if (tier === 7) return { tier, stars: 0, name: NAMES[tier], id: TIERS[tier], next: null };
    const lo = START[tier], hi = START[tier + 1], per = (hi - lo) / 5;
    const stars = Math.min(5, 1 + Math.floor((r - lo) / per));
    return { tier, stars, name: NAMES[tier], id: TIERS[tier], next: Math.round(lo + per * stars) };
  }
  // v6 WP6: the end-splash medal is PER RUN (no cumulative rating). One 8-turn ranked run -> tier from its score, capped by how many
  // scenarios it cleared (CAP[cleared]); Immortal needs 8/8 AND the top score band. Stars 1..5 = position inside the score band.
  // v6 medal: score = CLEAR (scenario points, difficulty bonus <= +30 %) + RELIC (this run's relic levels x weight). Bands tuned on
  // tools/score_sample.mjs (bot, 40 seeds, 8/8 projection; DECISIONS.md "v6 medal"): a clean run at the lowest ramp (ian/easy/common)
  // ~2220 (Ancient 1-2, p10 Legend 5), a perfect hard-ramp run p50 ~2680 (Divine 2), Immortal = p95 of perfect hard / bambam runs.
  const RUN_START = [0, 400, 800, 1250, 1700, 2150, 2600, 2850];   // score lower bound per tier
  const RUN_CAP = [0, 1, 1, 2, 3, 4, 5, 6, 7];                  // max tier by scenarios cleared (index = cleared, 8+ = 7)
  function fromRun(m) {
    m = m || {};
    const score = Math.max(0, Number(m.score) || 0), turns = m.turns || 8;
    const solved = Math.max(0, (m.solved != null ? m.solved : m.cleared != null ? m.cleared : m.combos) | 0);
    let st = 0;
    for (let i = 0; i < RUN_START.length; i++) if (score >= RUN_START[i]) st = i;
    const full = solved >= turns, cap = full ? 7 : Math.min(6, RUN_CAP[Math.min(8, solved)]);
    const tier = Math.min(st, cap);
    if (tier === 7) return { tier, stars: 0, name: NAMES[tier], id: TIERS[tier], next: null };
    let stars;
    if (st > tier) stars = 5;   // score earned more than the clears allow: the top of the capped tier
    else { const lo = RUN_START[tier], hi = RUN_START[tier + 1]; stars = Math.min(5, 1 + Math.floor((score - lo) / ((hi - lo) / 5))); }
    return { tier, stars, name: NAMES[tier], id: TIERS[tier], next: st > tier ? null : RUN_START[tier + 1] };
  }
  const medalKey = r => (r ? (r.tier | 0) * 6 + (r.stars | 0) : -1);
  IT.Ranks = { TIERS, NAMES, START, fromRating, fromRun, medalKey, RUN_START, RUN_CAP, MAX_DELTA: 150 };
})(typeof window !== 'undefined' ? window : globalThis);
