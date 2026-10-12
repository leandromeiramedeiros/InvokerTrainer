// Share image for the end splash: a 1200x630 canvas card (this run's medal, score / cleared, total damage + top 3 spells with icons,
// difficulty, ornaments that grow with the medal / clears)
// saved through a blob link as invoker-trainer-<date>.png. No network.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  IT.UI = IT.UI || {};
  const W = 1200, H = 630, FONT = '"Courier New", Consolas, monospace';

  // tiny seeded PRNG so a card is reproducible for the same run
  function prng(seed) { let s = (seed | 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return ((s >>> 0) % 100000) / 100000; }; }

  const pad2 = n => String(n).padStart(2, '0');
  const fmtN = n => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const stamp = d => { d = d || new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
  const filename = d => 'invoker-trainer-' + stamp(d) + '.png';

  function palette(tier) {
    const S = IT.UI.Splash, i = Math.max(0, Math.min(7, tier | 0));
    return S ? { hi: S.PAL[i][0], lo: S.PAL[i][1], bg: S.BG[i] } : { hi: '#f2c444', lo: '#b09844', bg: '#1c222c' };
  }

  function star(c, x, y, r, rot) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r;
      c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath(); c.fill();
  }

  // ornament level o (0..7): rays, sparkle count, corner stars, frame lines grow with it
  function background(c, d, o) {
    const p = palette(d.tier), R = prng(d.seed || 7);
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0b0e14'); g.addColorStop(0.55, p.bg); g.addColorStop(1, '#07090d');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // rays from the medal
    const cx = 330, cy = 300, n = 6 + o * 3;
    c.save(); c.globalAlpha = 0.05 + o * 0.012; c.fillStyle = p.hi;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.2832 + 0.3, w = 0.05 + R() * 0.06;
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a - w) * 1400, cy + Math.sin(a - w) * 1400); c.lineTo(cx + Math.cos(a + w) * 1400, cy + Math.sin(a + w) * 1400); c.closePath(); c.fill();
    }
    c.restore();
    const rg = c.createRadialGradient(cx, cy, 10, cx, cy, 380);
    rg.addColorStop(0, p.lo + 'aa'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = rg; c.fillRect(0, 0, W, H);
    // pixel sparkles
    c.fillStyle = p.hi;
    const sp = 40 + o * 26;
    for (let i = 0; i < sp; i++) { c.globalAlpha = 0.15 + R() * 0.6; const s = R() < 0.25 ? 6 : 3; c.fillRect(Math.floor(R() * W / 3) * 3, Math.floor(R() * H / 3) * 3, s, s); }
    c.globalAlpha = 1;
    // frame: one line per two ornament steps, plus corner stars from level 3 up
    c.strokeStyle = p.lo; c.lineWidth = 2;
    const lines = 1 + (o >> 1);
    for (let i = 0; i < lines; i++) { c.globalAlpha = 0.9 - i * 0.18; const m = 14 + i * 9; c.strokeRect(m, m, W - m * 2, H - m * 2); }
    c.globalAlpha = 1;
    if (o >= 3) {
      c.fillStyle = p.hi;
      [[40, 40], [W - 40, 40], [40, H - 40], [W - 40, H - 40]].forEach((q, i) => star(c, q[0], q[1], 12 + (o - 3) * 2, -1.5708 + i * 0.2));
    }
    if (o >= 6) { c.globalAlpha = 0.35; star(c, W / 2, 34, 18, -1.5708); c.globalAlpha = 1; }
  }

  function txt(c, s, x, y, size, col, align, bold, maxW) {
    c.font = (bold ? 'bold ' : '') + size + 'px ' + FONT; c.fillStyle = col; c.textAlign = align || 'left'; c.textBaseline = 'alphabetic';
    if (maxW) { while (size > 12 && c.measureText(s).width > maxW) { size -= 2; c.font = (bold ? 'bold ' : '') + size + 'px ' + FONT; } }
    c.fillText(s, x, y);
  }

  function render(d, doc) {
    doc = doc || document;
    const t = IT.t, cv = doc.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d'), p = palette(d.tier), inf = d.mode === 'infinite', o = Math.max(0, Math.min(7, d.ornament | 0));
    background(c, d, o);
    // medal / big number on the left
    const cx = 330, cy = 300;
    if (inf) {
      c.save(); c.shadowColor = p.hi; c.shadowBlur = 40;
      txt(c, String(d.cleared), cx, cy + 50, 190, p.hi, 'center', true, 420); c.restore();
      txt(c, t('end.sp.infCleared'), cx, cy + 100, 26, '#d8dee6', 'center', true, 420);
      if (d.best != null) txt(c, (d.newBest ? t('end.sp.newBest') + '  ' : '') + t('end.sp.best', { n: d.best }), cx, cy + 142, 22, d.newBest ? '#ffe27a' : '#9aa6b4', 'center', true, 420);
    } else {
      try {
        const m = IT.Medals.canvas(d.tier, d.stars, 64);
        c.imageSmoothingEnabled = false; c.save(); c.shadowColor = p.hi; c.shadowBlur = 36;
        c.drawImage(m, cx - 160, cy - 180, 320, 320); c.restore();
      } catch (e) { /* medal art optional */ }
      txt(c, t('share.medal'), cx, cy + 172, 20, '#9aa6b4', 'center', true, 440);
      txt(c, d.rankName, cx, cy + 214, 40, p.hi, 'center', true, 440);
      if (d.breakdown) txt(c, d.breakdown, cx, cy + 250, 20, '#cfd6dc', 'center', false, 520);   // v6 medal: Clear + Relics = score
    }
    // title + stat tiles + damage on the right
    const x0 = 640, cw = 260, ch = 92;
    txt(c, t('share.brand'), x0, 80, 22, p.lo, 'left', true);
    txt(c, t(inf ? 'end.sp.infinite' : 'end.sp.ranked'), x0, 122, 32, '#f1f4f8', 'left', true, 520);
    const box = (x, y, w, hh) => {
      c.fillStyle = 'rgba(8,10,14,0.62)'; c.fillRect(x, y, w, hh);
      c.strokeStyle = p.lo; c.globalAlpha = 0.6; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, hh - 1); c.globalAlpha = 1;
    };
    d.tiles.slice(0, 2).forEach((tl, i) => {
      const x = x0 + i * (cw + 16), y = 148;
      box(x, y, cw, ch);
      txt(c, tl.label, x + 16, y + 28, 17, '#9aa6b4', 'left', false, cw - 32);
      txt(c, tl.text, x + 16, y + 76, i === 0 ? 46 : 40, i === 0 ? p.hi : '#f1f4f8', 'left', true, cw - 32);
    });
    // total damage + top 3 spells (icon, name, bar, value)
    const y1 = 256, wd = cw * 2 + 16, top = (d.topSpells || []).slice(0, 3);
    box(x0, y1, wd, 84 + Math.max(1, top.length) * 52);
    txt(c, t('share.dmg'), x0 + 16, y1 + 30, 17, '#9aa6b4', 'left', false, 240);
    txt(c, fmtN(d.dmgTotal || 0), x0 + wd - 16, y1 + 34, 34, p.hi, 'right', true, 260);
    txt(c, t('share.topSpells'), x0 + 16, y1 + 66, 15, '#9aa6b4', 'left', false, 240);
    const max = top.length ? top[0].v || 1 : 1;
    top.forEach((sp, i) => {
      const y = y1 + 80 + i * 52;
      try { const ic = IT.Art && IT.Art.canvas('icons', sp.icon); if (ic) { c.imageSmoothingEnabled = false; c.drawImage(ic, x0 + 16, y, 40, 40); } } catch (e) { /* icon optional */ }
      txt(c, sp.label, x0 + 68, y + 18, 19, '#f1f4f8', 'left', true, 250);
      c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(x0 + 68, y + 28, wd - 200, 8);
      c.fillStyle = p.hi; c.fillRect(x0 + 68, y + 28, Math.max(4, (wd - 200) * sp.v / max), 8);
      txt(c, fmtN(sp.v), x0 + wd - 16, y + 34, 22, '#f1f4f8', 'right', true, 120);
    });
    if (!top.length) txt(c, t('end.sp.noDmg'), x0 + 16, y1 + 110, 18, '#9aa6b4', 'left', false, wd - 32);
    // v6 item 8: per-turn timeline summary line (one cell per turn: cleared green / failed red / not played grey, time-vs-par bar, check / cross mark)
    const tl = d.timeline || [];
    if (tl.length) {
      const ty = 508, n = tl.length, gap = 7, cwid = Math.floor((wd - gap * (n - 1)) / n), ok = tl.filter(c => c.state === 'ok').length, played = tl.filter(c => c.state !== 'none').length;
      txt(c, t('share.timeline'), x0, ty, 15, '#9aa6b4', 'left', false, 200);
      txt(c, ok + '/' + played + ' ' + t('end.tl.cleared'), x0 + wd, ty, 15, p.hi, 'right', true, 240);
      tl.forEach((q, i) => {
        const x = x0 + i * (cwid + gap), y = ty + 10, hh = 36, col = q.state === 'ok' ? '#58cc34' : q.state === 'fail' ? '#e4504c' : '#39414f';
        c.fillStyle = 'rgba(8,10,14,0.62)'; c.fillRect(x, y, cwid, hh);
        c.fillStyle = col; c.fillRect(x, y, cwid, 4);
        if (q.state !== 'none') {   // mark: check / cross drawn as strokes (no glyph font needed)
          const mx = x + 14, my = y + 18;
          c.strokeStyle = col; c.lineWidth = 3; c.beginPath();
          if (q.state === 'ok') { c.moveTo(mx - 6, my); c.lineTo(mx - 2, my + 5); c.lineTo(mx + 6, my - 6); } else { c.moveTo(mx - 5, my - 5); c.lineTo(mx + 5, my + 5); c.moveTo(mx + 5, my - 5); c.lineTo(mx - 5, my + 5); }
          c.stroke();
          c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(x + 28, y + 14, cwid - 36, 6);
          c.fillStyle = q.state === 'fail' ? '#e4504c' : q.under ? '#58cc34' : '#f2a43a'; c.fillRect(x + 28, y + 14, Math.max(2, (cwid - 36) * q.frac), 6);
        }
      });
    }
    // footer: difficulty / level / date
    const dn = d.diff && IT.hasT('dtier.' + d.diff) ? t('dtier.' + d.diff) : d.diff || '';
    const foot = [dn ? t('share.diff') + ': ' + dn : '', d.level ? t('share.level') + ' ' + d.level : '', stamp()].filter(Boolean).join('   |   ');
    txt(c, foot, x0, H - 52, 20, '#9aa6b4', 'left', false, 520);
    return cv;
  }

  // render + download through a blob link; cb(ok)
  function save(d, cb) {
    cb = cb || function () {};
    try {
      const cv = render(d);
      cv.toBlob(blob => {
        try {
          if (!blob) { cb(false); return; }
          const url = URL.createObjectURL(blob), a = document.createElement('a');
          a.href = url; a.download = filename(); a.style.display = 'none';
          document.body.appendChild(a); a.click();
          setTimeout(() => { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, 4000);
          cb(true);
        } catch (e) { cb(false); }
      }, 'image/png');
    } catch (e) { cb(false); }
  }

  IT.UI.Share = { render, save, filename, stamp, W, H };
})(typeof window !== 'undefined' ? window : globalThis);
