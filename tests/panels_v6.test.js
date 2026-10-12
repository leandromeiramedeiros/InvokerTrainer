'use strict';
// v6 CEO item 10: floating panels (js/ui/panels.js): clamp / min-max math, toggle state, persistence (incl. a throwing localStorage),
// drag / resize / reset / close through a fake DOM, and the I / O toggles working during the countdown and while paused.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { rig } = require('./input_rig.js');

function fakeEl(tag) {
  const L = {}, el = {
    tag, className: '', style: {}, children: [], parentNode: null, attrs: {}, textContent: '', clientWidth: 1920, clientHeight: 1080, L,
    appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
    removeChild(c) { el.children = el.children.filter(x => x !== c); c.parentNode = null; },
    setAttribute(k, v) { el.attrs[k] = v; }, getAttribute(k) { return el.attrs[k]; },
    addEventListener(t, f) { (L[t] = L[t] || []).push(f); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 }),
    closest(sel) { const c = sel.replace('.', ''); for (let e = el; e; e = e.parentNode) if ((' ' + e.className + ' ').includes(' ' + c + ' ')) return e; return null; },
    fire(t, ev) { const e = Object.assign({ button: 0, target: el, preventDefault() {}, stopPropagation() { e.stopped = true; } }, ev); for (const f of L[t] || []) f(e); return e; },
  };
  return el;
}

// storage: 'ok' (Map-backed), 'throw' (every call throws)
function env(storage) {
  const W = {}, store = new Map(), host = fakeEl('div');
  const ls = storage === 'throw'
    ? { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } }
    : { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const g = { console, Math, JSON, Object, Array, Number, isFinite, document: { createElement: fakeEl, getElementById: () => host },
    addEventListener(t, f) { (W[t] = W[t] || []).push(f); }, removeEventListener(t, f) { if (W[t]) W[t] = W[t].filter(x => x !== f); } };
  if (storage === 'throw') Object.defineProperty(g, 'localStorage', { get() { throw new Error('SecurityError'); } });
  else g.localStorage = ls;
  const ctx = vm.createContext(g);
  vm.runInContext('globalThis.IT = { t: k => k, GAME: { VIEW_W_BASE: 480, VIEW_H_BASE: 270 } };', ctx);
  vm.runInContext(read('js/ui/panels.js'), ctx, { filename: 'js/ui/panels.js' });
  const IT = ctx.IT;
  return { IT, P: IT.UI.Panel, W, store, host, fire: (t, ev) => { const e = Object.assign({ stopPropagation() {} }, ev); for (const f of (W[t] || []).slice()) f(e); } };
}
const H = { w: 480, h: 270 }, MIN = { w: 80, h: 60 }, MAX = { w: 300, h: 250 };
const mk = (e, o) => e.P.create(Object.assign({ id: 'cheat', title: 'T', content: fakeEl('div'), host: e.host, min: MIN, max: MAX, default: { x: 160, y: 30, w: 160, h: 200 } }, o));

test('clamp math: rect stays inside the host, size inside min / max / host', () => {
  const { P } = env();
  assert.deepEqual(P.clampRect({ x: -50, y: -9, w: 160, h: 200 }, MIN, MAX, H), { x: 0, y: 0, w: 160, h: 200 });
  assert.deepEqual(P.clampRect({ x: 999, y: 999, w: 160, h: 200 }, MIN, MAX, H), { x: 320, y: 70, w: 160, h: 200 });
  assert.deepEqual(P.clampRect({ x: 10, y: 10, w: 9999, h: 1 }, MIN, MAX, H), { x: 10, y: 10, w: 300, h: 60 }, 'size to max / min');
  assert.deepEqual(P.clampRect({ x: 400, y: 10, w: 300, h: 100 }, MIN, MAX, { w: 200, h: 270 }), { x: 0, y: 10, w: 200, h: 100 }, 'smaller host shrinks and re-seats');
  assert.deepEqual(P.clampRect({ x: NaN, y: 'a', w: undefined, h: null }, MIN, MAX, H), { x: 0, y: 0, w: 80, h: 60 }, 'garbage -> finite');
  assert.deepEqual(P.clampSize({ w: 10, h: 10 }, MIN, MAX, { w: 50, h: 40 }), { w: 80, h: 60 }, 'host smaller than min never goes under min');
  assert.deepEqual(P.moveRect({ x: 100, y: 100, w: 160, h: 200 }, 1000, -1000, MIN, MAX, H), { x: 320, y: 0, w: 160, h: 200 });
});

