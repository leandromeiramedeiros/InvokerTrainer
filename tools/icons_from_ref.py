#!/usr/bin/env python3
"""Generate js/art/icons.js (20x20 HUD icons) from official Dota 2 icons in reference/dota/, then restyle toward
the old hand-drawn "charm" look (v6 WP8 middle ground).
Usage: python tools/icons_from_ref.py      (then python tools/icons_sheet.py OUT.png for the contact sheet)

Pipeline per icon (all parameters in DEF / ITEM / TUNE below):
  1. crop + enhance the reference (sat/con/gamma/sharp), resample to 80x80
  2. posterize: k-means (Lab) to K colours (no dithering), flat dark clusters merged into one background colour
  3. 4x4 block-mode down to 20x20 (bgw < 1 favours subject over background), then speck cleanup
  4. restyle the ramp (saturation push, luminance stretch)
  5. sel-out outline (darker-hue outline where the subject meets the background), 2-tone rim highlight + shade
  6. bevelled frame: dark outer ring, lit top/left + shaded bottom/right inner ring; optional sparkles
Palette chars beyond ASCII (Latin-1/Latin Extended-A) are used when the sheet needs more than ~85 colours.

Output file layout: generated part + the hand-drawn scenario-HUD icons (ui_atk/move/stop/hold/pos) that live after
the marker line '// ---- hand-drawn scenario-HUD'. That tail is preserved verbatim when this tool re-runs
(it relies on palette char 'A' = outline (#08080e) and '^' = white, which this tool pins, and avoids the tail's
own palette chars _ ~ { } | `). Do not hand-edit the generated frames; tune TUNE and re-run. Output is CRLF, UTF-8."""
import sys, os, colorsys
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, 'reference', 'dota')
OUT = os.path.join(ROOT, 'js', 'art', 'icons.js')
N = 20
S = 80                 # working resolution (4x4 block per output pixel)
OUTLINE = (8, 8, 14)
WHITE = (255, 255, 255)
TAIL_MARK = '// ---- hand-drawn scenario-HUD'
RESERVED = set('._~{}|`\'\\"A^')   # A/^ pinned below; the rest are used by the hand tail / JS string syntax

MAP = {
  'quas': 'ab_quas', 'wex': 'ab_wex', 'exort': 'ab_exort', 'invoke': 'ab_invoke',
  'coldsnap': 'ab_cold_snap', 'ghostwalk': 'ab_ghost_walk', 'icewall': 'ab_ice_wall', 'emp': 'ab_emp',
  'tornado': 'ab_tornado', 'alacrity': 'ab_alacrity', 'sunstrike': 'ab_sun_strike', 'forgespirit': 'ab_forge_spirit',
  'chaosmeteor': 'ab_chaos_meteor', 'deafeningblast': 'ab_deafening_blast',
  'refresher': 'it_refresher', 'atos': 'it_rod_of_atos', 'vyse': 'it_sheepstick', 'shiva': 'it_shivas_guard',
  'meteorhammer': 'it_meteor_hammer', 'bkb': 'it_black_king_bar', 'blink': 'it_blink',
  'scepter': 'it_ultimate_scepter', 'shard': 'it_aghanims_shard',
  'orchid': 'Orchid_Malevolence_itemicon_dota2_gameasset', 'gleipnir': 'Gleipnir_itemicon_dota2_gameasset',
  'travels': 'it_travel_boots', 'boots': 'it_boots',
  'forcestaff': 'Force_Staff_itemicon_dota2_gameasset', 'dust': 'Dust_of_Appearance_itemicon_dota2_gameasset',
  'euls': "Eul's_Scepter_of_Divinity_itemicon_dota2_gameasset", 'shadowblade': 'Shadow_Blade_itemicon_dota2_gameasset',
}
# Enhance: sharp (unsharp %), sat, con, gamma, crop=(fx,fy) trimmed per side.
# Posterize: K colours, maxc (per-icon colour cap), bgmax (merge clusters with Lab L below this into one bg colour),
#   bgw (block-mode weight of bg), med (median-filter size on the 80px image, 0=off), clean (speck passes),
#   psat (ramp saturation x), plum (ramp luminance stretch x about its mid), bgtint (flat backing tinted toward subject hue)
# Style: frame_f (frame ring value), selout (0..1 outline darkness), hl (rim highlight), shade, bevel (frame lighting),
#   draw=[ops] hand-drawn motif over the base dimmed by `dim` (see overlay()), edge (0=off, else luminance step that triggers a dark line on the darker side), spark=[(x,y),..] white sparkles, bgcol=(r,g,b)|None override flat backing colour
DEF = dict(sharp=40, sat=1.25, con=1.15, crop=None, gamma=1.0,
           K=9, maxc=13, bgmax=16, bgw=0.55, clean=2, psat=1.28, plum=1.12, med=0,
           bgtint=0.7, frame_f=0.5, selout=0.55, hl=0.6, shade=0.5, bevel=0.55, spark=[], bgcol=None, edge=0, draw=None, dim=0.5)
