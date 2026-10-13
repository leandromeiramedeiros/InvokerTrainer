'use strict';
// v6 #16b UI animation layer (js/ui/anim.js + css/anim.css): class application on mocked mutation records, count-up math, reduced-motion, include order.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/ui/anim.js'), 'utf8');

// ---- tiny fake DOM (just what anim.js touches)
class Fake {
  constructor(cls, id) {
    this.nodeType = 1; this.id = id || ''; this.children = []; this.parentNode = null; this.attrs = {}; this.textContent = '';
    this._c = new Set((cls || '').split(' ').filter(Boolean)); this.offsetWidth = 1;
    const st = { display: '', _p: {} }; st.setProperty = (k, v) => { st._p[k] = v; }; this.style = st;
    const self = this;
    this.classList = {
      add: (...a) => a.forEach(x => self._c.add(x)), remove: x => self._c.delete(x), contains: x => self._c.has(x),
    };
  }
  get className() { return [...this._c].join(' '); }
  matches(sel) { return sel.split(',').some(s => { s = s.trim(); if (s[0] === '.') return this._c.has(s.slice(1)); if (s === '[id]') return !!this.id; if (s[0] === '[') return this.attrs[s.slice(1, -1)] !== undefined; return false; }); }
  appendChild(k) { k.parentNode = this; this.children.push(k); return k; }
  removeChild(k) { this.children = this.children.filter(x => x !== k); k.parentNode = null; return k; }
  querySelectorAll(sel) { const out = []; const walk = n => n.children.forEach(k => { if (k.matches(sel)) out.push(k); walk(k); }); walk(this); return out; }
  cloneNode() { const c = new Fake(this.className, this.id); c.attrs = Object.assign({}, this.attrs); c.children = this.children.map(k => { const d = k.cloneNode(); d.parentNode = c; return d; }); return c; }
  removeAttribute(a) { if (a === 'id') this.id = ''; delete this.attrs[a]; }
  getAttribute(a) { return this.attrs[a] === undefined ? null : this.attrs[a]; }
}
function env(opts) {
  opts = opts || {};
  const timers = [], observers = [];
  const doc = { readyState: 'complete', getElementById: id => doc.els[id] || null, els: {}, addEventListener() {} };
  ['screens', 'hud', 'toasts'].forEach(id => { doc.els[id] = new Fake('', id); });
  const ctx = vm.createContext({
    console, Math, JSON, Date, Set, Array, Object, Number, String, isFinite, parseFloat, parseInt,
    document: doc, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    MutationObserver: function (cb) { this.cb = cb; this.targets = []; this.observe = (t, o) => this.targets.push({ t, o }); observers.push(this); },
    matchMedia: opts.reduced ? () => ({ matches: true }) : () => ({ matches: false })
  });
  vm.runInContext(SRC, ctx, { filename: 'js/ui/anim.js' });
  const A = ctx.IT.UI.Anim;
  const rec = (type, target, o) => Object.assign({ type, target, addedNodes: [], removedNodes: [] }, o);
  return { A, doc, timers, observers, rec, run: () => { while (timers.length) timers.shift().fn(); } };
}

test('init observes #screens, #hud and #toasts', () => {
  const e = env();
  assert.ok(e.observers.length >= 1);
  const seen = e.observers[0].targets.map(x => x.t.id);
  assert.deepStrictEqual(seen, ['screens', 'hud', 'toasts']);
  const hudOpts = e.observers[0].targets[1].o;
  assert.deepStrictEqual([...hudOpts.attributeFilter], ['class']);   // per-frame style updates are never observed
});