test('resize: top-left fixed, size stops at min / max / host edge', () => {
  const { P } = env(), s = { x: 100, y: 20, w: 160, h: 100 };
  assert.deepEqual(P.resizeRect(s, 20, 30, MIN, MAX, H), { x: 100, y: 20, w: 180, h: 130 });
  assert.deepEqual(P.resizeRect(s, -500, -500, MIN, MAX, H), { x: 100, y: 20, w: 80, h: 60 }, 'min');
  assert.deepEqual(P.resizeRect(s, 500, 500, MIN, MAX, H), { x: 100, y: 20, w: 300, h: 250 }, 'max');
  assert.deepEqual(P.resizeRect({ x: 400, y: 20, w: 60, h: 100 }, 500, 0, { w: 30, h: 30 }, MAX, H), { x: 400, y: 20, w: 80, h: 100 }, 'host edge (80 room)');
});

test('toggle state + persistence round-trip (mock localStorage)', () => {
  const e = env();
  let m = e.P.model({ id: 'live', min: MIN, max: MAX, default: { x: 300, y: 30, w: 170, h: 190 } });
  assert.equal(m.open, false); assert.deepEqual(m.rect, { x: 300, y: 30, w: 170, h: 190 });
  assert.equal(m.toggle(), true); assert.equal(m.toggle(), false); assert.equal(m.toggle(), true);
  m.setRect({ x: 12, y: 34, w: 100, h: 90 }); m.save();
  assert.equal(JSON.parse(e.store.get('it2.panel.live')).open, true);
  m = e.P.model({ id: 'live', min: MIN, max: MAX, default: { x: 300, y: 30, w: 170, h: 190 } });
  assert.equal(m.open, true); assert.deepEqual(m.rect, { x: 12, y: 34, w: 100, h: 90 });
  e.store.set('it2.panel.live', '{not json'); m = e.P.model({ id: 'live', min: MIN, max: MAX, default: { x: 5, y: 5, w: 90, h: 70 } });
  assert.equal(m.open, false); assert.deepEqual(m.rect, { x: 5, y: 5, w: 90, h: 70 }, 'corrupt -> default');
  e.store.set('it2.panel.live', JSON.stringify({ open: true, x: 9000, y: -4, w: 5, h: 5000 })); m = e.P.model({ id: 'live', min: MIN, max: MAX });
  assert.deepEqual(m.rect, { x: 400, y: 0, w: 80, h: 250 }, 'stored rect re-clamped on load');
});

test('throwing localStorage: load falls back to defaults, save never throws, panel still works', () => {
  const e = env('throw');
  const P = mk(e);
  assert.equal(P.isOpen(), false);
  assert.doesNotThrow(() => { P.toggle(); P.setRect({ x: 1, y: 2, w: 100, h: 100 }); P.reset(); P.setOpen(false); });
  assert.equal(P.isOpen(), false);
  P.toggle(); assert.equal(P.isOpen(), true, 'state lives in memory');
});

test('DOM: open / close, onChange, front, close button, destroy', () => {
  const e = env(), log = [];
  const P = mk(e, { onChange: on => log.push(on) });
  assert.equal(P.el.style.display, 'none'); assert.equal(e.host.children.length, 1);
  P.toggle(); assert.equal(P.el.style.display, ''); assert.deepEqual(log, [true]);
  P.setOpen(true); assert.deepEqual(log, [true], 'no change, no event');
  const close = P.el.children[0].children.find(c => /pcl/.test(c.className));
  close.fire('click'); assert.equal(P.isOpen(), false); assert.deepEqual(log, [true, false]);
  P.destroy(); assert.equal(e.host.children.length, 0);
  // the open state survives a rebuild (next scenario)
  const P2 = mk(e); P2.setOpen(true); P2.destroy(); assert.equal(mk(e).isOpen(), true);
});

