'use strict';
// v6 items 21 + 23 + 33: one Free Play (no Combo Sandbox, P / [ removed), in-game roster (5 enemies / 3 dummies), time of day, DiffBar, pinned combo guide.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const load = require('./_load.js');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/daynight.js', 'js/data/map.js', 'js/data/dotaworld.js', 'js/data/maps.js',
  'js/data/i18n.js', 'js/data/i18n/v6.js', 'js/data/i18n/fp.js', 'js/data/combos.js', 'js/data/difficulty.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/enemycard.js', 'js/ui/hudsteps.js', 'js/ui/diffbar.js', 'js/ui/roster.js'];
const IT = load(FILES);
const R = IT.UI.Roster, DB = IT.UI.DiffBar, GD = IT.UI.Guide;
const plain = o => JSON.parse(JSON.stringify(o));
const world = () => IT.World.create({ seed: 3, fog: false, autoAttack: false, loadout: IT.Loadout.normalize(Object.assign(IT.Loadout.default(), { heroLevel: 30, orbs: { quas: 8, wex: 8, exort: 8 } })) });
const combo = id => IT.COMBOS.find(c => c.id === id);
const st0 = () => ({ orbs: [], slots: [null, null], items: [] });

// ------------------------------------------------------------------ item 23: DiffBar
test('DiffBar: 5 tiers IAN < EASY < NORMAL < HARD < BAMBAM, internal common shows NORMAL', () => {
  assert.deepStrictEqual(plain(DB.ids()), ['ian', 'easy', 'common', 'hard', 'bambam']);
  assert.strictEqual(DB.labelOf('common'), 'NORMAL');
  assert.strictEqual(DB.labelOf('bambam'), 'BAMBAM');
  assert.strictEqual(DB.norm('garbage'), 'common');
  const m = DB.model('hard');
  assert.strictEqual(m.cur, 3); assert.deepStrictEqual(plain(m.fill), [true, true, true, true, false]);
});

test('DiffBar: step is clamped, tooltips are per tier and carry the reaction time', () => {
  assert.strictEqual(DB.step('ian', -1), 'ian'); assert.strictEqual(DB.step('bambam', 1), 'bambam');
  assert.strictEqual(DB.step('easy', 1), 'common'); assert.strictEqual(DB.step('hard', -1), 'common');
  const tips = DB.ids().map(DB.tipText);
  assert.strictEqual(new Set(tips).size, 5, 'one distinct tooltip per tier');
  for (const t of tips) assert.ok(t.split('\n').length >= 3, t);
});

test('i18n: new keys exist, UI text says Dummy / Boneco, never Scarecrow', () => {
  const src = read('js/data/i18n/v6.js');
  for (const k of ['db.title', 'db.react', 'gd.pin', 'gd.unpin', 'tod.title', 'tod.day', 'tod.night', 'lo.tod.cycle', 'sbx.pane', 'ros.locked']) assert.ok(IT.hasT(k), k);
  assert.doesNotMatch(src, /scarecrow/i);
});

// ------------------------------------------------------------------ item 21: roster
test('Roster: caps 5 enemies / 3 dummies, spawn returns null at the cap, remove frees a slot', () => {
  const w = world();
  assert.deepStrictEqual(plain(R.MAX), { enemy: 5, dummy: 3 });
  for (let i = 0; i < 5; i++) assert.ok(R.spawn(w, 'enemy', 4400 + i * 60, 2000, {}), 'enemy ' + i);
  assert.strictEqual(R.spawn(w, 'enemy', 4800, 2100, {}), null); assert.strictEqual(R.canAdd(w, 'enemy'), false);
  for (let i = 0; i < 3; i++) assert.ok(R.spawn(w, 'dummy', 4400 + i * 60, 2200, {}), 'dummy ' + i);
  assert.strictEqual(R.spawn(w, 'dummy', 4800, 2300, {}), null);
  assert.strictEqual(R.count(w, 'enemy'), 5); assert.strictEqual(R.count(w, 'dummy'), 3);
  const e = R.list(w, 'enemy')[0]; assert.ok(R.remove(w, e));
  assert.strictEqual(R.count(w, 'enemy'), 4); assert.ok(R.canAdd(w, 'enemy'));
});

test('Roster: a fresh world has no enemy and no default dummy (0 enemies = none)', () => {
  const w = world();
  assert.strictEqual(R.all(w).length, 0);
  assert.strictEqual(w.ents.filter(e => e !== w.hero && e.team !== w.hero.team).length, 0);
});

