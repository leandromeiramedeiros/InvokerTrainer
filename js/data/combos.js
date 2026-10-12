// Combo catalogue (data only). Engine: js/sim/combo.js. See DECISIONS.md "Combos / stats".
// combo = { id, tier:'basic'|'intermediate'|'advanced'|'items', name:{en,pt}, tip:{en,pt} | tip(T)->{en,pt}, par (s), steps[], requires, scenario }
//   tip as a function receives the timing object T (IT.Combo.timing(ctx): lift, emp, ss, meteor... from the KV under the
//   player's orb levels), so numbers in the text follow the build. `c.tip` always reads as {en,pt} (default build);
//   IT.Combo.tipText(c, ctx, lang) is the build-aware text.
// step  = { type:'cast'|'item'|'attack'|'react'|'position'|'move', ability, mustHitDummy, targetVisibility:'any'|'visible'|'hidden',
//           at (T, env) -> { ref, fx, wait, early, late }: the cast window, in seconds after step `ref` (its cast, or its hit when fx),
//             derived from spell timings; slack is scaled by the tier (easy tiers forgive more). Too soon = 'early', too late = 'late'.
//             wait is the ideal delay (tip + bot); it can be negative (cast before the ref lands).
//           within (max s since the previous step; number or fn(T)) for steps without `at`, wait (static suggested delay),
//           group (consecutive steps sharing a group value may be done in any order),
//           itemOnDummy (item step: the item must hit the dummy; ihit() sets it), onSpirit (alacrity must target a forged spirit),
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
    const c = {
      id, tier, name, par, steps,
      requires: Object.assign({ orbs: orbsFor(spells), items: steps.filter(s => s.type === 'item').map(s => s.ability), scepter: false, shard: false }, extra.requires || {}),
      scenario: Object.assign({ dummyBehavior: 'stationary', stunBolt: false, dummyEscape: 'none', blinkAfter: 3 }, extra.scenario || {}),
    };
    if (typeof tip === 'function') {   // c.tip stays a plain {en,pt} for readers without a build (default loadout numbers)
      c.tipFn = tip;
      Object.defineProperty(c, 'tip', { enumerable: true, get() { return tip(IT.Combo.timing()); } });
    } else c.tip = tip;
    return c;
  }
  const L = (en, pt) => ({ en, pt });
  const fE = x => String(Math.round(x * 10) / 10);
  const fP = x => fE(x).replace('.', ',');
  const basicTip = (sp, en, pt) => L(`Orbs ${ORBS[sp].split('').join(' ')}, Invoke (R), then ${en}`, `Orbes ${ORBS[sp].split('').join(' ')}, Invocar (R) e ${pt}`);
  const basicTipFn = (sp, en, pt) => T => { const a = en(T), b = pt(T); return L(`Orbs ${ORBS[sp].split('').join(' ')}, Invoke (R), then ${a}`, `Orbes ${ORBS[sp].split('').join(' ')}, Invocar (R) e ${b}`); };

  // ------------------------------------------------------------ cast windows (seconds; see the step.at doc above)
  // NOM: nominal hero-dummy gap used by tips (the engine passes the real gap in env.dist).
  const NOM = 500, MARGIN = 0.1;   // MARGIN: aim a hair after the exact landing so the spell never lands on a still-lifted target
  const dist = env => (env && env.dist != null ? env.dist : NOM);
  const travel = (T, env) => dist(env) / T.blastSpeed + T.blastCast;   // Deafening Blast flight to the dummy
  const W = {
    // a spell whose delay is T[key] that must land as the Tornado drops the target (lifted units are untouchable); ref = the tornado step
    drop: (key, ref, o) => T => Object.assign({ ref, fx: true, wait: Math.max(0, T.lift - T[key] + MARGIN), early: 0.2, late: 0.6 }, o),
    // EMP after Tornado: detonates 'emp' s after the cast; must blow up on the landed target, soon after the landing
    emp: ref => T => { const w = T.lift - T.emp; return { ref, fx: true, wait: w, early: 0, late: Math.max(1.0, 0.6 - w) }; },
    // Blast after Tornado: must arrive when the target is down, but not long after
    blastDrop: (ref, prev) => (T, env) => { const w = Math.max(prev(T) + 0.25, T.lift - travel(T, env) + MARGIN); return { ref, fx: true, wait: w, early: 0.2, late: 0.8 }; },
    // spell with `delay` thrown inside a hold of `hold` s that starts at the ref's hit (root, hex): it must land before the hold ends
    hold: (hold, key, ref, o) => T => Object.assign({ ref, fx: true, wait: 0, early: 0, late: Math.max(0.3, T[hold] - (T[key] || 0)) }, o),
    blastHold: (hold, ref, prev) => (T, env) => { const tr = travel(T, env), w = Math.max(prev(T) + 0.25, T.meteor - tr + MARGIN); return { ref, fx: true, wait: w, early: 0.2, late: Math.max(0.3, T[hold] - tr - w) }; },
    // plain follow-up `wait` s after the ref's cast, with `late` s of slack
    after: (ref, wait, late, o) => () => Object.assign({ ref, wait, early: 0, late }, o),
  };
  const ssW = T => Math.max(0, T.lift - T.ss + MARGIN), metW = T => Math.max(0, T.lift - T.meteor + MARGIN), zero = () => 0;
  const tornadoBlast = W.blastDrop(0, metW);
  const afterHit = (T, w) => (w < 0.05 ? L('right as the Tornado hits', 'assim que o Tornado acertar') : L(`${fE(w)} s after the Tornado hits`, `${fP(w)} s após o Tornado acertar`));
  const metBlastW = T => Math.max(0.2, T.meteor - travel(T) + MARGIN);

  const COMBOS = [
    // ---------------------------------------------------------------- Basic: one spell, invoke + cast
    C('b_coldsnap', 'basic', L('Cold Snap', 'Cold Snap'), basicTip('coldsnap', 'cast it on the dummy.', 'lance no alvo.'), 7, [hit('coldsnap')]),
    C('b_ghostwalk', 'basic', L('Ghost Walk', 'Ghost Walk'), basicTip('ghostwalk', 'cast it (self).', 'use em você mesmo.'), 6, [cast('ghostwalk')]),
    C('b_icewall', 'basic', L('Ice Wall', 'Ice Wall'),
      basicTip('icewall', 'face the dummy from about 200 units away so the wall covers it.', 'fique de frente para o alvo a cerca de 200 de distância para a parede pegá-lo.'),
      8, [hit('icewall')]),
    C('b_emp', 'basic', L('EMP', 'EMP'),
      basicTipFn('emp', T => `cast it on the dummy; it detonates ${fE(T.emp)} s later.`, T => `lance no alvo; ele detona ${fP(T.emp)} s depois.`), 7, [hit('emp')]),
    C('b_tornado', 'basic', L('Tornado', 'Tornado'),
      basicTipFn('tornado', T => `cast it through the dummy; it lifts for ${fE(T.lift)} s at your Quas.`, T => `lance atravessando o alvo; ele fica no ar por ${fP(T.lift)} s com seu Quas.`), 7, [hit('tornado')]),
    C('b_alacrity', 'basic', L('Alacrity', 'Alacrity'), basicTip('alacrity', 'cast it on yourself.', 'use em você mesmo.'), 6, [cast('alacrity')]),
    C('b_sunstrike', 'basic', L('Sun Strike', 'Sun Strike'),
      basicTipFn('sunstrike', T => `click the dummy (global range, ${fE(T.ss)} s delay).`, T => `clique no alvo (alcance global, atraso de ${fP(T.ss)} s).`), 6, [hit('sunstrike')]),
    C('b_forgespirit', 'basic', L('Forge Spirit', 'Forge Spirit'), basicTip('forgespirit', 'summon the spirits.', 'invoque os espíritos.'), 6, [cast('forgespirit')]),
    C('b_chaosmeteor', 'basic', L('Chaos Meteor', 'Chaos Meteor'),
      basicTipFn('chaosmeteor', T => `drop it on the dummy; it lands after ${fE(T.meteor)} s.`, T => `lance sobre o alvo; ele cai após ${fP(T.meteor)} s.`), 7, [hit('chaosmeteor')]),
    C('b_deafeningblast', 'basic', L('Deafening Blast', 'Deafening Blast'), basicTip('deafeningblast', 'blast through the dummy.', 'lance atravessando o alvo.'), 7, [hit('deafeningblast')]),

    // ---------------------------------------------------------------- Intermediate
    C('i_tornado_emp', 'intermediate', L('Tornado → EMP', 'Tornado → EMP'),
      T => { const w = T.lift - T.emp, hi = Math.max(0, w + Math.max(1.0, 0.6 - w)); return L(
        `Lifted units are untouchable and EMP takes ${fE(T.emp)} s, longer than your ${fE(T.lift)} s lift: cast EMP right after the Tornado (at most ${fE(hi)} s after it hits) so it blows up just after the dummy lands.`,
        `Alvos no ar são intocáveis e o EMP demora ${fP(T.emp)} s, mais que seus ${fP(T.lift)} s de Tornado: lance o EMP logo após o Tornado (no máximo ${fP(hi)} s depois do acerto) para detonar logo depois de o alvo descer.`); },
      12, [hit('tornado'), hit('emp', { at: W.emp(0) })]),
    C('i_tornado_sunstrike', 'intermediate', L('Tornado → Sun Strike timing', 'Tornado → Sun Strike (tempo)'),
      T => { const a = afterHit(T, ssW(T)); return L(
        `Sun Strike cannot hit a lifted unit. Your Tornado lifts ${fE(T.lift)} s and the strike takes ${fE(T.ss)} s: cast it ${a.en} so it lands as the dummy comes down.`,
        `O Sun Strike não acerta alvos no ar. Seu Tornado ergue por ${fP(T.lift)} s e o raio demora ${fP(T.ss)} s: lance ${a.pt} para cair quando o alvo descer.`); },
      12, [hit('tornado'), hit('sunstrike', { at: W.drop('ss', 0) })]),
    C('i_emp_tornado', 'intermediate', L('EMP → Tornado', 'EMP → Tornado'),
      T => L(
        `EMP first, then Tornado from close range (under 500 units): the dummy must be back on the ground before the ${fE(T.emp)} s EMP goes off, because lifted units are untouchable. Your lift is ${fE(T.lift)} s, so cast the Tornado almost at once.`,
        `EMP primeiro, depois Tornado de perto (menos de 500 de distância): o alvo precisa estar no chão antes de o EMP de ${fP(T.emp)} s detonar, pois alvos no ar são intocáveis. Seu Tornado ergue ${fP(T.lift)} s, então lance quase na hora.`),
      14, [pos(0, 500), hit('emp'), hit('tornado', { at: (T, env) => ({ ref: 1, wait: 0, early: 0, late: Math.max(0.3, T.emp - T.lift - dist(env) / T.tornadoSpeed) }) })]),
    C('i_coldsnap_forge', 'intermediate', L('Cold Snap → Forge Spirit', 'Cold Snap → Forge Spirit'),
      L('Cold Snap re-freezes every time the target takes damage: let the spirits hit it 3 times.',
        'O Cold Snap congela de novo sempre que o alvo leva dano: deixe os espíritos acertarem 3 vezes.'),
      14, [hit('coldsnap'), cast('forgespirit', { at: W.after(0, 0.2, 1.5) }), attack(3, { within: T => T.csDur })]),
    C('i_coldsnap_alacrity', 'intermediate', L('Cold Snap + Alacrity attacks', 'Cold Snap + ataques com Alacrity'),
      L('Freeze it, Alacrity yourself, then auto-attack 4 times: each hit can re-trigger the freeze.',
        'Congele, use Alacrity em você e dê 4 ataques: cada golpe pode reativar o congelamento.'),
      14, [hit('coldsnap'), cast('alacrity', { at: W.after(0, 0.2, 1.5) }), attack(4, { within: T => T.csDur })]),
    C('i_icewall_emp', 'intermediate', L('Ice Wall → EMP', 'Ice Wall → EMP'),
      L('The wall slows the dummy so it cannot leave the EMP area: cast the EMP while it is still in the wall.',
        'A parede deixa o alvo lento, então ele não sai da área do EMP: lance o EMP enquanto ele ainda está na parede.'),
      13, [hit('icewall'), hit('emp', { at: W.after(0, 0.3, 2.0) })], { scenario: { dummyBehavior: 'wander' } }),
    C('i_bolt_cancel', 'intermediate', L('Interrupt the Stun Bolt', 'Interrompa o Stun Bolt'),
      L('The dummy winds up a stun bolt when you get close. Cold Snap it during the cast to cancel the bolt.',
        'O alvo prepara um stun bolt quando você chega perto. Use Cold Snap durante a conjuração para cancelar.'),
      12, [pos(0, 650), hit('coldsnap'), react('boltCancel', { within: 3 })], { scenario: { stunBolt: true } }),
    C('i_blind_sunstrike', 'intermediate', L('Blind Sun Strike', 'Sun Strike às cegas'),
      L('The dummy is out of vision. Use its last known position (ping) and Sun Strike it blind.',
        'O alvo está fora da visão. Use a última posição conhecida (ping) e lance o Sun Strike às cegas.'),
      9, [hit('sunstrike', { targetVisibility: 'hidden' })]),

    C('i_coldsnap_sunstrike', 'intermediate', L('Cold Snap → Sun Strike', 'Cold Snap → Sun Strike'),
      T => L(
        `Cold Snap marks the target for ${fE(T.csDur)} s and every hit on it re-stuns. Cast Sun Strike right away so its ${fE(T.ss)} s delay ends inside the mark and the beam adds a stun.`,
        `O Cold Snap marca o alvo por ${fP(T.csDur)} s e cada dano nele atordoa de novo. Lance o Sun Strike logo: o atraso de ${fP(T.ss)} s termina dentro da marca e o raio ainda atordoa.`),
      12, [hit('coldsnap'), hit('sunstrike', { at: T => ({ ref: 0, wait: 0.2, early: 0, late: Math.max(0.8, T.csDur - T.ss - 0.2) }) })]),
    C('i_icewall_meteor', 'intermediate', L('Ice Wall → Chaos Meteor', 'Ice Wall → Chaos Meteor'),
      T => L(`Slow it with the wall, then drop the Chaos Meteor on it: slowed targets cannot dodge the ${fE(T.meteor)} s fall.`,
        `Deixe-o lento com a parede e lance o Chaos Meteor: alvos lentos não escapam da queda de ${fP(T.meteor)} s.`),
      13, [hit('icewall'), hit('chaosmeteor', { at: W.after(0, 0.3, 2.0) })], { scenario: { dummyBehavior: 'wander' } }),
    C('i_forge_alacrity_burst', 'intermediate', L('Forge + Alacrity burst', 'Burst com Forge + Alacrity'),
      L('Spirits out and Alacrity on yourself in either order, then auto-attack 5 times: all damage lands in a few seconds.',
        'Espíritos e Alacrity em você, em qualquer ordem, e depois 5 ataques: todo o dano cai em poucos segundos.'),
      14, [cast('forgespirit', { group: 'burst' }), cast('alacrity', { group: 'burst' }), attack(5, { within: 8 })]),
    C('i_forge_alacrity_spirits', 'intermediate', L('Alacrity on the Forged Spirits', 'Alacrity nos Forged Spirits'),
      T => L(`Alacrity works on allies: summon the spirits, then click one of them with Alacrity (${fE(T.alacrity)} s) so it hits much faster, and let them attack 5 times.`,
        `O Alacrity funciona em aliados: invoque os espíritos e clique em um deles com Alacrity (${fP(T.alacrity)} s) para ele bater bem mais rápido; deixe atacarem 5 vezes.`),
      15, [cast('forgespirit'), cast('alacrity', { onSpirit: true, at: W.after(0, 0.2, 2.0) }), attack(5, { within: 8 })]),
    C('i_coldsnap_meteor', 'intermediate', L('Cold Snap → Chaos Meteor burst', 'Cold Snap → burst de Chaos Meteor'),
      T => L(
        `Cold Snap marks the target for ${fE(T.csDur)} s: the Meteor (${fE(T.meteor)} s fall) must land inside the mark so every burn tick re-freezes it. Cast it right after the snap.`,
        `O Cold Snap marca o alvo por ${fP(T.csDur)} s: o Meteor (queda de ${fP(T.meteor)} s) precisa cair dentro da marca para cada tick de queimadura congelar de novo. Lance logo após o snap.`),
      13, [hit('coldsnap'), hit('chaosmeteor', { at: T => ({ ref: 0, wait: 0.2, early: 0, late: Math.max(0.8, T.csDur - T.meteor - 0.2) }) })]),
    C('i_ghost_approach', 'intermediate', L('Ghost Walk → close in → Cold Snap', 'Ghost Walk → aproximar → Cold Snap'),
      L('Ghost Walk, walk toward the dummy about 300 units, then Cold Snap it before the invisibility ends.',
        'Ghost Walk, ande uns 300 em direção ao alvo e use Cold Snap antes de a invisibilidade acabar.'),
      14, [cast('ghostwalk'), move(300, 'toward', { within: 6 }), hit('coldsnap', { within: 6 })]),
    C('i_icewall_position', 'intermediate', L('Ice Wall: set up the distance', 'Ice Wall: ajuste a distância'),
      L('The wall only covers the dummy from 150 to 260 units away: step into range, then Ice Wall and EMP.',
        'A parede só cobre o alvo entre 150 e 260 de distância: entre no alcance, use Ice Wall e depois EMP.'),
      14, [pos(150, 260), hit('icewall', { within: 6 }), hit('emp', { at: W.after(1, 0.3, 2.0) })]),
    C('i_sunstrike_chain', 'intermediate', L('Sun Strike → Cold Snap on landing', 'Sun Strike → Cold Snap ao cair'),
      T => L(
        `Sun Strike lands ${fE(T.ss)} s after the cast. Cold Snap stuns for ${fE(T.csFreeze)} s, so cast it about ${fE(T.ss - T.csFreeze)} s after the Sun Strike: the freeze then holds the target in the beam.`,
        `O Sun Strike cai ${fP(T.ss)} s após o lançamento. O Cold Snap atordoa por ${fP(T.csFreeze)} s, então lance-o cerca de ${fP(T.ss - T.csFreeze)} s depois do Sun Strike: o congelamento segura o alvo no raio.`),
      12, [hit('sunstrike'), hit('coldsnap', { at: T => ({ ref: 0, wait: T.ss - T.csFreeze, early: 0.3, late: 0.3 }) })]),

    // ---------------------------------------------------------------- Advanced
    C('a_tornado_meteor_blast', 'advanced', L('Tornado → Chaos Meteor → Deafening Blast', 'Tornado → Chaos Meteor → Deafening Blast'),
      T => { const a = afterHit(T, metW(T)); return L(
        `The Meteor lands ${fE(T.meteor)} s after the cast and your Tornado lifts ${fE(T.lift)} s: cast it ${a.en}, then send the Deafening Blast so it arrives as the dummy is down.`,
        `O meteoro cai ${fP(T.meteor)} s após o lançamento e seu Tornado ergue ${fP(T.lift)} s: lance ${a.pt} e mande o Deafening Blast para chegar quando o alvo estiver no chão.`); },
      18, [hit('tornado'), hit('chaosmeteor', { at: W.drop('meteor', 0) }), hit('deafeningblast', { at: tornadoBlast })]),
    C('a_tornado_sunstrike_meteor', 'advanced', L('Tornado → Sun Strike + Chaos Meteor', 'Tornado → Sun Strike + Chaos Meteor'),
      T => L(
        `Lift it, then land both on the touchdown: Sun Strike ${fE(ssW(T))} s and Chaos Meteor ${fE(metW(T))} s after the Tornado hits (${fE(T.lift)} s lift, ${fE(T.ss)} s and ${fE(T.meteor)} s delays).`,
        `Erga o alvo e faça os dois cairem na aterrissagem: Sun Strike ${fP(ssW(T))} s e Chaos Meteor ${fP(metW(T))} s após o Tornado acertar (Tornado de ${fP(T.lift)} s, atrasos de ${fP(T.ss)} s e ${fP(T.meteor)} s).`),
      18, [hit('tornado'), hit('sunstrike', { at: W.drop('ss', 0) }), hit('chaosmeteor', { at: W.drop('meteor', 0) })]),

    C('a_meteor_blast', 'advanced', L('Chaos Meteor → Deafening Blast', 'Chaos Meteor → Deafening Blast'),
      L('Time the Blast to arrive just as the Meteor lands: the knockback and disarm then land in the burn, so keep it short.',
        'Calcule o Blast para chegar quando o Meteor cair: o empurrão e o desarme pegam o alvo na queimadura, então seja rápido.'),
      14, [hit('chaosmeteor'), hit('deafeningblast', { at: (T, env) => ({ ref: 0, wait: Math.max(0.2, T.meteor - travel(T, env) + MARGIN), early: 0.4, late: 1.0 }) })]),
    C('a_blast_push_meteor', 'advanced', L('Deafening Blast → push into the Meteor path', 'Deafening Blast → empurrar para o Meteor'),
      T => L(
        `Blast first: its knockback shoves the target along the line you fired. Cast the Meteor along that same line right after, so it falls ${fE(T.meteor)} s later and rolls over the spot the target was pushed to.`,
        `Blast primeiro: o empurrão leva o alvo ao longo da linha do disparo. Lance o Meteor nessa mesma linha logo depois, para cair ${fP(T.meteor)} s depois e rolar sobre o ponto para onde o alvo foi empurrado.`),
      16, [hit('deafeningblast'), hit('chaosmeteor', { at: W.after(0, 0.3, 1.2, { early: 0.3 }) })]),
    C('a_coldsnap_sun_meteor', 'advanced', L('Cold Snap → Sun Strike + Chaos Meteor', 'Cold Snap → Sun Strike + Chaos Meteor'),
      T => L(
        `Stun chain: Cold Snap, then Sun Strike, then the Meteor ${fE(T.ss - T.meteor)} s later so both land together (${fE(T.ss)} s and ${fE(T.meteor)} s delays). Mana heavy, so plan the order.`,
        `Cadeia de stun: Cold Snap, Sun Strike e o Meteor ${fP(T.ss - T.meteor)} s depois para cairem juntos (atrasos de ${fP(T.ss)} s e ${fP(T.meteor)} s). Gasta muita mana, planeje a ordem.`),
      18, [hit('coldsnap'), hit('sunstrike', { at: W.after(0, 0.2, 0.8) }), hit('chaosmeteor', { at: T => ({ ref: 0, wait: 0.2 + T.ss - T.meteor, early: 0.3, late: 0.6 }) })]),
    C('a_tornado_emp_meteor_blast', 'advanced', L('Tornado → EMP → Meteor → Blast', 'Tornado → EMP → Meteor → Blast'),
      T => L(
        `The full lock-down: lift it, EMP right away (${fE(T.emp)} s fuse), Meteor ${fE(metW(T))} s after the hit (${fE(T.meteor)} s fall) and the Blast so it arrives as the dummy lands (${fE(T.lift)} s lift).`,
        `O combo completo: erga o alvo, EMP na hora (pavio de ${fP(T.emp)} s), Meteor ${fP(metW(T))} s após o acerto e o Blast para chegar quando o alvo cair (Tornado de ${fP(T.lift)} s).`),
      22, [hit('tornado'), hit('emp', { at: W.emp(0) }), hit('chaosmeteor', { at: W.drop('meteor', 0) }), hit('deafeningblast', { at: tornadoBlast })]),
    C('a_tornado_emp_sun_meteor_blast', 'advanced', L('Tornado → EMP → Sun Strike → Meteor → Blast', 'Tornado → EMP → Sun Strike → Meteor → Blast'),
      T => L(
        `The five-spell lock: Tornado, EMP at once, Sun Strike ${fE(ssW(T))} s, Meteor ${fE(metW(T))} s and the Blast ${fE(tornadoBlast(T).wait)} s after the Tornado hits, so everything lands as the dummy comes down (${fE(T.lift)} s lift). Invoke the next spell while the last one flies.`,
        `O lock de cinco magias: Tornado, EMP na hora, Sun Strike ${fP(ssW(T))} s, Meteor ${fP(metW(T))} s e Blast ${fP(tornadoBlast(T).wait)} s após o Tornado acertar, tudo caindo quando o alvo descer (Tornado de ${fP(T.lift)} s). Invoque a próxima magia enquanto a anterior voa.`),
      28, [hit('tornado'), hit('emp', { at: W.emp(0) }), hit('sunstrike', { at: W.drop('ss', 0) }), hit('chaosmeteor', { at: W.drop('meteor', 0) }), hit('deafeningblast', { at: tornadoBlast })]),
    C('a_icewall_emp_meteor', 'advanced', L('Ice Wall → EMP → Meteor', 'Ice Wall → EMP → Meteor'),
      T => L(
        `Slow, drain, burn: the wall keeps it inside the EMP, and the Meteor goes ${fE(T.emp - T.meteor)} s after the EMP so it lands as the EMP goes off (${fE(T.emp)} s and ${fE(T.meteor)} s delays).`,
        `Lentidão, dreno e queima: a parede mantém o alvo no EMP e o Meteor sai ${fP(T.emp - T.meteor)} s após o EMP para cair quando ele detonar (atrasos de ${fP(T.emp)} s e ${fP(T.meteor)} s).`),
      20, [hit('icewall'), hit('emp', { at: W.after(0, 0.3, 1.0) }), hit('chaosmeteor', { at: T => ({ ref: 1, wait: T.emp - T.meteor, early: 0.6, late: 0.7 }) })], { scenario: { dummyBehavior: 'wander' } }),

    // ---------------------------------------------------------------- Items / Aghanim
    C('t_atos_sunstrike', 'items', L('Rod of Atos → Sun Strike', 'Rod of Atos → Sun Strike'),
      T => L(`A walking dummy dodges Sun Strike. Root it with the Rod of Atos (${fE(T.atos)} s), then cast the Sun Strike at once: its ${fE(T.ss)} s delay must end before the root does.`,
        `Um alvo que anda desvia do Sun Strike. Prenda-o com o Rod of Atos (${fP(T.atos)} s) e lance o Sun Strike na hora: o atraso de ${fP(T.ss)} s precisa acabar antes de a prisão acabar.`),
      12, [ihit('atos'), hit('sunstrike', { at: W.hold('atos', 'ss', 0) })], { scenario: { dummyBehavior: 'wander' } }),
    C('t_vyse_meteor_blast', 'items', L('Scythe of Vyse → Chaos Meteor → Deafening Blast', 'Scythe of Vyse → Chaos Meteor → Deafening Blast'),
      T => L(`Hex the target (${fE(T.vyse)} s), then Chaos Meteor and Deafening Blast so both land while it is still a sheep.`,
        `Transforme o alvo em ovelha (${fP(T.vyse)} s) e use Chaos Meteor e Deafening Blast para os dois caírem enquanto ele ainda é ovelha.`),
      15, [ihit('vyse'), hit('chaosmeteor', { at: W.hold('vyse', 'meteor', 0) }), hit('deafeningblast', { at: W.blastHold('vyse', 0, zero) })]),
    C('t_refresher_double', 'items', L('Refresher: double Meteor + Blast', 'Refresher: Meteor + Blast em dobro'),
      L('Chaos Meteor, Deafening Blast, Refresher, then do it all again.',
        'Chaos Meteor, Deafening Blast, Refresher e repita tudo.'),
      24, [hit('chaosmeteor'), hit('deafeningblast', { at: (T, env) => ({ ref: 0, wait: metBlastW(T), early: 0.4, late: 1.0 }) }),
        item('refresher', { at: W.after(1, 0.3, 2.0, { early: 0.3 }) }),
        hit('chaosmeteor', { at: W.after(2, 0.2, 2.0, { early: 0.2 }) }),
        hit('deafeningblast', { at: (T, env) => ({ ref: 3, wait: metBlastW(T), early: 0.4, late: 1.0 }) })]),
    C('t_refresher_full', 'items', L('Refresher: the full Tornado combo', 'Refresher: o combo completo com Tornado'),
      T => L(
        `The pro line: Tornado, EMP, Meteor (${fE(metW(T))} s after the hit), Blast, then Refresher and fire the Meteor and Blast again from the slots they are still in. Your ${fE(T.lift)} s lift sets the timings.`,
        `A linha dos pros: Tornado, EMP, Meteor (${fP(metW(T))} s após o acerto), Blast, depois Refresher e dispare Meteor e Blast de novo, pois ainda estão nos slots. Seu Tornado de ${fP(T.lift)} s define os tempos.`),
      32, [hit('tornado'), hit('emp', { at: W.emp(0) }), hit('chaosmeteor', { at: W.drop('meteor', 0) }), hit('deafeningblast', { at: tornadoBlast }),
        item('refresher', { at: W.after(3, 0.3, 2.0, { early: 0.3 }) }),
        hit('chaosmeteor', { at: W.after(4, 0.2, 2.0, { early: 0.2 }) }),
        hit('deafeningblast', { at: (T, env) => ({ ref: 5, wait: metBlastW(T), early: 0.4, late: 1.0 }) })]),
    C('t_hammer_emp', 'items', L('EMP + Meteor Hammer', 'EMP + Meteor Hammer'),
      T => { const lo = Math.max(0, T.emp - T.hammerChannel - T.hammerStun), hi = T.emp - T.hammerChannel; return L(
        `EMP fuse ${fE(T.emp)} s, hammer channel ${fE(T.hammerChannel)} s and stun ${fE(T.hammerStun)} s: start the hammer ${fE(lo)}-${fE(hi)} s after the EMP so the stun is still on when it detonates.`,
        `Pavio do EMP ${fP(T.emp)} s, canal do martelo ${fP(T.hammerChannel)} s e stun ${fP(T.hammerStun)} s: comece o martelo ${fP(lo)}-${fP(hi)} s após o EMP para o stun ainda valer quando ele detonar.`); },
      14, [hit('emp'), ihit('meteorhammer', { at: T => {
        const lo = Math.max(0, T.emp - T.hammerChannel - T.hammerStun), hi = T.emp - T.hammerChannel, mid = (lo + hi) / 2;
        return { ref: 0, wait: mid, early: mid - lo, late: hi - mid };
      } })]),
    C('t_hammer_blast', 'items', L('Meteor Hammer → Deafening Blast', 'Meteor Hammer → Deafening Blast'),
      T => L(`Channel the hammer, queue Deafening Blast with Shift so it fires the instant the channel ends: it must reach the target inside the ${fE(T.hammerStun)} s stun.`,
        `Canalize o martelo e enfileire o Deafening Blast com Shift para sair no instante em que o canal acaba: ele precisa chegar ao alvo dentro do stun de ${fP(T.hammerStun)} s.`),
      15, [ihit('meteorhammer'), hit('deafeningblast', { at: (T, env) => ({ ref: 0, fx: true, wait: 0, early: 0, late: Math.max(0.3, T.hammerStun - travel(T, env) - 0.1) }) })]),
    C('t_bkb_bolt', 'items', L('BKB vs Stun Bolt', 'BKB contra Stun Bolt'),
      L('Pop BKB before the bolt lands: the stun is blocked.',
        'Ative o BKB antes de o bolt acertar: o stun é bloqueado.'),
      12, [item('bkb'), react('boltBlocked')], { scenario: { stunBolt: true } }),
    C('t_atos_blink', 'items', L('Rod of Atos stops the Blink', 'Rod of Atos impede o Blink'),
      L('The dummy is about to blink away. Root it with the Rod of Atos before it does, then Cold Snap it.',
        'O alvo vai dar blink. Prenda-o com o Rod of Atos antes e acerte um Cold Snap.'),
      12, [ihit('atos'), react('blinkPrevented', { within: 3 }), hit('coldsnap', { at: T => ({ ref: 0, fx: true, wait: 0.1, early: 0, late: Math.max(0.5, T.atos - 0.3) }) })],
      { scenario: { dummyEscape: 'blink_after_seconds', blinkAfter: 0.9 } }),
    C('t_blink_tornado_emp', 'items', L('Blink → Tornado → EMP', 'Blink → Tornado → EMP'),
      L('Blink in on the dummy, Tornado it, then EMP right after: it must go off just after the dummy lands.',
        'Dê Blink no alvo, lance o Tornado e depois o EMP logo em seguida: ele precisa detonar logo depois de o alvo descer.'),
      16, [item('blink'), hit('tornado', { at: W.after(0, 0.1, 1.5, { early: 0.1 }) }), hit('emp', { at: W.emp(1) })]),
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
      T => L(`Silence it with Orchid (${fE(T.orchid)} s): damage it takes is stored and bursts when the silence ends. Pour in Cold Snap, then spirits and Alacrity in either order.`,
        `Silencie com o Orchid (${fP(T.orchid)} s): o dano recebido é guardado e explode quando o silêncio acaba. Despeje Cold Snap e depois espíritos e Alacrity, em qualquer ordem.`),
      18, [ihit('orchid'), hit('coldsnap', { at: W.after(0, 0.2, 1.5, { fx: true }) }),
        cast('forgespirit', { group: 'pour', at: W.after(1, 0.2, 2.0) }), cast('alacrity', { group: 'pour', at: W.after(1, 0.2, 2.0) })]),
    C('t_gleipnir_burst', 'items', L('Gleipnir → Sun Strike + Meteor + Blast', 'Gleipnir → Sun Strike + Meteor + Blast'),
      T => L(`Eternal Chains root the target for ${fE(T.gleipnir)} s: Sun Strike and Meteor (either order) must both land before it ends, then the Blast.`,
        `As Eternal Chains prendem o alvo por ${fP(T.gleipnir)} s: Sun Strike e Meteor (em qualquer ordem) precisam cair antes de acabar, e depois o Blast.`),
      20, [ihit('gleipnir'), hit('sunstrike', { group: 'chains', at: W.hold('gleipnir', 'ss', 0) }), hit('chaosmeteor', { group: 'chains', at: W.hold('gleipnir', 'meteor', 0) }),
        hit('deafeningblast', { at: W.blastHold('gleipnir', 0, zero) })],
      { scenario: { dummyBehavior: 'wander' } }),
    C('t_atos_meteor_blast', 'items', L('Rod of Atos → Meteor → Blast', 'Rod of Atos → Meteor → Blast'),
      L('Root first, then Chaos Meteor and Deafening Blast inside the root: a rooted target cannot walk out of the line.',
        'Prenda primeiro, depois Chaos Meteor e Deafening Blast dentro da prisão: um alvo preso não sai da linha.'),
      16, [ihit('atos'), hit('chaosmeteor', { at: W.hold('atos', 'meteor', 0) }), hit('deafeningblast', { at: W.blastHold('atos', 0, zero) })], { scenario: { dummyBehavior: 'wander' } }),
    C('t_blink_meteor_blast', 'items', L('Blink → Meteor → Blast', 'Blink → Meteor → Blast'),
      L('Blink in from out of range, then Chaos Meteor and Deafening Blast before it reacts.',
        'Dê Blink de fora do alcance, depois Chaos Meteor e Deafening Blast antes de ele reagir.'),
      16, [item('blink'), hit('chaosmeteor', { at: W.after(0, 0.1, 1.5, { early: 0.1 }) }),
        hit('deafeningblast', { at: (T, env) => ({ ref: 1, wait: metBlastW(T), early: 0.4, late: 1.0 }) })]),
  ];

  // Tier base points rise with difficulty: items (the hardest: timing + an item) pays more than advanced.
  COMBOS.TIER_BASE = { basic: 100, intermediate: 250, advanced: 500, items: 750 };
  COMBOS.TIERS = ['basic', 'intermediate', 'advanced', 'items'];
  IT.COMBOS = COMBOS;
})(typeof window !== 'undefined' ? window : globalThis);
