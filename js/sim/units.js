// Dummies (scarecrows), enemies (NPC heroes + their AI) + forge spirits: spawn, respawn, AI. Pure. See CONTRACT.md + docs/PLAN-v4.md.
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
  const looksEnemy = e => !!e && (e.kind === 'enemy' || (e.kind === 'dummy' && !e.scarecrow));   // hero skin + name tag + dummychat
  const dummies = w => w.query(e => e.kind === 'dummy');
  const enemies = w => w.query(e => e.kind === 'enemy');
  const foes = w => w.query(isFoe);
  const disabled = e => !IT.Status.canAct(e) || hasS(e, 'hex') || hasS(e, 'knockback');
  const canBlink = e => IT.Status.canAct(e) && !hasS(e, 'root') && !hasS(e, 'atosRoot') && !hasS(e, 'hex');

  // ---------- spawning ----------
  function newAI(behavior, x, y, t) {
    return { behavior, home: { x, y }, mode: 'idle', moving: false, pauseUntil: 0, nextPeek: 0, peekUntil: 0,
      hideSpot: null, nextThink: 0, cornered: 0, dodgeId: 0, dodgeUntil: 0, useBkb: false, bkbAt: null,
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

  const isNight = w => !!(w && (w.night || (w.map && w.map.night)));   // night: enemy hero vision 800 instead of 1800

  // Enemy NPC hero (v4). opts: x, y, skin, hp, armor, magicRes, ms, mana, behavior, items, awareness, reaction, telegraph, preset,
  // scenario ({stunBolt, ...} legacy hooks), useBkb. Dies at 0 hp (combat.js emits 'kill').
  function spawnEnemy(w, o) {
    hook(w);
    const G_ = GM(), E = G_.ENEMY, p = o.preset ? G_.DUMMY_PRESETS[o.preset] : null;
    const pick = (k) => o[k] != null ? o[k] : p && p[k] != null ? p[k] : E[k];
    const behavior = o.behavior || 'stationary';
    const items = Array.isArray(o.items) ? o.items.filter(id => G_.ENEMY_ITEMS.includes(id)) : undefined;
    const e = body(w, Object.assign({}, o, { items, preset: o.preset || 'enemy' }), 'enemy', {
      hp: pick('hp'), mana: pick('mana'), hpRegen: pick('hpRegen'), manaRegen: pick('manaRegen'), armor: pick('armor'), magicRes: pick('magicRes'),
      ms: pick('ms'), reaction: pick('reaction'), radius: E.radius, vision: isNight(w) ? E.visionNight : E.vision,
    });
    e.ai = newAI(behavior, o.x, o.y, w.t);
    e.ai.useBkb = !!o.useBkb;
    if (behavior === 'disable_escape') e.scenario.stunBolt = true;   // disables the hero (stun bolt), then escapes
    e.behavior = behavior;
    e.telegraph = o.telegraph != null ? o.telegraph : E.telegraph;   // lead (s) between the 'telegraph' event and the item firing
    e.awareness = o.awareness != null ? o.awareness : E.awareness;
    e.notice = o.notice != null ? o.notice : E.notice;   // s of plain sight an awareness-0 enemy needs to register the hero
    e.aware = false; e.tele = null; e.lastHit = -99;
    if (o.name) e.name = o.name;
    // hero auto-attack (opts.attack: 'ranged'|'melee' override, false = none). Never auto-acquires: the AI orders it (see fightHero).
    const kind = o.attack === false ? null : (typeof o.attack === 'string' ? o.attack : G_.ENEMY_ATTACK_KIND[o.skin] || 'ranged'), AT = kind && G_.ENEMY_ATTACK[kind];
    if (AT) {
      const m = o.dmgMul != null ? o.dmgMul : 1, mn = Math.round(AT.min * m), mx = Math.max(mn, Math.round(AT.max * m));
      e.attack = { min: mn, max: mx, bat: AT.bat, point: AT.point, range: AT.range, projSpeed: AT.projSpeed, next: 0, target: null };
      Object.assign(e.base, { dmgMin: mn, dmgMax: mx, bat: AT.bat, point: AT.point, attackRange: AT.range, projSpeed: AT.projSpeed });
      e.autoAttack = false;
      e.atkKind = kind;
    }
    e.fights = !!o.fights;   // hits back whenever aware and in reach (hard+); otherwise only 'defend' or when cornered
    return w.add(e);
  }

  // Dummy = scarecrow: stationary, no AI, never dies (combat.js refills it), no hp bar.
  // Backward compatible (ranked/main): AI options (non-stationary preset behavior, stun bolt, scripted blink, bkb reaction) keep the
  // old dummy AI on a kind:'dummy' unit (it keeps its hp bar).
  function spawnDummy(w, o) {
    hook(w);
    const G_ = GM(), p = G_.DUMMY_PRESETS[o.preset || 'training'];
    const sc = o.scenario || {};
    const behavior = o.behavior || p.behavior;
    const hasAI = behavior !== 'stationary' || sc.stunBolt || (sc.dummyEscape && sc.dummyEscape !== 'none') || o.useBkb;
    const e = body(w, o, 'dummy', p);
    e.ai = newAI(behavior, o.x, o.y, w.t);
    e.ai.useBkb = !!o.useBkb;   // activates its BKB (if carried + ready) `reaction` s after the hero starts casting a disable at it
    e.behavior = behavior;
    if (!hasAI) { e.noHpBar = true; e.scarecrow = true; }   // plain target: scarecrow look, no name/speech
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

  function hook(w) {   // first-hit trigger for blink_on_first_hit; hero disable casts -> bkb reaction timer
    if (w._unitsHook) return;
    w._unitsHook = true;
    w.on('castStart', (p) => {
      if (!DISABLES[p.ability]) return;
      const c = w.get(p.unit);
      if (!c) return;
      for (const d of w.ents) {
        if (d.dead || !isFoe(d) || !d.ai || d.team === c.team || !aimedAt(w, c, d, p)) continue;
        if (d.kind === 'enemy') { if (d.ai.pend.length < 8) d.ai.pend.push({ type: 'disable', ability: p.ability, at: w.t + reactionOf(d) }); }
        else if (d.ai.useBkb && d.ai.bkbAt == null) d.ai.bkbAt = w.t + (d.reaction || 0);
      }
    });
    w.on('damage', (p) => {
      const d = w.get(p.target);
      if (!d || !isFoe(d) || !d.ai || !d.scenario) return;
      if (d.scenario.dummyEscape === 'blink_on_first_hit' && !d.ai.blink.used) d.ai.blink.pending = true;
    });
    w.on('bolt', (p) => {   // disable_escape: the bolt landed -> run
      const u = w.get(p.unit);
      if (p.phase === 'hit' && u && u.kind === 'enemy' && u.ai && u.ai.behavior === 'disable_escape') u.ai.escaping = true;
    });
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

  // ---------- enemy NPC AI (v4) ----------
  // reaction time: x2.5 while the enemy is unaware of the hero (assumption, no Dota analogue)
  const reactionOf = e => (e.reaction || 0) * (e.aware ? 1 : GM().ENEMY.unawareMul);
  const away = (from, e) => (from.x === e.x && from.y === e.y) ? (e.facing || 0) : Math.atan2(e.y - from.y, e.x - from.x);

  // awareness 0..1 is a notice DELAY, not a radius: s of unbroken plain sight before the enemy registers the hero = notice x (1 - awareness)
  // (assumption, no Dota analogue). Fog / line of sight / high ground / Ghost Walk / Shadow Blade still decide whether it SEES the hero at all.
  const noticeDelay = e => (e.notice != null ? e.notice : GM().ENEMY.notice) * (1 - Math.max(0, Math.min(1, e.awareness != null ? e.awareness : 0)));

  function updateAware(w, e) {
    const h = w.hero, E = GM().ENEMY, a = e.ai;
    const dt = a.awareT == null ? 0 : Math.max(0, Math.min(0.5, w.t - a.awareT));
    a.awareT = w.t;
    let sees = false;
    if (h && !h.dead) {
      sees = IT.Vision && IT.Vision.teamSees && w.map ? IT.Vision.teamSees(w, e.team, h) : canSee(w, e, h);
      const need = noticeDelay(e);
      if (sees) {
        a.notice = Math.min(need, (a.notice || 0) + dt * (U.dist(e, h) <= E.noticeNear ? E.noticeNearMul : 1));
        if (a.notice < need - 1e-9) sees = false;   // in sight but not registered yet
      } else a.notice = Math.max(0, (a.notice || 0) - dt * E.noticeDecay);
    } else a.notice = 0;
    if (w.t - e.lastHit < E.hitAwareFor) a.notice = noticeDelay(e);   // being hit makes it notice at once
    const was = e.aware;
    e.aware = sees || (w.t - e.lastHit) < E.hitAwareFor;
    e.ai.awareSince = e.aware ? (was ? e.ai.awareSince : w.t) : null;
  }

  // Start using an item: telegraph first (lead s), then fire at `until`. Returns true if started.
  function useItem(w, e, id, o) {
    const A = IT.Abilities, def = A && A.get(id);
    if (e.tele || !def || !e.items || !e.items.some(s => s && s.id === id) || A.check(w, e, id)) return false;
    const lead = e.telegraph || 0;
    w.emit('telegraph', { unit: e.id, item: id, lead });
    if (lead > 1e-9) { e.tele = { item: id, at: w.t, until: w.t + lead, o: o || {} }; return true; }
    return fireItem(w, e, id, o || {});
  }
  function fireItem(w, e, id, o) {
    const A = IT.Abilities, def = A && A.get(id);
    if (!def || A.check(w, e, id)) return false;
    issueStop(w, e); e.ai.moving = false;
    if (o.face != null) e.facing = o.face;
    A.spend(w, e, id);
    const it = e.items.find(x => x && x.id === id); if (it) it.cd = e.cd[id];
    w.emit('itemUse', { unit: e.id, ability: id });
    def.cast(w, e, id === 'forcestaff' ? { target: e.id } : o);
    return true;
  }
  function tickTele(w, e) {
    const t = e.tele;
    if (!t || w.t < t.until - 1e-9) return;
    e.tele = null;
    fireItem(w, e, t.item, t.o);
  }

  const blinkTo = (e, ang) => {   // a point ~blink_range away along `ang`
    const R = IT.Values.item(GM().ITEM_DOTA.blink, 'blink_range') * 0.95;
    return { x: e.x + Math.cos(ang) * R, y: e.y + Math.sin(ang) * R };
  };

  // first usable item of `chain` against a threat; `ang` = direction away from it
  function defend(w, e, chain, ang) {
    for (const id of chain) {
      const o = id === 'blink' ? blinkTo(e, ang) : id === 'forcestaff' ? { face: ang } : {};
      if (useItem(w, e, id, o)) return true;
    }
    return false;
  }

  // false = nowhere to run (rooted / boxed in): the caller may fight back instead
  function flee(w, e, h, E) {
    const a = e.ai;
    if (!IT.Status.canMove(e)) return false;
    if (w.t < a.fleeAt) return true;
    a.fleeAt = w.t + E.flee.think;
    const base = away(h, e);
    for (const da of [0, 0.7, -0.7, 1.4, -1.4]) {
      const p = fixPoint(w, e.x + Math.cos(base + da) * E.flee.step, e.y + Math.sin(base + da) * E.flee.step);
      if (p && U.dist(p, e) > 50) { issueMove(w, e, p.x, p.y); a.moving = false; return true; }
    }
    return false;
  }

  // Hero auto-attack: hit the hero while it is seen and within attack range (+ leash for a guard / hard+ foe: a melee foe steps in, a ranged one
  // stands its ground). Returns true while it is attacking. Out of reach: drops the order.
  function fightHero(w, e, h) {
    const a = e.ai, at = e.attack, cur = e.orders[0], on = !!cur && cur.type === 'attack';
    const reach = at.range + e.radius + h.radius + (a.behavior === 'defend' || e.fights ? GM().ENEMY.leash : 0);
    if (e.aware && !h.dead && !hasS(h, 'lift') && U.dist(e, h) <= reach && canSee(w, e, h)) {
      if (!on || cur.target !== h.id) IT.Orders.issue(w, e, { type: 'attack', target: h.id });
      return true;
    }
    if (on) issueStop(w, e);
    return false;
  }

  function tickEnemy(w, e) {
    const a = e.ai, h = w.hero, E = GM().ENEMY;
    tickTele(w, e);
    tickBkb(w, e);     // legacy useBkb
    if (tickBlink(w, e)) return;
    if (disabled(e)) { if (a.bolt.active) cancelBolt(w, e, 'disabled'); return; }
    tickBolt(w, e);
    if (a.bolt.active) return;
    // queued threats (hero disable casts aimed at us), acted on after the reaction time
    if (a.pend.length && !e.tele) {
      for (let i = 0; i < a.pend.length; i++) {
        if (w.t < a.pend[i].at - 1e-9) continue;
        a.pend.splice(i, 1);
        if (defend(w, e, ['bkb', 'euls', 'blink', 'forcestaff'], h ? away(h, e) : (e.facing || 0))) break;
      }
    }
    if (w.t < a.nextThink) return;
    a.nextThink = w.t + 0.1;
    updateAware(w, e);
    if (e.tele) return;
    // ground danger zones we stand in: dodge on foot (if mobile), else items
    if (IT.Status.canAct(e)) for (const t of w.ents) {
      if (t.dead || !t.danger || a.handled[t.id] || t.age < reactionOf(e)) continue;
      if (U.dist(e, t.danger) > t.danger.r + e.radius) continue;
      a.handled[t.id] = 1;
      const mobile = a.behavior !== 'stationary' && a.behavior !== 'defend' && IT.Status.canMove(e);
      const dest = mobile ? dodgeTarget(e, t.danger, w.map, w.t) : null;
      if (dest) { issueMove(w, e, dest.x, dest.y); a.moving = false; return; }
      if (defend(w, e, ['euls', 'blink', 'forcestaff', 'bkb'], away(t.danger, e))) return;
    }
    if (!h) return;
    const escaping = a.behavior === 'escape' || a.escaping;
    if (escaping && e.aware && a.awareSince != null && w.t - a.awareSince >= reactionOf(e) - 1e-9 && U.dist(e, h) < E.flee.range) {
      const d = U.dist(e, h), ang = away(h, e);
      if (d < E.shadowRange && !hasS(e, 'invisible') && useItem(w, e, 'shadowblade', {})) return;
      if ((a.escaping || d < 600) && useItem(w, e, 'blink', blinkTo(e, ang))) return;   // disable_escape: out of reach at once
      if (d < 500 && useItem(w, e, 'forcestaff', { face: ang })) return;
      if (flee(w, e, h, E)) return;
      a.cornered = w.t + 1.5;   // rooted / boxed in: fights back (below) instead of standing idle
    }
    if (a.behavior === 'defend' && e.aware && e.hp < e.maxHp * 0.5 && !hasS(e, 'invisible') && useItem(w, e, 'shadowblade', {})) return;
    if (e.attack && IT.Status.canAttack(e) && (a.behavior === 'defend' || e.fights || w.t < a.cornered)) {
      if (fightHero(w, e, h)) return;
      if (a.behavior === 'defend' && !e.orders.length && IT.Status.canMove(e) && U.dist(e, a.home) > 40) issueMove(w, e, a.home.x, a.home.y);
    } else if (e.attack && e.orders[0] && e.orders[0].type === 'attack') issueStop(w, e);
    if (a.behavior === 'wander' && IT.Status.canMove(e)) tickWander(w, e);
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
      if (e.dead || !e.ai) continue;
      if (e.kind === 'dummy') tickDummy(w, e);
      else if (e.kind === 'enemy') tickEnemy(w, e);
      else if (e.kind === 'spirit') tickSpirit(w, e);
    }
  });

  IT.Units = {
    spawnDummy, spawnEnemy, spawnSpirit, respawn, resetCombo, isFoe, looksEnemy, reactionOf, dummies, enemies, foes, dodgeTarget, blinkSpot, spiritAction,
  };
})(typeof window !== 'undefined' ? window : globalThis);
