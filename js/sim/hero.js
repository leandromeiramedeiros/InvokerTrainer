// Hero entity + generic per-tick stat derivation (all units) + regen. Pure.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const U = () => IT.U;
  const UNITS = { hero: 1, dummy: 1, enemy: 1, spirit: 1 };
  const ORBN = { Q: ['quas', 'invoker_quas'], W: ['wex', 'invoker_wex'], E: ['exort', 'invoker_exort'] };

  function attrs(ctx) {
    const h = IT.DOTA.hero, V = IT.Values, L = ctx.heroLevel;
    const orbAttr = (ab, key, orb) => V.get(ab, key, ctx) * ctx.eff[orb];   // KV bonus is per orb level
    return {
      str: h.AttributeBaseStrength + h.AttributeStrengthGain * (L - 1) + orbAttr('invoker_quas', 'strength_bonus', 'quas'),
      agi: h.AttributeBaseAgility + h.AttributeAgilityGain * (L - 1) + orbAttr('invoker_wex', 'agility_bonus', 'wex'),
      int: h.AttributeBaseIntelligence + h.AttributeIntelligenceGain * (L - 1) + orbAttr('invoker_exort', 'intelligence_bonus', 'exort'),
    };
  }

  function build(ctx) {
    const h = IT.DOTA.hero, a = attrs(ctx);
    const base = {
      ms: h.MovementSpeed, armor: h.ArmorPhysical + a.agi / 6,
      magicRes: (h.MagicalResistance != null ? h.MagicalResistance : 25) / 100 + 0.001 * a.int,
      hpRegen: h.StatusHealthRegen + 0.1 * a.str, manaRegen: h.StatusManaRegen + 0.05 * a.int,
      as: (h.BaseAttackSpeed || 100) + a.agi, dmgMin: h.AttackDamageMin + a.int, dmgMax: h.AttackDamageMax + a.int,
      bat: h.AttackRate, point: h.AttackAnimationPoint, attackRange: h.AttackRange, projSpeed: h.ProjectileSpeed,
      acq: h.AttackAcquisitionRange,
    };
    // Max HP/mana use the whole part of the attribute (audit: L30 Invoker, STR 99.5 -> 2298 = 120 + 22*99, as in Dota)
    return { attr: a, base, maxHp: h.StatusHealth + 22 * Math.floor(a.str + 1e-9), maxMana: h.StatusMana + 12 * Math.floor(a.int + 1e-9) };
  }

  // Scenario `preinvoked:[spell, spell?]` (C3): put those spells in the invoke slots (slot 0 = the "last invoked" one) and set the
  // orb row to the first spell's recipe when every one of its orbs is unlocked at this loadout. Also used by ranked.apply().
  function applyPreinvoked(hero, lo) {
    const pre = IT.Loadout.fixPreinvoked(lo && lo.preinvoked);
    hero.inv.slots = [pre[0] || null, pre[1] || null];
    hero.inv.orbs = [];
    for (const s of pre) {
      const rec = IT.GAME.SPELL_ORBS[s];
      if (rec && rec.split('').every(k => hero.ctx.eff[ORBN[k][0]] >= 1)) { hero.inv.orbs = rec.split(''); break; }
    }
    return hero;
  }

  function create(w, loadout, x, y) {
    const lo = IT.Loadout.normalize(loadout || IT.Loadout.default());
    const ctx = IT.Loadout.ctx(lo), b = build(ctx), h = IT.DOTA.hero, bs = b.base;
    const items = [];
    for (let i = 0; i < 6; i++) items.push(lo.items[i] ? { id: lo.items[i], cd: 0, charges: 0 } : null);
    const e = w.add({
      kind: 'hero', team: 0, x, y, z: 0, facing: Math.PI / 2, radius: IT.GAME.HERO.radius,
      hp: b.maxHp, maxHp: b.maxHp, mana: b.maxMana, maxMana: b.maxMana,
      hpRegen: bs.hpRegen, manaRegen: bs.manaRegen, armor: bs.armor, magicRes: bs.magicRes, ms: bs.ms,
      turnRate: h.MovementTurnRate, vision: h.VisionDaytimeRange, visible: true, lastSeen: { x, y, t: w.t },
      attack: { min: bs.dmgMin, max: bs.dmgMax, bat: bs.bat, point: bs.point, range: bs.attackRange, projSpeed: bs.projSpeed, as: bs.as, acq: bs.acq, next: 0, target: null },
      base: bs, attr: b.attr,
      inv: { orbs: [], slots: [null, null], invokeCd: 0 }, cd: {}, items, ctx,
      skin: lo.skin, name: 'Invoker',
    });
    w.hero = e; w.ctx = ctx; w.loadout = lo;
    if (lo.preinvoked && lo.preinvoked.length) applyPreinvoked(e, lo);
    return e;
  }

  // Rebuild base stats/ctx after the loadout changed (keeps hp/mana fractions).
  function refresh(w, hero, loadout) {
    const lo = IT.Loadout.normalize(loadout), ctx = IT.Loadout.ctx(lo), b = build(ctx);
    const fh = hero.hp / hero.maxHp, fm = hero.mana / hero.maxMana;
    hero.ctx = ctx; hero.attr = b.attr; hero.base = b.base; hero.maxHp = b.maxHp; hero.maxMana = b.maxMana;
    hero.hp = fh * b.maxHp; hero.mana = fm * b.maxMana;
    if (w.hero === hero) { w.ctx = ctx; w.loadout = lo; }
  }

  const sp = e => (e.attack && e.attack.as) || 100;
  const attackTime = e => e.attack.bat / (sp(e) / 100);
  const attackPoint = e => e.attack.point / (sp(e) / 100);

  function snapshot(e) {
    const a = e.attack;
    return {
      ms: e.ms || 0, armor: e.armor || 0, magicRes: e.magicRes || 0, hpRegen: e.hpRegen || 0, manaRegen: e.manaRegen || 0,
      as: a ? a.as || 100 : 100, dmgMin: a ? a.min : 0, dmgMax: a ? a.max : 0, bat: a ? a.bat : 1.7, point: a ? a.point : 0.4,
      attackRange: a ? a.range : 0, projSpeed: a ? a.projSpeed || 0 : 0, acq: a ? a.acq || a.range : 0,
    };
  }

  // order 15: recompute derived stats from base + orb passives + status stats - slows
  IT.World.system('stats', 15, (w) => {
    const V = IT.Values;
    for (const e of w.ents) {
      if (e.dead || !UNITS[e.kind]) continue;
      const b = e.base || (e.base = snapshot(e));
      let ms = b.ms, msPct = 0, armor = b.armor, mr = b.magicRes, hpr = b.hpRegen, mpr = b.manaRegen, as = b.as, dmg = 0;
      if (e.kind === 'hero' && e.inv && e.ctx) {
        const n = { Q: 0, W: 0, E: 0 };
        for (const o of e.inv.orbs) n[o]++;
        if (n.Q) hpr += n.Q * V.get('invoker_quas', 'hp_regen_per_instance', e.ctx);
        if (n.W) { msPct += n.W * V.get('invoker_wex', 'move_speed_per_instance', e.ctx); as += n.W * V.get('invoker_wex', 'attack_speed_per_instance', e.ctx); }
        if (n.E) dmg += n.E * V.get('invoker_exort', 'bonus_damage_per_instance', e.ctx);
      }
      for (const s of e.statuses) {
        const st = s.data && s.data.stats; if (!st) continue;
        as += st.as || 0; dmg += st.dmg || 0; ms += st.ms || 0; msPct += st.msPct || 0;
        armor += st.armor || 0; mr += st.magicRes || 0; hpr += st.hpRegen || 0; mpr += st.manaRegen || 0;
      }
      const hexed = IT.Status.has(e, 'hex');
      if (hexed) ms = (IT.DOTA.items.item_sheepstick.values.sheep_movement_speed.v[0]) || 140;
      else {
        ms = ms * (1 + msPct / 100);
        ms *= 1 - IT.Status.slowPct(e);
        if (b.ms > 0) ms = U().clamp(ms, 100, 550);
      }
      e.ms = ms; e.armor = armor; e.magicRes = U().clamp(mr, -1, 0.99); e.hpRegen = hpr; e.manaRegen = mpr;
      const a = e.attack;
      if (a) {
        a.as = U().clamp(as, 20, 700); a.min = b.dmgMin + dmg; a.max = b.dmgMax + dmg;
        a.bat = b.bat; a.point = b.point; a.range = b.attackRange; a.projSpeed = b.projSpeed;
      }
    }
  });

  IT.World.system('regen', 48, (w, dt) => {
    for (const e of w.ents) {
      if (e.dead || !UNITS[e.kind] || !(e.hp > 0)) continue;
      if (e.hpRegen && e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.hpRegen * dt);
      if (e.manaRegen && e.maxMana) e.mana = Math.min(e.maxMana, e.mana + e.manaRegen * dt);
    }
  });

  // Level-up rules view (plan G2-G4, batch P single pool): IT.Hero.levelInfo(lvl, {quas,wex,exort}, scepter, talents?) -> { points, spent, bank, maxPerOrb, orbCap,
  // invokeCd, canRaise:{}, locked:{}, talentsAllowed:{}, ... } (see IT.RULES.levelInfo)
  const levelInfo = (lvl, orbs, scepter, talents) => IT.RULES.levelInfo(lvl, orbs, scepter, talents);

  IT.Hero = { create, refresh, levelInfo, applyPreinvoked, attackTime, attackPoint, attrs, maxHp: ctx => build(ctx).maxHp, maxMana: ctx => build(ctx).maxMana };
})(typeof window !== 'undefined' ? window : globalThis);
