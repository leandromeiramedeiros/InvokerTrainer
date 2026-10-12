// Loadout: normalize / validate / ctx. Pure. See CONTRACT.md.
// shape: { heroLevel, orbs:{quas,wex,exort}, talents:[], scepter, scepterOrb, shard, shardSpell, items:[ids<=6], skin, preset, mode }
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const BOOTS = ['boots', 'travels'];
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
      items: Array.isArray(l.items) ? l.items.filter(x => typeof x === 'string').slice(0, MAX_ITEMS) : [],
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

  IT.Loadout = { default: def, normalize, validate, fixPreinvoked, ctx: l => IT.Values.ctx(l), MAX_ITEMS, BOOTS, SHARD_SPELLS };
})(typeof window !== 'undefined' ? window : globalThis);
