// Pixel-art sprites. 1 char = 1 pixel. '.' = transparent (never in PAL).
const PAL = {
  K: '#0b0f1a', // outline
  w: '#ffffff', // highlight
  i: '#e8f8ff', // ice white
  Q: '#3ae0ff', q: '#1a8fb8', c: '#b8f4ff', // cyan mid / dark / light
  W: '#c46bff', m: '#7a2fb8', x: '#e6c8ff', // purple mid / dark / light
  E: '#ff8a2a', e: '#b84f0c', f: '#ffc27a', // orange mid / dark / light
  y: '#ffe45c', Y: '#c99a2e',               // yellow / gold
  z: '#9aa4b2', Z: '#4d5666',               // grey light / dark
  h: '#f2d7b8',                             // pale skin
  o: '#f4f1ff',                             // robe white
  g: '#5cb85c',                             // goblin green
  b: '#8a5a2b', B: '#4a2c12',               // brown light / dark
};

const SPRITES = {
  // Orbs 10x10
  orbQ: [
    '...KKKK...',
    '..KcQQqK..',
    '.KcwQQQqK.',
    '.KwQQQQqK.',
    'KcQQQQQQqK',
    'KQQQQQQQqK',
    'KQQQQQQqqK',
    '.KQQQQqqK.',
    '..KqqqqK..',
    '...KKKK...',
  ],
  orbW: [
    '...KKKK...',
    '..KxWWmK..',
    '.KxwWWWmK.',
    '.KwWWWWmK.',
    'KxWWWWWWmK',
    'KWWWWWWWmK',
    'KWWWWWWmmK',
    '.KWWWWmmK.',
    '..KmmmmK..',
    '...KKKK...',
  ],
  orbE: [
    '...KKKK...',
    '..KfEEeK..',
    '.KfwEEEeK.',
    '.KwEEEEeK.',
    'KfEEEEEEeK',
    'KEEEEEEEeK',
    'KEEEEEEeeK',
    '.KEEEEeeK.',
    '..KeeeeK..',
    '...KKKK...',
  ],

  // Spell icons 16x16
  coldsnap: [
    'c......cc......c',
    '.q.....QQ.....q.',
    '..q....QQ....q..',
    '...q...QQ...q...',
    '....q..QQ..q....',
    '.....q.QQ.q.....',
    '......qQQq......',
    'cQQQQQQiiQQQQQQc',
    'cQQQQQQiiQQQQQQc',
    '......qQQq......',
    '.....q.QQ.q.....',
    '....q..QQ..q....',
    '...q...QQ...q...',
    '..q....QQ....q..',
    '.q.....QQ.....q.',
    'c......cc......c',
  ],
  ghostwalk: [
    '................',
    '................',
    '....KKKKKKKK....',
    '...KxxxxxxxxK...',
    '..KxwWWWWWWWWK..',
    '..KxxWWWWWWWmK..',
    '..KxxKKWWKKWmK..',
    '..KxxKKWWKKWmK..',
    '..KxxWWWWWWWmK..',
    '..KxWWWWWWWWmK..',
    '..KxWWWWWWWWmK..',
    '..KWWWWWWWWWmK..',
    '..KWW..WW..WmK..',
    '..KKK..KK..KK...',
    '................',
    '................',
  ],
  icewall: [
    '................',
    '................',
    '.....KiiiiiK....',
    '.....KcQQQqK....',
    '.....KcQQQqK....',
    'iiiiiKcQQQqK....',
    'cQQQqKcQQQqKiiii',
    'cQQQqKcQQQqKcQQq',
    'cQQQqKcQQQqKcQQq',
    'cQQQqKcQQQqKcQQq',
    'cQQQqKcQQQqKcQQq',
    'cQQQqKcQQQqKcQQq',
    'cQQQqKcQQQqKcQQq',
    'cQQQqKcQQQqKcQQq',
    'qqqqqKqqqqqKqqqq',
    'KKKKKKKKKKKKKKKK',
  ],
  emp: [
    '......QQQQ......',
    '....QQ....QQ....',
    '..QQ........QQ..',
    '.Q.......yy...Q.',
    'Qc......yy....cQ',
    'Qc....yyyy....cQ',
    'Qc.....ywwy...cQ',
    'Qc......yy....cQ',
    'Qc.....yy.....cQ',
    'Qc....yy......cQ',
    'Qc...yy.......cQ',
    'Qc............cQ',
    '.Q............Q.',
    '..QQ........QQ..',
    '....QQ....QQ....',
    '......QQQQ......',
  ],
  tornado: [
    '.QQQQQQQWWWWWWW.',
    '..WWWWWWQQQQQQ..',
    '...QQQQQWWWWW...',
    '...WWWWWQQQQQ...',
    '....QQQQWWWW....',
    '.....QQQWWW.....',
    '.....WWWQQQ.....',
    '......QQWW......',
    '......WWQQ......',
    '.......cc.......',
    '.......QQ.......',
    '........c.......',
    '........w.......',
    '..c.........c...',
    '.W..........W...',
    '................',
  ],
  alacrity: [
    '.........yyyyy..',
    '........EEEEE...',
    '.......EEEEE....',
    '.WWW..EEEEE.....',
    '....yyyyyyyyy...',
    '....EEEEEEEEE...',
    '.....EEEEm......',
    '....EEEEE.......',
    '...EEEEE........',
    '..EEEEm.........',
    '..EEEE..........',
    '.EEEE...........',
    '.EEE............',
    'EEE.............',
    '................',
    '................',
  ],
  sunstrike: [
    '.......ff.......',
    '......EEEE......',
    '....EyyyyyyE....',
    '...EyyyyyyyyE...',
    '..EyyywwyyyyyE..',
    'f.EyyyyyyyyyyE.f',
    '..EyyyyyyyyyyE..',
    '...EyyyyyyyyE...',
    '....EyyyyyyE....',
    '......EEEE......',
    '......fyyf......',
    '......fyyf......',
    '.....fyyyyf.....',
    '....fyyyyyyf....',
    '...fyyyyyyyyf...',
    '..fyyyyyyyyyyf..',
  ],
  forgespirit: [
    '.......yy.......',
    '......yEEy......',
    '.....yEEEEy.....',
    '....yEEEEEEy....',
    '...yEEEEEEEEy...',
    '..KEEEEEEEEEEK..',
    '..KEEEEEEEEEEK..',
    '..KEEKKEEKKEEK..',
    '..KEEKKEEKKEEK..',
    '..KEEKKKKKKEEK..',
    '..KEEEEEEEEEEK..',
    '...KEEEEEEEEK...',
    '....KeeeeeeK....',
    '.....KeeeeK.....',
    '......KeeK......',
    '.......y........',
  ],
  chaosmeteor: [
    '................',
    '................',
    '................',
    '........KKKKK...',
    '...e...KzzzZZK..',
    '..eEy.KwzzzZZZK.',
    '.eEyEKwzzzzZZZZK',
    '.yEEeKzzzzzZZZZK',
    '..eEy.KzzzzZZZK.',
    '...e...KzzZZZK..',
    '........KZZZK...',
    '.........KKK....',
    '................',
    '................',
    '................',
    '................',
  ],
  deafeningblast: [
    '.....W....Q.....',
    '.......W...Q....',
    '........W...Q...',
    '....x....W..Q...',
    '.....x...W..Q...',
    '......x...W..Q..',
    'mmmW...x..W..Q..',
    'mmmW...x..W..Q..',
    'mmmW...x..W..Q..',
    'mmmW...x..W..Q..',
    '......x...W..Q..',
    '.....x...W..Q...',
    '....x....W..Q...',
    '........W...Q...',
    '.......W...Q....',
    '.....W....Q.....',
  ],
  invoke: [
    '.......YY.......',
    '......YyyY......',
    '.....YyyyyY.....',
    '....YiyyyyyY....',
    '...YiiyyyyyyY...',
    '..YyyyywwyyyyY..',
    '.YyyyywwwwyyyyY.',
    'YyyyywwwwwwyyyyY',
    'YyyyywwwwwwyyyyY',
    '.YyyyywwwwyyyyY.',
    '..YyyyywwyyyyY..',
    '...YyyyyyyyyY...',
    '....YyyyyyyY....',
    '.....YyyyyY.....',
    '......YyyY......',
    '.......YY.......',
  ],

  // Hero 12x20: hooded mage facing right, holding a gold orb
  invoker: [
    '....KKKK....',
    '...KWWWWK...',
    '...KWWWWWK..',
    '..KWWKhhhK..',
    '..KWWKhKhhK.',
    '..KWWKhhhhK.',
    '..KWWWWWWK..',
    '..KoYooooK..',
    '..KooYoooK..',
    '..KoooWooKy.',
    '..KoooYooK..',
    '.KoooYooooK.',
    '.KooooooooK.',
    '.KYYYYYYYYK.',
    '..KmmKmmK...',
    '..KmmKmmK...',
    '..KmmKmmK...',
    '..KKK.KKK...',
    '.KKKK..KKKK.',
    '............',
  ],

  // Creep 12x12: goblin dummy facing right
  creep: [
    '...KKKKK....',
    '..KggggggK..',
    '.KggggggggK.',
    'gKggggggggKg',
    'gKgwKgwKggKg',
    '.KggggggggK.',
    '.KgwgwgwggK.',
    '..KbbbbbbK..',
    '.KbbbbbbbbK.',
    '.KbbBBBBbbK.',
    '.KbBbbbbBbK.',
    '..KBK..KBK..',
  ],

  // Spirit 10x12: little fire elemental
  spirit: [
    '....yy....',
    '...yEEy...',
    '..yEEEEy..',
    '.yEwEEEEy.',
    '.yEEEEEEy.',
    'yEEKEEKEEy',
    'yEEKEEKEEy',
    'yEEEEEEEEy',
    '.EEEEEEEE.',
    '.EeeeeeeE.',
    '..eeeeee..',
    '...eeee...',
  ],
};

const _spriteCache = new Map();

// Cached offscreen canvas, 1 pixel per sprite char.
function getSprite(name) {
  if (_spriteCache.has(name)) return _spriteCache.get(name);
  const rows = SPRITES[name];
  if (!rows) throw new Error('Unknown sprite: ' + name);
  const h = rows.length;
  const w = rows[0].length;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      ctx.fillStyle = PAL[ch];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  _spriteCache.set(name, cv);
  return cv;
}

// New canvas copy of the cached sprite, for DOM use.
function spriteEl(name) {
  const src = getSprite(name);
  const cv = document.createElement('canvas');
  cv.width = src.width;
  cv.height = src.height;
  cv.getContext('2d').drawImage(src, 0, 0);
  return cv;
}
