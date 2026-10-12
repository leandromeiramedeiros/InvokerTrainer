// F1 helpers for the scenario top-HUD (pure, no DOM): step derivation, orb-press planning, progress tracker, lose line keys.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const SPELL_ORBS = () => (IT.GAME && IT.GAME.SPELL_ORBS) || {};
  const WINDOW = 3;   // a step may be skipped by up to this many steps ahead of the current one

  // one action id -> { k:'spell'|'item'|'attack'|'move'|'stop'|'hold'|'pos', id? }
  function kindOf(a) {
    if (a === 'attack' || a === 'move' || a === 'stop' || a === 'hold') return { k: a };
    if (a === 'pos' || a === 'position') return { k: 'pos' };
    if (typeof a !== 'string' || !a) return null;
    return SPELL_ORBS()[a] ? { k: 'spell', id: a } : { k: 'item', id: a };
  }

  // ordered steps of a scenario: sc.steps [{a, at?, label?}] if present, else the solver script sc.sol, else sc.spells (ids)
  function derive(sc) {
    const src = sc && Array.isArray(sc.steps) && sc.steps.length ? sc.steps
      : sc && Array.isArray(sc.sol) && sc.sol.length ? sc.sol
      : sc && Array.isArray(sc.spells) ? sc.spells.map(a => ({ a })) : [];
    const out = [];
    for (const s of src) {
      if (!s) continue;
      const k = kindOf(typeof s === 'string' ? s : (s.a != null ? s.a : s.ability));
      if (!k) continue;
      if (s.label) k.label = s.label;
      if (s.at) k.at = s.at;
      out.push(k);
    }
    return out;
  }

  // shortest orb presses (<= 3) that leave the 3-orb queue holding exactly the recipe (Dota queue = last 3 presses)
  function planOrbs(orbs, recipe) {
    const want = recipe.split('').sort().join(''), ok = q => q.length === 3 && q.slice().sort().join('') === want;
    const cur = (orbs || []).slice(-3);
    for (let k = 0; k <= 3; k++) {
      for (let m = 0; m < Math.pow(3, k); m++) {
        const seq = []; let x = m;
        for (let i = 0; i < k; i++) { seq.push('QWE'[x % 3]); x = Math.floor(x / 3); }
        const q = cur.concat(seq).slice(-3);
        if (ok(q)) return { seq, q };
      }
    }
    const rs = recipe.split('');
    return { seq: rs, q: rs };
  }

  // expand steps into key presses. state: { orbs:['Q'..], slots:[spell,spell], items:[id|null x6], preinvoked:[spell] }
  // press: { t:'orb', o:'Q'|'W'|'E' } | { t:'inv' } | { t:'cast', slot:0|1 } | { t:'item', slot:-1..5 } | { t:'atk' } | { t:'move' } | { t:'stop' } | { t:'hold' } | { t:'pos' }
  function plan(steps, state) {
    state = state || {};
    let orbs = (state.orbs || []).slice(-3), slots = (state.slots || [null, null]).slice(0, 2);
    for (const s of state.preinvoked || []) if (s && !slots.includes(s)) slots = [s, slots[0] || null];
    const items = state.items || [];
    return steps.map(st => {
      const presses = [];
      if (st.k === 'spell') {
        let at = slots.indexOf(st.id);
        if (at < 0) {
          const p = planOrbs(orbs, SPELL_ORBS()[st.id] || '');
          for (const o of p.seq) presses.push({ t: 'orb', o });
          orbs = p.q;
          presses.push({ t: 'inv' });
          slots = [st.id, slots[0] || null]; at = 0;
        }
        presses.push({ t: 'cast', slot: at });
      } else if (st.k === 'item') presses.push({ t: 'item', slot: items.indexOf(st.id) });
      else presses.push({ t: st.k === 'attack' ? 'atk' : st.k === 'move' || st.k === 'stop' || st.k === 'hold' ? st.k : 'pos' });
      return Object.assign({}, st, { presses: presses.map(p => Object.assign({ done: false }, p)), done: false });
    });
  }

  // progress tracker over a planned step list. feed() takes the already hero-filtered events:
  //   { type:'orb', orb:'Q' } | { type:'invoke', spell } | { type:'cast', ability } | { type:'attack' } | { type:'move' } | { type:'stop' } | { type:'hold' }
  function tracker(steps) {
    const T = { steps, feed, idx, states, pressStates, finished };
    function idx() { const i = steps.findIndex(s => !s.done); return i < 0 ? steps.length : i; }
    function finishStep(j) {
      for (let i = idx(); i <= j; i++) { steps[i].done = true; for (const p of steps[i].presses) p.done = true; }
    }
    function find(pred) { for (let j = idx(); j < Math.min(steps.length, idx() + WINDOW); j++) if (pred(steps[j])) return j; return -1; }
    function feed(ev) {
      if (!ev || idx() >= steps.length) return;
      if (ev.type === 'orb') {
        const cur = steps[idx()];
        const p = cur.presses.find(q => !q.done && q.t === 'orb' && q.o === ev.orb);
        if (p) p.done = true;
      } else if (ev.type === 'invoke') {
        const j = find(s => s.k === 'spell' && s.id === ev.spell);
        if (j >= 0) for (const p of steps[j].presses) if (p.t === 'orb' || p.t === 'inv') p.done = true;
      } else if (ev.type === 'cast') {
        const j = find(s => (s.k === 'spell' || s.k === 'item') && s.id === ev.ability);
        if (j >= 0) finishStep(j);
      } else if (ev.type === 'attack') {
        const j = find(s => s.k === 'attack'); if (j >= 0) finishStep(j);
      } else if (ev.type === 'move') {
        const j = find(s => s.k === 'move' || s.k === 'pos'); if (j >= 0) finishStep(j);
      } else if (ev.type === 'stop' || ev.type === 'hold') {
        const j = find(s => s.k === ev.type); if (j >= 0) finishStep(j);
      }
    }
    // 'done' | 'now' | 'todo' per step
    function states() { const n = idx(); return steps.map((s, i) => (s.done ? 'done' : i === n ? 'now' : 'todo')); }
    // within the current step: 'done' | 'now' | 'todo' per press
    function pressStates(i) {
      const s = steps[i]; if (!s) return [];
      let seen = false;
      return s.presses.map(p => (p.done ? 'done' : !seen && s.done === false && i === idx() ? (seen = true, 'now') : 'todo'));
    }
    function finished() { return idx() >= steps.length; }
    return T;
  }

  // lose-condition keys for a scenario (text comes from i18n 'lose.<key>'); sc.lose (a {en,pt} text) is handled by the caller
  function loseKeys(sc, timed) {
    const out = [];
    const fail = sc && Array.isArray(sc.fail) && sc.fail.length ? sc.fail : [sc && sc.obj && sc.obj.type === 'escape' ? 'caught' : null, 'time'];
    for (const f of fail) {
      if (!f || (f === 'time' && !timed)) continue;
      if (!out.includes(f)) out.push(f);
    }
    return out;
  }

  const fmtN = n => String(Math.round(n * 10) / 10);

  IT.HudSteps = { WINDOW, kindOf, derive, planOrbs, plan, tracker, loseKeys, fmtN };
})(typeof window !== 'undefined' ? window : globalThis);
