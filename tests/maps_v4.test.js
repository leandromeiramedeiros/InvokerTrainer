'use strict';
// Maps v4: >= 20 maps carved from the Dota 2 map, every one builds, hero spawn walkable, towers spawn and shoot, elevation vision rule.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/maps.js', 'js/data/combos.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/combo.js', 'js/sim/stats.js', 'js/sim/towers.js'];
const IT = load(FILES);
const M = IT.Maps;
const ids = M.ids();

function reach(map, tx, ty) {
  const W = map.w, H = map.h, seen = new Uint8Array(W * H), q = [tx + ty * W];
  seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx] || !map.walkableTile(nx, ny)) continue;
      seen[ny * W + nx] = 1; q.push(ny * W + nx);
    }
  }
  return { seen, n: q.length };
}
const tileOf = (map, p) => [Math.floor(p.x / map.tile), Math.floor(p.y / map.tile)];

test('at least 20 maps, grounds first, unique ids, bilingual names', () => {
  assert.ok(ids.length >= 20, 'maps: ' + ids.length);
  assert.strictEqual(ids[0], 'grounds');
  assert.strictEqual(new Set(ids).size, ids.length);
  for (const m of M.list) {
    assert.ok(m.name && m.name.en && m.name.pt, m.id + ' name');
    assert.ok(m.blurb && m.blurb.en && m.blurb.pt, m.id + ' blurb');
    assert.ok(Array.isArray(m.tags) && m.tags.length > 0, m.id + ' tags');
  }
  assert.strictEqual(M.get('nope').id, 'grounds');
});

test('every map builds with a walkable hero spawn, reachable dummies and enough open ground', () => {
  for (const id of ids) {
    const m = M.get(id);
    assert.strictEqual(M.get(id), m, id + ' cached');
    assert.strictEqual(m.id, id);
    assert.ok(m.w >= 100 && m.h >= 60, id + ' size');
    const [hx, hy] = tileOf(m, m.spawns.hero);
    assert.ok(m.walkableTile(hx, hy), id + ' hero spawn walkable');
    const r = reach(m, hx, hy);
    let walk = 0; for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.walkableTile(x, y)) walk++;
    assert.ok(r.n / walk > 0.8, id + ' hero reaches most walkable ground: ' + (r.n / walk).toFixed(2));
    assert.ok(m.spawns.dummies.length >= 8, id + ' dummies');
    for (const d of m.spawns.dummies) { const [x, y] = tileOf(m, d); assert.ok(m.walkableTile(x, y) && r.seen[y * m.w + x], id + ' dummy reachable'); }
    assert.ok(m.spawns.arenas && m.spawns.arenas.length > 5, id + ' arenas');
    for (const t of m.towers) {
      assert.ok(t.team === 0 || t.team === 1, id + ' tower team');
      assert.ok(t.tier >= 1 && t.tier <= 4, id + ' tower tier');
      const el = m.elevTile(t.tx, t.ty);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) assert.strictEqual(m.elevTile(t.tx + dx, t.ty + dy), el, id + ' tower footprint flat');
    }
  }
});

test('the real-map regions cover rivers, high ground, a Roshan pit and tower lanes', () => {
  const tagged = tag => M.list.filter(m => m.tags.indexOf(tag) >= 0).length;
  for (const tag of ['river', 'highground', 'lowground', 'tower', 'jungle', 'choke', 'pit']) assert.ok(tagged(tag) >= 1, tag);
  assert.ok(M.get('rosh_pit').spawns.arenas.some(a => a.tags.indexOf('pit') >= 0), 'pit arena');
  let elev = 0;
  for (const id of ids.slice(1)) {
    const m = M.get(id); let has = [0, 0, 0];
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) has[m.elevTile(x, y)]++;
    if (has.filter(v => v > 50).length >= 2) elev++;
  }
  assert.ok(elev >= 15, 'maps with real elevation: ' + elev);
});

function mkWorld(map, fog) {
  const lo = IT.Loadout.normalize(Object.assign({}, IT.Loadout.default()));
  const w = IT.World.create({ seed: 5, map, loadout: lo, fog: !!fog, autoAttack: false });
  return { w, lo };
}

