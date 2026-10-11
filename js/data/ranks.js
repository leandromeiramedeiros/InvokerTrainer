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
  IT.Ranks = { TIERS, NAMES, START, fromRating, MAX_DELTA: 150 };
})(typeof window !== 'undefined' ? window : globalThis);
