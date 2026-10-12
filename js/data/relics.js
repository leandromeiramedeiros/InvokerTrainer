// v6 WP6: Invoker relics (Dota Plus "Relic progression"), only the ones the sim can measure. Pure data + tier math.
// Source: SteamDatabase/GameTracking-Dota2 @ b2c7f7c (2026-10-11):
//   game/dota/pak01_dir/scripts/tracked_stats_player.vdata (invoker_* kill-eater stats) + game/dota/pak01_dir/resource/localization/dota_english.txt
//   (KillEaterEvent[Type]_* names). The files carry no per-relic level thresholds (relic_progress_per_level is served by the GC), so the tiers
//   below are trainer-scaled (a ranked run is 8 short scenarios vs a 40-minute match); see DECISIONS.md.
// dota: true = a real Dota relic (name = the game's English name); false = a trainer relic measuring the same kind of thing for our scenarios.
// unit: 'n' count, 'dmg' damage / mana points, 's' seconds. Names live in js/data/i18n/relics.js ('relic.<id>', 'relic.<id>.d').
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const R = (id, dota, key, icon, unit, tiers, extra) => Object.assign({ id, dota, key, icon, unit, tiers }, extra || {});
  const LIST = [
    // ---- Invoker hero relics (rare relics in Dota Plus)
    R('sunstrike_kills', true, 'KillEaterEventType_Invoker_SunstrikeKills', 'sunstrike', 'n', [3, 12, 40, 120, 300]),
    R('tornado_kills', true, 'KillEaterEventType_Invoker_TornadoKills', 'tornado', 'n', [3, 12, 40, 120, 300]),
    R('multi_icewall', true, 'KillEaterEvent_Invoker_MultiHeroIceWall', 'icewall', 'n', [2, 8, 25, 70, 180], { min: 2 }),
    R('three_emp', true, 'KillEaterEvent_Invoker_ThreeHeroEMP', 'emp', 'n', [1, 4, 12, 35, 90], { min: 3 }),
    R('three_deafening', true, 'KillEaterEvent_Invoker_ThreeHeroDeafeningBlast', 'deafeningblast', 'n', [1, 4, 12, 35, 90], { min: 3 }),
    R('multi_meteor', true, 'KillEaterEvent_Invoker_MultiHeroChaosMeteor', 'chaosmeteor', 'n', [2, 8, 25, 70, 180], { min: 2 }),
    R('alacrity_dmg', true, 'KillEaterEvent_Invoker_BonusAlacrityDamage', 'alacrity', 'dmg', [300, 1500, 6000, 20000, 60000]),
    // ---- generic relics every hero has (common relics)
    R('kills', true, 'KillEaterEventType_Kills', 'invoke', 'n', [10, 40, 150, 400, 1000]),
    R('stun_kills', true, 'KillEaterEvent_StunsLeadingToKills', 'coldsnap', 'n', [5, 20, 75, 200, 500]),
    R('blink_kills', true, 'KillEaterEvent_KillsAfterBlink', 'blink', 'n', [3, 12, 40, 120, 300]),
    R('bkb_kills', true, 'KillEaterEvent_KillsDuringBKB', 'bkb', 'n', [3, 12, 40, 120, 300]),
    // ---- trainer relics (no Dota equivalent; same style, sim-measured)
    R('meteor_dmg', false, null, 'chaosmeteor', 'dmg', [1500, 8000, 30000, 100000, 250000]),
    R('emp_mana', false, null, 'emp', 'dmg', [800, 4000, 15000, 50000, 120000]),
    R('tornado_lifts', false, null, 'tornado', 'n', [10, 40, 150, 400, 1000]),
    R('disable_time', false, null, 'coldsnap', 's', [30, 150, 500, 1500, 4000]),
    R('spirit_kills', false, null, 'forgespirit', 'n', [2, 8, 25, 70, 180]),
    R('cataclysm_hits', false, null, 'scepter', 'n', [5, 25, 80, 220, 500]),
  ];
  const BY = {};
  for (const r of LIST) BY[r.id] = r;
  const MAX = 5;

  // tier reached for a lifetime value (0 = none yet .. MAX)
  function tierOf(id, v) {
    const r = BY[id]; if (!r) return 0;
    let t = 0; for (const th of r.tiers) if ((v || 0) >= th) t++;
    return t;
  }
  // { tier, next (threshold or null when maxed), prev (threshold of the current tier or 0), frac 0..1 towards next }
  function progress(id, v) {
    const r = BY[id]; v = v || 0;
    if (!r) return { tier: 0, next: null, prev: 0, frac: 0 };
    const tier = tierOf(id, v), next = tier < r.tiers.length ? r.tiers[tier] : null, prev = tier > 0 ? r.tiers[tier - 1] : 0;
    return { tier, next, prev, frac: next == null ? 1 : Math.max(0, Math.min(1, (v - prev) / (next - prev))) };
  }
  // value -> display text (seconds with one decimal under 100, damage / counts as integers)
  function fmt(id, v) {
    const r = BY[id]; v = v || 0;
    if (r && r.unit === 's') return (v < 100 ? Math.round(v * 10) / 10 : Math.round(v)) + 's';
    return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];

  IT.RELICS = { LIST, BY, MAX, ROMAN, tierOf, progress, fmt, get: id => BY[id] || null };
})(typeof window !== 'undefined' ? window : globalThis);
