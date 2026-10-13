'use strict';
// v6 #76 L5: Lighting setting (off/low/medium/high), migration, GL wiring, per-level caster budgets, i18n, light culling.
const test = require('node:test'), assert = require('node:assert/strict');
const load = require('./_load');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/i18n.js', 'js/data/i18n/v6.js', 'js/render/lights.js', 'js/render/gl.js', 'js/render/render.js'];
// settings.js is loaded last into a context that already has IT.UI (see input_rig.js for the pattern)
function rig(raw) {
  const vm = require('vm'), fs = require('fs'), path = require('path');
  const store = { 'it2.settings': raw };
  const ctx = vm.createContext({ console, Math, JSON, Date, Map, Set, Array, Object, Number, String, Boolean, Error, Symbol, Promise, Infinity, NaN, isFinite, isNaN, parseInt, parseFloat,
    Float32Array, Uint8Array, addEventListener() {}, localStorage: { getItem: k => store[k] == null ? null : store[k], setItem: (k, v) => { store[k] = v; } } });
  vm.runInContext('globalThis.IT = { UI: { toast() {} } };', ctx);
  for (const f of FILES.slice(0, 6).concat(['js/render/lights.js', 'js/render/gl.js', 'js/ui/settings.js'])) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
  return { IT: ctx.IT, store };
}

test('default lighting is low; old save without the key migrates to low', () => {
  assert.equal(rig(null).IT.Settings.get().lighting, 'low');
  assert.equal(rig(JSON.stringify({ bloom: false, castMode: 'normal' })).IT.Settings.get().lighting, 'low');
  assert.equal(rig('not json').IT.Settings.get().lighting, 'low');
  assert.equal(rig(JSON.stringify({ lighting: 5 })).IT.Settings.get().lighting, 'low');
});

test('every level is accepted, unknown reads as off', () => {
  for (const lv of ['off', 'low', 'medium', 'high', 'ultra']) assert.equal(rig(JSON.stringify({ lighting: lv })).IT.Settings.get().lighting, lv);
  assert.equal(rig(JSON.stringify({ lighting: 'mega' })).IT.Settings.get().lighting, 'off');
  assert.deepEqual(Array.from(rig(null).IT.Settings.LIGHTING), ['off', 'low', 'medium', 'high', 'ultra']);
});

test('changing the setting calls IT.GL.setLighting (stubbed); applied on load via apply; no GL is safe', () => {
  const { IT, store } = rig(null);
  const calls = [];
  IT.GL.setLighting = lv => { calls.push(lv); return lv; };
  IT.Settings.set({ lighting: 'high' });
  assert.deepEqual(calls, ['high']);
  assert.equal(JSON.parse(store['it2.settings']).lighting, 'high');
  IT.Settings.replace(Object.assign(IT.Settings.defaults(), { lighting: 'medium' }));
  assert.equal(calls[calls.length - 1], 'medium');
  IT.GL = undefined;   // GL missing: apply must not throw
  assert.doesNotThrow(() => IT.Settings.set({ lighting: 'off' }));
});

test('settings.js does not read reduced-motion for lighting', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js/ui/settings.js'), 'utf8');
  assert.doesNotMatch(src.split(/\r?\n/).filter(l => /lighting/i.test(l)).join(' '), /reduced|motion/i);
  assert.doesNotMatch(require('fs').readFileSync(require('path').join(__dirname, '..', 'js/render/gl.js'), 'utf8'), /reducedMotion|prefers-reduced/);
});

test('LEVELS caster budgets: none below medium, medium 60 units only, high 120/40, ultra every tree', () => {
  const IT = load(['js/render/lights.js', 'js/render/gl.js']), L = IT.GL.LEVELS;
  assert.deepEqual([L.off.casters, L.off.trees, L.low.casters, L.low.trees], [0, 0, 0, 0]);
  assert.deepEqual([L.medium.casters, L.medium.trees, L.medium.structs], [60, 0, false]);
  assert.deepEqual([L.high.casters, L.high.trees, L.high.structs], [120, 40, true]);
  assert.ok(L.ultra.casters > L.high.casters && L.ultra.trees >= 400 && L.ultra.structs);
  assert.ok(L.medium.casters > 0 === L.medium.shadows > 0 && L.low.shadows === 0);
});

test('render.js: shadow pass reads the level budget; lightingCost shape', () => {
  const IT = load(['js/render/lights.js', 'js/render/gl.js', 'js/render/render.js']);
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js/render/render.js'), 'utf8');
  assert.match(src, /LV\.casters/); assert.match(src, /LV\.trees/);
  const c = IT.Render.lightingCost();
  assert.equal(typeof c.avg, 'number'); assert.equal(c.budget, 6); assert.equal(c.window, 60); assert.equal(c.over, false);
  const info = console.info, logs = []; console.info = m => logs.push(m);
  try {
    for (let i = 0; i < 60; i++) IT.Render.lcSample(9, 'high');
    for (let i = 0; i < 60; i++) IT.Render.lcSample(9, 'high');
  } finally { console.info = info; }
  assert.equal(logs.length, 1);   // logged once
  assert.equal(IT.Render.lightingCost().over, true);
  assert.ok(Math.abs(IT.Render.lightingCost().avg - 9) < 1e-9);
  IT.Render.lcSample(9, 'medium');   // level change resets the window, no downgrade/log
  assert.equal(logs.length, 1);
});

test('i18n: lighting keys in en and pt', () => {
  const IT = load(FILES.slice(0, 6));
  for (const lang of ['en', 'pt']) for (const k of ['set.lighting', 'set.lighting.off', 'set.lighting.low', 'set.lighting.medium', 'set.lighting.high', 'set.lighting.ultra']) {
    assert.ok(IT.I18N[lang][k] && typeof IT.I18N[lang][k] === 'string', lang + ' ' + k);
  }
  assert.notEqual(IT.I18N.pt['set.lighting'], IT.I18N.en['set.lighting']);
});

test('IT.Lights.list drops lights whose radius does not reach the view + margin', () => {
  const IT = load(['js/render/lights.js']), L = IT.Lights, cam = { x: 0, y: 0, w: 2880, h: 1620 };
  L.enabled = true; L.begin();
  const o = (x, y, radius) => ({ x, y, z: 30, r: 1, g: 1, b: 1, radius, intensity: 1 });
  L.add(o(1000, 800, 200));            // in view
  L.add(o(-250, 800, 200));            // radius 200 + margin 288 reaches x=0 -> kept
  L.add(o(-600, 800, 200));            // out of reach -> dropped
  L.add(o(1000, 5000, 300));           // far below -> dropped
  L.add(o(3200, 800, 100));            // right edge, within margin -> kept
  const xs = L.list(cam).map(p => p.x).sort((a, b) => a - b);
  assert.deepEqual(Array.from(xs), [-250, 1000, 3200]);
  L.enabled = false;
});
