'use strict';
// v6: hero HUD stat boxes (core 2x2 under the portrait, secondary strip under the spells): 'hstat' icon sheet + IT.HUD.statSheet (pure).
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const load = require('./_load.js');
const ROOT = path.join(__dirname, '..');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/dotaworld.js', 'js/data/maps.js',
  'js/data/i18n.js', 'js/data/i18n/v6.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/art/art.js', 'js/art/icons.js', 'js/ui/hud.js'];
const IT = load(FILES);
const KEYS = ['dmg', 'armor', 'ms', 'as', 'amp', 'mr', 'range', 'cdr', 'hpr', 'mpr'];

function mk(items, lvl) {
  const map = IT.Map.build(IT.MAPDEF);
  const lo = IT.Loadout.normalize(Object.assign({}, IT.Loadout.default(), { items: items || [] }, lvl ? { level: lvl } : {}));
  const w = IT.World.create({ seed: 3, map, loadout: lo, fog: false, autoAttack: false });
  const sp = map.spawns.hero, hero = IT.Hero.create(w, lo, sp.x, sp.y);
  w.step();
  return { w, hero };
}

test('stat icons: 10 hand-drawn 11x11 frames, 1-px outline, <= 9 colours, same palette as the status sheet', () => {
  for (const k of KEYS) {
    const f = IT.Art.frame('hstat', 'hs_' + k);
    assert.ok(f, 'missing hs_' + k);
    assert.strictEqual(f.length, 11, k); assert.ok(f.every(r => r.length === 11), k + ' width');
    assert.ok(f.join('').includes('A'), k + ' outline');
    assert.ok(new Set(f.join('').replace(/\./g, '')).size <= 9, k + ' colours');
  }
  const a = Object.keys(IT.Art.sheets.hstat.pal).sort().join(''), b = Object.keys(IT.Art.sheets.status.pal).sort().join('');
  assert.strictEqual(a, b);
});

test('i18n: hs.* keys exist in en and pt with the same placeholders', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/data/i18n/v6.js'), 'utf8');
  const keys = [...new Set([...src.matchAll(/'(hs\.[\w.]+)'/g)].map(m => m[1]))];
  assert.ok(keys.length >= 17, 'keys ' + keys.length);
  for (const k of keys) {
    for (const l of ['en', 'pt']) {
      assert.ok(IT.I18N[l][k] != null && IT.I18N[l][k] !== '', l + ' ' + k);
    }
    const ph = s => (s.match(/\{\w+\}/g) || []).sort().join();
    assert.strictEqual(ph(IT.I18N.en[k]), ph(IT.I18N.pt[k]), k + ' placeholders');
  }
  assert.ok(IT.I18N.pt['hs.dmg'] !== IT.I18N.en['hs.dmg']);
});

test('statSheet: rows mirror the live sim fields, unsupported stats read 0 and say so', () => {
  const { hero } = mk();
  const S = IT.HUD.statSheet(hero).rows;
  for (const k of KEYS) assert.ok(S[k] && typeof S[k].txt === 'string' && typeof S[k].tip === 'string', k);
  assert.strictEqual(S.ms.txt, String(Math.round(hero.ms)));
  assert.strictEqual(S.as.txt, String(Math.round(hero.attack.as)));
  assert.strictEqual(S.armor.txt, String(Math.floor(hero.armor)));   // playtest 3: whole armor, rounded down (Dota HUD)
  assert.strictEqual(S.mr.txt, Math.round(hero.magicRes * 100) + '%');
  assert.strictEqual(S.hpr.txt, String(Math.round(hero.hpRegen * 10) / 10));
  assert.strictEqual(S.mpr.txt, String(Math.round(hero.manaRegen * 10) / 10));
  assert.strictEqual(S.dmg.txt, String(Math.round((hero.attack.min + hero.attack.max) / 2)));   // playtest 3: average (Dota HUD)
  assert.strictEqual(S.dmg.bonus, '');
  assert.strictEqual(S.amp.txt, '0%'); assert.strictEqual(S.range.txt, '0'); assert.strictEqual(S.cdr.txt, '0%');
  assert.ok(S.amp.tip.includes(IT.I18N.en['hs.none']));
  assert.ok(S.ms.tip.includes(IT.I18N.en['hs.base']));
  // optional sim fields, once they exist, are read as-is
  const S2 = IT.HUD.statSheet(Object.assign({}, hero, { spellAmp: 8, castRangeBonus: 150, cdr: 25 })).rows;
  assert.strictEqual(S2.amp.txt, '8%'); assert.strictEqual(S2.range.txt, '150'); assert.strictEqual(S2.cdr.txt, '25%');
  assert.ok(!S2.amp.tip.includes(IT.I18N.en['hs.none']));
});

