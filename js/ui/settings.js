// Settings model (IT.Settings, persisted in localStorage 'it2.settings') + settings panel.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const KEY = 'it2.settings';
  const SPELLS = ['coldsnap', 'ghostwalk', 'icewall', 'emp', 'tornado', 'alacrity', 'sunstrike', 'forgespirit', 'chaosmeteor', 'deafeningblast'];
  const LEG = ['Y', 'V', 'G', 'C', 'X', 'Z', 'T', 'F', 'D', 'B'];
  const COMMON = ['orbQ', 'orbW', 'orbE', 'invoke', 'attack', 'stop', 'hold', 'center', 'camLock', 'cheat', 'refresh', 'spawn', 'resetDummies'];
  const RESERVED = ['Escape', 'Tab'];

  function defaults() {
    const slots = { slot1: 'D', slot2: 'F' }, legacy = {};
    ['Z', 'X', 'C', 'V', 'B', 'N'].forEach((k, i) => { slots['item' + (i + 1)] = k; });
    SPELLS.forEach((s, i) => { legacy[s] = LEG[i]; });
    for (let i = 1; i <= 6; i++) legacy['item' + i] = String(i);
    return {
      castMode: 'quick', scheme: 'slots', autoAttack: true, camLock: false, edgeScroll: true,
      bloom: true, sound: true, hints: true, lang: 'en',
      camSpeed: 1,                 // 0.5..2 multiplier on camera scroll speed
      doubleTap: true, doubleTapTimeout: 0.6,   // double-tap ability/item to self-cast (Dota "Double Tap ... to Self Cast")
      pointerLock: false,          // confine the mouse to the game while playing
      audio: { master: 0.8, music: 0.5, sfx: 0.8, ui: 0.6, musicOn: true, muteUnfocused: true },
      keys: {
        common: { orbQ: 'Q', orbW: 'W', orbE: 'E', invoke: 'R', attack: 'A', stop: 'S', hold: 'H', center: 'Space', camLock: 'L', cheat: 'F1', refresh: 'Backspace', spawn: 'P', resetDummies: 'O' },
        slots, legacy,
      },
    };
  }
  const clone = o => JSON.parse(JSON.stringify(o));

  function merge(base, src) {
    if (!src || typeof src !== 'object') return base;
    for (const k in base) {
      if (!(k in src)) continue;
      if (k === 'keys') {
        for (const g in base.keys) {
          if (src.keys && src.keys[g]) for (const a in base.keys[g]) if (typeof src.keys[g][a] === 'string' && src.keys[g][a]) base.keys[g][a] = src.keys[g][a];
        }
      } else if (k === 'audio') {
        if (src.audio && typeof src.audio === 'object') for (const a in base.audio) if (typeof src.audio[a] === typeof base.audio[a]) base.audio[a] = src.audio[a];
      } else if (typeof base[k] === typeof src[k]) base[k] = src[k];
    }
    if (base.castMode !== 'quick' && base.castMode !== 'normal') base.castMode = 'quick';
    if (base.scheme !== 'slots' && base.scheme !== 'legacy') base.scheme = 'slots';
    if (!IT.I18N[base.lang]) base.lang = 'en';
    base.camSpeed = Math.max(0.5, Math.min(2, Number(base.camSpeed) || 1));
    base.doubleTapTimeout = Math.max(0.2, Math.min(1, Number(base.doubleTapTimeout) || 0.6));
    return base;
  }

  function keyName(ev) {
    const c = ev.code || '';
    if (/^Key[A-Z]$/.test(c)) return c.slice(3);
    if (/^Digit\d$/.test(c)) return c.slice(5);
    if (/^Numpad\d$/.test(c)) return c.slice(6);
    if (c === 'Space' || ev.key === ' ') return 'Space';
    if (ev.key === 'Escape' || ev.key === 'Tab' || ev.key === 'Backspace' || ev.key === 'Enter' || ev.key === 'Delete' || ev.key === 'Insert' || ev.key === 'Home' || ev.key === 'End' || ev.key === 'PageUp' || ev.key === 'PageDown') return ev.key;
    if (/^Arrow/.test(ev.key) || /^F\d+$/.test(ev.key)) return ev.key;
    if (ev.key && ev.key.length === 1) return ev.key.toUpperCase();
    return null;
  }
  const isMod = ev => ev.key === 'Shift' || ev.key === 'Control' || ev.key === 'Alt' || ev.key === 'Meta' || ev.key === 'CapsLock';
  const label = k => ({ Space: 'Space', Backspace: 'Bksp', Escape: 'Esc', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Delete: 'Del', PageUp: 'PgUp', PageDown: 'PgDn' }[k] || k || '-');

  const S = {
    data: defaults(), SPELLS, COMMON, RESERVED, keyName, isMod, label, defaults,
    load() {
      let raw = null;
      try { raw = JSON.parse(G.localStorage.getItem(KEY)); } catch (e) { raw = null; }
      S.data = merge(defaults(), raw);
      return S.data;
    },
    save(d) {
      try { G.localStorage.setItem(KEY, JSON.stringify(d || S.data)); } catch (e) { /* ignore */ }
    },
    // list of {action, key} for a scheme (common + scheme-specific)
    entries(d, scheme) {
      d = d || S.data; scheme = scheme || d.scheme;
      const out = [];
      for (const a of COMMON) out.push({ action: a, key: d.keys.common[a], group: 'common' });
      const g = d.keys[scheme];
      for (const a in g) out.push({ action: a, key: g[a], group: scheme });
      return out;
    },
    conflicts(d, scheme) {   // Set of action names whose key collides
      const by = {}, bad = new Set();
      for (const e of S.entries(d, scheme)) {
        const k = e.key; if (!k) { bad.add(e.action); continue; }
        (by[k] = by[k] || []).push(e.action);
      }
      for (const k in by) if (by[k].length > 1 || RESERVED.includes(k)) by[k].forEach(a => bad.add(a));
      return bad;
    },
    actionFor(key, d) {
      d = d || S.data;
      for (const e of S.entries(d)) if (e.key === key) return e.action;
      return null;
    },
    keyOf(action, d) {
      d = d || S.data;
      if (action in d.keys.common) return d.keys.common[action];
      return d.keys[d.scheme][action] || null;
    },
    get: () => S.data,
    // apply partial change + persist + notify
    set(patch) {
      const langChanged = patch.lang && patch.lang !== S.data.lang;
      Object.assign(S.data, patch);
      S.save();
      S.apply(langChanged);
    },
    replace(d) { S.data = clone(d); S.save(); S.apply(true); },
    apply(langChanged) {
      const d = S.data;
      if (G.document && G.document.body) G.document.body.classList.toggle('nobloom', !d.bloom);
      if (typeof G.SFX !== 'undefined') G.SFX.enabled = !!d.sound;
      if (langChanged || IT.lang !== d.lang) IT.setLang(d.lang);
      for (const f of S.listeners) { try { f(d); } catch (e) { /* ignore */ } }
    },
    listeners: [],
    onChange(f) { S.listeners.push(f); },
  };
  IT.Settings = S;
  S.load();
  IT.lang = S.data.lang;

  // ---------------------------------------------------------------- panel
  let draft = null, capture = null;

  function panel() {
    const { h, btn } = IT.UI, t = IT.t;
    if (!draft) draft = clone(S.data);
    const bad = S.conflicts(draft);
    const msgBox = h('div', { class: 'msg' + (bad.size ? ' err' : ''), text: bad.size ? t('set.conflict') : '' });

    const seg = (field, opts, onpick) => h('div', { class: 'seg' }, opts.map(o => h('button', {
      type: 'button', class: 'seg-b' + (draft[field] === o[0] ? ' on' : ''), text: o[1],
      onclick: () => { if (onpick && !onpick(o[0])) return; draft[field] = o[0]; refresh(); },
    })));
    const tog = (field, label, immediate) => h('label', { class: 'tog' },
      h('input', { type: 'checkbox', checked: draft[field] ? true : null, onchange: ev => { draft[field] = ev.target.checked; if (immediate) immediate(); } }),
      h('span', { class: 'box' }), h('span', { text: label }));

    function keyBtn(group, action, name) {
      const cur = group === 'common' ? draft.keys.common[action] : draft.keys[group][action];
      const isCap = capture && capture.group === group && capture.action === action;
      const inActive = group === 'common' || group === draft.scheme;
      const b = h('button', {
        type: 'button', class: 'keybtn' + (isCap ? ' cap' : '') + (inActive && bad.has(action) ? ' bad' : ''),
        text: isCap ? t('ui.pressKey') : S.label(cur),
        onclick: () => { capture = { group, action }; refresh(); },
      });
      return h('div', { class: 'keyrow' }, h('span', { class: 'kl', text: name }), b);
    }
    const nameOf = a => (a.startsWith('item') ? t('act.item' + a.slice(4)) : t('act.' + a));
    const keyGroup = (title, group, actions, active) => h('div', { class: 'kgroup' + (active ? '' : ' inactive') },
      h('h3', { text: title }), h('div', { class: 'kgrid' }, actions.map(a => keyBtn(group, a, nameOf(a)))));

    const slotActs = Object.keys(draft.keys.slots), legActs = Object.keys(draft.keys.legacy);

    const body = h('div', { class: 'set-body' },
      h('div', { class: 'set-col' },
        h('div', { class: 'fld' }, h('h3', { text: t('set.castMode') }),
          seg('castMode', [['quick', t('set.quick')], ['normal', t('set.normal')]])),
        h('div', { class: 'fld' }, h('h3', { text: t('set.scheme') }),
          seg('scheme', [['slots', t('set.slots')], ['legacy', t('set.legacy')]], v => {
            if (S.conflicts(draft, v).size) { msgBox.textContent = t('set.conflictSwitch'); msgBox.className = 'msg err'; return false; }
            return true;
          })),
        h('div', { class: 'fld togs' },
          tog('autoAttack', t('set.autoAttack')), tog('camLock', t('set.camLock')), tog('edgeScroll', t('set.edgeScroll')),
          tog('bloom', t('set.bloom'), () => G.document.body.classList.toggle('nobloom', !draft.bloom)),
          tog('sound', t('set.sound')), tog('hints', t('set.hints'))),
        h('div', { class: 'fld' }, h('h3', { text: t('ui.language') }), IT.UI.langToggle()),
        h('p', { class: 'fine', text: t('set.fixed') })),
      h('div', { class: 'set-col keys' },
        h('p', { class: 'fine', text: t('set.keysHint') }),
        keyGroup(t('set.group.common'), 'common', COMMON, true),
        keyGroup(t('set.group.slots'), 'slots', slotActs, draft.scheme === 'slots'),
        keyGroup(t('set.group.legacy'), 'legacy', legActs, draft.scheme === 'legacy')));

    const foot = h('div', { class: 'row end' },
      btn('set.defaults', () => { const k = defaults(); draft.keys = k.keys; refresh(); }, 'dim'),
      btn('ui.cancel', () => cancel()),
      btn('ui.done', () => save(), 'gold'));

    return h('div', { class: 'scr settings' }, h('div', { class: 'panel wide' }, h('h2', { class: 'ph', text: t('set.title') }), body, msgBox, foot));
  }

  function refresh() {
    const top = IT.UI.depth();
    if (!top) return;
    IT.UI.rebuild();
  }
  function cancel() {
    capture = null; draft = null;
    document.body.classList.toggle('nobloom', !S.data.bloom);
    IT.App.settingsBack();
  }
  function save() {
    if (S.conflicts(draft).size) { refresh(); return; }
    capture = null;
    const d = draft; draft = null; d.lang = S.data.lang;
    S.replace(d);
    IT.App.settingsBack();
  }
  // key capture (capture phase so nothing else sees the key)
  G.addEventListener('keydown', ev => {
    if (!capture) return;
    ev.preventDefault(); ev.stopPropagation();
    if (S.isMod(ev)) return;
    if (ev.key === 'Escape') { capture = null; refresh(); return; }
    const k = S.keyName(ev);
    if (!k || k === 'Tab') return;
    if (capture.group === 'common') draft.keys.common[capture.action] = k; else draft.keys[capture.group][capture.action] = k;
    capture = null; refresh();
  }, true);

  // language change from the panel's own toggle applies immediately and must keep the draft
  IT.UI.settingsPanel = panel;
  IT.UI.settingsCancel = cancel;
  IT.UI.settingsOpen = () => { draft = clone(S.data); capture = null; };
  IT.UI.settingsDraftLang = l => { if (draft) draft.lang = l; };
})(typeof window !== 'undefined' ? window : globalThis);
