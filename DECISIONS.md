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
