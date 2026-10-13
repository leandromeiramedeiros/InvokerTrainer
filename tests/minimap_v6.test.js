'use strict';
// v6 items 47/48/53/49: minimap pins (directional, hidden/half-alpha stealth) + belief arrow rule. Pure helpers.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const IT = load(['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js',
  'js/sim/status.js', 'js/sim/vision.js', 'js/render/render.js', 'js/render/belief.js']);
const M = IT.Minimap;
const mk = (o) => Object.assign({ x: 1000, y: 1000, team: 1, kind: 'enemy', statuses: [], hp: 100 }, o);
const W = (ents) => ({ ents });

test('pin: tip points along facing, body is a circle of radius size', () => {
  for (const f of [0, Math.PI / 2, Math.PI, -1, 2.5]) {
    const p = M.pin(10, 20, f, 2);
    assert.ok(Math.abs(p[0][0] - (10 + Math.cos(f) * 2 * M.TIP)) < 1e-9 && Math.abs(p[0][1] - (20 + Math.sin(f) * 2 * M.TIP)) < 1e-9, 'tip');
    for (let i = 1; i < p.length; i++) assert.ok(Math.abs(Math.hypot(p[i][0] - 10, p[i][1] - 20) - 2) < 1e-9, 'body on circle');
    // centroid of the body points sits behind the centre (opposite the tip)
    const cx = p.slice(1).reduce((a, q) => a + q[0], 0) / (p.length - 1) - 10, cy = p.slice(1).reduce((a, q) => a + q[1], 0) / (p.length - 1) - 20;
    assert.ok(cx * Math.cos(f) + cy * Math.sin(f) < 0, 'arc wraps behind');
  }
  assert.ok(M.pin(0, 0, 0, 3).length >= 8);
});

test('showsUnit: plain enemy / own hero / ally always; undetected stealth hidden', () => {
  assert.equal(M.showsUnit(W([]), mk()), true);
  assert.equal(M.showsUnit(W([]), mk({ team: 0, kind: 'hero', statuses: [{ type: 'ghost' }] })), true);   // own Ghost Walk
  assert.equal(M.showsUnit(W([]), mk({ team: 0, kind: 'ally' })), true);
  for (const type of ['invisible', 'invisFade', 'shadowblade']) assert.equal(M.showsUnit(W([]), mk({ statuses: [{ type }] })), false, type);
  assert.equal(M.showsUnit(W([]), mk({ invisible: true })), false);
});

test('showsUnit: dust (revealed), gem carrier radius and tower true sight detect', () => {
  const inv = () => mk({ statuses: [{ type: 'invisible' }] });
  assert.equal(M.showsUnit(W([]), mk({ statuses: [{ type: 'invisible' }, { type: 'revealed', until: 99 }] })), true, 'dust');
  const tw = { team: 0, kind: 'tower', x: 1000 + 800, y: 1000, trueSight: 860, hp: 500, vision: 1900 };
  assert.equal(M.showsUnit(W([tw]), inv()), true, 'tower 800 < 860');
  assert.equal(M.showsUnit(W([Object.assign({}, tw, { x: 1000 + 900 })]), inv()), false, 'tower 900 > 860');
  assert.equal(M.showsUnit(W([Object.assign({}, tw, { dead: true })]), inv()), false, 'dead tower');
  const gem = { team: 0, kind: 'hero', x: 1000, y: 1000 + 600, trueSight: 900, gem: true, hp: 500, vision: 1800 };
  assert.equal(M.showsUnit(W([gem]), inv()), true, 'gem');
  assert.equal(M.showsUnit(W([Object.assign({}, tw, { team: 1 })]), inv()), false, 'enemy tower does not detect its own');
});

test('unitAlpha: detected stealth enemy half-transparent, others opaque', () => {
  assert.equal(M.unitAlpha(W([]), mk()), 1);
  assert.equal(M.unitAlpha(W([]), mk({ statuses: [{ type: 'invisible' }] })), 0.5);
  assert.equal(M.unitAlpha(W([]), mk({ team: 0, kind: 'hero', statuses: [{ type: 'ghost' }] })), 1);
});

test('belief arrow: lost / predicted / searching with a distinct prediction only', () => {
  const A = IT.BeliefFX.arrowOf, base = { last: { x: 0, y: 0 }, pred: { x: 300, y: 0 } };
  for (const state of ['lost', 'predicted', 'searching']) assert.ok(A(Object.assign({ state }, base)), state);
  for (const state of ['seen', 'idle', 'juked']) assert.equal(A(Object.assign({ state }, base)), null, state);
  assert.equal(A({ state: 'predicted', last: { x: 0, y: 0 }, pred: { x: 10, y: 0 } }), null, 'no prediction distance');
});
