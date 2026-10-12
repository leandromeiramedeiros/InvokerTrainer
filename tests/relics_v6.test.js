'use strict';
// v6 WP6: relics (data + tier math), per-run medal (Ranks.fromRun), collector relic measurement (scenario runs only), tier hook,
// lifetime merge (relics / runs / best medal), curated damage block, relics i18n pack parity.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const load = require('./_load.js');
const ROOT = path.join(__dirname, '..');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/combos.js', 'js/data/ranks.js', 'js/data/relics.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/combo.js', 'js/sim/stats.js'];
const IT = load(FILES);
const map = IT.Map.build(IT.MAPDEF);
const RL = IT.RELICS, SC = IT.StatsCollector;

function mk(ranked) {
  const lo = IT.Loadout.normalize(IT.Loadout.default());
  const w = IT.World.create({ seed: 4, map, loadout: lo, fog: false, autoAttack: false });
  const h = IT.Hero.create(w, lo, map.spawns.hero.x, map.spawns.hero.y);
  const foes = [0, 1, 2].map(i => IT.Units.spawnEnemy(w, { x: h.x + 500, y: h.y + i * 60, hp: 500, attack: false }));
  if (ranked) w.ranked = { mode: 'ranked' };
  const S = SC.create(w);
  return { w, h, foes, S };
}
const dmg = (w, src, t, ability, amount, type) => IT.Combat.damage(w, { src: src.id, target: t, amount, type: type || 'pure', ability });

test('relics data: the Invoker relics + generic kill relics, 5 ascending tiers, tier / progress / fmt', () => {
  const ids = RL.LIST.map(r => r.id);
  for (const id of ['sunstrike_kills', 'tornado_kills', 'multi_icewall', 'three_emp', 'three_deafening', 'multi_meteor', 'alacrity_dmg', 'kills', 'stun_kills', 'blink_kills', 'bkb_kills', 'triple_kills', 'rampages', 'killing_sprees']) {
    assert.ok(ids.includes(id), id); assert.equal(RL.BY[id].dota, true, id);
  }
  assert.equal(new Set(ids).size, ids.length);
  for (const r of RL.LIST) {
    assert.equal(r.tiers.length, RL.MAX, r.id);
    for (let i = 1; i < r.tiers.length; i++) assert.ok(r.tiers[i] > r.tiers[i - 1], r.id);
    assert.ok(['n', 'dmg', 's'].includes(r.unit), r.id);
  }
  assert.equal(RL.tierOf('kills', 0), 0); assert.equal(RL.tierOf('kills', 75), 1); assert.equal(RL.tierOf('kills', 149), 1); assert.equal(RL.tierOf('kills', 5000), 5);
  assert.deepEqual(RL.progress('kills', 112.5), { tier: 1, next: 150, prev: 75, frac: 0.5 });
  const mx = RL.progress('kills', 1e6); assert.equal(mx.tier, 5); assert.equal(mx.next, null); assert.equal(mx.frac, 1);
  assert.equal(RL.progress('nope', 3).tier, 0);
  assert.equal(RL.fmt('meteor_dmg', 12345.6), '12,346'); assert.equal(RL.fmt('disable_time', 12.34), '12.3s'); assert.equal(RL.fmt('disable_time', 456.7), '457s');
});

test('relics data: Dota relics level linearly by the items_game in_game_display_interval step (local build 6957), tiers = levels 1..5', () => {
  // kill_eater_score_types.<event>.in_game_display_interval (scripts/items/items_game.txt, pak01_dir.vpk, build 6957)
  const STEP = { sunstrike_kills: [23, 15], tornado_kills: [32, 3], multi_icewall: [578, 25], three_emp: [579, 5], three_deafening: [580, 5],
    multi_meteor: [581, 20], alacrity_dmg: [582, 25000], kills: [0, 75], stun_kills: [5043, 50], blink_kills: [5038, 100], bkb_kills: [5041, 15],
    triple_kills: [223, 2], rampages: [224, 1], killing_sprees: [8, 10] };
  for (const [id, [ev, step]] of Object.entries(STEP)) {
    const r = RL.BY[id]; assert.equal(r.event, ev, id); assert.equal(r.step, step, id);
    assert.deepEqual(r.tiers, [1, 2, 3, 4, 5].map(k => k * step), id);
  }
  for (const r of RL.LIST) if (!r.dota) assert.equal(r.step, undefined, r.id);
});

