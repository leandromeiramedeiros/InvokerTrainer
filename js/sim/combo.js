// Combo engine: prompts, step matching from sim events, scoring, practice/timed modes. Pure. See DECISIONS.md "Combos / stats".
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const KEY = { Q: 'quas', W: 'wex', E: 'exort' };
  const RESOLVE_TIMEOUT = 6;     // s a mustHitDummy cast may stay unresolved
  const FAIL_DELAY = 1.0;        // s the fail banner stays before the retry starts
  const DONE_DELAY = 0.8;        // s the done banner stays before the next prompt
  const PULL_MIN = 150;          // units the dummy must be dragged for react:'empPull'
  const HIST_MAX = 60;
  const EPS = 1e-9;

  const all = () => IT.COMBOS || [];
  const get = id => all().find(c => c.id === id) || null;
  const hasS = (e, t) => IT.Status.has(e, t);

  // ------------------------------------------------------------ timing model
  // Spell/item timings straight from the baked KV under the player's orb levels (lift_duration scales with Quas...).
  // Combo data is lazy about it: step.at(T, env) / combo.tip(T) are called with this object, never with constants.
  const TOL = { basic: 1.6, intermediate: 1.3, advanced: 1.0, items: 1.15 };   // window slack multiplier: easy tiers forgive more
  const BLAST_CAST = 0.05;
  function timing(ctx) {
    const V = IT.Values, S = V.SPELL_IDS;
    ctx = ctx || V.ctx(IT.Loadout.default());
    const g = (a, k) => V.get(S[a], k, ctx), it = (id, k) => V.item(IT.GAME.ITEM_DOTA[id], k, 1);
    return {
      lift: g('tornado', 'lift_duration'), tornadoSpeed: g('tornado', 'travel_speed') || 1000,
      emp: g('emp', 'delay'), ss: g('sunstrike', 'delay'), meteor: g('chaosmeteor', 'land_time'),
      blastSpeed: g('deafeningblast', 'travel_speed') || 1100, blastCast: BLAST_CAST,
      csDur: g('coldsnap', 'duration'), csFreeze: g('coldsnap', 'freeze_duration'),
      iceSlow: g('icewall', 'slow_duration'), alacrity: g('alacrity', 'duration'),
      atos: it('atos', 'duration'), vyse: it('vyse', 'sheep_duration'), gleipnir: it('gleipnir', 'duration'),
      orchid: it('orchid', 'silence_duration'), hammerStun: it('meteorhammer', 'stun_duration'), hammerChannel: it('meteorhammer', 'max_duration'),
    };
  }
  const sec = x => Math.max(0.1, Math.round(x * 10) / 10);   // seconds for the early/late feedback (never shows 0.0)
  const ctxOf = w => (w && w.hero && w.hero.ctx) || (w && w.ctx) || null;
  const tipOf = (def, T) => (def.tipFn ? def.tipFn(T) : def.tip) || { en: '', pt: '' };
  // tip text in `lang` with the numbers of `ctx` (a Values ctx; none = default build)
  function tipText(def, ctx, lang) {
    if (!def) return '';
    const t = tipOf(def, timing(ctx));
    return t[lang] || t.en || '';
  }
  // window of step i of combo c: { ref, wait, lo, hi } (seconds after the effect of step `ref`), or null for steps without `at`.
  // at(T, env) -> { ref?, fx?, wait, early?, late? } (fx: measure from the ref's effect/hit, not its cast); slack is scaled by the tier. wait may be negative (cast before the ref lands).
  function windowOf(c, i, T, env) {
    const s = c.steps[i];
    if (!s || typeof s.at !== 'function') return null;
    const r = s.at(T, env || {}), k = TOL[c.tier] || 1;
    return { ref: r.ref != null ? r.ref : i - 1, fx: !!r.fx, wait: r.wait, lo: r.wait - (r.early || 0) * k, hi: r.wait + (r.late == null ? 0.6 : r.late) * k };
  }
  const withinOf = (s, T) => (typeof s.within === 'function' ? s.within(T) : s.within);
  // suggested wait before step i (tip/bot): `at` wait, else the static wait
  function waitOf(c, i, T, env) {
    const win = windowOf(c, i, T, env);
    return win ? win.wait : c.steps[i].wait;
  }

  // ------------------------------------------------------------ requirements
  // Effective orb minimums = explicit requires.orbs, raised by the recipe of every spell the combo casts.
  function orbNeeds(c) {
    const need = { quas: 0, wex: 0, exort: 0 }, r = (c.requires && c.requires.orbs) || {};
    for (const k in need) need[k] = r[k] | 0;
    for (const s of c.steps) {
      if (s.type !== 'cast' && s.type !== 'item') continue;
      const rec = IT.GAME.SPELL_ORBS[s.ability];
      if (rec) for (const ch of rec) need[KEY[ch]] = Math.max(need[KEY[ch]], 1);
    }
    return need;
  }
  function itemNeeds(c) {
    const set = new Set((c.requires && c.requires.items) || []);
    for (const s of c.steps) if (s.type === 'item' || (s.type === 'cast' && IT.GAME.ITEM_DOTA[s.ability])) set.add(s.ability);
    return Array.from(set);
  }
  // what `loadout` lacks for `c`: { orbs:[keys], items:[ids], scepter, shard }
  function missing(loadout, c) {
    const lo = IT.Loadout.normalize(loadout), ctx = IT.Values.ctx(lo), need = orbNeeds(c), req = c.requires || {};
    const m = { orbs: [], items: [], scepter: false, shard: false };
    for (const k in need) if (ctx.eff[k] < need[k]) m.orbs.push(k);
    for (const id of itemNeeds(c)) if (!lo.items.includes(id)) m.items.push(id);
    if (req.scepter && !lo.scepter) m.scepter = true;
    if (req.shard && !lo.shard) m.shard = true;
    return m;
  }
  // combos playable with `loadout`. grantMissing: items / scepter / shard are granted at start, so only orbs filter.
  function available(loadout, opts) {
    const grant = !!(opts && opts.grantMissing);
    return all().filter(c => {
      const m = missing(loadout, c);
      return !m.orbs.length && (grant || (!m.items.length && !m.scepter && !m.shard));
    });
  }

  // ------------------------------------------------------------ scoring
  function speedBonus(tier, par, time) {
    const base = (IT.COMBOS.TIER_BASE || {})[tier] || 0;
    if (!(par > 0)) return 0;
    const f = Math.max(0, Math.min(1, (2 * par - time) / par));   // 1 at/below par, 0 at 2x par
    return Math.round(0.5 * base * f);
  }
  const streakMult = streak => Math.min(2, 1 + 0.1 * Math.max(0, streak));
  // score = (tier base + speed bonus) x streak multiplier (streak BEFORE this combo) x 1.25 when perfect
  function score(c, time, streak, perfect) {
    const base = (IT.COMBOS.TIER_BASE || {})[c.tier] || 0;
    return Math.round((base + speedBonus(c.tier, c.par, time)) * streakMult(streak) * (perfect ? 1.25 : 1));
  }

  // ------------------------------------------------------------ state
  function fresh(mode, opts) {
    return {
      mode: mode || 'sandbox', opts: opts || {}, phase: 'idle', current: null, def: null, dummy: null,
      stepIndex: 0, steps: [], pending: [], startT: 0, elapsed: 0, lastT: 0, lastId: null, hint: null,
      score: 0, streak: 0, bestStreak: 0, count: 0, extra: 0, misses: 0, attempt: 0, retries: 0,
      timeLeft: mode === 'timed' ? ((opts && opts.seconds) || IT.GAME.TIMED_SECONDS) : null,
      history: [], mastery: {}, resumeAt: 0, ended: false, granted: null, lastResult: null,
    };
  }
  function state(w) {
    if (!w.combo) { w.combo = fresh('sandbox'); }
    if (!w._comboHook) hook(w);
    return w.combo;
  }
  const active = st => st.current && st.phase === 'active' && !st.ended;
  const dummyOf = (w, st) => (st.dummy != null ? w.get(st.dummy) : null);

  function emit(w, type, p) { return w.emit(type, p); }

  // ------------------------------------------------------------ hero helpers
  function refreshAll(w, hero) {   // Refresher + full mana/hp: everything ready for the next prompt
    if (!hero) return;
    for (const k in hero.cd) hero.cd[k] = 0;
    if (hero.inv) hero.inv.invokeCd = 0;
    for (const s of hero.items || []) if (s) s.cd = 0;
    hero.mana = hero.maxMana; hero.hp = hero.maxHp;
  }
  const CLEAR_HERO = ['stun', 'frozen', 'hex', 'silence', 'root', 'atosRoot', 'lift', 'slow', 'disarm', 'knockback', 'channel', 'magicImmune', 'ghost'];

  function revoke(w, st) {
    const g = st.granted;
    if (!g) return;
    st.granted = null;
    const hero = w.hero;
    if (!hero) return;
    for (const id of g.items) { const i = hero.items.findIndex(s => s && s.id === id); if (i >= 0) hero.items[i] = g.replaced[id] ? { id: g.replaced[id], cd: 0, charges: 0 } : null; }
    IT.Hero.refresh(w, hero, g.loadout);
  }
  function grant(w, st, c) {
    const hero = w.hero, m = missing(w.loadout, c);
    if (!hero || (!m.items.length && !m.scepter && !m.shard)) return;
    const g = { items: [], replaced: {}, loadout: JSON.parse(JSON.stringify(w.loadout)) };
    const needed = new Set(itemNeeds(c));
    for (const id of m.items) {
      let i = hero.items.findIndex(s => !s);
      if (i < 0) i = hero.items.map((s, k) => (s && !needed.has(s.id) ? k : -1)).filter(k => k >= 0).pop();
      if (i == null || i < 0) continue;
      if (hero.items[i]) g.replaced[id] = hero.items[i].id;
      hero.items[i] = { id, cd: 0, charges: 0 };
      g.items.push(id);
    }
    if (m.scepter || m.shard) {
      const lo = JSON.parse(JSON.stringify(w.loadout));
      if (m.scepter) { lo.scepter = true; lo.scepterOrb = lo.scepterOrb || 'exort'; }
      if (m.shard) { lo.shard = true; if (!lo.shardSpell) { const st0 = (c.steps || []).find(q => ['ghostwalk', 'emp', 'sunstrike'].includes(q.ability)); lo.shardSpell = st0 ? st0.ability : 'emp'; } }
      IT.Hero.refresh(w, hero, lo);
    }
    st.granted = g;
  }
  function holds(w, c) {   // does the live hero meet `c`?
    const hero = w.hero;
    if (!hero) return false;
    const ctx = hero.ctx || w.ctx, need = orbNeeds(c), req = c.requires || {};
    for (const k in need) if (ctx.eff[k] < need[k]) return false;
    for (const id of itemNeeds(c)) if (!hero.items.some(s => s && s.id === id)) return false;
    if (req.scepter && !ctx.scepter) return false;
    if (req.shard && !ctx.shard) return false;
    return true;
  }

  function pickDummy(w) {
    let d = w.query(e => e.kind === 'dummy')[0];
    if (!d) {
      const sp = (w.map && w.map.spawns && w.map.spawns.dummies && w.map.spawns.dummies[0]) || { x: (w.hero ? w.hero.x : 0) + 1200, y: w.hero ? w.hero.y : 0 };
      d = IT.Units.spawnDummy(w, { x: sp.x, y: sp.y, preset: 'training', skin: IT.GAME.SKINS[0] });
    }
    return d;
  }

  // ------------------------------------------------------------ start / restart
  function begin(w, st, c, retry) {
    const hero = w.hero, G_ = IT.GAME;
    if (!hero) return false;
    revoke(w, st);
    if (st.opts.grantMissing) grant(w, st, c);
    if (!holds(w, c)) { emit(w, 'comboLocked', { id: c.id }); return false; }
    const d = pickDummy(w), sc = c.scenario || {};
    for (const e of w.query(x => x.kind === 'thinker' || x.kind === 'proj' || (x.kind === 'spirit' && x.owner === hero.id))) w.remove(e);
    IT.Orders.clear(w, hero);
    for (const t of CLEAR_HERO) if (hasS(hero, t)) IT.Status.remove(w, hero, t);
    hero.z = 0;
    refreshAll(w, hero);
    for (const s of hero.items) if (s) s.charges = 0;
    hero.inv.slots = [null, null];
    // dummy: behavior + stat preset for mobile behaviors, then respawn out of the way
    const beh = sc.dummyBehavior || 'stationary';
    const preset = G_.DUMMY_PRESETS[beh === 'evasive' ? 'expert' : beh === 'wander' ? 'standard' : 'training'];
    d.ai.behavior = beh;
    d.base.ms = preset.ms; d.ms = preset.ms; d.reaction = preset.reaction;
    const hidden = c.steps.some(s => s.targetVisibility === 'hidden');
    IT.Units.respawn(w, d, { outsideVision: !!(w.fog && hidden) });
    d.scenario = { stunBolt: !!sc.stunBolt, dummyEscape: sc.dummyEscape || 'none', blinkAfter: sc.blinkAfter != null ? sc.blinkAfter : 3 };
    IT.Units.resetCombo(w, d);
    if (d.scenario.dummyEscape === 'blink_after_seconds') d.ai.blink.t0 = Infinity;   // armed by the first step
    st.current = c.id; st.def = c; st.dummy = d.id; st.phase = 'active';
    st.stepIndex = 0; st.pending = [];
    st.steps = c.steps.map(() => ({ status: 'todo', t: null, n: 0, fin: false, castT: null, effT: null }));
    for (const j of candidates(st)) st.steps[j].status = 'active';
    st.startT = w.t; st.lastT = w.t; st.elapsed = 0; st.extra = 0; st.misses = 0;
    st.attempt = retry ? st.attempt + 1 : 0;
    st.hint = hidden ? { x: d.x, y: d.y } : null;
    st.pull = null;
    armMove(w, st);
    emit(w, 'comboStart', { id: c.id, tier: c.tier, attempt: st.attempt, retry: !!retry });
    return true;
  }

  function start(w, id, opts) {
    const st = state(w), c = get(id);
    if (!c) return false;
    if (opts) Object.assign(st.opts, opts);
    if (st.ended) return false;
    st.resumeAt = 0;
    return begin(w, st, c, false);
  }

  function cancel(w) {
    const st = state(w);
    st.current = null; st.def = null; st.phase = 'idle'; st.pending = []; st.steps = []; st.hint = null; st.resumeAt = 0;
  }

  // ------------------------------------------------------------ completion / failure
  function fail(w, st, reason, index, more) {
    if (!active(st)) return;
    const c = st.def, h = mastery(st, c.id);
    h.fails++;
    st.phase = 'fail'; st.streak = 0; st.retries++; st.pending = [];
    if (index != null && st.steps[index]) st.steps[index].status = 'fail';
    st.resumeAt = w.t + FAIL_DELAY;
    st.lastResult = { id: c.id, ok: false, reason };
    pushHist(st, { id: c.id, tier: c.tier, ok: false, reason, t: w.t });
    emit(w, 'comboFail', Object.assign({ id: c.id, tier: c.tier, reason, index: index == null ? st.stepIndex : index }, more || {}));
  }

  function mastery(st, id) { return st.mastery[id] || (st.mastery[id] = { done: 0, fails: 0, best: null }); }
  function pushHist(st, r) { st.history.push(r); if (st.history.length > HIST_MAX) st.history.shift(); }

  function checkDone(w, st) {
    if (!active(st)) return;
    if (st.stepIndex < st.def.steps.length) return;
    if (st.pending.some(p => p.state === 'open')) return;
    const c = st.def, time = w.t - st.startT, perfect = st.extra === 0 && st.misses === 0 && st.attempt === 0;
    const pts = score(c, time, st.streak, perfect), h = mastery(st, c.id);
    st.score += pts; st.streak++; st.bestStreak = Math.max(st.bestStreak, st.streak); st.count++;
    h.done++; if (h.best == null || time < h.best) h.best = time;
    st.phase = 'done'; st.resumeAt = w.t + DONE_DELAY; st.hint = null;
    st.lastResult = { id: c.id, ok: true, time, score: pts, perfect };
    pushHist(st, { id: c.id, tier: c.tier, ok: true, time, score: pts, perfect, t: w.t });
    refreshAll(w, w.hero);
    emit(w, 'comboDone', { id: c.id, tier: c.tier, time, score: pts, perfect, streak: st.streak, total: st.score });
  }

  // ------------------------------------------------------------ step matching
  function nextStep(st) { return st.def.steps[st.stepIndex] || null; }
  // steps that may be completed next: the first unfinished one, plus its unfinished neighbours sharing its `group` (anyOrder)
  function candidates(st) {
    const steps = st.def.steps, out = [];
    let i = st.stepIndex;
    while (i < steps.length && st.steps[i] && st.steps[i].fin) i++;
    if (i >= steps.length) return out;
    out.push(i);
    const g = steps[i].group;
    if (g != null) for (let j = i + 1; j < steps.length && steps[j].group === g; j++) if (!st.steps[j].fin) out.push(j);
    return out;
  }
  // reference time of step `ref`: its cast; with fx, the dummy hit instead (lift, root, stun landing). null = fx hit not known yet.
  function refTime(st, ref, fx) {
    const row = st.steps[ref];
    if (!row || !row.fin) return null;
    if (!fx) return row.castT != null ? row.castT : row.t;
    if (row.effT != null) return row.effT;
    if (st.pending.some(q => q.idx === ref && q.state === 'open')) return null;
    return row.castT != null ? row.castT : row.t;
  }
  function gapDist(w, st) {
    const h = w.hero, d = dummyOf(w, st);
    return h && d ? Math.hypot(d.x - h.x, d.y - h.y) : 0;
  }
  function winOf(w, st, i) { return windowOf(st.def, i, timing(ctxOf(w)), { dist: gapDist(w, st) }); }
  // 'early' | 'late' | null for step i if it were cast now
  function judge(w, st, i) {
    const win = winOf(w, st, i);
    if (!win) return null;
    const rt = refTime(st, win.ref, win.fx), gap = rt == null ? 0 : w.t - rt;
    if (gap < win.lo - EPS) return { kind: 'early', s: win.lo - gap, win };
    if (rt != null && gap > win.hi + EPS) return { kind: 'late', s: gap - win.hi, win };
    return null;
  }

  // movement steps are polled each tick. 'move' remembers where the hero (and the hero-dummy gap) were when it became active.
  function armMove(w, st) {
    const s = nextStep(st), h = w.hero, d = dummyOf(w, st);
    st.moveRef = s && s.type === 'move' && h ? { x: h.x, y: h.y, gap: d ? Math.hypot(d.x - h.x, d.y - h.y) : 0 } : null;
  }
  // position: hero-dummy gap within [minDist, maxDist]; move: hero travelled `dist` (default 150), optionally dir 'away'|'toward' the dummy
  function positionOk(w, st, s) {
    const h = w.hero, d = dummyOf(w, st);
    if (!h || !d) return false;
    const gap = Math.hypot(d.x - h.x, d.y - h.y);
    if (s.type === 'position') return (s.maxDist == null || gap <= s.maxDist) && (s.minDist == null || gap >= s.minDist);
    const r = st.moveRef, dist = s.dist != null ? s.dist : 150;
    if (!r || Math.hypot(h.x - r.x, h.y - r.y) < dist) return false;
    if (s.dir === 'away') return gap >= r.gap + dist * 0.5;
    if (s.dir === 'toward') return gap <= r.gap - dist * 0.5;
    return true;
  }

  function completeStep(w, st, extra, idx) {
    const i = idx != null ? idx : st.stepIndex, s = st.def.steps[i];
    st.steps[i].status = 'done'; st.steps[i].t = w.t; st.steps[i].castT = w.t; st.steps[i].fin = true;
    while (st.stepIndex < st.def.steps.length && st.steps[st.stepIndex].fin) st.stepIndex++;
    st.lastT = w.t;
    for (const j of candidates(st)) if (st.steps[j].status === 'todo') st.steps[j].status = 'active';
    armMove(w, st);
    if (i === 0 && st.dummy != null) { const d = dummyOf(w, st); if (d && d.ai && d.ai.blink.t0 === Infinity) d.ai.blink.t0 = w.t; }
    emit(w, 'comboStep', Object.assign({ id: st.def.id, index: i, ability: s.ability, react: s.react, done: st.stepIndex >= st.def.steps.length }, extra || {}));
  }

  function onCast(w, p) {
    const st = w.combo;
    if (!active(st) || !w.hero || p.unit !== w.hero.id) return;
    const d = dummyOf(w, st), steps = st.def.steps, cands = candidates(st);
    const matches = j => { const q = steps[j]; return (q.type === 'cast' || q.type === 'item') && q.ability === p.ability; };
    const i = cands.find(matches);
    let ok = i != null;
    const s = ok ? steps[i] : null;
    if (ok && s.targetVisibility === 'hidden' && (!d || d.visible)) ok = false;
    if (ok && s.targetVisibility === 'visible' && (!d || !d.visible)) ok = false;
    if (ok && s.selfCast && Math.hypot(p.x - w.hero.x, p.y - w.hero.y) > 100) ok = false;
    if (ok && s.onSpirit) { const t = w.get(p.target); if (!t || t.kind !== 'spirit' || t.owner !== w.hero.id) ok = false; }
    if (!ok) {
      st.extra++;
      // feedback: the spell belongs to the combo (wrong order / wrong target) or is foreign
      const exp = steps[cands[0]];
      let kind = 'extra';
      if (i != null) kind = 'target';
      else if (steps.some(q => (q.type === 'cast' || q.type === 'item') && q.ability === p.ability)) kind = 'order';
      emit(w, 'comboHint', { id: st.def.id, kind, got: p.ability, expected: exp && exp.ability ? exp.ability : null, index: cands[0] });
      return;
    }
    const jg = judge(w, st, i);
    if (jg) { fail(w, st, jg.kind, i, { s: sec(jg.s), ability: p.ability }); return; }
    if (s.mustHitDummy || (s.type === 'item' && s.itemOnDummy)) st.pending.push({ idx: i, ability: p.ability, t: w.t, state: 'open' });
    if (s.react === 'empPull' || s.ability === 'emp') st.pull = d ? { x: d.x, y: d.y } : null;
    completeStep(w, st, null, i);
    if (st.pending.some(q => q.idx === i && q.state === 'open')) st.steps[i].status = 'pending';   // advanced, hit unconfirmed
    checkDone(w, st);
  }

  function onHit(w, p) {
    const st = w.combo;
    if (!active(st) || !w.hero || p.src !== w.hero.id || p.target !== st.dummy || p.ability === 'attack') return;
    const q = st.pending.find(x => x.state === 'open' && x.ability === p.ability);
    if (!q) return;
    q.state = 'hit';
    if (st.steps[q.idx]) { st.steps[q.idx].status = 'done'; st.steps[q.idx].effT = w.t; }
    checkDone(w, st);
  }

  function onMiss(w, p) {
    const st = w.combo;
    if (!active(st) || !w.hero || p.src !== w.hero.id || p.ability === 'attack') return;
    st.misses++;
    const q = st.pending.find(x => x.state === 'open' && x.ability === p.ability);
    if (!q) return;
    q.state = 'miss';
    fail(w, st, 'miss', q.idx);
  }

  function onAttackHit(w, p) {
    const st = w.combo;
    if (!active(st) || !w.hero || p.target !== st.dummy) return;
    const src = w.byId.get(p.src);
    if (!src || !(src.id === w.hero.id || (src.kind === 'spirit' && src.owner === w.hero.id))) return;
    const s = nextStep(st);
    if (!s || s.type !== 'attack') return;
    const row = st.steps[st.stepIndex];
    row.n++;
    if (row.n >= (s.count || 1)) { completeStep(w, st); checkDone(w, st); }
  }

  function onBolt(w, p) {
    const st = w.combo;
    if (!active(st) || p.unit !== st.dummy) return;
    const s = nextStep(st);
    if (p.phase === 'hit') { fail(w, st, 'boltHit', st.stepIndex); return; }
    if (!s || s.type !== 'react') return;
    if ((p.phase === 'cancel' && p.reason === 'disabled' && s.react === 'boltCancel') || (p.phase === 'blocked' && s.react === 'boltBlocked')) {
      completeStep(w, st); checkDone(w, st);
    }
  }

  function awaitingBlink(st) { return st.def.steps.some((s, i) => s.react === 'blinkPrevented' && i >= st.stepIndex); }
  function onBlink(w, p) {
    const st = w.combo;
    if (!active(st) || p.unit !== st.dummy) return;
    if (awaitingBlink(st)) fail(w, st, 'blinked', st.stepIndex);
  }

  // dummy wants to blink but a disable stops it (also used by the stats collector idea: same predicate)
  function blinkBlocked(d) {
    const b = d && d.ai && d.ai.blink;
    if (!b || b.used || !(b.pending || b.tellEnd)) return false;
    return hasS(d, 'atosRoot') || hasS(d, 'root') || hasS(d, 'stun') || hasS(d, 'frozen') || hasS(d, 'lift') || hasS(d, 'hex');
  }

  // ------------------------------------------------------------ per tick
  function nextPrompt(w, st) {
    const lo = st.opts.loadout || w.loadout;
    let pool = available(lo, { grantMissing: st.opts.grantMissing });
    if (st.opts.tiers && st.opts.tiers.length) pool = pool.filter(c => st.opts.tiers.includes(c.tier));
    if (st.opts.ids && st.opts.ids.length) pool = pool.filter(c => st.opts.ids.includes(c.id));
    if (pool.length > 1) pool = pool.filter(c => c.id !== st.lastId);
    if (!pool.length) return null;
    const wt = c => { const m = mastery(st, c.id); return (m.done < 1 ? 4 : m.done < 3 ? 2 : 1) + Math.min(3, 0.5 * m.fails); };
    let sum = 0;
    for (const c of pool) sum += wt(c);
    let r = w.rng() * sum;
    for (const c of pool) { r -= wt(c); if (r < 0) return c; }
    return pool[pool.length - 1];
  }

  function launchNext(w, st) {
    const c = nextPrompt(w, st);
    if (!c) { endMode(w, st, 'noCombos'); return; }
    st.lastId = c.id;
    if (!begin(w, st, c, false)) endMode(w, st, 'locked');
  }

  function summaryOf(st, reason) {
    return {
      mode: st.mode, score: st.score, combos: st.count, bestStreak: st.bestStreak, fails: st.retries,
      history: st.history.slice(), reason: reason || 'time',
    };
  }
  function endMode(w, st, reason) {
    if (st.ended) return;
    st.ended = true; st.phase = 'ended'; st.current = null; st.def = null; st.pending = []; st.hint = null;
    if (st.timeLeft != null) st.timeLeft = Math.max(0, st.timeLeft);
    revoke(w, st);
    emit(w, 'modeEnd', summaryOf(st, reason));
  }

  function update(w, dt) {
    const st = w.combo;
    if (!st) return;
    if (!w._comboHook) hook(w);
    if (st.ended) return;
    if (st.mode === 'timed') {
      st.timeLeft -= dt;
      if (st.timeLeft <= EPS) { st.timeLeft = 0; endMode(w, st, 'time'); return; }
    }
    if (st.phase === 'active' && st.current) {
      st.elapsed = w.t - st.startT;
      for (const q of st.pending) if (q.state === 'open' && w.t - q.t > RESOLVE_TIMEOUT + EPS) { q.state = 'timeout'; fail(w, st, 'timeout', q.idx); break; }
    }
    if (st.phase === 'active' && st.current) {
      const s = nextStep(st), i = st.stepIndex, d = dummyOf(w, st);
      let closed = false;
      for (const j of candidates(st)) {   // a window that has already closed can no longer be met
        const q = st.def.steps[j];
        const jg = q.at ? judge(w, st, j) : null;
        const wi = q.at ? null : withinOf(q, timing(ctxOf(w)));
        if (jg && jg.kind === 'late') { fail(w, st, 'late', j, { s: sec(jg.s), ability: q.ability }); closed = true; break; }
        if (wi != null && j > 0 && w.t - st.lastT > wi + EPS) { fail(w, st, 'late', j, { s: sec(w.t - st.lastT - wi), ability: q.ability }); closed = true; break; }
      }
      if (s && !closed) {
        if ((s.type === 'position' || s.type === 'move') && positionOk(w, st, s)) { completeStep(w, st); checkDone(w, st); }
        else if (s.type === 'react' && d) {
          if (s.react === 'blinkPrevented' && blinkBlocked(d)) { completeStep(w, st); checkDone(w, st); }
          else if (s.react === 'empPull' && st.pull && Math.hypot(d.x - st.pull.x, d.y - st.pull.y) >= PULL_MIN) { completeStep(w, st); checkDone(w, st); }
        }
      }
    } else if ((st.phase === 'done' || st.phase === 'fail') && st.resumeAt && w.t >= st.resumeAt - EPS) {
      st.resumeAt = 0;
      if (st.phase === 'fail') { if (!begin(w, st, st.def, true)) cancel(w); }
      else if (st.mode === 'practice' || st.mode === 'timed') launchNext(w, st);
      else cancel(w);
    }
  }

  // ------------------------------------------------------------ modes
  function mode(w, name, opts) {
    if (w.combo) revoke(w, w.combo);
    const st = w.combo = fresh(name, opts);
    if (!w._comboHook) hook(w);
    emit(w, 'modeStart', { mode: name });
    if (name === 'practice' || name === 'timed') launchNext(w, st);
    return st;
  }
  // practice/timed/any: end now and emit modeEnd
  function stop(w) { const st = state(w); endMode(w, st, 'stopped'); return summaryOf(st, 'stopped'); }
  // practice: drop the current prompt and pick another (streak breaks)
  function skip(w) {
    const st = state(w);
    if (st.ended || !st.current) return false;
    st.streak = 0; st.pending = [];
    if (st.mode === 'practice' || st.mode === 'timed') launchNext(w, st); else cancel(w);
    return true;
  }

  function hook(w) {
    w._comboHook = true;
    w.on('cast', p => onCast(w, p));
    w.on('hit', p => onHit(w, p));
    w.on('miss', p => onMiss(w, p));
    w.on('attackHit', p => onAttackHit(w, p));
    w.on('bolt', p => onBolt(w, p));
    w.on('blink', p => onBlink(w, p));
  }

  IT.World.system('combo', 90, (w, dt) => update(w, dt));

  IT.Combo = { get, available, missing, orbNeeds, itemNeeds, start, mode, stop, skip, cancel, score, speedBonus, streakMult, blinkBlocked, refreshAll, positionOk,
    timing, tipText, windowOf, waitOf, TOL,
    TIMEOUT: RESOLVE_TIMEOUT, FAIL_DELAY, DONE_DELAY, PULL_MIN };
})(typeof window !== 'undefined' ? window : globalThis);
