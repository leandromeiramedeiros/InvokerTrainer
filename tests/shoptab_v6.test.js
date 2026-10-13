'use strict';
// v6 #72: title SHOP side tab: IT.Shop.canAffordNew(), balance / "!" badge model, reduced-motion class, CSS + i18n parity.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const FILES = ['js/data/game.js', 'js/data/difficulty.js', 'js/data/relics.js', 'js/data/i18n.js', 'js/data/i18n/shop.js', 'js/data/shop.js'];

function memStore() { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; }
function boot(extra) {
  const ctx = vm.createContext(Object.assign({ console, Math, JSON, Date, Map, Set, Array, Object, Number, String, Boolean, Error, isFinite, isNaN, parseInt, parseFloat, localStorage: memStore() }, extra || {}));
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { IT: ctx.IT, ctx };
}
const cheapest = S => Math.min(...S.CATALOG.filter(c => c.price > 0).map(c => c.price));

test('canAffordNew: false at 0 points, true once a priced unowned item is affordable', () => {
  const { IT } = boot(); const S = IT.Shop;
  assert.strictEqual(S.canAffordNew(), false);
  S.grant(cheapest(S) - 1); assert.strictEqual(S.canAffordNew(), false);
  S.grant(1); assert.strictEqual(S.canAffordNew(), true);
});

test('canAffordNew: owned items do not count; free items never count', () => {
  const { IT } = boot(); const S = IT.Shop;
  const cheap = S.CATALOG.filter(c => c.price === cheapest(S));
  S.grant(cheapest(S));
  for (const c of cheap) assert.ok(S.buy(c.kind, c.skin).ok, c.skin);   // spends it all
  assert.strictEqual(S.canAffordNew(), false);
  S.grant(cheapest(S) * 3); // enough for another unowned item again if any cheaper-or-equal remains
  const left = S.CATALOG.some(c => c.price > 0 && c.price <= S.balance() && !S.owned(c.skin, c.kind));
  assert.strictEqual(S.canAffordNew(), left);
});

test('canAffordNew: everything owned -> false even with a huge balance', () => {
  const { IT } = boot(); const S = IT.Shop;
  S.grant(S.total() + 1000);
  for (const c of S.CATALOG) if (c.price > 0) assert.ok(S.buy(c.kind, c.skin).ok);
  S.grant(99999);
  assert.strictEqual(S.canAffordNew(), false);
});

test('canAffordNew: a price above the balance is not affordable (exact edge)', () => {
  const { IT } = boot(); const S = IT.Shop;
  const big = S.CATALOG.filter(c => c.price > 0);
  const only = Math.min(...big.map(c => c.price));
  S.grant(only - 1); assert.strictEqual(S.canAffordNew(), false);
  S.grant(1); assert.strictEqual(S.canAffordNew(), true);
});

// ---- menus.js: tab model + element (minimal fake DOM)
class Node {}
function fakeEl(tag) {
  const el = { tag, children: [], attrs: {}, cls: new Set(), style: {}, textContent: '', hidden: false, isConnected: false, width: 0, height: 0,
    set className(v) { this.cls = new Set(String(v).split(/\s+/).filter(Boolean)); }, get className() { return [...this.cls].join(' '); },
    classList: { contains: c => el.cls.has(c), toggle: (c, on) => { on ? el.cls.add(c) : el.cls.delete(c); } },
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {}, getContext() { return { fillRect() {}, set fillStyle(v) {} }; },
    appendChild(c) { this.children.push(c); return c; } };
  return Object.setPrototypeOf(el, Node.prototype);
}
function bootMenus(opts) {
  opts = opts || {};
  const doc = { createElement: fakeEl, createTextNode: t => ({ textContent: t }), addEventListener() {}, hidden: false };
  const { IT, ctx } = boot({ Node, document: doc, addEventListener() {}, matchMedia: () => ({ matches: !!opts.reduced }), setInterval: null });
  ctx.window = undefined;
  vm.runInContext(rd('js/ui/menus.js'), ctx, { filename: 'js/ui/menus.js' });
  return IT;
}

test('shopTabInfo: balance text, "!" flag, reduced-motion flag', () => {
  const IT = bootMenus();
  let i = IT.UI.shopTabInfo(); assert.strictEqual(i.text, '0'); assert.strictEqual(i.bang, false); assert.strictEqual(i.calm, false);
  IT.Shop.grant(cheapest(IT.Shop) + 7);
  i = IT.UI.shopTabInfo(); assert.strictEqual(i.text, String(cheapest(IT.Shop) + 7)); assert.strictEqual(i.bang, true);
  assert.strictEqual(bootMenus({ reduced: true }).UI.shopTabInfo().calm, true);
});

test('shopTab element: badge text + "!" visibility, .calm under reduced motion, no sparkle loop when calm', () => {
  const IT = bootMenus({ reduced: true }); IT.Shop.grant(cheapest(IT.Shop));
  const tab = IT.UI.shopTab(), find = c => (function f(e) { if (e.cls && e.cls.has(c)) return e; for (const k of e.children || []) { const r = f(k); if (r) return r; } return null; })(tab);
  assert.ok(tab.cls.has('shoptab') && tab.cls.has('calm') && tab.cls.has('hot'));
  assert.strictEqual(find('st-bal').textContent, String(cheapest(IT.Shop)));
  assert.strictEqual(find('st-bang').hidden, false);
  const IT2 = bootMenus(); const t2 = IT2.UI.shopTab();
  assert.ok(!t2.cls.has('calm') && !t2.cls.has('hot'));
  assert.strictEqual(t2.children.find(c => c.cls && c.cls.has('st-bang')).hidden, true);
});

test('CSS: calm + prefers-reduced-motion kill shimmer/pulse/sparkle but not the badges', () => {
  const css = rd('css/menus.css');
  assert.match(css, /\.shoptab\.calm,\.shoptab\.calm \.st-bang\{animation:none\}/);
  assert.match(css, /\.shoptab\.calm \.st-shine,\.shoptab\.calm \.st-spark\{display:none\}/);
  const mq = css.match(/@media \(prefers-reduced-motion:reduce\)\{\.shoptab[^\n]*/)[0];
  assert.match(mq, /animation:none/); assert.match(mq, /\.st-shine/);
  assert.ok(!/\.st-bal[^}]*display:none/.test(mq) && !/st-bang\{display:none/.test(mq), 'badges stay');
  assert.match(css, /\.shoptab\{[^}]*animation:stPulse/);
});

test('i18n: shop.tab.new in EN and PT', () => {
  const pack = {}; vm.runInContext(rd('js/data/i18n/shop.js'), vm.createContext({ IT: { i18nAdd: p => Object.assign(pack, p) } }));
  assert.ok(pack.en['shop.tab.new'] && pack.pt['shop.tab.new']);
  assert.deepStrictEqual(Object.keys(pack.en).sort(), Object.keys(pack.pt).sort());
});
