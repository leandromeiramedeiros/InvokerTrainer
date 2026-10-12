'use strict';
// v6 tower attack: KV attack point / rate / base attack speed / projectile, windup -> tracking projectile, windup cancel,
// cadence (no double tick from orders.js), true sight 860 vs attack range 700 on a ghosted hero. See DECISIONS.md "v6 local-install audit".
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const load = require('./_load.js');
const IT = load(['js/data/i18n.js', 'js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/dotaworld.js',
  'js/data/maps.js', 'js/data/difficulty.js', 'js/data/combos.js', 'js/data/scenarios.js', 'js/data/ranks.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/towers.js']);
const T = IT.Towers;

// a 'grounds' world: tower at the hero spawn, the hero `d` units west of it (line of sight is clear westward there)
function rig(d) {
  const lo = IT.Loadout.normalize(Object.assign({}, IT.Loadout.default()));
  const w = IT.World.create({ seed: 7, map: IT.Maps.get('grounds'), loadout: lo, fog: false, autoAttack: false });
  const sp = w.map.spawns.hero;
  const h = IT.Hero.create(w, lo, sp.x - d, sp.y); h.hp = h.maxHp = 1e6;
  const tw = T.spawn(w, { team: 1, tier: 1, x: sp.x, y: sp.y });
  const ev = [];
  for (const n of ['towerWindup', 'towerAttack', 'towerCancel']) w.on(n, p => ev.push({ n, t: w.t, target: p.target }));
  w.on('damage', p => { if (p.target === h.id) ev.push({ n: 'damage', t: w.t }); });
  return { w, h, tw, ev, sp, run: s => { for (let i = 0; i < Math.round(s / w.dt); i++) w.step(); } };
}
const of = (ev, n) => ev.filter(e => e.n === n);

test('tower KV: AttackAnimationPoint 0.6, AttackRate 0.9, BaseAttackSpeed 110, ProjectileSpeed 750, AttackRange 700', () => {
  assert.equal(T.POINT, 0.6); assert.equal(T.BAT, 0.9); assert.equal(T.AS, 110); assert.equal(T.PROJ, 750); assert.equal(T.RANGE, 700);
  assert.ok(Math.abs(T.WINDUP - 0.6 / 1.1) < 1e-12 && Math.abs(T.INTERVAL - 0.9 / 1.1) < 1e-12);
  const tw = T.spawn(IT.World.create({ seed: 1, map: IT.Maps.get('grounds'), fog: false }), { team: 1, tier: 2, x: 0, y: 0 });
  assert.equal(tw.attack.point, 0.6); assert.equal(tw.attack.bat, 0.9); assert.equal(tw.attack.as, 110); assert.equal(tw.attack.projSpeed, 750);
  // cross-check against the bake cache (local build 6957) when it is on disk (tools/.cache is not committed)
  const dir = path.join(__dirname, '..', 'tools', '.cache');
  const f = fs.existsSync(dir) && fs.readdirSync(dir).map(d => path.join(dir, d, 'npc_units.txt')).find(p => fs.existsSync(p));
  if (!f) return;
  const txt = fs.readFileSync(f, 'utf8'), re = /^\t"(npc_dota_(?:good|bad)guys_tower\d(?:_\w+)?)"\s*\{([\s\S]*?)^\t\}/gm;
  const kv = (b, k) => { const m = b.match(new RegExp('"' + k + '"\\s+"([^"]*)"')); return m ? +m[1] : NaN; };
  let n = 0;
  for (let m; (m = re.exec(txt));) {
    n++;
    assert.equal(kv(m[2], 'AttackAnimationPoint'), T.POINT, m[1]); assert.equal(kv(m[2], 'AttackRate'), T.BAT, m[1]);
    assert.equal(kv(m[2], 'BaseAttackSpeed'), T.AS, m[1]); assert.equal(kv(m[2], 'ProjectileSpeed'), T.PROJ, m[1]);
    assert.equal(kv(m[2], 'AttackRange'), T.RANGE, m[1]);
  }
  assert.equal(n, 20, 'all 20 lane / base towers');
});

