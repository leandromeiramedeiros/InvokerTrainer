'use strict';
// v6 CEO item 26: Scenarios screen classification + filtering (IT.UI.ScnFilter, pure) + per-scenario cleared / best in the lifetime blob.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const html = rd('index.html');
const PACKS = [...html.matchAll(/src="(js\/data\/i18n\/\w+\.js)"/g)].map(m => m[1]);
const FILES = ['js/data/i18n.js'].concat(PACKS, ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/dotaworld.js', 'js/data/maps.js', 'js/data/difficulty.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js', 'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js',
  'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js', 'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/stats.js', 'js/sim/towers.js', 'js/sim/ranked.js',
  'js/sim/agh.js', 'js/sim/enemycard.js', 'js/data/scenarios.js', 'js/ui/loadout.js']);
const ctx = vm.createContext({ console, Math, JSON, Date, Map, Set, Array, Object, Number, String, Boolean, Error, Symbol, Promise, Float32Array, Float64Array, Int32Array, Uint8Array, Infinity, NaN, isFinite, isNaN, parseInt, parseFloat });
vm.runInContext('var IT = { UI: {} };', ctx);
for (const f of FILES) vm.runInContext(rd(f), ctx, { filename: f });
const IT = ctx.IT, F = IT.UI.ScnFilter, LIST = IT.SCENARIOS;
const nm = s => s.id;
const ids = a => a.map(s => s.id);

test('every tag used in scenarios.js maps to a category; category() / categories() are pure', () => {
  assert.ok(LIST.length >= 38);
  const used = new Set();
  LIST.forEach(s => (s.tags || []).forEach(g => used.add(g)));
  const mapped = new Set([].concat(...Object.values(F.CAT_TAGS)));
  for (const g of used) assert.ok(mapped.has(g), 'tag without a category: ' + g);
  for (const s of LIST) {
    assert.ok(F.categories(s.tags).length >= 1, s.id);
    assert.ok(F.categories(s.tags).indexOf(F.category(s.tags)) >= 0, s.id);
  }
  assert.deepEqual(F.categories(['escape', 'invisible', 'items']), ['escape', 'items']);
  assert.equal(F.category(['basics', 'burst']), 'combo');
  assert.equal(F.category(['river', 'multi']), 'terrain');
  assert.equal(F.category(['juke']), 'juke');
  assert.deepEqual(F.categories(['edge']), ['terrain']);
  assert.equal(F.category([]), 'basics');
  assert.equal(F.category(undefined), 'basics');
  const tags = ['river', 'multi']; F.category(tags); assert.deepEqual(tags, ['river', 'multi']);
});

test('tabs: ALL shows everything, each other tab only its members, juke may be empty', () => {
  const f = F.defaults();
  assert.equal(F.apply(LIST, f, { name: nm }).length, LIST.length);
  for (const c of F.CATS.filter(x => x !== 'all')) {
    const got = F.apply(LIST, Object.assign({}, f, { cat: c }), { name: nm });
    assert.ok(got.every(s => F.categories(s.tags).indexOf(c) >= 0), c);
    assert.equal(got.length, LIST.filter(s => F.categories(s.tags).indexOf(c) >= 0).length, c);
    if (c !== 'juke') assert.ok(got.length > 0, 'empty tab ' + c);
  }
  assert.deepEqual(F.apply(LIST, Object.assign(F.defaults(), { cat: 'terrain' }), { name: nm }).filter(s => (s.tags || []).indexOf('pit') >= 0).map(s => s.id), ['pit_trap']);
});

test('tag chips: OR = any selected tag, AND = all selected tags, empty = no restriction', () => {
  const L = [{ id: 'a', level: 1, tags: ['river', 'multi'] }, { id: 'b', level: 2, tags: ['river'] }, { id: 'c', level: 3, tags: ['multi'] }, { id: 'd', level: 4, tags: ['pit'] }];
  const run = (tags, mode) => ids(F.apply(L, { tags, mode }, { name: nm }));
  assert.deepEqual(run([], 'or'), ['a', 'b', 'c', 'd']);
  assert.deepEqual(run(['river'], 'or'), ['a', 'b']);
  assert.deepEqual(run(['river', 'multi'], 'or'), ['a', 'b', 'c']);
  assert.deepEqual(run(['river', 'multi'], 'and'), ['a']);
  assert.deepEqual(run(['river', 'pit'], 'and'), []);
  assert.deepEqual(run(['nope'], 'or'), []);
  // combined with a tab and a search
  assert.deepEqual(ids(F.apply(L, { cat: 'multi', tags: ['river'], q: 'a' }, { name: nm })), ['a']);
  // the chips of a tab are the tags its scenarios use
  const chips = F.tagsOf(L, 'multi');
  assert.deepEqual(chips.map(x => x.tag).sort(), ['multi', 'river']);
  assert.equal(chips.find(x => x.tag === 'multi').n, 2);
});

test('search: accent / case insensitive over name, id and localized tag labels', () => {
  const L = [{ id: 'x1', level: 1, tags: ['fog'] }, { id: 'x2', level: 1, tags: ['pit'] }];
  const name = s => (s.id === 'x1' ? 'Emboscada na Névoa' : 'Fosso');
  const label = g => ({ fog: 'névoa', pit: 'fosso' }[g] || g);
  const q = v => ids(F.apply(L, { q: v }, { name, label }));
  assert.deepEqual(q('NEVOA'), ['x1']);
  assert.deepEqual(q('fosso'), ['x2']);
  assert.deepEqual(q('x2'), ['x2']);
  assert.deepEqual(q('  '), ['x1', 'x2']);
  assert.deepEqual(q('zzz'), []);
});

