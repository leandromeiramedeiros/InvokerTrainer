// Play-time input: keyboard/mouse (rebindable via IT.Settings), cast modes, attack-move, self-cast, camera keys, selection,
// window-edge scroll, fullscreen, optional pointer lock. IT.Input singleton.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const GM = IT.GAME, P = GM.UNIT_PX;   // view size: GM.VIEW_W/VIEW_H (live, scroll-wheel zoom)
  const sfx = n => { if (typeof G.SFX !== 'undefined' && G.SFX.enabled && G.SFX.play) { try { G.SFX.play(n); } catch (e) { /* ignore */ } } };
  const HOVER = 70;          // extra pick radius (world units) around a unit's hull: quick-cast must forgive sloppy aim
  const EDGE_PX = 3;         // window-edge scroll band (CSS px)
  const PEND_MAX = 1.5;      // s: a pending cast older than this is replaced, not queued behind
  const DEFER_MAX = 2000;    // ms: deferred invoke runs anyway after this
  const RMB_MS = 125;        // rmbRepeat: re-issue the right click this often while held
  const CATA_MAX = 300;      // ms: max wait for the 2nd press that turns Sun Strike into Cataclysm

  const In = {
    enabled: false, ctx: null, armed: null, selected: null,   // selected: unit id shown in the HUD (null = hero)
    keys: new Set(), mouse: { x: 0, y: 0, in: false },
    win: { x: 0, y: 0, in: false },     // cursor in window (client) px, for edge scroll
    locked: false, vx: 0, vy: 0,        // pointer lock: virtual cursor (client px)
    hooks: {},    // pause, statsHold(bool), cheat, refresh, spawn, resetDummies, debug
    sfx,
    now: () => (G.performance && G.performance.now ? G.performance.now() : Date.now()),
    _q: [], _tap: {}, _ctap: 0, _cat: null, _rmb: null, _done: null,
    sel: { units: [], group: 'hero', auto: false },   // commanded units: group 'hero' | 'spirits' | 'all' (ids resolved lazily, dead dropped)
    _drag: null, _held: new Set(), _ctrlEv: false, preview: null,   // box-select drag; held ability actions; Ctrl seen on a mouse event; HUD hover preview id
  };

  const S = () => IT.Settings.get();
  const cur = k => { if (IT.Cursor) IT.Cursor.set(k); };

  // ---------------------------------------------------------------- helpers
  function worldMouse() { return In.ctx.cam.toWorld(In.mouse.x, In.mouse.y); }
  // nearest unit to point p within (hull + HOVER); ok(e) filters
  function hover(p, ok) {
    const w = In.ctx.w;
    let best = null, bd = Infinity;
    for (const e of w.ents) {
      if (e.dead || e.kind === 'thinker' || e.kind === 'proj' || !ok(e)) continue;
      const d = IT.U.dist2(e.x, e.y, p.x, p.y), lim = (e.radius || 0) + HOVER;
      if (d <= lim * lim && d < bd) { bd = d; best = e; }
    }
    return best;
  }
  function unitAt(p, team) {
    const w = In.ctx.w;
    return hover(p, e => e.team === team && !(w.fog && team === 1 && !e.visible));
  }
  function pickTarget(d, p) {
    const { w, hero } = In.ctx;
    return hover(p, e => d.filter(w, hero, e));
  }
  const fail = reason => { const c = In.ctx; c.w.emit('fail', { unit: c.hero.id, reason }); };

  function abilityId(action) {
    const { hero } = In.ctx;
    if (action === 'slot1') return hero.inv.slots[0];
    if (action === 'slot2') return hero.inv.slots[1];
    if (/^item[1-6]$/.test(action)) { const it = hero.items[+action.slice(4) - 1]; return it ? it.id : '__none'; }
    if (IT.Abilities.get(action) && IT.Abilities.get(action).kind === 'spell') return action;
    return null;
  }
  const isAbilityAction = a => /^(slot[12]|item[1-6])$/.test(a) || !!(IT.Abilities.get(a) && IT.Abilities.get(a).kind === 'spell');
  const isSeq = a => /^orb[QWE]$/.test(a) || a === 'invoke' || isAbilityAction(a);
  const isSkipAction = a => isSeq(a) || /^(attack|stop|hold)$/.test(a);   // first of these during the pre-scenario countdown starts the run and is executed
  const isFrozenOk = a => a === 'center' || a === 'camLock' || a === 'cheat';   // usable during the countdown without ending it
  // v6: orbs + Invoke run during the scenario countdown WITHOUT starting the round (build your spells); move / cast / item / attack / stop / hold start it
  const isWarmup = a => /^orb[QWE]$/.test(a) || a === 'invoke';
  const countingDown = () => { const r = In.ctx && In.ctx.w && In.ctx.w.ranked; return !!(r && r.phase === 'countdown'); };
  // playtest 2: between rounds the result card waits for any key / click (Ranked run.cont; ignored before its 1 s minimum). Consumed: never an action
  const inResult = () => { const r = In.ctx && In.ctx.w && In.ctx.w.ranked; return !!(r && r.phase === 'result' && r.cont && In.inspecting()); };
  const MOD_KEY = { Shift: 1, Control: 1, Alt: 1, Meta: 1, AltGraph: 1, CapsLock: 1, OS: 1 };

  // Is a different cast still on its way (turning / walking / cast point)? Then a new cast must queue behind it, not drop it.
  function pendingCast(id) {
    const { w, hero } = In.ctx, o = hero.orders[0];
    return !!(o && o.type === 'cast' && o._ph !== 'channel' && o.ability !== id && w.t - (o.at || 0) < PEND_MAX && hero.orders.length < 4);
  }
  function issueCast(o) {
    const { w, hero } = In.ctx;
    if (!o.queued && pendingCast(o.ability)) {
      const r = IT.Abilities.check(w, hero, o.ability, o);
      if (r) { fail(r); return false; }
      o.queued = true;
    }
    o.at = w.t;
    return IT.Orders.issue(w, hero, o);
  }

  // Try to cast `id`. how: 'key' (quick -> at cursor), 'hud' (always arms if targeted), 'click' (armed click).
  // snap: {p} cursor position captured when a deferred key was pressed.
  function cast(id, how, queued, snap) {
    const { w, hero } = In.ctx;
    if (!id) return;
    if (id === '__none') { fail('noItem'); return; }
    const d = IT.Abilities.get(id);
    if (!d) return;
    // playtest 2: a spell that is not invoked does nothing -- fail SFX only, no "Not invoked" toast (the reason string is gone from i18n)
    if (d.kind === 'spell' && IT.Abilities.check(w, hero, id, null) === 'notInvoked') { sfx('fail'); return; }
    if (d.target === 'none') { In.cancel(true); issueCast({ type: 'cast', ability: id, queued: !!queued }); return; }
    const normal = S().castMode === 'normal';
    if (how !== 'click' && (normal || how === 'hud')) {
      // pre-check castability so we don't arm something that cannot be used
      const why = IT.Abilities.check(w, hero, id, null);
      if (why && why !== 'noTarget') { fail(why); return; }
      In.armed = { id, queued: !!queued };
      sfx('click');
      return;
    }
    const p = snap ? snap.p : worldMouse(), o = { type: 'cast', ability: id, queued: !!queued };
    if (d.target === 'point') { o.x = p.x; o.y = p.y; }
    else {
      let t = pickTarget(d, p);
      if (!t && id === 'alacrity') t = hero;
      if (!t) {   // quick-cast key with nothing under the cursor: keep the press alive as armed targeting (click casts), never lose it
        if (how === 'click') { fail('noTarget'); return; }
        In.armed = { id, queued: !!queued }; sfx('click'); return;
      }
      o.target = t.id;
    }
    if (how !== 'click') In.armed = null;
    issueCast(o);
  }

  // Self-cast: alacrity -> hero; blink -> max range toward the bottom-left corner (fountain). Others: not self-castable.
  function selfCast(id, queued) {
    const { w, hero } = In.ctx;
    if (id === 'alacrity') { In.armed = null; issueCast({ type: 'cast', ability: id, target: hero.id, queued: !!queued }); return true; }
    if (id === 'sunstrike' && cataReady()) { In.armed = null; In._cat = null; issueCast(cataOrder(queued)); return true; }
    if (id === 'blink') {
      const m = w.map, ty = m && m.H ? m.H : hero.y;
      const dx = 0 - hero.x, dy = ty - hero.y, d = Math.hypot(dx, dy);
      const R = (IT.Values.item(GM.ITEM_DOTA.blink, 'blink_range') || 1200) - 1;
      In.armed = null;
      if (d < 1) { fail('noTarget'); return true; }
      const k = Math.min(R, d) / d;
      issueCast({ type: 'cast', ability: id, x: hero.x + dx * k, y: hero.y + dy * k, queued: !!queued });
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- selection (hero + forge spirits) and group orders
  const DRAG_PX = 5;   // client px before a left press becomes a box select
  const isFoe = e => (IT.Units && IT.Units.isFoe ? IT.Units.isFoe(e) : e.kind === 'dummy' || e.kind === 'enemy');
  const inspectable = e => isFoe(e) || e.kind === 'tower';   // click-select only: no orders, no box select
  const mine = e => !!e && !e.dead && e.team === 0 && (e.kind === 'hero' || e.kind === 'spirit');   // only these can be box-selected / commanded
  function spirits() {
    const c = In.ctx; if (!c) return [];
    return c.w.ents.filter(e => e.kind === 'spirit' && !e.dead && e.team === 0 && (e.owner == null || e.owner === c.hero.id));
  }
  function setSel(ids, group, auto) { In.sel = { units: ids.slice(), group, auto: !!auto }; }
  // v6: the HUD card follows a spirits-only selection (first spirit) unless a foe / building is being inspected.
  // In.selected: unit id (foe / tower / own spirit) or 'S<i>' = map.structures[i] (static, invulnerable building)
  const isStruct = v => typeof v === 'string' && v[0] === 'S';
  function ownCard() {   // the card shows one of the commanded spirits
    const c = In.ctx, v = In.selected; if (!c || v == null || isStruct(v)) return false;
    const e = c.w.get(v); return mine(e) && e.kind === 'spirit' && In.sel.units.includes(v);
  }
  In.ownCard = ownCard;
  // an action / order drops an inspected foe or building, never the spirit card (orders keep going to the spirit)
  function clearInspect() { if (In.selected != null && !ownCard()) In.selected = null; syncCard(); }
  function syncCard() {
    const c = In.ctx; if (!c) return;
    const v = In.selected;
    if (v != null && !isStruct(v)) { const e = c.w.get(v); if (!e || e.dead || (mine(e) && !ownCard())) In.selected = null; }
    if (In.selected == null && In.sel.group === 'spirits' && In.sel.units.length) In.selected = In.sel.units[0];
  }
  In.syncCard = syncCard;
  In.selectedUnit = function (w) {   // what the HUD card shows (null = hero bar)
    const v = In.selected; w = w || (In.ctx && In.ctx.w);
    if (v == null || !w) return null;
    if (isStruct(v)) { const s = w.map && w.map.structures && w.map.structures[+v.slice(1)]; return s && IT.Towers && IT.Towers.structCard ? IT.Towers.structCard(w.map, s) : null; }
    const e = w.get(v); return e && !e.dead ? e : null;
  };
  In.setSel = setSel;
  function resetSel() { In.sel = { units: In.ctx ? [In.ctx.hero.id] : [], group: 'hero', auto: false }; }
  // drop dead ids; 'auto' selections follow every living spirit (new ones join); an empty selection falls back to the hero
  function syncSel() {
    const c = In.ctx; if (!c) return;
    const sel = In.sel, sp = spirits();
    if (sel.auto && sel.group !== 'hero') sel.units = (sel.group === 'all' ? [c.hero.id] : []).concat(sp.map(e => e.id));
    else sel.units = sel.units.filter(id => mine(c.w.get(id)));
    if (!sel.units.length) resetSel();
    else {
      const hasH = sel.units.includes(c.hero.id), hasS = sel.units.some(id => id !== c.hero.id);
      sel.group = hasH && hasS ? 'all' : hasS ? 'spirits' : 'hero';
    }
  }
  function selUnits() { syncSel(); return In.sel.units.map(id => In.ctx.w.get(id)).filter(Boolean); }
  In.selUnits = selUnits;
  In.ctrlHeld = () => In.keys.has('Control') || In._ctrlEv;
  // units that receive an order: CTRL (setting unifiedOrders) = hero + every spirit, else the selection
  function orderUnits() {
    const c = In.ctx;
    if (S().unifiedOrders && In.ctrlHeld()) return [c.hero].concat(spirits());
    return selUnits();
  }
  In.orderUnits = orderUnits;
  function giveOrder(o) {
    const { w, hero } = In.ctx, us = orderUnits().filter(u => u && !u.dead);
    if (!us.length) us.push(hero);
    // a lone spirit goes through issueGroup too (player flag): a spirit the player already commanded ignores plain AI-style issues
    if (us.length === 1 && (us[0] === hero || !IT.Orders.issueGroup)) return IT.Orders.issue(w, us[0], o);
    if (IT.Orders.issueGroup) return IT.Orders.issueGroup(w, us, o);
    let ok = false;
    for (const u of us) ok = IT.Orders.issue(w, u, o) || ok;
    return ok;
  }
  // TAB: hero <-> spirits group (spirits skipped when none are alive)
  In.cycleSel = function () {
    const c = In.ctx; if (!c || c.w.paused) return false;
    In.selected = null; syncSel();
    if (In.sel.group === 'hero') {
      const sp = spirits();
      if (sp.length) { setSel(sp.map(e => e.id), 'spirits', true); syncCard(); sfx('click'); return true; }
      return false;
    }
    resetSel(); sfx('click'); return true;
  };
  // screen-space rect (view px) of the running drag, or null while it is still a click
  function dragRect() {
    const d = In._drag, c = In.ctx; if (!d || !c || !d.moved) return null;
    const a = c.cam.toScreen(d.w0.x, d.w0.y);
    return { x0: Math.min(a.x, In.mouse.x), x1: Math.max(a.x, In.mouse.x), y0: Math.min(a.y, In.mouse.y), y1: Math.max(a.y, In.mouse.y) };
  }
  function inRect(e, r) {
    const s = In.ctx.cam.toScreen(e.x, e.y), m = (e.radius || 0) / P + 3;
    const ix = s.x >= r.x0 - m && s.x <= r.x1 + m, iy = y => y >= r.y0 - m && y <= r.y1 + m;
    return ix && (iy(s.y) || iy(s.y - 8));   // ground point or body (the sprite is drawn above it)
  }
  function boxCandidates(r) {   // player units only: towers / dummies / enemies are never box-selected
    const c = In.ctx, out = [];
    for (const e of c.w.ents) if (mine(e) && !isFoe(e) && (e.kind === 'hero' ? e === c.hero : (e.owner == null || e.owner === c.hero.id)) && inRect(e, r)) out.push(e);
    return out;
  }
  function finishDrag(ev) {
    const d = In._drag, r = dragRect(); In._drag = null;
    if (!d || !r || !In.ctx || In.ctx.w.paused) return;
    const c = In.ctx, hit = boxCandidates(r);
    In.selected = null;
    let ids = hit.map(e => e.id);
    if (ev && ev.shiftKey) ids = Array.from(new Set(In.sel.units.concat(ids)));
    if (!ids.length) return;
    const sp = spirits(), hasH = ids.includes(c.hero.id), nS = ids.filter(id => id !== c.hero.id).length;
    setSel(ids, hasH && nS ? 'all' : nS ? 'spirits' : 'hero', nS > 0 && nS === sp.length);   // every spirit selected -> auto-group (new ones join)
    syncCard(); sfx('click');
  }

  // own unit (hero or this hero's spirit) under the cursor
  function ownAt(p) { const c = In.ctx; return hover(p, e => mine(e) && (e.kind === 'hero' ? e === c.hero : (e.owner == null || e.owner === c.hero.id))); }
  // foe / tower / static building under the cursor -> In.selected value (null = nothing)
  function inspectAt(p) {
    const t = unitAt(p, 1); if (t && inspectable(t)) return t.id;
    const b = IT.Towers && IT.Towers.buildingAt ? IT.Towers.buildingAt(In.ctx.w, p, P) : null;
    return b ? (b.ent ? b.ent.id : 'S' + b.struct) : null;
  }
  function clickOwn(e, shift) {
    const c = In.ctx;
    if (e === c.hero) {
      if (shift) { if (!In.sel.units.includes(e.id)) setSel(In.sel.units.concat(e.id), 'all', false); }
      else { In.selected = null; setSel([e.id], 'hero', false); }
      syncSel(); sfx('click'); return;
    }
    if (shift) {
      const has = In.sel.units.includes(e.id), ids = has ? In.sel.units.filter(id => id !== e.id) : In.sel.units.concat(e.id);
      setSel(ids.length ? ids : [c.hero.id], 'hero', false); syncSel();
      if (!has && In.sel.group === 'spirits') In.selected = e.id;
    } else { setSel([e.id], 'spirits', false); In.selected = e.id; }
    syncCard(); sfx('click');
  }

  // ---------------------------------------------------------------- Cataclysm (scepter Sun Strike): double press = self-cast
  function cataReady() {
    const { w, hero } = In.ctx, d = IT.Abilities.get('sunstrike');
    if (!d || !d.dota || !hero.inv || !hero.inv.slots.includes('sunstrike') || !IT.Values.has(d.dota, 'cataclysm_count')) return false;
    if (!(IT.Values.get(d.dota, 'cataclysm_count', hero.ctx || w.ctx) > 0)) return false;
    return !IT.Abilities.check(w, hero, 'sunstrike', null);   // cooldown / mana / silence -> not available -> no delay
  }
  const cataOrder = queued => { const { hero } = In.ctx; return { type: 'cast', ability: 'sunstrike', target: hero.id, x: hero.x, y: hero.y, queued: !!queued }; };
  // fire the held first press as a normal Sun Strike at the point captured when it was pressed
  function resolveCat() {
    const c = In._cat; if (!c) return;
    In._cat = null;
    if (!In.ctx) return;
    In._tap[c.action] = 0;
    cast('sunstrike', 'key', c.queued, { p: c.p });
  }
  In.resolveCat = resolveCat;
  // per-tick/per-frame upkeep that must not depend on the render rate: deferred keys, Cataclysm window, RMB auto-repeat
  function tick() {
    const c = In.ctx; if (!c || !In.enabled) return;
    if (c.w.paused) { if (In._cat) resolveCat(); In._rmb = null; return; }
    flush();
    if (In._cat && In.now() - In._cat.t >= In._cat.win) resolveCat();
    const r = In._rmb;
    if (r) {
      if (!S().rmbRepeat || !In.win.in) { In._rmb = null; return; }
      const now = In.now();
      if (now - r.t >= RMB_MS) {
        r.t = now - r.t > 2 * RMB_MS ? now : r.t + RMB_MS;
        if (In.mouse.in && !In.armed && In.rightClick) In.rightClick(false);
      }
    }
  }
  In.tick = tick;

  // ---------------------------------------------------------------- deferred sequence (orbs / invoke / casts keep their order)
  // An invoke that would evict a spell whose cast has not fired yet waits for that cast; later keys wait behind it.
  function evictsPending() {
    const { hero } = In.ctx, inv = hero.inv, sp = IT.Invoke.recipeOf(inv.orbs);
    if (!sp || inv.slots.includes(sp)) return false;
    const victim = inv.slots[1];
    return !!victim && hero.orders.some(o => o !== In._done && o.type === 'cast' && o.ability === victim && o._ph !== 'channel');
  }
  function flush() {
    const c = In.ctx; if (!c || c.w.paused) return;
    const q = In._q, now = In.now();
    while (q.length) {
      const j = q[0];
      if (j.action === 'invoke' && now - j.t < DEFER_MAX && evictsPending()) break;
      q.shift();
      exec(j.action, j.opts, j.snap);
    }
  }

  // ---------------------------------------------------------------- actions (shared by keys and HUD buttons)
  In.doAction = function (action, opts) {
    if (!In.ctx) return;
    opts = Object.assign({}, opts);
    const { w } = In.ctx;
    if (w.paused) {   // frozen ranked countdown: camera / select / sheet keys work; orbs + invoke run without ending it; the first real action (cast, item, attack, stop, hold, move) ends it AND runs
      if (!In.inspecting()) return;
      if (isFrozenOk(action)) { /* handled below without skipping */ }
      else if (isWarmup(action) && countingDown()) { exec(action, opts, null); return; }
      else if (!isSkipAction(action) || !In.hooks.skip || !In.hooks.skip()) return;
    }
    if (action !== 'center') clearInspect();     // any player action drops an inspected foe / building ('center' decides itself: 1st press selects the hero); a selected spirit keeps its card
    // Cataclysm: Sun Strike key with the scepter spell ready -> press 1 holds, press 2 = self-cast, window over = normal strike
    const sun = !opts.hud && isAbilityAction(action) && abilityId(action) === 'sunstrike';
    if (In._cat && !(sun && In._cat.id === 'sunstrike')) { if (action === 'stop' || action === 'hold') In._cat = null; else resolveCat(); }
    if (sun && S().doubleTap && !opts.self) {
      const normal = S().castMode === 'normal';
      if (In._cat) {   // quick-cast second press
        const q = opts.queued || In._cat.queued;
        In._cat = null; In._tap[action] = 0; In.armed = null;
        issueCast(cataOrder(q));
        return;
      }
      if (normal && In.armed && In.armed.id === 'sunstrike' && cataReady()) {   // normal cast: armed, second press
        const q = opts.queued || In.armed.queued;
        In.armed = null; issueCast(cataOrder(q)); return;
      }
      if (!normal && !In._q.length && cataReady()) {
        In._cat = { id: 'sunstrike', action, p: worldMouse(), queued: !!opts.queued, t: In.now(), win: Math.min(S().doubleTapTimeout, CATA_MAX / 1000) * 1000 };
        return;
      }
    }
    if (isAbilityAction(action) && !opts.hud) {   // double-tap (same key twice within the timeout) = self-cast
      const now = In.now(), s = S(), prev = In._tap[action];
      if (s.doubleTap && prev && now - prev <= s.doubleTapTimeout * 1000) { opts.self = true; In._tap[action] = 0; } else In._tap[action] = now;
    }
    flush();
    if (isSeq(action) && (In._q.length || (action === 'invoke' && evictsPending()))) {
      In._q.push({ action, opts, snap: { p: worldMouse() }, t: In.now() });
      return;
    }
    exec(action, opts, null);
  };

  function exec(action, opts, snap) {
    const { w, hero, cam } = In.ctx, how = opts.hud ? 'hud' : 'key';
    switch (action) {
      case 'orbQ': case 'orbW': case 'orbE': IT.Invoke.orb(w, hero, action.slice(3)); return;
      case 'invoke': IT.Invoke.invoke(w, hero); return;
      case 'attack': In.armed = { id: 'attack', attack: true, queued: !!opts.queued }; sfx('click'); return;
      case 'stop': case 'hold': {
        In.cancel(true); In._cat = null;
        if (orderUnits().includes(hero)) In._q = In._q.filter(j => !isAbilityAction(j.action));   // spells belong to Invoker: stopping only the spirits keeps his queue
        giveOrder({ type: action }); return;
      }
      case 'select': In.cycleSel(); return;
      case 'center': {   // Select hero / Center camera: 1st press selects Invoker alone, 2nd (he is already the only selection) centers the camera
        syncSel();
        const only = In.selected == null && In.sel.group === 'hero' && In.sel.units.length === 1 && In.sel.units[0] === hero.id;
        if (!only) { In.selected = null; setSel([hero.id], 'hero', false); sfx('click'); return; }
        glide(cam, hero.x, hero.y); cam.follow = true;
        return;
      }
      case 'camLock': cam.lock = !cam.lock; return;
      case 'cheat': case 'refresh': case 'spawn': case 'resetDummies': if (In.hooks[action]) In.hooks[action](); return;
      default: {
        const id = abilityId(action);
        if (id === null) return;
        if (opts.self && selfCast(id, opts.queued)) return;
        cast(id, how, opts.queued, snap);
      }
    }
  }
  In.castId = (id, opts) => {
    if (!In.ctx || In.ctx.w.paused) return;
    clearInspect();
    cast(id, opts && opts.hud ? 'hud' : 'key', opts && opts.queued);
  };
  In.cancel = function (silent) {
    if (In.armed) { In.armed = null; if (!silent) IT.UI.toast(IT.t('toast.cancelled'), 'info'); return true; }
    return false;
  };

  // Mouse side buttons as bindable keys. Settings key-capture calls this for mousedown events.
  In.mouseKeyName = ev => (ev && ev.button === 3 ? 'Mouse4' : ev && ev.button === 4 ? 'Mouse5' : null);

  const glide = (cam, x, y) => (cam.glideTo || cam.centerOn).call(cam, x, y);

  // key name pressed -> action (H falls back to the recipe cheat sheet)
  function press(k, mods) {
    let a = IT.Settings.actionFor(k);
    if (!a && k === 'H') a = 'cheat';
    if (!a) return false;
    if (a === 'stats') { In._held.add('stats'); if (In.hooks.statsHold) In.hooks.statsHold(true); return true; }
    if (isAbilityAction(a)) In._held.add(a);
    In.doAction(a, { queued: !!mods.shift, self: !!mods.alt });
    return true;
  }
  function release(k) {
    const ra = k ? IT.Settings.actionFor(k) : null;
    if (ra) { In._held.delete(ra); if (ra === 'stats' && In.hooks.statsHold) In.hooks.statsHold(false); }
    if (k && ra === 'center' && In.ctx) { const c = In.ctx; if (c.cam.follow) glide(c.cam, c.hero.x, c.hero.y); c.cam.follow = false; }   // finish the glide to where the hero is
  }

  In.inspecting = () => !!(In.hooks.inspect && In.hooks.inspect());
  In.keyDown = function (ev) {
    if (!In.enabled || !In.ctx) return;
    const tg = ev.target, tag = tg && tg.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT' || (tg && tg.isContentEditable) || (tag === 'INPUT' && !/^(checkbox|radio|range|button|submit)$/.test(tg.type || ''))) return;
    const w = In.ctx.w;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      resolveCat();
      if (ev.repeat) return;
      if (w.paused) { if (In.now() - (In._unlockAt || -1e9) > 250 && In.hooks.pause) In.hooks.pause(); return; }   // (ESC that just left pointer lock already paused)
      if (In.armed) In.cancel();
      else if (In.selected != null && !ownCard()) In.selected = null;
      else if (In.hooks.pause) In.hooks.pause();
      return;
    }
    if (inResult() && !MOD_KEY[ev.key]) { ev.preventDefault(); if (!ev.repeat) w.ranked.cont(); return; }
    if (ev.key === 'Tab') { ev.preventDefault(); if (!ev.repeat && !w.paused) In.cycleSel(); return; }
    if (/^F\d+$/.test(ev.key) && (ev.key === 'F1' || IT.Settings.actionFor(ev.key))) ev.preventDefault();   // F1 never opens the browser help; any bound function key stays in the game (also while paused / frozen)
    { const sk = IT.Settings.keyName(ev); if (sk && !ev.repeat && IT.Settings.actionFor(sk) === 'stats') { ev.preventDefault(); press(sk, {}); return; } }   // live stats also work while paused
    const insp = w.paused && In.inspecting();
    if (w.paused && !insp) return;
    if (ev.key === 'Alt') { ev.preventDefault(); return; }      // keep Alt from focusing the browser menu
    if (ev.metaKey) return;
    In.keys.add(ev.key);
    if (ev.key === 'F3') { ev.preventDefault(); if (!ev.repeat && In.hooks.debug) In.hooks.debug(); return; }
    if (ev.repeat) { if (/^Arrow/.test(ev.key) || ev.key === ' ') ev.preventDefault(); return; }
    const k = IT.Settings.keyName(ev);
    if (!k) return;
    if (insp) {   // frozen countdown: camera / select keys work, an action key starts the run and is executed
      const a = IT.Settings.actionFor(k);
      if (a && (isFrozenOk(a) || isSkipAction(a))) press(k, { shift: ev.shiftKey, alt: ev.altKey });
      if (/^Arrow/.test(ev.key) || ev.key === ' ') ev.preventDefault();
      return;
    }
    if (!press(k, { shift: ev.shiftKey, alt: ev.altKey })) { if (/^Arrow/.test(ev.key) || ev.key === ' ') ev.preventDefault(); return; }
    ev.preventDefault();
  };
  In.keyUp = function (ev) {
    In.keys.delete(ev.key);
    if (ev.key === 'Control') In._ctrlEv = false;
    if (In.ctx) release(IT.Settings.keyName(ev));
  };

  // ---------------------------------------------------------------- fullscreen / pointer lock
  In.toggleFullscreen = function () {
    const d = G.document; if (!d) return;
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) { const x = d.exitFullscreen || d.webkitExitFullscreen; if (x) { const r = x.call(d); if (r && r.catch) r.catch(() => {}); } }
      else { const el = d.documentElement, f = el.requestFullscreen || el.webkitRequestFullscreen; if (f) { const r = f.call(el); if (r && r.catch) r.catch(() => {}); } }
    } catch (e) { /* ignore */ }
  };
  const lockEl = () => (G.document && G.document.pointerLockElement) || null;
  function unlock() { if (lockEl() && G.document.exitPointerLock) G.document.exitPointerLock(); }

  // ---------------------------------------------------------------- binding
  In.bind = function (ctx) {
    In.unbind();
    In.ctx = ctx; In.enabled = true; In.armed = null; In.keys.clear(); In._q = []; In._tap = {}; In._ctap = 0; In.selected = null; In._cat = null; In._rmb = null; In._done = null;
    In._drag = null; In._held.clear(); In._ctrlEv = false; In.preview = null; resetSel();
    ctx.cam.follow = false;
    const cv = ctx.cv, doc = G.document;
    let mmDrag = false;
    const isUi = el => !!(el && el.closest && el.closest('.hudp,.itfs'));
    const pos = ev => (In.locked && ev.isTrusted !== false ? { x: In.vx, y: In.vy } : { x: ev.clientX, y: ev.clientY });
    const setMouse = ev => {
      const r = cv.getBoundingClientRect(), p = pos(ev);
      In.mouse.x = (p.x - r.left) / r.width * GM.VIEW_W; In.mouse.y = (p.y - r.top) / r.height * GM.VIEW_H;
      In.win.x = p.x; In.win.y = p.y;
    };
    const miniMove = () => {
      const m = ctx.R.mmHit(In.mouse.x, In.mouse.y); if (!m) return false;
      ctx.cam.lock = false; ctx.cam.centerOn(m.x, m.y); return true;
    };
    const synth = (el, type, p, button) => { try { el.dispatchEvent(new G.MouseEvent(type, { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, button: button || 0, view: G })); } catch (e) { /* ignore */ } };
    const onWinMove = ev => {   // track the cursor over HUD too (for edge scroll and aim)
      if (In._rmb && ev.isTrusted !== false && ev.buttons !== undefined && !(ev.buttons & 2)) In._rmb = null;   // release happened where we could not see it
      if (In.locked && ev.isTrusted !== false) {
        In.vx = Math.max(0, Math.min(G.innerWidth - 1, In.vx + (ev.movementX || 0)));
        In.vy = Math.max(0, Math.min(G.innerHeight - 1, In.vy + (ev.movementY || 0)));
        if (IT.Cursor) IT.Cursor.virtual(In.vx, In.vy);
        const el = doc.elementFromPoint(In.vx, In.vy);
        if (el && el !== cv) synth(el, 'mousemove', { x: In.vx, y: In.vy });   // HUD tooltips
        setMouse(ev);
        In.win.in = true;
        In.mouse.in = !mmDrag && !isUi(el) && el === cv;
        if (mmDrag) miniMove();
        trackDrag();
        return;
      }
      setMouse(ev);
      const r = cv.getBoundingClientRect(), p = pos(ev);
      const inside = p.x >= r.left && p.x < r.right && p.y >= r.top && p.y < r.bottom;
      In.win.in = true;
      In.mouse.in = inside && !mmDrag && !isUi(ev.target);
      if (mmDrag) miniMove();
      trackDrag();
    };
    const trackDrag = () => {
      const d = In._drag; if (!d) return;
      if (!d.moved && Math.hypot(In.win.x - d.x, In.win.y - d.y) >= DRAG_PX) d.moved = true;
    };
    const onLeave = () => { In.mouse.in = false; };
    const onDocLeave = () => { if (!In.locked) { In.win.in = false; In._rmb = null; } };
    const onUp = ev => {
      mmDrag = false;
      if (!ev || ev.button === 2 || ev.button === undefined) In._rmb = null;
      if (In._drag && (!ev || ev.button === 0 || ev.button === undefined)) finishDrag(ev);
      In._ctrlEv = false;
    };
    const onCtx = ev => ev.preventDefault();
    const onLockChange = () => {
      const was = In.locked;
      In.locked = lockEl() === cv;
      if (In.locked) { if (IT.Cursor) IT.Cursor.virtual(In.vx, In.vy); }
      else {
        if (IT.Cursor) IT.Cursor.virtual(null);
        if (was && In.enabled && !ctx.w.paused && In.hooks.pause) { In._unlockAt = In.now(); In.hooks.pause(); }   // ESC / alt-tab left the lock: pause
      }
    };
    const attackClick = shift => {
      const { w, hero } = ctx, p = worldMouse(), t = unitAt(p, 1);
      giveOrder(t ? { type: 'attack', target: t.id, queued: shift } : { type: 'attack', x: p.x, y: p.y, queued: shift });
      if (!shift) In.armed = null;
    };
    const onDown = ev => {
      if (!In.enabled) return;
      if (ctx.w.paused) {   // frozen inspect (ranked countdown): minimap + foe select; RMB (move / attack) starts the run and is executed
        if (!In.inspecting()) return;
        if (inResult()) { ctx.w.ranked.cont(); return; }   // result card: any click continues
        if (ev.button === 2) { setMouse(ev); if (!(In.hooks.skip && In.hooks.skip())) return; }
        else {
          if (ev.button !== 0) return;
          setMouse(ev);
          if (miniMove()) { mmDrag = true; return; }
          In.selected = inspectAt(worldMouse()); syncCard();
          return;
        }
      }
      if (In.locked && ev.isTrusted !== false) {   // locked: the event targets the canvas, so route UI clicks by hand
        const el = doc.elementFromPoint(In.vx, In.vy), p = { x: In.vx, y: In.vy };
        if (el && el !== cv && isUi(el)) {
          synth(el, 'mousedown', p, ev.button);
          const up = () => { G.removeEventListener('mouseup', up, true); synth(el, 'mouseup', p, ev.button); if (ev.button === 0) synth(el, 'click', p, 0); };
          G.addEventListener('mouseup', up, true);
          return;
        }
      } else if (S().pointerLock && !In.locked && cv.requestPointerLock && (ev.button === 0 || ev.button === 2)) {
        In.vx = ev.clientX; In.vy = ev.clientY;
        try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* ignore */ }
      }
      setMouse(ev);
      In._ctrlEv = !!ev.ctrlKey;
      if (ev.button === 0) {
        resolveCat();
        if (miniMove()) { mmDrag = true; return; }
        if (In.armed) {
          const a = In.armed;
          if (a.place) { const ok = In.hooks.placeEnemy && In.hooks.placeEnemy(worldMouse()); if (ok && !ev.shiftKey) In.armed = null; return; }   // Free Play "Place enemy"
          if (a.attack) { attackClick(ev.shiftKey || a.queued); return; }
          cast(a.id, 'click', ev.shiftKey || a.queued); afterClick(a, ev.shiftKey);
          return;
        }
        const wp = worldMouse(), t = unitAt(wp, 1), own = t ? null : ownAt(wp);
        if (t && inspectable(t)) In.selected = t.id;   // inspect-select only: foes / towers accept no orders
        else if (own) clickOwn(own, ev.shiftKey);    // own spirit / hero: select it (shift toggles it in the group)
        else { const b = inspectAt(wp); if (b != null) In.selected = b; }   // towers / static buildings
        In._drag = { w0: worldMouse(), x: In.win.x, y: In.win.y, moved: false };   // becomes a box select once the cursor travels DRAG_PX
        return;
      }
      if (ev.button !== 2) return;
      resolveCat();
      rightClick(ev.shiftKey);
      if (S().rmbRepeat && !ev.shiftKey) In._rmb = { t: In.now() };
    };
    // right click at the current cursor (shared by real clicks and the auto-repeat): cancel targeting, else move / attack
    function rightClick(shift) {
      const { w, hero } = ctx;
      if (In.armed) { In.cancel(); return; }
      clearInspect();
      const m = ctx.R.mmHit(In.mouse.x, In.mouse.y);
      const p = m || worldMouse(), t = m ? null : unitAt(p, 1);
      giveOrder(t ? { type: 'attack', target: t.id, queued: !!shift } : { type: 'move', x: p.x, y: p.y, queued: !!shift });
    }
    In.rightClick = rightClick;
    // after a click-cast: disarm unless shift is held, or the cast did not go through (no target)
    function afterClick(a, shift) {
      if (shift) return;
      const d = IT.Abilities.get(a.id);
      if (d && d.target === 'unit') {
        const t = pickTarget(d, worldMouse());
        if (!t && a.id !== 'alacrity') return;   // no target: stay armed
      }
      In.armed = null;
    }
    // Mouse4 / Mouse5 as keys (window-wide so they work over the HUD too); also stops the browser's back/forward
    const onAuxDown = ev => {
      const k = In.mouseKeyName(ev);
      if (!k || !In.enabled) return;
      ev.preventDefault();
      if (ctx.w.paused && !In.inspecting()) return;
      press(k, { shift: ev.shiftKey, alt: ev.altKey });
    };
    const onAuxUp = ev => {
      const k = In.mouseKeyName(ev);
      if (!k) return;
      if (In.enabled) ev.preventDefault();
      release(k);
    };
    const onBlur = () => { In.keys.clear(); In._held.clear(); In._drag = null; In._ctrlEv = false; mmDrag = false; In._rmb = null; resolveCat(); In.win.in = false; ctx.cam.follow = false; if (In.hooks.statsHold) In.hooks.statsHold(false); };
    const onKeyD = ev => In.keyDown(ev), onKeyU = ev => In.keyUp(ev);
    let wheelAcc = 0;
    const onWheel = ev => {   // scroll wheel zooms in fixed steps (one notch ~100 delta; trackpads accumulate)
      if (isUi(ev.target)) return;
      ev.preventDefault();
      wheelAcc += ev.deltaMode === 1 ? ev.deltaY * 40 : ev.deltaY;
      if (Math.abs(wheelAcc) < 50) return;
      const dir = wheelAcc < 0 ? 1 : -1; wheelAcc = 0;
      if (In.hooks.zoom) In.hooks.zoom(dir);
    };
    const offOrder = ctx.w.on('orderDone', p => { In._done = p.order; try { flush(); } finally { In._done = null; } });

    cv.addEventListener('mouseleave', onLeave);
    cv.addEventListener('contextmenu', onCtx);
    cv.addEventListener('mousedown', onDown);
    cv.addEventListener('wheel', onWheel, { passive: false });
    G.addEventListener('mousemove', onWinMove);
    G.addEventListener('mouseup', onUp);
    G.addEventListener('mousedown', onAuxDown);
    G.addEventListener('mouseup', onAuxUp);
    G.addEventListener('auxclick', onAuxUp);
    G.addEventListener('keydown', onKeyD);
    G.addEventListener('keyup', onKeyU);
    G.addEventListener('blur', onBlur);
    if (doc) { doc.addEventListener('pointerlockchange', onLockChange); doc.documentElement.addEventListener('mouseleave', onDocLeave); }
    In._off = () => {
      cv.removeEventListener('mouseleave', onLeave); cv.removeEventListener('contextmenu', onCtx); cv.removeEventListener('mousedown', onDown); cv.removeEventListener('wheel', onWheel);
      G.removeEventListener('mousemove', onWinMove); G.removeEventListener('mouseup', onUp);
      G.removeEventListener('mousedown', onAuxDown); G.removeEventListener('mouseup', onAuxUp); G.removeEventListener('auxclick', onAuxUp);
      G.removeEventListener('keydown', onKeyD); G.removeEventListener('keyup', onKeyU); G.removeEventListener('blur', onBlur);
      if (doc) { doc.removeEventListener('pointerlockchange', onLockChange); doc.documentElement.removeEventListener('mouseleave', onDocLeave); }
      offOrder();
    };
  };
  In.unbind = function () {
    if (In._off) In._off();
    unlock();
    if (IT.Cursor) { IT.Cursor.virtual(null); IT.Cursor.set('default'); }
    In._off = null; In.ctx = null; In.enabled = false; In.armed = null; In.selected = null; In.locked = false; In.keys.clear(); In._q = []; In._cat = null; In._rmb = null;
    In._drag = null; In._held.clear(); In._ctrlEv = false; In.preview = null; In.sel = { units: [], group: 'hero', auto: false };
  };

  // mouse as camera sees it: edge scroll triggers at the WINDOW edge (even over the letterbox / HUD), not the canvas edge
  In.camMouse = () => {
    const m = { x: In.mouse.x, y: In.mouse.y, in: false, edge: null };
    if (S().edgeScroll && In.win.in && G.innerWidth) {
      const x = In.win.x, y = In.win.y;
      m.edge = { l: x < EDGE_PX, r: x >= G.innerWidth - EDGE_PX, u: y < EDGE_PX, d: y >= G.innerHeight - EDGE_PX };
    }
    return m;
  };

  // per-frame upkeep (called from drawAim, which main calls every frame): deferred keys, selection validity, cursor, lock
  function frame() {
    const c = In.ctx;
    if (!c || !In.enabled) { cur('default'); if (In.locked) unlock(); return; }
    const w = c.w;
    if (w.paused) { In._drag = null; cur('default'); if (In.locked) unlock(); tick(); return; }
    tick();
    if (In.selected != null && !isStruct(In.selected) && !w.get(In.selected)) In.selected = null;
    syncSel(); syncCard();
    let kind = 'default';
    if (In._drag && In._drag.moved) kind = 'select';
    else if (In.armed) kind = In.armed.attack ? 'amove' : 'aim';
    else if (In.mouse.in && unitAt(worldMouse(), 1)) kind = 'attack';
    cur(kind);
  }

  // ---------------------------------------------------------------- rangefinder: cast range + AoE footprint (drawAim paints it on #aim)
  const FALLBACK = { dust: { radius: 1050 }, forcestaff: { push_length: 600, castRange: 550 } };   // used until the KV carries them
  // first non-zero KV number among `keys` for spell/item `id`
  function kv(id, keys, ctx) {
    const d = IT.Abilities.get(id), V = IT.Values; if (!d) return 0;
    const nm = typeof d.dota === 'string' ? d.dota : GM.ITEM_DOTA[id];
    for (const k of keys) {
      let v = 0;
      try { v = d.kind === 'spell' ? (d.dota && V.has(d.dota, k) ? V.get(d.dota, k, ctx) : 0) : (nm ? V.item(nm, k) : 0); } catch (e) { v = 0; }
      if (v) return v;
      if (FALLBACK[id] && FALLBACK[id][k]) return FALLBACK[id][k];
    }
    return 0;
  }
  const rectPts = (x, y, cs, sn, len, h0, h1) => [[x - sn * h0, y + cs * h0], [x + cs * len - sn * h1, y + sn * len + cs * h1], [x + cs * len + sn * h1, y + sn * len - cs * h1], [x + sn * h0, y - cs * h0]];
  // Footprint of `id` in world units: [{k:'circle',x,y,r,st}|{k:'poly',pts,st}|{k:'line',a,b,st,arrow}], st = range|aoe|path|tgt|cata|aura.
  // m = cursor (world), tgt = unit under the cursor (unit-target spells).
  function aimShapes(id, hero, w, m, tgt) {
    const d = IT.Abilities.get(id); if (!d) return null;
    const ctx = hero.ctx || w.ctx, TAU = Math.PI * 2, v = (...k) => kv(id, k, ctx), out = [];
    const rng = d.range ? (d.range(w, hero) || 0) : 0;
    const hx = hero.x, hy = hero.y, dd = Math.hypot(m.x - hx, m.y - hy);
    const dir = dd > 1 ? Math.atan2(m.y - hy, m.x - hx) : (hero.facing || 0), cs = Math.cos(dir), sn = Math.sin(dir);
    const circ = (x, y, r, st) => { if (r > 1) out.push({ k: 'circle', x, y, r, st }); };
    let cast = rng > 0 && isFinite(rng) ? rng : 0;
    switch (id) {
      case 'tornado': {
        const dist = v('travel_distance'), r = v('area_of_effect', 'radius');
        if (dist > 0) { out.push({ k: 'poly', pts: rectPts(hx, hy, cs, sn, dist, r, r), st: 'aoe' }); circ(hx + cs * dist, hy + sn * dist, r, 'aoe'); }
        break;
      }
      case 'deafeningblast': {
        const dist = v('travel_distance'), r0 = v('radius_start'), r1 = v('radius_end'), n = Math.max(1, Math.round(v('radial_count') || 1));
        for (let i = 0; i < n; i++) { const a = dir + TAU * i / n; out.push({ k: 'poly', pts: rectPts(hx, hy, Math.cos(a), Math.sin(a), dist, r0, r1), st: 'aoe' }); }
        break;
      }
      case 'chaosmeteor': {
        const r = v('area_of_effect'), dist = v('travel_distance'), n = Math.max(1, Math.round(v('meteor_count') || 1)), sp = (IT.Spells && IT.Spells.METEOR_SPACING) || 1;
        for (let i = 0; i < n; i++) {
          const off = (i - (n - 1) / 2) * sp * r, x0 = m.x - sn * off, y0 = m.y + cs * off;
          if (dist > 0) out.push({ k: 'poly', pts: rectPts(x0, y0, cs, sn, dist, r, r), st: 'path' });
          circ(x0, y0, r, 'aoe');
          if (dist > 0) circ(x0 + cs * dist, y0 + sn * dist, r, 'path');
        }
        break;
      }
      case 'sunstrike': {
        circ(m.x, m.y, v('area_of_effect'), 'aoe');
        if (cataReady()) {   // scepter: pressing again with the cursor on Invoker = Cataclysm (strikes land around every visible enemy)
          circ(hx, hy, 100, 'cata');
          if (dd <= 100) {
            const lo = v('cataclysm_min_range'), hi = v('cataclysm_max_range');
            for (const e of w.ents) if (!e.dead && isFoe(e) && e.visible !== false) { circ(e.x, e.y, lo, 'cata'); circ(e.x, e.y, hi, 'cata'); }
          }
        }
        break;
      }
      case 'icewall': {   // target-less: a wall across the facing direction
        const f = hero.facing || 0, len = v('wall_total_length'), place = v('wall_place_distance'), width = v('wall_width');
        const fx = Math.cos(f), fy = Math.sin(f), cx = hx + fx * place, cy = hy + fy * place, h = len / 2;
        if (len > 0) out.push({ k: 'poly', pts: [[cx + fy * h - fx * width, cy - fx * h - fy * width], [cx - fy * h - fx * width, cy + fx * h - fy * width], [cx - fy * h + fx * width, cy + fx * h + fy * width], [cx + fy * h + fx * width, cy - fx * h + fy * width]], st: 'aoe' });
        break;
      }
      case 'shiva': circ(hx, hy, v('blast_radius') + (v('bonus_aoe') || 0), 'aoe'); circ(hx, hy, v('aura_radius'), 'aura'); break;   // expanding wave is centred on Invoker
      case 'dust': circ(hx, hy, v('radius'), 'aoe'); break;
      case 'gleipnir': circ(m.x, m.y, v('radius_tooltip', 'radius'), 'aoe'); break;
      case 'forcestaff': {
        const push = v('push_length'), who = tgt || hero, f = who.facing || 0;
        if (!cast) cast = v('castRange');
        if (push > 0) { out.push({ k: 'line', a: [who.x, who.y], b: [who.x + Math.cos(f) * push, who.y + Math.sin(f) * push], st: 'aoe', arrow: true }); circ(who.x + Math.cos(f) * push, who.y + Math.sin(f) * push, 30, 'aoe'); }
        break;
      }
      case 'blink': {
        const R = cast || v('blink_range'), k = dd > R ? R / dd : 1;
        cast = R; circ(hx + (m.x - hx) * k, hy + (m.y - hy) * k, 40, 'aoe');
        break;
      }
      default: {
        if (d.target === 'none') circ(hx, hy, v('radius', 'area_of_effect', 'aura_radius'), 'aoe');
        else if (d.target === 'point') circ(m.x, m.y, v('area_of_effect', 'impact_radius', 'radius', 'radius_end'), 'aoe');
      }
    }
    if (d.target === 'unit' && tgt) circ(tgt.x, tgt.y, (tgt.radius || 20) + 12, 'tgt');
    if (cast > 0) out.unshift({ k: 'circle', x: hx, y: hy, r: cast, st: 'range' });
    const inRange = !cast || dd <= cast;
    return { shapes: out, range: cast, inRange, point: d.target === 'point' };
  }
  In.aimShapes = aimShapes;

  // what the rangefinder shows: the armed spell/item, else a HUD-hovered target-less one. Instant casts (target 'none') show their radius ONLY while their HUD icon is hovered
  function previewId() {
    const c = In.ctx; if (!c) return null;
    if (In.armed && !In.armed.attack && !In.armed.place) return In.armed.id;
    const noTarget = id => { const d = id && id !== '__none' && IT.Abilities.get(id); return !!d && d.target === 'none'; };
    const pv = typeof In.preview === 'function' ? In.preview() : In.preview;   // HUD hover: id or a resolver (slots change on invoke)
    return noTarget(pv) ? pv : null;
  }
  In.previewId = previewId;

  const STY = {   // stroke, fill (in range), stroke/fill when the cursor is out of cast range
    range: ['rgba(255,226,110,0.5)', 'rgba(255,226,110,0.025)'],
    aoe: ['rgba(255,90,200,0.6)', 'rgba(255,90,200,0.085)', 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0.035)'],
    path: ['rgba(255,150,90,0.5)', 'rgba(255,120,60,0.05)', 'rgba(255,255,255,0.25)', 'rgba(255,255,255,0.025)'],
    tgt: ['rgba(120,255,160,0.6)', 'rgba(120,255,160,0.05)'],
    cata: ['rgba(255,140,40,0.55)', 'rgba(255,140,40,0.03)'],
    aura: ['rgba(120,190,255,0.35)', 'rgba(120,190,255,0.01)'],
  };
  function drawShapes(g, c, info, k) {
    const cam = c.cam, lw = Math.max(1, 0.8 * k), pulse = 0.85 + 0.15 * Math.sin(In.now() / 160);
    const tp = (x, y) => cam.toScreen(x, y);
    const paint = (sh, trace) => {
      const sty = STY[sh.st] || STY.aoe, out = !info.inRange && sty.length > 2;
      const stroke = out ? sty[2] : sty[0], fill = out ? sty[3] : sty[1];
      g.setLineDash(sh.st === 'range' || sh.st === 'aura' || sh.st === 'cata' ? [4 * k, 3 * k] : []);
      g.beginPath(); trace();
      g.lineWidth = lw + 0.8 * k; g.strokeStyle = 'rgba(0,0,0,0.28)'; g.stroke();   // dark underlay keeps it readable on any terrain
      g.fillStyle = fill; g.globalAlpha = sh.st === 'aoe' ? pulse : 1; g.fill(); g.globalAlpha = 1;
      g.lineWidth = lw; g.strokeStyle = stroke; g.stroke();
    };
    g.save();
    for (const sh of info.shapes) {
      if (sh.k === 'circle') { const s = tp(sh.x, sh.y), r = sh.r / P; paint(sh, () => g.arc(s.x, s.y, r, 0, Math.PI * 2)); }
      else if (sh.k === 'poly') paint(sh, () => { sh.pts.forEach((q, i) => { const s = tp(q[0], q[1]); if (i) g.lineTo(s.x, s.y); else g.moveTo(s.x, s.y); }); g.closePath(); });
      else if (sh.k === 'line') {
        const a = tp(sh.a[0], sh.a[1]), b = tp(sh.b[0], sh.b[1]), ang = Math.atan2(b.y - a.y, b.x - a.x), hl = 6 * k;
        paint({ st: 'path' }, () => { g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); if (sh.arrow) { g.moveTo(b.x - Math.cos(ang - 0.5) * hl, b.y - Math.sin(ang - 0.5) * hl); g.lineTo(b.x, b.y); g.lineTo(b.x - Math.cos(ang + 0.5) * hl, b.y - Math.sin(ang + 0.5) * hl); } });
      }
    }
    g.restore();
  }
  function drawSel(g, c, k) {
    const cam = c.cam, lw = Math.max(1, 1.2 * k), r = dragRect();
    const ring = (e, a) => {
      const s = cam.toScreen(e.x, e.y), rr = Math.max(4, (e.radius || 16) / P + 2 * k);
      g.beginPath(); g.ellipse(s.x, s.y, rr, rr * 0.7, 0, 0, Math.PI * 2);
      g.lineWidth = lw + 1; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.stroke();
      g.lineWidth = lw; g.strokeStyle = 'rgba(90,255,110,' + a + ')'; g.stroke();
    };
    g.save();
    // selected units are ringed on the ground by render/units.js (selRing)
    if (r) {
      for (const e of boxCandidates(r)) ring(e, 0.6);
      const x = r.x0, y = r.y0, ww = r.x1 - r.x0, hh = r.y1 - r.y0;
      g.fillStyle = 'rgba(70,255,100,0.10)'; g.fillRect(x, y, ww, hh);
      g.lineWidth = lw + 1.4; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.strokeRect(x, y, ww, hh);
      g.lineWidth = lw; g.strokeStyle = '#5bff6e'; g.strokeRect(x, y, ww, hh);
    }
    g.restore();
  }
  In.drawAim = function (g) {
    g.clearRect(0, 0, GM.VIEW_W, GM.VIEW_H);
    frame();
    const c = In.ctx;
    if (!c || c.w.paused) return;
    const k = GM.VIEW_W / (GM.VIEW_W_BASE || 480);   // view px -> constant on-screen thickness at any zoom
    drawSel(g, c, k);
    const id = previewId(); if (!id) return;
    const { w, hero, cam } = c, d = IT.Abilities.get(id); if (!d) return;
    const m = worldMouse(), tgt = d.target === 'unit' ? pickTarget(d, m) : null;
    const info = aimShapes(id, hero, w, m, tgt); if (!info) return;
    drawShapes(g, c, info, k);
    if (info.point && info.range > 0) {   // guide from Invoker to the aim point
      const hs = cam.toScreen(hero.x, hero.y), mx = Math.round(In.mouse.x), my = Math.round(In.mouse.y);
      g.save(); g.globalAlpha = 0.25; g.lineWidth = Math.max(1, 0.7 * k); g.strokeStyle = info.inRange ? STY.aoe[0] : STY.aoe[2];
      g.beginPath(); g.moveTo(hs.x, hs.y); g.lineTo(mx, my); g.stroke(); g.restore();
    }
  };

  // ---------------------------------------------------------------- never let the browser's own UI in: context menu, autoscroll, back/forward
  function installGuards() {
    if (In._guards || !G.addEventListener) return;
    In._guards = true;
    const stop = ev => { ev.preventDefault(); };
    const aux = ev => { if (ev.button === 1 || ev.button === 3 || ev.button === 4) ev.preventDefault(); };
    G.addEventListener('contextmenu', stop, true);        // everywhere, always (menus too)
    G.addEventListener('mousedown', aux, true);           // middle-click autoscroll, Mouse4/5
    G.addEventListener('mouseup', aux, true);
    G.addEventListener('auxclick', stop, true);
    G.addEventListener('dragstart', stop, true);
  }
  In.installGuards = installGuards;
  installGuards();

  // deferred keys / Cataclysm window / RMB repeat also run on the sim tick (before orders), so they never wait for a render frame
  if (IT.World && IT.World.system) IT.World.system('input', 5, w => { if (In.ctx && In.ctx.w === w) tick(); });

  IT.Input = In;
})(typeof window !== 'undefined' ? window : globalThis);
