// Play-time input: keyboard (rebindable via IT.Settings), mouse, cast modes, camera keys. IT.Input singleton.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const GM = IT.GAME, P = GM.UNIT_PX, VW = GM.VIEW_W, VH = GM.VIEW_H;
  const sfx = n => { if (typeof G.SFX !== 'undefined' && G.SFX.enabled && G.SFX.play) { try { G.SFX.play(n); } catch (e) { /* ignore */ } } };

  const In = {
    enabled: false, ctx: null, armed: null, keys: new Set(), mouse: { x: 0, y: 0, in: false },
    hooks: {},    // pause, statsHold(bool), cheat, refresh, spawn, resetDummies, debug
    sfx,
  };

  const S = () => IT.Settings.get();
  const TOGGLE_KEYS = {};

  // ---------------------------------------------------------------- helpers
  function worldMouse() { return In.ctx.cam.toWorld(In.mouse.x, In.mouse.y); }
  function unitAt(p, team) {
    const w = In.ctx.w;
    let best = null, bd = 60 * 60;
    for (const e of w.ents) {
      if (e.dead || e.team !== team || e.kind === 'thinker' || e.kind === 'proj') continue;
      if (w.fog && team === 1 && !e.visible) continue;
      const d = IT.U.dist2(e.x, e.y, p.x, p.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  function pickTarget(d, p) {
    const { w, hero } = In.ctx;
    let best = null, bd = 60 * 60;
    for (const e of w.ents) {
      if (e.dead || e.kind === 'thinker' || e.kind === 'proj') continue;
      if (!d.filter(w, hero, e)) continue;
      const dd = IT.U.dist2(e.x, e.y, p.x, p.y);
      if (dd < bd) { bd = dd; best = e; }
    }
    return best;
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

  // Try to cast `id`. mode: 'key' (quick -> at cursor), 'hud' (always arms if targeted), 'click' (armed click).
  function cast(id, how, queued) {
    const { w, hero } = In.ctx;
    if (!id) return;
    if (id === '__none') { fail('noItem'); return; }
    const d = IT.Abilities.get(id);
    if (!d) return;
    if (d.target === 'none') { In.cancel(true); IT.Orders.issue(w, hero, { type: 'cast', ability: id, queued: !!queued }); return; }
    const normal = S().castMode === 'normal';
    if (how !== 'click' && (normal || how === 'hud')) {
      // pre-check castability so we don't arm something that cannot be used
      const why = IT.Abilities.check(w, hero, id, null);
      if (why && why !== 'noTarget') { fail(why); return; }
      In.armed = { id, queued: !!queued };
      sfx('click');
      return;
    }
    const p = worldMouse(), o = { type: 'cast', ability: id, queued: !!queued };
    if (d.target === 'point') { o.x = p.x; o.y = p.y; }
    else {
      let t = pickTarget(d, p);
      if (!t && id === 'alacrity') t = hero;
      if (!t) { fail('noTarget'); return; }
      o.target = t.id;
    }
    if (how !== 'click') In.armed = null;
    IT.Orders.issue(w, hero, o);
  }

  // ---------------------------------------------------------------- actions (shared by keys and HUD buttons)
  In.doAction = function (action, opts) {
    if (!In.ctx) return;
    opts = opts || {};
    const { w, hero, cam } = In.ctx, how = opts.hud ? 'hud' : 'key';
    if (w.paused) return;
    switch (action) {
      case 'orbQ': case 'orbW': case 'orbE': { const k = action.slice(3); IT.Invoke.orb(w, hero, k); return; }
      case 'invoke': IT.Invoke.invoke(w, hero); return;
      case 'stop': In.cancel(true); IT.Orders.issue(w, hero, { type: 'stop' }); return;
      case 'hold': In.cancel(true); IT.Orders.issue(w, hero, { type: 'hold' }); return;
      case 'center': cam.centerOn(hero.x, hero.y); return;
      case 'camLock': cam.lock = !cam.lock; return;
      case 'cheat': case 'refresh': case 'spawn': case 'resetDummies': if (In.hooks[action]) In.hooks[action](); return;
      default: { const id = abilityId(action); if (id !== null) cast(id, how, opts.queued); }
    }
  };
  In.castId = (id, opts) => { if (In.ctx && !In.ctx.w.paused) cast(id, opts && opts.hud ? 'hud' : 'key', opts && opts.queued); };
  In.cancel = function (silent) {
    if (In.armed) { In.armed = null; if (!silent) IT.UI.toast(IT.t('toast.cancelled'), 'info'); return true; }
    return false;
  };

  // ---------------------------------------------------------------- binding
  In.bind = function (ctx) {
    In.unbind();
    In.ctx = ctx; In.enabled = true; In.armed = null; In.keys.clear();
    const cv = ctx.cv;
    let mmDrag = false;
    const setMouse = ev => {
      const r = cv.getBoundingClientRect();
      In.mouse.x = (ev.clientX - r.left) / r.width * VW; In.mouse.y = (ev.clientY - r.top) / r.height * VH;
    };
    const miniMove = () => {
      const m = ctx.R.mmHit(In.mouse.x, In.mouse.y); if (!m) return false;
      ctx.cam.lock = false; ctx.cam.centerOn(m.x, m.y); return true;
    };
    const onWinMove = ev => {   // track the cursor over HUD too (for edge scroll and aim)
      setMouse(ev);
      const r = cv.getBoundingClientRect();
      const inside = ev.clientX >= r.left && ev.clientX < r.right && ev.clientY >= r.top && ev.clientY < r.bottom;
      const overUi = ev.target && ev.target.closest && ev.target.closest('.hudp');
      In.mouse.in = inside && !mmDrag && !overUi;
      if (mmDrag) miniMove();
    };
    const onLeave = () => { In.mouse.in = false; };
    const onUp = () => { mmDrag = false; };
    const onCtx = ev => ev.preventDefault();
    const onDown = ev => {
      if (!In.enabled || ctx.w.paused) return;
      setMouse(ev);
      const { w, hero } = ctx;
      if (ev.button === 0) {
        if (miniMove()) { mmDrag = true; return; }
        if (In.armed) { const a = In.armed; cast(a.id, 'click', ev.shiftKey || a.queued); afterClick(a, ev.shiftKey); }
        return;
      }
      if (ev.button !== 2) return;
      if (In.armed) { In.cancel(); return; }
      const m = ctx.R.mmHit(In.mouse.x, In.mouse.y);
      const p = m || worldMouse(), t = m ? null : unitAt(p, 1);
      IT.Orders.issue(w, hero, t ? { type: 'attack', target: t.id, queued: ev.shiftKey } : { type: 'move', x: p.x, y: p.y, queued: ev.shiftKey });
    };
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
    const onKey = ev => {
      if (!In.enabled) return;
      const tg = ev.target, tag = tg && tg.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const w = ctx.w;
      if (ev.key === 'Escape') { ev.preventDefault(); if (!ev.repeat) { if (In.armed && !w.paused) In.cancel(); else if (In.hooks.pause) In.hooks.pause(); } return; }
      if (ev.key === 'Tab') { ev.preventDefault(); if (!ev.repeat && In.hooks.statsHold) In.hooks.statsHold(true); return; }
      if (w.paused) return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      In.keys.add(ev.key);
      if (ev.key === 'F3') { ev.preventDefault(); if (!ev.repeat && In.hooks.debug) In.hooks.debug(); return; }
      if (ev.repeat) { if (/^Arrow/.test(ev.key) || ev.key === ' ') ev.preventDefault(); return; }
      const k = IT.Settings.keyName(ev);
      if (!k) return;
      let a = IT.Settings.actionFor(k);
      if (!a && k === 'H') a = 'cheat';      // H shows the recipes only while Hold is not on H
      if (!a) { if (/^Arrow/.test(ev.key)) ev.preventDefault(); return; }
      ev.preventDefault();
      In.doAction(a, { queued: ev.shiftKey });
    };
    const onKeyUp = ev => {
      In.keys.delete(ev.key);
      if (ev.key === 'Tab' && In.hooks.statsHold) In.hooks.statsHold(false);
    };
    const onBlur = () => { In.keys.clear(); mmDrag = false; if (In.hooks.statsHold) In.hooks.statsHold(false); };

    cv.addEventListener('mouseleave', onLeave);
    cv.addEventListener('contextmenu', onCtx);
    cv.addEventListener('mousedown', onDown);
    G.addEventListener('mousemove', onWinMove);
    G.addEventListener('mouseup', onUp);
    G.addEventListener('keydown', onKey);
    G.addEventListener('keyup', onKeyUp);
    G.addEventListener('blur', onBlur);
    In._off = () => {
      cv.removeEventListener('mouseleave', onLeave); cv.removeEventListener('contextmenu', onCtx); cv.removeEventListener('mousedown', onDown);
      G.removeEventListener('mousemove', onWinMove); G.removeEventListener('mouseup', onUp);
      G.removeEventListener('keydown', onKey); G.removeEventListener('keyup', onKeyUp); G.removeEventListener('blur', onBlur);
    };
  };
  In.unbind = function () {
    if (In._off) In._off();
    In._off = null; In.ctx = null; In.enabled = false; In.armed = null; In.keys.clear();
  };

  // mouse as camera sees it (edge scroll respects the setting)
  In.camMouse = () => ({ x: In.mouse.x, y: In.mouse.y, in: In.mouse.in && S().edgeScroll && !In.armed });

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
    g.clearRect(0, 0, VW, VH);
    const c = In.ctx;
    if (!c || !In.armed || c.w.paused) return;
    const d = IT.Abilities.get(In.armed.id); if (!d) return;
    const { w, hero, cam } = c;
    const hs = cam.toScreen(hero.x, hero.y);
    const rng = (d.range(w, hero) || 0) / P;
    g.lineWidth = 1;
    if (rng > 0) {
      g.strokeStyle = 'rgba(255,230,120,0.75)'; g.fillStyle = 'rgba(255,230,120,0.05)';
      g.beginPath(); g.ellipse(hs.x, hs.y, rng, rng * 0.8, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    const ctx2 = hero.ctx || w.ctx, ar = aoeRadius(In.armed.id, ctx2) / P;
    const mx = Math.round(In.mouse.x), my = Math.round(In.mouse.y);
    const p = worldMouse();
    const inRange = !rng || IT.U.dist2(hero.x, hero.y, p.x, p.y) <= (rng * P) * (rng * P);
    g.strokeStyle = inRange ? 'rgba(255,90,200,0.95)' : 'rgba(255,255,255,0.45)';
    g.fillStyle = inRange ? 'rgba(255,90,200,0.16)' : 'rgba(255,255,255,0.06)';
    if (ar > 1) { g.beginPath(); g.ellipse(mx, my, ar, ar * 0.8, 0, 0, Math.PI * 2); g.fill(); g.stroke(); }
    g.beginPath(); g.moveTo(mx - 3, my); g.lineTo(mx + 3, my); g.moveTo(mx, my - 3); g.lineTo(mx, my + 3); g.stroke();
    if (d.target === 'point' && rng > 0) { g.globalAlpha = 0.35; g.beginPath(); g.moveTo(hs.x, hs.y); g.lineTo(mx, my); g.stroke(); g.globalAlpha = 1; }
  };

  IT.Input = In;
})(typeof window !== 'undefined' ? window : globalThis);
