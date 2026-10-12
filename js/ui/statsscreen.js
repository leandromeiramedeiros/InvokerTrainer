// Lifetime stats: storage ('it2.stats'), screen, JSON export, reset.
// v6 WP6: the screen is the relic collection (tier, progress to the next tier, lifetime value) + ranked runs / best medal / best score.
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
    const { h, btn } = IT.UI, t = IT.t, A = IT.App, R = IT.RELICS;
    const life = Life.load() || {}, rel = life.relics || {}, best = life.bestMedal || null;
    const fmtN = n => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    let medal = null;
    if (best && IT.UI.Splash && IT.UI.Splash.medalCanvas) { medal = IT.UI.Splash.medalCanvas(best.tier, best.stars, 64); medal.className = 'st-medal'; }
    const started = R ? R.LIST.filter(r => rel[r.id] > 0).length : 0;
    const head = h('div', { class: 'st-head' },
      h('div', { class: 'kcard st-best' }, medal, h('div', {}, h('span', { text: t('stats.bestMedal') }), h('b', { text: best ? best.name + (best.stars ? ' ' + best.stars : '') : t('stats.noMedal') }))),
      h('div', { class: 'kcard' }, h('span', { text: t('stats.runs') }), h('b', { text: String(life.runs || 0) })),
      h('div', { class: 'kcard' }, h('span', { text: t('stats.bestScore') }), h('b', { text: fmtN(life.bestScore || 0) })),
      h('div', { class: 'kcard' }, h('span', { text: t('stats.lifeDmg') }), h('b', { text: fmtN(life.damage && life.damage.dealt ? life.damage.dealt.total : 0) })),
      h('div', { class: 'kcard' }, h('span', { text: t('stats.started') }), h('b', { text: started + '/' + (R ? R.LIST.length : 0) })));
    // the client's relic grid: 4 special shields, then 3 / 4 / 3 regular ones (Dota relics), then the trainer relics (js/ui/relics.js collection)
    const grid = h('div', { class: 'st-relics' }, IT.UI.Relics ? IT.UI.Relics.collection(rel) : null);
    let confirm = false;
    const rb = h('button', {
      type: 'button', class: 'btn dim', text: t('ui.reset'),
      onclick: () => {
        if (!confirm) { confirm = true; rb.textContent = t('ui.confirmReset'); rb.classList.add('danger'); return; }
        Life.reset(); A.go('stats');
      },
    });
    return h('div', { class: 'scr statsscr st6' },
      h('div', { class: 'panel wide' }, h('h2', { class: 'ph', text: t('stats.title') }), head,
        h('div', { class: 'st-sub' }, h('h3', { text: t('stats.relics') }), h('span', { class: 'dim', text: t('relics.only') })),
        grid,
        h('div', { class: 'row end' }, rb, btn('ui.export', () => Life.exportJson()), btn('ui.back', () => A.go('title'), 'gold'))));
  }

  IT.UI.Life = Life;
  IT.UI.statsScreen = screen;
})(typeof window !== 'undefined' ? window : globalThis);
