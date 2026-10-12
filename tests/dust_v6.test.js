'use strict';
// v6 Dust of Appearance: KV radius 1050 / duration 12 / movespeed -20 / damage 25 / linger_duration 8.
// Cast hits everyone in radius once (reveal+slow 12 s, 25 magical only to units that were invisible); the cloud then lingers 8 s and
// debuffs (and damages, if invisible) newcomers once; after that nothing.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js'];
const IT = load(FILES);
const map = IT.Map.build(IT.MAPDEF);
const iv = k => IT.Values.item(IT.GAME.ITEM_DOTA.dust, k);

function mk() {
  const lo = IT.Loadout.normalize(Object.assign({}, IT.Loadout.default(), { items: ['dust'] }));
  const w = IT.World.create({ seed: 5, map, loadout: lo, fog: false, autoAttack: false });
  const sp = map.spawns.hero;
  const h = IT.Hero.create(w, lo, sp.x, sp.y);
  const enemy = (dx, dy, o) => IT.Units.spawnEnemy(w, Object.assign({ x: h.x + dx, y: h.y + dy, skin: 'pedro' }, o || {}));
  const run = s => { for (let i = 0, n = Math.round(s * 30); i < n; i++) w.step(); };
  const dustHits = u => w.log.filter(e => e.type === 'damage' && e.target === u.id && e.ability === 'dust');
  return { w, h, enemy, run, dustHits };
}
const ghost = (w, u) => IT.Status.add(w, u, 'invisible', 60, { src: u.id });

test('KV: dust radius 1050, duration 12, damage 25, linger_duration 8, movespeed -20', () => {
  assert.equal(iv('radius'), 1050); assert.equal(iv('duration'), 12); assert.equal(iv('damage'), 25);
  assert.equal(iv('linger_duration'), 8); assert.equal(iv('movespeed'), -20);
});

test('dust reveals + damages an invisible unit in radius, once; visible units are revealed but not damaged', () => {
  const { w, h, enemy, run, dustHits } = mk();
  const a = enemy(500, 0), b = enemy(0, 600);
  ghost(w, a);
  assert.ok(IT.Status.hidden(a));
  IT.Orders.issue(w, h, { type: 'cast', ability: 'dust' });
  run(0.2);
  assert.ok(IT.Status.revealed(a) && !IT.Status.hidden(a));
  assert.ok(IT.Status.revealed(b));
  assert.equal(dustHits(a).length, 1); assert.equal(dustHits(a)[0].raw, 25); assert.equal(dustHits(a)[0].dmgType, 'magical');
  assert.equal(dustHits(b).length, 0, 'visible unit takes no dust damage');
  run(5);   // still inside the cloud: no second application
  assert.equal(dustHits(a).length, 1);
  assert.ok(IT.Status.revealed(a));
  run(8);   // 12 s debuff from the cast is over (13.2 s)
  assert.ok(!IT.Status.revealed(a));
  assert.equal(dustHits(a).length, 1, 'damage once');
});

test('linger: a unit entering the cloud 3 s after the cast is revealed (and hit once), one entering 9 s after is not', () => {
  const { w, h, enemy, run, dustHits } = mk();
  const early = enemy(2500, 0), late = enemy(0, 2500);
  ghost(w, early); ghost(w, late);
  IT.Orders.issue(w, h, { type: 'cast', ability: 'dust' });
  run(0.2);
  assert.ok(!IT.Status.revealed(early) && !IT.Status.revealed(late));
  run(2.8);
  early.x = h.x + 700; early.y = h.y;
  run(0.2);
  assert.ok(IT.Status.revealed(early), 'entered at 3 s');
  assert.equal(dustHits(early).length, 1);
  const s = IT.Status.find(early, 'revealed');
  assert.ok(s.until > w.t + 11, 'full 12 s debuff from entry');
  run(5.8);   // t ~ 9 s: the cloud is gone
  late.x = h.x; late.y = h.y + 700;
  run(1);
  assert.ok(!IT.Status.revealed(late), 'entered at 9 s');
  assert.equal(dustHits(late).length, 0);
  assert.equal(dustHits(early).length, 1);
});

test('enemy dust (same cast path) damages and reveals a ghosted hero once', () => {
  const { w, h, enemy, run, dustHits } = mk();
  const e = enemy(400, 0);
  e.items = [{ id: 'dust', cd: 0, charges: 0 }]; e.cd = e.cd || {};
  ghost(w, h);
  const hp = h.hp;
  IT.Abilities.get('dust').cast(w, e, {});
  run(0.2);
  assert.ok(IT.Status.revealed(h));
  assert.equal(dustHits(h).length, 1);
  assert.ok(h.hp < hp);
  run(3);
  assert.equal(dustHits(h).length, 1);
});
