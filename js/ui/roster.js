// Free Play side-pane logic (v6 items 21 + 33), pure / headless-testable (no DOM at load):
//   IT.UI.Roster  enemies and dummies of the Free Play world: caps (5 enemies, 3 dummies), spawn / edit / remove, skin lists + ownership
//                 (IT.Shop.owned when the shop is loaded), the time-of-day helpers of the pane (Day / Night / Cycle + a slider)
//   IT.UI.Guide   the pinned combo guide strip model: toggle / swap / unpin, step tracker, lap counter. Never touches w.combo / w.ranked.
// An entity belongs to the roster when it carries e.ros = { kind:'enemy'|'dummy', skin, tier, ord }.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  IT.UI = IT.UI || {};

  // ---------------------------------------------------------------- roster
  const MAX = { enemy: 5, dummy: 3 };
  const GM = () => IT.GAME || {};
  const owned = (skin, kind) => (IT.Shop && IT.Shop.owned ? !!IT.Shop.owned(skin, kind) : true);
  const skinIds = kind => (kind === 'dummy' ? GM().DUMMY_SKINS : GM().SKINS) || [];
  const skinName = (skin, kind) => ((kind === 'dummy' ? GM().DUMMY_SKIN_NAMES : GM().SKIN_NAMES) || {})[skin] || skin;
  // [{ id, name, locked }] for a skin picker (locked = not owned: drawn as a blacked-out silhouette, cannot be picked)
  const skins = kind => skinIds(kind).map(id => ({ id, name: skinName(id, kind), locked: !owned(id, kind) }));

  const all = w => (w && w.ents ? w.ents.filter(e => e && e.ros && !e.dead) : []);
  const list = (w, kind) => all(w).filter(e => e.ros.kind === kind).sort((a, b) => a.ros.ord - b.ros.ord);
  const count = (w, kind) => list(w, kind).length;
  const canAdd = (w, kind) => count(w, kind) < (MAX[kind] || 0);
  let ordN = 0;

  // first owned skin not worn yet by another row, else the first owned one
  function nextSkin(w, kind) {
    const used = list(w, kind).map(e => e.ros.skin), ok = skins(kind).filter(s => !s.locked).map(s => s.id);
    return ok.find(s => used.indexOf(s) < 0) || ok[0] || skinIds(kind)[0];
  }
  function defTier(o) {
    const t = IT.DIFFICULTY && IT.DIFFICULTY.migrate ? IT.DIFFICULTY.migrate(o && o.tier) : (o && o.tier);
    return IT.DIFFICULTY && IT.DIFFICULTY.order.indexOf(t) >= 0 ? t : 'common';
  }
  const walkable = (w, x, y) => !(w.map && w.map.walkable) || w.map.walkable(x, y);

  // spawn a roster unit at (x, y). o = { skin, tier, items:[ids], ord }. Returns the entity, or null (cap reached / not walkable).
  function spawn(w, kind, x, y, o) {
    o = o || {};
    if (!MAX[kind] || !canAdd(w, kind) || !walkable(w, x, y)) return null;
    let skin = o.skin;
    if (skinIds(kind).indexOf(skin) < 0 || !owned(skin, kind)) skin = nextSkin(w, kind);
    const ord = o.ord != null ? o.ord : ++ordN;
    let e;
    if (kind === 'enemy') {
      const tier = defTier(o), EC = IT.EnemyCard, items = Array.isArray(o.items) ? o.items : [];
      const nth = list(w, 'enemy').filter(u => u.ros.skin === skin).length;
      const spec = EC.spec({ count: 1, items, list: [{ skin, behavior: 'stationary', tier, items: items.length > 0 }] }, 0, x, y, skin, nth);
      e = IT.Units.spawnEnemy(w, spec);
      e.ros = { kind, skin, tier, ord, items: items.slice(), hx: o.hx != null ? o.hx : x, hy: o.hy != null ? o.hy : y };
    } else {
      e = IT.Units.spawnDummy(w, { x, y, preset: 'training', skin });
      e.ros = { kind, skin, tier: null, ord, items: [], hx: o.hx != null ? o.hx : x, hy: o.hy != null ? o.hy : y };
    }
    return e;
  }
  function remove(w, e) {
    if (!w || !e) return false;
    if (IT.Input && IT.Input.selected === e.id) IT.Input.selected = null;
    w.remove(e);
    return true;
  }
  // change a row's skin / tier. Dummies change in place; an enemy is re-spawned on the same spot (stats follow the new tier). Returns the live entity.
  function edit(w, e, patch) {
    if (!e || !e.ros) return e;
    const kind = e.ros.kind;
    if (patch.skin != null && (skinIds(kind).indexOf(patch.skin) < 0 || !owned(patch.skin, kind))) patch = Object.assign({}, patch, { skin: undefined });
    const skin = patch.skin || e.ros.skin;
    if (kind === 'dummy') {
      e.ros.skin = skin; e.skin = skin; e.name = skinName(skin, 'dummy');
      return e;
    }
    const tier = patch.tier != null ? defTier(patch) : e.ros.tier;
    if (skin === e.ros.skin && tier === e.ros.tier) return e;
    const x = e.x, y = e.y, ord = e.ros.ord, items = e.ros.items || [], id = e.id, sel = IT.Input && IT.Input.selected === id;
    w.remove(e);
    const n = spawn(w, 'enemy', x, y, { skin, tier, items, ord, hx: e.ros.hx, hy: e.ros.hy });
    if (n && sel && IT.Input) IT.Input.selected = n.id;
    return n;
  }

  // "Reset targets": every roster unit back to the spot it was placed on, full health / mana, no statuses, no orders. Returns how many.
  function resetAll(w) {
    let n = 0;
    for (const d of all(w)) {
      d.x = d.ros.hx; d.y = d.ros.hy; d.hp = d.maxHp; d.mana = d.maxMana;
      if (d.orders) d.orders.length = 0;
      if (d.path) d.path.length = 0;
      if (IT.Status) for (const st of (d.statuses || []).slice()) IT.Status.remove(w, d, st.type);
      n++;
    }
    return n;
  }

  // ---------------------------------------------------------------- time of day
  const CYC = () => (IT.DayNight && IT.DayNight.CYCLE) || 300;
  const todFull = () => 2 * CYC();
  // position in the full 600 s day: 0..CYCLE light, CYCLE..2 CYCLE dark. A fixed Day / Night shows the middle of its half.
  function todPos(w) {
    const d = w && w.tod; if (!d) return 0;
    if (!isFinite(d.len)) return d.night ? CYC() * 1.5 : CYC() * 0.5;
    return Math.max(0, Math.min(todFull() - 1, (d.night ? CYC() : 0) + d.t));
  }
  const todMode = w => (w && w.tod && w.tod.mode) || 'day';
  function todSetMode(w, mode) { return IT.DayNight.set(w, mode); }
  // slider: jump to `pos` of the 600 s day and keep cycling from there (mode 'cycle')
  function todSetPos(w, pos) {
    const DN = IT.DayNight, D = DN.set(w, 'cycle'), C = CYC();
    pos = Math.max(0, Math.min(todFull() - 1, +pos || 0));
    D.night = pos >= C; D.t = pos % C; D.len = C; D.fade = 0;
    DN.apply(w);
    if (IT.Vision && IT.Vision.update && w.map) { IT.Vision.update(w); w._visT = w.t; }
    return D;
  }

  // ---------------------------------------------------------------- "grant items / Aghanim" for a followed combo
  // Same rule as IT.Combo's start-time grant (free slots first, then ones the combo does not need; scepter / shard added to the loadout), but it
  // never starts a combo. Returns a record for revokeGrant, or null when the hero already holds everything.
  function grantFor(w, cb) {
    const hero = w && w.hero, C = IT.Combo;
    if (!hero || !C || !cb) return null;
    const m = C.missing(w.loadout, cb);
    if (!m.items.length && !m.scepter && !m.shard) return null;
    const g = { items: [], replaced: {}, loadout: JSON.parse(JSON.stringify(w.loadout)) }, needed = new Set(C.itemNeeds(cb));
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
      if (m.shard) { lo.shard = true; if (!lo.shardSpell) { const s0 = (cb.steps || []).find(q => ['ghostwalk', 'emp', 'sunstrike'].includes(q.ability)); lo.shardSpell = s0 ? s0.ability : 'emp'; } }
      IT.Hero.refresh(w, hero, lo);
    }
    return g;
  }
  function revokeGrant(w, g) {
    const hero = w && w.hero;
    if (!g || !hero) return;
    for (const id of g.items) { const i = hero.items.findIndex(s => s && s.id === id); if (i >= 0) hero.items[i] = g.replaced[id] ? { id: g.replaced[id], cd: 0, charges: 0 } : null; }
    IT.Hero.refresh(w, hero, g.loadout);
  }

  IT.UI.Roster = { MAX, skins, skinName, owned, list, count, canAdd, nextSkin, defTier, spawn, remove, edit, resetAll, all, todPos, todMode, todSetMode, todSetPos, todFull, grantFor, revokeGrant };

  // ---------------------------------------------------------------- pinned combo guide strip (item 33)
  const HOLD = 0.9;   // s the finished chain stays lit (with the check mark) before it resets to step 1
  // ordered action list of a combo definition: [{ k:'spell'|'item'|'attack'|'move'|'pos', id? }]
  function actsOf(def) {
    const SO = GM().SPELL_ORBS || {}, out = [];
    for (const s of (def && def.steps) || []) {
      if (s.ability) out.push({ k: SO[s.ability] ? 'spell' : 'item', id: s.ability });
      else if (s.type === 'attack') out.push({ k: 'attack' });
      else if (s.type === 'move') out.push({ k: 'move' });
      else if (s.type === 'position') out.push({ k: 'pos' });
    }
    return out;
  }
  // model(stateFn): stateFn() -> { orbs, slots, items, preinvoked } of the hero (used to plan the presses at every (re)start)
  function guide(stateFn) {
    const M = { id: null, def: null, tr: null, laps: 0, hold: 0, rev: 0, acts: [] };
    const HS = () => IT.HudSteps;
    function restart() {
      M.tr = M.acts.length ? HS().tracker(HS().plan(M.acts, stateFn ? stateFn() : {})) : null;
      M.hold = 0;
    }
    // click on a combo: pin it, swap to it, or (same one again) unpin. Returns 'pin' | 'swap' | 'unpin'.
    M.toggle = def => {
      M.rev++;
      if (!def || (M.id && def.id === M.id)) { M.id = null; M.def = null; M.acts = []; M.tr = null; M.laps = 0; M.hold = 0; return 'unpin'; }
      const how = M.id ? 'swap' : 'pin';
      M.id = def.id; M.def = def; M.acts = actsOf(def); M.laps = 0; restart();
      return how;
    };
    M.clear = () => { if (M.id) M.toggle(null); };
    M.active = () => !!M.id;
    M.feed = ev => { if (M.tr && !M.hold) { M.tr.feed(ev); if (M.tr.finished()) { M.laps++; M.hold = HOLD; M.flash = true; } } };
    // dt seconds: after the hold the chain resets to step 1. Returns true when it just reset.
    M.tick = dt => {
      if (!M.hold) return false;
      M.hold -= dt;
      if (M.hold > 0) return false;
      restart(); return true;
    };
    M.states = () => (M.tr ? M.tr.states() : []);
    return M;
  }
  IT.UI.Guide = { HOLD, actsOf, create: guide };
})(typeof window !== 'undefined' ? window : globalThis);
