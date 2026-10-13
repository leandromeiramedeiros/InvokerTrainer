'use strict';
// #77: skill relics (escape / alacrity_hits / orb_swap), points concentration `sc` / `ptm`, Roshan KV stats.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const IT = load(['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/combos.js', 'js/data/ranks.js', 'js/data/relics.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js', 'js/sim/nav.js', 'js/sim/vision.js',
  'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js', 'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/combo.js', 'js/sim/stats.js']);
const map = IT.Map.build(IT.MAPDEF);
const mk = ranked => {
  const lo = IT.Loadout.normalize(IT.Loadout.default());
  const w = IT.World.create({ seed: 4, map, loadout: lo, fog: false, autoAttack: false });
  const h = IT.Hero.create(w, lo, map.spawns.hero.x, map.spawns.hero.y);
  if (ranked) w.ranked = { mode: ranked, pr: { sc: { obj: { type: 'escape' } } } };
  return { w, h, S: IT.StatsCollector.create(w) };
};

test('new skill relics: non-special trainer relics with names (EN/PT checked by relics_v6)', () => {
  for (const id of ['escape', 'alacrity_hits', 'orb_swap']) { const r = IT.RELICS.BY[id]; assert.ok(r && !r.special && !r.dota && r.tiers.length === 5, id); }
});
test('orb_swap: an invoke within 1 s of a spell cast; escape: an escape objective won; ranked only', () => {
  for (const [mode, n] of [['ranked', 1], [null, 0]]) {
    const { w, h, S } = mk(mode);
    w.emit('cast', { unit: h.id, ability: 'coldsnap' }); w.emit('invoke', { unit: h.id, spell: 'tornado' });
    w.t += 2; w.emit('invoke', { unit: h.id, spell: 'emp' });
    w.emit('scnResult', { ok: true, id: 'x' }); w.emit('scnResult', { ok: false, id: 'x' });
    assert.equal(S.data.relics.orb_swap || 0, n); assert.equal(S.data.relics.escape || 0, n);
  }
});
test('points concentration: tornado_kills capped, dead relics earn, Roshan = KV', () => {
  const R = IT.RELICS;
  assert.ok(R.points('blink_kills', 1, 2) > 5 && R.points('alacrity_dmg', 200, 2) > 1);
  assert.ok(R.points('tornado_kills', 3, 2) < R.points('sunstrike_kills', 15, 2) * 1.5);
  const o = IT.GAME.ROSHAN;
  assert.deepEqual([o.armor, o.magicRes, o.min, o.max, o.range, o.vision], [30, 0.55, 75, 75, 150, 1400]);
});
