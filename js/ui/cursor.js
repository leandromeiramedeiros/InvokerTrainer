// Dota-style pixel-art cursors (baked on canvas -> data URL -> CSS cursor), virtual cursor for pointer lock,
// and the fullscreen button. IT.Cursor.set('default'|'attack'|'amove'|'aim'|'select'). Owner: S1.
// attack = red arrow (enemy under cursor); amove = red four-way cross (attack-move armed); aim = purple cross (spell targeting).
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const doc = G.document;
  const Cur = IT.Cursor = { kind: 'default', set() {}, virtual() {}, url: () => '', hot: () => [0, 0] };
  // v6 item 54: hover state = the SAME click boxes as selection / right-click / spells (IT.Pick.unitAt): 'attack' over an enemy-team unit, else 'default'
  Cur.hoverKind = (w, x, y, P) => (IT.Pick && w && IT.Pick.unitAt(w, x, y, { team: 1, P }) ? 'attack' : 'default');
  if (!doc || !doc.createElement) return;

  const SCALE = 2;
  const PAL = {   // outline, highlight (top/left edge), body, shade (bottom/right edge)
    default: ['#14141c', '#f6f8fc', '#c3c9d6', '#7a8294'],
    attack: ['#2a0606', '#ffb4aa', '#ff4a3c', '#9c1616'],
    amove: ['#2a0606', '#ffb4aa', '#ff4a3c', '#9c1616'],
    aim: ['#1c0838', '#ecd2ff', '#b36bff', '#6a2cb8'],
    select: ['#062a0e', '#c8ffd0', '#4ae85e', '#168a2c'],   // box-select drag: green arrow
  };
  // 9x14 arrow with a tail (silver gauntlet-style pointer)
  const ARROW = ['X........', 'XX.......', 'XXX......', 'XXXX.....', 'XXXXX....', 'XXXXXX...', 'XXXXXXX..', 'XXXXXXXX.', 'XXXXXXXXX',
    'XXXXXX...', 'XXX.XXX..', 'XX..XXX..', 'X....XXX.', '.....XXX.'];
  // 13x13 four-way reticle: four arrowheads pointing at the centre dot
  function reticle() {
    const g = []; for (let y = 0; y < 13; y++) g.push('.'.repeat(13).split(''));
    const put = (x, y) => { g[y][x] = 'X'; };
    for (let i = 0; i < 4; i++) {
      const lo = 3 + i, hi = 9 - i;
      for (let x = lo; x <= hi; x++) { put(x, i); put(x, 12 - i); put(i, x); put(12 - i, x); }
    }
    put(6, 6);
    return g.map(r => r.join(''));
  }

  function bake(kind, rows, hx, hy) {
    const w = rows[0].length, h = rows.length, pw = w + 2, ph = h + 2;
    const fill = (x, y) => x >= 0 && y >= 0 && x < w && y < h && rows[y][x] === 'X';
    const c = doc.createElement('canvas'); c.width = pw * SCALE; c.height = ph * SCALE;
    const g = c.getContext('2d'), pal = PAL[kind];
    for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
      let col = null;
      if (fill(x, y)) col = (!fill(x - 1, y) || !fill(x, y - 1)) ? pal[1] : (!fill(x + 1, y) || !fill(x, y + 1)) ? pal[3] : pal[2];
      else if (fill(x - 1, y) || fill(x + 1, y) || fill(x, y - 1) || fill(x, y + 1) || fill(x - 1, y - 1) || fill(x + 1, y - 1) || fill(x - 1, y + 1) || fill(x + 1, y + 1)) col = pal[0];
      if (col) { g.fillStyle = col; g.fillRect((x + 1) * SCALE, (y + 1) * SCALE, SCALE, SCALE); }
    }
    return { url: c.toDataURL('image/png'), w: c.width, h: c.height, hx: (hx + 1) * SCALE + 1, hy: (hy + 1) * SCALE + 1 };
  }
  const C = {
    default: bake('default', ARROW, 0, 0),
    attack: bake('attack', ARROW, 0, 0),
    amove: bake('amove', reticle(), 6, 6),
    aim: bake('aim', reticle(), 6, 6),
    select: bake('select', ARROW, 0, 0),
  };
  Cur.url = k => C[k].url;
  Cur.hot = k => [C[k].hx, C[k].hy];

  // ---- stylesheet: the pixel cursor everywhere (menus included); attack / aim swap in via a class on <html>
  const rule = k => `url(${C[k].url}) ${C[k].hx} ${C[k].hy}, default`;
  const st = doc.createElement('style');
  st.textContent =
    `html,html *{cursor:${rule('default')} !important}` +
    `html.cur-attack,html.cur-attack *{cursor:${rule('attack')} !important}` +
    `html.cur-amove,html.cur-amove *{cursor:${rule('amove')} !important}` +
    `html.cur-aim,html.cur-aim *{cursor:${rule('aim')} !important}` +
    `html.cur-select,html.cur-select *{cursor:${rule('select')} !important}` +
    `html input[type=text],html textarea{cursor:text !important}` +
    `html.cur-lock,html.cur-lock *{cursor:none !important}` +
    `#vcur{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;display:none;image-rendering:pixelated}` +
    `.itfs{position:absolute;right:calc(var(--u,4px)*1.5);top:calc(var(--u,4px)*1.5);z-index:30;width:max(26px,calc(var(--u,4px)*7));height:max(26px,calc(var(--u,4px)*7));` +
    `padding:0;display:flex;align-items:center;justify-content:center;pointer-events:auto;background:rgba(21,13,39,.82);border:2px solid #ffd23f;` +
    `box-shadow:0 0 0 2px #000,0 0 10px rgba(255,210,63,.55);color:#ffd23f;opacity:.92}` +
    `.itfs:hover{opacity:1;background:#2a1850;box-shadow:0 0 0 2px #000,0 0 14px rgba(255,210,63,.9)}` +
    `.itfs svg{width:70%;height:70%;display:block}`;
  (doc.head || doc.documentElement).appendChild(st);

  Cur.set = function (kind) {
    if (!C[kind]) kind = 'default';
    if (kind === Cur.kind) return;
    Cur.kind = kind;
    const cl = doc.documentElement.classList;
    cl.toggle('cur-attack', kind === 'attack'); cl.toggle('cur-amove', kind === 'amove'); cl.toggle('cur-aim', kind === 'aim'); cl.toggle('cur-select', kind === 'select');
    if (vc) vc.src = C[kind].url;
    if (vc && vc.style.display !== 'none' && vpos) Cur.virtual(vpos.x, vpos.y);
  };

  // ---- virtual cursor (pointer lock): hi-res image following client coords; null hides it and restores the real cursor
  let vc = null, vpos = null;
  Cur.virtual = function (x, y) {
    const cl = doc.documentElement.classList;
    if (x == null) { vpos = null; if (vc) vc.style.display = 'none'; cl.remove('cur-lock'); return; }
    if (!vc) { vc = doc.createElement('img'); vc.id = 'vcur'; vc.alt = ''; vc.draggable = false; vc.src = C[Cur.kind].url; doc.body.appendChild(vc); }
    vpos = { x, y };
    const h = C[Cur.kind];
    vc.style.display = 'block'; vc.style.width = h.w + 'px'; vc.style.height = h.h + 'px';
    vc.style.transform = 'translate(' + Math.round(x - h.hx) + 'px,' + Math.round(y - h.hy) + 'px)';
    cl.add('cur-lock');
  };

  // ---- fullscreen button (top-right of the stage; the stage itself is hidden outside play)
  const stage = doc.getElementById('stage');
  if (stage) {
    const ICON_IN = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M1 6V1h5M10 1h5v5M15 10v5h-5M6 15H1v-5"/></svg>';
    const ICON_OUT = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M6 1v5H1M15 6h-5V1M10 15v-5h5M1 10h5v5"/></svg>';
    const b = doc.createElement('button');
    b.type = 'button'; b.className = 'itfs';
    const upd = () => {
      const on = !!(doc.fullscreenElement || doc.webkitFullscreenElement);
      b.innerHTML = on ? ICON_OUT : ICON_IN;
      const t = IT.hasT && IT.hasT('in.fullscreen') ? IT.t(on ? 'in.fullscreenExit' : 'in.fullscreen') : 'Fullscreen';
      b.title = t; b.setAttribute('aria-label', t);
    };
    b.addEventListener('mousedown', ev => ev.stopPropagation());
    b.addEventListener('click', ev => { ev.preventDefault(); b.blur(); if (IT.Input) IT.Input.toggleFullscreen(); });
    b.addEventListener('contextmenu', ev => ev.preventDefault());
    doc.addEventListener('fullscreenchange', upd); doc.addEventListener('webkitfullscreenchange', upd);
    if (IT.Settings && IT.Settings.onChange) IT.Settings.onChange(upd);
    upd();
    stage.appendChild(b);
  }

  Cur.set('default');
  doc.documentElement.classList.remove('cur-attack', 'cur-amove', 'cur-aim', 'cur-select');
})(typeof window !== 'undefined' ? window : globalThis);
