# Gameplay / balance / mechanics review (v6 #30)

Measured 2026-10-13 on main + this pass. Harnesses: scripted bots (`tests/_edgebot.js` levels bot + spot / tower / innate moves,
`juke_v6` spot bot for juke-tagged, `tests/_funbot.js` for `funBot`), cheese bots (idle, auto-attack only, naive run-away from the
nearest foe, last-spell skipped), `tools/score_sample.mjs` (30 seeds, ramp), a 160-run ranked pick sample (40 runs x 4 rating bands).
Bot = frame-perfect scripted recipe with fixed aim: a 0/6 is "bot-limited" until a human route is shown, not proof of impossibility.

## Fixes made (tests: `tests/gameplay_v6.test.js`; one line each in DECISIONS.md "v6 #30")

| # | fix | evidence before -> after |
|---|---|---|
| F1 | Economy: `POINTS_K` 40 -> 56, `PRICING.REF_RUN` 200 -> 250, `MAX` 35 -> 30 | catalogue 1460 pts (Vitinian 250) at the measured 178.5 pts/run = 36.8 min -> 26.3 min |
| F2 | Marchers (`mot:'march'`) never `fights` | auto-attack-only won jungle_hold + icewall_ramp_defense 6/6 at hard AND bambam (0-4/6 below: inverted difficulty) -> 0/6 |
| F3 | AI never BKBs a zone that pierces BKB (KV `SpellImmunityType` ENEMIES_YES: Sun Strike / Cataclysm); tier BKB (`df.useBkb`) skips marchers | bambam bridge_hold / offlane_survival / highground_hold bot 0/6 -> 6/6 (marchers burned BKB on the opening Sun Strike, then walked through Blast / Meteor immune) |
| F4 | gauntlet: Dust step first (the foe carries Shadow Blade; the hero's Dust was never in the recipe) | bot common 0/6 -> 6/6 |
| F5 | Timed escapes (no `unseen`) need their step spells cast (a cast counts: a chaser may BKB the Tornado) | walking straight away won ghost_escape / ghost_slip / dust_escape / smoke_gank_escape / plateau_escape at ian-common and pinned_escape up to hard -> 0/6 everywhere; bot clears unchanged |

Not changed after testing: crediting the tier BKB in `foeHp` (bambam) made foes that never pop it (no disable cast at them) die
before the last step (`method/missing`: tornado_chain 6/6 -> 0/6), so it needs a disable-aware credit (issue I3). The "skip last
spell" cheese on funBot scenarios (save_the_ally, tornado_emp_drop, ...) was a harness artifact (the patched steps also rewrote
`need`); re-run with the original `need`: 0/6 everywhere.

## 1. Scenarios (77): clears per tier, cheese, verdict

Bot clears of 6 seeds (I/E/C/H/B = ian / easy / common / hard / bambam). C clear s = median common clear time. Cheese = a cheese bot
wins >= 3/6 at that tier (aa = auto-attack only, run = naive run-away, idle, skip = last spell skipped; levels-bot scenarios only).
Verdict: BROKEN = no tier clears; filler (cheese) = cheese wins at common or above; filler (trivial) = non-escape cleared < 2 s;
drill = single-spell skill check; fun = fun-tagged multi-step / juke; solid = multi-step, not fun-tagged.

