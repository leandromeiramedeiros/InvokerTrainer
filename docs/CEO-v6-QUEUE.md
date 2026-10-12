# CEO v6 QUEUE (source of truth; update after every package)

Rules: 2-3 agents per batch, no file collisions, tests green + browser load, commit + push after EVERY package, no AI attribution. #30 (gameplay pass) then #16 (UX pass) stay LAST.
Done so far: WP1-WP10 (docs/CEO-v6-PLAN.md), DLL/VPK audit, tower windup, day/night, dust, camera snap, status icons, hybrid medal, title relayout, hotkeys (F1/I/O/[), playtest 2 (hold-win, HP 0.9, ghost escapes, result card, overscroll, HUD stats), playtest 3 (scepter per orb + Ice Floe, stat formulas, pane scroll), #11 levels, #17 pit_trap, #10 panels, #12 invoke VFX, #24 shadows. HEAD 5536994.

## Status legend: [ ] pending  [~] in progress  [x] done (commit)

### P0 (next batch)
- [ ] #31 Item drag/drop: in-game drag FREEZES the game; loadout drag glitches. + #36 loadout: reorder the 6 slots, drag from the list into slots and out to remove; the list itself is not reorderable. State machine + tests. (sonnet; hud.js item drag, loadout.js items widget, input.js guards)
- [ ] #34 Force Staff self-cast: double-click the item / Alt+click = self-cast. (sim items.js + input.js)
- [ ] #35 Refresher refreshes ONLY abilities (all), NOT items. (items.js + test)
- [ ] #37 Boots don't stack: Travel replaces brown boots (loadout, scenario kits, sim stats). (loadout.js/sim loadout.js/items.js/scenarios kits)
- [ ] #38 Scenarios have NO side pane; side pane is Free Play only. (hud.js buildSide gate)
- [ ] #13 Intro tour + animated briefing (12 s, camera glides to enemies/gate/focus, cancel rules, F1 skips tour) + #39 Sun-Strike-shaped start reveal on unseen enemies (lingers ~1 s after start; mandatory at Ian/Easy/Normal, per scenario at Hard/Bambam; crowded tree pathing at harder tiers). (opus; ranked.js phase, camera.js, new ui/briefing.js, fx)
- [ ] #40 Per-play variation: enemy start pos / HP / movement (seeded in ranked), enemy boots where sensible; keep feasibility. (ranked.js apply/prepare)

### P1
- [ ] #25 Terrain height readability (cliff lip/face/shadow/outline, ramps as steps, tier brightness, AO; night + fog). (terrain.js/light.js/fog.js)
- [ ] #32 + 21.png: status icons redrawn after Liquipedia mechanics iconography; row above the orb orbit; LARGE framed HUD buff/debuff row next to the orb icons (sweep, stacks, green/red, tooltip; selected unit's statuses). (render/units.js, icons.js, hud.js)
- [ ] #41 Ice Wall visual rework (irregular shards, refraction, frost mist, cracks, staggered spawn, melt-out; same footprint). (fx.js)
- [ ] #42 Sand particles Noita-style: additive blending + bloom + height layer (recover v1 look from git history of js/render/sand.js); apply to end card, Aghanim picker, relic toasts. (sand.js, endsplash, loadout aghs, relics toast)
- [ ] #6/#8/#9 End splash: concise/bigger result text already done; fill the 2 empty boxes (per-turn timeline strip + best combo/most-used spell), fanciness scaling with medal tier (sand, particles, god rays, glow/pulse). (endsplash.js, splash.css, medals.js)
- [ ] #14 Special relics (4 verified vs live client): SPECIAL flag, 4-3-4-3 hex/shield layout on Stats, shimmer when progress > 0, fancy level-up toast (sand, god rays, burst, fanfare), splash panel shows specials first; check all 14 client relics are covered (images 7-10.png). (relics.js, ui/relics.js, statsscreen.js)

### P2 (big)
- [ ] #21 Free Play rework: single Free Play (Combo Sandbox mode removed, tools live in the side pane); bug: 0 enemies still spawns one; side pane gets time-of-day controls and is draggable/resizable (#10 panel system); ENEMIES block leaves the Free Play screen -> in-game rows (skin picker + difficulty + X, "+ Add", max 5 enemies, dummy max, locked skins blacked out); no count sliders; drop P and [ hotkeys; "Dummy" never "Scarecrow" in UI text EN/PT. + #33 combo click = compact guide strip only (no objective/score/win/fail; 70% height; resets on completion; toggle/swap). + #23 difficulty 5-segment bar control (IAN<EASY<NORMAL<HARD<BAMBAM, colour ramp, tooltips, compact read-only variant) everywhere difficulty is shown. 
- [ ] #26 Scenarios practice screen: category tabs, tag chips, sort, search, count, remembered filter, cleared/best marks; grid scrolls inside the panel. (loadout.js scenarios screen)
- [ ] #22 Flair/speech data table js/data/flair.js (skin x situation x language, weights/cooldowns, icon tags, documented header): Scarecrow silent, Raven wise, new bland DEFAULT enemy sprite keeps current lines, Renan/Vitinho/Pedro/Nando personalities (affectionate), Nando muted-mic icon lines; NO Ian skin (commented TODO slot). PT keeps the humour.
- [ ] #15 Relic points economy + Skin SHOP: points (specials 5x), difficulty-scaled awards + moving thresholds, persisted; splash/toast show points; SHOP side tab on the title (Player: Invoker, Invoker Kid, Dark Artistry, Exalted; Enemies: default free + Renan/Pedro/Vitinho/Nando buyable; Dummy: Scarecrow free + Raven); RANKED uses ONLY unlocked skins + default ("Appears in Ranked once unlocked"); pricing = 20-30 min of normal play from bot samples (DECISIONS.md). Forge Spirit variants per skin.

### P3 (content)
- [ ] #27 JUKE scenarios + enemy belief model (last-seen/velocity/prediction/search, difficulty-scaled, detection items telegraphed, high-ground vision rule verified, belief indicators toggle: ghost marker, "?" confused, prediction arrow, "!" reacquire), >= 6 juke scenarios tagged juke+fun, bot clears at easy, tests.
- [ ] #28 Research-driven FUN scenarios (sonnet research agent -> ~30 candidates with sources -> director picks 10-12; docs/SCENARIO-RESEARCH.md) + #29 map-EDGE scenarios (4-6 across the four edge strips of images/20.png, tag edge+fun).

### LAST
- [ ] #30 Gameplay/balance/mechanics quality pass (director-led; fixes with tests + docs/GAMEPLAY-REVIEW-v6.md top-10 suggestions).
- [ ] #16 UI/UX review (docs/UX-REVIEW-v6.md, every screen at 1280x720 + 1920x1080, EN/PT) + animation pass (120-250 ms, reduced-motion).

## Open for CEO
- Ian enemy skin: removed until a reference arrives (TODO slot). Combo Sandbox: folded into Free Play per #21.
- ORB_MAX stays 7 (user rule); Dota's 467 MS needs Wex 8 (7 + scepter) — formulas verified.
