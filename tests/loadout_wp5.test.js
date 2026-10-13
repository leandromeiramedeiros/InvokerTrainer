'use strict';
// WP5 loadout widgets: orb-click Scepter/Shard state machine (IT.Agh.orbClick), upgrade lines, agh i18n pack, 7 orb steps.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const PACKS = [...html.matchAll(/src="(js\/data\/i18n\/\w+\.js)(?:\?v=\w+)?"/g)].map(m => m[1]);
const FILES = ['js/data/i18n.js'].concat(PACKS, ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/sim/util.js', 'js/sim/values.js', 'js/sim/loadout.js', 'js/sim/agh.js']);
const ctx = vm.createContext({ console, Math, JSON, Date, Map, Set, Array, Object, Number, String, Boolean, Error, Symbol, Promise, Infinity, NaN, isFinite, isNaN, parseInt, parseFloat });
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const IT = ctx.IT, A = IT.Agh;
const fresh = () => IT.Loadout.normalize(IT.Loadout.default());
const st = lo => [lo.scepter ? lo.scepterOrb : null, lo.shard ? lo.shardSpell : null];

test('orbClick: 1st click = Scepter, 2nd = Shard on that orb, 3rd = both removed', () => {
  const lo = fresh();
  let r = A.orbClick(lo, 'wex'); assert.equal(r.add, 'scepter'); assert.deepEqual(st(lo), ['wex', null]);
  r = A.orbClick(lo, 'wex'); assert.equal(r.add, 'shard'); assert.deepEqual(st(lo), ['wex', 'emp']);
  r = A.orbClick(lo, 'wex'); assert.equal(r.add, null); assert.deepEqual(st(lo), [null, null]);
  assert.ok(IT.Loadout.validate(lo).ok);
});

test('orbClick: Scepter and Shard may sit on different orbs; shard-only click removes it', () => {
  const lo = fresh();
  A.orbClick(lo, 'quas');                       // scepter quas
  A.orbClick(lo, 'quas');                       // shard ghostwalk
  A.orbClick(lo, 'exort');                      // both placed -> scepter moves to exort
  assert.deepEqual(st(lo), ['exort', 'ghostwalk']);
  assert.ok(IT.Loadout.validate(lo).ok);
  A.orbClick(lo, 'quas');                       // only the shard on quas -> removed
  assert.deepEqual(st(lo), ['exort', null]);
  A.orbClick(lo, 'wex');                        // free shard goes to the clicked orb's spell
  assert.deepEqual(st(lo), ['exort', 'emp']);
  A.orbClick(lo, 'exort');                      // scepter only on exort -> shard joins (moves) to sunstrike
  assert.deepEqual(st(lo), ['exort', 'sunstrike']);
  assert.ok(IT.Loadout.validate(lo).ok);
});

test('orbClick: every orb reaches Scepter-only', () => {
  for (const k of A.ORBS) { const lo = fresh(); A.orbClick(lo, k); assert.deepEqual(st(lo), [k, null]); assert.equal(A.scepterAt(lo, k), true); }
});

test('upgradeLine: per orb scepter / per spell shard, null when unset', () => {
  const lo = fresh();
  assert.equal(A.upgradeLine(lo, 'scepter'), null); assert.equal(A.upgradeLine(lo, 'shard'), null);
  A.orbClick(lo, 'wex'); A.orbClick(lo, 'wex');
  const s = A.upgradeLine(lo, 'scepter'), h = A.upgradeLine(lo, 'shard');
  assert.equal(s.spell, 'tornado'); assert.equal(s.orb, 'wex'); assert.equal(s.k, 'agh.up.sc.wex');
  assert.equal(h.spell, 'emp'); assert.equal(h.k, 'agh.up.sh.emp');
  for (const u of [s, h]) assert.ok(IT.t(u.k, u.v) && !/^agh\.up/.test(IT.t(u.k, u.v)), u.k + ' resolves');
});

test('agh i18n pack: en/pt parity and same {placeholders}', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/data/i18n/agh.js'), 'utf8');
  const box = vm.createContext({ IT: { i18nAdd: p => { box.pack = p; } } });
  vm.runInContext(src, box);
  const { en, pt } = box.pack;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(pt).sort());
  const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join();
  for (const k of Object.keys(en)) assert.equal(ph(pt[k]), ph(en[k]), k);
  for (const k of ['agh.up.sc.quas', 'agh.up.sc.wex', 'agh.up.sc.exort', 'agh.up.sh.ghostwalk', 'agh.up.sh.emp', 'agh.up.sh.sunstrike', 'lo.bead', 'lo.itemSlotKey']) assert.ok(en[k], k);
});

test('7 orb steps; agh.js i18n + hood.js load before loadout.js', () => {
  assert.equal(IT.RULES.orbMax, 7);
  const at = f => html.indexOf('src="' + f + '?');
  assert.ok(at('js/data/i18n/agh.js') > 0 && at('js/art/hood.js') > 0);
  assert.ok(at('js/data/i18n/agh.js') < at('js/ui/loadout.js') && at('js/art/hood.js') < at('js/ui/loadout.js'));
  assert.ok(at('js/data/i18n/agh.js') > at('js/data/i18n/v6.js'), 'agh pack overrides v6 (tip.maxOrb)');
});