| id | lvl | fun | obj | par/limit(C) | bot clears I/E/C/H/B (of 6) | C clear s | cheese (wins >=3/6) | verdict |
|---|---|---|---|---|---|---|---|---|
| sleepy_target | 1 |  | kill | 8/17 | 6/6/6/6/6 | 1.7 | - | filler (trivial) |
| cold_start | 1 |  | kill | 14/25 | 6/6/6/6/6 | 7.1 | - | solid |
| spirit_pack | 1 |  | kill | 14/25 | 6/6/6/6/6 | 5 | - | solid |
| ghost_escape | 2 | y | escape | 10/12 | 6/6/6/6/6 | 12 | - | fun |
| gleipnir_cluster | 2 |  | rootAll | 6/14 | 6/6/6/6/6 | 0.4 | - | filler (trivial) |
| river_rune | 2 | y | kill_with | 10/19 | 6/6/6/6/6 | 3.3 | - | drill |
| sun_snipe | 3 | y | kill | 8/17 | 6/6/6/6/6 | 2.9 | - | drill |
| tornado_sun | 3 |  | kill | 10/19 | 6/6/6/6/6 | 3.1 | - | solid |
| two_birds | 3 |  | killN | 10/19 | 6/6/6/6/6 | 1.7 | - | filler (trivial) |
| river_guard | 3 | y | kill | 12/22 | 6/6/6/5/6 | 2.6 | - | fun |
| rune_contest | 3 | y | pickup | 10/19 | 6/6/6/6/0 | 7.4 | - | drill |
| burst_cold_forge | 4 |  | kill | 14/25 | 6/6/6/6/5 | 4.1 | - | solid |
| orchid_burst | 4 |  | kill | 16/27 | 6/6/6/6/6 | 4.1 | - | solid |
| uphill_snipe | 4 | y | kill | 10/19 | 6/6/6/6/6 | 1.7 | - | filler (trivial) |
| sun_flee | 4 | y | kill_with | 8/17 | 6/6/6/1/0 | 2.8 | - | drill |
| bridge_hold | 4 | y | hold | 12/14 | 6/6/6/6/6 | 2 | - | fun |
| treeline_loop | 4 | y | escape | 20/20 | 2/6/6/0/0 | 7.2 | run:IE | fun |
| save_the_ally | 4 | y | kill | 10/19 | 6/6/6/6/1 | 3 | - | fun |
| icewall_emp_pull | 5 |  | kill | 12/22 | 6/6/6/6/6 | 4.1 | - | solid |
| blast_push | 5 |  | push | 8/17 | 6/6/6/6/6 | 0.7 | - | filler (trivial) |
| tower_dive | 5 |  | kill | 14/25 | 6/6/6/6/6 | 2 | - | solid |
| pit_trap | 5 |  | kill | 14/25 | 1/6/6/5/6 | 5.8 | - | solid |
| ghost_slip | 5 | y | escape | 12/12 | 6/6/6/6/6 | 12 | - | fun |
| river_fog_crossing | 5 | y | reach | 14/25 | 6/6/6/6/6 | 4.3 | - | fun |
| pit_in_out | 5 | y | escape | 20/20 | 0/0/0/0/0 | - | run:IE | BROKEN |
| long_lane_snipe | 5 | y | kill_with | 8/17 | 6/6/6/6/6 | 2.7 | - | drill |
| pinned_escape | 5 | y | escape | 12/12 | 6/6/6/6/6 | 12 | - | fun |
| meteor_lane_kill | 5 | y | kill | 12/22 | 6/6/6/3/0 | 4.2 | - | fun |
| tp_snipe | 5 | y | kill_with | 8/17 | 6/6/6/5/6 | 3.1 | - | drill |
| tornado_emp_drop | 5 | y | kill_with | 12/22 | 6/6/6/6/3 | 3.1 | - | fun |
| atos_vyse_lock | 6 |  | kill | 14/25 | 6/6/6/6/6 | 2.4 | - | solid |
| gleipnir_burst | 6 |  | kill | 15/26 | 6/6/6/0/0 | 3 | - | solid |
| force_chase | 6 |  | kill | 14/25 | 6/6/6/6/6 | 3.1 | - | solid |
| ghost_finish | 6 | y | kill | 22/35 | 6/6/6/6/6 | 4 | - | fun |
| dust_escape | 6 | y | escape | 12/12 | 6/6/6/6/6 | 12 | - | fun |
| tower_siege | 6 |  | destroyTower | 10/14 | 6/6/6/6/5 | 11.3 | skip:IECHB | filler (cheese) |
| highground_bait | 6 | y | escape | 20/20 | 6/6/6/6/5 | 7.4 | run:I | fun |
| pit_force_exit | 6 | y | escape | 20/20 | 6/6/6/6/1 | 5.5 | run:I | fun |
| pit_mouth_snipe | 6 | y | kill_with | 12/22 | 6/6/6/6/6 | 2.6 | - | drill |
| river_mouth_ambush | 6 | y | kill | 10/19 | 6/6/6/6/6 | 3.5 | - | fun |
| offlane_survival | 6 | y | hold | 16/16 | 6/6/6/6/6 | 2.5 | - | fun |
| qop_blink_snipe | 6 | y | kill_with | 12/22 | 6/6/6/3/6 | 5.5 | - | fun |
| tornado_tp_cancel | 6 | y | kill | 12/22 | 6/6/6/4/4 | 5.2 | - | fun |
| bkb_tower_hitter | 6 | y | kill_with | 8/17 | 6/6/6/6/6 | 1.7 | - | filler (trivial) |
| tornado_icewall_landing | 6 | y | kill | 12/22 | 6/6/6/6/6 | 3.5 | - | fun |
| blink_fog | 7 | y | kill | 12/22 | 6/6/6/0/0 | 2.4 | - | fun |
| cataclysm_finish | 7 |  | kill | 8/17 | 6/6/6/6/6 | 3.1 | - | drill |
| fog_ambush | 7 | y | kill | 10/19 | 6/6/6/6/5 | 3.3 | - | fun |
| bkb_bait | 7 |  | kill | 20/32 | 6/6/6/3/5 | 14.2 | - | solid |
| dust_hunt | 7 | y | kill | 14/25 | 3/6/6/0/0 | 6.1 | - | fun |
| jungle_hold | 7 |  | hold | 16/20 | 6/5/6/6/6 | 5 | - | solid |
| ramp_shuffle | 7 | y | reach | 14/25 | 6/6/6/6/6 | 4.7 | - | fun |
| night_juke | 7 | y | escape | 20/20 | 6/6/6/0/0 | 7.4 | run:IEC | filler (cheese) |
| pit_ghost | 7 | y | escape | 20/20 | 6/6/5/0/0 | 10.6 | run:IE | fun |
| edge_gank | 7 | y | kill | 14/25 | 6/6/6/6/6 | 2.1 | - | fun |
| am_coldsnap_deny | 7 | y | kill | 12/22 | 6/6/6/6/5 | 3.2 | - | fun |
| pit_fight_blast | 7 | y | killN | 12/22 | 6/6/6/6/6 | 3.3 | - | fun |
| ghost_ambush | 7 | y | kill | 14/25 | 6/6/6/6/6 | 5.3 | - | fun |
| tornado_chain | 8 |  | kill | 16/27 | 6/6/6/6/6 | 3.6 | - | solid |
| river_guard_2 | 8 | y | kill | 14/25 | 6/6/6/6/0 | 6.8 | skip:I | fun |
| cliff_blink | 8 |  | kill | 12/22 | 6/6/6/6/6 | 2.7 | - | solid |
| highground_hold | 8 |  | kill | 16/27 | 6/6/6/5/6 | 7.9 | skip:IEH | filler (cheese) |
| ghost_vs_gem | 8 | y | escape | 20/20 | 6/6/6/6/1 | 7 | run:IEC | filler (cheese) |
| blinker_tornado | 8 | y | kill | 14/25 | 6/6/6/4/1 | 6.7 | - | fun |
| smoke_gank_escape | 8 | y | escape | 12/12 | 6/6/6/6/6 | 12 | - | fun |
| icewall_ramp_defense | 8 | y | hold | 14/14 | 6/6/6/6/6 | 3.1 | aa:I | fun |
| refresher_double | 9 |  | kill | 20/32 | 6/6/6/0/0 | 4.8 | skip:IEC | filler (cheese) |
| triple_kill | 9 |  | killN | 8/17 | 4/4/4/4/4 | 1.7 | - | filler (trivial) |
| blast_push_3 | 9 |  | push | 10/19 | 6/6/6/6/6 | 0.9 | - | filler (trivial) |
| tower_tornado | 9 |  | kill | 10/19 | 6/6/6/6/6 | 3.3 | - | solid |
| plateau_escape | 9 | y | escape | 14/14 | 6/5/4/2/0 | 14 | - | fun |
| dust_bait | 9 | y | escape | 25/25 | 6/6/0/0/0 | - | - | fun |
| aegis_snatch | 9 | y | pickup | 10/19 | 6/6/6/0/0 | 3.4 | - | drill |
| gauntlet | 10 | y | kill | 16/27 | 6/6/6/0/0 | 4.7 | - | fun |
| blink_denial | 10 |  | kill | 14/25 | 6/6/6/0/0 | 2.6 | - | solid |
| shadow_strike | 10 | y | kill | 16/27 | 4/4/4/3/5 | 8.6 | - | fun |
| no_invis_juke | 10 | y | escape | 20/20 | 6/6/6/0/0 | 6.6 | run:I | fun |

