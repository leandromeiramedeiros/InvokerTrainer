'use strict';
// v6: the camera is hard-snapped onto the hero at the first frame of EVERY round (first round after attach, every swap / redo),
// even with the mouse on the screen edge or an arrow key held; cam.lock survives.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/daynight.js', 'js/data/map.js', 'js/data/dotaworld.js', 'js/data/maps.js', 'js/data/difficulty.js', 'js/data/scenarios.js', 'js/data/ranks.js', 'js/data/i18n.js', 'js/data/i18n/s3.js', 'js/data/i18n/f1.js', 'js/data/i18n/scn.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/stats.js', 'js/sim/ranked.js', 'js/render/camera.js'];
const IT = load(FILES);
const GM = IT.GAME, P = GM.UNIT_PX, HW = GM.VIEW_W * P / 2, HH = GM.VIEW_H * P / 2;
const EDGE = { x: 0, y: 0, in: true, edge: { l: true, r: false, u: true, d: false } };   // mouse parked on the top-left edge
const NONE = new Set();

// the camera target (view centre) equals the hero, up to the map-bounds clamp
function centred(cam, hero, map) {
  const ex = Math.max(0, Math.min(map.W - GM.VIEW_W * P, hero.x - HW)), ey = Math.max(0, Math.min(map.H - GM.VIEW_H * P, hero.y - HH));
  return Math.abs(cam.x - ex) < 1e-6 && Math.abs(cam.y - ey) < 1e-6;
}

// mirrors main.js start(): world + camera on the default spawn, then run.attach (moves the hero) and snapCam
function mk(o) {
  const run = IT.Ranked.create(Object.assign({ mode: 'ranked', seed: 7 }, o || {}));
  const pr = run.next(), map = IT.Maps.get(pr.sc.map || 'grounds'), sp = map.spawns.hero;
  const w = IT.World.create({ seed: 3, map, loadout: pr.lo, fog: pr.fog, autoAttack: false });
  const hero = IT.Hero.create(w, pr.lo, sp.x, sp.y);
  const cam = IT.Camera.create(map);
  cam.centerOn(hero.x, hero.y); cam.lock = true;
  const snapCam = () => { cam.setMap(w.map); cam.snap(hero.x, hero.y); };
  const swaps = [];
  run.attach(w, () => { swaps.push(1); snapCam(); });
  snapCam();
  return { run, w, hero, cam, swaps, map: () => w.map };
}

test('first round: hero moved by attach() -> camera snapped to the new spot (was centred on the old spawn)', () => {
  let moved = 0;
  for (let seed = 1; seed < 40; seed++) {
    const m = mk({ seed }), sp = m.map().spawns.hero;
    if (Math.hypot(m.hero.x - sp.x, m.hero.y - sp.y) > 50) moved++;
    assert.ok(centred(m.cam, m.hero, m.map()), 'first frame centred, seed ' + seed);
    m.cam.update(1 / 60, NONE, EDGE, m.hero);   // mouse on the edge: the first update must not pan
    assert.ok(centred(m.cam, m.hero, m.map()), 'still centred after the first update, seed ' + seed);
    assert.equal(m.cam.lock, true);
  }
  assert.ok(moved > 0, 'some scenario starts the hero away from the map spawn');
});

test('every swap re-centres on the hero even from a drifted camera, edge pan or held arrow', () => {
  const m = mk({ seed: 11 });
  for (let r = 0; r < 7; r++) {
    for (let i = 0; i < 60; i++) m.cam.update(1 / 60, new Set(['ArrowRight', 'ArrowDown']), EDGE, m.hero);   // drift away
    m.run.skip(); m.run.tick(0.01);
    // finish the scenario: force result, then tick through the hold
    m.run.phase = 'result'; m.run.hold = 0.01; m.run.result = { ok: true };
    m.run.tick(0.02);
    assert.equal(m.swaps.length, r + 1);
    assert.ok(centred(m.cam, m.hero, m.map()), 'centred right after swap ' + r);
    m.cam.update(1 / 60, new Set(['ArrowLeft']), EDGE, m.hero);
    assert.ok(centred(m.cam, m.hero, m.map()), 'centred on the first frame of round ' + r);
    assert.equal(m.cam.lock, true, 'lock preserved');
    assert.equal(m.cam.glide, null);
    assert.equal(m.run.phase, 'countdown');
  }
});

test('redo snaps too; later frames follow normally (lock lerps, edge pan works)', () => {
  const m = mk({ seed: 5, mode: 'sandbox', scenario: IT.SCENARIOS[0].id });
  for (let i = 0; i < 30; i++) m.cam.update(1 / 60, NONE, EDGE, m.hero);
  m.run.redo();
  assert.ok(centred(m.cam, m.hero, m.map()));
  m.cam.update(1 / 60, NONE, EDGE, m.hero);
  assert.ok(centred(m.cam, m.hero, m.map()));
  m.cam.lock = false;
  const x0 = m.cam.x;
  m.cam.update(1 / 60, new Set(['ArrowRight']), { x: 100, y: 100, in: false, edge: null }, m.hero);   // second frame: manual scroll live again
  assert.notEqual(m.cam.x, x0);
});
