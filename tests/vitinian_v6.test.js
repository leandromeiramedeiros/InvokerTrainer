'use strict';
// v6 #63 + #65: Vitinho art v2 (replaces the monkey sheet, same frame set) and the Vitinian (34x28 two-headed ogre, 48x32 wide portrait): sheets, SKIN_META,
// shop entry + i18n, per-skin click box / hull, and the HUD portrait helper that letterboxes a wide portrait.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const load = require('./_load.js');
const env = require('./_unitsenv.js');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function memStore() { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; }
function boot(files, extra) {
  const ctx = vm.createContext(Object.assign({ console, Math, JSON, Date, Map, Set, Array, Object, Number, String, Boolean, Error, Symbol, isFinite, isNaN, parseInt, parseFloat, localStorage: memStore() }, extra || {}));
  for (const f of files) vm.runInContext(read(f), ctx, { filename: f });
  return ctx.IT;
}

// ---------------------------------------------------------------------------------------------------------------- art
const ART = boot(['js/data/game.js', 'js/art/art.js', 'js/art/dummies.js', 'js/art/skins_v6.js', 'js/art/ianzinho.js', 'js/art/vitinian.js']);
const S = ART.Art.sheets, M = ART.GAME.SKIN_META;
const ANIMS = [['idle', 4], ['walk', 4], ['cast', 2], ['stunned', 2], ['blink', 2]];

function checkSheet(name, w, h, pw, ph, anchor) {
  const sh = S[name];
  assert.ok(sh, name + ' registered');
  const keys = Object.keys(sh.frames);
  assert.strictEqual(keys.length, 43, name + ' frame count');
  assert.deepStrictEqual(keys.slice(), Object.keys(S.pedro.frames).slice(), name + ' same frame names / order as the other enemy skins');
  assert.deepStrictEqual(Array.from(sh.anchor), anchor);
  for (const k of keys) {
    const rows = sh.frames[k];
    if (k === 'portrait') { assert.strictEqual(rows.length, ph, name + ' portrait h'); assert.ok(rows.every(r => r.length === pw), name + ' portrait w'); }
    else { assert.strictEqual(rows.length, h, name + ' ' + k + ' h'); assert.ok(rows.every(r => r.length === w), name + ' ' + k + ' w'); }
    assert.ok(rows.some(r => /[^.]/.test(r)), k + ' not empty');
  }
  for (const [a, n] of ANIMS) for (const d of ['s', 'n', 'e']) assert.strictEqual(ART.Art.count(name, a, d), n, name + ' ' + a + '_' + d);
  // feet on the same baseline: the lowest opaque row of every body frame sits at the anchor row (+1), centred on the anchor column
  for (const k of keys) {
    if (k === 'portrait') continue;
    const rows = sh.frames[k];
    let low = -1;
    rows.forEach((r, y) => { if (/[^.]/.test(r)) low = y; });
    assert.ok(low >= sh.anchor[1] && low <= sh.anchor[1] + 2, `${name} ${k}: feet row ${low} vs anchor ${sh.anchor[1]}`);
  }
}

