// Orb level pips (Dota style): up to 7 spent steps + 1 Aghanim's Scepter bonus pip (special-coloured). Shared by the HUD spell row and the loadout orb rows.
// model(base, bonus, max) is pure: [{ n, on, sc }]; the scepter pip exists only when the scepter bonus applies to that orb. counts(model) -> { total, lit }.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  IT.UI = IT.UI || {};
  function model(base, bonus, max) {
    max = max || 7;
    const b = Math.max(0, Math.min(max, Math.floor(base || 0))), out = [];
    for (let n = 1; n <= max; n++) out.push({ n, on: n <= b, sc: false });
    if (bonus > 0) out.push({ n: max + 1, on: true, sc: true });
    return out;
  }
  function counts(m) { return { total: m.length, lit: m.filter(p => p.on).length }; }
  // DOM: <div class="opips quas"><i class="op on"/>...<i class="op sc on"/></div>; deco(i, p) may decorate each pip
  function el(h, orb, m, deco) {
    const box = h('div', { class: 'opips ' + orb });
    for (const p of m) { const i = h('i', { class: 'op' + (p.sc ? ' sc' : '') + (p.on ? ' on' : '') }); if (deco) deco(i, p); box.appendChild(i); }
    return box;
  }
  IT.UI.orbPips = { model, counts, el };
})(typeof window !== 'undefined' ? window : globalThis);
