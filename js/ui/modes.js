// Mode screens. Owner: S3.
// Combo Practice difficulty picker: root .scr.diff, one .btn[data-diff=id] (name + .dd description) per difficulty, Back = .btn without data-diff.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  IT.UI = IT.UI || {};

  function picker() {
    const { h, btn } = IT.UI, t = IT.t, A = IT.App;
    return h('div', { class: 'scr diff' },
      h('h2', { class: 'ph', text: t('modes.pickTitle') }),
      h('p', { class: 'fine', text: t('modes.pickSub') }),
      IT.DIFFICULTY.order.map(id => h('button', {
        class: 'btn', type: 'button', 'data-diff': id, 'data-snd': 'start',
        onclick: () => A.start({ mode: 'practice', diff: id }),
      }, t('diff.' + id), h('span', { class: 'dd', text: t('diffd.' + id) }))),
      btn('ui.back', () => A.go('title')));
  }

  IT.UI.Modes = { picker };
})(typeof window !== 'undefined' ? window : globalThis);
