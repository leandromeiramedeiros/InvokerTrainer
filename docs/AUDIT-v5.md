# Audit v5 (plan vs built, after MAPS v5) — fix plan

Source: Fable read-only audit, 2026-10-12 (ran early by mistake; the final holistic Fable audit runs again AFTER all batches). One agent at a time, Sonnet unless noted. Each batch: tests green + browser smoke + commit/push.

## GOOD (keep)
Baked Dota KV data + spells/items faithful; progression G1-G4 exact; enemy AI (disable-start reactions, BKB/Euls/Blink/Force, danger-zone dodge, awareness); towers per Dota table; HUD TODOs 1-10 + F1 modes; i18n en=pt complete; maps v5.

## BAD / MISSING -> batches (in execution order)
| # | Batch | Covers | Model | Status |
|---|---|---|---|---|
| B | Enemies in scenarios: spawnEnemy (hp=dmg-to-kill, real death), tier telegraph/awareness/reaction/armorAdd, skin rotation, hero auto-attack from KV, drop killFrac/refill on enemies | BAD 2,6,7 | Sonnet | done |
| A | Scenario engine + >=30 v4 scenarios on v5 maps (salvage wip/scenarios-oldmap engine; arena-tag spots, no absolute coords; 'seen' fail fix; tests) | BAD 1,3,16; MISSING 1,7 | Opus | todo |
| C | End splash + curated stats + PNG share; INFINITE RUN mode | BAD 4,5; MISSING 2,3 | Sonnet | todo |
| D | Combos: SS-after-tornado timing from lift_duration, missing staples, tier scores, validation (wrong-order feedback, timing windows, legit variations) | BAD 8,9 | Sonnet | todo |
| F | HUD/perf: F1 chip size/backplate, map name line, 'dota' arena cap/lazy thumbs, Shiva radius 825+75 | BAD 11,13,14 | Sonnet | todo |
| E | Loadout: F3 Aghanim hood picker, Free Play enemy card (place/config), difficulty badge in picker | BAD 10,12; MISSING 5,8 | Sonnet | todo |
| G | Dead code: practice mode, timed combo, legacy dummy AI, looksEnemy hack | BAD 15 | Sonnet | todo |
