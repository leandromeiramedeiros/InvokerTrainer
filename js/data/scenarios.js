// Scenarios v4 (data only). Owner: MODES (format + engine), content grows here.
//
// FORMAT
//   { id, level 1..10, tags[], name / flair / desc / win / lose { en, pt }, goal { en, pt } (one-line objective for the HUD),
//     map:'id' (IT.Maps id; unknown -> 'grounds'), mapTag:'river' (used when `map` is missing/unknown: first map carrying the tag),
//     countdown:10, par (s, a clean run; the time limit is par x difficulty.timer + slack + invoke time unless preinvoked),
//     hero:{ lvl, style:'qe'|'qw', orbs?{quas,wex,exort}, items:[ids], scepter?:orb, shard?:spell, preinvoked:[spell, spell?] (slot 1 = last invoked), at?:{x,y}|'spawn' },
//     units:[ { type:'dummy'|'enemy', dx, dy | at:{x,y}, hp (start fraction of the burnable hp, 1 = full), mot, items, elev, ...spawnEnemy opts } ],
//        positions are relative to the hero spawn (dx, dy) unless `at` is given; `elev:2` snaps the unit to the nearest high-ground tile (0 = river / low).
//        mot: 'flee' (runs from the hero) | 'chase' (runs at the hero, loses it while invisible) | 'still' (never moves) | 'march' (walks along dir at `speed` x ms,
//        e.g. toward a hold line) | undefined (difficulty behaviour).
//        'dummy' = scarecrow: never dies, never counts as a kill target. 'enemy' = NPC hero: dies at 0 hp, counts for every objective.
//     obj:{ type, ... }
//        kill                    every enemy dead
//        killN       n           n enemies dead
//        killOne     n, with?    ONE cast (of `with`, any spell when omitted) kills >= n enemies
//        escape      time        stay alive and uncaught for `time` seconds
//        hold        line:{axis:'x'|'y', at (hero-relative), side:+1|-1 (side the enemies start on)}, time   no enemy crosses the line for `time` seconds
//        push        n, with?    ONE Deafening Blast (or `with`) hits >= n enemies (they are knocked back)
//        kill_with   with:'<spell>'|'forge'|'invisible'|'attack', n?   the killing blow must come from that source; any other kill fails ('wrongkill')
//        destroyTower            the enemy tower of the map goes down
//        rootAll                 every enemy rooted at once (legacy, Gleipnir clusters)
//     fail:[ 'time' (always), 'died' (hero down), 'cross' (hold), 'escaped' (a fleeing enemy left the arena), 'seen' (an enemy noticed you), 'wrongkill' (kill_with) ],
//     steps:[ { a:spell|item|'attack'|'move', at:'d0'|'d1'|'self'|'lead'|'mid', w: seconds to wait first, label?:{en,pt} } ]   STEP-BY-STEP HUD + the test bot
//     rand:{ pos: unit position jitter (px), hp: +-start hp fraction, wind: [min,max] s the foes idle after GO, beh:[behaviours to pick from], ang: rotate the layout +-rad },
//     needs:[ids]  items / features the scenario relies on; the test-suite skips it while the game lacks one (items 'dust', 'forcestaff' ..., 'towers', 'maps')
//   Legacy aliases kept: tip = desc, sol = steps, tier = ceil(level / 3.4).
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const L = (en, pt) => ({ en, pt });
  const U = (type, dx, dy, o) => Object.assign({ type, dx, dy }, o || {});
  const E = (dx, dy, o) => U('enemy', dx, dy, o);

  const S = (id, level, name, flair, desc, goal, win, lose, par, hero, units, obj, steps, extra) => {
    const sc = Object.assign({
      id, level, tags: [], name, flair, desc, goal, win, lose, map: 'grounds', countdown: 10, par, hero, units, obj, fail: ['time', 'died'], steps,
      rand: { pos: 60, hp: 0.06, wind: [0, 1.2] }, needs: [],
    }, extra || {});
    sc.tip = sc.desc; sc.sol = sc.steps; sc.tier = Math.max(1, Math.min(3, Math.ceil(level / 3.4)));
    return sc;
  };

  IT.SCENARIOS = [
    // ------------------------------------------------------------------ level 1
    S('ghost_escape', 1, L('Ghost Walk escape', 'Fuga com Ghost Walk'),
      L('A hunter is on your trail and the grass gives you no cover.', 'Um caçador está no seu rastro e o capim não esconde ninguém.'),
      L('A chaser is closing in. Ghost Walk makes you invisible and slows it: break contact and survive.',
        'Um perseguidor se aproxima. O Ghost Walk te deixa invisível e o deixa lento: quebre o contato e sobreviva.'),
      L('Survive without being caught', 'Sobreviva sem ser pego'),
      L('Lost it. You vanish into the grass.', 'Despistou. Você some no capim.'), L('It caught you. Cast Ghost Walk before it is on top of you.', 'Te pegou. Use o Ghost Walk antes que ele chegue.'),
      10, { lvl: 25 }, [E(-450, 0, { mot: 'chase' })], { type: 'escape', time: 9 },
      [{ a: 'ghostwalk', at: 'self' }],
      { tags: ['escape', 'movement'], rand: { pos: 40, wind: [0, 0.6] } }),
    S('gleipnir_cluster', 1, L('Gleipnir on the group', 'Gleipnir no grupo'),
      L('Three scouts huddle together, waiting for orders.', 'Três batedores se amontoam, esperando ordens.'),
      L('Aim Eternal Chains at the middle of the group so every enemy is rooted at the same time.',
        'Mire as Eternal Chains no meio do grupo para prender todos ao mesmo tempo.'),
      L('Root every enemy at once', 'Prenda todos de uma vez'),
      L('All three pinned in one shot.', 'Os três presos num tiro só.'), L('Not all were rooted together. Aim at the middle of the group.', 'Nem todos foram presos juntos. Mire no meio do grupo.'),
      6, { lvl: 25, items: ['gleipnir'] }, [E(600, -130, { mot: 'still' }), E(650, 40, { mot: 'still' }), E(560, 150, { mot: 'still' })], { type: 'rootAll' },
      [{ a: 'gleipnir', at: 'mid' }],
      { tags: ['multi', 'items'], rand: { pos: 35, wind: [0, 0.5] } }),

    // ------------------------------------------------------------------ level 2
    S('tornado_sun', 2, L('Tornado + Sun Strike', 'Tornado + Sun Strike'),
      L('Wounded and wary, it will not stand still for long.', 'Ferido e desconfiado, ele não vai ficar parado por muito tempo.'),
      L('Cast Sun Strike right after Tornado so the beam lands exactly when the target drops.',
        'Lance o Sun Strike logo após o Tornado para o raio cair exatamente quando o alvo descer.'),
      L('Tornado, then Sun Strike on landing', 'Tornado, depois Sun Strike no pouso'),
      L('Right on time. The beam found it landing.', 'No tempo certo. O raio o pegou pousando.'), L('Survived. Time Sun Strike for the moment the Tornado ends.', 'Sobreviveu. Sincronize o Sun Strike com o fim do Tornado.'),
      10, { lvl: 25 }, [E(500, 0, { hp: 0.293 })], { type: 'kill' },
      [{ a: 'tornado', at: 'd0' }, { a: 'sunstrike', at: 'd0', w: 1.2 }],
      { tags: ['burst', 'timing'] }),
    S('burst_cold_forge', 2, L('Cold Snap burst', 'Burst de Cold Snap'),
      L('Frozen feet make for an easy target.', 'Pés congelados são um alvo fácil.'),
      L('Freeze it, drop Forge Spirits and Alacrity on yourself, then pour in attacks while it cannot move.',
        'Congele, chame os Forge Spirits e use Alacrity em você, depois ataque enquanto ele não anda.'),
      L('Cold Snap + Forge + Alacrity: kill it', 'Cold Snap + Forge + Alacrity: mate o alvo'),
      L('Frozen, flanked, finished.', 'Congelado, cercado, acabado.'), L('It thawed out. Keep up the attacks while Cold Snap holds.', 'Descongelou. Mantenha os ataques enquanto o Cold Snap segura.'),
      14, { lvl: 25 }, [E(450, 0, { hp: 0.733 })], { type: 'kill' },
      [{ a: 'coldsnap', at: 'd0' }, { a: 'forgespirit', at: 'self', w: 0.3 }, { a: 'alacrity', at: 'self', w: 0.3 }, { a: 'attack', at: 'd0', w: 0.2 }],
      { tags: ['burst', 'cc'] }),

    // ------------------------------------------------------------------ level 3
    S('sun_snipe', 3, L('Sun Strike snipe', 'Snipe de Sun Strike'),
      L('Nearly dead and running for the trees.', 'Quase morto e correndo para as árvores.'),
      L('The enemy is nearly dead and running away. Sun Strike takes 1.7 s to land, so aim where it will be.',
        'O inimigo está quase morto e foge. O Sun Strike leva 1,7 s para cair, então mire onde ele vai estar.'),
      L('Finish the fleeing enemy', 'Acabe com o inimigo em fuga'),
      L('Sniped. It never saw the beam.', 'Acertou. Ele nem viu o raio.'), L('It got away. Lead the shot: Sun Strike lands 1.7 s later.', 'Fugiu. Mire à frente: o Sun Strike cai 1,7 s depois.'),
      8, { lvl: 25 }, [E(500, -150, { hp: 0.173, mot: 'flee' })], { type: 'kill' },
      [{ a: 'sunstrike', at: 'lead', w: 1.2 }],
      { tags: ['prediction', 'burst'], fail: ['time', 'died', 'escaped'], rand: { pos: 70, hp: 0.04, wind: [0, 0.8] } }),
    S('orchid_burst', 3, L('Orchid burst', 'Burst com Orchid'),
      L('Silence it first, then make the numbers count.', 'Silencie primeiro, depois faça os números valerem.'),
      L('Orchid silences it and stores all damage for a burst. Cold Snap, Forge and Alacrity attacks all feed the pop.',
        'O Orchid silencia e guarda todo o dano para uma explosão. Cold Snap, Forge e ataques com Alacrity alimentam o estouro.'),
      L('Orchid then burst: kill it', 'Orchid e burst: mate o alvo'),
      L('Silenced and popped.', 'Silenciado e estourado.'), L('The Orchid pop was not enough. Pour more damage in before it ends.', 'O estouro do Orchid não bastou. Despeje mais dano antes de acabar.'),
      16, { lvl: 25, items: ['orchid'] }, [E(450, 0, { hp: 0.533 })], { type: 'kill' },
      [{ a: 'orchid', at: 'd0' }, { a: 'coldsnap', at: 'd0', w: 0.2 }, { a: 'forgespirit', at: 'self', w: 0.3 }, { a: 'alacrity', at: 'self', w: 0.3 }, { a: 'attack', at: 'd0', w: 0.2 }],
      { tags: ['burst', 'items'] }),
    S('blast_push', 3, L('Blast them back', 'Empurre com o Blast'),
      L('Two raiders march side by side, right in your line of fire.', 'Dois invasores marcham lado a lado, na sua linha de tiro.'),
      L('Deafening Blast pushes everything it touches. Line it up so one blast hits both raiders.',
        'O Deafening Blast empurra tudo que toca. Alinhe para um blast acertar os dois invasores.'),
      L('Push two enemies with one Blast', 'Empurre dois inimigos com um Blast'),
      L('Both knocked back in one go.', 'Os dois empurrados de uma vez.'), L('The blast caught one at most. Stand so both are on the line.', 'O blast pegou no máximo um. Fique de modo que os dois estejam na linha.'),
      7, { lvl: 25 }, [E(520, -15, { mot: 'still' }), E(700, 20, { mot: 'still' })], { type: 'push', n: 2, with: 'deafeningblast' },
      [{ a: 'deafeningblast', at: 'mid' }],
      { tags: ['multi', 'aim'], rand: { pos: 25, wind: [0, 0.4] } }),

    // ------------------------------------------------------------------ level 4
    S('icewall_emp_pull', 4, L('Ice Wall + EMP pull', 'Ice Wall + EMP com puxada'),
      L('A slippery duelist who hates being dragged around.', 'Um duelista escorregadio que odeia ser arrastado.'),
      L('Slow it with the wall, then EMP beside it: the shard drags it to the centre while its mana burns.',
        'Deixe-o lento com a parede e use EMP ao lado: a shard o puxa ao centro enquanto a mana queima.'),
      L('Ice Wall + EMP with the shard', 'Ice Wall + EMP com a shard'),
      L('Pulled in and burned out.', 'Puxado e queimado.'), L('It broke free. The EMP must land right beside it while it is slowed.', 'Ele se soltou. O EMP precisa cair ao lado enquanto ele está lento.'),
      12, { lvl: 25, shard: 'emp' }, [E(450, 0, { hp: 0.467 })], { type: 'kill' },
      [{ a: 'icewall', at: 'd0' }, { a: 'emp', at: 'd0', w: 0.3 }, { a: 'forgespirit', at: 'self', w: 0.3 }, { a: 'attack', at: 'd0', w: 0.2 }],
      { tags: ['cc', 'shard'] }),
    S('ghost_ambush', 4, L('Ghost ambush', 'Emboscada fantasma'),
      L('It guards the camp and trusts its eyes. Take them away.', 'Ele vigia o acampamento e confia nos próprios olhos. Tire-os.'),
      L('The kill must happen while you are invisible. Ghost Walk first, then close in and attack.',
        'O abate precisa acontecer com você invisível. Ghost Walk primeiro, depois chegue perto e ataque.'),
      L('Kill it while invisible', 'Mate enquanto invisível'),
      L('It never knew what hit it.', 'Ele nem soube o que o acertou.'), L('It died in plain sight. The finishing blow must land while you are invisible.', 'Morreu à vista. O golpe final deve ser dado invisível.'),
      11, { lvl: 25 }, [E(500, 0, { hp: 0.12, mot: 'still' })], { type: 'kill_with', with: 'invisible' },
      [{ a: 'ghostwalk', at: 'self' }, { a: 'attack', at: 'd0', w: 0.2 }],
      { tags: ['stealth', 'timing'], fail: ['time', 'died', 'wrongkill'] }),
    S('blast_double_kill', 4, L('Two with one blast', 'Dois com um blast'),
      L('Both wounded, both in a row, both yours.', 'Os dois feridos, em fila, e os dois seus.'),
      L('Both are almost dead. One Deafening Blast down the line can finish them both.',
        'Os dois estão quase mortos. Um Deafening Blast pela linha pode acabar com ambos.'),
      L('Kill two enemies with one spell', 'Mate dois inimigos com uma magia'),
      L('A clean double kill.', 'Um duplo abate limpo.'), L('Not both at once. Line them up before the blast.', 'Não foi com os dois ao mesmo tempo. Alinhe-os antes do blast.'),
      8, { lvl: 25 }, [E(520, -10, { hp: 0.12, mot: 'still' }), E(700, 15, { hp: 0.12, mot: 'still' })], { type: 'killOne', n: 2, with: 'deafeningblast' },
      [{ a: 'deafeningblast', at: 'mid' }],
      { tags: ['multi', 'aim', 'burst'], rand: { pos: 25, hp: 0.03, wind: [0, 0.4] } }),

    // ------------------------------------------------------------------ level 5
    S('tornado_chain', 5, L('Tornado chain', 'Cadeia de Tornado'),
      L('A hard target with a long reach. Chain everything while it hangs in the air.', 'Um alvo duro e esperto. Encadeie tudo enquanto ele está no ar.'),
      L('Tornado lifts it, EMP goes under it, then Meteor and Blast land the moment it drops. Kill it before it runs.',
        'O Tornado ergue o alvo, o EMP vai embaixo e o Meteor e o Blast caem quando ele desce. Mate antes que fuja.'),
      L('Tornado, EMP, Meteor, Blast: kill it', 'Tornado, EMP, Meteor, Blast: mate o alvo'),
      L('Four spells, one clean chain.', 'Quatro magias, uma cadeia limpa.'), L('It dropped and escaped. Land Meteor and Blast as it comes down.', 'Caiu e fugiu. Acerte Meteor e Blast quando ele descer.'),
      16, { lvl: 25 }, [E(550, 0, { hp: 0.493 })], { type: 'kill' },
      [{ a: 'tornado', at: 'd0' }, { a: 'emp', at: 'd0', w: 0.5 }, { a: 'chaosmeteor', at: 'd0', w: 0.7 }, { a: 'deafeningblast', at: 'd0', w: 1.2 }],
      { tags: ['burst', 'timing', 'chain'] }),
    S('atos_vyse_lock', 5, L('Atos / Hex lockdown', 'Lockdown com Atos / Hex'),
      L('Two ways to pin it. Pick one and do not waste the window.', 'Duas formas de prendê-lo. Escolha uma e não desperdice a janela.'),
      L('Root it with Rod of Atos or Hex it with the Scythe, then Sun Strike and Chaos Meteor before it breaks free.',
        'Prenda com o Rod of Atos ou transforme com a Scythe, depois Sun Strike e Chaos Meteor antes que se solte.'),
      L('Atos or Hex, then Sun Strike + Meteor', 'Atos ou Hex, depois Sun Strike + Meteor'),
      L('Locked down and burned.', 'Travado e queimado.'), L('It slipped out of the lock. Sun Strike and Meteor right after the disable.', 'Escapou da trava. Sun Strike e Meteor logo após o controle.'),
      14, { lvl: 25, items: ['atos', 'vyse'] }, [E(550, 0, { hp: 0.333 })], { type: 'kill' },
      [{ a: 'atos', at: 'd0' }, { a: 'sunstrike', at: 'd0', w: 0.2 }, { a: 'chaosmeteor', at: 'd0', w: 0.3 }],
      { tags: ['cc', 'items', 'burst'] }),
    S('spirits_only', 5, L('Let the spirits do it', 'Deixe os espíritos agirem'),
      L('You hold the leash; the spirits bite.', 'Você segura a coleira; os espíritos mordem.'),
      L('Summon Forge Spirits and let them finish it. If your own spell or attack lands the kill, the turn is lost.',
        'Chame os Forge Spirits e deixe que eles terminem o serviço. Se sua magia ou ataque der o abate, o turno é perdido.'),
      L('The kill must come from Forge Spirits', 'O abate deve vir dos Forge Spirits'),
      L('The spirits finished the job.', 'Os espíritos terminaram o serviço.'), L('The kill was not made by the spirits. Hold your own damage.', 'O abate não foi dos espíritos. Segure o seu dano.'),
      12, { lvl: 25 }, [E(420, 0, { hp: 0.2, mot: 'still' })], { type: 'kill_with', with: 'forge' },
      [{ a: 'forgespirit', at: 'self' }],
      { tags: ['summons', 'restraint'], fail: ['time', 'died', 'wrongkill'] }),

    // ------------------------------------------------------------------ level 6
    S('blink_fog', 6, L('Blink from the fog', 'Blink saindo da névoa'),
      L('It stands far away in the fog and thinks it is safe.', 'Ele está longe, na névoa, e acha que está seguro.'),
      L('It stands far away in the fog. Blink in, then Chaos Meteor and Deafening Blast before it reacts.',
        'Ele está longe, na névoa. Dê Blink, depois Chaos Meteor e Deafening Blast antes de ele reagir.'),
      L('Blink, Meteor, Blast: kill it', 'Blink, Meteor, Blast: mate o alvo'),
      L('From nowhere, straight to the kill.', 'Do nada, direto para o abate.'), L('It reacted first. Blink in and cast at once.', 'Ele reagiu primeiro. Dê o Blink e lance na hora.'),
      12, { lvl: 25, items: ['blink'] }, [E(1000, 150, { hp: 0.293 })], { type: 'kill' },
      [{ a: 'blink', at: 'mid' }, { a: 'chaosmeteor', at: 'd0', w: 0.2 }, { a: 'deafeningblast', at: 'd0', w: 1.2 }],
      { tags: ['vision', 'movement', 'burst'], fog: true }),
    S('gleipnir_burst', 6, L('Gleipnir burst', 'Burst com Gleipnir'),
      L('Chains first, thunder second.', 'Correntes primeiro, trovão depois.'),
      L('Eternal Chains roots it. While it stands still, line up Sun Strike, Chaos Meteor and Deafening Blast.',
        'As Eternal Chains prendem o alvo. Enquanto ele está parado, alinhe Sun Strike, Chaos Meteor e Deafening Blast.'),
      L('Gleipnir, Sun Strike, Meteor, Blast', 'Gleipnir, Sun Strike, Meteor, Blast'),
      L('Rooted, then wrecked.', 'Preso e destruído.'), L('The chains ended before the burst. Chain the spells faster.', 'As correntes acabaram antes do burst. Encadeie as magias mais rápido.'),
      15, { lvl: 25, items: ['gleipnir'] }, [E(550, 0, { hp: 0.48 })], { type: 'kill' },
      [{ a: 'gleipnir', at: 'd0' }, { a: 'sunstrike', at: 'd0', w: 0.2 }, { a: 'chaosmeteor', at: 'd0', w: 0.3 }, { a: 'deafeningblast', at: 'd0', w: 1.2 }],
      { tags: ['burst', 'items', 'chain'] }),
    S('cataclysm_finish', 6, L('Cataclysm finish', 'Final com Cataclysm'),
      L('The whole squad is hurt and spread across the field.', 'O grupo inteiro está ferido e espalhado pelo campo.'),
      L('With the Scepter on Exort, Sun Strike becomes Cataclysm: it strikes every visible enemy nearby. Finish the low-HP group.',
        'Com o Scepter em Exort, o Sun Strike vira Cataclysm: atinge todos os inimigos visíveis. Acabe com o grupo ferido.'),
      L('Cataclysm: kill them all', 'Cataclysm: mate todos'),
      L('Fire from the sky, no survivors.', 'Fogo do céu, sem sobreviventes.'), L('Someone survived. Cataclysm hits only what you can see.', 'Alguém sobreviveu. O Cataclysm só acerta o que você vê.'),
      8, { lvl: 25, scepter: 'exort' }, [E(450, -100, { hp: 0.227 }), E(550, 120, { hp: 0.227 })], { type: 'kill' },
      [{ a: 'sunstrike', at: 'self' }],
      { tags: ['multi', 'scepter'] }),

    // ------------------------------------------------------------------ level 7
    S('refresher_double', 7, L('Refresher double', 'Refresher duplo'),
      L('One round is not enough, so you will need another.', 'Uma rodada não basta, então você vai precisar de outra.'),
      L('Meteor and Blast, Refresher, then do it again. Plan your mana: the second round decides the kill.',
        'Meteor e Blast, Refresher, e de novo. Planeje a mana: a segunda rodada decide a morte.'),
      L('Two rounds of Meteor + Blast', 'Duas rodadas de Meteor + Blast'),
      L('Two rounds, one corpse.', 'Duas rodadas, um cadáver.'), L('Out of damage. Spend the Refresher on a full second round.', 'Faltou dano. Gaste o Refresher numa segunda rodada completa.'),
      20, { lvl: 30, items: ['refresher'] }, [E(500, 0, { hp: 0.44, mot: 'still' })], { type: 'kill' },
      [{ a: 'chaosmeteor', at: 'd0' }, { a: 'deafeningblast', at: 'd0', w: 1.4 }, { a: 'refresher', at: 'self', w: 0.3 },
        { a: 'chaosmeteor', at: 'd0', w: 0.3 }, { a: 'deafeningblast', at: 'd0', w: 1.4 }],
      { tags: ['mana', 'items', 'chain'] }),
    S('river_hold', 7, L('Hold the river', 'Segure o rio'),
      L('The patrol wants the far bank. Not on your watch.', 'A patrulha quer a outra margem. Não enquanto você estiver aqui.'),
      L('Two enemies wade toward the river line. Tornado, Cold Snap and Ice Wall keep them on their side until the horn sounds.',
        'Dois inimigos avançam para a linha do rio. Tornado, Cold Snap e Ice Wall os mantêm do lado deles até soar a trombeta.'),
      L('Nobody crosses the river line', 'Ninguém atravessa a linha do rio'),
      L('The line held.', 'A linha segurou.'), L('They crossed the river. Keep them disabled or slowed at the line.', 'Eles atravessaram o rio. Mantenha-os controlados ou lentos na linha.'),
      12, { lvl: 25 }, [E(1500, -60, { mot: 'march', speed: 0.55 }), E(1650, 60, { mot: 'march', speed: 0.55 })],
      { type: 'hold', line: { axis: 'x', at: 700, side: 1 }, time: 12 },
      [{ a: 'tornado', at: 'd0' }, { a: 'tornado', at: 'd1', w: 0.4 }, { a: 'coldsnap', at: 'd0', w: 1.5 }, { a: 'coldsnap', at: 'd1', w: 0.5 }],
      { tags: ['hold', 'cc', 'river'], mapTag: 'river', fail: ['time', 'died', 'cross'], rand: { pos: 40, wind: [0, 0.8] } }),

    // ------------------------------------------------------------------ level 8
    S('shadowblade_dust', 8, L('Dust the vanishing act', 'Dust no sumiço'),
      L('It slips away the moment it is hurt: Shadow Blade, invisible, gone.', 'Ele some assim que se fere: Shadow Blade, invisível, adeus.'),
      L('Burst it, and when it fades with Shadow Blade throw Dust of Appearance to reveal it, then finish it before the Blade ends.',
        'Dê o burst e, quando ele sumir com a Shadow Blade, jogue o Dust of Appearance para revelá-lo e termine antes de o efeito acabar.'),
      L('Reveal it with Dust and kill it', 'Revele com Dust e mate'),
      L('Revealed and finished.', 'Revelado e finalizado.'), L('It vanished for good. Dust reveals it, then strike at once.', 'Sumiu de vez. O Dust revela, depois ataque na hora.'),
      14, { lvl: 25, items: ['dust', 'blink'] }, [E(520, 0, { hp: 0.4, items: ['shadowblade'], behavior: 'escape' })], { type: 'kill' },
      [{ a: 'coldsnap', at: 'd0' }, { a: 'chaosmeteor', at: 'd0', w: 0.4 }, { a: 'dust', at: 'd0', w: 0.8 }, { a: 'deafeningblast', at: 'd0', w: 0.3 }],
      { tags: ['vision', 'items', 'awareness'], needs: ['dust', 'enemy'], rand: { pos: 50, wind: [0, 1] } }),

    // ------------------------------------------------------------------ level 9
    S('highground_force', 9, L('Up the cliff', 'Subindo o penhasco'),
      L('It sits above on the high ground and laughs.', 'Ele fica lá em cima, no terreno alto, rindo.'),
      L('The target stands on high ground. Force Staff or Blink yourself up the cliff, then burst it before it escapes.',
        'O alvo está no terreno alto. Use Force Staff ou Blink para subir o penhasco e dê o burst antes que fuja.'),
      L('Climb the high ground and kill it', 'Suba o terreno alto e mate'),
      L('Over the ledge and onto it.', 'Por cima da borda e em cima dele.'), L('You never got up there. Force Staff or Blink onto the high ground.', 'Você não chegou lá em cima. Force Staff ou Blink até o terreno alto.'),
      16, { lvl: 25, items: ['forcestaff', 'blink'] }, [E(620, 0, { hp: 0.35, elev: 2 })], { type: 'kill' },
      [{ a: 'forcestaff', at: 'self' }, { a: 'blink', at: 'd0', w: 0.4 }, { a: 'coldsnap', at: 'd0', w: 0.2 }, { a: 'chaosmeteor', at: 'd0', w: 0.4 }, { a: 'deafeningblast', at: 'd0', w: 1.2 }],
      { tags: ['highground', 'movement', 'items'], mapTag: 'highground', needs: ['forcestaff', 'maps', 'enemy'] }),

    // ------------------------------------------------------------------ level 10
    S('triple_cataclysm', 10, L('Cataclysm trio', 'Trio de Cataclysm'),
      L('Three of them, wounded, spread out, and the clock is angry.', 'Três deles, feridos, espalhados, e o relógio está bravo.'),
      L('Three wounded enemies spread across the field. Cataclysm only strikes what you see, so get everyone in view and burn them together.',
        'Três inimigos feridos espalhados pelo campo. O Cataclysm só acerta o que você vê, então coloque todos à vista e queime juntos.'),
      L('Kill three with Cataclysm', 'Mate três com Cataclysm'),
      L('Rain of fire. All three down.', 'Chuva de fogo. Os três caíram.'), L('Not all three fell. Get them all in view before casting.', 'Nem os três caíram. Coloque todos à vista antes de lançar.'),
      9, { lvl: 30, scepter: 'exort' }, [E(480, -190, { hp: 0.2, mot: 'still' }), E(560, 10, { hp: 0.2, mot: 'still' }), E(470, 200, { hp: 0.2, mot: 'still' })],
      { type: 'killOne', n: 3, with: 'sunstrike' },
      [{ a: 'sunstrike', at: 'self' }],
      { tags: ['multi', 'scepter', 'vision'], fog: true, rand: { pos: 40, hp: 0.03, wind: [0, 0.5] } }),
    S('tower_siege', 10, L('Tower siege', 'Cerco à torre'),
      L('The Ancient is not going to knock itself down.', 'O Ancient não vai cair sozinho.'),
      L('Summon Forge Spirits, haste them with Alacrity and bring the enemy tower down. Do not stand in its range for long.',
        'Chame os Forge Spirits, acelere-os com Alacrity e derrube a torre inimiga. Não fique muito tempo no alcance dela.'),
      L('Destroy the enemy tower', 'Destrua a torre inimiga'),
      L('Rubble. The tower is down.', 'Escombros. A torre caiu.'), L('The tower still stands (or took you down). Use the spirits and stay out of range.', 'A torre continua de pé (ou te derrubou). Use os espíritos e fique fora do alcance.'),
      30, { lvl: 30, items: ['shiva'] }, [], { type: 'destroyTower' },
      [{ a: 'forgespirit', at: 'self' }, { a: 'alacrity', at: 'self', w: 0.3 }, { a: 'attack', at: 'tower', w: 0.2 }],
      { tags: ['tower', 'summons'], mapTag: 'towers', needs: ['towers', 'maps'], fail: ['time', 'died'], rand: { pos: 0, wind: [0, 0] } }),
  ];

  IT.SCENARIOS.get = id => IT.SCENARIOS.find(s => s.id === id) || null;
})(typeof window !== 'undefined' ? window : globalThis);