test('Roster: each row gets its own skin first, difficulty only sets the tier, edit keeps ord + spot', () => {
  const w = world();
  const a = R.spawn(w, 'enemy', 4400, 2000, { tier: 'ian' }), b = R.spawn(w, 'enemy', 4500, 2000, { tier: 'bambam' });
  assert.notStrictEqual(a.ros.skin, b.ros.skin, 'next free skin');
  assert.strictEqual(a.ros.tier, 'ian'); assert.strictEqual(b.ros.tier, 'bambam');
  const ord = a.ros.ord, x = a.x, n = R.edit(w, a, { tier: 'hard' });
  assert.strictEqual(n.ros.tier, 'hard'); assert.strictEqual(n.ros.ord, ord); assert.strictEqual(n.x, x);
  assert.strictEqual(R.count(w, 'enemy'), 2);
  const d = R.spawn(w, 'dummy', 4400, 2200, {}), sk = R.skins('dummy').find(s => s.id !== d.ros.skin && !s.locked);
  assert.strictEqual(R.edit(w, d, { skin: sk.id }), d); assert.strictEqual(d.ros.skin, sk.id);
});

test('Roster: unowned skins are locked and cannot be picked; no shop loaded = all owned', () => {
  assert.ok(R.skins('enemy').every(s => !s.locked), 'no shop loaded: everything owned');
  const first = R.skins('enemy')[0].id;
  IT.Shop = { owned: skin => skin === first };
  try {
    const sk = R.skins('enemy'); assert.strictEqual(sk[0].locked, false); assert.ok(sk.slice(1).every(s => s.locked));
    const w = world(), e = R.spawn(w, 'enemy', 4400, 2000, { skin: sk[1].id });
    assert.strictEqual(e.ros.skin, first, 'locked skin request falls back to an owned one');
    assert.strictEqual(R.edit(w, e, { skin: sk[2].id }).ros.skin, first, 'edit refuses a locked skin');
  } finally { delete IT.Shop; }
});

test('Roster: resetAll puts every unit back on its spot with full health', () => {
  const w = world(), e = R.spawn(w, 'enemy', 4400, 2000, {});
  e.x += 200; e.hp = 1;
  assert.strictEqual(R.resetAll(w), 1);
  assert.strictEqual(e.x, 4400); assert.strictEqual(e.hp, e.maxHp);
});

test('Roster: time-of-day helpers (Day / Night / Cycle + slider position)', () => {
  const w = world(), C = IT.DayNight.CYCLE;
  R.todSetMode(w, 'night'); assert.strictEqual(R.todMode(w), 'night'); assert.ok(R.todPos(w) >= C);
  R.todSetMode(w, 'day'); assert.strictEqual(R.todMode(w), 'day'); assert.ok(R.todPos(w) < C);
  R.todSetPos(w, 450); assert.strictEqual(R.todMode(w), 'cycle'); assert.strictEqual(Math.round(R.todPos(w)), 450); assert.strictEqual(w.tod.night, true);
  R.todSetPos(w, 10); assert.strictEqual(w.tod.night, false);
  R.todSetPos(w, 99999); assert.strictEqual(R.todPos(w), R.todFull() - 1);
});

// ------------------------------------------------------------------ item 33: pinned guide
test('Guide: click toggles pin -> swap -> unpin, never touches w.combo / w.ranked', () => {
  const w = world(), c0 = w.combo, r0 = w.ranked;
  const g = GD.create(st0), a = combo('b_coldsnap'), b = combo('b_ghostwalk');
  assert.strictEqual(g.active(), false);
  assert.strictEqual(g.toggle(a), 'pin'); assert.ok(g.active()); assert.strictEqual(g.id, 'b_coldsnap');
  assert.strictEqual(g.toggle(b), 'swap'); assert.strictEqual(g.id, 'b_ghostwalk');
  assert.strictEqual(g.toggle(b), 'unpin'); assert.strictEqual(g.active(), false); assert.strictEqual(g.states().length, 0);
  assert.strictEqual(g.toggle(a), 'pin'); g.clear(); assert.strictEqual(g.active(), false);
  assert.strictEqual(w.combo, c0); assert.strictEqual(w.ranked, r0);
});

test('Guide: current step advances on cast, completion counts a lap, holds, then resets to step 1', () => {
  const g = GD.create(st0), cb = combo('b_coldsnap');
  g.toggle(cb);
  assert.ok(g.states().length >= 1); assert.strictEqual(g.states()[0], 'now');
  for (const s of cb.steps) if (s.ability) g.feed({ type: 'cast', ability: s.ability });
  assert.strictEqual(g.laps, 1); assert.ok(g.hold > 0); assert.ok(g.states().every(s => s === 'done'));
  g.feed({ type: 'cast', ability: 'coldsnap' }); assert.strictEqual(g.laps, 1, 'no double count while held');
  assert.strictEqual(g.tick(GD.HOLD / 2), false);
  assert.strictEqual(g.tick(GD.HOLD), true);
  assert.strictEqual(g.states()[0], 'now'); assert.strictEqual(g.hold, 0); assert.strictEqual(g.laps, 1, 'counter survives the reset');
});

