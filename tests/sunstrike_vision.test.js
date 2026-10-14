'use strict';
// Sun Strike vision: KV vision_distance 400 / vision_duration 4 = flying vision over the target from the cast, lingering past the 1.7 s
// impact until cast + 4 s. Flying = no shadowcast occlusion (trees, cliffs), no elevation rule, no pit rule (js/sim/vision.js flyShadow,
// canSee). The strike itself still deals its damage exactly once (js/sim/spells.js strike: vision thinker + damage thinker).
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const FILES = ['js/data/i18n.js', 'js/data/i18n/s3.js', 'js/data/i18n/f1.js', 'js/data/i18n/scn.js',
  'js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/dotaworld.js', 'js/data/maps.js', 'js/data/difficulty.js',
  'js/data/combos.js', 'js/data/scenarios.js', 'js/data/ranks.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/stats.js', 'js/sim/towers.js', 'js/sim/ranked.js'];
const IT = load(FILES);
const V = IT.Vision;
const step = (w, n) => { for (let i = 0; i < n; i++) w.step(); };
const sunstrikeThinkers = w => w.ents.filter(e => !e.dead && e.kind === 'thinker' && e.ability === 'sunstrike');
const visThinkers = w => w.ents.filter(e => !e.dead && e.kind === 'thinker' && e.flying);

// 40 x 40 map, tile 50. A walled pit crater (cols / rows 16-24, mouth on the north wall at cols 19-21), a column of trees at x = 5,
// and a high-ground plateau at x >= 30 (elevation 2; the rest is ground level 1).
function featureMap() {
  const rows = [], elev = [];
  for (let y = 0; y < 40; y++) {
    let s = '', e = '';
    for (let x = 0; x < 40; x++) {
      const wall = (y === 15 || y === 25) && x >= 15 && x <= 25 || (x === 15 || x === 25) && y >= 15 && y <= 25;
      s += wall && !(y === 15 && x >= 19 && x <= 21) ? '#' : (x === 5 ? 'T' : '.');
      e += x >= 30 ? '2' : '1';
    }
    rows.push(s); elev.push(e);
  }
  const map = IT.Map.build({ tile: 50, w: 40, h: 40, rows, elev });
  const tiles = [];
  for (let y = 16; y <= 24; y++) for (let x = 16; x <= 24; x++) tiles.push(y * 40 + x);
  map.setPit(tiles, 1);
  return map;
}
const C = (map, tx, ty) => map.center(tx, ty);
// a real hero (team 0, with its ctx for the Invoker levels) that sees nothing itself: only the strike's vision can reveal the target
const blindHero = (w, lo, p) => { const h = IT.Hero.create(w, lo, p.x, p.y); h.vision = 0; return h; };

test('flying vision: sees behind a tree, over a cliff and into the pit where ground vision from the same point does not', () => {
  const map = featureMap();
  const lo = IT.Loadout.normalize(Object.assign({}, IT.Loadout.default(), { heroLevel: 25 }));
  const w = IT.World.create({ seed: 3, map, loadout: lo, fog: true, autoAttack: false });
  const cases = [
    { name: 'behind the tree line', from: C(map, 8, 20), to: C(map, 2, 20) },
    { name: 'up the plateau (cliff)', from: C(map, 28, 20), to: C(map, 33, 20) },
    { name: 'into the pit from outside', from: C(map, 20, 12), to: C(map, 20, 19) },
  ];
  for (const k of cases) {
    const ground = new Uint8Array(map.w * map.h);
    V.shadow(map, ground, k.from.x, k.from.y, 400);
    assert.equal(ground[map.toTile(k.to.y) * map.w + map.toTile(k.to.x)], 0, k.name + ': ground vision does not see it');
  }
  // one cast per case in fresh worlds, so the vision of one strike cannot reveal the next case
  for (const k of cases) {
    const wk = IT.World.create({ seed: 3, map, loadout: lo, fog: true, autoAttack: false });
    IT.Abilities.get('sunstrike').cast(wk, blindHero(wk, lo, k.from), { x: k.from.x, y: k.from.y });
    step(wk, 4);
    assert.equal(V.visibleAt(wk, k.to.x, k.to.y), true, k.name + ': the flying vision reveals it');
  }
  // the vision is also what the sim asks for: a team-1 foe standing there is seen, and the unit query agrees with the fog
  const foeTarget = cases[2].to;
  const d = IT.Units.spawnDummy(w, { x: foeTarget.x, y: foeTarget.y, preset: 'training', skin: 'pedro' });
  IT.Abilities.get('sunstrike').cast(w, blindHero(w, lo, cases[2].from), { x: cases[2].from.x, y: cases[2].from.y });
  step(w, 4);
  assert.equal(d.visible, true, 'dummy inside the pit is visible through the flying vision');
});