test('per-run medal: score tier capped by cleared turns, Immortal only on a perfect run, stars inside the band', () => {
  const F = IT.Ranks.fromRun;
  assert.equal(F({ score: 0, solved: 0, turns: 8 }).tier, 0);
  const a = F({ score: 1800, solved: 5, turns: 8 }); assert.equal(a.tier, 4); assert.equal(a.name, 'Legend'); assert.ok(a.stars >= 1 && a.stars <= 5);
  const capped = F({ score: 5000, solved: 6, turns: 8 }); assert.equal(capped.tier, 5); assert.equal(capped.name, 'Ancient'); assert.equal(capped.stars, 5, 'capped by clears -> top of the band');
  const imm = F({ score: 5000, solved: 8, turns: 8 }); assert.equal(imm.tier, 7); assert.equal(imm.stars, 0);
  assert.equal(F({ score: 5000, solved: 7, turns: 8 }).tier, 6, '7/8 is at most Divine');
  assert.equal(F({ score: 50, solved: 8, turns: 8 }).tier, 0, 'a low score stays low');
  const lo = F({ score: 401, solved: 4, turns: 8 }), hi = F({ score: 799, solved: 4, turns: 8 });
  assert.equal(lo.tier, 1); assert.equal(hi.tier, 1); assert.ok(hi.stars > lo.stars);
  assert.ok(IT.Ranks.medalKey(imm) > IT.Ranks.medalKey(capped)); assert.equal(IT.Ranks.medalKey(null), -1);
  assert.doesNotThrow(() => F(null));
});

test('collector: relics only count in scenario runs (w.ranked)', () => {
  const { w, h, foes, S } = mk(false);
  dmg(w, h, foes[0], 'sunstrike', 1e5);
  assert.equal(foes[0].dead || foes[0].killed, true);
  assert.deepEqual(S.summary().relics, {});
});

test('collector: kills, sunstrike / stun / blink kills, multi-hero windows, meteor damage, disable time, lifts', () => {
  const { w, h, foes, S } = mk(true);
  // EMP hitting 3 distinct foes in one cast
  w.emit('cast', { unit: h.id, ability: 'emp' });
  for (const f of foes) w.emit('hit', { src: h.id, target: f.id, ability: 'emp' });
  // Sun Strike kill right after a stun and a blink
  w.emit('blink', { unit: h.id });
  IT.Status.add(w, foes[0], 'stun', 1.5, { src: h.id, ability: 'coldsnap' });
  dmg(w, h, foes[0], 'sunstrike', 1e5);
  // Ice Wall touching only 1 foe
  w.emit('cast', { unit: h.id, ability: 'icewall' });
  w.emit('hit', { src: h.id, target: foes[1].id, ability: 'icewall' });
  w.emit('hit', { src: h.id, target: foes[1].id, ability: 'icewall' });
  // Chaos Meteor burning two foes, Tornado lift on one, then that foe dies to an attack inside the lift window
  w.emit('cast', { unit: h.id, ability: 'chaosmeteor' });
  w.emit('hit', { src: h.id, target: foes[1].id, ability: 'chaosmeteor' });
  w.emit('hit', { src: h.id, target: foes[2].id, ability: 'chaosmeteor' });
  dmg(w, h, foes[1], 'chaosmeteor', 120, 'magical');
  IT.Status.add(w, foes[2], 'lift', 1, { src: h.id, ability: 'tornado' });
  w.t += 1.5; foes[2].statuses = foes[2].statuses.filter(s => s.type !== 'lift');   // landed 0.5 s ago
  dmg(w, h, foes[2], 'attack', 1e5, 'physical');
  const r = S.summary().relics;
  assert.equal(r.kills, 2);
  assert.equal(r.sunstrike_kills, 1);
  assert.equal(r.stun_kills, 2, 'stun kill + the lifted foe (lift is a disable)');
  assert.equal(r.blink_kills, 2, 'both kills inside 4 s of the blink');
  assert.equal(r.three_emp, 1);
  assert.equal(r.multi_icewall, undefined, 'one foe twice is not multi-hero');
  assert.equal(r.multi_meteor, 1);
  assert.ok(r.meteor_dmg > 0 && r.meteor_dmg <= 120);
  assert.equal(r.tornado_lifts, 1); assert.equal(r.tornado_kills, 1);
  assert.ok(Math.abs(r.disable_time - 2.5) < 0.01, 'stun 1.5 + lift 1 = ' + r.disable_time);
  assert.equal(r.bkb_kills, undefined);
  // a second EMP after the window is its own cast
  w.t += 10;
  for (const f of foes.slice(0, 2)) w.emit('hit', { src: h.id, target: f.id, ability: 'emp' });
  assert.equal(S.summary().relics.three_emp, 1);
});

