// Dummies (training targets) + forge spirits: spawn, respawn, AI. Pure. See CONTRACT.md.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const U = IT.U;
  const GM = () => IT.GAME;
  const hasS = (e, t) => IT.Status.has(e, t);

  // ---------- helpers ----------
  const walkable = (w, x, y) => !w.map || !w.map.walkable || w.map.walkable(x, y);
  function los(w, ax, ay, bx, by) { return IT.Vision && IT.Vision.los && w.map ? IT.Vision.los(w.map, ax, ay, bx, by) : true; }
  function canSee(w, v, t) {
    if (IT.Vision && IT.Vision.canSee && w.map) return IT.Vision.canSee(w, v, t);
    return U.dist(v, t) <= (v.vision || 0);
  }
  function seenByHero(w, x, y) {   // is the point inside the player's current vision?
    if (IT.Vision && IT.Vision.visibleAt && w.map && w.vis) return IT.Vision.visibleAt(w, x, y);
    const h = w.hero;
    if (!h) return false;
    return Math.hypot(x - h.x, y - h.y) <= (h.vision || 0) && los(w, h.x, h.y, x, y);
  }
  function setAnim(e, name) { if (e.anim.name !== name) { e.anim.name = name; e.anim.t = 0; } }
  function issueMove(w, e, x, y) { if (IT.Orders) IT.Orders.issue(w, e, { type: 'move', x, y }); }
  function issueStop(w, e) { if (IT.Orders) IT.Orders.issue(w, e, { type: 'stop' }); else { e.orders.length = 0; e.path.length = 0; } }
  function fixPoint(w, x, y) {   // nearest walkable point or null
    if (walkable(w, x, y)) return { x, y };
    if (w.map && IT.Nav && IT.Nav.nearestWalkable) { const p = IT.Nav.nearestWalkable(w.map, x, y); if (p && walkable(w, p.x, p.y)) return p; }
    return null;
  }
  const dummies = w => w.query(e => e.kind === 'dummy');
  const disabled = e => !IT.Status.canAct(e) || hasS(e, 'hex') || hasS(e, 'knockback');
  const canBlink = e => IT.Status.canAct(e) && !hasS(e, 'root') && !hasS(e, 'atosRoot') && !hasS(e, 'hex');

  // ---------- spawning ----------
  function newAI(behavior, x, y, t) {
    return { behavior, home: { x, y }, mode: 'idle', moving: false, pauseUntil: 0, nextPeek: 0, peekUntil: 0,
      hideSpot: null, nextThink: 0, dodgeId: 0, dodgeUntil: 0, useBkb: false, bkbAt: null,
      bolt: { readyAt: t, active: false, castEnd: 0 },
      blink: { used: false, pending: false, tellEnd: 0, t0: t } };
  }

  // Disables a bkb-using dummy reacts to (cast START by the hero): ability -> how it is aimed.
  const DISABLES = { coldsnap: 'unit', atos: 'unit', vyse: 'unit', orchid: 'unit', tornado: 'line', gleipnir: 'circle', meteorhammer: 'circle' };
  function aimedAt(w, c, d, p) {
    const k = DISABLES[p.ability], o = p.order || {};
    if (k === 'unit') return o.target === d.id;
    if (o.x == null) return false;
    if (k === 'circle') {
      const r = p.ability === 'gleipnir' ? (IT.Values.item(GM().ITEM_DOTA.gleipnir, 'radius_tooltip') || IT.Values.item(GM().ITEM_DOTA.gleipnir, 'radius'))
        : IT.Values.item(GM().ITEM_DOTA.meteorhammer, 'impact_radius');
      return U.dist(o, d) <= r + d.radius;
    }
    const V = IT.Values, ctx = c.ctx || w.ctx;   // tornado: lane along the cast direction
    const len = V.get('invoker_tornado', 'travel_distance', ctx), r = V.get('invoker_tornado', 'area_of_effect', ctx);
    const dir = (o.x === c.x && o.y === c.y) ? c.facing : Math.atan2(o.y - c.y, o.x - c.x);
    const dx = d.x - c.x, dy = d.y - c.y, along = dx * Math.cos(dir) + dy * Math.sin(dir), side = Math.abs(-dx * Math.sin(dir) + dy * Math.cos(dir));
    return along >= -d.radius && along <= len + d.radius && side <= r + d.radius;
  }

  function hook(w) {   // first-hit trigger for blink_on_first_hit; hero disable casts -> bkb reaction timer
    if (w._unitsHook) return;
    w._unitsHook = true;
    w.on('castStart', (p) => {
      if (!DISABLES[p.ability]) return;
      const c = w.get(p.unit);
      if (!c) return;
      for (const d of w.ents) {
        if (d.dead || d.kind !== 'dummy' || !d.ai || !d.ai.useBkb || d.team === c.team || d.ai.bkbAt != null || !aimedAt(w, c, d, p)) continue;
        d.ai.bkbAt = w.t + (d.reaction || 0);
      }
    });
    w.on('damage', (p) => {
      const d = w.get(p.target);
      if (!d || d.kind !== 'dummy' || !d.ai || !d.scenario) return;
      if (d.scenario.dummyEscape === 'blink_on_first_hit' && !d.ai.blink.used) d.ai.blink.pending = true;
    });
  }

  function spawnDummy(w, o) {
    hook(w);
    const G_ = GM(), p = G_.DUMMY_PRESETS[o.preset || 'training'], D = G_.DUMMY;
    const sc = Object.assign({ stunBolt: false, dummyEscape: 'none', blinkAfter: 3 }, o.scenario || {});
    const behavior = o.behavior || p.behavior;
    const e = {
      kind: 'dummy', team: 1, x: o.x, y: o.y, radius: D.radius, vision: D.vision, visible: false,
      lastSeen: { x: o.x, y: o.y, t: 0 },
      hp: p.hp, maxHp: p.hp, mana: p.mana, maxMana: p.mana, hpRegen: p.hpRegen, manaRegen: p.manaRegen,
      armor: p.armor, magicRes: p.magicRes, ms: p.ms, turnRate: 10, attack: null,
      base: { ms: p.ms, armor: p.armor, magicRes: p.magicRes, hpRegen: p.hpRegen, manaRegen: p.manaRegen, as: 100, dmgMin: 0, dmgMax: 0, bat: 1.7, attackRange: 0 },
      skin: o.skin, name: G_.SKIN_NAMES[o.skin] || o.skin, preset: o.preset || 'training',
      reaction: p.reaction, scenario: sc,
    };
    e.ai = newAI(behavior, o.x, o.y, w.t);
    e.ai.useBkb = !!o.useBkb;   // activates its BKB (if carried + ready) `reaction` s after the hero starts casting a disable at it
    e.cd = {};
    if (Array.isArray(o.items)) {   // same slot shape as the hero (HUD can show them)
      e.items = [];
      for (let i = 0; i < 6; i++) e.items.push(typeof o.items[i] === 'string' ? { id: o.items[i], cd: 0, charges: 0 } : null);
    }
    return w.add(e);
  }

  function spawnSpirit(w, owner, x, y) {
    const ctx = owner.ctx || w.ctx, V = IT.Values, A = 'invoker_forge_spirit';
    const u = IT.DOTA.units.npc_dota_invoker_forged_spirit;
    const g = k => V.get(A, k, ctx);
    const hp = g('spirit_hp'), dmg = g('spirit_damage'), armor = g('spirit_armor'), range = g('spirit_attack_range');
    const e = {
      kind: 'spirit', team: 0, owner: owner.id, x, y, radius: u.HullRadius || 16, vision: u.VisionDaytimeRange || 1200, visible: true,
      hp, maxHp: hp, mana: g('spirit_mana'), maxMana: g('spirit_mana'), hpRegen: u.StatusHealthRegen, manaRegen: u.StatusManaRegen,
      armor, magicRes: u.MagicalResistance || 0, ms: u.MovementSpeed, turnRate: 10,
      base: { ms: u.MovementSpeed, armor, magicRes: u.MagicalResistance || 0, hpRegen: u.StatusHealthRegen, manaRegen: u.StatusManaRegen, as: 100, dmgMin: dmg, dmgMax: dmg, bat: u.AttackRate, attackRange: range, point: u.AttackAnimationPoint, projSpeed: u.ProjectileSpeed },
      attack: { min: dmg, max: dmg, bat: u.AttackRate, point: u.AttackAnimationPoint, range, projSpeed: u.ProjectileSpeed, next: 0, target: null },
      name: 'Forged Spirit', expires: w.t + g('spirit_duration'),
      ai: { behavior: 'spirit', nextThink: 0 },
    };
    return w.add(e);
  }

  // ---------- respawn / reset ----------
  function resetItems(d) {   // fresh cooldowns / BKB use count + pending reaction
    if (d.cd) for (const k in d.cd) d.cd[k] = 0;
    if (d.items) for (const it of d.items) if (it) { it.cd = 0; it.charges = 0; }
    d.ai.bkbAt = null;
  }

  function resetCombo(w, d) {
    const a = d.ai;
    if (a.bolt.active) { a.bolt.active = false; w.emit('bolt', { unit: d.id, phase: 'cancel', target: w.hero && w.hero.id, reason: 'reset' }); }
    a.bolt.readyAt = w.t;
    a.blink.used = false; a.blink.pending = false; a.blink.tellEnd = 0; a.blink.t0 = w.t;
    resetItems(d);
    if (d.anim.name === 'cast' || d.anim.name === 'blink') setAnim(d, 'idle');
  }

  function respawn(w, d, o) {
    o = o || {};
    const h = w.hero;
    let spot = null, fallback = null;
    for (let i = 0; i < 60 && !spot; i++) {
      const a = w.rng() * U.TAU, r = 900 + w.rng() * 700;
      const x = (h ? h.x : d.x) + Math.cos(a) * r, y = (h ? h.y : d.y) + Math.sin(a) * r;
      if (!walkable(w, x, y)) continue;
      if (!fallback) fallback = { x, y };
      if (!o.outsideVision || !seenByHero(w, x, y)) spot = { x, y };
    }
    spot = spot || fallback;
    if (!spot) {
      const a = w.rng() * U.TAU;
      const x = (h ? h.x : d.x) + Math.cos(a) * 1200, y = (h ? h.y : d.y) + Math.sin(a) * 1200;
      spot = fixPoint(w, x, y) || { x, y };
    }
    d.x = spot.x; d.y = spot.y; d.z = 0;
    d.hp = d.maxHp; d.mana = d.maxMana;
    d.statuses.length = 0; d.orders.length = 0; d.path.length = 0;
    setAnim(d, 'idle');
    const ub = d.ai.useBkb;
    d.ai = newAI(d.ai.behavior, spot.x, spot.y, w.t);
    d.ai.useBkb = ub; resetItems(d);
    d.lastSeen = { x: spot.x, y: spot.y, t: w.t };
    w.emit('fx', { name: 'respawn', x: spot.x, y: spot.y, unit: d.id });
    return spot;
  }

  // ---------- pure decision helpers ----------
  // Where should `dummy` run to escape `danger` {x,y,r,at}? null = not covered / can't move / can't make it.
  // `now` optional (omit to skip the timing check).
  function dodgeTarget(dummy, danger, map, now) {
    const dx0 = dummy.x - danger.x, dy0 = dummy.y - danger.y, d0 = Math.hypot(dx0, dy0);
    const reach = danger.r + dummy.radius;
    if (d0 > reach) return null;
    if (!(dummy.ms > 0)) return null;
    const out = reach + 40;
    const base = d0 < 1e-6 ? 0 : Math.atan2(dy0, dx0);
    for (const da of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6]) {
      let x = danger.x + Math.cos(base + da) * out, y = danger.y + Math.sin(base + da) * out;
      if (map && map.walkable && !map.walkable(x, y)) {
        const p = IT.Nav && IT.Nav.nearestWalkable ? IT.Nav.nearestWalkable(map, x, y) : null;
        if (!p || Math.hypot(p.x - danger.x, p.y - danger.y) < reach) continue;
        x = p.x; y = p.y;
      }
      if (now != null && Math.hypot(x - dummy.x, y - dummy.y) / dummy.ms > danger.at - now) continue;
      return { x, y };
    }
    return null;
  }

  // Deterministic blink landing spot.
  function blinkSpot(w, d) {
    const B = GM().DUMMY.blink, h = w.hero, cover = (w.map && w.map.cover) || [];
    const hx = h ? h.x : d.x - 1, hy = h ? h.y : d.y;
    let best = -1, bestD = -1, bestNoLos = -1, bestNoLosD = -1;
    for (let i = 0; i < cover.length; i++) {
      const c = cover[i], dd = Math.hypot(c.x - d.x, c.y - d.y);
      if (dd > B.range || dd < B.minRange || !walkable(w, c.x, c.y)) continue;
      const fh = Math.hypot(c.x - hx, c.y - hy);
      if (fh > bestD) { bestD = fh; best = i; }
      if (h && !los(w, c.x, c.y, hx, hy) && fh > bestNoLosD) { bestNoLosD = fh; bestNoLos = i; }
    }
    const i = bestNoLos >= 0 ? bestNoLos : best;
    if (i >= 0) return { x: cover[i].x, y: cover[i].y };
    let ax = d.x - hx, ay = d.y - hy;
    const l = Math.hypot(ax, ay);
    if (l < 1e-6) { ax = 1; ay = 0; } else { ax /= l; ay /= l; }
    for (let dist = B.range * 0.9; dist >= B.minRange; dist *= 0.85) {
      const x = d.x + ax * dist, y = d.y + ay * dist;
      if (walkable(w, x, y)) return { x, y };
    }
    return fixPoint(w, d.x + ax * B.minRange, d.y + ay * B.minRange) || { x: d.x, y: d.y };
  }

  // Forge spirit decision: {type:'attack', target} | {type:'move', x, y} | null.
  function spiritAction(w, s) {
    const owner = w.get(s.owner);
    if (!owner) return null;
    const ok = t => t && !t.dead && t.team !== s.team && (t.kind === 'dummy' || t.kind === 'hero' || t.kind === 'spirit') &&
      !hasS(t, 'lift') && (!w.fog || t.visible);
    const auto = !w.opts || w.opts.autoAttack !== false;   // setting autoAttack: OFF = spirits only help with attacks the hero orders
    const oo = owner.orders && owner.orders[0], at = owner.attack;
    let t = null;
    if (at && at.target != null && (auto || (oo && (oo.type === 'attack' || oo.type === 'hold')))) {
      t = oo && oo.type === 'attack' && oo.target != null ? w.get(oo.target) : w.get(at.target);
    }
    if (!ok(t)) {
      t = null;
      if (auto) {
        let bd = 700;
        for (const e of w.ents) {
          if (e.dead || !ok(e)) continue;
          const dd = U.dist(s, e);
          if (dd <= bd) { bd = dd; t = e; }
        }
      }
    }
    if (t) return { type: 'attack', target: t.id };
    if (U.dist(s, owner) > 300) {
      const a = Math.atan2(s.y - owner.y, s.x - owner.x);
      return { type: 'move', x: owner.x + Math.cos(a) * 150, y: owner.y + Math.sin(a) * 150 };
    }
    return null;
  }

  // ---------- AI ----------
  function cancelBolt(w, d, reason) {
    const b = d.ai.bolt;
    if (!b.active) return;
    b.active = false; b.readyAt = w.t + 2;
    if (d.anim.name === 'cast') setAnim(d, 'idle');
    w.emit('bolt', { unit: d.id, phase: 'cancel', target: w.hero && w.hero.id, reason });
  }

  function launchBolt(w, d, h) {
    const B = GM().DUMMY.bolt;
    w.thinker({
      kind: 'proj', team: d.team, fx: 'bolt', x: d.x, y: d.y, z: 0, src: d.id, target: h.id, speed: B.speed, radius: 8,
      upd(w2, p, dt) {
        const t = w2.get(p.target);
        if (!t || p.age > 5) return true;
        const dx = t.x - p.x, dy = t.y - p.y, dist = Math.hypot(dx, dy), step = p.speed * dt;
        p.facing = Math.atan2(dy, dx);
        if (dist > step + t.radius * 0.5) { p.x += dx / dist * step; p.y += dy / dist * step; return false; }
        p.x = t.x; p.y = t.y;
        if (hasS(t, 'lift')) { w2.emit('miss', { src: p.src, ability: 'stunbolt', x: p.x, y: p.y }); w2.emit('fx', { name: 'boltDodged', x: p.x, y: p.y }); return true; }
        if (hasS(t, 'magicImmune')) {
          w2.emit('bolt', { unit: p.src, phase: 'blocked', target: t.id });
          w2.emit('fx', { name: 'boltBlocked', x: p.x, y: p.y });
          return true;
        }
        IT.Status.add(w2, t, 'stun', B.stun, { src: p.src, ability: 'stunbolt' });
        IT.Combat.damage(w2, { src: p.src, target: t, ability: 'stunbolt', type: 'magical', amount: B.damage });
        w2.emit('hit', { src: p.src, target: t.id, ability: 'stunbolt' });
        w2.emit('bolt', { unit: p.src, phase: 'hit', target: t.id });
        w2.emit('fx', { name: 'boltHit', x: p.x, y: p.y });
        return true;
      },
    });
  }

  function tickBolt(w, d) {
    const B = GM().DUMMY.bolt, b = d.ai.bolt, h = w.hero;
    if (!d.scenario.stunBolt) return;
    if (b.active) {
      if (disabled(d)) return cancelBolt(w, d, 'disabled');
      if (!h || U.dist(d, h) > B.range + 200) return cancelBolt(w, d, 'range');
      d.facing = U.angle(d, h);
      if (w.t >= b.castEnd - 1e-9) {
        b.active = false; b.readyAt = w.t + B.cooldown;
        setAnim(d, 'idle');
        launchBolt(w, d, h);
      }
      return;
    }
    if (!h || w.t < b.readyAt || disabled(d) || hasS(d, 'silence')) return;
    if (hasS(h, 'lift') || U.dist(d, h) > B.range || !canSee(w, d, h)) return;
    issueStop(w, d);
    d.ai.moving = false;
    b.active = true; b.castEnd = w.t + B.castTime;
    d.facing = U.angle(d, h);
    setAnim(d, 'cast');
    w.emit('bolt', { unit: d.id, phase: 'start', target: h.id });
    w.emit('fx', { name: 'boltTelegraph', x: d.x, y: d.y, unit: d.id, target: h.id, dur: B.castTime });
  }

  // returns true while the dummy is busy blinking (tell active)
  function tickBlink(w, d) {
    const bl = d.ai.blink, sc = d.scenario, tell = GM().DUMMY.blink.tell;
    if (bl.used) return false;
    if (!bl.pending && sc.dummyEscape === 'blink_after_seconds' && w.t - bl.t0 >= sc.blinkAfter) bl.pending = true;
    if (!bl.pending) return false;
    if (!canBlink(d)) { if (bl.tellEnd) { bl.tellEnd = 0; setAnim(d, 'idle'); } return false; }
    if (!bl.tellEnd) {
      bl.tellEnd = w.t + tell;
      cancelBolt(w, d, 'blink');
      issueStop(w, d); d.ai.moving = false;
      setAnim(d, 'blink');
      w.emit('fx', { name: 'blinkTell', x: d.x, y: d.y, unit: d.id, dur: tell });
      return true;
    }
    if (w.t < bl.tellEnd - 1e-9) return true;
    const sp = blinkSpot(w, d), fx = d.x, fy = d.y;
    d.x = sp.x; d.y = sp.y;
    d.orders.length = 0; d.path.length = 0;
    bl.used = true; bl.pending = false; bl.tellEnd = 0;
    d.ai.home = { x: sp.x, y: sp.y };
    setAnim(d, 'idle');
    w.emit('blink', { unit: d.id, fromX: fx, fromY: fy, x: sp.x, y: sp.y });
    return false;
  }

  function tickWander(w, d) {
    const a = d.ai;
    if (!(d.ms > 0)) return;
    if (a.moving) {
      if (d.orders.length) return;
      a.moving = false; a.pauseUntil = w.t + 1 + w.rng() * 1.5; return;
    }
    if (w.t < a.pauseUntil) return;
    for (let i = 0; i < 8; i++) {
      const ang = w.rng() * U.TAU, r = Math.sqrt(w.rng()) * 500;
      const p = fixPoint(w, a.home.x + Math.cos(ang) * r, a.home.y + Math.sin(ang) * r);
      if (p && Math.hypot(p.x - a.home.x, p.y - a.home.y) <= 500) { issueMove(w, d, p.x, p.y); a.moving = true; return; }
    }
    a.pauseUntil = w.t + 1;
  }

  function coverSpots(w, d, h) {
    const cover = (w.map && w.map.cover) || [], out = [];
    for (const c of cover) {
      if (U.dist(c, d.ai.home) > 900) continue;
      if (h && los(w, c.x, c.y, h.x, h.y)) continue;
      out.push(c);
    }
    return out;
  }

  function tickDodge(w, d) {
    const a = d.ai;
    if (a.behavior !== 'evasive' || !IT.Status.canMove(d)) return false;
    for (const t of w.ents) {
      if (t.dead || !t.danger || t.age < d.reaction) continue;
      if (t.id === a.dodgeId && a.dodgeUntil > w.t) return true;
      if (t.id === a.dodgeId) continue;
      const dest = dodgeTarget(d, t.danger, w.map, w.t);
      if (!dest) continue;
      issueMove(w, d, dest.x, dest.y);
      a.dodgeId = t.id; a.dodgeUntil = w.t + Math.hypot(dest.x - d.x, dest.y - d.y) / d.ms + 0.1;
      a.moving = false; a.mode = 'dodge'; a.hideSpot = null;
      w.emit('fx', { name: 'dodge', x: d.x, y: d.y, unit: d.id });
      return true;
    }
    if (a.dodgeUntil > w.t && d.orders.length) return true;
    if (a.mode === 'dodge') { a.mode = 'idle'; a.nextThink = 0; }
    return false;
  }

  function tickEvasive(w, d) {
    const a = d.ai, h = w.hero;
    if (!(d.ms > 0) || !h) return;
    if (!w.map || !w.map.cover || !w.map.cover.length) return tickWander(w, d);
    if (a.mode === 'peek') {
      if (w.t >= a.peekUntil) { a.mode = 'hide'; a.nextPeek = w.t + 3 + w.rng() * 2; a.hideSpot = null; a.nextThink = 0; }
      return;
    }
    if (a.mode !== 'hide') { a.mode = 'hide'; a.nextPeek = w.t + 3 + w.rng() * 2; a.nextThink = 0; }
    if (w.t >= a.nextPeek) {
      let best = null, bd = Infinity;
      for (let i = 0; i < 16; i++) {
        const ang = w.rng() * U.TAU, r = Math.sqrt(w.rng()) * 900;
        const p = fixPoint(w, a.home.x + Math.cos(ang) * r, a.home.y + Math.sin(ang) * r);
        if (!p || !los(w, p.x, p.y, h.x, h.y)) continue;
        const dd = U.dist(p, d);
        if (dd < bd) { bd = dd; best = p; }
      }
      if (best) { issueMove(w, d, best.x, best.y); a.mode = 'peek'; a.peekUntil = w.t + 1.5; }
      else a.nextPeek = w.t + 3 + w.rng() * 2;
      return;
    }
    if (w.t < a.nextThink) return;
    a.nextThink = w.t + 0.5;
    if (a.hideSpot && !los(w, a.hideSpot.x, a.hideSpot.y, h.x, h.y)) {
      if (!d.orders.length && U.dist(d, a.hideSpot) > 20) issueMove(w, d, a.hideSpot.x, a.hideSpot.y);
      return;
    }
    let best = null, bd = Infinity;
    for (const c of coverSpots(w, d, h)) { const dd = U.dist(c, d); if (dd < bd) { bd = dd; best = c; } }
    a.hideSpot = best;
    if (best && U.dist(d, best) > 20) issueMove(w, d, best.x, best.y);
  }

  // BKB reaction: fires once the timer set by the hero's disable cast elapses; vetoed while stunned/hexed/on cd.
  function tickBkb(w, d) {
    const a = d.ai;
    if (a.bkbAt == null || w.t < a.bkbAt - 1e-9) return;
    a.bkbAt = null;
    const A = IT.Abilities, def = A && A.get('bkb');
    if (!def || !d.items || A.check(w, d, 'bkb')) return;
    A.spend(w, d, 'bkb');
    const it = d.items.find(x => x && x.id === 'bkb'); if (it) it.cd = d.cd.bkb;
    w.emit('itemUse', { unit: d.id, ability: 'bkb' });
    def.cast(w, d, {});
  }

  function tickDummy(w, d) {
    const a = d.ai;
    tickBkb(w, d);
    if (tickBlink(w, d)) return;
    if (disabled(d)) { if (a.bolt.active) cancelBolt(w, d, 'disabled'); return; }
    tickBolt(w, d);
    if (a.bolt.active) return;
    if (tickDodge(w, d)) return;
    if (!IT.Status.canMove(d)) return;
    if (a.behavior === 'wander') tickWander(w, d);
    else if (a.behavior === 'evasive') tickEvasive(w, d);
  }

  function tickSpirit(w, s) {
    if (w.t >= s.expires) { w.emit('fx', { name: 'spiritExpire', x: s.x, y: s.y, unit: s.id }); w.remove(s); return; }
    if (!w.get(s.owner)) { w.remove(s); return; }
    if (!IT.Status.canAct(s) || w.t < s.ai.nextThink) return;
    s.ai.nextThink = w.t + 0.2;
    const act = spiritAction(w, s);
    if (!act || !IT.Orders) return;
    const cur = s.orders[0];
    if (act.type === 'attack') {
      if (cur && cur.type === 'attack' && cur.target === act.target) return;
      IT.Orders.issue(w, s, { type: 'attack', target: act.target });
    } else {
      if (cur && cur.type === 'move') return;
      IT.Orders.issue(w, s, { type: 'move', x: act.x, y: act.y });
    }
  }

  IT.World.system('unitsAI', 60, (w) => {
    for (const e of w.ents) {
      if (e.dead) continue;
      if (e.kind === 'dummy' && e.ai) tickDummy(w, e);
      else if (e.kind === 'spirit' && e.ai) tickSpirit(w, e);
    }
  });

  IT.Units = { spawnDummy, spawnSpirit, respawn, resetCombo, dummies, dodgeTarget, blinkSpot, spiritAction };
})(typeof window !== 'undefined' ? window : globalThis);
