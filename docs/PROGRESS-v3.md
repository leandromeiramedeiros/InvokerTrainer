# v3 progress (resume point)

Phase 0 committed (45e361b). Phase 1 agents all DONE except S7 (hero skins + force-push cast pose, may still be running / finished while away).
Tests: 197/197 green at last run. Nothing from Phase 1+ committed yet (single commit at end, NO Claude co-author line — user memory).

## Done in Phase 2 (by orchestrator)
- i18n.js: item.treads -> item.orchid / item.gleipnir
- ui/loadout.js: derived() uses IT.Hero.maxHp/maxMana; scenario names handle {en,pt}; css/loadout.css aghs off-state brighter
- art.js: IT.Art.heroSheet() + HERO_SKINS; settings.js: heroSkin default+merge; removed doubleTapTimeout slider (user: not needed)
- render.js:77 cast pose only for spells (kind !== 'item') — user: items have no pose
- main.js hooks.inspect + input.js In.inspecting(): ranked countdown allows camera/center/camLock keys, minimap, dummy select
- main.js debugText shows sand
- combobar.js labels for position/move steps (+ i18n in h3.js); hud.js ranked panel: hint row (tip + spell recipes) when difficulty hints, score hidden when null (practice)

## Next
1. Browser verify. NOTE: preview pane is hidden -> requestAnimationFrame paused, w.t stays 0. Drive the sim with IT.dev.render(n) (steps n ticks) between synthetic key events. Earlier fast-combo test was invalid for that reason (and stale legacy settings in localStorage — cleared).
   Fast combo test: keys 'wwqrwwwrfdeewrdqwerd' at ~100ms, mouse on dummy (cam.x/y is top-left, 6 units/px), step ~3 ticks per key.
   VERIFIED: all 4 casts fire (tornado, emp, meteor, blast), dummy 2500 -> 653 hp. Sandbox button + loadout screen OK.
2. S7 DONE (skins + force-push cast). HUD portrait now follows heroSkin (rebinds on change). Default skin NOT recoloured toward sage-green reference — consider.
3. Verify list in docs/PLAN-v3.md "Verification" + #34 fireball, #35 skins, #36 cast pose.
4. H5 sweep (PT-BR keys across js/data/i18n/*.js, missing keys) — Haiku agent.
5. Title subtitle still says "TRAINER v2".
6. Phase 3: /code-review low, DECISIONS.md + README, single commit.

## Wave 2 (user batch #37–#53) — launched 2026-10-11
Contract done by orchestrator: settings defaults rmbRepeat/comboOrder/dummyChat/fpsCap (+merge), app.sub v3, js/ui/dummychat.js stub + index.html tag + main.js attach/detach.
Perf baseline (sandbox idle, 1280px, DPR1): render 3.6 ms, light.compose 2.1 ms, sim step 0.5 ms, HUD 0.03 ms; #glow CSS blur on full-res layer.
Agents (Sonnet, background): S1 input (#1 no ctx menu, #44 rmbRepeat, #45 smooth center, #40 cataclysm dbl-press, #43, stop/hold/A-ground input, settings rows),
S2 sim (#38 hold/stop, #39 GW no auto-acquire, #47 attack-move fog, #40, audio events attackStart/fx phases, #43 sim),
S4 vfx/perf (fpsCap loop, WebGL compositor, #41 sand, #42 meteor hammer + item VFX, attack wind-up),
S5 audio (#37 wiki layers + items), S3 ui (#48 panel, combobar idle msg, #49 dummy chat), S7 (#51 default recolour).
After: H5 Haiku i18n sweep (#52), browser verify, code-review, commit (no co-author).
Added mid-wave: #54 cast-while-moving (GW never cast during move spam; facing-cone casts while moving) -> S2 sim + S1 input. #55 Scepter/Shard hood emblem under orbs (refs images/24-32.png in session scratch) -> S3.
Wave 2 results: S1/S2/S3/S4/S5/S7 DONE, tests 244/244. Browser: GL compositor active (webgl2), idle render 3.6 -> 1.1 ms; busy (tornado+emp+meteor+SS+blast) step+render 4.7 ms (sand 1.6, comp 1.3). New ranked panel verified (countdown/title/obj/icons, score hidden in practice). Orchestrator: gleipnir + orchid icons redrawn (scratchpad gleip.py/orchid.py), dchat font bump, default hair tweak.
OPEN: user asked why default Invoker was recoloured (not explicitly requested; inferred from #35 ref) — awaiting keep/revert decision. H5 i18n sweep running. Then code-review + commit.
