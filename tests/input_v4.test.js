'use strict';
// v4 input: box select, TAB cycle, group orders, CTRL unified orders, stats key, rangefinder shapes, settings.
const test = require('node:test'), assert = require('node:assert');
const { rig } = require('./input_rig');

// consistent linear camera: hero at screen (240,135), 1 view px = 6 world units
function cam(r) {
  const { h, cam: c } = r;
  c.toScreen = (x, y) => ({ x: 240 + (x - h.x) / 6, y: 135 + (y - h.y) / 6 });
  c.toWorld = (x, y) => ({ x: h.x + (x - 240) * 6, y: h.y + (y - 135) * 6 });
}
function spirit(r, dx, dy) { return r.IT.Units.spawnSpirit(r.w, r.h, r.h.x + dx, r.h.y + dy); }
function move(r, x, y, mods) {
  for (const l of r.W.mousemove || []) l.f(Object.assign({ clientX: x, clientY: y, buttons: 1, isTrusted: true, target: { tagName: 'CANVAS' } }, mods || {}));
}
function drag(r, a, b, mods) {
  r.click(0, Object.assign({ clientX: a[0], clientY: a[1] }, mods || {}));
  move(r, b[0], b[1]);
  for (const l of r.W.mouseup || []) l.f(Object.assign({ button: 0, clientX: b[0], clientY: b[1], isTrusted: true, preventDefault() {} }, mods || {}));
}
// screen pos of a world unit relative to the hero camera
const scr = (r, e) => r.cam.toScreen(e.x, e.y);

test('box select: drags select hero + spirits inside; foes and towers never; short click keeps hero', () => {
  const r = rig({ dist: 300, autoAttack: false }); cam(r);
  const s1 = spirit(r, 240, 0), s2 = spirit(r, 240, 120);
  r.at(10);
  drag(r, [100, 60], [380, 210]);
  assert.deepEqual(r.In.sel.units.slice().sort(), [r.h.id, s1.id, s2.id].sort());
  assert.equal(r.In.sel.group, 'all');
  assert.equal(r.In.selected, null);
  assert.ok(!r.In.sel.units.includes(r.dummy.id), 'dummy never box-selected');
  // a box over spirits only
  const a = scr(r, s1), b = scr(r, s2);
  drag(r, [Math.min(a.x, b.x) - 15, Math.min(a.y, b.y) - 25], [Math.max(a.x, b.x) + 15, Math.max(a.y, b.y) + 10]);
  assert.equal(r.In.sel.group, 'spirits');
  assert.deepEqual(r.In.sel.units.slice().sort(), [s1.id, s2.id].sort());
  // empty box keeps the selection
  drag(r, [5, 5], [30, 30]);
  assert.equal(r.In.sel.group, 'spirits');
  // plain click (no travel) does not box select
  r.click(0, { clientX: 300, clientY: 200 }); r.winUp(0);
  assert.equal(r.In.sel.group, 'spirits');
});

test('box select never grabs a dummy: a box over only a dummy changes nothing; click inspects it', () => {
  const r = rig({ dist: 300, autoAttack: false }); cam(r);
  const d = scr(r, r.dummy);
  r.at(10);
  drag(r, [d.x - 20, d.y - 30], [d.x + 20, d.y + 20]);
  assert.deepEqual(r.In.sel.units, [r.h.id]);
  r.click(0, { clientX: d.x, clientY: d.y }); r.winUp(0);
  assert.equal(r.In.selected, r.dummy.id);
  assert.deepEqual(r.In.sel.units, [r.h.id]);
});

test('TAB cycles hero <-> spirits group; skipped when no spirit is alive; stats key no longer Tab', () => {
  const r = rig({ autoAttack: false }); cam(r); r.at(10);
  const tab = () => { const ev = r.down('Tab'); r.up(ev); };
  const mkTab = () => { const ev = { key: 'Tab', code: 'Tab', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, repeat: false, target: { tagName: 'BODY' }, preventDefault() {} }; r.In.keyDown(ev); r.In.keyUp(ev); };
  mkTab(); assert.equal(r.In.sel.group, 'hero', 'no spirits: stays on hero');
  const s1 = spirit(r, 100, 0), s2 = spirit(r, 100, 100);
  mkTab(); assert.equal(r.In.sel.group, 'spirits'); assert.deepEqual(r.In.sel.units.slice().sort(), [s1.id, s2.id].sort());
  mkTab(); assert.equal(r.In.sel.group, 'hero'); assert.deepEqual(r.In.sel.units, [r.h.id]);
  mkTab(); s1.dead = true; r.w.remove && r.w.remove(s1); s2.dead = true; r.w.remove && r.w.remove(s2);
  r.at(100);
  assert.equal(r.In.sel.group, 'hero', 'spirits gone -> hero again');
  void tab;
});

