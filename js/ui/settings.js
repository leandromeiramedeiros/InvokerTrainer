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
      heroSkin: 'default',         // 'default'|'kid'|'dark' -> IT.Art.heroSheet()
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
    if (base.heroSkin !== 'kid' && base.heroSkin !== 'dark') base.heroSkin = 'default';
    base.camSpeed = Math.max(0.5, Math.min(2, Number(base.camSpeed) || 1));
    base.doubleTapTimeout = Math.max(0.2, Math.min(1, Number(base.doubleTapTimeout) || 0.6));
    return base;
  }

  const PUNCT = { Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', IntlBackslash: '\\' };
  const NUMPAD = { NumpadAdd: 'Num+', NumpadSubtract: 'Num-', NumpadMultiply: 'Num*', NumpadDivide: 'Num/', NumpadDecimal: 'Num.', NumpadEnter: 'NumEnter' };
  function keyName(ev) {
    const c = ev.code || '';
    if (/^Key[A-Z]$/.test(c)) return c.slice(3);
    if (/^Digit\d$/.test(c)) return c.slice(5);
    if (/^Numpad\d$/.test(c)) return 'Num' + c.slice(6);
    if (NUMPAD[c]) return NUMPAD[c];
    if (PUNCT[c]) return PUNCT[c];
    if (c === 'CapsLock' || ev.key === 'CapsLock') return 'CapsLock';
    if (c === 'Space' || ev.key === ' ') return 'Space';
    if (ev.key === 'Escape' || ev.key === 'Tab' || ev.key === 'Backspace' || ev.key === 'Enter' || ev.key === 'Delete' || ev.key === 'Insert' || ev.key === 'Home' || ev.key === 'End' || ev.key === 'PageUp' || ev.key === 'PageDown') return ev.key;
    if (/^Arrow/.test(ev.key) || /^F\d+$/.test(ev.key)) return ev.key;
    if (ev.key && ev.key.length === 1) return ev.key.toUpperCase();
    return null;
  }
  const isMod = ev => ev.key === 'Shift' || ev.key === 'Control' || ev.key === 'Alt' || ev.key === 'Meta' || ev.key === 'AltGraph';
  const label = k => ({ Space: 'Space', Backspace: 'Bksp', Escape: 'Esc', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Delete: 'Del', PageUp: 'PgUp', PageDown: 'PgDn',
    CapsLock: 'Caps', Mouse4: 'Mouse 4', Mouse5: 'Mouse 5', NumEnter: 'Num Ent' }[k] || (/^Num[0-9+\-*\/.]$/.test(k || '') ? 'Num ' + k.slice(3) : k) || '-');

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

  // ---- panel (Dota-style: left nav + sections; edits go to a draft, applied on Save)
  let draft = null, capture = null, sec = 'abil', note = '', auxSwallow = false;
  const HK = [['abil', 'set.nav.abil'], ['units', 'set.nav.units'], ['camera', 'set.nav.camera'], ['iface', 'set.nav.iface']];
  const NAV = [['game', 'set.nav.game'], ['audio', 'set.nav.audio'], ['video', 'set.nav.video'], ['lang', 'set.nav.lang']];
  const pct = v => Math.round(v * 100) + '%', mult = v => (+v).toFixed(2) + 'x';
  const swallow = ev => { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation(); };
  const mouseName = ev => (IT.Input && IT.Input.mouseKeyName ? IT.Input.mouseKeyName(ev) : ({ 3: 'Mouse4', 4: 'Mouse5' })[ev.button] || null);
  function setBind(c, k) { if (c.group === 'common') draft.keys.common[c.action] = k; else draft.keys[c.group][c.action] = k; }

  function panel() {
    const { h, btn, icon, portrait, langToggle } = IT.UI, t = IT.t;
    if (!draft) draft = clone(S.data);
    const bad = S.conflicts(draft);
    const msgBox = h('div', { class: 'msg' + (note || bad.size ? ' err' : ''), text: note || (bad.size ? t('set.conflict') : '') });
    const isCap = (g, a) => !!capture && capture.group === g && capture.action === a;
    const live = g => g === 'common' || g === draft.scheme;
    const curKey = (g, a) => (g === 'common' ? draft.keys.common[a] : draft.keys[g][a]);
    const cls = (g, a, base) => base + (isCap(g, a) ? ' cap' : '') + (live(g) && bad.has(a) ? ' bad' : '');
    const pick = (g, a) => { capture = { group: g, action: a }; note = ''; refresh(); };
    const kb = (g, a) => h('button', { type: 'button', class: cls(g, a, 'kb'), text: isCap(g, a) ? t('ui.pressKey') : S.label(curKey(g, a)), onclick: () => pick(g, a) });
    // keycap: bound key in a corner label, icon/name in the cap
    const kc = (g, a, ic, name) => h('button', { type: 'button', class: cls(g, a, 'kc'), 'data-tip': t('set.rebind'), onclick: () => pick(g, a) },
      h('span', { class: 'kk', text: isCap(g, a) ? '?' : S.label(curKey(g, a)) }),
      h('span', { class: 'ki' }, ic || null),
      h('span', { class: 'kn', text: isCap(g, a) ? t('ui.pressKey') : name }));
    const row = (label, ctl) => h('div', { class: 'set-r' }, h('span', { class: 'set-rn', text: label }), ctl);
    const kRow = (g, a, label) => row(label || t('set.k.' + a), kb(g, a));
    const fxRow = (label, keyText) => row(label, h('span', { class: 'set-fk', text: keyText }));
    const chkv = (on, label, fn) => h('label', { class: 'set-r sc' },
      h('input', { type: 'checkbox', checked: on ? true : null, onchange: ev => fn(ev.target.checked) }),
      h('span', { class: 'bx' }), h('span', { class: 'set-rn', text: label }));
    const chk = (obj, f, label, after) => chkv(obj[f], label, v => { obj[f] = v; if (after) after(); });
    const rg = (name, cur, opts, fn) => h('div', { class: 'set-rg' }, opts.map(o => h('label', { class: 'rd' },
      h('input', { type: 'radio', name, value: o[0], checked: cur === o[0] ? true : null, onchange: () => fn(o[0]) }),
      h('span', { class: 'bx' }), h('span', { text: o[1] }))));
    const sl = (obj, f, min, max, step, label, fmt) => {
      const out = h('output', { text: fmt(obj[f]) });
      return h('label', { class: 'set-sl' }, h('span', { class: 'set-rn', text: label }),
        h('input', { type: 'range', min, max, step, value: obj[f], oninput: ev => { obj[f] = +ev.target.value; out.textContent = fmt(obj[f]); } }), out);
    };
    const sh = txt => h('h3', { class: 'sh', text: txt });
    const list = (...items) => h('div', { class: 'set-list' }, items);
    const grid = (...items) => h('div', { class: 'set-grid2' }, items);
    const capg = (title, items) => h('div', { class: 'set-capg' }, h('span', { text: title }), h('div', { class: 'set-capr' }, items));
    const nameOf = a => t('act.' + a);

    const V = {
      abil: ['set.nav.abil', () => {
        const legacy = draft.scheme === 'legacy';
        const caps = [
          capg(t('set.grp.orbs'), [kc('common', 'orbQ', icon('quas'), t('orb.quas')), kc('common', 'orbW', icon('wex'), t('orb.wex')), kc('common', 'orbE', icon('exort'), t('orb.exort'))]),
          capg(t('spell.invoke'), [kc('common', 'invoke', icon('invoke'), t('spell.invoke'))]),
        ];
        if (!legacy) {
          caps.push(capg(t('set.grp.slots'), [kc('slots', 'slot1', null, t('set.cap.slot', { n: 1 })), kc('slots', 'slot2', null, t('set.cap.slot', { n: 2 }))]));
          caps.push(capg(t('set.grp.items'), [1, 2, 3, 4, 5, 6].map(n => kc('slots', 'item' + n, null, t('set.cap.item', { n })))));
        }
        return [
          h('div', { class: 'set-strip' }, h('div', { class: 'set-por' }, portrait('invoker')), h('div', { class: 'set-caps' }, caps)),
          h('p', { class: 'fine', text: legacy ? t('set.legacyNote') : t('set.keysHint') }),
          sh(t('set.h.cast')),
          list(chkv(draft.castMode === 'quick', t('set.quickcast'), v => { draft.castMode = v ? 'quick' : 'normal'; })),
          sh(t('set.scheme')),
          rg('scheme', draft.scheme, [['slots', t('set.slots')], ['legacy', t('set.legacy')]], v => {
            if (S.conflicts(draft, v).size) { note = t('set.conflictSwitch'); refresh(); return; }
            draft.scheme = v; note = ''; refresh();
          }),
          legacy ? [sh(t('set.group.legacy')), grid(Object.keys(draft.keys.legacy).map(a => kRow('legacy', a, nameOf(a))))] : null,
        ];
      }],
      units: ['set.nav.units', () => [
        sh(t('set.h.orders')),
        grid(kRow('common', 'center'), kRow('common', 'attack'), kRow('common', 'stop'), kRow('common', 'hold')),
        sh(t('set.h.fixed')),
        grid(fxRow(t('set.fx.move'), t('set.fx.rmb')), fxRow(t('set.fx.queue'), t('set.fx.shift'))),
      ]],
      camera: ['set.nav.camera', () => [
        sh(t('set.h.keys')),
        grid(kRow('common', 'camLock')),
        sh(t('set.h.options')),
        list(chk(draft, 'camLock', t('set.camLock')), chk(draft, 'edgeScroll', t('set.edgeScroll')), sl(draft, 'camSpeed', 0.5, 2, 0.05, t('set.camSpeed'), mult)),
      ]],
      iface: ['set.nav.iface', () => [
        grid(kRow('common', 'cheat')),
        sh(t('set.h.sandbox')),
        grid(kRow('common', 'refresh'), kRow('common', 'spawn'), kRow('common', 'resetDummies')),
        sh(t('set.h.fixed')),
        grid(fxRow(t('set.fx.pause'), t('set.fx.esc')), fxRow(t('set.fx.stats'), t('set.fx.tab'))),
      ]],
      game: ['set.nav.game', () => [
        sh(t('set.h.unitOrders')),
        list(
          row(t('set.autoAttack'), rg('autoAttack', draft.autoAttack ? 'always' : 'never', [['never', t('set.never')], ['always', t('set.always')]], v => { draft.autoAttack = v === 'always'; })),
          chk(draft, 'doubleTap', t('set.doubleTap'))),
        sh(t('set.h.options')),
        list(chk(draft, 'hints', t('set.hints'))),
      ]],
      audio: ['set.nav.audio', () => {
        const A = draft.audio;
        return [
          sh(t('set.h.volume')),
          list(sl(A, 'master', 0, 1, 0.05, t('set.master'), pct), sl(A, 'music', 0, 1, 0.05, t('set.music'), pct),
            sl(A, 'sfx', 0, 1, 0.05, t('set.sfxVol'), pct), sl(A, 'ui', 0, 1, 0.05, t('set.uiVol'), pct)),
          sh(t('set.h.options')),
          list(chk(A, 'musicOn', t('set.musicOn')), chk(A, 'muteUnfocused', t('set.muteUnfocused')), chk(draft, 'sound', t('set.soundOn'))),
        ];
      }],
      video: ['set.nav.video', () => {
        const ok = !!(IT.Input && IT.Input.toggleFullscreen);
        const fs = btn('set.fsBtn', () => { if (ok) IT.Input.toggleFullscreen(); }, 'sm');
        fs.disabled = !ok;
        return [
          sh(t('set.h.display')),
          list(chk(draft, 'bloom', t('set.bloom'), () => G.document.body.classList.toggle('nobloom', !draft.bloom)),
            row(t('set.fullscreen'), fs),
            chk(draft, 'pointerLock', t('set.pointerLock'))),
          sh(t('set.heroSkin')),
          h('div', { class: 'skin-pick' }, ['default', 'kid', 'dark'].map(k => {
            const cv = IT.Art.canvas(IT.Art.HERO_SKINS[k], 'portrait');
            const im = h('span', { class: 'skin-im' });
            if (cv) { const c = G.document.createElement('canvas'); c.width = cv.width; c.height = cv.height; c.getContext('2d').drawImage(cv, 0, 0); im.appendChild(c); }
            return h('button', { type: 'button', class: 'skin-c' + (draft.heroSkin === k ? ' on' : ''), onclick: () => { draft.heroSkin = k; refresh(); } }, im, h('span', { class: 'skin-n', text: t('skin.' + k) }));
          })),
        ];
      }],
      lang: ['set.nav.lang', () => [sh(t('set.h.lang')), list(row(t('ui.language'), langToggle()))]],
    };
    const view = V[sec] ? sec : 'abil';
    const nb = (id, label, sub) => h('button', { type: 'button', class: 'set-ni' + (sub ? ' sub' : '') + (view === id ? ' on' : ''), text: label, onclick: () => go(id) });
    const inHK = HK.some(x => x[0] === view);
    const nav = h('nav', { class: 'set-nav' },
      h('button', { type: 'button', class: 'set-ni set-nh' + (inHK ? ' grp' : ''), text: t('set.nav.hotkeys'), onclick: () => go('abil') }),
      HK.map(x => nb(x[0], t(x[1]), true)),
      NAV.map(x => nb(x[0], t(x[1]), false)));

    return h('div', { class: 'scr settings' },
      h('div', { class: 'set-top' }, h('h2', { class: 'set-title', text: t('set.title') }), btn('set.reset', resetAll, 'sm')),
      h('div', { class: 'set-wrap' }, nav,
        h('div', { class: 'set-main' }, h('h2', { class: 'set-sec', text: t(V[view][0]) }), V[view][1]())),
      h('div', { class: 'set-foot' }, msgBox, btn('ui.cancel', () => cancel()), btn('ui.done', () => save(), 'gold')));
  }

  function refresh(top) {
    if (!IT.UI.depth()) return;
    const old = G.document.querySelector('.scr.settings'), y = old ? old.scrollTop : 0;
    IT.UI.rebuild();
    const el = G.document.querySelector('.scr.settings');
    if (el) el.scrollTop = top ? 0 : y;
  }
  function go(id) { sec = id; capture = null; note = ''; refresh(true); }
  function resetAll() { const k = defaults(); k.lang = draft.lang; draft = k; capture = null; note = ''; refresh(); }
  function cancel() {
    capture = null; draft = null; note = '';
    G.document.body.classList.toggle('nobloom', !S.data.bloom);
    IT.App.settingsBack();
  }
  function save() {
    if (S.conflicts(draft).size) { refresh(); return; }
    capture = null; note = '';
    const d = draft; draft = null; d.lang = S.data.lang;
    S.replace(d);
    IT.App.settingsBack();
  }

  // key/mouse capture: window capture phase so nothing else (game, ESC handler) sees the input while binding
  G.addEventListener('keydown', ev => {
    if (!capture) return;
    swallow(ev);
    if (S.isMod(ev)) return;
    if (ev.key === 'Escape') { capture = null; note = ''; refresh(); return; }
    const k = S.keyName(ev);
    if (!k) return;
    if (k === 'Tab') { note = IT.t('set.reserved'); refresh(); return; }
    setBind(capture, k); capture = null; note = ''; refresh();
  }, true);
  // mouse 4/5 (buttons 3/4) bindable; left/right/middle keep working for the UI
  G.addEventListener('mousedown', ev => {
    if (!capture || ev.button < 3) return;
    const k = mouseName(ev);
    if (!k) return;
    swallow(ev); auxSwallow = true; setTimeout(() => { auxSwallow = false; }, 400);
    setBind(capture, k); capture = null; note = ''; refresh();
  }, true);
  // stop the browser's back/forward from firing on the same mouse buttons
  G.addEventListener('mouseup', ev => { if (auxSwallow && ev.button > 2) swallow(ev); }, true);
  G.addEventListener('auxclick', ev => { if (auxSwallow && ev.button > 2) swallow(ev); }, true);

  // language change from the panel's own toggle applies immediately and must keep the draft
  IT.UI.settingsPanel = panel;
  IT.UI.settingsCancel = cancel;
  IT.UI.settingsOpen = () => { draft = clone(S.data); capture = null; note = ''; sec = 'abil'; };
  IT.UI.settingsDraftLang = l => { if (draft) draft.lang = l; };
})(typeof window !== 'undefined' ? window : globalThis);
