// v6 item 15: the Skin SHOP screen (opened from the SHOP side tab on the title, as a screen-stack push: the main App state stays 'title').
// Balance (relic points) at the top; tabs Player / Enemy / Dummy; framed cards with an animated idle preview, name, price and Buy / Equip / Owned / Equipped.
// Data + rules: js/data/shop.js (IT.Shop). Previews use the real sprite sheets (IT.Art), recoloured per skin where the skin is a tint (spell icons).
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const doc = G.document;
  let tab = 'player';                 // remembered while the page lives
  const PLAYER_ICONS = ['coldsnap', 'ghostwalk', 'icewall', 'emp', 'tornado', 'sunstrike', 'forgespirit', 'chaosmeteor'];

  // ---- v6 item 69: purchase TL. Pure timing + state machine (testable without a DOM); the screen below drives it from rAF.
  // timeline (s): press squash -> counter ticks + gems lift off the price -> gems fly into the card -> card flips -> OWNED (gold burst, rays, rain) -> done
  const TL = { press: 0.12, tickEnd: 0.5, flyEnd: 0.88, flipMid: 0.99, flipEnd: 1.1, rain: 2.0, rainPremium: 2.7, disperse: 1.0, rays: 3.2, raysPremium: 3.9, cast: 1.5, gems: 9, gemsPremium: 16, flyDur: 0.38, premiumPrice: 250 };
  const PREMIUM_SKINS = { vitinian: 1, exalted: 1 };
  const PHASES = ['press', 'tick', 'fly', 'flip', 'owned', 'done'];
  const isPremium = (kind, skin, price) => !!PREMIUM_SKINS[skin] || (price || 0) >= TL.premiumPrice;
  const endAt = premium => TL.flipEnd + (premium ? TL.rainPremium : TL.rain) + TL.disperse;
  function phaseAt(t, premium) {
    if (t < TL.press) return 'press';
    if (t < TL.tickEnd) return 'tick';
    if (t < TL.flyEnd) return 'fly';
    if (t < TL.flipEnd) return 'flip';
    return t < endAt(premium) ? 'owned' : 'done';
  }
  const ease = k => k <= 0 ? 0 : k >= 1 ? 1 : 1 - Math.pow(1 - k, 3);
  // displayed balance: holds at `from` until the tick window, falls to `to` by its end
  function tickValue(from, to, t) { return Math.round(from + (to - from) * ease((t - TL.press) / (TL.tickEnd - TL.press))); }
  // gem i of n: lift-off time (staggered over the tick window) and flight along a quadratic arc a -> b
  const gemStart = (i, n) => TL.press + (TL.tickEnd - TL.press - 0.1) * (n <= 1 ? 0 : i / (n - 1));
  function flyPos(a, b, k, arc) {
    k = Math.max(0, Math.min(1, k)); const e = k * k * (3 - 2 * k), mx = (a.x + b.x) / 2 + (arc || 0), my = Math.min(a.y, b.y) - 30 * (1 - Math.abs(0.5 - k));
    return { x: (1 - e) * (1 - e) * a.x + 2 * (1 - e) * e * mx + e * e * b.x, y: (1 - e) * (1 - e) * a.y + 2 * (1 - e) * e * my + e * e * b.y };
  }
  // one purchase = one state machine; advance(t) emits each phase event once, in order (even when a frame skips several). reduced = jump straight to the end state.
  function createPurchase(o) {
    const premium = o.premium != null ? !!o.premium : isPremium(o.kind, o.skin, o.price), reduced = !!o.reduced, log = [];
    let idx = -1, t = 0, bal = o.from;
    const self = {
      kind: o.kind, skin: o.skin, premium, reduced, log,
      get phase() { return idx < 0 ? null : PHASES[idx]; },
      get balance() { return bal; },
      get t() { return t; },
      get done() { return idx === PHASES.length - 1; },
      advance(now) {
        t = reduced ? endAt(premium) : Math.max(t, now);
        const want = PHASES.indexOf(phaseAt(t, premium)), ev = [];
        while (idx < want) { idx++; ev.push(PHASES[idx]); log.push(PHASES[idx]); }
        bal = reduced || idx >= 2 ? o.to : tickValue(o.from, o.to, t);
        return ev;
      },
    };
    return self;
  }
  const canAfford = (balance, price) => balance >= price;
  IT.ShopFx = { FX: TL, PHASES, isPremium, phaseAt, endAt, tickValue, gemStart, flyPos, createPurchase, canAfford };
  const reduced = () => { try { return !!(G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };
  const sfx = k => { try { if (IT.Sfx && IT.Sfx.shop) IT.Sfx.shop(k); } catch (e) { /* sound optional */ } };
  // god rays: drawn ONCE (radial streaks fading outward); CSS rotates it
  function raysCanvas(n, col) {
    const S = 256, cv = doc.createElement('canvas'); cv.width = cv.height = S; cv.className = 'shop-rays';
    const c = cv.getContext('2d'); if (!c) return cv;
    const r = S / 2; c.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.2832 + (i % 2) * 0.05, w = 0.04 + (i % 3) * 0.016;
      c.globalAlpha = 0.65 + (i % 2) * 0.35;
      c.beginPath(); c.moveTo(r, r); c.lineTo(r + Math.cos(a - w) * r * 1.5, r + Math.sin(a - w) * r * 1.5); c.lineTo(r + Math.cos(a + w) * r * 1.5, r + Math.sin(a + w) * r * 1.5); c.closePath(); c.fill();
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'destination-in';
    const g = c.createRadialGradient(r, r, 4, r, r, r);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    return cv;
  }

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
  function drawPreview(cv, kind, skin, t, cast) {
    const A = IT.Art, x = cv.getContext('2d'), sheet = sheetFor(kind, skin), def = A.sheets[sheet];
    x.clearRect(0, 0, PW, PH);
    // ground shadow (v6 #65: widens with the sprite frame: the 34-px Vitinian gets a bulkier blob)
    const sw = kind === 'enemy' && IT.Skins && IT.Skins.meta ? Math.max(0, Math.round((IT.Skins.meta(skin).w - 20) / 4)) : 0;
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(FX - 8 - sw, FY, 16 + sw * 2, 1); x.fillRect(FX - 6 - sw, FY + 1, 12 + sw * 2, 1); x.fillRect(FX - 10 - sw, FY - 1, 20 + sw * 2, 1);
    if (!def) return;
    let n = Math.max(1, A.count(sheet, 'idle', 's')), i = Math.floor(t * 4) % n, anim = 'idle', hop = 0;
    if (cast != null && cast >= 0 && cast < TL.cast) {   // v6 #69: a little cast (hero) / attack (foes) + hop right after the unlock
      const ca = A.count(sheet, 'cast', 's') ? 'cast' : A.count(sheet, 'attack', 's') ? 'attack' : null, k = cast / TL.cast;
      if (ca) { anim = ca; n = A.count(sheet, ca, 's'); i = Math.min(n - 1, Math.floor(k * 1.6 * n)); if (k > 0.62) { anim = 'idle'; n = Math.max(1, A.count(sheet, 'idle', 's')); i = Math.floor(t * 4) % n; } }
      hop = Math.round(Math.abs(Math.sin(cast * 9)) * 4 * (1 - k));
    }
    const cs = A.canvas(sheet, `${anim}_s_${i}`, false) || A.canvas(sheet, 'idle_s_0', false);
    if (cs) x.drawImage(cs, FX - def.anchor[0], FY - def.anchor[1] + 1 - hop);
    if (cast != null && cast >= 0 && cast < TL.cast) {   // sparkle ring
      const k = cast / TL.cast;
      for (let q = 0; q < 10; q++) {
        const a = q / 10 * 6.283 + cast * 2.4, rr = 6 + k * 18, px = FX + Math.cos(a) * rr, py = FY - 14 + Math.sin(a) * rr * 0.7;
        x.globalAlpha = 1 - k; x.fillStyle = q % 2 ? '#fff4a8' : '#f2c444'; x.fillRect(Math.round(px), Math.round(py), 1, 1);
      }
      x.globalAlpha = 1;
    }
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
      else if (st === 'buy') action = h('button', { type: 'button', class: 'btn grn shop-act', text: t('shop.buy'), 'data-snd': 'none', onclick: ev => buy(entry, ev.currentTarget) });
      else action = h('button', { type: 'button', class: 'btn slt shop-act dis', 'aria-disabled': 'true', 'data-snd': 'none', text: t('shop.poor', { n: Math.max(0, price - S.balance()) }), onclick: ev => buy(entry, ev.currentTarget) });
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

    // ---- v6 #69 purchase moment (state machine: IT.ShopFx.createPurchase): press squash + coin clink -> counter ticks, gems lift off the price ->
    // gems fly into the card -> card flips -> OWNED: gold glow-sand burst + shine sweep + god rays + heavy glow-sand rain, cast animation, chime / fanfare
    let active = null, castKey = '', castT0 = 0;
    const now = () => (G.performance && G.performance.now ? G.performance.now() : Date.now());
    const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    function denied(card) {
      sfx('poor'); say(t('shop.nofunds'), 'bad');
      if (reduced() || !card) return;
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      setTimeout(() => card.classList.remove('shake'), 480);
    }
    function buy(entry, btn) {
      const cardEl = btn && btn.closest ? btn.closest('.shop-card') : null, X = IT.ShopFx;
      if (active && !active.p.done && X.phaseAt(active.p.t, active.p.premium) !== 'owned') return;    // one purchase at a time while the card is still flipping
      const from = S.balance();
      if (!X.canAfford(from, entry.price)) { denied(cardEl); return; }
      const r = S.buy(entry.kind, entry.skin);
      if (!r.ok) { denied(cardEl); return; }
      if (entry.kind !== 'enemy') S.equip(entry.kind, entry.skin);       // a freshly bought look is worn at once
      if (active) endFx();
      const p = X.createPurchase({ kind: entry.kind, skin: entry.skin, price: entry.price, from, to: S.balance(), reduced: reduced() });
      say(t('shop.bought', { name: nameOf(entry.kind, entry.skin) }), 'good');
      sfx('coin');
      if (p.reduced || !cardEl || !G.requestAnimationFrame) {         // reduced motion: instant state change, sounds kept
        p.advance(0); render(entry.skin); sfx(p.premium ? 'premium' : 'unlock'); return;
      }
      if (btn) { btn.classList.remove('sq'); void btn.offsetWidth; btn.classList.add('sq'); btn.setAttribute('aria-disabled', 'true'); }
      cardEl.classList.add('fx');
      active = { p, entry, card: cardEl, t0: now(), gems: [], swapped: false, sand: null, rays: null, extra: [], last: 0, sandOff: false };
      spawnGems(active);
      G.requestAnimationFrame(fxLoop);
    }
    function spawnGems(a) {
      const X = IT.ShopFx, n = a.p.premium ? X.FX.gemsPremium : X.FX.gems, cr = a.card.getBoundingClientRect(), pr = a.card.querySelector('.shop-price'), st = a.card.querySelector('.shop-stage');
      if (!pr || !st) return;
      const r1 = pr.getBoundingClientRect(), r2 = st.getBoundingClientRect();
      const A_ = { x: r1.left + r1.width / 2 - cr.left, y: r1.top + r1.height / 2 - cr.top }, B_ = { x: r2.left + r2.width / 2 - cr.left, y: r2.top + r2.height * 0.6 - cr.top };
      for (let i = 0; i < n; i++) {
        const el = gem('shop-fly'); el.style.opacity = '0';
        a.card.appendChild(el);
        a.gems.push({ el, start: X.gemStart(i, n), from: { x: A_.x + (i % 3 - 1) * 5, y: A_.y }, to: { x: B_.x + ((i * 7) % 13 - 6) * 3, y: B_.y + ((i * 5) % 9 - 4) * 2 }, arc: (i % 2 ? 1 : -1) * (14 + (i % 4) * 8), done: false });
      }
    }
    // swap the (now owned) card in at the middle of the flip and start the rewards on it
    function swapIn(a, ts) {
      const { h } = IT.UI;
      a.swapped = true;
      render(a.entry.skin);
      const card_ = grid.querySelector('[data-skin="' + a.entry.skin + '"]');
      if (!card_) return;
      a.card = card_; card_.classList.add('fx', 'fx-in');
      castKey = a.entry.kind + ':' + a.entry.skin; castT0 = ts;
      sfx(a.p.premium ? 'premium' : 'unlock');
      const prem = a.p.premium, X = IT.ShopFx, cw = card_.offsetWidth || 280, ch = card_.offsetHeight || 380;
      const rb = h('span', { class: 'shop-raybox' + (prem ? ' big' : ''), style: { '--rs': Math.round(cw * (prem ? 2.7 : 1.7)) + 'px', '--rt': (prem ? X.FX.raysPremium : X.FX.rays) + 's' } }, raysCanvas(prem ? 16 : 10, prem ? '#ffe9a0' : '#ffd45a'));
      card_.appendChild(rb); a.rays = rb;
      const un = h('span', { class: 'shop-unl' + (prem ? ' prem' : ''), text: t(prem ? 'shop.unlockedPremium' : 'shop.unlocked') });
      card_.appendChild(un); a.extra.push(un);
      try {
        if (IT.Sand && IT.Sand.createGlow) {
          const S3 = 3, w = Math.max(20, Math.ceil(cw / S3)), hh = Math.max(20, Math.ceil(ch / S3)), cv = h('canvas', { class: 'shop-sand', width: w, height: hh });
          card_.appendChild(cv);
          const sand = IT.Sand.createGlow(cv, { floor: hh - 2, gravity: 110, pile: 5, max: prem ? 520 : 340, drain: 0.35, wind: 22 });
          const accent = { exalted: '#ff6a3d', vitinian: '#9be86a' }[a.entry.skin] || '#ffb020', cols = ['#fff4a8', '#f2c444', '#f2c444', '#ffb020', '#ffffff', accent];
          const sg = card_.querySelector('.shop-stage'), by = sg ? (sg.offsetTop + sg.offsetHeight * 0.6) / S3 : hh * 0.4;
          sand.burst(w / 2, by, prem ? 260 : 160, cols, { speed: 74, lift: 42, spread: 6 });
          sand.setEmitters([{ x0: 2, x1: w - 2, y: 0, pal: { h: cols[0], m: cols[1] }, rate: prem ? 260 : 170, vx: 12 }]);
          a.sand = sand; a.cv = cv; a.sandT = ts; a.last = ts;
        }
      } catch (err) { /* decorative */ }
    }
    function endFx() {
      const a = active; active = null;
      if (!a) return;
      for (const g of a.gems) if (g.el.parentNode) g.el.remove();
      if (a.cv && a.cv.parentNode) a.cv.remove();
      if (a.rays && a.rays.parentNode) a.rays.remove();
      for (const e of a.extra) if (e.parentNode) e.remove();
      if (a.card) a.card.classList.remove('fx', 'fx-in', 'fx-out');
      refreshBal(false);
    }
    function fxLoop(ts) {
      const a = active, X = IT.ShopFx;
      if (!a) return;
      if (!root.isConnected || !a.card.isConnected) { endFx(); return; }
      const t = Math.max(0, (ts - a.t0) / 1000), ev = a.p.advance(t);
      balNum.textContent = fmt(a.p.balance);
      if (ev.indexOf('flip') >= 0) a.card.classList.add('fx-out');
      if (!a.swapped && t >= X.FX.flipMid) swapIn(a, ts);
      for (const g of a.gems) {
        if (g.done) continue;
        const k = (t - g.start) / X.FX.flyDur;
        if (k < 0) continue;
        if (k >= 1) { g.done = true; g.el.remove(); continue; }
        const q = X.flyPos(g.from, g.to, k, g.arc);
        g.el.style.opacity = '1'; g.el.style.transform = 'translate(' + (q.x - 7).toFixed(1) + 'px,' + (q.y - 7).toFixed(1) + 'px) scale(' + (1 - k * 0.35).toFixed(2) + ')';
      }
      if (a.sand) {
        const dt = Math.min(0.05, Math.max(0, (ts - (a.last || ts)) / 1000)); a.last = ts;
        const el = (ts - a.sandT) / 1000;
        if (!a.sandOff && el > (a.p.premium ? X.FX.rainPremium : X.FX.rain)) { a.sandOff = true; a.sand.setEmitters([]); a.sand.disperse(X.FX.disperse); }
        a.sand.step(dt); a.sand.draw();
      }
      if (a.p.done && !(a.sand && a.sand.live() && (ts - a.sandT) / 1000 < X.FX.rain + X.FX.disperse + 3)) { endFx(); return; }
      G.requestAnimationFrame(fxLoop);
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
    function frame(ts) { for (const c of canvases) drawPreview(c.cv, c.kind, c.skin, ts / 1000, castKey === c.kind + ':' + c.skin ? (ts - castT0) / 1000 : null); }
    function loop(ts) {
      if (!root.isConnected) { doc.removeEventListener('keydown', onKey, true); if (active) endFx(); return; }
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
  // the title SHOP side tab lives in js/ui/menus.js (v6 #72)
})(typeof window !== 'undefined' ? window : globalThis);
