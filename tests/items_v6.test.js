'use strict';
// v6 items: #34 Force Staff self-cast (double-tap / Alt+key / Alt+click), #35 Refresher = abilities only, #37 boots do not stack.
const test = require('node:test'), assert = require('node:assert');
const { rig } = require('./input_rig');

const away = r => { r.mw.x = r.h.x - 4000; r.mw.y = r.h.y; };   // cursor on empty ground (nothing to target)
const moved = (r, f) => { const x0 = r.h.x; f(); r.at(r.T.ms + 800); return r.h.x - x0; };

test('forcestaff: single press keeps unit-target (pushes the unit under the cursor, not the hero)', () => {
  const r = rig({ items: ['forcestaff'], dist: 300 });
  r.at(10);
  const hx = r.h.x, d0 = { x: r.dummy.x, y: r.dummy.y };
  r.key('z'); r.at(r.T.ms + 800);
  assert.ok(r.casts.includes('forcestaff'));
  assert.ok(Math.hypot(r.dummy.x - d0.x, r.dummy.y - d0.y) > 300, 'dummy pushed');
  assert.ok(Math.abs(r.h.x - hx) < 60, 'hero stays');
});

test('forcestaff: double-tap within doubleTapTimeout self-casts along the facing; slow second tap does not', () => {
  const r = rig({ items: ['forcestaff'], dist: 300 });
  away(r); r.at(10);
  const d = moved(r, () => { r.key('z'); r.at(r.T.ms + 150); r.key('z'); });
  assert.ok(d > 300, 'hero pushed forward ' + d);
  assert.equal(r.casts.filter(c => c === 'forcestaff').length, 1);
  const r2 = rig({ items: ['forcestaff'], dist: 300 });
  away(r2); r2.at(10);
  r2.key('z'); r2.at(r2.T.ms + 900);   // > 0.6 s: second press is a fresh press (armed -> cast at the empty cursor fails/arms again)
  r2.key('z'); r2.at(r2.T.ms + 800);
  assert.equal(r2.casts.filter(c => c === 'forcestaff').length, 0);
});

test('forcestaff: Alt+key and HUD double-click / Alt+click self-cast', () => {
  const a = rig({ items: ['forcestaff'], dist: 300 });
  a.at(10);   // dummy under the cursor, Alt wins
  const hx = a.h.x, dx = a.dummy.x;
  a.key('z', { altKey: true }); a.at(a.T.ms + 800);
  assert.ok(a.h.x - hx > 300, 'hero pushed'); assert.equal(a.dummy.x, dx);
  const b = rig({ items: ['forcestaff'], dist: 300 });
  away(b); b.at(10);
  assert.ok(moved(b, () => { b.In.doAction('item1', { hud: true }); b.at(b.T.ms + 100); b.In.doAction('item1', { hud: true }); }) > 300, 'HUD double-click');
  const c = rig({ items: ['forcestaff'], dist: 300 });
  away(c); c.at(10);
  c.In.keys.add('Alt');
  assert.ok(moved(c, () => c.In.doAction('item1', { hud: true })) > 300, 'Alt+click');
});

test('selfCast flag: forcestaff only; atos/orchid keep normal targeting under Alt', () => {
  const r = rig({ items: ['forcestaff', 'atos'] });
  assert.equal(r.IT.Abilities.get('forcestaff').selfCast, true);
  assert.ok(!r.IT.Abilities.get('atos').selfCast);
  r.at(10);
  r.key('x', { altKey: true }); r.at(r.T.ms + 100);
  assert.ok(!r.casts.includes('atos') || r.orders.every(o => o.target !== r.h.id), 'atos never self-targeted');
});

test('refresher: spells + Invoke only, items never reset', () => {
  const r = rig({ items: ['refresher', 'bkb', 'blink'] });
  const { h, IT } = r;
  h.cd.sunstrike = 30; h.cd.chaosmeteor = 20; h.inv.invokeCd = 6;
  h.cd.bkb = 50; h.items[1].cd = 50; h.cd.blink = 9; h.items[2].cd = 9;
  assert.ok(IT.Orders.issue(r.w, h, { type: 'cast', ability: 'refresher' }));
  r.at(r.T.ms + 300);
  assert.equal(h.cd.sunstrike, 0); assert.equal(h.cd.chaosmeteor, 0); assert.equal(h.inv.invokeCd, 0);
  assert.ok(h.cd.bkb > 40 && h.items[1].cd > 40, 'bkb cd kept');
  assert.ok(h.cd.blink > 5 && h.items[2].cd > 5, 'blink cd kept');
  assert.ok(h.cd.refresher > 100, 'refresher on cd');
});

test('boots: Travel replaces Speed in the loadout normalizer; one boots slot ever', () => {
  const r = rig({});
  const { IT } = r, L = IT.Loadout, base = L.default();
  for (const items of [['boots', 'travels'], ['travels', 'boots'], ['blink', 'boots', 'bkb', 'travels'], ['boots', 'boots']]) {
    const n = L.normalize(Object.assign({}, base, { items })).items;
    assert.equal(n.filter(x => L.BOOTS.includes(x)).length, 1, JSON.stringify(items));
    if (items.includes('travels')) assert.ok(n.includes('travels') && !n.includes('boots'));
  }
  assert.deepEqual(L.normalize(Object.assign({}, base, { items: ['blink', 'boots', 'bkb', 'travels'] })).items, ['blink', null, 'bkb', 'travels', null, null]);   // 6 fixed slots: the dropped boots leaves a hole
  assert.deepEqual(L.normalize(Object.assign({}, base, { items: ['boots', 'blink'] })).items, ['boots', 'blink', null, null, null, null]);
  assert.ok(!L.validate(Object.assign({}, base, { items: ['boots', 'travels'] })).ok, 'validate still rejects both');
  // sim: both listed (bypassing the normalizer) -> only Travel's ms
  const w = IT.World.create({ seed: 1, fog: false, loadout: L.normalize(base) });
  const h0 = IT.Hero.create(w, Object.assign({}, base, { items: [] }), 100, 100); w.step(); w.step();
  const ms0 = h0.ms;
  const r2 = rig({ items: ['boots', 'travels'] }); r2.at(300);
  assert.ok(Math.abs(r2.h.ms - (ms0 + IT.Values.item(IT.GAME.ITEM_DOTA.travels, 'bonus_movement_speed'))) < 1e-6);
  // through the normalizer: the hero never carries two boots
  const lo = L.normalize(Object.assign({}, base, { items: ['boots', 'travels', 'blink'] }));
  const w3 = IT.World.create({ seed: 1, fog: false, loadout: lo }), h3 = IT.Hero.create(w3, lo, 100, 100);
  assert.equal(h3.items.filter(s => s && L.BOOTS.includes(s.id)).length, 1);
});

test('scenario kits: exactly one boots item each, normalized kit keeps it', () => {
  const T = require('./_load.js')(['js/data/i18n.js', 'js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/scenarios.js', 'js/sim/util.js', 'js/sim/values.js', 'js/sim/loadout.js']);
  assert.ok(T.SCENARIOS.length > 0);
  for (const s of T.SCENARIOS) {
    const b = s.hero.items.filter(x => T.Loadout.BOOTS.includes(x));
    assert.equal(b.length, 1, s.id);
    assert.deepEqual(T.Loadout.fixItems(s.hero.items), s.hero.items, s.id);
  }
});
