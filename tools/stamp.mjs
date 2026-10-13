// cache busting: stamp every local <script src> / <link rel=stylesheet href> in index.html with ?v=<sha1[0..8] of the file>
// usage: node tools/stamp.mjs [--check]   (--check exits 1 listing stale/missing stamps, writes nothing)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'index.html');
const check = process.argv.includes('--check');
const bad = [];
const re = /(<script\b[^>]*?\bsrc="|<link\b[^>]*?rel="stylesheet"[^>]*?\bhref="|<link\b[^>]*?\bhref="(?=[^"]*"[^>]*rel="stylesheet"))([^"?#]+)(\?[^"]*)?"/g;
const html = fs.readFileSync(file, 'utf8');
const out = html.replace(re, (m, pre, url, q) => {
  if (/^([a-z]+:)?\/\//i.test(url)) return m;
  const h = crypto.createHash('sha1').update(fs.readFileSync(path.join(root, url), 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 8);   // CRLF-insensitive
  if (q !== '?v=' + h) bad.push(`${url} ${q ? 'stale ' + q : 'missing'} (want ?v=${h})`);
  return `${pre}${url}?v=${h}"`;
});
if (check) { if (bad.length) { console.error('stale stamps, run node tools/stamp.mjs:\n' + bad.join('\n')); process.exit(1); } }
else if (out !== html) { fs.writeFileSync(file, out); console.log('stamped ' + bad.length); }