ITEM = dict(sharp=60, sat=1.3, con=1.15, gamma=1.0, crop=(0.07, 0.02), K=9, bgmax=9, bgw=0.75, med=3, clean=3)
ORB_SPARK = [(16, 15), (3, 3)]
import math
def _spikes(cx, cy, r0, r1, c, n=8, off=0.0):
    return [('line', cx + r0 * math.cos(off + i * 2 * math.pi / n), cy + r0 * math.sin(off + i * 2 * math.pi / n),
             cx + r1 * math.cos(off + i * 2 * math.pi / n), cy + r1 * math.sin(off + i * 2 * math.pi / n), c) for i in range(n)]
ICE_L, ICE_M, ICE_D, ICE_X = (214, 250, 255), (92, 200, 232), (34, 104, 156), (14, 40, 70)
GLEIPNIR = (_spikes(9, 8, 3, 6.6, (170, 240, 255)) + [('disc', 9, 8, 4.3, ((20, 40, 70),) * 3),
            ('disc', 9, 8, 3.5, (ICE_L, ICE_M, ICE_D)), ('px', 7, 6, WHITE), ('px', 8, 6, WHITE), ('px', 7, 7, WHITE)]
            + [('line', 13, 12, 17, 16, (236, 186, 70)), ('line', 14, 12, 17, 15, (150, 96, 24)), ('px', 16, 17, (255, 226, 130)), ('px', 17, 17, (150, 96, 24))])
SHIVA = [('disc', 10, 8, 7.2, ((14, 34, 52),) * 3), ('disc', 10, 8, 6.3, (ICE_L, ICE_M, ICE_D)),
         ('rect', 5, 8, 15, 9, ICE_X), ('px', 7, 8, WHITE), ('px', 12, 8, WHITE), ('px', 8, 8, (120, 255, 255)), ('px', 13, 8, (120, 255, 255)),
         ('rect', 4, 12, 16, 17, (60, 120, 150)), ('rect', 4, 12, 16, 12, ICE_M), ('rect', 7, 13, 13, 17, ICE_D), ('line', 10, 1, 10, 2, WHITE),
         ('px', 9, 2, ICE_M), ('px', 11, 2, ICE_M), ('rect', 9, 13, 11, 17, ICE_X), ('px', 10, 14, ICE_M), ('px', 10, 16, ICE_M)]
