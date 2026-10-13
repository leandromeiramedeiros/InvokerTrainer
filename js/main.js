// App state machine: title -> freeplay | scenarios | combo -> play -> end -> back. Owns the world, renderer, camera and the fixed-step loop.
(function (G) {
  'use strict';
  const IT = G.IT;
  const GM = IT.GAME, VW = GM.VIEW_W_BASE, VH = GM.VIEW_H_BASE;   // base 480x270: stage size + HUD units (--u)
  const cv = document.getElementById('game'), glowCv = document.getElementById('glow'), aimCv = document.getElementById('aim');
  const stage = document.getElementById('stage'), dbg = document.getElementById('dbg');
  const aimG = aimCv.getContext('2d');
  const UI = IT.UI, S = IT.Settings;

  let g = null, lastOpts = null, settingsOver = false, state = 'title';
  const music = n => { try { IT.Music && IT.Music.play(n); } catch (e) { /* audio is optional */ } };
  const isScn = o => o.mode === 'ranked' || o.mode === 'infinite' || (o.mode === 'sandbox' && !!o.scenario);

  // ---------------------------------------------------------------- sizing
  function fit() {
    const s = Math.max(0.5, Math.min(innerWidth / VW, innerHeight / VH));   // fractional: fill the window, keep 16:9
    const sw = Math.max(2, Math.floor(VW * s / 2) * 2), sh = Math.max(2, Math.round(sw * VH / VW / 2) * 2);   // even px (no half-pixel blur from the centering transform)
    stage.style.width = sw + 'px'; stage.style.height = sh + 'px'; stage.style.setProperty('--u', (sw / VW).toFixed(4) + 'px');
    if (IT.GL) { const d = Math.max(1, G.devicePixelRatio || 1); IT.GL.setSize(Math.round(sw * d), Math.round(sh * d)); }   // GL compositor output = stage device pixels (capped in gl.js)
    const gs = Math.max(11, Math.min(26, Math.min(innerWidth / 1280, innerHeight / 720) * 14));
    document.documentElement.style.setProperty('--g', gs.toFixed(2) + 'px');
  }
  addEventListener('resize', fit); fit();

  // scroll-wheel zoom: the stage keeps its on-screen size, the internal view resolution changes (zoom 1.2 = 400x225, 0.7 = 686x386)
  function applyView(z) {
    const vw = 2 * Math.round(VW / 2 / z), vh = Math.round(vw * VH / VW);
    GM.VIEW_W = vw; GM.VIEW_H = vh;
    for (const c of [cv, glowCv, aimCv]) if (c.width !== vw || c.height !== vh) { c.width = vw; c.height = vh; }
    cv.getContext('2d').imageSmoothingEnabled = false;
  }
  function zoomStep(dir) {
    const Z = GM.ZOOMS, cur = S.get().zoom || 1;
    let i = Z.indexOf(cur); if (i < 0) i = Z.indexOf(1);
    const z = Z[Math.max(0, Math.min(Z.length - 1, i + dir))];
    if (z === cur) return;
    S.get().zoom = z; S.save();
    if (!g) { applyView(z); return; }
    const P = GM.UNIT_PX, mx = g.cam.x + GM.VIEW_W * P / 2, my = g.cam.y + GM.VIEW_H * P / 2;   // keep the view centre
    applyView(z);
    g.R.resize();
    g.cam.x = mx - GM.VIEW_W * P / 2; g.cam.y = my - GM.VIEW_H * P / 2; g.cam.glide = null; g.cam.clamp();
  }

  // ---------------------------------------------------------------- game session
  // round start (first round, every swap / redo): hard-snap the camera onto the hero's NEW spot; cam.lock is left as is
  function snapCam() { g.cam.setMap(g.w.map); g.cam.snap(g.hero.x, g.hero.y); }

  // v6 item 13: the intro camera tour. Ranked emits 'tourFocus' per stop: a timed glide there (foe / gate / focus stops sit right of
  // centre, clear of the briefing card on the left; the last stop is the hero, exactly centred). 'tourEnd' (F1 skipped it) glides back
  // to the hero; 'scnGo' (round start: the timer, or v6 item 45: a move / cast / attack that cancelled the intro) only releases the tour:
  // the camera stays exactly where it is (a normal end is already on the hero).
  const TOUR_SHIFT = 0.14;   // x view width: a toured spot shows at ~64 % of the screen width
  function tourWire(w) {
    w.on('tourFocus', p => {
      if (!g || g.w !== w || !(p.i > 0)) return;
      const off = p.kind === 'hero' ? 0 : TOUR_SHIFT * GM.VIEW_W * GM.UNIT_PX;
      g.cam.glideTo(p.x - off, p.y, Math.max(0.05, p.glide));
    });
    w.on('tourEnd', () => { if (g && g.w === w) { g.cam.script = false; g.cam.glideTo(g.hero.x, g.hero.y, 0.5); } });
    w.on('scnGo', () => { if (g && g.w === w) g.cam.release(); });
  }
  // per frame while frozen / playing: the tour owns the camera (lock / follow ignored); F1 (center: cam.follow) ends only the tour
  // v6 item 66: the title slam / VICTORY / DEFEAT punches shake the screen (js/ui/briefing.js calls this; the camera itself stays frozen)
  if (IT.Briefing) IT.Briefing.onShake = (a, d) => { if (g && g.R && g.R.shake) g.R.shake(a, d); };
  // v6 item 73: the scenario intro is paced by the player. Space / Enter / a left click on the game ADVANCES one piece of the text phase (not a cancel);
  // Esc SKIPS the rest (text + camera pan; the countdown keeps running; a second Esc pauses as before). A game action (move / cast / attack) still cancels it
  // all (input.js -> hooks.skip). Capture phase, before input.js; orbs / Invoke / menus / typing are never touched.
  const introLive = () => { const r = g && g.run; return !!(r && !g.menu && !g.ended && !settingsOver && r.phase === 'countdown' && r.intro && r.intro.text); };
  const introText = () => introLive() && g.run.intro.t < g.run.intro.text.hold - 1e-9;
  addEventListener('keydown', ev => {
    if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey || !introLive()) return;
    const tg = ev.target, tag = tg && tg.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || (tg && tg.isContentEditable) || (tag === 'INPUT' && !/^(checkbox|radio|range|button|submit)$/.test(tg.type || ''))) return;
    let done = false;
    if (ev.key === 'Escape') done = g.run.skipIntro();
    else if ((ev.key === ' ' || ev.key === 'Enter') && introText() && !(S.keyName && S.actionFor && S.keyName(ev) && S.actionFor(S.keyName(ev)))) done = g.run.advanceIntro();
    if (done) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation(); }
  }, true);
  addEventListener('mousedown', ev => {
    if (ev.button !== 0 || ev.target !== cv || !introText()) return;
    if (g.run.advanceIntro()) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation(); }
  }, true);
  function tourSync() {
    const r = g && g.run; if (!r || !r.touring) { if (g) g.cam.script = false; return; }
    if (r.touring() && g.cam.follow && !g.menu) r.skipTour();
    g.cam.script = r.touring();
  }

  function start(opts) {
    teardown();
    UI.clear(); UI.clearToasts();
    lastOpts = opts;
    const set = S.get(), scn = isScn(opts);
    let run = null, pr = null;
    if (scn) {   // ranked / infinite / scenario sandbox: a run feeds scenarios; the first one builds the world
      const LS = IT.UI.LoadoutScreen, skin = opts.skin || (opts.loadout && opts.loadout.skin) || (LS && LS.state.lo && LS.state.lo.skin) || undefined;
      run = IT.Ranked.create({ mode: opts.mode, diff: opts.diff, scenario: opts.scenario, skin });
      pr = run.next();
    }
    const lo = IT.Loadout.normalize(scn ? pr.lo : opts.loadout);
    const map = IT.Maps.get((scn ? pr.sc.map : opts.map) || 'grounds');
    const w = IT.World.create({ seed: (Math.random() * 1e9) | 0, map, loadout: lo, fog: IT.Ranked.worldFog(opts, scn ? pr : null), autoAttack: set.autoAttack, tod: scn ? 'day' : opts.tod });
    // v6 day / night: Free Play takes opts.tod (Day / Night / Cycle); scenario runs read IT.DayNight.SCENARIO at every scenario start
    if (IT.DayNight) IT.DayNight.attach(w, { tod: scn ? 'day' : opts.tod });
    const sp = map.spawns.hero;
    const hero = IT.Hero.create(w, lo, sp.x, sp.y);
    g = { w, hero, opts, lo, mode: opts.mode, grant: opts.grant, cam: IT.Camera.create(map), ended: false, committed: false, R: null, cv, run, menu: false, quiet: false, failAt: {} };
    g.cam.centerOn(hero.x, hero.y); g.cam.lock = !!set.camLock;
    // Free Play starts EMPTY (0 enemies = none, no default dummy): enemies and dummies are added from the in-game side panel (IT.UI.Roster).
    // opts.enemy.count > 0 (programmatic starts only) still spawns that many enemies, registered as roster rows.
    if (!run && IT.Towers && map.towers && map.towers.length) IT.Towers.spawnAll(w, map);   // scenario runs spawn theirs in Ranked.apply
    g.nDummies = 0;
    g.defTier = IT.UI.Roster ? IT.UI.Roster.defTier({ tier: opts.diff }) : 'common';
    if (!run && opts.enemy && opts.enemy.count > 0) {
      IT.EnemyCard.spawnAll(opts.enemy, w, sp, lo.skin).forEach((e, i) => { e.ros = { kind: 'enemy', skin: e.skin, tier: e.tier || g.defTier, ord: i + 1, items: (opts.enemy.items || []).slice() }; });
    }
    if (IT.StatsCollector) IT.StatsCollector.create(w);
    IT.Sfx && IT.Sfx.attach(w);
    IT.DummyChat && IT.DummyChat.attach(w, g);
    applyView(set.zoom || 1);
    g.cam.centerOn(hero.x, hero.y);
    g.R = IT.Render.create(w, cv, glowCv, g.cam);
    g.R.showDebug = !!(IT.dev && IT.dev.debug);
    w.on('fail', p => {
      if (p.unit !== hero.id) return;
      const now = performance.now();
      if (now - (g.failAt[p.reason] || -1e9) < 1000) return;   // one toast per reason per second
      g.failAt[p.reason] = now;
      const k = 'fail.' + p.reason;
      UI.toast(IT.hasT(k) ? IT.t(k) : p.reason, 'bad');
      if (IT.Input.sfx) IT.Input.sfx('fail');
    });
    w.on('modeEnd', p => { if (!g.quiet) finish(p); });
    // scnResult: the between-round result card (js/ui/combobar.js) shows it; no extra toast here (playtest 2)
    const ctx = { w, hero, cam: g.cam, R: g.R, cv, mode: opts.mode, grant: opts.grant, free: !run };
    if (run) {
      tourWire(w);
      run.attach(w, () => {   // next scenario swapped in: re-sync everything that caches the hero / loadout
        g.lo = run.pr.lo; g.nDummies = run.dummies.length;
        IT.Input.cancel(true); aimG.clearRect(0, 0, aimCv.width, aimCv.height);
        snapCam(); acc = 0;
        if (IT.HUD.resetMeter) IT.HUD.resetMeter();
        IT.HUD.bind(ctx);
      });
      g.nDummies = run.dummies.length;
      snapCam();   // attach() already moved the hero to the scenario spawn (and maybe swapped the map) without calling onSwap
    }
    if (IT.Combo) IT.Combo.mode(w, 'sandbox', { loadout: lo, grantMissing: !scn && !!opts.grant });

    stage.classList.add('on'); state = 'play'; settingsOver = false;
    music(run ? 'countdown' : 'sandbox');   // then Music.sync(w) follows the run phase
    IT.Input.hooks = hooks;
    IT.Input.bind(ctx);
    IT.HUD.bind(ctx);
    acc = 0; last = performance.now();
    IT.dev = Object.assign(IT.dev || {}, { w, hero, cam: g.cam, R: g.R, paused: false, render: devRender });
  }

  // leaving a scenario run early: ranked folds the partial score into the rating (no end screen)
  function abandon() {
    if (g && g.run && !g.run.ended) { g.quiet = true; g.run.finish('quit'); }
  }

  function teardown() {
    if (!g) return;
    IT.Music && IT.Music.intensity(0);
    IT.Input.unbind(); IT.HUD.unbind();
    if (IT.Briefing) IT.Briefing.hide();
    if (g.w._stats) g.w._stats.destroy();
    IT.Sfx && IT.Sfx.detach();
    IT.DummyChat && IT.DummyChat.detach();
    aimG.clearRect(0, 0, aimCv.width, aimCv.height);
    stage.classList.remove('on');
    UI.clearToasts();
    g = null;
  }

  // v6 WP6: a finished ranked run also records its per-run medal (lifetime runs / best medal); relic deltas ride in st.relics
  function commitStats(modeInfo) {
    if (!g || g.committed) return null;
    g.committed = true;
    const st = g.w._stats ? g.w._stats.summary() : null;
    if (st && modeInfo && modeInfo.mode === 'ranked' && IT.Ranks && IT.Ranks.fromRun) {
      st.run = { mode: 'ranked', score: Math.round(modeInfo.score || 0), solved: modeInfo.solved | 0, turns: modeInfo.turns || 8, medal: IT.Ranks.fromRun(modeInfo) };
    }
    try { const L = IT.UI.Life.load(); g.prevBest = (L && L.bestMedal) || null; } catch (e) { g.prevBest = null; }
    if (st && (st.time > 1 || st.run)) IT.UI.Life.add(st);
    return st;
  }

  function finish(modeInfo) {
    if (!g || g.ended) return;
    g.ended = true;
    const st = commitStats(modeInfo) || (IT.StatsCollector ? IT.StatsCollector.blank() : null);
    g.w.paused = true; IT.Input.enabled = false; g.menu = false;
    aimG.clearRect(0, 0, aimCv.width, aimCv.height);
    if (IT.Music) { IT.Music.intensity(0); music(modeInfo && (modeInfo.mode === 'ranked' || modeInfo.mode === 'infinite') ? 'splash' : 'menu'); }
    state = 'end';
    const info = { stats: st, mode: modeInfo, prevBest: g.prevBest || null };
    UI.clear();
    UI.push(() => IT.UI.endScreen(info), true);
  }

  // ---------------------------------------------------------------- screens
  const App = IT.App = {
    go(name) {
      if (name === 'again') { abandon(); if (lastOpts) start(lastOpts); else App.go('freeplay'); return; }
      if (name === 'loadout') name = lastOpts && lastOpts.scenario ? 'scenarios' : 'freeplay';   // pause menu "Loadout": the screen the match came from
      if (name === 'sandbox' || name === 'combo') name = 'freeplay';   // v6 item 21: one Free Play (the Combo Sandbox card is gone)
      if (name === 'ranked') { abandon(); commitStats(); start({ mode: 'ranked' }); return; }
      if (name === 'infinite') { abandon(); commitStats(); start({ mode: 'infinite' }); return; }
      abandon();
      commitStats();
      teardown();
      UI.clear(); settingsOver = false;
      state = name;
      music('menu');
      if (name === 'title') UI.set(UI.title);
      else if (name === 'freeplay') UI.set(IT.UI.LoadoutScreen.build);
      else if (name === 'scenarios') UI.set(IT.UI.LoadoutScreen.buildScenarios);
      else if (name === 'stats') UI.set(IT.UI.statsScreen);
      else if (name === 'settings') { IT.UI.settingsOpen(); UI.set(IT.UI.settingsPanel); }
    },
    start(opts) { start(opts); },
    resume() {
      if (!g || !g.menu || g.ended) return;
      g.menu = false; UI.pop();
      g.w.paused = !!(g.run && g.run.frozen());   // countdown / result stay frozen
    },
    restart() { if (lastOpts) { abandon(); commitStats(); start(lastOpts); } },
    endRun() {
      if (!g) return;
      g.menu = false; UI.pop();
      if (g.run) { g.run.finish('quit'); return; }
      g.w.paused = false;
      if (IT.Combo) IT.Combo.stop(g.w); else finish({ mode: g.mode });
      if (g && !g.ended) finish({ mode: g.mode });
    },
    pauseSettings() { settingsOver = true; IT.UI.settingsOpen(); UI.push(IT.UI.settingsPanel, true); },
    settingsBack() { if (settingsOver) { settingsOver = false; UI.pop(); } else App.go('title'); },
    // ESC: one level up. play -> pause -> resume; pause-settings -> pause; settings / loadout / stats / end -> title
    back() {
      if (state === 'title') return;
      try { IT.UISound && IT.UISound.play('back'); } catch (e) { /* ignore */ }
      if (state === 'play') { hooks.pause(); return; }
      if (state === 'settings' && IT.UI.settingsCancel) { IT.UI.settingsCancel(); return; }
      App.go('title');
    },
    get state() { return state; },
  };

  const hooks = {
    zoom: zoomStep,
    pause() {
      if (!g || g.ended) return;
      if (settingsOver) { IT.UI.settingsCancel(); return; }
      if (g.menu) App.resume();
      else { g.menu = true; g.w.paused = true; IT.Input.cancel(true); UI.push(UI.pause, true); }
    },
    skip() { return !!(g && g.run && !g.menu && !g.ended && g.run.skip()); },   // action key / Start button ends the pre-scenario countdown
    inspect() { return !!(g && g.run && g.run.frozen() && !g.menu && !g.ended && !settingsOver); },   // ranked countdown/result: camera + inspect only
    stats() { if (g && !g.menu && !g.ended) IT.HUD.statsToggle(); },
    cheat() { IT.HUD.cheatToggle(); },
    debug() { if (g) { g.R.showDebug = !g.R.showDebug; IT.dev.debug = g.R.showDebug; } },
    refresh() {
      if (!g) return;
      if (IT.Combo) IT.Combo.refreshAll(g.w, g.hero);
      else { g.hero.cd = {}; g.hero.inv.invokeCd = 0; g.hero.mana = g.hero.maxMana; }
      UI.toast(IT.t('toast.refreshed'), 'good');
    },
    // Free Play side pane (js/ui/roster.js): "+ Enemy" / "+ Dummy" arm a map click that places the new unit (Esc / right-click cancels)
    armEnemy(kind) {
      if (!g || g.mode !== 'sandbox' || g.run || g.menu || g.ended) return false;
      kind = kind === 'dummy' ? 'dummy' : 'enemy';
      const Ro = IT.UI.Roster;
      if (!Ro.canAdd(g.w, kind)) { UI.toast(IT.t(kind === 'dummy' ? 'ros.maxDummy' : 'ros.maxEnemy', { n: Ro.MAX[kind] }), 'bad'); return false; }
      IT.Input.armed = { id: '__place', place: true, kind };
      UI.toast(IT.t('ros.placeNow', { what: IT.t(kind === 'dummy' ? 'ros.dummy' : 'ros.enemy').toLowerCase() }), 'info');
      return true;
    },
    placeEnemy(p) {
      if (!g || g.mode !== 'sandbox' || g.run || !p) return false;
      const Ro = IT.UI.Roster, a = IT.Input.armed, kind = a && a.kind === 'dummy' ? 'dummy' : 'enemy';
      if (!Ro.canAdd(g.w, kind)) { UI.toast(IT.t(kind === 'dummy' ? 'ros.maxDummy' : 'ros.maxEnemy', { n: Ro.MAX[kind] }), 'bad'); IT.Input.armed = null; return false; }
      const e = Ro.spawn(g.w, kind, p.x, p.y, { tier: g.defTier, items: g.opts.enemy && g.opts.enemy.items });
      if (!e) { UI.toast(IT.t('ros.badSpot'), 'bad'); return false; }
      UI.toast(IT.t('ros.placed', { what: IT.t(kind === 'dummy' ? 'ros.dummy' : 'ros.enemy') }), 'good');
      return true;
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
    return `render ${S2.ms.toFixed(2)}ms avg ${S2.avg.toFixed(2)} max ${S2.max.toFixed(1)} [${S2.gl}] light ${S2.tLight.toFixed(2)} sand ${S2.tSand.toFixed(2)} fx ${S2.tFx.toFixed(2)} comp ${S2.tComp.toFixed(2)}  hz ${(1000 / PACE.ms).toFixed(0)}  lights ${S2.lights} parts ${S2.parts} items ${S2.items} sand ${S2.sand || 0}  lock ${g.cam.lock ? 'on' : 'off'}\n` +
      `orbs ${inv.orbs.join('')}  slots ${inv.slots.map(s => s || '-').join(' | ')}  invokeCd ${inv.invokeCd.toFixed(1)}\n` +
      `hp ${Math.round(hero.hp)}/${Math.round(hero.maxHp)}  mana ${Math.round(hero.mana)}/${Math.round(hero.maxMana)}  t ${g.w.t.toFixed(1)}`;
  }
  // frame pacing: estimate the display refresh from rAF deltas (lower quartile of the last 16: robust to stalls),
  // render every k-th rAF with k = max(1, round(refresh / fpsCap)); sim time keeps accumulating real dt
  const PACE = { ring: new Float64Array(16), tmp: new Float64Array(16), n: 0, i: 0, ms: 16.67, skip: 0, pend: 0 };
  function pace(raw) {
    if (!(raw > 2 && raw < 80)) return;
    PACE.ring[PACE.i] = raw; PACE.i = (PACE.i + 1) & 15; if (PACE.n < 16) PACE.n++;
    if (PACE.n < 8 || (PACE.i & 3)) return;
    const t = PACE.tmp, n = PACE.n;
    for (let a = 0; a < n; a++) { const v = PACE.ring[a]; let b = a - 1; while (b >= 0 && t[b] > v) { t[b + 1] = t[b]; b--; } t[b + 1] = v; }
    PACE.ms = t[n >> 2];
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const raw = now - last; last = now;
    pace(raw); PACE.pend += raw;
    if (g) {
      const idle = g.w.paused && (g.menu || g.ended || settingsOver);
      if (idle || document.hidden) { if (PACE.pend < 100) return; }                // menu / hidden: ~10 fps
      else {
        const cap = S.get().fpsCap, k = cap > 0 ? Math.max(1, Math.round(1000 / PACE.ms / cap)) : 1;
        if (++PACE.skip < k) return;
      }
    }
    PACE.skip = 0;
    const dt = Math.min(0.1, PACE.pend / 1000); PACE.pend = 0;
    if (g && !(IT.dev && IT.dev.paused)) {
      const w = g.w;
      if (!w.paused) {
        acc += dt;
        while (acc >= w.dt && !w.paused) { g.R.snapshot(); w.step(); acc -= w.dt; }
        if (g.run && (g.run.turns != null ? g.run.turns - g.run.n <= 1 : g.run.infinite && g.run.solved >= 4) && IT.Music) IT.Music.intensity(1);
        if (!g.ended) { tourSync(); g.cam.update(dt, IT.Input.keys, IT.Input.camMouse(), g.hero); }
      } else if (g.run && !g.menu && !g.ended) {   // countdown / result: sim frozen, camera + inspect stay live
        acc = 0;
        g.run.tick(dt);
        if (g && !g.ended) { tourSync(); g.cam.update(dt, IT.Input.keys, IT.Input.camMouse(), g.hero); }
      }
      if (g && !g.ended && IT.Music) { try { IT.Music.sync(w); } catch (e) { /* audio is optional */ } }   // situation track: countdown / play / escape / lowtime / result
      g.R.render(w.paused ? 1 : acc / w.dt, dt);
      IT.Input.drawAim(aimG);
      if (g) IT.HUD.update(dt);
      if (g && IT.Briefing) IT.Briefing.update(g.w, dt, !!(g.menu || g.ended));
      dbgT += dt;
      if (g && dbgT > 0.25) { dbgT = 0; dbg.textContent = g.R.showDebug ? debugText() : ''; g.R.stats.max *= 0.5; }
    }
  }
  // step the sim n ticks then draw once (rAF is throttled in hidden panes)
  function devRender(n) {
    if (!g) return;
    const R = g.R, w = g.w;
    for (let i = 0; i < (n || 0); i++) { R.snapshot(); w.step(); }
    R.fogSnap = (n || 0) > 5; R.render(1, 1 / 60); R.fogSnap = false;
    IT.Input.drawAim(aimG); IT.HUD.update(0);
    if (IT.Briefing) IT.Briefing.update(w, 0, false);
  }

  UI.initTip();
  S.apply(true);
  IT.dev = { w: null, hero: null, cam: null, R: null, paused: false, render: devRender, debug: false };
  IT.hooks = hooks;
  App.go('title');
  requestAnimationFrame(frame);
})(window);
