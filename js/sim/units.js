// Dummies (scarecrows), enemies (NPC heroes + their AI; Free Play training dummies are refill-flagged enemies) + forge spirits: spawn, respawn, AI. Pure. See CONTRACT.md + docs/PLAN-v4.md.
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
  const trainers = w => w.query(e => !!e.refill);   // training dummies: scarecrows (kind 'dummy') + Free Play Standard / Expert foes (kind 'enemy', refill flag)
  const enemies = w => w.query(e => e.kind === 'enemy');
  const foes = w => w.query(isFoe);
  const disabled = e => !IT.Status.canAct(e) || hasS(e, 'hex') || hasS(e, 'knockback');
  const hardDisabled = e => !IT.Status.canAct(e) || hasS(e, 'hex');   // knockback excluded: forced movement still allows a cast (#52 innate blink)
  // Blink Dagger is disabled for blink_damage_cooldown (KV, 3 s) after damage from an enemy unit (items.js sets e._blinkLock) -- scripted blinks too (v6 #51)
  const blinkLocked = (w, e) => e._blinkLock != null && w.t < e._blinkLock - 1e-9;
  const canBlink = (w, e) => IT.Status.canAct(e) && !hasS(e, 'root') && !hasS(e, 'atosRoot') && !hasS(e, 'hex') && !blinkLocked(w, e);

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

  // v6 day / night: enemy hero vision 1800 by day, 800 by night, ramped through sunset / sunrise (IT.DayNight; the 'daynight' system keeps
  // e.vision current every tick, so notice / awareness / chase all use the same radius). Without daynight.js: the legacy w.night flag.
  const isNight = w => !!(w && (w.night || (w.map && w.map.night)));
  const enemyVision = w => { const E = GM().ENEMY; return IT.DayNight ? IT.DayNight.lerp(w, E.vision, E.visionNight) : isNight(w) ? E.visionNight : E.vision; };

  // movement speed an enemy gets from carried boots / travels (KV bonus_movement_speed; only one counts, travels first, like the hero)
  function bootBonus(items) {
    const id = Array.isArray(items) ? ['travels', 'boots'].find(b => items.indexOf(b) >= 0) : null;
    if (!id) return 0;
    try { const v = Number(IT.Values.item(GM().ITEM_DOTA[id], 'bonus_movement_speed')); return isFinite(v) ? v : 0; } catch (e) { return 0; }
  }

  // v6 #46: Euls' passive ms (KV item_cyclone bonus_movement_speed) -- carried by an enemy it adds to the base like boots
  function eulsBonus(items) {
    if (!Array.isArray(items) || items.indexOf('euls') < 0) return 0;
    try { const v = Number(IT.Values.item(GM().ITEM_DOTA.euls, 'bonus_movement_speed')); return isFinite(v) ? v : 0; } catch (e) { return 0; }
  }
  // total ms an enemy's items add on top of its base (only one boot counts; Euls stacks)
  const itemMs = items => bootBonus(items) + eulsBonus(items);
  // v6 #46: the unit's rolled BASE move speed: per hero (skin) a fixed value in ENEMY.msBase [285..320], +- ENEMY.msJitter per unit (hash of skin / name /
  // spot -- no rng draw, so seeded runs stay identical). Never below msBase[0].
  function rollMs(o, E) {
    const r = E.msBase || [285, 320], str = String(o.skin || '') + '|' + (o.name || '') + '|' + Math.round(o.x || 0) + ',' + Math.round(o.y || 0);
    const hs = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
    const skinPart = Math.round(r[0] + hs(String(o.skin || '')) * (r[1] - r[0])), j = (E.msJitter || 0);
    return Math.max(r[0], Math.min(r[1] + j, skinPart + Math.round((hs(str) * 2 - 1) * j)));
  }

  // Enemy NPC hero (v4). opts: x, y, skin, hp, armor, magicRes, ms, mana, behavior, items, awareness, reaction, telegraph, preset,
  // scenario ({stunBolt, ...} hooks), useBkb, refill. Dies at 0 hp (combat.js emits 'kill') unless opts.refill (training dummy: refills
  // below 25% hp instead, always aware, no auto-attack, 800 vision, ignored by towers; Free Play Standard / Expert go through spawnDummy).
  function spawnEnemy(w, o) {
    hook(w);
    const G_ = GM(), E = G_.ENEMY, p = o.preset ? G_.DUMMY_PRESETS[o.preset] : null;
    const pick = (k) => o[k] != null ? o[k] : p && p[k] != null ? p[k] : E[k];
    const behavior = o.behavior || 'stationary';
    const items = Array.isArray(o.items) ? o.items.filter(id => G_.ENEMY_ITEMS.includes(id)) : undefined;
    const baseMs = o.ms != null ? o.ms : p && p.ms != null ? p.ms : rollMs(o, E), bb = itemMs(items);   // v6 item 40 / #46: rolled base + the KV bonus_movement_speed of boots / travels / Euls
    const e = body(w, Object.assign({}, o, { items, preset: o.preset || 'enemy' }), 'enemy', {
      hp: pick('hp'), mana: pick('mana'), hpRegen: pick('hpRegen'), manaRegen: pick('manaRegen'), armor: pick('armor'), magicRes: pick('magicRes'),
      ms: baseMs + bb, reaction: pick('reaction'), radius: IT.Skins && IT.Skins.meta ? IT.Skins.meta(o.skin).hull : E.radius, vision: o.refill ? G_.DUMMY.vision : enemyVision(w),
    });
    e.msBase = baseMs; e.msBonus = bb;   // v6 #46: rolled base + item bonus (e.base.ms = both; the stats system never goes below base without a slow)
    e.ai = newAI(behavior, o.x, o.y, w.t);
    e.ai.useBkb = !!o.useBkb;
    if (behavior === 'disable_escape') e.scenario.stunBolt = true;   // disables the hero (stun bolt), then escapes
    e.behavior = behavior;
    e.telegraph = o.telegraph != null ? o.telegraph : E.telegraph;   // lead (s) between the 'telegraph' event and the item firing
    e.awareness = o.awareness != null ? o.awareness : E.awareness;
    e.notice = o.notice != null ? o.notice : E.notice;   // s of plain sight an awareness-0 enemy needs to register the hero
    e.refill = !!o.refill; e.aware = e.refill; e.tele = null; e.lastHit = -99;
    if (o.juke) e.juke = { x: o.juke.x, y: o.juke.y, near: o.juke.near || 500, at: null, item: null, done: false };   // v6 pit juke (tickJuke)
    if (o.name) e.name = o.name;
    // hero auto-attack (opts.attack: 'ranged'|'melee' override, false = none). Never auto-acquires: the AI orders it (see fightHero).
    const kind = o.attack === false || e.refill ? null : (typeof o.attack === 'string' ? o.attack : G_.ENEMY_ATTACK_KIND[o.skin] || 'ranged'), AT = kind && G_.ENEMY_ATTACK[kind];
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

  // Training dummy: never dies (combat.js refills it). A plain one is a scarecrow (kind 'dummy': stationary, no hp bar, no name/speech);
  // a mobile / scripted one (non-stationary preset behavior, stun bolt, scripted blink, bkb reaction: Free Play Standard / Expert) is a real
  // enemy NPC (spawnEnemy, kind 'enemy') with the refill flag, so it runs the one enemy behaviour system.
  function spawnDummy(w, o) {
    hook(w);
    const G_ = GM(), p = G_.DUMMY_PRESETS[o.preset || 'training'];
    const sc = o.scenario || {};
    const behavior = o.behavior || p.behavior;
    const hasAI = behavior !== 'stationary' || sc.stunBolt || (sc.dummyEscape && sc.dummyEscape !== 'none') || o.useBkb;
    if (hasAI) return spawnEnemy(w, Object.assign({}, o, { preset: o.preset || 'training', behavior, refill: true }));
    const e = body(w, o, 'dummy', p);
    e.ai = newAI(behavior, o.x, o.y, w.t);
    e.behavior = behavior;
    e.refill = true; e.aware = true;   // combos may script a scarecrow (combo.js begin): it then runs the same enemy tick
    e.noHpBar = true; e.scarecrow = true;
    return w.add(e);
  }

  function spawnSpirit(w, owner, x, y) {
    const ctx = owner.ctx || w.ctx, V = IT.Values, A = 'invoker_forge_spirit';
    const u = IT.DOTA.units.npc_dota_invoker_forged_spirit;
    const g = k => V.get(A, k, ctx);
    const hp = g('spirit_hp'), dmg = g('spirit_damage'), armor = g('spirit_armor'), range = g('spirit_attack_range');
    const e = {
      kind: 'spirit', team: 0, owner: owner.id, x, y, radius: u.HullRadius || 16, vision: IT.DayNight ? IT.DayNight.lerp(w, u.VisionDaytimeRange || 1200, u.VisionNighttimeRange || 800) : u.VisionDaytimeRange || 1200, visible: true,
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
    // v6 #50 intent triggers (spellLanded / allyHit), #52 Cold Snap / stun / hex deny an innate blink, #58 Ghost Walk slow awareness
    w.on('damage', (p) => {
      const t = w.get(p.target), s = w.get(p.src);
      if (!t || !t.intent || !s || s.team === t.team || !(p.dealt > 0)) return;
      if (p.ability && p.ability !== 'attack') t.intent.spellAt = w.t;
      for (const o of w.ents) if (o !== t && !o.dead && o.intent && o.team === t.team && o.intent.allyAt == null) o.intent.allyAt = w.t;
    });
    w.on('status', (p) => {
      const t = w.get(p.target), s = p.src != null ? w.get(p.src) : null;
      if (!t || !t.ai || (s && s.team === t.team)) return;
      if (p.status === 'slow' && p.ability === 'ghostwalk') { t.ai.gwAt = w.t; return; }
      if (!IT.Status.DISABLE[p.status] && p.status !== 'silence') return;
      if (t.intent && p.status !== 'silence') t.intent.spellAt = w.t;
      if (t.innate && p.status !== 'lift') denyBlink(w, t, p.ability || p.status);
      else if (t.innate && t.innate.wind) { const W = t.innate.wind; t.innate.wind = null; t.innate.want = { at: w.t, why: W.why }; w.emit('innateBlink', { unit: t.id, phase: 'interrupted', why: 'lift' }); }
    });
    w.on('castStart', (p) => {
      if (!DISABLES[p.ability]) return;
      const c = w.get(p.unit);
      if (!c) return;
      for (const d of w.ents) {
        if (d.dead || !isFoe(d) || !d.ai || d.team === c.team || !aimedAt(w, c, d, p)) continue;
        if (d.kind === 'enemy' && !d.refill) { if (d.ai.pend.length < 8) d.ai.pend.push({ type: 'disable', ability: p.ability, at: w.t + reactionOf(d) }); }
        else if (d.ai.useBkb && d.ai.bkbAt == null) d.ai.bkbAt = w.t + (d.reaction || 0);   // training dummy: BKB `reaction` s after the disable cast starts
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
    // v6 item 28: ally / Roshan deaths (combat.js only kills enemies), Roshan aggro + scripted death; a kill mid-TP ends the channel
    // (e.channel is left set: ranked reads it for how.channel)
    w.on('damage', (p) => {
      const t = w.byId.get(p.target), s = w.get(p.src);
      if (!t || t.dead || (t.kind !== 'ally' && t.kind !== 'roshan')) return;
      if (t.kind === 'roshan') {
        if (s && s.team !== t.team) t.rosh.aggro = s.id;
        if (p.ability === 'attack' && s && s.team === 1 && t.rosh.scriptHits > 0 && ++t.rosh.hits >= t.rosh.scriptHits) t.hp = 0;
        if (t.hp <= 0) killRoshan(w, t, p.src);
        return;
      }
      if (t.hp <= 0) { t.hp = 0; t.killed = true; w.emit('allyDown', { unit: t.id, by: p.src }); w.remove(t); }
    });
    w.on('kill', (p) => {
      const u = w.byId.get(p.unit);
      if (u && u.channel && u.channel.kind === 'tp') w.emit('channelEnd', { unit: u.id, kind: 'tp', ok: false, interrupted: true, killed: true });
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
      if (!canSee(w, d, h)) return cancelBolt(w, d, 'lost');   // v6: a hero that turns invisible (or leaves sight) mid-cast is never targeted
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
    if (!canBlink(w, d)) { if (bl.tellEnd) { bl.tellEnd = 0; setAnim(d, 'idle'); } return false; }
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
      a.seesHero = sees;   // v6: raw sight (before the notice delay): only then may the AI read the hero's real position
      if (sees) {
        const p = a.heroAt, dt0 = p && !p.guess ? w.t - p.t : 0;   // v6 #52: seen velocity (engage-blink lead)
        if (dt0 > 0.05 && dt0 < 0.5) a.heroVel = { x: (h.x - p.x) / dt0, y: (h.y - p.y) / dt0 };
        a.heroAt = { x: h.x, y: h.y, t: w.t };
      }
      const need = noticeDelay(e);
      if (sees) {
        a.notice = Math.min(need, (a.notice || 0) + dt * (U.dist(e, h) <= E.noticeNear ? E.noticeNearMul : 1));
        if (a.notice < need - 1e-9) sees = false;   // in sight but not registered yet
      } else a.notice = Math.max(0, (a.notice || 0) - dt * E.noticeDecay);
    } else { a.notice = 0; a.seesHero = false; }
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
    w.emit('telegraph', { unit: e.id, item: id, lead, say: (o && o.say) || null });
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
    if (id === 'dust') e.ai.dustCheck = w.t + 0.15;   // v6 #58: read the result ('dustResult': '!' hit / '?' miss)
    if (id === 'dust' && it) e.items[e.items.indexOf(it)] = null;   // one charge: consumed (the HUD card drops it)
    return true;
  }

  // v6 enemy Dust of Appearance (fair + telegraphed). A chaser that LOST the invisible hero (Ghost Walk / Shadow Blade, not plain fog)
  // walks to the last-seen spot L {x, y, t: when the team last saw it}; standing there (ENEMY.dustAt) it waits out its reaction time
  // counted from L.t, then telegraphs ('telegraph' event: the "Dust!" shout, e.telegraph s lead) and casts the item at its own feet:
  // IT.Items 'dust' puts 'revealed' + slow on every enemy within KV radius, so IT.Vision.teamSees sees a hero that stayed close. One charge
  // per scenario. -> true while the carrier holds the spot for it (waiting / telegraphing / just cast), false = carry on searching.
  function useDust(w, e, L) {
    const a = e.ai, h = w.hero;
    if (e.tele) return e.tele.item === 'dust';
    if (a.dustUsed || !L || !h || h.dead || !e.items || !e.items.some(s => s && s.id === 'dust') || !IT.Status.hidden(h)) return false;
    if (U.dist(e, L) > GM().ENEMY.dustAt || disabled(e)) return false;
    if (w.t < (L.t || 0) + (e.reaction || 0) - 1e-9) return true;
    if (!useItem(w, e, 'dust', {})) return false;
    a.dustUsed = true;
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

  // v6 pit juke (ranked pit_trap: unit `juke`, e.juke = { x, y (the pit's deepest point), near }): a foe waiting on the bank that, once
  // hurt or once it SEES the hero within `near`, jumps INTO the pit after its reaction time: Blink onto the point, else Force Staff toward
  // it (Blink is locked for 3 s after damage, so a hurt foe pushes). Telegraphed: a 'blinkTell' fx flash on the unit + the useItem
  // 'telegraph' event (e.telegraph s lead, speech line 'juke'), then the item's own fx / sound. A fire that fails (stunned at the end of the
  // telegraph) is retried. Afterwards it holds the pit: stationary at the landing spot, no item escapes. -> true while it owns the tick.
  function tickJuke(w, e) {
    const j = e.juke, h = w.hero, a = e.ai;
    if (!j || j.done) return false;
    if (j.item) {   // telegraphed: wait for the fire, confirm it by the spent cooldown
      if (e.tele) return true;
      if ((e.cd[j.item] || 0) > 0) {
        j.done = true; j.t = w.t; a.behavior = 'stationary'; a.home = { x: e.x, y: e.y }; a.moving = false; a.escaping = false;
        return true;
      }
      j.item = null;   // the fire failed: try again
    }
    if (j.at == null) {
      const hurt = e.lastHit > -99, close = !!h && !h.dead && a.seesHero && U.dist(e, h) <= j.near;
      if (!hurt && !close) return false;
      j.at = w.t + reactionOf(e); j.why = hurt ? 'hurt' : 'near';
    }
    if (w.t < j.at - 1e-9) return true;
    if (disabled(e) || !IT.Status.canAct(e)) return true;
    const ang = Math.atan2(j.y - e.y, j.x - e.x), lead = e.telegraph || 0;
    for (const id of ['blink', 'forcestaff']) {
      if (!useItem(w, e, id, id === 'blink' ? { x: j.x, y: j.y, say: 'juke' } : { face: ang, say: 'juke' })) continue;
      j.item = id;
      w.emit('fx', { name: 'blinkTell', x: e.x, y: e.y, unit: e.id, dur: Math.max(0.35, lead) });
      if (!e.tele) tickJuke(w, e);   // no telegraph lead: it already fired
      return true;
    }
    return true;
  }

  // first usable item of `chain` against a threat; `ang` = direction away from it
  function defend(w, e, chain, ang) {
    if (e.juke) return false;   // a pit juker spends its items on the juke only and then holds the pit
    if (!itemOk(w, e)) return false;   // v6 #50: tier execution (exec.itemP)
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
    const base = e.intent && e.intent.kind === 'flee_to_tower' ? fleeAng(w, e, h) : away(h, e);   // v6 #50: bend toward a friendly tower
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
    const reach = at.range + e.radius + h.radius + (a.behavior === 'defend' || (e.fights && a.behavior !== 'hold') ? GM().ENEMY.leash : 0);   // 'hold': never leaves its post
    if (e.aware && !h.dead && !hasS(h, 'lift') && U.dist(e, h) <= reach && canSee(w, e, h)) {
      if (!on || cur.target !== h.id) IT.Orders.issue(w, e, { type: 'attack', target: h.id });
      return true;
    }
    if (on) issueStop(w, e);
    return false;
  }

  // ---------- v6 #50 / #52 / #58: tier EXECUTION, scenario intents, innate blink, enemy TP, Ghost Walk awareness ----------
  // e.exec = the tier's execution row (IT.DIFFICULTY[tier].exec, set by ranked apply); without one (Free Play, tests) the AI executes
  // perfectly (itemP 1, no jitter / sway). Random draws come from a per-unit hash RNG (never w.rng: seeded runs stay identical elsewhere).
  const EXEC0 = { jitter: 0, itemP: 1, predict: 1, sway: 0, dodge: false, gwDust: 0, gwReact: 1, blinkCast: 0.25 };
  const execOf = e => (e && e.exec) || EXEC0;
  function rngOf(e) {
    if (!e._rng) {
      const s = String(e.skin || '') + '|' + e.id + '|' + Math.round(e.x || 0) + ',' + Math.round(e.y || 0);
      let hh = 2166136261; for (let i = 0; i < s.length; i++) { hh ^= s.charCodeAt(i); hh = Math.imul(hh, 16777619); }
      e._rng = U.mulberry32(hh >>> 0);
    }
    return e._rng;
  }
  // does the unit use its defensive item / innate blink this time? (exec.itemP; one roll holds 2 s so a miss is a real hesitation)
  function itemOk(w, e) {
    const p = execOf(e).itemP;
    if (!(p < 1)) return true;
    if (e._itemRoll && w.t < e._itemRoll.until) return e._itemRoll.ok;
    const ok = rngOf(e)() < p;
    e._itemRoll = { ok, until: w.t + 2 };
    return ok;
  }
  // waypoint error (exec.jitter x k), re-rolled every ENEMY.intent.rethink s. Used where the destination is an area, not a target: the
  // march goal (inside the gate ring), the kite spot. (Chasers / runners stay exact: their tier quality is the belief / speed rows, and a
  // runner must keep a readable line for Sun Strike leads.)
  function jit(w, e, k) {
    const J = execOf(e).jitter * (k == null ? 1 : k);
    if (!(J > 0)) return { x: 0, y: 0 };
    if (!e._jit || w.t >= e._jit.until) {
      const r = rngOf(e), an = r() * U.TAU, m = Math.sqrt(r());
      e._jit = { ux: Math.cos(an) * m, uy: Math.sin(an) * m, until: w.t + GM().ENEMY.intent.rethink };
    }
    return { x: e._jit.ux * J, y: e._jit.uy * J };
  }
  // run direction away from `from`, bent (<= ENEMY.intent.towerBend rad) toward the nearest friendly tower within 3500 u
  function fleeAng(w, e, from) {
    const base = away(from, e), bend = GM().ENEMY.intent.towerBend;
    let best = null, bd = 3500;
    for (const t of w.ents) if (t.kind === 'tower' && !t.dead && t.team === e.team) { const d = U.dist(t, e); if (d < bd) { bd = d; best = t; } }
    if (!best || bd < 250) return base;
    const df = U.angDiff(base, Math.atan2(best.y - e.y, best.x - e.x));
    return base + Math.max(-bend, Math.min(bend, df));
  }

  // ---- intents (v6 #50): what a scenario unit WANTS. d.intent = { kind, phases?: [{ on, then }] }; without one it is derived from the
  // old fields (mot / behavior / juke). engine(kind) = the mover that executes it: ranked script() mot (flee / chase / march / kite) or the
  // units.js behavior (guard / hold / defend / escape / farm / stationary). Phases switch the kind once each, after the tier reaction.
  const KINDS = ['flee_to_tower', 'chase', 'farm_then_tp', 'gank_from_fog', 'hold_highground', 'blink_in', 'kite', 'bait', 'march', 'defend', 'idle_guard', 'attack_ally'];
  const TRIGGERS = ['spotted', 'lowHp', 'spellLanded', 'allyHit', 'timer'];
  const GANK_PHASES = [{ on: 'spotted', then: 'chase' }, { on: 'allyHit', then: 'chase' }, { on: 'spellLanded', then: 'chase' }];
  function intentOf(d) {
    d = d || {};
    if (d.intent) return typeof d.intent === 'string' ? { kind: d.intent } : d.intent;
    const m = d.mot, b = d.behavior;
    return { kind: m === 'chase' ? 'chase' : m === 'flee' ? 'flee_to_tower' : m === 'march' ? 'march' : d.juke ? 'bait'
      : b === 'escape' ? 'flee_to_tower' : b === 'disable_escape' ? 'bait' : b === 'defend' ? 'defend' : 'idle_guard' };
  }
  function engine(kind, d) {
    d = d || {};
    switch (kind) {
      case 'chase': case 'blink_in': return { mot: 'chase', behavior: 'stationary' };
      case 'flee_to_tower': return d.behavior === 'escape' ? { mot: null, behavior: 'escape' } : { mot: 'flee', behavior: 'stationary' };
      case 'march': return { mot: 'march', behavior: 'stationary' };
      case 'kite': return { mot: 'kite', behavior: 'stationary' };
      case 'defend': return { mot: null, behavior: 'defend' };
      case 'hold_highground': return d.mot === 'still' ? { mot: 'still', behavior: 'stationary' } : { mot: null, behavior: 'hold' };
      case 'gank_from_fog': return { mot: null, behavior: 'stationary' };
      case 'farm_then_tp': return { mot: null, behavior: 'farm' };
      case 'bait': return { mot: d.mot || null, behavior: d.behavior || 'stationary' };
      case 'attack_ally': return { mot: null, behavior: 'stationary' };   // v6 item 28: hits our ally / tower / Roshan (tickAttackAlly)
      default: return d.mot === 'still' ? { mot: 'still', behavior: 'stationary' } : { mot: d.mot || null, behavior: d.behavior || 'guard' };
    }
  }
  // react = the tier reaction s (a 'still' unit's e.reaction is 99 until a phase wakes it)
  function attach(e, d, react) {
    const I0 = intentOf(d), kind = KINDS.indexOf(I0.kind) >= 0 ? I0.kind : 'idle_guard';
    const phases = (Array.isArray(I0.phases) ? I0.phases : kind === 'gank_from_fog' ? GANK_PHASES : []).filter(p => p && KINDS.indexOf(p.then) >= 0);
    e.intent = { kind, base: kind, phases, fired: phases.map(() => false), t0: null, pend: null, d: { mot: (d && d.mot) || null, behavior: (d && d.behavior) || null },
      react: react != null ? react : e.reaction, spellAt: null, allyAt: null, log: [kind] };
    return e.intent;
  }
  function setIntent(w, e, kind, on) {
    const I = e.intent;
    if (!I || I.kind === kind || KINDS.indexOf(kind) < 0) return false;
    const from = I.kind, eng = engine(kind, I.d), a = e.ai;
    I.kind = kind; I.log.push(kind);
    if (e.scn) { e.scn.mot = eng.mot; e.scn.next = 0; }
    a.behavior = !e.scn && eng.mot === 'flee' ? 'escape' : eng.behavior; e.behavior = a.behavior;
    a.home = { x: e.x, y: e.y }; a.moving = false; a.mode = 'idle'; a.pauseUntil = 0;
    if (eng.mot !== 'still' && (e.reaction || 0) >= 50) e.reaction = I.react;
    if (kind === 'flee_to_tower') e.fights = false;
    if ((kind === 'chase' || kind === 'blink_in') && !e.belief && IT.Belief) e.belief = IT.Belief.create(e, e.beliefP || IT.Belief.params(null), { idx: 0, n: 1 });
    if (kind === 'blink_in' && !e.innate) e.innate = newInnate(w);
    if (kind !== 'chase' && kind !== 'blink_in' && !held(w, e) && e.orders.length && e.orders[0].type !== 'attack') issueStop(w, e);
    w.emit('intent', { unit: e.id, kind, from, on: on || null });
    return true;
  }
  function trig(w, e, on) {
    const I = e.intent, a = e.ai;
    if (on === 'spotted') return !!(a.seesHero && e.aware);
    if (on === 'lowHp') return e.hp < GM().ENEMY.intent.lowHp * e.maxHp;
    if (on === 'spellLanded') return I.spellAt != null;
    if (on === 'allyHit') return I.allyAt != null;
    if (on.indexOf('timer:') === 0) return w.t - I.t0 >= Number(on.slice(6)) - 1e-9;
    return false;
  }
  // phase runner (think stage): the first unfired phase whose trigger holds switches the intent after the tier reaction (x unawareMul
  // while unaware; a timer phase switches at once)
  function tickIntent(w, e) {
    const I = e.intent;
    if (!I) return;
    if (I.t0 == null) I.t0 = w.t;
    if (I.pend) { if (w.t >= I.pend.at - 1e-9) { const p = I.pend; I.pend = null; setIntent(w, e, p.then, p.on); } return; }
    for (let i = 0; i < I.phases.length; i++) {
      if (I.fired[i]) continue;
      const ph = I.phases[i], on = String(ph.on || '');
      if (!trig(w, e, on)) continue;
      I.fired[i] = true;
      const delay = on.indexOf('timer:') === 0 ? 0 : (I.react || 0) * (e.aware ? 1 : GM().ENEMY.unawareMul);
      if (delay <= 1e-9) setIntent(w, e, ph.then, on);
      else I.pend = { at: w.t + delay, then: ph.then, on };
      return;
    }
  }
  // busy with something no order may break: an innate blink wind-up / recovery / Cold-Snap deny, or a TP channel (ranked script skips it)
  function held(w, e) {
    const n = e.innate;
    return !!((n && (n.wind || w.t < n.recover - 1e-9 || w.t < n.denyUntil - 1e-9)) || (e.channel && e.channel.kind === 'tp'));
  }

  // ---- innate blink (v6 #52: Queen of Pain / Anti-Mage style ability, NOT the dagger: works while damaged). Turn to face the landing
  // spot (ENEMY.blink.turn rad/s), tier cast point (exec.blinkCast), vanish. Telegraphed: fx 'blinkWindup' + 'itemUse' / 'cast' (chip +
  // item sound) + status 'channel'. A stun / Cold Snap freeze / hex / silence during the wind-up cancels it and denies blinking for
  // ENEMY.blink.deny s (renewed by every Cold Snap proc); a Tornado lift cancels it (it retries after landing).
  const newInnate = w => ({ readyAt: w ? w.t : 0, wind: null, want: null, denyUntil: -1, recover: -1, hitT: -99, n: 0 });
  function denyBlink(w, e, why) {
    const n = e.innate;
    if (!n) return;
    n.denyUntil = Math.max(n.denyUntil, w.t + GM().ENEMY.blink.deny);
    const W = n.wind;
    if (W) {
      n.wind = null;
      const ch = IT.Status.find(e, 'channel'); if (ch && ch.data && ch.data.ability === 'blinkWindup') IT.Status.remove(w, e, 'channel');
      n.want = { at: w.t, why: W.why };
      if (e.anim && e.anim.name === 'blink') setAnim(e, 'idle');
      w.emit('fx', { name: 'blinkDenied', x: e.x, y: e.y, unit: e.id });
    }
    w.emit('innateBlink', { unit: e.id, phase: 'denied', why, interrupted: !!W, x: e.x, y: e.y });
  }
  function escapeSpot(w, e) {
    const h = w.hero, a = e.ai, R = GM().ENEMY.blink.range;
    const from = (a.seesHero && h) ? h : (e.belief && IT.Belief ? IT.Belief.where(e.belief) : null) || a.heroAt || h || { x: e.x - 1, y: e.y };
    const ang = fleeAng(w, e, from), foeT = w.ents.filter(t => t.kind === 'tower' && !t.dead && t.team !== e.team), TR = 700 + 150;   // towers.js RANGE + margin
    const safe = (x, y) => !foeT.some(t => Math.hypot(t.x - x, t.y - y) < TR);   // never blink under an enemy tower
    for (const k of [1, 0.8, 0.6, 0.4]) for (const da of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2]) {
      const x = e.x + Math.cos(ang + da) * R * k, y = e.y + Math.sin(ang + da) * R * k;
      if (!walkable(w, x, y)) continue;
      if (safe(x, y)) return { x, y };
    }
    return null;
  }
  function engageSpot(w, e, h) {
    const B = GM().ENEMY.blink, v = e.ai.heroVel || { x: 0, y: 0 }, P = execOf(e).predict;
    const tx = h.x + v.x * P * 0.4, ty = h.y + v.y * P * 0.4;
    const ang = Math.atan2(ty - e.y, tx - e.x), k = Math.min(B.range, Math.max(0, Math.hypot(tx - e.x, ty - e.y) - B.land));
    return k > 50 ? fixPoint(w, e.x + Math.cos(ang) * k, e.y + Math.sin(ang) * k) : null;
  }
  function startBlink(w, e, sp, why) {
    const n = e.innate, B = GM().ENEMY.blink, X = execOf(e);
    issueStop(w, e); e.ai.moving = false;
    const ang = Math.atan2(sp.y - e.y, sp.x - e.x), turn = Math.abs(U.angDiff(e.facing || 0, ang)), dur = turn / B.turn + X.blinkCast;
    n.wind = { at: w.t + dur, x: sp.x, y: sp.y, ang, why, t0: w.t, lt: w.t };
    IT.Status.add(w, e, 'channel', dur + 0.5, { src: e.id, ability: 'blinkWindup', data: { ability: 'blinkWindup' } });
    setAnim(e, 'blink');
    w.emit('fx', { name: 'blinkWindup', x: e.x, y: e.y, unit: e.id, dur, tx: sp.x, ty: sp.y });
    w.emit('itemUse', { unit: e.id, ability: 'blink', innate: true });
    w.emit('cast', { unit: e.id, kind: 'item', ability: 'blink', x: sp.x, y: sp.y, innate: true });
    w.emit('innateBlink', { unit: e.id, phase: 'start', why, x: sp.x, y: sp.y, dur });
  }
  // every tick (before the disabled check): turn, then vanish at the end of the cast point. true while winding up.
  function tickWindup(w, e) {
    const n = e.innate;
    if (!n || !n.wind) return false;
    const W = n.wind, ch = IT.Status.find(e, 'channel');
    if (!ch || !ch.data || ch.data.ability !== 'blinkWindup' || !IT.Status.canAct(e) || hasS(e, 'hex') || hasS(e, 'silence')) {
      if (!IT.Status.canAct(e) || hasS(e, 'hex') || hasS(e, 'silence')) denyBlink(w, e, 'disabled');
      else { n.wind = null; n.want = { at: w.t + 0.1, why: W.why }; if (e.anim.name === 'blink') setAnim(e, 'idle'); w.emit('innateBlink', { unit: e.id, phase: 'interrupted', why: 'order' }); }
      return false;
    }
    const turn = GM().ENEMY.blink.turn, df = U.angDiff(e.facing || 0, W.ang), st = turn * Math.max(0, w.t - W.lt);
    e.facing = Math.abs(df) <= st ? W.ang : (e.facing || 0) + Math.sign(df) * st;
    W.lt = w.t;
    if (w.t < W.at - 1e-9) return true;
    const B = GM().ENEMY.blink, p = fixPoint(w, W.x, W.y) || { x: e.x, y: e.y }, fx = e.x, fy = e.y;
    n.wind = null;
    IT.Status.remove(w, e, 'channel'); IT.Status.remove(w, e, 'knockback');   // the blink ends any forced movement
    e.x = p.x; e.y = p.y; e.orders.length = 0; e.path.length = 0; e.facing = W.ang;
    n.readyAt = w.t + B.cd; n.recover = w.t + B.recover; n.n++;
    e.ai.home = { x: p.x, y: p.y }; e.ai.moving = false; e.ai.pauseUntil = w.t + 1;
    setAnim(e, 'idle');
    w.emit('blink', { unit: e.id, fromX: fx, fromY: fy, x: p.x, y: p.y, innate: true });
    w.emit('innateBlink', { unit: e.id, phase: 'done', why: W.why, x: p.x, y: p.y });
    return false;
  }
  // think stage: hurt -> escape blink after the reaction; intent blink_in -> engage blink once the hero is seen in range. true = owns the tick
  function thinkInnate(w, e) {
    const n = e.innate;
    if (!n) return false;
    if (n.wind || w.t < n.recover - 1e-9) return true;
    if (w.t < n.denyUntil - 1e-9) { if (e.orders.length && e.orders[0].type !== 'attack') issueStop(w, e); return true; }
    const B = GM().ENEMY.blink, h = w.hero, a = e.ai;
    if (e.lastHit > n.hitT) { n.hitT = e.lastHit; if (!n.want) n.want = { at: w.t + reactionOf(e), why: 'escape' }; }
    if (!n.want && e.intent && e.intent.kind === 'blink_in' && h && !h.dead && a.seesHero && e.aware) {
      const dd = U.dist(e, h);
      if (dd > B.land + 200 && dd <= B.near) n.want = { at: w.t + reactionOf(e), why: 'engage' };
    }
    if (!n.want || w.t < n.want.at - 1e-9 || w.t < n.readyAt - 1e-9) return false;
    if (hardDisabled(e) || hasS(e, 'silence') || hasS(e, 'root') || hasS(e, 'atosRoot') || e.tele) return false;
    const want = n.want;
    n.want = null;
    if (!itemOk(w, e)) { w.emit('innateBlink', { unit: e.id, phase: 'hesitate', why: want.why }); return false; }
    const sp = want.why === 'engage' ? (h ? engageSpot(w, e, h) : null) : escapeSpot(w, e);
    if (!sp) return false;
    cancelBolt(w, e, 'blink');
    startBlink(w, e, sp, want.why);
    return true;
  }

  // ---- intent farm_then_tp: farms its spot (small sway); once it SEES the hero (or is hurt) it channels a Town Portal (GAME.TP.dur s,
  // status 'channel' + e.channel { kind:'tp' } so the TP column renders) home. Any stun / freeze / hex (or a hit order) cancels it ->
  // intent flee_to_tower. A finished TP = the target got away (e.tpEscaped: ranked check fails 'escaped').
  function tpDest(w, e) {
    const m = w.map, ss = (m && m.structures) || [];
    const f = ss.find(s => s.kind === 'fountain' && s.team === e.team);
    if (f && m.center) return m.center(f.tx, f.ty);
    let best = null, bd = -1;
    for (const t of w.ents) if (t.kind === 'tower' && !t.dead && t.team === e.team) { const d = U.dist(t, e); if (d > bd) { bd = d; best = t; } }
    return best ? { x: best.x, y: best.y } : { x: e.x, y: e.y };
  }
  function thinkTP(w, e) {
    const I = e.intent, a = e.ai;
    if (!I || I.kind !== 'farm_then_tp' || e.tpEscaped || I.tpDone) return false;
    if (e.channel && e.channel.kind === 'tp') return true;
    if (I.tpAt == null) {
      if (!(a.seesHero && e.aware) && !(e.lastHit > -99)) return false;
      I.tpAt = w.t + reactionOf(e);
    }
    if (w.t < I.tpAt - 1e-9 || disabled(e) || e.tele) return false;
    if (!itemOk(w, e)) { I.tpAt = w.t + 2; return false; }
    return startTP(w, e);
  }
  // start a Town Portal channel (GAME.TP.dur s) to dest (default tpDest). o.remove: the unit leaves the map on arrival (still 'escaped')
  function startTP(w, e, dest, o) {
    if (!e || e.dead || (e.channel && e.channel.kind === 'tp')) return false;
    issueStop(w, e); if (e.ai) e.ai.moving = false;
    const dur = (GM().TP && GM().TP.dur) || 3, p = dest || tpDest(w, e);
    IT.Status.add(w, e, 'channel', dur + 0.5, { src: e.id, ability: 'enemyTp', data: { ability: 'enemyTp' } });
    e.channel = { kind: 'tp', t0: w.t, dur, x: p.x, y: p.y };
    e.tpRemove = !!(o && o.remove);
    w.emit('channelStart', { unit: e.id, kind: 'tp', dur, x: p.x, y: p.y });
    w.emit('fx', { name: 'tpStart', x: e.x, y: e.y, unit: e.id, dur });
    return true;
  }
  // v6 item 28: a scenario-planned TP (e.tpPlan { after: s since the intent started, near?: only once the hero is within near u,
  // dest?: {x,y}, remove? }): the fleeing target stops and channels once -- the Sun Strike / Tornado window
  function thinkPlanTP(w, e) {
    const P = e.tpPlan;
    if (!P || P.done || e.tpEscaped || (e.intent && e.intent.tpDone)) return false;   // one TP per unit (farm_then_tp may have used it)
    if (e.channel && e.channel.kind === 'tp') return true;
    if (P.t0 == null) P.t0 = (e.intent && e.intent.t0 != null) ? e.intent.t0 : w.t;
    if (w.t - P.t0 < (P.after || 0) - 1e-9 || disabled(e) || e.tele) return false;
    if (P.near != null && !(w.hero && U.dist(e, w.hero) <= P.near)) return false;
    P.done = true;
    return startTP(w, e, P.dest || null, { remove: !!P.remove });
  }
  function tickTP(w, e) {
    const c = e.channel;
    if (!c || c.kind !== 'tp') return false;
    const ch = IT.Status.find(e, 'channel'), mine = !!(ch && ch.data && ch.data.ability === 'enemyTp');
    if (!mine || disabled(e)) {
      if (mine) IT.Status.remove(w, e, 'channel');
      e.channel = null;
      if (e.intent) e.intent.tpDone = true;
      w.emit('channelEnd', { unit: e.id, kind: 'tp', ok: false, interrupted: true });
      w.emit('fx', { name: 'tpCancel', x: e.x, y: e.y, unit: e.id });
      if (e.intent) setIntent(w, e, 'flee_to_tower', 'tpCancel');
      return false;
    }
    if (w.t < c.t0 + c.dur - 1e-9) return true;
    IT.Status.remove(w, e, 'channel');
    e.channel = null; e.tpEscaped = true;
    if (e.intent) e.intent.tpDone = true;
    e.x = c.x; e.y = c.y; e.orders.length = 0; e.path.length = 0;
    w.emit('channelEnd', { unit: e.id, kind: 'tp', ok: true, interrupted: false });
    w.emit('fx', { name: 'tpArrive', x: c.x, y: c.y, unit: e.id });
    if (e.tpRemove) { w.remove(e); return true; }
    return false;
  }

  // ---------- v6 item 28: pickups (rune / Aegis), a friendly ally hero, Roshan ----------
  // spawnPickup: kind 'pickup' (pickKind / pick.kind), radius GAME.PICKUP.r. The 'pickups' system: the nearest hero / enemy (alive, not lifted)
  // whose centre is within r takes it: the entity is removed, then 'pickup' { unit, kind, id, x, y, team } fires (render caches the spot).
  function spawnPickup(w, o) {
    hook(w);
    const r = (GM().PICKUP && GM().PICKUP.r) || 100, k = o.kind === 'aegis' ? 'aegis' : 'rune';
    return w.add({ kind: 'pickup', pickKind: k, pick: { kind: k }, team: -1, x: o.x, y: o.y, radius: r, visible: true, t0: w.t });
  }
  const PICKERS = { hero: 1, enemy: 1 };
  IT.World.system('pickups', 22, (w) => {
    for (const p of w.ents) {
      if (p.dead || p.kind !== 'pickup') continue;
      let best = null, bd = Infinity;
      for (const u of w.ents) {
        if (u.dead || !PICKERS[u.kind] || u.refill || hasS(u, 'lift') || !(u.hp > 0)) continue;
        const d = U.dist(u, p);
        if (d <= p.radius && d < bd) { bd = d; best = u; }
      }
      if (!best) continue;
      w.remove(p);
      w.emit('pickup', { unit: best.id, kind: p.pickKind, id: p.id, x: p.x, y: p.y, team: best.team });
    }
  });
  // spawnAlly: a stationary friendly hero (team 0, not controllable) the enemy attacks. Dies at 0 hp ('allyDown'). o.frac = start hp fraction.
  function spawnAlly(w, o) {
    hook(w);
    const A = GM().ALLY || { hp: 900, armor: 3, magicRes: 0.25, radius: 24, vision: 1800, visionNight: 800 };
    const mx = o.hp || A.hp, hp = Math.max(1, Math.round(mx * (o.frac != null ? o.frac : 1)));
    const vis = IT.DayNight ? IT.DayNight.lerp(w, A.vision, A.visionNight) : A.vision;
    return w.add({
      kind: 'ally', team: 0, x: o.x, y: o.y, radius: A.radius, vision: vis, visionDay: A.vision, visionNight: A.visionNight, visible: true,
      hp, maxHp: mx, mana: 0, maxMana: 0, hpRegen: 0, manaRegen: 0, armor: A.armor, magicRes: A.magicRes, ms: 0, turnRate: 10,
      base: { ms: 0, armor: A.armor, magicRes: A.magicRes, hpRegen: 0, manaRegen: 0, as: 100, dmgMin: 0, dmgMax: 0, bat: 1.7, attackRange: 0 },
      skin: o.skin || 'default', name: o.name || '', facing: o.facing != null ? o.facing : -Math.PI / 2,
    });
  }
  // spawnRoshan: kind 'roshan', team 2. Hits back whoever damaged it last (in reach of its pit spot; never walks). o.hp / o.frac / o.armor;
  // o.scriptHits = dies on the Nth enemy (team 1) auto-attack hit (scenario pacing). Death: 'roshanDown' + an Aegis pickup at its spot.
  function spawnRoshan(w, o) {
    hook(w);
    const R = GM().ROSHAN || { hp: 6000, armor: 20, magicRes: 0.25, radius: 80, min: 65, max: 65, bat: 2, point: 0.6, range: 100, vision: 800 };
    const mx = o.hp || R.hp, hp = Math.max(1, Math.round(mx * (o.frac != null ? o.frac : 1))), armor = o.armor != null ? o.armor : R.armor;
    return w.add({
      kind: 'roshan', team: 2, x: o.x, y: o.y, radius: R.radius, vision: R.vision, visible: false, name: 'Roshan',
      hp, maxHp: mx, mana: 0, maxMana: 0, hpRegen: 0, manaRegen: 0, armor, magicRes: R.magicRes, ms: 0, turnRate: 10,
      base: { ms: 0, armor, magicRes: R.magicRes, hpRegen: 0, manaRegen: 0, as: 100, dmgMin: R.min, dmgMax: R.max, bat: R.bat, attackRange: R.range },
      attack: { min: R.min, max: R.max, bat: R.bat, point: R.point, range: R.range, projSpeed: 0, next: 0, target: null },
      home: { x: o.x, y: o.y }, rosh: { aggro: null, wind: null, next: 0, hits: 0, scriptHits: o.scriptHits || 0 }, facing: o.facing != null ? o.facing : Math.PI / 2,
    });
  }
  function killRoshan(w, r, by) {
    if (!r || r.dead || r.kind !== 'roshan') return;
    r.hp = 0; r.killed = true;
    w.emit('roshanDown', { unit: r.id, x: r.x, y: r.y, by: by != null ? by : null });
    w.remove(r);
    spawnPickup(w, { kind: 'aegis', x: r.x, y: r.y });
  }
  function tickRoshan(w, r) {
    const S = r.rosh, at = r.attack, t = S.aggro != null ? w.get(S.aggro) : null;
    const reach = u => U.dist(r, u) <= at.range + r.radius + (u.radius || 0) + 40;
    if (!t || !IT.Status.canAttack(r) || hasS(t, 'lift') || !reach(t)) { if (S.wind) { S.wind = null; setAnim(r, 'idle'); } return; }
    r.facing = Math.atan2(t.y - r.y, t.x - r.x);
    if (S.wind) {
      if (w.t < S.wind.at - 1e-9) return;
      S.wind = null; setAnim(r, 'idle');
      const dmg = at.min + Math.floor(rngOf(r)() * (at.max - at.min + 1));
      w.emit('attackHit', { src: r.id, target: t.id });
      IT.Combat.damage(w, { src: r.id, target: t, amount: dmg, type: 'physical', ability: 'attack' });
      return;
    }
    if (w.t < S.next - 1e-9) return;
    S.next = w.t + at.bat; S.wind = { at: w.t + at.point };
    setAnim(r, 'attack');
    w.emit('attackStart', { src: r.id, target: t.id });
  }

  // ---- v6 item 28 intent attack_ally: hit intent.target ('ally' | 'roshan' | 'tower': the nearest live one of that kind on another team)
  function attackTarget(w, e) {
    const k = (e.intent && e.intent.target) || 'ally';
    let best = null, bd = Infinity;
    for (const t of w.ents) {
      if (t.dead || t.kind !== k || t.team === e.team || !(t.hp > 0)) continue;
      const d = U.dist(e, t);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
  function tickAttackAlly(w, e) {
    const I = e.intent;
    if (!I || I.kind !== 'attack_ally' || !e.attack) return false;
    const t = attackTarget(w, e);
    if (!t || !IT.Status.canAttack(e) || hasS(t, 'lift')) return false;
    const cur = e.orders[0];
    if (!cur || cur.type !== 'attack' || cur.target !== t.id) IT.Orders.issue(w, e, { type: 'attack', target: t.id });
    return true;
  }
  // ---- v6 item 28 e.grab { kinds: ['rune'|'aegis'], at?: {x,y} }: a pickup of those kinds on the map -> walk onto it (after the tier
  // reaction); none yet -> walk to `at` (the rune spot) and wait there
  function tickGrab(w, e) {
    const G = e.grab;
    if (!G || !IT.Status.canMove(e)) return false;
    let p = null, bd = Infinity;
    for (const q of w.ents) if (!q.dead && q.kind === 'pickup' && G.kinds.indexOf(q.pickKind) >= 0) { const d = U.dist(e, q); if (d < bd) { bd = d; p = q; } }
    const go = (x, y) => { const cur = e.orders[0]; if (!cur || cur.type !== 'move' || Math.hypot(cur.x - x, cur.y - y) > 20) issueMove(w, e, x, y); };
    if (p) {
      if (G.seen !== p.id) { G.seen = p.id; G.goAt = w.t + (e.reaction || 0); }   // a rune / Aegis is watched for: the plain tier reaction (no unaware penalty)
      if (w.t < G.goAt - 1e-9) return !!G.at;
      go(p.x, p.y);
      return true;
    }
    if (!G.at) return false;
    if (U.dist(e, G.at) > 30) go(G.at.x, G.at.y);
    else if (e.orders.length && e.orders[0].type === 'move') issueStop(w, e);
    return true;
  }

  // ---- behavior 'guard' (intent idle_guard) / 'farm': fidget around the post within exec.sway (0 = stand still); hard+ also dodge on foot
  function tickGuard(w, e) {
    const a = e.ai, X = execOf(e), sway = a.behavior === 'farm' ? Math.max(60, 0.6 * X.sway) : X.sway;
    if (!(sway > 0) || !(e.ms > 0)) return;
    if (a.moving) { if (e.orders.length) return; a.moving = false; a.pauseUntil = w.t + 1.2 + rngOf(e)() * 1.8; return; }
    if (w.t < a.pauseUntil) return;
    const r = rngOf(e);
    for (let i = 0; i < 6; i++) {
      const an = r() * U.TAU, d = Math.sqrt(r()) * sway, p = fixPoint(w, a.home.x + Math.cos(an) * d, a.home.y + Math.sin(an) * d);
      if (p && Math.hypot(p.x - a.home.x, p.y - a.home.y) <= sway + 1) { issueMove(w, e, p.x, p.y); a.moving = true; return; }
    }
    a.pauseUntil = w.t + 1;
  }

  // ---- v6 #58 Ghost Walk awareness: a foe slowed by Ghost Walk's aura KNOWS Invoker is within its area_of_effect (KV, 450). Every 1 s it
  // narrows its belief to that ring (IT.Belief.sense: the sector between its facing and the last-seen bearing); once per episode it may
  // Dust its own feet (exec.gwDust chance, after exec.gwReact s; only a carrier with a charge). The Dust's result is read 0.15 s later:
  // 'dustResult' { hit } -> belief reacquire ('!') or a fooled chaser ('?').
  const gwRadius = (w, h) => { try { const v = Number(IT.Values.get('invoker_ghost_walk', 'area_of_effect', (h && h.ctx) || w.ctx)); return v > 0 ? v : 450; } catch (err) { return 450; } };
  function tickGhostSense(w, e) {
    const a = e.ai, h = w.hero;
    if (a.gw && (a.gwAt == null || w.t - a.gwAt > 3)) a.gw = null;
    if (a.gwAt == null || w.t - a.gwAt > 0.6 || !h || h.dead || a.seesHero || !IT.Status.hidden(h)) return false;
    const X = execOf(e), r = gwRadius(w, h);
    if (!a.gw) { a.gw = { next: 0, dust: rngOf(e)() < X.gwDust, dustAt: w.t + X.gwReact, n: 0 }; w.emit('ghostSense', { unit: e.id, r, dust: a.gw.dust, x: e.x, y: e.y }); }
    const S = a.gw;
    if (w.t >= S.next - 1e-9 && !(e.belief && e.belief.state === 'seen')) {   // (a belief still on 'seen' would ignore it: wait for the loss)
      S.next = w.t + 1; S.n++;
      if (e.belief && IT.Belief && IT.Belief.sense) IT.Belief.sense(w, e.belief, { x: e.x, y: e.y }, r, e.facing || 0);
      else a.heroAt = { x: e.x + Math.cos(e.facing || 0) * r * 0.6, y: e.y + Math.sin(e.facing || 0) * r * 0.6, t: w.t, guess: true };
    }
    if (S.dust && !a.dustUsed && !e.tele && w.t >= S.dustAt - 1e-9 && !disabled(e) && e.items && e.items.some(s => s && s.id === 'dust')) {
      if (useItem(w, e, 'dust', {})) { a.dustUsed = true; w.emit('ghostSense', { unit: e.id, phase: 'dust', x: e.x, y: e.y }); if (e.orders.length) issueStop(w, e); return true; }
    }
    return false;
  }
  function tickDustCheck(w, e) {
    const a = e.ai;
    if (a.dustCheck == null || w.t < a.dustCheck - 1e-9) return;
    a.dustCheck = null;
    const h = w.hero;
    if (!h) return;
    const hit = IT.Status.revealed(h) && (IT.Vision && IT.Vision.teamSees && w.map ? IT.Vision.teamSees(w, e.team, h) : true);
    w.emit('dustResult', { unit: e.id, hit });
    if (e.belief && IT.Belief) { if (hit) IT.Belief.observe(w, e.belief, h, true); else if (IT.Belief.miss) IT.Belief.miss(w, e.belief); }
  }

  function tickEnemy(w, e) {
    const a = e.ai, h = w.hero, E = GM().ENEMY;
    if (tickWindup(w, e)) return;   // v6 #52: an innate blink wind-up owns the unit (no item / order may break its channel)
    if (tickTP(w, e)) { if (w.t >= a.nextThink) { a.nextThink = w.t + 0.1; updateAware(w, e); } return; }
    tickTele(w, e);
    tickBkb(w, e);     // legacy useBkb
    if (tickBlink(w, e)) return;
    // v6 #52: a knockback (Deafening Blast, Force Staff) is forced movement, not a disable: an innate blink still answers it
    if (e.innate && hasS(e, 'knockback') && !hardDisabled(e) && w.t >= a.nextThink) { a.nextThink = w.t + 0.1; updateAware(w, e); if (thinkInnate(w, e)) return; }
    if (disabled(e)) { if (a.bolt.active) cancelBolt(w, e, 'disabled'); return; }
    tickBolt(w, e);
    if (a.bolt.active) return;
    if (e.refill) {   // training dummy (Free Play Standard / Expert, scripted combo dummy): per-tick dodge + wander / evasive, no awareness or item logic
      if (tickDodge(w, e) || !IT.Status.canMove(e)) return;
      if (a.behavior === 'wander') tickWander(w, e);
      else if (a.behavior === 'evasive') tickEvasive(w, e);
      return;
    }
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
    tickIntent(w, e);        // v6 #50 phases
    tickDustCheck(w, e);     // v6 #58 '!' / '?'
    if (tickGhostSense(w, e)) return;
    if (tickJuke(w, e)) return;
    if (e.tele) return;
    if (tickGrab(w, e)) return;   // v6 item 28: rune / Aegis contest
    if (thinkInnate(w, e) || thinkTP(w, e) || thinkPlanTP(w, e)) return;   // v6 #52 innate blink, #50 farm_then_tp, item 28 planned TP
    // ground danger zones we stand in: dodge on foot (if mobile), else items
    if (IT.Status.canAct(e)) for (const t of w.ents) {
      if (t.dead || !t.danger || a.handled[t.id] || t.age < reactionOf(e)) continue;
      if (U.dist(e, t.danger) > t.danger.r + e.radius) continue;
      a.handled[t.id] = 1;
      // a guard / farmer sidesteps on foot only at tiers with exec.dodge; a high-ground holder never leaves its post
      const mobile = (a.behavior === 'guard' || a.behavior === 'farm' ? execOf(e).dodge : a.behavior !== 'stationary' && a.behavior !== 'defend' && a.behavior !== 'hold') && IT.Status.canMove(e);
      const dest = mobile ? dodgeTarget(e, t.danger, w.map, w.t) : null;
      if (dest) { issueMove(w, e, dest.x, dest.y); a.moving = false; return; }
      if (defend(w, e, ['euls', 'blink', 'forcestaff', 'bkb'], away(t.danger, e))) return;
    }
    if (tickAttackAlly(w, e)) return;   // v6 item 28
    if (!h) return;
    // v6: an unseen hero (Ghost Walk, fog, high ground) is never located: the AI runs from where it last saw it
    // v6 item 27: a unit with a belief (ranked chasers, IT.Belief) runs from its best guess (last seen / predicted) instead
    const hp = a.seesHero ? h : (e.belief && IT.Belief ? IT.Belief.where(e.belief) : null) || a.heroAt || h;
    const escaping = a.behavior === 'escape' || a.escaping;
    if (escaping && e.aware && a.awareSince != null && w.t - a.awareSince >= reactionOf(e) - 1e-9 && U.dist(e, hp) < E.flee.range) {
      const d = U.dist(e, hp), ang = e.intent && e.intent.kind === 'flee_to_tower' ? fleeAng(w, e, hp) : away(hp, e);
      const ok = () => itemOk(w, e);   // v6 #50: exec.itemP (tier execution) gates every escape item
      if (d < E.shadowRange && !hasS(e, 'invisible') && ok() && useItem(w, e, 'shadowblade', {})) return;
      if ((a.escaping || d < 600) && ok() && useItem(w, e, 'blink', blinkTo(e, ang))) return;   // disable_escape: out of reach at once
      if (d < 500 && ok() && useItem(w, e, 'forcestaff', { face: ang })) return;
      if (flee(w, e, hp, E)) return;
      a.cornered = w.t + 1.5;   // rooted / boxed in: fights back (below) instead of standing idle
    }
    if (a.behavior === 'defend' && e.aware && e.hp < e.maxHp * 0.5 && !hasS(e, 'invisible') && itemOk(w, e) && useItem(w, e, 'shadowblade', {})) return;
    const post = a.behavior === 'defend' || a.behavior === 'hold';
    if (e.attack && IT.Status.canAttack(e) && (post || e.fights || w.t < a.cornered)) {
      if (fightHero(w, e, h)) return;
      if (post && !e.orders.length && IT.Status.canMove(e) && U.dist(e, a.home) > 40) issueMove(w, e, a.home.x, a.home.y);
    } else if (e.attack && e.orders[0] && e.orders[0].type === 'attack') issueStop(w, e);
    if (a.behavior === 'wander' && IT.Status.canMove(e)) tickWander(w, e);
    else if ((a.behavior === 'guard' || a.behavior === 'farm') && IT.Status.canMove(e)) tickGuard(w, e);
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
      if (e.kind === 'roshan' && !e.dead) { tickRoshan(w, e); continue; }
      if (e.dead || !e.ai) continue;
      if (e.kind === 'enemy' || e.kind === 'dummy') tickEnemy(w, e);
      else if (e.kind === 'spirit') tickSpirit(w, e);
    }
  });

  IT.Intent = { KINDS, TRIGGERS, of: intentOf, engine, attach, set: setIntent, tick: tickIntent, held, fleeAng, jit, itemOk, newInnate, execOf, denyBlink, gwRadius, startTP, tpDest };
  IT.Units = {
    spawnDummy, spawnEnemy, bootBonus, eulsBonus, itemMs, rollMs, spawnSpirit, respawn, resetCombo, isFoe, reactionOf, useDust, useItem, dummies, trainers, enemies, foes, dodgeTarget, blinkSpot, spiritAction,
    spawnPickup, spawnAlly, spawnRoshan, killRoshan,
  };
})(typeof window !== 'undefined' ? window : globalThis);