RAYS = lambda c: [('line', 16, 16, x, y, c) for x, y in ((2, 7), (5, 3), (10, 2), (15, 1), (2, 12))]
DEAF = ([('disc', 16, 16, 20, ((255, 120, 20), (255, 120, 20), (255, 120, 20)))] if False else []) + RAYS((70, 24, 100)) +        [('line', 16, 16, 3, 9, WHITE), ('line', 16, 16, 9, 3, (255, 210, 250)), ('disc', 16, 16, 2.6, (WHITE, WHITE, (255, 200, 240))), ('px', 15, 15, WHITE)]
METEOR = ([('line', 2 + i * 0.0, 2 + i * 0.0, 9, 9, (255, 150, 40)) for i in range(1)] + [('line', 2, 5, 8, 11, (190, 70, 20)), ('line', 5, 2, 11, 8, (190, 70, 20)),
          ('line', 3, 3, 9, 9, (255, 214, 90)), ('disc', 12, 12, 6.2, ((20, 8, 12),) * 3), ('disc', 12, 12, 5.4, ((255, 176, 70), (226, 92, 24), (140, 36, 14))),
          ('px', 10, 10, (255, 236, 150)), ('px', 11, 10, (255, 236, 150)), ('px', 10, 11, (255, 236, 150)),
          ('px', 13, 13, (70, 14, 10)), ('px', 14, 12, (70, 14, 10)), ('px', 12, 14, (70, 14, 10)), ('px', 14, 14, (70, 14, 10))])
TUNE = {
  'deafeningblast': dict(K=8, bgw=0.8, clean=3, con=1.3, psat=1.4, med=5, draw=DEAF, dim=0.85, maxc=16),
  'gleipnir': dict(draw=GLEIPNIR, dim=0.45, maxc=16, K=7, bgw=1.0, clean=3, sharp=0, med=7, gamma=0.85),
  'shiva': dict(draw=SHIVA, dim=0.4, maxc=18, K=8, bgw=1.0, clean=3, sharp=0, med=7, gamma=0.85),
  'chaosmeteor': dict(draw=METEOR, dim=0.6, maxc=16, K=8),
  'boots': dict(gamma=0.7, bgmax=6, K=9, med=5),
  'travels': dict(gamma=0.8, med=5),
  'blink': dict(gamma=0.85, med=5),
  'quas': dict(spark=ORB_SPARK), 'wex': dict(spark=ORB_SPARK), 'exort': dict(spark=ORB_SPARK),
}

def load(name):
    im = Image.open(os.path.join(REF, name + '.png')).convert('RGBA')
    bg = Image.new('RGBA', im.size, (0, 0, 0, 255))
    bg.alpha_composite(im)
    return bg.convert('RGB')

# ---------- colour helpers ----------
def rgb2lab(a):
    a = np.asarray(a, float) / 255.0
    a = np.where(a > 0.04045, ((a + 0.055) / 1.055) ** 2.4, a / 12.92)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = a @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)

def lum(c): return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
def clamp(v): return max(0, min(255, int(round(v))))
def tup(c): return tuple(clamp(v) for v in c)
def hsv(c): return colorsys.rgb_to_hsv(*(v / 255 for v in c))
def unhsv(h, s, v): return tup(tuple(255 * x for x in colorsys.hsv_to_rgb(h % 1.0, max(0, min(1, s)), max(0, min(1, v)))))

def shade(c, f):
    """f<1 darker (hue kept, a touch more saturated), f>1 lighter (a touch less saturated)."""
    h, s, v = hsv(c)
    if f < 1: return unhsv(h, min(1, s * 1.1 + 0.05), v * f)
    return unhsv(h, s / (1 + (f - 1) * 0.9), min(1, v * f + (f - 1) * 0.15))

def mix(a, b, t): return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))

# ---------- posterize ----------
def kmeans_lab(img, K):
    """img: PIL RGB (SxS). Returns (labels SxS, centre RGBs, centre L) from Lab k-means seeded by median cut."""
    q = img.quantize(colors=K, method=Image.MEDIANCUT, dither=Image.NONE)
    pal = np.array(q.getpalette()[:3 * K], float).reshape(-1, 3)
    arr = np.asarray(img, float).reshape(-1, 3)
    lab = rgb2lab(arr)
    cent = rgb2lab(pal)
    for _ in range(12):
        lbl = ((lab[:, None, :] - cent[None, :, :]) ** 2).sum(-1).argmin(1)
        for k in range(len(cent)):
            m = lbl == k
            if m.any(): cent[k] = lab[m].mean(0)
    lbl = ((lab[:, None, :] - cent[None, :, :]) ** 2).sum(-1).argmin(1)
    rgbc = []
    for k in range(len(cent)):
        m = lbl == k
        rgbc.append(tuple(arr[m].mean(0)) if m.any() else (0, 0, 0))
    return lbl.reshape(S, S), rgbc, cent[:, 0]

