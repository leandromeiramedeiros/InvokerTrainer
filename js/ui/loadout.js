// Loadout screen (SANDBOX). State persisted in localStorage 'it2.loadout'. IT.UI.LoadoutScreen = { state, build, startOpts, save, load, derived, trim }.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const KEY = 'it2.loadout';
  const ORBS = ['quas', 'wex', 'exort'];
  const ORBK = { quas: 'Q', wex: 'W', exort: 'E' };

  const st = { lo: null, count: 1, fog: true, grant: true, scenario: null, map: 'grounds', diff: 'common', enemy: { count: 0, items: [], list: [] } };
  const normEnemy = e => IT.EnemyCard.normalize(e);   // Free Play enemy card (count, item set, one row per enemy): js/sim/enemycard.js
  const diffOk = d => IT.DIFFICULTY.order.indexOf(IT.DIFFICULTY.migrate(d)) >= 0;

  const scenarios = () => IT.SCENARIOS || [];
  const scnOf = id => (id == null ? null : scenarios().find(s => s.id === id) || null);
  const scnName = s => (s.name && typeof s.name === 'object' ? (s.name[IT.lang] || s.name.en) : s.name) || IT.t(s.nameKey || ('scn.' + s.id));
  const scnLoc = v => (v && typeof v === 'object' ? (v[IT.lang] || v.en) : v) || '';
  const scnTip = s => scnLoc(s.desc || s.goal || s.tip) || (s.descKey ? IT.t(s.descKey) : '');

  const mapOk = id => !!(id && IT.Maps && IT.Maps.ids && IT.Maps.ids().indexOf(id) >= 0);
  function fresh() {
    st.lo = IT.Loadout.normalize(Object.assign(IT.Loadout.default(), { mode: 'sandbox' }));
    st.count = 1; st.fog = true; st.grant = true; st.scenario = null; st.map = 'grounds'; st.diff = 'common'; st.enemy = normEnemy();
  }
  function load() {
    fresh();
    let raw = null;
    try { raw = JSON.parse(G.localStorage.getItem(KEY)); } catch (e) { raw = null; }
    if (!raw || !raw.lo) return;
    const lo = IT.Loadout.normalize(raw.lo);
    if (!IT.Loadout.validate(lo).ok) return;
    st.lo = lo;
    st.count = Math.max(1, Math.min(5, raw.count | 0 || 1));
    st.fog = raw.fog !== false; st.grant = raw.grant !== false;
    st.scenario = scnOf(raw.scenario) ? raw.scenario : null;
    st.enemy = normEnemy(raw.enemy);
    st.diff = diffOk(raw.diff) ? IT.DIFFICULTY.migrate(raw.diff) : 'common';
    st.map = mapOk(raw.map) ? raw.map : 'grounds';
  }
  function save() {
    st.lo.mode = 'sandbox';
    try { G.localStorage.setItem(KEY, JSON.stringify({ lo: st.lo, count: st.count, fog: st.fog, grant: st.grant, scenario: st.scenario, map: st.map, diff: st.diff, enemy: st.enemy })); } catch (e) { /* ignore */ }
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
    while (R.pointsLeft(lo) < 0) {
      const k = ORBS.slice().sort((a, b) => lo.orbs[b] - lo.orbs[a])[0];
      lo.orbs[k]--; changed = true;
    }
    const keep = [], per = [0, 0, 0, 0];
    for (const n of lo.talents) {
      const t = talentIdx(n);
      if (t < 0 || L < R.talentTiers[t].level) { changed = true; continue; }
      per[t]++;
      if (per[t] === 2 && L < R.talentSecondLevels[t]) { changed = true; continue; }
      keep.push(n);
    }
    lo.talents = keep;
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

    // ---- orbs
    const orbBox = reg('orbs', 'orbs');
    function whyNotPlus(k) {
      const v = lo.orbs[k];
      if (v >= 8) return t('tip.maxOrb');
      if (R.pointsLeft(lo) <= 0) return t('tip.noPoints');
      const g = R.orbGate(v + 1);
      if (g > lo.heroLevel) return t('tip.gate', { n: v + 1, lvl: g });
      return null;
    }
    function renderOrbs() {
      orbBox.textContent = '';
      for (const k of ORBS) {
        const v = lo.orbs[k], why = whyNotPlus(k);
        const pips = h('div', { class: 'pips' });
        for (let n = 1; n <= 9; n++) {
          const sc = n === 9;
          const on = sc ? (lo.scepter && lo.scepterOrb === k) : n <= v;
          const g = R.orbGate(n);
          pips.appendChild(h('i', {
            class: 'pip ' + k + (on ? ' on' : '') + (sc ? ' sc' : '') + (!sc && g > lo.heroLevel ? ' lock' : ''),
            'data-tip': sc ? t('item.scepter') : t('tip.gate', { n, lvl: g }),
          }));
        }
        orbBox.appendChild(h('div', { class: 'orbrow ' + k },
          icon(k), h('span', { class: 'on', text: t('orb.' + k) }), h('span', { class: 'ov', text: v + (lo.scepter && lo.scepterOrb === k ? '+1' : '') }),
          pips,
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
          else if (per >= 2 || used >= tot) { cls += ' lock'; tip = t('tip.noPoints'); }
          else tip = t('lo.talentPick');
          return h('button', {
            type: 'button', class: cls, 'data-tip': tip, text: t('talent.' + name),
            onclick: () => {
              if (picked) { lo.talents = lo.talents.filter(n => n !== name); changed(); return; }
              if (lo.heroLevel < T.level) { flash(t('tip.talentLvl', { lvl: T.level })); return; }
              const mine = lo.talents.filter(n => talentIdx(n) === i);
              if (mine.length >= 1 && lo.heroLevel < R.talentSecondLevels[i]) { lo.talents = lo.talents.filter(n => talentIdx(n) !== i); lo.talents.push(name); changed(); return; }
              if (mine.length >= 2 || lo.talents.length >= R.talentPointsAt(lo.heroLevel)) { flash(t('tip.noPoints')); return; }
              lo.talents.push(name); changed();
            },
          });
        };
        talBox.appendChild(h('div', { class: 'tier' }, cell('left'), h('span', { class: 'tlv', text: T.level }), cell('right')));
      }
    }

    // ---- aghs: Invoker-hood picker. Two big cards (Scepter | hood | Shard); the hood's eyes light up with the picks.
    // The card row is built once (the re-render only touches the sub rows) so the hood canvas and the grain burst survive a pick.
    const A = IT.Agh;
    const aghBox = reg('aghs', 'aghs');
    const hoodCv = h('canvas', { class: 'hood-cv', width: 48, height: 48 });
    const fxCv = h('canvas', { class: 'hood-fx' });
    const aghSub = h('div', { class: 'agh-sub' });
    const mkCard = kind => h('button', { type: 'button', class: 'hcard ' + kind, onclick: () => pickAgh(kind) },
      icon(kind, 'huge'), h('span', { class: 'hn' }), h('span', { class: 'hs' }));
    const cardS = mkCard('scepter'), cardH = mkCard('shard');
    const stage = h('div', { class: 'hood-stage' }, hoodCv);
    const hoodRow = h('div', { class: 'hoodpick' }, cardS, stage, cardH, fxCv);
    aghBox.appendChild(hoodRow); aghBox.appendChild(aghSub);
    let burstId = 0;
    function burst(kind, card) {   // a few sand grains pop out of the card and fall (visual only, ~1 s)
      let reduced = false;
      try { reduced = !!(G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { reduced = false; }
      if (reduced || !hoodRow.isConnected) return;
      const S = 3, box = hoodRow.getBoundingClientRect(), cr = card.getBoundingClientRect();
      const W = Math.max(8, Math.round(box.width / S)), H = Math.max(8, Math.round(box.height / S));
      fxCv.width = W; fxCv.height = H;
      const cx = (cr.left + cr.width / 2 - box.left) / S, cy = (cr.top + cr.height * 0.35 - box.top) / S;
      const cols = kind === 'scepter' ? ['#fff4a8', '#f2c444', '#c28a1a', '#7c5110'] : ['#e8ffff', '#5ae6ff', '#1a8a9e', '#0e5058'];
      const ps = [];
      for (let i = 0; i < 46; i++) {
        const a = Math.random() * Math.PI * 2, v = 14 + Math.random() * 38;
        ps.push({ x: cx + (Math.random() - 0.5) * 8, y: cy + (Math.random() - 0.5) * 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 22, life: 0.7 + Math.random() * 0.7, c: cols[(Math.random() * cols.length) | 0] });
      }
      const g2 = fxCv.getContext('2d'), id = ++burstId;
      let last = performance.now();
      const step = now => {
        if (id !== burstId || !fxCv.isConnected) return;
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        g2.clearRect(0, 0, W, H);
        let live = false;
        for (const p of ps) {
          if (p.life <= 0) continue;
          p.vy += 130 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 1.5 * dt;
          if (p.y > H - 1) { p.y = H - 1; p.vy = 0; p.vx *= 0.4; }   // grains settle on the floor of the picker
          p.life -= dt; live = true;
          g2.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
          g2.fillStyle = p.c; g2.fillRect(p.x | 0, p.y | 0, 1, 1);
        }
        g2.globalAlpha = 1;
        if (live) G.requestAnimationFrame(step); else g2.clearRect(0, 0, W, H);
      };
      G.requestAnimationFrame(step);
    }
    function pickAgh(kind) {
      const wasOn = kind === 'scepter' ? lo.scepter : lo.shard;
      if (kind === 'scepter') A.setScepter(lo, !lo.scepter); else A.setShard(lo, !lo.shard);
      if (!wasOn) burst(kind, kind === 'scepter' ? cardS : cardH);
      changed();
    }
    function renderAghs() {
      const g2 = hoodCv.getContext('2d');
      g2.clearRect(0, 0, 48, 48);
      if (IT.Hood) g2.drawImage(IT.Hood.canvas(lo.scepter, lo.shard), 0, 0);
      stage.className = 'hood-stage' + (lo.scepter ? ' s' : '') + (lo.shard ? ' h' : '');
      const fill = (card, on, tip, name, sub) => {
        card.classList.toggle('on', !!on);
        card.setAttribute('data-tip', tip);
        card.querySelector('.hn').textContent = name;
        card.querySelector('.hs').textContent = sub;
      };
      fill(cardS, lo.scepter, A.scepterTip(lo), t('agh.name.scepter'), lo.scepter ? (lo.scepterOrb ? t('orb.' + lo.scepterOrb) : t('agh.pickOrb')) : t('agh.off'));
      fill(cardH, lo.shard, A.shardTip(lo), t('agh.name.shard'), lo.shard ? (lo.shardSpell ? t('spell.' + lo.shardSpell) : t('agh.pickSpell')) : t('agh.off'));
      aghSub.textContent = '';
      if (lo.scepter) {
        const need = !lo.scepterOrb;
        aghSub.appendChild(h('div', { class: 'row scorb' + (need ? ' need' : '') },
          h('span', { class: 'lbl', text: t('lo.scepterOrb') }),
          ORBS.map(k => h('button', { type: 'button', class: 'orbsel ' + k + (lo.scepterOrb === k ? ' on' : ''), onclick: () => { A.setScepterOrb(lo, k); changed(); }, 'data-tip': t('orb.' + k) }, icon(k)))));
        if (need) aghSub.appendChild(h('div', { class: 'warn', text: t('err.scepter') }));
      }
      if (lo.shard) {
        const need = !lo.shardSpell;
        aghSub.appendChild(h('div', { class: 'row shsp' + (need ? ' need' : '') },
          h('span', { class: 'lbl', text: t('lo.shardSpell') }),
          IT.Loadout.SHARD_SPELLS.map(s => h('button', {
            type: 'button', class: 'spsel' + (lo.shardSpell === s ? ' on' : ''), 'data-tip': t('spell.' + s) + ': ' + A.shardSpellTip(lo, s),
            onclick: () => { A.setShardSpell(lo, s); changed(); },
          }, icon(s)))));
        if (need) aghSub.appendChild(h('div', { class: 'warn', text: t('err.shard') }));
      }
    }

    // ---- items
    const itemBox = reg('items', 'items');
    function renderItems() {
      itemBox.textContent = '';
      const slots = h('div', { class: 'islots' });
      for (let i = 0; i < 6; i++) {
        const id = lo.items[i];
        slots.appendChild(h('button', {
          type: 'button', class: 'islot' + (id ? ' full' : ''), 'data-tip': id ? t('item.' + id) : t('lo.itemSlotN', { n: i + 1 }),
          onclick: () => { if (id) { lo.items.splice(i, 1); changed(); } },
        }, id ? icon(id) : null));
      }
      itemBox.appendChild(slots);
      const pool = h('div', { class: 'ipool' });
      for (const id of GM.ITEMS_MAIN.concat(GM.ITEMS_EXTRA)) {
        const on = lo.items.includes(id), full = !on && lo.items.length >= 6;
        pool.appendChild(h('button', {
          type: 'button', class: 'iopt' + (on ? ' on' : '') + (full ? ' dis' : ''), 'data-tip': full ? t('tip.itemsFull') : t('item.' + id),
          onclick: () => {
            if (on) lo.items = lo.items.filter(x => x !== id);
            else {
              if (lo.items.length >= 6) { flash(t('tip.itemsFull')); return; }
              if (IT.Loadout.BOOTS.includes(id)) lo.items = lo.items.filter(x => !IT.Loadout.BOOTS.includes(x));
              if (lo.items.length >= 6) { flash(t('tip.itemsFull')); return; }
              lo.items.push(id);
            }
            changed();
          },
        }, icon(id), h('span', { text: t('item.' + id) })));
      }
      itemBox.appendChild(pool);
    }

    // ---- dummy
    const dumBox = reg('dummy', 'dummy');
    function renderDummy() {
      dumBox.textContent = '';
      dumBox.appendChild(h('div', { class: 'row wrap' }, Object.keys(GM.DUMMY_PRESETS).map(p => h('button', {
        type: 'button', class: 'chipb' + (lo.preset === p ? ' on' : ''), 'data-tip': t('preset.' + p + '.d'), text: t('preset.' + p), onclick: () => { lo.preset = p; changed(); },
      }))));
      dumBox.appendChild(h('div', { class: 'row skins' }, GM.SKINS.map(s => h('button', {
        type: 'button', class: 'skin' + (lo.skin === s ? ' on' : ''), onclick: () => { lo.skin = s; changed(); },
      }, portrait(s), h('span', { text: GM.SKIN_NAMES[s] })))));
      dumBox.appendChild(h('div', { class: 'row cnt' },
        h('span', { class: 'lbl', text: t('lo.count') }),
        [1, 2, 3, 4, 5].map(n => h('button', { type: 'button', class: 'num' + (st.count === n ? ' on' : ''), text: n, onclick: () => { st.count = n; changed(); } }))));
    }

    // ---- enemy card (free play only): count 0-5, then one row per enemy (skin, behaviour, tier, items on/off) + the item set they carry
    const eneBox = reg('enemy', 'enemy');
    const EC = IT.EnemyCard;
    function renderEnemy() {
      eneBox.textContent = '';
      const en = st.enemy;
      if (st.scenario) { eneBox.appendChild(h('p', { class: 'fine', text: t('lo.enemy.scn') })); return; }
      eneBox.appendChild(h('div', { class: 'row cnt' }, h('span', { class: 'lbl', text: t('lo.enemy.count') }),
        [0, 1, 2, 3, 4, 5].map(n => h('button', { type: 'button', class: 'num' + (en.count === n ? ' on' : ''), text: n, onclick: () => { en.count = n; changed(); } }))));
      const sel = (opts, cur, on, cls) => h('select', { class: 'mapsel ' + (cls || ''), onchange: ev => on(ev.target.value) },
        opts.map(o => h('option', { value: o[0], selected: cur === o[0] ? true : null, text: o[1] })));
      for (let i = 0; i < en.count; i++) {
        const r = en.list[i];
        eneBox.appendChild(h('div', { class: 'erow' },
          h('span', { class: 'en', text: t('lo.enemy.row', { n: i + 1 }) }),
          IT.UI.tierBadge(r.tier),
          sel([[EC.AUTO, t('lo.enemy.skin.auto')]].concat(GM.SKINS.map(k => [k, GM.SKIN_NAMES[k]])), r.skin, v => { r.skin = v; changed(); }, 'sk'),
          sel(EC.BEHAVIORS.map(b => [b, t('lo.enemy.b.' + b)]), r.behavior, v => { r.behavior = v; changed(); }, 'bh'),
          sel(IT.DIFFICULTY.order.map(d => [d, t('diff.' + d)]), r.tier, v => { r.tier = v; changed(); }, 'tr'),
          h('label', { class: 'tog', 'data-tip': t('lo.enemy.hasItems.d') },
            h('input', { type: 'checkbox', checked: r.items ? true : null, onchange: ev => { r.items = ev.target.checked; changed(); } }),
            h('span', { class: 'box' }), h('span', { text: t('lo.enemy.hasItems') }))));
      }
      if (!en.count) { eneBox.appendChild(h('p', { class: 'fine', text: t('lo.enemy.hint') })); return; }
      eneBox.appendChild(h('div', { class: 'row wrap' }, h('span', { class: 'lbl', text: t('lo.enemy.itemset') }), GM.ENEMY_ITEMS.map(id => h('label', { class: 'tog' },
        h('input', { type: 'checkbox', checked: en.items.includes(id) ? true : null, onchange: ev => { en.items = en.items.filter(x => x !== id); if (ev.target.checked) en.items.push(id); changed(); } }),
        h('span', { class: 'box' }), h('span', { text: t('item.' + id) })))));
      eneBox.appendChild(h('p', { class: 'fine', text: t('lo.enemy.hint') }));
    }

    // ---- map (free play only; scenarios bring their own)
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
      if (st.scenario) { mapBox.appendChild(h('p', { class: 'fine', text: t('lo.map.scn') })); return; }
      const ML = (IT.Maps && IT.Maps.list) || [];
      if (!ML.length) return;
      const nm = m => (IT.hasT('map.' + m.id) ? t('map.' + m.id) : (m.name && m.name.en) || m.id);
      const sel = h('select', { class: 'mapsel', onchange: ev => { st.map = ev.target.value; changed(); } },
        ML.map(m => h('option', { value: m.id, selected: st.map === m.id ? true : null, text: nm(m) })));
      const cur = ML.find(m => m.id === st.map) || ML[0];
      mapBox.appendChild(h('div', { class: 'row' }, h('span', { class: 'lbl', text: t('lo.map') }), sel));
      const thumb = h('div', { class: 'mapthumb', 'data-map': cur.id });
      mapBox.appendChild(thumb); lazyThumb(thumb, cur.id);
      mapBox.appendChild(h('p', { class: 'fine', text: IT.hasT('map.' + cur.id + '.d') ? t('map.' + cur.id + '.d') : ((cur.blurb && cur.blurb.en) || '') }));
    }

    // ---- scenario (optional) + sandbox options
    const scnBox = reg('scenario', 'scenario');
    function avail() { try { return IT.Combo ? IT.Combo.available(lo, { grantMissing: st.grant }).length : -1; } catch (e) { return -1; } }
    function renderScenario() {
      scnBox.textContent = '';
      const list = scenarios();
      const opts = [{ id: null, name: t('lo.freePlay'), tip: t('lo.freePlay.d') }].concat(list.map(s => ({ id: s.id, name: scnName(s), tip: scnTip(s), lvl: s.level })));
      const sc = scnOf(st.scenario), EC2 = IT.EnemyCard;
      scnBox.appendChild(h('div', { class: 'row wrap scns' }, opts.map(o => h('button', {
        type: 'button', class: 'chipb' + (st.scenario === o.id ? ' on' : ''), 'data-tip': o.tip,
        onclick: () => { st.scenario = o.id; if (o.lvl) st.diff = EC2.tierOfLevel(o.lvl); changed(); },   // picking a scenario suggests the tier its level is aimed at
      }, o.lvl ? h('span', { class: 'lvb', text: String(o.lvl) }) : null, o.lvl ? IT.UI.tierBadge(EC2.tierOfLevel(o.lvl), { tip: t('lo.lvTier', { n: o.lvl, tier: t('diff.' + EC2.tierOfLevel(o.lvl)) }) }) : null, o.name))));
      if (sc) scnBox.appendChild(h('div', { class: 'row wrap tiers' }, h('span', { class: 'lbl', 'data-tip': t('lo.diff.d'), text: t('lo.diff') }),
        IT.DIFFICULTY.order.map(d => h('button', { type: 'button', class: 'chipb tierb' + (st.diff === d ? ' on' : ''), onclick: () => { st.diff = d; changed(); } }, IT.UI.tierBadge(d)))));
      if (!list.length) scnBox.appendChild(h('p', { class: 'fine', text: t('lo.noScenarios') }));
      const n = avail();
      if (n >= 0) scnBox.appendChild(h('p', { class: 'fine ' + (n ? 'ok' : 'warn'), text: n ? t('lo.combosAvail', { n }) : t('lo.noCombos') }));
      scnBox.appendChild(h('div', { class: 'row wrap' },
        h('label', { class: 'tog' }, h('input', { type: 'checkbox', checked: st.grant ? true : null, onchange: ev => { st.grant = ev.target.checked; changed(); } }), h('span', { class: 'box' }), h('span', { text: t('lo.grant') })),
        h('label', { class: 'tog' }, h('input', { type: 'checkbox', checked: st.fog ? true : null, onchange: ev => { st.fog = ev.target.checked; changed(); } }), h('span', { class: 'box' }), h('span', { text: t('lo.fog') }))));
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
      if (errs.length) goBox.appendChild(h('div', { class: 'warn' }, errs.map(e => h('div', { text: e }))));
      goBox.appendChild(h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn sm dim', text: t('ui.back'), onclick: () => IT.App.go('title') }),
        h('button', { type: 'button', class: 'btn big gold go' + (errs.length ? ' dis' : ''), text: t('ui.go'), 'data-tip': errs.length ? errs[0] : '', onclick: () => { const e2 = problems(); if (e2.length) { flash(e2[0]); return; } save(); IT.App.start(startOpts()); } })));
    }

    function all() { renderPts(); renderOrbs(); renderTalents(); renderAghs(); renderItems(); renderDummy(); renderEnemy(); renderMap(); renderScenario(); renderPrev(); renderGo(); }
    const sec = (title, ...kids) => h('section', { class: 'sec' }, h('h3', { text: title }), kids);

    const el = h('div', { class: 'scr loadout' },
      h('div', { class: 'lo-head' }, h('h1', { text: t('lo.title') }), IT.UI.langToggle()),
      h('div', { class: 'lo-grid' },
        h('div', { class: 'col' },
          sec(t('lo.level'), h('div', { class: 'lvl' }, h('span', { class: 'lv', text: 'Lv' }), lvlVal, slider), ptsBox),
          sec(t('lo.orbs'), orbBox),
          sec(t('lo.talents'), talBox),
          sec(t('lo.aghs'), aghBox)),
        h('div', { class: 'col' },
          sec(t('lo.items'), itemBox, h('p', { class: 'fine', text: t('lo.itemsHint') })),
          sec(t('lo.dummy'), dumBox),
          sec(t('lo.enemy'), eneBox),
          sec(t('lo.map'), mapBox),
          sec(t('lo.scenario'), scnBox)),
        h('div', { class: 'col' },
          sec(t('lo.preview'), prevBox),
          note, goBox)));
    all();
    return el;
  }

  function startOpts() {
    save();
    return { loadout: IT.Loadout.normalize(st.lo), mode: 'sandbox', count: st.count, fog: st.fog, grant: st.grant, scenario: scnOf(st.scenario) ? st.scenario : null, map: mapOk(st.map) ? st.map : 'grounds', diff: diffOk(st.diff) ? IT.DIFFICULTY.migrate(st.diff) : 'common', enemy: scnOf(st.scenario) ? null : normEnemy(st.enemy) };
  }

  load();
  IT.UI.LoadoutScreen = { state: st, build, startOpts, save, load, derived, trim };
})(typeof window !== 'undefined' ? window : globalThis);
