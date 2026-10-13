'use strict';
// v6 #63: the Vitinian's two voices (white head = Vitinho, dark head = Ianzinho). Table: js/data/flair.js, picker: js/ui/dummychat.js
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load');

const IT = load(['js/data/i18n.js', 'js/data/i18n/s3.js', 'js/data/i18n/scn.js', 'js/data/i18n/v6.js', 'js/data/flair.js', 'js/data/game.js', 'js/ui/dummychat.js']);
const F = IT.Flair, DC = IT.DummyChat, V = F.table.vitinian;
const SLURS = /\b(nigg|fagg?|retard|tranny|chink|spic|kike|coon|dyke|wetback|viado|veado|bicha|sapat[aã]o|crioulo|macaca|neguinho|retardad|mongol)/i;
const SEXUAL = /\b(sex|porn|nude|naked|boob|dick|cock|pussy|penis|vagina|orgasm|fuck|transa|pelad|pornô|bunda|pau\b)/i;

// every beat of every entry, flattened: { sit, head, en, pt }
function beats() {
  const out = [];
  for (const [sit, arr] of Object.entries(V.lines)) arr.forEach((ln, i) => {
    if (ln.x) ln.x.forEach((b, j) => out.push({ sit, i, j, head: b.head, en: b.t.en, pt: b.t.pt }));
    else out.push({ sit, i, j: 0, head: ln.head, en: ln.t.en, pt: ln.t.pt });
  });
  return out;
}

test('vitinian skin exists with the HEADS export, no silent flag, no fallback (every line is head-tagged)', () => {
  assert.ok(V && F.raw.vitinian);
  assert.strictEqual(JSON.stringify(F.HEADS), '["w","d"]');
  assert.ok(!V.silent && !V.fallback);
  assert.ok(IT.GAME.SKINS.indexOf('vitinian') >= 0 && IT.GAME.SKIN_NAMES.vitinian, 'game.js knows the vitinian skin');
});

test('every line and exchange is head-tagged (w or d); exchange beats too', () => {
  let n = 0;
  for (const [sit, arr] of Object.entries(V.lines)) for (const ln of arr) {
    n++;
    assert.ok(ln.head === 'w' || ln.head === 'd', sit + ' line head ' + ln.head + ' ' + ln.t.en);
    if (ln.x) for (const b of ln.x) assert.ok(b.head === 'w' || b.head === 'd', sit + ' beat head');
  }
  assert.ok(n > 250, 'entries ' + n);
});

test('both heads speak in every situation; the full SITUATIONS list is covered', () => {
  for (const sit of F.SITUATIONS) {
    const bs = beats().filter(b => b.sit === sit);
    assert.ok(bs.length >= 6, sit + ' has ' + bs.length + ' beats');
    const entries = V.lines[sit];
    assert.ok(entries && entries.length >= 6 && entries.length <= 10, sit + ' entries ' + (entries || []).length);
    assert.ok(bs.some(b => b.head === 'w') && bs.some(b => b.head === 'd'), sit + ' needs both heads');
  }
});

test('hitBy: all 10 spells + 8 items, 2-3 entries each, both heads', () => {
  for (const sp of ['coldsnap', 'tornado', 'sunstrike', 'chaosmeteor', 'deafeningblast', 'emp', 'icewall', 'alacrity', 'forgespirit', 'ghostwalk', 'atos', 'vyse', 'shiva', 'meteorhammer', 'orchid', 'gleipnir', 'forcestaff', 'dust']) {
    const sit = 'hitBy:' + sp, bs = beats().filter(b => b.sit === sit);
    assert.ok(V.lines[sit] && V.lines[sit].length >= 2, sit);
    assert.ok(bs.some(b => b.head === 'w') && bs.some(b => b.head === 'd'), sit + ' both heads');
  }
});

test('exchanges: 2-3 beats, heads alternate, both heads present', () => {
  let nx = 0;
  for (const [sit, arr] of Object.entries(V.lines)) for (const ln of arr) {
    if (!ln.x) continue;
    nx++;
    assert.ok(ln.x.length >= 2 && ln.x.length <= 3, sit + ' beats ' + ln.x.length);
    for (let i = 1; i < ln.x.length; i++) assert.notStrictEqual(ln.x[i].head, ln.x[i - 1].head, sit + ' must alternate: ' + ln.t.en);
    assert.strictEqual(ln.x[0].head, ln.head, sit + ' entry head = first beat head');
    assert.strictEqual(ln.x[0].t.en, ln.t.en); assert.strictEqual(ln.x[0].t.pt, ln.t.pt);
  }
  assert.ok(nx >= 60, 'exchanges ' + nx);
  assert.ok(Object.keys(V.lines).filter(s => V.lines[s].some(l => l.x)).length >= 25, 'exchanges spread over situations');
});

test('en + pt on every beat, bubble-sized; pt is not a copy of en for real sentences', () => {
  for (const b of beats()) {
    const id = b.sit + '#' + b.i;
    assert.ok(b.en && b.pt, id + ' en+pt');
    assert.ok(b.en.length <= 90 && b.pt.length <= 90, id + ' too long: ' + b.en);
    assert.ok(b.pt !== b.en || b.en.length < 30, id + ' pt = en: ' + b.en);
  }
});

