// v6 #16b UI animation layer (self-contained): a MutationObserver on #screens / #hud / #toasts adds short enter / exit classes
// (css/anim.css holds the keyframes). Never blocks input: exits play on a pointer-events:none clone, nothing delays the real DOM;
// the game canvases and the aim overlay are never touched; prefers-reduced-motion switches everything off (JS + CSS).
//   IT.UI.Anim.countUp(el, from, to, ms)  eased number count-up (returns cancel fn); auto-run for [data-countup="N"] (+ data-countup-dec)
//   IT.UI.Anim.fillBar(el, pct)           sets the fill width; `.bar > i` eases width via CSS (css/anim.css)
// Pure helpers (tested): ease, countValue, stagger, fmtCount, reduced.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  IT.UI = IT.UI || {};
  const SEL = {
    screen: '.screen', panel: '.pnl', toast: '.toast', strip: '.rkp',
    tab: '.tabb,.sc-tab,.shop-tab,.sptab,.seg-b',
    grid: '.sc-grid,.kcards,.sp-tiles,.shop-grid'
  };
  const MS = { screen: 180, exit: 150, panel: 170, panelOut: 130, toast: 160, tab: 140, strip: 200, card: 170, fade: 150 };
  const STAG = { max: 250, step: 35, cap: 16 };   // card stagger: <= 250 ms total, <= 35 ms per card, first 16 cards only
  let force = null;                              // test / settings override of the reduced-motion flag
  let obs = null, panelObs = null;

  // ---------------------------------------------------------------- pure helpers
  const ease = t => { const u = 1 - Math.max(0, Math.min(1, t)); return 1 - u * u * u; };   // ease-out cubic
  const countValue = (from, to, t) => from + (to - from) * ease(t);
  function fmtCount(v, dec) { return dec > 0 ? v.toFixed(dec) : String(Math.round(v)); }
  // delay (ms) of card i of n: linear, capped so the whole stagger fits STAG.max
  function stagger(i, n) {
    n = Math.min(n, STAG.cap); i = Math.min(i, n - 1);
    if (n <= 1 || i <= 0) return 0;
    return Math.round(i * Math.min(STAG.step, STAG.max / (n - 1)));
  }
  function reduced() {
    if (force !== null) return !!force;
    try { return !!(G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  const later = (fn, ms) => (typeof G.setTimeout === 'function' ? G.setTimeout(fn, ms) : fn());
  const is = (el, sel) => !!(el && el.nodeType === 1 && el.matches && el.matches(sel));
  const hasNone = s => /display\s*:\s*none/.test(s || '');

  // ---------------------------------------------------------------- class players
  // (re)start a one-shot animation class; removed again when it is over so nothing lingers
  function play(el, cls, ms, delay) {
    if (!el || !el.classList || reduced()) return false;
    if (el.classList.contains(cls)) { el.classList.remove(cls); void el.offsetWidth; }
    el.classList.add(cls);
    later(() => { if (el.classList) el.classList.remove(cls); }, ms + (delay || 0) + 40);
    return true;
  }
  function staggerGrid(grid) {
    if (reduced() || !grid || !grid.children) return 0;
    const kids = Array.prototype.slice.call(grid.children), n = kids.length;
    kids.forEach((k, i) => {
      if (k.nodeType !== 1) return;
      const d = stagger(i, n);
      if (k.style && k.style.setProperty) k.style.setProperty('--ad', d + 'ms');
      play(k, 'a-card', MS.card, d);
    });
    return n;
  }
  function staggerIn(root) {
    if (is(root, SEL.grid)) staggerGrid(root);
    if (root.querySelectorAll) Array.prototype.forEach.call(root.querySelectorAll(SEL.grid), staggerGrid);
  }
  // exit on a pointer-events:none clone appended after the (already removed / hidden) original; the real DOM is never held back
  function ghost(el, parent, cls, ms) {
    if (reduced() || !el || !el.cloneNode || !parent) return null;
    const g = el.cloneNode(true);
    g.classList.add('a-ghost', cls);
    if (g.style) g.style.display = '';
    if (g.removeAttribute) g.removeAttribute('id');
    if (g.querySelectorAll) Array.prototype.forEach.call(g.querySelectorAll('[id]'), n => n.removeAttribute('id'));
    parent.appendChild(g);
    later(() => { if (g.parentNode) g.parentNode.removeChild(g); }, ms + 60);
    return g;
  }

  // ---------------------------------------------------------------- number count-up / bar fill
  function countUp(el, from, to, ms, dec) {
    if (!el) return () => {};
    const done = () => { el.textContent = fmtCount(to, dec || 0); };
    ms = ms > 0 ? ms : 600;
    if (reduced() || !isFinite(from) || !isFinite(to) || from === to) { done(); return () => {}; }
    const raf = typeof G.requestAnimationFrame === 'function' ? G.requestAnimationFrame.bind(G) : null;
    const now = () => (G.performance && G.performance.now ? G.performance.now() : Date.now());
    const t0 = now(); let stop = false;
    const tick = () => {
      if (stop) return;
      if (el.isConnected === false) { done(); return; }
      const t = (now() - t0) / ms;
      if (t >= 1) { done(); return; }
      el.textContent = fmtCount(countValue(from, to, t), dec || 0);
      raf ? raf(tick) : later(tick, 33);
    };
    el.textContent = fmtCount(from, dec || 0);
    raf ? raf(tick) : later(tick, 33);
    return () => { stop = true; done(); };
  }
  function fillBar(el, pct) {
    const p = Math.max(0, Math.min(100, +pct || 0));
    if (el && el.style) el.style.width = p + '%';
    return p;
  }
  function autoCount(root) {
    if (reduced() || !root || !root.querySelectorAll) return;
    const list = Array.prototype.slice.call(root.querySelectorAll('[data-countup]'));
    if (root.getAttribute && root.getAttribute('data-countup') != null) list.unshift(root);
    list.forEach(el => {
      const to = parseFloat(el.getAttribute('data-countup'));
      if (!isFinite(to) || el.__counted === to) return;
      el.__counted = to;
      countUp(el, 0, to, parseFloat(el.getAttribute('data-countup-ms')) || 600, parseInt(el.getAttribute('data-countup-dec'), 10) || 0);
    });
  }

  // ---------------------------------------------------------------- record handling
  function watchPanel(el) { if (panelObs && el.nodeType === 1) try { panelObs.observe(el, { attributes: true, attributeFilter: ['style'], attributeOldValue: true }); } catch (e) { /* ignore */ } }
  function onStyle(r) {
    const el = r.target, was = hasNone(r.oldValue), now = el.style && el.style.display === 'none';
    if (was === now) return;
    if (is(el, SEL.panel)) { if (was) play(el, 'a-pnl', MS.panel); else ghost(el, el.parentNode, 'a-pnl-out', MS.panelOut); }
    else if (is(el, SEL.screen) && was) play(el, 'a-scr', MS.screen);
  }
  function onClass(r) {
    const el = r.target, old = ' ' + (r.oldValue || '') + ' ', cur = ' ' + (el.className || '') + ' ';
    if (is(el, SEL.tab)) { if (old.indexOf(' on ') < 0 && cur.indexOf(' on ') >= 0) play(el, 'a-tab', MS.tab); }
    else if (is(el, SEL.strip)) { if ((old.indexOf(' play ') >= 0) !== (cur.indexOf(' play ') >= 0)) play(el, 'a-strip', MS.strip); }
  }
  function onAdded(el, r, swap) {
    if (el.nodeType !== 1 || (el.classList && el.classList.contains('a-ghost'))) return;
    const tid = r.target && r.target.id;
    if (tid === 'screens') {
      if (!swap && is(el, SEL.screen)) { play(el, 'a-scr', MS.screen); staggerIn(el); autoCount(el); }
      return;
    }
    if (tid === 'toasts') { if (is(el, SEL.toast)) play(el, 'a-toast', MS.toast); return; }
    if (is(el, SEL.panel)) { watchPanel(el); return; }
    if (swap) return;
    if (is(r.target, SEL.grid) && !r.__g) { staggerGrid(r.target); r.__g = 1; }
    autoCount(el);
  }
  // records: MutationRecord-like { type, target, addedNodes, removedNodes, attributeName, oldValue }
  function process(records) {
    if (reduced()) return;
    for (const r of records || []) {
      try {
        if (r.type === 'childList') {
          const swap = r.addedNodes.length > 0 && r.removedNodes.length > 0;   // replaceChild (language rebuild): no flicker
          for (const el of r.addedNodes) onAdded(el, r, swap);
          if (!swap && r.target && r.target.id === 'screens') {
            for (const el of r.removedNodes) if (is(el, SEL.screen) && !el.classList.contains('a-ghost')) ghost(el, r.target, 'a-scr-out', MS.exit);
          }
        } else if (r.type === 'attributes') {
          const a = r.attributeName;
          if (a === 'style') onStyle(r);
          else if (a === 'class') onClass(r);
          else if (a === 'data-tab') { const ps = r.target.querySelectorAll ? r.target.querySelectorAll('.pane') : []; Array.prototype.forEach.call(ps, p => play(p, 'a-fade', MS.fade)); }
          else if (a === 'data-countup') autoCount(r.target);
        }
      } catch (e) { /* never let the animation layer break the UI */ }
    }
  }

  function init(doc) {
    doc = doc || G.document;
    if (!doc || typeof G.MutationObserver !== 'function' || obs) return false;
    const screens = doc.getElementById('screens'), hud = doc.getElementById('hud'), toasts = doc.getElementById('toasts');
    obs = new G.MutationObserver(process);
    panelObs = new G.MutationObserver(process);
    if (screens) obs.observe(screens, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['style', 'class', 'data-tab', 'data-countup'] });
    // #hud updates every frame: only structure + class flips (panels get their own style observer when mounted), never style / characterData
    if (hud) {
      obs.observe(hud, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class'] });
      Array.prototype.forEach.call(hud.querySelectorAll('.pnl'), watchPanel);
    }
    if (toasts) obs.observe(toasts, { childList: true });
    return true;
  }

  IT.UI.Anim = { init, process, play, ghost, staggerGrid, countUp, fillBar, autoCount, ease, countValue, fmtCount, stagger, reduced, MS, SEL, STAG,
    setReduced: v => { force = v === null || v === undefined ? null : !!v; } };
  if (G.document) {
    const go = () => init(G.document);
    if (G.document.readyState === 'loading') G.document.addEventListener('DOMContentLoaded', go); else go();
  }
})(typeof window !== 'undefined' ? window : globalThis);
