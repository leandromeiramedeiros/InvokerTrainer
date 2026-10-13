'use strict';
// v6 item 69: shop purchase FX. The pure timing + state machine (IT.ShopFx), premium detection, insufficient path, reduced motion, shop SFX voices, i18n parity.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function bootFx() {
  const IT = { UI: {} };
  const ctx = vm.createContext({ console, Math, JSON, Date, Map, Set, Array, Object, Number, String, Boolean, Error, isFinite, isNaN, IT });
  vm.runInContext(read('js/ui/shop.js'), ctx, { filename: 'js/ui/shop.js' });
  return ctx.IT;
}
const X = bootFx().ShopFx;

test('premium detection: Vitinian and Exalted (and anything >= 250), not the cheap skins', () => {
  assert.ok(X.isPremium('enemy', 'vitinian', 250));
  assert.ok(X.isPremium('player', 'exalted', 300));
  assert.ok(X.isPremium('player', 'whatever', 250));
  for (const [k, s, p] of [['player', 'kid', 80], ['player', 'dark', 200], ['enemy', 'renan', 100], ['dummy', 'raven', 100], ['enemy', 'nando', 120]]) assert.ok(!X.isPremium(k, s, p), s);
});

test('phases are sequential: press -> tick -> fly -> flip -> owned -> done; premium lasts longer', () => {
  const seq = [];
  for (let t = 0; t < 8; t += 0.01) { const p = X.phaseAt(t, false); if (seq[seq.length - 1] !== p) seq.push(p); }
  assert.deepStrictEqual(seq, ['press', 'tick', 'fly', 'flip', 'owned', 'done']);
  assert.ok(X.endAt(true) > X.endAt(false));
  assert.strictEqual(X.phaseAt(X.endAt(false) - 0.01, false), 'owned');
  assert.strictEqual(X.phaseAt(X.endAt(false) - 0.01, true), 'owned');
  assert.strictEqual(X.phaseAt(X.endAt(false) + 0.01, false), 'done');
  assert.strictEqual(X.phaseAt(X.endAt(false) + 0.01, true), 'owned', 'premium rain runs ~0.7 s longer');
});

test('counter tick: holds, falls monotonically to the final balance, never below it', () => {
  assert.strictEqual(X.tickValue(1000, 750, 0), 1000);
  assert.strictEqual(X.tickValue(1000, 750, X.FX.press), 1000);
  assert.strictEqual(X.tickValue(1000, 750, X.FX.tickEnd), 750);
  assert.strictEqual(X.tickValue(1000, 750, 5), 750);
  let prev = 1e9;
  for (let t = 0; t <= 0.6; t += 0.01) { const v = X.tickValue(1000, 750, t); assert.ok(v <= prev && v >= 750); prev = v; }
});

test('state machine: events fire once, in order, even when one frame skips several phases', () => {
  const p = X.createPurchase({ kind: 'player', skin: 'kid', price: 80, from: 500, to: 420 });
  assert.strictEqual(p.phase, null);
  assert.deepStrictEqual(Array.from(p.advance(0)), ['press']);
  assert.strictEqual(p.balance, 500);
  assert.deepStrictEqual(Array.from(p.advance(0.2)), ['tick']);
  assert.ok(p.balance < 500 && p.balance > 420, 'mid-tick');
  assert.deepStrictEqual(Array.from(p.advance(0.2)), []);
  assert.deepStrictEqual(Array.from(p.advance(0.6)), ['fly']);
  assert.strictEqual(p.balance, 420, 'ticked down before the particles land');
  assert.deepStrictEqual(Array.from(p.advance(5)), ['flip', 'owned', 'done']);
  assert.ok(p.done);
  assert.deepStrictEqual(Array.from(p.advance(6)), []);
  assert.deepStrictEqual(Array.from(p.log), ['press', 'tick', 'fly', 'flip', 'owned', 'done']);
  assert.strictEqual(p.premium, false);
});

test('time never runs backwards (a late rAF timestamp cannot undo a phase)', () => {
  const p = X.createPurchase({ kind: 'dummy', skin: 'raven', price: 100, from: 300, to: 200 });
  p.advance(1.3); const ph = p.phase;
  p.advance(0.1);
  assert.strictEqual(p.phase, ph);
});

