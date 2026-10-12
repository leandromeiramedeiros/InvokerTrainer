// Hand-authored game config: scale, ids, presets, dummy config. Combos live in js/data/combos.js.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  IT.GAME = {
    UNIT_PX: 6,                 // Dota units per screen pixel
    // Huge-map cap (the 368x368 'dota' whole map): terrain is painted in CHUNK-tile squares around the camera, A* is confined to the start/goal box + SEARCH_MARGIN tiles,
    // nearest-walkable rings stop at NEAR_MAX tiles. Maps with w*h <= LAZY_TILES keep the eager full-map paths.
    ARENA: { LAZY_TILES: 40000, CHUNK: 32, SEARCH_MARGIN: 48, NEAR_MAX: 96 },
    VIEW_W: 480, VIEW_H: 270,   // internal canvas (live: scroll-wheel zoom rescales it)
    VIEW_W_BASE: 480, VIEW_H_BASE: 270, ZOOMS: [0.7, 0.8, 0.9, 1, 1.1, 1.2],
    TICK: 1 / 30,
    VISION_HZ: 10,
    ORB_KEYS: { Q: 'quas', W: 'wex', E: 'exort' },
    RECIPES: {                  // sorted orb string -> spell id
      QQQ: 'coldsnap', QQW: 'ghostwalk', EQQ: 'icewall', WWW: 'emp', QWW: 'tornado',
      EWW: 'alacrity', EEE: 'sunstrike', EEQ: 'forgespirit', EEW: 'chaosmeteor', EQW: 'deafeningblast',
    },
    SPELL_ORBS: {
      coldsnap: 'QQQ', ghostwalk: 'QQW', icewall: 'QQE', emp: 'WWW', tornado: 'WWQ',
      alacrity: 'WWE', sunstrike: 'EEE', forgespirit: 'EEQ', chaosmeteor: 'EEW', deafeningblast: 'QWE',
    },
    SPELL_DOTA: {
      coldsnap: 'invoker_cold_snap', ghostwalk: 'invoker_ghost_walk', icewall: 'invoker_ice_wall', emp: 'invoker_emp',
      tornado: 'invoker_tornado', alacrity: 'invoker_alacrity', sunstrike: 'invoker_sun_strike',
      forgespirit: 'invoker_forge_spirit', chaosmeteor: 'invoker_chaos_meteor', deafeningblast: 'invoker_deafening_blast',
    },
    ITEM_DOTA: {
      refresher: 'item_refresher', atos: 'item_rod_of_atos', vyse: 'item_sheepstick', shiva: 'item_shivas_guard',
      meteorhammer: 'item_meteor_hammer', bkb: 'item_black_king_bar', blink: 'item_blink',
      orchid: 'item_orchid', gleipnir: 'item_gungir', travels: 'item_travel_boots', boots: 'item_boots',
      forcestaff: 'item_force_staff', dust: 'item_dust', euls: 'item_cyclone', shadowblade: 'item_invis_sword',
    },
    ITEMS_MAIN: ['refresher', 'atos', 'vyse', 'shiva', 'meteorhammer', 'bkb', 'orchid', 'gleipnir'],
    ITEMS_EXTRA: ['blink', 'boots', 'travels', 'forcestaff', 'dust'],
    ENEMY_ITEMS: ['bkb', 'blink', 'shadowblade', 'euls', 'forcestaff'],   // items an enemy NPC may carry (v4)
    SKINS: ['pedro', 'renan', 'vitinho'],
    SKIN_NAMES: { pedro: 'Pedro', renan: 'Renan', vitinho: 'Vitinho' },
    // Dummy stat presets. Behavior: stationary | wander | evasive.
    DUMMY_PRESETS: {
      training: { hp: 2500, mana: 800, armor: 0, magicRes: 0.25, ms: 0, behavior: 'stationary', hpRegen: 0, manaRegen: 0, reaction: 0 },
      standard: { hp: 2200, mana: 900, armor: 5, magicRes: 0.25, ms: 300, behavior: 'wander', hpRegen: 4, manaRegen: 2, reaction: 0.6 },
      expert: { hp: 2600, mana: 1200, armor: 10, magicRes: 0.3, ms: 320, behavior: 'evasive', hpRegen: 8, manaRegen: 3, reaction: 0.35 },
    },
    // Enemy NPC defaults (v4 spawnEnemy). reaction/telegraph/awareness are normally overridden by the difficulty tier.
    ENEMY: {
      hp: 2200, mana: 900, armor: 5, magicRes: 0.25, ms: 300, hpRegen: 4, manaRegen: 2, radius: 24, vision: 1800,   // Dota hero vision: 1800 by day, 800 by night (visionNight, used when w.night / map.night)
      visionNight: 800,
      reaction: 0.5, telegraph: 0.3, awareness: 0.5,
      notice: 3,             // awareness is a notice DELAY: seconds of plain sight an awareness-0 enemy needs before it registers the hero (x (1 - awareness); per tier: difficulty.js notice)
      noticeNear: 350, noticeNearMul: 3,   // closer than this it notices x3 faster
      noticeDecay: 2,        // the notice timer drains this many times faster than it fills while the hero is out of sight
      unawareMul: 2.5,       // unaware (hero not seen, not hit in the last 2 s): reaction x2.5 (assumption: no Dota analogue)
      hitAwareFor: 2,        // s an enemy stays aware after taking damage
      flee: { range: 1100, step: 500, think: 0.4 },   // 'escape' behaviour: keeps this far from the hero
      shadowRange: 900,      // 'escape': pops Shadow Blade when an aware hero is closer than this
      leash: 150,            // 'defend' / fights-back: chases the hero this far beyond its attack range, then goes home
    },
    // Hero auto-attack of an enemy NPC (Dota hero baseline: ~50 dmg, 1.7 BAT; no per-hero KV is baked, only the forged spirit). Scaled by the tier's dmgMul.
    ENEMY_ATTACK: {
      ranged: { min: 46, max: 54, bat: 1.7, point: 0.4, range: 600, projSpeed: 1250 },
      melee: { min: 50, max: 60, bat: 1.7, point: 0.4, range: 150, projSpeed: 0 },
    },
    ENEMY_ATTACK_KIND: { pedro: 'ranged', renan: 'melee', vitinho: 'ranged' },   // skin -> ENEMY_ATTACK profile
    DUMMY: {
      refillBelow: 0.25,     // refill to full when HP drops below 25%
      radius: 24, vision: 800,
      bolt: { range: 700, castTime: 1.2, stun: 1.5, damage: 80, speed: 900, cooldown: 7 },   // stun bolt
      blink: { range: 1000, minRange: 500, tell: 0.35 },
    },
    HERO: { radius: 24 },
  };
})(typeof window !== 'undefined' ? window : globalThis);
