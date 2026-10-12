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
    if (w.paused) return;
    In.selected = null;     // any player action returns the HUD to the hero
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
      case 'stop': case 'hold': In.cancel(true); In._cat = null; In._q = In._q.filter(j => !isAbilityAction(j.action)); IT.Orders.issue(w, hero, { type: action }); return;
      case 'center': {
        const now = In.now(), s = S();
        if (!s.doubleTap || (In._ctap && now - In._ctap <= s.doubleTapTimeout * 1000)) { glide(cam, hero.x, hero.y); cam.follow = true; In._ctap = 0; } else In._ctap = now;
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
    In.selected = null;
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
    In.doAction(a, { queued: !!mods.shift, self: !!mods.alt });
    return true;
  }
  function release(k) {
    if (k && IT.Settings.actionFor(k) === 'center' && In.ctx) { const c = In.ctx; if (c.cam.follow) glide(c.cam, c.hero.x, c.hero.y); c.cam.follow = false; }   // finish the glide to where the hero is
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
      else if (In.selected != null) In.selected = null;
      else if (In.hooks.pause) In.hooks.pause();
      return;
    }
    if (ev.key === 'Tab') { ev.preventDefault(); if (!ev.repeat && In.hooks.statsHold) In.hooks.statsHold(true); return; }
    const insp = w.paused && In.inspecting();
    if (w.paused && !insp) return;
    if (ev.key === 'Alt') { ev.preventDefault(); return; }      // keep Alt from focusing the browser menu
    if (ev.metaKey) return;
    In.keys.add(ev.key);
    if (ev.key === 'F3') { ev.preventDefault(); if (!ev.repeat && In.hooks.debug) In.hooks.debug(); return; }
    if (ev.repeat) { if (/^Arrow/.test(ev.key) || ev.key === ' ') ev.preventDefault(); return; }
    const k = IT.Settings.keyName(ev);
    if (!k) return;
    if (insp) { const a = IT.Settings.actionFor(k); if (a === 'center' || a === 'camLock') press(k, {}); if (/^Arrow/.test(ev.key) || ev.key === ' ') ev.preventDefault(); return; }
    if (!press(k, { shift: ev.shiftKey, alt: ev.altKey })) { if (/^Arrow/.test(ev.key)) ev.preventDefault(); return; }
    ev.preventDefault();
  };
  In.keyUp = function (ev) {
    In.keys.delete(ev.key);
    if (ev.key === 'Tab' && In.hooks.statsHold) In.hooks.statsHold(false);
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
        return;
      }
      setMouse(ev);
      const r = cv.getBoundingClientRect(), p = pos(ev);
      const inside = p.x >= r.left && p.x < r.right && p.y >= r.top && p.y < r.bottom;
      In.win.in = true;
      In.mouse.in = inside && !mmDrag && !isUi(ev.target);
      if (mmDrag) miniMove();
    };
    const onLeave = () => { In.mouse.in = false; };
    const onDocLeave = () => { if (!In.locked) { In.win.in = false; In._rmb = null; } };
    const onUp = ev => { mmDrag = false; if (!ev || ev.button === 2 || ev.button === undefined) In._rmb = null; };
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
      IT.Orders.issue(w, hero, t ? { type: 'attack', target: t.id, queued: shift } : { type: 'attack', x: p.x, y: p.y, queued: shift });
      if (!shift) In.armed = null;
    };
    const onDown = ev => {
      if (!In.enabled) return;
      if (ctx.w.paused) {   // frozen inspect (ranked countdown): minimap + dummy select only
        if (!In.inspecting() || ev.button !== 0) return;
        setMouse(ev);
        if (miniMove()) { mmDrag = true; return; }
        const t = unitAt(worldMouse(), 1); In.selected = t && t.kind === 'dummy' ? t.id : null;
        return;
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
      if (ev.button === 0) {
        resolveCat();
        if (miniMove()) { mmDrag = true; return; }
        if (In.armed) {
          const a = In.armed;
          if (a.attack) { attackClick(ev.shiftKey || a.queued); return; }
          cast(a.id, 'click', ev.shiftKey || a.queued); afterClick(a, ev.shiftKey);
          return;
        }
        const t = unitAt(worldMouse(), 1);
        if (t && t.kind === 'dummy') In.selected = t.id;
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
      In.selected = null;
      const m = ctx.R.mmHit(In.mouse.x, In.mouse.y);
      const p = m || worldMouse(), t = m ? null : unitAt(p, 1);
      IT.Orders.issue(w, hero, t ? { type: 'attack', target: t.id, queued: !!shift } : { type: 'move', x: p.x, y: p.y, queued: !!shift });
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
      if (ctx.w.paused) return;
      press(k, { shift: ev.shiftKey, alt: ev.altKey });
    };
    const onAuxUp = ev => {
      const k = In.mouseKeyName(ev);
      if (!k) return;
      if (In.enabled) ev.preventDefault();
      release(k);
    };
    const onBlur = () => { In.keys.clear(); mmDrag = false; In._rmb = null; resolveCat(); In.win.in = false; ctx.cam.follow = false; if (In.hooks.statsHold) In.hooks.statsHold(false); };
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
    if (w.paused) { cur('default'); if (In.locked) unlock(); tick(); return; }
    tick();
    if (In.selected != null && !w.get(In.selected)) In.selected = null;
    let kind = 'default';
    if (In.armed) kind = In.armed.attack ? 'amove' : 'aim';
    else if (In.mouse.in && unitAt(worldMouse(), 1)) kind = 'attack';
    cur(kind);
  }

  // ---------------------------------------------------------------- aim overlay (range circle + AoE preview)
  function aoeRadius(id, ctx) {
    const d = IT.Abilities.get(id); if (!d) return 0;
    const V = IT.Values;
    if (d.dota) {
      for (const k of ['area_of_effect', 'radius_end', 'radius']) { const v = V.has(d.dota, k) ? V.get(d.dota, k, ctx) : 0; if (v) return v; }
      return 0;
    }
    const nm = GM.ITEM_DOTA[id];
    if (nm) for (const k of ['impact_radius', 'area_of_effect', 'radius']) { const v = V.item(nm, k); if (v) return v; }
    return 0;
  }
  In.drawAim = function (g) {
    g.clearRect(0, 0, GM.VIEW_W, GM.VIEW_H);
    frame();
    const c = In.ctx;
    if (!c || !In.armed || c.w.paused) return;
    const d = IT.Abilities.get(In.armed.id); if (!d) return;
    const { w, hero, cam } = c;
    const hs = cam.toScreen(hero.x, hero.y);
    const rng = (d.range(w, hero) || 0) / P;
    g.lineWidth = 1;
    if (rng > 0 && isFinite(rng)) {
      g.strokeStyle = 'rgba(255,230,120,0.75)'; g.fillStyle = 'rgba(255,230,120,0.05)';
      g.beginPath(); g.ellipse(hs.x, hs.y, rng, rng * 0.8, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    const ctx2 = hero.ctx || w.ctx, ar = aoeRadius(In.armed.id, ctx2) / P;
    const mx = Math.round(In.mouse.x), my = Math.round(In.mouse.y);
    const p = worldMouse();
    const inRange = !rng || !isFinite(rng) || IT.U.dist2(hero.x, hero.y, p.x, p.y) <= (rng * P) * (rng * P);
    g.strokeStyle = inRange ? 'rgba(255,90,200,0.95)' : 'rgba(255,255,255,0.45)';
    g.fillStyle = inRange ? 'rgba(255,90,200,0.16)' : 'rgba(255,255,255,0.06)';
    if (ar > 1) { g.beginPath(); g.ellipse(mx, my, ar, ar * 0.8, 0, 0, Math.PI * 2); g.fill(); g.stroke(); }
    if (d.target === 'point' && rng > 0 && isFinite(rng)) { g.globalAlpha = 0.35; g.beginPath(); g.moveTo(hs.x, hs.y); g.lineTo(mx, my); g.stroke(); g.globalAlpha = 1; }
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
