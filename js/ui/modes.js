// Difficulty tier badge helper (IT.UI.tierBadge). Owner: S3.
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

  IT.UI.tierBadge = tierBadge;
})(typeof window !== 'undefined' ? window : globalThis);
