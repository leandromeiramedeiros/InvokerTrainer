// Difficulty ladder (Ranked ramp, infinite run, scenario sandbox). Data only. Owner: MODES.
// Tiers (v4): ian < easy < common < hard < bambam.  IT.DIFFICULTY.get(id|index) -> row.  Old saved ids are migrated (ianzinho -> ian, normal -> common).
// Enemy-facing numbers: telegraph = seconds an enemy shows an item before using it (0 = instant); awareness 0..1 + notice (a notice DELAY: it needs notice x (1 - awareness) seconds of plain sight to register you; 1 = at once);
//   reaction = seconds before it answers a threat; hpMul / armorAdd = bulk (hp = scenario damage-to-kill x hpMul, armor = ENEMY.armor + armorAdd); dmgMul = x the enemy hero auto-attack damage; fights = enemies hit back when aware and in range (lower tiers only when cornered, or on 'defend'); timer = x scenario par for the time limit;
//   hints = recipe hints on the HUD; mult = score multiplier; desc = hover text.
// belief (v6 item 27, IT.Belief): predict = x extrapolation of the hero's last heading (0 = last-seen spot only), horizon = s of it, bias =
//   pull toward likely paths (treeline gaps, ramps, the way home), half = confidence half-life s, confused = s a juked chaser stands lost,
//   ring0 / grow / ringMax = search ring, split = chasers fan out (alternative predictions, own search bearings), detect = Dust at the
//   prediction once confident, recatch = items a juke scenario's `recatch` chaser gets to close the gap after reacquiring. (v6: fog of war is always on in every scenario, no per-tier flag)
// revealLinger (v6 item 45) = s the intro start-reveal ring (and its vision) stays on each unseen foe, counted from the camera ARRIVING on it.
// Legacy dummy fields (preset/behavior/stunBolt/escape/blinkAfter/orbCut/useBkb/flee/chase) still drive the fallback foe when the enemy entity is missing.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const L = (en, pt) => ({ en, pt });
  const D = {
    order: ['ian', 'easy', 'common', 'hard', 'bambam'],
    ian: {
      revealLinger: 2.5,
      telegraph: 1.5, awareness: 0.15, notice: 4, reaction: 1.4, hpMul: 0.8, armorAdd: 0, dmgMul: 0.35, fights: false, timer: 2, hints: true, mult: 0.6,
      belief: { predict: 0, bias: 0, half: 3, confused: 1.4, ring0: 120, grow: 70, ringMax: 600, recatch: [] },
      preset: 'training', behavior: 'stationary', stunBolt: false, escape: 'none', blinkAfter: 3, orbCut: 0, useBkb: false, flee: 0.4, chase: 0.45,
      desc: L('Gentle: enemies are slow to notice you, show every item long before using it, and the timer is generous. Recipe hints stay on.',
        'Tranquilo: os inimigos demoram a te notar, mostram cada item bem antes de usar e o tempo sobra. As dicas da receita ficam ligadas.'),
    },
    easy: {
      revealLinger: 2.0,
      telegraph: 1.0, awareness: 0.35, notice: 3.6, reaction: 1.0, hpMul: 0.9, armorAdd: 0, dmgMul: 0.6, fights: false, timer: 1.5, hints: true, mult: 0.8,
      belief: { predict: 0.6, horizon: 1, bias: 0, half: 4, confused: 1.1, grow: 90, ringMax: 700, recatch: [] },
      preset: 'training', behavior: 'stationary', stunBolt: false, escape: 'none', blinkAfter: 3, orbCut: 0, useBkb: false, flee: 0.6, chase: 0.65,
      desc: L('Easy: slow reactions, clear item warnings and a roomy timer. Hints stay on.',
        'Fácil: reações lentas, avisos claros de item e um tempo folgado. As dicas continuam ligadas.'),
    },
    common: {
      revealLinger: 1.5,
      telegraph: 0.6, awareness: 0.6, notice: 3.2, reaction: 0.6, hpMul: 1, armorAdd: 1, dmgMul: 1, fights: false, timer: 1.3, hints: false, mult: 1,
      belief: { predict: 1, horizon: 2.5, bias: 0.5, half: 5, confused: 0.8, recatch: [] },
      preset: 'standard', behavior: 'wander', stunBolt: false, escape: 'none', blinkAfter: 3, orbCut: 0, useBkb: false, flee: 0.85, chase: 0.85,
      desc: L('Common: enemies wander, notice you in time and warn briefly before using an item. No hints.',
        'Comum: os inimigos andam por aí, te notam a tempo e avisam pouco antes de usar um item. Sem dicas.'),
    },
    hard: {
      revealLinger: 1.1,
      telegraph: 0.3, awareness: 0.85, notice: 2.8, reaction: 0.35, hpMul: 1.05, armorAdd: 3, dmgMul: 1.25, fights: true, timer: 1.1, hints: false, mult: 1.35,
      belief: { predict: 1, horizon: 3, bias: 0.7, half: 6, confused: 0.5, split: true, detect: true, recatch: ['forcestaff'], grow: 130, ringMax: 1000 },
      preset: 'expert', behavior: 'evasive', stunBolt: true, escape: 'blink_after_seconds', blinkAfter: 4, orbCut: 0, useBkb: false, flee: 1, chase: 1,
      desc: L('Hard: alert enemies with quick reactions, almost no item warning, extra armor and a tight timer.',
        'Difícil: inimigos atentos com reações rápidas, quase sem aviso de item, mais armadura e tempo apertado.'),
    },
    bambam: {
      revealLinger: 0.8,
      telegraph: 0, awareness: 1, notice: 2.4, reaction: 0.25, hpMul: 1.1, armorAdd: 4, dmgMul: 1.5, fights: true, timer: 0.9, hints: false, mult: 1.8,
      belief: { predict: 1, horizon: 3.5, bias: 0.85, half: 7, confused: 0.3, split: true, detect: true, recatch: ['blink', 'forcestaff'], grow: 150, ringMax: 1100, dustConf: 0.35 },
      preset: 'expert', behavior: 'evasive', stunBolt: true, escape: 'blink_after_seconds', blinkAfter: 3, orbCut: 1, useBkb: true, flee: 1.1, chase: 1.1,
      desc: L('Bam-Bam: enemies see you coming, react at once and use items with no warning. One orb level less, brutal timer.',
        'Bam-Bam: os inimigos te veem chegando, reagem na hora e usam itens sem aviso. Um nível de orbe a menos e tempo brutal.'),
    },
  };
  D.order.forEach((id, i) => { D[id].id = id; D[id].idx = i; });
  const OLD = { ianzinho: 'ian', normal: 'common', extreme: 'bambam' };
  D.migrate = id => (typeof id === 'string' && OLD[id]) || id;
  D.get = id => {
    if (typeof id === 'number') return D[D.order[Math.max(0, Math.min(D.order.length - 1, id | 0))]];
    return D[D.migrate(id)] || D.common;
  };
  IT.DIFFICULTY = D;
})(typeof window !== 'undefined' ? window : globalThis);
