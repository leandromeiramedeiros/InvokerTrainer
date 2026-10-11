// Play HUD: bottom bar (portrait, bars, orbs, QWER, invoked slots, items), buffs, sandbox panel, cheat sheet, live stats.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const ORBN = { Q: 'quas', W: 'wex', E: 'exort' };
  const SPELLS = ['coldsnap', 'ghostwalk', 'icewall', 'emp', 'tornado', 'alacrity', 'sunstrike', 'forgespirit', 'chaosmeteor', 'deafeningblast'];

  const H = {
    c: null, el: null, refs: {}, cache: {}, dps: [], total: 0, cheatOn: false, statsOn: false, off: [], cdMax: {}, accT: 0,
  };

  const hasIcon = id => !!(IT.Art && IT.Art.frame('icons', id));

  function btnEl(cls, onclick) {
    const { h } = IT.UI;
    const ic = h('span', { class: 'ic' });
    const key = h('span', { class: 'hk' }), lvl = h('span', { class: 'lv' }), cdn = h('span', { class: 'cdn' }), cd = h('span', { class: 'cd' }), mana = h('span', { class: 'mn' }), ch = h('span', { class: 'ch' });
    const el = h('div', { class: 'hbtn ' + cls, onmousedown: ev => { ev.preventDefault(); ev.stopPropagation(); if (ev.button === 0 && onclick) onclick(ev); } }, ic, mana, cd, cdn, key, lvl, ch);
    return { el, ic, key, lvl, cdn, cd, mana, ch, id: null };
  }
  // hero item slot drag: press -> move >5px = drag (swap on release), else click = cast on release
  function itemDown(i, ev) {
    if (ev.button !== 0 || !H.c) return;
    H.drag = { i, x: ev.clientX, y: ev.clientY, go: false, queued: ev.shiftKey, over: null };
  }
  function slotAt(ev) {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const s = el && el.closest ? el.closest('.hitems [data-slot]') : null;
    return s ? +s.getAttribute('data-slot') : null;
  }
  function itemMove(ev) {
    const d = H.drag; if (!d || !H.c) return;
    if (!d.go) {
      if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 5) return;
      const it = H.c.hero.items[d.i]; if (!it) return;   // empty slot: stays a click
      d.go = true;
      H.refs.items[d.i].el.classList.add('dragsrc');
      d.ghost = IT.UI.h('div', { class: 'hdrag' }, IT.UI.icon(it.id));
      H.el.appendChild(d.ghost);
    }
    const r = H.el.getBoundingClientRect();
    d.ghost.style.left = (ev.clientX - r.left) + 'px'; d.ghost.style.top = (ev.clientY - r.top) + 'px';
    const j = slotAt(ev);
    if (j !== d.over) {
      if (d.over != null) H.refs.items[d.over].el.classList.remove('drop');
      d.over = j;
      if (j != null && j !== d.i) H.refs.items[j].el.classList.add('drop');
    }
  }
  function itemUp(ev) {
    const d = H.drag; if (!d || ev.button !== 0) return;
    H.drag = null;
    const c = H.c; if (!c) return;
    if (!d.go) { IT.Input.doAction('item' + (d.i + 1), { hud: true, queued: d.queued }); return; }
    if (d.ghost) d.ghost.remove();
    if (H.refs.items) H.refs.items.forEach(b => b.el.classList.remove('drop', 'dragsrc'));
    const j = slotAt(ev);
    if (j != null && j !== d.i) IT.Items.swap(c.w, c.hero, d.i, j);
  }

  // bottom bar for a selected non-hero unit (Dota-style): portrait, name, bars, armor/MR/speed, 6 items
  function unitBar(R) {
    const { h } = IT.UI, t = IT.t;
    R.upor = h('div', { class: 'hpor' });
    R.uname = h('div', { class: 'uname' });
    R.uhp = h('div', { class: 'bar hp' }, R.uhpf = h('i'), R.uhpt = h('span'));
    R.ump = h('div', { class: 'bar mp' }, R.umpf = h('i'), R.umpt = h('span'));
    R.ua = h('b'); R.um = h('b'); R.us = h('b');
    R.ustats = h('div', { class: 'ustats' }, h('span', {}, t('hud.armor') + ' ', R.ua), h('span', {}, t('hud.mres') + ' ', R.um), h('span', {}, t('hud.ms') + ' ', R.us));
    R.uitems = [0, 1, 2, 3, 4, 5].map(() => { const ic = h('span', { class: 'ic' }); return { el: h('div', { class: 'hbtn item' }, ic), ic }; });
    return h('div', { class: 'hudp hbar hunit', style: { display: 'none' } },
      R.upor,
      h('div', { class: 'hmid' }, R.uname, h('div', { class: 'bars' }, R.uhp, R.ump), R.ustats),
      h('div', { class: 'hitems' }, R.uitems.map(b => b.el)));
  }
  // ---------------------------------------------------------------- Aghanim's hood emblem (Scepter = top gem, Shard = lower gems)
  const HW = 24, HH = 25;
  const HOOD_ORN = [   // left half (12 cols) of the winged ornament, from row 9. b outline, a body, c highlight
    '..b.........', '..bab....bbb', '.bacab..baab', '.bacabbbaaab', '..bbaaaaaacc', '....bbaaaacc', '......bbaacc', '........bacc', '..........bc',
  ];
  const HOOD_PAL = { b: '#151d27', a: '#34475a', c: '#6a88a2' };
  const GEM_PAL = {   // e edge, m body, h core highlight, glow halo
    quas: { e: '#1672d6', m: '#3cc0ff', h: '#e0f8ff', glow: '#2fb4ff' },
    wex: { e: '#8a28d8', m: '#d24dff', h: '#ffe8ff', glow: '#c040ff' },
    exort: { e: '#d4560e', m: '#ffa02c', h: '#fff2c0', glow: '#ff8a1a' },
  };
  const SHARD_ORB = { ghostwalk: 'quas', emp: 'wex', sunstrike: 'exort' };
  const gemRows = rows => { const px = []; for (const [y, x0, x1] of rows) for (let x = x0; x <= x1; x++) px.push([x, y]); return px; };
  const HOOD_SCEPTER = gemRows([[0, 11, 12], [1, 10, 13], [2, 9, 14], [3, 8, 15], [4, 8, 15], [5, 8, 15], [6, 8, 15], [7, 9, 14], [8, 9, 14], [9, 10, 13]]);
  const HOOD_SHARD = gemRows([[19, 11, 12], [20, 10, 13], [21, 10, 13], [22, 10, 13], [23, 11, 12], [24, 11, 12],
    [20, 6, 6], [21, 5, 7], [22, 5, 7], [23, 6, 6], [20, 17, 17], [21, 16, 18], [22, 16, 18], [23, 17, 17]]);
  function paintGem(cx, px, pal) {   // pal null = unlit (dark)
    const set = new Set(px.map(p => p[0] + ',' + p[1]));
    let maxY = 0; for (const p of px) maxY = Math.max(maxY, p[1]);
    for (const [x, y] of px) {
      const edge = !(set.has((x - 1) + ',' + y) && set.has((x + 1) + ',' + y) && set.has(x + ',' + (y - 1)) && set.has(x + ',' + (y + 1)));
      let c;
      if (!pal) c = edge ? '#0b0711' : (x < 12 && y % 2 === 0 ? '#2a2140' : '#1c1530');
      else if (edge) c = pal.e;
      else if ((x === 11 || x === 12) && y < maxY - 1) c = pal.h;
      else c = pal.m;
      cx.fillStyle = c; cx.fillRect(x, y, 1, 1);
    }
  }
  function hoodCanvas(cls) { const c = document.createElement('canvas'); c.width = HW; c.height = HH; c.className = 'hh ' + cls; return c; }
  function hoodEl() {
    const { h } = IT.UI;
    const base = hoodCanvas('base'), cx = base.getContext('2d');
    HOOD_ORN.forEach((row, i) => {
      for (let x = 0; x < 12; x++) {
        const ch = row[x]; if (ch === '.') continue;
        cx.fillStyle = HOOD_PAL[ch]; cx.fillRect(x, 9 + i, 1, 1); cx.fillRect(HW - 1 - x, 9 + i, 1, 1);
      }
    });
    cx.fillStyle = HOOD_PAL.b; cx.fillRect(11, 18, 2, 1);
    paintGem(cx, HOOD_SCEPTER, null); paintGem(cx, HOOD_SHARD, null);
    const sc = hoodCanvas('scepter'), sh = hoodCanvas('shard');
    const el = h('div', { class: 'hhood' }, base, sc, sh);
    el._sc = sc; el._sh = sh;
    return el;
  }
  // Scepter / Shard glow in the colour of their orb / shard spell; dark outline when not owned (loadout from w.loadout)
  H.updHood = function (R, ca, lo) {
    const so = lo.scepter ? (lo.scepterOrb || (typeof lo.scepter === 'string' ? lo.scepter : 'wex')) : null;
    const ss = lo.shard ? (lo.shardSpell || (typeof lo.shard === 'string' ? lo.shard : null)) : null;
    const key = (so || '-') + '|' + (lo.shard ? (ss || '?') : '-');
    if (ca.hood === key) return;
    ca.hood = key;
    const el = R.hood, sc = el._sc, sh = el._sh;
    sc.getContext('2d').clearRect(0, 0, HW, HH); sh.getContext('2d').clearRect(0, 0, HW, HH);
    const sp = so && GEM_PAL[so], hp = lo.shard && GEM_PAL[SHARD_ORB[ss] || 'wex'];
    if (sp) { paintGem(sc.getContext('2d'), HOOD_SCEPTER, sp); sc.style.setProperty('--hc', sp.glow); }
    if (hp) { paintGem(sh.getContext('2d'), HOOD_SHARD, hp); sh.style.setProperty('--hc', hp.glow); }
    sc.style.display = sp ? '' : 'none'; sh.style.display = hp ? '' : 'none';
    el.classList.toggle('lit', !!(sp || hp));
  };

  // top-centre ranked run panel (hidden unless IT.Ranked.hud(w) returns an object):
  // countdown digit, flair scenario name, one objective line, combo icons (+ order), compact timer / score
  function rankedPanel(R) {
    const { h } = IT.UI, t = IT.t;
    R.rkNum = h('div', { class: 'rknum' });
    R.rkName = h('b', { class: 'rkname' }); R.rkObj = h('span', { class: 'rkobj' });
    R.rkCombo = h('div', { class: 'rkcombo' });
    R.rkTv = h('b'); R.rkRv = h('b'); R.rkSv = h('b'); R.rkMed = h('span', { class: 'rkmed' });
    R.rkTm = h('div', { class: 'rkt tm' }, h('span', { text: t('hud.rkTime') }), R.rkTv);
    R.rkRn = h('div', { class: 'rkt' }, h('span', { text: t('hud.rkRun') }), R.rkRv);
    R.rkSc = h('div', { class: 'rkt sc' }, h('span', { text: t('hud.score') }), R.rkSv, R.rkMed);
    R.rkRow = h('div', { class: 'rkrow' }, R.rkTm, R.rkSc, R.rkRn);
    return h('div', { class: 'rkp', style: { display: 'none' } }, R.rkNum, h('div', { class: 'rkscen' }, R.rkName, R.rkObj), R.rkCombo, R.rkRow);
  }
  // ordered action list of the running combo / scenario: [{ k:'spell'|'item'|'attack'|'move'|'pos', id }]
  function rkActions(rk) {
    const w = H.c.w, GM = IT.GAME, out = [];
    const def = w.combo && w.combo.def;
    if (def) {
      for (const s of def.steps) {
        if (s.ability) out.push({ k: GM.SPELL_ORBS[s.ability] ? 'spell' : 'item', id: s.ability });
        else if (s.type === 'attack') out.push({ k: 'attack' });
        else if (s.type === 'move') out.push({ k: 'move' });
        else if (s.type === 'position') out.push({ k: 'pos' });
      }
      return out;
    }
    const sc = IT.SCENARIOS && IT.SCENARIOS.get ? IT.SCENARIOS.get(rk.id) : null;
    for (const s of (sc && sc.sol) || []) {
      if (s.a === 'attack') out.push({ k: 'attack' });
      else if (s.a === 'move') out.push({ k: 'move' });
      else if (s.a) out.push({ k: GM.SPELL_ORBS[s.a] ? 'spell' : 'item', id: s.a });
    }
    return out;
  }
  function rkBuildCombo(R, rk, ord, hints) {
    const { h, icon } = IT.UI, t = IT.t;
    R.rkCombo.textContent = '';
    let acts = rkActions(rk);
    if (!ord) { const seen = new Set(); acts = acts.filter(a => (a.k === 'spell' || a.k === 'item') && !seen.has(a.id) && seen.add(a.id)); }
    acts.forEach((a, i) => {
      if (ord && i) R.rkCombo.appendChild(h('i', { class: 'rkar' }));
      let box;
      if (a.k === 'spell' || a.k === 'item') {
        box = h('div', { class: 'rka ' + a.k }, hasIcon(a.id) ? icon(a.id) : h('b', { text: String(a.id).slice(0, 3).toUpperCase() }));
        if (hints && a.k === 'spell') box.appendChild(h('em', { class: 'rkrec', text: IT.GAME.SPELL_ORBS[a.id] || '' }));
      } else box = h('div', { class: 'rka badge ' + a.k }, h('b', { text: t(a.k === 'attack' ? 'hud.rkAtk' : a.k === 'move' ? 'hud.rkMov' : 'hud.rkPos') }));
      R.rkCombo.appendChild(box);
    });
    R.rkCombo.style.display = acts.length ? '' : 'none';
  }
  const fmtS = s => { s = Math.max(0, s || 0); const v = Math.floor(s * 10) / 10, m = Math.floor(v / 60); return m + ':' + (v - m * 60).toFixed(1).padStart(4, '0'); };
  const fmtM = s => { const v = Math.max(0, Math.floor(s || 0)), m = Math.floor(v / 60); return m + ':' + String(v - m * 60).padStart(2, '0'); };
  function setIcon(b, id) {
    if (b.id === id) return;
    b.id = id; b.ic.textContent = '';
    if (id && hasIcon(id)) b.ic.appendChild(IT.UI.icon(id));
    b.el.classList.toggle('empty', !id);
  }
  function setText(el, txt, store, name) {
    if (store[name] === txt) return;
    store[name] = txt; el.textContent = txt;
  }

  // sweep + number for a cooldown value
  function setCd(b, cd, total, store, nm) {
    const p = cd > 0 && total > 0 ? Math.min(1, cd / total) : 0;
    const k = Math.round(p * 100);
    if (store[nm + 'p'] !== k) { store[nm + 'p'] = k; b.cd.style.setProperty('--p', (k * 3.6) + 'deg'); b.el.classList.toggle('oncd', k > 0); }
    setText(b.cdn, cd > 0 ? (cd >= 10 ? String(Math.ceil(cd)) : cd.toFixed(1)) : '', store, nm + 'n');
  }

  H.bind = function (ctx) {
    H.unbind();
    const { h, portrait, icon, btn } = IT.UI, t = IT.t;
    H.c = ctx; H.cache = {}; H.cdMax = {}; H.dps = []; H.total = 0; H.cheatOn = false; H.statsOn = false;
    const In = IT.Input;
    const root = document.getElementById('hud');
    root.textContent = '';
    H.el = root;
    const R = H.refs = {};

    // --- bottom bar
    R.por = h('div', { class: 'hpor' }, portrait(IT.Art.heroSheet()), R.lvl = h('span', { class: 'plv', text: ctx.hero.ctx.heroLevel }));
    R.hp = h('div', { class: 'bar hp' }, R.hpf = h('i'), R.hpt = h('span'));
    R.mp = h('div', { class: 'bar mp' }, R.mpf = h('i'), R.mpt = h('span'));
    R.orbs = h('div', { class: 'horbs' }, [0, 1, 2].map(() => h('span', { class: 'os' })));
    R.q = btnEl('q', () => In.doAction('orbQ', { hud: true })); R.w = btnEl('w', () => In.doAction('orbW', { hud: true })); R.e = btnEl('e', () => In.doAction('orbE', { hud: true }));
    R.r = btnEl('r', () => In.doAction('invoke', { hud: true }));
    R.s1 = btnEl('slot', ev => In.doAction('slot1', { hud: true, queued: ev.shiftKey })); R.s2 = btnEl('slot', ev => In.doAction('slot2', { hud: true, queued: ev.shiftKey }));
    R.items = [0, 1, 2, 3, 4, 5].map(i => { const b = btnEl('item', null); b.el.setAttribute('data-slot', i); b.el.addEventListener('mousedown', ev => itemDown(i, ev)); return b; });
    setIcon(R.q, 'quas'); setIcon(R.w, 'wex'); setIcon(R.e, 'exort'); setIcon(R.r, 'invoke');
    R.hood = hoodEl();   // Scepter/Shard hood emblem: between abilities and items (Dota)
    R.bar = h('div', { class: 'hudp hbar' },
      R.por,
      h('div', { class: 'hmid' },
        h('div', { class: 'bars' }, R.hp, R.mp),
        h('div', { class: 'abrow' }, R.q.el, R.w.el, R.e.el, R.r.el, h('i', { class: 'sep' }), R.s1.el, R.s2.el)),
      R.hood,
      h('div', { class: 'hitems' }, R.items.map(b => b.el)));
    R.ubar = unitBar(R);
    R.buffs = h('div', { class: 'hbuffs' });
    R.orbcol = h('div', { class: 'horbcol' }, R.orbs);
    R.stat = h('div', { class: 'hstat' }, R.orbcol, R.buffs);   // orbs + status icons float above the hero bar
    R.aim = h('div', { class: 'aimhint', text: t('hud.aimHint') });
    R.rk = rankedPanel(R);
    R.top = h('div', { class: 'htop' }, R.rk);   // top-centre stack: ranked panel, then combo bar

    // --- sandbox panel
    if (ctx.mode === 'sandbox') {
      R.dpsN = h('b', { class: 'dpsn', text: '0' }); R.totN = h('b', { class: 'totn', text: '0' });
      R.list = h('div', { class: 'clist' });
      R.side = h('div', { class: 'hudp hside' },
        h('div', { class: 'dpsrow' }, h('span', { text: t('hud.dps') }), R.dpsN, h('span', { class: 'sp', text: t('hud.total') }), R.totN),
        h('div', { class: 'srow2' },
          h('button', { type: 'button', class: 'mini', onclick: () => In.hooks.refresh && In.hooks.refresh(), text: t('hud.refresh') + ' [' + IT.Settings.label(IT.Settings.keyOf('refresh')) + ']' }),
          h('button', { type: 'button', class: 'mini', onclick: () => In.hooks.spawn && In.hooks.spawn(), text: t('hud.spawn') + ' [' + IT.Settings.label(IT.Settings.keyOf('spawn')) + ']' }),
          h('button', { type: 'button', class: 'mini', onclick: () => In.hooks.resetDummies && In.hooks.resetDummies(), text: t('hud.resetDummies') + ' [' + IT.Settings.label(IT.Settings.keyOf('resetDummies')) + ']' })),
        h('div', { class: 'ch2', text: t('hud.combos') }), R.list);
      H.buildList();
      root.appendChild(R.side);
    }
    R.cheat = h('div', { class: 'hudp cheat', style: { display: 'none' } });
    R.live = h('div', { class: 'hudp live', style: { display: 'none' } });
    root.appendChild(R.top); root.appendChild(R.bar); root.appendChild(R.ubar); root.appendChild(R.stat); root.appendChild(R.aim); root.appendChild(R.cheat); root.appendChild(R.live);
    if (IT.ComboBar) IT.ComboBar.bind(ctx, R.top);
    const wm = ev => itemMove(ev), wu = ev => itemUp(ev);
    window.addEventListener('mousemove', wm); window.addEventListener('mouseup', wu);
    H.off.push(() => { window.removeEventListener('mousemove', wm); window.removeEventListener('mouseup', wu); H.drag = null; });

    H.off.push(ctx.w.on('damage', p => {
      const w = ctx.w, s = p.src != null ? w.get(p.src) : null, tg = w.get(p.target);
      if (!s || !tg || tg.team !== 1 || s.team !== 0 || !(p.dealt > 0)) return;
      H.dps.push([w.t, p.dealt]); H.total += p.dealt;
    }));
    H.lastLang = IT.lang;
    H.update(0);
  };

  H.buildList = function () {
    const { h } = IT.UI, t = IT.t, c = H.c, R = H.refs;
    if (!R.list || !IT.Combo) return;
    R.list.textContent = '';
    const lo = c.w.loadout, grant = !!c.grant;
    const av = new Set(IT.Combo.available(lo, { grantMissing: grant }).map(x => x.id));
    let lastTier = null;
    for (const cb of (IT.COMBOS || [])) {
      if (cb.tier !== lastTier) { lastTier = cb.tier; R.list.appendChild(h('div', { class: 'ctier', text: t('tier.' + cb.tier) })); }
      const ok = av.has(cb.id);
      let tip = '';
      if (!ok) {
        const m = IT.Combo.missing(lo, cb), bits = [];
        if (m.orbs.length) bits.push(m.orbs.map(k => t('orb.' + k)).join(', '));
        if (m.items.length) bits.push(m.items.map(i => t('item.' + i)).join(', '));
        if (m.scepter) bits.push(t('item.scepter')); if (m.shard) bits.push(t('item.shard'));
        tip = t('hud.needs', { x: bits.join(', ') });
      } else tip = (cb.tip && (cb.tip[IT.lang] || cb.tip.en)) || '';
      R.list.appendChild(h('button', {
        type: 'button', class: 'citem' + (ok ? '' : ' lock'), 'data-tip': tip, text: (cb.name && (cb.name[IT.lang] || cb.name.en)) || cb.id,
        onclick: () => { if (!ok) { IT.UI.toast(t('toast.locked'), 'warn'); return; } IT.Combo.start(c.w, cb.id); },
      }));
    }
  };

  H.unbind = function () {
    for (const f of H.off) { try { f(); } catch (e) { /* ignore */ } }
    H.off = []; H.c = null; H.refs = {};
    if (IT.ComboBar && IT.ComboBar.unbind) IT.ComboBar.unbind();
    const root = document.getElementById('hud'); if (root) root.textContent = '';
  };

  // ---------------------------------------------------------------- toggles
  H.cheatToggle = function () {
    H.cheatOn = !H.cheatOn;
    if (H.cheatOn) H.buildCheat();
    H.refs.cheat.style.display = H.cheatOn ? '' : 'none';
  };
  H.buildCheat = function () {
    const { h, icon } = IT.UI, t = IT.t, GM = IT.GAME, R = H.refs, S = IT.Settings;
    R.cheat.textContent = '';
    const key = S.keyOf('cheat');
    R.cheat.appendChild(h('div', { class: 'chead' }, h('b', { text: t('cheat.title') }), h('span', { text: t('cheat.hint', { key: S.label(key) }) })));
    const rows = h('div', { class: 'crows' });
    for (const s of SPELLS) {
      const rec = GM.SPELL_ORBS[s];
      const d = IT.Abilities && IT.Abilities.get(s);
      rows.appendChild(h('div', { class: 'crow' },
        h('span', { class: 'cor' }, rec.split('').map(ch => icon(ORBN[ch], 'mini'))),
        icon(s, 'mini'), h('span', { class: 'cn', text: t('spell.' + s) }),
        h('span', { class: 'ck', text: S.data.scheme === 'legacy' ? S.label(S.data.keys.legacy[s]) : rec })));
    }
    R.cheat.appendChild(rows);
  };
  H.statsShow = function (on) {
    H.statsOn = !!on; H.refs.live.style.display = on ? '' : 'none';
    if (on) H.buildLive();
  };
  H.buildLive = function () {
    const c = H.c; if (!c || !c.w._stats) return;
    const { h } = IT.UI, t = IT.t, R = H.refs;
    const S = c.w._stats.summary();
    R.live.textContent = '';
    R.live.appendChild(h('div', { class: 'chead' }, h('b', { text: t('hud.liveStats') })));
    const f = n => (n == null ? '-' : String(Math.round(n * 10) / 10));
    const row = (a, b) => h('div', { class: 'lrow' }, h('span', { text: a }), h('b', { text: b }));
    R.live.appendChild(row(t('end.time'), f(S.time) + 's'));
    R.live.appendChild(row(t('end.apm'), f(S.apm)));
    const dealt = S.damage && S.damage.dealt ? S.damage.dealt.total : 0, taken = S.damage && S.damage.taken ? S.damage.taken.total : 0;
    R.live.appendChild(row(t('end.dealt'), f(dealt))); R.live.appendChild(row(t('end.taken'), f(taken)));
    R.live.appendChild(row(t('end.cc'), f((S.cc && S.cc.ratio != null ? S.cc.ratio * 100 : 0)) + '%'));
    R.live.appendChild(row(t('end.blind'), f(S.blindHits)));
    R.live.appendChild(row(t('end.combos'), f(S.combos && S.combos.done)));
    for (const id in S.spells) {
      const sp = S.spells[id];
      R.live.appendChild(h('div', { class: 'lrow sp' }, IT.UI.icon(id, 'mini'), h('span', { text: t('spell.' + id) }), h('b', { text: sp.casts + ' / ' + sp.hits + (sp.accuracy != null ? ' (' + Math.round(sp.accuracy * 100) + '%)' : '') })));
    }
  };

  // ---------------------------------------------------------------- per-frame
  // selected non-hero unit panel (red HP for enemies, green for allies)
  H.updUnit = function (U, R, ca, w) {
    const { h, icon } = IT.UI, t = IT.t;
    if (ca.uid !== U.id) {
      ca.uid = U.id;
      const sheet = U.kind === 'hero' ? IT.Art.heroSheet() : U.kind === 'spirit' ? 'forge' : (IT.Art.sheets[U.skin] ? U.skin : null);
      R.upor.textContent = ''; R.upor.appendChild(sheet ? IT.UI.portrait(sheet) : h('div', { class: 'hgen', text: '?' }));
      R.upor.classList.toggle('foe', U.team !== 0); R.uhp.classList.toggle('foe', U.team !== 0);
      R.uname.textContent = U.name || t('hud.unit');
      for (const k of ['uhp', 'ump', 'ua', 'um', 'us']) delete ca[k];
    }
    const hk = Math.max(0, Math.round(U.hp)) + '/' + Math.round(U.maxHp);
    if (ca.uhp !== hk) { ca.uhp = hk; R.uhpt.textContent = hk; R.uhpf.style.width = (U.maxHp ? Math.max(0, U.hp / U.maxHp) * 100 : 0) + '%'; }
    const mmp = Math.round(U.maxMana || 0), mk = Math.max(0, Math.round(U.mana || 0)) + '/' + mmp;
    R.ump.style.display = mmp > 0 ? '' : 'none';
    if (ca.ump !== mk) { ca.ump = mk; R.umpt.textContent = mk; R.umpf.style.width = (U.maxMana ? Math.max(0, U.mana / U.maxMana) * 100 : 0) + '%'; }
    setText(R.ua, String(Math.round((U.armor || 0) * 10) / 10), ca, 'ua');
    setText(R.um, Math.round((U.magicRes || 0) * 100) + '%', ca, 'um');
    setText(R.us, String(Math.round(U.ms || 0)), ca, 'us');
    R.uitems.forEach((b, i) => {
      const it = U.items && U.items[i], id = it ? (typeof it === 'string' ? it : it.id) : null;
      if (ca['ui' + i] === id) return;
      ca['ui' + i] = id; b.ic.textContent = ''; if (id && hasIcon(id)) b.ic.appendChild(icon(id));
      b.el.classList.toggle('empty', !id);
    });
  };

  // ranked run panel: countdown / flair title / combo icons / timers / score + medal. Hidden when IT.Ranked.hud(w) is null.
  H.updRanked = function (R, ca) {
    const rk = IT.Ranked && IT.Ranked.hud ? IT.Ranked.hud(H.c.w) : null;
    if (!rk) { if (ca.rk !== 0) { ca.rk = 0; R.rk.style.display = 'none'; R.top.classList.remove('rk'); } return; }
    if (ca.rk !== 1) { ca.rk = 1; R.rk.style.display = ''; R.top.classList.add('rk'); }
    const txt = v => v == null ? '' : typeof v === 'object' ? (v[IT.lang] || v.en || '') : String(v);
    if (ca.rkPh !== rk.phase) {   // medal from the persistent rating; refreshed on phase change
      ca.rkPh = rk.phase;
      if (IT.Medals && IT.Ranks && IT.Ranked.profile) {
        const r = IT.Ranks.fromRating(IT.Ranked.profile().rating);
        R.rkMed.textContent = ''; R.rkMed.appendChild(IT.Medals.canvas(r.tier, r.stars, 24));
      }
    }
    const cd = rk.phase === 'countdown', S = IT.Settings.get();
    R.rkNum.style.display = cd ? '' : 'none';
    R.rkRow.style.display = cd ? 'none' : '';
    if (cd) setText(R.rkNum, String(Math.max(1, Math.ceil(rk.countdown || 0))), ca, 'rkcd');
    setText(R.rkTv, fmtS(rk.timeLeft), ca, 'rkt'); R.rkTv.classList.toggle('low', rk.timeLeft != null && rk.timeLeft < 5);
    setText(R.rkRv, fmtM(rk.runLeft), ca, 'rkr');
    setText(R.rkSv, String(Math.round(rk.score || 0)), ca, 'rks');
    R.rkTm.style.display = rk.timeLeft == null ? 'none' : '';
    R.rkRn.style.display = rk.runLeft == null ? 'none' : '';
    R.rkSc.style.display = rk.score == null ? 'none' : '';   // practice: no score
    setText(R.rkName, txt(rk.scenario), ca, 'rkname'); setText(R.rkObj, txt(rk.objective), ca, 'rkobj');
    const hints = !!(rk.hints && S.hints), ord = !!S.comboOrder, def = H.c.w.combo && H.c.w.combo.def;
    const ck = rk.id + '|' + rk.n + '|' + (def ? def.id : '') + '|' + IT.lang + '|' + (ord ? 1 : 0) + (hints ? 1 : 0);
    if (ca.rkCk !== ck) { ca.rkCk = ck; rkBuildCombo(R, rk, ord, hints); R.rkCombo.classList.toggle('ord', ord); }
  };

  H.update = function (dt) {
    const c = H.c; if (!c) return;
    const { w, hero } = c, R = H.refs, ca = H.cache, S = IT.Settings, t = IT.t;
    if (H.lastLang !== IT.lang || H.lastSkin !== IT.Art.heroSheet()) { H.lastLang = IT.lang; H.lastSkin = IT.Art.heroSheet(); const d0 = H.dps, t0 = H.total; H.bind(c); H.dps = d0; H.total = t0; return; }
    // bars
    const hp = Math.max(0, Math.round(hero.hp)), mhp = Math.round(hero.maxHp), mp = Math.round(hero.mana), mmp = Math.round(hero.maxMana);
    const hk = hp + '/' + mhp; if (ca.hp !== hk) { ca.hp = hk; R.hpt.textContent = hk; R.hpf.style.width = (hero.maxHp ? hero.hp / hero.maxHp * 100 : 0) + '%'; }
    const mk = mp + '/' + mmp; if (ca.mp !== mk) { ca.mp = mk; R.mpt.textContent = mk; R.mpf.style.width = (hero.maxMana ? hero.mana / hero.maxMana * 100 : 0) + '%'; }
    // orbs
    const ob = hero.inv.orbs.join('');
    if (ca.orbs !== ob) {
      ca.orbs = ob;
      [...R.orbs.children].forEach((s, i) => { s.textContent = ''; const o = hero.inv.orbs[i]; s.className = 'os' + (o ? ' ' + ORBN[o] : ''); if (o) s.appendChild(IT.UI.icon(ORBN[o])); });
    }
    const eff = hero.ctx.eff;
    for (const [b, k, a] of [[R.q, 'quas', 'orbQ'], [R.w, 'wex', 'orbW'], [R.e, 'exort', 'orbE']]) {
      setText(b.lvl, String(eff[k]), ca, 'l' + k);
      setText(b.key, S.label(S.keyOf(a)), ca, 'k' + k);
      b.el.classList.toggle('dim', eff[k] <= 0);
    }
    // invoke
    const icd = hero.inv.invokeCd || 0;
    if (icd > (H.cdMax.invoke || 0)) H.cdMax.invoke = icd;
    if (icd <= 0) H.cdMax.invoke = 0;
    setCd(R.r, icd, H.cdMax.invoke, ca, 'r');
    setText(R.r.key, S.label(S.keyOf('invoke')), ca, 'kr');
    // slots
    const legacy = S.data.scheme === 'legacy';
    [R.s1, R.s2].forEach((b, i) => {
      const id = hero.inv.slots[i];
      setIcon(b, id);
      const cd = id ? hero.cd[id] || 0 : 0, d = id && IT.Abilities.get(id);
      if (cd > (H.cdMax[id] || 0)) H.cdMax[id] = cd;
      setCd(b, cd, id ? H.cdMax[id] : 0, ca, 's' + i);
      const low = !!(d && hero.mana < d.manaCost(w, hero));
      if (ca['low' + i] !== low) { ca['low' + i] = low; b.el.classList.toggle('lowmana', low); }
      setText(b.key, id && legacy ? S.label(S.data.keys.legacy[id]) : S.label(S.keyOf('slot' + (i + 1))), ca, 'ks' + i);
      setText(b.lvl, '', ca, 'ls' + i);
    });
    // items
    R.items.forEach((b, i) => {
      const it = hero.items[i], id = it ? it.id : null;
      setIcon(b, id);
      const cd = it ? it.cd || 0 : 0, d = id && IT.Abilities.get(id);
      const ck = 'it' + i + (id || '');
      if (cd > (H.cdMax[ck] || 0)) H.cdMax[ck] = cd;
      if (cd <= 0) H.cdMax[ck] = 0;
      setCd(b, cd, H.cdMax[ck], ca, 'i' + i);
      const low = !!(d && d.manaCost && hero.mana < d.manaCost(w, hero));
      if (ca['il' + i] !== low) { ca['il' + i] = low; b.el.classList.toggle('lowmana', low); }
      setText(b.key, S.label(S.keyOf('item' + (i + 1))), ca, 'ki' + i);
      setText(b.ch, it && it.charges > 0 && id !== 'bkb' ? String(it.charges) : '', ca, 'ci' + i);
    });
    // armed highlight
    const armed = IT.Input.armed ? IT.Input.armed.id : null;
    if (ca.armed !== armed) {
      ca.armed = armed;
      R.s1.el.classList.toggle('armed', !!armed && armed === hero.inv.slots[0]);
      R.s2.el.classList.toggle('armed', !!armed && armed === hero.inv.slots[1]);
      R.items.forEach((b, i) => b.el.classList.toggle('armed', !!armed && hero.items[i] && hero.items[i].id === armed));
      R.aim.style.display = armed ? '' : 'none';
    }
    // selected unit (IT.Input.selected) replaces the hero bar; hero bar returns when null
    const sel = IT.Input.selected != null ? w.get(IT.Input.selected) : null, U = sel && sel !== hero && !sel.dead ? sel : null;
    const um = U ? U.id : null;
    if (ca.umode !== um) {
      ca.umode = um; ca.uid = null;
      R.bar.style.display = U ? 'none' : ''; R.ubar.style.display = U ? '' : 'none'; R.orbcol.style.display = U ? 'none' : '';
    }
    if (U) H.updUnit(U, R, ca, w);
    // ranked panel
    H.updRanked(R, ca);
    H.updHood(R, ca, w.loadout || {});
    // buffs (hero's, or the selected unit's)
    const bu = U || hero;
    const sts = (bu.statuses || []).filter(s => s.type !== 'channel' && s.type !== 'itemStats' && isFinite(s.until));
    const sig = bu.id + ':' + sts.map(s => s.type).join(',');
    if (ca.buffs !== sig) {
      ca.buffs = sig; R.buffs.textContent = ''; R.bchips = [];
      for (const s of sts) {
        const src = s.src != null ? w.get(s.src) : null, foe = src && src.team !== bu.team;
        const nm = IT.hasT('status.' + s.type) ? t('status.' + s.type) : s.type;
        const chip = IT.UI.h('div', { class: 'buff ' + (foe ? 'bad' : 'good'), 'data-tip': nm },
          s.ability && hasIcon(s.ability) ? IT.UI.icon(s.ability) : (s.type && hasIcon(s.type) ? IT.UI.icon(s.type) : IT.UI.h('b', { class: 'ab', text: nm.slice(0, 3).toUpperCase() })),
          IT.UI.h('span', { class: 'bt' }));
        R.buffs.appendChild(chip); R.bchips.push({ chip, s, tx: chip.lastChild });
      }
    }
    if (R.bchips) for (const b of R.bchips) { const rem = Math.max(0, b.s.until - w.t); const v = rem >= 10 ? String(Math.ceil(rem)) : rem.toFixed(1); if (b.v !== v) { b.v = v; b.tx.textContent = v; } }
    // sandbox panel
    if (R.dpsN) {
      const now = w.t; while (H.dps.length && now - H.dps[0][0] > 5) H.dps.shift();
      let sum = 0; for (const d of H.dps) sum += d[1];
      setText(R.dpsN, String(Math.round(sum / 5)), ca, 'dps'); setText(R.totN, String(Math.round(H.total)), ca, 'tot');
    }
    if (H.statsOn) { H.accT += dt; if (H.accT > 0.4) { H.accT = 0; H.buildLive(); } }
    if (IT.ComboBar) IT.ComboBar.update(dt);
    if (IT.DummyChat && IT.DummyChat.update) IT.DummyChat.update(dt);
  };
  H.resetMeter = function () { H.dps = []; H.total = 0; };

  IT.HUD = H;
})(typeof window !== 'undefined' ? window : globalThis);
