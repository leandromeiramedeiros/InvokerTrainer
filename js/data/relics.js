// v6 WP6: Invoker relics (Dota Plus "Relic progression"), only the ones the sim can measure. Pure data + tier math.
// Source: local Dota 2 install, build 6957 (steam.inf ClientVersion/ServerVersion 6957, Oct 09 2026), pak01_dir.vpk:
//   scripts/tracked_stats_player.vdata_c (invoker_* kill-eater stats), resource/localization/dota_english.txt (KillEaterEvent[Type]_* names),
//   scripts/items/items_game.txt kill_eater_score_types.<event>.in_game_display_interval = the per-level step of a Dota relic.
//   Dota relics level LINEARLY (panorama/scripts/post_game_progress/post_game_progress_hero_relics.vjs_c: level = floor(value / value_per_level);
//   client.dll fills the About tooltip's assists_per_relic_level from kill_eater_score_types[1].in_game_display_interval). There are no tier tables.
// dota: true = a real Dota relic: `step` = the game's per-level value, tiers I..V = Dota relic levels 1..5 (k x step).
// dota: false = a trainer relic measuring the same kind of thing for our scenarios: tiers are trainer-scaled (no Dota source).
// weight (v6 medal): relic score weight per level of progress -- 3 = spell-skill relics (multi-hero / Sun Strike / Tornado kills / Cataclysm),
//   2 = setup kills (stun / blink / BKB), 1 = raw volume (damage, mana, kills, lifts, disable time). Used by StatsCollector.relicScore.
// special: true = the 4 big "rare" relics the client shows in its top row (Multi-Hero Ice Wall 0/25, Three Hero EMP 0/5, Three Hero Deafening Blast 0/5,
//   Multi-Hero Chaos Meteor 0/20: verified vs the live client, screenshots 7-10). Layout (client RELICS 0/14): row 1 = the 4 specials, row 2 = 3 Invoker
//   relics, rows 3 / 4 = 4 + 3 generic relics (`row` 2..4); trainer relics (dota: false) are listed after, outside the 14.
// weight 0 = tracked and shown, but not part of the run score (keeps the medal calibration of tools/score_sample.mjs).
// unit: 'n' count, 'dmg' damage / mana points, 's' seconds. Names live in js/data/i18n/relics.js ('relic.<id>', 'relic.<id>.d').
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const R = (id, dota, key, icon, unit, tiers, extra) => Object.assign({ id, dota, key, icon, unit, tiers }, extra || {});
  // real Dota relic: kill-eater event id + items_game in_game_display_interval (per-level step) -> tiers = levels 1..5
  const D = (id, key, icon, unit, ev, step, extra) => R(id, true, key, icon, unit, [1, 2, 3, 4, 5].map(k => k * step), Object.assign({ event: ev, step }, extra || {}));
  const LIST = [
    // ---- Invoker hero relics (rare relics in Dota Plus)
    D('sunstrike_kills', 'KillEaterEventType_Invoker_SunstrikeKills', 'sunstrike', 'n', 23, 15, { weight: 3, row: 2 }),
    D('tornado_kills', 'KillEaterEventType_Invoker_TornadoKills', 'tornado', 'n', 32, 3, { weight: 3, row: 2 }),
    D('multi_icewall', 'KillEaterEvent_Invoker_MultiHeroIceWall', 'icewall', 'n', 578, 25, { min: 2, weight: 3, special: true, pts: 5 }),
    D('three_emp', 'KillEaterEvent_Invoker_ThreeHeroEMP', 'emp', 'n', 579, 5, { min: 3, weight: 3, special: true, pts: 5 }),
    D('three_deafening', 'KillEaterEvent_Invoker_ThreeHeroDeafeningBlast', 'deafeningblast', 'n', 580, 5, { min: 3, weight: 3, special: true, pts: 5 }),
    D('multi_meteor', 'KillEaterEvent_Invoker_MultiHeroChaosMeteor', 'chaosmeteor', 'n', 581, 20, { min: 2, weight: 3, special: true, pts: 5 }),
    D('alacrity_dmg', 'KillEaterEvent_Invoker_BonusAlacrityDamage', 'alacrity', 'dmg', 582, 25000, { weight: 1, row: 2 }),
    // ---- generic relics every hero has (common relics)
    D('kills', 'KillEaterEventType_Kills', 'invoke', 'n', 0, 75, { weight: 1, row: 3 }),
    D('stun_kills', 'KillEaterEvent_StunsLeadingToKills', 'coldsnap', 'n', 5043, 50, { weight: 2, row: 3 }),
    D('blink_kills', 'KillEaterEvent_KillsAfterBlink', 'blink', 'n', 5038, 100, { weight: 2, row: 3 }),
    D('triple_kills', 'KillEaterEvent_TripleKills', 'meteorhammer', 'n', 223, 2, { weight: 0, row: 3 }),
    D('rampages', 'KillEaterEvent_Rampages', 'shiva', 'n', 224, 1, { weight: 0, row: 4 }),
    D('bkb_kills', 'KillEaterEvent_KillsDuringBKB', 'bkb', 'n', 5041, 15, { weight: 2, row: 4 }),
    D('killing_sprees', 'KillEaterEvent_Killing_Sprees', 'gleipnir', 'n', 8, 10, { weight: 0, row: 4 }),
    // ---- trainer relics (no Dota equivalent; same style, sim-measured; tiers trainer-scaled for 8-scenario runs)
    R('meteor_dmg', false, null, 'chaosmeteor', 'dmg', [1500, 8000, 30000, 100000, 250000], { weight: 1 }),
    R('emp_mana', false, null, 'emp', 'dmg', [800, 4000, 15000, 50000, 120000], { weight: 1 }),
    R('tornado_lifts', false, null, 'tornado', 'n', [10, 40, 150, 400, 1000], { weight: 1 }),
    R('disable_time', false, null, 'coldsnap', 's', [30, 150, 500, 1500, 4000], { weight: 1 }),
    R('spirit_kills', false, null, 'forgespirit', 'n', [2, 8, 25, 70, 180], { weight: 1 }),
    R('cataclysm_hits', false, null, 'scepter', 'n', [5, 25, 80, 220, 500], { weight: 3 }),
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
  // client layout: [4 specials, 3 Invoker, 4 generic, 3 generic] of the Dota relics (14), then the trainer relics
  const SPECIAL = LIST.filter(r => r.special).map(r => r.id), DOTA = LIST.filter(r => r.dota).length;
  const ROWS = [SPECIAL, ...[2, 3, 4].map(n => LIST.filter(r => r.dota && !r.special && r.row === n).map(r => r.id))];
  const TRAINER = LIST.filter(r => !r.dota).map(r => r.id);
  const isSpecial = id => !!(BY[id] && BY[id].special);

  // ---- v6 item 15: POINTS = the spendable currency (Skin SHOP). The medal (StatsCollector.relicScore) stays the run PERFORMANCE grade;
  // points are paid from the same relic deltas but accumulate for good in the lifetime blob (points / spent) and never lower a medal.
  // points = (delta / (step x goalpost)) x base x diffMul x POINTS_K.  base: 5 for the 4 specials (`pts`), 1 for the others.
  // diffMul: ian 0.5 .. bambam 1.5 (0.5 + 0.25 x tierIdx). goalpost ("move the goalpost"): the level step grows on easy, shrinks on hard,
  // steps x (1.5 - 0.25 x tierIdx) clamped 0.5..1.5, so easy cannot farm. Only the points use it: displayed relic tiers keep the Dota steps.
  const POINTS_K = 56, DIFF_COMMON = 2;
  const clampIdx = i => (typeof i === 'number' && isFinite(i) ? Math.max(0, Math.min(4, Math.round(i))) : DIFF_COMMON);
  const diffMul = i => 0.5 + 0.25 * clampIdx(i);
  const goalpost = i => Math.max(0.5, Math.min(1.5, 1.5 - 0.25 * clampIdx(i)));
  const baseOf = id => (BY[id] && BY[id].pts) || 1;
  const points = (id, delta, diffIdx) => {
    const r = BY[id], unit = r && (r.step || r.tiers[0]);
    if (!r || !(delta > 0) || !(unit > 0)) return 0;
    return (delta / (unit * goalpost(diffIdx))) * baseOf(id) * diffMul(diffIdx) * POINTS_K;
  };
  const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];

  IT.RELICS = { LIST, BY, MAX, ROMAN, SPECIAL, ROWS, TRAINER, DOTA, isSpecial, tierOf, progress, fmt, get: id => BY[id] || null, POINTS_K, diffMul, goalpost, baseOf, points };
})(typeof window !== 'undefined' ? window : globalThis);
