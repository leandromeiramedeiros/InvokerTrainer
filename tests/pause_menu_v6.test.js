'use strict';
// v6: ESC pause menu buttons per mode (IT.UI.pauseItems): scored runs have no Restart / Loadout, a picked scenario has no End run.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const FILES = ['js/data/i18n.js', 'js/data/i18n/v6.js', 'js/data/i18n/v6b.js', 'js/ui/menus.js'];

function boot() {
  const doc = { createElement: () => ({}), addEventListener() {} };
  const ctx = vm.createContext({ console, Math, JSON, Date, Map, Set, Array, Object, Number, String, Boolean, Error, document: doc, addEventListener() {}, matchMedia: () => ({ matches: false }) });
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.IT;
}
const keys = (IT, kind) => Array.from(IT.UI.pauseItems(kind), i => String(i[0]));

test('free play: resume, restart, loadout, settings, end session, quit', () => {
  assert.deepStrictEqual(keys(boot(), 'free'), ['ui.resume', 'ui.restart', 'ui.loadout', 'pause.settings', 'pause.endSession', 'ui.quit']);
});
test('picked scenario: restart scenario + back to scenarios, no end run', () => {
  assert.deepStrictEqual(keys(boot(), 'scenario'), ['ui.resume', 'pause.restartScn', 'pause.scenarios', 'pause.settings', 'ui.quit']);
});
test('ranked / infinite: no restart, no loadout', () => {
  const IT = boot();
  for (const k of ['ranked', 'infinite']) assert.deepStrictEqual(keys(IT, k), ['ui.resume', 'pause.settings', 'ui.endRun', 'ui.quit'], k);
});
test('every pause label exists', () => {
  const IT = boot();
  for (const kind of ['free', 'scenario', 'ranked']) for (const k of keys(IT, kind)) {
    assert.ok(IT.hasT(k), k);
  }
});
