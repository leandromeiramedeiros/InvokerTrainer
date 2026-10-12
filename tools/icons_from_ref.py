#!/usr/bin/env python3
"""Generate js/art/icons.js (20x20 HUD icons) from official Dota 2 icons in reference/dota/.
Usage: python tools/icons_from_ref.py [--preview DIR]
Per-icon tuning lives in TUNE. Output is CRLF. Keys with no reference (SKIP) keep nothing: all keys are mapped."""
import sys, os
from PIL import Image, ImageEnhance, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, 'reference', 'dota')
OUT = os.path.join(ROOT, 'js', 'art', 'icons.js')
N = 20
NCOL = 84          # shared palette size (incl. outline colour), excl. transparency
OUTLINE = (8, 8, 14)

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
# per-icon: sharp (unsharp percent), sat, con, crop (fraction trimmed per side [x,y])
DEF = dict(sharp=60, sat=1.3, con=1.2, crop=None, gamma=1.0, med=0)
ITEM = dict(sharp=90, sat=1.35, con=1.3, gamma=1.3, med=5, crop=(0.07, 0.02))
TUNE = {}

def load(name):
    im = Image.open(os.path.join(REF, name + '.png')).convert('RGBA')
    bg = Image.new('RGBA', im.size, (0, 0, 0, 255))
    bg.alpha_composite(im)
    return bg.convert('RGB')

def make(key):
    p = dict(DEF)
    if not MAP[key].startswith('ab_'): p.update(ITEM)
    p.update(TUNE.get(key, {}))
    im = load(MAP[key]); w, h = im.size
    if p['crop'] is None:
        # abilities: trim 3% frame; items: trim sides to approach a square (keep 78% width)
        p['crop'] = (0.03, 0.03) if key and MAP[key].startswith('ab_') else (0.11, 0.02)
    cx, cy = p['crop']
    im = im.crop((round(w * cx), round(h * cy), round(w * (1 - cx)), round(h * (1 - cy))))
    # two-step downsample for quality
    im = im.resize((N * 3, N * 3), Image.LANCZOS)
    if p['med']: im = im.filter(ImageFilter.MedianFilter(p['med']))
    im = im.filter(ImageFilter.UnsharpMask(radius=2.2, percent=p['sharp'], threshold=0))
    im = im.resize((N, N), Image.BOX)
    if p['gamma'] != 1.0: im = im.point([round(255 * (i / 255) ** p['gamma']) for i in range(256)] * 3)
    im = ImageEnhance.Color(im).enhance(p['sat'])
    im = ImageEnhance.Contrast(im).enhance(p['con'])
    return im

def main():
    prev = None
    if '--preview' in sys.argv: prev = sys.argv[sys.argv.index('--preview') + 1]
    keys = list(MAP)
    ims = {k: make(k) for k in keys}
    # shared palette from a mosaic
    mosaic = Image.new('RGB', (N * len(keys), N))
    for i, k in enumerate(keys): mosaic.paste(ims[k], (i * N, 0))
    q = mosaic.quantize(colors=NCOL - 1, method=Image.MEDIANCUT, dither=Image.NONE)
    pal = q.getpalette()[:3 * (NCOL - 1)]
    cols = [tuple(pal[i:i + 3]) for i in range(0, len(pal), 3)]
    used = sorted(set(q.get_flattened_data()))
    cols = [cols[i] for i in used]
    cols.append(OUTLINE)
    # sort by luminance for a tidy palette
    cols = sorted(set(cols), key=lambda c: (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]))
    chars = [c for c in '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+,-/:;<=>?@[]^_{}~']
    assert len(cols) <= len(chars), len(cols)
    cmap = {c: chars[i] for i, c in enumerate(cols)}
    def nearest(c):
        return min(cols, key=lambda d: (c[0]-d[0])**2 + (c[1]-d[1])**2 + (c[2]-d[2])**2)
    rows_out = {}
    prevs = {}
    for k in keys:
        im = ims[k]
        px = im.load()
        grid = [[nearest(px[x, y]) for x in range(N)] for y in range(N)]
        # 1px dark outline frame, rounded corners
        for i in range(N):
            for (x, y) in ((i, 0), (i, N - 1), (0, i), (N - 1, i)): grid[y][x] = OUTLINE
        rows_out[k] = [''.join('.' if (x, y) in ((0, 0), (N-1, 0), (0, N-1), (N-1, N-1)) else cmap[grid[y][x]] for x in range(N)) for y in range(N)]
        pv = Image.new('RGBA', (N, N), (0, 0, 0, 0)); pp = pv.load()
        for y in range(N):
            for x in range(N):
                ch = rows_out[k][y][x]
                if ch != '.': pp[x, y] = cols[chars.index(ch)] + (255,)
        prevs[k] = pv
    # emit
    L = []
    L.append('// 20x20 HUD icons (orbs, invoked spells, items). Generated by tools/icons_from_ref.py from reference/dota/ official icons; do not hand-edit.')
    L.append("(function(G){ 'use strict'; const IT = G.IT;")
    L.append("IT.Art.sheet('icons', { pal:{")
    for c in cols:
        ch = chars[cols.index(c)]
        L.append("  '%s':'#%02x%02x%02x'," % (ch, *c))
    L[-1] = L[-1].rstrip(',')
    L.append('}, frames:{')
    for i, k in enumerate(keys):
        L.append('  %s:[' % k)
        for j, r in enumerate(rows_out[k]):
            L.append("    '%s'%s" % (r, ',' if j < N - 1 else ''))
        L.append('  ]' + (',' if i < len(keys) - 1 else ''))
    L.append('}});')
    L.append("})(typeof window!=='undefined'?window:globalThis);")
    with open(OUT, 'w', newline='') as f: f.write('\r\n'.join(L) + '\r\n')
    print('wrote', OUT, len(cols), 'colours')
    if prev:
        os.makedirs(prev, exist_ok=True)
        S = 8; cols_n = 6; rn = (len(keys) + cols_n - 1) // cols_n
        cell = 128 + 8
        sheet = Image.new('RGB', (cols_n * (2 * 128 + 12), rn * cell), (40, 40, 48))
        for i, k in enumerate(keys):
            x = (i % cols_n) * (2 * 128 + 12); y = (i // cols_n) * cell
            r = load(MAP[k]).resize((128, 128 if MAP[k].startswith('ab_') else 93), Image.LANCZOS)
            sheet.paste(r, (x, y))
            big = prevs[k].resize((N * 6, N * 6), Image.NEAREST)
            sheet.paste(big, (x + 134, y), big)
        sheet.save(os.path.join(prev, 'contact.png'))
        # also 1x scale mini row
main()