def prep(key, p):
    im = load(MAP[key]); w, h = im.size
    cx, cy = p['crop'] if p['crop'] else ((0.03, 0.03) if MAP[key].startswith('ab_') else (0.11, 0.02))
    im = im.crop((round(w * cx), round(h * cy), round(w * (1 - cx)), round(h * (1 - cy))))
    im = im.resize((S, S), Image.LANCZOS)
    if p['med']: im = im.filter(ImageFilter.MedianFilter(p['med']))
    im = im.filter(ImageFilter.UnsharpMask(radius=2.0, percent=p['sharp'], threshold=0))
    if p['gamma'] != 1.0: im = im.point([round(255 * (i / 255) ** p['gamma']) for i in range(256)] * 3)
    im = ImageEnhance.Color(im).enhance(p['sat'])
    im = ImageEnhance.Contrast(im).enhance(p['con'])
    return im

def _line(px, x0, y0, x1, y1, c):
    n = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
    for i in range(n + 1):
        x = round(x0 + (x1 - x0) * i / n); y = round(y0 + (y1 - y0) * i / n)
        if 1 <= x < N - 1 and 1 <= y < N - 1: px[y][x] = c

def overlay(px, ops):
    """Hand-drawn motif ops for icons too complex to read when downsampled (drawn over the dimmed posterized base).
    ('px',x,y,c) ('line',x0,y0,x1,y1,c) ('rect',x0,y0,x1,y1,c) ('disc',cx,cy,r,(light,mid,dark)) lit from the top-left."""
    for op in ops:
        k = op[0]
        if k == 'px': px[op[2]][op[1]] = op[3]
        elif k == 'line': _line(px, *op[1:])
        elif k == 'rect':
            for y in range(op[2], op[4] + 1):
                for x in range(op[1], op[3] + 1): px[y][x] = op[5]
        elif k == 'disc':
            cx, cy, r, ramp = op[1:]
            for y in range(1, N - 1):
                for x in range(1, N - 1):
                    d2 = (x - cx) ** 2 + (y - cy) ** 2
                    if d2 <= r * r:
                        t = ((x - cx) + (y - cy)) / (2.0 * r)
                        px[y][x] = ramp[0] if t < -0.2 else ramp[1] if t < 0.4 else ramp[2]

