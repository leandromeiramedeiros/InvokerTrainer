// App state machine: title -> loadout -> play -> end -> loadout. Owns the world, renderer, camera and the fixed-step loop.
(function (G) {
  'use strict';
  const IT = G.IT;
  const GM = IT.GAME, VW = GM.VIEW_W, VH = GM.VIEW_H;
  const cv = document.getElementById('game'), glowCv = document.getElementById('glow'), aimCv = document.getElementById('aim');
  const stage = document.getElementById('stage'), dbg = document.getElementById('dbg');
  const aimG = aimCv.getContext('2d');
  const UI = IT.UI, S = IT.Settings;

  let map = null, g = null, lastOpts = null, settingsOver = false, state = 'title';

  // ---------------------------------------------------------------- sizing
  function fit() {
    const s = Math.max(1, Math.floor(Math.min(innerWidth / VW, innerHeight / VH)));
    stage.style.width = VW * s + 'px'; stage.style.height = VH * s + 'px'; stage.style.setProperty('--u', s + 'px');
    const gs = Math.max(11, Math.min(26, Math.min(innerWidth / 1280, innerHeight / 720) * 14));
    document.documentElement.style.setProperty('--g', gs.toFixed(2) + 'px');
  }
  addEventListener('resize', fit); fit();

  // ---------------------------------------------------------------- game session
  function spawnDummyAt(i, lo) {
    const sp = map.spawns.dummies[i % map.spawns.dummies.length];
    return IT.Units.spawnDummy(g.w, { x: sp.x, y: sp.y, preset: lo.preset, skin: lo.skin });
  }

  function start(opts) {
    teardown();
    UI.clear(); UI.clearToasts();
    lastOpts = opts;
    if (!map) map = IT.Map.build(IT.MAPDEF);
    const lo = IT.Loadout.normalize(opts.loadout), set = S.get();
    const w = IT.World.create({ seed: (Math.random() * 1e9) | 0, map, loadout: lo, fog: opts.fog !== false, autoAttack: set.autoAttack });
    const sp = map.spawns.hero;
    const hero = IT.Hero.create(w, lo, sp.x, sp.y);
    g = { w, hero, opts, lo, mode: opts.mode, grant: opts.grant, cam: IT.Camera.create(map), ended: false, committed: false, R: null, cv };
    g.cam.centerOn(hero.x, hero.y); g.cam.lock = !!set.camLock;
    const n = opts.mode === 'sandbox' ? Math.max(1, opts.count | 0) : 1;
    for (let i = 0; i < n; i++) spawnDummyAt(i, lo);
    g.nDummies = n;
    if (IT.StatsCollector) IT.StatsCollector.create(w);
    IT.Sfx && IT.Sfx.attach(w);
    g.R = IT.Render.create(w, cv, glowCv, g.cam);
    g.R.showDebug = !!(IT.dev && IT.dev.debug);
    w.on('fail', p => {
      if (p.unit !== hero.id) return;
      const k = 'fail.' + p.reason;
      UI.toast(IT.hasT(k) ? IT.t(k) : p.reason, 'bad');
      if (IT.Input.sfx) IT.Input.sfx('fail');
    });
    w.on('modeEnd', p => finish(p));
    if (IT.Combo) IT.Combo.mode(w, opts.mode, { loadout: lo, grantMissing: !!opts.grant, seconds: GM.TIMED_SECONDS });

    stage.classList.add('on'); state = 'play'; settingsOver = false;
    const ctx = { w, hero, cam: g.cam, R: g.R, cv, mode: opts.mode, grant: opts.grant };
    IT.Input.hooks = hooks;
    IT.Input.bind(ctx);
    IT.HUD.bind(ctx);
    acc = 0; last = performance.now();
    IT.dev = Object.assign(IT.dev || {}, { w, hero, cam: g.cam, R: g.R, paused: false, render: devRender });
  }

  function teardown() {
    if (!g) return;
    IT.Input.unbind(); IT.HUD.unbind();
    if (g.w._stats) g.w._stats.destroy();
    IT.Sfx && IT.Sfx.detach();
    aimG.clearRect(0, 0, VW, VH);
    stage.classList.remove('on');
    UI.clearToasts();
    g = null;
  }

  function commitStats() {
    if (!g || g.committed) return null;
    g.committed = true;
    const st = g.w._stats ? g.w._stats.summary() : null;
    if (st && st.time > 1) IT.UI.Life.add(st);
    return st;
  }

  function finish(modeInfo) {
    if (!g || g.ended) return;
    g.ended = true;
    const st = commitStats() || (IT.StatsCollector ? IT.StatsCollector.blank() : null);
    g.w.paused = true; IT.Input.enabled = false;
    aimG.clearRect(0, 0, VW, VH);
    state = 'end';
    const info = { stats: st, mode: modeInfo };
    UI.clear();
    UI.push(() => IT.UI.endScreen(info), true);
  }

  // ---------------------------------------------------------------- screens
  const App = IT.App = {
    go(name) {
      if (name === 'again') { if (lastOpts) start(lastOpts); else App.go('loadout'); return; }
      commitStats();
      teardown();
      UI.clear(); settingsOver = false;
      state = name;
      if (name === 'title') UI.set(UI.title);
      else if (name === 'loadout') UI.set(IT.UI.LoadoutScreen.build);
      else if (name === 'stats') UI.set(IT.UI.statsScreen);
      else if (name === 'settings') { IT.UI.settingsOpen(); UI.set(IT.UI.settingsPanel); }
    },
    start(opts) { start(opts); },
    resume() { if (g && g.w.paused && !g.ended) { UI.pop(); g.w.paused = false; } },
    restart() { if (lastOpts) { commitStats(); start(lastOpts); } },
    endRun() {
      if (!g) return;
      UI.pop(); g.w.paused = false;
      if (IT.Combo) IT.Combo.stop(g.w); else finish({ mode: g.mode });
      if (g && !g.ended) finish({ mode: g.mode });
    },
    pauseSettings() { settingsOver = true; IT.UI.settingsOpen(); UI.push(IT.UI.settingsPanel, true); },
    settingsBack() { if (settingsOver) { settingsOver = false; UI.pop(); } else App.go('title'); },
    back() { if (state === 'play') { if (hooks.pause) hooks.pause(); return; } if (state !== 'title') App.go('title'); },   // ESC: one level up (S3 refines)
    get state() { return state; },
  };

  const hooks = {
    pause() {
      if (!g || g.ended) return;
      if (settingsOver) { IT.UI.settingsCancel(); return; }
      if (g.w.paused) App.resume();
      else { g.w.paused = true; IT.Input.cancel(true); IT.HUD.statsShow(false); UI.push(UI.pause, true); }
    },
    statsHold(on) { if (g && !g.w.paused) IT.HUD.statsShow(on); else if (!on && g) IT.HUD.statsShow(false); },
    cheat() { IT.HUD.cheatToggle(); },
    debug() { if (g) { g.R.showDebug = !g.R.showDebug; IT.dev.debug = g.R.showDebug; } },
    refresh() {
      if (!g) return;
      if (IT.Combo) IT.Combo.refreshAll(g.w, g.hero);
      else { g.hero.cd = {}; g.hero.inv.invokeCd = 0; g.hero.mana = g.hero.maxMana; }
      UI.toast(IT.t('toast.refreshed'), 'good');
    },
    spawn() {
      if (!g || g.mode !== 'sandbox') return;
      const alive = g.w.query(e => e.kind === 'dummy');
      if (alive.length >= 8) return;
      const spots = map.spawns.dummies;
      for (const s of spots) if (!alive.some(d => Math.hypot(d.x - s.x, d.y - s.y) < 150)) {
        IT.Units.spawnDummy(g.w, { x: s.x, y: s.y, preset: g.lo.preset, skin: g.lo.skin });
        UI.toast(IT.t('toast.spawned'), 'info'); return;
      }
    },
    resetDummies() {
      if (!g || g.mode !== 'sandbox') return;
      const ds = g.w.query(e => e.kind === 'dummy');
      ds.forEach((d, i) => {
        if (i >= g.nDummies) { g.w.remove(d); return; }
        const sp = map.spawns.dummies[i % map.spawns.dummies.length];
        d.x = sp.x; d.y = sp.y; d.hp = d.maxHp; d.mana = d.maxMana; d.orders.length = 0; d.path.length = 0;
        for (const s of d.statuses.slice()) IT.Status.remove(g.w, d, s.type);
      });
      if (IT.HUD.resetMeter) IT.HUD.resetMeter();
      UI.toast(IT.t('toast.dummiesReset'), 'info');
    },
  };

  S.onChange(d => {
    if (!g) return;
    g.w.opts.autoAttack = d.autoAttack;
    g.cam.lock = !!d.camLock;
  });

  // ---------------------------------------------------------------- loop
  let last = performance.now(), acc = 0, dbgT = 0;
  function debugText() {
    const R = g.R, hero = g.hero, inv = hero.inv, S2 = R.stats;
    return `render ${S2.ms.toFixed(2)}ms avg ${S2.avg.toFixed(2)} max ${S2.max.toFixed(1)}  lights ${S2.lights} parts ${S2.parts} items ${S2.items}  lock ${g.cam.lock ? 'on' : 'off'}\n` +
      `orbs ${inv.orbs.join('')}  slots ${inv.slots.map(s => s || '-').join(' | ')}  invokeCd ${inv.invokeCd.toFixed(1)}\n` +
      `hp ${Math.round(hero.hp)}/${Math.round(hero.maxHp)}  mana ${Math.round(hero.mana)}/${Math.round(hero.maxMana)}  t ${g.w.t.toFixed(1)}`;
  }
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (g && !(IT.dev && IT.dev.paused)) {
      const w = g.w;
      if (!w.paused) {
        acc += dt;
        while (acc >= w.dt && !w.paused) { g.R.snapshot(); w.step(); acc -= w.dt; }
        g.cam.update(dt, IT.Input.keys, IT.Input.camMouse(), g.hero);
      }
      g.R.render(w.paused ? 1 : acc / w.dt, dt);
      IT.Input.drawAim(aimG);
      if (g) IT.HUD.update(dt);
      dbgT += dt;
      if (g && dbgT > 0.25) { dbgT = 0; dbg.textContent = g.R.showDebug ? debugText() : ''; g.R.stats.max *= 0.5; }
    }
    requestAnimationFrame(frame);
  }
  // step the sim n ticks then draw once (rAF is throttled in hidden panes)
  function devRender(n) {
    if (!g) return;
    const R = g.R, w = g.w;
    for (let i = 0; i < (n || 0); i++) { R.snapshot(); w.step(); }
    R.fogSnap = (n || 0) > 5; R.render(1, 1 / 60); R.fogSnap = false;
    IT.Input.drawAim(aimG); IT.HUD.update(0);
  }

  UI.initTip();
  S.apply(true);
  IT.dev = { w: null, hero: null, cam: null, R: null, paused: false, render: devRender, debug: false };
  IT.hooks = hooks;
  App.go('title');
  requestAnimationFrame(frame);
})(window);