test('premium purchases are flagged and lengthen the show', () => {
  const p = X.createPurchase({ kind: 'enemy', skin: 'vitinian', price: 250, from: 900, to: 650 });
  assert.ok(p.premium);
  p.advance(X.endAt(false) + 0.01);
  assert.strictEqual(p.phase, 'owned');
  assert.ok(!p.done);
  p.advance(X.endAt(true) + 0.01);
  assert.ok(p.done);
});

test('reduced motion: first advance jumps to the final state (all events, final balance), nothing animated', () => {
  const p = X.createPurchase({ kind: 'player', skin: 'exalted', price: 300, from: 1000, to: 700, reduced: true });
  assert.deepStrictEqual(Array.from(p.advance(0)), ['press', 'tick', 'fly', 'flip', 'owned', 'done']);
  assert.strictEqual(p.balance, 700);
  assert.ok(p.done && p.premium && p.reduced);
});

test('insufficient points: canAfford gates the purchase (exact balance is fine)', () => {
  assert.ok(!X.canAfford(79, 80));
  assert.ok(X.canAfford(80, 80));
  assert.ok(X.canAfford(0, 0));
});

test('gem particles: staggered inside the tick window, flight ends exactly on the card, arc stays finite', () => {
  const n = 9, starts = Array.from({ length: n }, (_, i) => X.gemStart(i, n));
  assert.ok(starts[0] >= X.FX.press - 1e-9 && starts[n - 1] < X.FX.tickEnd);
  for (let i = 1; i < n; i++) assert.ok(starts[i] > starts[i - 1]);
  assert.ok(starts[n - 1] + X.FX.flyDur <= X.FX.flyEnd + 1e-9, 'last gem lands before the flip');
  const a = { x: 10, y: 200 }, b = { x: 140, y: 80 };
  const p0 = X.flyPos(a, b, 0, 20), p1 = X.flyPos(a, b, 1, 20);
  assert.ok(Math.abs(p0.x - a.x) < 1e-9 && Math.abs(p0.y - a.y) < 1e-9);
  assert.ok(Math.abs(p1.x - b.x) < 1e-9 && Math.abs(p1.y - b.y) < 1e-9);
  const pm = X.flyPos(a, b, 0.5, 20);
  assert.ok(isFinite(pm.x) && isFinite(pm.y) && pm.y < Math.max(a.y, b.y));
  assert.strictEqual(X.gemStart(0, 1), X.FX.press);
});

test('shop sfx: coin / unlock / premium / poor each play their own voice (sound off = silent)', () => {
  const played = [], defs = {};
  const SFX = { define: (n, f) => { defs[n] = f; }, T() {}, N() {}, has: n => n in defs, playEx: (n, o) => played.push([n, o]), volume: 0.5 };
  const IT = { SFX, Settings: { get: () => ({ sound: true }) } };
  const ctx = vm.createContext({ console, Math, JSON, Date, Map, Set, Array, Object, Number, String, Boolean, Error, isFinite, isNaN, setInterval() { return 0; }, clearInterval() {}, performance: { now: () => 0 }, IT, SFX });
  ctx.G = ctx;
  vm.runInContext(read('js/sfx.js'), ctx, { filename: 'js/sfx.js' });
  for (const n of ['shopCoin', 'shopChime', 'shopFanfare', 'shopThud']) assert.ok(n in defs, n);
  const S = ctx.IT.Sfx;
  assert.ok(S.shop('coin') && S.shop('unlock') && S.shop('premium') && S.shop('poor'));
  assert.deepStrictEqual(played.map(p => p[0]), ['shopCoin', 'shopChime', 'shopFanfare', 'shopThud']);
  assert.strictEqual(S.shop('bogus'), false);
  ctx.IT.Settings.get = () => ({ sound: false });
  assert.strictEqual(S.shop('coin'), false);
});

test('i18n: the new shop keys exist in EN and PT with the same placeholders', () => {
  let pack = null;
  const ctx = vm.createContext({ console, IT: { i18nAdd: p => { pack = p; } } });
  vm.runInContext(read('js/data/i18n/shop.js'), ctx);
  assert.deepStrictEqual(Object.keys(pack.pt).sort(), Object.keys(pack.en).sort());
  for (const k of ['shop.unlocked', 'shop.unlockedPremium', 'shop.nofunds']) { assert.ok(pack.en[k] && pack.pt[k], k); assert.notStrictEqual(pack.en[k], pack.pt[k], k); }
});
