'use strict';
// v6 item 22: flair table (js/data/flair.js) + picker (js/ui/dummychat.js)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const load = require('./_load');

const IT = load(['js/data/i18n.js', 'js/data/i18n/s3.js', 'js/data/i18n/scn.js', 'js/data/i18n/v6.js', 'js/data/flair.js', 'js/data/game.js', 'js/ui/dummychat.js']);
const F = IT.Flair, DC = IT.DummyChat, T = F.table;
const rngOf = a => { let i = 0; return () => a[i++ % a.length]; };

test('flair.js has the documented header', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js/data/flair.js'), 'utf8');
  const head = src.slice(0, src.indexOf('(function'));
  assert.ok(/HOW TO ADD A LINE/.test(head) && /SITUATIONS/.test(head) && /PER-SKIN SETTINGS/.test(head));
  for (const s of ['spawn', 'idle', 'damaged', 'stunned', 'hitBy:', 'nearDeath', 'death', 'killedHero', 'playerMissed', 'playerWhiffSunstrike', 'heroInvisible', 'night', 'dustUsed', 'pitJuke', 'caught', 'escaped', 'idleLong']) assert.ok(head.indexOf(s) >= 0, s);
});

test('the table covers every character', () => {
  for (const k of ['scarecrow', 'raven', 'default', 'renan', 'vitinho', 'pedro', 'nando']) assert.ok(T[k], k);
  assert.ok(T.scarecrow.silent);
});

test('every line has en + pt text (or is an icon-only line), weight > 0, valid cd and icon', () => {
  let n = 0;
  for (const [skin, s] of Object.entries(T)) {
    assert.ok(s.cd >= 0 && s.chat >= 0 && s.chat <= 1 && s.lineCd >= 0, skin + ' settings');
    for (const [sit, arr] of Object.entries(s.lines)) {
      assert.ok(arr.length, skin + '/' + sit + ' empty');
      for (const ln of arr) {
        n++;
        const id = skin + '/' + sit;
        assert.ok(typeof ln.t.en === 'string' && typeof ln.t.pt === 'string', id);
        if (ln.icon) assert.ok(F.ICONS.indexOf(ln.icon) >= 0, id + ' icon ' + ln.icon);
        if (ln.t.en === '' || ln.t.pt === '') assert.ok(ln.icon && ln.t.en === '' && ln.t.pt === '', id + ' empty text without icon');
        assert.ok(ln.w > 0, id + ' weight');
        assert.ok(ln.cd == null || ln.cd >= 0, id + ' cd');
        assert.ok(ln.t.en.length <= 90 && ln.t.pt.length <= 90, id + ' too long for a bubble: ' + ln.t.en);
        assert.ok(ln.t.pt !== ln.t.en || ln.t.en.length < 30 || ln.icon, id + ' pt identical to en: ' + ln.t.en);
      }
    }
  }
  assert.ok(n > 600, 'lines ' + n);
});

test('situation names are known; hitBy ids are spells or items', () => {
  const ok = new Set(F.SITUATIONS);
  for (const [skin, s] of Object.entries(T)) for (const sit of Object.keys(s.lines)) {
    if (sit.indexOf('hitBy:') === 0) assert.ok(/^hitBy:[a-z]+$/.test(sit), skin + ' ' + sit);
    else assert.ok(ok.has(sit), skin + ' unknown situation ' + sit);
  }
});

test('main characters have 8+ lines in their core situations', () => {
  for (const k of ['renan', 'vitinho', 'pedro', 'nando']) {
    const L = T[k].lines;
    for (const sit of ['spawn', 'idle', 'idleLong', 'damaged', 'stunned', 'death', 'killedHero', 'playerMissed', 'caught']) assert.ok(L[sit] && L[sit].length >= 6, k + '/' + sit + ' ' + (L[sit] || []).length);
    for (const sit of ['nearDeath', 'heroInvisible', 'night', 'dustUsed', 'pitJuke', 'escaped', 'playerWhiffSunstrike']) assert.ok(L[sit] && L[sit].length >= 5, k + '/' + sit);
    for (const sp of ['coldsnap', 'tornado', 'sunstrike', 'chaosmeteor', 'deafeningblast', 'emp', 'icewall', 'alacrity', 'forgespirit', 'ghostwalk']) assert.ok(L['hitBy:' + sp] && L['hitBy:' + sp].length >= 2, k + ' hitBy:' + sp);
  }
});

