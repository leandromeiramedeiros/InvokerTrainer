'use strict';
// v6 #50 / #52 / #58 (enemy AI): scenario intents + the phase runner (js/sim/units.js IT.Intent), difficulty = EXECUTION only
// (difficulty.js exec), Ghost Walk slow awareness (IT.Belief.sense / miss, tier-scaled Dust), innate blink (wind-up, telegraph, Cold Snap
// deny), the mid-lane blink scenarios, and the escape balance: a scripted walk-away + break-LOS route still wins >= 50% at hard / bambam.
// (The new scenarios also run in the levels_v6 bot sweep: easy + common, seeds 1-6.)
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const FILES = ['js/data/i18n.js', 'js/data/i18n/s3.js', 'js/data/i18n/f1.js', 'js/data/i18n/scn.js',
  'js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/dotaworld.js', 'js/data/maps.js', 'js/data/difficulty.js', 'js/data/daynight.js',
  'js/data/combos.js', 'js/data/scenarios.js', 'js/data/ranks.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/belief.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/stats.js', 'js/sim/towers.js', 'js/sim/ranked.js'];
const IT = load(FILES);
const R = IT.Ranked, SC = IT.SCENARIOS, DF = IT.DIFFICULTY, I = IT.Intent;
const scn = id => SC.find(s => s.id === id);

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
function thaw(m, open) { for (let i = 0; i < 600 && m.run.frozen(); i++) { for (const a of open || []) prep(m.w, m.h, a); m.run.tick(1 / 30); } }
const live = m => m.run.phase === 'play';
const steps = (m, n) => { for (let i = 0; i < n && live(m); i++) m.w.step(); };
function cast(m, ab, t) {
  const { w, h } = m;
  for (let k = 0; k < 400 && !h.inv.slots.includes(ab) && live(m); k++) { prep(w, h, ab); w.step(); }
  let done = false; const off = w.on('cast', p => { if (p.unit === h.id && p.ability === ab) done = true; });
  IT.Orders.issue(w, h, { type: 'cast', ability: ab, x: t.x, y: t.y, target: t.id });
  for (let k = 0; k < 30 * 4 && live(m) && !done; k++) w.step();
  if (typeof off === 'function') off();
  return done;
}
const KINDS = ['flee_to_tower', 'chase', 'farm_then_tp', 'gank_from_fog', 'hold_highground', 'blink_in', 'kite', 'bait', 'march', 'defend', 'idle_guard', 'attack_ally'];   // v6 item 28: attack_ally
const NEW = ['meteor_lane_kill', 'qop_blink_snipe', 'am_coldsnap_deny', 'blinker_tornado'];
const hit = (m, e, ab, amt) => IT.Combat.damage(m.w, { src: m.h.id, target: e, ability: ab, type: 'pure', amount: amt });

// ---------------------------------------------------------------- #50 intents
test('#50: every scenario foe carries an explicit, valid intent (phases use known triggers); the runtime intent = the data one at every tier', () => {
  const n = {};
  for (const sc of SC) for (const u of sc.units || []) {
    assert.ok(u.intent, sc.id + ' unit without an intent');
    const it = I.of(u);
    assert.ok(KINDS.includes(it.kind), sc.id + ' kind ' + it.kind);
    for (const p of it.phases || []) {
      assert.ok(KINDS.includes(p.then), sc.id + ' phase then ' + p.then);
      assert.ok(['spotted', 'lowHp', 'spellLanded', 'allyHit'].includes(p.on) || /^timer:\d+(\.\d+)?$/.test(p.on), sc.id + ' trigger ' + p.on);
    }
    n[it.kind] = (n[it.kind] || 0) + 1;
  }
  assert.deepEqual(I.KINDS.slice().sort(), KINDS.slice().sort());
  for (const k of ['idle_guard', 'chase', 'flee_to_tower', 'march', 'defend', 'bait', 'hold_highground', 'farm_then_tp']) assert.ok(n[k] > 0, 'used: ' + k);
  assert.equal(I.of(scn('uphill_snipe').units[0]).kind, 'hold_highground');
  assert.equal(I.of(scn('pit_trap').units[0]).kind, 'bait');
  for (const id of ['sun_flee', 'force_chase', 'bkb_bait', 'uphill_snipe', 'two_birds', 'ghost_slip', 'river_guard']) {
    const sc = scn(id);
    for (const df of ['ian', 'bambam']) build(id, df, 1).run.dummies.forEach((e, i) => assert.equal(e.intent.kind, I.of(sc.units[i]).kind, id + ' ' + df));
  }
});

