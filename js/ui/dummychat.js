// Dummy taunts: speech bubbles over dummies when the player fumbles / is slow. Owner: S3 (v3 wave 2).
// attach(w, g) / detach() are wired from main.js; update(dt) is driven by IT.HUD.update every frame.
// Lines live in js/data/i18n/s3.js as dc.<category>.<n>.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};

  const CATS = ['fail', 'mana', 'cooldown', 'wrong', 'miss', 'comboFail', 'idle', 'dodge', 'hurt', 'praise'];
  const GAP = 4;          // min sim-seconds between two bubbles
  const LIFE = 2.5;       // bubble lifetime (real seconds, unpaused)
  const FADE = 0.45;
  const IDLE_AFTER = 6;   // seconds without damage dealt while a scenario runs
  const PRAISE_P = 0.4;   // chance of a grudging compliment on comboDone
  const DODGE_P = 0.6;
  const HEAD = 40;        // px above the dummy's feet

  const D = { w: null, g: null, off: [], bub: null, root: null, el: null, txt: null, last: {}, lastSay: -99, lastDmg: 0, hurtArm: true, idleAt: 0, now: 0 };

  // ---- text
  function lines(cat) { const out = []; for (let i = 0; IT.hasT('dc.' + cat + '.' + i); i++) out.push(i); return out; }
  // pick a random line index of a category, avoiding the previous pick. rng: () => [0,1)
  function pick(cat, rng) {
    const n = lines(cat).length; if (!n) return null;
    let i = Math.floor((rng || Math.random)() * n) % n;
    if (n > 1 && i === D.last[cat]) i = (i + 1 + Math.floor((rng || Math.random)() * (n - 1))) % n;
    D.last[cat] = i;
    return IT.t('dc.' + cat + '.' + i);
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

  // nearest on-screen visible dummy to the hero (pref first when usable)
  function speaker(pref) {
    const w = D.w, cam = D.g.cam, hero = D.g.hero, P = IT.GAME.UNIT_PX, VW = IT.GAME.VIEW_W, VH = IT.GAME.VIEW_H;
    const ok = d => {
      if (!d || d.kind !== 'enemy') return false;
      const sx = d.x / P - cam.px, sy = d.y / P - cam.py;
      return sx > 6 && sx < VW - 6 && sy > 14 && sy < VH - 4;
    };
    if (pref && ok(pref) && !pref.dead && pref.visible) return pref;
    let best = null, bd = Infinity;
    for (const d of w.ents) {
      if (d.dead || d.kind !== 'enemy' || !d.visible || !ok(d)) continue;
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
  function clearBubble() { if (D.bub) { D.bub.el.remove(); D.bub = null; } }

  function say(cat, o) {
    o = o || {};
    const w = D.w; if (!w || !D.g || !enabled() || blocked()) return false;
    if (D.bub) return false;
    const gap = cat === 'praise' ? 1.5 : GAP;
    if (w.t - D.lastSay < gap) return false;
    if (o.p != null && Math.random() > o.p) return false;
    const who = speaker(o.pref) || (o.fallback && o.fallback.kind === 'enemy' ? o.fallback : null);   // praise: the foe that just died
    if (!who) return false;
    const txt = pick(cat); if (!txt) return false;
    const root = ensureEl(); if (!root) return false;
    const el = document.createElement('div');
    el.className = 'dchat dc-' + cat; el.textContent = txt;
    root.appendChild(el);
    D.bub = { el, who, age: 0 };
    D.lastSay = w.t;
    place();
    return true;
  }

  // anchored right above the speaker's head: percent of the live internal view (VIEW_W/H change with the scroll zoom, so no --u units);
  // the bubble is kept inside the viewport and the tail slides sideways to keep pointing at the unit
  function place() {
    const b = D.bub; if (!b) return;
    const GM = IT.GAME, P = GM.UNIT_PX, cam = D.g.cam, e = b.who, el = b.el, root = D.root;
    const ux = e.x / P - cam.px, uy = e.y / P - cam.py - HEAD - (e.z || 0) / P;   // unit head, view px
    const rw = (root && root.clientWidth) || 1, rh = (root && root.clientHeight) || 1;
    const bw = el.offsetWidth || 0, bh = el.offsetHeight || 0, M = 6;
    let px = ux / GM.VIEW_W * rw, py = uy / GM.VIEW_H * rh;   // head in root px
    const ax = Math.max(bw / 2 + M, Math.min(rw - bw / 2 - M, px)), ay = Math.max(bh + M + 8, Math.min(rh - M, py));
    el.style.left = (ax / rw * 100).toFixed(2) + '%'; el.style.top = (ay / rh * 100).toFixed(2) + '%';
    const tx = Math.max(12, Math.min(bw - 12, bw / 2 + (px - ax)));
    el.style.setProperty('--tx', (bw ? tx : 0) + 'px');
    el.classList.toggle('below', py < bh + M + 8);   // head too close to the top edge: the clamped bubble overlaps the unit, hide the tail
  }

  function update(dt) {
    const w = D.w; if (!w || !D.g) return;
    ensureEl();
    const bl = blocked();
    if (D.bub) {
      if (bl || !enabled() || !(D.bub.who.visible || D.bub.who.dead)) clearBubble();
      else {
        D.bub.age += dt || 0;
        if (D.bub.age >= LIFE) clearBubble();
        else { place(); D.bub.el.classList.toggle('out', D.bub.age > LIFE - FADE); }
      }
    }
    if (bl || !enabled()) { D.idleAt = Math.max(D.idleAt, w.t); return; }
    // long idle: no damage dealt for a while during a scenario
    if (scenarioPlaying(w)) {
      const since = w.t - Math.max(D.lastDmg, D.idleAt);
      if (since > IDLE_AFTER && say('idle')) D.idleAt = w.t;
    } else D.idleAt = w.t;
    // low HP (edge triggered with hysteresis)
    const h = D.g.hero;
    if (h && h.maxHp) {
      const f = h.hp / h.maxHp;
      if (f > 0.5) D.hurtArm = true;
      else if (f < 0.25 && D.hurtArm && say('hurt')) D.hurtArm = false;
    }
  }

  // ---- events
  const FAIL_CAT = { mana: 'mana', cooldown: 'cooldown', invokeCooldown: 'cooldown' };
  const FAIL_SKIP = { gone: 1, unknown: 1, immune: 1 };

  function attach(w, g) {
    detach();
    D.w = w; D.g = g; D.last = {}; D.lastSay = -99; D.lastDmg = w.t; D.idleAt = w.t; D.hurtArm = true;
    const on = (n, f) => D.off.push(w.on(n, f)), hid = () => g.hero && g.hero.id;
    on('fail', p => {
      if (p.unit !== hid() || FAIL_SKIP[p.reason]) return;
      if (p.reason === 'orbNotLearned' || p.reason === 'locked' || p.reason === 'noItem') return;
      say(FAIL_CAT[p.reason] || 'fail');
    });
    const wrong = spell => { const n = needed(w); if (n && !n.has(spell) && (!run() || run().phase === 'play')) say('wrong'); };
    on('invoke', p => { if (p.unit === hid() && p.spell) wrong(p.spell); });
    on('cast', p => { if (p.unit === hid() && p.ability && IT.GAME.SPELL_ORBS[p.ability]) wrong(p.ability); });
    on('miss', p => { if (p.src === hid() && p.ability !== 'attack') say('miss'); });
    on('comboFail', () => say('comboFail'));
    on('comboDone', () => {
      const dead = D.lastKilled && w.byId.get(D.lastKilled);
      say('praise', { p: PRAISE_P, fallback: dead });
    });
    on('kill', p => { D.lastKilled = p.unit; });
    on('telegraph', p => { const u = (p.item === 'dust' || p.say) && w.get(p.unit); if (u && u.visible) { clearBubble(); D.lastSay = -99; say(p.say || 'dust', { pref: u }); } });   // v6: enemy Dust shout / item line (pit juke)
    on('fx', p => { if (p.name === 'dodge' && p.unit != null) say('dodge', { pref: w.get(p.unit), p: DODGE_P }); });
    on('heroDown', p => { if (p.unit === hid()) say('hurt'); });
    on('hit', p => { if (p.ability === 'stunbolt' && p.target === hid()) say('hurt', { p: 0.5 }); });
    on('damage', p => {
      if (p.dealt > 0 && p.target !== hid()) { const t = w.get(p.target); if (t && t.team === 1) D.lastDmg = w.t; }
    });
    on('scnStart', () => { D.lastDmg = w.t; D.idleAt = w.t; D.lastKilled = null; clearBubble(); });
    on('scnGo', () => { D.lastDmg = w.t; D.idleAt = w.t; });
  }

  function detach() {
    for (const f of D.off) { try { f(); } catch (e) { /* ignore */ } }
    D.off = []; clearBubble();
    if (D.root && D.root.remove) D.root.remove();
    D.root = null; D.w = null; D.g = null; D.lastKilled = null;
  }

  IT.DummyChat = { attach, detach, update, CATS, lines, pick, needed };
})(typeof window !== 'undefined' ? window : globalThis);
