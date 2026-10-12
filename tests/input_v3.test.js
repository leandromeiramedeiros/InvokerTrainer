'use strict';
const test = require('node:test'), assert = require('node:assert');
const { rig } = require('./input_rig');

const moveOrders = r => r.orders.filter(o => o.type === 'move');

test('browser UI guards: contextmenu / middle / Mouse4-5 / auxclick always prevented (capture, window)', () => {
  const r = rig();
  for (const t of ['contextmenu', 'auxclick', 'dragstart']) assert.ok(r.fire(t, {}).defaultPrevented, t);
  for (const t of ['mousedown', 'mouseup']) for (const b of [1, 3, 4]) assert.ok(r.fire(t, { button: b }).defaultPrevented, t + b);
  assert.ok(!r.fire('mousedown', { button: 0 }).defaultPrevented);
  r.In.unbind();   // still prevented with the game unbound (menus)
  assert.ok(r.fire('contextmenu', {}).defaultPrevented);
});

test('rmbRepeat: holding RMB re-issues the move at ~8 Hz at the current cursor; stops on release', () => {
  const r = rig({ autoAttack: false, dist: 3000 });
  r.IT.Settings.data.rmbRepeat = true;
  r.mw.x = r.h.x - 500; r.mw.y = r.h.y;
  r.at(100); r.click(2);
  assert.equal(moveOrders(r).length, 1);
  r.mw.x = r.h.x - 700;                       // cursor moved while held
  r.at(100 + 1000);
  const n = moveOrders(r).length;
  assert.ok(n >= 8 && n <= 10, 'n=' + n);
  assert.equal(moveOrders(r).pop().x, r.mw.x);
  r.winUp(2); r.at(2500);
  assert.equal(moveOrders(r).length, n, 'no more after release');
});

test('rmbRepeat off: single click only; repeat stops on blur, pause, leaving the window, or armed spell', () => {
  let r = rig({ autoAttack: false, dist: 3000 });
  r.mw.x = r.h.x - 500; r.mw.y = r.h.y;
  r.at(10); r.click(2); r.at(1000); assert.equal(moveOrders(r).length, 1);
  for (const stop of ['blur', 'pause', 'leave']) {
    r = rig({ autoAttack: false, dist: 3000 });
    r.IT.Settings.data.rmbRepeat = true; r.mw.x = r.h.x - 500; r.mw.y = r.h.y;
    r.at(10); r.click(2); r.at(500);
    const n = moveOrders(r).length; assert.ok(n > 3);
    if (stop === 'blur') r.W.blur.forEach(x => x.f());
    else if (stop === 'pause') r.w.paused = true;
    else r.In.win.in = false;
    r.at(900); r.w.paused = false; r.In.win.in = true; r.at(1500);
    assert.equal(moveOrders(r).length, n, stop);
  }
  r = rig({ autoAttack: false, dist: 3000, castMode: 'normal' });
  r.IT.Settings.data.rmbRepeat = true; r.mw.x = r.h.x - 500; r.mw.y = r.h.y;
  r.at(10); r.click(2); r.key('w'); r.key('w'); r.key('w'); r.key('r'); r.key('d'); assert.ok(r.In.armed);
  const n = moveOrders(r).length; r.at(1000);
  assert.equal(moveOrders(r).length, n); assert.ok(r.In.armed, 'repeat must not cancel an armed spell');
});

test('camera: glideTo eases (no snap), frame-rate independent, reaches the target', () => {
  const r = rig();
  const map = { W: 100000, H: 100000 };
  const run = (hz, secs) => {
    const c = r.IT.Camera.create(map); c.x = 20000; c.y = 20000; c.glideTo(22000 + 1440, 20000 + 810);
    const ks = new Set(), m = { x: 0, y: 0, in: false };
    let first = 0;
    for (let i = 0; i < Math.round(hz * secs); i++) { c.update(1 / hz, ks, m, null); if (i === 0) first = c.x; }
    return { x: c.x, first };
  };
  const a = run(30, 0.3), b = run(120, 0.3);
  assert.ok(Math.abs(a.x - b.x) < 1, 'same position after 0.3s: ' + a.x + ' vs ' + b.x);
  assert.ok(a.x > 20000 && a.x < 22000, 'mid-glide ' + a.x);
  assert.ok(b.first - 20000 < 200, 'first frame moves little ' + b.first);
  assert.equal(run(60, 3).x, 22000);
});