test('#50: same intent at ian and bambam = same plan (kind, mover, behavior); only execution differs (exec row + reaction)', () => {
  for (const id of ['sun_flee', 'force_chase', 'river_guard', 'tornado_sun']) {
    const a = build(id, 'ian', 2).run.dummies[0], b = build(id, 'bambam', 2).run.dummies[0];
    assert.equal(a.intent.kind, b.intent.kind, id);
    assert.equal(a.scn.mot, b.scn.mot, id + ' mover');
    assert.equal(a.ai.behavior, b.ai.behavior, id + ' behavior');
    assert.deepEqual(a.exec, DF.ian.exec); assert.deepEqual(b.exec, DF.bambam.exec);
    assert.ok(a.intent.react > b.intent.react, id + ' slower reaction at ian');
  }
  // a monotonic execution ladder; cast point inside the #52 window
  const X = DF.order.map(id => DF[id].exec);
  for (let i = 1; i < X.length; i++) {
    assert.ok(X[i].jitter <= X[i - 1].jitter && X[i].itemP >= X[i - 1].itemP && X[i].gwDust >= X[i - 1].gwDust && X[i].predict >= X[i - 1].predict, DF.order[i]);
    assert.ok(X[i].blinkCast <= X[i - 1].blinkCast && X[i].gwReact <= X[i - 1].gwReact, DF.order[i]);
    assert.ok(X[i].blinkWarn < X[i - 1].blinkWarn, DF.order[i] + ' blinkWarn ladder');   // v6 #75
  }
  for (const x of X) assert.ok(x.blinkCast >= 0.15 && x.blinkCast <= 0.35);
  assert.equal(DF.ian.exec.gwDust, 0);
  // the same phase switch lands later at ian (tier reaction) than at bambam
  const when = df => {
    const m = build('sleepy_target', df, 3), e = m.run.dummies[0];
    I.attach(e, { mot: 'still', intent: { kind: 'idle_guard', phases: [{ on: 'spellLanded', then: 'flee_to_tower' }] } }, DF[df].reaction);
    thaw(m); steps(m, 3);
    e.aware = true;
    let t = null; const t0 = m.w.t;
    m.w.on('intent', p => { if (p.unit === e.id && t == null) t = m.w.t - t0; });
    hit(m, e, 'coldsnap', 1);
    steps(m, 30 * 4);
    return t;
  };
  const ti = when('ian'), tb = when('bambam');
  assert.ok(ti != null && tb != null && ti > tb, ti + ' vs ' + tb);
  assert.ok(Math.abs(ti - DF.ian.reaction) < 0.1 && Math.abs(tb - DF.bambam.reaction) < 0.1, ti + ' / ' + tb);
});

