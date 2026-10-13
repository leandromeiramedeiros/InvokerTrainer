'use strict';
// v6 item 54: click / target boxes (IT.Pick). Geometry per kind, priority, lift, hidden units, and the real input path (select + right-click attack).
const test = require('node:test'), assert = require('node:assert');
const load = require('./_load.js'), { rig } = require('./input_rig.js');
const IT = load(['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/sim/util.js', 'js/sim/pick.js']);
const P = IT.GAME.UNIT_PX, Pk = IT.Pick;
const E = (kind, o) => Object.assign({ id: Math.random(), kind, team: kind === 'hero' || kind === 'spirit' || kind === 'ally' ? 0 : 1, x: 1000, y: 1000, radius: 24, dead: false, visible: true, statuses: [], z: 0 }, o || {});
const W = (ents, extra) => Object.assign({ ents, fog: false }, extra || {});
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6, `${m}: ${a} vs ${b}`);

// sprite [w, h, anchorX, anchorY] px; box = sprite +20 % each side, +60 % of the height over the head
const SPR = { hero: [26, 28, 13, 27], enemy: [20, 24, 10, 22], dummy: [20, 24, 10, 22], ally: [20, 24, 10, 22], spirit: [14, 16, 7, 15], roshan: [44, 46, 22, 43], pickup: [16, 20, 8, 19] };
test('item 54: box geometry per kind (padded sides, +60 % over the head, feet at the ground point)', () => {
  for (const k of ['hero', 'enemy', 'dummy', 'ally', 'spirit', 'pickup']) {
    const [w, h, ax, ay] = SPR[k], b = Pk.boxOf(E(k));
    near(b.x0, 1000 - (ax + 0.2 * w) * P, k + ' x0'); near(b.x1, 1000 + (w - ax + 0.2 * w) * P, k + ' x1');
    near(b.y0, 1000 - (ay + 0.6 * h) * P, k + ' y0'); near(b.y1, 1000 + (h - ay) * P, k + ' y1');
    assert.ok(1000 - b.y0 > (ay + 0.6 * h - 0.01) * P, k + ' taller than the sprite');
  }
  const r = Pk.boxOf(E('roshan', { team: 2 })); assert.ok(r.y0 < 1000 - 43 * P && r.x1 - r.x0 > 44 * P, 'roshan padded');
  const t = Pk.boxOf(E('tower')); assert.ok(t.y0 < 1000 - 53 * P && t.y1 > 1000, 'tower box above and below the base');
  const s = Pk.boxOf(E('dummy', { scarecrow: true })); near(s.y0, 1000 - (30 + 0.6 * 32) * P, 'scarecrow y0');
  const bk = Pk.boxOf(E('enemy', { bkb: true })), pl = Pk.boxOf(E('enemy')); assert.ok(bk.y0 < pl.y0 && bk.x1 > pl.x1, 'BKB sprite is 1.2x');
});

test('item 54: boxes follow the lift (tornado 1.7x, Eul hover >= 15 px, plain z 1x)', () => {
  const g = Pk.boxOf(E('enemy'));
  let b = Pk.boxOf(E('enemy', { z: 100, statuses: [{ type: 'lift' }] })); near(g.y0 - b.y0, 170, 'tornado'); near(g.y1 - b.y1, 170, 'tornado bottom');
  b = Pk.boxOf(E('enemy', { z: 0, statuses: [{ type: 'euls' }] })); near(g.y0 - b.y0, 15 * P, 'euls hover');
  b = Pk.boxOf(E('enemy', { z: 50 })); near(g.y0 - b.y0, 50, 'plain z');
  const u = E('enemy', { z: 100, statuses: [{ type: 'lift' }] }), w = W([u]);
  assert.strictEqual(Pk.unitAt(w, 1000, 1000 - 170 - 30 * P, {}), u, 'clickable where drawn');
  assert.strictEqual(Pk.unitAt(w, 1000, 1000 + 20, {}), null, 'not at the shadow');
});

