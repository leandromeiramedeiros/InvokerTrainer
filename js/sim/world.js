// World: entities, fixed-step systems, event bus. Pure. See CONTRACT.md.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const systems = [];
  const LOG_MAX = 600;

  function system(name, order, fn) {
    const i = systems.findIndex(s => s.name === name);
    if (i >= 0) systems.splice(i, 1);
    systems.push({ name, order, fn });
    systems.sort((a, b) => a.order - b.order);
  }

  function create(opts) {
    opts = opts || {};
    const listeners = new Map();
    let nextId = 1;
    const w = {
      t: 0, tick: 0, dt: 1 / 30,
      rng: IT.U.mulberry32(opts.seed == null ? 1 : opts.seed),
      ents: [], byId: new Map(), hero: null,
      map: opts.map || null, loadout: opts.loadout || null, ctx: null,
      fog: opts.fog !== false, log: [], paused: false, opts,
      tod: IT.DayNight ? IT.DayNight.make(opts.tod) : null,   // v6 time of day { night, t, len, ... } (js/data/daynight.js)
      add(e) {
        e.id = nextId++;
        e.statuses = e.statuses || [];
        e.orders = e.orders || [];
        e.path = e.path || [];
        e.anim = e.anim || { name: 'idle', t: 0 };
        if (e.z == null) e.z = 0;
        if (e.facing == null) e.facing = Math.PI / 2;
        w.ents.push(e); w.byId.set(e.id, e);
        w.emit('spawn', { ent: e.id });
        return e;
      },
      remove(e) { if (!e.dead) { e.dead = true; w.emit('despawn', { ent: e.id }); } },
      get(id) { const e = w.byId.get(id); return e && !e.dead ? e : null; },
      query(fn) { return w.ents.filter(e => !e.dead && (!fn || fn(e))); },
      on(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
        return () => { const a = listeners.get(type); const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
      },
      emit(type, p) {
        p = p || {};
        // p.ev = event name (always). p.type = name too, unless the payload carries its own `type` (re-emitted payloads don't count)
        if (p.type === undefined || p.type === p.ev) p.type = type;
        p.ev = type; p.t = w.t;
        w.log.push(p); if (w.log.length > LOG_MAX) w.log.shift();
        const a = listeners.get(type); if (a) for (const fn of a.slice()) fn(p, w);
        const b = listeners.get('*'); if (b) for (const fn of b.slice()) fn(p, w);
        return p;
      },
      thinker(def) {
        def.kind = def.kind || 'thinker';
        def.team = def.team == null ? 0 : def.team;
        def.age = 0;
        return w.add(def);
      },
      step() {
        if (w.paused) return;
        const dt = w.dt;
        for (const s of systems) s.fn(w, dt);
        if (w.ents.some(e => e.dead)) {
          w.ents = w.ents.filter(e => !e.dead);
          for (const [id, e] of w.byId) if (e.dead) w.byId.delete(id);
        }
        w.tick++;
        w.t = w.tick * dt;
      },
    };
    return w;
  }

  // v6 day / night: advance w.tod, then every unit's vision radius follows it (before stats 15 and vision 70)
  system('daynight', 1, (w, dt) => { if (IT.DayNight) IT.DayNight.tick(w, dt); });

  // Thinkers/projectiles: def.upd(w, ent, dt) -> true when finished.
  system('thinkers', 40, (w, dt) => {
    for (const e of w.ents) {
      if (e.dead || !e.upd || (e.kind !== 'thinker' && e.kind !== 'proj')) continue;
      e.age += dt;
      if (e.upd(w, e, dt)) w.remove(e);
    }
  });

  IT.World = { create, system, systems };
})(typeof window !== 'undefined' ? window : globalThis);
