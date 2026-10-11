// Ability registry (spells + items) and the shared castability check. Pure. See CONTRACT.md.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const defs = {};
  const SPELLS = ['coldsnap', 'ghostwalk', 'icewall', 'emp', 'tornado', 'alacrity', 'sunstrike', 'forgespirit', 'chaosmeteor', 'deafeningblast'];

  const V = () => IT.Values;
  const dflt = {
    range(w, c) { return this.dota ? V().castRange(this.dota, c.ctx || w.ctx) || 0 : 0; },
    castPoint(w, c) { return this.dota ? V().castPoint(this.dota, c.ctx || w.ctx) || 0 : 0; },
    manaCost(w, c) { return this.dota ? V().manaCost(this.dota, c.ctx || w.ctx) || 0 : 0; },
    cooldown(w, c) { return this.dota ? V().cooldown(this.dota, c.ctx || w.ctx) || 0 : 0; },
    filter(w, c, t) { return t && !t.dead && t.team !== c.team && t.kind !== 'thinker' && t.kind !== 'proj' && !IT.Status.has(t, 'lift') && (c.team !== 0 || !w.fog || t.visible); },
  };

  function def(id, d) {
    d.id = id;
    d.target = d.target || 'none';
    for (const k in dflt) if (!d[k]) d[k] = dflt[k];
    defs[id] = d;
    return d;
  }

  function get(id) { return defs[id]; }

  // Can `caster` use `id` now (ignoring range)? Returns null or a reason key.
  function check(w, caster, id, order) {
    const d = defs[id];
    if (!d) return 'unknown';
    if (d.kind === 'spell') {
      if (!caster.inv || !caster.inv.slots.includes(id)) return 'notInvoked';
      if (!IT.Status.canCast(caster)) return IT.Status.has(caster, 'silence') ? 'silenced' : 'disabled';
    } else {
      const it = caster.items && caster.items.find(s => s && s.id === id);
      if (!it) return 'noItem';
      if (!IT.Status.canAct(caster) || IT.Status.has(caster, 'hex')) return 'disabled';
    }
    if ((caster.cd && caster.cd[id] > 0)) return 'cooldown';
    if (caster.mana < d.manaCost(w, caster) - 1e-9) return 'mana';
    if (d.target === 'unit' && order) {
      const t = w.get(order.target);
      if (!t) return 'noTarget';
      if (!d.filter(w, caster, t)) return t.team !== caster.team && w.fog && caster.team === 0 && !t.visible ? 'targetHidden' : 'targetInvalid';
    }
    return null;
  }

  // Pay mana, start cooldown. Called by orders right before def.cast.
  function spend(w, caster, id) {
    const d = defs[id];
    caster.mana -= d.manaCost(w, caster);
    if (!caster.cd) caster.cd = {};
    caster.cd[id] = d.cooldown(w, caster);
  }

  IT.Abilities = { def, get, check, spend, defs, SPELLS };
})(typeof window !== 'undefined' ? window : globalThis);
