// v6 WP6 relics UI: relic card (stats screen collection + end-splash RELICS PROGRESS panel), the in-play tier toast (glow + fanfare),
// and the StatsCollector hooks (lifetime base for tier crossings, toast on a completed tier). Data: js/data/relics.js.
// item 14: special relics (the 4 big rare ones) get a bigger card / shield with a gold + magenta ornament and a shimmer, list first in the end-splash
// panel, and level up with a much bigger toast (glow sand + god rays + particles + bloom + relicSpecial fanfare) queued one at a time (~3 s each).
// Stats screen: `collection(life)` = the client's 4-3-4-3 shield layout (RELICS n / 14), then the trainer relics.
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

  // one relic: icon, name, tier pips, progress bar to the next tier (this run's gain highlighted), lifetime + next threshold
  function card(id, life, delta) {
    const h = IT.UI.h, t = IT.t, R = IT.RELICS, d = R.get(id);
    if (!d) return null;
    life = life || 0; delta = delta || 0;
    const pg = R.progress(id, life), span = pg.next == null ? 1 : pg.next - pg.prev;
    const from = pg.next == null ? 1 : Math.max(0, (Math.max(pg.prev, life - delta) - pg.prev) / span);
    const fill = h('i', { style: { width: (pg.frac * 100).toFixed(1) + '%' } });
    const gain = delta > 0 && pg.frac > from ? h('em', { style: { left: (from * 100).toFixed(1) + '%', width: ((pg.frac - from) * 100).toFixed(1) + '%' } }) : null;
    return h('div', { class: 'rl-card t' + pg.tier + (d.dota ? ' dota' : '') + (delta > 0 ? ' adv' : '') + (d.special ? ' special' : '') + (d.special && life > 0 ? ' on' : ''), 'data-relic': id, 'data-tip': t('relic.' + id + '.d') + '  [' + t(d.dota ? 'relics.dota' : 'relics.trainer') + ']' },
      icon(d.icon),
      h('div', { class: 'rl-main' },
        d.special ? h('small', { class: 'rl-spk', text: t('relics.special') }) : null,
        h('div', { class: 'rl-top' }, h('b', { text: name(id) }), pips(pg.tier),
          h('span', { class: 'rl-tier', text: pg.tier ? t('relics.tier', { t: R.ROMAN[pg.tier] }) : t('relics.noTier') })),
        h('div', { class: 'rl-bar' }, fill, gain),
        h('div', { class: 'rl-sub' },
          delta > 0 ? h('span', { class: 'rl-delta', text: t('relics.delta', { n: R.fmt(id, delta) }) }) : null,
          h('span', { text: t('relics.life', { n: R.fmt(id, life) }) }),
          h('span', { class: 'rl-next', text: pg.next == null ? t('relics.max') : t('relics.next', { n: R.fmt(id, pg.next) }) }))));
  }

  // ids advanced this run: special relics first, then the rest (relic list order)
  const advanced = deltas => IT.RELICS.LIST.map(r => r.id).filter(id => deltas && deltas[id] > 0)
    .sort((a, b) => (IT.RELICS.isSpecial(b) ? 1 : 0) - (IT.RELICS.isSpecial(a) ? 1 : 0));

  // end-splash overlay: every relic advanced this run (delta, lifetime, next tier)
  function panel(deltas, life, onClose) {
    const h = IT.UI.h, t = IT.t, ids = advanced(deltas);
    life = life || lifeRelics();
    let over = null;
    const close = () => { if (over && over.parentNode) over.parentNode.removeChild(over); if (onClose) onClose(); };
    over = h('div', { class: 'rl-over', onclick: e => { if (e.target === over) close(); } },
      h('div', { class: 'rl-panel', role: 'dialog' },
        h('h3', { text: t('relics.run') }),
        ids.length ? h('div', { class: 'rl-list' }, ids.map(id => card(id, life[id] || deltas[id], deltas[id])))
          : h('div', { class: 'rl-empty' }, h('p', { text: t('relics.none') }), h('p', { class: 'dim', text: t('relics.only') })),
        h('div', { class: 'rl-foot' }, h('button', { type: 'button', class: 'btn gold', 'data-relics-close': '1', onclick: close, text: t('relics.close') }))));
    return over;
  }

  // ---- stats screen: one shield of the client's relic grid (icon, name, tier pips, bar to the next tier, lifetime / next)
  function shield(id, life) {
    const h = IT.UI.h, t = IT.t, R = IT.RELICS, d = R.get(id);
    if (!d) return null;
    life = life || 0;
    const pg = R.progress(id, life);
    const sp = !!d.special;
    return h('div', { class: 'rl-tile' + (sp ? ' special' : ''), 'data-relic': id, 'data-tip': t('relic.' + id + '.d') + '  [' + t(d.dota ? 'relics.dota' : 'relics.trainer') + ']' },
      h('div', { class: 'rl-sh t' + pg.tier + (sp ? ' special' : '') + (life > 0 ? ' on' : '') },
        h('div', { class: 'rl-shin' },
          sp ? h('span', { class: 'rl-orn' }, h('i'), h('i'), h('i')) : null,
          icon(d.icon),
          h('b', { class: 'rl-nm', text: name(id) }),
          pips(pg.tier),
          h('div', { class: 'rl-bar' }, h('i', { style: { width: (pg.frac * 100).toFixed(1) + '%' } })),
          h('span', { class: 'rl-val', text: pg.next == null ? t('relics.max') : R.fmt(id, life) + ' / ' + R.fmt(id, pg.next) }))));
  }
  // the whole collection: header "RELICS n / 14", rows 4 (special) / 3 / 4 / 3 (Dota relics, the live client's layout), then the trainer relics
  function collection(life) {
    const h = IT.UI.h, t = IT.t, R = IT.RELICS;
    life = life || lifeRelics();
    const own = R.LIST.filter(r => r.dota && life[r.id] > 0).length;
    const rows = R.ROWS.map((ids, i) => h('div', { class: 'rl-row r' + (i + 1) + (i === 0 ? ' sp' : '') }, ids.map(id => shield(id, life[id] || 0))));
    return h('div', { class: 'rl-coll' },
      h('div', { class: 'rl-chead' }, h('b', { text: t('relics.count', { n: own, m: R.DOTA }) })),
      h('div', { class: 'rl-grid' }, rows),
      R.TRAINER.length ? h('div', { class: 'rl-thead', text: t('relics.trainerHead') }) : null,
      R.TRAINER.length ? h('div', { class: 'rl-row tr' }, R.TRAINER.map(id => shield(id, life[id] || 0))) : null);
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
  IT.UI.Relics = { card, shield, collection, panel, toast, advanced, lifeRelics, createQueue, queue: spQueue, SPECIAL_MS };
})(typeof window !== 'undefined' ? window : globalThis);
