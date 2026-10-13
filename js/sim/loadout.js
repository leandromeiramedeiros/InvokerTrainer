// Loadout: normalize / validate / ctx. Pure. See CONTRACT.md.
// shape: { heroLevel, orbs:{quas,wex,exort}, talents:[], scepter, scepterOrb, shard, shardSpell, items:[exactly 6 entries: item id | null hole; slot n = hotkey n], skin, preset, mode }
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const BOOTS = ['travels', 'boots'];   // priority order: Travel replaces Speed (they never stack)
  const MAX_ITEMS = 6;
  const SHARD_SPELLS = ['ghostwalk', 'emp', 'sunstrike'];   // Aghanim's Shard: pick ONE upgraded spell

  function def() {
    const l = IT.RULES.autoLoadout(IT.RULES.maxHeroLevel, 'qe');
    return normalize(Object.assign(l, { items: [], skin: IT.GAME.SKINS[0], preset: 'standard', mode: 'free' }));
  }

  // Spells that can be handed to the hero already invoked (scenario `hero.preinvoked`), max 2, deduped, in slot order.
  function fixPreinvoked(p) {
    const ids = IT.Values.SPELL_IDS, out = [];
    if (typeof p === 'string') p = [p];
    for (const s of Array.isArray(p) ? p : []) if (typeof s === 'string' && ids[s] && !out.includes(s)) out.push(s);
    return out.slice(0, 2);
  }

  // Auto-fixes anything illegal (plan G2-G4): orbs clamped to the gate (orb level N needs hero level >= 2N-1 until lvl 13) and
  // to the single point pool (unspent points just bank), max 7 per orb; talents limited to what the level allows AND to the pool
  // points the orbs left over (1 point each). A loadout without a talents list gets all 8 at level 30.
  // v6 #37: boots do not stack -- Boots of Travel present => Boots of Speed is dropped (keeps the first of any extra boots).
  // fixItems: PACKED legacy form (ids only, no holes). fixSlots: the stored form -- exactly MAX_ITEMS entries (id | null), holes kept in place;
  // old packed saves / scenario kits (fewer than 6, no nulls) are padded with nulls and keep their order.
  function fixItems(items) {
    const a = Array.isArray(items) ? items.filter(x => typeof x === 'string') : [];
    const keep = BOOTS.find(b => a.includes(b));
    let seen = false;
    return a.filter(x => { if (!BOOTS.includes(x)) return true; if (x !== keep || seen) return false; seen = true; return true; }).slice(0, MAX_ITEMS);
  }
  function fixSlots(items) {
    let a = Array.isArray(items) ? items : [];
    if (a.length > MAX_ITEMS) a = a.filter(x => typeof x === 'string').slice(0, MAX_ITEMS);   // oversized list: drop holes first, then cut
    const out = [];
    for (let i = 0; i < MAX_ITEMS; i++) out.push(typeof a[i] === 'string' && a[i] ? a[i] : null);
    const keep = BOOTS.find(b => out.includes(b));
    let seen = false;
    return out.map(x => { if (!x || !BOOTS.includes(x)) return x; if (x !== keep || seen) return null; seen = true; return x; });
  }
  // Pure slot edits on a 6-entry list (return a NEW list, or null when nothing changes). Used by the loadout screen.
  const isBoots = id => BOOTS.includes(id);
  function moveSlot(items, from, to) {   // empty target: move (hole left behind); full target: swap
    const a = fixSlots(items);
    if (from === to || from < 0 || to < 0 || from >= MAX_ITEMS || to >= MAX_ITEMS || !a[from]) return null;
    const x = a[from]; a[from] = a[to]; a[to] = x; return a;
  }
  function clearSlot(items, i) {   // remove leaves a hole, never packs
    const a = fixSlots(items);
    if (i < 0 || i >= MAX_ITEMS || !a[i]) return null;
    a[i] = null; return a;
  }
  // at: slot to drop onto (replaces what is there) or null/undefined = first empty slot. Boots never stack (the new pair replaces the old).
  function placeItem(items, id, at) {
    const a = fixSlots(items);
    if (a.includes(id)) return null;
    if (isBoots(id)) for (let i = 0; i < a.length; i++) if (isBoots(a[i])) a[i] = null;
    const k = at != null && at >= 0 && at < MAX_ITEMS ? at : a.indexOf(null);
    if (k < 0) return null;
    a[k] = id; return a;
  }
  function normalize(l) {
    l = l || {};
    const lvl = Math.max(1, Math.min(IT.RULES.maxHeroLevel, Math.round(Number(l.heroLevel != null ? l.heroLevel : l.lvl != null ? l.lvl : IT.RULES.maxHeroLevel)) || 1));
    const o = IT.RULES.fixOrbs(lvl, l.orbs || { quas: 7, wex: 7, exort: 7 });   // no orbs given -> best legal build for the level
    const room = IT.RULES.pointsAvailable(lvl) - IT.RULES.orbsSpent({ orbs: o });
    let scepterOrb = l.scepterOrb || null;
    let scepter = !!l.scepter;
    if (typeof l.scepter === 'string') { scepter = true; scepterOrb = scepterOrb || l.scepter; }
    return {
      heroLevel: lvl,
      orbs: { quas: o.quas, wex: o.wex, exort: o.exort },
      talents: IT.RULES.fixTalents(lvl, l.talents, room),
      scepter, scepterOrb: scepter ? scepterOrb : null,
      shard: !!l.shard || SHARD_SPELLS.includes(l.shard),
      shardSpell: (l.shard || l.shardSpell) ? (SHARD_SPELLS.includes(l.shardSpell) ? l.shardSpell : SHARD_SPELLS.includes(l.shard) ? l.shard : null) : null,
      items: fixSlots(l.items),
      skin: l.skin || IT.GAME.SKINS[0],
      preset: l.preset || 'standard',
      mode: l.mode || 'free',
      preinvoked: fixPreinvoked(l.preinvoked),
    };
  }

  function validate(l) {
    const r = IT.RULES.validate(l);
    const errors = r.errors.slice();
    if (l && l.shard && !SHARD_SPELLS.includes(l.shardSpell) && !SHARD_SPELLS.includes(l.shard)) errors.push('shard requires shardSpell');
    if (l && typeof l === 'object' && l.items != null) {
      if (!Array.isArray(l.items)) errors.push('items must be an array');
      else {
        if (l.items.length > MAX_ITEMS) errors.push('max ' + MAX_ITEMS + ' items');
        const ok = IT.GAME.ITEMS_MAIN.concat(IT.GAME.ITEMS_EXTRA);
        const seen = new Set();
        let boots = 0;
        for (const id of l.items) {
          if (id == null) continue;   // hole
          if (!ok.includes(id)) { errors.push('unknown item ' + id); continue; }
          if (seen.has(id)) errors.push('duplicate item ' + id);
          seen.add(id);
          if (BOOTS.includes(id)) boots++;
        }
        if (boots > 1) errors.push('at most one boots item');
      }
    }
    return { ok: errors.length === 0, errors };
  }

  IT.Loadout = { default: def, normalize, fixItems, fixSlots, moveSlot, clearSlot, placeItem, validate, fixPreinvoked, ctx: l => IT.Values.ctx(l), MAX_ITEMS, BOOTS, SHARD_SPELLS };
})(typeof window !== 'undefined' ? window : globalThis);
