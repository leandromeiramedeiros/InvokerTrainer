'use strict';
// v6 item 55: Roshan's pit vision rule (js/data/map.js pitAt / setPit, js/data/maps.js buildPit, js/sim/vision.js) + the pit juke scenarios.
// Outside never sees 'in'; inside sees only 'in' + 'mouth'; the mouth is seen from both sides.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const IT = load(['js/data/i18n.js', 'js/data/i18n/s3.js', 'js/data/i18n/f1.js', 'js/data/i18n/scn.js',
  'js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/dotaworld.js', 'js/data/maps.js', 'js/data/difficulty.js', 'js/data/daynight.js',
  'js/data/combos.js', 'js/data/scenarios.js', 'js/data/ranks.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/belief.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/stats.js', 'js/sim/towers.js', 'js/sim/ranked.js']);
const V = IT.Vision, B = IT.Belief, R = IT.Ranked;

// 40 x 40 open field (tile 50), a walled 9 x 9 crater (cols / rows 16-24) with a 3-tile mouth gap in its north wall (row 15, cols 19-21)
function pitMap() {
  const rows = [];
  for (let y = 0; y < 40; y++) {
    let s = '';
    for (let x = 0; x < 40; x++) {
      const wall = (y === 15 || y === 25) && x >= 15 && x <= 25 || (x === 15 || x === 25) && y >= 15 && y <= 25;
      s += wall && !(y === 15 && x >= 19 && x <= 21) ? '#' : '.';
    }
    rows.push(s);
  }
  const map = IT.Map.build({ tile: 50, w: 40, h: 40, rows });
  const tiles = [];
  for (let y = 16; y <= 24; y++) for (let x = 16; x <= 24; x++) tiles.push(y * 40 + x);
  map.setPit(tiles, 1);
  return map;
}
const C = (map, tx, ty) => map.center(tx, ty);
const ent = (p, o) => Object.assign({ id: Math.random(), x: p.x, y: p.y, team: 1, vision: 1800, statuses: [], hp: 100 }, o || {});
const fakeW = map => ({ t: 0, map, ents: [], fog: true, emit() {}, rng: () => 0.5 });

test('pit predicate: pitAt in / mouth / null, pitSees table, no pit = no rule', () => {
  const map = pitMap();
  assert.equal(map.pitAt(C(map, 20, 20).x, C(map, 20, 20).y), 'in');
  assert.equal(map.pitAt(C(map, 20, 15).x, C(map, 20, 15).y), 'mouth', 'the gap in the wall');
  assert.equal(map.pitAt(C(map, 20, 14).x, C(map, 20, 14).y), null, 'the mouth is one tile deep (mouth radius 1)');
  assert.equal(map.pitAt(C(map, 20, 10).x, C(map, 20, 10).y), null);
  assert.equal(map.pitAt(C(map, 15, 20).x, C(map, 15, 20).y), null, 'walls are never mouth');
  // viewer kind x target kind (2 in, 1 mouth, 0 out)
  const t = [[0, 0, true], [0, 1, true], [0, 2, false], [1, 0, true], [1, 1, true], [1, 2, false], [2, 0, false], [2, 1, true], [2, 2, true]];
  for (const [v, k, ok] of t) assert.equal(V.pitSees(v, k), ok, v + '->' + k);
  const open = IT.Map.build({ tile: 50, w: 10, h: 10, rows: Array(10).fill('.'.repeat(10)) });
  assert.equal(open.pitMask, null); assert.equal(open.pitAt(100, 100), null);
  assert.equal(V.los(open, 25, 25, 475, 475), true);
  assert.equal(open.setPit([], 1), null, 'no in tiles = no pit');
});

