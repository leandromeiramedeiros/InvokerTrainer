'use strict';
// v6 #61 + #62: Ianzinho (enemy skin, art, shop entry, flair set) and Vitinho's weed-enjoyer lines; the five belief / Dust situations are wired in dummychat.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function memStore() { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; }
function boot(files, extra) {
  const ctx = vm.createContext(Object.assign({ console, Math, JSON, Date, Map, Set, Array, Object, Number, String, Boolean, Error, Symbol, isFinite, isNaN, parseInt, parseFloat, localStorage: memStore() }, extra || {}));
  for (const f of files) vm.runInContext(read(f), ctx, { filename: f });
  return ctx.IT;
}

// ---------------------------------------------------------------------------------------------------------------- art
const ART = boot(['js/data/game.js', 'js/art/art.js', 'js/art/dummies.js', 'js/art/skins_v6.js', 'js/art/ianzinho.js']);
const S = ART.Art.sheets;

test('ianzinho sheet: 43 frames in the same order as the other enemy skins, 20x24 body, 32x32 portrait', () => {
  assert.ok(S.ianzinho, 'sheet registered');
  const keys = Object.keys(S.ianzinho.frames);
  assert.strictEqual(keys.length, 43);
  assert.deepStrictEqual(keys.slice(), Object.keys(S.pedro.frames).slice());
  assert.deepStrictEqual(Array.from(S.ianzinho.anchor), Array.from(S.pedro.anchor));
  for (const k of keys) {
    const rows = S.ianzinho.frames[k];
    if (k === 'portrait') { assert.strictEqual(rows.length, 32); assert.ok(rows.every(r => r.length === 32), 'portrait 32x32'); }
    else { assert.strictEqual(rows.length, 24, k); assert.ok(rows.every(r => r.length === 20), k + ' 20 wide'); }
    assert.ok(rows.some(r => /[^.]/.test(r)), k + ' is not empty');
  }
  for (const anim of [['idle', 4], ['walk', 4], ['cast', 2], ['stunned', 2], ['blink', 2]]) for (const d of ['s', 'n', 'e'])
    for (let i = 0; i < anim[1]; i++) assert.ok(S.ianzinho.frames[anim[0] + '_' + d + '_' + i], anim[0] + '_' + d + '_' + i);
  assert.strictEqual(ART.Art.count('ianzinho', 'walk', 'e'), 4);
});

test('ianzinho frames animate (walk / idle frames differ) and differ from pedro', () => {
  const F = S.ianzinho.frames;
  assert.notStrictEqual(F.walk_s_0.join(), F.walk_s_1.join());
  assert.notStrictEqual(F.idle_e_0.join(), F.idle_e_2.join());
  assert.notStrictEqual(F.portrait.join(), S.pedro.frames.portrait.join());
  assert.notStrictEqual(F.stunned_e_0.join(), F.idle_e_0.join());
});

test('index.html loads ianzinho.js after skins_v6.js', () => {
  const h = read('index.html');
  const a = h.indexOf('js/art/skins_v6.js'), b = h.indexOf('js/art/ianzinho.js');
  assert.ok(a > 0 && b > a);
});

// ---------------------------------------------------------------------------------------------------------------- game + shop
const SHOP = boot(['js/data/game.js', 'js/data/difficulty.js', 'js/data/relics.js', 'js/data/i18n.js', 'js/data/i18n/shop.js', 'js/data/shop.js']);

test('ianzinho is a skin with a name and an attack kind; the repo tier "ian" is untouched', () => {
  assert.ok(SHOP.GAME.SKINS.indexOf('ianzinho') > 0);
  assert.strictEqual(SHOP.GAME.SKIN_NAMES.ianzinho, 'Ianzinho');
  assert.ok(SHOP.GAME.ENEMY_ATTACK_KIND.ianzinho);
  assert.strictEqual(SHOP.GAME.SKINS.indexOf('ian'), -1);
});

test('shop: ianzinho sits next to vitinho, price ~100-120, owned-only ranked pool', () => {
  const cat = SHOP.Shop.CATALOG.filter(c => c.kind === 'enemy');
  const iv = cat.findIndex(c => c.skin === 'vitinho'), ii = cat.findIndex(c => c.skin === 'ianzinho');
  assert.ok(ii >= 0 && Math.abs(ii - iv) === 1, 'next to vitinho');
  assert.ok(cat[ii].price >= 100 && cat[ii].price <= 120, 'price ' + cat[ii].price);
  assert.strictEqual(SHOP.Skins.pool('enemy').indexOf('ianzinho'), -1, 'not owned -> not in the ranked pool');
  SHOP.Shop.grant(1000);
  assert.strictEqual(SHOP.Shop.buy('enemy', 'ianzinho').ok, true);
  assert.ok(SHOP.Skins.pool('enemy').indexOf('ianzinho') >= 0);
  assert.strictEqual(SHOP.Shop.owned('ianzinho'), true);
});

