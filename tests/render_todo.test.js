'use strict';
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load');

test('fog has no memory: a tile that leaves vision goes back to the dark level', () => {
  const IT = load(['js/render/fog.js']);
  const map = { w: 4, h: 4, tile: 8 };
  const fog = IT.Fog.create(map);
  const w = { fog: true, vis: new Uint8Array(16) };
  w.vis[5] = 1;
  for (let i = 0; i < 40; i++) fog.update(w, 0.1, 0, 0, 32, 32);
  assert.strictEqual(fog.cur[5], 2);
  assert.strictEqual(fog.cur[6], 1);
  w.vis[5] = 0;
  for (let i = 0; i < 40; i++) fog.update(w, 0.1, 0, 0, 32, 32);
  assert.strictEqual(fog.cur[5], 1);
  assert.ok(!('explored' in fog));
});

test('fog off: everything at full level', () => {
  const IT = load(['js/render/fog.js']);
  const fog = IT.Fog.create({ w: 2, h: 2, tile: 8 });
  for (let i = 0; i < 40; i++) fog.update({ fog: false, vis: new Uint8Array(4) }, 0.1, 0, 0, 16, 16);
  assert.strictEqual(fog.cur[3], 2);
});
