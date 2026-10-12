# Extract the real Dota 2 map (gridnav, trees, terrain height, water, buildings) from the local game install
# into js/data/dotaworld.js (IT.DOTAWORLD). Needs Source2Viewer-CLI (ValveResourceFormat) and numpy.
#
#   python tools/dota_extract.py --s2v path/to/Source2Viewer-CLI.exe [--dota "C:/.../dota 2 beta"] [--work tmpdir] [--preview out.png]
#
# Sources inside game/dota/maps/dota.vpk:
#   maps/dota.gnv                              gridnav: 64u cells, 1 byte each (bit0 walkable; 16 = cliff wall, 20 = outside)
#   maps/dota/entities/default_ents.vents_c    entity lump: ent_dota_tree (128x128 blockers), towers, buildings, shops...
#   maps/dota/world_physics.vmdl_c             collision mesh -> ground height + water surface
# Output grid: 48u tiles (game TILE) over the playable box, row 0 = north (Dota +y), one RLE'd char per tile:
#   code = type + 8*elev + 32*ramp, char = chr(65 + code); type uses IT.Map codes ('.T#~,rS' -> 0..6).
import argparse, json, os, re, struct, subprocess, sys
import numpy as np

TILE, X0, X1, Y0, Y1 = 48, -8832, 8832, -8832, 8832     # playable box (gridnav walkable bbox), multiple of 48 and 64
TREE_HALF = 64                                           # trees block a 128x128 square centred on their origin

LANES = {   # lane roads through the real tower line (world coords), dirt within ROAD_HW
    'top': [(-5920, -5352), (-6592, -3408), (-6501, -872), (-6336, 1856), (-6200, 5600), (-5600, 6040), (-5275, 6036), (-128, 6016), (3552, 5776), (5528, 5000)],
    'mid': [(-5920, -5352), (-4640, -4144), (-3190, -2926), (-1544, -1408), (524, 652), (2496, 2112), (4272, 3759), (5528, 5000)],
    'bot': [(-5920, -5352), (-3952, -6112), (-360, -6256), (4860, -6379), (5900, -6200), (6280, -5600), (6269, -2240), (6400, 384), (6336, 3032), (5528, 5000)],
}
ROAD_HW = 190


def vpk_read(fn, want):
    f = open(fn, 'rb'); sig, ver, tree = struct.unpack('<III', f.read(12))
    hdr = 28 if ver == 2 else 12
    if ver == 2: f.read(16)
    def s():
        b = b''
        while (c := f.read(1)) != b'\0': b += c
        return b.decode()
    while (ext := s()):
        while (path := s()):
            while (name := s()):
                crc, pre, arc, off, ln, term = struct.unpack('<IHHIIH', f.read(18)); p = f.read(pre)
                if f'{path}/{name}.{ext}' == want:
                    assert arc == 0x7fff, 'entry not embedded in the map vpk'
                    f.seek(hdr + tree + off); return p + f.read(ln)
    raise KeyError(want)


def s2v(cli, vpk, entry, out, *extra):
    subprocess.run([cli, '-i', vpk, '-f', entry, '-o', out, '-d', *extra], check=True, stdout=subprocess.DEVNULL)


def entities(path):
    txt = open(path, encoding='utf-8', errors='replace').read()
    out = {}
    for b in re.split(r'^====\d+====$', txt, flags=re.M):
        m = re.search(r'^classname\s+"([^"]+)"', b, re.M)
        o = re.search(r'^origin\s+\[\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)', b, re.M)
        if not m or not o: continue
        e = {'x': round(float(o.group(1))), 'y': round(float(o.group(2))), 'z': round(float(o.group(3)))}
        for k in ('targetname', 'model', 'scales'):
            mm = re.search(r'^' + k + r'\s+(.+)$', b, re.M)
            if mm: e[k] = mm.group(1).strip().replace('resource_name:', '').strip('"').replace('[PR#]', '')
        out.setdefault(m.group(1), []).append(e)
    return out


def glb_mesh(path, name):
    d = open(path, 'rb').read(); jl = struct.unpack('<I', d[12:16])[0]; j = json.loads(d[20:20 + jl]); base = 20 + jl + 8
    def acc(i):
        a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
        n = {'SCALAR': 1, 'VEC3': 3}[a['type']]; dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}[a['componentType']]
        r = np.frombuffer(d, dtype=dt, count=a['count'] * n, offset=base + bv.get('byteOffset', 0) + a.get('byteOffset', 0))
        return r.reshape(-1, n) if n > 1 else r
    m = next(m for m in j['meshes'] if m['name'] == name)['primitives'][0]
    P = acc(m['attributes']['POSITION']).astype(np.float64); I = acc(m['indices']).reshape(-1, 3)
    return P[I[:, 0]], P[I[:, 1]], P[I[:, 2]]


