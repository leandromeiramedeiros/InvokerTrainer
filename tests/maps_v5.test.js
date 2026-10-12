'use strict';
// Maps v5: >= 20 windows cut from the real extracted Dota 2 map (IT.DOTAWORLD): every one builds deterministically, hero spawn walkable,
// real towers/structures on 'S' footprints, trees inside the window, towers spawn and shoot, elevation vision rule.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/dotaworld.js', 'js/data/maps.js', 'js/data/combos.js',
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

test('at least 20 maps, grounds first, whole map present, unique ids, bilingual names', () => {
  assert.ok(ids.length >= 20, 'maps: ' + ids.length);
  assert.strictEqual(ids[0], 'grounds');
  assert.ok(ids.indexOf('dota') > 0, 'whole-map entry');
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
    assert.strictEqual(m.grid.length, m.w * m.h, id + ' grid size');
    const [hx, hy] = tileOf(m, m.spawns.hero);
    assert.ok(m.walkableTile(hx, hy), id + ' hero spawn walkable');
    const r = reach(m, hx, hy);
    let walk = 0; for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.walkableTile(x, y)) walk++;
    assert.ok(r.n / walk > (id === 'dota' ? 0.7 : 0.8), id + ' hero reaches most walkable ground: ' + (r.n / walk).toFixed(2));
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

// ---- v5: real-world windows
const D = IT.DOTAWORLD;
const decodeRow = r => { const out = []; for (const m of r.matchAll(/(.)(\d*)/g)) for (let i = 0, n = m[2] ? +m[2] : 1; i < n; i++) out.push(m[1].charCodeAt(0) - 65); return out; };

test('DOTAWORLD rows decode to exactly w*h tiles', () => {
  assert.strictEqual(D.rows.length, D.h);
  let n = 0;
  for (const r of D.rows) { const d = decodeRow(r); assert.strictEqual(d.length, D.w); n += d.length; }
  assert.strictEqual(n, D.w * D.h);
});

test('world -> tile conversion: dota_badguys_tower1_mid at (524,652)', () => {
  const t = M.worldToTile(524, 652);
  assert.deepStrictEqual([Math.floor(t[0]), Math.floor(t[1])], [194, 170]);
  const e = D.ents.tower.find(q => q.name === 'dota_badguys_tower1_mid');
  assert.deepStrictEqual([e.x, e.y], [524, 652]);
  const m = M.get('dota'), tw = m.towers.find(q => q.tx === 194 && q.ty === 170);
  assert.ok(tw, 'tower at that tile on the whole map');
  assert.strictEqual(tw.team, 1); assert.strictEqual(tw.tier, 1);
  assert.strictEqual(m.w, D.w); assert.strictEqual(m.h, D.h);
});

test('towers: real team and tier on 3x3 structure footprints; structures likewise', () => {
  let total = 0;
  for (const id of ids.slice(1)) {
    const m = M.get(id), gx = m.world.gx0, gy = m.world.gy0;
    for (const t of m.towers) {
      total++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) assert.strictEqual(m.at(t.tx + dx, t.ty + dy), 6, id + ' tower tile is S');
      const src = D.ents.tower.find(q => { const w = M.worldToTile(q.x, q.y); return Math.floor(w[0]) - gx === t.tx && Math.floor(w[1]) - gy === t.ty; });
      assert.ok(src, id + ' tower comes from a real Dota tower');
      assert.strictEqual(t.team, /goodguys/.test(src.name) ? 0 : 1, id + ' team');
      assert.strictEqual(t.tier, +/tower(\d)/.exec(src.name)[1], id + ' tier');
    }
    for (const s of m.structures) {
      assert.ok(['barracks', 'fort', 'filler', 'fountain', 'shop', 'outpost'].indexOf(s.kind) >= 0, id + ' kind');
      for (let dy = -s.hw; dy <= s.hw; dy++) for (let dx = -s.hw; dx <= s.hw; dx++) assert.strictEqual(m.at(s.tx + dx, s.ty + dy), 6, id + ' ' + s.kind + ' footprint is S');
    }
  }
  assert.ok(total >= 40, 'towers across windows: ' + total);
  assert.strictEqual(M.get('dota').towers.length, 22);
  assert.ok(M.get('dota').structures.some(s => s.kind === 'fort' && s.hw === 2));
  assert.ok(M.get('dota').structures.some(s => s.kind === 'barracks' && s.hw === 1));
});

test('trees are real entities inside the window, with Dota model names and scales', () => {
  let withTrees = 0;
  for (const id of ids.slice(1)) {
    const m = M.get(id);
    if (m.trees.length) withTrees++;
    for (const t of m.trees) {
      assert.ok(t.x >= 0 && t.y >= 0 && t.x < m.W && t.y < m.H, id + ' tree inside window');
      assert.ok(t.s >= 0.6 && t.s <= 1.05, id + ' scale ' + t.s);
      assert.ok(/tree/.test(t.m), id + ' model');
    }
  }
  assert.ok(withTrees >= 20, 'windows with trees: ' + withTrees);
  assert.ok(M.get('dota').trees.length > 2000);
});

test('Dire half: direAt follows the Dota x + y > 0 diagonal', () => {
  const m = M.get('mid_river');
  assert.strictEqual(typeof m.direAt, 'function');
  const a = m.direAt(m.w - 1, 0), b = m.direAt(0, m.h - 1);
  assert.strictEqual(a, true); assert.strictEqual(b, false);
  const d = M.get('dota');
  assert.strictEqual(d.direAt(300, 50), true); assert.strictEqual(d.direAt(50, 300), false);
});

test('maps build deterministically', () => {
  const hash = m => { let h = 7; for (let i = 0; i < m.grid.length; i++) h = (h * 31 + m.grid[i]) >>> 0; return h + ':' + m.trees.length + ':' + m.towers.length + ':' + m.structures.length + ':' + m.spawns.hero.x + ',' + m.spawns.hero.y + ':' + m.spawns.dummies.length; };
  const IT2 = load(FILES);
  for (const id of ['mid_river', 'rad_base', 'dire_highground', 'roshan_pit', 'dota']) assert.strictEqual(hash(IT2.Maps.get(id)), hash(M.get(id)), id);
});

test('the real-map regions cover rivers, high ground, a Roshan pit and tower lanes', () => {
  const tagged = tag => M.list.filter(m => m.tags.indexOf(tag) >= 0).length;
  for (const tag of ['river', 'highground', 'lowground', 'tower', 'jungle', 'choke', 'pit']) assert.ok(tagged(tag) >= 1, tag);
  assert.ok(M.get('roshan_pit').spawns.arenas.some(a => a.tags.indexOf('pit') >= 0), 'pit arena');
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
  for (const id of ids.slice(1).filter(q => q !== 'dota')) {
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
