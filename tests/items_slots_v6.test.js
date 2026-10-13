'use strict';
// v6 #70: item slots are 6 FIXED slots with holes (loadout + HUD): drop on empty = move, drop on full = swap, click adds to the first hole,
// remove leaves a hole, hotkeys follow the slot index, packed old saves migrate (pad to 6), normalize pads to 6.
const test = require('node:test'), assert = require('node:assert');
const load = require('./_load.js');
const { rig } = require('./input_rig');
const T = load(['js/data/i18n.js', 'js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/scenarios.js', 'js/sim/util.js', 'js/sim/values.js', 'js/sim/loadout.js']);
const L = T.Loadout, base = L.default();
const norm = items => L.normalize(Object.assign({}, base, { items })).items;
const N = null;

test('normalize pads to exactly 6 entries; holes stay where they are; default is 6 holes', () => {
  assert.deepEqual(base.items, [N, N, N, N, N, N]);
  assert.deepEqual(norm(['blink', 'bkb']), ['blink', 'bkb', N, N, N, N]);
  assert.deepEqual(norm([N, 'blink', N, 'bkb']), [N, 'blink', N, 'bkb', N, N]);
  assert.deepEqual(norm(['a'.repeat(0), 5, {}, 'blink']).length, 6);
  assert.deepEqual(norm(undefined), [N, N, N, N, N, N]);
  assert.deepEqual(norm(['blink', N, N, N, N, 'bkb']), ['blink', N, N, N, N, 'bkb']);
  assert.ok(L.validate(Object.assign({}, base, { items: [N, 'blink', N, N, N, N] })).ok, 'holes are valid');
  assert.ok(!L.validate(Object.assign({}, base, { items: ['blink', 'blink', N, N, N, N] })).ok);
  assert.ok(!L.validate(Object.assign({}, base, { items: ['refresher', 'atos', 'vyse', 'shiva', 'meteorhammer', 'bkb', 'blink'] })).ok);
});

test('migration: old packed saves (short, no nulls) pad to 6 and keep order; idempotent; survives JSON (holes are saved)', () => {
  const old = ['refresher', 'blink', 'travels'];
  const m = norm(old);
  assert.deepEqual(m, ['refresher', 'blink', 'travels', N, N, N]);
  assert.deepEqual(norm(m), m);
  const saved = JSON.parse(JSON.stringify({ lo: Object.assign({}, base, { items: [N, 'blink', N, 'bkb', N, N] }) }));
  assert.deepEqual(saved.lo.items, [N, 'blink', N, 'bkb', N, N]);
  assert.deepEqual(norm(saved.lo.items), [N, 'blink', N, 'bkb', N, N]);
  assert.deepEqual(L.normalize(JSON.parse(JSON.stringify(L.normalize(saved.lo)))).items, [N, 'blink', N, 'bkb', N, N]);
  assert.ok(L.validate(L.normalize(saved.lo)).ok);
});

test('scenario kits keep working: normalize pads, same ids in same order, boots kept', () => {
  for (const s of T.SCENARIOS) {
    const n = norm(s.hero.items);
    assert.equal(n.length, 6, s.id);
    assert.deepEqual(n.filter(Boolean), L.fixItems(s.hero.items), s.id);
    assert.deepEqual(n.slice(0, s.hero.items.length), s.hero.items, s.id);
  }
});

test('boots dedupe leaves a hole instead of packing (Travel beats Speed)', () => {
  assert.deepEqual(norm(['boots', 'blink', 'travels']), [N, 'blink', 'travels', N, N, N]);
  assert.deepEqual(norm(['boots', 'boots']), ['boots', N, N, N, N, N]);
});

test('move to empty slot leaves a hole; drop on a filled slot swaps; same slot / empty source do nothing', () => {
  const a = ['blink', 'bkb', N, N, N, N];
  assert.deepEqual(L.moveSlot(a, 0, 4), [N, 'bkb', N, N, 'blink', N]);
  assert.deepEqual(L.moveSlot(a, 0, 1), ['bkb', 'blink', N, N, N, N]);
  assert.equal(L.moveSlot(a, 0, 0), null);
  assert.equal(L.moveSlot(a, 3, 1), null, 'empty source');
  assert.equal(L.moveSlot(a, 0, 6), null);
  assert.deepEqual(a, ['blink', 'bkb', N, N, N, N], 'input untouched');
});

test('click adds to the FIRST hole (not the end); drop on a slot replaces it; full list refuses; boots replace boots', () => {
  assert.deepEqual(L.placeItem([N, 'blink', N, N, N, N], 'bkb'), ['bkb', 'blink', N, N, N, N]);
  assert.deepEqual(L.placeItem(['blink', N, 'bkb', N, N, N], 'atos'), ['blink', 'atos', 'bkb', N, N, N]);
  assert.deepEqual(L.placeItem(['blink', N, N, N, N, N], 'atos', 4), ['blink', N, N, N, 'atos', N]);
  assert.deepEqual(L.placeItem(['blink', 'bkb', N, N, N, N], 'atos', 1), ['blink', 'atos', N, N, N, N]);
  assert.equal(L.placeItem(['a1', 'a2', 'a3', 'a4', 'a5', 'a6'], 'atos'), null);
  assert.equal(L.placeItem(['blink', N, N, N, N, N], 'blink'), null, 'no duplicates');
  assert.deepEqual(L.placeItem(['blink', 'boots', N, N, N, N], 'travels'), ['blink', 'travels', N, N, N, N]);
  assert.deepEqual(L.placeItem(['boots', 'blink', 'bkb', 'atos', 'vyse', 'shiva'], 'travels'), ['travels', 'blink', 'bkb', 'atos', 'vyse', 'shiva']);
});

test('remove leaves a hole (never packs); empty slot removal is a no-op', () => {
  assert.deepEqual(L.clearSlot(['blink', 'bkb', 'atos', N, N, N], 1), ['blink', N, 'atos', N, N, N]);
  assert.equal(L.clearSlot(['blink', N, N, N, N, N], 3), null);
  assert.equal(L.clearSlot(['blink', N, N, N, N, N], 9), null);
});

test('hero keeps holes: slot n holds item n, hotkey n casts the item in slot n; HUD swap onto an empty slot moves it (cooldown travels)', () => {
  const r = rig({ items: [N, 'dust', N, 'shiva'] });
  assert.deepEqual(r.h.items.map(x => x && x.id), [N, 'dust', N, 'shiva', N, N]);
  r.at(10);
  r.key('x'); r.at(r.T.ms + 300);   // slot 2 key (default z/x/...) -> dust sits in slot 2
  assert.equal(r.casts[0], 'dust');
  const cd = r.h.items[1].cd;
  assert.ok(r.IT.Items.swap(r.w, r.h, 1, 4), 'swap with an empty slot is a move');
  assert.deepEqual(r.h.items.map(x => x && x.id), [N, N, N, 'shiva', 'dust', N]);
  assert.equal(r.h.items[4].cd, cd, 'cooldown travels with the item');
  assert.equal(r.h.items[1], N);
  assert.ok(r.IT.Items.swap(r.w, r.h, 3, 4), 'swap two filled'); assert.equal(r.h.items[3].id, 'dust');
  assert.equal(r.IT.Items.swap(r.w, r.h, 0, 6), false);
});
