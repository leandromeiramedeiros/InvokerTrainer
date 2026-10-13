'use strict';
// Show FPS setting + fog (always-on shader, no settings): defaults, merge validation, worldFog, render counter, i18n parity.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const load = require('./_load');

function rig(raw) {
  const store = { 'it2.settings': raw };
  const ctx = vm.createContext({ console, Math, JSON, Date, Map, Set, Array, Object, Number, String, Boolean, Error, Symbol, Promise, Infinity, NaN, isFinite, isNaN, parseInt, parseFloat,
    Float32Array, Uint8Array, addEventListener() {}, localStorage: { getItem: k => store[k] == null ? null : store[k], setItem: (k, v) => { store[k] = v; } } });
  vm.runInContext('globalThis.IT = { UI: { toast() {} } };', ctx);
  for (const f of ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/i18n.js', 'js/ui/settings.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
  return ctx.IT;
}


test('defaults: showFps off; merge keeps booleans, rejects other types; no fog settings exist', () => {
  const d = rig(null).Settings.get();
  assert.equal(d.showFps, false); assert.ok(!('fogShade' in d)); assert.ok(!('fogOfWar' in d));
  assert.equal(rig(JSON.stringify({ showFps: true })).Settings.get().showFps, true);
  const b = rig(JSON.stringify({ showFps: 'yes', fogShade: false, fogOfWar: false })).Settings.get();
  assert.equal(b.showFps, false); assert.ok(!('fogShade' in b)); assert.ok(!('fogOfWar' in b));
});

test('fog: shader always on (no setting); only the Free Play loadout checkbox turns fog off', () => {
  const rd = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.doesNotMatch(rd('js/ui/settings.js'), /fogShade|fogOfWar/);
  assert.doesNotMatch(rd('js/render/render.js'), /fogShade/);
  const IT = load(['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/sim/util.js', 'js/sim/world.js', 'js/sim/ranked.js']);
  const R = IT.Ranked;
  assert.equal(R.worldFog({ mode: 'sandbox' }, null), true);
  assert.equal(R.worldFog({ mode: 'sandbox', fog: false }, null), false);
  assert.equal(R.worldFog({ mode: 'ranked', fog: false }, { fog: true }), true);
});

test('render counter: counts ticks, reports ~every 500 ms, follows the rate', () => {
  const IT = load(['js/pacer.js']);
  const run = hz => { const c = IT.Pacer.counter(); let last = null; for (let i = 0; i < hz * 3; i++) { const r = c.tick(i * 1000 / hz); if (r != null) last = r; } return last; };
  assert.ok(Math.abs(run(60) - 60) < 3); assert.ok(Math.abs(run(30) - 30) < 2);
  const c = IT.Pacer.counter(); assert.equal(c.tick(0), null); assert.equal(c.tick(100), null);
});

test('i18n: v6b en/pt parity and wired', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js/data/i18n/v6b.js'), 'utf8');
  assert.equal(src.split("'set.showFps'").length - 1, 2);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), /i18n\/v6b\.js/);
});
