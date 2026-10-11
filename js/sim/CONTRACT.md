# Sim contract

Everything under `js/sim/` is pure: no DOM, canvas, audio, `window` or `localStorage`. Files are classic scripts:

```js
(function (G) { 'use strict'; const IT = G.IT = G.IT || {}; /* ... */ IT.Foo = Foo; })(typeof window !== 'undefined' ? window : globalThis);
```

Tests load them with `require('./_load.js')([...paths])` → `IT` (see `tests/_load.js`), run with `node --test tests/`.

## Units and time
- Positions/distances are **Dota units** (`x` right, `y` down). Render divides by `IT.GAME.UNIT_PX` (6).
- Angles in radians, `0` = east (+x), `π/2` = south (+y).
- Sim steps at a fixed `dt = 1/30` s. `world.t` = sim seconds. Never read wall-clock time in the sim.
- Randomness only via `world.rng()` (seeded mulberry32), so tests are deterministic.

## Script load order
`data/dota.js, data/rules.js, data/game.js, data/map.js, data/i18n.js` → `sim/util.js, sim/values.js, sim/world.js, sim/status.js, sim/abilities.js, sim/combat.js, sim/nav.js, sim/vision.js, sim/loadout.js, sim/hero.js, sim/invoke.js, sim/orders.js, sim/units.js, sim/spells.js, sim/items.js, sim/combo.js, sim/stats.js` → `art/*.js, render/*.js, ui/*.js, audio.js, input.js, main.js`.

## World (`js/sim/world.js`)
```
const w = IT.World.create({ seed, map, loadout, fog:true })
w.t, w.tick, w.dt, w.rng(), w.ents (array), w.byId (Map), w.hero, w.map, w.loadout, w.ctx (IT.Values ctx)
w.add(ent) -> ent            // assigns id, emits 'spawn'
w.remove(ent)                // marks ent.dead = true, removed at end of step, emits 'despawn'
w.get(id)
w.emit(type, payload)        // payload gets {t: w.t}; listeners called synchronously; also appended to w.log (last 600 events)
w.on(type | '*', fn) -> off()
w.step()                     // runs systems in ascending `order`, then t += dt, tick++
w.query(fn) -> ents          // filter alive ents
w.thinker(def) -> ent        // kind:'thinker' ent with def.upd(w, ent, dt) returning true when done
IT.World.system(name, order, fn(w, dt))   // global registry; modules register at load time
```
System order slots (leave gaps): `10` input/orders, `20` movement, `30` attacks, `40` thinkers/projectiles, `50` statuses/regen, `60` AI, `70` vision, `90` combo/stats bookkeeping.

## Entity
```
{ id, kind:'hero'|'dummy'|'spirit'|'thinker'|'proj', team: 0 (player) | 1 (enemy),
  x, y, z (height, lift), facing, radius (hull, units), dead,
  hp, maxHp, mana, maxMana, hpRegen, manaRegen, armor, magicRes (0..1), ms, turnRate,
  vision (radius, units; 0 = none), visible (bool: seen by team 0 this vision tick), lastSeen {x,y,t},
  attack: { min, max, bat, point, range, projSpeed, next (s until ready), target (id|null) } | null,
  statuses: [ { type, until, src, ability, data } ],
  orders: [order...]          // orders[0] is current; empty = idle
  path: [{x,y}...]            // current nav path
  anim: { name:'idle'|'walk'|'cast'|'attack'|'stunned'|'blink', t }   // set by sim, read by render
  skin, name (label), ai: {...} (dummy behavior state), owner (id) }
```
Hero extra: `inv: { orbs:['Q','W','E'], slots:[id|null,id|null], invokeCd }`, `cd: { abilityId: secondsLeft }`, `items: [ { id, cd, charges } | null ] ×6`, `ctx` (Values ctx).