(aa / run columns: after all fixes; idle / skip: pre-fix sweep, levels-bot scenarios only.)

Summary: 37 fun, 17 solid, 9 drill, 8 trivial filler, 5 cheese filler, 1 broken (pit_in_out); cheese at common+ after F5 is limited to
tower_siege (Meteor Hammer optional: `destroyTower` has no `need`), highground_hold / river_guard_2 (by design: wiping a `cross`
wave wins, `need` bypassed), refresher_double (second round optional at ian-common: one round + Meteor > 0.72 x credit), and the
unseen jukes listed in I4.

## 2. Enemy AI per tier (js/data/difficulty.js + derived)

| | ian | easy | common | hard | bambam |
|---|---|---|---|---|---|
| reaction s (x2.5 unaware) | 1.4 | 1.0 | 0.6 | 0.35 | 0.25 |
| notice delay s = notice x (1 - awareness) (x1/3 within 350 u) | 3.4 | 2.34 | 1.28 | 0.42 | 0 |
| telegraph s before an item | 1.5 | 1.0 | 0.6 | 0.3 | 0 |
| exec itemP / predict / dodge | .35/.2/no | .55/.45/no | .8/.7/no | .92/.9/yes | 1/1/yes |
| chaser speed u/s: max(msBase 285-320, 380 x chase) x msMul (+45 boots) | ~246 | ~264 | ~307 | 380 | 418 |
| marcher u/s: max(msBase, 270 x chase) x msMul | ~246 | ~264 | ~287 | ~302 | ~302 |
| hpMul (kill foes: capped, see I8) / armorAdd / dmgMul | .8/0/.35 | .9/0/.6 | 1/1/1 | 1.05/3/1.25 | 1.1/4/1.5 |
| fights / belief split+detect / recatch | no/no/- | no/no/- | no/no/- | yes/yes/Force | yes/yes/Blink+Force |
| BKB (every foe without an item list) / orbCut / timer | no/0/2 | no/0/1.5 | no/0/1.3 | no/0/1.1 | yes/1/0.9 |