test('#50: phase runner: timer / lowHp / allyHit / spotted switch the intent once each (log + "intent" event, reaction delay)', () => {
  const m = build('two_birds', 'common', 1), [e0, e1] = m.run.dummies, ev = [];
  m.w.on('intent', p => ev.push(p.from + '>' + p.kind + '@' + p.on));
  I.attach(e0, { mot: 'still', intent: { kind: 'idle_guard', phases: [{ on: 'timer:1', then: 'kite' }, { on: 'lowHp', then: 'flee_to_tower' }] } }, 0.4);
  I.attach(e1, { mot: 'still', intent: { kind: 'idle_guard', phases: [{ on: 'allyHit', then: 'chase' }] } }, 0.4);
  thaw(m);
  steps(m, 20);
  assert.equal(e0.intent.kind, 'idle_guard');
  steps(m, 20);
  assert.equal(e0.intent.kind, 'kite', 'timer:1 (no reaction delay)');
  assert.equal(e0.scn.mot, 'kite', 'kite engine');
  hit(m, e0, 'sunstrike', e0.hp * 0.8);
  steps(m, 30 * 4);
  assert.equal(e0.intent.kind, 'flee_to_tower', 'lowHp');
  assert.equal(e0.fights, false, 'a runner does not fight');
  assert.equal(e1.intent.kind, 'chase', 'allyHit');
  assert.ok(e1.belief, 'a new chaser gets a belief');
  assert.deepEqual(e0.intent.log, ['idle_guard', 'kite', 'flee_to_tower']);
  assert.deepEqual(e0.intent.fired, [true, true]);
  for (const k of ['idle_guard>kite@timer:1', 'kite>flee_to_tower@lowHp', 'idle_guard>chase@allyHit']) assert.ok(ev.includes(k), k + ' in ' + ev.join(' '));
  // spotted -> pending (tier reaction), then switches
  const m2 = build('sleepy_target', 'hard', 1), e2 = m2.run.dummies[0];
  I.attach(e2, { mot: 'still', intent: { kind: 'idle_guard', phases: [{ on: 'spotted', then: 'flee_to_tower' }] } }, 0.3);
  thaw(m2); steps(m2, 3);
  e2.aware = true; e2.ai.seesHero = true; I.tick(m2.w, e2);
  assert.ok(e2.intent.pend && e2.intent.pend.then === 'flee_to_tower' && e2.intent.pend.at > m2.w.t, 'spotted -> pending switch');
  // gank_from_fog brings its own phases; unknown kinds fall back to idle_guard
  assert.ok(I.attach({ reaction: 1 }, { intent: 'gank_from_fog' }).phases.length >= 2);
  assert.equal(I.attach({ reaction: 1 }, { intent: 'nap' }).kind, 'idle_guard');
});

// ---------------------------------------------------------------- #58 Ghost Walk awareness
// walk the chasers in to ~300 u, then Ghost Walk in place; o.t = s to run after
function gwRun(id, diff, seed, t) {
  const m = build(id, diff, seed), { w, h, run } = m, ev = [], roll = [];
  thaw(m, ['ghostwalk']);
  const c = run.dummies.find(d => (d.items || []).some(s => s && s.id === 'dust')) || run.dummies[0];
  w.on('ghostSense', p => { ev.push('sense' + (p.phase ? ':' + p.phase : '')); if (!p.phase && p.unit === c.id) roll.push(!!p.dust); });
  w.on('dustResult', p => ev.push('dust:' + (p.hit ? 'hit' : 'miss')));
  w.on('damage', p => { if (p.ability === 'dust' && p.target === h.id) ev.push('dust:landed'); });
  w.on('belief', p => ev.push('belief:' + p.state + (p.reacquired ? '!' : '') + (p.sensed ? '~' : '')));
  for (let k = 0; k < 30 * 6 && live(m) && Math.hypot(c.x - h.x, c.y - h.y) > 300; k++) w.step();
  cast(m, 'ghostwalk', { x: h.x, y: h.y, id: h.id });
  steps(m, Math.round(30 * t));
  return { m, c, ev, roll };
}

