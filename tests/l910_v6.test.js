'use strict';
// v6 #77 I2: the level 9-10 skill-ceiling set. Existing mechanics only; the bot clears each at the tiers below.
const test = require('node:test');
const assert = require('node:assert');
const fb = require('./_funbot.js');
const load = require('./_load.js');
const IT = load(['js/data/i18n.js', 'js/data/i18n/scn.js', 'js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/dotaworld.js', 'js/data/maps.js', 'js/data/difficulty.js', 'js/data/combos.js', 'js/data/scenarios.js']);
// id -> [tiers cleared 6/6 by the bot, maxDf cap]
const SET = {
  blink_chain_fog: [['ian', 'easy', 'common', 'hard'], 'hard'],
  tp_snipe_far: [['ian', 'easy', 'common', 'hard', 'bambam'], null],
  bkb_bait_duo: [['ian', 'easy', 'common'], 'common'],   // two BKBs, one carrier at a time (#78); hard/bambam: 'method'/'time' (the bot's single Cold Snap + hit cannot beat a held BKB)
};
for (const id of Object.keys(SET)) {
  test('l910: ' + id + ' is level 9-10, has EN+PT text, and the bot clears its tiers', () => {
    const sc = IT.SCENARIOS.get(id);
    assert.ok(sc && sc.level >= 9 && sc.level <= 10);
    assert.strictEqual(sc.maxDf || null, SET[id][1]);
    for (const k of ['name', 'flair', 'desc', 'win', 'lose', 'tip']) for (const l of ['en', 'pt']) assert.ok(IT.I18N[l]['scn.' + id + '.' + k], id + ' ' + l + ' ' + k);
    for (const df of SET[id][0]) for (let seed = 1; seed <= 6; seed++) {
      const r = fb.bot(id, df, seed);
      assert.ok(r && r.ok, id + ' ' + df + ' ' + seed + ' ' + (r && r.reason));
    }
  });
}
