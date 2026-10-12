// Mode screens. Owner: S3.
// Combo Practice difficulty picker: root .scr.diff, one .btn[data-diff=id] (name + .dd description) per difficulty, Back = .btn without data-diff.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  IT.UI = IT.UI || {};

  // Difficulty tier badge (ian / easy / common / hard / bambam): coloured pill with hover text from the diffd.<tier> keys.
  // opts: { tip: override hover text, stars: draw one star per tier step instead of the tier name }
  function tierBadge(id, opts) {
    const { h } = IT.UI, t = IT.t, o = opts || {};
    const tier = IT.DIFFICULTY.get(id), k = 'diffd.' + tier.id;
    const tip = (o.tip ? o.tip + '\n' : '') + (IT.hasT(k) ? t(k) : '');
    return h('span', { class: 'tb ' + tier.id, 'data-tier': tier.id, 'data-tip': tip, text: o.stars ? '\u2605'.repeat(tier.idx + 1) : t('diff.' + tier.id) });
  }

  function picker() {
    const { h, btn } = IT.UI, t = IT.t, A = IT.App;
    return h('div', { class: 'scr diff' },
      h('h2', { class: 'ph', text: t('modes.pickTitle') }),
      h('p', { class: 'fine', text: t('modes.pickSub') }),
      IT.DIFFICULTY.order.map(id => h('button', {
        class: 'btn', type: 'button', 'data-diff': id, 'data-snd': 'start',
        onclick: () => A.start({ mode: 'practice', diff: id }),
      }, h('span', { class: 'dn' }, tierBadge(id, { stars: true }), t('diff.' + id)), h('span', { class: 'dd', text: t('diffd.' + id) }))),
      btn('ui.back', () => A.go('title')));
  }

  IT.UI.tierBadge = tierBadge;
  IT.UI.Modes = { picker, tierBadge };
})(typeof window !== 'undefined' ? window : globalThis);
