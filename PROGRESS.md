## ROADMAP v5 (2026-10-12, overnight run) -- see docs/AUDIT-v5.md for the batch table
Done+pushed: MAPS v5 real Dota map (tools/dota_extract.py -> js/data/dotaworld.js; 28 windows + 'dota'), B enemies, A 39 scenarios on v5 maps, C end splash/PNG/infinite.
D (done, uncommitted): combo timing windows from KV (step.at), early/late/order feedback (comboHint + cfail.early/late), anyOrder groups, 6 new combos, items tier base 750; tests/combo_v5.test.js.
Next in order (one Sonnet agent each; tests + browser smoke + push after each; stop at 96% usage): E hood picker F3 + Free Play enemy card + picker difficulty badge; D combos; F HUD chips/Shiva 900/'dota' perf/map name; S sounds closer to Dota 2; P points system (single pool, talents 1 pt, 0 left at 30 -- research real rules first); G dead code; then FINAL Fable holistic audit (plan vs built) -> fix batches -> PROGRESS.
Known: hero auto-attack (800 acquire) can steal 'kill with X' kills; splash burst overlaps title briefly; scenario WIP branch wip/scenarios-oldmap is now obsolete (salvaged in A).

# PROGRESS (v4 run, 2026-10-12)
Plan: docs/PLAN-min.md (user plan + addenda). Contract: docs/PLAN-v4.md. Maps contract: docs/MAPS-v3.md.
Budget: 5 h window; weekly was 75 % at start.
HARD RULE (user): a PLAYABLE build must be committed + pushed by 90 % usage (either limit).
- From ~78 %: no new features; integrate, fix, browser-check, push.
- Push a playable checkpoint after every integrated wave (tests green + title->ranked->sandbox smoke test).

## Done
- d9a6a25 scroll-wheel zoom 0.7-1.2 (live view size, renderer resize, minimap own canvas).

## Cuts / shrinks (decided up front)
- Maps: back to >=20 (user, 2026-10-12), carved from reference/dota_map.jpg (real Dota 2 map). Ranked infinite run uses the same scenario pool at bambam.
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

## Stop at 72 % (5 h) / 85 % (weekly) — 2026-10-12
7 parallel Sonnet agents burned ~70 % of the 5 h window in ~18 min -> all stopped. Lesson: max 1-2 agents at a time on Pro.
- Pushed playable e986062 (zoom). Integrated INPUT agent (complete): box select, TAB cycle (live stats -> K), CTRL unified orders,
  hudMode/unifiedOrders settings, AoE rangefinder. Tests 255/255.
- Remaining W1 work is in `git stash` "v4 W1 WIP (agents stopped at 72%)" — partial, 36 test failures, DO NOT pop blindly.
  Per agent: MAPS/ENT/PROG/VFX/MODES/HUD partial (ENT mid-rewrite of units.js; PROG mid difficulty/spells; HUD mid CSS).
  Resume one agent at a time: `git checkout stash@{0} -- <that agent's files>` (+ `stash@{0}^3` for new files), finish, test, commit.

## Resume (user: 25 % left, stop limit raised to 96 %)
- Pushed: 8b853e9 input v4; next commit VFX partial (sand persistence 1/3, lift markers, scarecrow art, enemy item visuals guarded). Tornado lift not visually confirmed.
- PROG agent resumed alone to finish G1-G4/A3/issueGroup green. After it: commit+push, then maybe ENT if budget allows.

## Stop at 80 % (5 h) / 86 % (weekly) — session end
- Pushed d16290e PROG: G1-G4 (orbs lock/gate, max 7, invoke CD by orb sum, talents 27-30), preinvoked, A3 RMB keeps attack, issueGroup.
  Loadout without orbs/level now defaults to lvl 30 best legal build (sandbox was unplayable otherwise). Tests 270/270, browser smoke OK.
- Not started this session (still in stash@{0}, partial): ENT (enemy/dummy split, enemy AI + items, awareness, telegraph, player
  forcestaff/dust/shiva/gleipnir), MAPS (>=10 maps, towers), MODES (ranked flow, splash/stats/PNG, infinite run), HUD (F1-F5).
  Stopped: ENT alone touches ~10 sim files incl. a units.js rewrite; an agent run would exceed the 96 % cap.
- Next session order: ENT -> MODES -> HUD -> MAPS, one agent at a time, from stash@{0}.
- TODO small: ranked.js pass scenario `preinvoked` to normalize + `Hero.applyPreinvoked`; dummychat ignore fail reason 'locked'.

