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
- Fail: streak 0, `comboFail {reason: miss|timeout|within|boltHit|blinked}`, same combo auto-restarts after 1 s (dummy respawn + full refresh). Done: everything refreshed, back to idle after 0.8 s.
- Score = round((tier base + speed bonus) x min(2, 1+0.1 streak) x (1.25 if perfect)); speed bonus = 0.5 base x clamp((2 par - t)/par); perfect = no wrong casts, no misses, first attempt.
- Modes: `Combo.mode(w,'sandbox',opts)` (the practice/timed prompt modes were removed as unreachable). `opts`: `loadout`, `grantMissing`. `Combo.start(w,id,opts)` plays one combo (sandbox). `grantMissing` temporarily adds missing items / scepter / shard (revoked on next start/mode/end).
- Hidden steps respawn the dummy outside vision only when `w.fog`; `w.combo.hint {x,y}` is the last known position (ping).
- Delays: wait hints are tips only; after Tornado they count from the lift. Dummy respawns 900-1600 away, so bolt combos need the hero to approach.
- Stats: `StatsCollector.create(w)` -> `{summary(), destroy()}`; `merge(lifetime|null, summary)` returns a new plain blob (caller persists). Spell accuracy = hits / (hits + misses).

## v3 wave 2
- Right click / middle / Mouse4-5 never reach browser UI (window-capture guards), even in menus.
- Ready casts fire inside Orders.issue (mid-walk): move spam can't swallow Ghost Walk or facing point spells; a cast within 0.1 s of its cast point survives a new order.
- Stop cancels the attack wind-up without spending cooldown and blocks auto-acquire 0.2 s; Hold never attacks. Ghost Walk never auto-acquires.
- Cataclysm = Sun Strike double press (window min(doubleTapTimeout, 0.3 s)); first press is held, then fires as a normal strike.
- WebGL2 compositor (js/render/gl.js) with 2D fallback; fpsCap (30/60/120/off) paces rendering, sim keeps real time. Idle render 3.6 -> 1.1 ms.
- Scepter/Shard hood emblem sits between abilities and items (Dota layout); gems glow in the scepter orb / shard spell orb colour.
- Default Invoker skin recoloured toward the sage/bronze reference (kept per user).
- Dummy chat lines are original, rate-limited, toggleable.

