// Damage pipeline, heal/mana helpers, knockback/drag. Pure. See CONTRACT.md.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};

  // Armor -> physical damage multiplier (negative armor amplifies).
  function armorMult(a) { return 1 - 0.06 * a / (1 + 0.06 * Math.abs(a)); }

  // damage(w, {src, target, ability, type, amount, flags:{pierce, allowLifted}}) -> dealt
  // `target` may be an entity or an id; `src` an entity or id (events carry ids).
  function damage(w, o) {
    const t = typeof o.target === 'object' ? o.target : w.get(o.target);
    if (!t || t.dead) return 0;
    const flags = o.flags || {};
    const type = o.type || 'physical';
    const raw = Math.max(0, o.amount || 0);
    const Sx = IT.Status;
    let dealt = raw;
    if (Sx.has(t, 'lift') && !flags.allowLifted) dealt = 0;
    else if (type === 'physical') dealt = raw * armorMult(t.armor || 0);
    else if (type === 'magical') dealt = Sx.has(t, 'magicImmune') && !flags.pierce ? 0 : raw * (1 - (t.magicRes || 0));
    const srcId = o.src && typeof o.src === 'object' ? o.src.id : o.src;
    t.hp -= dealt;
    w.emit('damage', { src: srcId, target: t.id, ability: o.ability, dmgType: type, raw, dealt, prevented: raw - dealt });
    if (t.kind === 'dummy') {
      const k = (IT.GAME && IT.GAME.DUMMY.refillBelow) || 0.25;
      if (t.hp < t.maxHp * k) { t.hp = t.maxHp; t.mana = t.maxMana; w.emit('refill', { unit: t.id }); }
    } else if (t.kind === 'hero' && t.hp <= 0) {
      w.emit('heroDown', { unit: t.id });
      t.hp = t.maxHp; t.mana = t.maxMana;
    }
    return dealt;
  }

  function heal(w, e, amount) {
    const before = e.hp;
    e.hp = Math.min(e.maxHp, e.hp + Math.max(0, amount));
    return e.hp - before;
  }
  function restoreMana(e, amount) {
    const before = e.mana;
    e.mana = Math.min(e.maxMana, e.mana + Math.max(0, amount));
    return e.mana - before;
  }
  // Burns up to `amount` of the target's current mana; returns the amount burned. BKB blocks unless flags.pierce.
  function manaBurn(w, src, target, amount, flags) {
    if (IT.Status.has(target, 'magicImmune') && !(flags && flags.pierce)) return 0;
    const burned = Math.max(0, Math.min(target.mana, amount));
    target.mana -= burned;
    return burned;
  }

  // Moves e to (nx, ny) through nav sliding when available. Returns false if blocked entirely.
  function moveTo(w, e, nx, ny) {
    if (w.map && IT.Nav && IT.Nav.slide) {
      const r = IT.Nav.slide(w.map, e, nx, ny);
      if (r && r.x != null) { e.x = r.x; e.y = r.y; return true; }
    }
    if (!w.map || !w.map.walkable || w.map.walkable(nx, ny)) { e.x = nx; e.y = ny; return true; }
    return false;
  }

  // Knockback: displace by (dx,dy) over dur seconds.
  function push(w, e, dx, dy, dur) {
    dur = Math.max(dur, w.dt);
    IT.Status.clearOrders(w, e);
    return IT.Status.add(w, e, 'knockback', dur, { data: { vx: dx / dur, vy: dy / dur } });
  }
  // Drag toward a point at `speed` units/s (EMP shard pull). Ends on arrival.
  function drag(w, e, toX, toY, speed) {
    const d = Math.hypot(toX - e.x, toY - e.y);
    const dur = Math.max(d / Math.max(speed, 1), w.dt);
    IT.Status.clearOrders(w, e);
    return IT.Status.add(w, e, 'knockback', dur, { data: { tx: toX, ty: toY, speed } });
  }

  IT.World.system('knockback', 25, (w, dt) => {
    for (const e of w.ents) {
      if (e.dead || !e.statuses.length) continue;
      const s = IT.Status.find(e, 'knockback');
      if (!s) continue;
      const d = s.data || {};
      if (d.tx != null) {
        const dx = d.tx - e.x, dy = d.ty - e.y, dist = Math.hypot(dx, dy), step = Math.min(d.speed * dt, dist);
        if (dist < 1e-6) { IT.Status.remove(w, e, 'knockback'); continue; }
        const ok = moveTo(w, e, e.x + dx / dist * step, e.y + dy / dist * step);
        if (!ok || step >= dist) IT.Status.remove(w, e, 'knockback');
      } else {
        const f = Math.min(dt, s.until - w.t);
        if (f > 1e-9) moveTo(w, e, e.x + (d.vx || 0) * f, e.y + (d.vy || 0) * f);
      }
    }
  });

  IT.Combat = { armorMult, damage, heal, restoreMana, manaBurn, push, drag, moveTo };
})(typeof window !== 'undefined' ? window : globalThis);