test('DOM: drag by the title bar, resize by the grip, reset button, viewport resize re-clamps', () => {
  const e = env(), P = mk(e); P.setOpen(true);
  const bar = P.el.children[0], grip = P.el.children[2], rst = bar.children.find(c => /prs/.test(c.className)), u = 1920 / 480;
  const ev = (x, y) => ({ clientX: x, clientY: y, isTrusted: true });
  const down = bar.fire('mousedown', ev(100, 100)); assert.ok(down.stopped, 'mousedown never reaches the canvas');
  const mv = e.fire('mousemove', ev(100 + 40 * u, 100 + 20 * u)); void mv;
  assert.deepEqual(P.getRect(), { x: 200, y: 50, w: 160, h: 200 });
  e.fire('mousemove', ev(100 + 9999, 100 + 9999));
  assert.deepEqual(P.getRect(), { x: 320, y: 70, w: 160, h: 200 }, 'clamped to the viewport');
  e.fire('mouseup', ev(0, 0)); assert.ok(JSON.parse(e.store.get('it2.panel.cheat')).x === 320, 'saved on release');
  e.fire('mousemove', ev(0, 0)); assert.equal(P.getRect().x, 320, 'no drag after release');
  P.setRect({ x: 50, y: 20, w: 160, h: 200 });
  grip.fire('mousedown', ev(500, 500)); e.fire('mousemove', ev(500 + 1000 * u, 500 + 1000 * u)); e.fire('mouseup', ev(0, 0));
  assert.deepEqual(P.getRect(), { x: 50, y: 20, w: 300, h: 250 }, 'max');
  grip.fire('mousedown', ev(500, 500)); e.fire('mousemove', ev(-9999, -9999)); e.fire('mouseup', ev(0, 0));
  assert.deepEqual(P.getRect(), { x: 50, y: 20, w: 80, h: 60 }, 'min');
  P.el.children[0].children.length; rst.fire('click'); assert.deepEqual(P.getRect(), { x: 160, y: 30, w: 160, h: 200 }, 'reset to default');
  // title-bar buttons do not start a drag
  const b = bar.children[1].fire('mousedown', ev(5, 5)); e.fire('mousemove', ev(900, 900)); assert.deepEqual(P.getRect(), { x: 160, y: 30, w: 160, h: 200 }); void b;
  // viewport shrinks (host aspect changes): panel is pulled back inside
  P.setRect({ x: 320, y: 70, w: 160, h: 200 });
  e.host.clientHeight = 540;   // 480 x 135 base units
  e.fire('resize');
  const r = P.getRect(); assert.ok(r.y + r.h <= 135 && r.h <= 135 && r.x + r.w <= 480, JSON.stringify(r));
});

test('DOM: pointer lock drags from IT.Input\'s virtual cursor and lets the move reach it', () => {
  const e = env(), P = mk(e); P.setOpen(true);
  e.IT.Input = { locked: true, vx: 100, vy: 100, mouse: { in: true } };
  const bar = P.el.children[0], u = 4;
  bar.fire('mousedown', { clientX: 100, clientY: 100, isTrusted: false });
  assert.equal(e.IT.Input.mouse.in, false);
  e.IT.Input.vx = 100 + 10 * u; e.IT.Input.vy = 100 + 5 * u;
  const seen = { stopped: false }; e.fire('mousemove', { clientX: 1, clientY: 1, isTrusted: true, stopPropagation() { seen.stopped = true; } });
  assert.deepEqual(P.getRect(), { x: 170, y: 35, w: 160, h: 200 });
  assert.equal(seen.stopped, false, 'locked: the move stays visible to IT.Input');
  e.fire('mouseup', { isTrusted: false });
});

test('fit option scales the body with the width', () => {
  const e = env(), P = mk(e, { fit: true }); P.setOpen(true);
  assert.equal(P.body.style.fontSize, '100%');
  P.setRect({ x: 0, y: 0, w: 240, h: 100 }); assert.equal(P.body.style.fontSize, '150%');
});

test('input: I and O are toggles that work during the countdown and while paused', () => {
  const r = rig({ autoAttack: false }); r.at(10);
  const calls = []; r.In.hooks.cheat = () => calls.push('cheat'); r.In.hooks.stats = () => calls.push('stats');
  r.key('i'); r.key('o'); assert.deepEqual(calls, ['cheat', 'stats'], 'running: a press toggles, release does nothing');
  calls.length = 0;
  r.w.paused = true; r.In.hooks.inspect = () => true;   // frozen ranked countdown
  r.key('i'); r.key('o'); assert.deepEqual(calls, ['cheat', 'stats'], 'countdown');
  calls.length = 0; r.In.hooks.inspect = null;           // plain pause
  r.key('i'); r.key('o'); assert.deepEqual(calls, ['cheat', 'stats'], 'paused');
  calls.length = 0;
  const ev = r.down('o', { repeat: true }); r.up(ev); assert.deepEqual(calls, [], 'auto-repeat ignored');
  assert.equal(r.In._held.has('stats'), false, 'no held state');
});

test('i18n: stats is no longer "hold" (EN/PT), panel.* keys exist in both languages', () => {
  const IT = (() => { const c = vm.createContext({ console, Math, JSON, Object, Array }); for (const f of ['js/data/i18n.js', 'js/data/i18n/n4.js', 'js/data/i18n/h1.js', 'js/data/i18n/v6.js']) vm.runInContext(read(f), c, { filename: f }); return c.IT; })();
  for (const lang of ['en', 'pt']) {
    IT.lang = lang;
    for (const k of ['act.stats', 'set.k.stats', 'set.fx.stats', 'panel.reset', 'panel.close']) {
      const s = IT.t(k); assert.ok(s && s !== k, lang + ' ' + k);
      assert.ok(!/hold|segurar/i.test(s), lang + ' ' + k + ': ' + s);
    }
  }
  IT.lang = 'en'; assert.match(IT.t('set.fx.stats'), /toggle/);
  IT.lang = 'pt'; assert.match(IT.t('set.fx.stats'), /alternar/);
});
