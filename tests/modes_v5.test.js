'use strict';
// Modes v5 (batch C): infinite run (until the first fail, clears counted, best-ever persisted), curated end-splash stats,
// ranked 8-turn flow unaffected, end-pack i18n parity, share filename.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const FILES = ['js/data/i18n.js', 'js/data/i18n/s3.js', 'js/data/i18n/f1.js', 'js/data/i18n/scn.js', 'js/data/i18n/end.js',
  'js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/dotaworld.js', 'js/data/maps.js', 'js/data/difficulty.js',
  'js/data/combos.js', 'js/data/scenarios.js', 'js/data/ranks.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/stats.js', 'js/sim/towers.js', 'js/sim/ranked.js',
  'js/ui/endsplash.js', 'js/ui/share.js'];

// like tests/_load.js, plus extra globals (a fake localStorage)
function loadWith(files, extra) {
  const ctx = vm.createContext(Object.assign({ console, Math, JSON, Date, Map, Set, Array, Object, Number, String, Boolean, Error, Symbol, Promise, Float32Array, Float64Array, Int8Array, Int16Array, Int32Array, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray, Infinity, NaN, isFinite, isNaN, parseInt, parseFloat }, extra || {}));
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.IT;
}
const IT = loadWith(FILES);
const R = IT.Ranked;

function mk(o) {
  const run = R.create(Object.assign({ mode: 'infinite', seed: 3 }, o || {}));
  const pr = run.next(), m0 = IT.Maps.get(pr.sc.map);
  const w = IT.World.create({ seed: 3, map: m0, loadout: pr.lo, fog: pr.fog, autoAttack: false });
  const h = IT.Hero.create(w, pr.lo, m0.spawns.hero.x, m0.spawns.hero.y);
  const ends = [];
  w.on('modeEnd', p => ends.push(p));
  run.attach(w);
  return { run, w, h, ends };
}
const thaw = (run, max) => { for (let i = 0; i < (max || 900) && run.frozen() && !run.ended; i++) run.tick(1 / 30); };
// v6: a kill only counts once every step spell hit, so the shortcut marks the steps as landed first
const killAll = m => { for (const a of m.run.pr.need || []) m.run.st.used.add(a); for (const d of m.run.dummies.slice()) if (!d.dead) IT.Combat.damage(m.w, { src: m.h.id, target: d, amount: 1e6, type: 'pure' }); };

// play turns: kill-type scenarios are cleared, the others run out the clock (a fail, unless it is an escape)
function drive(m, maxTurns) {
  const ids = [];
  for (let i = 0; i < (maxTurns || 60) && !m.run.ended; i++) {
    thaw(m.run);
    if (m.run.ended) break;
    ids.push(m.run.pr.sc.id);
    if (m.run.pr.sc.obj.type === 'kill') killAll(m); else m.w.t = m.run.t0 + m.run.pr.limit + 1;
    m.w.step();
    for (let k = 0; k < 400 && m.run.phase === 'result' && !m.run.ended; k++) m.run.tick(1 / 30);
  }
  return ids;
}

test('infinite: bambam, hard end of the pool, 5 s countdown, no turn limit', () => {
  R.resetInfinite();
  const m = mk(), { run, w } = m;
  assert.equal(run.mode, 'infinite'); assert.equal(run.turns, null); assert.equal(run.runLeft, null);
  assert.equal(R.INF_COUNTDOWN, 5); assert.equal(R.hud(w).countdown, 5);
  assert.equal(run.difficulty().id, 'bambam');
  assert.ok(run.pr.sc.level >= R.INF_MIN_LEVEL, 'level ' + run.pr.sc.level);
  const hd = R.hud(w); assert.equal(hd.cleared, 0); assert.equal(hd.score, 0); assert.equal(hd.turns, null);
});

test('infinite: seeded shuffled order, a full pass over the pool without repeats, deterministic', () => {
  const order = seed => { const r = R.create({ mode: 'infinite', seed }), out = []; for (let i = 0; i < 60; i++) { r.n = i; out.push(r.next().sc.id); } return out; };
  const a = order(7), b = order(7), c = order(8);
  assert.deepEqual(a, b); assert.notDeepEqual(a, c);
  const size = IT.SCENARIOS.filter(s => s.level >= R.INF_MIN_LEVEL).length;
  assert.ok(size >= 10);
  assert.equal(new Set(a.slice(0, size)).size, size, 'first lap covers every pool scenario once');
  for (let i = 1; i < a.length; i++) assert.notEqual(a[i], a[i - 1]);
  const lvl = id => IT.SCENARIOS.get(id).level;
  assert.ok(a.every(id => lvl(id) >= R.INF_MIN_LEVEL));
});