test('#58: a Ghost-Walk-slowed foe knows Invoker is within area_of_effect (KV 450): its belief narrows to that ring; a wasted Dust = "?"', () => {
  assert.equal(I.gwRadius({ ctx: null }, null), 450);
  const { m, c, ev } = gwRun('dust_escape', 'hard', 1, 1.2);
  assert.ok(ev.includes('sense'), ev.join(' '));
  assert.ok(ev.includes('belief:predicted~'), 'sensed prediction ' + ev.join(' '));
  const B = c.belief;
  assert.ok(B && B.ring && B.ring.r === 450, 'ring ' + JSON.stringify(B && B.ring));
  assert.ok(B.last.sensed, 'sensed guess');
  assert.ok(Math.hypot(B.last.x - B.ring.x, B.last.y - B.ring.y) <= 450, 'guess inside the ring');
  assert.ok(Math.hypot(B.ring.x - m.h.x, B.ring.y - m.h.y) < 450 + 400, 'the ring is around the hero');
  // Belief.miss: a Dust that found nothing -> juked ('?')
  const B2 = IT.Belief.create({ id: 99, x: 0, y: 0 }, IT.Belief.params(DF.hard), { idx: 0, n: 1 }), seen = [];
  const w2 = { t: 5, emit: (n, p) => seen.push(p.state), map: m.w.map };
  B2.state = 'predicted'; B2.last = { x: 0, y: 0, t: 4 }; B2.pred = { x: 0, y: 0 };
  IT.Belief.miss(w2, B2);
  assert.equal(B2.state, 'juked'); assert.equal(B2.jukedAt, 5); assert.ok(seen.includes('juked'));
});

test('#58: Dust on the Ghost Walk slow is tier-scaled (ian never, easy rarely, hard / bambam mostly); a hit = "!" reacquire', () => {
  const rate = {};
  for (const df of ['ian', 'easy', 'hard', 'bambam']) {
    let n = 0, y = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) for (const id of ['dust_escape', 'plateau_escape']) {
      const { roll } = gwRun(id, df, seed, 0.8);
      if (roll.length) { n++; if (roll[0]) y++; }
    }
    assert.ok(n >= 6, df + ' sensed in ' + n + '/16');
    rate[df] = y / n;
  }
  const s = JSON.stringify(rate);
  assert.equal(rate.ian, 0, s);
  assert.ok(rate.easy <= 0.34, s);
  assert.ok(rate.hard >= 0.5 && rate.bambam >= 0.75 && rate.bambam >= rate.hard && rate.hard > rate.easy, s);
  // bambam: the Dust lands on the hero standing in its 1050. Dust's magical tick is damage => the escape run ends 'caught' on that very tick
  // (st.hurt), before the 0.15 s dustResult read; the '!' reacquire itself is then checked on the sensing chaser's belief.
  const o = gwRun('dust_escape', 'bambam', 1, 2);
  assert.ok(o.ev.includes('sense:dust') && o.ev.includes('dust:landed'), o.ev.join(' '));
  assert.equal(o.m.run.result && o.m.run.result.reason, 'caught', JSON.stringify(o.m.run.result));
  const B = o.c.belief, st = B.state, seen = [];
  assert.notEqual(st, 'seen', 'the chaser had lost the hero before the Dust');
  IT.Belief.observe({ t: o.m.w.t + 1, emit: (n, p) => seen.push(p), map: o.m.w.map }, B, o.m.h, true);
  assert.ok(seen.some(p => p.state === 'seen' && p.reacquired), JSON.stringify(seen));
});

// ---------------------------------------------------------------- #52 innate blink
function blinker(id, df, seed, open) {
  const m = build(id, df, seed), e = m.run.dummies[0], ev = [];
  e.exec = Object.assign({}, e.exec, { itemP: 1 });   // no hesitation roll: the timing is the test
  for (const n of ['innateBlink', 'blink', 'itemUse']) m.w.on(n, p => { if (p.unit === e.id) ev.push(n + (p.phase ? ':' + p.phase : '') + (p.interrupted ? '!' : '')); });
  m.w.on('fx', p => { if (p.unit === e.id && /^blink/.test(p.name)) ev.push('fx:' + p.name); });
  thaw(m, open);
  return { m, e, ev };
}
function windup(b) {
  const { m, e } = b;
  hit(m, e, 'sunstrike', 30);
  const t0 = m.w.t;
  for (let k = 0; k < 30 * 5 && live(m) && !e.innate.wind; k++) m.w.step();
  return e.innate.wind ? Object.assign({ dt: m.w.t - t0 }, e.innate.wind) : null;
}