test('flying vision: map bounds hold and a flying source is not blocked by the pit rule for the unit query', () => {
  const map = featureMap();
  const vis = new Uint8Array(map.w * map.h);
  V.flyShadow(map, vis, 0, 0, 400);   // corner: no index outside the grid
  assert.equal(vis[0], 1);
  assert.equal(vis.reduce((a, b) => a + b, 0) > 0, true);
  const src = { x: C(map, 20, 12).x, y: C(map, 20, 12).y, team: 0, vision: 400, flying: true, statuses: [] };
  const inPit = C(map, 20, 19);
  const ground = { x: src.x, y: src.y, team: 0, vision: 400, statuses: [] };
  assert.equal(V.canSee({ map, ents: [], fog: true }, ground, { x: inPit.x, y: inPit.y, team: 1, statuses: [], hp: 1 }), false, 'ground source: pit wall');
  assert.equal(V.canSee({ map, ents: [], fog: true }, src, { x: inPit.x, y: inPit.y, team: 1, statuses: [], hp: 1 }), true, 'flying source: pit ignored');
});

test('lingering vision: on from the cast through the 1.7 s impact, gone after vision_duration (4 s), the strike itself is gone at impact', () => {
  const lo = IT.Loadout.normalize(Object.assign({}, IT.Loadout.default(), { heroLevel: 25 }));
  const w = IT.World.create({ seed: 7, map: IT.Maps.get('grounds'), loadout: lo, fog: true, autoAttack: false });
  const h = IT.Hero.create(w, lo, 0, 0);
  h.vision = 0;   // blind hero: only the strike's vision can reveal the target
  const tx = 800, ty = 0;
  step(w, 1);
  assert.equal(V.visibleAt(w, tx, ty), false, 'before the cast');
  IT.Abilities.get('sunstrike').cast(w, h, { x: tx, y: ty });
  step(w, 4);   // vision refreshes at VISION_HZ (10)
  assert.equal(V.visibleAt(w, tx, ty), true, 'at the cast');
  assert.equal(sunstrikeThinkers(w).length, 1, 'the damage thinker is pending');
  step(w, 33);   // ~1.1 s
  assert.equal(V.visibleAt(w, tx, ty), true, 'before impact');
  step(w, 36);   // ~2.3 s: impact at 1.7 s has resolved
  assert.equal(sunstrikeThinkers(w).length, 0, 'the damage thinker ends at impact');
  assert.equal(visThinkers(w).length, 1, 'the vision thinker is still up after impact');
  assert.equal(V.visibleAt(w, tx, ty), true, 'vision lingers after impact');
  step(w, 36);   // ~3.5 s
  assert.equal(V.visibleAt(w, tx, ty), true, 'vision still on at 3.5 s');
  step(w, 36);   // ~4.7 s
  assert.equal(visThinkers(w).length, 0, 'the vision thinker is removed after vision_duration');
  assert.equal(V.visibleAt(w, tx, ty), false, 'vision ends after 4 s');
});

test('Sun Strike damages once: one hit, one damage event, no more after the vision lingers', () => {
  const lo = IT.Loadout.normalize(Object.assign({}, IT.Loadout.default(), { heroLevel: 25 }));
  const w = IT.World.create({ seed: 7, map: IT.Maps.get('grounds'), loadout: lo, fog: false, autoAttack: false });
  const h = IT.Hero.create(w, lo, 0, 0);
  const d = IT.Units.spawnDummy(w, { x: 600, y: 0, preset: 'training', skin: 'pedro' });
  d.hp = d.maxHp = 1e6;
  const dmg = [], hits = [];
  w.on('damage', p => { if (p.ability === 'sunstrike' && p.target === d.id) dmg.push(p); });
  w.on('hit', p => { if (p.ability === 'sunstrike' && p.target === d.id) hits.push(p); });
  const hp0 = d.hp;
  IT.Abilities.get('sunstrike').cast(w, h, { x: d.x, y: d.y });
  step(w, 3 * 30);
  const afterImpact = hp0 - d.hp;
  assert.ok(afterImpact > 0, 'the strike lands');
  step(w, 3 * 30);   // the vision keeps going to 4 s and ends; nothing else hits
  assert.equal(dmg.length, 1, 'one damage event');
  assert.equal(hits.length, 1, 'one hit event');
  assert.equal(hp0 - d.hp, afterImpact, 'no extra damage from the lingering vision');
  assert.equal(visThinkers(w).length, 0);
});
