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
