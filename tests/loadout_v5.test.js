'use strict';
// Loadout v5 (batch E): Aghanim's hood picker state (IT.Agh), Free Play enemy card -> spawn specs (IT.EnemyCard), tier badges, i18n.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const PACKS = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/src="(js\/data\/i18n\/\w+\.js)"/g)].map(m => m[1]);   // index.html order: later packs override earlier ones
const FILES = ['js/data/i18n.js'].concat(PACKS, ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/dotaworld.js', 'js/data/maps.js', 'js/data/difficulty.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/stats.js', 'js/sim/towers.js', 'js/sim/ranked.js', 'js/sim/agh.js', 'js/sim/enemycard.js']);

function load(files) {
  const ctx = vm.createContext({ console, Math, JSON, Date, Map, Set, Array, Object, Number, String, Boolean, Error, Symbol, Promise, Float32Array, Float64Array, Int8Array, Int16Array, Int32Array, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray, Infinity, NaN, isFinite, isNaN, parseInt, parseFloat });
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.IT;
}
const IT = load(FILES);
const EC = IT.EnemyCard, A = IT.Agh, GM = IT.GAME, DF = IT.DIFFICULTY;

function world(mapId) {
  const map = IT.Maps.get(mapId || 'grounds'), lo = IT.Loadout.normalize(Object.assign(IT.Loadout.default(), { mode: 'sandbox' }));
  const w = IT.World.create({ seed: 5, map, loadout: lo, fog: false, autoAttack: false });
  const sp = map.spawns.hero;
  IT.Hero.create(w, lo, sp.x, sp.y);
  return { w, sp, lo, map };
}
const foes = w => w.query(e => e.kind === 'enemy');

// ------------------------------------------------------------------ F3: hood picker state
test('agh: picking Scepter / Shard only touches the four loadout fields and keeps the loadout valid', () => {
  const lo = IT.Loadout.normalize(IT.Loadout.default());
  const before = JSON.stringify(lo);
  A.setScepter(lo, true);
  assert.equal(lo.scepter, true); assert.equal(lo.scepterOrb, null);
  assert.ok(!IT.Loadout.validate(lo).ok, 'scepter without an orb is invalid until one is picked');
  A.setScepterOrb(lo, 'exort');
  assert.equal(lo.scepterOrb, 'exort'); assert.ok(IT.Loadout.validate(lo).ok);
  A.setShard(lo, true);
  assert.ok(!IT.Loadout.validate(lo).ok, 'shard without a spell is invalid');
  A.setShardSpell(lo, 'emp');
  assert.equal(lo.shardSpell, 'emp'); assert.ok(IT.Loadout.validate(lo).ok);
  const n = IT.Loadout.normalize(lo);
  assert.deepEqual([n.scepter, n.scepterOrb, n.shard, n.shardSpell], [true, 'exort', true, 'emp']);
  A.setScepter(lo, false); A.setShard(lo, false);
  assert.deepEqual([lo.scepter, lo.scepterOrb, lo.shard, lo.shardSpell], [false, null, false, null]);
  assert.equal(JSON.stringify(lo), before, 'toggling both back off restores the exact loadout');
});

test('agh: bad orb / spell ids are ignored; picking an orb or spell implies the item', () => {
  const lo = IT.Loadout.normalize(IT.Loadout.default());
  A.setScepterOrb(lo, 'nope'); A.setShardSpell(lo, 'nope');
  assert.deepEqual([lo.scepter, lo.scepterOrb, lo.shard, lo.shardSpell], [false, null, false, null]);
  A.setScepterOrb(lo, 'wex'); A.setShardSpell(lo, 'sunstrike');
  assert.deepEqual([lo.scepter, lo.scepterOrb, lo.shard, lo.shardSpell], [true, 'wex', true, 'sunstrike']);
});

test('agh: tooltips are built from the real KV numbers (no NaN, no unfilled placeholders, en + pt)', () => {
  const lo = IT.Loadout.normalize(Object.assign(IT.Loadout.default(), { scepter: true, scepterOrb: 'quas' }));
  for (const lang of ['en', 'pt']) {
    IT.lang = lang;
    const tips = [A.scepterTip(lo), A.shardTip(lo)].concat(IT.Loadout.SHARD_SPELLS.map(s => A.shardSpellTip(lo, s)));
    for (const tip of tips) { assert.ok(tip.length > 20, tip); assert.ok(!/NaN|undefined|\{\w+\}/.test(tip), lang + ': ' + tip); }
    assert.equal(A.scepterTip(lo).split('\n').length, 1 + A.scepterLines(lo).length);
  }
  IT.lang = 'en';
  const V = IT.Values, ctxS = V.ctx(Object.assign({}, lo, { scepter: true, scepterOrb: 'quas' }));
  const sun = A.scepterLines(lo).find(l => l.k === 'agh.sc.sunstrike');
  assert.equal(Number(sun.v.n), V.get(GM.SPELL_DOTA.sunstrike, 'cataclysm_count', ctxS));
  assert.ok(Number(sun.v.n) > 0 && Number(sun.v.pct) > 0);
  const inv = A.scepterLines(lo).find(l => l.k === 'agh.sc.invoke');
  assert.ok(Number(inv.v.n) > 0, 'scepter shortens the invoke cooldown');
  const emp = A.shardLine(lo, 'emp');
  assert.ok(Number(emp.v.pct) >= Number(emp.v.base), 'shard EMP burns at least as much per mana');
});

// ------------------------------------------------------------------ D3: enemy card
test('enemy card: normalize clamps count 0..5, fills five rows, migrates the legacy single behaviour', () => {
  assert.equal(EC.normalize({ count: 9 }).count, 5);
  assert.equal(EC.normalize({ count: -2 }).count, 0);
  assert.equal(EC.normalize(null).count, 0);
  const c = EC.normalize({ count: 2, behavior: 'wander', items: ['bkb', 'nope', 'bkb'], list: [{ skin: 'nope', tier: 'ianzinho', behavior: 'x', items: false }] });
  assert.equal(c.list.length, EC.MAX);
  assert.equal(c.list[0].skin, 'auto'); assert.equal(c.list[0].tier, 'ian'); assert.equal(c.list[0].behavior, 'wander'); assert.equal(c.list[0].items, false);
  assert.equal(c.list[1].behavior, 'wander', 'legacy card behaviour applies to rows without their own');
  assert.equal(c.list[1].tier, 'common'); assert.equal(c.list[1].items, true);
  assert.deepEqual(c.items, ['bkb'].filter(id => GM.ENEMY_ITEMS.includes(id)));
  assert.deepEqual(EC.normalize(c), c, 'idempotent');
  assert.equal(JSON.stringify(EC.normalize(JSON.parse(JSON.stringify(c)))), JSON.stringify(c), 'survives the localStorage round trip');
});

test('enemy card: 3 enemies get distinct skins and names, the row behaviour / tier / items, and the tier stats', () => {
  const { w, sp, lo } = world();
  const items = GM.ENEMY_ITEMS.slice(0, 2);
  const card = { count: 3, items, list: [
    { skin: 'auto', behavior: 'stationary', tier: 'ian', items: true },
    { skin: 'auto', behavior: 'wander', tier: 'common', items: false },
    { skin: 'auto', behavior: 'escape', tier: 'bambam', items: true },
  ] };
  const sps = EC.specs(card, w, sp, lo.skin);
  assert.equal(sps.length, 3);
  assert.equal(new Set(sps.map(s => s.skin)).size, 3, 'distinct skins');
  assert.equal(new Set(sps.map(s => s.name)).size, 3, 'distinct names');
  assert.equal(sps[0].skin, lo.skin, 'rotation starts at the hero skin, like ranked');
  assert.deepEqual(sps.map(s => s.behavior), ['stationary', 'wander', 'escape']);
  assert.deepEqual(sps.map(s => s.items.length), [2, 0, 2]);
  sps.forEach((s, i) => {
    const d = DF.get(card.list[i].tier);
    assert.equal(s.hp, Math.round(GM.ENEMY.hp * d.hpMul)); assert.equal(s.armor, GM.ENEMY.armor + d.armorAdd);
    assert.equal(s.telegraph, d.telegraph); assert.equal(s.awareness, d.awareness); assert.equal(s.reaction, d.reaction); assert.equal(s.dmgMul, d.dmgMul); assert.equal(s.fights, !!d.fights);
  });
  assert.ok(sps[0].hp < sps[2].hp && sps[0].reaction > sps[2].reaction, 'ian is softer and slower than bambam');
  const es = EC.spawnAll(card, w, sp, lo.skin);
  assert.equal(es.length, 3); assert.equal(foes(w).length, 3);
  es.forEach((e, i) => {
    assert.equal(e.kind, 'enemy'); assert.equal(e.skin, sps[i].skin); assert.equal(e.behavior, sps[i].behavior);
    assert.equal(e.maxHp, sps[i].hp); assert.equal(e.hp, sps[i].hp);
    assert.ok(w.map.walkable(e.x, e.y), 'on walkable ground');
  });
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(Math.hypot(es[i].x - es[j].x, es[i].y - es[j].y) > 150, 'enemies do not stack');
});

test('enemy card: explicit skins are kept, five enemies work on every map, spots are walkable and far from each other', () => {
  const card = { count: 5, list: [{ skin: GM.SKINS[2] }, {}, {}, {}, {}] };
  for (const id of IT.Maps.ids()) {
    const { w, sp, lo } = world(id);
    const sps = EC.specs(card, w, sp, lo.skin);
    assert.equal(sps.length, 5, id);
    assert.equal(sps[0].skin, GM.SKINS[2]);
    assert.equal(new Set(sps.map(s => s.name)).size, 5, id + ': every enemy has its own name (only ' + GM.SKINS.length + ' skins)');
    for (const s of sps) assert.ok(w.map.walkable(s.x, s.y), id + ' walkable');
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) assert.ok(Math.hypot(sps[i].x - sps[j].x, sps[i].y - sps[j].y) >= 100, id + ' spread');
  }
});

