// Floating HUD panels (recipe sheet, live stats): drag by the title bar, resize from the bottom-right grip, reset + close, state kept in localStorage.
// Geometry is in HUD base units (the 480x270 stage grid, 1 unit = var(--u)), so a saved layout survives any window size.
//   const P = IT.UI.Panel.create({ id, title, content, min:{w,h}, max:{w,h}, default:{x,y,w,h}, fit, host, onChange })
//   P.toggle() / P.setOpen(b) / P.isOpen() / P.reset() / P.getRect() / P.setRect(r) / P.destroy()
// Pure helpers (tested): Panel.clampSize / clampRect / moveRect / resizeRect / pack / unpack / model.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  IT.UI = IT.UI || {};
  const KEY = 'it2.panel.';
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const base = () => ({ w: (IT.GAME && IT.GAME.VIEW_W_BASE) || 480, h: (IT.GAME && IT.GAME.VIEW_H_BASE) || 270 });

  // ---------------------------------------------------------------- pure geometry (base units)
  // size inside [min, min(max, host)]; a host smaller than min never pushes the size under min
  function clampSize(s, min, max, host) {
    const mw = Math.max(min.w, Math.min(max ? max.w : Infinity, host ? host.w : Infinity));
    const mh = Math.max(min.h, Math.min(max ? max.h : Infinity, host ? host.h : Infinity));
    return { w: clamp(num(s.w, min.w), min.w, mw), h: clamp(num(s.h, min.h), min.h, mh) };
  }
  // whole rect inside the host
  function clampRect(r, min, max, host) {
    const s = clampSize(r, min, max, host);
    return { x: clamp(num(r.x, 0), 0, Math.max(0, host.w - s.w)), y: clamp(num(r.y, 0), 0, Math.max(0, host.h - s.h)), w: s.w, h: s.h };
  }
  const moveRect = (start, dx, dy, min, max, host) => clampRect({ x: start.x + dx, y: start.y + dy, w: start.w, h: start.h }, min, max, host);
  // bottom-right grip: the top-left corner stays put; the size stops at min / max / the host edge
  function resizeRect(start, dx, dy, min, max, host) {
    const room = { w: host.w - start.x, h: host.h - start.y };
    const s = clampSize({ w: start.w + dx, h: start.h + dy }, min, max, room);
    return { x: start.x, y: start.y, w: s.w, h: s.h };
  }
  const pack = st => JSON.stringify({ open: !!st.open, x: st.rect.x, y: st.rect.y, w: st.rect.w, h: st.rect.h });
  // stored text -> { open, rect } (bad / missing data falls back to the default, closed)
  function unpack(raw, def, min, max, host) {
    let o = null;
    try { o = JSON.parse(raw); } catch (e) { o = null; }
    if (!o || typeof o !== 'object') o = {};
    const ok = ['x', 'y', 'w', 'h'].every(k => typeof o[k] === 'number' && isFinite(o[k]));
    return { open: o.open === true, rect: clampRect(ok ? o : def, min, max, host) };
  }

  // ---------------------------------------------------------------- model (state + persistence, no DOM)
  function storage() { try { return G.localStorage || null; } catch (e) { return null; } }
  function model(o) {
    const host = o.hostSize || base;
    const min = o.min || { w: 60, h: 40 }, max = o.max || { w: base().w, h: base().h };
    const def = clampRect(o.default || { x: 20, y: 20, w: min.w * 2, h: min.h * 2 }, min, max, host());
    const m = { id: o.id, open: false, rect: Object.assign({}, def), min, max, def };
    m.load = () => {
      let raw = null;
      try { const s = storage(); raw = s ? s.getItem(KEY + m.id) : null; } catch (e) { raw = null; }
      const st = raw == null ? { open: false, rect: def } : unpack(raw, def, min, max, host());
      m.open = st.open; m.rect = Object.assign({}, st.rect);
      return m;
    };
    m.save = () => { try { const s = storage(); if (s) s.setItem(KEY + m.id, pack(m)); } catch (e) { /* ignore */ } };
    m.setOpen = b => { m.open = !!b; m.save(); return m.open; };
    m.toggle = () => m.setOpen(!m.open);
    m.setRect = r => { m.rect = clampRect(r, min, max, host()); return m.rect; };
    m.move = (start, dx, dy) => { m.rect = moveRect(start, dx, dy, min, max, host()); return m.rect; };
    m.resize = (start, dx, dy) => { m.rect = resizeRect(start, dx, dy, min, max, host()); return m.rect; };
    m.reset = () => { m.rect = Object.assign({}, def); m.save(); return m.rect; };
    m.clamp = () => { m.rect = clampRect(m.rect, min, max, host()); return m.rect; };
    return m.load();
  }

  // ---------------------------------------------------------------- view
  let zTop = 10;
  function create(o) {
    const doc = G.document, t = IT.t || (k => k);
    const hostEl = o.host || doc.getElementById('hud');
    // HUD base-unit size of the host (the stage keeps 16:9, but measure it so a different box still clamps)
    const hostSize = () => {
      const b = base(), w = hostEl && hostEl.clientWidth, h = hostEl && hostEl.clientHeight;
      return w > 0 && h > 0 ? { w: b.w, h: b.w * h / w } : b;
    };
    const M = model(Object.assign({}, o, { hostSize }));
    const el = (tag, cls, parent) => { const e = doc.createElement(tag); e.className = cls; if (parent) parent.appendChild(e); return e; };
    const root = el('div', 'hudp pnl', hostEl), bar = el('div', 'ptb', root), ttl = el('span', 'ptt', bar);
    const rst = el('button', 'pbt prs', bar), cls = el('button', 'pbt pcl', bar), body = el('div', 'pbd', root), grip = el('i', 'pgr', root);
    root.id = 'pnl-' + M.id;
    rst.type = cls.type = 'button'; rst.textContent = '↺'; cls.textContent = '×';
    const tip = (b, k) => { const s = t(k); b.setAttribute('data-tip', s); b.setAttribute('aria-label', s); };
    tip(rst, 'panel.reset'); tip(cls, 'panel.close');
    ttl.textContent = typeof o.title === 'function' ? o.title() : (o.title || '');
    const content = typeof o.content === 'function' ? o.content() : o.content;
    if (content) body.appendChild(content);

    const P = { id: M.id, el: root, body, model: M };
    const U = v => 'calc(var(--u) * ' + Math.round(v * 100) / 100 + ')';
    P.render = () => {
      const r = M.rect, s = root.style;
      s.left = U(r.x); s.top = U(r.y); s.width = U(r.w); s.height = U(r.h);
      s.display = M.open ? '' : 'none';
      if (o.fit) body.style.fontSize = Math.round(clamp(r.w / M.def.w, 0.5, 2.5) * 100) + '%';   // content scales with the width
    };
    P.isOpen = () => M.open;
    P.getRect = () => Object.assign({}, M.rect);
    P.setRect = r => { M.setRect(r); M.save(); P.render(); };
    P.front = () => { root.style.zIndex = ++zTop; };
    P.setOpen = b => {
      const was = M.open; M.setOpen(b); P.render();
      if (M.open) P.front();
      if (was !== M.open && o.onChange) o.onChange(M.open, P);
    };
    P.toggle = () => P.setOpen(!M.open);
    P.reset = () => { M.reset(); P.render(); };

    // ---- drag / resize (mouse events: under pointer lock IT.Input re-dispatches them to the element under its virtual cursor)
    let act = null;
    const pt = ev => { const In = IT.Input; return In && In.locked && ev.isTrusted !== false ? { x: In.vx, y: In.vy } : { x: ev.clientX, y: ev.clientY }; };
    const unit = () => { const r = hostEl && hostEl.getBoundingClientRect ? hostEl.getBoundingClientRect() : null; return r && r.width > 0 ? r.width / base().w : 1; };
    const onMove = ev => {
      if (!act) return;
      if (!(IT.Input && IT.Input.locked)) ev.stopPropagation();   // locked: IT.Input must still see the move to steer its virtual cursor
      const p = pt(ev), u = act.u;
      if (act.kind === 'move') M.move(act.r0, (p.x - act.p0.x) / u, (p.y - act.p0.y) / u);
      else M.resize(act.r0, (p.x - act.p0.x) / u, (p.y - act.p0.y) / u);
      P.render();
    };
    const end = ev => {
      if (!act) return;
      if (ev && !(IT.Input && IT.Input.locked)) ev.stopPropagation();
      act = null; M.save();
      G.removeEventListener('mousemove', onMove, true); G.removeEventListener('mouseup', end, true);
    };
    const start = kind => ev => {
      if (ev.button !== 0 || act) return;
      if (kind === 'move' && ev.target && ev.target.closest && ev.target.closest('.pbt')) return;
      ev.preventDefault(); ev.stopPropagation();
      act = { kind, p0: pt(ev), r0: Object.assign({}, M.rect), u: unit() };
      P.front();
      if (IT.Input && IT.Input.mouse) IT.Input.mouse.in = false;   // the game must not treat this as a cursor over the map
      G.addEventListener('mousemove', onMove, true); G.addEventListener('mouseup', end, true);
    };
    bar.addEventListener('mousedown', start('move'));
    grip.addEventListener('mousedown', start('size'));
    root.addEventListener('mousedown', ev => { if (ev.button === 0) P.front(); });
    rst.addEventListener('click', ev => { ev.stopPropagation(); P.reset(); });
    cls.addEventListener('click', ev => { ev.stopPropagation(); P.setOpen(false); });
    const onResize = () => { M.clamp(); P.render(); };
    G.addEventListener('resize', onResize);
    P.destroy = () => {
      act = null;
      G.removeEventListener('mousemove', onMove, true); G.removeEventListener('mouseup', end, true); G.removeEventListener('resize', onResize);
      if (root.parentNode) root.parentNode.removeChild(root);
    };
    P.render();
    return P;
  }

  IT.UI.Panel = { create, model, clampSize, clampRect, moveRect, resizeRect, pack, unpack, KEY };
})(typeof window !== 'undefined' ? window : globalThis);
