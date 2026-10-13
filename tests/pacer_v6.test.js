'use strict';
const test = require('node:test');
const assert = require('node:assert');
const IT = require('./_load.js')(['js/pacer.js']);

const run = (hz, cap, secs = 10) => {
  const p = IT.Pacer.make(), d = 1000 / hz, n = Math.round(hz * secs); let r = 0;
  for (let i = 0; i < n; i++) if (p.step(d, cap)) r++;
  return r / secs;
};

test('pacer: 144 Hz cap 120 -> ~120 renders/s, cap 60 -> ~60', () => {
  assert.ok(Math.abs(run(144, 120) - 120) < 2, 'cap 120');
  assert.ok(Math.abs(run(144, 60) - 60) < 1.5, 'cap 60');
  assert.ok(Math.abs(run(144, 30) - 30) < 1, 'cap 30');
});
test('pacer: cap at/above the display rate and cap 0 render every frame', () => {
  assert.strictEqual(run(60, 120), 60);
  assert.strictEqual(run(60, 60), 60);
  assert.strictEqual(run(144, 0), 144);
});
test('pacer: a stall does not bank a burst of frames', () => {
  const p = IT.Pacer.make(); p.step(16.7, 60);
  p.step(500, 60);
  let r = 0; for (let i = 0; i < 6; i++) if (p.step(6.94, 60)) r++;
  assert.ok(r <= 3, 'renders after stall: ' + r);
});