test('outside cannot see a unit inside; inside cannot see outside; the mouth is visible both ways (los, canSee, shadow)', () => {
  const map = pitMap(), w = fakeW(map);
  const out = C(map, 20, 8), inn = C(map, 20, 19), mouth = C(map, 20, 15), out2 = C(map, 20, 12);
  // the straight ray out -> in passes the open mouth: only the pit rule blocks it
  assert.equal(V.los(map, out.x, out.y, inn.x, inn.y), false, 'outside -> in');
  assert.equal(V.los(map, inn.x, inn.y, out.x, out.y), false, 'in -> outside');
  assert.equal(V.los(map, out.x, out.y, mouth.x, mouth.y), true, 'outside -> mouth');
  assert.equal(V.los(map, inn.x, inn.y, mouth.x, mouth.y), true, 'in -> mouth');
  assert.equal(V.los(map, mouth.x, mouth.y, out2.x, out2.y), true, 'mouth -> outside');
  assert.equal(V.los(map, mouth.x, mouth.y, inn.x, inn.y), false, 'standing on the mouth = outside: no sight into the crater');
  assert.equal(V.los(map, inn.x, inn.y, C(map, 23, 23).x, C(map, 23, 23).y), true, 'in -> in');
  const eo = ent(out), ei = ent(inn, { team: 0 });
  assert.equal(V.canSee(w, eo, ei), false); assert.equal(V.canSee(w, Object.assign({}, ei, { team: 1 }), Object.assign({}, eo, { team: 0 })), false);
  w.ents = [eo]; assert.equal(V.teamSees(w, 1, ei), false, 'teamSees');
  // fog: a source outside never lights 'in' tiles; a source inside lights only 'in' + 'mouth'
  const vo = new Uint8Array(1600); V.shadow(map, vo, out.x, out.y, 1800);
  const vi = new Uint8Array(1600); V.shadow(map, vi, inn.x, inn.y, 1800);
  let litIn = 0, litOut = 0, mouthO = 0, mouthI = 0;
  for (let i = 0; i < 1600; i++) {
    const k = map.pitMask[i];
    if (k === 2 && vo[i]) litIn++;
    if (k === 0 && vi[i]) litOut++;
    if (k === 1 && vo[i]) mouthO++;
    if (k === 1 && vi[i]) mouthI++;
  }
  assert.equal(litIn, 0, 'outside lights no in tile'); assert.equal(litOut, 0, 'inside lights nothing outside');
  assert.ok(mouthO > 0 && mouthI > 0, 'mouth lit from both sides ' + mouthO + '/' + mouthI);
  assert.ok(vi[19 * 40 + 22], 'inside lights the crater');
});

test('true sight (Gem / Dust / wards) obeys the pit rule; the belief predicate is the same as Vision.teamSees', () => {
  const map = pitMap(), w = fakeW(map);
  const gem = ent(C(map, 20, 12), { trueSight: 900 }), ghostIn = ent(C(map, 20, 17), { team: 0, statuses: [{ type: 'ghost' }] });
  const ghostOut = ent(C(map, 20, 10), { team: 0, statuses: [{ type: 'ghost' }] });
  w.ents = [gem, ghostIn, ghostOut];
  assert.equal(V.trueSighted(w, 1, ghostOut), true); assert.equal(V.trueSighted(w, 1, ghostIn), false, 'no true sight into the pit');
  assert.equal(V.canSee(w, gem, ghostIn), false);
  // belief: the chaser loses the hero the moment it steps inside
  const P = B.params(IT.DIFFICULTY.get('easy')), b = B.create({ id: 9 }, P), hero = ent(C(map, 20, 13), { team: 0 });
  w.ents = [gem, hero];
  const tick = (t, p) => { w.t = t; hero.x = p.x; hero.y = p.y; B.observe(w, b, B.sees(w, 1, hero) ? hero : null, B.sees(w, 1, hero)); };
  tick(0, C(map, 20, 13)); tick(0.1, C(map, 20, 14)); tick(0.2, C(map, 20, 15));
  assert.equal(b.state, 'seen', 'outside + mouth: seen');
  tick(0.3, C(map, 20, 16));
  assert.equal(B.sees(w, 1, hero), V.teamSees(w, 1, hero));
  assert.equal(b.state, 'lost', 'stepped into the crater');
  // and a chaser inside loses a hero outside
  const inside = ent(C(map, 20, 20)); w.ents = [inside, hero]; hero.x = C(map, 20, 10).x; hero.y = C(map, 20, 10).y;
  assert.equal(B.sees(w, 1, hero), false);
});

