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

// ---- item 32: LARGE sheet, buff/debuff classification, uncapped list, row placement ----
test('status icons: every mapped key is in BOTH sheets (11 px + large <= 22 px, outlined, shared art source)', () => {
  const keys = new Set(Object.values(UD.STATUS_ICON).map(v => v[0]));
  for (const k of keys) {
    const s = IT.Art.frame('status', 'st_' + k), L = IT.Art.frame('statusL', 'st_' + k);
    assert.ok(s && L, 'missing st_' + k);
    assert.ok(L.length <= 22 && L.length >= 16 && L.every(r => r.length === L[0].length && r.length <= 22 && r.length >= 16), k + ' large size ' + L.length + 'x' + L[0].length);
    assert.ok(L.join('').includes('A'), k + ' large outline');
    assert.strictEqual(L[0][0], '.', k + ' large corner transparent');
    assert.ok(new Set(L.join('').replace(/\./g, '')).size >= 4, k + ' large art too flat');
  }
  const f = IT.Art.frame('status', 'st_stun');
  assert.strictEqual(f.length + 'x' + f[0].length, '11x11');
});

test('status kind: every sim status is classified (or internal); dual = buff only on self-cast', () => {
  for (const t of simStatuses()) assert.ok(UD.STATUS_KIND[t] || UD.STATUS_NONE[t], 'unclassified status ' + t);
  for (const t in UD.STATUS_ICON) assert.ok(['buff', 'debuff', 'dual'].includes(UD.STATUS_KIND[t]), 'bad kind ' + t);
  const e = { id: 7, team: 0 };
  for (const t of ['stun', 'hex', 'frozen', 'root', 'atosRoot', 'silence', 'disarm', 'revealed', 'slow', 'burn', 'coldsnap', 'melt', 'leash'])
    assert.strictEqual(UD.statusIsBuff(t, e, { src: 7 }), false, t + ' is a debuff even self-inflicted');
  for (const t of ['alacrity', 'ghost', 'magicImmune', 'invisible', 'invisFade'])
    assert.strictEqual(UD.statusIsBuff(t, e, { src: 99 }), true, t + ' is a buff');
  for (const t of ['lift', 'knockback']) {
    assert.strictEqual(UD.statusIsBuff(t, e, { src: 7 }), true, t + ' self');
    assert.strictEqual(UD.statusIsBuff(t, e, { src: 3 }), false, t + ' foreign');
    assert.strictEqual(UD.statusIsBuff(t, e, {}), false, t + ' no src');
  }
});

test('status list: uncapped, priority sorted, one entry per icon key, buff flag + stack count', () => {
  const st = (type, until, extra) => Object.assign({ type, until: until == null ? 5 : until, data: {} }, extra);
  const e = { id: 1, team: 0, statuses: ['slow', 'burn', 'revealed', 'magicImmune', 'silence', 'root', 'frozen', 'lift', 'hex', 'stun', 'alacrity', 'ghost', 'disarm', 'coldsnap'].map(t => st(t)) };
  const L = UD.statusList(e, 0);
  assert.strictEqual(L.length, 14, 'uncapped');
  assert.strictEqual(UD.statusIcons(e, 0).length, 4, 'world row stays capped');
  for (let i = 1; i < L.length; i++) assert.ok(L[i - 1].pri >= L[i].pri, 'priority order');
  assert.strictEqual(L[0].key, 'stun');
  assert.strictEqual(L.find(x => x.type === 'alacrity').buff, true);
  assert.strictEqual(L.find(x => x.type === 'slow').buff, false);
  assert.strictEqual(L.find(x => x.type === 'lift').buff, false, 'foreign lift = debuff');
  assert.strictEqual(UD.statusList({ id: 1, team: 0, statuses: [st('lift', 5, { src: 1 })] }, 0)[0].buff, true, 'self lift = buff');
  const m = UD.statusList({ id: 2, team: 1, statuses: [st('melt', 4, { data: { stacks: 3 } })] }, 0)[0];
  assert.strictEqual(m.count, 3); assert.strictEqual(m.key, 'melt');
  const r = UD.statusList({ id: 2, team: 1, statuses: [st('root', 2), st('atosRoot', 4)] }, 0);
  assert.strictEqual(r.length, 1); assert.strictEqual(r[0].left, 4); assert.strictEqual(r[0].count, 2);
  assert.strictEqual(UD.statusList({ id: 2, team: 1, statuses: [st('stun', 5)] }, 3)[0].left, 2, 'relative to world time');
  assert.strictEqual(UD.statusList({ id: 2, team: 1 }, 0).length, 0);
});