Invoker KV MovementSpeed 280: at ian / easy every chaser is SLOWER than the hero; at common it closes 27 u/s. This is the root of
the run-away cheese (F5, I4). The ramp is steep between common and hard (reaction x0.58, notice x0.33, dodge on, fights on, chaser
+24% speed) and bambam adds BKB on every foe: most hard+ bot losses below are dodged skillshots (`method/missing`), BKB, or foes
that out-run a fixed route.

## 3. Sim vs Dota KV (tools/.cache KV, sha 217732b2)

| where | sim | KV / Dota | note |
|---|---|---|---|
| game.js ROSHAN (not mine) | armor 20, magicRes 0.25, dmg 65, range 100, vision 800 | npc_dota_roshan ArmorPhysical 30, MagicalResistance 55, AttackDamageMin/Max 75, AttackRange 150, VisionDaytimeRange 1400 | scenario-scaled hp is fine; the rest is plain divergence (Meteor / Blast on Roshan do ~1.7x the KV damage) |
| spells.js KNOCK_SPEED 150 (report) | Blast push = knockback_duration (1.2-1.8) x 150 = 180-270 u | KV has no distance; the push speed lives in the DLL modifier | verify against the DLL modifier before trusting the 180-270 u |
| spells.js Cataclysm (report) | strikes every COMBATANT incl. forge spirits / dummies | Dota: enemy heroes only | small; matters in pit_fight_blast / cataclysm_finish counts |
| spells.js Ice Wall | #71 vector work in progress | KV vector_cast_range (Scepter) | owned by #71 |
| units.js tier BKB use | (fixed F3) BKB vs Sun Strike | invoker_sun_strike SpellImmunityType ENEMIES_YES | now never wasted on a piercing zone |
| items.js ATOS_SPEED 1900 | hard-coded | ProjectileSpeed not baked | Dota value; ok |
| game.js ENEMY.blink range 900 / cd 8 (innate) | trainer assumption | no QoP / AM KV in the cache | AM 7.3x blink cd is 12-6 s; 8 s is generous to the player; ok |
| game.js ENEMY hero | magicRes 0.25, vision 1800 / 800 night | hero base 25 %, VisionDaytimeRange 1800 / Night 800 | match |
| towers.js | T1 1800 / armor 12 / 88-92 ... T4 2600 / 21; range 700, BAT 0.9 | npc_units | match |
| gem 900, TP 3 s, item cast points 0, turn rate 0.6, orb level 8 = Scepter | | KV | match |
| hero orb passives | Quas regen / Wex MS + AS / Exort damage per instance from KV | | modelled (see insights: never rewarded) |

