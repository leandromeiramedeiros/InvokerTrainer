'use strict';
// TODO batch: Select hero / Center camera, instant-cast rangefinder only on HUD hover, countdown skipped by the first action (which also runs).
const test = require('node:test'), assert = require('node:assert');
const { rig } = require('./input_rig');

// frozen countdown harness: world paused, hooks mimic main.js (inspect while frozen, skip unfreezes)
function frozen(o) {
  const r = rig(Object.assign({ autoAttack: false }, o));
  r.skips = 0;
  r.In.hooks.inspect = () => r.w.paused;
  r.In.hooks.skip = () => { if (!r.w.paused) return false; r.w.paused = false; r.skips++; return true; };
  r.w.paused = true;
  return r;
}

test('center: 1st press selects the hero (spirits/foe deselected), 2nd centers', () => {
  const r = rig({ autoAttack: false });
  r.In.setSel([r.h.id, 9999], 'all', false);          // hero + a (dead/unknown) unit
  r.In.selected = r.dummy.id;
  r.key(' ');
  assert.equal(r.In.selected, null); assert.deepEqual(r.In.sel.units, [r.h.id]); assert.equal(r.In.sel.group, 'hero');
  assert.equal(r.cam.c, null);
  r.key(' ');
  assert.deepEqual(r.cam.c, [r.h.x, r.h.y]);
});

test('instant casts: no rangefinder from a held key, only while the HUD icon is hovered', () => {
  const r = rig({ autoAttack: false });
  r.h.inv.slots[0] = 'ghostwalk';
  const ev = r.down('d');                               // slot1 key held
  assert.equal(r.In.previewId(), null, 'held key shows nothing');
  r.up(ev);
  r.In.preview = () => r.h.inv.slots[0];                // HUD hover
  assert.equal(r.In.previewId(), 'ghostwalk');
  r.In.preview = 'ghostwalk'; assert.equal(r.In.previewId(), 'ghostwalk');
  r.In.preview = null; assert.equal(r.In.previewId(), null);
  r.In.preview = 'coldsnap'; assert.equal(r.In.previewId(), null, 'targeted spells never preview on hover');
});

test('countdown: camera / center / inspect do not skip', () => {
  const r = frozen();
  r.key(' '); r.key(' ');
  assert.equal(r.skips, 0); assert.equal(r.w.paused, true);
  assert.deepEqual(r.cam.c, [r.h.x, r.h.y], 'center works while frozen');
  r.click(0); r.winUp(0);                               // LMB = inspect / select only
  assert.equal(r.skips, 0);
});

test('countdown: first orb key skips AND is executed', () => {
  const r = frozen();
  r.key('q');
  assert.equal(r.skips, 1); assert.equal(r.w.paused, false);
  assert.equal(r.h.inv.orbs.length, 1, 'the orb press was not swallowed');
});

test('countdown: first RMB skips and issues the order', () => {
  const r = frozen();
  r.click(2);
  assert.equal(r.skips, 1);
  assert.equal(r.orders.length, 1); assert.match(r.orders[0].type, /^(move|attack)$/);
});

test('countdown: first spell cast (quick) skips and casts', () => {
  const r = frozen({ castMode: 'quick' });
  r.h.inv.slots[0] = 'ghostwalk';
  r.key('d');
  assert.equal(r.skips, 1);
  r.at(500);
  assert.ok(r.casts.includes('ghostwalk'), 'cast went through');
});

test('countdown: attack key skips and arms; HUD action too', () => {
  const r = frozen();
  r.key('a');
  assert.equal(r.skips, 1); assert.ok(r.In.armed && r.In.armed.attack);
  const r2 = frozen();
  r2.In.doAction('orbW', { hud: true });
  assert.equal(r2.skips, 1); assert.equal(r2.h.inv.orbs.length, 1);
});

test('no skip hook effect when not inspecting (menu/paused): actions ignored', () => {
  const r = rig({ autoAttack: false });
  r.w.paused = true;                                    // pause menu: inspecting() false
  r.key('q'); r.click(2);
  assert.equal(r.h.inv.orbs.length, 0); assert.equal(r.orders.length, 0);
});
