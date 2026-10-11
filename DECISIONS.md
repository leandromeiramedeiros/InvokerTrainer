# Decisions

## Leveling rules (patch 7.41f era)

Sources: KV = https://raw.githubusercontent.com/SteamDatabase/GameTracking-Dota2/master/game/dota/pak01_dir/scripts/npc/heroes/npc_dota_hero_invoker.txt ; LP = https://liquipedia.net/dota2/ (Invoker, Experience, Abilities, Talents, Attributes) ; PN = https://www.dota2.com/datafeed/patchnotes?version=X&language=english

| Rule | Source | Confidence |
|---|---|---|
| Hero levels 1..30; each level grants 1 ability point (level 1 starts with 1) | LP Experience, Abilities | high |
| Invoke is innate, MaxLevel 1, not learnable | KV `invoker_invoke` (Innate=1, NOT_LEARNABLE) | high |
| Invoke grants +1 extra ability point at hero levels 6/12/18 (KV `first/second/third_ability_level`) | PN 7.41b, LP Invoker | high |
| Cumulative points at level L = L + (L>=6) + (L>=12) + (L>=18); 33 at L30 | derived | high |
| Orb MaxLevel 8 (spent points); 7.41 raised 7 to 8 | KV, PN 7.41 | high |
| Scepter (7.41): inert until activated, +1 current and max level to ONE chosen orb (max 9); free, no point spent. Shard: no level effect | PN 7.41, KV `scepter_bonus_levels` | high |
| Orb level n requires hero level 2n-1 (1,3,5,7,9,11,13,15); no override in KV, default basic-ability rule | KV (no RequiredLevel/LevelsBetweenUpgrades on orbs), LP Abilities table | medium (LP also says restriction "removed at hero level 14", unverified; not applied) |
| 24 orb points reachable by hero level 21 (24 points) if gates allow; gate-bound: 8/8/8 legal from 21 | derived | high |
| Invoker has no Attribute Bonus (KV defines `invoker_attribute_bonus` RequiredLevel 25 but it is not in the hero's ability slots) | LP Attributes, KV Ability1..25 | medium-high; irrelevant to orbs (surplus points) |
| Talents need no skill point since 7.40; own talent points at levels 10,15,20,25,27,28,29,30. First pick of tier i at 10/15/20/25; the other talent of tier i unlocks at 27/28/29/30 | PN 7.40 general notes, LP Talents/Experience | high (tier-to-level mapping of 27-30 from LP: medium-high) |
| Facets deprecated in KV; ignored | KV Facets `Deprecated` | high |

### Talents (KV slots Ability17..24, odd=right/even=left; matches LP left/right)

| Tier | Left | Right |
|---|---|---|
| 10 | `special_bonus_unique_invoker_3` (-5s Tornado CD) | `special_bonus_unique_invoker_ice_wall_dps` (+50 Ice Wall DPS) |
| 15 | `special_bonus_unique_invoker_9` (-6s Cold Snap CD) | `special_bonus_unique_invoker_5` (+25 Alacrity dmg/speed) |
| 20 | `special_bonus_unique_invoker_forged_spirit_armor_reduction` (+50% armor reduction) | `special_bonus_unique_invoker_additional_chaos_meteors` (+2 meteors) |
| 25 | `special_bonus_unique_invoker_13` (2x orb active bonuses) | `special_bonus_unique_invoker_2` (radial Deafening Blast) |

### Auto build
Heuristic QE/QW mid orb orders in `js/data/rules.js` (not from a verified guide): low confidence, tweak freely.

### Loadout validation extension
`scepter: true` requires `scepterOrb` ('quas'|'wex'|'exort'); `scepter` may also be the orb name.

## Map / nav / vision
- Map: 180x100 tiles of 48 units, generated deterministically in `js/data/map.js` (seeded mulberry32, value noise forest, central elliptical clearing ~2300x1600 units with groves and lone trees for cover, 8 lanes + 5 side corridors carved with dirt centre lines, sinuous river north (y~17) with fords where lanes cross, rock border and outcrops). `IT.MAPDEF.rows` are ASCII (`.` grass `T` tree `#` rock `~` water `,` dirt). 10 dummy spawns snapped to 5x5-clear open ground.
- Nav: A* 8-dir, no corner cutting, +0.4 cost on tiles next to blockers, string-pull with `lineWalkable(radius)`. `slide` uses circle-vs-tile collision with 0.5-tile substeps (safe for knockback).
- Vision: shadowcasting per source at VISION_HZ; team-1 `visible` = tile lit or within 150 units of a source; ghost = invisible to team-1 `canSee`. `los` is a DDA grid traversal excluding endpoint tiles.

## Combat / dummy (js/sim/combat.js, js/sim/units.js)

- Spirit stats: armor = `spirit_armor` (not +2 base armor), damage min=max=`spirit_damage`, HP/range/duration from the `invoker_forge_spirit` values via the owner's ctx; MS/BAT/point/proj speed from `npc_dota_invoker_forged_spirit`. Melting Strike armor shred and spirit count are the spell worker's job.
- Dummies never die: refill hp+mana when hp < 25% (`refill` event). Hero at hp <= 0 refills (`heroDown`).
- Lifted units take no damage unless `flags.allowLifted`; magical vs `magicImmune` = 0 unless `flags.pierce`. `manaBurn` is also blocked by BKB.
- Knockback/drag share the `knockback` status moved by system order 25 through `IT.Nav.slide(map, e, nx, ny)`; stunned-like for AI (cancels bolt, no behavior).
- Dodging only for `evasive` dummies: reaction measured from the danger thinker's `age`; gives up if the exit point can't be reached before `danger.at`. Danger thinkers: `{danger:{x,y,r,at}}`.
- Bolt: 2 s retry delay after a cancel, cooldown starts on launch. Dodged only by `lift`. BKB check happens on projectile arrival.
- Blink: one per combo; pending until the dummy can blink (not stun/frozen/lift/root/atosRoot/hex). Silence does not block. Landing: cover spot in [minRange, range], prefer no LOS to hero, then farthest from hero, ties by array index; else straight away from hero. Dummy's `ai.home` moves to the landing spot.
- Evasive without `map.cover` falls back to wander. Respawn: 60 random samples at 900-1600 from the hero; outsideVision uses `Vision.visibleAt` (needs `w.vis`) else hero vision + LOS.
- Note: `w.emit` overwrites `payload.type`, so `status`/`statusEnd`/`damage` events whose payload has a `type` field lose it (status type, damage type). Not fixed here (world.js is not mine).

## Hero stats / orders (sim)
- Attributes: base + gain x (level-1) + orb bonus. KV orb keys `strength_bonus`/`agility_bonus`/`intelligence_bonus` (value 1) are applied PER EFFECTIVE ORB LEVEL (quas->STR, wex->AGI, exort->INT); assumption.
- HP = 120 + 22 STR, regen = 0.25 + 0.1 STR; mana = 75 + 12 INT, regen = 0.05 INT; armor = -1 + AGI/6; AS = 100 + AGI (clamped 20..700); magic res = 25% + 0.1%/INT; damage = KV + INT.
- Per-tick `stats` system (order 15) recomputes ms/armor/magicRes/regen/attack.* from `e.base` for hero/dummy/spirit (base snapshotted from the entity on first tick if missing). Orb passives per orb instance in `inv.orbs`; `status.data.stats = {as,dmg,ms,msPct,armor,magicRes,hpRegen,manaRegen}`. ms = (base+flat)(1+pct)(1-slow), clamped 100..550 (skipped when base ms is 0); hex fixes ms at 140.
- Orders: turn rate = MovementTurnRate/0.03 rad/s; move/cast/attack need facing within 0.2 rad. Auto-attack: attack range + both hull radii. Attack cadence = BAT/(AS/100), windup = point/(AS/100); cancelling a windup refunds the attack timer. Orders issued while stunned are rejected ('disabled').
