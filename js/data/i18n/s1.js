// UI strings owned by agent S1. Add keys only here.
(function (G) {
  'use strict';
  const IT = G.IT;
  IT.i18nAdd({
    en: { 'in.fullscreen': 'Fullscreen', 'in.fullscreenExit': 'Exit fullscreen',
      'set.rmbRepeat': 'Hold right mouse to repeat orders', 'set.comboOrder': 'Show combo action order (spells, items, moves)',
      'set.dummyChat': 'Dummy taunts', 'set.fpsCap': 'Frame rate cap', 'set.fpsDisplay': 'Display' },
    pt: { 'in.fullscreen': 'Tela cheia', 'in.fullscreenExit': 'Sair da tela cheia',
      'set.rmbRepeat': 'Segurar botão direito repete as ordens', 'set.comboOrder': 'Mostrar ordem das ações do combo (magias, itens, movimentos)',
      'set.dummyChat': 'Provocações dos bonecos', 'set.fpsCap': 'Limite de quadros', 'set.fpsDisplay': 'Taxa da tela' },
  });
})(typeof window !== 'undefined' ? window : globalThis);
