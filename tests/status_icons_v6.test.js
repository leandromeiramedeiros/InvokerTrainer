'use strict';
// v6: status-effect icon row above unit HP bars (js/render/units.js statusIcons/STATUS_ICON + 'status' sheet in js/art/icons.js tail).
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const load = require('./_load.js');
const ROOT = path.join(__dirname, '..');
const IT = load(['js/art/art.js', 'js/art/icons.js', 'js/render/units.js']);
const UD = IT.UnitDraw;

// every status type the sim can add: literal 3rd arg of Status.add / S.add, plus 'type' variables resolved by hand
function simStatuses() {
  const set = new Set();
  const dir = path.join(ROOT, 'js', 'sim');
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/\b(?:Status|S|St)\.add\(\s*[\w.]+\s*,\s*[\w.]+\s*,\s*'(\w+)'/g)) set.add(m[1]);
    for (const m of src.matchAll(/statuses\.push\(\s*\{\s*type:\s*'(\w+)'/g)) set.add(m[1]);
  }
  for (const t of ['root', 'silence', 'hex', 'leash', 'magicImmune', 'revealed', 'invisible', 'atosRoot']) set.add(t);   // added via variables / ranked scripts
  return [...set];
}

test('status icons: every sim status is mapped to an icon or explicitly internal', () => {
  const all = simStatuses();
  assert.ok(all.length >= 18, 'scan found ' + all.length);
  for (const t of all) assert.ok(UD.STATUS_ICON[t] || UD.STATUS_NONE[t], 'unmapped status ' + t);
  for (const t of ['stun', 'hex', 'lift', 'frozen', 'root', 'atosRoot', 'leash', 'silence', 'disarm', 'revealed', 'magicImmune', 'slow', 'burn', 'knockback', 'coldsnap', 'invisible', 'ghost'])
    assert.ok(UD.STATUS_ICON[t], t);
});

test('status icons: sheet frames exist for every mapped icon, 11x11 (<=12), outlined, rectangular', () => {
  const keys = new Set(Object.values(UD.STATUS_ICON).map(v => v[0]));
  assert.ok(keys.size >= 14);
  for (const k of keys) {
    const f = IT.Art.frame('status', 'st_' + k);
    assert.ok(f, 'missing st_' + k);
    assert.ok(f.length <= 12 && f.every(r => r.length === f[0].length && r.length <= 12), k + ' size');
    assert.ok(f.join('').includes('A'), k + ' outline');
    assert.ok(new Set(f.join('').replace(/\./g, '')).size <= 9, k + ' too many colours');
    assert.strictEqual(f[0][0], '.', k + ' corner transparent');
  }
});

test('status icons: priority order, one icon per key, cap 4, ghost own-team only', () => {
  const st = (type, until) => ({ type, until: until == null ? 5 : until, data: {} });
  const e = { team: 1, statuses: ['slow', 'burn', 'revealed', 'magicImmune', 'silence', 'root', 'frozen', 'lift', 'hex', 'stun'].map(t => st(t)) };
  const r = UD.statusIcons(e, 0);
  assert.deepStrictEqual([...r.map(x => x.key)], ['stun', 'hex', 'lift', 'frozen']);
  const e2 = { team: 1, statuses: ['slow', 'burn', 'revealed', 'magicImmune', 'silence', 'root', 'disarm'].map(t => st(t)) };
  assert.deepStrictEqual([...UD.statusIcons(e2, 0).map(x => x.key)], ['root', 'silence', 'disarm', 'revealed']);
  const e3 = { team: 1, statuses: [st('slow'), st('burn'), st('knockback')] };
  assert.deepStrictEqual([...UD.statusIcons(e3, 0).map(x => x.key)], ['slow', 'burn', 'knockback']);
  // root + atosRoot share one icon (longest remaining kept)
  const e4 = { team: 1, statuses: [st('root', 2), st('atosRoot', 4), st('stun', 1)] };
  const r4 = UD.statusIcons(e4, 0);
  assert.deepStrictEqual([...r4.map(x => x.key)], ['stun', 'root']);
  assert.strictEqual(r4[1].left, 4);
  // ghost / invisible: own hero only
  assert.deepStrictEqual([...UD.statusIcons({ team: 0, statuses: [st('ghost'), st('invisible')] }, 0).map(x => x.key)], ['ghost']);
  assert.strictEqual(UD.statusIcons({ team: 1, statuses: [st('ghost')] }, 0).length, 0);
  // internal / hidden / unknown statuses draw nothing
  assert.strictEqual(UD.statusIcons({ team: 0, statuses: [st('channel'), st('itemStats', Infinity), { type: 'towerProt', until: 0, hidden: true }, st('wat')] }, 0).length, 0);
  assert.strictEqual(UD.statusIcons({ team: 0 }, 0).length, 0);
  assert.strictEqual(UD.statusIcons({ team: 0, statuses: [st('stun', Infinity)] }, 0)[0].left, Infinity);
});

test('status icons: drawn by the hud pass behind the same visibility gate as the bars', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/render/units.js'), 'utf8');
  const i = src.indexOf('function hud(R, e)');
  const body = src.slice(i, src.indexOf('function bar(', i));
  assert.ok(body.indexOf('S.va < 0.5') >= 0 && body.indexOf('S.va < 0.5') < body.indexOf('statusRow('), 'gate before row');
  assert.ok(body.indexOf('statusRow(') < body.indexOf("has(e, 'hex') || !e.maxHp"), 'row before the hex/no-bar early return');
});

test('icons tail: status section is after the hand-drawn marker so icons_from_ref.py keeps it', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/art/icons.js'), 'utf8');
  const a = src.indexOf('// ---- hand-drawn scenario-HUD'), b = src.indexOf('// ---- hand-drawn status icons');
  assert.ok(a > 0 && b > a);
  assert.ok(src.lastIndexOf('})(typeof window') > b);
});
