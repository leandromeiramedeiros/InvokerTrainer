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
  const RANGE = 700, BAT = 0.9, PROJ = 750, VISION = 1900, TRUE_SIGHT = 700, PROT_R = 900, AGGRO_R = 500, RADIUS = 72, LAUNCH_Z = 260;
  const RECENT = 1.5;        // s an attack order counts as "attacking the tower / an ally"
  const REPICK_GAP = 2.5;
  const TARGET_KINDS = { hero: 1, spirit: 1, enemy: 1 };   // dummies are scarecrows: towers ignore them
  const ALLY_HEROES = { hero: 1, enemy: 1 };

  function spawn(w, o) {
    const tier = Math.max(1, Math.min(4, o.tier | 0 || 1)), T = TIERS[tier];
    hook(w);
    return w.add({
      kind: 'tower', building: true, team: o.team | 0, tier, x: o.x, y: o.y, radius: RADIUS,
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
        if (s.team !== tw.team && ALLY_HEROES[s.kind] && t.team === tw.team && ALLY_HEROES[t.kind] && !t.building &&
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
    if (!e || e.team === tw.team || !TARGET_KINDS[e.kind] || !attackable(e)) return false;
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
      if (e.dead || !ALLY_HEROES[e.kind] || !(e.hp > 0)) continue;
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

  IT.Towers = { TIERS, RANGE, PROT_R, spawn, spawnAll, gate };
})(typeof window !== 'undefined' ? window : globalThis);
