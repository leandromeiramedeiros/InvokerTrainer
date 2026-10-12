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
  // "any target unit" (scarecrow dummy or NPC enemy hero); guarded so the HUD still loads without IT.Units
  const foe = e => !!e && (IT.Units && IT.Units.isFoe ? IT.Units.isFoe(e) : e.kind === 'dummy' || e.kind === 'enemy');
  const T = (k, v) => IT.t(k, v);
  const loc = o => (o && typeof o === 'object' ? o[IT.lang] || o.en || '' : o == null ? '' : String(o));
  const keyLab = a => { const S = IT.Settings; return S.label(S.keyOf(a)); };
  const hudMode = () => { const m = IT.Settings && IT.Settings.get ? IT.Settings.get().hudMode : null; return m === 'minimal' || m === 'steps' ? m : 'default'; };
  const DIFF_ALIAS = { ianzinho: 'ian', normal: 'common' };
  const diffId = id => DIFF_ALIAS[id] || id;

  // ---------------------------------------------------------------- live tooltips (F5)
  // Elements get `_tip = () => text|null`; hovering copies it to data-tip (the global #tip toast shows it), H.update keeps the visible text fresh.
  function tipOf(el, fn) { el._tip = fn; el.classList.add('tp'); return el; }
  function tipText(fn) { try { return fn() || ''; } catch (e) { return ''; } }
  function cdLine(cd) { return cd > 0 ? T('tip.cdLeft', { n: cd >= 10 ? Math.ceil(cd) : cd.toFixed(1) }) : T('tip.ready'); }
  function spellTip(id) {
    const c = H.c, out = [T('spell.' + id)];
    if (IT.hasT('spelld.' + id)) out.push(T('spelld.' + id));
    const rec = IT.GAME.SPELL_ORBS[id];
    if (rec) out.push(T('tip.recipe', { r: rec.split('').map(ch => keyLab('orb' + ch)).join(' ') + ' + ' + keyLab('invoke') }));
    if (c) {
      const hero = c.hero, at = hero.inv.slots.indexOf(id), d = IT.Abilities && IT.Abilities.get(id);
      if (at < 0) out.push(T('tip.notInvoked'));
      else out.push(T('tip.invoked') + ' - ' + cdLine(hero.cd[id] || 0));
      if (d) { const mc = d.manaCost(c.w, hero); out.push(T('tip.manaCost', { n: Math.round(mc) }) + (hero.mana < mc ? ' - ' + T('tip.lowMana') : '')); }
    }
    return out.join('\n');
  }
  function itemTip(id, it) {
    const c = H.c, out = [T('item.' + id)];
    if (IT.hasT('itemd.' + id)) out.push(T('itemd.' + id));
    const d = IT.Abilities && IT.Abilities.get && IT.Abilities.get(id);
    if (it) out.push(cdLine(it.cd || 0));
    if (c && d && d.manaCost) { const mc = d.manaCost(c.w, c.hero); if (mc > 0) out.push(T('tip.manaCost', { n: Math.round(mc) }) + (c.hero.mana < mc ? ' - ' + T('tip.lowMana') : '')); }
    if (it && it.charges > 0 && id !== 'bkb') out.push(T('tip.charges', { n: it.charges }));
    return out.join('\n');
  }
  function orbTip(name) {
    const c = H.c, out = [T('orb.' + name)];
    if (IT.hasT('orbd.' + name)) out.push(T('orbd.' + name));
    if (c) out.push(T('tip.orbLevel', { n: c.hero.ctx.eff[name] }));
    return out.join('\n');
  }
  function statusTip(s, w) {
    const nm = IT.hasT('status.' + s.type) ? T('status.' + s.type) : s.type, out = [nm];
    if (IT.hasT('statusd.' + s.type)) out.push(T('statusd.' + s.type));
    const rem = Math.max(0, s.until - w.t); out.push(T('tip.remaining', { n: rem >= 10 ? Math.ceil(rem) : rem.toFixed(1) }));
    return out.join('\n');
  }
  function bindTips(off) {
    const mv = ev => {
      let n = ev.target, el = null;
      while (n && n !== document && n.nodeType === 1) { if (n._tip) { el = n; break; } n = n.parentNode; }
      H.hov = el;
      if (el) { const tx = tipText(el._tip); if (tx) el.setAttribute('data-tip', tx); else el.removeAttribute('data-tip'); }
    };
    window.addEventListener('mousemove', mv, true); window.addEventListener('mouseover', mv, true);
    off.push(() => { window.removeEventListener('mousemove', mv, true); window.removeEventListener('mouseover', mv, true); H.hov = null; });
  }
  function refreshTip() {   // live text (cooldown ticking) while the pointer rests on a tip element
    const el = H.hov; if (!el || !el.isConnected || !el._tip) return;
    const tx = tipText(el._tip), cur = el.getAttribute('data-tip') || '';
    if (tx === cur) return;
    if (tx) el.setAttribute('data-tip', tx); else el.removeAttribute('data-tip');
    const tp = document.getElementById('tip');
    if (tp && tp.style.display === 'block' && tx) tp.textContent = tx;
  }

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

  // bottom bar for a selected non-hero unit (Dota-style inspect): portrait, name, behaviour / aware badges, bars, armor/MR/speed, 6 items with cooldowns
  function unitBar(R) {
    const { h } = IT.UI, t = IT.t;
    R.upor = h('div', { class: 'hpor' });
    R.uname = h('div', { class: 'uname' });
    R.ubeh = h('span', { class: 'ubadge beh' }); R.uaw = h('span', { class: 'ubadge aw' });
    R.uhp = h('div', { class: 'bar hp' }, R.uhpf = h('i'), R.uhpt = h('span'));
    R.ump = h('div', { class: 'bar mp' }, R.umpf = h('i'), R.umpt = h('span'));
    R.ua = h('b'); R.um = h('b'); R.us = h('b');
    R.ustats = h('div', { class: 'ustats' }, h('span', {}, t('hud.armor') + ' ', R.ua), h('span', {}, t('hud.mres') + ' ', R.um), h('span', {}, t('hud.ms') + ' ', R.us));
    R.uitems = [0, 1, 2, 3, 4, 5].map(() => btnEl('item', null));
    R.uitemsBox = h('div', { class: 'hitems' }, R.uitems.map(b => b.el));
    tipOf(R.uhp, () => { const U = H.unit; return U ? T('stat.hp') + ' ' + Math.max(0, Math.round(U.hp)) + '/' + Math.round(U.maxHp) : null; });
    tipOf(R.ump, () => { const U = H.unit; return U ? T('stat.mana') + ' ' + Math.max(0, Math.round(U.mana || 0)) + '/' + Math.round(U.maxMana || 0) : null; });
    tipOf(R.ustats, () => T('tip.unitStats'));
    tipOf(R.ubeh, () => { const U = H.unit, b = U && behOf(U); return b ? T('tip.behavior', { b: behLabel(b) }) + '\n' + (IT.hasT('behd.' + b) ? T('behd.' + b) : '') : null; });
    tipOf(R.uaw, () => { const U = H.unit; return U ? T(U.aware ? 'tip.aware' : 'tip.unaware') : null; });
    R.uitems.forEach((b, i) => tipOf(b.el, () => { const U = H.unit, it = U && U.items && U.items[i]; if (!it) return null; const id = typeof it === 'string' ? it : it.id; return itemTip(id, { cd: unitItemCd(U, it, id), charges: 0 }); }));
    return h('div', { class: 'hudp hbar hunit', style: { display: 'none' } },
      R.upor,
      h('div', { class: 'hmid' }, h('div', { class: 'urow' }, R.uname, R.ubeh, R.uaw), h('div', { class: 'bars' }, R.uhp, R.ump), R.ustats),
      R.uitemsBox);
  }
  const behOf = U => (U.kind === 'enemy' || U.kind === 'dummy') ? (U.behavior || (U.ai && U.ai.behavior) || (U.kind === 'dummy' ? 'stationary' : null)) : null;
  const behLabel = b => (IT.hasT('beh.' + b) ? T('beh.' + b) : b);
  const unitItemCd = (U, it, id) => (typeof it === 'object' && it.cd > 0 ? it.cd : (U.cd && U.cd[id]) || 0);
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
    for (let i = ps.length - 1; i >= 0; i--) if (ps[i].life >= ps[i].max || ps[i].y >= HH || ps[i].x < -2 || ps[i].x > HW + 2) ps.splice(i, 1);
    const cx = el._pt.getContext('2d');
    cx.clearRect(0, 0, HW, HH);
    for (const p of ps) { cx.globalAlpha = Math.min(1, 3 * (1 - p.life / p.max)) * 0.85; cx.fillStyle = p.c; cx.fillRect(p.x | 0, p.y | 0, 1, 1); }
    cx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- Aghanim's Hood picker (loadout, F3)
  // Reuses the hood art: Wex top, Quas left, Exort right. Click an orb: 1st = Scepter on it (+1 level), 2nd = Shard on it
  // (Quas Ghost Walk, Wex EMP, Exort Sun Strike). With both chosen, clicking an orb removes what it holds; a neutral orb takes the Shard.
  const SPELL_OF_ORB = { quas: 'ghostwalk', wex: 'emp', exort: 'sunstrike' };
  H.hoodClick = function (lo, orb) {
    if (lo.scepter && !lo.scepterOrb) lo.scepter = false;
    if (lo.shard && !lo.shardSpell) lo.shard = false;
    const sc = !!lo.scepter, sh = !!lo.shard;
    const hs = sc && lo.scepterOrb === orb, hh = sh && SHARD_ORB[lo.shardSpell] === orb;
    const setSc = o => { lo.scepter = true; lo.scepterOrb = o; }, clrSc = () => { lo.scepter = false; lo.scepterOrb = null; };
    const setSh = o => { lo.shard = true; lo.shardSpell = SPELL_OF_ORB[o]; }, clrSh = () => { lo.shard = false; lo.shardSpell = null; };
    if (!sc) { setSc(orb); return 'scepter'; }
    if (!sh) { setSh(orb); return 'shard'; }
    if (hs && hh) { clrSc(); clrSh(); return 'clear'; }
    if (hs) { clrSc(); return 'clear'; }
    if (hh) { clrSh(); return 'clear'; }
    setSh(orb); return 'shard';
  };
  // grains fly out of the clicked socket in the gem colours
  function hoodBurst(el, orb, n) {
    const pal = GEM_PAL[orb], [ox, oy] = HOOD_ORB[orb], ps = el._parts;
    for (let i = 0; i < n && ps.length < 70; i++) {
      const a = Math.random() * Math.PI * 2, sp = 6 + Math.random() * 16;
      ps.push({ x: ox + Math.cos(a) * 2, y: oy + Math.sin(a) * 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4, life: 0, max: 0.55 + Math.random() * 0.6, c: Math.random() < 0.4 ? pal.h : pal.m });
    }
  }
  H.hoodPicker = function (lo, onChange) {
    const { h, icon } = IT.UI, t = IT.t;
    const hood = hoodEl(), ca = {}, socks = {};
    const stage = h('div', { class: 'hpstage' }, hood);
    const cap = h('div', { class: 'hpcap' }), hint = h('div', { class: 'fine hphint', text: t('hood.hint') });
    const clear = h('button', { type: 'button', class: 'mini hpclear', text: t('hood.clear'), onclick: () => { lo.scepter = false; lo.scepterOrb = null; lo.shard = false; lo.shardSpell = null; if (onChange) onChange('clear'); refresh(); } });
    let raf = 0, last = 0, miss = 0;
    const loop = ts => {
      raf = 0;
      if (!stage.isConnected) { if (++miss > 120) return; raf = requestAnimationFrame(loop); return; }
      miss = 0;
      const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0.016; last = ts;
      H.updHood({ hood }, ca, lo, dt);
      raf = requestAnimationFrame(loop);
    };
    const ensure = () => { if (!raf && typeof requestAnimationFrame === 'function') { miss = 0; last = 0; raf = requestAnimationFrame(loop); } };
    for (const n of ['wex', 'quas', 'exort']) {
      const [x, y] = HOOD_ORB[n];
      socks[n] = h('button', {
        type: 'button', class: 'hpsock ' + n, style: { left: (x / HW * 100) + '%', top: (y / HH * 100) + '%' },
        onclick: () => { const r = H.hoodClick(lo, n); if (r !== 'clear') hoodBurst(hood, n, 26); if (onChange) onChange(r, n); refresh(); },
      });
      stage.appendChild(socks[n]);
    }
    function refresh() {
      const so = lo.scepter ? lo.scepterOrb : null, sp = lo.shard ? lo.shardSpell : null, sh = sp ? SHARD_ORB[sp] : null;
      for (const n in socks) {
        socks[n].classList.toggle('hs', so === n); socks[n].classList.toggle('hh', sh === n);
        const hold = so === n ? (sh === n ? 'both' : 'scepter') : sh === n ? 'shard' : 'none';
        socks[n].setAttribute('data-tip', t('orb.' + n) + '\n' + t('hood.tip.' + hold, { spell: t('spell.' + SPELL_OF_ORB[n]) }));
      }
      cap.textContent = '';
      cap.appendChild(h('div', { class: 'hpl' + (so ? ' on' : '') }, icon('scepter', 'mini'), h('b', { text: t('item.scepter') }), h('span', { text: so ? t('orb.' + so) + ' +1' : t('hood.none') })));
      cap.appendChild(h('div', { class: 'hpl' + (sp ? ' on' : '') }, icon('shard', 'mini'), h('b', { text: t('item.shard') }), h('span', { text: sp ? t('spell.' + sp) : t('hood.none') })));
      clear.style.visibility = so || sp ? '' : 'hidden';
      ensure();
    }
    refresh();
    const el = h('div', { class: 'hoodpick' }, h('div', { class: 'hprow' }, stage, h('div', { class: 'hpside' }, cap, clear)), hint);
    el.refresh = refresh;
    return el;
  };

  // ---------------------------------------------------------------- scenario panel (F1)
  // Top-centre panel for a scenario run (hidden unless IT.Ranked.hud(w) returns an object). Setting `hudMode`:
  //   minimal = scenario brief + skill/item/attack/move icons;  default = bigger skill cards (name + orb keys);
  //   steps   = default + a timeline of key presses (orbs, invoke, cast / item / attack / move) that flashes and falls away when done.
  // Every mode shows a short explanation plus WIN / LOSE lines.
  const ORB_OF = { Q: 'quas', W: 'wex', E: 'exort' };
  function scenarioPanel(R) {
    const { h } = IT.UI, t = IT.t;
    R.rkNum = h('div', { class: 'rknum' });
    R.rkName = h('b', { class: 'rkname' }); R.rkFlair = h('span', { class: 'rkflair' }); R.rkObj = h('span', { class: 'rkobj' });
    R.rkDiff = h('span', { class: 'rkdiff' });
    R.rkWinT = h('span'); R.rkLoseT = h('span');
    R.rkWin = h('div', { class: 'rkw win' }, h('i', { text: t('hud.rkWin') }), R.rkWinT);
    R.rkLose = h('div', { class: 'rkw lose' }, h('i', { text: t('hud.rkLose') }), R.rkLoseT);
    R.rkCombo = h('div', { class: 'rkcombo' });
    R.rkTl = h('div', { class: 'rktl' });
    R.rkTv = h('b'); R.rkRv = h('b'); R.rkSv = h('b'); R.rkMed = h('span', { class: 'rkmed' });
    R.rkTm = h('div', { class: 'rkt tm' }, h('span', { text: t('hud.rkTime') }), R.rkTv);
    R.rkRn = h('div', { class: 'rkt' }, h('span', { text: t('hud.rkRun') }), R.rkRv);
    R.rkSc = h('div', { class: 'rkt sc' }, h('span', { text: t('hud.score') }), R.rkSv, R.rkMed);
    R.rkRow = h('div', { class: 'rkrow' }, R.rkTm, R.rkSc, R.rkRn);
    tipOf(R.rkDiff, () => { const id = diffId(H.cache.rkDiffId); if (!id) return null; const d = IT.DIFFICULTY && IT.DIFFICULTY.get ? IT.DIFFICULTY.get(id) : null; return T('diff.' + id) + '\n' + (loc(d && d.desc) || (IT.hasT('diff.' + id + '.d') ? T('diff.' + id + '.d') : '')); });
    tipOf(R.rkWin, () => T('tip.win')); tipOf(R.rkLose, () => T('tip.lose'));
    tipOf(R.rkTm, () => T('tip.timeLeft')); tipOf(R.rkRn, () => T('tip.runLeft')); tipOf(R.rkSc, () => T('tip.score'));
    tipOf(R.rkName, () => T('tip.scenario'));
    return h('div', { class: 'rkp', style: { display: 'none' } }, R.rkNum,
      h('div', { class: 'rkscen' }, h('div', { class: 'rkhd' }, R.rkName, R.rkDiff), R.rkFlair, R.rkObj),
      h('div', { class: 'rkwl' }, R.rkWin, R.rkLose), R.rkCombo, R.rkTl, R.rkRow);
  }
  // result of run.steps(): array of steps, or { steps|list, idx|index|cur } -> { list, states } (states null when it carries no progress info)
  function normSteps(src) {
    if (!src) return null;
    const list = Array.isArray(src) ? src : (src.steps || src.list);
    if (!Array.isArray(list)) return null;
    const idx = Array.isArray(src) ? undefined : [src.idx, src.index, src.cur, src.current, src.i].find(v => typeof v === 'number');
    let states = null;
    if (idx != null) states = list.map((s, i) => (i < idx ? 'done' : i === idx ? 'now' : 'todo'));
    else if (list.some(s => s && (s.done != null || s.state != null || s.status != null))) {
      let seenNow = false;
      states = list.map(s => {
        const d = s && (s.done === true || s.state === 'done' || s.status === 'done');
        if (d) return 'done';
        if (!seenNow) { seenNow = true; return 'now'; }
        return 'todo';
      });
    }
    return { list, states };
  }
  // ordered actions of the running combo / scenario: [{ k:'spell'|'item'|'attack'|'move'|'pos', id, label }]
  function scnSteps(rk, sc) {
    const w = H.c.w, GM = IT.GAME, out = [];
    const push = (a, label) => {
      if (a === 'attack' || a === 'move') out.push({ k: a, label });
      else if (a === 'pos') out.push({ k: 'pos', label });
      else if (typeof a === 'string' && GM.SPELL_ORBS[a]) out.push({ k: 'spell', id: a, label });
      else if (typeof a === 'string' && (GM.ITEM_DOTA[a] || hasIcon(a))) out.push({ k: 'item', id: a, label });
    };
    const def = w.combo && w.combo.def;
    if (def) {
      for (const s of def.steps) {
        if (s.ability) push(s.ability);
        else if (s.type === 'attack' || s.type === 'move') push(s.type);
        else if (s.type === 'position') push('pos');
      }
      return out;
    }
    let src = null;
    const run = w.ranked;
    if (run && typeof run.steps === 'function') { try { const n = normSteps(run.steps()); if (n) src = n.list; } catch (e) { /* ignore */ } }
    if (!src) src = sc && sc.steps && sc.steps.length ? sc.steps : sc && sc.sol;
    for (const s of src || []) if (s) push(s.a != null ? s.a : s.ability, s.label);
    return out;
  }
  const orbChip = ch => { const { h, icon } = IT.UI; return h('span', { class: 'tk orb ' + ORB_OF[ch] }, icon(ORB_OF[ch], 'mini'), h('b', { text: keyLab('orb' + ch) })); };
  // shortest orb presses (<= 3) that leave the 3-orb queue holding exactly the recipe
  function planOrbs(orbs, recipe) {
    const want = recipe.split('').sort().join(''), ok = q => q.length === 3 && q.slice().sort().join('') === want;
    for (let k = 0; k <= 3; k++) {
      const rs = recipe.split('');
      if (k === 3 && ok(rs)) return { seq: rs, q: rs };
      for (let m = 0; m < Math.pow(3, k); m++) {
        const seq = []; let x = m; for (let i = 0; i < k; i++) { seq.push('QWE'[x % 3]); x = Math.floor(x / 3); }
        const q = orbs.concat(seq).slice(-3);
        if (ok(q)) return { seq, q };
      }
    }
    return { seq: recipe.split(''), q: recipe.split('') };
  }
  function badgeBox(kind) { const { h } = IT.UI; return h('div', { class: 'rka badge ' + kind }, h('b', { text: T(kind === 'attack' ? 'hud.rkAtk' : kind === 'move' ? 'hud.rkMov' : 'hud.rkPos') })); }
  function actTip(a) {
    if (a.k === 'spell') return () => spellTip(a.id);
    if (a.k === 'item') return () => { const it = H.c.hero.items.find(x => x && x.id === a.id); return itemTip(a.id, it); };
    return () => T('tip.step.' + a.k);
  }
  const dedupe = acts => { const seen = new Set(); return acts.filter(a => (a.k === 'spell' || a.k === 'item') && !seen.has(a.id) && seen.add(a.id)); };
  // minimal: icons only (recipe letters under spells when hints are on)
  function buildIcons(R, acts, ord, hints) {
    const { h, icon } = IT.UI;
    R.rkCombo.textContent = '';
    if (!ord) acts = dedupe(acts);
    acts.forEach((a, i) => {
      if (ord && i) R.rkCombo.appendChild(h('i', { class: 'rkar' }));
      let box;
      if (a.k === 'spell' || a.k === 'item') {
        box = h('div', { class: 'rka ' + a.k }, hasIcon(a.id) ? icon(a.id) : h('b', { text: String(a.id).slice(0, 3).toUpperCase() }));
        if (hints && a.k === 'spell') box.appendChild(h('em', { class: 'rkrec', text: IT.GAME.SPELL_ORBS[a.id] || '' }));
      } else box = badgeBox(a.k);
      tipOf(box, actTip(a));
      R.rkCombo.appendChild(box);
    });
    R.rkCombo.style.display = acts.length ? '' : 'none';
  }
  // default / steps: skill cards (big icon, name, orb keys / item key)
  function buildCards(R, acts, ord, hints) {
    const { h, icon } = IT.UI;
    R.rkCombo.textContent = '';
    if (!ord) acts = dedupe(acts);
    const hero = H.c.hero;
    acts.forEach((a, i) => {
      if (ord && i) R.rkCombo.appendChild(h('i', { class: 'rkar' }));
      let card;
      if (a.k === 'spell') {
        const rec = IT.GAME.SPELL_ORBS[a.id] || '';
        card = h('div', { class: 'rkc spell' }, icon(a.id), h('div', { class: 'rkcm' }, h('b', { class: 'rkcn', text: T('spell.' + a.id) }),
          hints ? h('span', { class: 'rkok' }, rec.split('').map(orbChip), h('i', { class: 'rkpl', text: '+' }), h('span', { class: 'tk inv' }, icon('invoke', 'mini'), h('b', { text: keyLab('invoke') }))) : null));
      } else if (a.k === 'item') {
        const slot = hero.items.findIndex(x => x && x.id === a.id);
        card = h('div', { class: 'rkc item' }, hasIcon(a.id) ? icon(a.id) : h('b', { text: String(a.id).slice(0, 3).toUpperCase() }),
          h('div', { class: 'rkcm' }, h('b', { class: 'rkcn', text: IT.hasT('item.' + a.id) ? T('item.' + a.id) : a.id }), slot >= 0 ? h('span', { class: 'rkok' }, h('span', { class: 'tk key' }, h('b', { text: keyLab('item' + (slot + 1)) }))) : null));
      } else {
        card = h('div', { class: 'rkc badge ' + a.k }, badgeBox(a.k), h('div', { class: 'rkcm' }, h('b', { class: 'rkcn', text: T(a.k === 'attack' ? 'step.attack' : a.k === 'move' ? 'step.move' : 'step.pos') })));
      }
      tipOf(card, actTip(a));
      R.rkCombo.appendChild(card);
    });
    R.rkCombo.style.display = acts.length ? '' : 'none';
  }
  // steps: one group per press sequence
  function buildTimeline(R, list, sc) {
    const { h, icon } = IT.UI, S = IT.Settings, hero = H.c.hero, GM = IT.GAME;
    R.rkTl.textContent = ''; R.rkTls = [];
    const sim = { orbs: (hero.inv.orbs || []).slice(), slots: (hero.inv.slots || []).slice(0, 2) };
    for (const s of (sc && sc.hero && sc.hero.preinvoked) || []) if (s && !sim.slots.includes(s)) sim.slots = [s, sim.slots[0]];
    const legacy = S.data.scheme === 'legacy';
    list.forEach((s, i) => {
      const kids = [];
      if (s.k === 'spell') {
        let at = sim.slots.indexOf(s.id);
        if (at < 0) {
          const p = planOrbs(sim.orbs, GM.SPELL_ORBS[s.id]);
          for (const ch of p.seq) kids.push(orbChip(ch));
          sim.orbs = p.q;
          kids.push(h('span', { class: 'tk inv' }, icon('invoke', 'mini'), h('b', { text: keyLab('invoke') })));
          sim.slots = [s.id, sim.slots[0]]; at = 0;
        }
        kids.push(h('span', { class: 'tk cast' }, icon(s.id, 'mini'), h('b', { text: legacy ? S.label(S.data.keys.legacy[s.id]) : keyLab('slot' + (at + 1)) })));
      } else if (s.k === 'item') {
        const slot = hero.items.findIndex(x => x && x.id === s.id);
        kids.push(h('span', { class: 'tk item' }, hasIcon(s.id) ? icon(s.id, 'mini') : null, h('b', { text: slot >= 0 ? keyLab('item' + (slot + 1)) : '?' })));
      } else kids.push(h('span', { class: 'tk badge ' + s.k }, h('b', { text: T(s.k === 'attack' ? 'hud.rkAtk' : s.k === 'move' ? 'hud.rkMov' : 'hud.rkPos') })));
      const lab = s.label ? loc(s.label) : '';
      const el = h('div', { class: 'tls todo' }, h('em', { class: 'tln', text: String(i + 1) }), h('div', { class: 'tlk' }, kids), lab ? h('span', { class: 'tll', text: lab }) : null);
      tipOf(el, () => T('tip.stepN', { n: i + 1 }) + '\n' + (s.k === 'spell' || s.k === 'item' ? T((s.k === 'spell' ? 'spell.' : 'item.') + s.id) : T('tip.step.' + s.k)));
      R.rkTl.appendChild(el); R.rkTls.push(el);
    });
    R.rkTl.style.display = list.length ? '' : 'none';
  }
  function loseText(sc) {
    if (sc.lose) return loc(sc.lose);
    const fail = Array.isArray(sc.fail) && sc.fail.length ? sc.fail : [sc.obj && sc.obj.type === 'escape' ? 'caught' : null, 'time'];
    return fail.filter(f => f && IT.hasT('lose.' + f)).map(f => T('lose.' + f)).join('; ');
  }
  function buildScenario(R, rk, sc, hm, ord, hints) {
    R.rk.className = 'rkp m-' + hm;
    R.rkFlair.textContent = loc(sc.flair); R.rkFlair.style.display = sc.flair ? '' : 'none';
    R.rkObj.textContent = loc(sc.desc) || loc(sc.tip) || loc(rk.objective);
    R.rkWinT.textContent = loc(sc.win) || loc(sc.goal) || loc(rk.objective);
    R.rkLoseT.textContent = loseText(sc);
    R.rkLose.style.display = R.rkLoseT.textContent ? '' : 'none';
    const list = scnSteps(rk, sc);
    H.trk = { list, idx: 0 };
    if (hm === 'minimal') buildIcons(R, list, ord, hints); else buildCards(R, list, ord, hints);
    R.rkCombo.classList.toggle('ord', ord);
    if (hm === 'steps' && hints !== false) buildTimeline(R, list, sc); else { R.rkTl.textContent = ''; R.rkTls = []; R.rkTl.style.display = 'none'; }
  }
  // advance the fallback progress tracker (used when run.steps() carries no progress)
  function trkAdvance(pred) {
    const tr = H.trk; if (!tr) return;
    for (let j = tr.idx; j < Math.min(tr.list.length, tr.idx + 3); j++) if (pred(tr.list[j])) { tr.idx = j + 1; return; }
  }
  function stepStates(n) {
    const run = H.c.w.ranked;
    if (run && typeof run.steps === 'function') {
      try { const ns = normSteps(run.steps()); if (ns && ns.states && ns.states.length === n) return ns.states; } catch (e) { /* ignore */ }
    }
    const idx = H.trk ? H.trk.idx : 0;
    return Array.from({ length: n }, (_, i) => (i < idx ? 'done' : i === idx ? 'now' : 'todo'));
  }
  // flash a finished step, then let it fall away
  function updTimeline(R, dt) {
    if (!R.rkTls || !R.rkTls.length) return;
    const st = stepStates(R.rkTls.length);
    R.rkTls.forEach((el, i) => {
      if (el._gone) return;
      if (st[i] === 'done' && !el._done) { el._done = true; el._tt = 0; el.className = 'tls done flash'; }
      else if (!el._done) { const c = 'tls ' + (st[i] === 'now' ? 'now' : 'todo'); if (el.className !== c) el.className = c; }
      if (el._tt != null) {
        el._tt += dt;
        if (el._tt > 0.4 && !el._fall) { el._fall = true; el.classList.add('fall'); }
        if (el._tt > 1.1) { el._gone = true; el._tt = null; el.classList.add('gone'); }
      }
    });
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
    // hover tooltips (F5)
    tipOf(R.por, () => T('tip.hero', { lvl: ctx.hero.ctx.heroLevel }));
    tipOf(R.hp, () => T('stat.hp') + ' ' + Math.max(0, Math.round(ctx.hero.hp)) + '/' + Math.round(ctx.hero.maxHp));
    tipOf(R.mp, () => T('stat.mana') + ' ' + Math.max(0, Math.round(ctx.hero.mana)) + '/' + Math.round(ctx.hero.maxMana));
    for (const [b, n] of [[R.q, 'quas'], [R.w, 'wex'], [R.e, 'exort']]) tipOf(b.el, () => orbTip(n));
    tipOf(R.r.el, () => { const cd = ctx.hero.inv.invokeCd || 0; return T('spell.invoke') + '\n' + T('tip.invoke') + '\n' + cdLine(cd); });
    [R.s1, R.s2].forEach((b, i) => tipOf(b.el, () => { const id = ctx.hero.inv.slots[i]; return id ? spellTip(id) : T('tip.slotEmpty', { n: i + 1 }); }));
    R.items.forEach((b, i) => tipOf(b.el, () => { const it = ctx.hero.items[i]; return it ? itemTip(it.id, it) : T('lo.itemSlotN', { n: i + 1 }); }));
    tipOf(R.hood, () => {
      const lo = ctx.w.loadout || {};
      const so = lo.scepter ? lo.scepterOrb : null, sp = lo.shard ? lo.shardSpell : null;
      return T('hood.title') + '\n' + T('item.scepter') + ': ' + (so ? T('orb.' + so) + ' +1' : T('hood.none')) + '\n' + T('item.shard') + ': ' + (sp ? T('spell.' + sp) : T('hood.none'));
    });
    R.bar = h('div', { class: 'hudp hbar' },
      R.por,
      h('div', { class: 'hmid' },
        h('div', { class: 'bars' }, R.hp, R.mp),
        h('div', { class: 'abrow' }, R.q.el, R.w.el, R.e.el, R.r.el, h('i', { class: 'sep' }), R.s1.el, R.s2.el)),
      R.hood,
      h('div', { class: 'hitems' }, R.items.map(b => b.el)));
    R.ubar = unitBar(R);
    R.buffs = h('div', { class: 'hbuffs' });
    tipOf(R.orbs, () => { const o = ctx.hero.inv.orbs; return T('tip.orbsActive') + ': ' + (o.length ? o.map(x => T('orb.' + ORBN[x])).join(', ') : T('hood.none')); });
    R.orbcol = h('div', { class: 'horbcol' }, R.orbs);
    R.stat = h('div', { class: 'hstat' }, R.orbcol, R.buffs);   // orbs + status icons float above the hero bar
    R.aim = h('div', { class: 'aimhint', text: t('hud.aimHint') });
    R.rk = scenarioPanel(R);
    R.top = h('div', { class: 'htop' }, R.rk);   // top-centre stack: ranked panel, then combo bar

    // --- sandbox panel: DPS, cooldown refresh, Free Play tools (place dummy / spawn enemy), combo list
    if (ctx.mode === 'sandbox') {
      const free = !ctx.w.ranked;
      R.dpsN = h('b', { class: 'dpsn', text: '0' }); R.totN = h('b', { class: 'totn', text: '0' });
      const LS = () => IT.UI.LoadoutScreen;
      const miss = () => IT.UI.toast(t('hud.noApi'), 'warn');
      const mk = (cls, label, key, fn, tip) => { const b = h('button', { type: 'button', class: 'mini ' + cls, onclick: fn, text: label + (key ? ' [' + keyLab(key) + ']' : '') }); return tipOf(b, () => T(tip)); };
      const bRef = mk('refresh', t('hud.refresh'), 'refresh', () => In.hooks.refresh && In.hooks.refresh(), 'tip.refresh');
      const bRes = mk('reset', t('hud.resetDummies'), 'resetDummies', () => In.hooks.resetDummies && In.hooks.resetDummies(), 'tip.resetDummies');
      const bPlace = mk('place', t('hud.placeDummy'), 'spawn', () => { const A = IT.App; if (A && A.placeDummy) A.placeDummy(); else if (In.hooks.spawn) In.hooks.spawn(); else miss(); }, 'tip.placeDummy');
      const bEnemy = mk('enemy', t('hud.spawnEnemy'), null, () => {
        const A = IT.App, card = LS() && LS().enemyOpts ? LS().enemyOpts() : { behavior: 'stationary' };
        if (A && A.spawnEnemy) A.spawnEnemy(card); else miss();
      }, 'tip.spawnEnemy');
      R.side = h('div', { class: 'hudp hside' },
        h('div', { class: 'dpsrow' }, h('span', { text: t('hud.dps') }), R.dpsN, h('span', { class: 'sp', text: t('hud.total') }), R.totN),
        h('div', { class: 'srow2' }, bRef, free ? bPlace : null, free ? bEnemy : null, bRes));
      if (free && IT.Combo && IT.COMBOS && IT.COMBOS.length) {
        R.list = h('div', { class: 'clist' });
        R.side.appendChild(h('div', { class: 'ch2', text: t('hud.combos') })); R.side.appendChild(R.list);
        H.buildList();
      }
      tipOf(R.dpsN.parentNode, () => T('tip.dps'));
      root.appendChild(R.side);
    }
    R.cheat = h('div', { class: 'hudp cheat', style: { display: 'none' } });
    R.live = h('div', { class: 'hudp live', style: { display: 'none' } });
    root.appendChild(R.top); root.appendChild(R.bar); root.appendChild(R.ubar); root.appendChild(R.stat); root.appendChild(R.aim); root.appendChild(R.cheat); root.appendChild(R.live);
    if (IT.ComboBar) IT.ComboBar.bind(ctx, R.top);
    bindTips(H.off);
    H.trk = null;
    const hid = () => ctx.hero.id;
    H.off.push(ctx.w.on('cast', p => { if (p.unit === hid()) trkAdvance(s => (s.k === 'spell' || s.k === 'item') && s.id === p.ability); }));
    H.off.push(ctx.w.on('attack', p => { if (p.src === hid()) trkAdvance(s => s.k === 'attack'); }));
    H.off.push(ctx.w.on('order', p => { if (p.unit === hid() && p.order && p.order.type === 'move') trkAdvance(s => s.k === 'move'); }));
    H.off.push(ctx.w.on('scnStart', () => { H.cache.rkCk = null; }));
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
  // selected non-hero unit panel (inspect): red HP for foes, green for allies. Dummies have no HP bar; enemies show behaviour, aware/unaware and item cooldowns.
  H.updUnit = function (U, R, ca, w) {
    const { h, icon } = IT.UI, t = IT.t;
    H.unit = U;
    if (ca.uid !== U.id) {
      ca.uid = U.id;
      const sheet = U.kind === 'hero' ? IT.Art.heroSheet() : U.kind === 'spirit' ? 'forge' : (IT.Art.sheets[U.skin] ? U.skin : null);
      R.upor.textContent = ''; R.upor.appendChild(sheet ? IT.UI.portrait(sheet) : h('div', { class: 'hgen', text: '?' }));
      R.upor.classList.toggle('foe', U.team !== 0); R.uhp.classList.toggle('foe', U.team !== 0);
      R.uname.textContent = U.kind === 'dummy' ? t('hud.dummy') : U.name || (U.kind === 'enemy' ? t('hud.enemy') : U.kind === 'tower' ? t('hud.tower') : t('hud.unit'));
      for (const k of ['uhp', 'ump', 'ua', 'um', 'us', 'ubeh', 'uaw']) delete ca[k];
    }
    const nohp = U.kind === 'dummy' || U.noHpBar === true;
    R.uhp.style.display = nohp ? 'none' : '';
    const hk = Math.max(0, Math.round(U.hp)) + '/' + Math.round(U.maxHp);
    if (!nohp && ca.uhp !== hk) { ca.uhp = hk; R.uhpt.textContent = hk; R.uhpf.style.width = (U.maxHp ? Math.max(0, U.hp / U.maxHp) * 100 : 0) + '%'; }
    const mmp = Math.round(U.maxMana || 0), mk = Math.max(0, Math.round(U.mana || 0)) + '/' + mmp;
    R.ump.style.display = mmp > 0 ? '' : 'none';
    if (ca.ump !== mk) { ca.ump = mk; R.umpt.textContent = mk; R.umpf.style.width = (U.maxMana ? Math.max(0, U.mana / U.maxMana) * 100 : 0) + '%'; }
    setText(R.ua, String(Math.round((U.armor || 0) * 10) / 10), ca, 'ua');
    setText(R.um, Math.round((U.magicRes || 0) * 100) + '%', ca, 'um');
    setText(R.us, String(Math.round(U.ms || 0)), ca, 'us');
    // behaviour + awareness badges
    const beh = behOf(U);
    setText(R.ubeh, beh ? behLabel(beh) : '', ca, 'ubeh'); R.ubeh.style.display = beh ? '' : 'none';
    const isE = U.kind === 'enemy', aw = isE ? (U.aware ? 'aw' : 'un') : '';
    if (ca.uaw !== aw) { ca.uaw = aw; R.uaw.textContent = aw ? t(aw === 'aw' ? 'hud.aware' : 'hud.unaware') : ''; R.uaw.className = 'ubadge aw ' + aw; R.uaw.style.display = aw ? '' : 'none'; }
    // items with cooldown sweeps
    const hasItems = !!(U.items && U.items.some(Boolean));
    R.uitemsBox.style.display = U.kind === 'dummy' || (!hasItems && U.kind !== 'enemy') ? 'none' : '';
    R.uitems.forEach((b, i) => {
      const it = U.items && U.items[i], id = it ? (typeof it === 'string' ? it : it.id) : null;
      if (ca['ui' + i] !== id) {
        ca['ui' + i] = id; b.ic.textContent = ''; if (id && hasIcon(id)) b.ic.appendChild(icon(id));
        b.el.classList.toggle('empty', !id); b.id = id;
      }
      const cd = id ? unitItemCd(U, it, id) : 0, ck = 'u' + i + (id || '');
      if (cd > (H.cdMax[ck] || 0)) H.cdMax[ck] = cd;
      if (cd <= 0) H.cdMax[ck] = 0;
      setCd(b, cd, H.cdMax[ck], ca, 'ucd' + i);
    });
  };

  // scenario panel: countdown / flair title / explanation / win + lose / skill cards / step timeline / timers + score + medal. Hidden when IT.Ranked.hud(w) is null.
  H.updRanked = function (R, ca, dt) {
    const w = H.c.w, rk = IT.Ranked && IT.Ranked.hud ? IT.Ranked.hud(w) : null;
    if (!rk) { if (ca.rk !== 0) { ca.rk = 0; R.rk.style.display = 'none'; R.top.classList.remove('rk'); } return; }
    if (ca.rk !== 1) { ca.rk = 1; R.rk.style.display = ''; R.top.classList.add('rk'); }
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
    setText(R.rkName, loc(rk.scenario), ca, 'rkname');
    // difficulty badge (hover = what the tier changes)
    const did = rk.diff ? diffId(rk.diff) : '';
    ca.rkDiffId = did;
    setText(R.rkDiff, did ? T('diff.' + did).toUpperCase() : '', ca, 'rkdt'); R.rkDiff.style.display = did ? '' : 'none';
    if (ca.rkDc !== did) { ca.rkDc = did; R.rkDiff.className = 'rkdiff d-' + did; }
    const hm = hudMode(), ord = !!S.comboOrder, def = w.combo && w.combo.def;
    // recipes are shown unless a ranked difficulty hides them (hint-less tiers)
    const hints = rk.mode === 'ranked' ? !!(rk.hints && S.hints) : true;
    const sc = (w.ranked && w.ranked.pr && w.ranked.pr.sc) || (IT.SCENARIOS && IT.SCENARIOS.get && IT.SCENARIOS.get(rk.id)) || {};
    const ck = [rk.id, rk.n, def ? def.id : '', IT.lang, hm, ord ? 1 : 0, hints ? 1 : 0].join('|');
    if (ca.rkCk !== ck) { ca.rkCk = ck; buildScenario(R, rk, sc, hm, ord, hints); }
    if (hm === 'steps') updTimeline(R, dt || 0);
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
    const In = IT.Input, sid = In.selected != null ? In.selected : (In.sel && In.sel.units && In.sel.units.length === 1 && In.sel.units[0] !== hero.id ? In.sel.units[0] : null);
    const sel = sid != null ? w.get(sid) : null, U = sel && sel !== hero && !sel.dead ? sel : null;
    if (!U) H.unit = null;
    const um = U ? U.id : null;
    if (ca.umode !== um) {
      ca.umode = um; ca.uid = null;
      R.bar.style.display = U ? 'none' : ''; R.ubar.style.display = U ? '' : 'none'; R.orbcol.style.display = U ? 'none' : '';
    }
    if (U) H.updUnit(U, R, ca, w);
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
        const chip = IT.UI.h('div', { class: 'buff ' + (foe ? 'bad' : 'good') },
          s.ability && hasIcon(s.ability) ? IT.UI.icon(s.ability) : (s.type && hasIcon(s.type) ? IT.UI.icon(s.type) : IT.UI.h('b', { class: 'ab', text: nm.slice(0, 3).toUpperCase() })),
          IT.UI.h('span', { class: 'bt' }));
        tipOf(chip, () => statusTip(s, w));
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
    refreshTip();
    if (IT.ComboBar) IT.ComboBar.update(dt);
    if (IT.DummyChat && IT.DummyChat.update) IT.DummyChat.update(dt);
  };
  H.resetMeter = function () { H.dps = []; H.total = 0; };

  H.isFoe = foe; H.planOrbs = planOrbs; H.normSteps = normSteps; H.hudMode = hudMode; H.diffId = diffId;   // exposed for tests
  IT.HUD = H;
})(typeof window !== 'undefined' ? window : globalThis);