test('sort: level asc / desc, name, not-cleared-first; ties keep data order (stable); input untouched', () => {
  const L = [
    { id: 'b', level: 3, tags: [] }, { id: 'a', level: 1, tags: [] }, { id: 'c', level: 3, tags: [] }, { id: 'd', level: 1, tags: [] }, { id: 'e', level: 2, tags: [] },
  ];
  const before = ids(L).join();
  const s = (sort, c) => ids(F.apply(L, { sort }, { name: nm, cleared: c }));
  assert.deepEqual(s('level'), ['a', 'd', 'e', 'b', 'c']);
  assert.deepEqual(s('levelDesc'), ['b', 'c', 'e', 'a', 'd']);
  assert.deepEqual(s('name'), ['a', 'b', 'c', 'd', 'e']);
  const done = x => x.id === 'a' || x.id === 'b';
  assert.deepEqual(s('todo', done), ['d', 'e', 'c', 'a', 'b']);
  assert.deepEqual(s('todo', () => false), ['a', 'd', 'e', 'b', 'c']);
  assert.equal(ids(L).join(), before);
  // stability on a bigger set: equal keys never swap
  const big = Array.from({ length: 60 }, (_, i) => ({ id: 'n' + i, level: i % 3, tags: [] }));
  const lv0 = ids(F.apply(big, { sort: 'level' }, { name: nm })).filter(i => big.find(s2 => s2.id === i).level === 0);
  assert.deepEqual(lv0, big.filter(s2 => s2.level === 0).map(s2 => s2.id));
  // every real sort returns the same set
  for (const k of F.SORTS) assert.equal(F.apply(LIST, { sort: k }, { name: nm }).length, LIST.length);
});

test('persistence: round trip, normalization of junk, throwing localStorage never throws', () => {
  const mem = {}, store = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } };
  const f = { cat: 'terrain', tags: ['river', 'pit', 'river'], mode: 'and', sort: 'todo', q: 'ghost' };
  assert.equal(F.save(f, store), true);
  assert.deepEqual(JSON.parse(JSON.stringify(F.load(store))), { cat: 'terrain', tags: ['river', 'pit'], mode: 'and', sort: 'todo', q: 'ghost' });
  mem[F.KEY] = '{"cat":"zzz","tags":[1,"x",null],"mode":"?","sort":"?","q":5}';
  assert.deepEqual(JSON.parse(JSON.stringify(F.load(store))), { cat: 'all', tags: ['x'], mode: 'or', sort: 'level', q: '' });
  mem[F.KEY] = 'not json';
  assert.deepEqual(JSON.parse(JSON.stringify(F.load(store))), F.defaults());
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.equal(F.save(f, bad), false);
  assert.deepEqual(JSON.parse(JSON.stringify(F.load(bad))), F.defaults());
  assert.deepEqual(JSON.parse(JSON.stringify(F.load(null))), F.defaults());   // no localStorage in this context
});

test('stats: scnResult ok records cleared + best per scenario, merge folds them into the lifetime blob', () => {
  const handlers = {};
  const w = { t: 0, on: (ev, fn) => { handlers[ev] = fn; return () => {}; }, byId: new Map(), hero: { id: 1 }, query: () => [] };
  const api = IT.StatsCollector.create(w);
  handlers.scnResult({ id: 'cold_start', ok: true, time: 9.4 });
  handlers.scnResult({ id: 'cold_start', ok: true, time: 7.25 });
  handlers.scnResult({ id: 'cold_start', ok: false, time: 1.5 });
  handlers.scnResult({ id: 'sun_snipe', ok: true });
  const s = api.summary();
  assert.deepEqual(JSON.parse(JSON.stringify(s.scn)), { cold_start: { cleared: 2, best: 7.25 }, sun_snipe: { cleared: 1, best: null } });
  const a = IT.StatsCollector.merge(null, s);
  const b = IT.StatsCollector.merge(a, { ...s, scn: { cold_start: { cleared: 1, best: 6 }, sun_snipe: { cleared: 1, best: 12 } } });
  assert.deepEqual(JSON.parse(JSON.stringify(b.scn)), { cold_start: { cleared: 3, best: 6 }, sun_snipe: { cleared: 2, best: 12 } });
  assert.equal(a.scn.cold_start.cleared, 2, 'inputs untouched');
  assert.ok(IT.StatsCollector.merge(null, { ...s, scn: undefined }).scn, 'older summaries without scn merge fine');
});

test('i18n: tabs, sorts, controls and the new tags exist in en and pt', () => {
  let pack = null;
  vm.runInContext(rd('js/data/i18n/v6.js'), vm.createContext({ IT: { i18nAdd: p => { pack = p; } } }));
  const keys = ['sc.search', 'sc.sort', 'sc.count', 'sc.modeOr', 'sc.modeAnd', 'sc.mode.d', 'sc.clear', 'sc.clear.d', 'sc.none', 'sc.cleared', 'sc.best', 'tag.edge', 'tag.juke']
    .concat(F.CATS.map(c => 'sc.cat.' + c), F.SORTS.map(k => 'sc.sort.' + k));
  for (const k of keys) { assert.ok(pack.en[k], 'en ' + k); assert.ok(pack.pt[k], 'pt ' + k); }
  assert.equal(pack.en['sc.cat.escape'], 'ESCAPE & INVISIBLE');
  assert.equal(pack.en['sc.cat.vision'], 'VISION & AWARENESS');
});