test('enemy card: placing at a point follows the card rows, refuses blocked ground, stops at the world cap', () => {
  const { w, sp, lo } = world();
  const card = { count: 2, list: [{ behavior: 'defend', tier: 'hard' }, { behavior: 'wander', tier: 'easy', items: false }] };
  const es = EC.spawnAll(card, w, sp, lo.skin);
  assert.equal(es.length, 2);
  const free = es.concat([w.hero]);
  const spot = (dx, dy) => { for (let r = 0; r < 12; r++) { const x = sp.x + dx + r * 40, y = sp.y + dy; if (w.map.walkable(x, y)) return { x, y }; } return null; };
  const p1 = spot(0, 300), p2 = spot(0, -300);
  assert.ok(p1 && p2);
  const a = EC.place(card, w, 2, p1.x, p1.y, lo.skin), b = EC.place(card, w, 3, p2.x, p2.y, lo.skin);
  assert.equal(a.behavior, 'defend', 'k=2 wraps back to row 0'); assert.equal(b.behavior, 'wander');
  assert.equal(a.maxHp, Math.round(GM.ENEMY.hp * DF.hard.hpMul));
  assert.equal(foes(w).length, 4);
  assert.notEqual(a.skin, es[0].skin, 'placed enemies keep rotating through skins');
  assert.equal(EC.place(card, w, 4, -99999, -99999, lo.skin), null, 'off the map / not walkable');
  let n = 0;
  while (foes(w).length < EC.WORLD_CAP && n++ < 20) assert.ok(EC.place(card, w, 10 + n, p1.x + n, p1.y, lo.skin));
  assert.equal(foes(w).length, EC.WORLD_CAP);
  assert.equal(EC.place(card, w, 99, p1.x, p1.y, lo.skin), null, 'world is full');
  assert.ok(free.length);
});

