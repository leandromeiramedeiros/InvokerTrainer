'use strict';
// Shared test env for combat/units tests: loads the sim core + combat + units, stubs Orders/Vision, fake map.
const load = require('./_load.js');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js',
  'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js', 'js/sim/units.js'];

function env(opts) {
  opts = opts || {};
  const IT = load(FILES);
  const map = Object.assign({
    cover: [], blocked: () => false, losFn: () => true,
    walkable() { return true; },
  }, opts.map || {});
  IT.Vision = { los: (m, ax, ay, bx, by) => m.losFn(ax, ay, bx, by), canSee: (w, v, t) => Math.hypot(t.x - v.x, t.y - v.y) <= v.vision };
  IT.Orders = { issue(w, u, o) { if (o.type === 'stop') { u.orders.length = 0; u.path.length = 0; } else u.orders = [o]; } };
  const w = IT.World.create({ seed: opts.seed || 7, map, fog: false });
  w.ctx = IT.Values.ctx({ orbs: { quas: 1, wex: 1, exort: 1 } });
  const hero = w.add({ kind: 'hero', team: 0, x: 0, y: 0, radius: 24, vision: 1800, hp: 1000, maxHp: 1000, mana: 500, maxMana: 500, armor: 0, magicRes: 0, ms: 300, attack: null });
  w.hero = hero;
  // crude mover for stub orders: walk toward order point
  w.on('*', () => {});
  function stepMove() {
    w.step();
    for (const e of w.ents) {
      const o = e.orders && e.orders[0];
      if (!o || o.type !== 'move' || !(e.ms > 0)) continue;
      const dx = o.x - e.x, dy = o.y - e.y, d = Math.hypot(dx, dy), s = e.ms * w.dt;
      if (d <= s) { e.x = o.x; e.y = o.y; e.orders.length = 0; } else { e.x += dx / d * s; e.y += dy / d * s; }
    }
  }
  const run = n => { for (let i = 0; i < n; i++) stepMove(); };
  const evs = type => w.log.filter(e => e.type === type);
  return { IT, w, hero, map, run, evs };
}
module.exports = env;