test('collector: hooks.tier fires once when the lifetime total crosses a tier', () => {
  const { w, h, foes, S } = mk(true);
  const fired = [], prev = SC.hooks;
  SC.hooks = { base: () => ({ kills: 74 }), tier: e => fired.push(e) };
  try {
    dmg(w, h, foes[0], 'attack', 1e5, 'physical');
    dmg(w, h, foes[1], 'attack', 1e5, 'physical');
  } finally { SC.hooks = prev; }
  const k = fired.filter(e => e.id === 'kills');
  assert.equal(k.length, 1); assert.equal(k[0].tier, 1); assert.equal(k[0].value, 75);
  assert.equal(S.summary().relics.kills, 2);
});

test('merge: relics add up, ranked runs count and keep the best medal / score', () => {
  const s1 = Object.assign(SC.blank(), { time: 60, relics: { kills: 3, meteor_dmg: 100.4 }, run: { mode: 'ranked', score: 300, solved: 4, turns: 8, medal: IT.Ranks.fromRun({ score: 300, solved: 4, turns: 8 }) } });
  const s2 = Object.assign(SC.blank(), { time: 60, relics: { kills: 2 }, run: { mode: 'ranked', score: 200, solved: 2, turns: 8, medal: IT.Ranks.fromRun({ score: 200, solved: 2, turns: 8 }) } });
  const s3 = Object.assign(SC.blank(), { time: 60, relics: { emp_mana: 50 } });
  let L = SC.merge(null, s1); L = SC.merge(L, s2); L = SC.merge(L, s3);
  assert.equal(L.relics.kills, 5); assert.equal(L.relics.emp_mana, 50); assert.ok(L.relics.meteor_dmg >= 100 && L.relics.meteor_dmg <= 100.5);
  assert.equal(L.runs, 2, 'free play sessions are not runs');
  assert.equal(L.bestMedal.tier, s1.run.medal.tier); assert.equal(L.bestMedal.stars, s1.run.medal.stars);
  assert.equal(L.bestScore, 300);
  const old = SC.merge({ sessions: 1, time: 1, actions: 0, apm: 0, spells: {}, invoke: SC.blank().invoke, damage: SC.blank().damage, cc: SC.blank().cc, combos: SC.blank().combos, blindHits: 0, boltsCountered: 0, boltsBlocked: 0, boltsHit: 0, blinksPrevented: 0, blinks: 0 }, s3);
  assert.equal(old.relics.emp_mana, 50, 'a pre-v6 lifetime blob gains a relics map');
});

test('curated damage: total, physical / magical / pure split, damage by spell (only sources that hit, descending)', () => {
  const { w, h, foes, S } = mk(true);
  dmg(w, h, foes[0], 'sunstrike', 300, 'pure');
  dmg(w, h, foes[1], 'chaosmeteor', 80, 'magical');
  dmg(w, h, foes[1], 'attack', 40, 'physical');
  dmg(w, h, foes[2], 'sunstrike', 100, 'pure');
  const st = S.summary(), c = SC.curated(st, { mode: 'ranked', score: 1800, solved: 5, turns: 8, bestStreak: 3 });
  const d = c.damage;
  assert.equal(d.total, Math.round(st.damage.dealt.total));
  assert.ok(d.bySpell.length >= 3);
  assert.equal(d.bySpell[0].id, 'sunstrike');
  for (let i = 1; i < d.bySpell.length; i++) assert.ok(d.bySpell[i - 1].v >= d.bySpell[i].v);
  assert.ok(d.bySpell.every(x => x.v > 0));
  assert.ok(d.byType.pure > d.byType.magical && d.byType.magical > 0 && d.byType.physical > 0);
  assert.ok(!c.tiles.some(x => x.id === 'sun' || x.id === 'meteor'));
  assert.equal(c.medal.tier, 4); assert.equal(c.ornament, 4);
  assert.ok(c.relics && c.relics.meteor_dmg > 0);
  const e = SC.curated(SC.blank(), { mode: 'ranked', score: 0, solved: 0, turns: 8 });
  assert.equal(e.damage.total, 0); assert.deepEqual(e.damage.bySpell, []);
});