test('vitinho v2 replaces the monkey in place: same id, 43 frames, 20x24, anchor [10,22], 32x32 portrait', () => {
  checkSheet('vitinho', 20, 24, 32, 32, [10, 22]);
  assert.notStrictEqual(S.vitinho.frames.portrait.join(), S.pedro.frames.portrait.join());
  assert.strictEqual((read('js/art/dummies.js').match(/IT\.Art\.sheet\('vitinho'/g) || []).length, 1, 'exactly one vitinho sheet');
});

test('vitinian sheet: 43 frames, 34x28 body, anchor [17,26], 48x32 portrait; frames animate', () => {
  checkSheet('vitinian', 34, 28, 48, 32, [17, 26]);
  const F = S.vitinian.frames;
  assert.notStrictEqual(F.walk_s_0.join(), F.walk_s_1.join());
  assert.notStrictEqual(F.idle_e_0.join(), F.idle_e_2.join());
  assert.notStrictEqual(F.stunned_e_0.join(), F.idle_e_0.join());
});

test('index.html loads vitinian.js after ianzinho.js and before the renderers', () => {
  const h = read('index.html');
  const a = h.indexOf('js/art/ianzinho.js'), b = h.indexOf('js/art/vitinian.js'), c = h.indexOf('js/render/pixel.js');
  assert.ok(a > 0 && b > a && c > b);
});

// ---------------------------------------------------------------------------------------------------------------- SKIN_META
test('SKIN_META: every skin has one, sizes match the sheet (frame, anchor, portrait), vitinian is the bulky one', () => {
  const G = ART.GAME;
  assert.ok(G.SKINS.indexOf('vitinian') > 0 && G.SKIN_NAMES.vitinian === 'Vitinian' && G.ENEMY_ATTACK_KIND.vitinian);
  for (const id of G.SKINS) {
    const m = M[id], sh = S[id];
    assert.ok(m, id + ' meta'); assert.ok(sh, id + ' sheet');
    const f = sh.frames.idle_s_0;
    assert.strictEqual(m.w, f[0].length, id + ' w'); assert.strictEqual(m.h, f.length, id + ' h');
    assert.deepStrictEqual(Array.from(m.anchor), Array.from(sh.anchor), id + ' anchor');
    const p = sh.frames.portrait;
    assert.deepStrictEqual(Array.from(m.portrait), [p[0].length, p.length], id + ' portrait');
    assert.ok(m.hull >= G.ENEMY.radius, id + ' hull');
    assert.deepStrictEqual(Object.keys(ART.Skins.meta(id)).sort(), ['anchor', 'h', 'hull', 'portrait', 'w']);
  }
  for (const id of G.SKINS) if (id !== 'vitinian') assert.strictEqual(M[id].hull, G.ENEMY.radius, id + ' keeps the standard hull');
  assert.deepStrictEqual(Array.from(M.vitinian.portrait), [48, 32]);
  assert.ok(M.vitinian.hull > G.ENEMY.radius && M.vitinian.w > M.pedro.w && M.vitinian.h > M.pedro.h);
  assert.deepStrictEqual(Array.from(ART.Skins.meta('nope').anchor), [10, 22], 'unknown skin -> default meta');
});

test('hull: a spawned Vitinian uses its SKIN_META hull, other skins keep ENEMY.radius', () => {
  const { IT, w } = env();
  const a = IT.Units.spawnEnemy(w, { x: 500, y: 500, skin: 'vitinian' }), b = IT.Units.spawnEnemy(w, { x: 900, y: 500, skin: 'pedro' }), c = IT.Units.spawnEnemy(w, { x: 900, y: 900 });
  assert.strictEqual(a.radius, IT.GAME.SKIN_META.vitinian.hull);
  assert.strictEqual(b.radius, IT.GAME.ENEMY.radius);
  assert.strictEqual(c.radius, IT.GAME.ENEMY.radius);
});

// ---------------------------------------------------------------------------------------------------------------- click box
test('pick: the click box comes from SKIN_META (wider + taller for the Vitinian) and covers the whole sprite', () => {
  const IT = load(['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/sim/util.js', 'js/sim/pick.js']);
  const P = IT.GAME.UNIT_PX, Pk = IT.Pick;
  const E = (skin, o) => Object.assign({ id: 1, kind: 'enemy', team: 1, skin, x: 1000, y: 1000, radius: 24, dead: false, visible: true, statuses: [] }, o || {});
  const plain = Pk.boxOf(E('pedro')), big = Pk.boxOf(E('vitinian'));
  const m = IT.GAME.SKIN_META.vitinian, d = IT.GAME.SKIN_META.pedro;
  const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);
  near(big.x0, 1000 - (m.anchor[0] + 0.2 * m.w) * P, 'x0'); near(big.x1, 1000 + (m.w - m.anchor[0] + 0.2 * m.w) * P, 'x1');
  near(big.y0, 1000 - (m.anchor[1] + 0.6 * m.h) * P, 'y0'); near(big.y1, 1000 + (m.h - m.anchor[1]) * P, 'y1');
  near(plain.x1 - plain.x0, (d.w * 1.4) * P, 'default width');
  assert.ok((big.x1 - big.x0) / (plain.x1 - plain.x0) > 1.6, 'box scales with the frame width');
  assert.ok(big.y1 - big.y0 > plain.y1 - plain.y0);
  // every corner of the 34x28 body (feet row = anchor + 1, head row 0, both edges) is inside the box
  for (const [px, py] of [[0, 0], [33, 0], [0, 27], [33, 27], [17, 26]]) {
    const wx = 1000 + (px - m.anchor[0]) * P, wy = 1000 + (py - m.anchor[1]) * P;
    assert.ok(wx >= big.x0 && wx <= big.x1 && wy >= big.y0 && wy <= big.y1, `sprite px ${px},${py} inside the box`);
  }
  // the default box is untouched for skinless units and the default skins; dummies / allies follow their skin too
  near(Pk.boxOf(E(undefined)).x0, plain.x0, 'no skin = default'); near(Pk.boxOf(E('default')).y0, plain.y0, 'default skin');
  assert.ok(Pk.boxOf(E('vitinian', { kind: 'dummy' })).x1 > plain.x1);
  // unitAt: a click on the far right edge of the wide body picks him, the same pixel misses a pedro
  const w = { ents: [E('vitinian')], fog: false }, w2 = { ents: [E('pedro')], fog: false };
  const edgeX = 1000 + (33 - m.anchor[0]) * P, edgeY = 1000 - 10 * P;
  assert.ok(Pk.unitAt(w, edgeX, edgeY, { P }), 'wide edge hits the Vitinian');
  assert.ok(!Pk.unitAt(w2, edgeX, edgeY, { P }), 'same point misses a 20-px skin');
});