test('enemy card: with count 0 a placed enemy still uses row 1, and the scarecrow dummy is untouched', () => {
  const { w, sp, lo } = world();
  const d = IT.Units.spawnDummy(w, { x: sp.x + 200, y: sp.y, preset: 'training', skin: lo.skin });
  assert.equal(EC.spawnAll({ count: 0 }, w, sp, lo.skin).length, 0);
  const e = EC.place({ count: 0, list: [{ behavior: 'escape' }] }, w, 0, sp.x - 250, sp.y, lo.skin);
  if (e) assert.equal(e.behavior, 'escape');
  assert.equal(d.kind, 'dummy'); assert.ok(d.scarecrow, 'still a scarecrow');
});

// ------------------------------------------------------------------ C7: tier badges
test('tier badges: every level 1-10 maps to a tier, all five tiers are reachable, never decreasing', () => {
  const ts = [];
  for (let l = 1; l <= 10; l++) { const t = EC.tierOfLevel(l); assert.ok(DF.order.includes(t), t); ts.push(DF.get(t).idx); }
  for (let i = 1; i < ts.length; i++) assert.ok(ts[i] >= ts[i - 1]);
  assert.equal(new Set(ts).size, 5);
  assert.equal(EC.tierOfLevel(0), 'ian'); assert.equal(EC.tierOfLevel(99), 'bambam');
});

