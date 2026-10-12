// Free Play screen (match panel: map + enemies; hero loadout in tabs) and Scenarios screen (ranked START + card grid).
// State persisted in localStorage 'it2.loadout'. IT.UI.LoadoutScreen = { state, build, buildScenarios, startOpts, scenarioOpts, comboPreset, save, load, derived, trim }.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const KEY = 'it2.loadout';
  const ORBS = ['quas', 'wex', 'exort'];
  const ORBK = { quas: 'Q', wex: 'W', exort: 'E' };

  const DEF_MAP = 'dota';   // Free Play default (the old 'grounds' training clearing is gone from the picker)
  const HIDDEN_MAPS = ['grounds'];
  const st = { lo: null, count: 1, fog: true, tod: 'day', grant: true, scenario: null, map: DEF_MAP, diff: 'common', enemy: { count: 0, items: [], list: [] }, tab: 'hero' };
  const TOD = ['day', 'night', 'cycle'];   // v6 Free Play time of day (js/data/daynight.js)
  const normEnemy = e => IT.EnemyCard.normalize(e);   // Free Play enemy card (count, item set, one row per enemy): js/sim/enemycard.js
  const diffOk = d => IT.DIFFICULTY.order.indexOf(IT.DIFFICULTY.migrate(d)) >= 0;

  const scenarios = () => IT.SCENARIOS || [];
  const scnOf = id => (id == null ? null : scenarios().find(s => s.id === id) || null);
  const scnName = s => (s.name && typeof s.name === 'object' ? (s.name[IT.lang] || s.name.en) : s.name) || IT.t(s.nameKey || ('scn.' + s.id));
  const scnLoc = v => (v && typeof v === 'object' ? (v[IT.lang] || v.en) : v) || '';
  const scnTip = s => scnLoc(s.desc || s.goal || s.tip) || (s.descKey ? IT.t(s.descKey) : '');

  const mapOk = id => !!(id && HIDDEN_MAPS.indexOf(id) < 0 && IT.Maps && IT.Maps.ids && IT.Maps.ids().indexOf(id) >= 0);
  // enemy rows keep an explicit skin (Pedro / Renan / Vitinho): legacy 'auto' rows get the next one in rotation
  function fixEnemy(e) {
    e.count = Math.max(0, Math.min(e.count | 0, e.list.length));
    const SK = (IT.GAME && IT.GAME.SKINS) || [];
    for (let i = 0; i < e.list.length; i++) if (SK.length && SK.indexOf(e.list[i].skin) < 0) e.list[i].skin = SK[i % SK.length];
    return e;
  }
  function fresh() {
    st.lo = IT.Loadout.normalize(Object.assign(IT.Loadout.default(), { mode: 'sandbox' }));
    st.count = 1; st.fog = true; st.tod = 'day'; st.grant = true; st.scenario = null; st.map = DEF_MAP; st.diff = 'common'; st.enemy = fixEnemy(normEnemy());
  }
  function load() {
    fresh();
    let raw = null;
    try { raw = JSON.parse(G.localStorage.getItem(KEY)); } catch (e) { raw = null; }
    if (!raw || !raw.lo) return;
    const lo = IT.Loadout.normalize(raw.lo);
    if (!IT.Loadout.validate(lo).ok) return;
    st.lo = lo;
    st.count = 1;   // one scarecrow at the start; more are placed in the match (P / HUD)
    st.fog = raw.fog !== false; st.grant = raw.grant !== false;
    st.tod = TOD.indexOf(raw.tod) >= 0 ? raw.tod : 'day';   // v6 Free Play time of day
    st.enemy = fixEnemy(normEnemy(raw.enemy));
    st.diff = diffOk(raw.diff) ? IT.DIFFICULTY.migrate(raw.diff) : 'common';
    st.map = mapOk(raw.map) ? raw.map : DEF_MAP;
  }
  function save() {
    st.lo.mode = 'sandbox';
    try { G.localStorage.setItem(KEY, JSON.stringify({ lo: st.lo, fog: st.fog, tod: st.tod, grant: st.grant, map: st.map, diff: st.diff, enemy: st.enemy })); } catch (e) { /* ignore */ }
  }

  const talentIdx = (name) => IT.RULES.talentTiers.findIndex(t => t.left === name || t.right === name);
  function trim(lo) {
    const R = IT.RULES, L = lo.heroLevel;
    let changed = false;
    for (const k of ORBS) {
      let v = lo.orbs[k];
      while (v > 0 && R.orbGate(v) > L) { v--; changed = true; }
      lo.orbs[k] = v;
    }
    const keep = [], per = [0, 0, 0, 0], slots = R.talentPointsAt(L);
    for (const n of lo.talents) {
      const t = talentIdx(n);
      if (t < 0 || L < R.talentTiers[t].level || keep.length >= slots) { changed = true; continue; }
      per[t]++;
      if (per[t] === 2 && L < R.talentSecondLevels[t]) { changed = true; continue; }
      keep.push(n);
    }
    lo.talents = keep;
    while (R.pointsLeft(lo) < 0) {   // one pool: orbs and talents are paid from the same points; shave orbs first
      const k = ORBS.slice().sort((a, b) => lo.orbs[b] - lo.orbs[a])[0];
      if (lo.orbs[k] > 0) lo.orbs[k]--; else lo.talents.pop();
      changed = true;
    }
    return changed;
  }

  const fmt = n => {
    if (n == null || !isFinite(n)) return '-';
    const a = Math.abs(n);
    if (a >= 100) return String(Math.round(n));
    if (a >= 10) return String(Math.round(n * 10) / 10);
    return String(Math.round(n * 100) / 100);
  };

  // spell preview config: [dotaKey, labelKey, pct?]
  const SPV = {
    coldsnap: [['duration', 'v.duration'], ['freeze_damage', 'v.freezeDmg']],
    ghostwalk: [['enemy_slow', 'v.slow', 1], ['duration', 'v.duration']],
    icewall: [['damage_per_second', 'v.dps'], ['duration', 'v.wallDur']],
    emp: [['mana_burned', 'v.manaBurn'], ['delay', 'v.delay']],
    tornado: [['travel_distance', 'v.dist'], ['lift_duration', 'v.lift']],
    alacrity: [['bonus_attack_speed', 'v.as'], ['bonus_damage', 'v.bonusDmg']],
    sunstrike: [['damage', 'v.dmg'], ['delay', 'v.delay']],
    forgespirit: [['spirit_damage', 'v.spiritDmg'], ['spirit_hp', 'v.spiritHp']],
    chaosmeteor: [['main_damage', 'v.main'], ['burn_dps', 'v.burn']],
    deafeningblast: [['damage', 'v.dmg'], ['radius_end', 'v.aoe']],
  };

  function derived(lo) {
    const ctx = IT.Loadout.ctx(lo), a = IT.Hero.attrs(ctx), D = IT.DOTA.hero, V = IT.Values, GM = IT.GAME;
    let ms = D.MovementSpeed, as = (D.BaseAttackSpeed || 100) + a.agi;
    const boots = IT.Loadout.BOOTS.find(b => lo.items.includes(b));
    if (boots) ms += V.item(GM.ITEM_DOTA[boots], 'bonus_movement_speed');
    const armorItem = lo.items.includes('shiva') ? V.item(GM.ITEM_DOTA.shiva, 'bonus_armor') : 0;
    return {
      ctx, a,
      hp: IT.Hero.maxHp(ctx), mana: IT.Hero.maxMana(ctx),
      hpRegen: D.StatusHealthRegen + 0.1 * a.str, manaRegen: D.StatusManaRegen + 0.05 * a.int,
      armor: D.ArmorPhysical + a.agi / 6 + armorItem, magicRes: ((D.MagicalResistance != null ? D.MagicalResistance : 25) / 100 + 0.001 * a.int) * 100,
      dmgMin: D.AttackDamageMin + a.int, dmgMax: D.AttackDamageMax + a.int, as, bat: D.AttackRate, ms,
      invokeCd: V.invokeCooldown(ctx),
    };
  }

  // ------------------------------------------------------------------ screen
  function build() {
    const { h, icon, portrait, btn } = IT.UI, t = IT.t, R = IT.RULES, GM = IT.GAME, lo = st.lo;
    const regions = {};
    const reg = (name, cls) => (regions[name] = h('div', { class: cls || '' }));
    const note = h('div', { class: 'note', text: '' });
    let noteT = 0;
    const flash = msg => { note.textContent = msg; clearTimeout(noteT); noteT = setTimeout(() => { note.textContent = ''; }, 2600); };

    const changed = () => { save(); all(); };

    // ---- level + points
    const lvlVal = h('span', { class: 'big', text: lo.heroLevel });
    const slider = h('input', {
      type: 'range', min: 1, max: 30, step: 1, value: lo.heroLevel, class: 'slider',
      oninput: ev => {
        lo.heroLevel = +ev.target.value;
        if (IT.UISound) IT.UISound.play('level');
        const c = trim(lo);
        if (c) flash(t('lo.fix'));
        changed();
      },
    });
    const ptsBox = reg('pts', 'pts');
    function renderPts() {
      lvlVal.textContent = lo.heroLevel; slider.value = lo.heroLevel;
      const av = R.pointsAvailable(lo.heroLevel), sp = R.pointsSpent(lo), left = av - sp;
      ptsBox.textContent = '';
      ptsBox.appendChild(h('span', { class: 'chip', text: t('lo.available') + ' ' + av }));
      ptsBox.appendChild(h('span', { class: 'chip', text: t('lo.spent') + ' ' + sp }));
      ptsBox.appendChild(h('span', { class: 'chip ' + (left === 0 ? 'ok' : 'gold'), text: t('lo.left') + ' ' + left }));
    }

    // ---- orbs: 7 spent steps per orb (R.orbMax). The Scepter's +1 is an EXTRA bead beyond the 7 (diamond, gold ring); it pops with a sand burst.
    const orbBox = reg('orbs', 'orbs');
    let prevScOrb = (lo.scepter && lo.scepterOrb) || null;
    function whyNotPlus(k) {
      const v = lo.orbs[k];
      if (v >= R.orbMax) return t('tip.maxOrb');
      if (R.pointsLeft(lo) <= 0) return t('tip.noPoints');
      const g = R.orbGate(v + 1);
      if (g > lo.heroLevel) return t('tip.gate', { n: v + 1, lvl: g });
      return null;
    }
    function renderOrbs() {
      orbBox.textContent = '';
      const scNow = (lo.scepter && lo.scepterOrb) || null;
      let beadNew = null;
      for (const k of ORBS) {
        const v = lo.orbs[k], why = whyNotPlus(k), hasSc = scNow === k;
        const pips = IT.UI.orbPips.el(h, k, IT.UI.orbPips.model(v, 0, R.orbMax), (i, p) => { i.setAttribute('data-tip', t('tip.gate', { n: p.n, lvl: R.orbGate(p.n) })); if (R.orbGate(p.n) > lo.heroLevel) i.classList.add('lock'); });
        pips.classList.add('pips');
        const bead = h('i', { class: 'bead ' + k + (hasSc ? ' on' : ''), 'data-tip': t('lo.bead') });
        if (hasSc && prevScOrb !== k) beadNew = bead;
        orbBox.appendChild(h('div', { class: 'orbrow ' + k },
          icon(k), h('span', { class: 'on', text: t('orb.' + k) }), h('span', { class: 'ov', text: v + (hasSc ? '+1' : '') }),
          pips, bead,
          h('button', { type: 'button', class: 'pm', text: '-', 'data-tip': v ? '' : t('tip.minOrb'), disabled: v <= 0 ? true : null, onclick: () => { if (lo.orbs[k] > 0) { lo.orbs[k]--; changed(); } } }),
          h('button', {
            type: 'button', class: 'pm' + (why ? ' dis' : ''), text: '+', 'data-tip': why || '',
            onclick: () => { const w2 = whyNotPlus(k); if (w2) { flash(w2); return; } lo.orbs[k]++; changed(); },
          })));
      }
      orbBox.appendChild(h('div', { class: 'row auto' },
        h('span', { class: 'lbl', text: t('lo.auto') }),
        h('button', { type: 'button', class: 'btn sm', text: 'Q / E', 'data-tip': t('tip.autoQE'), onclick: () => autoBuild('qe') }),
        h('button', { type: 'button', class: 'btn sm', text: 'Q / W', 'data-tip': t('tip.autoQW'), onclick: () => autoBuild('qw') })));
      prevScOrb = scNow;
      if (beadNew) fxBurst(beadNew, grainCols(scNow), 30);
    }
    function autoBuild(style) {
      const a = R.autoLoadout(lo.heroLevel, style);
      lo.orbs = Object.assign({ quas: 0, wex: 0, exort: 0 }, a.orbs);
      lo.talents = a.talents.slice();
      trim(lo); changed();
    }

    // ---- talents
    const talBox = reg('talents', 'talents');
    function renderTalents() {
      talBox.textContent = '';
      const used = lo.talents.length, tot = R.talentPointsAt(lo.heroLevel);
      talBox.appendChild(h('div', { class: 'sub', text: t('lo.talentPts', { n: used, max: tot }) }));
      for (let i = 3; i >= 0; i--) {
        const T = R.talentTiers[i];
        const cell = side => {
          const name = T[side], picked = lo.talents.includes(name);
          const per = lo.talents.filter(n => talentIdx(n) === i).length;
          let tip = '', cls = 'tal' + (picked ? ' on' : '');
          if (picked) tip = t('lo.talentUnpick');
          else if (lo.heroLevel < T.level) { cls += ' lock'; tip = t('tip.talentLvl', { lvl: T.level }); }
          else if (per >= 1 && lo.heroLevel < R.talentSecondLevels[i]) { tip = t('lo.talentSwap') + '. ' + t('tip.talentSecond', { lvl: R.talentSecondLevels[i] }); }
          else if (per >= 2 || used >= tot || R.pointsLeft(lo) <= 0) { cls += ' lock'; tip = t('tip.noPoints'); }
          else tip = t('lo.talentPick');
          return h('button', {
            type: 'button', class: cls, 'data-tip': tip, text: t('talent.' + name),
            onclick: () => {
              if (picked) { lo.talents = lo.talents.filter(n => n !== name); changed(); return; }
              if (lo.heroLevel < T.level) { flash(t('tip.talentLvl', { lvl: T.level })); return; }
              const mine = lo.talents.filter(n => talentIdx(n) === i);
              if (mine.length >= 1 && lo.heroLevel < R.talentSecondLevels[i]) { lo.talents = lo.talents.filter(n => talentIdx(n) !== i); lo.talents.push(name); changed(); return; }
              if (mine.length >= 2 || lo.talents.length >= R.talentPointsAt(lo.heroLevel) || R.pointsLeft(lo) <= 0) { flash(t('tip.noPoints')); return; }
              lo.talents.push(name); changed();
            },
          });
        };
        talBox.appendChild(h('div', { class: 'tier' }, cell('left'), h('span', { class: 'tlv', text: T.level }), cell('right')));
      }
    }

    // ---- sand fx: ONE fixed full-viewport canvas (3 px grains, js/art/hood.js Sand); a burst falls from an anchor, rests just under it and fades
    const reducedMotion = () => { try { return !!(G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };
    const grainCols = k => { const p = IT.Hood.PAL[k]; return [p.h, p.m, p.m, p.e]; };
    let fxCv = null, fxSand = null, fxRaf = 0;
    function fxBurst(anchor, cols, n) {
      if (reducedMotion() || !anchor.isConnected || !G.requestAnimationFrame) return;
      const r = anchor.getBoundingClientRect(), root = anchor.closest('.scr');
      if (!r.width || !root) return;
      const S = 3, W = Math.ceil(G.innerWidth / S), Hh = Math.ceil(G.innerHeight / S);
      if (!fxCv) fxCv = h('canvas', { class: 'fx-sand' });
      if (!fxCv.isConnected) root.appendChild(fxCv);
      if (!fxSand || fxCv.width !== W || fxCv.height !== Hh) { fxCv.width = W; fxCv.height = Hh; fxSand = IT.Hood.Sand(fxCv, { gravity: 120 }); }
      fxSand.burst((r.left + r.width / 2) / S, (r.top + r.height / 2) / S, n || 30, cols, { speed: 30, lift: 16, spread: 3, floor: (r.bottom + 12) / S });
      if (fxRaf) return;
      let last = performance.now();
      const step = now => {
        if (!fxCv.isConnected) { fxRaf = 0; return; }
        fxSand.step((now - last) / 1000); last = now; fxSand.draw();
        if (fxSand.live()) fxRaf = G.requestAnimationFrame(step); else fxRaf = 0;
      };
      fxRaf = G.requestAnimationFrame(step);
    }

    // ---- aghs: the Invoker HUD hood drawn big (js/art/hood.js = the in-game hood). The three orbs ARE the buttons:
    // click 1 = Scepter on that orb (its gem lights in the orb's colour), click 2 = Shard on that orb's spell, click 3 = remove both (IT.Agh.orbClick).
    // Below: the upgraded spell + a one-line explainer per upgrade. Built once; the re-render only touches the layers / rows (sand keeps falling).
    const A = IT.Agh, HD = IT.Hood, HFH = 46;   // canvas grid 34 x 46: the hood (38 rows) + 8 rows of floor where the sand pools
    const aghBox = reg('aghs', 'aghs');
    const mkCv = cls => h('canvas', { class: 'hh ' + cls, width: HD.W, height: HFH });
    const cvBase = mkCv('base'), cvSc = mkCv('scepter'), cvSh = mkCv('shard'), cvSand = mkCv('sand');
    cvBase.getContext('2d').drawImage(HD.layer('base'), 0, 0);
    const sand = HD.Sand(cvSand, { floor: HFH, gravity: 90 });
    const pc = (v, tot) => (v / tot * 100) + '%';
    const orbBtns = {};
    for (const k of ORBS) {
      const [ox, oy] = HD.ORB[k], r = HD.OR + 1;
      orbBtns[k] = h('button', {
        type: 'button', class: 'horb ' + k, style: { left: pc(ox - r, HD.W), top: pc(oy - r, HFH), width: pc(2 * r, HD.W), height: pc(2 * r, HFH) },
        onclick: () => pickOrb(k),
      }, h('span', { class: 'mk s' }), h('span', { class: 'mk h' }));
    }
    const gemBtn = (kind, x0, y0, x1, y1) => h('button', {
      type: 'button', class: 'hgem ' + kind, style: { left: pc(x0, HD.W), top: pc(y0, HFH), width: pc(x1 - x0, HD.W), height: pc(y1 - y0, HFH) },
      onclick: () => { if (kind === 'sc') A.setScepter(lo, false); else A.setShard(lo, false); changed(); },
    });
    const gemS = gemBtn('sc', 12.5, 13, 21.5, 24), gemH = gemBtn('sh', 8, 28, 26, 38);
    const rig = h('div', { class: 'hoodrig' }, cvBase, cvSc, cvSh, cvSand, gemS, gemH, ORBS.map(k => orbBtns[k]));
    const upS = h('div', { class: 'upg sc' }), upH = h('div', { class: 'upg sh' });
    aghBox.appendChild(rig); aghBox.appendChild(h('div', { class: 'upgs' }, upS, upH));

    let rigRaf = 0, rigIdle = 0;
    function rigRun() {   // the loop idles out once the sand is gone; a few unattached frames are tolerated (the screen is built before it is shown)
      if (rigRaf || !G.requestAnimationFrame || reducedMotion()) return;
      let last = performance.now();
      const step = now => {
        rigIdle = rig.isConnected ? 0 : rigIdle + 1;
        if (rigIdle > 90) { rigRaf = 0; return; }
        sand.step((now - last) / 1000); last = now; sand.draw();
        rigRaf = sand.live() ? G.requestAnimationFrame(step) : 0;
      };
      rigRaf = G.requestAnimationFrame(step);
    }
    function pickOrb(k) {
      const res = A.orbClick(lo, k);
      changed();
      if (res.add && !reducedMotion()) {   // sand pops out of the gem that just lit
        const pal = HD.PAL[res.add === 'scepter' ? k : HD.SHARD_ORB[HD.ORB_SHARD[k]]], cols = [pal.h, pal.m, pal.m, pal.e];
        if (res.add === 'scepter') sand.burst(17, 18, 44, cols, { speed: 20, lift: 10, spread: 4 });
        else sand.burst(17, 33, 44, cols, { speed: 20, lift: 10, spread: 8 });
        rigRun();
      }
    }
    const upRow = (kind, row) => {
      const u = A.upgradeLine(lo, kind), sc = kind === 'scepter';
      row.textContent = ''; row.classList.toggle('on', !!u);
      row.appendChild(icon(u ? u.spell : kind, 'huge'));
      const body = h('div', { class: 'ub' });
      body.appendChild(h('div', { class: 'ut' }, h('b', { text: t(sc ? 'agh.name.scepter' : 'agh.name.shard') }),
        u ? h('span', { class: 'uo ' + u.orb, text: sc ? t('agh.up.plus', { orb: t('orb.' + u.orb) }) : t('spell.' + u.spell) }) : null));
      body.appendChild(h('p', { class: 'ud', text: u ? t(u.k, u.v) : t(sc ? 'agh.up.none.sc' : 'agh.up.none.sh') }));
      if (sc && lo.scepter && !lo.scepterOrb) body.appendChild(h('p', { class: 'warn', text: t('err.scepter') }));
      if (!sc && lo.shard && !lo.shardSpell) body.appendChild(h('p', { class: 'warn', text: t('err.shard') }));
      row.appendChild(body);
    };
    let hoodKey = '';
    function renderAghs() {
      const so = lo.scepter && HD.PAL[lo.scepterOrb] ? lo.scepterOrb : null, sh = lo.shard && HD.SHARD_ORB[lo.shardSpell] ? HD.SHARD_ORB[lo.shardSpell] : null;
      const key = (so || '-') + '|' + (sh || '-');
      if (key !== hoodKey) {
        hoodKey = key;
        for (const [cv, kind, o] of [[cvSc, 'scepter', so], [cvSh, 'shard', sh]]) {
          const cx = cv.getContext('2d'); cx.clearRect(0, 0, HD.W, HFH);
          if (o) { cx.drawImage(HD.layer(kind, o), 0, 0); cv.style.setProperty('--hc', HD.PAL[o].glow); }
          cv.style.display = o ? '' : 'none';
        }
        const em = [];
        if (so) em.push({ x0: 14, x1: 20, y: 24, pal: HD.PAL[so], rate: 5, vx: 9 });
        if (sh) em.push({ x0: 9, x1: 25, y: 35, pal: HD.PAL[sh], rate: 7, vx: 5 });
        sand.setEmitters(em);
        rigRun();
      }
      gemS.style.display = so ? '' : 'none'; gemH.style.display = sh ? '' : 'none';
      gemS.setAttribute('data-tip', t('agh.hood.gemS')); gemH.setAttribute('data-tip', t('agh.hood.gemH'));
      for (const k of ORBS) {
        const b = orbBtns[k], r = A.orbClick(Object.assign({}, lo), k);   // what a click on this orb would do (on a copy)
        b.classList.toggle('s', A.scepterAt(lo, k)); b.classList.toggle('h', A.shardAt(lo, k));
        b.setAttribute('data-tip', t('orb.' + k) + '. ' + (r.add === 'scepter' ? t('agh.hood.o1', { orb: t('orb.' + k) }) : r.add === 'shard' ? t('agh.hood.o2', { spell: t('spell.' + A.SHARD_OF[k]) }) : r.rm.length > 1 ? t('agh.hood.o3') : t('agh.hood.o4')));
        b.setAttribute('aria-label', t('orb.' + k));
      }
      upRow('scepter', upS); upRow('shard', upH);
    }

    // ---- items: equipped slots in 2 rows of 3 (Dota layout: 1 2 3 / 4 5 6) with their keys; drag a slot onto another to reorder (the key follows the slot),
    // drag it out onto the catalogue / pane to remove it; the catalogue is a compact icon + name grid: click to add, or drag an item onto a slot.
    const itemBox = reg('items', 'items');
    const slotKey = i => { try { const S = IT.Settings; return S && S.label ? S.label(S.keyOf('item' + (i + 1))) : String(i + 1); } catch (e) { return String(i + 1); } };
    const isBoots = id => IT.Loadout.BOOTS.includes(id);
    function moveSlot(from, to) {   // swap with a full slot; an empty target sends the item to the end of the row (the list has no holes)
      const a = lo.items; if (from === to || from >= a.length) return;
      if (to >= a.length) a.push(a.splice(from, 1)[0]); else { const x = a[from]; a[from] = a[to]; a[to] = x; }
    }
    function addItem(id, at) {   // at: slot index to drop onto (replaces a full slot) or undefined = first free
      if (lo.items.includes(id)) { flash(t('item.' + id)); return false; }
      const rest = lo.items.filter(x => !(isBoots(id) && isBoots(x)));
      if (at != null && at < rest.length) rest[at] = id; else rest.push(id);
      if (rest.length > 6) { flash(t('tip.itemsFull')); return false; }
      lo.items = rest; return true;
    }
    // Pointer drag via the shared state machine (IT.UI.ItemDrag, mode 'loadout'): slot -> slot reorders, catalogue -> slot adds, slot -> pane (not a slot) removes.
    // Catalogue entries are only sources (never targets) so the list can never be reordered. HTML5 drag-and-drop is not used (the app blocks dragstart).
    const ID = IT.UI.ItemDrag;
    let ghost = null;
    const dragClear = () => {
      if (ghost) { ghost.remove(); ghost = null; }
      itemBox.classList.remove('dragging');
      for (const e of itemBox.querySelectorAll('.over,.dragsrc')) e.classList.remove('over', 'dragsrc');
    };
    const hitItem = (x, y) => {
      const e = document.elementFromPoint(x, y), sl = e && e.closest ? e.closest('.islot') : null;
      if (sl) return { kind: 'slot', i: +sl.getAttribute('data-i') };
      const pane = itemBox.closest('.pane');
      return pane && e && pane.contains(e) ? { kind: 'bin' } : null;
    };
    const dm = ID.create({
      canDrag: src => src.kind === 'slot' ? src.i < lo.items.length : !lo.items.includes(src.id),
      onStart: src => {
        const id = src.kind === 'slot' ? lo.items[src.i] : src.id;
        itemBox.classList.add('dragging');
        const q = src.kind === 'slot' ? itemBox.querySelector('.islot[data-i="' + src.i + '"]') : itemBox.querySelector('.iopt[data-id="' + id + '"]');
        if (q) q.classList.add('dragsrc');
        ghost = h('div', { class: 'idrag' }, icon(id)); document.body.appendChild(ghost);
      },
      onOver: tg => {
        for (const e of itemBox.querySelectorAll('.over')) e.classList.remove('over');
        if (tg && tg.kind === 'slot') { const q = itemBox.querySelector('.islot[data-i="' + tg.i + '"]'); if (q) q.classList.add('over'); }
        itemBox.classList.toggle('rm', !!tg && tg.kind === 'bin' && dm.src && dm.src.kind === 'slot');
      },
      onClick: src => {
        if (src.kind === 'slot') { if (src.i < lo.items.length) { lo.items.splice(src.i, 1); changed(); } return; }
        if (lo.items.includes(src.id)) lo.items = lo.items.filter(x => x !== src.id); else if (!addItem(src.id)) return;
        changed();
      },
      onDrop: (src, tg, act) => {
        dragClear();
        if (act.type === 'swap') moveSlot(act.from, act.to);
        else if (act.type === 'remove') { if (act.from < lo.items.length) lo.items.splice(act.from, 1); else return; }
        else if (act.type === 'add') { if (!addItem(act.id, act.at)) return; }
        else return;
        changed();
      },
      onCancel: dragClear,
    }, 'loadout');
    const dbegin = ID.bind(dm, {
      win: window, doc: document, hit: hitItem, locked: () => false, end: dragClear,
      moved: (x, y) => { if (ghost) { ghost.style.left = x + 'px'; ghost.style.top = y + 'px'; } },
    });
    const press = (src, ev) => { if (ev.button === 0) { ev.preventDefault(); dbegin(src, ev); } };
    function renderItems() {
      itemBox.textContent = '';
      const slots = h('div', { class: 'islots' });
      for (let i = 0; i < 6; i++) {
        const id = lo.items[i], key = slotKey(i);
        slots.appendChild(h('div', {
          class: 'islot' + (id ? ' full' : ''), role: 'button', tabindex: '0', 'data-i': String(i),
          'data-tip': id ? t('item.' + id) + ' (' + key + '). ' + t('lo.itemDrag') : t('lo.itemSlotKey', { n: i + 1, key }),
          onmousedown: ev => { if (id) press({ kind: 'slot', i }, ev); },
          onkeydown: ev => { if (id && (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Delete')) { ev.preventDefault(); lo.items.splice(i, 1); changed(); } },
        }, id ? icon(id) : null, h('span', { class: 'skey', text: key })));
      }
      const pool = h('div', { class: 'ipool' });
      for (const id of GM.ITEMS_MAIN.concat(GM.ITEMS_EXTRA)) {
        const on = lo.items.includes(id), full = !on && lo.items.length >= 6;
        pool.appendChild(h('button', {
          type: 'button', class: 'iopt' + (on ? ' on' : '') + (full ? ' dis' : ''), 'data-id': id, 'data-tip': full ? t('tip.itemsFull') : t('item.' + id),
          onmousedown: ev => press({ kind: 'cat', id }, ev),
          onclick: ev => {   // keyboard activation only (a mouse click is handled by the drag machine on release)
            if (ev.detail) return;
            if (on) lo.items = lo.items.filter(x => x !== id);
            else if (!addItem(id)) return;
            changed();
          },
        }, icon(id), h('span', { text: t('item.' + id) })));
      }
      itemBox.appendChild(h('div', { class: 'islotbox' }, slots));
      itemBox.appendChild(h('div', { class: 'icat' }, pool));
    }

    // ---- enemies (Free Play): one row per enemy = skin picker + difficulty + remove; max EnemyCard.MAX. They are on the map at the start.
    const eneBox = reg('enemy', 'enemy');
    const EC = IT.EnemyCard;
    function renderEnemy() {
      eneBox.textContent = '';
      const en = st.enemy, full = en.count >= EC.MAX;
      eneBox.appendChild(h('div', { class: 'ehead' },
        h('span', { class: 'lbl', text: en.count + ' / ' + EC.MAX }),
        h('button', {
          type: 'button', class: 'btn sm addbtn' + (full ? ' dis' : ''), 'data-tip': full ? t('fp.max', { n: EC.MAX }) : '', text: '+ ' + t('fp.add'),
          onclick: () => { if (en.count >= EC.MAX) { flash(t('fp.max', { n: EC.MAX })); return; } en.count++; fixEnemy(en); changed(); },
        })));
      for (let i = 0; i < en.count; i++) {
        const r = en.list[i];
        eneBox.appendChild(h('div', { class: 'erow' },
          h('span', { class: 'en', text: String(i + 1) }),
          h('div', { class: 'eskins', 'data-tip': t('fp.skin') }, GM.SKINS.map(s => h('button', {
            type: 'button', class: 'eskin' + (r.skin === s ? ' on' : ''), 'data-tip': GM.SKIN_NAMES[s], onclick: () => { r.skin = s; changed(); },
          }, portrait(s)))),
          h('select', { class: 'mapsel etier', 'data-tip': t('fp.diff'), onchange: ev => { r.tier = ev.target.value; changed(); } },
            IT.DIFFICULTY.order.map(d => h('option', { value: d, selected: r.tier === d ? true : null, text: t('diff.' + d) }))),
          h('button', {
            type: 'button', class: 'btn sm dim erm', 'data-tip': t('fp.remove'), 'aria-label': t('fp.remove'), text: 'x',
            onclick: () => { en.list.splice(i, 1); en.list.push(normEnemy().list[0]); en.count--; fixEnemy(en); changed(); },
          })));
      }
      eneBox.appendChild(h('p', { class: 'fine', text: en.count ? t('fp.enemy.hint') : t('fp.none') }));
    }

    // ---- map
    const mapBox = reg('map', 'mapbox');
    // Map preview: a sized placeholder first; the (cached) tile thumbnail is drawn once it is on screen and the browser is idle.
    // Building a thumbnail builds the map itself (the 368x368 whole map is the slow one), so nothing runs while the picker is closed.
    function lazyThumb(box, id) {
      let done = false;
      const paint = () => {
        if (done || !box.isConnected) return; done = true;
        try { const cv = IT.Maps && IT.Maps.thumb ? IT.Maps.thumb(id, 96, 54) : null; if (cv) { box.textContent = ''; box.classList.add('ready'); box.appendChild(cv); } } catch (e) { /* no preview */ }
      };
      const idle = () => { if (typeof requestIdleCallback === 'function') requestIdleCallback(paint, { timeout: 400 }); else setTimeout(paint, 30); };
      if (typeof IntersectionObserver === 'function') {
        const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); idle(); } });
        io.observe(box);
      } else idle();
    }
    function renderMap() {
      mapBox.textContent = '';
      const ML = ((IT.Maps && IT.Maps.list) || []).filter(m => HIDDEN_MAPS.indexOf(m.id) < 0);
      if (!ML.length) return;
      const nm = m => (IT.hasT('map.' + m.id) ? t('map.' + m.id) : (m.name && m.name.en) || m.id);
      const sel = h('select', { class: 'mapsel', onchange: ev => { st.map = ev.target.value; changed(); } },
        ML.map(m => h('option', { value: m.id, selected: st.map === m.id ? true : null, text: nm(m) })));
      const cur = ML.find(m => m.id === st.map) || ML[0];
      const thumb = h('div', { class: 'mapthumb', 'data-map': cur.id });
      mapBox.appendChild(h('div', { class: 'mapline' },
        h('div', { class: 'mapside' }, sel,
          h('p', { class: 'fine', text: IT.hasT('map.' + cur.id + '.d') ? t('map.' + cur.id + '.d') : ((cur.blurb && cur.blurb.en) || '') })),
        thumb));
      lazyThumb(thumb, cur.id);
    }

    // ---- match options (Free Play)
    const optBox = reg('opts', 'opts');
    function avail() { try { return IT.Combo ? IT.Combo.available(lo, { grantMissing: st.grant }).length : -1; } catch (e) { return -1; } }
    function renderOpts() {
      optBox.textContent = '';
      optBox.appendChild(h('div', { class: 'row wrap' },
        h('label', { class: 'tog' }, h('input', { type: 'checkbox', checked: st.grant ? true : null, onchange: ev => { st.grant = ev.target.checked; changed(); } }), h('span', { class: 'box' }), h('span', { text: t('lo.grant') })),
        h('label', { class: 'tog' }, h('input', { type: 'checkbox', checked: st.fog ? true : null, onchange: ev => { st.fog = ev.target.checked; changed(); } }), h('span', { class: 'box' }), h('span', { text: t('lo.fog') }))));
      // v6 time of day: Day / Night / Cycle (real Dota 5 min alternation, IT.DayNight)
      optBox.appendChild(h('div', { class: 'row wrap', 'data-tip': t('lo.tod.d') }, h('span', { text: t('lo.tod') }),
        h('select', { class: 'mapsel todsel', onchange: ev => { st.tod = ev.target.value; changed(); } },
          TOD.map(k => h('option', { value: k, selected: st.tod === k ? true : null, text: t('lo.tod.' + k) })))));
      const n = avail();
      if (n >= 0) optBox.appendChild(h('p', { class: 'fine ' + (n ? 'ok' : 'warn'), text: n ? t('lo.combosAvail', { n }) : t('lo.noCombos') }));
    }

    // ---- preview
    const prevBox = reg('prev', 'prev');
    function renderPrev() {
      prevBox.textContent = '';
      let d;
      try { d = derived(lo); } catch (e) { return; }
      const row = (k, v) => h('div', { class: 'srow' }, h('span', { text: t(k) }), h('b', { text: v }));
      prevBox.appendChild(h('div', { class: 'stats' },
        row('stat.str', fmt(d.a.str)), row('stat.agi', fmt(d.a.agi)), row('stat.int', fmt(d.a.int)),
        row('stat.hp', Math.round(d.hp)), row('stat.mana', Math.round(d.mana)),
        row('stat.hpRegen', fmt(d.hpRegen)), row('stat.manaRegen', fmt(d.manaRegen)),
        row('stat.armor', fmt(d.armor)), row('stat.magicRes', fmt(d.magicRes) + '%'),
        row('stat.damage', Math.round(d.dmgMin) + '-' + Math.round(d.dmgMax)), row('stat.as', fmt(d.as)),
        row('stat.ms', Math.round(d.ms)), row('stat.invokeCd', fmt(d.invokeCd) + 's')));
      const tb = h('div', { class: 'sptab' });
      for (const s of Object.keys(SPV)) {
        const dota = GM.SPELL_DOTA[s], rec = GM.SPELL_ORBS[s];
        const miss = ORBS.filter(k => rec.includes(ORBK[k]) && d.ctx.eff[k] < 1);
        const vals = SPV[s].map(([key, lab, pct]) => { const v = IT.Values.get(dota, key, d.ctx); return v ? t(lab) + ' ' + fmt(pct ? Math.abs(v) : v) + (pct ? '%' : '') : null; }).filter(Boolean);
        tb.appendChild(h('div', { class: 'sprow' + (miss.length ? ' off' : '') },
          icon(s), h('span', { class: 'sn', text: t('spell.' + s) }),
          miss.length ? h('span', { class: 'sv', text: t('lo.needsOrbs', { orbs: miss.map(k => ORBK[k]).join('') }) })
            : h('span', { class: 'sv' }, h('em', { text: Math.round(IT.Values.manaCost(dota, d.ctx)) + ' ' + t('v.mana') + ' / ' + fmt(IT.Values.cooldown(dota, d.ctx)) + 's' }), vals.join('  '))));
      }
      prevBox.appendChild(tb);
    }

    // ---- go
    const goBox = reg('go', 'gobox');
    function problems() {
      const errs = [];
      const v = IT.Loadout.validate(lo);
      if (lo.scepter && !lo.scepterOrb) errs.push(t('err.scepter'));
      if (lo.shard && !lo.shardSpell) errs.push(t('err.shard'));
      if (!errs.length && !v.ok) errs.push(t('err.generic', { msg: v.errors[0] }));
      return errs;
    }
    function renderGo() {
      goBox.textContent = '';
      const errs = problems();
      if (errs.length) goBox.appendChild(h('div', { class: 'warn gerr' }, errs.map(e => h('div', { text: e }))));
      goBox.appendChild(h('button', { type: 'button', class: 'btn grn go' + (errs.length ? ' dis' : ''), 'data-snd': 'start', text: t('fp.start'), 'data-tip': errs.length ? errs[0] : '', onclick: () => { const e2 = problems(); if (e2.length) { flash(e2[0]); return; } save(); IT.App.start(startOpts()); } }));
    }

    // ---- tabs: Hero (level, orbs, talents) / Items / Aghanim's / Stats. All panes are built; CSS shows the active one.
    const TABS = [['hero', 'fp.tab.hero'], ['items', 'fp.tab.items'], ['agh', 'fp.tab.agh'], ['stats', 'fp.tab.stats']];
    const tabBar = h('div', { class: 'lo-tabs', role: 'tablist' }, TABS.map(([id, k]) => h('button', {
      type: 'button', class: 'tabb', role: 'tab', 'data-tab': id, text: t(k), onclick: () => { st.tab = id; showTab(); },
    })));
    function showTab() {
      if (!TABS.some(x => x[0] === st.tab)) st.tab = 'hero';
      el.setAttribute('data-tab', st.tab);
      for (const b of tabBar.children) b.classList.toggle('on', b.getAttribute('data-tab') === st.tab);
    }

    function all() { renderPts(); renderOrbs(); renderTalents(); renderAghs(); renderItems(); renderEnemy(); renderMap(); renderOpts(); renderPrev(); renderGo(); }
    const sec = (title, ...kids) => h('section', { class: 'sec' }, h('h3', { text: title }), kids);

    const combo = !!st.combo;
    const el = h('div', { class: 'scr loadout fp' },
      h('div', { class: 'lo-head' },
        h('button', { type: 'button', class: 'btn sm dim', text: t('ui.back'), onclick: () => IT.App.go('title') }),
        h('h1', { text: t(combo ? 'fp.combo' : 'fp.title') }),
        IT.UI.langToggle()),
      h('div', { class: 'fp-body' },
        h('div', { class: 'fp-match' },
          combo ? null : h('button', { type: 'button', class: 'combocard', 'data-snd': 'start', onclick: () => IT.App.go('combo') },
            h('b', { text: t('fp.combo') }), h('span', { text: t('fp.combo.d') })),
          sec(t('lo.map'), mapBox),
          combo ? null : sec(t('fp.enemies'), eneBox),
          sec(t('fp.match'), optBox)),
        h('div', { class: 'fp-hero' },
          tabBar,
          h('div', { class: 'lo-panes' },
            h('div', { class: 'pane hero' },
              h('div', { class: 'pcol' },
                sec(t('lo.level'), h('div', { class: 'lvl' }, h('span', { class: 'lv', text: 'Lv' }), lvlVal, slider), ptsBox),
                sec(t('lo.orbs'), orbBox)),
              h('div', { class: 'pcol' }, sec(t('lo.talents'), talBox))),
            h('div', { class: 'pane items' }, sec(t('lo.items'), itemBox, h('p', { class: 'fine', text: t('lo.itemsHint') }))),
            h('div', { class: 'pane agh' }, sec(t('lo.aghs'), aghBox)),
            h('div', { class: 'pane stats' }, sec(t('lo.preview'), prevBox))))),
      h('div', { class: 'fp-foot' }, note, goBox));
    all(); showTab();
    return el;
  }

  // ---- Scenarios screen (practice, no rating): a compact wrapped grid of small cards; a card starts that scenario alone (sandbox).
  function buildScenarios() {
    const { h } = IT.UI, t = IT.t, EC = IT.EnemyCard;
    const list = scenarios();
    const card = s => {
      const tags = (s.tags || []).filter(g => IT.hasT('tag.' + g)).slice(0, 3);
      return h('button', {
        type: 'button', class: 'scard', 'data-snd': 'start', 'data-tip': scnTip(s),
        onclick: () => IT.App.start(scenarioOpts(s.id)),
      },
        h('span', { class: 'lvb', 'data-tip': t('lo.lvTier', { n: s.level, tier: t('diff.' + EC.tierOfLevel(s.level)) }), text: String(s.level) }),
        h('span', { class: 'sctx' },
          h('b', { class: 'scn', text: scnName(s) }),
          h('span', { class: 'sctags' }, tags.map(g => h('i', { text: t('tag.' + g) })))));
    };
    return h('div', { class: 'scr loadout sc' },
      h('div', { class: 'lo-head' },
        h('button', { type: 'button', class: 'btn sm dim', text: t('ui.back'), onclick: () => IT.App.go('title') }),
        h('h1', { text: t('sc.title') }),
        IT.UI.langToggle()),
      h('div', { class: 'sc-prac' },
        h('h3', { text: t('sc.practice') }), h('p', { class: 'fine', text: t('sc.practice.d') })),
      list.length ? h('div', { class: 'sc-grid' }, list.map(card)) : h('p', { class: 'fine', text: t('lo.noScenarios') }));
  }

  // the Free Play match
  function startOpts() {
    save();
    const en = normEnemy(st.enemy);
    if (st.combo) en.count = 0;
    return { loadout: IT.Loadout.normalize(st.lo), mode: 'sandbox', count: 1, fog: st.fog, tod: st.tod, grant: st.grant, scenario: null, map: mapOk(st.map) ? st.map : DEF_MAP, diff: diffOk(st.diff) ? IT.DIFFICULTY.migrate(st.diff) : 'common', enemy: en };
  }
  // one scenario played alone (no rating): the tier follows the scenario's level
  function scenarioOpts(id) {
    const sc = scnOf(id);
    save();
    return { loadout: IT.Loadout.normalize(st.lo), mode: 'sandbox', count: 1, fog: st.fog, grant: st.grant, scenario: sc ? sc.id : null, map: mapOk(st.map) ? st.map : DEF_MAP, diff: sc ? IT.EnemyCard.tierOfLevel(sc.level) : 'common', enemy: null };
  }
  // Combo Sandbox: Free Play with no enemies and every combo granted (a transient flag, not saved)
  function comboPreset(on) { st.combo = on !== false; if (st.combo) st.grant = true; }

  load();
  IT.UI.LoadoutScreen = { state: st, build, buildScenarios, startOpts, scenarioOpts, comboPreset, save, load, derived, trim };
})(typeof window !== 'undefined' ? window : globalThis);