## 4. Ranked flow (160 runs: 40 per band herald / mid / ancient / top)

- Fun share per run 80-82 % (target >= 50 %: 4 FUN_TURNS + non-fun turns drawing from ALL 77, 65 % of which are fun-tagged, ~100
  fun picks per band came from non-fun turns). Twists 4.05 / run. Est. run length p50 4.1 (herald) - 4.6 min (top) =
  8 x (12 s countdown + min(limit, par x 1.3) + 4 s).
- Level by turn: herald 1.4 -> 8.0; mid 3 -> 10; ancient 5 -> 10 (turns 6-8 at L10/L9.8); top 7 -> 10, five of eight turns at L9-10.
- Difficulty by turn: herald ian -> common; mid easy -> hard; ancient common -> bambam at turns 7-8; top hard -> bambam from turn 4.
- Pool per level {1:3, 2:3, 3:5, 4:7, 5:12, 6:15, 7:13, 8:8, 9:7, 10:4}: the L9-10 end of every mid+ run draws 11 scenarios.
  Most picked: shadow_strike 83, gauntlet 81, no_invis_juke 79, blink_denial 63, dust_bait 52 (vs a 10-20 median). Top band:
  7 within-run repeats / 40 runs. Never picked: none.
- Where the curve breaks: of the 11 L9-10 scenarios, at hard / bambam the bot clears gauntlet 0/0, blink_denial 0/0,
  aegis_snatch 0/0 (the foe takes the Aegis at 3.9 s), refresher_double 0/0, no_invis_juke 0/0, dust_bait 0/0 (0 at common
  too), plateau_escape 2/0, triple_kill 4/4, shadow_strike 3/5, tower_tornado + blast_push_3 6/6. A top-band player meets
  bambam x L9-10 on turns 4-8.

## 5. Medals, points, shop (score_sample, 30 seeds, ramp)

Points / run after F1 (POINTS_K 56):

| band | clean p10/50/90 | clean mean | sloppy p10/50/90 | sloppy mean |
|---|---|---|---|---|
| ian | 46/79/159 | 99 | 23/43/93 | 51 |
| easy | 83/174/330 | 183 | 43/88/185 | 97 |
| common | 178/332/520 | 353 | 85/140/336 | 184 |
| hard | 256/398/542 | 419 | 85/158/342 | 190 |

Common mean (clean + sloppy) = 268.5 -> 1460 / 268.5 x 4.5 = 24.5 min measured (26.3 at the nominal REF_RUN 250): inside 20-30.


- Before F1 (POINTS_K 40): common mean (clean + sloppy) 178.5 pts / run -> 1460 / 178.5 x 4.5 = 36.8 min (32.9 at the stale
  REF_RUN 200); MAX had been raised to 35 to let the Vitinian price pass. After: REF_RUN 250 (= 178.5 x 1.4), 26.3 min nominal;
  shop_v6 bounds hold (REF x 1.5 -> 17.5 min > 15, REF x 0.7 -> 37.5 < 50).
- Points concentration: relic `tornado_kills` = 109 of the per-run mean (~35 %); `alacrity_dmg` 0.1, `blink_kills` 0.3,
  `multi_icewall` 0.8 pts / run are dead relics (I7).
- Medals: p50 per run clean ian Archon 3, easy Archon 2, common Crusader 5, hard Crusader 3 (sloppy Herald 4 - Guardian 4); 8/8
  projections Legend 5 (ian) -> Immortal (hard p95). The medal goes DOWN with tier for clean play because solved counts fall
  (solved50 6 -> 3): the ramp, not the bands, decides medals.

## 6. Free Play / dummy / enemy rows

