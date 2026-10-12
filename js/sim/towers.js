// Towers (Dota values, see docs/MAPS-v3.md). Static, ground vision, attack, Tower Protection aura. Pure.
// IT.Towers.gate(w, target, amount, src, ability) is the damage gate combat.js calls for `target.building`:
// attacks are Reinforced (hero x0.5, other x0.7, player summons x0.6), Meteor Hammer applies its building value, everything else is 0.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const TIERS = {
    1: { hp: 1800, armor: 12, min: 88, max: 92, protArmor: 3, protRegen: 1 },
    2: { hp: 2500, armor: 16, min: 170, max: 174, protArmor: 5, protRegen: 3 },
    3: { hp: 2500, armor: 16, min: 170, max: 174, protArmor: 5, protRegen: 3 },
    4: { hp: 2600, armor: 21, min: 170, max: 174, protArmor: 5, protRegen: 3 },
  };
  const RANGE = 700, BAT = 0.9, PROJ = 750, VISION = 1900, TRUE_SIGHT = 860, PROT_R = 900, AGGRO_R = 500, RADIUS = 72, LAUNCH_Z = 260;
  // TRUE_SIGHT: not in the KV; server.dll build 6957 CDOTA_Modifier_Tower_Truesight_Aura aura-radius getter (vtable slot 68, RVA 0x01644020) returns 860.0f
  // (same slot returns 1200 for CDOTA_Modifier_Fountain_Truesight_Aura = the known fountain value). See DECISIONS.md "v6 local-install audit".
  const RECENT = 1.5;        // s an attack order counts as "attacking the tower / an ally"
  const REPICK_GAP = 2.5;
  const TARGET_KINDS = { hero: 1, spirit: 1, enemy: 1 };   // dummies are scarecrows: towers ignore them
  const ALLY_HEROES = { hero: 1, enemy: 1 };
  const allyHero = e => !!ALLY_HEROES[e.kind] && !e.refill;   // training dummies (refill flag) are scarecrows to towers: no aura, no aggro, no target

  function spawn(w, o) {
    const tier = Math.max(1, Math.min(4, o.tier | 0 || 1)), T = TIERS[tier];
    hook(w);
    return w.add({
      kind: 'tower', name: 'Tower', building: true, team: o.team | 0, tier, x: o.x, y: o.y, radius: RADIUS,
      hp: T.hp, maxHp: T.hp, armor: T.armor, magicRes: 0, ms: 0, vision: VISION, trueSight: TRUE_SIGHT, visible: true,
      attack: { min: T.min, max: T.max, bat: BAT, point: 0, range: RANGE, projSpeed: PROJ, next: 0, target: null },
      statuses: [], _atkBy: {}, _lastRepick: -9, destroyed: false,
    });
  }
  function spawnAll(w, map) {
    const out = [];
    for (const t of (map || w.map).towers || []) out.push(spawn(w, t));
    return out;
  }

  // ---- damage gate
  function gate(w, target, amount, src, ability) {
    if (!target || !target.building) return amount;
    if (target.invulnerable) return 0;
    const a = ability || 'attack';
    if (a === 'meteorhammer' || a === 'item_meteor_hammer') return amount;
    if (a !== 'attack') return 0;
    const s = src && typeof src === 'object' ? src : (src != null && w ? w.get(src) : null);
    if (!s) return amount * 0.7;
    if (s.kind === 'hero') return amount * 0.5;
    if (s.kind === 'spirit') return amount * 0.6;
    return amount * 0.7;
  }

  // ---- order tracking (per world, via events)
  function hook(w) {
    if (w._towerHook) return;
    w._towerHook = true;
    w._atk = {};   // src id -> { t, target id, tteam }
    w.on('attack', p => {
      const s = w.byId.get(p.src), t = w.byId.get(p.target);
      if (!s || !t) return;
      w._atk[s.id] = { t: w.t, target: t.id, tteam: t.team, building: !!t.building };
      if (t.building) { t._atkBy = t._atkBy || {}; t._atkBy[s.id] = w.t; }
      if (s.building) return;
      for (const tw of w.ents) {
        if (tw.dead || tw.kind !== 'tower' || tw.destroyed) continue;
        // aggro: an enemy hero attacks a hero allied to this tower within 500 of it -> switch at once
        if (s.team !== tw.team && ALLY_HEROES[s.kind] && t.team === tw.team && allyHero(t) && !t.building &&
          Math.hypot(t.x - tw.x, t.y - tw.y) <= AGGRO_R && valid(w, tw, s)) tw.attack.target = s.id;
        // de-aggro: current target attacks one of its own allies -> re-pick (at most once per 2.5 s)
        else if (tw.attack.target === s.id && t.team === s.team && !t.building && w.t - tw._lastRepick >= REPICK_GAP) { tw._lastRepick = w.t; tw.attack.target = null; }
      }
    });
    w.on('damage', p => { const t = w.byId.get(p.target); if (t && t.kind === 'tower') t._lastBy = p.src; });
  }

  function attackable(e) {
    if (e.dead || !(e.hp > 0)) return false;
    return !(IT.Status && IT.Status.has && IT.Status.has(e, 'lift'));
  }
  function valid(w, tw, e) {
    if (!e || e.team === tw.team || !TARGET_KINDS[e.kind] || e.refill || !attackable(e)) return false;
    if (Math.hypot(e.x - tw.x, e.y - tw.y) > tw.attack.range + (e.radius || 0)) return false;
    return !IT.Vision || IT.Vision.canSee(w, tw, e);
  }

  function pick(w, tw) {
    let best = null, bd = 1e18, tier = 9;
    for (const e of w.ents) {
      if (!valid(w, tw, e)) continue;
      const d = Math.hypot(e.x - tw.x, e.y - tw.y);
      const at = w._atk[e.id], fresh = at && w.t - at.t <= RECENT;
      const pr = fresh && at.building && tw._atkBy[e.id] != null && w.t - tw._atkBy[e.id] <= RECENT ? 1 : fresh && at.tteam === tw.team && !at.building ? 2 : 3;
      if (pr < tier || (pr === tier && d < bd)) { best = e; bd = d; tier = pr; }
    }
    return best;
  }

  function launch(w, tw, t) {
    const a = tw.attack, amount = a.min + Math.floor(w.rng() * (a.max - a.min + 1));
    w.emit('towerAttack', { unit: tw.id, target: t.id });
    const tid = t.id, src = tw.id, dist0 = Math.max(1, Math.hypot(t.x - tw.x, t.y - tw.y));
    w.thinker({
      kind: 'proj', team: tw.team, x: tw.x, y: tw.y, z: LAUNCH_Z, radius: 0, src, target: tid, ability: 'attack', fx: 'tower', speed: PROJ,
      upd(w2, p, dt) {
        const tt = w2.get(tid); if (!tt) return true;
        const d = Math.hypot(tt.x - p.x, tt.y - p.y), st = PROJ * dt;
        if (d <= st + (tt.radius || 0) * 0.5) {
          if (IT.Status && IT.Status.has(tt, 'lift')) { w2.emit('miss', { src, ability: 'attack', x: tt.x, y: tt.y }); return true; }
          const s = w2.byId.get(src) || src;
          if (IT.Combat) IT.Combat.damage(w2, { src: s, target: tt, ability: 'attack', type: 'physical', amount });
          w2.emit('attackHit', { src, target: tid }); w2.emit('hit', { src, target: tid, ability: 'attack' });
          return true;
        }
        p.x += (tt.x - p.x) / d * st; p.y += (tt.y - p.y) / d * st;
        p.z = Math.max(40, LAUNCH_Z * Math.min(1, d / dist0));
        return false;
      },
    });
  }

  IT.World.system('towerAura', 12, (w) => {
    let any = false;
    for (const tw of w.ents) if (!tw.dead && tw.kind === 'tower' && !tw.destroyed) { any = true; break; }
    if (!any) return;
    for (const e of w.ents) {
      if (e.dead || !allyHero(e) || !(e.hp > 0)) continue;
      let ba = 0, br = 0;
      for (const tw of w.ents) {
        if (tw.dead || tw.kind !== 'tower' || tw.destroyed || tw.team !== e.team) continue;
        if (Math.hypot(e.x - tw.x, e.y - tw.y) > PROT_R) continue;
        const T = TIERS[tw.tier]; ba = Math.max(ba, T.protArmor); br = Math.max(br, T.protRegen);
      }
      if (!ba) continue;
      let s = e.statuses.find(x => x.type === 'towerProt');
      if (!s) { s = { type: 'towerProt', until: 0, hidden: true, data: {} }; e.statuses.push(s); }
      s.until = w.t + 0.25; s.data.stats = { armor: ba, hpRegen: br };
    }
  });

  IT.World.system('towers', 32, (w, dt) => {
    for (const tw of w.ents) {
      if (tw.dead || tw.kind !== 'tower') continue;
      if (!tw.destroyed && tw.hp <= 0) {
        tw.destroyed = true; tw.hp = 0; tw.attack.target = null; tw.vision = 0; tw.trueSight = 0;
        w.emit('towerDown', { unit: tw.id, team: tw.team, tier: tw.tier, by: tw._lastBy });
      }
      if (tw.destroyed) continue;
      const a = tw.attack;
      if (a.next > 0) a.next = Math.max(0, a.next - dt);
      let t = a.target != null ? w.get(a.target) : null;
      if (t && !valid(w, tw, t)) t = null;
      if (!t) { t = pick(w, tw); a.target = t ? t.id : null; }
      if (t && a.next <= 1e-9) { a.next = a.bat; launch(w, tw, t); }
    }
  });

  // ---- static map structures (map.structures: barracks, fort, filler, fountain, shop, outpost): not sim entities, never damaged
  // (Dota keeps them invulnerable behind their towers; this trainer has no creeps / backdoor rules). Selectable for a HUD status card.
  // HP / armor: npc_units.txt (SteamDatabase/GameTracking-Dota2 master, 2026-10-12): melee rax 2200/15, ranged rax 1300/9,
  // fort 4500/23, fillers 1000/10, watch tower (outpost) 450/0, fountain armor 0 + attack 290-310 range 1200; shops have no unit.
  const STRUCT_KV = {
    melee: { hp: 2200, armor: 15, name: { en: 'Melee Barracks', pt: 'Quartel Corpo a Corpo' } },
    range: { hp: 1300, armor: 9, name: { en: 'Ranged Barracks', pt: 'Quartel à Distância' } },
    fort: { hp: 4500, armor: 23, name: { en: 'Ancient', pt: 'Ancient' } },
    filler: { hp: 1000, armor: 10, name: { en: 'Effigy Building', pt: 'Construção Efígie' } },
    outpost: { hp: 450, armor: 0, name: { en: 'Outpost', pt: 'Outpost' } },
    fountain: { hp: 0, armor: 0, name: { en: 'Fountain', pt: 'Fonte' }, attack: { min: 290, max: 310, range: 1200 } },
    shop: { hp: 0, armor: 0, name: { en: 'Shop', pt: 'Loja' } },
    secret: { hp: 0, armor: 0, name: { en: 'Secret Shop', pt: 'Loja Secreta' } },
  };
  const TEAM_NAME = { 0: { en: 'Radiant', pt: 'Radiant' }, 1: { en: 'Dire', pt: 'Dire' } };
  const loc = v => v == null ? '' : typeof v === 'object' ? (v[IT.lang] || v.en || '') : String(v);
  // structure sub-kind: barracks melee / range from the Dota entity name at that world tile; shops near a fountain = home shop, else secret
  function structSub(map, s) {
    if (s.sub) return s.sub;
    let sub = s.kind;
    const D = IT.DOTAWORLD, wd = map && map.world;
    if (s.kind === 'barracks') {
      sub = s.tx % 2 ? 'melee' : 'range';
      if (D && wd && D.ents && D.ents.barracks) {
        for (const e of D.ents.barracks) {
          const tx = Math.floor((e.x - D.x0) / D.tile) - wd.gx0, ty = Math.floor((D.y1 - e.y) / D.tile) - wd.gy0;
          if (tx === s.tx && ty === s.ty) { sub = /range/.test(e.name || '') ? 'range' : 'melee'; break; }
        }
      }
    } else if (s.kind === 'shop') {
      sub = (map.structures || []).some(f => f.kind === 'fountain' && Math.hypot(f.x - s.x, f.y - s.y) < 2400) ? 'shop' : 'secret';
    }
    s.sub = sub;
    return sub;
  }
  // HUD card of a structure (cached on it): an entity-shaped read-only object
  function structCard(map, s) {
    const sub = structSub(map, s), K = STRUCT_KV[sub] || STRUCT_KV.filler;
    const team = s.team, tn = TEAM_NAME[team];
    const card = s._card || (s._card = { kind: 'structure', building: true, structure: true, statuses: [], items: [], ms: 0, magicRes: 0 });
    Object.assign(card, {
      id: 'S' + (map.structures || []).indexOf(s), sub, team: team == null ? -1 : team, x: s.x, y: s.y, radius: (s.hw + 0.5) * (map.tile || 48),
      name: (tn ? loc(tn) + ' ' : '') + loc(K.name), hp: K.hp, maxHp: K.hp, armor: K.armor, invulnerable: true,
      attack: K.attack ? { min: K.attack.min, max: K.attack.max, range: K.attack.range } : null,
    });
    return card;
  }
  // sprite heights (world units) above a building's base, for click picking (render/towers.js draws them this tall)
  const PICK_H = { tower: 64, barracks: 46, fort: 84, filler: 48, fountain: 46, shop: 42, outpost: 52 };
  // building under world point p: { ent } for a tower entity, { struct: index } for a map structure, or null. P = world units per px.
  function buildingAt(w, p, P) {
    P = P || (IT.GAME && IT.GAME.UNIT_PX) || 6;
    let best = null, bd = Infinity;
    const test = (x, y, hw, h, foot, r) => {
      if (Math.abs(p.x - x) > hw || p.y > y + foot || p.y < y + foot - h) return;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = r; }
    };
    for (const e of w.ents) if (!e.dead && e.kind === 'tower') test(e.x, e.y, 12 * P, PICK_H.tower * P, 11 * P, { ent: e });
    const sts = (w.map && w.map.structures) || [];
    for (let i = 0; i < sts.length; i++) {
      const s = sts[i], half = (s.hw + 0.5) * w.map.tile;
      test(s.x, s.y, half, (PICK_H[s.kind] || 44) * P, half, { struct: i });
    }
    return best;
  }

  IT.Towers = { TIERS, RANGE, PROT_R, TRUE_SIGHT, spawn, spawnAll, gate, STRUCT_KV, structSub, structCard, buildingAt };
})(typeof window !== 'undefined' ? window : globalThis);
