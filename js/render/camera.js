// Camera: world-unit top-left (x,y). Edge scroll (window edge via mouse.edge, or canvas edge via mouse.in), arrow keys,
// optional lock-to-hero, `follow` (center key held), speed scaled by the camSpeed setting.
// Centering never snaps except centerOn(): glideTo / follow / lock ease with a frame-rate independent exponential (tau ~0.16 s).
// v6 item 13 (intro tour): glideTo(x, y, dur) = a timed ease-in-out glide over dur s; while cam.script is set (main.js: the tour is
// running) lock / follow do not pull the view back to the hero. release() = a cancelled intro: stay exactly where the camera is.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const TAU = 0.16, TAU_FAR = 0.1;   // s: time constant; jumps over a full screen glide a bit quicker

  // Overscroll: the view may pan past the map by the on-screen HUD coverage (bottom HUD, left minimap, top strip, small right margin),
  // so a unit on the map edge can be brought into the VISIBLE play area. centerOn / glide / lock / minimap all share this clamp.
  // HUD coverage in base screen units (480x270): minimap right edge, top strip bottom, bottom HUD height. IT.HUD.insets() {l,r,t,b} overrides when present.
  const INSETS = { l: 139, r: 0, t: 18, b: 66 };
  // extra breathing room past the HUD so a unit's body clears it (base units): margin = inset + PAD
  const PAD = { l: 10, r: 8, t: 4, b: 8 };

  function insets() {
    let h = null;
    try { h = IT.HUD && IT.HUD.insets && IT.HUD.insets(); } catch (e) { h = null; }
    const o = {};
    for (const k in INSETS) o[k] = h && isFinite(h[k]) && h[k] >= 0 ? +h[k] : INSETS[k];
    return o;
  }

  // overscroll margins + the visible-area centre, world units, from the live zoom (view px per base unit = VIEW_W / VIEW_W_BASE)
  function margins() {
    const GM = IT.GAME, P = GM.UNIT_PX, i = insets(), k = GM.VIEW_W / (GM.VIEW_W_BASE || 480) * P, bh = GM.VIEW_H_BASE || 270;
    return {
      l: (i.l + PAD.l) * k, r: (i.r + PAD.r) * k, t: (i.t + PAD.t) * k, b: (i.b + PAD.b) * k,
      fx: GM.VIEW_W * P / 2,                              // horizontal: the minimap only covers a corner, so the true centre
      fy: (i.t + bh - i.b) / 2 * GM.VIEW_H / bh * P,      // vertical: centre of the band between the top strip and the bottom HUD
    };
  }

  function create(map) {
    const GM = IT.GAME, P = GM.UNIT_PX;   // view size is live (scroll-wheel zoom changes GM.VIEW_W/VIEW_H)
    const cx = v => { const m = margins(), lo = -m.l; return IT.U.clamp(v, lo, Math.max(lo, map.W - GM.VIEW_W * P + m.r)); };
    const cy = v => { const m = margins(), lo = -m.t; return IT.U.clamp(v, lo, Math.max(lo, map.H - GM.VIEW_H * P + m.b)); };
    const cam = {
      setMap(m) { map = m; cam.glide = null; cam.hold = false; cam.clamp(); },   // map swap: new bounds
      x: 0, y: 0, lock: false, follow: false, speed: 2200, edge: 3, glide: null, hold: false, tau: TAU, script: false,
      clamp() { cam.x = cx(cam.x); cam.y = cy(cam.y); },
      margins,
      centerOn(x, y) { const m = margins(); cam.glide = null; cam.x = x - m.fx; cam.y = y - m.fy; cam.clamp(); },   // instant (minimap, start): onto the visible-area centre
      // round start / scenario swap: hard snap onto the hero; the next update() keeps it there (no lerp, no edge / arrow pan on that frame), lock / follow untouched
      snap(x, y) { cam.centerOn(x, y); cam.hold = true; },
      // v6 item 45: the intro was cancelled by an action -> the tour stops where it is (a tour glide is dropped, nothing re-centres; lock / follow resume as set)
      release() { if (cam.script) cam.glide = null; cam.script = false; },
      glideTo(x, y, dur) {                                                                                              // eased (dur: timed ease-in-out)
        const m = margins();
        cam.glide = { x: cx(x - m.fx), y: cy(y - m.fy) };
        if (dur > 0) Object.assign(cam.glide, { dur, t: 0, x0: cam.x, y0: cam.y });
      },
      // integer pixel offset of the view in map-pixel space
      get px() { return Math.round(cam.x / P); },
      get py() { return Math.round(cam.y / P); },
      toWorld(mx, my) { return { x: cam.px * P + mx * P, y: cam.py * P + my * P }; },
      toScreen(wx, wy) { return { x: wx / P - cam.px, y: wy / P - cam.py }; },
      update(dt, keys, mouse, hero) {
        if (cam.hold) {   // first frame after snap(): stay exactly centred on the hero
          cam.hold = false;
          if (hero) cam.centerOn(hero.x, hero.y);
          return false;
        }
        let goal = null;
        const tg = cam.glide && cam.glide.dur > 0 ? cam.glide : null;
        if (tg && (cam.script || !(hero && (cam.follow || cam.lock)))) {   // timed glide: smoothstep-cubic ease from its start point
          tg.t += dt;
          const f = Math.min(1, tg.t / tg.dur), e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
          cam.x = tg.x0 + (tg.x - tg.x0) * e; cam.y = tg.y0 + (tg.y - tg.y0) * e;
          if (f >= 1) cam.glide = null;
        }
        else if (hero && !cam.script && (cam.follow || cam.lock)) { const m = margins(); goal = { x: cx(hero.x - m.fx), y: cy(hero.y - m.fy) }; }
        else if (cam.glide) goal = cam.glide;
        if (goal) {
          const dx = goal.x - cam.x, dy = goal.y - cam.y, d = Math.hypot(dx, dy);
          if (d < 0.5) { cam.x = goal.x; cam.y = goal.y; if (goal === cam.glide) cam.glide = null; }
          else {
            const k = 1 - Math.exp(-dt / (d > GM.VIEW_W * P ? Math.min(cam.tau, TAU_FAR) : cam.tau));
            cam.x += dx * k; cam.y += dy * k;
          }
        }
        const set = IT.Settings && IT.Settings.get ? IT.Settings.get() : null;
        const sp = cam.speed * dt * ((set && set.camSpeed) || 1), e = cam.edge, ed = mouse.edge || {};
        let moved = false;
        if (keys.has('ArrowLeft') || ed.l || (mouse.in && mouse.x < e)) { cam.x -= sp; moved = true; }
        if (keys.has('ArrowRight') || ed.r || (mouse.in && mouse.x > GM.VIEW_W - e)) { cam.x += sp; moved = true; }
        if (keys.has('ArrowUp') || ed.u || (mouse.in && mouse.y < e)) { cam.y -= sp; moved = true; }
        if (keys.has('ArrowDown') || ed.d || (mouse.in && mouse.y > GM.VIEW_H - e)) { cam.y += sp; moved = true; }
        if (moved) cam.glide = null;   // manual scrolling takes over from a glide
        cam.clamp();
        return moved;
      },
    };
    if (map) cam.clamp();
    return cam;
  }

  IT.Camera = { create, margins, insets, INSETS, PAD };
})(typeof window !== 'undefined' ? window : globalThis);
