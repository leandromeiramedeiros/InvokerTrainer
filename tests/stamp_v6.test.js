'use strict';
// cache busting: index.html's local scripts / stylesheets carry ?v=<sha1[0..8] of the file> (tools/stamp.mjs)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');

test('every local script / stylesheet in index.html has a current ?v= content stamp (run node tools/stamp.mjs)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/<script\b[^>]*?\bsrc="([^"]+)"|<link\b[^>]*?rel="stylesheet"[^>]*?\bhref="([^"]+)"/g)].map(m => m[1] || m[2]).filter(u => !/^([a-z]+:)?\/\//i.test(u));
  assert.ok(refs.length > 100, 'found the local refs');
  const bad = [];
  for (const u of refs) {
    const [f, q] = u.split('?');
    const h = crypto.createHash('sha1').update(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 8);
    if (q !== 'v=' + h) bad.push(f + ' want ?v=' + h + ' has ' + (q || 'none'));
  }
  assert.deepStrictEqual(bad, [], 'stale or missing stamps, run node tools/stamp.mjs:\n' + bad.join('\n'));
});