test('#52: hurt -> turn + tier cast point -> blink (an ability, works while damaged); telegraph fx + item sound + channel status', () => {
  const b = blinker('qop_blink_snipe', 'common', 1), { m, e, ev } = b, x0 = e.x, y0 = e.y;
  assert.ok(e.innate, 'innate blink');
  const W = windup(b);
  assert.ok(W, 'wind-up started');
  const ch = IT.Status.find(e, 'channel');
  assert.ok(ch && ch.data.ability === 'blinkWindup', 'channel status');
  const dur = W.at - W.t0, X = DF.common.exec;
  assert.ok(dur >= X.blinkCast + X.blinkWarn - 1e-6 && dur <= X.blinkCast + X.blinkWarn + Math.PI / IT.GAME.ENEMY.blink.turn + 1e-6, 'wind-up ' + dur);   // v6 #75: warning ON TOP of the cast point
  steps(m, 30);
  for (const k of ['fx:blinkWindup', 'itemUse', 'innateBlink:start', 'blink', 'innateBlink:done']) assert.ok(ev.includes(k), k + ' in ' + ev.join(' '));
  assert.ok(Math.hypot(e.x - x0, e.y - y0) > 300, 'blinked away');
  assert.ok(!IT.Status.find(e, 'channel'));
  // bambam answers sooner and winds up shorter than ian (execution only)
  const wi = windup(blinker('qop_blink_snipe', 'ian', 2)), wb = windup(blinker('qop_blink_snipe', 'bambam', 2));
  assert.ok(wi && wb && wb.dt < wi.dt && (wb.at - wb.t0) < (wi.at - wi.t0), 'bambam ' + [wb.dt, wb.at - wb.t0] + ' < ian ' + [wi.dt, wi.at - wi.t0]);
});

test('#52: Cold Snap during the wind-up interrupts it and denies the blink (renewed by the procs); it blinks once the deny runs out', () => {
  const b = blinker('am_coldsnap_deny', 'ian', 1, ['coldsnap']), { m, e, ev } = b, x0 = e.x, y0 = e.y;
  const W = windup(b);
  assert.ok(W, 'winding');
  assert.ok(cast(m, 'coldsnap', { x: e.x, y: e.y, id: e.id }), 'cold snap cast');
  steps(m, 3);
  assert.ok(ev.includes('innateBlink:denied!') && ev.includes('fx:blinkDenied'), ev.join(' '));
  assert.ok(!e.innate.wind && e.innate.denyUntil > m.w.t, 'denied');
  assert.ok(I.held(m.w, e), 'held: no order breaks the deny');
  steps(m, 45);
  assert.ok(Math.hypot(e.x - x0, e.y - y0) < 150 && !ev.includes('blink'), 'no blink while denied ' + ev.join(' '));
  steps(m, 30 * 8);
  assert.ok(ev.includes('blink'), 'blinks after the deny ' + ev.join(' '));
  // a stun / hex deny too, a Tornado lift only interrupts (it retries after landing)
  const b2 = blinker('qop_blink_snipe', 'ian', 3);
  assert.ok(windup(b2));
  IT.Status.add(b2.m.w, b2.e, 'lift', 1, { src: b2.m.h.id, ability: 'tornado' });
  assert.ok(b2.ev.includes('innateBlink:interrupted') && !(b2.e.innate.denyUntil > b2.m.w.t), b2.ev.join(' '));
});

