// v6 item 15 (Skin SHOP) procedural sprites, frozen into IT.Art sheets at load:
//  * 'nando'          enemy skin: a ORIGINAL little grey robot wearing a green dog onesie (floppy ears, snout hood, wagging tail). 20x24, anchor feet [10,22].
//  * 'scarecrow_raven' dummy skin: the scarecrow re-coloured to a dark / violet rag with feather tufts, and a raven perched on the crossbar.
// Loaded after js/art/dummies.js (needs the 'scarecrow' sheet).
(function (G) {
  'use strict';
  const IT = G.IT, A = IT && IT.Art;
  if (!A) return;

  // ------------------------------------------------------------------ Nando
  (function nando() {
    const W = 20, H = 24;
    const pal = {
      o: '#13231a',                                             // outline
      G: '#8fdc62', g: '#58ad3f', h: '#34752f', m: '#c3ee94',   // dog suit: light, mid, shade, belly patch
      A: '#d3d9e0', B: '#a1abb6', C: '#707b88', D: '#464e5a',   // robot metal: light .. dark
      E: '#86f7ff', e: '#2aa3b4', N: '#161616', Y: '#ffb347',   // led eye, eye glow, nose, antenna tip / indicator
      W: '#f8f2ff', V: '#c8a0ff', Z: '#d89a2a',                 // cast spark (shared with the other enemy sheets)
    };
    const grid = () => Array.from({ length: H }, () => Array(W).fill('.'));
    const put = (g, x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c; };
    const rect = (g, x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(g, x, y, c); };
    function outline(g) {
      const o = g.map(r => r.slice());
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (g[y][x] !== '.') continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const c = (g[y + dy] || [])[x + dx];
          if (c && c !== '.' && c !== 'Y' && c !== 'W' && c !== 'V') { o[y][x] = 'o'; break; }
        }
      }
      return o;
    }
    // pose: { by: body y offset, ll/rl: leg lift px, la/ra: arm y offset, ear: ear swing px, tail: tail y, eyes: 'open'|'shut'|'x', cast, tilt }
    function legs(g, view, p) {
      const L = p.ll | 0, R = p.rl | 0, yb = 21;
      const leg = (x0, x1, lift) => {
        rect(g, x0, 18 - lift, x1, 19 - lift, 'g'); rect(g, x0, 18 - lift, x0, 19 - lift, 'G'); rect(g, x1, 18 - lift, x1, 19 - lift, 'h');
        rect(g, x0, 20 - lift, x1, yb - lift, 'C'); rect(g, x0, 20 - lift, x1, 20 - lift, 'B'); rect(g, x0, yb - lift, x1, yb - lift, 'D');
      };
      if (view === 'e') { leg(6, 8, L); leg(9, 11, R); } else { leg(6, 9, L); leg(10, 13, R); }
    }
    function torso(g, view, p) {
      const y0 = 11 + p.by, y1 = 17;
      const x0 = view === 'e' ? 6 : 6, x1 = view === 'e' ? 12 : 13;
      rect(g, x0, y0, x1, y1, 'g'); rect(g, x0, y0, x0, y1, 'G'); rect(g, x1, y0, x1, y1, 'h'); rect(g, x0, y1, x1, y1, 'h');
      if (view === 's') {
        rect(g, 7, y0 + 1, 12, y1 - 1, 'B'); rect(g, 7, y0 + 1, 12, y0 + 1, 'A'); rect(g, 12, y0 + 1, 12, y1 - 1, 'C');   // grey metal chest plate in the suit's open belly
        put(g, 7, y0 + 1, 'C'); put(g, 12, y0 + 1, 'D'); put(g, 7, y1 - 1, 'C'); put(g, 12, y1 - 1, 'D');   // rivets
        rect(g, 8, y0 + 3, 11, y0 + 4, 'D'); put(g, 9, y0 + 3, 'Y'); put(g, 10, y0 + 3, 'e'); put(g, 11, y0 + 3, 'E');   // led panel
      } else if (view === 'n') {
        rect(g, 9, y0, 10, y1, 'h');                               // back zip
        for (let y = y0; y <= y1; y += 2) put(g, 9, y, 'C');
      } else {
        rect(g, 8, y0 + 1, 11, y1 - 1, 'B'); rect(g, 8, y0 + 1, 11, y0 + 1, 'A'); put(g, 8, y0 + 2, 'C'); put(g, 11, y0 + 3, 'Y');
      }
    }
    function arms(g, view, p) {
      const la = p.la | 0, ra = p.ra | 0;
      const arm = (x0, x1, dy, up) => {
        const t = 12 + p.by + dy;
        if (up) {                                                   // raised cast arm: sleeve up, metal claw at the top
          rect(g, x0, t - 3, x1, t + 1, 'g'); rect(g, x0, t - 3, x0, t + 1, 'G'); rect(g, x0, t - 5, x1, t - 4, 'B'); put(g, x0, t - 5, 'A');
          return;
        }
        rect(g, x0, t, x1, t + 2, 'g'); rect(g, x0, t, x0, t + 2, 'G'); rect(g, x1, t, x1, t + 2, 'h');
        rect(g, x0, t + 3, x1, t + 4, 'B'); rect(g, x1, t + 3, x1, t + 4, 'C'); put(g, x0, t + 3, 'A');
      };
      if (view === 'e') { arm(8, 10, ra, p.cast); return; }
      arm(4, 5, la, false); arm(14, 15, ra, p.cast);
    }
    function head(g, view, p) {
      const y = p.by + (p.tilt ? 1 : 0), tx = p.tilt || 0;
      const P = (x, yy, c) => put(g, x + tx, yy + y, c);
      const R2 = (x0, y0, x1, y1, c) => rect(g, x0 + tx, y0 + y, x1 + tx, y1 + y, c);
      // antenna
      P(10 - (view === 'e' ? 1 : 0), 1, 'C'); P(10 - (view === 'e' ? 1 : 0), 0, p.eyes === 'x' ? 'C' : 'Y');
      const x0 = view === 'e' ? 5 : 6, x1 = view === 'e' ? 12 : 13;
      // hood
      R2(x0 + 1, 2, x1 - 1, 2, 'G'); R2(x0, 3, x1, 10, 'g'); R2(x0, 3, x0 + 1, 8, 'G'); R2(x1, 4, x1, 10, 'h'); R2(x0 + 1, 10, x1 - 1, 10, 'h');
      const sw = p.ear | 0;
      if (view === 's') {
        // floppy ears hang beside the hood, swinging 1 px
        R2(3 + sw, 3, 5, 9, 'h'); R2(3 + sw, 3, 3 + sw, 5, 'g'); R2(14, 3, 16 - sw, 9, 'h'); R2(16 - sw, 3, 16 - sw, 5, 'g');
        R2(4 + sw, 10, 5, 10, 'h'); R2(14, 10, 15 - sw, 10, 'h');
        // robot faceplate + snout
        R2(7, 4, 12, 9, 'B'); R2(7, 4, 12, 4, 'A'); R2(7, 9, 12, 9, 'C');
        if (p.eyes === 'x') { for (const ex of [8, 11]) { P(ex, 5, 'D'); P(ex + 1 > 12 ? 12 : ex + 1, 6, 'D'); P(ex, 7, 'D'); P(ex + 1, 5, 'D'); P(ex, 6, 'D'); } }
        else if (p.eyes === 'shut') { P(8, 6, 'D'); P(9, 6, 'D'); P(10, 6, 'D'); P(11, 6, 'D'); }
        else { R2(8, 5, 8, 6, 'E'); R2(11, 5, 11, 6, 'E'); P(9, 6, 'e'); P(12, 6, 'e'); }
        R2(8, 8, 11, 8, 'C'); R2(9, 7, 10, 8, 'N'); P(8, 8, 'D'); P(11, 8, 'D');
      } else if (view === 'e') {
        R2(4 + sw, 3, 7, 10, 'h'); R2(4 + sw, 3, 4 + sw, 5, 'g');                // ear flops back
        R2(9, 4, 13, 9, 'B'); R2(9, 4, 13, 4, 'A'); R2(9, 9, 13, 9, 'C');       // faceplate in profile
        R2(14, 6, 15, 8, 'C'); R2(15, 6, 15, 7, 'N'); R2(14, 6, 14, 6, 'B');     // snout + nose
        if (p.eyes === 'x') { P(11, 5, 'D'); P(12, 6, 'D'); P(11, 7, 'D'); P(12, 5, 'D'); P(11, 6, 'D'); }
        else if (p.eyes === 'shut') { P(11, 6, 'D'); P(12, 6, 'D'); }
        else { R2(11, 5, 12, 6, 'E'); P(12, 6, 'e'); }
        R2(10, 9, 14, 9, 'D');
      } else {
        R2(3 + sw, 3, 5, 9, 'h'); R2(14, 3, 16 - sw, 9, 'h');
        R2(7, 4, 12, 9, 'g'); R2(9, 3, 10, 9, 'h'); P(8, 6, 'G'); P(11, 6, 'G');
      }
    }
    function tail(g, view, p) {
      const t = p.tail | 0;
      if (view === 'e') { rect(g, 3, 13 + t, 5, 15 + t, 'g'); rect(g, 2, 12 + t, 3, 13 + t, 'G'); put(g, 2, 11 + t, 'G'); }
      else if (view === 'n') { rect(g, 9, 15, 10, 17, 'G'); rect(g, 9 + t, 14, 10 + t, 14, 'G'); }
    }
    function sparks(g, p) {
      if (p.cast) { put(g, 15, 3 + p.by, 'W'); put(g, 14, 2 + p.by, 'V'); put(g, 16, 2 + p.by, 'Y'); put(g, 15, 1 + p.by, 'V'); }
      if (p.eyes === 'x') { put(g, 6, 0, 'Y'); put(g, 8, 1, 'W'); put(g, 12, 0, 'Y'); put(g, 14, 1, 'W'); }
    }
    function build(view, p) {
      const g = grid();
      tail(g, view, p); legs(g, view, p); torso(g, view, p); arms(g, view, p); head(g, view, p); sparks(g, p);
      return outline(g).map(r => r.join(''));
    }
    const POSE = {
      idle: [{ by: 0, tail: 0, ear: 0 }, { by: 0, tail: 1, ear: 0 }, { by: 1, tail: 0, ear: 1 }, { by: 1, tail: -1, ear: 0 }],
      walk: [{ by: 0, ll: 1, rl: 0, la: -1, ra: 1, tail: 1, ear: 1 }, { by: 1, ll: 0, rl: 0, la: 0, ra: 0, tail: 0 }, { by: 0, ll: 0, rl: 1, la: 1, ra: -1, tail: -1, ear: 1 }, { by: 1, ll: 0, rl: 0, la: 0, ra: 0, tail: 0 }],
      cast: [{ by: 0, cast: true, ra: 0, tail: 1 }, { by: -1, cast: true, ra: 0, tail: -1, ear: 1 }],
      stunned: [{ by: 1, tilt: -1, eyes: 'x', la: 1, ra: 1, tail: 1 }, { by: 1, tilt: 1, eyes: 'x', la: 1, ra: 1, tail: -1 }],
      blink: [{ by: 2, la: -1, ra: -1, tail: 0 }, { by: -1, la: 1, ra: 1, tail: 0, eyes: 'shut' }],
    };
    const frames = {};
    for (const v of ['s', 'n', 'e']) for (const anim in POSE) POSE[anim].forEach((p, i) => { frames[`${anim}_${v}_${i}`] = build(v, p); });
    // portrait 32x32: head + shoulders of the front idle, 2x
    const src = frames.idle_s_0, por = [];
    for (let y = 0; y < 16; y++) { let r = ''; for (let x = 2; x < 18; x++) r += src[y][x] + src[y][x]; por.push(r, r); }
    frames.portrait = por;
    A.sheet('nando', { pal, anchor: [10, 22], frames });
  })();

  // ------------------------------------------------------------------ Raven scarecrow
  (function raven() {
    const base = A.sheets && A.sheets.scarecrow;
    if (!base) return;
    // dark rags + feather tufts instead of straw; extra chars: V raven body, v sheen, Q beak/legs, z eye
    const pal = Object.assign({}, base.pal, {
      r: '#2e2a3c', R: '#4b4563', c: '#1e1a2a', p: '#5a3a7c', P: '#8460ac',
      a: '#16161e', A: '#2c2c3a', q: '#8a4cc0', y: '#2b2d40', Y: '#4a5072', o: '#181a28',
      V: '#1d1f2e', v: '#3d4566', Q: '#e0a030', z: '#e8e8f4',
    });
    // perched raven, 6x6 (facing left); drawn on the crossbar end
    const R6 = [
      '.VVv..',
      'VzVVV.',
      'QVVvVV',
      '.VVVVV',
      '..VVV.',
      '..Q.Q.',
    ];
    const frames = {};
    for (const k in base.frames) {
      const rows = base.frames[k].map(r => r.split(''));
      if (k !== 'portrait') {
        const view = k.split('_')[1], bob = (k.endsWith('_1') ? 0 : 0);
        const x0 = view === 'e' ? 17 : 17, y0 = 9 + bob + (k.startsWith('stunned') ? 1 : 0);
        for (let j = 0; j < R6.length; j++) for (let i = 0; i < R6[j].length; i++) {
          const c = R6[j][i];
          if (c === '.') continue;
          if (rows[y0 + j] && x0 + i < rows[y0 + j].length) rows[y0 + j][x0 + i] = c;
        }
      }
      frames[k] = rows.map(r => r.join(''));
    }
    // portrait is the 4-px padded copy of the front idle; recreate with the raven (keep the same offset)
    frames.portrait = frames.idle_s_0.map(r => '....' + r + '....');
    A.sheet('scarecrow_raven', { pal, anchor: base.anchor, frames });
  })();
})(typeof window !== 'undefined' ? window : globalThis);
