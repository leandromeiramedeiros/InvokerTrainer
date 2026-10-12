// Combo Practice / Ranked scenarios (data only). Owner: S3 (legacy 13) + V4 content (22+ on real maps).
// Legacy: S(id, tier, name, tip, goal, par, hero, dummies, obj, sol) on the Training Grounds; they keep legacy:true and the combo tag.
//   hero    = { lvl, style 'qe'|'qw', items:[ids], scepter:orb, shard:spell }  (orbs/talents come from IT.RULES.autoLoadout)
//   dummies = [{ dx, dy (from hero spawn), hp (start fraction; dies below 0.25), mot 'flee'|'chase'|'still'|undefined (= difficulty behavior), items, useBkb }]
//   obj     = { type:'kill' } kill every dummy | { type:'escape', time } stay uncaught | { type:'rootAll' } all dummies rooted at once
//   sol     = bot script for tests: { a: spell|item id, at: 'd0'|'d1'|'self'|'lead'|'mid', w: seconds to wait first }
// V4: V(id, level 1..10, map, tags, text, par, hero, units, obj, fail, steps, extra) - every scenario has a fixed map.
//   level   = ranked ramp (1 easy .. 10 advanced); tier derives from it (<=3:1, <=7:2, else 3)
//   hero    = { lvl, items, preinvoked, at: spot }   units = [{ spot, type:'enemy', hp, mot, behavior, items, aware, telegraph }]
//   spot    = { x, y } absolute | { where:[tags], d:[min,max] } arena by tag/distance | { tower:{team,i}, ahead, side } | { gate:true, ahead, side } | { of:k, dx, dy }
//   obj     = kill | kill_with {how} | killN {n, one, span} | push {n} | destroyTower | rootAll | escape {time} | hold {time}
//   fail    = ids from: died, cross, seen, method, escaped, caught, time
//   steps   = [{ a, at?, label? }] drives the STEP-BY-STEP HUD (also the bot script)
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const L = (en, pt) => ({ en, pt });
  const S = (id, tier, name, tip, goal, par, hero, dummies, obj, sol, extra) => Object.assign({ id, tier, name, tip, goal, par, hero, dummies, obj, sol }, extra || {});
  const D = (dx, dy, o) => Object.assign({ dx, dy }, o || {});

  // ---- legacy set (Training Grounds, dummies, bot-checked in tests/scenarios.test.js)
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

  // ---- v4 scenarios (data only; engine in js/sim/ranked.js)
  //   V(id, level 1..10, map, tags, text, par, hero, units, obj, fail, steps, extra)
  //   text   = { name, flair (story line, HUD tip), desc (what to do, HUD objective), win, lose }  each { en, pt }
  //   hero   = { lvl, items, preinvoked:[spell,spell], scepter, shard, at:<spot> }       (hero.at: where the hero starts; default the map spawn)
  //   spots  = { dx, dy } | { where:[tags], not:[tags], d:[min,max], i, dx, dy } | { tower:{team,i}, ahead, side } | { gate:true, ahead, side } | { of:unitIndex, dx, dy }
  //   units  = U(spot, { hp (damage-to-kill fraction, see ranked.apply), mot 'still'|'march'|'flee', behavior, items, aware, useBkb })  (all enemy NPC heroes)
  //   obj    = kill | kill_with {how} | killN {n, one} | push {n} | destroyTower | hold {time} | escape {time} | rootAll
  //            how = { ability:[ids], by:'hero'|'spirit', low, high, inv }   (checked on the killing hit)
  //   fail   = subset of time died cross seen escaped method caught     steps = HUD / bot script [{ a, at, w }]
  const tx = (name, flair, desc, win, lose) => ({ name, flair, desc, win, lose });
  const U = (spot, o) => Object.assign({ type: 'enemy' }, spot, o || {});
  const Wh = (where, d, o) => Object.assign({ where, d }, o || {});
  const V = (id, level, map, tags, text, par, hero, units, obj, fail, steps, extra) =>
    Object.assign({ id, level, map, tags }, text, { par, hero, units, obj, fail, steps, sol: steps }, extra || {});

  const V4 = [
    // ---------------------------------------------------------------- level 1
    V('sleepy_target', 1, 'rosh_pit', ['basics', 'burst'],
      tx(L('Sleeping target', 'Alvo adormecido'),
        L('A scout dozed off in the open, far from his friends. Easy pickings.', 'Um batedor cochilou no meio do nada, longe dos amigos. Moleza.'),
        L('Hit the sleeping enemy with Sun Strike', 'Acerte o inimigo adormecido com um Sun Strike'),
        L('The scout goes down', 'O batedor cai'), L('time runs out', 'o tempo acaba')),
      8, { lvl: 25, preinvoked: ['sunstrike'] },
      [U(Wh(['open'], [700, 900]), { hp: 0.4, mot: 'still' })], { type: 'kill' }, ['time'], [{ a: 'sunstrike', at: 'd0' }]),
    V('cold_start', 1, 'rosh_pit', ['basics', 'movement'],
      tx(L('Close the gap', 'Feche a distância'),
        L('He is out of reach and not moving. Walk up, freeze him and finish the job.', 'Ele está longe e parado. Aproxime-se, congele e termine o serviço.'),
        L('Walk into range, Cold Snap, then attack', 'Chegue perto, use Cold Snap e ataque'),
        L('The target is dead', 'O alvo morreu'), L('time runs out', 'o tempo acaba')),
      12, { lvl: 25, preinvoked: ['coldsnap'] },
      [U(Wh(['open'], [1100, 1400], { i: 1 }), { hp: 0.5, mot: 'still' })], { type: 'kill' }, ['time'],
      [{ a: 'move' }, { a: 'coldsnap', at: 'd0' }, { a: 'forgespirit', at: 'self' }, { a: 'attack', at: 'd0' }]),
    V('spirit_pack', 1, 'lotus', ['basics', 'burst'],
      tx(L('Spirit pack', 'Matilha de espíritos'),
        L('Your Forge Spirits hit harder than they look. Let them do the work.', 'Seus Forge Spirits batem mais forte do que parecem. Deixe-os trabalhar.'),
        L('Summon Forge Spirits and kill the enemy', 'Invoque os Forge Spirits e mate o inimigo'),
        L('The enemy is dead', 'O inimigo morreu'), L('time runs out', 'o tempo acaba')),
      14, { lvl: 25, preinvoked: ['forgespirit'] },
      [U(Wh(['open'], [500, 800]), { hp: 0.5, mot: 'still' })], { type: 'kill' }, ['time'],
      [{ a: 'forgespirit', at: 'self' }, { a: 'attack', at: 'd0' }]),
    // ---------------------------------------------------------------- level 2
    V('out_of_range', 2, 'dire_ridge', ['movement', 'towers', 'awareness'],
      tx(L('Out of range', 'Fora do alcance'),
        L('You woke up right under an enemy tower. It will not be kind.', 'Você acordou bem debaixo de uma torre inimiga. Ela não vai ser gentil.'),
        L('Get out of the tower range and survive', 'Saia do alcance da torre e sobreviva'),
        L('You walked away alive', 'Você saiu vivo'), L('you die', 'você morre')),
      14, { lvl: 25, at: { tower: { team: 1, i: 0 }, ahead: -420 } },
      [],
      { type: 'hold', time: 22 }, ['died'], [{ a: 'move' }]),
    // ---------------------------------------------------------------- level 3
    V('river_guard', 3, 'mid_river', ['river', 'multi', 'reaction'],
      tx(L('Hold the river', 'Segure o rio'),
        L('A squad is marching on our side of the river. Do not let them cross.', 'Um grupo marcha pelo nosso lado do rio. Não deixe que o atravessem.'),
        L('Kill both enemies before they cross the river', 'Mate os dois inimigos antes que cruzem o rio'),
        L('Both are down before the river', 'Os dois caem antes do rio'), L('an enemy crosses the line', 'um inimigo cruza a linha')),
      12, { lvl: 25, preinvoked: ['coldsnap', 'sunstrike'], at: { x: 2450, y: 1950 } },
      [U({ gate: true, ahead: 1700, side: -160 }, { hp: 0.35, mot: 'march' }), U({ gate: true, ahead: 1850, side: 160 }, { hp: 0.35, mot: 'march' })],
      { type: 'kill' }, ['cross', 'time'],
      [{ a: 'coldsnap', at: 'd0' }, { a: 'sunstrike', at: 'd0' }, { a: 'tornado', at: 'd1' }, { a: 'sunstrike', at: 'd1' }],
      { gate: { x: 2040, y: 1800, r: 260 } }),
    // ---------------------------------------------------------------- level 4
    V('two_birds', 4, 'rosh_pit', ['multi', 'burst'],
      tx(L('Two birds', 'Dois coelhos'),
        L('Two enemies are chatting side by side. One spell, two kills.', 'Dois inimigos conversam lado a lado. Uma magia, duas mortes.'),
        L('Kill two enemies with one spell', 'Mate dois inimigos com uma única magia'),
        L('Two kills, one spell', 'Duas mortes, uma magia'), L('time runs out', 'o tempo acaba')),
      10, { lvl: 25, preinvoked: ['sunstrike'] },
      [U(Wh(['open'], [750, 950]), { hp: 0.33, mot: 'still' }), U({ of: 0, dx: 140, dy: 0 }, { hp: 0.33, mot: 'still' })],
      { type: 'killN', n: 2, one: true }, ['time'], [{ a: 'sunstrike', at: 'mid' }]),
    V('uphill_snipe', 4, 'dire_cliffs', ['highground', 'vision'],
      tx(L('Uphill snipe', 'Tiro morro acima'),
        L('He sits on the high ground and cannot see you coming. You never climb the ramp.', 'Ele está no terreno alto e não te vê chegando. Você nunca sobe a rampa.'),
        L('Kill the enemy while you stand on lower ground', 'Mate o inimigo enquanto você está no terreno baixo'),
        L('The enemy falls to your shot from below', 'O inimigo cai com seu tiro de baixo'), L('you kill it from the same level or time runs out', 'você mata do mesmo nível ou o tempo acaba')),
      14, { lvl: 25, preinvoked: ['sunstrike', 'chaosmeteor'], at: { x: 5100, y: 1560 } },
      [U({ x: 5700, y: 1560 }, { hp: 0.42, mot: 'still' })],
      { type: 'kill', how: { low: true } }, ['method', 'time'], [{ a: 'sunstrike', at: 'd0' }, { a: 'chaosmeteor', at: 'd0' }]),
    // ---------------------------------------------------------------- level 5
    V('blast_push', 5, 'rad_jungle', ['multi', 'positioning'],
      tx(L('Bowling', 'Boliche'),
        L('Three of them are huddled in a line. Deafening Blast loves a line.', 'Três deles estão amontoados em fila. O Deafening Blast adora uma fila.'),
        L('Push at least two enemies with a single Deafening Blast', 'Empurre pelo menos dois inimigos com um único Deafening Blast'),
        L('A clean strike', 'Strike perfeito'), L('time runs out', 'o tempo acaba')),
      9, { lvl: 25, preinvoked: ['deafeningblast'] },
      [U(Wh(['open'], [650, 800]), { hp: 1, mot: 'still' }), U({ of: 0, dx: 150, dy: 70 }, { hp: 1, mot: 'still' }), U({ of: 0, dx: 300, dy: -50 }, { hp: 1, mot: 'still' })],
      { type: 'push', n: 2 }, ['time'], [{ a: 'deafeningblast', at: 'mid' }]),
    V('tower_dive', 5, 'twin_falls', ['towers', 'blink', 'highground'],
      tx(L('Behind the tower', 'Atrás da torre'),
        L('He thinks the tower protects him. Blink past it and make him regret it.', 'Ele acha que a torre o protege. Dê Blink por cima dela e faça-o se arrepender.'),
        L('Blink behind the enemy tower and kill him with any combo', 'Dê Blink atrás da torre inimiga e mate-o com qualquer combo'),
        L('Dived and delivered', 'Mergulho perfeito'), L('you die or time runs out', 'você morre ou o tempo acaba')),
      16, { lvl: 25, items: ['blink'], preinvoked: ['chaosmeteor', 'deafeningblast'], at: { x: 1300, y: 1950 } },
      [U({ x: 1250, y: 2900 }, { hp: 0.45, mot: 'still' })],
      { type: 'kill' }, ['died', 'time'], [{ a: 'blink', at: 'd0' }, { a: 'chaosmeteor', at: 'd0' }, { a: 'deafeningblast', at: 'd0', w: 0.8 }]),
    V('tower_siege', 5, 'bot_falls', ['towers', 'burst'],
      tx(L('Tower siege', 'Cerco à torre'),
        L('A weakened outpost tower. Meteor Hammer and spirits make short work of it, but it bites back.', 'Uma torre enfraquecida. O Meteor Hammer e os espíritos resolvem rápido, mas ela revida.'),
        L('Destroy the enemy tower without dying', 'Destrua a torre inimiga sem morrer'),
        L('The tower falls', 'A torre cai'), L('you die or time runs out', 'você morre ou o tempo acaba')),
      30, { lvl: 25, items: ['meteorhammer'], preinvoked: ['forgespirit'], at: { tower: { team: 1, i: 0 }, ahead: -900 } },
      [], { type: 'destroyTower' }, ['died', 'time'],
      [{ a: 'forgespirit', at: 'self' }, { a: 'meteorhammer', at: 'tower' }, { a: 'attack', at: 'tower' }], { towerHp: 700 }),
    // ---------------------------------------------------------------- level 6
    V('force_chase', 6, 'dire_lowland', ['movement', 'escape'],
      tx(L('Force the issue', 'Force a barra'),
        L('He runs as soon as he sees you. Force Staff closes the gap in a blink.', 'Ele corre assim que te vê. O Force Staff fecha a distância num piscar.'),
        L('Catch and kill the runner with Force Staff and spells', 'Alcance e mate o fugitivo com Force Staff e magias'),
        L('Caught and killed', 'Pego e morto'), L('the target escapes or time runs out', 'o alvo escapa ou o tempo acaba')),
      16, { lvl: 25, items: ['forcestaff'], preinvoked: ['tornado', 'sunstrike'] },
      [U(Wh(['open'], [1300, 1700]), { hp: 0.42, behavior: 'escape', aware: 1 })],
      { type: 'kill' }, ['escaped', 'time'], [{ a: 'forcestaff', at: 'self' }, { a: 'tornado', at: 'd0' }, { a: 'sunstrike', at: 'd0', w: 0.4 }]),
    V('ghost_finish', 6, 'rad_top', ['invisible', 'awareness'],
      tx(L('Ghost finish', 'Final fantasma'),
        L('Vanish first, then let your Forge Spirits finish him. He will never see it coming.', 'Suma primeiro e deixe os Forge Spirits terminarem o serviço. Ele não vai ver nada.'),
        L('Finish the enemy with your Forge Spirits while you are invisible', 'Termine o inimigo com seus Forge Spirits enquanto você está invisível'),
        L('Killed by spirits while invisible', 'Morto pelos espíritos com você invisível'), L('he dies another way or time runs out', 'ele morre de outro jeito ou o tempo acaba')),
      20, { lvl: 25, preinvoked: ['ghostwalk', 'forgespirit'] },
      [U(Wh(['open'], [800, 1100]), { hp: 0.4, mot: 'still', aware: 0.3 })],
      { type: 'kill', how: { by: 'spirit', inv: true } }, ['method', 'time'],
      [{ a: 'ghostwalk', at: 'self' }, { a: 'forgespirit', at: 'self' }, { a: 'move', at: 'd0' }]),
    // ---------------------------------------------------------------- level 7
    V('fog_ambush', 7, 'dire_jungle', ['vision', 'awareness', 'fog'],
      tx(L('Out of the fog', 'Saindo da névoa'),
        L('He is camping in the jungle and has not noticed you. Keep it that way until the spells land.', 'Ele acampou na selva e não te notou. Continue assim até as magias caírem.'),
        L('Kill the enemy from the fog with Tornado and Sun Strike without being seen', 'Mate o inimigo saindo da névoa com Tornado e Sun Strike sem ser visto'),
        L('A silent kill from the fog', 'Uma morte silenciosa vinda da névoa'), L('he spots you before the first hit', 'ele te vê antes do primeiro golpe')),
      14, { lvl: 25, preinvoked: ['tornado', 'sunstrike'] },
      [U(Wh(['fog'], [850, 1100]), { hp: 0.45, mot: 'still', aware: 0.15 })],
      { type: 'kill' }, ['seen', 'time'], [{ a: 'tornado', at: 'd0' }, { a: 'sunstrike', at: 'd0', w: 1.2 }], { fog: true }),
    V('bkb_bait', 7, 'shell_cove', ['reaction', 'items'],
      tx(L('Bait the BKB', 'Isque o BKB'),
        L('He pops Black King Bar the moment you cast a disable. Make him waste it.', 'Ele usa o Black King Bar assim que você lança um disable. Faça-o desperdiçar.'),
        L('Make him pop BKB with a cheap disable, then kill him', 'Faça-o gastar o BKB com um disable barato e depois mate-o'),
        L('BKB wasted, enemy dead', 'BKB desperdiçado, inimigo morto'), L('time runs out', 'o tempo acaba')),
      22, { lvl: 25, preinvoked: ['coldsnap', 'sunstrike'] },
      [U(Wh(['open'], [650, 900]), { hp: 0.5, behavior: 'defend', items: ['bkb'], aware: 1 })],
      { type: 'kill' }, ['time'],
      [{ a: 'coldsnap', at: 'd0' }, { a: 'tornado', at: 'd0', w: 7 }, { a: 'sunstrike', at: 'd0', w: 0.3 }, { a: 'chaosmeteor', at: 'd0', w: 0.3 }]),
    V('dust_hunt', 7, 'dire_wall', ['invisible', 'escape', 'items'],
      tx(L('Dust hunt', 'Caça com Dust'),
        L('He vanishes with a Shadow Blade the second he spots you. Dust of Appearance shows the way.', 'Ele some com Shadow Blade assim que te vê. O Dust of Appearance mostra o caminho.'),
        L('Reveal the invisible runner with Dust and kill him', 'Revele o fugitivo invisível com Dust e mate-o'),
        L('Revealed and killed', 'Revelado e morto'), L('the target escapes or time runs out', 'o alvo escapa ou o tempo acaba')),
      16, { lvl: 25, items: ['dust'], preinvoked: ['sunstrike', 'chaosmeteor'] },
      [U(Wh(['open'], [800, 1100]), { hp: 0.4, behavior: 'escape', items: ['shadowblade'], aware: 1 })],
      { type: 'kill' }, ['escaped', 'time'], [{ a: 'dust', at: 'self' }, { a: 'sunstrike', at: 'd0' }, { a: 'chaosmeteor', at: 'd0', w: 0.3 }]),
    // ---------------------------------------------------------------- level 8
    V('river_guard_2', 8, 'mid_river', ['river', 'multi', 'reaction', 'items'],
      tx(L('Hold the river II', 'Segure o rio II'),
        L('A bigger squad this time, and one of them carries a Black King Bar.', 'Um grupo maior desta vez, e um deles carrega um Black King Bar.'),
        L('Kill all three enemies before they cross the river', 'Mate os três inimigos antes que cruzem o rio'),
        L('The river holds', 'O rio aguenta'), L('an enemy crosses the line', 'um inimigo cruza a linha')),
      16, { lvl: 27, preinvoked: ['coldsnap', 'emp'], at: { x: 2450, y: 1950 } },
      [U({ gate: true, ahead: 1900, side: -240 }, { hp: 0.35, mot: 'march' }), U({ gate: true, ahead: 2000, side: 0 }, { hp: 0.35, mot: 'march', items: ['bkb'] }),
        U({ gate: true, ahead: 2100, side: 240 }, { hp: 0.35, mot: 'march' })],
      { type: 'kill' }, ['cross', 'time'],
      [{ a: 'emp', at: 'mid' }, { a: 'coldsnap', at: 'd0' }, { a: 'sunstrike', at: 'd0' }, { a: 'tornado', at: 'd1' }, { a: 'sunstrike', at: 'd1' }, { a: 'chaosmeteor', at: 'd1' }],
      { gate: { x: 2040, y: 1800, r: 260 } }),
    V('cliff_blink', 8, 'dire_cliffs', ['highground', 'blink', 'escape'],
      tx(L('Over the cliff', 'Por cima do penhasco'),
        L('He runs along the cliff top. The ramp is a long way round: take the shortcut.', 'Ele corre pela beira do penhasco. A rampa é longe demais: pegue o atalho.'),
        L('Blink up to the high ground and kill the runner', 'Dê Blink até o terreno alto e mate o fugitivo'),
        L('Cut him off from above', 'Interceptado por cima'), L('the target escapes or time runs out', 'o alvo escapa ou o tempo acaba')),
      16, { lvl: 27, items: ['blink'], preinvoked: ['tornado', 'sunstrike'], at: { x: 5000, y: 1700 } },
      [U({ x: 5900, y: 1200 }, { hp: 0.42, behavior: 'escape', aware: 0.6 })],
      { type: 'kill' }, ['escaped', 'time'], [{ a: 'blink', at: 'd0' }, { a: 'tornado', at: 'd0' }, { a: 'sunstrike', at: 'd0', w: 0.5 }]),
    // ---------------------------------------------------------------- level 9
    V('triple_kill', 9, 'dire_corner', ['multi', 'burst'],
      tx(L('Triple threat', 'Ameaça tripla'),
        L('Three wounded enemies in one clearing. A single Cataclysm can take them all.', 'Três inimigos feridos na mesma clareira. Um único Cataclysm leva todos.'),
        L('Kill three enemies with one spell', 'Mate três inimigos com uma única magia'),
        L('Triple kill', 'Triple kill'), L('time runs out', 'o tempo acaba')),
      10, { lvl: 30, scepter: 'exort', preinvoked: ['sunstrike'] },
      [U(Wh(['open'], [500, 700]), { hp: 0.4, mot: 'still' }), U({ of: 0, dx: 150, dy: 190 }, { hp: 0.4, mot: 'still' }), U({ of: 0, dx: -120, dy: 330 }, { hp: 0.4, mot: 'still' })],
      { type: 'killN', n: 3, one: true }, ['time'], [{ a: 'sunstrike', at: 'self' }]),
    V('blast_push_3', 9, 'bot_falls', ['multi', 'positioning', 'reaction'],
      tx(L('Strike line', 'Linha de strike'),
        L('Three of them stroll in a staggered line. Find the angle that sweeps them all.', 'Três deles caminham em fila desencontrada. Ache o ângulo que varre todos.'),
        L('Push all three enemies with a single Deafening Blast', 'Empurre os três inimigos com um único Deafening Blast'),
        L('All three pushed at once', 'Os três empurrados de uma vez'), L('time runs out', 'o tempo acaba')),
      12, { lvl: 30, preinvoked: ['deafeningblast'] },
      [U(Wh(['open'], [800, 1000]), { hp: 1, mot: 'still' }), U({ of: 0, dx: 160, dy: 40 }, { hp: 1, mot: 'still' }), U({ of: 0, dx: 330, dy: 70 }, { hp: 1, mot: 'still' })],
      { type: 'push', n: 3 }, ['time'], [{ a: 'deafeningblast', at: 'mid' }]),
    // ---------------------------------------------------------------- level 10
    V('gauntlet', 10, 'dire_ridge', ['towers', 'escape', 'blink', 'invisible'],
      tx(L('The gauntlet', 'A corrida'),
        L('He sprints for the tower with a Shadow Blade and a Blink. Finish him before he reaches safety, and stay alive.', 'Ele corre para a torre com Shadow Blade e Blink. Termine antes que chegue ao abrigo e continue vivo.'),
        L('Kill the escaping enemy near his tower without dying', 'Mate o inimigo em fuga perto da torre sem morrer'),
        L('He never made it home', 'Ele nunca chegou em casa'), L('he escapes, you die or time runs out', 'ele escapa, você morre ou o tempo acaba')),
      18, { lvl: 30, items: ['blink', 'dust'], preinvoked: ['sunstrike', 'chaosmeteor'], at: { tower: { team: 1, i: 0 }, ahead: -1500 } },
      [U({ tower: { team: 1, i: 0 }, ahead: -800 }, { hp: 0.45, behavior: 'escape', items: ['shadowblade', 'blink'], aware: 1 })],
      { type: 'kill' }, ['escaped', 'died', 'time'],
      [{ a: 'dust', at: 'self' }, { a: 'sunstrike', at: 'd0' }, { a: 'chaosmeteor', at: 'd0', w: 0.3 }, { a: 'deafeningblast', at: 'd0', w: 0.8 }]),
    V('blink_denial', 10, 'dire_corner', ['reaction', 'escape', 'items'],
      tx(L('No blink for you', 'Sem Blink pra você'),
        L('Blink Dagger, Force Staff and a very quick reaction. Pin him down before he can leave.', 'Blink Dagger, Force Staff e uma reação muito rápida. Prenda-o antes que ele saia.'),
        L('Kill the enemy before he uses his escape items', 'Mate o inimigo antes que ele use os itens de fuga'),
        L('Denied', 'Negado'), L('the target escapes or time runs out', 'o alvo escapa ou o tempo acaba')),
      16, { lvl: 30, items: ['atos', 'dust'], preinvoked: ['sunstrike', 'chaosmeteor'] },
      [U(Wh(['open'], [750, 950]), { hp: 0.5, behavior: 'disable_escape', items: ['blink', 'forcestaff'], aware: 1 })],
      { type: 'kill' }, ['escaped', 'time'],
      [{ a: 'atos', at: 'd0' }, { a: 'sunstrike', at: 'd0' }, { a: 'chaosmeteor', at: 'd0', w: 0.3 }, { a: 'deafeningblast', at: 'd0', w: 0.8 }]),
    V('shadow_strike', 10, 'dire_corner', ['invisible', 'awareness', 'multi', 'items'],
      tx(L('Shadow strike', 'Golpe nas sombras'),
        L('Two guards, no eyes in the dark. Vanish with Shadow Blade and strike before they can spot you.', 'Dois guardas e nenhuma visão no escuro. Suma com o Shadow Blade e ataque antes que te vejam.'),
        L('Kill both enemies while invisible (keep Dust for emergencies)', 'Mate os dois inimigos enquanto está invisível (guarde o Dust para emergências)'),
        L('Two kills from the shadows', 'Duas mortes saídas das sombras'), L('you strike while visible or time runs out', 'você ataca visível ou o tempo acaba')),
      20, { lvl: 30, items: ['shadowblade', 'dust', 'blink'], preinvoked: ['sunstrike', 'chaosmeteor'] },
      [U(Wh(['open'], [900, 1200]), { hp: 0.4, mot: 'still', aware: 0.3 }), U({ of: 0, dx: 330, dy: 110 }, { hp: 0.4, mot: 'still', aware: 0.3 })],
      { type: 'killN', n: 2, how: { inv: true } }, ['method', 'time'],
      [{ a: 'shadowblade', at: 'self' }, { a: 'sunstrike', at: 'd0' }, { a: 'chaosmeteor', at: 'd1' }]),
  ];

  // ---- legacy set: level, map, texts and tags added so the ranked ramp / picker treat it like the rest
  const LEVEL = { ghost_escape: 2, gleipnir_cluster: 2, tornado_sun: 3, sun_snipe: 3, burst_cold_forge: 4, orchid_burst: 4, icewall_emp_pull: 5,
    atos_vyse_lock: 6, gleipnir_burst: 6, blink_fog: 7, cataclysm_finish: 7, tornado_chain: 8, refresher_double: 9 };
  for (const s of LEGACY) {
    s.legacy = true; s.level = LEVEL[s.id]; s.map = 'grounds'; s.tags = ['combo']; s.units = s.dummies; s.fail = s.obj.type === 'escape' ? ['caught'] : ['time'];
    s.flair = s.tip; s.desc = s.goal; s.win = s.goal;
  }
  for (const s of V4) {
    s.tier = s.level <= 3 ? 1 : s.level <= 7 ? 2 : 3; s.dummies = s.units; s.flair = s.flair || s.tip;
    s.tip = s.flair; s.goal = s.desc;   // HUD: tip = story line, goal = the objective line
  }

  IT.SCENARIOS = LEGACY.concat(V4).sort((a, b) => a.level - b.level);
  IT.SCENARIOS.get = id => IT.SCENARIOS.find(s => s.id === id) || null;
})(typeof window !== 'undefined' ? window : globalThis);
