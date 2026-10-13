'use strict';
// Shared rig for input_*.test.js: real sim + IT.Input bound to a fake canvas; window listeners are recorded in rig.W.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/i18n.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/render/camera.js', 'js/ui/settings.js', 'js/sim/pick.js', 'js/input.js'];
const SRC = FILES.map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);
const CODES = { q: 'KeyQ', w: 'KeyW', e: 'KeyE', r: 'KeyR', d: 'KeyD', f: 'KeyF', a: 'KeyA', s: 'KeyS', h: 'KeyH', v: 'KeyV', z: 'KeyZ', ' ': 'Space', Escape: 'Escape' };

function load(W) {
  const ctx = vm.createContext({ console, Math, JSON, Date, Map, Set, Array, Object, Number, String, Boolean, Error, Symbol, Promise, Infinity, NaN, isFinite, isNaN, parseInt, parseFloat,
    Float32Array, Float64Array, Int8Array, Int16Array, Int32Array, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray,
    addEventListener(t, f, cap) { (W[t] = W[t] || []).push({ f, cap }); }, removeEventListener(t, f) { if (W[t]) W[t] = W[t].filter(x => x.f !== f); }, innerWidth: 1000, innerHeight: 600 });
  vm.runInContext('globalThis.IT = { UI: { toast() {} } };', ctx);
  for (const [f, s] of SRC) vm.runInContext(s, ctx, { filename: f });
  return ctx.IT;
}

// o: dist, side, items, scepter, autoAttack, map, castMode
function rig(o) {
  o = o || {};
  const W = {}, IT = load(W), In = IT.Input;
  if (o.castMode) IT.Settings.data.castMode = o.castMode;
  const map = o.map ? IT.Map.build(IT.MAPDEF) : null;
  const lo = Object.assign(IT.Loadout.default(), { heroLevel: 30, orbs: { quas: 8, wex: 8, exort: 8 }, items: o.items || [] });
  if (o.scepter) { lo.scepter = true; lo.scepterOrb = o.scepterOrb || 'exort'; }
  const w = IT.World.create({ seed: 5, fog: false, autoAttack: o.autoAttack !== false, map: map || undefined, loadout: IT.Loadout.normalize(lo) });
  const sp = map ? map.spawns.hero : { x: 4000, y: 2000 };
  const h = IT.Hero.create(w, lo, sp.x, sp.y);
  h.facing = 0; h.maxMana = h.mana = 99999;
  const side = o.side == null ? 1 : o.side;
  const dummy = IT.Units.spawnDummy(w, { x: h.x + (o.dist || 450) * side, y: h.y, preset: 'training', skin: 'pedro', behavior: 'stationary' });
  dummy.visible = true; dummy.hp = dummy.maxHp = 1e6;
  const mw = { x: dummy.x, y: dummy.y };
  const cam = { follow: false, c: null, toWorld: () => ({ x: mw.x, y: mw.y }), toScreen: (x, y) => ({ x: x / 6, y: y / 6 }), centerOn(x, y) { cam.c = [x, y]; }, lock: false };
  const L = {};
  const cv = { addEventListener(t, f) { L[t] = f; }, removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 270, right: 480, bottom: 270 }) };
  const ctx = { w, hero: h, cam, R: { mmHit: () => null }, cv };
  const T = { ms: 0, acc: 0 }, STEP = 1000 / 30, FR = 1000 / 60;
  In.now = () => T.ms;
  In.hooks = { pause() { T.paused = (T.paused || 0) + 1; } };
  In.bind(ctx);
  In.mouse.in = true; In.win.in = true;
  const casts = [], fails = [], orders = [];
  w.on('cast', e => { if (e.unit === h.id) casts.push(e.ability); });
  w.on('fail', e => fails.push(e.reason));
  w.on('order', e => { if (e.unit === h.id) orders.push(e.order); });
  const g2 = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  const mk = (k, mods) => Object.assign({ key: k, code: CODES[k] || '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, repeat: false, target: { tagName: 'BODY' }, preventDefault() {} }, mods || {});
  const r = {
    IT, In, w, h, dummy, mw, cam, casts, fails, orders, T, L, W,
    at(ms) {
      while (T.ms < ms - 1e-9) {
        const d = Math.min(FR, ms - T.ms);
        T.ms += d; T.acc += d;
        while (T.acc >= STEP - 1e-6) { w.step(); T.acc -= STEP; }
        In.drawAim(g2);
      }
    },
    key(k, mods) { if (k === 'r' && o.freeInvoke !== false) h.inv.invokeCd = 0; const ev = mk(k, mods); In.keyDown(ev); In.keyUp(ev); },
    down(k, mods) { const ev = mk(k, mods); In.keyDown(ev); return ev; },
    up(ev) { In.keyUp(ev); },
    click(button, mods) { L.mousedown(Object.assign({ button, clientX: 240, clientY: 135, shiftKey: false, isTrusted: true, preventDefault() {} }, mods || {})); },
    winUp(button) { for (const x of W.mouseup || []) x.f({ button, isTrusted: true, preventDefault() {} }); },
    fire(type, ev) { const e = Object.assign({ defaultPrevented: false, preventDefault() { e.defaultPrevented = true; } }, ev || {}); for (const x of W[type] || []) if (x.cap) x.f(e); return e; },
  };
  return r;
}
module.exports = { rig, load };
