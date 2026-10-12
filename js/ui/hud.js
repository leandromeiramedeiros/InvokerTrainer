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

  const ul = (en, pt) => (IT.lang === 'pt' ? pt : en);
  const UCMD_ICON = { attack: 'ui_atk', stop: 'ui_stop', hold: 'ui_hold' };
  // bottom bar for a selected non-hero unit (Dota-style): portrait, name, bars, armor/MR/speed, 6 items
  function unitBar(R) {
    const { h } = IT.UI, t = IT.t;
    R.upor = h('div', { class: 'hpor' });
    R.uname = h('div', { class: 'uname' });
    R.uhp = h('div', { class: 'bar hp' }, R.uhpf = h('i'), R.uhpt = h('span'));
    R.ump = h('div', { class: 'bar mp' }, R.umpf = h('i'), R.umpt = h('span'));
    R.ua = h('b'); R.um = h('b'); R.us = h('b'); R.ud = h('b');
    R.udw = h('span', {}, ul('DAMAGE', 'DANO') + ' ', R.ud);
    R.umw = h('span', {}, t('hud.mres') + ' ', R.um); R.usw = h('span', {}, t('hud.ms') + ' ', R.us);
    R.ustats = h('div', { class: 'ustats' }, R.udw, h('span', {}, t('hud.armor') + ' ', R.ua), R.umw, R.usw);
    R.unote = h('div', { class: 'ustats', style: { display: 'none', color: '#ffd27a' } });   // buildings: team + invulnerable note
    R.uitems = [0, 1, 2, 3, 4, 5].map(() => { const ic = h('span', { class: 'ic' }); return { el: h('div', { class: 'hbtn item' }, ic), ic }; });
    // v6: own Forge Spirit card -> its own Attack / Stop / Hold commands (with the bound keys) instead of item slots
    R.ucmd = ['attack', 'stop', 'hold'].map(a => { const b = btnEl('item cmd', () => IT.Input.doAction(a, { hud: true })); b.act = a; b.el.style.display = 'none'; return b; });
    return h('div', { class: 'hudp hbar hunit', style: { display: 'none' } },
      R.upor,
      h('div', { class: 'hmid' }, R.uname, h('div', { class: 'bars' }, R.uhp, R.ump), R.ustats, R.unote),
      h('div', { class: 'hitems' }, R.uitems.map(b => b.el), R.ucmd.map(b => b.el)));
  }
  // ---------------------------------------------------------------- Aghanim's hood emblem (Dota layout)
  // three orb sockets (Wex top, Quas left, Exort right) on a steel frame, Scepter = teardrop gem, Shard = gem trio below.
  // Unowned: dark gems, muted orbs. Owned: the gem lights in the orb colour of the scepter orb / shard spell and that socket brightens.
  const HW = 34, HH = 38;
  const HOOD_ORB = { wex: [17, 5.5], quas: [5.5, 14.5], exort: [28.5, 14.5] }, HOOD_OR = 5.2;
  const GEM_PAL = {   // e edge, m body, h highlight, glow halo, orb socket ramp [dark, mid, light]
    quas: { e: '#0e4c9a', m: '#2fa8ff', h: '#d8f6ff', glow: '#2fb4ff', orb: [[8, 40, 84], [42, 150, 230], [190, 240, 255]] },
    wex: { e: '#6a1aa8', m: '#cf48ff', h: '#ffe0ff', glow: '#c040ff', orb: [[56, 14, 84], [186, 70, 236], [255, 214, 255]] },
    exort: { e: '#a8400a', m: '#ff9a28', h: '#fff0b8', glow: '#ff8a1a', orb: [[84, 30, 6], [226, 132, 32], [255, 230, 150]] },
  };
  const SHARD_ORB = { ghostwalk: 'quas', emp: 'wex', sunstrike: 'exort' };
  const STEEL = ['#0c1016', '#252e38', '#4a5866', '#7d8fa0'];
  const hhash = (x, y, s) => { let n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const rgb = c => 'rgb(' + c.map(v => Math.max(0, Math.min(255, v | 0))).join(',') + ')';
  const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  // teardrop (scepter): pointed top, round bottom. returns pixel list [x, y, edge, hl]
  const HOOD_DROP = (() => {
    const px = [], inside = (x, y) => { const cy = 19.5, r = 4.6; if (y >= cy) return Math.hypot(x - 17, y - cy) <= r; const k = (y - 10.5) / (cy - 10.5); return k >= 0 && Math.abs(x - 17) <= r * Math.pow(k, 0.6); };
    for (let y = 10; y < 26; y++) for (let x = 10; x < 24; x++) {
      if (!inside(x + .5, y + .5)) continue;
      const edge = !(inside(x - .5, y + .5) && inside(x + 1.5, y + .5) && inside(x + .5, y - .5) && inside(x + .5, y + 1.5));
      px.push([x, y, edge, !edge && (x === 16 || (x === 15 && y > 17 && y < 21)) && y > 13 && y < 22]);
    }
    return px;
  })();
  // shard trio: shield in the middle, two round side gems
  const HOOD_SHARD = (() => {
    const px = [], add = (inside, x0, x1, y0, y1, hx) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (!inside(x + .5, y + .5)) continue;
        const edge = !(inside(x - .5, y + .5) && inside(x + 1.5, y + .5) && inside(x + .5, y - .5) && inside(x + .5, y + 1.5));
        px.push([x, y, edge, !edge && hx(x, y)]);
      }
    };
    add((x, y) => y >= 30 && y <= 37 && Math.abs(x - 17) <= (y < 34 ? 3.2 : 3.2 - (y - 34) * 0.95), 13, 21, 29, 37, (x, y) => x === 16 && y < 34);
    for (const gx of [10.5, 23.5]) add((x, y) => Math.hypot(x - gx, y - 31.5) <= 2.6, gx - 3 | 0, gx + 3 | 0, 28, 35, (x, y) => x === (gx | 0) - 1 && y === 30);
    return px;
  })();
  function paintGem(cx, px, pal) {   // pal null = unlit (dark)
    for (const [x, y, edge, hl] of px) {
      cx.fillStyle = !pal ? (edge ? '#07060c' : (x < 17 ? '#2a2236' : '#1a1524')) : edge ? pal.e : hl ? pal.h : pal.m;
      cx.fillRect(x, y, 1, 1);
    }
    if (!pal && px === HOOD_DROP) { cx.fillStyle = '#3a3248'; cx.fillRect(15, 15, 1, 3); }   // dark gem sheen
  }
  function paintOrb(cx, name, lit) {   // swirly orb in a steel socket ring
    const [ox, oy] = HOOD_ORB[name], O = GEM_PAL[name].orb, seed = name.length * 7;
    for (let y = Math.floor(oy - HOOD_OR - 1); y <= oy + HOOD_OR + 1; y++) for (let x = Math.floor(ox - HOOD_OR - 1); x <= ox + HOOD_OR + 1; x++) {
      const d = Math.hypot(x + .5 - ox, y + .5 - oy);
      if (d > HOOD_OR + 1) continue;
      if (d > HOOD_OR) { cx.fillStyle = d > HOOD_OR + .55 ? STEEL[0] : (y < oy ? STEEL[3] : STEEL[2]); cx.fillRect(x, y, 1, 1); continue; }
      const a = Math.atan2(y + .5 - oy, x + .5 - ox), sw = Math.sin(a * 2 + d * 1.3) * 0.5 + 0.5;   // swirl
      let k = (1 - d / HOOD_OR) * 0.75 + sw * 0.25 + (hhash(x, y, seed) - 0.5) * 0.25 - ((x - ox) + (y - oy)) * 0.025;
      let c = k < 0.45 ? lerp3(O[0], O[1], k / 0.45) : lerp3(O[1], O[2], Math.min(1, (k - 0.45) / 0.55));
      if (!lit) c = lerp3(c, [26, 30, 38], 0.5);
      cx.fillStyle = rgb(c); cx.fillRect(x, y, 1, 1);
    }
  }
  function hoodFrame(cx) {
    const P = (x, y, c) => { cx.fillStyle = c; cx.fillRect(x, y, 1, 1); };
    // top bracket: bar under the Wex orb reaching the side orbs, slanted ends
    for (let x = 7; x <= 26; x++) { P(x, 9, STEEL[3]); P(x, 10, STEEL[2]); P(x, 11, STEEL[1]); }
    for (let i = 0; i < 3; i++) { P(6 - i, 10 + i, STEEL[2]); P(27 + i, 10 + i, STEEL[2]); }
    // V brace from the bar down to the gem
    for (let i = 0; i < 6; i++) { P(9 + i, 12 + i, STEEL[2]); P(10 + i, 12 + i, STEEL[1]); P(24 - i, 12 + i, STEEL[2]); P(23 - i, 12 + i, STEEL[1]); }
    // filigree under the teardrop: stem + curled wings
    for (let y = 24; y <= 29; y++) { P(16, y, STEEL[3]); P(17, y, STEEL[2]); }
    const wing = [[15, 25], [14, 25], [13, 24], [12, 24], [11, 23], [10, 23], [10, 22], [11, 21], [13, 26], [12, 27], [11, 27], [10, 26], [14, 27], [15, 28], [9, 24], [8, 23]];
    for (const [x, y] of wing) { P(x, y, STEEL[2]); P(33 - x, y, STEEL[2]); }
    for (const [x, y] of [[13, 24], [11, 23], [12, 27]]) { P(x, y - 1, STEEL[3]); P(33 - x, y - 1, STEEL[3]); }
    P(16, 23, STEEL[3]); P(17, 23, STEEL[3]);
  }
  function hoodCanvas(cls) { const c = document.createElement('canvas'); c.width = HW; c.height = HH; c.className = 'hh ' + cls; return c; }
  function hoodEl() {
    const { h } = IT.UI;
    const base = hoodCanvas('base'), cx = base.getContext('2d');
    hoodFrame(cx);
    for (const n of ['quas', 'wex', 'exort']) paintOrb(cx, n, false);
    paintGem(cx, HOOD_DROP, null); paintGem(cx, HOOD_SHARD, null);
    const sc = hoodCanvas('scepter'), sh = hoodCanvas('shard'), pt = hoodCanvas('sand');
    const el = h('div', { class: 'hhood' }, base, sc, sh, pt);
    el._sc = sc; el._sh = sh; el._pt = pt; el._parts = []; el._em = [];
    return el;
  }
  // Scepter / Shard glow in the colour of their orb / shard spell; dark outline when not owned (loadout from w.loadout)
  H.updHood = function (R, ca, lo, dt) {
    const el = R.hood;
    const so = lo.scepter ? (lo.scepterOrb || (typeof lo.scepter === 'string' ? lo.scepter : 'wex')) : null;
    const ss = lo.shard ? (lo.shardSpell || (typeof lo.shard === 'string' ? lo.shard : null)) : null;
    const key = (so || '-') + '|' + (lo.shard ? (ss || '?') : '-');
    if (ca.hood !== key) {
      ca.hood = key;
      const sc = el._sc, sh = el._sh, scx = sc.getContext('2d'), shx = sh.getContext('2d');
      scx.clearRect(0, 0, HW, HH); shx.clearRect(0, 0, HW, HH);
      const sn = GEM_PAL[so] ? so : null, hn = lo.shard ? (SHARD_ORB[ss] || 'wex') : null;
      const sp = sn && GEM_PAL[sn], hp = hn && GEM_PAL[hn];
      if (sp) { paintGem(scx, HOOD_DROP, sp); paintOrb(scx, sn, true); sc.style.setProperty('--hc', sp.glow); }
      if (hp) { paintGem(shx, HOOD_SHARD, hp); if (hn !== sn) paintOrb(shx, hn, true); sh.style.setProperty('--hc', hp.glow); }
      sc.style.display = sp ? '' : 'none'; sh.style.display = hp ? '' : 'none';
      el.classList.toggle('lit', !!(sp || hp));
      // sand emitters: grains trickle off the lit gems
      el._em = [];
      if (sp) el._em.push({ x0: 14, x1: 20, y: 24, pal: sp, rate: 2.2 });
      if (hp) el._em.push({ x0: 9, x1: 25, y: 35, pal: hp, rate: 3.4 });
    }
    hoodSand(el, dt || 0);
  };
  // subtle falling sand: a few glowing grains per second, drift + gravity, fade out; integer pixels on the hood's own canvas
  function hoodSand(el, dt) {
    const ps = el._parts;
    if (!el._em.length && !ps.length) return;
    dt = Math.min(dt, 0.1);
    for (const e of el._em) {
      e.acc = (e.acc || 0) + dt * e.rate;
      while (e.acc >= 1 && ps.length < 18) {
        e.acc -= 1;
        ps.push({ x: e.x0 + Math.random() * (e.x1 - e.x0), y: e.y + Math.random() * 2, vx: (Math.random() - 0.5) * 3, vy: -2 - Math.random() * 3, life: 0, max: 1.1 + Math.random() * 0.9, c: Math.random() < 0.4 ? e.pal.h : e.pal.m });
      }
      if (e.acc > 1) e.acc = 1;
    }
    for (const p of ps) { p.life += dt; p.vy += 9 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    for (let i = ps.length - 1; i >= 0; i--) if (ps[i].life >= ps[i].max || ps[i].y >= HH) ps.splice(i, 1);
    const cx = el._pt.getContext('2d');
    cx.clearRect(0, 0, HW, HH);
    for (const p of ps) { cx.globalAlpha = Math.min(1, 3 * (1 - p.life / p.max)) * 0.85; cx.fillStyle = p.c; cx.fillRect(p.x | 0, p.y | 0, 1, 1); }
    cx.globalAlpha = 1;
  }

  // top-centre scenario HUD (hidden unless IT.Ranked.hud(w) returns an object). ONE compact design, two states:
  //   countdown: centred panel (<= ~20 % of the viewport): countdown number + hint, title + difficulty, objective, win / lose, step chips, timer / score / turn
  //   play:      the same panel collapses (animated) into one slim strip: objective, small step chips, timer, turn
  function rankedPanel(R) {
    const { h } = IT.UI, t = IT.t;
    R.rkNum = h('div', { class: 'rknum' }); R.rkHint = h('div', { class: 'rkcdh' });
    R.rkName = h('b', { class: 'rkname' }); R.rkBadge = h('span', { class: 'rkdiff' }); R.rkMeta = h('span', { class: 'rkmeta' });
    R.rkObj = h('span', { class: 'rkobj' });
    R.rkCombo = h('div', { class: 'rkcombo' }); R.rkChips = [];
    R.rkWin = h('span', { class: 'rkwin' }); R.rkLoseL = h('span', { class: 'rklose' });   // win + lose lines
    R.rkInfo = h('div', { class: 'rkinfo' }, R.rkWin, R.rkLoseL);
    R.rkTv = h('b'); R.rkRv = h('b'); R.rkSv = h('b'); R.rkMed = h('span', { class: 'rkmed' });
    R.rkTm = h('div', { class: 'rkt tm' }, h('span', { text: t('hud.rkTime') }), R.rkTv);
    R.rkRl = h('span', { text: t('hud.rkRun') });
    R.rkRn = h('div', { class: 'rkt rn' }, R.rkRl, R.rkRv);
    R.rkSc = h('div', { class: 'rkt sc' }, h('span', { text: t('hud.score') }), R.rkSv, R.rkMed);
    R.rkRow = h('div', { class: 'rkrow' }, R.rkTm, R.rkSc, R.rkRn);
    return h('div', { class: 'rkp cd', style: { display: 'none' } },
      h('div', { class: 'rkcd' }, R.rkNum, R.rkHint),
      h('div', { class: 'rkmain' }, h('div', { class: 'rkhd' }, h('div', { class: 'rknm' }, R.rkName, R.rkBadge), R.rkMeta), R.rkObj, R.rkInfo, R.rkCombo),
      R.rkRow);
  }
  // ordered action list of the running combo / scenario: [{ k:'spell'|'item'|'attack'|'move'|'stop'|'hold'|'pos', id }]
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
    return IT.HudSteps.derive(sc);   // F1: sc.steps, else the solver script / spell list
  }
  const keyLab = a => IT.Settings.label(IT.Settings.keyOf(a));
  const locT = v => v == null ? '' : typeof v === 'object' ? (v[IT.lang] || v.en || '') : String(v);
  const dedupeActs = acts => { const seen = new Set(); return acts.filter(a => (a.k === 'spell' || a.k === 'item') && !seen.has(a.id) && seen.add(a.id)); };
  const KIND_ICON = { attack: 'ui_atk', move: 'ui_move', stop: 'ui_stop', hold: 'ui_hold', pos: 'ui_pos' };
  const KIND_KEY = { attack: 'attack', stop: 'stop', hold: 'hold' };   // move = right-click, position = walk there: icon only
  const stepName = a => a.k === 'spell' || a.k === 'item' ? nmOf(a.id) : t('f1.' + (a.k === 'attack' ? 'attack' : a.k));
  function itemKey(id, hero) { const i = hero.items.findIndex(x => x && x.id === id); return i >= 0 ? keyLab('item' + (i + 1)) : '?'; }
  const recKeys = rec => rec.split('').map(ch => keyLab('orb' + ch)).join('');
  // everything a chip label depends on besides the scenario: bound keys, item slots, key scheme (the chips are rebuilt when it changes)
  function chipSig(hero) {
    const S = IT.Settings;
    return hero.items.map(x => x ? x.id : '-').join(',') + '|' + ['orbQ', 'orbW', 'orbE', 'invoke', 'attack', 'stop', 'hold', 'item1', 'item2', 'item3', 'item4', 'item5', 'item6'].map(a => S.label(S.keyOf(a))).join('') + S.data.scheme;
  }
  // one chip per step: pixel icon + the bound key on its lower edge (spell: recipe in the bound orb keys; item: its item slot key;
  // attack / stop / hold: their key; move / position: icon only). The tooltip spells it all out.
  function rkBuildChips(R, rk, ord, hints) {
    const { h, icon } = IT.UI, S = IT.Settings, hero = H.c.hero, legacy = S.data.scheme === 'legacy';
    R.rkCombo.textContent = ''; R.rkChips = [];
    let acts = rkActions(rk);
    if (!ord) acts = dedupeActs(acts);
    acts.forEach((a, i) => {
      if (ord && i) R.rkCombo.appendChild(h('i', { class: 'rkar' }));
      let ic, key = null, tip = stepName(a);
      if (a.k === 'spell') {
        const rec = IT.GAME.SPELL_ORBS[a.id] || '';
        ic = hasIcon(a.id) ? icon(a.id) : h('b', { text: String(a.id).slice(0, 3).toUpperCase() });
        if (legacy) { const lk = S.label(S.data.keys.legacy[a.id]); key = h('span', { class: 'rkk' }, lk); tip += ' - ' + lk; }
        else if (rec) {
          tip += ' - ' + recKeys(rec) + ' + ' + keyLab('invoke');
          if (hints) key = h('span', { class: 'rkk rec' }, rec.split('').map(ch => h('i', { class: 'o ' + ORBN[ch], text: keyLab('orb' + ch) })));
        }
      } else if (a.k === 'item') {
        ic = hasIcon(a.id) ? icon(a.id) : h('b', { text: String(a.id).slice(0, 3).toUpperCase() });
        const ik = itemKey(a.id, hero); key = h('span', { class: 'rkk' }, ik); tip += ' - ' + ik;
      } else {
        ic = icon(KIND_ICON[a.k] || 'ui_pos');
        if (KIND_KEY[a.k]) { const kk = keyLab(KIND_KEY[a.k]); key = h('span', { class: 'rkk' }, kk); tip += ' - ' + kk; }
        else if (a.k === 'move') tip += ' - ' + t('f1.rmb');
      }
      const chip = h('div', { class: 'rkc ' + a.k, 'data-tip': tip }, ic, key);
      R.rkCombo.appendChild(chip); R.rkChips.push(chip);
    });
    R.rkCombo.style.display = acts.length ? '' : 'none';
  }
  // ordered mode: flag the current step, dim the finished ones
  function updChips(R) {
    const tr = H.trk && H.trk.tr;
    if (!tr || !R.rkChips.length || R.rkChips.length !== tr.steps.length) return;
    const st = tr.states(), key = st.join('');
    if (R.rkStKey === key) return;
    R.rkStKey = key;
    R.rkChips.forEach((c, i) => { c.classList.toggle('done', st[i] === 'done'); c.classList.toggle('now', st[i] === 'now'); });
  }
  // countdown panel -> slim strip: the panel height animates between the two layouts (cd -> play only; everything else switches instantly)
  function rkMode(R, ca, play) {
    const el = R.rk, m = play ? 'play' : 'cd';
    if (ca.rkMode === m) return;
    const first = ca.rkMode == null, h0 = el.offsetHeight;
    ca.rkMode = m;
    clearTimeout(ca.rkAnim); el.classList.remove('anim'); el.style.height = '';
    el.classList.toggle('play', play); el.classList.toggle('cd', !play);
    if (first || !play || !h0) return;
    const h1 = el.offsetHeight;
    if (h1 >= h0) return;
    el.style.height = h0 + 'px'; el.classList.add('anim', 'collapsing');
    void el.offsetHeight;
    el.style.height = h1 + 'px';
    ca.rkAnim = setTimeout(() => { el.classList.remove('anim', 'collapsing'); el.style.height = ''; }, 520);
  }
  // (re)start step progress for the current scenario: plan the presses from the hero's present orbs / slots / items
  function rkStartTracker(rk, key) {
    const hero = H.c.hero, S = IT.HudSteps, sc = IT.SCENARIOS && IT.SCENARIOS.get ? IT.SCENARIOS.get(rk.id) : null;
    const steps = rkActions(rk);
    const state = { orbs: hero.inv.orbs, slots: hero.inv.slots, items: hero.items.map(x => x && x.id), preinvoked: sc && sc.hero && sc.hero.preinvoked };
    H.trk = { key, tr: S.tracker(S.plan(steps, state)) };
  }
  function trkFeed(ev) { if (H.trk && H.trk.tr) H.trk.tr.feed(ev); }
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

  // hover tooltip ([data-tip], shown by menus.js), only rewritten when the text changes
  function setTip(el, txt, store, name) { if (store[name] === txt) return; store[name] = txt; el.setAttribute('data-tip', txt); }
  const t = (k, o) => IT.t(k, o);
  const nmOf = id => IT.hasT('spell.' + id) ? t('spell.' + id) : IT.hasT('item.' + id) ? t('item.' + id) : id;
  const stOf = (cd, mc) => (cd > 0 ? t('hud.cd', { n: Math.ceil(cd) }) : t('hud.ready')) + (mc > 0 ? ' - ' + t('hud.mana', { n: Math.round(mc) }) : '');

  // sweep + number for a cooldown value
  function setCd(b, cd, total, store, nm) {
    const p = cd > 0 && total > 0 ? Math.min(1, cd / total) : 0;
    const k = Math.round(p * 100);
    if (store[nm + 'p'] !== k) { store[nm + 'p'] = k; b.cd.style.setProperty('--p', (k * 3.6) + 'deg'); b.el.classList.toggle('oncd', k > 0); }
    setText(b.cdn, cd > 0 ? (cd >= 10 ? String(Math.ceil(cd)) : cd.toFixed(1)) : '', store, nm + 'n');
  }

  // 3 mini orb icons for a recipe string ('QWE'), tooltip = bound keys
  function recipeOrbs(rec, cls) {
    const { h, icon } = IT.UI;
    return rec.split('').map(ch => h('i', { class: 'ro ' + ORBN[ch] + (cls ? ' ' + cls : '') }, icon(ORBN[ch])));
  }
  // always-on recipe strip: one cell per spell (tiny icon + the 3 orb dots), lit while that spell sits in an invoked slot
  function recipeStrip() {
    const { h, icon } = IT.UI;
    const cells = SPELLS.map(id => {
      const rec = IT.GAME.SPELL_ORBS[id] || '';
      const el = h('div', { class: 'rcell' }, icon(id), h('span', { class: 'rd3' }, rec.split('').map(ch => h('i', { class: ORBN[ch] }))));
      return { id, rec, el };
    });
    return { cells, el: h('div', { class: 'recs' }, cells.map(c => c.el)) };
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
    // hovering an ability / item icon previews its radius (instant casts show no rangefinder otherwise)
    const hov = (el, idOf) => { el.addEventListener('mouseenter', () => { In.preview = idOf; }); el.addEventListener('mouseleave', () => { if (In.preview === idOf) In.preview = null; }); };
    hov(R.s1.el, () => ctx.hero.inv.slots[0]); hov(R.s2.el, () => ctx.hero.inv.slots[1]);
    R.items.forEach((b, i) => hov(b.el, () => { const it = ctx.hero.items[i]; return it ? it.id : null; }));
    setIcon(R.q, 'quas'); setIcon(R.w, 'wex'); setIcon(R.e, 'exort'); setIcon(R.r, 'invoke');
    R.hood = hoodEl();   // Scepter/Shard hood emblem: between abilities and items (Dota)
    // recipe hints, always on: 3 mini orbs under each invoked-spell slot + a compact 10-spell recipe strip above the bar
    R.rec1 = h('div', { class: 'abrec' }); R.rec2 = h('div', { class: 'abrec' });
    R.recs = recipeStrip();
    R.bar = h('div', { class: 'hudp hbar' },
      R.por,
      h('div', { class: 'hmid' },
        h('div', { class: 'bars' }, R.hp, R.mp),
        h('div', { class: 'abrow' }, R.q.el, R.w.el, R.e.el, R.r.el, h('i', { class: 'sep' }),
          h('div', { class: 'abcol' }, R.s1.el, R.rec1), h('div', { class: 'abcol' }, R.s2.el, R.rec2))),
      R.hood,
      h('div', { class: 'hitems' }, R.items.map(b => b.el)),
      R.recs.el);
    R.ubar = unitBar(R);
    R.buffs = h('div', { class: 'hbuffs' });
    R.orbcol = h('div', { class: 'horbcol' }, R.orbs);
    R.stat = h('div', { class: 'hstat' }, R.orbcol, R.buffs);   // orbs + status icons float above the hero bar
    R.aim = h('div', { class: 'aimhint', text: t('hud.aimHint') });
    R.rk = rankedPanel(R);
    R.top = h('div', { class: 'htop' }, R.rk);   // top-centre stack: ranked panel, then combo bar

    // --- sandbox panel (v6 WP7: fixed-height pane, see H.buildSide)
    if (ctx.mode === 'sandbox') { R.top.classList.add('sbx'); H.buildSide(ctx, root); }
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
    // F1: step progress from the hero's own events
    H.trk = null; H.scnSeq = 0;
    const hid = ctx.hero.id;
    H.off.push(ctx.w.on('orb', p => { if (p.unit === hid) trkFeed({ type: 'orb', orb: p.orb }); }));
    H.off.push(ctx.w.on('invoke', p => { if (p.unit === hid) trkFeed({ type: 'invoke', spell: p.spell }); }));
    H.off.push(ctx.w.on('cast', p => { if (p.unit === hid) trkFeed({ type: 'cast', ability: p.ability }); }));
    H.off.push(ctx.w.on('attack', p => { if (p.src === hid) trkFeed({ type: 'attack' }); }));
    H.off.push(ctx.w.on('order', p => { const ty = p.unit === hid && p.order && p.order.type; if (ty === 'move' || ty === 'stop' || ty === 'hold') trkFeed({ type: ty }); }));
    H.off.push(ctx.w.on('scnStart', () => { H.scnSeq = (H.scnSeq || 0) + 1; }));
    H.lastLang = IT.lang;
    H.update(0);
  };

  // ---------------------------------------------------------------- sandbox side panel (v6 WP7)
  // Fixed-height pane (never taller than the stage, clear of the hero bar): header (map + fold), DPS meter with sparkline,
  // icon tool buttons (+ auto-refresh toggle), sliders (scarecrows, enemy tier), then the combo browser: search, tier filter, scrollable list.
  const SBI = {
    refresh: '<path d="M13 8a5 5 0 1 1-1.6-3.7M13.5 1.5V5H10"/>',
    spawn: '<path d="M6 2h4v3H6zM8 5v9M2 8h12M5 14h6"/>',
    reset: '<path d="M3 5h8a3 3 0 0 1 0 6H6M3 5l3-3M3 5l3 3"/>',
    place: '<path d="M8 1.5v4M8 10.5v4M1.5 8h4M10.5 8h4M6.5 6.5h3v3h-3z"/>',
    auto: '<path d="M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z"/>',
    fold: '<path d="M3 6l5 5 5-5"/>',
    lock: '<path d="M4 7h8v7H4zM5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
  };
  const sbIcon = k => { const s = IT.UI.h('span', { class: 'sbi' }); s.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true">' + SBI[k] + '</svg>'; return s; };
  const SB_FILTERS = ['all', 'basic', 'intermediate', 'advanced', 'items'];

  H.buildSide = function (ctx, root) {
    const { h } = IT.UI, t = IT.t, In = IT.Input, R = H.refs, S = IT.Settings;
    if (!H.sb || H.sb.w !== ctx.w) H.sb = { w: ctx.w, filter: 'all', q: '', min: false, auto: false, tier: null, peak: 0, tiered: new Set(), cur: null, ck: '', sp: 0, tc: 0 };
    const sb = H.sb; sb.ck = ''; sb.cur = null; const free = !!ctx.free, key = a => S.label(S.keyOf(a));
    const tool = (ic, label, desc, act, hook) => h('button', {
      type: 'button', class: 'sbx-ib ' + act, 'aria-label': label, 'data-tip': label + (key(act) ? ' [' + key(act) + ']' : '') + '\n' + desc,
      onclick: ev => { ev.currentTarget.blur(); if (In.hooks[hook]) In.hooks[hook](); },
    }, sbIcon(ic), key(act) && act !== 'armEnemy' ? h('kbd', { text: key(act) }) : null);
    const slider = (cls, label, tip, min, max, val, oninput) => {
      const inp = h('input', { type: 'range', class: 'sbx-rg', min, max, step: 1, value: val, 'aria-label': label, oninput: ev => oninput(+ev.target.value) });
      inp.addEventListener('change', () => inp.blur());
      const out = h('span', { class: 'v' });
      return { row: h('div', { class: 'sbx-sl ' + cls, 'data-tip': tip }, h('label', { text: label }), inp, out), inp, out };
    };

    R.mapLine = h('div', { class: 'maplin' });   // current map name (Free Play / sandbox top line)
    R.fold = h('button', { type: 'button', class: 'sbx-fold', 'aria-label': t(sb.min ? 'sbx.expand' : 'sbx.collapse'), 'data-tip': t(sb.min ? 'sbx.expand' : 'sbx.collapse'),
      onclick: ev => { ev.currentTarget.blur(); sb.min = !sb.min; R.side.classList.toggle('min', sb.min); const tp = t(sb.min ? 'sbx.expand' : 'sbx.collapse'); R.fold.setAttribute('data-tip', tp); R.fold.setAttribute('aria-label', tp); } }, sbIcon('fold'));
    // DPS meter
    R.dpsN = h('b', { class: 'dpsn', text: '0' }); R.totN = h('b', { class: 'totn', text: '0' }); R.peakN = h('span', { class: 'pk' });
    R.spark = h('canvas', { class: 'sbx-spark', width: 160, height: 24, 'data-tip': t('sbx.spark') });
    // tools
    R.tools = h('div', { class: 'sbx-tools' },
      tool('refresh', t('hud.refresh'), t('sbx.refresh.d'), 'refresh', 'refresh'),
      free ? tool('spawn', t('hud.spawn'), t('sbx.spawn.d'), 'spawn', 'spawn') : null,
      tool('reset', t('hud.resetDummies'), t('sbx.reset.d'), 'resetDummies', 'resetDummies'),
      free ? (R.place = tool('place', t('hud.placeEnemy'), t('hud.placeEnemy.d'), 'armEnemy', 'armEnemy')) : null,
      R.autoB = h('button', { type: 'button', class: 'sbx-ib auto' + (sb.auto ? ' on' : ''), 'aria-label': t('sbx.auto'), 'aria-pressed': sb.auto ? 'true' : 'false', 'data-tip': t('sbx.auto') + '\n' + t('sbx.auto.d'),
        onclick: ev => { ev.currentTarget.blur(); sb.auto = !sb.auto; R.autoB.classList.toggle('on', sb.auto); R.autoB.setAttribute('aria-pressed', sb.auto ? 'true' : 'false'); } }, sbIcon('auto')));
    // sliders (scarecrow count / enemy tier): free play + combo sandbox only (scenario sandbox replays the scenario)
    let sliders = null;
    if (free) {
      const n0 = Math.max(1, Math.min(5, IT.Units.trainers(ctx.w).length || 1));
      const sd = R.sd = slider('sd', t('sbx.dummies'), t('sbx.dummies.d'), 1, 5, n0, v => { H.sbDummies(v); });
      const tiers = IT.DIFFICULTY.order, ti = R.st = slider('st', t('sbx.diff'), t('sbx.diff.d'), 0, tiers.length - 1, sb.tier != null ? sb.tier : 2, v => { sb.tier = v; H.sbTier(true); });
      R.sdN = sd.inp; R.sdV = sd.out; R.stV = ti.out;
      sliders = h('div', { class: 'sbx-sec sbx-sls' }, sd.row, ti.row);
      sd.out.textContent = String(n0);
      ti.out.textContent = sb.tier != null ? t('diff.' + tiers[sb.tier]) : t('sbx.diff.keep');
    }
    // combo browser
    R.search = h('input', { type: 'text', class: 'sbx-q', placeholder: t('sbx.search'), 'aria-label': t('sbx.search'), spellcheck: 'false', autocomplete: 'off', maxlength: 24, value: sb.q,
      oninput: ev => { sb.q = ev.target.value; H.filterList(); },
      onkeydown: ev => { if (ev.key === 'Escape') { ev.stopPropagation(); ev.preventDefault(); if (R.search.value) { R.search.value = ''; sb.q = ''; H.filterList(); } else R.search.blur(); } } });
    R.lcount = h('span', { class: 'cnt' });
    R.chips = SB_FILTERS.map(f => h('button', { type: 'button', class: 'sbx-fc' + (f === 'all' ? '' : ' t-' + f) + (sb.filter === f ? ' on' : ''), text: t(f === 'all' ? 'sbx.all' : 'tier.' + f),
      onclick: ev => { ev.currentTarget.blur(); sb.filter = f; R.chips.forEach((c, i) => c.classList.toggle('on', SB_FILTERS[i] === f)); H.filterList(); } }));
    R.list = h('div', { class: 'clist' });
    R.side = h('div', { class: 'hudp hside' + (sb.min ? ' min' : '') },
      h('div', { class: 'sbx-head' }, R.mapLine, R.fold),
      h('div', { class: 'sbx-body' },
        h('div', { class: 'sbx-sec sbx-meter' },
          h('div', { class: 'dpsrow' }, h('span', { text: t('hud.dps') }), R.dpsN, R.peakN, h('span', { class: 'sp', text: t('hud.total') }), R.totN), R.spark),
        h('div', { class: 'sbx-sec' }, R.tools),
        sliders,
        h('div', { class: 'sbx-lh' }, h('span', { class: 'ch2', text: t('hud.combos') }), R.lcount, R.search),
        h('div', { class: 'sbx-fl' }, R.chips),
        R.list));
    // the wheel belongs to the pane (list scroll), never to the game zoom
    R.side.addEventListener('wheel', ev => ev.stopPropagation(), { passive: true });
    H.buildList();
    root.appendChild(R.side);
  };

  // scarecrow count slider: spawn on free dummy spots / remove the newest (never the first trainer, never the combo's dummy)
  H.sbDummies = function (n) {
    const c = H.c, w = c && c.w, sb = H.sb; if (!w || !sb) return;
    const U = IT.Units, lo = w.loadout || {}, cur = w.combo && w.combo.dummy;
    let ds = U.trainers(w);
    const spots = (w.map && w.map.spawns && w.map.spawns.dummies) || [];
    while (ds.length < n) {
      const s = spots.find(p => !ds.some(d => Math.hypot(d.x - p.x, d.y - p.y) < 150));
      if (!s) break;
      U.spawnDummy(w, { x: s.x, y: s.y, preset: lo.preset, skin: lo.skin });
      ds = U.trainers(w);
    }
    while (ds.length > n && ds.length > 1) {
      const d = ds.slice(1).reverse().find(x => x.id !== cur); if (!d) break;
      w.remove(d); ds = U.trainers(w);
    }
    if (H.refs.sdV) H.refs.sdV.textContent = String(ds.length);
  };

  // enemy tier slider: reaction / item warning / awareness / damage of every real enemy (placed ones too, once the slider was used)
  H.sbTier = function (all) {
    const c = H.c, w = c && c.w, sb = H.sb, R = H.refs; if (!w || !sb || sb.tier == null) return;
    const df = IT.DIFFICULTY.get(sb.tier), AK = IT.GAME.ENEMY_ATTACK || {};
    if (R.stV) R.stV.textContent = IT.t('diff.' + IT.DIFFICULTY.order[sb.tier]);
    for (const e of w.query(x => x.kind === 'enemy' && !x.refill)) {
      if (!all && sb.tiered.has(e.id)) continue;
      sb.tiered.add(e.id);
      e.reaction = df.reaction; e.telegraph = df.telegraph; e.awareness = df.awareness; e.notice = df.notice; e.fights = !!df.fights;
      const AT = e.attack && AK[e.atkKind];
      if (AT) {
        const mn = Math.round(AT.min * df.dmgMul), mx = Math.max(mn, Math.round(AT.max * df.dmgMul));
        e.attack.min = mn; e.attack.max = mx; if (e.base) { e.base.dmgMin = mn; e.base.dmgMax = mx; }
      }
    }
  };

  // all combos as rows (built once per bind); H.filterList shows / hides them by tier chip + search text
  H.buildList = function () {
    const { h } = IT.UI, t = IT.t, c = H.c, R = H.refs;
    if (!R.list || !IT.Combo) return;
    R.list.textContent = '';
    const lo = c.w.loadout, grant = !!c.grant, CBar = IT.ComboBar;
    const av = new Set(IT.Combo.available(lo, { grantMissing: grant }).map(x => x.id));
    const abName = id => (IT.hasT('spell.' + id) ? t('spell.' + id) : IT.hasT('item.' + id) ? t('item.' + id) : id || '');
    R.rows = []; R.heads = {}; R.cmap = {};
    let lastTier = null;
    for (const cb of (IT.COMBOS || [])) {
      if (cb.tier !== lastTier) { lastTier = cb.tier; R.list.appendChild(R.heads[cb.tier] = h('div', { class: 'ctier t-' + cb.tier, text: t('tier.' + cb.tier) })); }
      const ok = av.has(cb.id), name = (cb.name && (cb.name[IT.lang] || cb.name.en)) || cb.id;
      let tip = '';
      if (!ok) {
        const m = IT.Combo.missing(lo, cb), bits = [];
        if (m.orbs.length) bits.push(m.orbs.map(k => t('orb.' + k)).join(', '));
        if (m.items.length) bits.push(m.items.map(i => t('item.' + i)).join(', '));
        if (m.scepter) bits.push(t('item.scepter')); if (m.shard) bits.push(t('item.shard'));
        tip = t('hud.needs', { x: bits.join(', ') });
      } else tip = IT.Combo.tipText(cb, IT.Values.ctx(c.w.loadout), IT.lang);
      const steps = (cb.steps || []).filter(s => s.type !== 'position' && s.type !== 'move'), shown = steps.slice(0, 9);
      const el = h('button', {
        type: 'button', class: 'citem t-' + cb.tier + (ok ? '' : ' lock'), 'data-tip': tip, 'data-id': cb.id,
        onclick: ev => { ev.currentTarget.blur(); if (!ok) { IT.UI.toast(t('toast.locked'), 'warn'); return; } IT.Combo.start(c.w, cb.id); },
      },
        h('span', { class: 'ci-top' }, h('b', { class: 'ci-name', text: name }), ok ? null : h('span', { class: 'ci-lock' }, sbIcon('lock')), h('em', { class: 'ci-tier', text: t('sbx.t.' + cb.tier) })),
        h('span', { class: 'ci-steps' }, shown.map(s => CBar.stepIcon(s)), steps.length > shown.length ? h('i', { class: 'more', text: '+' + (steps.length - shown.length) }) : null));
      R.list.appendChild(el); R.cmap[cb.id] = el;
      const hay = [(cb.name && cb.name.en) || '', (cb.name && cb.name.pt) || '', ...steps.map(s => abName(s.ability))].join(' ').toLowerCase();
      R.rows.push({ el, cb, hay });
    }
    R.empty = h('div', { class: 'cnone', text: t('sbx.none'), hidden: true }); R.list.appendChild(R.empty);
    H.filterList();
  };

  H.filterList = function () {
    const R = H.refs, sb = H.sb; if (!R.rows || !sb) return;
    const q = (sb.q || '').trim().toLowerCase(), seen = {};
    let n = 0;
    for (const r of R.rows) {
      const on = (sb.filter === 'all' || r.cb.tier === sb.filter) && (!q || r.hay.indexOf(q) >= 0);
      r.el.hidden = !on; if (on) { n++; seen[r.cb.tier] = true; }
    }
    for (const k in R.heads) R.heads[k].hidden = sb.filter !== 'all' || !seen[k];
    R.empty.hidden = n > 0;
    R.lcount.textContent = n + '/' + R.rows.length;
    R.list.scrollTop = 0;
  };

  // sparkline of the last 10 s of damage dealt to the enemies (40 buckets of 0.25 s)
  H.drawSpark = function (now) {
    const cv = H.refs.spark; if (!cv || !cv.getContext) return;
    const g = cv.getContext('2d'), W = cv.width, Hh = cv.height, N = 40, bw = W / N, arr = new Array(N).fill(0);
    for (const d of H.dps) { const i = N - 1 - Math.floor((now - d[0]) / 0.25); if (i >= 0 && i < N) arr[i] += d[1]; }
    let mx = 1; for (const v of arr) if (v > mx) mx = v;
    g.clearRect(0, 0, W, Hh);
    g.fillStyle = '#ffd23f';
    for (let i = 0; i < N; i++) { const v = arr[i]; if (v <= 0) continue; const bh = Math.max(2, Math.round(v / mx * (Hh - 3))); g.fillRect(Math.floor(i * bw), Hh - bh, Math.max(1, Math.ceil(bw) - 1), bh); }
    g.fillStyle = '#3a2a63'; g.fillRect(0, Hh - 1, W, 1);
  };

  // per-frame: meter, sliders sync, auto-refresh, armed Place enemy, active combo highlight
  H.updSide = function (dt, w, hero, ca) {
    const R = H.refs, sb = H.sb, t = IT.t; if (!sb) return;
    const now = w.t;
    while (H.dps.length && now - H.dps[0][0] > 10) H.dps.shift();
    let s5 = 0; for (const d of H.dps) if (now - d[0] <= 5) s5 += d[1];
    const dps = Math.round(s5 / 5);
    if (H.total === 0) sb.peak = 0;   // meter reset (Reset dummies / new scenario)
    if (dps > sb.peak) sb.peak = dps;
    setText(R.dpsN, String(dps), ca, 'dps'); setText(R.totN, String(Math.round(H.total)), ca, 'tot');
    setText(R.peakN, sb.peak ? t('sbx.peak', { n: sb.peak }) : '', ca, 'pk');
    sb.sp += dt; if (sb.sp > 0.12) { sb.sp = 0; H.drawSpark(now); }
    if (sb.auto && hero) {
      for (const k in hero.cd) hero.cd[k] = 0;
      if (hero.inv) hero.inv.invokeCd = 0;
      for (const it of hero.items || []) if (it) it.cd = 0;
      hero.mana = hero.maxMana;
    }
    if (R.place) { const on = !!(IT.Input.armed && IT.Input.armed.place); if (ca.plA !== on) { ca.plA = on; R.place.classList.toggle('on', on); } }
    sb.tc += dt;
    if (sb.tc > 0.4) {
      sb.tc = 0;
      if (R.sdN) {
        const n = IT.Units.trainers(w).length;
        if (document.activeElement !== R.sdN) { if (+R.sdN.value !== Math.min(5, Math.max(1, n))) R.sdN.value = Math.min(5, Math.max(1, n)); }
        setText(R.sdV, String(n), ca, 'sdv');
      }
      if (sb.tier != null) H.sbTier(false);
    }
    const st = w.combo, cur = st && st.def ? st.current : null, ck = cur ? cur + '|' + st.phase : '';
    if (sb.ck !== ck) {
      const old = R.cmap && R.cmap[sb.cur], el = cur && R.cmap && R.cmap[cur];
      if (old && old !== el) old.classList.remove('on', 'done', 'fail');
      if (el) {
        el.classList.add('on'); el.classList.toggle('done', st.phase === 'done'); el.classList.toggle('fail', st.phase === 'fail');
        if (sb.cur !== cur && !el.hidden) {   // bring the running combo into view inside the list (own scroll math: never scrolls the stage)
          const l = R.list, top = el.offsetTop, bot = top + el.offsetHeight;
          if (top < l.scrollTop) l.scrollTop = Math.max(0, top - 4); else if (bot > l.scrollTop + l.clientHeight) l.scrollTop = bot - l.clientHeight + 4;
        }
      }
      sb.cur = cur; sb.ck = ck;
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
      const bld = !!U.building, own = U.kind === 'spirit' && U.team === 0;
      const sheet = U.kind === 'hero' ? IT.Art.heroSheet() : U.kind === 'spirit' ? 'forge' : (IT.Art.sheets[U.skin] ? U.skin : null);
      const bp = bld && IT.TowerDraw && IT.TowerDraw.portrait ? IT.TowerDraw.portrait(U, w) : null;
      R.upor.textContent = ''; R.upor.appendChild(bp || (sheet ? IT.UI.portrait(sheet) : h('div', { class: 'hgen', text: '?' })));
      R.upor.classList.toggle('foe', U.team === 1); R.uhp.classList.toggle('foe', U.team === 1);
      R.uname.textContent = U.name || t('hud.unit');
      R.umw.style.display = R.usw.style.display = bld ? 'none' : '';
      const note = bld ? [U.team === 0 ? 'Radiant' : U.team === 1 ? 'Dire' : ul('Neutral', 'Neutro'), U.invulnerable ? ul('Invulnerable', 'Invulnerável') : U.destroyed ? ul('Destroyed', 'Destruída') : ''].filter(Boolean).join('  |  ') : '';
      R.unote.textContent = note; R.unote.style.display = note ? '' : 'none';
      R.uitems.forEach(b => { b.el.style.display = own || bld ? 'none' : ''; });
      R.ucmd.forEach(b => {
        b.el.style.display = own ? '' : 'none';
        if (own && !b.ic.firstChild && hasIcon(UCMD_ICON[b.act])) b.ic.appendChild(icon(UCMD_ICON[b.act]));
        b.el.title = { attack: ul('Attack', 'Atacar'), stop: ul('Stop', 'Parar'), hold: ul('Hold', 'Segurar') }[b.act];
      });
      for (const k of ['uhp', 'ump', 'ua', 'um', 'us', 'ud', 'uk']) delete ca[k];
    }
    if (U.kind === 'spirit' && U.team === 0) {   // key labels follow live rebinds
      const kk = R.ucmd.map(b => keyLab(b.act)).join('|');
      if (ca.uk !== kk) { ca.uk = kk; R.ucmd.forEach(b => { b.key.textContent = keyLab(b.act); }); }
    }
    const hk = Math.max(0, Math.round(U.hp)) + '/' + Math.round(U.maxHp);
    if (ca.uhp !== hk) { ca.uhp = hk; R.uhpt.textContent = hk; R.uhpf.style.width = (U.maxHp ? Math.max(0, U.hp / U.maxHp) * 100 : 0) + '%'; }
    const mmp = Math.round(U.maxMana || 0), mk = Math.max(0, Math.round(U.mana || 0)) + '/' + mmp;
    R.ump.style.display = mmp > 0 && !U.building ? '' : 'none';
    R.uhp.style.display = U.maxHp > 0 ? '' : 'none';   // fountain / shops: no hp
    const at = U.attack, dk = at && at.max > 0 ? (Math.round(at.min) === Math.round(at.max) ? String(Math.round(at.min)) : Math.round(at.min) + '-' + Math.round(at.max)) : '';
    R.udw.style.display = dk ? '' : 'none'; setText(R.ud, dk, ca, 'ud');
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

  // scenario HUD: countdown panel -> slim strip. Hidden when IT.Ranked.hud(w) is null.
  H.updRanked = function (R, ca, dt) {
    const rk = IT.Ranked && IT.Ranked.hud ? IT.Ranked.hud(H.c.w) : null;
    if (!rk) { if (ca.rk !== 0) { ca.rk = 0; ca.rkMode = null; R.rk.style.display = 'none'; R.top.classList.remove('rk'); } return; }
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
    rkMode(R, ca, !cd);
    if (cd) {
      setText(R.rkNum, String(Math.max(1, Math.ceil(rk.countdown || 0))), ca, 'rkcd');
      setText(R.rkHint, IT.hasT('rk.countdown.hint') ? IT.t('rk.countdown.hint') : IT.t('rk.countdown.hint.fb'), ca, 'rkhint');
    }
    setText(R.rkTv, fmtS(rk.timeLeft), ca, 'rkt'); R.rkTv.classList.toggle('low', rk.timeLeft != null && rk.timeLeft < 5);
    setText(R.rkRv, rk.cleared != null ? String(rk.cleared) : rk.turns != null ? rk.turn + '/' + rk.turns : fmtM(rk.runLeft), ca, 'rkr');
    setText(R.rkRl, IT.t(rk.cleared != null ? 'hud.rkCleared' : rk.turns != null ? 'hud.rkTurn' : 'hud.rkRun'), ca, 'rkrl');
    R.rkBadge.className = 'rkdiff d-' + rk.diff; R.rkBadge.title = rk.diffDesc || '';
    setText(R.rkBadge, IT.hasT('dtier.' + rk.diff) ? IT.t('dtier.' + rk.diff) : rk.diff, ca, 'rkdf');
    setText(R.rkSv, String(Math.round(rk.score || 0)), ca, 'rks');
    R.rkTm.style.display = rk.timeLeft == null ? 'none' : '';
    R.rkRn.style.display = rk.runLeft == null && rk.turns == null && rk.cleared == null ? 'none' : '';
    R.rkSc.style.display = rk.score == null ? 'none' : '';   // practice: no score
    setText(R.rkName, txt(rk.scenario), ca, 'rkname'); setText(R.rkObj, txt(rk.objective), ca, 'rkobj');
    // the strip drops the title: hovering the objective names the scenario (and gives the scenario tip)
    setTip(R.rkObj, [txt(rk.scenario), txt(rk.objective), txt(rk.tip)].filter(Boolean).join(' - '), ca, 'rktp');
    // scenario level, v5 map name, ranked twist (when present)
    const meta = [rk.level ? IT.t('hud.rkLevel', { n: rk.level }) : '', txt(rk.mapName), rk.twistName ? IT.t('hud.rkTwist') + ' ' + txt(rk.twistName) : ''].filter(Boolean).join('  |  ');
    setText(R.rkMeta, meta, ca, 'rkmeta'); R.rkMeta.style.display = meta ? '' : 'none';
    const hints = !!(rk.hints && S.hints), ord = !!S.comboOrder, def = H.c.w.combo && H.c.w.combo.def;
    const tk = rk.id + '|' + rk.n + '|' + (H.scnSeq || 0) + '|' + (def ? def.id : '');
    if (!H.trk || H.trk.key !== tk) { rkStartTracker(rk, tk); ca.rkCk = null; }   // new scenario / redo: restart step progress
    const ck = tk + '|' + IT.lang + '|' + (ord ? 1 : 0) + (hints ? 1 : 0) + '|' + chipSig(H.c.hero);
    if (ca.rkCk !== ck) {
      ca.rkCk = ck; ca.rkWl = null; R.rkStKey = null;
      rkBuildChips(R, rk, ord, hints);
      R.rkCombo.classList.toggle('ord', ord);
    }
    // win + lose lines: built once per scenario / language (not per frame; the key scheme does not touch them)
    const wk = tk + '|' + IT.lang;
    if (ca.rkWl !== wk) {
      ca.rkWl = wk;
      const sc = IT.SCENARIOS && IT.SCENARIOS.get ? IT.SCENARIOS.get(rk.id) : null, HS = IT.HudSteps;
      // lose: the scenario's own line (the 'method' rule in words) + the generic fail keys
      const gen = HS.loseKeys(sc, rk.timeLeft != null).filter(k => !(sc && sc.lose && k === 'method') && IT.hasT('f1.lose.' + k)).map(k => t('f1.lose.' + k));
      const win = sc && sc.win ? locT(sc.win) : '', lose = (sc && sc.lose ? [locT(sc.lose)] : []).concat(gen).filter(Boolean).join(', ');
      R.rkWin.textContent = win ? t('f1.win') + ' ' + win : '';
      R.rkLoseL.textContent = lose ? t('f1.lose') + ' ' + lose : '';
      R.rkWin.style.display = win ? '' : 'none'; R.rkLoseL.style.display = lose ? '' : 'none';
      R.rkInfo.style.display = win || lose ? '' : 'none';
    }
    if (ord) updChips(R);
  };

  // localized name of a map object (i18n 'map.<id>' first, then its own name table); '' when unknown
  H.mapLabel = function (map) {
    if (!map) return '';
    if (map.id && IT.hasT('map.' + map.id)) return IT.t('map.' + map.id);
    const n = map.name; return n == null ? '' : typeof n === 'object' ? (n[IT.lang] || n.en || '') : String(n);
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
      [...R.orbs.children].forEach((s, i) => { s.textContent = ''; const o = hero.inv.orbs[i]; s.className = 'os' + (o ? ' ' + ORBN[o] : ''); s.setAttribute('data-tip', o ? t('orb.' + ORBN[o]) : ''); if (o) s.appendChild(IT.UI.icon(ORBN[o])); });
    }
    const eff = hero.ctx.eff;
    for (const [b, k, a] of [[R.q, 'quas', 'orbQ'], [R.w, 'wex', 'orbW'], [R.e, 'exort', 'orbE']]) {
      setText(b.lvl, String(eff[k]), ca, 'l' + k);
      setText(b.key, S.label(S.keyOf(a)), ca, 'k' + k);
      b.el.classList.toggle('dim', eff[k] <= 0);
      setTip(b.el, t('orb.' + k) + ' - ' + t('hud.lvl', { n: eff[k] }), ca, 'tp' + k);
    }
    // invoke
    const icd = hero.inv.invokeCd || 0;
    if (icd > (H.cdMax.invoke || 0)) H.cdMax.invoke = icd;
    if (icd <= 0) H.cdMax.invoke = 0;
    setCd(R.r, icd, H.cdMax.invoke, ca, 'r');
    setTip(R.r.el, nmOf('invoke') + ' - ' + stOf(icd, 0), ca, 'tpr');
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
      setTip(b.el, id ? nmOf(id) + ' - ' + stOf(cd, d ? d.manaCost(w, hero) : 0) : '', ca, 'tps' + i);
      setText(b.key, id && legacy ? S.label(S.data.keys.legacy[id]) : S.label(S.keyOf('slot' + (i + 1))), ca, 'ks' + i);
      setText(b.lvl, '', ca, 'ls' + i);
      const rr = i ? R.rec2 : R.rec1;   // recipe orbs under the slot icon (rebuilt only when the spell in the slot changes)
      if (ca['rs' + i] !== id) {
        ca['rs' + i] = id; rr.textContent = '';
        const rec = id && IT.GAME.SPELL_ORBS[id];
        if (rec) for (const o of recipeOrbs(rec)) rr.appendChild(o);
      }
    });
    // recipe strip: tips (names + bound keys) refreshed on language / rebinding, 'on' = currently invoked
    const rsig = IT.lang + '|' + ['orbQ', 'orbW', 'orbE', 'invoke'].map(a => S.label(S.keyOf(a))).join('');
    if (ca.recs !== rsig) {
      ca.recs = rsig;
      for (const c of R.recs.cells) c.el.setAttribute('data-tip', nmOf(c.id) + ' - ' + recKeys(c.rec) + ' + ' + keyLab('invoke'));
    }
    const rin = hero.inv.slots.join(',');
    if (ca.recIn !== rin) { ca.recIn = rin; for (const c of R.recs.cells) c.el.classList.toggle('on', hero.inv.slots.includes(c.id)); }
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
      setTip(b.el, id ? nmOf(id) + ' - ' + stOf(cd, d && d.manaCost ? d.manaCost(w, hero) : 0) : '', ca, 'tpi' + i);
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
    const sel = IT.Input.selectedUnit ? IT.Input.selectedUnit(w) : IT.Input.selected != null ? w.get(IT.Input.selected) : null, U = sel && sel !== hero && !sel.dead ? sel : null;
    const um = U ? U.id : null;
    if (ca.umode !== um) {
      ca.umode = um; ca.uid = null;
      R.bar.style.display = U ? 'none' : ''; R.ubar.style.display = U ? '' : 'none'; R.orbcol.style.display = U ? 'none' : '';
    }
    if (U) H.updUnit(U, R, ca, w);
    if (R.mapLine) { const mn = H.mapLabel(w.map); setText(R.mapLine, mn ? t('hud.map') + ': ' + mn : '', ca, 'mapl'); R.mapLine.style.display = mn ? '' : 'none'; }
    // ranked panel
    H.updRanked(R, ca, dt);
    H.updHood(R, ca, w.loadout || {}, dt);
    // orbs (a status) sit centred over the ability row; other statuses take slots to their right
    const lk = innerWidth + 'x' + innerHeight + ':' + (U ? 1 : 0);
    if (ca.statPos !== lk && R.bar.offsetParent) {
      const ab = R.q.el.parentNode.getBoundingClientRect(), rt = R.stat.parentNode.getBoundingClientRect(), ow = R.orbs.getBoundingClientRect().width;
      if (ab.width && ow) { ca.statPos = lk; R.stat.style.left = Math.round(ab.left + ab.width / 2 - ow / 2 - rt.left) + 'px'; }
    }
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
    if (R.dpsN) H.updSide(dt, w, hero, ca);
    if (H.statsOn) { H.accT += dt; if (H.accT > 0.4) { H.accT = 0; H.buildLive(); } }
    if (IT.ComboBar) IT.ComboBar.update(dt);
    if (IT.DummyChat && IT.DummyChat.update) IT.DummyChat.update(dt);
  };
  H.resetMeter = function () { H.dps = []; H.total = 0; };

  IT.HUD = H;
})(typeof window !== 'undefined' ? window : globalThis);