test('infinite: later laps are harder (bulkier foes, tighter timer, higher multiplier)', () => {
  const base = IT.DIFFICULTY.get('bambam'), l1 = R.infDifficulty(base, 1), l3 = R.infDifficulty(base, 3);
  assert.equal(R.infDifficulty(base, 0), base);
  assert.ok(l1.hpMul > base.hpMul && l3.hpMul > l1.hpMul);
  assert.ok(l1.dmgMul > base.dmgMul && l1.timer < base.timer && l1.mult > base.mult && l1.reaction < base.reaction);
  assert.equal(base.hpMul, IT.DIFFICULTY.get('bambam').hpMul, 'the base row is not mutated');
  const r = R.create({ mode: 'infinite', seed: 2 }); r.n = 0; r.next(); assert.equal(r.lap(), 0);
  r.n = 400; r.next(); assert.ok(r.lap() >= 1);   // past one full pass (v6 item 28 grew the pool past 40) assert.ok(r.difficulty().hpMul > base.hpMul);
});

test('infinite: runs until the first fail, counts the clears, reports best-ever', () => {
  let found = null;
  for (let seed = 1; seed <= 40 && !found; seed++) {
    R.resetInfinite();
    const m = mk({ seed }); drive(m);
    if (m.run.ended && m.run.solved >= 2) found = m;
  }
  assert.ok(found, 'a seed with >= 2 clears before the first fail');
  const { run, ends } = found;
  assert.equal(ends.length, 1);
  const s = ends[0];
  assert.equal(s.mode, 'infinite'); assert.equal(s.reason, 'fail');
  assert.equal(run.failed, 1);
  assert.equal(s.cleared, run.solved); assert.equal(s.solved, run.solved); assert.ok(s.cleared >= 2);
  assert.equal(s.best, s.cleared); assert.equal(s.prevBest, 0); assert.equal(s.newBest, true);
  assert.ok(s.failId && IT.SCENARIOS.get(s.failId)); assert.ok(s.failName && s.failName.en);
  assert.equal(s.turns, null); assert.equal(s.diff, 'bambam'); assert.ok(s.level >= R.INF_MIN_LEVEL);
  assert.ok(s.score > 0); assert.equal(s.rank, undefined, 'infinite never touches the rating');
  assert.equal(R.infiniteProfile().best, s.cleared);
});

test('infinite: the first fail ends the run at once; quitting records what was cleared', () => {
  R.resetInfinite();
  const a = mk({ seed: 4 });
  thaw(a.run);
  if (a.run.pr.sc.obj.type === 'kill') { a.w.t = a.run.t0 + a.run.pr.limit + 1; a.w.step(); for (let k = 0; k < 400 && !a.run.ended; k++) a.run.tick(1 / 30); assert.equal(a.ends[0].cleared, 0); assert.equal(a.ends[0].newBest, false); }
  R.resetInfinite();
  const b = mk({ seed: 4 }); thaw(b.run); b.run.finish('quit');
  assert.equal(b.ends[0].reason, 'quit'); assert.equal(b.ends[0].cleared, 0);
});

