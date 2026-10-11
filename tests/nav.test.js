'use strict';
const test = require('node:test');
const assert = require('node:assert');
const IT = require('./_load.js')(['js/sim/util.js', 'js/sim/world.js', 'js/sim/status.js', 'js/data/game.js', 'js/data/map.js', 'js/sim/nav.js', 'js/sim/vision.js']);
const T = 48;
const mk = rows => IT.Map.build({ tile: T, w: rows[0].length, h: rows.length, rows });
const c = (tx, ty) => ({ x: tx * T + T / 2, y: ty * T + T / 2 });

test('A* goes around a tree wall', () => {
  const m = mk(['..........', '.....T....', '.....T....', '.....T....', '.....T....', '..........']);
  const a = c(1, 2), b = c(8, 2);
  const p = IT.Nav.findPath(m, a.x, a.y, b.x, b.y, 0);
  assert.ok(p.length >= 2);
  assert.strictEqual(JSON.stringify(p[p.length - 1]), JSON.stringify(b));
  let px = a.x, py = a.y;
  for (const q of p) { assert.ok(IT.Nav.lineWalkable(m, px, py, q.x, q.y)); px = q.x; py = q.y; }
});

test('no corner cutting between diagonal blockers', () => {
  const m = mk(['.....', '..T..', '.T...', '.....', '.....']);
  const a = c(1, 1), b = c(2, 2);   // diagonal squeeze between trees at (2,1) and (1,2)
  const p = IT.Nav.findPath(m, a.x, a.y, b.x, b.y, 0);
  assert.ok(p.length >= 2);
  let prev = a;
  for (const q of p) { assert.ok(IT.Nav.lineWalkable(m, prev.x, prev.y, q.x, q.y)); prev = q; }
});

test('unreachable or blocked goal ends at the nearest reachable point', () => {
  const m = mk(['....T....', '....T....', '....T....']);
  const a = c(1, 1), b = c(7, 1);
  const p = IT.Nav.findPath(m, a.x, a.y, b.x, b.y, 0);
  const e = p[p.length - 1];
  assert.ok(m.walkable(e.x, e.y));
  assert.ok(e.x < 4 * T);
  const q = IT.Nav.findPath(m, a.x, a.y, 4 * T + 24, 24, 0);   // goal inside tree
  assert.ok(m.walkable(q[q.length - 1].x, q[q.length - 1].y));
});

test('open field smooths to one segment', () => {
  const rows = []; for (let i = 0; i < 20; i++) rows.push('.'.repeat(30));
  const m = mk(rows);
  const p = IT.Nav.findPath(m, 100, 100, 1300, 800, 24);
  assert.strictEqual(p.length, 1);
  assert.strictEqual(JSON.stringify(p[0]), JSON.stringify({ x: 1300, y: 800 }));
});

test('slide along a wall', () => {
  const m = mk(['.....', '.....', 'TTTTT', '.....']);
  const e = { x: 120, y: 2 * T - 30, radius: 24 };
  const r = IT.Nav.slide(m, e, 160, 2 * T + 10);   // pushes into the wall diagonally
  assert.ok(r.x > e.x + 20);
  assert.ok(r.y <= 2 * T - 20);
  assert.ok(IT.Nav.circleFree(m, r.x, r.y, 20));
  const f = IT.Nav.slide(m, e, e.x, 5 * T);        // straight into wall: stays
  assert.ok(f.y <= 2 * T - 20);
});

test('real map: spawns walkable, dummies reachable, cover, fast paths', () => {
  const m = IT.Map.build(IT.MAPDEF);
  assert.strictEqual(m.W, 8640); assert.strictEqual(m.H, 4800);
  const h = m.spawns.hero;
  assert.ok(m.walkable(h.x, h.y));
  assert.ok(m.spawns.dummies.length >= 8);
  for (const d of m.spawns.dummies) {
    assert.ok(m.walkable(d.x, d.y));
    const p = IT.Nav.findPath(m, h.x, h.y, d.x, d.y, 24);
    assert.ok(p.length > 0);
    assert.strictEqual(JSON.stringify(p[p.length - 1]), JSON.stringify({ x: d.x, y: d.y }));
  }
  assert.ok(m.cover.length >= 30);
  assert.strictEqual(m.at(-1, 3), 2);
  // cross-map timing
  const a = m.center(8, 85), b = m.center(170, 30);
  const t0 = Date.now(); let p;
  for (let i = 0; i < 20; i++) p = IT.Nav.findPath(m, a.x, a.y, b.x, b.y, 24);
  const per = (Date.now() - t0) / 20;
  console.log('cross-map path ms/path:', per.toFixed(2), 'waypoints', p.length);
  assert.ok(per < 30);
});