test('#52: new mid-lane scenarios: data (fun + midlane + blink tags, levels 5-8, early mid maps, en/pt texts, blinker / TP intent)', () => {
  const lv = { meteor_lane_kill: 5, qop_blink_snipe: 6, am_coldsnap_deny: 7, blinker_tornado: 8 };
  for (const id of NEW) {
    const sc = scn(id);
    assert.ok(sc, id);
    for (const t of ['fun', 'midlane', 'blink']) assert.ok(sc.tags.includes(t), id + ' tag ' + t);
    assert.equal(sc.level, lv[id], id + ' level');
    assert.ok(sc.hero.lvl >= 6 && sc.hero.lvl <= 8, id + ' hero lvl');
    assert.ok(['rad_mid_t1', 'dire_mid_t1', 'mid_river'].includes(sc.map), id + ' map');
    for (const k of ['name', 'flair', 'desc', 'win', 'lose']) assert.ok(sc[k] && sc[k].en && sc[k].pt && sc[k].en !== sc[k].pt, id + ' ' + k);
    assert.ok(sc.units.some(u => u.blinker || I.of(u).kind === 'farm_then_tp'), id + ' unit');
    const e = build(id, 'common', 1).run.dummies[0];
    assert.equal(!!e.innate, id !== 'meteor_lane_kill', id + ' innate');
  }
  assert.deepEqual(I.of(scn('am_coldsnap_deny').units[0]).phases, [{ on: 'spellLanded', then: 'flee_to_tower' }]);
});

test('#52: farm_then_tp: seen -> TP channel; left alone it gets away (escaped); a stun cancels it -> flee_to_tower', () => {
  const m = build('meteor_lane_kill', 'bambam', 1), e = m.run.dummies[0], ev = [];
  m.w.on('channelStart', p => { if (p.unit === e.id) ev.push('start'); });
  m.w.on('channelEnd', p => { if (p.unit === e.id) ev.push(p.ok ? 'ok' : 'cut'); });
  thaw(m);
  e.aware = true;
  steps(m, 30 * 10);
  assert.ok(ev.includes('start') && ev.includes('ok') && e.tpEscaped, ev.join(' '));
  assert.equal(m.run.result && m.run.result.reason, 'escaped');
  const m2 = build('meteor_lane_kill', 'bambam', 1), e2 = m2.run.dummies[0], ev2 = [];
  m2.w.on('channelEnd', p => { if (p.unit === e2.id) ev2.push(p.ok ? 'ok' : 'cut'); });
  thaw(m2);
  e2.aware = true;
  for (let k = 0; k < 30 * 6 && !(e2.channel && e2.channel.kind === 'tp'); k++) m2.w.step();
  assert.ok(e2.channel, 'channeling');
  IT.Status.add(m2.w, e2, 'stun', 1, { src: m2.h.id, ability: 'coldsnap' });
  steps(m2, 3);
  assert.deepEqual(ev2, ['cut']);
  assert.equal(e2.intent.kind, 'flee_to_tower');
  assert.ok(!e2.tpEscaped);
});

// naive plays fail where the bot (levels_v6 sweep) wins: Sun Strike on a blinker that is free to blink / no Cold Snap on the Anti-Mage
function naive(id, df, seed) {
  const m = build(id, df, seed), sc = m.pr.sc;
  thaw(m, ['sunstrike', id === 'qop_blink_snipe' ? 'deafeningblast' : 'coldsnap']);
  m.h.autoAttack = false;
  const d0 = () => m.run.dummies.find(d => !d.dead);
  if (id === 'qop_blink_snipe') { const q = d0(); cast(m, 'deafeningblast', { x: q.x, y: q.y, id: q.id }); }
  steps(m, 10);
  const q = d0();
  if (q) cast(m, 'sunstrike', { x: q.x, y: q.y, id: q.id });
  steps(m, 30 * 60);
  return m.run.result;
}
test('#52: naive play fails: Sun Strike straight after the blast (the knockback does not stop a blink) / without Cold Snap (am) -> the blinker gets out', () => {
  const out = [];
  for (const id of ['qop_blink_snipe', 'am_coldsnap_deny']) for (const seed of [1, 2, 3, 4]) {
    const r = naive(id, 'common', seed);
    out.push(id + ':' + seed + ':' + (r ? (r.ok ? 'ok' : r.reason) : 'none'));
  }
  // v6 #75: the warning (easy 0.7 / common 0.5 s) delays the blink on top of the cast point, so a lucky naive Sun Strike can now land (1 seed of 4 at most)
  assert.ok(out.filter(s => /:ok$/.test(s)).length <= 1 && !out.some(s => /^am_.*:ok$/.test(s)), out.join(' '));
});