test('shop i18n: ianzinho name + description in en and pt; "appears in Ranked once unlocked" text exists', () => {
  const en = SHOP.I18N.en, pt = SHOP.I18N.pt;
  for (const k of ['shop.n.enemy.ianzinho', 'shop.d.enemy.ianzinho']) {
    assert.ok(en[k] && pt[k], k);
    if (k.indexOf('.d.') > 0) assert.notStrictEqual(en[k], pt[k]);
  }
  assert.ok(/Ranked once unlocked/.test(en['shop.ranked']));
  for (const c of SHOP.Shop.CATALOG) { assert.ok(en['shop.n.' + c.kind + '.' + c.skin], c.skin + ' en'); assert.ok(pt['shop.n.' + c.kind + '.' + c.skin], c.skin + ' pt'); }
});

// ---------------------------------------------------------------------------------------------------------------- flair
const FL = boot(['js/data/i18n.js', 'js/data/i18n/s3.js', 'js/data/i18n/scn.js', 'js/data/i18n/v6.js', 'js/data/flair.js', 'js/data/game.js', 'js/ui/dummychat.js']);
const F = FL.Flair, T = F.table;
const SPELLS = ['coldsnap', 'tornado', 'sunstrike', 'chaosmeteor', 'deafeningblast', 'emp', 'icewall', 'alacrity', 'forgespirit', 'ghostwalk'];

test('ianzinho flair: >= 8 lines (en + pt) in every situation, lines for all spells + dust', () => {
  const t = T.ianzinho; assert.ok(t && !t.silent);
  assert.strictEqual(t.fallback, 'default');
  for (const sit of F.SITUATIONS) {
    const L = t.lines[sit] || [];
    assert.ok(L.length >= 8, sit + ' ' + L.length);
    for (const ln of L) {
      assert.ok(ln.t.en && ln.t.pt, sit + ' needs en + pt');
      assert.ok(ln.t.en.length <= 90 && ln.t.pt.length <= 90, sit + ' fits a bubble');
      assert.notStrictEqual(ln.t.en, ln.t.pt, sit + ' pt differs from en');
    }
    assert.strictEqual(new Set(L.map(l => l.t.en)).size, L.length, sit + ' has duplicates');
  }
  for (const sp of SPELLS.concat(['dust'])) assert.ok((t.lines['hitBy:' + sp] || []).length >= 3, 'hitBy:' + sp);
});

test('ianzinho flair: persona (Dota 15/day, weed, communist lawyer, the easy tier is his name) and stern about Vitinho only', () => {
  const all = Object.values(T.ianzinho.lines).flat();
  const has = re => all.filter(l => re.test(l.t.en) || re.test(l.t.pt));
  assert.ok(has(/Dota/i).length >= 10, 'Dota');
  assert.ok(has(/15/).length >= 4, '15 matches a day');
  assert.ok(has(/herb|puff|4:20|joint|high|ervinha|tapa|chapado|baseado|erva/i).length >= 8, 'weed');
  assert.ok(has(/comrade|proletari|Marx|revolution|strike|workers|camarada|greve|classe/i).length >= 12, 'communist');
  assert.ok(has(/lawyer|objection|sue|court|appeal|habeas|advogado|protesto|processar/i).length >= 12, 'lawyer');
  assert.ok(has(/easiest|easy mode|easy difficulty|modo fácil|dificuldade (mais )?fácil/i).length >= 3, 'knows the easiest difficulty is his');
  const vit = has(/Vitinho/);
  assert.ok(vit.length >= 10, 'Vitinho lines ' + vit.length);
  assert.ok(vit.filter(l => /zero tolerance|tolerância zero|apology|desculpas|explode|sue|processo/i.test(l.t.en + l.t.pt)).length >= 6, 'zero tolerance tone');
  const sits = Object.keys(T.ianzinho.lines).filter(s => T.ianzinho.lines[s].some(l => /Vitinho/.test(l.t.en)));
  assert.ok(sits.length >= 8, 'Vitinho lines spread over ' + sits.length + ' situations');
});

