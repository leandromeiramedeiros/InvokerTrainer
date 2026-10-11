// Minimal Valve KeyValues parser. parseKV(text) -> plain object.
// Strings stay strings; blocks become objects. Duplicate keys: later wins
// (blocks with the same key are merged key-by-key). `#base`/`#include` lines
// and [$CONDITIONAL] tokens are ignored. Original key case is kept.
export function parseKV(text) {
  const toks = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\uFEFF') { i++; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '{' || c === '}') { toks.push({ t: c }); i++; continue; }
    if (c === '"') {
      let s = ''; i++;
      while (i < n && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < n) {
          const d = text[i + 1];
          s += d === 'n' ? '\n' : d === 't' ? '\t' : d === '\\' ? '\\' : d === '"' ? '"' : '\\' + d;
          i += 2;
        } else s += text[i++];
      }
      i++;
      toks.push({ t: 's', v: s, q: true });
      continue;
    }
    if (c === '[') { // conditional
      const e = text.indexOf(']', i); i = e < 0 ? n : e + 1; continue;
    }
    let j = i;
    while (j < n && !/[\s{}"]/.test(text[j]) && !(text[j] === '/' && text[j + 1] === '/')) j++;
    const w = text.slice(i, j);
    i = j;
    if (/^#(base|include)$/i.test(w)) {
      // skip the directive's argument (next token on the line)
      while (i < n && (text[i] === ' ' || text[i] === '\t')) i++;
      if (text[i] === '"') { const e = text.indexOf('"', i + 1); i = e < 0 ? n : e + 1; }
      else while (i < n && text[i] !== '\n') i++;
      continue;
    }
    toks.push({ t: 's', v: w });
  }
  let p = 0;
  function block(top) {
    const o = {};
    while (p < toks.length) {
      const k = toks[p];
      if (k.t === '}') { if (top) { p++; continue; } return o; }
      if (k.t === '{') { p++; block(false); if (toks[p] && toks[p].t === '}') p++; continue; }
      p++;
      const key = k.v;
      const nx = toks[p];
      if (!nx) break;
      if (nx.t === '{') {
        p++;
        const sub = block(false);
        if (toks[p] && toks[p].t === '}') p++;
        if (o[key] && typeof o[key] === 'object') Object.assign(o[key], sub); else o[key] = sub;
      } else if (nx.t === 's') { o[key] = nx.v; p++; }
      else continue;
    }
    return o;
  }
  return block(true);
}
