'use strict';
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load');

test('icons: generated + hand-drawn sets present, 20x20, restyled (few colours, outline frame)', () => {
  const IT = load(['js/art/art.js', 'js/art/icons.js']);
  const gen = 'quas wex exort invoke coldsnap ghostwalk icewall emp tornado alacrity sunstrike forgespirit chaosmeteor deafeningblast refresher atos vyse shiva meteorhammer bkb blink scepter shard orchid gleipnir travels boots forcestaff dust euls shadowblade'.split(' ');
  for (const k of gen.concat(['ui_atk', 'ui_move', 'ui_stop', 'ui_hold', 'ui_pos'])) {
    const f = IT.Art.frame('icons', k);
    assert.ok(f, k + ' missing');
    assert.strictEqual(f.length, 20, k); assert.ok(f.every(r => r.length === 20), k);
  }
  for (const k of gen) {
    const f = IT.Art.frame('icons', k);
    assert.ok(new Set(f.join('').replace(/\./g, '')).size <= 20, k + ' too many colours (posterize cap)');
    assert.strictEqual(f[0][5], 'A', k + ' outline row');
  }
});
