// Stats collector: subscribes to the sim event bus, no storage. summary() is plain JSON; merge() folds it into a lifetime blob.
// v6 WP6: also measures the relics (js/data/relics.js) of scenario runs (w.ranked set: ranked / infinite / scenario practice) from the
// same events (damage / kill / hit / cast / status / blink / fx); summary().relics = this run's deltas. hooks.base() -> lifetime relic map,
// hooks.tier({id, tier, value}) fires once when a relic completes a tier during play (the UI toast; js/ui/relics.js sets both).
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
      scn: {},                    // scenario id -> { cleared, best (s) } from scnResult ok (lifetime: Scenarios screen check + best time)
      relics: {},                 // relic id -> amount this run (scenario runs only)
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

    // ---- relics
    const live = () => !!w.ranked;
    const ent = id => (w.get ? w.get(id) : w.byId.get(id));
    const isSpirit = id => { const e = ent(id); return !!(e && e.kind === 'spirit'); };
    const isFoeId = id => { const e = ent(id); return !!(e && (IT.Units && IT.Units.isFoe ? IT.Units.isFoe(e) : e.kind === 'dummy' || e.kind === 'enemy')); };
    let base = null;
    const relic = (id, v) => {
      if (!(v > 0) || !live()) return;
      const before = S.relics[id] || 0;
      S.relics[id] = before + v;
      const H = IT.StatsCollector && IT.StatsCollector.hooks, Rd = IT.RELICS;
      if (!Rd || !H || !H.tier) return;
      if (base == null) { try { base = (H.base && H.base()) || {}; } catch (e) { base = {}; } }
      const b = (base[id] || 0) + before, t0 = Rd.tierOf(id, b), t1 = Rd.tierOf(id, b + v);
      if (t1 > t0) { try { H.tier({ id, tier: t1, value: b + v }); } catch (e) { /* UI optional */ } }
    };
    const DIS = { stun: 1, frozen: 1, hex: 1, lift: 1, root: 1, atosRoot: 1, silence: 1 }, STUN = { stun: 1, frozen: 1, hex: 1, lift: 1 };
    // ability -> [relic, foes needed, window s]: one window per cast (the sim already dedupes hits per cast)
    const MULTI = { icewall: ['multi_icewall', 2, 6], emp: ['three_emp', 3, 4], deafeningblast: ['three_deafening', 3, 2.5], chaosmeteor: ['multi_meteor', 2, 7] };
    const win = {};
    const stunAt = {}, liftAt = {}, manaAt = {};
    let lastDmg = null, blinkAt = -99, cataUntil = -1;
    on('cast', p => { if (p.unit === hid() && MULTI[p.ability]) win[p.ability] = { set: new Set(), until: w.t + MULTI[p.ability][2], done: false }; });
    on('hit', p => {
      if (!mine(p.src)) return;
      if (p.ability === 'emp') { const e = ent(p.target); if (e) manaAt[p.target] = e.mana || 0; }
      const M = MULTI[p.ability];
      if (!M || !isFoeId(p.target)) return;
      let c = win[p.ability];
      if (!c || w.t > c.until) c = win[p.ability] = { set: new Set(), until: w.t + M[2], done: false };
      c.set.add(p.target);
      if (!c.done && c.set.size >= M[1]) { c.done = true; relic(M[0], 1); }
    });
    on('status', p => {
      if (p.src == null || !mine(p.src) || !isFoeId(p.target)) return;
      if (DIS[p.status]) relic('disable_time', p.dur || 0);
      if (STUN[p.status]) stunAt[p.target] = w.t + (p.dur || 0);
      if (p.status === 'lift' && p.ability === 'tornado') { relic('tornado_lifts', 1); liftAt[p.target] = w.t + (p.dur || 0); }
    });
    on('blink', p => { if (p.unit === hid()) blinkAt = w.t; });
    on('fx', p => { if (p.name === 'cataclysm') cataUntil = w.t + 3; });
    // Dota multi-kill rule: each kill within 18 s of the previous one extends the chain (3 = Triple Kill, 5 = Rampage); a Killing Spree = 3 kills in a row without dying
    let chain = 0, chainAt = -99, streak = 0;
    on('kill', p => {
      if (p.unit === hid()) { streak = 0; chain = 0; return; }
      const same = lastDmg && lastDmg.target === p.unit, by = p.by != null ? p.by : same ? lastDmg.src : null;
      if (by == null || !mine(by)) return;
      const ab = same ? lastDmg.ab : 'attack', t = w.t;
      relic('kills', 1);
      chain = t - chainAt <= 18 ? chain + 1 : 1; chainAt = t; streak++;
      if (chain === 3) relic('triple_kills', 1);
      if (chain === 5) relic('rampages', 1);
      if (streak === 3) relic('killing_sprees', 1);
      if (ab === 'sunstrike') relic('sunstrike_kills', 1);
      if (ab === 'tornado' || (liftAt[p.unit] != null && t <= liftAt[p.unit] + 2)) relic('tornado_kills', 1);
      if (ab === 'forgespirit' || isSpirit(by)) relic('spirit_kills', 1);
      if (stunAt[p.unit] != null && t <= stunAt[p.unit] + 3) relic('stun_kills', 1);
      if (t - blinkAt <= 4) relic('blink_kills', 1);
      if (w.hero && IT.Status && IT.Status.has(w.hero, 'magicImmune')) relic('bkb_kills', 1);
    });

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
      const dmg = S.damage, type = p.dmgType || 'pure', my = mine(p.src);
      if (p.prevented > 0) { dmg.prevented.total += p.prevented; num(dmg.prevented.byType, type, p.prevented); }
      // Forge Spirit attacks are booked as 'forgespirit' (damage by spell), the hero's own as 'attack'
      const ab = my && (p.ability || 'attack') === 'attack' && isSpirit(p.src) ? 'forgespirit' : p.ability || 'attack';
      lastDmg = { src: p.src, target: p.target, ab };
      const side = my ? dmg.dealt : p.target === hid() ? dmg.taken : null;
      if (!side) return;
      side.total += p.dealt; num(side.byType, type, p.dealt);
      num(side.bySource, ab, p.dealt);
      if (!my || !(p.dealt > 0) || !isFoeId(p.target)) return;
      if (ab === 'chaosmeteor') relic('meteor_dmg', p.dealt);
      if (ab === 'sunstrike' && w.t <= cataUntil) relic('cataclysm_hits', 1);
      if (ab === 'emp' && manaAt[p.target] != null) { const e = ent(p.target); relic('emp_mana', Math.max(0, manaAt[p.target] - (e ? e.mana || 0 : 0))); delete manaAt[p.target]; }
      if (ab === 'attack' || ab === 'forgespirit') {   // Alacrity: the bonus-damage share of an attack by an Alacrity-buffed unit of ours
        const s = IT.Status && IT.Status.find(ent(p.src) || { statuses: [] }, 'alacrity'), bonus = s && s.data && s.data.stats ? s.data.stats.dmg || 0 : 0;
        if (bonus > 0 && p.raw > 0) relic('alacrity_dmg', Math.min(p.dealt, bonus * p.dealt / p.raw));
      }
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
    on('scnResult', p => {
      if (!p || !p.ok || p.id == null) return;
      const r = S.scn[p.id] || (S.scn[p.id] = { cleared: 0, best: null });
      r.cleared++;
      if (typeof p.time === 'number' && isFinite(p.time) && p.time > 0 && (r.best == null || p.time < r.best)) r.best = round(p.time);
    });

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
        for (const k in o.relics) o.relics[k] = round(o.relics[k]);
        return o;
      },
      destroy() { for (const f of off) if (typeof f === 'function') f(); off.length = 0; if (w._stats === api) w._stats = null; },
    };
    w._stats = api;
    return api;
  }

  const medalKey = r => (r ? (r.tier | 0) * 6 + (r.stars | 0) : -1);
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
    L.scn = L.scn || {};
    if (s.scn) for (const id in s.scn) {
      const a = L.scn[id] || (L.scn[id] = { cleared: 0, best: null }), b = s.scn[id];
      a.cleared += b.cleared || 0;
      if (b.best != null && (a.best == null || b.best < a.best)) a.best = b.best;
    }
    L.relics = L.relics || {};
    if (s.relics) { addMap(L.relics, s.relics); for (const k in L.relics) L.relics[k] = round(L.relics[k]); }
    // s.run (main.js commitStats, ranked runs only): { mode, score, solved, turns, medal:{tier,stars,name,id} } -> runs count + best medal
    if (s.run && s.run.mode === 'ranked') {
      L.runs = (L.runs || 0) + 1;
      if (s.run.medal && medalKey(s.run.medal) > medalKey(L.bestMedal)) L.bestMedal = { tier: s.run.medal.tier, stars: s.run.medal.stars, name: s.run.medal.name, id: s.run.medal.id };
      L.bestScore = Math.max(L.bestScore || 0, Math.round(s.run.score || 0));
    }
    return L;
  }

  // ---- end-splash curation (pure): the few numbers worth showing for a finished ranked / infinite run.
  // S = stats summary, m = the modeEnd summary (Ranked finish()). Tiles are { id, kind:'int'|'frac'|'sec'|'rate', v [, of] } in display order.
  // v6 WP6: no per-spell accuracy tiles; damage = { total, byType:{physical,magical,pure}, bySpell:[{id, v}] (only sources that hit, desc) }.
  function fastest(S) {
    const b = S && S.combos && S.combos.best, v = b ? Object.keys(b).map(k => b[k]).filter(x => typeof x === 'number' && isFinite(x) && x > 0) : [];
    return v.length ? Math.min.apply(null, v) : null;
  }
  // per-run medal of a ranked run (IT.Ranks.fromRun: score + cleared, no rating)
  function medal(m) {
    m = m || {};
    if (m.mode === 'infinite' || !IT.Ranks || !IT.Ranks.fromRun) return null;
    return IT.Ranks.fromRun(m);
  }
  // ornament level 0..7 for the share card / splash: this run's medal tier for a ranked run, ~2 clears per step for an infinite one
  function ornament(m) {
    m = m || {};
    if (m.mode === 'infinite') return Math.max(0, Math.min(7, Math.floor((m.cleared != null ? m.cleared : m.solved || 0) / 2)));
    if (m.score == null && m.solved == null) return 0;
    const r = medal(m);
    return r ? Math.max(0, Math.min(7, r.tier | 0)) : 0;
  }
  function damageOf(S) {
    const d = S && S.damage && S.damage.dealt, by = (d && d.byType) || {}, src = (d && d.bySource) || {};
    const bySpell = Object.keys(src).filter(k => src[k] > 0.5).map(k => ({ id: k, v: Math.round(src[k]) })).sort((a, b) => b.v - a.v);
    return { total: Math.round((d && d.total) || 0), byType: { physical: Math.round(by.physical || 0), magical: Math.round(by.magical || 0), pure: Math.round(by.pure || 0) }, bySpell };
  }
  function curated(S, m) {
    S = S || blank(); m = m || {};
    const inf = m.mode === 'infinite', solved = m.solved != null ? m.solved : m.cleared != null ? m.cleared : (m.combos || 0);
    const fast = fastest(S), t = [];
    t.push({ id: 'score', kind: 'int', v: Math.round(m.score || 0) });
    if (!inf) t.push({ id: 'cleared', kind: 'frac', v: solved, of: m.turns || null });
    t.push({ id: 'streak', kind: 'int', v: m.bestStreak || 0 });
    if (S.apm > 0) t.push({ id: 'apm', kind: 'rate', v: S.apm });
    if (fast != null) t.push({ id: 'fastest', kind: 'sec', v: fast });
    return { tiles: t, cleared: solved, ornament: ornament(m), medal: inf ? null : medal(m), damage: damageOf(S), relics: Object.assign({}, S.relics || {}) };
  }

  // ---- v6 medal: the RELIC part of a run's score (pure). Each relic's run delta is normalized by its level step (Dota relics: the
  // items_game per-level value; trainer relics: their tier I threshold), capped at RELIC_CAP levels per run, x its weight (js/data/relics.js) x RELIC_K.
  // e.g. 25000 Alacrity damage = 1 level x1 = 100; 3 Sun Strike kills = 3/15 level x3 = 60; 3 Tornado kills = 1 level x3 = 300 (the cap).
  const RELIC_K = 100, RELIC_CAP = 1;
  function relicScore(rel) {
    const Rd = IT.RELICS, parts = [];
    let score = 0;
    if (!Rd || !rel) return { score: 0, parts };
    for (const r of Rd.LIST) {
      const v = rel[r.id] || 0, unit = r.step || r.tiers[0];
      if (!(v > 0) || !(unit > 0) || r.weight === 0) continue;   // weight 0 = tracked only
      const lv = Math.min(RELIC_CAP, v / unit), pts = lv * (r.weight || 1) * RELIC_K;
      score += pts; parts.push({ id: r.id, v, lv: round(lv), pts: Math.round(pts) });
    }
    parts.sort((a, b) => b.pts - a.pts);
    return { score: Math.round(score), parts };
  }

  IT.StatsCollector = Object.assign(IT.StatsCollector || {}, { create, merge, blank, curated, ornament, medal, damageOf, medalKey, relicScore, RELIC_K, RELIC_CAP });
  IT.StatsCollector.hooks = IT.StatsCollector.hooks || {};
  IT.World.system('statsCollector', 90, (w, dt) => { if (w._stats) w._stats.sys(w, dt); });
})(typeof window !== 'undefined' ? window : globalThis);