test('real maps: roshan_pit / roshan_pit_top carry a pit (in covers Ranked.pitRegion, mouth is the walkable ring), other maps none', () => {
  for (const id of ['roshan_pit', 'roshan_pit_top']) {
    const m = IT.Maps.get(id), M = m.pitMask;
    assert.ok(M, id + ' pit');
    let nIn = 0, nMouth = 0;
    for (let i = 0; i < M.length; i++) { if (M[i] === 2) nIn++; if (M[i] === 1) { nMouth++; assert.ok(m.walkableTile(i % m.w, (i / m.w) | 0), id + ' mouth walkable'); } }
    assert.ok(nIn >= 30 && nMouth >= 8, id + ' ' + nIn + '/' + nMouth);
    const P = R.pitRegion(m);
    assert.ok(P && m.pitAt(P.x, P.y) === 'in', id + ' Roshan sits in the pit');
    // a point on the bank (pit_trap's Force Staff bank) is not 'in' and cannot see Roshan's spot
    let bank = null;
    for (let a = 0; a < 32 && !bank; a++) {
      const x = P.x + Math.cos(a / 32 * 6.283) * 520, y = P.y + Math.sin(a / 32 * 6.283) * 520;
      if (m.walkable(x, y) && !m.pitAt(x, y)) bank = { x, y };
    }
    assert.ok(bank, id + ' bank');
    assert.equal(V.los(m, bank.x, bank.y, P.x, P.y), false, id + ' bank -> pit hidden');
    assert.equal(V.los(m, P.x, P.y, bank.x, bank.y), false, id + ' pit -> bank hidden');
  }
  for (const id of ['grounds']) assert.equal(IT.Maps.get(id).pitMask, null, id);
});

// ---- the pit scenarios (js/data/scenarios.js): the juke contract itself is tests/juke_v6.test.js; here the pit-specific reads
const PIT = ['pit_in_out', 'pit_force_exit', 'pit_ghost', 'pit_mouth_snipe'];
function build(id, diff, seed) {
  const run = R.create({ mode: 'practice', diff, scenario: id, seed });
  const pr = run.next(), m0 = IT.Maps.get('grounds');
  const w = IT.World.create({ seed, map: m0, loadout: pr.lo, fog: pr.fog });
  IT.DayNight.attach(w, { scenario: id });
  const h = IT.Hero.create(w, pr.lo, m0.spawns.hero.x, m0.spawns.hero.y);
  run.attach(w);
  return { run, w, h, pr };
}
function prep(w, h, ab) {
  if (!IT.GAME.SPELL_ORBS[ab] || h.inv.slots.includes(ab) || h.inv.invokeCd > 0) return;
  for (const ch of IT.GAME.SPELL_ORBS[ab]) IT.Invoke.orb(w, h, ch);
  IT.Invoke.invoke(w, h);
}
// spot bot (as tests/juke_v6.test.js) + a mouth reader for pit_mouth_snipe; logs where the hero / foes stand at every belief 'lost'
function play(id, diff, seed) {
  const m = build(id, diff, seed), { w, h, run } = m, live = () => run.phase === 'play';
  const open = m.pr.sc.steps.map(s => s.a).filter((a, i, l) => IT.GAME.SPELL_ORBS[a] && l.indexOf(a) === i).slice(0, 2).reverse();
  for (let i = 0; i < 600 && run.frozen(); i++) { for (const a of open) prep(w, h, a); run.tick(1 / 30); }
  const pit = e => w.map.pitAt(e.x, e.y), lost = [], dust = [];
  const start = run.dummies.map(d => ({ pit: pit(d), visible: !!d.visible }));
  w.on('belief', p => { if (p.state === 'lost') lost.push({ hero: pit(h), foes: run.dummies.filter(d => !d.dead).map(pit) }); });
  w.on('itemUse', p => { if (p.ability === 'dust') dust.push(pit(h)); });
  const step = n => { for (let i = 0; i < (n || 1) && live(); i++) w.step(); };
  if (id === 'pit_mouth_snipe') {
    const f = run.dummies[0];
    for (let k = 0; k < 30 * 10 && live() && !(f.visible && pit(f) !== 'in'); k++) { prep(w, h, 'sunstrike'); step(); }
    const x0 = f.x, y0 = f.y; step(6);
    const v = 30 / 6;
    IT.Orders.issue(w, h, { type: 'cast', ability: 'sunstrike', x: f.x + (f.x - x0) * v * 1.75, y: f.y + (f.y - y0) * v * 1.75 });
  } else for (const s of m.pr.sc.steps) {
    if (!live()) break;
    for (let k = 0; k < 400 && IT.GAME.SPELL_ORBS[s.a] && !h.inv.slots.includes(s.a) && live(); k++) { prep(w, h, s.a); step(); }
    const t = s.at.indexOf('spot:') === 0 ? R.spotOf(w, s.at.slice(5)) : { x: h.x, y: h.y, id: h.id };
    if (s.a === 'move') { IT.Orders.issue(w, h, { type: 'move', x: t.x, y: t.y }); for (let k = 0; k < 30 * 12 && live() && Math.hypot(h.x - t.x, h.y - t.y) > (s.r || 80); k++) step(); continue; }
    IT.Orders.issue(w, h, { type: 'cast', ability: s.a, x: t.x, y: t.y, target: t.id });
    step(8);
  }
  for (let k = 0; k < 30 * 60 && live(); k++) step();
  return { r: run.result || {}, lost, dust, start };
}

