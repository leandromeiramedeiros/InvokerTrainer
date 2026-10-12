// Tile A* (8-dir, no corner cutting) + string pulling + wall sliding. Pure.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const SQ2 = Math.SQRT2;

  function ensure(map) {
    if (map._nav) return map._nav;
    const n = map.w * map.h;
    const near = new Uint8Array(n);       // walkable tile touching a blocked tile (path penalty)
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      if (!map.walkableTile(x, y)) continue;
      if (!map.walkableTile(x + 1, y) || !map.walkableTile(x - 1, y) || !map.walkableTile(x, y + 1) || !map.walkableTile(x, y - 1)) near[y * map.w + x] = 1;
    }
    return (map._nav = { near, g: new Float32Array(n), par: new Int32Array(n), stamp: new Uint32Array(n), closed: new Uint32Array(n), gen: 0, hn: [], hk: [] });
  }

  // binary min-heap on parallel arrays (lazy deletion)
  function push(nv, node, key) {
    const hn = nv.hn, hk = nv.hk; let i = hn.length; hn.push(node); hk.push(key);
    while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= key) break; hn[i] = hn[p]; hk[i] = hk[p]; i = p; }
    hn[i] = node; hk[i] = key;
  }
  function pop(nv) {
    const hn = nv.hn, hk = nv.hk, top = hn[0], ln = hn.pop(), lk = hk.pop(), n = hn.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1; if (c >= n) break;
        if (c + 1 < n && hk[c + 1] < hk[c]) c++;
        if (hk[c] >= lk) break;
        hn[i] = hn[c]; hk[i] = hk[c]; i = c;
      }
      hn[i] = ln; hk[i] = lk;
    }
    return top;
  }

  // Arena cap: on huge maps (w*h > GAME.ARENA.LAZY_TILES) path search is confined to the start/goal tile box grown by SEARCH_MARGIN.
  // -> { x0, y0, x1, y1 } inclusive tile bounds (the whole map for normal-size maps).
  function searchBounds(map, sx, sy, gx, gy) {
    const A = IT.GAME && IT.GAME.ARENA;
    if (!A || map.w * map.h <= A.LAZY_TILES) return { x0: 0, y0: 0, x1: map.w - 1, y1: map.h - 1 };
    const m = A.SEARCH_MARGIN;
    return { x0: Math.max(0, Math.min(sx, gx) - m), y0: Math.max(0, Math.min(sy, gy) - m), x1: Math.min(map.w - 1, Math.max(sx, gx) + m), y1: Math.min(map.h - 1, Math.max(sy, gy) + m) };
  }

  function nearestWalkable(map, x, y) {
    if (map.walkable(x, y)) return { x, y };
    const tx = map.toTile(x), ty = map.toTile(y);
    let best = null, bd = Infinity;
    const A = IT.GAME && IT.GAME.ARENA, maxR = A && map.w * map.h > A.LAZY_TILES ? Math.min(A.NEAR_MAX, Math.max(map.w, map.h)) : Math.max(map.w, map.h);
    for (let r = 1; r < maxR; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !map.walkableTile(tx + dx, ty + dy)) continue;
        const c = map.center(tx + dx, ty + dy), d = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y);
        if (d < bd) { bd = d; best = c; }
      }
      if (best && r >= Math.sqrt(bd) / map.tile) break;   // no closer tile can exist in a larger ring
    }
    return best || { x, y };
  }

  // true if the segment (optionally fattened by radius r) only crosses walkable tiles
  function lineWalkable(map, ax, ay, bx, by, r) {
    r = r || 0;
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    const step = map.tile * 0.25, n = Math.max(1, Math.ceil(len / step));
    const px = len ? -dy / len * r : 0, py = len ? dx / len * r : 0;
    for (let i = 0; i <= n; i++) {
      const x = ax + dx * i / n, y = ay + dy * i / n;
      if (!map.walkable(x, y)) return false;
      if (r > 0 && (!map.walkable(x + px, y + py) || !map.walkable(x - px, y - py))) return false;
    }
    return true;
  }

  function findPath(map, x0, y0, x1, y1, radius) {
    const nv = ensure(map), w = map.w, tile = map.tile;
    const s = nearestWalkable(map, x0, y0);
    let goal = { x: x1, y: y1 };
    if (!map.walkable(x1, y1)) goal = nearestWalkable(map, x1, y1);
    const sx = map.toTile(s.x), sy = map.toTile(s.y), gx = map.toTile(goal.x), gy = map.toTile(goal.y);
    if (sx === gx && sy === gy) return [{ x: goal.x, y: goal.y }];
    const bb = searchBounds(map, sx, sy, gx, gy);
    const gen = ++nv.gen, G_ = nv.g, par = nv.par, stamp = nv.stamp, closed = nv.closed, near = nv.near;
    nv.hn.length = 0; nv.hk.length = 0;
    const h = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return (dx + dy) + (SQ2 - 2) * Math.min(dx, dy); };
    const si = sy * w + sx, gi = gy * w + gx;
    G_[si] = 0; par[si] = -1; stamp[si] = gen; push(nv, si, h(sx, sy));
    let found = false, best = si, bestH = h(sx, sy);
    const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
    while (nv.hn.length) {
      const cur = pop(nv);
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      if (cur === gi) { found = true; break; }
      const cx = cur % w, cy = (cur / w) | 0, gc = G_[cur];
      const hc = h(cx, cy); if (hc < bestH) { bestH = hc; best = cur; }
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], ny = cy + DY[k];
        if (nx < bb.x0 || nx > bb.x1 || ny < bb.y0 || ny > bb.y1 || !map.walkableTile(nx, ny)) continue;
        if (k >= 4 && (!map.walkableTile(cx + DX[k], cy) || !map.walkableTile(cx, cy + DY[k]))) continue;
        const ni = ny * w + nx;
        if (closed[ni] === gen) continue;
        const ng = gc + (k >= 4 ? SQ2 : 1) + (near[ni] ? 0.4 : 0);
        if (stamp[ni] !== gen || ng < G_[ni]) { stamp[ni] = gen; G_[ni] = ng; par[ni] = cur; push(nv, ni, ng + h(nx, ny)); }
      }
    }
    const endI = found ? gi : best;
    const pts = [];
    for (let i = endI; i !== -1 && i !== si; i = par[i]) pts.push(map.center(i % w, (i / w) | 0));
    pts.reverse();
    if (found) { if (pts.length) pts[pts.length - 1] = { x: goal.x, y: goal.y }; else pts.push({ x: goal.x, y: goal.y }); }
    if (!pts.length) return [];
    // string pull from the true start
    const out = [], r = Math.min(radius || 0, tile * 0.45);
    let ax = x0, ay = y0, i = 0;
    if (!map.walkable(ax, ay)) { ax = s.x; ay = s.y; }
    while (i < pts.length) {
      let j = i;
      while (j + 1 < pts.length && lineWalkable(map, ax, ay, pts[j + 1].x, pts[j + 1].y, r)) j++;
      out.push(pts[j]); ax = pts[j].x; ay = pts[j].y; i = j + 1;
    }
    return out;
  }

  // circle (r) vs non-walkable tiles
  function circleFree(map, x, y, r) {
    const t = map.tile;
    const x0 = Math.floor((x - r) / t), x1 = Math.floor((x + r) / t), y0 = Math.floor((y - r) / t), y1 = Math.floor((y + r) / t);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (map.walkableTile(tx, ty)) continue;
      const cx = Math.max(tx * t, Math.min(x, tx * t + t)), cy = Math.max(ty * t, Math.min(y, ty * t + t));
      if ((cx - x) * (cx - x) + (cy - y) * (cy - y) < r * r) return false;
    }
    return true;
  }

  // Move e from its position toward (nx,ny), sliding along blocked tiles. Returns the resulting {x,y}.
  function slide(map, e, nx, ny) {
    const r = Math.min(e.radius || 0, map.tile * 0.45) * 0.9;
    let x = e.x, y = e.y;
    if (!circleFree(map, x, y, r)) {            // already inside a wall: let it leave, else snap to nearest open point
      if (circleFree(map, nx, ny, r)) return { x: nx, y: ny };
      return nearestWalkable(map, nx, ny);
    }
    const dist = Math.hypot(nx - x, ny - y), n = Math.max(1, Math.ceil(dist / (map.tile * 0.5)));
    const sx = (nx - x) / n, sy = (ny - y) / n;
    for (let i = 0; i < n; i++) {
      if (circleFree(map, x + sx, y + sy, r)) { x += sx; y += sy; }
      else if (sx && circleFree(map, x + sx, y, r)) x += sx;
      else if (sy && circleFree(map, x, y + sy, r)) y += sy;
      else break;
    }
    return { x, y };
  }

  IT.Nav = { findPath, lineWalkable, nearestWalkable, slide, circleFree, searchBounds };
})(typeof window !== 'undefined' ? window : globalThis);