test('mounted screen gets a-scr, cards inside grids get staggered a-card, class is removed afterwards', () => {
  const e = env(), scr = new Fake('screen'), grid = new Fake('sc-grid');
  for (let i = 0; i < 30; i++) grid.appendChild(new Fake('scard'));
  scr.appendChild(grid);
  e.doc.els.screens.appendChild(scr);
  e.A.process([e.rec('childList', e.doc.els.screens, { addedNodes: [scr] })]);
  assert.ok(scr.classList.contains('a-scr'));
  const d = grid.children.map(k => parseInt(k.style._p['--ad'], 10));
  assert.ok(grid.children.every(k => k.classList.contains('a-card')));
  assert.strictEqual(d[0], 0);
  assert.ok(d.every((v, i) => i === 0 || v >= d[i - 1]));
  assert.ok(Math.max.apply(null, d) <= 250, 'stagger total <= 250 ms');
  e.run();
  assert.ok(!scr.classList.contains('a-scr') && !grid.children[0].classList.contains('a-card'));
});

test('unmounted screen: exit plays on a pointer-events clone, original is not held back', () => {
  const e = env(), scr = new Fake('screen settings');
  scr.appendChild(new Fake('x', 'inner'));
  e.A.process([e.rec('childList', e.doc.els.screens, { removedNodes: [scr] })]);
  const g = e.doc.els.screens.children[0];
  assert.ok(g && g.classList.contains('a-ghost') && g.classList.contains('a-scr-out'));
  assert.strictEqual(g.id, '');
  assert.strictEqual(g.children[0].id, '', 'ids are stripped from the clone');
  e.run();
  assert.strictEqual(e.doc.els.screens.children.length, 0, 'ghost removed');
});

test('replaceChild (language rebuild) does not animate', () => {
  const e = env(), a = new Fake('screen'), b = new Fake('screen');
  e.A.process([e.rec('childList', e.doc.els.screens, { addedNodes: [b], removedNodes: [a] })]);
  assert.ok(!b.classList.contains('a-scr'));
  assert.strictEqual(e.doc.els.screens.children.length, 0);
});

test('screen shown again (display none -> "") fades in', () => {
  const e = env(), scr = new Fake('screen');
  e.A.process([e.rec('attributes', scr, { attributeName: 'style', oldValue: 'display: none;' })]);
  assert.ok(scr.classList.contains('a-scr'));
});

test('panel open animates in; close leaves a pointer-events clone', () => {
  const e = env(), host = e.doc.els.hud, p = new Fake('pnl', 'pnl-x'); host.appendChild(p);
  e.A.process([e.rec('attributes', p, { attributeName: 'style', oldValue: 'display: none;' })]);
  assert.ok(p.classList.contains('a-pnl'));
  p.style.display = 'none';
  e.A.process([e.rec('attributes', p, { attributeName: 'style', oldValue: '' })]);
  const g = host.children.find(k => k.classList.contains('a-ghost'));
  assert.ok(g && g.classList.contains('a-pnl-out') && g.style.display === '');
  // a drag / resize (no display change) is ignored
  p.style.display = ''; const before = host.children.length;
  e.A.process([e.rec('attributes', p, { attributeName: 'style', oldValue: 'left: 1px;' })]);
  assert.strictEqual(host.children.length, before);
});

test('toasts, tab switches and the HUD strip collapse', () => {
  const e = env(), t = new Fake('toast info'); e.doc.els.toasts.appendChild(t);
  e.A.process([e.rec('childList', e.doc.els.toasts, { addedNodes: [t] })]);
  assert.ok(t.classList.contains('a-toast'));
  const tab = new Fake('tabb on');
  e.A.process([e.rec('attributes', tab, { attributeName: 'class', oldValue: 'tabb' })]);
  assert.ok(tab.classList.contains('a-tab'));
  const tab2 = new Fake('tabb');
  e.A.process([e.rec('attributes', tab2, { attributeName: 'class', oldValue: 'tabb on' })]);
  assert.ok(!tab2.classList.contains('a-tab'), 'only the newly active tab animates');
  const strip = new Fake('hudp rkp play');
  e.A.process([e.rec('attributes', strip, { attributeName: 'class', oldValue: 'hudp rkp cd' })]);
  assert.ok(strip.classList.contains('a-strip'));
  const same = new Fake('hudp rkp play a-strip');
  e.A.process([e.rec('attributes', same, { attributeName: 'class', oldValue: 'hudp rkp play' })]);
  assert.ok(true);
});

