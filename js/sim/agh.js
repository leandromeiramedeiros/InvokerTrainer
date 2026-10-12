// Aghanim's Scepter / Shard picker logic (pure, no DOM). Used by the loadout hood picker (js/ui/loadout.js) and its tests.
// State changes only touch the loadout fields scepter / scepterOrb / shard / shardSpell (same shape as IT.Loadout.normalize).
// Effect lines come from the baked Dota KV through IT.Values: { k: i18n key, v: vars } -> IT.t(k, v).
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const ORBS = ['quas', 'wex', 'exort'];
  const fmt = n => String(Math.round((Number(n) || 0) * 100) / 100);

  function setScepter(lo, on) { lo.scepter = !!on; if (!on) lo.scepterOrb = null; return lo; }
  function setScepterOrb(lo, k) { if (ORBS.indexOf(k) >= 0) { lo.scepter = true; lo.scepterOrb = k; } return lo; }
  function setShard(lo, on) { lo.shard = !!on; if (!on) lo.shardSpell = null; return lo; }
  function setShardSpell(lo, s) { if (IT.Loadout.SHARD_SPELLS.indexOf(s) >= 0) { lo.shard = true; lo.shardSpell = s; } return lo; }

  const ctxOf = (lo, o) => IT.Values.ctx(Object.assign({}, lo, o));

  // what the Scepter does in this build (KV numbers at the loadout's orb levels)
  function scepterLines(lo) {
    const V = IT.Values, S = IT.GAME.SPELL_DOTA, R = IT.RULES;
    const c = ctxOf(lo, { scepter: true, scepterOrb: lo.scepterOrb || 'quas' }), c0 = ctxOf(lo, { scepter: false, scepterOrb: null });
    return [
      { k: 'agh.sc.orb', v: { n: fmt(V.get('invoker_quas', 'scepter_bonus_levels', c)) } },
      { k: 'agh.sc.invoke', v: { n: fmt(R.invokeCooldown(3, false) - R.invokeCooldown(3, true)) } },
      { k: 'agh.sc.tornado', v: { dmg: fmt(V.get(S.tornado, 'twister_damage', c)), dur: fmt(V.get(S.tornado, 'twister_duration', c)) } },
      { k: 'agh.sc.sunstrike', v: { n: fmt(V.get(S.sunstrike, 'cataclysm_count', c)), pct: fmt(V.get(S.sunstrike, 'cataclysm_damage_pct', c)), cd: fmt(V.get(S.sunstrike, 'cataclysm_cooldown', c)) } },
      { k: 'agh.sc.icewall', v: { from: fmt(V.get(S.icewall, 'wall_width', c0)), to: fmt(V.get(S.icewall, 'wall_width', c)) } },
    ];
  }

  // what the Shard does to one spell
  function shardLine(lo, spell) {
    const V = IT.Values, S = IT.GAME.SPELL_DOTA, c = ctxOf(lo, { shard: true, shardSpell: spell }), c0 = ctxOf(lo, { shard: false, shardSpell: null });
    if (spell === 'ghostwalk') return { k: 'agh.sh.ghostwalk', v: { dps: fmt(V.get(S.icewall, 'damage_per_second', c)) } };
    if (spell === 'emp') return { k: 'agh.sh.emp', v: { pct: fmt(V.get(S.emp, 'damage_per_mana_pct', c)), base: fmt(V.get(S.emp, 'damage_per_mana_pct', c0)), drag: fmt(V.get(S.emp, 'drag_speed', c)) } };
    if (spell === 'sunstrike') return { k: 'agh.sh.sunstrike', v: {} };
    return null;
  }

  // tooltip text (multi-line)
  function scepterTip(lo) { return [IT.t('agh.scepter.tip')].concat(scepterLines(lo).map(l => '- ' + IT.t(l.k, l.v))).join('\n'); }
  function shardTip(lo) {
    return [IT.t('agh.shard.tip')].concat(IT.Loadout.SHARD_SPELLS.map(s => { const l = shardLine(lo, s); return '- ' + IT.t(l.k, l.v); })).join('\n');
  }
  function shardSpellTip(lo, s) { const l = shardLine(lo, s); return l ? IT.t(l.k, l.v) : ''; }

  IT.Agh = { ORBS, setScepter, setScepterOrb, setShard, setShardSpell, scepterLines, shardLine, scepterTip, shardTip, shardSpellTip };
})(typeof window !== 'undefined' ? window : globalThis);
