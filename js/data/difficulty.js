// Difficulty ladder (Ranked ramp, infinite run, scenario sandbox). Data only. Owner: MODES.
// Tiers (v4): ian < easy < common < hard < bambam.  IT.DIFFICULTY.get(id|index) -> row.  Old saved ids are migrated (ianzinho -> ian, normal -> common).
// Enemy-facing numbers: telegraph = seconds an enemy shows an item before using it (0 = instant); awareness 0..1 (how fast it notices you);
//   reaction = seconds before it answers a threat; hpMul / armorAdd = bulk; timer = x scenario par for the time limit;
//   hints = recipe hints on the HUD; fog = fog of war; mult = score multiplier; desc = hover text.
// Legacy dummy fields (preset/behavior/stunBolt/escape/blinkAfter/orbCut/useBkb/flee/chase) still drive the fallback foe when the enemy entity is missing.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const L = (en, pt) => ({ en, pt });
  const D = {
    order: ['ian', 'easy', 'common', 'hard', 'bambam'],
    ian: {
      telegraph: 1.5, awareness: 0.15, reaction: 1.4, hpMul: 0.8, armorAdd: 0, timer: 2, hints: true, fog: false, mult: 0.6,
      preset: 'training', behavior: 'stationary', stunBolt: false, escape: 'none', blinkAfter: 3, orbCut: 0, useBkb: false, flee: 0.4, chase: 0.45,
      desc: L('Gentle: enemies are slow to notice you, show every item long before using it, and the timer is generous. Recipe hints stay on.',
        'Tranquilo: os inimigos demoram a te notar, mostram cada item bem antes de usar e o tempo sobra. As dicas da receita ficam ligadas.'),
    },
    easy: {
      telegraph: 1.0, awareness: 0.35, reaction: 1.0, hpMul: 0.9, armorAdd: 0, timer: 1.5, hints: true, fog: false, mult: 0.8,
      preset: 'training', behavior: 'stationary', stunBolt: false, escape: 'none', blinkAfter: 3, orbCut: 0, useBkb: false, flee: 0.6, chase: 0.65,
      desc: L('Easy: slow reactions, clear item warnings and a roomy timer. Hints stay on.',
        'Fácil: reações lentas, avisos claros de item e um tempo folgado. As dicas continuam ligadas.'),
    },
    common: {
      telegraph: 0.6, awareness: 0.6, reaction: 0.6, hpMul: 1, armorAdd: 1, timer: 1.3, hints: false, fog: false, mult: 1,
      preset: 'standard', behavior: 'wander', stunBolt: false, escape: 'none', blinkAfter: 3, orbCut: 0, useBkb: false, flee: 0.85, chase: 0.85,
      desc: L('Common: enemies wander, notice you in time and warn briefly before using an item. No hints.',
        'Comum: os inimigos andam por aí, te notam a tempo e avisam pouco antes de usar um item. Sem dicas.'),
    },
    hard: {
      telegraph: 0.3, awareness: 0.85, reaction: 0.35, hpMul: 1.05, armorAdd: 3, timer: 1.1, hints: false, fog: false, mult: 1.35,
      preset: 'expert', behavior: 'evasive', stunBolt: true, escape: 'blink_after_seconds', blinkAfter: 4, orbCut: 0, useBkb: false, flee: 1, chase: 1,
      desc: L('Hard: alert enemies with quick reactions, almost no item warning, extra armor and a tight timer.',
        'Difícil: inimigos atentos com reações rápidas, quase sem aviso de item, mais armadura e tempo apertado.'),
    },
    bambam: {
      telegraph: 0, awareness: 1, reaction: 0.25, hpMul: 1.1, armorAdd: 4, timer: 0.9, hints: false, fog: true, mult: 1.8,
      preset: 'expert', behavior: 'evasive', stunBolt: true, escape: 'blink_after_seconds', blinkAfter: 3, orbCut: 1, useBkb: true, flee: 1.1, chase: 1.1,
      desc: L('Bam-Bam: enemies see you coming, react at once and use items with no warning. Fog of war, one orb level less, brutal timer.',
        'Bam-Bam: os inimigos te veem chegando, reagem na hora e usam itens sem aviso. Névoa de guerra, um nível de orbe a menos e tempo brutal.'),
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
