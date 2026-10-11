// UI helpers (element builder, icons, tooltip, toasts, screen stack) + title and pause menus.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const doc = G.document;

  function h(tag, attrs) {
    const el = doc.createElement(tag);
    let i = 2;
    if (attrs && (typeof attrs === 'string' || attrs instanceof Node || Array.isArray(attrs))) { i = 1; attrs = null; }
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') for (const s in v) { if (s[0] === '-') el.style.setProperty(s, v[s]); else el.style[s] = v[s]; }
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = c => {
      if (c == null || c === false) return;
      if (Array.isArray(c)) c.forEach(add);
      else el.appendChild(c instanceof Node ? c : doc.createTextNode(String(c)));
    };
    for (; i < arguments.length; i++) add(arguments[i]);
    return el;
  }

  function icon(key, cls) {
    const src = IT.Art && IT.Art.canvas('icons', key);
    const c = doc.createElement('canvas');
    c.className = 'ico' + (cls ? ' ' + cls : '');
    c.width = 20; c.height = 20;
    if (src) c.getContext('2d').drawImage(src, 0, 0);
    return c;
  }
  function portrait(sheet, cls) {
    const src = IT.Art && IT.Art.canvas(sheet, 'portrait');
    const c = doc.createElement('canvas');
    c.className = 'por' + (cls ? ' ' + cls : '');
    c.width = 32; c.height = 32;
    if (src) c.getContext('2d').drawImage(src, 0, 0);
    return c;
  }

  // ---- tooltip ([data-tip] anywhere)
  let tipEl = null;
  function initTip() {
    if (tipEl) return;
    tipEl = h('div', { id: 'tip', class: 'tip' });
    doc.body.appendChild(tipEl);
    const move = ev => {
      const t = ev.target && ev.target.closest && ev.target.closest('[data-tip]');
      const txt = t && t.getAttribute('data-tip');
      if (!txt) { tipEl.style.display = 'none'; return; }
      tipEl.textContent = txt; tipEl.style.display = 'block';
      const r = tipEl.getBoundingClientRect();
      let x = ev.clientX + 14, y = ev.clientY + 16;
      if (x + r.width > innerWidth - 4) x = ev.clientX - r.width - 10;
      if (y + r.height > innerHeight - 4) y = ev.clientY - r.height - 10;
      tipEl.style.left = Math.max(2, x) + 'px'; tipEl.style.top = Math.max(2, y) + 'px';
    };
    doc.addEventListener('mousemove', move);
    doc.addEventListener('mouseover', move);
    doc.addEventListener('mousedown', () => { tipEl.style.display = 'none'; });
  }

  // ---- toasts (live in #toasts inside the stage)
  const recent = {};
  function toast(text, kind) {
    const box = doc.getElementById('toasts'); if (!box) return;
    const now = Date.now();
    if (recent[text] && now - recent[text] < 350) return;
    recent[text] = now;
    const el = h('div', { class: 'toast ' + (kind || 'info'), text });
    box.appendChild(el);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => el.classList.add('out'), 1500);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 1900);
  }
  function clearToasts() { const b = doc.getElementById('toasts'); if (b) b.textContent = ''; }

  // ---- screen stack: entries { build(), el }
  const stack = [];
  let root = null;
  function ensureRoot() { if (!root) root = doc.getElementById('screens'); return root; }
  function mount(e, over) {
    e.el = e.build();
    e.el.classList.add('screen');
    if (over) e.el.classList.add('overlay');
    ensureRoot().appendChild(e.el);
  }
  function set(build) { clear(); return push(build); }
  function push(build, over) {
    ensureRoot();
    const top = stack[stack.length - 1];
    if (top) top.el.style.display = 'none';
    const e = { build, over: !!over, el: null };
    mount(e, over);
    stack.push(e);
    root.classList.add('on');
    return e;
  }
  function pop() {
    const e = stack.pop();
    if (e && e.el.parentNode) e.el.parentNode.removeChild(e.el);
    const top = stack[stack.length - 1];
    if (top) top.el.style.display = '';
    else if (root) root.classList.remove('on');
    return e;
  }
  function clear() { while (stack.length) pop(); if (ensureRoot()) root.classList.remove('on'); }
  function depth() { return stack.length; }
  function rebuild() {
    for (const e of stack) {
      const old = e.el, hid = old.style.display;
      mount(e, e.over);
      old.parentNode.replaceChild(e.el, old);
      e.el.style.display = hid;
    }
  }
  IT.onLang && IT.onLang(() => { rebuild(); });

  // ---- common widgets
  const btn = (key, fn, cls, vars) => h('button', { class: 'btn ' + (cls || ''), type: 'button', onclick: fn, text: IT.t(key, vars) });
  function langToggle() {
    const wrap = h('div', { class: 'seg lang' });
    for (const l of IT.langs) {
      wrap.appendChild(h('button', {
        type: 'button', class: 'seg-b' + (IT.lang === l ? ' on' : ''), text: l.toUpperCase(),
        onclick: () => { IT.Settings.set({ lang: l }); },
      }));
    }
    return wrap;
  }
  function panel(title, body, cls) {
    return h('div', { class: 'panel ' + (cls || '') }, title ? h('h2', { class: 'ph', text: title }) : null, body);
  }

  // ---- title (mode-first). RANKED on top, then practice / sandbox / stats / settings.
  const FS_SVG = '<svg viewBox="0 0 16 16"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>';
  // player's medal + rank name + rating under RANKED; nothing if ranked data or medal art is missing
  function rankBox() {
    let p = null;
    try { p = IT.Ranked && IT.Ranked.profile ? IT.Ranked.profile() : null; } catch (e) { p = null; }
    if (!p || !IT.Medals || !IT.Ranks) return null;
    const r = IT.Ranks.fromRating(p.rating);
    let cv = null;
    try { cv = IT.Medals.canvas(r.tier, r.stars, 48); } catch (e) { cv = null; }
    return h('div', { class: 'rankbox' },
      cv ? h('div', { class: 'rmed' }, cv) : null,
      h('div', { class: 'rtxt' },
        h('b', { text: r.name + (r.stars ? ' ' + r.stars : '') }),
        h('span', { text: IT.t('title.rating', { n: Math.round(Number(p.rating) || 0) }) })));
  }
  function title() {
    const A = IT.App;
    const fsOk = !!(IT.Input && IT.Input.toggleFullscreen);
    const fs = fsOk ? h('button', {
      class: 'fsbtn', type: 'button', 'aria-label': IT.t('title.fullscreen'), 'data-tip': IT.t('title.fullscreen'),
      onclick: () => IT.Input.toggleFullscreen(),
    }) : null;
    if (fs) fs.innerHTML = FS_SVG;
    return h('div', { class: 'scr title' },
      fs,
      h('div', { class: 'logo' },
        h('div', { class: 'logo-a', text: IT.t('app.title') }),
        h('div', { class: 'logo-b', text: IT.t('app.sub') })),
      h('div', { class: 'orbs-deco' }, icon('quas'), icon('wex'), icon('exort')),
      h('div', { class: 'tag', text: IT.t('app.tag') }),
      h('div', { class: 'menu tmenu' },
        h('button', { class: 'btn grn ranked', type: 'button', 'data-snd': 'start', onclick: () => A.go('ranked'), text: IT.t('title.ranked') }),
        rankBox(),
        btn('title.practice', () => A.go('practice'), 'slt'),
        btn('title.sandbox', () => A.go('sandbox'), 'slt'),
        btn('ui.stats', () => A.go('stats'), 'slt'),
        btn('ui.settings', () => A.go('settings'), 'slt')),
      h('div', { class: 'lang-row' }, langToggle()),
      h('div', { class: 'foot', text: IT.t('title.hint') }));
  }

  // ---- pause
  function pause() {
    const A = IT.App;
    return h('div', { class: 'scr pause' },
      h('div', { class: 'panel narrow' },
        h('h2', { class: 'ph', text: IT.t('ui.paused') }),
        h('div', { class: 'menu' },
          btn('ui.resume', () => A.resume(), 'grn'),
          btn('ui.restart', () => A.restart(), 'slt'),
          btn('ui.loadout', () => A.go('loadout'), 'slt'),
          btn('pause.settings', () => A.pauseSettings(), 'slt'),
          btn('ui.endRun', () => A.endRun(), 'slt'),
          btn('ui.quit', () => A.go('title'), 'slt dim'))));
  }

  // ---- global ESC outside play: one level up (IT.App.back). In play, IT.Input routes ESC to hooks.pause.
  // Listens on window bubble so document handlers run first and their preventDefault() is respected.
  G.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape' || ev.defaultPrevented || ev.repeat) return;
    const t = ev.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;
    const A = IT.App;
    if (!A || A.state === 'play') return;
    ev.preventDefault();
    A.back();
  });

  IT.UI = { h, icon, portrait, initTip, toast, clearToasts, set, push, pop, clear, depth, rebuild, btn, langToggle, panel, title, pause };
})(typeof window !== 'undefined' ? window : globalThis);
