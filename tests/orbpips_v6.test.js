'use strict';
// v6 #43: Dota-style orb level pips (7 steps + the Scepter bonus pip) shared by the HUD spell row and the loadout orb rows.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const load = require('./_load.js');
const ROOT = path.join(__dirname, '..');
const IT = load(['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/sim/util.js', 'js/sim/values.js', 'js/sim/loadout.js']);
const P = (() => {
  const ctx = vm.createContext({ Math, Object, Array });
  vm.runInContext('globalThis.window = globalThis;', ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/ui/orbpips.js'), 'utf8'), ctx);
  return ctx.IT.UI.orbPips;
})();

const ctxOf = lo => IT.Values.ctx(IT.Loadout.normalize(Object.assign(IT.Loadout.default(), lo)));
const pipsOf = (c, k) => P.counts(P.model(c.orbs[k], c.eff[k] - c.orbs[k], 7));

test('pips: 7 steps, lit = orb level, no scepter pip without the scepter', () => {
  const c = ctxOf({ heroLevel: 25, orbs: { quas: 7, wex: 3, exort: 0 } });
  assert.deepEqual(pipsOf(c, 'quas'), { total: 7, lit: 7 });
  assert.deepEqual(pipsOf(c, 'wex'), { total: 7, lit: 3 });
  assert.deepEqual(pipsOf(c, 'exort'), { total: 7, lit: 0 });
});

test('pips: the Scepter adds ONE extra special pip on the chosen orb only (8 total, lit = level + 1)', () => {
  const c = ctxOf({ heroLevel: 30, orbs: { quas: 7, wex: 7, exort: 4 }, scepter: true, scepterOrb: 'exort' });
  assert.equal(c.eff.exort, 5);
  assert.deepEqual(pipsOf(c, 'exort'), { total: 8, lit: 5 });
  assert.deepEqual(pipsOf(c, 'quas'), { total: 7, lit: 7 });
  const m = P.model(c.orbs.exort, c.eff.exort - c.orbs.exort, 7);
  assert.equal(m.filter(p => p.sc).length, 1); assert.ok(m[7].sc && m[7].on);
  assert.equal(m.slice(0, 7).filter(p => p.on).length, 4);
});

test('pips: model is clamped and safe on bad input', () => {
  assert.deepEqual(P.counts(P.model(99, 0, 7)), { total: 7, lit: 7 });
  assert.deepEqual(P.counts(P.model(-3, 0, 7)), { total: 7, lit: 0 });
  assert.deepEqual(P.counts(P.model(undefined, 0)), { total: 7, lit: 0 });
});

test('pips: DOM builder renders one <i.op> per pip with on/sc classes and the orb colour class', () => {
  const mkEl = (tag, a) => {
    const e = { tag, cls: (a && a.class) || '', kids: [], appendChild(c) { e.kids.push(c); return c; } };
    return e;
  };
  const h = (tag, a) => mkEl(tag, a);
  const box = P.el(h, 'wex', P.model(3, 1, 7));
  assert.equal(box.cls, 'opips wex'); assert.equal(box.kids.length, 8);
  assert.equal(box.kids.filter(i => /\bon\b/.test(i.cls)).length, 4);
  assert.equal(box.kids.filter(i => /\bsc\b/.test(i.cls)).length, 1);
  const seen = []; P.el(h, 'quas', P.model(2, 0, 7), (i, p) => seen.push(p.n));
  assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 7]);
});

test('wiring: HUD builds pips for Q/W/E (no corner number), loadout orb rows use the shared builder, script loaded', () => {
  const hud = fs.readFileSync(path.join(ROOT, 'js/ui/hud.js'), 'utf8'), lo = fs.readFileSync(path.join(ROOT, 'js/ui/loadout.js'), 'utf8'), ix = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(/IT\.UI\.orbPips\.el\(/.test(hud)); assert.ok(!/setText\(b\.lvl, String\(eff\[k\]\)/.test(hud), 'corner level number removed');
  assert.ok(/IT\.UI\.orbPips\.el\(/.test(lo));
  assert.ok(ix.indexOf('js/ui/orbpips.js') > ix.indexOf('js/ui/menus.js'), 'orbpips.js loads after menus.js (which resets IT.UI)');
  assert.ok(ix.indexOf('js/ui/itemdrag.js') > ix.indexOf('js/ui/menus.js'));
});
