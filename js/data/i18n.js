// UI strings (EN / PT-BR). IT.t(key, vars) -> string; {name} placeholders. Language lives in IT.lang (persisted by IT.Settings).
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const en = {}, pt = {};
  const D = (k, e, p) => { en[k] = e; pt[k] = p == null ? e : p; };

  // ---- generic
  D('app.title', 'INVOKER', 'INVOKER');
  D('app.sub', 'TRAINER v2', 'TREINADOR v2');
  D('app.tag', 'Quas, Wex, Exort. Learn the combos in a top-down arena.', 'Quas, Wex, Exort. Aprenda os combos em uma arena vista de cima.');
  D('ui.play', 'Play', 'Jogar');
  D('ui.stats', 'Stats', 'Estatísticas');
  D('ui.settings', 'Settings', 'Configurações');
  D('ui.back', 'Back', 'Voltar');
  D('ui.done', 'Save', 'Salvar');
  D('ui.cancel', 'Cancel', 'Cancelar');
  D('ui.resume', 'Resume', 'Continuar');
  D('ui.restart', 'Restart', 'Reiniciar');
  D('ui.loadout', 'Loadout', 'Build');
  D('ui.quit', 'Quit to title', 'Sair para o título');
  D('ui.endRun', 'End run', 'Encerrar partida');
  D('ui.go', 'GO', 'JOGAR');
  D('ui.reset', 'Reset', 'Zerar');
  D('ui.close', 'Close', 'Fechar');
  D('ui.title', 'Title', 'Título');
  D('ui.again', 'Play again', 'Jogar de novo');
  D('ui.paused', 'PAUSED', 'PAUSADO');
  D('ui.on', 'On', 'Ligado');
  D('ui.off', 'Off', 'Desligado');
  D('ui.language', 'Language', 'Idioma');
  D('ui.none', 'none', 'nenhum');
  D('ui.loading', 'Loading...', 'Carregando...');
  D('ui.hidden', 'HIDDEN', 'OCULTO');
  D('ui.visible', 'VISIBLE', 'VISÍVEL');
  D('ui.pressKey', 'press a key...', 'pressione uma tecla...');
  D('ui.export', 'Export JSON', 'Exportar JSON');
  D('ui.confirmReset', 'Erase all lifetime stats?', 'Apagar todas as estatísticas?');
  D('ui.cheat', 'Recipes', 'Receitas');

  // ---- orbs / spells / items
  D('orb.quas', 'Quas', 'Quas'); D('orb.wex', 'Wex', 'Wex'); D('orb.exort', 'Exort', 'Exort');
  D('orb.Q', 'Quas', 'Quas'); D('orb.W', 'Wex', 'Wex'); D('orb.E', 'Exort', 'Exort');
  D('spell.invoke', 'Invoke', 'Invocar');
  const spells = {
    coldsnap: 'Cold Snap', ghostwalk: 'Ghost Walk', icewall: 'Ice Wall', emp: 'E.M.P.', tornado: 'Tornado', alacrity: 'Alacrity',
    sunstrike: 'Sun Strike', forgespirit: 'Forge Spirit', chaosmeteor: 'Chaos Meteor', deafeningblast: 'Deafening Blast',
  };
  for (const k in spells) D('spell.' + k, spells[k]);
  D('item.refresher', 'Refresher Orb', 'Orbe Refresher');
  D('item.atos', 'Rod of Atos', 'Rod of Atos');
  D('item.vyse', 'Scythe of Vyse', 'Foice de Vyse');
  D('item.shiva', "Shiva's Guard", 'Guarda de Shiva');
  D('item.meteorhammer', 'Meteor Hammer', 'Martelo Meteoro');
  D('item.bkb', 'Black King Bar', 'Black King Bar');
  D('item.blink', 'Blink Dagger', 'Adaga Blink');
  D('item.boots', 'Boots of Speed', 'Botas de Velocidade');
  D('item.orchid', 'Orchid Malevolence', 'Orchid Malevolence');
  D('item.gleipnir', 'Gleipnir', 'Gleipnir');
  D('item.travels', 'Boots of Travel', 'Botas de Viagem');
  D('item.scepter', "Aghanim's Scepter", 'Cetro de Aghanim');
  D('item.shard', "Aghanim's Shard", 'Fragmento de Aghanim');
  D('attack', 'Attack', 'Ataque');

  // ---- fail reasons (sim 'fail' events)
  const fails = {
    notInvoked: ['Not invoked', 'Não invocada'], cooldown: ['On cooldown', 'Em recarga'], mana: ['Not enough mana', 'Mana insuficiente'],
    silenced: ['Silenced', 'Silenciado'], disabled: ['Disabled', 'Incapacitado'], noTarget: ['No target', 'Sem alvo'],
    targetHidden: ['Target not visible', 'Alvo não visível'], targetInvalid: ['Invalid target', 'Alvo inválido'],
    orbNotLearned: ['Orb not learned', 'Orbe não aprendido'], invokeCooldown: ['Invoke on cooldown', 'Invocar em recarga'],
    noRecipe: ['No recipe: pick 3 orbs', 'Sem receita: escolha 3 orbes'], rooted: ['Rooted', 'Preso'], blinkDamaged: ['Blink locked after damage', 'Blink bloqueado após dano'],
    immune: ['Target is magic immune', 'Alvo imune a magia'], noItem: ['Item not equipped', 'Item não equipado'],
    noAttack: ['Cannot attack', 'Não pode atacar'], gone: ['Target gone', 'Alvo sumiu'], unknown: ['Unknown order', 'Ordem desconhecida'],
  };
  for (const k in fails) D('fail.' + k, fails[k][0], fails[k][1]);
  const cf = { miss: ['Missed the dummy', 'Errou o alvo'], boltHit: ['The stun bolt hit you', 'O stun bolt te acertou'], within: ['Too slow', 'Muito devagar'],
    timeout: ['Spell never landed', 'A magia não acertou'], blinked: ['The dummy blinked away', 'O alvo deu blink'] };
  for (const k in cf) D('cfail.' + k, cf[k][0], cf[k][1]);
  D('toast.combo', 'COMBO! +{score}', 'COMBO! +{score}');
  D('toast.perfect', 'PERFECT! +{score}', 'PERFEITO! +{score}');
  D('toast.comboFail', 'FAILED: {why}', 'FALHOU: {why}');
  D('toast.locked', 'Combo locked: loadout lacks requirements', 'Combo bloqueado: a build não cumpre os requisitos');
  D('toast.refreshed', 'Cooldowns refreshed', 'Recargas reiniciadas');
  D('toast.noCombos', 'No combos available for this loadout', 'Nenhum combo disponível para esta build');
  D('toast.spawned', 'Dummy spawned', 'Alvo criado');
  D('toast.dummiesReset', 'Dummies reset', 'Alvos reiniciados');
  D('toast.cancelled', 'Cast cancelled', 'Lançamento cancelado');

  // ---- statuses
  const sts = { stun: ['Stunned', 'Atordoado'], frozen: ['Frozen', 'Congelado'], root: ['Rooted', 'Preso'], hex: ['Hexed', 'Transformado'], lift: ['Lifted', 'Erguido'],
    slow: ['Slowed', 'Lento'], disarm: ['Disarmed', 'Desarmado'], silence: ['Silenced', 'Silenciado'], magicImmune: ['Magic immune', 'Imune a magia'],
    coldsnap: ['Cold Snap', 'Cold Snap'], ghost: ['Ghost Walk', 'Ghost Walk'], knockback: ['Knocked back', 'Empurrado'], atosRoot: ['Rod of Atos', 'Rod of Atos'],
    alacrity: ['Alacrity', 'Alacrity'], burn: ['Burning', 'Queimando'], shivaAura: ['Shiva aura', 'Aura de Shiva'], icewall: ['Ice Wall', 'Ice Wall'], emp: ['E.M.P.', 'E.M.P.'] };
  for (const k in sts) D('status.' + k, sts[k][0], sts[k][1]);

  // ---- modes / presets
  D('mode.sandbox', 'Sandbox', 'Treino livre');
  D('mode.practice', 'Practice', 'Prática');
  D('mode.timed', 'Timed', 'Contra o tempo');
  D('mode.sandbox.d', 'Free play with dummies, DPS meter and cooldown refresh. Start combos from the list.', 'Jogo livre com alvos, medidor de DPS e reinício de recargas. Inicie combos pela lista.');
  D('mode.practice.d', 'Random combos from your loadout. Retry on failure. Learn at your pace.', 'Combos aleatórios da sua build. Repete ao falhar. Aprenda no seu ritmo.');
  D('mode.timed.d', 'Score as much as you can before the clock runs out ({secs} s).', 'Faça o máximo de pontos antes do tempo acabar ({secs} s).');
  D('preset.training', 'Training', 'Treino'); D('preset.standard', 'Standard', 'Padrão'); D('preset.expert', 'Expert', 'Expert');
  D('preset.training.d', 'Stands still', 'Fica parado'); D('preset.standard.d', 'Wanders around', 'Anda por aí'); D('preset.expert.d', 'Dodges spells', 'Desvia das magias');
  D('beh.stationary', 'stationary', 'parado'); D('beh.wander', 'wanders', 'anda'); D('beh.evasive', 'evasive', 'esquivo');

  // ---- title
  D('title.hint', 'Mouse + keyboard. Press Esc in game for the menu.', 'Mouse + teclado. Aperte Esc no jogo para o menu.');

  // ---- loadout
  D('lo.title', 'LOADOUT', 'BUILD');
  D('lo.hero', 'Hero', 'Herói');
  D('lo.level', 'Hero level', 'Nível do herói');
  D('lo.points', 'Skill points', 'Pontos de habilidade');
  D('lo.available', 'available', 'disponíveis');
  D('lo.spent', 'spent', 'gastos');
  D('lo.left', 'left', 'restantes');
  D('lo.orbs', 'Orbs', 'Orbes');
  D('lo.auto', 'Auto build', 'Build automática');
  D('lo.talents', 'Talents', 'Talentos');
  D('lo.talentPts', 'talent points {n}/{max}', 'pontos de talento {n}/{max}');
  D('lo.aghs', "Aghanim's", 'Aghanim');
  D('lo.scepterOrb', 'Scepter orb (+1 level)', 'Orbe do Scepter (+1 nível)');
  D('lo.items', 'Items', 'Itens');
  D('lo.dummy', 'Dummy', 'Alvo');
  D('lo.skin', 'Skin', 'Skin');
  D('lo.count', 'Dummies', 'Alvos');
  D('lo.mode', 'Mode', 'Modo');
  D('lo.grant', 'Grant missing items / Aghanim', 'Conceder itens / Aghanim faltantes');
  D('lo.fog', 'Fog of war', 'Névoa de guerra');
  D('lo.preview', 'Live stats', 'Estatísticas');
  D('lo.spells', 'Spell values', 'Valores das magias');
  D('lo.combosAvail', '{n} combos available', '{n} combos disponíveis');
  D('lo.noCombos', 'No combos playable with this loadout (learn more orbs).', 'Nenhum combo jogável com esta build (aprenda mais orbes).');
  D('lo.fix', 'Level lowered: allocation adjusted.', 'Nível reduzido: alocação ajustada.');
  D('lo.problems', 'Cannot start', 'Não é possível iniciar');
  D('lo.needsOrbs', 'needs {orbs}', 'precisa de {orbs}');
  D('lo.itemSlotN', 'Slot {n}', 'Espaço {n}');
  D('lo.itemsHint', 'Click an item to add or remove it.', 'Clique em um item para adicionar ou remover.');
  D('lo.talentSwap', 'Click to switch to this talent', 'Clique para trocar para este talento');
  D('lo.talentPick', 'Click to pick', 'Clique para escolher');
  D('lo.talentUnpick', 'Click to unpick', 'Clique para remover');
  D('lo.lvlN', 'Lv {n}', 'Nv {n}');

  D('tip.noPoints', 'No skill points left.', 'Sem pontos de habilidade restantes.');
  D('tip.gate', 'Orb level {n} needs hero level {lvl}.', 'Orbe nível {n} exige herói nível {lvl}.');
  D('tip.maxOrb', 'Orbs max out at level 8 (spent points).', 'Orbes chegam no máximo ao nível 8 (pontos gastos).');
  D('tip.minOrb', 'Already at 0.', 'Já está em 0.');
  D('tip.talentLvl', 'Needs hero level {lvl}.', 'Exige herói nível {lvl}.');
  D('tip.talentSecond', 'The other talent of this tier unlocks at level {lvl}.', 'O outro talento deste nível libera no nível {lvl}.');
  D('tip.scepterOrb', 'Aghanim\'s Scepter needs a chosen orb.', 'O Cetro de Aghanim exige um orbe escolhido.');
  D('tip.boots', 'Only one pair of boots.', 'Apenas um par de botas.');
  D('tip.itemsFull', 'All 6 slots are full.', 'Os 6 espaços estão cheios.');
  D('tip.autoQE', 'Quas / Exort first, Wex later', 'Quas / Exort primeiro, Wex depois');
  D('tip.autoQW', 'Quas / Wex first, Exort later', 'Quas / Wex primeiro, Exort depois');
  D('tip.keySlotsOnly', 'Item keys: see Settings', 'Teclas dos itens: veja Configurações');
  D('err.generic', 'Loadout invalid: {msg}', 'Build inválida: {msg}');
  D('err.scepter', "Pick the orb that gets the Scepter's +1 level.", 'Escolha o orbe que recebe +1 nível do Scepter.');

  D('stat.hp', 'Health', 'Vida'); D('stat.mana', 'Mana', 'Mana'); D('stat.hpRegen', 'HP regen', 'Regen. de vida');
  D('stat.manaRegen', 'Mana regen', 'Regen. de mana'); D('stat.armor', 'Armor', 'Armadura'); D('stat.magicRes', 'Magic resist', 'Resist. mágica');
  D('stat.damage', 'Damage', 'Dano'); D('stat.as', 'Attack speed', 'Vel. de ataque'); D('stat.ms', 'Move speed', 'Vel. de movimento');
  D('stat.invokeCd', 'Invoke cooldown', 'Recarga do Invocar'); D('stat.str', 'Strength', 'Força'); D('stat.agi', 'Agility', 'Agilidade'); D('stat.int', 'Intelligence', 'Inteligência');
  D('v.mana', 'mana', 'mana'); D('v.cd', 'CD', 'CD');
  D('v.duration', 'duration', 'duração'); D('v.freezeDmg', 'freeze dmg', 'dano congel.'); D('v.slow', 'slow', 'lentidão');
  D('v.dps', 'dmg/s', 'dano/s'); D('v.wallDur', 'wall', 'parede'); D('v.manaBurn', 'mana burn', 'mana queimada'); D('v.delay', 'delay', 'atraso');
  D('v.lift', 'lift', 'elevação'); D('v.dist', 'range', 'alcance'); D('v.dmg', 'damage', 'dano'); D('v.as', 'atk speed', 'vel. atq.'); D('v.bonusDmg', 'bonus dmg', 'dano extra');
  D('v.spirits', 'spirits', 'espíritos'); D('v.spiritHp', 'spirit HP', 'vida espírito'); D('v.spiritDmg', 'spirit dmg', 'dano espírito');
  D('v.burn', 'burn dps', 'queima/s'); D('v.main', 'impact', 'impacto'); D('v.land', 'lands in', 'cai em');
  D('v.aoe', 'AoE', 'Área'); D('v.stealth', 'cloak', 'invis.'); D('v.mr', 'move', 'mov.'); D('v.stun', 'stun', 'stun');

  // talents (id -> short text); tier/side comes from IT.RULES.talentTiers
  D('talent.special_bonus_unique_invoker_3', 'Tornado cooldown -5s', 'Recarga do Tornado -5s');
  D('talent.special_bonus_unique_invoker_ice_wall_dps', 'Ice Wall +50 damage per second', 'Ice Wall +50 de dano por segundo');
  D('talent.special_bonus_unique_invoker_9', 'Cold Snap cooldown -6s', 'Recarga do Cold Snap -6s');
  D('talent.special_bonus_unique_invoker_5', 'Alacrity +25 damage and attack speed', 'Alacrity +25 de dano e vel. de ataque');
  D('talent.special_bonus_unique_invoker_forged_spirit_armor_reduction', 'Forge Spirit +50% armor reduction', 'Forge Spirit +50% de redução de armadura');
  D('talent.special_bonus_unique_invoker_additional_chaos_meteors', 'Chaos Meteor +2 meteors', 'Chaos Meteor +2 meteoros');
  D('talent.special_bonus_unique_invoker_13', 'Doubles the active orb bonuses', 'Dobra os bônus dos orbes ativos');
  D('talent.special_bonus_unique_invoker_2', 'Deafening Blast also fires radially', 'Deafening Blast também dispara em círculo');

  // ---- HUD / combo
  D('hud.invokeCd', 'Invoke', 'Invocar');
  D('hud.score', 'SCORE', 'PONTOS');
  D('hud.streak', 'STREAK x{n}', 'SEQUÊNCIA x{n}');
  D('hud.time', 'TIME', 'TEMPO');
  D('hud.combo', 'COMBO', 'COMBO');
  D('hud.retry', 'retry {n}', 'tentativa {n}');
  D('hud.dps', 'DPS', 'DPS');
  D('hud.total', 'Total damage', 'Dano total');
  D('hud.refresh', 'Refresh', 'Reiniciar recargas');
  D('hud.spawn', 'Spawn dummy', 'Criar alvo');
  D('hud.resetDummies', 'Reset dummies', 'Reiniciar alvos');
  D('hud.combos', 'Combos', 'Combos');
  D('hud.skip', 'Skip', 'Pular');
  D('hud.noneYet', 'No combo running. Pick one from the list.', 'Nenhum combo em andamento. Escolha um da lista.');
  D('hud.locked', 'locked', 'bloqueado');
  D('hud.needs', 'needs: {x}', 'exige: {x}');
  D('hud.liveStats', 'LIVE STATS', 'ESTATÍSTICAS AO VIVO');
  D('hud.aimHint', 'Left click: cast   Right click / Esc: cancel   Shift: queue', 'Clique esq.: lançar   Clique dir. / Esc: cancelar   Shift: enfileirar');
  D('hud.cdNum', '{n}', '{n}');
  D('tier.basic', 'Basic', 'Básico'); D('tier.intermediate', 'Intermediate', 'Intermediário'); D('tier.advanced', 'Advanced', 'Avançado'); D('tier.items', 'Items', 'Itens');
  D('react.boltCancel', 'Cancel the stun bolt', 'Cancele o stun bolt'); D('react.boltBlocked', 'Block the stun bolt', 'Bloqueie o stun bolt');
  D('react.blinkPrevented', 'Stop the blink', 'Impeça o blink'); D('react.empPull', 'EMP pulls it', 'O EMP puxa o alvo');
  D('step.attackN', 'Attack x{n}', 'Ataque x{n}');
  D('step.self', 'self', 'em si');
  D('cheat.title', 'RECIPES', 'RECEITAS');
  D('cheat.hint', '{key} to close', '{key} para fechar');

  // ---- pause / end / stats
  D('pause.settings', 'Settings', 'Configurações');
  D('end.title', 'RUN OVER', 'FIM DA PARTIDA');
  D('end.score', 'Score', 'Pontos');
  D('end.combos', 'Combos done', 'Combos feitos');
  D('end.bestStreak', 'Best streak', 'Maior sequência');
  D('end.fails', 'Fails', 'Falhas');
  D('end.time', 'Time', 'Tempo');
  D('end.apm', 'Actions/min', 'Ações/min');
  D('end.accuracy', 'Accuracy per spell', 'Precisão por magia');
  D('end.casts', 'Casts', 'Lanç.'); D('end.hits', 'Hits', 'Acertos'); D('end.misses', 'Misses', 'Erros'); D('end.acc', 'Acc.', 'Prec.');
  D('end.dmgType', 'Damage by type', 'Dano por tipo');
  D('end.dealt', 'Dealt', 'Causado'); D('end.taken', 'Taken', 'Recebido');
  D('end.prevented', 'Damage prevented', 'Dano evitado');
  D('end.cc', 'Dummy CC uptime', 'Tempo de CC no alvo');
  D('end.blind', 'Blind hits', 'Acertos às cegas');
  D('end.bolts', 'Stun bolts', 'Stun bolts');
  D('end.boltsCountered', 'countered', 'contidos'); D('end.boltsBlocked', 'blocked (BKB)', 'bloqueados (BKB)'); D('end.boltsHit', 'hit you', 'te acertaram');
  D('end.blinks', 'Blinks', 'Blinks'); D('end.blinksPrev', 'prevented', 'impedidos');
  D('end.invoke', 'Invoke', 'Invocar'); D('end.invAvg', 'avg orb-to-invoke', 'média orbes até invocar'); D('end.invBest', 'best', 'melhor');
  D('end.noData', 'No data yet.', 'Sem dados ainda.');
  D('end.saved', 'Saved to lifetime stats.', 'Salvo nas estatísticas gerais.');
  D('dmg.physical', 'Physical', 'Físico'); D('dmg.magical', 'Magical', 'Mágico'); D('dmg.pure', 'Pure', 'Puro');
  D('stats.title', 'LIFETIME STATS', 'ESTATÍSTICAS GERAIS');
  D('stats.sessions', 'Sessions', 'Sessões');
  D('stats.bestTimes', 'Best combo times', 'Melhores tempos de combo');
  D('stats.byTier', 'Combos by tier', 'Combos por nível');

  // ---- settings
  D('set.title', 'SETTINGS', 'CONFIGURAÇÕES');
  D('set.castMode', 'Cast mode', 'Modo de lançamento');
  D('set.quick', 'Quick cast (at cursor)', 'Lançamento rápido (no cursor)');
  D('set.normal', 'Normal cast (key arms, click casts)', 'Lançamento normal (tecla mira, clique lança)');
  D('set.scheme', 'Key scheme', 'Esquema de teclas');
  D('set.slots', 'Slots (D / F = invoked slots)', 'Slots (D / F = magias invocadas)');
  D('set.legacy', 'Legacy (one key per spell)', 'Clássico (uma tecla por magia)');
  D('set.autoAttack', 'Auto attack', 'Ataque automático');
  D('set.camLock', 'Camera lock on hero', 'Câmera presa no herói');
  D('set.edgeScroll', 'Edge scroll', 'Rolagem pela borda');
  D('set.bloom', 'Bloom', 'Bloom');
  D('set.sound', 'Sound', 'Som');
  D('set.hints', 'Recipe hints', 'Dicas de receita');
  D('set.keys', 'Keys', 'Teclas');
  D('set.keysHint', 'Click a key, then press the new one. Esc cancels.', 'Clique em uma tecla e aperte a nova. Esc cancela.');
  D('set.conflict', 'Key conflicts: fix the highlighted keys.', 'Conflito de teclas: corrija as destacadas.');
  D('set.conflictSwitch', 'That scheme has key conflicts. Fix them first.', 'Esse esquema tem teclas em conflito. Corrija primeiro.');
  D('set.defaults', 'Defaults', 'Padrão');
  D('set.group.common', 'General', 'Geral');
  D('set.group.slots', 'Slots scheme', 'Esquema de slots');
  D('set.group.legacy', 'Legacy scheme', 'Esquema clássico');
  D('set.group.misc', 'Sandbox & camera', 'Sandbox e câmera');
  D('set.fixed', 'Fixed: Esc pause, Tab live stats, RMB move/attack, Shift queues.', 'Fixas: Esc pausa, Tab estatísticas, botão dir. move/ataca, Shift enfileira.');
  const act = {
    orbQ: 'Quas', orbW: 'Wex', orbE: 'Exort', invoke: 'Invoke', slot1: 'Spell slot 1', slot2: 'Spell slot 2',
    stop: 'Stop', hold: 'Hold position', center: 'Center camera', camLock: 'Toggle camera lock', cheat: 'Recipe sheet',
    refresh: 'Refresh cooldowns', spawn: 'Spawn dummy', resetDummies: 'Reset dummies',
  };
  const actPt = {
    orbQ: 'Quas', orbW: 'Wex', orbE: 'Exort', invoke: 'Invocar', slot1: 'Slot de magia 1', slot2: 'Slot de magia 2',
    stop: 'Parar', hold: 'Manter posição', center: 'Centralizar câmera', camLock: 'Alternar câmera presa', cheat: 'Folha de receitas',
    refresh: 'Reiniciar recargas', spawn: 'Criar alvo', resetDummies: 'Reiniciar alvos',
  };
  for (const k in act) D('act.' + k, act[k], actPt[k]);
  for (let i = 1; i <= 6; i++) D('act.item' + i, 'Item ' + i, 'Item ' + i);
  for (const k in spells) D('act.' + k, spells[k]);

  IT.I18N = { en, pt };
  // per-agent string packs: IT.i18nAdd({ en: {k: v}, pt: {k: v} }); pt falls back to en
  IT.i18nAdd = function (pack) {
    const e = (pack && pack.en) || {}, p = (pack && pack.pt) || {};
    for (const k in e) D(k, e[k], p[k]);
    for (const k in p) if (!(k in e)) pt[k] = p[k];
  };
  IT.lang = 'en';
  IT.langs = ['en', 'pt'];
  const listeners = [];
  IT.t = function (key, vars) {
    let s = IT.I18N[IT.lang][key];
    if (s == null) s = en[key];
    if (s == null) return key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return s;
  };
  IT.hasT = key => en[key] != null;
  IT.setLang = function (l) {
    if (!IT.I18N[l]) return;
    IT.lang = l;
    if (typeof document !== 'undefined') document.documentElement.lang = l === 'pt' ? 'pt-BR' : 'en';
    for (const f of listeners.slice()) { try { f(l); } catch (e) { /* ignore */ } }
  };
  IT.onLang = f => { listeners.push(f); };
})(typeof window !== 'undefined' ? window : globalThis);
