'use strict';
// v6 item 29: the EDGE set (js/data/scenarios.js; arena tags edge / edgeN|S|W|E / rim in js/data/maps.js): data contract (tags, texts, level,
// fog, boots, reveal, focus), geometry (the action sits at the map border, every spot is inside the map) and the scripted bot clearing
// every one at easy (seeds 1-4). The bot is the scenarios_v5 one (spot moves added for the juke one).
const test = require('node:test');
const assert = require('node:assert');
const { IT, build, prep, bot } = require('./_edgebot.js');
const R = IT.Ranked, SC = IT.SCENARIOS;
const EDGE = SC.filter(s => (s.tags || []).indexOf('edge') >= 0);
const STRIPS = ['edgeN', 'edgeS', 'edgeW', 'edgeE'];
const tag = r => r ? (r.ok ? 'ok' : r.reason + (r.detail ? '/' + r.detail : '')) : 'none';
// distance of a point to the nearest border of the map window
const rimD = (map, p) => Math.min(p.x, p.y, map.W - p.x, map.H - p.y);

test('diagnostic: edge bot (EDGE_ALL=1 or EDGE_ONLY=id, EDGE_DIFF=easy,common, EDGE_SEEDS=1,2,3,4, EDGE_TRACE=1)', { skip: !process.env.EDGE_ONLY && !process.env.EDGE_ALL }, () => {
  for (const sc of EDGE) {
    if (process.env.EDGE_ONLY && process.env.EDGE_ONLY !== sc.id) continue;
    for (const df of (process.env.EDGE_DIFF || 'easy').split(',')) for (const sd of (process.env.EDGE_SEEDS || '1,2,3,4').split(',')) {
      const r = bot(sc.id, df, +sd, !!process.env.EDGE_TRACE);
      console.log(sc.level, sc.id, df, 's' + sd, tag(r), r && r.time != null ? r.time.toFixed(1) : '');
    }
  }
});

const SIDE = { edge_gank: 'edgeN', long_lane_snipe: 'edgeS', river_mouth_ambush: 'edgeS', offlane_survival: 'edgeW', pinned_escape: 'edgeE' };

test('edge set: 4-6 scenarios, one per minimap strip (N / S / W / E), tags edge + fun, EN / PT texts', () => {
  assert.ok(EDGE.length >= 4 && EDGE.length <= 6, 'edge scenarios: ' + EDGE.length);
  assert.deepEqual(EDGE.map(s => s.id).sort(), Object.keys(SIDE).sort());
  const sides = new Set(Object.values(SIDE));
  for (const s of STRIPS) assert.ok(sides.has(s), 'strip ' + s + ' is covered');
  for (const sc of EDGE) {
    assert.ok(sc.tags.indexOf('edge') >= 0 && sc.tags.indexOf('fun') >= 0, sc.id + ' tags ' + sc.tags);
    for (const k of ['name', 'flair', 'desc', 'win', 'lose']) assert.ok(sc[k] && sc[k].en && sc[k].pt && sc[k].en !== sc[k].pt, sc.id + ' ' + k);
    assert.equal(sc.reveal, true, sc.id + ' reveal (the tour shows the foes at the border)');
  }
});

test('edge arenas: maps.js tags edge / edgeN|S|W|E (world border) and rim / rimN|S|W|E (map window border)', () => {
  const has = (id, ...t) => { const map = IT.Maps.get(id), w = { map, rng: Math.random, spots: {}, _placed: [] };
    return R.arenas(w, { where: t, d: [0, 8000] }, { x: map.spawns.hero.x, y: map.spawns.hero.y }).length > 0; };
  assert.ok(has('dire_safe_t1', 'edge', 'edgeN', 'rim', 'rimN'));
  assert.ok(has('rad_safe_t1', 'edge', 'edgeS', 'rim', 'rimS'));
  assert.ok(has('rad_off_t1', 'edge', 'edgeW', 'rim', 'rimW'));
  assert.ok(has('dire_off_t1', 'edge', 'edgeE', 'rim', 'rimE'));
});

test('edge set: level base +-1, fog, boots; the action sits within 900 u of the map border and every spot is inside the map', () => {
  for (const sc of EDGE) for (const seed of [1, 2, 3, 4, 5, 6]) {
    const m = build(sc.id, 'easy', seed), map = m.w.map, L = m.pr.lo.heroLevel;
    assert.ok(Math.abs(L - sc.hero.lvl) <= 1, sc.id + ' level ' + L + ' vs ' + sc.hero.lvl);
    assert.equal(m.pr.fog, true, sc.id + ' fog');
    assert.ok(m.pr.lo.items.some(i => i === 'boots' || i === 'travels'), sc.id + ' boots');
    const pts = [{ x: m.h.x, y: m.h.y }].concat(m.run.dummies.map(d => ({ x: d.x, y: d.y })));
    for (const p of pts) assert.ok(p.x > 0 && p.y > 0 && p.x < map.W && p.y < map.H && map.walkable(p.x, p.y), sc.id + ' s' + seed + ' unit inside the map ' + p.x + ',' + p.y);
    const near = Math.min(...pts.map(p => rimD(map, p)));
    assert.ok(near <= 900, sc.id + ' s' + seed + ' nearest spot to the border ' + (near | 0));
    if (m.w.gate) assert.ok(rimD(map, m.w.gate) > 0 && map.walkable(m.w.gate.x, m.w.gate.y), sc.id + ' gate inside the map');
  }
});

test('edge set: river_mouth_ambush gets a sunset (daynight row)', () => {
  assert.deepEqual(IT.DayNight.forScenario('river_mouth_ambush'), { nightAt: 4 });
});

test('edge bot clears every edge scenario at easy (seeds 1-4) and at common (seeds 1-6)', () => {
  const bad = [];
  for (const sc of EDGE) {
    for (const seed of [1, 2, 3, 4]) { const r = bot(sc.id, 'easy', seed); if (!(r && r.ok)) bad.push(sc.id + ' easy s' + seed + ' ' + tag(r)); }
    for (const seed of [1, 2, 3, 4, 5, 6]) { const r = bot(sc.id, 'common', seed); if (!(r && r.ok)) bad.push(sc.id + ' common s' + seed + ' ' + tag(r)); }
  }
  assert.deepEqual(bad, []);
});
