'use strict';
// v6 item 28: the FUN set (docs/SCENARIO-RESEARCH.md): 12 scenarios built on new sim mechanics (enemy Town Portal channel, rune / Aegis
// pickups, a friendly ally hero, Roshan). Mechanics, data rules, idle baselines, and the step bot (tests/_funbot.js) at easy 1-4 / common 1-3.
const test = require('node:test');
const assert = require('node:assert');
const { IT, build, bot } = require('./_funbot.js');
const R = IT.Ranked, U = IT.Units;
const FUN = IT.SCENARIOS.filter(s => s.funBot);
const IDS = ['tp_snipe', 'tornado_tp_cancel', 'rune_contest', 'pit_fight_blast', 'pit_blast_in', 'bkb_tower_hitter', 'ghost_ambush', 'tornado_emp_drop',
  'tornado_icewall_landing', 'smoke_gank_escape', 'icewall_ramp_defense', 'save_the_ally', 'aegis_snatch'];

const thaw = m => { for (let i = 0; i < 600 && m.run.frozen(); i++) m.run.tick(1 / 30); return m; };
const play = (m, sec, stop) => { for (let k = 0; k < 30 * sec && m.run.phase === 'play' && !(stop && stop()); k++) m.w.step(); };
const idle = (id, df, seed) => { const m = thaw(build(id, df, seed)); m.h.autoAttack = false; play(m, 60); return m; };
const record = (w, names) => { const ev = []; for (const n of names) w.on(n, p => ev.push([n, Object.assign({}, p)])); return ev; };
const nuke = (m, d, ability) => {
  for (const a of m.run.pr.need || []) m.run.st.used.add(a);
  IT.Combat.damage(m.w, { src: m.h.id, target: d, amount: 1e6, type: 'pure', ability });
};

// ---------------------------------------------------------------- mechanics
test('TP: a planned Town Portal channels GAME.TP.dur s, then the target escapes (fail "escaped")', () => {
  const m = thaw(build('tp_snipe', 'easy', 1)), ev = record(m.w, ['channelStart', 'channelEnd']);
  m.h.autoAttack = false; play(m, 30);
  const st = ev.find(e => e[0] === 'channelStart'), en = ev.find(e => e[0] === 'channelEnd');
  assert.ok(st && en, 'channel start + end');
  assert.equal(st[1].kind, 'tp'); assert.equal(st[1].dur, IT.GAME.TP.dur);
  assert.equal(en[1].ok, true); assert.equal(en[1].interrupted, false);
  assert.ok(m.run.dummies[0].tpEscaped);
  assert.equal(m.run.result.ok, false); assert.equal(m.run.result.reason, 'escaped');
});

test('TP: a disable (Tornado lift) interrupts the channel; no escape, one TP only', () => {
  const m = thaw(build('tornado_tp_cancel', 'easy', 1)), ev = record(m.w, ['channelStart', 'channelEnd']);
  m.h.autoAttack = false;
  const d = m.run.dummies[0];
  play(m, 10, () => d.channel && d.channel.kind === 'tp');
  assert.ok(d.channel && d.channel.kind === 'tp', 'channelling');
  IT.Status.add(m.w, d, 'lift', 1, { src: m.h.id, ability: 'tornado' });
  play(m, 0.2);
  const en = ev.filter(e => e[0] === 'channelEnd');
  assert.equal(en.length, 1); assert.equal(en[0][1].ok, false); assert.equal(en[0][1].interrupted, true);
  assert.ok(!d.tpEscaped && !d.channel);
  play(m, 8);
  assert.equal(ev.filter(e => e[0] === 'channelStart').length, 1, 'no second TP');
  assert.ok(!d.tpEscaped);
});

test('pickup: the nearest hero / enemy in reach takes it ("pickup" event, entity removed); a lifted unit cannot', () => {
  const m = thaw(build('tp_snipe', 'easy', 1)), ev = record(m.w, ['pickup']), w = m.w, h = m.h;
  IT.Status.add(w, h, 'lift', 2, { src: h.id, ability: 'tornado' });
  const p = U.spawnPickup(w, { kind: 'rune', x: h.x, y: h.y });
  w.step();
  assert.ok(!p.dead && ev.length === 0, 'lifted hero does not pick up');
  IT.Status.remove(w, h, 'lift'); w.step();
  assert.ok(p.dead);
  assert.equal(ev.length, 1);
  assert.deepEqual([ev[0][1].unit, ev[0][1].kind, ev[0][1].team], [h.id, 'rune', 0]);
});

test('ally: the attacker kills the ally ("allyDown") and the scenario fails "allyDied"', () => {
  const m = thaw(build('save_the_ally', 'easy', 1)), ev = record(m.w, ['allyDown']);
  const ally = m.w.ents.find(e => e.kind === 'ally');
  assert.ok(ally && ally.team === 0 && ally.hp < ally.maxHp, 'ally spawned hurt');
  m.h.autoAttack = false; play(m, 60);
  assert.equal(ev.length, 1);
  assert.equal(m.run.result.reason, 'allyDied');
});

