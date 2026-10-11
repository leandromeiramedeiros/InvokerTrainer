// UI button sounds (IT.UISound.play(kind)) + document-level hover/click delegation. Owner: S5.
// kinds: hover (soft tick, throttled) click back start (gold/ranked/[data-snd=start]) error. Routed to the 'ui' bus.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const SFX = G.SFX || IT.SFX;
  const SEL = '.btn, .seg-b, [data-snd], button';
  const KINDS = { hover: 'ui_hover', click: 'ui_click', back: 'ui_back', start: 'ui_start', error: 'ui_error' };
  const R = (a, b) => a + Math.random() * (b - a);

  if (SFX && SFX.define) {
    const T = SFX.T, N = SFX.N, D = SFX.define;
    // soft glassy tick
    D('ui_hover', b => {
      T(b, { type: 'sine', f: 2300, f2: 1900, d: 0.03, g: 0.07, a: 0.002 });
      N(b, { ft: 'highpass', f: 6500, d: 0.012, g: 0.035, q: 0.7 });
    });
    // crisp short click: transient + little pitched body
    D('ui_click', b => {
      N(b, { ft: 'bandpass', f: 3200, d: 0.014, g: 0.12, q: 1.2 });
      T(b, { type: 'triangle', f: 1500, f2: 900, d: 0.045, g: 0.14, a: 0.002 });
      T(b, { type: 'sine', f: 300, f2: 180, d: 0.05, g: 0.1, a: 0.002 });
    });
    // falling two-note, muted
    D('ui_back', b => {
      T(b, { type: 'triangle', f: 880, f2: 840, d: 0.05, g: 0.1, a: 0.002 });
      T(b, { type: 'triangle', f: 587, f2: 520, d: 0.09, g: 0.1, a: 0.002, at: 0.045 });
      N(b, { ft: 'bandpass', f: 1800, d: 0.012, g: 0.06, q: 1 });
    });
    // primary action: low thump + rising open fifth + shimmer
    D('ui_start', b => {
      T(b, { type: 'sine', f: 140, f2: 55, d: 0.3, g: 0.4, a: 0.003 });
      N(b, { ft: 'lowpass', f: 900, f2: 200, d: 0.18, g: 0.2 });
      [220, 330, 440].forEach((f, i) => T(b, { type: 'triangle', f, d: 0.45, g: 0.11, a: 0.012, at: 0.03 + i * 0.04 }));
      T(b, { type: 'sine', f: 880, d: 0.4, g: 0.07, a: 0.01, at: 0.14, fm: 6, fmd: 8 });
      N(b, { ft: 'highpass', f: 6000, f2: 10000, d: 0.3, g: 0.05, a: 0.06, at: 0.08 });
    });
    D('ui_error', b => {
      T(b, { type: 'square', f: 180, f2: 150, d: 0.09, g: 0.1, lp: 900 });
      T(b, { type: 'square', f: 170, f2: 130, d: 0.13, g: 0.1, lp: 800, at: 0.1 });
    });
  }

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
