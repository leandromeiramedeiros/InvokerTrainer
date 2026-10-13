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
  // hero item slot drag: press -> move >5px = drag (swap on release), else click = cast on release. The state machine + its window listeners
  // (Esc / blur / lost release cancel; nothing is left behind) live in js/ui/itemdrag.js; this is only the HUD glue. It never pauses the sim.
  function slotAt(x, y) {
    const el = document.elementFromPoint(x, y), s = el && el.closest ? el.closest('.hitems [data-slot]') : null;
    return s ? +s.getAttribute('data-slot') : null;
  }
  function dragClear() {
    const d = H.drag; H.drag = null;
    if (d && d.ghost) d.ghost.remove();
    for (const g of document.querySelectorAll('.hdrag')) g.remove();
    if (H.refs && H.refs.items) H.refs.items.forEach(b => b.el.classList.remove('drop', 'dragsrc'));
  }
  function dragMachine() {
    const ID = IT.UI.ItemDrag;
    H.dm = ID.create({
      canDrag: src => !!(H.c && H.c.hero.items[src.i]),
      onStart: src => {
        const it = H.c.hero.items[src.i];
        H.refs.items[src.i].el.classList.add('dragsrc');
        H.drag = { i: src.i, ghost: IT.UI.h('div', { class: 'hdrag' }, IT.UI.icon(it.id)) };
        H.el.appendChild(H.drag.ghost);
      },
      onOver: t => {
        H.refs.items.forEach(b => b.el.classList.remove('drop'));
        if (t && t.kind === 'slot' && H.dm.src && t.i !== H.dm.src.i) H.refs.items[t.i].el.classList.add('drop');
      },
      onClick: (src, meta) => { if (H.c) IT.Input.doAction('item' + (src.i + 1), { hud: true, queued: !!(meta && meta.shift) }); },
      onDrop: (src, t, act) => { dragClear(); if (act.type === 'swap' && H.c) IT.Items.swap(H.c.w, H.c.hero, act.from, act.to); },
      onCancel: dragClear,
    }, 'game');
    H.dbegin = ID.bind(H.dm, {
      win: window, doc: document,
      hit: (x, y) => { const j = slotAt(x, y); return j == null ? null : { kind: 'slot', i: j }; },
      locked: () => !!(IT.Input && IT.Input.locked),
      moved: (x, y) => { const g = H.drag && H.drag.ghost; if (g) { const r = H.el.getBoundingClientRect(); g.style.left = (x - r.left) + 'px'; g.style.top = (y - r.top) + 'px'; } },
      end: dragClear,
    });
  }
  function itemDown(i, ev) { if (H.c && H.dbegin) H.dbegin({ kind: 'slot', i }, ev); }

  const ul = (en, pt) => (IT.lang === 'pt' ? pt : en);

  // ---------------------------------------------------------------- v6 stat boxes (core 2x2 under the portrait, secondary strip under the spells)
  // Pure: H.statSheet(unit) -> { rows: { dmg, armor, ms, as, amp, mr, range, cdr, hpr, mpr: { txt, bonus, cls, tip } } }.
  // Reads unit.attack.{min,max,as,bat}, armor, ms, magicRes, hpRegen, manaRegen, base.*, statuses[].data.stats (itemStats = items), hero orbs.
  // spellAmp / castRangeBonus / cdr do not exist in the sim yet: read as optional fields, 0 when absent (tooltip says so).
  const f1 = v => String(Math.round(v * 10) / 10);
  const sgn = (v, pct) => (v > 0 ? '+' : v < 0 ? '-' : '') + f1(Math.abs(v)) + (pct ? '%' : '');
  const CORE = ['dmg', 'armor', 'ms', 'as'], SEC = ['amp', 'mr', 'range', 'cdr', 'hpr', 'mpr'];
  H.statSheet = function (e) {
    const t = IT.t, V = IT.Values, a = e.attack || null, b = e.base || {}, P = { dmg: [], armor: [], ms: [], as: [], mr: [], hpr: [], mpr: [] };
    const add = (k, src, v, pct) => { if (v) P[k].push({ src, v, pct: !!pct }); };
    if (e.kind === 'hero' && e.inv && e.ctx && V) {
      const n = { Q: 0, W: 0, E: 0 };
      for (const o of e.inv.orbs) n[o]++;
      add('hpr', 'orbs', n.Q * V.get('invoker_quas', 'hp_regen_per_instance', e.ctx));
      add('ms', 'orbs', n.W * V.get('invoker_wex', 'move_speed_per_instance', e.ctx), true);
      add('as', 'orbs', n.W * V.get('invoker_wex', 'attack_speed_per_instance', e.ctx));
      add('dmg', 'orbs', n.E * V.get('invoker_exort', 'bonus_damage_per_instance', e.ctx));
    }
    for (const s of e.statuses || []) {
      const st = s.data && s.data.stats; if (!st) continue;
      const src = s.type === 'itemStats' ? 'items' : s.type;
      add('as', src, st.as); add('dmg', src, st.dmg); add('ms', src, st.ms); add('ms', src, st.msPct, true);
      add('armor', src, st.armor); add('mr', src, (st.magicRes || 0) * 100, true); add('hpr', src, st.hpRegen); add('mpr', src, st.manaRegen);
    }
    const S = IT.Status, slow = S && S.slowPct && !(S.has && S.has(e, 'hex')) ? S.slowPct(e) : 0;
    if (slow) add('ms', 'slow', -slow * 100, true);
    const nm = src => src === 'items' ? t('hs.items') : src === 'orbs' ? t('hs.orbs') : src === 'slow' ? t('hs.slow') : IT.hasT('status.' + src) ? t('status.' + src) : src;
    const sum = k => P[k].reduce((x, p) => x + (p.pct ? 0 : p.v), 0);
    const tip = (k, head, baseTxt, extra) => [head].concat(baseTxt != null ? ['  ' + t('hs.base') + ' ' + baseTxt] : [], P[k].map(p => '  ' + nm(p.src) + ' ' + sgn(p.v, p.pct)), extra || []).join('\n');
    const cls = (v, v0) => (v > v0 + 0.05 ? 'up' : v < v0 - 0.05 ? 'dn' : '');
    const bv = (k, cur) => (b[k] != null ? b[k] : cur);
    const rows = {};
    // damage: base range + green bonus (orbs / Alacrity / items)
    const bonus = sum('dmg'), hasA = !!(a && a.max > 0);
    const dmn = hasA ? Math.round(a.min - bonus) : 0, dmx = hasA ? Math.round(a.max - bonus) : 0;
    // Dota HUD: one number = the average of the base range (15.webp: 145-151 -> 148); the tooltip keeps the range
    const dtx = hasA ? (dmn === dmx ? String(dmn) : dmn + '-' + dmx) : '-', davg = hasA ? String(Math.round((a.min + a.max) / 2 - bonus)) : '-';
    rows.dmg = { txt: davg, bonus: hasA && bonus ? sgn(bonus) : '', cls: '', tip: tip('dmg', t('hs.dmg') + ': ' + (hasA ? Math.round(a.min) + '-' + Math.round(a.max) : '-'), hasA ? dtx : null) };
    const ar = e.armor || 0, ms = e.ms || 0, asv = a ? a.as || 0 : 0, mrv = e.magicRes || 0, hp = e.hpRegen || 0, mp = e.manaRegen || 0;
    // Dota HUD shows whole armor, rounded down (15.webp: -1 + 70/6 = 10.67 -> 10); the tooltip keeps the decimal
    rows.armor = { txt: String(Math.floor(ar + 1e-9)), bonus: '', cls: cls(ar, bv('armor', ar)), tip: tip('armor', t('hs.armor') + ': ' + f1(ar), f1(bv('armor', ar))) };
    rows.ms = { txt: String(Math.round(ms)), bonus: '', cls: cls(ms, bv('ms', ms)), tip: tip('ms', t('hs.ms') + ': ' + Math.round(ms), String(Math.round(bv('ms', ms)))) };
    const at = a && a.bat && asv ? a.bat / (asv / 100) : 0;
    rows.as = { txt: String(Math.round(asv)), bonus: '', cls: cls(asv, bv('as', asv)), tip: tip('as', t('hs.as') + ': ' + Math.round(asv), String(Math.round(bv('as', asv))), at ? ['  ' + t('hs.at') + ' ' + at.toFixed(2) + 's'] : []) };
    rows.mr = { txt: Math.round(mrv * 100) + '%', bonus: '', cls: cls(mrv, bv('magicRes', mrv)), tip: tip('mr', t('hs.mr') + ': ' + Math.round(mrv * 100) + '%', Math.round(bv('magicRes', mrv) * 100) + '%') };
    rows.hpr = { txt: f1(hp), bonus: '', cls: cls(hp, bv('hpRegen', hp)), tip: tip('hpr', t('hs.hpr') + ': ' + f1(hp) + '/s', f1(bv('hpRegen', hp))) };
    rows.mpr = { txt: f1(mp), bonus: '', cls: cls(mp, bv('manaRegen', mp)), tip: tip('mpr', t('hs.mpr') + ': ' + f1(mp) + '/s', f1(bv('manaRegen', mp))) };
    // no sim source yet (optional fields; 0 when absent)
    const opt = (k, v, u) => { const x = Number(v) || 0; rows[k] = { txt: f1(x) + u, bonus: '', cls: x > 0 ? 'up' : '', tip: t('hs.' + k) + ': ' + f1(x) + u + (v == null ? '\n  ' + t('hs.none') : '') }; };
    opt('amp', e.spellAmp, '%'); opt('range', e.castRangeBonus, ''); opt('cdr', e.cdr, '%');
    return { rows };
  };
  // 11x11 hand-drawn stat icon (fresh canvas: the art cache canvas is shared)
  function hsIcon(sheet, key) {
    const src = IT.Art && IT.Art.canvas(sheet, key), c = document.createElement('canvas');
    c.className = 'hsi'; c.width = c.height = 11;
    if (src) c.getContext('2d').drawImage(src, 0, 0);
    return c;
  }
  function statCell(k, store) {
    const { h } = IT.UI, v = h('span', { class: 'hv' }), b = h('b', { class: 'hb' });
    const el = h('div', { class: 'hc ' + k }, hsIcon('hstat', 'hs_' + k), v, b);
    store[k] = { el, v, b };
    return el;
  }
  const coreBox = store => IT.UI.h('div', { class: 'hcore' }, CORE.map(k => statCell(k, store)));
  // secondary strip: the stat cells for `keys` (the buff / debuff row lives in R.sbf, next to the orbs)
  function stripBox(store, keys) {
    const { h } = IT.UI;
    return h('div', { class: 'hstrip' }, keys.map(k => statCell(k, store)));
  }
  function paintCells(store, keys, e, ca, pfx) {
    const sh = H.statSheet(e);
    for (const k of keys) {
      const c = store[k], r = sh.rows[k], sig = r.txt + '|' + r.bonus + '|' + r.cls + '|' + r.tip;
      if (ca[pfx + k] === sig) continue;
      ca[pfx + k] = sig;
      c.v.textContent = r.txt; c.b.textContent = r.bonus;
      c.el.className = 'hc ' + k + (r.cls ? ' ' + r.cls : '');
      c.el.setAttribute('data-tip', r.tip);
    }
  }
  // ---- buff / debuff row (Dota style): one 22-px framed cell per status of the shown unit (own hero, or the selected enemy / spirit). Buff = green frame, debuff = red.
  // A canvas per cell draws the 'statusL' art + a clockwise radial sweep of the elapsed duration (relative to the longest seen); stack count bottom-right; tooltip = name + seconds left.
  const SBF_PX = 22;
  function sbfCell() {
    const { h } = IT.UI, cv = h('canvas', { width: SBF_PX, height: SBF_PX }), cnt = h('b', { class: 'sbn' });
    return { el: h('div', { class: 'sbf' }, cv, cnt), cv, cnt, ctx: cv.getContext('2d'), key: '', buff: null, q: -1, tx: null, cn: 0 };
  }
  function sbfBox(store) { store.sbf = IT.UI.h('div', { class: 'hsbf', style: { display: 'none' } }); store.sbfCells = []; store.sbfTot = {}; return store.sbf; }
  // debuffs first (a stun is what you must notice), then buffs; each group in sim priority order
  function sbfOrder(list) { return list.filter(x => !x.buff).concat(list.filter(x => x.buff)).slice(0, IT.UnitDraw.MAX_STATUS_HUD); }
  function sbfDraw(c, it, f, last) {
    const g = c.ctx, ic = IT.Art.canvas('statusL', 'st_' + it.key);
    g.clearRect(0, 0, SBF_PX, SBF_PX);
    if (ic) g.drawImage(ic, 0, 0);
    if (f > 0) {   // elapsed share, clockwise from 12 o'clock
      g.fillStyle = 'rgba(8,8,14,.66)'; g.beginPath(); g.moveTo(SBF_PX / 2, SBF_PX / 2);
      g.arc(SBF_PX / 2, SBF_PX / 2, SBF_PX, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(f, 0.999), false); g.closePath(); g.fill();
    }
  }
  function paintBuffs(store, e, w, ca, pfx) {
    const UD = IT.UnitDraw, t = IT.t, box = store.sbf; if (!box) return;
    const list = UD && UD.statusList ? sbfOrder(UD.statusList(e, w.t)) : [];
    if (ca.sbfuid !== e.id) { ca.sbfuid = e.id; store.sbfTot = {}; }
    const tot = store.sbfTot, cells = store.sbfCells;
    while (cells.length < list.length) { const c = sbfCell(); cells.push(c); box.appendChild(c.el); }
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i], it = list[i];
      if (!it) { if (c.key) { c.key = ''; c.el.style.display = 'none'; } continue; }
      if (!c.key) c.el.style.display = '';
      const fin = isFinite(it.left);
      if (fin) { if (!(tot[it.key] >= it.left)) tot[it.key] = it.left; }
      const f = fin && tot[it.key] > 0.5 ? Math.max(0, Math.min(1, 1 - it.left / tot[it.key])) : 0, q = Math.round(f * 48);
      if (c.key !== it.key || c.buff !== it.buff) { c.key = it.key; c.buff = it.buff; c.q = -1; c.el.className = 'sbf ' + (it.buff ? 'buff' : 'debuff'); }
      if (c.q !== q) { c.q = q; sbfDraw(c, it, q / 48); }
      const nm = IT.hasT('status.' + it.type) ? t('status.' + it.type) : it.type;
      const tx = nm + (fin ? ' - ' + t('hs.left', { n: Math.ceil(Math.max(0, it.left)) }) : '');
      if (c.tx !== tx) { c.tx = tx; c.el.setAttribute('data-tip', tx); }
      if (c.cn !== it.count) { c.cn = it.count; c.cnt.textContent = it.count > 1 ? String(it.count) : ''; }
      c.el.style.opacity = fin && it.left < 0.6 && (((w.t * 8) | 0) & 1) ? '.45' : '';   // last 0.6 s blinks
    }
    for (const k in tot) if (!list.some(l => l.key === k)) delete tot[k];
    const show = list.length ? '' : 'none';
    if (box.style.display !== show) box.style.display = show;
  }
  const UCMD_ICON = { attack: 'ui_atk', stop: 'ui_stop', hold: 'ui_hold' };
  // bottom bar for a selected non-hero unit (Dota-style): portrait, name, bars, armor/MR/speed, 6 items
  function unitBar(R) {
    const { h } = IT.UI, t = IT.t;
    R.upor = h('div', { class: 'hpor' });
    R.uname = h('div', { class: 'uname' });
    R.uhp = h('div', { class: 'bar hp' }, R.uhpf = h('i'), R.uhpt = h('span'));
    R.ump = h('div', { class: 'bar mp' }, R.umpf = h('i'), R.umpt = h('span'));
    R.uc = {}; R.us = {};
    R.ucore = coreBox(R.uc);   // v6: core stats under the portrait (damage / armor / move / attack speed)
    R.ustrip = stripBox(R.us, ['mr', 'hpr', 'mpr']);   // magic res + regen
    R.unote = h('div', { class: 'ustats', style: { display: 'none', color: '#ffd27a' } });   // buildings: team + invulnerable note
    R.uitems = [0, 1, 2, 3, 4, 5].map(() => { const ic = h('span', { class: 'ic' }); return { el: h('div', { class: 'hbtn item' }, ic), ic }; });
    // v6: own Forge Spirit card -> its own Attack / Stop / Hold commands (with the bound keys) instead of item slots
    R.ucmd = ['attack', 'stop', 'hold'].map(a => { const b = btnEl('item cmd', () => IT.Input.doAction(a, { hud: true })); b.act = a; b.el.style.display = 'none'; return b; });
    return h('div', { class: 'hudp hbar hunit', style: { display: 'none' } },
      h('div', { class: 'hpcol' }, R.upor, R.ucore),
      h('div', { class: 'hmid' }, R.uname, h('div', { class: 'bars' }, R.uhp, R.ump), R.ustrip, R.unote),
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

  // v6 day / night clock: pixel sun / moon in a ring whose arc fills through the phase (full ring when the time of day is fixed), drawn on a
  // 24x24 canvas left of the top strip. Tooltip: day / night vision of the hero (IT.DayNight.pair) + the current phase.
  const CLK = 24;
  function clockEl() {
    const c = document.createElement('canvas'); c.width = CLK; c.height = CLK; c.className = 'hclock';
    Object.assign(c.style, { position: 'absolute', top: '.8em', left: 'calc(17.5% - 4.1em)', width: '3.4em', height: '3.4em', imageRendering: 'pixelated', pointerEvents: 'auto', cursor: 'help' });
    return c;
  }
  function paintClock(cv, night, prog, fixed) {
    const cx = cv.getContext('2d'), C = (CLK - 1) / 2, px = (x, y, col) => { cx.fillStyle = col; cx.fillRect(x, y, 1, 1); };
    cx.clearRect(0, 0, CLK, CLK);
    const arcOn = night ? '#7fa6ff' : '#f2c444', arcOff = '#3a2f55', ang = (fixed ? 1 : prog) * Math.PI * 2;
    for (let y = 0; y < CLK; y++) for (let x = 0; x < CLK; x++) {
      const dx = x - C, dy = y - C, d = Math.hypot(dx, dy);
      if (d > 11.6) continue;
      if (d > 10.6) { px(x, y, '#000'); continue; }                      // outline
      if (d > 8.4) {                                                      // progress ring, clockwise from 12 o'clock
        let a = Math.atan2(dx, -dy); if (a < 0) a += Math.PI * 2;
        px(x, y, a <= ang + 1e-6 ? arcOn : arcOff); continue;
      }
      if (d > 7.6) { px(x, y, '#000'); continue; }
      px(x, y, night ? '#121a3a' : '#2c5a8c');                            // sky
    }
    if (!night) {   // sun: disk + 8 rays
      for (let y = 0; y < CLK; y++) for (let x = 0; x < CLK; x++) {
        const d = Math.hypot(x - C, y - C);
        if (d <= 3.6) px(x, y, d <= 1.8 && x <= C && y <= C ? '#fff3b0' : '#ffd23a');
        else if (d <= 4.4) px(x, y, '#e08a1e');
      }
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; px(Math.round(C + Math.cos(a) * 6), Math.round(C + Math.sin(a) * 6), '#ffd23a'); }
    } else {        // moon: crescent + two stars
      for (let y = 0; y < CLK; y++) for (let x = 0; x < CLK; x++) {
        const d = Math.hypot(x - C, y - C), e = Math.hypot(x - C - 2.2, y - C + 1.6);
        if (d <= 5 && e > 3.9) px(x, y, d > 4.2 ? '#9fb2e8' : '#e6edff');
      }
      px(Math.round(C + 4), Math.round(C - 4), '#fff'); px(Math.round(C + 5), Math.round(C + 2), '#c9d6ff');
    }
  }
  H.updClock = function (R, ca) {
    const DN = IT.DayNight, w = H.c.w;
    if (!DN || !R.clock) return;
    const night = DN.isNight(w), fixed = !w.tod || !isFinite(w.tod.len), prog = DN.progress(w);
    const k = (night ? 'n' : 'd') + (fixed ? 'f' : Math.floor(prog * 64));
    if (ca.clk !== k) { ca.clk = k; paintClock(R.clock, night, prog, fixed); }
    const p = DN.pair(H.c.hero) || [1800, 800], left = DN.left(w);
    const tip = t('dn.tip', { d: p[0], n: p[1] }) + '\n' + t(night ? 'dn.night' : 'dn.day') +
      (isFinite(left) ? ' - ' + t(night ? 'dn.toDay' : 'dn.toNight', { t: fmtM(left) }) : '');
    setTip(R.clock, tip, ca, 'clktp');
  };

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
    const def = rk.def || (w.combo && w.combo.def);   // rk.def: the pinned guide combo (Free Play)
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
  function trkFeed(ev) {
    if (H.trk && H.trk.tr) H.trk.tr.feed(ev);
    if (H.sb && H.c && H.sb.w === H.c.w && H.sb.gd) H.sb.gd.feed(ev);   // the pinned combo guide follows the same hero events
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
    R.hc = {}; R.hs = {};
    R.core = coreBox(R.hc);   // v6: core stats 2x2 under the portrait; secondary strip under the spell row
    R.strip = stripBox(R.hs, SEC);
    R.bar = h('div', { class: 'hudp hbar' },
      h('div', { class: 'hpcol' }, R.por, R.core),
      h('div', { class: 'hmid' },
        h('div', { class: 'bars' }, R.hp, R.mp),
        h('div', { class: 'abrow' }, h('div', { class: 'abq' }, h('div', { class: 'abl' }, R.q.el, R.w.el, R.e.el, R.r.el), R.strip), h('i', { class: 'sep' }),
          h('div', { class: 'abcol' }, R.s1.el, R.rec1), h('div', { class: 'abcol' }, R.s2.el, R.rec2))),
      R.hood,
      h('div', { class: 'hitems' }, R.items.map(b => b.el)),
      R.recs.el);
    R.ubar = unitBar(R);
    R.orbcol = h('div', { class: 'horbcol' }, R.orbs);
    R.stat = h('div', { class: 'hstat' }, R.orbcol, sbfBox(R));   // orbs float above the hero bar; the large buff / debuff row sits right of them
    R.aim = h('div', { class: 'aimhint', text: t('hud.aimHint') });
    R.rk = rankedPanel(R);
    R.top = h('div', { class: 'htop' }, R.rk);   // top-centre stack: ranked panel, then combo bar

    // --- sandbox panel (v6 WP7: fixed-height pane, see H.buildSide)
    if (H.hasSide(ctx)) { R.top.classList.add('sbx'); H.buildSide(ctx, root); }   // Free Play / Combo Sandbox only: scenarios (ranked / practice) have no side pane
    R.clock = IT.DayNight ? clockEl() : null;   // v6 day / night clock (left of the top strip)
    if (R.clock) root.appendChild(R.clock);
    root.appendChild(R.top); root.appendChild(R.bar); root.appendChild(R.ubar); root.appendChild(R.stat); root.appendChild(R.aim);
    // floating panels (drag / resize / persist): recipe sheet (I) + live stats (O), both toggles
    R.cheat = h('div', { class: 'pcont cheat' }); R.live = h('div', { class: 'pcont live' });
    R.cheatP = IT.UI.Panel.create({ id: 'cheat', title: t('cheat.title'), content: R.cheat, host: root, fit: true, min: { w: 80, h: 60 }, max: { w: 300, h: 262 }, default: { x: 58, y: 30, w: 160, h: 170 },
      onChange: on => { H.cheatOn = on; if (on) H.buildCheat(); } });
    R.liveP = IT.UI.Panel.create({ id: 'live', title: t('hud.liveStats'), content: R.live, host: root, fit: true, min: { w: 80, h: 60 }, max: { w: 300, h: 262 }, default: { x: 224, y: 30, w: 140, h: 130 },
      onChange: on => { H.statsOn = on; if (on) H.buildLive(); } });
    H.off.push(() => { R.cheatP.destroy(); R.liveP.destroy(); });
    H.cheatOn = R.cheatP.isOpen(); H.statsOn = R.liveP.isOpen();   // restored from localStorage
    if (H.cheatOn) H.buildCheat();
    if (H.statsOn) H.buildLive();
    if (IT.ComboBar) IT.ComboBar.bind(ctx, R.top);
    dragMachine();
    H.off.push(() => { if (H.dbegin) H.dbegin.abort('unbind'); dragClear(); H.dm = H.dbegin = null; });

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

  // ---------------------------------------------------------------- sandbox side panel (v6 items 21 + 33)
  // A draggable / resizable / persisted IT.UI.Panel ('sbx', Free Play only): map line, DPS meter + sparkline, tools (refresh, auto-refresh, reset
  // targets, grant items), time of day (Day / Night / Cycle + a slider), the enemy / dummy roster (skin picker, difficulty bar, remove X, "+ Enemy" /
  // "+ Dummy") and the combo browser. Clicking a combo pins / unpins the guide strip (R.gd, top centre): the step chain only, no scenario state.
  const SBI = {
    refresh: '<path d="M13 8a5 5 0 1 1-1.6-3.7M13.5 1.5V5H10"/>',
    reset: '<path d="M3 5h8a3 3 0 0 1 0 6H6M3 5l3-3M3 5l3 3"/>',
    auto: '<path d="M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z"/>',
    grant: '<path d="M3 6h10v8H3zM6 6V4a2 2 0 0 1 4 0v2"/>',
    plus: '<path d="M8 3v10M3 8h10"/>',
    x: '<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>',
    menu: '<path d="M2 4h12M2 8h12M2 12h12"/>',
    lock: '<path d="M4 7h8v7H4zM5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
  };
  const sbIcon = k => { const s = IT.UI.h('span', { class: 'sbi' }); s.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true">' + SBI[k] + '</svg>'; return s; };
  const SB_FILTERS = ['all', 'basic', 'intermediate', 'advanced', 'items'];
  // v6 #65: portrait canvas of a sheet that keeps the portrait's OWN size (32x32, or the 48x32 Vitinian) and letterboxes it inside the square slot (object-fit: contain,
  // no distortion; the rest of the slot shows the frame background). IT.UI.portrait (menus.js) always makes a 32x32 canvas, so a wide portrait is redrawn at its size.
  function fitPor(sheet, cls) {
    const cv = IT.UI.portrait(sheet, cls);
    let src = null;
    try { src = IT.Art && IT.Art.canvas(sheet, 'portrait'); } catch (e) { src = null; }
    if (src && (src.width !== cv.width || src.height !== cv.height)) {
      cv.width = src.width; cv.height = src.height;
      cv.getContext('2d').drawImage(src, 0, 0);
      cv.style.objectFit = 'contain';
    }
    return cv;
  }
  H.fitPor = fitPor;

  // 32px portrait of a skin; dummy skins without art of their own wear the scarecrow sheet
  function skinPor(skin, kind) {
    let ok = false;
    try { ok = !!(IT.Art && IT.Art.canvas(skin, 'portrait')); } catch (e) { ok = false; }
    return fitPor(ok ? skin : kind === 'dummy' ? 'scarecrow' : skin);
  }

  // pure: the side pane exists only in Free Play (ctx.free = no scenario run); never in ranked / practice scenarios
  H.hasSide = ctx => !!ctx && ctx.mode === 'sandbox' && !!ctx.free;

  H.buildSide = function (ctx, root) {
    const { h } = IT.UI, t = IT.t, In = IT.Input, R = H.refs, S = IT.Settings, Ro = IT.UI.Roster;
    const stateFn = () => { const hr = H.c && H.c.hero; return hr ? { orbs: hr.inv.orbs, slots: hr.inv.slots, items: hr.items.map(x => x && x.id), preinvoked: [] } : {}; };
    if (!H.sb || H.sb.w !== ctx.w) H.sb = { w: ctx.w, filter: 'all', q: '', auto: false, peak: 0, sp: 0, tc: 0, pick: null, gd: IT.UI.Guide.create(stateFn), gdGrant: null };
    const sb = H.sb, key = a => S.label(S.keyOf(a));
    sb.rsig = ''; sb.tc = 1;

    R.mapLine = h('div', { class: 'maplin' });   // current map name (Free Play top line)
    // DPS meter
    R.dpsN = h('b', { class: 'dpsn', text: '0' }); R.totN = h('b', { class: 'totn', text: '0' }); R.peakN = h('span', { class: 'pk' });
    R.spark = h('canvas', { class: 'sbx-spark', width: 160, height: 24, 'data-tip': t('sbx.spark') });
    // tools: refresh cooldowns, auto-refresh, reset targets, grant items for the followed combos
    const tool = (ic, label, desc, cls, fn, kb) => h('button', {
      type: 'button', class: 'sbx-ib ' + cls, 'aria-label': label, 'data-tip': label + (kb ? ' [' + kb + ']' : '') + '\n' + desc,
      onclick: ev => { ev.currentTarget.blur(); fn(ev.currentTarget); },
    }, sbIcon(ic), kb ? h('kbd', { text: kb }) : null);
    const flip = (btn, on) => { btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on ? 'true' : 'false'); };
    R.tools = h('div', { class: 'sbx-tools' },
      tool('refresh', t('hud.refresh'), t('sbx.refresh.d'), 'refresh', () => { if (In.hooks.refresh) In.hooks.refresh(); }, key('refresh')),
      R.autoB = tool('auto', t('sbx.auto'), t('sbx.auto.d'), 'auto' + (sb.auto ? ' on' : ''), b => { sb.auto = !sb.auto; flip(b, sb.auto); }),
      tool('reset', t('sbx.reset'), t('sbx.reset.d'), 'reset', () => H.sbReset()),
      R.grantB = tool('grant', t('sbx.grant'), t('sbx.grant.d'), 'grant' + (ctx.grant ? ' on' : ''), b => H.sbGrant(b, flip)));

    // time of day: Day / Night / Cycle + slider over the 10 min day (dragging it switches to Cycle from that moment)
    let tod = null;
    if (IT.DayNight) {
      R.todBtns = ['day', 'night', 'cycle'].map(m => h('button', { type: 'button', class: 'sbx-tb', 'data-mode': m, 'data-tip': t('lo.tod.d'), text: t('lo.tod.' + m).split(' (')[0],
        onclick: ev => { ev.currentTarget.blur(); Ro.todSetMode(ctx.w, m); H.syncTod(true); } }));
      R.todSl = h('input', { type: 'range', class: 'sbx-rg', min: 0, max: Ro.todFull() - 1, step: 1, value: 0, 'aria-label': t('tod.time'), 'data-tip': t('tod.time'),
        oninput: ev => { Ro.todSetPos(ctx.w, +ev.target.value); H.syncTod(true); } });
      R.todSl.addEventListener('change', () => R.todSl.blur());
      R.todOut = h('span', { class: 'v' });
      tod = h('div', { class: 'sbx-sec sbx-tod' }, h('div', { class: 'sbx-sh', text: t('tod.title') }), h('div', { class: 'sbx-tbs' }, R.todBtns),
        h('div', { class: 'sbx-sl' }, R.todSl, R.todOut));
    }

    // roster: enemies and dummies of the map
    const addBtn = kind => {
      const b = h('button', { type: 'button', class: 'sbx-add ' + kind, onclick: ev => { ev.currentTarget.blur(); if (In.hooks.armEnemy) In.hooks.armEnemy(kind); H.syncRoster(true); } });
      b.append(sbIcon('plus'), h('span', { class: 'an', text: t(kind === 'dummy' ? 'ros.addDummy' : 'ros.addEnemy').replace(/^\+\s*/, '') }), h('em', { class: 'ac' }));
      b.setAttribute('data-tip', t(kind === 'dummy' ? 'ros.addDummy.d' : 'ros.addEnemy.d', { n: Ro.MAX[kind] }));
      return b;
    };
    R.addE = addBtn('enemy'); R.addD = addBtn('dummy');
    R.rosList = h('div', { class: 'ros-list' });
    const roster = h('div', { class: 'sbx-sec sbx-ros' }, h('div', { class: 'sbx-sh', text: t('ros.title') }), h('div', { class: 'ros-add' }, R.addE, R.addD), R.rosList);

    // combo browser
    R.search = h('input', { type: 'text', class: 'sbx-q', placeholder: t('sbx.search'), 'aria-label': t('sbx.search'), spellcheck: 'false', autocomplete: 'off', maxlength: 24, value: sb.q,
      oninput: ev => { sb.q = ev.target.value; H.filterList(); },
      onkeydown: ev => { if (ev.key === 'Escape') { ev.stopPropagation(); ev.preventDefault(); if (R.search.value) { R.search.value = ''; sb.q = ''; H.filterList(); } else R.search.blur(); } } });
    R.lcount = h('span', { class: 'cnt' });
    R.chips = SB_FILTERS.map(f => h('button', { type: 'button', class: 'sbx-fc' + (f === 'all' ? '' : ' t-' + f) + (sb.filter === f ? ' on' : ''), text: t(f === 'all' ? 'sbx.all' : 'tier.' + f),
      onclick: ev => { ev.currentTarget.blur(); sb.filter = f; R.chips.forEach((c, i) => c.classList.toggle('on', SB_FILTERS[i] === f)); H.filterList(); } }));
    R.list = h('div', { class: 'clist' });
    R.side = h('div', { class: 'sbx-wrap' },
      R.mapLine,
      h('div', { class: 'sbx-sec sbx-meter' },
        h('div', { class: 'dpsrow' }, h('span', { text: t('hud.dps') }), R.dpsN, R.peakN, h('span', { class: 'sp', text: t('hud.total') }), R.totN), R.spark),
      h('div', { class: 'sbx-sec' }, R.tools),
      tod, roster,
      h('div', { class: 'sbx-lh' }, h('span', { class: 'ch2', text: t('hud.combos') }), R.lcount, R.search),
      h('div', { class: 'sbx-fl' }, R.chips),
      R.list);
    // the wheel belongs to the pane (list scroll), never to the game zoom
    R.side.addEventListener('wheel', ev => ev.stopPropagation(), { passive: true });

    // the pane itself: draggable, resizable, persisted; open by default the first time (nothing stored yet)
    R.sbxOpen = h('button', { type: 'button', class: 'sbx-open', hidden: true, 'aria-label': t('sbx.open'), 'data-tip': t('sbx.open'), onclick: ev => { ev.currentTarget.blur(); R.sideP.setOpen(true); } }, sbIcon('menu'));
    root.appendChild(R.sbxOpen);
    R.sideP = IT.UI.Panel.create({ id: 'sbx', title: t('sbx.pane'), content: R.side, host: root, min: { w: 104, h: 96 }, max: { w: 240, h: 262 }, default: { x: 358, y: 15, w: 118, h: 172 },
      onChange: on => { R.sbxOpen.hidden = on; } });
    let stored = 'x'; try { stored = G.localStorage ? G.localStorage.getItem(IT.UI.Panel.KEY + 'sbx') : null; } catch (e) { stored = 'x'; }
    if (stored == null) R.sideP.setOpen(true);
    R.sbxOpen.hidden = R.sideP.isOpen();
    R.sideP.front();
    H.off.push(() => R.sideP.destroy());

    // the pinned guide strip (item 33): step chain only
    R.gdChain = h('div', { class: 'rkcombo ord' }); R.gdR = { rkCombo: R.gdChain, rkChips: [] };
    R.gdOk = h('i', { class: 'gdok', text: '✓' }); R.gdCnt = h('b', { class: 'gdcnt' });
    R.gd = h('div', { class: 'gdp', hidden: true }, R.gdChain, R.gdOk, R.gdCnt);
    R.top.insertBefore(R.gd, R.top.firstChild);

    H.buildList();
    H.syncRoster(true); H.syncTod(true);
  };

  // "Reset targets": every enemy / dummy back on its spot at full health, damage meter cleared
  H.sbReset = function () {
    const c = H.c; if (!c) return;
    if (c.R && c.R.clearVfx) c.R.clearVfx();
    IT.UI.Roster.resetAll(c.w);
    H.resetMeter();
    IT.UI.toast(IT.t('toast.dummiesReset'), 'info');
    H.syncRoster(true);
  };

  // "Grant items": the combos that need items / Aghanim become available (granted when pinned); switching it off unpins and takes them back
  H.sbGrant = function (btn, flip) {
    const c = H.c, w = c && c.w; if (!w) return;
    H.gdUnpin();
    c.grant = !c.grant; flip(btn, c.grant);
    if (IT.Combo && !(w.combo && w.combo.def)) IT.Combo.mode(w, 'sandbox', { loadout: w.loadout, grantMissing: c.grant });
    H.buildList();
  };

  // ---- time of day block
  H.syncTod = function (force) {
    const R = H.refs, c = H.c; if (!R.todSl || !c) return;
    const w = c.w, Ro = IT.UI.Roster, mode = Ro.todMode(w), pos = Ro.todPos(w), t = IT.t;
    R.todBtns.forEach(b => b.classList.toggle('on', b.getAttribute('data-mode') === mode));
    if (document.activeElement !== R.todSl && (force || +R.todSl.value !== Math.round(pos))) R.todSl.value = Math.round(pos);
    const C = IT.DayNight.CYCLE || 300, night = pos >= C, within = Math.floor(pos % C), m = Math.floor(within / 60), s = within % 60;
    R.todOut.textContent = t(night ? 'tod.night' : 'tod.day') + ' ' + t('tod.clock', { m, s: String(s).padStart(2, '0') });
  };

  // ---- roster block: rows rebuilt only when the roster / picker / language / skin ownership changes
  H.syncRoster = function (force) {
    const R = H.refs, c = H.c, sb = H.sb; if (!R.rosList || !c || !sb) return;
    const w = c.w, Ro = IT.UI.Roster, t = IT.t, In = IT.Input;
    const units = Ro.list(w, 'enemy').concat(Ro.list(w, 'dummy'));
    if (sb.pick != null && !units.some(e => e.id === sb.pick)) sb.pick = null;
    const own = Ro.skins('enemy').concat(Ro.skins('dummy')).map(s => (s.locked ? 1 : 0)).join('');
    const sig = units.map(e => e.id + ':' + e.ros.skin + ':' + (e.ros.tier || '')).join(',') + '|' + sb.pick + '|' + IT.lang + '|' + own;
    for (const kind of ['enemy', 'dummy']) {
      const b = kind === 'dummy' ? R.addD : R.addE, n = Ro.count(w, kind), full = n >= Ro.MAX[kind];
      b.classList.toggle('full', full);
      const ac = b.querySelector('.ac'); if (ac && ac.textContent !== n + '/' + Ro.MAX[kind]) ac.textContent = n + '/' + Ro.MAX[kind];
      const armed = !!(In.armed && In.armed.place && (In.armed.kind === 'dummy' ? 'dummy' : 'enemy') === kind);
      b.classList.toggle('on', armed);
    }
    if (!force && sb.rsig === sig) return;
    sb.rsig = sig;
    R.rosList.textContent = '';
    const { h } = IT.UI, DB = IT.UI.DiffBar, nth = { enemy: 0, dummy: 0 };
    if (!units.length) { R.rosList.appendChild(h('div', { class: 'ros-none', text: t('ros.none') })); return; }
    for (const e of units) {
      const kind = e.ros.kind, name = t(kind === 'dummy' ? 'ros.dummy' : 'ros.enemy') + ' ' + (++nth[kind]);
      const por = h('button', { type: 'button', class: 'ros-sk' + (sb.pick === e.id ? ' on' : ''), 'data-tip': t('ros.skin.n', { name: Ro.skinName(e.ros.skin, kind) }),
        onclick: ev => { ev.currentTarget.blur(); sb.pick = sb.pick === e.id ? null : e.id; H.syncRoster(true); } }, skinPor(e.ros.skin, kind));
      const x = h('button', { type: 'button', class: 'ros-x', 'aria-label': t('ros.remove'), 'data-tip': t('ros.remove'),
        onclick: ev => { ev.currentTarget.blur(); Ro.remove(w, e); H.syncRoster(true); } }, sbIcon('x'));
      const main = h('div', { class: 'ros-main' }, h('span', { class: 'ros-nm', text: name }));
      if (kind === 'enemy') {
        const bar = DB.create({ value: e.ros.tier, name: t('db.title'), onChange: id => { Ro.edit(w, e, { tier: id }); H.syncRoster(true); } });
        main.appendChild(bar.el);
      }
      const row = h('div', { class: 'ros-row ' + kind }, por, main, x);
      if (sb.pick === e.id) {
        const pick = h('div', { class: 'ros-pick' }, Ro.skins(kind).map(s => h('button', {
          type: 'button', class: 'ros-ps' + (s.id === e.ros.skin ? ' on' : '') + (s.locked ? ' lk' : ''), 'data-tip': s.locked ? t('ros.locked') : s.name,
          onclick: ev => {
            ev.currentTarget.blur();
            if (s.locked) { IT.UI.toast(t('ros.locked'), 'warn'); return; }
            sb.pick = null; Ro.edit(w, e, { skin: s.id }); H.syncRoster(true);
          } }, skinPor(s.id, kind))));
        R.rosList.appendChild(h('div', { class: 'ros-blk' }, row, pick));
      } else R.rosList.appendChild(row);
    }
  };

  // ---- pinned combo guide (item 33)
  H.gdMark = function () {
    const R = H.refs, sb = H.sb, t = IT.t; if (!R.cmap || !sb) return;
    for (const id in R.cmap) {
      const el = R.cmap[id], on = sb.gd.id === id, base = el.getAttribute('data-base') || '';
      el.classList.toggle('on', on); el.setAttribute('aria-pressed', on ? 'true' : 'false');
      el.setAttribute('data-tip', base + (el.classList.contains('lock') ? '' : '\n' + t(on ? 'gd.unpin' : 'gd.pin')));
    }
  };
  H.gdUnpin = function () {
    const c = H.c, sb = H.sb; if (!c || !sb) return;
    if (sb.gdGrant) { IT.UI.Roster.revokeGrant(c.w, sb.gdGrant); sb.gdGrant = null; }
    sb.gd.clear(); H.gdMark();
  };
  // click on a combo: pin it (granting what it needs when "Grant items" is on), swap to it, or (same one) remove the strip
  H.gdToggle = function (cb, ok) {
    const c = H.c, sb = H.sb, t = IT.t; if (!c || !sb) return;
    const same = sb.gd.id === cb.id;
    if (!ok && !same) { IT.UI.toast(t('toast.locked'), 'warn'); return; }
    if (sb.gdGrant) { IT.UI.Roster.revokeGrant(c.w, sb.gdGrant); sb.gdGrant = null; }
    if (!same && c.grant) sb.gdGrant = IT.UI.Roster.grantFor(c.w, cb);
    sb.gd.toggle(cb);
    H.gdMark();
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
        type: 'button', class: 'citem t-' + cb.tier + (ok ? '' : ' lock'), 'data-tip': tip, 'data-base': tip, 'data-id': cb.id,
        onclick: ev => { ev.currentTarget.blur(); H.gdToggle(cb, ok); },
      },
        h('span', { class: 'ci-top' }, h('b', { class: 'ci-name', text: name }), ok ? null : h('span', { class: 'ci-lock' }, sbIcon('lock')), h('em', { class: 'ci-tier', text: t('sbx.t.' + cb.tier) })),
        h('span', { class: 'ci-steps' }, shown.map(s => CBar.stepIcon(s)), steps.length > shown.length ? h('i', { class: 'more', text: '+' + (steps.length - shown.length) }) : null));
      R.list.appendChild(el); R.cmap[cb.id] = el;
      const hay = [(cb.name && cb.name.en) || '', (cb.name && cb.name.pt) || '', ...steps.map(s => abName(s.ability))].join(' ').toLowerCase();
      R.rows.push({ el, cb, hay });
    }
    R.empty = h('div', { class: 'cnone', text: t('sbx.none'), hidden: true }); R.list.appendChild(R.empty);
    H.filterList();
    H.gdMark();
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

  // guide strip per frame: build the chips for the pinned combo, advance the lit step, hold the finished chain (check mark + counter), then reset
  function updGuide(dt, hero, ca) {
    const R = H.refs, sb = H.sb, gd = sb.gd, t = IT.t;
    if (!R.gd) return;
    const on = gd.active();
    if (R.gd.hidden === on) R.gd.hidden = !on;
    if (!on) { ca.gdSig = null; return; }
    const sig = gd.rev + '|' + IT.lang + '|' + chipSig(hero);
    if (ca.gdSig !== sig) {
      ca.gdSig = sig; ca.gdSt = null;
      rkBuildChips(R.gdR, { def: gd.def }, true, true);
      R.gd.setAttribute('data-tip', ((gd.def.name && (gd.def.name[IT.lang] || gd.def.name.en)) || gd.id) + '\n' + t('gd.unpin'));
    }
    if (gd.tick(dt)) ca.gdSt = null;
    const st = gd.states(), k = st.join('') + '|' + (gd.hold > 0 ? 1 : 0) + '|' + gd.laps;
    if (ca.gdSt === k) return;
    ca.gdSt = k;
    R.gdR.rkChips.forEach((c, i) => { c.classList.toggle('done', st[i] === 'done'); c.classList.toggle('now', st[i] === 'now'); });
    R.gd.classList.toggle('fin', gd.hold > 0);
    R.gdOk.setAttribute('data-tip', t('gd.done'));
    R.gdCnt.textContent = gd.laps > 0 ? t('gd.count', { n: gd.laps }) : '';
  }

  // per-frame: meter, auto-refresh, roster / time-of-day sync, guide strip
  H.updSide = function (dt, w, hero, ca) {
    const R = H.refs, sb = H.sb, t = IT.t; if (!sb) return;
    const now = w.t;
    while (H.dps.length && now - H.dps[0][0] > 10) H.dps.shift();
    let s5 = 0; for (const d of H.dps) if (now - d[0] <= 5) s5 += d[1];
    const dps = Math.round(s5 / 5);
    if (H.total === 0) sb.peak = 0;   // meter reset (Reset targets / new scenario)
    if (dps > sb.peak) sb.peak = dps;
    setText(R.dpsN, String(dps), ca, 'dps'); setText(R.totN, String(Math.round(H.total)), ca, 'tot');
    setText(R.peakN, sb.peak ? t('sbx.peak', { n: sb.peak }) : '', ca, 'pk');
    sb.sp += dt; if (sb.sp > 0.12) { sb.sp = 0; if (R.sideP.isOpen()) H.drawSpark(now); }
    if (sb.auto && hero) {
      for (const k in hero.cd) hero.cd[k] = 0;
      if (hero.inv) hero.inv.invokeCd = 0;
      for (const it of hero.items || []) if (it) it.cd = 0;
      hero.mana = hero.maxMana;
    }
    sb.tc += dt;
    if (sb.tc > 0.25) { sb.tc = 0; H.syncRoster(false); H.syncTod(false); }
    updGuide(dt, hero, ca);
  };


  H.unbind = function () {
    for (const f of H.off) { try { f(); } catch (e) { /* ignore */ } }
    H.off = []; H.c = null; H.refs = {};
    if (IT.ComboBar && IT.ComboBar.unbind) IT.ComboBar.unbind();
    const root = document.getElementById('hud'); if (root) root.textContent = '';
  };

  // ---------------------------------------------------------------- toggles
  H.cheatToggle = function () { if (H.refs.cheatP) H.refs.cheatP.toggle(); };
  H.buildCheat = function () {
    const { h, icon } = IT.UI, t = IT.t, GM = IT.GAME, R = H.refs, S = IT.Settings;
    R.cheat.textContent = '';
    const key = S.keyOf('cheat');
    R.cheat.appendChild(h('div', { class: 'chead' }, h('span', { text: t('cheat.hint', { key: S.label(key) }) })));
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
  H.statsShow = function (on) { if (H.refs.liveP) H.refs.liveP.setOpen(on); };
  H.statsToggle = function () { if (H.refs.liveP) H.refs.liveP.toggle(); };
  H.buildLive = function () {
    const c = H.c; if (!c || !c.w._stats) return;
    const { h } = IT.UI, t = IT.t, R = H.refs;
    const S = c.w._stats.summary();
    R.live.textContent = '';
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
      const sheet = U.kind === 'hero' ? IT.Art.heroSheet() : U.kind === 'spirit' ? 'forge' : U.kind === 'roshan' ? 'roshan' : (IT.Art.sheets[U.skin] ? U.skin : U.kind === 'ally' ? 'default' : null);
      const bp = bld && IT.TowerDraw && IT.TowerDraw.portrait ? IT.TowerDraw.portrait(U, w) : null;
      R.upor.textContent = ''; R.upor.appendChild(bp || (sheet ? fitPor(sheet) : h('div', { class: 'hgen', text: '?' })));
      const foeCard = U.team === 1 || U.kind === 'roshan';   // v6 item 28: Roshan is hostile (red HP)
      R.upor.classList.toggle('foe', foeCard); R.uhp.classList.toggle('foe', foeCard);
      R.uname.textContent = U.name || (U.kind === 'ally' ? IT.UnitDraw.allyName() : U.kind === 'roshan' ? IT.UnitDraw.roshName() : t('hud.unit'));
      R.ucore.style.display = bld ? 'none' : '';
      const note = bld ? [U.team === 0 ? 'Radiant' : U.team === 1 ? 'Dire' : ul('Neutral', 'Neutro'), U.invulnerable ? ul('Invulnerable', 'Invulnerável') : U.destroyed ? ul('Destroyed', 'Destruída') : ''].filter(Boolean).join('  |  ') : '';
      R.unote.textContent = note; R.unote.style.display = note ? '' : 'none';
      R.uitems.forEach(b => { b.el.style.display = own || bld ? 'none' : ''; });
      R.ucmd.forEach(b => {
        b.el.style.display = own ? '' : 'none';
        if (own && !b.ic.firstChild && hasIcon(UCMD_ICON[b.act])) b.ic.appendChild(icon(UCMD_ICON[b.act]));
        b.el.title = { attack: ul('Attack', 'Atacar'), stop: ul('Stop', 'Parar'), hold: ul('Hold', 'Segurar') }[b.act];
      });
      for (const k of Object.keys(ca)) if (k === 'uhp' || k === 'ump' || k === 'uk' || k.indexOf('uc') === 0 || k.indexOf('us') === 0) delete ca[k];
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
    if (ca.ump !== mk) { ca.ump = mk; R.umpt.textContent = mk; R.umpf.style.width = (U.maxMana ? Math.max(0, U.mana / U.maxMana) * 100 : 0) + '%'; }
    R.ustrip.style.display = U.building ? 'none' : '';
    if (!U.building) {
      paintCells(R.uc, CORE, U, ca, 'uc'); paintCells(R.us, ['mr', 'hpr', 'mpr'], U, ca, 'us'); paintBuffs(R, U, w, ca, 'usc');
    }
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
      const lv = IT.HudSteps && IT.HudSteps.heroLv ? IT.HudSteps.heroLv(rk) : '';
      setText(R.rkHint, (lv ? lv + ' — ' : '') + (IT.hasT('rk.countdown.hint') ? IT.t('rk.countdown.hint') : IT.t('rk.countdown.hint.fb')), ca, 'rkhint');
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
      setText(b.lvl, '', ca, 'l' + k);   // no corner number: the level is the pip row under the icon
      const bonus = eff[k] - hero.ctx.orbs[k], pk = hero.ctx.orbs[k] + ':' + bonus;
      if (ca['pp' + k] !== pk) { ca['pp' + k] = pk; if (b.pips) b.pips.remove(); b.pips = IT.UI.orbPips.el(IT.UI.h, k, IT.UI.orbPips.model(hero.ctx.orbs[k], bonus)); b.el.appendChild(b.pips); }
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
    H.updClock(R, ca);
    H.updHood(R, ca, w.loadout || {}, dt);
    // orbs (a status) sit centred over the ability row; other statuses take slots to their right
    const lk = innerWidth + 'x' + innerHeight + ':' + (U ? 1 : 0);
    if (ca.statPos !== lk && R.bar.offsetParent) {
      const ab = R.q.el.closest('.abrow').getBoundingClientRect(), rt = R.stat.parentNode.getBoundingClientRect(), ow = R.orbs.getBoundingClientRect().width;
      if (ab.width && ow) { ca.statPos = lk; R.stat.style.left = Math.round(ab.left + ab.width / 2 - ow / 2 - rt.left) + 'px'; }
    }
    // core box + secondary strip (stats) + buff row of the hero; the selected unit's own are painted in H.updUnit
    if (!U) { paintCells(R.hc, CORE, hero, ca, 'hc'); paintCells(R.hs, SEC, hero, ca, 'hs'); paintBuffs(R, hero, w, ca, 'hsc'); }
    // sandbox panel
    if (R.dpsN) H.updSide(dt, w, hero, ca);
    if (H.statsOn) { H.accT += dt; if (H.accT > 0.4) { H.accT = 0; H.buildLive(); } }
    if (IT.ComboBar) IT.ComboBar.update(dt);
    if (IT.DummyChat && IT.DummyChat.update) IT.DummyChat.update(dt);
  };
  H.resetMeter = function () { H.dps = []; H.total = 0; };

  IT.HUD = H;
})(typeof window !== 'undefined' ? window : globalThis);
