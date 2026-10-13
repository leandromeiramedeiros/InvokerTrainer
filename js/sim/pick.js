// v6 item 54: click / target boxes. ONE place that answers "which unit is under the cursor" (selection, right-click attack, unit-targeted
// spells / items, hover cursor). Pure: reads entity state only (no DOM, no render). Collision and spell hit radii are untouched.
//   IT.Pick.boxOf(e)            -> { x0, y0, x1, y1 } world units: the drawn sprite, padded +20 % each side, +60 % of its height above the head,
//                                  shifted up by the lift (a tornado / Eul's victim is clickable where it is DRAWN, not at its shadow)
//   IT.Pick.unitAt(w, x, y, o)  -> best entity under (x, y) or null.  o: { team, ok(e), P, ground, pickups }
// Priority when boxes overlap: enemy heroes ('enemy') > own side / dummies / spirits / allies / Roshan > towers; ties: nearest to the box centre.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const HOVER = 70;          // legacy ground forgiveness (world units around the hull): kept for unlifted units so feet / shadow stay clickable
  const PAD_SIDE = 0.2, PAD_TOP = 0.6, PAD_TOP_BIG = 0.25, LIFT_VIS = 1.7, EUL_HOVER_PX = 15, BKB_SCALE = 1.2;
  // drawn sprite per kind, in px: [w, h, anchorX, anchorY] (anchor = the ground point inside the frame; matches js/art + js/render/units.js)
  const SPR = {
    hero: [26, 28, 13, 27], enemy: [20, 24, 10, 22], dummy: [20, 24, 10, 22], ally: [20, 24, 10, 22], spirit: [14, 16, 7, 15],
    roshan: [44, 46, 22, 43], tower: [24, 64, 12, 53], pickup: [16, 20, 8, 19],
  };
  const SCARECROW = [24, 32, 12, 30];
  const BIG = { tower: 1, roshan: 1 };   // already tall: smaller head padding
  const RANK = { enemy: 0, hero: 1, spirit: 1, ally: 1, dummy: 1, roshan: 1, tower: 2, pickup: 3 };
  const INVIS = ['ghost', 'invisible', 'invis', 'shadowblade'];

  const unitPx = () => (IT.GAME && IT.GAME.UNIT_PX) || 6;
  const hasS = (e, t) => { const s = e.statuses; if (!s) return false; for (let i = 0; i < s.length; i++) if (s[i].type === t) return true; return false; };
  const isFoeKind = e => e.kind === 'dummy' || e.kind === 'enemy';

  // lift in world units (same rule as render/units.js visZ): tornado ('lift') x1.7; Eul's hovers >= 15 px even without sim z
  function liftOf(e) {
    const s = e.statuses, z = e.z || 0;
    if (s) for (let i = 0; i < s.length; i++) {
      const t = s[i].type;
      if (t === 'lift' || t === 'cyclone' || t === 'euls') {
        const eul = t === 'euls' || t === 'cyclone' || s[i].ability === 'euls' || !!(s[i].data && s[i].data.euls);
        return eul ? Math.max(z * 1.3, EUL_HOVER_PX * unitPx()) : z * LIFT_VIS;
      }
    }
    return z;
  }

  // drawn sprite of e: [w, h, anchorX, anchorY]; enemy / dummy / ally skins read IT.GAME.SKIN_META (v6 #65: the 34x28 Vitinian is bigger than the 20x24 default)
  function sprOf(e) {
    if (e.kind === 'dummy' && e.scarecrow) return SCARECROW;
    if ((e.kind === 'enemy' || e.kind === 'dummy' || e.kind === 'ally') && e.skin && IT.Skins && IT.Skins.meta) { const m = IT.Skins.meta(e.skin); return [m.w, m.h, m.anchor[0], m.anchor[1]]; }
    return SPR[e.kind] || SPR.enemy;
  }

  function boxOf(e, P) {
    P = P || unitPx();
    const spr = sprOf(e);
    const k = isFoeKind(e) && (e.bkb || hasS(e, 'magicImmune')) ? BKB_SCALE : 1;
    const w = spr[0] * k, h = spr[1] * k, ax = spr[2] * k, ay = spr[3] * k;
    const up = liftOf(e);
    const x0 = e.x + (-ax - w * PAD_SIDE) * P, x1 = e.x + (w - ax + w * PAD_SIDE) * P;
    const y0 = e.y - up + (-ay - h * (BIG[e.kind] ? PAD_TOP_BIG : PAD_TOP)) * P;
    const y1 = e.y - up + Math.max(h - ay, 0) * P;
    return { x0, y0, x1, y1 };
  }

  // stealth the viewer (team 0) cannot see: invisible and neither dusted nor under true sight
  function hiddenFromPlayer(w, e) {
    if (e.team === 0) return false;
    let inv = !!e.invisible;
    if (!inv && e.statuses) for (let i = 0; i < e.statuses.length; i++) if (INVIS.indexOf(e.statuses[i].type) >= 0) { inv = true; break; }
    if (!inv) return false;
    if (hasS(e, 'revealed')) return false;
    try { if (IT.Vision && IT.Vision.trueSighted && IT.Vision.trueSighted(w, 0, e)) return false; } catch (err) { /* ignore */ }
    return true;
  }
  const fogHidden = (w, e) => !!(w.fog && e.team !== 0 && (e.team === 1 ? !e.visible : e.visible === false));

  function unitAt(w, x, y, o) {
    o = o || {};
    const P = o.P || unitPx(), ground = o.ground !== false;
    let best = null, br = 9, bd = Infinity;
    for (const e of w.ents) {
      if (e.dead || !(e.kind in RANK)) continue;
      if (e.kind === 'pickup' && !o.pickups) continue;
      if (o.team != null && e.team !== o.team) continue;
      if (o.ok && !o.ok(e)) continue;
      if (fogHidden(w, e) || hiddenFromPlayer(w, e)) continue;
      const b = boxOf(e, P);
      let hit = x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
      if (!hit && ground && !(e.z > 1) && !liftOf(e)) { const lim = (e.radius || 0) + HOVER; hit = (x - e.x) * (x - e.x) + (y - e.y) * (y - e.y) <= lim * lim; }
      if (!hit) continue;
      const r = RANK[e.kind], cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (r < br || (r === br && d < bd)) { best = e; br = r; bd = d; }
    }
    return best;
  }

  IT.Pick = { boxOf, unitAt, liftOf, sprOf, SPR, RANK, HOVER };
})(typeof window !== 'undefined' ? window : globalThis);
