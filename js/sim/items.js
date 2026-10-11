// Items: refresher, atos, vyse, shiva, meteorhammer, bkb, blink, boots/treads/travels. Pure. See CONTRACT.md + DECISIONS.md "Items".
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const A = IT.Abilities, S = IT.Status;
  const DOTA = id => IT.GAME.ITEM_DOTA[id];
  const iv = (id, key, lvl) => IT.Values.item(DOTA(id), key, lvl);
  const UNITS = { hero: 1, dummy: 1, spirit: 1 };
  const ATOS_SPEED = 1900;          // not in KV AbilityValues (ProjectileSpeed is not baked): Dota value
  const BOOTS = ['travels', 'treads', 'boots'];   // priority; only one counts
  const ids = ['refresher', 'atos', 'vyse', 'shiva', 'meteorhammer', 'bkb', 'blink', 'boots', 'treads', 'travels'];

  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const slotOf = (c, id) => c.items && c.items.find(s => s && s.id === id);
  const enemies = (w, c, fn) => w.query(u => UNITS[u.kind] && u.team !== c.team && fn(u));
  const base = id => ({
    kind: 'item', dota: DOTA(id),
    range() { return iv(id, 'castRange'); },
    castPoint() { return 0; },
    manaCost() { return iv(id, 'manaCost'); },
    cooldown() { return iv(id, 'cooldown'); },
  });
  function item(id, d) { return A.def(id, Object.assign(base(id), d)); }

  // ---- Refresher: reset every spell cd, every item cd except itself, and Invoke.
  item('refresher', {
    target: 'none',
    cast(w, c) {
      for (const k in c.cd) if (k !== 'refresher') c.cd[k] = 0;
      if (c.inv) c.inv.invokeCd = 0;
      for (const s of c.items) if (s && s.id !== 'refresher') s.cd = 0;
      w.emit('fx', { name: 'refresh', x: c.x, y: c.y, unit: c.id });
    },
  });

  // ---- Rod of Atos: tracking projectile -> atosRoot. Lifted target on arrival = miss.
  item('atos', {
    target: 'unit',
    cast(w, c, o) {
      const tid = o.target, dur = iv('atos', 'duration');
      w.emit('fx', { name: 'atosLaunch', x: c.x, y: c.y, unit: c.id, target: tid });
      w.thinker({
        kind: 'proj', team: c.team, fx: 'atos', x: c.x, y: c.y, z: 0, radius: 8, src: c.id, target: tid, speed: ATOS_SPEED, ability: 'atos',
        upd(w2, p, dt) {
          const t = w2.get(tid);
          if (!t || p.age > 5) { w2.emit('miss', { src: c.id, ability: 'atos', x: p.x, y: p.y }); return true; }
          const d = dist(p, t), st = p.speed * dt;
          p.facing = Math.atan2(t.y - p.y, t.x - p.x);
          if (d > st + t.radius * 0.5) { p.x += (t.x - p.x) / d * st; p.y += (t.y - p.y) / d * st; return false; }
          p.x = t.x; p.y = t.y;
          if (S.has(t, 'lift')) { w2.emit('miss', { src: c.id, ability: 'atos', x: p.x, y: p.y }); w2.emit('fx', { name: 'atosDodged', x: p.x, y: p.y }); return true; }
          if (S.add(w2, t, 'atosRoot', dur, { src: c.id, ability: 'atos' })) {
            w2.emit('hit', { src: c.id, target: t.id, ability: 'atos' });
            w2.emit('fx', { name: 'atosHit', x: p.x, y: p.y, unit: t.id, dur });
          } else {
            w2.emit('miss', { src: c.id, ability: 'atos', x: p.x, y: p.y });
            w2.emit('fx', { name: 'atosBlocked', x: p.x, y: p.y });
          }
          return true;
        },
      });
    },
  });

  // ---- Scythe of Vyse: instant hex.
  item('vyse', {
    target: 'unit',
    cast(w, c, o) {
      const t = w.get(o.target); if (!t) return;
      if (S.add(w, t, 'hex', iv('vyse', 'sheep_duration'), { src: c.id, ability: 'vyse' })) {
        w.emit('hit', { src: c.id, target: t.id, ability: 'vyse' });
        w.emit('fx', { name: 'hexHit', x: t.x, y: t.y, unit: t.id });
      } else { w.emit('miss', { src: c.id, ability: 'vyse', x: t.x, y: t.y }); w.emit('fx', { name: 'hexBlocked', x: t.x, y: t.y }); }
    },
  });

  // ---- Shiva's Guard: active ring blast; passive aura (-AS to nearby enemies); armor via itemStats.
  item('shiva', {
    target: 'none',
    cast(w, c) {
      const R = iv('shiva', 'blast_radius'), speed = iv('shiva', 'blast_speed'), dmg = iv('shiva', 'blast_damage');
      const slow = -iv('shiva', 'blast_movement_speed') / 100, sdur = iv('shiva', 'blast_debuff_duration');
      const hit = new Set(); let any = false;
      w.emit('fx', { name: 'shivaBlast', x: c.x, y: c.y, r: R, speed, unit: c.id });
      w.thinker({
        x: c.x, y: c.y, team: c.team, ability: 'shiva', ring: 0, ringMax: R,
        upd(w2, e) {
          e.ring = Math.min(R, speed * e.age);
          for (const u of enemies(w2, c, u => !hit.has(u.id) && dist(e, u) <= e.ring + (u.radius || 0))) {
            hit.add(u.id); any = true;
            IT.Combat.damage(w2, { src: c.id, target: u, ability: 'shiva', type: 'magical', amount: dmg });
            S.add(w2, u, 'slow', sdur, { src: c.id, ability: 'shiva', data: { pct: slow } });
            w2.emit('hit', { src: c.id, target: u.id, ability: 'shiva' });
          }
          if (e.ring < R) return false;
          if (!any) w2.emit('miss', { src: c.id, ability: 'shiva', x: e.x, y: e.y });
          return true;
        },
      });
    },
    passive(w, c) {
      const R = iv('shiva', 'aura_radius'), as = iv('shiva', 'aura_attack_speed');
      for (const u of enemies(w, c, u => dist(c, u) <= R)) {
        const s = S.find(u, 'shivaAura');
        if (s) s.until = w.t + 0.2;
        else S.add(w, u, 'shivaAura', 0.2, { src: c.id, ability: 'shiva', data: { stats: { as } } });
      }
    },
  });

  // ---- Meteor Hammer: channel; lands only if the channel completes.
  function burn(w, c, u, id) {
    const dur = iv(id, 'burn_duration'), step = iv(id, 'burn_interval') || 1, dmg = iv(id, 'burn_dps_units') * step;
    if (S.has(u, 'magicImmune')) return;
    S.add(w, u, 'burn', dur, { src: c.id, ability: id });
    S.add(w, u, 'slow', dur, { src: c.id, ability: id, data: { pct: iv(id, 'burn_slow') / 100 } });
    let n = 0; const total = Math.round(dur / step);
    w.thinker({
      x: u.x, y: u.y, team: c.team, ability: id,
      upd(w2, e) {
        const t = w2.get(u.id); if (!t) return true;
        while (n < total && e.age >= (n + 1) * step - 1e-9) { n++; IT.Combat.damage(w2, { src: c.id, target: t, ability: id, type: 'magical', amount: dmg }); }
        return n >= total;
      },
    });
  }
  item('meteorhammer', {
    target: 'point',
    channel() { return iv('meteorhammer', 'max_duration'); },
    cast(w, c, o) { w.emit('fx', { name: 'meteorChannel', x: o.x, y: o.y, unit: c.id, dur: iv('meteorhammer', 'max_duration') }); },
    channelEnd(w, c, o, interrupted) {
      if (interrupted) { w.emit('fx', { name: 'meteorCancel', x: o.x, y: o.y, unit: c.id }); return; }
      const id = 'meteorhammer', land = iv(id, 'land_time'), r = iv(id, 'impact_radius');
      w.emit('fx', { name: 'meteorFall', x: o.x, y: o.y, r, delay: land });
      w.thinker({
        x: o.x, y: o.y, r, team: c.team, ability: id, danger: { x: o.x, y: o.y, r, at: w.t + land },
        upd(w2, e) {
          if (e.age < land - 1e-9) return false;
          const hit = enemies(w2, c, u => dist(u, e) <= r + (u.radius || 0));
          w2.emit('fx', { name: 'meteorImpact', x: e.x, y: e.y, r });
          if (!hit.length) w2.emit('miss', { src: c.id, ability: id, x: e.x, y: e.y });
          for (const u of hit) {
            IT.Combat.damage(w2, { src: c.id, target: u, ability: id, type: 'magical', amount: iv(id, 'impact_damage_units') });
            S.add(w2, u, 'stun', iv(id, 'stun_duration'), { src: c.id, ability: id });
            burn(w2, c, u, id);
            w2.emit('hit', { src: c.id, target: u.id, ability: id });
          }
          return true;
        },
      });
    },
  });

  // ---- BKB: magicImmune, duration by use count (it.charges = uses so far, clamped to the last level), basic dispel.
  const BKB_DISPEL = ['slow', 'atosRoot', 'root', 'silence'];
  item('bkb', {
    target: 'none',
    cast(w, c) {
      const it = slotOf(c, 'bkb'), n = it.charges || 0;
      const dur = iv('bkb', 'duration', n);
      it.charges = n + 1;
      for (const t of BKB_DISPEL) S.remove(w, c, t);
      S.add(w, c, 'magicImmune', dur, { src: c.id, ability: 'bkb' });
      w.emit('fx', { name: 'bkb', x: c.x, y: c.y, unit: c.id, dur, use: n + 1 });
    },
  });

  // ---- Blink: beyond blink_range lands at blink_range_clamp; locked after enemy damage; not while rooted.
  item('blink', {
    target: 'point',
    range() { return Infinity; },    // never walk; cast clamps the distance
    canUse(w, c) {
      if (S.has(c, 'root') || S.has(c, 'atosRoot')) return 'rooted';
      if (c._blinkLock != null && w.t < c._blinkLock - 1e-9) return 'blinkDamaged';
      return null;
    },
    cast(w, c, o) {
      const R = iv('blink', 'blink_range'), clampD = iv('blink', 'blink_range_clamp');
      let dx = o.x - c.x, dy = o.y - c.y, d = Math.hypot(dx, dy);
      const fx = c.x, fy = c.y;
      if (d < 1e-6) { dx = Math.cos(c.facing); dy = Math.sin(c.facing); d = 0; }
      else { dx /= d; dy /= d; }
      const dd = d > R ? clampD : d;
      let x = c.x + dx * dd, y = c.y + dy * dd;
      if (w.map && IT.Nav && IT.Nav.nearestWalkable) { const p = IT.Nav.nearestWalkable(w.map, x, y); if (p) { x = p.x; y = p.y; } }
      w.emit('fx', { name: 'blinkStart', x: fx, y: fy, unit: c.id });
      c.x = x; c.y = y;
      c.path.length = 0;
      w.emit('blink', { unit: c.id, fromX: fx, fromY: fy, x, y });
      w.emit('fx', { name: 'blinkEnd', x, y, unit: c.id });
    },
  });

  // ---- boots family: passive stats merged into one permanent 'itemStats' status.
  for (const id of BOOTS) item(id, { target: 'none', range: () => 0, manaCost: () => 0, cooldown: () => 0 });

  function passiveStats(hero) {
    const st = { ms: 0, as: 0, armor: 0 };
    const has = id => !!slotOf(hero, id);
    const ranged = !hero.base || hero.base.attackRange > 150;
    const boots = BOOTS.find(has);
    if (boots === 'boots') st.ms += iv('boots', 'bonus_movement_speed');
    else if (boots === 'travels') st.ms += iv('travels', 'bonus_movement_speed');
    else if (boots === 'treads') { st.ms += iv('treads', ranged ? 'bonus_movement_speed_ranged' : 'bonus_movement_speed_melee'); st.as += iv('treads', 'bonus_attack_speed'); }
    if (has('shiva')) st.armor += iv('shiva', 'bonus_armor');
    return st;
  }

  // Idempotent: (re)creates/updates the permanent status when the item set changed, removes it when empty.
  function applyPassives(w, hero) {
    const st = passiveStats(hero), key = st.ms + '|' + st.as + '|' + st.armor;
    const cur = S.find(hero, 'itemStats');
    if (key === '0|0|0') { if (cur) S.remove(w, hero, 'itemStats'); hero._itemKey = key; return; }
    if (cur && hero._itemKey === key) return;
    S.add(w, hero, 'itemStats', Infinity, { src: hero.id, ability: 'items', data: { stats: st } });
    hero._itemKey = key;
  }

  function hook(w) {
    if (w._itemsHook) return;
    w._itemsHook = true;
    w.on('damage', p => {
      const t = w.get(p.target), s = p.src != null ? w.get(p.src) : null;
      if (!t || t.kind !== 'hero' || !s || s.team === t.team || !(p.dealt > 0)) return;
      t._blinkLock = w.t + iv('blink', 'blink_damage_cooldown');
    });
  }

  IT.World.system('itemsInit', 5, (w) => {
    hook(w);
    for (const e of w.ents) if (!e.dead && e.kind === 'hero' && e.items) applyPassives(w, e);
  });
  IT.World.system('itemsPassive', 55, (w, dt) => {
    for (const e of w.ents) {
      if (e.dead || e.kind !== 'hero' || !e.items) continue;
      for (const s of e.items) { const d = s && A.get(s.id); if (d && d.passive) d.passive(w, e, dt); }
    }
  });

  IT.Items = { applyPassives, ids };
})(typeof window !== 'undefined' ? window : globalThis);