test('Guide: model is only the step chain (no objective / score / timer fields)', () => {
  const g = GD.create(st0); g.toggle(combo('b_coldsnap'));
  assert.deepStrictEqual(Object.keys(g).filter(k => /score|timer|goal|objective|win|fail|spawn/i.test(k)), []);
  const acts = GD.actsOf(combo('b_coldsnap')); assert.ok(acts.length >= 1 && acts[0].k === 'spell');
});

// ------------------------------------------------------------------ settings / sources
test('P and [ hotkeys are gone: settings defaults, sources, README', () => {
  for (const f of ['js/ui/settings.js', 'js/input.js', 'js/ui/hud.js', 'js/main.js', 'js/ui/loadout.js']) assert.doesNotMatch(read(f), /resetDummies|hooks\.spawn\b|sbDummies/, f);
  assert.doesNotMatch(read('README.md'), /\| *P, *\[/);
  const S = require('./input_rig').rig().IT.Settings, c = S.defaults().keys.common;
  assert.ok(!('spawn' in c) && !('resetDummies' in c));
});

test('settings: beliefUI default on; Free Play side pane only in free sandbox', () => {
  const S = require('./input_rig').rig().IT.Settings;
  assert.strictEqual(S.defaults().beliefUI, true);
  assert.match(read('js/ui/hud.js'), /H\.hasSide\s*=\s*ctx\s*=>\s*!!ctx\s*&&\s*ctx\.mode\s*===\s*'sandbox'\s*&&\s*!!ctx\.free/);
});

test('Free Play screen: no ENEMIES panel, no Combo Sandbox card; default difficulty uses the DiffBar; files wired', () => {
  const lo = read('js/ui/loadout.js'), idx = read('index.html'), css = read('css/loadout.css');
  assert.doesNotMatch(lo, /fp\.enemies|erow|eskin|combocard|go\('combo'\)/);
  assert.match(lo, /DiffBar\.create/);
  assert.match(idx, /css\/diffbar\.css/); assert.match(idx, /js\/ui\/diffbar\.js/); assert.match(idx, /js\/ui\/roster\.js/);
  assert.doesNotMatch(css, /\.erow|\.eskin|\.combocard/);
});

// ------------------------------------------------------------------ #77 I9: Free Play rows honour the tier execution
test('I9: a roster enemy carries its tier exec + msMul (ian lenient, bambam perfect), edit re-applies the new tier', () => {
  const w = world(), D = IT.DIFFICULTY;
  const a = R.spawn(w, 'enemy', 4400, 2000, { tier: 'ian' }), b = R.spawn(w, 'enemy', 4500, 2000, { tier: 'bambam' });
  assert.deepStrictEqual(plain(a.exec), plain(D.get('ian').exec)); assert.deepStrictEqual(plain(b.exec), plain(D.get('bambam').exec));
  assert.ok(a.exec.itemP < 1 && b.exec.itemP === 1, 'ian uses items by chance, bambam always');
  assert.strictEqual(a.msMul, D.get('ian').msMul); assert.ok(a.ms < b.ms, 'ian is slower than bambam');
  const n = R.edit(w, a, { tier: 'hard' });
  assert.deepStrictEqual(plain(n.exec), plain(D.get('hard').exec));
});

test('I9: EnemyCard.spec / place / spawnAll pass exec + msMul', () => {
  const card = { count: 2, items: [], list: [{ tier: 'ian' }, { tier: 'hard' }] };
  const s0 = IT.EnemyCard.spec(card, 0, 100, 100, 'invoker_skin'), s1 = IT.EnemyCard.spec(card, 1, 100, 100, 'invoker_skin');
  assert.ok(s0.exec && s0.exec.itemP < s1.exec.itemP); assert.ok(s0.msMul < s1.msMul + 1e-9);
  const w = world(); w.map = { walkable: () => true };
  const e0 = IT.EnemyCard.place(card, w, 0, 4400, 2000, IT.GAME.SKINS[0]), e1 = IT.EnemyCard.place(card, w, 1, 4500, 2000, IT.GAME.SKINS[0]);
  assert.strictEqual(e0.exec.itemP, IT.DIFFICULTY.get('ian').exec.itemP); assert.strictEqual(e1.exec.itemP, IT.DIFFICULTY.get('hard').exec.itemP);
});

// ------------------------------------------------------------------ #77 panel tabs
test('Free Play panel: tab strings exist in EN + PT, hud.js builds the three tabs', () => {
  for (const k of ['fp.tabs', 'fp.tab.roster', 'fp.tab.match', 'fp.tab.combos', 'fp.tab.roster.d', 'fp.tab.match.d', 'fp.tab.combos.d']) assert.ok(IT.hasT(k), k);
  const src = read('js/ui/hud.js');
  assert.match(src, /TABS = \['roster', 'match', 'combos'\]/); assert.match(src, /role: 'tablist'/);
  assert.match(read('css/sandbox.css'), /prefers-reduced-motion/);
  assert.match(read('index.html'), /i18n\/fp\.js/);
});
