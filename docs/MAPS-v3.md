# v3 wave 3 contract: maps, towers, ranked variety

User request: >=20 small maps carved from Dota 2 regions (same scale as today's 180x100-tile training map, 48 units/tile,
6 units/px), blue walkable rivers, high ground, allied/enemy towers (static, ground vision only, attack), map picker in the
sandbox loadout, maps chosen intelligently per scenario, ranked stage order randomized but difficulty-progressive with 1-2
"twists" per stage, more combo variety.

Line endings: check each file (`file x.js`). CRLF files must stay CRLF (edit via Python normalize `\r\n`->`\n` ... restore,
or the Edit tool which preserves them). No build step, classic IIFE scripts on `IT`. Sim stays pure (no DOM).
Tests: `node --test tests/*.test.js` must stay green (244 now). Never commit (orchestrator commits).

## Dota numbers (dota2.fandom.com/wiki/Buildings)
| | T1 | T2 | T3 | T4 |
|---|---|---|---|---|
| HP | 1800 | 2500 | 2500 | 2600 |
| Armor | 12 | 16 | 16 | 21 |
| Damage | 88-92 | 170-174 | 170-174 | 170-174 |
- Attack interval 0.9 s (100 / 191 DPS), range 700 (+ target hull), projectile speed 750, vision 1900 (ground, blocked by
  trees and higher ground; NO flying vision), True Sight aura 700 (reveals Ghost Walk), Tower Protection aura 900 to allied
  heroes: armor +3/+5/+5/+5, HP regen +1/+3/+3/+3 per s.
- Reinforced: hero attacks deal 50% less to buildings, non-hero attacks 30% less, player-controlled summons a further 10% less.
  Buildings are immune to most abilities (spells deal 0 and apply no statuses; Meteor Hammer is the exception).
- Attack priority: keep the current target until it dies, leaves range or becomes unattackable. Then pick:
  1 closest enemy attacking the tower, 2 closest enemy attacking an ally of the tower, 3 closest enemy.
  Aggro: an enemy hero issuing an attack order on a hero allied to the tower within 500 of the tower makes it switch at once.
  De-aggro: if the current target attack-orders one of its own allies, the tower re-picks (at most once per 2.5 s).
  An attack already launched always lands.
- Buildings are always visible through fog to both teams once on the map.

## Map API (owner A: js/data/map.js, js/data/maps.js)
```
IT.Maps.list            -> [{ id, name:{en,pt}, blurb:{en,pt}, tags:[...] }]   cheap metadata, >= 20 entries, list[0].id === 'grounds'
IT.Maps.ids()           -> [id]
IT.Maps.get(id)         -> built map (cached per id; unknown id -> 'grounds'). Same shape as IT.Map.build() plus:
   map.id, map.tags
   map.elev   Uint8Array(w*h): 0 low ground (river), 1 ground, 2 high ground
   map.elevAt(x, y)      world units -> 0..2 (out of bounds 1)
   map.towers [{ x, y (world units), team 0|1, tier 1..4 }]
   map.spawns.hero {x,y}, map.spawns.dummies [{x,y}] (>= 8 open spots, 5x5 clear, reachable from hero spawn)
IT.Maps.thumb(id, w, h) -> canvas (browser only) small tile-colour preview incl. tower dots, cached
```
Tile codes: 0 grass, 1 tree, 2 rock/cliff, 3 deep water (blocks move), 4 dirt, **5 river (walkable, shallow, blue)**,
**6 structure footprint (blocks move, not sight)**: 3x3 tiles around every tower tile. `walkableTile` = 0, 4, 5.
`blocksSight` (tile only) = 1, 2. Elevation blocking lives in vision.js.

## Vision API (owner A: js/sim/vision.js)
- Viewer elevation = `map.elevAt(viewer)`. Tiles with elev > viewer elev are opaque AND not revealed. Trees/rocks as today.
- `los(map, ax, ay, bx, by)` uses the elevation at (ax, ay).
- `trueSighted(w, team, target)` -> any alive ent of `team` with `trueSight > 0` within that radius of target.
- `canSee(w, viewer, target)`: ghost/invisible targets only if `trueSighted(w, viewer.team, target)`.
- `teamSees(w, team, target)` -> any alive ent of `team` with vision > 0 that canSee target (buildings included).
- `update(w)`: team-0 sources include allied towers (they have `vision`). Buildings (`e.building`) are always `visible`.

## Render API (owner A: render.js, camera.js, terrain.js, fog.js)
- `R.setMap(map)` rebuilds terrain, fog, minimap tables for a new map on the same world. `cam.setMap(map)` re-clamps.
- River tiles render blue (shallow, lighter than deep water, animated); high ground lighter/warmer grass, low ground darker;
  cliffs (rock between elevations) with face shading; ramps read clearly.
- render.js y-sorts `kind === 'tower'` ents with units/trees and calls `IT.TowerDraw.draw(R, e, sx, sy)` (sx, sy = screen px
  of the base centre). Minimap: towers as 3x3 squares, green allied / red enemy, always drawn (also in fog), grey if destroyed.

## Towers API (owner B: js/sim/towers.js, js/render/towers.js)
```
IT.Towers.TIERS          { 1:{hp,armor,min,max}, ... }
IT.Towers.spawn(w, { x, y, team, tier }) -> ent
IT.Towers.spawnAll(w, map) -> ents   (map.towers; callers: main.js world creation, ranked.apply after clearing ents)
ent = { kind:'tower', building:true, team, tier, x, y, radius:72, hp, maxHp, armor, magicRes:0, ms:0, vision:1900,
        trueSight:700, attack:{ min, max, bat:0.9, point:0, range:700, projSpeed:750, next, target }, statuses:[], ... }
events: 'towerAttack' {unit, target}, 'towerDown' {unit, team, tier, by}
```
- Damage gate in combat.js: buildings only take attack damage (and Meteor Hammer) with Reinforced reductions.
- status.js: `Status.add` on a building is refused. Unit-target spells on buildings fail with reason 'building'.
- Dummy AI awareness uses `IT.Vision.teamSees(w, 1, hero)` (enemy towers give dummies vision).
- Hero death to a tower: combat.js already emits 'heroDown' and refills; ranked fails the stage with reason 'died'.
- `IT.TowerDraw.draw(R, e, sx, sy)` pixel-art Radiant (allied) / Dire (enemy) towers, HP bar, rubble when destroyed,
  attack range ring when the hero is near; projectile `fx:'tower'` drawn in fx.js with a light.

## Ranked / scenarios / UI (owner C)
- Scenario def gains `maps:[ids]` (preferred maps, first = default) and may use towers (`obj` types: 'kill', 'escape',
  'rootAll', new 'destroyTower', fail reason 'died').
- Ranked: stage plan per run (seeded): shuffled inside tiers, never more than one tier step back, difficulty ramp kept;
  each stage gets a map from `sc.maps` and 1-2 twists (dummy angle/distance jitter, +1 dummy, fog, hp, motion, timer,
  map swap, dummy BKB) valid for that scenario and difficulty. HUD shows map name + twists.
- main.js: world built with `IT.Maps.get(id)`, towers spawned, map swap between stages via `R.setMap` / `cam.setMap`.
- Loadout (sandbox): map picker with thumbnails (`IT.Maps.thumb`), 'Auto' when a scenario is chosen.

## i18n files
A: js/data/i18n/m1.js, B: js/data/i18n/m2.js, C: js/data/i18n/m3.js (format: `IT.i18nAdd({ en:{...}, pt:{...} })`, PT-BR).
