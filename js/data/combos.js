// Combo catalogue (data only). Engine: js/sim/combo.js. See DECISIONS.md "Combos / stats".
// combo = { id, tier:'basic'|'intermediate'|'advanced'|'items', name:{en,pt}, tip:{en,pt}, par (s), steps[], requires, scenario }
// step  = { type:'cast'|'item'|'attack'|'react'|'position'|'move', ability, mustHitDummy, targetVisibility:'any'|'visible'|'hidden',
//           within (max s since previous step), wait (suggested s since previous step: tip/bot only),
//           itemOnDummy (item step: the item must hit the dummy; ihit() sets it),
//           position: { minDist, maxDist } hero-dummy gap (units) must be inside; move: { dist (def 150), dir:'away'|'toward' } hero walks that far,
//           count (attack hits), selfCast (cast on the hero), react:'boltCancel'|'boltBlocked'|'blinkPrevented'|'empPull' }
// requires = { orbs:{quas,wex,exort} effective-level mins, items:[ids], scepter, shard }
// scenario = { dummyBehavior:'stationary'|'wander'|'evasive', stunBolt, dummyEscape:'none'|'blink_on_first_hit'|'blink_after_seconds', blinkAfter }
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const ORBS = (IT.GAME && IT.GAME.SPELL_ORBS) || {};
  const KEY = { Q: 'quas', W: 'wex', E: 'exort' };

  // minimal orb levels implied by the spells used (1 per orb in the recipe)
  function orbsFor(spells) {
    const o = { quas: 0, wex: 0, exort: 0 };
    for (const s of spells) for (const ch of (ORBS[s] || '')) o[KEY[ch]] = Math.max(o[KEY[ch]], 1);
    return o;
  }
  const cast = (ability, o) => Object.assign({ type: 'cast', ability, mustHitDummy: false, targetVisibility: 'any' }, o || {});
  const hit = (ability, o) => cast(ability, Object.assign({ mustHitDummy: true }, o || {}));
  const item = (ability, o) => Object.assign({ type: 'item', ability, mustHitDummy: false, targetVisibility: 'any' }, o || {});
  const ihit = (ability, o) => item(ability, Object.assign({ mustHitDummy: true, itemOnDummy: true }, o || {}));
  const pos = (minDist, maxDist, o) => Object.assign({ type: 'position', ability: null, minDist, maxDist, mustHitDummy: false, targetVisibility: 'any' }, o || {});
  const move = (dist, dir, o) => Object.assign({ type: 'move', ability: null, dist, dir, mustHitDummy: false, targetVisibility: 'any' }, o || {});
  const attack = (count, o) => Object.assign({ type: 'attack', ability: 'attack', count, mustHitDummy: false, targetVisibility: 'any' }, o || {});
  const react = (r, o) => Object.assign({ type: 'react', react: r, mustHitDummy: false, targetVisibility: 'any' }, o || {});
  const SPELL_ONLY = a => a.filter(s => ORBS[s]);
  function C(id, tier, name, tip, par, steps, extra) {
    extra = extra || {};
    const spells = SPELL_ONLY(steps.filter(s => s.type === 'cast').map(s => s.ability));
    return {
      id, tier, name, tip, par, steps,
      requires: Object.assign({ orbs: orbsFor(spells), items: steps.filter(s => s.type === 'item').map(s => s.ability), scepter: false, shard: false }, extra.requires || {}),
      scenario: Object.assign({ dummyBehavior: 'stationary', stunBolt: false, dummyEscape: 'none', blinkAfter: 3 }, extra.scenario || {}),
    };
  }
  const L = (en, pt) => ({ en, pt });
  const basicTip = (sp, en, pt) => L(`Orbs ${ORBS[sp].split('').join(' ')}, Invoke (R), then ${en}`, `Orbes ${ORBS[sp].split('').join(' ')}, Invocar (R) e ${pt}`);

  const COMBOS = [
    // ---------------------------------------------------------------- Basic: one spell, invoke + cast
    C('b_coldsnap', 'basic', L('Cold Snap', 'Cold Snap'), basicTip('coldsnap', 'cast it on the dummy.', 'lance no alvo.'), 7, [hit('coldsnap')]),
    C('b_ghostwalk', 'basic', L('Ghost Walk', 'Ghost Walk'), basicTip('ghostwalk', 'cast it (self).', 'use em você mesmo.'), 6, [cast('ghostwalk')]),
    C('b_icewall', 'basic', L('Ice Wall', 'Ice Wall'),
      basicTip('icewall', 'face the dummy from about 200 units away so the wall covers it.', 'fique de frente para o alvo a cerca de 200 de distância para a parede pegá-lo.'),
      8, [hit('icewall')]),
    C('b_emp', 'basic', L('EMP', 'EMP'), basicTip('emp', 'cast it on the dummy; it detonates after a delay.', 'lance no alvo; ele detona após um atraso.'), 7, [hit('emp')]),
    C('b_tornado', 'basic', L('Tornado', 'Tornado'), basicTip('tornado', 'cast it through the dummy.', 'lance atravessando o alvo.'), 7, [hit('tornado')]),
    C('b_alacrity', 'basic', L('Alacrity', 'Alacrity'), basicTip('alacrity', 'cast it on yourself.', 'use em você mesmo.'), 6, [cast('alacrity')]),
    C('b_sunstrike', 'basic', L('Sun Strike', 'Sun Strike'), basicTip('sunstrike', 'click the dummy (global range, 1.7 s delay).', 'clique no alvo (alcance global, atraso de 1,7 s).'), 6, [hit('sunstrike')]),
    C('b_forgespirit', 'basic', L('Forge Spirit', 'Forge Spirit'), basicTip('forgespirit', 'summon the spirits.', 'invoque os espíritos.'), 6, [cast('forgespirit')]),
    C('b_chaosmeteor', 'basic', L('Chaos Meteor', 'Chaos Meteor'), basicTip('chaosmeteor', 'drop it on the dummy; it lands after 1.3 s.', 'lance sobre o alvo; ele cai após 1,3 s.'), 7, [hit('chaosmeteor')]),
    C('b_deafeningblast', 'basic', L('Deafening Blast', 'Deafening Blast'), basicTip('deafeningblast', 'blast through the dummy.', 'lance atravessando o alvo.'), 7, [hit('deafeningblast')]),

    // ---------------------------------------------------------------- Intermediate
    C('i_tornado_emp', 'intermediate', L('Tornado → EMP', 'Tornado → EMP'),
      L('Tornado lifts the dummy and lifted units are untouchable: cast EMP right after, so it detonates as the dummy lands.',
        'O Tornado ergue o alvo e alvos no ar são intocáveis: lance o EMP logo depois, para detonar quando o alvo descer.'),
      12, [hit('tornado'), hit('emp', { within: 3, wait: 0.3 })]),
    C('i_tornado_sunstrike', 'intermediate', L('Tornado → Sun Strike timing', 'Tornado → Sun Strike (tempo)'),
      L('Sun Strike cannot hit a lifted unit. Wait about 1.3 s after Tornado so the 1.7 s delay ends as the dummy lands.',
        'O Sun Strike não acerta alvos no ar. Espere cerca de 1,3 s após o Tornado para o atraso de 1,7 s acabar quando o alvo descer.'),
      12, [hit('tornado'), hit('sunstrike', { within: 3, wait: 0.95 })]),
    C('i_coldsnap_forge', 'intermediate', L('Cold Snap → Forge Spirit', 'Cold Snap → Forge Spirit'),
      L('Cold Snap re-freezes every time the target takes damage: let the spirits hit it 3 times.',
        'O Cold Snap congela de novo sempre que o alvo leva dano: deixe os espíritos acertarem 3 vezes.'),
      14, [hit('coldsnap'), cast('forgespirit', { within: 4 }), attack(3, { within: 8 })]),
    C('i_coldsnap_alacrity', 'intermediate', L('Cold Snap + Alacrity attacks', 'Cold Snap + ataques com Alacrity'),
      L('Freeze it, Alacrity yourself, then auto-attack 4 times: each hit can re-trigger the freeze.',
        'Congele, use Alacrity em você e dê 4 ataques: cada golpe pode reativar o congelamento.'),
      14, [hit('coldsnap'), cast('alacrity', { within: 4 }), attack(4, { within: 8 })]),
    C('i_icewall_emp', 'intermediate', L('Ice Wall → EMP', 'Ice Wall → EMP'),
      L('The wall slows the dummy so it cannot leave the EMP area.',
        'A parede deixa o alvo lento, então ele não sai da área do EMP.'),
      13, [hit('icewall'), hit('emp', { within: 5, wait: 0.5 })], { scenario: { dummyBehavior: 'wander' } }),
    C('i_bolt_cancel', 'intermediate', L('Interrupt the Stun Bolt', 'Interrompa o Stun Bolt'),
      L('The dummy winds up a stun bolt when you get close. Cold Snap it during the cast to cancel the bolt.',
        'O alvo prepara um stun bolt quando você chega perto. Use Cold Snap durante a conjuração para cancelar.'),
      12, [hit('coldsnap'), react('boltCancel', { within: 3 })], { scenario: { stunBolt: true } }),
    C('i_blind_sunstrike', 'intermediate', L('Blind Sun Strike', 'Sun Strike às cegas'),
      L('The dummy is out of vision. Use its last known position (ping) and Sun Strike it blind.',
        'O alvo está fora da visão. Use a última posição conhecida (ping) e lance o Sun Strike às cegas.'),
      9, [hit('sunstrike', { targetVisibility: 'hidden' })]),

    C('i_coldsnap_sunstrike', 'intermediate', L('Cold Snap → Sun Strike', 'Cold Snap → Sun Strike'),
      L('Stun then setup: Cold Snap holds it while the 1.7 s Sun Strike charges, and every tick re-freezes.',
        'Stun e preparação: o Cold Snap segura o alvo enquanto o Sun Strike de 1,7 s carrega, e cada dano congela de novo.'),
      12, [hit('coldsnap'), hit('sunstrike', { within: 3, wait: 0.2 })]),
    C('i_icewall_meteor', 'intermediate', L('Ice Wall → Chaos Meteor', 'Ice Wall → Chaos Meteor'),
      L('Slow it with the wall, then drop the Chaos Meteor ahead of it: slowed targets cannot dodge the 1.3 s fall.',
        'Deixe-o lento com a parede e lance o Chaos Meteor: alvos lentos não escapam da queda de 1,3 s.'),
      13, [hit('icewall'), hit('chaosmeteor', { within: 4, wait: 0.4 })], { scenario: { dummyBehavior: 'wander' } }),
    C('i_forge_alacrity_burst', 'intermediate', L('Forge + Alacrity burst', 'Burst com Forge + Alacrity'),
      L('Spirits out, Alacrity on yourself, then auto-attack 5 times: all damage lands in a few seconds.',
        'Espíritos, Alacrity em você e 5 ataques: todo o dano cai em poucos segundos.'),
      14, [cast('forgespirit'), cast('alacrity', { within: 3 }), attack(5, { within: 8 })]),
    C('i_ghost_approach', 'intermediate', L('Ghost Walk → close in → Cold Snap', 'Ghost Walk → aproximar → Cold Snap'),
      L('Ghost Walk, walk toward the dummy about 300 units, then Cold Snap it before the invisibility ends.',
        'Ghost Walk, ande uns 300 em direção ao alvo e use Cold Snap antes de a invisibilidade acabar.'),
      14, [cast('ghostwalk'), move(300, 'toward', { within: 6 }), hit('coldsnap', { within: 6 })]),
    C('i_icewall_position', 'intermediate', L('Ice Wall: set up the distance', 'Ice Wall: ajuste a distância'),
      L('The wall only covers the dummy from 150 to 260 units away: step into range, then Ice Wall and EMP.',
        'A parede só cobre o alvo entre 150 e 260 de distância: entre no alcance, use Ice Wall e depois EMP.'),
      14, [pos(150, 260), hit('icewall', { within: 6 }), hit('emp', { within: 5, wait: 0.5 })]),
    C('i_sunstrike_chain', 'intermediate', L('Sun Strike → Cold Snap on landing', 'Sun Strike → Cold Snap ao cair'),
      L('Sun Strike has a 1.7 s delay: cast it first, then Cold Snap about a second later so the freeze holds the target in the beam.',
        'O Sun Strike demora 1,7 s: lance primeiro e use o Cold Snap cerca de 1 s depois para o congelamento segurar o alvo no raio.'),
      12, [hit('sunstrike'), hit('coldsnap', { within: 3, wait: 0.9 })]),

    // ---------------------------------------------------------------- Advanced
    C('a_tornado_meteor_blast', 'advanced', L('Tornado → Chaos Meteor → Deafening Blast', 'Tornado → Chaos Meteor → Deafening Blast'),
      L('Meteor lands 1.3 s after cast: time it for when the dummy comes down, then finish with Deafening Blast.',
        'O meteoro cai 1,3 s após o lançamento: calcule para quando o alvo descer e termine com o Deafening Blast.'),
      18, [hit('tornado'), hit('chaosmeteor', { within: 3, wait: 1.3 }), hit('deafeningblast', { within: 4, wait: 2 })]),
    C('a_tornado_sunstrike_meteor', 'advanced', L('Tornado → Sun Strike + Chaos Meteor', 'Tornado → Sun Strike + Chaos Meteor'),
      L('Lift it, then land Sun Strike and Chaos Meteor so both hit the moment it touches down.',
        'Erga o alvo e faça o Sun Strike e o Chaos Meteor acertarem no instante em que ele toca o chão.'),
      18, [hit('tornado'), hit('sunstrike', { within: 3, wait: 1.3 }), hit('chaosmeteor', { within: 3, wait: 0.3 })]),

    C('a_meteor_blast', 'advanced', L('Chaos Meteor → Deafening Blast', 'Chaos Meteor → Deafening Blast'),
      L('Fire the Blast right after the Meteor lands: the knockback pushes the target out of the burn so keep it short.',
        'Dispare o Blast logo depois de o Meteor cair: o empurrão tira o alvo da queimadura, então seja rápido.'),
      14, [hit('chaosmeteor'), hit('deafeningblast', { within: 4, wait: 1.4 })]),
    C('a_coldsnap_sun_meteor', 'advanced', L('Cold Snap → Sun Strike + Chaos Meteor', 'Cold Snap → Sun Strike + Chaos Meteor'),
      L('Stun chain: Cold Snap, then Sun Strike, then Meteor timed to land with it. Mana heavy, so plan the order.',
        'Cadeia de stun: Cold Snap, Sun Strike e Meteor calculado para cair junto. Gasta muita mana, planeje a ordem.'),
      18, [hit('coldsnap'), hit('sunstrike', { within: 3, wait: 0.2 }), hit('chaosmeteor', { within: 3, wait: 0.5 })]),
    C('a_tornado_emp_meteor_blast', 'advanced', L('Tornado → EMP → Meteor → Blast', 'Tornado → EMP → Meteor → Blast'),
      L('The full lock-down: lift it, EMP under it, then Meteor and Blast the moment it lands.',
        'O combo completo: erga o alvo, EMP embaixo, e Meteor e Blast no instante em que ele cai.'),
      22, [hit('tornado'), hit('emp', { within: 3, wait: 0.3 }), hit('chaosmeteor', { within: 4, wait: 1.1 }), hit('deafeningblast', { within: 4, wait: 1.5 })]),
    C('a_icewall_emp_meteor', 'advanced', L('Ice Wall → EMP → Meteor', 'Ice Wall → EMP → Meteor'),
      L('Slow, drain, burn: the wall keeps it inside the EMP while the Meteor lands.',
        'Lentidão, dreno e queima: a parede mantém o alvo no EMP enquanto o Meteor cai.'),
      20, [hit('icewall'), hit('emp', { within: 5, wait: 0.5 }), hit('chaosmeteor', { within: 4, wait: 0.8 })], { scenario: { dummyBehavior: 'wander' } }),

    // ---------------------------------------------------------------- Items / Aghanim
    C('t_atos_sunstrike', 'items', L('Rod of Atos → Sun Strike', 'Rod of Atos → Sun Strike'),
      L('A walking dummy dodges Sun Strike. Root it with the Rod of Atos first, then drop the Sun Strike on it.',
        'Um alvo que anda desvia do Sun Strike. Prenda-o com o Rod of Atos e então lance o Sun Strike.'),
      12, [ihit('atos'), hit('sunstrike', { within: 2, wait: 0.3 })], { scenario: { dummyBehavior: 'wander' } }),
    C('t_vyse_meteor_blast', 'items', L('Scythe of Vyse → Chaos Meteor → Deafening Blast', 'Scythe of Vyse → Chaos Meteor → Deafening Blast'),
      L('Hex the target, then Chaos Meteor and Deafening Blast while it cannot act.',
        'Transforme o alvo em ovelha e use Chaos Meteor e Deafening Blast enquanto ele não pode agir.'),
      15, [ihit('vyse'), hit('chaosmeteor', { within: 2, wait: 0.2 }), hit('deafeningblast', { within: 3, wait: 1.3 })]),
    C('t_refresher_double', 'items', L('Refresher: double Meteor + Blast', 'Refresher: Meteor + Blast em dobro'),
      L('Chaos Meteor, Deafening Blast, Refresher, then do it all again.',
        'Chaos Meteor, Deafening Blast, Refresher e repita tudo.'),
      24, [hit('chaosmeteor'), hit('deafeningblast', { within: 3, wait: 0.5 }), item('refresher', { within: 3, wait: 0.5 }),
        hit('chaosmeteor', { within: 3, wait: 0.3 }), hit('deafeningblast', { within: 3, wait: 0.5 })]),
    C('t_hammer_emp', 'items', L('EMP + Meteor Hammer', 'EMP + Meteor Hammer'),
      L('Start EMP first, then channel Meteor Hammer so its stun lands just before the EMP detonates.',
        'Comece pelo EMP e depois canalize o Meteor Hammer para o stun cair pouco antes do EMP detonar.'),
      14, [hit('emp'), ihit('meteorhammer', { within: 2, wait: 0.3 })]),
    C('t_hammer_blast', 'items', L('Meteor Hammer → Deafening Blast', 'Meteor Hammer → Deafening Blast'),
      L('Channel the hammer, queue Deafening Blast with Shift so it fires the instant the channel ends.',
        'Canalize o martelo e enfileire o Deafening Blast com Shift para sair no instante em que o canal acaba.'),
      15, [ihit('meteorhammer'), hit('deafeningblast', { within: 4 })]),
    C('t_bkb_bolt', 'items', L('BKB vs Stun Bolt', 'BKB contra Stun Bolt'),
      L('Pop BKB before the bolt lands: the stun is blocked.',
        'Ative o BKB antes de o bolt acertar: o stun é bloqueado.'),
      12, [item('bkb'), react('boltBlocked')], { scenario: { stunBolt: true } }),
    C('t_atos_blink', 'items', L('Rod of Atos stops the Blink', 'Rod of Atos impede o Blink'),
      L('The dummy is about to blink away. Root it with the Rod of Atos before it does, then Cold Snap it.',
        'O alvo vai dar blink. Prenda-o com o Rod of Atos antes e acerte um Cold Snap.'),
      12, [ihit('atos'), react('blinkPrevented', { within: 3 }), hit('coldsnap', { within: 3 })],
      { scenario: { dummyEscape: 'blink_after_seconds', blinkAfter: 0.9 } }),
    C('t_blink_tornado_emp', 'items', L('Blink → Tornado → EMP', 'Blink → Tornado → EMP'),
      L('Blink in on the dummy, Tornado it, then EMP as it comes down.',
        'Dê Blink no alvo, lance o Tornado e depois o EMP quando ele descer.'),
      16, [item('blink'), hit('tornado', { within: 4 }), hit('emp', { within: 3, wait: 0.3 })]),
    C('t_cataclysm', 'items', L('Aghanim: Cataclysm', 'Aghanim: Cataclysm'),
      L('With the scepter, cast Sun Strike on yourself: rain Sun Strikes on every visible enemy.',
        'Com o Scepter, lance o Sun Strike em você mesmo: chove Sun Strike em todos os inimigos visíveis.'),
      10, [hit('sunstrike', { selfCast: true, targetVisibility: 'visible' })], { requires: { scepter: true } }),
    C('t_shard_emp', 'items', L('Shard: EMP pull', 'Shard: EMP que puxa'),
      L('With the shard, EMP drags enemies to its center. Cast it off to one side of the dummy and watch it get pulled.',
        'Com o Shard, o EMP puxa os inimigos para o centro. Lance ao lado do alvo e veja ele ser puxado.'),
      10, [hit('emp'), react('empPull')], { requires: { shard: true } }),

    // ---------------------------------------------------------------- Items: Orchid / Gleipnir / Atos / Blink
    C('t_orchid_burst', 'items', L('Orchid → Cold Snap + Forge + Alacrity', 'Orchid → Cold Snap + Forge + Alacrity'),
      L('Silence it with Orchid: damage it takes is stored and bursts when the silence ends. Pour in Cold Snap, spirits and Alacrity attacks.',
        'Silencie com o Orchid: o dano recebido é guardado e explode quando o silêncio acaba. Despeje Cold Snap, espíritos e ataques com Alacrity.'),
      18, [ihit('orchid'), hit('coldsnap', { within: 3, wait: 0.2 }), cast('forgespirit', { within: 4 }), cast('alacrity', { within: 3 })]),
    C('t_gleipnir_burst', 'items', L('Gleipnir → Sun Strike + Meteor + Blast', 'Gleipnir → Sun Strike + Meteor + Blast'),
      L('Eternal Chains roots the target for a few seconds: line up Sun Strike, Meteor and Blast while it cannot move.',
        'As Eternal Chains prendem o alvo por alguns segundos: alinhe Sun Strike, Meteor e Blast enquanto ele não anda.'),
      20, [ihit('gleipnir'), hit('sunstrike', { within: 3, wait: 0.2 }), hit('chaosmeteor', { within: 3, wait: 0.4 }), hit('deafeningblast', { within: 4, wait: 1.3 })],
      { scenario: { dummyBehavior: 'wander' } }),
    C('t_atos_meteor_blast', 'items', L('Rod of Atos → Meteor → Blast', 'Rod of Atos → Meteor → Blast'),
      L('Root first, then Chaos Meteor and Deafening Blast: a rooted target cannot walk out of the line.',
        'Prenda primeiro, depois Chaos Meteor e Deafening Blast: um alvo preso não sai da linha.'),
      16, [ihit('atos'), hit('chaosmeteor', { within: 2, wait: 0.3 }), hit('deafeningblast', { within: 4, wait: 1.3 })], { scenario: { dummyBehavior: 'wander' } }),
    C('t_blink_meteor_blast', 'items', L('Blink → Meteor → Blast', 'Blink → Meteor → Blast'),
      L('Blink in from out of range, then Chaos Meteor and Deafening Blast before it reacts.',
        'Dê Blink de fora do alcance, depois Chaos Meteor e Deafening Blast antes de ele reagir.'),
      16, [item('blink'), hit('chaosmeteor', { within: 4 }), hit('deafeningblast', { within: 4, wait: 1.3 })]),
  ];

  COMBOS.TIER_BASE = { basic: 100, intermediate: 250, advanced: 500, items: 400 };
  COMBOS.TIERS = ['basic', 'intermediate', 'advanced', 'items'];
  IT.COMBOS = COMBOS;
})(typeof window !== 'undefined' ? window : globalThis);