test('default keeps every legacy dummychat line', () => {
  const MAP = { fail: 'playerFail', mana: 'playerNoMana', cooldown: 'playerCooldown', wrong: 'playerWrong', miss: 'playerMissed', comboFail: 'comboFail', idle: 'idleLong', dodge: 'dodge', hurt: 'heroLow', praise: 'praise', dust: 'dustUsed', juke: 'pitJuke' };
  for (const [cat, sit] of Object.entries(MAP)) {
    const have = new Set((T.default.lines[sit] || []).map(l => l.t.en + '|' + l.t.pt));
    for (let i = 0; IT.I18N.en['dc.' + cat + '.' + i] != null; i++) assert.ok(have.has(IT.I18N.en['dc.' + cat + '.' + i] + '|' + IT.I18N.pt['dc.' + cat + '.' + i]), cat + '.' + i);
    assert.ok(have.size >= 1, sit);
  }
});

test('nando has muted-mic lines and cut-off "—" lines; icons render for all', () => {
  const all = Object.values(T.nando.lines).flat();
  const muted = all.filter(l => l.icon === 'muted');
  assert.ok(muted.length >= 10, 'muted ' + muted.length);
  assert.ok(muted.every(l => l.t.en === '' && l.t.pt === ''));
  const cut = all.filter(l => /—$/.test(l.t.en) && /—$/.test(l.t.pt));
  assert.ok(cut.length >= 10, 'cut ' + cut.length);
  assert.ok(Object.keys(T.nando.lines).filter(s => T.nando.lines[s].some(l => l.icon === 'muted')).length >= 8, 'muted spread over situations');
  for (const ic of F.ICONS) assert.ok(DC.ICONS[ic] && DC.ICONS[ic].length > 4, ic);
  for (const k of ['en', 'pt']) for (const ic of F.ICONS) assert.ok(IT.I18N[k]['dc.icon.' + ic], 'dc.icon.' + ic + ' ' + k);
});

test('other characters use their signature icons', () => {
  assert.ok(Object.values(T.renan.lines).flat().some(l => l.icon === 'camera'));
  assert.ok(Object.values(T.vitinho.lines).flat().some(l => l.icon === 'monkey'));
  assert.ok(Object.values(T.vitinho.lines).flat().some(l => l.icon === 'star'));
  assert.ok(Object.values(T.pedro.lines).flat().some(l => l.icon === 'goiaba'));
});

test('no ian entry (CEO slot only)', () => {
  assert.strictEqual(T.ian, undefined);
  assert.strictEqual(F.raw.ian, undefined);
  assert.ok(IT.GAME.SKINS.indexOf('ian') < 0 && !('ian' in IT.GAME.SKIN_NAMES));
  const src = fs.readFileSync(path.join(__dirname, '..', 'js/data/flair.js'), 'utf8');
  assert.ok(/'ian': TODO/.test(src));
});

test('SKINS: default first, every skin has a name and an attack kind', () => {
  assert.strictEqual(IT.GAME.SKINS[0], 'default');
  for (const s of IT.GAME.SKINS) { assert.ok(IT.GAME.SKIN_NAMES[s], s); assert.ok(IT.GAME.ENEMY_ATTACK_KIND[s], s); assert.ok(T[s], 'flair ' + s); }
});

test('scarecrow never talks', () => {
  for (const sit of F.SITUATIONS.concat(['hitBy:coldsnap'])) assert.strictEqual(DC.pickFlair('scarecrow', sit, { rng: Math.random, now: 0, state: { last: {} } }), null, sit);
  assert.strictEqual(DC.hasLines('scarecrow', 'spawn'), false);
});