test('pit scenarios: data (pit tag + a pit map, juke ones tagged juke / fun, texts, reveal), the hero / spots / foe on the right side of the rule', () => {
  for (const id of PIT) {
    const sc = IT.SCENARIOS.find(s => s.id === id);
    assert.ok(sc, id);
    assert.ok(sc.tags.indexOf('pit') >= 0 && sc.tags.indexOf('fun') >= 0, id + ' tags');
    assert.ok(IT.Maps.get(sc.map).pitMask, id + ' map has a pit');
    assert.ok(sc.hero.lvl >= 8 && sc.hero.lvl <= 14, id + ' hero level ' + sc.hero.lvl);
    assert.ok(sc.reveal, id + ' reveal');
    assert.ok((sc.hero.items || []).indexOf(id === 'pit_mouth_snipe' ? 'travels' : 'boots') >= 0, id + ' boots (a gate scenario gets travels)');
    for (const k of ['name', 'flair', 'desc', 'win', 'lose']) assert.ok(sc[k].en && sc[k].pt && sc[k].en !== sc[k].pt, id + ' ' + k);
    if (id !== 'pit_mouth_snipe') assert.equal(sc.tags[0], 'juke', id);
  }
  // where things stand, read off a built arena (seed 1, easy)
  const at = (id, f) => { const m = build(id, 'easy', 1); return f(m, (x, y) => m.w.map.pitAt(x, y)); };
  at('pit_in_out', (m, P) => { assert.equal(P(R.spotOf(m.w, 'cover').x, R.spotOf(m.w, 'cover').y), 'in'); assert.equal(P(R.spotOf(m.w, 'hide').x, R.spotOf(m.w, 'hide').y), null); });
  at('pit_force_exit', (m, P) => { assert.equal(P(m.h.x, m.h.y), 'in', 'cornered inside'); assert.equal(P(R.spotOf(m.w, 'hide').x, R.spotOf(m.w, 'hide').y), null, 'hide outside'); });
  at('pit_ghost', (m, P) => { assert.equal(P(R.spotOf(m.w, 'hide').x, R.spotOf(m.w, 'hide').y), 'in', 'hide inside'); assert.ok(m.run.dummies.some(d => (d.items || []).some(s => s && s.id === 'dust')), 'a Dust carrier'); });
  at('pit_mouth_snipe', (m, P) => { const f = m.run.dummies[0]; assert.equal(P(f.x, f.y), 'in', 'the foe starts in the crater'); assert.equal(P(m.w.gate.x, m.w.gate.y), null, 'its gate is outside'); });
});

test('pit scenarios: the bot clears each at easy seeds 1-4, and the pit rule is what breaks sight', () => {
  for (const id of PIT) for (const seed of [1, 2, 3, 4]) {
    const p = play(id, 'easy', seed);
    assert.ok(p.r.ok, id + ' easy s' + seed + ': ' + p.r.reason);   // #77 I5: pit_in_out re-routed, clears again
    if (seed !== 1) continue;
    if (id === 'pit_in_out') assert.equal(p.lost[0] && p.lost[0].hero, 'in', 'first lost = the hero stepped into the crater ' + JSON.stringify(p.lost));
    if (id === 'pit_force_exit') assert.ok(p.lost.some(l => l.hero !== 'in' && l.foes.indexOf('in') >= 0), 'lost by chasers inside the crater ' + JSON.stringify(p.lost));
    if (id === 'pit_ghost') assert.ok(p.dust.length && p.dust.every(k => k === 'in'), 'Dust thrown while the hero hides in the crater ' + JSON.stringify(p.dust));
    if (id === 'pit_mouth_snipe') assert.ok(p.start[0].pit === 'in' && !p.start[0].visible, 'unseen in the crater at the start');
  }
});
