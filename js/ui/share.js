// Share image for the end splash: a 1200x630 canvas card (medal, rank, key stats, difficulty, ornaments that grow with the rank / clears)
// saved through a blob link as invoker-trainer-<date>.png. No network.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  IT.UI = IT.UI || {};
  const W = 1200, H = 630, FONT = '"Courier New", Consolas, monospace';

  // tiny seeded PRNG so a card is reproducible for the same run
  function prng(seed) { let s = (seed | 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return ((s >>> 0) % 100000) / 100000; }; }

  const pad2 = n => String(n).padStart(2, '0');
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
      txt(c, d.rankName, cx, cy + 190, 40, p.hi, 'center', true, 440);
      if (d.rating != null) {
        const dl = d.delta || 0;
        txt(c, t('end.rating') + ' ' + d.rating + (dl ? '  ' + (dl > 0 ? '+' : '') + dl : ''), cx, cy + 228, 24, dl > 0 ? '#7bd88f' : dl < 0 ? '#ff7a7a' : '#cfd6dc', 'center', true, 440);
      }
    }
    // title + stat grid on the right
    const x0 = 640;
    txt(c, t('share.brand'), x0, 92, 22, p.lo, 'left', true);
    txt(c, t(inf ? 'end.sp.infinite' : 'end.sp.ranked'), x0, 138, 34, '#f1f4f8', 'left', true, 520);
    const tiles = d.tiles.slice(0, 6), cw = 260, ch = 112;
    tiles.forEach((tl, i) => {
      const x = x0 + (i % 2) * (cw + 16), y = 175 + Math.floor(i / 2) * (ch + 14);
      c.fillStyle = 'rgba(8,10,14,0.62)'; c.fillRect(x, y, cw, ch);
      c.strokeStyle = p.lo; c.globalAlpha = 0.6; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1); c.globalAlpha = 1;
      txt(c, tl.label, x + 16, y + 32, 18, '#9aa6b4', 'left', false, cw - 32);
      txt(c, tl.text, x + 16, y + 88, i === 0 ? 54 : 46, i === 0 ? p.hi : '#f1f4f8', 'left', true, cw - 32);
    });
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
