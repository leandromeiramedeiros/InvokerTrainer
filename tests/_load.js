'use strict';
// Loads classic browser scripts (IIFE on `window||globalThis`) into one vm context and returns its IT namespace.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

module.exports = function load(files) {
  const ctx = vm.createContext({ console, Math, JSON, Date, Map, Set, Array, Object, Number, String, Boolean, Error, Symbol, Promise, Float32Array, Float64Array, Int8Array, Int16Array, Int32Array, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray, Infinity, NaN, isFinite, isNaN, parseInt, parseFloat });
  // v6 item 27: the ranked chasers think through IT.Belief (js/sim/belief.js, loaded right after units.js in index.html): a scenario
  // harness (units + ranked) gets it too, so tests run what the game runs
  if (files.indexOf('js/sim/units.js') >= 0 && files.indexOf('js/sim/ranked.js') >= 0 && files.indexOf('js/sim/belief.js') < 0) {
    files = files.slice(); files.splice(files.indexOf('js/sim/units.js') + 1, 0, 'js/sim/belief.js');
  }
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.IT;
};
