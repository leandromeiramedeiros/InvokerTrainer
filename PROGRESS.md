# PROGRESS (v4 run, 2026-10-12)
Plan: docs/PLAN-min.md (user plan + addenda). Contract: docs/PLAN-v4.md. Maps contract: docs/MAPS-v3.md.
Budget: 5 h window; stop-loss at 85-90 % of the 5 h window OR weekly (weekly was 75 % at start).

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
(agents update nothing here; orchestrator only)