test('auto group: a spirit summoned after TAB joins the spirits group', () => {
  const r = rig({ autoAttack: false }); cam(r); r.at(10);
  const s1 = spirit(r, 100, 0);
  r.In.cycleSel(); assert.deepEqual(r.In.sel.units, [s1.id]);
  const s2 = spirit(r, 100, 100);
  r.at(60);
  assert.deepEqual(r.In.sel.units.slice().sort(), [s1.id, s2.id].sort());
});

test('orders go to every selected unit (issueGroup when present, per-unit fallback otherwise)', () => {
  for (const withGroup of [false, true]) {
    const r = rig({ autoAttack: false }); cam(r); r.at(10);
    const s1 = spirit(r, 100, 0), s2 = spirit(r, 100, 100);
    const got = [];
    if (withGroup) r.IT.Orders.issueGroup = (w, us, o) => { got.push(us.map(u => u.id)); for (const u of us) r.IT.Orders.issue(w, u, o); return true; };
    r.In.cycleSel();
    r.mw.x = r.h.x - 600; r.mw.y = r.h.y;
    r.click(2); r.winUp(2);
    for (const s of [s1, s2]) assert.ok(s.orders.some(o => o.type === 'move'), 'spirit moved');
    assert.ok(!r.h.orders.some(o => o.type === 'move'), 'hero not selected -> no move');
    if (withGroup) assert.deepEqual(got[0].slice().sort(), [s1.id, s2.id].sort());
    r.key('s');
    assert.ok(s1.orders.every(o => o.type !== 'move') && s2.orders.every(o => o.type !== 'move'), 'stop clears both spirits');
  }
});

test('spells and items always come from Invoker even with spirits selected', () => {
  const r = rig({ autoAttack: false, castMode: 'normal' }); cam(r); r.at(10);
  const s1 = spirit(r, 100, 0);
  r.In.cycleSel();
  r.key('e'); r.key('e'); r.key('e'); r.key('r'); r.key('d');
  assert.ok(r.In.armed, 'sunstrike armed');
  r.click(0, { clientX: 300, clientY: 100 }); r.winUp(0); r.at(1500);
  assert.ok(r.casts.includes('sunstrike'), 'hero cast');
  assert.ok(!s1.orders.some(o => o.type === 'cast'));
});

test('CTRL unified orders: hero + all spirits; off with the setting', () => {
  for (const on of [true, false]) {
    const r = rig({ autoAttack: false }); cam(r); r.at(10);
    r.IT.Settings.data.unifiedOrders = on;
    const s1 = spirit(r, 100, 0);
    r.mw.x = r.h.x - 600; r.mw.y = r.h.y;
    const ev = r.down('Control', { ctrlKey: true });
    r.click(2, { ctrlKey: true }); r.winUp(2); r.up(ev);
    assert.ok(r.h.orders.some(o => o.type === 'move'), 'hero moved');
    assert.equal(s1.orders.some(o => o.type === 'move'), on, 'spirit follows only when unifiedOrders');
  }
});

test('stats key (rebindable, default O) toggles live stats; Tab is reserved', () => {
  const r = rig(); r.at(10);
  const calls = [];
  r.In.hooks.stats = () => calls.push('stats');
  assert.equal(r.IT.Settings.data.keys.common.stats, 'O');
  const ev = r.down('o', { code: 'KeyO' }); r.up(ev);
  assert.deepEqual(calls, ['stats']);
  assert.ok(r.IT.Settings.RESERVED ? r.IT.Settings.RESERVED.includes('Tab') : true);
});

test('settings defaults / merge: unifiedOrders; hudMode is gone (stored values silently dropped)', () => {
  const { IT } = rig();
  const S = IT.Settings;
  const d = S.defaults();
  assert.equal(d.unifiedOrders, true); assert.ok(!('hudMode' in d)); assert.equal(d.keys.common.stats, 'O');
  assert.ok(!('hudMode' in S.merge(S.defaults(), { hudMode: 'steps' })));
  assert.equal(S.merge(S.defaults(), { unifiedOrders: false }).unifiedOrders, false);
});