def make(key):
    p = dict(DEF)
    if not MAP[key].startswith('ab_'): p.update(ITEM)
    p.update(TUNE.get(key, {}))
    im = prep(key, p)
    lbl, cents, Ls = kmeans_lab(im, p['K'])
    nK = len(cents)
    order = np.argsort(Ls)
    bg = int(order[0])                       # background = darkest cluster; other very dark clusters merge into it
    remap = list(range(nK))
    for k in order[1:]:
        if Ls[k] < p['bgmax']: remap[k] = bg
    lbl = np.array(remap)[lbl]
    bgc = p['bgcol']
    B = S // N
    out = np.zeros((N, N), int)
    for y in range(N):
        for x in range(N):
            blk = lbl[y * B:(y + 1) * B, x * B:(x + 1) * B].ravel()
            cnt = np.bincount(blk, minlength=nK).astype(float)
            cnt[bg] *= p['bgw']
            out[y, x] = int(cnt.argmax())
    for _ in range(p['clean']):              # speck cleanup
        o2 = out.copy()
        for y in range(1, N - 1):
            for x in range(1, N - 1):
                v = out[y, x]
                if v in (out[y - 1, x], out[y + 1, x], out[y, x - 1], out[y, x + 1]): continue
                nb = [out[y + dy, x + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dx or dy]
                o2[y, x] = int(np.bincount(nb, minlength=nK).argmax())
        out = o2
    used = sorted(set(out.ravel().tolist()))
    sub = [k for k in used if k != bg]
    mid = 0
    if sub:
        ls = [lum(cents[k]) for k in sub]; mid = (min(ls) + max(ls)) / 2
    cols = {}
    for k in used:
        c = cents[k]
        if k == bg: cols[k] = tup(bgc or cents[bg]); continue
        h, s, v = hsv(c)
        v2 = (lum(c) - mid) * p['plum'] + mid
        v = max(0.05, min(1, v * (v2 / max(1, lum(c)))))
        cols[k] = unhsv(h, min(1, s * p['psat']), v)
    # dominant subject colour -> tint for the flat backing and the frame ring (old set: hue-dark backing + mid-tone frame)
    cnts = np.bincount(out.ravel(), minlength=nK)
    dom = max(sub, key=lambda k: cnts[k] * (0.25 + hsv(cents[k])[1]) * (0.3 + hsv(cents[k])[2])) if sub else bg
    domc = cols.get(dom, cols[bg])
    if not p['bgcol']:
        cols[bg] = shade(mix(cents[bg], shade(domc, 0.22), p['bgtint']), 1.0)
    fh, fs, fv = hsv(domc)
    frame = unhsv(fh, min(1, fs * 0.95 + 0.05), min(fv * p['frame_f'], 0.36))
    px = [[cols[out[y, x]] for x in range(N)] for y in range(N)]
    isbg = [[out[y, x] == bg for x in range(N)] for y in range(N)]
    base = [row[:] for row in px]
    Lb = lambda y, x: lum(base[y][x])
    for y in range(1, N - 1):
        for x in range(1, N - 1):
            if isbg[y][x]: continue
            nbs = ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1))
            if p['selout'] > 0 and any(isbg[a][b] for a, b in nbs):
                px[y][x] = shade(base[y][x], 1 - p['selout'] * 0.6)
            elif p['hl'] > 0 and Lb(y - 1, x) < Lb(y, x) - 14 and Lb(y, x - 1) < Lb(y, x) - 14:
                px[y][x] = shade(base[y][x], 1 + 0.35 * p['hl'])
            elif p['shade'] > 0 and Lb(y + 1, x) < Lb(y, x) - 16 and Lb(y, x + 1) < Lb(y, x) - 16:
                px[y][x] = shade(base[y][x], 1 - 0.28 * p['shade'])
    if p['draw']:
        px = [[shade(c, p['dim']) for c in row] for row in px]
        overlay(px, p['draw'])
    if p['edge']:                            # cartoon line: darker side of any strong luminance step gets a darker hue
        ed = [row[:] for row in px]
        for y in range(1, N - 1):
            for x in range(1, N - 1):
                l0 = Lb(y, x)
                if any(Lb(y + dy, x + dx) > l0 + p['edge'] for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1))):
                    ed[y][x] = shade(base[y][x], 0.55)
        px = ed
    for i in range(N):                       # outer ring
        for (x, y) in ((i, 0), (i, N - 1), (0, i), (N - 1, i)): px[y][x] = OUTLINE
    for i in range(1, N - 1):                # inner bevel ring: lit top/left, shaded bottom/right
        for (x, y, f) in ((i, 1, 1 + 0.9 * p['bevel']), (1, i, 1 + 0.9 * p['bevel']),
                          (i, N - 2, 1 - 0.45 * p['bevel']), (N - 2, i, 1 - 0.45 * p['bevel'])):
            c = px[y][x]
            if isbg[y][x]: c = frame                  # ring over background takes the hue-tinted frame colour
            px[y][x] = shade(c, f)
    for (sx, sy) in p['spark']:              # sparkles (old-set orbs)
        px[sy][sx] = WHITE
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            xx, yy = sx + dx, sy + dy
            if 1 < xx < N - 2 and 1 < yy < N - 2: px[yy][xx] = tup(mix(px[yy][xx], WHITE, 0.75))
    return cap_colours(px, p['maxc'])