test('i18n: relics pack en/pt parity + placeholders, a name and description for every relic', () => {
  let pack = null;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/i18n/relics.js'), 'utf8'), vm.createContext({ IT: { i18nAdd: p => { pack = p; } } }));
  const en = Object.keys(pack.en).sort(), pt = Object.keys(pack.pt).sort();
  assert.deepEqual(en, pt);
  for (const k of en) { assert.ok(pack.en[k] && pack.pt[k], k); assert.equal((pack.en[k].match(/\{\w+\}/g) || []).join(), (pack.pt[k].match(/\{\w+\}/g) || []).join(), 'placeholders ' + k); }
  for (const r of RL.LIST) { assert.ok(en.includes('relic.' + r.id), r.id); assert.ok(en.includes('relic.' + r.id + '.d'), r.id + '.d'); }
  for (const f of ['js/ui/relics.js', 'js/ui/statsscreen.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const mt of src.matchAll(/\bt\('((?:relics|stats\.(?:relics|runs|bestMedal|bestScore|lifeDmg|started|noMedal))[a-zA-Z.]*)'/g)) assert.ok(en.includes(mt[1]), f + ' uses ' + mt[1]);
  }
});

// ---- item 14: special relics (client RELICS 0/14: 4 special + 3 Invoker + 7 generic), shield layout, big-toast queue, new generic relics
test('special relics: exactly the 4 rare ones, client layout rows 4-3-4-3 (14 Dota relics) + trainer relics outside', () => {
  assert.deepEqual(RL.SPECIAL, ['multi_icewall', 'three_emp', 'three_deafening', 'multi_meteor']);
  for (const r of RL.LIST) assert.equal(!!r.special, RL.SPECIAL.includes(r.id), r.id);
  for (const id of RL.SPECIAL) { assert.equal(RL.isSpecial(id), true); assert.equal(RL.BY[id].dota, true); }
  assert.equal(RL.isSpecial('kills'), false); assert.equal(RL.isSpecial('nope'), false);
  assert.deepEqual(RL.ROWS.map(r => r.length), [4, 3, 4, 3]);
  assert.equal(RL.DOTA, 14); assert.equal(RL.TRAINER.length, 6);
  const placed = RL.ROWS.flat();
  assert.equal(new Set(placed).size, 14, 'every Dota relic is in exactly one row');
  for (const id of placed) assert.equal(RL.BY[id].dota, true, id);
  for (const id of RL.TRAINER) assert.equal(RL.BY[id].dota, false, id);
  assert.equal(RL.ROWS[0].join(), RL.SPECIAL.join());
});

test('collector: triple kills (3 inside the chain window), rampages (5), killing sprees (3 without dying); weight 0 relics are not scored', () => {
  const { w, h, S } = mk(true);
  const foes = [];
  for (let i = 0; i < 6; i++) foes.push(IT.Units.spawnEnemy(w, { x: h.x + 500, y: h.y + i * 60, hp: 500, attack: false }));
  for (let i = 0; i < 5; i++) { dmg(w, h, foes[i], 'attack', 1e5, 'physical'); w.t += 2; }
  let r = S.summary().relics;
  assert.equal(r.kills, 5);
  assert.equal(r.triple_kills, 1, 'the 3rd kill of the chain');
  assert.equal(r.rampages, 1, 'the 5th kill of the chain');
  assert.equal(r.killing_sprees, 1, '3 kills without dying');
  dmg(w, h, foes[5], 'attack', 1e5, 'physical');
  r = S.summary().relics;
  assert.equal(r.triple_kills, 1, 'the 6th kill is not a new triple'); assert.equal(r.rampages, 1);
  for (const id of ['triple_kills', 'rampages', 'killing_sprees']) assert.equal(RL.BY[id].weight, 0, id);
  assert.equal(SC.relicScore({ triple_kills: 4, rampages: 3, killing_sprees: 9 }).score, 0, 'tracked, not scored');
  assert.deepEqual(SC.relicScore({ triple_kills: 4 }).parts, []);
});

test('collector: a gap above the chain window restarts the chain (no triple from 1 + 1 + 1 spread out)', () => {
  const { w, h, S } = mk(true);
  const foes = [];
  for (let i = 0; i < 3; i++) foes.push(IT.Units.spawnEnemy(w, { x: h.x + 500, y: h.y + i * 60, hp: 500, attack: false }));
  for (const f of foes) { dmg(w, h, f, 'attack', 1e5, 'physical'); w.t += 30; }
  const r = S.summary().relics;
  assert.equal(r.kills, 3); assert.equal(r.triple_kills, undefined);
  assert.equal(r.killing_sprees, 1, 'the spree is deaths-based, not time-based');
});

test('special toast queue: one at a time, in order, ~3 s each; clear drops the pending ones', () => {
  const ui = load([...FILES, 'js/ui/relics.js']).UI.Relics;
  assert.equal(ui.SPECIAL_MS, 3000);
  const timers = [], shown = [];
  const q = ui.createQueue(e => { shown.push(e.id); return 3000; }, (f, ms) => timers.push({ f, ms }));
  q.push({ id: 'multi_icewall' }); q.push({ id: 'three_emp' }); q.push({ id: 'multi_meteor' });
  assert.deepEqual(shown, ['multi_icewall'], 'only the first is up');
  assert.equal(q.busy, true); assert.equal(q.length, 2);
  assert.equal(timers.length, 1); assert.equal(timers[0].ms, 3000);
  timers.shift().f();
  assert.deepEqual(shown, ['multi_icewall', 'three_emp']);
  q.clear(); assert.equal(q.length, 0);
  timers.shift().f();
  assert.deepEqual(shown, ['multi_icewall', 'three_emp'], 'cleared');
  assert.equal(q.busy, false);
  q.push({ id: 'three_deafening' }); assert.deepEqual(shown.slice(-1), ['three_deafening'], 'idle queue starts again');
  // a throwing renderer never wedges the queue
  const q2 = ui.createQueue(() => { throw new Error('x'); }, (f, ms) => timers.push({ f, ms }));
  q2.push({ id: 'a' }); q2.push({ id: 'b' });
  assert.equal(q2.length, 1); timers.pop().f(); assert.equal(q2.length, 0);
});

test('special toast: UI toast routes specials into the queue (not the small toast), regular relics keep the small one', () => {
  const ui = load([...FILES, 'js/ui/relics.js']).UI.Relics;
  assert.equal(ui.toast({ id: 'multi_icewall', tier: 1, value: 25 }), null, 'no DOM in node: nothing built, no throw');
  assert.equal(ui.toast({ id: 'kills', tier: 1, value: 75 }), null);
  assert.equal(ui.advanced({ kills: 3, multi_meteor: 1, tornado_kills: 1 }).join(), 'multi_meteor,tornado_kills,kills', 'specials first');
});

test('i18n: special relic keys exist (toast header, RELICS n / m, headers) and the three new relics have names', () => {
  let pack = null;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/i18n/relics.js'), 'utf8'), vm.createContext({ IT: { i18nAdd: p => { pack = p; } } }));
  for (const k of ['relics.special', 'relics.specialToast', 'relics.count', 'relics.trainerHead', 'relic.triple_kills', 'relic.rampages', 'relic.killing_sprees', 'relic.triple_kills.d']) {
    assert.ok(pack.en[k] && pack.pt[k], k);
  }
  assert.match(pack.en['relics.specialToast'], /\{t\}/); assert.match(pack.en['relics.count'], /\{n\}.*\{m\}/);
});