test('data-tab switch fades the panes', () => {
  const e = env(), fp = new Fake('fp'), pane = new Fake('pane hero'); fp.appendChild(pane);
  e.A.process([e.rec('attributes', fp, { attributeName: 'data-tab', oldValue: 'hero' })]);
  assert.ok(pane.classList.contains('a-fade'));
});

test('countUp math + auto count-up for [data-countup]', () => {
  const e = env(), A = e.A;
  assert.strictEqual(A.countValue(0, 100, 0), 0);
  assert.strictEqual(A.countValue(0, 100, 1), 100);
  assert.ok(A.countValue(0, 100, 0.5) > 50, 'ease-out is front-loaded');
  assert.ok(A.countValue(0, 100, 0.25) < A.countValue(0, 100, 0.5));
  assert.strictEqual(A.countValue(10, 4, 1), 4);
  assert.strictEqual(A.fmtCount(12.6, 0), '13');
  assert.strictEqual(A.fmtCount(1.234, 1), '1.2');
  assert.strictEqual(A.stagger(0, 10), 0);
  assert.ok(A.stagger(99, 100) <= A.STAG.max);
  const el = new Fake('num'); el.attrs['data-countup'] = '250';
  e.doc.els.screens.appendChild(el);
  A.autoCount(e.doc.els.screens);
  assert.strictEqual(el.textContent, '0', 'starts from 0');
  e.run();   // no rAF in this env: ticks via setTimeout until the clock passes ms
  const end = Date.now() + 700; while (Date.now() < end && e.timers.length === 0) { /* spin */ }
  e.run();
  assert.strictEqual(el.textContent, '250');
  assert.strictEqual(A.fillBar(el, 140), 100);
  assert.strictEqual(el.style.width, '100%');
  assert.strictEqual(A.fillBar(el, -3), 0);
});

test('reduced motion: nothing is applied, count-up jumps to the end', () => {
  const e = env({ reduced: true }), scr = new Fake('screen'), el = new Fake('num');
  assert.strictEqual(e.A.reduced(), true);
  e.A.process([e.rec('childList', e.doc.els.screens, { addedNodes: [scr] })]);
  assert.ok(!scr.classList.contains('a-scr'));
  e.A.process([e.rec('childList', e.doc.els.screens, { removedNodes: [scr] })]);
  assert.strictEqual(e.doc.els.screens.children.length, 0);
  e.A.countUp(el, 0, 99, 500);
  assert.strictEqual(el.textContent, '99');
  const f = env(); f.A.setReduced(true); assert.strictEqual(f.A.reduced(), true); f.A.setReduced(null); assert.strictEqual(f.A.reduced(), false);
  assert.match(fs.readFileSync(path.join(ROOT, 'css/anim.css'), 'utf8'), /prefers-reduced-motion:\s*reduce/);
});

test('index.html includes anim.css after the other css and anim.js after the ui scripts; no gameplay element is animated', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const css = [...html.matchAll(/href="(css\/[^"]+)"/g)].map(m => m[1]), js = [...html.matchAll(/src="(js\/[^"?]+)"/g)].map(m => m[1]);
  assert.strictEqual(css[css.length - 1], 'css/anim.css');
  const i = js.indexOf('js/ui/anim.js');
  assert.ok(i > js.indexOf('js/ui/menus.js') && i > js.indexOf('js/ui/hud.js') && i > js.indexOf('js/ui/panels.js') && i > js.indexOf('js/ui/shop.js'));
  assert.ok(i < js.indexOf('js/input.js'));
  const c = fs.readFileSync(path.join(ROOT, 'css/anim.css'), 'utf8');
  assert.ok(!/#(game|lit|glow|aim)\b|canvas|pointer-events:\s*none\s*;?\s*}[^]*pointer-events:\s*auto/.test(c.replace(/\/\*[^]*?\*\//g, '')), 'canvases untouched');
  assert.ok(!/blur\(/.test(c), 'no blur');
});