test('windup: the first projectile launches AttackAnimationPoint / AS after the tower acquires; nothing hits before it lands', () => {
  const r = rig(600);
  r.run(3);
  const wu = of(r.ev, 'towerWindup'), sh = of(r.ev, 'towerAttack'), dm = of(r.ev, 'damage');
  assert.ok(wu.length >= 2 && sh.length >= 2 && dm.length >= 1);
  assert.equal(wu[0].t, 0, 'acquired at once (hero in range at t 0)');
  const wind = sh[0].t - wu[0].t;
  assert.ok(wind >= T.WINDUP - 1e-9 && wind < T.WINDUP + r.w.dt + 1e-9, 'windup ' + wind.toFixed(4));
  const fly = (600 - r.h.radius * 0.5) / T.PROJ;
  assert.ok(dm[0].t >= sh[0].t + fly - r.w.dt * 2, 'first damage after the flight, at ' + dm[0].t.toFixed(3));
  assert.equal(of(r.ev, 'towerCancel').length, 0);
});

test('cadence: one attack per AttackRate / AS (0.818 s), not twice as often', () => {
  const r = rig(600);
  r.run(10);
  const sh = of(r.ev, 'towerAttack');
  const iv = (sh[sh.length - 1].t - sh[0].t) / (sh.length - 1);
  assert.ok(Math.abs(iv - T.INTERVAL) < r.w.dt, 'mean interval ' + iv.toFixed(4));
  assert.ok(sh.length >= 11 && sh.length <= 13, sh.length + ' shots in 10 s');
});

test('a hero stepping out of range during the windup is not shot; one that leaves after the launch is still hit (tracking)', () => {
  const r = rig(690);
  r.w.step();
  assert.equal(of(r.ev, 'towerWindup').length, 1);
  IT.Orders.issue(r.w, r.h, { type: 'move', x: r.sp.x - 1400, y: r.sp.y });
  r.run(3);
  assert.ok(Math.hypot(r.h.x - r.tw.x, r.h.y - r.tw.y) > T.RANGE + r.h.radius);
  assert.equal(of(r.ev, 'towerAttack').length, 0, 'no launch');
  assert.equal(of(r.ev, 'damage').length, 0, 'no damage');
  assert.equal(of(r.ev, 'towerCancel').length, 1, 'windup cancelled');
  assert.equal(r.tw.attack.wind, null);

  const q = rig(600);
  q.run(T.WINDUP + 2 * q.w.dt);
  assert.equal(of(q.ev, 'towerAttack').length, 1, 'launched');
  IT.Orders.issue(q.w, q.h, { type: 'move', x: q.sp.x - 1400, y: q.sp.y });
  q.run(2.5);
  assert.equal(of(q.ev, 'towerAttack').length, 1, 'no second shot once out of range');
  assert.equal(of(q.ev, 'damage').length, 1, 'the launched projectile tracks and hits');
});

test('the windup is cancelled when the target is lifted (Tornado) before the launch', () => {
  const r = rig(600);
  r.w.step();
  IT.Status.add(r.w, r.h, 'lift', 2, { pierce: true });
  r.run(1.5);
  assert.equal(of(r.ev, 'towerAttack').length, 0);
  assert.equal(of(r.ev, 'towerCancel').length, 1);
});

test('ghosted hero: attacked only inside true sight 860 AND attack range 700 (650 u yes, 750 u no; 900 u no even with a longer range)', () => {
  const ghost = d => { const r = rig(d); IT.Status.add(r.w, r.h, 'ghost', 30, {}); r.run(3); return r; };
  const near = ghost(650);
  assert.ok(of(near.ev, 'towerAttack').length >= 1 && of(near.ev, 'damage').length >= 1, '650 u: shot');
  const mid = ghost(750);
  assert.equal(IT.Vision.trueSighted(mid.w, 1, mid.h), true, '750 u is inside the 860 aura');
  assert.equal(of(mid.ev, 'towerWindup').length + of(mid.ev, 'towerAttack').length, 0, '750 u: out of attack range');
  // outside the aura the tower cannot target a ghost even when in its (stretched) attack range; visible, it can
  const far = rig(900); far.tw.attack.range = 1000; IT.Status.add(far.w, far.h, 'ghost', 30, {}); far.run(3);
  assert.equal(of(far.ev, 'towerWindup').length, 0, '900 u ghosted: unseen');
  const vis = rig(900); vis.tw.attack.range = 1000; vis.run(3);
  assert.ok(of(vis.ev, 'towerAttack').length >= 1, '900 u visible: shot');
});

test('ghost cast during the windup inside the aura does not cancel the shot', () => {
  const r = rig(600);
  r.w.step();
  IT.Status.add(r.w, r.h, 'ghost', 30, {});
  r.run(1);
  assert.equal(of(r.ev, 'towerCancel').length, 0);
  assert.equal(of(r.ev, 'towerAttack').length, 1);
});
