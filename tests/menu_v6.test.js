'use strict';
// WP3 menu flow: v6 i18n pack, screens wired to it, main menu / Free Play / Scenarios / end-splash structure (source-level, no DOM).
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pack = null;
vm.runInContext(rd('js/data/i18n/v6.js'), vm.createContext({ IT: { i18nAdd: p => { pack = p; } } }));

test('v6 pack: same keys in en and pt, same placeholders, no empty strings', () => {
  assert.ok(pack && pack.en && pack.pt);
  assert.deepEqual(Object.keys(pack.en).sort(), Object.keys(pack.pt).sort());
  for (const k of Object.keys(pack.en)) {
    assert.ok(pack.en[k] && pack.pt[k], k);
    assert.equal((pack.en[k].match(/\{\w+\}/g) || []).join(), (pack.pt[k].match(/\{\w+\}/g) || []).join(), 'placeholders ' + k);
  }
});

test('v6 pack is loaded by index.html before the screens that use it', () => {
  const html = rd('index.html');
  const i = html.indexOf('js/data/i18n/v6.js');
  assert.ok(i > 0, 'v6.js included');
  assert.ok(i < html.indexOf('js/ui/loadout.js') && i < html.indexOf('js/ui/menus.js'));
});

test('every t() literal of the new screens exists in the v6 pack or an older pack', () => {
  const keys = new Set();
  const files = ['js/data/i18n.js'].concat(fs.readdirSync(path.join(ROOT, 'js/data/i18n')).map(f => 'js/data/i18n/' + f));
  for (const f of files) {
    const p = rd(f);
    for (const m of p.matchAll(/'([a-zA-Z0-9_.]+)'/g)) keys.add(m[1]);
  }
  for (const f of ['js/ui/loadout.js', 'js/ui/menus.js', 'js/ui/endsplash.js']) {
    for (const m of rd(f).matchAll(/\bt\('((?:title|fp|sc|tag|end\.btn)\.[a-zA-Z.]+)'/g)) assert.ok(keys.has(m[1]), f + ' uses ' + m[1]);
  }
  for (const k of ['title.free', 'title.scn', 'fp.add', 'fp.start', 'title.ranked', 'title.ranked.d', 'title.nomedal', 'end.btn.infinite.d']) assert.ok(pack.en[k], k);
});

test('main menu: RANKED (direct start) on top, FREE PLAY + SCENARIOS below; no Combo Sandbox, no Infinite Run', () => {
  const src = rd('js/ui/menus.js');
  const i = src.indexOf('function title');
  const title = src.slice(i, src.indexOf('// ---- pause', i));
  assert.match(title, /tbtn rk[^]*?A\.go\('ranked'\)/, 'RANKED starts the run directly');
  assert.match(title, /A\.go\('freeplay'\)/);
  assert.match(title, /A\.go\('scenarios'\)/);
  assert.match(title, /trow/);
  assert.ok(title.indexOf("go('ranked')") < title.indexOf("go('freeplay')") && title.indexOf("go('freeplay')") < title.indexOf("go('scenarios')"));
  assert.match(title, /bestMedal\(\)/);
  assert.match(title, /go\('stats'\)/); assert.match(title, /go\('settings'\)/);
  assert.doesNotMatch(title, /go\('sandbox'\)|go\('combo'\)|title\.sandbox/, 'no Combo Sandbox on the title');
  assert.doesNotMatch(title, /go\('infinite'\)|go\('grounds'\)|go\('practice'\)/);
  assert.doesNotMatch(title, /ui\.grounds|Training grounds/i);
  assert.match(src, /title\.nomedal/, 'empty best medal label');
  assert.match(src, /bestMedal/);
  assert.match(rd('js/main.js'), /name === 'ranked'\) \{ abandon\(\); commitStats\(\); start\(\{ mode: 'ranked' \}\)/, 'App.go(ranked) starts the run');
  assert.equal(pack.en['title.scn.d'], 'Practice any scenario, no rating');
  assert.equal(pack.pt['title.scn.d'], 'Pratique qualquer cenário, sem ranking');
});

test('Free Play: one mode (no Combo Sandbox card), no enemy/dummy panel, default difficulty bar, grounds map hidden', () => {
  const src = rd('js/ui/loadout.js');
  assert.doesNotMatch(src, /dummy|combocard|go\('combo'\)|fp\.combo/i, 'enemies / dummies / combo sandbox live in the in-game pane now');
  assert.match(src, /DiffBar/);
  assert.match(src, /HIDDEN_MAPS\s*=\s*\['grounds'\]/);
  assert.match(src, /buildScenarios/);
  const sc = src.slice(src.indexOf('function buildScenarios'), src.indexOf('// the Free Play match'));
  assert.doesNotMatch(sc, /go\('ranked'\)|sc\.ranked|sc\.start|rankBox/, 'no ranked block on the Scenarios screen');
});

test('Scenarios: single-scenario start opts + Free Play starts empty', () => {
  const src = rd('js/ui/loadout.js');
  assert.match(src, /st\.count = 1;/, 'the match starts empty (count is only the legacy field)');
  assert.match(src, /function scenarioOpts/);
  assert.match(src, /IT\.App\.start\(scenarioOpts\(/);
});

test('end splash: Infinite Run only when 8/8 cleared, red button; ranked/infinite plumbing kept', () => {
  const src = rd('js/ui/endsplash.js');
  assert.match(src, /perfect\s*=\s*!inf\s*&&\s*\(m\.solved\s*\|\s*0\)\s*>=\s*\(m\.turns\s*\|\|\s*8\)/);
  assert.match(src, /infBtn\s*=\s*perfect\s*\?/);
  assert.match(src, /class:\s*'btn red infbtn'/);
  assert.match(src, /A\.go\('infinite'\)/);
  assert.match(rd('js/main.js'), /infinite/);
});

test('Settings: panel fits one screen (columns with internal scroll)', () => {
  const css = rd('css/settings.css');
  assert.match(css, /\.screen\.settings\s*\{[^}]*overflow:\s*hidden/);
  assert.match(css, /\.set-main\s*\{[^}]*overflow-y:\s*auto/);
});
