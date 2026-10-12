'use strict';
// Batch F: Shiva blast radius (825 + 75), huge-map arena cap (nav search box, lazy terrain chunks, lazy thumbnails), map name line i18n, F1 chip CSS.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const load = require('./_load.js');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/dotaworld.js', 'js/data/maps.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/render/pixel.js', 'js/render/terrain.js'];
const IT = load(FILES);
const iv = (id, k) => IT.Values.item(IT.GAME.ITEM_DOTA[id], k);
const plain = o => JSON.parse(JSON.stringify(o));   // vm-context objects have a foreign prototype

test('shiva: blast radius is KV blast_radius 825 + bonus_aoe 75 = 900 everywhere', () => {
  assert.strictEqual(iv('shiva', 'blast_radius'), 825);
  assert.strictEqual(iv('shiva', 'bonus_aoe'), 75);
  assert.strictEqual(IT.Items.shivaRadius(), 900);
  assert.strictEqual(IT.Items.preview('shiva').r, 900);
  assert.ok(/blast_radius'\) \+ \(v\('bonus_aoe'\) \|\| 0\)/.test(read('js/input.js')), 'rangefinder circle uses the same 900');
});

test('shiva: unit at 880 is hit, unit at 960 (past 900 + hull) is not (full ring travel)', () => {
  const map = IT.Map.build(IT.MAPDEF);
  const lo = IT.Loadout.normalize(Object.assign({}, IT.Loadout.default(), { items: ['shiva'] }));
  const w = IT.World.create({ seed: 5, map, loadout: lo, fog: false, autoAttack: false });
  const sp = map.spawns.hero, h = IT.Hero.create(w, lo, sp.x, sp.y); h.facing = 0;
  const mk = dx => IT.Units.spawnDummy(w, { x: h.x + dx, y: h.y, preset: 'standard', skin: 'pedro', behavior: 'stationary' });
  const a = mk(880), b = mk(-960);
  assert.ok(IT.Orders.issue(w, h, { type: 'cast', ability: 'shiva' }));
  for (let i = 0; i < 30 * 4; i++) w.step();
  const hits = w.log.filter(e => e.type === 'hit' && e.ability === 'shiva').map(e => e.target);
  assert.deepStrictEqual(plain(hits), [a.id]);
  assert.ok(!hits.includes(b.id));
});

test('arena cap: nav search box is the whole map on normal maps, start/goal box + margin on the huge one', () => {
  const A = IT.GAME.ARENA, N = IT.Nav;
  assert.ok(A.LAZY_TILES >= 100 * 100 && A.LAZY_TILES < 368 * 368);
  const small = IT.Maps.get('mid_river'), big = IT.Maps.get('dota');
  assert.ok(small.w * small.h <= A.LAZY_TILES && big.w * big.h > A.LAZY_TILES);
  assert.deepStrictEqual(plain(N.searchBounds(small, 10, 10, 20, 20)), { x0: 0, y0: 0, x1: small.w - 1, y1: small.h - 1 });
  const b = N.searchBounds(big, 100, 120, 130, 100), m = A.SEARCH_MARGIN;
  assert.deepStrictEqual(plain(b), { x0: 100 - m, y0: 100 - m, x1: 130 + m, y1: 120 + m });
  const c = N.searchBounds(big, 3, 3, 5, 360);   // clamped to the map
  assert.strictEqual(c.x0, 0); assert.strictEqual(c.y0, 0); assert.strictEqual(c.y1, big.h - 1);
  assert.ok((c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1) < big.w * big.h);
});

test('arena cap: paths on the whole map stay inside the search box and still arrive', () => {
  const big = IT.Maps.get('dota'), hs = big.spawns.hero, d = big.spawns.dummies[0];
  const p = IT.Nav.findPath(big, hs.x, hs.y, d.x, d.y, 24);
  assert.ok(p.length > 0, 'path found');
  const last = p[p.length - 1];
  assert.ok(Math.hypot(last.x - d.x, last.y - d.y) < big.tile * 2, 'reaches the goal');
  const sx = big.toTile(hs.x), sy = big.toTile(hs.y), gx = big.toTile(d.x), gy = big.toTile(d.y), bb = IT.Nav.searchBounds(big, sx, sy, gx, gy);
  for (const q of p) { const tx = big.toTile(q.x), ty = big.toTile(q.y); assert.ok(tx >= bb.x0 && tx <= bb.x1 && ty >= bb.y0 && ty <= bb.y1, 'waypoint in box'); }
  // an unreachable goal does not flood the world: still returns quickly with a partial path
  const t0 = Date.now(); IT.Nav.findPath(big, hs.x, hs.y, -500, -500, 24); assert.ok(Date.now() - t0 < 1500);
});

test('arena cap: nearestWalkable ring search is capped on the huge map', () => {
  const big = IT.Maps.get('dota'), p = IT.Nav.nearestWalkable(big, big.spawns.hero.x, big.spawns.hero.y);
  assert.ok(big.walkable(p.x, p.y));
  assert.ok(/NEAR_MAX/.test(read('js/sim/nav.js')));
});

test('arena cap: terrain chunk range maths (pure)', () => {
  const R = (...a) => plain(IT.Terrain.chunkRange(...a));
  assert.deepStrictEqual(R(0, 0, 480, 270, 256, 12, 12, 0), { x0: 0, y0: 0, x1: 1, y1: 1 });
  assert.deepStrictEqual(R(256, 256, 256, 256, 256, 12, 12, 0), { x0: 1, y0: 1, x1: 1, y1: 1 });
  assert.deepStrictEqual(R(1000, 1000, 480, 270, 256, 12, 12, 1), { x0: 2, y0: 2, x1: 6, y1: 5 });
  assert.deepStrictEqual(R(-50, -50, 480, 270, 256, 12, 12, 1), { x0: 0, y0: 0, x1: 2, y1: 1 });       // clamped low
  assert.deepStrictEqual(R(2900, 2900, 480, 270, 256, 12, 12, 1), { x0: 10, y0: 10, x1: 11, y1: 11 });  // clamped high
  const cs = IT.GAME.ARENA.CHUNK * 8, cw = Math.ceil(368 / IT.GAME.ARENA.CHUNK), v = R(0, 0, 480, 270, cs, cw, cw, 0);
  assert.ok((v.x1 - v.x0 + 1) * (v.y1 - v.y0 + 1) <= 4, 'a first view needs only a few chunks of ' + cw * cw);
});

test('lazy thumbnails: the map picker draws previews via IntersectionObserver / idle callback', () => {
  const src = read('js/ui/loadout.js');
  assert.ok(/function lazyThumb/.test(src) && /IntersectionObserver/.test(src) && /requestIdleCallback/.test(src));
  assert.ok(/Maps\.thumb\(id, 96, 54\)/.test(src));
  assert.ok(/thumbs\[key\]/.test(read('js/data/maps.js')), 'thumbnails are cached per id/size');
});

test('map name line: hud.map key + every map name exist in en and pt; sandbox panel and ranked meta use them', () => {
  const I = load(['js/data/game.js', 'js/data/i18n.js', 'js/data/i18n/maps.js']);
  const en = I.I18N.en, pt = I.I18N.pt;
  assert.ok(en['hud.map'] && pt['hud.map'] && en['hud.map'] !== pt['hud.map']);
  for (const m of IT.Maps.list) {
    assert.ok(en['map.' + m.id], 'en ' + m.id); assert.ok(pt['map.' + m.id], 'pt ' + m.id);
    assert.strictEqual(en['map.' + m.id], m.name.en); assert.strictEqual(pt['map.' + m.id], m.name.pt);
  }
  const hud = read('js/ui/hud.js');
  assert.ok(/R\.mapLine/.test(hud) && /hud\.map/.test(hud) && /H\.mapLabel/.test(hud));
  assert.ok(/txt\(rk\.mapName\)/.test(hud), 'scenario line keeps Lv | map | Twist');
});

test('F1 chips: spell/item icons are >= 20px with a light backplate (specificity beats .ico.mini)', () => {
  const css = read('css/hud.css');
  const m = /\.tk canvas\.ico\{([^}]*)\}/.exec(css);
  assert.ok(m, '.tk canvas.ico rule');
  assert.ok(/clamp\(2[0-9]px/.test(m[1]));
  assert.ok(/background:rgba\(255,255,255,\.08\)/.test(m[1]) && /border:1px solid rgba\(255,255,255,/.test(m[1]));
  assert.ok(/\.rkcombo \.rka canvas\{[^}]*rgba\(255,255,255,\.08\)/.test(css));
  assert.ok(/\.rkcombo \.rkc>canvas\{[^}]*rgba\(255,255,255,\.08\)/.test(css));
});
