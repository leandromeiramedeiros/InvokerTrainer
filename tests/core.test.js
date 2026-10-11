const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');

test('world: ids, events, systems, thinkers, removal', () => {
  const IT = load(['js/sim/util.js', 'js/sim/world.js']);
  const w = IT.World.create({ seed: 7 });
  const seen = [];
  w.on('*', p => seen.push(p.type));
  const a = w.add({ kind: 'dummy', team: 1, x: 0, y: 0 });
  assert.strictEqual(a.id, 1);
  let n = 0;
  w.thinker({ x: 0, y: 0, upd: (w2, e) => ++n >= 3 });
  for (let i = 0; i < 5; i++) w.step();
  assert.strictEqual(n, 3);
  assert.strictEqual(w.ents.length, 1);
  assert.ok(Math.abs(w.t - 5 / 30) < 1e-6);
  assert.deepStrictEqual(seen, ['spawn', 'spawn', 'despawn']);
});

test('util: angDiff and rng determinism', () => {
  const IT = load(['js/sim/util.js']);
  assert.ok(Math.abs(IT.U.angDiff(3, -3) - (2 * Math.PI - 6)) < 1e-9);
  const r1 = IT.U.mulberry32(5), r2 = IT.U.mulberry32(5);
  assert.strictEqual(r1(), r2());
});
