// v6 item 15: the Skin SHOP screen (opened from the SHOP side tab on the title, as a screen-stack push: the main App state stays 'title').
// Balance (relic points) at the top; tabs Player / Enemy / Dummy; framed cards with an animated idle preview, name, price and Buy / Equip / Owned / Equipped.
// Data + rules: js/data/shop.js (IT.Shop). Previews use the real sprite sheets (IT.Art), recoloured per skin where the skin is a tint (spell icons).
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const doc = G.document;
  let tab = 'player';                 // remembered while the page lives
  const PLAYER_ICONS = ['coldsnap', 'ghostwalk', 'icewall', 'emp', 'tornado', 'sunstrike', 'forgespirit', 'chaosmeteor'];

  // sheet of a catalogue entry for its idle preview
  function sheetFor(kind, skin) {
    const A = IT.Art;
    if (kind === 'player') return (A.HERO_SKINS && A.HERO_SKINS[skin]) || 'invoker';
    if (kind === 'dummy') return (A.DUMMY_SHEETS && A.DUMMY_SHEETS[skin]) || 'scarecrow';
    return A.sheets[skin] ? skin : 'pedro';
  }
  // 7x7 gold gem used as the point glyph
  function gem(cls) {
    const c = doc.createElement('canvas'); c.width = 7; c.height = 7; c.className = 'shop-gem' + (cls ? ' ' + cls : '');
    const x = c.getContext('2d'), P = ['...K...', '..KGK..', '.KGWGK.', 'KGWGgdK', '.KgGdK.', '..KdK..', '...K...'], col = { K: '#8a5200', G: '#ffc22a', W: '#fff6bf', g: '#e09a10', d: '#b4780f' };
    for (let y = 0; y < 7; y++) for (let i = 0; i < 7; i++) { const ch = P[y][i]; if (ch === '.') continue; x.fillStyle = col[ch]; x.fillRect(i, y, 1, 1); }
    return c;
  }

  // animated idle preview: logical 48x44 canvas, sprite anchored at its feet (24, 40); shadow ellipse; raven: drifting feather px
  const PW = 48, PH = 44, FX = 24, FY = 40;
  function drawPreview(cv, kind, skin, t) {
    const A = IT.Art, x = cv.getContext('2d'), sheet = sheetFor(kind, skin), def = A.sheets[sheet];
    x.clearRect(0, 0, PW, PH);
    // ground shadow
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(FX - 8, FY, 16, 1); x.fillRect(FX - 6, FY + 1, 12, 1); x.fillRect(FX - 10, FY - 1, 20, 1);
    if (!def) return;
    const n = Math.max(1, A.count(sheet, 'idle', 's')), i = Math.floor(t * 4) % n;
    const cs = A.canvas(sheet, `idle_s_${i}`, false) || A.canvas(sheet, 'idle_s_0', false);
    if (cs) x.drawImage(cs, FX - def.anchor[0], FY - def.anchor[1] + 1);
    if (kind === 'dummy' && skin === 'raven') {
      for (let k = 0; k < 5; k++) {
        const ph = ((t * 0.45 + k * 0.2) % 1), fx = 8 + k * 8 + Math.sin(t * 2 + k * 2) * 3, fy = 10 + ph * 28;
        x.globalAlpha = 1 - ph * 0.8; x.fillStyle = k % 2 ? '#4a5072' : '#2b2d40'; x.fillRect(Math.round(fx), Math.round(fy), 2, 1); x.fillStyle = '#8a92bd'; x.fillRect(Math.round(fx), Math.round(fy), 1, 1); x.globalAlpha = 1;
      }
    }
    if (kind === 'player' && skin !== 'default') {         // a few sparks around the glowing capes / kid
      const col = skin === 'kid' ? '#ffe27a' : skin === 'dark' ? '#e08aff' : '#ffb347';
      for (let k = 0; k < 4; k++) {
        const ph = ((t * 0.5 + k * 0.25) % 1), fx = 6 + k * 11 + Math.sin(t * 1.7 + k) * 2, fy = 34 - ph * 28;
        x.globalAlpha = Math.sin(ph * Math.PI); x.fillStyle = col; x.fillRect(Math.round(fx), Math.round(fy), 1, 1); x.globalAlpha = 1;
      }
    }
  }

  function screen() {
    const { h } = IT.UI, t = IT.t, S = IT.Shop, A = IT.App;
    const sc = Math.max(2, Math.min(6, Math.floor(Math.min((G.innerHeight || 720) / 180, (G.innerWidth || 1280) * 0.72 / 290))));   // 5 enemy cards must fit one row
    const root = h('div', { class: 'scr shopscr', style: { '--shop-s': sc + 'px' } });
    const balNum = h('b', { class: 'shop-bal-n', text: '0' });
    const msg = h('div', { class: 'shop-msg', text: '' });
    const tabs = h('div', { class: 'shop-tabs' });
    const grid = h('div', { class: 'shop-grid' });
    const canvases = [];
    let msgT = 0;

    const nameOf = (k, s) => t('shop.n.' + k + '.' + s);
    function say(text, cls) {
      msg.textContent = text; msg.className = 'shop-msg on ' + (cls || '');
      clearTimeout(msgT); msgT = setTimeout(() => { msg.className = 'shop-msg'; }, 2400);
    }
    function refreshBal(pulse) {
      balNum.textContent = String(S.balance()).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      if (pulse) { balNum.classList.remove('pulse'); void balNum.offsetWidth; balNum.classList.add('pulse'); }
    }

    function card(entry) {
      const { kind, skin, price } = entry, st = S.stateOf(kind, skin), owned = st === 'owned' || st === 'equipped';
      const cv = h('canvas', { class: 'shop-prev', width: PW, height: PH });
      canvases.push({ cv, kind, skin });
      let action;
      if (st === 'equipped') action = h('div', { class: 'shop-state eq', text: t('shop.equipped') });
      else if (st === 'owned' && kind === 'enemy') action = h('div', { class: 'shop-state own', text: t('shop.owned') });
      else if (st === 'owned') action = h('button', { type: 'button', class: 'btn blu shop-act', text: t('shop.equip'), 'data-snd': 'start', onclick: () => { S.equip(kind, skin); say(t('shop.equippedToast', { name: nameOf(kind, skin) }), 'good'); render(); } });
      else if (st === 'buy') action = h('button', { type: 'button', class: 'btn grn shop-act', text: t('shop.buy'), 'data-snd': 'start', onclick: () => buy(entry) });
      else action = h('button', { type: 'button', class: 'btn slt shop-act dis', disabled: 'disabled', text: t('shop.poor', { n: Math.max(0, price - S.balance()) }), onclick: () => say(t('shop.nofunds'), 'bad') });
      const icons = kind === 'player'
        ? h('div', { class: 'shop-icons' }, PLAYER_ICONS.map(k => {
          const c = doc.createElement('canvas'); c.width = 20; c.height = 20; c.className = 'shop-ico';
          const src = IT.Art.canvas('icons', k, false, skin === 'default' ? 'default' : skin);
          if (src) c.getContext('2d').drawImage(src, 0, 0);
          return c;
        }))
        : null;
      return h('div', { class: 'shop-card ' + kind + (owned ? ' owned' : '') + (st === 'equipped' ? ' on' : '') + (st === 'poor' ? ' poor' : ''), 'data-skin': skin },
        h('div', { class: 'shop-stage' }, cv),
        h('div', { class: 'shop-name', text: nameOf(kind, skin) }),
        h('div', { class: 'shop-desc', text: t('shop.d.' + kind + '.' + skin) }),
        icons,
        kind === 'enemy' ? h('div', { class: 'shop-note' + (owned ? ' on' : ''), text: t(owned ? 'shop.ranked.on' : 'shop.ranked') }) : null,
        h('div', { class: 'shop-price' + (price === 0 ? ' free' : '') }, price === 0 ? h('span', { text: t('shop.free') }) : [gem(), h('b', { text: String(price) })]),
        action);
    }

    function buy(entry) {
      const r = S.buy(entry.kind, entry.skin);
      if (!r.ok) { say(t('shop.nofunds'), 'bad'); return; }
      if (entry.kind !== 'enemy') S.equip(entry.kind, entry.skin);       // a freshly bought look is worn at once
      say(t('shop.bought', { name: nameOf(entry.kind, entry.skin) }), 'good');
      render(entry.skin);
    }

    function render(flash) {
      refreshBal(!!flash);
      tabs.textContent = '';
      for (const k of S.KINDS) tabs.appendChild(h('button', { type: 'button', class: 'shop-tab' + (k === tab ? ' on' : ''), text: t('shop.cat.' + k), onclick: () => { tab = k; render(); } }));
      grid.textContent = ''; canvases.length = 0;
      for (const e of S.CATALOG.filter(c => c.kind === tab)) grid.appendChild(card(e));
      if (flash) { const el = grid.querySelector('[data-skin="' + flash + '"]'); if (el) el.classList.add('flash'); }
      frame(0);
    }
    function frame(ts) { for (const c of canvases) drawPreview(c.cv, c.kind, c.skin, ts / 1000); }
    function loop(ts) {
      if (!root.isConnected) { doc.removeEventListener('keydown', onKey, true); return; }
      frame(ts); G.requestAnimationFrame(loop);
    }
    function onKey(ev) {
      if (!root.isConnected) { doc.removeEventListener('keydown', onKey, true); return; }
      if (ev.key !== 'Escape' || ev.repeat) return;
      if (root.parentNode && root.style.display === 'none') return;
      ev.preventDefault(); ev.stopPropagation(); close();
    }
    function close() { doc.removeEventListener('keydown', onKey, true); if (IT.UI.depth() > 1) IT.UI.pop(); else A.go('title'); }

    root.appendChild(h('div', { class: 'panel wide shop' },
      h('h2', { class: 'ph', text: t('shop.title') }),
      h('div', { class: 'shop-top' },
        h('div', { class: 'shop-bal', 'data-tip': t('pts.d') }, gem('big'), h('span', { class: 'shop-bal-l', text: t('shop.balance') }), balNum),
        tabs),
      grid,
      msg,
      h('div', { class: 'shop-hint', text: t('shop.hint') }),
      h('div', { class: 'row end' }, h('button', { type: 'button', class: 'btn gold', text: t('ui.back'), onclick: close }))));
    render();
    doc.addEventListener('keydown', onKey, true);
    G.requestAnimationFrame(loop);
    return root;
  }

  function open() { IT.UI.push(screen); }
  IT.UI.shop = screen;
  IT.UI.shopOpen = open;
  // title side tab (js/ui/menus.js title()): "SHOP" + the balance
  IT.UI.shopTab = function () {
    const { h } = IT.UI;
    if (!IT.Shop) return null;
    return h('button', { type: 'button', class: 'shopside', 'data-snd': 'start', 'data-tip': IT.t('shop.title'), onclick: open },
      gem(), h('b', { text: IT.t('shop.tab') }), h('span', { text: String(IT.Shop.balance()) }));
  };
})(typeof window !== 'undefined' ? window : globalThis);
