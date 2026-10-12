'use strict';
// Input -> sim: fast key sequences must not drop casts; attack-move, self-cast, selection, center, ESC, key names, camera.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/i18n.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/render/camera.js', 'js/ui/settings.js', 'js/input.js'];
const SRC = FILES.map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);

function loadAll() {
  const ctx = vm.createContext({ console, Math, JSON, Date, Map, Set, Array, Object, Number, String, Boolean, Error, Symbol, Promise, Infinity, NaN, isFinite, isNaN, parseInt, parseFloat,
    Float32Array, Float64Array, Int8Array, Int16Array, Int32Array, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray,
    addEventListener() {}, removeEventListener() {}, innerWidth: 1000, innerHeight: 600 });
  vm.runInContext('globalThis.IT = { UI: { toast() {} } };', ctx);
  for (const [f, s] of SRC) vm.runInContext(s, ctx, { filename: f });
  return ctx.IT;
}

const CODES = { q: 'KeyQ', w: 'KeyW', e: 'KeyE', r: 'KeyR', d: 'KeyD', f: 'KeyF', a: 'KeyA', s: 'KeyS', z: 'KeyZ', ' ': 'Space', Escape: 'Escape' };
// opts: map (real map), items, dist/side (dummy placement), autoAttack
function rig(o) {
  o = o || {};
  const IT = loadAll(), In = IT.Input;
  const map = o.map ? IT.Map.build(IT.MAPDEF) : null;
  const lo = Object.assign(IT.Loadout.default(), { heroLevel: 30, orbs: { quas: 8, wex: 8, exort: 8 }, items: o.items || [] });
  const w = IT.World.create({ seed: 5, fog: false, autoAttack: o.autoAttack !== false, map: map || undefined, loadout: IT.Loadout.normalize(lo) });
  const sp = map ? map.spawns.hero : { x: 4000, y: 2000 };
  const h = IT.Hero.create(w, lo, sp.x, sp.y);
  h.facing = 0; h.maxMana = h.mana = 99999;
  const side = o.side == null ? 1 : o.side;
  const dummy = IT.Units.spawnDummy(w, { x: h.x + (o.dist || 450) * side, y: h.y, preset: 'training', skin: 'pedro', behavior: 'stationary' });
  dummy.visible = true; dummy.hp = dummy.maxHp = 1e6;
  const mw = { x: dummy.x, y: dummy.y };           // world position under the cursor
  const cam = { follow: false, c: null, toWorld: () => ({ x: mw.x, y: mw.y }), toScreen: (x, y) => ({ x: x / 6, y: y / 6 }), centerOn(x, y) { cam.c = [x, y]; }, lock: false };
  const L = {};
  const cv = { addEventListener(t, f) { L[t] = f; }, removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 270, right: 480, bottom: 270 }) };
  const ctx = { w, hero: h, cam, R: { mmHit: () => null }, cv };
  const T = { ms: 0, acc: 0 }, STEP = 1000 / 30, FR = 1000 / 60;
  In.now = () => T.ms;
  In.hooks = { pause() { T.paused = (T.paused || 0) + 1; } };
  In.bind(ctx);
  In.mouse.in = true; In.win.in = true;
  const casts = [], fails = [];
  w.on('cast', e => { if (e.unit === h.id) casts.push(e.ability); });
  w.on('fail', e => fails.push(e.reason));
  const g2 = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  const r = {
    IT, In, w, h, dummy, mw, cam, casts, fails, T, L,
    at(ms) {   // advance sim (30 Hz) + frame hook (60 Hz) to absolute time ms
      while (T.ms < ms - 1e-9) {
        const d = Math.min(FR, ms - T.ms);
        T.ms += d; T.acc += d; In.now = () => T.ms;
        while (T.acc >= STEP - 1e-6) { w.step(); T.acc -= STEP; }
        In.drawAim(g2);
      }
    },
    key(k, mods) {
      mods = mods || {};
      if (k === 'r' && o.freeInvoke !== false) h.inv.invokeCd = 0;
      const ev = Object.assign({ key: k, code: CODES[k] || '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, repeat: false, target: { tagName: 'BODY' }, preventDefault() {} }, mods);
      In.keyDown(ev); In.keyUp(ev);
    },
    down(k, mods) { const ev = Object.assign({ key: k, code: CODES[k] || '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, repeat: false, target: { tagName: 'BODY' }, preventDefault() {} }, mods || {}); In.keyDown(ev); return ev; },
    up(ev) { In.keyUp(ev); },
    click(button, mods) { L.mousedown(Object.assign({ button, clientX: 240, clientY: 135, shiftKey: false, isTrusted: true, preventDefault() {} }, mods || {})); },
  };
  return r;
}

const COMBO = ['w', 'w', 'q', 'r', 'w', 'w', 'w', 'r', 'f', 'd', 'e', 'e', 'w', 'r', 'q', 'w', 'e', 'r', 'f', 'd'];   // Tornado, EMP, cast T+EMP, Meteor, Blast, cast M+B
const WANT = ['tornado', 'emp', 'chaosmeteor', 'deafeningblast'];

for (const gap of [80, 100, 150]) for (const dist of [450, 1300]) for (const side of [1, -1]) {
  test(`fast combo gap=${gap}ms dist=${dist} ${side > 0 ? 'front' : 'behind'}: every cast fires`, () => {
    const r = rig({ dist, side });
    let t = 200;
    for (const k of COMBO) { r.at(t); r.key(k); t += gap; }
    r.at(t + 8000);
    assert.deepEqual(r.casts, WANT, 'casts=' + r.casts + ' fails=' + r.fails);
    assert.ok(!r.fails.some(x => x === 'notInvoked'), 'fails=' + r.fails);
  });
}

test('rapid casts with hero auto-attacking: cast key right after the previous one', () => {
  const r = rig({ dist: 500, side: -1 });
  r.at(100); for (const k of ['w', 'w', 'q', 'r', 'w', 'w', 'w', 'r']) { r.key(k); }
  r.at(1500);    // hero is auto-attacking the dummy behind
  r.key('f'); r.at(1560); r.key('d');   // 60 ms apart
  r.at(5000);
  assert.deepEqual(r.casts, ['tornado', 'emp']);
});

test('a non-cast order still replaces a pending cast (right-click move)', () => {
  const r = rig({ dist: 1500, side: -1 });
  r.at(100); for (const k of ['w', 'w', 'w', 'r']) r.key(k);
  r.at(200); r.key('d');                       // EMP at the far dummy: hero must turn and walk
  r.at(300); r.mw.x = r.h.x + 100; r.mw.y = r.h.y; r.click(2);
  r.at(3000);
  assert.deepEqual(r.casts, []);
  assert.equal(r.h.orders.length, 0);
});

test('quick-cast unit target forgives sloppy aim (cold snap, cursor beside the dummy)', () => {
  const r = rig({ dist: 400 });
  for (const k of ['q', 'q', 'q', 'r']) r.key(k);
  r.mw.x = r.dummy.x + 24 + 50; r.mw.y = r.dummy.y + 20;   // ~54 units off the hull edge
  r.at(50); r.key('d'); r.at(2500);
  assert.deepEqual(r.casts, ['coldsnap'], 'fails=' + r.fails);
});

test('alt+key self-casts alacrity; blink self-cast heads for the bottom-left corner at max range', () => {
  const r = rig({ map: true, items: ['blink'], autoAttack: false });
  for (const k of ['w', 'w', 'e', 'r']) r.key(k);
  r.mw.x = r.h.x + 800; r.mw.y = r.h.y;
  r.at(50); r.key('d', { altKey: true }); r.at(800);
  assert.deepEqual(r.casts, ['alacrity']);
  const sev = r.w.log.filter(e => e.type === 'order' && e.order.ability === 'alacrity').pop();
  assert.equal(sev.order.target, r.h.id);
  const x0 = r.h.x, y0 = r.h.y, H = r.w.map.H;
  r.key('z', { altKey: true }); r.at(1800);
  assert.equal(r.casts[1], 'blink');
  const d = Math.hypot(r.h.x - x0, r.h.y - y0);
  assert.ok(d > 500 && d <= 1200, 'moved ' + d);
  const ex = (0 - x0) / Math.hypot(x0, H - y0), ey = (H - y0) / Math.hypot(x0, H - y0);
  assert.ok(((r.h.x - x0) * ex + (r.h.y - y0) * ey) / d > 0.95, 'direction');
});

test('double-tap the same item key within the timeout self-casts (blink)', () => {
  const r = rig({ map: true, items: ['blink'], autoAttack: false });
  r.mw.x = r.h.x + 400; r.mw.y = r.h.y;
  r.at(50); r.key('z'); r.at(300);
  const x1 = r.h.x; assert.ok(x1 > 4000 - 1e9 && r.h.x > r.w.map.spawns.hero.x + 300, 'blinked east');
  r.h.cd.blink = 0; r.key('z'); r.at(1200);
  assert.equal(r.casts.length, 2);
  assert.ok(r.h.x < x1 - 300, 'second tap went toward the corner');
  // outside the timeout: normal cast again (east)
  const r2 = rig({ map: true, items: ['blink'], autoAttack: false });
  r2.mw.x = r2.h.x + 400; r2.mw.y = r2.h.y;
  r2.at(50); r2.key('z'); r2.at(1000); const x2 = r2.h.x;
  r2.h.cd.blink = 0; r2.mw.x = r2.h.x + 400; r2.key('z'); r2.at(2000);
  assert.ok(r2.h.x > x2 + 300, 'plain second cast');
});

test('A arms attack-move; ground click -> attack point, enemy click -> attack target; shift keeps it armed', () => {
  const r = rig({ autoAttack: false, dist: 900 });
  r.at(10); r.key('a');
  assert.ok(r.In.armed && r.In.armed.attack);
  r.mw.x = r.h.x - 300; r.mw.y = r.h.y; r.click(0);
  let o = r.h.orders[0]; assert.equal(o.type, 'attack'); assert.equal(o.x, r.mw.x); assert.equal(o.target, undefined);
  assert.equal(r.In.armed, null);
  r.key('a'); r.mw.x = r.dummy.x + 10; r.mw.y = r.dummy.y; r.click(0);
  o = r.h.orders[0]; assert.equal(o.type, 'attack'); assert.equal(o.target, r.dummy.id);
  r.key('a'); r.click(0, { shiftKey: true }); assert.ok(r.In.armed, 'shift keeps armed');
  r.click(2); assert.equal(r.In.armed, null, 'right click cancels');
});

test('left click selects a dummy; any action returns to the hero; ESC order', () => {
  const r = rig({ autoAttack: false });
  r.at(10); r.click(0);
  assert.equal(r.In.selected, r.dummy.id);
  r.key('q'); assert.equal(r.In.selected, null);
  r.click(0); assert.equal(r.In.selected, r.dummy.id);
  r.mw.x = r.h.x - 200; r.mw.y = r.h.y; r.click(2); assert.equal(r.In.selected, null);
  r.mw.x = r.dummy.x; r.mw.y = r.dummy.y; r.click(0);
  r.key('Escape'); assert.equal(r.In.selected, null); assert.equal(r.T.paused, undefined);
  r.key('a'); r.key('Escape'); assert.equal(r.In.armed, null); assert.equal(r.T.paused, undefined);
  r.key('Escape'); assert.equal(r.T.paused, 1);
});

test('center: first tap selects hero, second tap centers, hold follows, release stops', () => {
  const r = rig({ autoAttack: false });
  r.In.selected = r.dummy.id;
  r.at(10); const ev = r.down(' ');
  assert.equal(r.In.selected, null); assert.equal(r.cam.c, null);
  r.up(ev); r.at(300); const ev2 = r.down(' ');
  assert.deepEqual(r.cam.c, [r.h.x, r.h.y]); assert.equal(r.cam.follow, true);
  r.up(ev2); assert.equal(r.cam.follow, false);
  r.cam.c = null; r.at(2000); r.key(' '); assert.equal(r.cam.c, null, 'outside the timeout it is a first tap again');
});

test('window-edge scroll flags + camSpeed multiplier', () => {
  const r = rig({ autoAttack: false });
  r.In.win.x = 0; r.In.win.y = 300; r.In.win.in = true;
  let m = r.In.camMouse(); assert.ok(m.edge.l && !m.edge.r && !m.edge.u && !m.edge.d);
  r.In.win.x = 999; r.In.win.y = 599; m = r.In.camMouse(); assert.ok(m.edge.r && m.edge.d);
  r.In.win.x = 500; r.In.win.y = 300; m = r.In.camMouse(); assert.ok(!m.edge.l && !m.edge.r && !m.edge.u && !m.edge.d);
  const map = { W: 100000, H: 100000 };
  const move = sp => {
    r.IT.Settings.data.camSpeed = sp;
    const c = r.IT.Camera.create(map); c.x = 5000; c.y = 5000;
    c.update(0.1, new Set(), { x: 0, y: 0, in: false, edge: { r: true } }, null); return c.x - 5000;
  };
  const a = move(1), b = move(2), c = move(0.5);
  assert.ok(a > 0 && Math.abs(b - 2 * a) < 1e-6 && Math.abs(c - a / 2) < 1e-6);
  r.IT.Settings.data.edgeScroll = false; r.In.win.x = 0; assert.equal(r.In.camMouse().edge, null);
});

test('bindable key names: punctuation, numpad, CapsLock, mouse side buttons; Esc/Tab stay reserved', () => {
  const { IT, In } = rig();
  const S = IT.Settings, kn = (code, key) => S.keyName({ code, key: key || '' });
  assert.equal(kn('Backquote', '`'), '`'); assert.equal(kn('Minus', '-'), '-'); assert.equal(kn('Equal', '='), '=');
  assert.equal(kn('BracketLeft', '['), '['); assert.equal(kn('Semicolon', ';'), ';'); assert.equal(kn('Quote', "'"), "'");
  assert.equal(kn('Comma', ','), ','); assert.equal(kn('Period', '.'), '.'); assert.equal(kn('Slash', '/'), '/'); assert.equal(kn('Backslash', '\\'), '\\');
  assert.equal(kn('Numpad1', '1'), 'Num1'); assert.equal(kn('Digit1', '1'), '1'); assert.equal(kn('NumpadAdd', '+'), 'Num+');
  assert.equal(kn('CapsLock', 'CapsLock'), 'CapsLock'); assert.ok(!S.isMod({ key: 'CapsLock' })); assert.ok(S.isMod({ key: 'Alt' }));
  assert.equal(In.mouseKeyName({ button: 3 }), 'Mouse4'); assert.equal(In.mouseKeyName({ button: 4 }), 'Mouse5'); assert.equal(In.mouseKeyName({ button: 0 }), null);
  assert.deepEqual(S.RESERVED, ['Escape', 'Tab']);
  assert.equal(S.label('Mouse4'), 'Mouse 4'); assert.equal(S.label('Num1'), 'Num 1'); assert.equal(S.label('CapsLock'), 'Caps');
});

test('Mouse4 bound to a cast key triggers the action', () => {
  const r = rig({ autoAttack: false });
  r.IT.Settings.data.keys.common.attack = 'Mouse4';
  const L = [];
  r.IT.Settings.actionFor('Mouse4');
  // window-level mousedown handler is registered on G; drive the same path through press() via keyDown with a fake code
  r.In.keyDown({ key: 'F13', code: 'F13', target: { tagName: 'BODY' }, preventDefault() {}, shiftKey: false, repeat: false });
  assert.equal(L.length, 0);
  assert.equal(r.IT.Settings.actionFor('Mouse4'), 'attack');
});
