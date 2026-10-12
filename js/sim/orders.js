// Orders: issue/queue, decision (10), movement (20), attacks (30), anim (35). Pure. See CONTRACT.md.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const FACE = 0.2;
  const UNITS = { hero: 1, dummy: 1, enemy: 1, spirit: 1 };
  const S = () => IT.Status, A = () => IT.Abilities, U = () => IT.U;
  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  function fail(w, u, reason, ability) { w.emit('fail', { unit: u.id, reason, ability }); }

  function finish(w, u, o, ok, reason) {
    if (reason) fail(w, u, reason, o.ability);
    w.emit('orderDone', { unit: u.id, order: o, ok });
    if (u.orders[0] === o) u.orders.shift();
    u.path.length = 0; u._pg = null;
  }

  const STOP_ACQ_BLOCK = 0.2;   // idle auto-acquire is suppressed this long after Stop so the cancel is visible
  const NEAR_TARGET = 120;      // A3: a move this close (beyond the target's radius) to the unit we are attacking is absorbed, not a cancel
  const DEFER_POINT = 0.1;      // a cast this close to firing is not erased by a new (non-stop/hold) order; it finishes, the order follows
  const KNOWN = { move: 1, attack: 1, cast: 1, stop: 1, hold: 1 };
  const num = v => typeof v === 'number' && isFinite(v);

  // Cancels an attack wind-up without consuming the attack cooldown.
  function cancelWind(u) { if (u._wind) { u._wind = null; if (u.attack) u.attack.next = 0; } }

  function dropAll(w, u) {
    S().clearOrders(w, u);
    u._pg = null;
    cancelWind(u);
    if (u.attack) u.attack.target = null;
  }

  // Never silently rejects: every false return emits `fail` with a reason.
  function issue(w, u, order) {
    if (!u) return false;
    if (u.dead) { if (u.id != null) fail(w, u, 'dead'); return false; }
    // B4/E1: a spirit the player has taken over (issueGroup) is never reassigned by its AI (units.js tickSpirit has no player flag)
    if (u._playerCmd && !(order && order.player)) return false;
    const o = Object.assign({}, order); o.queued = !!order.queued;
    if (!KNOWN[o.type]) { fail(w, u, 'unknown'); return false; }
    if (!S().canAct(u)) { fail(w, u, 'disabled', o.ability); return false; }
    if (o.type === 'move' && !(num(o.x) && num(o.y))) { fail(w, u, 'badOrder'); return false; }
    if (o.type === 'attack') {
      if (o.target != null) { if (!w.get(o.target)) { fail(w, u, 'gone'); return false; } }
      else if (!(num(o.x) && num(o.y))) { fail(w, u, 'badOrder'); return false; }
    }
    if (o.type === 'cast') {
      const def = A().get(o.ability);
      if (!def) { fail(w, u, 'unknown', o.ability); return false; }
      // point spell given a unit target (e.g. Sun Strike on the hero = Cataclysm): aim at that unit
      if (def.target === 'point' && o.target != null && !(num(o.x) && num(o.y))) {
        const te = w.get(o.target);
        if (te) { o.x = te.x; o.y = te.y; }
      }
      if (def.target === 'point' && !(num(o.x) && num(o.y))) { fail(w, u, 'badOrder', o.ability); return false; }
      if (!o.queued) {
        const r = A().check(w, u, o.ability, o);
        if (r) { fail(w, u, r, o.ability); return false; }
      }
    }
    const head = u.orders[0] || null;
    // re-issuing the same move must not reset movement
    if (!o.queued && o.type === 'move' && u.orders.length === 1 && head.type === 'move' && Math.hypot(head.x - o.x, head.y - o.y) < 1e-6) {
      w.emit('order', { unit: u.id, order: o });
      return true;
    }
    // A3: spamming RMB on / next to the target (or A-click on the same point) must not restart the chase or the wind-up
    if (!o.queued && u.orders.length === 1 && head.type === 'attack') {
      let same = false;
      if (o.type === 'attack') same = o.target != null ? head.target === o.target : head.target == null && Math.hypot(head.x - o.x, head.y - o.y) < 1e-6;
      else if (o.type === 'move' && head.target != null) {
        const t = w.get(head.target);
        same = !!t && !t.dead && Math.hypot(o.x - t.x, o.y - t.y) <= t.radius + NEAR_TARGET;
      }
      if (same) { w.emit('order', { unit: u.id, order: o }); return true; }
    }
    let deferred = false;
    if (!o.queued) {
      const hd = head && head.type === 'cast' && head._ph === 'point' && head._t <= DEFER_POINT + 1e-9 ? A().get(head.ability) : null;
      if (hd && !hd.channel && o.type !== 'stop' && o.type !== 'hold') { u.orders.length = 1; deferred = true; }
      else if (o.type === 'move' && u._wind) {
        // A3: a move during the attack wind-up does not cancel the swing (only Stop/Hold/casts/other targets do): it lands, then we walk
        const wind = u._wind, nxt = u.attack.next;
        dropAll(w, u);
        wind.keep = true; u._wind = wind; u.attack.next = nxt;
      } else dropAll(w, u);
      if (o.type === 'stop') u._acqBlock = w.t + STOP_ACQ_BLOCK;
    } else if (head && head.type === 'hold') {   // any new order ends Hold
      w.emit('orderDone', { unit: u.id, order: head, ok: true });
      u.orders.shift();
    }
    w.emit('order', { unit: u.id, order: o });
    if (o.type === 'stop' && !o.queued) return true;
    u.orders.push(o);
    // ready casts (no walking / turning needed) fire right now, even mid-walk: later move spam can't erase them
    if (!o.queued && !deferred && o.type === 'cast' && u.orders[0] === o) step(w, u, o, 0);
    return true;
  }

  const current = u => u.orders[0] || null;
  function clear(w, u) { dropAll(w, u); }
  function waypoints(u) {
    const r = [];
    for (const o of u.orders) {
      if (o.type === 'stop' || o.type === 'hold') continue;
      const x = o._px != null ? o._px : o.x, y = o._py != null ? o._py : o.y;
      if (x == null || y == null) continue;
      r.push({ x, y, type: o.type });
    }
    return r;
  }

  function validTarget(w, u, t) {
    if (!t || t.dead) return 'gone';
    if (t.team === u.team || t.kind === 'thinker' || t.kind === 'proj' || S().has(t, 'lift')) return 'targetHidden';
    if (u.team === 0 && w.fog && !t.visible) return 'targetHidden';
    return null;
  }

  function acquire(w, u, range) {
    let best = null, bd = Infinity;
    for (const t of w.ents) {
      if (t.dead || !UNITS[t.kind] || !(t.hp > 0) || validTarget(w, u, t)) continue;
      const d = dist(u, t);
      if (d <= range && d < bd) { bd = d; best = t; }
    }
    return best;
  }

  // attack `t`: sets goal / wantAtk.
  function attackStep(w, u, t) {
    const at = u.attack, o = u.orders[0];
    if (o && o.type === 'attack' && o.target != null) { o._px = t.x; o._py = t.y; }   // attack-move keeps its destination as waypoint
    const rng = at.range + u.radius + t.radius, d = dist(u, t);
    if (d > rng + 1e-6) {
      u._goal = { x: t.x, y: t.y, stop: Math.max(0, rng - 2), unit: t.id };
      return;
    }
    at.target = t.id;
    if (!S().canAttack(u)) return;
    if (u._wind && u._wind.target === t.id) { u._wantAtk = t.id; return; }
    const diff = Math.abs(U().angDiff(u.facing, U().angle(u, t)));
    if (diff > FACE) { u._goal = { x: t.x, y: t.y, stop: Infinity, turnOnly: true }; return; }
    u._wantAtk = t.id;
  }

  function step(w, u, o, dt) {
    switch (o.type) {
      case 'stop':   // instant interrupt only: cancel wind-up (no cooldown spent), briefly pause idle auto-acquire
        cancelWind(u); if (u.attack) u.attack.target = null; u._acqBlock = w.t + STOP_ACQ_BLOCK;
        finish(w, u, o, true); return 'next';
      case 'hold':   // never attacks (no auto-acquire either) until any new order is issued
        cancelWind(u); if (u.attack) u.attack.target = null;
        return 'wait';
      case 'move': {
        if (dist(u, o) <= 1) { finish(w, u, o, true); return 'next'; }
        u._goal = { x: o.x, y: o.y, stop: 0 };
        return 'wait';
      }
      case 'attack': {
        if (!u.attack) { finish(w, u, o, false, 'noAttack'); return 'next'; }
        if (o.target != null) {
          const t = w.get(o.target);
          if (!t) { finish(w, u, o, true); return 'next'; }
          const r = validTarget(w, u, t);
          if (r) { finish(w, u, o, false, r); return 'next'; }
          attackStep(w, u, t);
          return 'wait';
        }
        // attack-move: walk to the point; every tick look for an enemy (fogged ones count once visible), stick to it until it is lost
        if (!num(o.x) || !num(o.y)) { finish(w, u, o, false, 'badOrder'); return 'next'; }
        if (S().canAttack(u)) {
          const acq = u.attack.acq || u.attack.range + 200;
          let t = o._tgt != null ? w.get(o._tgt) : null;
          if (t && (validTarget(w, u, t) || dist(u, t) > acq + 150)) t = null;
          if (!t) t = acquire(w, u, acq);
          o._tgt = t ? t.id : null;
          if (t) { attackStep(w, u, t); return 'wait'; }
        }
        if (dist(u, o) <= 1) { finish(w, u, o, true); return 'next'; }
        u._goal = { x: o.x, y: o.y, stop: 0 };
        return 'wait';
      }
      case 'cast': return castStep(w, u, o, dt);
    }
    finish(w, u, o, false, 'unknown'); return 'next';
  }

  function castStep(w, u, o, dt) {
    const def = A().get(o.ability);
    if (!def) { finish(w, u, o, false, 'unknown'); return 'next'; }
    if (o._ph === 'channel') {
      const ch = S().find(u, 'channel');
      if (!ch || ch.until <= w.t + 1e-9) {
        if (ch) S().remove(w, u, 'channel');
        if (def.channelEnd) def.channelEnd(w, u, o, false);
        finish(w, u, o, true); return 'next';
      }
      if (def.channelTick) def.channelTick(w, u, dt, o);
      return 'wait';
    }
    const reason = A().check(w, u, o.ability, o);
    if (reason) { finish(w, u, o, false, reason === 'noTarget' ? 'targetHidden' : reason); return 'next'; }
    let pos = o;
    if (def.target === 'unit') { pos = w.get(o.target); o._px = pos.x; o._py = pos.y; }
    if (o._ph === 'point') {
      o._t -= dt;
      if (o._t > 1e-9) return 'wait';
    } else {
      const needMove = def.target !== 'none';
      let range = needMove ? def.range(w, u) : Infinity;
      if (needMove && def.target === 'unit') range += pos.radius;
      if (needMove && range !== Infinity && dist(u, pos) > range + 0.5) {
        u._goal = { x: pos.x, y: pos.y, stop: Math.max(0, range - 1), unit: def.target === 'unit' ? o.target : null };
        return 'wait';
      }
      if (needMove && dist(u, pos) > 1 && Math.abs(U().angDiff(u.facing, U().angle(u, pos))) > FACE) {
        u._goal = { x: pos.x, y: pos.y, stop: Infinity, turnOnly: true }; return 'wait';
      }
      o._ph = 'point'; o._t = def.castPoint(w, u);
      u.path.length = 0;
      w.emit('castStart', { unit: u.id, ability: o.ability, order: o });
      if (o._t > 1e-9) return 'wait';
    }
    A().spend(w, u, o.ability);
    if (def.kind === 'item') { const it = u.items.find(s => s && s.id === o.ability); if (it) it.cd = u.cd[o.ability]; }
    w.emit('cast', { unit: u.id, ability: o.ability, kind: def.kind, x: pos.x, y: pos.y, target: o.target });
    def.cast(w, u, o);
    if (u.dead || u.orders[0] !== o) return 'wait';
    const ch = def.channel ? def.channel(w, u) : 0;
    if (ch > 0) {
      S().add(w, u, 'channel', ch, { ability: o.ability, data: { ability: o.ability, order: o } });
      if (u.orders[0] !== o) return 'wait';
      o._ph = 'channel'; return 'wait';
    }
    finish(w, u, o, true); return 'next';
  }

  function idleAcquire(w, u) {
    const at = u.attack;
    if (!at || w.opts.autoAttack === false || u.autoAttack === false || !S().canAttack(u)) return;
    if (S().has(u, 'ghost')) { at.target = null; return; }          // invisible: never auto-break Ghost Walk
    if (u._acqBlock != null && w.t < u._acqBlock - 1e-9) { at.target = null; return; }   // just pressed Stop
    let t = at.target != null ? w.get(at.target) : null;
    const acq = at.acq || at.range;
    if (!t || validTarget(w, u, t) || dist(u, t) > acq + 150) t = acquire(w, u, acq);
    if (!t) { at.target = null; return; }
    attackStep(w, u, t);
  }

  IT.World.system('orders', 10, (w, dt) => {
    for (const u of w.ents) {
      if (u.dead || !UNITS[u.kind]) continue;
      u._goal = null; u._wantAtk = null;
      if (!S().canAct(u)) continue;
      for (let g = 0; g < 8; g++) {
        const o = u.orders[0];
        if (!o) { idleAcquire(w, u); break; }
        if (step(w, u, o, dt) !== 'next') break;
      }
    }
  });

  // ---- movement
  function turn(u, ang, dt) {
    const rate = (u.turnRate || 0.5) / 0.03;
    const d = U().angDiff(u.facing, ang), m = rate * dt;
    u.facing = Math.abs(d) <= m ? ang : u.facing + Math.sign(d) * m;
    return Math.abs(U().angDiff(u.facing, ang));
  }
  function repath(w, u, g) {
    let p = null;
    if (IT.Nav && w.map) { try { p = IT.Nav.findPath(w.map, u.x, u.y, g.x, g.y, u.radius); } catch (e) { p = null; } }
    if (!p || !p.length) p = [{ x: g.x, y: g.y }];
    u.path = p.filter((q, i) => i === p.length - 1 || Math.hypot(q.x - u.x, q.y - u.y) > 1).map(q => ({ x: q.x, y: q.y }));
    u._pg = { x: g.x, y: g.y, t: w.t };
  }

  IT.World.system('movement', 20, (w, dt) => {
    for (const u of w.ents) {
      if (u.dead || !UNITS[u.kind]) continue;
      u._moved = false;
      const g = u._goal;
      if (!g || u._wind) continue;
      if (g.turnOnly) { turn(u, U().angle(u, g), dt); continue; }
      if (!S().canMove(u) || !(u.ms > 0)) continue;
      const d0 = dist(u, g);
      if (d0 <= g.stop + 1e-6) { if (d0 > 1) turn(u, U().angle(u, g), dt); continue; }
      const p = u._pg;
      if (!p || !u.path.length || Math.hypot(g.x - p.x, g.y - p.y) > (g.unit != null ? 32 : 1) || (g.unit != null && w.t - p.t >= 0.2 - 1e-9)) repath(w, u, g);
      let wp = u.path[0] || g;
      if (turn(u, Math.atan2(wp.y - u.y, wp.x - u.x), dt) > FACE) continue;
      let budget = u.ms * dt;
      while (budget > 1e-9) {
        wp = u.path[0] || g;
        const last = u.path.length <= 1;
        const dw = dist(u, wp);
        const toWp = last ? Math.max(0, Math.min(dw, dist(u, g) - g.stop)) : dw;
        const s = Math.min(budget, toWp);
        if (dw > 1e-9 && s > 0) {
          u.x += (wp.x - u.x) / dw * s; u.y += (wp.y - u.y) / dw * s;
          u.facing = Math.atan2(wp.y - u.y, wp.x - u.x);
          u._moved = true;
        }
        budget -= s;
        if (s >= toWp - 1e-9) { if (last) break; u.path.shift(); } else break;
      }
    }
  });

  // ---- attacks
  function hit(w, srcId, tId, amount) {
    const t = w.get(tId); if (!t) return;
    if (S().has(t, 'lift')) { w.emit('miss', { src: srcId, ability: 'attack', x: t.x, y: t.y }); return; }
    if (IT.Combat) IT.Combat.damage(w, { src: srcId, target: tId, ability: 'attack', type: 'physical', amount });
    w.emit('attackHit', { src: srcId, target: tId });
    w.emit('hit', { src: srcId, target: tId, ability: 'attack' });
  }
  function launch(w, u, t) {
    const a = u.attack;
    const amount = a.min + Math.floor(w.rng() * (a.max - a.min + 1));
    w.emit('attack', { src: u.id, target: t.id });
    if (!a.projSpeed || a.range <= 200) { hit(w, u.id, t.id, amount); return; }
    const speed = a.projSpeed, src = u.id, tid = t.id;
    w.thinker({
      kind: 'proj', team: u.team, x: u.x, y: u.y, z: 0, radius: 0, src, target: tid, ability: 'attack', speed,
      upd(w2, p, dt) {
        const tt = w2.get(tid); if (!tt) return true;
        const d = dist(p, tt), st = speed * dt;
        if (d <= st + tt.radius * 0.5) { hit(w2, src, tid, amount); return true; }
        p.x += (tt.x - p.x) / d * st; p.y += (tt.y - p.y) / d * st;
        return false;
      },
    });
  }

  IT.World.system('attacks', 30, (w, dt) => {
    for (const u of w.ents) {
      if (u.dead || !u.attack) continue;
      const a = u.attack;
      if (a.next > 0) a.next = Math.max(0, a.next - dt);
      if (u._wind && (!S().canAttack(u) || (u._wantAtk !== u._wind.target && !u._wind.keep))) { u._wind = null; a.next = 0; continue; }
      if (u._wind) {
        u._wind.t -= dt;
        if (u._wind.t <= 1e-9) { const t = w.get(u._wind.target); u._wind = null; if (t) launch(w, u, t); }
      } else if (u._wantAtk != null && a.next <= 1e-9 && S().canAttack(u)) {
        const t = w.get(u._wantAtk); if (!t) continue;
        u._wind = { target: t.id, t: IT.Hero.attackPoint(u) };
        a.next = IT.Hero.attackTime(u);
        w.emit('attackStart', { src: u.id, target: t.id });
      }
    }
  });

  IT.World.system('anim', 35, (w, dt) => {
    for (const u of w.ents) {
      if (u.dead || !UNITS[u.kind]) continue;
      const o = u.orders[0];
      let n = 'idle';
      if (!S().canAct(u)) n = 'stunned';
      else if (o && o.type === 'cast' && (o._ph === 'point' || o._ph === 'channel')) n = 'cast';
      else if (u._wind) n = 'attack';
      else if (u._moved) n = 'walk';
      if (n !== 'stunned' && u.ai) {   // dummy AI telegraphs (stun bolt cast, blink tell)
        if (u.ai.blink && u.ai.blink.tellEnd > w.t) n = 'blink';
        else if (u.ai.bolt && u.ai.bolt.active) n = 'cast';
      }
      if (u.anim.name !== n) u.anim = { name: n, t: 0 }; else u.anim.t += dt;
    }
  });

  // B4/E1: one order for several of the player's units (hero + forge spirits). order: { type:'move'|'attack'|'stop'|'hold', x, y, target, queued };
  // attack with x,y (no target) = attack-move. Spirits given a command stop obeying their AI for good. Several movers get a small spread
  // around the click point. Returns true if at least one unit accepted it.
  const GROUP_SPREAD = 48;
  function issueGroup(w, units, order) {
    if (!w || !order) return false;
    const us = [];
    for (const x of units || []) { const u = typeof x === 'object' ? x : w.get(x); if (u && !u.dead && UNITS[u.kind] && !us.includes(u)) us.push(u); }
    if (!us.length) return false;
    const base = Object.assign({}, order, { player: true });
    if (base.type === 'attackMove') base.type = 'attack';
    const spread = us.length > 1 && num(base.x) && num(base.y) && base.target == null && (base.type === 'move' || base.type === 'attack');
    let ok = false;
    us.forEach((u, i) => {
      const o = Object.assign({}, base);
      if (spread && i > 0) {
        const a = Math.PI * 2 * (i - 1) / (us.length - 1);
        o.x += Math.cos(a) * GROUP_SPREAD; o.y += Math.sin(a) * GROUP_SPREAD;
      }
      if (u.kind === 'spirit') u._playerCmd = true;
      ok = issue(w, u, o) || ok;
    });
    return ok;
  }

  IT.Orders = { issue, issueGroup, current, clear, waypoints };
})(typeof window !== 'undefined' ? window : globalThis);
