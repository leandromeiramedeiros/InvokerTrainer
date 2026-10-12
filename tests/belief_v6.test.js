'use strict';
// v6 item 27: enemy belief model (js/sim/belief.js) + the high-ground vision rule (js/sim/vision.js). Pure, synthetic maps.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const IT = load(['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/difficulty.js', 'js/sim/util.js', 'js/sim/values.js',
  'js/sim/world.js', 'js/sim/status.js', 'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/belief.js']);
const B = IT.Belief, V = IT.Vision, DF = IT.DIFFICULTY;
const TIERS = ['ian', 'easy', 'common', 'hard', 'bambam'];

// open 40 x 40 field (tile 50), optional rows / elev overrides
function mkMap(o) {
  o = o || {};
  const rows = [], W = 40, H = 40;
  for (let y = 0; y < H; y++) rows.push((o.rows && o.rows[y]) || '.'.repeat(W));
  return IT.Map.build({ tile: 50, w: W, h: H, rows, elev: o.elev, ramp: o.ramp });
}
function fakeW(map) {
  const ev = [];
  return { t: 0, map, ev, emit(n, p) { ev.push(Object.assign({ n }, p)); }, rng: () => 0.5, ents: [] };
}
const at = (w, B0, h, sees, t) => { w.t = t; return B.observe(w, B0, h, sees); };

test('belief: seen -> lost -> predicted -> juked -> searching -> seen (reacquired), events + confidence', () => {
  const w = fakeW(mkMap()), P = B.params(DF.get('common')), b = B.create({ id: 7 }, P);
  assert.equal(b.state, 'idle');
  at(w, b, { x: 500, y: 1000 }, true, 0);
  at(w, b, { x: 532, y: 1000 }, true, 0.1);
  at(w, b, { x: 564, y: 1000 }, true, 0.2);
  assert.equal(b.state, 'seen'); assert.ok(b.vel.x > 250 && Math.abs(b.vel.y) < 1, 'velocity from sightings ' + b.vel.x);
  at(w, b, null, false, 0.25);
  assert.equal(b.state, 'lost');
  at(w, b, null, false, 0.3);
  assert.equal(b.state, 'lost', 'a beat before it commits (LOST_HOLD)');
  at(w, b, null, false, 0.2 + B.LOST_HOLD + 0.05);
  assert.equal(b.state, 'predicted');
  at(w, b, null, false, 1.2);
  assert.ok(b.pred.x > 564 + 200, 'prediction runs ahead along the last heading: ' + b.pred.x);
  assert.ok(Math.abs(b.conf - Math.pow(0.5, 1.0 / P.half)) < 1e-9, 'confidence halves every P.half s');
  B.juke(w, b);
  assert.equal(b.state, 'juked'); assert.equal(b.jukedAt, 1.2);
  at(w, b, null, false, 1.2 + P.confused * 0.5);
  assert.equal(b.state, 'juked', 'confused for P.confused s');
  at(w, b, null, false, 1.2 + P.confused + 0.01);
  assert.equal(b.state, 'searching'); assert.ok(b.search);
  const p = B.probe(w, b);
  assert.ok(p && Math.hypot(p.x - b.search.cx, p.y - b.search.cy) <= P.ringMax, 'probe on the ring');
  at(w, b, { x: 900, y: 900 }, true, 3);
  assert.equal(b.state, 'seen'); assert.equal(b.reacq, 3);
  assert.deepEqual(w.ev.map(e => e.state), ['seen', 'lost', 'predicted', 'juked', 'searching', 'seen']);
  assert.equal(w.ev[w.ev.length - 1].reacquired, true);
  assert.ok(w.ev.every(e => e.n === 'belief' && e.unit === 7));
  assert.deepEqual(B.where(b), { x: 900, y: 900, t: 3 });
});

test('belief: a vision flicker (< 0.5 s lost) is not a reacquire; never-seen stays idle', () => {
  const w = fakeW(mkMap()), b = B.create({ id: 1 }, B.params(DF.get('hard')));
  at(w, b, null, false, 0); assert.equal(b.state, 'idle'); assert.equal(B.where(b), null);
  at(w, b, { x: 500, y: 500 }, true, 0.1);
  at(w, b, null, false, 0.2);
  at(w, b, { x: 510, y: 500 }, true, 0.4);
  assert.equal(b.state, 'seen'); assert.equal(b.reacq, null);
  assert.equal(w.ev[w.ev.length - 1].reacquired, undefined);
});

