// Status effects on entities: add/remove/query + derived capability flags. Pure. See CONTRACT.md.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const DISABLE = { stun: 1, frozen: 1, hex: 1, lift: 1 };   // can't act at all (hex: can move, can't cast/attack; see below)
  const CLEARS_ORDERS = { stun: 1, frozen: 1, hex: 1, lift: 1 };
  // Statuses that magic immunity (BKB) blocks when applied by an enemy, unless opts.pierce.
  const MAGIC = { stun: 1, frozen: 1, hex: 1, lift: 1, root: 1, slow: 1, disarm: 1, silence: 1, coldsnap: 1, knockback: 1, atosRoot: 1 };

  function find(e, type) { for (const s of e.statuses) if (s.type === type) return s; return null; }
  function has(e, type) { return !!find(e, type); }

  // Adds or refreshes (longer duration wins; data replaced). Returns the status or null if blocked.
  function add(w, e, type, dur, opts) {
    opts = opts || {};
    const enemy = opts.src != null && w.get(opts.src) && w.get(opts.src).team !== e.team;
    if (enemy && MAGIC[type] && has(e, 'magicImmune') && !opts.pierce) {
      w.emit('fail', { unit: e.id, reason: 'immune', status: type, ability: opts.ability });
      return null;
    }
    if (has(e, 'lift') && type !== 'lift' && enemy && !opts.pierce) return null;   // cyclone: invulnerable
    let s = find(e, type);
    const until = w.t + dur;
    if (s) { s.until = Math.max(s.until, until); if (opts.data) s.data = opts.data; s.src = opts.src; s.ability = opts.ability; }
    else { s = { type, until, src: opts.src, ability: opts.ability, data: opts.data || {} }; e.statuses.push(s); }
    if (CLEARS_ORDERS[type]) clearOrders(w, e);
    w.emit('status', { target: e.id, status: type, dur, src: opts.src, ability: opts.ability });
    return s;
  }

  function remove(w, e, type) {
    const i = e.statuses.findIndex(s => s.type === type);
    if (i < 0) return;
    e.statuses.splice(i, 1);
    w.emit('statusEnd', { target: e.id, status: type });
  }

  function clearOrders(w, e) {
    if (has(e, 'channel')) {
      const ch = find(e, 'channel');
      remove(w, e, 'channel');
      const d = ch.data && ch.data.ability && IT.Abilities && IT.Abilities.get(ch.data.ability);
      if (d && d.channelEnd) d.channelEnd(w, e, ch.data.order, true);
    }
    if (e.orders.length) { for (const o of e.orders) w.emit('orderDone', { unit: e.id, order: o, ok: false }); e.orders.length = 0; }
    e.path.length = 0;
  }

  const canAct = e => !(has(e, 'stun') || has(e, 'frozen') || has(e, 'lift'));
  const canMove = e => canAct(e) && !has(e, 'root') && !has(e, 'atosRoot');
  const canCast = e => canAct(e) && !has(e, 'silence') && !has(e, 'hex');
  const canAttack = e => canAct(e) && !has(e, 'disarm') && !has(e, 'hex');
  // move slow fraction 0..1 (strongest slow wins), hex sets base ms to 100 in hero/units
  const slowPct = e => { let m = 0; for (const s of e.statuses) if (s.type === 'slow' && s.data && s.data.pct > m) m = s.data.pct; return m; };

  // Expire statuses each tick.
  IT.World.system('statuses', 50, (w) => {
    for (const e of w.ents) {
      if (e.dead || !e.statuses.length) continue;
      for (let i = e.statuses.length - 1; i >= 0; i--) {
        const s = e.statuses[i];
        if (s.until <= w.t + 1e-9) { e.statuses.splice(i, 1); w.emit('statusEnd', { target: e.id, status: s.type }); }
      }
    }
  });

  IT.Status = { has, find, add, remove, clearOrders, canAct, canMove, canCast, canAttack, slowPct, MAGIC, DISABLE };
})(typeof window !== 'undefined' ? window : globalThis);
