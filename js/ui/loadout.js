// Loadout screen (SANDBOX). State persisted in localStorage 'it2.loadout'. IT.UI.LoadoutScreen = { state, build, startOpts, save, load, derived, trim }.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const KEY = 'it2.loadout';
  const ORBS = ['quas', 'wex', 'exort'];
  const ORBK = { quas: 'Q', wex: 'W', exort: 'E' };

  const st = { lo: null, count: 1, fog: true, grant: true, scenario: null, map: 'grounds', enemy: { count: 0, behavior: 'stationary', items: [] } };
  const EBEH = ['stationary', 'wander', 'escape', 'disable_escape', 'defend'];
  function normEnemy(e) {
    e = e || {};
    const EI = (IT.GAME && IT.GAME.ENEMY_ITEMS) || [];
    return { count: Math.max(0, Math.min(3, e.count | 0)), behavior: EBEH.includes(e.behavior) ? e.behavior : 'stationary', items: Array.isArray(e.items) ? e.items.filter(i => EI.includes(i)) : [] };
  }

  const scenarios = () => IT.SCENARIOS || [];
  const scnOf = id => (id == null ? null : scenarios().find(s => s.id === id) || null);
  const scnName = s => (s.name && typeof s.name === 'object' ? (s.name[IT.lang] || s.name.en) : s.name) || IT.t(s.nameKey || ('scn.' + s.id));
  const scnTip = s => (s.descKey ? IT.t(s.descKey) : ((s.desc || s.tip) && (s.desc || s.tip)[IT.lang || 'en'] || (s.desc || s.tip || {}).en || ''));

  const mapOk = id => !!(id && IT.Maps && IT.Maps.ids && IT.Maps.ids().indexOf(id) >= 0);
  function fresh() {
    st.lo = IT.Loadout.normalize(Object.assign(IT.Loadout.default(), { mode: 'sandbox' }));
    st.count = 1; st.fog = true; st.grant = true; st.scenario = null; st.map = 'grounds'; st.enemy = normEnemy();
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
    st.map = mapOk(raw.map) ? raw.map : 'grounds';
  }
  function save() {
    st.lo.mode = 'sandbox';
    try { G.localStorage.setItem(KEY, JSON.stringify({ lo: st.lo, count: st.count, fog: st.fog, grant: st.grant, scenario: st.scenario, map: st.map, enemy: st.enemy })); } catch (e) { /* ignore */ }
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

    // ---- aghs: one toggle per item; scepter -> orb pick, shard -> spell pick
    const aghBox = reg('aghs', 'aghs');
    function renderAghs() {
      aghBox.textContent = '';
      aghBox.appendChild(h('div', { class: 'row agh-row' },
        h('button', {
          type: 'button', class: 'agh' + (lo.scepter ? ' on' : ''), 'data-tip': t('agh.scepter'),
          onclick: () => { lo.scepter = !lo.scepter; if (!lo.scepter) lo.scepterOrb = null; changed(); },
        }, icon('scepter', 'mini')),
        h('button', {
          type: 'button', class: 'agh' + (lo.shard ? ' on' : ''), 'data-tip': t('agh.shard'),
          onclick: () => { lo.shard = !lo.shard; if (!lo.shard) lo.shardSpell = null; changed(); },
        }, icon('shard', 'mini'))));
      if (lo.scepter) {
        const need = !lo.scepterOrb;
        aghBox.appendChild(h('div', { class: 'row scorb' + (need ? ' need' : '') },
          h('span', { class: 'lbl', text: t('lo.scepterOrb') }),
          ORBS.map(k => h('button', { type: 'button', class: 'orbsel ' + k + (lo.scepterOrb === k ? ' on' : ''), onclick: () => { lo.scepterOrb = k; changed(); }, 'data-tip': t('orb.' + k) }, icon(k)))));
        if (need) aghBox.appendChild(h('div', { class: 'warn', text: t('err.scepter') }));
      }
      if (lo.shard) {
        const need = !lo.shardSpell;
        aghBox.appendChild(h('div', { class: 'row shsp' + (need ? ' need' : '') },
          h('span', { class: 'lbl', text: t('lo.shardSpell') }),
          IT.Loadout.SHARD_SPELLS.map(s => h('button', {
            type: 'button', class: 'spsel' + (lo.shardSpell === s ? ' on' : ''), 'data-tip': t('spell.' + s) + ': ' + t('shard.' + s),
            onclick: () => { lo.shardSpell = s; changed(); },
          }, icon(s)))));
        if (need) aghBox.appendChild(h('div', { class: 'warn', text: t('err.shard') }));
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

    // ---- enemy (free play only)
    const eneBox = reg('enemy', 'enemy');
    function renderEnemy() {
      eneBox.textContent = '';
      const en = st.enemy;
      if (st.scenario) { eneBox.appendChild(h('p', { class: 'fine', text: t('lo.enemy.scn') })); return; }
      eneBox.appendChild(h('div', { class: 'row cnt' }, h('span', { class: 'lbl', text: t('lo.enemy.count') }),
        [0, 1, 2, 3].map(n => h('button', { type: 'button', class: 'num' + (en.count === n ? ' on' : ''), text: n, onclick: () => { en.count = n; changed(); } }))));
      if (!en.count) return;
      eneBox.appendChild(h('div', { class: 'row wrap' }, EBEH.map(b => h('button', {
        type: 'button', class: 'chipb' + (en.behavior === b ? ' on' : ''), text: t('lo.enemy.b.' + b), onclick: () => { en.behavior = b; changed(); },
      }))));
      eneBox.appendChild(h('div', { class: 'row wrap' }, GM.ENEMY_ITEMS.map(id => h('label', { class: 'tog' },
        h('input', { type: 'checkbox', checked: en.items.includes(id) ? true : null, onchange: ev => { en.items = en.items.filter(x => x !== id); if (ev.target.checked) en.items.push(id); changed(); } }),
        h('span', { class: 'box' }), h('span', { text: t('item.' + id) })))));
    }

    // ---- map (free play only; scenarios bring their own)
    const mapBox = reg('map', 'mapbox');
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
      mapBox.appendChild(h('p', { class: 'fine', text: IT.hasT('map.' + cur.id + '.d') ? t('map.' + cur.id + '.d') : ((cur.blurb && cur.blurb.en) || '') }));
    }

    // ---- scenario (optional) + sandbox options
    const scnBox = reg('scenario', 'scenario');
    function avail() { try { return IT.Combo ? IT.Combo.available(lo, { grantMissing: st.grant }).length : -1; } catch (e) { return -1; } }
    function renderScenario() {
      scnBox.textContent = '';
      const list = scenarios();
      const opts = [{ id: null, name: t('lo.freePlay'), tip: t('lo.freePlay.d') }].concat(list.map(s => ({ id: s.id, name: scnName(s), tip: scnTip(s) })));
      scnBox.appendChild(h('div', { class: 'row wrap scns' }, opts.map(o => h('button', {
        type: 'button', class: 'chipb' + (st.scenario === o.id ? ' on' : ''), 'data-tip': o.tip, text: o.name,
        onclick: () => { st.scenario = o.id; changed(); },
      }))));
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
    return { loadout: IT.Loadout.normalize(st.lo), mode: 'sandbox', count: st.count, fog: st.fog, grant: st.grant, scenario: scnOf(st.scenario) ? st.scenario : null, map: mapOk(st.map) ? st.map : 'grounds', enemy: scnOf(st.scenario) ? null : normEnemy(st.enemy) };
  }

  load();
  IT.UI.LoadoutScreen = { state: st, build, startOpts, save, load, derived, trim };
})(typeof window !== 'undefined' ? window : globalThis);
