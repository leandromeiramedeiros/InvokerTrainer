'use strict';
// Entities + spell effects. Global: World
const World = (() => {
  const { W, H, M, T } = Sand;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = Math.random;
  const ORB_T = { Q: T.CYAN, W: T.PURPLE, E: T.ORANGE };
  const ORB_C = { Q: '#3ae0ff', W: '#c46bff', E: '#ff8a2a' };
  const MOVABLE = new Set([M.SAND, M.WATER, M.SMOKE, M.STEAM, M.FIRE, M.SPARK, M.LAVA]);
  const w = {
    inv: { x: 160, y: 120, hp: 150, maxHp: 150, invis: 0, haste: 0, face: 1, atk: 0, hurt: 0 },
    creeps: [], allies: [], proj: [], fx: [], aim: { x: 200, y: 100 }, arena: false, t: 0, onKill: null, kills: 0,
  };
  const inv = w.inv;

  w.reset = arena => {
    Sand.genTerrain(arena ? 'arena' : 'free');
    Object.assign(inv, { x: 160, hp: 150, maxHp: 150, invis: 0, haste: 0, face: 1, atk: 0, hurt: 0 });
    w.creeps = []; w.allies = []; w.proj = []; w.fx = []; w.arena = arena; w.t = 0; w.kills = 0;
    inv.y = Sand.surface(inv.x, 0);
  };

  const alive = a => a.filter(e => !e.dead);
  function nearest(x, y, r) {
    let best = null, bd = r * r;
    for (const c of w.creeps) { if (c.dead) continue; const d = (c.x - x) ** 2 + (c.y - 6 - y) ** 2; if (d < bd) { bd = d; best = c; } }
    return best;
  }
  function dmg(c, n, quiet) {
    if (c.dead) return;
    c.hp -= n;
    if (!quiet) Sand.burst(c.x, c.y - 6, 2, M.SPARK, T.PINK, 4);
    if (c.hp <= 0) {
      c.dead = true; w.kills++;
      for (let k = 0; k < 28; k++) Sand.add(c.x + (rnd() - .5) * 8, c.y - 10 + (rnd() - .5) * 10, M.SAND, Sand.rnd(10));
      Sand.burst(c.x, c.y - 6, 6, M.SPARK, T.WHITE, 5);
      SFX.play('kill'); w.onKill && w.onKill(c);
    }
  }
  function hurtInv(n) { inv.hp -= n; inv.hurt = .25; SFX.play('hurt'); Sand.burst(inv.x, inv.y - 10, 4, M.SPARK, T.PINK, 5); }
  function freeze(cx, cy, r) {
    Sand.each(cx | 0, cy | 0, r, (x, y, i) => {
      const m = Sand.cells[i];
      if (m === M.WATER) Sand.set(x, y, M.ICE, 0, 120); else if (m === M.LAVA) Sand.set(x, y, M.STONE); else if (m === M.FIRE) Sand.cells[i] = 0;
    });
  }

  // ---- creeps / allies ----
  w.spawnCreep = (side, hp, speed, brute) => {
    const x = side < 0 ? -4 : W + 4;
    w.creeps.push({ x, y: Sand.surface(clamp(x, 0, W - 1), 0), hp, max: hp, speed, dir: -side, stun: 0, slow: 0, disarm: 0, lift: 0, z: 0, kv: 0, atk: 0.5, dig: 0, dmg: brute ? 10 : 5, brute, dead: false });
  };
  function groundSnap(c, dt) {
    const gy = Sand.surface(clamp(c.x, 0, W - 1), c.y - 12);
    c.y = gy > c.y ? Math.min(gy, c.y + 130 * dt) : Math.max(gy, c.y - 70 * dt);
  }
  function updCreep(c, dt) {
    if (c.stun > 0) c.stun -= dt;
    if (c.slow > 0) c.slow -= dt;
    if (c.disarm > 0) c.disarm -= dt;
    const hot = Sand.count(c.x - 3, c.y - 9, c.x + 3, c.y, M.FIRE, M.LAVA);
    if (hot) dmg(c, Math.min(hot, 8) * 5 * dt, true);
    if (c.lift > 0) { c.lift -= dt; c.z = Math.min(30, c.z + 100 * dt); } else if (c.z > 0) c.z = Math.max(0, c.z - 90 * dt);
    if (c.kv) { c.x += c.kv * dt; c.kv *= Math.pow(.01, dt); if (Math.abs(c.kv) < 3) c.kv = 0; }
    const dx = inv.x - c.x, dir = Math.sign(dx) || 1; c.dir = dir;
    if (c.stun <= 0 && c.z === 0) {
      if (Math.abs(dx) > 7) {
        const gy = Sand.surface(clamp(c.x + dir * 3, 0, W - 1), c.y - 12);
        if (c.y - gy > 7) {
          c.dig -= dt;
          if (c.dig <= 0) { c.dig = .25; Sand.each(c.x + dir * 4, c.y - 4, 3, (x, y, i) => { if (Sand.cells[i] === M.SAND || Sand.cells[i] === M.ICE) Sand.cells[i] = 0; }); }
        } else c.x += dir * c.speed * (c.slow > 0 ? .5 : 1) * dt;
      } else if (c.disarm <= 0 && inv.invis <= 0) {
        c.atk -= dt; if (c.atk <= 0) { c.atk = 1; hurtInv(c.dmg); }
      }
    }
    groundSnap(c, dt);
    if (c.x < -20 || c.x > W + 20) c.dead = true;
  }
  function updAlly(a, dt) {
    a.life -= dt; if (a.life <= 0) { a.dead = true; Sand.burst(a.x, a.y - 5, 6, M.SMOKE, 0, 4); return; }
    const t = nearest(a.x, a.y, 260), tx = t ? t.x : inv.x + a.off;
    const dx = tx - a.x; a.dir = Math.sign(dx) || 1;
    if (Math.abs(dx) > (t ? 6 : 3)) a.x += a.dir * 48 * dt;
    else if (t) { a.atk -= dt; if (a.atk <= 0) { a.atk = .6; dmg(t, 8); } }
    if (rnd() < .5) Sand.add(a.x + (rnd() - .5) * 4, a.y - 10, M.FIRE, 0, 8 + Sand.rnd(8));
    groundSnap(a, dt);
  }
  w.nearest = nearest;

  // ---- spells ----
  const tgt = () => ({ x: clamp(w.aim.x | 0, 4, W - 5), y: w.aim.y });
  const spells = {
    coldsnap() {
      const t = nearest(w.aim.x, w.aim.y, 100) || nearest(inv.x, inv.y, 240), p = tgt();
      const x = t ? t.x : p.x, y = t ? t.y - 6 : Sand.surface(p.x, 0) - 4;
      freeze(x, y, 14); Sand.burst(x, y, 24, M.SPARK, T.ICE, 12);
      w.fx.push({ life: 2.4, tick: 0, upd(dt) {
        this.life -= dt; this.tick -= dt;
        if (t && !t.dead) { if (this.tick <= 0) { this.tick = .4; dmg(t, 9); t.stun = Math.max(t.stun, .45); freeze(t.x, t.y - 6, 10); } Sand.burst(t.x, t.y - 6, 1, M.SPARK, T.ICE, 7); }
        return this.life <= 0;
      }, draw(c, g) { if (t && !t.dead) { g.fillStyle = '#8fe9ff'; g.globalAlpha = .6; g.fillRect(t.x - 5, t.y - 12, 10, 12); g.globalAlpha = 1; } } });
    },
    ghostwalk() { inv.invis = 4; Sand.burst(inv.x, inv.y - 10, 30, M.SPARK, T.ICE, 8); },
    icewall() {
      const p = tgt(), cols = [];
      for (let dx = -4; dx <= 4; dx++) cols.push(Sand.surface(clamp(p.x + dx, 0, W - 1), 0));
      for (const c of w.creeps) if (!c.dead && Math.abs(c.x - p.x) < 14) { dmg(c, 15); c.slow = 3; }
      let h = 0, done = false;
      w.fx.push({ life: 1, upd(dt) {
        if (done) return true;
        const nh = Math.min(32, h + 120 * dt);
        for (let i = 0; i < 9; i++) for (let hh = h | 0; hh < nh; hh++) {
          const x = p.x - 4 + i, y = cols[i] - 1 - hh;
          if (Sand.inb(x, y) && !Sand.solid(x, y)) Sand.set(x, y, M.ICE, 0, 85);
        }
        Sand.burst(p.x, cols[4] - nh, 2, M.SPARK, T.ICE, 6);
        h = nh; if (h >= 32) done = true; return false;
      } });
    },
    emp() {
      const p = tgt(), cy = clamp(w.aim.y, 12, Sand.surface(p.x, 0));
      w.fx.push({ life: .8, upd(dt) {
        this.life -= dt;
        if (this.life > 0) return false;
        for (const c of w.creeps) if (!c.dead && (c.x - p.x) ** 2 + (c.y - 6 - cy) ** 2 < 34 * 34) { dmg(c, 45); if (Inv.useMana) Inv.mana = Math.min(Inv.maxMana, Inv.mana + 25); }
        Sand.each(p.x, cy, 34, (x, y, i) => { if (Sand.cells[i] === M.SAND && rnd() < .12) Sand.set(x, y, M.SPARK, T.PURPLE); });
        for (let a = 0; a < 6.28; a += .06) { Sand.add(p.x + Math.cos(a) * 34, cy + Math.sin(a) * 34, M.SPARK, T.PURPLE, 40); Sand.add(p.x + Math.cos(a) * 30, cy + Math.sin(a) * 30, M.SPARK, T.WHITE, 24); }
        return true;
      }, draw(c, g) { const r = 34 * (1 - this.life / .8); g.strokeStyle = '#c46bff'; g.lineWidth = 1; g.beginPath(); g.arc(p.x, cy, 34, 0, 6.3); g.stroke(); g.globalAlpha = .5; g.beginPath(); g.arc(p.x, cy, r, 0, 6.3); g.stroke(); g.globalAlpha = 1; } });
    },
    tornado() {
      const dir = Math.sign(w.aim.x - inv.x) || inv.face, hit = new Set();
      w.fx.push({ x: inv.x + dir * 10, life: 3.2, t: 0, upd(dt) {
        this.life -= dt; this.t += dt; this.x += dir * 75 * dt;
        if (this.life <= 0 || this.x < 3 || this.x > W - 4) return true;
        const x = this.x, gy = Sand.surface(x, 0);
        for (let k = 0; k < 5; k++) { const h = rnd() * 38, a = this.t * 9 + k * 1.3 + h * .2, r = 2 + h * .22; Sand.add(x + Math.cos(a) * r, gy - 2 - h, M.SPARK, k & 1 ? T.PURPLE : T.CYAN, 14); }
        for (let k = 0; k < 40; k++) {
          const sx = (x + Sand.rnd(25) - 12) | 0, sy = gy - Sand.rnd(34) + 1;
          if (!Sand.inb(sx, sy)) continue;
          const i = sy * W + sx, m = Sand.cells[i];
          if (m === M.SAND || m === M.WATER || m === M.SMOKE || m === M.STEAM) {
            const dx = Math.sign(x - sx), j = (sy - 2) * W + sx + dx;
            if (sy >= 2 && Sand.cells[j] === 0) { Sand.cells[j] = m; Sand.tint[j] = Sand.tint[i]; Sand.aux[j] = Sand.aux[i]; Sand.cells[i] = 0; }
          }
        }
        for (const c of w.creeps) if (!c.dead && !hit.has(c) && Math.abs(c.x - x) < 10) { hit.add(c); dmg(c, 18); c.lift = 1.6; c.stun = 1.6; }
        return false;
      } });
    },
    alacrity() { inv.haste = 6; Sand.burst(inv.x, inv.y - 10, 30, M.SPARK, T.ORANGE, 8); },
    sunstrike() {
      const p = tgt(), gy = Sand.surface(p.x, 0);
      w.fx.push({ t: 0, struck: false, upd(dt) {
        this.t += dt;
        if (!this.struck && this.t >= 1.7) {
          this.struck = true;
          for (const c of w.creeps) if (!c.dead && Math.abs(c.x - p.x) < 9) dmg(c, 100);
          Sand.each(p.x, gy + 2, 8, (x, y, i) => { if (Sand.cells[i] === M.SAND && rnd() < .8) Sand.set(x, y, M.LAVA); });
          for (let k = 0; k < 140; k++) Sand.add(p.x + (rnd() - .5) * 12, rnd() * gy, M.SPARK, k & 1 ? T.ORANGE : T.GOLD, 20 + Sand.rnd(30));
          for (let k = 0; k < 40; k++) Sand.add(p.x + (rnd() - .5) * 14, gy - rnd() * 10, M.FIRE);
        }
        return this.t >= 2.15;
      }, draw(c, g) {
        if (!this.struck) {
          const a = this.t / 1.7; g.fillStyle = '#ff8a2a'; g.globalAlpha = .4 + .5 * a;
          for (let y = 0; y < gy; y += 4) g.fillRect(p.x - 1 - (a * 3 | 0), y, 2 + (a * 6 | 0), 2);
          g.fillRect(p.x - 8 * a, gy - 1, 16 * a, 2); g.globalAlpha = 1;
        } else {
          const f = 1 - (this.t - 1.7) / .45, wd = 4 + 6 * f;
          for (const ctx of [c, g]) { ctx.fillStyle = '#ffb347'; ctx.fillRect(p.x - wd, 0, wd * 2, gy); ctx.fillStyle = '#fff6c8'; ctx.fillRect(p.x - wd / 2, 0, wd, gy); }
        }
      } });
    },
    forgespirit() {
      for (const off of [-12, 12]) w.allies.push({ x: inv.x + off, y: inv.y, off, life: 14, dir: 1, atk: 0, dead: false });
      Sand.burst(inv.x, inv.y - 8, 20, M.FIRE, 0, 14);
    },
    chaosmeteor() {
      const dir = Math.sign(w.aim.x - inv.x) || inv.face, x0 = clamp(inv.x + dir * 36, 4, W - 5);
      w.fx.push({ x: x0 - dir * 25, y: -14, t: 0, landed: false, upd(dt) {
        this.t += dt;
        if (!this.landed) {
          const gy = Sand.surface(x0, 0) - 5; this.x += (x0 - this.x) * Math.min(1, dt * 6); this.y += ((gy + 14) / .5) * dt;
          Sand.burst(this.x, this.y, 3, M.FIRE, 0, 3);
          if (this.y >= gy) { this.landed = true; this.y = gy; this.x = x0; this.t = 0; Sand.burst(this.x, this.y, 40, M.FIRE, 0, 8); Sand.burst(this.x, this.y, 20, M.SPARK, T.ORANGE, 8); }
          return false;
        }
        this.x += dir * 85 * dt; this.y = Sand.surface(clamp(this.x, 0, W - 1), this.y - 14) - 5;
        if (this.t > 2.4 || this.x < 2 || this.x > W - 3) return true;
        for (let k = 0; k < 7; k++) Sand.add(this.x + (rnd() - .5) * 7, this.y + (rnd() - .5) * 7, M.FIRE);
        if (rnd() < .5) Sand.add(this.x - dir * (2 + rnd() * 5), this.y + 3, M.LAVA, 0, 30 + Sand.rnd(30));
        for (const c of w.creeps) if (!c.dead && Math.abs(c.x - this.x) < 10) dmg(c, 45 * dt, true);
        return false;
      }, draw(c, g) { const s = getSprite('chaosmeteor'); c.drawImage(s, (this.x - 8) | 0, (this.y - 8) | 0); g.fillStyle = '#ff9a3a'; g.beginPath(); g.arc(this.x, this.y, 8, 0, 6.3); g.fill(); } });
    },
    deafeningblast() {
      const dir = Math.sign(w.aim.x - inv.x) || inv.face, hit = new Set();
      w.fx.push({ f: inv.x + dir * 8, dist: 0, upd(dt) {
        const step = 190 * dt; this.f += dir * step; this.dist += step;
        if (this.dist > 170 || this.f < 2 || this.f > W - 3) return true;
        const fx = this.f | 0, gy = Sand.surface(clamp(fx, 0, W - 1), 0);
        for (let k = 0; k < 4; k++) {
          const x = fx - dir * k;
          for (let y = Math.max(0, gy - 44); y <= gy + 1; y++) {
            if (!Sand.inb(x, y)) continue;
            const i = y * W + x, m = Sand.cells[i];
            if (!MOVABLE.has(m)) continue;
            let d = 0; while (d < 4 && Sand.get(x + dir * (d + 1), y) === 0) d++;
            if (d) { const j = i + dir * d; Sand.cells[j] = m; Sand.tint[j] = Sand.tint[i]; Sand.aux[j] = Sand.aux[i]; Sand.cells[i] = 0; }
          }
        }
        for (let y = gy - 44; y < gy; y += 3) Sand.add(fx, y + Sand.rnd(3), M.SPARK, [T.CYAN, T.PURPLE, T.ORANGE][Sand.rnd(3)], 12);
        for (const c of w.creeps) if (!c.dead && !hit.has(c) && Math.abs(c.x - this.f) < 8) { hit.add(c); dmg(c, 35); c.kv = dir * 170; c.disarm = 3; c.stun = .4; }
        return false;
      } });
    },
  };
  w.cast = id => { inv.face = Math.sign(w.aim.x - inv.x) || inv.face; spells[id](); };

  // ---- loop ----
  w.update = dt => {
    w.t += dt;
    inv.y = Sand.surface(inv.x, 0);
    inv.face = Math.sign(w.aim.x - inv.x) || inv.face;
    inv.invis = Math.max(0, inv.invis - dt); inv.haste = Math.max(0, inv.haste - dt); inv.hurt = Math.max(0, inv.hurt - dt);
    if (inv.invis > 0) {
      Sand.add(inv.x + (rnd() - .5) * 10, inv.y - 4 - rnd() * 18, M.SPARK, T.ICE, 14);
      for (const c of w.creeps) if (!c.dead && Math.abs(c.x - inv.x) < 70) c.slow = Math.max(c.slow, .2);
    }
    if (inv.haste > 0 && rnd() < .6) Sand.add(inv.x + (rnd() - .5) * 8, inv.y - 4 - rnd() * 20, M.SPARK, T.ORANGE, 12);
    for (const c of w.creeps) if (!c.dead) updCreep(c, dt);
    for (const a of w.allies) if (!a.dead) updAlly(a, dt);
    if (w.arena) { // auto-attack
      inv.atk -= dt;
      const t = inv.atk <= 0 && nearest(inv.x, inv.y - 8, 130);
      if (t) { inv.atk = inv.haste > 0 ? .3 : 1; const o = Inv.orbs[Inv.orbs.length - 1] || 'Q'; w.proj.push({ x: inv.x, y: inv.y - 14, t, tint: ORB_T[o], col: ORB_C[o], d: inv.haste > 0 ? 12 : 7 }); }
    }
    for (const p of w.proj) {
      if (p.t.dead) { p.done = true; continue; }
      const tx = p.t.x, ty = p.t.y - 6, dx = tx - p.x, dy = ty - p.y, L = Math.hypot(dx, dy);
      if (L < 4) { dmg(p.t, p.d); p.done = true; } else { p.x += dx / L * 230 * dt; p.y += dy / L * 230 * dt; }
    }
    for (const f of w.fx) f.done = f.upd(dt);
    w.creeps = w.creeps.filter(c => !c.dead); w.allies = w.allies.filter(a => !a.dead);
    w.proj = w.proj.filter(p => !p.done); w.fx = w.fx.filter(f => !f.done);
  };

  const spr = (c, name, x, y, dir) => {
    const s = getSprite(name);
    c.save(); c.translate(Math.round(x), Math.round(y));
    if (dir < 0) c.scale(-1, 1);
    c.drawImage(s, -(s.width >> 1), -s.height); c.restore();
  };
  w.draw = (c, g) => {
    for (const f of w.fx) f.draw && f.draw(c, g);
    for (const a of w.allies) { spr(c, 'spirit', a.x, a.y + 1, a.dir); g.fillStyle = '#ff8a2a'; g.fillRect(a.x - 3, a.y - 10, 6, 8); }
    for (const e of w.creeps) {
      const y = e.y + 1 - e.z;
      c.save(); if (e.brute) { c.translate(Math.round(e.x), Math.round(y)); c.scale(1.5 * e.dir, 1.5); const s = getSprite('creep'); c.drawImage(s, -(s.width >> 1), -s.height); } else spr(c, 'creep', e.x, y, e.dir);
      c.restore();
      const bw = e.brute ? 14 : 10, top = y - (e.brute ? 21 : 15);
      c.fillStyle = '#2a1030'; c.fillRect(Math.round(e.x - bw / 2), top, bw, 2);
      c.fillStyle = e.stun > 0 ? '#8fe9ff' : '#ff4a6a'; c.fillRect(Math.round(e.x - bw / 2), top, Math.max(0, Math.round(bw * e.hp / e.max)), 2);
    }
    for (const p of w.proj) { c.fillStyle = p.col; c.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3); g.fillStyle = p.col; g.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, 5, 5); }
    // invoker
    c.globalAlpha = inv.invis > 0 ? .35 : 1;
    spr(c, 'invoker', inv.x, inv.y + 1, inv.face);
    c.globalAlpha = 1;
    if (inv.hurt > 0) { c.fillStyle = 'rgba(255,60,90,.5)'; c.fillRect(inv.x - 5, inv.y - 20, 10, 20); }
    const n = Inv.orbs.length;
    for (let k = 0; k < n; k++) {
      const a = w.t * 2.6 + k * 2.094, ox = inv.x + Math.cos(a) * 9, oy = inv.y - 24 + Math.sin(a) * 3, col = ORB_C[Inv.orbs[k]];
      c.fillStyle = col; c.fillRect(Math.round(ox) - 1, Math.round(oy) - 1, 3, 3);
      g.fillStyle = col; g.fillRect(Math.round(ox) - 2, Math.round(oy) - 2, 5, 5);
    }
  };
  w.invCenter = () => ({ x: inv.x, y: inv.y - 12 });
  return w;
})();
