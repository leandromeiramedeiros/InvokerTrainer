// Free Play enemy card (pure, no DOM): per-enemy config -> spawnEnemy specs. Used by the loadout screen and js/main.js.
// card = { count 0..5, items:[ids] (the item set an enemy carries when its row has items on),
//          list:[ { skin:'auto'|skin id, behavior, tier:'ian'|'easy'|'common'|'hard'|'bambam', items:bool } x MAX ] }
// Row i configures the i-th enemy (spawned or placed). 'auto' skins rotate through IT.GAME.SKINS starting at the dummy skin
// (like js/sim/ranked.js apply), so up to 3 foes wear different NPC hero skins; a 4th/5th repeats a skin with a numbered name.
// Tier stats (js/data/difficulty.js): hp = ENEMY.hp x hpMul, armor + armorAdd, awareness, reaction, telegraph, dmgMul, fights.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const MAX = 5;                 // enemies per card
  const WORLD_CAP = 8;           // alive enemies in a Free Play world (placing stops there)
  const BEHAVIORS = ['stationary', 'wander', 'escape', 'disable_escape', 'defend'];
  const AUTO = 'auto';

  const tiers = () => (IT.DIFFICULTY && IT.DIFFICULTY.order) || ['ian', 'easy', 'common', 'hard', 'bambam'];
  const tierOk = id => tiers().indexOf(id) >= 0;
  const skins = () => (IT.GAME && IT.GAME.SKINS) || [];

  function normRow(r, legacy) {
    r = r || {};
    const t = IT.DIFFICULTY && IT.DIFFICULTY.migrate ? IT.DIFFICULTY.migrate(r.tier) : r.tier;
    return {
      skin: r.skin === AUTO || skins().indexOf(r.skin) >= 0 ? r.skin : AUTO,
      behavior: BEHAVIORS.indexOf(r.behavior) >= 0 ? r.behavior : (BEHAVIORS.indexOf(legacy) >= 0 ? legacy : 'stationary'),
      tier: tierOk(t) ? t : 'common',
      items: r.items !== false && r.items !== 0,
    };
  }

  function normalize(c) {
    c = c || {};
    const EI = (IT.GAME && IT.GAME.ENEMY_ITEMS) || [];
    const list = [];
    for (let i = 0; i < MAX; i++) list.push(normRow(Array.isArray(c.list) ? c.list[i] : null, c.behavior));   // c.behavior: pre-v5 saved card
    return {
      count: Math.max(0, Math.min(MAX, Math.round(Number(c.count)) || 0)),
      items: Array.isArray(c.items) ? c.items.filter((id, i, a) => EI.indexOf(id) >= 0 && a.indexOf(id) === i) : [],
      list,
    };
  }

  // spawnEnemy options for the enemy wearing row `i` of the card, at (x, y). rot = position in the skin rotation (default i);
  // nth = how many enemies already use the same skin (name suffix, default derived from rot)
  function spec(card, i, x, y, dummySkin, nth, rot) {
    rot = rot == null ? i | 0 : rot | 0;
    const c = normalize(card), r = c.list[((i | 0) % MAX + MAX) % MAX], GM = IT.GAME, E = GM.ENEMY, SK = GM.SKINS, df = IT.DIFFICULTY.get(r.tier);
    const s0 = Math.max(0, SK.indexOf(dummySkin));
    const skin = r.skin === AUTO ? SK[(s0 + rot) % SK.length] : r.skin;
    const lap = nth != null ? nth : r.skin === AUTO ? Math.floor(rot / SK.length) : 0;
    return {
      x, y, skin, name: GM.SKIN_NAMES[skin] + (lap ? ' ' + (lap + 1) : ''),
      hp: Math.round(E.hp * (df.hpMul != null ? df.hpMul : 1)), armor: E.armor + (df.armorAdd || 0),
      behavior: r.behavior, items: r.items ? c.items.slice() : [],
      telegraph: df.telegraph, awareness: df.awareness, notice: df.notice, reaction: df.reaction, dmgMul: df.dmgMul, fights: !!df.fights,
      tier: r.tier,
      exec: df.exec || null, msMul: df.msMul || 1,   // I9: the tier's EXECUTION (item chance, prediction, jitter...) and move-speed multiplier, as in ranked.js apply
    };
  }

  // spawn one spec into `w` and apply the tier execution (spawnEnemy ignores exec / msMul): e.exec gates items / blink by chance (units.js execOf), e.ms x msMul
  function build(w, s) {
    const e = IT.Units.spawnEnemy(w, s);
    if (e) {
      e.exec = s.exec || null;
      if (s.msMul && s.msMul !== 1) { e.msMul = s.msMul; e.ms = Math.round(e.ms * s.msMul); if (e.base) e.base.ms = e.ms; }
    }
    return e;
  }

  // walkable spots for n enemies around `base` (the hero spawn): the map's derived arenas (map.spawns.arenas, outside Radiant tower range)
  // closest to ~800 units away, >= 320 apart; a ring around the hero where the map has none
  function spots(w, n, base) {
    const out = [], map = w.map;
    const near = (x, y) => {
      if (!map.walkable(x, y) && IT.Nav && IT.Nav.nearestWalkable) { const p = IT.Nav.nearestWalkable(map, x, y); if (p) return { x: p.x, y: p.y }; }
      return { x, y };
    };
    if (IT.Ranked && IT.Ranked.arenas && map.spawns && map.spawns.arenas && map.spawns.arenas.length) {
      let l = [];
      try { l = IT.Ranked.arenas(w, { where: [], not: ['rtower'], d: [350, 1300] }, base); } catch (e) { l = []; }
      for (const a of l) {
        if (out.length >= n) break;
        if (Math.hypot(a.x - base.x, a.y - base.y) < 300) continue;
        if (out.some(p => Math.hypot(p.x - a.x, p.y - a.y) < 320)) continue;
        out.push(near(a.x, a.y));
      }
    }
    for (let k = out.length; k < n; k++) {   // ring fallback (also tops up a map with few arenas)
      const ang = -Math.PI / 6 + k * (Math.PI * 2 / Math.max(3, n)), r = 380 + (k % 2) * 90;
      out.push(near(base.x + Math.cos(ang) * r, base.y + Math.sin(ang) * r));
    }
    return out;
  }

  // all specs for the card's count at the derived spots
  function specs(card, w, base, dummySkin) {
    const c = normalize(card), n = c.count, sp = spots(w, n, base), out = [];
    for (let i = 0; i < n; i++) {
      let s = spec(c, i, sp[i].x, sp[i].y, dummySkin);
      const nth = out.filter(o => o.skin === s.skin).length;   // only 3 NPC skins: a repeat gets a numbered name ("Pedro 2")
      if (nth) s = spec(c, i, sp[i].x, sp[i].y, dummySkin, nth);
      out.push(s);
    }
    return out;
  }

  // spawn the card's enemies into world `w` (Free Play). Returns the entities.
  function spawnAll(card, w, base, dummySkin) {
    return specs(card, w, base, dummySkin).map(s => build(w, s));
  }

  // place the k-th enemy of the session at (x, y): card row k % max(count,1); null when the point is not walkable or the world is full
  function place(card, w, k, x, y, dummySkin) {
    if (!w.map.walkable(x, y)) return null;
    if (w.query(e => e.kind === 'enemy' && !e.refill).length >= WORLD_CAP) return null;
    const c = normalize(card), i = k % Math.max(1, c.count), s0 = spec(c, i, x, y, dummySkin, null, k);
    const nth = w.query(e => e.kind === 'enemy' && !e.refill && e.skin === s0.skin).length;
    return build(w, nth ? spec(c, i, x, y, dummySkin, nth, k) : s0);
  }

  // scenario level 1..10 -> the tier that level is aimed at (2 levels per tier): the badge on the sandbox scenario chips
  function tierOfLevel(level) {
    const o = tiers();
    return o[Math.max(0, Math.min(o.length - 1, Math.floor(((Number(level) || 1) - 1) / 2)))];
  }

  IT.EnemyCard = { tierOfLevel, MAX, WORLD_CAP, BEHAVIORS, AUTO, normalize, spec, build, spots, specs, spawnAll, place };
})(typeof window !== 'undefined' ? window : globalThis);
