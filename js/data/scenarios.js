// Combo Practice / Ranked / sandbox scenarios (data only; engine in js/sim/ranked.js). Owner: S3.
// Every scenario plays on a real v5 map (js/data/maps.js) with that map's towers; spots are relative (arena tags / towers / structures /
// other units), never absolute coordinates. Texts of the v5 set live in the i18n pack js/data/i18n/scn.js ('scn.<id>.name|flair|desc|win|lose').
//   { id, level 1..10 (ranked ramp; tier 1..3 derives from it), tags, map, name, flair, desc, win, lose?, par (s, a clean run),
//     hero, units, obj, fail, steps, rand, gate?, towerHp?, limit? (s, overrides par x tier timer) }
//   hero   = { lvl, style 'qe'|'qw', items:[ids], scepter:orb, shard:spell, at:<spot> (default: the map spawn) }
//            v6: nothing is pre-invoked (the 12 s intro countdown is for invoking), fog of war is always on, every hero carries boots (see BOOTS below)
//   spot   = { dx, dy } offset | { where:[tags], not:[tags], d:[min,max], clear, has:{spot}, beyond:'gate', i, ox, oy, towers }
//            | { tower:{team,i}, ahead, side } | { struct:{kind,team,i}, ahead, side } | { gate:true, ahead, side } | { of:k, dx, dy, ahead, side }
//            map arena tags: open highground lowground river tower choke fog pit; relative: high low level hidden seen dtower rtower
//            (heroes never start in a Dire tower's range, foes never stand in a Radiant tower's, unless towers:true)
//   units  = [spot + { hp (start fraction on the old 25% kill line: the foe has (hp - 0.25) x 2200 x tier hpMul), mot 'still'|'flee'|'chase'|'march',
//            behavior (enemy AI: stationary wander escape disable_escape defend), items, useBkb, aware (0..1 base awareness),
//            msMul (x scripted move speed: a booted chaser) }]  (enemy NPC heroes)
//   obj    = kill | kill_with {how} | killN {n, one, span} | push {n} (one Deafening Blast) | destroyTower | rootAll | escape {time, caught, bump} | hold {time}
//            v6 item 27: escape {unseen (s in a row unseen = win), burn (detection the foes must waste first), noInvis} | reach {spot, r, noInvis}
//   spots  = { name: spot } (v6 item 27) resolved after the units -> w.spots; steps / focus 'spot:<name>'; spot fields from (a spot / unit k),
//            unseenBy [k | spot], turn (deg), far [[k, d]], strict (d is a hard bound)
//            escape: caught = visible contact distance (default Ranked.CAUGHT), bump = an invisible hero a foe walks within is found too
//            how = { ability:[ids], by:'hero'|'spirit', low, high, inv } checked on every kill (a wrong kill = the 'method' fail)
//   fail   = subset of: time died cross (a foe reaches the gate) seen (an enemy notices you before your first hit) method escaped caught tower
//   steps  = [{ a: spell|item|'attack'|'move', at: 'd0'|'d1'|'mid'|'self'|'lead'|'tower', w: wait s }]  the STEP-BY-STEP HUD + the test bot script
//   rand   = { pick: seeded choice among the best n arenas, jit: +-units of seeded jitter }
//   vary   = per-play variation overrides (v6 item 40, Ranked.variation): { posJit: [lo, hi] | n (extra +-u start jitter, default 80-150), hp: frac | [lo, hi] (foe hp, default +-0.08),
  //            reaction: frac (default 0.05), boots: false | 'boots' | 'travels' (default: chase / flee / march foes and 'escape' behaviours get boots, travels from hero lvl 16) }; a unit's own boots: false | id wins
  //   focus  = [areas the intro camera tour shows: 'pit' | 'gate' | 'tower'];  reveal (set below) = start reveal at hard / bambam too
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
      [{ a: 'sunstrike', at: 'lead', w: 1.2 }], { vary: { posJit: [40, 80] } }),
    S('blink_fog', 3, L('Blink from the fog', 'Blink saindo da névoa'),
      L('It stands far away in the fog. Blink in, then Chaos Meteor and Deafening Blast before it reacts.',
        'Ele está longe, na névoa. Dê Blink, depois Chaos Meteor e Deafening Blast antes de ele reagir.'),
      L('Blink, Meteor, Blast: kill it', 'Blink, Meteor, Blast: mate o alvo'), 12,
      { lvl: 25, items: ['blink'] }, [D(1000, 150, { hp: 0.40 })], { type: 'kill' },
      [{ a: 'blink', at: 'mid' }, { a: 'chaosmeteor', at: 'd0', w: 0.2 }, { a: 'deafeningblast', at: 'd0', w: 1.2 }]),
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
      [{ a: 'icewall', at: 'd0' }, { a: 'emp', at: 'd0', w: 0.3 }, { a: 'forgespirit', at: 'self', w: 0.3 }, { a: 'attack', at: 'd0', w: 0.2 }], { vary: { posJit: [40, 80] } }),
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
  // v6 item 27 (juke) builders: JH = hero start (arena index i, never in the river / a Dire tower's range); JC(n, d, extra) = n chasers
  // (the first SEEN d u away, the others 220 u to its sides; the third only from common up); JSP = the named spots 'cover' (hidden from
  // every chaser) and 'hide' (from the cover, bent, far from the chasers, hidden from the cover too); JS = the bot route cover -> hide
  const JH = (where, i) => W(where, { d: [0, 4000], i, not: ['river', 'dtower'] });
  const JC = (n, d, ex) => [U(SEEN(d || [1100, 1400], { i: 0 }), Object.assign({ mot: 'chase', hp: 1 }, (ex || [])[0])),
    U({ of: 0, side: 220 }, Object.assign({ mot: 'chase', hp: 1 }, (ex || [])[1])), U({ of: 0, side: -220 }, Object.assign({ mot: 'chase', hp: 1, minDf: 'common' }, (ex || [])[2]))].slice(0, n);
  const JSP = (n, ct, ci, hj, o) => {
    o = o || {}; const st = !!o.strict, vb = [0, 1, 2].slice(0, n);
    return { cover: W(ct, { d: st ? [300, 650] : [300, 600], unseenBy: vb, i: ci, strict: st }),
      hide: W(['level'], { from: 'cover', d: o.hid || (st ? [500, 950] : [500, 900]), unseenBy: vb.concat('cover'), turn: st ? 70 : 80, far: vb.map(k => [k, o.far || (st ? 1300 : 1200)]), i: hj, strict: st }) };
  };
  const JS = [{ a: 'move', at: 'spot:cover' }, { a: 'move', at: 'spot:hide' }], JF = ['caught', 'died', 'method'];
  const JX = sp => ({ spots: sp, focus: ['spot:cover', 'spot:hide'], rand: { pick: 1 }, vary: { boots: 'boots', posJit: 0 } });   // fixed arenas: the route is the puzzle
  // v6 item 55 (pit jukes): the crater is small and open on one side, so the arenas are explicit: PAT = hero start (offset from the map's
  // hero spawn), PJC = JC with the lead chaser at an offset from the hero start, PSP = 'cover' (inside the crater) + 'hide' (+ 'aim' for
  // the Force Staff route) as offsets from the hero start. PFS = cover -> 'aim' (face the exit) -> Force Staff -> hide
  const PAT = (dx, dy) => ({ dx, dy });
  const PJC = (n, dx, dy, ex) => [U({ dx, dy }, Object.assign({ mot: 'chase', hp: 1 }, (ex || [])[0])),
    U({ of: 0, side: 220 }, Object.assign({ mot: 'chase', hp: 1 }, (ex || [])[1])), U({ of: 0, side: -220 }, Object.assign({ mot: 'chase', hp: 1, minDf: 'common' }, (ex || [])[2]))].slice(0, n);
  const PSP = (cv, hd, aim) => Object.assign({ cover: { dx: cv[0], dy: cv[1] }, hide: { dx: hd[0], dy: hd[1] } }, aim ? { aim: { dx: aim[0], dy: aim[1] } } : {});
  const PFS = [{ a: 'move', at: 'spot:cover' }, { a: 'move', at: 'spot:aim', r: 40 }, { a: 'forcestaff', at: 'self' }, { a: 'move', at: 'spot:hide' }];

  const V5 = [
    // ---------------------------------------------------------------- level 1: one target, one idea
    V('sleepy_target', 1, 'lotus_rad', ['basics', 'burst'], 8, { lvl: 8 },
      [U(SEEN([650, 900]), { hp: 0.4, mot: 'still', aware: 0 })], KILL, ['time'],
      [{ a: 'sunstrike', at: 'd0' }], { rand: { pick: 3, jit: 140 } }),
    V('cold_start', 1, 'roshan_pit_top',['basics', 'movement'], 14, { lvl: 7 },
      [U(SEEN([950, 1250]), { hp: 0.5, mot: 'still', aware: 0 })], KILL, ['time'],
      [{ a: 'coldsnap', at: 'd0' }, { a: 'forgespirit', at: 'self' }, { a: 'attack', at: 'd0' }], { rand: { pick: 3, jit: 160 } }),
    V('spirit_pack', 1, 'rad_off_t1', ['basics', 'burst'], 14, { lvl: 8 },
      [U(SEEN([500, 750]), { hp: 0.5, mot: 'still', aware: 0 })], KILL, ['time'],
      [{ a: 'forgespirit', at: 'self' }, { a: 'alacrity', at: 'self' }, { a: 'attack', at: 'd0' }], { rand: { pick: 3, jit: 120 } }),
    // ---------------------------------------------------------------- level 2
    V('river_rune', 2, 'river_top', ['river', 'basics'], 10,
      { lvl: 9, at: W(['river'], { d: [0, 2500], has: { where: ['river', 'level', 'seen'], d: [500, 700] } }) },
      [U(W(['river', 'level', 'seen'], { d: [500, 700] }), { hp: 0.36, mot: 'still', aware: 0.2 })],
      { type: 'kill_with', how: { ability: ['chaosmeteor'] } }, ['method', 'time'], [{ a: 'chaosmeteor', at: 'd0' }], { rand: { pick: 3, jit: 100 } }),
    // ---------------------------------------------------------------- level 3
    V('two_birds', 3, 'dire_triangle', ['multi', 'burst'], 10, { lvl: 10 },
      [U(SEEN([820, 1100], { clear: 3 }), { hp: 0.35, mot: 'still', aware: 0.2 }), U({ of: 0, side: 120 }, { hp: 0.35, mot: 'still', aware: 0.2 })],
      { type: 'killN', n: 2, one: true }, ['method', 'time'], [{ a: 'sunstrike', at: 'mid' }], { rand: { pick: 3, jit: 120 } }),
    V('river_guard', 3, 'mid_river', ['river', 'multi', 'reaction'], 12, { lvl: 12 },
      [U(W([], { beyond: 'gate', d: [1500, 2200] }), { hp: 0.35, mot: 'march' }), U({ of: 0, side: 340 }, { hp: 0.35, mot: 'march' })],
      KILL, ['cross', 'time'], [{ a: 'sunstrike', at: 'lead', w: 0.3 }, { a: 'move', at: 'gate' }, { a: 'deafeningblast', at: 'd1', near: 1000 }],
      { gate: W(['river'], { d: [500, 1000], r: 260 }), rand: { jit: 120 }, vary: { posJit: 0 } }),
    // ---------------------------------------------------------------- level 4
    V('uphill_snipe', 4, 'river_top', ['highground', 'vision'], 10,
      { lvl: 10, at: W(['lowground'], { d: [0, 3000], has: { where: ['high', 'hidden'], d: [500, 800] } }) },
      [U(W(['high', 'hidden'], { d: [500, 800] }), { hp: 0.42, mot: 'still', aware: 0.3 })],
      { type: 'kill', how: { low: true } }, ['method', 'time'], [{ a: 'sunstrike', at: 'd0' }], { rand: { pick: 2, jit: 90 } }),
    V('sun_flee', 4, 'river_bot', ['river', 'prediction'], 8,
      { lvl: 10, at: W(['river'], { d: [0, 3000], has: { where: ['river', 'seen'], d: [500, 700] } }) },
      [U(W(['river', 'seen'], { d: [500, 700] }), { hp: 0.38, mot: 'flee' })],
      { type: 'kill_with', how: { ability: ['sunstrike'] } }, ['method', 'escaped', 'time'], [{ a: 'sunstrike', at: 'lead', w: 1 }]),
    // new in the hold / escape set (BAD-7): survive the clock instead of killing
    V('bridge_hold', 4, 'mid_river', ['river', 'multi', 'hold'], 12, { lvl: 14 },
      [U(W([], { beyond: 'gate', d: [1900, 2400] }), { hp: 0.35, mot: 'march' }), U({ of: 0, side: 300 }, { hp: 0.35, mot: 'march' })],
      { type: 'hold', time: 14 }, ['cross', 'died'], [{ a: 'sunstrike', at: 'lead', w: 0.3 }, { a: 'move', at: 'gate' }, { a: 'deafeningblast', at: 'd1', near: 1000 }],
      { gate: W(['river'], { d: [500, 1000], r: 260 }), rand: { jit: 100 } }),
    // ---------------------------------------------------------------- level 5
    V('blast_push', 5, 'rad_triangle', ['multi', 'positioning'], 8, { lvl: 14 },
      [U(SEEN([550, 700], { clear: 3 }), { hp: 1, mot: 'still' }), U({ of: 0, side: -120, ahead: 60 }, { hp: 1, mot: 'still' }), U({ of: 0, side: 120, ahead: -40 }, { hp: 1, mot: 'still' })],
      { type: 'push', n: 2 }, ['time'], [{ a: 'deafeningblast', at: 'mid' }], { rand: { pick: 3 } }),
    V('tower_dive', 5, 'dire_mid_t1', ['towers', 'blink'], 14,
      { lvl: 16, items: ['blink'], at: { tower: { team: 1 }, ahead: -900 } },
      [U({ tower: { team: 1 }, ahead: 300, side: 60 }, { hp: 0.45, mot: 'still', aware: 0.3 })], KILL, ['died', 'time'],
      [{ a: 'blink', at: 'd0' }, { a: 'chaosmeteor', at: 'd0' }, { a: 'deafeningblast', at: 'd0', w: 0.6 }]),
    // v6 item 17: a gotcha. The foe waits on the bank of Roshan's crater (Ranked.pitRegion: the walled pocket, not the zone box), 450-600 u
    // from its deepest point; hurt, or seeing the hero within 500 u, it jukes INTO the pit after its reaction time (IT.Units tickJuke:
    // Blink onto the point, else Force Staff toward it -- Blink is locked for 3 s after damage). The kill only counts inside the pit
    // (obj.how.inside, method fail 'outside'). focus: what the intro camera tour shows.
    V('pit_trap', 5, 'roshan_pit', ['pit', 'burst', 'items'], 14,
      { lvl: 16, at: W([], { d: [0, 3000], has: { where: ['inpit'], d: [1100, 1500] } }) },
      [U({ pit: 'bank', d: [450, 600] }, { hp: 0.5, behavior: 'stationary', aware: 0.5, items: ['blink', 'forcestaff'], juke: 'pit', near: 500 })],
      { type: 'kill', how: { inside: 'pit' } }, ['method', 'time'],
      [{ a: 'coldsnap', at: 'd0' }, { a: 'move', at: 'd0' }, { a: 'chaosmeteor', at: 'd0', w: 1.2 }, { a: 'deafeningblast', at: 'd0', w: 0.4 }], { focus: ['pit'], rand: { pick: 3 }, vary: { posJit: [40, 80] } }),
    V('ghost_slip', 5, 'rad_ancients', ['escape', 'invisible', 'basics'], 12, { lvl: 12 },
      [U(SEEN([600, 750]), { mot: 'chase', hp: 1, aware: 1, msMul: 1.15 }), U({ of: 0, side: 260 }, { mot: 'chase', hp: 1, aware: 1, msMul: 1.15 })],
      { type: 'escape', time: 12, caught: 180, bump: 80 }, ['caught', 'died'], [{ a: 'ghostwalk', at: 'self' }, { a: 'move', at: 'self' }], { rand: { pick: 3, jit: 120 } }),
    // ---------------------------------------------------------------- level 6
    V('force_chase', 6, 'dire_safe_t1', ['movement', 'escape', 'items'], 14, { lvl: 14, items: ['forcestaff'] },
      [U(SEEN([900, 1100], { not: ['dtower'] }), { hp: 0.42, behavior: 'escape', aware: 1 })], KILL, ['escaped', 'time'],
      [{ a: 'forcestaff', at: 'self' }, { a: 'tornado', at: 'd0' }, { a: 'sunstrike', at: 'd0', w: 0.4 }]),
    V('ghost_finish', 6, 'lotus_dire', ['invisible', 'awareness'], 22, { lvl: 12 },
      [U(SEEN([600, 800]), { hp: 0.4, mot: 'still', aware: 0.3 })],
      { type: 'kill', how: { by: 'spirit', inv: true } }, ['method', 'time'],
      [{ a: 'forgespirit', at: 'self' }, { a: 'ghostwalk', at: 'self' }, { a: 'move', at: 'd0' }]),
    // v6 Dust: exactly one of the two hunters (unit 0, its HUD card shows the item) carries Dust of Appearance (one charge). It dusts the
    // spot where it lost you, after its reaction time and a "Dust!" telegraph (IT.Units.useDust); lift it first, then vanish and keep walking.
    V('dust_escape', 6, 'lotus_dire', ['escape', 'invisible', 'items'], 12, { lvl: 14 },
      [U(SEEN([750, 950]), { mot: 'chase', hp: 1, items: ['dust'] }), U({ of: 0, side: 260 }, { mot: 'chase', hp: 1 })],
      { type: 'escape', time: 12 }, ['caught', 'died'], [{ a: 'tornado', at: 'd0' }, { a: 'ghostwalk', at: 'self' }, { a: 'move', at: 'self' }], { rand: { pick: 3, jit: 100 } }),
    // tower_siege timer (v6, Ranked.towerMath; tests/ceo_v6_core.test.js recomputes it): tower 1000 hp (gate x0.5 hero / x0.6 spirit, armor 12),
    // walk 0.75 s; auto-attacks only: tAttack = 24.29 s (24.59 at bambam); Meteor Hammer (KV 90 + 50 x 6 s = 390 vs buildings) + plain
    // attacks: tHammer = 17.11 s (17.30); Forge + Alacrity + Hammer (2 s channel): tCombo = 7.94 s (8.35).
    // limit 14 s: tCombo x 1.25 = 9.9 (10.4) <= 14 < tHammer < tAttack, at every tier -- the full combo is required.
    V('tower_siege', 6, 'dire_off_t1', ['towers', 'items'], 10,
      { lvl: 25, items: ['meteorhammer'], at: { tower: { team: 1 }, ahead: -950 } },
      [], { type: 'destroyTower' }, ['died', 'time'],
      [{ a: 'forgespirit', at: 'self' }, { a: 'alacrity', at: 'self' }, { a: 'meteorhammer', at: 'tower' }, { a: 'attack', at: 'tower' }], { towerHp: 1000, limit: 14 }),
    // ---------------------------------------------------------------- level 7
    V('fog_ambush', 7, 'outpost_rad', ['vision', 'awareness', 'fog'], 10, { lvl: 12 },
      [U(SEEN([1000, 1300]), { hp: 0.45, mot: 'still', aware: 0.15 })], KILL, ['seen', 'time'],
      [{ a: 'tornado', at: 'd0' }, { a: 'sunstrike', at: 'd0', w: 1 }], { rand: { pick: 3 } }),
    V('bkb_bait', 7, 'outpost_dire', ['reaction', 'items'], 20, { lvl: 18 },
      [U(SEEN([650, 900], { not: ['dtower'] }), { hp: 0.5, behavior: 'defend', items: ['bkb'], useBkb: true, aware: 1 })], KILL, ['died', 'time'],
      [{ a: 'coldsnap', at: 'd0' }, { a: 'tornado', at: 'd0', w: 6 }, { a: 'sunstrike', at: 'd0', w: 0.3 }, { a: 'chaosmeteor', at: 'd0', w: 0.3 }]),
    V('dust_hunt', 7, 'lotus_rad', ['invisible', 'escape', 'items'], 14, { lvl: 16, items: ['dust'] },
      [U(SEEN([700, 900]), { hp: 0.4, behavior: 'escape', items: ['shadowblade'], aware: 1 })], KILL, ['escaped', 'time'],
      [{ a: 'coldsnap', at: 'd0' }, { a: 'dust', at: 'self', w: 1.4 }, { a: 'sunstrike', at: 'd0', w: 1.2 }], { vary: { hp: [-0.08, 0] } }),
    V('jungle_hold', 7, 'dire_triangle', ['multi', 'hold', 'positioning'], 16, { lvl: 20 },
      [U(W([], { beyond: 'gate', d: [2500, 3000] }), { hp: 0.3, mot: 'march' }), U({ of: 0, side: 240 }, { hp: 0.3, mot: 'march' }), U({ of: 0, side: -240 }, { hp: 0.3, mot: 'march' })],
      { type: 'hold', time: 20 }, ['cross', 'died'],
      [{ a: 'move', at: 'gate' }, { a: 'chaosmeteor', at: 'mid', near: 1000 }, { a: 'deafeningblast', at: 'mid', near: 800 }, { a: 'sunstrike', at: 'd0' }],
      { gate: W(['open'], { d: [500, 1000], r: 300 }), rand: { jit: 100 } }),
    // ---------------------------------------------------------------- level 8
    V('river_guard_2', 8, 'gate_bot', ['river', 'multi', 'reaction', 'items'], 14, { lvl: 22 },
      [U(W([], { beyond: 'gate', d: [1900, 2400] }), { hp: 0.33, mot: 'march' }), U({ of: 0, side: -220 }, { hp: 0.33, mot: 'march' }),
        U({ of: 0, side: 220 }, { hp: 0.33, mot: 'march', items: ['bkb'], useBkb: true })],
      KILL, ['cross', 'time'],
      [{ a: 'move', at: 'gate' }, { a: 'tornado', at: 'mid', near: 1800 }, { a: 'sunstrike', at: 'lead' }, { a: 'chaosmeteor', at: 'd0' }, { a: 'deafeningblast', at: 'd0' }],
      { gate: W(['river'], { d: [500, 1000], r: 260 }), vary: { posJit: [40, 80], boots: false } }),
    V('cliff_blink', 8, 'dire_ancients', ['highground', 'blink', 'escape'], 12,
      { lvl: 20, items: ['blink'], at: W(['lowground'], { d: [0, 3000], has: { where: ['high'], d: [600, 900] } }) },
      [U(W(['high'], { d: [600, 900] }), { hp: 0.42, behavior: 'escape', aware: 0.6 })], KILL, ['escaped', 'time'],
      [{ a: 'blink', at: 'd0' }, { a: 'tornado', at: 'd0' }, { a: 'sunstrike', at: 'd0', w: 0.5 }]),
    V('highground_hold', 8, 'rad_highground', ['highground', 'multi', 'towers'], 16,
      { lvl: 24, at: W(['highground'], { d: [0, 1500], has: { where: ['low'], d: [1100, 1700] } }) },
      [U(W(['low'], { d: [1100, 1700] }), { hp: 0.35, mot: 'march' }), U({ of: 0, side: 200 }, { hp: 0.35, mot: 'march' }), U({ of: 0, side: -200 }, { hp: 0.35, mot: 'march' })],
      KILL, ['cross', 'time'],
      [{ a: 'chaosmeteor', at: 'mid' }, { a: 'deafeningblast', at: 'mid', w: 0.4 }, { a: 'tornado', at: 'd0', w: 1.2 }, { a: 'sunstrike', at: 'd0' }],
      { gate: { struct: { kind: 'barracks', team: 0 }, r: 300 }, vary: { boots: false } }),   // item 40: booted marchers beat the line
    // ---------------------------------------------------------------- level 9
    V('triple_kill', 9, 'outpost_dire', ['multi', 'burst'], 8, { lvl: 30, scepter: 'exort' },
      [U(SEEN([500, 700], { clear: 3, not: ['dtower'] }), { hp: 0.4, mot: 'still', aware: 0.3 }), U({ of: 0, side: 180 }, { hp: 0.4, mot: 'still', aware: 0.3 }), U({ of: 0, ahead: 200 }, { hp: 0.4, mot: 'still', aware: 0.3 })],
      { type: 'killN', n: 3, one: true, span: 1.2 }, ['method', 'time'], [{ a: 'sunstrike', at: 'self' }], { rand: { pick: 3 }, vary: { posJit: 0 } }),   // item 40: one Sun Strike must catch all three (still foes), no extra start jitter
    V('blast_push_3', 9, 'dire_off_t1', ['multi', 'positioning'], 10, { lvl: 30 },
      [U(SEEN([500, 650], { clear: 3, not: ['dtower'] }), { hp: 1, mot: 'still' }), U({ of: 0, ahead: 170, side: 40 }, { hp: 1, mot: 'still' }), U({ of: 0, ahead: 340, side: -30 }, { hp: 1, mot: 'still' })],
      { type: 'push', n: 3 }, ['time'], [{ a: 'deafeningblast', at: 'd0' }], { rand: { pick: 3 } }),
    V('tower_tornado', 9, 'gate_top', ['towers', 'combo'], 10, { lvl: 30, at: { tower: { team: 1 }, ahead: -1250 } },
      [U({ tower: { team: 1 }, ahead: -200, side: 120 }, { hp: 0.47, mot: 'still', aware: 0.3 })], KILL, ['tower', 'time'],
      [{ a: 'tornado', at: 'd0' }, { a: 'sunstrike', at: 'd0', w: 1.2 }]),
    V('plateau_escape', 9, 'dire_highground', ['highground', 'escape', 'invisible'], 14,
      { lvl: 30, at: W(['highground'], { d: [0, 3500], not: ['dtower'], has: { where: ['low'], d: [800, 1200] } }) },
      [U(W(['low'], { d: [800, 1200] }), { mot: 'chase', hp: 1, items: ['dust'] }), U({ of: 0, side: 250 }, { mot: 'chase', hp: 1 }), U({ of: 0, side: -250 }, { mot: 'chase', hp: 1 })],
      { type: 'escape', time: 14 }, ['caught', 'died'], [{ a: 'tornado', at: 'd0' }, { a: 'ghostwalk', at: 'self' }, { a: 'move', at: 'self' }], { rand: { pick: 3 }, vary: { boots: false } }),   // item 40: a booted chaser cannot be outrun
    // ---------------------------------------------------------------- level 10
    V('gauntlet', 10, 'dire_mid_t1', ['towers', 'escape', 'invisible', 'items'], 16,
      { lvl: 30, items: ['blink', 'dust'], at: { tower: { team: 1 }, ahead: -1700 } },
      [U({ tower: { team: 1 }, ahead: -950 }, { hp: 0.45, behavior: 'escape', items: ['shadowblade', 'blink'], aware: 1 })], KILL, ['escaped', 'died', 'time'],
      [{ a: 'coldsnap', at: 'd0' }, { a: 'chaosmeteor', at: 'd0', w: 0.2 }, { a: 'sunstrike', at: 'lead', w: 0.6 }, { a: 'deafeningblast', at: 'd0' }], { vary: { boots: false, posJit: 0 } }),
    V('blink_denial', 10, 'rad_triangle', ['reaction', 'escape', 'items'], 14, { lvl: 30, items: ['atos', 'blink'] },
      [U(SEEN([750, 950]), { hp: 0.5, behavior: 'disable_escape', items: ['blink', 'forcestaff'], aware: 1 })], KILL, ['escaped', 'time'],
      [{ a: 'atos', at: 'd0' }, { a: 'sunstrike', at: 'd0' }, { a: 'chaosmeteor', at: 'd0', w: 0.2 }, { a: 'deafeningblast', at: 'd0', w: 0.6 }], { vary: { posJit: 0 } }),   // item 40: the bot's Atos timing is position sensitive
    V('shadow_strike', 10, 'dire_triangle', ['invisible', 'awareness', 'multi'], 16, { lvl: 30, items: ['blink'] },
      [U(SEEN([1000, 1250], { clear: 2, not: ['dtower'] }), { hp: 0.4, behavior: 'wander', aware: 0.3 }), U({ of: 0, side: 250 }, { hp: 0.4, behavior: 'wander', aware: 0.3 })],
      KILL, ['seen', 'time'],
      [{ a: 'ghostwalk', at: 'self' }, { a: 'move', at: 'd0' }, { a: 'tornado', at: 'mid' }, { a: 'chaosmeteor', at: 'mid' }, { a: 'deafeningblast', at: 'mid', w: 0.8 }]),
    // ---------------------------------------------------------------- v6 item 27: JUKE (lose them in the fog; texts: js/data/i18n/scn.js)
    // Chasers carry a belief (js/sim/belief.js): they run at you while they SEE you, then walk to where they think you went, stand
    // confused there ('?'), then search a widening ring (split at hard+). Every arena below was picked by a search over all maps
    // (strict spots: cover 300-650 u from the start, out of the chasers' sight; hide 500-950 u on from the cover, bent >= 70 deg, far from
    // the chasers) and checked with the scripted bot (cover -> hide) at every tier: tests/juke_v6.test.js. The chasers start 1100-1400 u
    // away and see you; chase speed 380 x tier + boots beats the hero's 325 from common up: running straight loses, juking wins.
    // obj: escape + unseen = win after that many s in a row unseen (time = the limit); escape + burn = the foes must waste that much
    // detection (Dust that finds nothing) first; reach = get into the goal ring at spot obj.spot. noInvis = Ghost Walk is the 'method' fail.
    // Unit extras: gem (Gem of True Sight carrier, 900 u true sight), recatch (hard: Force Staff, bambam: + Blink, used on a reacquire),
    // minDf (that tier and up only: difficulty-scaled packs).
    V('treeline_loop', 4, 'rad_triangle', ['juke', 'fun', 'fog'], 20, { lvl: 8, at: JH(['level'], 4) }, JC(2),
      { type: 'escape', time: 20, unseen: 5, noInvis: true }, JF, JS, JX(JSP(2, ['level'], 2, 2))),
    V('river_fog_crossing', 5, 'mid_river', ['juke', 'fun', 'river'], 14, { lvl: 10, at: JH(['choke'], 1) }, JC(2),
      { type: 'reach', spot: 'hide', noInvis: true }, JF.concat('time'), JS, JX(JSP(2, ['high'], 0, 0, { strict: true, hid: [800, 1400] }))),
    V('highground_bait', 6, 'river_top', ['juke', 'fun', 'highground'], 20, { lvl: 12, at: JH(['open'], 4) }, JC(2),
      { type: 'escape', time: 20, unseen: 7, noInvis: true }, JF, JS, JX(JSP(2, ['high'], 1, 1, { strict: true }))),
    V('ramp_shuffle', 7, 'rad_mid_t1', ['juke', 'fun', 'highground'], 14, { lvl: 14, at: JH(['choke'], 4) }, JC(2),
      { type: 'reach', spot: 'hide', noInvis: true }, JF.concat('time'), JS, JX(JSP(2, ['high'], 0, 0, { strict: true, hid: [800, 1400] }))),
    // night (js/data/daynight.js): enemy sight 800, so the pack starts 620-760 u away; a third chaser from common up
    V('night_juke', 7, 'river_bot', ['juke', 'fun', 'fog'], 20, { lvl: 16, at: JH(['choke'], 0) }, JC(3, [620, 760]),
      { type: 'escape', time: 20, unseen: 6, noInvis: true }, JF, JS, JX(JSP(3, ['level'], 0, 0, { strict: true, far: 900 }))),
    // the Gem carrier sees through Ghost Walk within 900 u: go invisible, then still break its line and distance
    V('ghost_vs_gem', 8, 'lotus_rad', ['juke', 'fun', 'invisible', 'items'], 20, { lvl: 18, at: JH(['choke'], 0) }, JC(2, null, [{ gem: true }]),
      { type: 'escape', time: 20, unseen: 7 }, ['caught', 'died'], [{ a: 'ghostwalk', at: 'self' }].concat(JS), JX(JSP(2, ['high'], 0, 0, { strict: true }))),
    // a Dust carrier: let it dust where it THINKS you are (a hit = caught), then stay unseen 5 s
    V('dust_bait', 9, 'dire_mid_t2', ['juke', 'fun', 'invisible', 'items'], 25, { lvl: 20, at: JH(['level'], 0) }, JC(2, null, [{ items: ['dust'] }]),
      { type: 'escape', time: 25, unseen: 5, burn: 1 }, JF, [JS[0], { a: 'ghostwalk', at: 'self' }, JS[1]], JX(JSP(2, ['level'], 0, 2, { strict: true, hid: [900, 1400] }))),
    V('no_invis_juke', 10, 'rad_off_t1', ['juke', 'fun'], 20, { lvl: 24, at: JH(['choke'], 0) }, JC(3, null, [{ recatch: true }, { recatch: true }]),
      { type: 'escape', time: 20, unseen: 6, noInvis: true }, JF, JS, JX(JSP(3, ['level'], 0, 0, { strict: true }))),
    // ---------------------------------------------------------------- v6 item 55: PIT jukes (Roshan's pit vision rule, js/sim/vision.js)
    // Outside the crater nobody sees in; inside, nobody sees out; the mouth ring is seen from both sides (map.pitAt). Explicit arenas
    // (PAT / PJC / PSP, see above), same juke contract as above (fixed arenas, spot bot cover -> hide: tests/juke_v6.test.js + tests/pit_v6.test.js).
    // night: duck into the crater (they lose you), out past the mouth and around the wall while they walk in after you
    V('pit_in_out', 5, 'roshan_pit_top', ['juke', 'fun', 'pit', 'fog'], 20, { lvl: 10, at: PAT(-960, 576) }, PJC(2, 624, 96),
      { type: 'escape', time: 20, unseen: 5, noInvis: true }, JF, JS, JX(PSP([-528, -480], [-96, -1344]))),
    // walk in, wait for them to follow, then Force Staff out past the mouth: inside the crater they cannot see you leave
    V('pit_force_exit', 6, 'roshan_pit', ['juke', 'fun', 'pit', 'items'], 20, { lvl: 12, items: ['forcestaff'], at: PAT(1392, -240) }, PJC(2, 288, 240),
      { type: 'escape', time: 20, unseen: 5, noInvis: true }, JF, PFS, JX(PSP([144, 0], [-384, 480], [0, -48]))),
    // a Dust carrier outside: Ghost Walk inside the crater; even a dusted hero stays unseen from outside
    V('pit_ghost', 7, 'roshan_pit_top', ['juke', 'fun', 'pit', 'invisible', 'items'], 20, { lvl: 14, at: PAT(-288, 624) }, PJC(2, -1296, 480, [{ items: ['dust'] }]),
      { type: 'escape', time: 20, unseen: 6 }, JF, [{ a: 'ghostwalk', at: 'self' }].concat(JS), JX(PSP([-912, -480], [-1152, -624]))),
    // not a juke (a kill): the foe waits in the crater and must leave by the mouth to reach its gate. Unseen in the pit, it shows on the
    // mouth: read the exit and Sun Strike it on the way out
    V('pit_mouth_snipe', 6, 'roshan_pit_top', ['pit', 'fun', 'prediction', 'fog'], 12, { lvl: 12, at: PAT(-432, 528) },
      [U({ dx: -864, dy: -480 }, { hp: 0.38, mot: 'march' })],
      { type: 'kill_with', how: { ability: ['sunstrike'] } }, ['method', 'cross', 'time'], [{ a: 'sunstrike', at: 'lead', near: 800 }],
      { gate: { dx: -720, dy: 768, r: 260 }, focus: ['pit'], rand: { pick: 1 }, vary: { posJit: 0 } }),
    // ---------------------------------------------------------------- v6 item 29: EDGE (the minimap's four border strips; texts: js/data/i18n/scn.js)
    // Arena tags (js/data/maps.js): edge = within 1900 u of the world border, edgeN / edgeS / edgeW / edgeE = which one, rim = within 900 u of
    // this map window's own border. The border cuts off one direction: a foe pinned against it, a fleeing foe running out of lane, a hold
    // line with the wall at your back, an ambush out of the dark corner. N: edge_gank; W: offlane_survival;
    // E: pinned_escape; S: long_lane_snipe, river_mouth_ambush. The tour (focus) shows the border area; every spot is inside the map.
    V('edge_gank', 7, 'dire_safe_t1', ['edge', 'fun', 'blink', 'burst', 'fog'], 14,
      { lvl: 20, items: ['blink'], at: W(['edgeN', 'rimN', 'level'], { d: [0, 5000], not: ['river'], has: { where: ['edgeN', 'rimN', 'level', 'hidden'], d: [900, 1150], not: ['dtower'] } }) },
      [U(W(['edgeN', 'rimN', 'level', 'hidden'], { d: [900, 1150], not: ['dtower'] }), { hp: 0.42, mot: 'still', aware: 0.2 })], KILL, ['died', 'time'],
      [{ a: 'blink', at: 'd0' }, { a: 'chaosmeteor', at: 'd0' }, { a: 'deafeningblast', at: 'd0', w: 0.6 }], { rand: { pick: 3 } }),
    V('long_lane_snipe', 5, 'rad_safe_t1', ['edge', 'fun', 'prediction', 'vision'], 8,
      { lvl: 12, at: W(['edgeS', 'rimS', 'level'], { d: [0, 5000], not: ['river'], has: { where: ['edgeS', 'rimS', 'level', 'seen'], d: [600, 900] } }) },
      [U(W(['edgeS', 'rimS', 'level', 'seen'], { d: [600, 900] }), { hp: 0.34, mot: 'flee' })],
      { type: 'kill_with', how: { ability: ['sunstrike'] } }, ['method', 'escaped', 'time'], [{ a: 'sunstrike', at: 'lead', w: 1 }], { rand: { pick: 2 } }),
    V('river_mouth_ambush', 6, 'gate_bot', ['edge', 'fun', 'river', 'fog', 'vision', 'awareness'], 10,
      { lvl: 14, at: W(['edgeS'], { d: [0, 5000], not: ['river'], has: { where: ['edgeS', 'river', 'rimS', 'seen'], d: [1000, 1300] } }) },
      [U(W(['edgeS', 'river', 'rimS', 'seen'], { d: [1000, 1300] }), { hp: 0.45, mot: 'still', aware: 0.15 })], KILL, ['seen', 'time'],
      [{ a: 'tornado', at: 'd0' }, { a: 'sunstrike', at: 'd0', w: 1 }], { rand: { pick: 3 } }),
    V('offlane_survival', 6, 'rad_off_t1', ['edge', 'fun', 'multi', 'hold', 'positioning'], 16,
      { lvl: 16, at: W(['edgeW', 'rimW'], { d: [0, 6000] }) },
      [U(W([], { beyond: 'gate', d: [1900, 2400] }), { hp: 0.38, mot: 'march' }), U({ of: 0, side: 300 }, { hp: 0.38, mot: 'march' })],
      { type: 'hold', time: 16 }, ['cross', 'died'], [{ a: 'sunstrike', at: 'lead', w: 0.3 }, { a: 'move', at: 'gate' }, { a: 'deafeningblast', at: 'd1', near: 1000 }],
      { gate: W(['level'], { d: [500, 1000], r: 280 }), rand: { jit: 100 } }),
    V('pinned_escape', 5, 'dire_off_t1', ['edge', 'fun', 'escape', 'invisible', 'reaction'], 12,
      { lvl: 12, at: W(['edgeE', 'rimE'], { d: [0, 6000], not: ['rimS', 'rimN'] }) },
      [U(W([], { d: [600, 800], not: ['rimE'] }), { mot: 'chase', hp: 1, aware: 1, msMul: 1.15 }), U({ of: 0, side: 260 }, { mot: 'chase', hp: 1, aware: 1, msMul: 1.15 })],
      { type: 'escape', time: 12, caught: 180, bump: 80 }, ['caught', 'died'], [{ a: 'tornado', at: 'd0' }, { a: 'ghostwalk', at: 'self' }, { a: 'move', at: 'self' }], { rand: { pick: 3, jit: 120 } }),
    // ---------------------------------------------------------------- v6 #52: early mid lane (hero lvl 5-8). blinker = an innate blink (Queen of Pain /
    // Anti-Mage style, js/sim/units.js startBlink: NOT the dagger, it works while damaged): hurt -> after its reaction it turns, winds up the
    // tier cast point (exec.blinkCast, telegraphed: fx blinkWindup + item sound + 'channel') and blinks ENEMY.blink.range away toward its
    // tower. A stun / Cold Snap freeze / hex / silence in the wind-up cancels it and every freeze denies blinking for ENEMY.blink.deny s.
    // Counterplay: snipe the landing spot, or freeze it before it blinks (Cold Snap procs), or Tornado -> Cold Snap on landing -> Sun Strike.
    // farm_then_tp = farms, sees you -> Town Portal (GAME.TP.dur channel): any disable cancels it (then it runs for its tower).
    V('meteor_lane_kill', 5, 'rad_mid_t1', ['fun', 'midlane', 'blink', 'reaction'], 12, { lvl: 6 },
      [U(SEEN([650, 850], { not: ['dtower'] }), { hp: 0.42, intent: 'farm_then_tp', aware: 0.6 })], KILL, ['escaped', 'time'],
      [{ a: 'coldsnap', at: 'd0' }, { a: 'chaosmeteor', at: 'd0' }], { rand: { pick: 3 } }),
    V('qop_blink_snipe', 6, 'dire_mid_t1', ['fun', 'midlane', 'blink', 'prediction'], 12, { lvl: 6 },
      [U(SEEN([600, 800]), { hp: 0.4, blinker: true, aware: 0.6 })],
      { type: 'kill_with', how: { ability: ['sunstrike'] } }, ['method', 'time'],
      [{ a: 'deafeningblast', at: 'd0' }, { a: 'sunstrike', at: 'd0', w: 0.3 }], { rand: { pick: 3 } }),
    V('am_coldsnap_deny', 7, 'mid_river', ['fun', 'midlane', 'blink', 'combo'], 12, { lvl: 7 },
      [U(SEEN([600, 800]), { hp: 0.42, blinker: true, aware: 0.6, intent: { kind: 'idle_guard', phases: [{ on: 'spellLanded', then: 'flee_to_tower' }] } })],
      KILL, ['escaped', 'time'], [{ a: 'coldsnap', at: 'd0' }, { a: 'sunstrike', at: 'd0' }], { rand: { pick: 3 } }),
    V('blinker_tornado', 8, 'rad_mid_t1', ['fun', 'midlane', 'blink', 'combo'], 14, { lvl: 8 },
      [U(SEEN([650, 850], { not: ['dtower'] }), { hp: 0.48, blinker: true, aware: 0.6 })],
      KILL, ['time'],
      [{ a: 'tornado', at: 'd0' }, { a: 'coldsnap', at: 'd0' }, { a: 'sunstrike', at: 'd0' }], { rand: { pick: 3 } }),
    // ---------------------------------------------------------------- v6 item 28: FUN set (docs/SCENARIO-RESEARCH.md; texts + scn.<id>.tip, the real
    // Dota situation: js/data/i18n/scn.js). Mechanics (js/sim/units.js, ranked.js funExtras): unit tpPlan = a planned Town Portal (GAME.TP.dur s
    // channel; stun / hex / lift / knockback cancel it, silence does not; finished = 'escaped'); sc.pickups + unit grab = a rune / Aegis race
    // (obj pickup, fail 'taken'); sc.ally = a friendly hero the foe hits (intent attack_ally, fail 'allyDied'); sc.roshan (scriptHits = he falls
    // on that many enemy hits, then the Aegis drops; ttl = he falls anyway); allyTowerHp / allyTowerBusy = our tower under attack (fail
    // 'towerLost'); obj.how.channel 'tp' (killed mid-TP) / obj.how.openInv (the first spell came out of Ghost Walk); unit attack 'melee'.
    // Bot-only step fields (tests/fun_v6.test.js): wait 'tp' | 'pickup', at 'pickup' | 'land' (Ice Wall where the lifted foe drops), untilEl
    // (s of play), r (move radius). funBot = the generic scripted sweeps skip it (tests/fun_v6.test.js runs its own bot).
    V('tp_snipe', 5, 'rad_safe_t1', ['fun', 'prediction', 'reaction'], 8, { lvl: 12 },
      [U(SEEN([550, 750]), { hp: 0.38, mot: 'flee', tpPlan: { after: 1.2 } })],
      { type: 'kill_with', how: { ability: ['sunstrike'], channel: 'tp' } }, ['method', 'escaped', 'time'],
      [{ a: 'sunstrike', at: 'd0', wait: 'tp' }], { rand: { pick: 3 }, funBot: true }),
    V('tornado_tp_cancel', 6, 'dire_off_t1', ['fun', 'reaction', 'combo'], 12, { lvl: 14 },
      [U(SEEN([700, 900], { not: ['dtower'] }), { hp: 0.45, intent: 'farm_then_tp', aware: 0.6, tpPlan: { after: 2 } })], KILL, ['escaped', 'time'],
      [{ a: 'tornado', at: 'd0', wait: 'tp' }, { a: 'sunstrike', at: 'd0' }], { rand: { pick: 3 }, funBot: true }),
    V('rune_contest', 3, 'river_top', ['fun', 'river', 'reaction'], 10,
      { lvl: 8, at: W(['river'], { d: [0, 3000], i: 4, has: { where: ['river'], d: [1700, 1900] } }) },
      [U(W(['river'], { d: [1700, 1900] }), { hp: 0.6, aware: 0.3, grab: { kinds: ['rune'] } })],
      { type: 'pickup', kind: 'rune' }, ['taken', 'time'],
      [{ a: 'move', at: 'spot:rune', r: 9999 }, { a: 'tornado', at: 'd0', untilEl: 2.6 }, { a: 'move', at: 'pickup', wait: 'pickup', r: 30 }],
      { spots: { rune: { of: 0, side: 450 } }, pickups: [{ kind: 'rune', at: 'rune', t: 4 }], focus: ['spot:rune'],
        rand: { pick: 1 }, vary: { posJit: 0 }, funBot: true }),   // fixed arena (i 4): a plain run loses the race at every tier, a Tornado wins it
    V('pit_fight_blast', 7, 'roshan_pit', ['fun', 'pit', 'multi', 'burst'], 12, { lvl: 16, at: { pit: 'deep', dx: -1050, dy: 110 } },
      [U({ pit: 'deep', dx: -170, dy: 110 }, { hp: 0.4, mot: 'still', aware: 0.3 }), U({ pit: 'deep', dx: -20, dy: 110 }, { hp: 0.4, mot: 'still', aware: 0.3 })],
      { type: 'killN', n: 2, how: { ability: ['chaosmeteor', 'deafeningblast'] } }, ['method', 'time'],
      [{ a: 'chaosmeteor', at: 'mid' }, { a: 'deafeningblast', at: 'mid', w: 0.4 }], { focus: ['pit'], vary: { posJit: [0, 40] }, funBot: true }),
    V('bkb_tower_hitter', 6, 'rad_safe_t1', ['fun', 'towers', 'items'], 8, { lvl: 13, at: { tower: { team: 0 }, ahead: -750, side: 150 } },
      [U({ tower: { team: 0 }, ahead: 160 }, { hp: 0.5, intent: { kind: 'attack_ally', target: 'tower' }, attack: 'melee', items: ['bkb'], bkbOn: true, aware: 0.5 })],
      { type: 'kill_with', how: { ability: ['sunstrike'] } }, ['method', 'towerLost', 'time'], [{ a: 'sunstrike', at: 'd0' }],
      { allyTowerHp: 120, allyTowerBusy: true, focus: ['ourTower'], vary: { posJit: 0 }, funBot: true }),
    V('ghost_ambush', 7, 'rad_off_t1', ['fun', 'invisible', 'towers', 'awareness'], 14, { lvl: 15, at: { tower: { team: 0 }, ahead: -1300, side: 200 } },
      [U({ tower: { team: 0 }, ahead: 160 }, { hp: 0.45, intent: { kind: 'attack_ally', target: 'tower' }, attack: 'melee', aware: 0.15 })],
      { type: 'kill', how: { openInv: true } }, ['seen', 'method', 'time'],
      [{ a: 'ghostwalk', at: 'self' }, { a: 'move', at: 'd0', r: 550 }, { a: 'chaosmeteor', at: 'd0' }, { a: 'deafeningblast', at: 'd0', w: 0.3 }],
      { allyTowerBusy: true, focus: ['ourTower'], vary: { posJit: 0 }, funBot: true }),
    V('emp_tornado_trap', 5, 'outpost_rad', ['fun', 'combo', 'prediction'], 12, { lvl: 11, style: 'qw' },
      [U(SEEN([650, 850], { not: ['dtower'] }), { hp: 0.45, aware: 0.4 })],
      { type: 'kill_with', how: { ability: ['emp', 'tornado'] } }, ['method', 'time'],
      [{ a: 'tornado', at: 'd0' }, { a: 'emp', at: 'land' }], { rand: { pick: 3 }, funBot: true }),   // EMP (2.9 s) under the lifted foe outlasts the lift (<= 2.2 s at lvl 12): it lands in the field
    V('tornado_icewall_landing', 6, 'rad_triangle', ['fun', 'combo', 'positioning'], 12, { lvl: 12 },
      [U(SEEN([600, 800], { not: ['dtower'] }), { hp: 0.45, behavior: 'escape', aware: 0.6 })], KILL, ['escaped', 'time'],
      [{ a: 'tornado', at: 'd0' }, { a: 'icewall', at: 'land' }, { a: 'chaosmeteor', at: 'd0' }], { rand: { pick: 3 }, funBot: true }),
    V('smoke_gank_escape', 8, 'lotus_dire', ['fun', 'escape', 'invisible', 'fog'], 12, { lvl: 17, at: W(['level'], { d: [0, 4000], not: ['river'] }) },
      [U(W(['level'], { d: [700, 900] }), { mot: 'chase', hp: 1, aware: 1 }), U({ of: 0, side: 240 }, { mot: 'chase', hp: 1, aware: 1 }), U({ of: 0, side: -240 }, { mot: 'chase', hp: 1, aware: 1 })],
      { type: 'escape', time: 12, caught: 180, bump: 80 }, ['caught', 'died'], [{ a: 'tornado', at: 'd0' }, { a: 'ghostwalk', at: 'self' }, { a: 'move', at: 'self' }],
      { rand: { pick: 3, jit: 100 }, funBot: true }),
    // fixed arena: the Radiant high ground west of the mid tower; the marchers climb the ramp below the hero (tile 14,52) to the gate on top
    V('icewall_ramp_defense', 8, 'rad_mid_t1', ['fun', 'highground', 'hold', 'multi'], 14, { lvl: 18, at: { dx: -2256, dy: -96 } },
      [U({ dx: 192, dy: 1250 }, { hp: 0.35, mot: 'march' }), U({ of: 0, side: 200 }, { hp: 0.35, mot: 'march' })],
      { type: 'hold', time: 14 }, ['cross', 'died'],
      [{ a: 'icewall', at: 'd0', near: 750 }, { a: 'chaosmeteor', at: 'mid', near: 700 }, { a: 'deafeningblast', at: 'mid', w: 0.4 }],
      { gate: { dx: 0, dy: -190, r: 220 }, focus: ['gate'], vary: { boots: false, posJit: 0 }, funBot: true }),
    V('save_the_ally', 4, 'rad_off_t1', ['fun', 'combo', 'reaction'], 10, { lvl: 10 },
      [U(SEEN([750, 950], { not: ['dtower'] }), { hp: 0.45, intent: 'attack_ally', attack: 'melee', aware: 0.5 })], KILL, ['allyDied', 'time'],
      [{ a: 'tornado', at: 'd0' }, { a: 'sunstrike', at: 'd0' }],
      { ally: [{ at: 'ally', frac: 0.35 }], spots: { ally: { of: 0, ahead: -140 } }, focus: ['spot:ally'], rand: { pick: 3, jit: 100 }, vary: { posJit: 0 }, funBot: true }),
    V('aegis_snatch', 9, 'roshan_pit', ['fun', 'pit', 'reaction'], 10, { lvl: 20, at: { pit: 'deep', dx: -1250, dy: 110 } },
      [U({ pit: 'deep', dx: -330, dy: 110 }, { hp: 0.5, intent: { kind: 'attack_ally', target: 'roshan' }, attack: 'melee', aware: 0.5, grab: { kinds: ['aegis'] } })],
      { type: 'pickup', kind: 'aegis' }, ['taken', 'time'],
      [{ a: 'move', at: 'spot:rosh', r: 450 }, { a: 'tornado', at: 'd0', wait: 'pickup' }, { a: 'move', at: 'pickup', r: 30 }],
      { roshan: { at: 'rosh', frac: 0.05, scriptHits: 2, ttl: 8 }, spots: { rosh: { pit: 'deep', dx: -90, dy: 110 } }, focus: ['pit'], vary: { posJit: 0 }, funBot: true }),
  ];

  // ---- legacy set -> v5 fields: level, map, tags, arena-relative foes (unit 0 by arena, the rest by offset from it; the dx/dy stay as
  //      the fallback on a map without arenas), steps = the solver script. Ids, hp and solver scripts are unchanged.
  const LEG = {
    ghost_escape: [2, 'rad_triangle', ['escape', 'invisible']], gleipnir_cluster: [2, 'lotus_dire', ['items', 'multi']],
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
  // playtest 2: ghost_escape reworked -- a jungle choke start (tree lines to break line of sight), ONE booted chaser (+20% speed) 450-550 u
  // away that already sees you, 12 s to survive, visible contact at 180 u (obj.caught), and a chaser that walks into the invisible hero
  // finds it (obj.bump 80 u): Ghost Walk alone is not enough, walk away / around the trees. No Dust (the slip is the lesson). Night stays.
  {
    const g = LEGACY.find(s => s.id === 'ghost_escape'), u0 = g.units[0];
    g.map = 'rad_triangle';
    g.hero = Object.assign({}, g.hero, { at: W(['choke'], { d: [0, 1400] }) });
    g.units = g.dummies = [Object.assign({}, u0, { where: ['level', 'seen'], d: [450, 550], aware: 1, msMul: 1.2 })];
    g.obj = { type: 'escape', time: 12, caught: 180, bump: 80 }; g.rand = { pick: 3, jit: 80 }; g.vary = { posJit: 0 };   // item 40: the 450-550 u start is the spec
    g.tip = g.flair = L('A booted chaser already sees you. Ghost Walk at once, then keep walking through the trees: if it walks into you, you are found.',
      'Um perseguidor de botas já te vê. Ghost Walk na hora e continue andando pelas árvores: se ele esbarrar em você, te acha.');
    g.goal = g.desc = L('Survive 12 s without being caught', 'Sobreviva 12 s sem ser pego');
  }

  // ---- v5 set: texts from the i18n pack (lazy, so load order does not matter; null until the pack is loaded), HUD aliases tip/goal
  const tr = k => { const I = IT.I18N; if (!I || I.en[k] == null) return null; return { en: I.en[k], pt: I.pt[k] != null ? I.pt[k] : I.en[k] }; };
  const getter = (s, f, k) => Object.defineProperty(s, f, { enumerable: true, configurable: true, get: () => tr(k) });
  for (const s of V5) {
    for (const f of ['name', 'flair', 'desc', 'win', 'lose']) getter(s, f, 'scn.' + s.id + '.' + f);
    // v6 item 28: the HUD tip prefers scn.<id>.tip (the real Dota situation) when the pack has one, else the story line
    Object.defineProperty(s, 'tip', { enumerable: true, configurable: true, get: () => tr('scn.' + s.id + '.tip') || tr('scn.' + s.id + '.flair') });
    getter(s, 'goal', 'scn.' + s.id + '.desc');
    s.dummies = s.units; s.sol = s.steps;
  }
  const all = LEGACY.concat(V5);
  // ---- v6 #50: every foe gets an explicit scenario intent (IT.Intent, js/sim/units.js): the tier scales only how well it is executed
  //      (difficulty.js exec). Kinds: flee_to_tower chase farm_then_tp gank_from_fog hold_highground blink_in kite bait march defend idle_guard;
  //      optional phases [{ on: 'spotted'|'lowHp'|'spellLanded'|'timer:<s>'|'allyHit', then: kind }]. Default from mot / behavior (Intent.of);
  //      INTENTS overrides per scenario (one entry per unit). Audit before -> after: DECISIONS.md "v6 #50".
  const INTENTS = {
    uphill_snipe: ['hold_highground'],   // the high-ground lookout holds its post (was: idle_guard)
    pit_trap: ['bait'], blink_denial: ['bait'],   // they wait for you to commit, then juke / disable-escape
  };
  const autoIntent = u => u.mot === 'chase' ? 'chase' : u.mot === 'flee' ? 'flee_to_tower' : u.mot === 'march' ? 'march' : u.juke ? 'bait'
    : u.behavior === 'escape' ? 'flee_to_tower' : u.behavior === 'disable_escape' ? 'bait' : u.behavior === 'defend' ? 'defend' : 'idle_guard';
  for (const s of all) {
    const ov = INTENTS[s.id] || [];
    (s.units || []).forEach((u, i) => { if (!u.intent) u.intent = ov[i] || autoIntent(u); });
  }
  for (const s of all) s.tier = s.level <= 3 ? 1 : s.level <= 7 ? 2 : 3;
  // ---- v6 boots everywhere: Boots of Travel where the plan needs > ~1200 u of running within par (hold / gate / escape / tower scenarios),
  //      Boots of Speed elsewhere. Max 6 items (no scenario carries more than 2 others).
  const TRAVELS = s => (s.tags || []).indexOf('juke') < 0 && (s.obj.type === 'escape' || s.obj.type === 'hold' || s.obj.type === 'destroyTower' || !!s.gate || (s.tags || []).indexOf('towers') >= 0);   // v6 item 27: juke heroes get plain boots (the chasers must out-run them)
  for (const s of all) {
    const it = (s.hero.items || []).filter(x => x !== 'boots' && x !== 'travels');
    s.hero = Object.assign({}, s.hero, { items: it.concat(TRAVELS(s) ? 'travels' : 'boots').slice(-6) });
  }

  // ---- v6 item 39: reveal = the start reveal (a Sun-Strike-shaped vision circle on each foe unseen at the start) also at hard / bambam.
  //      ian / easy / common always reveal; at hard / bambam only these snipe / prediction scenarios do (Ranked.revealOn).
  const REVEAL = ['sun_flee', 'uphill_snipe', 'sun_snipe', 'fog_ambush', 'blink_fog',
    'treeline_loop', 'river_fog_crossing', 'highground_bait', 'ramp_shuffle', 'night_juke', 'ghost_vs_gem', 'dust_bait', 'no_invis_juke',
    'edge_gank', 'long_lane_snipe', 'river_mouth_ambush', 'offlane_survival', 'pinned_escape',
    'pit_in_out', 'pit_force_exit', 'pit_ghost', 'pit_mouth_snipe',
    'tp_snipe', 'pit_fight_blast', 'ghost_ambush', 'smoke_gank_escape', 'aegis_snatch'];   // + v6 item 27 juke set, v6 item 29 edge set, v6 item 55 pit set, v6 item 28 fun set
  for (const s of all) s.reveal = REVEAL.indexOf(s.id) >= 0;

  IT.SCENARIOS = all.map((s, i) => [s, i]).sort((a, b) => a[0].level - b[0].level || a[1] - b[1]).map(p => p[0]);   // easy -> advanced (stable)
  IT.SCENARIOS.get = id => IT.SCENARIOS.find(s => s.id === id) || null;
})(typeof window !== 'undefined' ? window : globalThis);
