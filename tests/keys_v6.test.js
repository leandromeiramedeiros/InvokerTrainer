'use strict';
// v6 hotkeys: Space freed, center F1, recipe sheet I, live stats O, reset dummies [; migration of stored old defaults; no clashes; F-key preventDefault.
const test = require('node:test'), assert = require('node:assert');
const { rig } = require('./input_rig');

const S = () => rig().IT.Settings;

test('defaults: new common keys, Space unbound', () => {
  const s = S(), c = s.defaults().keys.common;
  assert.equal(c.center, 'F1'); assert.equal(c.cheat, 'I'); assert.equal(c.stats, 'O'); assert.equal(c.spawn, 'P'); assert.equal(c.resetDummies, '[');
  assert.equal(c.camLock, 'L'); assert.equal(c.refresh, 'Backspace');
  const d = s.defaults();
  for (const sc of ['slots', 'legacy']) assert.ok(!s.entries(d, sc).some(e => e.key === 'Space'), sc + ': nothing on Space');
  assert.equal(d.keysVersion, s.KEYS_VERSION);
});

test('migration: stored old defaults -> new defaults', () => {
  const s = S(), old = { center: 'Space', cheat: 'F1', stats: 'K', resetDummies: 'O' };
  const d = s.merge(s.defaults(), { keys: { common: Object.assign({ orbQ: 'Q', spawn: 'P' }, old) } });
  assert.deepEqual([d.keys.common.center, d.keys.common.cheat, d.keys.common.stats, d.keys.common.resetDummies], ['F1', 'I', 'O', '[']);
  assert.equal(d.keysVersion, s.KEYS_VERSION);
  assert.equal(s.conflicts(d).size, 0);
});

test('migration: custom binds are kept, only old-default ones move', () => {
  const s = S();
  const d = s.merge(s.defaults(), { keys: { common: { center: 'G', cheat: 'F1', stats: 'M', resetDummies: 'O' } } });
  assert.equal(d.keys.common.center, 'G'); assert.equal(d.keys.common.stats, 'M');
  assert.equal(d.keys.common.cheat, 'I'); assert.equal(d.keys.common.resetDummies, '[');
  assert.equal(s.conflicts(d).size, 0);
});

test('migration: runs once (keysVersion current -> stored values are never rewritten)', () => {
  const s = S();
  const d = s.merge(s.defaults(), { keysVersion: s.KEYS_VERSION, keys: { common: { center: 'Space', cheat: 'F1', stats: 'K', resetDummies: 'O' } } });
  assert.deepEqual([d.keys.common.center, d.keys.common.cheat, d.keys.common.stats, d.keys.common.resetDummies], ['Space', 'F1', 'K', 'O']);
});

test('migration: a new default already taken by a custom bind keeps the old key (no new clash)', () => {
  const s = S();
  const d = s.merge(s.defaults(), { keys: { common: { center: 'Space', cheat: 'F1', stats: 'K', resetDummies: 'O', spawn: 'I' } } });   // spawn on I
  assert.equal(d.keys.common.cheat, 'F1', 'cheat keeps F1');
  assert.equal(d.keys.common.center, 'Space', 'F1 is held by cheat: center keeps Space');
  assert.equal(s.conflicts(d).size, 0);
  const d2 = s.merge(s.defaults(), { keys: { common: { stats: 'K', resetDummies: 'O', refresh: '[' } } });   // [ taken
  assert.equal(d2.keys.common.resetDummies, 'O'); assert.equal(d2.keys.common.stats, 'K', 'stats waits behind O');
  assert.equal(s.conflicts(d2).size, 0);
});

test('keyName: [ ] and friends round-trip through label / actionFor', () => {
  const s = S();
  assert.equal(s.keyName({ code: 'BracketLeft', key: '[' }), '[');
  assert.equal(s.keyName({ code: 'BracketRight', key: ']' }), ']');
  assert.equal(s.keyName({ code: '', key: '[' }), '[');
  assert.equal(s.keyName({ code: 'F1', key: 'F1' }), 'F1');
  assert.equal(s.keyName({ code: 'Space', key: ' ' }), 'Space');
  assert.equal(s.label('['), '['); assert.equal(s.label(']'), ']');
  const d = s.defaults();
  assert.equal(s.actionFor('[', d), 'resetDummies'); assert.equal(s.actionFor('I', d), 'cheat'); assert.equal(s.actionFor('O', d), 'stats');
  assert.equal(s.actionFor('F1', d), 'center'); assert.equal(s.actionFor('Space', d), null);
  d.keys.common.spawn = s.keyName({ code: 'BracketRight', key: ']' });
  assert.equal(s.keyOf('spawn', d), ']'); assert.equal(s.conflicts(d).size, 0);
});

test('no conflicts across default, legacy and slots layouts', () => {
  const s = S(), d = s.defaults();
  for (const sc of [undefined, 'slots', 'legacy']) assert.equal(s.conflicts(d, sc).size, 0, 'layout ' + sc);
  const all = [];
  for (const sc of ['slots', 'legacy']) for (const e of s.entries(d, sc)) all.push(e.key);
  for (const k of ['I', 'O', '[', 'F1']) assert.ok(!s.RESERVED.includes(k));
  assert.ok(all.includes('I') && all.includes('O') && all.includes('['));
});

test('input: F1 = select hero / center; Space does nothing and never ends the countdown', () => {
  const r = rig({ autoAttack: false });
  r.In.selected = r.dummy.id; r.at(10);
  r.key('F1'); assert.equal(r.In.selected, null); assert.deepEqual(r.In.sel.units, [r.h.id]);
  r.key('F1'); assert.deepEqual(r.cam.c, [r.h.x, r.h.y]);
  const f = rig({ autoAttack: false }); f.skips = 0;
  f.In.hooks.inspect = () => f.w.paused; f.In.hooks.skip = () => { f.skips++; f.w.paused = false; return true; };
  f.w.paused = true;
  let pd = false; f.key(' ', { preventDefault() { pd = true; } });
  assert.equal(f.skips, 0); assert.equal(f.w.paused, true); assert.equal(f.cam.c, null); assert.ok(pd, 'Space still swallowed (no page scroll)');
});

test('input: F1 always preventDefault (browser help) incl. paused / frozen; bound F keys too; unbound ones left alone', () => {
  const r = rig({ autoAttack: false });
  const run = (k, setup) => { let pd = false; if (setup) setup(); const ev = r.down(k, { preventDefault() { pd = true; } }); r.up(ev); return pd; };
  assert.ok(run('F1'), 'running');
  assert.ok(run('F1', () => { r.w.paused = true; }), 'paused');
  r.In.hooks.inspect = () => true;
  assert.ok(run('F1'), 'frozen countdown');
  r.w.paused = false; r.In.hooks.inspect = null;
  assert.equal(run('F5'), false, 'unbound F5 untouched (reload works)');
  r.IT.Settings.data.keys.common.spawn = 'F5';
  assert.ok(run('F5'), 'bound F5 swallowed');
  r.IT.Settings.data.keys.common.spawn = 'P';
});

test('input: I opens the recipe sheet, O holds live stats, [ resets dummies', () => {
  const r = rig({ autoAttack: false }); r.at(10);
  const calls = []; r.In.hooks.cheat = () => calls.push('cheat'); r.In.hooks.resetDummies = () => calls.push('reset'); r.In.hooks.statsHold = v => calls.push('stats' + v);
  r.key('i'); r.key('['); const ev = r.down('o'); r.up(ev);
  assert.deepEqual(calls, ['cheat', 'reset', 'statstrue', 'statsfalse']);
});
