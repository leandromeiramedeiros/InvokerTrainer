// Orbs + Invoke slot logic, cooldown ticking. Pure. Q/W/E/R never touch the order queue.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const NAME = { Q: 'quas', W: 'wex', E: 'exort' };

  function fail(w, hero, reason) { w.emit('fail', { unit: hero.id, reason }); return false; }
  function blocked(hero) {
    if (IT.Status.canCast(hero)) return null;
    return IT.Status.has(hero, 'silence') ? 'silenced' : 'disabled';
  }
  function level(hero, key) { const c = hero.ctx; return c ? c.eff[NAME[key]] : 0; }

  function recipeOf(orbs) {
    if (!orbs || orbs.length !== 3) return null;
    return IT.GAME.RECIPES[orbs.slice().sort().join('')] || null;
  }

  function orb(w, hero, key) {
    if (!hero || hero.dead || !NAME[key]) return false;
    const b = blocked(hero); if (b) return fail(w, hero, b);
    if (level(hero, key) < 1) return fail(w, hero, 'orbNotLearned');
    const orbs = hero.inv.orbs;
    orbs.push(key);
    if (orbs.length > 3) orbs.shift();
    w.emit('orb', { unit: hero.id, orb: key });
    return true;
  }

  function invoke(w, hero) {
    if (!hero || hero.dead) return false;
    const b = blocked(hero); if (b) return fail(w, hero, b);
    const inv = hero.inv;
    const spell = recipeOf(inv.orbs);
    if (!spell) return fail(w, hero, 'noRecipe');
    for (const k of new Set(inv.orbs)) if (level(hero, k) < 1) return fail(w, hero, 'orbNotLearned');
    if (inv.slots[0] === spell) return true;
    if (inv.slots[1] === spell) {
      inv.slots = [inv.slots[1], inv.slots[0]];
      w.emit('invoke', { unit: hero.id, spell, swapped: true });
      return true;
    }
    if (inv.invokeCd > 1e-9) return fail(w, hero, 'invokeCooldown');
    inv.slots = [spell, inv.slots[0]];
    inv.invokeCd = IT.Values.invokeCooldown(hero.ctx);
    w.emit('invoke', { unit: hero.id, spell, swapped: false });
    return true;
  }

  IT.World.system('cooldowns', 50, (w, dt) => {
    for (const e of w.ents) {
      if (e.dead) continue;
      if (e.cd) for (const k in e.cd) { if (e.cd[k] > 0) { e.cd[k] -= dt; if (e.cd[k] < 1e-9) e.cd[k] = 0; } }
      if (e.inv && e.inv.invokeCd > 0) { e.inv.invokeCd -= dt; if (e.inv.invokeCd < 1e-9) e.inv.invokeCd = 0; }
      if (e.items) for (const it of e.items) if (it) it.cd = e.cd && e.cd[it.id] > 0 ? e.cd[it.id] : 0;
    }
  });

  IT.Invoke = { orb, invoke, recipeOf };
})(typeof window !== 'undefined' ? window : globalThis);
