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
  const m = IT.Camera.margins();   // overscroll clamp + visible-area centre (fx, fy)
  const ex = Math.max(-m.l, Math.min(map.W - GM.VIEW_W * P + m.r, hero.x - m.fx)), ey = Math.max(-m.t, Math.min(map.H - GM.VIEW_H * P + m.b, hero.y - m.fy));
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

// ---- overscroll: the camera pans past the map by the HUD coverage so edge units clear the bottom HUD / minimap
const K = GM.VIEW_W / GM.VIEW_W_BASE * P;   // world units per base screen unit
const visible = (cam, x, y) => { const sx = (x - cam.x) / P, sy = (y - cam.y) / P, i = IT.Camera.insets(), k = GM.VIEW_W / GM.VIEW_W_BASE; return { sx, sy, ok: sx >= i.l * k && sx <= GM.VIEW_W && sy >= i.t * k && sy <= GM.VIEW_H - i.b * k }; };

test('overscroll clamp: x may go negative up to the left margin, y up to the top margin, and past the far edges by the right / bottom margins', () => {
  const map = IT.Maps.get('grounds'), cam = IT.Camera.create(map), m = IT.Camera.margins();
  assert.ok(m.l > 0 && m.b > 0 && m.t > 0 && m.r > 0);
  cam.x = -1e9; cam.y = -1e9; cam.clamp();
  assert.ok(Math.abs(cam.x + m.l) < 1e-6 && Math.abs(cam.y + m.t) < 1e-6);
  cam.x = 1e9; cam.y = 1e9; cam.clamp();
  assert.ok(Math.abs(cam.x - (map.W - GM.VIEW_W * P + m.r)) < 1e-6 && Math.abs(cam.y - (map.H - GM.VIEW_H * P + m.b)) < 1e-6);
  // margins in world units = insets * zoom factor
  const i = IT.Camera.insets();
  assert.ok(Math.abs(m.l - (i.l + IT.Camera.PAD.l) * K) < 1e-6 && Math.abs(m.b - (i.b + IT.Camera.PAD.b) * K) < 1e-6);
});

test('insets hook (IT.HUD.insets) overrides the fallback table; bad values fall back', () => {
  const base = IT.Camera.margins().l;
  IT.HUD = { insets: () => ({ l: 200, r: 0, t: 18, b: 66 }) };
  assert.ok(IT.Camera.margins().l > base);
  IT.HUD = { insets: () => ({ l: NaN }) };
  assert.equal(IT.Camera.margins().l, base);
  delete IT.HUD;
});

test('centerOn a hero at (0,0) / bottom-left puts it inside the VISIBLE area (not under the HUD or minimap)', () => {
  for (const id of ['grounds', 'dota']) {
    const map = IT.Maps.get(id), cam = IT.Camera.create(map);
    for (const [x, y] of [[0, 0], [0, map.H], [map.W, map.H], [map.W, 0], [map.W / 2, map.H]]) {
      cam.centerOn(x, y);
      const v = visible(cam, x, y);
      assert.ok(v.ok, id + ' (' + x + ',' + y + ') at screen ' + v.sx.toFixed(1) + ',' + v.sy.toFixed(1));
    }
    cam.centerOn(0, map.H);   // bottom-left corner: the map corner sits right of the minimap and above the HUD
    assert.ok(cam.x < 0 && cam.y > map.H - GM.VIEW_H * P, 'overscrolled left and below the map');
  }
});

test('centerOn: a hero mid-map is centred horizontally, and vertically on the visible band', () => {
  const map = IT.Maps.get('dota'), cam = IT.Camera.create(map), m = IT.Camera.margins();
  cam.centerOn(map.W / 2, map.H / 2);
  assert.ok(Math.abs((map.W / 2 - cam.x) - m.fx) < 1e-6 && Math.abs((map.H / 2 - cam.y) - m.fy) < 1e-6);
  assert.ok(m.fy < GM.VIEW_H * P / 2, 'visible band centre is above the raw centre');
});

test('minimap click near the map edge is reachable (every minimap pixel maps to a centred camera inside the clamp)', () => {
  const map = IT.Maps.get('dota'), cam = IT.Camera.create(map), m = IT.Camera.margins();
  for (const fx of [0, 0.01, 0.5, 0.99, 1]) for (const fy of [0, 0.01, 0.5, 0.99, 1]) {
    const x = fx * map.W, y = fy * map.H;
    cam.centerOn(x, y);
    const v = visible(cam, x, y);
    assert.ok(v.ok, 'click ' + fx + ',' + fy + ' -> hero at ' + v.sx.toFixed(1) + ',' + v.sy.toFixed(1));
    assert.ok(cam.x >= -m.l - 1e-6 && cam.y >= -m.t - 1e-6 && cam.x <= map.W - GM.VIEW_W * P + m.r + 1e-6 && cam.y <= map.H - GM.VIEW_H * P + m.b + 1e-6);
  }
});

test('lock-follow and glide use the same clamp: a hero in the corner ends inside the visible area', () => {
  const map = IT.Maps.get('dota'), cam = IT.Camera.create(map), hero = { x: 20, y: map.H - 20 };
  cam.lock = true;
  for (let i = 0; i < 120; i++) cam.update(1 / 60, NONE, { x: 100, y: 100, in: false, edge: null }, hero);
  assert.ok(visible(cam, hero.x, hero.y).ok, 'lock');
  const c2 = IT.Camera.create(map); c2.glideTo(hero.x, hero.y);
  for (let i = 0; i < 120; i++) c2.update(1 / 60, NONE, { x: 100, y: 100, in: false, edge: null }, null);
  assert.ok(visible(c2, hero.x, hero.y).ok, 'glide');
  // edge pan / arrow keys stop at the overscroll limit
  const c3 = IT.Camera.create(map);
  for (let i = 0; i < 600; i++) c3.update(1 / 60, new Set(['ArrowLeft', 'ArrowUp']), { x: 100, y: 100, in: false, edge: null }, null);
  const m = IT.Camera.margins();
  assert.ok(Math.abs(c3.x + m.l) < 1e-6 && Math.abs(c3.y + m.t) < 1e-6);
});

test('fog sampling outside the map (overscroll) is finite: nearest edge tile', () => {
  const IT2 = load(['js/data/game.js', 'js/render/fog.js']), map = { w: 10, h: 8 }, f = IT2.Fog.create(map);
  f.cur.fill(1.5);
  for (const [x, y] of [[-500, -500], [-3, 20], [9999, 40], [40, 9999], [-1, -1], [79, 63]]) assert.equal(f.sample(x, y), 1.5, x + ',' + y);
});
