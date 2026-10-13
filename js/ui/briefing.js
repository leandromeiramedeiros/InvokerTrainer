// v6 item 13 + 45 + 66: scenario briefing for the 12 s intro (ranked + practice scenarios with a camera tour; Free Play has none).
// Item 66, BIG with IMPACT, ONE element centre-stage at a time: the world is dimmed + blurred (an overlay with backdrop-filter), then the title SLAMS in
// (scale 3 -> 1, screen shake, flash, sting), then VICTORY (green), DEFEAT (red), then every combo step punches in as a big icon (lighter sting). After its
// stage each element FLIES / SHRINKS to its final slot in the HUD's countdown panel (rects read from #hud .rkp: .rkhd / .rkwin / .rklose / .rkcombo .rkc;
// fallback: top centre) so the eye follows it. Nothing else animates meanwhile (the camera is frozen: the pan starts after the text phase). When the
// text phase ends the dim lifts and the landed tokens cross-fade into the real panel. Timeline = run.intro.text (js/sim/ranked.js textPlan, intro clock
// run.intro.t). Any action (the intro is cancelled, phase leaves 'countdown') drops everything at once; the camera stays where it is.
// Reads IT.Ranked.hud(w) + w.ranked.intro; writes no game state. body.briefing = overlay up; body.bf-text = HUD panel hidden while tokens fly.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const doc = G.document;
  const ORBN = { Q: 'quas', W: 'wex', E: 'exort' };
  const FIN_S = 0.25;      // the dim lifts + tokens cross-fade into the HUD this long before the text phase ends
  const FIT_W = 0.86, FIT_H = 0.5;   // a staged element fills at most this share of the stage width / height
  let el = null, lay = null, key = null, on = false;
  let toks = null, plan = null, fin = false, reduced = false;   // toks = { title, win, lose, step: [] } nodes; plan[j] = last state of text block j

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

  // one big token per step: icon + the bound keys (spell: the recipe in orb keys when hints are on, legacy: its key; item: its slot key) + name
  function stepToks(sc, hero, hints) {
    const { h, icon } = IT.UI, legacy = S().data && S().data.scheme === 'legacy';
    const acts = IT.HudSteps.derive(sc).filter((a, i, l) => !(i && l[i - 1].k === a.k && l[i - 1].id === a.id)).slice(0, 7);
    const KI = { attack: 'ui_atk', move: 'ui_move', stop: 'ui_stop', hold: 'ui_hold', pos: 'ui_pos' };
    return acts.map(a => {
      let k = null; const lab = a.k === 'spell' || a.k === 'item' ? nm(a.id) : has('f1.' + a.k) ? t('f1.' + a.k) : a.k;
      if (a.k === 'spell') {
        const rec = (IT.GAME.SPELL_ORBS || {})[a.id] || '';
        if (legacy && S().data.keys.legacy) k = h('span', { class: 'bf-k' }, S().label(S().data.keys.legacy[a.id]));
        else if (hints && rec) k = h('span', { class: 'bf-k rec' }, rec.split('').map(c => h('i', { class: 'o ' + ORBN[c], text: keyLab('orb' + c) })), h('i', { class: 'o r', text: keyLab('invoke') }));
      } else if (a.k === 'item') {
        const j = hero ? hero.items.findIndex(x => x && x.id === a.id) : -1;
        if (j >= 0) k = h('span', { class: 'bf-k' }, keyLab('item' + (j + 1)));
      } else if (a.k === 'attack' || a.k === 'stop' || a.k === 'hold') k = h('span', { class: 'bf-k' }, keyLab(a.k));
      const ic = a.k === 'spell' || a.k === 'item' ? icon(a.id) : icon(KI[a.k] || 'ui_pos');
      return h('div', { class: 'bf-t p bf-chip ' + a.k }, ic, k, h('span', { class: 'bf-cn', text: lab }));
    });
  }

  // the big words: VICTORY / DEFEAT (own strings, this file owns the intro; falls back to the HUD's Win: / Lose: label)
  const BIG = { en: { win: 'Victory', lose: 'Defeat' }, pt: { win: 'Vitória', lose: 'Derrota' } };
  const bigWord = k => (BIG[IT.lang] || BIG.en)[k] || t('f1.' + k).replace(/:[ ]*$/, '');

  function build(w, rk) {
    const { h } = IT.UI, sc = IT.SCENARIOS && IT.SCENARIOS.get ? IT.SCENARIOS.get(rk.id) : null, HS = IT.HudSteps;
    const lv = HS && HS.heroLv ? HS.heroLv(rk) : '';
    const hints = !!(rk.hints && S().get().hints);
    const win = sc && sc.win ? loc(sc.win) : loc(rk.objective);
    const gen = HS.loseKeys(sc, rk.timeLeft != null).filter(k => !(sc && sc.lose && k === 'method') && has('f1.lose.' + k)).map(k => t('f1.lose.' + k));
    const lose = (sc && sc.lose ? [loc(sc.lose)] : []).concat(gen).filter(Boolean).join(', ');
    const meta = [rk.level ? t('hud.rkLevel', { n: rk.level }) : '', loc(rk.mapName), rk.twistName ? t('hud.rkTwist') + ' ' + loc(rk.twistName) : ''].filter(Boolean).join('  |  ');
    toks = {
      title: h('div', { class: 'bf-t p bf-tt' }, h('div', { class: 'bf-title', text: loc(rk.scenario) }),
        h('div', { class: 'bf-meta' }, h('span', { class: 'bf-diff d-' + rk.diff, text: has('dtier.' + rk.diff) ? t('dtier.' + rk.diff) : rk.diff }), lv ? h('span', { class: 'bf-lv', text: lv }) : null, meta ? h('span', { text: meta }) : null)),
      win: win ? h('div', { class: 'bf-t p bf-win' }, h('div', { class: 'bf-big' }, pix('win'), h('em', { text: bigWord('win') })), h('div', { class: 'bf-line' }, emph(win))) : null,
      lose: lose ? h('div', { class: 'bf-t p bf-lose' }, h('div', { class: 'bf-big' }, pix('lose'), h('em', { text: bigWord('lose') })), h('div', { class: 'bf-line' }, emph(lose, gen))) : null,
      step: stepToks(sc, w.hero, hints),
    };
    plan = null; fin = false;
    reduced = !!(G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches);
    el.textContent = '';
    lay = h('div', { class: 'bf-lay' }, toks.title, toks.win, toks.lose, toks.step);
    el.appendChild(h('div', { class: 'bf-dim' })); el.appendChild(h('div', { class: 'bf-flash' })); el.appendChild(lay);
    doc.body.classList.add('bf-text');
  }

  // ---- geometry: a token is positioned by translate(centre - size / 2) scale(s) about its own centre
  const xf = (cx, cy, w, h, s) => 'translate(' + (cx - w / 2).toFixed(1) + 'px,' + (cy - h / 2).toFixed(1) + 'px) scale(' + s.toFixed(4) + ')';
  function stageXf(tok) {
    const W = el.offsetWidth || 1, H = el.offsetHeight || 1, w = tok.offsetWidth || 1, h = tok.offsetHeight || 1;
    const s0 = Math.min(1, FIT_W * W / w, FIT_H * H / h);
    return { w, h, s0, cx: W / 2, cy: H * 0.46 };
  }
  // the final slot of a block, relative to the overlay: the matching element of the HUD's countdown panel (hidden, but laid out); fallback top centre
  function slotRect(id, i) {
    const B = el.getBoundingClientRect(), q = s => Array.from(doc.querySelectorAll('#hud .rkp ' + s));
    let n = null;
    if (id === 'title') n = q('.rkhd')[0] || q('.rkname')[0];
    else if (id === 'win') n = q('.rkwin')[0];
    else if (id === 'lose') n = q('.rklose')[0];
    else { const c = q('.rkcombo .rkc'); n = c[Math.min(i, c.length - 1)] || q('.rkcombo')[0]; }
    const r = n && n.getBoundingClientRect ? n.getBoundingClientRect() : null;
    if (r && r.width > 2 && r.height > 2) return { cx: r.left - B.left + r.width / 2, cy: r.top - B.top + r.height / 2, w: r.width, h: r.height };
    const W = B.width || el.offsetWidth, H = B.height || el.offsetHeight, sz = 0.06 * H;
    return id === 'step' ? { cx: W * 0.5 + (i - 3) * sz * 1.3, cy: H * 0.085, w: sz, h: sz } : { cx: W * 0.5, cy: H * 0.05 + (id === 'title' ? 0 : id === 'win' ? 0.05 * H : 0.09 * H), w: 0.4 * W, h: 0.04 * H };
  }

  // ---- impact: flash, shake, sting (all off the sim; a reduced-motion player gets only the fades)
  function flash(col, a, dur) {
    const f = el && el.querySelector('.bf-flash'); if (!f || reduced || !f.animate) return;
    f.style.background = col;
    try { f.animate([{ opacity: a }, { opacity: 0 }], { duration: dur * 1000, easing: 'ease-out' }); } catch (e) { /* optional */ }
  }
  function impact(id, shake, snd, vol) {
    if (!reduced && shake && IT.Briefing && IT.Briefing.onShake) IT.Briefing.onShake(shake, 0.32);
    if (IT.Sfx && IT.Sfx.sting) IT.Sfx.sting(snd, vol);
  }

  function enter(b) {
    const tok = tokOf(b); if (!tok) return;
    const g = stageXf(tok);
    tok.style.transition = 'none'; tok.style.transform = xf(g.cx, g.cy, g.w, g.h, g.s0);
    tok.classList.remove('p'); tok.classList.add('on'); tok._g = g;
    const heavy = b.id === 'title', big = b.id !== 'step', from = heavy ? 3 : big ? 2.2 : 1.9, ms = heavy ? 420 : big ? 340 : 240;
    if (!reduced && tok.animate) {
      try {
        tok.animate([
          { transform: xf(g.cx, g.cy, g.w, g.h, g.s0 * from), opacity: 0, filter: 'brightness(3)', offset: 0 },
          { transform: xf(g.cx, g.cy, g.w, g.h, g.s0 * 0.93), opacity: 1, filter: 'brightness(1.8)', offset: 0.5 },
          { transform: xf(g.cx, g.cy, g.w, g.h, g.s0 * 1.03), filter: 'brightness(1.3)', offset: 0.75 },
          { transform: xf(g.cx, g.cy, g.w, g.h, g.s0), opacity: 1, filter: 'none', offset: 1 }], { duration: ms, easing: 'cubic-bezier(.2,.9,.3,1)' });
      } catch (e) { /* optional */ }
    }
    if (b.id === 'title') { flash('#ffffff', 0.7, 0.4); impact(b.id, 5, 'introSlam', 1); }
    else if (b.id === 'win') { flash('#46e08a', 0.4, 0.4); impact(b.id, 2.5, 'introWin', 0.9); }
    else if (b.id === 'lose') { flash('#ff3b4e', 0.45, 0.4); impact(b.id, 3, 'introLose', 0.9); }
    else impact(b.id, 0, 'introPunch', 0.7);
  }
  function fly(b, snap) {
    const tok = tokOf(b); if (!tok) return;
    if (!tok._g) { tok.classList.remove('p'); tok.classList.add('on'); tok._g = stageXf(tok); }
    if (tok.getAnimations) tok.getAnimations().forEach(a => a.cancel());
    const g = tok._g, r = slotRect(b.id, b.i), s = Math.max(0.04, Math.min(g.s0, r.w / g.w, r.h / g.h));
    tok.style.transition = snap ? 'none' : 'transform ' + (reduced ? 0.12 : Math.max(0.1, b.fly)).toFixed(3) + 's cubic-bezier(.55,0,.2,1)';
    tok.style.transform = xf(r.cx, r.cy, g.w, g.h, s);
    if (!snap && !reduced && IT.Sfx && IT.Sfx.sting && b.id !== 'step') IT.Sfx.sting('introWhoosh', 0.5);
  }
  function tokOf(b) { return b.id === 'step' ? toks.step[b.i] : toks[b.id]; }

  // a block's state at intro time t0: 'p' (not yet), 'stage' (centre-stage), 'fly' (to its HUD slot), 'done' (landed)
  const stateAt = (b, t0) => (t0 < b.at - 1e-9 ? 'p' : t0 < b.at + b.stage ? 'stage' : t0 < b.at + b.d - 1e-9 ? 'fly' : 'done');

  // drive the text phase from the intro clock (run.intro.t, the countdown seconds)
  function textStep(I) {
    if (!I || !I.text || !toks) return;
    const tp = I.text, t0 = I.t || 0;
    if (!plan) plan = tp.blocks.map(() => '');
    tp.blocks.forEach((b, j) => {
      const st = stateAt(b, t0), was = plan[j];
      if (st === was) return;
      plan[j] = st;
      if (st === 'stage') enter(b);
      else if (st === 'fly') fly(b, was === '' || was === 'p');
      else if (st === 'done') { if (was === 'stage' || was === '' || was === 'p') fly(b, true); }   // late frame: snap to the slot
    });
    if (!fin && t0 >= tp.hold - FIN_S) {
      fin = true; el.classList.add('fin'); doc.body.classList.remove('bf-text');   // dim lifts, tokens cross-fade into the real panel
    }
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
    if (!v) doc.body.classList.remove('bf-text');
  }

  // the intro is over or was cancelled by an action: everything drops at once (the camera is not touched)
  function drop() {
    if (el) { el.className = 'brief'; el.textContent = ''; }
    key = null; toks = null; plan = null; lay = null; fin = false; show(false);
  }

  // per frame (main.js). frozen = a menu / end screen is up (the overlay stays as it is)
  function update(w, dt, frozen) {
    if (!doc || !IT.UI || !IT.Ranked) return;
    const run = w && w.ranked, rk = run && IT.Ranked.hud ? IT.Ranked.hud(w) : null;
    const active = !!(rk && run.intro && rk.phase === 'countdown');
    if (!mount()) return;
    if (active) {
      const k = run.intro;
      if (key !== k) { key = k; build(w, rk); el.className = 'brief on'; }
      textStep(k);
      show(true);
      return;
    }
    if (on || key || el.classList.contains('on')) drop();
  }

  function hide() { if (el) drop(); else show(false); }

  IT.Briefing = { update, hide, emph, textStep, stateAt, onShake: null };
})(typeof window !== 'undefined' ? window : globalThis);
