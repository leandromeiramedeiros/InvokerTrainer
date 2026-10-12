'use strict';
// v6 item 15: relic POINTS economy + Skin SHOP: award rates (special 5x, difficulty, goalpost), persistence (throwing storage), buy / equip,
// ranked skin pool, EN/PT parity of the shop pack + catalogue, pricing (unlock-all within 20-30 min of normal play).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const FILES = ['js/data/game.js', 'js/data/difficulty.js', 'js/data/relics.js', 'js/data/i18n.js', 'js/data/i18n/shop.js', 'js/data/shop.js'];

function memStore() { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; }
const thrower = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
function boot(store, files) {
  const ctx = vm.createContext({ console, Math, JSON, Date, Map, Set, Array, Object, Number, String, Boolean, Error, isFinite, isNaN, parseInt, parseFloat, localStorage: store });
  for (const f of files || FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.IT;
}
const same = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);   // cross-realm safe deepEqual
const R = boot(memStore()).RELICS;
const stepOf = id => R.BY[id].step || R.BY[id].tiers[0];

test('points: a special relic pays 5x a plain relic per level step', () => {
  for (const id of ['multi_icewall', 'three_emp', 'three_deafening', 'multi_meteor']) assert.strictEqual(R.baseOf(id), 5, id);
  assert.strictEqual(R.baseOf('kills'), 1);
  const a = R.points('three_emp', stepOf('three_emp'), 2), b = R.points('kills', stepOf('kills'), 2);
  assert.ok(Math.abs(a / b - 5) < 1e-9, 'special = 5x per step: ' + a / b);
  assert.ok(Math.abs(b - R.POINTS_K) < 1e-9, 'one plain step at common = POINTS_K');
});

test('points: difficulty multiplier ian 0.5 .. bambam 1.5, monotonic', () => {
  assert.strictEqual(R.diffMul(0), 0.5); assert.strictEqual(R.diffMul(2), 1); assert.strictEqual(R.diffMul(4), 1.5);
  let prev = -1;
  for (let i = 0; i < 5; i++) { const p = R.points('kills', stepOf('kills'), i); assert.ok(p > prev, 'tier ' + i); prev = p; }
  assert.strictEqual(R.points('kills', 0, 2), 0);
  assert.strictEqual(R.points('nope', 5, 2), 0);
});

test('points: goalpost moves the level step (x(1.5 - 0.25 idx), clamped 0.5..1.5)', () => {
  assert.strictEqual(R.goalpost(0), 1.5); assert.strictEqual(R.goalpost(2), 1); assert.strictEqual(R.goalpost(4), 0.5);
  assert.strictEqual(R.goalpost(-3), 1.5); assert.strictEqual(R.goalpost(99), 0.5);
  const s = stepOf('kills');
  assert.ok(Math.abs(R.points('kills', s, 0) - R.POINTS_K * 0.5 / 1.5) < 1e-9, 'ian: the step is 1.5x longer');
  assert.ok(Math.abs(R.points('kills', s, 4) - R.POINTS_K * 1.5 / 0.5) < 1e-9, 'bambam: the step is 0.5x');
});

test('persistence: points + spent survive a reload; throwing localStorage degrades to memory', () => {
  const st = memStore();
  let IT = boot(st);
  assert.strictEqual(IT.Shop.balance(), 0);
  IT.Shop.grant(300);
  assert.strictEqual(IT.Shop.buy('player', 'kid').ok, true);
  assert.strictEqual(IT.Shop.balance(), 220);
  IT.Shop.equip('player', 'kid');
  IT = boot(st);                                         // "reload": fresh context, same storage
  assert.strictEqual(IT.Shop.earned(), 300); assert.strictEqual(IT.Shop.spent(), 80); assert.strictEqual(IT.Shop.balance(), 220);
  assert.strictEqual(IT.Shop.owned('kid', 'player'), true);
  assert.strictEqual(IT.Shop.equipped('player'), 'kid');
  // throwing storage: no exception, the session still works from memory
  const T = boot(thrower);
  assert.strictEqual(T.Shop.balance(), 0);
  T.Shop.grant(500);
  assert.strictEqual(T.Shop.balance(), 500);
  assert.strictEqual(T.Shop.buy('enemy', 'renan').ok, true);
  assert.strictEqual(T.Shop.owned('renan', 'enemy'), true);
  assert.strictEqual(T.Shop.balance(), 400);
  // corrupt blobs
  const bad = memStore(); bad.setItem('it2.shop', '{nope'); bad.setItem('it2.stats', 'xx');
  const B = boot(bad);
  assert.strictEqual(B.Shop.balance(), 0); assert.strictEqual(B.Shop.equipped('player'), 'default');
});

test('purchase / equip / insufficient funds', () => {
  const S = boot(memStore()).Shop;
  assert.strictEqual(S.stateOf('player', 'exalted'), 'poor');
  same(S.buy('player', 'exalted'), { ok: false, reason: 'poor' });
  assert.strictEqual(S.balance(), 0);
  assert.strictEqual(S.equip('player', 'exalted'), false, 'cannot equip unowned');
  S.grant(1000);
  assert.strictEqual(S.stateOf('player', 'exalted'), 'buy');
  const r = S.buy('player', 'exalted');
  assert.strictEqual(r.ok, true); assert.strictEqual(r.price, 300); assert.strictEqual(S.balance(), 700);
  assert.strictEqual(S.buy('player', 'exalted').reason, 'owned'); assert.strictEqual(S.balance(), 700);
  assert.strictEqual(S.stateOf('player', 'exalted'), 'owned');
  assert.strictEqual(S.equip('player', 'exalted'), true);
  assert.strictEqual(S.stateOf('player', 'exalted'), 'equipped'); assert.strictEqual(S.equipped('player'), 'exalted');
  assert.strictEqual(S.equip('player', 'default'), true); assert.strictEqual(S.equipped('player'), 'default');
  assert.strictEqual(S.buy('player', 'ghost').reason, 'unknown');
  assert.strictEqual(S.equip('enemy', 'renan'), false, 'enemy skins are not equipped, they join the ranked pool');
  assert.ok(S.owned('default', 'player') && S.owned('default', 'enemy') && S.owned('scarecrow', 'dummy'), 'free items are always owned');
  assert.strictEqual(S.buy('player', 'default').ok, false);
  const S2 = boot(memStore()).Shop; S2.grant(100);          // exact-balance purchase
  assert.strictEqual(S2.buy('dummy', 'raven').ok, true); assert.strictEqual(S2.balance(), 0);
  assert.strictEqual(S.find('enemy', 'ian'), null, 'no Ian yet (TODO for the CEO)');
});

