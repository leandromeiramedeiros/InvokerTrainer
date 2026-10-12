// Dummies (scarecrows), enemies (NPC heroes; AI in enemy.js) + forge spirits: spawn, respawn. Pure. See CONTRACT.md + docs/PLAN-v4.md.
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
  const isFoe = e => !!e && (e.kind === 'dummy' || e.kind === 'enemy');   // any target unit the player fights
  const dummies = w => w.query(e => e.kind === 'dummy');
  const enemies = w => w.query(e => e.kind === 'enemy');
  const foes = w => w.query(isFoe);
  const disabled = e => !IT.Status.canAct(e) || hasS(e, 'hex') || hasS(e, 'knockback');
  const canBlink = e => IT.Status.canAct(e) && !hasS(e, 'root') && !hasS(e, 'atosRoot') && !hasS(e, 'hex');

  // ---------- spawning ----------
  function newAI(behavior, x, y, t) {
    return { behavior, home: { x, y }, mode: 'idle', moving: false, pauseUntil: 0, nextPeek: 0, peekUntil: 0,
      hideSpot: null, nextThink: 0, dodgeId: 0, dodgeUntil: 0, useBkb: false, bkbAt: null,
      bolt: { readyAt: t, active: false, castEnd: 0 },
      blink: { used: false, pending: false, tellEnd: 0, t0: t },
      pend: [], handled: {}, fleeAt: 0 };   // v4 enemy AI: queued threats {ability, kind, at, lands, shape}, danger thinker ids reacted to
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

  // Shared body of dummy + enemy (hero-shaped stats; AI state in e.ai).
  function body(w, o, kind, st) {
    const G_ = GM(), D = G_.DUMMY;
    const e = {
      kind, team: 1, x: o.x, y: o.y, radius: st.radius || D.radius, vision: st.vision != null ? st.vision : D.vision, visible: false,
      lastSeen: { x: o.x, y: o.y, t: 0 },
      hp: st.hp, maxHp: st.hp, mana: st.mana, maxMana: st.mana, hpRegen: st.hpRegen, manaRegen: st.manaRegen,
      armor: st.armor, magicRes: st.magicRes, ms: st.ms, turnRate: 10, attack: null,
      base: { ms: st.ms, armor: st.armor, magicRes: st.magicRes, hpRegen: st.hpRegen, manaRegen: st.manaRegen, as: 100, dmgMin: 0, dmgMax: 0, bat: 1.7, attackRange: 0 },
      skin: o.skin, name: G_.SKIN_NAMES[o.skin] || o.skin, preset: o.preset || 'training',
      reaction: st.reaction, scenario: Object.assign({ stunBolt: false, dummyEscape: 'none', blinkAfter: 3 }, o.scenario || {}),
    };
    e.cd = {};
    if (Array.isArray(o.items)) {   // same slot shape as the hero (HUD can show them)
      e.items = [];
      for (let i = 0; i < 6; i++) e.items.push(typeof o.items[i] === 'string' ? { id: o.items[i], cd: 0, charges: 0 } : null);
    }
    return e;
  }

    // Enemy NPC hero (v4). opts: x, y, skin, hp, armor, magicRes, ms, behavior, items, awareness, reaction, telegraph, preset, mana,
  // killFrac / refillBelow (legacy), legacy (old dummy-AI flow: stun bolt, scripted blink, bkb timer, evasive).
  function spawnEnemy(w, o) {
    const G_ = GM(), E = G_.ENEMY, p = o.preset ? G_.DUMMY_PRESETS[o.preset] : null;
    const pick = (k) => o[k] != null ? o[k] : p && p[k] != null ? p[k] : E[k];
    const hp = pick('hp');
    const behavior = o.behavior || (p && p.behavior) || 'stationary';
    const items = Array.isArray(o.items) ? (o.legacy ? o.items : o.items.filter(id => G_.ENEMY_ITEMS.includes(id))) : undefined;
    const e = body(w, Object.assign({}, o, { items, preset: o.preset || 'enemy' }), 'enemy', {
      hp, mana: pick('mana'), hpRegen: pick('hpRegen'), manaRegen: pick('manaRegen'), armor: pick('armor'), magicRes: pick('magicRes'),
      ms: pick('ms'), reaction: pick('reaction'), radius: E.radius, vision: E.vision,
    });
    e.ai = newAI(behavior, o.x, o.y, w.t);
    e.ai.useBkb = !!o.useBkb;
    e.behavior = behavior;
    e.legacy = !!o.legacy;
    e.telegraph = o.telegraph != null ? o.telegraph : E.telegraph;   // lead (s) between the telegraph event and the item firing
    e.awareness = o.awareness != null ? o.awareness : E.awareness;
    e.aware = false; e.tele = null; e.lastHit = -99;
    if (o.killFrac) e.killFrac = o.killFrac;
    if (o.refillBelow) e.refillBelow = o.refillBelow;
    w.add(e);
    if (IT.Enemy) IT.Enemy.init(w, e);
    return e;
  }

  // Dummy = scarecrow: stationary, no AI, never dies (hp refills below the refill threshold), no hp bar.
  // Backward compatible: callers passing AI options (non-stationary behavior, stun bolt, scripted blink, bkb reaction) get an enemy
  // through spawnEnemy (legacy flow, no telegraph); a scenario-driven one dies below 25% hp like the old ranked kill rule.
  function spawnDummy(w, o) {
    const G_ = GM(), p = G_.DUMMY_PRESETS[o.preset || 'training'];
    const sc = o.scenario || {};
    const behavior = o.behavior || p.behavior;
    const hasAI = behavior !== 'stationary' || sc.stunBolt || (sc.dummyEscape && sc.dummyEscape !== 'none') || o.useBkb;
    if (hasAI) {
      const legacy = !(behavior === 'escape' || behavior === 'disable_escape' || behavior === 'defend');   // wander/evasive = old flow
      return spawnEnemy(w, Object.assign({}, o, {
        behavior, legacy, preset: o.preset || 'training',
        telegraph: legacy ? 0 : o.telegraph, killFrac: o.scenario ? 0.25 : 0, refillBelow: o.scenario ? 0 : 0.25,
      }));
    }
    const e = body(w, o, 'dummy', p);
    e.noHpBar = true;
    e.ai = newAI('stationary', o.x, o.y, w.t);
    e.ai.useBkb = false;
    e.behavior = 'stationary';
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
    d.tele = null; d.z = 0;
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
    const ok = t => t && !t.dead && t.team !== s.team && (isFoe(t) || t.kind === 'hero' || t.kind === 'spirit') &&
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
    for (const e of w.ents) if (!e.dead && e.kind === 'spirit' && e.ai) tickSpirit(w, e);
  });

  IT.Units = {
    spawnDummy, spawnEnemy, spawnSpirit, respawn, resetCombo, isFoe, dummies, enemies, foes, dodgeTarget, blinkSpot, spiritAction,
    // internals shared with enemy.js (not API)
    _h: { newAI, DISABLES, aimedAt, walkable, los, canSee, seenByHero, setAnim, issueMove, issueStop, fixPoint, disabled, canBlink, resetItems },
  };
})(typeof window !== 'undefined' ? window : globalThis);
