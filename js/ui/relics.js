// v6 WP6 relics UI: relic card (stats screen collection + end-splash RELICS PROGRESS panel), the in-play tier toast (glow + fanfare),
// and the StatsCollector hooks (lifetime base for tier crossings, toast on a completed tier). Data: js/data/relics.js.
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
    return h('div', { class: 'rl-card t' + pg.tier + (d.dota ? ' dota' : '') + (delta > 0 ? ' adv' : ''), 'data-relic': id, 'data-tip': t('relic.' + id + '.d') + '  [' + t(d.dota ? 'relics.dota' : 'relics.trainer') + ']' },
      icon(d.icon),
      h('div', { class: 'rl-main' },
        h('div', { class: 'rl-top' }, h('b', { text: name(id) }), pips(pg.tier),
          h('span', { class: 'rl-tier', text: pg.tier ? t('relics.tier', { t: R.ROMAN[pg.tier] }) : t('relics.noTier') })),
        h('div', { class: 'rl-bar' }, fill, gain),
        h('div', { class: 'rl-sub' },
          delta > 0 ? h('span', { class: 'rl-delta', text: t('relics.delta', { n: R.fmt(id, delta) }) }) : null,
          h('span', { text: t('relics.life', { n: R.fmt(id, life) }) }),
          h('span', { class: 'rl-next', text: pg.next == null ? t('relics.max') : t('relics.next', { n: R.fmt(id, pg.next) }) }))));
  }

  // ids advanced this run (relic list order)
  const advanced = deltas => IT.RELICS.LIST.map(r => r.id).filter(id => deltas && deltas[id] > 0);

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

  // in-play toast: small card top-right, gold bloom, fanfare; never takes input
  function toast(e) {
    if (!doc || !IT.RELICS || !IT.RELICS.get(e.id)) return null;
    const h = IT.UI.h, t = IT.t, stage = doc.getElementById('stage') || doc.body;
    let box = stage.querySelector('.rl-toasts');
    if (!box) { box = h('div', { class: 'rl-toasts' }); stage.appendChild(box); }
    const el = h('div', { class: 'rl-toast t' + e.tier },
      h('span', { class: 'rl-bloom' }), icon(IT.RELICS.get(e.id).icon),
      h('div', {}, h('small', { text: t('relics.toast', { t: IT.RELICS.ROMAN[e.tier] }) }), h('b', { text: name(e.id) })));
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
  IT.UI.Relics = { card, panel, toast, advanced, lifeRelics };
})(typeof window !== 'undefined' ? window : globalThis);
