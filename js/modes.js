'use strict';
// UI, input, trainer modes, arena director, main loop.
(() => {
  const $ = id => document.getElementById(id);
  const W = Sand.W, H = Sand.H, M = Sand.M, T = Sand.T;
  const cv = $('game'), ctx = cv.getContext('2d');
  cv.width = W; cv.height = H;
  Sand.init($('cells'), $('glow'));
  const glow2 = $('glow2'); glow2.width = W; glow2.height = H; const g2 = glow2.getContext('2d');
  const ORB_T = { Q: T.CYAN, W: T.PURPLE, E: T.ORANGE };
  const rnd = n => (Math.random() * n) | 0;
  const pick = a => a[rnd(a.length)];
  const COMBOS = [
    ['tornado', 'emp', 'chaosmeteor', 'deafeningblast'],
    ['sunstrike', 'chaosmeteor', 'deafeningblast'],
    ['coldsnap', 'tornado', 'sunstrike', 'deafeningblast'],
    ['ghostwalk', 'alacrity', 'sunstrike', 'tornado'],
    ['icewall', 'coldsnap', 'forgespirit', 'chaosmeteor'],
    ['emp', 'tornado', 'alacrity', 'sunstrike'],
  ];

  // ---- background ----
  const bg = document.createElement('canvas'); bg.width = W; bg.height = H;
  (() => {
    const b = bg.getContext('2d'), gr = b.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#0d0820'); gr.addColorStop(.6, '#2a1346'); gr.addColorStop(1, '#5a2a5a');
    b.fillStyle = gr; b.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) { b.fillStyle = ['#ffffff55', '#8fe9ff66', '#ff6bf055'][i % 3]; b.fillRect(rnd(W), rnd(H * .7), 1, 1); }
  })();

  // ---- persistence ----
  let bests = {};
  try { bests = JSON.parse(localStorage.getItem('invoker_best') || '{}'); } catch (e) { /* ignore */ }
  const saveBests = () => { try { localStorage.setItem('invoker_best', JSON.stringify(bests)); } catch (e) { /* ignore */ } };
  Settings.load();

  // ---- HUD build ----
  const icon = (host, name) => { host.innerHTML = ''; const c = spriteEl(name); c.className = 'ico'; host.appendChild(c); };
  const orbBtns = $('orbBtns');
  for (const c of 'QWE') { const b = document.createElement('button'); b.className = 'kb'; b.dataset.c = c; b.tabIndex = -1; icon(b, 'orb' + c); b.insertAdjacentHTML('beforeend', '<b></b>'); orbBtns.appendChild(b); }
  const invokeBtn = $('invokeBtn'); invokeBtn.className = 'kb'; icon(invokeBtn, 'invoke'); invokeBtn.insertAdjacentHTML('beforeend', '<b></b>');
  const slotBtns = [...document.querySelectorAll('#spellSlots button')];
  slotBtns.forEach(b => { b.className = 'kb'; b.tabIndex = -1; b.innerHTML = '<span class="ic"></span><b></b><div class="cd"></div><div class="cdt"></div>'; });
  const slotShown = [undefined, undefined];
  const orbSlotEls = [...document.querySelectorAll('#orbSlots span')];

  function refreshKeys() {
    const K = Settings.keys;
    orbBtns.querySelectorAll('.kb').forEach(b => { b.querySelector('b').textContent = K[b.dataset.c.toLowerCase()].toUpperCase(); });
    invokeBtn.querySelector('b').textContent = K.r.toUpperCase();
    const bk = $('book'); bk.innerHTML = '';
    if (!Settings.book) { bk.hidden = true; } else bk.hidden = false;
    for (const s of SPELLS) {
      const d = document.createElement('div');
      d.innerHTML = '<span class="ic"></span><span class="nm">' + s.name + '</span><span class="orbs">' + [...s.orbs].map(c => '<i class="o' + c + '"></i>').join('') + '</span><kbd>' + (Settings.scheme === 'legacy' ? K[s.id].toUpperCase() : '') + '</kbd>';
      icon(d.firstChild, s.id); bk.appendChild(d);
    }
    slotShown[0] = slotShown[1] = undefined;
  }
  function refreshOrbSlots() { orbSlotEls.forEach((el, i) => { const c = Inv.orbs[i]; if (c) icon(el, 'orb' + c); else el.innerHTML = ''; }); }

  // ---- toast ----
  let toastT = 0;
  function toast(txt, col) { const t = $('toast'); t.textContent = txt; t.style.color = col || '#fff'; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 700); }
  function banner(txt) { const t = $('wave'); t.textContent = txt; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 1400); }

  // ---- game state ----
  let mode = 'menu', run = null, paused = false;
  const fmt = s => s.toFixed(2) + 's';
  const castKey = id => (Settings.scheme === 'legacy' ? Settings.keys[id].toUpperCase() : (Inv.slots[0] === id ? Settings.keys.slot1 : Settings.keys.slot2).toUpperCase());

  function show(id) { for (const p of ['menu', 'settings', 'result']) $(p).hidden = p !== id; $('hud').hidden = id === 'menu' || id === 'settings'; }
  function toMenu() {
    mode = 'menu'; run = null; show('menu'); World.reset(false); Inv.reset(false, false); refreshOrbSlots();
    $('bests').innerHTML = 'Best drill: <b>' + (bests.drill || 0) + '</b> &middot; Best combo run: <b>' + (bests.combo ? fmt(bests.combo) : '--') + '</b> &middot; Arena: <b>wave ' + (bests.arenaWave || 0) + '</b>';
  }

  function start(kind) {
    mode = kind; paused = false;
    World.reset(kind === 'arena'); Inv.reset(kind === 'arena', kind === 'arena'); refreshOrbSlots();
    World.aim.x = 240; World.aim.y = 100;
    run = { kind, score: 0, streak: 0, maxStreak: 0, casts: 0, correct: 0, wrong: 0, times: {}, seq: [], idx: 0, t0: 0, timeLeft: 60, left: 5, total: 0, comboTimes: [], wave: 0, between: 2, toSpawn: 0, spawnT: 0, spawned: 0 };
    show(null); $('result').hidden = true; $('book').hidden = kind === 'arena' || !Settings.book; $('hud').hidden = false;
    $('modeName').textContent = { free: 'FREE PLAY', drill: 'DRILL', combo: 'COMBO RUN', arena: 'ARENA' }[kind];
    $('prompt').hidden = !(kind === 'drill' || kind === 'combo');
    $('bars').hidden = kind !== 'arena';
    $('timer').hidden = kind !== 'drill';
    $('hpTxt').parentElement.hidden = kind !== 'arena';
    $('score').hidden = kind === 'free';
    if (kind === 'drill') newTarget(); else if (kind === 'combo') newCombo();
    renderPrompt(); updateInfo();
    toast(kind === 'free' ? 'Free play: Q W E, R to invoke' : kind === 'arena' ? 'Survive!' : 'Go!', '#ffd23f');
  }

  function newTarget() { let id; do id = pick(SPELLS).id; while (run.seq[0] === id); run.seq = [id]; run.idx = 0; run.t0 = performance.now(); }
  function newCombo() { run.seq = pick(COMBOS).slice(); run.idx = 0; run.t0 = performance.now(); }

  function renderPrompt() {
    if (!run || run.kind === 'free' || run.kind === 'arena') return;
    const host = $('targets'); host.innerHTML = '';
    run.seq.forEach((id, i) => {
      const s = SPELL[id], d = document.createElement('div');
      d.className = 'tgt' + (i === run.idx ? ' cur' : i < run.idx ? ' done' : '');
      d.innerHTML = '<span class="ic"></span><span>' + s.name + '</span>' + (Settings.hints ? '<span class="orbs">' + [...s.orbs].map(c => '<i class="o' + c + '"></i>').join('') + '</span>' : '');
      icon(d.firstChild, id); host.appendChild(d);
    });
    $('hint').textContent = run.kind === 'combo' ? 'Combo ' + (6 - run.left) + '/5 — cast in order' : '';
  }
  function updateInfo() {
    if (!run) return;
    $('score').textContent = run.kind === 'arena' ? run.score + '  W' + run.wave : String(run.score);
    $('streak').textContent = run.kind === 'drill' && run.streak > 1 ? 'Streak x' + run.streak : '';
    if (run.kind === 'drill') $('timer').textContent = Math.max(0, run.timeLeft).toFixed(1) + 's';
    if (run.kind === 'combo') $('timer').hidden = false, $('timer').textContent = ((performance.now() - run.t0) / 1000 + run.total).toFixed(1) + 's';
  }

  // ---- casting ----
  function onCast(id) {
    World.cast(id);
    if (!run) return;
    run.casts++;
    if (run.kind === 'drill') {
      if (id === run.seq[0]) {
        const t = (performance.now() - run.t0) / 1000;
        (run.times[id] = run.times[id] || []).push(t);
        run.correct++; run.streak++; run.maxStreak = Math.max(run.maxStreak, run.streak);
        const pts = Math.round(Math.max(10, 100 - t * 14) * (1 + Math.min(run.streak - 1, 10) * .1));
        run.score += pts; toast('+' + pts + '  ' + fmt(t), '#7dff9a'); SFX.play('success');
        newTarget(); renderPrompt();
      } else { run.wrong++; run.streak = 0; toast('Wrong spell!', '#ff5c7a'); SFX.play('fail'); }
    } else if (run.kind === 'combo') {
      if (id === run.seq[run.idx]) {
        run.correct++; run.idx++; SFX.play('success');
        if (run.idx >= run.seq.length) {
          const t = (performance.now() - run.t0) / 1000; run.total += t; run.comboTimes.push(t);
          const pts = Math.round(Math.max(20, 300 - t * 20)); run.score += pts; toast('Combo! +' + pts + '  ' + fmt(t), '#ffd23f');
          if (--run.left <= 0) { finish(); return; }
          newCombo();
        }
        renderPrompt();
      } else { run.wrong++; run.idx = 0; toast('Wrong! Combo restarts', '#ff5c7a'); SFX.play('fail'); renderPrompt(); }
    }
    updateInfo();
  }
  Inv.ev.cast = onCast;
  Inv.ev.fail = why => { if (mode !== 'menu') toast(why, '#ff9a5c'); };
  Inv.ev.orb = c => {
    refreshOrbSlots(); const iv = World.inv;
    Sand.burst(iv.x, iv.y - 24, 3, M.SPARK, ORB_T[c], 6);
    if (Math.random() < .5) Sand.add(iv.x + (Math.random() - .5) * 10, iv.y - 28, M.SAND, ORB_T[c]);
  };
  Inv.ev.invoke = id => { const iv = World.inv; for (const c of Inv.orbs) Sand.burst(iv.x, iv.y - 16, 8, M.SPARK, ORB_T[c], 9); if (run && run.kind === 'free') toast(SPELL[id].name, '#fff'); };

  function act(a) {
    if (mode === 'menu' || mode === 'result') return;
    if (a.t === 'orb') Inv.orb(a.c);
    else if (a.t === 'invoke') Inv.invoke();
    else if (a.t === 'cast') Inv.cast(a.id);
    else if (a.t === 'slot') Inv.castSlot(a.n);
  }

  // ---- finish / results ----
  function finish() {
    const r = run, a = r.kind;
    mode = 'result';
    let html = '<h2>' + { drill: 'Drill complete', combo: 'Combo run complete', arena: 'You fell' }[a] + '</h2>';
    const stat = (k, v) => '<div class="stat"><span>' + k + '</span><b>' + v + '</b></div>';
    let newBest = false;
    if (a === 'drill') {
      if (r.score > (bests.drill || 0)) { bests.drill = r.score; newBest = true; }
      const all = Object.values(r.times).flat(), avg = all.length ? all.reduce((x, y) => x + y, 0) / all.length : 0;
      html += '<div class="big">' + r.score + '</div>' + stat('Correct casts', r.correct) + stat('Wrong casts', r.wrong) + stat('Best streak', r.maxStreak) + stat('Avg time', avg ? fmt(avg) : '--');
      for (const id in r.times) { const t = r.times[id]; html += stat(SPELL[id].name, fmt(t.reduce((x, y) => x + y, 0) / t.length) + ' (' + t.length + ')'); }
    } else if (a === 'combo') {
      if (!bests.combo || r.total < bests.combo) { bests.combo = r.total; newBest = true; }
      html += '<div class="big">' + fmt(r.total) + '</div>' + stat('Score', r.score) + stat('Mistakes', r.wrong) + r.comboTimes.map((t, i) => stat('Combo ' + (i + 1), fmt(t))).join('');
    } else {
      if (r.wave > (bests.arenaWave || 0)) { bests.arenaWave = r.wave; newBest = true; }
      if (r.score > (bests.arena || 0)) bests.arena = r.score;
      html += '<div class="big">' + r.score + '</div>' + stat('Wave reached', r.wave) + stat('Kills', World.kills);
      SFX.play('gameover');
    }
    if (newBest) html += '<p style="color:#7dff9a">New best!</p>';
    html += '<button data-retry="' + a + '">Retry</button><button data-menu="1">Menu</button>';
    saveBests(); const res = $('result'); res.innerHTML = html; res.hidden = false;
  }

  // ---- arena director ----
  World.onKill = c => { if (run && run.kind === 'arena') run.score += c.brute ? 30 : 10; };
  function arenaUpdate(dt) {
    const r = run, iv = World.inv;
    if (iv.hp <= 0) { finish(); return; }
    if (r.between > 0) {
      r.between -= dt;
      if (r.between <= 0) { r.wave++; r.toSpawn = Math.min(30, 4 + r.wave * 2); r.spawned = 0; r.spawnT = 0; banner('WAVE ' + r.wave); SFX.play('wave'); }
    } else {
      r.spawnT -= dt;
      if (r.toSpawn > 0 && r.spawnT <= 0) {
        r.spawnT = Math.max(.35, .9 - r.wave * .04); r.toSpawn--; r.spawned++;
        const brute = r.wave >= 3 && r.spawned % 5 === 0;
        World.spawnCreep(Math.random() < .5 ? -1 : 1, (50 + r.wave * 10) * (brute ? 3 : 1), (14 + Math.min(r.wave, 10) * 1.3 + Math.random() * 3) * (brute ? .75 : 1), brute);
      } else if (r.toSpawn <= 0 && World.creeps.length === 0) {
        r.score += 50 * r.wave; iv.hp = Math.min(iv.maxHp, iv.hp + 30); Inv.mana = Math.min(Inv.maxMana, Inv.mana + 100);
        r.between = 3; toast('Wave cleared +' + 50 * r.wave, '#7dff9a');
      }
    }
    $('hpFill').style.width = Math.max(0, iv.hp / iv.maxHp * 100) + '%'; $('hpTxt').textContent = Math.ceil(Math.max(0, iv.hp));
    $('mpFill').style.width = Inv.mana / Inv.maxMana * 100 + '%'; $('mpTxt').textContent = Math.floor(Inv.mana);
    $('score').textContent = r.score + '  W' + r.wave;
  }

  // ---- per-frame HUD ----
  function hudFrame() {
    for (let n = 0; n < 2; n++) {
      const id = Inv.slots[n], b = slotBtns[n];
      if (slotShown[n] !== id) { slotShown[n] = id; if (id) icon(b.querySelector('.ic'), id); else b.querySelector('.ic').innerHTML = ''; }
      b.querySelector('b').textContent = Settings.slotLabel(n, id);
      const cd = id && Inv.useCd ? Inv.cd[id] || 0 : 0;
      b.querySelector('.cd').style.height = cd > 0 ? (cd / SPELL[id].cd * 100) + '%' : '0';
      b.querySelector('.cdt').textContent = cd > 0 ? Math.ceil(cd) : '';
    }
    const ic = $('invokeBtn'); ic.style.opacity = Inv.invokeCd > 0 ? .45 : 1;
  }

  // ---- input ----
  let rebinding = null;
  document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (rebinding) {
      e.preventDefault();
      if (k !== 'escape') { Settings.keys[rebinding] = k; Settings.save(); refreshKeys(); }
      rebinding = null; buildKeyGrid(); return;
    }
    if (k === 'escape') {
      if (!$('settings').hidden) { closeSettings(); return; }
      if (mode !== 'menu') toMenu(); return;
    }
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === 'h' && mode !== 'menu' && !Settings.keys.q.includes('h')) { Settings.book = !Settings.book; Settings.save(); refreshKeys(); return; }
    const a = Settings.lookup(k);
    if (a && mode !== 'menu') { e.preventDefault(); act(a); }
  });
  stage_move = e => { const r = cv.getBoundingClientRect(); World.aim.x = (e.clientX - r.left) / r.width * W; World.aim.y = (e.clientY - r.top) / r.height * H; };
  $('stage').addEventListener('mousemove', stage_move);
  $('stage').addEventListener('mousedown', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.c) act({ t: 'orb', c: b.dataset.c }); else if (b.id === 'invokeBtn') act({ t: 'invoke' }); else if (b.dataset.slot !== undefined && b.closest('#spellSlots')) act({ t: 'slot', n: +b.dataset.slot });
    else if (b.dataset.mode) { SFX.play('click'); start(b.dataset.mode); } else if (b.dataset.retry) start(b.dataset.retry); else if (b.dataset.menu) toMenu();
    else if (b.id === 'openSettings') openSettings(); else if (b.id === 'closeSettings') closeSettings();
    b.blur();
  });

  // ---- settings UI ----
  const KEYDEFS = [['q', 'Quas'], ['w', 'Wex'], ['e', 'Exort'], ['r', 'Invoke'], ['slot1', 'Slot 1'], ['slot2', 'Slot 2'], ...SPELLS.map(s => [s.id, s.name])];
  function buildKeyGrid() {
    const g = $('keyGrid'); g.innerHTML = '';
    for (const [id, label] of KEYDEFS) {
      const b = document.createElement('button'); b.tabIndex = -1; if (rebinding === id) b.className = 'wait';
      b.innerHTML = '<span>' + label + '</span><b>' + (rebinding === id ? '?' : Settings.keys[id].toUpperCase()) + '</b>';
      b.onmousedown = ev => { ev.stopPropagation(); rebinding = id; buildKeyGrid(); };
      g.appendChild(b);
    }
  }
  function openSettings() {
    $('menu').hidden = true; $('settings').hidden = false;
    $('sScheme').value = Settings.scheme; $('sCd').value = String(Settings.invokeCD);
    $('sBloom').checked = Settings.bloom; $('sSound').checked = Settings.sound; $('sHints').checked = Settings.hints;
    buildKeyGrid();
  }
  function closeSettings() { $('settings').hidden = true; $('menu').hidden = false; }
  const apply = () => {
    Settings.scheme = $('sScheme').value; Settings.invokeCD = +$('sCd').value; Settings.bloom = $('sBloom').checked; Settings.sound = $('sSound').checked; Settings.hints = $('sHints').checked;
    SFX.enabled = Settings.sound; document.body.classList.toggle('nobloom', !Settings.bloom); Settings.save(); refreshKeys();
  };
  ['sScheme', 'sCd', 'sBloom', 'sSound', 'sHints'].forEach(id => $(id).addEventListener('change', apply));
  $('settings').addEventListener('mousedown', e => e.stopPropagation());

  // ---- main loop ----
  let last = performance.now(), acc = 0, demoT = 1;
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (mode === 'menu') {
      demoT -= dt; // ambient spell demo behind the menu
      if (demoT <= 0) { demoT = 2.2; World.aim.x = 40 + Math.random() * 240; World.aim.y = 110; World.cast(pick(SPELLS).id); }
      World.update(dt);
    } else if (mode !== 'result') {
      Inv.tick(dt, World.inv.haste > 0);
      World.update(dt);
      if (run.kind === 'drill') { run.timeLeft -= dt; if (run.timeLeft <= 0) finish(); }
      if (run.kind === 'arena') arenaUpdate(dt);
      updateInfo(); hudFrame();
    } else World.update(dt * .5);
    acc += dt; let n = 0;
    while (acc >= 1 / 60 && n++ < 3) { Sand.step(); acc -= 1 / 60; }
    if (acc > .1) acc = 0;
    const gc = Sand.glowCtx(); Sand.render();
    ctx.drawImage(bg, 0, 0); ctx.drawImage(Sand.cellsCanvas(), 0, 0);
    World.draw(ctx, gc);
    g2.clearRect(0, 0, W, H); g2.drawImage(gc.canvas, 0, 0);
    requestAnimationFrame(frame);
  }
  var stage_move;
  document.body.classList.toggle('nobloom', !Settings.bloom);
  refreshKeys(); toMenu(); requestAnimationFrame(frame);
  window.__dbg = { start, finish, get run() { return run; }, get mode() { return mode; }, act, onCast };
})();
