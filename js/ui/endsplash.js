// End splash (ranked + infinite run): per-run medal / count reveal over a pixel-ember canvas, procedural sting, curated stats,
// total damage + PHYSICAL / MAGICAL / PURE bar + damage by spell, RELICS PROGRESS panel (js/ui/relics.js),
// PLAY AGAIN / INFINITE RUN (8/8 only) / RELICS PROGRESS / SAVE IMAGE / GO BACK. Pure formatting helpers are exported for the share card (js/ui/share.js).
// v6 items 8 + 9: BEST COMBO / MOST USED SPELL tile, per-turn TIMELINE strip (summary.log), and a tier-scaled show: FX[tier] (sand, embers, god rays, shine, pulse, ornament class tier-N).
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  IT.UI = IT.UI || {};

  // per rank tier (herald .. immortal): [bright, base] particle / glow colours and a dark background tint
  const PAL = [['#e8d684', '#b09844'], ['#f2b070', '#c0703a'], ['#eef3f8', '#aeb8c6'], ['#fff4a8', '#f2c444'], ['#a8f6ee', '#2ec6be'], ['#d8ffa0', '#58cc34'], ['#e6b8ff', '#9c52e4'], ['#ff9c9c', '#ffd650']];
  const BG = ['#2a2010', '#2a1608', '#1c222c', '#2c2408', '#082a28', '#12280c', '#220c3a', '#3a0c14'];
  const POP = 0.66;   // seconds from mount to the medal landing (the stings hit there)
  const f1 = n => String(Math.round(n * 10) / 10);

  // tile -> { label, text } (language at call time)
  function fmtTile(tl) {
    const t = IT.t;
    let text;
    switch (tl.kind) {
      case 'frac': text = tl.v + (tl.of ? '/' + tl.of : ''); break;
      case 'pct': text = Math.round(tl.v * 100) + '%'; break;
      case 'sec': text = f1(tl.v) + 's'; break;
      case 'rate': text = String(Math.round(tl.v)); break;
      default: text = String(tl.v);
    }
    return { label: t('end.sp.' + tl.id), text };
  }

  // ---------------------------------------------------------------- v6 item 9: the show scales with the medal tier (0 Herald .. 7 Immortal). Every column is non-decreasing (tested).
  //   sandMax grains alive (0 = no glow sand), rain grains/s after the landing, burst grains at the landing, pile column cap, gold 1 = gold rain,
  //   embers = density multiplier of the pixel embers, rays / rayA / raySpd = god-ray count / alpha / deg per s (0 = none), shine 0 none, 1 once, 2 repeating
  //   at shineRate sweeps per minute, pulse 0..1 = medal glow pulse strength, glow = halo radius (em)
  const FX = {
    sandMax: [0, 0, 40, 60, 80, 100, 130, 160],
    rain: [0, 0, 0, 3, 6, 9, 24, 40],
    burst: [0, 0, 24, 36, 50, 64, 90, 120],
    pile: [0, 0, 1, 2, 3, 4, 6, 8],
    gold: [0, 0, 0, 0, 0, 0, 1, 1],
    embers: [1, 1.05, 1.15, 1.3, 1.5, 1.75, 2, 2.3],
    rays: [0, 3, 4, 5, 6, 8, 10, 12],
    rayA: [0, 0.05, 0.07, 0.09, 0.11, 0.14, 0.18, 0.22],
    raySpd: [0, 4, 5, 6, 7, 8, 9, 10],
    shine: [0, 0, 1, 1, 2, 2, 2, 2],
    shineRate: [0, 0, 0, 4, 5, 6, 8, 10],
    pulse: [0, 0.15, 0.25, 0.35, 0.5, 0.65, 0.8, 1],
    glow: [0.3, 0.45, 0.6, 0.8, 1, 1.3, 1.6, 2],
  };
  const fxOf = tier => {
    const i = Math.max(0, Math.min(7, tier | 0)), o = { tier: i };
    for (const k of Object.keys(FX)) o[k] = FX[k][i];
    return o;
  };
  const reduced = () => { try { return !!(G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };

  // ---------------------------------------------------------------- v6 item 8: per-turn timeline + best combo (pure; summary.log from js/sim/ranked.js)
  const FAILS = ['time', 'died', 'cross', 'seen', 'method', 'escaped', 'caught', 'tower'];
  function abbr(s, max) {
    s = String(s || ''); max = max || 11;
    return s.length <= max ? s : s.slice(0, max - 1).replace(/[\s\-]+$/, '') + '…';
  }
  // cells for the strip: ranked = one per turn (m.turns, default 8; the last record of a turn wins), infinite = the last <= 8 turns played
  function timeline(m) {
    m = m || {};
    const log = Array.isArray(m.log) ? m.log : [], inf = m.mode === 'infinite';
    const by = new Map(); log.forEach((e, i) => { if (e) by.set(e.n != null ? e.n : i, e); });
    const keys = Array.from(by.keys()).sort((a, b) => a - b);
    const list = inf ? keys.slice(-8) : null, total = inf ? Math.max(1, list.length) : (m.turns || 8);
    const cells = [];
    for (let i = 0; i < total; i++) {
      const key = inf ? list[i] : i, e = key != null ? by.get(key) : null;
      if (!e) { cells.push({ n: (inf && key != null ? key : i) + 1, state: 'none' }); continue; }
      const par = Math.max(0.1, +e.par || 0), time = Math.max(0, +e.time || 0);
      cells.push({
        n: key + 1, state: e.ok ? 'ok' : 'fail', id: e.id, name: nameOf(e.name) || e.id || '', short: abbr(nameOf(e.name) || e.id, 11),
        reason: e.reason || null, detail: e.detail || null, time, par, limit: +e.limit || 0, points: Math.round(e.points || 0),
        frac: Math.max(0.04, Math.min(1, time / (2 * par))), under: time <= par, steps: (e.steps || []).slice(), dmg: Math.round(e.dmg || 0),
      });
    }
    return cells;
  }
  // the cleared turn with the highest clear score (ties: more damage); null without clears
  function bestCombo(cells) {
    let b = null;
    for (const c of cells || []) if (c.state === 'ok' && (!b || c.points > b.points || (c.points === b.points && c.dmg > b.dmg))) b = c;
    return b;
  }
  // most cast ability of the run ({ id, casts }) from the stats collector's spells map; null when nothing was cast
  function mostUsed(S) {
    let b = null;
    const sp = (S && S.spells) || {};
    for (const id of Object.keys(sp).sort()) { const n = sp[id] && sp[id].casts | 0; if (n > 0 && (!b || n > b.casts)) b = { id, casts: n }; }
    return b;
  }
  function failText(reason, detail) {
    if (!reason) return '';
    const t = IT.t, dk = 'scn.fail.' + reason + (detail ? '.' + detail : '');
    return IT.hasT(dk) ? t(dk) : IT.hasT('scn.fail.' + reason) ? t('scn.fail.' + reason) : reason;
  }
  // 7x7 pixel glyphs (state + fail reasons), drawn on a tiny canvas and scaled by CSS
  const GLYPH = {
    ok: ['.......', '......#', '.....##', '#...##.', '##.##..', '.###...', '..#....'],
    no: ['#.....#', '##...##', '.##.##.', '..###..', '.##.##.', '##...##', '#.....#'],
    time: ['.#####.', '#..#..#', '#..#..#', '#..##.#', '#.....#', '#.....#', '.#####.'],
    died: ['.#####.', '#######', '#.###.#', '#######', '.#####.', '..#.#..', '..#.#..'],
    cross: ['...#...', '...#...', '.#.#.#.', '..###..', '...#...', '#######', '.......'],
    seen: ['.......', '..###..', '.#...#.', '##.#.##', '.#...#.', '..###..', '.......'],
    method: ['.#...#.', '.#...#.', '#######', '#.....#', '#.###.#', '#.....#', '.#####.'],
    escaped: ['.......', '#..#...', '.#..#..', '..#..#.', '.#..#..', '#..#...', '.......'],
    caught: ['...#...', '...#...', '...#...', '...#...', '...#...', '.......', '...#...'],
    tower: ['#.#.#.#', '#######', '.#####.', '..###..', '..###..', '.#####.', '#######'],
  };
  function glyph(key, cls, col) {
    const g = GLYPH[key] || GLYPH.no, cv = document.createElement('canvas');
    cv.width = cv.height = 7; cv.className = 'sp-gl ' + (cls || '');
    const x = cv.getContext('2d');
    x.fillStyle = col || '#fff';
    g.forEach((row, y) => { for (let i = 0; i < 7; i++) if (row[i] === '#') x.fillRect(i, y, 1, 1); });
    return cv;
  }
  const ZERO = { tier: 0, stars: 0, name: 'Herald', id: 'herald' };
  // v6 WP6: the medal is this run's (IT.Ranks.fromRun via curated().medal), never the cumulative rating
  const medalOf = (m, cur) => (cur && cur.medal) || (IT.Ranks && IT.Ranks.fromRun ? IT.Ranks.fromRun(m) : ZERO);
  const tierOf = (m, cur) => (m.mode === 'infinite' ? cur.ornament : medalOf(m, cur).tier);
  const medalName = r => (r ? r.name + (r.stars ? ' ' + r.stars : '') : '');
  const nameOf = o => (o && typeof o === 'object' ? o[IT.lang] || o.en : o || '');
  const fmtN = n => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // damage source id -> label in the current language (spells, items, plain attacks)
  function srcName(id) {
    const t = IT.t;
    if (IT.hasT && IT.hasT('spell.' + id)) return t('spell.' + id);
    if (IT.hasT && IT.hasT('item.' + id)) return t('item.' + id);
    if (id === 'attack') return t('attack');
    return id;
  }
  const srcIcon = id => (id === 'attack' ? 'ui_atk' : id);
  const DMG_COL = { physical: '#e8643a', magical: '#7a6cf0', pure: '#f2c444' };
  const dmgLabel = k => IT.t(k === 'physical' ? 'end.sp.dmg.physical' : k === 'magical' ? 'end.sp.dmg.magical' : 'end.sp.dmg.pure');

  // v6 medal: "Clear 740 + Relics 210 = 950" (ranked runs that carry the split; '' otherwise)
  function breakdown(m) {
    if (!m || m.mode === 'infinite' || m.clearScore == null) return '';
    return IT.t('end.sp.breakdown', { clear: fmtN(m.clearScore), relic: fmtN(m.relicScore || 0), total: fmtN(m.score) });
  }
  // everything the share card needs, resolved in the current language
  function shareData(m, cur) {
    const inf = m.mode === 'infinite', r = medalOf(m, cur), dm = cur.damage || { total: 0, bySpell: [] };
    return {
      mode: m.mode, ornament: cur.ornament, tier: inf ? cur.ornament : r.tier, stars: inf ? 0 : r.stars,
      rankName: inf ? '' : medalName(r), rating: null, delta: null,
      cleared: cur.cleared, best: m.best != null ? m.best : null, newBest: !!m.newBest, score: Math.round(m.score || 0),
      tiles: cur.tiles.map(fmtTile), diff: m.diff, level: m.level, seed: Math.round(m.score || 0) + cur.cleared * 977,
      breakdown: inf ? '' : breakdown(m), timeline: timeline(m).map(c => ({ state: c.state, frac: c.frac || 0, under: !!c.under, reason: c.reason })), dmgTotal: dm.total || 0, topSpells: (dm.bySpell || []).slice(0, 3).map(x => ({ id: x.id, icon: srcIcon(x.id), label: srcName(x.id), v: x.v })),
    };
  }

  // ---------------------------------------------------------------- pixel ember / spark canvas (low-res, additive, trailing)
  // origin(): burst centre as fractions [0..1] of the canvas (the medal / count stage, so the burst never starts under the title)
  function embers(cv, tier, lvl, origin, mul) {
    const W = cv.width, H = cv.height, c = cv.getContext('2d'), pal = PAL[Math.max(0, Math.min(7, tier))], R = Math.random;
    const P = [];
    let last = performance.now(), t0 = last, popped = false, acc = 0;
    const burst = n => {
      let o = null; try { o = origin && origin(); } catch (e) { /* layout optional */ }
      const cx = W * (o ? o.x : 0.4), cy = H * (o ? o.y : 0.55);
      for (let i = 0; i < n; i++) {
        const a = R() * 6.2832, sp = 25 + R() * (70 + lvl * 9);
        P.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8 - 18, g: 60, life: 0.9 + R() * 1.6, age: 0, s: R() < 0.3 ? 2 : 1, c: pal[R() < 0.55 ? 0 : 1] });
      }
    };
    const ember = () => P.push({ x: R() * W, y: H + 2, vx: (R() - 0.5) * 8, vy: -(8 + R() * 22), g: -2, life: 3 + R() * 3, age: 0, s: R() < 0.2 ? 2 : 1, c: pal[R() < 0.5 ? 0 : 1], sway: R() * 6.28 });
    const grain = () => P.push({ x: R() * W, y: -2, vx: (R() - 0.5) * 6, vy: 6 + R() * 12, g: 0, life: 6 + R() * 4, age: 0, s: 1, c: pal[1], sway: R() * 6.28, dim: 0.5 });
    function frame(now) {
      if (!cv.isConnected && now - t0 > 600) return;
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const el = (now - t0) / 1000;
      if (!popped && el >= POP) { popped = true; burst(70 + lvl * 28); }
      acc += dt * (5 + lvl * 3.5) * (mul || 1);
      while (acc >= 1) { acc -= 1; if (P.length < 700) { ember(); if (R() < 0.35) grain(); } }
      c.globalCompositeOperation = 'destination-out'; c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(0, 0, W, H);   // trails
      c.globalCompositeOperation = 'lighter';
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        p.age += dt;
        if (p.age >= p.life || p.y < -4 || p.y > H + 6) { P[i] = P[P.length - 1]; P.pop(); continue; }
        p.vy += p.g * dt;
        if (p.sway != null) p.x += Math.sin(el * 1.7 + p.sway) * 5 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        const k = 1 - p.age / p.life, a = (p.dim || 1) * Math.min(1, k * 2.2);
        c.globalAlpha = a * 0.22; c.fillStyle = p.c; c.fillRect((p.x | 0) - 1, (p.y | 0) - 1, p.s + 2, p.s + 2);   // soft halo (bloom)
        c.globalAlpha = a; c.fillRect(p.x | 0, p.y | 0, p.s, p.s);
      }
      c.globalAlpha = 1;
    }
    requestAnimationFrame(frame);
  }

  // run fn(k 0..1 eased) over dur ms after delay ms; stops when el leaves the document
  function tween(el, delay, dur, fn) {
    const t0 = performance.now() + delay;
    const step = now => {
      if (!el.isConnected && now > t0 + 50) return;
      const k = Math.max(0, Math.min(1, (now - t0) / dur));
      fn(1 - Math.pow(1 - k, 3));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function medalCanvas(tier, stars, px) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = px;
    try {
      const src = IT.Medals.canvas(tier, stars, px), x = cv.getContext('2d');
      x.imageSmoothingEnabled = false; x.drawImage(src, 0, 0, px, px);
    } catch (e) { /* medal art optional */ }
    return cv;
  }

  // god rays: drawn ONCE on a canvas (radial streaks fading outward); CSS rotates it (compositor only, no per-frame cost)
  function raysCanvas(fx, col) {
    const S = 320, cv = document.createElement('canvas');
    cv.width = cv.height = S; cv.className = 'sp-rays';
    const c = cv.getContext('2d'), n = fx.rays, r = S / 2;
    c.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.2832 + (i % 2) * 0.05, w = 0.05 + (i % 3) * 0.018;
      c.globalAlpha = 0.7 + (i % 2) * 0.3;
      c.beginPath(); c.moveTo(r, r); c.lineTo(r + Math.cos(a - w) * r * 1.5, r + Math.sin(a - w) * r * 1.5); c.lineTo(r + Math.cos(a + w) * r * 1.5, r + Math.sin(a + w) * r * 1.5); c.closePath(); c.fill();
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'destination-in';
    const g = c.createRadialGradient(r, r, 4, r, r, r);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    return cv;
  }
  // white silhouette of the medal; a CSS mask band sweeps over it (shine)
  function shineCanvas(medal, px) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = px; cv.className = 'sp-shine';
    try {
      const x = cv.getContext('2d');
      x.imageSmoothingEnabled = false; x.drawImage(medal, 0, 0);
      x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, px, px);
    } catch (e) { /* optional */ }
    return cv;
  }
  // glow sand on its own low-res canvas (IT.Sand.createGlow): a burst from the medal at the landing, then (by tier) a rain that piles up
  function sandLayer(cv, fx, pal, origin) {
    if (!fx.sandMax || !IT.Sand || !IT.Sand.createGlow || !cv.getContext('2d')) return null;
    const W = cv.width, H = cv.height;
    const hi = fx.gold ? '#fff4a8' : pal[0], mid = fx.gold ? '#f2c444' : pal[1];
    const sand = IT.Sand.createGlow(cv, { floor: H - 1, gravity: 62, pile: fx.pile, max: fx.sandMax, drain: fx.gold ? 0.35 : 0.8, wind: 12 });
    let last = performance.now(), t0 = last, popped = false;
    function frame(now) {
      if (!cv.isConnected && now - t0 > 600) return;
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!popped && now - t0 >= POP * 1000) {
        popped = true;
        let o = null; try { o = origin && origin(); } catch (e) { /* layout optional */ }
        sand.burst(W * (o ? o.x : 0.4), H * (o ? o.y : 0.45), fx.burst, [hi, mid, pal[1]], { speed: 46, lift: 26, spread: 8, floor: H - 1 });
        if (fx.rain) sand.setEmitters([{ x0: 0, x1: W, y: -2, pal: { h: hi, m: mid }, rate: fx.rain, vx: 6 }]);
      }
      if (!popped) return;
      sand.step(dt);
      if (sand.live()) sand.draw(); else cv.getContext('2d').clearRect(0, 0, W, H);
    }
    requestAnimationFrame(frame);
    return sand;
  }

  // v6 item 8 tiles: BEST COMBO (cleared turn with the top clear score: name, step icons, points, damage) or, without clears, MOST USED SPELL
  function bestTile(cells, S, wide) {
    const { h } = IT.UI, t = IT.t, b = bestCombo(cells), cls = 'sp-tile sp-tbest' + (wide ? ' wide' : '');
    if (b) {
      const seq = b.steps.filter((a, i, l) => a !== l[i - 1]).slice(0, 6);
      return h('div', { class: cls, 'data-kind': 'best', 'data-id': b.id },
        h('span', { text: t('end.sp.bestCombo') }),
        h('b', { class: 'bc-name', 'data-tip': b.name, text: abbr(b.name, 22) }),
        h('div', { class: 'bc-ico' }, seq.map(a => IT.UI.icon(srcIcon(a), 'sp-dico'))),
        h('small', { text: t('end.sp.pts', { n: fmtN(b.points) }) + (b.dmg > 0 ? '  ·  ' + t('end.sp.dmgN', { n: fmtN(b.dmg) }) : '') }));
    }
    const u = mostUsed(S);
    return h('div', { class: cls, 'data-kind': 'used', 'data-id': u ? u.id : '' },
      h('span', { text: t('end.sp.topSpell') }),
      u ? h('div', { class: 'bc-row' }, IT.UI.icon(srcIcon(u.id), 'sp-dico'), h('b', { class: 'bc-name', text: srcName(u.id) })) : h('b', { class: 'bc-name', text: '—' }),
      h('small', { text: u ? t('end.sp.casts', { n: fmtN(u.casts) }) : '' }));
  }

  // v6 item 8: the per-turn timeline strip (cells reading left to right, staggered in)
  function timelineBlock(cells) {
    const { h } = IT.UI, t = IT.t, ok = cells.filter(c => c.state === 'ok').length, played = cells.filter(c => c.state !== 'none').length;
    const row = cells.map((c, i) => {
      if (c.state === 'none') return h('div', { class: 'tlc none', style: { '--i': i } }, h('div', { class: 'tl-top' }, h('i', { text: String(c.n) })), h('div', { class: 'tl-name', text: '—' }), h('div', { class: 'tl-bar' }), h('div', { class: 'tl-sub', text: t('end.tl.skipped') }));
      const fail = c.state === 'fail', why = fail ? failText(c.reason, c.detail) : '';
      const tip = t('end.tl.turn', { n: c.n }) + ': ' + c.name + (why ? ' — ' + why : '') + '  (' + f1(c.time) + 's / ' + t('end.tl.par', { p: f1(c.par) }) + ')';
      return h('div', { class: 'tlc ' + c.state + (c.under ? ' under' : ' over'), style: { '--i': i }, 'data-tip': tip, 'data-n': c.n },
        h('div', { class: 'tl-top' }, h('i', { text: String(c.n) }), glyph(fail ? 'no' : 'ok', 'tl-st', fail ? '#ff7a74' : '#7bd88f'), fail && c.reason ? glyph(GLYPH[c.reason] ? c.reason : 'no', 'tl-why', '#ffc4a8') : null),
        h('div', { class: 'tl-name', text: c.short }),
        h('div', { class: 'tl-bar' }, h('i', { style: { width: (c.frac * 100).toFixed(1) + '%' } }), h('u')),
        h('div', { class: 'tl-sub', text: f1(c.time) + 's / ' + f1(c.par) + 's' }),
        h('b', { class: 'tl-pts', text: fail ? '—' : '+' + fmtN(c.points) }));
    });
    return h('div', { class: 'sp-tl' },
      h('div', { class: 'sp-dhead' }, h('span', { class: 'sp-dlab', text: t('end.tl.title') }), h('span', { class: 'sp-dlab', text: ok + '/' + played + ' ' + t('end.tl.cleared') })),
      h('div', { class: 'sp-tlrow' }, row));
  }

  // TOTAL DAMAGE + PHYSICAL / MAGICAL / PURE stacked bar + DAMAGE BY SPELL (only sources that hit, desc, with icons)
  function damageBlock(dm) {
    const { h } = IT.UI, t = IT.t;
    if (!dm || !(dm.total > 0)) return h('div', { class: 'sp-dmg none' }, h('span', { class: 'sp-dlab', text: t('end.sp.dmgTotal') }), h('b', { class: 'sp-dtot', text: '0' }), h('p', { class: 'sp-dnone', text: t('end.sp.noDmg') }));
    const tot = Math.max(1, dm.byType.physical + dm.byType.magical + dm.byType.pure);
    const types = ['physical', 'magical', 'pure'];
    const bar = h('div', { class: 'sp-dbar' }, types.filter(k => dm.byType[k] > 0).map(k => h('i', { class: 'dt-' + k, style: { width: (dm.byType[k] / tot * 100).toFixed(2) + '%', background: DMG_COL[k] }, 'data-tip': dmgLabel(k) + ': ' + fmtN(dm.byType[k]) })));
    const legend = h('div', { class: 'sp-dleg' }, types.map(k => h('span', { class: 'dt-' + k + (dm.byType[k] > 0 ? '' : ' off') }, h('i', { style: { background: DMG_COL[k] } }), dmgLabel(k) + ' ' + Math.round(dm.byType[k] / tot * 100) + '%')));
    const top = dm.bySpell.length ? dm.bySpell[0].v : 1;
    const rows = dm.bySpell.map(x => h('div', { class: 'sp-drow', 'data-src': x.id },
      IT.UI.icon(srcIcon(x.id), 'sp-dico'), h('span', { class: 'sp-dname', text: srcName(x.id) }),
      h('span', { class: 'sp-dline' }, h('i', { style: { width: Math.max(2, x.v / top * 100).toFixed(1) + '%' } })), h('b', { text: fmtN(x.v) })));
    return h('div', { class: 'sp-dmg' },
      h('div', { class: 'sp-dhead' }, h('span', { class: 'sp-dlab', text: t('end.sp.dmgTotal') }), h('b', { class: 'sp-dtot', text: fmtN(dm.total) })),
      bar, legend,
      h('div', { class: 'sp-dlab sub', text: t('end.sp.dmgBySpell') }),
      h('div', { class: 'sp-dlist' }, rows));
  }

  function splash(info) {
    const { h, btn } = IT.UI, t = IT.t, A = IT.App;
    const m = info.mode || {}, inf = m.mode === 'infinite', cur = IT.StatsCollector.curated(info.stats, m);
    const tier = tierOf(m, cur), col = PAL[tier], F = fxOf(tier), calm = reduced(), cells = timeline(m);
    const root = h('div', { class: 'scr endscr splash tier-' + tier, style: { '--sp1': col[0], '--sp2': BG[tier], '--pl': calm ? 0 : F.pulse, '--glow': F.glow + 'em', '--rayA': F.rayA, '--rayT': (F.raySpd ? 360 / F.raySpd : 0) + 's', '--shT': (F.shineRate ? 60 / F.shineRate : 0) + 's' } });
    const sandCv = h('canvas', { class: 'sp-sand', width: 256, height: 144 });
    const fx = h('canvas', { class: 'sp-fx', width: 320, height: 180 });
    const stage = h('div', { class: 'sp-stage' }, F.rays ? raysCanvas(F, col[0]) : null, h('div', { class: 'sp-glow' }), h('div', { class: 'sp-ring' }), h('div', { class: 'sp-ring r2' }));
    const side = h('div', { class: 'sp-side' });
    let count = null, newMedal = false;

    if (inf) {
      count = h('b', { class: 'sp-count', text: '0' });
      stage.appendChild(h('div', { class: 'sp-num' }, count, h('span', { text: t('end.sp.infCleared') })));
      side.appendChild(h('div', { class: 'sp-best' + (m.newBest ? ' new' : ''), text: m.newBest ? t('end.sp.newBest') + '  ' + t('end.sp.best', { n: m.best }) : t('end.sp.best', { n: m.best || 0 }) }));
      let why = '';
      if (m.reason === 'quit') why = t('end.sp.quit');
      else if (m.failReason) { const dk = 'scn.fail.' + m.failReason + (m.failDetail ? '.' + m.failDetail : ''); why = IT.hasT(dk) ? t(dk) : IT.hasT('scn.fail.' + m.failReason) ? t('scn.fail.' + m.failReason) : m.failReason; }
      if (why) side.appendChild(h('div', { class: 'sp-why', text: t('end.sp.failedBy', { why }) }));
      if (m.failName) side.appendChild(h('div', { class: 'sp-on', text: t('end.sp.failedOn', { name: nameOf(m.failName) }) }));
    } else {
      const r = medalOf(m, cur), K = IT.StatsCollector.medalKey;
      // best medal before this run (main.js passes it; a synthetic call falls back to the stored best)
      const prev = info.prevBest !== undefined ? info.prevBest : (() => { try { const L = IT.UI.Life && IT.UI.Life.load(); return L && L.bestMedal; } catch (e) { return null; } })();
      newMedal = K(r) > K(prev);
      const mc = medalCanvas(r.tier, r.stars, 176);
      stage.appendChild(h('div', { class: 'sp-medal' + (F.shine ? ' shiny' + (F.shine > 1 ? ' loop' : '') : '') }, h('i', { class: 'sp-aura' }), mc, F.shine ? shineCanvas(mc, 176) : null));
      side.appendChild(h('div', { class: 'sp-kick', text: t('end.sp.medal') }));
      side.appendChild(h('div', { class: 'sp-rname', text: medalName(r) }));
      side.appendChild(h('div', { class: 'sp-score' }, h('span', { text: t('end.sp.score') + ' ' }), h('b', { text: fmtN(m.score) })));
      const bd = breakdown(m);
      if (bd) side.appendChild(h('div', { class: 'sp-on sp-break', 'data-tip': t('end.sp.breakdown.d'), text: bd }));
      if (newMedal) side.appendChild(h('div', { class: 'sp-best new', text: t('end.sp.newMedal') }));
      else if (prev) side.appendChild(h('div', { class: 'sp-best', text: t('end.sp.bestMedal', { name: medalName(prev) }) }));
    }

    const tileEls = cur.tiles.map((tl, i) => {
      const f = fmtTile(tl);
      return h('div', { class: 'sp-tile', style: { '--i': i } }, h('span', { text: f.label }), h('b', { text: f.text }));
    });
    const bt = bestTile(cells, info.stats, (tileEls.length + 1) % 2 === 1);   // fills the last grid slot (spans the row when it would stand alone)
    bt.style.setProperty('--i', tileEls.length);
    const tiles = h('div', { class: 'sp-tiles' }, tileEls, bt);
    let shareBtn = null;
    const share = () => {
      const S = IT.UI.Share; if (!S) return;
      S.save(shareData(m, cur), ok => {
        shareBtn.textContent = t(ok ? 'end.btn.shared' : 'end.btn.shareFail');
        setTimeout(() => { if (shareBtn.isConnected) shareBtn.textContent = t('end.btn.share'); }, 2200);
      });
    };
    shareBtn = h('button', { class: 'btn', type: 'button', 'data-share': '1', onclick: share, text: t('end.btn.share') });
    const relicsBtn = IT.UI.Relics ? h('button', {
      class: 'btn blu relicbtn', type: 'button', 'data-relics': '1', text: t('end.btn.relics'),
      onclick: () => { if (!root.querySelector('.rl-over')) root.appendChild(IT.UI.Relics.panel(cur.relics, null)); },
    }) : null;
    // v6: Infinite Run is only offered after a perfect ranked run (all turns solved); an infinite run offers RANKED back
    const perfect = !inf && (m.solved | 0) >= (m.turns || 8);
    const infBtn = perfect ? h('button', { class: 'btn red infbtn', type: 'button', 'data-snd': 'start', 'data-tip': t('end.btn.infinite.d'), onclick: () => A.go('infinite'), text: t('end.btn.infinite') }) : null;
    const btns = h('div', { class: 'sp-btns' },
      btn('end.btn.again', () => A.go('again'), 'gold'),
      inf ? btn('end.btn.ranked', () => A.go('ranked'), 'grn') : infBtn,
      relicsBtn,
      shareBtn,
      btn('end.btn.back', () => A.go('title'), 'dim'));

    root.append(calm ? null : sandCv, fx, h('div', { class: 'sp-flash' }),
      h('div', { class: 'sp-body' },
        h('div', { class: 'sp-head', text: t(inf ? 'end.sp.infinite' : 'end.sp.ranked') }),
        h('div', { class: 'sp-hero' }, stage, side),
        h('div', { class: 'sp-grid' }, tiles, damageBlock(cur.damage)),
        timelineBlock(cells),
        btns));

    // sting once per run (a language switch rebuilds the screen), then the animations that need the element in the document
    if (!info.sting) {
      info.sting = true;
      const kind = inf ? (cur.cleared > 0 ? 'reveal' : 'fail') : newMedal ? 'up' : 'reveal';
      try { if (IT.Music) IT.Music.stinger(kind); } catch (e) { /* audio optional */ }
    }
    setTimeout(() => {
      const origin = () => {
        const a = root.getBoundingClientRect(), b = stage.getBoundingClientRect();
        return a.width > 0 && a.height > 0 ? { x: (b.left + b.width / 2 - a.left) / a.width, y: (b.top + b.height / 2 - a.top) / a.height } : null;
      };
      embers(fx, tier, cur.ornament, origin, F.embers);
      if (!calm) sandLayer(sandCv, F, col, origin);
      if (count) tween(root, POP * 1000 + 150, 1100 + Math.min(1500, cur.cleared * 80), k => { count.textContent = String(Math.round(cur.cleared * k)); });
    }, 0);
    return root;
  }

  IT.UI.Splash = { FX, fxOf, FAILS, timeline, bestCombo, mostUsed, abbr, failText, fmtTile, shareData, breakdown, PAL, BG, medalCanvas, srcName, srcIcon, DMG_COL, fmtN };
  IT.UI.endSplash = splash;
})(typeof window !== 'undefined' ? window : globalThis);
