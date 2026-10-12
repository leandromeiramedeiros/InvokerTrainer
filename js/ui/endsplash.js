// End splash (ranked + infinite run): medal / count reveal over a pixel-ember canvas, procedural sting, a few curated stats,
// PLAY AGAIN / INFINITE RUN (RANKED) / SAVE IMAGE / GO BACK. Pure formatting helpers are exported for the share card (js/ui/share.js).
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
  const tierOf = (m, cur) => {
    if (m.mode === 'infinite') return cur.ornament;
    const ar = m.rank && m.rank.after && m.rank.after.rank;
    if (ar) return ar.tier;
    try { return IT.Ranks.fromRating(IT.Ranked.profile().rating).tier; } catch (e) { return 0; }
  };
  const rankOf = (m) => {
    const ar = m.rank && m.rank.after && m.rank.after.rank;
    if (ar) return ar;
    try { return IT.Ranks.fromRating(IT.Ranked.profile().rating); } catch (e) { return { tier: 0, stars: 0, name: '' }; }
  };
  const nameOf = o => (o && typeof o === 'object' ? o[IT.lang] || o.en : o || '');

  // everything the share card needs, resolved in the current language
  function shareData(m, cur) {
    const inf = m.mode === 'infinite', r = rankOf(m), rk = m.rank;
    return {
      mode: m.mode, ornament: cur.ornament, tier: inf ? cur.ornament : r.tier, stars: inf ? 0 : r.stars,
      rankName: inf ? '' : r.name + (r.stars ? ' ' + r.stars : ''), rating: rk ? Math.round(rk.after.rating) : null, delta: rk ? rk.delta : null,
      cleared: cur.cleared, best: m.best != null ? m.best : null, newBest: !!m.newBest, score: Math.round(m.score || 0),
      tiles: cur.tiles.map(fmtTile), diff: m.diff, level: m.level, seed: Math.round(m.score || 0) + cur.cleared * 977,
    };
  }

  // ---------------------------------------------------------------- pixel ember / spark canvas (low-res, additive, trailing)
  // origin(): burst centre as fractions [0..1] of the canvas (the medal / count stage, so the burst never starts under the title)
  function embers(cv, tier, lvl, origin) {
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
      acc += dt * (5 + lvl * 3.5);
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

  function splash(info) {
    const { h, btn } = IT.UI, t = IT.t, A = IT.App;
    const m = info.mode || {}, inf = m.mode === 'infinite', cur = IT.StatsCollector.curated(info.stats, m);
    const tier = tierOf(m, cur), rk = m.rank, col = PAL[tier];
    const root = h('div', { class: 'scr endscr splash', style: { '--sp1': col[0], '--sp2': BG[tier] } });
    const fx = h('canvas', { class: 'sp-fx', width: 320, height: 180 });
    const stage = h('div', { class: 'sp-stage' }, h('div', { class: 'sp-glow' }), h('div', { class: 'sp-ring' }), h('div', { class: 'sp-ring r2' }));
    const side = h('div', { class: 'sp-side' });
    let count = null, rating = null;

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
      const r = rankOf(m);
      stage.appendChild(h('div', { class: 'sp-medal' }, medalCanvas(r.tier, r.stars, 176)));
      side.appendChild(h('div', { class: 'sp-rname', text: r.name + (r.stars ? ' ' + r.stars : '') }));
      if (rk) {
        const dc = rk.delta > 0 ? '#7bd88f' : rk.delta < 0 ? '#ff7a7a' : '#cfd6dc';
        rating = h('b', { text: String(Math.round(rk.before.rating)) });
        side.appendChild(h('div', { class: 'sp-rating' }, h('span', { text: t('end.rating') + ' ' }), rating));
        side.appendChild(h('div', { class: 'sp-delta', text: (rk.delta > 0 ? '+' : '') + rk.delta, style: { color: dc } }));
        const nm = r.name + (r.stars ? ' ' + r.stars : '');
        side.appendChild(h('div', { class: 'sp-msg' + (rk.up ? ' up' : ''), text: rk.up ? t('end.rankUp', { rank: nm }) : rk.down ? t('end.rankDown', { rank: nm }) : t('end.rankSame', { rank: nm }) }));
      } else side.appendChild(h('div', { class: 'sp-msg', text: t('end.noRating') }));
    }

    const tiles = h('div', { class: 'sp-tiles' }, cur.tiles.map((tl, i) => {
      const f = fmtTile(tl);
      return h('div', { class: 'sp-tile', style: { '--i': i } }, h('span', { text: f.label }), h('b', { text: f.text }));
    }));
    let shareBtn = null;
    const share = () => {
      const S = IT.UI.Share; if (!S) return;
      S.save(shareData(m, cur), ok => {
        shareBtn.textContent = t(ok ? 'end.btn.shared' : 'end.btn.shareFail');
        setTimeout(() => { if (shareBtn.isConnected) shareBtn.textContent = t('end.btn.share'); }, 2200);
      });
    };
    shareBtn = h('button', { class: 'btn', type: 'button', 'data-share': '1', onclick: share, text: t('end.btn.share') });
    // v6: Infinite Run is only offered after a perfect ranked run (all turns solved); an infinite run offers RANKED back
    const perfect = !inf && (m.solved | 0) >= (m.turns || 8);
    const infBtn = perfect ? h('button', { class: 'btn red infbtn', type: 'button', 'data-snd': 'start', 'data-tip': t('end.btn.infinite.d'), onclick: () => A.go('infinite'), text: t('end.btn.infinite') }) : null;
    const btns = h('div', { class: 'sp-btns' },
      btn('end.btn.again', () => A.go('again'), 'gold'),
      inf ? btn('end.btn.ranked', () => A.go('ranked'), 'grn') : infBtn,
      shareBtn,
      btn('end.btn.back', () => A.go('title'), 'dim'));

    root.append(fx, h('div', { class: 'sp-flash' }),
      h('div', { class: 'sp-body' },
        h('div', { class: 'sp-head', text: t(inf ? 'end.sp.infinite' : 'end.sp.ranked') }),
        h('div', { class: 'sp-hero' }, stage, side),
        tiles, btns));

    // sting once per run (a language switch rebuilds the screen), then the animations that need the element in the document
    if (!info.sting) {
      info.sting = true;
      const kind = inf ? (cur.cleared > 0 ? 'reveal' : 'fail') : rk && rk.up ? 'up' : rk && rk.down ? 'down' : 'reveal';
      try { if (IT.Music) IT.Music.stinger(kind); } catch (e) { /* audio optional */ }
    }
    setTimeout(() => {
      embers(fx, tier, cur.ornament, () => {
        const a = root.getBoundingClientRect(), b = stage.getBoundingClientRect();
        return a.width > 0 && a.height > 0 ? { x: (b.left + b.width / 2 - a.left) / a.width, y: (b.top + b.height / 2 - a.top) / a.height } : null;
      });
      if (count) tween(root, POP * 1000 + 150, 1100 + Math.min(1500, cur.cleared * 80), k => { count.textContent = String(Math.round(cur.cleared * k)); });
      if (rating && rk) tween(root, POP * 1000 + 350, 1400, k => { rating.textContent = String(Math.round(rk.before.rating + (rk.after.rating - rk.before.rating) * k)); });
    }, 0);
    return root;
  }

  IT.UI.Splash = { fmtTile, shareData, PAL, BG, medalCanvas };
  IT.UI.endSplash = splash;
})(typeof window !== 'undefined' ? window : globalThis);
