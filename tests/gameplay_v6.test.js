'use strict';
// v6 #30 gameplay / balance pass (docs/GAMEPLAY-REVIEW-v6.md): one test per fix.
//   economy: catalogue 1460 pts = 20-30 min at the re-sampled REF_RUN (POINTS_K 56, REF_RUN 250, MAX 30)
//   marchers never stop to fight (hold scenarios were an auto-attack win at hard+)
//   no BKB against a Sun Strike zone (pierces: KV SpellImmunityType ENEMIES_YES) + no tier BKB on marchers (bambam holds were 0/6)
//   gauntlet steps carry the Dust its invisible foe needs (the bot cleared nothing above easy)
const test = require('node:test');
const assert = require('node:assert');
const E = require('./_edgebot.js');
const { IT } = E, R = IT.Ranked;
const sc = id => IT.SCENARIOS.find(s => s.id === id);

function thaw(m) { for (let i = 0; i < 600 && m.run.frozen(); i++) m.run.tick(1 / 30); }
// right-click only: attack the nearest live foe until the scenario ends
function autoAttackOnly(id, diff, seed) {
  const m = E.build(id, diff, seed); thaw(m);
  const { w, h, run } = m, live = () => run.phase === 'play';
  h.autoAttack = true;
  for (let k = 0; k < 30 * 60 && live(); k += 10) {
    const f = run.dummies.filter(d => !d.dead).sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
    if (f) IT.Orders.issue(w, h, f.visible ? { type: 'attack', target: f.id } : { type: 'move', x: f.x, y: f.y });
    for (let i = 0; i < 10 && live(); i++) w.step();
  }
  return m.run.result;
}

test('#30 economy: the 1460-point catalogue unlocks in 20-30 min of normal play', () => {
  const S = IT.Shop || require('./_load.js')(['js/data/game.js', 'js/data/difficulty.js', 'js/data/relics.js', 'js/data/i18n.js', 'js/data/i18n/shop.js', 'js/data/shop.js']).Shop;
  const P = S.PRICING, min = S.minutesToUnlockAll();
  assert.ok(P.MAX <= 30 && P.MIN >= 20, 'goal band ' + P.MIN + '-' + P.MAX);
  assert.ok(min >= 20 && min <= 30, 'minutes ' + min.toFixed(1));
  assert.ok(P.REF_RUN >= 230 && P.REF_RUN <= 280, 'REF_RUN = score_sample common mean (clean + sloppy) ' + P.REF_RUN);
});

test('#30 marchers keep marching at hard+ (no auto-attack hold win)', () => {
  for (const id of ['jungle_hold', 'icewall_ramp_defense']) for (const df of ['hard', 'bambam']) {
    const m = E.build(id, df, 1);
    assert.ok(m.run.dummies.length && m.run.dummies.every(d => !d.fights), id + ' ' + df + ': a marcher fights');
    const r = autoAttackOnly(id, df, 1);
    assert.ok(r && !r.ok, id + ' ' + df + ' right-click only won');
  }
  const ch = E.build('pinned_escape', 'hard', 1);   // chasers still fight at hard
  assert.ok(ch.run.dummies.some(d => d.fights), 'hard chasers fight');
});

test('#30 BKB: no tier BKB on marchers; a foe never burns BKB on a Sun Strike zone (it pierces)', () => {
  assert.strictEqual(IT.DOTA.abilities.invoker_sun_strike.spellImmunity, 'ENEMIES_YES');
  const m = E.build('bridge_hold', 'bambam', 1);
  assert.ok(m.run.dummies.every(d => !(d.items || []).some(x => x && x.id === 'bkb')), 'bambam marcher carries the tier BKB');
  const rg = E.build('river_guard_2', 'bambam', 1);   // the scenario's own BKB carrier keeps it
  assert.strictEqual(rg.run.dummies.filter(d => (d.items || []).some(x => x && x.id === 'bkb')).length, 1);
  // a bambam chaser (tier BKB) standing in a Sun Strike zone: dodges / other items, never the BKB
  const c = E.build('pinned_escape', 'bambam', 1); thaw(c);
  const f = c.run.dummies[0], used = [];
  c.w.on('itemUse', p => { if (p.unit === f.id) used.push(p.ability); });
  assert.ok((f.items || []).some(x => x && x.id === 'bkb'), 'bambam chaser has the tier BKB');
  for (const ab of ['sunstrike']) E.prep(c.w, c.h, ab);
  IT.Orders.issue(c.w, c.h, { type: 'cast', ability: 'sunstrike', x: f.x, y: f.y });
  for (let i = 0; i < 45; i++) c.w.step();
  assert.ok(used.indexOf('bkb') < 0, 'BKB used vs Sun Strike: ' + used);
  for (const id of ['bridge_hold', 'offlane_survival']) {
    const r = E.bot(id, 'bambam', 1);
    assert.ok(r && r.ok, id + ' bambam bot: ' + JSON.stringify(r));
  }
});

test('#30 gauntlet: the steps Dust the invisible runner and the bot clears it', () => {
  const st = sc('gauntlet').steps;
  assert.strictEqual(st[0].a, 'dust');
  assert.deepStrictEqual(R.prepare(sc('gauntlet'), IT.DIFFICULTY.get('common')).need.indexOf('dust') >= 0, true);
  for (const df of ['easy', 'common']) {
    const r = E.bot('gauntlet', df, 1);
    assert.ok(r && r.ok, 'gauntlet ' + df + ': ' + JSON.stringify(r));
  }
});

test('#30 timed escapes need their recipe: walking straight away no longer clears ghost_escape / pinned_escape', () => {
  for (const id of ['ghost_escape', 'pinned_escape', 'smoke_gank_escape']) {
    const pr = R.prepare(sc(id), IT.DIFFICULTY.get('common'));
    assert.ok(pr.need.indexOf('ghostwalk') >= 0, id + ' need ' + pr.need);
    const m = E.build(id, 'ian', 1); thaw(m);
    const { w, h, run } = m;
    for (let k = 0; k < 30 * 20 && run.phase === 'play'; k += 10) {   // walk straight away from the nearest chaser, no spell
      const f = run.dummies.filter(d => !d.dead).sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
      if (f) { const a = Math.atan2(h.y - f.y, h.x - f.x), p = IT.Nav.nearestWalkable(w.map, h.x + Math.cos(a) * 500, h.y + Math.sin(a) * 500) || h; IT.Orders.issue(w, h, { type: 'move', x: p.x, y: p.y }); }
      for (let i = 0; i < 10 && run.phase === 'play'; i++) w.step();
    }
    assert.ok(run.result && !run.result.ok, id + ' ian walk-away won');
    const b = E.bot(id, 'common', 1);
    assert.ok(b && b.ok, id + ' common bot: ' + JSON.stringify(b));
  }
  assert.deepStrictEqual(R.prepare(sc('night_juke'), IT.DIFFICULTY.get('common')).need.length, 0);   // unseen jukes unchanged
});
