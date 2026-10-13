'use strict';
// #16a UX review: readability floors, title ribbon, Scenarios Tags row, secondary buttons (source-level, no DOM).
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CSS = ['v2', 'settings', 'loadout', 'hud', 'sandbox', 'menus', 'splash', 'relics', 'shop', 'panels', 'briefing', 'diffbar'];

test('no text font-size floors below 10px in any stylesheet', () => {
  for (const f of CSS) {
    const bad = (rd(`css/${f}.css`).match(/font-size:max\((?:calc\((?:[^()]|\([^()]*\))*\)|[^,()]*),\s*\d+(?:\.\d+)?px\)/g) || []).filter(m => parseFloat(m.match(/,\s*([\d.]+)px\)$/)[1]) < 10);
    assert.deepEqual(bad, [], f);
  }
});

test('--dim is a light lavender (contrast on the dark ground) and no stylesheet keeps the old dim hex', () => {
  const v2 = rd('css/v2.css');
  const hex = (v2.match(/--dim:#([0-9a-f]{6})/i) || [])[1];
  assert.ok(hex);
  const lum = parseInt(hex.slice(0, 2), 16) * 0.2126 + parseInt(hex.slice(2, 4), 16) * 0.7152 + parseInt(hex.slice(4, 6), 16) * 0.0722;
  assert.ok(lum >= 165, 'luma ' + lum);
  for (const f of CSS) assert.ok(!/#9a8fc0/i.test(rd(`css/${f}.css`)), f);
});

test('title ribbon hugs its text: .logo-b is fit-content and larger than the old 1.5em', () => {
  const css = rd('css/diffbar.css');
  const m = css.match(/\.logo-b\{([^}]*)\}/);
  assert.ok(m, '.logo-b override');
  assert.match(m[1], /width:fit-content/);
  assert.ok(parseFloat(m[1].match(/font-size:([\d.]+)em/)[1]) >= 1.8);
});

test('secondary buttons: Stats / Settings on the title and .btn.sm are bigger than before', () => {
  const css = rd('css/diffbar.css');
  assert.match(css, /\.tmore \.btn\.slt\{[^}]*font-size:1\.[2-9]/);
  assert.ok(/\.btn\.sm\{[^}]*font-size:\.9[5-9]em/.test(css));
  assert.ok(/\.settings \.btn\.sm\{[^}]*font-size:\.9[5-9]em/.test(css));
});

test('Scenarios: tags live in a collapsible row behind a Tags button; tabs stay on one row; the count stays', () => {
  const js = rd('js/ui/loadout.js'), css = rd('css/diffbar.css');
  assert.match(js, /sc-tagsbtn/);
  assert.match(js, /chipsEl = h\('div', \{ class: 'sc-chips', hidden: true \}\)/);
  assert.match(js, /sc-bar' \}, search, sortEl, tagsBtn, modeBtn, clearBtn, countEl/);
  assert.match(css, /\.sc-tabs\{[^}]*flex-wrap:nowrap/);
  assert.match(css, /\.sc-chips\[hidden\]\{display:none\}/);
  const pack = {}; vm.runInContext(rd('js/data/i18n/v6.js'), vm.createContext({ IT: { i18nAdd: p => Object.assign(pack, p) } }));
  for (const l of ['en', 'pt']) assert.ok(pack[l]['sc.tags'] && pack[l]['sc.tags.d'], l);
});

test('briefing hint sits above the HUD bar, not over it', () => {
  const css = rd('css/diffbar.css');
  const m = [...css.matchAll(/\.bf-hint\{[^}]*bottom:(\d+)%/g)].pop();
  assert.ok(m && +m[1] >= 25, 'bottom % clears the bar (bar top is at 24.5% of the height)');
});

test('Stats panel can use its full 72em width; the special-relic badge cannot overflow its shield', () => {
  const css = rd('css/diffbar.css');
  assert.match(css, /\.scr\.st6 \.panel\{width:100%\}/);
  assert.match(css, /\.rl-shin \.rl-spk\{[^}]*max-width:100%/);
});
