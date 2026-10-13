// Enemy belief indicators (v6 item 27, juke): what the chasers THINK. Pure rendering of IT.Belief state (js/sim/belief.js) on the HUD
// pass (IT.FX.hud calls IT.BeliefFX.hud after its own marks). Gated by IT.Belief.uiOn(w): juke scenarios always, else the beliefUI
// setting (undefined = on). Pixel style, dark outline / under-pixel so it reads at night.
//   ghost   = a fading hero ghost at the last-seen spot (alpha follows the belief confidence); one per distinct spot
//   arrow   = a bright pulsing dashed arrow last seen -> live prediction whenever a chaser is lost / predicted / searching
//   '?'     = a swirl of dots + '?' over a juked chaser (stands confused at an empty spot); a plain '?' while it searches (+ faint ring)
//   '!'     = for 1 s after a reacquire, over the chaser
//   gem     = the Gem carrier's true-sight ring (900 u)
//   chips   = 'DUST' / 'BLINK' / 'FORCE' over a foe that telegraphs or uses a detection / re-catch item (1.2 s)
// Chaser-attached marks ('?', '!', chips) only draw on a chaser the player can see; the ghost / arrow (where they think YOU are) always.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const TAU = Math.PI * 2, CHIP_T = 1.2, BANG_T = 1.0;
  const COL = { ghost: '#c8d4ff', ghostDim: '#6a76a8', arrow: '#ffb84a', arrowHi: '#ffe08a', huh: '#d8d0ff', bang: '#ff4a4a', gem: '#7fe0ff', chip: '#ffd24a' };
  const CHIPS = { dust: 'DUST', blink: 'BLINK', forcestaff: 'FORCE', gem: 'GEM', sentry: 'WARD' };
  const PX = () => IT.Pixel;
  const UD = () => IT.UnitDraw;
  const pxs = (R, wx) => wx / R.P - R.camX;
  const pys = (R, wy) => wy / R.P - R.camY;
  let chips = [], R_ = null;

  function init(R) {
    R_ = R; chips = [];
    const w = R.w;
    const chip = (unit, id) => { const k = CHIPS[id]; if (k) chips.push({ unit, k, t0: R_.time }); };
    w.on('telegraph', p => chip(p.unit, p.item));
    w.on('itemUse', p => { if (!chips.some(c => c.unit === p.unit && c.k === CHIPS[p.ability] && R_.time - c.t0 < 0.6)) chip(p.unit, p.ability); });
  }
  function clear() { chips = []; }

  const on = w => !!(IT.Belief && IT.Belief.uiOn && IT.Belief.uiOn(w));
  const seenBy = (R, e) => { const U = UD(); return !U || !U.visible || U.visible(R, e); };

  // dithered pixel ghost (a hooded head + shoulders, 9 x 11 px) at x, y (feet), alpha a
  const GHOST = ['..###..', '.#####.', '##.#.##', '#######', '.#####.', '..###..', '.#####.', '#######', '#######', '#.#.#.#'];
  function ghost(R, x, y, a, t) {
    const cx = R.cx, B = PX().bayer, ox = Math.round(x) - 3, oy = Math.round(y) - GHOST.length - 2 + Math.round(Math.sin(t * 2.4) * 1);
    for (let j = 0; j < GHOST.length; j++) for (let i = 0; i < 7; i++) {
      if (GHOST[j][i] !== '#') continue;
      const px = ox + i, py = oy + j;
      if (B(px + R.camX, py + R.camY) > a) continue;
      cx.fillStyle = 'rgba(0,0,0,0.6)'; cx.fillRect(px, py + 1, 1, 1);
      cx.fillStyle = j < 6 ? COL.ghost : COL.ghostDim; cx.fillRect(px, py, 1, 1);
    }
    if (IT.FX && IT.FX.dring) IT.FX.dring(R, x, y, 5 + Math.sin(t * 3) * 0.5, COL.ghost, a * 0.7);
  }
  // dashed arrow from (x0, y0) to (x1, y1): marching 2 px dashes on a dark under-stroke, a big arrowhead, a slow pulse. Reads at night (HUD pass = unlit)
  function arrow(R, x0, y0, x1, y1, a, t) {
    const cx = R.cx, d = Math.hypot(x1 - x0, y1 - y0); if (d < 6) return;
    const ux = (x1 - x0) / d, uy = (y1 - y0) / d, ph = (t * 12) % 8, al = a * (0.8 + 0.2 * Math.sin(t * 5));
    const dot = (px, py, col) => { cx.fillStyle = col; cx.fillRect(px, py, 2, 2); };
    cx.globalAlpha = al;
    for (let s = 0; s <= d - 5; s += 1) {
      if (((s - ph) % 8 + 8) % 8 >= 5) continue;
      const px = Math.round(x0 + ux * s), py = Math.round(y0 + uy * s);
      cx.fillStyle = 'rgba(0,0,0,0.85)'; cx.fillRect(px - 1, py - 1, 4, 4);
    }
    for (let k = 0; k <= 7; k++) for (const sg of [-1, 1]) {   // arrowhead: two barbs, outlined
      const px = Math.round(x1 - ux * k - uy * k * 0.7 * sg), py = Math.round(y1 - uy * k + ux * k * 0.7 * sg);
      cx.fillStyle = 'rgba(0,0,0,0.85)'; cx.fillRect(px - 1, py - 1, 4, 4);
    }
    for (let s = 0; s <= d - 5; s += 1) {
      if (((s - ph) % 8 + 8) % 8 >= 5) continue;
      dot(Math.round(x0 + ux * s), Math.round(y0 + uy * s), COL.arrow);
    }
    for (let k = 0; k <= 7; k++) for (const sg of [-1, 1]) dot(Math.round(x1 - ux * k - uy * k * 0.7 * sg), Math.round(y1 - uy * k + ux * k * 0.7 * sg), COL.arrowHi);
    cx.globalAlpha = 1;
  }
  // a chaser walking / probing on a guess: lost, predicted (walking to it) or searching (ring round it)
  const ARROW_ST = { lost: 1, predicted: 1, searching: 1 };
  const arrowOf = B => (ARROW_ST[B.state] && B.last && B.pred && Math.hypot(B.pred.x - B.last.x, B.pred.y - B.last.y) > 30 ? B : null);

  function hud(R) {
    const w = R.w; if (!w || !R.cx || !on(w)) return;
    const t = R.time, cx = R.cx, VW = R.VW, VH = R.VH, P = PX();
    const inView = (x, y) => x >= -4 && y >= -4 && x < VW + 4 && y < VH + 4;
    const ghosts = [], arrows = [];
    for (const e of w.ents) {
      if (e.dead || e.team !== 1) continue;
      if (e.gem && e.trueSight > 0 && seenBy(R, e)) { R.interp(e); IT.FX.dring(R, pxs(R, R.ix), pys(R, R.iy), e.trueSight / R.P, COL.gem, 0.35); }
      const B = e.belief; if (!B || !B.last || B.own) continue;
      const st = B.state;
      if (st !== 'seen' && st !== 'idle') {
        if (!ghosts.some(g => Math.hypot(g.x - B.last.x, g.y - B.last.y) < 40)) ghosts.push({ x: B.last.x, y: B.last.y, a: 0.25 + 0.65 * (B.conf || 0) });
        if (arrowOf(B) && !arrows.some(q => Math.hypot(q.x - B.pred.x, q.y - B.pred.y) < 40 && Math.hypot(q.lx - B.last.x, q.ly - B.last.y) < 40)) {
          arrows.push({ x: B.pred.x, y: B.pred.y, lx: B.last.x, ly: B.last.y });
          const x0 = pxs(R, B.last.x), y0 = pys(R, B.last.y), x1 = pxs(R, B.pred.x), y1 = pys(R, B.pred.y);
          if (inView(x0, y0) || inView(x1, y1)) arrow(R, x0, y0, x1, y1, 1, t);
        }
      }
      if (!seenBy(R, e)) continue;
      R.interp(e);
      const x = pxs(R, R.ix), y = pys(R, R.iy); if (!inView(x, y)) continue;
      if (st === 'juked') {   // '?' swirl: 6 dots orbiting the head + a bobbing '?'
        const age = w.t - (B.jukedAt || w.t);
        for (let k = 0; k < 6; k++) { const an = t * 5 + k * TAU / 6, px = Math.round(x + Math.cos(an) * 7), py = Math.round(y - 30 + Math.sin(an) * 3); cx.fillStyle = COL.huh; cx.fillRect(px, py, 1, 1); }
        P.text(cx, '?', x, y - 40 + Math.round(Math.sin(age * 8) * 1.5), COL.huh, 'c');
      } else if (st === 'searching' && B.search) {   // reached the guess, nothing there: still hunting -> a steady '?' + the widening ring
        const S = B.search, Pm = B.P || {}, r = Math.min(Pm.ringMax || 900, (Pm.ring0 || 150) + (Pm.grow || 110) * (w.t - S.t0));
        IT.FX.dring(R, pxs(R, S.cx), pys(R, S.cy), r / R.P, COL.huh, 0.18);
        P.text(cx, '?', x, y - 40 + Math.round(Math.sin(t * 4) * 1.5), COL.huh, 'c');
      }
      if (B.reacq != null && w.t - B.reacq < BANG_T && st === 'seen') {
        const k = (w.t - B.reacq) / BANG_T, pop = k < 0.15 ? Math.round((1 - k / 0.15) * 3) : 0;
        if (((t * 10) | 0) % 3 || k < 0.5) P.text(cx, '!', x, y - 42 - pop, COL.bang, 'c');
      }
    }
    for (const g of ghosts) { const x = pxs(R, g.x), y = pys(R, g.y); if (inView(x, y)) ghost(R, x, y, g.a, t); }
    chips = chips.filter(c => R_ && t - c.t0 < CHIP_T);
    for (const c of chips) {
      const e = w.byId.get(c.unit); if (!e || e.dead || !seenBy(R, e)) continue;
      R.interp(e);
      const x = pxs(R, R.ix), y = pys(R, R.iy); if (!inView(x, y)) continue;
      if (((t - c.t0) * 8 | 0) % 2 === 0 || t - c.t0 > 0.5) P.text(cx, c.k, x, y - 50, COL.chip, 'c');
    }
  }

  IT.BeliefFX = { init, clear, hud, COL, CHIPS, arrowOf };
})(typeof window !== 'undefined' ? window : globalThis);