test('Roshan: dies on its scripted hit ("roshanDown") and drops an Aegis pickup at its spot; the foe taking it fails "taken"', () => {
  const m = thaw(build('aegis_snatch', 'easy', 1)), ev = record(m.w, ['roshanDown', 'pickup']);
  const rosh = m.w.ents.find(e => e.kind === 'roshan');
  assert.ok(rosh && rosh.team === 2);
  m.h.autoAttack = false;
  play(m, 10, () => ev.some(e => e[0] === 'roshanDown'));
  const down = ev.find(e => e[0] === 'roshanDown');
  assert.ok(down, 'Roshan fell');
  const aegis = m.w.ents.find(e => !e.dead && e.kind === 'pickup');
  assert.ok(aegis && aegis.pickKind === 'aegis');
  assert.ok(Math.hypot(aegis.x - down[1].x, aegis.y - down[1].y) < 1);
  play(m, 30);
  assert.equal(m.run.result.reason, 'taken'); assert.equal(m.run.result.detail, 'aegis');
  // direct API
  const w = m.w, r2 = U.spawnRoshan(w, { x: 100, y: 100, frac: 0.1 });
  U.killRoshan(w, r2, null);
  assert.ok(r2.dead && w.ents.some(e => !e.dead && e.kind === 'pickup' && e.pickKind === 'aegis' && e.x === 100));
});

test('kill_with channel: a Sun Strike kill before the TP fails "method/channel", one during the TP clears', () => {
  const a = thaw(build('tp_snipe', 'easy', 2)); a.h.autoAttack = false;
  play(a, 0.3); nuke(a, a.run.dummies[0], 'sunstrike'); play(a, 1);
  assert.equal(a.run.result.reason, 'method'); assert.equal(a.run.result.detail, 'channel');
  const b = thaw(build('tp_snipe', 'easy', 2)), d = b.run.dummies[0]; b.h.autoAttack = false;
  play(b, 10, () => d.channel && d.channel.kind === 'tp');
  nuke(b, d, 'sunstrike'); play(b, 1);
  assert.equal(b.run.result.ok, true);
});

test('kill openInv: a kill whose fight did not open from Ghost Walk fails "method/openInv"', () => {
  const m = thaw(build('ghost_ambush', 'easy', 1)); m.h.autoAttack = false;
  play(m, 0.3); nuke(m, m.run.dummies[0], 'chaosmeteor'); play(m, 1);
  assert.equal(m.run.result.reason, 'method'); assert.equal(m.run.result.detail, 'openInv');
});

// ---------------------------------------------------------------- data rules
test('the 13 fun scenarios: tags, level, hero level +-1, boots, fog, intents, texts EN/PT incl. tip', () => {
  assert.deepEqual(FUN.map(s => s.id).sort(), IDS.slice().sort());
  for (const s of FUN) {
    assert.ok(s.tags.indexOf('fun') >= 0, s.id + ' fun tag');
    assert.ok(s.level >= 1 && s.level <= 10, s.id + ' level');
    for (const k of ['name', 'flair', 'desc', 'win', 'lose', 'tip']) {
      assert.ok(s[k] && s[k].en && s[k].pt && s[k].en !== s[k].pt, s.id + ' ' + k);
      assert.ok(IT.hasT('scn.' + s.id + '.' + k), s.id + ' key ' + k);
    }
    assert.ok(/^Dota: /.test(s.tip.en) && /^Dota: /.test(s.tip.pt), s.id + ' tip is the real Dota situation');
    for (const f of s.fail) if (f !== 'method' && f !== 'time' && f !== 'died') assert.ok(IT.hasT('scn.fail.' + f) && IT.hasT('rc.r.' + f), s.id + ' fail text ' + f);
    for (const seed of [1, 2, 3, 4, 5, 6]) for (const df of ['easy', 'common', 'hard']) {
      const m = build(s.id, df, seed), lo = m.pr.lo;
      assert.ok(Math.abs(lo.heroLevel - s.hero.lvl) <= 1, s.id + ' hero lvl ' + lo.heroLevel + ' vs ' + s.hero.lvl);
      assert.ok(lo.items.some(it => it === 'boots' || it === 'travels'), s.id + ' boots');
      assert.equal(m.pr.fog, true, s.id + ' fog');
      assert.equal(m.run.dummies.length, s.units.length, s.id + ' units');
      for (const d of m.run.dummies) assert.ok(d.intent && d.intent.kind, s.id + ' intent');
    }
  }
});

test('idle baselines: doing nothing loses every fun scenario, with the scenario-specific reason', () => {
  const WANT = { rune_contest: 'taken', save_the_ally: 'allyDied', tp_snipe: 'escaped', tornado_tp_cancel: 'escaped', bkb_tower_hitter: 'towerLost',
    smoke_gank_escape: 'caught', icewall_ramp_defense: 'cross', aegis_snatch: 'taken' };
  for (const s of FUN) for (const [df, seed] of [['easy', 1], ['common', 2]]) {
    const r = idle(s.id, df, seed).run.result;
    assert.equal(r.ok, false, s.id + ' ' + df);
    assert.equal(r.reason, WANT[s.id] || 'time', s.id + ' ' + df);
  }
});

// ---------------------------------------------------------------- bot
test('the step bot clears every fun scenario at easy seeds 1-4 and common seeds 1-3 (< 20 s)', () => {
  const t0 = Date.now(), bad = [];
  for (const s of FUN) for (const [df, seeds] of [['easy', [1, 2, 3, 4]], ['common', [1, 2, 3]]]) for (const seed of seeds) {
    const r = bot(s.id, df, seed);
    if (!(r && r.ok)) bad.push(s.id + '|' + df + '|' + seed + ' ' + (r ? r.reason + '/' + r.detail : 'none'));
  }
  assert.deepEqual(bad, []);
  assert.ok(Date.now() - t0 < 20000, 'sweep took ' + (Date.now() - t0) + ' ms');
});

test('the key spell is load-bearing: rune_contest without Tornado loses the race', () => {
  const sc = IT.SCENARIOS.get('rune_contest'), keep = sc.steps;
  sc.steps = keep.filter(s => s.a !== 'tornado');
  try {
    for (const [df, seed] of [['easy', 1], ['common', 1]]) { const r = bot('rune_contest', df, seed); assert.equal(r.reason, 'taken', df); }
  } finally { sc.steps = keep; }
});
