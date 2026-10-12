'use strict';
// F1: scenario HUD helpers (step derivation, orb-press planning, progress tracker, lose line keys). Pure, no DOM.
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load.js');
const IT = load(['js/data/game.js', 'js/data/scenarios.js', 'js/ui/hudsteps.js']);
const HS = IT.HudSteps;
const eq = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);   // vm-context arrays have a foreign prototype

test('derive: steps win over sol; kinds are classified', () => {
  const sc = { steps: [{ a: 'tornado', label: { en: 'lift' } }, { a: 'blink' }, { a: 'attack' }, { a: 'move' }, { a: 'pos' }, null], sol: [{ a: 'emp' }] };
  const d = HS.derive(sc);
  eq(d.map(s => s.k + (s.id ? ':' + s.id : '')), ['spell:tornado', 'item:blink', 'attack', 'move', 'pos']);
  eq(d[0].label, { en: 'lift' });
});
test('derive: falls back to sol, then spells; every shipped scenario yields steps', () => {
  eq(HS.derive({ sol: [{ a: 'emp' }, { a: 'attack' }] }).map(s => s.k), ['spell', 'attack']);
  eq(HS.derive({ spells: ['sunstrike'] }).map(s => s.id), ['sunstrike']);
  eq(HS.derive({}), []);
  for (const sc of IT.SCENARIOS) assert.ok(HS.derive(sc).length > 0, sc.id);
});
test('planOrbs: queue ends holding the recipe in <= 3 presses', () => {
  for (const spell of Object.keys(IT.GAME.SPELL_ORBS)) {
    const rec = IT.GAME.SPELL_ORBS[spell];
    for (const start of [[], ['Q'], ['Q', 'W', 'E'], ['E', 'E', 'E'], ['W', 'W', 'E']]) {
      const p = HS.planOrbs(start, rec);
      assert.ok(p.seq.length <= 3, spell);
      assert.strictEqual(p.q.slice().sort().join(''), rec.split('').sort().join(''), spell + start);
    }
  }
  assert.strictEqual(HS.planOrbs(['W', 'W', 'E'], 'WWE').seq.length, 0);
  assert.strictEqual(HS.planOrbs(['W', 'W'], 'WWE').seq.join(''), 'E');
});
test('plan: orb presses, invoke, cast slot; already invoked skips; item slot', () => {
  const st = HS.derive({ steps: [{ a: 'alacrity' }, { a: 'tornado' }, { a: 'alacrity' }, { a: 'blink' }] });
  const pl = HS.plan(st, { orbs: [], slots: [null, null], items: [null, 'blink'] });
  eq(pl[0].presses.map(p => p.t), ['orb', 'orb', 'orb', 'inv', 'cast']);
  assert.strictEqual(pl[0].presses[4].slot, 0);
  assert.ok(pl[1].presses.some(p => p.t === 'inv'));
  eq(pl[2].presses.map(p => p.t), ['cast']);   // alacrity is still in slot 2 after tornado
  assert.strictEqual(pl[2].presses[0].slot, 1);
  eq(pl[3].presses.map(p => [p.t, p.slot]), [['item', 1]]);
  const pre = HS.plan(HS.derive({ steps: [{ a: 'emp' }] }), { orbs: [], slots: ['emp', null] });
  eq(pre[0].presses.map(p => p.t), ['cast']);
});
test('tracker: orbs -> invoke -> cast completes the step, next becomes current', () => {
  const tr = HS.tracker(HS.plan(HS.derive({ steps: [{ a: 'alacrity' }, { a: 'attack' }] }), { orbs: [], slots: [null, null] }));
  eq(tr.states(), ['now', 'todo']);
  const seq = tr.steps[0].presses.filter(p => p.t === 'orb').map(p => p.o);
  eq(seq.slice().sort(), ['E', 'W', 'W']);
  tr.feed({ type: 'orb', orb: seq[0] });
  eq(tr.pressStates(0).slice(0, 3), ['done', 'now', 'todo']);
  tr.feed({ type: 'orb', orb: 'Q' });   // not needed: ignored
  eq(tr.pressStates(0).slice(0, 3), ['done', 'now', 'todo']);
  tr.feed({ type: 'orb', orb: seq[1] }); tr.feed({ type: 'orb', orb: seq[2] });
  eq(tr.pressStates(0), ['done', 'done', 'done', 'now', 'todo']);
  tr.feed({ type: 'invoke', spell: 'alacrity' });
  eq(tr.pressStates(0), ['done', 'done', 'done', 'done', 'now']);
  eq(tr.states(), ['now', 'todo']);
  tr.feed({ type: 'cast', ability: 'alacrity' });
  eq(tr.states(), ['done', 'now']);
  assert.ok(!tr.finished());
  tr.feed({ type: 'attack' });
  eq(tr.states(), ['done', 'done']);
  assert.ok(tr.finished());
});
test('tracker: invoke of a later spell marks that step, cast skips ahead (window), unrelated events ignored', () => {
  const tr = HS.tracker(HS.plan(HS.derive({ steps: [{ a: 'tornado' }, { a: 'emp' }, { a: 'sunstrike' }, { a: 'chaosmeteor' }, { a: 'deafeningblast' }] }), { orbs: [], slots: [null, null] }));
  tr.feed({ type: 'cast', ability: 'refresher' }); tr.feed({ type: 'move' }); tr.feed({ type: 'attack' });
  assert.strictEqual(tr.states()[0], 'now');
  tr.feed({ type: 'cast', ability: 'sunstrike' });   // skipped tornado + emp
  eq(tr.states(), ['done', 'done', 'done', 'now', 'todo']);
  tr.feed({ type: 'cast', ability: 'deafeningblast' });   // 1 step ahead: still inside the window
  eq(tr.states(), ['done', 'done', 'done', 'done', 'done']);
  tr.feed({ type: 'cast', ability: 'emp' });   // after the end: no throw
});
test('tracker: repeated spell matches in order; move / pos steps', () => {
  const tr = HS.tracker(HS.plan(HS.derive({ steps: [{ a: 'move' }, { a: 'pos' }, { a: 'chaosmeteor' }, { a: 'refresher' }, { a: 'chaosmeteor' }] }), { orbs: ['E', 'E', 'W'], slots: ['chaosmeteor', null], items: ['refresher'] }));
  tr.feed({ type: 'move' }); eq(tr.states().slice(0, 3), ['done', 'now', 'todo']);
  tr.feed({ type: 'move' }); assert.strictEqual(tr.states()[1], 'done');
  tr.feed({ type: 'cast', ability: 'chaosmeteor' }); tr.feed({ type: 'cast', ability: 'refresher' });
  eq(tr.states().slice(2), ['done', 'done', 'now']);
});
test('loseKeys', () => {
  eq(HS.loseKeys({ fail: ['time', 'died', 'died', 'cross'] }, true), ['time', 'died', 'cross']);
  eq(HS.loseKeys({ fail: ['time', 'died'] }, false), ['died']);
  eq(HS.loseKeys({ obj: { type: 'escape' } }, true), ['caught', 'time']);
  eq(HS.loseKeys({ obj: { type: 'kill' } }, false), []);
  assert.strictEqual(HS.fmtN(1.25), '1.3');
});
test('derive + tracker: stop / hold steps', () => {
  const d = HS.derive({ steps: [{ a: 'stop' }, { a: 'hold' }, { a: 'attack' }] });
  eq(d.map(s => s.k), ['stop', 'hold', 'attack']);
  const tr = HS.tracker(HS.plan(d, { orbs: [], slots: [null, null] }));
  tr.feed({ type: 'stop' }); eq(tr.states().slice(0, 2), ['done', 'now']);
  tr.feed({ type: 'hold' }); eq(tr.states().slice(0, 2), ['done', 'done']);
});