def cap_colours(px, maxc):
    """Per-icon cap: merge the least-used colour into its nearest neighbour until <= maxc (outline/white are kept)."""
    cnt = {}
    for row in px:
        for c in row: cnt[c] = cnt.get(c, 0) + 1
    keep = {OUTLINE, WHITE}
    while len(cnt) > maxc:
        c = min((c for c in cnt if c not in keep), key=lambda c: cnt[c])
        n = min((d for d in cnt if d != c), key=lambda d: sum((c[i] - d[i]) ** 2 for i in range(3)))
        cnt[n] += cnt.pop(c)
        px = [[n if q == c else q for q in row] for row in px]
    return px

def merge_cols(grids, tol=10):
    """Merge near-identical colours across the whole sheet (keeps the palette compact)."""
    cnt = {}
    for g in grids.values():
        for row in g:
            for c in row: cnt[c] = cnt.get(c, 0) + 1
    reps, m = [], {}
    for c in sorted(cnt, key=lambda c: -cnt[c]):
        for r in reps:
            if sum((c[i] - r[i]) ** 2 for i in range(3)) <= tol * tol: m[c] = r; break
        else:
            reps.append(c); m[c] = c
    return reps, m

def charset():
    ch = [c for c in (chr(i) for i in range(33, 127)) if c not in RESERVED]
    return ch + [chr(i) for i in range(0xC0, 0x250) if i not in (0xD7, 0xF7)]

def main():
    keys = list(MAP)
    grids = {k: make(k) for k in keys}
    reps, m = merge_cols(grids)
    m[OUTLINE] = OUTLINE
    reps = sorted((c for c in reps if c not in (OUTLINE, WHITE)), key=lum)
    chars = charset()
    assert len(reps) + 2 <= len(chars), len(reps)
    cmap = {OUTLINE: 'A', WHITE: '^'}
    for c, ch in zip(reps, chars): cmap[c] = ch
    pal = [('A', OUTLINE), ('^', WHITE)] + [(cmap[c], c) for c in reps]
    rows_out = {}
    for k in keys:
        g = grids[k]
        rows_out[k] = [''.join('.' if (x, y) in ((0, 0), (N - 1, 0), (0, N - 1), (N - 1, N - 1)) else cmap[m.get(g[y][x], g[y][x])]
                              for x in range(N)) for y in range(N)]
    tail = ''
    if os.path.exists(OUT):
        old = open(OUT, encoding='utf-8').read().replace('\r\n', '\n')
        i = old.find(TAIL_MARK)
        if i >= 0:
            tail = old[i:]
            tail = tail[:tail.rfind('})(typeof window')].rstrip('\n')
    L = []
    L.append('// 20x20 HUD icons (orbs, invoked spells, items). Generated by tools/icons_from_ref.py from reference/dota/ official icons (posterized + restyled);')
    L.append('// do not hand-edit the generated frames. The hand-drawn scenario-HUD icons after the marker line below are preserved verbatim by the tool.')
    L.append("(function(G){ 'use strict'; const IT = G.IT;")
    L.append("IT.Art.sheet('icons', { pal:{")
    for ch, c in pal: L.append("  '%s':'#%02x%02x%02x'," % (ch, *c))
    L[-1] = L[-1].rstrip(',')
    L.append('}, frames:{')
    for i, k in enumerate(keys):
        L.append('  %s:[' % k)
        for j, r in enumerate(rows_out[k]): L.append("    '%s'%s" % (r, ',' if j < N - 1 else ''))
        L.append('  ]' + (',' if i < len(keys) - 1 else ''))
    L.append('}});')
    if tail: L.append(tail)
    L.append("})(typeof window!=='undefined'?window:globalThis);")
    with open(OUT, 'w', newline='', encoding='utf-8') as f: f.write('\r\n'.join(L) + '\r\n')
    print('wrote', OUT, len(pal), 'colours', 'tail kept' if tail else 'NO TAIL')

main()
