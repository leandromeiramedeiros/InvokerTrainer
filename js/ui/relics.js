// v6 WP6 relics UI: relic card (stats screen collection + end-splash RELICS PROGRESS panel), the in-play tier toast (glow + fanfare),
// and the StatsCollector hooks (lifetime base for tier crossings, toast on a completed tier). Data: js/data/relics.js.
// item 14: special relics (the 4 big rare ones) get a bigger card / shield with a gold + magenta ornament and a shimmer, list first in the end-splash
// panel, and level up with a much bigger toast (glow sand + god rays + particles + bloom + relicSpecial fanfare) queued one at a time (~3 s each).
// Stats screen: `collection(life)` = the client's 4-3-4-3 layout as a true HONEYCOMB of hexagon tiles (offset rows, hex frame + hex progress ring), RELICS n / 14, then the trainer relics.
// #60: rows never shrink (min-height + flex:none: the old special row had overflow:hidden, so a short flex column squashed it); the end-splash panel shows the special relics as a honeycomb cluster, the rest as rows.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  IT.UI = IT.UI || {};
  const doc = G.document;

  const lifeRelics = () => { const L = IT.UI.Life && IT.UI.Life.load(); return (L && L.relics) || {}; };
  const name = id => IT.t('relic.' + id);
  const icon = key => (IT.UI.icon ? IT.UI.icon(key, 'rl-ico') : IT.UI.h('span', { class: 'rl-ico' }));

  function pips(tier) {
    const h = IT.UI.h, out = [];
    for (let i = 1; i <= IT.RELICS.MAX; i++) out.push(h('i', { class: i <= tier ? 'on' : '' }));
    return h('span', { class: 'rl-pips' }, out);
  }

  // ---- layout model (pure; tests): row min-height / icon sizes (em) and the honeycomb row layout
  const LAYOUT = { rowMinEm: 3.6, spRowMinEm: 4.6, iconEm: 2.6, spIconEm: 3.4, hexW: 8.4, hexWPanel: 7.2 };
  // rows of a honeycomb: sizes = tiles per row; every odd row is shifted half a tile (indent in tile pitches), so 4-3-4-3 nests exactly
  const honeycomb = sizes => sizes.map((n, i) => ({ i, n, indent: i % 2 ? 0.5 : 0 }));
  // split ids into honeycomb rows cycling through `sizes` (e.g. [4, 3]); the last row keeps what is left
  function honeyRows(ids, sizes) {
    const out = []; let k = 0;
    for (let i = 0; k < ids.length; i++) { const n = Math.max(1, sizes[i % sizes.length] | 0), row = ids.slice(k, k + n); k += row.length; out.push({ i, n: row.length, indent: i % 2 ? 0.5 : 0, ids: row }); }
    return out;
  }
  // row sizes for the n special relics advanced in a run (end-splash cluster): 1 / 2 stay flat, 3 = 2 + 1 (triangle), 4 = 2 + 2
  const clusterSizes = n => (n <= 2 ? [Math.max(1, n)] : [2, n - 2]);
  const isSpec = id => !!(IT.RELICS && IT.RELICS.isSpecial(id));
  // special relics first, the rest keep their order (stable)
  const specialFirst = ids => ids.map((id, i) => ({ id, i })).sort((a, b) => (isSpec(b.id) ? 1 : 0) - (isSpec(a.id) ? 1 : 0) || a.i - b.i).map(o => o.id);
  const tipOf = (id, d) => (d.special ? '★ ' + IT.t('relics.special') + '\n' : '') + IT.t('relic.' + id + '.d') + '  [' + IT.t(d.dota ? 'relics.dota' : 'relics.trainer') + ']';

  // hexagon tile geometry: pointy-top regular hexagon in a 100 x 115.47 box, scaled about its centre
  const HEX = [[50, 0], [100, 28.87], [100, 86.6], [50, 115.47], [0, 86.6], [0, 28.87]];
  const hexPts = k => HEX.map(([x, y]) => (50 + (x - 50) * k).toFixed(2) + ',' + (57.735 + (y - 57.735) * k).toFixed(2)).join(' ');
  // svg markup of a tile: fill, frame (+ inner line when special), progress track, progress ring (from the top vertex, clockwise; pathLength = 100 so the dash = percent),
  // and this run's gain segment (from -> frac)
  function hexSvg(frac, from, special) {
    const f = Math.max(0, Math.min(1, frac || 0)), a = Math.max(0, Math.min(f, from == null ? f : from));
    const ring = f >= 0.999 ? '100 0' : (f * 100).toFixed(2) + ' 100';
    const gain = f > a ? '<polygon class="hx-gain" points="' + hexPts(0.89) + '" pathLength="100" stroke-dasharray="' + ((f - a) * 100).toFixed(2) + ' 100" stroke-dashoffset="' + (-a * 100).toFixed(2) + '"/>' : '';
    return '<svg class="rl-hx" viewBox="0 0 100 115.47" aria-hidden="true">'
      + '<polygon class="hx-bg" points="' + hexPts(0.975) + '"/>'
      + '<polygon class="hx-frame" points="' + hexPts(0.985) + '"/>'
      + (special ? '<polygon class="hx-inner" points="' + hexPts(0.94) + '"/>' : '')
      + '<polygon class="hx-track" points="' + hexPts(0.89) + '"/>'
      + (f > 0 ? '<polygon class="hx-ring" points="' + hexPts(0.89) + '" pathLength="100" stroke-dasharray="' + ring + '"/>' : '')
      + gain
      + '<polygon class="hx-fill" points="' + hexPts(0.835) + '"/></svg>';
  }
  const svgNode = markup => { const w = doc.createElement('span'); w.innerHTML = markup; return w.firstChild; };

  // one relic as a hexagon tile: hex frame + hex progress ring, icon, name, tier pips, this run's gain, lifetime / next. Special = gold ornamented hex with a badge + shimmer.
  function hex(id, life, delta) {
    const h = IT.UI.h, t = IT.t, R = IT.RELICS, d = R.get(id);
    if (!d) return null;
    life = life || 0; delta = delta || 0;
    const pg = R.progress(id, life), sp = !!d.special, span = pg.next == null ? 1 : pg.next - pg.prev;
    const from = pg.next == null ? 1 : Math.max(0, (Math.max(pg.prev, life - delta) - pg.prev) / span);
    return h('div', { class: 'rl-hex t' + pg.tier + (sp ? ' special' : '') + (life > 0 ? ' on' : '') + (delta > 0 ? ' adv' : ''), 'data-relic': id, 'data-tip': tipOf(id, d) },
      svgNode(hexSvg(pg.frac, delta > 0 ? from : pg.frac, sp)),
      sp ? h('span', { class: 'rl-orn' }, h('i'), h('i')) : null,
      h('div', { class: 'rl-hxin' },
        sp ? h('small', { class: 'rl-spk', text: '★ ' + t('relics.special') }) : null,
        icon(d.icon),
        h('b', { class: 'rl-nm', text: name(id) }),
        pips(pg.tier),
        delta > 0 ? h('em', { class: 'rl-hd', text: t('relics.delta', { n: R.fmt(id, delta) }) }) : null,
        h('span', { class: 'rl-val', text: pg.next == null ? t('relics.max') : R.fmt(id, life) + ' / ' + R.fmt(id, pg.next) })));
  }
  // honeycomb block: rows = [{ i, ids, indent }]; `tile(id)` builds each hexagon
  function hexgrid(rows, tile, cls) {
    const h = IT.UI.h;
    return h('div', { class: 'rl-hexgrid' + (cls ? ' ' + cls : '') },
      rows.map(r => h('div', { class: 'rl-hrow r' + (r.i + 1), style: { '--ind': r.indent } }, r.ids.map(tile))));
  }

  // one relic row: icon, name, tier pips, progress bar to the next tier (this run's gain highlighted), lifetime + next threshold
  function card(id, life, delta) {
    const h = IT.UI.h, t = IT.t, R = IT.RELICS, d = R.get(id);
    if (!d) return null;
    life = life || 0; delta = delta || 0;
    const pg = R.progress(id, life), span = pg.next == null ? 1 : pg.next - pg.prev;
    const from = pg.next == null ? 1 : Math.max(0, (Math.max(pg.prev, life - delta) - pg.prev) / span);
    const fill = h('i', { style: { width: (pg.frac * 100).toFixed(1) + '%' } });
    const gain = delta > 0 && pg.frac > from ? h('em', { style: { left: (from * 100).toFixed(1) + '%', width: ((pg.frac - from) * 100).toFixed(1) + '%' } }) : null;
    const sp = !!d.special;
    return h('div', { class: 'rl-card t' + pg.tier + (d.dota ? ' dota' : '') + (delta > 0 ? ' adv' : '') + (sp ? ' special' : '') + (sp && life > 0 ? ' on' : ''), 'data-relic': id, 'data-tip': tipOf(id, d) },
      icon(d.icon),
      h('div', { class: 'rl-main' },
        h('div', { class: 'rl-top' },
          h('b', { class: 'rl-name', text: name(id) }),
          sp ? h('small', { class: 'rl-spk', text: '★ ' + t('relics.special') }) : null,
          h('span', { class: 'rl-side' }, pips(pg.tier), h('span', { class: 'rl-tier', text: pg.tier ? t('relics.tier', { t: R.ROMAN[pg.tier] }) : t('relics.noTier') }))),
        h('div', { class: 'rl-bar' }, fill, gain),
        h('div', { class: 'rl-sub' },
          delta > 0 ? h('span', { class: 'rl-delta', text: t('relics.delta', { n: R.fmt(id, delta) }) }) : null,
          h('span', { text: t('relics.life', { n: R.fmt(id, life) }) }),
          h('span', { class: 'rl-next', text: pg.next == null ? t('relics.max') : t('relics.next', { n: R.fmt(id, pg.next) }) }))));
  }

  // ids advanced this run: special relics first, then the rest (relic list order)
  const advanced = deltas => specialFirst(IT.RELICS.LIST.map(r => r.id).filter(id => deltas && deltas[id] > 0));

  // end-splash overlay: every relic advanced this run (delta, lifetime, next tier)
  function panel(deltas, life, onClose) {
    const h = IT.UI.h, t = IT.t, ids = advanced(deltas), sp = ids.filter(isSpec), rest = ids.filter(id => !isSpec(id));
    life = life || lifeRelics();
    let over = null;
    const close = () => { if (over && over.parentNode) over.parentNode.removeChild(over); if (onClose) onClose(); };
    over = h('div', { class: 'rl-over', onclick: e => { if (e.target === over) close(); } },
      h('div', { class: 'rl-panel', role: 'dialog' },
        h('h3', { text: t('relics.run') }),
        ids.length ? h('div', { class: 'rl-list' },
          sp.length ? hexgrid(honeyRows(sp, clusterSizes(sp.length)), id => hex(id, life[id] || deltas[id], deltas[id]), 'sp') : null,
          rest.length ? h('div', { class: 'rl-rows' }, rest.map(id => card(id, life[id] || deltas[id], deltas[id]))) : null)
          : h('div', { class: 'rl-empty' }, h('p', { text: t('relics.none') }), h('p', { class: 'dim', text: t('relics.only') })),
        h('div', { class: 'rl-foot' }, h('button', { type: 'button', class: 'btn gold', 'data-relics-close': '1', onclick: close, text: t('relics.close') }))));
    return over;
  }

  // ---- stats screen: one tile of the client's relic grid (old name kept): the hexagon tile
  const shield = (id, life) => hex(id, life, 0);
  // the whole collection: header "RELICS n / 14", a honeycomb of rows 4 (special) / 3 / 4 / 3 (Dota relics, the live client's layout; odd rows offset half a tile), then the trainer relics
  function collection(life) {
    const h = IT.UI.h, t = IT.t, R = IT.RELICS;
    life = life || lifeRelics();
    const own = R.LIST.filter(r => r.dota && life[r.id] > 0).length;
    const dota = honeycomb(R.ROWS.map(r => r.length)).map(r => Object.assign(r, { ids: R.ROWS[r.i] }));
    const tile = id => shield(id, life[id] || 0);
    return h('div', { class: 'rl-coll' },
      h('div', { class: 'rl-chead' }, h('b', { text: t('relics.count', { n: own, m: R.DOTA }) })),
      hexgrid(dota, tile, 'dota'),
      R.TRAINER.length ? h('div', { class: 'rl-thead', text: t('relics.trainerHead') }) : null,
      R.TRAINER.length ? hexgrid(honeyRows(R.TRAINER, [4, 3]), tile, 'tr') : null);
  }

  // glow sand on the toast (IT.Sand.createGlow: additive hot grains + bloom): a gold burst from the icon falls onto the card's lower edge, piles up,
  // and is blown away to the right just before the toast leaves. Purely decorative; absent engine / canvas / rAF / reduced motion = no-op.
  function glowSand(el, tier) {
    try {
      if (!doc || !IT.Sand || !IT.Sand.createGlow || !G.requestAnimationFrame) return;
      if (G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const r = el.getBoundingClientRect(), S = 2.5, w = Math.min(140, Math.max(40, Math.ceil((r.width || 240) / S))), hh = Math.min(40, Math.max(12, Math.ceil((r.height || 48) / S)));   // ~2.5 screen px per grain
      const cv = IT.UI.h('canvas', { class: 'rl-sand', width: w, height: hh });
      cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;image-rendering:pixelated;z-index:2';
      el.appendChild(cv);
      const sand = IT.Sand.createGlow(cv, { floor: hh - 1, gravity: 80, pile: 3, max: 120, drain: 0.5, wind: 18 });
      const cols = ['#fff4a8', '#f2c444', '#f2c444', '#ffb020', '#c27a10'];
      sand.burst(Math.min(w * 0.18, 14), hh * 0.5, 26 + 10 * (tier || 1), cols, { speed: 34, lift: 18, spread: 4 });
      sand.setEmitters([{ x0: w * 0.1, x1: w * 0.9, y: 1, pal: { h: cols[0], m: cols[1] }, rate: 7 + 2 * (tier || 1), vx: 8 }]);
      let last = G.performance ? G.performance.now() : 0, t0 = last, gone = false;
      const step = now => {
        if (!cv.isConnected) return;
        const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
        if (!gone && now - t0 > 2600) { gone = true; sand.setEmitters([]); sand.disperse(1.2); }
        sand.step(dt); sand.draw();
        if (sand.live()) G.requestAnimationFrame(step);
      };
      G.requestAnimationFrame(step);
    } catch (err) { /* decorative */ }
  }

  // v6 item 15: "+N points this run" (the spendable currency, js/data/shop.js); e.pts = the run's points so far, from StatsCollector
  function ptsLine(e) {
    return e && e.pts > 0 ? IT.UI.h('span', { class: 'rl-pts-line', text: IT.t('pts.run', { n: e.pts }) }) : null;
  }

  // ---- special relic toast queue: one at a time, ~3 s each (pure + injectable timer so it is testable without a DOM)
  const SPECIAL_MS = 3000;
  function createQueue(show, setT) {
    const q = []; let busy = false;
    setT = setT || ((f, ms) => G.setTimeout(f, ms));
    const next = () => {
      if (!q.length) { busy = false; return; }
      busy = true;
      let ms = SPECIAL_MS;
      try { ms = show(q.shift()) || SPECIAL_MS; } catch (err) { /* decorative */ }
      setT(next, ms);
    };
    return { push(e) { q.push(e); if (!busy) next(); }, clear() { q.length = 0; }, get length() { return q.length; }, get busy() { return busy; } };
  }
  const ACCENT = { multi_icewall: '#7fd8ff', three_emp: '#6fa0ff', three_deafening: '#c77bff', multi_meteor: '#ff8a3d' };

  // sand for the special toast: a big burst from the icon, a rain of embers from the top edge, a pile on the card's lower edge that is blown away at the end
  function glowSandSpecial(wrap, card, ico, accent) {
    try {
      if (!doc || !IT.Sand || !IT.Sand.createGlow || !G.requestAnimationFrame) return;
      if (G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const cw = card.offsetWidth || 360, ch = card.offsetHeight || 110, S = 3, mx = Math.round(cw * 0.18), mt = Math.round(ch * 0.9), mb = Math.round(ch * 0.25);
      const w = Math.min(220, Math.ceil((cw + 2 * mx) / S)), hh = Math.min(120, Math.ceil((ch + mt + mb) / S));
      const cv = IT.UI.h('canvas', { class: 'rl-sand', width: w, height: hh });
      cv.style.cssText = 'position:absolute;left:' + -mx + 'px;top:' + -mt + 'px;width:' + (cw + 2 * mx) + 'px;height:' + (ch + mt + mb) + 'px;pointer-events:none;image-rendering:pixelated;z-index:3';
      wrap.appendChild(cv);
      const floor = Math.round((mt + ch - 3) / S);
      const sand = IT.Sand.createGlow(cv, { floor, gravity: 90, pile: 4, max: 220, drain: 0.4, wind: 22 });
      const cols = ['#fff4a8', '#f2c444', '#ffb020', accent, '#ffffff', accent];
      const ix = ico ? ico.offsetLeft + ico.offsetWidth / 2 : 40, iy = ico ? ico.offsetTop + ico.offsetHeight / 2 : ch / 2;
      const bx = (mx + ix) / S, by = (mt + iy) / S;
      sand.burst(bx, by, 150, cols, { speed: 62, lift: 34, spread: 6 });
      setTimeout(() => { try { sand.burst(bx, by, 70, cols, { speed: 40, lift: 20, spread: 10 }); } catch (err) { /* decorative */ } }, 260);
      sand.setEmitters([{ x0: mx / S, x1: (mx + cw) / S, y: mt / S + 1, pal: { h: cols[0], m: cols[1] }, rate: 26, vx: 10 }]);
      let last = G.performance ? G.performance.now() : 0, t0 = last, gone = false;
      const step = now => {
        if (!cv.isConnected) return;
        const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
        if (!gone && now - t0 > 2300) { gone = true; sand.setEmitters([]); sand.disperse(1); }
        sand.step(dt); sand.draw();
        if (sand.live()) G.requestAnimationFrame(step);
      };
      G.requestAnimationFrame(step);
    } catch (err) { /* decorative */ }
  }

  // the big toast: bloom + rotating god rays behind a gold / magenta framed card, particles from the icon, glow sand, fanfare
  function showSpecial(e) {
    const h = IT.UI.h, t = IT.t, R = IT.RELICS, d = R.get(e.id), stage = doc.getElementById('stage') || doc.body;
    let box = stage.querySelector('.rl-sp-box');
    if (!box) { box = h('div', { class: 'rl-sp-box' }); stage.appendChild(box); }
    const accent = ACCENT[e.id] || '#ff4fd8', pg = R.progress(e.id, e.value || 0);
    const ico = icon(d.icon);
    const pts = [];
    for (let i = 0; i < 22; i++) pts.push(h('i', { style: { '--a': (i * 360 / 22 + (i % 3) * 7).toFixed(1) + 'deg', '--d': (3.2 + (i % 4) * 1.5).toFixed(1) + 'em', '--s': (0.28 + (i % 3) * 0.14).toFixed(2) + 'em', '--dl': ((i % 5) * 0.05).toFixed(2) + 's' } }));
    const card = h('div', { class: 'rl-spcard' },
      h('div', { class: 'rl-spico' }, ico),
      h('div', { class: 'rl-sptxt' },
        h('small', { text: t('relics.specialToast', { t: R.ROMAN[e.tier] }) }),
        h('b', { text: name(e.id) }),
        h('div', { class: 'rl-bar' }, h('i', { style: { width: (pg.frac * 100).toFixed(1) + '%' } })),
        h('span', { class: 'rl-val', text: pg.next == null ? t('relics.max') : R.fmt(e.id, e.value || 0) + ' / ' + R.fmt(e.id, pg.next) }),
        ptsLine(e)));
    const wrap = h('div', { class: 'rl-sp', 'data-relic': e.id, style: { '--ac': accent } },
      h('span', { class: 'rl-rays' }), h('span', { class: 'rl-bloom big' }), card, h('span', { class: 'rl-pts' }, pts));
    box.appendChild(wrap);
    while (box.children.length > 2) box.removeChild(box.firstChild);
    glowSandSpecial(wrap, card, card.firstChild, accent);
    setTimeout(() => wrap.classList.add('out'), SPECIAL_MS - 450);
    setTimeout(() => { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, SPECIAL_MS + 100);
    try { if (IT.Sfx && IT.Sfx.relicSpecial) IT.Sfx.relicSpecial(e.tier); } catch (err) { /* audio optional */ }
    return SPECIAL_MS;
  }
  const spQueue = createQueue(e => (doc ? showSpecial(e) : SPECIAL_MS));

  // in-play toast: small card top-left, gold bloom, fanfare; never takes input. Special relics go through the one-at-a-time queue (bigger toast).
  function toast(e) {
    if (!doc || !IT.RELICS || !IT.RELICS.get(e.id)) return null;
    if (IT.RELICS.isSpecial(e.id)) { spQueue.push(e); return null; }
    const h = IT.UI.h, t = IT.t, stage = doc.getElementById('stage') || doc.body;
    let box = stage.querySelector('.rl-toasts');
    if (!box) { box = h('div', { class: 'rl-toasts' }); stage.appendChild(box); }
    const el = h('div', { class: 'rl-toast t' + e.tier },
      h('span', { class: 'rl-bloom' }), icon(IT.RELICS.get(e.id).icon),
      h('div', {}, h('small', { text: t('relics.toast', { t: IT.RELICS.ROMAN[e.tier] }) }), h('b', { text: name(e.id) }), ptsLine(e)));
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    glowSand(el, e.tier);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 3700);
    try { if (IT.Sfx && IT.Sfx.relic) IT.Sfx.relic(e.tier); } catch (err) { /* audio optional */ }
    return el;
  }

  if (IT.StatsCollector) {
    IT.StatsCollector.hooks = IT.StatsCollector.hooks || {};
    IT.StatsCollector.hooks.base = lifeRelics;
    IT.StatsCollector.hooks.tier = toast;
  }
  IT.UI.Relics = { LAYOUT, honeycomb, honeyRows, clusterSizes, specialFirst, hexSvg, hexPts, hex, hexgrid, card, shield, collection, panel, toast, advanced, lifeRelics, createQueue, queue: spQueue, SPECIAL_MS };
})(typeof window !== 'undefined' ? window : globalThis);
