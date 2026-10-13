// Dummy / enemy flair: speech bubbles over enemies. Owner: S3 (v3 wave 2), reworked in v6 item 22 (table-driven).
// attach(w, g) / detach() are wired from main.js; update(dt) is driven by IT.HUD.update every frame.
// WHAT is said lives in the editable TABLE js/data/flair.js (skin x situation x language, weights, cooldowns, icons);
// the legacy generic taunts are the 'default' skin's lines there (the old js/data/i18n/s3.js dc.* keys are kept for the tests / fallback).
// This file only decides WHEN a situation happens (sim events -> say(situation)) and WHICH line wins (pickFlair).
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};

  const CATS = ['fail', 'mana', 'cooldown', 'wrong', 'miss', 'comboFail', 'idle', 'dodge', 'hurt', 'praise'];   // legacy dc.* i18n categories
  const GAP = 4;          // default min sim-seconds between two bubbles (a skin's own `cd` in the flair table wins)
  const LIFE = 2.5;       // bubble lifetime (real seconds, unpaused)
  const FADE = 0.45;
  const IDLE_AFTER = 6;   // seconds without damage dealt while a scenario runs
  const PRAISE_P = 0.4;   // chance of a grudging compliment on comboDone
  const DODGE_P = 0.6;
  const HEAD = 40;        // px above the dummy's feet
  const XGAP = 0.9;       // v6 #63: seconds between the bubbles of a two-head exchange
  const HEAD_OFF = 9;     // v6 #63: view px the tail of a head-tagged bubble moves off the sprite centre (white head left, dark head right)
  const NEAR_DEATH = 0.2; // fraction of max HP
  const DISABLES = { stun: 1, frozen: 1, hex: 1, lift: 1 };
  const HERO_CASTS = { icewall: 1, alacrity: 1, forgespirit: 1, ghostwalk: 1 };   // hitBy:<id> fired when the hero casts it (nothing "hits" the foe)
  // per-situation chance (x the skin's `chat`) so a DoT / a chatty character does not talk over every tick
  const REACT_P = { damaged: 0.3, stunned: 0.6, nearDeath: 1, death: 0.8, playerMissed: 0.7, playerWhiffSunstrike: 0.8, heroInvisible: 0.8,
    gotJuked: 0.8, invokerEscaped: 0.8, reacquired: 0.6, dustHit: 0.9, dustMiss: 1 };   // v6 #44/#61: belief + Dust situations
  const CLS = { praise: 'praise', heroLow: 'hurt', killedHero: 'hurt', comboFail: 'comboFail' };   // css colour classes in hud.css

  const D = { w: null, g: null, off: [], bub: null, root: null, el: null, txt: null, last: {}, lastSay: -99, lastDmg: 0, hurtArm: true, idleAt: 0, ambAt: 0, now: 0, st: { last: {} }, pend: null, nd: new Set(), invAt: -99, rng: null, bubs: [], seq: null };

  // ---- seeded rng (mulberry32); tests can pass their own to pickFlair
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function rnd() { return (D.rng || (D.rng = mulberry((Date.now() ^ 0x9e3779b9) >>> 0)))(); }

  // ---- legacy text (dc.* i18n keys)
  function lines(cat) { const out = []; for (let i = 0; IT.hasT('dc.' + cat + '.' + i); i++) out.push(i); return out; }
  // pick a random line index of a category, avoiding the previous pick. rng: () => [0,1)
  function pick(cat, rng) {
    const n = lines(cat).length; if (!n) return null;
    let i = Math.floor((rng || Math.random)() * n) % n;
    if (n > 1 && i === D.last[cat]) i = (i + 1 + Math.floor((rng || Math.random)() * (n - 1))) % n;
    D.last[cat] = i;
    return IT.t('dc.' + cat + '.' + i);
  }

  // ---- flair table picker
  function skinOf(skin) { const T = IT.Flair && IT.Flair.table; return T ? (T[skin] ? skin : 'default') : null; }
  function listOf(owner, sit) { const T = IT.Flair.table, s = T[owner]; return (s && s.lines[sit]) || []; }
  // does this skin (or its fallback skin) have any line for the situation?
  function hasLines(skin, sit) {
    if (!IT.Flair) return false;
    const T = IT.Flair.table, id = skinOf(skin), s = T[id];
    if (!s || s.silent) return false;
    if (listOf(id, sit).length) return true;
    if (sit.indexOf('hitBy:') === 0 && listOf(id, 'damaged').length) return true;
    return !!(s.fallback && T[s.fallback] && listOf(s.fallback, sit).length);
  }
  // Pick a line for skin + situation. opts: { lang, rng, now, state }  -> { text, icon, skin, sit, idx, key, head, x } | null
  //  - head: 'w' | 'd' | null (v6 #63 two-head skin); x: null, or the exchange [{ head, text }, ...] (2-3 beats, x[0] is the first bubble = text)
  //  - null for a silent skin (scarecrow), or when every candidate is on cooldown
  //  - unknown skin -> 'default'; hitBy:<id> with no (or exhausted) lines falls to 'damaged'; a skin with NO lines for the situation borrows its `fallback` skin's
  //  - weights (w) bias the pick; a line cannot repeat for its `cd` (else the skin's `lineCd`) sim-seconds counted from opts.now
  function pickFlair(skin, sit, opts) {
    const F = IT.Flair; if (!F) return null;
    opts = opts || {};
    const T = F.table, id = skinOf(skin), s = T[id]; if (!s || s.silent) return null;
    const rng = opts.rng || Math.random, now = opts.now || 0, lang = opts.lang || IT.lang || 'en';
    const st = opts.state || D.st; if (!st.last) st.last = {};
    const chain = [[id, sit]];
    if (sit.indexOf('hitBy:') === 0) chain.push([id, 'damaged']);
    if (s.fallback && T[s.fallback]) { chain.push([s.fallback, sit]); if (sit.indexOf('hitBy:') === 0) chain.push([s.fallback, 'damaged']); }
    for (let c = 0; c < chain.length; c++) {
      const owner = chain[c][0], name = chain[c][1], list = listOf(owner, name);
      if (!list.length) continue;
      const cands = []; let tot = 0;
      for (let i = 0; i < list.length; i++) {
        const ln = list[i], key = owner + '|' + name + '|' + i, cd = ln.cd != null ? ln.cd : T[owner].lineCd;
        if (st.last[key] != null && now - st.last[key] < cd) continue;
        cands.push({ i, ln, key }); tot += ln.w;
      }
      if (!cands.length) { if (c === 0 || owner === id) { if (sit.indexOf('hitBy:') === 0) continue; return null; } continue; }   // exhausted: silence (hitBy -> try damaged)
      let r = rng() * tot, k = cands[cands.length - 1];
      for (let i = 0; i < cands.length; i++) { r -= cands[i].ln.w; if (r < 0) { k = cands[i]; break; } }
      st.last[k.key] = now;
      const L = x => x.t[lang] || x.t.en || '';
      return { text: L(k.ln), icon: k.ln.icon || null, skin: owner, sit: name, idx: k.i, key: k.key, head: k.ln.head || null, x: k.ln.x ? k.ln.x.map(function (b) { return { head: b.head, text: L(b) }; }) : null };
    }
    return null;
  }

  // ---- pixel icons (inline SVG built from these grids; no css / assets needed)
  const PAL = { g: '#c9c4d6', W: '#f3e6d6', D: '#5a3a2a', e: '#1a1220', k: '#2a2238', w: '#ffffff', y: '#ffd24a', r: '#e5484d', b: '#8a5a32', t: '#e0b684', G: '#4aa86a', p: '#ee6f86', o: '#f29a3a' };
  const ICONS = {
    muted: ['...ggg...', '..ggggg..', '..ggggg..', '..ggggg..', 'g.ggggg.g', 'g.ggggg.g', '.g.ggg.g.', '..ggggg..', '....g....', '...ggg...', '.........'],
    camera: ['..ggg.....', 'gggggggggg', 'ggg.kk.ggg', 'gg.kwwk.gg', 'gg.kwwk.gg', 'ggg.kk.ggg', 'gggggggggg'],
    monkey: ['..bbbbb..', '.bbbbbbb.', 'bbtttttbb', 'btktttktb', 'bbtttttbb', '.btttttb.', '.bttrrtb.', '..bbbbb..'],
    star: ['....y....', '....y....', '...yyy...', 'yyyyyyyyy', '.yyyyyyy.', '..yyyyy..', '..yyyyy..', '.yyy.yyy.', '.yy...yy.'],
    goiaba: ['....GG..', '...GG...', '..pppp..', '.pppppp.', '.ppwppp.', '.pppppp.', '.pppppp.', '..pppp..'],
    // v6 #63: the tag of the speaking head of the Vitinian (white head = Vitinho, dark head = Ianzinho)
    headw: ['..kkkkk..', '.kWWWWWk.', 'kWWWWWWWk', 'kWeWWWeWk', 'kWWWWWWWk', 'kWWWWWWWk', 'kWWeeeWWk', '.kWWWWWk.', '..kkkkk..'],
    headd: ['..kkkkk..', '.kDDDDDk.', 'kDDDDDDDk', 'kDwDDDwDk', 'kDDDDDDDk', 'kDDDDDDDk', 'kDDwwwDDk', '.kDDDDDk.', '..kkkkk..'],
  };
  // slash over the mic
  (function () { const g = ICONS.muted.map(r => r.split('')); [[0, 0], [1, 1], [2, 2], [3, 2], [4, 3], [5, 4], [6, 5], [7, 6], [8, 6], [9, 7], [10, 8]].forEach(p => { g[p[0]][p[1]] = 'r'; }); ICONS.muted = g.map(r => r.join('')); })();
  function iconEl(name, doc) {
    const grid = ICONS[name]; doc = doc || (typeof document !== 'undefined' ? document : null); if (!grid || !doc) return null;
    const NS = 'http://www.w3.org/2000/svg', h = grid.length, w = grid[0].length;
    const svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h); svg.setAttribute('shape-rendering', 'crispEdges'); svg.setAttribute('class', 'dc-ic dc-ic-' + name);
    svg.style.cssText = 'height:1.15em;width:' + (1.15 * w / h).toFixed(2) + 'em;vertical-align:-.2em;margin-right:.4em;display:inline-block;image-rendering:pixelated';
    grid.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = PAL[row[x]]; if (!c) continue; const r = doc.createElementNS(NS, 'rect'); r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', 1); r.setAttribute('height', 1); r.setAttribute('fill', c); svg.appendChild(r); } });
    return svg;
  }

  // ---- state helpers
  function enabled() { const S = IT.Settings && IT.Settings.get && IT.Settings.get(); return !S || S.dummyChat !== false; }
  function run() { return D.g && D.g.run || null; }
  function blocked() {
    const g = D.g, w = D.w, r = run();
    if (!g || !w || g.menu || g.ended) return true;
    if (r && r.phase === 'countdown') return true;
    if (w.paused && !(r && r.phase === 'result')) return true;
    return false;
  }
  // actions the current scenario / combo wants (spell + item ids), null when nothing is running
  function needed(w) {
    const set = new Set();
    const pr = w.ranked && w.ranked.pr;
    if (pr && pr.sc && pr.sc.sol) for (const s of pr.sc.sol) if (s.a) set.add(s.a);
    const def = w.combo && w.combo.def;
    if (def) for (const s of def.steps) if (s.ability) set.add(s.ability);
    return set.size ? set : null;
  }
  function scenarioPlaying(w) {
    const r = run(), pr = w.ranked && w.ranked.pr;
    if (r && pr && r.phase === 'play') return !(pr.sc.obj && pr.sc.obj.type === 'escape');
    const c = w.combo; return !!(c && c.def && c.phase === 'active');
  }

  // can this unit talk? enemies always (the flair table decides per skin); a buyable dummy skin (raven) only if its skin has a non-silent table entry
  function talker(d) {
    if (!d) return false;
    if (d.kind === 'enemy') return true;
    const T = IT.Flair && IT.Flair.table;
    return d.kind === 'dummy' && !!d.skin && !!T && !!T[d.skin] && !T[d.skin].silent;
  }
  const skinName = d => (d && d.skin) || 'default';

  // nearest on-screen visible talker to the hero (pref first when usable; o.dead lets a dead pref speak: its own death line)
  function speaker(pref, dead) {
    const w = D.w, cam = D.g.cam, hero = D.g.hero, P = IT.GAME.UNIT_PX, VW = IT.GAME.VIEW_W, VH = IT.GAME.VIEW_H;
    const ok = d => {
      if (!talker(d)) return false;
      const sx = d.x / P - cam.px, sy = d.y / P - cam.py;
      return sx > 6 && sx < VW - 6 && sy > 14 && sy < VH - 4;
    };
    if (pref && ok(pref) && (dead ? pref.dead : (!pref.dead && pref.visible))) return pref;
    let best = null, bd = Infinity;
    for (const d of w.ents) {
      if (d.dead || !talker(d) || !d.visible || !ok(d)) continue;
      const k = Math.hypot(d.x - hero.x, d.y - hero.y);
      if (k < bd) { bd = k; best = d; }
    }
    return best;
  }

  // ---- DOM
  function ensureEl() {
    const hud = document.getElementById('hud'); if (!hud) return null;
    if (!D.root || !hud.contains(D.root)) {
      D.root = document.createElement('div'); D.root.className = 'dchat-root'; hud.appendChild(D.root);
      D.bub = null;
    }
    return D.root;
  }
  function clearBubble() { D.seq = null; D.bubs.forEach(b => b.el.remove()); D.bubs = []; D.bub = null; }
  function dropBubble(b) { b.el.remove(); D.bubs = D.bubs.filter(x => x !== b); D.bub = D.bubs.length ? D.bubs[D.bubs.length - 1] : null; }
  // one bubble (a single line, or one beat of an exchange): head = 'w' | 'd' | null
  function mkBubble(who, skin, sit, text, icon, head, life) {
    const root = ensureEl(); if (!root) return null;
    const el = document.createElement('div');
    el.className = 'dchat dc-' + (CLS[sit] || sit.replace(/[^\w-]/g, '_')) + (text ? '' : ' dc-icononly') + ' dc-skin-' + skin + (head ? ' dc-head-' + head : '');
    const hd = head && iconEl('head' + head, document);
    if (hd) { hd.setAttribute('class', hd.getAttribute('class') + ' dc-hd'); hd.setAttribute('aria-label', IT.t('dc.head.' + head)); el.appendChild(hd); }
    const ic = icon && iconEl(icon, document);
    if (ic) { ic.setAttribute('aria-label', IT.t('dc.icon.' + icon)); if (!text) ic.style.cssText += ';height:1.6em;width:' + (1.6 * (ICONS[icon][0].length / ICONS[icon].length)).toFixed(2) + 'em;margin:0'; el.appendChild(ic); }
    if (text) el.appendChild(document.createTextNode(text));
    root.appendChild(el);
    const b = { el, who, age: 0, life: life || LIFE, head: head || null };
    D.bubs.push(b); D.bub = b;
    return b;
  }

  // say(situation, o): o = { pref (speaker unit), dead (pref is a corpse), p (extra chance 0..1), amb (ambient: chat x0.35), alt (situation to use when the speaker's skin has none), fallback (unit) }
  // -> 'ok' spoke | 'dice' the chance roll failed (counts as handled) | false could not speak (blocked / cooldown / no line / no speaker)
  function say(sit, o) {
    o = o || {};
    const w = D.w; if (!w || !D.g || !enabled() || blocked()) return false;
    if (D.bub) return false;
    const who = speaker(o.pref, o.dead) || (o.fallback && talker(o.fallback) ? o.fallback : null);   // praise: the foe that just died
    if (!who) return false;
    const skin = skinOf(skinName(who)); if (!skin) return false;
    const T = IT.Flair.table[skin];
    if (T.silent) return false;
    const gap = sit === 'praise' ? Math.min(1.5, T.cd) : (T.cd != null ? T.cd : GAP);
    if (w.t - D.lastSay < gap) return false;
    if (o.alt && !hasLines(skin, sit)) sit = o.alt;
    if (!hasLines(skin, sit)) return false;
    const base = sit.indexOf('hitBy:') === 0 ? REACT_P.stunned : REACT_P[sit];
    const prob = (o.p == null ? 1 : o.p) * (base == null ? 1 : base) * (o.amb ? T.chat * 0.35 : T.chat);
    if (prob < 1 && rnd() > prob) return 'dice';
    const f = pickFlair(skin, sit, { rng: rnd, now: w.t, state: D.st }); if (!f) return false;
    if (!ensureEl()) return false;
    // v6 #63: a two-head exchange: beat 0 now, the rest queued ~XGAP apart (all of them leave together, LIFE after the last one)
    const n = f.x ? f.x.length : 1;
    if (!mkBubble(who, skin, sit, f.text, f.icon, f.head, LIFE + (n - 1) * XGAP)) return false;
    if (n > 1) D.seq = { who, skin, sit, beats: f.x, i: 1, t: 0 };
    D.lastSay = w.t;
    place();
    return 'ok';
  }

  // anchored right above the speaker's head: percent of the live internal view (VIEW_W/H change with the scroll zoom, so no --u units);
  // the bubble is kept inside the viewport and the tail slides sideways to keep pointing at the unit
  function place() {
    if (!D.bubs.length) return;
    const GM = IT.GAME, P = GM.UNIT_PX, cam = D.g.cam, root = D.root;
    const rw = (root && root.clientWidth) || 1, rh = (root && root.clientHeight) || 1, M = 6;
    let lift = 0;   // an exchange stacks upward: the newest bubble sits on the unit, the older ones above it (read top to bottom)
    for (let i = D.bubs.length - 1; i >= 0; i--) {
      const b = D.bubs[i], e = b.who, el = b.el;
      const ux = e.x / P - cam.px, uy = e.y / P - cam.py - HEAD - (e.z || 0) / P;   // unit head, view px
      const bw = el.offsetWidth || 0, bh = el.offsetHeight || 0;
      const side = b.head === 'w' ? -1 : b.head === 'd' ? 1 : 0;   // white head speaks from the left of the sprite, dark head from the right
      const px = (ux + side * HEAD_OFF) / GM.VIEW_W * rw, py = uy / GM.VIEW_H * rh - lift;   // tail target in root px
      const cx = px + side * Math.min(bw * 0.28, rw * 0.06);   // bubble centre, nudged off the sprite to its side
      const ax = Math.max(bw / 2 + M, Math.min(rw - bw / 2 - M, cx)), ay = Math.max(bh + M + 8, Math.min(rh - M, py));
      el.style.left = (ax / rw * 100).toFixed(2) + '%'; el.style.top = (ay / rh * 100).toFixed(2) + '%';
      const tx = Math.max(12, Math.min(bw - 12, bw / 2 + (px - ax)));
      el.style.setProperty('--tx', (bw ? tx : 0) + 'px');
      el.classList.toggle('below', py < bh + M + 8);   // head too close to the top edge: the clamped bubble overlaps the unit, hide the tail
      lift += bh + 6;
    }
  }

  function update(dt) {
    const w = D.w; if (!w || !D.g) return;
    ensureEl();
    const bl = blocked();
    if (D.bubs.length) {
      if (bl || !enabled() || !(D.bub.who.visible || D.bub.who.dead)) clearBubble();
      else {
        const d = dt || 0;
        if (D.seq) {   // next beat of the exchange
          const q = D.seq; q.t += d;
          while (D.seq && q.i < q.beats.length && q.t >= q.i * XGAP) {
            const bt = q.beats[q.i++];
            mkBubble(q.who, q.skin, q.sit, bt.text, null, bt.head, LIFE + (q.beats.length - q.i) * XGAP);
            if (q.i >= q.beats.length) D.seq = null;
          }
        }
        D.bubs.slice().forEach(b => { b.age += d; if (b.age >= b.life) dropBubble(b); else b.el.classList.toggle('out', b.age > b.life - FADE); });
        place();
      }
    }
    if (bl || !enabled()) { D.idleAt = Math.max(D.idleAt, w.t); if (D.ambAt) D.ambAt = Math.max(D.ambAt, w.t + 8); return; }
    // delayed one-shots (spawn / night / caught / escaped): wait a beat so the phase has flipped, drop them if they went stale
    const pe = D.pend;
    if (pe && w.t >= pe.at) {
      D.pend = null;
      if (w.t - pe.at < 3) { if (pe.clear) { clearBubble(); D.lastSay = -99; } say(pe.sit, pe.o); }
    }
    // long idle: no damage dealt for a while during a scenario
    if (scenarioPlaying(w)) {
      const since = w.t - Math.max(D.lastDmg, D.idleAt);
      if (since > IDLE_AFTER && say('idleLong')) D.idleAt = w.t;
      if (D.ambAt && w.t >= D.ambAt) { say('idle', { amb: true }); D.ambAt = w.t + 16 + rnd() * 20; }
    } else D.idleAt = w.t;
    // low HP (edge triggered with hysteresis)
    const h = D.g.hero;
    if (h && h.maxHp) {
      const f = h.hp / h.maxHp;
      if (f > 0.5) D.hurtArm = true;
      else if (f < 0.25 && D.hurtArm && say('heroLow')) D.hurtArm = false;
    }
  }

  // ---- events
  const FAIL_SIT = { mana: 'playerNoMana', cooldown: 'playerCooldown', invokeCooldown: 'playerCooldown' };
  const FAIL_SKIP = { gone: 1, unknown: 1, immune: 1 };

  function attach(w, g) {
    detach();
    D.w = w; D.g = g; D.last = {}; D.lastSay = -99; D.lastDmg = w.t; D.idleAt = w.t; D.ambAt = 0; D.hurtArm = true; D.st = { last: {} }; D.pend = null; D.nd = new Set(); D.invAt = -99;
    const on = (n, f) => D.off.push(w.on(n, f)), hid = () => g.hero && g.hero.id;
    const mine = id => id === hid() || (w.get(id) && w.get(id).team === 0 && w.get(id).kind !== 'enemy');   // hero + its spirits / summons
    const foe = id => { const u = w.get(id); return u && u.team === 1 && talker(u) ? u : null; };
    // a foe got hurt / hit: hitBy:<ability> when the skin has it, else 'damaged'
    const react = (u, ability) => { if (u && !u.dead) say(ability && ability !== 'attack' ? 'hitBy:' + ability : 'damaged', { pref: u, alt: 'damaged' }); };
    on('fail', p => {
      if (p.unit !== hid() || FAIL_SKIP[p.reason]) return;
      if (p.reason === 'orbNotLearned' || p.reason === 'locked' || p.reason === 'noItem') return;
      say(FAIL_SIT[p.reason] || 'playerFail');
    });
    const wrong = spell => { const n = needed(w); if (n && !n.has(spell) && (!run() || run().phase === 'play')) say('playerWrong'); };
    on('invoke', p => { if (p.unit === hid() && p.spell) wrong(p.spell); });
    on('cast', p => {
      if (p.unit !== hid() || !p.ability) return;
      if (IT.GAME.SPELL_ORBS[p.ability]) wrong(p.ability);
      if (HERO_CASTS[p.ability]) {
        if (p.ability === 'ghostwalk') { D.invAt = w.t; say(rnd() < 0.5 ? 'heroInvisible' : 'hitBy:ghostwalk', { alt: 'heroInvisible' }); }
        else say('hitBy:' + p.ability, { p: 0.6 });
      }
    });
    on('miss', p => {
      if (p.src !== hid() || p.ability === 'attack') return;
      say(p.ability === 'sunstrike' ? 'playerWhiffSunstrike' : 'playerMissed', { alt: 'playerMissed' });
    });
    on('comboFail', () => say('comboFail'));
    on('comboDone', () => {
      const dead = D.lastKilled && w.byId.get(D.lastKilled);
      say('praise', { p: PRAISE_P, fallback: dead });
    });
    on('kill', p => {
      D.lastKilled = p.unit;
      const u = foe(p.unit); if (u) say('death', { pref: u, dead: true });
    });
    on('telegraph', p => {   // v6: enemy Dust shout / item line (pit juke)
      const u = (p.item === 'dust' || p.say) && w.get(p.unit);
      if (u && u.visible) { clearBubble(); D.lastSay = -99; say(p.say === 'juke' ? 'pitJuke' : 'dustUsed', { pref: u }); }
    });
    on('fx', p => { if (p.name === 'dodge' && p.unit != null) say('dodge', { pref: w.get(p.unit), p: DODGE_P }); });
    on('heroDown', p => { if (p.unit === hid()) say('killedHero', { alt: 'heroLow' }); });
    on('hit', p => {
      if (p.ability === 'stunbolt' && p.target === hid()) { say('heroLow', { p: 0.5 }); return; }
      if (mine(p.src) && p.ability !== 'attack') {
        const u = foe(p.target); if (!u) return;
        // a Dust cloud landed on the foe (revealed): half 'dustHit', half the item-hit bubble 'hitBy:dust' (each falls to the other, then to 'damaged')
        if (p.ability === 'dust') { if (!u.dead) say(rnd() < 0.5 ? 'dustHit' : 'hitBy:dust', { pref: u, alt: hasLines(skinOf(skinName(u)), 'dustHit') ? 'dustHit' : 'damaged' }); }
        else react(u, p.ability);
      }
    });
    // belief (js/sim/belief.js): a chaser walked to the predicted spot and found nothing ('juked'), saw the hero again ('seen' + reacquired), or lost an invisible hero
    on('belief', p => {
      const u = foe(p.unit); if (!u || u.dead) return;
      if (p.state === 'juked') { if (!p.dust) say('gotJuked', { pref: u }); }   // a Dust that found nothing has its own line (dustResult below)
      else if (p.state === 'seen' && p.reacquired) say('reacquired', { pref: u });
      else if (p.state === 'lost' && p.from === 'seen' && IT.Status && IT.Status.hidden(g.hero)) say('invokerEscaped', { pref: u });
    });
    // the foe's own Dust found nobody inside the cloud
    on('dustResult', p => {
      if (p.hit) return;
      const u = foe(p.unit); if (!u || u.dead || !u.visible) return;
      clearBubble(); D.lastSay = -99; say('dustMiss', { pref: u });
    });
    on('status', p => {
      const u = w.get(p.target); if (!u) return;
      if (DISABLES[p.status] && foe(p.target) && mine(p.src)) say('stunned', { pref: u });
      else if ((p.status === 'invisible' || p.status === 'ghost') && p.target === hid() && w.t - D.invAt > 0.5) say('heroInvisible');
    });
    on('timeOfDay', p => { if (p && p.night) D.pend = { at: w.t + 0.6, sit: 'night', o: {} }; });
    on('damage', p => {
      if (!(p.dealt > 0) || p.target === hid()) return;
      const t = w.get(p.target); if (!t || t.team !== 1) return;
      D.lastDmg = w.t;
      const u = foe(p.target); if (!u || !mine(p.src) || p.ability === 'dust') return;   // Dust: the 'hit' event above speaks
      if (u.maxHp && u.hp / u.maxHp < NEAR_DEATH && u.hp > 0 && !D.nd.has(u.id)) { D.nd.add(u.id); if (say('nearDeath', { pref: u })) return; }
      react(u, p.ability);
    });
    on('scnStart', () => { D.lastDmg = w.t; D.idleAt = w.t; D.lastKilled = null; D.nd = new Set(); D.pend = null; D.ambAt = 0; clearBubble(); });
    on('scnGo', () => {
      D.lastDmg = w.t; D.idleAt = w.t; D.ambAt = w.t + 10 + rnd() * 10;
      D.pend = { at: w.t + 0.5, sit: w.tod && w.tod.night && rnd() < 0.5 ? 'night' : 'spawn', o: {} };
    });
    on('scnResult', p => {
      if (!p || p.ok) return;
      if (p.reason === 'caught' || p.reason === 'escaped') D.pend = { at: w.t + 0.25, sit: p.reason, o: {}, clear: true };
    });
  }

  function detach() {
    for (const f of D.off) { try { f(); } catch (e) { /* ignore */ } }
    D.off = []; clearBubble();
    if (D.root && D.root.remove) D.root.remove();
    D.root = null; D.w = null; D.g = null; D.lastKilled = null; D.pend = null;
  }

  IT.DummyChat = { attach, bubbles: () => D.bubs, detach, update, CATS, lines, pick, needed, pickFlair, hasLines, iconEl, ICONS, seed: n => { D.rng = mulberry(n >>> 0); } };
})(typeof window !== 'undefined' ? window : globalThis);