test('towers spawn from the map as visible team buildings', () => {
  let withTowers = 0;
  for (const id of ids) {
    const m = M.get(id);
    if (!m.towers.length) continue;
    withTowers++;
    const { w } = mkWorld(m);
    const out = IT.Towers.spawnAll(w, m);
    assert.strictEqual(out.length, m.towers.length, id);
    for (let i = 0; i < out.length; i++) {
      const e = out[i], t = m.towers[i];
      assert.strictEqual(e.kind, 'tower'); assert.ok(e.building); assert.ok(e.visible);
      assert.strictEqual(e.team, t.team); assert.strictEqual(e.tier, t.tier);
      assert.strictEqual(e.x, t.x); assert.strictEqual(e.y, t.y);
    }
  }
  assert.ok(withTowers >= 18, 'maps with towers: ' + withTowers);
});

test('an enemy tower shoots a hero in range on every map that has one', () => {
  let tested = 0;
  for (const id of ids) {
    const m = M.get(id), tw = m.towers.find(t => t.team === 1);
    if (!tw) continue;
    // a clear, same-level, in-sight tile 6..11 tiles away
    let spot = null;
    for (let r = 6; r <= 11 && !spot; r++) for (let a = 0; a < 32 && !spot; a++) {
      const x = Math.round(tw.tx + Math.cos(a / 32 * Math.PI * 2) * r), y = Math.round(tw.ty + Math.sin(a / 32 * Math.PI * 2) * r);
      if (!m.walkableTile(x, y) || m.at(x, y) === 5 || m.elevTile(x, y) !== m.elevTile(tw.tx, tw.ty)) continue;
      const c = m.center(x, y);
      if (IT.Vision.los(m, tw.x, tw.y, c.x, c.y)) spot = c;
    }
    assert.ok(spot, id + ' has a firing spot');
    const { w, lo } = mkWorld(m);
    IT.Towers.spawnAll(w, m);
    const h = IT.Hero.create(w, lo, spot.x, spot.y);
    const hp0 = h.hp; let shots = 0;
    w.on('towerAttack', () => { shots++; });
    for (let i = 0; i < 30 * 5; i++) w.step();
    assert.ok(shots >= 1, id + ' tower fired');
    assert.ok(h.hp < hp0, id + ' hero took damage');
    tested++;
  }
  assert.ok(tested >= 12, 'maps with an enemy tower: ' + tested);
});

test('a tower ignores a hero far out of range', () => {
  const m = M.get('dire_base'), tw = m.towers.find(t => t.team === 1);
  const { w, lo } = mkWorld(m);
  IT.Towers.spawnAll(w, m);
  const [hx, hy] = tileOf(m, m.spawns.hero);
  let far = null;
  for (let y = 4; y < m.h - 4 && !far; y++) for (let x = 4; x < m.w - 4; x++) if (m.walkableTile(x, y) && Math.hypot(x - tw.tx, y - tw.ty) > 24) { far = m.center(x, y); break; }
  const h = IT.Hero.create(w, lo, far.x, far.y);
  let shots = 0; w.on('towerAttack', () => { shots++; });
  for (let i = 0; i < 30 * 3; i++) w.step();
  assert.strictEqual(shots, 0);
  assert.strictEqual(h.hp, h.maxHp);
  assert.ok(hx >= 0 && hy >= 0);
});

test('elevation vision: high ground is hidden from below but sees down', () => {
  let found = 0;
  for (const id of ids.slice(1)) {
    const m = M.get(id); if (found >= 3) break;
    const { w } = mkWorld(m);
    const mk = (c, team) => w.add({ kind: 'dummy', team, x: c.x, y: c.y, hp: 100, vision: 1500 });
    let pair = null;
    for (let y = 3; y < m.h - 3 && !pair; y++) for (let x = 3; x < m.w - 9 && !pair; x++) {
      for (const k of [4, 5, 6, 7, 8]) {
        const lx = x, hx = x + k;
        if (!m.walkableTile(lx, y) || !m.walkableTile(hx, y) || m.elevTile(lx, y) >= m.elevTile(hx, y)) continue;
        const a = m.center(lx, y), b = m.center(hx, y);
        if (IT.Vision.los(m, b.x, b.y, a.x, a.y)) { pair = [a, b]; break; }
      }
    }
    if (!pair) continue;
    found++;
    const low = mk(pair[0], 0), high = mk(pair[1], 1);
    assert.strictEqual(IT.Vision.canSee(w, low, high), false, id + ' low cannot see high');
    assert.strictEqual(IT.Vision.canSee(w, high, low), true, id + ' high sees low');
  }
  assert.ok(found >= 2, 'elevation pairs found: ' + found);
});
