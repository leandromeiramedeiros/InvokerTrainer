// Difficulty ladder (Ranked ramp, infinite run, scenario sandbox). Data only. Owner: MODES.
// Tiers (v4): ian < easy < common < hard < bambam.  IT.DIFFICULTY.get(id|index) -> row.  Old saved ids are migrated (ianzinho -> ian, normal -> common).
// Enemy-facing numbers: telegraph = seconds an enemy shows an item before using it (0 = instant); awareness 0..1 + notice (a notice DELAY: it needs notice x (1 - awareness) seconds of plain sight to register you; 1 = at once);
//   reaction = seconds before it answers a threat; hpMul / armorAdd = bulk (hp = scenario damage-to-kill x hpMul; #30 I8: hpMul > 1 (hard 1.05, bambam 1.1) only scales NON-KILL units (enemycard, hold / escape foes, infinite laps):
//   a kill foe's hp is min(HP_CAP 0.9, HP_SHARE 0.9 x hpMul) x the steps' damage (Ranked.foeHp), so the whole combo must always kill and there hard / bambam bulk is armorAdd only; armor = ENEMY.armor + armorAdd); dmgMul = x the enemy hero auto-attack damage; fights = enemies hit back when aware and in range (lower tiers only when cornered, or on 'defend'); timer = x scenario par for the time limit, slack = + s on it (#77 I6: ian 6 .. hard / bambam 1);
//   hints = recipe hints on the HUD; mult = score multiplier; desc = hover text.
// belief (v6 item 27, IT.Belief): predict = x extrapolation of the hero's last heading (0 = last-seen spot only), horizon = s of it, bias =
//   pull toward likely paths (treeline gaps, ramps, the way home), half = confidence half-life s, confused = s a juked chaser stands lost,
//   ring0 / grow / ringMax = search ring, split = chasers fan out (alternative predictions, own search bearings), detect = Dust at the
//   prediction once confident, recatch = items a juke scenario's `recatch` chaser gets to close the gap after reacquiring, floor = a juke chaser runs at >= floor x the hero's speed (#77 I4). (v6: fog of war is always on in every scenario, no per-tier flag)
// exec (v6 #50 / #52 / #58) = EXECUTION only (the scenario's intent never changes with the tier): jitter = +-u of waypoint error on scripted
//   moves (pathing quality), itemP = chance a defensive item / innate blink is used when it should be, predict = 0..1 lead on the hero's
//   heading when aiming a blink, sway = u a guard fidgets around its post, dodge = sidesteps ground danger zones on foot,
//   gwDust / gwReact = chance + s before a Ghost-Walk-slowed foe dusts its own feet, blinkCast = innate blink cast point s,
//   blinkWarn (v6 #75) = s of visible blink warning (glint above the head + ghost at the destination) ON TOP of the cast point, innate + Blink Dagger.
// msMul (v6 #68) = x the enemy's scripted move speed (flee / chase / march / kite): (max(rolled hero base, tier speed) x msMul) + boots / travels / Euls bonus.
// revealLinger (v6 item 45) = s the intro start-reveal ring (and its vision) stays on each unseen foe, counted from the camera ARRIVING on it.
// Legacy dummy fields (preset/behavior/stunBolt/escape/blinkAfter/orbCut/useBkb/flee/chase) still drive the fallback foe when the enemy entity is missing.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const L = (en, pt) => ({ en, pt });
  const D = {
    order: ['ian', 'easy', 'common', 'hard', 'bambam'],
    ian: {
      msMul: 0.82,
      exec: { jitter: 220, itemP: 0.35, predict: 0.2, sway: 0, dodge: false, gwDust: 0, gwReact: 1.6, blinkCast: 0.35, blinkWarn: 0.9 },
      revealLinger: 2.5,
      telegraph: 1.5, awareness: 0.15, notice: 4, reaction: 1.4, hpMul: 0.8, armorAdd: 0, dmgMul: 0.35, fights: false, timer: 2, slack: 6, hints: true, mult: 0.6,
      belief: { predict: 1, horizon: 2, floor: 1, bias: 0, half: 3, confused: 1.4, ring0: 120, grow: 70, ringMax: 600, recatch: [] },   // #77 I4: straight-line predict + hero-speed floor (no walk-away win)
      preset: 'training', behavior: 'stationary', stunBolt: false, escape: 'none', blinkAfter: 3, orbCut: 0, useBkb: false, flee: 0.4, chase: 0.45,
      desc: L('Gentle: enemies are slow to notice you, show every item long before using it, and the timer is generous. Recipe hints stay on.',
        'Tranquilo: os inimigos demoram a te notar, mostram cada item bem antes de usar e o tempo sobra. As dicas da receita ficam ligadas.'),
    },
    easy: {
      msMul: 0.88,
      exec: { jitter: 160, itemP: 0.55, predict: 0.45, sway: 0, dodge: false, gwDust: 0.1, gwReact: 1.2, blinkCast: 0.32, blinkWarn: 0.7 },
      revealLinger: 2.0,
      telegraph: 1.0, awareness: 0.35, notice: 3.6, reaction: 1.0, hpMul: 0.9, armorAdd: 0, dmgMul: 0.6, fights: false, timer: 1.5, slack: 5, hints: true, mult: 0.8,
      belief: { predict: 1, horizon: 3, floor: 1, bias: 0, half: 4, confused: 1.1, grow: 90, ringMax: 700, recatch: [] },   // #77 I4 (was predict 0.6 / horizon 1)
      preset: 'training', behavior: 'stationary', stunBolt: false, escape: 'none', blinkAfter: 3, orbCut: 0, useBkb: false, flee: 0.6, chase: 0.65,
      desc: L('Easy: slow reactions, clear item warnings and a roomy timer. Hints stay on.',
        'Fácil: reações lentas, avisos claros de item e um tempo folgado. As dicas continuam ligadas.'),
    },
    common: {
      msMul: 0.95,
      exec: { jitter: 100, itemP: 0.8, predict: 0.7, sway: 120, dodge: false, gwDust: 0.45, gwReact: 0.8, blinkCast: 0.27, blinkWarn: 0.5 },
      revealLinger: 1.5,
      telegraph: 0.6, awareness: 0.6, notice: 3.2, reaction: 0.6, hpMul: 1, armorAdd: 1, dmgMul: 1, fights: false, timer: 1.3, slack: 4, hints: false, mult: 1,
      belief: { predict: 1, horizon: 2.5, bias: 0.5, half: 5, confused: 0.8, recatch: [] },
      preset: 'standard', behavior: 'wander', stunBolt: false, escape: 'none', blinkAfter: 3, orbCut: 0, useBkb: false, flee: 0.85, chase: 0.85,
      desc: L('Common: enemies wander, notice you in time and warn briefly before using an item. No hints.',
        'Comum: os inimigos andam por aí, te notam a tempo e avisam pouco antes de usar um item. Sem dicas.'),
    },
    hard: {
      msMul: 1,
      exec: { jitter: 50, itemP: 0.92, predict: 0.9, sway: 150, dodge: true, gwDust: 0.8, gwReact: 0.5, blinkCast: 0.2, blinkWarn: 0.3 },
      revealLinger: 1.1,
      telegraph: 0.3, awareness: 0.85, notice: 2.8, reaction: 0.35, hpMul: 1.05, armorAdd: 3, dmgMul: 1.25, fights: true, timer: 0.7, slack: 1, hints: false, mult: 1.35,
      belief: { predict: 1, horizon: 3, bias: 0.7, half: 6, confused: 0.5, split: true, detect: true, recatch: ['forcestaff'], grow: 130, ringMax: 1000 },
      preset: 'expert', behavior: 'evasive', stunBolt: true, escape: 'blink_after_seconds', blinkAfter: 4, orbCut: 0, useBkb: false, flee: 1, chase: 1,
      desc: L('Hard: alert enemies with quick reactions, almost no item warning, extra armor and a tight timer.',
        'Difícil: inimigos atentos com reações rápidas, quase sem aviso de item, mais armadura e tempo apertado.'),
    },
    bambam: {
      msMul: 1,
      exec: { jitter: 15, itemP: 1, predict: 1, sway: 180, dodge: true, gwDust: 0.97, gwReact: 0.3, blinkCast: 0.15, blinkWarn: 0.15 },
      revealLinger: 0.8,
      telegraph: 0, awareness: 1, notice: 2.4, reaction: 0.25, hpMul: 1.1, armorAdd: 4, dmgMul: 1.5, fights: true, timer: 0.6, slack: 1, hints: false, mult: 1.8,
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