test('content rules: no slur list hits, nothing sexual, no partner jokes', () => {
  for (const b of beats()) {
    const t = b.en + ' | ' + b.pt;
    assert.ok(!SLURS.test(t), 'slur: ' + t);
    assert.ok(!SEXUAL.test(t), 'sexual: ' + t);
    assert.ok(!/girlfriend|boyfriend|wife|husband|namorad[ao]|espos[ao]|mulher\b|marido/i.test(t), 'partner joke: ' + t);
  }
});

test('voices: Vitinho head = macho / apolitical / work / America / philosophy; Ianzinho head = lawyer / "Comedy." / dollar+inflation+Petrobras / Dota', () => {
  const W = beats().filter(b => b.head === 'w'), D = beats().filter(b => b.head === 'd');
  const has = (arr, re) => arr.some(b => re.test(b.en + ' ' + b.pt));
  assert.ok(has(W, /not scared|not a man|nem voto|not even vote|weak|fraco/i));
  assert.ok(has(W, /America|América/i));
  assert.ok(has(W, /deadline|prazo|meeting|reunião|trabalh/i));
  assert.ok(has(W, /Nietzsche|Stoic|estoic|Socrates|Sócrates|Plato|Platão/i));
  assert.ok(has(D, /Comedy\.|Comédia\./));
  assert.ok(has(D, /dollar|dólar|inflation|inflação/i) && has(D, /Petrobras/i));
  assert.ok(has(D, /Objection|Protesto|court|tribunal|lawyer|advogad/i));
  assert.ok(has(D, /Marx|worker|trabalhador|class|classe|comrade|camarada|union|sindicato/i));
  assert.ok(has(D, /match|partida|Dota|MMR|Rapier/i));
  assert.ok(has(D, /leisure|lazer/i), 'obligations turned into leisure');
  assert.ok(D.filter(b => /Comedy\.|Comédia\./.test(b.en + b.pt)).length >= 6, 'ironic Comedy. recurring');
});

test('Vitinho head keeps its macho line and has no monkey-era tics and at most 1 weed line', () => {
  const all = beats();
  assert.ok(!all.some(b => /Ooh|Clã|primate|macaco|monkey/i.test(b.en + ' ' + b.pt)), 'no monkey-era tics');
  const weed = all.filter(b => /weed|ganja|herb|ervinha|maconha|baseado|420/i.test(b.en + ' ' + b.pt));
  assert.ok(weed.length <= 1, 'weed ' + weed.length);
  assert.ok(all.some(b => b.head === 'w' && /not a man|homem/i.test(b.en + ' ' + b.pt)));
});

test('real-politics: only light banter (no named politicians)', () => {
  const t = beats().map(b => b.en + ' ' + b.pt).join('\n');
  assert.ok(!/(Bolsonaro|Lula|Trump|Biden|Dilma|Temer|Haddad|Moro|Putin)/i.test(t));
});

test('picker returns head + localized exchange; heads alternate; lang respected', () => {
  const ex = V.lines.spawn.findIndex(l => l.x), tot = V.lines.spawn.reduce((a, l) => a + l.w, 0);
  const before = V.lines.spawn.slice(0, ex).reduce((a, l) => a + l.w, 0);
  const rng = () => (before + 0.01) / tot;
  const en = DC.pickFlair('vitinian', 'spawn', { lang: 'en', rng, now: 0, state: { last: {} } });
  const pt = DC.pickFlair('vitinian', 'spawn', { lang: 'pt', rng, now: 0, state: { last: {} } });
  assert.strictEqual(en.skin, 'vitinian'); assert.ok(en.head === 'w' || en.head === 'd');
  assert.ok(Array.isArray(en.x) && en.x.length >= 2 && en.x.length <= 3);
  assert.strictEqual(en.x[0].text, en.text); assert.strictEqual(pt.x[0].text, pt.text);
  assert.notStrictEqual(en.text, pt.text);
  for (let i = 1; i < en.x.length; i++) assert.notStrictEqual(en.x[i].head, en.x[i - 1].head);
  // skins without heads are unchanged: head null, x null
  const n = DC.pickFlair('nando', 'spawn', { lang: 'en', rng: () => 0, now: 0, state: { last: {} } });
  assert.strictEqual(n.head, null); assert.strictEqual(n.x, null);
});

test('picker hits every situation without throwing, never null on a fresh state, hitBy:<unknown> -> damaged', () => {
  for (const sit of F.SITUATIONS) {
    const r = DC.pickFlair('vitinian', sit, { lang: 'en', rng: Math.random, now: 0, state: { last: {} } });
    assert.ok(r && r.head && r.text, sit);
  }
  const h = DC.pickFlair('vitinian', 'hitBy:nonexistent', { rng: () => 0.3, now: 0, state: { last: {} } });
  assert.strictEqual(h.sit, 'damaged'); assert.strictEqual(h.skin, 'vitinian');
});

test('head icons and i18n tags exist; dummychat renders exchanges (DOM-free checks)', () => {
  assert.ok(DC.ICONS.headw.length === 9 && DC.ICONS.headd.length === 9);
  for (const k of ['en', 'pt']) for (const h of ['w', 'd']) assert.ok(IT.I18N[k]['dc.head.' + h], 'dc.head.' + h + ' ' + k);
  assert.strictEqual(typeof DC.bubbles, 'function'); assert.strictEqual(DC.bubbles().length, 0);
});
