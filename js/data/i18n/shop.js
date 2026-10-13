// v6 item 15: relic POINTS + Skin SHOP strings (EN/PT parity is tested in tests/shop_v6.test.js).
(function (G) {
  'use strict';
  const IT = G.IT;
  IT.i18nAdd({
    en: {
      'pts.plus': '+{n} points', 'pts.run': '+{n} points this run',
      'pts.d': 'Points are the currency of the Skin Shop. Specials pay 5x. The medal rates how well you played; points are what you spend.',
      'shop.tab': 'SHOP', 'shop.title': 'Skin Shop', 'shop.balance': 'Points', 'shop.pts': 'pts',
      'shop.cat.player': 'Player', 'shop.cat.enemy': 'Enemy', 'shop.cat.dummy': 'Dummy',
      'shop.hint': 'Earn points from relic progress in Ranked runs (specials pay 5x). Medals rate how well you played; points are what you spend here.',
      'shop.buy': 'Buy', 'shop.owned': 'Owned', 'shop.equipped': 'Equipped', 'shop.equip': 'Equip', 'shop.free': 'Free',
      'shop.poor': 'Need {n} more', 'shop.nofunds': 'Not enough points',
      'shop.ranked': 'Appears in Ranked once unlocked', 'shop.ranked.on': 'In the Ranked pool',
      'shop.bought': 'Bought {name}', 'shop.equippedToast': '{name} equipped', 'shop.unlocked': 'UNLOCKED!', 'shop.unlockedPremium': 'PREMIUM UNLOCKED!',
      'shop.n.player.default': 'Invoker', 'shop.n.player.kid': 'Invoker Kid', 'shop.n.player.dark': 'Dark Artistry Invoker', 'shop.n.player.exalted': 'Exalted Invoker',
      'shop.n.enemy.default': 'Grunt', 'shop.n.enemy.renan': 'Renan', 'shop.n.enemy.pedro': 'Pedro', 'shop.n.enemy.vitinho': 'Vitinho', 'shop.n.enemy.nando': 'Nando', 'shop.n.enemy.ianzinho': 'Ianzinho', 'shop.n.enemy.vitinian': 'Vitinian',
      'shop.n.dummy.scarecrow': 'Scarecrow', 'shop.n.dummy.raven': 'Raven Scarecrow',
      'shop.d.player.default': 'The classic.', 'shop.d.player.kid': 'Playful skill icons and VFX.', 'shop.d.player.dark': 'Glowing violet cloak, dark skill palette.',
      'shop.d.player.exalted': 'Gold wings, red edge glow, gilded skills.',
      'shop.d.enemy.default': 'Bland hooded grunt.', 'shop.d.enemy.renan': 'Bald, stubborn tank.', 'shop.d.enemy.pedro': 'Shambling zombie.', 'shop.d.enemy.vitinho': 'Long hair, loud mouth, plaid shirt.',
      'shop.d.enemy.nando': 'A grey robot in a green dog suit.', 'shop.d.enemy.ianzinho': 'Red-capped lawyer, bearded and unbothered.', 'shop.d.enemy.vitinian': 'Two heads, one ogre, zero agreement. Premium.',
      'shop.d.dummy.scarecrow': 'Burlap head on a crossbar.', 'shop.d.dummy.raven': 'Dark rags, drifting feathers, a watching raven.',
    },
    pt: {
      'pts.plus': '+{n} pontos', 'pts.run': '+{n} pontos nesta partida',
      'pts.d': 'Pontos são a moeda da Loja de Skins. Especiais valem 5x. A medalha avalia como você jogou; pontos são o que você gasta.',
      'shop.tab': 'LOJA', 'shop.title': 'Loja de Skins', 'shop.balance': 'Pontos', 'shop.pts': 'pts',
      'shop.cat.player': 'Jogador', 'shop.cat.enemy': 'Inimigo', 'shop.cat.dummy': 'Boneco',
      'shop.hint': 'Ganhe pontos com o progresso das relíquias nas partidas Ranked (especiais valem 5x). Medalhas avaliam seu desempenho; pontos são o que você gasta aqui.',
      'shop.buy': 'Comprar', 'shop.owned': 'Comprado', 'shop.equipped': 'Equipado', 'shop.equip': 'Equipar', 'shop.free': 'Grátis',
      'shop.poor': 'Faltam {n}', 'shop.nofunds': 'Pontos insuficientes',
      'shop.ranked': 'Aparece no Ranked depois de desbloqueado', 'shop.ranked.on': 'No grupo do Ranked',
      'shop.bought': '{name} comprado', 'shop.equippedToast': '{name} equipado', 'shop.unlocked': 'DESBLOQUEADO!', 'shop.unlockedPremium': 'PREMIUM DESBLOQUEADO!',
      'shop.n.player.default': 'Invoker', 'shop.n.player.kid': 'Invoker Criança', 'shop.n.player.dark': 'Invoker Arte Sombria', 'shop.n.player.exalted': 'Invoker Exaltado',
      'shop.n.enemy.default': 'Capanga', 'shop.n.enemy.renan': 'Renan', 'shop.n.enemy.pedro': 'Pedro', 'shop.n.enemy.vitinho': 'Vitinho', 'shop.n.enemy.nando': 'Nando', 'shop.n.enemy.ianzinho': 'Ianzinho', 'shop.n.enemy.vitinian': 'Vitinian',
      'shop.n.dummy.scarecrow': 'Espantalho', 'shop.n.dummy.raven': 'Espantalho Corvo',
      'shop.d.player.default': 'O clássico.', 'shop.d.player.kid': 'Ícones e efeitos divertidos.', 'shop.d.player.dark': 'Capa violeta brilhante, habilidades sombrias.',
      'shop.d.player.exalted': 'Asas douradas, brilho vermelho, habilidades douradas.',
      'shop.d.enemy.default': 'Capanga encapuzado sem graça.', 'shop.d.enemy.renan': 'Tanque careca e teimoso.', 'shop.d.enemy.pedro': 'Zumbi cambaleante.', 'shop.d.enemy.vitinho': 'Cabelo comprido, boca grande, camisa xadrez.',
      'shop.d.enemy.nando': 'Um robô cinza com fantasia de cachorro verde.', 'shop.d.enemy.ianzinho': 'Advogado de boné vermelho, barbudo e na paz.', 'shop.d.enemy.vitinian': 'Duas cabeças, um ogro, nenhum acordo. Premium.',
      'shop.d.dummy.scarecrow': 'Cabeça de juta numa travessa.', 'shop.d.dummy.raven': 'Trapos escuros, penas à deriva e um corvo vigiando.',
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
