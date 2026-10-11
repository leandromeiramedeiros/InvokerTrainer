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

  // ranked result: medal next to the new rank, rating before -> after, delta, rank up / down message (+ stinger once)
  function rankBlock(info, m) {
    const { h } = IT.UI, t = IT.t, rk = m.rank;
    if (!rk) return h('p', { class: 'fine', text: t('end.noRating') });
    const a = rk.after.rank, nm = a.name + (a.stars ? ' ' + a.stars : '');
    let cv = null;
    try { cv = IT.Medals ? IT.Medals.canvas(a.tier, a.stars, 72) : null; } catch (e) { cv = null; }
    const msg = rk.up ? t('end.rankUp', { rank: nm }) : rk.down ? t('end.rankDown', { rank: nm }) : t('end.rankSame', { rank: nm });
    if (!info.sting) {
      info.sting = true;
      try { if (IT.Music && (rk.up || rk.down)) IT.Music.stinger(rk.up ? 'up' : 'down'); } catch (e) { /* audio optional */ }
    }
    const col = rk.delta > 0 ? '#7bd88f' : rk.delta < 0 ? '#ff7a7a' : '#cfd6dc';
    return h('div', { class: 'rkres', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1em', margin: '.5em 0 .8em' } },
      cv ? h('div', { class: 'rmed' }, cv) : null,
      h('div', { style: { textAlign: 'left' } },
        h('div', { text: t('end.rating') + ' ' + Math.round(rk.before.rating) + ' > ' + Math.round(rk.after.rating) }),
        h('b', { text: (rk.delta > 0 ? '+' : '') + rk.delta, style: { color: col, fontSize: '1.6em' } }),
        h('div', { class: rk.up ? 'ok' : '', text: msg, style: { fontWeight: 'bold' } })));
  }

  function end(info) {
    const { h, btn } = IT.UI, t = IT.t, A = IT.App;
    const S = info.stats, m = info.mode || {};
    const scn = m.mode === 'ranked' || m.mode === 'practice';
    const head = [
      h('div', { class: 'kcard big' }, h('span', { text: t(m.mode === 'ranked' ? 'end.score' : 'end.solved') }), h('b', { text: String(m.mode === 'ranked' ? Math.round(m.score || 0) : scn ? (m.solved || 0) : Math.round(m.score != null ? m.score : (S.combos ? S.combos.score : 0))) })),
      h('div', { class: 'kcard' }, h('span', { text: t('end.combos') }), h('b', { text: String(m.combos != null ? m.combos : (S.combos ? S.combos.done : 0)) })),
      h('div', { class: 'kcard' }, h('span', { text: t('end.bestStreak') }), h('b', { text: String(m.bestStreak || 0) })),
      h('div', { class: 'kcard' }, h('span', { text: t('end.fails') }), h('b', { text: String(m.fails != null ? m.fails : (S.combos ? S.combos.fails : 0)) })),
    ];
    return h('div', { class: 'scr endscr' },
      h('div', { class: 'panel wide' },
        h('h2', { class: 'ph', text: t('end.title') + ' - ' + t('mode.' + (m.mode || 'sandbox')) }),
        m.mode === 'ranked' ? rankBlock(info, m) : null,
        m.reason && IT.hasT('end.reason.' + m.reason) && scn ? h('p', { class: 'fine', text: t('end.reason.' + m.reason) }) : null,
        statsView(S, head),
        h('p', { class: 'fine ok', text: t('end.saved') }),
        h('div', { class: 'row end' },
          btn('ui.title', () => A.go('title'), 'dim'), btn('ui.loadout', () => A.go('loadout')), btn('ui.again', () => A.go('again'), 'gold'))));
  }

  IT.UI.statsView = statsView;
  IT.UI.endScreen = end;
})(typeof window !== 'undefined' ? window : globalThis);