## v6 WP1 (gameplay core)
- Foe hp (kill / kill_with / killN): `hp = round(max(100, HP_SHARE 0.85 x credited step damage x df.hpMul))` (`Ranked.foeHp` / `comboDamage`). Damage is read from the KV through `IT.Values` at the scenario loadout: Sun Strike `damage` (split on 'mid'; Cataclysm `cataclysm_count x damage x cataclysm_damage_pct`), Chaos Meteor `main_damage` x hits over its roll + `burn_dps x burn_duration`, Blast `damage`, Tornado `base_damage + quas_damage + wex_damage`, Cold Snap `freeze_damage` x min(3, procs), EMP `min(mana_burned, foe mana) x damage_per_mana_pct`, Gleipnir / Meteor Hammer item KV, Forge Spirits and attacks = dps x 4 s. Magic parts x (1 - foe magic res); after the opener x (1 - KV `spell_reduce`) on a `useBkb` foe. Ice Wall = 0 (zone in front of the hero).
- Every step spell / item (not move / attack) must hit a foe (self ones: be cast; Ice Wall counts as cast) before the kill counts, else fail `method / missing` naming them (`cfail.method.missing`). A spell cast <= 2 s before the kill (in flight: Sun Strike delay, Blast wave, Meteor fall) counts. `how` rules unchanged; a kill scenario with needed steps disables hero auto-acquire.
- Tower timer (`Ranked.towerMath`, test-computed from sim values): tAttack = walk + hp / (hero dps x 0.5 reinforced vs armor 12); tCombo = walk + cast points + channels (Meteor Hammer KV `max_duration`) + `fightTime(hp, Alacrity hero x 0.5 + spirits x 0.6, hammer)`, where the hammer adds building impact 90 at land + 50/s burn ticks for 6 s (not gated, tower magic res 0); tHammer = plain hits + hammer alone. Rule `tCombo x 1.25 <= limit < tHammer < tAttack`. tower_siege: towerHp 1000, limit 14; easy tAttack 24.29, tHammer 17.11, tCombo 7.94 (x1.25 = 9.9); bambam 24.59 / 17.30 / 8.35 (x1.25 = 10.4).
- Invisibility: the hero is "seen" only if team 1 sees it (`Vision` teamSees: ghost / invisible hidden unless a living Dire tower's true sight (860, see "v6 local-install audit") or a reveal covers it). Hidden hero: never targeted (cast on a hidden unit fails `targetHidden`; a stun-bolt cast in progress cancels `lost`), never followed: chasers go to the last-seen point, then search a widening ring (150 + 110 u/s, max 900). Caught = seen with a foe within CAUGHT 110, or damaged by a foe.
- Fog always on (no difficulty field, no twist); vision refreshed when a scenario enters (the world is frozen through the countdown). Nothing pre-invoked: 10 s countdown (ranked and fixed sandbox) where orbs + Invoke run without starting the round and invokeCd ticks; move / cast / attack starts it.
- Sun Strike / Cataclysm: KV `SpellImmunityType ENEMIES_YES` + pure -> `flags.pierce`; full damage through hero BKB and enemy BKB (`spell_reduce` applies to magical only).
- Ranked: FUN_TURNS 4 of 8 turns (seeded) draw from scenarios tagged fog / invisible / river / prediction / vision. Every scenario carries boots (travels when listed), <= 6 items.
- Enemy Dust (WP1 follow-up): 'dust' in ENEMY_ITEMS, one charge, carried only on labelled escape scenarios (plateau_escape lvl 9, new dust_escape lvl 6; not gauntlet, a kill scenario where the player holds Dust). A chaser that lost a truly hidden hero (invis/ghost, not plain fog) after a real sighting walks to the last-seen point, waits its reaction from the sighting time, then casts Dust there (telegraph lead + 'Dust!' bubble + dust-cloud fx), only within `ENEMY.dustAt` 80 of that point. Reuses the player 'revealed' status (KV radius 1050, 12 s). Answer: disable the carrier before it reaches the spot, or be > radius away.
- Free Play fog: `Ranked.worldFog(opts, pr)`: scenarios always use the scenario's fog; the loadout checkbox applies only in Free Play.

## v6 WP4 - units / buildings / light (2026-10-12)
- Collision: `orders.js separate` world system at order 21 (after movement 20, before knockback 25) for hero, spirits, enemies, dummies: pairwise circle push to (r1 + r2) x SEP_K 0.9, 2 passes, weighted by mover / mass; every push goes through `Nav.slide` so nobody is pushed into a wall. A mover pushing into another unit also sidesteps (on the side it already leans to) so head-on paths do not deadlock. Lifted / knocked-back / noCollide / airborne units skip it. O(n^2) is fine (< 30 units).
- Structures (map.structures: barracks, fort, filler, fountain, shop, outpost) stay static and invulnerable (no entity, no damage): a trainer, not a siege mode. Their HUD card uses Dota KV (npc_units.txt, SteamDatabase GameTracking-Dota2, fetched 2026-10-12): melee rax 2200 hp / 15 armor, ranged rax 1300 / 9, ancient 4500 / 23, filler 1000 / 10, outpost 450 / 0, fountain 290-310 dmg range 1200. Melee / ranged barracks from the Dota entity name at the tile. Selected as `In.selected = 'S<i>'` (index in map.structures); picking uses per-kind sprite heights (`Towers.buildingAt`).
- Meteor Hammer vs buildings (towers): KV `impact_damage_buildings` 90 + `burn_dps_buildings` 50 x 6 s = 390, magical, no stun / slow (buildings take no statuses), non-invulnerable foes only. `Towers.gate` returns 0 for any invulnerable target.
- Selection: clicking an own spirit selects it and the HUD card shows it (portrait, HP, damage, armor, MS, Attack / Stop / Hold with the bound keys). Right-click / A / S / H go to the selected units; orb, spell and item keys always act from the hero and keep the spirit card. Shift-click toggles a spirit in the group; clicking the hero returns to the hero bar. TAB / box select show the first spirit. Foes / buildings are inspect-only and any action drops them. A lone selected spirit is ordered through `issueGroup` (player flag): plain `issue` rejects `_playerCmd` spirits.
- Light: ambient in vision 0.86 / 0.88 / 0.90 (was 0.30 / 0.37 / 0.60), point lights x 0.55 on top; explored-but-not-visible uses a fixed OUTV 0.114 / 0.141 / 0.228 (= old AMB x 0.38) so fog stays exactly as dark. Terrain palettes (grass, dirt, floor, water, river, stone, cliffs, trees) raised in brightness and saturation.
- Buildings: one pixel sprite per sub-kind and team (melee rax, ranged rax, ancient, filler effigy, fountain, shop, secret shop, outpost, towers); tower hp bar and footprint anchored on the sprite base. HUD portraits are crops of the same sprites; the Forge Spirit has its own 32x32 portrait (dummies.js).
- Not done: no new i18n keys (card labels inline en / pt in hud.js); structures are not damageable.

## v6 WP6 - stats / relics / per-run medal (2026-10-12)
- Relic source: SteamDatabase/GameTracking-Dota2 @ b2c7f7ce46f67c878666379af4488da30481951f (2026-10-11): `game/dota/pak01_dir/scripts/tracked_stats_player.vdata` (Invoker kill-eater stats) and `game/dota/pak01_dir/resource/localization/dota_english.txt` (`KillEaterEvent[Type]_*` names). https://raw.githubusercontent.com/SteamDatabase/GameTracking-Dota2/master/game/dota/pak01_dir/scripts/tracked_stats_player.vdata , https://raw.githubusercontent.com/SteamDatabase/GameTracking-Dota2/master/game/dota/pak01_dir/resource/localization/dota_english.txt . hero_relics / items_game are not in the repo.
- Invoker relics there (stat id / kill-eater event): invoker_sunstrike_kills 121/23 "Sunstrike Kills", invoker_tornado_kills 130/32 "Tornado Kills", invoker_multi_hero_ice_wall 459/578 "Multi-Hero Ice Wall", invoker_three_hero_emp 460/579 "Three Hero EMP", invoker_three_hero_deafening_blast 461/580 "Three Hero Deafening Blast", invoker_multi_hero_chaos_meteor 462/581 "Multi-Hero Chaos Meteor", invoker_bonus_alacrity_damage 463/582 "Bonus Alacrity Damage". All 7 implemented, plus the generic relics Kills, Stuns Leading To Kills, Blinks Leading To Kills, Kills During BKB, plus 6 trainer relics (Chaos Meteor Damage, E.M.P. Mana Burned, Enemies Lifted, Disable Time, Forge Spirit Kills, Cataclysm Hits) flagged `dota: false`.
- Tiers (superseded by "v6 local-install audit"): Dota relics now use the real per-level step from the local VPK; only the 6 trainer relics keep trainer-scaled tiers.
- Measurement (js/sim/stats.js collector, world events only, sim untouched): counts only while `w.ranked` is set (ranked, infinite, scenario practice), never Free Play. Kill attribution = the `damage` event right before `kill`. Tornado kill = Tornado damage or a kill <= 2 s after the lift ends; stun kill <= 3 s after a stun / freeze / hex / lift ends; blink kill <= 4 s after the hero's blink; BKB kill = hero magic-immune at the kill. Multi-hero relics: one window per cast (Ice Wall 6 s / 2 foes, EMP 4 s / 3, Deafening Blast 2.5 s / 3, Chaos Meteor 7 s / 2), counted once per cast. Alacrity damage = the bonus share of an attack by an Alacrity-buffed unit of ours (min(dealt, bonus x dealt / raw)). EMP mana = foe mana at the `hit` minus after the burn.
- Persistence: run deltas live in the summary (`relics`), merged into the lifetime blob (`it2.stats`) by `StatsCollector.merge`; a finished ranked run also adds `runs`, `bestMedal`, `bestScore` (main.js commitStats passes `st.run`). A tier crossing during play fires `StatsCollector.hooks.tier` -> non-blocking toast (top-right, pointer-events none, gold bloom, `Sfx.relic` fanfare, max 3, 3.2 s).
- Per-run medal (`Ranks.fromRun`, replaces the rating display on the splash; rating storage in ranked.js untouched): score tier from RUN_START [0,120,250,400,560,720,900,1200], capped by cleared turns RUN_CAP [0,1,1,2,3,4,5,6,7] (Divine max unless 8/8; Immortal needs 8/8). Stars 1..5 by position in the score band (5 when capped), Immortal 0 stars.
- End splash: medal + score, tiles (score, cleared, streak, APM, fastest), total damage, physical (#e8643a) / magical (#7a6cf0) / pure (#f2c444) stacked bar, damage by source (only sources that hit, desc, Forge Spirit attacks booked as Forge Spirit), RELICS PROGRESS panel (this run's delta, lifetime, next tier). Sun Strike / Meteor accuracy tiles removed. Share PNG: medal, score / cleared, total damage, top 3 sources with icons.
- Stats screen: relic collection (tier pips, progress to next tier, lifetime value), runs, best medal, best score, lifetime damage; combo stats removed. The relic grid scrolls inside the panel at 1280x720.

## v6 medal - clear + relic score, retuned bands (2026-10-12)
- Run score = CLEAR + RELIC (`modeEnd` summary carries `score`, `clearScore`, `relicScore`, `relicParts`; `score` is what the medal, the rating fold, the profile best score and the HUD read). Supersedes the WP6 RUN_START.
- CLEAR (js/sim/ranked.js `scenarioScore`): per solved scenario 100 x speed (1 + 0.5 x clamp((2 par - t) / par, 0, 1)) x streak (1 + 0.1 / clear in a row, max x2) x difficulty bonus. The bonus is `diffBonus(df)` = 1 + 0.3 x idx / 4 (ian 1, easy 1.075, common 1.15, hard 1.225, bambam 1.3), no longer df.mult (0.6..1.8): bulkier foes do not inflate it, a clean clear is worth the same base anywhere, difficulty adds at most +30 % (also caps infinite laps). A clean 8/8 at par = 1620 x bonus (ian-ramp 1740, hard-ramp 2070).
- RELIC (js/sim/stats.js `relicScore`, weights in js/data/relics.js `weight`): sum over relics of min(RELIC_CAP 1, run delta / step) x weight x RELIC_K 100. step = the Dota per-level value (items_game in_game_display_interval) or, for trainer relics, the tier I threshold. Weights: 3 = Sun Strike kills, Tornado kills, Multi-Hero Ice Wall, Three Hero EMP, Three Hero Deafening Blast, Multi-Hero Chaos Meteor, Cataclysm hits; 2 = stun / blink / BKB kills; 1 = kills, Alacrity damage, Meteor damage, EMP mana, lifts, disable time, Forge Spirit kills. 25000 Alacrity damage = 100, 3 Sun Strike kills = 60, a full Tornado-kill level (3) = 300 (the cap). Ranked only (infinite: relicScore 0). Mean per run over 720 sampled runs: Tornado kills 128, Meteor damage 46, Sun Strike kills 42, Cataclysm 41, disable 35, lifts 35, everything else < 15.
- Sampling: `node tools/score_sample.mjs --seeds 40` (147 s): the scenarios_v5 scripted bot plays full 8-turn ranked runs in one world (scenario swaps, stats collector attached), 40 seeds per group; `ramp` = real rampDiff from the rating band, `fixed` = diffIndex forced; `clean` = bot as scripted, `sloppy` = 0.4..2.5 s hesitation per step + 15 % dropped steps. The bot cannot clear most hard / bambam scenarios, so `proj` projects each run to 8/8 (every turn at the run's mean clear speed and difficulty bonus, relics = its solved scenarios' mean x 8) = the near-perfect player estimate. Run score (actual), then the 8/8 projection:

| group | 8/8 runs | solved p50 | total p10 / p50 / p90 / p95 | clear p50 | relic p10 / p50 / p90 | 8/8 proj p10 / p50 / p95 (clear + relic p50) |
|---|---|---|---|---|---|---|
| ramp ian clean | 38/40 | 8 | 2025 / 2192 / 2366 / 2420 | 1736 | 304 / 473 / 625 | 2049 / 2215 / 2420 (1738 + 473) |
| ramp ian sloppy | 0/40 | 5 | 777 / 1128 / 1656 / 1709 | 905 | 144 / 242 / 399 | - |
| ramp easy clean | 2/40 | 6 | 1484 / 1872 / 2228 / 2292 | 1256 | 383 / 577 / 819 | 2183 / 2418 / 2597 (1861 + 565) |
| ramp easy sloppy | 0/40 | 4 | 531 / 928 / 1376 / 1414 | 610 | 133 / 253 / 565 | - |
| ramp common clean | 0/40 | 5 | 972 / 1542 / 1890 / 1936 | 1003 | 272 / 580 / 672 | 2292 / 2580 / 2792 (1984 + 596) |
| ramp common sloppy | 0/40 | 2 | 211 / 505 / 859 / 947 | 345 | 63 / 158 / 338 | - |
| ramp hard clean | 0/40 | 3 | 479 / 1035 / 1381 / 1427 | 581 | 243 / 475 / 652 | 2566 / 2726 / 2891 (2071 + 655) |
| ramp hard sloppy | 0/40 | 0 | 19 / 195 / 504 / 527 | 0 | 19 / 81 / 298 | - |
| fixed ian clean | 23/40 | 8 | 1652 / 1939 / 2269 / 2414 | 1608 | 277 / 470 / 659 | 1826 / 2101 / 2415 (1616 + 486) |
| fixed ian sloppy | 5/40 | 6 | 1016 / 1418 / 1951 / 2029 | 981 | 176 / 358 / 651 | - |
| fixed easy clean | 14/40 | 7 | 1785 / 2073 / 2415 / 2544 | 1468 | 405 / 606 / 838 | 2153 / 2298 / 2633 (1742 + 569) |
| fixed easy sloppy | 0/40 | 4 | 875 / 1278 / 1674 / 1806 | 729 | 266 / 480 / 731 | - |
| fixed common clean | 0/40 | 6 | 1525 / 1832 / 2174 / 2234 | 1206 | 366 / 622 / 775 | 2276 / 2482 / 2699 (1861 + 625) |
| fixed common sloppy | 0/40 | 2 | 376 / 745 / 1188 / 1403 | 353 | 135 / 337 / 525 | - |
| fixed hard clean | 0/40 | 3 | 933 / 1174 / 1651 / 1698 | 570 | 428 / 605 / 754 | 2556 / 2688 / 2916 (1986 + 712) |
| fixed hard sloppy | 0/40 | 1 | 30 / 297 / 532 / 553 | 184 | 30 / 127 / 322 | - |
| fixed bambam clean | 0/40 | 2 | 461 / 737 / 1044 / 1143 | 410 | 130 / 233 / 398 | 2265 / 2600 / 2749 (2108 + 492) |
| fixed bambam sloppy | 0/40 | 0 | 7 / 79 / 312 / 352 | 0 | 7 / 59 / 157 | - |

- Bands (js/data/ranks.js RUN_START, score lower bound per tier): Herald 0, Guardian 400, Crusader 800, Archon 1250, Legend 1700, Ancient 2150, Divine 2600, Immortal 2850. RUN_CAP by clears unchanged [0,1,1,2,3,4,5,6,7]; Immortal needs 8/8 AND >= 2850. Anchors: clean lowest-ramp 8/8 p10 / p50 / p95 = Legend 5 / Ancient 1 / Ancient 4 (never Immortal: max ~2450); perfect hard-ramp p50 2726 = Divine 3, fixed hard p50 2688 = Divine 2; Immortal 2850 ~ p95 of the near-perfect hard / bambam projections (2891 / 2916 / 2749); common / easy perfect runs sit in Ancient 3-5, their real (failed-turn) runs in Archon / Legend; sloppy runs Guardian .. Archon (also clear-capped).
- Splash: a line under the score "Clear 740 + Relics 210 = 950" (`end.sp.breakdown`, PT "Cenários .. + Relíquias .. = ..", tooltip `end.sp.breakdown.d`; css class `sp-on sp-break`, reuses the existing `sp-on` style). Share PNG: the same line under the medal name. Old summaries without `clearScore` show no line.
- Assumptions: the projection treats failed turns as if cleared at the same speed (a real player who clears hard 8/8 is probably slower, so hard / bambam bands are optimistic, i.e. Immortal stays rare). Relic K / cap / weights are the tuning knobs (StatsCollector.RELIC_K / RELIC_CAP, relics.js `weight`); retune RUN_START by re-running the sampler.

## v6 local-install audit - relic levels, KV cross-check (2026-10-12)
- Local build: `game/dota/steam.inf` ClientVersion 6957, ServerVersion 6957, SourceRevision 11114317, VersionDate Oct 09 2026. Read with a pure-python VPK v2 dir reader (scratchpad tool, not in the repo) from `game/dota/pak01_dir.vpk` (388112 entries, CRC-checked).
- Relic levels are LINEAR, no tier tables: `panorama/scripts/post_game_progress/post_game_progress_hero_relics.vjs_c` does `level = floor(value / value_per_level)` (value_per_level comes in the GC post-game data); `dota_english.txt` `DOTA_HeroRelics_ProgressToNextLevel` = `{relic_level_progress} / {relic_progress_per_level}`, `DOTA_HeroRelics_About_LevelUpDescription` = "levels up every {assists_per_relic_level} Assists". client.dll fills `assists_per_relic_level` (string file off 0x04ea93f0; code RVA 0x030057ec) from the kill-eater score type #1 definition field +0x14, and the items_game parser (RVA 0x033055a7 / 0x0330595a) stores `in_game_display_interval` exactly there (value +0x14, default 1). So the per-level step = `scripts/items/items_game.txt` `kill_eater_score_types.<event>.in_game_display_interval`.
- Steps used (tiers I..V = Dota levels 1..5 = k x step; js/data/relics.js `step` / `event`), all `items_game.txt kill_eater_score_types.<event>.in_game_display_interval`: Sunstrike Kills ev 23 = 15; Tornado Kills ev 32 = 3; Multi-Hero Ice Wall ev 578 = 25; Three Hero EMP ev 579 = 5; Three Hero Deafening Blast ev 580 = 5; Multi-Hero Chaos Meteor ev 581 = 20; Bonus Alacrity Damage ev 582 = 25000; Kills ev 0 = 75; Stuns Leading To Kills ev 5043 = 50; Kills After Blink ev 5038 = 100; Kills During BKB ev 5041 = 15. Trainer relics (meteor_dmg, emp_mana, tornado_lifts, disable_time, spirit_kills, cataclysm_hits) have no Dota source and keep trainer-scaled tiers.
- `scripts/tracked_stats_player.vdata_c` (KV3 v5, LZ4, 2 buffers; decoded by byte scan): schema `CPlayerTrackedStatDefinition` { m_unStatID, m_eStatImpl (Direct / KillEater / Expression / HeroAdjective / CombatQuery), m_killEaterData.unKillEaterEvent, ... }: names + ids only, no level fields. `scripts/tournaments/challenge_instances/relic_*.txt` and `heroes/invoker/invoker_prime_*.txt` are Dota Plus challenge ranks, not relic levels.
- DLL string scan (ASCII + UTF-16LE, min 6): no relic tier / threshold tables. server.dll: relic 55 hits (EHeroRelicRarity, CDOTAUserMsg_HeroRelicProgress, hero_relic_milestones, eEventAudit_GainedRelicLevels), 0 hits for invoker stat names, value_per_level, relic_progress_per_level. client.dll: relic 270 hits, value_per_level / relic_progress_per_level / assists_per_relic_level 1 each (panorama glue). The post-game per-level value itself is GC-sent; the items_game interval is the only local source and the client uses it for the same "levels up every N" text.
- KV cross-check: the local `npc_dota_hero_invoker.txt`, `npc_dota_hero_base.txt`, `npc_units.txt`, `items.txt`, `npc_abilities.txt` are byte-identical (CR stripped) to the bake cache (sha 217732b, patch 6957), so js/data/dota.js needs no re-bake. Verified values (all already read from the KV by the code): Meteor Hammer impact_damage_buildings 90, burn_dps_buildings 50, burn_duration 6, burn_interval 1, land_time 0.5, max_duration 2, impact_damage_units 130, burn_dps_units 50; Dust radius 1050, duration 12, movespeed -20 (KV also has damage 25 and linger_duration 8, not modelled); Sun Strike damage 175..575 (exort), delay 1.7, area_of_effect 175, cataclysm_count +2 (scepter), cataclysm_damage_pct 75, cataclysm_min/max_range 90/180, cataclysm_cooldown 90, SPELL_IMMUNITY_ENEMIES_YES, pure; Ghost Walk duration 50, area_of_effect 450, aura_fade_time 2, enemy_slow -20..-60, self_slow -20..20; Forge Spirit spirit_damage 20..100, spirit_hp 300..1100, spirit_armor 0..8, unit npc_dota_invoker_forged_spirit AttackRate 1.35, point 0.2, MS 320, projectile 1000; towers T1 1800 hp / 12 armor / 88-92, T2-T3 2500 / 16 / 170-174, T4 2600 / 21, range 700, BAT 0.9, projectile 750, day vision 1900.
- Changed: tower true sight 700 -> 860 (js/sim/towers.js TRUE_SIGHT). Not in the KV (towers carry only creep_siege / backdoor_protection); server.dll `CDOTA_Modifier_Tower_Truesight_Aura` vtable (RVA 0x03b2cda8) slot 68 (aura radius getter, RVA 0x01644020) = `movss xmm0, [0x03b5a170]` = 860.0f; the same slot returns 1200.0f for `CDOTA_Modifier_Fountain_Truesight_Aura` (known fountain value), slots 65-67 = team 2 / type 51 / flags 80 for both. Test: tests/ceo_v6_core.test.js.
- Noted, not changed: tower KV AttackAnimationPoint 0.6 (towers.js uses point 0, a deliberate instant launch); tower night vision 800 (T1) / 1100 (T2+) (trainer is always day); Tower Protection aura (PROT_R 900, armor/regen) and the Reinforced attack multipliers are engine-side, not audited.
- Dust full KV (items.txt build 6957, item_dust AbilityValues): duration 12, radius 1050 (affected_by_aoe_increase), movespeed -20, damage 25, linger_duration 8; cooldown 30, cast range 1050, SPELL_DISPELLABLE_YES. The KV has no comments, so semantics come from structure: the DLL ships `modifier_item_dustofappearance_thinker` (the area) and `modifier_item_dustofappearance` (the per-unit debuff), so `linger_duration` = how long the cloud keeps applying, not an extra debuff tail. Implemented (js/sim/items.js, player and enemy share the cast): at cast every enemy-team unit in radius gets `revealed` + slow for `duration` (once, from application); a cloud thinker then lives `linger_duration` s at the cast point and gives the same debuff once to any unit that ENTERS the radius meanwhile (its own full 12 s from entry); after 8 s a late arrival is untouched. `damage` 25 magical is dealt once per unit per cast on application, only to a unit that was invisible (Shadow Blade / Ghost Walk, not already revealed) at that moment; BKB blocks the damage (magical) but not the reveal (pierce). Visible units are revealed/slowed, not damaged. Render: cloud ring + drifting motes last the linger time (fx 'dustBlast' `linger`), 'dustReveal' puff on each application, a turning gold dust-mote ring at the feet of a `revealed` unit (units.js dustRing), HUD chip uses the dust icon + new key `status.revealed`. Tests: tests/dust_v6.test.js.
- Tower attack (2026-10-12, js/sim/towers.js): KV `npc_units.txt` (bake cache 217732b = build 6957), all 20 `npc_dota_{good,bad}guys_tower*`: `AttackAnimationPoint` 0.6, `AttackRate` 0.9, `BaseAttackSpeed` 110, `ProjectileSpeed` 750, `AttackRange` / `AttackAcquisitionRange` 700. Attack speed scales both (as hero.js does): windup = 0.6 / 1.1 = 0.545 s (17 ticks at 30 Hz), interval = 0.9 / 1.1 = 0.818 s. Attack = instant acquire (no turn) -> windup -> tracking projectile. The windup is cancelled (no shot, cooldown refunded, `towerCancel` event) if the target dies, is lifted, leaves range (700 + hull) / vision, or the tower switches target; a launched projectile always tracks. New events `towerWindup` / `towerCancel`; `towerAttack` still fires at launch.
- Fixed: towers fired every 0.45 s (BAT / 2): orders.js 'attacks' (order 30) also ticks `attack.next` of every unit with an attack. Tower cadence now lives in `attack.readyAt` (world time); back-to-back attacks keep the exact 0.818 s mean. Net tower dps vs the hero ~ -45 % (tower_siege easy: 21 -> 11 hits on the hero; tower_dive: 4 -> 2).
- Ghost + tower: a tower targets a ghosted hero only when it is in attack range (700 + hull) and true-sighted (860, any team-1 source); 750 u = sighted but out of range, 900 u = unseen even with a stretched range (tests/towers_v6.test.js).
- Re-verified (bot, ian..bambam, seeds 1-5, A/B vs HEAD): tower_dive, tower_siege, tower_tornado, plateau_escape, ghost_slip, dust_escape, gauntlet outcomes unchanged; highground_hold hard ok 7.7 -> 8.9 s, bambam method -> cross (still a bot fail; Radiant towers hit the marchers half as often). `towerMath` does not use tower dps: tower_siege unchanged (easy tAttack 24.29 / tHammer 17.11 / tCombo 7.94, x1.25 = 9.9 <= 14; bambam 24.59 / 17.30 / 8.35). tower_tornado 'tower' fail = hero within range + hull (ranked.js), unchanged.

## v6 day / night (2026-10-12)
- Sources (local install build 6957, `...\dota 2 beta\game\dota\`, read with python -I from extracted copies in the scratchpad; nothing copied into the repo):
  - Cycle: `bin/win64/server.dll` ConVar `dota_time_of_day_rate` (help "Rate at which time of day changes relative to game seconds"; string RVA 0x03b6e898, registration xref RVA 0x00273ac2, default `movss` at RVA 0x00273aba from the constant at RVA 0x03b97818 = 0.00166667f = 1/600). That gives a 600 s day: 300 s light + 300 s night, and the game starts in daytime. `DayNight.CYCLE = 300`.
  - Hero: `scripts/npc/npc_dota_hero_base.txt` VisionDaytimeRange 1800 / VisionNighttimeRange 800. `npc_dota_hero_invoker.txt` has no Vision keys, so Invoker inherits these. The enemy heroes (GAME.ENEMY.vision / visionNight) use the same pair.
  - `scripts/npc/npc_units.txt`:
    - npc_dota_invoker_forged_spirit 1200 / 800;
    - towers: npc_dota_*_tower1_* 1900 / 800, tower2 / tower3 / tower4 1900 / 1100;
    - lane creeps melee / ranged 750 / 750 (reference only: the trainer has no creeps);
    - npc_dota_units_base 575 / 575.
- Model: `w.tod = { mode, night, t, len, fade, cycle }` (js/data/daynight.js).
  - Advanced by the 'daynight' world system (order 1, js/sim/world.js), which writes `e.vision` of each managed unit. vision.js, enemy notice and AI sight all read `e.vision`, so night = 800 everywhere.
  - Units whose vision something else set (a destroyed tower's 0, a test override) are left alone (`_dnFixed`).
- Assumptions (not Dota):
  - RAMP 10 s: vision and light lerp linearly from the day to the night value over 10 s after each flip. In Dota the vision flips instantly and only the light fades.
  - The training dummy (refill enemy / GAME.DUMMY) stays fixed at 800.
  - Spell and item vision thinkers (Sun Strike, Dust, wards) do not change with the time of day.
  - Legacy `w.night` / `map.night` force full night.
- Free Play: a MATCH option "Time of day" (Day / Night / Cycle 5 min), `st.tod`, passed to start() as `opts.tod`.
- Scenarios: the table is `DayNight.SCENARIO` (scenarios.js untouched), applied on every 'scnStart' (ranked swaps scenarios inside one world).
  - Rule: full night only when every foe starts within 800 of the hero. Foes placed farther out get a sunset during the scenario (`{ nightAt: s }` = sunset s seconds into play, fully dark 10 s later).
  - `night`: ghost_escape, ghost_finish.
  - `nightAt`: ghost_slip 5, dust_escape 5, plateau_escape 6, shadow_strike 3, fog_ambush 4, blink_fog 6.
  - Everything else is day (burst / basics / river / snipes / towers / hold for fairness).
- Render (js/render/light.js):
  - Night ambient AMB -> NAMB [0.57, 0.63, 0.80] (luma ~72% of day, blue cast), with a smoothstep over the ramp.
  - Light falloff is steeper (radius factor x1.6, edge exponent 1 + night).
  - Fog outside vision (OUTV / DARK) is unchanged.
- HUD: a pixel sun / moon clock left of the top strip with a phase progress arc. Tooltip: "Day: vision 1800 / Night: vision 800" plus the time to the next flip.
- Supersedes the audit note above ("trainer is always day"): towers now use their KV night vision.
- Tests: tests/daynight_v6.test.js.

## v6 playtest 2 - area wipe wins, foe hp share, ghost escape, result card (2026-10-12)
- **Area defence**: every 'hold' scenario and every gate ('cross') scenario ends as a WIN the moment every foe is dead (checked after the fail rules, before the kill need-check: the wipe is the defence).
- **Foe hp** (kill scenarios): hp = min(HP_CAP, HP_SHARE x tier hpMul) x credited step damage, HP_SHARE = 0.9, HP_CAP = 0.9 (was 0.85 x hpMul uncapped). Effective share: ian 0.72, easy 0.81, common/hard/bambam 0.90 (was 0.68 / 0.77 / 0.85 / 0.89 / 0.94).
  - The asked 1.0-1.2 range is infeasible: the credited damage IS the scripted steps' damage, so a share >= 1 means the steps cannot kill (bot runs out of time or finishes by auto-attack = method fail). Sweep (v5 bot, 34 kill scenarios x 5 tiers x seeds 1-8) vs 0.85: uniform shares above ~0.86 regress, increasingly (0.925+ breaks many single-step scenarios), mostly at hard/bambam where hpMul > 1 pushes the effective share past ~0.9. Capping the tier factor fixes that: min(0.9, 0.9 x hpMul) = 0 regressions on seeds 1-8, new clears (bkb_bait hard, tornado_chain ian, cataclysm_finish bambam s3).
  - No foe dies before its last mandatory damaging step is cast on any clear at common, seeds 1-8 (old 0.85 had one: refresher_double ian).
  - Common, seed 5 (last step = cast time of the last credited step, s; kill = last foe death, s; clears ian/easy/common/hard/bambam):

| scenario | hp 0.85 | hp new | last step | kill | clears old | clears new |
|---|---|---|---|---|---|---|
| sleepy_target | 404 | 428 | 0.0 | 1.7 | YYYYY | YYYYY |
| cold_start | 807 | 854 | 0.3 | 5.6 | YYYYY | YYYYY |
| spirit_pack | 1142 | 1209 | 0.0 | 3.3 | YYYYY | YYYYY |
| river_rune | 300 | 317 | 0.0 | 3.3 | YYYYY | YYYYY |
| sun_snipe | 404 | 428 | 1.2 | 2.9 | YYYYY | YYYYY |
| tornado_sun | 636 | 674 | 1.4 | 3.1 | YYYYY | YYYYY |
| two_birds | 202/202 | 214/214 | 0.0 | 1.7 | YYYYY | YYYYY |
| river_guard | 404/198 | 428/209 | 2.5 | 3.2 | YYYYY | YYYYY |
| burst_cold_forge | 1287 | 1363 | 0.5 | 4.1 | YYYYY | YYYYY |
| orchid_burst | 1287 | 1363 | 0.9 | 4.2 | YYYYY | YYYYY |
| uphill_snipe | 404 | 428 | 0.0 | 1.7 | YYYYY | YYYYY |
| sun_flee | 404 | 428 | 1.1 | 2.8 | YYYYY | YYYYY |
| icewall_emp_pull | 977 | 1035 | 1.1 | 4.3 | YYYY- | YYYY- |
| tower_dive | 497 | 527 | 1.0 | 1.9 | YYYYY | YYYYY |
| pit_trap | 643 | 680 | 1.0 | 2.4 | YYYYY | YYYYY |
| atos_vyse_lock | 703 | 745 | 1.1 | 2.4 | YYYYY | YYYYY |
| gleipnir_burst | 901 | 954 | 2.6 | 3.0 | YYY-Y | YYY-Y |
| force_chase | 636 | 674 | 1.5 | 3.1 | YYYYY | YYYYY |
| ghost_finish | 296 | 314 | 0.0 | 3.7 | YYYYY | YYYYY |
| blink_fog | 497 | 527 | 1.9 | 2.5 | YYY-Y | YYY-Y |
| cataclysm_finish | 669/669 | 709/709 | 0.0 | 8.2 | YY-YY | YY-YY |
| fog_ambush | 636 | 674 | 1.9 | 3.6 | YYYYY | YYYYY |
| bkb_bait | 762 | 807 | 12.9 | 14.2 | YYY-Y | YYYYY |
| dust_hunt | 549 | 581 | 4.9 | 6.6 | -YY-- | -YY-- |
| tornado_chain | 940 | 996 | 3.0 | 3.6 | -YYY- | YYYY- |
| river_guard_2 | 1134/233/100 | 1200/246/100 | 5.7 | 6.8 | YYYY- | YYYY- |
| cliff_blink | 636 | 674 | 1.0 | 2.7 | YYYYY | YYYYY |
| highground_hold | 1134/497/497 | 1200/527/527 | 4.2 | 7.6 | YYYY- | YYYY- |
| refresher_double | 995 | 1053 | 4.2 | 4.8 | YYY-- | YYY-- |
| triple_kill | 669/669/669 | 709/709/709 | 0.0 | 1.7 | YYY-- | YYY-- |
| tower_tornado | 636 | 674 | 1.7 | 3.3 | YYYYY | YYYYY |
| gauntlet | 1046 | 1108 | 21.5 | - | YY--- | YY--- |
| blink_denial | 901 | 954 | 1.6 | 2.6 | YYY-- | YYY-- |
| shadow_strike | 730/730 | 773/773 | 3.3 | 6.3 | YYYY- | YYYY- |

- **ghost_escape** (legacy id): Radiant Triangle jungle, hero on a 'choke' cell (tree lines break sight), ONE chaser 450-550 u away in sight (rand pick 3 / jit 80), aware 1, msMul 1.2, 12 s, night. obj.caught 180 = visible contact; obj.bump 80 = a chaser walking into the INVISIBLE hero finds it (fail 'caught', detail 'bump'). No Dust: the lesson is "Ghost Walk, then keep moving".
- **ghost_slip**: chasers 600-750 u (was 800-1050), both aware 1, msMul 1.15, caught 180, bump 80, 12 s; nightAt 5 unchanged.
- Bot check (seeds 1-8, every tier): Ghost Walk + walk away wins 8/8 on both; Ghost Walk then stand still loses 8/8 (bump at 1.1-5.7 s); idle loses 8/8.
- **Result card**: RESULT_MIN 1.0 s + RESULT_AUTO 3.0 s. run.cont() leaves the card once it has shown >= 1 s; otherwise auto-continue at 4 s with a visible countdown. runLeft and w.t do not run in 'result'. input.js: in 'result' any non-modifier key / canvas click calls run.cont and is consumed. combobar.js draws the card (CLEARED +N / FAILED: reason, "press any key - auto in N"); its comboDone / comboFail toasts are skipped in scenario modes (SFX kept).
- **"Not invoked"**: i18n string removed; casting a non-invoked spell from input plays the fail SFX only. Abilities.check still returns 'notInvoked' (AI / tests).
- Tests: tests/playtest2_v6.test.js (new); tests/ceo_v6_core.test.js updated.

## v6 playtest 3 (items 18-20)

### 19. HUD stats vs Dota (15.webp: lvl 25, Boots of Speed, Q/W/E 8, special_bonus_unique_invoker_13, W-W-W, Ghost Walk)
Sources: KV npc_dota_hero_invoker (MovementSpeed 280, ArmorPhysical -1, AttackDamage 19-25, BaseAttackSpeed 100, MagicalResistance 25,
attributes 19+2.5 / 14+2.0 / 22+4.0, +1 STR/AGI/INT per Quas/Wex/Exort level), invoker_wex move_speed_per_instance 0.6..5.4 /
attack_speed_per_instance 1..9 (x2 with _13), invoker_ghost_walk self_slow -20..20 on wex level (not doubled), item_boots
bonus_movement_speed 45; dota_english: AGI = 1 AS + armor, INT = 0.1% MR.
- MS = (280 + 45) x (1 + 3 x 9.6% + 15%) = 467.35 -> **467**. Cap 550. Formula was already correct.
- AS = 100 + AGI 70 + 3 x 16 = **218**.
- Damage = avg(19, 25) + INT 126 = **148**. The HUD now shows the average (was the 145-151 range); the tooltip keeps the range.
- Armor = -1 + AGI / 6 = 10.67 -> HUD **10**: whole armor, rounded down (Dota HUD). Tooltip keeps 1 decimal.
  The localization says "0.16 armor per AGI", but 1/6 is what the KV/engine uses and what reproduces 10.67.
- MR = 25% + 0.1% x INT 126 = 37.6% -> **38%**.
- Root cause of 439 vs 467: the trainer spends at most 7 levels per orb (RULES.ORB_MAX = 7, G3). The 7.41 KV has max_level 8,
  plus 1 with the Scepter. At 7/7/7, the result is 325 x (1 + 3 x 8.4% + 10%) = 439.4.
  REQUEST (lead, rules.js is not owned): raise ORB_MAX to 8. This changes the pool math (3 x 8 + 8 talents = 32 vs 29 points).
- Test: tests/playtest3_v6.test.js builds the 8/8/8 ctx un-normalized with IT.Hero.build (now exported).

### 18. Scepter / Shard audit (KV mods src scepter/shard vs sim)
| Ability | Upgrade (KV) | Status |
|---|---|---|
| quas/wex/exort | Scepter: max_level +1, scepter_bonus_levels +1 (ONE chosen orb, 7.41) | implemented (bonusLevels) |
| ghost_walk | Shard: apply_ice_wall_debuff (Ice Wall DPS to enemy heroes in its AoE) | implemented (already); **no Scepter upgrade exists** in the KV or localization |
| ice_wall | Scepter (Quas): Ice Floe, i.e. wall_width +45, glacier_formation_delay, root_delay 2.5, root_duration 2.5, root_damage 325 | **implemented now**: glacier forms after the delay; a hero/dummy continuously inside for root_delay is rooted and takes root_damage once. vector_cast_range +600 NOT implemented (the wall is still placed in front of the facing; vector targeting needs input work) |
| tornado | Scepter (Wex): twisters (twister_damage/duration/distance_interval) | implemented (already) |
| sun_strike | Scepter (Exort): Cataclysm cataclysm_count +2 | implemented (already) |
| sun_strike | Shard: create_forged_spirit_on_hero_damage | implemented (already) |
| emp | Shard: drag_speed 125, damage_per_mana_pct +50% | implemented (already) |
- Fix: Scepter upgrades used to apply to every spell. Now they are gated by the chosen orb (Values.SCEPTER_ORB, ScepterUpgradeID 1/2/3),
  the same as the bonus level. A legacy ctx (scepter with no scepterOrb) still upgrades all.
  js/sim/agh.js (tooltip lines) reads each line under its own orb (minimal fallout, not in the owned list).

### 20. Combo Sandbox side-pane list does not scroll
- Cause: with "Confine mouse to game" (pointer lock), every wheel/mouse event targets the locked canvas. The wheel zoomed the
  camera, and the list's native scrollbar never received the mouse. Unlocked, the list already scrolled (.clist overflow-y:auto + wheel stopPropagation).
- Fix (js/input.js): when locked, the wheel over a HUD element scrolls the nearest scrollable ancestor under the virtual cursor and
  never zooms. A left press in that element's scrollbar gutter starts a thumb drag (scrollTop += dy x scrollHeight / clientHeight) until mouseup.
  Other presses are still routed as synthetic clicks.

## v6 item 11 - hero level per scenario (2026-10-12)
- Base level (sc.hero.lvl, story fit): laning 6-10, mid game 12-18, late game 20-25. The legacy (25) and level-30 sets are unchanged.
  - laning: cold_start 7, sleepy_target 8, spirit_pack 8, river_rune 9, two_birds 10, uphill_snipe 10, sun_flee 10
  - mid game: river_guard 12, ghost_slip 12, ghost_finish 12, fog_ambush 12, bridge_hold 14 (12 lost bambam seed 5 in scenarios_h2), blast_push 14,
    force_chase 14, dust_escape 14, tower_dive 16, pit_trap 16, dust_hunt 16, bkb_bait 18
  - late game: jungle_hold 20, cliff_blink 20, river_guard_2 22, highground_hold 24, tower_siege 25 (22 timed out: needs the L25 talent)
- Roll: base +-1 (LVL_SPREAD) on each play. Ranked uses its own mulberry32 stream (seed ^ 0x5bd1e995), so scenario picks and twists do not move.
  A run with no seed rolls at random.
- Feasibility (Ranked.feasible): every orb a step spell needs is at >= 1. The summed step mana (spells and items) is <= max mana.
  A reused spell's (uses-1) x cd fits the limit, and so does (distinct spells - 2) x invoke cd. destroyTower must fall inside the towerMath window.
  An infeasible roll searches +d, then -d, for d up to 3 (LVL_SEARCH). If nothing fits, it falls back to the base level.
  Over 11000 rolls (all scenarios x 5 tiers x 50 seeds) the clamp was never hit.
- The loadout is autoLoadout at the rolled level, plus scepter/shard/items (Ranked.loadoutAt). foeHp reads that rolled loadout (HP_SHARE / HP_CAP 0.9).
- HUD: Ranked.hud().heroLevel. HudSteps.heroLv(rk) gives the 'LV n' label (i18n hud.rkHeroLv). The countdown panel itself is drawn in js/ui/hud.js,
  which this item does not own, so the label is not placed yet. Wiring it is one line in H.updRanked's `if (cd)` block.
- Bot (levels_v6.test.js, seeds 1-6): easy clears everything, and common kills no foe before its last mandatory step. The exceptions also fail identically at 6afc533:
  triple_kill s3/s6 burst and shadow_strike s3/s4 missing (easy+common); cataclysm_finish common s2/s4/s5; plateau_escape common s1/s6; gauntlet common (all, time).

## v6 item 17 - pit_trap juke (2026-10-12)
- Pit region: in the extracted map, Roshan's spot is solid rock. The pit is the walkable crater around it: tiles where >= 6 of 8 rays hit
  unwalkable ground within 8 tiles, flood-filled inside a 9-tile box (Ranked.pitRegion, cached on map._pit).
  roshan_pit has 55 tiles and roshan_pit_top 57. The maps.js 'pit' zone box is wider than the crater and also tags arenas outside it, which is why the old spawn landed on the bank.
  A new 'inpit' tag is real crater membership.
- Spawn { pit:'bank', d:[450,600] }: a walkable tile outside the crater at the same elevation, from where a 600 u Force Staff push toward the deepest point ends inside.
- Juke (units.js tickJuke): it triggers when the foe is hurt or sees the hero within 500 u. After its reaction time (and while not disabled) it uses Blink to the deepest point,
  or Force Staff when Blink is locked by damage. Both go through useItem: telegraph event with say:'juke' -> dummychat line, itemUse sound,
  and blinkTell fx. After the juke the foe stands still. Juke units skip the legacy dummyEscape / blinkAfter and defend() item escapes.
- Kill: the kill records inside:'pit' when the foe dies inside the crater. obj.how.inside:'pit' fails with method/outside otherwise. focus:['pit'].
- js/ui/dummychat.js (not owned): the telegraph handler speaks p.say when it is set (a one-line change).
- tests/scenarios_v5.test.js: the old "foe in the pit" spot assertion now checks the bank spawn plus the juke target in the pit.
- Bot: pit_trap clears at easy and common on seeds 1-6. hard/bambam sometimes lose (stun bolt), and ian mostly times out.

## v6 items 34/35/37 (items fixes)
- #34 Force Staff self-cast: `selfCast: true` on the item def (forcestaff only; Eul's is already target 'none'). input.js `selfCast(id)` casts it on the hero (push along facing) for double-tap within `doubleTapTimeout`, Alt+key, HUD slot double-click and Alt(held)+HUD click (`In.keys.has('Alt')`; hud.js untouched). Single press keeps the normal unit-target cast.
- #35 Refresher = ABILITIES ONLY (CEO rule): clears every spell cd in `hero.cd` + `inv.invokeCd`; item cds (BKB, Blink... and Refresher itself) are never touched. DOTA DISCREPANCY for the CEO: in real Dota 2 item_refresher resets ability AND item cooldowns (all items except itself, Refresher Shard/Orb, a few exceptions), so this is intentionally weaker than Dota (combo `t_refresher_full` etc. still work since they only reuse spells).
- #37 Boots never stack: `IT.Loadout.fixItems` (inside `normalize`) drops Boots of Speed when Boots of Travel is present (and any duplicate boots); `Loadout.BOOTS` is now priority-ordered ['travels','boots']. `validate` still rejects two boots. Scenario kits already carry exactly one boots (scenarios.js v6 pass); sim `itemStats` counts one (travels > boots).

## v6 item 40 (per-play variation)
- `pr.vary = { seed, posJit, hpMul, hp, reactionMul, boots }`, drawn in `prepare(sc, df, skin, lvl, vrng)` from `run.varRng = mulberry32(seed ^ 0x9e3779b1)` (own stream: picks / twists / level rolls unchanged). Ranked / any seeded run: reproducible per seed; seedless practice: random. `prepare()` without an rng stays pure and un-varied (`pr.vary = null`); `pr.hp` stays the base `foeHp` (the variation is in `pr.vary.hp`).
- posJit: extra +-80-150 u on the spot jitter (on top of `rand.jit`), per-unit rng `vary.seed + i*7919` so placement is reproducible; `spot()` keeps walkable / tower range / LOS rules (6 draws, then the original spot). Followers (`of:`) keep their offset from foe 0.
- hp: x(1 +- 8%), per foe clamped to [(credited - last damaging part) x 1.02, max(base, HP_CAP x credited)]: the combo still kills (HP_CAP 0.9 rule from playtest 2) and no foe dies before its last required step.
- reaction: x(1 +- 5%) (never on `still` foes, which stay 99).
- boots: movers (`chase` / `flee` / `march`) and 'escape' / 'disable_escape' runners get `boots`, movers `travels` from hero level 16; `still` foes never. ms = tier speed + KV `bonus_movement_speed` (`Units.bootBonus`: 45 / 90, travels first) for scripted movers and enemy heroes; the item shows in the enemy card. `ENEMY_ITEMS` gained 'boots', 'travels'. `msMul` units (ghost_escape, ghost_slip) already model boots: msMul only, no extra bonus.
- Per-scenario `vary: { posJit, hp, reaction, boots }` overrides (bot-verified, 16 seeds x easy / common): boots false: highground_hold, plateau_escape, gauntlet (a booted marcher / chaser cannot be held or outrun); river_guard_2 boots false + posJit 40-80; posJit 40-80: icewall_emp_pull, sun_snipe, pit_trap; posJit 0: river_guard (a marcher died early on seed 15 with any jitter), blink_denial (Atos timing), triple_kill (one Sun Strike must catch all three), ghost_escape (spec: 450-550 u), gauntlet; dust_hunt hp -8%..0.
- Bot sweep 16 seeds: no new failure vs the un-varied baseline except bot-limited ones (shadow_strike, plateau_escape common, pit_trap easy 1 more); common: no foe dies early (gauntlet common is broken at baseline, 16/16). levels_v6 KNOWN gained triple_kill|easy|5, triple_kill|common|5, plateau_escape|common|4 (variation shifts which seeds hit the bot-limited ones). ceo_v6_core (sun_snipe hp, dust) and ent_v5 (hp, reaction) assert exact nominal values: they set `run.varRng = null`.
- Tests: tests/variation_v6.test.js (shape, seed determinism, seeds differ, hp +-8%, boots / travels / ms, bot sweep easy 1-6 + common 1-3 reusing the levels_v6 harness).