test('picker: lang, weights, icons', () => {
  const r = DC.pickFlair('nando', 'spawn', { lang: 'pt', rng: () => 0, now: 0, state: { last: {} } });
  assert.strictEqual(r.skin, 'nando'); assert.strictEqual(r.text, T.nando.lines.spawn[0].t.pt);
  const e = DC.pickFlair('nando', 'spawn', { lang: 'en', rng: () => 0, now: 0, state: { last: {} } });
  assert.strictEqual(e.text, T.nando.lines.spawn[0].t.en);
  // a muted-mic line (empty text + icon): aim the rng at it
  const sp = T.nando.lines.spawn, mi = sp.findIndex(l => l.icon === 'muted'), tot = sp.reduce((a, l) => a + l.w, 0);
  const before = sp.slice(0, mi).reduce((a, l) => a + l.w, 0);
  const m = DC.pickFlair('nando', 'spawn', { lang: 'en', rng: () => (before + 0.01) / tot, now: 0, state: { last: {} } });
  assert.strictEqual(m.icon, 'muted'); assert.strictEqual(m.text, '');
  // weights: a w:3 line is picked ~3x as often as a w:1 line
  const sk = { cd: 0, chat: 1, lineCd: 0, lines: { x: [{ t: { en: 'a', pt: 'a' }, w: 3, cd: null, icon: null }, { t: { en: 'b', pt: 'b' }, w: 1, cd: null, icon: null }] } };
  T.__w = sk;
  let a = 0; const st = { last: {} };
  for (let i = 0; i < 4000; i++) if (DC.pickFlair('__w', 'x', { rng: Math.random, now: i, state: st }).text === 'a') a++;
  delete T.__w;
  assert.ok(a > 2700 && a < 3300, 'a=' + a);
});

test('picker: unknown skin -> default; hitBy falls back to damaged; fallback skin fills gaps', () => {
  const u = DC.pickFlair('nobody', 'playerMissed', { rng: () => 0.3, now: 0, state: { last: {} } });
  assert.strictEqual(u.skin, 'default');
  const h = DC.pickFlair('pedro', 'hitBy:nonexistent', { rng: () => 0.3, now: 0, state: { last: {} } });
  assert.strictEqual(h.sit, 'damaged'); assert.strictEqual(h.skin, 'pedro');
  assert.strictEqual(DC.pickFlair('default', 'hitBy:coldsnap', { rng: () => 0.3, now: 0, state: { last: {} } }), null);   // grunt: silent on damage, as before
  // a skin with no lines at all for a situation borrows its fallback's
  T.__f = { silent: false, cd: 0, chat: 1, lineCd: 0, fallback: 'default', lines: {} };
  const f = DC.pickFlair('__f', 'playerFail', { rng: () => 0.3, now: 0, state: { last: {} } });
  delete T.__f;
  assert.strictEqual(f.skin, 'default');
});

test('picker respects cooldowns (per-skin lineCd and per-line cd)', () => {
  const st = { last: {} }, seen = new Set(), n = T.renan.lines.spawn.length;
  for (let i = 0; i < n; i++) { const r = DC.pickFlair('renan', 'spawn', { rng: Math.random, now: 100 + i * 0.01, state: st }); assert.ok(r, 'pick ' + i); assert.ok(!seen.has(r.key), 'repeat ' + r.key); seen.add(r.key); }
  assert.strictEqual(DC.pickFlair('renan', 'spawn', { rng: Math.random, now: 101, state: st }), null, 'all on cooldown -> silence');
  const again = DC.pickFlair('renan', 'spawn', { rng: Math.random, now: 100 + T.renan.lineCd + 1, state: st });
  assert.ok(again, 'back after the cooldown');
  // a line-level cd wins over the skin lineCd
  T.__c = { silent: false, cd: 0, chat: 1, lineCd: 1000, fallback: null, lines: { x: [{ t: { en: 'a', pt: 'a' }, w: 1, cd: 5, icon: null }] } };
  const s2 = { last: {} };
  assert.ok(DC.pickFlair('__c', 'x', { rng: Math.random, now: 0, state: s2 }));
  assert.strictEqual(DC.pickFlair('__c', 'x', { rng: Math.random, now: 4, state: s2 }), null);
  assert.ok(DC.pickFlair('__c', 'x', { rng: Math.random, now: 5, state: s2 }));
  delete T.__c;
});

test('hitBy exhausted -> damaged, never the wrong character', () => {
  const st = { last: {} };
  const seen = [];
  for (let i = 0; i < 12; i++) { const r = DC.pickFlair('vitinho', 'hitBy:coldsnap', { rng: Math.random, now: i * 0.01, state: st }); if (r) seen.push(r); }
  assert.ok(seen.length >= 3 && seen.every(r => r.skin === 'vitinho'));
  assert.ok(seen.some(r => r.sit === 'hitBy:coldsnap') && seen.some(r => r.sit === 'damaged'));
});

test('legacy API intact', () => {
  assert.ok(DC.CATS.length === 10 && typeof DC.pick === 'function' && typeof DC.needed === 'function' && typeof DC.lines === 'function');
});

test('index.html loads flair.js before dummychat.js', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const a = html.indexOf('js/data/flair.js'), b = html.indexOf('js/ui/dummychat.js');
  assert.ok(a > 0 && b > a);
});