test('status HUD row: 22 px cells, debuffs before buffs, green/red frames, tooltip, capped at MAX_STATUS_HUD', () => {
  const hud = fs.readFileSync(path.join(ROOT, 'js/ui/hud.js'), 'utf8'), css = fs.readFileSync(path.join(ROOT, 'css/hud.css'), 'utf8');
  assert.ok(UD.MAX_STATUS_HUD >= 6);
  assert.ok(/SBF_PX\s*=\s*22\b/.test(hud), 'cell canvas is 22 px');
  assert.ok(hud.includes("'statusL'"), 'uses the large sheet');
  assert.ok(hud.includes('data-tip'), 'tooltip');
  assert.ok(/\.sbf\.debuff\s*\{[^}]*border-color:#d0/.test(css) && /\.sbf\s*\{[^}]*border:[^;]*#3fae38/.test(css), 'green buff / red debuff frames');
  const i = hud.indexOf('function sbfOrder');
  assert.ok(/!x\.buff\)\.concat\(list\.filter\(x => x\.buff\)\)/.test(hud.slice(i, i + 200)), 'debuffs first');
});

test('status i18n: every STATUS_ICON type has a status.<type> name in en and pt', () => {
  const T = load(['js/data/i18n.js', 'js/data/i18n/v6.js']);
  for (const t of Object.keys(UD.STATUS_ICON)) for (const l of ['en', 'pt']) assert.ok(T.I18N[l]['status.' + t], 'status.' + t + ' (' + l + ')');
});

test('status row placement: clears orbs (hexed hero), name tag, telegraph and the Alacrity sigil', () => {
  const hero = (orbs, sts) => ({ id: 1, kind: 'hero', team: 0, maxHp: 100, inv: { orbs }, statuses: (sts || []).map(t => ({ type: t, until: 9, data: {} })) });
  const full = hero(['q', 'w', 'e']), none = hero([]);
  assert.ok(UD.statusRowD(full, { top: 10 }) >= 24 + 8, 'short (hexed) sprite: row above the orb orbit');
  assert.ok(UD.statusRowD(full, { top: 40 }) >= 40 + 8, 'tall sprite: above the head');
  assert.ok(UD.statusRowD(none, { top: 10 }) < UD.statusRowD(full, { top: 10 }), 'no orbs: tighter');
  assert.ok(UD.statusRowD(hero(['q', 'w', 'e'], ['alacrity']), { top: 30 }) >= 30 + 14 + 7, 'above the alacrity sigil ring');
  const foe = { id: 2, kind: 'enemy', team: 1, name: 'Pedro', maxHp: 50, statuses: [] };
  assert.ok(UD.statusRowD(foe, { top: 30 }) >= 30 + 16, 'above the name tag');
  assert.ok(UD.statusRowD(Object.assign({ tele: {} }, foe), { top: 30 }) >= 30 + 16 + 20, 'above the telegraph');
  const sp = { id: 3, kind: 'spirit', team: 0, maxHp: 10, statuses: [] };
  assert.ok(UD.statusRowD(sp, { top: 16 }) >= 16 + 7, 'forge spirit');
  assert.ok(UD.statusRowD({ id: 4, kind: 'dummy', scarecrow: true, team: 1, maxHp: 10, statuses: [] }, { top: 30 }) >= 34, 'scarecrow');
});
