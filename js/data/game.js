// Hand-authored game config: scale, ids, presets, dummy config. Combos live in js/data/combos.js.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  IT.GAME = {
    UNIT_PX: 6,                 // Dota units per screen pixel
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
    },
    ITEMS_MAIN: ['refresher', 'atos', 'vyse', 'shiva', 'meteorhammer', 'bkb', 'orchid', 'gleipnir'],
    ITEMS_EXTRA: ['blink', 'boots', 'travels'],
    SKINS: ['pedro', 'renan', 'vitinho'],
    SKIN_NAMES: { pedro: 'Pedro', renan: 'Renan', vitinho: 'Vitinho' },
    // Dummy stat presets. Behavior: stationary | wander | evasive.
    DUMMY_PRESETS: {
      training: { hp: 2500, mana: 800, armor: 0, magicRes: 0.25, ms: 0, behavior: 'stationary', hpRegen: 0, manaRegen: 0, reaction: 0 },
      standard: { hp: 2200, mana: 900, armor: 5, magicRes: 0.25, ms: 300, behavior: 'wander', hpRegen: 4, manaRegen: 2, reaction: 0.6 },
      expert: { hp: 2600, mana: 1200, armor: 10, magicRes: 0.3, ms: 320, behavior: 'evasive', hpRegen: 8, manaRegen: 3, reaction: 0.35 },
    },
    DUMMY: {
      refillBelow: 0.25,     // refill to full when HP drops below 25%
      radius: 24, vision: 800,
      bolt: { range: 700, castTime: 1.2, stun: 1.5, damage: 80, speed: 900, cooldown: 7 },   // stun bolt
      blink: { range: 1000, minRange: 500, tell: 0.35 },
    },
    HERO: { radius: 24 },
    TIMED_SECONDS: 120,
  };
})(typeof window !== 'undefined' ? window : globalThis);