- Dummy presets (training 2500 hp stationary, standard 2200 / 5 armor / 300 ms wander, expert 2600 / 10 armor / 320 ms evasive +
  stun bolt) refill below 25 %, sane.
- Enemy card rows (`js/sim/enemycard.js` spec) pass hp / armor / telegraph / awareness / notice / reaction / dmgMul / fights per
  tier, but NOT `exec`, `msMul` or belief: an "Ian" row foe uses its items with EXEC0 (itemP 1, predict 1, no jitter) at full
  speed (I9).
- ENEMY defaults match KV hero base (25 % magic res, 1800 / 800 vision).

## 7. Issues (not fixed): issue / evidence / proposal / effort / confidence

| id | issue | evidence | proposal | effort | conf. |
|---|---|---|---|---|---|
| I1 | Top-band curve break: bambam x L9-10 | 7 of 11 L9-10 scenarios 0/6 for the bot at hard AND bambam; top band plays them at bambam from turn 4 | cap the ramp at hard for L9-10 (`rampDiff = min(3, ...)` when level >= 9) or give L9-10 a per-scenario `maxDf`; re-sweep | S | med |
| I2 | L9-10 pool starvation | 11 scenarios; shadow_strike / gauntlet / no_invis_juke ~80 picks each in 160 runs vs median 10-20; top band 7 repeats | levelTarget window +-1 with recency weighting; promote hard variants of L7-8 scenarios (blinker_tornado, ghost_vs_gem) to L9-10 | M | high |
| I3 | Bambam BKB not in foe hp | `comboDamage` credits BKB only for scenario `useBkb`; the tier BKB pops on the first disable and cuts later magic 60 % (KV spell_reduce 60) | credit the 60 % only after the first DISABLE step (coldsnap / tornado / atos / gleipnir / hammer), not after the opener; re-sweep bambam | M | med |
| I4 | Unseen jukes still walk-away at low tiers | naive run wins treeline_loop / pit_in_out ian-easy, night_juke + ghost_vs_gem ian-common, highground_bait / pit_force_exit / no_invis_juke ian (chasers 246-264 < hero 280 lose sight) | juke-tagged chasers: speed floor = hero ms x 1.05 at every tier (difficulty from notice / belief instead) | S | med |
| I5 | pit_in_out unclearable | bot 0/6 at every tier; boots chasers 316-425 u/s from 624 u; dx 900-1100 / no-boots variants either stay unclearable or turn into walk-away wins | rework the route (enter by one mouth, exit the far side while chasers commit) or drop the `fun` tag until reworked | M | med |
| I6 | Timers far too loose | kill scenarios: bot median clear 30 % of par, 16 % of limit (p90 28 %); "hard: tight timer" is not true (limit = ceil(par x 1.1 + SLACK 6)) | lower SLACK at hard / bambam; keep ian roomy | S | med |
| I7 | Relic points concentration | tornado_kills ~35 % of points; alacrity_dmg / blink_kills / multi_icewall < 1 pt / run | rebase goalposts so each relic is reachable in its tagged scenarios; re-run score_sample, keep REF_RUN | S | high |
| I8 | hpMul is a no-op on kill foes at hard / bambam | foeHp = min(HP_CAP 0.9, HP_SHARE 0.9 x hpMul): 1.05 / 1.1 capped to 0.9 | drop hpMul > 1 from the table (keep armorAdd) or document it as "non-kill units only" | S | high |
| I9 | Free Play rows ignore tier execution | enemycard.spec omits exec / msMul; units.js EXEC0 = perfect | pass `exec: df.exec` + msMul to spawnEnemy (enemycard, not in this pass's files) | S | high |
| I10 | Roshan stats diverge from KV | armor 20 vs 30, magic res 25 vs 55 %, dmg 65 vs 75, range 100 vs 150, vision 800 vs 1400 | bake from npc_dota_roshan (game.js) and re-sweep pit scenarios | S | high |
| I11 | Hard+ skillshot losses look like method fails | gleipnir_burst / blink_fog / blink_denial hard 0/6 `method/missing`: hard foes dodge (exec.dodge) the fixed-timing Meteor / Sun Strike, then die to the rest | toast hint "it dodged: lock it first" when a step missed a dodging foe; consider dodge only after `telegraph` | S | med |
| I12 | aegis_snatch hard+ | foe takes the Aegis at 3.9 s every seed at hard / bambam (bot 0/6) | scale the foe's walk start per tier or give the hero a 0.5 s head start | S | med |
| I13 | triple_kill 4/6 every tier | seeds 3 / 6 `method/burst` at 2.9 s (kill span > 1.2 s) | widen `span` to 1.5 s or align the foes on the Meteor line | S | med |
| I14 | Deafening Blast push distance unverified | KNOCK_SPEED 150 is a guess (spells.js, other agent) | read the knockback speed from the DLL modifier | S | low |
| I15 | Cataclysm hits non-heroes | spells.js targets every combatant | heroes only (other agent) | S | high |
| I16 | Escape skill not rewarded | Wex MS per instance is modelled but no escape scores or needs an orb swap; Alacrity relic dead | an escape `bonus` for Wex x3 during the chase; an Alacrity-timed tower scenario | M | med |

## 8. Insights

- What makes the best ones fun: a moving decision under a short clock with a visible payoff. tornado_icewall_landing,
  tornado_emp_drop, save_the_ally, river_guard, bridge_hold, offlane_survival, ghost_ambush, am_coldsnap_deny, shadow_strike: the
  foe acts (flees, blinks, attacks an ally, marches) and the recipe has an ORDER that matters (lift -> land on the wall; lift ->
  EMP under it). They clear in 2-5 s for a perfect bot but punish the wrong order or a missed lead.
- Filler: sleepy_target, gleipnir_cluster (0.4 s), blast_push / blast_push_3 (< 1 s), two_birds, uphill_snipe, bkb_tower_hitter,
  triple_kill (1.7 s): one button on a still / scripted target. Fine as tutorials at L1-3; blast_push_3 and triple_kill at L9
  inflate the late pool without testing L9 skill.
- Where the curve breaks: between common and hard (dodge + fights + notice 0.42 s + chaser 380) and again at bambam (BKB on every
  foe). The ramp sends mid / ancient / top runs over both cliffs while the level target hits the 11-scenario L9-10 end (I1, I2).
- Invoker skill-ceiling gaps:
  - Orb-swap: Wex MS / AS and Exort damage per instance ARE simulated (hero.js), but nothing scores keeping Wex while running or
    Exort before a right-click; escapes are won by recipe + walking.
  - Cast-animation cancel: an order replaced during the cast point costs nothing (orders.js spends after the point) and `castStart` already queues the hard+ BKB / dodge reaction, so a cancelled cast CAN bait a BKB; but Invoker points are ~0.05 s and no scenario punishes a
    committed cast (no foe reacts to the cast animation except the BKB / dodge `pend` at hard+). A "fake Sun Strike" bait would teach it.
  - Alacrity timing: alacrity_dmg earns 0.1 pts / run; only spirit_pack / tower_siege step it. No tower-race or Roshan burst that
    needs Alacrity at the right moment.
  - Sun Strike prediction under fog: the `lead` + belief system supports it (blink_fog, fog_ambush, river_mouth_ambush,
    tp_snipe), but foe hp credits Sun Strike as a sure hit and there is no cross-map strike on a fogged, channelling or
    path-committed foe at L8+. A fogged TP / Smoke snipe at L9-10 would fill I2 with real ceiling.
- Ranked replayability: per-play variation (positions, boots, hp) + twists keep repeats from feeling identical, but the late pool
  (11) and the generous timers (I6) make the second half of a top run the same five scenarios won or lost on the same cliff.

## TOP 10 by impact

1. I1 Top-band curve break: bambam x L9-10 (cap ramp / maxDf)
2. I2 L9-10 pool starvation (window + recency, promote hard L7-8 variants)
3. I3 Bambam BKB not credited in foe hp (disable-aware credit)
4. I4 Unseen jukes walk-away at ian-easy (juke chaser speed floor)
5. I5 pit_in_out unclearable (rework or untag)
6. I7 Relic points concentration / dead relics
7. I6 Timers far too loose (SLACK at hard+)
8. I9 Free Play rows ignore tier execution
9. I16 Escape / Alacrity / orb-swap skill not rewarded
10. I10 Roshan stats diverge from KV
