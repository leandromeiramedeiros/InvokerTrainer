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
- `w.emit(name, p)`: `p.ev` is ALWAYS the event name; `p.type` = name too unless the payload carries its own `type` (kept; re-emitted payloads don't count as own). So `*` listeners / log readers must use `p.ev`. Current sim payloads use `status`/`dmgType`, none carry `type`.
- Dummy items: `spawnDummy({items:[ids], useBkb})` -> `d.items` (6 hero-shaped slots, HUD-readable), `d.cd`. `ai.useBkb`: on the hero's `castStart` of a disable aimed at it (coldsnap/atos/vyse/orchid by target; gleipnir/meteorhammer by area; tornado by lane) it uses its carried, ready BKB `reaction` s later (vetoed by `Abilities.check`: stun/hex/cd/mana); emits `itemUse`. `resetCombo`/`respawn` reset item cds + BKB charges (useBkb survives respawn). Only the 6-slot list is a gate: no BKB carried = no reaction.
- Spirit auto-attack (`w.opts.autoAttack`, default ON): OFF = spirits attack only the target of an explicit hero attack order (or hold), otherwise follow the hero; ON = follow the hero's target, else nearest visible enemy within 700.

## Hero stats / orders (sim)
- Stats audit (L30, orbs 8/8/8, vs Dota: STR 100 AGI 80 INT 146, dmg 168, AS 188, armor 12, MR 40%, MS 293, HP 2298, mana 1827): everything matched except max HP (2309). Dota gives 22 HP per WHOLE strength: STR is 19+2.5x29+8 = 99.5, 120+22x99 = 2298 exactly. Fix: maxHp/maxMana use floor(attr). Regen left on the float (10.2+8 = 18.2 matches the shown +18.2; flooring gives 18.15, ambiguous). `IT.Hero.maxHp(ctx)/maxMana(ctx)` expose it (ui/loadout.js still computes 22*str itself: REQUEST).
- Attributes: base + gain x (level-1) + orb bonus. KV orb keys `strength_bonus`/`agility_bonus`/`intelligence_bonus` (value 1) are applied PER EFFECTIVE ORB LEVEL (quas->STR, wex->AGI, exort->INT); assumption.
- HP = 120 + 22 STR, regen = 0.25 + 0.1 STR; mana = 75 + 12 INT, regen = 0.05 INT; armor = -1 + AGI/6; AS = 100 + AGI (clamped 20..700); magic res = 25% + 0.1%/INT; damage = KV + INT.
- Per-tick `stats` system (order 15) recomputes ms/armor/magicRes/regen/attack.* from `e.base` for hero/dummy/spirit (base snapshotted from the entity on first tick if missing). Orb passives per orb instance in `inv.orbs`; `status.data.stats = {as,dmg,ms,msPct,armor,magicRes,hpRegen,manaRegen}`. ms = (base+flat)(1+pct)(1-slow), clamped 100..550 (skipped when base ms is 0); hex fixes ms at 140.
- Orders: turn rate = MovementTurnRate/0.03 rad/s; move/cast/attack need facing within 0.2 rad. Auto-attack: attack range + both hull radii. Attack cadence = BAT/(AS/100), windup = point/(AS/100); cancelling a windup refunds the attack timer. Orders issued while stunned are rejected ('disabled').

## Items (js/sim/items.js)
- All numbers via `IT.Values.item(ITEM_DOTA[id], key, lvl)`; each def overrides range/castPoint(0)/manaCost/cooldown (spell-style defaults don't read items). Blink range is `Infinity` (never walks; cast clamps). `caster.cd[id]` is the cooldown source of truth; `items[i].cd` is mirrored by invoke.js each tick (refresher also zeroes it).
- `IT.Abilities.check` honours an optional `def.canUse(w, caster, order) -> reasonKey|null` after the generic checks (blink: `rooted`, `blinkDamaged`); lives in abilities.js, no wrapper in items.js.
- Refresher resets all `hero.cd` except itself, `inv.invokeCd`, item cds. BKB `charges` are NOT reset.
- Atos: tracking projectile, speed 1900 (item ProjectileSpeed, not baked). Miss if target lifted on arrival, or removed; BKB-blocked = `miss` + fx `atosBlocked`.
- Vyse: instant `hex`; BKB blocks (miss). Hex ms 140 applies to every unit via the stats system.
- Shiva: active ring thinker (`ring` grows at `blast_speed` to `blast_radius`; each enemy hit once: magical `blast_damage` + `slow` pct 0.4 for `blast_debuff_duration`). Aura = `passive` hook refreshing a 0.2 s `shivaAura` status (data.stats.as = -40) on enemies within `aura_radius`; hook driven by system `itemsPassive` (order 55). Armor `bonus_armor` is in the `itemStats` status.
- Passive stats (boots ms, shiva armor, orchid AS/damage/mana regen) are one permanent status `itemStats` (data.stats), refreshed idempotently by system `itemsInit` (order 5) when the item set changes. Only one boots counts (travels > boots). Power Treads REMOVED (#30; not in bake ITEMS, GAME, loadout, items.js). Other items' int/hp bonuses (orchid +12 int, gleipnir +450 hp/+200 mana/+12 int) are skipped.
- Orchid (`orchid`, item_orchid, unit target 900): `silence` for `silence_duration`, status data `{orchid:true, taken}`; a world hook adds every `dealt>0` damage taken while silenced (any source); a thinker watching that status object bursts `taken * silence_damage_percent/100` as magic damage (ability `orchid`) when it ends (expiry or BKB dispel) unless the target is gone. Recast while silenced extends, no 2nd burst. BKB/magicImmune blocks => `miss` + fx `orchidBlocked`. fx: orchidHit, orchidBurst{amount}.
- Gleipnir (`gleipnir`, item_gungir, point 1100): enemies within `radius_tooltip` (400 = radius 325 + bonus_aoe 75; assumption) at cast get a tracking projectile (speed 1900, as Atos); on arrival `root` for `duration` (2) + `damage` (KV has NONE in this patch => 0, code applies it if present). BKB => `miss` + fx gleipnirBlocked; lifted = miss; empty area = one `miss`. hit/miss per target. fx: gleipnirLaunch, gleipnirHit.
- Meteor Hammer: `channel` = `max_duration`; `channelEnd(interrupted=false)` spawns the meteor thinker (danger at `land_time`); interrupted (stun/hex/non-queued order) => fx `meteorCancel`, nothing lands. Impact: magical `impact_damage_units`, stun, then `burn` status + `burn_slow` slow (KV key, applied) + dps ticks every `burn_interval` for `burn_duration`. BKB blocks the burn debuff.
- BKB: use n (`items[i].charges`) uses `duration[min(n,2)]` (9/8/7), then charges++. Basic dispel removes slow, atosRoot, root, silence (not stun/hex/frozen/lift/knockback).
- Blink: distance > `blink_range` lands at `blink_range_clamp` (960); landing via `IT.Nav.nearestWalkable`; locked `blink_damage_cooldown` (3 s) after the hero takes `dealt > 0` damage from an enemy-team source (`hero._blinkLock`); not while root/atosRoot.
- Events: `hit`/`miss` with `ability:<item id>`; `blink` for blink. fx: refresh, atosLaunch, atosHit, atosDodged, atosBlocked, hexHit, hexBlocked, shivaBlast, meteorChannel, meteorFall, meteorImpact, meteorCancel, bkb, blinkStart, blinkEnd.

## Spells (js/sim/spells.js)
- All numbers from `IT.Values` with caster ctx. Non-KV constants: `KNOCK_SPEED` 150 (Deafening knockback), `METEOR_SPACING` 1.5 (meteor roll tick spacing), `SPIRIT_RING` 90 (spirit spawn ring), `LIFT_HEIGHT` 120 (tornado lift z).
- Forge Spirit count = max(1, min(quas count, exort count)) (KV `extra_spirit_count_*` are per-orb-level counts [1,1,1,2,2,2,2,3,3]) => 1..3. Recast replaces all own spirits.
- Shard (#28) upgrades ONE spell, `ctx.shardSpell` (ghostwalk|emp|sunstrike): `Values` applies `src:'shard'` mods/`requiresShard` only to that spell (legacy `shard` without a spell = all, so old combo.js grantMissing keeps working). Ghost Walk: Ice Wall `damage_per_second` (magic, per `tick_interval`) to enemy heroes + dummies in its aura. EMP: `drag_speed` pull to the center + `damage_per_mana_pct` +50%. Sun Strike: damaging an enemy hero/dummy spawns one Forge Spirit (current level) at the strike point, others kept.
- Tornado scepter `twister_damage` read as damage per second (tick = dps * twister_tick_rate).
- Ice Wall `wall_width` used as the wall radius; the wall does not block pathing. Skipped: scepter root.
- Ghost Walk, Alacrity, Forge Spirit emit no hit/miss. All other spells emit `hit` once per enemy per cast (blind = !visible for team 0) and `miss` once if no enemy was touched.
- Lifted units are skipped by AoE selection (counts as a miss) and take no damage.
- Deafening Blast disarm = knockback + `disarm_duration`; knockback cancels dummy bolts.
- Chaos Meteor direction = caster to target point.
- Alacrity self-cast: UI must pass `target = hero.id` (`Abilities.check` returns 'noTarget' otherwise; orders.js not changed). Direct `cast(w,c,{})` defaults to caster.
- Workaround in spells.js for units.js:79 (`spawnSpirit` base lacks point/projSpeed).

## Combos / stats
- Data `js/data/combos.js` (`IT.COMBOS`, 29 combos: 10 basic, 7 intermediate, 2 advanced, 10 items) must load after `game.js` (reads `SPELL_ORBS`). Engine `js/sim/combo.js` (`IT.Combo`, system `combo`@90, state `w.combo`), collector `js/sim/stats.js` (`IT.StatsCollector`, system `statsCollector`@90; `stats` is taken by hero.js).
- Steps match from events: cast/item = `cast` by hero (+visibility / selfCast checks); `mustHitDummy` stays open until `hit` on dummy (done) or `miss`/6 s (fail). attack = `attackHit` from hero or its spirits (`count`). react = `bolt` cancel('disabled')/blocked, dummy blink blocked by a disable (polled), EMP pull >= 150 units. `within` = max s since the previous step. A wrong cast only counts as `extra` (no longer perfect); a miss fails.
- Fail: streak 0, `comboFail {reason: miss|timeout|within|boltHit|blinked}`, same combo auto-restarts after 1 s (dummy respawn + full refresh). Done: everything refreshed, next prompt after 0.8 s (practice/timed).
- Score = round((tier base + speed bonus) x min(2, 1+0.1 streak) x (1.25 if perfect)); speed bonus = 0.5 base x clamp((2 par - t)/par); perfect = no wrong casts, no misses, first attempt.
- Modes: `Combo.mode(w,'sandbox'|'practice'|'timed',opts)`; prompts weighted toward unmastered/failed combos using `w.rng`. `opts`: `tiers`, `ids`, `grantMissing`, `seconds`. `Combo.start(w,id,opts)` plays one combo (sandbox). `grantMissing` temporarily adds missing items / scepter / shard (revoked on next start/mode/end).
- Hidden steps respawn the dummy outside vision only when `w.fog`; `w.combo.hint {x,y}` is the last known position (ping).
- Delays: wait hints are tips only; after Tornado they count from the lift. Dummy respawns 900-1600 away, so bolt combos need the hero to approach.
- Stats: `StatsCollector.create(w)` -> `{summary(), destroy()}`; `merge(lifetime|null, summary)` returns a new plain blob (caller persists). Spell accuracy = hits / (hits + misses).
