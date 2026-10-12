// Item drag: ONE small state machine (idle -> pressed -> dragging -> drop | cancel) shared by the in-game HUD slots and the loadout screen.
// Pure core (IT.UI.ItemDrag.create / resolve, no DOM); IT.UI.ItemDrag.bind wires it to window mouse events for the span of ONE drag only:
// listeners are added on press and removed on end (no leaks), capture phase on window (nothing can swallow the release), and the drag is
// cancelled by Esc, window blur / tab hide, a release outside the page, a mouse that is no longer down (release was missed), a context menu.
// It never touches the sim (no pause flag, no timers): a slot swap while playing keeps the game running.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  IT.UI = IT.UI || {};
  const THRESH = 5;   // px of travel before a press becomes a drag (below that a release is a click)

  // src: { kind:'slot', i } | { kind:'cat', id };  target: { kind:'slot', i } | { kind:'bin' } | null (null = nothing under the pointer / outside the page)
  // mode 'game': only slot -> slot (swap); everything else cancels.  mode 'loadout': slot -> slot (reorder), cat -> slot (add / replace), slot -> bin (remove).
  // The catalogue is never a target, so it can never be reordered.
  function resolve(src, target, mode) {
    if (!src || !target) return { type: 'none' };
    if (src.kind === 'slot') {
      if (target.kind === 'slot') return src.i === target.i ? { type: 'none' } : { type: 'swap', from: src.i, to: target.i };
      if (target.kind === 'bin' && mode === 'loadout') return { type: 'remove', from: src.i };
      return { type: 'none' };
    }
    if (src.kind === 'cat' && mode === 'loadout' && target.kind === 'slot') return { type: 'add', id: src.id, at: target.i };
    return { type: 'none' };
  }

  // cb: { canDrag(src) -> bool, onStart(src), onOver(target), onClick(src, meta), onDrop(src, target, action), onCancel(reason, src) } (all optional)
  function create(cb, mode) {
    cb = cb || {};
    const m = {
      state: 'idle', src: null, over: null, x: 0, y: 0, meta: null, mode: mode || 'game',
      get active() { return m.state !== 'idle'; },
      get dragging() { return m.state === 'dragging'; },
      down(src, x, y, meta) {
        if (m.state !== 'idle') m.cancel('restart');
        m.state = 'pressed'; m.src = src; m.x = x; m.y = y; m.meta = meta || null; m.over = null;
        return true;
      },
      move(x, y, target) {
        if (m.state === 'pressed') {
          if (Math.hypot(x - m.x, y - m.y) < THRESH) return false;
          if (cb.canDrag && !cb.canDrag(m.src)) return false;   // empty slot: stays a click
          m.state = 'dragging';
          if (cb.onStart) cb.onStart(m.src);
        }
        if (m.state !== 'dragging') return false;
        if (!sameT(target, m.over)) { m.over = target || null; if (cb.onOver) cb.onOver(m.over); }
        return true;
      },
      up(x, y, target) {   // release: pressed -> click, dragging -> drop (target null = outside -> nothing happens)
        const s = m.state, src = m.src, meta = m.meta;
        if (s === 'idle') return null;
        end();
        if (s === 'pressed') { if (cb.onClick) cb.onClick(src, meta); return { type: 'click' }; }
        const act = resolve(src, target, m.mode);
        if (cb.onDrop) cb.onDrop(src, target || null, act);
        return act;
      },
      cancel(reason) {   // Esc / blur / lost release: back to idle, nothing applied. A pressed-only state is dropped silently (no click).
        const s = m.state, src = m.src;
        if (s === 'idle') return false;
        end();
        if (s === 'dragging' && cb.onCancel) cb.onCancel(reason || 'cancel', src);
        return s === 'dragging';
      },
    };
    const sameT = (a, b) => (!a && !b) || (a && b && a.kind === b.kind && a.i === b.i);
    function end() { m.state = 'idle'; m.src = null; m.over = null; m.meta = null; }
    return m;
  }

  // env: { win, doc, hit(x, y) -> target, locked() -> bool (pointer lock: real events carry stale coords, the synthetic ones are used), end() (called once when the drag is over) }
  // returns begin(src, ev): start tracking a press. Listeners live only while the machine is not idle.
  function bind(m, env) {
    const W = env.win, off = [];
    const lockedReal = ev => !!(env.locked && env.locked() && ev.isTrusted !== false);
    function detach() { if (!off.length) return; while (off.length) off.pop()(); if (env.end) env.end(); }
    const on = (t, type, fn) => { t.addEventListener(type, fn, true); off.push(() => t.removeEventListener(type, fn, true)); };
    function begin(src, ev) {
      if (!ev || ev.button !== 0) return false;
      if (off.length) detach();
      m.down(src, ev.clientX, ev.clientY, { shift: !!ev.shiftKey });
      on(W, 'mousemove', e => {
        if (lockedReal(e)) return;
        if (e.isTrusted !== false && e.buttons !== undefined && !(e.buttons & 1) && !(env.locked && env.locked())) { m.cancel('lost'); detach(); return; }   // release happened where we could not see it
        m.move(e.clientX, e.clientY, env.hit(e.clientX, e.clientY));
        if (env.moved) env.moved(e.clientX, e.clientY);
      });
      on(W, 'mouseup', e => {
        if (e.button !== 0 || lockedReal(e)) return;
        const t = (e.clientX >= 0 && e.clientY >= 0 && e.clientX < (W.innerWidth || 1e9) && e.clientY < (W.innerHeight || 1e9)) ? env.hit(e.clientX, e.clientY) : null;
        m.up(e.clientX, e.clientY, t); detach();
      });
      on(W, 'blur', () => { m.cancel('blur'); detach(); });
      on(W, 'contextmenu', () => { m.cancel('menu'); detach(); });
      on(W, 'keydown', e => {
        if (e.key !== 'Escape') return;
        const was = m.dragging;
        m.cancel('esc'); detach();
        if (was) { e.stopImmediatePropagation(); e.preventDefault(); }   // Esc only cancels the drag (no pause menu)
      });
      if (env.doc) on(env.doc, 'visibilitychange', () => { if (env.doc.hidden) { m.cancel('hidden'); detach(); } });
      return true;
    }
    begin.abort = reason => { m.cancel(reason || 'abort'); detach(); };
    return begin;
  }

  IT.UI.ItemDrag = { create, resolve, bind, THRESH };
})(typeof window !== 'undefined' ? window : globalThis);
