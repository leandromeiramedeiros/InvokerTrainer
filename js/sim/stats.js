// Stats collector: subscribes to the sim event bus, no storage. summary() is plain JSON; merge() folds it into a lifetime blob.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const CC = ['stun', 'frozen', 'hex', 'lift', 'root', 'atosRoot', 'silence'];
  const num = (o, k, v) => { o[k] = (o[k] || 0) + v; };
  const round = x => Math.round(x * 1000) / 1000;

  function blank() {
    return {
      time: 0, actions: 0, apm: 0,
      spells: {},                 // id -> { casts, hits, misses, accuracy }
      invoke: { count: 0, swaps: 0, total: 0, avg: 0, best: null },
      damage: { dealt: { total: 0, byType: {}, bySource: {} }, taken: { total: 0, byType: {}, bySource: {} }, prevented: { total: 0, byType: {} } },
      cc: { uptime: 0, byStatus: {} },
      blindHits: 0, boltsCountered: 0, boltsBlocked: 0, boltsHit: 0, blinksPrevented: 0, blinks: 0,
      combos: { done: 0, byTier: {}, fails: 0, best: {}, score: 0 },
    };
  }

  function create(w) {
    const S = blank(), off = [];
    let last = w.t, wantInvoke = null, blinkWas = false;
    const hid = () => w.hero && w.hero.id;
    const mine = id => {
      if (id === hid()) return true;
      const e = w.byId.get(id);
      return !!(e && e.kind === 'spirit' && e.owner === hid());
    };
    const sp = id => S.spells[id] || (S.spells[id] = { casts: 0, hits: 0, misses: 0, accuracy: null });
    const dummy = () => w.query(e => IT.Units && IT.Units.isFoe ? IT.Units.isFoe(e) : e.kind === 'dummy')[0];
    const on = (t, f) => off.push(w.on(t, f));

    on('order', p => { if (p.unit === hid()) S.actions++; });
    on('orb', p => { if (p.unit === hid()) { S.actions++; if (wantInvoke == null) wantInvoke = w.t; } });
    on('invoke', p => {
      if (p.unit !== hid()) return;
      S.actions++; S.invoke.count++; if (p.swapped) S.invoke.swaps++;
      if (wantInvoke != null) {
        const l = w.t - wantInvoke;
        S.invoke.total += l; S.invoke.avg = S.invoke.total / S.invoke.count;
        if (S.invoke.best == null || l < S.invoke.best) S.invoke.best = l;
      }
      wantInvoke = null;
    });
    on('cast', p => { if (p.unit === hid()) sp(p.ability).casts++; });
    on('hit', p => {
      if (!mine(p.src) || p.ability === 'attack' || p.ability === 'stunbolt') return;
      sp(p.ability).hits++;
      if (p.blind) S.blindHits++;
    });
    on('miss', p => { if (mine(p.src) && p.ability !== 'attack' && p.ability !== 'stunbolt') sp(p.ability).misses++; });
    on('damage', p => {
      const dmg = S.damage, type = p.dmgType || 'pure';
      if (p.prevented > 0) { dmg.prevented.total += p.prevented; num(dmg.prevented.byType, type, p.prevented); }
      const side = mine(p.src) ? dmg.dealt : p.target === hid() ? dmg.taken : null;
      if (!side) return;
      side.total += p.dealt; num(side.byType, type, p.dealt);
      num(side.bySource, p.ability || 'attack', p.dealt);
    });
    on('bolt', p => {
      if (p.phase === 'hit') S.boltsHit++;
      else if (p.phase === 'blocked') { S.boltsBlocked++; S.boltsCountered++; }
      else if (p.phase === 'cancel' && p.reason === 'disabled') S.boltsCountered++;
    });
    on('blink', p => { const d = dummy(); if (d && p.unit === d.id) S.blinks++; });
    on('comboDone', p => {
      const c = S.combos;
      c.done++; c.score += p.score || 0; num(c.byTier, p.tier, 1);
      if (c.best[p.id] == null || p.time < c.best[p.id]) c.best[p.id] = p.time;
    });
    on('comboFail', () => { S.combos.fails++; });

    const sys = (w2, dt) => {
      const d = dummy();
      S.time += dt;
      if (d) {
        let any = false;
        for (const s of CC) if (IT.Status.has(d, s)) { any = true; num(S.cc.byStatus, s, dt); }
        if (any) S.cc.uptime += dt;
        const bb = !!(IT.Combo && IT.Combo.blinkBlocked(d));
        if (bb && !blinkWas) S.blinksPrevented++;
        blinkWas = bb;
      }
    };
    const api = {
      data: S, sys,
      summary() {
        const o = JSON.parse(JSON.stringify(S));
        o.time = round(S.time);
        o.apm = S.time > 1 ? round(S.actions / (S.time / 60)) : 0;
        for (const k in o.spells) { const s = o.spells[k], n = s.hits + s.misses; s.accuracy = n ? round(s.hits / n) : null; }
        o.invoke.avg = round(o.invoke.avg); o.invoke.total = round(o.invoke.total);
        o.cc.uptime = round(o.cc.uptime);
        o.cc.ratio = S.time > 0 ? round(S.cc.uptime / S.time) : 0;
        return o;
      },
      destroy() { for (const f of off) if (typeof f === 'function') f(); off.length = 0; if (w._stats === api) w._stats = null; },
    };
    w._stats = api;
    return api;
  }

  function addMap(a, b) { for (const k in b) a[k] = (a[k] || 0) + b[k]; }
  function side(a, b) { a.total += b.total; addMap(a.byType, b.byType); if (b.bySource) addMap(a.bySource, b.bySource); }
  // merge(lifetime|null, summary) -> new lifetime blob (inputs untouched)
  function merge(life, s) {
    const L = life ? JSON.parse(JSON.stringify(life)) : Object.assign(blank(), { sessions: 0 });
    L.sessions = (L.sessions || 0) + 1;
    L.time += s.time; L.actions += s.actions;
    L.apm = L.time > 1 ? round(L.actions / (L.time / 60)) : 0;
    for (const k in s.spells) {
      const a = L.spells[k] || (L.spells[k] = { casts: 0, hits: 0, misses: 0, accuracy: null }), b = s.spells[k];
      a.casts += b.casts; a.hits += b.hits; a.misses += b.misses;
      const n = a.hits + a.misses; a.accuracy = n ? round(a.hits / n) : null;
    }
    const i = L.invoke, j = s.invoke;
    i.count += j.count; i.swaps += j.swaps; i.total += j.total; i.avg = i.count ? round(i.total / i.count) : 0;
    if (j.best != null && (i.best == null || j.best < i.best)) i.best = j.best;
    side(L.damage.dealt, s.damage.dealt); side(L.damage.taken, s.damage.taken);
    L.damage.prevented.total += s.damage.prevented.total; addMap(L.damage.prevented.byType, s.damage.prevented.byType);
    L.cc.uptime = round(L.cc.uptime + s.cc.uptime); addMap(L.cc.byStatus, s.cc.byStatus);
    L.cc.ratio = L.time > 0 ? round(L.cc.uptime / L.time) : 0;
    for (const k of ['blindHits', 'boltsCountered', 'boltsBlocked', 'boltsHit', 'blinksPrevented', 'blinks']) L[k] += s[k];
    const c = L.combos, d = s.combos;
    c.done += d.done; c.fails += d.fails; c.score += d.score; addMap(c.byTier, d.byTier);
    for (const id in d.best) if (c.best[id] == null || d.best[id] < c.best[id]) c.best[id] = d.best[id];
    return L;
  }

  // ---- end-splash curation (pure): the few numbers worth showing for a finished ranked / infinite run.
  // S = stats summary, m = the modeEnd summary (Ranked finish()). Tiles are { id, kind:'int'|'frac'|'pct'|'sec'|'rate', v [, of, n] } in display order.
  function accOf(S, id) {
    const s = S && S.spells && S.spells[id], n = s ? s.hits + s.misses : 0;
    return n > 0 ? { acc: s.hits / n, hits: s.hits, casts: s.casts } : null;
  }
  function fastest(S) {
    const b = S && S.combos && S.combos.best, v = b ? Object.keys(b).map(k => b[k]).filter(x => typeof x === 'number' && isFinite(x) && x > 0) : [];
    return v.length ? Math.min.apply(null, v) : null;
  }
  // ornament level 0..7 for the share card / splash: the rank tier of a ranked run, ~2 clears per step for an infinite one
  function ornament(m) {
    m = m || {};
    if (m.mode === 'infinite') return Math.max(0, Math.min(7, Math.floor((m.cleared != null ? m.cleared : m.solved || 0) / 2)));
    const r = m.rank && m.rank.after && m.rank.after.rank;
    return r ? Math.max(0, Math.min(7, r.tier | 0)) : 0;
  }
  function curated(S, m) {
    S = S || blank(); m = m || {};
    const inf = m.mode === 'infinite', solved = m.solved != null ? m.solved : m.cleared != null ? m.cleared : (m.combos || 0);
    const sun = accOf(S, 'sunstrike'), met = accOf(S, 'chaosmeteor'), fast = fastest(S), t = [];
    t.push({ id: 'score', kind: 'int', v: Math.round(m.score || 0) });
    if (!inf) t.push({ id: 'cleared', kind: 'frac', v: solved, of: m.turns || null });
    t.push({ id: 'streak', kind: 'int', v: m.bestStreak || 0 });
    if (S.apm > 0) t.push({ id: 'apm', kind: 'rate', v: S.apm });
    if (fast != null) t.push({ id: 'fastest', kind: 'sec', v: fast });
    if (sun) t.push({ id: 'sun', kind: 'pct', v: sun.acc, n: sun.hits });
    if (met) t.push({ id: 'meteor', kind: 'pct', v: met.acc, n: met.hits });
    return { tiles: t, cleared: solved, ornament: ornament(m) };
  }

  IT.StatsCollector = { create, merge, blank, curated, ornament };
  IT.World.system('statsCollector', 90, (w, dt) => { if (w._stats) w._stats.sys(w, dt); });
})(typeof window !== 'undefined' ? window : globalThis);