test('statSheet: Wex / Exort orbs raise move+attack speed / bonus damage and are listed in the tooltip', () => {
  const { w, hero } = mk(null, 30);
  const a0 = IT.HUD.statSheet(hero).rows;
  hero.inv.orbs = ['W', 'W', 'W']; w.step();
  const a1 = IT.HUD.statSheet(hero).rows;
  assert.ok(+a1.as.txt > +a0.as.txt, 'attack speed ' + a0.as.txt + ' -> ' + a1.as.txt);
  assert.ok(+a1.ms.txt > +a0.ms.txt, 'move speed');
  assert.strictEqual(a1.as.cls, 'up'); assert.strictEqual(a1.ms.cls, 'up');
  assert.ok(a1.as.tip.includes(IT.I18N.en['hs.orbs']) && a1.ms.tip.includes('%'));
  hero.inv.orbs = ['E', 'E', 'E']; w.step();
  const a2 = IT.HUD.statSheet(hero).rows;
  assert.ok(/^\+\d/.test(a2.dmg.bonus), 'exort bonus ' + a2.dmg.bonus);
  assert.strictEqual(a2.dmg.txt, a0.dmg.txt, 'base range excludes the bonus');
  assert.ok(a2.dmg.tip.includes(IT.I18N.en['hs.orbs']));
});

test('statSheet: Alacrity on self raises attack speed and shows a damage bonus; it ends with the status', () => {
  const { w, hero } = mk(null, 30);
  const a0 = IT.HUD.statSheet(hero).rows;
  IT.Status.add(w, hero, 'alacrity', 9, { src: hero.id, ability: 'alacrity', data: { stats: { as: 100, dmg: 60 } } });
  w.step();
  const a1 = IT.HUD.statSheet(hero).rows;
  assert.strictEqual(+a1.as.txt, +a0.as.txt + 100);
  assert.strictEqual(a1.dmg.bonus, '+60');
  assert.strictEqual(a1.dmg.txt, a0.dmg.txt);
  assert.ok(a1.as.tip.includes(IT.I18N.en['status.alacrity'] || 'alacrity'));
  assert.ok(a1.as.tip.includes(IT.I18N.en['hs.at']));
  for (let i = 0; i < 30 * 10; i++) w.step();
  const a2 = IT.HUD.statSheet(hero).rows;
  assert.strictEqual(a2.as.txt, a0.as.txt); assert.strictEqual(a2.dmg.bonus, '');
});

test('statSheet: item passives are grouped under Items; slows show as a negative move-speed line', () => {
  const { w, hero } = mk(['boots'], 30);
  const rows = IT.HUD.statSheet(hero).rows;
  const sts = hero.statuses.find(s => s.type === 'itemStats');
  assert.ok(sts && sts.data && sts.data.stats, 'itemStats status');
  const st = sts.data.stats, any = ['as', 'ms', 'msPct', 'dmg', 'armor', 'hpRegen', 'manaRegen'].some(k => st[k]);
  assert.ok(any);
  assert.ok(Object.values(rows).some(r => r.tip.includes(IT.I18N.en['hs.items'])), 'items line in a tooltip');
  IT.Status.add(w, hero, 'slow', 3, { data: { pct: 0.3 } }); w.step();
  const sl = IT.HUD.statSheet(hero).rows;
  assert.ok(+sl.ms.txt < +rows.ms.txt, 'slowed');
  assert.strictEqual(sl.ms.cls, 'dn');
  assert.ok(sl.ms.tip.includes(IT.I18N.en['hs.slow']));
});

test('statSheet: a unit without an attack (or a foe unit) still returns every row', () => {
  const { w } = mk();
  const u = IT.Units.spawnDummy(w, { x: 2000, y: 2000, preset: 'standard', skin: 'pedro', behavior: 'stationary' });
  w.step();
  const rows = IT.HUD.statSheet(u).rows;
  for (const k of KEYS) assert.ok(rows[k], k);
  const bare = IT.HUD.statSheet({ statuses: [] }).rows;
  assert.strictEqual(bare.dmg.txt, '-'); assert.strictEqual(bare.ms.txt, '0');
});
