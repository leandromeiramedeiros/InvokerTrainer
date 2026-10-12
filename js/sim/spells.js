// Invoker spells (all 10). Pure. See CONTRACT.md and the "Spells" section of DECISIONS.md.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const A = IT.Abilities, V = () => IT.Values, U = IT.U;
  const val = (c, dota, k) => V().get(dota, k, c.ctx || null);
  const D = {
    coldsnap: 'invoker_cold_snap', ghostwalk: 'invoker_ghost_walk', icewall: 'invoker_ice_wall', emp: 'invoker_emp',
    tornado: 'invoker_tornado', alacrity: 'invoker_alacrity', sunstrike: 'invoker_sun_strike', forgespirit: 'invoker_forge_spirit',
    chaosmeteor: 'invoker_chaos_meteor', deafeningblast: 'invoker_deafening_blast', melt: 'forged_spirit_melting_strike',
  };
  // Non-KV constants (documented in DECISIONS.md "Spells").
  const LIFT_HEIGHT = 120;          // render hint only
  const KNOCK_SPEED = 150;          // Deafening Blast knockback distance = knockback_duration * KNOCK_SPEED (no KV distance)
  const METEOR_SPACING = 1.5;       // extra meteors are spread perpendicular, METEOR_SPACING * area_of_effect apart
  const SPIRIT_RING = 90;           // forge spirit spawn ring radius
  const COMBATANT = { dummy: 1, enemy: 1, hero: 1, spirit: 1 };
  const HEROISH = { dummy: 1, enemy: 1, hero: 1 };   // 'enemy heroes' for shard effects (dummies stand in for heroes)

  // living, targetable (not lifted) enemies of caster `c`
  const foes = (w, c) => w.query(u => u.team !== c.team && COMBATANT[u.kind] && u.hp > 0 && !IT.Status.has(u, 'lift'));
  const foesNear = (w, c, x, y, r) => foes(w, c).filter(u => Math.hypot(u.x - x, u.y - y) <= r + (u.radius || 0));

  // Per-cast bookkeeping: `hit` once per enemy per cast, `miss` once when every part resolved with no enemy touched.
  function tracker(w, c, ability, parts) {
    const seen = new Set(); let pending = parts || 1, any = false;
    return {
      touch(u) {
        if (seen.has(u.id)) return false;
        seen.add(u.id); any = true;
        w.emit('hit', { src: c.id, target: u.id, ability, blind: c.team === 0 && !u.visible });
        return true;
      },
      has: u => seen.has(u.id),
      add() { pending++; },
      done(x, y) { if (--pending <= 0 && !any) w.emit('miss', { src: c.id, ability, x, y }); },
    };
  }

  // v6: KV SpellImmunityType ENEMIES_YES (only Sun Strike / Cataclysm) pierces BKB: full damage to a hero BKB and to an enemy-NPC BKB
  // (whose spell_reduce cut only applies to magic damage that does not pierce). Sun Strike is pure as well, which never reads magicImmune.
  const pierces = ab => { const a = D[ab] && IT.DOTA && IT.DOTA.abilities && IT.DOTA.abilities[D[ab]]; return !!a && a.spellImmunity === 'ENEMIES_YES'; };
  function dmg(w, c, u, ability, type, amount) {
    return IT.Combat ? IT.Combat.damage(w, { src: c.id, target: u, ability, type, amount, flags: pierces(ability) ? { pierce: true } : undefined }) : 0;
  }

  // Applies a move slow without weakening a stronger, longer one already present.
  function slow(w, u, pct, dur, src, ability) {
    pct = Math.max(0, Math.min(1, pct));
    const s = IT.Status.find(u, 'slow');
    if (s && s.data.pct >= pct && s.until >= w.t + dur - 1e-9) return s;
    return IT.Status.add(w, u, 'slow', dur, { src, ability, data: { pct } });
  }

  // ---------------------------------------------------------------- Cold Snap
  // Freeze + damage now, re-freeze whenever the target takes >= damage_trigger damage (freeze_cooldown apart).
  A.def('coldsnap', {
    kind: 'spell', dota: D.coldsnap, target: 'unit',
    cast(w, c, o) {
      const t = w.get(o.target); if (!t) return;
      hookColdSnap(w);
      const s = IT.Status.add(w, t, 'coldsnap', val(c, D.coldsnap, 'duration'), {
        src: c.id, ability: 'coldsnap',
        data: { freezeDur: val(c, D.coldsnap, 'freeze_duration'), freezeCd: val(c, D.coldsnap, 'freeze_cooldown'), dmg: val(c, D.coldsnap, 'freeze_damage'), trigger: val(c, D.coldsnap, 'damage_trigger'), next: 0 },
      });
      w.emit('hit', { src: c.id, target: t.id, ability: 'coldsnap', blind: c.team === 0 && !t.visible });
      if (s) freeze(w, t, s);
    },
  });

  function freeze(w, t, s, proc) {
    const d = s.data;
    d.next = w.t + d.freezeCd;
    IT.Status.add(w, t, 'frozen', d.freezeDur, { src: s.src, ability: 'coldsnap' });
    w.emit('fx', { name: 'coldsnapFreeze', x: t.x, y: t.y, unit: t.id, proc: !!proc });
    if (proc) w.emit('fx', { name: 'coldsnapProc', x: t.x, y: t.y, unit: t.id });
    if (IT.Combat) { d.inFreeze = true; IT.Combat.damage(w, { src: s.src, target: t, ability: 'coldsnap', type: 'magical', amount: d.dmg }); d.inFreeze = false; }
  }

  function hookColdSnap(w) {
    if (w._coldsnapHook) return;
    w._coldsnapHook = true;
    w.on('damage', p => {
      const t = w.get(p.target); if (!t) return;
      const s = IT.Status.find(t, 'coldsnap');
      if (!s || s.data.inFreeze || w.t < s.data.next || p.raw < s.data.trigger) return;
      freeze(w, t, s, true);
    });
  }

  // ---------------------------------------------------------------- Sun Strike
  // Global ground target, delay, pure damage split among units in the area. Scepter: self-cast = Cataclysm.
  function strike(w, c, x, y, r, delay, amount, tr, color) {
    w.emit('fx', { name: 'sunstrikeBeam', x, y, r, delay });
    w.thinker({
      x, y, r, color: color || '#fc4', team: c.team, ability: 'sunstrike',
      vision: val(c, D.sunstrike, 'vision_distance'), danger: { x, y, r, at: w.t + delay },
      upd(w, e) {
        if (e.age < delay - 1e-9) return false;
        const hit = foesNear(w, c, e.x, e.y, r);
        let heroHit = false;
        w.emit('fx', { name: 'sunstrikeHit', x: e.x, y: e.y, r });
        for (const u of hit) {
          tr.touch(u);
          const dealt = dmg(w, c, u, 'sunstrike', 'pure', amount / hit.length);
          if (dealt > 0 && HEROISH[u.kind]) heroHit = true;
        }
        // Shard: damaging an enemy hero creates a Forge Spirit of current level there (does not replace existing ones).
        if (heroHit && val(c, D.sunstrike, 'create_forged_spirit_on_hero_damage') > 0 && IT.Units) {
          hookMelt(w);
          IT.Units.spawnSpirit(w, c, e.x, e.y);
          w.emit('fx', { name: 'forgeSpirit', x: e.x, y: e.y, count: 1 });
        }
        tr.done(e.x, e.y);
        return true;
      },
    });
  }

  A.def('sunstrike', {
    kind: 'spell', dota: D.sunstrike, target: 'point',
    range() { return Infinity; },
    cast(w, c, o) {
      const d = D.sunstrike;
      const delay = val(c, d, 'delay'), r = val(c, d, 'area_of_effect'), amount = val(c, d, 'damage');
      const count = val(c, d, 'cataclysm_count');
      const tu = o.target != null ? w.get(o.target) : null;
      if (!(typeof o.x === 'number' && isFinite(o.x)) || !(typeof o.y === 'number' && isFinite(o.y))) { o = Object.assign({}, o, { x: tu ? tu.x : c.x, y: tu ? tu.y : c.y }); }
      const self = o.target === c.id || (o.x != null && Math.hypot(o.x - c.x, o.y - c.y) <= 100);
      if (count > 0 && self) {
        const lo = val(c, d, 'cataclysm_min_range'), hi = val(c, d, 'cataclysm_max_range');
        const targets = w.query(u => u.team !== c.team && COMBATANT[u.kind] && u.hp > 0);   // global, ignores vision; each strike gives vision (TODO 4)
        if (!c.cd) c.cd = {};
        c.cd.sunstrike = val(c, d, 'cataclysm_cooldown');
        const tr = tracker(w, c, 'sunstrike', Math.max(1, targets.length * count));
        w.emit('fx', { name: 'cataclysm', x: c.x, y: c.y });
        if (!targets.length) { tr.done(c.x, c.y); return; }
        const part = amount * val(c, d, 'cataclysm_damage_pct') / 100;
        for (const u of targets) {
          for (let i = 0; i < count; i++) {
            const a = w.rng() * U.TAU, dist = lo + w.rng() * (hi - lo);
            strike(w, c, u.x + Math.cos(a) * dist, u.y + Math.sin(a) * dist, r, delay, part, tr, '#f84');
          }
        }
        return;
      }
      strike(w, c, o.x, o.y, r, delay, amount, tracker(w, c, 'sunstrike', 1));
    },
  });

  // ---------------------------------------------------------------- Ghost Walk
  A.def('ghostwalk', {
    kind: 'spell', dota: D.ghostwalk, target: 'none',
    cast(w, c) {
      const d = D.ghostwalk;
      const dur = val(c, d, 'duration'), r = val(c, d, 'area_of_effect');
      const eslow = -val(c, d, 'enemy_slow') / 100, fade = val(c, d, 'aura_fade_time');
      // Shard: also applies Ice Wall's damage per second to enemy heroes (dummies count as heroes) in the area.
      const iw = D.icewall, shardDps = val(c, d, 'apply_ice_wall_debuff') > 0 ? val(c, iw, 'damage_per_second') : 0;
      const shardIv = val(c, iw, 'tick_interval') || 1;
      IT.Status.add(w, c, 'ghost', dur, {
        src: c.id, ability: 'ghostwalk',
        data: { stats: { msPct: val(c, d, 'self_slow'), hpRegen: val(c, d, 'health_regen'), manaRegen: val(c, d, 'mana_regen') } },
      });
      const offs = [];
      let gt = null;
      const brk = () => { if (!IT.Status.has(c, 'ghost')) return; if (gt) gt.broken = true; IT.Status.remove(w, c, 'ghost'); w.emit('fx', { name: 'ghostBreak', x: c.x, y: c.y, unit: c.id }); };
      offs.push(w.on('attack', p => { if (p.src === c.id) brk(); }), w.on('cast', p => { if (p.unit === c.id) brk(); }));
      w.emit('fx', { name: 'ghostWalk', x: c.x, y: c.y, r, unit: c.id });
      gt = w.thinker({
        x: c.x, y: c.y, r, color: '#9cf', team: c.team, ability: 'ghostwalk', next: 0, nextDmg: 0,
        upd(w, e) {
          if (c.dead || !IT.Status.has(c, 'ghost')) { offs.forEach(f => f()); w.emit('fx', { name: 'ghostWalkEnd', x: c.x, y: c.y, unit: c.id, broken: !!e.broken }); return true; }
          e.x = c.x; e.y = c.y;
          if (w.t >= e.next - 1e-9) {
            e.next = w.t + 0.5;
            for (const u of foesNear(w, c, e.x, e.y, r)) slow(w, u, eslow, fade, c.id, 'ghostwalk');
          }
          if (shardDps > 0 && w.t >= e.nextDmg - 1e-9) {
            e.nextDmg = w.t + shardIv;
            for (const u of foesNear(w, c, e.x, e.y, r)) if (HEROISH[u.kind]) dmg(w, c, u, 'ghostwalk', 'magical', shardDps * shardIv);
          }
          return false;
        },
      });
    },
  });

  // ---------------------------------------------------------------- Ice Wall
  A.def('icewall', {
    kind: 'spell', dota: D.icewall, target: 'none',
    cast(w, c) {
      const d = D.icewall;
      const dur = val(c, d, 'duration'), len = val(c, d, 'wall_total_length'), place = val(c, d, 'wall_place_distance');
      const width = val(c, d, 'wall_width'), pct = -val(c, d, 'slow') / 100, linger = val(c, d, 'slow_duration');
      const iv = val(c, d, 'tick_interval'), dps = val(c, d, 'damage_per_second');
      const f = c.facing, cx = c.x + Math.cos(f) * place, cy = c.y + Math.sin(f) * place;
      const px = -Math.sin(f), py = Math.cos(f), h = len / 2;
      const ax = cx - px * h, ay = cy - py * h, bx = cx + px * h, by = cy + py * h;
      const tr = tracker(w, c, 'icewall', 1);
      // Scepter on Quas = Ice Floe (KV special_bonus_scepter_1): the wall rises after glacier_formation_delay; an enemy hero (dummies stand in)
      // that stays inside for root_delay seconds is rooted for root_duration and takes root_damage magic damage (once per cast).
      const rootDelay = val(c, d, 'root_delay'), floe = rootDelay > 0;
      const form = floe ? val(c, d, 'glacier_formation_delay') : 0, rootDur = val(c, d, 'root_duration'), rootDmg = val(c, d, 'root_damage');
      w.emit('fx', { name: floe ? 'iceFloe' : 'iceWall', x: cx, y: cy, ax, ay, bx, by, r: width, dur, delay: form });
      w.thinker({
        x: cx, y: cy, ax, ay, bx, by, r: width, color: '#8ef', team: c.team, ability: 'icewall', next: 0, inside: new Set(), tin: new Map(), rooted: new Set(),
        danger: floe ? { x: cx, y: cy, r: width, at: w.t + form } : undefined,
        upd(w, e) {
          if (e.age < form - 1e-9) return false;
          if (floe && !e.risen) { e.risen = true; e.next = w.t; w.emit('fx', { name: 'iceWall', x: cx, y: cy, ax, ay, bx, by, r: width, dur }); }
          const tick = w.t >= e.next - 1e-9;
          if (tick) e.next = w.t + iv;
          const now = new Set();
          for (const u of foes(w, c)) {
            if (U.segDist(u.x, u.y, ax, ay, bx, by) > width) continue;
            now.add(u.id);
            tr.touch(u);
            if (tick || !e.inside.has(u.id)) slow(w, u, pct, linger, c.id, 'icewall');
            if (tick) { dmg(w, c, u, 'icewall', 'magical', dps * iv); w.emit('fx', { name: 'iceWallTick', x: u.x, y: u.y, unit: u.id }); }
            if (floe && HEROISH[u.kind] && !e.rooted.has(u.id)) {
              const tin = (e.tin.get(u.id) || 0) + w.dt; e.tin.set(u.id, tin);
              if (tin >= rootDelay - 1e-9) {
                e.rooted.add(u.id);
                IT.Status.add(w, u, 'root', rootDur, { src: c.id, ability: 'icewall' });
                dmg(w, c, u, 'icewall', 'magical', rootDmg);
                w.emit('fx', { name: 'iceFloeRoot', x: u.x, y: u.y, unit: u.id, dur: rootDur });
              }
            }
          }
          for (const id of e.tin.keys()) if (!now.has(id)) e.tin.delete(id);   // must stay inside continuously
          e.inside = now;
          if (e.age >= form + dur - 1e-9) { tr.done(cx, cy); w.emit('fx', { name: 'iceWallEnd', x: cx, y: cy }); return true; }
          return false;
        },
      });
    },
  });

  // ---------------------------------------------------------------- E.M.P.
  A.def('emp', {
    kind: 'spell', dota: D.emp, target: 'point',
    cast(w, c, o) {
      const d = D.emp;
      const delay = val(c, d, 'delay'), r = val(c, d, 'area_of_effect'), burn = val(c, d, 'mana_burned');
      const pct = val(c, d, 'damage_per_mana_pct') / 100, back = val(c, d, 'self_mana_restore_pct') / 100;
      const drag = val(c, d, 'drag_speed');
      const tr = tracker(w, c, 'emp', 1);
      w.emit('fx', { name: 'empCharge', x: o.x, y: o.y, r, delay });
      w.thinker({
        x: o.x, y: o.y, r, color: '#6af', team: c.team, ability: 'emp', danger: { x: o.x, y: o.y, r, at: w.t + delay },
        upd(w, e) {
          if (e.age < delay - 1e-9) {
            if (drag > 0) for (const u of foesNear(w, c, e.x, e.y, r)) {
              if (!IT.Status.has(u, 'knockback') && Math.hypot(u.x - e.x, u.y - e.y) > 8) IT.Combat.drag(w, u, e.x, e.y, drag);
            }
            return false;
          }
          let total = 0;
          w.emit('fx', { name: 'empBlast', x: e.x, y: e.y, r });
          for (const u of foesNear(w, c, e.x, e.y, r)) {
            tr.touch(u);
            const burned = IT.Combat.manaBurn(w, c, u, burn);
            total += burned;
            dmg(w, c, u, 'emp', 'magical', burned * pct);
          }
          if (total > 0) IT.Combat.restoreMana(c, total * back);
          tr.done(e.x, e.y);
          return true;
        },
      });
    },
  });

  // ---------------------------------------------------------------- Tornado
  function liftHeight(s, t) {   // quick rise, hover, quick drop
    const a = Math.min(1, (t - s.from) / 0.25, (s.until - t) / 0.25);
    return LIFT_HEIGHT * Math.max(0, a);
  }

  A.def('tornado', {
    kind: 'spell', dota: D.tornado, target: 'point',
    cast(w, c, o) {
      const d = D.tornado;
      const dist = val(c, d, 'travel_distance'), speed = val(c, d, 'travel_speed'), r = val(c, d, 'area_of_effect');
      const lift = val(c, d, 'lift_duration'), endVis = val(c, d, 'end_vision_duration');
      const amount = val(c, d, 'base_damage') + val(c, d, 'quas_damage') + val(c, d, 'wex_damage');
      const tw = { gap: val(c, d, 'twister_distance_interval'), r: val(c, d, 'twister_radius'), dps: val(c, d, 'twister_damage'), dur: val(c, d, 'twister_duration'), tick: val(c, d, 'twister_tick_rate') };
      const dir = (o.x === c.x && o.y === c.y) ? c.facing : Math.atan2(o.y - c.y, o.x - c.x);
      const cs = Math.cos(dir), sn = Math.sin(dir);
      const tr = tracker(w, c, 'tornado', 1);
      const victims = [];
      let travelled = 0, sinceTwister = 0, endedAt = -1;
      w.emit('fx', { name: 'tornadoStart', x: c.x, y: c.y, dir, r, dist });
      w.thinker({
        x: c.x, y: c.y, r, dir, color: '#cde', team: c.team, ability: 'tornado', vision: val(c, d, 'vision_distance'),
        upd(w, e, dt) {
          if (endedAt < 0) {
            const step = Math.min(speed * dt, dist - travelled);
            const px = e.x, py = e.y;
            e.x += cs * step; e.y += sn * step; travelled += step;
            for (const u of foes(w, c)) {
              if (tr.has(u) || U.segDist(u.x, u.y, px, py, e.x, e.y) > r + (u.radius || 0)) continue;
              const s = IT.Status.add(w, u, 'lift', lift, { src: c.id, ability: 'tornado', data: { tornado: true } });
              if (!s) continue;
              s.from = w.t;
              tr.touch(u);
              victims.push({ u, land: w.t + lift, s });
              w.emit('fx', { name: 'tornadoLift', x: u.x, y: u.y, unit: u.id, dur: lift });
            }
            if (tw.gap > 0 && tw.dur > 0) {
              sinceTwister += step;
              while (sinceTwister >= tw.gap) { sinceTwister -= tw.gap; twister(w, c, e.x, e.y, tw, tr); }
            }
            if (travelled >= dist - 1e-9) { endedAt = w.t; e.done = true; w.emit('fx', { name: 'tornadoEnd', x: e.x, y: e.y }); tr.done(e.x, e.y); }
          }
          for (let i = victims.length - 1; i >= 0; i--) {
            const v = victims[i], u = v.u;
            if (u.dead) { victims.splice(i, 1); continue; }
            if (w.t >= v.land - 1e-9) {
              IT.Status.remove(w, u, 'lift'); u.z = 0;
              dmg(w, c, u, 'tornado', 'magical', amount);
              w.emit('fx', { name: 'tornadoLand', x: u.x, y: u.y, unit: u.id });
              victims.splice(i, 1);
            } else u.z = liftHeight(v.s, w.t);
          }
          return endedAt >= 0 && !victims.length && w.t - endedAt >= endVis - 1e-9;
        },
      });
    },
  });

  // Scepter twister: stationary whirl that ticks magical damage (twister_damage is read as damage per second).
  function twister(w, c, x, y, tw, tr) {
    tr.add();
    w.emit('fx', { name: 'twister', x, y, r: tw.r, dur: tw.dur });
    w.thinker({
      x, y, r: tw.r, color: '#cde', team: c.team, ability: 'tornado', next: 0,
      upd(w, e) {
        if (w.t >= e.next - 1e-9) {
          e.next = w.t + tw.tick;
          for (const u of foesNear(w, c, x, y, tw.r)) { tr.touch(u); dmg(w, c, u, 'tornado', 'magical', tw.dps * tw.tick); }
        }
        if (e.age >= tw.dur - 1e-9) { tr.done(x, y); return true; }
        return false;
      },
    });
  }

  // ---------------------------------------------------------------- Alacrity
  A.def('alacrity', {
    kind: 'spell', dota: D.alacrity, target: 'unit',
    filter(w, c, t) { return !!t && !t.dead && t.team === c.team && COMBATANT[t.kind] === 1 && t.hp > 0; },
    cast(w, c, o) {
      let t = w.get(o.target);
      if (!t || t.team !== c.team) t = c;
      const d = D.alacrity;
      IT.Status.add(w, t, 'alacrity', val(c, d, 'duration'), {
        src: c.id, ability: 'alacrity',
        data: { stats: { as: val(c, d, 'bonus_attack_speed'), dmg: val(c, d, 'bonus_damage') } },
      });
      w.emit('fx', { name: 'alacrity', x: t.x, y: t.y, unit: t.id });
    },
  });

  // ---------------------------------------------------------------- Forge Spirit
  function hookMelt(w) {
    if (w._meltHook) return;
    w._meltHook = true;
    w.on('attackHit', p => {
      const s = w.get(p.src), t = w.get(p.target);
      if (!s || !t || s.kind !== 'spirit') return;
      const owner = w.get(s.owner) || w.hero; if (!owner) return;
      const per = val(owner, D.forgespirit, 'armor_per_attack'), max = val(owner, D.melt, 'max_armor_removed'), dur = val(owner, D.melt, 'duration');
      const old = IT.Status.find(t, 'melt');
      const stacks = (old ? old.data.stacks : 0) + 1;
      IT.Status.add(w, t, 'melt', dur, { src: s.id, ability: 'forgespirit', data: { stacks, stats: { armor: -Math.min(max, per * stacks) } } });
      w.emit('fx', { name: 'meltingStrike', x: t.x, y: t.y, unit: t.id, stacks });
    });
  }

  // Dota: "number of spirits is determined by the LOWER level of Quas and Exort" (extra_spirit_count_* are per-level counts).
  function spiritCount(c) {
    return Math.max(1, Math.min(val(c, D.forgespirit, 'extra_spirit_count_quas'), val(c, D.forgespirit, 'extra_spirit_count_exort')));
  }

  A.def('forgespirit', {
    kind: 'spell', dota: D.forgespirit, target: 'none',
    cast(w, c) {
      hookMelt(w);
      for (const s of w.query(u => u.kind === 'spirit' && u.owner === c.id)) w.remove(s);
      const n = spiritCount(c);
      for (let i = 0; i < n; i++) {
        const a = c.facing + U.TAU * i / Math.max(1, n);
        const sp = IT.Units.spawnSpirit(w, c, c.x + Math.cos(a) * SPIRIT_RING, c.y + Math.sin(a) * SPIRIT_RING);
      }
      w.emit('fx', { name: 'forgeSpirit', x: c.x, y: c.y, count: n });
    },
  });

  // ---------------------------------------------------------------- Chaos Meteor
  // Burn DoT: status 'burn' {dps, iv, next}, ticked by the system below.
  IT.World.system('spellburn', 51, (w) => {
    for (const e of w.ents) {
      if (e.dead || !e.statuses.length) continue;
      const s = IT.Status.find(e, 'burn');
      if (!s || w.t < s.data.next - 1e-9) continue;
      s.data.next = w.t + s.data.iv;
      if (IT.Combat) IT.Combat.damage(w, { src: s.src, target: e, ability: 'chaosmeteor', type: 'magical', amount: s.data.dps * s.data.iv });
      w.emit('fx', { name: 'meteorBurn', x: e.x, y: e.y, unit: e.id });
    }
  });

  A.def('chaosmeteor', {
    kind: 'spell', dota: D.chaosmeteor, target: 'point',
    cast(w, c, o) {
      const d = D.chaosmeteor;
      const land = val(c, d, 'land_time'), r = val(c, d, 'area_of_effect'), dist = val(c, d, 'travel_distance'), speed = val(c, d, 'travel_speed');
      const iv = val(c, d, 'damage_interval'), main = val(c, d, 'main_damage'), bdps = val(c, d, 'burn_dps'), bdur = val(c, d, 'burn_duration');
      const n = Math.max(1, Math.round(val(c, d, 'meteor_count'))), stun = val(c, d, 'stun_duration');
      const endVis = val(c, d, 'end_vision_duration'), vis = val(c, d, 'vision_distance');
      const dir = Math.hypot(o.x - c.x, o.y - c.y) > 1 ? Math.atan2(o.y - c.y, o.x - c.x) : c.facing;
      const cs = Math.cos(dir), sn = Math.sin(dir);
      const tr = tracker(w, c, 'chaosmeteor', n);
      const roll = dist / speed;
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * METEOR_SPACING * r;
        const x0 = o.x - sn * off, y0 = o.y + cs * off;
        w.emit('fx', { name: 'meteorFall', x: x0, y: y0, r, delay: land, dir, ability: 'chaosmeteor' });
        w.thinker({
          x: x0, y: y0, r, dir, color: '#f62', team: c.team, ability: 'chaosmeteor', vision: vis, next: 0, landed: false,
          danger: { x: x0, y: y0, r, at: w.t + land },
          upd(w, e) {
            if (e.age < land - 1e-9) return false;
            if (!e.landed) { e.landed = true; e.next = w.t; w.emit('fx', { name: 'meteorLand', x: x0, y: y0, r }); w.emit('fx', { name: 'meteorRoll', x: x0, y: y0, r, dir, dur: roll }); }
            const run = Math.min(dist, speed * (e.age - land));
            e.x = x0 + cs * run; e.y = y0 + sn * run;
            if (e.age - land > roll + 1e-9) {   // rolled out
              if (!e.done) { e.done = true; e.fin = e.age; w.emit('fx', { name: 'meteorEnd', x: e.x, y: e.y, r }); tr.done(e.x, e.y); }
              return e.age - e.fin >= endVis - 1e-9;
            }
            if (w.t >= e.next - 1e-9) {
              e.next = w.t + iv;
              for (const u of foesNear(w, c, e.x, e.y, r)) {
                tr.touch(u);
                dmg(w, c, u, 'chaosmeteor', 'magical', main);
                w.emit('fx', { name: 'meteorHit', x: u.x, y: u.y, unit: u.id });
                if (stun > 0 && !IT.Status.has(u, 'stun')) IT.Status.add(w, u, 'stun', stun, { src: c.id, ability: 'chaosmeteor' });
                if (bdps > 0) {
                  const b = IT.Status.find(u, 'burn');
                  IT.Status.add(w, u, 'burn', bdur, { src: c.id, ability: 'chaosmeteor', data: { dps: bdps, iv, next: b ? b.data.next : w.t + iv } });
                }
              }
            }
            return false;
          },
        });
      }
    },
  });

  // ---------------------------------------------------------------- Deafening Blast
  A.def('deafeningblast', {
    kind: 'spell', dota: D.deafeningblast, target: 'point',
    cast(w, c, o) {
      const d = D.deafeningblast;
      const dist = val(c, d, 'travel_distance'), speed = val(c, d, 'travel_speed');
      const r0 = val(c, d, 'radius_start'), r1 = val(c, d, 'radius_end'), endVis = val(c, d, 'end_vision_duration');
      const amount = val(c, d, 'damage'), kb = val(c, d, 'knockback_duration'), dis = val(c, d, 'disarm_duration');
      const n = Math.max(1, Math.round(val(c, d, 'radial_count')));
      const base = Math.hypot(o.x - c.x, o.y - c.y) > 1 ? Math.atan2(o.y - c.y, o.x - c.x) : c.facing;
      const dirs = [];
      for (let i = 0; i < n; i++) dirs.push(base + U.TAU * i / n);
      const x0 = c.x, y0 = c.y, tr = tracker(w, c, 'deafeningblast', 1);
      w.emit('fx', { name: 'deafeningBlast', x: x0, y: y0, dir: base, dist, r0, r1, radial: n > 1 });
      w.thinker({
        x: x0, y: y0, r: r0, dir: base, dirs, front: 0, color: '#9bf', team: c.team, ability: 'deafeningblast', vision: r0,
        upd(w, e, dt) {
          const prev = e.front;
          e.front = Math.min(dist, e.front + speed * dt);
          for (const u of foes(w, c)) {
            if (tr.has(u)) continue;
            const dx = u.x - x0, dy = u.y - y0, ur = u.radius || 0;
            for (const a of dirs) {
              const s = dx * Math.cos(a) + dy * Math.sin(a), q = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a));
              if (s < -ur || s > dist + ur || s - ur > e.front) continue;
              const width = U.lerp(r0, r1, U.clamp(s / dist, 0, 1));
              if (q > width + ur) continue;
              tr.touch(u);
              dmg(w, c, u, 'deafeningblast', 'magical', amount);
              const L = Math.hypot(dx, dy), k = kb * KNOCK_SPEED;
              const ux = L > 1e-6 ? dx / L : Math.cos(a), uy = L > 1e-6 ? dy / L : Math.sin(a);
              if (IT.Combat.push(w, u, ux * k, uy * k, kb)) IT.Status.add(w, u, 'disarm', kb + dis, { src: c.id, ability: 'deafeningblast' });
              w.emit('fx', { name: 'deafeningHit', x: u.x, y: u.y, unit: u.id });
              break;
            }
          }
          e.r = U.lerp(r0, r1, e.front / dist);
          if (e.front >= dist - 1e-9 && prev < dist) { e.done = true; e.fin = e.age; tr.done(x0 + Math.cos(base) * dist, y0 + Math.sin(base) * dist); }
          return !!e.done && e.age - e.fin >= endVis - 1e-9;
        },
      });
    },
  });

  IT.Spells = { freezeColdSnap: freeze, foes, tracker, LIFT_HEIGHT, KNOCK_SPEED, METEOR_SPACING, SPIRIT_RING };
})(typeof window !== 'undefined' ? window : globalThis);
