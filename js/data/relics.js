// v6 WP6: Invoker relics (Dota Plus "Relic progression"), only the ones the sim can measure. Pure data + tier math.
// Source: local Dota 2 install, build 6957 (steam.inf ClientVersion/ServerVersion 6957, Oct 09 2026), pak01_dir.vpk:
//   scripts/tracked_stats_player.vdata_c (invoker_* kill-eater stats), resource/localization/dota_english.txt (KillEaterEvent[Type]_* names),
//   scripts/items/items_game.txt kill_eater_score_types.<event>.in_game_display_interval = the per-level step of a Dota relic.
//   Dota relics level LINEARLY (panorama/scripts/post_game_progress/post_game_progress_hero_relics.vjs_c: level = floor(value / value_per_level);
//   client.dll fills the About tooltip's assists_per_relic_level from kill_eater_score_types[1].in_game_display_interval). There are no tier tables.
// dota: true = a real Dota relic: `step` = the game's per-level value, tiers I..V = Dota relic levels 1..5 (k x step).
// dota: false = a trainer relic measuring the same kind of thing for our scenarios: tiers are trainer-scaled (no Dota source).
// unit: 'n' count, 'dmg' damage / mana points, 's' seconds. Names live in js/data/i18n/relics.js ('relic.<id>', 'relic.<id>.d').
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const R = (id, dota, key, icon, unit, tiers, extra) => Object.assign({ id, dota, key, icon, unit, tiers }, extra || {});
  // real Dota relic: kill-eater event id + items_game in_game_display_interval (per-level step) -> tiers = levels 1..5
  const D = (id, key, icon, unit, ev, step, extra) => R(id, true, key, icon, unit, [1, 2, 3, 4, 5].map(k => k * step), Object.assign({ event: ev, step }, extra || {}));
  const LIST = [
    // ---- Invoker hero relics (rare relics in Dota Plus)
    D('sunstrike_kills', 'KillEaterEventType_Invoker_SunstrikeKills', 'sunstrike', 'n', 23, 15),
    D('tornado_kills', 'KillEaterEventType_Invoker_TornadoKills', 'tornado', 'n', 32, 3),
    D('multi_icewall', 'KillEaterEvent_Invoker_MultiHeroIceWall', 'icewall', 'n', 578, 25, { min: 2 }),
    D('three_emp', 'KillEaterEvent_Invoker_ThreeHeroEMP', 'emp', 'n', 579, 5, { min: 3 }),
    D('three_deafening', 'KillEaterEvent_Invoker_ThreeHeroDeafeningBlast', 'deafeningblast', 'n', 580, 5, { min: 3 }),
    D('multi_meteor', 'KillEaterEvent_Invoker_MultiHeroChaosMeteor', 'chaosmeteor', 'n', 581, 20, { min: 2 }),
    D('alacrity_dmg', 'KillEaterEvent_Invoker_BonusAlacrityDamage', 'alacrity', 'dmg', 582, 25000),
    // ---- generic relics every hero has (common relics)
    D('kills', 'KillEaterEventType_Kills', 'invoke', 'n', 0, 75),
    D('stun_kills', 'KillEaterEvent_StunsLeadingToKills', 'coldsnap', 'n', 5043, 50),
    D('blink_kills', 'KillEaterEvent_KillsAfterBlink', 'blink', 'n', 5038, 100),
    D('bkb_kills', 'KillEaterEvent_KillsDuringBKB', 'bkb', 'n', 5041, 15),
    // ---- trainer relics (no Dota equivalent; same style, sim-measured; tiers trainer-scaled for 8-scenario runs)
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
