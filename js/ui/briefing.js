// v6 item 13: scenario briefing overlay for the 12 s intro (ranked + practice scenarios with a camera tour; Free Play has none).
// A DOM card on the left of the stage (clear of the hero HUD and of the toured spots, which main.js puts right of centre): title,
// difficulty + hero LV, objective, WIN (green icon) and LOSE (red icon) lines with pulsing key words, step chips (icon + hotkeys),
// countdown number + hint. Staged CSS reveal; when the round starts it drops away fast into the in-play strip (hud.js).
// body.briefing hides hud.js's countdown panel while the card shows. Reads IT.Ranked.hud(w) + w.ranked.intro; writes no game state.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const doc = G.document;
  const OUT_MS = 320;
  const ORBN = { Q: 'quas', W: 'wex', E: 'exort' };
  let el = null, key = null, num = null, lastN = null, outT = 0, on = false;

  const t = (k, o) => (IT.t ? IT.t(k, o) : k);
  const has = k => !!(IT.hasT && IT.hasT(k));
  const loc = v => (v == null ? '' : typeof v === 'object' ? v[IT.lang] || v.en || '' : String(v));
  const nm = id => (has('spell.' + id) ? t('spell.' + id) : has('item.' + id) ? t('item.' + id) : String(id));
  const S = () => IT.Settings;
  const keyLab = a => S().label(S().keyOf(a));

  // pixel icons (7 x 7): a green check, a red cross
  const PIX = { win: ['......#', '.....##', '#...##.', '##.##..', '.###...', '..#....', '.......'], lose: ['#.....#', '##...##', '.##.##.', '..###..', '.##.##.', '##...##', '#.....#'] };
  function pix(kind) {
    const ns = 'http://www.w3.org/2000/svg', s = doc.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 7 7'); s.setAttribute('shape-rendering', 'crispEdges'); s.setAttribute('class', 'bf-ico ' + kind);
    PIX[kind].forEach((row, y) => row.split('').forEach((c, x) => {
      if (c !== '#') return;
      const r = doc.createElementNS(ns, 'rect');
      r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', 1); r.setAttribute('height', 1);
      s.appendChild(r);
    }));
    return s;
  }

  // text -> nodes, every spell / item name (and each `extra` phrase) wrapped in <b class="pulse">
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function emph(text, extra) {
    const GM = IT.GAME || {}, ids = Object.keys(GM.SPELL_ORBS || {}).concat(Object.keys(GM.ITEM_DOTA || {}));
    const words = ids.map(nm).concat(extra || []).filter(w => w && w.length > 2).sort((a, b) => b.length - a.length);
    const out = [];
    if (!words.length) { out.push(doc.createTextNode(text)); return out; }
    const re = new RegExp('(' + words.map(esc).join('|') + ')', 'gi');
    text.split(re).forEach((p, i) => { if (!p) return; out.push(i % 2 ? IT.UI.h('b', { class: 'pulse', text: p }) : doc.createTextNode(p)); });
    return out;
  }

  // one chip per step: pixel icon + the bound keys (spell: the recipe in orb keys when hints are on, legacy: its key; item: its slot key)
  function chips(sc, hero, hints) {
    const { h, icon } = IT.UI, legacy = S().data && S().data.scheme === 'legacy';
    const acts = IT.HudSteps.derive(sc).filter((a, i, l) => !(i && l[i - 1].k === a.k && l[i - 1].id === a.id)).slice(0, 7);
    const KI = { attack: 'ui_atk', move: 'ui_move', stop: 'ui_stop', hold: 'ui_hold', pos: 'ui_pos' };
    const box = h('div', { class: 'bf-steps' });
    acts.forEach((a, i) => {
      if (i) box.appendChild(h('i', { class: 'bf-ar' }));
      let k = null, lab = a.k === 'spell' || a.k === 'item' ? nm(a.id) : has('f1.' + a.k) ? t('f1.' + a.k) : a.k;
      if (a.k === 'spell') {
        const rec = (IT.GAME.SPELL_ORBS || {})[a.id] || '';
        if (legacy && S().data.keys.legacy) k = h('span', { class: 'bf-k' }, S().label(S().data.keys.legacy[a.id]));
        else if (hints && rec) k = h('span', { class: 'bf-k rec' }, rec.split('').map(c => h('i', { class: 'o ' + ORBN[c], text: keyLab('orb' + c) })), h('i', { class: 'o r', text: keyLab('invoke') }));
      } else if (a.k === 'item') {
        const j = hero ? hero.items.findIndex(x => x && x.id === a.id) : -1;
        if (j >= 0) k = h('span', { class: 'bf-k' }, keyLab('item' + (j + 1)));
      } else if (a.k === 'attack' || a.k === 'stop' || a.k === 'hold') k = h('span', { class: 'bf-k' }, keyLab(a.k));
      const ic = a.k === 'spell' || a.k === 'item' ? icon(a.id) : icon(KI[a.k] || 'ui_pos');
      box.appendChild(h('div', { class: 'bf-chip ' + a.k, style: { '--i': i } }, ic, k, h('span', { class: 'bf-cn', text: lab })));
    });
    return acts.length ? box : null;
  }

  function build(w, rk) {
    const { h } = IT.UI, sc = IT.SCENARIOS && IT.SCENARIOS.get ? IT.SCENARIOS.get(rk.id) : null, HS = IT.HudSteps;
    const lv = HS && HS.heroLv ? HS.heroLv(rk) : '';
    const hints = !!(rk.hints && S().get().hints);
    const win = sc && sc.win ? loc(sc.win) : loc(rk.objective);
    const gen = HS.loseKeys(sc, rk.timeLeft != null).filter(k => !(sc && sc.lose && k === 'method') && has('f1.lose.' + k)).map(k => t('f1.lose.' + k));
    const lose = (sc && sc.lose ? [loc(sc.lose)] : []).concat(gen).filter(Boolean).join(', ');
    const meta = [rk.level ? t('hud.rkLevel', { n: rk.level }) : '', loc(rk.mapName), rk.twistName ? t('hud.rkTwist') + ' ' + loc(rk.twistName) : ''].filter(Boolean).join('  |  ');
    num = h('div', { class: 'bf-num' });
    lastN = null;
    const card = h('div', { class: 'bf-card' },
      h('div', { class: 'bf-top' }, num,
        h('div', { class: 'bf-head' },
          h('div', { class: 'bf-title', text: loc(rk.scenario) }),
          h('div', { class: 'bf-meta' }, h('span', { class: 'bf-diff d-' + rk.diff, text: has('dtier.' + rk.diff) ? t('dtier.' + rk.diff) : rk.diff }), lv ? h('span', { class: 'bf-lv', text: lv }) : null, meta ? h('span', { text: meta }) : null))),
      rk.objective && loc(rk.objective) !== win ? h('div', { class: 'bf-obj', text: loc(rk.objective) }) : null,
      win ? h('div', { class: 'bf-row bf-win' }, pix('win'), h('span', null, h('em', { text: t('f1.win') + ' ' }), emph(win))) : null,
      lose ? h('div', { class: 'bf-row bf-lose' }, pix('lose'), h('span', null, h('em', { text: t('f1.lose') + ' ' }), emph(lose, gen))) : null,
      chips(sc, w.hero, hints),
      h('div', { class: 'bf-hint', text: has('rk.countdown.hint') ? t('rk.countdown.hint') : t('rk.countdown.hint.fb') }));
    el.textContent = '';
    el.appendChild(card);
  }

  function mount() {
    if (el || !doc) return el;
    const st = doc.getElementById('stage'); if (!st) return null;
    el = IT.UI.h('div', { id: 'brief', class: 'brief' });
    st.appendChild(el);
    return el;
  }

  function show(v) {
    if (on === v) return;
    on = v;
    doc.body.classList.toggle('briefing', v);
  }

  // per frame (main.js). frozen = a menu / end screen is up (the card stays as it is)
  function update(w, dt, frozen) {
    if (!doc || !IT.UI || !IT.Ranked) return;
    const run = w && w.ranked, rk = run && IT.Ranked.hud ? IT.Ranked.hud(w) : null;
    const active = !!(rk && run.intro && rk.phase === 'countdown');
    if (!mount()) return;
    if (active) {
      const k = run.intro;
      if (key !== k) { key = k; build(w, rk); el.className = 'brief'; void el.offsetWidth; el.className = 'brief on'; outT = 0; }
      else if (el.classList.contains('out')) el.className = 'brief on';
      const n = String(Math.max(1, Math.ceil(rk.countdown || 0)));
      if (n !== lastN) { lastN = n; num.textContent = n; num.classList.remove('tick'); void num.offsetWidth; num.classList.add('tick'); }
      show(true);
      return;
    }
    if (on || (el.classList.contains('on') && !el.classList.contains('out'))) {   // the round started: drop away into the in-play strip
      show(false);
      if (el.classList.contains('on')) { el.classList.add('out'); outT = OUT_MS / 1000; }
    }
    if (outT > 0 && !frozen) { outT -= dt; if (outT <= 0) { el.className = 'brief'; key = null; } }
  }

  function hide() { if (el) { el.className = 'brief'; el.textContent = ''; } key = null; outT = 0; show(false); }

  IT.Briefing = { update, hide, emph };
})(typeof window !== 'undefined' ? window : globalThis);