## Statuses (`IT.Combat.status`, helpers in `IT.Status`)
Types: `stun, frozen (Cold Snap mini-stun), root, hex, lift (Tornado/cyclone: invulnerable, can't act), slow (data.pct 0..1 move slow), disarm, silence, magicImmune (BKB), coldsnap (data: {nextFreeze, freezeDur, dmg, cdLeft}), ghost (invis), channel, knockback (data: {vx,vy}), atosRoot`.
- `IT.Status.has(e, type)`, `IT.Status.add(w, e, type, dur, {src, ability, data})`, `IT.Status.remove(w, e, type)`.
- Derived: `IT.Status.canAct(e)` (not stun/frozen/hex/lift), `canMove(e)` (canAct && not root), `canCast(e)` (canAct && not silence/hex), `canAttack(e)` (canAct && not disarm/hex).
- Stun / hex / lift clear `orders` (and cancel channel).

## Damage (`IT.Combat`)
```
IT.Combat.damage(w, { src, target, ability, type:'physical'|'magical'|'pure', amount, flags }) -> dealt
  physical × (1 − 0.06a/(1+0.06|a|)); magical × (1 − magicRes) and 0 vs magicImmune; pure unchanged.
  emits 'damage' { src, target, ability, type, raw, dealt, prevented }
IT.Combat.heal(w, e, amount)
```

## Abilities (`js/sim/abilities.js`)
Spells and items register one def each; the order system drives them.
```
IT.Abilities.def(id, {
  kind: 'spell'|'item', dota: 'invoker_sun_strike' | 'item_blink',
  target: 'none'|'point'|'unit',      // unit targets: filter(w, caster, ent) -> bool (default: enemy, visible, alive, not lifted)
  range(w, caster) -> units (Infinity for global), castPoint(w, caster), manaCost(w, caster), cooldown(w, caster)  // defaults read IT.Values via `dota`
  channel?(w, caster) -> seconds,
  cast(w, caster, order),             // fires at end of cast point; spawn thinkers/projectiles here
  channelTick?(w, caster, dt, order), channelEnd?(w, caster, order, interrupted),
  passive?(w, caster, dt),            // items like boots
  canUse?(w, caster, order) -> null | reasonKey   // extra veto (e.g. blink after damage)
})
IT.Abilities.get(id); IT.Abilities.check(w, caster, id, target) -> null | reasonKey   // 'notInvoked','cooldown','mana','silenced','noTarget','targetHidden','targetInvalid'
```
Spell ids: `coldsnap ghostwalk icewall emp tornado alacrity sunstrike forgespirit chaosmeteor deafeningblast`. Item ids: `refresher atos vyse shiva meteorhammer bkb blink treads travels boots scepter shard`. Orbs: `quas wex exort` (keys Q W E), invoke = `invoke`.

## Orders (`js/sim/orders.js`)
```
order = { type:'move'|'attack'|'cast'|'stop'|'hold', x, y, target (id), ability (id), queued }
IT.Orders.issue(w, unit, order)   // queued=false replaces queue (cancels channel); queued=true appends
```
Casting flow: validate (skip invalid queued orders with 'orderDone' ok:false) → walk into range (path) → turn to within ~11.5° → cast point → `check` again → spend mana, set cooldown, emit `'cast'` → `def.cast` → channel if any → `'orderDone'`.

## Events (payload fields; all also get `t`)
| type | payload |
|---|---|
| `orb` | `{ unit, orb:'Q'|'W'|'E' }` |
| `invoke` | `{ unit, spell, swapped }` |
| `fail` | `{ unit, reason }` (i18n key) |
| `order` | `{ unit, order }` |
| `orderDone` | `{ unit, order, ok }` |
| `castStart` | `{ unit, ability, order }` |
| `cast` | `{ unit, ability, kind, x, y, target }` |
| `hit` | `{ src, target, ability }` (a spell/attack/item effect touched an enemy) |
| `miss` | `{ src, ability, x, y }` (resolved without touching any enemy) |
| `damage` | `{ src, target, ability, dmgType, raw, dealt, prevented }` |
| `status` / `statusEnd` | `{ target, status, dur, src, ability }` |
| `attack` / `attackHit` | `{ src, target }` |
| `spawn` / `despawn` | `{ ent }` |
| `blink` | `{ unit, fromX, fromY, x, y }` |
| `bolt` | `{ unit, phase:'start'|'hit'|'cancel'|'blocked', target, reason }` |
| `refill` | `{ unit }` |
| `fx` | `{ name, x, y, ...}` purely visual cue for render/audio |

`src`, `unit`, `target` are entity **ids**.
