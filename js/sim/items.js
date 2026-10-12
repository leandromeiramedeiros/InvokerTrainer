// Items: refresher, atos, vyse, shiva, meteorhammer, bkb, orchid, gleipnir, blink, boots/travels, forcestaff, dust, euls, shadowblade. Pure. See CONTRACT.md + DECISIONS.md "Items".
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const A = IT.Abilities, S = IT.Status;
  const DOTA = id => IT.GAME.ITEM_DOTA[id];
  const iv = (id, key, lvl) => IT.Values.item(DOTA(id), key, lvl);
  const UNITS = { hero: 1, dummy: 1, enemy: 1, spirit: 1 };
  const ATOS_SPEED = 1900;          // not in KV AbilityValues (ProjectileSpeed is not baked): Dota value
  const BOOTS = ['travels', 'boots'];   // priority; only one counts
  const ids = ['refresher', 'atos', 'vyse', 'shiva', 'meteorhammer', 'bkb', 'orchid', 'gleipnir', 'blink', 'boots', 'travels', 'forcestaff', 'dust', 'euls', 'shadowblade'];

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

  // Blast reach = KV blast_radius (825) + bonus_aoe (75, hull/expansion) = 900 (decided).
  const shivaRadius = () => iv('shiva', 'blast_radius') + (iv('shiva', 'bonus_aoe') || 0);
  // ---- Shiva's Guard: active ring blast; passive aura (-AS to nearby enemies); armor via itemStats.
  item('shiva', {
    target: 'none',
    cast(w, c) {
      const R = shivaRadius(), speed = iv('shiva', 'blast_speed'), dmg = iv('shiva', 'blast_damage');
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
            w2.emit('fx', { name: 'shivaHit', x: u.x, y: u.y, unit: u.id });
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
        while (n < total && e.age >= (n + 1) * step - 1e-9) { n++; IT.Combat.damage(w2, { src: c.id, target: t, ability: id, type: 'magical', amount: dmg }); w2.emit('fx', { name: 'hammerBurn', x: t.x, y: t.y, unit: t.id }); }
        return n >= total;
      },
    });
  }
  item('meteorhammer', {
    target: 'point',
    channel() { return iv('meteorhammer', 'max_duration'); },
    cast(w, c, o) { w.emit('fx', { name: 'meteorChannel', ability: 'meteorhammer', x: o.x, y: o.y, unit: c.id, dur: iv('meteorhammer', 'max_duration') }); },
    channelEnd(w, c, o, interrupted) {
      if (interrupted) { w.emit('fx', { name: 'meteorCancel', x: o.x, y: o.y, unit: c.id }); return; }
      const id = 'meteorhammer', land = iv(id, 'land_time'), r = iv(id, 'impact_radius');
      w.emit('fx', { name: 'meteorFall', ability: 'meteorhammer', x: o.x, y: o.y, r, delay: land });
      w.thinker({
        x: o.x, y: o.y, r, team: c.team, ability: id, danger: { x: o.x, y: o.y, r, at: w.t + land },
        upd(w2, e) {
          if (e.age < land - 1e-9) return false;
          const hit = enemies(w2, c, u => dist(u, e) <= r + (u.radius || 0));
          w2.emit('fx', { name: 'meteorImpact', ability: 'meteorhammer', x: e.x, y: e.y, r });
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
      // Enemy-NPC BKB: CC immunity + KV spell_reduce % less magic damage (instead of full immunity). Hero / legacy-AI dummies: full immunity.
      const reduce = c.kind === 'enemy' && !c.legacy ? iv('bkb', 'spell_reduce') / 100 : null;
      S.add(w, c, 'magicImmune', dur, { src: c.id, ability: 'bkb', data: reduce != null ? { reduce } : undefined });
      w.emit('fx', { name: 'bkb', x: c.x, y: c.y, unit: c.id, dur, use: n + 1 });
    },
  });

  // ---- Orchid Malevolence: silence; damage taken while silenced is stored, then bursts as magic damage when it ends.
  // Silence data {orchid:true, taken}. A thinker watches the status object; gone (expired/dispelled) = burst unless the target died.
  function orchidHook(w) {
    if (w._orchidHook) return;
    w._orchidHook = true;
    w.on('damage', p => {
      if (!(p.dealt > 0)) return;
      const t = w.get(p.target), s = t && S.find(t, 'silence');
      if (s && s.data && s.data.orchid) s.data.taken += p.dealt;
    });
  }
  item('orchid', {
    target: 'unit',
    cast(w, c, o) {
      const t = w.get(o.target); if (!t) return;
      orchidHook(w);
      const dur = iv('orchid', 'silence_duration'), pct = iv('orchid', 'silence_damage_percent') / 100;
      const old = S.find(t, 'silence'), keep = old && old.data && old.data.orchid;
      const s = S.add(w, t, 'silence', dur, { src: c.id, ability: 'orchid', data: keep ? undefined : { orchid: true, taken: 0 } });
      if (!s) { w.emit('miss', { src: c.id, ability: 'orchid', x: t.x, y: t.y }); w.emit('fx', { name: 'orchidBlocked', x: t.x, y: t.y }); return; }
      w.emit('hit', { src: c.id, target: t.id, ability: 'orchid' });
      w.emit('fx', { name: 'orchidHit', x: t.x, y: t.y, unit: t.id, dur });
      if (keep) return;
      w.thinker({
        x: t.x, y: t.y, team: c.team, ability: 'orchid',
        upd(w2, e) {
          const u = w2.get(t.id); if (!u || u.dead || u.hp <= 0) return true;
          e.x = u.x; e.y = u.y;
          if (S.find(u, 'silence') === s) return false;
          const amount = s.data.taken * pct;
          w2.emit('fx', { name: 'orchidBurst', x: u.x, y: u.y, unit: u.id, amount });
          if (amount > 0) IT.Combat.damage(w2, { src: c.id, target: u, ability: 'orchid', type: 'magical', amount });
          return true;
        },
      });
    },
  });

  // ---- Gleipnir: point AoE, tracking projectile to each enemy in the radius -> root (+damage if the KV has any).
  item('gleipnir', {
    target: 'point',
    cast(w, c, o) {
      const id = 'gleipnir', r = iv(id, 'radius_tooltip') || iv(id, 'radius'), dur = iv(id, 'duration'), dmg = iv(id, 'damage');
      const hit = enemies(w, c, u => dist(u, o) <= r + (u.radius || 0) && !S.has(u, 'lift'));
      w.emit('fx', { name: 'gleipnirLaunch', x: o.x, y: o.y, r, unit: c.id, count: hit.length });
      if (!hit.length) w.emit('miss', { src: c.id, ability: id, x: o.x, y: o.y });
      for (const u of hit) {
        const tid = u.id;
        w.thinker({
          kind: 'proj', team: c.team, fx: 'gleipnir', x: c.x, y: c.y, z: 0, radius: 8, src: c.id, target: tid, speed: ATOS_SPEED, ability: id,
          upd(w2, p, dt) {
            const t = w2.get(tid);
            if (!t || t.dead || p.age > 5) { w2.emit('miss', { src: c.id, ability: id, x: p.x, y: p.y }); return true; }
            const d = dist(p, t), st = p.speed * dt;
            p.facing = Math.atan2(t.y - p.y, t.x - p.x);
            if (d > st + t.radius * 0.5) { p.x += (t.x - p.x) / d * st; p.y += (t.y - p.y) / d * st; return false; }
            p.x = t.x; p.y = t.y;
            if (S.has(t, 'lift')) { w2.emit('miss', { src: c.id, ability: id, x: p.x, y: p.y }); return true; }
            if (S.add(w2, t, 'root', dur, { src: c.id, ability: id })) {
              if (dmg > 0) IT.Combat.damage(w2, { src: c.id, target: t, ability: id, type: 'magical', amount: dmg });
              w2.emit('hit', { src: c.id, target: t.id, ability: id });
              w2.emit('fx', { name: 'gleipnirHit', x: p.x, y: p.y, unit: t.id, dur });
            } else {
              w2.emit('miss', { src: c.id, ability: id, x: p.x, y: p.y });
              w2.emit('fx', { name: 'gleipnirBlocked', x: p.x, y: p.y });
            }
            return true;
          },
        });
      }
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

  // ---- Force Staff: pushes the target `push_length` along its facing over `push_time` (self or any visible unit). The unit can
  // still cast; the push stops at walls (nav slide). Not blocked by BKB (displacement, no src status).
  item('forcestaff', {
    target: 'unit',
    filter(w, c, t) {
      return !!t && !t.dead && !t.building && t.kind !== 'thinker' && t.kind !== 'proj' && !S.has(t, 'lift') &&
        (t.team === c.team || c.team !== 0 || !w.fog || t.visible);
    },
    cast(w, c, o) {
      const t = (o.target != null && w.get(o.target)) || c;
      const len = iv('forcestaff', 'push_length'), dur = iv('forcestaff', 'push_time') || 0.5;
      const fx = t.x, fy = t.y;
      IT.Combat.push(w, t, Math.cos(t.facing) * len, Math.sin(t.facing) * len, dur);
      w.emit('fx', { name: 'forceStaff', x: fx, y: fy, unit: t.id, dir: t.facing, len, dur });
      w.emit('hit', { src: c.id, target: t.id, ability: 'forcestaff' });
    },
  });

  // ---- Dust of Appearance: reveals (and slows) every enemy in `radius` for `duration` -> Status.revealed(e); invisible units become visible.
  item('dust', {
    target: 'none',
    cast(w, c) {
      const R = iv('dust', 'radius'), dur = iv('dust', 'duration'), slow = -iv('dust', 'movespeed') / 100;
      const hit = enemies(w, c, u => dist(c, u) <= R + (u.radius || 0));
      w.emit('fx', { name: 'dustBlast', x: c.x, y: c.y, r: R, unit: c.id, dur });
      for (const u of hit) {
        S.add(w, u, 'revealed', dur, { src: c.id, ability: 'dust', pierce: true });
        if (slow > 0) S.add(w, u, 'slow', dur, { src: c.id, ability: 'dust', pierce: true, data: { pct: slow } });
        w.emit('hit', { src: c.id, target: u.id, ability: 'dust' });
      }
    },
  });

  // ---- Eul's Scepter (enemy item): self cyclone. Invulnerable + airborne for cyclone_duration, basic dispel on use. While 'lift'
  // the unit cannot act and ignores enemy statuses/damage (same rules as Tornado's victims).
  const EULS_DISPEL = ['slow', 'atosRoot', 'root', 'silence', 'disarm', 'burn'];
  item('euls', {
    target: 'none',
    cast(w, c) {
      const dur = iv('euls', 'cyclone_duration');
      for (const t of EULS_DISPEL) S.remove(w, c, t);
      const s = S.add(w, c, 'lift', dur, { src: c.id, ability: 'euls', data: { euls: true } });
      if (!s) return;
      s.from = w.t;
      w.emit('fx', { name: 'eulsCyclone', x: c.x, y: c.y, unit: c.id, dur });
      w.thinker({
        x: c.x, y: c.y, team: c.team, ability: 'euls',
        upd(w2, e) {
          const u = w2.get(c.id); if (!u) return true;
          e.x = u.x; e.y = u.y;
          if (S.find(u, 'lift') !== s) { u.z = 0; return true; }
          const a = Math.min(1, (w2.t - s.from) / 0.25, (s.until - w2.t) / 0.25);
          u.z = (IT.Spells ? IT.Spells.LIFT_HEIGHT : 120) * Math.max(0, a);
          return false;
        },
      });
    },
  });

  // ---- Shadow Blade (enemy item): fades for windwalk_fade_time, then 'invisible' (hidden from the other team unless dusted /
  // true-sighted, see IT.Vision) for the rest of windwalk_duration with +windwalk_movement_speed %. Breaks on the wearer's attack.
  item('shadowblade', {
    target: 'none',
    range() { return 0; },
    cast(w, c) {
      const fade = iv('shadowblade', 'windwalk_fade_time'), dur = iv('shadowblade', 'windwalk_duration'), ms = iv('shadowblade', 'windwalk_movement_speed');
      w.emit('fx', { name: 'shadowFade', x: c.x, y: c.y, unit: c.id, dur: fade });
      S.add(w, c, 'invisFade', Math.max(fade, w.dt), { src: c.id, ability: 'shadowblade' });   // render hint: fading out
      w.thinker({
        x: c.x, y: c.y, team: c.team, ability: 'shadowblade',
        upd(w2, e) {
          const u = w2.get(c.id); if (!u) return true;
          e.x = u.x; e.y = u.y;
          if (e.age < fade - 1e-9) return false;
          S.remove(w2, u, 'invisFade');
          S.add(w2, u, 'invisible', Math.max(w2.dt, dur - fade), { src: c.id, ability: 'shadowblade', data: { stats: { msPct: ms } } });
          w2.emit('fx', { name: 'shadowOn', x: u.x, y: u.y, unit: u.id });
          return true;
        },
      });
    },
  });

  // ---- boots family: passive stats merged into one permanent 'itemStats' status.
  for (const id of BOOTS) item(id, { target: 'none', range: () => 0, manaCost: () => 0, cooldown: () => 0 });

  function passiveStats(hero) {
    const st = { ms: 0, as: 0, armor: 0, dmg: 0, manaRegen: 0 };
    const has = id => !!slotOf(hero, id);
    const boots = BOOTS.find(has);
    if (boots === 'boots') st.ms += iv('boots', 'bonus_movement_speed');
    else if (boots === 'travels') st.ms += iv('travels', 'bonus_movement_speed');
    if (has('shiva')) st.armor += iv('shiva', 'bonus_armor');
    if (has('orchid')) { st.as += iv('orchid', 'bonus_attack_speed'); st.dmg += iv('orchid', 'bonus_damage'); st.manaRegen += iv('orchid', 'bonus_mana_regen'); }
    return st;
  }

  // Idempotent: (re)creates/updates the permanent status when the item set changed, removes it when empty.
  function applyPassives(w, hero) {
    const st = passiveStats(hero), key = [st.ms, st.as, st.armor, st.dmg, st.manaRegen].join('|');
    const cur = S.find(hero, 'itemStats');
    if (key === '0|0|0|0|0') { if (cur) S.remove(w, hero, 'itemStats'); hero._itemKey = key; return; }
    if (cur && hero._itemKey === key) return;
    S.add(w, hero, 'itemStats', Infinity, { src: hero.id, ability: 'items', data: { stats: st } });
    hero._itemKey = key;
  }

  function hook(w) {
    if (w._itemsHook) return;
    w._itemsHook = true;
    w.on('damage', p => {
      const t = w.get(p.target), s = p.src != null ? w.get(p.src) : null;
      if (!t || (t.kind !== 'hero' && t.kind !== 'enemy') || !s || s.team === t.team || !(p.dealt > 0)) return;
      t._blinkLock = w.t + iv('blink', 'blink_damage_cooldown');   // Blink Dagger: unusable for 3 s after damage from an enemy unit
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

  // swap two inventory slots (drag & drop). Hotkeys follow the slot, cooldowns follow the item.
  function swap(w, hero, i, j) {
    if (!hero || !hero.items || i === j || i < 0 || j < 0 || i >= hero.items.length || j >= hero.items.length) return false;
    const a = hero.items[i]; hero.items[i] = hero.items[j]; hero.items[j] = a;
    w.emit('itemSwap', { unit: hero.id, from: i, to: j });
    return true;
  }

  // AoE / range preview data for the input layer (all numbers from the baked KV).
  // -> { shape:'circle', around:'self'|'point', r, range } | { shape:'line', around:'unit', len, range } | { shape:'range', range } | null
  function preview(id) {
    if (!DOTA(id)) return null;
    switch (id) {
      case 'shiva': return { shape: 'circle', around: 'self', r: shivaRadius(), speed: iv(id, 'blast_speed'), aura: iv(id, 'aura_radius'), range: 0 };
      case 'gleipnir': return { shape: 'circle', around: 'point', r: iv(id, 'radius_tooltip') || iv(id, 'radius'), range: iv(id, 'castRange') };
      case 'meteorhammer': return { shape: 'circle', around: 'point', r: iv(id, 'impact_radius'), range: iv(id, 'castRange') };
      case 'dust': return { shape: 'circle', around: 'self', r: iv(id, 'radius'), range: 0 };
      case 'forcestaff': return { shape: 'line', around: 'unit', len: iv(id, 'push_length'), range: iv(id, 'castRange') };
      case 'blink': return { shape: 'range', range: iv(id, 'blink_range'), clamp: iv(id, 'blink_range_clamp') };
      default: return null;
    }
  }

  IT.Items = { applyPassives, ids, swap, preview, shivaRadius };
})(typeof window !== 'undefined' ? window : globalThis);