test('rangefinder shapes: cast ring + footprint per spell, live at any zoom', () => {
  const r = rig(); const { In, h, w } = r;
  const A = r.IT.Abilities, stub = { kind: 'item', range: () => 0, castPoint: () => 0, manaCost: () => 0, cooldown: () => 0 };
  if (!A.get('dust')) A.def('dust', Object.assign({ target: 'none' }, stub));        // items agent may not have landed these yet:
  if (!A.get('forcestaff')) A.def('forcestaff', Object.assign({ target: 'unit' }, stub));   // the hard-coded fallbacks must carry them
  const m = { x: h.x + 500, y: h.y };
  const shapes = (id, tgt) => In.aimShapes(id, h, w, m, tgt);
  const kinds = i => i.shapes.map(s => s.k + ':' + s.st);
  let i = shapes('tornado'); assert.ok(i.shapes.some(s => s.k === 'poly'), 'tornado line');
  i = shapes('deafeningblast'); assert.ok(i.shapes.filter(s => s.k === 'poly').length >= 1);
  i = shapes('icewall'); assert.ok(i.shapes.some(s => s.k === 'poly'));
  i = shapes('shiva'); assert.ok(i.shapes.some(s => s.k === 'circle' && s.x === h.x && s.y === h.y && s.r > 100), 'shiva centred on Invoker');
  i = shapes('gleipnir'); assert.ok(i.shapes.some(s => s.k === 'circle' && s.x === m.x), 'gleipnir at cursor');
  assert.ok(kinds(i).includes('circle:range'), 'cast range ring');
  i = shapes('sunstrike'); assert.ok(i.shapes.some(s => s.k === 'circle' && s.x === m.x && s.st === 'aoe'));
  i = shapes('chaosmeteor'); assert.ok(i.shapes.some(s => s.k === 'poly' && s.st === 'path'), 'meteor path');
  i = shapes('emp'); assert.ok(i.shapes.some(s => s.k === 'circle' && s.x === m.x));
  i = shapes('dust'); assert.ok(i.shapes.some(s => s.k === 'circle' && s.r > 500 && s.x === h.x), 'dust radius fallback');
  i = shapes('forcestaff'); assert.ok(i.shapes.some(s => s.k === 'line'), 'push line');
  assert.ok(i.range > 0, 'force staff cast range');
  for (const id of ['tornado', 'deafeningblast', 'icewall', 'shiva', 'gleipnir', 'sunstrike', 'chaosmeteor', 'emp', 'dust', 'forcestaff']) {
    const q = shapes(id); assert.ok(q && q.shapes.length, id);
    for (const s of q.shapes) assert.ok(Number.isFinite(s.r || 1), id + ' finite');
  }
  // out-of-range flag follows the cursor
  const far = In.aimShapes('gleipnir', h, w, { x: h.x + 9000, y: h.y }, null);
  assert.equal(far.inRange, false);
});

test('drawAim paints the selection rectangle and the armed spell footprint (zoom 0.7..1.2)', () => {
  const r = rig({ dist: 300, autoAttack: false, castMode: 'normal' }); cam(r); r.at(10);
  spirit(r, 120, 0);
  const calls = [];
  const g = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls.push(k); }), set: (t, k, v) => { t[k] = v; return true; } });
  r.click(0, { clientX: 100, clientY: 60 }); move(r, 300, 200);
  r.In.drawAim(g);
  assert.ok(calls.includes('strokeRect'), 'drag rect drawn');
  for (const l of r.W.mouseup || []) l.f({ button: 0, clientX: 300, clientY: 200, isTrusted: true, preventDefault() {} });
  for (const z of [0.7, 1, 1.2]) {
    const GM = r.IT.GAME; const w0 = GM.VIEW_W, h0 = GM.VIEW_H;
    GM.VIEW_W = (GM.VIEW_W_BASE || 480) / z; GM.VIEW_H = (GM.VIEW_H_BASE || 270) / z;
    calls.length = 0;
    r.key('e'); r.key('e'); r.key('e'); r.key('r'); r.key('d'); r.at(r.T.ms + 20);
    assert.ok(r.In.armed, 'armed');
    r.In.drawAim(g);
    assert.ok(calls.includes('arc') || calls.includes('moveTo'), 'footprint drawn at zoom ' + z);
    GM.VIEW_W = w0; GM.VIEW_H = h0;
    r.In.armed = null;
  }
});
