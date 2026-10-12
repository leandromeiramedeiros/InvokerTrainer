// Top combo bar: name, step chips, tip, score/streak/timer + combo toasts. IT.ComboBar.bind(ctx, root) / update(dt) / unbind().
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const CB = { c: null, el: null, key: '', off: [], refs: {} };

  const nm = o => (o && (o[IT.lang] || o.en)) || '';

  const hctx = () => { const w = CB.c && CB.c.w; return w && w.hero && w.hero.ctx || (w && w.loadout ? IT.Values.ctx(w.loadout) : null); };
  // transient feedback line under the tip (wrong order / too early / too late)
  function feedback(text, kind) { const R = CB.refs; if (!R.fb) return; R.fb.textContent = text; R.fb.className = 'cfb ' + kind; CB.fbUntil = Date.now() + 3200; }
  const abName = id => id ? (IT.hasT('spell.' + id) ? IT.t('spell.' + id) : IT.hasT('item.' + id) ? IT.t('item.' + id) : id) : '?';

  function stepLabel(s) {
    const t = IT.t;
    if (s.type === 'attack') return t('step.attackN', { n: s.count || 1 });
    if (s.type === 'react') return t('react.' + s.react);
    if (s.type === 'position') {
      if (s.minDist != null && s.maxDist != null) return t('step.posBand', { a: s.minDist, b: s.maxDist });
      if (s.maxDist != null) return t('step.posIn', { d: s.maxDist });
      if (s.minDist != null) return t('step.posOut', { d: s.minDist });
      return t('step.pos');
    }
    if (s.type === 'move') return t(s.dir === 'away' ? 'step.moveAway' : s.dir === 'toward' ? 'step.moveToward' : 'step.move');
    return t(IT.GAME.ITEM_DOTA[s.ability] ? 'item.' + s.ability : 'spell.' + s.ability) + (s.selfCast ? ' (' + t('step.self') + ')' : '');
  }

  // icon (or short text tag) of one combo step; shared with the sandbox combo list
  CB.stepIcon = function (s) {
    const { h, icon } = IT.UI;
    if (s.type === 'attack' || s.type === 'react' || !s.ability) return h('b', { class: 'ab', text: s.type === 'attack' ? 'ATK' : s.type === 'react' ? '!' : s.type === 'move' ? 'MOV' : 'POS' });
    return icon(s.ability);
  };
  const fmtS = x => (Math.round(x * 10) / 10).toFixed(1);
  // timing window of step i (seconds after the previous step landed): { wait, lo, hi } or null when the step has no timed window
  function winOf(def, i) {
    try { const T = IT.Combo.timing(hctx()), w = IT.Combo.windowOf(def, i, T); return w && isFinite(w.wait) ? w : null; } catch (e) { return null; }
  }
  const winText = w => '+' + fmtS(w.wait) + 's (' + fmtS(Math.max(0, w.lo)) + ' - ' + fmtS(w.hi) + ')';

  CB.bind = function (ctx, root) {
    CB.unbind();
    const { h } = IT.UI;
    CB.c = ctx; CB.key = '';
    const R = CB.refs = {};
    R.name = h('b', { class: 'cname' }); R.tier = h('span', { class: 'ctr' }); R.retry = h('span', { class: 'cretry' });
    R.steps = h('div', { class: 'csteps' }); R.tip = h('div', { class: 'ctip' }); R.win = h('div', { class: 'cwin' });
    R.score = h('b', { class: 'sc' }); R.streak = h('span', { class: 'stk' });
    R.fb = h('div', { class: 'cfb' });
    R.empty = h('div', { class: 'cempty', text: IT.t('hud.noneYet') });
    CB.el = h('div', { class: 'hudp combobar' },
      h('div', { class: 'cl' }, h('div', { class: 'cbh' }, R.name, R.tier, R.retry), R.steps, R.win, R.tip, R.fb, R.empty),
      h('div', { class: 'cr' }, h('div', { class: 'scr1' }, h('span', { text: IT.t('hud.score') }), R.score), R.streak));
    root.appendChild(CB.el);
    const w = ctx.w, t = IT.t, on = (n, f) => CB.off.push(w.on(n, f));
    on('comboDone', p => { IT.UI.toast(t(p.perfect ? 'toast.perfect' : 'toast.combo', { score: p.score }), 'good'); if (IT.Input) IT.Input.sfx('success'); });
    on('comboFail', p => { const why = t('cfail.' + p.reason, { s: p.s }); IT.UI.toast(t('toast.comboFail', { why }), 'bad'); feedback(why, 'bad'); if (IT.Input) IT.Input.sfx('fail'); });
    on('comboHint', p => feedback(t('chint.' + p.kind, { got: abName(p.got), exp: abName(p.expected) }), 'warn'));
    on('comboLocked', () => IT.UI.toast(t('toast.locked'), 'warn'));
    CB.update(0);
  };
  CB.unbind = function () {
    for (const f of CB.off) { try { f(); } catch (e) { /* ignore */ } }
    CB.off = []; CB.c = null; CB.el = null; CB.refs = {};
  };

  CB.update = function () {
    const c = CB.c; if (!c) return;
    const st = c.w.combo, R = CB.refs, t = IT.t, { h, icon } = IT.UI;
    const scn = !!(c.w.ranked && c.w.ranked.pr);   // scenario modes (ranked/infinite/scenario sandbox): never the idle prompt
    if (!st) { R.empty.style.display = scn ? 'none' : ''; CB.el.style.display = scn ? 'none' : ''; return; }
    const def = st.def;
    R.empty.style.display = def ? 'none' : '';
    CB.el.style.display = scn && !def ? 'none' : '';
    R.name.style.display = R.tier.style.display = R.steps.style.display = def ? '' : 'none';
    // chips
    if (def) {
      const T = IT.Combo.timing(hctx()), key = def.id + '|' + IT.lang + '|' + (IT.Settings.get().hints ? 1 : 0) + '|' + T.lift + '|' + T.emp + '|' + T.ss + '|' + T.meteor + '|' + T.csDur + '|' + T.alacrity;
      if (CB.key !== key) {
        CB.key = key;
        R.name.textContent = nm(def.name);
        R.tier.textContent = t('tier.' + def.tier);
        const tipTx = IT.Settings.get().hints ? IT.Combo.tipText(def, hctx(), IT.lang) : '';
        R.tip.textContent = tipTx; R.tip.setAttribute('data-tip', tipTx);
        R.steps.textContent = ''; CB.chips = [];
        def.steps.forEach((s, i) => {
          const rec = s.type === 'cast' ? IT.GAME.SPELL_ORBS[s.ability] : null;
          const vis = s.targetVisibility && s.targetVisibility !== 'any' ? h('em', { class: 'vis ' + s.targetVisibility, text: t(s.targetVisibility === 'hidden' ? 'ui.hidden' : 'ui.visible') }) : null;
          const wn = winOf(def, i);
          const chip = h('div', { class: 'cstep', 'data-tip': stepLabel(s) + (wn ? '\n' + t('cb.win') + ' ' + winText(wn) : '') },
            h('i', { class: 'sn', text: String(i + 1) }),
            CB.stepIcon(s),
            h('span', { class: 'sl', text: stepLabel(s) }),
            rec && IT.Settings.get().hints ? h('span', { class: 'rec', text: rec }) : null, vis);
          R.steps.appendChild(chip); CB.chips.push(chip);
        });
      }
      let cur = -1;
      st.steps.forEach((s, i) => { if (cur < 0 && (s.status === 'active' || s.status === 'pending')) cur = i; });
      const wn = cur >= 0 ? winOf(def, cur) : null;
      const wtx = cur >= 0 ? t('cb.next') + ' ' + stepLabel(def.steps[cur]) + (wn ? '  ' + t('cb.win') + ' ' + winText(wn) : '') : '';
      if (R.win.textContent !== wtx) R.win.textContent = wtx;
      st.steps.forEach((s, i) => {
        const chip = CB.chips[i]; if (!chip) return;
        const cls = 'cstep ' + (s.status || 'todo') + (s.status === 'active' || s.status === 'pending' ? ' now' : '');
        if (chip.className !== cls) chip.className = cls;
        const n = def.steps[i].count > 1 && s.n != null ? ' ' + s.n + '/' + def.steps[i].count : '';
        const lab = chip.querySelector('.sl'); const txt = stepLabel(def.steps[i]) + n; if (lab.textContent !== txt) lab.textContent = txt;
        const tp = (txt + (n ? '' : '')); if (chip.getAttribute('data-tip') !== tp && !winOf(def, i)) chip.setAttribute('data-tip', tp);
      });
      const rt = st.retries ? t('hud.retry', { n: st.retries }) : '';
      if (R.retry.textContent !== rt) R.retry.textContent = rt;
      R.el = null;
    } else if (CB.key) { CB.key = ''; R.tip.textContent = ''; R.tip.removeAttribute('data-tip'); R.win.textContent = ''; }
    if (R.fb && R.fb.textContent && Date.now() > (CB.fbUntil || 0)) { R.fb.textContent = ''; R.fb.className = 'cfb'; }
    const sc = String(Math.round(st.score || 0)); if (R.score.textContent !== sc) R.score.textContent = sc;
    const sk = st.streak > 1 ? t('hud.streak', { n: st.streak }) : ''; if (R.streak.textContent !== sk) R.streak.textContent = sk;
    CB.el.classList.toggle('done', st.phase === 'done'); CB.el.classList.toggle('failed', st.phase === 'fail');
  };

  IT.ComboBar = CB;
})(typeof window !== 'undefined' ? window : globalThis);
