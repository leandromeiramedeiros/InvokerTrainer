#!/usr/bin/env python3
"""Contact sheet: OLD hand-drawn set (2028da4^), CURRENT reference set (2028da4), NEW (working tree js/art/icons.js).
Each icon shown 4x with its 1x copy beside it. Usage: python tools/icons_sheet.py OUT.png"""
import sys, re, subprocess, os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def git_show(rev):
    return subprocess.check_output(['git', 'show', rev + ':js/art/icons.js'], cwd=ROOT).decode('utf-8')

def parse(src):
    """-> {key: RGBA image} from the first IT.Art.sheet('icons', {pal:{..}, frames:{..}}) block."""
    pal = dict(re.findall(r"^\s*'(.)':'(#[0-9a-fA-F]{6})'", src, re.M))
    pm = re.search(r"\}, frames:\{(.*?)\n\}\}\);", src, re.S)
    frames = {}
    for m in re.finditer(r"^\s*(\w+):\[\s*((?:'[^']*',?\s*)+)\]", pm.group(1), re.M):
        rows = re.findall(r"'([^']*)'", m.group(2))
        frames[m.group(1)] = rows
    out = {}
    for k, rows in frames.items():
        im = Image.new('RGBA', (len(rows[0]), len(rows)), (0, 0, 0, 0)); px = im.load()
        for y, r in enumerate(rows):
            for x, ch in enumerate(r):
                if ch != '.' and ch in pal:
                    h = pal[ch]; px[x, y] = (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16), 255)
        out[k] = im
    return out

BANDS = [
    'quas wex exort invoke coldsnap ghostwalk icewall emp tornado alacrity sunstrike forgespirit chaosmeteor deafeningblast'.split(),
    'refresher atos vyse shiva meteorhammer bkb blink scepter shard orchid gleipnir travels boots'.split(),
    'forcestaff dust euls shadowblade'.split(),
]

def big_sheet(out, keys):
    cur, new = parse(git_show('2028da4')), parse(open(os.path.join(ROOT, 'js', 'art', 'icons.js'), encoding='utf-8').read())
    Z = 8
    sheet = Image.new('RGB', (len(keys) * (20 * Z + 6) + 6, 2 * (20 * Z + 6)), (52, 54, 66))
    for i, k in enumerate(keys):
        for r, S in enumerate((cur, new)):
            im = S[k].resize((20 * Z, 20 * Z), Image.NEAREST); sheet.paste(im, (6 + i * (20 * Z + 6), 3 + r * (20 * Z + 6)), im)
    sheet.save(out); print('wrote', out)

def main():
    if sys.argv[1] == '--big': return big_sheet(sys.argv[2], sys.argv[3:])
    out = sys.argv[1]
    sets = [('OLD', parse(git_show('2028da4^'))), ('CUR', parse(git_show('2028da4'))),
            ('NEW', parse(open(os.path.join(ROOT, 'js', 'art', 'icons.js'), encoding='utf-8').read()))]
    cw, ch = 4 * 20 + 28, 4 * 20 + 6
    W = 40 + max(len(b) for b in BANDS) * cw
    H = sum(len(sets) * ch + 18 for _ in BANDS)
    sheet = Image.new('RGB', (W, H), (52, 54, 66)); d = ImageDraw.Draw(sheet)
    y0 = 0
    for band in BANDS:
        for i, k in enumerate(band): d.text((40 + i * cw, y0 + 3), k[:11], fill=(220, 220, 230))
        y0 += 16
        for name, S in sets:
            d.text((4, y0 + 36), name, fill=(255, 220, 120))
            for i, k in enumerate(band):
                if k not in S: continue
                im = S[k]
                big = im.resize((80, 80), Image.NEAREST)
                x = 40 + i * cw
                sheet.paste(big, (x, y0), big)
                sheet.paste(im, (x + 83, y0), im)
            y0 += ch
        y0 += 2
    sheet.save(out); print('wrote', out, sheet.size)
main()
