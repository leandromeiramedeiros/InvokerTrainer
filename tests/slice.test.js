'use strict';
// Vertical slice: real map, hero, training dummy; Cold Snap then Shift-queued Sun Strike.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js'];

test('slice: invoke, cold snap, queued sun strike hits dummy', () => {
  const IT = load(FILES);
  const map = IT.Map.build(IT.MAPDEF), loadout = IT.Loadout.default();
  const w = IT.World.create({ seed: 3, map, loadout, fog: true, autoAttack: false });
  const h = IT.Hero.create(w, loadout, map.spawns.hero.x, map.spawns.hero.y);
  const sp = map.spawns.dummies[0];
  const d = IT.Units.spawnDummy(w, { x: sp.x, y: sp.y, preset: 'training', skin: 'pedro' });
  const seen = [];
  w.on('*', e => { if (['hit', 'miss', 'cast', 'fail'].includes(e.type)) seen.push(`${e.type}:${e.ability || e.reason}`); });
  for (const k of 'QQQ') IT.Invoke.orb(w, h, k); IT.Invoke.invoke(w, h);
  for (const k of 'EEE') IT.Invoke.orb(w, h, k); IT.Invoke.invoke(w, h);
  w.step();
  assert.ok(d.visible, 'dummy visible');
  IT.Orders.issue(w, h, { type: 'cast', ability: 'coldsnap', target: d.id });
  IT.Orders.issue(w, h, { type: 'cast', ability: 'sunstrike', x: d.x, y: d.y, queued: true });
  for (let i = 0; i < 30 * 5; i++) w.step();
  assert.deepStrictEqual(seen, ['cast:coldsnap', 'hit:coldsnap', 'cast:sunstrike', 'hit:sunstrike'], seen.join());
  assert.ok(d.hp < d.maxHp);
});