test('camera: follow and lock glide toward the hero; minimap centerOn still snaps; manual scroll cancels glide', () => {
  const r = rig();
  const c = r.IT.Camera.create({ W: 100000, H: 100000 }); c.x = 20000; c.y = 20000;
  const hero = { x: 25000, y: 22000 }, ks = new Set(), m = { x: 0, y: 0, in: false };
  c.follow = true; c.update(1 / 60, ks, m, hero);
  assert.ok(c.x > 20000 && c.x < 21500, 'follow does not snap: ' + c.x);
  for (let i = 0; i < 120; i++) c.update(1 / 60, ks, m, hero);
  assert.ok(Math.abs(c.x - (25000 - 1440)) < 5);
  c.follow = false; c.lock = true; hero.x = 26000; c.update(1 / 60, ks, m, hero);
  assert.ok(c.x < 26000 - 1440 - 500, 'lock glides');
  c.lock = false; c.centerOn(50000, 50000); assert.equal(c.x, 50000 - 1440);
  c.glideTo(60000, 60000); c.update(1 / 60, new Set(['ArrowLeft']), m, null); assert.equal(c.glide, null);
});

test('center key: select press then center press glides (glideTo), release keeps gliding to the hero', () => {
  const r = rig({ autoAttack: false });
  const calls = []; r.cam.glideTo = (x, y) => calls.push([x, y]);
  r.In.selected = r.dummy.id;   // something else selected: 1st press only selects the hero
  r.at(10); const e1 = r.down(' '); r.up(e1);
  assert.equal(calls.length, 0);
  r.at(300); const e2 = r.down(' ');
  assert.deepEqual(calls[0], [r.h.x, r.h.y]); assert.equal(r.cam.follow, true);
  r.up(e2); assert.equal(calls.length, 2); assert.equal(r.cam.follow, false);
});

// ---------------------------------------------------------------- Cataclysm
function invokeSun(r) { for (const k of ['e', 'e', 'e', 'r']) r.key(k); }
const sunOrders = r => r.orders.filter(o => o.type === 'cast' && o.ability === 'sunstrike');

test('cataclysm quick-cast: single press waits then casts a normal Sun Strike at the captured point', () => {
  const r = rig({ scepter: true, autoAttack: false, dist: 800 });
  invokeSun(r);
  r.at(100); r.mw.x = r.h.x + 700; r.mw.y = r.h.y + 100; const p = { x: r.mw.x, y: r.mw.y };
  r.key('d');
  assert.equal(sunOrders(r).length, 0, 'held for the window');
  r.mw.x = r.h.x - 1000;                                // cursor moves during the window: capture wins
  r.at(100 + 200); assert.equal(sunOrders(r).length, 0);
  r.at(100 + 350);
  const o = sunOrders(r); assert.equal(o.length, 1); assert.equal(o[0].x, p.x); assert.equal(o[0].y, p.y); assert.equal(o[0].target, undefined);
});

test('cataclysm quick-cast: second press inside the window = self-cast Cataclysm, no normal strike', () => {
  const r = rig({ scepter: true, autoAttack: false, dist: 800 });
  invokeSun(r);
  r.at(100); r.key('d'); r.at(220); r.key('d'); r.at(1000);
  const o = sunOrders(r); assert.equal(o.length, 1); assert.equal(o[0].target, r.h.id);
  assert.equal(r.casts.filter(c => c === 'sunstrike').length, 1);
  assert.ok(r.h.cd.sunstrike > 60, 'cataclysm cooldown ' + r.h.cd.sunstrike);
});

test('cataclysm: no delay without scepter, on cooldown, with doubleTap off; other input flushes the held strike first', () => {
  let r = rig({ autoAttack: false });                      // no scepter
  invokeSun(r); r.at(100); r.key('d'); assert.equal(sunOrders(r).length, 1, 'no scepter: instant');
  r = rig({ scepter: true, autoAttack: false });
  invokeSun(r); r.h.cd.sunstrike = 10; r.at(100); r.key('d'); assert.equal(sunOrders(r).length, 0); assert.ok(r.fails.includes('cooldown'), 'immediate fail, no delay');
  r = rig({ scepter: true, autoAttack: false }); r.IT.Settings.data.doubleTap = false;
  invokeSun(r); r.at(100); r.key('d'); assert.equal(sunOrders(r).length, 1, 'doubleTap off: instant');
  r = rig({ scepter: true, autoAttack: false });
  invokeSun(r); r.at(100); r.key('d'); r.at(150); r.key('q');      // orb during the window: strike goes first, in order
  assert.equal(sunOrders(r).length, 1); assert.equal(sunOrders(r)[0].target, undefined);
  r = rig({ scepter: true, autoAttack: false });
  invokeSun(r); r.at(100); r.key('d'); r.at(150); r.mw.x = r.h.x - 500; r.click(2);      // move order: strike fires before it
  assert.equal(sunOrders(r).length, 1); assert.equal(r.orders[r.orders.length - 1].type, 'move');
  r = rig({ scepter: true, autoAttack: false });
  invokeSun(r); r.at(100); r.key('d'); r.at(150); r.key('s'); r.at(1000);
  assert.equal(sunOrders(r).length, 0, 'stop discards the held press');
});

