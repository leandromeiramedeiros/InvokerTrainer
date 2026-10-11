'use strict';
const test = require('node:test');
const assert = require('node:assert');
const load = require('./_load');

const IT = load(['js/data/i18n.js', 'js/data/i18n/s3.js', 'js/ui/dummychat.js']);
const DC = IT.DummyChat;

test('every taunt category has 15+ lines in EN and PT-BR', () => {
  for (const cat of DC.CATS) {
    const n = DC.lines(cat).length;
    assert.ok(n >= 15, cat + ' has ' + n);
    for (const lang of IT.langs) {
      IT.setLang ? IT.setLang(lang) : (IT.lang = lang);
      for (const i of DC.lines(cat)) {
        const s = IT.t('dc.' + cat + '.' + i);
        assert.ok(s && s !== 'dc.' + cat + '.' + i, cat + '.' + i + ' ' + lang);
      }
    }
  }
  IT.lang = 'en';
});

test('pick never repeats the previous line', () => {
  let prev = null;
  for (let i = 0; i < 60; i++) {
    const s = DC.pick('fail');
    assert.notStrictEqual(s, prev);
    prev = s;
  }
});

test('needed() merges scenario solution and combo steps', () => {
  assert.strictEqual(DC.needed({}), null);
  const n = DC.needed({ ranked: { pr: { sc: { sol: [{ a: 'coldsnap' }, { a: 'attack' }] } } }, combo: { def: { steps: [{ ability: 'emp' }, { type: 'move' }] } } });
  assert.ok(n.has('coldsnap') && n.has('emp') && n.has('attack'));
});
