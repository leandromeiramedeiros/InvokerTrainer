# PROGRESS (v4 run, 2026-10-12)
Plan: docs/PLAN-min.md (user plan + addenda). Contract: docs/PLAN-v4.md. Maps contract: docs/MAPS-v3.md.
Budget: 5 h window; weekly was 75 % at start.
HARD RULE (user): a PLAYABLE build must be committed + pushed by 90 % usage (either limit).
- From ~78 %: no new features; integrate, fix, browser-check, push.
- Push a playable checkpoint after every integrated wave (tests green + title->ranked->sandbox smoke test).

## Done
- d9a6a25 scroll-wheel zoom 0.7-1.2 (live view size, renderer resize, minimap own canvas).

## Cuts / shrinks (decided up front)
- Maps: >=10 (not 20). Ranked infinite run uses the same scenario pool at bambam.
- F6 icons: P2 — only if budget remains after P0/P1; then priority = 10 spells + player items.
- PNG share: one template, ornament level by medal tier.
- Music for splash: reuse existing stinger/theme.

## Assumptions
- "Lower reaction times" for unaware enemies = SLOWER reactions (reaction x2.5 while unaware).
- Dummy never dies (refills, no hp bar). Enemies die. Old "killable dummies" request is covered by enemies.
- Ranked = 8 turns.

## Waves
W1 (parallel, Sonnet): MAPS, ENT, PROG, INPUT, VFX, MODES, HUD. W2: CONTENT (scenarios), ICONS, Haiku i18n sweep. W3: verify, review, push.

## Status
W1 launched (Sonnet, background), ids in session transcript:
- MAPS  maps/vision/towers/terrain/fog/camera/render.js (+F4 minimap frame)
- ENT   dummy/enemy split, enemy AI + 5 items, awareness, telegraph, player forcestaff/dust/shiva/gleipnir, building hooks, A2 sim
- PROG  G1-G4 progression, preinvoked, A3 RMB, issueGroup
- INPUT E1 box select, E2 TAB, B4 CTRL unified, B5 hudMode setting, AoE rangefinder
- VFX   A1/A2/A4 render, tornado visibility, sand persistency, scarecrow, enemy item VFX, telegraph '!'
- MODES B1/B2/C1-C7, scenario v4, main.js, end splash/stats/PNG, infinite run, >=15 scenarios
- HUD   F1/F2/F3/F5, sandbox scenario XOR free play UI, enemy card, inspect panel