test('tier badges: every tier has a name and a hover text (diff.* / diffd.*) in en and pt', () => {
  for (const lang of ['en', 'pt']) {
    IT.lang = lang;
    for (const id of DF.order) {
      assert.ok(IT.hasT('diff.' + id) && IT.t('diff.' + id) !== 'diff.' + id, lang + ' diff.' + id);
      assert.ok(IT.hasT('diffd.' + id) && IT.t('diffd.' + id).length > 20, lang + ' diffd.' + id);
    }
  }
  IT.lang = 'en';
  assert.notEqual(IT.t('diffd.hard'), IT.t('diffd.bambam'));
  assert.ok(!/dumm/i.test(IT.t('diffd.easy') + IT.t('diffd.hard') + IT.t('diffd.bambam')), 'stale dummy wording replaced');
});

// ------------------------------------------------------------------ i18n
test('i18n: the e1 pack has the same keys and placeholders in en and pt', () => {
  let pack = null;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/i18n/e1.js'), 'utf8'), vm.createContext({ IT: { i18nAdd: p => { pack = p; } } }));
  assert.ok(pack && pack.en && pack.pt);
  const en = Object.keys(pack.en).sort(), pt = Object.keys(pack.pt).sort();
  assert.deepEqual(en, pt);
  for (const k of en) {
    assert.ok(pack.en[k] && pack.pt[k], k);
    assert.equal((pack.en[k].match(/\{\w+\}/g) || []).sort().join(), (pack.pt[k].match(/\{\w+\}/g) || []).sort().join(), 'placeholders ' + k);
  }
});

test('i18n: every key the new UI and sim helpers use exists', () => {
  const need = new Set();
  const grab = (file, re) => { const src = fs.readFileSync(path.join(ROOT, file), 'utf8'); for (const m of src.matchAll(re)) need.add(m[1]); };
  grab('js/ui/loadout.js', /\bt\('((?:agh|lo\.enemy|lo\.diff|lo\.lvTier|hud\.placeEnemy|diffd?)[\w.]*)'/g);
  grab('js/ui/hud.js', /\bt\('(hud\.placeEnemy[\w.]*)'/g);
  grab('js/main.js', /\bt\('(toast\.enemy[\w.]*|hud\.placeEnemy[\w.]*)'/g);
  grab('js/sim/agh.js', /\bt\('([\w.]+)'/g);
  const lo = IT.Loadout.normalize(Object.assign(IT.Loadout.default(), { scepter: true, scepterOrb: 'quas' }));
  A.scepterLines(lo).forEach(l => need.add(l.k));
  IT.Loadout.SHARD_SPELLS.forEach(s => need.add(A.shardLine(lo, s).k));
  for (const b of EC.BEHAVIORS) need.add('lo.enemy.b.' + b);
  for (const k of need) {
    if (k.endsWith('.')) continue;   // dynamic prefix (lo.enemy.b. + behaviour): covered by the loop above
    for (const lang of ['en', 'pt']) { IT.lang = lang; assert.ok(IT.hasT(k) && IT.t(k) !== k, lang + ' missing ' + k); }
  }
  IT.lang = 'en';
  assert.ok(need.size > 20, 'scanned the sources');
});

test('index.html loads the new scripts before the UI that uses them', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const at = f => html.indexOf('src="' + f + '"');
  for (const f of ['js/sim/agh.js', 'js/sim/enemycard.js', 'js/art/hood.js', 'js/data/i18n/e1.js']) { assert.ok(at(f) > 0, f); assert.ok(fs.existsSync(path.join(ROOT, f)), f); }
  assert.ok(at('js/sim/agh.js') < at('js/ui/loadout.js') && at('js/sim/enemycard.js') < at('js/ui/loadout.js') && at('js/art/hood.js') < at('js/ui/loadout.js'));
  assert.ok(at('js/sim/enemycard.js') < at('js/main.js'));
  assert.ok(at('js/data/i18n/e1.js') > at('js/data/i18n/end.js'), 'e1 overrides the stale diffd.* texts');
});