test('ranked pool = owned enemy skins + default; Free Play gate IT.Shop.owned(skinId)', () => {
  const IT = boot(memStore());
  same(IT.Skins.pool('enemy'), ['default']);
  same(IT.Skins.pool('dummy'), ['scarecrow']);
  IT.Shop.grant(1000);
  IT.Shop.buy('enemy', 'nando'); IT.Shop.buy('enemy', 'pedro');
  same(IT.Skins.pool('enemy').slice().sort(), ['default', 'nando', 'pedro']);
  assert.strictEqual(IT.Shop.owned('renan'), false); assert.strictEqual(IT.Shop.owned('nando'), true);
  assert.ok(IT.Skins.pool('player').indexOf('exalted') < 0);
  const H = boot(memStore(), ['js/data/game.js']);          // without the shop module (headless sim tests) every skin is open
  assert.strictEqual(H.Skins.pool('enemy').length, H.GAME.SKINS.length);
  assert.strictEqual(H.GAME.SKINS.indexOf('ian'), -1);
});

test('catalogue: entries match the GAME skin lists, free defaults', () => {
  const IT = boot(memStore()), S = IT.Shop, G = IT.GAME;
  for (const c of S.CATALOG) {
    assert.ok(S.KINDS.indexOf(c.kind) >= 0); assert.ok(c.price >= 0);
    const list = { enemy: G.SKINS, player: G.PLAYER_SKINS, dummy: G.DUMMY_SKINS }[c.kind];
    assert.ok(list.indexOf(c.skin) >= 0, c.kind + ':' + c.skin + ' in GAME lists');
  }
  for (const k of S.KINDS) assert.strictEqual(S.price(k, IT.Skins.FREE[k]), 0, 'free default of ' + k);
  for (const s of G.SKINS) assert.ok(S.find('enemy', s), 'enemy ' + s);
  for (const s of G.PLAYER_SKINS) assert.ok(S.find('player', s), 'player ' + s);
  for (const s of G.DUMMY_SKINS) assert.ok(S.find('dummy', s), 'dummy ' + s);
  same(S.CATALOG.filter(c => c.kind === 'player').map(c => c.skin), ['default', 'kid', 'dark', 'exalted']);
});

test('i18n: EN/PT parity of the shop pack, every catalogue entry named + described in both', () => {
  let pack = null;
  const ctx = vm.createContext({ console, IT: { i18nAdd: p => { pack = p; } } });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/i18n/shop.js'), 'utf8'), ctx);
  assert.ok(pack && pack.en && pack.pt);
  const en = Object.keys(pack.en).sort(), pt = Object.keys(pack.pt).sort();
  same(pt, en, 'same keys in en and pt');
  const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join();
  for (const k of en) {
    assert.ok(String(pack.en[k]).length > 0, 'en ' + k); assert.ok(String(pack.pt[k]).length > 0, 'pt ' + k);
    assert.strictEqual(ph(pack.pt[k]), ph(pack.en[k]), 'placeholders ' + k);
  }
  const IT = boot(memStore());
  for (const c of IT.Shop.CATALOG) for (const pre of ['shop.n.', 'shop.d.']) assert.ok((pre + c.kind + '.' + c.skin) in pack.pt, pre + c.kind + '.' + c.skin);
  for (const k of ['shop.tab', 'shop.title', 'shop.balance', 'shop.cat.player', 'shop.cat.enemy', 'shop.cat.dummy', 'shop.buy', 'shop.owned', 'shop.equipped', 'shop.equip', 'shop.ranked', 'pts.plus']) assert.ok(k in pack.en, k);
  IT.lang = 'pt'; assert.notStrictEqual(IT.t('shop.title'), 'shop.title');
  IT.lang = 'en'; assert.strictEqual(IT.t('pts.plus', { n: 120 }), '+120 points');
});

test('pricing: the whole catalogue = 20-30 min of normal play (DECISIONS.md "Skin shop pricing")', () => {
  const S = boot(memStore()).Shop, P = S.PRICING;
  const min = S.minutesToUnlockAll();
  assert.ok(min >= P.MIN && min <= P.MAX, 'minutes to unlock all: ' + min);
  assert.strictEqual(S.total(), S.CATALOG.reduce((a, c) => a + c.price, 0));
  assert.ok(S.minutesToUnlockAll(P.REF_RUN * 1.5) > 15);      // a strong player is not trivialised
  assert.ok(S.minutesToUnlockAll(P.REF_RUN * 0.7) < 40);      // a casual one is not stuck
  const prices = S.CATALOG.map(c => c.price).filter(p => p > 0);
  assert.ok(Math.min(...prices) <= P.REF_RUN * 0.5); assert.ok(Math.max(...prices) >= P.REF_RUN);
  assert.match(fs.readFileSync(path.join(ROOT, 'DECISIONS.md'), 'utf8'), /Skin shop pricing/);
});