def raster_top(tris, W, H, floor_only):
    """highest surface z sampled at each tile centre (vertical faces skipped)"""
    A, B, C = tris
    if floor_only:
        n = np.cross(B - A, C - A); k = n[:, 2] / (np.linalg.norm(n, axis=1) + 1e-9) > 0.6; A, B, C = A[k], B[k], C[k]
    top = np.full((H, W), -1e9)
    xs = np.stack([A[:, 0], B[:, 0], C[:, 0]], 1); ys = np.stack([A[:, 1], B[:, 1], C[:, 1]], 1)
    # tile (tx, ty): centre x = X0 + (tx+.5)*TILE, y = Y1 - (ty+.5)*TILE
    tx0 = np.ceil((xs.min(1) - X0) / TILE - .5).astype(int); tx1 = np.floor((xs.max(1) - X0) / TILE - .5).astype(int)
    ty0 = np.ceil((Y1 - ys.max(1)) / TILE - .5).astype(int); ty1 = np.floor((Y1 - ys.min(1)) / TILE - .5).astype(int)
    for t in np.nonzero((tx1 >= tx0) & (ty1 >= ty0))[0]:
        a, b, c = A[t], B[t], C[t]; den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(den) < 1e-9: continue
        for ty in range(max(ty0[t], 0), min(ty1[t], H - 1) + 1):
            py = Y1 - (ty + .5) * TILE
            for tx in range(max(tx0[t], 0), min(tx1[t], W - 1) + 1):
                px = X0 + (tx + .5) * TILE
                l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / den
                l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / den; l3 = 1 - l1 - l2
                if min(l1, l2, l3) < -1e-6: continue
                z = l1 * a[2] + l2 * b[2] + l3 * c[2]
                if z > top[ty, tx]: top[ty, tx] = z
    return top


def seg_dist(px, py, pts):
    best = np.full(px.shape, 1e9)
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        dx, dy = bx - ax, by - ay; l2 = dx * dx + dy * dy or 1
        t = np.clip(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1)
        best = np.minimum(best, np.hypot(px - (ax + dx * t), py - (ay + dy * t)))
    return best


