'use strict';
const test = require('node:test');
const assert = require('node:assert');
const IT = require('./_load.js')(['js/sim/util.js', 'js/sim/world.js', 'js/sim/status.js', 'js/data/game.js', 'js/data/map.js', 'js/sim/nav.js', 'js/sim/vision.js']);
const T = 48;
const mk = rows => IT.Map.build({ tile: T, w: rows[0].length, h: rows.length, rows });
const c = (tx, ty) => ({ x: tx * T + T / 2, y: ty * T + T / 2 });
const rows = ['...............', '...............', '.....T.........', '...............', '...............'];

function setup(opts) {
  const m = mk(rows);
  const w = IT.World.create({ map: m, fog: opts && opts.fog });
  const hp = c(2, 2);
  w.hero = w.add({ kind: 'hero', team: 0, x: hp.x, y: hp.y, vision: 1000, hp: 100 });
  return { m, w };
}
const dummyAt = (w, tx, ty) => { const p = c(tx, ty); return w.add({ kind: 'dummy', team: 1, x: p.x, y: p.y, hp: 100, vision: 800 }); };

test('LOS blocked by a tree, tree tile itself fine', () => {
  const m = mk(rows);
  assert.strictEqual(IT.Vision.los(m, c(2, 2).x, c(2, 2).y, c(9, 2).x, c(9, 2).y), false);
  assert.strictEqual(IT.Vision.los(m, c(2, 2).x, c(2, 2).y, c(9, 0).x, c(9, 0).y), true);
  assert.strictEqual(IT.Vision.los(m, c(2, 2).x, c(2, 2).y, c(5, 2).x, c(5, 2).y), true);
});

test('shadowcasting hides tile behind tree but shows the tree', () => {
  const { m, w } = setup();
  w.step();
  assert.strictEqual(w.vis[2 * m.w + 5], 1);   // the tree
  assert.strictEqual(w.vis[2 * m.w + 9], 0);   // behind it
  assert.strictEqual(w.vis[0 * m.w + 9], 1);   // off to the side
  assert.strictEqual(IT.Vision.visibleAt(w, c(9, 0).x, c(9, 0).y), true);
  assert.strictEqual(IT.Vision.visibleAt(w, c(9, 2).x, c(9, 2).y), false);
});

test('dummy behind trees is hidden, lastSeen kept, visibility events', () => {
  const { w } = setup();
  const d = dummyAt(w, 9, 0);
  const ev = [];
  w.on('visibility', p => ev.push(p));
  w.step();
  assert.strictEqual(d.visible, true);
  assert.strictEqual(JSON.stringify(ev.map(e => e.visible)), JSON.stringify([true]));
  const seenT = d.lastSeen.t;
  const p = c(9, 2); d.x = p.x; d.y = p.y;
  for (let i = 0; i < 6; i++) w.step();
  assert.strictEqual(d.visible, false);
  assert.strictEqual(d.lastSeen.t, seenT);
  assert.strictEqual(d.lastSeen.y, c(9, 0).y);
  assert.strictEqual(JSON.stringify(ev.map(e => e.visible)), JSON.stringify([true, false]));
});

test('true sight radius shows unit next to hero even if tile shadowed', () => {
  const { w } = setup();
  const d = w.add({ kind: 'dummy', team: 1, x: c(2, 2).x + 100, y: c(2, 2).y, hp: 1 });
  w.step();
  assert.strictEqual(d.visible, true);
});

test('fog off: everything visible', () => {
  const { w } = setup({ fog: false });
  const d = dummyAt(w, 9, 2);
  w.step();
  assert.strictEqual(d.visible, true);
  assert.strictEqual(IT.Vision.visibleAt(w, d.x, d.y), true);
});

test('canSee: range, los, ghost; spell-vision thinker reveals', () => {
  const { w } = setup();
  const d = dummyAt(w, 9, 2), e = dummyAt(w, 9, 0);
  assert.strictEqual(IT.Vision.canSee(w, d, w.hero), false);   // hero has no... d.vision 800 but tree blocks
  assert.strictEqual(IT.Vision.canSee(w, e, w.hero), true);
  IT.Status.add(w, w.hero, 'ghost', 5, {});
  assert.strictEqual(IT.Vision.canSee(w, e, w.hero), false);
  const far = w.add({ kind: 'dummy', team: 1, x: c(2, 2).x + 2000, y: c(2, 2).y, hp: 1, vision: 800 });
  assert.strictEqual(IT.Vision.canSee(w, far, w.hero), false);
  // thinker vision
  const p = c(9, 2);
  w.thinker({ team: 0, x: p.x, y: p.y, vision: 400, upd: () => false });
  w.step();
  assert.strictEqual(d.visible, true);
});
