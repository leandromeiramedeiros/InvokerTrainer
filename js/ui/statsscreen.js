// Lifetime stats: storage ('it2.stats'), screen, JSON export, reset.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const KEY = 'it2.stats';

  const Life = {
    load() { try { return JSON.parse(G.localStorage.getItem(KEY)) || null; } catch (e) { return null; } },
    save(b) { try { G.localStorage.setItem(KEY, JSON.stringify(b)); } catch (e) { /* ignore */ } },
    add(summary) {
      if (!IT.StatsCollector || !summary) return null;
      const b = IT.StatsCollector.merge(Life.load(), summary);
      Life.save(b); return b;
    },
    reset() { try { G.localStorage.removeItem(KEY); } catch (e) { /* ignore */ } },
    exportJson() {
      const b = Life.load() || (IT.StatsCollector ? IT.StatsCollector.blank() : {});
      const blob = new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'invoker-trainer-stats.json';
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    },
  };

  function screen() {
    const { h, btn } = IT.UI, t = IT.t, A = IT.App;
    const life = Life.load() || (IT.StatsCollector ? IT.StatsCollector.blank() : null);
    const body = life ? IT.UI.statsView(life, [
      h('div', { class: 'kcard big' }, h('span', { text: t('end.score') }), h('b', { text: String(Math.round(life.combos.score || 0)) })),
      h('div', { class: 'kcard' }, h('span', { text: t('end.combos') }), h('b', { text: String(life.combos.done) })),
      h('div', { class: 'kcard' }, h('span', { text: t('stats.sessions') }), h('b', { text: String(life.sessions || 0) })),
      h('div', { class: 'kcard' }, h('span', { text: t('end.fails') }), h('b', { text: String(life.combos.fails) })),
      IT.Ranked && IT.Ranked.profile ? h('div', { class: 'kcard' }, h('span', { text: t('stats.rankedGames') }), h('b', { text: String(IT.Ranked.profile().games) })) : null,
    ]) : h('p', { text: t('end.noData') });

    // best times
    let best = null;
    if (life && life.combos && life.combos.best) {
      const ids = Object.keys(life.combos.best);
      if (ids.length) {
        const rows = ids.map(id => { const c = (IT.Combo && IT.Combo.get ? IT.Combo.get(id) : null) || (IT.SCENARIOS && IT.SCENARIOS.get ? IT.SCENARIOS.get(id) : null); return h('div', { class: 'srow' }, h('span', { text: c && c.name ? (c.name[IT.lang] || c.name.en) : id }), h('b', { text: Math.round(life.combos.best[id] * 100) / 100 + 's' })); });
        best = h('div', { class: 'blk' }, h('h3', { text: t('stats.bestTimes') }), h('div', { class: 'bestgrid' }, rows));
      }
    }
    let confirm = false;
    const rb = h('button', {
      type: 'button', class: 'btn dim', text: t('ui.reset'),
      onclick: () => {
        if (!confirm) { confirm = true; rb.textContent = t('ui.confirmReset'); rb.classList.add('danger'); return; }
        Life.reset(); A.go('stats');
      },
    });
    return h('div', { class: 'scr statsscr' },
      h('div', { class: 'panel wide' }, h('h2', { class: 'ph', text: t('stats.title') }), body, best,
        h('div', { class: 'row end' }, rb, btn('ui.export', () => Life.exportJson()), btn('ui.back', () => A.go('title'), 'gold'))));
  }

  IT.UI.Life = Life;
  IT.UI.statsScreen = screen;
})(typeof window !== 'undefined' ? window : globalThis);
