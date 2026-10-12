// UI button sounds (IT.UISound.play(kind)) + document-level hover/click delegation. Owner: S5.
// kinds: hover (soft tick, throttled) click back start (gold/ranked/[data-snd=start]) error. Routed to the 'ui' bus.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const SFX = G.SFX || IT.SFX;
  const SEL = '.btn, .seg-b, [data-snd], button';
  const KINDS = { hover: 'ui_hover', click: 'ui_click', back: 'ui_back', start: 'ui_start', error: 'ui_error', level: 'ui_level' };
  const R = (a, b) => a + Math.random() * (b - a);

  // ui_* voices are defined in js/sfxvoices.js

  let lastAt = 0;
  const UI = {
    play(kind) {
      const id = KINDS[kind];
      if (!id || !SFX || !SFX.playEx) return false;
      try {
        const s = IT.Settings && IT.Settings.get && IT.Settings.get();
        if (s && s.sound === false) return false;
      } catch (e) { /* ignore */ }
      const now = performance.now();
      if (kind === 'hover' && now - lastAt < 45) return false;
      if (kind !== 'hover' && now - lastAt < 12) return false;
      lastAt = now;
      SFX.playEx(id, { bus: 'ui', vol: kind === 'hover' ? R(0.8, 1) : 1 });
      return true;
    },
    kindFor(el) {
      const d = el.getAttribute && el.getAttribute('data-snd');
      if (d && KINDS[d]) return d;
      if (el.classList && (el.classList.contains('gold') || el.classList.contains('ranked'))) return 'start';
      return 'click';
    },
  };
  IT.UISound = UI;

  // delegation (capture so stopPropagation in handlers can't swallow it)
  if (G.document) {
    const doc = G.document;
    const find = t => (t && t.closest ? t.closest(SEL) : null);
    const quiet = el => el.getAttribute('data-snd') === 'none';
    doc.addEventListener('mouseover', ev => {
      const el = find(ev.target);
      if (!el || quiet(el) || el.disabled) return;
      if (ev.relatedTarget && el.contains(ev.relatedTarget)) return; // moved within same control
      UI.play('hover');
    }, true);
    doc.addEventListener('click', ev => {
      const el = find(ev.target);
      if (!el || quiet(el)) return;
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') { UI.play('error'); return; }
      UI.play(UI.kindFor(el));
    }, true);
  }
})(typeof window !== 'undefined' ? window : globalThis);
