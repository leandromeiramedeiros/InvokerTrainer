// Difficulty ladder (Combo Practice picker + Ranked ramp). Data only. Owner: S3.
// preset/behavior/reaction/stunBolt/escape drive the dummies; hints = recipe hints on the HUD; fog = fog of war on;
// timer = x scenario par for the per-scenario limit; orbCut = orb levels removed from the scenario loadout (never below what its spells need);
// useBkb = dummies pop BKB against disables; hp = x dummy hp to burn; mult = score multiplier; flee/chase = speed factor of scripted dummies.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const D = {
    order: ['ianzinho', 'easy', 'normal', 'hard', 'bambam'],
    ianzinho: { preset: 'training', behavior: 'stationary', reaction: 0, stunBolt: false, escape: 'none', blinkAfter: 3, hints: true, fog: false, timer: 2, orbCut: 0, useBkb: false, hp: 0.8, mult: 0.6, flee: 0.4, chase: 0.45 },
    easy: { preset: 'training', behavior: 'stationary', reaction: 0, stunBolt: false, escape: 'none', blinkAfter: 3, hints: true, fog: false, timer: 1.5, orbCut: 0, useBkb: false, hp: 0.9, mult: 0.8, flee: 0.6, chase: 0.65 },
    normal: { preset: 'standard', behavior: 'wander', reaction: 0.6, stunBolt: false, escape: 'none', blinkAfter: 3, hints: false, fog: false, timer: 1.3, orbCut: 0, useBkb: false, hp: 1, mult: 1, flee: 0.85, chase: 0.85 },
    hard: { preset: 'expert', behavior: 'evasive', reaction: 0.35, stunBolt: true, escape: 'blink_after_seconds', blinkAfter: 4, hints: false, fog: false, timer: 1.1, orbCut: 0, useBkb: false, hp: 1.05, mult: 1.35, flee: 1, chase: 1 },
    bambam: { preset: 'expert', behavior: 'evasive', reaction: 0.25, stunBolt: true, escape: 'blink_after_seconds', blinkAfter: 3, hints: false, fog: true, timer: 0.9, orbCut: 1, useBkb: true, hp: 1.1, mult: 1.8, flee: 1.1, chase: 1.1 },
  };
  D.order.forEach((id, i) => { D[id].id = id; D[id].idx = i; });
  D.get = id => (typeof id === 'number' ? D[D.order[Math.max(0, Math.min(D.order.length - 1, id))]] : D[id]) || D.normal;
  IT.DIFFICULTY = D;
})(typeof window !== 'undefined' ? window : globalThis);
