// Invoker spells. Slice: Cold Snap + Sun Strike. Phase 2 adds the rest. Pure. See CONTRACT.md.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const A = IT.Abilities, V = () => IT.Values;
  const val = (c, dota, k) => V().get(dota, k, c.ctx || null);

  // Cold Snap: freeze + damage now, re-freeze whenever the target takes >= damage_trigger damage (freeze_cooldown apart).
  A.def('coldsnap', {
    kind: 'spell', dota: 'invoker_cold_snap', target: 'unit',
    cast(w, c, o) {
      const t = w.get(o.target); if (!t) return;
      hookColdSnap(w);
      const D = 'invoker_cold_snap';
      const s = IT.Status.add(w, t, 'coldsnap', val(c, D, 'duration'), {
        src: c.id, ability: 'coldsnap',
        data: { freezeDur: val(c, D, 'freeze_duration'), freezeCd: val(c, D, 'freeze_cooldown'), dmg: val(c, D, 'freeze_damage'), trigger: val(c, D, 'damage_trigger'), next: 0 },
      });
      w.emit('hit', { src: c.id, target: t.id, ability: 'coldsnap' });
      if (s) freeze(w, t, s);
    },
  });

  function freeze(w, t, s) {
    const d = s.data;
    d.next = w.t + d.freezeCd;
    IT.Status.add(w, t, 'frozen', d.freezeDur, { src: s.src, ability: 'coldsnap' });
    w.emit('fx', { name: 'coldsnapFreeze', x: t.x, y: t.y, unit: t.id });
    if (IT.Combat) { d.inFreeze = true; IT.Combat.damage(w, { src: s.src, target: t, ability: 'coldsnap', type: 'magical', amount: d.dmg }); d.inFreeze = false; }
  }

  function hookColdSnap(w) {
    if (w._coldsnapHook) return;
    w._coldsnapHook = true;
    w.on('damage', p => {
      const t = w.get(p.target); if (!t) return;
      const s = IT.Status.find(t, 'coldsnap');
      if (!s || s.data.inFreeze || w.t < s.data.next || p.raw < s.data.trigger) return;
      freeze(w, t, s);
    });
  }

  // Sun Strike: global ground target, delay, pure damage split among units in the area, brief vision.
  A.def('sunstrike', {
    kind: 'spell', dota: 'invoker_sun_strike', target: 'point',
    range() { return Infinity; },
    cast(w, c, o) {
      const D = 'invoker_sun_strike';
      const delay = val(c, D, 'delay'), r = val(c, D, 'area_of_effect'), dmg = val(c, D, 'damage');
      w.emit('fx', { name: 'sunstrikeBeam', x: o.x, y: o.y, r, delay });
      w.thinker({
        x: o.x, y: o.y, r, color: '#fc4', team: c.team, ability: 'sunstrike',
        vision: val(c, D, 'vision_distance'), danger: { x: o.x, y: o.y, r, at: w.t + delay },
        upd(w, e) {
          if (e.age < delay - 1e-9) return false;
          const hit = w.query(u => u.team !== c.team && (u.kind === 'dummy' || u.kind === 'hero' || u.kind === 'spirit') && IT.U.dist(u, e) <= r + (u.radius || 0));
          w.emit('fx', { name: 'sunstrikeHit', x: e.x, y: e.y, r });
          if (!hit.length) w.emit('miss', { src: c.id, ability: 'sunstrike', x: e.x, y: e.y });
          for (const u of hit) {
            w.emit('hit', { src: c.id, target: u.id, ability: 'sunstrike', blind: !u.visible });
            if (IT.Combat) IT.Combat.damage(w, { src: c.id, target: u, ability: 'sunstrike', type: 'pure', amount: dmg / hit.length });
          }
          return true;
        },
      });
    },
  });

  IT.Spells = { freezeColdSnap: freeze };
})(typeof window !== 'undefined' ? window : globalThis);