test('best-ever (pure part): infiniteResult + persistence, in-memory fallback, broken storage tolerated', () => {
  assert.deepEqual(R.infiniteResult(3, 5), { cleared: 5, prev: 3, best: 5, isNew: true });
  assert.deepEqual(R.infiniteResult(5, 3), { cleared: 3, prev: 5, best: 5, isNew: false });
  assert.deepEqual(R.infiniteResult(4, 4), { cleared: 4, prev: 4, best: 4, isNew: false });
  assert.equal(R.infiniteResult(0, 0).isNew, false);
  assert.equal(R.infiniteResult(undefined, -2).best, 0);
  // no localStorage in this context -> in-memory
  R.resetInfinite();
  assert.equal(R.infiniteProfile().best, 0);
  assert.equal(R.recordInfinite(4).isNew, true); assert.equal(R.recordInfinite(2).isNew, false); assert.equal(R.recordInfinite(6).best, 6);
  const p = R.infiniteProfile(); assert.equal(p.best, 6); assert.equal(p.games, 3); assert.equal(p.last, 6);
  R.resetInfinite(); assert.equal(R.infiniteProfile().best, 0);
  // a working fake localStorage persists across instances; a throwing one never breaks a run summary
  const store = {};
  const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const A = loadWith(FILES, { localStorage: ls }).Ranked;
  A.recordInfinite(9);
  assert.equal(JSON.parse(store['it2.inf']).best, 9);
  const B = loadWith(FILES, { localStorage: ls }).Ranked;
  assert.equal(B.infiniteProfile().best, 9); assert.equal(B.recordInfinite(5).isNew, false); assert.equal(B.infiniteProfile().best, 9);
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('x'); } };
  const C = loadWith(FILES, { localStorage: bad }).Ranked;
  assert.equal(C.infiniteProfile().best, 0); assert.equal(C.recordInfinite(3).best, 3); assert.equal(C.infiniteProfile().best, 3);
  assert.doesNotThrow(() => C.resetInfinite());
});

test('curated stats (pure): the few numbers worth showing, in order, omitting what is missing', () => {
  const S = {
    apm: 142.6, combos: { best: { a: 4.2, b: 2.46, c: null } },
    spells: { sunstrike: { casts: 10, hits: 6, misses: 2, accuracy: 0.75 }, chaosmeteor: { casts: 4, hits: 1, misses: 3, accuracy: 0.25 }, coldsnap: { casts: 9, hits: 9, misses: 0 } },
  };
  const m = { mode: 'ranked', score: 4321.7, solved: 6, turns: 8, bestStreak: 5, rank: { after: { rank: { tier: 3, stars: 2 } } } };
  const c = IT.StatsCollector.curated(S, m);
  // v6 WP6: no per-spell accuracy tiles (damage by spell replaces them)
  assert.deepEqual(c.tiles.map(x => x.id), ['score', 'cleared', 'streak', 'apm', 'fastest']);
  const by = id => c.tiles.find(x => x.id === id);
  assert.equal(by('score').v, 4322); assert.equal(by('cleared').v, 6); assert.equal(by('cleared').of, 8); assert.equal(by('streak').v, 5);
  assert.equal(by('apm').v, 142.6); assert.equal(by('fastest').v, 2.46);
  // v6 WP6: the ornament is this run's medal tier (score tier 7 capped by 6/8 cleared -> Legend)
  assert.equal(c.cleared, 6); assert.equal(c.ornament, 5); assert.equal(c.medal.tier, 5);
  // nothing recorded: only score + streak
  const e = IT.StatsCollector.curated(IT.StatsCollector.blank(), { mode: 'ranked', score: 0, solved: 0, turns: 8, bestStreak: 0 });
  assert.deepEqual(e.tiles.map(x => x.id), ['score', 'cleared', 'streak']);
  assert.doesNotThrow(() => IT.StatsCollector.curated(null, null));
  // infinite: no "x/y" tile; the ornament grows with the clears (1 per 2, capped at 7)
  const inf = IT.StatsCollector.curated(S, { mode: 'infinite', score: 900, cleared: 5, solved: 5, bestStreak: 5 });
  assert.ok(!inf.tiles.some(x => x.id === 'cleared')); assert.equal(inf.cleared, 5); assert.equal(inf.ornament, 2);
  const O = IT.StatsCollector.ornament;
  assert.equal(O({ mode: 'infinite', cleared: 0 }), 0); assert.equal(O({ mode: 'infinite', cleared: 99 }), 7); assert.equal(O({ mode: 'ranked' }), 0);
});

