// End screen + shared stats view (also used by the lifetime stats screen).
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const f1 = n => (n == null || !isFinite(n) ? '-' : String(Math.round(n * 10) / 10));
  const pct = n => (n == null ? '-' : Math.round(n * 100) + '%');
  const mmss = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  // S: stats summary or lifetime blob
  function statsView(S, head) {
    const { h, icon } = IT.UI, t = IT.t;
    const card = (a, b) => h('div', { class: 'kcard' }, h('span', { text: a }), h('b', { text: b }));
    const out = h('div', { class: 'sview' });
    if (head) out.appendChild(h('div', { class: 'kcards' }, head));
    out.appendChild(h('div', { class: 'kcards' },
      card(t('end.time'), mmss(S.time || 0)), card(t('end.apm'), f1(S.apm)),
      card(t('end.invAvg'), f1(S.invoke && S.invoke.avg) + 's'), card(t('end.invBest'), S.invoke && S.invoke.best != null ? f1(S.invoke.best) + 's' : '-'),
      card(t('end.cc'), pct(S.cc && S.cc.ratio)), card(t('end.blind'), String(S.blindHits || 0)),
      card(t('end.prevented'), String(Math.round(S.damage ? S.damage.prevented.total : 0)))));

    const ids = Object.keys(S.spells || {}).sort((a, b) => S.spells[b].casts - S.spells[a].casts);
    const tb = h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', { text: '' }), h('th', { text: t('end.casts') }), h('th', { text: t('end.hits') }), h('th', { text: t('end.misses') }), h('th', { text: t('end.acc') }))));
    const tbody = h('tbody');
    for (const id of ids) {
      const s = S.spells[id];
      tbody.appendChild(h('tr', {}, h('td', { class: 'nm' }, IT.Abilities && IT.Abilities.get(id) && IT.GAME.SPELL_ORBS[id] ? icon(id, 'mini') : null, h('span', { text: IT.hasT('spell.' + id) ? t('spell.' + id) : t('item.' + id) })),
        h('td', { text: s.casts }), h('td', { text: s.hits }), h('td', { text: s.misses }), h('td', { class: 'acc', text: pct(s.accuracy) })));
    }
    tb.appendChild(tbody);
    out.appendChild(h('div', { class: 'blk' }, h('h3', { text: t('end.accuracy') }), ids.length ? tb : h('p', { class: 'fine', text: t('end.noData') })));

    const types = ['physical', 'magical', 'pure'];
    const dm = S.damage || { dealt: { total: 0, byType: {} }, taken: { total: 0, byType: {} } };
    const dt = h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', { text: '' }), types.map(k => h('th', { text: t('dmg.' + k) })), h('th', { text: 'Σ' }))));
    const row = (lab, o) => h('tr', {}, h('td', { class: 'nm', text: lab }), types.map(k => h('td', { text: String(Math.round((o.byType && o.byType[k]) || 0)) })), h('td', { class: 'acc', text: String(Math.round(o.total || 0)) }));
    dt.appendChild(h('tbody', {}, row(t('end.dealt'), dm.dealt), row(t('end.taken'), dm.taken), row(t('end.prevented'), dm.prevented || { byType: {}, total: 0 })));
    out.appendChild(h('div', { class: 'blk' }, h('h3', { text: t('end.dmgType') }), dt));

    out.appendChild(h('div', { class: 'blk' }, h('h3', { text: t('end.bolts') }),
      h('div', { class: 'kcards' }, card(t('end.boltsCountered'), String(S.boltsCountered || 0)), card(t('end.boltsBlocked'), String(S.boltsBlocked || 0)),
        card(t('end.boltsHit'), String(S.boltsHit || 0)), card(t('end.blinks'), String(S.blinks || 0)), card(t('end.blinksPrev'), String(S.blinksPrevented || 0)))));
    return out;
  }

  function end(info) {
    const { h, btn } = IT.UI, t = IT.t, A = IT.App;
    const S = info.stats, m = info.mode || {};
    const head = [
      h('div', { class: 'kcard big' }, h('span', { text: t('end.score') }), h('b', { text: String(Math.round(m.score != null ? m.score : (S.combos ? S.combos.score : 0))) })),
      h('div', { class: 'kcard' }, h('span', { text: t('end.combos') }), h('b', { text: String(m.combos != null ? m.combos : (S.combos ? S.combos.done : 0)) })),
      h('div', { class: 'kcard' }, h('span', { text: t('end.bestStreak') }), h('b', { text: String(m.bestStreak || 0) })),
      h('div', { class: 'kcard' }, h('span', { text: t('end.fails') }), h('b', { text: String(m.fails != null ? m.fails : (S.combos ? S.combos.fails : 0)) })),
    ];
    return h('div', { class: 'scr endscr' },
      h('div', { class: 'panel wide' },
        h('h2', { class: 'ph', text: t('end.title') + ' - ' + t('mode.' + (m.mode || 'sandbox')) }),
        statsView(S, head),
        h('p', { class: 'fine ok', text: t('end.saved') }),
        h('div', { class: 'row end' },
          btn('ui.title', () => A.go('title'), 'dim'), btn('ui.loadout', () => A.go('loadout')), btn('ui.again', () => A.go('again'), 'gold'))));
  }

  IT.UI.statsView = statsView;
  IT.UI.endScreen = end;
})(typeof window !== 'undefined' ? window : globalThis);