test('ianzinho flair: no slurs, no sexual content, no real politicians', () => {
  const all = Object.values(T.ianzinho.lines).flat().map(l => l.t.en + ' | ' + l.t.pt).join('\n');
  assert.ok(!/\b(fag|nigg|retard|bitch|whore|slut|fuck|shit|cock|dick|porn|sex(?!ta))\w*/i.test(all));
  assert.ok(!/\b(viado|puta|caralho|porra|buceta|piroca|foda|mongol|retardad|bicha|sapat)\w*/i.test(all));
  assert.ok(!/\b(lula|bolsonaro|trump|biden|putin|stalin|hitler|mussolini|castro|dilma|temer|haddad|maduro|obama|sanders)\b/i.test(all));
});

test('CEO #62 (revised): Vitinho weed toned down (<= 2), no monkey-era tics, personality otherwise intact', () => {
  const V = T.vitinho, weed = /weed|herb|ervinha|maconha|baseado|puff|4:20|stoned|chapado|verdinho/i;
  const all = Object.values(V.lines).flat();
  const n = all.filter(l => weed.test(l.t.en + ' ' + l.t.pt)).length;
  assert.ok(n >= 1 && n <= 2, 'weed lines ' + n);
  assert.strictEqual(V.cd, 4); assert.strictEqual(V.chat, 0.85); assert.strictEqual(V.fallback, 'default');
  assert.ok(!all.some(l => l.icon === 'monkey' || /Ooh|Clã|Clan|primate|macaco/i.test(l.t.en + l.t.pt)));
  for (const sit of F.SITUATIONS.filter(s => V.lines[s])) assert.ok(V.lines[sit].length >= 5, sit);
  for (const sit of Object.keys(V.lines)) for (const ln of V.lines[sit]) assert.ok(ln.t.en.length <= 90 && ln.t.pt.length <= 90, ln.t.en);
});

test('flair header documents ianzinho and the situations', () => {
  const head = read('js/data/flair.js'); const h = head.slice(0, head.indexOf('(function'));
  assert.ok(/ianzinho/.test(h) && !/Not here yet: 'ian'/.test(h));
  for (const s of ['gotJuked', 'invokerEscaped', 'reacquired', 'dustHit', 'dustMiss']) assert.ok(h.indexOf(s) > 0, s);
});

// ---------------------------------------------------------------------------------------------------------------- dummychat wiring
function el() {
  return { className: '', children: [], style: { cssText: '', setProperty() {} }, offsetWidth: 60, offsetHeight: 20, clientWidth: 480, clientHeight: 270,
    classList: { toggle() {}, add() {}, remove() {} }, appendChild(c) { this.children.push(c); return c; }, setAttribute() {}, remove() { }, contains() { return true; } };
}
function rig(skin, seed) {
  const hud = el();
  const doc = { getElementById: () => hud, createElement: () => el(), createElementNS: () => el(), createTextNode: t => ({ text: t }) };
  const IT = boot(['js/data/i18n.js', 'js/data/i18n/s3.js', 'js/data/i18n/scn.js', 'js/data/i18n/v6.js', 'js/data/flair.js', 'js/data/game.js', 'js/ui/dummychat.js'], { document: doc });
  const P = IT.GAME.UNIT_PX;
  IT.Status = { hidden: h => !!h.hidden };
  const hero = { id: 1, team: 0, kind: 'hero', hp: 500, maxHp: 500, hidden: false, x: 100 * P, y: 100 * P, visible: true, dead: false };
  const foe = { id: 2, team: 1, kind: 'enemy', skin, x: 150 * P, y: 120 * P, visible: true, dead: false };
  const by = new Map([[1, hero], [2, foe]]);
  const H = {};
  const w = { t: 50, paused: false, ents: [hero, foe], byId: by, get: id => by.get(id), ranked: null, combo: null, tod: null,
    on(n, f) { (H[n] = H[n] || []).push(f); return () => { }; }, emit(n, p) { (H[n] || []).forEach(f => f(p)); } };
  const g = { hero, cam: { px: 0, py: 0 }, run: null, menu: false, ended: false };
  IT.DummyChat.seed(seed);
  IT.DummyChat.attach(w, g);
  return { IT, w, hero, foe, hud, said() { const r = hud.children[0]; return r && r.children[0] ? r.children[0].className : ''; } };
}
// run one event over many seeds; returns the bubble class names that were spoken
function tries(skin, fn, n) {
  const out = [];
  for (let s = 1; s <= (n || 40); s++) { const r = rig(skin, s * 7919); fn(r); const c = r.said(); if (c) out.push(c); r.IT.DummyChat.detach(); }
  return out;
}