test('splash formatting + share data/filename (pure parts, no DOM)', () => {
  const Sp = IT.UI.Splash;
  IT.lang = 'en';
  assert.deepEqual(Sp.fmtTile({ id: 'cleared', kind: 'frac', v: 6, of: 8 }), { label: 'Cleared', text: '6/8' });
  assert.equal(Sp.fmtTile({ id: 'sun', kind: 'pct', v: 0.756 }).text, '76%');
  assert.equal(Sp.fmtTile({ id: 'fastest', kind: 'sec', v: 2.46 }).text, '2.5s');
  assert.equal(Sp.fmtTile({ id: 'apm', kind: 'rate', v: 142.6 }).text, '143');
  IT.lang = 'pt';
  assert.equal(Sp.fmtTile({ id: 'score', kind: 'int', v: 10 }).label, 'Pontos');
  IT.lang = 'en';
  const sd = Sp.shareData({ mode: 'infinite', score: 100, best: 7, newBest: true, diff: 'bambam', level: 9 }, IT.StatsCollector.curated(null, { mode: 'infinite', cleared: 4, score: 100 }));
  assert.equal(sd.mode, 'infinite'); assert.equal(sd.cleared, 4); assert.equal(sd.best, 7); assert.equal(sd.newBest, true); assert.equal(sd.ornament, 2); assert.ok(sd.tiles.length >= 2);
  assert.equal(IT.UI.Share.filename(new Date(2026, 0, 5)), 'invoker-trainer-2026-01-05.png');
  assert.match(IT.UI.Share.filename(), /^invoker-trainer-\d{4}-\d{2}-\d{2}\.png$/);
});

test('ranked is unaffected: 8 turns, 12 s countdown, rating recorded, no infinite fields', () => {
  R.reset(); R.resetInfinite();
  const m = mk({ mode: 'ranked' }), { run, w, ends } = m;
  assert.equal(run.turns, 8); assert.equal(run.infinite, false); assert.equal(R.COUNTDOWN, 12); assert.equal(R.hud(w).countdown, Math.ceil(run.countdown)); assert.ok(run.countdown >= 12);
  assert.equal(R.hud(w).cleared, null); assert.equal(R.hud(w).turns, 8);
  for (let i = 0; i < 8; i++) {
    assert.equal(run.ended, false, 'turn ' + i);
    run.skip(); run.tick(1e-3);
    for (let k = 0; k < 4000 && run.phase === 'play'; k++) w.step();
    for (let k = 0; k < 400 && run.phase === 'result'; k++) run.tick(1 / 30);
  }
  assert.equal(run.ended, true); assert.equal(run.n, 8);   // fails do not end a ranked run early
  assert.equal(ends.length, 1); assert.equal(ends[0].reason, 'turns'); assert.equal(ends[0].mode, 'ranked');
  assert.ok(ends[0].rank); assert.equal(ends[0].turns, 8);
  assert.equal(ends[0].cleared, undefined); assert.equal(ends[0].best, undefined);
  assert.equal(R.infiniteProfile().best, 0, 'a ranked run never touches the infinite best');
  R.reset();
});

test('i18n: the end pack has the same keys in en and pt, and covers every key the splash / share use', () => {
  let pack = null;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/i18n/end.js'), 'utf8'), vm.createContext({ IT: { i18nAdd: p => { pack = p; } } }));
  assert.ok(pack && pack.en && pack.pt);
  const en = Object.keys(pack.en).sort(), pt = Object.keys(pack.pt).sort();
  assert.deepEqual(en, pt);
  for (const k of en) { assert.ok(pack.en[k] && pack.pt[k], k); assert.equal((pack.en[k].match(/\{\w+\}/g) || []).join(), (pack.pt[k].match(/\{\w+\}/g) || []).join(), 'placeholders ' + k); }
  let v6 = null;   // end.btn.infinite.d lives in the v6 pack
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/i18n/v6.js'), 'utf8'), vm.createContext({ IT: { i18nAdd: p => { v6 = p; } } }));
  let rl = null;   // v6 WP6: damage / medal / relics keys live in the relics pack
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/i18n/relics.js'), 'utf8'), vm.createContext({ IT: { i18nAdd: p => { rl = p; } } }));
  const all = en.concat(Object.keys(v6.en), Object.keys(rl.en));
  for (const f of ['js/ui/endsplash.js', 'js/ui/share.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const mt of src.matchAll(/\bt\('((?:end\.sp|end\.btn|share)\.[a-zA-Z.]+)'/g)) assert.ok(all.includes(mt[1]), f + ' uses ' + mt[1]);
  }
  for (const id of ['score', 'cleared', 'streak', 'apm', 'fastest', 'sun', 'meteor']) assert.ok(en.includes('end.sp.' + id), id);
});
