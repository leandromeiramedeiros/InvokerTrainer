'use strict';
// v6 #31/#36: ONE pure item-drag state machine (IT.UI.ItemDrag) for the HUD slots and the loadout; in-game swap never pauses the sim; keys follow slots;
// Esc / blur / lost release / outside drop cancel; the catalogue is never a target (never reorderable); scenarios have no side pane.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const { rig } = require('./input_rig');
const ROOT = path.join(__dirname, '..');

function loadID() {
  const ctx = vm.createContext({ Math, Object });
  vm.runInContext('globalThis.window = globalThis;', ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/ui/itemdrag.js'), 'utf8'), ctx, { filename: 'itemdrag.js' });
  return ctx.IT.UI.ItemDrag;
}
const D = loadID();
const slot = i => ({ kind: 'slot', i }), cat = id => ({ kind: 'cat', id });

function mach(mode, items) {
  const log = [];
  const m = D.create({
    canDrag: src => src.kind === 'cat' || !!(items && items[src.i]),
    onStart: () => log.push('start'), onOver: t => log.push('over:' + (t ? t.kind + (t.i != null ? t.i : '') : 'none')),
    onClick: () => log.push('click'), onDrop: (s, t, a) => log.push('drop:' + a.type), onCancel: r => log.push('cancel:' + r),
  }, mode);
  return { m, log };
}

test('resolve: game mode only swaps slot->slot; loadout adds/removes/reorders; catalogue is never a target', () => {
  assert.deepEqual(D.resolve(slot(0), slot(3), 'game'), { type: 'swap', from: 0, to: 3 });
  assert.equal(D.resolve(slot(2), slot(2), 'game').type, 'none');
  assert.equal(D.resolve(slot(0), { kind: 'bin' }, 'game').type, 'none');
  assert.equal(D.resolve(cat('blink'), slot(0), 'game').type, 'none');
  assert.deepEqual(D.resolve(slot(1), slot(4), 'loadout'), { type: 'swap', from: 1, to: 4 });
  assert.deepEqual(D.resolve(slot(1), { kind: 'bin' }, 'loadout'), { type: 'remove', from: 1 });
  assert.deepEqual(D.resolve(cat('blink'), slot(2), 'loadout'), { type: 'add', id: 'blink', at: 2 });
  assert.equal(D.resolve(cat('blink'), { kind: 'bin' }, 'loadout').type, 'none');
  assert.equal(D.resolve(slot(1), null, 'loadout').type, 'none');   // dropped outside the page: nothing
  // catalogue is not reorderable: neither catalogue->catalogue nor slot->catalogue entry exist as targets
  assert.equal(D.resolve(cat('a'), cat('b'), 'loadout').type, 'none');
  assert.equal(D.resolve(slot(0), cat('b'), 'loadout').type, 'none');
});

test('machine: press -> click (below threshold), press -> drag -> drop, always back to idle', () => {
  const { m, log } = mach('game', [{}, {}]);
  m.down(slot(0), 10, 10); assert.equal(m.state, 'pressed');
  assert.equal(m.move(12, 11, slot(1)), false);   // below 5px: still a press
  assert.deepEqual(m.up(12, 11, slot(1)), { type: 'click' }); assert.equal(m.state, 'idle'); assert.deepEqual(log, ['click']);
  log.length = 0;
  m.down(slot(0), 10, 10); m.move(30, 10, slot(1)); assert.equal(m.dragging, true);
  const a = m.up(30, 10, slot(1)); assert.equal(a.type, 'swap'); assert.equal(m.state, 'idle');
  assert.deepEqual(log, ['start', 'over:slot1', 'drop:swap']);
});

test('machine: empty slot cannot be dragged (stays a click); idle ups are ignored', () => {
  const { m, log } = mach('game', [null, {}]);
  m.down(slot(0), 0, 0); assert.equal(m.move(50, 50, slot(1)), false); assert.equal(m.dragging, false);
  m.up(50, 50, slot(1)); assert.deepEqual(log, ['click']);
  assert.equal(m.up(1, 1, null), null); assert.equal(m.cancel('x'), false);
});

test('machine: cancel (Esc / blur / lost release) from dragging -> idle, nothing applied; outside drop applies nothing', () => {
  for (const why of ['esc', 'blur', 'lost', 'hidden']) {
    const { m, log } = mach('game', [{}, {}]);
    m.down(slot(0), 0, 0); m.move(20, 0, slot(1));
    assert.equal(m.cancel(why), true); assert.equal(m.state, 'idle'); assert.ok(log.includes('cancel:' + why));
    assert.equal(m.up(20, 0, slot(1)), null);   // a late release after the cancel does nothing
  }
  const { m, log } = mach('game', [{}, {}]);
  m.down(slot(0), 0, 0); m.move(20, 0, slot(1)); m.move(40, 40, null);
  const a = m.up(40, 40, null); assert.equal(a.type, 'none'); assert.equal(m.state, 'idle'); assert.ok(log.includes('drop:none'));
  // restart: a new press while one is open cancels the stale one (no stuck state)
  m.down(slot(0), 0, 0); m.move(20, 0, slot(1)); m.down(slot(1), 5, 5); assert.equal(m.state, 'pressed'); assert.equal(m.src.i, 1);
});

// ---- binder with a fake window: listeners exist only during the drag; every end path removes them
function fakeEnv(opts) {
  const L = {}, DL = {};
  const mk = o => ({ addEventListener(t, f) { (o[t] = o[t] || []).push(f); }, removeEventListener(t, f) { o[t] = (o[t] || []).filter(x => x !== f); } });
  const win = Object.assign(mk(L), { innerWidth: 800, innerHeight: 600 }), doc = Object.assign(mk(DL), { hidden: false });
  let ended = 0;
  const env = { win, doc, hit: x => (x < 100 ? slot(0) : x < 200 ? slot(1) : null), locked: () => !!(opts && opts.locked), end: () => { ended++; } };
  const count = () => Object.values(L).reduce((n, a) => n + a.length, 0) + Object.values(DL).reduce((n, a) => n + a.length, 0);
  const fire = (t, ev) => {
    const e = Object.assign({ isTrusted: true, prevented: false, stopped: false, preventDefault() { e.prevented = true; }, stopImmediatePropagation() { e.stopped = true; } }, ev);
    for (const f of (L[t] || []).slice()) f(e);
    return e;
  };
  return { env, count, fire, L, DL, ended: () => ended, doc };
}
function start(mode, items, opts) {
  const f = fakeEnv(opts), r = mach(mode, items);
  const begin = D.bind(r.m, f.env);
  return Object.assign(f, r, { begin });
}
const down = (s, i, x, y) => s.begin(slot(i), { button: 0, clientX: x, clientY: y, shiftKey: false });

test('binder: no listeners before press, listeners removed after drop / click', () => {
  const s = start('game', [{}, {}]);
  assert.equal(s.count(), 0);
  down(s, 0, 10, 10); assert.ok(s.count() > 0);
  s.fire('mousemove', { clientX: 150, clientY: 10, buttons: 1 }); assert.equal(s.m.dragging, true);
  s.fire('mouseup', { button: 0, clientX: 150, clientY: 10 });
  assert.equal(s.count(), 0); assert.equal(s.m.state, 'idle'); assert.ok(s.log.includes('drop:swap')); assert.equal(s.ended(), 1);
  down(s, 0, 10, 10); s.fire('mouseup', { button: 0, clientX: 10, clientY: 10 });
  assert.equal(s.count(), 0); assert.ok(s.log.includes('click'));
});

test('binder: Esc cancels the drag and swallows the key (no pause menu); Esc without a drag passes through', () => {
  const s = start('game', [{}, {}]);
  down(s, 0, 10, 10); s.fire('mousemove', { clientX: 150, clientY: 10, buttons: 1 });
  const e = s.fire('keydown', { key: 'Escape' });
  assert.equal(e.stopped, true); assert.equal(s.m.state, 'idle'); assert.equal(s.count(), 0); assert.ok(s.log.includes('cancel:esc'));
  down(s, 0, 10, 10);   // only pressed, never moved
  const e2 = s.fire('keydown', { key: 'Escape' });
  assert.equal(e2.stopped, false); assert.equal(s.count(), 0);
});

test('binder: window blur / tab hidden / context menu cancel; nothing leaks', () => {
  for (const kind of ['blur', 'contextmenu', 'hidden']) {
    const s = start('game', [{}, {}]);
    down(s, 0, 10, 10); s.fire('mousemove', { clientX: 150, clientY: 10, buttons: 1 });
    if (kind === 'hidden') { s.doc.hidden = true; for (const f of (s.DL.visibilitychange || []).slice()) f({}); } else s.fire(kind, {});
    assert.equal(s.m.state, 'idle', kind); assert.equal(s.count(), 0, kind); assert.ok(s.log.some(l => l.startsWith('cancel')), kind); assert.equal(s.ended(), 1, kind);
  }
});

test('binder: a missed release (mouse no longer down) cancels on the next move; release outside the page applies nothing', () => {
  const s = start('game', [{}, {}]);
  down(s, 0, 10, 10); s.fire('mousemove', { clientX: 150, clientY: 10, buttons: 1 });
  s.fire('mousemove', { clientX: 160, clientY: 10, buttons: 0 });
  assert.equal(s.m.state, 'idle'); assert.equal(s.count(), 0); assert.ok(s.log.includes('cancel:lost'));
  const s2 = start('game', [{}, {}]);
  down(s2, 0, 10, 10); s2.fire('mousemove', { clientX: 150, clientY: 10, buttons: 1 });
  s2.fire('mouseup', { button: 0, clientX: 900, clientY: 10 });   // outside the viewport
  assert.ok(s2.log.includes('drop:none')); assert.equal(s2.m.state, 'idle'); assert.equal(s2.count(), 0);
});

test('binder: under pointer lock the stale real events are ignored, synthetic ones drive the drag', () => {
  const s = start('game', [{}, {}], { locked: true });
  down(s, 0, 10, 10);
  s.fire('mousemove', { clientX: 5, clientY: 5, buttons: 0, isTrusted: true });   // stale real move: ignored (not a "lost release")
  assert.equal(s.m.state, 'pressed');
  s.fire('mousemove', { clientX: 150, clientY: 10, buttons: 0, isTrusted: false });
  assert.equal(s.m.dragging, true);
  s.fire('mouseup', { button: 0, clientX: 1, clientY: 1, isTrusted: true });   // stale real release: ignored
  assert.equal(s.m.dragging, true);
  s.fire('mouseup', { button: 0, clientX: 150, clientY: 10, isTrusted: false });
  assert.ok(s.log.includes('drop:swap')); assert.equal(s.count(), 0);
});

test('binder: abort is idempotent; non-left press is ignored', () => {
  const s = start('game', [{}, {}]);
  assert.equal(s.begin(slot(0), { button: 2, clientX: 0, clientY: 0 }), false); assert.equal(s.count(), 0);
  down(s, 0, 10, 10); s.fire('mousemove', { clientX: 150, clientY: 10, buttons: 1 });
  s.begin.abort('unbind'); assert.equal(s.count(), 0); assert.equal(s.m.state, 'idle');
  s.begin.abort('again'); assert.equal(s.ended(), 1);
});

// ---- the sim: a drag-swap never pauses; hotkeys stay bound to slots
test('in-game swap does not pause the sim; slot keys follow the slot; cooldown follows the item', () => {
  const r = rig({ items: ['shiva', 'dust'] });
  r.at(10);
  const tick = () => r.w.tick != null ? r.w.tick : r.w.t;
  const t0 = tick();
  assert.ok(r.IT.Items.swap(r.w, r.h, 0, 1));
  assert.deepEqual(r.h.items.slice(0, 2).map(x => x && x.id), ['dust', 'shiva']);
  r.at(r.T.ms + 500);
  assert.ok(tick() > t0, 'sim advanced after the swap');
  assert.ok(!r.w.paused && !r.T.paused, 'no pause');
  r.key('z'); r.at(r.T.ms + 300);   // key of slot 1 now casts the item that sits there (dust)
  assert.equal(r.casts[0], 'dust');
  r.key('x'); r.at(r.T.ms + 300);
  assert.equal(r.casts[1], 'shiva');
  assert.ok(r.IT.Items.swap(r.w, r.h, 0, 1)); assert.equal(r.h.items[1].id, 'dust');
  assert.ok(r.h.items[1].cd > 0, 'dust cooldown moved with the item');
});

// ---- #38: side pane only in Free Play
test('side pane: only for a Free Play sandbox, never for scenarios (ranked or practice)', () => {
  const load = require('./_load.js');
  const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/dotaworld.js', 'js/data/maps.js', 'js/data/i18n.js',
    'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js', 'js/sim/nav.js', 'js/sim/vision.js',
    'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js', 'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/art/art.js', 'js/art/icons.js', 'js/ui/hud.js'];
  const H = load(FILES).HUD;
  assert.equal(H.hasSide({ mode: 'sandbox', free: true }), true);
  assert.equal(H.hasSide({ mode: 'sandbox', free: false }), false);   // practice scenario (a run)
  assert.equal(H.hasSide({ mode: 'ranked', free: false }), false);
  assert.equal(H.hasSide({ mode: 'ranked', free: true }), false);
  assert.equal(H.hasSide(null), false);
  const src = fs.readFileSync(path.join(ROOT, 'js/ui/hud.js'), 'utf8');
  assert.ok(/if \(H\.hasSide\(ctx\)\) \{[^}]*H\.buildSide\(ctx, root\)/.test(src), 'buildSide is only reached through the gate');
  assert.equal((src.match(/H\.buildSide\(/g) || []).length, 1, 'the single gated call');
});