test('dummychat: belief juked -> gotJuked (not when it came from a Dust)', () => {
  const a = tries('ianzinho', r => r.w.emit('belief', { unit: 2, state: 'juked', from: 'predicted' }));
  assert.ok(a.length >= 15, 'spoke ' + a.length);
  assert.ok(a.every(c => /dc-gotJuked/.test(c) && /dc-skin-ianzinho/.test(c)), a[0]);
  assert.strictEqual(tries('ianzinho', r => r.w.emit('belief', { unit: 2, state: 'juked', from: 'predicted', dust: true })).length, 0);
});

test('dummychat: belief seen + reacquired -> reacquired; a plain first sighting stays quiet', () => {
  const a = tries('ianzinho', r => r.w.emit('belief', { unit: 2, state: 'seen', from: 'lost', reacquired: true }));
  assert.ok(a.length >= 10 && a.every(c => /dc-reacquired/.test(c)), 'spoke ' + a.length);
  assert.strictEqual(tries('ianzinho', r => r.w.emit('belief', { unit: 2, state: 'seen', from: 'idle' })).length, 0);
});

test('dummychat: chaser loses a HIDDEN hero -> invokerEscaped (not when the hero is visible)', () => {
  const a = tries('ianzinho', r => { r.hero.hidden = true; r.w.emit('belief', { unit: 2, state: 'lost', from: 'seen' }); });
  assert.ok(a.length >= 15 && a.every(c => /dc-invokerEscaped/.test(c)), 'spoke ' + a.length);
  assert.strictEqual(tries('ianzinho', r => r.w.emit('belief', { unit: 2, state: 'lost', from: 'seen' })).length, 0);
});

test('dummychat: hero Dust lands on the foe -> dustHit or the item-hit bubble (once, not twice)', () => {
  const a = tries('ianzinho', r => { r.w.emit('hit', { src: 1, target: 2, ability: 'dust' }); r.w.emit('damage', { src: 1, target: 2, ability: 'dust', dealt: 25 }); });
  assert.ok(a.length >= 15, 'spoke ' + a.length);
  assert.ok(a.every(c => /dc-dustHit|dc-hitBy_dust/.test(c)), a[0]);
  assert.ok(a.some(c => /dc-dustHit/.test(c)) && a.some(c => /dc-hitBy_dust/.test(c)), 'both bubbles occur');
});

test('dummychat: the foe\'s own Dust finds nobody -> dustMiss (a hit stays quiet)', () => {
  const a = tries('ianzinho', r => r.w.emit('dustResult', { unit: 2, hit: false }));
  assert.ok(a.length >= 25 && a.every(c => /dc-dustMiss/.test(c)), 'spoke ' + a.length);
  assert.strictEqual(tries('ianzinho', r => r.w.emit('dustResult', { unit: 2, hit: true })).length, 0);
});

test('dummychat: the five new situations work for every speaking skin and respect the bubble cooldown', () => {
  for (const skin of ['default', 'pedro', 'renan', 'vitinho', 'nando', 'ianzinho']) {
    const a = tries(skin, r => r.w.emit('belief', { unit: 2, state: 'juked', from: 'predicted' }), 30);
    assert.ok(a.length >= 5, skin + ' ' + a.length);
  }
  const r = rig('ianzinho', 1);
  r.w.emit('dustResult', { unit: 2, hit: false });
  r.w.emit('belief', { unit: 2, state: 'juked', from: 'predicted' });   // same instant: global cooldown + one bubble at a time
  assert.ok(r.hud.children[0] ? r.hud.children[0].children.length <= 1 : true);
  r.IT.DummyChat.detach();
});

test('dummychat source wires belief, dustResult and the REACT_P entries', () => {
  const s = read('js/ui/dummychat.js');
  assert.ok(/on\('belief'/.test(s) && /on\('dustResult'/.test(s));
  for (const sit of ['gotJuked', 'invokerEscaped', 'reacquired', 'dustHit', 'dustMiss']) assert.ok(new RegExp("'" + sit + "'").test(s) && new RegExp(sit + ': ').test(s), sit);
});