test('cataclysm normal-cast: first press arms, second press self-casts; no scepter: stays a plain arm', () => {
  let r = rig({ scepter: true, autoAttack: false, castMode: 'normal' });
  invokeSun(r); r.at(100); r.key('d'); assert.ok(r.In.armed && r.In.armed.id === 'sunstrike'); r.key('d');
  assert.equal(r.In.armed, null); const o = sunOrders(r); assert.equal(o.length, 1); assert.equal(o[0].target, r.h.id);
  r = rig({ autoAttack: false, castMode: 'normal' });
  invokeSun(r); r.at(100); r.key('d'); r.key('d'); assert.equal(sunOrders(r).length, 0); assert.ok(r.In.armed);
});

test('alt+sunstrike = Cataclysm immediately when available', () => {
  const r = rig({ scepter: true, autoAttack: false });
  invokeSun(r); r.at(100); r.key('d', { altKey: true }); const o = sunOrders(r);
  assert.equal(o.length, 1); assert.equal(o[0].target, r.h.id);
});

// ---------------------------------------------------------------- responsiveness
test('quick-cast unit spell with nothing under the cursor arms targeting instead of dropping the press', () => {
  const r = rig({ dist: 3000, autoAttack: false });
  for (const k of ['q', 'q', 'q', 'r']) r.key(k);
  r.mw.x = r.h.x - 500; r.mw.y = r.h.y;
  r.at(50); r.key('d'); assert.ok(r.In.armed && r.In.armed.id === 'coldsnap'); assert.ok(!r.fails.includes('noTarget'));
  r.mw.x = r.dummy.x; r.mw.y = r.dummy.y; r.click(0); r.at(9000);
  assert.deepEqual(r.casts, ['coldsnap']);
});

test('deferred queue drains on sim ticks even when no render frame runs', () => {
  const r = rig({ autoAttack: false, dist: 450 });
  for (const k of ['w', 'w', 'w', 'r']) r.key(k);      // EMP in slot 0
  r.at(50); r.key('d');                                // EMP cast in flight
  for (const k of ['q', 'q', 'q']) r.key(k);
  r.key('r');                                          // would evict EMP: waits for it
  r.key('d');                                          // later key queues behind the invoke
  for (let i = 0; i < 90; i++) r.w.step();             // sim only, no In.drawAim
  assert.equal(r.In._q.length, 0, 'queue drained by the sim-tick hook');
  assert.equal(r.casts[0], 'emp');
  assert.ok(r.h.inv.slots.includes('coldsnap'));
});

test('stop / hold clear armed state and issue stop / hold; A + click works', () => {
  const r = rig({ autoAttack: false, dist: 900 });
  r.key('a'); assert.ok(r.In.armed); r.key('s'); assert.equal(r.In.armed, null); assert.equal(r.orders.pop().type, 'stop');
  r.key('a'); r.key('h'); assert.equal(r.In.armed, null); assert.equal(r.orders.pop().type, 'hold');
  r.key('a'); r.mw.x = r.h.x - 300; r.mw.y = r.h.y; r.click(0);
  const o = r.orders.pop(); assert.equal(o.type, 'attack'); assert.equal(o.x, r.mw.x); assert.equal(o.target, undefined);
});

test('armed attack-move uses the amove (cross) cursor; enemy hover uses attack', () => {
  const r = rig({ autoAttack: false, dist: 450 });
  const seen = []; r.IT.Cursor = { set: k => seen.push(k) };
  r.at(50); assert.equal(seen[seen.length - 1], 'attack');       // dummy under the cursor
  r.mw.x = r.h.x - 2000; r.at(100); assert.equal(seen[seen.length - 1], 'default');
  r.key('a'); r.at(150); assert.equal(seen[seen.length - 1], 'amove');
});

// #43 repro: Ghost Walk must cast while the player spams right-click moves
test('Q Q W R V (legacy keys) with right-click moves every 30 ms: Ghost Walk casts', () => {
  const r = rig({ autoAttack: false, dist: 3000, castMode: 'quick' });
  r.IT.Settings.data.scheme = 'legacy';
  r.mw.x = r.h.x - 2000; r.mw.y = r.h.y + 300;
  let t = 100; r.at(t);
  for (const k of ['q', 'q', 'w', 'r', 'v']) { r.key(k); t += 30; r.at(t); r.click(2); }
  for (let i = 0; i < 40; i++) { t += 30; r.at(t); r.click(2); }
  r.at(t + 1500);
  assert.ok(r.casts.includes('ghostwalk'), 'casts=' + r.casts + ' fails=' + r.fails);
});

test('input order = issue order: cast key then right-click issues cast then move, never reordered', () => {
  const r = rig({ autoAttack: false, dist: 3000 });
  r.IT.Settings.data.scheme = 'legacy';
  r.mw.x = r.h.x - 2000; r.mw.y = r.h.y;
  for (const k of ['q', 'q', 'w', 'r']) r.key(k);
  r.at(100); r.key('v'); r.click(2); r.key('v'); r.click(2);
  const seq = r.orders.map(o => o.type + (o.ability ? ':' + o.ability : ''));
  assert.deepEqual(seq.slice(0, 4), ['cast:ghostwalk', 'move', 'cast:ghostwalk', 'move']);
});