## Continued to 92 % (same session)
- 286736f ranked passes `preinvoked`; dummychat ignores 'locked'.
- f2abf61 ENT done: isFoe, spawnDummy scarecrow (never dies), spawnEnemy (dies, 5 behaviors, bkb/blink/shadowblade/euls/forcestaff, awareness x2.5, telegraph), player dust + forcestaff. Legacy AI dummies kept for ranked. Dead code: combat.js killFrac/refillBelow.
- 23f4209 difficulty tiers ian/easy/common/hard/bambam (+desc, migrate old ids).
- e14e41c MODES core: B1 title, C4 8 turns, C2 10 s countdown + START, C7 badge.
- Remaining (stash@{0}): HUD F1-F5 (hud.js/css), MAPS (maps.js/towers/terrain), scenario v4 content (scenarios.js), end splash/stats PNG/infinite run, B2 FP enemy card.
- 2fc8b50 Free Play enemy section (count/behavior/items). F2: bigger scenario objective/tip text. Stopped at ~95 %.
- Next: HUD F1 modes + F5 tooltips, MAPS, scenario v4 content, end splash/stats PNG/infinite run, F3 Aghs picker, F6 icons.

## USER TODO (2026-10-12, priority over remaining stash work)
1. Rename key "Center camera" -> "Select hero / Center camera": 1st press selects hero, 2nd press centers camera.
2. Selected unit: green outline circle beneath it.
3. Pathing line (green move, red attack, etc.): draw the path trajectory, animated.
4. Cataclysm gives vision like Sun Strike.
5. Instant-cast abilities: no range indicator, unless the user hovers the ability.
6. Fog of war Dota-style ON/OFF, no memory: outside vision very dark (terrain + towers still visible), inside vision very bright.
7. Ability rangefinder less intrusive (thinner/fainter).
8. VFX must not persist from round to round (clear particles/sand/fx on scenario swap).
9. Round countdown: no START button; skipped by the player's first move/cast/attack, and that first input is executed (seamless).
10. TOP PRIORITY (user, current build): enemies and dummies are almost flipped. ENEMIES = hero skins (Pedro etc.) + name tags + dummychat speech.
    DUMMY = scarecrow only: no skin, no name tag, no speech bubbles (dummychat only for kind 'enemy'). Ranked/scenario AI foes (spawnDummy with
    behavior/scenario/useBkb opts) must become kind 'enemy' (or render as enemy); plain stationary targets stay scarecrows. Check render/units.js,
    ui/dummychat.js, ranked.js apply(), main.js sandbox spawns, Free Play enemy section.

## Session 2026-10-12 (fresh window)
- DONE all USER TODO 1-10: c090f38 (10), 6b179ef (4 Cataclysm hits fogged foes + vision), f9a49df (2/3/6/7/8), 420047e (1/5/9). Tests 298/298, browser smoke OK.

- 2974ecb F1 HUD modes (minimal/default/steps; 'wind' read as WIN conditions). 59b39f3 MAPS: 21 maps from reference/dota_map.jpg + grounds, towers, ramps, map picker.
- F6 icons regenerated from reference/dota (tools/icons_from_ref.py, TUNE dict per icon). Weak at 20px: refresher, shiva, gleipnir, deafeningblast.
- BUG open: F1 orb/invoke chips (.tk canvas.ico.mini in top HUD cards/timeline) show as black squares although the canvas has pixels — investigate (CSS/compositing?).
- Remaining: scenario content B3/C1/H (use new maps + towers, win/lose/steps fields), end splash/stats/PNG + infinite run C5/C6, F3 Aghs picker.

- USER FEEDBACK maps (2026-10-12): 21 maps are poor — SCALE wrong: a small ref area is stretched over the whole map (trees/features giant vs units; in-game max zoom covers ~a lane-width chunk of ref). Mid lane inconsistent with ref. Screens: reference/user/midlane_ref_crop.webp (red = in-game max-zoom area, blue = what agent made) vs midlane_ingame.webp. FIX PLAN: calibrate ref px <-> Dota units (known tower coords), 48 u/tile -> ~N ref px/tile, auto-classify ref pixels (tree/river/cliff/path/grass) into tiles instead of hand shape programs.
- USER BUG towers: sprite offset from entity (hp bar + grey block drawn left of sprite), see reference/user/tower_bug.png.

## NEXT SESSION (start here)
Stash work is also on branch `wip/v4-stash` (origin) — use `git checkout origin/wip/v4-stash -- <files>` instead of stash@{0} if the stash is missing.
Rules: BE TERSE; no Claude co-author in commits; Opus orchestrates, max 1 Sonnet/Haiku agent at a time; tests green + browser smoke
(launch config "invoker", port 8123; bypass cache) + commit + push after every step; check usage after every step, stop at 96 %.
0. git status; finish/clean anything uncommitted.
1. TODO 10 (enemies vs dummies flipped) — screenshot ranked + sandbox to verify.
2. Render agent: TODO 2, 3, 6, 7, 8.
3. Input/ranked agent: TODO 1, 5, 9.
4. TODO 4 (Cataclysm vision), small, do directly.
5. If budget: fix F1 chip bug -> scenario content B3/C1/H -> end splash/stats/PNG + infinite run C5/C6 -> F3 Aghs picker -> F6 icons.
6. Mark done items here, short status, commit, push.