// ---------------------------------------------------------------------------------------------------------------- shop
const SHOP = boot(['js/data/game.js', 'js/data/difficulty.js', 'js/data/relics.js', 'js/data/i18n.js', 'js/data/i18n/shop.js', 'js/data/shop.js']);

test('shop: Vitinian is the premium enemy entry (priciest enemy skin), owned-only in the ranked pool', () => {
  const cat = SHOP.Shop.CATALOG.filter(c => c.kind === 'enemy'), v = cat.find(c => c.skin === 'vitinian');
  assert.ok(v, 'in the catalog');
  assert.ok(v.price >= 200 && v.price <= 300, 'price ' + v.price);
  for (const c of cat) if (c.skin !== 'vitinian') assert.ok(c.price < v.price, c.skin + ' cheaper');
  assert.strictEqual(SHOP.Skins.pool('enemy').indexOf('vitinian'), -1, 'not owned -> not in the pool');
  SHOP.Shop.grant(v.price - 1);
  assert.notStrictEqual(SHOP.Shop.buy('enemy', 'vitinian').ok, true, 'cannot buy without the points');
  SHOP.Shop.grant(10);
  assert.strictEqual(SHOP.Shop.buy('enemy', 'vitinian').ok, true);
  assert.ok(SHOP.Skins.pool('enemy').indexOf('vitinian') >= 0);
  assert.strictEqual(SHOP.Shop.owned('vitinian'), true);
});

test('shop i18n parity: every catalog entry has name + description in en and pt; Vitinian text differs per language', () => {
  const en = SHOP.I18N.en, pt = SHOP.I18N.pt;
  for (const c of SHOP.Shop.CATALOG) for (const p of ['n', 'd']) {
    const k = 'shop.' + p + '.' + c.kind + '.' + c.skin;
    assert.ok(en[k], k + ' en'); assert.ok(pt[k], k + ' pt');
  }
  assert.notStrictEqual(en['shop.d.enemy.vitinian'], pt['shop.d.enemy.vitinian']);
  assert.ok(!/monkey/i.test(en['shop.d.enemy.vitinho']) && !/macaco/i.test(pt['shop.d.enemy.vitinho']), 'vitinho is no longer a monkey');
  const keys = o => Object.keys(o).filter(k => k.indexOf('shop.') === 0).sort();
  assert.deepStrictEqual(keys(en), keys(pt), 'en / pt shop keys match');
});

// ---------------------------------------------------------------------------------------------------------------- HUD portrait helper
test('hud fitPor: a 32x32 portrait stays 32x32; the 48x32 Vitinian keeps its own size and is letterboxed (object-fit: contain), never stretched', () => {
  const src = read('js/ui/hud.js');
  const a = src.indexOf('function fitPor('), b = src.indexOf('H.fitPor = fitPor;');
  assert.ok(a > 0 && b > a, 'fitPor present');
  const fn = src.slice(a, b);
  const mkCv = (w, h) => { const c = { width: w, height: h, style: {}, drawn: [], getContext() { return { drawImage: (s, x, y) => c.drawn.push([s, x, y]) }; } }; return c; };
  const ctx = vm.createContext({ IT: {
    UI: { portrait: (sheet, cls) => mkCv(32, 32) },
    Art: { canvas: (sheet, key) => key === 'portrait' ? (sheet === 'vitinian' ? mkCv(48, 32) : mkCv(32, 32)) : null },
  } });
  const fitPor = vm.runInContext('(' + fn.replace('function fitPor', 'function') + ')', ctx);
  const n = fitPor('pedro'), v = fitPor('vitinian');
  assert.deepStrictEqual([n.width, n.height], [32, 32]); assert.ok(!n.style.objectFit);
  assert.deepStrictEqual([v.width, v.height], [48, 32]); assert.strictEqual(v.style.objectFit, 'contain');
  assert.strictEqual(v.drawn.length, 1, 'portrait drawn once at 1:1');
  assert.deepStrictEqual([v.drawn[0][1], v.drawn[0][2]], [0, 0]);
  // the roster / selected-unit panels use it
  assert.ok(/return fitPor\(ok \?/.test(src) && /\? fitPor\(sheet\)/.test(src));
});