test('item 54: priority enemy > dummy/spirit/ally > tower; ties -> nearest box centre', () => {
  const en = E('enemy', { x: 1000, y: 1000 }), du = E('dummy', { x: 1010, y: 1000 }), tw = E('tower', { x: 1000, y: 1000 }), sp = E('spirit', { x: 1000, y: 1000 });
  const y = 1000 - 15 * P;
  assert.strictEqual(Pk.unitAt(W([tw, du, en]), 1004, y, {}), en, 'enemy over dummy even though the dummy is nearer the cursor');
  assert.strictEqual(Pk.unitAt(W([tw, sp]), 1000, y, {}), sp, 'spirit over tower');
  assert.strictEqual(Pk.unitAt(W([tw]), 1000, y, {}), tw, 'tower alone');
  const a = E('dummy', { x: 900 }), b = E('dummy', { x: 1000 });
  assert.strictEqual(Pk.unitAt(W([a, b]), 960, 1000 - 10 * P, {}), b, 'tie -> nearest centre (b)');
  assert.strictEqual(Pk.unitAt(W([a, b]), 940, 1000 - 10 * P, {}), a, 'tie -> nearest centre (a)');
  assert.strictEqual(Pk.unitAt(W([tw, du, en]), 1004, y, { team: 1, ok: e => e.kind !== 'enemy' }), du, 'filter applied before ranking');
});

test('item 54: dead, undetected invisible and fog-hidden units are never pickable', () => {
  const y = 1000 - 10 * P;
  assert.strictEqual(Pk.unitAt(W([E('enemy', { dead: true })]), 1000, y, {}), null, 'dead');
  for (const type of ['invisible', 'shadowblade', 'ghost']) assert.strictEqual(Pk.unitAt(W([E('enemy', { statuses: [{ type }] })]), 1000, y, {}), null, type);
  assert.strictEqual(Pk.unitAt(W([E('enemy', { invisible: true })]), 1000, y, {}), null, 'invisible flag');
  const d = E('enemy', { statuses: [{ type: 'invisible' }, { type: 'revealed' }] });
  assert.strictEqual(Pk.unitAt(W([d]), 1000, y, {}), d, 'dusted -> pickable');
  assert.strictEqual(Pk.unitAt(W([E('enemy', { visible: false })], { fog: true }), 1000, y, {}), null, 'fog hidden');
  const f = E('enemy', { visible: true }); assert.strictEqual(Pk.unitAt(W([f], { fog: true }), 1000, y, {}), f, 'fog but seen');
  const fd = E('enemy', { visible: false }); assert.strictEqual(Pk.unitAt(W([fd], { fog: false }), 1000, y, {}), fd, 'fog off');
  assert.strictEqual(Pk.unitAt(W([E('pickup', { team: 0 })]), 1000, y, {}), null, 'pickups only on request');
});

test('item 54: input rig -- a click just above an enemy head selects it; right-click there attacks it', () => {
  const r = rig({ autoAttack: false });
  r.dummy.x += 2500;   // park the rig dummy out of the way
  const en = r.IT.Units.spawnEnemy(r.w, { x: r.h.x + 1200, y: r.h.y, preset: 'training', skin: 'pedro', behavior: 'stationary' });
  en.visible = true; en.hp = en.maxHp = 1e6;
  assert.strictEqual(en.kind, 'enemy');
  r.at(100);
  r.mw.x = en.x; r.mw.y = en.y - (22 + 12) * P;   // 12 base px above the head (head top = 22 px over the feet), outside the old hull + 70 circle
  assert.ok(Math.hypot(r.mw.x - en.x, r.mw.y - en.y) > en.radius + 70, 'old pick circle would have missed');
  r.click(0); r.winUp(0);
  assert.strictEqual(r.In.selected, en.id, 'selected');
  r.mw.y = en.y - (22 + 30) * P; r.In.selected = null; r.click(0); r.winUp(0);
  assert.notStrictEqual(r.In.selected, en.id, 'far above the box: no pick');
  r.mw.y = en.y - (22 + 12) * P; r.orders.length = 0;
  r.click(2); r.winUp(2); r.at(300);
  assert.ok(r.orders.some(o => o.type === 'attack' && o.target === en.id), 'attack order on the enemy: ' + JSON.stringify(r.orders.map(o => o.type)));
});
