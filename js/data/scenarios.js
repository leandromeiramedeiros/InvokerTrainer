// Combo Practice / Ranked / sandbox scenarios (data only; engine in js/sim/ranked.js). Owner: S3.
// Every scenario plays on a real v5 map (js/data/maps.js) with that map's towers; spots are relative (arena tags / towers / structures /
// other units), never absolute coordinates. Texts of the v5 set live in the i18n pack js/data/i18n/scn.js ('scn.<id>.name|flair|desc|win|lose').
//   { id, level 1..10 (ranked ramp; tier 1..3 derives from it), tags, map, name, flair, desc, win, lose?, par (s, a clean run),
//     hero, units, obj, fail, steps, rand, fog?, gate?, towerHp? }
//   hero   = { lvl, style 'qe'|'qw', items:[ids], scepter:orb, shard:spell, preinvoked:[spell, spell], at:<spot> (default: the map spawn) }
//   spot   = { dx, dy } offset | { where:[tags], not:[tags], d:[min,max], clear, has:{spot}, beyond:'gate', i, ox, oy, towers }
//            | { tower:{team,i}, ahead, side } | { struct:{kind,team,i}, ahead, side } | { gate:true, ahead, side } | { of:k, dx, dy, ahead, side }
//            map arena tags: open highground lowground river tower choke fog pit; relative: high low level hidden seen dtower rtower
//            (heroes never start in a Dire tower's range, foes never stand in a Radiant tower's, unless towers:true)
//   units  = [spot + { hp (start fraction on the old 25% kill line: the foe has (hp - 0.25) x 2200 x tier hpMul), mot 'still'|'flee'|'chase'|'march',
//            behavior (enemy AI: stationary wander escape disable_escape defend), items, useBkb, aware (0..1 base awareness) }]  (enemy NPC heroes)
//   obj    = kill | kill_with {how} | killN {n, one, span} | push {n} (one Deafening Blast) | destroyTower | rootAll | escape {time} | hold {time}
//            how = { ability:[ids], by:'hero'|'spirit', low, high, inv } checked on every kill (a wrong kill = the 'method' fail)
//   fail   = subset of: time died cross (a foe reaches the gate) seen (an enemy notices you before your first hit) method escaped caught tower
//   steps  = [{ a: spell|item|'attack'|'move', at: 'd0'|'d1'|'mid'|'self'|'lead'|'tower', w: wait s }]  the STEP-BY-STEP HUD + the test bot script
//   rand   = { pick: seeded choice among the best n arenas, jit: +-units of seeded jitter }
// Legacy 13 (S(...) below, inline texts) keep their ids, hp and solver scripts; they get a level, a map and arena-relative spots.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const L = (en, pt) => ({ en, pt });
  const S = (id, tier, name, tip, goal, par, hero, dummies, obj, sol, extra) => Object.assign({ id, tier, name, tip, goal, par, hero, dummies, obj, sol }, extra || {});
  const D = (dx, dy, o) => Object.assign({ dx, dy }, o || {});

  const LEGACY = [
    S('tornado_chain', 3, L('Tornado chain', 'Cadeia de Tornado'),
      L('Tornado lifts it, EMP goes under it, then Meteor and Blast land the moment it drops. Kill it before it runs.',
        'O Tornado ergue o alvo, o EMP vai embaixo e o Meteor e o Blast caem quando ele desce. Mate antes que fuja.'),
      L('Tornado, EMP, Meteor, Blast: kill it', 'Tornado, EMP, Meteor, Blast: mate o alvo'), 16,
      { lvl: 25 }, [D(550, 0, { hp: 0.52 })], { type: 'kill' },
      [{ a: 'tornado', at: 'd0' }, { a: 'emp', at: 'd0', w: 0.5 }, { a: 'chaosmeteor', at: 'd0', w: 0.7 }, { a: 'deafeningblast', at: 'd0', w: 1.2 }]),
    S('burst_cold_forge', 2, L('Cold Snap burst', 'Burst de Cold Snap'),
      L('Freeze it, drop Forge Spirits and Alacrity on yourself, then pour in attacks while it cannot move.',
        'Congele, chame os Forge Spirits e use Alacrity em você, depois ataque enquanto ele não anda.'),
      L('Cold Snap + Forge + Alacrity: kill it', 'Cold Snap + Forge + Alacrity: mate o alvo'), 14,
      { lvl: 25 }, [D(450, 0, { hp: 0.8 })], { type: 'kill' },
      [{ a: 'coldsnap', at: 'd0' }, { a: 'forgespirit', at: 'self', w: 0.3 }, { a: 'alacrity', at: 'self', w: 0.3 }, { a: 'attack', at: 'd0', w: 0.2 }]),
    S('sun_snipe', 2, L('Sun Strike snipe', 'Snipe de Sun Strike'),
      L('The dummy is nearly dead and running away. Sun Strike takes 1.7 s to land, so aim where it will be.',
        'O alvo está quase morto e foge. O Sun Strike leva 1,7 s para cair, então mire onde ele vai estar.'),
      L('Finish the fleeing dummy', 'Acabe com o alvo em fuga'), 8,
      { lvl: 25 }, [D(500, -150, { hp: 0.38, mot: 'flee' })], { type: 'kill' },
      [{ a: 'sunstrike', at: 'lead', w: 1.2 }]),
    S('blink_fog', 3, L('Blink from the fog', 'Blink saindo da névoa'),
      L('It stands far away in the fog. Blink in, then Chaos Meteor and Deafening Blast before it reacts.',
        'Ele está longe, na névoa. Dê Blink, depois Chaos Meteor e Deafening Blast antes de ele reagir.'),
      L('Blink, Meteor, Blast: kill it', 'Blink, Meteor, Blast: mate o alvo'), 12,
      { lvl: 25, items: ['blink'] }, [D(1000, 150, { hp: 0.40 })], { type: 'kill' },
      [{ a: 'blink', at: 'mid' }, { a: 'chaosmeteor', at: 'd0', w: 0.2 }, { a: 'deafeningblast', at: 'd0', w: 1.2 }],
      { fog: true }),
    S('atos_vyse_lock', 3, L('Atos / Hex lockdown', 'Lockdown com Atos / Hex'),
      L('Root it with Rod of Atos or Hex it with the Scythe, then Sun Strike and Chaos Meteor before it breaks free.',
        'Prenda com o Rod of Atos ou transforme com a Scythe, depois Sun Strike e Chaos Meteor antes que se solte.'),
      L('Atos or Hex, then Sun Strike + Meteor', 'Atos ou Hex, depois Sun Strike + Meteor'), 14,
      { lvl: 25, items: ['atos', 'vyse'] }, [D(550, 0, { hp: 0.5 })], { type: 'kill' },
      [{ a: 'atos', at: 'd0' }, { a: 'sunstrike', at: 'd0', w: 0.2 }, { a: 'chaosmeteor', at: 'd0', w: 0.3 }]),
    S('tornado_sun', 2, L('Tornado + Sun Strike', 'Tornado + Sun Strike'),
      L('Cast Sun Strike right after Tornado so the beam lands exactly when the dummy drops.',
        'Lance o Sun Strike logo após o Tornado para o raio cair exatamente quando o alvo descer.'),
      L('Tornado, then Sun Strike on landing', 'Tornado, depois Sun Strike no pouso'), 10,
      { lvl: 25 }, [D(500, 0, { hp: 0.47 })], { type: 'kill' },
      [{ a: 'tornado', at: 'd0' }, { a: 'sunstrike', at: 'd0', w: 1.2 }]),
    S('refresher_double', 3, L('Refresher double', 'Refresher duplo'),
      L('Meteor and Blast, Refresher, then do it again. Plan your mana: the second round decides the kill.',
        'Meteor e Blast, Refresher, e de novo. Planeje a mana: a segunda rodada decide a morte.'),
      L('Two rounds of Meteor + Blast', 'Duas rodadas de Meteor + Blast'), 20,
      { lvl: 30, items: ['refresher'] }, [D(500, 0, { hp: 0.58, mot: 'still' })], { type: 'kill' },
      [{ a: 'chaosmeteor', at: 'd0' }, { a: 'deafeningblast', at: 'd0', w: 1.4 }, { a: 'refresher', at: 'self', w: 0.3 },
        { a: 'chaosmeteor', at: 'd0', w: 0.3 }, { a: 'deafeningblast', at: 'd0', w: 1.4 }]),
    S('icewall_emp_pull', 2, L('Ice Wall + EMP pull', 'Ice Wall + EMP com puxada'),
      L('Slow it with the wall, then EMP beside it: the shard drags it to the center while its mana burns.',
        'Deixe-o lento com a parede e use EMP ao lado: a shard o puxa ao centro enquanto a mana queima.'),
      L('Ice Wall + EMP with the shard', 'Ice Wall + EMP com a shard'), 12,
      { lvl: 25, shard: 'emp' }, [D(450, 0, { hp: 0.6 })], { type: 'kill' },
      [{ a: 'icewall', at: 'd0' }, { a: 'emp', at: 'd0', w: 0.3 }, { a: 'forgespirit', at: 'self', w: 0.3 }, { a: 'attack', at: 'd0', w: 0.2 }]),
    S('ghost_escape', 1, L('Ghost Walk escape', 'Fuga com Ghost Walk'),
      L('A chaser is closing in. Ghost Walk makes you invisible and slows it: break contact and survive.',
        'Um perseguidor se aproxima. O Ghost Walk te deixa invisível e o deixa lento: quebre o contato e sobreviva.'),
      L('Survive without being caught', 'Sobreviva sem ser pego'), 10,
      { lvl: 25 }, [D(-450, 0, { mot: 'chase' })], { type: 'escape', time: 9 },
      [{ a: 'ghostwalk', at: 'self' }]),
    S('cataclysm_finish', 3, L('Cataclysm finish', 'Final com Cataclysm'),
      L('With the Scepter on Exort, Sun Strike becomes Cataclysm: it strikes every visible enemy nearby. Finish the low-HP group.',
        'Com o Scepter em Exort, o Sun Strike vira Cataclysm: atinge todos os inimigos visíveis. Acabe com o grupo ferido.'),
      L('Cataclysm: kill them all', 'Cataclysm: mate todos'), 8,
      { lvl: 25, scepter: 'exort' }, [D(450, -100, { hp: 0.42 }), D(550, 120, { hp: 0.42 })], { type: 'kill' },
      [{ a: 'sunstrike', at: 'self' }]),
    S('orchid_burst', 2, L('Orchid burst', 'Burst com Orchid'),
      L('Orchid silences it and stores all damage for a burst. Cold Snap, Forge and Alacrity attacks all feed the pop.',
        'O Orchid silencia e guarda todo o dano para uma explosão. Cold Snap, Forge e ataques com Alacrity alimentam o estouro.'),
      L('Orchid then burst: kill it', 'Orchid e burst: mate o alvo'), 16,
      { lvl: 25, items: ['orchid'] }, [D(450, 0, { hp: 0.65 })], { type: 'kill' },
      [{ a: 'orchid', at: 'd0' }, { a: 'coldsnap', at: 'd0', w: 0.2 }, { a: 'forgespirit', at: 'self', w: 0.3 }, { a: 'alacrity', at: 'self', w: 0.3 }, { a: 'attack', at: 'd0', w: 0.2 }]),
    S('gleipnir_burst', 3, L('Gleipnir burst', 'Burst com Gleipnir'),
      L('Eternal Chains roots it. While it stands still, line up Sun Strike, Chaos Meteor and Deafening Blast.',
        'As Eternal Chains prendem o alvo. Enquanto ele está parado, alinhe Sun Strike, Chaos Meteor e Deafening Blast.'),
      L('Gleipnir, Sun Strike, Meteor, Blast', 'Gleipnir, Sun Strike, Meteor, Blast'), 15,
      { lvl: 25, items: ['gleipnir'] }, [D(550, 0, { hp: 0.51 })], { type: 'kill' },
      [{ a: 'gleipnir', at: 'd0' }, { a: 'sunstrike', at: 'd0', w: 0.2 }, { a: 'chaosmeteor', at: 'd0', w: 0.3 }, { a: 'deafeningblast', at: 'd0', w: 1.2 }]),
    S('gleipnir_cluster', 1, L('Gleipnir on the group', 'Gleipnir no grupo'),
      L('Aim Eternal Chains at the middle of the group so every dummy is rooted at the same time.',
        'Mire as Eternal Chains no meio do grupo para prender todos ao mesmo tempo.'),
      L('Root every dummy at once', 'Prenda todos de uma vez'), 6,
      { lvl: 25, items: ['gleipnir'] }, [D(600, -130, { mot: 'still' }), D(650, 40, { mot: 'still' }), D(560, 150, { mot: 'still' })], { type: 'rootAll' },
      [{ a: 'gleipnir', at: 'mid' }]),
  ];

  // ---------------------------------------------------------------- v5 set (texts: js/data/i18n/scn.js)
  const W = (where, o) => Object.assign({ where }, o || {});   // arena spot
  const U = (spot, o) => Object.assign({}, spot, o || {});     // unit = spot + foe fields
  const V = (id, level, map, tags, par, hero, units, obj, fail, steps, extra) =>
    Object.assign({ id, level, map, tags, par, hero: Object.assign({ lvl: 25 }, hero), units, obj, fail, steps }, extra || {});
  const SEEN = (d, o) => W(['level', 'seen'], Object.assign({ d }, o || {}));   // a foe on the hero's level, in plain sight
  const KILL = { type: 'kill' };

  const V5 = [
    // ---------------------------------------------------------------- level 1: one target, one idea
    V('sleepy_target', 1, 'lotus_rad', ['basics', 'burst'], 8, { preinvoked: ['sunstrike', 'coldsnap'] },
      [U(SEEN([650, 900]), { hp: 0.4, mot: 'still', aware: 0 })], KILL, ['time'],
      [{ a: 'sunstrike', at: 'd0' }], { rand: { pick: 3 } }),
    V('cold_start', 1, 'roshan_pit_top',['basics', 'movement'], 14, { preinvoked: ['coldsnap', 'forgespirit'] },
      [U(SEEN([950, 1250]), { hp: 0.5, mot: 'still', aware: 0 })], KILL, ['time'],
      [{ a: 'coldsnap', at: 'd0' }, { a: 'forgespirit', at: 'self' }, { a: 'attack', at: 'd0' }], { rand: { pick: 3 } }),
    V('spirit_pack', 1, 'rad_off_t1', ['basics', 'burst'], 14, { preinvoked: ['forgespirit', 'alacrity'] },
      [U(SEEN([500, 750]), { hp: 0.5, mot: 'still', aware: 0 })], KILL, ['time'],
      [{ a: 'forgespirit', at: 'self' }, { a: 'alacrity', at: 'self' }, { a: 'attack', at: 'd0' }], { rand: { pick: 3 } }),
    // ---------------------------------------------------------------- level 2
    V('river_rune', 2, 'river_top', ['river', 'basics'], 10,
      { preinvoked: ['chaosmeteor', 'sunstrike'], at: W(['river'], { d: [0, 2500], has: { where: ['river', 'level', 'seen'], d: [500, 700] } }) },
      [U(W(['river', 'level', 'seen'], { d: [500, 700] }), { hp: 0.36, mot: 'still', aware: 0.2 })],
      { type: 'kill_with', how: { ability: ['chaosmeteor'] } }, ['method', 'time'], [{ a: 'chaosmeteor', at: 'd0' }], { rand: { pick: 3 } }),
    // ---------------------------------------------------------------- level 3
    V('two_birds', 3, 'dire_triangle', ['multi', 'burst'], 10, { preinvoked: ['sunstrike', 'chaosmeteor'] },
      [U(SEEN([820, 1100], { clear: 3 }), { hp: 0.35, mot: 'still', aware: 0.2 }), U({ of: 0, side: 120 }, { hp: 0.35, mot: 'still', aware: 0.2 })],
      { type: 'killN', n: 2, one: true }, ['method', 'time'], [{ a: 'sunstrike', at: 'mid' }], { rand: { pick: 3 } }),
    V('river_guard', 3, 'mid_river', ['river', 'multi', 'reaction'], 12, { preinvoked: ['sunstrike', 'deafeningblast'] },
      [U(W([], { beyond: 'gate', d: [1500, 2200] }), { hp: 0.35, mot: 'march' }), U({ of: 0, side: 340 }, { hp: 0.35, mot: 'march' })],
      KILL, ['cross', 'time'], [{ a: 'sunstrike', at: 'lead', w: 0.3 }, { a: 'move', at: 'gate' }, { a: 'deafeningblast', at: 'd1', near: 1000 }],
      { gate: W(['river'], { d: [500, 1000], r: 260 }) }),
    // ---------------------------------------------------------------- level 4
    V('uphill_snipe', 4, 'river_top', ['highground', 'vision'], 10,
      { preinvoked: ['sunstrike', 'chaosmeteor'], at: W(['lowground'], { d: [0, 3000], has: { where: ['high', 'hidden'], d: [500, 800] } }) },
      [U(W(['high', 'hidden'], { d: [500, 800] }), { hp: 0.42, mot: 'still', aware: 0.3 })],
      { type: 'kill', how: { low: true } }, ['method', 'time'], [{ a: 'sunstrike', at: 'd0' }], { rand: { pick: 2 } }),
    V('sun_flee', 4, 'river_bot', ['river', 'prediction'], 8,
      { preinvoked: ['sunstrike', 'tornado'], at: W(['river'], { d: [0, 3000], has: { where: ['river', 'seen'], d: [500, 700] } }) },
      [U(W(['river', 'seen'], { d: [500, 700] }), { hp: 0.38, mot: 'flee' })],
      { type: 'kill_with', how: { ability: ['sunstrike'] } }, ['method', 'escaped', 'time'], [{ a: 'sunstrike', at: 'lead', w: 1 }]),
    // ---------------------------------------------------------------- level 5
    V('blast_push', 5, 'rad_triangle', ['multi', 'positioning'], 8, { preinvoked: ['deafeningblast', 'tornado'] },
      [U(SEEN([550, 700], { clear: 3 }), { hp: 1, mot: 'still' }), U({ of: 0, side: -120, ahead: 60 }, { hp: 1, mot: 'still' }), U({ of: 0, side: 120, ahead: -40 }, { hp: 1, mot: 'still' })],
      { type: 'push', n: 2 }, ['time'], [{ a: 'deafeningblast', at: 'mid' }], { rand: { pick: 3 } }),
    V('tower_dive', 5, 'dire_mid_t1', ['towers', 'blink'], 14,
      { items: ['blink'], preinvoked: ['chaosmeteor', 'deafeningblast'], at: { tower: { team: 1 }, ahead: -900 } },
      [U({ tower: { team: 1 }, ahead: 300, side: 60 }, { hp: 0.45, mot: 'still', aware: 0.3 })], KILL, ['died', 'time'],
      [{ a: 'blink', at: 'd0' }, { a: 'chaosmeteor', at: 'd0' }, { a: 'deafeningblast', at: 'd0', w: 0.6 }]),
    V('pit_trap', 5, 'roshan_pit', ['pit', 'burst'], 14,
      { preinvoked: ['coldsnap', 'chaosmeteor'], at: W([], { d: [0, 3000], has: { where: ['pit'], d: [600, 900] } }) },
      [U(W(['pit'], { d: [600, 900] }), { hp: 0.5, behavior: 'wander', aware: 0.5 })], KILL, ['time'],
      [{ a: 'coldsnap', at: 'd0' }, { a: 'chaosmeteor', at: 'd0' }, { a: 'deafeningblast', at: 'd0', w: 0.4 }]),
    // ---------------------------------------------------------------- level 6
    V('force_chase', 6, 'dire_safe_t1', ['movement', 'escape', 'items'], 14, { items: ['forcestaff'], preinvoked: ['tornado', 'sunstrike'] },
      [U(SEEN([900, 1100], { not: ['dtower'] }), { hp: 0.42, behavior: 'escape', aware: 1 })], KILL, ['escaped', 'time'],
      [{ a: 'forcestaff', at: 'self' }, { a: 'tornado', at: 'd0' }, { a: 'sunstrike', at: 'd0', w: 0.4 }]),
    V('ghost_finish', 6, 'lotus_dire', ['invisible', 'awareness'], 22, { preinvoked: ['forgespirit', 'ghostwalk'] },
      [U(SEEN([600, 800]), { hp: 0.4, mot: 'still', aware: 0.3 })],
      { type: 'kill', how: { by: 'spirit', inv: true } }, ['method', 'time'],
      [{ a: 'forgespirit', at: 'self' }, { a: 'ghostwalk', at: 'self' }, { a: 'move', at: 'd0' }]),
    V('tower_siege', 6, 'dire_off_t1', ['towers', 'items'], 28,
      { items: ['meteorhammer'], preinvoked: ['forgespirit', 'alacrity'], at: { tower: { team: 1 }, ahead: -950 } },
      [], { type: 'destroyTower' }, ['died', 'time'],
      [{ a: 'forgespirit', at: 'self' }, { a: 'alacrity', at: 'self' }, { a: 'meteorhammer', at: 'tower' }, { a: 'attack', at: 'tower' }], { towerHp: 650 }),
    // ---------------------------------------------------------------- level 7
    V('fog_ambush', 7, 'outpost_rad', ['vision', 'awareness', 'fog'], 10, { preinvoked: ['tornado', 'sunstrike'] },
      [U(SEEN([1000, 1300]), { hp: 0.45, mot: 'still', aware: 0.15 })], KILL, ['seen', 'time'],
      [{ a: 'tornado', at: 'd0' }, { a: 'sunstrike', at: 'd0', w: 1 }], { fog: true, rand: { pick: 3 } }),
    V('bkb_bait', 7, 'outpost_dire', ['reaction', 'items'], 20, { preinvoked: ['coldsnap', 'sunstrike'] },
      [U(SEEN([650, 900], { not: ['dtower'] }), { hp: 0.5, behavior: 'defend', items: ['bkb'], useBkb: true, aware: 1 })], KILL, ['died', 'time'],
      [{ a: 'coldsnap', at: 'd0' }, { a: 'tornado', at: 'd0', w: 6 }, { a: 'sunstrike', at: 'd0', w: 0.3 }, { a: 'chaosmeteor', at: 'd0', w: 0.3 }]),
    V('dust_hunt', 7, 'lotus_rad', ['invisible', 'escape', 'items'], 14, { items: ['dust'], preinvoked: ['coldsnap', 'sunstrike'] },
      [U(SEEN([700, 900]), { hp: 0.4, behavior: 'escape', items: ['shadowblade'], aware: 1 })], KILL, ['escaped', 'time'],
      [{ a: 'dust', at: 'self' }, { a: 'coldsnap', at: 'd0' }, { a: 'sunstrike', at: 'd0' }]),
    // ---------------------------------------------------------------- level 8
    V('river_guard_2', 8, 'gate_bot', ['river', 'multi', 'reaction', 'items'], 14, { lvl: 27, preinvoked: ['tornado', 'chaosmeteor'] },
      [U(W([], { beyond: 'gate', d: [1900, 2400] }), { hp: 0.33, mot: 'march' }), U({ of: 0, side: -220 }, { hp: 0.33, mot: 'march' }),
        U({ of: 0, side: 220 }, { hp: 0.33, mot: 'march', items: ['bkb'], useBkb: true })],
      KILL, ['cross', 'time'],
      [{ a: 'move', at: 'gate' }, { a: 'tornado', at: 'mid', near: 1800 }, { a: 'chaosmeteor', at: 'd0', near: 900 }, { a: 'sunstrike', at: 'lead' }, { a: 'deafeningblast', at: 'd0', near: 900 }],
      { gate: W(['river'], { d: [500, 1000], r: 260 }) }),
    V('cliff_blink', 8, 'dire_ancients', ['highground', 'blink', 'escape'], 12,
      { lvl: 27, items: ['blink'], preinvoked: ['tornado', 'sunstrike'], at: W(['lowground'], { d: [0, 3000], has: { where: ['high'], d: [600, 900] } }) },
      [U(W(['high'], { d: [600, 900] }), { hp: 0.42, behavior: 'escape', aware: 0.6 })], KILL, ['escaped', 'time'],
      [{ a: 'blink', at: 'd0' }, { a: 'tornado', at: 'd0' }, { a: 'sunstrike', at: 'd0', w: 0.5 }]),
    V('highground_hold', 8, 'rad_highground', ['highground', 'multi', 'towers'], 16,
      { lvl: 27, preinvoked: ['chaosmeteor', 'deafeningblast'], at: W(['highground'], { d: [0, 1500], has: { where: ['low'], d: [1100, 1700] } }) },
      [U(W(['low'], { d: [1100, 1700] }), { hp: 0.35, mot: 'march' }), U({ of: 0, side: 200 }, { hp: 0.35, mot: 'march' }), U({ of: 0, side: -200 }, { hp: 0.35, mot: 'march' })],
      KILL, ['cross', 'time'],
      [{ a: 'chaosmeteor', at: 'mid' }, { a: 'deafeningblast', at: 'mid', w: 0.4 }, { a: 'sunstrike', at: 'd0' }, { a: 'tornado', at: 'd0' }],
      { gate: { struct: { kind: 'barracks', team: 0 }, r: 300 } }),
    // ---------------------------------------------------------------- level 9
    V('triple_kill', 9, 'outpost_dire', ['multi', 'burst'], 8, { lvl: 30, scepter: 'exort', preinvoked: ['sunstrike'] },
      [U(SEEN([500, 700], { clear: 3, not: ['dtower'] }), { hp: 0.4, mot: 'still' }), U({ of: 0, side: 180 }, { hp: 0.4, mot: 'still' }), U({ of: 0, ahead: 200 }, { hp: 0.4, mot: 'still' })],
      { type: 'killN', n: 3, one: true, span: 1.2 }, ['method', 'time'], [{ a: 'sunstrike', at: 'self' }], { rand: { pick: 3 } }),
    V('blast_push_3', 9, 'dire_off_t1', ['multi', 'positioning'], 10, { lvl: 30, preinvoked: ['deafeningblast'] },
      [U(SEEN([500, 650], { clear: 3, not: ['dtower'] }), { hp: 1, mot: 'still' }), U({ of: 0, ahead: 170, side: 40 }, { hp: 1, mot: 'still' }), U({ of: 0, ahead: 340, side: -30 }, { hp: 1, mot: 'still' })],
      { type: 'push', n: 3 }, ['time'], [{ a: 'deafeningblast', at: 'd0' }], { rand: { pick: 3 } }),
    V('tower_tornado', 9, 'gate_top', ['towers', 'combo'], 10, { lvl: 30, preinvoked: ['tornado', 'sunstrike'], at: { tower: { team: 1 }, ahead: -1250 } },
      [U({ tower: { team: 1 }, ahead: -200, side: 120 }, { hp: 0.47, mot: 'still', aware: 0.3 })], KILL, ['tower', 'time'],
      [{ a: 'tornado', at: 'd0' }, { a: 'sunstrike', at: 'd0', w: 1.2 }]),
    // ---------------------------------------------------------------- level 10
    V('gauntlet', 10, 'dire_mid_t1', ['towers', 'escape', 'invisible', 'items'], 16,
      { lvl: 30, items: ['blink', 'dust'], preinvoked: ['coldsnap', 'sunstrike'], at: { tower: { team: 1 }, ahead: -1700 } },
      [U({ tower: { team: 1 }, ahead: -950 }, { hp: 0.45, behavior: 'escape', items: ['shadowblade', 'blink'], aware: 1 })], KILL, ['escaped', 'died', 'time'],
      [{ a: 'coldsnap', at: 'd0' }, { a: 'sunstrike', at: 'd0' }, { a: 'chaosmeteor', at: 'd0', w: 0.2 }, { a: 'deafeningblast', at: 'd0', w: 0.6 }]),
    V('blink_denial', 10, 'rad_triangle', ['reaction', 'escape', 'items'], 14, { lvl: 30, items: ['atos', 'blink'], preinvoked: ['sunstrike', 'chaosmeteor'] },
      [U(SEEN([750, 950]), { hp: 0.5, behavior: 'disable_escape', items: ['blink', 'forcestaff'], aware: 1 })], KILL, ['escaped', 'time'],
      [{ a: 'atos', at: 'd0' }, { a: 'sunstrike', at: 'd0' }, { a: 'chaosmeteor', at: 'd0', w: 0.2 }, { a: 'deafeningblast', at: 'd0', w: 0.6 }]),
    V('shadow_strike', 10, 'dire_triangle', ['invisible', 'awareness', 'multi'], 16, { lvl: 30, items: ['blink'], preinvoked: ['ghostwalk', 'tornado'] },
      [U(SEEN([1000, 1250], { clear: 2, not: ['dtower'] }), { hp: 0.4, behavior: 'wander', aware: 0.3 }), U({ of: 0, side: 250 }, { hp: 0.4, behavior: 'wander', aware: 0.3 })],
      KILL, ['seen', 'time'],
      [{ a: 'ghostwalk', at: 'self' }, { a: 'move', at: 'd0' }, { a: 'tornado', at: 'mid' }, { a: 'chaosmeteor', at: 'mid' }, { a: 'deafeningblast', at: 'mid', w: 0.8 }]),
  ];

  // ---- legacy set -> v5 fields: level, map, tags, arena-relative foes (unit 0 by arena, the rest by offset from it; the dx/dy stay as
  //      the fallback on a map without arenas), steps = the solver script. Ids, hp and solver scripts are unchanged.
  const LEG = {
    ghost_escape: [2, 'lotus_rad', ['escape', 'invisible']], gleipnir_cluster: [2, 'lotus_dire', ['items', 'multi']],
    tornado_sun: [3, 'rad_safe_t1', ['combo']], sun_snipe: [3, 'river_bot', ['prediction']],
    burst_cold_forge: [4, 'rad_off_t1', ['burst']], orchid_burst: [4, 'dire_off_t1', ['items', 'burst']],
    icewall_emp_pull: [5, 'outpost_rad', ['combo']], atos_vyse_lock: [6, 'dire_triangle', ['items']], gleipnir_burst: [6, 'rad_triangle', ['items']],
    blink_fog: [7, 'dire_ancients', ['blink', 'fog']], cataclysm_finish: [7, 'rad_ancients', ['multi']],
    tornado_chain: [8, 'mid_river', ['combo']], refresher_double: [9, 'dire_mid_t2', ['items']],
  };
  for (const s of LEGACY) {
    const l = LEG[s.id], d0 = s.dummies[0], r = Math.hypot(d0.dx, d0.dy);
    s.legacy = true; s.level = l[0]; s.map = l[1]; s.tags = l[2].concat('combo').filter((t, i, a) => a.indexOf(t) === i);
    s.units = s.dummies.map((d, i) => (i === 0
      ? Object.assign({}, d, { where: d.mot === 'chase' ? ['level'] : ['level', 'seen'], d: [r - 120, r + 120], not: ['dtower'] })
      : Object.assign({}, d, { of: 0, dx: d.dx - d0.dx, dy: d.dy - d0.dy })));
    s.dummies = s.units;
    s.fail = s.obj.type === 'escape' ? ['caught'] : d0.mot === 'flee' ? ['escaped', 'time'] : ['time'];
    s.steps = s.sol; s.flair = s.tip; s.desc = s.goal;
  }

  // ---- v5 set: texts from the i18n pack (lazy, so load order does not matter; null until the pack is loaded), HUD aliases tip/goal
  const tr = k => { const I = IT.I18N; if (!I || I.en[k] == null) return null; return { en: I.en[k], pt: I.pt[k] != null ? I.pt[k] : I.en[k] }; };
  const getter = (s, f, k) => Object.defineProperty(s, f, { enumerable: true, configurable: true, get: () => tr(k) });
  for (const s of V5) {
    for (const f of ['name', 'flair', 'desc', 'win', 'lose']) getter(s, f, 'scn.' + s.id + '.' + f);
    getter(s, 'tip', 'scn.' + s.id + '.flair'); getter(s, 'goal', 'scn.' + s.id + '.desc');
    s.dummies = s.units; s.sol = s.steps;
  }
  const all = LEGACY.concat(V5);
  for (const s of all) s.tier = s.level <= 3 ? 1 : s.level <= 7 ? 2 : 3;

  IT.SCENARIOS = all.map((s, i) => [s, i]).sort((a, b) => a[0].level - b[0].level || a[1] - b[1]).map(p => p[0]);   // easy -> advanced (stable)
  IT.SCENARIOS.get = id => IT.SCENARIOS.find(s => s.id === id) || null;
})(typeof window !== 'undefined' ? window : globalThis);