test('belief: ian predicts nothing (the last-seen spot); higher tiers look further ahead', () => {
  const run = id => {
    const w = fakeW(mkMap()), b = B.create({ id: 1 }, B.params(DF.get(id)));
    at(w, b, { x: 300, y: 1000 }, true, 0); at(w, b, { x: 332, y: 1000 }, true, 0.1); at(w, b, { x: 364, y: 1000 }, true, 0.2);
    at(w, b, null, false, 0.3); at(w, b, null, false, 0.5); at(w, b, null, false, 4);
    return b.pred.x - 364;
  };
  const d = TIERS.map(run);
  assert.ok(Math.abs(d[0]) < 1e-6, 'ian = last seen ' + d[0]);
  for (let i = 1; i < d.length; i++) assert.ok(d[i] >= d[i - 1] - 1e-6, 'monotone ' + d.join(','));
  assert.ok(d[4] > d[1] + 200, d.join(','));
});

test('belief: tier params scale (look-ahead / bias up, confusion down, split + detect + re-catch at hard+)', () => {
  const P = TIERS.map(id => B.params(DF.get(id)));
  for (let i = 1; i < P.length; i++) {
    assert.ok(P[i].predict * P[i].horizon >= P[i - 1].predict * P[i - 1].horizon && P[i].bias >= P[i - 1].bias, TIERS[i]);   // look-ahead = predict x horizon
    assert.ok(P[i].confused <= P[i - 1].confused, TIERS[i] + ' confused');
  }
  for (const [i, on] of [[0, false], [1, false], [2, false], [3, true], [4, true]]) {
    assert.equal(!!P[i].split, on, TIERS[i] + ' split'); assert.equal(!!P[i].detect, on, TIERS[i] + ' detect');
    assert.equal(P[i].recatch.length > 0, on, TIERS[i] + ' recatch');
  }
  assert.deepEqual(P[4].recatch.slice().sort(), ['blink', 'forcestaff']);
  assert.deepEqual(P[3].recatch, ['forcestaff']);
});

test('belief: gap bias pulls the prediction into a treeline gap (bias > 0), straight-line otherwise', () => {
  const rows = []; rows[20] = 'T'.repeat(24) + '.' + 'T'.repeat(15);   // a treeline at row 20, one gap at x = 24
  const map = mkMap({ rows }), gap = map.center(24, 20);
  assert.ok(B.features(map).some(f => f.k === 'gap' && Math.hypot(f.x - gap.x, f.y - gap.y) < 1), 'the gap is a feature');
  const L = map.center(21, 26), vel = { x: 0, y: -325 };   // running straight up at the trees, 3 tiles left of the gap
  const pb = B.predict(map, L, vel, 1.2, B.params(DF.get('hard')));
  const p0 = B.predict(map, L, vel, 1.2, Object.assign(B.params(DF.get('hard')), { bias: 0 }));
  assert.ok(Math.hypot(pb.x - gap.x, pb.y - gap.y) < 30, 'biased guess = the gap ' + JSON.stringify(pb));
  assert.ok(Math.hypot(p0.x - gap.x, p0.y - gap.y) > 100, 'unbiased guess = straight ' + JSON.stringify(p0));
  assert.ok(Math.abs(p0.x - L.x) < 1 && p0.y > map.center(0, 20).y, 'straight guess stops at the trees');
  assert.ok(pb.alts.length >= 2 && pb.alts.length <= 3, 'alternatives for split searches');
});

test('belief: ramps are features; a still hero is predicted where it stood', () => {
  const ramp = new Uint8Array(40 * 40); ramp[10 * 40 + 10] = 1;
  const map = mkMap({ ramp });
  assert.ok(B.features(map).some(f => f.k === 'ramp'));
  const q = B.predict(map, { x: 700, y: 700 }, { x: 5, y: 0 }, 2, B.params(DF.get('bambam')));
  assert.deepEqual([q.x, q.y], [700, 700]);
});

