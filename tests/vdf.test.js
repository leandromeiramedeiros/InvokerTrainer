'use strict';
const test = require('node:test');
const assert = require('node:assert');

test('vdf parser', async () => {
  const { parseKV } = await import('../tools/vdf.mjs');
  const kv = parseKV([
    '#base "other.txt"',
    '"Root" // comment',
    '{',
    '  "a" "1"      // trailing',
    '  b  2',
    '  "blk" { "x" "y" "n" { "deep" "z" } }',
    '  /* block',
    '     comment */',
    '  "dup" "first"',
    '  "dup" "second"',
    '  "m" { "k1" "1" }',
    '  "m" { "k2" "2" }',
    '  "cond" "win" [$WIN32]',
    '  "esc" "a\\"b\\\\c"',
    '  "sp ace" "va lue"',
    '  "tab"\t"t"',
    '  "empty" ""',
    '}',
  ].join('\n'));
  const r = kv.Root;
  assert.strictEqual(r.a, '1');
  assert.strictEqual(r.b, '2');
  assert.strictEqual(r.blk.n.deep, 'z');
  assert.strictEqual(r.dup, 'second');
  assert.deepStrictEqual(r.m, { k1: '1', k2: '2' });
  assert.strictEqual(r.cond, 'win');
  assert.strictEqual(r.esc, 'a"b\\c');
  assert.strictEqual(r['sp ace'], 'va lue');
  assert.strictEqual(r.tab, 't');
  assert.strictEqual(r.empty, '');
  assert.ok(!('#base' in kv));
});

test('vdf: case kept, CRLF, // inside quotes', async () => {
  const { parseKV } = await import('../tools/vdf.mjs');
  const kv = parseKV('"Top"\r\n{\r\n\t"MixedCase"\t"http://x//y"\r\n\t"k" "v"\r\n}\r\n');
  assert.strictEqual(kv.Top.MixedCase, 'http://x//y');
  assert.strictEqual(kv.Top.k, 'v');
});

test('vdf: real file parses (if cached)', async () => {
  const fs = require('node:fs'), path = require('node:path');
  const dir = path.join(__dirname, '..', 'tools', '.cache');
  if (!fs.existsSync(dir)) return;
  const sha = fs.readdirSync(dir).find((d) => fs.existsSync(path.join(dir, d, 'npc_dota_hero_invoker.txt')));
  if (!sha) return;
  const { parseKV } = await import('../tools/vdf.mjs');
  const kv = parseKV(fs.readFileSync(path.join(dir, sha, 'npc_dota_hero_invoker.txt'), 'utf8'));
  assert.strictEqual(kv.DOTAHeroes.npc_dota_hero_invoker.AbilityDefinitions.invoker_invoke.AbilityValues.max_invoked_spells, '2');
});