def rle(s):
    out, i = [], 0
    while i < len(s):
        j = i
        while j < len(s) and s[j] == s[i]: j += 1
        n = j - i; out.append(s[i] + (str(n) if n > 1 else ''))
        i = j
    return ''.join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dota', default=r'C:/Program Files (x86)/Steam/steamapps/common/dota 2 beta')
    ap.add_argument('--s2v', required=True)
    ap.add_argument('--work', default=os.path.join(os.path.dirname(__file__), '..', '.cache', 'dota'))
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'js', 'data', 'dotaworld.js'))
    ap.add_argument('--preview')
    a = ap.parse_args()
    vpk = os.path.join(a.dota, 'game', 'dota', 'maps', 'dota.vpk'); os.makedirs(a.work, exist_ok=True)

    gnv = vpk_read(vpk, 'maps/dota.gnv')
    magic, edge, _, _, gw, gh, gx0, gy0 = struct.unpack('<IfffIIii', gnv[:32]); assert edge == 64
    nav = np.frombuffer(gnv, dtype=np.uint8, offset=32).reshape(gh, gw)
    ents_txt = os.path.join(a.work, 'maps', 'dota', 'entities', 'default_ents.vents')
    if not os.path.exists(ents_txt): s2v(a.s2v, vpk, 'maps/dota/entities/default_ents.vents_c', a.work)
    glb = os.path.join(a.work, 'maps', 'dota', 'world_physics_physics.glb')
    if not os.path.exists(glb): s2v(a.s2v, vpk, 'maps/dota/world_physics.vmdl_c', a.work, '--gltf_export_format', 'glb')
    E = entities(ents_txt)

    W, H = (X1 - X0) // TILE, (Y1 - Y0) // TILE
    ground = raster_top(glb_mesh(glb, 'physics_group'), W, H, True)
    water = raster_top(glb_mesh(glb, 'physics_water_slime'), W, H, True)
    cx = X0 + (np.arange(W) + .5) * TILE; cy = Y1 - (np.arange(H) + .5) * TILE
    PX, PY = np.meshgrid(cx, cy)
    v = nav[np.clip((PY // 64).astype(int) - gy0, 0, gh - 1), np.clip((PX // 64).astype(int) - gx0, 0, gw - 1)]
    walk = (v & 1) > 0

    typ = np.where(walk, 0, 2).astype(np.uint8)
    road = np.full((H, W), 1e9)
    for pts in LANES.values(): road = np.minimum(road, seg_dist(PX, PY, pts))
    typ[walk & (road < ROAD_HW)] = 4
    wet = walk & (water > ground + 4)
    typ[wet] = 5
    trees = []
    for t in E.get('ent_dota_tree', []):
        x0 = int(np.ceil((t['x'] - TREE_HALF - X0) / TILE - .5)); x1 = int(np.floor((t['x'] + TREE_HALF - X0) / TILE - .5 - 1e-6))
        y0 = int(np.ceil((Y1 - t['y'] - TREE_HALF) / TILE - .5)); y1 = int(np.floor((Y1 - t['y'] + TREE_HALF) / TILE - .5 - 1e-6))
        typ[max(y0, 0):y1 + 1, max(x0, 0):x1 + 1] = 1
        mdl = os.path.basename(t.get('model', '')).replace('.vmdl', '')
        sc = float((t.get('scales') or '1').strip('[] ').split(',')[0])
        trees.append([t['x'], t['y'], round(sc, 2), mdl])
    z = np.where(ground > -1e8, ground, 0)
    elev = np.clip(np.floor((z + 64) / 128), 0, 2).astype(np.uint8)     # 0 river valley, 1 lanes/jungle, 2 high ground
    off = np.abs(z - np.round(z / 128) * 128)
    ramp = walk & (off > 24)
    for dy, dx in ((0, 1), (1, 0)):   # walkable step between levels with no wall = stairs
        a_ = walk[:H - dy, :W - dx] & walk[dy:, dx:] & (elev[:H - dy, :W - dx] != elev[dy:, dx:])
        ramp[:H - dy, :W - dx] |= a_; ramp[dy:, dx:] |= a_
    code = typ + 8 * elev + 32 * ramp.astype(np.uint8)
    rows = [rle(''.join(chr(65 + c) for c in r)) for r in code]

    keep = {
        'tower': 'npc_dota_tower', 'barracks': 'npc_dota_barracks', 'fort': 'npc_dota_fort', 'filler': 'npc_dota_building',
        'fountain': 'ent_dota_fountain', 'shop': 'ent_dota_shop', 'camp': 'npc_dota_neutral_spawner', 'outpost': 'npc_dota_watch_tower',
        'lotus': 'npc_dota_lotus_pool', 'gate': 'npc_dota_unit_twin_gate', 'lantern': 'npc_dota_lantern', 'roshan': 'trigger_boss_attackable',
    }
    ent = {}
    for k, cls in keep.items():
        ent[k] = [{'x': e['x'], 'y': e['y'], 'z': e['z'], **({'name': e['targetname']} if e.get('targetname') else {})} for e in E.get(cls, [])]
    data = {'tile': TILE, 'x0': X0, 'y1': Y1, 'w': W, 'h': H, 'rows': rows, 'trees': trees, 'ents': ent}
    js = ('// GENERATED by tools/dota_extract.py from the Dota 2 game files -- do not edit by hand.\n'
          '// IT.DOTAWORLD: the real Dota map on 48u tiles. Row 0 = north. World (Dota) -> tile: tx = (x - x0) / tile, ty = (y1 - y) / tile.\n'
          '// rows: RLE (char [count]); code = char - 65 = type + 8*elev + 32*ramp. trees: [x, y, scale, model]. ents: buildings etc in world coords.\n'
          '(function (G) {\n  \'use strict\';\n  const IT = G.IT = G.IT || {};\n  IT.DOTAWORLD = ' + json.dumps(data, separators=(',', ':')) +
          ';\n})(typeof window !== \'undefined\' ? window : globalThis);\n')
    open(a.out, 'w', newline='\r\n').write(js)
    print(f'{W}x{H} tiles, {len(trees)} trees, {len(js) // 1024} KB -> {a.out}')
    if a.preview:
        from PIL import Image
        pal = np.array([[56, 94, 56], [20, 44, 28], [96, 92, 108], [40, 88, 150], [110, 88, 58], [70, 140, 214], [70, 66, 80]], np.float64)
        img = pal[typ] * np.array([0.7, 1, 1.3])[elev][..., None]
        img[ramp] = [190, 170, 120]
        Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(a.preview)


if __name__ == '__main__':
    main()
