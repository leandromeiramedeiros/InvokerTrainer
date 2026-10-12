// FLAIR: what the dummies / enemies SAY. One editable TABLE: skin x situation x language. (v6 item 22)
// ======================================================================================================================
// HOW TO ADD A LINE
//   1. Find the character in RAW below (key = skin id: default, pedro, renan, vitinho, nando, raven, scarecrow).
//   2. Find (or add) the situation inside its `lines: { ... }` and append a tuple:
//          ['English text', 'Texto em portugues']                      plain line
//          ['English text', 'Texto em portugues', { w: 3 }]            w   = weight (default 1; 3 = picked 3x as often)
//          ['English text', 'Texto em portugues', { cd: 90 }]          cd  = this line can't repeat for 90 sim-seconds
//          ['', '', { icon: 'muted' }]                                 icon-only bubble (no text). Icons: muted, camera, monkey, star, goiaba
//          ['I was gonna invite you to—', 'Eu ia te chamar pra—']      a trailing "—" reads as "cut off" (mic muted mid-sentence)
//          ['Hey!', 'Ei!', { icon: 'camera' }]                         text WITH a little pixel icon in front of it
//   3. Both languages are REQUIRED (en AND pt). PT must keep the joke, not be a word-by-word translation. Keep it affectionate:
//      playful, never mean. A line must fit a bubble (about 70 characters max; 2.5 s on screen).
//
// SITUATIONS (the key under `lines`). The speaker is the on-screen enemy nearest to the hero unless noted.
//   spawn                the scenario goes live (scnGo)
//   idle                 ambient chatter while the scenario runs (rare, scaled by the skin's `chat`)
//   idleLong             no damage dealt for 6 s (the old "idle" taunt)
//   damaged              the speaker took damage from the hero
//   stunned              the speaker got stunned / hexed / frozen
//   hitBy:<id>           the speaker was hit by that spell or item. Spells: coldsnap tornado sunstrike chaosmeteor deafeningblast emp
//                        icewall alacrity forgespirit ghostwalk (icewall / alacrity / forgespirit / ghostwalk fire when the hero CASTS them
//                        with the speaker watching). Items: atos vyse shiva meteorhammer orchid gleipnir forcestaff dust.
//                        A hitBy:<id> with no lines falls back to `damaged`.
//   nearDeath            the speaker dropped under 20% HP (once per unit)
//   death                the speaker died (the bubble comes from the dead unit)
//   killedHero           the hero died
//   playerMissed         one of the hero's skillshots hit nothing
//   playerWhiffSunstrike the hero's Sun Strike hit nothing (wins over playerMissed)
//   heroInvisible        the hero went invisible (Ghost Walk / Shadow Blade)
//   night                night fell (or the scenario starts at night)
//   dustUsed             an enemy shouts as it throws Dust (speaker = the dusting enemy)
//   pitJuke              an enemy taunts as it blinks / dives for the pit juke (speaker = that enemy)
//   caught               the scenario failed because the hero got caught
//   escaped              the scenario failed because the foe got away
//   -- generic reactions (a character may leave these out: `fallback: 'default'` borrows the grunt's lines) --
//   playerFail playerNoMana playerCooldown playerWrong comboFail dodge heroLow praise
//
// PER-SKIN SETTINGS (next to `lines`):
//   cd       min sim-seconds between two bubbles of this skin (the "global cooldown")
//   chat     chattiness 0..1: the chance a reactive trigger actually speaks (ambient `idle` uses it x0.35)
//   lineCd   default seconds before the SAME line may be picked again (a line's own `cd` wins)
//   silent   true = never speaks (scarecrow)
//   fallback another skin whose lines fill situations this one has none for
//   Not here yet: 'ian' (CEO slot, no sprite, no skin, no lines).
//
// Picker: IT.DummyChat.pickFlair(skin, situation, { lang, rng, now, state }) (js/ui/dummychat.js). Unknown skin -> 'default'.
// ======================================================================================================================
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};

  const MUTE = ['', '', { icon: 'muted' }];   // a bubble that is only the muted-mic icon

  const RAW = {
    // DUMMY: the scarecrow never talks.
    scarecrow: { silent: true, cd: 99, chat: 0, lines: {} },

    // DUMMY (buyable later): the raven. A few wise one-liners, rarely.
    raven: {
      cd: 14, chat: 0.35, lineCd: 120, lines: {
        spawn: [
          ['The field is quiet. The quiet is a teacher.', 'O campo está quieto. O silêncio ensina.'],
          ['I have watched many wizards. You are one of them.', 'Já vi muitos magos. Você é um deles.'],
          ['Begin. Or do not. The crows will wait.', 'Comece. Ou não. Os corvos esperam.'],
          ['Every great combo starts with a small breath.', 'Todo grande combo começa com um respiro.'],
          ['Caw. Good luck.', 'Crá. Boa sorte.'],
        ],
        idle: [
          ['A still hand learns nothing. A moving one learns twice.', 'Mão parada não aprende. Mão em movimento aprende em dobro.'],
          ['The sun does not hurry, yet the day is done.', 'O sol não corre, e o dia termina.'],
          ['I eat what falls. Be careful what you drop.', 'Eu como o que cai. Cuidado com o que larga.'],
          ['Even fog is only water that forgot to fall.', 'Até a névoa é só água que esqueceu de cair.'],
        ],
        idleLong: [
          ['Hesitation is also a spell. A weak one.', 'Hesitar também é magia. Das fracas.'],
          ['The clock eats the patient and the hasty alike.', 'O relógio come o paciente e o apressado.'],
          ['Choose. The branch is not getting any sturdier.', 'Escolha. O galho não vai ficar mais firme.'],
        ],
        damaged: [
          ['A feather lost. A lesson gained.', 'Uma pena perdida. Uma lição ganha.'],
          ['Hm. That one I felt.', 'Hm. Essa eu senti.'],
          ['Pain is just news from the body.', 'Dor é só notícia do corpo.'],
        ],
        nearDeath: [
          ['Flight is also a skill.', 'Voar também é habilidade.'],
          ['The last feather is the proudest.', 'A última pena é a mais orgulhosa.'],
        ],
        death: [
          ['I return to the wind. Caw.', 'Volto ao vento. Crá.'],
          ['Do not mourn the raven. Mourn the aim.', 'Não chore pelo corvo. Chore pela mira.'],
        ],
        night: [
          ['Night is my hour. Nothing is hidden from me.', 'A noite é minha hora. Nada se esconde de mim.'],
          ['Dark outside, dark inside. Calm, still.', 'Escuro fora, escuro dentro. Calma, ainda.'],
        ],
        heroInvisible: [
          ['You vanish, but I hear the wings of your mana.', 'Você some, mas ouço as asas da sua mana.'],
          ['What cannot be seen can still be known.', 'O que não se vê ainda pode ser sabido.'],
        ],
        playerMissed: [
          ['The arrow forgives the target, never the archer.', 'A flecha perdoa o alvo, nunca o arqueiro.'],
          ['A miss is a map of where not to look.', 'Um erro é um mapa de onde não olhar.'],
        ],
        praise: [
          ['Well flown, wizard.', 'Bem voado, mago.'],
          ['Patience, then speed. That is the whole art.', 'Paciência, depois velocidade. Essa é toda a arte.'],
        ],
        comboFail: [
          ['The fall teaches the wing.', 'A queda ensina a asa.'],
          ['Again. The sky is not going anywhere.', 'De novo. O céu não vai a lugar nenhum.'],
        ],
      },
    },

    default: {
      // the bland hooded grunt: every line the old dummy chat had (js/data/i18n/s3.js dc.*, scn.js dc.juke.*), unchanged
      cd: 4, chat: 1, lineCd: 25, lines: {
        playerFail: [
          ['Was that supposed to do something?', 'Isso era pra fazer alguma coisa?'],
          ['Bold strategy. Let\'s see if it pays off.', 'Estratégia ousada. Vamos ver se funciona.'],
          ['Nothing happened. Impressive, really.', 'Nada aconteceu. Impressionante, de verdade.'],
          ['Try pressing the other button.', 'Tenta apertar o outro botão.'],
          ['Is your keyboard okay? Blink twice.', 'Será que o teclado está bom? Pisca duas vezes.'],
          ['That went well. For me.', 'Foi bem. Pra mim.'],
          ['Click the enemy. I\'m the enemy. Hi.', 'Clica no inimigo. O inimigo sou eu. Oi.'],
          ['Maybe read the tooltip first?', 'Quem sabe ler a descrição antes?'],
          ['I have seen creeps with better aim.', 'Já vi creep com mira melhor.'],
          ['Close! Not at all, but close.', 'Quase! Quer dizer, nem perto.'],
          ['Your spell is on a coffee break.', 'Sua magia saiu pra tomar um café.'],
          ['Skill issue detected.', 'Problema de habilidade detectado.'],
          ['I\'d clap but I\'m a dummy.', 'Eu aplaudiria, mas sou um boneco.'],
          ['Do you need a tutorial? There is one.', 'Precisa de tutorial? Tem um aí.'],
          ['Was that a spell or a sneeze?', 'Isso foi um feitiço ou um espirro?'],
          ['Trying something new? It is not working.', 'Tentando algo novo? Não está dando certo.']
        ],
        playerNoMana: [
          ['Out of mana? Buy a Clarity, friend.', 'Sem mana? Compra um Clarity, amigo.'],
          ['Your mana pool called. It is on vacation.', 'Sua mana ligou. Está de férias.'],
          ['Mana is a resource, not a suggestion.', 'Mana é recurso, não sugestão.'],
          ['Empty tank. Classic Invoker.', 'Tanque vazio. Clássico de Invoker.'],
          ['Exort does not refill mana, sadly.', 'Exort não recarrega mana, infelizmente.'],
          ['Maybe drink from a fountain?', 'Que tal beber na fonte?'],
          ['All that style and no mana.', 'Tanto estilo e nenhuma mana.'],
          ['Meditate a little. I\'ll wait.', 'Medita um pouquinho. Eu espero.'],
          ['Sipping from an empty glass, I see.', 'Bebendo de um copo vazio, né.'],
          ['Spam harder. It was working so well.', 'Spamma mais. Estava funcionando tão bem.'],
          ['Mana: 0. Confidence: still 100.', 'Mana: 0. Confiança: ainda 100.'],
          ['Have you tried not casting everything?', 'Já tentou não castar tudo de uma vez?'],
          ['The spell wants mana. The wallet wants Arcane Boots.', 'A magia quer mana. A carteira quer Arcane Boots.'],
          ['Out of gas at level 25. Wow.', 'Sem gás no nível 25. Uau.'],
          ['Pro tip: the blue bar is not decoration.', 'Dica: a barra azul não é decoração.'],
          ['Even my HP lasts longer.', 'Até a minha vida dura mais.']
        ],
        playerCooldown: [
          ['Cooldown, buddy. It is still cooling.', 'Recarga, amigo. Ainda está esfriando.'],
          ['Patience is a virtue. You have none.', 'Paciência é uma virtude. Você não tem.'],
          ['That spell is still on timeout.', 'Essa magia ainda está de castigo.'],
          ['Refresher exists for a reason.', 'Refresher existe por um motivo.'],
          ['The clock is ticking. Literally.', 'O relógio está correndo. Literalmente.'],
          ['Stop mashing, it won\'t come back faster.', 'Para de socar a tecla, ela não volta mais rápido.'],
          ['Cooldowns: the enemy of impatient wizards.', 'Recarga: a inimiga dos magos apressados.'],
          ['Still not ready. Check again in a bit.', 'Ainda não está pronta. Olha de novo daqui a pouco.'],
          ['Did you expect a different result?', 'Esperava um resultado diferente?'],
          ['Hammering the key does not shorten the timer.', 'Martelar a tecla não diminui o tempo.'],
          ['I can wait. I\'m a training dummy.', 'Eu espero. Sou um boneco de treino.'],
          ['The spell said no. Respect the spell.', 'A magia disse não. Respeite a magia.'],
          ['Count to five. Then try.', 'Conta até cinco. Depois tenta.'],
          ['Ever seen that little spinning clock on the icon?', 'Já viu aquele relógio girando no ícone?'],
          ['Invoke on cooldown? Bold of you.', 'Invocar em recarga? Ousado da sua parte.'],
          ['You are ringing the doorbell nonstop.', 'Você está tocando a campainha sem parar.']
        ],
        playerWrong: [
          ['Was that supposed to be a Sun Strike?', 'Isso era pra ser um Sun Strike?'],
          ['Wrong spell, wizard.', 'Magia errada, mago.'],
          ['That was not in the plan, was it?', 'Isso não estava no plano, estava?'],
          ['Quas Wex Exort... take your time, I\'ll wait.', 'Quas Wex Exort... sem pressa, eu espero.'],
          ['Interesting choice. Wrong, but interesting.', 'Escolha interessante. Errada, mas interessante.'],
          ['The combo is right there on your screen.', 'O combo está bem ali na sua tela.'],
          ['Did the orbs betray you?', 'Os orbes te traíram?'],
          ['I do not remember that being on the menu.', 'Não lembro disso estar no cardápio.'],
          ['Invoking random spells now? Fun.', 'Invocando magias aleatórias agora? Divertido.'],
          ['Pick a spell, any spell. Not that one.', 'Escolhe uma magia, qualquer uma. Menos essa.'],
          ['Cold Snap is not the answer here.', 'Cold Snap não é a resposta aqui.'],
          ['You invoked the wrong thing. Again.', 'Invocou a coisa errada. De novo.'],
          ['Improvising, I see. The enemy approves.', 'Improvisando, é? O inimigo aprova.'],
          ['Ten spells and you chose that one.', 'Dez magias e você escolheu essa.'],
          ['Somewhere, Carl is crying.', 'Em algum lugar, o Carl está chorando.'],
          ['Read the recipe. Then read it again.', 'Leia a receita. Depois leia de novo.']
        ],
        playerMissed: [
          ['Missed me! Did you aim with your eyes closed?', 'Errou! Mirou de olhos fechados?'],
          ['The beam landed. Just not on me.', 'O raio caiu. Só não em mim.'],
          ['A swing and a miss!', 'Girou e errou!'],
          ['Nice fireworks. Wrong place.', 'Belos fogos de artifício. Lugar errado.'],
          ['I felt a gentle breeze. Was that it?', 'Senti uma brisa leve. Era isso?'],
          ['The ground took that one personally.', 'O chão levou isso para o lado pessoal.'],
          ['You hit the floor. The floor is injured.', 'Você acertou o chão. O chão está ferido.'],
          ['Predict my movement? I was standing still.', 'Prever meu movimento? Eu estava parado.'],
          ['Aim is a skill. Practice it.', 'Mira é habilidade. Pratique.'],
          ['That was close. To the next county.', 'Passou perto. Da cidade vizinha.'],
          ['Should I walk into it? To be polite?', 'Devo andar na direção? Por gentileza?'],
          ['Meteor on the grass. Very ecological.', 'Meteoro na grama. Muito ecológico.'],
          ['Does Sun Strike come with a map?', 'A Sun Strike vem com mapa?'],
          ['It happens. To bad players.', 'Acontece. Com jogador ruim.'],
          ['That tornado is just a nice breeze.', 'Esse tornado é só uma brisa gostosa.'],
          ['Almost had me. Almost.', 'Quase me acertou. Quase.']
        ],
        comboFail: [
          ['That was the combo? Cute.', 'Esse era o combo? Fofo.'],
          ['Combo dropped. Pick it back up.', 'Combo caiu. Levanta ele.'],
          ['Another one bites the dust. Yours.', 'Mais um que foi pro chão. O seu.'],
          ['Better luck next time, wizard.', 'Mais sorte da próxima, mago.'],
          ['My health bar did not even sweat.', 'Minha barra de vida nem suou.'],
          ['The scenario won. Again.', 'O cenário venceu. De novo.'],
          ['Failed with style, I\'ll give you that.', 'Falhou com estilo, isso eu admito.'],
          ['Reset. Breathe. Try again.', 'Reseta. Respira. Tenta de novo.'],
          ['Even Rubick would have done better.', 'Até o Rubick teria feito melhor.'],
          ['And that is why we practice.', 'E é por isso que a gente treina.'],
          ['Chat is typing... gg.', 'O chat está digitando... gg.'],
          ['Failure is just success with extra steps.', 'Falhar é só sucesso com mais passos.'],
          ['You\'ll get me next time. Maybe.', 'Na próxima você me pega. Talvez.'],
          ['Honestly, I expected more.', 'Sinceramente, esperava mais.'],
          ['Nope. Not this time.', 'Não. Dessa vez não.'],
          ['Your combo has left the chat.', 'Seu combo saiu do chat.']
        ],
        idleLong: [
          ['Hello? Are you still there?', 'Alô? Ainda está aí?'],
          ['Quas Wex Exort... take your time, I\'ll wait.', 'Quas Wex Exort... sem pressa, eu espero.'],
          ['I could grow old waiting for you.', 'Eu envelheço esperando você.'],
          ['Is it nap time already?', 'Já é hora da soneca?'],
          ['The timer is not shy, you know.', 'O timer não é tímido, sabia?'],
          ['Cast something. Anything. Please.', 'Lança alguma coisa. Qualquer coisa. Por favor.'],
          ['I am getting bored over here.', 'Estou ficando entediado aqui.'],
          ['Think, think... or just cast.', 'Pensa, pensa... ou só lança.'],
          ['Did you forget your own spells?', 'Esqueceu suas próprias magias?'],
          ['Tick tock, wizard.', 'Tique-taque, mago.'],
          ['My grandma cast faster. And she is a tree.', 'Minha avó lançava mais rápido. E ela é uma árvore.'],
          ['Is the keyboard plugged in?', 'O teclado está plugado?'],
          ['I\'m starting to grow roots.', 'Estou começando a criar raízes.'],
          ['Just press R. It is right there.', 'É só apertar R. Está bem ali.'],
          ['This is not a museum. No admiring.', 'Isso não é museu. Nada de contemplar.'],
          ['Analysis paralysis, I see.', 'Paralisia por análise, pelo visto.']
        ],
        dodge: [
          ['Too slow!', 'Muito lento!'],
          ['Nope, not today.', 'Hoje não.'],
          ['Can\'t catch me!', 'Não me pega!'],
          ['Saw that coming a mile away.', 'Vi isso chegando de longe.'],
          ['Gotta go fast. Or at least sideways.', 'Tem que ir rápido. Ou pelo menos de lado.'],
          ['Ha! Missed me by a mile.', 'Ha! Errou por quilômetros.'],
          ['Predictable.', 'Previsível.'],
          ['Sidestep complete. Next.', 'Passo lateral completo. Próximo.'],
          ['Tornado? More like a light draft.', 'Tornado? Mais pra corrente de ar.'],
          ['I read your mind. It was loud.', 'Li sua mente. Estava barulhenta.'],
          ['You telegraph more than a smoke signal.', 'Você avisa mais que sinal de fumaça.'],
          ['My boots are enchanted. By vanity.', 'Minhas botas são encantadas. Pela vaidade.'],
          ['Whoosh! Was that you?', 'Uuush! Era você?'],
          ['You will need to be faster than that.', 'Vai precisar ser mais rápido que isso.'],
          ['Dodge: 1. You: 0.', 'Esquiva: 1. Você: 0.'],
          ['Not on my watch.', 'Não no meu turno.']
        ],
        heroLow: [
          ['You are bleeding, you know.', 'Você está sangrando, sabia?'],
          ['HP low. Pride lower.', 'Vida baixa. Orgulho mais baixo ainda.'],
          ['Heroes at this HP usually retire.', 'Heróis com essa vida costumam se aposentar.'],
          ['One more hit and it is over.', 'Mais um golpe e acabou.'],
          ['Maybe heal? Or Ghost Walk away?', 'Que tal curar? Ou fugir de Ghost Walk?'],
          ['Oof, that looked painful.', 'Ui, isso parecia doloroso.'],
          ['Careful, you break easily.', 'Cuidado, você quebra fácil.'],
          ['The low HP is showing.', 'A vida baixa está aparecendo.'],
          ['Need a medic, doc?', 'Precisa de médico, doutor?'],
          ['At this rate I win by waiting.', 'Nesse ritmo eu ganho esperando.'],
          ['Your health bar is at its lowest.', 'Sua barra de vida está no mínimo.'],
          ['Panic is a valid strategy. Not a good one.', 'Pânico é uma estratégia válida. Não boa.'],
          ['Red is not your color.', 'Vermelho não é sua cor.'],
          ['I will say a few kind words at the funeral.', 'Direi algumas palavras gentis no seu funeral.'],
          ['Maybe a Mekansm would help.', 'Talvez um Mekansm ajude.'],
          ['Dying is also a way to leave the combo.', 'Morrer também é uma forma de sair do combo.']
        ],
        praise: [
          ['...Fine. That was clean.', '...Tá. Isso foi limpo.'],
          ['Okay, okay, not bad.', 'Ok, ok, nada mal.'],
          ['I\'ll admit it: that was good.', 'Vou admitir: foi bom.'],
          ['Ow. Respect.', 'Ai. Respeito.'],
          ['Show-off.', 'Exibido.'],
          ['Beginner\'s luck. Probably.', 'Sorte de principiante. Provavelmente.'],
          ['Did you practice? It shows.', 'Você treinou? Dá pra notar.'],
          ['Alright, alright. You may proceed.', 'Tá bom, tá bom. Pode prosseguir.'],
          ['That hurt. In a good way.', 'Isso doeu. De um jeito bom.'],
          ['Do not let it go to your head.', 'Não deixa subir à cabeça.'],
          ['Fine. I will give you that one.', 'Tá. Essa eu te dou.'],
          ['Wow. Almost professional.', 'Uau. Quase profissional.'],
          ['I wasn\'t looking, so it doesn\'t count. Nice though.', 'Eu não estava olhando, então não vale. Mas foi bonito.'],
          ['Okay Invoker, I see you.', 'Ok, Invoker, te vi.'],
          ['Fast hands. Annoying.', 'Mãos rápidas. Irritante.'],
          ['Remind me to stay away from you.', 'Me lembra de ficar longe de você.']
        ],
        dustUsed: [
          ['Dust!', 'Pó!']
        ],
        pitJuke: [
          ['Catch me in there!', 'Me pega lá dentro!'],
          ['Into the pit!', 'Pro fosso!']
        ]
      },
    },

    // ENEMY: Pedro. ADHD, talks WAY too fast (run-on words), hyperfocus fixations, hunched like a zombie, back hurts,
    // loves goiaba, walks barefoot, programmer / vibecoder.
    pedro: {
      cd: 3.5, chat: 0.9, lineCd: 40, fallback: 'default', lines: {
        spawn: [
          ['Okaywaitwhatdidyousayoh-combat-right-hi.', 'Tábompeeeraoquevocêfaloualaha-combate-né-oi.'],
          ['Hold on, I almost had a bug fixed. Nope. Hi.', 'Pera, eu quase consertei um bug. Não. Oi.'],
          ['I had a goiaba somewhere. Where did the goiaba go.', 'Eu tinha uma goiaba aqui. Cadê a goiaba.', { icon: 'goiaba' }],
          ['Quick quick quick before I forget what we are doing!', 'Rápido rápido rápido antes que eu esqueça o que a gente faz!'],
          ['*cracks back* Ahh. Okay. Fight me, gently.', '*estala a coluna* Ahh. Beleza. Pode vir, devagar.'],
          ['Sorry, my feet are cold. Barefoot problems.', 'Desculpa, meu pé tá gelado. Problemas de quem anda descalço.'],
          ['Nobody-touch-the-keyboard-I-am-in-flow.', 'Ninguém-encosta-no-teclado-eu-tô-no-flow.'],
          ['I vibecoded this fight. Good luck to both of us.', 'Eu vibecodei essa luta. Boa sorte pra nós dois.'],
        ],
        idle: [
          ['Did you know goiaba has more vitamin C than orange? Ok. Go.', 'Sabia que goiaba tem mais vitamina C que laranja? Ok. Vai.', { icon: 'goiaba' }],
          ['Ouch. Back. Hang on. Ok. Continue.', 'Ai. Costas. Pera. Ok. Continua.'],
          ['Whatwasiwaitingfor.', 'Oqueeuestavaesperando.'],
          ['Shiny thing. Sorry. Shiny thing gone.', 'Coisa brilhante. Desculpa. Coisa brilhante sumiu.'],
          ['I should write a script for this. Not now. Later. Now?', 'Eu devia fazer um script pra isso. Agora não. Depois. Agora?'],
          ['Grass feels so good on bare feet, you should try it.', 'A grama é tão boa no pé descalço, você devia tentar.'],
          ['Tab 47 of 112 just got really interesting.', 'A aba 47 de 112 ficou muito interessante.'],
          ['Is it lunchtime? Is it goiaba time?', 'Já é hora do almoço? É hora da goiaba?', { icon: 'goiaba' }],
        ],
        idleLong: [
          ['Take-your-time-no-rush-I-am-fine-I-am-reading-docs.', 'Tá-com-calma-sem-pressa-eu-tô-bem-tô-lendo-a-doc.'],
          ['I counted the pixels on my screen while waiting. 2073600.', 'Contei os pixels da tela esperando. 2073600.'],
          ['I started three side projects while you were thinking.', 'Comecei três projetos paralelos enquanto você pensava.'],
          ['Hello? Or did you also open another tab?', 'Alô? Ou você também abriu outra aba?'],
          ['My back hurts from waiting. Which is saying something.', 'Minhas costas doem de esperar. E olha que já doíam.'],
          ['Cast something or I will refactor my whole life.', 'Lança algo ou eu refatoro minha vida inteira.'],
          ['I forgot why I came here. Oh right. You.', 'Esqueci por que eu vim. Ah, é. Você.'],
          ['Wait wait I had an idea. Gone. Cast.', 'Pera pera tive uma ideia. Sumiu. Lança.'],
        ],
        damaged: [
          ['Ow! Wait, no, that was my back. Ow! That one was you.', 'Ai! Não, essa foi a coluna. Ai! Essa foi você.'],
          ['Hey!Thatwasmyhealth!', 'Ei!Aquiloeraminhavida!'],
          ['Ah! Mid-thought! Rude!', 'Ah! No meio de um pensamento! Folgado!'],
          ['I felt that in my spine. Which was already complaining.', 'Senti na coluna. Que já reclamava.'],
          ['Ouchie. Is that covered by the sprint?', 'Aiaiai. Isso entra na sprint?'],
          ['Okay okay that stung, let me log it as a bug.', 'Ok ok isso ardeu, vou registrar como bug.'],
          ['Pain! Notification! Dismissing!', 'Dor! Notificação! Dispensando!'],
          ['Waitwaitwait you hit me while I was loading.', 'Peraperapera você me acertou enquanto eu carregava.'],
        ],
        stunned: [
          ['Zzzoned out! I do that anyway!', 'Dei uma viajada! Eu faço isso de qualquer jeito!'],
          ['Cannot move. Cannot think. So, Tuesday.', 'Não mexo. Não penso. Ou seja, terça-feira.'],
          ['Hyperfocus on the ceiling. Great ceiling.', 'Hiperfoco no teto. Ótimo teto.'],
          ['I am a statue now. A hunched statue.', 'Virei estátua. Uma estátua corcunda.'],
          ['Brain buffering... 99%... 99%...', 'Cérebro carregando... 99%... 99%...'],
          ['Frozen! Like my IDE after an update!', 'Travado! Igual minha IDE depois de update!'],
          ['Ooh, stars. Pretty stars. Stop. Fight.', 'Ooh, estrelas. Estrelas lindas. Para. Luta.'],
        ],
        nearDeath: [
          ['I-have-so-little-health-left-I-could-count-it-in-goiabas.', 'Tenho-tão-pouca-vida-que-dá-pra-contar-em-goiabas.'],
          ['Back hurts. Everything hurts. Hmm, new record.', 'Costas doem. Tudo dói. Hmm, recorde novo.'],
          ['Please do not git revert me.', 'Por favor não me dê git revert.'],
          ['I should have saved before this fight.', 'Eu devia ter salvado antes dessa luta.'],
          ['Zombie mode! Unlocked! Slowly!', 'Modo zumbi! Desbloqueado! Devagar!'],
          ['Tell my goiaba tree I loved it.', 'Diz pra minha goiabeira que eu amava ela.'],
        ],
        death: [
          ['Ctrl+Z! Ctrl+Z! CTRL+Z!', 'Ctrl+Z! Ctrl+Z! CTRL+Z!'],
          ['Segmentation fault (core dumped)', 'Falha de segmentação (core despejado)'],
          ['Okay. Respawning. Brb. Goiaba.', 'Ok. Renascendo. Já volto. Goiaba.', { icon: 'goiaba' }],
          ['I was in the middle of a commit!', 'Eu estava no meio de um commit!'],
          ['At least my back does not hurt anymore.', 'Pelo menos minhas costas pararam de doer.'],
          ['git push --force to the afterlife.', 'git push --force pro além.'],
          ['Bury me barefoot, please.', 'Me enterra descalço, por favor.'],
          ['Aaaand I forgot to save.', 'Eeee eu esqueci de salvar.'],
        ],
        killedHero: [
          ['Wait, did I win? I was not even paying attention!', 'Peraí, eu ganhei? Nem estava prestando atenção!'],
          ['You died. I can fix that. With a script. Maybe.', 'Você morreu. Eu consigo consertar. Com um script. Talvez.'],
          ['GG! Goiaba on me!', 'GG! Goiaba por minha conta!', { icon: 'goiaba' }],
          ['Whoa. Did I do that? Did the AI do that?', 'Nossa. Fui eu? Foi a IA?'],
          ['Sorry sorry sorry sorry sorry.', 'Desculpadesculpadesculpadesculpa.'],
          ['Oh no. I broke production.', 'Ih. Quebrei a produção.'],
          ['Respawn timer. Time for exactly one goiaba.', 'Timer de renascer. Dá tempo de exatamente uma goiaba.', { icon: 'goiaba' }],
        ],
        playerMissed: [
          ['Missed! Happens to me every day!', 'Errou! Acontece comigo todo dia!'],
          ['It-went-over-there-look-over-there.', 'Foi-pra-lá-olha-pra-lá.'],
          ['Tragic. Do it again so I can watch it.', 'Trágico. Faz de novo pra eu ver.'],
          ['The bug is in your aim. I can tell. Seen it before.', 'O bug está na mira. Dá pra ver. Já vi isso.'],
          ['You hit a very nice patch of grass.', 'Você acertou um pedaço de grama muito bonito.'],
          ['Off by one. Always off by one.', 'Off by one. Sempre off by one.'],
          ['Spell: 404 Target Not Found.', 'Magia: 404 Alvo Não Encontrado.'],
          ['Ahaha, wait, that was my face when I hit save.', 'Ahaha, pera, essa foi minha cara quando dei save.'],
        ],
        playerWhiffSunstrike: [
          ['Sun Strike? More like Sun Stroke... of bad luck.', 'Sun Strike? Mais pra Sun Strike do azar.'],
          ['The sun missed. Even the sun has bad days.', 'O sol errou. Até o sol tem dia ruim.'],
          ['You-aimed-at-where-I-was-three-seconds-ago.', 'Você-mirou-onde-eu-estava-três-segundos-atrás.'],
          ['Beautiful beam. Zero users affected.', 'Raio lindo. Zero usuários afetados.'],
          ['Free sunbath! No sunscreen needed!', 'Banho de sol grátis! Sem protetor!'],
          ['Tell the sun I said thanks for the light show.', 'Diz pro sol que valeu pelo show de luz.'],
        ],
        heroInvisible: [
          ['Where did he go where did he go where did he go.', 'Pra onde foi pra onde foi pra onde foi.'],
          ['Invisible?! I need that for my deploys!', 'Invisível?! Preciso disso pros meus deploys!'],
          ['Hello? Ghost? ...is this a feature?', 'Alô? Fantasma? ...isso é feature?'],
          ['I-can-feel-you-there. I-think. Is that you or my back?', 'Eu-sinto-você-aí. Acho. É você ou a coluna?'],
          ['Hide and seek! I love hide and seek! I am bad at it!', 'Esconde-esconde! Amo esconde-esconde! Sou péssimo!'],
          ['Great. Now the bug is invisible too.', 'Ótimo. Agora o bug também é invisível.'],
        ],
        night: [
          ['Night already?! I just sat down!', 'Já anoiteceu?! Acabei de sentar!'],
          ['Perfect time to code. And also to fight, I guess.', 'Horário perfeito pra codar. E pra lutar, acho.'],
          ['Dark mode enabled. Finally.', 'Modo escuro ativado. Finalmente.'],
          ['I-am-more-awake-now-than-at-noon-no-one-explains-it.', 'Tô-mais-acordado-agora-que-ao-meio-dia-ninguém-explica.'],
          ['Barefoot at night is the best. Cool floor.', 'Descalço de noite é o melhor. Chão fresquinho.'],
          ['One more fight and then I sleep. Lie.', 'Mais uma luta e eu durmo. Mentira.'],
        ],
        dustUsed: [
          ['Dust! I saw it in a tutorial!', 'Dust! Vi num tutorial!'],
          ['Glitter bomb!', 'Bomba de glitter!'],
          ['Gotcha-gotcha-gotcha-you-are-glowing!', 'Te-peguei-te-peguei-você-tá-brilhando!'],
          ['I thought we had a build for that.', 'Achei que a gente tinha um build pra isso.'],
          ['Revealed! Like my browser history!', 'Revelado! Igual meu histórico do navegador!'],
          ['Sprinkles!', 'Confete!'],
        ],
        pitJuke: [
          ['Into the pit! Last one in is a bug!', 'No fosso! O último a entrar é bug!'],
          ['Follow me! I know a shortcut! Maybe!', 'Me segue! Eu conheço um atalho! Talvez!'],
          ['Wheee! Hole!', 'Uiii! Buraco!'],
          ['Come-in-the-water-is-fine-the-pit-is-fine.', 'Vem-que-tá-boa-a-água-o-fosso-tá-bom.'],
          ['Catch me if you can! I am slow! You will!', 'Me pega se puder! Sou lento! Vai pegar!'],
          ['This is a feature, not a trap!', 'Isso é feature, não armadilha!'],
        ],
        caught: [
          ['Got you! Wait, did I? Yes! Got you!', 'Te peguei! Peraí, peguei? Peguei! Te peguei!'],
          ['Tag! You are it! Now go fix the bug.', 'Pega-pega! Você é o pegador! Agora conserta o bug.'],
          ['Caught! Like my cold, every winter.', 'Pego! Igual meu resfriado, todo inverno.'],
          ['I did a thing! I actually did a thing!', 'Eu fiz uma coisa! Eu realmente fiz uma coisa!'],
          ['Merge conflict. In your face. Mine.', 'Conflito de merge. Na sua cara. Minha.'],
          ['Zombies are slow but we are persistent.', 'Zumbi é lento mas é persistente.'],
          ['Please-do-not-tell-my-boss-I-was-playing.', 'Por-favor-não-conta-pro-chefe-que-eu-tava-jogando.'],
          ['Gotcha. Now I owe myself a goiaba.', 'Peguei. Agora eu me devo uma goiaba.'],
        ],
        escaped: [
          ['Wait where are you going! I was just starting!', 'Pera pra onde você vai! Eu tava começando!'],
          ['Gone. Like my focus. Hm. Ok.', 'Foi. Igual meu foco. Hm. Ok.'],
          ['You-are-so-fast-I-am-a-zombie-I-cannot.', 'Você-é-tão-rápido-eu-sou-zumbi-não-consigo.'],
          ['Ahh, you got away. Fine, I wanted a nap anyway.', 'Ahh, você escapou. Beleza, eu queria uma soneca mesmo.'],
          ['*hunched shuffle intensifies*', '*arrastar corcunda intensifica*'],
          ['Is that fair? Probably. I did not read the rules.', 'Isso é justo? Provavelmente. Não li as regras.'],
        ],
        playerFail: [
          ['Did-you-just-press-the-wrong-thing-I-do-that-too.', 'Você-apertou-a-coisa-errada-eu-também-faço-isso.'],
          ['Nothing happened. Have you tried restarting?', 'Nada aconteceu. Já tentou reiniciar?'],
          ['Click-click-click-did-it-work-no.', 'Clica-clica-clica-funcionou-não.'],
          ['Error 418: I am a teapot, and also a pedro.', 'Erro 418: sou um bule de chá, e também um pedro.'],
          ['Console says: undefined is not a spell.', 'Console diz: undefined não é uma magia.'],
        ],
        comboFail: [
          ['Combo crashed. Check the logs. There are no logs.', 'Combo crashou. Olha os logs. Não tem logs.'],
          ['Okay that failed. Quick! Add more try-catch!', 'Ok falhou. Rápido! Põe mais try-catch!'],
          ['Hmm, it worked on my machine.', 'Hmm, na minha máquina funcionou.'],
          ['Failing-fast-is-a-methodology-I-read-that-once.', 'Falhar-rápido-é-metodologia-eu-li-isso-uma-vez.'],
          ['Have you tried asking the AI to do the combo?', 'Já tentou pedir pra IA fazer o combo?'],
        ],
        praise: [
          ['Whoa that was clean!! Can you do it again? And slower?', 'Nossa que limpo!! Dá pra fazer de novo? E mais devagar?'],
          ['Zero-bugs-in-that-combo-I-am-so-jealous.', 'Zero-bugs-nesse-combo-que-inveja.'],
          ['Merge approved! LGTM!', 'Merge aprovado! LGTM!'],
          ['You get a goiaba. A virtual one.', 'Você ganha uma goiaba. Virtual.', { icon: 'goiaba' }],
          ['Okay that was cool. What was I saying? Oh, right, cool.', 'Ok isso foi legal. O que eu dizia? Ah, é, legal.'],
        ],
        heroLow: [
          ['Careful, low health! I know that feeling. Daily.', 'Cuidado, vida baixa! Conheço esse sentimento. Diariamente.'],
          ['Health-bar-is-red-red-is-bad-go-go-go.', 'Barra-vermelha-vermelho-é-ruim-vai-vai-vai.'],
          ['You should sit down. Stretch. Back stuff.', 'Você devia sentar. Alongar. Coisa de coluna.'],
          ['Eat a goiaba! Heals everything!', 'Come uma goiaba! Cura tudo!', { icon: 'goiaba' }],
        ],
        'hitBy:coldsnap': [
          ['Cold! Cold feet! I was already barefoot!', 'Frio! Pé gelado! Eu já estava descalço!'],
          ['Brrr. My back just filed a complaint.', 'Brrr. Minha coluna abriu um chamado.'],
          ['Frozen-frozen-frozen-whywhywhy.', 'Congelei-congelei-congelei-pqpqpq.'],
          ['Ice cream headache but in my whole body!', 'Dor de sorvete mas no corpo todo!'],
        ],
        'hitBy:tornado': [
          ['Wheeeee! Tornado! Do it again!', 'Uuuuui! Tornado! Faz de novo!'],
          ['My papers! My goiabas!', 'Meus papéis! Minhas goiabas!'],
          ['So-dizzy-I-forgot-what-I-forgot.', 'Tão-tonto-esqueci-o-que-esqueci.'],
          ['Flying! Finally something good happened to my posture!', 'Voando! Finalmente algo bom pra minha postura!'],
        ],
        'hitBy:sunstrike': [
          ['AH! Hot! Sun! Too much sun! Sunscreen!', 'AH! Quente! Sol! Muito sol! Protetor!'],
          ['Sunburn on my barefoot toes!', 'Queimadura de sol nos dedos do pé!'],
          ['That-was-a-lot-of-sun-for-one-guy.', 'Isso-foi-muito-sol-pra-um-cara-só.'],
          ['Sun Strike on me? Rude! Beautiful, but rude!', 'Sun Strike em mim? Folgado! Lindo, mas folgado!'],
        ],
        'hitBy:chaosmeteor': [
          ['METEOR! Dinosaur flashback!', 'METEORO! Flashback de dinossauro!'],
          ['It burns it burns it burns!! Beautiful though.', 'Queima queima queima!! Lindo, porém.'],
          ['I was gonna refactor that crater, but ok.', 'Eu ia refatorar essa cratera, mas tudo bem.'],
          ['Meteor-meteor-meteor-I-am-the-dinosaur-now.', 'Meteoro-meteoro-meteoro-agora-eu-sou-o-dinossauro.'],
        ],
        'hitBy:deafeningblast': [
          ['WHAT? I CAN NOT HEAR MY BACK COMPLAINING!', 'O QUÊ? NÃO ESCUTO MINHA COLUNA RECLAMANDO!'],
          ['Ringing! Ears! Tab! Which tab is playing music?!', 'Zumbido! Orelhas! Aba! Qual aba tá tocando música?!'],
          ['Too loud! Turn it down! Is there a volume knob on you?', 'Alto demais! Abaixa! Você tem botão de volume?'],
          ['Eh? Eh? Say it again but in text.', 'Hã? Hã? Fala de novo mas por texto.'],
        ],
        'hitBy:emp': [
          ['My mana! My precious mana! I had plans!', 'Minha mana! Minha preciosa mana! Eu tinha planos!'],
          ['Static! Hair! Everywhere!', 'Estática! Cabelo! Pra todo lado!'],
          ['EMP-ed-like-a-laptop-in-the-rain.', 'EMP-ado-feito-notebook-na-chuva.'],
          ['You-fried-my-focus-again.', 'Você-fritou-meu-foco-de-novo.'],
        ],
        'hitBy:icewall': [
          ['A wall! Cool! Literally! Hehe!', 'Uma parede! Legal! Literalmente! Rs!'],
          ['Can I lick the ice? Asking for a friend.', 'Posso lamber o gelo? Pergunto por um amigo.'],
          ['Ooh, the ice is sparkly. Sorry. Focus.', 'Ooh, o gelo é brilhante. Desculpa. Foco.'],
        ],
        'hitBy:alacrity': [
          ['Fast! Faster than my typing! Even faster than my talking!', 'Rápido! Mais que minha digitação! Mais que minha fala até!'],
          ['Hey,-can-I-get-some-of-that-for-Mondays?', 'Ei,-posso-ter-um-pouco-disso-pras-segundas?'],
          ['Speed buff! The only buff I understand!', 'Buff de velocidade! O único buff que eu entendo!'],
        ],
        'hitBy:forgespirit': [
          ['A tiny fire guy! Can I keep him? He is so small!', 'Um carinha de fogo! Posso ficar com ele? É tão pequeno!'],
          ['He-has-a-face-made-of-lava-I-love-him.', 'Ele-tem-cara-de-lava-eu-amo-ele.'],
          ['Hot coffee guy! I need him for my mornings!', 'Cara do café quente! Preciso dele nas minhas manhãs!'],
        ],
        'hitBy:ghostwalk': [
          ['Ghost! Boo! Scary! Is it Halloween?', 'Fantasma! Bu! Medo! É Halloween?'],
          ['Ooo, a ghost! Can I debug a ghost?', 'Ooo, um fantasma! Dá pra debugar fantasma?'],
          ['Is-it-spooky-or-am-I-tired-same-thing.', 'É-assustador-ou-eu-tô-cansado-dá-no-mesmo.'],
        ],
        'hitBy:atos': [
          ['Rooted! Like my goiaba tree! Hello tree!', 'Enraizado! Igual minha goiabeira! Oi goiabeira!', { icon: 'goiaba' }],
          ['The tether! The tether! My feet!', 'O laço! O laço! Meus pés!'],
        ],
        'hitBy:vyse': [
          ['Oink?! What?! I was mid-thought!', 'Oink?! O quê?! Eu tava pensando!'],
          ['A sheep! Baa! Fluffier than me!', 'Uma ovelha! Béé! Mais fofa que eu!'],
        ],
        'hitBy:shiva': [
          ['Cold wave! And I forgot my hoodie again.', 'Onda de frio! E esqueci o moletom de novo.'],
          ['Freezing! My back! My bones! My side projects!', 'Congelando! Minha coluna! Meus ossos! Meus projetos paralelos!'],
        ],
        'hitBy:meteorhammer': [
          ['A hammer?! From the sky?! Is that a feature?!', 'Um martelo?! Do céu?! Isso é feature?!'],
          ['Ow-it-hits-over-time-like-technical-debt.', 'Ai-bate-ao-longo-do-tempo-feito-dívida-técnica.'],
        ],
        'hitBy:orchid': [
          ['Silenced! Rude! I was typing!', 'Silenciado! Folgado! Eu estava digitando!'],
          ['Cannot-cast-cannot-think-cannot-vibe-code.', 'Não-lanço-não-penso-não-vibecodo.'],
        ],
        'hitBy:gleipnir': [
          ['Chains! Spicy! Do chains have good posture?', 'Correntes! Picante! Corrente tem boa postura?'],
          ['Zap zap zap and I am stuck. Story of my commits.', 'Zap zap zap e tô preso. História dos meus commits.'],
        ],
        'hitBy:forcestaff': [
          ['Pushed! Hey! I was getting comfortable!', 'Empurrado! Ei! Eu tava ficando confortável!'],
          ['Whoa-whoa-whoa-my-knees-my-back-whoa.', 'Opa-opa-opa-meus-joelhos-minha-coluna-opa.'],
        ],
        'hitBy:dust': [
          ['Glitter! I am sparkly! Also revealed. Hm.', 'Glitter! Estou brilhando! E revelado. Hm.'],
          ['Achoo! Dust allergy! Achoo!', 'Atchim! Alergia a pó! Atchim!'],
        ],
      },
    },

    // ENEMY: Renan. Positive vibes always, photographer (frames everything), cheapskate (everything must be free / discounted),
    // balding (and fine with it).
    renan: {
      cd: 4, chat: 0.85, lineCd: 40, fallback: 'default', lines: {
        spawn: [
          ['Good vibes only! Hold that pose, let me frame this.', 'Só energia boa! Segura a pose, deixa eu enquadrar.', { icon: 'camera' }],
          ['Beautiful light today! Is this fight free? Great.', 'Que luz linda hoje! Essa luta é de graça? Ótimo.'],
          ['Smile! This is going straight to the portfolio.', 'Sorria! Isso vai direto pro portfólio.', { icon: 'camera' }],
          ['Today is a good day for a fight. And a discount.', 'Hoje é um bom dia pra lutar. E pra pechinchar.'],
          ['Let me just wipe my forehead. It is very shiny today.', 'Deixa eu limpar a testa. Tá muito brilhante hoje.'],
          ['Positive thinking, positive vibes, positive sunburn.', 'Pensamento positivo, vibe positiva, insolação positiva.'],
          ['Is the Wi-Fi free here? Asking for the photos.', 'O Wi-Fi aqui é de graça? Pergunto por causa das fotos.'],
          ['Nothing can ruin my mood. Not even you. Come on!', 'Nada estraga meu humor. Nem você. Vem!'],
        ],
        idle: [
          ['Golden hour is in two minutes. Just saying.', 'A hora dourada é em dois minutos. Só avisando.', { icon: 'camera' }],
          ['I got a great angle of that tree. Mind if I post it?', 'Peguei um ângulo ótimo daquela árvore. Posso postar?'],
          ['It is a lovely day. Smile, even the enemy!', 'Que dia lindo. Sorria, até o inimigo!'],
          ['My lens is worth more than this whole map. Careful.', 'Minha lente vale mais que esse mapa inteiro. Cuidado.'],
          ['Anyone know where the free samples are?', 'Alguém sabe onde ficam as amostras grátis?'],
          ['The wind is messing up my hair. What hair? Right.', 'O vento tá bagunçando meu cabelo. Que cabelo? Pois é.'],
          ['Gratitude! I am grateful for sunshine and coupons.', 'Gratidão! Sou grato por sol e cupom.'],
          ['Wait for it... the light... the light... got it!', 'Espera... a luz... a luz... peguei!', { icon: 'camera' }],
        ],
        idleLong: [
          ['No rush! I am taking portraits while I wait.', 'Sem pressa! Tô tirando retratos enquanto espero.', { icon: 'camera' }],
          ['Take your time. Waiting is free. I love free.', 'Com calma. Esperar é de graça. Eu amo de graça.'],
          ['Great news, I just got 40 photos of the clouds!', 'Boa notícia, tirei 40 fotos das nuvens!'],
          ['Positive vibes! You will cast any second now!', 'Vibe positiva! Você vai lançar a qualquer segundo!'],
          ['I believe in you. Not in a hurry, but I do.', 'Eu acredito em você. Sem pressa, mas acredito.'],
          ['Hey, is the clock free to watch? Then I am watching.', 'Ei, olhar o relógio é de graça? Então tô olhando.'],
          ['My bald spot is getting a tan while we wait.', 'Minha careca tá pegando uma corzinha enquanto esperamos.'],
          ['No pressure! Actually a little pressure. A tiny one.', 'Sem pressão! Na verdade um pouco. Pouquinha.'],
        ],
        damaged: [
          ['Ow! But I have a good attitude about it!', 'Ai! Mas eu tô com ótima atitude sobre isso!'],
          ['That one hurt. Do I get an insurance discount?', 'Essa doeu. Tenho desconto no seguro?'],
          ['Careful with the lens! The lens!', 'Cuidado com a lente! A lente!', { icon: 'camera' }],
          ['Ha ha! Good one! Positive pain!', 'Ha ha! Boa! Dor positiva!'],
          ['Ouch! At least it was a free hit. Lucky me.', 'Ai! Pelo menos foi um golpe grátis. Que sorte.'],
          ['Everything happens for a reason. Ow.', 'Tudo acontece por um motivo. Ai.'],
          ['Positive vibes, positive vibes... ow, vibes.', 'Vibe positiva, vibe positiva... ai, vibe.'],
          ['You hit my head! Oh. It is a big target. Fair.', 'Acertou minha cabeça! Ah. É um alvo grande. Justo.'],
        ],
        stunned: [
          ['Freeze frame! I know a thing or two about those!', 'Frame congelado! Entendo um pouco disso!', { icon: 'camera' }],
          ['Stuck, but with a great view!', 'Preso, mas com uma vista ótima!'],
          ['I cannot move, but I can still smile. Cheese!', 'Não me mexo, mas ainda sorrio. Xis!'],
          ['This is a long exposure! Artistic!', 'Isso é uma longa exposição! Artístico!'],
          ['Dizzy, dizzy, but in a positive way.', 'Tonto, tonto, mas de um jeito positivo.'],
          ['Is this stun free? It better be free.', 'Esse stun é de graça? Tem que ser de graça.'],
        ],
        nearDeath: [
          ['Almost out of health! Great time for a final portrait!', 'Quase sem vida! Ótima hora pra um último retrato!', { icon: 'camera' }],
          ['I am not scared! I am thinking positive! I am scared.', 'Não tô com medo! Tô pensando positivo! Tô com medo.'],
          ['Hey, can we negotiate? A coupon? A hug?', 'Ei, dá pra negociar? Um cupom? Um abraço?'],
          ['The glass is half empty but I am still smiling!', 'O copo tá quase vazio mas eu continuo sorrindo!'],
          ['Please aim away from the camera!', 'Por favor mira longe da câmera!'],
          ['Final lesson: always buy the extended warranty.', 'Lição final: sempre compre a garantia estendida.'],
        ],
        death: [
          ['Thank you for the experience! Five stars!', 'Obrigado pela experiência! Cinco estrelas!'],
          ['Well, that is a wrap! Please tag me!', 'Bom, está gravado! Me marca por favor!', { icon: 'camera' }],
          ['I regret nothing. Except not asking for a refund.', 'Não me arrependo de nada. Só de não pedir reembolso.'],
          ['Smile for the afterlife!', 'Sorria pro além!'],
          ['Good vibes... forever... also my camera is yours.', 'Boas vibes... pra sempre... a câmera é sua.'],
          ['I will be reborn with more hair, I hope.', 'Vou renascer com mais cabelo, espero.'],
          ['Please remember me in my best light.', 'Me lembrem sob a minha melhor luz.'],
        ],
        killedHero: [
          ['Oh no, you died! Do you want a photo for the memory?', 'Ah não, você morreu! Quer uma foto pra lembrança?', { icon: 'camera' }],
          ['Sorry! Good vibes anyway! Free respawn?', 'Foi mal! Boas vibes mesmo assim! Renascer é de graça?'],
          ['That was a winning shot! Literally!', 'Foi um golpe vencedor! Literalmente!'],
          ['Aww, gg. Group photo?', 'Aww, gg. Foto em grupo?', { icon: 'camera' }],
          ['No hard feelings! Hard hit though.', 'Sem ressentimentos! Mas foi um golpe duro.'],
          ['Positive note: you looked great dying.', 'Lado positivo: você ficou ótimo morrendo.'],
        ],
        playerMissed: [
          ['Missed! But what an artistic miss!', 'Errou! Mas que erro artístico!'],
          ['Out of focus! Happens to the best of us.', 'Fora de foco! Acontece com os melhores.', { icon: 'camera' }],
          ['That one went for the free sky. Nice.', 'Essa foi pro céu de graça. Legal.'],
          ['Maybe aim for the shiny head? Everybody does.', 'Quem sabe mira na cabeça brilhante? Todo mundo mira.'],
          ['Good effort! Participation trophy!', 'Boa tentativa! Medalha de participação!'],
          ['The spell took a nice photo of the ground.', 'A magia tirou uma bela foto do chão.'],
          ['Try again, with positive thinking!', 'Tenta de novo, com pensamento positivo!'],
          ['That was a free sample of a miss.', 'Essa foi uma amostra grátis de erro.'],
        ],
        playerWhiffSunstrike: [
          ['Gorgeous Sun Strike! Wrong place, great lighting!', 'Sun Strike lindo! Lugar errado, iluminação ótima!', { icon: 'camera' }],
          ['A spotlight! For nobody! Lovely!', 'Um holofote! Pra ninguém! Lindo!'],
          ['Free sunbath, thank you! My head needed it.', 'Banho de sol grátis, obrigado! Minha careca precisava.'],
          ['The sun beam missed me and found a nice patch of grass.', 'O raio do sol me errou e achou um gramado bonito.'],
          ['Great light! Terrible aim! Love it!', 'Ótima luz! Mira péssima! Adorei!'],
          ['I will use that glow for my next shot, thanks.', 'Vou usar esse brilho na minha próxima foto, valeu.'],
        ],
        heroInvisible: [
          ['Where did you go? You were perfectly framed!', 'Pra onde você foi? Estava perfeitamente enquadrado!', { icon: 'camera' }],
          ['Invisible? Impossible to photograph! Challenge accepted!', 'Invisível? Impossível de fotografar! Desafio aceito!'],
          ['Ooh, a magic trick! Do you do birthdays? Is it free?', 'Ooh, truque de mágica! Faz aniversário? É de graça?'],
          ['My lens sees nothing. Great! A minimalist shot!', 'Minha lente não vê nada. Ótimo! Foto minimalista!'],
          ['Still positive! Probably still behind me, though!', 'Continuo positivo! Provavelmente tá atrás de mim, né!'],
          ['The vanishing act! I need a tripod for this!', 'O truque do desaparecimento! Preciso de um tripé!'],
        ],
        night: [
          ['Night photography! Time to break out the tripod!', 'Fotografia noturna! Hora de sacar o tripé!', { icon: 'camera' }],
          ['Stars! Free stars! Best deal in town!', 'Estrelas! Estrelas grátis! A melhor oferta da cidade!'],
          ['Dark, but my attitude is bright.', 'Escuro, mas minha atitude é brilhante.'],
          ['Long exposure time! Nobody blink!', 'Hora da exposição longa! Ninguém pisca!'],
          ['The moonlight loves my forehead.', 'O luar adora minha testa.'],
          ['Night shift! Overtime is not free, though.', 'Turno da noite! Hora extra não é de graça, né.'],
        ],
        dustUsed: [
          ['Dust! It is on sale this week, I hope!', 'Dust! Tá em promoção essa semana, espero!'],
          ['You are sparkling! Photo op!', 'Você tá brilhando! Hora da foto!', { icon: 'camera' }],
          ['Dust! Never pay full price for it!', 'Dust! Nunca pague preço cheio!'],
          ['Revealed! Say cheese!', 'Revelado! Diga xis!', { icon: 'camera' }],
          ['A little glitter for the portrait!', 'Um glitter pro retrato!'],
          ['I found the coupon for this one.', 'Achei o cupom pra esse aqui.'],
        ],
        pitJuke: [
          ['Come to the pit! The view is free!', 'Vem pro fosso! A vista é de graça!'],
          ['Perfect angle from down there!', 'Ângulo perfeito lá de baixo!', { icon: 'camera' }],
          ['Follow me, I know a discount hole!', 'Me segue, conheço um buraco com desconto!'],
          ['Catch me in the pit! Candid shot!', 'Me pega no fosso! Foto espontânea!', { icon: 'camera' }],
          ['Free fall! Free fall! Free is my favorite word!', 'Queda livre! Queda livre! Livre/grátis é minha palavra favorita!'],
          ['Pit time! Positive thoughts!', 'Hora do fosso! Pensamentos positivos!'],
        ],
        caught: [
          ['Got you! And a great shot of it!', 'Te peguei! E ainda tirei uma ótima foto!', { icon: 'camera' }],
          ['Caught! Look at the camera!', 'Pego! Olha pra câmera!', { icon: 'camera' }],
          ['Gotcha! Positive result, positive attitude!', 'Peguei! Resultado positivo, atitude positiva!'],
          ['Ha ha! I did not even have to pay for that!', 'Ha ha! Nem precisei pagar por isso!'],
          ['Got you! I will send the photos by email. Free.', 'Te peguei! Mando as fotos por e-mail. De graça.'],
          ['Caught you smiling! Oh, you are not. Smile!', 'Te peguei sorrindo! Ah, não tá. Sorria!'],
          ['Do not worry, I only caught you, not your wallet.', 'Relaxa, só te peguei, não a sua carteira.'],
          ['You can keep the loss. It was free!', 'Pode ficar com a derrota. Foi de graça!'],
        ],
        escaped: [
          ['You got away! Cool! Great pace! I got a blur!', 'Escapou! Legal! Ótimo ritmo! Tirei um borrão!', { icon: 'camera' }],
          ['Fast! I couldn\'t even catch a picture.', 'Rápido! Não consegui nem uma foto.'],
          ['Good run! I will follow at a discount speed.', 'Boa corrida! Eu sigo em velocidade promocional.'],
          ['Where to? Take me too! Is the trip free?', 'Pra onde? Me leva! A viagem é de graça?'],
          ['That is fine! Failure is just a different angle!', 'Tudo bem! Falhar é só outro ângulo!'],
          ['Well, nobody pays for second place anyway.', 'Bom, ninguém paga pelo segundo lugar mesmo.'],
        ],
        playerFail: [
          ['Oops! Fixing it is free, though! Try again!', 'Opa! Mas consertar é de graça! Tenta de novo!'],
          ['Nothing happened, but your attitude is great!', 'Nada aconteceu, mas sua atitude é ótima!'],
          ['It is okay! Reshoots are free!', 'Tudo bem! Refazer a cena é de graça!', { icon: 'camera' }],
          ['Hey, no problem! Just press it again!', 'Ei, sem problema! É só apertar de novo!'],
          ['Wrong button? Right attitude!', 'Botão errado? Atitude certa!'],
        ],
        comboFail: [
          ['Lost one! The next is going to be the one!', 'Perdeu um! O próximo vai ser o certo!'],
          ['Shoot... I mean, photograph... again!', 'Atira... quer dizer, fotografa... de novo!', { icon: 'camera' }],
          ['Failing is just a rehearsal for winning!', 'Falhar é só ensaio pra vencer!'],
          ['It is fine! The first take is never the one.', 'Tudo bem! O primeiro take nunca é o bom.'],
          ['Next try is on me! Okay, it is free anyway.', 'A próxima tentativa é por minha conta! Ok, é de graça igual.'],
        ],
        praise: [
          ['WOW! Perfect shot! Frame it!', 'UAU! Golpe perfeito! Emoldura!', { icon: 'camera' }],
          ['That was stunning! Can I use it in my portfolio?', 'Isso foi lindo! Posso pôr no meu portfólio?', { icon: 'camera' }],
          ['Great combo! Tip jar is free to ignore!', 'Ótimo combo! O pote de gorjeta é opcional!'],
          ['Positive vibes! You are glowing!', 'Vibe positiva! Você está brilhando!'],
          ['Clean! I would pay for that. Almost.', 'Limpo! Eu pagaria por isso. Quase.'],
        ],
        heroLow: [
          ['Careful! Low health! I can sell you a discount potion!', 'Cuidado! Vida baixa! Vendo poção com desconto!'],
          ['Do not lose hope! Or your health bar!', 'Não perca a esperança! Nem a barra de vida!'],
          ['You are in the red! Red looks good on you though!', 'Você tá no vermelho! Mas vermelho te cai bem!'],
          ['Breathe. Positive thoughts. Heal.', 'Respira. Pensamento positivo. Cura.'],
        ],
        'hitBy:coldsnap': [
          ['Brr! Cold! Hey, my forehead is the only warm part!', 'Brr! Frio! Ei, minha testa é a única parte quente!'],
          ['Frozen! Perfect still life!', 'Congelado! Natureza-morta perfeita!', { icon: 'camera' }],
          ['Cold Snap! Nice and chilly! Refreshing!', 'Cold Snap! Geladinho! Refrescante!'],
        ],
        'hitBy:tornado': [
          ['Wheee! A tornado! Great action shot!', 'Uiii! Um tornado! Ótima foto de ação!', { icon: 'camera' }],
          ['My balding head is the aerodynamic one!', 'Minha careca é a aerodinâmica!'],
          ['Up in the air! Best view in the house!', 'No ar! A melhor vista da casa!'],
        ],
        'hitBy:sunstrike': [
          ['Free tan! Plus SPF zero! Ow!', 'Bronzeado grátis! E FPS zero! Ai!'],
          ['Bright! Too bright! My lens! My head!', 'Brilhante! Brilhante demais! Minha lente! Minha cabeça!'],
          ['Sun Strike! My forehead is a solar panel!', 'Sun Strike! Minha testa é um painel solar!'],
        ],
        'hitBy:chaosmeteor': [
          ['Meteor! Epic shot! Sorry, ow!', 'Meteoro! Foto épica! Desculpa, ai!', { icon: 'camera' }],
          ['A meteor! Is the crater free to visit?', 'Um meteoro! A cratera é de graça pra visitar?'],
          ['Ow! Hot! But positive! Hot positive!', 'Ai! Quente! Mas positivo! Quente positivo!'],
        ],
        'hitBy:deafeningblast': [
          ['LOUD! BUT I LOVE THE ENERGY!', 'ALTO! MAS EU ADORO A ENERGIA!'],
          ['Sound wave! Beautiful ripple, ow!', 'Onda sonora! Ondulação linda, ai!'],
          ['Ringing in my ears! Positive ringing!', 'Zumbido nos ouvidos! Zumbido positivo!'],
        ],
        'hitBy:emp': [
          ['Where did my mana go? Is it on sale somewhere?', 'Pra onde foi minha mana? Tá em promoção em algum lugar?'],
          ['Mana gone! Camera battery too! Why!', 'Mana foi! Bateria da câmera também! Por quê!', { icon: 'camera' }],
          ['EMP! Ha! Free mana drain! My favorite price!', 'EMP! Ha! Drenagem grátis! Meu preço favorito!'],
        ],
        'hitBy:icewall': [
          ['An ice wall! Great backdrop for a portrait!', 'Uma parede de gelo! Ótimo fundo pra retrato!', { icon: 'camera' }],
          ['Freezing, but photogenic!', 'Congelante, mas fotogênica!'],
        ],
        'hitBy:alacrity': [
          ['Fast Invoker! I will get a blurred shot, great!', 'Invoker rápido! Vou tirar uma foto borrada, ótimo!', { icon: 'camera' }],
          ['Is that buff on sale? Looks premium!', 'Esse buff tá em promoção? Parece premium!'],
        ],
        'hitBy:forgespirit': [
          ['Lava buddy! Hello, little guy! Pose for me!', 'Amigo de lava! Oi, carinha! Posa pra mim!', { icon: 'camera' }],
          ['A fire spirit! Free heater for the winter!', 'Um espírito de fogo! Aquecedor grátis pro inverno!'],
        ],
        'hitBy:ghostwalk': [
          ['A ghost! Spooky shot! Let me change lenses!', 'Um fantasma! Foto assustadora! Deixa eu trocar a lente!', { icon: 'camera' }],
          ['Ghost! Friendly ghost! Positive ghost!', 'Fantasma! Fantasma amigo! Fantasma positivo!'],
        ],
        'hitBy:atos': [
          ['Rooted! Great, I can stay for the photo!', 'Enraizado! Ótimo, fico pra foto!', { icon: 'camera' }],
          ['Tethered! At least I am not paying for the leash!', 'Preso! Pelo menos não pago pela coleira!'],
        ],
        'hitBy:vyse': [
          ['Baa! Fluffy! I always wanted wool!', 'Béé! Fofinho! Sempre quis lã!'],
          ['A sheep! Great for the portfolio! Baa!', 'Uma ovelha! Ótimo pro portfólio! Béé!'],
        ],
        'hitBy:shiva': [
          ['Cold wave! Freezing but fabulous!', 'Onda de frio! Congelando mas fabuloso!'],
          ['Shiva! That is a pricey item! Impressive!', 'Shiva! Item caro! Impressionante!'],
        ],
        'hitBy:meteorhammer': [
          ['A hammer! At that price, I hope it was worth it!', 'Um martelo! Nesse preço, espero que tenha valido!'],
          ['Ow! The burn! But the glow is nice!', 'Ai! A queimadura! Mas o brilho é bonito!'],
        ],
        'hitBy:orchid': [
          ['Silenced! Great, my photos speak for themselves!', 'Silenciado! Ótimo, minhas fotos falam por si!'],
          ['Cannot cast! Fine, I have a camera.', 'Não lanço! Tudo bem, eu tenho uma câmera.', { icon: 'camera' }],
        ],
        'hitBy:gleipnir': [
          ['Chains! A little kinky, a lot positive!', 'Correntes! Um pouco kinky, muito positivo!'],
          ['Stuck! I get to stay for the sunset!', 'Preso! Fico pro pôr do sol!'],
        ],
        'hitBy:forcestaff': [
          ['Pushed! Bye, bye! Photo from afar!', 'Empurrado! Tchau, tchau! Foto de longe!', { icon: 'camera' }],
          ['Whoa! Free ride! I accept!', 'Opa! Carona grátis! Aceito!'],
        ],
        'hitBy:dust': [
          ['Dust! Glitter! My lens! My eyes!', 'Dust! Glitter! Minha lente! Meus olhos!'],
          ['Achoo! Dust! Not free of charge to my allergies!', 'Atchim! Dust! Não é grátis pra minha alergia!'],
        ],
      },
    },

    // ENEMY: Vitinho. Loves America / Uncle Sam, works all day, fixated on monkeys (self-styled leader of the primate clan),
    // very stressed, plays off-meta heroes in unthinkable roles, buys exquisite items.
    vitinho: {
      cd: 4, chat: 0.85, lineCd: 40, fallback: 'default', lines: {
        spawn: [
          ['The Clan has been summoned. I am your leader. Monkeys, assemble!', 'O Clã foi convocado. Eu sou o líder. Macacos, em formação!', { icon: 'monkey' }],
          ['God bless America! And whoever is in this lobby!', 'Deus abençoe a América! E quem está nesse lobby!', { icon: 'star' }],
          ['I have a meeting in five minutes. This will take four.', 'Tenho reunião em cinco minutos. Isso leva quatro.'],
          ['Currently playing Chen carry mid. Do not ask.', 'Jogando Chen carry mid. Não pergunte.'],
          ['Uncle Sam wants YOU... to lose, respectfully.', 'O Tio Sam quer VOCÊ... perdendo, com respeito.', { icon: 'star' }],
          ['Hold on, answering one email. And one more. And one more.', 'Pera, vou responder um e-mail. E mais um. E mais um.'],
          ['I bought a Divine Rapier for my support. Do not judge.', 'Comprei um Divine Rapier pro meu suporte. Não julgue.'],
          ['Ooh ooh aah aah. That is "hello" in Primate.', 'Ooh ooh aah aah. Isso é "oi" em Primata.', { icon: 'monkey' }],
        ],
        idle: [
          ['Do you know how many monkeys there are in Brazil? I do.', 'Você sabe quantos macacos tem no Brasil? Eu sei.', { icon: 'monkey' }],
          ['Eagles, fireworks, burgers. A perfect Tuesday.', 'Águias, fogos, hambúrgueres. Uma terça perfeita.', { icon: 'star' }],
          ['I have 14 tabs of spreadsheets open. Send help.', 'Tenho 14 abas de planilha abertas. Mande ajuda.'],
          ['Rubick as a hard carry is underrated. Trust me.', 'Rubick de hard carry é subestimado. Confie.'],
          ['One more KPI and I will turn into a banana.', 'Mais um KPI e eu viro uma banana.', { icon: 'monkey' }],
          ['I should sleep. Haha. No.', 'Eu devia dormir. Haha. Não.'],
          ['The Clan does not rest. Neither do I. Never.', 'O Clã não descansa. Eu também não. Nunca.', { icon: 'monkey' }],
          ['Sorry, mid-call. It is a monkey call.', 'Desculpa, estou em call. É uma call de macacos.', { icon: 'monkey' }],
        ],
        idleLong: [
          ['Time is money, friend. Cast something.', 'Tempo é dinheiro, amigo. Lança algo.'],
          ['I could close three deals in the time you are taking.', 'Eu fecharia três negócios no tempo que você tá levando.'],
          ['My calendar is full and so is my patience. Almost.', 'Minha agenda tá cheia e minha paciência também. Quase.'],
          ['The Clan is getting restless. So am I.', 'O Clã tá ficando inquieto. Eu também.', { icon: 'monkey' }],
          ['This could have been an email. Or a combo.', 'Isso podia ser um e-mail. Ou um combo.'],
          ['Stress level: 9000. Say something.', 'Nível de estresse: 9000. Fala alguma coisa.'],
          ['Hello? I am billing you for this wait.', 'Alô? Tô cobrando por essa espera.'],
          ['Ooh ooh. That means "go". In Primate.', 'Ooh ooh. Isso quer dizer "vai". Em Primata.', { icon: 'monkey' }],
        ],
        damaged: [
          ['Ow! This is not in the budget!', 'Ai! Isso não estava no orçamento!'],
          ['Hey! I am in the middle of a deadline!', 'Ei! Estou no meio de um prazo!'],
          ['The Clan felt that one!', 'O Clã sentiu essa!', { icon: 'monkey' }],
          ['Ooh! Ooh! Aah! That hurt!', 'Ooh! Ooh! Aah! Doeu!', { icon: 'monkey' }],
          ['Freedom is not free, and neither is that damage!', 'Liberdade não é de graça, e esse dano também não!', { icon: 'star' }],
          ['I am stressed enough already, thank you!', 'Já estou estressado o bastante, obrigado!'],
          ['My premium item did not stop that. Refund!', 'Meu item premium não impediu isso. Reembolso!'],
          ['Nobody hits the Leader of the Clan! Okay, you did.', 'Ninguém bate no Líder do Clã! Tá, você bateu.', { icon: 'monkey' }],
        ],
        stunned: [
          ['Stuck! My boss will understand! He will not!', 'Preso! Meu chefe vai entender! Não vai!'],
          ['Unplanned downtime! My nightmare!', 'Parada não planejada! Meu pesadelo!'],
          ['I like this. A forced break. Wait, no, deadline!', 'Gostei. Uma pausa forçada. Pera, não, prazo!'],
          ['Cannot move! Calling the Clan! Ooh! Ooh!', 'Não me mexo! Chamando o Clã! Ooh! Ooh!', { icon: 'monkey' }],
          ['Stunned like a banana in a blender!', 'Atordoado feito banana no liquidificador!'],
          ['A moment of silence... for my inbox.', 'Um minuto de silêncio... pela minha caixa de entrada.'],
        ],
        nearDeath: [
          ['My health is lower than my sleep hours!', 'Minha vida tá menor que minhas horas de sono!'],
          ['Clan, protect your leader! Hello? Clan?', 'Clã, protejam seu líder! Alô? Clã?', { icon: 'monkey' }],
          ['I have a rare item for this! Where is it? WHERE?', 'Tenho um item raro pra isso! Cadê? CADÊ?'],
          ['I did not survive five quarterlies for this!', 'Eu não sobrevivi a cinco trimestres pra isso!'],
          ['America, land of the free, home of the nearly dead!', 'América, terra dos livres, lar dos quase mortos!', { icon: 'star' }],
          ['Not like this! I still have PTO unused!', 'Assim não! Ainda tenho férias sobrando!'],
        ],
        death: [
          ['Tell my family I was working!', 'Diz pra minha família que eu estava trabalhando!'],
          ['The Clan will avenge me! Ooh... ooh...', 'O Clã vai me vingar! Ooh... ooh...', { icon: 'monkey' }],
          ['Finally, some rest!', 'Finalmente, um descanso!'],
          ['I am out of office. Permanently.', 'Estou fora do escritório. Permanentemente.'],
          ['Please ship my exquisite items to my family.', 'Por favor mande meus itens requintados pra minha família.'],
          ['God bless America... and the monkeys...', 'Deus abençoe a América... e os macacos...', { icon: 'star' }],
          ['Remember me as a leader. A loud, stressed leader.', 'Lembrem de mim como líder. Um líder barulhento e estressado.'],
          ['Tomorrow I will respawn as a gorilla.', 'Amanhã eu renasço como gorila.', { icon: 'monkey' }],
        ],
        killedHero: [
          ['Another victory for the Clan! Ooh ooh aah aah!', 'Mais uma vitória do Clã! Ooh ooh aah aah!', { icon: 'monkey' }],
          ['Winner winner, chicken dinner! America!', 'Vencedor vencedor, jantar de frango! América!', { icon: 'star' }],
          ['You were not on my roadmap. Neither was I winning.', 'Você não estava no meu roadmap. Eu vencer também não.'],
          ['Good game! Send the invoice to my boss.', 'Bom jogo! Mande a fatura pro meu chefe.'],
          ['Mark this on the calendar: I won something!', 'Marca no calendário: eu ganhei uma coisa!'],
          ['Do not cry. The Clan has tissues.', 'Não chore. O Clã tem lenços.', { icon: 'monkey' }],
        ],
        playerMissed: [
          ['Missed! That is a negative ROI!', 'Errou! Isso é ROI negativo!'],
          ['Wasted resources! A true tragedy!', 'Recurso desperdiçado! Uma verdadeira tragédia!'],
          ['The Clan saw that. The Clan is laughing.', 'O Clã viu isso. O Clã está rindo.', { icon: 'monkey' }],
          ['I have seen baby monkeys with better aim!', 'Já vi macaquinho com mira melhor!', { icon: 'monkey' }],
          ['Not even in the quarterly forecast!', 'Nem estava na previsão do trimestre!'],
          ['Missed me! But America would be proud of the effort.', 'Errou! Mas a América se orgulharia do esforço.', { icon: 'star' }],
          ['Strike one! Baseball rules apply!', 'Strike um! Regras de beisebol!'],
          ['It is ok. We all fail. Not me, but you do.', 'Tudo bem. Todos falham. Eu não, mas você sim.'],
        ],
        playerWhiffSunstrike: [
          ['Sun Strike? More like Sun Stroke of bad luck!', 'Sun Strike? Mais pra Sun Strike do azar!'],
          ['The sun hit the ground. The ground is stressed too.', 'O sol acertou o chão. O chão também tá estressado.'],
          ['A spotlight for no one! Typical meeting!', 'Um holofote pra ninguém! Reunião típica!'],
          ['Fireworks! 4th of July early! America!', 'Fogos de artifício! 4 de julho adiantado! América!', { icon: 'star' }],
          ['The Clan applauds your pyrotechnics. Zero damage.', 'O Clã aplaude sua pirotecnia. Zero dano.', { icon: 'monkey' }],
          ['Beautiful. Useless. Just like my last promotion.', 'Lindo. Inútil. Igual minha última promoção.'],
        ],
        heroInvisible: [
          ['Where did you go?! Do not do this to me today!', 'Pra onde você foi?! Não faz isso comigo hoje!'],
          ['Invisible?! Is this a stealth update?!', 'Invisível?! Isso é update furtivo?!'],
          ['Ooh ooh! The Clan sees through your tricks! Does it?', 'Ooh ooh! O Clã vê através dos seus truques! Vê?', { icon: 'monkey' }],
          ['Great. Another thing I cannot see on the dashboard.', 'Ótimo. Mais uma coisa que não vejo no painel.'],
          ['Hiding from me? I am the Leader of the Clan!', 'Se escondendo de mim? Sou o Líder do Clã!', { icon: 'monkey' }],
          ['Ghost mode? In America, we call that remote work.', 'Modo fantasma? Na América, isso se chama trabalho remoto.', { icon: 'star' }],
        ],
        night: [
          ['Night? I did not notice. I never left my desk.', 'Noite? Nem notei. Nunca saí da mesa.'],
          ['Night shift! My favorite shift! And my only shift!', 'Turno da noite! Meu turno favorito! E o único!'],
          ['The Clan is nocturnal. So am I. By necessity.', 'O Clã é noturno. Eu também. Por necessidade.', { icon: 'monkey' }],
          ['Dark outside. Screen is bright. All is well.', 'Escuro lá fora. Tela clara. Tudo bem.'],
          ['Midnight snack: a banana. And coffee. Mostly coffee.', 'Lanche da madrugada: banana. E café. Principalmente café.', { icon: 'monkey' }],
          ['Even the moon works overtime. Respect.', 'Até a lua faz hora extra. Respeito.'],
        ],
        dustUsed: [
          ['Dust! A premium item, naturally!', 'Dust! Um item premium, naturalmente!'],
          ['Exquisite timing! And an exquisite item!', 'Timing requintado! E item requintado!'],
          ['Revealed! Like my quarterly results!', 'Revelado! Igual meus resultados trimestrais!'],
          ['Ooh ooh! Glitter for the Clan!', 'Ooh ooh! Glitter pro Clã!', { icon: 'monkey' }],
          ['Open the curtains! Dust to America!', 'Abram as cortinas! Dust pra América!', { icon: 'star' }],
          ['Consider yourself audited!', 'Considere-se auditado!'],
        ],
        pitJuke: [
          ['Follow me into the pit! It is a team-building exercise!', 'Me segue pro fosso! É dinâmica de integração!'],
          ['Come to the pit! The Clan awaits!', 'Vem pro fosso! O Clã espera!', { icon: 'monkey' }],
          ['Jump! It is an investment in the future!', 'Pula! É um investimento no futuro!'],
          ['Meeting in the pit. Bring your own banana.', 'Reunião no fosso. Traga sua banana.', { icon: 'monkey' }],
          ['Freedom! Dive! USA! USA!', 'Liberdade! Mergulho! EUA! EUA!', { icon: 'star' }],
          ['Catch me down there! I scheduled it!', 'Me pega lá embaixo! Eu agendei!'],
        ],
        caught: [
          ['Got you! One more win for the Clan!', 'Te peguei! Mais uma vitória do Clã!', { icon: 'monkey' }],
          ['Caught! Efficient! Productive! American!', 'Pego! Eficiente! Produtivo! Americano!', { icon: 'star' }],
          ['Gotcha! Add it to my performance review!', 'Peguei! Põe na minha avaliação de desempenho!'],
          ['Tag! You are IT! Please update the ticket.', 'Pegou! Você é o pegador! Atualize o ticket, por favor.'],
          ['Hah! Even stressed, I catch you!', 'Hah! Até estressado eu te pego!'],
          ['Ooh ooh aah aah! That is "gotcha" in Primate!', 'Ooh ooh aah aah! Isso é "peguei" em Primata!', { icon: 'monkey' }],
          ['Caught! Now sign the NDA.', 'Pego! Agora assine o NDA.'],
          ['This is what happens when you skip standup!', 'Isso é o que acontece quando você pula a daily!'],
        ],
        escaped: [
          ['You escaped?! I have a deadline for catching you!', 'Você escapou?! Tenho prazo pra te pegar!'],
          ['Ooh! Ooh! Come back! The Clan demands it!', 'Ooh! Ooh! Volta! O Clã exige!', { icon: 'monkey' }],
          ['Slippery like a banana peel!', 'Escorregadio feito casca de banana!'],
          ['Fine! Go! I have other meetings anyway!', 'Beleza! Vai! Tenho outras reuniões mesmo!'],
          ['Land of the free... and the slippery!', 'Terra dos livres... e dos escorregadios!', { icon: 'star' }],
          ['My KPI! My beautiful KPI!', 'Meu KPI! Meu lindo KPI!'],
        ],
        playerFail: [
          ['Nothing happened? That is a failed deliverable!', 'Nada aconteceu? Isso é entrega reprovada!'],
          ['Wrong button. We need a process for this.', 'Botão errado. Precisamos de um processo pra isso.'],
          ['Ooh ooh? Aah? That means "try again" in Primate.', 'Ooh ooh? Aah? Isso quer dizer "tenta de novo" em Primata.', { icon: 'monkey' }],
          ['Have you tried a higher-premium keyboard?', 'Já tentou um teclado mais premium?'],
          ['The Clan is disappointed. I am not mad, just stressed.', 'O Clã está decepcionado. Não estou bravo, só estressado.', { icon: 'monkey' }],
        ],
        comboFail: [
          ['Failed! Quick! Schedule a post-mortem!', 'Falhou! Rápido! Agende um post-mortem!'],
          ['Do not worry. In America failure is called a pivot.', 'Não se preocupe. Na América falha se chama pivô.', { icon: 'star' }],
          ['Combo failed. Add it to the backlog.', 'Combo falhou. Joga no backlog.'],
          ['The Clan shall remember this. In detail.', 'O Clã vai lembrar disso. Em detalhes.', { icon: 'monkey' }],
          ['A swing and a miss! Baseball! America!', 'Girou e errou! Beisebol! América!', { icon: 'star' }],
        ],
        praise: [
          ['Excellent! Promote this man!', 'Excelente! Promovam esse homem!'],
          ['Ooh ooh aah aah! The Clan approves!', 'Ooh ooh aah aah! O Clã aprova!', { icon: 'monkey' }],
          ['That is what I call a synergy!', 'Isso é o que eu chamo de sinergia!'],
          ['God bless America! And God bless that combo!', 'Deus abençoe a América! E esse combo!', { icon: 'star' }],
          ['Ten out of ten. Eleven if you had worked weekends.', 'Dez de dez. Onze se você trabalhasse nos fins de semana.'],
        ],
        heroLow: [
          ['Your health is low! Do you have medical insurance?', 'Sua vida tá baixa! Você tem plano de saúde?'],
          ['Careful! Burnout is real! Trust me!', 'Cuidado! Burnout é real! Confie em mim!'],
          ['The Clan sends a banana. Eat to recover.', 'O Clã manda uma banana. Coma pra se recuperar.', { icon: 'monkey' }],
          ['Red bar! Escalating to management!', 'Barra vermelha! Escalando pra gerência!'],
        ],
        'hitBy:coldsnap': [
          ['Cold! The office air conditioning follows me!', 'Frio! O ar-condicionado do escritório me segue!'],
          ['Frozen assets! My worst fear!', 'Ativos congelados! Meu maior medo!'],
          ['Brr! Ooh ooh brr! Monkeys hate the cold!', 'Brr! Ooh ooh brr! Macaco odeia frio!', { icon: 'monkey' }],
        ],
        'hitBy:tornado': [
          ['Tornado! The American dream is in the wind!', 'Tornado! O sonho americano está no vento!', { icon: 'star' }],
          ['Whoa! Spinning like my KPIs!', 'Uau! Girando igual meus KPIs!'],
          ['Wheee! Monkeys swing in trees, I swing in tornadoes!', 'Uiii! Macaco balança em árvore, eu balanço em tornado!', { icon: 'monkey' }],
        ],
        'hitBy:sunstrike': [
          ['Hot! Hotter than my inbox!', 'Quente! Mais quente que minha caixa de entrada!'],
          ['Sun Strike! Direct hit on the Leader of the Clan!', 'Sun Strike! Acerto direto no Líder do Clã!', { icon: 'monkey' }],
          ['I hope the sunscreen is a deductible expense!', 'Espero que protetor solar seja dedutível!'],
        ],
        'hitBy:chaosmeteor': [
          ['Meteor! Armageddon! I did not budget for this!', 'Meteoro! Armageddon! Não orcei isso!'],
          ['Like a Hollywood movie! Thank you, America!', 'Igual filme de Hollywood! Obrigado, América!', { icon: 'star' }],
          ['Ooh ooh! It burns! It burns like Mondays!', 'Ooh ooh! Queima! Queima igual segunda-feira!', { icon: 'monkey' }],
        ],
        'hitBy:deafeningblast': [
          ['LOUD! SOUNDS LIKE MY OFFICE!', 'ALTO! PARECE MEU ESCRITÓRIO!'],
          ['AHH! MY EARS! I WAS ON MUTE!', 'AHH! MEUS OUVIDOS! EU ESTAVA NO MUDO!'],
          ['The blast is louder than the Clan! Impressive!', 'O blast é mais alto que o Clã! Impressionante!', { icon: 'monkey' }],
        ],
        'hitBy:emp': [
          ['My mana! My budget! Gone!', 'Minha mana! Meu orçamento! Foi!'],
          ['EMP?! Have you no respect for the economy?!', 'EMP?! Você não respeita a economia?!'],
          ['Drained! Just like my Fridays!', 'Drenado! Igual minhas sextas!'],
        ],
        'hitBy:icewall': [
          ['A wall! I am not building it! Nobody is paying for it!', 'Uma parede! Eu não construo! Ninguém paga por ela!'],
          ['An ice wall! Border control! America!', 'Uma parede de gelo! Controle de fronteira! América!', { icon: 'star' }],
        ],
        'hitBy:alacrity': [
          ['Fast! Efficiency! I approve this speed boost!', 'Rápido! Eficiência! Aprovo esse boost de velocidade!'],
          ['That buff is a premium item! I want one!', 'Esse buff é item premium! Eu quero um!'],
        ],
        'hitBy:forgespirit': [
          ['A tiny spirit! Intern? Welcome to the team!', 'Um espírito pequeno! Estagiário? Bem-vindo ao time!'],
          ['Ooh ooh! A fire monkey! I want to lead him!', 'Ooh ooh! Um macaco de fogo! Quero liderá-lo!', { icon: 'monkey' }],
        ],
        'hitBy:ghostwalk': [
          ['Invisible?! This is why I use security cameras!', 'Invisível?! É por isso que uso câmera de segurança!'],
          ['A ghost! In the cloud! I knew it!', 'Um fantasma! Na nuvem! Eu sabia!'],
        ],
        'hitBy:atos': [
          ['Rooted! Is this a hostile takeover?!', 'Enraizado! Isso é uma aquisição hostil?!'],
          ['Tethered! Like my phone to the charger!', 'Preso! Igual meu celular no carregador!'],
        ],
        'hitBy:vyse': [
          ['Baa! Not a monkey! A sheep! The humiliation!', 'Béé! Não é macaco! É ovelha! A humilhação!', { icon: 'monkey' }],
          ['Hexed! That is a luxury item! I respect it!', 'Hex! Isso é item de luxo! Respeito!'],
        ],
        'hitBy:shiva': [
          ['Shiva! Pricey! Impressive! Cold!', 'Shiva! Caro! Impressionante! Frio!'],
          ['Cold wave! Like a layoff email!', 'Onda de frio! Igual e-mail de demissão!'],
        ],
        'hitBy:meteorhammer': [
          ['A hammer?! A hammer from the sky?! Where is the invoice?!', 'Um martelo?! Do céu?! Cadê a nota fiscal?!'],
          ['Burning! Burning! My item is better, though!', 'Queimando! Queimando! O meu item é melhor, porém!'],
        ],
        'hitBy:orchid': [
          ['Silenced! Finally, a meeting where I cannot talk!', 'Silenciado! Finalmente uma reunião onde não posso falar!'],
          ['Cannot cast! My premium spells!', 'Não lanço! Minhas magias premium!'],
        ],
        'hitBy:gleipnir': [
          ['Chains! Handcuffs! Legal will hear about this!', 'Correntes! Algemas! O jurídico vai saber disso!'],
          ['Stuck! Zapped! Overworked and underpaid!', 'Preso! Eletrocutado! Sobrecarregado e mal pago!'],
        ],
        'hitBy:forcestaff': [
          ['Pushed! I am just being pulled by the market!', 'Empurrado! Só estou sendo puxado pelo mercado!'],
          ['Whoa! Fast travel! Not authorized!', 'Opa! Viagem rápida! Não autorizada!'],
        ],
        'hitBy:dust': [
          ['Dust! I am revealed! My secrets!', 'Dust! Estou revelado! Meus segredos!'],
          ['Achoo! Allergic to transparency!', 'Atchim! Alérgico a transparência!'],
        ],
      },
    },

    // ENEMY: Nando. Lives in Sao Paulo, invites everyone to his Ubatuba apartment, very energetic,
    // often muted (girlfriend nearby): some bubbles are only the muted-mic icon, some are cut off with a dash.
    // SPRITE TODO: no art yet. 'nando' is not in IT.GAME.SKINS, so he never spawns (a stray unit would render as pedro) until a sheet is drawn.
    nando: {
      cd: 4, chat: 0.9, lineCd: 40, fallback: 'default', lines: {
        spawn: [
          ['LET\'S GOOO! Sao Paulo in the house!', 'BORA! São Paulo na área!'],
          ['Hey! You should come to my place in Ubatuba! It has a—', 'Ei! Vem pro meu apê em Ubatuba! Ele tem—'],
          MUTE,
          ['Ready? I am SO ready! I had two coffees! And a third!', 'Pronto? Tô MUITO pronto! Tomei dois cafés! E um terceiro!'],
          ['Traffic on Marginal was crazy, but I made it! Barely!', 'O trânsito na Marginal tava louco, mas cheguei! Quase!'],
          ['Wait wait wait, one sec, I am just—', 'Pera pera pera, um segundinho, eu só—'],
          ['Ubatuba is calling. Beach, caipirinha, ping—', 'Ubatuba tá chamando. Praia, caipirinha, pin—'],
          ['Hi everyone! Hi! Hi hi hi! Wow, so many people!', 'Oi gente! Oi! Oi oi oi! Nossa, quanta gente!'],
        ],
        idle: [
          ['Bro, my apartment in Ubatuba has an ocean view! Come over!', 'Mano, meu apê em Ubatuba tem vista pro mar! Vem pra cá!'],
          MUTE,
          ['I love São Paulo! Concrete everywhere! Beautiful!', 'Eu amo São Paulo! Concreto pra todo lado! Lindo!'],
          ['Do you want to go to Ubatuba this weekend? I will drive! I think!', 'Bora pra Ubatuba no fim de semana? Eu dirijo! Acho!'],
          ['She said I am too loud, but I am just excited—', 'Ela disse que eu sou alto demais, mas eu tô só empolgado—'],
          MUTE,
          ['Pizza on Friday, beach on Saturday, mage on Sunday!', 'Pizza na sexta, praia no sábado, mago no domingo!'],
          ['I have an extra bed in Ubatuba! Two! Maybe three!', 'Tenho uma cama sobrando em Ubatuba! Duas! Talvez três!'],
          ['Hold on I am going to—', 'Pera aí que eu vou—'],
          ['Everything is amazing! Life! Gaming! Hot dogs!', 'Tudo é incrível! Vida! Jogo! Cachorro-quente!'],
        ],
        idleLong: [
          ['Hey, are you thinking? Think faster! I believe in you!', 'Ei, tá pensando? Pensa mais rápido! Eu acredito em você!'],
          ['While you decide, let me tell you about my Ubatuba apart—', 'Enquanto você decide, deixa eu falar do meu apê em Ubatu—'],
          MUTE,
          ['Cast! Cast! Cast! Cast! Okay, cast!', 'Lança! Lança! Lança! Lança! Tá, lança!'],
          ['Come on! My coffee is getting cold! And my energy is not!', 'Vai! Meu café tá esfriando! E minha energia não!'],
          ['It is OK, take your time! But also hurry!', 'Tranquilo, sem pressa! Mas também corre!'],
          ['I have never waited this long. Okay, once. For the ferry to—', 'Nunca esperei tanto. Tá, uma vez. Pela balsa pra—'],
          MUTE,
        ],
        damaged: [
          ['Ow! Hey! Rude! But also impressive!', 'Ai! Ei! Sem educação! Mas também impressionante!'],
          ['Ouch! That one went straight to my caipirinha!', 'Aii! Essa foi direto na minha caipirinha!'],
          ['Hit me again! Just kidding! Do not!', 'Bate de novo! Brincadeira! Não bate!'],
          ['AAH! I almost shouted. Almost. She is sleeping.', 'AAH! Quase gritei. Quase. Ela tá dormindo.'],
          MUTE,
          ['Hey! I invited you to Ubatuba, and this is how you—', 'Ei! Eu te convidei pra Ubatuba, e é assim que você—'],
          ['Oww! Okay, okay, I felt that one in my São Paulo!', 'Aiii! Tá, tá, senti essa na minha São Paulo!'],
          ['Ow!! Sorry, volume. Mic. Sorry.', 'Ai!! Desculpa, volume. Mic. Desculpa.'],
        ],
        stunned: [
          ['I cannot move! This is worse than Marginal traffic!', 'Não me mexo! Isso é pior que trânsito na Marginal!'],
          ['Stunned! Stunned! Stunned! Say something nice!', 'Atordoado! Atordoado! Atordoado! Diz algo legal!'],
          MUTE,
          ['Okay, a pause. I can use it to invite you to Ubatu—', 'Tá, uma pausa. Posso usar pra te convidar pra Ubatu—'],
          ['Stuck like a car on the Tietê!', 'Preso igual carro no Tietê!'],
          ['Wow! I am frozen! Cool! Literally!', 'Nossa! Congelei! Maneiro! Literalmente!'],
        ],
        nearDeath: [
          ['I am almost dead! Come to my funeral in Ubatuba!', 'Tô quase morto! Vem no meu velório em Ubatuba!'],
          ['Low health low health low health—', 'Vida baixa vida baixa vida baixa—'],
          MUTE,
          ['Help! Somebody! Pizza! Please! Pizza!', 'Socorro! Alguém! Pizza! Por favor! Pizza!'],
          ['I have not even shown you my balcony!', 'Eu nem te mostrei minha varanda!'],
          ['One more hit and I am a beach memory!', 'Mais um golpe e viro lembrança de praia!'],
        ],
        death: [
          ['I will be back! At my Ubatuba apartment! Come!', 'Eu volto! No meu apê de Ubatuba! Vem!'],
          ['It was a great time! The best! Wow! Ahh—', 'Foi um tempão ótimo! O melhor! Nossa! Ahh—'],
          MUTE,
          ['Bye! Bye bye bye bye! See you in São Pau—', 'Tchau! Tchau tchau tchau tchau! A gente se vê em São Pau—'],
          ['GG! Awesome! Wait, I died, right? Awesome!', 'GG! Incrível! Pera, eu morri, né? Incrível!'],
          ['Rest in pieces! But in a fun way!', 'Descanse em pedaços! Mas de um jeito divertido!'],
          ['Save my place in Ubatuba!', 'Guarda meu lugar em Ubatuba!'],
          ['Tell her I was—', 'Diz pra ela que eu tava—'],
        ],
        killedHero: [
          ['WE WON! WE WON! Pizza on me!', 'GANHAMOS! GANHAMOS! Pizza por minha conta!'],
          ['Yes!! Yes!! Ye—', 'Isso!! Isso!! Is—'],
          ['Good fight! Come to Ubatuba to recover!', 'Boa luta! Vem pra Ubatuba se recuperar!'],
          MUTE,
          ['That was AMAZING! Sorry! You died! Sorry!', 'Isso foi INCRÍVEL! Desculpa! Você morreu! Desculpa!'],
          ['Another one! Let\'s celebrate at the beach!', 'Mais um! Bora comemorar na praia!'],
        ],
        playerMissed: [
          ['Missed! But so close! Close like São Paulo is to Santos!', 'Errou! Mas tão perto! Perto igual São Paulo de Santos!'],
          ['Whoa! The air got hit! Poor air!', 'Uau! O ar levou! Coitado do ar!'],
          ['Oh no! Hey, no worries, try again, I believe in—', 'Ah não! Ei, sem stress, tenta de novo, eu acredito em—'],
          MUTE,
          ['You missed! I will not tell anyone! Except the entire chat!', 'Você errou! Não conto pra ninguém! Só pro chat inteiro!'],
          ['Dude! Aim! Like fishing in Ubatuba!', 'Cara! Mira! Que nem pescaria em Ubatuba!'],
          ['Ooooh! Almost! So almost! Almost!', 'Ooooh! Quase! Tão quase! Quase!'],
          ['Whiff! Hehe—! Sorry. Not sorry.', 'Errou! Hehe—! Desculpa. Nem tanto.'],
        ],
        playerWhiffSunstrike: [
          ['The sun missed me! It is a beach day anyway!', 'O sol me errou! Dia de praia de qualquer jeito!'],
          ['Sun Strike on the sand! Perfect for a tan!', 'Sun Strike na areia! Perfeito pra bronzear!'],
          ['Wasted sunshine! In São Paulo we never get this much!', 'Sol desperdiçado! Em São Paulo a gente nunca tem tanto!'],
          MUTE,
          ['Whoa, that was bright! Almost got me! Hahaha—', 'Nossa, que clarão! Quase me pega! Hahaha—'],
          ['The sun is on vacation. In Ubatuba. Like me!', 'O sol tá de férias. Em Ubatuba. Igual eu!'],
        ],
        heroInvisible: [
          ['Where did you go?! Come to Ubatuba and I will find you!', 'Pra onde você foi?! Vem pra Ubatuba que eu te acho!'],
          ['Ghost! A ghost! A fun ghost! Hi ghost!', 'Fantasma! Um fantasma! Um fantasma divertido! Oi fantasma!'],
          MUTE,
          ['Wow, vanishing act! Do it at parties too! Please do it at my—', 'Uau, sumiço! Faz em festa também! Faz na minha—'],
          ['I cannot see you! I can hear you breathe! Hahaha!', 'Não te vejo! Mas ouço você respirando! Hahaha!'],
          ['Invisible and awesome! Rare combo!', 'Invisível e incrível! Combinação rara!'],
        ],
        night: [
          ['Night! Time for the late-night snack in Pinheiros!', 'Noite! Hora do lanche da madrugada em Pinheiros!'],
          ['It is night, so I whisper. Hello. Hello!!', 'É noite, então eu sussurro. Oi. OI!!'],
          MUTE,
          ['Night in São Paulo never sleeps! Neither do I!', 'Noite em São Paulo nunca dorme! Eu também não!'],
          ['The stars look amazing from my Ubatuba balco—', 'As estrelas ficam lindas da minha varan—'],
          ['Lights off! Shh! Okay, I will shout very quietly!', 'Luzes apagadas! Shh! Tá, vou gritar bem baixinho!'],
        ],
        dustUsed: [
          ['DUST! I am sharing the sparkle! For free!', 'DUST! Estou compartilhando o brilho! De graça!'],
          ['Surprise! Glitter! From São Paulo with love!', 'Surpresa! Glitter! De São Paulo com amor!'],
          ['Dust time! Can you see me? I can see you! Hahaha!', 'Hora do Dust! Você me vê? Eu te vejo! Hahaha!'],
          MUTE,
          ['Shh shh shh, secrets revealed—', 'Shh shh shh, segredos revelados—'],
          ['Sprinkle sprinkle! Beach sand effect!', 'Polvilha polvilha! Efeito areia de praia!'],
        ],
        pitJuke: [
          ['Follow me! Down the pit! It is like a Ubatuba waterfall!', 'Me segue! Pro fosso! É igual cachoeira de Ubatuba!'],
          ['Jump, jump, jump! I will catch you! Maybe!', 'Pula, pula, pula! Eu te seguro! Talvez!'],
          ['Pit party! Everyone is invited! Hi!', 'Festa no fosso! Todo mundo convidado! Oi!'],
          MUTE,
          ['Wheeee! Cliff dive! Like the Ubatuba rocks!', 'Uiiii! Salto do penhasco! Igual as pedras de Ubatuba!'],
          ['Race you to the bottom! I am—', 'Corrida até o fundo! Eu tô—'],
        ],
        caught: [
          ['CAUGHT YOU! Dinner at my Ubatuba apartment is on you!', 'PEGUEI! O jantar no meu apê de Ubatuba é por sua conta!'],
          ['Tag! You are it! Hahaha! Run! Run to Ubatuba!', 'Pegou! Você é o pegador! Hahaha! Corre! Corre pra Ubatuba!'],
          ['GOTCHA GOTCHA GOTCHA! Wow! I am shaking!', 'PEGUEI PEGUEI PEGUEI! Nossa! Tô tremendo!'],
          MUTE,
          ['Caught! And to celebrate, a trip to—', 'Pego! E pra comemorar, uma viagem pra—'],
          ['Hug! Hug! Hug! Sorry, it is a catching thing!', 'Abraço! Abraço! Abraço! Desculpa, é coisa de pegar!'],
          ['Awesome! You fell into my São Paulo trap!', 'Demais! Você caiu na minha armadilha paulistana!'],
          ['Yessss! Yes yes yes! Sorry, volume!', 'Simmm! Sim sim sim! Desculpa, volume!'],
        ],
        escaped: [
          ['Noooo! You got away! Come back to Ubatuba!', 'Nãooo! Você escapou! Volta pra Ubatuba!'],
          ['Wow, fast! Faster than the Rodoanel at 3 AM!', 'Nossa, rápido! Mais rápido que o Rodoanel às 3 da manhã!'],
          MUTE,
          ['Hey! Stop! Please! Come back and I will invite you to my—', 'Ei! Para! Por favor! Volta que eu te convido pro meu—'],
          ['You escaped! Congratulations! I am happy! And sad! Both!', 'Você escapou! Parabéns! Tô feliz! E triste! Os dois!'],
          ['Next time I will bring my Ubatuba friends!', 'Da próxima vez trago meus amigos de Ubatuba!'],
        ],
        playerFail: [
          ['Hm? Nothing? It is okay! You are doing great! Sort of!', 'Hm? Nada? Tá tranquilo! Você tá indo bem! Mais ou menos!'],
          ['Wrong button! I do that too! All the time! Daily!', 'Botão errado! Eu também faço isso! Toda hora! Diariamente!'],
          MUTE,
          ['Calm down! Breathe! Sip of coffee!', 'Calma! Respira! Gole de café!'],
          ['Uh oh! Try again! I will wait! Okay, not really!', 'Ih! Tenta de novo! Eu espero! Tá, nem tanto!'],
        ],
        comboFail: [
          ['Failed it! But what a style! 10 out of 10 for the attempt!', 'Errou! Mas que estilo! Nota 10 pela tentativa!'],
          ['Combo failed! But hey, Ubatuba has a combo meal for that!', 'Combo falhou! Mas em Ubatuba tem combo de comida pra isso!'],
          MUTE,
          ['Again! Again! Again! You got this! I think! I—', 'De novo! De novo! De novo! Você consegue! Acho! Eu—'],
          ['Do not cry! Or cry, and I will bring a caipirinha!', 'Não chora! Ou chora, que eu levo uma caipirinha!'],
        ],
        praise: [
          ['WOW! AMAZING! DO IT AGAIN! I MEAN IT!', 'UAU! INCRÍVEL! FAZ DE NOVO! TÔ FALANDO SÉRIO!'],
          ['That was beautiful! I almost cried! A little!', 'Isso foi lindo! Quase chorei! Um pouquinho!'],
          ['Clean! Smooth! Good for Ubatuba!', 'Limpo! Suave! Bom pra Ubatuba!'],
          MUTE,
          ['Great! I would clap but she is sleeping—', 'Ótimo! Eu bateria palma mas ela tá dormindo—'],
        ],
        heroLow: [
          ['Careful! Your health is low! Come rest in Ubatuba!', 'Cuidado! Sua vida tá baixa! Vem descansar em Ubatuba!'],
          ['Red bar! Red bar! Alarm! Cute alarm!', 'Barra vermelha! Barra vermelha! Alarme! Alarme fofo!'],
          MUTE,
          ['Oh no, health! You need a hammock! I have one!', 'Ah não, vida! Você precisa de uma rede! Eu tenho uma!'],
        ],
        'hitBy:coldsnap': [
          ['Brrr! Cold! Colder than the São Paulo winter! Which is 18 degrees!', 'Brrr! Frio! Mais frio que inverno paulistano! Que é 18 graus!'],
          ['Ice! In Ubatuba we only have it in drinks!', 'Gelo! Em Ubatuba só tem na bebida!'],
          MUTE,
        ],
        'hitBy:tornado': [
          ['Whoooa! Spinning! Like a beach umbrella!', 'Uuuiii! Girando! Igual guarda-sol de praia!'],
          ['Tornado! I am flying! Hi, birds! Hi!', 'Tornado! Tô voando! Oi, pássaros! Oi!'],
          MUTE,
        ],
        'hitBy:sunstrike': [
          ['Hot! Hot hot hot! Like Ubatuba in January!', 'Quente! Quente quente quente! Igual Ubatuba em janeiro!'],
          ['Sun! Sun! I need sunscreen! SPF a million!', 'Sol! Sol! Preciso de protetor! FPS um milhão!'],
          MUTE,
        ],
        'hitBy:chaosmeteor': [
          ['METEOR! Again! Again! No wait, not again!', 'METEORO! De novo! De novo! Não pera, de novo não!'],
          ['The sky is falling! Come to my place for shelter in Ubat—', 'O céu tá caindo! Vem pro meu apê se abrigar em Ubat—'],
          MUTE,
        ],
        'hitBy:deafeningblast': [
          ['IT IS LOUD! AT LAST SOMEONE LOUDER THAN ME!', 'TÁ ALTO! ENFIM ALGUÉM MAIS ALTO QUE EU!'],
          ['MY EARS! SHE IS GOING TO WAKE UP!', 'MEUS OUVIDOS! ELA VAI ACORDAR!'],
          MUTE,
        ],
        'hitBy:emp': [
          ['My mana! Gone! Like my weekend savings!', 'Minha mana! Foi! Igual minha poupança do fim de semana!'],
          ['Zap! My energy! My precious energy!', 'Zap! Minha energia! Minha preciosa energia!'],
        ],
        'hitBy:icewall': [
          ['A wall! An ice wall! Like the Santos port gate!', 'Uma parede! De gelo! Igual o portão do porto de Santos!'],
          ['Cool wall! Can I put a poster on it?', 'Parede legal! Posso colar um pôster nela?'],
        ],
        'hitBy:alacrity': [
          ['Speedy buff! I love it! Zoom zoom!', 'Buff veloz! Amei! Vruum vruum!'],
          ['Fast! Like the Imigrantes road on a free Friday!', 'Rápido! Igual a Imigrantes numa sexta livre!'],
        ],
        'hitBy:forgespirit': [
          ['A little flame guy! Can he come to Ubatuba too?', 'Um carinha de fogo! Ele pode vir pra Ubatuba também?'],
          ['Spirit! Hi spirit! You are invited to the barbecue!', 'Espírito! Oi espírito! Você tá convidado pro churrasco!'],
        ],
        'hitBy:ghostwalk': [
          ['Ghost mode! Pity, I wanted a selfie!', 'Modo fantasma! Pena, eu queria uma selfie!'],
          ['Oh, a ghost! I know a place in Ubatuba that is haunted!', 'Ah, um fantasma! Conheço um lugar assombrado em Ubatuba!'],
        ],
        'hitBy:atos': [
          ['Rooted! Like a palm tree on the beach!', 'Enraizado! Igual coqueiro na praia!'],
          ['Tied up! Is this a party game?', 'Amarrado! Isso é brincadeira de festa?'],
        ],
        'hitBy:vyse': [
          ['Baaa! I am a sheep! A fun sheep!', 'Béé! Sou uma ovelha! Uma ovelha divertida!'],
          ['Hexed! I am a frog now! Ribbit! Hi!', 'Hex! Sou um sapo agora! Croac! Oi!'],
        ],
        'hitBy:shiva': [
          ['Shiva! Ice wave! Like the freezer at the bakery!', 'Shiva! Onda de gelo! Igual freezer da padaria!'],
          ['So cold! Come to Ubatuba and warm me up!', 'Que frio! Vem pra Ubatuba me esquentar!'],
        ],
        'hitBy:meteorhammer': [
          ['A hammer?! From the sky?! My neighbors will hear!', 'Um martelo?! Do céu?! Os vizinhos vão ouvir!'],
          ['Boom! Hammer! That is a heavy hello!', 'Bum! Martelo! Isso é um oi pesado!'],
        ],
        'hitBy:orchid': [
          ['Silenced! I am already used to that—', 'Silenciado! Eu já tô acostumado—'],
          MUTE,
        ],
        'hitBy:gleipnir': [
          ['Chains! Kinky! I mean, ouch!', 'Correntes! Que ousadia! Quer dizer, ai!'],
          ['Zapped and tied! Worst. Hammock. Ever.', 'Eletrocutado e amarrado! Pior. Rede. Da vida.'],
        ],
        'hitBy:forcestaff': [
          ['Pushed! Like the morning crowd on the Paulista subway!', 'Empurrado! Igual multidão do metrô da Paulista de manhã!'],
          ['Whoosh! Fast travel! Ubatuba here I come!', 'Vush! Viagem rápida! Ubatuba, aí vou eu!'],
        ],
        'hitBy:dust': [
          ['Dust! I can see everything now! Hahaha!', 'Dust! Agora vejo tudo! Hahaha!'],
          ['Achoo! São Paulo smog is better than this!', 'Atchim! A poluição de São Paulo é melhor que isso!'],
        ],
      },
    },

    // 'ian': TODO, CEO slot. No sprite, no skin in IT.GAME.SKINS, no lines yet. When the CEO supplies the character:
    //   1. add 'ian' to IT.GAME.SKINS / SKIN_NAMES / ENEMY_ATTACK_KIND (js/data/game.js) and a sprite sheet (js/art/dummies.js)
    //   2. add the block here:  ian: { cd: 4, chat: 0.8, lineCd: 40, fallback: 'default', lines: { spawn: [ ['en', 'pt'], ... ] } },
    //   (tests/flair_v6.test.js asserts there is NO 'ian' entry until then)
  };

  // ---- normalise the editable tuples into the shape the picker uses: { t:{en,pt}, w, cd, icon } ----
  function norm(row, skin, sit) {
    if (!Array.isArray(row)) throw new Error('flair: ' + skin + '/' + sit + ' line is not a tuple');
    const o = row[2] || {};
    return { t: { en: String(row[0]), pt: String(row[1]) }, w: o.w == null ? 1 : o.w, cd: o.cd == null ? null : o.cd, icon: o.icon || null };
  }
  const table = {};
  Object.keys(RAW).forEach(function (skin) {
    const s = RAW[skin];
    const lines = {};
    Object.keys(s.lines || {}).forEach(function (sit) { lines[sit] = s.lines[sit].map(function (r) { return norm(r, skin, sit); }); });
    table[skin] = { silent: !!s.silent, cd: s.cd == null ? 4 : s.cd, chat: s.chat == null ? 1 : s.chat, lineCd: s.lineCd == null ? 30 : s.lineCd, fallback: s.fallback || null, lines: lines };
  });

  const ICONS = ['muted', 'camera', 'monkey', 'star', 'goiaba'];
  const SITUATIONS = ['spawn', 'idle', 'idleLong', 'damaged', 'stunned', 'nearDeath', 'death', 'killedHero', 'playerMissed',
    'playerWhiffSunstrike', 'heroInvisible', 'night', 'dustUsed', 'pitJuke', 'caught', 'escaped',
    'playerFail', 'playerNoMana', 'playerCooldown', 'playerWrong', 'comboFail', 'dodge', 'heroLow', 'praise'];

  IT.Flair = { raw: RAW, table: table, ICONS: ICONS, SITUATIONS: SITUATIONS };
})(typeof window !== 'undefined' ? window : globalThis);