test('belief: split searches send each chaser to a different alternative at hard+', () => {
  const rows = []; rows[20] = 'T'.repeat(24) + '.' + 'T'.repeat(15);
  const map = mkMap({ rows }), P = B.params(DF.get('hard')), ps = [];
  for (const idx of [0, 1]) {
    const w = fakeW(map), b = B.create({ id: idx }, P, { idx, n: 2 }), L = map.center(21, 26);
    at(w, b, { x: L.x, y: L.y + 32 }, true, 0); at(w, b, { x: L.x, y: L.y }, true, 0.1);
    at(w, b, null, false, 0.2); at(w, b, null, false, 0.5); at(w, b, null, false, 1.3);
    ps.push(b.pred);
  }
  assert.ok(Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) >= 200, JSON.stringify(ps));
});

// ---------------------------------------------------------------- high ground (vision.js)
// columns 0-19 ground (1), 20-39 high (2); a tree row option on ground
function hgMap(o) {
  const elev = [];
  for (let y = 0; y < 40; y++) elev.push('1'.repeat(20) + '2'.repeat(20));
  return mkMap(Object.assign({ elev }, o || {}));
}
const ent = (x, y, o) => Object.assign({ id: Math.random(), x, y, team: 1, vision: 1800, statuses: [] }, o || {});

test('high ground: low cannot see high (any range), high sees low; trees block only at the viewer level', () => {
  const map = hgMap(), w = fakeW(map);
  const low = ent(map.center(18, 10).x, map.center(18, 10).y), high = ent(map.center(22, 10).x, map.center(22, 10).y, { team: 0 });
  assert.equal(V.canSee(w, low, high), false, 'low -> high: hidden even 200 u away');
  assert.equal(V.canSee(w, Object.assign({}, high, { team: 1 }), Object.assign({}, low, { team: 0 })), true, 'high -> low');
  assert.equal(V.los(map, low.x, low.y, high.x, high.y), false, 'the cliff blocks the ray from below');
  // a ground-level tree between two ground units blocks; the same tree is see-through from the high ground
  const rows = []; for (let y = 0; y < 40; y++) rows.push('.'.repeat(10) + 'T' + '.'.repeat(29));
  const mt = hgMap({ rows }), a = mt.center(5, 10), b = mt.center(15, 10), hi = mt.center(25, 10), lo2 = mt.center(5, 10);
  assert.equal(V.los(mt, a.x, a.y, b.x, b.y), false, 'same-level tree blocks');
  assert.equal(V.los(mt, hi.x, hi.y, lo2.x, lo2.y), true, 'high viewer sees over a lower tree');
});

test('high ground: true sight reveals invisibility but never gives vision up a cliff', () => {
  const map = hgMap(), w = fakeW(map);
  const gem = ent(map.center(18, 10).x, map.center(18, 10).y, { trueSight: 900 });
  const ghostLow = ent(map.center(15, 10).x, map.center(15, 10).y, { team: 0, statuses: [{ type: 'ghost' }] });
  const ghostHigh = ent(map.center(22, 10).x, map.center(22, 10).y, { team: 0, statuses: [{ type: 'ghost' }] });
  w.ents = [gem, ghostLow, ghostHigh];
  assert.equal(V.canSee(w, gem, ghostLow), true, 'gem sees the ghost on its level');
  assert.equal(V.canSee(w, gem, ghostHigh), false, 'gem does not see up the cliff');
  const blind = ent(gem.x, gem.y);
  assert.equal(V.canSee(w, blind, ghostLow), true, 'the gem carrier\'s true sight is team-wide');
  w.ents = [blind, ghostLow];
  assert.equal(V.canSee(w, blind, ghostLow), false, 'no true sight: Ghost Walk hides');
});

test('uiOn: juke scenarios force the markers; otherwise the beliefUI setting (undefined = on)', () => {
  const S0 = IT.Settings;
  try {
    const juke = { ranked: { pr: { sc: { tags: ['juke', 'fun'] } } } }, plain = { ranked: { pr: { sc: { tags: ['fog'] } } } };
    delete IT.Settings;
    assert.equal(B.uiOn(plain), true); assert.equal(B.uiOn({}), true);
    IT.Settings = { get: () => ({}) };
    assert.equal(B.uiOn(plain), true, 'undefined = on');
    IT.Settings = { get: () => ({ beliefUI: false }) };
    assert.equal(B.uiOn(plain), false);
    assert.equal(B.uiOn(juke), true, 'juke forces them');
  } finally { if (S0) IT.Settings = S0; else delete IT.Settings; }
});