// ---------------------------------------------------------------- #58 balance: walk away (> 450 = no slow), break line of sight
// Every 1 s: 32 candidate goals (16 bearings x 1500 / 700 u, same elevation as the hero; Nav paths them) scored by the nearest foe's
// distance (> 450 bonus: out of the Ghost Walk slow that gives it away) + a line-of-sight break bonus.
function route(id, diff, seed) {
  const m = build(id, diff, seed), { w, h, run } = m, sc = m.pr.sc;
  thaw(m, sc.steps.map(s => s.a).filter((a, i, l) => IT.GAME.SPELL_ORBS[a] && l.indexOf(a) === i).slice(0, 2).reverse());
  for (const s of sc.steps) {
    if (!live(m) || s.a === 'move') continue;
    const q = run.dummies.find(d => !d.dead);
    cast(m, s.a, s.at === 'self' ? { x: h.x, y: h.y, id: h.id } : { x: q.x, y: q.y, id: q.id });
  }
  const V = IT.Vision, map = w.map, elev = (x, y) => (map.elevAt ? map.elevAt(x, y) : 1);
  for (let k = 0; k < 30 * 30 && live(m); k += 30) {
    const al = run.dummies.filter(d => !d.dead), he = elev(h.x, h.y);
    let best = null, bs = -1e9;
    for (let i = 0; i < 32; i++) {
      const r = i < 16 ? 1500 : 700, a = (i % 16) / 16 * Math.PI * 2, p = IT.Nav.nearestWalkable(map, h.x + Math.cos(a) * r, h.y + Math.sin(a) * r);
      if (!p || Math.hypot(p.x - h.x, p.y - h.y) < r / 2 || elev(p.x, p.y) !== he) continue;
      const dmin = Math.min(...al.map(f => Math.hypot(f.x - p.x, f.y - p.y)));
      const seen = al.some(f => Math.hypot(f.x - p.x, f.y - p.y) < 1200 && V.los(map, f.x, f.y, p.x, p.y));
      const v = Math.min(dmin, 1400) + (dmin > 450 ? 300 : -600) + (seen ? 0 : 250);
      if (v > bs) { bs = v; best = p; }
    }
    if (best) IT.Orders.issue(w, h, { type: 'move', x: best.x, y: best.y });
    steps(m, 30);
  }
  steps(m, 30 * 30);
  return run.result;
}
test('#58 balance: the walk-away + break-LOS route still wins >= 50% of seeds 1-8 at hard and bambam', () => {
  const out = [], low = [];
  for (const id of ['ghost_escape', 'ghost_slip', 'plateau_escape', 'dust_escape']) for (const df of ['hard', 'bambam']) {
    let ok = 0;
    for (let seed = 1; seed <= 8; seed++) { const r = route(id, df, seed); if (r && r.ok) ok++; }
    out.push(id + ' ' + df + ' ' + ok + '/8');
    if (ok < 4) low.push(id + ' ' + df + ' ' + ok + '/8');
  }
  if (process.env.AI_BAL) console.log(out.join('\n'));
  assert.deepEqual(low, [], out.join(' | '));
});
