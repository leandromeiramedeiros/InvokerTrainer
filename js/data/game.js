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
    ENEMY_ITEMS: ['bkb', 'blink', 'shadowblade', 'euls', 'forcestaff', 'dust', 'boots', 'travels'],   // v6 item 40: boots / travels add the KV ms bonus; items an enemy NPC may carry (v4; v6 dust: one charge, used by a chaser at the last-seen spot)
    // v6 item 22: 'default' (bland hooded grunt) is FIRST: the skin a plain enemy wears. Flair lines per skin live in js/data/flair.js.
    // v6 item 15: ranked rotates IT.Skins.pool('enemy') = the free 'default' + the enemy skins bought in the SHOP (js/data/shop.js); 'nando' is a shop enemy.
    // v6 #61: 'ianzinho' (js/art/ianzinho.js) is a shop enemy too (owned only, like nando).
    // v6 #63: 'vitinian' (js/art/vitinian.js) is the premium two-headed ogre (Vitinho + Ianzinho): bigger frame, wide portrait, bulkier hull (SKIN_META).
    SKINS: ['default', 'pedro', 'renan', 'vitinho', 'nando', 'ianzinho', 'vitinian'],
    SKIN_NAMES: { default: 'Grunt', pedro: 'Pedro', renan: 'Renan', vitinho: 'Vitinho', nando: 'Nando', ianzinho: 'Ianzinho', vitinian: 'Vitinian' },
    // v6 #65: per-skin drawn size, in px: frame w x h, anchor = the feet point inside the frame, HUD portrait [w, h], hull = sim collision radius (world units).
    // Every skin in SKINS has an entry; IT.Skins.meta(id) falls back to SKIN_META_DEFAULT for ids without one. Read by render/units.js, sim/pick.js, sim/units.js, ui/hud.js.
    SKIN_META_DEFAULT: { w: 20, h: 24, anchor: [10, 22], portrait: [32, 32], hull: 24 },
    SKIN_META: {
      default: { w: 20, h: 24, anchor: [10, 22], portrait: [32, 32], hull: 24 }, pedro: { w: 20, h: 24, anchor: [10, 22], portrait: [32, 32], hull: 24 },
      renan: { w: 20, h: 24, anchor: [10, 22], portrait: [32, 32], hull: 24 }, vitinho: { w: 20, h: 24, anchor: [10, 22], portrait: [32, 32], hull: 24 },
      nando: { w: 20, h: 24, anchor: [10, 22], portrait: [32, 32], hull: 24 }, ianzinho: { w: 20, h: 24, anchor: [10, 22], portrait: [32, 32], hull: 24 },
      vitinian: { w: 34, h: 28, anchor: [17, 26], portrait: [48, 32], hull: 32 },
    },
    // Dummy stat presets. Behavior: stationary | wander | evasive.
    DUMMY_PRESETS: {
      training: { hp: 2500, mana: 800, armor: 0, magicRes: 0.25, ms: 0, behavior: 'stationary', hpRegen: 0, manaRegen: 0, reaction: 0 },
      standard: { hp: 2200, mana: 900, armor: 5, magicRes: 0.25, ms: 300, behavior: 'wander', hpRegen: 4, manaRegen: 2, reaction: 0.6 },
      expert: { hp: 2600, mana: 1200, armor: 10, magicRes: 0.3, ms: 320, behavior: 'evasive', hpRegen: 8, manaRegen: 3, reaction: 0.35 },
    },
    // Enemy NPC defaults (v4 spawnEnemy). reaction/telegraph/awareness are normally overridden by the difficulty tier.
    ENEMY: {
      hp: 2200, mana: 900, armor: 5, magicRes: 0.25, ms: 300, msBase: [285, 320], msJitter: 3, hpRegen: 4, manaRegen: 2, radius: 24, vision: 1800,   // v6 #46: msBase = per-hero base ms range (item bonuses add on top, never below), msJitter = +- per unit. Dota hero vision: 1800 by day, 800 by night (visionNight, used when w.night / map.night)
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
      dustAt: 80,            // v6 Dust: a chaser dusts only standing within this of the hero's last-seen spot
      // v6 #50 scenario intents (IT.Intent in js/sim/units.js): lowHp = the 'lowHp' trigger (hp fraction), kite = the band a kiter keeps
      // (runs inside min, holds outside max), gank = a fog ganker breaks cover once the hero shows within this, towerBend = max rad a
      // flee_to_tower runner bends its straight-away line toward a friendly tower, rethink = s between jittered waypoints (pathing quality)
      intent: { lowHp: 0.5, kite: { min: 650, max: 1050 }, gank: 900, towerBend: 1.0, rethink: 1.6, holdLeash: 0 },
      // v6 #52 innate blink (QoP / Anti-Mage style, NOT the dagger: usable while damaged). range = blink distance, cd = cooldown after a
      // blink, turn = rad/s turn rate while it faces the destination, recover = s it stands after landing, deny = s a Cold-Snapped /
      // stunned blinker stays denied (it holds and retries, the window a 1.7 s Sun Strike needs), near = a blink_in engager jumps from
      // this far to `land` u short of the hero
      blink: { range: 900, cd: 8, turn: 12, recover: 0.35, deny: 3.5, near: 1200, land: 250 },
    },
    // Hero auto-attack of an enemy NPC (Dota hero baseline: ~50 dmg, 1.7 BAT; no per-hero KV is baked, only the forged spirit). Scaled by the tier's dmgMul.
    ENEMY_ATTACK: {
      ranged: { min: 46, max: 54, bat: 1.7, point: 0.4, range: 600, projSpeed: 1250 },
      melee: { min: 50, max: 60, bat: 1.7, point: 0.4, range: 150, projSpeed: 0 },
    },
    ENEMY_ATTACK_KIND: { default: 'ranged', pedro: 'ranged', renan: 'melee', vitinho: 'ranged', nando: 'ranged', ianzinho: 'ranged', vitinian: 'ranged' },   // skin -> ENEMY_ATTACK profile
    DUMMY: {
      refillBelow: 0.25,     // refill to full when HP drops below 25%
      radius: 24, vision: 800,
      bolt: { range: 700, castTime: 1.2, stun: 1.5, damage: 80, speed: 900, cooldown: 7 },   // stun bolt
      blink: { range: 1000, minRange: 500, tell: 0.35 },
    },
    HERO: { radius: 24 },
    // v6 item 28 (FUN scenarios, js/sim/units.js). Trainer assumptions, no KV baked for these units:
    //   ALLY = a stationary friendly hero the enemy attacks (hero-like hp / armor / vision); ROSHAN = a pit-bound neutral (hp scaled per scenario,
    //   hull 80 = twice a hero's footprint, slow heavy hits); PICKUP = rune / aegis grab radius; TP = Town Portal channel (Dota: 3 s).
    ALLY: { hp: 900, armor: 3, magicRes: 0.25, radius: 24, vision: 1800, visionNight: 800 },
    ROSHAN: { hp: 6000, armor: 20, magicRes: 0.25, radius: 80, min: 65, max: 65, bat: 2, point: 0.6, range: 100, vision: 800 },
    PICKUP: { r: 100 },
    TP: { dur: 3 },
    // v6 item 15 (Skin SHOP): the other two skin families. Player: hero sheet + spell icon / VFX palette. Dummy: the training scarecrow.
    PLAYER_SKINS: ['default', 'kid', 'dark', 'exalted'],
    PLAYER_SKIN_NAMES: { default: 'Invoker', kid: 'Invoker Kid', dark: 'Dark Artistry Invoker', exalted: 'Exalted Invoker' },
    DUMMY_SKINS: ['scarecrow', 'raven'],
    DUMMY_SKIN_NAMES: { scarecrow: 'Scarecrow', raven: 'Raven Scarecrow' },
  };

  // ---- IT.Skins: which skins a mode may use (SHOP ownership comes from IT.Shop.owned when js/data/shop.js is loaded; without it every skin is open,
  // which keeps the headless sim tests unchanged) + the pure per-skin colour tint of spell icons / VFX / the Forge Spirit.
  const FREE = { enemy: 'default', player: 'default', dummy: 'scarecrow' };
  const LISTS = () => ({ enemy: IT.GAME.SKINS, player: IT.GAME.PLAYER_SKINS, dummy: IT.GAME.DUMMY_SKINS });
  function pool(kind) {
    const all = (LISTS()[kind] || []).slice();
    if (!IT.Shop || !IT.Shop.owned) return all;
    const out = all.filter(s => s === FREE[kind] || IT.Shop.owned(s, kind));
    return out.length ? out : [FREE[kind]];
  }
  // hue shift (deg), saturation x, lightness x, lightness +, optional pull toward a target hue (0..1)
  const TINT = {
    kid: { dh: 28, sm: 1.18, lm: 1.08, lb: 0.03 },                       // candy: warmer, brighter, a bit louder
    dark: { dh: 0, sm: 0.92, lm: 0.86, lb: -0.02, to: 272, pull: 0.72 },    // Dark Artistry: every hue bends toward violet / indigo
    exalted: { dh: 0, sm: 1.05, lm: 1, lb: 0.03, to: 44, pull: 0.6 },       // gold with a warm pull (the red edge glow is drawn on the sprite)
  };
  const rgb2hsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, s, l];
  };
  const hsl2rgb = (h, s, l) => {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  };
  // tintRgb(skinId, [r,g,b]) -> [r,g,b]; identity for unknown / default skins. Greys (s ~ 0) stay grey except for the lightness curve.
  function tintRgb(skin, c) {
    const T = TINT[skin];
    if (!T) return [c[0], c[1], c[2]];
    const [h, s, l] = rgb2hsl(c[0], c[1], c[2]);
    let nh = (h + T.dh) % 360;
    if (T.to != null && s > 0.12) {   // pull toward the target hue along the short arc
      let d = ((T.to - nh + 540) % 360) - 180;
      nh = (nh + d * T.pull + 360) % 360;
    }
    return hsl2rgb(nh, Math.max(0, Math.min(1, s * T.sm)), Math.max(0, Math.min(0.97, l * T.lm + T.lb)));
  }
  // meta(skin) -> { w, h, anchor, portrait, hull } for any skin id (unknown / default skins get SKIN_META_DEFAULT)
  function meta(skin) {
    const G_ = IT.GAME, D = G_.SKIN_META_DEFAULT, m = (G_.SKIN_META || {})[skin];
    return m ? Object.assign({}, D, m) : D;
  }
  IT.Skins = { FREE, pool, tintRgb, TINT, meta, has: (kind, s) => (LISTS()[kind] || []).indexOf(s) >= 0 };
})(typeof window !== 'undefined' ? window : globalThis);
