// IT.UI.DiffBar (item 23): the one difficulty control. Five segments IAN < EASY < NORMAL < HARD < BAMBAM (internal id 'common' shows NORMAL),
// green -> red/purple ramp, filled up to the current tier, current one glows with a bold label. Clickable + arrow keys; one tooltip per tier
// (reaction time, item warning, awareness from IT.DIFFICULTY). compact(id) is the read-only variant for cards / HUD / briefing.
//   const B = IT.UI.DiffBar.create({ value, onChange(id), compact, label, name }); B.el / B.get() / B.set(id)
//   IT.UI.DiffBar.compact(id, { label }) -> element;  pure (tested): ids / index / step / model / tipText / labelOf
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  IT.UI = IT.UI || {};
  const FALLBACK = ['ian', 'easy', 'common', 'hard', 'bambam'];
  const ids = () => (IT.DIFFICULTY && IT.DIFFICULTY.order) || FALLBACK;
  const LAB = { ian: ['IAN', 'IAN'], easy: ['EASY', 'FÁCIL'], common: ['NORMAL', 'NORMAL'], hard: ['HARD', 'DIFÍCIL'], bambam: ['BAMBAM', 'BAMBAM'] };
  const tr = (k, o) => (IT.t ? IT.t(k, o) : k);
  const lang = () => (IT.lang === 'pt' ? 1 : 0);
  const norm = id => {
    const m = IT.DIFFICULTY && IT.DIFFICULTY.migrate ? IT.DIFFICULTY.migrate(id) : id;
    return ids().indexOf(m) >= 0 ? m : 'common';
  };
  const index = id => ids().indexOf(norm(id));
  const labelOf = id => { const k = 'db.' + norm(id); return IT.hasT && IT.hasT(k) ? tr(k) : (LAB[norm(id)] || [norm(id).toUpperCase()])[lang()] || norm(id).toUpperCase(); };
  // next / previous tier (clamped); dir = +1 / -1
  const step = (id, dir) => ids()[Math.max(0, Math.min(ids().length - 1, index(id) + (dir < 0 ? -1 : 1)))];
  // pure view model: which segments are filled, which one is current
  function model(id) {
    const n = ids().length, c = index(id);
    return { n, cur: c, id: ids()[c], fill: Array.from({ length: n }, (_, i) => i <= c), label: labelOf(id) };
  }
  const f1 = v => String(Math.round(v * 100) / 100);
  function tipText(id) {
    const d = IT.DIFFICULTY && IT.DIFFICULTY.get ? IT.DIFFICULTY.get(norm(id)) : null;
    if (!d) return labelOf(id);
    return [labelOf(id),
      tr('db.react', { n: f1(d.reaction) }),
      d.telegraph > 0 ? tr('db.items', { n: f1(d.telegraph) }) : tr('db.items0'),
      tr('db.aware', { n: Math.round(d.awareness * 100) })].join('\n');
  }

  function create(o) {
    o = o || {};
    const h = IT.UI.h, order = ids();
    let cur = norm(o.value), onChange = o.onChange;
    const segs = order.map((id, i) => h('button', {
      type: 'button', class: 'dseg d-' + id, role: 'radio', 'data-tier': id, 'data-tip': tipText(id), 'aria-label': labelOf(id),
      onclick: ev => { ev.stopPropagation(); ev.currentTarget.blur(); pick(id, true); },
    }));
    const lab = h('b', { class: 'dlab', text: labelOf(cur) });
    const el = h('div', { class: 'dbar' + (o.compact ? ' sm' : '') + (o.label === false ? ' nolab' : ''), role: 'radiogroup', tabindex: '0', 'aria-label': o.name || tr('db.title') },
      h('span', { class: 'dsegs' }, segs), lab);
    function paint() {
      const m = model(cur);
      segs.forEach((s, i) => {
        s.classList.toggle('on', m.fill[i]); s.classList.toggle('cur', i === m.cur);
        s.setAttribute('aria-checked', i === m.cur ? 'true' : 'false'); s.tabIndex = -1;
      });
      lab.textContent = labelOf(cur); lab.className = 'dlab d-' + cur;
      el.setAttribute('data-tier', cur); el.setAttribute('aria-valuetext', labelOf(cur));
    }
    function pick(id, fire) {
      id = norm(id);
      if (id === cur) return;
      cur = id; paint();
      if (fire && onChange) onChange(cur);
    }
    el.addEventListener('keydown', ev => {
      const k = ev.key;
      let nx = null;
      if (k === 'ArrowRight' || k === 'ArrowUp') nx = step(cur, 1);
      else if (k === 'ArrowLeft' || k === 'ArrowDown') nx = step(cur, -1);
      else if (k === 'Home') nx = order[0];
      else if (k === 'End') nx = order[order.length - 1];
      if (nx == null) return;
      ev.preventDefault(); ev.stopPropagation(); pick(nx, true);
    });
    el.addEventListener('wheel', ev => ev.stopPropagation(), { passive: true });
    paint();
    return { el, get: () => cur, set: id => pick(id, false), onChange: f => { onChange = f; }, repaint: paint };
  }

  // read-only variant (cards, HUD, briefing): same ramp, no buttons
  function compact(id, o) {
    o = o || {};
    const h = IT.UI.h, m = model(id);
    return h('span', { class: 'dbar ro sm d-' + m.id + (o.label === false ? ' nolab' : ''), 'data-tier': m.id, 'data-tip': o.tip === false ? null : tipText(id), role: 'img', 'aria-label': m.label },
      h('span', { class: 'dsegs' }, m.fill.map((on, i) => h('i', { class: 'dseg d-' + ids()[i] + (on ? ' on' : '') + (i === m.cur ? ' cur' : '') }))),
      o.label === false ? null : h('b', { class: 'dlab d-' + m.id, text: m.label }));
  }

  IT.UI.DiffBar = { create, compact, ids, index, step, model, tipText, labelOf, norm };
})(typeof window !== 'undefined' ? window : globalThis);
