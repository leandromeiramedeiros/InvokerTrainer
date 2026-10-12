# Audit v5 (plan vs built, after MAPS v5) — fix plan

Source: Fable read-only audit, 2026-10-12 (ran early by mistake; the final holistic Fable audit runs again AFTER all batches). One agent at a time, Sonnet unless noted. Each batch: tests green + browser smoke + commit/push.

## GOOD (keep)
Baked Dota KV data + spells/items faithful; progression G1-G4 exact; enemy AI (disable-start reactions, BKB/Euls/Blink/Force, danger-zone dodge, awareness); towers per Dota table; HUD TODOs 1-10 + F1 modes; i18n en=pt complete; maps v5.

## BAD / MISSING -> batches (in execution order)
| # | Batch | Covers | Model | Status |
|---|---|---|---|---|
| B | Enemies in scenarios: spawnEnemy (hp=dmg-to-kill, real death), tier telegraph/awareness/reaction/armorAdd, skin rotation, hero auto-attack from KV, drop killFrac/refill on enemies | BAD 2,6,7 | Sonnet | done |
| A | Scenario engine + >=30 v4 scenarios on v5 maps (salvage wip/scenarios-oldmap engine; arena-tag spots, no absolute coords; 'seen' fail fix; tests) | BAD 1,3,16; MISSING 1,7 | Opus | done |
| C | End splash + curated stats + PNG share; INFINITE RUN mode | BAD 4,5; MISSING 2,3 | Sonnet | done (note: burst overlaps title briefly; PNG ~0.9MB) |
| D | Combos: SS-after-tornado timing from lift_duration, missing staples, tier scores, validation (wrong-order feedback, timing windows, legit variations) | BAD 8,9 | Sonnet | done |
| F | HUD/perf: F1 chip size/backplate, map name line, 'dota' arena cap/lazy thumbs, Shiva radius 825+75 | BAD 11,13,14 | Sonnet | done |
| E | Loadout: F3 Aghanim hood picker, Free Play enemy card (place/config), difficulty badge in picker | BAD 10,12; MISSING 5,8 | Sonnet | done |
| S | Sounds: redo all SFX to resemble Dota 2 (spells, invoke, orbs, items, hits, UI) | user | Sonnet | done (tuned by measurement; audition via IT.SFX.board()) |
| P | Points: research real 7.4x Invoker point spending; single pool, talents cost 1 point, 0 left at lvl 30; loadout UI + tests | user | Sonnet | done (single pool 29 at lvl 30; see section P) |
| G | Dead code: practice mode, timed combo, legacy dummy AI, looksEnemy hack | BAD 15 | Sonnet | done (dummy AI + looksEnemy kept: still reachable) |

Order: A, C, E, D, F, S, P, G, then final Fable audit.

## Batch P - Invoker point economy (research + rules)
Bug: lvl 30 showed "available 33, spent 21, left 12" (L + 3 bonus points, talents on a separate free list, orbs capped at 7 each).

Findings (sources):
- Patch 7.40 notes (https://www.dota2.com/datafeed/patchnotes?version=7.40): "Talents no longer require a skill point to level. Now talents are learned by using their own talent points available at levels 10, 15, 20, 25, 27, 28, 29, and 30. This results in all +2 All Attributes bonuses skilled by level 22." So a normal hero has 15 ability + 7 attribute levels = 22 skill points (1 per hero level 1..22), none after; talent points are a separate set of 8.
- Patch 7.41b (https://liquipedia.net/dota2/Version_7.41b, 2026-04-07; official https://www.dota2.com/patches/7.41b): "Invoke now grants Invoker 1 ability point bonus at hero level 6/12/18". The 6/12/18 bonus is real (KV invoker_invoke first/second/third_ability_level 6/12/18). Invoke is innate (MaxLevel 1, not learnable) so it never levels or costs a point; Invoker has no Attribute Bonus slot.
- KV npc_dota_hero_invoker.txt (https://raw.githubusercontent.com/SteamDatabase/GameTracking-Dota2/master/game/dota/pak01_dir/scripts/npc/heroes/npc_dota_hero_invoker.txt): orbs MaxLevel 8 (7.41: 7 -> 8; Scepter = +1 on ONE chosen orb), no RequiredLevel override => default gate, orb level n needs hero level 2n-1. Talents Ability17..24, 2 per tier at 10/15/20/25.
- Not verifiable (Liquipedia / fandom block our fetcher): exact engine point schedule for Invoker and whether the 27-30 points are auto-spent. Real game would be 22 + 3 skill points + 8 talent points = 33 vs 24 orb levels + 8 talents.

Implemented (trainer model, js/data/rules.js): ONE pool. points(L) = min(L,18) [base] + #{6,12,18 <= L} [Invoke bonus] + #{10,15,20,25,27,28,29,30 <= L} [talent points]. 29 at lvl 30 = 3 orbs x 7 + 8 talents x 1 point. Sinks absorb it exactly (0 left); every level 1..30 is spendable by the default build. Orb gate 2n-1 until hero lvl 13 and talent tier gates (10/15/20/25, second talent of a tier from 27+) unchanged. A level-30 loadout without a talent list still defaults to all 8 (an explicit list is respected). Talent points arriving before level 18 can be spent on orbs (single pool), so 7/7/7 is reachable at lvl 17.
No hero level-up moment exists in the sim (hero level is fixed by the loadout), so the `levelUp` SFX stays unwired.

## Final Fable audit (2026-10-12, after B-G) -> fix batches
GOOD: KV-derived combo windows + feedback, 39 scenarios on real maps, enemy AI reactions/items/dodge, i18n parity, SFX wiring.
| # | Batch | Covers | Status |
|---|---|---|---|
| H1 | Fidelity/bugs: auto-attack kill steal (BAD-1), death fails at hard+ (BAD-4), hero BKB 50% magic res (BAD-6), i_bolt_cancel reachability (BAD-9) | high/med | done (BAD-4 already held: died fails every scenario; BKB uses KV spell_reduce 60) |
| H2 | Scenarios: enemy vision 1800/800 + awareness as delay (BAD-5), hold/escape scenarios + jit on lvl 1-4 (BAD-7), splash burst overlap | med/low | done (43 scenarios; naive bot still fails some hard/bambam seeds, pre-existing) |
| H3 | Cleanup + staples: dummy AI -> spawnEnemy, drop practice constants (BAD-8); Blink->full->Refresher, SS-first staple | low | todo |
Not taken: BAD-2 (Invoke CD table is user-specified plan G1, PLAN-min.md:57). BAD-3 (orb cap 8 / 33 points): user rule is 0 points left at 30 with talents costing 1; kept 7x3+8=29.
